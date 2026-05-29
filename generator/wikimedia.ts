const WP_API = "https://en.wikipedia.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "Campaigns/0.1 (https://campaigns-3sk.pages.dev)";
// Budget covers two sequential HTTP calls (Wikipedia article search +
// Commons file lookup); each sage runs in parallel under Promise.allSettled.
const TIMEOUT_MS = 8000;

interface ExtMetadataField {
  value: string;
  source?: string;
}

interface ImageInfo {
  url: string;
  thumburl: string;
  thumbwidth: number;
  thumbheight: number;
  mime: string;
  extmetadata: Record<string, ExtMetadataField>;
}

interface CommonsPage {
  pageid: number;
  ns: number;
  title: string;
  imageinfo?: ImageInfo[];
}

interface CommonsResponse {
  query?: {
    pages?: Record<string, CommonsPage>;
  };
}

export interface CampaignContext {
  topic: string;
  title: string;
}

// Builds the Wikipedia article-search query: sage name plus disambiguating
// context tokens (topic + cleaned title), deduped. No "portrait" suffix —
// this query targets article namespace, not file namespace.
export function buildSearchQuery(sageName: string, ctx: CampaignContext): string {
  // Strip punctuation from the LLM-authored title (colons, dashes, etc.);
  // topic is user-typed and clean, and sage name keeps its periods so
  // initials like "William B. Travis" still read as the real person.
  const titleClean = ctx.title.replace(/[^\p{L}\p{N}\s]/gu, " ");

  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const token of `${ctx.topic} ${titleClean}`.split(/\s+/)) {
    if (!token) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(token);
  }

  return tokens.length ? `${sageName} ${tokens.join(" ")}` : sageName;
}

function isPublicDomain(meta: Record<string, ExtMetadataField>): boolean {
  const license = (meta.LicenseShortName?.value ?? "").trim();
  const copyrighted = (meta.Copyrighted?.value ?? "").trim();

  if (copyrighted.toLowerCase() !== "false") return false;

  const l = license.toLowerCase();
  if (l.startsWith("public domain")) return true;
  if (l.startsWith("pd")) return true;
  if (l === "cc0") return true;

  return false;
}

function stripHtml(html: string): string {
  return html
    .replace(/<span[^>]*display:\s*none[^>]*>[\s\S]*?<\/span>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function commonsPageUrl(title: string): string {
  const encoded = encodeURIComponent(title.replace(/ /g, "_"));
  return `https://commons.wikimedia.org/wiki/${encoded}`;
}

interface PortraitResult {
  thumbUrl: string;
  artist: string;
  license: string;
  sourceUrl: string;
}

// Wikipedia article search → top result's pageimage filename. Returns null
// on no article, no pageimage, network error, or malformed response. Any
// null exits the lookup at this step; caller falls back to initials.
async function findArticlePageimage(
  query: string,
  signal: AbortSignal,
): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "0",
    gsrlimit: "3",
    prop: "pageimages",
    pithumbsize: "300",
    format: "json",
    origin: "*",
  });

  const res = await fetch(`${WP_API}?${params}`, {
    headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
    signal,
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    query?: { pages?: Record<string, { index?: number; title?: string; pageimage?: string }> };
  };
  const pages = data.query?.pages;
  if (!pages) return null;

  const sorted = Object.values(pages).sort(
    (a, b) => (a.index ?? 999) - (b.index ?? 999),
  );
  const top = sorted[0];
  return top?.pageimage ?? null;
}

// Commons file metadata for a known filename. Confirms image MIME and
// public-domain license before returning. Null on any failure.
async function lookupCommonsFile(
  filename: string,
  signal: AbortSignal,
): Promise<PortraitResult | null> {
  const params = new URLSearchParams({
    action: "query",
    titles: `File:${filename}`,
    prop: "imageinfo",
    iiprop: "url|extmetadata|mime",
    iiurlwidth: "300",
    format: "json",
    origin: "*",
  });

  const res = await fetch(`${COMMONS_API}?${params}`, {
    headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
    signal,
  });
  if (!res.ok) return null;

  const data = (await res.json()) as CommonsResponse;
  const pages = data.query?.pages;
  if (!pages) return null;

  const page = Object.values(pages)[0] as (CommonsPage & { missing?: string }) | undefined;
  if (!page || page.missing !== undefined) return null;

  const info = page.imageinfo?.[0];
  if (!info?.extmetadata) return null;

  const mime = info.mime ?? "";
  if (!mime.startsWith("image/")) return null;

  if (!isPublicDomain(info.extmetadata)) return null;

  return {
    thumbUrl: info.thumburl,
    artist: stripHtml(info.extmetadata.Artist?.value ?? "Unknown"),
    license: info.extmetadata.LicenseShortName?.value ?? "Public domain",
    sourceUrl: commonsPageUrl(`File:${filename}`),
  };
}

