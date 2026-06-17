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

export function isEnding(p: BranchingPassage | undefined): boolean {
  return !!p && (p.ending === true || !(p.choices && p.choices.length > 0));
}
