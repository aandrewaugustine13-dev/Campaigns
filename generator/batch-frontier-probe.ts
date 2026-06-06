#!/usr/bin/env npx tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
// ════════════════════════════════════════════════════════════════
// Batch frontier probe — generate N character campaigns across varied topics
// (single-shot, no UI) and report each one's FRONTIER REACH: the best joint
// (family, community) a "good to everyone" line of play can pin, plus which
// honesty guards fire. Tells us the SHAPE of the leak:
//   - consistent small over-shoot (+5/+4-ish) vs sometimes-under / sometimes-way-over
//   - frontier only, or do inert/conflict/not-all-positive ever fire too
//
//   npx tsx generator/batch-frontier-probe.ts
//
// Uses the SAME pipeline + params as the app/e2e (length 6, numQuestions 4),
// forcing the character path with a topic-fit perspective when the frame
// proposes systems. Does NOT write any fixture (read-only probe).
// ════════════════════════════════════════════════════════════════
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, mkdirSync } from "fs";
import { generateFrame } from "./frame.js";
import { generatePersonalEconomy } from "./personalEconomy.js";
import { generateCast } from "./cast.js";
import { generateFaultLine } from "./faultline.js";
import { generateCampaign, validateForDelivery, type GenerateInputs } from "./core.js";

const __root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(__root, ".env.local") });

const HIGH_BAND = 4;

interface Topic {
  key: string;
  standard: string;
  // Fallback first-person perspective if the frame doesn't pick "character".
  role: string;
  description: string;
}

const TOPICS: Topic[] = [
  {
    key: "dustbowl",
    standard: "The Dust Bowl and the Great Depression: tenant farmers, drought, and migration west in the 1930s",
    role: "a tenant farmer in 1930s Oklahoma",
    description: "A struggling tenant farmer weighing whether to load the family truck for California or hold on to the land.",
  },
  {
    key: "lowell",
    standard: "The Industrial Revolution in America: factory labor, the Lowell mill girls, and early labor organizing",
    role: "a young mill worker in 1840s Lowell, Massachusetts",
    description: "A farm girl sending wages home from the textile mills, deciding how far to go in the turn-outs for shorter hours.",
  },
  {
    key: "ellis",
    standard: "Immigration and the Gilded Age: the journey through Ellis Island and tenement life in New York",
    role: "a newly arrived immigrant in 1900s New York",
    description: "A recent arrival from the old country, balancing obligations to kin back home against making a new life in the tenements.",
  },
  {
    key: "homestead",
    standard: "Westward Expansion and the Homestead Act: settling the Great Plains in the late 1800s",
    role: "a homesteader on the Great Plains in the 1870s",
    description: "A settler proving up a claim, weighing neighbors' needs against the family's own thin margin of survival.",
  },
  {
    key: "boycott",
    standard: "The Civil Rights Movement: the Montgomery Bus Boycott and everyday courage in 1955 Alabama",
    role: "a domestic worker in 1955 Montgomery, Alabama",
    description: "A working woman who rides the buses daily, deciding how openly to join the boycott when her livelihood depends on getting to work.",
  },
  {
    key: "homefront",
    standard: "The American Home Front in World War II: rationing, war work, and shifting family roles",
    role: "a mother managing a household on the WWII home front",
    description: "A woman running a home while her husband is overseas, weighing war-work, rationing, and what she owes her neighbors.",
  },
];

