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
import { runFactGate, type FactGateResult } from "./factGate.js";

const MODEL = "claude-opus-4-8"; // the writer that produced the proven stories

// The EXACT craft prompt from the proof — reading level, person+history, real
// branching, exactly two earned endings, no game machinery. DO NOT redesign.
// Exported so the (throwaway) proof CLI shares this single source.
export const SYSTEM_PROMPT = `You are a gifted author writing an interactive, branching historical story — a choose-your-own-path adventure — to read on a tablet. The story's CONTENT MATURITY and PROSE REGISTER are specified per-story in the instructions below; obey them exactly. You output ONLY a single JSON object. No prose outside the JSON, no markdown, no code fences.

YOUR ONE JOB: write a STORY a kid cannot put down. Not a textbook. Not a summary. Not a list of facts or "beats." A real story with a real person, real feelings, and real stakes, told so simply and so vividly that a struggling reader keeps tapping "next" because they have to know what happens. The history is delivered THROUGH the story — never as a lecture.

VOICE (the AUDIENCE block in the instructions sets sentence style and how mature the content is — obey it):
- Second person, past tense: "You" are the character. Pull the reader inside the moment.
- Active voice. Concrete things you can see, hear, smell, and feel. Show what happens; do not summarize or lecture.
- CONTENT MATURITY and PROSE REGISTER are SEPARATE and INDEPENDENT. The subject matter can be fully mature while the language stays plain and direct. Never soften the history to match plain language, and never ornament the language to match mature content.

THE PERSON AND THE HISTORY:
- Invent ONE ordinary young person who is a PARTICIPANT in this history — not a famous leader, but someone with a ROLE that positions them where the real, documented events are proximate and visible: a militiaman, a powder boy, a message runner, a mill worker, a marcher, a nurse's helper. NOT a bystander hearing about events secondhand. Their role must put real, nameable events, places, and things directly into the scenes they live. Give them a name, a home, and that role, fast, in the first passage.
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
  /** AUDIENCE — two INDEPENDENT dials, threaded from the gate (like topic/standard).
   * Do not collapse them. */
  /** How honestly to depict fear, violence, death, moral complexity (e.g. "mature").
   * Defaults to "mature" — honest, not sanitized. */
  contentMaturity?: string;
  /** A HARD prose constraint (e.g. "direct"): short declarative sentences, concrete
   * words, no flourish — accessibility through concreteness, NOT lowered maturity.
   * Defaults to "direct". */
  proseRegister?: string;
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
  /** The history fact-check result for the returned story (absent if the fact
   * gate was disabled or no story was produced). status "clean" means it shipped
   * with no uncorrected fabrications. */
  factGate?: FactGateResult;
}

function buildUserMessage(inputs: BranchingInputs, priorErrors?: string[], priorFactErrors?: string[]): string {
  const mustCover = inputs.mustCover && inputs.mustCover.trim()
    ? `\nMUST COVER (the teacher's required content — weave these naturally into the story, never as a list): ${inputs.mustCover.trim()}`
    : "";

  // AUDIENCE — two INDEPENDENT dials, threaded like topic/standard. The semantics
  // are fixed (what "mature"/"direct" demand); only the dial VALUES come from the gate.
  const maturity = (inputs.contentMaturity && inputs.contentMaturity.trim()) || "mature";
  const register = (inputs.proseRegister && inputs.proseRegister.trim()) || "direct";
  const audience = `
CONTENT MATURITY (${maturity}): depict the historical fear, violence, death, and moral complexity of this topic HONESTLY — do NOT sanitize it. The reader can handle hard truth told plainly. Death and horror happen AROUND the protagonist — to others, near them, threatening them — and you must not look away from it or soften it into comfort. But the protagonist THEMSELVES survives to the aftermath; their death is never an ending. Do not add gratuitous gore.
PROSE REGISTER (${register}) — a HARD constraint, not a tone: short, declarative sentences; common, concrete words; sensory and specific, never abstract; minimal idiom; no metaphor-stacking; no flowery or literary flourish. Spare and visceral, not ornate. This register serves a reading-support and emergent-bilingual audience — accessibility comes from CONCRETENESS, never from softened or simplified subject matter. Maturity stays high; only the language is plain.`;

  const base = `Write the complete branching story now for THIS topic.

TOPIC (what the story is about): ${inputs.topic}
STANDARD (the curriculum standard it must teach, delivered AS story, never lectured): ${inputs.standard}${mustCover}
${audience}

Begin at "start" with the character's name and home and the moment the history reaches them. Simple words, short sentences, real feeling, real choices that change what happens next, exactly two earned endings. Output ONLY the JSON object conforming to BranchingStory.`;

  const blocks: string[] = [];
  // Sighted re-generation (graph): the prior output was an UNPLAYABLE graph.
  if (priorErrors && priorErrors.length > 0) {
    blocks.push(`YOUR PREVIOUS ATTEMPT PRODUCED AN UNPLAYABLE STORY GRAPH — these problems would crash the player or strand a reader. Write the whole story again and make ABSOLUTELY SURE: the "start" id is a real passage; EVERY choice's "next" is the id of a real passage; from EVERY passage a reader can always reach an ending (no loops with no exit); there are exactly two ending passages. Problems found:
${priorErrors.map((e) => `- ${e}`).join("\n")}`);
  }
  // Sighted re-generation (history): the prior output stated false/invented facts.
  if (priorFactErrors && priorFactErrors.length > 0) {
    blocks.push(`YOUR PREVIOUS ATTEMPT CONTAINED HISTORICAL ERRORS — false or invented facts. A kids' history tool must never teach a wrong fact. Write the whole story again and keep EVERY historical detail (dates, numbers, named real people, places, events, causes) accurate; weave the corrected facts in naturally. Errors found:
${priorFactErrors.map((e) => `- ${e}`).join("\n")}`);
  }
  if (blocks.length === 0) return base;
  return `${base}\n\n${blocks.join("\n\n")}`;
}

