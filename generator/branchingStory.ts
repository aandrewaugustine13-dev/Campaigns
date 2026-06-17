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
}

export interface BranchingPassage {
  id: string;
  /** Continuous prose for this moment of the story (rendered as-is). */
  text: string;
  /** 2–3 choices, OR omitted on an ending passage. */
  choices?: BranchingChoice[];
  /** True for a terminal passage (no choices). */
  ending?: boolean;
  /** Teacher-curated image for this passage (added in review step). */
  image?: {
    thumbUrl: string;
    artist?: string;
    license?: string;
    sourceUrl?: string;
  };
}

export interface BranchingStory {
  title: string;
  protagonist: string;
  /** The id of the first passage. */
  start: string;
  passages: BranchingPassage[];
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
      | "dangling-next" | "unreachable" | "trap-no-ending" | "no-ending" | "shape";
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
