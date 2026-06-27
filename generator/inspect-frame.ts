#!/usr/bin/env npx tsx
// Throwaway inspector for Stage 1 frame. Prints the proposed frame JSON to
// stdout and diagnostics to stderr, so you can compare standards directly:
//   npm run frame -- "TEKS ... Erie Canal"
//   npm run frame -- "TEKS ... Lewis and Clark"
// or pipe a clean JSON file:  npm run frame -- "..." > erie-frame.json
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { generateFrame } from "./frame.js";

const __root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(__root, ".env.local") });

const DEFAULT_STANDARD =
  "TEKS 7.x — The Erie Canal and its role in the economic transformation of New York and the opening of westward trade";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY not set. Put it in .env.local or export it.");
    process.exit(1);
  }

  const standard = process.argv.slice(2).join(" ").trim() || DEFAULT_STANDARD;

  console.error(`\n→ Proposing frame for standard:\n  ${standard}\n`);

  const { data, findings } = await generateFrame(standard, apiKey);

  console.log(JSON.stringify(data, null, 2));

  if (findings.length > 0) {
    console.error("\nValidation findings:");
    for (const f of findings) {
      console.error(`  ${f.level === "error" ? "✗" : "⚠"} [${f.field}] ${f.message}`);
    }
    if (findings.some((f) => f.level === "error")) process.exit(2);
  } else {
    console.error("\n✓ Frame passed validation.");
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
