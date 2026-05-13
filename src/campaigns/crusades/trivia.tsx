import type { TriviaEngineProps, TriviaQuestion } from "../types";

// ═══════════════════════════════════════════════════════════════
// THIRD CRUSADE — trivia
// TODO[content]: real trivia bank + engine. The placeholder engine
// below renders nothing (returns null) so the CampaignConfig type
// is satisfied while no questions exist yet.
// ═══════════════════════════════════════════════════════════════

export function pickTriviaQuestion(_progress: number, _usedIds: Set<string>): TriviaQuestion | null {
  return null;
}

export default function CrusadesTriviaEngine(_props: TriviaEngineProps) {
  // TODO[content]: real trivia UI for Crusade questions.
  return null;
}
