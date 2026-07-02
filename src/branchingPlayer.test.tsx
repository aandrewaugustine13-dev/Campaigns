// ════════════════════════════════════════════════════════════════
// STEP 1 (hardened) — the branching player, robust to real generator output.
//
//   A. validateStory CATCHES planted-broken graphs (dangling next, missing
//      start, loop trap with no reachable ending) and the player DEGRADES
//      gracefully (a clear fallback, never a crash, never a kid in a wall).
//   B. The player plays ALL THREE real generated stories (1812, reconstruction,
//      suffrage) to BOTH endings — the "works on the generator's output" check,
//      not "works on one happy story" — and the two paths in each reach DIFFERENT
//      endings with DIFFERENT choice-histories (the graph-native payoff).
//
// Run with:  npm run test:branching-player
// ════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import BranchingPlayer from "./BranchingPlayer";
import suffrage from "../generator/branching-narrative-suffrage.json";
import reconstruction from "../generator/branching-narrative-reconstruction.json";
import war1812 from "../generator/branching-narrative-1812.json";
import {
  validateStory,
  passageMap,
  type BranchingStory,
  type PlayResult,
  type StoryValidation,
} from "../generator/branchingStory";

const REAL_STORIES: Record<string, BranchingStory> = {
  "1812": war1812 as BranchingStory,
  reconstruction: reconstruction as BranchingStory,
  suffrage: suffrage as BranchingStory,
};

function shortestPathTo(story: BranchingStory, byId: Map<string, any>, endId: string): string[] {
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

function play(story: BranchingStory, byId: Map<string, any>, path: string[]): { result: PlayResult | null; domShowsEnding: boolean } {
  let result: PlayResult | null = null;
  const { container, getAllByRole, unmount } = render(<BranchingPlayer story={story} onEnd={(r) => { result = r; }} />);
  for (let k = 0; k < path.length - 1; k++) {
    const cur = byId.get(path[k])!;
    const choice = cur.choices!.find((c: any) => c.next === path[k + 1])!;
    // Choice buttons render a decorative per-theme marker glyph BEFORE the
    // choice text, so match on the text suffix (anchored — no substring
    // collisions) rather than exact equality.
    const btn = getAllByRole("button").find((b) => (b.textContent ?? "").trim().endsWith(choice.text.trim()));
    if (!btn) throw new Error(`no choice button "${choice.text}" at "${path[k]}"`);
    fireEvent.click(btn);
    // The player advances after a ~200ms "page turn" setTimeout; flush it so
    // the next passage (and, on the last step, the onEnd effect) is in the DOM.
    act(() => { vi.advanceTimersByTime(250); });
  }
  const endText = byId.get(path[path.length - 1])!.text.slice(0, 40);
  const domShowsEnding = (container.textContent ?? "").includes(endText);
  unmount();
  return { result, domShowsEnding };
}

// ── A. Planted-broken graphs: validator catches, player degrades ──
describe("branching player — robust to broken generator output", () => {
  const dangling: BranchingStory = {
    title: "Dangling", protagonist: "x", start: "p1",
    passages: [
      { id: "p1", text: "Go.", choices: [{ text: "onward", next: "ghost" }] }, // → nonexistent
      { id: "end", text: "Done.", ending: true },
    ],
  };
  const noStart: BranchingStory = {
    title: "No start", protagonist: "x", start: "nope",
    passages: [{ id: "p1", text: "Only.", ending: true }],
  };
  const loopTrap: BranchingStory = {
    title: "Trap", protagonist: "x", start: "a",
    passages: [
      { id: "a", text: "A.", choices: [{ text: "to b", next: "b" }] },
      { id: "b", text: "B.", choices: [{ text: "to a", next: "a" }] }, // a↔b forever
      { id: "end", text: "Unreachable end.", ending: true },
    ],
  };
  const benignUnreachable: BranchingStory = {
    title: "Stray", protagonist: "x", start: "p1",
    passages: [
      { id: "p1", text: "Start.", choices: [{ text: "finish", next: "end" }] },
      { id: "end", text: "Done.", ending: true, endingState: "triumphant" },
      { id: "stray", text: "Nobody reaches me.", ending: true, endingState: "indifferent" }, // unreachable, but harmless
    ],
  };

  it("CATCHES a dangling choice.next", () => {
    const v = validateStory(dangling);
    expect(v.playable).toBe(false);
    expect(v.findings.some((f) => f.code === "dangling-next")).toBe(true);
  });

  it("CATCHES a start id that isn't a passage", () => {
    const v = validateStory(noStart);
    expect(v.playable).toBe(false);
    expect(v.findings.some((f) => f.code === "no-start")).toBe(true);
  });

  it("CATCHES a loop trap (reachable, no ending reachable)", () => {
    const v = validateStory(loopTrap);
    expect(v.playable).toBe(false);
    expect(v.findings.some((f) => f.code === "trap-no-ending")).toBe(true);
  });

  it("WARNS on an unreachable passage but stays playable", () => {
    const v = validateStory(benignUnreachable);
    expect(v.playable).toBe(true);
    expect(v.findings.some((f) => f.code === "unreachable" && f.level === "warn")).toBe(true);
  });

  it("the PLAYER degrades gracefully on each broken story (no crash, no wall)", () => {
    for (const broken of [dangling, noStart, loopTrap]) {
      let unplayable: StoryValidation | null = null;
      const { container, queryAllByRole, unmount } = render(
        <BranchingPlayer story={broken} onUnplayable={(v) => { unplayable = v; }} />,
      );
      // Fallback shown, NOT the broken graph, and no choice buttons to wall into.
      expect(container.textContent).toContain("isn’t ready to play");
      expect(queryAllByRole("button").length).toBe(0);
      expect(unplayable, "onUnplayable fired with the findings").not.toBeNull();
      unmount();
      cleanup();
    }
  });
});

// ── THE COWBOY — companion reaction to the SPECIFIC pick, on the next passage ──
describe("branching player — the cowboy companion voice", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); cleanup(); });

  const story: BranchingStory = {
    title: "Cowboy", protagonist: "x", start: "p1",
    passages: [
      { id: "p1", text: "Tetzel preaches in the square.", choices: [
        { text: "confront him", next: "p2", cowboy: "Yellin' at one friar. Hundred more behind him." },
        { text: "walk away", next: "p2", cowboy: "Kept your head down. Most do." },
      ] },
      { id: "p2", text: "The square empties.", choices: [
        { text: "go home", next: "end", cowboy: "Home's still there. That's somethin'." },
      ] },
      { id: "end", text: "It is over.", ending: true, endingState: "indifferent" },
    ],
  };

  it("shows HIS reaction to the pick made (never the other option's), endings included", () => {
    const { container, getAllByRole } = render(<BranchingPlayer story={story} />);
    // Silent until the first pick — no companion box on the opening passage.
    expect(container.textContent).not.toContain("The Cowboy");

    const confront = getAllByRole("button").find((b) => (b.textContent ?? "").trim().endsWith("confront him"))!;
    fireEvent.click(confront);
    act(() => { vi.advanceTimersByTime(250); });
    expect(container.textContent).toContain("The Cowboy");
    expect(container.textContent).toContain("Yellin' at one friar");
    expect(container.textContent).not.toContain("Kept your head down"); // the road not taken stays silent

    // The final pick's line still lands on the ENDING passage.
    const home = getAllByRole("button").find((b) => (b.textContent ?? "").trim().endsWith("go home"))!;
    fireEvent.click(home);
    act(() => { vi.advanceTimersByTime(250); });
    expect(container.textContent).toContain("Home's still there");
    expect(container.textContent).toContain("It is over.");
  });

  it("legacy stories without cowboy lines keep the old consequence hint (no empty companion box)", () => {
    const legacy: BranchingStory = {
      title: "Legacy", protagonist: "x", start: "p1",
      passages: [
        { id: "p1", text: "Start.", choices: [{ text: "onward", next: "mid" }] },
        { id: "mid", text: "Middle.", choices: [{ text: "finish", next: "end" }] },
        { id: "end", text: "Done.", ending: true, endingState: "triumphant" },
      ],
    };
    const { container, getAllByRole } = render(<BranchingPlayer story={legacy} />);
    const btn = getAllByRole("button").find((b) => (b.textContent ?? "").trim().endsWith("onward"))!;
    fireEvent.click(btn);
    act(() => { vi.advanceTimersByTime(250); });
    expect(container.textContent).not.toContain("The Cowboy");
    expect(container.textContent).toContain("Because you chose this...");
  });
});

