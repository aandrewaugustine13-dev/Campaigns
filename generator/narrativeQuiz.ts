// ════════════════════════════════════════════════════════════════
// PRODUCT 2 — the NARRATIVE QUIZ stage (Option A: a separate, beats-grounded
// quiz-authoring stage).
//
// The narrative product is spine-only: it never runs the big systems authoring
// call that would emit eventTrivia, but a classroom tool needs a TEKS-aligned
// assessment. So this is its OWN small stage — isolated from the proven plan/
// ending call, so a bad quiz never re-rolls the spine.
//
// It authors, grounded in BOTH the pinned beats the student actually played AND
// the standard (so it tests what they played AND covers the standard the four
// beats alone can't):
//   - questions   → compiled to CampaignData.eventTrivia (the FINAL-EXAM bank;
//                   the mid-run gate is suppressed for narrative, so this bank
//                   surfaces ONLY at the close).
//   - reviewSummary → CampaignData.reviewSummary, the ~300-word study aid that
//                   EMBEDS every correct answer (the proven systems discipline).
//
// Reliability posture: PURE types + validator here (no SDK), generation split
// out below (mirrors storyPlan.ts / storyPlanGen.ts). The bundle is structurally
// validated here; FABRICATION is caught by the existing factGate run over the
// assembled campaign (generateNarrativeCampaign wires it). A quiz that mis-keys
// or invents an answer is misinformation under a teacher's endorsement — the
// factGate's keyed-answer HARD REJECT (factGate.isQuizKeyed) is non-negotiable.
// ════════════════════════════════════════════════════════════════

import type { EventGateQuestion } from "./schema.js";
import type { NarrativePlan } from "./storyPlan.js";

// The quiz bundle the stage produces. `questions` are EventGateQuestion-shaped
// (the exact type CampaignData.eventTrivia holds), so compiling is a passthrough.
export interface NarrativeQuizBundle {
  questions: EventGateQuestion[];
  /** ~300-word prose recap that EMBEDS every correct answer (study aid + the
   * answer source the factGate cross-checks). Becomes CampaignData.reviewSummary. */
  reviewSummary: string;
}

export interface QuizFinding {
  level: "error" | "warn";
  field: string;
  message: string;
}

export interface ValidateNarrativeQuizOptions {
  /** Minimum bank size (the exam draws from this). Default 4. */
  minQuestions?: number;
}

// Normalize for the soft embedding check (answer recoverable in the summary).
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

// ── Validation (mirrors validate.ts / storyPlan.ts discipline) ────
export function validateNarrativeQuiz(
  data: unknown,
  opts: ValidateNarrativeQuizOptions = {},
): QuizFinding[] {
  const f: QuizFinding[] = [];
  const push = (level: "error" | "warn", field: string, message: string) =>
    f.push({ level, field, message });
  const minQuestions = opts.minQuestions ?? 4;

  if (typeof data !== "object" || data === null) {
    push("error", "root", "Quiz bundle is not an object");
    return f;
  }
  const d = data as Record<string, unknown>;

  if (typeof d.reviewSummary !== "string" || d.reviewSummary.trim().length === 0)
    push("error", "reviewSummary", "reviewSummary must be a non-empty string (the study aid + answer source)");
  const summary = typeof d.reviewSummary === "string" ? norm(d.reviewSummary) : "";

  const questions = d.questions;
  if (!Array.isArray(questions)) {
    push("error", "questions", "questions must be an array");
    return f;
  }
  if (questions.length < minQuestions)
    push("error", "questions", `the exam bank needs ≥${minQuestions} questions (got ${questions.length})`);

  const ids = new Set<string>();
  questions.forEach((q, i) => {
    const qq = q as Record<string, unknown>;
    const prefix = `questions[${i}]`;

    if (typeof qq.id !== "string" || qq.id.trim().length === 0) {
      push("error", `${prefix}.id`, "Missing or empty: id");
    } else if (ids.has(qq.id)) {
      push("error", `${prefix}.id`, `Duplicate question id: "${qq.id}"`);
    } else {
      ids.add(qq.id);
    }

    if (typeof qq.question !== "string" || qq.question.trim().length === 0)
      push("error", `${prefix}.question`, "Missing or empty: question");
    if (typeof qq.fact !== "string" || qq.fact.trim().length === 0)
      push("error", `${prefix}.fact`, "Missing or empty: fact (the explanation / source of the answer)");

    const choices = qq.choices;
    if (!Array.isArray(choices) || choices.length < 2) {
      push("error", `${prefix}.choices`, "a question must offer ≥2 choices");
      return;
    }
    choices.forEach((c, ci) => {
      if (typeof c !== "string" || c.trim().length === 0)
        push("error", `${prefix}.choices[${ci}]`, "choice must be a non-empty string");
    });

    const ci = qq.correctIndex;
    if (typeof ci !== "number" || !Number.isInteger(ci) || ci < 0 || ci >= choices.length) {
      push("error", `${prefix}.correctIndex`, `correctIndex must be an integer in [0, ${choices.length - 1}]`);
      return;
    }

    // Soft embedding check (WARN, not error): the proven discipline is that the
    // keyed answer is recoverable from the reviewSummary. Exact substring is too
    // strict for legitimate paraphrase, and the factGate is the real verifier —
    // so a miss only warns, flagging a likely study-aid gap.
    const keyed = choices[ci];
    if (summary && typeof keyed === "string" && keyed.trim().length >= 4) {
      if (!summary.includes(norm(keyed)))
        push("warn", `${prefix}.correctIndex`, `the keyed answer "${String(keyed).slice(0, 60)}" was not found verbatim in reviewSummary — confirm a student can recover it from the recap`);
    }
  });

  return f;
}

// ── A compact, model-facing rendering of the beats the student played ──
// Grounds the quiz in what was actually experienced (the "test what they played"
// strength) without dumping the whole campaign. Pure helper, exported for reuse.
export function beatsDigest(plan: NarrativePlan): string {
  return plan.beats
    .filter((b) => b.included)
    .map((b, i) => `${i + 1}. [${b.role}] ${b.title} — ${b.scene} (Why it matters: ${b.significance})`)
    .join("\n");
}

// The generation half (the SDK call) lives in narrativeQuizGen.ts so this module
// stays pure (browser-safe), exactly like the storyPlan.ts / storyPlanGen.ts split.
