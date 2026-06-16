// ════════════════════════════════════════════════════════════════
// STEP 4 — choice-memory recording in the REAL engine.
//
// Drives the ACTUAL <GeneratedCampaign> through a narrative run, choosing a
// SPECIFIC option at each pinned decision beat, and proves the recording path
// (finalizeChoice → pinnedChoiceEntry → GameState.choiceMemory) runs in the real
// turn loop: the run reaches the close and every chosen option resolved (its
// result text appears). choiceMemory is internal state until the Step-6 UI
// renders the assembled ending; its CONTENTS are proven deterministically in
// generator/choiceMemory.test.ts. This is the wiring/integration guard.
//
// Run with:  npm run test:choice-memory-engine
// ════════════════════════════════════════════════════════════════
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import GeneratedCampaign from "./GeneratedCampaign";
import type { CampaignData } from "../generator/schema";

// A pinned decision beat whose two options have DISTINCT, scannable result texts.
function pin(seq: number, min: number, max: number, reader = false) {
  return {
    id: `pin${seq}`, pinned: true, pinSeq: seq, phase_min: min, phase_max: max, weight: 5,
    title: `PINNED BEAT ${seq}`, text: `Scene for pinned beat ${seq}.`, type: "standard" as const,
    significance: `why beat ${seq} matters`,
    choices: reader
      ? [{ text: "Go on." }]
      : [
          { text: `Beat ${seq} BOLD`, result: `BOLD_RESULT_${seq} you acted boldly.`, effects: { standing: 3 } },
          { text: `Beat ${seq} cautious`, result: `cautious result ${seq}.`, effects: { standing: -2 } },
        ],
  };
}

function buildNarrativeCampaign(): CampaignData {
  return {
    id: "choice-mem-test", title: "CHOICE MEMORY TEST", subtitle: "recording",
    introBody: "A spine run to record choices.", trailFeedOpener: "It begins.",
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
    storyMeaning: "STORY_MEANING_MARKER.", endingFrame: { coda: "STORY_MEANING_MARKER." },
  } as unknown as CampaignData;
}

describe("choice-memory — recorded in the real engine during a narrative run", () => {
  it("resolves the chosen option at every pinned decision beat and reaches the close", () => {
    const data = buildNarrativeCampaign();
    const { container, getAllByRole } = render(<GeneratedCampaign data={data} onBack={() => {}} />);
    const text = () => container.textContent ?? "";

    const seenBold = new Set<number>();
    const scan = () => { for (let k = 0; k < 4; k++) if (text().includes(`BOLD_RESULT_${k}`)) seenBold.add(k); };

    fireEvent.click(getAllByRole("button").find((b) => /begin/i.test(b.textContent ?? ""))!);

    let reachedClose = false;
    for (let i = 0; i < 80; i++) {
      scan();
      // The narrative close renders the assembled ending under "Looking back".
      if (text().includes("Looking back")) { reachedClose = true; break; }
      const buttons = getAllByRole("button").filter((b) => {
        const t = (b.textContent ?? "").trim();
        return t && !/back to campaigns|campaign log|ask a sage/i.test(t);
      });
      if (buttons.length === 0) break;
      // On a decision beat, choose the BOLD option (index 0). Otherwise advance.
      const bold = buttons.find((b) => /BOLD/.test(b.textContent ?? ""));
      const forward = buttons.find((b) => /^go on\.?$|^continue$|onward|press on|^▶/i.test((b.textContent ?? "").trim()));
      fireEvent.click(bold ?? forward ?? buttons[0]);
    }
    scan();

    // Every pinned DECISION beat's chosen (bold) option resolved — the exact
    // resolutions the recorder keys on — and the run reached the close.
    expect([...seenBold].sort(), "all four bold decisions resolved").toEqual([0, 1, 2, 3]);
    expect(reachedClose, "run reached the storyMeaning close without error").toBe(true);
  });
});
