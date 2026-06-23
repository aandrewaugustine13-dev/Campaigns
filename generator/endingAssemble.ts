// ════════════════════════════════════════════════════════════════
// PRODUCT 2 — the DETERMINISTIC ending assembler.
//
// A PURE, synchronous function. NO model call, NO network, NO SDK — at run time
// the close screen just calls this and renders the string. The responsiveness
// is real but pre-authored: the generator wrote, at generation time, (a) the
// constant frame (EndingFrame: opening + coda) and (b) for EACH option at EACH
// decision beat a CLOSING FRAGMENT (Choice.endingFragment). At the close the
// player's actual choices — the choice-memory — slot THEIR fragments into the
// frame, so two players with different choices get endings that recite their
// own decisions back, ending on the one shared coda.
//
// Assembled shape:   [opening?]  ⟶  chosen fragments in arc (pinSeq) order  ⟶  coda
//
// Fully testable: feed it a campaign + a choice-memory vector and the output is
// determined. Two different vectors differ ONLY in the fragment slots and share
// the coda — which is the proof that the ending is responsive, not constant.
// ════════════════════════════════════════════════════════════════

import type { CampaignData, GameEvent } from "./schema.js";

// The choice-memory: WHICH option (choiceIndex) the player took at WHICH beat
// (beatId / pinSeq). Richer than the good/bad/indifferent moral tally — it
// remembers the specific decision at each beat. The engine records this at run
// time (a later step); the assembler only READS it.
export interface ChoiceMemoryEntry {
  beatId: string;
  pinSeq: number;
  choiceIndex: number;
}

// The RECORDING RULE (pure). Given the event a player just resolved and the
// option index they took, return the choice-memory entry to record — or null
// when this resolution should NOT be remembered. Only a pinned DECISION beat (a
// pinned event with ≥2 choices and a numeric pinSeq) is remembered: the
// witnessing resolution ("Go on.", one choice) and any ordinary pool event are
// skipped. The engine pushes the non-null result into GameState.choiceMemory;
// extracted here so the rule is unit-testable without the React turn loop.
export function pinnedChoiceEntry(
  event: { id: string; pinned?: boolean; pinSeq?: number; choices?: unknown[] } | null | undefined,
  choiceIndex: number,
): ChoiceMemoryEntry | null {
  if (!event || event.pinned !== true || typeof event.pinSeq !== "number") return null;
  if ((event.choices?.length ?? 0) < 2) return null;
  return { beatId: event.id, pinSeq: event.pinSeq, choiceIndex };
}

// Assemble the ending. Reads each remembered choice's authored endingFragment
// from the pinned beats and recites them in arc (pinSeq) order between the
// constant opening and coda. A missing fragment (e.g. a witnessing beat that
// slipped into the memory) is simply skipped. coda falls back to storyMeaning
// when endingFrame is absent. Returns "" only if there is genuinely nothing.
export function assembleEnding(data: CampaignData, memory: ChoiceMemoryEntry[]): string {
  const pinnedById = new Map<string, GameEvent>();
  for (const e of data.events) if (e.pinned) pinnedById.set(e.id, e);

  const parts: string[] = [];

  const opening = data.endingFrame?.opening;
  if (opening && opening.trim()) parts.push(opening.trim());

  // Recite the chosen fragments in arc order regardless of the order the memory
  // was recorded in — the arc, not the click order, is the narrative order.
  for (const rec of [...memory].sort((a, b) => a.pinSeq - b.pinSeq)) {
    const frag = pinnedById.get(rec.beatId)?.choices?.[rec.choiceIndex]?.endingFragment;
    if (typeof frag === "string" && frag.trim()) parts.push(frag.trim());
  }

  const coda = data.endingFrame?.coda ?? data.storyMeaning;
  if (typeof coda === "string" && coda.trim()) parts.push(coda.trim());

  return parts.join("\n\n");
}
