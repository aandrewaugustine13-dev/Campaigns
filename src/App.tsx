import { useState, useCallback, useEffect, useRef } from "react";
import DoomHUD from "./DoomHUD";
import PortraitDebugPanel from "./PortraitDebugPanel";
import VisualNovelEngine from "./VisualNovelEngine";
import PushYourLuckEngine from "./PushYourLuckEngine";
import SilkRoad from "./SilkRoad";
import ChisholmTriviaEngine, { pickTriviaQuestion, type TriviaQuestion } from "./ChisholmTrivia";
import type { Objective, RouteState, EventGateQuestion } from "./gameModels";
import { generateObjective, tickObjectives, findNode } from "./gameLogic";
import { CHISHOLM_ROUTE } from "./routes";
import { CHISHOLM_EVENT_TRIVIA } from "./trivia";
import {
  useFloatingNumbers, FloatingNumbers,
  useScreenShake, useStatPulse, useResourceTracker,
  StatBox, ResourceBar, StreakFlash,
} from "./GameJuice";
import TrailMap, { getRegionFlavor } from "./TrailMap";
import { SAGES, type SageEncounterData } from "./Sages";
import SageEncounter from "./SageEncounter";

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
}

// ═══════════════════════════════════════════════════════════════
// PIXEL FACE SYSTEM
// ═══════════════════════════════════════════════════════════════

const FC: Record<string, string> = {
  ".":"transparent",s:"#e8b796",d:"#c4896b",w:"#a0654d",
  H:"#5c3a1e",h:"#7a5230",B:"#d4a843",e:"#1a1a2e",W:"#f0e8dc",r:"#3d2512",
  m:"#8b3a3a",M:"#5c1e1e",g:"#4a6741",G:"#364d30",b:"#8b2020",n:"#6b1515",
  c:"#c9a84c",C:"#a08530",f:"#5c3a1e",F:"#3d2512",x:"#7a5570",k:"#8b3a3a",
  D:"#c4a882",t:"#b8d4e8",
};

