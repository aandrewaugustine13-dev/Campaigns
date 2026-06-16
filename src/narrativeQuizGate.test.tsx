// ════════════════════════════════════════════════════════════════
// QUIZ-STAGE proof (Option A) — part (c), the SURGICAL CUT in the real engine.
//
// Drives the ACTUAL <GeneratedCampaign> through a narrative campaign and proves
// the mid-run knowledge-check gate is SUPPRESSED (the story plays uninterrupted)
// while the close-screen FINAL EXAM still renders. The contrast case — the SAME
// campaign data WITHOUT productType:"narrative" — DOES pop a mid-run quiz,
// proving the suppression (not luck) is what removes it.
//
// Run with:  npm run test:quiz-gate
// ════════════════════════════════════════════════════════════════
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import GeneratedCampaign from "./GeneratedCampaign";
import type { CampaignData } from "../generator/schema";

const POPQUIZ = "POPQUIZ_MARKER_QUESTION";

// The closing beat is shown via "Looking back" for the narrative product (the
// assembled ending) or "What it all added up to" for the systems storyMeaning.
const atClose = (t: string) => t.includes("Looking back") || t.includes("What it all added up to");

// A pinned decision beat moving the single "standing" track.
function pin(seq: number, min: number, max: number, reader = false) {
  return {
    id: `pin${seq}`, pinned: true, pinSeq: seq, phase_min: min, phase_max: max, weight: 5,
    title: `PINNED BEAT ${seq}`, text: `Scene for pinned beat ${seq}.`, type: "standard" as const,
    significance: `why beat ${seq} matters`,
    choices: reader
      ? [{ text: "Go on." }]
      : [
          { text: `Beat ${seq} — bold`, result: `You acted boldly at beat ${seq}.`, effects: { standing: 3 } },
          { text: `Beat ${seq} — cautious`, result: `You held back at beat ${seq}.`, effects: { standing: -2 } },
        ],
  };
}

// A spine of 5 beats over a multi-turn project calendar — long enough that the
// systems mid-run gate (triviaCounter >= 2) WOULD fire if not suppressed.
function buildNarrativeCampaign(productType?: "narrative"): CampaignData {
  return {
    id: "quiz-gate-test", title: "QUIZ GATE TEST", subtitle: "mid-run suppression",
    introBody: "A spine run to prove the gate is suppressed.", trailFeedOpener: "It begins.",
    theme: "default", progressionMode: "project", productType,
    totalDays: 10, daysPerTurn: 1, totalDistance: 0, distanceUnit: "",
    initialResources: { standing: 60 }, resourceCaps: { standing: 100 }, resourceLabels: { standing: "Standing" },
    paces: [],
    events: [
      pin(0, 0.05, 0.23), pin(1, 0.23, 0.41), pin(2, 0.41, 0.59), pin(3, 0.59, 0.77),
      pin(4, 0.77, 0.95, true),
    ],
    sages: [],
    route: [{ id: "start", title: "Start", description: "Begin.", edges: [] }],
    // The final-exam bank. In systems mode this ALSO feeds the mid-run gate.
    eventTrivia: [
      { id: "q1", question: `${POPQUIZ} one?`, choices: ["Yes", "No"], correctIndex: 0, fact: "Yes." },
      { id: "q2", question: `${POPQUIZ} two?`, choices: ["A", "B"], correctIndex: 0, fact: "A." },
      { id: "q3", question: `${POPQUIZ} three?`, choices: ["X", "Y"], correctIndex: 0, fact: "X." },
    ],
    trailPath: [], trailStops: [], mapImage: "none",
    outfitConfig: { budget: 0, baseCrew: 0, baseHorses: 0, baseSupplies: 0, costs: {}, wageCosts: {}, wageMorale: {}, herdOptions: [] },
    primaryResourceKey: "standing", primaryResourceStart: 60, revenuePerUnit: 0,
    historicalContext: "Test.", pixelColors: {}, pixelFaces: {},
    reviewSummary: "A short recap for the test.",
    storyMeaning: "STORY_MEANING_MARKER — the war settled nothing yet gave the nation its myth.",
    endingFrame: { coda: "STORY_MEANING_MARKER — the war settled nothing yet gave the nation its myth." },
  } as unknown as CampaignData;
}

// Drive the real UI forward, calling onScan() before each click. Stops when the
// close (storyMeaning) is reached or steps run out. Returns whether the close hit.
function driveToClose(getAllByRole: any, container: HTMLElement, onScan: () => void): boolean {
  const text = () => container.textContent ?? "";
  const beginBtn = getAllByRole("button").find((b: HTMLElement) => /begin/i.test(b.textContent ?? ""));
  if (beginBtn) fireEvent.click(beginBtn);
  for (let i = 0; i < 80; i++) {
    onScan();
    if (atClose(text())) return true; // closing beat reached
    const buttons = getAllByRole("button").filter((b: HTMLElement) => {
      const txt = (b.textContent ?? "").trim();
      return txt && !/back to campaigns|campaign log|ask a sage/i.test(txt);
    });
    if (buttons.length === 0) break;
    const forward =
      buttons.find((b: HTMLElement) => /continue expedition|^go on\.?$|^continue$|onward|press on|^▶/i.test((b.textContent ?? "").trim())) ??
      buttons[0];
    fireEvent.click(forward);
  }
  onScan();
  return atClose(text());
}

describe("narrative quiz gate — mid-run suppression, final exam preserved", () => {
  it("narrative: NO mid-run pop quiz, but the final exam still renders", () => {
    const data = buildNarrativeCampaign("narrative");
    const { container, getAllByRole } = render(<GeneratedCampaign data={data} onBack={() => {}} />);

    let sawQuizMidRun = false;
    const reachedClose = driveToClose(getAllByRole, container, () => {
      const t = container.textContent ?? "";
      // Before the close screen, the quiz marker must NEVER appear (a mid-run gate).
      if (!atClose(t) && t.includes(POPQUIZ)) sawQuizMidRun = true;
    });

    expect(sawQuizMidRun, "a mid-run pop quiz appeared during the narrative run").toBe(false);
    expect(reachedClose, "the narrative run reached the storyMeaning close").toBe(true);

    // Acknowledge the storyMeaning ending → the FINAL EXAM must render.
    const cont = getAllByRole("button").find((b: HTMLElement) => /^continue$/i.test((b.textContent ?? "").trim()));
    expect(cont, "Continue button on the storyMeaning panel").toBeTruthy();
    fireEvent.click(cont!);

    const t = container.textContent ?? "";
    expect(t.includes("Check for Understanding"), "final exam heading").toBe(true);
    expect(t.includes(POPQUIZ), "the exam draws the eventTrivia bank").toBe(true);
  });

  it("contrast — the SAME data as a systems campaign DOES pop a mid-run quiz", () => {
    const data = buildNarrativeCampaign(undefined); // no productType ⇒ systems
    const { container, getAllByRole } = render(<GeneratedCampaign data={data} onBack={() => {}} />);

    let sawQuizMidRun = false;
    driveToClose(getAllByRole, container, () => {
      const t = container.textContent ?? "";
      if (!atClose(t) && t.includes(POPQUIZ)) sawQuizMidRun = true;
    });

    expect(sawQuizMidRun, "systems mode should fire a mid-run knowledge-check gate").toBe(true);
  });
});
