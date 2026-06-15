#!/usr/bin/env npx tsx
// ════════════════════════════════════════════════════════════════
// STEP 2 proof — the endingFragment authored field.
//
//   1. validateStoryPlan(plan, { requireEndingFragments: true }) REJECTS a
//      decision-beat choice with a missing/empty endingFragment, and ACCEPTS
//      one where every decision-beat choice carries it.
//   2. The systems path is unchanged: WITHOUT requireEndingFragments the same
//      fragment-less plan validates clean (the field is ignored).
//   3. storyPlanToCampaignPieces carries each authored endingFragment onto the
//      compiled choice AT THE RIGHT INDEX, verbatim; the resolution beat's
//      witnessing choice carries none.
//
// No model call. Run with:  npm run test:ending-fragment
// ════════════════════════════════════════════════════════════════

import { validateStoryPlan, type NarrativePlan } from "./storyPlan.js";
import { storyPlanToCampaignPieces } from "./storyPlanCompile.js";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`); }
}

// A small narrative plan WITH ending fragments on every decision-beat choice.
const planWith: NarrativePlan = {
  throughline: "A republic votes itself into a war and salvages pride from a needless battle.",
  meaning: "The victory was militarily pointless yet politically everything — it let a bruised nation feel it had won a war that settled nothing.",
  beats: [
    {
      id: "beat_declare", role: "cause", title: "The Vote for War",
      scene: "Congress votes for war against the strongest navy on earth.",
      significance: "It sets the unready nation on its course.",
      choices: [
        { text: "Vote for war now", result: "The declaration passes; the country is committed.", stake: 6,
          endingFragment: "You cast your vote for war, and a republic that was not ready marched anyway." },
        { text: "Push to prepare first", result: "You buy time but are branded a coward.", stake: -4,
          endingFragment: "You begged for time, and watched the War Hawks call your caution cowardice." },
      ],
      phaseHint: 0.1, included: true,
    },
    {
      id: "beat_neworleans", role: "climax", title: "The Battle of New Orleans",
      scene: "Behind cotton bales, the ragtag line shatters the British assault.",
      significance: "The lopsided victory the arc builds to — and the hinge of the irony.",
      choices: [
        { text: "Hold the line", result: "The charge breaks against your defenses.", stake: 9,
          endingFragment: "You held the line behind the cotton bales and broke the finest army in the world." },
        { text: "Sally out", result: "Glory beckons, but you trade your advantage away.", stake: -6,
          endingFragment: "You marched out to meet them in the open, and traded a sure victory for a gamble." },
        { text: "Negotiate withdrawal", result: "No legend is born, but no one dies for nothing.", stake: -2,
          endingFragment: "You let them withdraw without a fight, and no legend was ever born of that mercy." },
      ],
      phaseHint: 0.85, included: true,
    },
    {
      id: "beat_ghent", role: "resolution", title: "Word of the Treaty Arrives",
      scene: "The news crosses the Atlantic: peace was signed before the battle was fought.",
      significance: "The resolution that makes the irony land.",
      phaseHint: 0.96, included: true,
    },
  ],
};

// The SAME plan with the fragments stripped (systems-shaped choices).
const planWithout: NarrativePlan = {
  ...planWith,
  beats: planWith.beats.map((b) => ({
    ...b,
    choices: b.choices?.map(({ endingFragment, ...rest }) => rest),
  })),
};

function main() {
  console.log("\n=== Step 2: endingFragment authored field ===\n");

  // 1) Required for narrative.
  console.log("validator — narrative requires the fragment:");
  const withErrors = validateStoryPlan(planWith, { requireEndingFragments: true }).filter((f) => f.level === "error");
  check("a fully-authored plan passes with requireEndingFragments", withErrors.length === 0,
    withErrors.map((f) => `[${f.field}] ${f.message}`).join("; "));

  const withoutErrors = validateStoryPlan(planWithout, { requireEndingFragments: true }).filter((f) => f.level === "error");
  const fragFields = withoutErrors.filter((f) => f.field.includes("endingFragment"));
  check("a fragment-less plan is REJECTED, one error per decision-beat choice (2 + 3 = 5)",
    fragFields.length === 5, `got ${fragFields.length}: ${fragFields.map((f) => f.field).join(", ")}`);
  console.log("");

  // 2) Systems path unchanged — fragment ignored without the flag.
  console.log("validator — systems path ignores the field:");
  const sysErrors = validateStoryPlan(planWithout).filter((f) => f.level === "error");
  check("the SAME fragment-less plan validates clean WITHOUT requireEndingFragments", sysErrors.length === 0,
    sysErrors.map((f) => `[${f.field}] ${f.message}`).join("; "));
  console.log("");

  // 3) Compiler carries each fragment to the right index, verbatim.
  console.log("compiler — fragments ride onto the right choice index:");
  const { pinnedEvents } = storyPlanToCampaignPieces(planWith, { primaryResourceKey: "standing" });
  const declare = pinnedEvents.find((e) => e.id === "beat_declare")!;
  const climax = pinnedEvents.find((e) => e.id === "beat_neworleans")!;
  const resolution = pinnedEvents.find((e) => e.id === "beat_ghent")!;

  const climaxBeat = planWith.beats.find((b) => b.id === "beat_neworleans")!;
  check("every climax choice carries its authored fragment at the matching index, verbatim",
    (climax.choices ?? []).every((c, i) => c.endingFragment === climaxBeat.choices![i].endingFragment),
    (climax.choices ?? []).map((c, i) => `[${i}] ${c.endingFragment === climaxBeat.choices![i].endingFragment ? "ok" : "MISMATCH"}`).join(" "));
  check("the cause beat's two fragments are present and distinct",
    (declare.choices ?? []).length === 2 &&
    declare.choices![0].endingFragment !== declare.choices![1].endingFragment &&
    declare.choices!.every((c) => typeof c.endingFragment === "string" && c.endingFragment.length > 0));
  check("the resolution's witnessing choice carries NO fragment",
    (resolution.choices?.length ?? 0) === 1 && resolution.choices![0].endingFragment === undefined);
  console.log("");

  console.log(`=== ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

main();
