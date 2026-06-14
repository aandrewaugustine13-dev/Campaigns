// ════════════════════════════════════════════════════════════════
// Stage 1 output: the NARRATIVE PLAN of a campaign — an ORDERED arc of
// major beats (cause → escalation → climax → resolution) plus the
// meaning the whole story lands on. Pure data. No events, UI, or wiring
// — this is the inspectable artifact a teacher reviews (toggling beats
// in/out) before any game is generated, and which storyPlanCompile.ts
// later compiles into PINNED, guaranteed events. Mirrors the discipline
// of frame.ts / faultline.ts (types + validator + generation stage).
//
// WHY THIS EXISTS. The diagnosis found campaigns are a phase-windowed
// weighted POOL of standalone events with no throughline and no
// meaning-making ending. The plan is the spine that fixes that: its
// included beats become GUARANTEED events in arc order, and its
// `meaning` becomes the story-level ending (CampaignData.storyMeaning),
// distinct from the player verdict and the study-aid review summary.
//
// ARC LAW: a plan is a STORY, not a checklist. It must contain at least
// one cause beat, escalation, EXACTLY ONE climax, and a resolution sense
// (carried by `meaning`), and its beats must be orderable into that arc.
//
// MEANING LAW: `meaning` makes SIGNIFICANCE (what it added up to, the
// irony) — it is NOT a recap. The New Orleans line is the spec:
// "militarily pointless since the treaty was already signed, but it made
// Jackson a national icon and let a bruised country feel like it won."
// ════════════════════════════════════════════════════════════════

// The four arc roles, in narrative order. `pinSeq` (assigned by the
// compiler) follows the beats' order; this enum is what makes the order
// MEANINGFUL — cause precedes escalation precedes the single climax
// precedes resolution.
export const BEAT_ROLES = ["cause", "escalation", "climax", "resolution"] as const;
export type BeatRole = (typeof BEAT_ROLES)[number];

// Rank used to test arc monotonicity. Multiple escalation beats are fine
// (they share rank 1); cause/climax/resolution are bookends.
const ROLE_RANK: Record<BeatRole, number> = {
  cause: 0,
  escalation: 1,
  climax: 2,
  resolution: 3,
};

export interface PlanBeat {
  /** Stable id, e.g. "beat_neworleans" — becomes the pinned event id. */
  id: string;
  /** The beat's place in the arc. EXACTLY ONE beat is the climax. */
  role: BeatRole;
  /** Short scene title (becomes the pinned event's title). */
  title: string;
  /** Playable event prose, within the brevity caps — the compiler emits this
   * as the pinned event's `text`, so the beat is a real, playable event. */
  scene: string;
  /** WHY this moment matters: the causal / character stakes. Becomes the
   * pinned event's `significance` and the teacher's checkbox explanation. */
  significance: string;
  /** Suggested 0–1 arc position; the compiler enforces actual ordering by
   * role + array order, but this is the author's intent and the teacher hint. */
  phaseHint: number;
  /** Teacher checkbox. Default true. An excluded beat is NOT compiled into a
   * pinned event (v1 = include/exclude only; reorder/edit comes later). */
  included: boolean;
}

export interface NarrativePlan {
  /** One sentence: the spine (cause → consequence) the arc traces. */
  throughline: string;
  /** THE ENDING — the meaning-making synthesis (significance + irony), the
   * "what it all added up to" beat. Becomes CampaignData.storyMeaning. */
  meaning: string;
  /** The ordered major beats. */
  beats: PlanBeat[];
}

// ── Validation (mirrors generator/faultline.ts discipline) ────────

export interface StoryPlanFinding {
  level: "error" | "warn";
  field: string;
  message: string;
}

// Cheap heuristic for "this `meaning` is a recap, not a synthesis": a
// step-by-step retelling chains sequence markers ("First… then… finally…").
// Two or more such markers reads as a recap. Noisy is fine — it only WARNS.
const SEQ_MARKER_RE = /\b(first|then|next|after that|afterwards?|finally|in the end|lastly)\b/gi;

