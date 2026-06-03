// ════════════════════════════════════════════════════════════════
// Stage 0 of core.ts × FaultLineSpec: the COMPILER.
//
// A pure, deterministic transform that turns a validated FaultLineSpec
// (the moral fault line: a flag, an early setter choice, later readers)
// into the concrete CampaignData pieces the engine already plays:
//
//   flagDecl     → the entry that goes in CampaignData.flags[]
//   setterEvent  → an EARLY standard event whose chosen option carries
//                  flagWrites (and NO resource reward — identity is a
//                  flag, never a score)
//   readerEvents → LATER standard events whose `text` is a FlagText that
//                  varies by the flag value, so the same scene reads
//                  differently depending on the early choice
//
// No model call, no prompt, no core.ts wiring. This is the risk-free
// deterministic core: feed it the validated fault line and the validated
// content survives VERBATIM, and the declare→set→read lifecycle is
// guaranteed by construction. It mirrors how hand-built Joseph was made.
// ════════════════════════════════════════════════════════════════

import type { FlagDecl, FlagText, FlagVariant, GameEvent, Choice } from "./schema.js";
import type { FaultLineSpec, FaultLineReader } from "./faultline.js";

export interface FaultLinePieces {
  flagDecl: FlagDecl;
  setterEvent: GameEvent;
  readerEvents: GameEvent[];
}

// Phase windows the compiler OWNS. The setter claims an exclusive EARLY
// window; every reader sits strictly AFTER it, so the flag is always
// written before any reader is read. (Runtime ordering is proven in a
// later play-test; here it is a structural property of the emitted shapes.)
const SETTER_PHASE_MIN = 0.0;
const SETTER_PHASE_MAX = 0.3;
const READER_PHASE_START = 0.35;
// Readers must NOT tile into the campaign's TAIL. The back 15% ([0.85, 1.0]) is
// reserved for a climactic closing DILEMMA (see reserveClosingDilemma), so the
// final beat before the reckoning is a CHOICE, never a no-choice "Go on."
// reflection. The reckoning is itself the reflection tail; a reader tail would
// double it (reflection-on-reflection) and read as dead air. So readers tile
// only [0.35, READER_PHASE_END].
export const READER_PHASE_END = 0.85;
const EVENT_WEIGHT = 5;

// Stable, collision-resistant ids, prefixed so a later splice step can find
// (and never clash with) the fault-line events among model-generated ones.
const SETTER_ID = "fl_setter";
const readerId = (i: number): string => `fl_reader_${i}`;

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

// ── Setter ───────────────────────────────────────────────────────
// One early event. Each setter option becomes a Choice that writes the
// flag and nothing else. There is deliberately no `effects` key.
function buildSetterEvent(spec: FaultLineSpec): GameEvent {
  const flagId = spec.flag.id;
  const choices: Choice[] = spec.setter.options.map((o) => ({
    text: o.choiceText,
    flagWrites: { [flagId]: o.writes },
    result: o.moralReading,
  }));
  return {
    id: SETTER_ID,
    phase_min: SETTER_PHASE_MIN,
    phase_max: SETTER_PHASE_MAX,
    weight: EVENT_WEIGHT,
    title: spec.setter.beat,
    // Plain string — the setter does not read the flag, it writes it.
    text: spec.setter.situation,
    type: "standard",
    choices,
  };
}

// ── Readers ──────────────────────────────────────────────────────
// Group readers by their beat (a single later "scene"), preserving order.
// Each scene becomes ONE event whose text varies by flag value — so the
// same moment reads differently depending on the early choice. Two reader
// entries sharing a beat (one per flag value) collapse into one event with
// two variants; this is what makes a scene "remember" the choice.
function groupReadersByBeat(readers: FaultLineReader[]): FaultLineReader[][] {
  const groups = new Map<string, FaultLineReader[]>();
  for (const r of readers) {
    const arr = groups.get(r.beat);
    if (arr) arr.push(r);
    else groups.set(r.beat, [r]);
  }
  return [...groups.values()];
}

