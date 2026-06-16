#!/usr/bin/env npx tsx
// ════════════════════════════════════════════════════════════════
// STEP 5 proof — the "ending-recites-choices" eval dimension.
//
// The scorekeeper that catches fragment-DROP on real generations across topics.
//   1. n/a-PASS for a non-narrative product (like timeline-coherence for systems).
//   2. PASS for a well-formed narrative campaign (every option has a fragment;
//      two vectors differ in the slots and share the coda).
//   3. FAIL when a single decision-beat option's endingFragment is DROPPED.
//   4. FAIL when the constant coda is missing.
//   5. FAIL when the ending is not responsive (two vectors → the same ending).
//
// No model call. Run with:  npm run test:ending-dimension
// ════════════════════════════════════════════════════════════════

import type { NarrativePlan } from "./storyPlan.js";
import { narrativePlanToCampaign, type NarrativeIdentity } from "./narrativeCampaign.js";
import { checkEndingRecitesChoices } from "./endingDimension.js";

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
      ], phaseHint: 0.15, included: true },
    { id: "beat_neworleans", role: "climax", title: "New Orleans", scene: "The line holds.", significance: "The hinge of the irony.",
      choices: [
        { text: "Hold the line", result: "The charge breaks.", stake: 9, endingFragment: "You held the line behind the cotton bales." },
        { text: "Sally out", result: "You gamble it away.", stake: -6, endingFragment: "You marched out and gambled away the victory." },
      ], phaseHint: 0.85, included: true },
    { id: "beat_ghent", role: "resolution", title: "The Treaty", scene: "Peace was already signed.", significance: "The irony lands.",
      phaseHint: 0.96, included: true },
  ],
};

const identity: NarrativeIdentity = {
  id: "war-of-1812", title: "The War of 1812", subtitle: plan.throughline,
  introBody: "You sit in Congress.", trailFeedOpener: "War drums.", historicalContext: "It reshaped national feeling.",
};

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

function main() {
  console.log("\n=== Step 5: ending-recites-choices dimension ===\n");

  const good = narrativePlanToCampaign(plan, identity);

  // 1) n/a-pass for non-narrative.
  console.log("n/a for non-narrative:");
  const systems = { productType: "systems", events: good.events, storyMeaning: good.storyMeaning };
  const na = checkEndingRecitesChoices(systems);
  check("a non-narrative product is n/a-pass", na.status === "pass" && na.detail.startsWith("n/a"));
  console.log("");

  // 2) Pass for a well-formed narrative campaign.
  console.log("well-formed narrative:");
  const ok = checkEndingRecitesChoices(good);
  check("passes with a recitation detail", ok.status === "pass" && /recites 2 chosen fragment/.test(ok.detail), ok.detail);
  console.log("");

  // 3) Fail on a DROPPED fragment.
  console.log("fragment-drop detector:");
  const dropped = clone(good);
  const beat = dropped.events.find((e: any) => e.id === "beat_neworleans")!;
  (beat.choices![0] as any).endingFragment = "";
  const dr = checkEndingRecitesChoices(dropped);
  check("a dropped endingFragment FAILS", dr.status === "fail" && /missing an endingFragment/.test(dr.detail), dr.detail);
  console.log("");

  // 4) Fail when the coda is missing.
  console.log("missing coda:");
  const noCoda = clone(good);
  delete (noCoda as any).endingFrame;
  delete (noCoda as any).storyMeaning;
  const nc = checkEndingRecitesChoices(noCoda);
  // With endingFrame removed AND storyMeaning removed, it's no longer flagged as
  // narrative — so it must still be detected via productType.
  (noCoda as any).productType = "narrative";
  const nc2 = checkEndingRecitesChoices(noCoda);
  check("a narrative campaign with no coda FAILS", nc2.status === "fail" && /coda/.test(nc2.detail), nc2.detail);
  void nc;
  console.log("");

  // 5) Fail when not responsive (two options share a fragment ⇒ same ending).
  console.log("responsiveness:");
  const flat = clone(good);
  // Make EVERY decision beat's two options recite the SAME fragment, so vector A
  // and vector B assemble to an identical ending.
  for (const e of flat.events) {
    if (e.pinned && (e.choices?.length ?? 0) >= 2) {
      const f = (e.choices![0] as any).endingFragment;
      for (const c of e.choices!) (c as any).endingFragment = f;
    }
  }
  const fr = checkEndingRecitesChoices(flat);
  check("an ending that does not vary with choices FAILS", fr.status === "fail" && /not responsive/.test(fr.detail), fr.detail);
  console.log("");

  console.log(`=== ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

main();