async function searchPortrait(
  sageName: string,
  ctx: CampaignContext,
): Promise<PortraitResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const query = buildSearchQuery(sageName, ctx);
    const pageimage = await findArticlePageimage(query, controller.signal);
    if (!pageimage) return null;
    return await lookupCommonsFile(pageimage, controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Event/backdrop license filter — looser than isPublicDomain. Accepts PD,
// CC0, CC-BY, CC-BY-SA. Every accepted image still gets attribution rendered.
// TODO: revisit if a teacher-editing workflow lets users modify and export
// these images — CC-BY-SA share-alike would apply at that point.
function isAcceptableForEventImage(meta: Record<string, ExtMetadataField>): boolean {
  const license = (meta.LicenseShortName?.value ?? "").trim().toLowerCase();
  if (!license) return false;
  if (license.startsWith("public domain") || license.startsWith("pd") || license === "cc0") return true;
  if (license.startsWith("cc by")) return true; // covers CC BY 2.0/2.5/3.0/4.0 and CC BY-SA variants
  return false;
}

interface CommonsImageResult {
  thumbUrl: string;
  artist: string;
  license: string;
  sourceUrl: string;
  searchQuery: string;
}

// Titles that are almost never the "historical art" we want for an event or
// backdrop — maps, flags, heraldry, charts, icons, etc. Matching files are
// heavily down-ranked (not hard-skipped: a junk hit still beats no image).
const JUNK_TITLE_RE = /map|locator|coat of arms|flag|logo|seal|emblem|diagram|chart|icon|stamp|banner|coin|svg/i;

// Words too generic to signal topical relevance when overlapping a title.
const STOPWORDS = new Set([
  "the", "and", "of", "a", "an", "in", "on", "at", "to", "for", "with",
  "history", "painting", "image", "photo", "illustration", "art",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

// Higher = more likely to be the on-topic historical image. Rewards query↔
// title token overlap; penalizes junk titles and SVGs (usually diagrams).
function scoreCandidate(title: string, mime: string, queryTokens: Set<string>): number {
  const titleTokens = tokenize(title);
  let overlap = 0;
  for (const t of titleTokens) if (queryTokens.has(t)) overlap++;
  let score = overlap * 3;
  if (JUNK_TITLE_RE.test(title)) score -= 6;
  if (mime === "image/svg+xml") score -= 5;
  return score;
}

// Commons file search — the keyword-based strategy. Used for event imagery
// and campaign backdrop, NOT for portraits (those use the WP-pageimages
// flow in searchPortrait). Returns the first image hit whose license is
// acceptable; null on no match, network error, or malformed response.
async function searchCommonsFile(query: string): Promise<CommonsImageResult | null> {
  if (!query.trim()) return null;

  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: query,
    gsrlimit: "20",
    prop: "imageinfo",
    iiprop: "url|extmetadata|mime",
    iiurlwidth: "600",
    format: "json",
    origin: "*",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${COMMONS_API}?${params}`, {
      headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = (await res.json()) as CommonsResponse;
    const pages = data.query?.pages;
    if (!pages) return null;

    const queryTokens = new Set(tokenize(query));

    // Rank all license-acceptable image hits and take the best, rather than
    // the first Commons hit (which is frequently a map/flag/diagram).
    let best: { result: CommonsImageResult; score: number; index: number } | null = null;
    for (const page of Object.values(pages)) {
      const info = page.imageinfo?.[0];
      if (!info?.extmetadata) continue;
      const mime = info.mime ?? "";
      if (!mime.startsWith("image/")) continue;
      if (!isAcceptableForEventImage(info.extmetadata)) continue;

      const index = (page as any).index ?? 999;
      const score = scoreCandidate(page.title, mime, queryTokens);
      const candidate = {
        result: {
          thumbUrl: info.thumburl,
          artist: stripHtml(info.extmetadata.Artist?.value ?? "Unknown"),
          license: info.extmetadata.LicenseShortName?.value ?? "Unknown",
          sourceUrl: commonsPageUrl(page.title),
          searchQuery: query,
        },
        score,
        index,
      };

      // Highest score wins; the original search rank breaks ties.
      if (!best || score > best.score || (score === best.score && index < best.index)) {
        best = candidate;
      }
    }

    // Relevance gate: require at least one meaningful query↔title token
    // match (and net-positive after junk/SVG penalties). A wrong image is
    // worse than no image — the engine falls back to the backdrop / none.
    if (!best || best.score <= 0) return null;
    return best.result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// CC-BY-tolerant variant of lookupCommonsFile, returning the richer
// CommonsImageResult used by events/backdrop. Used by the article-pageimage
// pass below.
async function lookupCommonsFileForEvent(
  filename: string,
  searchQuery: string,
  signal: AbortSignal,
): Promise<CommonsImageResult | null> {
  const params = new URLSearchParams({
    action: "query",
    titles: `File:${filename}`,
    prop: "imageinfo",
    iiprop: "url|extmetadata|mime",
    iiurlwidth: "600",
    format: "json",
    origin: "*",
  });

  const res = await fetch(`${COMMONS_API}?${params}`, {
    headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
    signal,
  });
  if (!res.ok) return null;

  const data = (await res.json()) as CommonsResponse;
  const page = Object.values(data.query?.pages ?? {})[0] as
    | (CommonsPage & { missing?: string })
    | undefined;
  if (!page || page.missing !== undefined) return null;

  const info = page.imageinfo?.[0];
  if (!info?.extmetadata) return null;
  const mime = info.mime ?? "";
  if (!mime.startsWith("image/")) return null;
  if (!isAcceptableForEventImage(info.extmetadata)) return null;

  return {
    thumbUrl: info.thumburl,
    artist: stripHtml(info.extmetadata.Artist?.value ?? "Unknown"),
    license: info.extmetadata.LicenseShortName?.value ?? "Unknown",
    sourceUrl: commonsPageUrl(`File:${filename}`),
    searchQuery,
  };
}

// Primary pass for event/backdrop imagery: find the best-matching Wikipedia
// article for the query and use its lead image (pageimage), which is almost
// always the canonical on-topic photo/painting. Null if there's no article,
// no pageimage, the file isn't license-acceptable, or on any network error.
async function searchViaArticlePageimage(query: string): Promise<CommonsImageResult | null> {
  if (!query.trim()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const pageimage = await findArticlePageimage(query, controller.signal);
    if (!pageimage) return null;
    return await lookupCommonsFileForEvent(pageimage, query, controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Per-event + backdrop Commons enrichment. Runs every event query and the
// backdrop query in a single Promise.allSettled — one failure can't affect
// any other lookup. Each event's image (if found) lands at events[i].image;
// the backdrop lands at data.backdropImage.
export async function enrichEventImages(data: any, ctx: CampaignContext): Promise<void> {
  const events = Array.isArray(data.events) ? data.events : [];
  const styleKw = typeof data.imageStyleKeyword === "string" ? data.imageStyleKeyword.trim() : "";

  const appendStyle = (q: string) => styleKw ? `${q} ${styleKw}` : q;

  // For each query: try the canonical article lead image first (raw query,
  // no style keyword — that derails article search), then fall back to the
  // ranked Commons file search (with style keyword) if the article pass
  // finds nothing usable.
  const resolveImage = async (rawQuery: string): Promise<CommonsImageResult | null> => {
    const viaArticle = await searchViaArticlePageimage(rawQuery);
    if (viaArticle) return viaArticle;
    return searchCommonsFile(appendStyle(rawQuery));
  };

  const eventTasks = events.map((ev: any) =>
    typeof ev.imageSearchQuery === "string" && ev.imageSearchQuery.trim()
      ? resolveImage(ev.imageSearchQuery.trim())
      : Promise.resolve<CommonsImageResult | null>(null),
  );

  const tasks = [...eventTasks, resolveImage(ctx.topic)];

  const settled = await Promise.allSettled(tasks);

  for (let i = 0; i < events.length; i++) {
    const r = settled[i];
    if (r.status !== "fulfilled" || !r.value) continue;
    events[i].image = r.value;
  }

  const backdropResult = settled[events.length];
  if (backdropResult?.status === "fulfilled" && backdropResult.value) {
    data.backdropImage = backdropResult.value;
  }
}

export async function enrichSagePortraits(
  data: any,
  ctx: CampaignContext,
): Promise<void> {
  const sages = data.sages;
  if (!Array.isArray(sages)) return;

  const results = await Promise.allSettled(
    sages.map((sage: any) => searchPortrait(sage.name, ctx)),
  );

  for (let i = 0; i < sages.length; i++) {
    const result = results[i];
    if (result.status !== "fulfilled" || !result.value) continue;

    const match = result.value;
    sages[i].portrait = match.thumbUrl;
    sages[i].portraitAttribution = {
      artist: match.artist,
      license: match.license,
      sourceUrl: match.sourceUrl,
    };
  }
}
