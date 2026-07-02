// ════════════════════════════════════════════════════════════════
// BRANCHING STORY — the schema for Product 2's new model: ONE continuous,
// branching narrative (a passage graph), NOT assembled beats. This IS the shape
// the generator already produces (proven 3-for-3 across topics); it is used
// as-is. Pure types + tiny pure helpers, no engine, no UI, no SDK.
//
//   passages: { id, text, choices: [{ text, next }], ending? }  +  a start id.
//
// No phase windows, no day-count, no resources — the story is the graph.
// ════════════════════════════════════════════════════════════════

export interface BranchingChoice {
  /** The option text shown on the button. */
  text: string;
  /** The id of the passage this choice leads to. */
  next: string;
  /** THE COWBOY's reaction to picking THIS option — the time-looped companion
   * voice (2–3 drawled sentences). Shown on the NEXT passage after the pick.
   * Reacts to the specific choice, teaches sideways, introduces no new facts,
   * never praises or condemns. Optional in the type (legacy stories predate
   * him); the generator enforces presence on every new story. */
  cowboy?: string;
}

/** A multiple-choice "sage-style" question triggered at a major historical figure encounter or turning point.
 * Replicates the spirit of the original sage questions: substantive, tied to the real moment/figure,
 * educational weight, feels like it comes from the historical context or figure.
 * Exactly one per key encounter when gumpIntensity=high. Used for both in-story sage moments and the final quiz.
 * Ported from SageQuestion but adapted for branching: no rewards, pure history test.
 */
export interface BranchingQuestion {
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  teksRef?: string;
}

export interface BranchingPassage {
  id: string;
  /** Continuous prose for this moment of the story (rendered as-is). */
  text: string;
  /** 2–3 choices, OR omitted on an ending passage. */
  choices?: BranchingChoice[];
  /** True for a terminal passage (no choices). */
  ending?: boolean;
  /** Required on ending passages: the terminal STATE — always a SURVIVAL at a
   * cost. Death is NEVER an ending; the protagonist survives to the aftermath.
   * The validator rejects an ending without one of these three. */
  endingState?: "broken" | "indifferent" | "triumphant";
  /** Teacher-curated image for this passage (added in review step). */
  image?: {
    thumbUrl: string;
    artist?: string;
    license?: string;
    sourceUrl?: string;
  };
  /** Optional MCQ on a figure-encounter passage (authored only when gumpIntensity
   * is "high" and the protagonist meets a real famous figure). Exactly one per
   * encounter; non-encounter passages carry none. */
  question?: BranchingQuestion;
}

export interface BranchingStory {
  title: string;
  protagonist: string;
  /** The id of the first passage. */
  start: string;
  passages: BranchingPassage[];

  /** Optional era slug for player visual theming (e.g. "civil-war", "medieval", "ancient-rome").
   * When present, the BranchingPlayer sets data-era and the CSS theme variables apply.
   * The generator may set this based on the historical period of the topic.
   */
  era?: string;

  /** When gumpIntensity="high": the core sage-style questions planned for this story.
   * These ensure reliable coverage of key historical figures/events even across branching paths
   * (the generator places the corresponding passages on the main spine with convergence).
   * These feed the final quiz.
   */
  coreSageQuestions?: Array<{
    passageId: string;
    figure: string;
    moment: string;
    question: BranchingQuestion;
  }>;

  /** Final quiz / exam at the end of the playthrough. Pulls from the sage questions the player encountered.
   * Includes review guidance so player can reflect on key events/questions before the assessment.
   * Replicates the original final exam spirit as a meaningful check.
   */
  finalQuiz?: {
    title: string;
    instructions: string; // e.g. "Review the key moments and questions from your journey..."
    questions: Array<BranchingQuestion & { context?: string; fromPassageId?: string }>;
  };

  /** The output language the story was generated in (default "English").
   * All narrative content (passages, questions, quiz) is in this language.
   * Used by the player to generate language-appropriate summary framing.
   */
  outputLanguage?: string;
}

