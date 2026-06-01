// Track-range instrument — estimates the realistic end-of-run range for the
// family/community relationship tracks over a full playthrough, by Monte Carlo
// replaying the ACTUAL engine event selector (selectEvent) on a generated
// campaign and applying each turn's chosen flagWrites under several player
// strategies. Tracks accumulate and clamp to [-10, 10] (see flagWrites.ts), so
// the question is: do they realistically REACH the extremes, or top out lower?
//
//   npx tsx generator/inspect-track-range.ts
//
// Read-only analysis — no files written, nothing generated.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
type Ev = {
  id: string;
  weight?: number;
  phase_min: number;
  phase_max: number;
  choices?: { flagWrites?: Record<string, number | boolean> }[];
};
const data = JSON.parse(
  readFileSync(join(__dirname, "joseph-generated-output.json"), "utf8"),
) as {
  totalDays: number;
  daysPerTurn: number;
  events: Ev[];
};

const TRACK_MIN = -10;
const TRACK_MAX = 10;
const EVENT_COOLDOWN_TURNS = 4;
const MAX_EVENT_REPEATS = 2;
const clamp = (v: number) => Math.max(TRACK_MIN, Math.min(TRACK_MAX, v));

function weightedPick<T extends { weight?: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + (i.weight || 1), 0);
  let r = Math.random() * total;
  for (const item of items) { r -= item.weight || 1; if (r <= 0) return item; }
  return items[0];
}

// Faithful copy of selectEvent's pool logic (routeTag tilt omitted — character
// campaigns have no route; tilt is a no-op here).
function selectEvent(
  day: number, totalDays: number, events: Ev[],
  counts: Record<string, number>, lastTurn: Record<string, number>, turn: number,
): Ev | null {
  const p = totalDays > 0 ? day / totalDays : 0;
  const inPhase = events.filter(e => p >= e.phase_min && p <= e.phase_max);
  if (inPhase.length === 0) return null;
  const fresh = inPhase.filter(e => !counts[e.id]);
  const reusable = inPhase.filter(e =>
    (counts[e.id] ?? 0) > 0 &&
    (counts[e.id] ?? 0) < MAX_EVENT_REPEATS &&
    turn - (lastTurn[e.id] ?? -Infinity) >= EVENT_COOLDOWN_TURNS);
  const pool = fresh.length > 0 ? fresh : reusable;
  if (pool.length === 0) return null;
  return weightedPick(pool.map(e => ({ ...e })));
}

const d = (fw: Record<string, number | boolean> | undefined, k: string) =>
  fw && typeof fw[k] === "number" ? (fw[k] as number) : 0;

type Strategy = (choices: Ev["choices"], track: "family" | "community") => number;

// the best positive delta available for a track within an event (for the
// static-supply ceiling calc only — NOT a choice picker)
const bestDelta = (choices: Ev["choices"], track: "family" | "community") =>
  !choices?.length ? -Infinity : Math.max(...choices.map(c => d(c.flagWrites, track)));

// committed: always take the INDEX of the choice that moves THIS track most positively
const committed: Strategy = (choices, track) => {
  if (!choices?.length) return -1;
  let best = 0, bestV = -Infinity;
  choices.forEach((c, i) => { const v = d(c.flagWrites, track); if (v > bestV) { bestV = v; best = i; } });
  return best;
};
// random: pick a uniformly random choice
const randomChoice: Strategy = (choices) =>
  choices?.length ? Math.floor(Math.random() * choices.length) : -1;
// leaning: p of the time take the most-track-positive choice, else random
const leaning = (p: number): Strategy => (choices, track) => {
  if (!choices?.length) return -1;
  if (Math.random() < p) return committed(choices, track);
  return Math.floor(Math.random() * choices.length);
};

