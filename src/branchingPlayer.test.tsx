// ════════════════════════════════════════════════════════════════
// STEP 1 proof — the branching player, on a REAL generated story.
//
// Drives the ACTUAL <BranchingPlayer> through two different paths of the
// generated suffrage story and asserts the "two kids, two endings" payoff —
// now NATIVE to the passage graph, not assembled: the two paths reach DIFFERENT
// ending passages (shown in the DOM) and record DIFFERENT choice-histories (the
// data the responsive ending + quiz will read).
//
// Run with:  npm run test:branching-player
// ════════════════════════════════════════════════════════════════
import { describe, it, expect } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import BranchingPlayer from "./BranchingPlayer";
import storyJson from "../generator/branching-narrative-suffrage.json";
import { passageMap, type BranchingStory, type PlayResult } from "../generator/branchingStory";

const story = storyJson as BranchingStory;
const byId = passageMap(story);

// Shortest path (sequence of passage ids) from start to a given ending — derived
// from the story itself, not hardcoded, so the test rides the real graph.
function shortestPathTo(endId: string): string[] {
  const seen = new Set([story.start]);
  const queue: string[][] = [[story.start]];
  while (queue.length) {
    const path = queue.shift()!;
    const id = path[path.length - 1];
    if (id === endId) return path;
    for (const c of byId.get(id)?.choices ?? []) {
      if (!seen.has(c.next)) { seen.add(c.next); queue.push([...path, c.next]); }
    }
  }
  throw new Error(`no path to "${endId}"`);
}

// Play the real component along a path by CLICKING the choice button whose `next`
// matches each step. Returns the recorded result + whether the ending text shows.
function play(path: string[]): { result: PlayResult | null; domShowsEnding: boolean } {
  let result: PlayResult | null = null;
  const { container, getAllByRole, unmount } = render(
    <BranchingPlayer story={story} onEnd={(r) => { result = r; }} />,
  );
  for (let k = 0; k < path.length - 1; k++) {
    const cur = byId.get(path[k])!;
    const choice = cur.choices!.find((c) => c.next === path[k + 1])!;
    const btn = getAllByRole("button").find((b) => (b.textContent ?? "").trim() === choice.text.trim());
    if (!btn) throw new Error(`no choice button "${choice.text}" at passage "${path[k]}"`);
    fireEvent.click(btn);
  }
  const endText = byId.get(path[path.length - 1])!.text.slice(0, 40);
  const domShowsEnding = (container.textContent ?? "").includes(endText);
  unmount();
  return { result, domShowsEnding };
}

describe("branching player — two kids, two endings, native to the graph", () => {
  it("two paths reach DIFFERENT endings and record DIFFERENT choice-histories", () => {
    const endings = story.passages.filter((p) => p.ending).map((p) => p.id);
    expect(endings.length, "the story has two endings").toBe(2);
    const [endA, endB] = endings;

    const A = play(shortestPathTo(endA));
    cleanup();
    const B = play(shortestPathTo(endB));

    // The payoff, observed in the DOM: each path renders its OWN ending text.
    expect(A.domShowsEnding, "path A reached its ending in the DOM").toBe(true);
    expect(B.domShowsEnding, "path B reached its ending in the DOM").toBe(true);

    // Different ending passages.
    expect(A.result?.endingId).toBe(endA);
    expect(B.result?.endingId).toBe(endB);
    expect(A.result?.endingId).not.toBe(B.result?.endingId);

    // Different choice-histories — the recorded path the ending/quiz will read.
    expect((A.result?.history.length ?? 0)).toBeGreaterThan(0);
    expect((B.result?.history.length ?? 0)).toBeGreaterThan(0);
    expect(JSON.stringify(A.result?.history)).not.toEqual(JSON.stringify(B.result?.history));

    // The history records the structured step (passageId / choiceIndex / next).
    const step = A.result!.history[0];
    expect(step).toMatchObject({
      passageId: expect.any(String),
      choiceIndex: expect.any(Number),
      choiceText: expect.any(String),
      next: expect.any(String),
    });
    // Every recorded step's `next` is a real passage, and the last lands on the ending.
    for (const s of A.result!.history) expect(byId.has(s.next)).toBe(true);
    expect(A.result!.history[A.result!.history.length - 1].next).toBe(endA);
  });

  it("a single path: clicking choices walks the graph and stops at an ending", () => {
    const endings = story.passages.filter((p) => p.ending).map((p) => p.id);
    const path = shortestPathTo(endings[0]);
    const { result, domShowsEnding } = play(path);
    expect(domShowsEnding).toBe(true);
    expect(result?.endingId).toBe(endings[0]);
    // The walked passage ids match the derived path exactly.
    const walked = [story.start, ...result!.history.map((s) => s.next)];
    expect(walked).toEqual(path);
  });
});