// ── The recorded path ─────────────────────────────────────────────
// One step = the choice taken AT a passage. The ordered list of steps is the
// CHOICE-HISTORY — the record the responsive ending and the quiz will later read
// (which choice at which passage), the graph-native successor to choiceMemory.
export interface ChoiceStep {
  passageId: string;
  choiceIndex: number;
  choiceText: string;
  next: string;
}

export interface PlayResult {
  /** The id of the ending passage reached. */
  endingId: string;
  /** The ordered choices taken to get there. */
  history: ChoiceStep[];
}

// ── tiny pure helpers (shared by the player and later steps) ──────
export function passageMap(story: BranchingStory): Map<string, BranchingPassage> {
  return new Map(story.passages.map((p) => [p.id, p]));
}

// ── MCQ answer-position randomization ─────────────────────────────
// The model reliably emits the correct choice FIRST, so without this every
// question's answer is "A". We deterministically shuffle each question's
// choices (seeded by the question text) and remap correctIndex. Deterministic
// = the same question always lands the same order, so the answer never jumps
// between re-renders and replays stay stable; but across a story the correct
// position is spread over A/B/C/D.

// FNV-1a string hash → 32-bit seed.
function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// mulberry32 PRNG — tiny, fast, deterministic from a 32-bit seed.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Return a copy of the question with its choices deterministically shuffled
 *  and correctIndex remapped to the choice's new position. Stable across calls
 *  (seeded by question + choice text). Questions with <2 choices pass through. */
export function shuffleQuestion<Q extends BranchingQuestion>(q: Q): Q {
  const n = q.choices.length;
  if (n <= 1) return q;
  const rand = mulberry32(hashSeed(`${q.question} ${q.choices.join("|")}`));
  const order = q.choices.map((_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...q,
    choices: order.map((i) => q.choices[i]),
    correctIndex: order.indexOf(q.correctIndex),
  };
}

/** Return a copy of the story with every MCQ's answer position randomized —
 *  covers per-passage figure encounters, coreSageQuestions, and the finalQuiz.
 *  Navigation choices (passage `choices`) are untouched; only `question.choices`
 *  are shuffled, so the graph is unchanged. */
export function shuffleStoryQuestions(story: BranchingStory): BranchingStory {
  return {
    ...story,
    passages: story.passages.map((p) =>
      p.question ? { ...p, question: shuffleQuestion(p.question) } : p
    ),
    coreSageQuestions: story.coreSageQuestions?.map((s) => ({
      ...s,
      question: shuffleQuestion(s.question),
    })),
    finalQuiz: story.finalQuiz
      ? {
          ...story.finalQuiz,
          questions: story.finalQuiz.questions.map((q) => shuffleQuestion(q)),
        }
      : undefined,
  };
}

// A passage is TERMINAL if it has no choices — the player stops there. An
// explicit ending:true is the authored form; a no-choices passage without the
// flag is still treated as terminal so the player never walls a kid (the
// validator warns about the missing flag, but it stays playable).
export function isEnding(p: BranchingPassage | undefined): boolean {
  return !!p && (p.ending === true || !(p.choices && p.choices.length > 0));
}

// ── Graph validation (robustness against real generator output) ───
// The generator is a model; it WILL eventually emit a broken graph. validateStory
// is the reusable detector the player relies on to degrade gracefully (clear
// fallback) instead of crashing or stranding a kid in a wall. Promoted from the
// proof script's sanity() and extended with the loop-TRAP check (a reachable
// passage from which no ending can ever be reached).
export interface StoryFinding {
  level: "error" | "warn";
  code: "root" | "passages" | "start" | "no-start" | "dup-id" | "dead-end"
      | "dangling-next" | "unreachable" | "trap-no-ending" | "no-ending" | "shape"
      | "fact-gate" | "ending-state" | "cowboy";
  message: string;
}

export interface StoryValidation {
  findings: StoryFinding[];
  /** No error-level findings ⇒ safe to play start-to-end. */
  playable: boolean;
}

// Passages reachable from start (forward walk over choices).
function reachableFromStart(story: BranchingStory, byId: Map<string, BranchingPassage>): Set<string> {
  const seen = new Set<string>();
  const stack: string[] = [story.start];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    for (const c of byId.get(id)!.choices ?? []) stack.push(c.next);
  }
  return seen;
}

