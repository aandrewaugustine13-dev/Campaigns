#!/usr/bin/env npx tsx
// ════════════════════════════════════════════════════════════════
// BRANCHING-STORY generator CLI — proves the callable module from the terminal.
//
// Calls generateBranchingStory(inputs) on a wildcard topic, prints the VALIDATION
// result (it ran on the LIVE generation — playable + any findings + attempt count,
// so a re-generate is visible, never a silent broken pass), the passage/ending
// counts, the estimated reading grade, and the full story to READ. Writes the
// validated story to a file. Mirrors the other generate CLIs.
//
//   npm run generate:branching ["Topic"] ["Standard"] ["must-cover note"]
// ════════════════════════════════════════════════════════════════
import { config as loadEnv } from "dotenv";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { generateBranchingStory, type BranchingInputs } from "./branchingStoryGen.js";
import { passageMap } from "./branchingStory.js";

const __root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(__root, ".env.local") });
const __dirname = dirname(fileURLToPath(import.meta.url));

// WILDCARD — structurally different from 1812 (war) / Reconstruction (post-war
// social) / suffrage (movement): an immigration gauntlet. Never used to tune.
const [argTopic, argStandard, argMustCover] = process.argv.slice(2);
const INPUTS: BranchingInputs = {
  topic: argTopic || "Ellis Island and the immigrant experience around 1900",
  standard: argStandard || "TEKS US.7 — immigration to the United States around 1900: the steamship voyage, processing and inspection at Ellis Island, and the immigrant experience adjusting to life in a new land",
  mustCover: argMustCover || "Show the Ellis Island medical inspection (the chalk marks on coats, the fear of being sent back across the ocean) and the struggle to learn English and find work in the new country.",
  // AUDIENCE dials (independent). In the app these thread from the gate; here they
  // default to the product posture: mature subject matter, plain/direct prose.
  contentMaturity: process.argv[5] || "mature",
  proseRegister: process.argv[6] || "direct",
};

function fkGrade(text: string): number {
  const sentences = (text.match(/[.!?]+/g) ?? []).length || 1;
  const words = text.split(/\s+/).filter(Boolean);
  const syll = words.reduce((n, w) => {
    const m = w.toLowerCase().replace(/[^a-z]/g, "").replace(/e$/, "").match(/[aeiouy]+/g);
    return n + Math.max(1, m ? m.length : 1);
  }, 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syll / Math.max(1, words.length)) - 15.59;
}
function wrap(s: string, w: number): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > w) { lines.push(line.trim()); line = word; }
    else line += " " + word;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error("Set ANTHROPIC_API_KEY in .env.local"); process.exit(1); }

  console.log("Generating ONE branching story via the module (validate + re-generate on failure)…\n");
  console.log(`  topic:     ${INPUTS.topic}`);
  console.log(`  standard:  ${INPUTS.standard}`);
  console.log(`  mustCover: ${INPUTS.mustCover}\n`);
  console.log("  (any per-attempt validation failures + re-generation print as [branching] …)\n");

  const result = await generateBranchingStory(INPUTS, apiKey);

  console.log("═".repeat(74));
  console.log(`  VALIDATION (ran on the LIVE generation): ${result.ok ? "✓ PLAYABLE" : "✗ NOT PLAYABLE"}`);
  console.log(`  attempts taken: ${result.attempts}`);
  if (result.validation.findings.length === 0) {
    console.log("  findings: none");
  } else {
    for (const f of result.validation.findings) console.log(`     ${f.level === "error" ? "✗" : "⚠"} [${f.code}] ${f.message}`);
  }
  console.log("═".repeat(74));

  if (!result.ok || !result.story) {
    console.error("\n  GENERATION FAILED after all attempts — NO story returned (a broken graph is never shipped).");
    process.exit(2);
  }

  const story = result.story;
  const outPath = resolve(__dirname, "branching-story-output.json");
  writeFileSync(outPath, JSON.stringify(story, null, 2), "utf-8");

  const byId = passageMap(story);
  const endings = story.passages.filter((p) => p.ending);
  const allText = story.passages.map((p) => p.text).join(" ");
  console.log(`  TITLE: ${story.title}`);
  console.log(`  protagonist: ${story.protagonist}`);
  console.log(`  passages: ${story.passages.length} | endings: ${endings.length} | start: ${story.start}`);
  console.log(`  est. reading grade (Flesch-Kincaid): ${fkGrade(allText).toFixed(1)}`);
  console.log(`  saved: ${outPath}`);
  console.log("═".repeat(74));
  console.log();

  // Print the whole story in reachable order, to READ.
  const order: string[] = [];
  const seen = new Set<string>();
  const queue = [story.start];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id); order.push(id);
    for (const c of byId.get(id)!.choices ?? []) queue.push(c.next);
  }
  for (const p of story.passages) if (!seen.has(p.id)) order.push(p.id);

  for (const id of order) {
    const p = byId.get(id)!;
    console.log(`┌─ ${id}${id === story.start ? "  (START)" : ""}${p.ending ? "  (ENDING)" : ""}`);
    for (const line of wrap(p.text, 70)) console.log(`│  ${line}`);
    if (p.choices?.length) {
      console.log("│");
      for (const c of p.choices) console.log(`│   → ${c.text}   [${c.next}]`);
    }
    console.log("");
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
