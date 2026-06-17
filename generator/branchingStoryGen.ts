// ════════════════════════════════════════════════════════════════
// BRANCHING-STORY GENERATOR — the callable module (foundation).
//
// Promotes the proof script's prompt into a real generateBranchingStory(inputs)
// that returns a VALIDATED BranchingStory. The craft prompt is REUSED VERBATIM
// (the one that produced Caleb / Tessa / Lottie) — not redesigned. The
// load-bearing part is robustness: every model output runs through validateStory
// (generator/branchingStory.ts), and a malformed graph (dangling next, loop trap,
// no reachable ending, missing start) triggers sighted re-generation, capped at
// N attempts. A broken story is NEVER returned — on exhaustion the result is a
// clear failure (ok:false), not a broken graph.
//
// SDK side only (the @anthropic-ai/sdk import). Mirrors storyPlanGen.ts.
// ════════════════════════════════════════════════════════════════
import Anthropic from "@anthropic-ai/sdk";
import { parseModelJson } from "./json.js";
import { validateStory, type BranchingStory, type StoryValidation } from "./branchingStory.js";

const MODEL = "claude-opus-4-8"; // the writer that produced the proven stories

// The EXACT craft prompt from the proof — reading level, person+history, real
// branching, exactly two earned endings, no game machinery. DO NOT redesign.
// Exported so the (throwaway) proof CLI shares this single source.
export const SYSTEM_PROMPT = `You are a gifted children's author writing an interactive, branching historical story — a choose-your-own-path adventure — for 11-to-12-year-olds (6th grade) to read on a tablet. You output ONLY a single JSON object. No prose outside the JSON, no markdown, no code fences.

YOUR ONE JOB: write a STORY a kid cannot put down. Not a textbook. Not a summary. Not a list of facts or "beats." A real story with a real person, real feelings, and real stakes, told so simply and so vividly that a struggling reader keeps tapping "next" because they have to know what happens. The history is delivered THROUGH the story — never as a lecture.

READING LEVEL — 6TH GRADE, TABLET-READ (non-negotiable):
- Short, simple sentences. Most under 12 words. Vary the rhythm, but keep it easy.
- Plain, everyday words a 6th grader knows. If you must use a hard word, make its meaning clear from the scene.
- Active voice. Concrete things you can see, hear, smell, and feel. Almost no abstraction.
- Second person, past tense: "You" are the character. Pull the reader inside the moment.
- A struggling reader must read it easily AND want to keep going. If a sentence is hard to read aloud, rewrite it.

THE PERSON AND THE HISTORY:
- Invent ONE ordinary young person living through this history — not a famous leader, a regular kid or young person caught up in it. Give them a name and a home, fast, in the first passage.
- Ground everything in the REAL history of the topic: real events, real conditions, real choices people faced. Do not invent fake history. Weave the real, testable facts of the topic INTO the scenes so a reader learns them by living them.
- Let the reader FEEL the meaning of this history through what happens to your character. NEVER state it as a lesson or a moral. Let them feel it.

BRANCHING — the choices must MATTER:
- This is a tree of passages. Each passage is one moment of the story: 3 to 6 flowing sentences, a real scene, not a headline.
- At choice points, give 2 or 3 choices. Each choice leads to a DIFFERENT passage where something genuinely different happens next — a different path, a different scene, a different fate. A choice that just leads to the same place is a fake choice; do not write fake choices.
- Real forks with real consequences. Some paths can rejoin a shared thread later, but there must be true divergence. End on EXACTLY TWO different endings, each EARNED by the path taken — one is not simply "good" and the other "bad"; both are true to the history, and an honest choice can cost something.
- Endings land with weight: a quiet, real, emotional close — never a "GAME OVER," never a moral spelled out.

SHAPE AND SIZE:
- Aim for about 20 to 30 passages. Long enough to be a real story with real branches; short enough that every passage earns its place. TRIM anything that does not carry the story or the feeling. Never pad, never repeat, never stall.
- NO game machinery of any kind: no numbers, no health, no scores, no day counts, no inventory, no stats. Only story and choices.

OUTPUT SHAPE (TypeScript for reference — output JSON only):
interface Choice { text: string; next: string; }   // next = the id of the passage this choice leads to
interface Passage { id: string; text: string; choices?: Choice[]; ending?: boolean; }  // ending passages have ending:true and NO choices
interface BranchingStory { title: string; protagonist: string; start: string; passages: Passage[]; }

RULES: ids are short kebab-case and unique. "start" is the id of the first passage. EVERY choice's "next" must be the id of a real passage in the list. Every passage either has 2-3 choices OR ending:true (never both, never neither). Exactly TWO passages are endings. No passage is unreachable from start. Output ONLY the JSON object conforming to BranchingStory.`;

