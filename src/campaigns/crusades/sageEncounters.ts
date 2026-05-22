// ═══════════════════════════════════════════════════════════════
// THIRD CRUSADE — sage encounter resolution system
// Two-attempt question flow with streak-scaled rewards and a
// position-weighted embarrassment roll on a both-wrong outcome.
//
// NOTE: This is the *resolution* module. The sage data list (the
// five historical-figure stubs at fixed thresholds) lives in
// ./sages.ts and uses the shared SageEncounterData shape from
// ../types. The types and logic below are intentionally local to
// this file — not yet wired into anything.
// ═══════════════════════════════════════════════════════════════

// ---- Global tuning knobs (all reward/penalty math lives here) ----
const SAGE_TUNING = {
  firstTryBaseReward: 100,      // base points for a first-try correct answer
  secondTryReward: 40,          // flat reward for second-try correct (no multiplier)
  streakStep: 0.5,              // multiplier grows by this each unbroken first-try answer
  // streak 0 = 1.0x, streak 1 = 1.5x, streak 2 = 2.0x, etc.
  embarrassmentChance: 0.5,     // 50/50 roll on a both-wrong answer
} as const;

export type EncounterRegister = 'personal' | 'parley';
export type QuestionType = 'recall' | 'significance';

export interface SageQuestion {
  prompt: string;
  type: QuestionType;
  choices: string[];
  correctIndex: number;
  responses: {
    approve: string;   // first-try correct
    scold: string;     // second-try correct, the teaching beat
    fail: string;      // both tries wrong
  };
}

export interface Sage {
  id: string;
  name: string;
  threshold: number;            // % progress where this sage appears (0-1)
  register: EncounterRegister;  // drives narration framing + penalty weight
  penaltyWeight: number;        // points lost on a failed embarrassment roll
  questions: [SageQuestion, SageQuestion]; // exactly two: recall then significance
}

// ---- Resolution logic ----
export type AnswerOutcome =
  | { result: 'firstTry'; points: number; newStreak: number; response: string }
  | { result: 'secondTry'; points: number; newStreak: number; response: string }
  | { result: 'failed'; points: number; newStreak: number; response: string; embarrassed: boolean };

export function resolveQuestion(
  question: SageQuestion,
  sage: Sage,
  attempt: 1 | 2,
  correct: boolean,
  currentStreak: number
): AnswerOutcome {
  // First try, correct: full reward x multiplier, streak grows
  if (attempt === 1 && correct) {
    const multiplier = 1 + currentStreak * SAGE_TUNING.streakStep;
    return {
      result: 'firstTry',
      points: Math.round(SAGE_TUNING.firstTryBaseReward * multiplier),
      newStreak: currentStreak + 1,
      response: question.responses.approve,
    };
  }

  // Second try, correct: flat base reward, streak BREAKS, gentle scold
  if (attempt === 2 && correct) {
    return {
      result: 'secondTry',
      points: SAGE_TUNING.secondTryReward,
      newStreak: 0,
      response: question.responses.scold,
    };
  }

  // Both wrong: streak breaks, 50/50 position-scaled embarrassment
  const embarrassed = Math.random() < SAGE_TUNING.embarrassmentChance;
  return {
    result: 'failed',
    points: embarrassed ? -sage.penaltyWeight : 0,
    newStreak: 0,
    response: question.responses.fail,
    embarrassed,
  };
}

// ═══════════════════════════════════════════════════════════════
// SAGES — Third Crusade encounter list (new two-question shape)
// Eleanor at index 0 (TODO: awaiting paste).
// Remaining four are stubs — fill in id-specific question content
// in place, preserving the shape.
// ═══════════════════════════════════════════════════════════════

// TODO[content]: replace with real prompts/choices/responses.
const PLACEHOLDER_RECALL: SageQuestion = {
  prompt: 'TODO[content]: write recall prompt.',
  type: 'recall',
  choices: ['TODO A', 'TODO B', 'TODO C', 'TODO D'],
  correctIndex: 0,
  responses: {
    approve: 'TODO[content]: first-try-correct line (warm/approving).',
    scold:   'TODO[content]: second-try-correct line (the teaching beat).',
    fail:    'TODO[content]: both-wrong line (disappointed/embarrassing).',
  },
};

const PLACEHOLDER_SIGNIFICANCE: SageQuestion = {
  prompt: 'TODO[content]: write significance prompt.',
  type: 'significance',
  choices: ['TODO A', 'TODO B', 'TODO C', 'TODO D'],
  correctIndex: 0,
  responses: {
    approve: 'TODO[content]: first-try-correct line (warm/approving).',
    scold:   'TODO[content]: second-try-correct line (the teaching beat).',
    fail:    'TODO[content]: both-wrong line (disappointed/embarrassing).',
  },
};

export const SAGES: Sage[] = [

  // ── 1. ELEANOR OF AQUITAINE ─────────────────────────────────
  // TODO[content]: paste the fully-specced Eleanor sage object
  // here. The user referenced it in the request but the paste did
  // not come through. Expected shape: full Sage with both
  // questions written (no PLACEHOLDER_ references).

  // ── 2. FREDERICK BARBAROSSA (threshold 0.35) ────────────────
  {
    id: 'barbarossa',
    name: 'Frederick Barbarossa',
    threshold: 0.35,
    register: 'personal',
    penaltyWeight: 25,
    questions: [PLACEHOLDER_RECALL, PLACEHOLDER_SIGNIFICANCE],
  },

  // ── 3. RICHARD I (threshold 0.55) ───────────────────────────
  {
    id: 'richard',
    name: 'Richard I',
    threshold: 0.55,
    register: 'personal',
    penaltyWeight: 40,
    questions: [PLACEHOLDER_RECALL, PLACEHOLDER_SIGNIFICANCE],
  },

  // ── 4. SALADIN (threshold 0.75) ─────────────────────────────
  {
    id: 'saladin',
    name: 'Salah ad-Din Yusuf ibn Ayyub',
    threshold: 0.75,
    register: 'parley',
    penaltyWeight: 75,
    questions: [PLACEHOLDER_RECALL, PLACEHOLDER_SIGNIFICANCE],
  },

  // ── 5. IMAD AD-DIN AL-ISFAHANI (threshold 0.90) ─────────────
  {
    id: 'imad',
    name: 'Imad ad-Din al-Isfahani',
    threshold: 0.90,
    register: 'parley',
    penaltyWeight: 90,
    questions: [PLACEHOLDER_RECALL, PLACEHOLDER_SIGNIFICANCE],
  },
];

// ═══════════════════════════════════════════════════════════════
// HELPER — find the next sage that should fire
// Returns the lowest-threshold sage not yet in completedIds whose
// threshold the player has reached. Returns null when none remain.
// ═══════════════════════════════════════════════════════════════

export function getNextSage(
  progress: number,
  completedIds: Set<string>,
): Sage | null {
  const eligible = SAGES
    .filter((s) => !completedIds.has(s.id) && progress >= s.threshold)
    .sort((a, b) => a.threshold - b.threshold);
  return eligible[0] ?? null;
}
