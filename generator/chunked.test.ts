#!/usr/bin/env npx tsx
// Pure checks for the chunked generator. No network. Run:
//   npx tsx generator/chunked.test.ts
import type { GameEvent } from "./schema.js";
import type { GenerateInputs } from "./core.js";
import { ARCHITECT_MODEL, NODE_WRITER_MODEL } from "./models.js";
import {
  applyLockedResources,
  assembleCampaign,
  assignFactsToBatches,
  EVENT_BATCH_SIZE,
  lockEvent,
  lockedResourceSpecs,
  normalizeCampaignDifficulty,
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
  check("architect and writer models are set", ARCHITECT_MODEL.trim().length > 0 && NODE_WRITER_MODEL.trim().length > 0);
  if (!process.env.CAMPAIGN_ARCHITECT_MODEL && !process.env.CAMPAIGN_NODE_WRITER_MODEL) {
    check("architect default is the repo Pro-class model", ARCHITECT_MODEL === "gemini-3.1-pro-preview");
    check("writer default is the repo Flash model", NODE_WRITER_MODEL === "gemini-3.5-flash");
    check("architect and writer defaults differ", ARCHITECT_MODEL !== NODE_WRITER_MODEL);
  }
}

function causalLinkHolds(events: { reads?: string[]; choices?: { mutates: { track: string }[] }[] }[]): boolean {
  const mutated = new Set<string>();
  for (let i = 0; i < events.length; i++) {
    const reads = events[i].reads ?? [];
    if (i > 0 && mutated.size > 0 && !reads.some((id) => mutated.has(id))) return false;
    for (const choice of events[i].choices ?? []) {
      for (const mutation of choice.mutates) mutated.add(mutation.track);
    }
  }
  return mutated.size > 0;
}

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
    theme: "frontier-leather",
  }, { ...baseInputs, lockedTheme: "broadsheet-sepia" });
  check("project mode clears the fake trail", skeleton.progressionMode === "project" && skeleton.totalDistance === 0 && skeleton.paces?.length === 0 && skeleton.trailPath.length === 0);
  check("project route still has a terminal node", skeleton.route.some((n) => n.id === "start") && skeleton.route.some((n) => n.edges.length === 0));
  check("event skeletons sort by phase", skeleton.eventSkeletons.map((e) => e.id).join(",") === "early,mid,late");
  check("sage count is filled out to numSages", skeleton.sageSkeletons.length === 2 && skeleton.sageSkeletons[0].name === "DeWitt Clinton");
  check("blank teachable facts are dropped", skeleton.teachableFacts.length === 1);
  check("story meaning survives when no plan is locked", skeleton.storyMeaning === "Should be kept when no plan is locked.");
  check("locked theme replaces the skeleton's theme", skeleton.theme === "broadsheet-sepia");
  check(
    "missing continuity anchors fall back to non-empty sentences",
    !!skeleton.continuityAnchors?.companionOrAdversary &&
      !!skeleton.continuityAnchors.signatureItemOrDocument &&
      !!skeleton.continuityAnchors.environmentalMotif &&
      skeleton.continuityAnchors.companionOrAdversary.includes("The Ditch"),
  );
  check(
    "missing campaign state falls back to compact tracks",
    skeleton.campaignState.tracks.length >= 2 &&
      skeleton.campaignState.tracks.length <= 4 &&
      skeleton.campaignState.tracks.some((track) => track.kind === "number" && track.id === "stakePressure") &&
      skeleton.campaignState.tracks.some((track) => track.kind === "tag" && track.id === "decisionTag"),
  );
  check("earliest event reads nothing", (skeleton.eventSkeletons[0].reads ?? []).length === 0);
  check(
    "later events declare reads",
    skeleton.eventSkeletons.slice(1).every((event) => (event.reads?.length ?? 0) > 0),
  );
  check(
    "standard events get two mutation stubs and push_luck gets none",
    skeleton.eventSkeletons.filter((event) => event.type === "standard").every((event) =>
      event.choices?.length === 2 && event.choices.every((choice) => choice.mutates.length > 0),
    ) && skeleton.eventSkeletons.filter((event) => event.type === "push_luck").every((event) => event.choices === undefined),
  );
  check("a later event reads a track an earlier choice mutates", causalLinkHolds(skeleton.eventSkeletons));

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
  check(
    "assembly omits skeleton-only fields",
    !("eventSkeletons" in data) &&
      !("teachableFacts" in data) &&
      !("continuityAnchors" in data) &&
      !("campaignState" in data) &&
      !("flags" in data) &&
      data.reviewSummary === "recap",
  );
}

