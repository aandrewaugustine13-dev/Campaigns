#!/usr/bin/env npx tsx
// ════════════════════════════════════════════════════════════════
// STEP 1 proof — Product separation.
//
//   1. narrativePlanToCampaign turns a validated plan into a spine-only,
//      ALL-PINNED, LINEAR campaign: every event pinned, pinSeq contiguous,
//      arc-ordered, single track, the four deciding beats carry real choices
//      and the resolution is a witnessing beat.
//   2. That campaign carries NO systems features (no sage, route, outfit,
//      multi-resource economy) and is productType "narrative".
//   3. validate() accepts it with ZERO errors — it routes to a VALID linear path.
//   4. BYTE-IDENTICAL GUARD: the validator only RELAXES the systems-only checks
//      for "narrative". The SAME empty campaign WITHOUT productType still errors
//      on sages/route/outfit — proving Product 1's check set is untouched.
//
// No model call. Run with:  npm run test:narrative
// ════════════════════════════════════════════════════════════════

import { validateStoryPlan, type NarrativePlan } from "./storyPlan.js";
import { narrativePlanToCampaign, NARRATIVE_TRACK_KEY, type NarrativeIdentity } from "./narrativeCampaign.js";
import { validate } from "./validate.js";

// ── tiny assert harness (matches storyPlanCompile.test.ts) ────────
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