// Exact-DP frontier reach: best joint (family, community) over any single line
// of play (one choice per event). Returns the point maximizing min(f,c) — the
// truest "how good to everyone CAN you be" — plus the doubleWin verdict.
function frontierReach(events: any[]): { f: number; c: number; doubleWin: boolean } {
  const eventPairs: { f: number; c: number }[][] = (events ?? []).map((ev) => {
    const choices = Array.isArray(ev.choices) ? ev.choices : [];
    return choices.map((c: any) => {
      const fw = c.flagWrites && typeof c.flagWrites === "object" ? c.flagWrites : {};
      return { f: typeof fw.family === "number" ? fw.family : 0, c: typeof fw.community === "number" ? fw.community : 0 };
    });
  });
  // DP: familySum → max communitySum reachable at that familySum.
  let dp = new Map<number, number>([[0, 0]]);
  for (const pairs of eventPairs) {
    if (pairs.length === 0) continue;
    const next = new Map<number, number>();
    for (const [fs, cs] of dp) {
      for (const p of pairs) {
        const nf = fs + p.f;
        const nc = cs + p.c;
        const prev = next.get(nf);
        if (prev === undefined || nc > prev) next.set(nf, nc);
      }
    }
    dp = next;
  }
  // argmax over reachable points of min(f,c), tie-break by sum.
  let best = { f: 0, c: 0 };
  let bestMin = -Infinity;
  let bestSum = -Infinity;
  let doubleWin = false;
  for (const [fs, cs] of dp) {
    if (fs >= HIGH_BAND && cs >= HIGH_BAND) doubleWin = true;
    const m = Math.min(fs, cs);
    const s = fs + cs;
    if (m > bestMin || (m === bestMin && s > bestSum)) {
      bestMin = m;
      bestSum = s;
      best = { f: fs, c: cs };
    }
  }
  return { ...best, doubleWin };
}

