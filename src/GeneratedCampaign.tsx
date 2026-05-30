import { useState, useCallback, useMemo, useEffect } from "react";
import { 
  Backpack, Droplets, Utensils, Users, Crosshair, 
  Shield, Coins, Heart, Smile, Zap, BookOpen, Map,
  ChevronRight, ChevronDown, Package
} from "lucide-react";

function ResourceIcon({ label, className }: { label: string; className?: string }) {
  const l = label.toLowerCase();
  if (l.includes("water") || l.includes("hydration")) return <Droplets className={className} />;
  if (l.includes("food") || l.includes("supply") || l.includes("ration")) return <Utensils className={className} />;
  if (l.includes("men") || l.includes("crew") || l.includes("party") || l.includes("hand")) return <Users className={className} />;
  if (l.includes("ammo") || l.includes("gun") || l.includes("bullet")) return <Crosshair className={className} />;
  if (l.includes("defen") || l.includes("wall") || l.includes("fort") || l.includes("wagon")) return <Shield className={className} />;
  if (l.includes("cash") || l.includes("money") || l.includes("silver") || l.includes("coin")) return <Coins className={className} />;
  if (l.includes("health")) return <Heart className={className} />;
  if (l.includes("morale")) return <Smile className={className} />;
  if (l.includes("insight")) return <Zap className={className} />;
  if (l.includes("knowledge")) return <BookOpen className={className} />;
  if (l.includes("distance") || l.includes("progress")) return <Map className={className} />;
  return <Package className={className} />;
}
import type { CampaignData } from "../generator/schema";
import type { Objective, RouteState } from "./gameModels";
import { generateObjective, tickObjectives, findNode } from "./gameLogic";
import SageEncounter from "./SageEncounter";
import VisualNovelEngine from "./VisualNovelEngine";
import PushYourLuckEngine from "./PushYourLuckEngine";
import DoomHUD from "./DoomHUD";
import TrailMap from "./TrailMap";
import FinalExam, { type ExamQuestion } from "./FinalExam";
import { CampaignLogModal } from "./CampaignLog";
import TradePost, { type TradeOffer } from "./TradePost";
import {
  useFloatingNumbers, FloatingNumbers,
  useScreenShake, useStatPulse, useResourceTracker,
  StatBox, ResourceBar, StreakFlash,
} from "./GameJuice";
import defaultCampaignJson from "../generator/output.json";

// ═════════════════════════════════════════════════════════════════
// GENERIC TEMPLATE FUNCTIONS
// These read from any CampaignData blob — not Lewis & Clark specific.
// ═════════════════════════════════════════════════════════════════

function clampR(data: CampaignData, k: string, v: number): number {
  const max = data.resourceCaps[k] ?? 100;
  return Math.max(0, Math.min(v, max));
}

// Progression mode. "project" campaigns advance by time (day/totalDays) and
// ship with empty paces/trailPath/trailStops; "journey" campaigns advance by
// distance and pace. Absent progressionMode + empty paces ⇒ treat as project
// so a malformed-but-paceless blob can't dereference paces[0].
function isProjectMode(data: CampaignData): boolean {
  return data.progressionMode === "project" || !(data.paces && data.paces.length);
}

// Percent-complete used for sages, flavor text, parallax and the map.
// Journey divides by distance (unchanged); project divides by elapsed days.
function deriveProgress(data: CampaignData, day: number, distance: number): number {
  if (isProjectMode(data)) return data.totalDays > 0 ? (day / data.totalDays) * 100 : 0;
  return data.totalDistance > 0 ? (distance / data.totalDistance) * 100 : 0;
}

// End-of-campaign condition. Journey arrives by distance (unchanged); project
// concludes when the calendar runs out.
function hasReachedGoal(data: CampaignData, day: number, distance: number): boolean {
  return isProjectMode(data) ? day >= data.totalDays : distance >= data.totalDistance;
}

function getRegionFlavor(data: CampaignData, progress: number): string {
  const stops = data.trailStops;
  for (let i = stops.length - 1; i >= 0; i--) {
    if (progress >= stops[i].pct) {
      const next = stops[i + 1];
      if (next) return `Near ${stops[i].name}, heading toward ${next.name}.`;
      return `Approaching ${stops[i].name}.`;
    }
  }
  return `Setting out from ${stops[0]?.name ?? "camp"}.`;
}

function getProgressPhrase(data: CampaignData, progress: number): string {
  const pct = progress * 100;
  if (pct < 15) return `The ${data.distanceUnit} stretch ahead. The journey has barely begun.`;
  if (pct < 30) return "Days pass. Routine forms. The unknown waits.";
  if (pct < 50) return "Halfway feels far behind and far ahead at once.";
  if (pct < 70) return "Past the midpoint. Every decision weighs more now.";
  if (pct < 85) return "The end is no longer an idea. It is a place.";
  if (pct < 95) return "Almost there. The final stretch tests everything.";
  return "The destination is close.";
}

function buildTrailFeedEntries(
  data: CampaignData,
  resources: Record<string, number>,
  paceId: string,
  _hardPaceStreak: number,
  distanceGain: number,
  day: number,
): string[] {
  const notes: string[] = [];
  notes.push(`Day ${day}: ${Math.round(distanceGain)} ${data.distanceUnit} covered at ${paceId} pace.`);

  const resKeys = Object.keys(data.initialResources);
  for (const k of resKeys) {
    const cap = data.resourceCaps[k] ?? 100;
    const pct = resources[k] / cap;
    const label = data.resourceLabels[k] ?? k;
    if (pct < 0.2) {
      notes.push(`${label} critically low.`);
    } else if (pct < 0.35) {
      notes.push(`${label} running thin.`);
    }
  }

  if (notes.length < 2) notes.push("The expedition holds steady.");
  return notes.slice(0, 3);
}

function getPartyMembers(data: CampaignData, resources: Record<string, number>) {
  const faces = data.pixelFaces;
  const roles = Object.keys(faces);
  return roles.map(role => {
    const levels = faces[role];
    const healthKey = Object.keys(resources).find(k =>
      k === "morale" || k === "health"
    ) ?? Object.keys(resources)[0];
    const healthVal = resources[healthKey] ?? 50;
    let label = "steady";
    for (const lv of [...levels].reverse()) {
      if (healthVal >= lv.threshold) { label = lv.label; break; }
    }
    return { id: role, role: role.charAt(0).toUpperCase() + role.slice(1), label, health: healthVal };
  });
}

