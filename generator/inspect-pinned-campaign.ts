#!/usr/bin/env npx tsx
// End-to-end inspector for the narrative spine: author a story plan, then
// generate a FULL campaign with that plan wired in, so the PINNED arc beats
// are spliced into the event bank and storyMeaning is set. Writes the campaign
// JSON to a file and prints a pinned-vs-pool breakdown to stderr so you can
// judge whether the pinned beats read as richly as the surrounding pool.
//
//   npm run pinned-campaign -- "TEKS 8.7 — The War of 1812 ..."
//   npm run pinned-campaign            (defaults to the War of 1812)
import { config as loadEnv } from "dotenv";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { generateStoryPlan } from "./storyPlanGen.js";
import { generateCampaign, type GenerateInputs } from "./core.js";
import { validateForDelivery } from "./core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const __root = resolve(__dirname, "..");
loadEnv({ path: resolve(__root, ".env.local") });

const DEFAULT_TOPIC = "The War of 1812";
const DEFAULT_STANDARD =
  "TEKS 8.7 — The War of 1812: its causes, major events, and significance for American national identity";

function snippet(s: unknown, n = 160): string {
  if (typeof s !== "string") {
    // FlagText object: show its default
    if (s && typeof s === "object" && "default" in (s as Record<string, unknown>))
      return snippet((s as Record<string, unknown>).default, n);
    return "(non-string text)";
  }
  return s.length > n ? s.slice(0, n) + "…" : s;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Error: ANTHROPIC_API_KEY not set. Put it in .env.local or export it.");
    process.exit(1);
  }

  const arg = process.argv.slice(2).join(" ").trim();
  const standard = arg || DEFAULT_STANDARD;
  const topic = arg || DEFAULT_TOPIC;

  console.error(`\n→ [1/2] Authoring narrative plan for: ${topic}`);
  const { data: plan, findings: planFindings } = await generateStoryPlan(standard, apiKey, {
    topic,
    campaignType: "systems",
    progressionMode: "project",
  });
  const planErrs = planFindings.filter((f) => f.level === "error");
  if (planErrs.length > 0) {
    console.error("Plan FAILED validation:");
    for (const f of planErrs) console.error(`  ✗ [${f.field}] ${f.message}`);
    process.exit(2);
  }
  console.error(`  ✓ plan: ${plan.beats.filter((b) => b.included).length} included beats — ${plan.beats.map((b) => b.role).join(" → ")}`);

  console.error(`\n→ [2/2] Generating full campaign WITH the plan wired in (this may take 1-2 min)…`);
  const inputs: GenerateInputs = {
    topic,
    standard,
    grade: "8th grade",
    length: 8,
    numQuestions: 6,
    numSages: 3,
    difficulty: "medium",
    storyPlan: plan,
  };
  const { data, validation, elapsedSeconds } = await generateCampaign(apiKey, inputs);
  console.error(`  ✓ generated in ${elapsedSeconds.toFixed(1)}s`);

  const d = data as Record<string, unknown>;
  const outPath = resolve(__dirname, "pinned-campaign-output.json");
  writeFileSync(outPath, JSON.stringify(data, null, 2), "utf-8");

  // ── pinned-vs-pool breakdown ──
  const events = Array.isArray(d.events) ? (d.events as Record<string, unknown>[]) : [];
  const pinned = events.filter((e) => e.pinned).sort((a, b) => ((a.pinSeq as number) ?? 0) - ((b.pinSeq as number) ?? 0));
  const pool = events.filter((e) => !e.pinned);

  console.error(`\n${"═".repeat(72)}`);
  console.error(`PINNED ARC BEATS (${pinned.length}) — guaranteed, in order:`);
  console.error("═".repeat(72));
  for (const e of pinned) {
    console.error(`\n[pinSeq ${e.pinSeq}] phase [${e.phase_min}, ${e.phase_max}]  «${e.title}»`);
    console.error(`  TEXT:  ${snippet(e.text)}`);
    if (e.significance) console.error(`  SIGNIF: ${snippet(e.significance)}`);
  }
  console.error(`\n${"═".repeat(72)}`);
  console.error(`POOL EVENTS (${pool.length}) — the model-authored surround:`);
  console.error("═".repeat(72));
  for (const e of pool) {
    console.error(`\n[${e.id}] phase [${e.phase_min}, ${e.phase_max}]  «${e.title}»`);
    console.error(`  TEXT:  ${snippet(e.text)}`);
  }

  console.error(`\n${"═".repeat(72)}`);
  console.error("STORY MEANING (the ending):");
  console.error("═".repeat(72));
  console.error(`  ${snippet(d.storyMeaning, 800)}`);

  // delivery findings (informational; the harness dimension comes in step 6)
  const { findings, errorCount } = validateForDelivery(data, inputs);
  console.error(`\nvalidate(): ${validation.passed} passed, ${validation.failed} errors, ${validation.warnings} warnings`);
  console.error(`delivery findings: ${errorCount} errors / ${findings.length} total`);
  for (const f of findings.filter((x) => x.level === "error")) console.error(`  ✗ [${f.field}] ${f.message}`);

  console.error(`\nFull campaign JSON → ${outPath}`);
  // clean JSON to stdout for piping
  console.log(JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
