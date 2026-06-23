#!/usr/bin/env npx tsx
// ════════════════════════════════════════════════════════════════
// ONE-IMAGE SLICE PROOF (Gemini illustration lane).
//
// Generates ONE illustration for ONE passage (the opening of the proven Caleb /
// War of 1812 story), writes the PNG to open, and reports the EXACT prompt +
// time + bytes + estimated cost. Separate lane: uses GEMINI_API_KEY only and
// touches nothing in the Claude story-gen / factGate path. On failure it reports
// the fallback (text-only) — never throws into anything else.
//
//   npx tsx generator/gen-one-illustration.ts
// ════════════════════════════════════════════════════════════════
import { config as loadEnv } from "dotenv";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { generateIllustration } from "./imageGen.js";

const __root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(__root, ".env.local") });
const __dirname = dirname(fileURLToPath(import.meta.url));

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY not set in .env.local — add it (separate from ANTHROPIC_API_KEY) to run the slice.");
  process.exit(1);
}

const story = JSON.parse(readFileSync(resolve(__dirname, "branching-narrative-1812.json"), "utf8"));
const start = story.passages.find((p: any) => p.id === story.start);

(async () => {
  console.log(`Story:   ${story.title}`);
  console.log(`Passage [${start.id}]: ${start.text}\n`);

  const t0 = Date.now();
  const result = await generateIllustration({ topic: story.title, scene: start.text }, apiKey);
  const roundTrip = Date.now() - t0;

  if (!result) {
    console.error(`\nGeneration FAILED after ${roundTrip}ms — in the app this is the text-only fallback (no image, story still plays).`);
    process.exit(2);
  }

  const b64 = result.dataUrl.split(",")[1] ?? "";
  const ext = result.mimeType.includes("jpeg") ? "jpg" : "png";
  const outPath = resolve(__dirname, `illustration-caleb-start.${ext}`);
  writeFileSync(outPath, Buffer.from(b64, "base64"));

  console.log("=== EXACT PROMPT SENT ===\n" + result.prompt + "\n");
  console.log("=== RESULT ===");
  console.log(`model:    ${result.model}`);
  console.log(`time:     ${result.ms}ms generate (${roundTrip}ms round-trip)`);
  console.log(`size:     ~${(result.bytes / 1024).toFixed(0)} KB (${result.mimeType})`);
  console.log(`est cost: ~$0.039 / image (gemini-2.5-flash-image @ 1K — verify current pricing)`);
  console.log(`SAVED:    ${outPath}`);
  console.log(`\n→ Open that file and judge: (a) is it good enough for a kid, and`);
  console.log(`  (b) if it's wrong, is the wrongness OBVIOUS (catchable) or SUBTLE?`);
})();
