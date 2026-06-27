#!/usr/bin/env npx tsx
// Throwaway inspector for Stage 1. Prints the generated fault-line JSON to
// stdout and diagnostics to stderr, so you can eyeball the no-clean-answer
// property across standards:
//   npm run faultline -- "TEKS ... Reconstruction" "Joseph, a freedman in the Reconstruction South"
// or pipe a clean JSON file:  npm run faultline -- "..." "..." > joseph.json
//
// Takes TWO positional args (standard, perspective). It echoes back what it
// parsed for each — one line apiece — before the JSON, so you can confirm at
// a glance it read your inputs and didn't scramble the two.
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { generateFaultLine } from "./faultline.js";

const __root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(__root, ".env.local") });

const DEFAULT_STANDARD =
  "TEKS 8.9 — Reconstruction: the experience of freedpeople, the Black Codes, and the promise and collapse of federal protection in the postwar South";
const DEFAULT_PERSPECTIVE = "Joseph, a freedman in the Reconstruction South";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY not set. Put it in .env.local or export it.");
    process.exit(1);
  }

  const [standardArg, perspectiveArg] = process.argv.slice(2);
  const standard = (standardArg ?? "").trim() || DEFAULT_STANDARD;
  const perspective = (perspectiveArg ?? "").trim() || DEFAULT_PERSPECTIVE;

  // Echo the parsed inputs so a glance confirms the two args weren't scrambled.
  console.error(`\n→ Standard:    ${standard}`);
  console.error(`→ Perspective: ${perspective}\n`);

  const { data, findings } = await generateFaultLine(standard, perspective, apiKey);

  console.log(JSON.stringify(data, null, 2));

  if (findings.length > 0) {
    console.error("\nValidation findings:");
    for (const f of findings) {
      console.error(`  ${f.level === "error" ? "✗" : "⚠"} [${f.field}] ${f.message}`);
    }
    if (findings.some((f) => f.level === "error")) process.exit(2);
  } else {
    console.error("\n✓ Fault line passed validation.");
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
