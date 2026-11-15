#!/usr/bin/env npx tsx
// Topology checks for the Montgomery stitcher. No network.
//   npx tsx generator/montgomery.test.ts
import {
  allNodeIds,
  arrivalProse,
  bottleneckId,
  endRedId,
  repairMontgomery,
  scaffoldCampaign,
  stitchMontgomery,
  t1Id,
  t2Id,
  validateMontgomery,
  warpId,
  type MontgomeryBlueprint,
  type MontgomeryNode,
} from "./montgomery.js";

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok || !detail ? "" : `\n      ${detail}`}`);
  if (!ok) failed++;
};

function blueprint(): MontgomeryBlueprint {
  const chapters = [1, 2, 3, 4] as const;
  return {
    title: "The Road to the Fort",
    protagonist: "a militia runner",
    topic: "War of 1812",
    gradeLevel: "8",
    standard: "8.B historical cause",
    bottlenecks: chapters.map((chapter) => ({
      chapter,
      title: `Crisis ${chapter}`,
      date: `181${chapter}`,
      concept: `supply and alliance in chapter ${chapter}`,
      summary: `The documented crisis of chapter ${chapter} is already underway when the runner arrives.`,
    })),
    chapters: chapters.map((chapter) => ({
      chapter,
      branches: [
        `The bold company spends its last powder to seize the road in chapter ${chapter}.`,
        `The runner bargains with the officer and loses a day of marching in chapter ${chapter}.`,
        `The column waits out the volley and loses the ford in chapter ${chapter}.`,
      ],
      redBlunder: `Charging without powder destroys the company in chapter ${chapter}.`,
      yellowTrap: `Waiting for a written order leaves the runner off the historical road in chapter ${chapter}.`,
      warp: `A runner from the other road crosses the field in chapter ${chapter}.`,
    })),
    climax: {
      green: "You hold the last line and live with the names you cannot bring home.",
      yellow: "You last until the treaty by staying away from the final volley.",
      red: "The last charge spends the company for a hill the treaty has already given away.",
    },
  };
}

console.log("\n=== montgomery topology ===\n");

{
  const plan = blueprint();
  const { campaign, report } = stitchMontgomery(plan, []);
  check("scaffold has the canonical nodes", campaign.nodes.length === allNodeIds().length && campaign.nodes.length === 43);
  check("scaffold validates", report.ok, report.findings.filter((item) => item.level === "error").map((item) => item.message).join("; "));
  check("scaffold needs no repairs", report.repairs.length === 0);
  const chapter4Leaves = campaign.nodes.filter((node) => node.id.startsWith("ch4_t2_"));
  check(
    "chapter 4 funnels reach the climax tier",
    chapter4Leaves.every((node) => (node.choices ?? []).every((item) => item.targetNodeId.startsWith("climax_"))),
  );
  const earlyBridge = campaign.nodes
    .flatMap((node) => node.choices ?? [])
    .filter((item) => item.targetNodeId === bottleneckId(2));
  check("choices into the next bottleneck carry a bridge", earlyBridge.length > 0 && earlyBridge.every((item) => (item.bridgeText ?? "").length > 0));
  const warp = campaign.nodes.find((node) => node.id === t1Id(1, "a"));
  check("a tier-1 choice warps laterally", (warp?.choices ?? []).some((item) => item.targetNodeId === warpId(1)));
}

{
  const plan = blueprint();
  const broken: MontgomeryNode[] = [{
    id: t2Id(1, "a"),
    chapter: 1,
    role: "funnel",
    title: "Broken funnel",
    narrative: "The bold road ends in a ditch and the runner still has to reach the next crisis.",
    choices: [{ id: "bad", text: "March toward a road that is not on the map.", targetNodeId: "missing_node" }],
  }];
  const { campaign, report } = stitchMontgomery(plan, [broken]);
  const funnel = campaign.nodes.find((node) => node.id === t2Id(1, "a"));
  check(
    "a broken funnel link is auto-routed to the next bottleneck",
    funnel?.choices?.[0]?.targetNodeId === bottleneckId(2) && (funnel.choices[0].bridgeText ?? "").length > 0,
  );
  check("the repaired graph still validates", report.ok, report.findings.filter((item) => item.level === "error").map((item) => item.message).join("; "));
  check("the repair is recorded", report.repairs.some((item) => item.includes("missing_node")));
}

{
  const plan = blueprint();
  const nodes = scaffoldCampaign(plan);
  const funnel = nodes.find((node) => node.id === t2Id(2, "b"));
  if (funnel?.choices?.[0]) delete funnel.choices[0].bridgeText;
  const repaired = repairMontgomery(nodes, plan);
  const filled = repaired.nodes.find((node) => node.id === t2Id(2, "b"))?.choices?.[0];
  const findings = validateMontgomery(repaired.nodes);
  check("a missing bottleneck bridge is filled", (filled?.bridgeText ?? "").split(/\s+/).length >= 8);
  check("filled bridges validate", findings.every((item) => item.level !== "error"), findings.filter((item) => item.level === "error").map((item) => item.message).join("; "));
}

{
  const plan = blueprint();
  const nodes = scaffoldCampaign(plan);
  const arrival = nodes.find((node) => node.id === bottleneckId(2));
  const bridge = nodes.find((node) => node.id === t2Id(1, "a"))?.choices?.[0];
  const shown = arrival && bridge ? arrivalProse(bridge, arrival) : "";
  check("arrival shows the bridge, then the bottleneck", shown.startsWith(bridge?.bridgeText ?? "no") && shown.includes("\n\n") && shown.endsWith(arrival?.narrative ?? "no"));
  const divergence = nodes.find((node) => node.id === t1Id(1, "a"));
  const intoDivergence = nodes.find((node) => node.id === bottleneckId(1))?.choices?.[0];
  check(
    "a divergence does not wear the previous bridge",
    divergence !== undefined && arrivalProse(intoDivergence, divergence) === divergence.narrative,
  );
}

{
  const plan = blueprint();
  const stripped = scaffoldCampaign(plan).map((node) => (
    node.id === endRedId(3) ? { ...node, ending: undefined, choices: [{ id: "x", text: "Keep going.", targetNodeId: t2Id(3, "a") }] } : node
  ));
  const host = stripped.find((node) => node.id === t1Id(3, "a"));
  if (host) host.choices = (host.choices ?? []).filter((item) => item.targetNodeId !== endRedId(3));
  const repaired = repairMontgomery(stripped, plan);
  const findings = validateMontgomery(repaired.nodes);
  const red = repaired.nodes.find((node) => node.id === endRedId(3));
  check("an ending loses illegal choices and is targeted again", red?.ending === "red" && !red.choices && repaired.nodes.some((node) => (node.choices ?? []).some((item) => item.targetNodeId === endRedId(3))));
  check("red-ending repair still validates", findings.every((item) => item.level !== "error"), findings.filter((item) => item.level === "error").map((item) => item.message).join("; "));
}

{
  const plan = blueprint();
  const nodes = scaffoldCampaign(plan);
  const bold = nodes.find((node) => node.id === t1Id(2, "a"));
  const cautious = nodes.find((node) => node.id === t1Id(2, "c"));
  if (bold) {
    bold.choices = [1, 2, 3].map((n) => ({ id: `local_${n}`, text: `Hold the ${n} ford.`, targetNodeId: t2Id(2, "a") }));
  }
  if (cautious) {
    cautious.choices = [{ id: "own", text: "Keep the column on this bank.", targetNodeId: t2Id(2, "c") }, { id: "own2", text: "Dig in on this bank.", targetNodeId: t2Id(2, "c") }];
  }
  const repaired = repairMontgomery(nodes, plan);
  const findings = validateMontgomery(repaired.nodes);
  const host = repaired.nodes.find((node) => node.id === t1Id(2, "a"));
  check(
    "repair keeps both the red ending and the lateral warp",
    (host?.choices ?? []).some((item) => item.targetNodeId === endRedId(2)) &&
      (host?.choices ?? []).some((item) => item.targetNodeId === warpId(2)),
  );
  check("a full local branch still validates after repair", findings.every((item) => item.level !== "error"), findings.filter((item) => item.level === "error").map((item) => item.message).join("; "));
}

if (failed > 0) {
  console.log(`\n=== ${failed} FAILED ===\n`);
  process.exit(1);
}
console.log("\n=== PASS ===\n");
