// ════════════════════════════════════════════════════════════════
// REAL-ENGINE integration proof for the pinned-beat END-OF-RUN FLUSH.
//
// The step-3 fixture proof drove a RE-IMPLEMENTATION of the turn loop. This
// drives the ACTUAL <GeneratedCampaign> React component — its real
// simulateTurn / advanceTurn / continueGame / finalizeChoice — through a
// deliberately TOO-SHORT pinned campaign (the calendar ends on turn 1, before
// any pin could fire normally), and asserts EVERY pinned beat still appears.
// This is the load-bearing guarantee the manual-playthrough checkpoint demands.
//
// Run with:  npm run test:flush
// ════════════════════════════════════════════════════════════════
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import GeneratedCampaign from "./GeneratedCampaign";
import type { CampaignData } from "../generator/schema";

// A pinned decision beat: distinct title, two choices moving the score resource.
function pin(seq: number, min: number, max: number, reader = false) {
  return {
    id: `pin${seq}`,
    pinned: true,
    pinSeq: seq,
    phase_min: min,
    phase_max: max,
    weight: 5,
    title: `PINNED BEAT ${seq}`,
    text: `Scene for pinned beat ${seq}.`,
    type: "standard" as const,
    significance: `why beat ${seq} matters`,
    choices: reader
      ? [{ text: "Go on." }]
      : [
          { text: `Beat ${seq} — bold`, result: `You acted boldly at beat ${seq}.`, effects: { reputation: 3 } },
          { text: `Beat ${seq} — cautious`, result: `You held back at beat ${seq}.`, effects: { reputation: -2 } },
        ],
  };
}

// A deliberately TOO-SHORT project campaign: totalDays 2 / daysPerTurn 5 means
// turn 1 jumps straight to the goal — no pin window can come up normally, so
// EVERY pinned beat must arrive via the end-of-run flush.
function buildTooShortPinnedCampaign(): CampaignData {
  return {
    id: "flush-test",
    title: "FLUSH TEST CAMPAIGN",
    subtitle: "too-short pinned run",
    introBody: "A run engineered to end before any pin fires normally.",
    trailFeedOpener: "It begins.",
    theme: "default",
    progressionMode: "project",
    totalDays: 2,
    daysPerTurn: 5,
    totalDistance: 0,
    distanceUnit: "",
    initialResources: { reputation: 60, supplies: 60 },
    resourceCaps: { reputation: 100, supplies: 100 },
    resourceLabels: { reputation: "Reputation", supplies: "Supplies" },
    paces: [],
    events: [
      pin(0, 0.05, 0.23),
      pin(1, 0.23, 0.41),
      pin(2, 0.41, 0.59),
      pin(3, 0.59, 0.77),
      pin(4, 0.77, 0.95, true), // resolution = witnessing reader
    ],
    sages: [],
    route: [{ id: "start", title: "Start", description: "Begin.", edges: [] }],
    eventTrivia: [
      { id: "q1", question: "A check?", choices: ["Yes", "No"], correctIndex: 0, fact: "Yes." },
    ],
    trailPath: [],
    trailStops: [],
    mapImage: "none",
    outfitConfig: { budget: 0, baseCrew: 0, baseHorses: 0, baseSupplies: 0, costs: {}, wageCosts: {}, wageMorale: {}, herdOptions: [] },
    primaryResourceKey: "reputation",
    primaryResourceStart: 60,
    revenuePerUnit: 0,
    historicalContext: "Test.",
    pixelColors: {},
    pixelFaces: {},
    verdict: { good: "VERDICT_GOOD_PASSAGE", bad: "VERDICT_BAD_PASSAGE", indifferent: "VERDICT_INDIFFERENT_PASSAGE" },
    reviewSummary: "A short recap for the test.",
    storyMeaning: "STORY_MEANING_MARKER — the war settled nothing yet gave the nation its myth.",
  } as unknown as CampaignData;
}

