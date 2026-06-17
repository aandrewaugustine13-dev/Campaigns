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
  /** The campaign's latest authored year (null when none found). When it is
   * before PHOTO_ERA, the era guard rejects modern-era Commons hits (a WWII
   * battleship photo for an 1812 topic). See inferEraMaxYear / eraInappropriate. */
  eraMaxYear?: number | null;
}

// ── Era guard (fix a) ──────────────────────────────────────────────
// Practical photography begins ~1840 (daguerreotype). A campaign whose latest
// year is before that CANNOT have a contemporaneous photo, so a Commons hit that
// signals a modern era is the wrong image no matter how well its tokens overlap
// (the USS New Jersey sailor for a War-of-1812 query). This is the SCORING-side
// fix: the prompt rubric leaks, so we reject at selection time, not just ask.
const PHOTO_ERA = 1840;
// Title markers that betray a wrong (modern) era for a pre-photography topic.
// Only 1900+ years are "modern" markers here; an 1800s year later than the
// campaign era is caught separately by the year-margin check below (so an
// 1815 title isn't mistaken for modern in an 1812 campaign).
const MODERN_TITLE_RE =
  /\b(19\d\d|20\d\d)\b|world war|wwi|wwii|ww1|ww2|battleship|dreadnought|aircraft|submarine|carrier|\btank\b|\bjet\b|helicopter|automobile|nuclear|reenact|replica|museum|memorial|monument|skyscraper|\bmodern\b|uss new jersey/i;

// Largest 4-digit year (1000–2099) appearing in a string, or null.
export function latestYearIn(s: string): number | null {
  const years = (s.match(/\b(1[0-9]\d\d|20\d\d)\b/g) ?? []).map(Number).filter((y) => y >= 1000 && y <= 2099);
  return years.length ? Math.max(...years) : null;
}

// The campaign's era anchor: the latest year authored across the topic, event
// queries, titles, and scene text. Pure; used to arm the guard. null ⇒ guard off.
export function inferEraMaxYear(data: any, topic: string): number | null {
  const events = Array.isArray(data?.events) ? data.events : [];
  const text = [
    topic,
    typeof data?.title === "string" ? data.title : "",
    ...events.map((e: any) => `${e?.imageSearchQuery ?? ""} ${e?.title ?? ""} ${typeof e?.text === "string" ? e.text : ""}`),
  ].join(" ");
  return latestYearIn(text);
}

// True when a candidate's title/date is era-inappropriate for THIS campaign.
// Active only for a pre-PHOTO_ERA campaign (maxYear < 1840). A small margin
// tolerates a period work created a couple decades later; a 20th-century marker
// or a wildly-later year/date is rejected.
export function eraInappropriate(title: string, dateYear: number | null, maxYear: number | null | undefined): boolean {
  if (maxYear == null || maxYear >= PHOTO_ERA) return false; // guard inactive
  if (MODERN_TITLE_RE.test(title)) return true;
  const ty = latestYearIn(title);
  if (ty != null && ty > maxYear + 25) return true;
  if (dateYear != null && dateYear > maxYear + 25) return true;
  return false;
}

// Recover a human-ish title from a Commons file/page URL (for the lead path,
// which carries a sourceUrl but no separate title).
function titleFromUrl(url: string | undefined): string {
  if (!url) return "";
  try { return decodeURIComponent(url.split("/").pop() ?? "").replace(/_/g, " "); } catch { return ""; }
}

// Era check for an already-resolved image (the article-LEAD fast path). It now
// applies the FULL title+DATE check, using the date carried on the result —
// closing the gap where the lead path only title-checked (dateYear: null) and a
// modern photo with an innocent title slipped past. Pure & exported for testing.
export function leadImageEraInappropriate(
  img: { sourceUrl?: string; dateYear?: number | null } | null | undefined,
  maxYear: number | null | undefined,
): boolean {
  if (!img) return false;
  return eraInappropriate(titleFromUrl(img.sourceUrl), img.dateYear ?? null, maxYear);
}

