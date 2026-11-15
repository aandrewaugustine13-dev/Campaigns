#!/usr/bin/env npx tsx
// Pure checks for the causal enrichment pass. No network.
//   npx tsx generator/causalEnrich.test.ts
import type { NarrativePlan } from "./storyPlan.js";
import { narrativePlanToCampaign, type NarrativeIdentity } from "./narrativeCampaign.js";
import {
  applyCausalEnrichment,
  applyNarrativeEnrichment,
  auditChoiceWeight,
  contextsAreNearDuplicate,
  ensureChoiceWeight,
  repairCausalNodes,
  type CausalLaterRead,
  type CausalNodeView,
  type CausalSkeletonView,
} from "./causalEnrich.js";

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok || !detail ? "" : `\n      ${detail}`}`);
  if (!ok) failed++;
};

console.log("\n=== causal enrichment ===\n");

check(
  "near-duplicate arrivals share their content words",
  contextsAreNearDuplicate(
    "The appropriation passed and the horses are already spent on the cut.",
    "The appropriation passed and the horses are already spent on the ditch.",
  ) && !contextsAreNearDuplicate(
    "The appropriation passed and the horses are already spent.",
    "The army kept its rations and lost the digging season.",
  ),
);

{
  const skeleton: CausalSkeletonView = {
    initialResources: { funding: 40 },
    eventSkeletons: [
      {
        id: "early",
        choices: [
          { id: "fund", mutates: [{ track: "factionTrust", delta: 1 }], tradeOff: "old gain but old cost", consequenceTag: "OLD_TAG" },
          { id: "hold", mutates: [], tradeOff: "keep the store but lose the season", consequenceTag: "OLD_TAG_2" },
        ],
      },
      {
        id: "later",
        choices: [
          { id: "a", mutates: [], tradeOff: "a gain but a cost", consequenceTag: "LATER_A" },
          { id: "b", mutates: [], tradeOff: "another gain but another cost", consequenceTag: "LATER_B" },
        ],
      },
    ],
  };
  const audit = applyCausalEnrichment(skeleton, {
    flags: [{ id: "mood" }],
    choices: [
      {
        eventId: "early",
        choiceId: "fund",
        tradeOff: "Secures the appropriation but exhausts the draft horses.",
        consequenceTag: "secured_appropriation",
        mutates: [
          { track: "factionTrust", delta: 9 },
          { track: "inventedGold", delta: -1 },
          { track: "family", delta: 1 },
          { track: "funding", delta: -2 },
        ],
      },
    ],
    arrivals: [{
      eventId: "later",
      incomingContext: [
        { tag: "SECURED_APPROPRIATION", context: "The appropriation passed and the horses are already spent on the cut." },
        { tag: "OLD_TAG_2", context: "The appropriation passed and the horses are already spent on the ditch." },
      ],
    }],
    laterReads: [
      {
        tag: "SECURED_APPROPRIATION",
        nodeId: "later",
        changes: "options",
        resource: "inventedGold",
        gate: { choiceId: "a", effect: "raise_cost", note: "The spent horses make this crossing cost the last team." },
      },
      { tag: "NO_SUCH", nodeId: "later", changes: "stakes" },
      { tag: "SECURED_APPROPRIATION", nodeId: "early", changes: "resources" },
    ],
  }, {
    resources: ["funding"],
    tracks: [{ id: "factionTrust", kind: "number" }],
    flags: ["family"],
  });
  const fund = skeleton.eventSkeletons[0].choices?.[0];
  check("enrichment rewrites the tradeoff and the tag", fund?.tradeOff === "Secures the appropriation but exhausts the draft horses." && fund.consequenceTag === "SECURED_APPROPRIATION");
  check(
    "invented keys and flag writes are dropped",
    fund?.mutates.length === 1 && fund.mutates[0].track === "factionTrust" && fund.mutates[0].delta === 2 &&
      audit.inventedKeys.includes("inventedGold") && audit.flagKeysTouched.includes("family") && audit.droppedFlags,
  );
  check("a locked resource key is not turned into a state mutation", !fund?.mutates.some((mutation) => mutation.track === "funding"));
  const reads = skeleton.laterReads ?? [];
  check(
    "backward and unknown reads are dropped",
    reads.every((read) => read.tag !== "NO_SUCH" && read.nodeId !== "early") &&
      reads.some((read) => read.tag === "SECURED_APPROPRIATION" && read.nodeId === "later" && read.gate?.choiceId === "a" && read.gate.effect === "raise_cost"),
  );
  check(
    "near-duplicate arrivals on one node are split",
    audit.nearDuplicateNodes.includes("later") &&
      new Set((skeleton.eventSkeletons[1].incomingContext ?? []).map((entry) => entry.context)).size === 2,
  );
  const repaired = repairCausalNodes(skeleton.eventSkeletons);
  const early = new Set((skeleton.eventSkeletons[0].choices ?? []).map((choice) => choice.consequenceTag));
  check(
    "cleanup makes a later node cite an early tag",
    repaired.unreferencedEarlyTags.length === 0 &&
      (skeleton.eventSkeletons[1].incomingContext ?? []).some((entry) => early.has(entry.tag)),
  );
}

{
  const nodes: CausalNodeView[] = [0, 1, 2, 3].map((index) => ({
    id: `beat${index + 1}`,
    choices: [
      { id: `a${index}`, mutates: [], tradeOff: "", consequenceTag: "" },
      { id: `b${index}`, mutates: [], tradeOff: "", consequenceTag: "" },
    ],
  }));
  const repaired = repairCausalNodes(nodes);
  const openingChoices = nodes[0]?.choices;
  if (!openingChoices?.length) throw new Error("opening choices missing");
  const early = new Set(openingChoices.map((choice) => choice.consequenceTag));
  const laterArrivals = nodes[3]?.incomingContext ?? [];
  check("node 4 cites a first-node tag", laterArrivals.some((entry) => early.has(entry.tag)));
  check("repair leaves no early tag uncited", repaired.unreferencedEarlyTags.length === 0);
  check("the opening node has no arrival", nodes[0]?.incomingContext === undefined);
  check(
    "repair gives non-final choices weight before the end",
    repaired.weight.ok && repaired.laterReads.some((read) => read.nodeId !== "beat4"),
  );
}

{
  const nodes: CausalNodeView[] = [0, 1, 2, 3].map((index) => ({
    id: `node${index + 1}`,
    choices: [
      { id: `a${index}`, mutates: [], tradeOff: "Gains time but spends the supply.", consequenceTag: `TAG_${index}_A` },
      { id: `b${index}`, mutates: [], tradeOff: "Saves the supply but loses the season.", consequenceTag: `TAG_${index}_B` },
    ],
  }));
  const onlyFinal: CausalLaterRead[] = nodes.slice(0, 3).flatMap((node) => (
    (node.choices ?? []).map((choice) => ({
      tag: choice.consequenceTag,
      nodeId: "node4",
      changes: "stakes" as const,
    }))
  ));
  const before = auditChoiceWeight(nodes, onlyFinal);
  check(
    "weight that lands only on the final node fails the mid-game rule",
    before.meetsPersistentDivergence && before.weightLandsBeforeTheEnd === false && before.ok === false,
  );
  const fixed = ensureChoiceWeight(nodes, onlyFinal);
  const earlyRead = fixed.laterReads.find((read) => read.tag === "TAG_0_A");
  const earlyIndex = nodes.findIndex((node) => node.id === earlyRead?.nodeId);
  check("cleanup lands an early tag at least two nodes later", earlyIndex >= 2);
  check("cleanup does not leave every read on the final node", fixed.audit.weightLandsBeforeTheEnd && fixed.audit.ratio >= 0.6 && fixed.audit.ok);
}

{
  const scene = "The War Hawks carry the vote in a hot chamber.";
  const plan: NarrativePlan = {
    throughline: "A vote for war becomes a battle fought after the peace.",
    meaning: "The victory felt real, and the treaty had already ended the war.",
    beats: [
      { id: "beat_vote", role: "cause", title: "The Vote", scene, significance: "The war starts here.", phaseHint: 0.1, included: true, choices: [
        { text: "Vote for war", result: "The declaration passes.", stake: 6, endingFragment: "You voted for war." },
        { text: "Ask for time", result: "They call you a coward.", stake: -4, endingFragment: "You asked for time." },
      ] },
      { id: "beat_border", role: "escalation", title: "The Border", scene: "The militia will not cross.", significance: "The offensive fails.", phaseHint: 0.35, included: true, choices: [
        { text: "Order another march", result: "The second march bleeds out.", stake: -5, endingFragment: "You ordered another march." },
        { text: "Hold the river", result: "The army survives.", stake: 3, endingFragment: "You held the river." },
      ] },
      { id: "beat_capital", role: "climax", title: "The Capital", scene: "The public buildings are burning.", significance: "Pride burns with them.", phaseHint: 0.7, included: true, choices: [
        { text: "Rally the city", result: "A few companies form.", stake: 4, endingFragment: "You rallied the city." },
        { text: "Fall back", result: "You save the army and lose the city.", stake: -2, endingFragment: "You fell back." },
      ] },
      { id: "beat_peace", role: "resolution", title: "The Peace", scene: "News of the treaty arrives after the battle.", significance: "The irony lands.", phaseHint: 0.95, included: true },
    ],
  };
  const audit = applyNarrativeEnrichment(plan, {
    choices: [
      {
        beatId: "beat_vote",
        choiceIndex: 0,
        tradeOff: "Wins the vote but commits an unready country.",
        consequenceTag: "voted_for_war",
        endingFragment: "You carried the vote for war, and an unready country marched.",
        mutates: [{ track: "inventedStanding", delta: 3 }],
      },
    ],
  });
  const vote = plan.beats[0].choices?.[0];
  const campaign = narrativePlanToCampaign(plan, {
    id: "war-of-1812",
    title: "War of 1812",
    subtitle: plan.throughline,
    introBody: plan.throughline,
    trailFeedOpener: scene,
    historicalContext: plan.meaning,
  } satisfies NarrativeIdentity);
  const compiled = campaign.events.find((event) => event.id === "beat_vote");
  check("narrative enrichment keeps the authored scene and stake", plan.beats[0].scene === scene && vote?.stake === 6 && vote.text === "Vote for war");
  check(
    "ending fragment is strengthened and compiled unchanged",
    vote?.endingFragment === "You carried the vote for war, and an unready country marched." &&
      compiled?.choices?.[0].endingFragment === vote?.endingFragment,
  );
  check("a narrative mutation key is outside the locked set", audit.inventedKeys.includes("inventedStanding"));
  const early = new Set((plan.beats[0].choices ?? []).map((choice) => choice.consequenceTag));
  check(
    "the fourth beat cites an early consequence tag",
    (plan.beats[3].incomingContext ?? []).some((entry) => entry.tag && early.has(entry.tag)) &&
      audit.unreferencedEarlyTags.length === 0,
  );
  check("assembly still does not copy the causal ledger onto events", compiled !== undefined && !("incomingContext" in (compiled ?? {})) && !("consequenceTag" in (compiled?.choices?.[0] ?? {})) && !("laterReads" in (compiled ?? {})));
  check(
    "narrative choices carry weight before the last beat",
    audit.weight.ok && (plan.laterReads ?? []).some((read) => read.nodeId !== "beat_peace"),
  );
}

if (failed > 0) {
  console.log(`\n=== ${failed} FAILED ===\n`);
  process.exit(1);
}
console.log("\n=== PASS ===\n");
