#!/usr/bin/env npx tsx
// Throwaway inspector for Stage 1. Prints the generated economy JSON to
// stdout and diagnostics to stderr, so you can compare standards directly:
//   npm run economy -- "TEKS ... Lewis and Clark"
//   npm run economy -- "TEKS ... Erie Canal"
// or pipe a clean JSON file:  npm run economy -- "..." > erie.json
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { generateEconomy } from "./economy.js";

const __root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(__root, ".env.local") });

const DEFAULT_STANDARD =
  "TEKS 5.1(A), 5.1(B) — Historical significance of the Lewis and Clark Expedition, its role in westward expansion, and its interactions with Native peoples";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY not set. Put it in .env.local or export it.");
    process.exit(1);
  }

  const standard = process.argv.slice(2).join(" ").trim() || DEFAULT_STANDARD;

  console.error(`\n→ Generating economy for standard:\n  ${standard}\n`);

  const { data, findings } = await generateEconomy(standard, apiKey);

  console.log(JSON.stringify(data, null, 2));

  if (findings.length > 0) {
    console.error("\nValidation findings:");
    for (const f of findings) {
      console.error(`  ${f.level === "error" ? "✗" : "⚠"} [${f.field}] ${f.message}`);
    }
    if (findings.some((f) => f.level === "error")) process.exit(2);
  } else {
    console.error("\n✓ Economy passed validation.");
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
