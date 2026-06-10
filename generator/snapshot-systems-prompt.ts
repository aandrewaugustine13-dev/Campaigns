#!/usr/bin/env npx tsx
// Throwaway proof harness for Stage 1: assembles the core.ts user prompt for
// a representative SYSTEMS campaign (fixtures/erie.json — frame + playerRole +
// cast + economy, and crucially NO faultLine) and writes it to the path given
// as the first CLI arg, printing its length + sha256. Run it before and after
// the faultLine wiring and diff the two files to prove the systems prompt is
// byte-identical.
//
//   npm run snapshot:prompt -- /tmp/before.txt
//   npm run snapshot:prompt -- /tmp/after.txt
//   diff /tmp/before.txt /tmp/after.txt
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { buildUserMessage, type GenerateInputs } from "./core.js";

const __root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const erie = JSON.parse(readFileSync(resolve(__root, "fixtures/erie.json"), "utf8"));

// Map the erie systems spec onto GenerateInputs. No faultLine — this is the
// systems path that must remain byte-identical.
const inputs: GenerateInputs = {
  topic: erie.topic,
  standard: erie.standard,
  grade: erie.grade,
  length: erie.length,
  numQuestions: erie.numQuestions,
  numSages: erie.numSages,
  difficulty: erie.difficulty,
  frame: erie.frame,
  playerRole: erie.playerRole,
  cast: erie.cast,
  economy: erie.economy,
};

const out = process.argv[2];
if (!out) {
  console.error("Usage: snapshot-systems-prompt.ts <output-path>");
  process.exit(1);
}

const prompt = buildUserMessage(inputs);
writeFileSync(out, prompt, "utf8");
const sha = createHash("sha256").update(prompt, "utf8").digest("hex");
console.log(`Wrote ${prompt.length} chars to ${out}`);
console.log(`sha256: ${sha}`);