const B_H="....HHHHHH....."+"...HhHHHHhH...."+"..HhHHHHHHhH..."+"..BBBBBBBBBB..."+"...sssssssss..."+"..sssssssssss.."+"..sWesssseWs..."+"..ssesssssess.."+"..ssssddsssss.."+"..ssssddsssss.."+"..sfssmmssfs..."+"..sffssmssff..."+"...sssssssss..."+"...dsssssssd..."+"....ggggggg...."+"...gGgggggGg...";
const B_T="....HHHHHH....."+"...HhHHHHhH...."+"..HhHHHHHHhH..."+"..BBBBBBBBBB..."+"...ddsssssdd..."+"..sssssssssss.."+"..dWesssseWd..."+"..ssesssssess.."+"..ssssddsssss.."+"..ssssddsssss.."+"..sfssmmssfs..."+"..sffsssssff..."+"...sssssssss..."+"...dsssssssd..."+"....ggggggg...."+"...gGgggggGg...";
const B_W="....HHHHHH....."+"...HhHHHHhH...."+"..HhHHHHHHhH..."+"..BBBBBBBBBB..."+"...ddsssssdd..."+"..ddsssssssdd.."+"..dWesssseWd..."+"..ssesssssess.."+"..xsssddsssxs.."+"..ssssddsssss.."+"..sfsMMMssfs..."+"..sffsssssff..."+"...sssssssss..."+"...wssssssswt.."+"....ggggggg...."+"...gGgggggGg...";
const B_D="....HHHHHH....."+"...HhHHHHhH...."+"..HhHHHHHHhH..."+"..BBBBBBBBBB..."+"...xxsssssxx..."+"..xxsssssssxx.."+"..xWesssseWx..."+"..ssesssssess.."+"..xkssddssskx.."+"..ssssddsssss.."+"..sfMMMMMsfs..."+"..sFfsssssFs..."+"...wswswswsw..."+"...wssssssswt.."+"....ggggggg...."+"...gGgggggGg...";
const S_H="................"+"....rrrrrrr....."+"...rrrrrrrrr...."+"..rrrsssssrrr..."+"..rrsssssssrr..."+"..ssssssssssss.."+"..sWesssseWs..."+"..ssesssssess.."+"..sssssssssss.."+"..ssssddsssss.."+"..ssssmmsssss.."+"..ssssssssss..."+"...bbbbbbbbb..."+"...bnbbbbbbn..."+"....ggggggg...."+"...gGgggggGg...";
const S_T="................"+"....rrrrrrr....."+"...rrrrrrrrr...."+"..rrrsssssrrr..."+"..rrsssssssrr..."+"..ddsssssssdd.."+"..dWesssseWd..."+"..ssesssssess.."+"..sssssssssss.."+"..ssssddsssss.."+"..ssssmmsssss.."+"..ssssssssss..."+"...bbbbbbbbb..."+"...bnbbbbbbn..."+"....ggggggg...."+"...gGgggggGg...";
const S_W="................"+"....rrrrrrr....."+"...rrrrrrrrr...."+"..rrrsssssrrr..."+"..rrdsssssdrrr.."+"..ddsssssssdd.."+"..dWesssseWd..."+"..ssesssssess.."+"..xssssssssxs.."+"..ssssddsssss.."+"..sssMMMsssss.."+"..ssssssssss..."+"...bbbbbbbbb..."+"...bnbbbbbbn..."+"....ggggggg...."+"...gGgggggGg...";
const S_D="................"+"....rrrrrrr....."+"...rrrrrrrrr...."+"..rrrxsssxrrr..."+"..rrxsssssxrr..."+"..xxsssssssxx.."+"..xWesssseWx..."+"..ssesssssess.."+"..xkssssssskx.."+"..ssssddsssss.."+"..ssMMMMMssss.."+"..wsswssswss..."+"...bbbbbbbbb..."+"...bnbbbbbbn..."+"....ggggggg...."+"...gGgggggGg...";
const CK_H="................"+"....HHHHHH....."+"...HHHHHHHH...."+"..HHHHHHHHHH..."+"...sssssssss..."+"..sssssssssss.."+"..sWesssseWs..."+"..ssesssssess.."+"..ssssddsssss.."+"..sssssssssss.."+"..ssssmmsssss.."+"..sssssssssss..."+"...ccccccccc..."+"...cCcccccCc..."+"....ccccccc...."+"...cCcccccCc...";
const CK_T="................"+"....HHHHHH....."+"...HHHHHHHH...."+"..HHHHHHHHHH..."+"...ddsssssdd..."+"..sssssssssss.."+"..dWesssseWd..."+"..ssesssssess.."+"..ssssddsssss.."+"..sssssssssss.."+"..ssssmmsssss.."+"..sssssssssss..."+"...ccccccccc..."+"...cCcccccCc..."+"....ccccccc...."+"...cCcccccCc...";
const CK_W="................"+"....HHHHHH....."+"...HHHHHHHH...."+"..HHHHHHHHHH..."+"...ddsssssdd..."+"..ddsssssssdd.."+"..dWesssseWd..."+"..ssesssssess.."+"..xsssddsssxs.."+"..sssssssssss.."+"..ssMMMMMssss.."+"..sssssssssss..."+"...ccccccccc..."+"...cCcccccCc..."+"....ccccccc...."+"...cCcccccCc...";
const CK_D="................"+"....HHHHHH....."+"...HHHHHHHH...."+"..HHHHHHHHHH..."+"...xxsssssxx..."+"..xxsssssssxx.."+"..xWesssseWx..."+"..ssesssssess.."+"..xkssddssskx.."+"..sssssssssss.."+"..sMMMMMMMsss.."+"..wswswswsww..."+"...ccccccccc..."+"...cCcccccCc..."+"....ccccccc...."+"...cCcccccCc...";
const WR_H="...HHHHHHHHH..."+"..HhHHHHHHhH..."+"..HhHHHHHHhH..."+"..BBBBBBBBBB..."+"...sssssssss..."+"..sssssssssss.."+"..sWesssseWs..."+"..ssesssssess.."+"..ssssddsssss.."+"..sssssssssss.."+"..ssssmmsssss.."+"..sssssssssss..."+"...sssssssss..."+"...dsssssssd..."+"....ggggggg...."+"...gGgggggGg...";
const WR_T="...HHHHHHHHH..."+"..HhHHHHHHhH..."+"..HhHHHHHHhH..."+"..BBBBBBBBBB..."+"...ddsssssdd..."+"..sssssssssss.."+"..dWesssseWd..."+"..ssesssssess.."+"..ssssddsssss.."+"..sssssssssss.."+"..ssssmmsssss.."+"..sssssssssss..."+"...sssssssss..."+"...dsssssssd..."+"....ggggggg...."+"...gGgggggGg...";
const WR_W="...HHHHHHHHH..."+"..HhHHHHHHhH..."+"..HhHHHHHHhH..."+"..BBBBBBBBBB..."+"...ddsssssdd..."+"..ddsssssssdd.."+"..dWesssseWd..."+"..ssesssssess.."+"..xsssddsssxs.."+"..sssssssssss.."+"..sssMMMsssss.."+"..sssssssssss..."+"...sssssssss..."+"...wssssssswt.."+"....ggggggg...."+"...gGgggggGg...";
const WR_D="...HHHHHHHHH..."+"..HhHHHHHHhH..."+"..HhHHHHHHhH..."+"..BBBBBBBBBB..."+"...xxsssssxx..."+"..xxsssssssxx.."+"..xWesssseWx..."+"..ssesssssess.."+"..xkssddssskx.."+"..sssssssssss.."+"..sMMMMMMMsss.."+"..wswswswsww..."+"...wswswswsw..."+"...wssssssswt.."+"....ggggggg...."+"...gGgggggGg...";
const PT_H="....HHHHHH....."+"...HhHHHHhH...."+"..HHHHHHHHHH..."+"..BBBBBBBBBB..."+"...sssssssss..."+"..sssssssssss.."+"..sWesssseWs..."+"..ssesssssess.."+"..ssssddsssss.."+"..sssssssssss.."+"..ssssmmsssss.."+"...sssssssss..."+"...bbbbbbbbb..."+"...bnbbbbbbn..."+"....ggggggg...."+"...gGgggggGg...";
const PT_T="....HHHHHH....."+"...HhHHHHhH...."+"..HHHHHHHHHH..."+"..BBBBBBBBBB..."+"...DDsssssDD..."+"..DDsssssssDD.."+"..DWesssseWD..."+"..ssesssssess.."+"..ssssddsssss.."+"..sssssssssss.."+"..ssssmmsssss.."+"...sssssssss..."+"...bbbbbbbbb..."+"...bnbbbbbbn..."+"....ggggggg...."+"...gGgggggGg...";
const PT_W="....HHHHHH....."+"...HhHHHHhH...."+"..HHHHHHHHHH..."+"..BBBBBBBBBB..."+"...DDdsssdDD..."+"..DDdsssssdDD.."+"..DWesssseWD..."+"..ssesssssess.."+"..bbbbbbbbbbb.."+"..bnbbbbbbbbn.."+"..bbbbbbbbbbb.."+"...bbbbbbbbb..."+"...bbbbbbbbb..."+"...bnbbbbbbn..."+"....ggggggg...."+"...gGgggggGg...";
const PT_D="....HHHHHH....."+"...HhHHHHhH...."+"..HHHHHHHHHH..."+"..BBBBBBBBBB..."+"...xxdsssdxx..."+"..xxdsssssdxx.."+"..xWesssseWx..."+"..ssesssssess.."+"..bbbbbbbbbbb.."+"..bnbbbbbbbbn.."+"..bbbbbbbbbbb.."+"...bbbbbbbbb..."+"...bbbbbbbbb..."+"...bnbbbbbbn..."+"....ggggggg...."+"...gGgggggGg...";
const HD_H="................"+"....HHHHHH....."+"...HHHHHHHH...."+"..BBBBBBBBBB..."+"...sssssssss..."+"..sssssssssss.."+"..sWesssseWs..."+"..ssesssssess.."+"..ssssddsssss.."+"..sssssssssss.."+"..ssssmmsssss.."+"...sssssssss..."+"...sssssssss..."+"...dsssssssd..."+"....ggggggg...."+"...gGgggggGg...";
const HD_S="................"+"....HHHHHH....."+"...HHHHHHHH...."+"..BBBBBBBBBB..."+"...ddsssssdd..."+"..sssssssssss.."+"..dWesssseWd..."+"..ssesssssess.."+"..ssssddsssss.."+"..sssssssssss.."+"..ssssmmsssss.."+"...sssssssss..."+"...sssssssss..."+"...dsssssssd..."+"....ggggggg...."+"...gGgggggGg...";
const HD_K="................"+"....HHHHHH....."+"...HHHHHHHH...."+"..BBBBBBBBBB..."+"...ddsssssdd..."+"..ddsssssssdd.."+"..dWesssseWd..."+"..ssesssssess.."+"..xsssddsssxs.."+"..sssssssssss.."+"..sssMMMsssss.."+"...wsswsswss..."+"...sssssssss..."+"...wssssssswt.."+"....ggggggg...."+"...gGgggggGg...";
const HD_G="................"+"....HHHHHH....."+"...HHHHHHHH...."+"..BBBBBBBBBB..."+"...xxsssssxx..."+"..xxwssssswxx.."+"..xWesssseWx..."+"..ssesssssess.."+"..xkwsddsxkxs.."+"..wsssssssssw.."+"..wMMMMMMMwww.."+"...wswswswsw..."+"...wswswswsw..."+"...wssssssswt.."+"....ggggggg...."+"...gGgggggGg...";