// Run one full playthrough; return final {family, community}. `pick` returns a
// choice INDEX given the event's choices and which track the player favors.
function runOnce(
  favor: "family" | "community",
  pick: (choices: Ev["choices"], track: "family" | "community") => number,
): { family: number; community: number } {
  let family = 0, community = 0, day = 0, turn = 0;
  const counts: Record<string, number> = {};
  const lastTurn: Record<string, number> = {};
  const turns = Math.floor(data.totalDays / data.daysPerTurn);
  for (let t = 0; t < turns; t++) {
    turn = t; day = t * data.daysPerTurn;
    const ev = selectEvent(day, data.totalDays, data.events, counts, lastTurn, turn);
    if (!ev) continue;
    counts[ev.id] = (counts[ev.id] ?? 0) + 1;
    lastTurn[ev.id] = turn;
    if (!ev.choices?.length) continue;
    const idx = pick(ev.choices, favor);
    if (idx < 0 || idx >= ev.choices.length) continue;
    const fw = ev.choices[idx].flagWrites;
    family = clamp(family + d(fw, "family"));
    community = clamp(community + d(fw, "community"));
  }
  return { family, community };
}

function pctile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}
function summarize(xs: number[]) {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { mean, p10: pctile(xs, 0.10), p50: pctile(xs, 0.50), p90: pctile(xs, 0.90), max: Math.max(...xs), min: Math.min(...xs) };
}

// ── Static structure ──
const fEvents = data.events.filter(e => e.choices?.some(c => d(c.flagWrites, "family") !== 0));
const cEvents = data.events.filter(e => e.choices?.some(c => d(c.flagWrites, "community") !== 0));
const maxPosFamily = fEvents.reduce((s, e) => s + Math.max(0, bestDelta(e.choices, "family")), 0);
const maxPosCommunity = cEvents.reduce((s, e) => s + Math.max(0, bestDelta(e.choices, "community")), 0);
const allFamilyDeltas = data.events.flatMap(e => (e.choices ?? []).map(c => d(c.flagWrites, "family")).filter(v => v !== 0));
const allCommDeltas = data.events.flatMap(e => (e.choices ?? []).map(c => d(c.flagWrites, "community")).filter(v => v !== 0));

const turns = Math.floor(data.totalDays / data.daysPerTurn);
const N = 5000;
const RULE = "━".repeat(78);
console.log(`\n${RULE}`);
console.log(`  TRACK-RANGE INSTRUMENT — ${data.events.length} events, ${turns} turns, clamp [${TRACK_MIN}, ${TRACK_MAX}]`);
console.log(`  ${N} Monte Carlo playthroughs per strategy (real selectEvent: ≤${MAX_EVENT_REPEATS} fires/event, ${EVENT_COOLDOWN_TURNS}-turn cooldown)`);
console.log(RULE);

console.log(`\n  Static choice supply:`);
console.log(`    family-touching events:    ${fEvents.length}   community-touching events: ${cEvents.length}`);
console.log(`    family deltas present:     [${allFamilyDeltas.sort((a,b)=>a-b).join(", ")}]`);
console.log(`    community deltas present:  [${allCommDeltas.sort((a,b)=>a-b).join(", ")}]`);
console.log(`    sum of best-positive family delta over all family events (1 fire each):  +${maxPosFamily}`);
console.log(`    sum of best-positive community delta over all community events (1 fire): +${maxPosCommunity}`);
console.log(`    (events can fire up to ${MAX_EVENT_REPEATS}×, so the committed ceiling is higher — and clamps at ${TRACK_MAX})`);

// Band occupancy under a candidate 5-tier scheme, for a given extreme cutoff E:
//   extreme-high ≥E · high E-1..4 · middle 3..-3 · low -4..-(E-1) · extreme-low ≤-E
function bands(xs: number[], E: number) {
  const pct = (f: (v: number) => boolean) => (xs.filter(f).length / xs.length * 100).toFixed(0).padStart(3);
  return [
    `xhi ≥+${E}: ${pct(v => v >= E)}%`,
    `hi +4..+${E - 1}: ${pct(v => v >= 4 && v < E)}%`,
    `mid -3..+3: ${pct(v => v >= -3 && v <= 3)}%`,
    `lo -${E - 1}..-4: ${pct(v => v <= -4 && v > -E)}%`,
    `xlo ≤-${E}: ${pct(v => v <= -E)}%`,
  ].join("   ");
}

