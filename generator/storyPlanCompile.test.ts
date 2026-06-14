#!/usr/bin/env npx tsx
// ════════════════════════════════════════════════════════════════
// Stage 0 proof for storyPlanToCampaignPieces.
//
//   1. Feed it a VALIDATED War-of-1812 narrative plan and assert the
//      emitted pinned events carry the right shape: included-only,
//      pinSeq in arc order, monotonic non-overlapping windows in band,
//      content preserved VERBATIM, and storyMeaning == plan.meaning.
//   2. Assert an EXCLUDED beat is never compiled.
//   3. Assert character-mode band narrowing keeps every window off the
//      fault-line's reserved windows ([0,0.3] and [0.85,1.0]).
//   4. Wrap the pinned events in a minimal CampaignData and assert
//      validate() returns ZERO errors (the pieces are play-legal).
//
// No model call. Run with:  npm run test:storyplan
// ════════════════════════════════════════════════════════════════

import { validateStoryPlan, type NarrativePlan } from "./storyPlan.js";
import { storyPlanToCampaignPieces } from "./storyPlanCompile.js";
import { validate } from "./validate.js";

// ── tiny assert harness (matches faultlineCompile.test.ts) ────────
let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
  }
}

// ── The validated War-of-1812 plan (the New Orleans spec case) ─────
// Five beats; the fourth ("burn_dc" duplicate-feel escalation) is EXCLUDED to
// prove teacher opt-out is honored by the compiler.
const plan: NarrativePlan = {
  throughline:
    "A young republic stumbles into a war it cannot win, loses its capital, and salvages national pride from a battle that didn't need to happen.",
  meaning:
    "The Battle of New Orleans was militarily pointless — the Treaty of Ghent had already been signed in Europe weeks before — but it made Andrew Jackson a national icon and let a bruised, divided country feel like it had won, papering over a war that settled almost nothing.",
  beats: [
    {
      id: "beat_declare",
      role: "cause",
      title: "War Hawks Carry the Vote",
      scene:
        "In Congress, the War Hawks win. Impressment of American sailors and British arms in the Northwest have built to a breaking point, and the young republic votes for war against the strongest navy on earth.",
      significance:
        "It establishes WHY: the grievances and overconfidence that drag an unready nation into war set the stakes for everything that follows.",
      phaseHint: 0.1,
      included: true,
    },
    {
      id: "beat_canada",
      role: "escalation",
      title: "The Canadian Invasion Fails",
      scene:
        "The easy conquest of Canada collapses into retreat. Militias melt away at the border and the war that was supposed to be quick grinds into humiliation.",
      significance:
        "The first escalation: the war the nation expected to win cheaply is already going wrong, raising the cost of the choice made at the start.",
      phaseHint: 0.4,
      included: true,
    },
    {
      id: "beat_burndc",
      role: "escalation",
      title: "Washington Burns",
      scene:
        "British troops march into Washington and put the Capitol and the President's House to the torch. The government flees; the nation's pride burns with its buildings.",
      significance:
        "Stakes rise to the homeland itself — the lowest point, which makes the coming victory feel like redemption even when it changes nothing.",
      phaseHint: 0.6,
      included: true,
    },
    {
      id: "beat_baltimore",
      role: "escalation",
      title: "The Rockets Over Fort McHenry",
      scene:
        "At Baltimore the British bombardment fails and the flag still flies at dawn — the night that gives the nation its anthem.",
      significance:
        "A morale turn that could be cut without breaking the arc — included off by default to prove teacher opt-out.",
      phaseHint: 0.7,
      included: false,
    },
    {
      id: "beat_neworleans",
      role: "climax",
      title: "The Battle of New Orleans",
      scene:
        "Behind cotton bales and mud ramparts, Jackson's ragtag line shatters the British assault. It is the most lopsided American victory of the war.",
      significance:
        "The climax the whole arc builds to — and the hinge of the irony: a total victory in a battle that, unknown to anyone present, no longer mattered.",
      phaseHint: 0.88,
      included: true,
    },
    {
      id: "beat_ghent",
      role: "resolution",
      title: "Word of the Treaty Arrives",
      scene:
        "Weeks later, the news crosses the Atlantic: peace had been signed at Ghent before New Orleans was ever fought. The war was already over.",
      significance:
        "The resolution that makes the meaning land: the great victory was fought for nothing on paper — and yet it changed how the nation saw itself.",
      phaseHint: 0.96,
      included: true,
    },
  ],
};