// LEVER 1 — portrait relevance gate. Verifies the matched Wikipedia article is
// actually THIS person before we accept its lead image. Bidirectional token
// overlap (not "all name tokens present") so honorifics in the sage name
// ("President" Jefferson, "Rev." Abernathy) and disambiguators in the article
// title ("Annie Moore (immigrant)") don't false-reject. ≥2 overlapping
// significant tokens = confident; a lone significant token (initials names like
// "E. D. Nixon" → just "nixon") accepts only on an exact single-token match.
// Reuses the event path's tokenize(). On reject, searchPortrait returns null and
// the renderer falls through to a neutral monogram — better than a wrong face.
function nameMatches(sageName: string, articleTitle: string): boolean {
  let nameTokens = tokenize(sageName).filter((t) => t.length >= 4);
  if (nameTokens.length === 0) nameTokens = tokenize(sageName);
  const titleTokens = new Set(tokenize(articleTitle));
  const overlap = nameTokens.filter((t) => titleTokens.has(t)).length;
  if (overlap >= 2) return true;
  if (nameTokens.length === 1 && overlap === 1) return true;
  return false;
}

function isPublicDomain(meta: Record<string, ExtMetadataField>): boolean {
  const license = (meta.LicenseShortName?.value ?? "").trim();
  const usage = (meta.UsageTerms?.value ?? "").trim();
  const copyrighted = (meta.Copyrighted?.value ?? "").trim();

  const l = license.toLowerCase();
  const u = usage.toLowerCase();

  // PD-equivalent institutional tags (LoC / Flickr Commons "No restrictions",
  // CC Public Domain Mark). These carry Copyrighted="True" in extmetadata even
  // though no copyright is asserted, so they're admitted regardless of that
  // flag — but ONLY for these specific PD-equivalent strings. This recovers
  // correct-but-rejected LoC portraits (e.g. Ralph Abernathy) that previously
  // fell through to a monogram. CC-BY-attribution images are NOT admitted here.
  if (l === "no restrictions" || u === "no known copyright restrictions") return true;
  if (l.startsWith("pdm") || u.includes("public domain mark")) return true;

  // Standard public-domain path: copyright flag must be explicitly false.
  if (copyrighted.toLowerCase() !== "false") return false;
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
  // Event/backdrop path opts in to scanning past top[0] for the first hit that
  // actually carries a lead image (see below). Defaults to false so the sage
  // portrait path stays byte-identical: it inspects strictly top[0], then
  // applies its own nameMatches relevance gate downstream.
  scanAllHits = false,
): Promise<{ pageimage: string; articleTitle: string } | null> {
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
  // Event/backdrop path (scanAllHits): take the FIRST best-ranked hit that
  // actually carries a lead image, not strictly top[0] — a #1 article without a
  // pageimage (a list, stub, or disambiguation page outranking the real
  // subject) shouldn't blank the event when #2/#3 have a canonical lead. Sage
  // path (default): strictly top[0], unchanged.
  const hit = scanAllHits ? sorted.find((p) => p.pageimage && p.title) : sorted[0];
  if (!hit?.pageimage || !hit?.title) return null;
  return { pageimage: hit.pageimage, articleTitle: hit.title };
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
): Promise<PortraitResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // LEVER 2 — name-only article query. The old query appended topic +
    // dramatic-title tokens to "disambiguate", but for minor figures that
    // pulled the search toward the campaign's dominant article (E. D. Nixon →
    // Rosa Parks, Lillian Wald → MLK, every Lewis & Clark sage → the expedition
    // group shot). The bare name lands the person's own article.
    const article = await findArticlePageimage(sageName.trim(), controller.signal);
    if (!article) return null;
    // LEVER 1 — the matched article must actually be this person, else reject
    // to the monogram fallback. This gate ALSO guards the fall-through below:
    // we only ever search Commons for a PD alternative AFTER the article has
    // been confirmed as this person, so the fall-through seeks an image for a
    // verified identity, never a blind name search.
    if (!nameMatches(sageName, article.articleTitle)) return null;
    // LEVER 3 — reject maps/flags/logos/seals/collages/SVGs by filename. Reuses
    // the event path's JUNK_TITLE_RE; its "svg" alternative also catches .svg
    // files (the FSA logo, flag SVGs) that the image-MIME check would otherwise
    // pass. Hard gate for portraits, not the event path's soft down-rank.
    // Try the article LEAD image first (the happy path: one extra call, no
    // fall-through). Only if the lead is junk- or license-rejected (e.g. FDR,
    // whose lead is the one CC-BY image in an otherwise public-domain pool) do
    // we lazily fall through to a guarded PD Commons search.
    if (!JUNK_TITLE_RE.test(article.pageimage)) {
      const lead = await lookupCommonsFile(article.pageimage, controller.signal);
      if (lead) return lead;
    }
    return await searchPortraitPdFallback(sageName);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Stricter than nameMatches: EVERY significant (>=4-char) name token must appear
