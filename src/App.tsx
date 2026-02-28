import { useState, useCallback, useEffect, useRef } from "react";
import DoomHUD from "./DoomHUD";
import VisualNovelEngine from "./VisualNovelEngine";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface Resources { [key: string]: number; }
interface Outcome { weight: number; effects: Resources; result: string; earlyEnd?: boolean; }
interface Choice { text: string; effects?: Resources; result?: string; outcomes?: Outcome[]; earlyEnd?: boolean; }
interface GameEvent { id: string; phase_min: number; phase_max: number; weight: number; title: string; text: string; choices: Choice[]; }
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
  phase: "intro" | "outfit" | "sailing" | "event" | "result" | "end";
  pace: string; distance: number; currentEvent: GameEvent | null;
  resultText: string; decisions: Decision[];
  gameOver: boolean; survived: boolean; earlySale: boolean;
  outfit: OutfitConfig;
}

// ═══════════════════════════════════════════════════════════════
// PIXEL FACE SYSTEM (same as before)
// ═══════════════════════════════════════════════════════════════

const FC: Record<string, string> = {
  ".":"transparent",s:"#e8b796",d:"#c4896b",w:"#a0654d",
  H:"#5c3a1e",h:"#7a5230",B:"#d4a843",e:"#1a1a2e",W:"#f0e8dc",r:"#3d2512",
  m:"#8b3a3a",M:"#5c1e1e",g:"#4a6741",G:"#364d30",b:"#8b2020",n:"#6b1515",
  c:"#c9a84c",C:"#a08530",f:"#5c3a1e",F:"#3d2512",x:"#7a5570",k:"#8b3a3a",
  D:"#c4a882",t:"#b8d4e8",
};

const B_H="....HHHHHH....."+
"...HhHHHHhH...."+
"..HhHHHHHHhH..."+
"..BBBBBBBBBB..."+
"...sssssssss..."+
"..sssssssssss.."+
"..sWesssseWs..."+
"..ssesssssess.."+
"..ssssddsssss.."+
"..ssssddsssss.."+
"..sfssmmssfs..."+
"..sffssmssff..."+
"...sssssssss..."+
"...dsssssssd..."+
"....ggggggg...."+
"...gGgggggGg...";

const B_T="....HHHHHH....."+
"...HhHHHHhH...."+
"..HhHHHHHHhH..."+
"..BBBBBBBBBB..."+
"...ddsssssdd..."+
"..sssssssssss.."+
"..dWesssseWd..."+
"..ssesssssess.."+
"..ssssddsssss.."+
"..ssssddsssss.."+
"..sfssmmssfs..."+
"..sffsssssff..."+
"...sssssssss..."+
"...dsssssssd..."+
"....ggggggg...."+
"...gGgggggGg...";

const B_W="....HHHHHH....."+
"...HhHHHHhH...."+
"..HhHHHHHHhH..."+
"..BBBBBBBBBB..."+
"...ddsssssdd..."+
"..ddsssssssdd.."+
"..dWesssseWd..."+
"..ssesssssess.."+
"..xsssddsssxs.."+
"..ssssddsssss.."+
"..sfsMMMssfs..."+
"..sffsssssff..."+
"...sssssssss..."+
"...wssssssswt.."+
"....ggggggg...."+
"...gGgggggGg...";

const B_D="....HHHHHH....."+
"...HhHHHHhH...."+
"..HhHHHHHHhH..."+
"..BBBBBBBBBB..."+
"...xxsssssxx..."+
"..xxsssssssxx.."+
"..xWesssseWx..."+
"..ssesssssess.."+
"..xkssddssskx.."+
"..ssssddsssss.."+
"..sfMMMMMsfs..."+
"..sFfsssssFs..."+
"...wswswswsw..."+
"...wssssssswt.."+
"....ggggggg...."+
"...gGgggggGg...";

const S_H="................"+
"....rrrrrrr....."+
"...rrrrrrrrr...."+
"..rrrsssssrrr..."+
"..rrsssssssrr..."+
"..ssssssssssss.."+
"..sWesssseWs..."+
"..ssesssssess.."+
"..sssssssssss.."+
"..ssssddsssss.."+
"..ssssmmsssss.."+
"..ssssssssss..."+
"...bbbbbbbbb..."+
"...bnbbbbbbn..."+
"....ggggggg...."+
"...gGgggggGg...";

const S_T="................"+
"....rrrrrrr....."+
"...rrrrrrrrr...."+
"..rrrsssssrrr..."+
"..rrsssssssrr..."+
"..ddsssssssdd.."+
"..dWesssseWd..."+
"..ssesssssess.."+
"..sssssssssss.."+
"..ssssddsssss.."+
"..ssssmmsssss.."+
"..ssssssssss..."+
"...bbbbbbbbb..."+
"...bnbbbbbbn..."+
"....ggggggg...."+
"...gGgggggGg...";

const S_W="................"+
"....rrrrrrr....."+
"...rrrrrrrrr...."+
"..rrrsssssrrr..."+
"..rrdsssssdrrr.."+
"..ddsssssssdd.."+
"..dWesssseWd..."+
"..ssesssssess.."+
"..xssssssssxs.."+
"..ssssddsssss.."+
"..sssMMMsssss.."+
"..ssssssssss..."+
"...bbbbbbbbb..."+
"...bnbbbbbbn..."+
"....ggggggg...."+
"...gGgggggGg...";

const S_D="................"+
"....rrrrrrr....."+
"...rrrrrrrrr...."+
"..rrrxsssxrrr..."+
"..rrxsssssxrr..."+
"..xxsssssssxx.."+
"..xWesssseWx..."+
"..ssesssssess.."+
"..xkssssssskx.."+
"..ssssddsssss.."+
"..ssMMMMMssss.."+
"..wsswssswss..."+
"...bbbbbbbbb..."+
"...bnbbbbbbn..."+
"....ggggggg...."+
"...gGgggggGg...";

const CK_H="................"+
"....HHHHHH....."+
"...HHHHHHHH...."+
"..HHHHHHHHHH..."+
"...sssssssss..."+
"..sssssssssss.."+
"..sWesssseWs..."+
"..ssesssssess.."+
"..ssssddsssss.."+
"..sssssssssss.."+
"..ssssmmsssss.."+
"..sssssssssss.."+
"...ccccccccc..."+
"...cCcccccCc..."+
"....ccccccc...."+
"...cCcccccCc...";

const CK_T="................"+
"....HHHHHH....."+
"...HHHHHHHH...."+
"..HHHHHHHHHH..."+
"...ddsssssdd..."+
"..sssssssssss.."+
"..dWesssseWd..."+
"..ssesssssess.."+
"..ssssddsssss.."+
"..sssssssssss.."+
"..ssssmmsssss.."+
"..sssssssssss.."+
"...ccccccccc..."+
"...cCcccccCc..."+
"....ccccccc...."+
"...cCcccccCc...";

const CK_W="................"+
"....HHHHHH....."+
"...HHHHHHHH...."+
"..HHHHHHHHHH..."+
"...ddsssssdd..."+
"..ddsssssssdd.."+
"..dWesssseWd..."+
"..ssesssssess.."+
"..xsssddsssxs.."+
"..sssssssssss.."+
"..ssMMMMMssss.."+
"..sssssssssss.."+
"...ccccccccc..."+
"...cCcccccCc..."+
"....ccccccc...."+
"...cCcccccCc...";

const CK_D="................"+
"....HHHHHH....."+
"...HHHHHHHH...."+
"..HHHHHHHHHH..."+
"...xxsssssxx..."+
"..xxsssssssxx.."+
"..xWesssseWx..."+
"..ssesssssess.."+
"..xkssddssskx.."+
"..sssssssssss.."+
"..sMMMMMMMsss.."+
"..wswswswsww..."+
"...ccccccccc..."+
"...cCcccccCc..."+
"....ccccccc...."+
"...cCcccccCc...";

const WR_H="...HHHHHHHHH..."+
"..HhHHHHHHhH..."+
"..HhHHHHHHhH..."+
"..BBBBBBBBBB..."+
"...sssssssss..."+
"..sssssssssss.."+
"..sWesssseWs..."+
"..ssesssssess.."+
"..ssssddsssss.."+
"..sssssssssss.."+
"..ssssmmsssss.."+
"..sssssssssss.."+
"...sssssssss..."+
"...dsssssssd..."+
"....ggggggg...."+
"...gGgggggGg...";

