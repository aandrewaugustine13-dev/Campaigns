import { useState, useCallback, useEffect, useRef } from "react";
import DoomHUD from "./DoomHUD";
import PortraitDebugPanel from "./PortraitDebugPanel";
import VisualNovelEngine from "./VisualNovelEngine";
import PushYourLuckEngine from "./PushYourLuckEngine";
import SilkRoad from "./SilkRoad";
import Crusades from "./Crusades";
import ChisholmTriviaEngine, { pickTriviaQuestion, type TriviaQuestion } from "./campaigns/chisholm/trivia";
import type { Objective, RouteState, EventGateQuestion } from "./gameModels";
import { generateObjective, tickObjectives, findNode } from "./gameLogic";
import { CHISHOLM_ROUTE } from "./campaigns/chisholm/routes";
import { CHISHOLM_EVENT_TRIVIA } from "./campaigns/chisholm/eventTrivia";
import {
  useFloatingNumbers, FloatingNumbers,
  useScreenShake, useStatPulse, useResourceTracker,
  StatBox, ResourceBar, StreakFlash,
} from "./GameJuice";
import TrailMap from "./TrailMap";
import { TRAIL_PATH, STOPS, MAP_IMAGE, TOTAL_DISTANCE, getRegionFlavor, isNearSupplyTown } from "./campaigns/chisholm/trailMap";
import { EVENTS } from "./campaigns/chisholm/events";
import { FACES, gf } from "./campaigns/chisholm/pixelFaces";
import { OUTFIT_BUDGET, BASE_CREW, BASE_HORSES, BASE_SUPPLIES, COST_COWBOY, COST_HORSE, COST_SUPPLY, COST_GUN, COST_SPAREPARTS, COST_MEDICAL_GEAR, COST_HORSE_QUALITY, WAGE_COST, WAGE_MORALE, HERD_OPTIONS } from "./campaigns/chisholm/outfitConfig";
import { TOTAL_DAYS, DAYS_PER_TURN, INIT_R, PACES, RESOURCE_LABELS, clampR, getPhrase, getTrailGrade, buildTrailFeedEntries, getPartyMembers } from "./campaigns/chisholm/config";
import { SAGES } from "./campaigns/chisholm/sages";
import type { SageEncounterData } from "./campaigns/types";
import SageEncounter from "./SageEncounter";
import ChisholmParallaxBackground from "./campaigns/chisholm/parallax";
import { ChisholmCampaign } from "./campaigns/chisholm/index";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface Resources { [key: string]: number; }
interface Outcome { weight: number; effects: Resources; result: string; earlyEnd?: boolean; }
interface Choice { text: string; effects?: Resources; result?: string; outcomes?: Outcome[]; earlyEnd?: boolean; }
interface PushAttempt { id: string; buttonText: string; successText: string; failureText: string; riskChance: number; rewards: Resources; penalties: Resources; }
interface SageAdvice { name: string; role: string; line: string; }
interface GameEvent { 
  id: string; phase_min: number; phase_max: number; weight: number; title: string; text: string; 
  type?: "standard" | "push_luck"; 
  choices?: Choice[];              
  attempts?: PushAttempt[];        
  leaveText?: string;              
  trivia?: string[];
  sageAdvice?: SageAdvice[];
  riskProfile?: ("LOW" | "MED" | "HIGH")[];
  triviaGate?: boolean;
}
interface Decision { event: string; choice: string; day: number; }
interface OutfitConfig {
  herd: number;
  crew: number;
  horses: number;
  supplies: number;
  guns: number;
  spareParts: number;
  medicalGear: number;
  horseQuality: number;
  wages: "low" | "standard" | "good";
  budgetSpent: number;
  startingCash: number;
}

interface GameState {
  day: number; turn: number; resources: Resources;
  phase: "intro" | "outfit" | "sailing" | "event" | "result" | "end" | "trivia" | "event_trivia" | "sage";
  pace: string; distance: number; currentEvent: GameEvent | null;
  resultText: string; decisions: Decision[];
  gameOver: boolean; survived: boolean; earlySale: boolean;
  outfit: OutfitConfig;
  historicalKnowledge: number;
  knowledgeLog: string[];
  triviaCounter: number;
  currentTrivia: TriviaQuestion | null;
  usedTriviaIds: Set<string>;
  triviaStreak: number;
  insight: number;
  objectives: Objective[];
  routeState: RouteState;
  routeTag: "SAFE" | "FAST" | "PROFIT";
  riskHintsOn: boolean;
  pendingChoiceIndex: number | null;
  pendingEventQuestion: EventGateQuestion | null;
  objectiveNotice: string;
  sageIndex: number;
  currentSage: SageEncounterData | null;
  sagesMet: string[];
  trailFeed: string[];
  hardPaceStreak: number;
}


// ═══════════════════════════════════════════════════════════════
// ANIMATED PRAIRIE SCENE 
// ═══════════════════════════════════════════════════════════════

function PrairieScene({ progress, pace }: { progress: number; pace: string; turn: number }) {
  const mappedPace = pace === "push" ? "push" : pace === "normal" ? "normal" : "rest";
  return <ChisholmParallaxBackground progress={progress} pace={mappedPace} />;
}

// ═══════════════════════════════════════════════════════════════
// OUTFIT SCREEN
// ═══════════════════════════════════════════════════════════════


function getCrewRating(herd: number, crew: number): { label: string; color: string; condition: number } {
  const ratio = herd / crew;
  if (ratio > 300) return { label: "Suicide run", color: "text-red-500", condition: 30 };
  if (ratio > 250) return { label: "Understaffed", color: "text-orange-400", condition: 40 };
  if (ratio > 200) return { label: "Tight", color: "text-yellow-400", condition: 52 };
  if (ratio > 150) return { label: "Solid", color: "text-emerald-400", condition: 62 };
  return { label: "Well-staffed", color: "text-blue-400", condition: 70 };
}