// ── B. Every real generated story plays clean to BOTH endings ──
describe("branching player — plays all three real generated stories", () => {
  // play() drives the player through its 200ms page-turn setTimeout; fake
  // timers let us flush each transition synchronously between clicks.
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  for (const [name, story] of Object.entries(REAL_STORIES)) {
    it(`${name}: validates playable and reaches BOTH endings with different histories`, () => {
      const v = validateStory(story);
      expect(v.playable, `${name} should be playable; findings: ${JSON.stringify(v.findings)}`).toBe(true);

      const byId = passageMap(story);
      const endings = story.passages.filter((p) => p.ending).map((p) => p.id);
      expect(endings.length).toBe(2);
      const [endA, endB] = endings;

      const A = play(story, byId, shortestPathTo(story, byId, endA));
      cleanup();
      const B = play(story, byId, shortestPathTo(story, byId, endB));

      expect(A.domShowsEnding && B.domShowsEnding, `${name}: both endings render in the DOM`).toBe(true);
      expect(A.result?.endingId).toBe(endA);
      expect(B.result?.endingId).toBe(endB);
      expect(A.result?.endingId).not.toBe(B.result?.endingId);
      expect(JSON.stringify(A.result?.history)).not.toEqual(JSON.stringify(B.result?.history));
      // every recorded step lands on a real passage; the last lands on the ending
      for (const s of A.result!.history) expect(byId.has(s.next)).toBe(true);
      const lastA = A.result!.history[A.result!.history.length - 1];
      expect(lastA.next).toBe(endA);
      cleanup();
    });
  }
});
