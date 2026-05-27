import { useState, useCallback, useMemo } from "react";
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

function pickTriviaQuestion(
  data: CampaignData,
  _progress: number,
  usedIds: Set<string>,
) {
  const available = data.eventTrivia.filter(q => !usedIds.has(q.id));
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
}: {
  question: { id: string; question: string; choices: string[]; correctIndex: number; fact?: string; explanation?: string };
  progress: number;
  streak: number;
  onComplete: (correct: boolean, effects: Record<string, number>) => void;
  primaryResourceKey: string;
}) {
  const [answered, setAnswered] = useState<number | null>(null);
  const correct = answered === question.correctIndex;
  const explanation = (question as Record<string, unknown>).explanation as string | undefined;

  return (
    <div className="border border-amber-700 rounded p-4 bg-amber-950/30 space-y-3">
      <p className="text-xs text-amber-300 font-bold uppercase tracking-wide">
        Knowledge Check {streak > 0 && <span className="text-emerald-400">(streak: {streak})</span>}
      </p>
      <p className="text-sm text-stone-200">{question.question}</p>
      {answered === null ? (
        <div className="space-y-1">
          {question.choices.map((c, i) => (
            <button
              key={i}
              onClick={() => setAnswered(i)}
              className="w-full text-left text-xs bg-amber-900/60 hover:bg-amber-800 rounded px-3 py-2 transition-colors"
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
            <p className="text-xs text-stone-400">{explanation || question.fact}</p>
          )}
          <button
            onClick={() => onComplete(correct, correct ? { [primaryResourceKey]: 5, morale: 3 } : {})}
            className="w-full py-2 bg-amber-800 hover:bg-amber-700 rounded text-xs font-bold transition-colors"
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
  const costKeys = Object.keys(data.outfitConfig.costs);
  const [allocs, setAllocs] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const k of costKeys) init[k] = 1;
    return init;
  });

  const spent = costKeys.reduce((sum, k) => sum + allocs[k] * data.outfitConfig.costs[k], 0);
  const remaining = data.outfitConfig.budget - spent;

  return (
    <div className="h-screen bg-stone-900 text-stone-100 flex flex-col overflow-hidden" style={{ fontFamily: "'Georgia', serif" }}>
      <GenericParallax progress={0} pace="rest" title={data.title} />
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <div className="max-w-lg mx-auto space-y-3">
          <div className="text-center">
            <h1 className="text-xl font-bold text-amber-400">{data.title} — OUTFIT</h1>
            <p className="text-stone-400 text-xs mt-0.5">
              Prepare your expedition. Budget:{" "}
              <span className={remaining >= 0 ? "text-emerald-400" : "text-red-500"}>
                ${remaining.toLocaleString()}
              </span>{" "}
              of ${data.outfitConfig.budget.toLocaleString()}
            </p>
          </div>

          {costKeys.map(k => (
            <div key={k} className="bg-stone-800 border border-stone-700 rounded p-2.5">
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="text-stone-300 font-bold">{k.replace(/_/g, " ")}</span>
                <span className="font-mono text-amber-400">
                  {allocs[k]} <span className="text-stone-500">(${data.outfitConfig.costs[k]}/ea)</span>
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                value={allocs[k]}
                onChange={e => setAllocs(prev => ({ ...prev, [k]: +e.target.value }))}
                className="w-full accent-amber-500 h-2"
              />
            </div>
          ))}

          <button
            onClick={() => remaining >= 0 && onDone({ allocations: allocs, budgetSpent: spent })}
            disabled={remaining < 0}
            className="w-full py-3 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 rounded font-bold transition-colors"
          >
            {remaining < 0 ? "OVER BUDGET" : "BEGIN EXPEDITION"}
          </button>
        </div>
      </div>
    </div>
  );
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
}
interface Decision { event: string; choice: string; day: number }

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

function pickEvent(day: number, td: number, used: Set<string>, evts: GameEvent[]): GameEvent | null {
  const p = day / td;
  const el = evts.filter(e => p >= e.phase_min && p <= e.phase_max && !used.has(e.id));
  const pool = el.length > 0 ? el : evts.filter(e => p >= e.phase_min && p <= e.phase_max);
  if (!pool.length) return null;
  return weightedPick(pool);
}

function routeAdjustedEvent(day: number, totalDays: number, used: Set<string>, events: GameEvent[], routeTag: string) {
  const base = pickEvent(day, totalDays, used, events);
  if (!base) return null;
  const phase = day / totalDays;
  const pool = events.filter(e => phase >= e.phase_min && phase <= e.phase_max && !used.has(e.id));
  if (pool.length === 0) return base;
  const withWeights = pool.map(e => {
    let weight = e.weight;
    if (routeTag === "SAFE") weight = Math.max(1, weight - 1);
    if (routeTag === "FAST") weight += 1;
    return { ...e, weight };
  });
  return weightedPick(withWeights);
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

  const makeInit = useCallback((): GameState => ({
    day: 1, turn: 0, resources: { ...data.initialResources },
    phase: "intro", pace: data.paces[1]?.id ?? data.paces[0].id,
    distance: 0, currentEvent: null, resultText: "", decisions: [],
    gameOver: false, survived: false, earlySale: false,
    outfit: { allocations: {}, budgetSpent: 0 },
    historicalKnowledge: 0, knowledgeLog: [], triviaCounter: 0,
    currentTrivia: null, usedTriviaIds: new Set(), triviaStreak: 0,
    insight: 1, objectives: [],
    routeState: { currentNodeId: "start" }, routeTag: "SAFE",
    riskHintsOn: false, pendingChoiceIndex: null, pendingEventQuestion: null,
    objectiveNotice: "", sageIndex: 0, currentSage: null, sagesMet: [],
    trailFeed: [data.trailFeedOpener], hardPaceStreak: 0,
    inventoryOpen: false,
  }), [data]);

  const [state, setState] = useState<GameState>(makeInit);
  const [usedEvents, setUsedEvents] = useState<Set<string>>(new Set());

  const start = useCallback(() => { setState({ ...makeInit(), phase: "outfit" }); setUsedEvents(new Set()); }, [makeInit]);
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
      const pace = data.paces.find(p => p.id === s.pace) ?? data.paces[0];
      s.day = Math.min(s.day + data.daysPerTurn, data.totalDays + 1);

      for (const [k, v] of Object.entries(pace.fx)) {
        s.resources[k] = clampR(data, k, (s.resources[k] || 0) + v);
      }

      if (s.routeTag === "FAST") {
        if (s.resources.health !== undefined) s.resources.health = clampR(data, "health", s.resources.health - 2);
        if (s.resources.morale !== undefined) s.resources.morale = clampR(data, "morale", s.resources.morale - 2);
      }
      if (s.routeTag === "SAFE" && s.resources.morale !== undefined) {
        s.resources.morale = clampR(data, "morale", s.resources.morale + 1);
      }

      const distanceGain = pace.mpd * data.daysPerTurn;
      s.distance = Math.min(s.distance + distanceGain, data.totalDistance);
      s.hardPaceStreak = pace.id === data.paces[data.paces.length - 1]?.id
        ? s.hardPaceStreak + 1 : Math.max(0, s.hardPaceStreak - 1);

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

      const turnFeed = buildTrailFeedEntries(data, s.resources, pace.id, s.hardPaceStreak, distanceGain, s.day);
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
      if (s.distance >= data.totalDistance) {
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
      const currentProgress = (s.distance / data.totalDistance) * 100;
      if (s.sageIndex < data.sages.length) {
        const nextSage = data.sages[s.sageIndex];
        if (currentProgress >= nextSage.threshold) {
          s.currentSage = nextSage;
          s.phase = "sage";
          return s;
        }
      }

      // Event
      const event = routeAdjustedEvent(s.day, data.totalDays, usedEvents, data.events as GameEvent[], s.routeTag);
      if (event) {
        if (s.triviaCounter >= 2) {
          const trivia = pickTriviaQuestion(data, currentProgress, s.usedTriviaIds);
          if (trivia) {
            s.currentTrivia = trivia;
            s.usedTriviaIds = new Set(s.usedTriviaIds).add(trivia.id);
            s.triviaCounter = 0;
            s.phase = "trivia";
            return s;
          }
        }
        setUsedEvents(p => new Set(p).add(event.id));
        s.currentEvent = { ...event, triviaGate: shouldGateTrivia(event.id, s.turn) };
        s.phase = "event";
        s.riskHintsOn = false;
        s.pendingChoiceIndex = null;
        s.pendingEventQuestion = null;
        s.triviaCounter++;
      }
      return s;
    });
  }, [data, usedEvents]);

  // ── Route choice ──
  const chooseRoute = useCallback((toId: string, tag: "SAFE" | "FAST" | "PROFIT") => {
    setState(prev => ({ ...prev, routeState: { currentNodeId: toId }, routeTag: tag }));
  }, []);

  // ── Event choice ──
  const finalizeChoice = useCallback((ci: number, insightBonus: number) => {
    setState(prev => {
      if (!prev.currentEvent?.choices) return prev;
      const s: GameState = { ...prev, resources: { ...prev.resources }, decisions: [...prev.decisions] };
      const choice = s.currentEvent!.choices![ci];
      const outcome = resolveChoice(choice);
      s.decisions.push({ event: s.currentEvent!.title, choice: choice.text, day: s.day });
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
    if (state.currentEvent?.triviaGate) {
      const q = data.eventTrivia[(state.turn + ci) % data.eventTrivia.length];
      setState(prev => ({ ...prev, phase: "event_trivia" as const, pendingChoiceIndex: ci, pendingEventQuestion: q }));
      return;
    }
    finalizeChoice(ci, 0);
  }, [finalizeChoice, state.currentEvent?.triviaGate, state.turn, data.eventTrivia]);

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
      s.decisions.push({ event: s.currentEvent!.title, choice: `Pushed luck ${log.length - 1} times.`, day: s.day });
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
      if (s.distance >= data.totalDistance || s.earlySale) {
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
      s.decisions.push({ event: `Sage: ${sage.name}`, choice: correct ? "Answered correctly" : `Learned from ${sage.name}`, day: s.day });
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
      if (correct) {
        s.triviaStreak++;
        for (const [k, v] of Object.entries(effects)) {
          if (k === "historicalKnowledge") { s.historicalKnowledge += v; s.knowledgeLog.push(`Knowledge: +${v}`); }
          else if (s.resources[k] !== undefined) s.resources[k] = clampR(data, k, s.resources[k] + v);
        }
        s.decisions.push({ event: "Knowledge Check", choice: `Correct (streak: ${s.triviaStreak})`, day: s.day });
      } else {
        s.triviaStreak = 0;
        s.decisions.push({ event: "Knowledge Check", choice: "Learned", day: s.day });
      }
      s.currentTrivia = null;
      s.phase = s.distance >= data.totalDistance ? "end" as const : "sailing" as const;
      if (s.distance >= data.totalDistance) { s.gameOver = true; s.survived = true; }
      return s;
    });
  }, [data]);

  // ── Derived state ──
  const r = state.resources;
  const progress = state.distance / data.totalDistance * 100;
  const currentRouteNode = findNode(data.route, state.routeState.currentNodeId) || data.route[0];
  const partyMembers = getPartyMembers(data, r);

  const topResources = useMemo(() => {
    const keys = Object.keys(data.initialResources);
    return keys.slice(0, 6);
  }, [data]);

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
    <div className="h-screen bg-stone-900 text-stone-100 flex flex-col items-center justify-center" style={{ fontFamily: "'Georgia', serif" }}>
      <div className="max-w-md text-center space-y-4 p-4">
        <h1 className="text-3xl font-bold text-amber-400">{data.title}</h1>
        <p className="text-stone-300">{data.subtitle}</p>
        <p className="text-stone-400 text-sm">{data.introBody}</p>
        <button onClick={start} className="px-8 py-3 bg-amber-700 hover:bg-amber-600 rounded font-bold transition-colors">BEGIN OUTFIT</button>
        <button onClick={backToMenu} className="block w-full text-stone-500 hover:text-stone-300 text-xs mt-2">&larr; Back to Campaigns</button>
      </div>
    </div>
  );

  if (state.phase === "outfit") return <GenericOutfitScreen data={data} onDone={onOutfitDone} />;

  if (state.phase === "end") {
    const primaryKey = data.primaryResourceKey;
    const primaryVal = r[primaryKey] ?? 0;
    const primaryStart = data.primaryResourceStart;
    const primaryPct = primaryStart > 0 ? primaryVal / primaryStart : (primaryVal > 0 ? 1 : 0);
    const revenue = state.survived ? primaryVal * data.revenuePerUnit : 0;
    const cost = state.outfit.budgetSpent;
    const profit = revenue - cost;
    const grade = getGrade(state.survived, primaryPct, state.historicalKnowledge);

    const isDefense = data.distanceUnit.toLowerCase().includes("level") ||
      data.distanceUnit.toLowerCase().includes("wall") ||
      data.distanceUnit.toLowerCase().includes("defen") ||
      data.distanceUnit.toLowerCase().includes("fort") ||
      data.title.toLowerCase().includes("siege") ||
      data.title.toLowerCase().includes("defense");

    return (
      <div className="h-screen bg-stone-900 text-stone-100 p-4 overflow-y-auto" style={{ fontFamily: "'Georgia', serif" }}>
        <div className="max-w-lg mx-auto space-y-4">
          <h1 className={`text-2xl font-bold text-center ${state.survived ? "text-amber-400" : "text-red-500"}`}>
            {state.survived ? (isDefense ? "SIEGE CONCLUDED" : "EXPEDITION COMPLETE") : "EXPEDITION FAILED"}
          </h1>
          <p className="text-center text-stone-300 text-sm">
            {state.survived
              ? isDefense
                ? `${data.title} — the garrison held out for ${state.day} days.`
                : `${data.title} — the expedition reached its destination on day ${state.day}.`
              : `Your expedition failed on day ${state.day}. The wilderness keeps what it takes.`}
          </p>

          {data.revenuePerUnit > 0 && (
            <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1 text-xs">
              <h2 className="text-amber-300 font-bold uppercase tracking-wide text-center mb-1">Ledger</h2>
              <div className="flex justify-between text-stone-400"><span>Outfit Cost</span><span className="text-red-400">-${cost.toLocaleString()}</span></div>
              <div className="flex justify-between text-stone-400">
                <span className="capitalize">{data.resourceLabels[primaryKey] ?? primaryKey} (Start)</span>
                <span className="text-stone-200">{primaryStart}</span>
              </div>
              <div className="flex justify-between text-stone-400">
                <span className="capitalize">{data.resourceLabels[primaryKey] ?? primaryKey} (End)</span>
                <span className="text-stone-200">{primaryVal}</span>
              </div>
              {state.survived && (
                <div className="flex justify-between text-stone-400">
                  <span>Value (${data.revenuePerUnit}/unit)</span>
                  <span className="text-emerald-400">+${revenue.toLocaleString()}</span>
                </div>
              )}
              <div className="border-t border-stone-600 mt-1 pt-1 flex justify-between font-bold">
                <span className="text-stone-200">Net</span>
                <span className={profit >= 0 ? "text-emerald-400" : "text-red-500"}>{profit >= 0 ? "+" : ""}${profit.toLocaleString()}</span>
              </div>
            </div>
          )}

          <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1 text-xs">
            <h2 className="text-amber-300 font-bold uppercase tracking-wide text-center mb-1">Historical Knowledge</h2>
            <div className="flex justify-between font-bold">
              <span className="text-stone-200">Wisdom Earned</span>
              <span className="text-amber-400">{state.historicalKnowledge} points</span>
            </div>
            <div className="w-full bg-stone-700 rounded-full h-2 mt-1">
              <div className="bg-amber-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(state.historicalKnowledge / 30 * 100, 100)}%` }} />
            </div>
            {state.knowledgeLog.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {state.knowledgeLog.map((log, i) => (
                  <p key={i} className="text-stone-500 text-xs">{log}</p>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1">
              <h2 className="text-amber-300 font-bold text-xs uppercase tracking-wide text-center">Expedition Stats</h2>
              {([
                ["Days", `${state.day}`],
                [
                  isDefense ? "Defenses" : "Distance",
                  `${Math.round(state.distance)} ${data.distanceUnit}`
                ],
                ...Object.entries(r).slice(0, 4).map(([k, v]) => [data.resourceLabels[k] ?? k, `${Math.round(v)}`]),
              ] as [string, string][]).filter(([l]) => !(isDefense && l === "Distance")).map(([l, v]) => (
                <div key={l} className="flex justify-between text-stone-400 text-xs">
                  <span className="capitalize">{l}</span>
                  <span className="text-stone-200">{v}</span>
                </div>
              ))}
            </div>
            <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1">
              <h2 className="text-blue-300 font-bold text-xs uppercase tracking-wide text-center">Achievements</h2>
              <ul className="text-stone-500 text-[10px] leading-relaxed list-disc list-inside">
                {getAchievements(state, data).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="text-center">
            <span className="text-stone-500 text-xs">EXPEDITION RATING: </span>
            <span className={`text-4xl font-bold ${GC[grade]}`}>{grade}</span>
          </div>

          <div className="bg-stone-800 border border-stone-700 rounded p-3">
            <p className="text-xs text-stone-500 leading-relaxed">{data.historicalContext}</p>
          </div>

          {state.decisions.length > 0 && (
            <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wide">Decision Log</h3>
              {state.decisions.map((d, i) => (
                <p key={i} className="text-xs text-stone-500">
                  <span className="text-stone-600">Day {d.day}:</span>{" "}
                  <span className="text-stone-400">{d.event}</span> — {d.choice}
                </p>
              ))}
            </div>
          )}

          <div className="text-center pb-4 space-y-2">
            <button onClick={() => { setState(makeInit()); setUsedEvents(new Set()); }} className="px-5 py-2 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded transition-colors">Run It Again</button>
            <br /><button onClick={backToMenu} className="text-xs text-stone-500 hover:text-stone-300 transition-colors">&larr; Back to Campaigns</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main game view ──
  return (
    <div className={`west-app h-screen bg-stone-900 text-stone-100 flex overflow-hidden ${shakeClass}`} style={{ fontFamily: "'Georgia', serif" }}>
      <StreakFlash streak={state.triviaStreak} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 pointer-events-none z-50">
        <FloatingNumbers floats={floats} />
      </div>

      {/* Map sidebar */}
      <div className="hidden md:flex w-[360px] lg:w-[430px] xl:w-[520px] 2xl:w-[580px] flex-shrink-0">
        <TrailMap progress={progress} day={state.day} totalDays={data.totalDays} trailPath={data.trailPath} trailStops={data.trailStops} mapImage={data.mapImage} totalDistance={data.totalDistance} />
      </div>

      {/* Trail feed sidebar */}
      <aside className="hidden xl:flex w-72 2xl:w-80 flex-shrink-0 border-l border-stone-700 bg-stone-900/80 flex-col">
        <div className="px-3 py-2 border-b border-stone-700">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-300">Expedition Log</p>
          <p className="text-[11px] text-stone-400">Recent notes from the journey.</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {[...state.trailFeed].slice(-12).reverse().map((entry, idx) => (
            <div key={`${idx}-${entry.slice(0, 18)}`} className={`rounded border p-2 ${idx === 0 ? "border-amber-700 bg-amber-950/20" : "border-stone-700 bg-stone-800/60"}`}>
              <p className="text-[11px] leading-relaxed text-stone-300">{entry}</p>
            </div>
          ))}
        </div>
      </aside>

      {/* Main game column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 xl:px-4 2xl:px-8">
        <div className="flex-shrink-0 bg-stone-800">
          <div className="max-w-xl xl:max-w-2xl mx-auto flex flex-col">
            <GenericParallax progress={progress} pace={state.pace} title={data.title} />
            {/* Context/Flavor Card at the top */}
            <div className="bg-stone-900/60 border-b border-stone-700 p-3 shadow-inner">
              <p className="text-stone-300 text-sm italic leading-relaxed font-serif">
                "{getProgressPhrase(data, progress / 100)} {getRegionFlavor(data, progress)}"
              </p>
            </div>
          </div>
        </div>

        {/* HUD - Collapsible Stats */}
        <div className="flex-shrink-0 bg-stone-800 border-b border-stone-700 px-3 py-1.5">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 bg-amber-950/30 border border-amber-900/50 rounded px-2 py-0.5">
                  <ResourceIcon label="insight" className="w-3 h-3 text-amber-400" />
                  <span className="text-amber-400 font-bold text-xs">{state.insight}</span>
                </div>
                <div className="flex items-center gap-2">
                  <ResourceIcon label="knowledge" className="w-3 h-3 text-stone-400" />
                  <div className="w-24 bg-stone-700 rounded-full h-1.5">
                    <div className="bg-amber-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(state.historicalKnowledge / 30 * 100, 100)}%` }} />
                  </div>
                  <span className="text-stone-500 text-[10px]">{state.historicalKnowledge}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-stone-500 text-[10px] flex items-center gap-1">
                  <Map className="w-3 h-3" />
                  <span>Day {state.day} &middot; {Math.round(state.distance)} {data.distanceUnit}</span>
                </div>
                <button 
                  onClick={() => setState(s => ({ ...s, inventoryOpen: !s.inventoryOpen }))}
                  className="flex items-center gap-1 px-2 py-0.5 bg-stone-700 hover:bg-stone-600 rounded text-[10px] font-bold text-stone-300 transition-colors"
                >
                  <Backpack className="w-3 h-3" />
                  Inventory
                  {state.inventoryOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {state.inventoryOpen && (
              <div className="grid grid-cols-6 gap-2 mb-2 animate-in fade-in slide-in-from-top-1 duration-200">
                {topResources.map(k => (
                  <div key={k} className="bg-stone-900/40 border border-stone-700 rounded p-1.5 flex flex-col items-center">
                    <ResourceIcon label={data.resourceLabels[k] ?? k} className="w-3.5 h-3.5 text-stone-400 mb-0.5" />
                    <span className="text-[10px] font-bold text-stone-200">{Math.round(r[k] ?? 0)}</span>
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

        <DoomHUD members={partyMembers} />

        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="max-w-4xl mx-auto space-y-3 mt-2">

            {state.phase === "sailing" && (
              <div className="space-y-3">
                {/* Route */}
                <div className="border border-indigo-700 rounded p-2 bg-indigo-950/40">
                  <p className="text-xs text-indigo-300 font-bold flex items-center gap-1.5">
                    <Map className="w-3 h-3" />
                    Route: {currentRouteNode.title} ({state.routeTag})
                  </p>
                  <p className="text-xs text-stone-300 mt-1">{currentRouteNode.description}</p>
                  {currentRouteNode.edges.length > 0 && (
                    <div className="mt-2 grid grid-cols-1 gap-1">
                      {currentRouteNode.edges.map(edge => (
                        <button key={edge.to} onClick={() => chooseRoute(edge.to, edge.tag)} className="text-left text-xs px-2 py-1 rounded bg-indigo-900 hover:bg-indigo-800 transition-colors">
                          {edge.label} <span className="text-indigo-300">[{edge.tag}]</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Objectives */}
                {state.objectives.length > 0 && (
                  <div className="space-y-2">
                    {state.objectives.map(obj => (
                      <div key={obj.id} className="border border-emerald-800 rounded p-2 bg-emerald-950/30">
                        <p className="text-xs font-bold text-emerald-300">Quest: {obj.title}</p>
                        <p className="text-xs text-stone-300">{obj.description}</p>
                        <p className="text-[11px] text-stone-400">Progress: {obj.progress}/{obj.target} &middot; {obj.expiresInTurns} turns left</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pace buttons */}
                <div className="flex gap-2">
                  {data.paces.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setState(prev => ({ ...prev, pace: p.id })); advanceTurn(); }}
                      className={`flex-1 py-2 rounded text-xs font-bold transition-colors ${
                        p.id === data.paces[data.paces.length - 1]?.id ? "bg-red-900 hover:bg-red-800"
                        : p.id === data.paces[0]?.id ? "bg-emerald-900 hover:bg-emerald-800"
                        : "bg-stone-700 hover:bg-stone-600"
                      }`}
                    >
                      {p.label}<br /><span className="font-normal text-stone-400">{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {state.phase === "sage" && state.currentSage && (
              <SageEncounter sage={state.currentSage} onComplete={handleSageComplete} />
            )}

            {state.phase === "event" && state.currentEvent && (
              state.currentEvent.type === "push_luck" ? (
                <PushYourLuckEngine event={state.currentEvent} onUpdate={handlePushUpdate} onLeave={handlePushLeave} />
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
                />
              )
            )}

            {state.phase === "event_trivia" && state.pendingEventQuestion && (
              <div className="border border-indigo-700 rounded p-3 bg-indigo-950/40 space-y-2">
                <p className="text-sm text-indigo-200 font-bold">Quick Knowledge Check</p>
                <p className="text-sm text-stone-200">{state.pendingEventQuestion.question}</p>
                <div className="space-y-1">
                  {state.pendingEventQuestion.choices.map((c, i) => (
                    <button key={i} onClick={() => handleEventTriviaAnswer(i)} className="w-full text-left text-xs bg-indigo-900 hover:bg-indigo-800 rounded px-2 py-1">
                      {c}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-indigo-300">Correct answer: +1 Insight. Wrong answer: no penalty.</p>
              </div>
            )}

            {state.phase === "trivia" && state.currentTrivia && (
              <GenericTriviaEngine
                question={state.currentTrivia}
                progress={progress}
                streak={state.triviaStreak}
                onComplete={handleTriviaComplete}
                primaryResourceKey={data.primaryResourceKey}
              />
            )}

            {state.phase === "result" && (
              <div className="space-y-3">
                <div className="border border-stone-700 rounded p-3 bg-stone-800/80">
                  <p className="text-stone-300 text-sm leading-relaxed">{state.resultText}</p>
                </div>
                <button onClick={continueGame} className="w-full py-2 bg-amber-800 hover:bg-amber-700 rounded text-sm font-bold transition-colors">Continue Expedition</button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
