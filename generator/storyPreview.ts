// ════════════════════════════════════════════════════════════════
// STORY PREVIEW — the teacher's cheap CONFIDENCE GATE (pure types + validator).
//
// Before paying for a full branching-story generation, a teacher confirms the
// story will cover their standard. The preview is its OWN cheap/fast generation —
// a short summary + a TEKS coverage checklist — NOT a summary derived from a full
// story (that would defeat the gate by already paying for the story).
//
// PURE module (no SDK) so the front-end preview screen can import the TYPE
// without pulling the node SDK into the browser bundle (same split as
// storyPlan.ts / storyPlanGen.ts).
// ════════════════════════════════════════════════════════════════

// Type-only import (erased at build) — keeps this module browser-safe while
// pinning `theme` to the single source of truth (theme-system/themes.ts).
import type { ThemeId } from "../theme-system/themes.js";

export interface StoryPreview {
  /** One line: who the story will follow (an ordinary young person in the history). */
  protagonist: string;
  /** 2–3 plain sentences: the arc and the feel of the story to come. */
  summary: string;
  /** The TEKS COVERAGE checklist — short, specific historical topics/events/people
   * the story will teach, each something a teacher can eyeball against their
   * standard. */
  coverage: string[];
  /** The classifier's era pick — ONE strict ThemeId from theme-system/themes.ts,
   * forced by the Gemini responseSchema enum. Feeds resolveTheme as `classifier`.
   * Optional so pre-theme previews still type-check. */
  theme?: ThemeId;
}

export interface PreviewFinding {
  level: "error" | "warn";
  field: string;
  message: string;
}

// Minimal validation (the gate only needs to be well-formed): a protagonist and
// summary present, and a NON-EMPTY coverage checklist of non-empty items.
export function validateStoryPreview(data: unknown): PreviewFinding[] {
  const f: PreviewFinding[] = [];
  const push = (level: "error" | "warn", field: string, message: string) => f.push({ level, field, message });

  if (typeof data !== "object" || data === null) {
    push("error", "root", "preview is not an object");
    return f;
  }
  const d = data as Record<string, unknown>;

  if (typeof d.protagonist !== "string" || d.protagonist.trim().length === 0)
    push("error", "protagonist", "protagonist must be a non-empty string");
  if (typeof d.summary !== "string" || d.summary.trim().length === 0)
    push("error", "summary", "summary must be a non-empty string");

  if (!Array.isArray(d.coverage) || d.coverage.length === 0) {
    push("error", "coverage", "coverage must be a non-empty checklist");
  } else {
    if (d.coverage.length < 4)
      push("warn", "coverage", `only ${d.coverage.length} coverage items — a teacher wants enough to check against the standard`);
    d.coverage.forEach((c, i) => {
      if (typeof c !== "string" || c.trim().length === 0)
        push("error", `coverage[${i}]`, "coverage item must be a non-empty string");
    });
  }

  return f;
}
