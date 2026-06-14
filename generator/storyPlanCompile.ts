// ════════════════════════════════════════════════════════════════
// Stage 0 of the narrative spine: the COMPILER.
//
// A pure, deterministic transform that turns a validated NarrativePlan
// (an ordered arc of beats + the meaning it lands on) into the concrete
// CampaignData pieces the engine plays:
//
//   pinnedEvents → the INCLUDED beats, each as a `pinned` GameEvent with a
//                  `pinSeq` (arc order) and an arc-ordered phase window. The
//                  engine GUARANTEES these fire, in order, around the pool.
//   storyMeaning → plan.meaning verbatim → CampaignData.storyMeaning (the
//                  story-level ending, distinct from verdict / reviewSummary).
//
// No model call, no prompt, no core.ts wiring. Feed it a validated plan and
// the authored content survives VERBATIM; the pin guarantee is the engine's
// job (eventSelection.ts, step 3). Mirrors faultlineCompile.ts exactly.
//
// CHARACTER-MODE COEXISTENCE (§6 of the design): in character mode the
// fault-line compiler already owns the setter window [0, 0.3] and the
// reserved closing-dilemma tail [0.85, 1.0]. The caller passes a narrowed
// `band` (e.g. [0.35, 0.82]) so the pinned story beats tile only the middle
// and never collide with those fixed beats; the climax aligns with the
// existing closing dilemma rather than adding a second one, and the
// resolution is carried by storyMeaning (an end-screen beat), not an event.
// ════════════════════════════════════════════════════════════════

import type { GameEvent } from "./schema.js";
import type { NarrativePlan, PlanBeat } from "./storyPlan.js";

export interface StoryPlanPieces {
  pinnedEvents: GameEvent[];
  storyMeaning: string;
}

// The phase band the pinned beats may occupy. Default spans almost the whole
// arc (leaving a sliver at each end for opener/close framing). Character mode
// passes a narrowed band that avoids the fault-line's reserved windows.
export interface CompileOptions {
  band?: { min: number; max: number };
}

const DEFAULT_BAND = { min: 0.05, max: 0.95 } as const;

// Pinned beats win the priority lane regardless of weight, but a real weight
// keeps them well-formed for the pool code that still inspects them.
const EVENT_WEIGHT = 5;

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

// Split [lo, hi] into n contiguous, arc-ordered slices. Beat i claims
// [lo + i*span, lo + (i+1)*span]. phase_min is strictly increasing for n ≥ 1
// and span > 0, which is the monotonicity the narrative-coherence harness and
// the engine's arc ordering both rely on.
function sliceBand(lo: number, hi: number, n: number): { min: number; max: number }[] {
  if (n <= 0) return [];
  const span = (hi - lo) / n;
  return Array.from({ length: n }, (_, i) => ({
    min: round4(lo + i * span),
    max: round4(i === n - 1 ? hi : lo + (i + 1) * span),
  }));
}

// One included beat → one pinned, playable standard event. The scene becomes
// the event text VERBATIM; significance rides along (harness + future render).
// A single neutral forward choice makes it a valid, playable event — richer
// choices are out of scope for the compiler (mirrors the fault-line reader).
function buildPinnedEvent(beat: PlanBeat, seq: number, window: { min: number; max: number }): GameEvent {
  return {
    id: beat.id,
    phase_min: window.min,
    phase_max: window.max,
    weight: EVENT_WEIGHT,
    title: beat.title,
    text: beat.scene,
    significance: beat.significance,
    pinned: true,
    pinSeq: seq,
    type: "standard",
    choices: [{ text: "Go on." }],
  } satisfies GameEvent;
}

// ── The transform ────────────────────────────────────────────────
// INCLUDED beats only (an excluded beat is a teacher opt-out — never compiled).
// pinSeq follows the included beats' array order, which the validator has
// already proven is arc-monotonic (cause → escalation → climax → resolution).
export function storyPlanToCampaignPieces(
  plan: NarrativePlan,
  opts: CompileOptions = {},
): StoryPlanPieces {
  const band = opts.band ?? DEFAULT_BAND;
  const included = plan.beats.filter((b) => b.included);
  const windows = sliceBand(band.min, band.max, included.length);
  const pinnedEvents = included.map((beat, i) => buildPinnedEvent(beat, i, windows[i]));
  return { pinnedEvents, storyMeaning: plan.meaning };
}
