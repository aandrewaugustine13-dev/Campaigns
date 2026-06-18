// Confirms a generation WARNING (notably the fact-gate "could not verify the
// history" finding from Step 5) surfaces to the teacher in the review screen
// BEFORE publish — an unverified story must never reach a kid silently.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import BranchingReview from "./BranchingReview";
import type { BranchingStory } from "../generator/branchingStory";

// The review screen lazily fetches passage images on mount; no network in tests.
beforeEach(() => { vi.stubGlobal("fetch", () => Promise.reject(new Error("no network"))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const story: BranchingStory = {
  title: "T", protagonist: "x", start: "p1",
  passages: [
    { id: "p1", text: "Start.", choices: [{ text: "a", next: "e1" }, { text: "b", next: "e2" }] },
    { id: "e1", text: "End A.", ending: true },
    { id: "e2", text: "End B.", ending: true },
  ],
};

describe("BranchingReview — generation warnings are teacher-visible before publish", () => {
  it("shows the fact-gate warning banner when a notice is present", () => {
    render(
      <BranchingReview
        story={story}
        notices={["history could not be fact-checked (gate error) — shipping unverified"]}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText(/could not be fact-checked/i)).toBeTruthy();
    expect(screen.getByText(/review the history yourself before publishing/i)).toBeTruthy();
  });

  it("shows NO banner when there are no notices", () => {
    render(<BranchingReview story={story} notices={[]} onConfirm={() => {}} />);
    expect(screen.queryByText(/review the history yourself before publishing/i)).toBeNull();
  });
});
