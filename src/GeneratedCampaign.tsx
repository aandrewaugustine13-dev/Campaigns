import { useState, useCallback, useMemo, useEffect } from "react";
import { 
  Backpack, Droplets, Utensils, Users, Crosshair, 
  Shield, Coins, Heart, Smile, Zap, BookOpen, Map,
  ChevronRight, ChevronDown, Package
} from "lucide-react";
import { truncateCredit } from "./lib/attribution";
import { selectEvent, weightedPick, flushPendingPin, MAX_EVENT_REPEATS } from "./eventSelection";

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
import type { CampaignData, FlagText, FlagValue, FlagWrites } from "../generator/schema";
import { resolveFlagText } from "../generator/schema";
import { applyFlagWrites } from "./flagWrites";
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

// Character mode. Only the generator's character path compiles a fault line
// into flags[]; the systems path (journey OR project, e.g. Erie) never emits
// flags. So flags-present is the reliable character signal — deliberately NOT
// progressionMode, which a systems project campaign also carries.
function isCharacterMode(data: CampaignData): boolean {
  return (data.flags?.length ?? 0) > 0;
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

// ═════════════════════════════════════════════════════════════════
// "TIME PASSES" BEATS — character mode only.
// A character/project turn with no event, sage, or trivia is pure dead air
// (every systems idle-turn affordance — pace, towns, objectives — is gated
// off), so advanceTurn collapses a run of them into one or two of these
// cards. Line 1 is the computed real duration (the calendar fidelity — 381
// days of Montgomery stays 381 days, as displayed time); line 2 is generic
// endurance flavor that varies by campaign position. Engine-synthesized and
// topic-neutral by design; generator-authored beats are a separate task.
// ═════════════════════════════════════════════════════════════════

// A dead stretch longer than this many turns gets a second beat (one pause
// mid-stretch, one at its end); shorter stretches get exactly one. At a
// typical daysPerTurn this keeps a single card from silently swallowing more
// than ~6-7 weeks of story time.
const MAX_SKIP_CHUNK = 6;

const NUM_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const capFirst = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

// Humanized duration of the skipped span — literal scale, never canned.
function skipDurationLine(days: number): string {
  const d = Math.max(1, Math.round(days));
  if (d === 1) return "A day passes.";
  if (d <= 10) return `${capFirst(NUM_WORDS[d])} days pass.`;
  if (d <= 24) return `${capFirst(NUM_WORDS[Math.max(2, Math.round(d / 7))])} weeks pass.`;
  if (d <= 45) return "A month passes.";
  if (d <= 75) return "Two months pass.";
  const m = Math.round(d / 30);
  const word = NUM_WORDS[Math.min(m, 10)];
  return m * 30 > d ? `Nearly ${word} months pass.` : `${capFirst(word)} months pass.`;
}

// Position-flavored copy: two variants per progress band, chosen by a
// rotating beat counter (deterministic, not random) so two beats in the same
// band still differ. Topic- and duration-neutral — routine, endurance, time.
const SKIP_FLAVOR_BANDS: { max: number; variants: [string, string] }[] = [
  {
    max: 0.25,
    variants: [
      "What was unthinkable a short while ago is becoming routine. You learn the new shape of your days.",
      "The first urgency has passed. Now comes the part nobody warned you about: keeping on.",
    ],
  },
  {
    max: 0.55,
    variants: [
      "The days blur into one another. Holding steady is its own kind of work — daily, unglamorous, real.",
      "Nothing dramatic happens, and that is its own test. Endurance never announces itself.",
    ],
  },
  {
    max: 0.85,
    variants: [
      "You no longer count the days one by one. The work has become part of who you are.",
      "Weariness and resolve have settled into the same bones. People hold each other up without being asked.",
    ],
  },
  {
    max: Infinity,
    variants: [
      "Something is different lately — you hear it in how people talk. Whatever is coming, it is close.",
      "The waiting has changed its character. Less like patience. More like held breath.",
    ],
  },
];

function skipFlavorLine(progressFrac: number, beatIndex: number): string {
  const band = SKIP_FLAVOR_BANDS.find(b => progressFrac < b.max) ?? SKIP_FLAVOR_BANDS[SKIP_FLAVOR_BANDS.length - 1];
  return band.variants[beatIndex % 2];
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
  // Distance/mileage is journey machinery; character and project modes advance
  // by time, not distance, so this "N units covered at pace" line would render
  // degenerate ("0  covered at  pace") there — journey only.
  if (!isCharacterMode(data) && !isProjectMode(data)) {
    notes.push(`Day ${day}: ${Math.round(distanceGain)} ${data.distanceUnit} covered at ${paceId} pace.`);
  }

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

// Era masthead. Previously a hardcoded teal hue-shift gradient that ignored
// the theme entirely — the single most visible untheme'd surface. Now it is
// the campaign's nameplate: the era's textured ground (--parallax-fallback)
// with the title set LARGE in the era's display face. Progress still reads
// as a thin advancing rule along the bottom edge.
function GenericParallax({ progress, title }: { progress: number; pace: string; title: string }) {
  return (
    <div className="w-full h-28 relative overflow-hidden theme-parallax border-b-2 theme-border">
      <div className="absolute inset-0 flex items-center justify-center px-4">
        <span className="theme-display-font theme-text-accent font-bold text-2xl md:text-3xl text-center leading-tight [text-shadow:0_1px_2px_rgba(0,0,0,0.15)]">
          {title}
        </span>
      </div>
      <div className="absolute bottom-0 left-0 h-1 theme-btn-action" style={{ width: `${Math.max(0, Math.min(100, progress))}%`, transition: "width 0.4s ease" }} />
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
      <p className="text-xs theme-text-accent theme-display-font font-bold uppercase tracking-wide">
        Knowledge Check {streak > 0 && <span className="theme-success">(streak: {streak})</span>}
      </p>
      <p className="text-base theme-text leading-relaxed">{question.question}</p>
      {answered === null ? (
        <div className="space-y-1">
          {question.choices.map((c, i) => (
            <button
              key={i}
              onClick={() => setAnswered(i)}
              className="w-full text-left text-sm leading-snug theme-bg-card theme-border border rounded px-3 py-2 transition-colors hover:opacity-90"
            >
              {c}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <p className={`text-sm font-bold ${correct ? "theme-success" : "theme-danger"}`}>
            {correct ? "Correct!" : "Not quite."}
          </p>
          {(explanation || question.fact) && (
            <p className="text-sm theme-text-muted leading-relaxed">{explanation || question.fact}</p>
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
    "civil-rights-midcentury",
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
interface Choice { text: string; effects?: Resources; flagWrites?: FlagWrites; result?: string; outcomes?: Outcome[]; earlyEnd?: boolean; moralTag?: "principled" | "self-serving" | "obvious" }

// Per-choice moral signal -> a delta on the SEPARATE GameState.moralTally
// accumulator (never a flag, so isCharacterMode is untouched). Stage 1: the
// tally accumulates but nothing reads it yet.
const MORAL_DELTA: Record<NonNullable<Choice["moralTag"]>, number> = {
  principled: 1,
  "self-serving": -1,
  obvious: 0,
};

// Resolve the moral counts into which authored verdict passage to show. The
// rule (engaged-vs-coasted, "good" is deliberately hard): a coaster can never
// land "good" by netting to zero, and a conflicted-but-engaged player is judged
// (good/bad), not dumped into indifferent for a low net.
//   loaded  = principled + selfServing + obvious (morally-loaded choices faced)
//   engaged = principled + selfServing
//   loaded < 3       -> indifferent (thin/degenerate run, graceful default)
//   obvious >= engaged -> indifferent (coasted at least half — never engaged)
//   principled/engaged >= 0.6 -> good (a real principled majority)
//   else             -> bad (engaged but leaned self-serving)
function selectVerdict(principled: number, selfServing: number, obvious: number): "good" | "bad" | "indifferent" {
  const engaged = principled + selfServing;
  const loaded = engaged + obvious;
  if (loaded < 3) return "indifferent";
  if (obvious >= engaged) return "indifferent";
  if (principled / engaged >= 0.6) return "good";
  return "bad";
}
interface GameEvent {
  id: string; phase_min: number; phase_max: number; weight: number;
  title: string; text: FlagText;
  // Narrative-spine fields (optional & additive). A pinned beat is guaranteed
  // to fire in pinSeq order via the pin lane in eventSelection.ts; significance
  // is author/harness metadata (not rendered in v1).
  pinned?: boolean; pinSeq?: number; significance?: string;
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
  flags: Record<string, FlagValue>;
  phase: "intro" | "outfit" | "sailing" | "event" | "result" | "end" | "trivia" | "event_trivia" | "sage" | "timeskip";
  pace: string; distance: number; currentEvent: GameEvent | null;
  resultText: string; decisions: Decision[];
  // Hidden moral accumulators for the generated-campaign verdict — a SEPARATE
  // axis from `flags`, so carrying moral weight never trips isCharacterMode.
  // moralTally is the net (+1/-1/0); the three counts drive verdict selection
  // (engaged-vs-coasted). Read only at the close by selectVerdict.
  moralTally: number;
  moralPrincipled: number;
  moralSelfServing: number;
  moralObvious: number;
  gameOver: boolean; survived: boolean; earlySale: boolean;
  outfit: GenericOutfit;
  historicalKnowledge: number;
  knowledgeLog: string[];
  triviaCounter: number;
  currentTrivia: { id: string; question: string; choices: string[]; correctIndex: number; fact?: string } | null;
  // Single shared "seen" set across BOTH eventTrivia consumers — the
  // knowledge-check path (phase "trivia") and the event-trivia gate
  // (phase "event_trivia"). Both draw from data.eventTrivia, so one set
  // is the source of truth that prevents a question retired in one path
  // from reappearing in the other. lastQuestionId is the immediate-repeat
  // guard, updated by whichever path asked last.
  usedQuestionIds: Set<string>;
  lastQuestionId: string | null;
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
  // Backstop for character endgame rhythm: true when the last fired event was a
  // single-choice "reader" (a no-choice "Go on." reflection beat). selectEvent
  // uses it to avoid firing two readers in a row (see the avoidReader path).
  lastEventWasReader: boolean;
  // ── "Time passes" beats (character mode only — see advanceTurn) ──
  // skipBeat is the card shown in the "timeskip" phase. skipNextPhase stashes
  // the interactive phase a stretch-end beat is holding back (null for a
  // mid-stretch beat, whose Continue resumes the auto-advance instead).
  // skipPaused marks a stretch that already showed its mid-stretch beat, so a
  // stretch can never show more than two. skipBeatIndex rotates the flavor
  // variants so consecutive beats never read identically.
  skipBeat: { duration: string; flavor: string } | null;
  skipNextPhase: GameState["phase"] | null;
  skipPaused: boolean;
  skipBeatIndex: number;
}

// ═════════════════════════════════════════════════════════════════
// ENGINE HELPERS
// ═════════════════════════════════════════════════════════════════

// weightedPick, selectEvent, and the cooldown/repeat constants now live in
// ./eventSelection (extracted so the pin guarantee is unit-testable without
// React). Imported at the top of this file; behavior for pin-free campaigns is
// byte-identical to the previous in-component versions.

// Choose an event-trivia gate question, preferring unseen ones and recycling
// the bank when exhausted, so the gate stays varied across a long run.
function selectGateQuestion(
  pool: CampaignData["eventTrivia"],
  usedIds: Set<string>,
  excludeId: string | null,
) {
  if (!pool || pool.length === 0) return null;
  let available = pool.filter(q => !usedIds.has(q.id) && q.id !== excludeId);
  if (available.length === 0) available = pool.filter(q => q.id !== excludeId);
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

// ═════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════

export default function GeneratedCampaign({ onBack, data: dataProp }: { onBack: () => void; data?: CampaignData }) {
  const data = dataProp ?? (defaultCampaignJson as unknown as CampaignData);

  const ALLOWED_THEMES = new Set([
    "frontier-leather", "broadsheet-sepia", "parchment-medieval",
    "expedition-journal", "declassified-typewriter", "classical-marble",
    "civil-rights-midcentury",
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
    flags: Object.fromEntries((data.flags ?? []).map(f => [f.id, f.initial])),
    phase: "intro", pace: data.paces[1]?.id ?? data.paces[0]?.id ?? "",
    distance: 0, currentEvent: null, resultText: "", decisions: [],
    moralTally: 0, moralPrincipled: 0, moralSelfServing: 0, moralObvious: 0,
    gameOver: false, survived: false, earlySale: false,
    outfit: { allocations: {}, budgetSpent: 0 },
    historicalKnowledge: 0, knowledgeLog: [], triviaCounter: 0,
    currentTrivia: null, usedQuestionIds: new Set(), triviaStreak: 0,
    lastQuestionId: null,
    eventCounts: {}, eventLastTurn: {},
    insight: 1, objectives: [],
    routeState: { currentNodeId: "start" }, routeTag: "SAFE",
    riskHintsOn: false, pendingChoiceIndex: null, pendingEventQuestion: null,
    objectiveNotice: "", sageIndex: 0, currentSage: null, sagesMet: [],
    trailFeed: [data.trailFeedOpener], hardPaceStreak: 0,
    inventoryOpen: false,
    lastEventWasReader: false,
    skipBeat: null, skipNextPhase: null, skipPaused: false, skipBeatIndex: 0,
  }), [data]);

  const [state, setState] = useState<GameState>(makeInit);
  // Final-exam (generated path): ONE attempt -> always reach results + summary,
  // then ONE capped retake. examTaken gates results (replaces the old "must
  // pass" wall); examPct is the effective score % (the retake caps at 80 and
  // keeps the better, so it can never lower the score); retakeUsed enforces the
  // one-shot; retaking re-shows the exam for that single retake.
  const [examTaken, setExamTaken] = useState(false);
  const [examCorrect, setExamCorrect] = useState(0);
  const [examTotal, setExamTotal] = useState(0);
  const [examPct, setExamPct] = useState(0);
  const [retakeUsed, setRetakeUsed] = useState(false);
  const [retaking, setRetaking] = useState(false);
  // Verdict gate: the moral verdict is shown BEFORE the exam; acknowledging it
  // falls through to the quiz. Reset wherever the exam state resets.
  const [verdictAck, setVerdictAck] = useState(false);

  // One handler for both the first attempt and the single retake. First attempt:
  // record the raw score. Retake: cap at 80, keep the better — adopt the retake
  // only if its CAPPED score beats the current one (so a worse retake keeps the
  // original), and burn the one-shot.
  const handleExamScored = (correct: number, total: number) => {
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    if (retaking) {
      const capped = Math.min(pct, 80);
      if (capped > examPct) { setExamPct(capped); setExamCorrect(correct); setExamTotal(total); }
      setRetakeUsed(true);
      setRetaking(false);
    } else {
      setExamTaken(true);
      setExamPct(pct);
      setExamCorrect(correct);
      setExamTotal(total);
    }
  };
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

  // Only journey campaigns outfit (provisioning a trek is journey furniture);
  // character and project campaigns open straight into the story: resources
  // stay at initialResources (makeInit defaults outfit to zero spend) and
  // trailFeed is already seeded by makeInit.
  const start = useCallback(() => {
    const firstPhase = !isCharacterMode(data) && !isProjectMode(data) ? "outfit" : "sailing";
    setState({ ...makeInit(), phase: firstPhase });
    setExamTaken(false); setExamCorrect(0); setExamTotal(0); setExamPct(0);
    setRetakeUsed(false); setRetaking(false); setVerdictAck(false); setLeftTownId(null);
  }, [makeInit, data]);
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

  // ── One-turn world simulation ──
  // The pre-existing advanceTurn step, extracted so character mode can run
  // several turns per click: day tick, pace/route fx, drains, fail/goal
  // checks, objectives, sage, trivia, event selection. Phase left at
  // "sailing" means a DEAD turn — nothing interactive fired.
  const simulateTurn = useCallback(
    (prev: GameState): GameState => {
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

      // Fail conditions: check key resources. SYSTEMS-only — a character's
      // small personal economy (cash, the larder) is friction, never a death
      // bar; a first-person story ends by time/arc, not by a meter hitting 0.
      if (!isCharacterMode(data)) {
        const criticallyLow = Object.entries(s.resources).filter(([k, v]) => {
          if (k === data.primaryResourceKey) return false;
          const cap = data.resourceCaps[k] ?? 100;
          return v <= 0 && cap > 10;
        });
        if (criticallyLow.length >= 2 || (s.resources.morale !== undefined && s.resources.morale <= 0)) {
          return { ...s, phase: "end" as const, gameOver: true, survived: false };
        }
      }
      if (hasReachedGoal(data, s.day, s.distance)) {
        // END-OF-RUN FLUSH: the run may not end while any pinned (narrative-
        // spine) beat is still unfired. Drain them one per turn, in pinSeq
        // order, as real events before the close — so a checked beat ALWAYS
        // appears, even on a run too short for its window to come up normally.
        // No-op when the campaign has no pins (flushPendingPin returns null),
        // so the goal transition is byte-identical for pin-free campaigns.
        const flush = flushPendingPin(data.events as GameEvent[], s.eventCounts);
        if (flush) {
          s.eventCounts = { ...s.eventCounts, [flush.id]: (s.eventCounts[flush.id] ?? 0) + 1 };
          s.eventLastTurn = { ...s.eventLastTurn, [flush.id]: s.turn };
          s.currentEvent = { ...flush, triviaGate: false };
          s.phase = "event";
          s.lastEventWasReader = (flush.choices?.length ?? 0) === 1;
          s.riskHintsOn = false;
          s.pendingChoiceIndex = null;
          s.pendingEventQuestion = null;
          return s;
        }
        return { ...s, phase: "end" as const, gameOver: true, survived: true };
      }

      // Objectives — "quests" are journey framing (timed sub-goals incl. a
      // distance quest that can never complete without travel, with hardcoded
      // supplies/crew resource keys). They don't belong in a first-person moral
      // story OR a time-based project, so the whole spawn/tick/reward block is
      // journey-only. Gated at the logic (not just render) so invisible
      // objectives can't tick, grant Insight, or push objectiveNotice.
      if (!isCharacterMode(data) && !isProjectMode(data)) {
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

      // Backstop bookkeeping: assume this turn is a NON-reader beat (travel,
      // dilemma, or trivia); the reader case overrides below when one fires.
      // Cleared here (read prev.lastEventWasReader for the avoid decision) so a
      // deferred reader fires next turn — defer-don't-drop.
      s.lastEventWasReader = false;

      // Event
      const event = selectEvent(s.day, data.totalDays, data.events as GameEvent[], s.routeTag, s.eventCounts, s.eventLastTurn, s.turn, isCharacterMode(data) ? 1 : MAX_EVENT_REPEATS, isCharacterMode(data) && prev.lastEventWasReader);
      if (event) {
        if (s.triviaCounter >= 2) {
          const trivia = pickTriviaQuestion(data, s.usedQuestionIds, s.lastQuestionId);
          if (trivia) {
            s.currentTrivia = trivia;
            const nextUsed = new Set(s.usedQuestionIds).add(trivia.id);
            // Recycle once every question has been seen across BOTH paths so
            // checks keep coming; keep the just-shown id so it isn't immediate.
            s.usedQuestionIds = nextUsed.size >= data.eventTrivia.length ? new Set([trivia.id]) : nextUsed;
            s.lastQuestionId = trivia.id;
            s.triviaCounter = 0;
            s.phase = "trivia";
            return s;
          }
        }
        s.eventCounts = { ...s.eventCounts, [event.id]: (s.eventCounts[event.id] ?? 0) + 1 };
        s.eventLastTurn = { ...s.eventLastTurn, [event.id]: s.turn };
        s.currentEvent = { ...event, triviaGate: shouldGateTrivia(event.id, s.turn) };
        // Mark a single-choice "Go on." reader so the next turn avoids stacking
        // a second one (the no-consecutive-reader backstop).
        s.lastEventWasReader = (event.choices?.length ?? 0) === 1;
        s.phase = "event";
        s.riskHintsOn = false;
        s.pendingChoiceIndex = null;
        s.pendingEventQuestion = null;
        s.triviaCounter++;
      }
      return s;
    },
    [data],
  );

  // Build the "time passes" card state for a dead stretch. daysSkipped is the
  // real calendar time since the player's last interaction; the flavor line
  // rotates by skipBeatIndex so consecutive beats never read identically. A
  // null nextPhase marks a mid-stretch beat (Continue resumes the skip); a
  // stashed phase marks a stretch-end beat (Continue reveals it).
  const makeSkipBeat = useCallback((s: GameState, daysSkipped: number, nextPhase: GameState["phase"] | null): GameState => ({
    ...s,
    phase: "timeskip",
    skipBeat: {
      duration: skipDurationLine(daysSkipped),
      flavor: skipFlavorLine(deriveProgress(data, s.day, s.distance) / 100, s.skipBeatIndex),
    },
    skipBeatIndex: s.skipBeatIndex + 1,
    skipNextPhase: nextPhase,
    skipPaused: nextPhase === null,
  }), [data]);

  // ── Core turn advance ──
  // Systems campaigns (journey or project): one simulated turn per click,
  // exactly the old behavior — their idle turns are real decisions (pace,
  // towns, objectives), never dead. Character mode: a no-event turn is pure
  // dead air, so a run of them (a DEAD STRETCH) is collapsed into one "time
  // passes" beat — two when the stretch runs past MAX_SKIP_CHUNK turns. The
  // simulation still runs every skipped turn, so the day counter keeps full
  // calendar fidelity as displayed time.
  const advanceTurn = useCallback(() => {
    setState(prev => {
      if (!isCharacterMode(data)) return simulateTurn(prev);

      let s = simulateTurn(prev);
      let skipped = 0;
      while (s.phase === "sailing" && !s.gameOver && skipped < 500) {
        skipped += 1;
        // Long stretch: pause once mid-stretch (beat 1 of 2). skipPaused
        // marks the pause so the resume can't pause again — the stretch's
        // second beat lands at its end instead.
        if (!prev.skipPaused && skipped >= MAX_SKIP_CHUNK) {
          return makeSkipBeat(s, s.day - prev.day, null);
        }
        s = simulateTurn(s);
      }
      const cleared = { skipBeat: null, skipNextPhase: null, skipPaused: false };
      // The stretch ran into the goal: the end screen (verdict/reckoning)
      // closes it — no beat stacked in front of the campaign's own ending.
      if (s.phase === "end") return { ...s, ...cleared };
      // No dead turns: the next beat fired directly — old behavior, no card.
      if (skipped === 0) return { ...s, ...cleared };
      // Stretch over: show its beat; Continue reveals the stashed phase.
      return makeSkipBeat(s, s.day - prev.day, s.phase);
    });
  }, [data, simulateTurn, makeSkipBeat]);

  // Continue from a "time passes" card. A stretch-end beat stashed the phase
  // it interrupted (event/sage/trivia) — restore it. A mid-stretch beat has
  // no stash: resume collapsing the rest of the stretch.
  const continueTimeskip = useCallback(() => {
    const next = state.skipNextPhase;
    if (next) {
      setState(prev => ({ ...prev, phase: next, skipBeat: null, skipNextPhase: null, skipPaused: false }));
    } else {
      advanceTurn();
    }
  }, [state.skipNextPhase, advanceTurn]);

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
          // Log the text the player actually saw — resolved with flags as
          // they were BEFORE this choice's write (writes applied below).
          text: resolveFlagText(ev.text, s.flags),
          detail: [outcome.result, fact].filter(Boolean).join("\n\n") || undefined,
        });
      }
      if (outcome.effects) {
        for (const [k, v] of Object.entries(outcome.effects)) {
          if (s.resources[k] !== undefined) s.resources[k] = clampR(data, k, s.resources[k] + v);
        }
      }
      // Flag writes: a separate system from numeric effects. Applied after
      // them, from the Choice itself (not the random outcome). No flagWrites
      // ⇒ flag map untouched, so non-flag campaigns are unaffected.
      if (choice.flagWrites) s.flags = applyFlagWrites(data, s.flags, choice.flagWrites);
      // Moral tally + counts: a SEPARATE accumulator from flags/resources. A
      // tagged choice nudges the net tally and bumps its category count (the
      // counts drive verdict selection); untagged choices leave them unchanged.
      if (choice.moralTag) {
        s.moralTally += MORAL_DELTA[choice.moralTag];
        if (choice.moralTag === "principled") s.moralPrincipled += 1;
        else if (choice.moralTag === "self-serving") s.moralSelfServing += 1;
        else s.moralObvious += 1;
      }
      if (insightBonus > 0) s.insight += insightBonus;
      if (choice.earlyEnd || outcome.earlyEnd) s.earlySale = true;
      s.resultText = insightBonus > 0
        ? `${outcome.result || ""}\n\nYou answered the trivia correctly and gained +${insightBonus} Insight.`
        : outcome.result || "";
      s.pendingChoiceIndex = null;
      s.pendingEventQuestion = null;
      // A choice with no result text (e.g. a reader's lone "Go on.") skips the
      // blank result card and returns to flow directly, mirroring continueGame's
      // character-mode transition (no resource-death there; the run ends by
      // time/arc or earlyEnd). Character-gated so systems campaigns render
      // byte-identically to before.
      if (isCharacterMode(data) && s.resultText.trim() === "") {
        s.currentEvent = null;
        if (hasReachedGoal(data, s.day, s.distance) || s.earlySale) {
          return { ...s, phase: "end" as const, gameOver: true, survived: true };
        }
        s.phase = "sailing";
        return s;
      }
      s.phase = "result";
      return s;
    });
  }, [data]);

  const handleChoice = useCallback((ci: number) => {
    if (state.currentEvent?.triviaGate && data.eventTrivia.length > 0) {
      const q = selectGateQuestion(data.eventTrivia, state.usedQuestionIds, state.lastQuestionId);
      if (q) {
        setState(prev => {
          const nextUsed = new Set(prev.usedQuestionIds).add(q.id);
          return {
            ...prev,
            phase: "event_trivia" as const,
            pendingChoiceIndex: ci,
            pendingEventQuestion: q,
            // Same shared set + immediate-repeat guard as the knowledge-check path.
            usedQuestionIds: nextUsed.size >= data.eventTrivia.length ? new Set([q.id]) : nextUsed,
            lastQuestionId: q.id,
          };
        });
        return;
      }
    }
    finalizeChoice(ci, 0);
  }, [finalizeChoice, state.currentEvent?.triviaGate, state.usedQuestionIds, state.lastQuestionId, data.eventTrivia]);

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
      s.decisions.push({ event: s.currentEvent!.title, choice: `Pushed luck ${log.length - 1} times.`, day: s.day, text: resolveFlagText(s.currentEvent!.text, prev.flags) });
      s.currentEvent = null;
      s.phase = "sailing";
      return s;
    });
  }, []);

  const continueGame = useCallback(() => {
    setState(prev => {
      const s: GameState = { ...prev, currentEvent: null, resultText: "", objectiveNotice: "" };
      // Check fail — systems-only (see advanceTurn: character mode has no
      // resource-death; the run ends by reaching the time/arc goal).
      if (!isCharacterMode(data)) {
        const criticallyLow = Object.entries(s.resources).filter(([k, v]) => {
          if (k === data.primaryResourceKey) return false;
          return v <= 0 && (data.resourceCaps[k] ?? 100) > 10;
        });
        if (criticallyLow.length >= 2 || (s.resources.morale !== undefined && s.resources.morale <= 0)) {
          return { ...s, phase: "end" as const, gameOver: true, survived: false };
        }
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

  // Read site: resolve flag-keyed event text for render. Plain-string text
  // (every non-flag campaign) passes through resolveFlagText unchanged, so
  // the rendered event is byte-identical to before.
  const renderedEvent = state.currentEvent
    ? { ...state.currentEvent, text: resolveFlagText(state.currentEvent.text, state.flags) }
    : null;

  // ── Decision-driven progression ──────────────────────────────
  // No manual "advance" button. The expedition moves forward on its own
  // until it reaches a real route fork to decide; events/sages/trivia
  // (set by advanceTurn) pause it by leaving the "sailing" phase.
  const supplyTown = nearestSupplyTown(data.trailStops, progress);
  // Route forks are journey furniture, engine-enforced here (not just by the
  // model emitting a single-node route): a stray multi-edge route in a
  // character/project blob must not pause the run at a "choose your path" fork.
  const atRouteFork = !isCharacterMode(data) && !isProjectMode(data) && currentRouteNode.edges.length >= 2;
  // Gate at the computation, not the render: a true atTownStop both shows the
  // shop AND pauses auto-advance, so hiding only the render would freeze a
  // character run at a stray supply town. Character mode never reaches the
  // truthy state → no shop, no pause. Systems (journey or project) unchanged.
  const atTownStop = !isCharacterMode(data) && !isProjectMode(data) && supplyTown.near && supplyTown.town !== leftTownId;
  const awaitingDecision = atRouteFork || atTownStop;

  // Travel is fully click-gated: every pure-travel ("sailing") interlude waits
  // for the player to press Continue (see the button below). There is no
  // auto-advance timer — players wanted full manual control of travel pacing.
  // awaitingDecision (route forks / town stops) still renders its own UI and is
  // not shown the Continue button, so those screens aren't double-gated.

  // Character mode runs a SMALL personal economy (money + 1–2 concrete
  // resources). Those should be VISIBLE as always-on bars, not parked in the
  // collapsed inventory — so character mode puts every resource in the bar
  // row and leaves the inventory grid empty. Systems keeps the original
  // first-6-in-inventory / 7th+-as-bars split (byte-identical behavior).
  const topResources = useMemo(() => {
    // Character AND project: no collapsed inventory (the button is journey-only
    // below), so every resource must live in the always-visible bar row.
    if (isCharacterMode(data) || isProjectMode(data)) return [];
    return Object.keys(data.initialResources).slice(0, 6);
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
    return isCharacterMode(data) || isProjectMode(data) ? keys : keys.slice(6);
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
            <img
              src={data.backdropImage.thumbUrl}
              alt=""
              className="w-full rounded border theme-border object-cover"
              style={{ aspectRatio: "16 / 9" }}
            />
            <p className="theme-text-muted leading-tight text-left" style={{ fontSize: "11px" }}>
              {truncateCredit(data.backdropImage.artist)} · {data.backdropImage.license} ·{" "}
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
        {/* The premise paragraph is body reading, not a caption — full ink. */}
        <p className="theme-text text-sm">{data.introBody}</p>
        <button onClick={start} className={`px-8 py-3 ${themeConfig.button} rounded font-bold transition-colors`}>{!isCharacterMode(data) && !isProjectMode(data) ? "BEGIN OUTFIT" : "BEGIN"}</button>
        <button onClick={backToMenu} className={`block w-full ${themeConfig.subtext} opacity-90 hover:opacity-100 text-xs mt-2`}>&larr; Back to Campaigns</button>
      </div>
    </div>
  );

  if (state.phase === "outfit") return <GenericOutfitScreen data={data} onDone={onOutfitDone} />;

  if (state.phase === "end") {
    // ── Moral verdict: the campaign's closing judgment, BEFORE the quiz ──
    // One of the three authored passages, selected by the hidden moral counts
    // (engaged-vs-coasted). Shows ONLY the prose — no score, no tally, no
    // breakdown. Gated on data.verdict so older campaigns without one skip
    // straight to the quiz (byte-identical). Acknowledging falls through to the
    // exam gate below (mirrors the examTaken gate).
    if (data.verdict && !verdictAck) {
      const passage = data.verdict[selectVerdict(state.moralPrincipled, state.moralSelfServing, state.moralObvious)];
      return (
        <div data-theme={theme} className="h-screen theme-bg-page theme-text theme-body-font flex items-center justify-center p-6 overflow-y-auto">
          <div className="max-w-xl w-full space-y-8 py-8 text-center">
            <p className="theme-text text-lg leading-relaxed font-serif whitespace-pre-line">{passage}</p>
            <button
              onClick={() => setVerdictAck(true)}
              className="px-8 py-3 theme-btn-action font-bold rounded transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      );
    }

    // ── The knowledge check: ONE attempt (first take, or the single retake) ──
    // oneShot — always reports the score and flows to results+summary; the parent
    // owns the capped retake. (!examTaken) is the first take; (retaking) re-shows
    // it for the one allowed retake.
    if ((!examTaken || retaking) && examQuestions.length > 0) {
      return (
        <div data-theme={theme} className="h-screen theme-bg-page theme-text p-4 overflow-y-auto theme-body-font flex items-center">
          <div className="max-w-lg mx-auto w-full space-y-4">
            <h1 className="text-2xl font-bold text-center theme-text-accent theme-display-font">Check for Understanding</h1>
            <FinalExam
              themed
              oneShot
              questions={examQuestions}
              decisionLog={state.decisions}
              subtitle={retaking
                ? "Your retake. Study the review summary, then answer again — this attempt caps at 80."
                : "Answer the check for understanding. The review summary afterward recaps what you played."}
              onScored={handleExamScored}
            />
            <button onClick={backToMenu} className="block w-full theme-text-muted text-xs">← Back to Campaigns</button>
          </div>
        </div>
      );
    }

    const primaryKey = data.primaryResourceKey;
    const primaryVal = r[primaryKey] ?? 0;
    const primaryStart = data.primaryResourceStart;
    const revenue = state.survived ? primaryVal * data.revenuePerUnit : 0;
    const cost = state.outfit.budgetSpent;
    const profit = revenue - cost;
    // Retake offered only when a capped-at-80 retake could actually improve the
    // score (examPct <= 80) and the one shot hasn't been used. 90-100 and 81-89
    // never see it.
    const retakeEligible = examTaken && examPct <= 80 && !retakeUsed;

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

          {/* Knowledge check: a modest score line (not a grade — the letter
              grade stays retired), plus the review summary (closure + study aid,
              shown to everyone) and, only when a capped retake could help, the
              one-shot "Retake (max 80)" action. The summary is rendered only if
              the campaign authored one — older campaigns are byte-identical. */}
          {examTaken && (
            <p className="text-center theme-text-muted text-xs">
              Check for Understanding: <span className="theme-text font-bold">{examCorrect}/{examTotal}</span>
              {retakeUsed && " · retake counted (capped at 80%)"}
            </p>
          )}

          {data.reviewSummary && (
            <div className="theme-bg-card theme-border border rounded p-4 space-y-2">
              <h2 className="theme-text-accent theme-display-font font-bold uppercase tracking-wide text-xs text-center">Review Summary</h2>
              <p className="theme-text text-sm leading-relaxed whitespace-pre-line">{data.reviewSummary}</p>
            </div>
          )}

          {retakeEligible && (
            <button
              onClick={() => setRetaking(true)}
              className="w-full py-2.5 theme-btn-action rounded text-sm font-bold transition-colors"
            >
              Retake the Exam (max score: 80)
            </button>
          )}

          {data.revenuePerUnit > 0 && (
            <div className="theme-bg-card theme-border border rounded p-3 space-y-1 text-xs">
              <h2 className="theme-text-accent theme-display-font font-bold uppercase tracking-wide text-center mb-1">Ledger</h2>
              <div className="flex justify-between theme-text-muted"><span>Outfit Cost</span><span className="theme-danger">-${cost.toLocaleString()}</span></div>
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
                  <span className="theme-success">+${revenue.toLocaleString()}</span>
                </div>
              )}
              <div className="border-t theme-divider mt-1 pt-1 flex justify-between font-bold">
                <span className="theme-text">Net</span>
                <span className={profit >= 0 ? "theme-success" : "theme-danger"}>{profit >= 0 ? "+" : ""}${profit.toLocaleString()}</span>
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
              <div className="theme-bar-fill h-2 rounded-full transition-all" style={{ width: `${Math.min(state.historicalKnowledge / 30 * 100, 100)}%` }} />
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
            <button onClick={() => { setState(makeInit()); setExamTaken(false); setExamCorrect(0); setExamTotal(0); setExamPct(0); setRetakeUsed(false); setRetaking(false); setVerdictAck(false); setLeftTownId(null); }} className="px-5 py-2 theme-btn-action font-bold rounded transition-colors">Run It Again</button>
            <br /><button onClick={backToMenu} className="text-xs theme-text-muted opacity-90 hover:opacity-100 transition-opacity">&larr; Back to Campaigns</button>
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

      {/* Map sidebar — journey-only furniture. Engine-gated on BOTH character
          and project mode so neither shows (or reserves width for) a trail
          map, even if the generator leaked a stray trailPath. Also only
          rendered when there's an actual map, so map-less journey campaigns
          don't reserve an empty 360-580px gutter that shoves content right. */}
      {!isCharacterMode(data) && !isProjectMode(data) && Array.isArray(data.trailPath) && data.trailPath.length > 0 && (
        <div className="hidden md:flex w-[360px] lg:w-[430px] xl:w-[520px] 2xl:w-[580px] flex-shrink-0">
          <TrailMap progress={progress} day={state.day} totalDays={data.totalDays} trailPath={data.trailPath} trailStops={data.trailStops ?? []} mapImage={data.mapImage} totalDistance={data.totalDistance} />
        </div>
      )}

      {/* Trail feed sidebar — journey-only "expedition log". Neither a
          character story nor a time-based project is a journey with a mileage
          log (the decisions log remains reachable via the Campaign Log
          button). */}
      {!isCharacterMode(data) && !isProjectMode(data) && (
        <aside className={`hidden xl:flex w-72 2xl:w-80 flex-shrink-0 border-l ${themeConfig.sidebar} flex-col`}>
          <div className={`px-3 py-2 border-b ${themeConfig.sidebar}`}>
            <p className={`text-xs font-bold uppercase tracking-wide theme-display-font ${themeConfig.accent}`}>Expedition Log</p>
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
      )}

      {/* Main game column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 xl:px-4 2xl:px-8">
        <div className={`flex-shrink-0 ${themeConfig.hud}`}>
          <div className="max-w-xl xl:max-w-2xl mx-auto flex flex-col">
            <GenericParallax progress={progress} pace={state.pace} title={data.title} />
            {/* Context/Flavor Card at the top */}
            {/* No opacity on this wrapper: it dims the TEXT below AA, not
                just the ground. Muted ink at full strength is the quiet look. */}
            <div className={`${themeConfig.container} border-b ${themeConfig.sidebar} p-3 shadow-inner`}>
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
                    <div className="theme-bar-fill h-1.5 rounded-full transition-all" style={{ width: `${Math.min(state.historicalKnowledge / 30 * 100, 100)}%` }} />
                  </div>
                  <span className={`${themeConfig.subtext} text-[10px]`}>{state.historicalKnowledge}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`${themeConfig.subtext} text-[10px] flex items-center gap-1`}>
                  <Map className="w-3 h-3" />
                  {/* Distance is journey-only; character and project modes
                      advance by time, so show just the day counter (no
                      meaningless "· 0 unit"). */}
                  {isCharacterMode(data) || isProjectMode(data) ? (
                    <span>Day {state.day}</span>
                  ) : (
                    <span>Day {state.day} &middot; {Math.round(state.distance)} {data.distanceUnit}</span>
                  )}
                </div>
                {!isCharacterMode(data) && !isProjectMode(data) && (
                  <button
                    onClick={() => setState(s => ({ ...s, inventoryOpen: !s.inventoryOpen }))}
                    className="flex items-center gap-1 px-2 py-0.5 theme-bg-card-inner theme-border border rounded text-[10px] font-bold theme-text transition-colors hover:opacity-90"
                  >
                    <Backpack className="w-3 h-3" />
                    Inventory
                    {state.inventoryOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                )}
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
            {state.objectiveNotice && <p className="text-xs theme-success mt-0.5">{state.objectiveNotice}</p>}
          </div>
        </div>

        {/* Party Status HUD — journey-only. A first-person character isn't a
            party with hit points, and a time-based project isn't a traveling
            party either. Nothing else consumes partyMembers. */}
        {!isCharacterMode(data) && !isProjectMode(data) && <DoomHUD members={partyMembers} theme={theme} campaignId={data.id} />}

        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="max-w-4xl mx-auto space-y-3 mt-2">

            {state.phase === "sailing" && (
              <div className="space-y-3">
                {/* Route */}
                <div className={`border ${themeConfig.routeCard} rounded p-2`}>
                  {/* Route header — journey furniture. Character/project runs
                      idle in this same card (it owns the Continue button) but a
                      single-node story is not "Route: X (SAFE)". */}
                  {!isCharacterMode(data) && !isProjectMode(data) && (
                    <>
                      <p className={`text-xs ${themeConfig.routeText} font-bold flex items-center gap-1.5`}>
                        <Map className="w-3 h-3" />
                        Route: {currentRouteNode.title} ({state.routeTag})
                      </p>
                      <p className={`text-xs ${themeConfig.subtext} mt-1`}>{currentRouteNode.description}</p>
                    </>
                  )}
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
                    <button
                      onClick={() => advanceTurn()}
                      className={`w-full mt-2 py-2 ${themeConfig.button} rounded text-sm font-bold transition-colors`}
                    >
                      Continue Expedition
                    </button>
                  )}
                </div>

                {/* Objectives — journey-only "quests"; gated off in character and project modes (they never spawn there, this is belt-and-suspenders matching the spawn gate in advanceTurn). */}
                {!isCharacterMode(data) && !isProjectMode(data) && state.objectives.length > 0 && (
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

            {state.phase === "timeskip" && state.skipBeat && (
              <div className="space-y-3">
                <div className={`border ${themeConfig.card} rounded p-6 text-center space-y-4`}>
                  <p className="theme-text text-lg theme-display-font">{state.skipBeat.duration}</p>
                  <p className={`${themeConfig.subtext} text-sm italic leading-relaxed font-serif max-w-md mx-auto`}>
                    {state.skipBeat.flavor}
                  </p>
                </div>
                <button
                  onClick={continueTimeskip}
                  className={`w-full py-2 ${themeConfig.button} rounded text-sm font-bold transition-colors`}
                >
                  Continue
                </button>
              </div>
            )}

            {state.phase === "sage" && state.currentSage && (
              <SageEncounter sage={state.currentSage} onComplete={handleSageComplete} />
            )}

            {state.phase === "event" && renderedEvent && (
              renderedEvent.type === "push_luck" ? (
                <PushYourLuckEngine event={renderedEvent} onUpdate={handlePushUpdate} onLeave={handlePushLeave} backdropImage={data.backdropImage} />
              ) : (
                <VisualNovelEngine
                  currentEvent={renderedEvent}
                  handleChoice={handleChoice}
                  bossHealth={r.morale ?? 50}
                  scoutHealth={r.morale ?? 50}
                  insight={state.insight}
                  onSpendInsightForHints={
                    // Hide the "Ask a Sage (Spend 1 Insight)" risk-hints button on
                    // character READER beats (single-choice "Go on." reflections):
                    // a sage advises on a CHOICE, and a reader has none — spending
                    // Insight for per-choice hints on a non-decision is meaningless.
                    // Character-gated so systems is a strict no-op (isCharacterMode
                    // false → always spendInsightForHints, byte-identical); Chisholm
                    // uses a separate call site in App.tsx and is untouched.
                    isCharacterMode(data) && (renderedEvent.choices?.length ?? 0) < 2
                      ? undefined
                      : spendInsightForHints
                  }
                  showRiskHints={state.riskHintsOn}
                  riskHints={riskHints}
                  backdropImage={data.backdropImage}
                  showCharacterOverlay={false}
                />
              )
            )}

            {state.phase === "event_trivia" && state.pendingEventQuestion && (
              <div className={`border ${themeConfig.routeCard} rounded p-3 space-y-2`}>
                <p className={`text-sm ${themeConfig.routeText} font-bold theme-display-font`}>Quick Knowledge Check</p>
                <p className="text-sm theme-text">{state.pendingEventQuestion.question}</p>
                <div className="space-y-1">
                  {state.pendingEventQuestion.choices.map((c, i) => (
                    <button key={i} onClick={() => handleEventTriviaAnswer(i)} className={`w-full text-left text-xs ${themeConfig.routeButton} rounded px-2 py-1 transition-colors`}>
                      {c}
                    </button>
                  ))}
                </div>
                <p className={`text-[11px] ${themeConfig.routeText}`}>Correct answer: +1 Insight. Wrong answer: no penalty.</p>
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
                  {/* Event outcome prose — body reading, full ink. */}
                  <p className="theme-text text-sm leading-relaxed">{state.resultText}</p>
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
