#!/usr/bin/env npx tsx
// ════════════════════════════════════════════════════════════════
// IMAGE-PIPELINE fixes — the three things that ARE testable (the images
// themselves are not; that is the whole point — a human judges those).
//
//   (b1) spine beats now CARRY a non-null imageSearchQuery (compiler).
//   (b2) enrichment is REACHABLE over pinned beats and is IDEMPOTENT — a scoped
//        re-pass selects the imageless pinned beats and skips already-imaged
//        events, so it can fill the spine without disturbing existing images.
//   (a)  the ERA GUARD rejects a planted modern-era hit for a pre-1840 campaign
//        and accepts a period one (detector-proves-the-cure, like factGate).
//
// No model call, no network. Run with:  npm run test:image-fixes
// ════════════════════════════════════════════════════════════════

import type { NarrativePlan } from "./storyPlan.js";
import { storyPlanToCampaignPieces } from "./storyPlanCompile.js";
import { selectEnrichTargets, eraInappropriate, inferEraMaxYear, latestYearIn } from "./wikimedia.js";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`); }
}

// ── (b1) compiler emits imageSearchQuery from the beat's imageQuery ──
const plan: NarrativePlan = {
  throughline: "A republic stumbles into a war and salvages pride from a needless battle.",
  meaning: "Militarily pointless, politically everything.",
  imageStyleKeyword: "engraving",
  beats: [
    { id: "beat_declare", role: "cause", title: "The Vote for War", scene: "Congress votes for war.",
      significance: "Sets the course.", imageQuery: "United States Congress 1812",
      choices: [
        { text: "Vote war", result: "Passes.", stake: 6, endingFragment: "You voted for war." },
        { text: "Wait", result: "Coward.", stake: -4, endingFragment: "You begged for time." },
      ], phaseHint: 0.1, included: true },
    { id: "beat_neworleans", role: "climax", title: "New Orleans", scene: "The line holds.",
      significance: "The hinge.", imageQuery: "Battle of New Orleans 1815",
      choices: [
        { text: "Hold", result: "Breaks.", stake: 9, endingFragment: "You held the line." },
        { text: "Sally", result: "Gamble.", stake: -6, endingFragment: "You marched out." },
      ], phaseHint: 0.85, included: true },
    { id: "beat_ghent", role: "resolution", title: "The Treaty", scene: "Peace was already signed.",
      significance: "Irony lands.", imageQuery: "Treaty of Ghent 1814 signing", phaseHint: 0.96, included: true },
  ],
};

function main() {
  console.log("\n=== Image-pipeline fixes ===\n");

  // (b1)
  console.log("(b1) spine beats carry a non-null imageSearchQuery:");
  const { pinnedEvents } = storyPlanToCampaignPieces(plan, { primaryResourceKey: "standing" });
  check("every pinned beat has a non-empty imageSearchQuery",
    pinnedEvents.every((e) => typeof e.imageSearchQuery === "string" && e.imageSearchQuery.trim().length > 0),
    pinnedEvents.map((e) => `${e.id}:${JSON.stringify(e.imageSearchQuery)}`).join(" "));
  check("the query is the beat's authored imageQuery, verbatim",
    pinnedEvents.find((e) => e.id === "beat_neworleans")?.imageSearchQuery === "Battle of New Orleans 1815");
  console.log("");

  // (b2) enrichment reachability + idempotency over pinned beats.
  console.log("(b2) enrichment reaches pinned beats, not bypassed; idempotent:");
  const events = [
    { id: "pool_imaged", pinned: false, imageSearchQuery: "q", image: { thumbUrl: "X" } }, // already imaged
    { id: "pin0", pinned: true, pinSeq: 0, imageSearchQuery: "Battle of New Orleans 1815" }, // imageless pin
    { id: "pin1", pinned: true, pinSeq: 1, imageSearchQuery: "Treaty of Ghent 1814" },       // imageless pin
    { id: "pool_imageless", pinned: false, imageSearchQuery: "q2" },                          // non-pinned imageless
  ];
  const pinnedTargets = selectEnrichTargets(events, (e) => e.pinned === true);
  check("the scoped pass SELECTS both imageless pinned beats",
    pinnedTargets.length === 2 && pinnedTargets.every((t) => t.ev.pinned === true));
  check("it does NOT select the already-imaged event (idempotent — won't disturb it)",
    !pinnedTargets.some((t) => t.ev.id === "pool_imaged"));
  check("restrictTo=pinned does NOT select the non-pinned imageless pool event",
    !pinnedTargets.some((t) => t.ev.id === "pool_imageless"));
  // An UNRESTRICTED pass would still skip the already-imaged event (idempotency)
  // and reach every imageless one.
  const allTargets = selectEnrichTargets(events);
  check("an unrestricted pass reaches all 3 imageless events and skips the imaged one",
    allTargets.length === 3 && !allTargets.some((t) => t.ev.id === "pool_imaged"));
  console.log("");

  // (a) era guard.
  console.log("(a) era guard rejects modern hits for a pre-1840 campaign:");
  const era = 1815; // a War-of-1812 campaign
  check("REJECTS the USS New Jersey sailor (the actual cowboy-class miss)",
    eraInappropriate("Tattooed sailor aboard the USS New Jersey", null, era) === true);
  check("REJECTS an explicit WWII / 1943 hit",
    eraInappropriate("World War II soldiers 1943", null, era) === true);
  check("REJECTS by CREATION DATE when the title is clean but the photo is modern",
    eraInappropriate("A reproduction painting", 1955, era) === true);
  check("ACCEPTS a period-appropriate hit",
    eraInappropriate("Battle of New Orleans 1815 engraving", 1815, era) === false);
  check("ACCEPTS a period work made a little later (within margin)",
    eraInappropriate("Burning of Washington", 1830, era) === false);
  console.log("  guard inactive for post-photography / unknown era:");
  check("a 1943 hit is FINE for a 1944 (WWII) campaign", eraInappropriate("World War II 1943", 1943, 1944) === false);
  check("guard OFF when era is unknown (null)", eraInappropriate("USS New Jersey", null, null) === false);
  console.log("");

  // inferEraMaxYear / latestYearIn sanity.
  console.log("era inference:");
  check("latestYearIn picks the max year", latestYearIn("from 1812 to 1815 then 1814") === 1815);
  check("a War-of-1812 campaign infers a pre-1840 era",
    (inferEraMaxYear({ events: [{ imageSearchQuery: "Battle of New Orleans 1815" }] }, "The War of 1812") ?? 9999) < 1840);
  check("a topic with no year infers null (guard off)", inferEraMaxYear({ events: [] }, "The Silk Road") === null);
  console.log("");

  console.log(`=== ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

main();
