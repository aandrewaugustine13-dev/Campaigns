#!/usr/bin/env npx tsx
import { config as loadEnv } from "dotenv";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { printReport } from "./validate.js";
import { generateCampaign, type GenerateInputs } from "./core.js";

const __root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(__root, ".env.local") });

const __dirname = dirname(fileURLToPath(import.meta.url));

const INPUTS: GenerateInputs = {
  topic: "Lewis and Clark Expedition",
  standard: "TEKS 5.1(A), 5.1(B) — Historical significance of the Lewis and Clark Expedition, its role in westward expansion, and its interactions with Native peoples",
  grade: "5th grade",
  length: 5,
  numQuestions: 3,
  numSages: 3,
  difficulty: "medium",
};

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY environment variable not set.");
    console.error("Set it in .env.local or export it: export GEMINI_API_KEY=...");
    process.exit(1);
  }

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║           CAMPAIGN GENERATOR — TEST HARNESS         ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log();
  console.log(`  Topic:      ${INPUTS.topic}`);
  console.log(`  Standard:   ${INPUTS.standard}`);
  console.log(`  Grade:      ${INPUTS.grade}`);
  console.log(`  Events:     ${INPUTS.length}`);
  console.log(`  Trivia:     ${INPUTS.numQuestions}`);
  console.log(`  Sages:      ${INPUTS.numSages}`);
  console.log(`  Difficulty: ${INPUTS.difficulty}`);
  console.log();
  console.log("  Calling Gemini API (this may take 30-90 seconds)...");
  console.log();

  const result = await generateCampaign(apiKey, INPUTS);

  console.log(`  API call completed in ${result.elapsedSeconds.toFixed(1)}s`);

  const rawPath = resolve(__dirname, "output_raw.json");
  writeFileSync(rawPath, JSON.stringify(result.data), "utf-8");
  console.log(`  Raw output saved to: ${rawPath}`);

  const prettyPath = resolve(__dirname, "output.json");
  writeFileSync(prettyPath, JSON.stringify(result.data, null, 2), "utf-8");
  console.log(`  Parsed output saved to: ${prettyPath}`);

  printReport(result.validation);

  const d = result.data as Record<string, unknown>;
  console.log("  CONTENT SUMMARY:");
  console.log(`    Title:     ${d.title}`);
  console.log(`    Subtitle:  ${d.subtitle}`);
  console.log(`    Events:    ${Array.isArray(d.events) ? d.events.length : "?"}`);
  console.log(`    Sages:     ${Array.isArray(d.sages) ? d.sages.length : "?"}`);
  console.log(`    Trivia:    ${Array.isArray(d.eventTrivia) ? d.eventTrivia.length : "?"}`);
  console.log(`    Resources: ${typeof d.initialResources === "object" ? Object.keys(d.initialResources as object).join(", ") : "?"}`);
  console.log(`    Route:     ${Array.isArray(d.route) ? (d.route as Record<string, unknown>[]).map(n => n.id).join(" → ") : "?"}`);
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