function buildReaderText(group: FaultLineReader[], spec: FaultLineSpec): FlagText {
  const flagId = spec.flag.id;
  const variants: FlagVariant[] = group.map((r) => ({
    whenFlag: flagId,
    equals: r.whenValue,
    text: r.narration,
  }));
  // `default` is a structural safety net only: by play-time the setter has
  // already written one of the covered values, so a variant always matches
  // and `default` never renders. Prefer the initial-state narration if the
  // scene provides one; otherwise fall back to the first narration.
  const initialMatch = group.find((r) => r.whenValue === spec.flag.initial);
  const fallback = (initialMatch ?? group[0]).narration;
  return { default: fallback, variants };
}

function buildReaderEvents(spec: FaultLineSpec): GameEvent[] {
  const groups = groupReadersByBeat(spec.readers);
  const n = groups.length;
  const span = (READER_PHASE_END - READER_PHASE_START) / n;
  return groups.map((group, i) => ({
    id: readerId(i),
    phase_min: round4(READER_PHASE_START + i * span),
    phase_max: round4(i === n - 1 ? READER_PHASE_END : READER_PHASE_START + (i + 1) * span),
    weight: EVENT_WEIGHT,
    title: group[0].beat,
    text: buildReaderText(group, spec),
    type: "standard",
    // The reader's job is to be READ. It carries one neutral forward choice
    // so it is a valid, playable standard event; richer choices are out of
    // scope for the compiler.
    choices: [{ text: "Go on." }],
  } satisfies GameEvent));
}

// ── The transform ────────────────────────────────────────────────
export function faultLineToCampaignPieces(spec: FaultLineSpec): FaultLinePieces {
  return {
    flagDecl: { ...spec.flag },
    setterEvent: buildSetterEvent(spec),
    readerEvents: buildReaderEvents(spec),
  };
}

// ════════════════════════════════════════════════════════════════
// ENDGAME RHYTHM: end on a CHOICE, not a reflection tail.
//
// Character campaigns close on the reckoning (the reflection). The PLAY must
// therefore climax on a hard decision — otherwise the back stretch tails off
// into a run of no-choice "Go on." reader beats (readers tile the back, dilemmas
// front-load and fire once), which is reflection-on-reflection competing with
// the reckoning. Two halves enforce the rhythm:
//   • reserveClosingDilemma — deterministic PLACEMENT: clamp one dilemma to own
//     the reserved tail [CLOSER_PHASE_MIN, 1.0]. Prefers the model's authored
//     climax; degrades gracefully to the latest dilemma.
//   • validateEndgameRhythm — the GUARD (blocks at delivery): proves a fresh
//     dilemma owns the tail (E1), no reader tiles past the reader band (E2),
//     and readers stay a small minority (E3). Placement satisfies all three by
//     construction; the guard is the backstop that proves it (frontier-guard
//     lesson — don't trust placement to just work).
// ════════════════════════════════════════════════════════════════

// The reserved tail: a closing dilemma is clamped to own [CLOSER_PHASE_MIN, 1.0].
export const CLOSER_PHASE_MIN = 0.85;
// E1 acceptance: a genuine, FRESH-at-end closer. A window with phase_min ≥ 0.80
// can't fire before the tail (selectEvent only considers events whose window
// contains the current progress), so it is structurally fresh when reached.
const CLOSER_MIN_PHASE_MIN = 0.8;
const CLOSER_MIN_PHASE_MAX = 0.9;

const choiceCount = (e: Record<string, unknown>): number =>
  Array.isArray(e.choices) ? (e.choices as unknown[]).length : 0;