export interface BranchingInputs {
  /** What the story is about (authoritative). */
  topic: string;
  /** The curriculum standard (TEKS) the story must teach, woven in as story. */
  standard: string;
  /** Optional teacher free-text: plain-language content the story MUST cover.
   * Accepted now even though the authoring UI comes later. */
  mustCover?: string;
}

export interface BranchingGenResult {
  /** True only when a VALIDATED, playable story is present. */
  ok: boolean;
  /** Present iff ok — guaranteed to pass validateStory (no broken graph ever returned). */
  story?: BranchingStory;
  /** The final attempt's validation (errors explain an ok:false). */
  validation: StoryValidation;
  attempts: number;
  /** The last raw model output (for inspection on failure). */
  raw: string;
}

function buildUserMessage(inputs: BranchingInputs, priorErrors?: string[]): string {
  const mustCover = inputs.mustCover && inputs.mustCover.trim()
    ? `\nMUST COVER (the teacher's required content — weave these naturally into the story, never as a list): ${inputs.mustCover.trim()}`
    : "";

  const base = `Write the complete branching story now for THIS topic.

TOPIC (what the story is about): ${inputs.topic}
STANDARD (the curriculum standard it must teach, delivered AS story, never lectured): ${inputs.standard}${mustCover}

Begin at "start" with the character's name and home and the moment the history reaches them. Simple words, short sentences, real feeling, real choices that change what happens next, exactly two earned endings. Output ONLY the JSON object conforming to BranchingStory.`;

  if (!priorErrors || priorErrors.length === 0) return base;
  // Sighted re-generation: the prior output was an UNPLAYABLE graph. Name the
  // exact failures and the invariants so the next attempt fixes them.
  return `${base}

YOUR PREVIOUS ATTEMPT PRODUCED AN UNPLAYABLE STORY GRAPH — these problems would crash the player or strand a reader. Write the whole story again and make ABSOLUTELY SURE: the "start" id is a real passage; EVERY choice's "next" is the id of a real passage; from EVERY passage a reader can always reach an ending (no loops with no exit); there are exactly two ending passages. Problems found:
${priorErrors.map((e) => `- ${e}`).join("\n")}`;
}

export async function generateBranchingStory(
  inputs: BranchingInputs,
  apiKey: string,
  opts: { maxAttempts?: number } = {},
): Promise<BranchingGenResult> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const client = new Anthropic({ apiKey, timeout: 10 * 60_000, maxRetries: 1 });

  let last: BranchingGenResult = {
    ok: false,
    validation: { findings: [{ level: "error", code: "root", message: "no attempt completed" }], playable: false },
    attempts: 0,
    raw: "",
  };
  let priorErrors: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(inputs, attempt > 1 ? priorErrors : undefined) }],
    });
    let raw = "";
    stream.on("text", (t) => { raw += t; });
    await stream.finalMessage();

    // Parse failure is just another invalid attempt — feed it back and retry.
    let parsed: unknown;
    try {
      parsed = parseModelJson<BranchingStory>(raw);
    } catch {
      const validation: StoryValidation = {
        findings: [{ level: "error", code: "root", message: "model output did not parse as JSON" }],
        playable: false,
      };
      last = { ok: false, validation, attempts: attempt, raw };
      priorErrors = ["the output did not parse as JSON — return ONLY the single JSON object, nothing else"];
      console.warn(`[branching] attempt ${attempt}/${maxAttempts}: parse failed — retrying`);
      continue;
    }

    const validation = validateStory(parsed);
    if (validation.playable) {
      return { ok: true, story: parsed as BranchingStory, validation, attempts: attempt, raw };
    }

    // Unplayable: record, feed the exact errors back, try again.
    last = { ok: false, validation, attempts: attempt, raw };
    priorErrors = validation.findings.filter((f) => f.level === "error").map((f) => `[${f.code}] ${f.message}`);
    console.warn(`[branching] attempt ${attempt}/${maxAttempts}: ${priorErrors.length} validation error(s) — re-generating:`);
    for (const e of priorErrors) console.warn(`[branching]    ✗ ${e}`);
  }

  // Exhausted: return the failure (ok:false). NEVER a broken story.
  return last;
}