// A minimal, validator-clean systems CampaignData carrying the pinned events.
function buildMinimalCampaign(pinned: ReturnType<typeof storyPlanToCampaignPieces>) {
  return {
    id: "sp-stage0",
    title: "Story-plan Stage 0",
    subtitle: "compiler output under test",
    introBody: "A minimal campaign that carries only the compiled pinned beats.",
    trailFeedOpener: "The war begins.",
    theme: "broadsheet-sepia",
    progressionMode: "project",
    totalDays: 36,
    daysPerTurn: 3,
    totalDistance: 0,
    distanceUnit: "",
    initialResources: { resolve: 60, supplies: 50 },
    resourceCaps: { resolve: 100, supplies: 100 },
    resourceLabels: { resolve: "Resolve", supplies: "Supplies" },
    paces: [],
    events: [
      ...pinned.pinnedEvents,
      // one ordinary pool event so the bank isn't all pins
      {
        id: "pool_skirmish",
        phase_min: 0.2,
        phase_max: 0.8,
        weight: 3,
        title: "A Border Skirmish",
        text: "Word comes of fighting along the frontier.",
        type: "standard",
        choices: [{ text: "Hold the line", effects: { resolve: 2 } }, { text: "Fall back", effects: { supplies: 2 } }],
      },
    ],
    sages: [
      {
        id: "stub_sage",
        name: "A Veteran",
        title: "Old Soldier",
        portrait: "",
        threshold: 999,
        bio: "Stub sage for validation.",
        greeting: "Sit a moment.",
        advice: "Know what a war is for before you fight it.",
        question: {
          question: "Where was the peace treaty signed?",
          choices: ["Ghent", "Paris"],
          correctIndex: 0,
          explanation: "The Treaty of Ghent ended the war.",
          teksRef: "TEKS 8.7",
        },
        reward: { correct: { resolve: 5 }, wrong: { supplies: 1 }, knowledgeCorrect: 5, knowledgeWrong: 1 },
      },
    ],
    route: [{ id: "start", title: "The Republic at War", description: "An unready nation.", edges: [] }],
    eventTrivia: [
      {
        id: "tq_neworleans",
        question: "Why was the Battle of New Orleans militarily moot?",
        choices: ["The treaty was already signed", "It was never fought"],
        correctIndex: 0,
        fact: "The Treaty of Ghent had been signed before the battle.",
      },
    ],
    trailPath: [],
    trailStops: [],
    mapImage: "none",
    outfitConfig: { budget: 0, costs: {}, herdOptions: [] },
    primaryResourceKey: "resolve",
    primaryResourceStart: 60,
    revenuePerUnit: 0,
    historicalContext: "The War of 1812 settled little but reshaped national feeling.",
    pixelColors: {},
    pixelFaces: {},
    storyMeaning: pinned.storyMeaning,
  };
}

// ════════════════════════════════════════════════════════════════
function main() {
  console.log("\n=== Stage 0: storyPlanToCampaignPieces ===\n");

  // 0) The input plan is itself VALID.
  const planFindings = validateStoryPlan(plan);
  const planErrors = planFindings.filter((f) => f.level === "error");
  console.log("Input narrative-plan validation:");
  check("plan has zero validation errors", planErrors.length === 0,
    planErrors.map((f) => `[${f.field}] ${f.message}`).join("; "));
  console.log("");

  const pieces = storyPlanToCampaignPieces(plan);
  const ev = pieces.pinnedEvents;

  // 1) Included-only, in arc order.
  console.log("pinnedEvents — inclusion & ordering:");
  check("5 included beats compile to 5 pinned events (the excluded one is dropped)", ev.length === 5);
  check("the excluded beat_baltimore is NOT present", !ev.some((e) => e.id === "beat_baltimore"));
  check("ids are the plan beat ids, in arc order",
    JSON.stringify(ev.map((e) => e.id)) ===
      JSON.stringify(["beat_declare", "beat_canada", "beat_burndc", "beat_neworleans", "beat_ghent"]));
  check("every event is pinned", ev.every((e) => e.pinned === true));
  check("pinSeq is 0..n-1 in order", JSON.stringify(ev.map((e) => e.pinSeq)) === JSON.stringify([0, 1, 2, 3, 4]));
  console.log("");

  // 2) Windows: monotonic, non-overlapping-by-min, inside the default band.
  console.log("pinnedEvents — phase windows:");
  check("every phase_min < phase_max", ev.every((e) => e.phase_min < e.phase_max));
  let monotonic = true;
  for (let i = 1; i < ev.length; i++) if (ev[i].phase_min <= ev[i - 1].phase_min) monotonic = false;
  check("phase_min strictly increases across the arc", monotonic,
    ev.map((e) => `${e.id}:[${e.phase_min},${e.phase_max}]`).join(" "));
  check("all windows inside the default band [0.05, 0.95]",
    ev.every((e) => e.phase_min >= 0.05 && e.phase_max <= 0.95));
  console.log("");

  // 3) Content preserved verbatim + playable.
  console.log("pinnedEvents — content fidelity:");
  const climax = ev.find((e) => e.id === "beat_neworleans")!;
  const climaxBeat = plan.beats.find((b) => b.id === "beat_neworleans")!;
  check("scene becomes event text verbatim", climax.text === climaxBeat.scene);
  check("significance preserved verbatim", climax.significance === climaxBeat.significance);
  check("title preserved verbatim", climax.title === climaxBeat.title);
  check("each pinned event is a playable standard event with a forward choice",
    ev.every((e) => e.type === "standard" && Array.isArray(e.choices) && e.choices.length >= 1));
  console.log("");

  // 4) storyMeaning carried verbatim.
  console.log("storyMeaning:");
  check("storyMeaning equals plan.meaning verbatim", pieces.storyMeaning === plan.meaning);
  console.log("");

  // 5) Character-mode band avoids the fault-line reserved windows.
  console.log("character-mode band narrowing:");
  const cmPieces = storyPlanToCampaignPieces(plan, { band: { min: 0.35, max: 0.82 } });
  check("all windows sit inside [0.35, 0.82] (off the setter [0,0.3] and tail [0.85,1.0])",
    cmPieces.pinnedEvents.every((e) => e.phase_min >= 0.35 && e.phase_max <= 0.82),
    cmPieces.pinnedEvents.map((e) => `[${e.phase_min},${e.phase_max}]`).join(" "));
  console.log("");

  // 6) A minimal CampaignData carrying the pieces validates clean.
  console.log("validate() on a minimal CampaignData carrying the pinned events:");
  const report = validate(buildMinimalCampaign(pieces));
  check("zero errors", report.failed === 0,
    report.findings.filter((f) => f.level === "error").map((f) => `[${f.field}] ${f.message}`).join("; "));
  console.log(`  (validate(): ${report.passed} checks passed, ${report.failed} errors, ${report.warnings} warnings)`);
  console.log("");

  console.log(`=== ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

main();