interface FL { threshold: number; sprite: string; label: string; }
const FACES: Record<string, FL[]> = {
  boss:[{threshold:70,sprite:B_H,label:"Confident"},{threshold:45,sprite:B_T,label:"Wary"},{threshold:20,sprite:B_W,label:"Worried"},{threshold:0,sprite:B_D,label:"Desperate"}],
  scout:[{threshold:70,sprite:S_H,label:"Sharp"},{threshold:45,sprite:S_T,label:"Cautious"},{threshold:20,sprite:S_W,label:"Rattled"},{threshold:0,sprite:S_D,label:"Gone"}],
  cook:[{threshold:60,sprite:CK_H,label:"Fed"},{threshold:35,sprite:CK_T,label:"Scraping"},{threshold:15,sprite:CK_W,label:"Empty"},{threshold:0,sprite:CK_D,label:"Nothing"}],
  wrangler:[{threshold:70,sprite:WR_H,label:"Strong"},{threshold:45,sprite:WR_T,label:"Thin"},{threshold:20,sprite:WR_W,label:"Lame"},{threshold:0,sprite:WR_D,label:"Afoot"}],
  point:[{threshold:70,sprite:PT_H,label:"Steady"},{threshold:45,sprite:PT_T,label:"Dusty"},{threshold:20,sprite:PT_W,label:"Masked"},{threshold:0,sprite:PT_D,label:"Losing"}],
  hand:[{threshold:80,sprite:HD_H,label:"Full crew"},{threshold:55,sprite:HD_S,label:"Short"},{threshold:30,sprite:HD_K,label:"Skeleton"},{threshold:0,sprite:HD_G,label:"Bones"}],
};
function gf(set:FL[],v:number):FL{for(const f of set){if(v>=f.threshold)return f;}return set[set.length-1];}

function PixelFace({spriteData,size=48}:{spriteData:string;size?:number}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const c=ref.current;if(!c)return;const ctx=c.getContext("2d")!;const px=size/16;
    ctx.clearRect(0,0,size,size);
    for(let i=0;i<spriteData.length;i++){
      const ch=spriteData[i];if(ch==="."||ch===" ")continue;
      const color=FC[ch];if(!color||color==="transparent")continue;
      ctx.fillStyle=color;ctx.fillRect((i%16)*px,Math.floor(i/16)*px,px,px);
    }
  },[spriteData,size]);
  return <canvas ref={ref} width={size} height={size} style={{imageRendering:"pixelated",width:size,height:size}}/>;
}

// ═══════════════════════════════════════════════════════════════
// ANIMATED PRAIRIE SCENE 
// ═══════════════════════════════════════════════════════════════

