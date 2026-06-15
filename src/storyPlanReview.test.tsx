// Tests for the teacher's narrative-plan review (step 8): the pure include/
// exclude logic and the checklist component.
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { NarrativePlan } from "../generator/storyPlan";
import { setBeatIncluded, toggleBeatIncluded, reviewStatus } from "./storyPlanReview";
import StoryPlanReview from "./StoryPlanReview";

function dc(id: string, role: string, stake = 5) {
  return { id, role, title: `Title ${id}`, scene: `Scene ${id}.`, significance: `Why ${id} matters`,
    choices: [{ text: "a", result: "ra", effects: undefined, stake }, { text: "b", result: "rb", stake: -2 }],
    phaseHint: 0.5, included: true };
}
function makePlan(): NarrativePlan {
  return {
    throughline: "A spine.",
    meaning: "What it all added up to.",
    beats: [
      { id: "c", role: "cause", title: "Cause beat", scene: "S c.", significance: "why c", choices: [{ text: "x", result: "rx", stake: 3 }, { text: "y", result: "ry", stake: -1 }], phaseHint: 0.1, included: true },
      { id: "e1", role: "escalation", title: "Escalation one", scene: "S e1.", significance: "why e1", choices: [{ text: "x", result: "rx", stake: 4 }, { text: "y", result: "ry", stake: -2 }], phaseHint: 0.4, included: true },
      { id: "k", role: "climax", title: "Climax beat", scene: "S k.", significance: "why k", choices: [{ text: "x", result: "rx", stake: 9 }, { text: "y", result: "ry", stake: -5 }], phaseHint: 0.8, included: true },
      { id: "r", role: "resolution", title: "Resolution beat", scene: "S r.", significance: "why r", phaseHint: 0.95, included: true },
    ],
  } as unknown as NarrativePlan;
}

describe("storyPlanReview — pure logic", () => {
  it("setBeatIncluded is immutable and targeted", () => {
    const p = makePlan();
    const p2 = setBeatIncluded(p, "e1", false);
    expect(p.beats.find((b) => b.id === "e1")!.included).toBe(true); // original untouched
    expect(p2.beats.find((b) => b.id === "e1")!.included).toBe(false);
    expect(p2.beats.find((b) => b.id === "c")!.included).toBe(true); // others untouched
    expect(p2).not.toBe(p);
  });

  it("toggleBeatIncluded flips the flag", () => {
    const p = toggleBeatIncluded(makePlan(), "k");
    expect(p.beats.find((b) => b.id === "k")!.included).toBe(false);
  });

  it("canConfirm stays true when an escalation is excluded (still a valid arc)", () => {
    const p = setBeatIncluded(makePlan(), "e1", false);
    const s = reviewStatus(p);
    expect(s.canConfirm).toBe(true);
    expect(s.includedCount).toBe(3);
  });

  it("canConfirm goes FALSE when the only climax is excluded (arc breaks)", () => {
    const p = setBeatIncluded(makePlan(), "k", false);
    const s = reviewStatus(p);
    expect(s.canConfirm).toBe(false);
    expect(s.errors.join(" ")).toMatch(/climax/i);
  });

  it("canConfirm goes FALSE when the cause is excluded", () => {
    expect(reviewStatus(setBeatIncluded(makePlan(), "c", false)).canConfirm).toBe(false);
  });
});

describe("StoryPlanReview — checklist component", () => {
  it("renders a checkbox per beat and excludes on uncheck without breaking a valid arc", () => {
    const onConfirm = vi.fn();
    const { getAllByRole, getByText } = render(<StoryPlanReview plan={makePlan()} onConfirm={onConfirm} />);

    const checkboxes = getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(4);

    // Uncheck the escalation (index 1) — arc still holds, Build stays enabled.
    fireEvent.click(checkboxes[1]);
    const build = getByText(/build campaign/i) as HTMLButtonElement;
    expect(build.disabled).toBe(false);

    fireEvent.click(build);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const passed = onConfirm.mock.calls[0][0] as NarrativePlan;
    expect(passed.beats.find((b) => b.id === "e1")!.included).toBe(false);
    expect(passed.beats.filter((b) => b.included)).toHaveLength(3);
  });

  it("disables Build and warns when the climax is unchecked", () => {
    const onConfirm = vi.fn();
    const { getAllByRole, getByText, container } = render(<StoryPlanReview plan={makePlan()} onConfirm={onConfirm} />);
    // climax is the 3rd checkbox (index 2)
    fireEvent.click(getAllByRole("checkbox")[2]);
    const build = getByText(/build campaign/i) as HTMLButtonElement;
    expect(build.disabled).toBe(true);
    expect((container.textContent ?? "").toLowerCase()).toContain("arc no longer holds");
    fireEvent.click(build);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
