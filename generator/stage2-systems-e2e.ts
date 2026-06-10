#!/usr/bin/env npx tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
// ════════════════════════════════════════════════════════════════
// Stage 2 systems regression: confirm a SYSTEMS campaign still generates
// end-to-end UNCHANGED through core.ts with NO faultLine in the payload.
// (Stage 1 already proved the assembled prompt is byte-identical and the
//  splice is a no-op when faultLine is undefined; this proves the whole
//  pipeline still completes and validates, and emits NO flags / NO fault-line
//  events on the systems path.)
//
// Run:  npm run e2e:systems
// ════════════════════════════════════════════════════════════════
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync } from "fs";
import { generateCampaign, type GenerateInputs } from "./core.js";
import { validate } from "./validate.js";

const __root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(__root, ".env.local") });

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "\u2713" : "\u2717"} ${label}${ok || !detail ? "" : `\n      ${detail}`}`);
  if (!ok) failed++;
};

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set (.env.local).");
    process.exit(1);
  }

  const erie = JSON.parse(readFileSync(resolve(__root, "fixtures/erie.json"), "utf8"));
  const inputs: GenerateInputs = {
    topic: erie.topic,
    standard: erie.standard,
    grade: erie.grade,
    length: 4,
    numQuestions: 3,
    numSages: 2,
    difficulty: erie.difficulty,
    frame: erie.frame,
    playerRole: erie.playerRole,
    cast: erie.cast,
    economy: erie.economy,
    // NO faultLine — the systems path.
  };

  console.log("\n=== Stage 2 regression: SYSTEMS campaign end-to-end (no faultLine) ===\n");
  console.log(`Topic: ${inputs.topic}\n→ generateCampaign …`);
  const result = await generateCampaign(apiKey, inputs);
  console.log(`   done in ${result.elapsedSeconds.toFixed(0)}s\n`);

  const data = result.data as any;
  writeFileSync(resolve(__root, "generator/erie-generated-output.json"), JSON.stringify(data, null, 2), "utf8");

  const report = validate(data);
  check("systems campaign is schema-valid", report.failed === 0,
    report.findings.filter((f) => f.level === "error").map((f) => `[${f.field}] ${f.message}`).join("; "));
  check("NO flags[] on the systems path",
    !data.flags || (Array.isArray(data.flags) && data.flags.length === 0),
    `flags=${JSON.stringify(data.flags)}`);
  const events: any[] = Array.isArray(data.events) ? data.events : [];
  check("NO event carries flagWrites",
    events.every((e) => !Array.isArray(e.choices) || e.choices.every((c: any) => !c?.flagWrites)));
  check("NO event carries FlagText variants",
    events.every((e) => !e.text || typeof e.text !== "object"));
  check("NO compiled fault-line event ids (fl_*) present",
    events.every((e) => typeof e.id !== "string" || !e.id.startsWith("fl_")));

  console.log(`\n=== ${failed === 0 ? "SYSTEMS PATH UNCHANGED — ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`} ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