describe("narrative spine — end-of-run flush in the real engine", () => {
  it("fires EVERY pinned beat even when the run is too short for their windows", () => {
    const data = buildTooShortPinnedCampaign();
    const { container, getAllByRole } = render(<GeneratedCampaign data={data} onBack={() => {}} />);

    const seen = new Set<number>();
    const scan = () => {
      const t = container.textContent ?? "";
      // The event renders its `text` (the scene), not its title.
      for (let k = 0; k < 5; k++) if (t.includes(`Scene for pinned beat ${k}.`)) seen.add(k);
    };

    // Begin (project mode → starts the run directly, no outfit screen).
    const beginBtn = getAllByRole("button").find((b) => /begin/i.test(b.textContent ?? ""));
    expect(beginBtn, "intro Begin button").toBeTruthy();
    fireEvent.click(beginBtn!);
    scan();

    // Drive the real UI: each step, click the button that ADVANCES the game —
    // a choice ("▶ …"), "Go on.", "Continue", or "Continue Expedition" — and
    // never a modal toggle ("Campaign Log", "Ask a Sage") or "Back to Campaigns".
    for (let i = 0; i < 60 && seen.size < 5; i++) {
      scan();
      const buttons = getAllByRole("button").filter((b) => {
        const txt = (b.textContent ?? "").trim();
        if (!txt) return false;
        return !/back to campaigns|campaign log|ask a sage/i.test(txt);
      });
      if (buttons.length === 0) break;
      const forward =
        buttons.find((b) => /continue expedition|^go on\.?$|^continue$|onward|press on|^▶/i.test((b.textContent ?? "").trim())) ??
        buttons[0];
      fireEvent.click(forward);
      scan();
    }

    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("shows the storyMeaning ending at the close, BEFORE the verdict", () => {
    const data = buildTooShortPinnedCampaign();
    const { container, getAllByRole } = render(<GeneratedCampaign data={data} onBack={() => {}} />);

    const text = () => container.textContent ?? "";
    const clickForward = () => {
      const buttons = getAllByRole("button").filter((b) => {
        const t = (b.textContent ?? "").trim();
        return t && !/back to campaigns|campaign log|ask a sage/i.test(t);
      });
      if (buttons.length === 0) return false;
      const fwd =
        buttons.find((b) => /continue expedition|^go on\.?$|^continue$|onward|^▶/i.test((b.textContent ?? "").trim())) ??
        buttons[0];
      fireEvent.click(fwd);
      return true;
    };

    fireEvent.click(getAllByRole("button").find((b) => /begin/i.test(b.textContent ?? ""))!);

    // Drive until the story-meaning panel appears (after the run closes).
    let reachedMeaning = false;
    for (let i = 0; i < 60; i++) {
      if (text().includes("STORY_MEANING_MARKER")) { reachedMeaning = true; break; }
      if (!clickForward()) break;
    }
    expect(reachedMeaning, "story-meaning panel appeared").toBe(true);

    // It is the ENDING beat: distinct heading, and the verdict has NOT shown yet.
    expect(text()).toContain("What it all added up to");
    expect(text()).not.toContain("VERDICT_GOOD_PASSAGE");
    expect(text()).not.toContain("VERDICT_BAD_PASSAGE");
    expect(text()).not.toContain("VERDICT_INDIFFERENT_PASSAGE");

    // Acknowledging the meaning advances to the verdict (which judges the player).
    clickForward();
    const t = text();
    expect(
      /VERDICT_(GOOD|BAD|INDIFFERENT)_PASSAGE/.test(t),
      "verdict shows after acknowledging the story meaning",
    ).toBe(true);
  });

  it("still shows the storyMeaning ending when the player LOSES (fail path)", () => {
    // A normal-length campaign (goal far off) with an early event whose choice
    // drives morale to 0 — a systems FAIL. The climax is correctly cut short on
    // a loss (we do NOT flush pins on fail), but the history's MEANING is the
    // educational payload and must still land for a kid who lost.
    const data = {
      id: "fail-test", title: "FAIL TEST", subtitle: "s", introBody: "i", trailFeedOpener: "o",
      theme: "default", progressionMode: "project", totalDays: 100, daysPerTurn: 1,
      totalDistance: 0, distanceUnit: "",
      initialResources: { reputation: 60, morale: 5 }, resourceCaps: { reputation: 100, morale: 100 },
      resourceLabels: { reputation: "Reputation", morale: "Morale" },
      paces: [],
      events: [
        {
          id: "ruin", phase_min: 0, phase_max: 0.4, weight: 5, title: "Ruin",
          text: "A decision that can ruin you.", type: "standard",
          choices: [{ text: "Drive the nation to ruin", result: "Morale collapses.", effects: { morale: -99 } }],
        },
      ],
      sages: [], route: [{ id: "start", title: "S", description: "d", edges: [] }],
      eventTrivia: [{ id: "q1", question: "q", choices: ["a", "b"], correctIndex: 0, fact: "f" }],
      trailPath: [], trailStops: [], mapImage: "none",
      outfitConfig: { budget: 0, baseCrew: 0, baseHorses: 0, baseSupplies: 0, costs: {}, wageCosts: {}, wageMorale: {}, herdOptions: [] },
      primaryResourceKey: "reputation", primaryResourceStart: 60, revenuePerUnit: 0, historicalContext: "t",
      pixelColors: {}, pixelFaces: {},
      verdict: { good: "VG", bad: "VB", indifferent: "VI" },
      reviewSummary: "recap",
      storyMeaning: "STORY_MEANING_MARKER — the meaning that lands even in defeat.",
    } as unknown as CampaignData;

    const { container, getAllByRole } = render(<GeneratedCampaign data={data} onBack={() => {}} />);
    const text = () => container.textContent ?? "";
    const clickForward = () => {
      const buttons = getAllByRole("button").filter((b) => {
        const t = (b.textContent ?? "").trim();
        return t && !/back to campaigns|campaign log|ask a sage/i.test(t);
      });
      if (buttons.length === 0) return false;
      const fwd =
        buttons.find((b) => /continue expedition|^go on\.?$|^continue$|onward|ruin|^▶/i.test((b.textContent ?? "").trim())) ??
        buttons[0];
      fireEvent.click(fwd);
      return true;
    };

    fireEvent.click(getAllByRole("button").find((b) => /begin/i.test(b.textContent ?? ""))!);

    let reachedMeaning = false;
    for (let i = 0; i < 30; i++) {
      if (text().includes("STORY_MEANING_MARKER")) { reachedMeaning = true; break; }
      if (!clickForward()) break;
    }
    // The meaning lands on a loss too — the educational payload is separable from
    // whether the player "earned" the climax.
    expect(reachedMeaning, "storyMeaning panel shows even on a fail end").toBe(true);
    expect(text()).toContain("What it all added up to");
  });
});
