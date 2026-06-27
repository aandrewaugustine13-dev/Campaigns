#!/usr/bin/env npx tsx
// ════════════════════════════════════════════════════════════════
// Inspector for the locked-constraints generator path.
//
// Reads a JSON fixture with at minimum a `standard`, plus any of the
// optional locked inputs (frame, playerRole, cast, economy) and any of
// the existing knobs (topic, grade, length, numQuestions, numSages,
// difficulty). Calls generateCampaign and writes the full
// campaign JSON to disk for eye-reading. Leaves generate.ts untouched.
//
// Usage:
//   npm run locked -- fixtures/erie.json
//   npm run locked -- fixtures/erie.json --out generator/output-erie.json
// ════════════════════════════════════════════════════════════════
import { config as loadEnv } from "dotenv";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { generateCampaign, type GenerateInputs } from "./core.js";
import { printReport } from "./validate.js";

const __root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(__root, ".env.local") });

// Defaults the fixture may override. Kept small — this harness is for the
// locked-constraints test, not the broader generator surface.
const DEFAULTS = {
  topic: "",
  grade: "8th grade",
  length: 8,
  numQuestions: 5,
  numSages: 3,
  difficulty: "medium",
} as const;

type Fixture = Partial<GenerateInputs> & { standard: string };

function parseArgs(argv: string[]): { fixturePath: string; outOverride?: string } {
  const args = argv.slice(2);
  let fixturePath: string | undefined;
  let outOverride: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out" && i + 1 < args.length) {
      outOverride = args[i + 1];
      i++;
    } else if (!fixturePath) {
      fixturePath = args[i];
    }
  }
  if (!fixturePath) {
    console.error("Usage: npm run locked -- <fixture.json> [--out path.json]");
    process.exit(1);
  }
  return { fixturePath: resolve(process.cwd(), fixturePath), outOverride };
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY not set. Put it in .env.local or export it.");
    process.exit(1);
  }

  const { fixturePath, outOverride } = parseArgs(process.argv);
  const fixture = JSON.parse(readFileSync(fixturePath, "utf-8")) as Fixture;

  if (!fixture.standard || typeof fixture.standard !== "string") {
    console.error(`Fixture ${fixturePath} is missing a "standard" string.`);
    process.exit(1);
  }

  const inputs: GenerateInputs = {
    topic: fixture.topic ?? DEFAULTS.topic,
    standard: fixture.standard,
    grade: fixture.grade ?? DEFAULTS.grade,
    length: fixture.length ?? DEFAULTS.length,
    numQuestions: fixture.numQuestions ?? DEFAULTS.numQuestions,
    numSages: fixture.numSages ?? DEFAULTS.numSages,
    difficulty: fixture.difficulty ?? DEFAULTS.difficulty,
    frame: fixture.frame,
    playerRole: fixture.playerRole,
    cast: fixture.cast,
    economy: fixture.economy,
  };

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║      CAMPAIGN GENERATOR — LOCKED-CONSTRAINTS TEST   ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log();
  console.log(`  Fixture:     ${fixturePath}`);
  console.log(`  Standard:    ${inputs.standard}`);
  console.log(`  Frame:       ${inputs.frame ? "[locked]" : "(none — falls back to journey shape)"}`);
  console.log(`  Player role: ${inputs.playerRole ? "[locked]" : "(none)"}`);
  console.log(`  Cast:        ${inputs.cast ? `[locked, ${inputs.cast.length} members]` : "(none)"}`);
  console.log(`  Economy:     ${inputs.economy ? `[locked, ${inputs.economy.resources?.length ?? 0} resources]` : "(none)"}`);
  console.log();
  console.log("  Calling Gemini API (this may take 30-90 seconds)...");
  console.log();

  const result = await generateCampaign(apiKey, inputs);

  console.log(`  API call completed in ${result.elapsedSeconds.toFixed(1)}s`);

  const outPath = outOverride
    ? resolve(process.cwd(), outOverride)
    : resolve(__root, "generator/output-locked.json");
  writeFileSync(outPath, JSON.stringify(result.data, null, 2), "utf-8");
  console.log(`  Campaign written to: ${outPath}`);

  printReport(result.validation);

  const d = result.data as Record<string, unknown>;
  console.log();
  console.log("  CONTENT SUMMARY:");
  console.log(`    Title:     ${d.title}`);
  console.log(`    Subtitle:  ${d.subtitle}`);
  console.log(`    Events:    ${Array.isArray(d.events) ? d.events.length : "?"}`);
  console.log(`    Sages:     ${Array.isArray(d.sages) ? d.sages.length : "?"}`);
  console.log(`    Trivia:    ${Array.isArray(d.eventTrivia) ? d.eventTrivia.length : "?"}`);
  console.log(`    Resources: ${typeof d.initialResources === "object" ? Object.keys(d.initialResources as object).join(", ") : "?"}`);
  console.log(`    Route:     ${Array.isArray(d.route) ? (d.route as Record<string, unknown>[]).map((n) => n.id).join(" → ") : "?"}`);
  console.log();

  if (result.validation.failed > 0) {
    console.log(`  ⚠ ${result.validation.failed} validation errors found. Output saved for inspection.`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