for (const [name, favor, pick] of [
  ["COMMITTED   (single-minded — always max this track)", "family", committed],
  ["LEANING 60% (a clear lean, but makes real tradeoffs)", "family", leaning(0.6)],
  ["LEANING 40% (mild preference)", "family", leaning(0.4)],
  ["RANDOM      (no priority / pure chance)", "family", randomChoice],
] as [string, "family" | "community", Strategy][]) {
  const xs = Array.from({ length: N }, () => runOnce(favor, pick).family);
  const s = summarize(xs);
  console.log(`\n  ── FAMILY · ${name} ──`);
  console.log(`     mean ${s.mean.toFixed(1)}   p50 ${s.p50}   p90 ${s.p90}   range [${s.min}, ${s.max}]`);
  console.log(`     bands @ extreme ±8 :  ${bands(xs, 8)}`);
  console.log(`     bands @ extreme ±9 :  ${bands(xs, 9)}`);
}

// ── Joint distribution: when family pins high, where does community land? ──
// The "you can't be good to everyone" design only holds if committing to one
// track drags the other DOWN (or at least doesn't also pin it high). If both
// pin high, that's a costless double-win = a delta-balancing leak (NOT a tiers
// problem). Measure the correlation + community's distribution in family-lean runs.
function corr(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; cov += da * db; va += da * da; vb += db * db; }
  return cov / (Math.sqrt(va * vb) || 1);
}

for (const [name, pick] of [
  ["COMMITTED to family (single-minded)", committed],
  ["LEANING family 60% (a clear lean)", leaning(0.6)],
] as [string, Strategy][]) {
  const runs = Array.from({ length: N }, () => runOnce("family", pick));
  const fam = runs.map(r => r.family);
  const com = runs.map(r => r.community);
  const r = corr(fam, com);
  const highFam = runs.filter(x => x.family >= 9);
  const comWhenFamHigh = highFam.map(x => x.community);
  const sc = comWhenFamHigh.length ? summarize(comWhenFamHigh) : null;
  const pct = (f: (v: number) => boolean) =>
    comWhenFamHigh.length ? (comWhenFamHigh.filter(f).length / comWhenFamHigh.length * 100).toFixed(0) : "—";
  console.log(`\n  ── JOINT · ${name} ──`);
  console.log(`     family↔community correlation: ${r.toFixed(2)}  ${r < -0.15 ? "(anti-correlated → tradeoff is REAL ✓)" : r > 0.15 ? "(POSITIVE → possible double-win leak ⚠)" : "(near-zero → independent, no forced tradeoff)"}`);
  console.log(`     when family ≥+9 (${highFam.length} runs): community  mean ${sc ? sc.mean.toFixed(1) : "—"}  p50 ${sc ? sc.p50 : "—"}  range [${sc ? sc.min : "—"}, ${sc ? sc.max : "—"}]`);
  console.log(`        community also pinned high (≥+9): ${pct(v => v >= 9)}%    community high (≥+4): ${pct(v => v >= 4)}%    community low/mid (≤+3): ${pct(v => v <= 3)}%`);
}

// ── Frontier: the achievable (family, community) corners over the whole bank ──
// Single fire per event (RNG-free), clamped — brackets what a determined player
// can reach. The "good to everyone" leak = a JOINT-MAX policy that pins BOTH.
function policyTotals(score: (f: number, c: number) => number) {
  let F = 0, C = 0;
  for (const e of data.events) {
    if (!e.choices?.length) continue;
    let best = -1, bestV = -Infinity;
    e.choices.forEach((ch, i) => {
      const v = score(d(ch.flagWrites, "family"), d(ch.flagWrites, "community"));
      if (v > bestV) { bestV = v; best = i; }
    });
    if (best < 0) continue;
    F = clamp(F + d(e.choices[best].flagWrites, "family"));
    C = clamp(C + d(e.choices[best].flagWrites, "community"));
  }
  return { F, C };
}
const famMax = policyTotals((f) => f);
const comMax = policyTotals((_f, c) => c);
const allCh = data.events.flatMap(e => e.choices ?? []);
const famUpComDown = allCh.filter(c => d(c.flagWrites, "family") > 0 && d(c.flagWrites, "community") < 0).length;
const comUpFamDown = allCh.filter(c => d(c.flagWrites, "community") > 0 && d(c.flagWrites, "family") < 0).length;

