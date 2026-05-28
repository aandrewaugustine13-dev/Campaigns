const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "Campaigns/0.1 (https://campaigns-3sk.pages.dev)";
const TIMEOUT_MS = 5000;

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

export function buildSearchQuery(sageName: string): string {
  return `${sageName} portrait`;
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

async function searchPortrait(sageName: string): Promise<PortraitResult | null> {
  const query = buildSearchQuery(sageName);
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: query,
    gsrlimit: "5",
    prop: "imageinfo",
    iiprop: "url|extmetadata|mime",
    iiurlwidth: "300",
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

    const sorted = Object.values(pages).sort(
      (a, b) => ((a as any).index ?? 999) - ((b as any).index ?? 999),
    );

    for (const page of sorted) {
      const info = page.imageinfo?.[0];
      if (!info?.extmetadata) continue;

      const mime = info.mime ?? "";
      if (!mime.startsWith("image/")) continue;

      if (!isPublicDomain(info.extmetadata)) continue;

      return {
        thumbUrl: info.thumburl,
        artist: stripHtml(info.extmetadata.Artist?.value ?? "Unknown"),
        license: info.extmetadata.LicenseShortName?.value ?? "Public domain",
        sourceUrl: commonsPageUrl(page.title),
      };
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function enrichSagePortraits(data: any): Promise<void> {
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