{
  const kept = normalizeSkeleton({
    id: "erie",
    title: "The Ditch",
    subtitle: "Albany to Buffalo",
    introBody: "You are the commission.",
    trailFeedOpener: "The first shovel breaks ground.",
    progressionMode: "project",
    totalDays: 2920,
    daysPerTurn: 90,
    totalDistance: 0,
    distanceUnit: "",
    initialResources: { funding: 40 },
    resourceCaps: { funding: 100 },
    resourceLabels: { funding: "Funding" },
    primaryResourceKey: "funding",
    primaryResourceStart: 40,
    revenuePerUnit: 1,
    route: [{ id: "start", title: "Albany", description: "", edges: [] }],
    trailPath: [],
    trailStops: [],
    mapImage: "",
    outfitConfig: { budget: 100, baseCrew: 1, baseHorses: 0, baseSupplies: 1, costs: {}, wageCosts: {}, wageMorale: {}, herdOptions: [] },
    pixelColors: { coat: "#000" },
    pixelFaces: {},
    paces: [],
    eventSkeletons: [
      { id: "early", phase_min: 0.1, phase_max: 0.3, title: "Early", type: "standard" },
      { id: "mid", phase_min: 0.4, phase_max: 0.5, title: "Mid", type: "standard" },
      { id: "late", phase_min: 0.6, phase_max: 0.8, title: "Later", type: "standard" },
    ],
    sageSkeletons: [{ id: "clinton", name: "DeWitt Clinton", title: "Governor", threshold: 10 }],
    teachableFacts: ["The canal opened in 1825."],
    historicalContext: "The canal opened and paid for itself.",
    continuityAnchors: {
      companionOrAdversary: "DeWitt Clinton, the canal's political champion, is impatient and exacting.",
      signatureItemOrDocument: "A folded 1817 surveyor's chain-tally, ink-stained and soft at the creases.",
      environmentalMotif: "Mosquitoes and standing ditch-water hang over the towpath at dusk.",
    },
  }, baseInputs);
  check(
    "provided continuity anchors survive normalize",
    kept.continuityAnchors.companionOrAdversary.startsWith("DeWitt Clinton") &&
      kept.continuityAnchors.signatureItemOrDocument.includes("surveyor") &&
      kept.continuityAnchors.environmentalMotif.includes("Mosquitoes"),
  );
}