function OutfitScreen({ onDone }: { onDone: (config: OutfitConfig) => void }) {
  const [herdIdx, setHerdIdx] = useState(2); 
  const [extraCrew, setExtraCrew] = useState(4); 
  const [extraHorses, setExtraHorses] = useState(12); 
  const [extraSupplies, setExtraSupplies] = useState(10); 
  const [guns, setGuns] = useState(4);
  const [spareParts, setSpareParts] = useState(3);
  const [medicalGear, setMedicalGear] = useState(2);
  const [horseQuality, setHorseQuality] = useState(2);
  const [wages, setWages] = useState<"low" | "standard" | "good">("standard");

  const herd = HERD_OPTIONS[herdIdx];
  const crew = BASE_CREW + extraCrew;
  const horses = BASE_HORSES + extraHorses;
  const supplies = BASE_SUPPLIES + extraSupplies;
  const spent = extraCrew * COST_COWBOY + extraHorses * COST_HORSE + extraSupplies * COST_SUPPLY + guns * COST_GUN + spareParts * COST_SPAREPARTS + medicalGear * COST_MEDICAL_GEAR + horseQuality * COST_HORSE_QUALITY + WAGE_COST[wages];
  const remaining = OUTFIT_BUDGET - spent;
  const rating = getCrewRating(herd, crew);
  const horsesPerCowboy = (horses / crew).toFixed(1);
  const potentialValue = herd * 40;

  return (
    <div className="west-app h-screen bg-stone-900 text-stone-100 flex flex-col overflow-hidden" style={{ fontFamily: "'Georgia', serif" }}>
      <div className="flex-shrink-0 bg-stone-800">
        <div className="max-w-4xl mx-auto">
          <PrairieScene progress={0} pace="easy" turn={0} />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <div className="max-w-lg mx-auto space-y-3">
          <div className="text-center">
            <h1 className="text-xl font-bold text-amber-400">SAN ANTONIO &mdash; SPRING 1867</h1>
            <p className="text-stone-400 text-xs mt-0.5">Outfit your drive. Budget: <span className={remaining >= 0 ? "text-emerald-400" : "text-red-500"}>${remaining.toLocaleString()}</span> of ${OUTFIT_BUDGET.toLocaleString()}</p>
          </div>

          <div className="bg-stone-800 border border-stone-700 rounded p-2.5">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-stone-300 font-bold">{"\uD83D\uDC02"} Herd Size</span>
              <span className="text-amber-400 font-mono">{herd.toLocaleString()} head</span>
            </div>
            <input type="range" min={0} max={4} value={herdIdx} onChange={e => setHerdIdx(+e.target.value)} className="w-full accent-amber-500 h-2" />
          </div>

          <div className="bg-stone-800 border border-stone-700 rounded p-2.5">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-stone-300 font-bold">{"\uD83E\uDD20"} Cowboys</span>
              <span className="font-mono">{crew} <span className="text-stone-500">({BASE_CREW} + {extraCrew} extra)</span></span>
            </div>
            <input type="range" min={0} max={10} value={extraCrew} onChange={e => setExtraCrew(+e.target.value)} className="w-full accent-amber-500 h-2" />
          </div>

          <div className="bg-stone-800 border border-stone-700 rounded p-2.5">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-stone-300 font-bold">{"\uD83D\uDC0E"} Horses</span>
              <span className="font-mono">{horses} <span className="text-stone-500">({BASE_HORSES} + {extraHorses})</span></span>
            </div>
            <input type="range" min={0} max={30} value={extraHorses} onChange={e => setExtraHorses(+e.target.value)} className="w-full accent-amber-500 h-2" />
          </div>

          <div className="bg-stone-800 border border-stone-700 rounded p-2.5">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-stone-300 font-bold">{"\uD83C\uDF56"} Supplies</span>
              <span className="font-mono">{supplies} <span className="text-stone-500">(+{extraSupplies})</span></span>
            </div>
            <input type="range" min={0} max={30} value={extraSupplies} onChange={e => setExtraSupplies(+e.target.value)} className="w-full accent-amber-500 h-2" />
          </div>

          <div className="bg-stone-800 border border-stone-700 rounded p-2.5">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-stone-300 font-bold">{"\uD83D\uDD2B"} Rifles & Ammo</span>
              <span className="font-mono">{guns}</span>
            </div>
            <input type="range" min={0} max={12} value={guns} onChange={e => setGuns(+e.target.value)} className="w-full accent-amber-500 h-2" />
          </div>

          <div className="bg-stone-800 border border-stone-700 rounded p-2.5">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-stone-300 font-bold">{"\uD83D\uDD27"} Spare Parts</span>
              <span className="font-mono">{spareParts} sets</span>
            </div>
            <input type="range" min={0} max={8} value={spareParts} onChange={e => setSpareParts(+e.target.value)} className="w-full accent-amber-500 h-2" />
          </div>

          <div className="bg-stone-800 border border-stone-700 rounded p-2.5">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-stone-300 font-bold">🩺 Medical Gear</span>
              <span className="font-mono">{medicalGear} kits</span>
            </div>
            <input type="range" min={0} max={6} value={medicalGear} onChange={e => setMedicalGear(+e.target.value)} className="w-full accent-amber-500 h-2" />
          </div>

          <div className="bg-stone-800 border border-stone-700 rounded p-2.5">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-stone-300 font-bold">🐎 Horse Quality</span>
              <span className="font-mono">Tier {horseQuality + 1}</span>
            </div>
            <input type="range" min={0} max={4} value={horseQuality} onChange={e => setHorseQuality(+e.target.value)} className="w-full accent-amber-500 h-2" />
          </div>

          <div className="bg-stone-800 border border-stone-700 rounded p-2.5">
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span className="text-stone-300 font-bold">{"\uD83D\uDD25"} Cowboy Wages</span>
            </div>
            <div className="flex gap-1.5">
              {([{ id: "low" as const, label: "$25/mo" }, { id: "standard" as const, label: "$35/mo" }, { id: "good" as const, label: "$45/mo" }]).map(w => (
                <button key={w.id} onClick={() => setWages(w.id)}
                  className={`flex-1 p-1.5 rounded text-xs border transition-colors ${wages === w.id ? "bg-amber-700 border-amber-600 text-white" : "bg-stone-700 border-stone-600 text-stone-300 hover:bg-stone-600"}`}>
                  <div className="font-bold">{w.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div className={`rounded p-2.5 border text-center ${remaining >= 0 ? "bg-stone-800 border-stone-700" : "bg-red-900/30 border-red-800"}`}>
            <div className="border-t border-stone-600 mt-1 pt-1 flex justify-between font-bold text-stone-200">
              <span>Remaining</span>
              <span className={remaining >= 0 ? "text-emerald-400" : "text-red-500"}>${remaining.toLocaleString()}</span>
            </div>
          </div>

          <button
            onClick={() => onDone({ herd, crew, horses, supplies, guns, spareParts, medicalGear, horseQuality, wages, budgetSpent: spent, startingCash: Math.max(0, remaining) })}
            disabled={remaining < 0}
            className={`w-full py-2.5 font-bold rounded transition-colors ${remaining >= 0 ? "bg-amber-700 hover:bg-amber-600 text-white" : "bg-stone-700 text-stone-500 cursor-not-allowed"}`}
          >
            {remaining < 0 ? "OVER BUDGET" : "HIT THE TRAIL"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ENGINE
// ═══════════════════════════════════════════════════════════════

function clamp(v:number,min=0,max=100){return Math.max(min,Math.min(max,v));}
function weightedPick<T extends{weight?:number}>(items:T[]):T{
  const total=items.reduce((s,i)=>s+(i.weight||1),0);let r=Math.random()*total;
  for(const item of items){r-=item.weight||1;if(r<=0)return item;}return items[0];
}

function routeAdjustedEvent(day:number,totalDays:number,used:Set<string>,events:GameEvent[],routeTag:"SAFE"|"FAST"|"PROFIT"){
  const base = pickEvent(day,totalDays,used,events);
  if (!base) return null;
  const phase = day / totalDays;
  const pool = events.filter(e => phase >= e.phase_min && phase <= e.phase_max && !used.has(e.id));
  if (pool.length === 0) return base;
  const withWeights = pool.map(e => {
    const danger = e.id.includes("storm") || e.id.includes("stampede") || e.id.includes("fire") || e.id.includes("rustler") || e.id.includes("fever") || e.id.includes("snake");
    const market = e.id.includes("buyer") || e.id.includes("competition") || e.id.includes("good_grass");
    let weight = e.weight;
    if (routeTag === "SAFE" && danger) weight = Math.max(1, weight - 2);
    if (routeTag === "FAST" && danger) weight += 2;
    if (routeTag === "PROFIT" && market) weight += 2;
    return { ...e, weight };
  });
  return weightedPick(withWeights);
}

function shouldGateTrivia(eventId: string, turn: number){
  const seed = eventId.length + turn;
  return seed % 4 === 0;
}
function resolveChoice(ch:Choice):{effects?:Resources;result?:string;earlyEnd?:boolean}{
  if(ch.outcomes)return weightedPick(ch.outcomes);return{effects:ch.effects,result:ch.result,earlyEnd:ch.earlyEnd};
}
function pickEvent(day:number,td:number,used:Set<string>,evts:GameEvent[]):GameEvent|null{
  const p=day/td;const el=evts.filter(e=>p>=e.phase_min&&p<=e.phase_max&&!used.has(e.id));
  const pool=el.length>0?el:evts.filter(e=>p>=e.phase_min&&p<=e.phase_max);
  if(!pool.length)return null;return weightedPick(pool);
}
// ═══════════════════════════════════════════════════════════════
// ALL 17 EVENTS — imported from campaigns/chisholm/events.ts
// ═══════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════
// CONSTANTS & HELPERS
// ═══════════════════════════════════════════════════════════════

function getGrade2(h:number,started:number,s:boolean):string{if(!s)return"F";const p=h/started;if(p>=0.95)return"A";if(p>=0.88)return"B";if(p>=0.80)return"C";if(p>=0.70)return"D";return"F";}
const GC:Record<string,string>={"A+":"text-amber-300",A:"text-emerald-400",B:"text-blue-400",C:"text-yellow-400",D:"text-orange-400",F:"text-red-500"};
const DEFAULT_OUTFIT: OutfitConfig = { herd: 2500, crew: 12, horses: 60, supplies: 65, guns: 4, spareParts: 3, medicalGear: 2, horseQuality: 2, wages: "standard", budgetSpent: 0, startingCash: 0 };
const makeInit=():GameState=>({day:1,turn:0,resources:{...INIT_R},phase:"intro",pace:"normal",distance:0,currentEvent:null,resultText:"",decisions:[],gameOver:false,survived:false,earlySale:false,outfit:{...DEFAULT_OUTFIT},historicalKnowledge:0,knowledgeLog:[],triviaCounter:0,currentTrivia:null,usedTriviaIds:new Set(),triviaStreak:0,insight:1,objectives:[],routeState:{currentNodeId:"start"},routeTag:"SAFE",riskHintsOn:false,pendingChoiceIndex:null,pendingEventQuestion:null,objectiveNotice:"",sageIndex:0,currentSage:null,sagesMet:[],trailFeed:[ChisholmCampaign.trailFeedOpener],hardPaceStreak:0});

// ═══════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════

export default function App(){
  const[campaignId,setCampaignId]=useState<string|null>(null);
  const[state,setState]=useState<GameState>(makeInit());
  const[usedEvents,setUsedEvents]=useState<Set<string>>(new Set());

  const start=useCallback(()=>{setState({...makeInit(),phase:"outfit"});setUsedEvents(new Set());},[]);
  const backToMenu=useCallback(()=>{setCampaignId(null);setState(makeInit());},[]);

  // ── Game Juice ──────────────────────────────────────────────
  const { floats, spawn: spawnFloat } = useFloatingNumbers();
  const { shakeClass, shake } = useScreenShake();
  const { pulses, pulse } = useStatPulse();

  const onDelta = useCallback((key: string, delta: number) => {
    const label = RESOURCE_LABELS[key];
    if (!label) return;
    pulse(key, delta > 0 ? "gain" : "loss");
    spawnFloat(delta, label);
  }, [pulse, spawnFloat]);

  const onBigHit = useCallback((totalLoss: number) => {
    if (totalLoss > 100) shake("heavy");
    else if (totalLoss > 30) shake("medium");
    else shake("light");
  }, [shake]);

  useResourceTracker(state.resources, { onDelta, onBigHit });

  const onOutfitDone=useCallback((config:OutfitConfig)=>{
    setState(prev=>{
      const rating=getCrewRating(config.herd,config.crew);
      const morale=WAGE_MORALE[config.wages];
      return{...prev,
        phase:"sailing"as const,
        outfit:config,
        trailFeed:["You roll out of San Antonio with fresh teams and a strict ledger."],
        hardPaceStreak:0,
        resources:{
          herd:config.herd,
          crew:config.crew,
          horses:config.horses,
          supplies:config.supplies,
          morale,
          herdCondition:rating.condition,
          ammo:config.guns*10,
          spareParts:config.spareParts,
          wagonCondition:clampR("wagonCondition", 56 + config.spareParts * 6 + config.horseQuality * 6),
          cash:config.startingCash,
        },
      };
    });
  },[]);

  const advanceTurn=useCallback(()=>{
    setState(prev=>{
      const s:GameState={...prev,resources:{...prev.resources}};
      const before = { turn: prev.turn, day: prev.day, distance: prev.distance, resources: { ...prev.resources } };
      s.turn+=1;const pace=PACES.find(p=>p.id===s.pace)!;
      s.day=Math.min(s.day+DAYS_PER_TURN,TOTAL_DAYS+1);
      for(const[k,v]of Object.entries(pace.fx))s.resources[k]=clampR(k,(s.resources[k]||0)+v);
      if (s.routeTag === "FAST") {
        s.resources.herdCondition = clampR("herdCondition", s.resources.herdCondition - 2);
        s.resources.wagonCondition = clampR("wagonCondition", s.resources.wagonCondition - 3);
      }
      if (s.routeTag === "SAFE") s.resources.morale = clampR("morale", s.resources.morale + 1);
      if (s.routeTag === "PROFIT") s.resources.supplies = clampR("supplies", s.resources.supplies - 1);

      // Crew shortages throttle pace and herd control
      const crewPenalty = s.resources.crew <= 5 ? 0.6 : s.resources.crew <= 7 ? 0.78 : s.resources.crew <= 9 ? 0.9 : 1;
      const wagonPenalty = s.resources.wagonCondition <= 0 ? 0.45 : s.resources.wagonCondition < 20 ? 0.7 : s.resources.wagonCondition < 40 ? 0.85 : 1;
      const distanceGain = pace.mpd * DAYS_PER_TURN * crewPenalty * wagonPenalty;
      s.distance=Math.min(s.distance+distanceGain,TOTAL_DISTANCE);
      s.hardPaceStreak = pace.id === "push" ? s.hardPaceStreak + 1 : Math.max(0, s.hardPaceStreak - 1);

      const crewDrain = Math.ceil(s.resources.crew / 8);
      const wagonLossDrain = s.resources.wagonCondition <= 0 ? 7 : 0;
      s.resources.supplies=clamp(s.resources.supplies-crewDrain-wagonLossDrain,0,100);

      // Wagon stress model
      const supplyStress = s.resources.supplies < 22 ? 5 : s.resources.supplies < 35 ? 3 : 0;
      const herdStress = s.resources.herdCondition < 30 ? 3 : 0;
      const hardPaceStress = s.pace === "push" ? 6 : s.pace === "normal" ? 2 : 0;
      const weatherStress = Math.random() < 0.25 ? Math.ceil(Math.random() * 4) : 0;
      const totalWagonStress = supplyStress + herdStress + hardPaceStress + weatherStress;
      s.resources.wagonCondition = clampR("wagonCondition", s.resources.wagonCondition - totalWagonStress + Math.floor((s.outfit.horseQuality || 0) / 2));

      // Breakdowns and spare parts consequences
      const breakdownRisk = (s.pace === "push" ? 0.22 : s.pace === "normal" ? 0.12 : 0.06) + (s.resources.wagonCondition < 35 ? 0.1 : 0) + (s.resources.spareParts <= 0 ? 0.12 : 0);
      if (Math.random() < breakdownRisk) {
        if (s.resources.spareParts > 0) {
          s.resources.spareParts = clampR("spareParts", s.resources.spareParts - 1);
          s.resources.wagonCondition = clampR("wagonCondition", s.resources.wagonCondition + 12);
          s.resources.supplies = clampR("supplies", s.resources.supplies - 4);
          s.resultText = "Wagon axle strain forced a field repair. You burned one spare-part crate and lost time.";
          s.phase = "result";
        } else {
          s.resources.wagonCondition = clampR("wagonCondition", s.resources.wagonCondition - 20);
          s.resources.supplies = clampR("supplies", s.resources.supplies - 12);
          s.resources.herdCondition = clampR("herdCondition", s.resources.herdCondition - 6);
          if (Math.random() < 0.35) {
            s.resources.wagonCondition = 0;
            s.resultText = "No spare parts. The chuck wagon was abandoned in mud and broken timber. You are now hauling what you can on horseback.";
          } else {
            s.resultText = "No spare parts. The wagon limps onward, badly damaged, with food and medical stores spilling out.";
          }
          s.phase = "result";
        }
      }

      // Consequential failures under weak conditions
      if(s.resources.herdCondition<20)s.resources.herd=Math.max(0,s.resources.herd-Math.ceil(Math.random()*65)-25);
      else if(s.resources.herdCondition<35&&Math.random()<0.6)s.resources.herd=Math.max(0,s.resources.herd-Math.ceil(Math.random()*30));
      if(s.resources.crew<=7&&Math.random()<0.35)s.resources.herd=Math.max(0,s.resources.herd-Math.ceil(Math.random()*35));
      if(s.resources.morale<20&&Math.random()<0.4)s.resources.crew=Math.max(0,s.resources.crew-1);
      if(s.resources.supplies<15&&Math.random()<0.3)s.resources.crew=Math.max(0,s.resources.crew-1);

      const turnFeed = buildTrailFeedEntries(s.resources, pace.id, s.hardPaceStreak, distanceGain, s.day);
      if (isNearSupplyTown((s.distance / TOTAL_DISTANCE) * 100).near) {
        turnFeed.push("A town is close ahead. Repairs and fresh hands are available for a high price.");
      }
      s.trailFeed = [...s.trailFeed, ...turnFeed].slice(-18);
      if(s.resources.crew<=2||s.resources.herd<=100||s.resources.horses<=5)return{...s,phase:"end"as const,gameOver:true,survived:false};
      if(s.distance>=TOTAL_DISTANCE)return{...s,phase:"end"as const,gameOver:true,survived:true};
      const tick = tickObjectives(s.objectives, before, { turn: s.turn, day: s.day, distance: s.distance, resources: { ...s.resources } });
      s.objectives = tick.active;
      if (tick.completedNow.length > 0) {
        const first = tick.completedNow[0];
        s.insight += first.reward.insight;
        for (const completed of tick.completedNow) {
          if (completed.reward.resources) {
            for (const [k, v] of Object.entries(completed.reward.resources)) {
              s.resources[k] = clampR(k, (s.resources[k] || 0) + v);
            }
          }
        }
        s.objectiveNotice = `Objective Complete! ${first.title} (+${first.reward.insight} Insight)`;
      }
      if (s.turn % 3 === 0 && s.objectives.length < 2) {
        s.objectives = [...s.objectives, generateObjective({ turn: s.turn, day: s.day, distance: s.distance, resources: s.resources })];
      }

      // ── SAGE CHECK — fires before any random event ────
      const currentProgress = (s.distance / TOTAL_DISTANCE) * 100;
      const prevProgress = (before.distance / TOTAL_DISTANCE) * 100;
      if (s.sageIndex < SAGES.length) {
        const nextSage = SAGES[s.sageIndex];
        if (currentProgress >= nextSage.threshold) {
          s.currentSage = nextSage;
          s.phase = "sage";
          console.log(`[SAGE] Triggered: ${nextSage.name} at ${currentProgress.toFixed(1)}% (threshold: ${nextSage.threshold}%)`);
          return s;
        }
      }

      const event=routeAdjustedEvent(s.day,TOTAL_DAYS,usedEvents,EVENTS,s.routeTag);
      console.log(`[ADVANCE] Turn ${s.turn} | Day ${s.day} | Event: ${event?.id || 'NONE'} | TriviaCounter: ${s.triviaCounter}`);
      if(event){
        if (s.triviaCounter >= 2) {
          const progress = Math.min((s.distance / TOTAL_DISTANCE) * 100, 100);
          const trivia = pickTriviaQuestion(progress, s.usedTriviaIds);
          console.log(`[TRIVIA CHECK] Counter=${s.triviaCounter} | Progress=${progress.toFixed(1)}% | Question found: ${trivia?.id || 'NULL'}`);
          if (trivia) {
            s.currentTrivia = trivia;
            s.usedTriviaIds = new Set(s.usedTriviaIds).add(trivia.id);
            s.triviaCounter = 0;
            s.phase = "trivia";
            console.log(`[TRIVIA FIRES] Question: ${trivia.id} | Phase set to 'trivia'`);
            return s;
          }
        }
        setUsedEvents(p=>new Set(p).add(event.id));s.currentEvent={...event,triviaGate:shouldGateTrivia(event.id,s.turn)};s.phase="event";
        s.riskHintsOn = false;
        s.pendingChoiceIndex = null;
        s.pendingEventQuestion = null;
        s.triviaCounter++;
        console.log(`[EVENT] ${event.id} | Counter now: ${s.triviaCounter}`);
      }
      return s;
    });
  },[usedEvents]);

  const chooseRoute = useCallback((toId: string, tag: "SAFE"|"FAST"|"PROFIT") => {
    setState(prev => ({ ...prev, routeState: { currentNodeId: toId }, routeTag: tag }));
  }, []);

  const finalizeChoice=useCallback((ci:number,insightBonus:number)=>{
    setState(prev=>{
      if(!prev.currentEvent || !prev.currentEvent.choices) return prev;
      const s:GameState={...prev,resources:{...prev.resources},decisions:[...prev.decisions]};
      const choice=s.currentEvent!.choices![ci];const outcome=resolveChoice(choice);
      s.decisions.push({event:s.currentEvent!.title,choice:choice.text,day:s.day});
      if(outcome.effects)for(const[k,v]of Object.entries(outcome.effects))if(s.resources[k]!==undefined){
        let delta = v;
        if (k === "herd" && v < 0 && s.resources.crew <= 7) delta = Math.floor(v * 1.35);
        if (k === "supplies" && v < 0 && s.resources.wagonCondition <= 20) delta = Math.floor(v * 1.3);
        s.resources[k]=clampR(k,s.resources[k]+delta);
      }
      if (insightBonus > 0) s.insight += insightBonus;
      if(choice.earlyEnd||outcome.earlyEnd)s.earlySale=true;
      if (insightBonus > 0) {
        s.resultText=`${outcome.result||""}\n\nYou answered the trivia correctly and gained +${insightBonus} Insight.`;
      } else {
        s.resultText=outcome.result||"";
      }
      s.phase="result";
      s.pendingChoiceIndex = null;
      s.pendingEventQuestion = null;
      return s;
    });
  },[]);

  // Handle standard Visual Novel Choice
  const handleChoice=useCallback((ci:number)=>{
    if (state.currentEvent?.triviaGate) {
      const q = CHISHOLM_EVENT_TRIVIA[(state.turn + ci) % CHISHOLM_EVENT_TRIVIA.length];
      setState(prev => ({ ...prev, phase: "event_trivia", pendingChoiceIndex: ci, pendingEventQuestion: q }));
      return;
    }
    finalizeChoice(ci, 0);
  },[finalizeChoice, state.currentEvent?.triviaGate, state.turn]);

  const handleEventTriviaAnswer = useCallback((choiceIndex:number)=>{
    const q = state.pendingEventQuestion;
    const pendingChoiceIndex = state.pendingChoiceIndex;
    if (!q || pendingChoiceIndex === null) return;
    const correct = choiceIndex === q.correctIndex;
    finalizeChoice(pendingChoiceIndex, correct ? 1 : 0);
  },[state.pendingEventQuestion,state.pendingChoiceIndex,finalizeChoice]);

  const spendInsightForHints = useCallback(() => {
    setState(prev => {
      if (prev.insight <= 0 || prev.riskHintsOn) return prev;
      return { ...prev, insight: prev.insight - 1, riskHintsOn: true };
    });
  }, []);

  // 🔴 Handle Push Your Luck Update (Realtime Resource Adjustment)
  const handlePushUpdate = useCallback((effects: Resources) => {
    setState(prev => {
      const s: GameState = { ...prev, resources: { ...prev.resources } };
      for (const [k, v] of Object.entries(effects)) {
        if (s.resources[k] !== undefined) s.resources[k] = clampR(k, s.resources[k] + v);
      }
      return s;
    });
  }, []);

  // 🔴 Handle leaving the Push Your Luck state
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

  const continueGame=useCallback(()=>{
    setState(prev=>{
      const s:GameState={...prev,currentEvent:null,resultText:"",objectiveNotice:""};
      if(s.resources.crew<=2||s.resources.herd<=100||s.resources.horses<=5)return{...s,phase:"end"as const,gameOver:true,survived:false};
      if(s.distance>=TOTAL_DISTANCE||s.earlySale)return{...s,phase:"end"as const,gameOver:true,survived:true};
      s.phase="sailing";return s;
    });
  },[]);

  const handleSageComplete = useCallback((correct: boolean) => {
    setState(prev => {
      if (!prev.currentSage) return prev;
      const s: GameState = {
        ...prev,
        resources: { ...prev.resources },
        decisions: [...prev.decisions],
        knowledgeLog: [...prev.knowledgeLog],
        sagesMet: [...prev.sagesMet],
      };
      const sage = s.currentSage!;
      const reward = correct ? sage.reward.correct : sage.reward.wrong;
      const knowledge = correct ? sage.reward.knowledgeCorrect : sage.reward.knowledgeWrong;

      // Apply resource rewards
      for (const [k, v] of Object.entries(reward)) {
        if (k === "insight") {
          s.insight += v;
        } else if (s.resources[k] !== undefined) {
          s.resources[k] = clampR(k, s.resources[k] + v);
        }
      }

      // Apply knowledge
      s.historicalKnowledge += knowledge;
      s.knowledgeLog.push(`${sage.name}: +${knowledge} knowledge${correct ? " (correct)" : ""}`);
      s.decisions.push({
        event: `Sage: ${sage.name}`,
        choice: correct ? `Answered correctly` : `Learned from ${sage.name}`,
        day: s.day,
      });

      // Advance sage index and record the meeting
      s.sagesMet.push(sage.id);
      s.sageIndex = prev.sageIndex + 1;
      s.currentSage = null;
      s.phase = "sailing";

      return s;
    });
  }, []);

  const handleHunt=useCallback(()=>{
    setState(prev=>{
      const s:GameState={...prev,resources:{...prev.resources},decisions:[...prev.decisions]};
      const ammo=s.resources.ammo||0;
      if(ammo<5)return s; // shouldn't happen, button is hidden
      s.resources.ammo=ammo-5;
      const gunBonus=Math.min(s.outfit.guns,8);
      const roll=Math.random()*100;
      const nothingCeil=35-gunBonus;
      const scrapsCeil=55-gunBonus*0.5;
      const decentCeil=75;
      const greatCeil=90;
      const accidentCeil=97;

      let result:string;
      if(roll<nothingCeil){result="You find no game and use five rounds of ammo.";}
      else if(roll<scrapsCeil){s.resources.supplies=clampR("supplies",s.resources.supplies+2);result="You catch small game, but food gains are low.";}
      else if(roll<decentCeil){s.resources.supplies=clampR("supplies",s.resources.supplies+7);result="A whitetail deer. Crew eats well tonight.";}
      else if(roll<greatCeil){s.resources.supplies=clampR("supplies",s.resources.supplies+14);result="You bring in a full buffalo. The crew has food for days.";}
      else if(roll<accidentCeil){s.resources.horses=Math.max(0,s.resources.horses-1);result="Horse stepped in a prairie dog hole at a gallop. Had to put the animal down.";}
      else{s.resources.crew=Math.max(0,s.resources.crew-1);result="A hunter caught a rattlesnake bite reaching through brush.";}
      s.decisions.push({event:"Hunting",choice:"Went hunting",day:s.day});
      s.resultText=result;s.phase="result";return s;
    });
  },[]);

  const handleTownRepair = useCallback(() => {
    setState(prev => {
      if (prev.resources.cash < 140) return prev;
      const s: GameState = { ...prev, resources: { ...prev.resources }, decisions: [...prev.decisions], resultText: "" };
      s.resources.cash = clampR("cash", s.resources.cash - 140);
      s.resources.wagonCondition = clampR("wagonCondition", s.resources.wagonCondition + 28);
      s.resources.spareParts = clampR("spareParts", s.resources.spareParts + 1);
      s.decisions.push({ event: "Town Stop", choice: "Paid for blacksmith wagon repair", day: s.day });
      s.resultText = "You paid steep town rates for blacksmith work and one spare-part crate.";
      s.trailFeed = [...(s.trailFeed || []), "Blacksmith repairs finished by lantern light. The wagon sounds steadier."].slice(-18);
      s.phase = "result";
      return s;
    });
  }, []);

  const handleTownHire = useCallback(() => {
    setState(prev => {
      if (prev.resources.cash < 110) return prev;
      const s: GameState = { ...prev, resources: { ...prev.resources }, decisions: [...prev.decisions], resultText: "" };
      s.resources.cash = clampR("cash", s.resources.cash - 110);
      s.resources.crew = clampR("crew", s.resources.crew + 1);
      s.resources.morale = clampR("morale", s.resources.morale + 4);
      s.decisions.push({ event: "Town Stop", choice: "Hired replacement hand", day: s.day });
      s.resultText = "You hired a replacement hand at inflated trail-town wages.";
      s.trailFeed = [...(s.trailFeed || []), "A new hand joined at town. Camp duty and night watch improved."].slice(-18);
      s.phase = "result";
      return s;
    });
  }, []);

  const handleTownResupply = useCallback(() => {
    setState(prev => {
      if (prev.resources.cash < 95) return prev;
      const s: GameState = { ...prev, resources: { ...prev.resources }, decisions: [...prev.decisions], resultText: "" };
      s.resources.cash = clampR("cash", s.resources.cash - 95);
      s.resources.supplies = clampR("supplies", s.resources.supplies + 20);
      s.resources.morale = clampR("morale", s.resources.morale + 3);
      s.decisions.push({ event: "Town Stop", choice: "Bought provisions and medicine", day: s.day });
      s.resultText = "You bought costly trail provisions, enough to steady the camp for now.";
      s.trailFeed = [...(s.trailFeed || []), "Fresh provisions reached camp. Meals should hold for several more days."].slice(-18);
      s.phase = "result";
      return s;
    });
  }, []);

  const handleTriviaComplete = useCallback((correct: boolean, effects: Record<string, number>) => {
    console.log(`[TRIVIA COMPLETE] Correct: ${correct} | Effects:`, effects);
    setState(prev => {
      const s: GameState = { ...prev, resources: { ...prev.resources }, knowledgeLog: [...prev.knowledgeLog], decisions: [...prev.decisions] };
      const qText = s.currentTrivia?.question || "Trivia";

      if (correct) {
        s.triviaStreak++;
        for (const [k, v] of Object.entries(effects)) {
          if (k === "historicalKnowledge") {
            s.historicalKnowledge += v;
            s.knowledgeLog.push(`Sage's Wisdom: +${v}`);
          } else if (k === "shortcut") {
            s.distance = Math.min(s.distance + v, TOTAL_DISTANCE);
          } else if (s.resources[k] !== undefined) {
            s.resources[k] = clampR(k, s.resources[k] + v);
          }
        }
        s.decisions.push({ event: "Sage Encounter", choice: `✓ Answered correctly (streak: ${s.triviaStreak}): "${qText}"`, day: s.day });
      } else {
        s.triviaStreak = 0;
        s.decisions.push({ event: "Sage Encounter", choice: `Learned from: "${qText}"`, day: s.day });
      }

      s.currentTrivia = null;
      s.phase = "sailing";

      if (s.distance >= TOTAL_DISTANCE) {
        return { ...s, phase: "end" as const, gameOver: true, survived: true };
      }
      return s;
    });
  }, []);

  const r=state.resources;
  const progress=state.distance/TOTAL_DISTANCE*100;
  const currentRouteNode = findNode(CHISHOLM_ROUTE, state.routeState.currentNodeId) || CHISHOLM_ROUTE[0];
  const supplyTown = isNearSupplyTown(progress);
  const wagonState = r.wagonCondition <= 0 ? "lost" : r.wagonCondition < 20 ? "critical" : r.wagonCondition < 40 ? "damaged" : r.wagonCondition < 65 ? "strained" : "operational";
  const warningFlags = [
    r.crew <= 7 ? "⚠️ Crew undermanned: herd control and security are deteriorating." : null,
    r.spareParts <= 0 ? "⚠️ No spare parts: next wagon failure could force abandonment." : null,
    r.wagonCondition < 35 ? `⚠️ Wagon ${wagonState}: travel and recovery options are collapsing.` : null,
    r.supplies < 20 ? "⚠️ Supplies unsustainable: illness, desertion, and herd losses likely." : null,
    r.morale < 20 ? "⚠️ Morale collapse risk: desertion likely in the next bad event." : null,
  ].filter(Boolean) as string[];
  const riskHints = (state.currentEvent?.choices || []).map((choice) => {
    if (choice.outcomes) {
      const avgLoss = choice.outcomes.reduce((sum, o) => sum + ((o.effects.herd || 0) < 0 ? Math.abs(o.effects.herd || 0) : 0) + ((o.effects.crew || 0) < 0 ? 20 : 0) + ((o.effects.morale || 0) < 0 ? Math.abs(o.effects.morale || 0) : 0), 0) / choice.outcomes.length;
      if (avgLoss > 70) return "HIGH";
      if (avgLoss > 30) return "MED";
      return "LOW";
    }
    const herdLoss = Math.abs(Math.min(0, choice.effects?.herd || 0));
    const moraleLoss = Math.abs(Math.min(0, choice.effects?.morale || 0));
    const crewLoss = Math.abs(Math.min(0, choice.effects?.crew || 0));
    const score = herdLoss + moraleLoss + crewLoss * 20;
    if (score > 70) return "HIGH";
    if (score > 30) return "MED";
    return "LOW";
  });
  console.log(`[RENDER] Phase: ${state.phase} | TriviaCounter: ${state.triviaCounter} | HasTrivia: ${!!state.currentTrivia}`);
  const partyMembers = getPartyMembers(r);

  if(campaignId==="silkroad")return <SilkRoad onBack={backToMenu}/>;
  if(campaignId==="crusades")return <Crusades onBack={backToMenu}/>;

  if(!campaignId)return(
    <div className="h-screen bg-stone-900 text-stone-100 flex flex-col items-center justify-center" style={{fontFamily:"'Georgia', serif"}}>
      <h1 className="text-3xl font-bold text-amber-400 mb-2">CAMPAIGNS</h1>
      <p className="text-stone-400 text-sm mb-8">Choose your trail.</p>
      <div className="space-y-3 w-64">
        <button onClick={()=>setCampaignId("chisholm")} className="w-full py-3 bg-amber-800 hover:bg-amber-700 rounded font-bold transition-colors">
          🐂 Chisholm Trail — 1867<br/><span className="text-xs font-normal text-amber-300">San Antonio to Abilene</span>
        </button>
        <button onClick={()=>setCampaignId("silkroad")} className="w-full py-3 bg-indigo-900 hover:bg-indigo-800 rounded font-bold transition-colors">
          🐫 Silk Road — 130 BCE<br/><span className="text-xs font-normal text-indigo-300">Chang'an to Constantinople</span>
        </button>
        <button onClick={()=>setCampaignId("crusades")} className="w-full py-3 bg-red-900 hover:bg-red-800 rounded font-bold transition-colors">
          ✝ Third Crusade — 1190<br/><span className="text-xs font-normal text-red-300">Warwick to Jerusalem</span>
        </button>
      </div>
    </div>
  );

  if(state.phase==="intro")return(
    <div className="h-screen bg-stone-900 text-stone-100 flex flex-col items-center justify-center" style={{fontFamily:"'Georgia', serif"}}>
      <div className="max-w-md text-center space-y-4 p-4">
        <h1 className="text-3xl font-bold text-amber-400">{ChisholmCampaign.title}</h1>
        <p className="text-stone-300">{ChisholmCampaign.subtitle}</p>
        <p className="text-stone-400 text-sm">{ChisholmCampaign.introBody}</p>
        <button onClick={start} className="px-8 py-3 bg-amber-700 hover:bg-amber-600 rounded font-bold transition-colors">BEGIN OUTFIT</button>
        <button onClick={backToMenu} className="block w-full text-stone-500 hover:text-stone-300 text-xs mt-2">← Back to Campaigns</button>
      </div>
    </div>
  );

  if(state.phase==="outfit")return<OutfitScreen onDone={onOutfitDone}/>;

  if(state.phase==="end"){
    const herdPct = state.outfit.herd > 0 ? r.herd / state.outfit.herd : 0;
    const revenue = state.survived ? r.herd * ChisholmCampaign.revenuePerUnit : 0;
    const cost = state.outfit.budgetSpent;
    const profit = revenue - cost;
    const grade = getTrailGrade(state.survived, herdPct, state.historicalKnowledge);

    return(
    <div className="h-screen bg-stone-900 text-stone-100 p-4 overflow-y-auto" style={{fontFamily:"'Georgia', serif"}}>
      <div className="max-w-lg mx-auto space-y-4">
        <h1 className={`text-2xl font-bold text-center ${state.survived?"text-amber-400":"text-red-500"}`}>
          {state.survived ? (state.earlySale ? "SOLD ON THE TRAIL" : "ABILENE") : "TRAIL'S END"}
        </h1>
        <p className="text-center text-stone-300 text-sm">
          {state.survived
            ? state.earlySale ? `Sold the herd early. ${Math.round(progress)}% of the trail complete.`
            : `${r.herd.toLocaleString()} head delivered to the Abilene railhead. The Kansas Pacific is loading them now.`
            : `Your drive failed on day ${state.day}. The prairie keeps what it takes.`}
        </p>

        <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1 text-xs">
          <h2 className="text-amber-300 font-bold uppercase tracking-wide text-center mb-1">Financial Ledger</h2>
          <div className="flex justify-between text-stone-400"><span>Outfit Cost</span><span className="text-red-400">-${cost.toLocaleString()}</span></div>
          <div className="flex justify-between text-stone-400"><span>Herd Started</span><span className="text-stone-200">{state.outfit.herd.toLocaleString()} head</span></div>
          <div className="flex justify-between text-stone-400"><span>Herd Delivered</span><span className="text-stone-200">{r.herd.toLocaleString()} head ({Math.round(herdPct*100)}%)</span></div>
          {state.survived && <div className="flex justify-between text-stone-400"><span>Revenue (${ChisholmCampaign.revenuePerUnit}/head)</span><span className="text-emerald-400">+${revenue.toLocaleString()}</span></div>}
          <div className="border-t border-stone-600 mt-1 pt-1 flex justify-between font-bold">
            <span className="text-stone-200">Net Profit</span>
            <span className={profit>=0?"text-emerald-400":"text-red-500"}>{profit>=0?"+":""}${profit.toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1 text-xs">
          <h2 className="text-amber-300 font-bold uppercase tracking-wide text-center mb-1">Historical Knowledge (TEKS)</h2>
          <div className="flex justify-between font-bold">
            <span className="text-stone-200">Trail Wisdom Earned</span>
            <span className="text-amber-400">{state.historicalKnowledge} points</span>
          </div>
          <div className="w-full bg-stone-700 rounded-full h-2 mt-1">
            <div className="bg-amber-500 h-2 rounded-full transition-all" style={{width:`${Math.min(state.historicalKnowledge/30*100,100)}%`}}/>
          </div>
          {state.knowledgeLog.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {state.knowledgeLog.map((log, i) => (
                <p key={i} className="text-stone-500 text-xs">📜 {log}</p>
              ))}
            </div>
          )}
          {state.historicalKnowledge === 0 && <p className="text-stone-600 text-center italic mt-1">No historical knowledge gained. You drove cattle but learned nothing about the trail's history.</p>}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1">
            <h2 className="text-amber-300 font-bold text-xs uppercase tracking-wide text-center">Trail Stats</h2>
            {([["Days", `${state.day}`], ["Distance", `${Math.round(state.distance)} mi`], ["Crew Left", `${r.crew}`], ["Horses Left", `${r.horses}`]] as [string,string][]).map(([l,v])=>(
              <div key={l} className="flex justify-between text-stone-400 text-xs"><span>{l}</span><span className="text-stone-200">{v}</span></div>
            ))}
          </div>
          <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1">
            <h2 className="text-blue-300 font-bold text-xs uppercase tracking-wide text-center">Historical Context</h2>
            {([["Trail distance", "~800 miles"], ["Typical drive", "2-3 months"], ["Herd size", "1,500-3,000"], ["Price in TX", "$4/head"]] as [string,string][]).map(([l,v])=>(
              <div key={l} className="flex justify-between text-stone-400 text-xs"><span>{l}</span><span className="text-stone-200">{v}</span></div>
            ))}
          </div>
        </div>

        <div className="text-center"><span className="text-stone-500 text-xs">TRAIL RATING: </span><span className={`text-4xl font-bold ${GC[grade]}`}>{grade}</span></div>

        <div className="bg-stone-800 border border-stone-700 rounded p-3">
          <p className="text-xs text-stone-500 leading-relaxed">{ChisholmCampaign.historicalContext}</p>
        </div>

        {state.decisions.length > 0 && (
          <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1">
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wide">Decision Log</h3>
            {state.decisions.map((d, i) => (
              <p key={i} className="text-xs text-stone-500"><span className="text-stone-600">Day {d.day}:</span> <span className="text-stone-400">{d.event}</span> — {d.choice}</p>
            ))}
          </div>
        )}

        <div className="text-center pb-4 space-y-2">
          <button onClick={()=>{setState(makeInit());setUsedEvents(new Set());}} className="px-5 py-2 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded transition-colors">Run It Again</button>
          <br/><button onClick={backToMenu} className="text-xs text-stone-500 hover:text-stone-300 transition-colors">← Back to Campaigns</button>
        </div>
      </div>
    </div>
    );
  }

  return(
    <div className={`west-app h-screen bg-stone-900 text-stone-100 flex overflow-hidden ${shakeClass}`} style={{fontFamily:"'Georgia', serif"}}>
      <StreakFlash streak={state.triviaStreak} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 pointer-events-none z-50">
        <FloatingNumbers floats={floats} />
      </div>

      {/* ── Map Sidebar ──────────────────────────────────── */}
      <div className="hidden md:flex w-[360px] lg:w-[430px] xl:w-[520px] 2xl:w-[580px] flex-shrink-0">
        <TrailMap progress={progress} day={state.day} totalDays={TOTAL_DAYS} trailPath={TRAIL_PATH} trailStops={STOPS} mapImage={MAP_IMAGE} totalDistance={TOTAL_DISTANCE} />
      </div>


      <aside className="hidden xl:flex w-72 2xl:w-80 flex-shrink-0 border-l border-stone-700 bg-stone-900/80 flex-col">
        <div className="px-3 py-2 border-b border-stone-700">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-300">On the Trail</p>
          <p className="text-[11px] text-stone-400">Recent notes from camp, herd, and wagon.</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {[...state.trailFeed].slice(-12).reverse().map((entry, idx) => (
            <div key={`${idx}-${entry.slice(0,18)}`} className={`rounded border p-2 ${idx===0 ? "border-amber-700 bg-amber-950/20" : "border-stone-700 bg-stone-800/60"}`}>
              <p className="text-[11px] leading-relaxed text-stone-300">{entry}</p>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main Game Column ─────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 xl:px-4 2xl:px-8">
      <div className="flex-shrink-0 bg-stone-800">
        <div className="max-w-xl xl:max-w-2xl mx-auto">
          <PrairieScene progress={progress} pace={state.pace} turn={state.turn}/>
        </div>
      </div>
      <div className="flex-shrink-0 bg-stone-800 border-b border-stone-700 px-3 py-2">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-6 gap-2 text-xs mb-2">
            <StatBox icon="🐂" label="Herd" value={r.herd} pulseState={pulses.herd || ""} />
            <StatBox icon="🤠" label="Crew" value={r.crew} pulseState={pulses.crew || ""} />
            <StatBox icon="🐴" label="Horses" value={r.horses} pulseState={pulses.horses || ""} />
            <StatBox icon="🔫" label="Ammo" value={r.ammo||0} pulseState={pulses.ammo || ""} />
            <StatBox icon="🛞" label="Wagon" value={r.wagonCondition||0} pulseState={pulses.wagonCondition || ""} />
            <StatBox icon="💵" label="Cash" value={r.cash||0} pulseState={pulses.cash || ""} />
          </div>
          <div className="mb-2 bg-stone-700 rounded p-1.5 text-xs text-center">
            <span className="text-stone-300">✨ Insight:</span> <span className="text-amber-400 font-bold">{state.insight}</span>
          </div>
          <div className="space-y-1">
            <ResourceBar label="🌾 Supplies" value={r.supplies} color={r.supplies<20?"bg-red-500":"bg-green-500"} pulseState={pulses.supplies || ""} />
            <ResourceBar label="😊 Morale" value={r.morale} color={r.morale<25?"bg-red-500":"bg-yellow-500"} pulseState={pulses.morale || ""} />
            <ResourceBar label="💪 Herd Cond." value={r.herdCondition} color={r.herdCondition<25?"bg-red-500":"bg-emerald-500"} pulseState={pulses.herdCondition || ""} />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 text-stone-400 text-xs">📜 Knowledge</span>
            <div className="flex-1 bg-stone-700 rounded-full h-2"><div className="bg-amber-500 h-2 rounded-full transition-all" style={{width:`${Math.min(state.historicalKnowledge/30*100,100)}%`}}/></div>
            <span className="text-stone-500 text-xs w-6 text-right">{state.historicalKnowledge}</span>
          </div>
          <div className="flex justify-between text-stone-500 text-xs mt-1">
            <span>Day {state.day}/{TOTAL_DAYS}</span>
            <span>{Math.round(state.distance)}/{TOTAL_DISTANCE} mi</span>
          </div>
          {state.objectiveNotice && (
            <p className="text-xs text-emerald-300 mt-1">{state.objectiveNotice}</p>
          )}
          {warningFlags.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {warningFlags.map((w) => (
                <p key={w} className="text-[11px] text-amber-300">{w}</p>
              ))}
            </div>
          )}
        </div>
      </div>
      <DoomHUD members={partyMembers}/>
      <PortraitDebugPanel />
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <div className="max-w-4xl mx-auto space-y-3 mt-2">
          {state.phase==="sailing"&&(
            <div className="space-y-3">
              <div className="border border-indigo-700 rounded p-2 bg-indigo-950/40">
                <p className="text-xs text-indigo-300 font-bold">Route: {currentRouteNode.title} ({state.routeTag})</p>
                <p className="text-xs text-stone-300">{currentRouteNode.description}</p>
                {currentRouteNode.edges.length > 0 && (
                  <div className="mt-2 grid grid-cols-1 gap-1">
                    {currentRouteNode.edges.map((edge) => (
                      <button key={edge.to} onClick={() => chooseRoute(edge.to, edge.tag)} className="text-left text-xs px-2 py-1 rounded bg-indigo-900 hover:bg-indigo-800">
                        {edge.label} <span className="text-indigo-300">[{edge.tag}]</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {state.objectives.length > 0 && (
                <div className="space-y-2">
                  {state.objectives.map((obj) => (
                    <div key={obj.id} className="border border-emerald-800 rounded p-2 bg-emerald-950/30">
                      <p className="text-xs font-bold text-emerald-300">Quest: {obj.title}</p>
                      <p className="text-xs text-stone-300">{obj.description}</p>
                      <p className="text-[11px] text-stone-400">Progress: {obj.progress}/{obj.target} · {obj.expiresInTurns} turns left</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="border border-stone-700 rounded p-3 bg-stone-800/80">
                <p className="text-stone-300 text-sm">{getPhrase(progress/100)}</p>
                <p className="text-stone-500 text-xs mt-1 italic">{getRegionFlavor(progress)}</p>
              </div>

              {supplyTown.near && (
                <div className="border border-amber-800 rounded p-2 bg-amber-950/30 space-y-2">
                  <p className="text-xs text-amber-300 font-bold">Town stop nearby: {supplyTown.town}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button onClick={handleTownRepair} disabled={(r.cash||0) < 140} className="text-xs px-2 py-1 rounded bg-stone-700 hover:bg-stone-600 disabled:opacity-50">Repair Wagon ($140)</button>
                    <button onClick={handleTownHire} disabled={(r.cash||0) < 110} className="text-xs px-2 py-1 rounded bg-stone-700 hover:bg-stone-600 disabled:opacity-50">Hire Hand ($110)</button>
                    <button onClick={handleTownResupply} disabled={(r.cash||0) < 95} className="text-xs px-2 py-1 rounded bg-stone-700 hover:bg-stone-600 disabled:opacity-50">Resupply ($95)</button>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                {PACES.map(p=>{
                  const blocked = (p.id === "push" && (r.crew <= 7 || r.wagonCondition <= 20)) || (p.id === "normal" && r.wagonCondition <= 0);
                  return (
                    <button key={p.id} onClick={()=>{if(blocked) return; setState(prev=>({...prev,pace:p.id}));advanceTurn();}}
                      disabled={blocked}
                      className={`flex-1 py-2 rounded text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${p.id==="push"?"bg-red-900 hover:bg-red-800":p.id==="normal"?"bg-stone-700 hover:bg-stone-600":"bg-emerald-900 hover:bg-emerald-800"}`}>
                      {p.label}<br/><span className="font-normal text-stone-400">{blocked ? "Blocked: crew/wagon" : p.desc}</span>
                    </button>
                  );
                })}
              </div>
              {(r.ammo||0)>=5&&(
                <button onClick={handleHunt} className="w-full py-2 bg-amber-900 hover:bg-amber-800 rounded text-xs font-bold transition-colors">
                  🔫 Hunt ({r.ammo||0} rounds)
                </button>
              )}
              {r.wagonCondition <= 0 && (
                <button onClick={()=>setState(prev=>({...prev, phase:"end", gameOver:true, survived:false, resultText:"You turned back after losing the chuck wagon."}))} className="w-full py-2 bg-red-900 hover:bg-red-800 rounded text-xs font-bold transition-colors">
                  ↩ Turn Back Before More Losses
                </button>
              )}
            </div>
          )}
          {state.phase==="sage"&&state.currentSage&&(
            <SageEncounter
              sage={state.currentSage}
              onComplete={handleSageComplete}
            />
          )}
          {state.phase==="event"&&state.currentEvent&&(
            state.currentEvent.type==="push_luck"?(
              <PushYourLuckEngine event={state.currentEvent} onUpdate={handlePushUpdate} onLeave={handlePushLeave}/>
            ):(
              <VisualNovelEngine
                currentEvent={state.currentEvent}
                handleChoice={handleChoice}
                bossHealth={r.morale}
                scoutHealth={r.morale}
                insight={state.insight}
                onSpendInsightForHints={spendInsightForHints}
                showRiskHints={state.riskHintsOn}
                riskHints={riskHints}
              />
            )
          )}
          {state.phase==="event_trivia"&&state.pendingEventQuestion&&(
            <div className="border border-indigo-700 rounded p-3 bg-indigo-950/40 space-y-2">
              <p className="text-sm text-indigo-200 font-bold">Quick Sage Question</p>
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
          {state.phase==="trivia"&&state.currentTrivia&&(
            <ChisholmTriviaEngine
              question={state.currentTrivia}
              progress={progress}
              streak={state.triviaStreak}
              onComplete={handleTriviaComplete}
            />
          )}
          {state.phase==="result"&&(
            <div className="space-y-3">
              <div className="border border-stone-700 rounded p-3 bg-stone-800/80">
                <p className="text-stone-300 text-sm leading-relaxed">{state.resultText}</p>
              </div>
              <button onClick={continueGame} className="w-full py-2 bg-amber-800 hover:bg-amber-700 rounded text-sm font-bold transition-colors">Continue Trail</button>
            </div>
          )}
        </div>
      </div>
      </div>{/* end main game column */}
    </div>
  );
}