export function validateStoryPlan(data: unknown): StoryPlanFinding[] {
  const f: StoryPlanFinding[] = [];
  const push = (level: "error" | "warn", field: string, message: string) =>
    f.push({ level, field, message });

  if (typeof data !== "object" || data === null) {
    push("error", "root", "Narrative plan is not an object");
    return f;
  }
  const d = data as Record<string, unknown>;

  for (const k of ["throughline", "meaning"] as const) {
    if (typeof d[k] !== "string" || (d[k] as string).trim().length === 0)
      push("error", k, `${k} must be a non-empty string`);
  }
  if (typeof d.meaning === "string") {
    const markers = d.meaning.match(SEQ_MARKER_RE);
    if (markers && markers.length >= 2)
      push("warn", "meaning", "reads like a step-by-step recap (chains sequence markers) — `meaning` must make significance (what it added up to, the irony), not retell the sequence");
  }

  const beats = d.beats;
  if (!Array.isArray(beats)) {
    push("error", "beats", "beats must be an array");
    return f;
  }
  if (beats.length < 2) {
    push("error", "beats", `a story arc needs ≥2 beats (got ${beats.length})`);
  }

  const ids = new Set<string>();
  const roleCounts: Record<string, number> = {};
  const includedRanks: number[] = [];

  beats.forEach((b, i) => {
    const bb = b as Record<string, unknown>;
    const prefix = `beats[${i}]`;

    for (const k of ["id", "title", "scene", "significance"] as const) {
      if (typeof bb[k] !== "string" || (bb[k] as string).trim().length === 0)
        push("error", `${prefix}.${k}`, `Missing or empty: ${k}`);
    }
    if (typeof bb.id === "string" && bb.id.trim().length > 0) {
      if (ids.has(bb.id)) push("error", `${prefix}.id`, `Duplicate beat id: "${bb.id}"`);
      ids.add(bb.id);
    }

    const role = bb.role as BeatRole;
    if (!BEAT_ROLES.includes(role)) {
      push("error", `${prefix}.role`, `role must be one of: ${BEAT_ROLES.join(", ")}`);
    } else {
      roleCounts[role] = (roleCounts[role] ?? 0) + 1;
    }

    if (typeof bb.phaseHint !== "number" || (bb.phaseHint as number) < 0 || (bb.phaseHint as number) > 1)
      push("error", `${prefix}.phaseHint`, "phaseHint must be a number in [0, 1]");

    if (typeof bb.included !== "boolean")
      push("error", `${prefix}.included`, "included must be a boolean");

    // The arc-shape checks below only consider INCLUDED beats — an excluded
    // beat is never compiled, so it cannot break the arc.
    if (bb.included === true && BEAT_ROLES.includes(role))
      includedRanks.push(ROLE_RANK[role]);
  });

  // ARC LAW (over included beats): need a cause, EXACTLY ONE climax, and a
  // resolution; escalation is strongly expected (warn if absent).
  const includedBeats = beats.filter((b) => (b as Record<string, unknown>).included === true);
  if (includedBeats.length === 0) {
    push("error", "beats", "no beats are included — the arc is empty");
  } else {
    const includedRole = (r: BeatRole) =>
      includedBeats.filter((b) => (b as Record<string, unknown>).role === r).length;
    if (includedRole("cause") < 1)
      push("error", "beats.cause", "the arc needs an included `cause` beat (where the story starts)");
    const climaxes = includedRole("climax");
    if (climaxes < 1)
      push("error", "beats.climax", "the arc needs an included `climax` beat (the turning point it builds to)");
    else if (climaxes > 1)
      push("error", "beats.climax", `exactly ONE climax is allowed; ${climaxes} included beats are marked climax`);
    if (includedRole("resolution") < 1)
      push("error", "beats.resolution", "the arc needs an included `resolution` beat (where it lands)");
    if (includedRole("escalation") < 1)
      push("warn", "beats.escalation", "no included `escalation` beat — the arc jumps from cause to climax without a build");
  }

  // ARC MONOTONICITY: in array order, included beats must not REGRESS in role
  // rank (a resolution before the climax, a climax before the cause). Equal
  // ranks are fine (multiple escalations).
  for (let i = 1; i < includedRanks.length; i++) {
    if (includedRanks[i] < includedRanks[i - 1]) {
      push("error", "beats.order", "included beats are out of arc order — roles must not regress (cause → escalation → climax → resolution) in array order");
      break;
    }
  }

  return f;
}

// ── Generation ─────────────────────────────────────────────────
// The generation stage (generateStoryPlan) and its inspect harness land in a
// later commit (build-plan step 4). Step 1 ships TYPES + VALIDATOR only, so
// nothing in the pipeline calls a model yet — the artifact shape and its
// guardrails come first, exactly as frame.ts / faultline.ts were staged.
