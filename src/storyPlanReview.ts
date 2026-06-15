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
  // ARC-shape errors — the inclusion set no longer forms a valid arc (e.g. the
  // only climax was unchecked). The teacher FIXES these by restoring a beat.
  arcErrors: string[];
  // CONTENT errors — a malformed field the model produced (e.g. a choice with
  // stake 0, a missing scene). Toggling beats can't fix these; the only honest
  // path is to REGENERATE the plan. Not the teacher's problem.
  contentErrors: string[];
  // Non-blocking notes (e.g. no escalation left — a thin but legal arc).
  warnings: string[];
  // Confirm requires a valid arc AND no content errors.
  canConfirm: boolean;
}

// An arc-shape finding is one about the SET of beats (cause/climax/resolution/
// escalation presence, arc order, or the beats array itself) — fields matching
// /^beats(\.|$)/. A per-beat field error ("beats[2].choices[0].stake") or a
// top-level field ("meaning") is CONTENT, not fixable by toggling inclusion.
const ARC_FIELD_RE = /^beats(\.|$)/;

// Read the current plan's review status off validateStoryPlan, so the arc rule
// (≥1 cause, exactly one climax, ≥1 resolution, arc order) is enforced by the
// same code the generator uses — never a divergent copy. Errors are SPLIT by
// whether the teacher can fix them (restore a beat) or not (regenerate).
export function reviewStatus(plan: NarrativePlan): ReviewStatus {
  const findings = validateStoryPlan(plan);
  const errs = findings.filter((f) => f.level === "error");
  const arcErrors = errs.filter((f) => ARC_FIELD_RE.test(f.field)).map((f) => f.message);
  const contentErrors = errs.filter((f) => !ARC_FIELD_RE.test(f.field)).map((f) => f.message);
  const warnings = findings.filter((f) => f.level === "warn").map((f) => f.message);
  const includedCount = plan.beats.filter((b) => b.included).length;
  return {
    includedCount,
    total: plan.beats.length,
    arcErrors,
    contentErrors,
    warnings,
    canConfirm: arcErrors.length === 0 && contentErrors.length === 0 && includedCount > 0,
  };
}