const WR_T="...HHHHHHHHH..."+
"..HhHHHHHHhH..."+
"..HhHHHHHHhH..."+
"..BBBBBBBBBB..."+
"...ddsssssdd..."+
"..sssssssssss.."+
"..dWesssseWd..."+
"..ssesssssess.."+
"..ssssddsssss.."+
"..sssssssssss.."+
"..ssssmmsssss.."+
"..sssssssssss.."+
"...sssssssss..."+
"...dsssssssd..."+
"....ggggggg...."+
"...gGgggggGg...";

const WR_W="...HHHHHHHHH..."+
"..HhHHHHHHhH..."+
"..HhHHHHHHhH..."+
"..BBBBBBBBBB..."+
"...ddsssssdd..."+
"..ddsssssssdd.."+
"..dWesssseWd..."+
"..ssesssssess.."+
"..xsssddsssxs.."+
"..sssssssssss.."+
"..sssMMMsssss.."+
"..sssssssssss.."+
"...sssssssss..."+
"...wssssssswt.."+
"....ggggggg...."+
"...gGgggggGg...";

const WR_D="...HHHHHHHHH..."+
"..HhHHHHHHhH..."+
"..HhHHHHHHhH..."+
"..BBBBBBBBBB..."+
"...xxsssssxx..."+
"..xxsssssssxx.."+
"..xWesssseWx..."+
"..ssesssssess.."+
"..xkssddssskx.."+
"..sssssssssss.."+
"..sMMMMMMMsss.."+
"..wswswswsww..."+
"...wswswswsw..."+
"...wssssssswt.."+
"....ggggggg...."+
"...gGgggggGg...";

const PT_H="....HHHHHH....."+
"...HhHHHHhH...."+
"..HHHHHHHHHH..."+
"..BBBBBBBBBB..."+
"...sssssssss..."+
"..sssssssssss.."+
"..sWesssseWs..."+
"..ssesssssess.."+
"..ssssddsssss.."+
"..sssssssssss.."+
"..ssssmmsssss.."+
"...sssssssss..."+
"...bbbbbbbbb..."+
"...bnbbbbbbn..."+
"....ggggggg...."+
"...gGgggggGg...";

const PT_T="....HHHHHH....."+
"...HhHHHHhH...."+
"..HHHHHHHHHH..."+
"..BBBBBBBBBB..."+
"...DDsssssDD..."+
"..DDsssssssDD.."+
"..DWesssseWD..."+
"..ssesssssess.."+
"..ssssddsssss.."+
"..sssssssssss.."+
"..ssssmmsssss.."+
"...sssssssss..."+
"...bbbbbbbbb..."+
"...bnbbbbbbn..."+
"....ggggggg...."+
"...gGgggggGg...";

const PT_W="....HHHHHH....."+
"...HhHHHHhH...."+
"..HHHHHHHHHH..."+
"..BBBBBBBBBB..."+
"...DDdsssdDD..."+
"..DDdsssssdDD.."+
"..DWesssseWD..."+
"..ssesssssess.."+
"..bbbbbbbbbbb.."+
"..bnbbbbbbbbn.."+
"..bbbbbbbbbbb.."+
"...bbbbbbbbb..."+
"...bbbbbbbbb..."+
"...bnbbbbbbn..."+
"....ggggggg...."+
"...gGgggggGg...";

const PT_D="....HHHHHH....."+
"...HhHHHHhH...."+
"..HHHHHHHHHH..."+
"..BBBBBBBBBB..."+
"...xxdsssdxx..."+
"..xxdsssssdxx.."+
"..xWesssseWx..."+
"..ssesssssess.."+
"..bbbbbbbbbbb.."+
"..bnbbbbbbbbn.."+
"..bbbbbbbbbbb.."+
"...bbbbbbbbb..."+
"...bbbbbbbbb..."+
"...bnbbbbbbn..."+
"....ggggggg...."+
"...gGgggggGg...";

const HD_H="................"+
"....HHHHHH....."+
"...HHHHHHHH...."+
"..BBBBBBBBBB..."+
"...sssssssss..."+
"..sssssssssss.."+
"..sWesssseWs..."+
"..ssesssssess.."+
"..ssssddsssss.."+
"..sssssssssss.."+
"..ssssmmsssss.."+
"...sssssssss..."+
"...sssssssss..."+
"...dsssssssd..."+
"....ggggggg...."+
"...gGgggggGg...";

const HD_S="................"+
"....HHHHHH....."+
"...HHHHHHHH...."+
"..BBBBBBBBBB..."+
"...ddsssssdd..."+
"..sssssssssss.."+
"..dWesssseWd..."+
"..ssesssssess.."+
"..ssssddsssss.."+
"..sssssssssss.."+
"..ssssmmsssss.."+
"...sssssssss..."+
"...sssssssss..."+
"...dsssssssd..."+
"....ggggggg...."+
"...gGgggggGg...";

const HD_K="................"+
"....HHHHHH....."+
"...HHHHHHHH...."+
"..BBBBBBBBBB..."+
"...ddsssssdd..."+
"..ddsssssssdd.."+
"..dWesssseWd..."+
"..ssesssssess.."+
"..xsssddsssxs.."+
"..sssssssssss.."+
"..sssMMMsssss.."+
"...wsswsswss..."+
"...sssssssss..."+
"...wssssssswt.."+
"....ggggggg...."+
"...gGgggggGg...";

const HD_G="................"+
"....HHHHHH....."+
"...HHHHHHHH...."+
"..BBBBBBBBBB..."+
"...xxsssssxx..."+
"..xxwssssswxx.."+
"..xWesssseWx..."+
"..ssesssssess.."+
"..xkwsddsxkxs.."+
"..wsssssssssw.."+
"..wMMMMMMMwww.."+
"...wswswswsw..."+
"...wswswswsw..."+
"...wssssssswt.."+
"....ggggggg...."+
"...gGgggggGg...";

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
// ANIMATED PRAIRIE SCENE — the hero visual
// ═══════════════════════════════════════════════════════════════

// PrairieScene — image-based scrolling with Grok pixel art
// (SKY_PHASES and lerpColor removed — no longer needed)
// Noon placeholder to mark where old code was