// Deterministic placement. Character path only (callers gate on faultLine).
// Mutates data.events in place: clamps one multi-choice event to [0.85, 1.0].
// GRACEFUL DEGRADATION — prefers a model-authored tail climax (a dilemma the
// model already placed at phase_min ≥ 0.85, honoring the prompt nudge); if the
// model didn't author one, falls back to re-windowing whatever dilemma ends
// latest (= the purely deterministic outcome). Worst case = deterministic,
// best case = the model's real finale. If there are NO dilemmas, it no-ops and
// validateEndgameRhythm's E1 rejects the campaign.
export function reserveClosingDilemma(data: Record<string, unknown>): void {
  const events = Array.isArray(data.events) ? (data.events as Record<string, unknown>[]) : [];
  const dilemmas = events.filter((e) => e && e.id !== SETTER_ID && choiceCount(e) >= 2);
  if (dilemmas.length === 0) return;
  const phaseMax = (e: Record<string, unknown>) => (typeof e.phase_max === "number" ? e.phase_max : 0);
  const phaseMin = (e: Record<string, unknown>) => (typeof e.phase_min === "number" ? e.phase_min : 0);
  const tailAuthored = dilemmas.filter((e) => phaseMin(e) >= CLOSER_PHASE_MIN);
  const pool = tailAuthored.length > 0 ? tailAuthored : dilemmas;
  const closer = pool.reduce((a, b) => (phaseMax(b) > phaseMax(a) ? b : a));
  closer.phase_min = CLOSER_PHASE_MIN;
  closer.phase_max = 1;
}

export interface RhythmFinding {
  level: "error" | "warn";
  field: string;
  message: string;
}

// The GUARD. Run on a GENERATED character campaign (the produced `data`), wired
// into validateForDelivery under the same faultLine gate as the other character
// batteries, ERROR-level, blocking. Systems campaigns have no faultLine, so it
// never runs and their delivery is byte-identical.
export function validateEndgameRhythm(data: unknown): RhythmFinding[] {
  const f: RhythmFinding[] = [];
  const push = (level: "error" | "warn", field: string, message: string) =>
    f.push({ level, field, message });
  if (typeof data !== "object" || data === null) {
    push("error", "root", "campaign is not an object");
    return f;
  }
  const d = data as Record<string, unknown>;
  const events = Array.isArray(d.events) ? (d.events as Record<string, unknown>[]) : [];
  const dilemmas = events.filter((e) => choiceCount(e) >= 2);
  const readers = events.filter((e) => choiceCount(e) === 1);
  const D = dilemmas.length;

  // E1 — ENDS ON A DILEMMA. A real choice must own the tail so the last beat
  // before the reckoning is agency, not a "Go on." reflection. The window
  // thresholds also guarantee the closer is FRESH at the end (can't fire early).
  const closer = dilemmas.find(
    (e) =>
      typeof e.phase_min === "number" &&
      typeof e.phase_max === "number" &&
      (e.phase_min as number) >= CLOSER_MIN_PHASE_MIN &&
      (e.phase_max as number) >= CLOSER_MIN_PHASE_MAX,
  );
  if (!closer)
    push(
      "error",
      "events\u2192endgame.closer",
      `the campaign must END ON A DILEMMA: no multi-choice event owns the tail (needs phase_min \u2265 ${CLOSER_MIN_PHASE_MIN} AND phase_max \u2265 ${CLOSER_MIN_PHASE_MAX}). Without it the final beat before the reckoning is a no-choice reflection, doubling the reckoning's job. Place a climactic closing dilemma at [${CLOSER_PHASE_MIN}, 1.0].`,
    );

  // E2 — NO READER TILES THE TAIL. A single-choice reader must stay within the
  // reader band [0.35, READER_PHASE_END]; past it, reflection owns the ending.
  for (const e of readers) {
    if (typeof e.phase_max === "number" && (e.phase_max as number) > READER_PHASE_END)
      push(
        "error",
        "events\u2192endgame.readerTail",
        `single-choice reader "${String(e.id)}" extends to phase_max ${e.phase_max} > ${READER_PHASE_END}; readers must stay within [${READER_PHASE_START}, ${READER_PHASE_END}] so the tail is a choice, not reflection.`,
      );
  }

  // E3 — READER CAP. Readers echo ONE fault-line choice; size them to the
  // echo-need, not to length. min(3, ⌈D/4⌉) keeps them a small minority — a
  // longer campaign buys more dilemmas, not more reflections of the same call.
  const cap = Math.max(1, Math.min(3, Math.ceil(D / 4)));
  if (readers.length > cap)
    push(
      "error",
      "events\u2192endgame.readerCount",
      `${readers.length} single-choice reader beats exceed the cap of ${cap} (min(3, \u2308D/4\u2309) for D=${D} dilemmas); readers should be a small minority that echoes the fault line, not the tail of the event bank.`,
    );

  return f;
}