// EXACT feasibility (mirrors the validator): familySum → max communitySum over
// ALL lines of play. Then: is any (family≥4, community≥4) reachable, and what's
// the best achievable min(family, community) a "good to everyone" player can hit?
let dp = new Map<number, number>([[0, 0]]);
for (const e of data.events) {
  const pairs = (e.choices ?? []).map(c => ({ f: d(c.flagWrites, "family"), c: d(c.flagWrites, "community") }));
  if (pairs.length === 0) continue;
  const next = new Map<number, number>();
  for (const [fs, cs] of dp) for (const p of pairs) {
    const nf = fs + p.f, nc = cs + p.c;
    const prev = next.get(nf);
    if (prev === undefined || nc > prev) next.set(nf, nc);
  }
  dp = next;
}
let bestMin = -Infinity, bestPair = "—";
let doubleWin = false;
for (const [fs, cs] of dp) {
  const m = Math.min(fs, cs);
  if (m > bestMin) { bestMin = m; bestPair = `family ${fs >= 0 ? "+" : ""}${fs} / community ${cs >= 0 ? "+" : ""}${cs}`; }
  if (fs >= 4 && cs >= 4) doubleWin = true;
}

console.log(`\n  ── FRONTIER (single fire per event) ──`);
console.log(`     family-max policy    → family ${famMax.F >= 0 ? "+" : ""}${famMax.F}   community ${famMax.C >= 0 ? "+" : ""}${famMax.C}`);
console.log(`     community-max policy → family ${comMax.F >= 0 ? "+" : ""}${comMax.F}   community ${comMax.C >= 0 ? "+" : ""}${comMax.C}`);
console.log(`     best "good to everyone" point (max of min(fam,com)): ${bestPair}`);
console.log(`        ${doubleWin ? "⚠ a line of play reaches BOTH ≥+4 → 'good to everyone' is POSSIBLE → tradeoff FAKE" : "✓ NO line of play pins both ≥+4 → you cannot be good to everyone"}`);
console.log(`     opposite-sign choices:  family↑/community↓: ${famUpComDown}    community↑/family↓: ${comUpFamDown}`);

// ── Source diagnostic: what does the max-FAMILY choice cost community? ──
// If committing to family also helps (or doesn't hurt) community, the deltas
// don't encode a real tradeoff — that's the leak's origin.
console.log(`\n  ── SOURCE · the choice a family-committed player takes in each event ──`);
let famSum = 0, comSumOnFamPicks = 0;
for (const e of data.events) {
  if (!e.choices?.length) continue;
  const idx = committed(e.choices, "family");
  if (idx < 0) continue;
  const fw = e.choices[idx].flagWrites;
  const f = d(fw, "family"), c = d(fw, "community");
  if (f === 0 && c === 0) continue;
  famSum += f; comSumOnFamPicks += c;
  const tag = f > 0 && c >= 0 ? "← helps family, does NOT cost community" : f > 0 && c < 0 ? "← real tradeoff (family↑ community↓)" : "";
  console.log(`     ${e.id.padEnd(30)} family ${f >= 0 ? "+" : ""}${f}   community ${c >= 0 ? "+" : ""}${c}   ${tag}`);
}
console.log(`     ${"".padEnd(30)} ──────────────────────────────`);
console.log(`     ${"TOTAL on family-committed picks".padEnd(30)} family +${famSum}   community ${comSumOnFamPicks >= 0 ? "+" : ""}${comSumOnFamPicks}`);

console.log(`\n${RULE}\n`);
