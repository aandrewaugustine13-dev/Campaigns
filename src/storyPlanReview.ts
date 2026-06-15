// Pure include/exclude logic for the teacher's narrative-plan review (step 8).
// No React, no model call — just immutable edits to a NarrativePlan plus a
// validity read that reuses validateStoryPlan as the SINGLE SOURCE OF TRUTH for
// the arc rule (so the UI can't drift from the generator's own guardrails).

import {
  validateStoryPlan,
  DECISION_ROLES,
  type NarrativePlan,
  type PlanBeat,
} from "../generator/storyPlan";

// Set one beat's `included` flag, returning a NEW plan (never mutates input).
export function setBeatIncluded(plan: NarrativePlan, beatId: string, included: boolean): NarrativePlan {
  return {
    ...plan,
    beats: plan.beats.map((b) => (b.id === beatId ? { ...b, included } : b)),
  };
}

// Flip one beat's `included` flag.
export function toggleBeatIncluded(plan: NarrativePlan, beatId: string): NarrativePlan {
  const beat = plan.beats.find((b) => b.id === beatId);
  return beat ? setBeatIncluded(plan, beatId, !beat.included) : plan;
}

// Whether a beat is a decision beat (player acts) vs a witnessing beat
// (resolution). Drives the row's "decision / witnessing" tag in the UI.
export function isDecisionBeat(beat: PlanBeat): boolean {
  return DECISION_ROLES.includes(beat.role);
}

export interface ReviewStatus {
  includedCount: number;
  total: number;
  // Error-level arc problems with the CURRENT inclusion (e.g. the only climax
  // was excluded). Empty ⇒ the arc still holds.
  errors: string[];
  // Non-blocking notes (e.g. no escalation left — a thin but legal arc).
  warnings: string[];
  // The teacher may confirm only when the included beats still form a valid arc.
  canConfirm: boolean;
}

// Read the current plan's review status off validateStoryPlan, so the arc rule
// (≥1 cause, exactly one climax, ≥1 resolution, arc order) is enforced by the
// same code the generator uses — never a divergent copy.
export function reviewStatus(plan: NarrativePlan): ReviewStatus {
  const findings = validateStoryPlan(plan);
  const errors = findings.filter((f) => f.level === "error").map((f) => f.message);
  const warnings = findings.filter((f) => f.level === "warn").map((f) => f.message);
  const includedCount = plan.beats.filter((b) => b.included).length;
  return {
    includedCount,
    total: plan.beats.length,
    errors,
    warnings,
    canConfirm: errors.length === 0 && includedCount > 0,
  };
}
