// Proves the generateBranchingStory REPAIR loop by EXERCISE (mocked Gemini
// client, scripted output per attempt) — the robustness the live CLI can't
// guarantee on its own: a model that returns a BROKEN graph must trigger a
// sighted re-generation, and a story that never validates must NEVER be returned
// (ok:false), not silently shipped. The real parseModelJson + validateStory run
// unmocked, so the validator is the actual gate.
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({ userMessages: [] as string[], responses: [] as string[] }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async (args: { contents: string }) => {
        const idx = h.userMessages.length;
        h.userMessages.push(args.contents);
        const text = h.responses[idx] ?? h.responses[h.responses.length - 1] ?? "{}";
        return { text };
      },
    };
  },
  Type: {
    TYPE_UNSPECIFIED: "TYPE_UNSPECIFIED", STRING: "STRING", NUMBER: "NUMBER",
    INTEGER: "INTEGER", BOOLEAN: "BOOLEAN", ARRAY: "ARRAY", OBJECT: "OBJECT", NULL: "NULL",
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
      { id: "e1", text: "End A.", ending: true, endingState: "triumphant" },
      { id: "e2", text: "End B.", ending: true, endingState: "broken" },
    ],
  };
}
// BROKEN: a dangling next (p1 → "ghost") — the player would wall.
function brokenStory(): BranchingStory {
  return {
    title: "T", protagonist: "x", start: "p1",
    passages: [
      { id: "p1", text: "Start.", choices: [{ text: "a", next: "ghost" }, { text: "b", next: "e2" }] },
      { id: "e2", text: "End.", ending: true, endingState: "indifferent" },
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

    const res = await generateBranchingStory({ topic: "t", standard: "s" }, "key", { factGate: false });

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

    const res = await generateBranchingStory({ topic: "t", standard: "s" }, "key", { maxAttempts: 3, factGate: false });

    expect(h.userMessages.length).toBe(3);
    expect(res.ok).toBe(false);
    expect(res.story).toBeUndefined(); // a malformed graph is never shipped
    expect(res.validation.playable).toBe(false);
    expect(res.validation.findings.some((f) => f.level === "error")).toBe(true);
  });

  it("does NOT retry when the first attempt is already valid (no wasted call)", async () => {
    h.responses = [JSON.stringify(validStory())];
    const res = await generateBranchingStory({ topic: "t", standard: "s" }, "key", { factGate: false });
    expect(h.userMessages.length).toBe(1);
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(1);
  });

  it("treats unparseable output as an invalid attempt and re-generates", async () => {
    h.responses = ["this is not json at all", JSON.stringify(validStory())];
    const res = await generateBranchingStory({ topic: "t", standard: "s" }, "key", { factGate: false });
    expect(h.userMessages.length).toBe(2);
    expect(h.userMessages[1]).toMatch(/parse as JSON|UNPLAYABLE/);
    expect(res.ok).toBe(true);
  });

  it("threads the teacher's mustCover note into the prompt", async () => {
    h.responses = [JSON.stringify(validStory())];
    await generateBranchingStory({ topic: "t", standard: "s", mustCover: "SHOW_THE_CHALK_MARKS" }, "key", { factGate: false });
    expect(h.userMessages[0]).toMatch(/MUST COVER/);
    expect(h.userMessages[0]).toMatch(/SHOW_THE_CHALK_MARKS/);
  });
});

