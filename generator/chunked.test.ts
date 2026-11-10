#!/usr/bin/env npx tsx
// Pure checks for the chunked generator. No network. Run:
//   npx tsx generator/chunked.test.ts
import type { GameEvent } from "./schema.js";
import type { GenerateInputs } from "./core.js";
import {
  applyLockedResources,
  assembleCampaign,
  assignFactsToBatches,
  EVENT_BATCH_SIZE,
  lockedResourceSpecs,
  normalizeSkeleton,
  routePriorErrors,
  splitEventBatches,
  triviaTargetCount,
  toResourceKey,
  type CampaignSkeleton,
} from "./chunked.js";

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok || !detail ? "" : `\n      ${detail}`}`);
  if (!ok) failed++;
};

const baseInputs: GenerateInputs = {
  topic: "Erie Canal",
  standard: "TEKS 4.6A",
  grade: "4",
  length: 3,
  numQuestions: 2,
  numSages: 2,
  difficulty: "medium",
};

console.log("\n=== chunked generator: structure ===\n");

{
  const used = new Set<string>();
  check("camelCase key from a resource name", toResourceKey("Federal funding", used) === "federalFunding");
  check("second key does not collide", toResourceKey("Federal funding", used) === "federalFunding2");
}

{
  const inputs: GenerateInputs = {
    ...baseInputs,
    personalEconomy: {
      campaignType: "character",
      premise: "Cash in a pocket.",
      primaryResource: "The larder",
      resources: [
        { name: "Cash on hand", playerFacing: "Cash", description: "", startsAt: "low", raisedBy: "", drainedBy: "", degradationEffect: "", isMoney: true },
        { name: "The larder", playerFacing: "Larder", description: "", startsAt: "moderate", raisedBy: "", drainedBy: "", degradationEffect: "" },
      ],
    },
  };
  const locked = lockedResourceSpecs(inputs);
  check("personal economy locks money and larder keys", !!locked && locked.map((r) => r.key).join(",") === "cashOnHand,theLarder");
  check("money is not primary", !!locked && locked[0].primary !== true && locked[1].primary === true);
  const skeleton = {
    initialResources: { cash_on_hand: 12, theLarder: 40 },
    resourceCaps: {},
    resourceLabels: {},
    primaryResourceKey: "cashOnHand",
    primaryResourceStart: 0,
    revenuePerUnit: 9,
    paces: [{ id: "steady", label: "Steady", desc: "", mpd: 10, fx: { cashOnHand: -1, invented: -2 } }],
  } as unknown as CampaignSkeleton;
  applyLockedResources(skeleton, locked);
  check("locked keys replace invented ones", Object.keys(skeleton.initialResources).join(",") === "cashOnHand,theLarder");
  check("fuzzy model magnitude is kept", skeleton.initialResources.cashOnHand === 12 && skeleton.initialResources.theLarder === 40);
  check("labels are the player-facing strings", skeleton.resourceLabels.theLarder === "Larder" && skeleton.resourceLabels.cashOnHand === "Cash");
  check("primary is the non-money resource", skeleton.primaryResourceKey === "theLarder");
  check("money campaign forces revenuePerUnit 0", skeleton.revenuePerUnit === 0);
  check("pace fx drops unknown keys", JSON.stringify(skeleton.paces?.[0].fx) === JSON.stringify({ cashOnHand: -1 }));
}

{
  const batches = splitEventBatches([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], EVENT_BATCH_SIZE);
  check("12 events split into 5/5/2", batches.map((b) => b.length).join(",") === "5,5,2");
  check("a short list is one batch", splitEventBatches([1, 2, 3, 4, 5]).length === 1);
  const facts = assignFactsToBatches(3, ["a", "b", "c", "d"]);
  check("facts round-robin across batches", facts.map((g) => g.join("")).join("|") === "ad|b|c");
}

{
  const routed = routePriorErrors([
    "events[1].choices: a choice writes nothing",
    "events→endgame.closer: no closing dilemma",
    "sages[0].question.teksRef: Missing teksRef",
    "eventTrivia[0].correctIndex: correctIndex out of range",
    "verdict.good: verdict.good must be a non-empty string",
    "reviewSummary: reviewSummary must be a non-empty string",
    "route: Route must contain a node with id \"start\"",
    "mysteryField: something else",
  ]);
  check("event errors reach the event stage", routed.events.some((e) => e.startsWith("events[1]")));
  check("endgame errors also reach the skeleton", routed.skeleton.some((e) => e.includes("endgame")) && routed.events.some((e) => e.includes("endgame")));
  check("sage, trivia, and closer errors stay on their stages",
    routed.sages.length === 2 && routed.trivia.length === 2 && routed.closers.length === 3);
  check("unmatched errors are not dropped", routed.events.some((e) => e.startsWith("mysteryField")));
}

{
  check("systems trivia count is the request", triviaTargetCount(baseInputs, { totalDays: 2920, daysPerTurn: 90 }) === 2);
  const character = triviaTargetCount(
    { ...baseInputs, faultLine: {} as GenerateInputs["faultLine"] },
    { totalDays: 2920, daysPerTurn: 90 },
  );
  check("character trivia grows with turn count and stays capped", character === 11);
}

{
  const skeleton = normalizeSkeleton({
    id: "erie",
    title: "The Ditch",
    subtitle: "Albany to Buffalo",
    introBody: "You are the commission.",
    trailFeedOpener: "The first shovel breaks ground.",
    progressionMode: "project",
    totalDays: 2920,
    daysPerTurn: 90,
    totalDistance: 363,
    distanceUnit: "miles",
    initialResources: { funding: 40 },
    resourceCaps: { funding: 100 },
    resourceLabels: { funding: "Funding" },
    primaryResourceKey: "funding",
    primaryResourceStart: 40,
    revenuePerUnit: 1,
    route: [{ id: "start", title: "Albany", description: "", edges: [{ to: "buffalo", tag: "FAST", label: "West" }] }],
    trailPath: [[0, 0], [10, 10]],
    trailStops: [{ id: "a", name: "A", pathIndex: 0, pct: 0, supply: true }, { id: "b", name: "B", pathIndex: 1, pct: 100, supply: false }],
    mapImage: "map.png",
    outfitConfig: { budget: 100, baseCrew: 1, baseHorses: 0, baseSupplies: 1, costs: { shovel: 2 }, wageCosts: {}, wageMorale: {}, herdOptions: [10] },
    pixelColors: { coat: "#000" },
    pixelFaces: {},
    paces: [{ id: "push", label: "Push", desc: "", mpd: 1, fx: {} }],
    eventSkeletons: [
      { id: "late", phase_min: 0.6, phase_max: 0.8, title: "Later", type: "standard" },
      { id: "early", phase_min: 0.1, phase_max: 0.3, title: "Early", type: "standard" },
      { id: "mid", phase_min: 0.4, phase_max: 0.5, title: "Mid", type: "push_luck" },
    ],
    sageSkeletons: [{ id: "clinton", name: "DeWitt Clinton", title: "Governor", threshold: 10 }],
    teachableFacts: ["The canal opened in 1825.", ""],
    historicalContext: "The canal opened and paid for itself.",
    storyMeaning: "Should be kept when no plan is locked.",
  }, baseInputs);
  check("project mode clears the fake trail", skeleton.progressionMode === "project" && skeleton.totalDistance === 0 && skeleton.paces?.length === 0 && skeleton.trailPath.length === 0);
  check("project route still has a terminal node", skeleton.route.some((n) => n.id === "start") && skeleton.route.some((n) => n.edges.length === 0));
  check("event skeletons sort by phase", skeleton.eventSkeletons.map((e) => e.id).join(",") === "early,mid,late");
  check("sage count is filled out to numSages", skeleton.sageSkeletons.length === 2 && skeleton.sageSkeletons[0].name === "DeWitt Clinton");
  check("blank teachable facts are dropped", skeleton.teachableFacts.length === 1);
  check("story meaning survives when no plan is locked", skeleton.storyMeaning === "Should be kept when no plan is locked.");

  const events = [
    { id: "late", phase_min: 0, phase_max: 1, title: "Later", text: "b", weight: 5, type: "standard", choices: [] },
    { id: "early", phase_min: 0, phase_max: 1, title: "Early", text: "a", weight: 5, type: "standard", choices: [] },
    { id: "mid", phase_min: 0, phase_max: 1, title: "Mid", text: "c", weight: 5, type: "push_luck", attempts: [] },
  ] as GameEvent[];
  const data = assembleCampaign(skeleton, events, [], [], {
    verdict: { good: "g", bad: "b", indifferent: "i" },
    reviewSummary: "recap",
  });
  check("assembly restores journey order", (data.events as GameEvent[]).map((e) => e.id).join(",") === "early,mid,late");
  check("assembly omits skeleton-only fields", !("eventSkeletons" in data) && !("teachableFacts" in data) && data.reviewSummary === "recap");
}

{
  let threw = false;
  try {
    normalizeSkeleton({
      id: "x", title: "t", subtitle: "s", introBody: "i", trailFeedOpener: "o", historicalContext: "h",
      totalDays: 10, daysPerTurn: 1, distanceUnit: "miles", mapImage: "m.png",
      initialResources: { food: 1 }, resourceCaps: { food: 2 }, resourceLabels: { food: "Food" },
      primaryResourceKey: "food", primaryResourceStart: 1, revenuePerUnit: 0,
      route: [{ id: "start", title: "Start", description: "", edges: [] }],
      trailPath: [[0, 0], [1, 1]],
      trailStops: [{ id: "a", name: "A", pathIndex: 0, pct: 0, supply: false }, { id: "b", name: "B", pathIndex: 1, pct: 100, supply: false }],
      outfitConfig: { budget: 0, baseCrew: 0, baseHorses: 0, baseSupplies: 0, costs: {}, wageCosts: {}, wageMorale: {} },
      paces: [{ id: "p", label: "P", desc: "", mpd: 1, fx: {} }],
      eventSkeletons: [{ id: "only", phase_min: 0, phase_max: 1, title: "Only", type: "standard" }],
    }, baseInputs);
  } catch (err) {
    threw = err instanceof Error && err.message.includes("expected 3");
  }
  check("wrong event-skeleton count is rejected", threw);
}

console.log(`\n=== ${failed === 0 ? "PASS" : "FAIL"} ===\n`);
if (failed > 0) process.exit(1);