// ── The approved arc shape: FOUR deciding beats + ONE witnessing resolution ─
// cause + 2 escalation + climax = 4 decisions; resolution is choiceless.
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
      choices: [
        { text: "Vote for war now", result: "The declaration passes; the country is committed, ready or not.", stake: 6 },
        { text: "Push for more preparation first", result: "You buy time, but the War Hawks brand you a coward.", stake: -4 },
      ],
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
      choices: [
        { text: "Order another push north", result: "The second invasion bleeds out like the first.", stake: -7 },
        { text: "Pull back and defend the border", result: "You cede the offensive but save the army.", stake: 3 },
      ],
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
      choices: [
        { text: "Rally the militia to retake the capital", result: "A ragged force gathers; morale flickers back.", stake: 5 },
        { text: "Regroup and protect Baltimore instead", result: "You abandon Washington's ashes for the next fight.", stake: -3 },
      ],
      phaseHint: 0.6,
      included: true,
    },
    {
      id: "beat_neworleans",
      role: "climax",
      title: "The Battle of New Orleans",
      scene:
        "Behind cotton bales and mud ramparts, Jackson's ragtag line shatters the British assault. It is the most lopsided American victory of the war.",
      significance:
        "The climax the whole arc builds to — and the hinge of the irony: a total victory in a battle that, unknown to anyone present, no longer mattered.",
      choices: [
        { text: "Hold the line behind the cotton bales", result: "The British charge breaks against your defenses.", stake: 9 },
        { text: "Sally out to meet them in the open", result: "Glory beckons, but you trade your advantage away.", stake: -6 },
        { text: "Negotiate a bloodless British withdrawal", result: "No legend is born, but no one dies for nothing.", stake: -2 },
      ],
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

const identity: NarrativeIdentity = {
  id: "war-of-1812",
  title: "The War of 1812",
  subtitle: plan.throughline,
  introBody: "You are a member of the young republic's Congress as the drums of war begin.",
  trailFeedOpener: "The War Hawks are calling for blood.",
  historicalContext: "The War of 1812 settled little on paper but reshaped how the nation saw itself.",
};

// ════════════════════════════════════════════════════════════════
function main() {
  console.log("\n=== Step 1: narrativePlanToCampaign (product separation) ===\n");

  // 0) Sanity: the input plan is valid.
  const planErrors = validateStoryPlan(plan).filter((f) => f.level === "error");
  check("input plan has zero validation errors", planErrors.length === 0,
    planErrors.map((f) => `[${f.field}] ${f.message}`).join("; "));
  console.log("");

  const data = narrativePlanToCampaign(plan, identity);
  const ev = data.events;

  // 1) All-pinned, linear, arc-ordered.
  console.log("all-pinned linear spine:");
  check("5 beats compile to 5 events", ev.length === 5);
  check("EVERY event is pinned (no random pool)", ev.every((e) => e.pinned === true));
  check("pinSeq is contiguous 0..4 in arc order",
    JSON.stringify(ev.map((e) => e.pinSeq)) === JSON.stringify([0, 1, 2, 3, 4]));
  let monotonic = true;
  for (let i = 1; i < ev.length; i++) if (ev[i].phase_min <= ev[i - 1].phase_min) monotonic = false;
  check("phase_min strictly increases across the arc (full [0,1] band)", monotonic,
    ev.map((e) => `${e.id}:[${e.phase_min},${e.phase_max}]`).join(" "));
  console.log("");

  // 2) Agency at the peaks; resolution witnesses.
  console.log("four deciding beats + one witnessing resolution:");
  const decisions = ev.filter((e) => e.id !== "beat_ghent");
  check("exactly 4 deciding beats", decisions.length === 4);
  check("every deciding beat offers ≥2 choices carrying a stake on the single track",
    decisions.every((e) => (e.choices?.length ?? 0) >= 2 &&
      (e.choices ?? []).every((c) => typeof c.effects?.[NARRATIVE_TRACK_KEY] === "number" && c.effects![NARRATIVE_TRACK_KEY] !== 0)));
  const resolution = ev.find((e) => e.id === "beat_ghent")!;
  check("the resolution is a choiceless witnessing beat (single \"Go on.\")",
    (resolution.choices?.length ?? 0) === 1 && resolution.choices![0].text === "Go on." && !resolution.choices![0].effects);
  console.log("");

  // 3) Sheds systems features; single track; correct discriminators.
  console.log("systems features SHED:");
  check("productType is \"narrative\"", data.productType === "narrative");
  check("progressionMode is \"project\"", data.progressionMode === "project");
  check("NO sages", data.sages.length === 0);
  check("NO route", data.route.length === 0);
  check("NO outfit budget (empty outfit)", data.outfitConfig.budget === 0 && Object.keys(data.outfitConfig.costs).length === 0);
  check("exactly ONE resource track (the single moral/character track)",
    Object.keys(data.initialResources).length === 1 && NARRATIVE_TRACK_KEY in data.initialResources);
  check("primaryResourceKey is that single track and exists in initialResources",
    data.primaryResourceKey === NARRATIVE_TRACK_KEY && NARRATIVE_TRACK_KEY in data.initialResources);
  console.log("");

  // 4) storyMeaning carried verbatim (the future constant coda).
  check("storyMeaning equals plan.meaning verbatim", data.storyMeaning === plan.meaning);
  console.log("");

  // 5) It routes to a VALID linear campaign.
  console.log("validate() on the assembled narrative campaign:");
  const report = validate(data);
  check("ZERO errors", report.failed === 0,
    report.findings.filter((f) => f.level === "error").map((f) => `[${f.field}] ${f.message}`).join("; "));
  console.log(`  (validate(): ${report.passed} passed, ${report.failed} errors, ${report.warnings} warnings)`);
  console.log("");

  // 6) BYTE-IDENTICAL GUARD — the gate only relaxes for "narrative".
  // The SAME empty-systems campaign WITHOUT the discriminator must still fail the
  // systems-only existence checks, proving Product 1's check set is unchanged.
  console.log("byte-identical guard (validator only relaxes for narrative):");
  const asSystems: Record<string, unknown> = { ...data };
  delete asSystems.productType;
  const sysReport = validate(asSystems);
  const sysFields = new Set(sysReport.findings.filter((f) => f.level === "error").map((f) => f.field));
  const narrativeFields = new Set(report.findings.map((f) => f.field));
  check("without productType, the empty sages bank ERRORS (systems check intact)", sysFields.has("sages"));
  check("without productType, the empty route ERRORS (systems check intact)", sysFields.has("route"));
  check("without productType, the empty eventTrivia ERRORS (systems check intact)", sysFields.has("eventTrivia"));
  check("with productType \"narrative\", NONE of those three error",
    !narrativeFields.has("sages") && !narrativeFields.has("route") && !narrativeFields.has("eventTrivia"));
  console.log("");

  console.log(`=== ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

main();