{
  const causal = normalizeSkeleton({
    id: "erie",
    title: "The Ditch",
    subtitle: "Albany to Buffalo",
    introBody: "You are the commission.",
    trailFeedOpener: "The first shovel breaks ground.",
    progressionMode: "project",
    totalDays: 2920,
    daysPerTurn: 90,
    totalDistance: 0,
    distanceUnit: "",
    initialResources: { funding: 40 },
    resourceCaps: { funding: 100 },
    resourceLabels: { funding: "Funding" },
    primaryResourceKey: "funding",
    primaryResourceStart: 40,
    revenuePerUnit: 1,
    route: [{ id: "start", title: "Albany", description: "", edges: [] }],
    trailPath: [],
    trailStops: [],
    mapImage: "",
    outfitConfig: { budget: 100, baseCrew: 1, baseHorses: 0, baseSupplies: 1, costs: {}, wageCosts: {}, wageMorale: {}, herdOptions: [] },
    pixelColors: { coat: "#000" },
    pixelFaces: {},
    paces: [],
    flags: [{ id: "family", type: "number" }],
    campaignState: {
      tracks: [
        { id: "factionTrust", kind: "number", start: 1, min: -3, max: 3 },
        { id: "Bad Id!", kind: "number", start: 0 },
        { id: "keyDecision", kind: "tag", start: "open" },
        { id: "note", kind: "tag", start: "the canal pays" },
        { id: "rippleFlag", kind: "number", start: 0, min: -8, max: 9 },
        { id: "extraTwo", kind: "tag", start: "dropped" },
      ],
    },
    eventSkeletons: [
      {
        id: "early", phase_min: 0.1, phase_max: 0.3, title: "Early", type: "standard",
        reads: ["factionTrust"],
        choices: [
          { id: "fundIt", mutates: [{ track: "factionTrust", delta: 2 }, { track: "nope", delta: 1 }] },
          { id: "hold", mutates: [{ track: "keyDecision", tag: "withheld" }, { track: "factionTrust", delta: 9 }] },
        ],
      },
      {
        id: "mid", phase_min: 0.4, phase_max: 0.5, title: "Mid", type: "push_luck",
        reads: ["factionTrust", "missing"],
        choices: [{ id: "dig", mutates: [{ track: "factionTrust", delta: 1 }] }],
      },
      { id: "late", phase_min: 0.6, phase_max: 0.8, title: "Later", type: "standard", reads: [], choices: [] },
    ],
    sageSkeletons: [{ id: "clinton", name: "DeWitt Clinton", title: "Governor", threshold: 10 }],
    teachableFacts: ["The canal opened in 1825."],
    historicalContext: "The canal opened and paid for itself.",
  }, baseInputs);
  const trust = causal.campaignState.tracks.find((track) => track.id === "factionTrust");
  const ripple = causal.campaignState.tracks.find((track) => track.id === "rippleFlag");
  const note = causal.campaignState.tracks.find((track) => track.id === "note");
  const early = causal.eventSkeletons[0];
  const mid = causal.eventSkeletons[1];
  const late = causal.eventSkeletons[2];
  const hold = early.choices?.[1].mutates ?? [];
  check(
    "provided tracks survive and prose or invalid ids are dropped",
    causal.campaignState.tracks.map((track) => track.id).join(",") === "factionTrust,keyDecision,note,rippleFlag" &&
      trust?.kind === "number" && trust.start === 1 &&
      note?.start === "unset" &&
      ripple?.min === -3 && ripple.max === 3 &&
      !("flags" in causal),
  );
  check("earliest reads are cleared even when the model set them", (early.reads ?? []).length === 0);
  check(
    "choice mutations keep known tracks and clamp deltas",
    early.choices?.[0].id === "fundIt" &&
      early.choices[0].mutates.length === 1 &&
      early.choices[0].mutates[0].delta === 2 &&
      hold.some((mutation) => mutation.track === "keyDecision" && mutation.tag === "withheld") &&
      hold.some((mutation) => mutation.track === "factionTrust" && mutation.delta === 2),
  );
  check(
    "push_luck keeps reads and drops choice stubs",
    mid.type === "push_luck" && mid.choices === undefined && mid.reads?.join(",") === "factionTrust",
  );
  check(
    "an empty later read is filled from an earlier mutation",
    (late.reads ?? []).includes("factionTrust") && late.choices?.length === 2 && causalLinkHolds(causal.eventSkeletons),
  );
  const locked = lockEvent(early, {
    reads: ["factionTrust"],
    campaignState: { tracks: [] },
    choices: [
      { text: "Fund the cut", effects: { funding: -1 }, result: "You spend political credit.", mutates: [{ track: "factionTrust", delta: 2 }] },
      { text: "Hold the money", effects: { funding: 1 }, result: "You keep the appropriation." },
    ],
  });
  const firstChoice = locked.choices?.[0] as { id?: string; mutates?: unknown } | undefined;
  check(
    "locked events keep stub ids and drop the writer plan",
    firstChoice?.id === "fundIt" && firstChoice.mutates === undefined && !("reads" in locked) && !("campaignState" in locked),
  );
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

{
  const sk = { id: "e1", phase_min: 0.2, phase_max: 0.4, title: "Ridge", type: "standard" as const };
  const long = "x".repeat(180);
  const ev = lockEvent(sk, {
    choices: [
      { text: "Scout the ridge", historicalInsight: `  ${long}  `, outcomes: [{ weight: 1, effects: { morale: 1 }, result: "You see the ford.", historicalInsight: "  You used high-ground reconnaissance before crossing.  " }] },
      { text: "Rush", historicalInsight: "   ", effects: { morale: -1 }, result: "You ride blind." },
    ],
  });
  const insight = ev.choices?.[0].outcomes?.[0].historicalInsight ?? "";
  check("historical insight is trimmed to 140 characters", (ev.choices?.[0].historicalInsight?.length ?? 999) <= 140 && insight === "You used high-ground reconnaissance before crossing.");
  check("blank historical insight is dropped", ev.choices?.[1].historicalInsight === undefined);
}

function shell(events: unknown[], resources: Record<string, number>, extra: Record<string, unknown> = {}) {
  return {
    initialResources: resources,
    resourceCaps: Object.fromEntries(Object.keys(resources).map((key) => [key, 100])),
    primaryResourceKey: "gold",
    totalDays: 8,
    daysPerTurn: 1,
    events,
    ...extra,
  };
}

function withLogs(run: () => void): string[] {
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(" "));
  };
  try { run(); } finally { console.log = orig; }
  return logs;
}

function rateAfter(line: string): number {
  const match = line.match(/→\s*(\d+)%/);
  return match ? Number(match[1]) : -1;
}

