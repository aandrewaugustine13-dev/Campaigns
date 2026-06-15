#!/usr/bin/env npx tsx
// Throwaway inspector for the Stage-1 narrative plan. Prints the proposed
// plan JSON to stdout and diagnostics to stderr, so you can read the arc
// directly and compare subjects:
//   npm run storyplan -- "TEKS ... War of 1812"
//   npm run storyplan -- "Erie Canal" --type systems --mode project
// or pipe a clean JSON file:  npm run storyplan -- "..." > war1812-plan.json
//
// Flags (all optional): --type systems|character, --mode journey|project,
//   --perspective "<who>". Everything else joins into the subject/standard.
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { generateStoryPlan, type StoryPlanInputs } from "./storyPlanGen.js";

const __root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(__root, ".env.local") });

const DEFAULT_STANDARD =
  "TEKS 8.7 — The War of 1812: its causes, major events, and significance for American national identity";

// Pull recognized --flags out of argv; the remainder is the subject string.
function parseArgs(argv: string[]): { subject: string; inputs: StoryPlanInputs } {
  const inputs: StoryPlanInputs = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--type") { inputs.campaignType = argv[++i] as StoryPlanInputs["campaignType"]; }
    else if (a === "--mode") { inputs.progressionMode = argv[++i] as StoryPlanInputs["progressionMode"]; }
    else if (a === "--perspective") { inputs.perspective = argv[++i]; }
    else rest.push(a);
  }
  return { subject: rest.join(" ").trim(), inputs };
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Error: ANTHROPIC_API_KEY not set. Put it in .env.local or export it.");
    process.exit(1);
  }

  const { subject, inputs } = parseArgs(process.argv.slice(2));
  const standard = subject || DEFAULT_STANDARD;
  // Treat the subject as authoritative topic too (the inspector takes one string).
  if (!inputs.topic) inputs.topic = standard;

  console.error(`\n→ Authoring narrative plan for:\n  ${standard}`);
  if (inputs.campaignType || inputs.progressionMode || inputs.perspective)
    console.error(`  [${inputs.campaignType ?? "?"} / ${inputs.progressionMode ?? "?"}${inputs.perspective ? ` / ${inputs.perspective}` : ""}]`);
  console.error("");

  const { data, findings } = await generateStoryPlan(standard, apiKey, inputs);

  console.log(JSON.stringify(data, null, 2));

  // Human-readable arc summary to stderr (stdout stays clean JSON for piping).
  if (data && Array.isArray(data.beats)) {
    console.error("\nArc:");
    for (const b of data.beats) {
      const tag = b.included ? " " : "✗";
      console.error(`  ${tag} [${String(b.role).padEnd(11)}] ${b.title}`);
      console.error(`        ↳ ${b.significance}`);
    }
    console.error(`\nMeaning:\n  ${data.meaning}`);
  }

  if (findings.length > 0) {
    console.error("\nValidation findings:");
    for (const f of findings) {
      console.error(`  ${f.level === "error" ? "✗" : "⚠"} [${f.field}] ${f.message}`);
    }
    if (findings.some((f) => f.level === "error")) process.exit(2);
  } else {
    console.error("\n✓ Plan passed validation.");
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