// ── factGate (HISTORY) wiring — detector-proves-the-cure ─────────────────────
// The real factGate orchestration (detect → correct → re-verify) and the real
// applyOps string surgery run UNMOCKED; only the model RESPONSES are scripted.
// So these prove the WIRING: a playable graph with a planted false fact is
// caught and corrected before it ships, a clean story passes untouched, and an
// uncorrectable fabrication is never shipped (it forces a re-generation).
describe("generateBranchingStory — factGate (history) is wired into the loop", () => {
  beforeEach(() => { h.userMessages = []; h.responses = []; });

  function validStory(): BranchingStory {
    return {
      title: "T", protagonist: "x", start: "p1",
      passages: [
        { id: "p1", text: "Start.", choices: [{ text: "a", next: "e1" }, { text: "b", next: "e2" }] },
        { id: "e1", text: "End A.", ending: true, endingState: "triumphant" },
        { id: "e2", text: "End B.", ending: true, endingState: "broken" },
      ],
    };
  }
  function storyWithClaim(text: string): BranchingStory {
    const s = validStory();
    s.passages[0].text = text; // the opening passage carries the (false) historical claim
    return s;
  }
  const FALSE_CLAIM = "The War of 1812 began in the year 1066.";
  const TRUE_FIX = "The War of 1812 began in the year 1812.";

  it("CATCHES a planted fabrication and CORRECTS it in place before shipping (one generation, no re-gen)", async () => {
    h.responses = [
      JSON.stringify(storyWithClaim(FALSE_CLAIM)),                                                                              // 0: generation — playable graph, WRONG history
      JSON.stringify({ claims: [{ quote: FALSE_CLAIM, why: "the war began in 1812, not 1066", kind: "external", correct: TRUE_FIX }] }), // 1: factCheck flags it
      JSON.stringify({ ops: [{ op: "replace", find: FALSE_CLAIM, replace: TRUE_FIX }] }),                                       // 2: corrector op
      JSON.stringify({ unresolved: [] }),                                                                                       // 3: re-verify — resolved
    ];

    const res = await generateBranchingStory({ topic: "the War of 1812", standard: "s" }, "key");

    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(1);                 // fixed by CORRECTION, not a re-generation
    expect(res.factGate?.status).toBe("clean");
    expect(res.factGate?.flagged).toBe(1);
    expect(res.factGate?.opsApplied).toBe(1);
    // THE CURE: the shipped story no longer teaches the fabrication.
    const start = res.story!.passages.find((p) => p.id === res.story!.start)!;
    expect(start.text).toContain("1812");
    expect(start.text).not.toContain("1066");
    // The string surgery did not break the graph.
    expect(validateStory(res.story!).playable).toBe(true);
  });

  it("passes a CLEAN story UNTOUCHED (no correction, prose unchanged)", async () => {
    const clean = validStory();
    h.responses = [
      JSON.stringify(clean),          // 0: generation
      JSON.stringify({ claims: [] }), // 1: factCheck — nothing wrong
    ];

    const res = await generateBranchingStory({ topic: "t", standard: "s" }, "key");

    expect(res.ok).toBe(true);
    expect(h.userMessages.length).toBe(2);          // generation + one fact check, no corrector/re-verify
    expect(res.factGate?.status).toBe("clean");
    expect(res.factGate?.flagged).toBe(0);
    expect(res.factGate?.opsApplied).toBe(0);
    // byte-identical content — factGate touched nothing; the generator's
    // own outputLanguage stamp is the only addition.
    expect(res.story).toEqual({ ...clean, outputLanguage: "English" });
  });

  it("NEVER ships an uncorrectable fabrication — it re-generates with the HISTORY error fed back", async () => {
    h.responses = [
      JSON.stringify(storyWithClaim(FALSE_CLAIM)),                                                                              // 0: gen attempt 1 — wrong history
      JSON.stringify({ claims: [{ quote: FALSE_CLAIM, why: "the war began in 1812", kind: "external", correct: TRUE_FIX }] }), // 1: factCheck flags
      JSON.stringify({ ops: [{ op: "replace", find: "A SUBSTRING THAT APPEARS NOWHERE IN THE STORY", replace: "x" }] }),       // 2: corrector op cannot apply -> residual stands
      JSON.stringify(validStory()),                                                                                            // 3: gen attempt 2 — clean
      JSON.stringify({ claims: [] }),                                                                                          // 4: factCheck attempt 2 — clean
    ];

    const res = await generateBranchingStory({ topic: "the War of 1812", standard: "s" }, "key", { maxAttempts: 3 });

    expect(res.attempts).toBe(2);                   // it RE-GENERATED rather than ship the fabrication
    expect(res.ok).toBe(true);
    // The re-gen prompt named the HISTORICAL error — not a graph error.
    const regenPrompt = h.userMessages[3];
    expect(regenPrompt).toMatch(/HISTORICAL ERRORS/);
    expect(regenPrompt).toContain("1066");
    expect(regenPrompt).not.toMatch(/UNPLAYABLE STORY GRAPH/);
    // The shipped story is the clean one.
    expect(res.factGate?.status).toBe("clean");
    expect(res.story!.passages.find((p) => p.id === res.story!.start)!.text).not.toContain("1066");
  });
});
