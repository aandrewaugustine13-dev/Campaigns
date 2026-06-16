#!/usr/bin/env npx tsx
// ════════════════════════════════════════════════════════════════
// PRODUCT 2 generation CLI — the first end-to-end run of the WHOLE narrative
// pipeline on a real topic: storyPlan (+ endingFragments) → quiz (beats+standard)
// → factGate → compile → CampaignData. Mirrors generate.ts.
//
// CRITICAL: it prints the FACT-GATE VERDICT to stdout — fired / status / cycles /
// any keyed-answer rejection — so the "did the gate actually fire on a real
// generation" question is answered FROM THE TERMINAL, before opening the app.
//
// Writes generator/narrative-output.json (imported by App.tsx for play).
// Run with:  npm run generate:narrative
// ════════════════════════════════════════════════════════════════
import { config as loadEnv } from "dotenv";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { validate, printReport } from "./validate.js";
import { generateNarrativeCampaign, type NarrativeInputs } from "./narrativeCampaign.js";

const __root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(__root, ".env.local") });
const __dirname = dirname(fileURLToPath(import.meta.url));

// WILDCARD topic — non-American, never used to tune anything, so this run also
// tests whether the generator GENERALIZES rather than replaying a known case.
const INPUTS: NarrativeInputs = {
  topic: "The Meiji Restoration",
  standard: "TEKS WH.10 — Japan's Meiji Restoration and rapid modernization (1868–1912): the fall of the shogunate, the abolition of the samurai class, and the costs and gains of becoming a modern industrial power",
  perspective: "a young samurai caught between loyalty to the old order and the pull of the new Japan",
  grade: "6th grade",
  numQuestions: 6,
};

function hr() { console.log("─".repeat(60)); }

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Error: ANTHROPIC_API_KEY environment variable not set.");
    console.error("Set it in .env.local or export it: export ANTHROPIC_API_KEY=sk-...");
    process.exit(1);
  }

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║      NARRATIVE (PRODUCT 2) GENERATOR — full pipeline ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");
  console.log(`  Topic:       ${INPUTS.topic}`);
  console.log(`  Standard:    ${INPUTS.standard}`);
  console.log(`  Perspective: ${INPUTS.perspective}`);
  console.log(`  Grade:       ${INPUTS.grade}`);
  console.log(`  Questions:   ${INPUTS.numQuestions}`);
  console.log("\n  Running plan → quiz → factGate (real model calls; 60-180s)...\n");

  const t0 = Date.now();
  const { data, plan, quiz, factGate } = await generateNarrativeCampaign(apiKey, INPUTS);
  console.log(`  Pipeline completed in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  // ── Write the JSON the app loads ──
  const outPath = resolve(__dirname, "narrative-output.json");
  writeFileSync(outPath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`  Saved: ${outPath}\n`);

  // ── Structural validation ──
  printReport(validate(data));

  // ── THE FACT-GATE VERDICT (hard requirement: answered from the terminal) ──
  hr();
  console.log("  FACT GATE — the anti-misinformation backbone");
  hr();
  if (!factGate) {
    console.log("  ⚠ factGate did NOT run (disabled).");
  } else {
    console.log(`  status:       ${factGate.status.toUpperCase()}`);
    console.log(`  flagged:      ${factGate.flagged} claim(s) on first check`);
    console.log(`  cycles:       ${factGate.cycles} correction cycle(s)`);
    console.log(`  ops applied:  ${factGate.opsApplied}   dropped: ${factGate.opsDropped}`);
    console.log(`  residual:     ${factGate.residual.length} claim(s) after the final verify`);
    if (factGate.residual.length) {
      for (const r of factGate.residual)
        console.log(`     • [${r.quizKeyed ? "QUIZ-KEYED" : r.kind}] "${r.quote.slice(0, 100)}" — ${r.why}`);
    }
    const verdict =
      factGate.status === "clean" ? "✓ FIRED and passed CLEAN — no fabrication found"
      : factGate.status === "shipped-with-warnings" ? "✓ FIRED — corrected/shipped with warnings (non-keyed residuals)"
      : factGate.status === "rejected-keyed-answer" ? "✗ FIRED and HARD-REJECTED — a fabricated KEYED quiz answer (a kid would be graded on it)"
      : factGate.status === "rejected-structural" ? "✗ FIRED and rejected — structural"
      : "⚠ gate errored — campaign shipped UNCHECKED";
    console.log(`\n  VERDICT: ${verdict}`);
  }
  hr();

  // ── Content summary so the fragments/quiz can be read from the terminal ──
  const pinned = data.events.filter((e) => e.pinned);
  const decisions = pinned.filter((e) => (e.choices?.length ?? 0) >= 2);
  console.log("\n  CONTENT SUMMARY:");
  console.log(`    Title:        ${data.title}`);
  console.log(`    Subtitle:     ${data.subtitle}`);
  console.log(`    Pinned beats: ${pinned.length} (${decisions.length} decision + ${pinned.length - decisions.length} witnessing)`);
  console.log(`    Quiz:         ${quiz.questions.length} questions; reviewSummary ${quiz.reviewSummary.length} chars\n`);

  console.log("  ── THE ENDING FRAGMENTS (per option, per decision beat) ──");
  for (const e of decisions) {
    console.log(`\n  ▸ [${e.pinSeq}] ${e.title}`);
    for (const c of e.choices ?? [])
      console.log(`      • "${c.text}"\n         ↳ ${c.endingFragment ?? "(none)"}`);
  }
  console.log(`\n  ── THE CONSTANT CODA ──\n  ${data.endingFrame?.coda ?? data.storyMeaning}\n`);

  console.log("  ── THE QUIZ ──");
  for (const q of quiz.questions)
    console.log(`    • ${q.question}\n        ✓ ${q.choices[q.correctIndex]}   [${q.choices.join(" | ")}]`);
  console.log();

  void plan;
  if (validate(data).failed > 0) process.exit(2);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