function PrairieScene({ progress, pace }: { progress: number; pace: string; turn: number }) {
  const speed = pace === "push" ? "12s" : pace === "normal" ? "20s" : "35s";
  const miLabel = progress < 10 ? "San Antonio" : progress > 90 ? "Abilene" : `${Math.round(progress * 8)} mi`;

  return (
    <div className="relative w-full overflow-hidden rounded-b border-b border-stone-700" style={{ height: 180 }}>
      {/* Layer 1: Static sky — does not move */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(/faces/bg_sky.png)`,
          backgroundSize: "cover",
          backgroundPosition: "center bottom",
          imageRendering: "pixelated",
        }}
      />
      {/* Layer 2: Cattle drive strip — scrolls across bottom with walking bob */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: 60,
          backgroundImage: `url(/faces/fg_cattle.png)`,
          backgroundSize: "auto 100%",
          backgroundRepeat: "repeat-x",
          backgroundPosition: "bottom",
          animation: `bgScroll ${speed} linear infinite, cattleBob 0.6s ease-in-out infinite`,
          imageRendering: "pixelated",
        }}
      />
      {/* Vignette/ground fade */}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(transparent 60%, rgba(0,0,0,0.3) 100%)",
      }} />
      {/* Progress labels */}
      <div className="absolute bottom-1 left-2 text-xs font-bold" style={{ color: "#d4a843", opacity: 0.85, fontFamily: "monospace" }}>
        {Math.round(progress)}%
      </div>
      <div className="absolute bottom-1 right-2 text-xs font-bold" style={{ color: "#d4a843", opacity: 0.85, fontFamily: "monospace" }}>
        {miLabel}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// OUTFIT SCREEN — the Oregon Trail store
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
  const [herdIdx, setHerdIdx] = useState(2); // default 2500
  const [extraCrew, setExtraCrew] = useState(4); // default 12 total
  const [extraHorses, setExtraHorses] = useState(12); // default 42 total
  const [extraSupplies, setExtraSupplies] = useState(10); // default 45
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

          {/* Herd Size */}
          <div className="bg-stone-800 border border-stone-700 rounded p-2.5">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-stone-300 font-bold">{"\uD83D\uDC02"} Herd Size</span>
              <span className="text-amber-400 font-mono">{herd.toLocaleString()} head</span>
            </div>
            <input type="range" min={0} max={4} value={herdIdx} onChange={e => setHerdIdx(+e.target.value)} className="w-full accent-amber-500 h-2" />
            <div className="flex justify-between text-xs mt-1">
              <span className="text-stone-500">Fewer head, easier drive</span>
              <span className="text-stone-500">More head = ${potentialValue.toLocaleString()} potential</span>
            </div>
          </div>

          {/* Cowboys */}
          <div className="bg-stone-800 border border-stone-700 rounded p-2.5">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-stone-300 font-bold">{"\uD83E\uDD20"} Cowboys</span>
              <span className="font-mono">{crew} <span className="text-stone-500">({BASE_CREW} + {extraCrew} extra at ${COST_COWBOY} ea)</span></span>
            </div>
            <input type="range" min={0} max={10} value={extraCrew} onChange={e => setExtraCrew(+e.target.value)} className="w-full accent-amber-500 h-2" />
            <div className="flex justify-between text-xs mt-1">
              <span className="text-stone-500">Ratio: {Math.round(herd / crew)}:1</span>
              <span className={rating.color}>{rating.label}</span>
            </div>
          </div>

          {/* Horses */}
          <div className="bg-stone-800 border border-stone-700 rounded p-2.5">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-stone-300 font-bold">{"\uD83D\uDC0E"} Horses</span>
              <span className="font-mono">{horses} <span className="text-stone-500">({BASE_HORSES} + {extraHorses} at ${COST_HORSE})</span></span>
            </div>
            <input type="range" min={0} max={30} value={extraHorses} onChange={e => setExtraHorses(+e.target.value)} className="w-full accent-amber-500 h-2" />
            <div className="flex justify-between text-xs mt-1">
              <span className="text-stone-500">{horsesPerCowboy} per cowboy</span>
              <span className={parseFloat(horsesPerCowboy) >= 5 ? "text-emerald-400" : parseFloat(horsesPerCowboy) >= 3.5 ? "text-yellow-400" : "text-red-400"}>
                {parseFloat(horsesPerCowboy) >= 5 ? "Good rotation" : parseFloat(horsesPerCowboy) >= 3.5 ? "Tight" : "Riding them dead"}
              </span>
            </div>
          </div>

          {/* Supplies */}
          <div className="bg-stone-800 border border-stone-700 rounded p-2.5">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-stone-300 font-bold">{"\uD83C\uDF56"} Supplies</span>
              <span className="font-mono">{supplies} <span className="text-stone-500">(+{extraSupplies} at ${COST_SUPPLY})</span></span>
            </div>
            <input type="range" min={0} max={30} value={extraSupplies} onChange={e => setExtraSupplies(+e.target.value)} className="w-full accent-amber-500 h-2" />
            <div className="flex justify-between text-xs mt-1">
              <span className="text-stone-500">{Math.round(supplies / crew * 10) / 10} per man</span>
              <span className={supplies / crew >= 4.5 ? "text-emerald-400" : supplies / crew >= 3 ? "text-yellow-400" : "text-red-400"}>
                {supplies / crew >= 4.5 ? "Well-fed" : supplies / crew >= 3 ? "Rationing" : "Hungry from day one"}
              </span>
            </div>
          </div>

          {/* Guns & Ammo */}
          <div className="bg-stone-800 border border-stone-700 rounded p-2.5">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-stone-300 font-bold">{"\uD83D\uDD2B"} Rifles & Ammo</span>
              <span className="font-mono">{guns} <span className="text-stone-500">(at ${COST_GUN} ea)</span></span>
            </div>
            <input type="range" min={0} max={12} value={guns} onChange={e => setGuns(+e.target.value)} className="w-full accent-amber-500 h-2" />
            <div className="flex justify-between text-xs mt-1">
              <span className="text-stone-500">{crew > 0 ? Math.round(guns / crew * 100) : 0}% armed</span>
              <span className={guns >= crew * 0.5 ? "text-emerald-400" : guns >= 3 ? "text-yellow-400" : "text-red-400"}>
                {guns === 0 ? "Defenseless" : guns < 3 ? "Can't hunt or fight" : guns < crew * 0.5 ? "Light arms" : "Well-armed"}
              </span>
            </div>
          </div>

          {/* Spare Parts */}
          <div className="bg-stone-800 border border-stone-700 rounded p-2.5">
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-stone-300 font-bold">{"\uD83D\uDD27"} Spare Parts</span>
              <span className="font-mono">{spareParts} sets <span className="text-stone-500">(at ${COST_SPAREPARTS})</span></span>
            </div>
            <input type="range" min={0} max={8} value={spareParts} onChange={e => setSpareParts(+e.target.value)} className="w-full accent-amber-500 h-2" />
            <div className="flex justify-between text-xs mt-1">
              <span className="text-stone-500">Axles, wheels, tongue</span>
              <span className={spareParts >= 4 ? "text-emerald-400" : spareParts >= 2 ? "text-yellow-400" : "text-red-400"}>
                {spareParts === 0 ? "Pray nothing breaks" : spareParts < 2 ? "One repair" : spareParts < 4 ? "A few fixes" : "Well-prepared"}
              </span>
            </div>
          </div>

          {/* Wages */}
          <div className="bg-stone-800 border border-stone-700 rounded p-2.5">
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span className="text-stone-300 font-bold">{"\uD83D\uDD25"} Cowboy Wages</span>
              <span className="text-stone-500">(affects starting morale)</span>
            </div>
            <div className="flex gap-1.5">
              {([
                { id: "low" as const, label: "$25/mo", desc: "They'll grumble", morale: 35, cost: 0 },
                { id: "standard" as const, label: "$35/mo", desc: "Fair pay", morale: 50, cost: 120 },
                { id: "good" as const, label: "$45/mo", desc: "Loyal crew", morale: 68, cost: 280 },
              ]).map(w => (
                <button key={w.id} onClick={() => setWages(w.id)}
                  className={`flex-1 p-1.5 rounded text-xs border transition-colors ${wages === w.id ? "bg-amber-700 border-amber-600 text-white" : "bg-stone-700 border-stone-600 text-stone-300 hover:bg-stone-600"}`}>
                  <div className="font-bold">{w.label}</div>
                  <div className="opacity-60" style={{ fontSize: 9 }}>{w.desc}</div>
                  <div className="opacity-60" style={{ fontSize: 9 }}>Morale: {w.morale}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Budget Summary */}
          <div className={`rounded p-2.5 border text-center ${remaining >= 0 ? "bg-stone-800 border-stone-700" : "bg-red-900/30 border-red-800"}`}>
            <div className="text-xs text-stone-400 space-y-0.5">
              <div className="flex justify-between"><span>Extra cowboys ({extraCrew})</span><span>${(extraCrew * COST_COWBOY).toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Extra horses ({extraHorses})</span><span>${(extraHorses * COST_HORSE).toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Extra supplies ({extraSupplies})</span><span>${(extraSupplies * COST_SUPPLY).toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Rifles & ammo ({guns})</span><span>${(guns * COST_GUN).toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Spare parts ({spareParts})</span><span>${(spareParts * COST_SPAREPARTS).toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Wage premium</span><span>${WAGE_COST[wages]}</span></div>
              <div className="border-t border-stone-600 mt-1 pt-1 flex justify-between font-bold text-stone-200">
                <span>Remaining</span>
                <span className={remaining >= 0 ? "text-emerald-400" : "text-red-500"}>${remaining.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => onDone({
              herd, crew, horses, supplies,
              guns, spareParts,
              wages,
              budgetSpent: spent,
              startingCash: Math.max(0, remaining),
            })}
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
// ALL 16 EVENTS
// ═══════════════════════════════════════════════════════════════

const EVENTS:GameEvent[]=[
{id:"river_crossing_early",phase_min:0,phase_max:0.3,weight:5,title:"River Crossing \u2014 The Brazos",text:"The Brazos is running high from spring rains. Brown water churning fast with debris. Your scout found two options: a wide shallow ford half a day east, or the narrow deep crossing right here.",choices:[{text:"Take the wide ford. Half a day lost but safer.",outcomes:[{weight:6,effects:{herdCondition:-2},result:"The wide ford works. Water up to the cattle\u2019s bellies but they cross steady. Boring success \u2014 the best kind."},{weight:4,effects:{herd:-30,herdCondition:-4,horses:-2},result:"The \u2018safe\u2019 ford has a sinkhole. Thirty head drown. Two horses go down."}]},{text:"Cross here. Deep but narrow \u2014 fast.",outcomes:[{weight:5,effects:{herd:-60,morale:-6,horses:-3},result:"Too deep. Current catches the middle of the herd. Sixty head gone."},{weight:5,effects:{herd:-8,morale:4},result:"Your lead steer walks straight in and the herd follows. Eight head swept away."}]},{text:"Wait a day. Let the river drop.",outcomes:[{weight:5,effects:{supplies:-4,herdCondition:3,herd:-5},result:"River drops overnight. Easy crossing. Patience pays."},{weight:5,effects:{supplies:-4,herd:-80,morale:-8},result:"It rains again. River rises. Eighty head gone."}]}]},
{id:"stampede_night",phase_min:0,phase_max:0.8,weight:5,title:"Stampede \u2014 Lightning",text:"Thunder at 2 AM. A bolt hits close and 2,500 longhorns explode in every direction.",choices:[{text:"Ride to the front. Turn the leaders.",outcomes:[{weight:5,effects:{herd:-40,horses:-2,morale:-3},result:"You turn them into a wide circle by dawn. Forty head over a bluff."},{weight:3,effects:{herd:-15,morale:5,herdCondition:-3},result:"Your best rider turns the lead steer hard. Fifteen scattered. That kid just earned a bonus."},{weight:2,effects:{herd:-20,crew:-1,morale:-10,horses:-1},result:"A horse hits a prairie dog hole at full gallop in the dark. Horse and rider go down."}]},{text:"Hold position. Protect the camp.",effects:{herd:-150,morale:-5},result:"You let them run. A hundred fifty head just gone."},{text:"Get every rider out singing.",outcomes:[{weight:4,effects:{herd:-20,morale:3,herdCondition:-2},result:"Cowboys singing \u2018Lorena\u2019 in a thunderstorm. Twenty head gone but the herd settles."},{weight:6,effects:{herd:-100,morale:-6,herdCondition:-5},result:"Too far gone. Herd splits three ways. A hundred head scattered."}]}]},
{id:"water_scarce",phase_min:0.2,phase_max:0.7,weight:5,title:"Dry Country",text:"Last water was two days ago. The cattle are bawling. Thirsty cattle are stupid cattle.",choices:[{text:"Push through fast.",outcomes:[{weight:5,effects:{herd:-50,herdCondition:-8,morale:-4,horses:-3},result:"Cattle stagger. Calves drop. Fifty head didn\u2019t make it."},{weight:5,effects:{herd:-20,herdCondition:-4,morale:3},result:"Scout signals river ahead by evening. Twenty lost to heat. The rest drink."}]},{text:"Slow down. Look for water.",outcomes:[{weight:4,effects:{supplies:-6,herd:-30,herdCondition:-3,morale:-5},result:"Extra day of suffering. Thirty dead."},{weight:6,effects:{herdCondition:-2,supplies:-3,herd:-8,morale:4},result:"Scout finds an underground seep. Eight head lost."}]},{text:"Night drive. Move in the cool.",outcomes:[{weight:5,effects:{herd:-25,morale:-5,herdCondition:-3},result:"Twenty-five walk off a cutbank in the dark."},{weight:5,effects:{herd:-10,morale:2,herdCondition:1,horses:-1},result:"It works. By dawn you see trees \u2014 water."}]}]},
{id:"rustlers",phase_min:0.3,phase_max:0.8,weight:4,title:"Riders on the Ridge",text:"Eight, maybe ten riders pacing your herd from a mile out.",choices:[{text:"Arm up and ride out.",outcomes:[{weight:5,effects:{morale:5,herdCondition:-2},result:"Lost outfit, not rustlers. Your crew feels ten feet tall."},{weight:5,effects:{morale:-3,crew:-1,supplies:-2},result:"They scatter but one puts a rifle shot through your flank rider\u2019s shoulder."}]},{text:"Circle tight and post guards.",effects:{herdCondition:-4,morale:-3,supplies:-2},result:"They disappear at sundown. You\u2019ll never know what they were."},{text:"Ignore them. Keep driving.",outcomes:[{weight:4,effects:{herd:-200,morale:-12,horses:-4},result:"They hit at dawn. 200 head gone."},{weight:6,effects:{morale:2},result:"They drift away by evening. Just ghosts of the prairie."}]}]},
{id:"crew_quit",phase_min:0.3,phase_max:0.7,weight:4,title:"Two Hands Give Notice",text:"Two cowboys say they\u2019re done. Ranch work in Wichita that doesn\u2019t involve sleeping in mud.",choices:[{text:"Let them go.",effects:{crew:-2,morale:-3},result:"They ride out at dawn."},{text:"Offer double wages.",outcomes:[{weight:6,effects:{supplies:-5,morale:3},result:"Double pay keeps them."},{weight:4,effects:{crew:-2,morale:-6},result:"\u2018It ain\u2019t about money, boss.\u2019"}]},{text:"Remind them they signed a contract.",effects:{morale:-8},result:"They stay. They do the minimum. A man kept against his will works like one."}]},
{id:"indian_territory",phase_min:0.4,phase_max:0.7,weight:5,title:"Indian Territory",text:"You\u2019re crossing Nations land. They charge ten cents a head \u2014 their legal right.",choices:[{text:"Pay the toll. It\u2019s their land.",effects:{morale:-3,herdCondition:2,herd:-250},result:"250 head equivalent. The toll bought intelligence and escort."},{text:"Negotiate. Offer five cents.",outcomes:[{weight:5,effects:{morale:1,herdCondition:1,herd:-175},result:"Seven cents. 175 head. Fair."},{weight:5,effects:{morale:-5,herdCondition:-3,herd:-50,supplies:-4},result:"No escort. Bad crossing. The toll was cheaper than ignorance."}]},{text:"Refuse. Push through.",outcomes:[{weight:3,effects:{morale:4,herdCondition:-4},result:"Nothing happens. Your crew cheers like they won something. They didn\u2019t."},{weight:7,effects:{herd:-300,morale:-8,horses:-5,crew:-1,herdCondition:-6},result:"Ambush at a river crossing. 300 head gone. A cowboy takes an arrow."}]}]},
{id:"cook_wagon",phase_min:0.1,phase_max:0.6,weight:4,title:"Busted Axle",text:"Chuck wagon\u2019s rear axle snaps. No coffee, no beans, no hot food.",choices:[{text:"Full stop. Repair. Whole day.",effects:{supplies:-3,herdCondition:-3,morale:1},result:"Cottonwood replacement axle. The cook makes coffee and the crew forgives."},{text:"Rig a temporary fix.",outcomes:[{weight:5,effects:{morale:-2,supplies:-2},result:"Holds three days then fails in a creek. Half your flour ruined."},{weight:5,effects:{morale:2},result:"Holds all the way. Sometimes the quick fix is the right fix."}]},{text:"Abandon the wagon.",effects:{supplies:-15,morale:-10,horses:-3},result:"Cold jerky and creek water for every meal. This is survival now."}]},
{id:"good_grass",phase_min:0.1,phase_max:0.8,weight:3,title:"Paradise Valley",text:"Scout found belly-high bluestem and a clean creek. Perfect grazing.",choices:[{text:"Two days\u2019 rest.",effects:{herdCondition:10,morale:6,supplies:-5,horses:2},result:"The closest thing to heaven. Nobody\u2019s miserable."},{text:"One day.",effects:{herdCondition:5,morale:3,supplies:-3},result:"Enough to take the edge off."},{text:"Keep moving.",outcomes:[{weight:5,effects:{morale:-6,herdCondition:-2},result:"Crew watches it slide past. Some weep."},{weight:5,effects:{morale:-3,herdCondition:-1},result:"An hour later there\u2019s a crossing and they forget."}]}]},
{id:"river_red",phase_min:0.35,phase_max:0.55,weight:5,title:"The Red River",text:"The big one. Quarter mile wide and deep. This is where drives die.",choices:[{text:"Scout downstream.",outcomes:[{weight:5,effects:{supplies:-4,herd:-15,herdCondition:-1},result:"Better crossing found. Fifteen lost. Patience paid."},{weight:5,effects:{supplies:-6,morale:-3,herd:-40},result:"Nothing better. Forty head gone."}]},{text:"Cross here and now.",outcomes:[{weight:4,effects:{herd:-80,morale:-6,horses:-4,crew:-1},result:"Chaos. One cowboy doesn\u2019t get free. Eighty head gone. The Red earned its name."},{weight:6,effects:{herd:-25,morale:4},result:"Lead steer swims straight. Twenty-five lost. Crew whoops on the far bank."}]},{text:"Wait for another outfit. Watch and learn.",outcomes:[{weight:5,effects:{supplies:-5,herd:-10,morale:2},result:"Watch their mistakes. Cross clean. Ten head \u2014 a miracle for the Red."},{weight:5,effects:{supplies:-8,morale:-5,herdCondition:-3},result:"Nobody comes. Two days wasted."}]}]},
{id:"snakebite",phase_min:0,phase_max:0.8,weight:3,title:"Rattler",text:"Best roper is down \u2014 diamondback got his ankle. Leg swelling fast.",choices:[{text:"Cut and suck.",outcomes:[{weight:5,effects:{morale:-3,crew:-1},result:"Not enough. He dies quiet that night."},{weight:5,effects:{morale:2,herdCondition:-2},result:"Day four he sits up and asks for coffee."}]},{text:"Send a rider for medicine.",effects:{crew:-1,morale:-2,herdCondition:-3,supplies:-4},result:"Down two hands. Medicine arrives too late."},{text:"Tourniquet, whiskey, chuck wagon.",effects:{morale:-1,herdCondition:-2},result:"He makes it. Barely. He\u2019ll tell this story for fifty years."}]},
{id:"tornado",phase_min:0.2,phase_max:0.7,weight:3,title:"Green Sky",text:"Sky turns yellow-green. \u2018Twister weather.\u2019 Maybe fifteen minutes.",choices:[{text:"Scatter the herd.",outcomes:[{weight:5,effects:{herd:-60,morale:-4,herdCondition:-5},result:"Twister hits where the herd was. Sixty gone but the bulk survived."},{weight:5,effects:{herd:-30,morale:4},result:"Misses by a mile. Too close."}]},{text:"Hold tight. Low ground.",outcomes:[{weight:4,effects:{herd:-200,crew:-1,horses:-6,morale:-12},result:"Direct hit. 200 gone. A cowboy thrown."},{weight:6,effects:{herd:-20,morale:2,herdCondition:-3},result:"Low ground saves you. Twenty caught. Lucky everything."}]},{text:"Ride south.",effects:{herd:-40,herdCondition:-6,morale:-5,supplies:-3},result:"Cattle fight you every step. Forty scatter. But you\u2019re alive."}]},
{id:"competition",phase_min:0.3,phase_max:0.8,weight:3,title:"Competition",text:"Bigger outfit \u2014 3,000 head \u2014 moving fast. They beat you to Abilene, price drops.",choices:[{text:"Push hard. Outpace them.",effects:{herdCondition:-8,morale:-3,supplies:-5,horses:-3},result:"Cattle drop weight. But you pull ahead."},{text:"Hold pace. Fat cattle sell higher.",outcomes:[{weight:6,effects:{morale:-2},result:"They pass you. But your cattle are fat."},{weight:4,effects:{morale:3},result:"They push too hard. Stampede. Tortoise and the hare."}]},{text:"Send a rider to lock in a price.",effects:{crew:-1,morale:2},result:"Sharpest man, fastest horse, letter of intent."}]},
{id:"prairie_fire",phase_min:0.1,phase_max:0.6,weight:3,title:"Smoke on the Horizon",text:"Prairie fire \u2014 line of orange to the west, wind pushing it toward you.",choices:[{text:"Set a backfire.",outcomes:[{weight:6,effects:{herd:-20,herdCondition:-3,morale:2},result:"Scout burns a strip. Twenty bolt. Professional work."},{weight:4,effects:{herd:-80,morale:-6,herdCondition:-5},result:"Backfire gets away. Fire on TWO sides. Eighty gone."}]},{text:"Drive east. Outflank it.",effects:{herdCondition:-5,morale:-3,supplies:-3,herd:-15},result:"Fire slides past. Fifteen scatter."},{text:"Find water.",outcomes:[{weight:4,effects:{herd:-5,morale:5,herdCondition:2},result:"Wide creek. Herd stands belly-deep while the world burns."},{weight:6,effects:{herd:-40,morale:-4,herdCondition:-4},result:"No creek. Forty head lost in the smoke."}]}]},
{id:"buyer",phase_min:0.7,phase_max:0.95,weight:4,title:"A Buyer on the Trail",text:"Man in a clean coat. $30 a head right now. Market is $40 but that\u2019s two weeks away.",choices:[{text:"Take the deal.",effects:{morale:8},result:"$30 a head. You left $25,000 on the table. But you\u2019re done.",earlyEnd:true},{text:"Counter at $35.",outcomes:[{weight:5,effects:{morale:6},result:"\u2018$33.\u2019 Done today.",earlyEnd:true},{weight:5,effects:{morale:-2},result:"\u2018$30 is the offer.\u2019 He rides on."}]},{text:"Refuse.",outcomes:[{weight:5,effects:{morale:4},result:"\u2018Your herd, your call.\u2019"},{weight:5,effects:{morale:-3},result:"That night a hand says Abilene prices dropped to $28."}]}]},
{id:"horse_thief",phase_min:0.2,phase_max:0.6,weight:3,title:"Missing Horses",text:"Morning count: eight horses gone. Tracks lead northeast.",choices:[{text:"Send riders after them.",outcomes:[{weight:5,effects:{morale:4,herdCondition:-3},result:"Horses back. One cowboy shot in the arm."},{weight:5,effects:{horses:-8,morale:-2,herdCondition:-4},result:"Lost the trail. Eight horses gone."}]},{text:"Let them go.",effects:{horses:-8,morale:-6},result:"A trail boss who won\u2019t fight for his remuda."},{text:"Double the watch.",effects:{horses:-8,morale:-4,herdCondition:-2},result:"Horses safer but cowboys wrecked from double watches."}]},
{id:"fever",phase_min:0.25,phase_max:0.7,weight:3,title:"Tick Fever",text:"Three dozen head stumbling, eyes glazed. It\u2019ll spread if you don\u2019t act.",choices:[{text:"Cut the sick ones.",effects:{herd:-36,morale:-2,herdCondition:4},result:"Thirty-six left standing. The fever stops."},{text:"Treat on the move.",outcomes:[{weight:5,effects:{herd:-100,herdCondition:-8,morale:-6,supplies:-4},result:"Fever spreads. A hundred dead."},{weight:5,effects:{herd:-15,herdCondition:-2,supplies:-4},result:"Cook\u2019s foul mixture saves half. Fifteen don\u2019t make it."}]},{text:"Push hard. Outrun the ticks.",effects:{herdCondition:-6,herd:-50,morale:-4,horses:-2},result:"You can\u2019t outrun ticks. Fifty drop."}]},
];

// ═══════════════════════════════════════════════════════════════
// CONSTANTS & HELPERS
// ═══════════════════════════════════════════════════════════════

const TOTAL_DAYS=70,DAYS_PER_TURN=5,TOTAL_DISTANCE=800;
const INIT_R:Resources={herd:2500,crew:12,horses:60,supplies:65,morale:55,herdCondition:60};
const PACES=[
  {id:"easy",label:"Easy",desc:"10 mi/day \u00b7 Herd fattens",mpd:10,fx:{herdCondition:2,morale:1,supplies:-1}as Resources},
  {id:"normal",label:"Normal",desc:"15 mi/day \u00b7 Standard",mpd:15,fx:{herdCondition:-1,morale:-1,supplies:-2}as Resources},
  {id:"push",label:"Push",desc:"22 mi/day \u00b7 Brutal",mpd:22,fx:{herdCondition:-5,morale:-4,supplies:-3}as Resources},
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
const GC:Record<string,string>={A:"text-emerald-400",B:"text-blue-400",C:"text-yellow-400",D:"text-orange-400",F:"text-red-500"};

const DEFAULT_OUTFIT: OutfitConfig = { herd: 2500, crew: 12, horses: 60, supplies: 65, guns: 4, spareParts: 3, wages: "standard", budgetSpent: 0, startingCash: 0 };
const makeInit=():GameState=>({day:1,turn:0,resources:{...INIT_R},phase:"intro",pace:"normal",distance:0,currentEvent:null,resultText:"",decisions:[],gameOver:false,survived:false,earlySale:false,outfit:{...DEFAULT_OUTFIT}});

// ═══════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════

export default function App(){
  const[campaign,setCampaign]=useState<string|null>(null);
  const[state,setState]=useState<GameState>(makeInit());
  const[usedEvents,setUsedEvents]=useState<Set<string>>(new Set());

  const start=useCallback(()=>{setState({...makeInit(),phase:"outfit"});setUsedEvents(new Set());},[]);
  const backToMenu=useCallback(()=>{setCampaign(null);setState(makeInit());},[]);

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
      s.turn+=1;const pace=PACES.find(p=>p.id===s.pace)!;
      s.distance=Math.min(s.distance+pace.mpd*DAYS_PER_TURN,TOTAL_DISTANCE);
      s.day=Math.min(s.day+DAYS_PER_TURN,TOTAL_DAYS+1);
      for(const[k,v]of Object.entries(pace.fx))s.resources[k]=clampR(k,s.resources[k]+v);
      // Crew eats — bigger crew drains faster
      const crewDrain = Math.ceil(s.resources.crew / 10);
      s.resources.supplies=clamp(s.resources.supplies-crewDrain,0,100);
      if(s.resources.herdCondition<20)s.resources.herd=Math.max(0,s.resources.herd-Math.ceil(Math.random()*40)-20);
      else if(s.resources.herdCondition<35&&Math.random()<0.4)s.resources.herd=Math.max(0,s.resources.herd-Math.ceil(Math.random()*15));
      if(s.resources.morale<15&&Math.random()<0.3)s.resources.crew=Math.max(0,s.resources.crew-1);
      if(s.resources.crew<=2||s.resources.herd<=100||s.resources.horses<=5)return{...s,phase:"end"as const,gameOver:true,survived:false};
      if(s.distance>=TOTAL_DISTANCE)return{...s,phase:"end"as const,gameOver:true,survived:true};
      const event=pickEvent(s.day,TOTAL_DAYS,usedEvents,EVENTS);
      if(event){setUsedEvents(p=>new Set(p).add(event.id));s.currentEvent=event;s.phase="event";}
      return s;
    });
  },[usedEvents]);

  const handleChoice=useCallback((ci:number)=>{
    setState(prev=>{
      if(!prev.currentEvent)return prev;
      const s:GameState={...prev,resources:{...prev.resources},decisions:[...prev.decisions]};
      const choice=s.currentEvent!.choices[ci];const outcome=resolveChoice(choice);
      s.decisions.push({event:s.currentEvent!.title,choice:choice.text,day:s.day});
      if(outcome.effects)for(const[k,v]of Object.entries(outcome.effects))if(s.resources[k]!==undefined)s.resources[k]=clampR(k,s.resources[k]+v);
      if(choice.earlyEnd||outcome.earlyEnd)s.earlySale=true;
      s.resultText=outcome.result||"";s.phase="result";return s;
    });
  },[]);

  const continueGame=useCallback(()=>{
    setState(prev=>{
      const s:GameState={...prev,currentEvent:null,resultText:""};
      if(s.resources.crew<=2||s.resources.herd<=100||s.resources.horses<=5)return{...s,phase:"end"as const,gameOver:true,survived:false};
      if(s.distance>=TOTAL_DISTANCE||s.earlySale)return{...s,phase:"end"as const,gameOver:true,survived:true};
      s.phase="sailing";return s;
    });
  },[]);

  const handleHunt=useCallback(()=>{
    setState(prev=>{
      const s:GameState={...prev,resources:{...prev.resources},decisions:[...prev.decisions]};
      const ammo=s.resources.ammo||0;
      if(ammo<5)return s; // shouldn't happen, button is hidden
      s.resources.ammo=ammo-5;
      // Hunting is HARD. More guns slightly help.
      const gunBonus=Math.min(s.outfit.guns,8);// max bonus from 8 rifles
      const roll=Math.random()*100;
      // Thresholds: base odds are bad. Guns shift them slightly.
      // 0-35: nothing. 35-55: scraps. 55-75: decent haul. 75-90: great. 90-95: accident. 95-100: disaster.
      const nothingCeil=35-gunBonus;
      const scrapsCeil=55-gunBonus*0.5;
      const decentCeil=75;
      const greatCeil=90;
      const accidentCeil=97;

      let result:string;
      if(roll<nothingCeil){
        result="Riders out for half a day. Saw a few jackrabbits. Shot at a pronghorn from too far. Nothing. Five rounds wasted, half a day gone.";
        s.resources.herdCondition=clamp(s.resources.herdCondition-1,0,100);
      }else if(roll<scrapsCeil){
        result="Couple of jackrabbits and a prairie chicken. Cookie makes a thin stew. It's something. Barely.";
        s.resources.supplies=clamp(s.resources.supplies+3,0,100);
        s.resources.herdCondition=clamp(s.resources.herdCondition-1,0,100);
      }else if(roll<decentCeil){
        result="Pronghorn buck. Clean shot. Good meat for three days. The crew eats something that isn't jerky for the first time in a week.";
        s.resources.supplies=clamp(s.resources.supplies+7,0,100);
        s.resources.morale=clamp(s.resources.morale+2,0,100);
      }else if(roll<greatCeil){
        result="Buffalo. Three of them grazing by a creek. Two clean kills. More meat than you can carry — jerky for a week, fresh steaks tonight. The cook is grinning.";
        s.resources.supplies=clamp(s.resources.supplies+14,0,100);
        s.resources.morale=clamp(s.resources.morale+4,0,100);
      }else if(roll<accidentCeil){
        result="Horse steps in a hole at full gallop. Rider thrown. Horse done. No game. One man limping back to the wagon with a broken arm. He'll ride, but he won't rope.";
        s.resources.horses=Math.max(0,s.resources.horses-1);
        s.resources.morale=clamp(s.resources.morale-3,0,100);
      }else{
        result="Spooked a rattlesnake den. Horse throws its rider, bolts into the herd. Mini stampede. Twenty head scatter. Rider's leg is broken — chuck wagon for the rest of the drive. And you still don't have food.";
        s.resources.horses=Math.max(0,s.resources.horses-1);
        s.resources.herd=Math.max(0,s.resources.herd-20);
        s.resources.morale=clamp(s.resources.morale-5,0,100);
      }
      s.decisions.push({event:"Hunting",choice:"Sent riders out",day:s.day});
      s.resultText=result;
      s.currentEvent={id:"hunt",phase_min:0,phase_max:1,weight:0,title:"Hunting Party",text:"",choices:[]};
      s.phase="result";
      return s;
    });
  },[]);

  const r=state.resources;
  const progress=Math.min((state.distance/TOTAL_DISTANCE)*100,100);
  const avg=Math.round((r.morale+r.herdCondition)/2);

  // ── CAMPAIGN SELECTOR ──
  if(!campaign){
    return(
      <div className="min-h-screen bg-stone-900 text-stone-100 flex flex-col items-center justify-center p-4" style={{fontFamily:"'Georgia',serif"}}>
        <div className="max-w-2xl w-full text-center space-y-6">
          <div>
            <h1 className="text-4xl font-bold tracking-wider text-amber-400">CAMPAIGNS</h1>
            <p className="text-stone-500 text-sm tracking-[0.2em] uppercase mt-1">World Studies Adventures</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Chisholm Trail */}
            <button onClick={()=>setCampaign("chisholm")} className="group relative overflow-hidden rounded-lg border-2 border-amber-800 hover:border-amber-500 transition-all text-left">
              <div className="relative h-36 overflow-hidden">
                <div className="absolute inset-0" style={{backgroundImage:"url(/faces/bg_sky.png)",backgroundSize:"cover",backgroundPosition:"center bottom",imageRendering:"pixelated"}}/>
                <div className="absolute bottom-0 left-0 right-0" style={{height:40,backgroundImage:"url(/faces/fg_cattle.png)",backgroundSize:"auto 100%",backgroundRepeat:"repeat-x",animation:"bgScroll 25s linear infinite",imageRendering:"pixelated"}}/>
                <div className="absolute inset-0 bg-gradient-to-t from-stone-900 via-transparent to-transparent"/>
              </div>
              <div className="p-3 bg-stone-800">
                <h2 className="text-lg font-bold text-amber-400 group-hover:text-amber-300">The Chisholm Trail</h2>
                <p className="text-xs text-stone-400 mt-1">Texas to Kansas &middot; 1867 &middot; 800 miles</p>
                <p className="text-xs text-stone-500 mt-2 leading-relaxed">Drive 2,500 longhorns from San Antonio to Abilene through river crossings, stampedes, and Indian Territory.</p>
                <span className="inline-block mt-2 text-xs font-bold text-emerald-400 bg-emerald-900/40 px-2 py-0.5 rounded">PLAYABLE</span>
              </div>
            </button>
            {/* Silk Road */}
            <button onClick={()=>setCampaign("silkroad")} className="group relative overflow-hidden rounded-lg border-2 border-indigo-800 hover:border-indigo-500 transition-all text-left">
              <div className="relative h-36 overflow-hidden bg-gradient-to-b from-indigo-900 via-amber-900/40 to-stone-900">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-6xl" style={{imageRendering:"pixelated"}}>🐫</span>
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-stone-900 via-transparent to-transparent"/>
              </div>
              <div className="p-3 bg-stone-800">
                <h2 className="text-lg font-bold text-indigo-400 group-hover:text-indigo-300">The Silk Road</h2>
                <p className="text-xs text-stone-400 mt-1">Chang&apos;an to Constantinople &middot; 130 BCE &middot; 4,000 miles</p>
                <p className="text-xs text-stone-500 mt-2 leading-relaxed">Lead a merchant caravan across deserts, mountains, and empires. Silk, spices, and survival.</p>
                <span className="inline-block mt-2 text-xs font-bold text-amber-400 bg-amber-900/40 px-2 py-0.5 rounded">COMING SOON</span>
              </div>
            </button>
          </div>
          <p className="text-xs text-stone-600 italic">More campaigns coming: Age of Exploration, Oregon Trail, Underground Railroad</p>
        </div>
      </div>
    );
  }

  // ── SILK ROAD STUB ──
  if(campaign==="silkroad"){
    return(
      <div className="min-h-screen bg-stone-900 text-stone-100 flex flex-col items-center justify-center p-4" style={{fontFamily:"'Georgia',serif"}}>
        <div className="max-w-md w-full text-center space-y-4">
          <span className="text-7xl">🐫</span>
          <h1 className="text-3xl font-bold tracking-wider text-indigo-400">THE SILK ROAD</h1>
          <p className="text-stone-500 text-xs tracking-[0.3em] uppercase">Chang&apos;an to Constantinople &middot; 130 BCE</p>
          <div className="border border-stone-700 rounded p-3 bg-stone-800/80 text-left space-y-2 text-sm text-stone-300 leading-relaxed">
            <p>You are a merchant in the Han Dynasty. Your caravan carries silk, jade, and bronze mirrors west through the Taklamakan Desert, over the Pamir Mountains, across Persia, to the markets of Rome.</p>
            <p>4,000 miles. Bandits, sandstorms, mountain passes, and empires that may or may not let you through.</p>
            <p className="text-indigo-300 font-bold">The goods are worth 100x what you paid &mdash; if you survive the road.</p>
          </div>
          <p className="text-amber-400 font-bold text-sm">Under construction &mdash; check back soon</p>
          <button onClick={backToMenu} className="px-6 py-2.5 bg-stone-700 hover:bg-stone-600 text-white font-bold rounded transition-colors tracking-wide">← BACK TO CAMPAIGNS</button>
        </div>
      </div>
    );
  }

  // ── INTRO ──
  if(state.phase==="intro"){
    return(
      <div className="h-screen bg-stone-900 text-stone-100 flex flex-col items-center justify-center p-4 overflow-hidden" style={{fontFamily:"'Georgia',serif"}}>
        <div className="max-w-md w-full text-center space-y-4">
          <div>
            <h1 className="text-3xl font-bold tracking-wider text-amber-400">CAMPAIGNS</h1>
            <p className="text-stone-500 text-xs tracking-[0.3em] uppercase mt-1">The Chisholm Trail &middot; 1867</p>
          </div>
          <PrairieScene progress={0} pace="easy" turn={0}/>
          <div className="border border-stone-700 rounded p-3 bg-stone-800/80 text-left space-y-2 text-sm text-stone-300 leading-relaxed">
            <p>Spring 1867. You&rsquo;re trail boss for a drive from San Antonio to Abilene, Kansas &mdash; 800 miles of open prairie, river crossings, and Indian Territory.</p>
            <p>2,500 head of Texas longhorn. Twelve cowboys, sixty horses. The cattle are worth $4 here. In Abilene, $40.</p>
            <p className="text-amber-300 font-bold">That&rsquo;s $100,000 at the end of the trail. If you get them there.</p>
          </div>
          <p className="text-xs text-stone-500 italic">Real drives lost 10-15% on average. Can you beat it?</p>
          <button onClick={start} className="px-6 py-2.5 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded transition-colors tracking-wide">HIT THE TRAIL</button>
          <button onClick={backToMenu} className="block mx-auto text-xs text-stone-500 hover:text-stone-300 transition-colors">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── OUTFIT ──
  if(state.phase==="outfit"){
    return <OutfitScreen onDone={onOutfitDone}/>;
  }

  // ── END ──
  if(state.phase==="end"){
    const o=state.outfit;
    const pct=Math.round((r.herd/o.herd)*100);
    const grade=getGrade2(r.herd,o.herd,state.survived);
    const salePrice=state.earlySale?30:40;
    const revenue=state.survived?r.herd*salePrice:0;
    const cattleCost=o.herd*4;
    const outfitCost=o.budgetSpent;
    const totalCost=cattleCost+outfitCost;
    const profit=revenue-totalCost;
    return(
      <div className="h-screen bg-stone-900 text-stone-100 p-4 overflow-y-auto" style={{fontFamily:"'Georgia',serif"}}>
        <div className="max-w-lg mx-auto space-y-4">
          <h1 className={`text-2xl font-bold text-center ${state.survived?"text-amber-400":"text-red-500"}`}>
            {state.survived?(state.earlySale?"SOLD ON THE TRAIL":"ABILENE"):"THE TRAIL WINS"}
          </h1>
          <PrairieScene progress={progress} pace={state.pace} turn={state.turn}/>
          <p className="text-center text-stone-300 text-sm">
            {state.survived
              ?state.earlySale?`Sold ${r.herd.toLocaleString()} head at $${salePrice}. Revenue: $${revenue.toLocaleString()}.`
              :`Delivered ${r.herd.toLocaleString()} of ${o.herd.toLocaleString()} head (${pct}%) to Abilene.`
              :"The herd scattered. The trail won."}
          </p>

          {/* Ledger */}
          <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1 text-xs">
            <h2 className="text-amber-300 font-bold uppercase tracking-wide text-center mb-1">The Ledger</h2>
            <div className="flex justify-between text-stone-400"><span>Cattle purchased ({o.herd.toLocaleString()} @ $4)</span><span className="text-red-400">-${cattleCost.toLocaleString()}</span></div>
            <div className="flex justify-between text-stone-400"><span>Outfit costs</span><span className="text-red-400">-${outfitCost.toLocaleString()}</span></div>
            {state.survived&&<div className="flex justify-between text-stone-400"><span>Sale ({r.herd.toLocaleString()} @ ${salePrice})</span><span className="text-emerald-400">+${revenue.toLocaleString()}</span></div>}
            <div className="border-t border-stone-600 mt-1 pt-1 flex justify-between font-bold">
              <span className="text-stone-200">Net profit</span>
              <span className={profit>=0?"text-emerald-400":"text-red-500"}>{profit>=0?"+":""}${profit.toLocaleString()}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1">
              <h2 className="text-amber-300 font-bold text-xs uppercase tracking-wide text-center">Your Drive</h2>
              {([["Started",o.herd.toLocaleString()],["Delivered",r.herd.toLocaleString()],["Lost",(o.herd-r.herd).toLocaleString()],["Crew lost",String(o.crew-r.crew)]]as[string,string][]).map(([l,v])=>(<div key={l} className="flex justify-between text-stone-400"><span>{l}</span><span className="text-stone-200">{v}</span></div>))}
            </div>
            <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1">
              <h2 className="text-blue-300 font-bold text-xs uppercase tracking-wide text-center">Real Average</h2>
              {([["Herd","2,000-3,000"],["Avg loss","10-15%"],["Duration","2-3 months"],["Price","$30-40/hd"]]as[string,string][]).map(([l,v])=>(<div key={l} className="flex justify-between text-stone-400"><span>{l}</span><span className="text-stone-200">{v}</span></div>))}
            </div>
          </div>
          <div className="text-center"><span className="text-stone-500 text-xs">GRADE </span><span className={`text-4xl font-bold ${GC[grade]}`}>{grade}</span></div>
          <div className="bg-stone-800 border border-stone-700 rounded p-3">
            <p className="text-xs text-stone-500 leading-relaxed">Between 1867 and 1871, 1.5 million head were driven up the Chisholm Trail. Cowboys earned $25-40/month for work that could kill them any Tuesday. Jesse Chisholm himself never drove cattle &mdash; he was a trader who wore the path into the grass.</p>
          </div>
          {state.decisions.length>0&&(
            <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wide">Decisions</h3>
              {state.decisions.map((d,i)=>(<p key={i} className="text-xs text-stone-500"><span className="text-stone-600">Day {d.day}:</span> <span className="text-stone-400">{d.event}</span> &mdash; {d.choice}</p>))}
            </div>
          )}
          <div className="text-center pb-4 space-y-2"><button onClick={()=>{setState(makeInit());setUsedEvents(new Set());}} className="px-5 py-2 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded transition-colors">Ride Again</button><br/><button onClick={backToMenu} className="text-xs text-stone-500 hover:text-stone-300 transition-colors">← Back to Campaigns</button></div>
        </div>
      </div>
    );
  }

  // ── MAIN GAME ──
  return(
    <div className="h-screen bg-stone-900 text-stone-100 flex flex-col overflow-hidden" style={{fontFamily:"'Georgia',serif"}}>
      {/* Prairie Scene — hero visual */}
      <div className="flex-shrink-0 bg-stone-800">
        <div className="max-w-lg mx-auto">
          <PrairieScene progress={progress} pace={state.pace} turn={state.turn}/>
        </div>
      </div>

      {/* Resources — compact */}
      <div className="flex-shrink-0 bg-stone-800/90 border-b border-stone-700 px-3 py-1.5">
        <div className="max-w-lg mx-auto">
          <div className="grid grid-cols-3 gap-x-4 text-xs">
            {([{i:"\uD83D\uDC02",l:"Herd",v:r.herd,t:[Math.round(state.outfit.herd*0.8),Math.round(state.outfit.herd*0.6)]},{i:"\uD83E\uDD20",l:"Crew",v:r.crew,t:[Math.round(state.outfit.crew*0.75),Math.round(state.outfit.crew*0.5)]},{i:"\uD83D\uDC0E",l:"Horses",v:r.horses,t:[Math.round(state.outfit.horses*0.67),Math.round(state.outfit.horses*0.33)]}]as{i:string;l:string;v:number;t:number[]}[]).map(({i,l,v,t})=>(
              <div key={l} className="flex items-center justify-between"><span className="text-stone-400">{i} {l}</span><span className={`font-mono ${v>t[0]?"text-emerald-400":v>t[1]?"text-yellow-400":"text-red-400"}`}>{v>99?v.toLocaleString():v}</span></div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-4 mt-0.5 text-xs">
            <div className="flex items-center justify-between"><span className="text-stone-400">{"\uD83D\uDD2B"} Ammo</span><span className={`font-mono ${(r.ammo||0)>20?"text-stone-300":(r.ammo||0)>5?"text-yellow-400":"text-red-400"}`}>{r.ammo||0} rds</span></div>
            <div className="flex items-center justify-between"><span className="text-stone-400">{"\uD83D\uDD27"} Parts</span><span className={`font-mono ${(r.spareParts||0)>2?"text-stone-300":(r.spareParts||0)>0?"text-yellow-400":"text-red-400"}`}>{r.spareParts||0} sets</span></div>
          </div>
          <div className="mt-1 space-y-0.5">
            {([{l:"Supplies",v:r.supplies,i:"\uD83C\uDF56"},{l:"Morale",v:r.morale,i:"\uD83D\uDD25"},{l:"Herd Shape",v:r.herdCondition,i:"\uD83D\uDCAA"}]as{l:string;v:number;i:string}[]).map(({l,v,i})=>(
              <div key={l} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-center" style={{fontSize:10}}>{i}</span>
                <span className="w-16 text-stone-400">{l}</span>
                <div className="flex-1 bg-stone-700 rounded-full h-1.5 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${v>=60?"bg-emerald-500":v>=40?"bg-yellow-500":v>=20?"bg-orange-500":"bg-red-600"}`} style={{width:`${v}%`}}/>
                </div>
                <span className="w-5 text-right text-stone-500 font-mono" style={{fontSize:10}}>{v}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-stone-500 mt-0.5"><span>Day {Math.min(state.day,TOTAL_DAYS)}</span><span>{Math.round(state.distance)}/{TOTAL_DISTANCE} mi</span></div>
        </div>
      </div>

      {/* Main content — scrollable */}
      <div className="flex-1 min-h-0 p-3 overflow-y-auto">
        <div className="max-w-lg mx-auto">
          {state.phase==="sailing"&&(
            <div className="space-y-2.5">
              <p className="text-center text-amber-200/80 italic text-sm py-1">{getPhrase(state.day/TOTAL_DAYS)}</p>
              <div className="flex gap-1.5">
                {PACES.map(p=>(
                  <button key={p.id} onClick={()=>setState(s=>({...s,pace:p.id}))}
                    className={`flex-1 p-2 rounded text-xs border transition-colors ${state.pace===p.id?"bg-amber-700 border-amber-600 text-white":"bg-stone-800 border-stone-600 text-stone-300 hover:bg-stone-700"}`}>
                    <div className="font-bold">{p.label}</div>
                    <div className="opacity-60 mt-0.5" style={{fontSize:10}}>{p.desc}</div>
                  </button>
                ))}
              </div>
              <button onClick={advanceTurn} className="w-full py-2 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded transition-colors">Drive On &mdash; {DAYS_PER_TURN} days</button>
              {(r.ammo||0)>=5&&r.supplies<45&&(
                <button onClick={handleHunt} className="w-full py-2 bg-stone-700 hover:bg-stone-600 text-stone-200 border border-stone-500 rounded transition-colors text-sm">
                  {"\uD83D\uDD2B"} Send Hunters &mdash; costs 5 ammo, half a day ({r.ammo||0} rds left)
                </button>
              )}
            </div>
          )}
          {state.phase==="event"&&state.currentEvent&&(
            <VisualNovelEngine
              currentEvent={state.currentEvent}
              handleChoice={handleChoice}
              bossHealth={avg}
              scoutHealth={r.morale}
            />
          )}
          {state.phase==="result"&&(
            <div className="space-y-2.5">
              <div className="bg-stone-800 border border-stone-700 rounded p-3">
                <h2 className="text-amber-400 font-bold mb-1.5">{state.currentEvent?.title}</h2>
                <p className="text-stone-300 text-sm leading-relaxed">{state.resultText}</p>
              </div>
              <button onClick={continueGame} className="w-full py-2 bg-stone-700 hover:bg-stone-600 text-white font-bold rounded transition-colors">Continue</button>
            </div>
          )}
        </div>
      </div>

      {/* Crew Faces HUD — DoomHUD */}
      <DoomHUD members={[
        { id: "boss", role: "Boss", label: "Trail Boss", health: avg },
        { id: "scout", role: "Scout", label: "Scout", health: r.morale },
        { id: "cook", role: "Cookie", label: "Cook", health: r.supplies },
        { id: "wrangler", role: "Wrangler", label: "Wrangler", health: (r.horses / state.outfit.horses) * 100 },
        { id: "point", role: "Point", label: "Point Rider", health: r.herdCondition },
        { id: "hand", role: "Crew", label: "Crew", health: (r.crew / state.outfit.crew) * 100 },
      ]} />
    </div>
  );
}