function PrairieScene({ progress, pace }: { progress: number; pace: string; turn: number }) {
  const speed = pace === "push" ? "12s" : pace === "normal" ? "20s" : "35s";
  const miLabel = progress < 10 ? "San Antonio" : progress > 90 ? "Abilene" : `${Math.round(progress * 8)} mi`;

  return (
    <div className="relative w-full overflow-hidden rounded-b border-b border-stone-700" style={{ height: 180 }}>
      <div className="absolute inset-0" style={{ backgroundImage: `url(/faces/bg_sky.png)`, backgroundSize: "cover", backgroundPosition: "center bottom", imageRendering: "pixelated" }} />
      <div className="absolute bottom-0 left-0 right-0" style={{ height: 60, backgroundImage: `url(/faces/fg_cattle.png)`, backgroundSize: "auto 100%", backgroundRepeat: "repeat-x", backgroundPosition: "bottom", animation: `bgScroll ${speed} linear infinite, cattleBob 0.6s ease-in-out infinite`, imageRendering: "pixelated" }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(transparent 60%, rgba(0,0,0,0.3) 100%)" }} />
      <div className="absolute bottom-1 left-2 text-xs font-bold" style={{ color: "#d4a843", opacity: 0.85, fontFamily: "monospace" }}>{Math.round(progress)}%</div>
      <div className="absolute bottom-1 right-2 text-xs font-bold" style={{ color: "#d4a843", opacity: 0.85, fontFamily: "monospace" }}>{miLabel}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// OUTFIT SCREEN
// ═══════════════════════════════════════════════════════════════

const OUTFIT_BUDGET = 2000;
const BASE_CREW = 8;
const BASE_HORSES = 30;
const BASE_SUPPLIES = 35;
const COST_COWBOY = 80;
const COST_HORSE = 25;
const COST_SUPPLY = 3;
const COST_GUN = 20;
const COST_SPAREPARTS = 15;
const WAGE_COST: Record<string, number> = { low: 0, standard: 120, good: 280 };
const WAGE_MORALE: Record<string, number> = { low: 35, standard: 50, good: 68 };
const HERD_OPTIONS = [1500, 2000, 2500, 3000, 3500];

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
  const [wages, setWages] = useState<"low" | "standard" | "good">("standard");

  const herd = HERD_OPTIONS[herdIdx];
  const crew = BASE_CREW + extraCrew;
  const horses = BASE_HORSES + extraHorses;
  const supplies = BASE_SUPPLIES + extraSupplies;
  const spent = extraCrew * COST_COWBOY + extraHorses * COST_HORSE + extraSupplies * COST_SUPPLY + guns * COST_GUN + spareParts * COST_SPAREPARTS + WAGE_COST[wages];
  const remaining = OUTFIT_BUDGET - spent;
  const rating = getCrewRating(herd, crew);
  const horsesPerCowboy = (horses / crew).toFixed(1);
  const potentialValue = herd * 40;

  return (
    <div className="h-screen bg-stone-900 text-stone-100 flex flex-col overflow-hidden" style={{ fontFamily: "'Georgia', serif" }}>
      <div className="flex-shrink-0 bg-stone-800">
        <div className="max-w-lg mx-auto">
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
            onClick={() => onDone({ herd, crew, horses, supplies, guns, spareParts, wages, budgetSpent: spent, startingCash: Math.max(0, remaining) })}
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
function clampR(k:string,v:number):number{const m:Record<string,number>={herd:3500,crew:18,horses:60,ammo:200,spareParts:10};return clamp(v,0,m[k]||100);}

// ═══════════════════════════════════════════════════════════════
// ALL 17 EVENTS
// ═══════════════════════════════════════════════════════════════

const EVENTS:GameEvent[]=[
{id:"river_crossing_early",phase_min:0,phase_max:0.3,weight:5,title:"River Crossing \u2014 The Brazos",text:"You reach the flooded Brazos River. A bad crossing can drown cattle, lose horses, and slow your drive.",trivia:["Trail drives often paused at rivers because one bad crossing could scatter a herd.","Historians think scouts tested water depth on horseback before moving cattle."],sageAdvice:[{name:"Nina",role:"Trail scout",line:"Watch the current first. Fast water can pull calves away from the herd."},{name:"Mr. Redford",role:"Old trail hand",line:"A slower crossing can save many cattle. Patience is a trail skill."}],choices:[{text:"Take the wide ford. Half a day lost but safer.",outcomes:[{weight:6,effects:{herdCondition:-2},result:"The wide ford works. Water up to the cattle\u2019s bellies but they cross steady. Boring success \u2014 the best kind."},{weight:4,effects:{herd:-30,herdCondition:-4,horses:-2},result:"The \u2018safe\u2019 ford has a sinkhole. Thirty head drown. Two horses go down."}]},{text:"Cross here. Deep but narrow \u2014 fast.",outcomes:[{weight:5,effects:{herd:-60,morale:-6,horses:-3},result:"Too deep. Current catches the middle of the herd. Sixty head gone."},{weight:5,effects:{herd:-8,morale:4},result:"Your lead steer walks straight in and the herd follows. Eight head swept away."}]},{text:"Wait a day. Let the river drop.",outcomes:[{weight:5,effects:{supplies:-4,herdCondition:3,herd:-5},result:"River drops overnight. Easy crossing. Patience pays."},{weight:5,effects:{supplies:-4,herd:-80,morale:-8},result:"It rains again. River rises. Eighty head gone."}]}]},
{id:"stampede_night",phase_min:0,phase_max:0.8,weight:5,title:"Stampede \u2014 Lightning",text:"Lightning hits near camp at night. If the herd stampedes, you can lose cattle, riders, and distance.",choices:[{text:"Ride to the front. Turn the leaders.",outcomes:[{weight:5,effects:{herd:-40,horses:-2,morale:-3},result:"You turn them into a wide circle by dawn. Forty head over a bluff."},{weight:3,effects:{herd:-15,morale:5,herdCondition:-3},result:"Your best rider turns the lead steer hard. Fifteen scattered. The crew cheers loudly."},{weight:2,effects:{herd:-20,crew:-1,morale:-10,horses:-1},result:"A horse hits a prairie dog hole at full gallop in the dark. Horse and rider go down."}]},{text:"Hold position. Protect the camp.",effects:{herd:-150,morale:-5},result:"You let them run. A hundred fifty head just gone."},{text:"Get every rider out singing.",outcomes:[{weight:4,effects:{herd:-20,morale:3,herdCondition:-2},result:"Cowboys singing \u2018Lorena\u2019 in a thunderstorm. Twenty head gone but the herd settles."},{weight:6,effects:{herd:-100,morale:-6,herdCondition:-5},result:"Too far gone. Herd splits three ways. A hundred head scattered."}]}]},
{id:"water_scarce",phase_min:0.2,phase_max:0.7,weight:5,title:"Dry Country",text:"You have gone two days without water. If you guess wrong now, cattle and horses can die fast.",choices:[{text:"Push through fast.",outcomes:[{weight:5,effects:{herd:-50,herdCondition:-8,morale:-4,horses:-3},result:"Cattle stagger. Calves drop. Fifty head didn\u2019t make it."},{weight:5,effects:{herd:-20,herdCondition:-4,morale:3},result:"Scout signals river ahead by evening. Twenty lost to heat. The rest drink."}]},{text:"Slow down. Look for water.",outcomes:[{weight:4,effects:{supplies:-6,herd:-30,herdCondition:-3,morale:-5},result:"Extra day of suffering. Thirty dead."},{weight:6,effects:{herdCondition:-2,supplies:-3,herd:-8,morale:4},result:"Scout finds an underground seep. Eight head lost."}]},{text:"Night drive. Move in the cool.",outcomes:[{weight:5,effects:{herd:-25,morale:-5,herdCondition:-3},result:"Twenty-five walk off a cutbank in the dark."},{weight:5,effects:{herd:-10,morale:2,herdCondition:1,horses:-1},result:"It works. By dawn you see trees \u2014 water."}]}]},
{id:"rustlers",phase_min:0.3,phase_max:0.8,weight:4,title:"Riders on the Ridge",text:"Unknown riders shadow your herd. If trouble starts, you may lose cattle, gear, or crew health.",choices:[{text:"Arm up and ride out.",outcomes:[{weight:5,effects:{morale:5,herdCondition:-2},result:"They are another trail crew, not rustlers. Morale rises."},{weight:5,effects:{morale:-3,crew:-1,supplies:-2},result:"They scatter but one puts a rifle shot through your flank rider\u2019s shoulder."}]},{text:"Circle tight and post guards.",effects:{herdCondition:-4,morale:-3,supplies:-2},result:"They disappear at sundown. You\u2019ll never know what they were."},{text:"Ignore them. Keep driving.",outcomes:[{weight:4,effects:{herd:-200,morale:-12,horses:-4},result:"They hit at dawn. 200 head gone."},{weight:6,effects:{morale:2},result:"They drift away by evening, and danger passes."}]}]},
{id:"crew_quit",phase_min:0.3,phase_max:0.7,weight:4,title:"Two Hands Give Notice",text:"Two hands want to quit before dawn. Fewer riders means slower travel and weaker herd control.",choices:[{text:"Let them go.",effects:{crew:-2,morale:-3},result:"They ride out at dawn."},{text:"Offer double wages.",outcomes:[{weight:6,effects:{supplies:-5,morale:3},result:"Double pay keeps them."},{weight:4,effects:{crew:-2,morale:-6},result:"\u2018It is not about money.\u2019"}]},{text:"Remind them they signed a contract.",effects:{morale:-8},result:"They stay, but morale drops and teamwork suffers."}]},
{id:"indian_territory",phase_min:0.4,phase_max:0.7,weight:5,title:"Indian Territory",text:"You enter Nations land and must pay a legal toll. The choice affects herd safety and supplies.",choices:[{text:"Pay the toll. It\u2019s their land.",effects:{morale:-3,herdCondition:2,herd:-250},result:"250 head equivalent. The toll bought intelligence and escort."},{text:"Negotiate. Offer five cents.",outcomes:[{weight:5,effects:{morale:1,herdCondition:1,herd:-175},result:"Seven cents. 175 head. Fair."},{weight:5,effects:{morale:-5,herdCondition:-3,herd:-50,supplies:-4},result:"No escort. Bad crossing. The toll was cheaper than ignorance."}]},{text:"Refuse. Push through.",outcomes:[{weight:3,effects:{morale:4,herdCondition:-4},result:"No attack comes, but your crew stays tense and tired."},{weight:7,effects:{herd:-300,morale:-8,horses:-5,crew:-1,herdCondition:-6},result:"Ambush at a river crossing. 300 head gone. A cowboy takes an arrow."}]}]},
{id:"cook_wagon",phase_min:0.1,phase_max:0.6,weight:4,title:"Busted Axle",text:"Your chuck wagon axle breaks. Without food and tools, morale drops and repairs cost time.",choices:[{text:"Full stop. Repair. Whole day.",effects:{supplies:-3,herdCondition:-3,morale:1},result:"Cottonwood replacement axle. The cook makes coffee and the crew forgives."},{text:"Rig a temporary fix.",outcomes:[{weight:5,effects:{morale:-2,supplies:-2},result:"Holds three days then fails in a creek. Half your flour ruined."},{weight:5,effects:{morale:2},result:"Holds all the way. Sometimes the quick fix is the right fix."}]},{text:"Abandon the wagon.",effects:{supplies:-15,morale:-10,horses:-3},result:"Cold jerky and creek water for every meal. This is survival now."}]},
{id:"good_grass",phase_min:0.1,phase_max:0.8,weight:3,title:"Paradise Valley",text:"Your scout finds rich grass and clean water. Resting helps herd health but costs precious days.",choices:[{text:"Two days\u2019 rest.",effects:{herdCondition:10,morale:6,supplies:-5,horses:2},result:"The herd recovers well, and the crew feels strong again."},{text:"One day.",effects:{herdCondition:5,morale:3,supplies:-3},result:"Enough to take the edge off."},{text:"Keep moving.",outcomes:[{weight:5,effects:{morale:-6,herdCondition:-2},result:"The crew is disappointed as you move on."},{weight:5,effects:{morale:-3,herdCondition:-1},result:"Soon after, a crossing appears and morale steadies."}]}]},
{id:"river_red",phase_min:0.35,phase_max:0.55,weight:5,title:"The Red River",text:"You face the wide Red River. A poor plan can sweep cattle away and ruin your schedule.",choices:[{text:"Scout downstream.",outcomes:[{weight:5,effects:{supplies:-4,herd:-15,herdCondition:-1},result:"Better crossing found. Fifteen lost. Patience paid."},{weight:5,effects:{supplies:-6,morale:-3,herd:-40},result:"Nothing better. Forty head gone."}]},{text:"Cross here and now.",outcomes:[{weight:4,effects:{herd:-80,morale:-6,horses:-4,crew:-1},result:"The crossing turns chaotic. You lose eighty head and one rider."},{weight:6,effects:{herd:-25,morale:4},result:"The lead steer holds course. You lose twenty-five head but cross safely."}]},{text:"Wait for another outfit. Watch and learn.",outcomes:[{weight:5,effects:{supplies:-5,herd:-10,morale:2},result:"Watch their mistakes. Cross clean. Ten head \u2014 a miracle for the Red."},{weight:5,effects:{supplies:-8,morale:-5,herdCondition:-3},result:"No one arrives. You lose two days and supplies."}]}]},
{id:"snakebite",phase_min:0,phase_max:0.8,weight:3,title:"Rattler",text:"A snake bites your best roper. Treatment choice affects crew health and herd control.",choices:[{text:"Cut and suck.",outcomes:[{weight:5,effects:{morale:-3,crew:-1},result:"The treatment fails, and you lose a crew member."},{weight:5,effects:{morale:2,herdCondition:-2},result:"By day four, he can sit up and recover slowly."}]},{text:"Send a rider for medicine.",effects:{crew:-1,morale:-2,herdCondition:-3,supplies:-4},result:"You are short on riders, and the medicine comes too late."},{text:"Tourniquet, whiskey, chuck wagon.",effects:{morale:-1,herdCondition:-2},result:"He makes it. Barely. He\u2019ll tell this story for fifty years."}]},
{id:"tornado",phase_min:0.2,phase_max:0.7,weight:3,title:"Green Sky",text:"Dark clouds spin on the horizon. You have minutes to protect crew, horses, and herd.",choices:[{text:"Scatter the herd.",outcomes:[{weight:5,effects:{herd:-60,morale:-4,herdCondition:-5},result:"Twister hits where the herd was. Sixty gone but the bulk survived."},{weight:5,effects:{herd:-30,morale:4},result:"Misses by a mile. Too close."}]},{text:"Hold tight. Low ground.",outcomes:[{weight:4,effects:{herd:-200,crew:-1,horses:-6,morale:-12},result:"Direct hit. 200 gone. A cowboy thrown."},{weight:6,effects:{herd:-20,morale:2,herdCondition:-3},result:"Low ground saves you. Twenty caught. Lucky everything."}]},{text:"Ride south.",effects:{herd:-40,herdCondition:-6,morale:-5,supplies:-3},result:"Cattle fight you every step. Forty scatter. But you\u2019re alive."}]},
{id:"competition",phase_min:0.3,phase_max:0.8,weight:3,title:"Competition",text:"A larger herd races toward Abilene. Arriving late could lower your sale price and final score.",choices:[{text:"Push hard. Outpace them.",effects:{herdCondition:-8,morale:-3,supplies:-5,horses:-3},result:"Cattle drop weight. But you pull ahead."},{text:"Hold pace. Fat cattle sell higher.",outcomes:[{weight:6,effects:{morale:-2},result:"They pass you. But your cattle are fat."},{weight:4,effects:{morale:3},result:"They push too hard. Stampede. Tortoise and the hare."}]},{text:"Send a rider to lock in a price.",effects:{crew:-1,morale:2},result:"Sharpest man, fastest horse, letter of intent."}]},
{id:"prairie_fire",phase_min:0.1,phase_max:0.6,weight:3,title:"Smoke on the Horizon",text:"A prairie fire moves toward your trail. Wrong timing can trap cattle in smoke and heat.",choices:[{text:"Set a backfire.",outcomes:[{weight:6,effects:{herd:-20,herdCondition:-3,morale:2},result:"Scout burns a strip. Twenty bolt. Professional work."},{weight:4,effects:{herd:-80,morale:-6,herdCondition:-5},result:"Backfire gets away. Fire on TWO sides. Eighty gone."}]},{text:"Drive east. Outflank it.",effects:{herdCondition:-5,morale:-3,supplies:-3,herd:-15},result:"Fire slides past. Fifteen scatter."},{text:"Find water.",outcomes:[{weight:4,effects:{herd:-5,morale:5,herdCondition:2},result:"Wide creek. Herd stands belly-deep while the world burns."},{weight:6,effects:{herd:-40,morale:-4,herdCondition:-4},result:"No creek. Forty head lost in the smoke."}]}]},
{id:"buyer",phase_min:0.7,phase_max:0.95,weight:4,title:"A Buyer on the Trail",text:"A buyer offers cash today at a lower price. Waiting may earn more, but risk grows each day.",choices:[{text:"Take the deal.",effects:{morale:8},result:"$30 a head. You left $25,000 on the table. But you\u2019re done.",earlyEnd:true},{text:"Counter at $35.",outcomes:[{weight:5,effects:{morale:6},result:"\u2018$33.\u2019 Done today.",earlyEnd:true},{weight:5,effects:{morale:-2},result:"\u2018$30 is the offer.\u2019 He rides on."}]},{text:"Refuse.",outcomes:[{weight:5,effects:{morale:4},result:"\u2018Your herd, your call.\u2019"},{weight:5,effects:{morale:-3},result:"That night a hand says Abilene prices dropped to $28."}]}]},
{id:"horse_thief",phase_min:0.2,phase_max:0.6,weight:3,title:"Missing Horses",text:"Eight horses are missing at dawn. Without mounts, scouts and guards cannot cover the herd.",choices:[{text:"Send riders after them.",outcomes:[{weight:5,effects:{morale:4,herdCondition:-3},result:"Horses back. One cowboy shot in the arm."},{weight:5,effects:{horses:-8,morale:-2,herdCondition:-4},result:"Lost the trail. Eight horses gone."}]},{text:"Let them go.",effects:{horses:-8,morale:-6},result:"A trail boss who won\u2019t fight for his remuda."},{text:"Double the watch.",effects:{horses:-8,morale:-4,herdCondition:-2},result:"Horses are safer, but the crew grows very tired."}]},
{id:"fever",phase_min:0.25,phase_max:0.7,weight:3,title:"Tick Fever",text:"Tick fever appears in your herd. Act now, or sickness spreads and many cattle die.",choices:[{text:"Cut the sick ones.",effects:{herd:-36,morale:-2,herdCondition:4},result:"Thirty-six left standing. The fever stops."},{text:"Treat on the move.",outcomes:[{weight:5,effects:{herd:-100,herdCondition:-8,morale:-6,supplies:-4},result:"The fever spreads. You lose one hundred head."},{weight:5,effects:{herd:-15,herdCondition:-2,supplies:-4},result:"The treatment helps some cattle, but fifteen are lost."}]},{text:"Push hard. Outrun the ticks.",effects:{herdCondition:-6,herd:-50,morale:-4,horses:-2},result:"The disease keeps spreading, and fifty cattle die."}]},
// 🔴 NEW PUSH YOUR LUCK EVENT ADDED HERE 🔴
{
  id: "stray_longhorns",
  phase_min: 0.1,
  phase_max: 0.8,
  weight: 6,
  type: "push_luck",
  title: "Stray Longhorns in the Brush",
  text: "Scout spotted a dozen unbranded longhorns deep in a thicket of mesquite and prickly pear. Pulling them out will take time, and the brush is thick with rattlers and broken ground.",
  leaveText: "Leave them. We have enough trouble.",
  attempts: [
    {
      id: "stray_1",
      buttonText: "Rope the easy ones on the edge",
      successText: "Got three head without much fuss. Added to the herd.",
      failureText: "A steer bolted and caught a horse in the ribs. Had to let them go.",
      riskChance: 0.10,
      rewards: { herd: 3, morale: 2 },
      penalties: { horses: -1, morale: -2 }
    },
    {
      id: "stray_2",
      buttonText: "Push deeper into the thicket",
      successText: "Hauled out five more. The crew is getting scratched to hell, but it's free money.",
      failureText: "Rattlesnake spooked a horse. Rider thrown into a cactus, horse lame. Total mess.",
      riskChance: 0.35,
      rewards: { herd: 5, morale: 5 },
      penalties: { horses: -1, herdCondition: -5, morale: -8 }
    },
    {
      id: "stray_3",
      buttonText: "Dismount and flush out the last few",
      successText: "Dragged the last four out by their horns. A perfect haul, worth an extra $160 in Abilene.",
      failureText: "Ambushed by a feral bull hiding in the brush. One cowboy gored, two horses scattered. A disaster.",
      riskChance: 0.65,
      rewards: { herd: 4, morale: 10 },
      penalties: { crew: -1, horses: -2, morale: -15, herdCondition: -10 }
    }
  ]
},
{
  id: "abandoned_homestead",
  phase_min: 0.2,
  phase_max: 0.7,
  weight: 5,
  type: "push_luck",
  title: "Abandoned Homestead",
  text: "Your scout found a homestead that's been empty since the war. The root cellar door is still shut, and there's a corral out back with what looks like a few stray horses. Could be supplies in there — could be trouble.",
  leaveText: "Leave it. Other men's property, other men's problems.",
  attempts: [
    {
      id: "homestead_1",
      buttonText: "Check the corral for horses",
      successText: "Two sound horses, abandoned and half-wild. Your wrangler ropes them clean.",
      failureText: "A longhorn kicks your wrangler. You gain nothing and lose morale.",
      riskChance: 0.15,
      rewards: { horses: 2, morale: 3 },
      penalties: { morale: -3, herdCondition: -2 }
    },
    {
      id: "homestead_2",
      buttonText: "Pry open the root cellar",
      successText: "You find salt pork, dried beans, and coffee. The camp has enough food again.",
      failureText: "The door was wedged for a reason — a rattlesnake den. One cowboy bitten before you slam it shut.",
      riskChance: 0.40,
      rewards: { supplies: 12, morale: 8 },
      penalties: { crew: -1, morale: -6 }
    },
    {
      id: "homestead_3",
      buttonText: "Search the house itself",
      successText: "A hidden strongbox under the floorboards. Gold coins, a Winchester, and a letter that'll never reach anyone. Fortune favors the bold.",
      failureText: "The floor gives way. A cowboy falls through into a collapsed cellar. Broken leg, broken morale, broken everything.",
      riskChance: 0.70,
      rewards: { supplies: 8, morale: 15, herd: 5 },
      penalties: { crew: -1, horses: -1, morale: -12, herdCondition: -8 }
    }
  ]
}
];

// ═══════════════════════════════════════════════════════════════
// CONSTANTS & HELPERS
// ═══════════════════════════════════════════════════════════════

const TOTAL_DAYS=125,DAYS_PER_TURN=5,TOTAL_DISTANCE=800;
const INIT_R:Resources={herd:2500,crew:12,horses:60,supplies:65,morale:55,herdCondition:60};
const PACES=[
  {id:"easy",label:"Easy",desc:"5 mi/day \u00b7 Herd fattens",mpd:5,fx:{herdCondition:2,morale:1,supplies:-1}as Resources},
  {id:"normal",label:"Normal",desc:"7 mi/day \u00b7 Standard",mpd:7,fx:{herdCondition:-1,morale:-1,supplies:-2}as Resources},
  {id:"push",label:"Push",desc:"10 mi/day \u00b7 Brutal",mpd:10,fx:{herdCondition:-5,morale:-4,supplies:-3}as Resources},
];
function getPhrase(p:number):string{
  if(p<0.15)return"Eight hundred miles of dust and trouble ahead.";
  if(p<0.3)return"Days blur. Dust, cattle, sky. Repeat.";
  if(p<0.5)return"Indian Territory looms. Crew gets quiet.";
  if(p<0.7)return"Past halfway. Kansas might be real.";
  if(p<0.85)return"Grass is changing. Cooler nights.";
  if(p<0.95)return"Scout says he can smell Abilene.";
  return"The railhead is close.";
}
function getGrade(h:number,s:boolean):string{if(!s)return"F";const p=h/2500;if(p>=0.95)return"A";if(p>=0.88)return"B";if(p>=0.80)return"C";if(p>=0.70)return"D";return"F";}
function getGrade2(h:number,started:number,s:boolean):string{if(!s)return"F";const p=h/started;if(p>=0.95)return"A";if(p>=0.88)return"B";if(p>=0.80)return"C";if(p>=0.70)return"D";return"F";}
function getTrailGrade(survived: boolean, herdPct: number, historicalKnowledge: number): string {
  if (!survived) return herdPct > 0.5 ? "D" : "F";
  const herdScore = Math.min(herdPct / 0.95, 1) * 50;
  const survivalScore = 20;
  const knowledgeScore = Math.min(historicalKnowledge / 30, 1) * 30;
  const total = herdScore + survivalScore + knowledgeScore;
  if (total >= 85) return "A+";
  if (total >= 75) return "A";
  if (total >= 65) return "B";
  if (total >= 50) return "C";
  return "D";
}
const GC:Record<string,string>={"A+":"text-amber-300",A:"text-emerald-400",B:"text-blue-400",C:"text-yellow-400",D:"text-orange-400",F:"text-red-500"};

const DEFAULT_OUTFIT: OutfitConfig = { herd: 2500, crew: 12, horses: 60, supplies: 65, guns: 4, spareParts: 3, wages: "standard", budgetSpent: 0, startingCash: 0 };
const makeInit=():GameState=>({day:1,turn:0,resources:{...INIT_R},phase:"intro",pace:"normal",distance:0,currentEvent:null,resultText:"",decisions:[],gameOver:false,survived:false,earlySale:false,outfit:{...DEFAULT_OUTFIT},historicalKnowledge:0,knowledgeLog:[],triviaCounter:0,currentTrivia:null,usedTriviaIds:new Set(),triviaStreak:0,insight:1,objectives:[],routeState:{currentNodeId:"start"},routeTag:"SAFE",riskHintsOn:false,pendingChoiceIndex:null,pendingEventQuestion:null,objectiveNotice:"",sageIndex:0,currentSage:null,sagesMet:[]});

// ═══════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════

export default function App(){
  const[campaign,setCampaign]=useState<string|null>(null);
  const[state,setState]=useState<GameState>(makeInit());
  const[usedEvents,setUsedEvents]=useState<Set<string>>(new Set());

  const start=useCallback(()=>{setState({...makeInit(),phase:"outfit"});setUsedEvents(new Set());},[]);
  const backToMenu=useCallback(()=>{setCampaign(null);setState(makeInit());},[]);

  // ── Game Juice ──────────────────────────────────────────────
  const { floats, spawn: spawnFloat } = useFloatingNumbers();
  const { shakeClass, shake } = useScreenShake();
  const { pulses, pulse } = useStatPulse();

  const RESOURCE_LABELS: Record<string, string> = {
    herd: "herd", crew: "crew", horses: "horses", ammo: "ammo",
    supplies: "supplies", morale: "morale", herdCondition: "cond",
  };

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
        resources:{
          herd:config.herd,
          crew:config.crew,
          horses:config.horses,
          supplies:config.supplies,
          morale,
          herdCondition:rating.condition,
          ammo:config.guns*10,
          spareParts:config.spareParts,
        },
      };
    });
  },[]);

  const advanceTurn=useCallback(()=>{
    setState(prev=>{
      const s:GameState={...prev,resources:{...prev.resources}};
      const before = { turn: prev.turn, day: prev.day, distance: prev.distance, resources: { ...prev.resources } };
      s.turn+=1;const pace=PACES.find(p=>p.id===s.pace)!;
      s.distance=Math.min(s.distance+pace.mpd*DAYS_PER_TURN,TOTAL_DISTANCE);
      s.day=Math.min(s.day+DAYS_PER_TURN,TOTAL_DAYS+1);
      for(const[k,v]of Object.entries(pace.fx))s.resources[k]=clampR(k,s.resources[k]+v);
      if (s.routeTag === "FAST") s.resources.herdCondition = clampR("herdCondition", s.resources.herdCondition - 2);
      if (s.routeTag === "SAFE") s.resources.morale = clampR("morale", s.resources.morale + 1);
      if (s.routeTag === "PROFIT") s.resources.supplies = clampR("supplies", s.resources.supplies - 1);
      const crewDrain = Math.ceil(s.resources.crew / 10);
      s.resources.supplies=clamp(s.resources.supplies-crewDrain,0,100);
      if(s.resources.herdCondition<20)s.resources.herd=Math.max(0,s.resources.herd-Math.ceil(Math.random()*40)-20);
      else if(s.resources.herdCondition<35&&Math.random()<0.4)s.resources.herd=Math.max(0,s.resources.herd-Math.ceil(Math.random()*15));
      if(s.resources.morale<15&&Math.random()<0.3)s.resources.crew=Math.max(0,s.resources.crew-1);
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
      if(outcome.effects)for(const[k,v]of Object.entries(outcome.effects))if(s.resources[k]!==undefined)s.resources[k]=clampR(k,s.resources[k]+v);
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
          s.insight += (v as number);
        } else if (s.resources[k] !== undefined) {
          s.resources[k] = clampR(k, s.resources[k] + (v as number));
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
  const partyMembers=[
    {id:"boss",role:"Boss",label:gf(FACES.boss,r.morale).label,health:r.morale},
    {id:"scout",role:"Scout",label:gf(FACES.scout,r.morale).label,health:r.morale},
    {id:"cook",role:"Cook",label:gf(FACES.cook,r.supplies).label,health:r.supplies},
    {id:"wrangler",role:"Wrangler",label:gf(FACES.wrangler,r.herdCondition).label,health:r.herdCondition},
    {id:"point",role:"Point",label:gf(FACES.point,r.herdCondition).label,health:r.herdCondition},
    {id:"hand",role:"Hands",label:gf(FACES.hand,Math.min(r.crew/18*100,100)).label,health:Math.min(r.crew/18*100,100)},
  ];

  if(campaign==="silkroad")return <SilkRoad onBack={backToMenu}/>;

  if(!campaign)return(
    <div className="h-screen bg-stone-900 text-stone-100 flex flex-col items-center justify-center" style={{fontFamily:"'Georgia', serif"}}>
      <h1 className="text-3xl font-bold text-amber-400 mb-2">CAMPAIGNS</h1>
      <p className="text-stone-400 text-sm mb-8">Choose your trail.</p>
      <div className="space-y-3 w-64">
        <button onClick={()=>setCampaign("chisholm")} className="w-full py-3 bg-amber-800 hover:bg-amber-700 rounded font-bold transition-colors">
          🐂 Chisholm Trail — 1867<br/><span className="text-xs font-normal text-amber-300">San Antonio to Abilene</span>
        </button>
        <button onClick={()=>setCampaign("silkroad")} className="w-full py-3 bg-indigo-900 hover:bg-indigo-800 rounded font-bold transition-colors">
          🐫 Silk Road — 130 BCE<br/><span className="text-xs font-normal text-indigo-300">Chang'an to Constantinople</span>
        </button>
      </div>
    </div>
  );

  if(state.phase==="intro")return(
    <div className="h-screen bg-stone-900 text-stone-100 flex flex-col items-center justify-center" style={{fontFamily:"'Georgia', serif"}}>
      <div className="max-w-md text-center space-y-4 p-4">
        <h1 className="text-3xl font-bold text-amber-400">CHISHOLM TRAIL</h1>
        <p className="text-stone-300">Spring, 1867. San Antonio, Texas.</p>
        <p className="text-stone-400 text-sm">You have $2,000 and a reputation. Get a herd to Abilene before the other outfits clean out the market.</p>
        <button onClick={start} className="px-8 py-3 bg-amber-700 hover:bg-amber-600 rounded font-bold transition-colors">BEGIN OUTFIT</button>
        <button onClick={backToMenu} className="block w-full text-stone-500 hover:text-stone-300 text-xs mt-2">← Back to Campaigns</button>
      </div>
    </div>
  );

  if(state.phase==="outfit")return<OutfitScreen onDone={onOutfitDone}/>;

  if(state.phase==="end"){
    const herdPct = state.outfit.herd > 0 ? r.herd / state.outfit.herd : 0;
    const revenue = state.survived ? r.herd * 40 : 0;
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
          {state.survived && <div className="flex justify-between text-stone-400"><span>Revenue ($40/head)</span><span className="text-emerald-400">+${revenue.toLocaleString()}</span></div>}
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
          <p className="text-xs text-stone-500 leading-relaxed">The Chisholm Trail operated from 1867 to roughly 1884. An estimated 5 million cattle and 1 million mustangs were driven north along this and other trails. The cattle drive era built the Texas economy after the Civil War, created the cowboy legend, and connected the frontier to the industrial East. Barbed wire, railroads, and quarantine laws ended the drives — but the culture they created defined Texas forever.</p>
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
    <div className={`h-screen bg-stone-900 text-stone-100 flex overflow-hidden ${shakeClass}`} style={{fontFamily:"'Georgia', serif"}}>
      <StreakFlash streak={state.triviaStreak} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 pointer-events-none z-50">
        <FloatingNumbers floats={floats} />
      </div>

      {/* ── Map Sidebar ──────────────────────────────────── */}
      <div className="hidden md:flex w-72 lg:w-80 xl:w-96 flex-shrink-0">
        <TrailMap progress={progress} day={state.day} totalDays={TOTAL_DAYS} />
      </div>

      {/* ── Main Game Column ─────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      <div className="flex-shrink-0 bg-stone-800">
        <div className="max-w-lg mx-auto">
          <PrairieScene progress={progress} pace={state.pace} turn={state.turn}/>
        </div>
      </div>
      <div className="flex-shrink-0 bg-stone-800 border-b border-stone-700 px-3 py-2">
        <div className="max-w-lg mx-auto">
          <div className="grid grid-cols-4 gap-2 text-xs mb-2">
            <StatBox icon="🐂" label="Herd" value={r.herd} pulseState={pulses.herd || ""} />
            <StatBox icon="🤠" label="Crew" value={r.crew} pulseState={pulses.crew || ""} />
            <StatBox icon="🐴" label="Horses" value={r.horses} pulseState={pulses.horses || ""} />
            <StatBox icon="🔫" label="Ammo" value={r.ammo||0} pulseState={pulses.ammo || ""} />
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
        </div>
      </div>
      <DoomHUD members={partyMembers}/>
      <PortraitDebugPanel />
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <div className="max-w-lg mx-auto space-y-3 mt-2">
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
              <div className="flex gap-2">
                {PACES.map(p=>(
                  <button key={p.id} onClick={()=>{setState(prev=>({...prev,pace:p.id}));advanceTurn();}}
                    className={`flex-1 py-2 rounded text-xs font-bold transition-colors ${p.id==="push"?"bg-red-900 hover:bg-red-800":p.id==="normal"?"bg-stone-700 hover:bg-stone-600":"bg-emerald-900 hover:bg-emerald-800"}`}>
                    {p.label}<br/><span className="font-normal text-stone-400">{p.desc}</span>
                  </button>
                ))}
              </div>
              {(r.ammo||0)>=5&&(
                <button onClick={handleHunt} className="w-full py-2 bg-amber-900 hover:bg-amber-800 rounded text-xs font-bold transition-colors">
                  🔫 Hunt ({r.ammo||0} rounds)
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
