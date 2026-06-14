// ════════════════════════════════════════════════════════════════
// Event selection for generated campaigns — extracted from
// GeneratedCampaign.tsx so the load-bearing PIN GUARANTEE is unit-testable
// without React. The component imports everything here; behavior for
// pin-free campaigns is byte-identical to the in-component version it
// replaced (the pin branch is inert when no event is pinned — proven in
// generator/eventPinning.test.ts).
//
// THE PIN GUARANTEE. A `pinned` event (NarrativePlan beat, compiled by
// storyPlanCompile.ts) is GUARANTEED to fire, in `pinSeq` order, via three
// mechanisms that together close the holes the old soft fault-line pin left
// (it lived in the weighted pool and could be skipped):
//   1. PRIORITY LANE — selectEvent returns the next due, unfired pin
//      deterministically, ahead of the weighted pool, bypassing the cooldown
//      / repeat / no-consecutive-reader rules that govern pool events.
//   2. DUE-FROM-MIN — a pin is eligible once progress ≥ its phase_min and
//      STAYS eligible until it fires (it ignores phase_max), so a coarse turn
//      step that jumps over a narrow window can't skip it.
//   3. END-OF-RUN FLUSH — the engine drains any still-unfired pins (in order)
//      before the run is allowed to end (see flushPendingPin, used at the
//      goal-reached transition in GeneratedCampaign.tsx).
// The weighted pool is otherwise unchanged; it fills the turns AROUND pins.
// ════════════════════════════════════════════════════════════════

// The minimal structural shape selection needs. The engine's GameEvent and
// the test fixtures both satisfy it. Kept loose (choices: unknown[]) so any
// event type flows through.
export interface SelectableEvent {
  id: string;
  phase_min: number;
  phase_max: number;
  weight?: number;
  choices?: unknown[];
  pinned?: boolean;
  pinSeq?: number;
}

// How the engine paces event repetition. Generated campaigns often ship with
// a small event bank (5–8) packed into overlapping phase windows, so without
// these guards the same event ("workers strike", "clear the stumps") fires
// turn after turn once the unseen pool empties.
export const EVENT_COOLDOWN_TURNS = 4; // an event can't recur within this many turns
export const MAX_EVENT_REPEATS = 2;    // ...and can fire at most this many times total

export function weightedPick<T extends { weight?: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + (i.weight || 1), 0);
  let r = Math.random() * total;
  for (const item of items) { r -= item.weight || 1; if (r <= 0) return item; }
  return items[0];
}

// ── Pin lane ──────────────────────────────────────────────────────

// True iff this campaign carries any pinned (narrative-spine) event. When
// false, every pin helper below is inert and selection is byte-identical to
// the pre-pin behavior.
export function campaignHasPins(events: SelectableEvent[]): boolean {
  return events.some((e) => e.pinned === true);
}

// An event is "fired" once its id has a positive count. (maxRepeats never
// applies to pins — they fire exactly once, by sequence.)
const fired = (e: SelectableEvent, counts: Record<string, number>): boolean =>
  (counts[e.id] ?? 0) > 0;

// All UNFIRED pinned events, in arc order (pinSeq, then array order for ties).
export function pendingPins<E extends SelectableEvent>(events: E[], counts: Record<string, number>): E[] {
  return events
    .filter((e) => e.pinned === true && !fired(e, counts))
    .sort((a, b) => (a.pinSeq ?? 0) - (b.pinSeq ?? 0));
}

// The next pin that is DUE (progress p ≥ its phase_min) and unfired, lowest
// pinSeq first. Returns null when no pin is due. DUE-FROM-MIN: phase_max is
// intentionally ignored — once a pin's window opens it stays due until fired,
// so a coarse turn granularity can never step past it.
export function nextDuePin<E extends SelectableEvent>(
  events: E[],
  p: number,
  counts: Record<string, number>,
): E | null {
  const due = pendingPins(events, counts).filter((e) => p >= e.phase_min);
  return due.length > 0 ? due[0] : null;
}