{
  const campaign = shell([
    {
      id: "road", phase_min: 0, phase_max: 0.8, weight: 5, type: "standard",
      choices: [{
        text: "Take the ridge",
        flagWrites: { family: -2 },
        outcomes: [
          { weight: 1, effects: { morale: -20, supplies: -20 }, result: "The ridge collapses." },
          { weight: 1, effects: { morale: -2, supplies: -2, renown: 4 }, result: "You read the ground." },
          { weight: 0, effects: { supplies: -25 }, result: "You turn back.", earlyEnd: true },
        ],
      }],
    },
    {
      id: "close", phase_min: 0.9, phase_max: 1, weight: 5, type: "standard",
      choices: [{ text: "Finish", effects: { morale: -9 }, result: "The last mile." }],
    },
  ], { morale: 50, supplies: 50, gold: 80, renown: 10 });
  const logs = withLogs(() => normalizeCampaignDifficulty(campaign));
  const line = logs.find((entry) => entry.startsWith("[difficulty]")) ?? "";
  const road = (campaign.events as { id: string; choices: { flagWrites: { family: number }; outcomes: { effects: Record<string, number>; earlyEnd?: boolean }[] }[] }[])[0];
  const close = (campaign.events as { id: string; choices: { effects: Record<string, number> }[] }[])[1];
  const post = rateAfter(line);
  check("punishing campaign logs a survival line", line.includes("random survival") && line.includes("high-competence"));
  check("punishing campaign lands in the 55–70 survival window", post >= 55 && post <= 70, line);
  check("negative deltas were eased", road.choices[0].outcomes[0].effects.morale > -20 && road.choices[0].outcomes[0].effects.morale < 0);
  check("positive deltas stay put", road.choices[0].outcomes[1].effects.renown === 4);
  check("earlyEnd penalties stay put", road.choices[0].outcomes[2].effects.supplies === -25);
  check("flag writes stay put", road.choices[0].flagWrites.family === -2);
  check("closing event penalties stay put", close.choices[0].effects.morale === -9);
}

{
  const campaign = shell([
    {
      id: "road", phase_min: 0, phase_max: 0.8, weight: 5, type: "standard",
      choices: [{ text: "Stroll", effects: { morale: -1, supplies: -1, renown: 3 }, result: "Quiet." }],
    },
    {
      id: "close", phase_min: 0.9, phase_max: 1, weight: 5, type: "standard",
      choices: [{ text: "Finish", effects: { morale: -4 }, result: "Done." }],
    },
  ], { morale: 90, supplies: 90, gold: 80, renown: 10 });
  const logs = withLogs(() => normalizeCampaignDifficulty(campaign));
  const line = logs.find((entry) => entry.startsWith("[difficulty]")) ?? "";
  const road = (campaign.events as { choices: { effects: Record<string, number> }[] }[])[0];
  const close = (campaign.events as { choices: { effects: Record<string, number> }[] }[])[1];
  check("cakewalk logs a harsher scalar", /scalar [1-9]/.test(line) && !line.includes("scalar 1.00"), line);
  check("cakewalk negatives grow", road.choices[0].effects.morale <= -2 && road.choices[0].effects.supplies <= -2);
  check("cakewalk positives stay put", road.choices[0].effects.renown === 3);
  check("cakewalk closing penalty stays put", close.choices[0].effects.morale === -4);
}

{
  const campaign = shell([
    {
      id: "road", phase_min: 0, phase_max: 0.8, weight: 5, type: "standard",
      choices: [{ text: "Spend", effects: { morale: -20 }, result: "Hard." }],
    },
  ], { morale: 30, supplies: 30, gold: 40 }, { flags: [{ id: "oath" }] });
  withLogs(() => normalizeCampaignDifficulty(campaign));
  const morale = (campaign.events as { choices: { effects: { morale: number } }[] }[])[0].choices[0].effects.morale;
  check("character-mode flags skip the scaler", morale === -20);
}

{
  const campaign = shell(
    Array.from({ length: 8 }, (_, i) => ({
      id: `e${i}`,
      phase_min: i / 8,
      phase_max: (i + 1) / 8,
      weight: 5,
      type: "standard",
      choices: [{
        text: "Press",
        outcomes: [
          { weight: 1, effects: { morale: -12, supplies: -8 }, result: "Bad." },
          { weight: 1, effects: { morale: -1 }, result: "Ok." },
        ],
      }],
    })),
    { morale: 40, supplies: 40, gold: 70 },
  );
  withLogs(() => normalizeCampaignDifficulty(JSON.parse(JSON.stringify(campaign))));
  const started = performance.now();
  withLogs(() => normalizeCampaignDifficulty(campaign));
  const elapsed = performance.now() - started;
  check("difficulty normalizer stays under 10ms", elapsed < 10, `${elapsed.toFixed(2)}ms`);
}

console.log(`\n=== ${failed === 0 ? "PASS" : "FAIL"} ===\n`);
if (failed > 0) process.exit(1);
