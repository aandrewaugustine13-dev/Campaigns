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
  const span = (1 - READER_PHASE_START) / n;
  return groups.map((group, i) => ({
    id: readerId(i),
    phase_min: round4(READER_PHASE_START + i * span),
    phase_max: round4(i === n - 1 ? 1 : READER_PHASE_START + (i + 1) * span),
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