// END-OF-RUN FLUSH: the next unfired pin regardless of phase, or null when all
// pins have fired. The turn loop calls this at the goal-reached transition and
// fires the returned pin instead of ending, draining the queue one beat per
// turn so every checked beat appears before the close — no exceptions.
export function flushPendingPin<E extends SelectableEvent>(
  events: E[],
  counts: Record<string, number>,
): E | null {
  const pend = pendingPins(events, counts);
  return pend.length > 0 ? pend[0] : null;
}

// ── Pool selection (unchanged logic + the pin priority lane) ──────

// Choose the next event for this turn. A DUE PINNED beat always wins (priority
// lane, deterministic). Otherwise: brand-new events win; a previously seen
// event is only eligible again once it has cooled down AND is still under its
// repeat cap. When nothing qualifies we return null so the expedition simply
// travels this turn rather than replaying old content.
export function selectEvent<E extends SelectableEvent>(
  day: number,
  totalDays: number,
  events: E[],
  routeTag: string,
  counts: Record<string, number>,
  lastTurn: Record<string, number>,
  turn: number,
  maxRepeats: number,
  avoidReader = false,
): E | null {
  const p = totalDays > 0 ? day / totalDays : 0;

  // PRIORITY LANE: a due, unfired pinned beat fires deterministically, ahead
  // of the weighted pool and exempt from the cooldown/repeat/reader rules
  // below. Inert when the campaign has no pins (nextDuePin returns null), so
  // pin-free selection falls straight through to the original logic unchanged.
  const pin = nextDuePin(events, p, counts);
  if (pin) return pin;

  // The weighted pool is the NON-pinned events only. A pinned beat fires exactly
  // once, through the priority lane / flush above — never here — so excluding it
  // keeps it from recurring via the reuse/cooldown path. For a pin-free campaign
  // every event satisfies !pinned, so this is byte-identical to the old filter.
  const inPhase = events.filter(e => !e.pinned && p >= e.phase_min && p <= e.phase_max);
  if (inPhase.length === 0) return null;

  const tilt = (e: E) => {
    let w = e.weight || 1;
    if (routeTag === "SAFE") w = Math.max(1, w - 1);
    if (routeTag === "FAST") w += 1;
    return Math.max(1, w);
  };

  const fresh = inPhase.filter(e => !counts[e.id]);
  // Character moral dilemmas must fire EXACTLY ONCE (maxRepeats=1): a repeated
  // dilemma reads as a bug, not content. With maxRepeats=1 this filter is always
  // empty (any fired event has count ≥ 1), so each event plays once and the turn
  // simply advances when the fresh pool is spent. Systems campaigns keep the 2×
  // refire (resource events recurring is fine), so their behavior is unchanged.
  const reusable = inPhase.filter(e =>
    (counts[e.id] ?? 0) > 0 &&
    (counts[e.id] ?? 0) < maxRepeats &&
    turn - (lastTurn[e.id] ?? -Infinity) >= EVENT_COOLDOWN_TURNS,
  );
  let pool = fresh.length > 0 ? fresh : reusable;
  if (pool.length === 0) return null;
  // Endgame-rhythm backstop (character mode only; avoidReader is false for
  // systems, so their selection is byte-identical). Never fire two no-choice
  // "Go on." reader beats in a row: if the last event was a reader, prefer a
  // real choice. If ONLY readers remain eligible, defer to travel (return null)
  // rather than stacking a second reader — the deferred reader stays FRESH
  // (uncounted) and fires next turn once a travel beat has separated them, so
  // it's deferred, never DROPPED.
  if (avoidReader) {
    const withChoice = pool.filter(e => ((e.choices as unknown[] | undefined)?.length ?? 0) > 1);
    if (withChoice.length > 0) pool = withChoice;
    else return null;
  }
  return weightedPick(pool.map(e => ({ ...e, weight: tilt(e) }))) as E;
}
