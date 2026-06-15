// Proves the generateStoryPlan REPAIR loop by EXERCISE (not by analogy): with a
// mocked Anthropic client we control the model's output per attempt and assert
// the loop actually retries with feedback and recovers — answering the question
// the UI tests can't: "does a stake-0 plan get repaired, or burn attempts and
// fall through?" The real parseModelJson + validateStoryPlan run unmocked.

import { describe, it, expect, beforeEach, vi } from "vitest";

// Shared, hoisted state the mock reads (vi.mock is hoisted above imports).
const h = vi.hoisted(() => ({ userMessages: [] as string[], responses: [] as string[] }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      stream: (args: { messages: { content: string }[] }) => {
        // Record the user message for this attempt, then emit the scripted
        // response for this attempt index (last response reused if we run past).
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

import { generateStoryPlan } from "../generator/storyPlanGen";
import { validateStoryPlan } from "../generator/storyPlan";

function validPlan() {
  return {
    throughline: "A republic stumbles into a needless war and salvages pride from it.",
    meaning: "It settled nothing it fought over, yet handed the nation a unifying myth.",
    beats: [
      { id: "c", role: "cause", title: "War vote", scene: "Congress votes for war.", significance: "why c", phaseHint: 0.1, included: true, choices: [{ text: "a", result: "r", stake: 5 }, { text: "b", result: "r", stake: -3 }] },
      { id: "e", role: "escalation", title: "Capital burns", scene: "Washington burns.", significance: "why e", phaseHint: 0.5, included: true, choices: [{ text: "a", result: "r", stake: 4 }, { text: "b", result: "r", stake: -2 }] },
      { id: "k", role: "climax", title: "New Orleans", scene: "Jackson holds the line.", significance: "why k", phaseHint: 0.85, included: true, choices: [{ text: "a", result: "r", stake: 9 }, { text: "b", result: "r", stake: -6 }] },
      { id: "r", role: "resolution", title: "Treaty news", scene: "Peace was already signed.", significance: "why r", phaseHint: 0.95, included: true },
    ],
  };
}
function malformedPlan() {
  const p = validPlan();
  p.beats.find((b) => b.id === "k")!.choices![0].stake = 0; // forbidden stake-0 on a decision beat
  return p;
}

describe("generateStoryPlan — repair loop (exercised, not assumed)", () => {
  beforeEach(() => { h.userMessages = []; h.responses = []; });

  it("the fixtures are what we think (malformed errors on stake, valid is clean)", () => {
    expect(validateStoryPlan(validPlan()).filter((f) => f.level === "error")).toEqual([]);
    expect(validateStoryPlan(malformedPlan()).some((f) => f.level === "error" && /stake/.test(f.field))).toBe(true);
  });

  it("repairs: malformed first attempt → retries WITH the error fed back → clean second attempt", async () => {
    h.responses = [JSON.stringify(malformedPlan()), JSON.stringify(validPlan())];

    const res = await generateStoryPlan("std", "key", { topic: "War of 1812" });

    // It actually RETRIED (two model calls), not one-and-done.
    expect(h.userMessages.length).toBe(2);
    // The first attempt was blind; the SECOND fed the stake error back.
    expect(h.userMessages[0]).not.toMatch(/PREVIOUS ATTEMPT FAILED/);
    expect(h.userMessages[1]).toMatch(/PREVIOUS ATTEMPT FAILED/);
    expect(h.userMessages[1]).toMatch(/stake/i);
    // And it RECOVERED: the returned plan is the clean one, no errors.
    expect(res.findings.filter((f) => f.level === "error")).toEqual([]);
    expect(res.data.beats.find((b) => b.id === "k")!.choices![0].stake).toBe(9);
  });

  it("does NOT retry when the first attempt is already clean (no wasted call)", async () => {
    h.responses = [JSON.stringify(validPlan())];
    const res = await generateStoryPlan("std", "key", {});
    expect(h.userMessages.length).toBe(1);
    expect(res.findings.filter((f) => f.level === "error")).toEqual([]);
  });

  it("falls through after exhausting repairs, surfacing errors for the UI backstop", async () => {
    // Always malformed: 1 initial + maxRepair(2) = 3 calls, then return last (still erroring).
    h.responses = [JSON.stringify(malformedPlan())];
    const res = await generateStoryPlan("std", "key", {}, { maxRepair: 2 });
    expect(h.userMessages.length).toBe(3);
    expect(res.findings.some((f) => f.level === "error" && /stake/.test(f.field))).toBe(true);
  });
});
