#!/usr/bin/env npx tsx
// ════════════════════════════════════════════════════════════════
// STEP 3 proof — the deterministic, RESPONSIVE ending.
//
// This is the load-bearing proof, the analogue of the hard-pin fixture proof:
// it shows the assembled ending actually READS THE PLAYER'S CHOICES BACK rather
// than printing a constant.
//
//   1. assembleEnding is PURE/synchronous — it returns a string, takes no apiKey,
//      makes no call. (Responsiveness is pre-authored, assembled at run time.)
//   2. Two DIFFERENT choice-vectors over the same campaign produce endings that
//      DIFFER IN EVERY FRAGMENT SLOT and SHARE THE ONE CODA (== storyMeaning).
//   3. Each chosen fragment is recited VERBATIM in that vector's ending.
//   4. The recitation is in ARC (pinSeq) order regardless of the order the
//      memory was recorded in; a witnessing entry with no fragment is skipped.
//
// No model call. Run with:  npm run test:ending-assemble
// ════════════════════════════════════════════════════════════════

import { validateStoryPlan, type NarrativePlan } from "./storyPlan.js";
import { narrativePlanToCampaign, type NarrativeIdentity } from "./narrativeCampaign.js";
import { assembleEnding, type ChoiceMemoryEntry } from "./endingAssemble.js";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`); }
}

// The approved arc: FOUR deciding beats + ONE witnessing resolution, every
// decision-beat choice carrying a DISTINCT endingFragment.
const plan: NarrativePlan = {
  throughline: "A republic votes itself into a war it cannot win and salvages pride from a needless battle.",
  meaning: "The Battle of New Orleans was militarily pointless — the treaty was already signed — yet it made a national hero and let a bruised country feel it had won a war that settled nothing.",
  beats: [
    {
      id: "beat_declare", role: "cause", title: "The Vote for War",
      scene: "Congress votes for war against the strongest navy on earth.",
      significance: "It sets the unready nation on its course.",
      choices: [
        { text: "Vote for war now", result: "The declaration passes.", stake: 6,
          endingFragment: "You voted for war, and a republic that was not ready marched anyway." },
        { text: "Push to prepare first", result: "You buy time but are branded a coward.", stake: -4,
          endingFragment: "You begged for time, and watched them call your caution cowardice." },
      ],
      phaseHint: 0.1, included: true,
    },
    {
      id: "beat_canada", role: "escalation", title: "The Canadian Invasion",
      scene: "The easy conquest of Canada collapses into retreat.",
      significance: "The cheap war the nation expected is already going wrong.",
      choices: [
        { text: "Order another push north", result: "The second invasion bleeds out.", stake: -7,
          endingFragment: "You ordered another doomed march north, and buried more men in the snow." },
        { text: "Pull back and defend", result: "You save the army but cede the offensive.", stake: 3,
          endingFragment: "You pulled back to the border, trading glory for an army that survived." },
      ],
      phaseHint: 0.4, included: true,
    },
    {
      id: "beat_burndc", role: "escalation", title: "Washington Burns",
      scene: "British troops put the Capitol to the torch.",
      significance: "The lowest point — which makes the coming victory feel like redemption.",
      choices: [
        { text: "Rally to retake the capital", result: "Morale flickers back.", stake: 5,
          endingFragment: "You rallied a ragged militia from the ashes of the capital." },
        { text: "Protect Baltimore instead", result: "You abandon Washington's ashes.", stake: -3,
          endingFragment: "You let Washington burn and saved your strength for Baltimore." },
      ],
      phaseHint: 0.65, included: true,
    },
    {
      id: "beat_neworleans", role: "climax", title: "The Battle of New Orleans",
      scene: "Behind cotton bales, the ragtag line shatters the British assault.",
      significance: "The lopsided victory the arc builds to — and the hinge of the irony.",
      choices: [
        { text: "Hold the line", result: "The charge breaks against your defenses.", stake: 9,
          endingFragment: "You held the line behind the cotton bales and broke the finest army in the world." },
        { text: "Sally out", result: "You trade your advantage away.", stake: -6,
          endingFragment: "You marched out to meet them in the open and gambled away a certain victory." },
      ],
      phaseHint: 0.88, included: true,
    },
    {
      id: "beat_ghent", role: "resolution", title: "Word of the Treaty Arrives",
      scene: "Peace had been signed before the battle was ever fought.",
      significance: "The resolution that makes the irony land.",
      phaseHint: 0.96, included: true,
    },
  ],
};

const identity: NarrativeIdentity = {
  id: "war-of-1812", title: "The War of 1812", subtitle: plan.throughline,
  introBody: "You sit in the young republic's Congress as the drums of war begin.",
  trailFeedOpener: "The War Hawks are calling for blood.",
  historicalContext: "The war settled little on paper but reshaped how the nation saw itself.",
};

const DECISION_BEATS = ["beat_declare", "beat_canada", "beat_burndc", "beat_neworleans"] as const;

// Build a choice-memory picking option `idx` at every decision beat (pinSeq is
// the beat's index in the arc; the resolution is pinSeq 4, omitted from memory).
function vector(idx: number): ChoiceMemoryEntry[] {
  return DECISION_BEATS.map((beatId, pinSeq) => ({ beatId, pinSeq, choiceIndex: idx }));
}

function main() {
  console.log("\n=== Step 3: deterministic responsive ending ===\n");

  const planErrors = validateStoryPlan(plan, { requireEndingFragments: true }).filter((f) => f.level === "error");
  check("fixture plan is valid with ending fragments", planErrors.length === 0,
    planErrors.map((f) => `[${f.field}] ${f.message}`).join("; "));

  const data = narrativePlanToCampaign(plan, identity);
  check("campaign carries the constant coda (== storyMeaning == plan.meaning)",
    data.endingFrame?.coda === plan.meaning && data.storyMeaning === plan.meaning);
  console.log("");

  // 1) Pure / synchronous — no apiKey, returns a string, not a Promise.
  console.log("purity (no run-time model call):");
  const endingA = assembleEnding(data, vector(0));
  check("assembleEnding returns a string synchronously (not a Promise)",
    typeof endingA === "string" && !(endingA instanceof Promise));
  console.log("");

  const endingB = assembleEnding(data, vector(1));

  // 2) Verbatim read-back of each vector's chosen fragments.
  console.log("verbatim read-back of the player's own choices:");
  const fragsA = DECISION_BEATS.map((id) => plan.beats.find((b) => b.id === id)!.choices![0].endingFragment!);
  const fragsB = DECISION_BEATS.map((id) => plan.beats.find((b) => b.id === id)!.choices![1].endingFragment!);
  check("ending A recites all FOUR of vector-A's fragments verbatim", fragsA.every((f) => endingA.includes(f)),
    fragsA.filter((f) => !endingA.includes(f)).join(" | "));
  check("ending B recites all FOUR of vector-B's fragments verbatim", fragsB.every((f) => endingB.includes(f)));
  check("ending A contains NONE of vector-B's distinct fragments", fragsB.every((f) => !endingA.includes(f)));
  console.log("");

  // 3) THE PROOF: differ in every slot, share the one coda.
  console.log("responsive — differ in every slot, share the coda:");
  const partsA = endingA.split("\n\n");
  const partsB = endingB.split("\n\n");
  check("both endings have the same shape: 4 fragment slots + 1 coda = 5 parts",
    partsA.length === 5 && partsB.length === 5, `A=${partsA.length} B=${partsB.length}`);
  check("the two endings are DIFFERENT (responsive, not constant)", endingA !== endingB);
  const slotsDiffer = [0, 1, 2, 3].every((i) => partsA[i] !== partsB[i]);
  check("every one of the FOUR fragment slots differs between the vectors", slotsDiffer);
  check("the final CODA part is identical in both", partsA[4] === partsB[4]);
  check("that shared coda is the constant storyMeaning", partsA[4] === plan.meaning);
  console.log("");

  // 4) Arc-ordered regardless of record order; witnessing entry skipped.
  console.log("arc-ordered recitation; witnessing entry skipped:");
  const scrambled = [...vector(0)].reverse();
  // add the resolution (no fragment) to prove it's skipped, not rendered blank
  scrambled.push({ beatId: "beat_ghent", pinSeq: 4, choiceIndex: 0 });
  check("scrambled memory (+ a fragment-less resolution entry) assembles identically to the in-order vector",
    assembleEnding(data, scrambled) === endingA);
  const idxDeclare = endingA.indexOf(fragsA[0]);
  const idxClimax = endingA.indexOf(fragsA[3]);
  check("the cause fragment is recited BEFORE the climax fragment (arc order)",
    idxDeclare >= 0 && idxClimax >= 0 && idxDeclare < idxClimax);
  console.log("");

  console.log("──────── ending A (vector: index 0 everywhere) ────────");
  console.log(endingA);
  console.log("──────── ending B (vector: index 1 everywhere) ────────");
  console.log(endingB);
  console.log("───────────────────────────────────────────────────────\n");

  console.log(`=== ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

main();
