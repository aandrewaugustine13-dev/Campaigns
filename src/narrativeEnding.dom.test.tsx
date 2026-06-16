// ════════════════════════════════════════════════════════════════
// STEP 6 — the TWO-PATH DOM proof. The single test that proves the whole point
// of Product 2 ("two kids, two endings") mechanically, end to end, in the REAL
// component — and retroactively closes the Step-4 gap (does the real engine
// record the RIGHT entries in the RIGHT order for choices clicked through the
// actual UI?). Two different paths through the actual <GeneratedCampaign>:
//
//   - the RENDERED ending text differs in exactly the fragment slots (each path
//     recites ITS OWN chosen fragments, none of the other's), and
//   - both share the IDENTICAL constant coda,
//
// observed in the DOM. Real engine records choiceMemory → real assembleEnding →
// real render. No fixture shortcut.
//
// Run with:  npm run test:ending-dom
// ════════════════════════════════════════════════════════════════
import { describe, it, expect } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import GeneratedCampaign from "./GeneratedCampaign";
import type { CampaignData } from "../generator/schema";

const CODA = "CODA_MARKER a war that settled nothing gave the nation its myth.";

// A pinned decision beat whose two options carry DISTINCT, scannable fragments
// and distinct choice labels (so the test can click a specific one).
function pin(seq: number, min: number, max: number, reader = false) {
  return {
    id: `pin${seq}`, pinned: true, pinSeq: seq, phase_min: min, phase_max: max, weight: 5,
    title: `PINNED BEAT ${seq}`, text: `Scene for pinned beat ${seq}.`, type: "standard" as const,
    significance: `why beat ${seq} matters`,
    choices: reader
      ? [{ text: "Go on." }]
      : [
          { text: `Beat ${seq} BOLD`, result: `bold result ${seq}.`, effects: { standing: 3 },
            endingFragment: `BOLDFRAG${seq} you charged ahead at beat ${seq}.` },
          { text: `Beat ${seq} cautious`, result: `cautious result ${seq}.`, effects: { standing: -2 },
            endingFragment: `CAUTFRAG${seq} you held back at beat ${seq}.` },
        ],
  };
}

function buildNarrativeCampaign(): CampaignData {
  return {
    id: "ending-dom-test", title: "ENDING DOM TEST", subtitle: "two kids two endings",
    introBody: "A spine run.", trailFeedOpener: "It begins.",
    theme: "default", progressionMode: "project", productType: "narrative",
    totalDays: 10, daysPerTurn: 1, totalDistance: 0, distanceUnit: "",
    initialResources: { standing: 60 }, resourceCaps: { standing: 100 }, resourceLabels: { standing: "Standing" },
    paces: [],
    events: [pin(0, 0.05, 0.23), pin(1, 0.23, 0.41), pin(2, 0.41, 0.59), pin(3, 0.59, 0.77), pin(4, 0.77, 0.95, true)],
    sages: [], route: [{ id: "start", title: "Start", description: "Begin.", edges: [] }],
    eventTrivia: [], trailPath: [], trailStops: [], mapImage: "none",
    outfitConfig: { budget: 0, baseCrew: 0, baseHorses: 0, baseSupplies: 0, costs: {}, wageCosts: {}, wageMorale: {}, herdOptions: [] },
    primaryResourceKey: "standing", primaryResourceStart: 60, revenuePerUnit: 0,
    historicalContext: "Test.", pixelColors: {}, pixelFaces: {},
    storyMeaning: CODA, endingFrame: { coda: CODA },
  } as unknown as CampaignData;
}

// Drive a fresh render through the run, choosing the BOLD or cautious option at
// each pinned decision beat, and return the rendered ending-panel text.
function playPathAndReadEnding(pickBold: boolean): string {
  const { container, getAllByRole, unmount } = render(<GeneratedCampaign data={buildNarrativeCampaign()} onBack={() => {}} />);
  const text = () => container.textContent ?? "";
  fireEvent.click(getAllByRole("button").find((b) => /begin/i.test(b.textContent ?? ""))!);

  let ending = "";
  for (let i = 0; i < 80; i++) {
    if (text().includes("Looking back")) { ending = text(); break; } // the assembled-ending panel
    const buttons = getAllByRole("button").filter((b) => {
      const t = (b.textContent ?? "").trim();
      return t && !/back to campaigns|campaign log|ask a sage/i.test(t);
    });
    if (buttons.length === 0) break;
    const choice = buttons.find((b) => (pickBold ? /BOLD/ : /cautious/).test(b.textContent ?? ""));
    const forward = buttons.find((b) => /^go on\.?$|^continue$|onward|press on|^▶/i.test((b.textContent ?? "").trim()));
    fireEvent.click(choice ?? forward ?? buttons[0]);
  }
  unmount();
  return ending;
}

describe("narrative ending — two kids, two endings, in the real DOM", () => {
  it("renders endings that differ in the fragment slots and share the coda", () => {
    const boldFrags = [0, 1, 2, 3].map((k) => `BOLDFRAG${k}`);
    const cautFrags = [0, 1, 2, 3].map((k) => `CAUTFRAG${k}`);

    const endingBold = playPathAndReadEnding(true);
    cleanup();
    const endingCaut = playPathAndReadEnding(false);

    // Each path reached its assembled ending.
    expect(endingBold, "bold path reached the ending panel").toContain("Looking back");
    expect(endingCaut, "cautious path reached the ending panel").toContain("Looking back");

    // Each ending recites ITS OWN four chosen fragments…
    for (const f of boldFrags) expect(endingBold, `bold ending recites ${f}`).toContain(f);
    for (const f of cautFrags) expect(endingCaut, `cautious ending recites ${f}`).toContain(f);
    // …and NONE of the other path's fragments (differ in every slot).
    for (const f of cautFrags) expect(endingBold, `bold ending must not contain ${f}`).not.toContain(f);
    for (const f of boldFrags) expect(endingCaut, `cautious ending must not contain ${f}`).not.toContain(f);

    // Recited in ARC order (beat 0 before beat 3) — proves the engine recorded
    // choice-memory in the right order, read back through the real render.
    expect(endingBold.indexOf("BOLDFRAG0")).toBeLessThan(endingBold.indexOf("BOLDFRAG3"));

    // Both share the IDENTICAL constant coda.
    expect(endingBold, "bold ending lands on the coda").toContain(CODA);
    expect(endingCaut, "cautious ending lands on the coda").toContain(CODA);

    // And the two endings are genuinely different texts.
    expect(endingBold).not.toEqual(endingCaut);
  });
});