interface Result {
  key: string;
  ok: boolean;
  reachF?: number;
  reachC?: number;
  errors: string[];
  guardFields: string[];
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retry on 429 (org throughput limit) with backoff. Each label tells us what
// stalled. The org limit is 8k output tokens/min, so we back off ~60s+.
async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const is429 = e?.status === 429 || /rate_limit|429/.test(e?.message ?? "");
      if (!is429 || attempt >= tries) throw e;
      const wait = 60_000 + (attempt - 1) * 30_000;
      console.log(`    …${label} hit 429 (attempt ${attempt}/${tries}); backing off ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}

async function runOne(apiKey: string, topic: Topic): Promise<Result> {
  try {
    const { data: frame } = await withRetry(`${topic.key}:frame`, () => generateFrame(topic.standard, apiKey));
    const isCharacter = frame.campaignType === "character";
    const persp = isCharacter ? frame.recommendedPerspective : { role: topic.role, description: topic.description };
    const perspString = `${persp.role} — ${persp.description}`;

    // Sequential (not Promise.all) so three calls don't stack against the
    // per-minute token bucket; each retries independently on 429.
    const flRes = await withRetry(`${topic.key}:faultline`, () => generateFaultLine(topic.standard, perspString, apiKey));
    const peRes = await withRetry(`${topic.key}:economy`, () => generatePersonalEconomy(topic.standard, perspString, apiKey));
    const castRes = await withRetry(`${topic.key}:cast`, () => generateCast(topic.standard, apiKey));

    const inputs: GenerateInputs = {
      topic: persp.role,
      standard: topic.standard,
      grade: "8th grade",
      length: 6,
      numQuestions: 4,
      numSages: 3,
      difficulty: "medium",
      artStyle: "broadsheet-sepia",
      frame: frame.frame,
      playerRole: perspString,
      cast: castRes.data.cast,
      personalEconomy: peRes.data,
      faultLine: flRes.data,
    };

    const result = await withRetry(`${topic.key}:campaign`, () => generateCampaign(apiKey, inputs));
    const data = result.data as any;
    const { findings, errorCount } = validateForDelivery(data, inputs);
    const errs = findings.filter((f) => f.level === "error");
    const reach = frontierReach(data.events ?? []);

    // Persist the FULL generated campaign so its 5-tier reckoning can be
    // rendered up the high ladder afterward (no second generation needed).
    mkdirSync(resolve(__root, "generator/probe-out"), { recursive: true });
    const fullPath = resolve(__root, `generator/probe-out/${topic.key}.json`);
    writeFileSync(fullPath, JSON.stringify(data, null, 2), "utf8");

    console.log(
      `  [${topic.key.padEnd(10)}] reach +${reach.f}/+${reach.c}  ${errorCount === 0 ? "✅ SHIP" : "⛔ REJECT"}  ` +
        `guards: ${errs.length ? errs.map((f) => f.field).join(", ") : "none"}`,
    );

    return {
      key: topic.key,
      ok: errorCount === 0,
      reachF: reach.f,
      reachC: reach.c,
      errors: errs.map((f) => `[${f.field}] ${f.message}`),
      guardFields: errs.map((f) => f.field),
    };
  } catch (e: any) {
    console.log(`  [${topic.key.padEnd(10)}] FAILED: ${e?.message ?? e}`);
    return { key: topic.key, ok: false, errors: [], guardFields: [], error: e?.message ?? String(e) };
  }
}

// Bounded concurrency so we don't hammer rate limits.
async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set (.env.local).");
    process.exit(1);
  }
  // Optional CLI filter: `npx tsx generator/batch-frontier-probe.ts lowell ellis`
  // runs only those topic keys (so we can regenerate ONE without burning the batch).
  const wanted = process.argv.slice(2);
  const topics = wanted.length ? TOPICS.filter((t) => wanted.includes(t.key)) : TOPICS;
  if (wanted.length && topics.length === 0) {
    console.error(`No topics match ${wanted.join(", ")}. Known: ${TOPICS.map((t) => t.key).join(", ")}`);
    process.exit(1);
  }

  console.log(`\n=== BATCH FRONTIER PROBE — ${topics.length} character campaign(s) (length 6, app params) ===\n`);
  const t0 = Date.now();
  // Concurrency 1: the org throughput limit (8k output tok/min) can't sustain
  // parallel full-campaign generations. Sequential + 429 backoff is reliable.
  const results = await pool(topics, 1, (t) => runOne(apiKey, t));
  const secs = ((Date.now() - t0) / 1000).toFixed(0);

  console.log(`\n=== DISTRIBUTION (${secs}s total) ===\n`);
  const generated = results.filter((r) => !r.error);
  const shipped = generated.filter((r) => r.ok);
  const rejected = generated.filter((r) => !r.ok);
  console.log(`generated: ${generated.length}/${topics.length}   shipped: ${shipped.length}   rejected: ${rejected.length}`);
  console.log("\nper-campaign frontier reach (best both-line-of-play, max of min(f,c)):");
  for (const r of results) {
    if (r.error) { console.log(`  ${r.key.padEnd(10)} FAILED (${r.error})`); continue; }
    console.log(`  ${r.key.padEnd(10)} +${r.reachF}/+${r.reachC}  ${r.ok ? "SHIP" : "REJECT [" + r.guardFields.join(",") + "]"}`);
  }
  // Which guards fired, across the batch.
  const guardCounts: Record<string, number> = {};
  for (const r of rejected) for (const g of r.guardFields) guardCounts[g] = (guardCounts[g] ?? 0) + 1;
  console.log("\nguards fired (across rejects):");
  for (const [g, n] of Object.entries(guardCounts)) console.log(`  ${g}: ${n}`);
  if (Object.keys(guardCounts).length === 0) console.log("  none");

  // Full readouts for the rejects (so the [field] message reads true).
  if (rejected.length) {
    console.log("\n--- reject readouts ---");
    for (const r of rejected) {
      console.log(`\n[${r.key}] +${r.reachF}/+${r.reachC}`);
      for (const e of r.errors) console.log(`  ${e}`);
    }
  }

  // Persist machine-readable summary for the record.
  const summaryPath = resolve(__root, "generator/batch-frontier-probe.out.json");
  writeFileSync(summaryPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nWrote summary → ${summaryPath}\n`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