// in the file title. Used only for the Commons portrait fall-through, whose pool
// is noisier than a Wikipedia article title (Eleanor/Theodore Roosevelt all
// share the "roosevelt" surname). Requires >=2 significant tokens; a lone common
// surname ("E. D. Nixon" -> "nixon") can't be safely disambiguated on the open
// Commons pool, so the caller refuses and lets the monogram stand.
function portraitNameMatch(sigTokens: string[], title: string): boolean {
  if (sigTokens.length < 2) return false;
  const titleTokens = new Set(tokenize(title));
  return sigTokens.every((t) => titleTokens.has(t));
}

// A coordinating connector in a file title almost always introduces a SECOND
// subject ("FDR AND Hoover", "FDR WITH Eleanor") — i.e. a group shot, not a solo
// portrait. Hard-drop these on the fall-through: for famous figures a clean solo
// PD portrait essentially always exists, so the cost is near-zero and it removes
// the last fuzzy (group-shot) case. A bare comma is NOT a signal — "Franklin
// Delano Roosevelt, Portrait 1933" is solo.
function titleNamesSecondPerson(title: string): boolean {
  return /(\band\b|\bwith\b|&)/i.test(title);
}

// Guarded, strict-PD portrait fall-through. Fires ONLY when the article lead is
// junk- or license-rejected (lazy: a single extra Commons call, and never for a
// sage whose lead already resolved). Searches Commons by bare name, then keeps
// only candidates that pass, in order: (a) identity — ALL significant name
// tokens present (portraitNameMatch); (b) no SECOND person (titleNamesSecondPerson
// — solo portraits only); (c) JUNK_TITLE_RE; (d) the STRICT isPublicDomain tier
// (PD / PD-equivalent only — CC-BY stays rejected, same predicate the lead uses).
// Best solo portrait wins; null -> monogram. Owns its OWN timeout so this third
// sequential call isn't starved by the two the lead path already spent.
async function searchPortraitPdFallback(sageName: string): Promise<PortraitResult | null> {
  const sigTokens = tokenize(sageName).filter((t) => t.length >= 4);
  if (sigTokens.length < 2) return null; // single common surname — refuse, monogram

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrnamespace: "6",
      gsrsearch: sageName.trim(),
      gsrlimit: "15",
      prop: "imageinfo",
      iiprop: "url|extmetadata|mime",
      iiurlwidth: "300",
      format: "json",
      origin: "*",
    });

    const res = await fetch(`${COMMONS_API}?${params}`, {
      headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = (await res.json()) as CommonsResponse;
    const pages = data.query?.pages;
    if (!pages) return null;

    // Survivors of all four gates, ranked: an explicit "portrait" in the title
    // first, then the best original search rank.
    const candidates: { result: PortraitResult; portraitScore: number; index: number }[] = [];
    for (const page of Object.values(pages)) {
      const info = page.imageinfo?.[0];
      if (!info?.extmetadata) continue;
      const mime = info.mime ?? "";
      if (!mime.startsWith("image/")) continue;
      if (!portraitNameMatch(sigTokens, page.title)) continue; // (a) identity
      if (titleNamesSecondPerson(page.title)) continue;        // (b) solo only
      if (JUNK_TITLE_RE.test(page.title)) continue;            // (c) junk
      if (!isPublicDomain(info.extmetadata)) continue;         // (d) strict PD

      candidates.push({
        result: {
          thumbUrl: info.thumburl,
          artist: stripHtml(info.extmetadata.Artist?.value ?? "Unknown"),
          license: info.extmetadata.LicenseShortName?.value ?? "Public domain",
          sourceUrl: commonsPageUrl(page.title),
        },
        portraitScore: /portrait/i.test(page.title) ? 1 : 0,
        index: (page as { index?: number }).index ?? 999,
      });
    }

    candidates.sort((a, b) => b.portraitScore - a.portraitScore || a.index - b.index);
    return candidates[0]?.result ?? null;
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
  /** The file's creation/origin year from extmetadata (DateTimeOriginal/DateTime),
   * null when absent. Carried so the article-LEAD fast path can apply the same
   * DATE-based era check the Commons-pool path does, instead of title-only. */
  dateYear?: number | null;
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
// flow in searchPortrait). Returns ALL license-acceptable hits that clear the
// relevance gate, ranked best-first (token overlap, junk/SVG penalized); empty
// on no match, network error, or malformed response. The full ranked list (not
// just the top hit) feeds enrichEventImages' cross-event dedupe: when an earlier
// event already took the best hit, a later one falls to the next-best UNUSED
// candidate here, breaking the article-funnel repeat.
async function searchCommonsFileRanked(query: string, eraMaxYear?: number | null): Promise<CommonsImageResult[]> {
  if (!query.trim()) return [];

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
    if (!res.ok) return [];

    const data = (await res.json()) as CommonsResponse;
    const pages = data.query?.pages;
    if (!pages) return [];

    const queryTokens = new Set(tokenize(query));

    // Score every license-acceptable hit; keep those that clear the relevance
    // gate (score > 0 — at least one meaningful query↔title token match, net of
    // junk/SVG penalties; a wrong image is worse than a repeat), ranked
    // best-first with the original search rank breaking ties.
    const scored: { result: CommonsImageResult; score: number; index: number }[] = [];
    for (const page of Object.values(pages)) {
      const info = page.imageinfo?.[0];
      if (!info?.extmetadata) continue;
      const mime = info.mime ?? "";
      if (!mime.startsWith("image/")) continue;
      if (!isAcceptableForEventImage(info.extmetadata)) continue;

      const index = (page as any).index ?? 999;
      const score = scoreCandidate(page.title, mime, queryTokens);
      if (score <= 0) continue;
      // ERA GUARD (fix a): reject a hit whose title/creation-date signals a
      // wrong, modern era for a pre-photography campaign — a strong token match
      // to a 20th-century photo is still the wrong image.
      const dateYear = latestYearIn(
        info.extmetadata.DateTimeOriginal?.value ?? info.extmetadata.DateTime?.value ?? "",
      );
      if (eraInappropriate(page.title, dateYear, eraMaxYear)) continue;
      scored.push({
        result: {
          thumbUrl: info.thumburl,
          artist: stripHtml(info.extmetadata.Artist?.value ?? "Unknown"),
          license: info.extmetadata.LicenseShortName?.value ?? "Unknown",
          sourceUrl: commonsPageUrl(page.title),
          searchQuery: query,
          dateYear,
        },
        score,
        index,
      });
    }

    scored.sort((a, b) => b.score - a.score || a.index - b.index);
    return scored.map((s) => s.result);
  } catch {
    return [];
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
    dateYear: latestYearIn(info.extmetadata.DateTimeOriginal?.value ?? info.extmetadata.DateTime?.value ?? ""),
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
    const article = await findArticlePageimage(query, controller.signal, true);
    if (!article) return null;
    return await lookupCommonsFileForEvent(article.pageimage, query, controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Per-event + backdrop Commons enrichment with CROSS-EVENT DEDUPE, lazy on
// collision so API load stays at the old (proven-safe) ~1 call/event level:
//  1. PARALLEL article-lead pass — fetch only the canonical article lead image
//     for every event query + the backdrop (one call each). This is the same
//     concurrency the old code used; the rich Commons pool is NOT fetched here.
//  2. SEQUENTIAL assign — walk events in order. If an event's lead is unused,
//     take it (no extra call — the common case). ONLY when its lead is missing
//     or already used by an earlier event/the backdrop do we fetch THAT event's
//     Commons pool and pick the best UNUSED candidate. This breaks the
//     article-funnel (many queries → same dominant article → same lead, e.g.
//     Pullman) while paying the Commons cost only where a collision forces it.
// Tie-break when no unused candidate exists (or the query is genuinely thin):
// keep the lead (or best Commons) duplicate — a relevant repeat beats an empty
// frame. Systems and character campaigns share this path equally.
// IDEMPOTENT + RESTRICTABLE (fix b2): seeds the dedupe with images/backdrop
// ALREADY assigned and skips events that already have an image, so it can run a
// SECOND time to fill ONLY the pinned spine beats (spliced in after the first
// pass) without disturbing existing assignments. `restrictTo` scopes which
// events it may assign (default: all). Called once for systems' model events,
// then again with restrictTo=pinned after applyStoryPlan; called once
// (unrestricted) for the narrative product. When the era guard is inactive
// (ctx.eraMaxYear ≥ 1840 or absent) and nothing is pre-assigned, the first call
// is byte-identical to the prior behavior.
// Which events a (re-)enrichment pass may assign: those matching restrictTo and
// NOT already imaged. Pure & exported so the "pinned beats are reachable by
// enrichment, not bypassed" + idempotency claims are testable without network.
export function selectEnrichTargets(
  events: any[],
  restrictTo: (ev: any) => boolean = () => true,
): { ev: any; i: number }[] {
  return events.map((ev, i) => ({ ev, i })).filter(({ ev }) => restrictTo(ev) && !ev?.image);
}

export async function enrichEventImages(
  data: any,
  ctx: CampaignContext,
  opts: { restrictTo?: (ev: any) => boolean } = {},
): Promise<void> {
  const events = Array.isArray(data.events) ? data.events : [];
  const restrict = opts.restrictTo ?? (() => true);
  const eraMaxYear = ctx.eraMaxYear;
  const styleKw = typeof data.imageStyleKeyword === "string" ? data.imageStyleKeyword.trim() : "";
  const appendStyle = (q: string) => styleKw ? `${q} ${styleKw}` : q;
  const queryOf = (ev: any): string | null =>
    typeof ev.imageSearchQuery === "string" && ev.imageSearchQuery.trim() ? ev.imageSearchQuery.trim() : null;
  const eraBad = (img: CommonsImageResult | null): boolean =>
    leadImageEraInappropriate(img, eraMaxYear);

  // Events we may assign now: matching restrictTo and NOT already imaged.
  const targets = selectEnrichTargets(events, restrict);

  // Seed dedupe with everything already chosen (existing images + backdrop).
  const used = new Set<string>();
  if (data.backdropImage?.thumbUrl) used.add(data.backdropImage.thumbUrl);
  for (const ev of events) if (ev.image?.thumbUrl) used.add(ev.image.thumbUrl);

  // Pass 1 — parallel article-lead lookups for the target queries (+ backdrop
  // only when one isn't already set).
  const needBackdrop = !data.backdropImage;
  const leadTasks = targets.map(({ ev }: any) => {
    const q = queryOf(ev);
    return q ? searchViaArticlePageimage(q) : Promise.resolve<CommonsImageResult | null>(null);
  });
  const settled = await Promise.allSettled([
    ...leadTasks,
    needBackdrop ? searchViaArticlePageimage(ctx.topic) : Promise.resolve<CommonsImageResult | null>(null),
  ]);
  const val = (i: number): CommonsImageResult | null =>
    settled[i]?.status === "fulfilled" ? (settled[i] as PromiseFulfilledResult<CommonsImageResult | null>).value : null;

  // Backdrop — only when not already set; era guard applies here too.
  if (needBackdrop) {
    let backdrop = val(targets.length);
    if (eraBad(backdrop)) backdrop = null;
    if (!backdrop) backdrop = (await searchCommonsFileRanked(appendStyle(ctx.topic), eraMaxYear))[0] ?? null;
    if (backdrop) {
      data.backdropImage = backdrop;
      used.add(backdrop.thumbUrl);
    }
  }

  // Sequential assign over the targets, with cross-event dedupe.
  for (let t = 0; t < targets.length; t++) {
    const { i } = targets[t];
    const q = queryOf(targets[t].ev);
    if (!q) continue;
    const rawLead = val(t);
    // Fast path: a usable, unused, era-OK article lead — no Commons call.
    if (rawLead && !used.has(rawLead.thumbUrl) && !eraBad(rawLead)) {
      events[i].image = rawLead;
      used.add(rawLead.thumbUrl);
      continue;
    }
    // Collision / no lead / era-rejected lead → consult the Commons pool now.
    const pool = await searchCommonsFileRanked(appendStyle(q), eraMaxYear);
    const eraOkLead = rawLead && !eraBad(rawLead) ? rawLead : null;
    const chosen = pool.find((c) => !used.has(c.thumbUrl)) ?? eraOkLead ?? pool[0] ?? null;
    if (chosen) {
      events[i].image = chosen;
      used.add(chosen.thumbUrl);
    }
  }
}

export async function enrichSagePortraits(
  data: any,
): Promise<void> {
  const sages = data.sages;
  if (!Array.isArray(sages)) return;

  const results = await Promise.allSettled(
    sages.map((sage: any) => searchPortrait(sage.name)),
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