export async function generateBranchingStory(
  inputs: BranchingInputs,
  apiKey: string,
  opts: { maxAttempts?: number; factGate?: boolean } = {},
): Promise<BranchingGenResult> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const useFactGate = opts.factGate !== false; // default ON
  const client = new Anthropic({ apiKey, timeout: 10 * 60_000, maxRetries: 1 });

  let last: BranchingGenResult = {
    ok: false,
    validation: { findings: [{ level: "error", code: "root", message: "no attempt completed" }], playable: false },
    attempts: 0,
    raw: "",
  };
  let priorErrors: string[] = [];
  let priorFactErrors: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(inputs, attempt > 1 ? priorErrors : undefined, attempt > 1 ? priorFactErrors : undefined) }],
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
      const story = parsed as BranchingStory;

      // The graph is playable — now the HISTORY must hold up. A kids' history
      // tool must never teach a fabricated date, number, person, or event, so we
      // fact-check the prose with the project's factGate (detect → correct in
      // place → re-verify). Only a CLEAN result ships; uncorrected fabrications
      // trigger a re-generation, exactly like a broken graph does.
      if (!useFactGate) {
        return { ok: true, story, validation, attempts: attempt, raw };
      }
      const gate = await runStoryFactGate(story, inputs.topic, apiKey);
      if (gate.status === "clean") {
        return { ok: true, story, validation, attempts: attempt, raw, factGate: gate };
      }
      if (gate.status === "gate-error") {
        // The CHECK itself failed (API/parse), NOT a detected fabrication — don't
        // loop on infrastructure. Ship, but never silently: attach a warning.
        const warned: StoryValidation = {
          ...validation,
          findings: [...validation.findings, { level: "warn", code: "fact-gate", message: "history could not be fact-checked (gate error) — shipping unverified" }],
        };
        return { ok: true, story, validation: warned, attempts: attempt, raw, factGate: gate };
      }
      // Residual fabrications the gate could not fully correct: a failed attempt.
      // Feed the exact historical errors back and re-generate.
      last = { ok: false, validation, attempts: attempt, raw, factGate: gate };
      priorErrors = [];
      priorFactErrors = gate.residual.map((c) => `"${c.quote}" — ${c.why} (correct: ${c.correct})`);
      console.warn(`[branching] attempt ${attempt}/${maxAttempts}: ${gate.residual.length} uncorrected historical error(s) — re-generating`);
      continue;
    }

    // Unplayable: record, feed the exact errors back, try again.
    last = { ok: false, validation, attempts: attempt, raw };
    priorErrors = validation.findings.filter((f) => f.level === "error").map((f) => `[${f.code}] ${f.message}`);
    priorFactErrors = [];
    console.warn(`[branching] attempt ${attempt}/${maxAttempts}: ${priorErrors.length} validation error(s) — re-generating:`);
    for (const e of priorErrors) console.warn(`[branching]    ✗ ${e}`);
  }

  // Exhausted: return the failure (ok:false). NEVER a broken story.
  return last;
}

// Fact-check a story's PROSE by reusing the project's factGate (generator/
// factGate.ts) — no second fact-checking engine. factGate reads a CampaignData-
// shaped dossier (title + events[].text + choice text); we hand it the passages
// AS the events array by REFERENCE, so the gate's in-place string corrections
// land directly on the real passages' .text (and choice text). The post-
// correction structural re-check is the branching graph validator, not the
// CampaignData one (string surgery can't move ids, but we verify regardless).
async function runStoryFactGate(story: BranchingStory, topic: string, apiKey: string): Promise<FactGateResult> {
  const dossier: { title: string; subtitle: string; events: BranchingStory["passages"] } = {
    title: story.title,
    subtitle: story.protagonist ?? "",
    events: story.passages, // shared references — corrections mutate the real passages
  };
  const gate = await runFactGate(apiKey, dossier, topic, {
    validateStructure: () => ({ failed: validateStory(story).playable ? 0 : 1 }),
  });
  // Passages were mutated in place; copy back the by-value top-level strings.
  story.title = dossier.title;
  if (dossier.subtitle) story.protagonist = dossier.subtitle;
  return gate;
}
