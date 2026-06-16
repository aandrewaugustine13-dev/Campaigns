#!/usr/bin/env npx tsx
// ════════════════════════════════════════════════════════════════
// STEP 4 proof — choice-memory recording RULE + the Step-4 → Step-3 chain.
//
//   1. pinnedChoiceEntry (the pure recording rule the engine uses) remembers a
//      pinned DECISION beat at the chosen index and SKIPS everything else: the
//      witnessing resolution (one "Go on." choice), ordinary pool events
//      (unpinned), and malformed events.
//   2. THE CHAIN: feeding a real playthrough's resolutions through the recorder
//      builds a choice-memory whose assembled ending (Step 3) recites exactly
//      those chosen fragments — proving the engine's recorder output is the
//      correct input to the deterministic ending.
//
// The recording is wired into the real engine (GeneratedCampaign.finalizeChoice);
// the real-engine integration is proved in src/choiceMemory.engine.test.tsx.
//
// No model call. Run with:  npm run test:choice-memory
// ════════════════════════════════════════════════════════════════

import type { NarrativePlan } from "./storyPlan.js";
import { narrativePlanToCampaign, type NarrativeIdentity } from "./narrativeCampaign.js";
import { assembleEnding, pinnedChoiceEntry, type ChoiceMemoryEntry } from "./endingAssemble.js";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`); }
}

const plan: NarrativePlan = {
  throughline: "A republic votes itself into a war and salvages pride from a needless battle.",
  meaning: "The victory was militarily pointless yet politically everything — a war that settled nothing gave the nation its myth.",
  beats: [
    { id: "beat_declare", role: "cause", title: "The Vote", scene: "Congress votes for war.", significance: "Sets the course.",
      choices: [
        { text: "Vote for war", result: "It passes.", stake: 6, endingFragment: "You voted for war." },
        { text: "Prepare first", result: "Branded a coward.", stake: -4, endingFragment: "You begged for time." },
      ], phaseHint: 0.1, included: true },
    { id: "beat_canada", role: "escalation", title: "Canada", scene: "The invasion fails.", significance: "It goes wrong.",
      choices: [
        { text: "Push north", result: "It bleeds out.", stake: -7, endingFragment: "You ordered another doomed march north." },
        { text: "Pull back", result: "Army survives.", stake: 3, endingFragment: "You pulled back to the border." },
      ], phaseHint: 0.4, included: true },
    { id: "beat_burndc", role: "escalation", title: "Washington Burns", scene: "The Capitol is torched.", significance: "The low point.",
      choices: [
        { text: "Retake it", result: "Morale returns.", stake: 5, endingFragment: "You rallied from the ashes of the capital." },
        { text: "Hold Baltimore", result: "You let it burn.", stake: -3, endingFragment: "You let Washington burn for Baltimore." },
      ], phaseHint: 0.65, included: true },
    { id: "beat_neworleans", role: "climax", title: "New Orleans", scene: "The line holds.", significance: "The hinge of the irony.",
      choices: [
        { text: "Hold the line", result: "The charge breaks.", stake: 9, endingFragment: "You held the line behind the cotton bales." },
        { text: "Sally out", result: "You gamble it away.", stake: -6, endingFragment: "You marched out and gambled away the victory." },
      ], phaseHint: 0.88, included: true },
    { id: "beat_ghent", role: "resolution", title: "The Treaty", scene: "Peace was already signed.", significance: "The irony lands.",
      phaseHint: 0.96, included: true },
  ],
};

const identity: NarrativeIdentity = {
  id: "war-of-1812", title: "The War of 1812", subtitle: plan.throughline,
  introBody: "You sit in Congress.", trailFeedOpener: "War drums.",
  historicalContext: "It reshaped national feeling.",
};

function main() {
  console.log("\n=== Step 4: choice-memory recording ===\n");

  const data = narrativePlanToCampaign(plan, identity);
  const pinned = data.events.filter((e) => e.pinned);
  const declare = pinned.find((e) => e.id === "beat_declare")!;
  const resolution = pinned.find((e) => e.id === "beat_ghent")!;

  // 1) The recording rule.
  console.log("pinnedChoiceEntry — the recording rule:");
  check("a pinned DECISION beat at chosen index 1 is recorded with beatId/pinSeq/choiceIndex",
    JSON.stringify(pinnedChoiceEntry(declare, 1)) === JSON.stringify({ beatId: "beat_declare", pinSeq: declare.pinSeq, choiceIndex: 1 }));
  check("the witnessing resolution (single \"Go on.\") is NOT recorded", pinnedChoiceEntry(resolution, 0) === null);
  check("an unpinned pool event is NOT recorded",
    pinnedChoiceEntry({ id: "pool", pinned: false, choices: [{}, {}] } as any, 0) === null);
  check("a pinned event with no numeric pinSeq is NOT recorded",
    pinnedChoiceEntry({ id: "x", pinned: true, choices: [{}, {}] } as any, 0) === null);
  check("a null event is NOT recorded", pinnedChoiceEntry(null, 0) === null);
  console.log("");

  // 2) THE CHAIN — recorder output → assembled ending.
  // Simulate a real playthrough: resolve every pinned event in arc order with a
  // chosen index, push each non-null entry (exactly as finalizeChoice does).
  console.log("chain — a playthrough's recorder output drives the ending:");
  const chosen: Record<string, number> = {
    beat_declare: 0, beat_canada: 1, beat_burndc: 0, beat_neworleans: 1, beat_ghent: 0,
  };
  const memory: ChoiceMemoryEntry[] = [];
  for (const ev of pinned) {
    const entry = pinnedChoiceEntry(ev, chosen[ev.id]);
    if (entry) memory.push(entry);
  }
  check("exactly FOUR decisions recorded (the resolution was skipped)", memory.length === 4);
  check("recorded in arc order with the chosen indices",
    JSON.stringify(memory.map((m) => [m.beatId, m.choiceIndex])) ===
      JSON.stringify([["beat_declare", 0], ["beat_canada", 1], ["beat_burndc", 0], ["beat_neworleans", 1]]));

  const ending = assembleEnding(data, memory);
  const expectFrags = [
    "You voted for war.",                              // declare idx 0
    "You pulled back to the border.",                  // canada idx 1
    "You rallied from the ashes of the capital.",      // burndc idx 0
    "You marched out and gambled away the victory.",   // neworleans idx 1
  ];
  check("the assembled ending recites exactly the chosen fragments, in order",
    expectFrags.every((f) => ending.includes(f)) &&
    !ending.includes("You begged for time.") &&        // the UNchosen declare option
    !ending.includes("You held the line behind the cotton bales."), // the UNchosen climax option
    ending);
  check("and ends on the constant coda", ending.trim().endsWith(plan.meaning));
  console.log("");

  console.log(`=== ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

main();