// Passages from which SOME ending is reachable (reverse fixpoint from terminals).
function canReachEnding(story: BranchingStory, byId: Map<string, BranchingPassage>): Set<string> {
  const ok = new Set<string>();
  for (const p of story.passages) if (isEnding(p)) ok.add(p.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of story.passages) {
      if (ok.has(p.id)) continue;
      for (const c of p.choices ?? []) {
        if (byId.has(c.next) && ok.has(c.next)) { ok.add(p.id); changed = true; break; }
      }
    }
  }
  return ok;
}

export function validateStory(data: unknown): StoryValidation {
  const findings: StoryFinding[] = [];
  const err = (code: StoryFinding["code"], message: string) => findings.push({ level: "error", code, message });
  const warn = (code: StoryFinding["code"], message: string) => findings.push({ level: "warn", code, message });
  const done = (): StoryValidation => ({ findings, playable: findings.every((f) => f.level !== "error") });

  if (typeof data !== "object" || data === null) { err("root", "story is not an object"); return done(); }
  const s = data as BranchingStory;
  if (!Array.isArray(s.passages) || s.passages.length === 0) { err("passages", "passages must be a non-empty array"); return done(); }
  if (typeof s.start !== "string" || !s.start) { err("start", "start must be a non-empty string"); return done(); }

  const byId = new Map<string, BranchingPassage>();
  for (const p of s.passages) {
    if (!p || typeof p.id !== "string" || !p.id) { err("shape", "a passage is missing an id"); continue; }
    if (byId.has(p.id)) warn("dup-id", `duplicate passage id "${p.id}" (last one wins)`);
    byId.set(p.id, p);
  }

  if (!byId.has(s.start)) err("no-start", `start "${s.start}" is not a passage`);

  for (const p of s.passages) {
    if (!p?.id) continue;
    const hasChoices = Array.isArray(p.choices) && p.choices.length > 0;
    if (hasChoices && p.ending) warn("shape", `${p.id}: has both choices and ending:true (played as an ending)`);
    if (!hasChoices && p.ending !== true) warn("dead-end", `${p.id}: no choices and no ending:true — played as an ending, but mark it explicitly`);
    for (const c of p.choices ?? []) {
      if (!c || typeof c.next !== "string" || !byId.has(c.next)) err("dangling-next", `${p.id}: choice → "${c?.next}" (no such passage)`);
    }
  }

  if (!s.passages.some((p) => isEnding(p))) err("no-ending", "the story has no ending passage");

  // Ending CATEGORY: every ending is a survival-at-a-cost in one of the three
  // canonical terminal states. Death is never an ending — an ending without a
  // valid endingState is rejected (the validator can't read prose, so the tag
  // is how "the protagonist survives to the aftermath" becomes machine-checkable).
  const VALID_STATES = new Set(["broken", "indifferent", "triumphant"]);
  for (const p of s.passages) {
    if (p?.id && isEnding(p) && !VALID_STATES.has(p.endingState as string))
      err("ending-state", `${p.id}: ending has no valid endingState (must be "broken", "indifferent", or "triumphant" — death is never an ending)`);
  }

  // Reachability (only meaningful once start resolves).
  if (byId.has(s.start)) {
    const reach = reachableFromStart(s, byId);
    for (const p of s.passages) if (p?.id && !reach.has(p.id)) warn("unreachable", `${p.id}: unreachable from start`);
    const canEnd = canReachEnding(s, byId);
    for (const id of reach) {
      if (!canEnd.has(id)) err("trap-no-ending", `${id}: reachable, but NO ending can be reached from it (loop trap)`);
    }
  }

  return done();
}