// Pick a knowledge-check question, preferring ones the player has not seen
// this cycle. When every question has been used, recycle the whole pool so
// checks keep coming — but never repeat the question shown immediately
// before, so a tiny question bank still feels varied.
function pickTriviaQuestion(
  data: CampaignData,
  usedIds: Set<string>,
  excludeId: string | null,
) {
  let available = data.eventTrivia.filter(q => !usedIds.has(q.id) && q.id !== excludeId);
  if (available.length === 0) {
    available = data.eventTrivia.filter(q => q.id !== excludeId);
  }
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

// ═════════════════════════════════════════════════════════════════
// GENERIC PARALLAX — gradient placeholder, no campaign art needed
// ═════════════════════════════════════════════════════════════════

function GenericParallax({ progress, title }: { progress: number; pace: string; title: string }) {
  const hue = 180 + progress * 0.4;
  return (
    <div
      className="w-full h-28 relative overflow-hidden"
      style={{
        background: `linear-gradient(180deg,
          hsl(${hue}, 30%, 15%) 0%,
          hsl(${hue - 20}, 25%, 25%) 40%,
          hsl(${hue - 40}, 20%, 35%) 70%,
          hsl(30, 30%, 25%) 100%)`,
      }}
    >
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-stone-800 to-transparent" />
      <div className="absolute top-2 left-4 text-stone-500 text-[10px] italic">{title}</div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// GENERIC TRIVIA ENGINE
// ═════════════════════════════════════════════════════════════════

function GenericTriviaEngine({
  question,
  progress: _progress,
  streak,
  onComplete,
  primaryResourceKey,
  theme = 'default',
}: {
  question: { id: string; question: string; choices: string[]; correctIndex: number; fact?: string; explanation?: string };
  progress: number;
  streak: number;
  onComplete: (correct: boolean, effects: Record<string, number>) => void;
  primaryResourceKey: string;
  theme?: string;
}) {
  const [answered, setAnswered] = useState<number | null>(null);
  const correct = answered === question.correctIndex;
  const explanation = (question as Record<string, unknown>).explanation as string | undefined;

  // Rendered inside GeneratedCampaign's data-theme wrapper, so CSS variables
  // apply. The theme prop is retained for API compatibility but unused.
  void theme;

  return (
    <div className="border theme-border theme-bg-card-inner rounded p-4 space-y-3">
      <p className="text-xs theme-text-accent font-bold uppercase tracking-wide">
        Knowledge Check {streak > 0 && <span className="text-emerald-500">(streak: {streak})</span>}
      </p>
      <p className="text-sm theme-text">{question.question}</p>
      {answered === null ? (
        <div className="space-y-1">
          {question.choices.map((c, i) => (
            <button
              key={i}
              onClick={() => setAnswered(i)}
              className="w-full text-left text-xs theme-bg-card theme-border border rounded px-3 py-2 transition-colors hover:opacity-90"
            >
              {c}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <p className={`text-sm font-bold ${correct ? "text-emerald-400" : "text-red-400"}`}>
            {correct ? "Correct!" : "Not quite."}
          </p>
          {(explanation || question.fact) && (
            <p className="text-xs theme-text-muted">{explanation || question.fact}</p>
          )}
          <button
            onClick={() => onComplete(correct, correct ? { [primaryResourceKey]: 5, morale: 3 } : {})}
            className="w-full py-2 theme-btn-action rounded text-xs font-bold transition-colors"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// GENERIC OUTFIT SCREEN
// ═════════════════════════════════════════════════════════════════

interface GenericOutfit {
  allocations: Record<string, number>;
  budgetSpent: number;
}

function GenericOutfitScreen({ data, onDone }: { data: CampaignData; onDone: (outfit: GenericOutfit) => void }) {
  const ALLOWED_THEMES = new Set([
    "frontier-leather", "broadsheet-sepia", "parchment-medieval",
    "expedition-journal", "declassified-typewriter", "classical-marble",
    "default",
  ]);
  const theme = ALLOWED_THEMES.has(data.theme ?? "") ? (data.theme as string) : "default";

  // Cap the outfit to four items so it stays easy to track. Extra cost
  // keys (if the generator produced more) are ignored on this screen.
  const SLIDER_MAX = 10;
  const costKeys = Object.keys(data.outfitConfig.costs).slice(0, 4);
  const [allocs, setAllocs] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const k of costKeys) init[k] = 1;
    return init;
  });

  // Generators often hand out a budget large enough to max every slider,
  // which removes the whole point of outfitting. Force scarcity: cap the
  // working budget so a player can fill ~55% of total capacity and must
  // make trade-offs about what this expedition actually needs.
  const maxSpend = costKeys.reduce((sum, k) => sum + data.outfitConfig.costs[k] * SLIDER_MAX, 0);
  const budget = Math.max(
    1,
    Math.min(data.outfitConfig.budget || maxSpend, Math.round(maxSpend * 0.55)),
  );

  const spent = costKeys.reduce((sum, k) => sum + allocs[k] * data.outfitConfig.costs[k], 0);
  const remaining = budget - spent;

  return (
    <div data-theme={theme} className="h-screen theme-bg-page theme-text flex flex-col overflow-hidden theme-body-font">
      <GenericParallax progress={0} pace="rest" title={data.title} />
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <div className="max-w-lg mx-auto space-y-3">
          <div className="text-center">
            <h1 className="text-xl font-bold theme-text-accent theme-display-font">{data.title} — OUTFIT</h1>
            <p className="theme-text-muted text-xs mt-0.5">
              Prepare your expedition. Budget:{" "}
              <span className={remaining >= 0 ? "text-emerald-500" : "text-red-500"}>
                ${remaining.toLocaleString()}
              </span>{" "}
              of ${budget.toLocaleString()}
            </p>
            <p className="theme-text-muted text-[10px] mt-0.5 italic">Funds are tight — you can't afford everything. Choose what matters.</p>
          </div>

          {costKeys.map(k => (
            <div key={k} className="theme-bg-card theme-border border rounded p-2.5">
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="theme-text font-bold">{k.replace(/_/g, " ")}</span>
                <span className="font-mono theme-text-accent">
                  {allocs[k]} <span className="theme-text-muted">(${data.outfitConfig.costs[k]}/ea)</span>
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={SLIDER_MAX}
                value={allocs[k]}
                onChange={e => setAllocs(prev => ({ ...prev, [k]: +e.target.value }))}
                className="w-full accent-amber-500 h-2"
              />
            </div>
          ))}

          <button
            onClick={() => remaining >= 0 && onDone({ allocations: allocs, budgetSpent: spent })}
            disabled={remaining < 0}
            className="w-full py-3 theme-btn-action disabled:opacity-50 rounded font-bold transition-colors"
          >
            {remaining < 0 ? "OVER BUDGET" : "BEGIN EXPEDITION"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Personnel are people, not goods — never tradeable as inventory. Detected
// by resource key OR display label so generated campaigns can't offer to
// "trade men for supplies."
const PERSONNEL_RE = /crew|\bmen\b|soldier|sailor|people|person|worker|\bhand|troop|settler|passenger|guard|porter|labou?r|slave|servant|villager|recruit|warrior|knight|pilgrim|colonist|migrant|scout|rider|soul/i;
function isPersonnelResource(key: string, label?: string): boolean {
  return PERSONNEL_RE.test(key) || (label ? PERSONNEL_RE.test(label) : false);
}

// Nearest supply town ahead of the player, and whether it's close enough
// to stop at. Mirrors Chisholm's isNearSupplyTown but reads generated data.
function nearestSupplyTown(
  stops: { supply: boolean; pct: number; name: string }[] | undefined,
  progress: number,
): { near: boolean; town: string | null } {
  if (!Array.isArray(stops)) return { near: false, town: null };
  const next = stops.find(s => s && s.supply && s.pct > progress);
  if (!next) return { near: false, town: null };
  return { near: next.pct - progress < 8, town: next.name };
}

// A trading post deals in tangible SUPPLIES only — provisions, ammunition,
// medicine, materials — never abstract stats like morale, political support,
// or engineering skill, which can't sensibly be "bought." Money-like
// resources act as currency; everything else is off-limits at the post.
const MONEY_RE = /cash|coin|money|silver|gold|fund|treasur|budget|capital|wealth|currency|denari|florin|dinar|ducat|specie|bullion|purse/i;
const SUPPLY_RE = /suppl|provision|food|ration|water|grain|fodder|forage|ammo|ammunition|powder|medicine|medical|cement|timber|lumber|material|equipment|goods|cargo|fuel|tool|\bpart|spare|cloth|salt|spice|fur|pelt|fish|meat|seed|trade/i;

function isMoneyResource(key: string, label?: string): boolean {
  return MONEY_RE.test(key) || (label ? MONEY_RE.test(label) : false);
}
// A buyable/sellable good: matches the supply vocabulary and is not personnel
// or currency. This is what keeps "Sell political support" out of the post.
function isSupplyResource(key: string, label?: string): boolean {
  if (isPersonnelResource(key, label) || isMoneyResource(key, label)) return false;
  return SUPPLY_RE.test(key) || (label ? SUPPLY_RE.test(label) : false);
}

// Find the single currency resource for this economy, if one exists.
function findMoneyKey(
  resources: Record<string, number> | undefined,
  labels: Record<string, string> | undefined,
): string | undefined {
  const lbl = labels ?? {};
  return Object.keys(resources ?? {}).find(k => isMoneyResource(k, lbl[k]));
}

// Trade-post offers. With a currency present: buy or sell each supply for
// money (buy-back is priced under purchase so trading is lossy). With no
// currency: barter one physical supply for another. Abstract stats and
// people are never tradeable, so the post always "makes sense."
function computeGenericTradeOffers(
  resources: Record<string, number> | undefined,
  caps: Record<string, number> | undefined,
  _primaryKey: string,
  labels: Record<string, string> | undefined,
): TradeOffer[] {
  const res = resources ?? {};
  const capMap = caps ?? {};
  const lbl = labels ?? {};
  const cap = (k: string) => capMap[k] ?? 100;
  const offers: TradeOffer[] = [];

  const moneyKey = findMoneyKey(res, lbl);
  const supplies = Object.keys(res).filter(k => isSupplyResource(k, lbl[k]) && k !== moneyKey);

  if (moneyKey) {
    const moneyCap = cap(moneyKey);
    for (const k of supplies) {
      const buyQty = Math.max(1, Math.round(cap(k) * 0.2));      // ~20% of cap per buy
      const buyCost = Math.max(1, Math.round(moneyCap * 0.15));  // costs ~15% of money cap
      offers.push({
        id: `buy_${k}`,
        label: `Buy ${lbl[k] ?? k}`,
        give: { [moneyKey]: buyCost },
        get: { [k]: buyQty },
        disabled: (res[moneyKey] ?? 0) < buyCost,
      });
      const sellQty = Math.max(1, Math.round(cap(k) * 0.2));
      const sellGain = Math.max(1, Math.round(moneyCap * 0.1)); // sell back below buy price
      offers.push({
        id: `sell_${k}`,
        label: `Sell ${lbl[k] ?? k}`,
        give: { [k]: sellQty },
        get: { [moneyKey]: sellGain },
        disabled: (res[k] ?? 0) < sellQty,
      });
    }
  } else if (supplies.length >= 2) {
    // No currency in this economy — barter physical supplies for each other.
    const ratio = (k: string) => (res[k] ?? 0) / cap(k);
    const sorted = [...supplies].sort((a, b) => ratio(b) - ratio(a));
    const surplus = sorted[0];
    const needs = [...sorted].reverse().filter(k => k !== surplus);
    const TAX = 0.75;
    const mkBarter = (giveKey: string, getKey: string, id: string) => {
      const giveAmt = Math.max(1, Math.round((res[giveKey] ?? 0) * 0.25));
      const getAmt = Math.max(1, Math.floor((giveAmt / cap(giveKey)) * cap(getKey) * TAX));
      offers.push({
        id,
        label: `Trade ${lbl[giveKey] ?? giveKey} for ${lbl[getKey] ?? getKey}`,
        give: { [giveKey]: giveAmt },
        get: { [getKey]: getAmt },
        disabled: (res[giveKey] ?? 0) < giveAmt,
      });
    };
    if (needs[0]) mkBarter(surplus, needs[0], "barter_a");
    if (needs[1]) mkBarter(surplus, needs[1], "barter_b");
  }

  const seen = new Set<string>();
  return offers.filter(o => {
    const sig = JSON.stringify([o.give, o.get]);
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}

// ═════════════════════════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════════════════════════

interface Resources { [key: string]: number }
interface Outcome { weight: number; effects: Resources; result: string; earlyEnd?: boolean }
interface Choice { text: string; effects?: Resources; result?: string; outcomes?: Outcome[]; earlyEnd?: boolean }
interface GameEvent {
  id: string; phase_min: number; phase_max: number; weight: number;
  title: string; text: string;
  type?: "standard" | "push_luck";
  choices?: Choice[];
  attempts?: { id: string; buttonText: string; successText: string; failureText: string; riskChance: number; rewards: Resources; penalties: Resources }[];
  leaveText?: string;
  trivia?: string[];
  sageAdvice?: { name: string; role: string; line: string }[];
  riskProfile?: ("LOW" | "MED" | "HIGH")[];
  triviaGate?: boolean;
  imageSearchQuery?: string;
  image?: { thumbUrl: string; artist: string; license: string; sourceUrl: string; searchQuery: string };
}
interface Decision { event: string; choice: string; day: number; text?: string; detail?: string }

interface GameState {
  day: number; turn: number; resources: Resources;
  phase: "intro" | "outfit" | "sailing" | "event" | "result" | "end" | "trivia" | "event_trivia" | "sage";
  pace: string; distance: number; currentEvent: GameEvent | null;
  resultText: string; decisions: Decision[];
  gameOver: boolean; survived: boolean; earlySale: boolean;
  outfit: GenericOutfit;
  historicalKnowledge: number;
  knowledgeLog: string[];
  triviaCounter: number;
  currentTrivia: { id: string; question: string; choices: string[]; correctIndex: number; fact?: string } | null;
  usedTriviaIds: Set<string>;
  lastTriviaId: string | null;
  usedGateIds: Set<string>;
  eventCounts: Record<string, number>;
  eventLastTurn: Record<string, number>;
  triviaStreak: number;
  insight: number;
  objectives: Objective[];
  routeState: RouteState;
  routeTag: "SAFE" | "FAST" | "PROFIT";
  riskHintsOn: boolean;
  pendingChoiceIndex: number | null;
  pendingEventQuestion: { question: string; choices: string[]; correctIndex: number; fact: string } | null;
  objectiveNotice: string;
  sageIndex: number;
  currentSage: CampaignData["sages"][number] | null;
  sagesMet: string[];
  trailFeed: string[];
  hardPaceStreak: number;
  inventoryOpen: boolean;
}

// ═════════════════════════════════════════════════════════════════
// ENGINE HELPERS
// ═════════════════════════════════════════════════════════════════

function weightedPick<T extends { weight?: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + (i.weight || 1), 0);
  let r = Math.random() * total;
  for (const item of items) { r -= item.weight || 1; if (r <= 0) return item; }
  return items[0];
}

// How the engine paces event repetition. Generated campaigns often ship with
// a small event bank (5–8) packed into overlapping phase windows, so without
// these guards the same event ("workers strike", "clear the stumps") fires
// turn after turn once the unseen pool empties.
const EVENT_COOLDOWN_TURNS = 4; // an event can't recur within this many turns
const MAX_EVENT_REPEATS = 2;    // ...and can fire at most this many times total

// Choose the next event for this turn. Brand-new events always win; a
// previously seen event is only eligible again once it has cooled down AND is
// still under its repeat cap. When nothing qualifies we return null so the
// expedition simply travels this turn rather than replaying old content.
function selectEvent(
  day: number,
  totalDays: number,
  events: GameEvent[],
  routeTag: string,
  counts: Record<string, number>,
  lastTurn: Record<string, number>,
  turn: number,
): GameEvent | null {
  const p = totalDays > 0 ? day / totalDays : 0;
  const inPhase = events.filter(e => p >= e.phase_min && p <= e.phase_max);
  if (inPhase.length === 0) return null;

  const tilt = (e: GameEvent) => {
    let w = e.weight || 1;
    if (routeTag === "SAFE") w = Math.max(1, w - 1);
    if (routeTag === "FAST") w += 1;
    return Math.max(1, w);
  };

  const fresh = inPhase.filter(e => !counts[e.id]);
  const reusable = inPhase.filter(e =>
    (counts[e.id] ?? 0) > 0 &&
    (counts[e.id] ?? 0) < MAX_EVENT_REPEATS &&
    turn - (lastTurn[e.id] ?? -Infinity) >= EVENT_COOLDOWN_TURNS,
  );
  const pool = fresh.length > 0 ? fresh : reusable;
  if (pool.length === 0) return null;
  return weightedPick(pool.map(e => ({ ...e, weight: tilt(e) })));
}

// Choose an event-trivia gate question, preferring unseen ones and recycling
// the bank when exhausted, so the gate stays varied across a long run.
function selectGateQuestion(
  pool: CampaignData["eventTrivia"],
  usedIds: Set<string>,
) {
  if (!pool || pool.length === 0) return null;
  const available = pool.filter(q => !usedIds.has(q.id));
  const choices = available.length > 0 ? available : pool;
  return choices[Math.floor(Math.random() * choices.length)];
}

function shouldGateTrivia(eventId: string, turn: number) {
  return (eventId.length + turn) % 4 === 0;
}

function resolveChoice(ch: Choice): { effects?: Resources; result?: string; earlyEnd?: boolean } {
  if (ch.outcomes) return weightedPick(ch.outcomes);
  return { effects: ch.effects, result: ch.result, earlyEnd: ch.earlyEnd };
}

function getGrade(survived: boolean, primaryPct: number, knowledge: number): string {
  if (!survived) return primaryPct > 0.5 ? "D" : "F";
  const primaryScore = Math.min(primaryPct / 0.95, 1) * 50;
  const survivalScore = 20;
  const knowledgeScore = Math.min(knowledge / 30, 1) * 30;
  const total = primaryScore + survivalScore + knowledgeScore;
  if (total >= 85) return "A+";
  if (total >= 75) return "A";
  if (total >= 65) return "B";
  if (total >= 50) return "C";
  return "D";
}

function getAchievements(state: GameState, data: CampaignData): string[] {
  const achievements: string[] = [];
  if (state.survived) achievements.push("Successfully completed the expedition.");
  if (state.historicalKnowledge >= 20) achievements.push("Achieved expert historical insight.");
  else if (state.historicalKnowledge >= 10) achievements.push("Gained significant historical knowledge.");
  if (state.triviaStreak >= 3) achievements.push(`${state.triviaStreak}-question knowledge streak!`);
  const highResource = Object.entries(state.resources).find(([_, v]) => v >= 80);
  if (highResource) {
    achievements.push(`Maintained excellent ${data.resourceLabels[highResource[0]] ?? highResource[0]}.`);
  }
  if (state.decisions.length > 5) achievements.push("Navigated complex leadership challenges.");
  if (achievements.length === 0) achievements.push("Survived the rigors of the trail.");
  return achievements.slice(0, 3);
}

const GC: Record<string, string> = {
  "A+": "text-amber-300", A: "text-emerald-400", B: "text-blue-400",
  C: "text-yellow-400", D: "text-orange-400", F: "text-red-500",
};

// ═════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════

export default function GeneratedCampaign({ onBack, data: dataProp }: { onBack: () => void; data?: CampaignData }) {
  const data = dataProp ?? (defaultCampaignJson as unknown as CampaignData);

  const ALLOWED_THEMES = new Set([
    "frontier-leather", "broadsheet-sepia", "parchment-medieval",
    "expedition-journal", "declassified-typewriter", "classical-marble",
    "default",
  ]);
  const theme = ALLOWED_THEMES.has(data.theme ?? "") ? (data.theme as string) : "default";

  // Semantic-class bundle. Layout/spacing/typography sizes stay as Tailwind
  // utilities; color/background/border/font-family come from CSS variables
  // defined in themes.css and selected via data-theme on the wrapper.
  const themeConfig = {
    container: "theme-bg-page theme-text",
    sidebar: "theme-bg-card theme-border",
    hud: "theme-bg-card theme-border",
    feedItem: "theme-bg-card-inner theme-divider",
    feedItemActive: "theme-bg-card-inner theme-border",
    accent: "theme-text-accent",
    subtext: "theme-text-muted",
    card: "theme-bg-card theme-border",
    innerCard: "theme-bg-card-inner theme-divider",
    button: "theme-btn-action",
    routeCard: "theme-bg-card-inner theme-border",
    routeText: "theme-text-accent font-bold",
    routeButton: "theme-bg-card-inner theme-border",
    questCard: "theme-bg-card-inner theme-border",
    questText: "theme-text-accent-2 font-bold",
  };

  const makeInit = useCallback((): GameState => ({
    day: 1, turn: 0, resources: { ...data.initialResources },
    phase: "intro", pace: data.paces[1]?.id ?? data.paces[0]?.id ?? "",
    distance: 0, currentEvent: null, resultText: "", decisions: [],
    gameOver: false, survived: false, earlySale: false,
    outfit: { allocations: {}, budgetSpent: 0 },
    historicalKnowledge: 0, knowledgeLog: [], triviaCounter: 0,
    currentTrivia: null, usedTriviaIds: new Set(), triviaStreak: 0,
    lastTriviaId: null, usedGateIds: new Set(),
    eventCounts: {}, eventLastTurn: {},
    insight: 1, objectives: [],
    routeState: { currentNodeId: "start" }, routeTag: "SAFE",
    riskHintsOn: false, pendingChoiceIndex: null, pendingEventQuestion: null,
    objectiveNotice: "", sageIndex: 0, currentSage: null, sagesMet: [],
    trailFeed: [data.trailFeedOpener], hardPaceStreak: 0,
    inventoryOpen: false,
  }), [data]);

  const [state, setState] = useState<GameState>(makeInit);
  // Final-exam gate. Built from the campaign's TEKS event-trivia, padded
  // with sage questions, capped at 10. End results stay locked until passed.
  const [examPassed, setExamPassed] = useState(false);
  const [examScore, setExamScore] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const [leftTownId, setLeftTownId] = useState<string | null>(null);
  const examQuestions = useMemo<ExamQuestion[]>(() => {
    const fromTrivia: ExamQuestion[] = (data.eventTrivia ?? []).map((q) => ({
      id: q.id, question: q.question, choices: q.choices, correctIndex: q.correctIndex, fact: q.fact,
    }));
    const fromSages: ExamQuestion[] = (data.sages ?? []).map((sg, i) => ({
      id: `sageq_${sg.id ?? i}`,
      question: sg.question.question,
      choices: sg.question.choices,
      correctIndex: sg.question.correctIndex,
      fact: sg.question.explanation,
      teksRef: sg.question.teksRef,
    }));
    return [...fromTrivia, ...fromSages]
      .filter((q) => Array.isArray(q.choices) && q.choices.length >= 2)
      .slice(0, 10);
  }, [data]);

  const start = useCallback(() => { setState({ ...makeInit(), phase: "outfit" }); setExamPassed(false); setExamScore(0); setLeftTownId(null); }, [makeInit]);
  const backToMenu = useCallback(() => { onBack(); }, [onBack]);

  // ── Game juice ──
  const { floats, spawn: spawnFloat } = useFloatingNumbers();
  const { shakeClass, shake } = useScreenShake();
  const { pulses, pulse } = useStatPulse();

  const onDelta = useCallback((key: string, delta: number) => {
    const label = data.resourceLabels[key] ?? key;
    pulse(key, delta > 0 ? "gain" : "loss");
    spawnFloat(delta, label);
  }, [data.resourceLabels, pulse, spawnFloat]);

  const onBigHit = useCallback((totalLoss: number) => {
    if (totalLoss > 100) shake("heavy");
    else if (totalLoss > 30) shake("medium");
    else shake("light");
  }, [shake]);

  useResourceTracker(state.resources, { onDelta, onBigHit });

  // ── Outfit done ──
  const onOutfitDone = useCallback((outfit: GenericOutfit) => {
    setState(prev => {
      const resources = { ...data.initialResources };
      for (const [k, qty] of Object.entries(outfit.allocations)) {
        const resKey = k.replace(/_/g, "_");
        if (resources[resKey] !== undefined) {
          resources[resKey] = clampR(data, resKey, resources[resKey] + qty * 5);
        }
      }
      return { ...prev, phase: "sailing" as const, outfit, resources, trailFeed: [data.trailFeedOpener] };
    });
  }, [data]);

  // ── Core turn advance ──
  const advanceTurn = useCallback(() => {
    setState(prev => {
      const s: GameState = { ...prev, resources: { ...prev.resources } };
      const before = { turn: prev.turn, day: prev.day, distance: prev.distance, resources: { ...prev.resources } };
      s.turn += 1;
      const project = isProjectMode(data);
      const pace = project ? null : (data.paces.find(p => p.id === s.pace) ?? data.paces[0]);
      s.day = Math.min(s.day + data.daysPerTurn, data.totalDays + 1);

      // [journey] pace fx — project ships no paces, so this is skipped
      if (pace) {
        for (const [k, v] of Object.entries(pace.fx)) {
          s.resources[k] = clampR(data, k, (s.resources[k] || 0) + v);
        }
      }

      if (s.routeTag === "FAST") {
        if (s.resources.health !== undefined) s.resources.health = clampR(data, "health", s.resources.health - 2);
        if (s.resources.morale !== undefined) s.resources.morale = clampR(data, "morale", s.resources.morale - 2);
      }
      if (s.routeTag === "SAFE" && s.resources.morale !== undefined) {
        s.resources.morale = clampR(data, "morale", s.resources.morale + 1);
      }

      // [journey] distance + hardPaceStreak — project advances by time, not travel
      let distanceGain = 0;
      if (pace) {
        distanceGain = pace.mpd * data.daysPerTurn;
        s.distance = Math.min(s.distance + distanceGain, data.totalDistance);
        s.hardPaceStreak = pace.id === data.paces[data.paces.length - 1]?.id
          ? s.hardPaceStreak + 1 : Math.max(0, s.hardPaceStreak - 1);
      }

      // Supplies drain
      if (s.resources.supplies !== undefined) {
        s.resources.supplies = clampR(data, "supplies", s.resources.supplies - 2);
      }

      // Low-resource attrition
      for (const k of Object.keys(s.resources)) {
        const cap = data.resourceCaps[k] ?? 100;
        if (s.resources[k] / cap < 0.15 && k !== data.primaryResourceKey && Math.random() < 0.3) {
          if (s.resources.morale !== undefined) {
            s.resources.morale = clampR(data, "morale", s.resources.morale - 3);
          }
        }
      }

      const turnFeed = buildTrailFeedEntries(data, s.resources, pace?.id ?? s.pace, s.hardPaceStreak, distanceGain, s.day);
      s.trailFeed = [...s.trailFeed, ...turnFeed].slice(-18);

      // Fail conditions: check key resources
      const criticallyLow = Object.entries(s.resources).filter(([k, v]) => {
        if (k === data.primaryResourceKey) return false;
        const cap = data.resourceCaps[k] ?? 100;
        return v <= 0 && cap > 10;
      });
      if (criticallyLow.length >= 2 || (s.resources.morale !== undefined && s.resources.morale <= 0)) {
        return { ...s, phase: "end" as const, gameOver: true, survived: false };
      }
      if (hasReachedGoal(data, s.day, s.distance)) {
        return { ...s, phase: "end" as const, gameOver: true, survived: true };
      }

      // Objectives
      const tick = tickObjectives(s.objectives, before, { turn: s.turn, day: s.day, distance: s.distance, resources: { ...s.resources } });
      s.objectives = tick.active;
      if (tick.completedNow.length > 0) {
        const first = tick.completedNow[0];
        s.insight += first.reward.insight;
        for (const completed of tick.completedNow) {
          if (completed.reward.resources) {
            for (const [k, v] of Object.entries(completed.reward.resources)) {
              s.resources[k] = clampR(data, k, (s.resources[k] || 0) + v);
            }
          }
        }
        s.objectiveNotice = `Objective Complete! ${first.title} (+${first.reward.insight} Insight)`;
      }
      if (s.turn % 3 === 0 && s.objectives.length < 2) {
        s.objectives = [...s.objectives, generateObjective({ turn: s.turn, day: s.day, distance: s.distance, resources: s.resources })];
      }

      // Sage check
      const currentProgress = deriveProgress(data, s.day, s.distance);
      if (s.sageIndex < data.sages.length) {
        const nextSage = data.sages[s.sageIndex];
        if (currentProgress >= nextSage.threshold) {
          s.currentSage = nextSage;
          s.phase = "sage";
          return s;
        }
      }

      // Event
      const event = selectEvent(s.day, data.totalDays, data.events as GameEvent[], s.routeTag, s.eventCounts, s.eventLastTurn, s.turn);
      if (event) {
        if (s.triviaCounter >= 2) {
          const trivia = pickTriviaQuestion(data, s.usedTriviaIds, s.lastTriviaId);
          if (trivia) {
            s.currentTrivia = trivia;
            const nextUsed = new Set(s.usedTriviaIds).add(trivia.id);
            // Recycle once every question has been seen so checks keep coming.
            s.usedTriviaIds = nextUsed.size >= data.eventTrivia.length ? new Set([trivia.id]) : nextUsed;
            s.lastTriviaId = trivia.id;
            s.triviaCounter = 0;
            s.phase = "trivia";
            return s;
          }
        }
        s.eventCounts = { ...s.eventCounts, [event.id]: (s.eventCounts[event.id] ?? 0) + 1 };
        s.eventLastTurn = { ...s.eventLastTurn, [event.id]: s.turn };
        s.currentEvent = { ...event, triviaGate: shouldGateTrivia(event.id, s.turn) };
        s.phase = "event";
        s.riskHintsOn = false;
        s.pendingChoiceIndex = null;
        s.pendingEventQuestion = null;
        s.triviaCounter++;
      }
      return s;
    });
  }, [data]);

  // ── Route choice ──
  const chooseRoute = useCallback((toId: string, tag: "SAFE" | "FAST" | "PROFIT") => {
    setState(prev => ({ ...prev, routeState: { currentNodeId: toId }, routeTag: tag }));
  }, []);

  // ── Town barter ──
  const handleTrade = useCallback((offer: TradeOffer, townName: string) => {
    setState(prev => {
      const s: GameState = { ...prev, resources: { ...prev.resources }, decisions: [...prev.decisions] };
      for (const [k, v] of Object.entries(offer.give)) if ((s.resources[k] || 0) < v) return prev;
      for (const [k, v] of Object.entries(offer.give)) s.resources[k] = clampR(data, k, (s.resources[k] || 0) - v);
      for (const [k, v] of Object.entries(offer.get)) s.resources[k] = clampR(data, k, (s.resources[k] || 0) + v);
      const note = `${offer.label} at ${townName}.`;
      s.decisions.push({ event: `Trade — ${townName}`, choice: offer.label, day: s.day, detail: note });
      s.resultText = note;
      s.phase = "result";
      return s;
    });
  }, [data]);

  // ── Event choice ──
  const finalizeChoice = useCallback((ci: number, insightBonus: number) => {
    setState(prev => {
      if (!prev.currentEvent?.choices) return prev;
      const s: GameState = { ...prev, resources: { ...prev.resources }, decisions: [...prev.decisions] };
      const choice = s.currentEvent!.choices![ci];
      const outcome = resolveChoice(choice);
      {
        const ev = s.currentEvent!;
        const fact = Array.isArray(ev.trivia) && ev.trivia.length ? `Did you know? ${ev.trivia[0]}` : "";
        s.decisions.push({
          event: ev.title,
          choice: choice.text,
          day: s.day,
          text: ev.text,
          detail: [outcome.result, fact].filter(Boolean).join("\n\n") || undefined,
        });
      }
      if (outcome.effects) {
        for (const [k, v] of Object.entries(outcome.effects)) {
          if (s.resources[k] !== undefined) s.resources[k] = clampR(data, k, s.resources[k] + v);
        }
      }
      if (insightBonus > 0) s.insight += insightBonus;
      if (choice.earlyEnd || outcome.earlyEnd) s.earlySale = true;
      s.resultText = insightBonus > 0
        ? `${outcome.result || ""}\n\nYou answered the trivia correctly and gained +${insightBonus} Insight.`
        : outcome.result || "";
      s.phase = "result";
      s.pendingChoiceIndex = null;
      s.pendingEventQuestion = null;
      return s;
    });
  }, [data]);

  const handleChoice = useCallback((ci: number) => {
    if (state.currentEvent?.triviaGate && data.eventTrivia.length > 0) {
      const q = selectGateQuestion(data.eventTrivia, state.usedGateIds);
      if (q) {
        setState(prev => {
          const nextUsed = new Set(prev.usedGateIds).add(q.id);
          return {
            ...prev,
            phase: "event_trivia" as const,
            pendingChoiceIndex: ci,
            pendingEventQuestion: q,
            usedGateIds: nextUsed.size >= data.eventTrivia.length ? new Set([q.id]) : nextUsed,
          };
        });
        return;
      }
    }
    finalizeChoice(ci, 0);
  }, [finalizeChoice, state.currentEvent?.triviaGate, state.usedGateIds, data.eventTrivia]);

  const handleEventTriviaAnswer = useCallback((choiceIndex: number) => {
    const q = state.pendingEventQuestion;
    const pi = state.pendingChoiceIndex;
    if (!q || pi === null) return;
    finalizeChoice(pi, choiceIndex === q.correctIndex ? 1 : 0);
  }, [state.pendingEventQuestion, state.pendingChoiceIndex, finalizeChoice]);

  const spendInsightForHints = useCallback(() => {
    setState(prev => prev.insight <= 0 || prev.riskHintsOn ? prev : { ...prev, insight: prev.insight - 1, riskHintsOn: true });
  }, []);

  const handlePushUpdate = useCallback((effects: Resources) => {
    setState(prev => {
      const s: GameState = { ...prev, resources: { ...prev.resources } };
      for (const [k, v] of Object.entries(effects)) {
        if (s.resources[k] !== undefined) s.resources[k] = clampR(data, k, s.resources[k] + v);
      }
      return s;
    });
  }, [data]);

  const handlePushLeave = useCallback((log: string[]) => {
    setState(prev => {
      if (!prev.currentEvent) return prev;
      const s: GameState = { ...prev, decisions: [...prev.decisions] };
      s.decisions.push({ event: s.currentEvent!.title, choice: `Pushed luck ${log.length - 1} times.`, day: s.day, text: s.currentEvent!.text });
      s.currentEvent = null;
      s.phase = "sailing";
      return s;
    });
  }, []);

  const continueGame = useCallback(() => {
    setState(prev => {
      const s: GameState = { ...prev, currentEvent: null, resultText: "", objectiveNotice: "" };
      // Check fail
      const criticallyLow = Object.entries(s.resources).filter(([k, v]) => {
        if (k === data.primaryResourceKey) return false;
        return v <= 0 && (data.resourceCaps[k] ?? 100) > 10;
      });
      if (criticallyLow.length >= 2 || (s.resources.morale !== undefined && s.resources.morale <= 0)) {
        return { ...s, phase: "end" as const, gameOver: true, survived: false };
      }
      if (hasReachedGoal(data, s.day, s.distance) || s.earlySale) {
        return { ...s, phase: "end" as const, gameOver: true, survived: true };
      }
      s.phase = "sailing";
      return s;
    });
  }, [data]);

  const handleSageComplete = useCallback((correct: boolean) => {
    setState(prev => {
      if (!prev.currentSage) return prev;
      const s: GameState = {
        ...prev, resources: { ...prev.resources }, decisions: [...prev.decisions],
        knowledgeLog: [...prev.knowledgeLog], sagesMet: [...prev.sagesMet],
      };
      const sage = s.currentSage!;
      const reward = correct ? sage.reward.correct : sage.reward.wrong;
      const knowledge = correct ? sage.reward.knowledgeCorrect : sage.reward.knowledgeWrong;
      for (const [k, v] of Object.entries(reward)) {
        if (k === "insight") s.insight += v;
        else if (s.resources[k] !== undefined) s.resources[k] = clampR(data, k, s.resources[k] + v);
      }
      s.historicalKnowledge += knowledge;
      s.knowledgeLog.push(`${sage.name}: +${knowledge} knowledge${correct ? " (correct)" : ""}`);
      s.decisions.push({
        event: `Sage: ${sage.name}`,
        choice: correct ? "Answered correctly" : `Learned from ${sage.name}`,
        day: s.day,
        text: sage.question.question,
        detail: `Correct answer: ${sage.question.choices[sage.question.correctIndex]}\n\n${sage.question.explanation}`,
      });
      s.sagesMet.push(sage.id);
      s.sageIndex = prev.sageIndex + 1;
      s.currentSage = null;
      s.phase = "sailing";
      return s;
    });
  }, [data]);

  const handleTriviaComplete = useCallback((correct: boolean, effects: Record<string, number>) => {
    setState(prev => {
      const s: GameState = { ...prev, resources: { ...prev.resources }, knowledgeLog: [...prev.knowledgeLog], decisions: [...prev.decisions] };
      const tq = s.currentTrivia;
      const triviaText = tq?.question;
      const triviaDetail = tq
        ? [`Correct answer: ${tq.choices[tq.correctIndex]}`, tq.fact].filter(Boolean).join("\n\n")
        : undefined;
      if (correct) {
        s.triviaStreak++;
        for (const [k, v] of Object.entries(effects)) {
          if (k === "historicalKnowledge") { s.historicalKnowledge += v; s.knowledgeLog.push(`Knowledge: +${v}`); }
          else if (s.resources[k] !== undefined) s.resources[k] = clampR(data, k, s.resources[k] + v);
        }
        s.decisions.push({ event: "Knowledge Check", choice: `Correct (streak: ${s.triviaStreak})`, day: s.day, text: triviaText, detail: triviaDetail });
      } else {
        s.triviaStreak = 0;
        s.decisions.push({ event: "Knowledge Check", choice: "Learned", day: s.day, text: triviaText, detail: triviaDetail });
      }
      s.currentTrivia = null;
      const reached = hasReachedGoal(data, s.day, s.distance);
      s.phase = reached ? "end" as const : "sailing" as const;
      if (reached) { s.gameOver = true; s.survived = true; }
      return s;
    });
  }, [data]);

  // ── Derived state ──
  const r = state.resources;
  const progress = deriveProgress(data, state.day, state.distance);
  const currentRouteNode = findNode(data.route, state.routeState.currentNodeId)
    || data.route?.[0]
    || { id: "start", title: "On the trail", description: "", edges: [] };
  const partyMembers = getPartyMembers(data, r);

  // ── Decision-driven progression ──────────────────────────────
  // No manual "advance" button. The expedition moves forward on its own
  // until it reaches a real route fork to decide; events/sages/trivia
  // (set by advanceTurn) pause it by leaving the "sailing" phase.
  const supplyTown = nearestSupplyTown(data.trailStops, progress);
  const atRouteFork = currentRouteNode.edges.length >= 2;
  const atTownStop = supplyTown.near && supplyTown.town !== leftTownId;
  const awaitingDecision = atRouteFork || atTownStop;
  useEffect(() => {
    if (state.phase !== "sailing" || state.gameOver || awaitingDecision) return;
    const t = setTimeout(() => advanceTurn(), 650);
    return () => clearTimeout(t);
  }, [state.phase, state.turn, state.gameOver, awaitingDecision, advanceTurn]);

  const topResources = useMemo(() => {
    const keys = Object.keys(data.initialResources);
    return keys.slice(0, 6);
  }, [data]);

  // Trading post deals only in money + tangible supplies; show exactly those.
  const tradeMoneyKey = useMemo(
    () => findMoneyKey(data.initialResources, data.resourceLabels),
    [data],
  );
  const tradeShowKeys = useMemo(() => {
    const supplies = Object.keys(data.initialResources)
      .filter(k => isSupplyResource(k, data.resourceLabels?.[k]));
    return [tradeMoneyKey, ...supplies].filter(Boolean) as string[];
  }, [data, tradeMoneyKey]);

  const barResources = useMemo(() => {
    const keys = Object.keys(data.initialResources);
    return keys.slice(6);
  }, [data]);

  const riskHints = (state.currentEvent?.choices || []).map((choice) => {
    if (choice.outcomes) {
      const avgLoss = choice.outcomes.reduce((sum, o) => {
        let loss = 0;
        for (const v of Object.values(o.effects)) if (v < 0) loss += Math.abs(v);
        return sum + loss;
      }, 0) / choice.outcomes.length;
      if (avgLoss > 70) return "HIGH";
      if (avgLoss > 30) return "MED";
      return "LOW";
    }
    let score = 0;
    if (choice.effects) for (const v of Object.values(choice.effects)) if (v < 0) score += Math.abs(v);
    if (score > 70) return "HIGH";
    if (score > 30) return "MED";
    return "LOW";
  });

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  if (state.phase === "intro") return (
    <div data-theme={theme} className={`h-screen ${themeConfig.container} flex flex-col items-center justify-center theme-body-font`}>
      <div className="max-w-md text-center space-y-4 p-4">
        {data.backdropImage && (
          <div className="space-y-1">
            <div
              className="w-full h-40 rounded overflow-hidden border theme-border"
              style={{
                backgroundImage: `url("${data.backdropImage.thumbUrl}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
            <p className="theme-text-muted leading-tight text-left" style={{ fontSize: "11px" }}>
              {data.backdropImage.artist} · {data.backdropImage.license} ·{" "}
              <a
                href={data.backdropImage.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline opacity-90 hover:opacity-100"
              >
                Source
              </a>
            </p>
          </div>
        )}
        <h1 className={`text-3xl font-bold theme-display-font ${themeConfig.accent}`}>{data.title}</h1>
        <p className={themeConfig.subtext}>{data.subtitle}</p>
        <p className={`${themeConfig.subtext} text-sm`}>{data.introBody}</p>
        <button onClick={start} className={`px-8 py-3 ${themeConfig.button} rounded font-bold transition-colors`}>BEGIN OUTFIT</button>
        <button onClick={backToMenu} className={`block w-full ${themeConfig.subtext} opacity-60 hover:opacity-100 text-xs mt-2`}>&larr; Back to Campaigns</button>
      </div>
    </div>
  );

  if (state.phase === "outfit") return <GenericOutfitScreen data={data} onDone={onOutfitDone} />;

  if (state.phase === "end") {
    // ── Gate: pass the TEKS final exam before the results unlock ──
    if (!examPassed && examQuestions.length > 0) {
      return (
        <div data-theme={theme} className="h-screen theme-bg-page theme-text p-4 overflow-y-auto theme-body-font flex items-center">
          <div className="max-w-lg mx-auto w-full space-y-4">
            <h1 className="text-2xl font-bold text-center theme-text-accent">Check for Understanding</h1>
            <FinalExam
              themed
              questions={examQuestions}
              decisionLog={state.decisions}
              subtitle="Answer the final exam to complete the campaign. Review your decisions if you get stuck."
              onPass={(correct) => { setExamScore(correct); setExamPassed(true); }}
            />
            <button onClick={backToMenu} className="block w-full theme-text-muted text-xs">← Back to Campaigns</button>
          </div>
        </div>
      );
    }

    const primaryKey = data.primaryResourceKey;
    const primaryVal = r[primaryKey] ?? 0;
    const primaryStart = data.primaryResourceStart;
    const primaryPct = primaryStart > 0 ? primaryVal / primaryStart : (primaryVal > 0 ? 1 : 0);
    const revenue = state.survived ? primaryVal * data.revenuePerUnit : 0;
    const cost = state.outfit.budgetSpent;
    const profit = revenue - cost;
    const examKnowledge = state.historicalKnowledge + examScore * 3;
    const grade = getGrade(state.survived, primaryPct, examKnowledge);

    const isDefense = data.distanceUnit.toLowerCase().includes("level") ||
      data.distanceUnit.toLowerCase().includes("wall") ||
      data.distanceUnit.toLowerCase().includes("defen") ||
      data.distanceUnit.toLowerCase().includes("fort") ||
      data.title.toLowerCase().includes("siege") ||
      data.title.toLowerCase().includes("defense");

    return (
      <div data-theme={theme} className="h-screen theme-bg-page theme-text p-4 overflow-y-auto theme-body-font">
        <div className="max-w-lg mx-auto space-y-4">
          <h1 className={`text-2xl font-bold text-center theme-display-font ${state.survived ? "theme-text-accent" : "text-red-500"}`}>
            {state.survived ? (isDefense ? "SIEGE CONCLUDED" : "EXPEDITION COMPLETE") : "EXPEDITION FAILED"}
          </h1>
          <p className="text-center theme-text text-sm">
            {state.survived
              ? isDefense
                ? `${data.title} — the garrison held out for ${state.day} days.`
                : `${data.title} — the expedition reached its destination on day ${state.day}.`
              : `Your expedition failed on day ${state.day}. The wilderness keeps what it takes.`}
          </p>

          {data.revenuePerUnit > 0 && (
            <div className="theme-bg-card theme-border border rounded p-3 space-y-1 text-xs">
              <h2 className="theme-text-accent font-bold uppercase tracking-wide text-center mb-1">Ledger</h2>
              <div className="flex justify-between theme-text-muted"><span>Outfit Cost</span><span className="text-red-400">-${cost.toLocaleString()}</span></div>
              <div className="flex justify-between theme-text-muted">
                <span className="capitalize">{data.resourceLabels[primaryKey] ?? primaryKey} (Start)</span>
                <span className="theme-text">{primaryStart}</span>
              </div>
              <div className="flex justify-between theme-text-muted">
                <span className="capitalize">{data.resourceLabels[primaryKey] ?? primaryKey} (End)</span>
                <span className="theme-text">{primaryVal}</span>
              </div>
              {state.survived && (
                <div className="flex justify-between theme-text-muted">
                  <span>Value (${data.revenuePerUnit}/unit)</span>
                  <span className="text-emerald-400">+${revenue.toLocaleString()}</span>
                </div>
              )}
              <div className="border-t theme-divider mt-1 pt-1 flex justify-between font-bold">
                <span className="theme-text">Net</span>
                <span className={profit >= 0 ? "text-emerald-400" : "text-red-500"}>{profit >= 0 ? "+" : ""}${profit.toLocaleString()}</span>
              </div>
            </div>
          )}

          <div className="theme-bg-card theme-border border rounded p-3 space-y-1 text-xs">
            <h2 className="theme-text-accent font-bold uppercase tracking-wide text-center mb-1">Historical Knowledge</h2>
            <div className="flex justify-between font-bold">
              <span className="theme-text">Wisdom Earned</span>
              <span className="theme-text-accent">{state.historicalKnowledge} points</span>
            </div>
            <div className="w-full theme-bg-track rounded-full h-2 mt-1">
              <div className="bg-amber-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(state.historicalKnowledge / 30 * 100, 100)}%` }} />
            </div>
            {state.knowledgeLog.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {state.knowledgeLog.map((log, i) => (
                  <p key={i} className="theme-text-muted text-xs">{log}</p>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="theme-bg-card theme-border border rounded p-3 space-y-1">
              <h2 className="theme-text-accent font-bold text-xs uppercase tracking-wide text-center">Expedition Stats</h2>
              {([
                ["Days", `${state.day}`],
                [
                  isDefense ? "Defenses" : "Distance",
                  `${Math.round(state.distance)} ${data.distanceUnit}`
                ],
                ...Object.entries(r).slice(0, 4).map(([k, v]) => [data.resourceLabels[k] ?? k, `${Math.round(v)}`]),
              ] as [string, string][]).filter(([l]) => !(isDefense && l === "Distance")).map(([l, v]) => (
                <div key={l} className="flex justify-between theme-text-muted text-xs">
                  <span className="capitalize">{l}</span>
                  <span className="theme-text">{v}</span>
                </div>
              ))}
            </div>
            <div className="theme-bg-card theme-border border rounded p-3 space-y-1">
              <h2 className="theme-text-accent-2 font-bold text-xs uppercase tracking-wide text-center">Achievements</h2>
              <ul className="theme-text-muted text-[10px] leading-relaxed list-disc list-inside">
                {getAchievements(state, data).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="text-center">
            <span className="theme-text-muted text-xs">EXPEDITION RATING: </span>
            <span className={`text-4xl font-bold ${GC[grade]}`}>{grade}</span>
          </div>

          <div className="theme-bg-card theme-border border rounded p-3">
            <p className="text-xs theme-text-muted leading-relaxed">{data.historicalContext}</p>
          </div>

          {state.decisions.length > 0 && (
            <button
              onClick={() => setShowLog(true)}
              className="w-full theme-bg-card theme-border border rounded p-3 text-left hover:brightness-110 transition-all"
            >
              <h3 className="text-xs font-bold theme-text-accent uppercase tracking-wide">Open Campaign Log</h3>
              <p className="text-xs theme-text-muted mt-0.5">Click back through every decision, event, and answer from your journey.</p>
            </button>
          )}

          <div className="text-center pb-4 space-y-2">
            <button onClick={() => { setState(makeInit()); setExamPassed(false); setExamScore(0); setLeftTownId(null); }} className="px-5 py-2 theme-btn-action font-bold rounded transition-colors">Run It Again</button>
            <br /><button onClick={backToMenu} className="text-xs theme-text-muted opacity-70 hover:opacity-100 transition-opacity">&larr; Back to Campaigns</button>
          </div>
        </div>
        {showLog && <CampaignLogModal entries={state.decisions} themed onClose={() => setShowLog(false)} />}
      </div>
    );
  }

  // ── Main game view ──
  return (
    <div data-theme={theme} className={`west-app h-screen ${themeConfig.container} flex overflow-hidden theme-body-font ${shakeClass}`}>
      <StreakFlash streak={state.triviaStreak} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 pointer-events-none z-50">
        <FloatingNumbers floats={floats} />
      </div>

      {/* Map sidebar */}
      <div className="hidden md:flex w-[360px] lg:w-[430px] xl:w-[520px] 2xl:w-[580px] flex-shrink-0">
        {Array.isArray(data.trailPath) && data.trailPath.length > 0 && (
          <TrailMap progress={progress} day={state.day} totalDays={data.totalDays} trailPath={data.trailPath} trailStops={data.trailStops ?? []} mapImage={data.mapImage} totalDistance={data.totalDistance} />
        )}
      </div>

      {/* Trail feed sidebar */}
      <aside className={`hidden xl:flex w-72 2xl:w-80 flex-shrink-0 border-l ${themeConfig.sidebar} flex-col`}>
        <div className={`px-3 py-2 border-b ${themeConfig.sidebar}`}>
          <p className={`text-xs font-bold uppercase tracking-wide ${themeConfig.accent}`}>Expedition Log</p>
          <p className={`text-[11px] ${themeConfig.subtext}`}>Recent notes from the journey.</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {[...state.trailFeed].slice(-12).reverse().map((entry, idx) => (
            <div key={`${idx}-${entry.slice(0, 18)}`} className={`rounded border p-2 ${idx === 0 ? themeConfig.feedItemActive : themeConfig.feedItem}`}>
              <p className={`text-[11px] leading-relaxed ${themeConfig.subtext}`}>{entry}</p>
            </div>
          ))}
        </div>
      </aside>

      {/* Main game column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 xl:px-4 2xl:px-8">
        <div className={`flex-shrink-0 ${themeConfig.hud}`}>
          <div className="max-w-xl xl:max-w-2xl mx-auto flex flex-col">
            <GenericParallax progress={progress} pace={state.pace} title={data.title} />
            {/* Context/Flavor Card at the top */}
            <div className={`${themeConfig.container} opacity-80 border-b ${themeConfig.sidebar} p-3 shadow-inner`}>
              <p className={`${themeConfig.subtext} text-sm italic leading-relaxed font-serif`}>
                "{getProgressPhrase(data, progress / 100)} {getRegionFlavor(data, progress)}"
              </p>
            </div>
          </div>
        </div>

        {/* HUD - Collapsible Stats */}
        <div className={`flex-shrink-0 ${themeConfig.hud} border-b p-3 py-1.5`}>
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-4">
                <div className={`flex items-center gap-1.5 ${themeConfig.feedItemActive} border rounded px-2 py-0.5`}>
                  <ResourceIcon label="insight" className={`w-3 h-3 ${themeConfig.accent}`} />
                  <span className={`${themeConfig.accent} font-bold text-xs`}>{state.insight}</span>
                </div>
                <div className="flex items-center gap-2">
                  <ResourceIcon label="knowledge" className={`w-3 h-3 ${themeConfig.subtext}`} />
                  <div className="w-24 theme-bg-track rounded-full h-1.5">
                    <div className="bg-amber-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(state.historicalKnowledge / 30 * 100, 100)}%` }} />
                  </div>
                  <span className={`${themeConfig.subtext} text-[10px]`}>{state.historicalKnowledge}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`${themeConfig.subtext} text-[10px] flex items-center gap-1`}>
                  <Map className="w-3 h-3" />
                  <span>Day {state.day} &middot; {Math.round(state.distance)} {data.distanceUnit}</span>
                </div>
                <button
                  onClick={() => setState(s => ({ ...s, inventoryOpen: !s.inventoryOpen }))}
                  className="flex items-center gap-1 px-2 py-0.5 theme-bg-card-inner theme-border border rounded text-[10px] font-bold theme-text transition-colors hover:opacity-90"
                >
                  <Backpack className="w-3 h-3" />
                  Inventory
                  {state.inventoryOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => setShowLog(true)}
                  className="flex items-center gap-1 px-2 py-0.5 theme-bg-card-inner theme-border border rounded text-[10px] font-bold theme-text-accent transition-colors hover:opacity-90"
                >
                  Campaign Log
                </button>
              </div>
            </div>

            {state.inventoryOpen && (
              <div className="grid grid-cols-6 gap-2 mb-2 animate-in fade-in slide-in-from-top-1 duration-200">
                {topResources.map(k => (
                  <div key={k} className={`${themeConfig.innerCard} border rounded p-1.5 flex flex-col items-center`}>
                    <ResourceIcon label={data.resourceLabels[k] ?? k} className={`w-3.5 h-3.5 ${themeConfig.subtext} mb-0.5`} />
                    <span className="text-[10px] font-bold">{Math.round(r[k] ?? 0)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1">
              {barResources.map(k => (
                <ResourceBar
                  key={k}
                  label={data.resourceLabels[k] ?? k}
                  icon={<ResourceIcon label={data.resourceLabels[k] ?? k} className="w-3 h-3" />}
                  value={Math.round(r[k] ?? 0)}
                  color={(r[k] ?? 0) / (data.resourceCaps[k] ?? 100) < 0.25 ? "bg-red-500" : "bg-emerald-500"}
                  pulseState={pulses[k] || ""}
                />
              ))}
            </div>
            {state.objectiveNotice && <p className="text-xs text-emerald-300 mt-0.5">{state.objectiveNotice}</p>}
          </div>
        </div>

        <DoomHUD members={partyMembers} theme={theme} campaignId={data.id} />

        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="max-w-4xl mx-auto space-y-3 mt-2">

            {state.phase === "sailing" && (
              <div className="space-y-3">
                {/* Route */}
                <div className={`border ${themeConfig.routeCard} rounded p-2`}>
                  <p className={`text-xs ${themeConfig.routeText} font-bold flex items-center gap-1.5`}>
                    <Map className="w-3 h-3" />
                    Route: {currentRouteNode.title} ({state.routeTag})
                  </p>
                  <p className={`text-xs ${themeConfig.subtext} mt-1`}>{currentRouteNode.description}</p>
                  {atRouteFork && (
                    <div className="mt-2 grid grid-cols-1 gap-1">
                      <p className={`text-[11px] font-bold ${themeConfig.routeText}`}>Choose your path — the expedition moves out once you decide:</p>
                      {currentRouteNode.edges.map(edge => (
                        <button key={edge.to} onClick={() => { chooseRoute(edge.to, edge.tag); advanceTurn(); }} className={`text-left text-xs px-2 py-1 rounded ${themeConfig.routeButton} transition-colors`}>
                          {edge.label} <span className={themeConfig.subtext}>[{edge.tag}]</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!awaitingDecision && (
                    <p className={`text-xs mt-2 font-bold trail-traveling ${themeConfig.routeText}`}>The expedition presses onward…</p>
                  )}
                </div>

                {/* Objectives */}
                {state.objectives.length > 0 && (
                  <div className="space-y-2">
                    {state.objectives.map(obj => (
                      <div key={obj.id} className={`border ${themeConfig.questCard} rounded p-2`}>
                        <p className={`text-xs font-bold ${themeConfig.questText}`}>Quest: {obj.title}</p>
                        <p className={`text-xs ${themeConfig.subtext}`}>{obj.description}</p>
                        <p className={`text-[11px] ${themeConfig.subtext} opacity-80`}>Progress: {obj.progress}/{obj.target} &middot; {obj.expiresInTurns} turns left</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Trading post at supply towns */}
                {atTownStop && supplyTown.town && (
                  <TradePost
                    townName={supplyTown.town}
                    resources={r}
                    labels={data.resourceLabels ?? {}}
                    showKeys={tradeShowKeys}
                    moneyKey={tradeMoneyKey}
                    offers={computeGenericTradeOffers(r, data.resourceCaps, data.primaryResourceKey, data.resourceLabels)}
                    themed
                    onTrade={(o) => handleTrade(o, supplyTown.town!)}
                    onLeave={() => { setLeftTownId(supplyTown.town); advanceTurn(); }}
                  />
                )}
              </div>
            )}

            {state.phase === "sage" && state.currentSage && (
              <SageEncounter sage={state.currentSage} onComplete={handleSageComplete} />
            )}

            {state.phase === "event" && state.currentEvent && (
              state.currentEvent.type === "push_luck" ? (
                <PushYourLuckEngine event={state.currentEvent} onUpdate={handlePushUpdate} onLeave={handlePushLeave} backdropImage={data.backdropImage} />
              ) : (
                <VisualNovelEngine
                  currentEvent={state.currentEvent}
                  handleChoice={handleChoice}
                  bossHealth={r.morale ?? 50}
                  scoutHealth={r.morale ?? 50}
                  insight={state.insight}
                  onSpendInsightForHints={spendInsightForHints}
                  showRiskHints={state.riskHintsOn}
                  riskHints={riskHints}
                  backdropImage={data.backdropImage}
                  showCharacterOverlay={false}
                />
              )
            )}

            {state.phase === "event_trivia" && state.pendingEventQuestion && (
              <div className={`border ${themeConfig.routeCard} rounded p-3 space-y-2`}>
                <p className={`text-sm ${themeConfig.routeText} font-bold`}>Quick Knowledge Check</p>
                <p className={`text-sm ${themeConfig.subtext}`}>{state.pendingEventQuestion.question}</p>
                <div className="space-y-1">
                  {state.pendingEventQuestion.choices.map((c, i) => (
                    <button key={i} onClick={() => handleEventTriviaAnswer(i)} className={`w-full text-left text-xs ${themeConfig.routeButton} rounded px-2 py-1 transition-colors`}>
                      {c}
                    </button>
                  ))}
                </div>
                <p className={`text-[11px] ${themeConfig.routeText} opacity-80`}>Correct answer: +1 Insight. Wrong answer: no penalty.</p>
              </div>
            )}

            {state.phase === "trivia" && state.currentTrivia && (
              <GenericTriviaEngine
                question={state.currentTrivia}
                progress={progress}
                streak={state.triviaStreak}
                onComplete={handleTriviaComplete}
                primaryResourceKey={data.primaryResourceKey}
                theme={theme}
              />
            )}

            {state.phase === "result" && (
              <div className="space-y-3">
                <div className={`border ${themeConfig.card} rounded p-3`}>
                  <p className={`${themeConfig.subtext} text-sm leading-relaxed`}>{state.resultText}</p>
                </div>
                <button onClick={continueGame} className={`w-full py-2 ${themeConfig.button} rounded text-sm font-bold transition-colors`}>Continue Expedition</button>
              </div>
            )}

          </div>
        </div>
      </div>
      {showLog && <CampaignLogModal entries={state.decisions} themed onClose={() => setShowLog(false)} />}
    </div>
  );
}
