import type { SageEncounterData } from "../types";

// ═══════════════════════════════════════════════════════════════
// THIRD CRUSADE — sage encounter slots
// Five stubs at fixed thresholds. Empty content. Real dialogue and
// questions to be written in a later pass.
//
// ── Eleanor of Aquitaine ────────────────────────────────────────
// Eleanor is the warm sage. Grandmother energy. She knows Hugh's
// name and his wife's name. She tells him one or two true things
// and trusts him with the rest. Do not load with exposition.
// See conversation history for full voice notes.
// ─────────────────────────────────────────────────────────────
// TODO[content]: write all five sage encounters. Eleanor first.
// ═══════════════════════════════════════════════════════════════

const PORTRAIT = (id: string) => `/faces/sage_${id}.png`;

// Shared empty reward shape — sage rewards land later with content.
const EMPTY_REWARD = {
  correct: {},
  wrong: {},
  knowledgeCorrect: 0,
  knowledgeWrong: 0,
} as const;

// Shared placeholder question. Real prompts arrive with the writing pass.
const PLACEHOLDER_QUESTION = {
  question: "TODO[content]: write sage question.",
  choices: ["TODO A", "TODO B", "TODO C", "TODO D"],
  correctIndex: 0,
  explanation: "TODO[content]: write the explanation.",
  teksRef: "TODO[teks]: align to grade-band standard.",
};

export const SAGES: SageEncounterData[] = [

  // ── 1. ELEANOR OF AQUITAINE — ~15% (before the fleet sails) ──
  {
    id: "eleanor",
    name: "Eleanor of Aquitaine",
    title: "Queen Mother, Duchess of Aquitaine",
    portrait: PORTRAIT("eleanor"),
    threshold: 15,
    // TODO[content]: voice notes — warm sage, grandmother energy.
    // She knows Hugh's name and his wife's name. Tells him one or
    // two true things and trusts him with the rest. Do not load
    // with exposition.
    bio: "TODO[content]: Eleanor bio. Keep it short.",
    greeting: "TODO[content]: Eleanor greeting. She uses Hugh's name and his wife's name. One or two true things, no more.",
    advice: "TODO[content]: Eleanor's advice line. Trusting, not lecturing.",
    question: PLACEHOLDER_QUESTION,
    reward: EMPTY_REWARD,
  },

  // ── 2. FREDERICK BARBAROSSA (posthumous) — ~35% ──────────────
  {
    id: "barbarossa",
    name: "Frederick Barbarossa",
    title: "Holy Roman Emperor (posthumous)",
    portrait: PORTRAIT("barbarossa"),
    threshold: 35,
    bio: "TODO[content]: Barbarossa bio. He is dead — drowned in the Saleph. The encounter is a vision, a relic, a rumour, a memory. Decide framing.",
    greeting: "TODO[content]: posthumous greeting framing.",
    advice: "TODO[content]: Barbarossa's advice.",
    question: PLACEHOLDER_QUESTION,
    reward: EMPTY_REWARD,
  },

  // ── 3. RICHARD I — ~55% ─────────────────────────────────────
  {
    id: "richard",
    name: "Richard I",
    title: "King of England, the Lionheart",
    portrait: PORTRAIT("richard"),
    threshold: 55,
    bio: "TODO[content]: Richard bio.",
    greeting: "TODO[content]: Richard greeting. Direct, brilliant, dangerous.",
    advice: "TODO[content]: Richard's advice.",
    question: PLACEHOLDER_QUESTION,
    reward: EMPTY_REWARD,
  },

  // ── 4. SALADIN — ~75% ───────────────────────────────────────
  {
    id: "saladin",
    name: "Salah ad-Din Yusuf ibn Ayyub",
    title: "Sultan of Egypt and Syria",
    portrait: PORTRAIT("saladin"),
    threshold: 75,
    bio: "TODO[content]: Saladin bio.",
    greeting: "TODO[content]: Saladin greeting. Quiet authority. Mercy as policy.",
    advice: "TODO[content]: Saladin's advice.",
    question: PLACEHOLDER_QUESTION,
    reward: EMPTY_REWARD,
  },

  // ── 5. IMAD AD-DIN AL-ISFAHANI — ~90% ───────────────────────
  {
    id: "imad",
    name: "Imad ad-Din al-Isfahani",
    title: "Chronicler and Secretary of Saladin",
    portrait: PORTRAIT("imad"),
    threshold: 90,
    bio: "TODO[content]: Imad bio. The chronicler — words outlast walls.",
    greeting: "TODO[content]: Imad greeting. A writing man with a writing question.",
    advice: "TODO[content]: Imad's advice.",
    question: PLACEHOLDER_QUESTION,
    reward: EMPTY_REWARD,
  },
];

// ═══════════════════════════════════════════════════════════════
// HELPER — find the next sage that should fire
// (mirrors chisholm/sages.ts)
// ═══════════════════════════════════════════════════════════════

export function getNextSage(
  progress: number,
  prevProgress: number,
  sageIndex: number,
): SageEncounterData | null {
  if (sageIndex >= SAGES.length) return null;
  const sage = SAGES[sageIndex];
  if (progress >= sage.threshold && prevProgress < sage.threshold) return sage;
  if (progress >= sage.threshold && sageIndex < SAGES.length) return sage;
  return null;
}
