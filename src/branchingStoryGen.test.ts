// Proves the generateBranchingStory REPAIR loop by EXERCISE (mocked Anthropic
// client, scripted output per attempt) — the robustness the live CLI can't
// guarantee on its own: a model that returns a BROKEN graph must trigger a
// sighted re-generation, and a story that never validates must NEVER be returned
// (ok:false), not silently shipped. The real parseModelJson + validateStory run
// unmocked, so the validator is the actual gate.
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({ userMessages: [] as string[], responses: [] as string[] }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      stream: (args: { messages: { content: string }[] }) => {
        const idx = h.userMessages.length;
        h.userMessages.push(args.messages[0].content);
        const text = h.responses[idx] ?? h.responses[h.responses.length - 1] ?? "{}";
        return {
          on(event: string, cb: (t: string) => void) { if (event === "text") cb(text); return this; },
          finalMessage: async () => ({}),
        };
      },
    };
  },
}));

import { generateBranchingStory } from "../generator/branchingStoryGen";
import { validateStory, type BranchingStory } from "../generator/branchingStory";

// A minimal VALID story: start forks to two endings — playable, two endings, no traps.
function validStory(): BranchingStory {
  return {
    title: "T", protagonist: "x", start: "p1",
    passages: [
      { id: "p1", text: "Start.", choices: [{ text: "a", next: "e1" }, { text: "b", next: "e2" }] },
      { id: "e1", text: "End A.", ending: true },
      { id: "e2", text: "End B.", ending: true },
    ],
  };
}
// BROKEN: a dangling next (p1 → "ghost") — the player would wall.
function brokenStory(): BranchingStory {
  return {
    title: "T", protagonist: "x", start: "p1",
    passages: [
      { id: "p1", text: "Start.", choices: [{ text: "a", next: "ghost" }, { text: "b", next: "e2" }] },
      { id: "e2", text: "End.", ending: true },
    ],
  };
}

describe("generateBranchingStory — robustness (repair loop, exercised)", () => {
  beforeEach(() => { h.userMessages = []; h.responses = []; });

  it("the fixtures are what we think (valid is playable, broken has a dangling next)", () => {
    expect(validateStory(validStory()).playable).toBe(true);
    const v = validateStory(brokenStory());
    expect(v.playable).toBe(false);
    expect(v.findings.some((f) => f.code === "dangling-next")).toBe(true);
  });

  it("re-generates: a broken first attempt → retries WITH the errors fed back → valid second attempt", async () => {
    h.responses = [JSON.stringify(brokenStory()), JSON.stringify(validStory())];

    const res = await generateBranchingStory({ topic: "t", standard: "s" }, "key");

    // It actually RETRIED (two model calls), not one-and-done.
    expect(h.userMessages.length).toBe(2);
    // First attempt was blind; the SECOND fed the graph errors back.
    expect(h.userMessages[0]).not.toMatch(/UNPLAYABLE STORY GRAPH/);
    expect(h.userMessages[1]).toMatch(/UNPLAYABLE STORY GRAPH/);
    expect(h.userMessages[1]).toMatch(/dangling-next/);
    // And it RECOVERED with a VALIDATED story.
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(2);
    expect(res.validation.playable).toBe(true);
    expect(res.story).toBeDefined();
  });

  it("NEVER returns a broken story: always-invalid → ok:false, no story, after maxAttempts", async () => {
    h.responses = [JSON.stringify(brokenStory())]; // every attempt is broken

    const res = await generateBranchingStory({ topic: "t", standard: "s" }, "key", { maxAttempts: 3 });

    expect(h.userMessages.length).toBe(3);
    expect(res.ok).toBe(false);
    expect(res.story).toBeUndefined(); // a malformed graph is never shipped
    expect(res.validation.playable).toBe(false);
    expect(res.validation.findings.some((f) => f.level === "error")).toBe(true);
  });

  it("does NOT retry when the first attempt is already valid (no wasted call)", async () => {
    h.responses = [JSON.stringify(validStory())];
    const res = await generateBranchingStory({ topic: "t", standard: "s" }, "key");
    expect(h.userMessages.length).toBe(1);
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(1);
  });

  it("treats unparseable output as an invalid attempt and re-generates", async () => {
    h.responses = ["this is not json at all", JSON.stringify(validStory())];
    const res = await generateBranchingStory({ topic: "t", standard: "s" }, "key");
    expect(h.userMessages.length).toBe(2);
    expect(h.userMessages[1]).toMatch(/parse as JSON|UNPLAYABLE/);
    expect(res.ok).toBe(true);
  });

  it("threads the teacher's mustCover note into the prompt", async () => {
    h.responses = [JSON.stringify(validStory())];
    await generateBranchingStory({ topic: "t", standard: "s", mustCover: "SHOW_THE_CHALK_MARKS" }, "key");
    expect(h.userMessages[0]).toMatch(/MUST COVER/);
    expect(h.userMessages[0]).toMatch(/SHOW_THE_CHALK_MARKS/);
  });
});
