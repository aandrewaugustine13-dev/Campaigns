// Smoke test: Commons file search for event imagery + campaign backdrop.
// Hand-constructed queries simulate what the LLM would produce per event.
// Reuses the existing isPublicDomain logic.

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const UA = "Campaigns/0.1 smoke-events";

interface ExtField { value: string; source?: string }
interface ImageInfo { url: string; thumburl: string; mime: string; extmetadata: Record<string, ExtField> }
interface Page { pageid: number; title: string; index?: number; imageinfo?: ImageInfo[] }

function isPublicDomain(meta: Record<string, ExtField>): boolean {
  const license = (meta?.LicenseShortName?.value ?? "").trim();
  const copyrighted = (meta?.Copyrighted?.value ?? "").trim();
  if (copyrighted.toLowerCase() !== "false") return false;
  const l = license.toLowerCase();
  return l.startsWith("public domain") || l.startsWith("pd") || l === "cc0";
}

function stripHtml(html: string): string {
  return html
    .replace(/<span[^>]*display:\s*none[^>]*>[\s\S]*?<\/span>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface PortraitHit {
  title: string;
  thumb: string;
  artist: string;
  license: string;
  mime: string;
}

async function commonsFileSearch(query: string): Promise<{ allResults: Array<{ title: string; mime: string; license: string; pd: boolean }>; firstPD: PortraitHit | null }> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: query,
    gsrlimit: "10",
    prop: "imageinfo",
    iiprop: "url|extmetadata|mime",
    iiurlwidth: "400",
    format: "json",
    origin: "*",
  });

  const res = await fetch(`${COMMONS_API}?${params}`, {
    headers: { "User-Agent": UA, "Api-User-Agent": UA },
  });
  if (!res.ok) return { allResults: [], firstPD: null };

  const data = (await res.json()) as { query?: { pages?: Record<string, Page> } };
  const pages = data.query?.pages ?? {};
  const sorted = Object.values(pages).sort((a, b) => (a.index ?? 999) - (b.index ?? 999));

  const allResults: Array<{ title: string; mime: string; license: string; pd: boolean }> = [];
  let firstPD: PortraitHit | null = null;

  for (const page of sorted) {
    const info = page.imageinfo?.[0];
    if (!info?.extmetadata) continue;
    const mime = info.mime ?? "?";
    const license = info.extmetadata.LicenseShortName?.value ?? "?";
    const pd = mime.startsWith("image/") && isPublicDomain(info.extmetadata);
    allResults.push({ title: page.title, mime, license, pd });
    if (pd && !firstPD) {
      firstPD = {
        title: page.title,
        thumb: info.thumburl,
        artist: stripHtml(info.extmetadata.Artist?.value ?? "Unknown"),
        license,
        mime,
      };
    }
  }
  return { allResults, firstPD };
}

const erieEra = "lithograph engraving 19th century";
const erieQueries = [
  "Erie Canal opening ceremony De Witt Clinton 1825",
  "Erie Canal lock construction Lockport",
  "Erie Canal mule towpath barge",
  "Erie Canal Buffalo terminus",
];
const erieBackdrop = "Erie Canal";

const alamoEra = "lithograph engraving 19th century";
const alamoQueries = [
  "Alamo mission siege defenders 1836",
  "Travis letter Alamo Victory or Death",
  "Mexican army Santa Anna Alamo assault",
  "Alamo chapel ruins after siege",
];
const alamoBackdrop = "Alamo mission Texas";

async function runBlock(label: string, queries: string[], era: string, backdrop: string) {
  console.log();
  console.log(`══════════════════════════════════════════════════════════════════`);
  console.log(`  ${label}`);
  console.log(`  era hint: "${era}"`);
  console.log(`══════════════════════════════════════════════════════════════════`);

  for (const q of queries) {
    const fullQ = `${q} ${era}`;
    console.log();
    console.log(`▌ "${fullQ}"`);
    const { allResults, firstPD } = await commonsFileSearch(fullQ);
    console.log(`   top 5:`);
    for (const r of allResults.slice(0, 5)) {
      const flag = r.pd ? "✓PD" : "  ";
      console.log(`     ${flag}  ${r.title.slice(0, 70).padEnd(70)} | ${r.mime.slice(0, 15).padEnd(15)} | ${r.license.slice(0, 20)}`);
    }
    if (firstPD) {
      console.log(`   → CHOSEN: ${firstPD.title}`);
      console.log(`     thumb:  ${firstPD.thumb}`);
      console.log(`     artist: ${firstPD.artist}`);
      console.log(`     lic:    ${firstPD.license}`);
    } else {
      console.log(`   → no PD image — would fall back to backdrop`);
    }
  }

  console.log();
  console.log(`▌ BACKDROP: "${backdrop} ${era}"`);
  const t0 = Date.now();
  const { allResults, firstPD } = await commonsFileSearch(`${backdrop} ${era}`);
  const dt = Date.now() - t0;
  console.log(`   top 5 (single backdrop call: ${dt}ms):`);
  for (const r of allResults.slice(0, 5)) {
    const flag = r.pd ? "✓PD" : "  ";
    console.log(`     ${flag}  ${r.title.slice(0, 70).padEnd(70)} | ${r.mime.slice(0, 15).padEnd(15)} | ${r.license.slice(0, 20)}`);
  }
  if (firstPD) {
    console.log(`   → CHOSEN backdrop: ${firstPD.title}`);
  } else {
    console.log(`   → no PD backdrop`);
  }
}

const allStart = Date.now();
await runBlock("TEST A — Erie Canal", erieQueries, erieEra, erieBackdrop);
const erieDone = Date.now();
await runBlock("TEST B — Alamo", alamoQueries, alamoEra, alamoBackdrop);
const allDone = Date.now();
console.log();
console.log(`──────────────────────────────────────────────────────────────────`);
console.log(`  total elapsed: ${(allDone - allStart) / 1000}s`);
console.log(`  Erie block:    ${(erieDone - allStart) / 1000}s (4 events + 1 backdrop, sequential)`);
console.log(`  Alamo block:   ${(allDone - erieDone) / 1000}s`);
console.log(`──────────────────────────────────────────────────────────────────`);
