import { useState, useCallback } from "react";
import PushYourLuckEngine from "./PushYourLuckEngine";
import DoomHUD from "./DoomHUD";
import { getDoomFace } from "./AssetConfig";
import TriviaEngine, { pickTriviaQuestion, type TriviaQuestion } from "./SilkRoadTrivia";

// ═══════════════════════════════════════════════════════════════
// SILK ROAD — Chang'an to Constantinople, 130 BCE
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
  image?: string; // 🔴 NEW: Image support             
}
interface Decision { event: string; choice: string; day: number; }

interface CaravanConfig {
  goods: number;
  camels: number;
  guards: number;
  water: number;
  rations: number;
  spareParts: number;
  medicine: number;
  cartGear: number;
  silver: number;
  budgetSpent: number;
}

interface SRState {
  day: number; turn: number; resources: Resources;
  phase: "intro" | "outfit" | "traveling" | "event" | "result" | "end" | "trivia";
  pace: string; distance: number; currentEvent: GameEvent | null;
  resultText: string; decisions: Decision[];
  gameOver: boolean; survived: boolean; earlySale: boolean;
  saleCity: string; saleMultiplier: number;
  outfit: CaravanConfig;
  culturalExchange: number;
  culturalLog: string[];
  triviaCounter: number;        // counts events since last trivia
  currentTrivia: TriviaQuestion | null;
  usedTriviaIds: Set<string>;
  triviaStreak: number;          // consecutive correct answers
  caravanFeed: string[];
  hardPaceStreak: number;
}

const TOTAL_DISTANCE = 4000;
const JOURNEY_DAYS = 120;

const INIT_R: Resources = {
  goods: 100, water: 50, rations: 55, camels: 20, morale: 55,
  silver: 100, guards: 6, crew: 4, spareParts: 3, medicine: 2,
  cartCondition: 72, fatigue: 10, sickness: 8,
};

const DEFAULT_OUTFIT: CaravanConfig = {
  goods: 100, camels: 20, guards: 6, water: 50, rations: 55,
  spareParts: 3, medicine: 2, cartGear: 2, silver: 100, budgetSpent: 0,
};

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function pickEvent(day: number, td: number, evts: GameEvent[], used: Set<string>): GameEvent | null {
  const p = day / td;
  const el = evts.filter(e => p >= e.phase_min && p <= e.phase_max && !used.has(e.id));
  const pool = el.length > 0 ? el : evts.filter(e => p >= e.phase_min && p <= e.phase_max);
  if (pool.length === 0) return null;
  const tw = pool.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * tw;
  for (const e of pool) { r -= e.weight; if (r <= 0) return e; }
  return pool[pool.length - 1];
}

// ═══════════════════════════════════════════════════════════════
// EVENTS - SILK ROAD JOURNEY EVENTS & IMAGES
// ═══════════════════════════════════════════════════════════════

const EVENTS: GameEvent[] = [
  // ── DESERT PHASE (0-0.3) ──
  {id:"taklamakan",phase_min:0,phase_max:0.25,weight:5,title:"The Sea of Death",text:"You face the Taklamakan Desert. If water runs low, camels and crew can collapse before you reach the next well.",trivia:["Many Silk Road caravans traveled at dawn and dusk to save water.","Desert route markers were often bones, stones, and old camp ash."],sageAdvice:[{name:"Master Liu",role:"Han mapmaker",line:"Follow oasis paths when you can. Water keeps animals and people alive."},{name:"Amina",role:"Sogdian guide",line:"Tie bells to lead camels at night. In storms, sound helps your group stay together."}],choices:[
    {text:"Take the northern route. Follow the oasis trail.",outcomes:[
      {weight:6,effects:{water:-8,camels:-1},result:"Slow travel, but the oases keep the caravan alive. One camel collapses in the dunes."},
      {weight:4,effects:{water:-4,morale:3},result:"Your guide finds every hidden well. The caravan stays strong and hopeful."}
    ]},
    {text:"Go straight through. Save time.",outcomes:[
      {weight:4,effects:{water:-20,camels:-4,morale:-8,goods:-10},result:"A sandstorm hits hard. Four camels are buried. Water runs out by the third dawn."},
      {weight:6,effects:{water:-15,morale:5,camels:-2},result:"The crossing is harsh. Two camels are lost, but you reach the far side faster."}
    ]},
    {text:"Wait for a Sogdian caravan and follow them.",outcomes:[
      {weight:5,effects:{water:-6,morale:2,silver:-15},result:"A caravan arrives and lets you join for a high fee. It is safer than going alone."},
      {weight:5,effects:{water:-12,morale:-5},result:"You wait four days, but no caravan comes. Supplies run low."}
    ]}
  ]},
  
  {id:"imperial_audit",image:"evt_audit.png",phase_min:0.05,phase_max:0.35,weight:4,title:"Inspector from Chang'an",text:"A Han inspector stops your caravan to count silk and collect tax. If he is not satisfied, you lose time, silver, or goods.",choices:[
    {text:"Offer silver and ask for a kind report.",effects:{silver:-25,morale:2},result:"You hand over 25 silver. He writes a friendly report and rides back east."},
    {text:"Explain your journey in detail.",outcomes:[
      {weight:5,effects:{morale:-4},result:"He says your records are messy and gives you a fine."},
      {weight:5,effects:{morale:4},result:"He sees your hardships, approves your records, and lets you pass."}
    ]},
    {text:"Gift one bale of silk for the imperial storehouse.",effects:{goods:-5,culturalExchange:1},result:"He accepts the gift and marks your caravan as cooperative in his scroll."}
  ]},

  // 🔴 PUSH YOUR LUCK: ABANDONED OUTPOST 
  {
    id: "ruined_outpost",
    image: "evt_outpost.png",
    phase_min: 0.15,
    phase_max: 0.45,
    weight: 6,
    type: "push_luck",
    title: "Abandoned Han Outpost",
    text: "You find a ruined watchtower half-buried in the dunes. The garrison is long gone. There may be supplies inside, but the stone roof looks ready to fall.",
    leaveText: "Leave it. It looks unsafe.",
    attempts: [
      {
        id: "outpost_1",
        buttonText: "Search the outer courtyard",
        successText: "You find a half-buried lockbox of silver coins from the old garrison.",
        failureText: "A guard sprains an ankle on loose stones. You lose time and morale.",
        riskChance: 0.15,
        rewards: { silver: 25 },
        penalties: { morale: -3 }
      },
      {
        id: "outpost_2",
        buttonText: "Pry open the sealed storehouse",
        successText: "Jackpot. Untouched water skins and a bundle of raw silk left off the official ledger.",
        failureText: "The door was trapped. A beam falls and crushes a camel.",
        riskChance: 0.40,
        rewards: { water: 15, goods: 5 },
        penalties: { camels: -1, morale: -5 }
      },
      {
        id: "outpost_3",
        buttonText: "Dig into the commander's rooms",
        successText: "Found the commander's personal stash and ancient tactical maps. A fortune.",
        failureText: "The entire structure caved in. It took hours to dig your men out. Morale is shattered.",
        riskChance: 0.75,
        rewards: { silver: 60, culturalExchange: 5 },
        penalties: { guards: -1, crew: -1, morale: -15 }
      }
    ]
  },

  {id:"guard_strike",phase_min:0.2,phase_max:0.6,weight:4,title:"Guards Demand More Pay",text:"Your guards warn that raids are increasing. If they leave, your crew has less protection on the road.",choices:[
    {text:"Pay more so they stay.",effects:{silver:-40,morale:5},result:"They accept the silver and stand ready again."},
    {text:"Refuse the demand.",outcomes:[
      {weight:4,effects:{guards:-2,morale:-8},result:"Two of your best guards quit on the spot and walk back east. You are now severely understaffed in bandit territory."},
      {weight:6,effects:{morale:-2},result:"After a tense talk, they agree to keep marching."}
    ]},
    {text:"Give their leader 10 silver to calm things down.",effects:{silver:-10,morale:3},result:"Their leader takes the gift and convinces the others to keep working."}
  ]},

  // ── MOUNTAIN/CENTRAL PHASE (0.25-0.6) ──
  {id:"pamir_pass",phase_min:0.3,phase_max:0.5,weight:5,title:"The Roof of the World",text:"You climb into the Pamir Mountains. Thin air and snow can cost you camels, supplies, and travel days.",choices:[
    {text:"Take the high pass. Brutal, but fast.",outcomes:[
      {weight:5,effects:{camels:-5,goods:-10,morale:-6,crew:-1},result:"A disaster. Five camels slip into a gorge. Ten bales of silk are lost."},
      {weight:5,effects:{camels:-2,morale:4},result:"Clear skies help you through. Two camels are lost, but spirits rise."}
    ]},
    {text:"Take the valley route. Longer, but safer.",effects:{water:-8,camels:-1,morale:1},result:"You spend five extra days, but everyone survives. One camel is hurt on loose rock."},
    {text:"Hire local Tajik guides.",outcomes:[
      {weight:7,effects:{silver:-20,culturalExchange:2,morale:3},result:"Money well spent. They know every switchback. They share local folklore, which your translator meticulously documents."},
      {weight:3,effects:{silver:-20,goods:-15,morale:-5},result:"The guides vanish in the night with fifteen bales of silk."}
    ]}
  ]},

  {id:"samarkand",phase_min:0.35,phase_max:0.5,weight:5,title:"The Jewel of the Road",text:"You reach Samarkand, a major trade city. Sell now for safety, or keep moving for a bigger reward later.",choices:[
    {text:"Sell all now for 15x.",effects:{morale:8},result:"1,500 silver. The journey ends in dazzling Samarkand.",earlyEnd:true},
    {text:"Sell one quarter, then keep going.",effects:{goods:-25,silver:375,water:15,morale:3},result:"You gain silver and water, and still carry plenty of goods west."},
    {text:"Buy Samarkand specialties to flip in Rome.",outcomes:[
      {weight:6,effects:{silver:-50,goods:20,culturalExchange:2},result:"You buy lapis lazuli and fine paper. Roman buyers value both goods highly."},
      {weight:4,effects:{silver:-50,goods:10,morale:-2},result:"You pay too much. Your guards grumble at the poor trade."}
    ]}
  ]},
  
  // 🔴 PUSH YOUR LUCK: SOGDIAN BAZAAR
  {
    id: "sogdian_bazaar",
    image: "evt_bazaar.png",
    phase_min: 0.4,
    phase_max: 0.6,
    weight: 6,
    type: "push_luck",
    title: "The Back Alleys of Samarkand",
    text: "A shady Sogdian broker pulls you aside. He offers to trade rare lapis lazuli for your silk, but he wants to haggle. The longer you push him, the better the margin, but his patience is thin and his bodyguards look huge.",
    leaveText: "Take the current deal and walk away.",
    attempts: [
      {
        id: "bazaar_1",
        buttonText: "Ask for the usual bazaar price",
        successText: "He agrees after a long sigh. It is a fair trade.",
        failureText: "He takes offense to your tone and walks away. Deal's off.",
        riskChance: 0.20,
        rewards: { silver: 30 },
        penalties: { morale: -2 }
      },
      {
        id: "bazaar_2",
        buttonText: "Push hard for a lower price",
        successText: "He gives in. You get excellent gems for less silver.",
        failureText: "His bodyguards step in. They rough up your guards and seize one bale of silk.",
        riskChance: 0.50,
        rewards: { silver: 45, goods: 5 },
        penalties: { goods: -5, guards: -1, morale: -8 }
      },
      {
        id: "bazaar_3",
        buttonText: "Threaten to trade with a rival stall",
        successText: "He panics and offers his best goods at a very low price.",
        failureText: "The plan fails, and his guards attack in the alley.",
        riskChance: 0.85,
        rewards: { silver: 100, culturalExchange: 4 },
        penalties: { silver: -50, goods: -10, morale: -15 }
      }
    ]
  },

  {id:"parthian_toll",phase_min:0.55,phase_max:0.75,weight:4,title:"The Parthian Border",text:"Parthian soldiers block the pass and demand a toll. What you do here affects your goods, silver, and morale.",choices:[
    {text:"Pay the toll and move on.",effects:{goods:-20,morale:-2},result:"They take exactly 20%, then wave you through."},
    {text:"Negotiate. Offer 10% and useful news.",outcomes:[
      {weight:5,effects:{goods:-10,culturalExchange:1,morale:2},result:"The captain is more interested in Chinese military innovations than silk. You trade stories for a discount."},
      {weight:5,effects:{goods:-25,morale:-4},result:"They reject your offer and take 25% for the delay."}
    ]},
    {text:"Find an undocumented bypass route.",outcomes:[
      {weight:4,effects:{silver:-25,morale:3},result:"You bribe a shepherd to show you a goat trail. It adds three days, but you avoid the tariff entirely."},
      {weight:6,effects:{silver:-25,goods:-30,guards:-1,morale:-6},result:"The guide leads you into an ambush. You lose 30 bales and a guard."}
    ]}
  ]},
  
  // ── ROMAN WORLD (0.7-1.0) ──
  {id:"antioch",phase_min:0.75,phase_max:0.88,weight:5,title:"Antioch — Rome's Eastern Door",text:"You arrive at Antioch near the sea. You can take a huge profit now or risk the road ahead.",choices:[
    {text:"Sell here for 60x and end the trip.",effects:{morale:8},result:"6,000 silver. A huge success, and a safe ending.",earlyEnd:true},
    {text:"Sell half. Save the best silk for Constantinople.",effects:{goods:-50,silver:3000,morale:4},result:"Half sells for 60x. You keep top silk for one last market."},
    {text:"Buy Roman goods for the return trip.",outcomes:[
      {weight:6,effects:{silver:-100,goods:10,culturalExchange:3},result:"Roman glassware and gold coins. If you return safely, these goods can sell for 50x in Chang'an."},
      {weight:4,effects:{silver:-100,goods:5},result:"You paid too much for common trinkets. It is a costly lesson."}
    ]}
  ]},
  {id:"roman_silk",phase_min:0.7,phase_max:0.95,weight:3,title:"The Senate's Obsession",text:"A Roman noble asks for a private silk sale. You could earn fast gold, but danger rises after dark.",choices:[
    {text:"Take the secret deal.",outcomes:[
      {weight:5,effects:{goods:-30,silver:600,morale:3},result:"Done in a warehouse at midnight. She pays in gold and leaves quickly."},
      {weight:5,effects:{goods:-30,silver:600,morale:-5,guards:-1},result:"Roman guards raid the warehouse. You escape with gold, but one guard is lost."}
    ]},
    {text:"Sell only in the public market.",effects:{goods:-20,silver:200,morale:2},result:"You get a fair legal price, with less danger."},
    {text:"Give silk gifts to build friendships.",effects:{goods:-10,culturalExchange:3,morale:4},result:"Important Romans remember your caravan and treat you kindly."}
  ]},
  {id:"constantinople_arrival",phase_min:0.92,phase_max:1.0,weight:6,title:"The Golden City",text:"You reach Constantinople after a long journey. Your final choice decides your last profit and your story's ending.",choices:[
    {text:"Sell everything at 100x.",effects:{morale:10},result:"A great finish. Every bale sells at top price.",earlyEnd:true},
    {text:"Sell the goods, but keep one bale for yourself.",effects:{goods:-5,morale:8,culturalExchange:1},result:"You keep the finest silk as a memory of your long desert journey."},
    {text:"Open a permanent trade house.",effects:{silver:-200,culturalExchange:5,morale:6},result:"You hire locals, rent a warehouse, and build a lasting east-west trade link."}
  ]}
];

// ═══════════════════════════════════════════════════════════════
// OUTFIT SCREEN
// ═══════════════════════════════════════════════════════════════

const OUTFIT_BUDGET = 620;

function SilkRoadOutfit({ onDone }: { onDone: (config: CaravanConfig) => void }) {
  const [extraCamels, setExtraCamels] = useState(4);
  const [extraGuards, setExtraGuards] = useState(2);
  const [extraWater, setExtraWater] = useState(10);
  const [extraRations, setExtraRations] = useState(12);
  const [extraGoods, setExtraGoods] = useState(18);
  const [spareParts, setSpareParts] = useState(3);
  const [medicine, setMedicine] = useState(2);
  const [cartGear, setCartGear] = useState(2);

  const baseCamels = 14, baseGuards = 4, baseWater = 36, baseRations = 40, baseGoods = 72;
  const camels = baseCamels + extraCamels;
  const guards = baseGuards + extraGuards;
  const water = baseWater + extraWater;
  const rations = baseRations + extraRations;
  const goods = baseGoods + extraGoods;

  const spent = extraCamels * 24 + extraGuards * 42 + extraWater * 4 + extraRations * 3 + extraGoods * 5 + spareParts * 24 + medicine * 26 + cartGear * 38;
  const remaining = OUTFIT_BUDGET - spent;

  const loadRatio = goods / Math.max(camels, 1);
  const loadLabel = loadRatio > 7 ? "Overloaded" : loadRatio > 5.5 ? "Heavy" : loadRatio > 4.2 ? "Balanced" : "Light";
  const loadColor = loadRatio > 7 ? "text-red-500" : loadRatio > 5.5 ? "text-orange-400" : loadRatio > 4.2 ? "text-emerald-400" : "text-blue-400";

  return (
    <div className="west-app h-screen bg-stone-900 text-stone-100 flex flex-col overflow-hidden" style={{ fontFamily: "'Georgia',serif" }}>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-indigo-300">PREPARE THE CARAVAN</h1>
            <p className="text-stone-500 text-xs mt-1">Chang'an Caravan Yard · 130 BCE</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-2">
              <div className="flex justify-between text-sm"><span>🐫 Camels</span><span className="text-amber-300 font-bold">{camels}</span></div>
              <input type="range" min={0} max={12} value={extraCamels} onChange={e => setExtraCamels(+e.target.value)} className="w-full accent-amber-500" />
              <p className="text-xs text-stone-500">24 silver each · Endurance and cargo movement</p>

              <div className="flex justify-between text-sm"><span>⚔️ Guards</span><span className="text-amber-300 font-bold">{guards}</span></div>
              <input type="range" min={0} max={8} value={extraGuards} onChange={e => setExtraGuards(+e.target.value)} className="w-full accent-amber-500" />
              <p className="text-xs text-stone-500">42 silver each · Night watch and road security</p>

              <div className="flex justify-between text-sm"><span>💧 Water Capacity</span><span className="text-amber-300 font-bold">{water}</span></div>
              <input type="range" min={0} max={24} value={extraWater} onChange={e => setExtraWater(+e.target.value)} className="w-full accent-amber-500" />
              <p className="text-xs text-stone-500">4 silver per skin · Desert survival</p>

              <div className="flex justify-between text-sm"><span>🥖 Rations</span><span className="text-amber-300 font-bold">{rations}</span></div>
              <input type="range" min={0} max={30} value={extraRations} onChange={e => setExtraRations(+e.target.value)} className="w-full accent-amber-500" />
              <p className="text-xs text-stone-500">3 silver each · Crew stamina and morale</p>
            </div>

            <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-2">
              <div className="flex justify-between text-sm"><span>📦 Trade Goods</span><span className="text-amber-300 font-bold">{goods}</span></div>
              <input type="range" min={0} max={44} value={extraGoods} onChange={e => setExtraGoods(+e.target.value)} className="w-full accent-amber-500" />
              <p className="text-xs text-stone-500">5 silver each · Profit engine, but heavier load</p>

              <div className="flex justify-between text-sm"><span>🧰 Spare Parts</span><span className="text-amber-300 font-bold">{spareParts}</span></div>
              <input type="range" min={0} max={8} value={spareParts} onChange={e => setSpareParts(+e.target.value)} className="w-full accent-amber-500" />
              <p className="text-xs text-stone-500">24 silver each · Keeps carts moving</p>

              <div className="flex justify-between text-sm"><span>🩺 Medicine</span><span className="text-amber-300 font-bold">{medicine}</span></div>
              <input type="range" min={0} max={7} value={medicine} onChange={e => setMedicine(+e.target.value)} className="w-full accent-amber-500" />
              <p className="text-xs text-stone-500">26 silver each · Lowers sickness losses</p>

              <div className="flex justify-between text-sm"><span>🛞 Cart Gear</span><span className="text-amber-300 font-bold">Tier {cartGear + 1}</span></div>
              <input type="range" min={0} max={4} value={cartGear} onChange={e => setCartGear(+e.target.value)} className="w-full accent-amber-500" />
              <p className="text-xs text-stone-500">38 silver per tier · Better durability</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-stone-800 border border-stone-700 rounded p-2"><span className="text-stone-500">Load:</span> <span className={`font-bold ${loadColor}`}>{loadLabel}</span></div>
            <div className="bg-stone-800 border border-stone-700 rounded p-2"><span className="text-stone-500">Budget:</span> <span className={`font-bold ${remaining >= 0 ? "text-emerald-400" : "text-red-500"}`}>{remaining}</span></div>
            <div className="bg-stone-800 border border-stone-700 rounded p-2"><span className="text-stone-500">Water+Food:</span> <span className="font-bold text-blue-300">{water + rations}</span></div>
            <div className="bg-stone-800 border border-stone-700 rounded p-2"><span className="text-stone-500">Repair Reserve:</span> <span className="font-bold text-amber-300">{spareParts + cartGear}</span></div>
          </div>

          {remaining < 0 && <p className="text-red-400 text-xs text-center">Over budget. Remove cargo or equipment to proceed.</p>}

          <div className="text-center pb-4">
            <button
              onClick={() => onDone({ goods, camels, guards, water, rations, spareParts, medicine, cartGear, silver: remaining + 40, budgetSpent: spent })}
              disabled={remaining < 0}
              className={`px-6 py-2.5 font-bold rounded transition-colors tracking-wide ${remaining >= 0 ? "bg-indigo-700 hover:bg-indigo-600 text-white" : "bg-stone-700 text-stone-500 cursor-not-allowed"}`}
            >
              FINALIZE MANIFEST
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// GRADE
// ═══════════════════════════════════════════════════════════════

function getSilkRoadGrade(survived: boolean, profitMultiplier: number, culturalExchange: number): string {
  if (!survived) return profitMultiplier > 5 ? "D" : "F";
  const profitScore = Math.min(profitMultiplier / 100, 1) * 40; 
  const survivalScore = 30; 
  const cultureScore = Math.min(culturalExchange / 30, 1) * 30; 
  const total = profitScore + survivalScore + cultureScore;
  if (total >= 85) return "A+";
  if (total >= 75) return "A";
  if (total >= 65) return "B";
  if (total >= 50) return "C";
  return "D";
}

const GC: Record<string, string> = { "A+": "text-amber-300", A: "text-emerald-400", B: "text-blue-400", C: "text-orange-400", D: "text-red-400", F: "text-red-600" };

const SILK_STOPS = [
  { id: "changan", name: "Chang'an", pct: 0 },
  { id: "dunhuang", name: "Dunhuang", pct: 14 },
  { id: "taklamakan", name: "Taklamakan", pct: 28 },
  { id: "samarkand", name: "Samarkand", pct: 50 },
  { id: "merv", name: "Merv", pct: 62 },
  { id: "antioch", name: "Antioch", pct: 82 },
  { id: "constantinople", name: "Constantinople", pct: 100 },
];

function isNearSilkStop(progress: number) {
  return SILK_STOPS.find((s) => Math.abs(s.pct - progress) <= 5) || null;
}

function buildCaravanFeed(resources: Resources, pace: string, distanceGain: number, day: number, hardPaceStreak: number): string[] {
  const notes: string[] = [];
  notes.push(`Day ${day}: the caravan made about ${Math.round(distanceGain)} miles at ${pace} pace.`);

  if ((resources.water || 0) < 20) notes.push("Water stores are holding, but only just.");
  if ((resources.rations || 0) < 20) notes.push("The cooks are stretching supplies carefully.");
  if ((resources.camels || 0) < 10) notes.push("Several animals are tiring under the current load.");
  if ((resources.guards || 0) < 4) notes.push("The guards report a restless night watch.");
  if ((resources.cartCondition || 0) < 35) notes.push("One cart is not riding smoothly.");
  if ((resources.spareParts || 0) <= 0) notes.push("No spare parts remain for another major repair.");
  if ((resources.fatigue || 0) > 65 || hardPaceStreak >= 2) notes.push("Several team members look sore after repeated hard days.");
  if ((resources.sickness || 0) > 35) notes.push("The camp medic notes a rise in coughs and fevers.");
  if ((resources.morale || 0) < 30) notes.push("Camp is quiet tonight, and spirits are low.");

  if (notes.length === 1) notes.push("Conditions are steady today, but careful planning still matters.");
  return notes.slice(0, 3);
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

const makeInit = (): SRState => ({
  day: 1, turn: 0, resources: { ...INIT_R },
  phase: "intro", pace: "normal", distance: 0,
  currentEvent: null, resultText: "", decisions: [],
  gameOver: false, survived: false, earlySale: false,
  saleCity: "", saleMultiplier: 0,
  outfit: { ...DEFAULT_OUTFIT },
  culturalExchange: 0, culturalLog: [],
  triviaCounter: 0, currentTrivia: null, usedTriviaIds: new Set(), triviaStreak: 0,
  caravanFeed: ["The caravan gathers in Chang'an and checks every cart wheel."],
  hardPaceStreak: 0,
});

export default function SilkRoad({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<SRState>(makeInit());
  const [usedEvents, setUsedEvents] = useState<Set<string>>(new Set());

  const start = useCallback(() => { setState({ ...makeInit(), phase: "outfit" }); setUsedEvents(new Set()); }, []);

  const onOutfitDone = useCallback((config: CaravanConfig) => {
    setState(prev => ({
      ...prev,
      phase: "traveling" as const,
      outfit: config,
      resources: {
        goods: config.goods,
        water: config.water,
        rations: config.rations,
        camels: config.camels,
        guards: config.guards,
        morale: 55,
        crew: 4,
        silver: config.silver,
        spareParts: config.spareParts,
        medicine: config.medicine,
        cartCondition: clamp(58 + config.cartGear * 9 + config.spareParts * 2, 0, 100),
        fatigue: 8,
        sickness: 6,
      },
      hardPaceStreak: 0,
      caravanFeed: ["The caravan departs Chang'an with sealed ledgers and fresh cart pins."],
      culturalExchange: 0,
      culturalLog: [],
    }));
  }, []);

  const advance = useCallback(() => {
    setState(prev => {
      const s = { ...prev, resources: { ...prev.resources }, caravanFeed: [...prev.caravanFeed] };
      s.turn++;
      const pace = s.pace === "push" ? { id: "push", miles: 58, water: -5, rations: -4, morale: -3, fatigue: 12, cart: -8 } :
                   s.pace === "normal" ? { id: "normal", miles: 42, water: -4, rations: -3, morale: -1, fatigue: 8, cart: -4 } :
                   { id: "easy", miles: 30, water: -3, rations: -2, morale: 1, fatigue: 4, cart: -1 };

      s.hardPaceStreak = pace.id === "push" ? s.hardPaceStreak + 1 : Math.max(0, s.hardPaceStreak - 1);
      const camelPenalty = s.resources.camels <= 7 ? 0.62 : s.resources.camels <= 10 ? 0.78 : 1;
      const crewPenalty = s.resources.crew <= 2 ? 0.75 : 1;
      const cartPenalty = s.resources.cartCondition <= 0 ? 0.45 : s.resources.cartCondition < 25 ? 0.72 : 1;
      const distanceGain = (pace.miles + Math.floor(Math.random() * 12)) * camelPenalty * crewPenalty * cartPenalty;

      s.day += pace.id === "push" ? 5 : pace.id === "normal" ? 4 : 3;
      s.distance = Math.min(s.distance + distanceGain, TOTAL_DISTANCE);

      s.resources.water = clamp((s.resources.water || 0) + pace.water, 0, 100);
      s.resources.rations = clamp((s.resources.rations || 0) + pace.rations, 0, 100);
      s.resources.morale = clamp((s.resources.morale || 0) + pace.morale, 0, 100);
      s.resources.fatigue = clamp((s.resources.fatigue || 0) + pace.fatigue, 0, 100);
      s.resources.cartCondition = clamp((s.resources.cartCondition || 0) + pace.cart + Math.floor((s.resources.spareParts || 0) > 0 ? 1 : 0), 0, 100);

      // Supply and health pressure
      if ((s.resources.water || 0) < 15) {
        s.resources.morale = clamp((s.resources.morale || 0) - 5, 0, 100);
        s.resources.sickness = clamp((s.resources.sickness || 0) + 8, 0, 100);
      }
      if ((s.resources.rations || 0) < 18) {
        s.resources.morale = clamp((s.resources.morale || 0) - 4, 0, 100);
        s.resources.fatigue = clamp((s.resources.fatigue || 0) + 6, 0, 100);
      }

      // Low guards increase loss risk
      if ((s.resources.guards || 0) < 4 && Math.random() < 0.28) {
        s.resources.goods = Math.max(0, (s.resources.goods || 0) - (4 + Math.ceil(Math.random() * 6)));
      }

      // Repeated hard pace consequences
      if (s.hardPaceStreak >= 2 && Math.random() < 0.4) {
        s.resources.camels = Math.max(0, (s.resources.camels || 0) - 1);
      }

      // Cart breakdown severity
      const breakdownRisk = (pace.id === "push" ? 0.22 : 0.12) + ((s.resources.cartCondition || 0) < 35 ? 0.16 : 0) + ((s.resources.spareParts || 0) <= 0 ? 0.14 : 0);
      if (Math.random() < breakdownRisk) {
        if ((s.resources.spareParts || 0) > 0) {
          s.resources.spareParts = Math.max(0, (s.resources.spareParts || 0) - 1);
          s.resources.cartCondition = clamp((s.resources.cartCondition || 0) + 14, 0, 100);
          s.resources.rations = clamp((s.resources.rations || 0) - 5, 0, 100);
          s.resultText = "A cart wheel failed at noon. The crew used one spare part and resumed by dusk.";
          s.phase = "result";
        } else {
          s.resources.cartCondition = clamp((s.resources.cartCondition || 0) - 20, 0, 100);
          s.resources.goods = Math.max(0, (s.resources.goods || 0) - 8);
          s.resources.morale = clamp((s.resources.morale || 0) - 6, 0, 100);
          s.resultText = "Without spare parts, a damaged cart had to be stripped for salvage. Cargo was lost.";
          s.phase = "result";
        }
      }

      // Sickness and attrition
      if ((s.resources.sickness || 0) > 45 && Math.random() < 0.25) {
        s.resources.crew = Math.max(0, (s.resources.crew || 0) - 1);
        s.resources.morale = clamp((s.resources.morale || 0) - 6, 0, 100);
      }
      if ((s.resources.fatigue || 0) > 70 && Math.random() < 0.25) {
        s.resources.guards = Math.max(0, (s.resources.guards || 0) - 1);
      }

      const feed = buildCaravanFeed(s.resources, pace.id, distanceGain, s.day, s.hardPaceStreak);
      const nearby = isNearSilkStop(Math.min((s.distance / TOTAL_DISTANCE) * 100, 100));
      if (nearby) feed.push(`${nearby.name} is close. Repairs and hiring are possible, but expensive.`);
      s.caravanFeed = [...s.caravanFeed, ...feed].slice(-18);

      // End conditions
      if (s.resources.crew <= 1 || s.resources.camels <= 2 || s.resources.water <= 0 || s.resources.rations <= 0) {
        return { ...s, phase: "end" as const, gameOver: true, survived: false };
      }
      if (s.distance >= TOTAL_DISTANCE) {
        return { ...s, phase: "end" as const, gameOver: true, survived: true };
      }

      const event = pickEvent(s.day, JOURNEY_DAYS, EVENTS, usedEvents);
      if (event) {
        if (s.triviaCounter >= 2) {
          const progress = Math.min((s.distance / TOTAL_DISTANCE) * 100, 100);
          const trivia = pickTriviaQuestion(progress, s.usedTriviaIds);
          if (trivia) {
            s.currentTrivia = trivia;
            s.usedTriviaIds = new Set(s.usedTriviaIds).add(trivia.id);
            s.triviaCounter = 0;
            s.phase = "trivia";
            return s;
          }
        }
        setUsedEvents(p => new Set(p).add(event.id));
        s.currentEvent = event;
        s.phase = "event";
        s.triviaCounter++;
      }
      return s;
    });
  }, [usedEvents]);

  // Standard choices handler
  const handleChoice = useCallback((idx: number) => {
    setState(prev => {
      if (!prev.currentEvent || !prev.currentEvent.choices) return prev;
      const s = { ...prev, resources: { ...prev.resources }, culturalLog: [...prev.culturalLog] };
      const choice = s.currentEvent!.choices![idx];
      s.decisions.push({ event: s.currentEvent!.title, choice: choice.text, day: s.day });

      let outcome: { effects?: Resources; result?: string; earlyEnd?: boolean };
      if (choice.outcomes) {
        const tw = choice.outcomes.reduce((a, o) => a + o.weight, 0);
        let r = Math.random() * tw;
        let picked = choice.outcomes[choice.outcomes.length - 1];
        for (const o of choice.outcomes) { r -= o.weight; if (r <= 0) { picked = o; break; } }
        outcome = picked;
      } else {
        outcome = choice;
      }

      if (outcome.effects) {
        for (const [k, v] of Object.entries(outcome.effects)) {
          if (k === "culturalExchange") {
            s.culturalExchange += v;
            s.culturalLog.push(`${s.currentEvent!.title}: +${v}`);
          } else {
            s.resources[k] = clamp((s.resources[k] || 0) + v, 0, k === "goods" ? 200 : 100);
          }
        }
      }

      if (outcome.earlyEnd || choice.earlyEnd) {
        s.earlySale = true;
        // Determine sale city based on progress
        const p = s.distance / TOTAL_DISTANCE;
        if (p < 0.3) { s.saleCity = "Dunhuang"; s.saleMultiplier = 5; }
        else if (p < 0.55) { s.saleCity = "Samarkand"; s.saleMultiplier = 15; }
        else if (p < 0.7) { s.saleCity = "Merv"; s.saleMultiplier = 30; }
        else if (p < 0.9) { s.saleCity = "Antioch"; s.saleMultiplier = 60; }
        else { s.saleCity = "Constantinople"; s.saleMultiplier = 100; }
      }

      s.resultText = outcome.result || "";
      s.phase = "result";

      // Check end conditions after effects
      if (s.resources.crew <= 1 || s.resources.camels <= 2 || s.resources.water <= 0) {
        return { ...s, phase: "end" as const, gameOver: true, survived: false };
      }
      if (s.earlySale) {
        return { ...s, phase: "end" as const, gameOver: true, survived: true };
      }
      return s;
    });
  }, []);

  // 🔴 Handle Push Your Luck Update
  const handlePushUpdate = useCallback((effects: Resources) => {
    setState(prev => {
      const s = { ...prev, resources: { ...prev.resources }, culturalLog: [...prev.culturalLog] };
      for (const [k, v] of Object.entries(effects)) {
        if (k === "culturalExchange") {
          s.culturalExchange += v;
          if (s.currentEvent) s.culturalLog.push(`${s.currentEvent.title}: +${v}`);
        } else {
          s.resources[k] = clamp((s.resources[k] || 0) + v, 0, k === "goods" ? 200 : 100);
        }
      }
      return s;
    });
  }, []);

  // 🔴 Handle Push Your Luck Leave
  const handlePushLeave = useCallback((log: string[]) => {
    setState(prev => {
      if (!prev.currentEvent) return prev;
      const s = { ...prev, decisions: [...prev.decisions] };
      s.decisions.push({ event: s.currentEvent!.title, choice: `Pushed luck ${log.length - 1} times.`, day: s.day });
      s.currentEvent = null;
      s.phase = "traveling";
      return s;
    });
  }, []);

  // 🧙 Handle Trivia Completion
  const handleTriviaComplete = useCallback((correct: boolean, effects: Record<string, number>) => {
    setState(prev => {
      const s = { ...prev, resources: { ...prev.resources }, culturalLog: [...prev.culturalLog], decisions: [...prev.decisions] };
      const qText = s.currentTrivia?.question || "Trivia";

      if (correct) {
        s.triviaStreak++;
        for (const [k, v] of Object.entries(effects)) {
          if (k === "culturalExchange") {
            s.culturalExchange += v;
            s.culturalLog.push(`Sage's Wisdom: +${v}`);
          } else if (k === "shortcut") {
            s.distance = Math.min(s.distance + v, TOTAL_DISTANCE);
          } else if (k === "camels") {
            s.resources.camels = Math.min((s.resources.camels || 0) + v, 30);
          } else {
            s.resources[k] = clamp((s.resources[k] || 0) + v, 0, k === "goods" ? 200 : 100);
          }
        }
        s.decisions.push({ event: "Sage Encounter", choice: `✓ Answered correctly (streak: ${s.triviaStreak}): "${qText}"`, day: s.day });
      } else {
        s.triviaStreak = 0;
        s.decisions.push({ event: "Sage Encounter", choice: `Learned from: "${qText}"`, day: s.day });
      }

      s.currentTrivia = null;
      s.phase = "traveling";

      // Check if shortcut pushed us to the end
      if (s.distance >= TOTAL_DISTANCE) {
        return { ...s, phase: "end" as const, gameOver: true, survived: true };
      }
      return s;
    });
  }, []);

  const dismissResult = useCallback(() => {
    setState(prev => ({ ...prev, phase: "traveling" as const, currentEvent: null, resultText: "" }));
  }, []);

  const r = state.resources;
  const progress = Math.min((state.distance / TOTAL_DISTANCE) * 100, 100);
  const nearbyStop = isNearSilkStop(progress);
  const warnings = [
    (r.guards || 0) < 4 ? "Low guard numbers increase theft and ambush risk." : null,
    (r.camels || 0) < 9 ? "Animal losses are slowing travel and reducing carrying power." : null,
    (r.spareParts || 0) <= 0 ? "No spare parts remain. Cart failures will be severe." : null,
    (r.water || 0) < 20 || (r.rations || 0) < 20 ? "Food and water are under pressure." : null,
    (r.cartCondition || 0) < 35 ? "Cart condition is poor. Consider repairs at the next city." : null,
  ].filter(Boolean) as string[];

  const handleCityRepair = useCallback(() => {
    setState(prev => {
      if ((prev.resources.silver || 0) < 120) return prev;
      const s = { ...prev, resources: { ...prev.resources }, caravanFeed: [...prev.caravanFeed], resultText: "" };
      s.resources.silver = clamp((s.resources.silver || 0) - 120, 0, 1000);
      s.resources.cartCondition = clamp((s.resources.cartCondition || 0) + 30, 0, 100);
      s.resources.spareParts = clamp((s.resources.spareParts || 0) + 1, 0, 12);
      s.caravanFeed.push("City wheelwrights reinforced the carts by evening.");
      s.resultText = "You paid city craftsmen for repairs and a replacement axle pin.";
      s.phase = "result";
      return s;
    });
  }, []);

  const handleCityHire = useCallback(() => {
    setState(prev => {
      if ((prev.resources.silver || 0) < 95) return prev;
      const s = { ...prev, resources: { ...prev.resources }, caravanFeed: [...prev.caravanFeed], resultText: "" };
      s.resources.silver = clamp((s.resources.silver || 0) - 95, 0, 1000);
      s.resources.guards = clamp((s.resources.guards || 0) + 1, 0, 16);
      s.resources.crew = clamp((s.resources.crew || 0) + 1, 0, 12);
      s.resources.morale = clamp((s.resources.morale || 0) + 4, 0, 100);
      s.caravanFeed.push("Two new hires joined the caravan at the city gate.");
      s.resultText = "You hired additional caravan hands and a guard at high city wages.";
      s.phase = "result";
      return s;
    });
  }, []);

  const handleCityResupply = useCallback(() => {
    setState(prev => {
      if ((prev.resources.silver || 0) < 85) return prev;
      const s = { ...prev, resources: { ...prev.resources }, caravanFeed: [...prev.caravanFeed], resultText: "" };
      s.resources.silver = clamp((s.resources.silver || 0) - 85, 0, 1000);
      s.resources.water = clamp((s.resources.water || 0) + 22, 0, 100);
      s.resources.rations = clamp((s.resources.rations || 0) + 22, 0, 100);
      s.resources.medicine = clamp((s.resources.medicine || 0) + 1, 0, 10);
      s.caravanFeed.push("Fresh water and grain were loaded before sunrise.");
      s.resultText = "You bought water, grain, and medicine at city market prices.";
      s.phase = "result";
      return s;
    });
  }, []);

  // Dynamic background based on journey progress
  const getBackgroundImage = (p: number) => {
    if (p < 30) return "/faces/bg_desert.png";
    if (p < 60) return "/faces/bg_mountains.png";
    return "/faces/bg_travel.png";
  };
  const currentBgImage = getBackgroundImage(progress);
  const progressLabel = progress < 15 ? "Gansu Corridor" : progress < 30 ? "Taklamakan Desert" : progress < 45 ? "Ferghana Valley" : progress < 55 ? "Samarkand" : progress < 70 ? "Persia" : progress < 85 ? "Anatolia" : "Roman Empire";

  // Party member portraits mapped to resource health
  const partyMembers = [
    { id: "merchant",     role: "Merchant",  label: "", health: clamp(r.goods, 0, 100) },
    { id: "cameldriver",  role: "Camels",    label: "", health: clamp(r.camels / 20 * 100, 0, 100) },
    { id: "guard",        role: "Guard",     label: "", health: clamp(r.guards / 6 * 100, 0, 100) },
    { id: "translator",   role: "Translator",label: "", health: clamp(r.morale, 0, 100) },
    { id: "guide",        role: "Guide",     label: "", health: clamp(r.water, 0, 100) },
  ];

  // ── INTRO ──
  if (state.phase === "intro") {
    return (
      <div className="h-screen bg-stone-900 text-stone-100 flex flex-col items-center justify-center p-4 overflow-hidden" style={{ fontFamily: "'Georgia',serif" }}>
        <div className="max-w-md w-full text-center space-y-4">
          <div>
            <h1 className="text-3xl font-bold tracking-wider text-indigo-400">THE SILK ROAD</h1>
            <p className="text-stone-500 text-xs tracking-[0.3em] uppercase mt-1">Chang'an to Constantinople · 130 BCE</p>
          </div>
          <div className="relative h-32 overflow-hidden rounded bg-stone-800 border border-stone-700">
             <img 
              src="/faces/bg_travel.png"
              alt="Silk Road"
              className="w-full h-full object-cover"
              style={{ imageRendering: "pixelated" }}
             />
             <div className="absolute inset-0 bg-stone-900/40 flex items-center justify-center">
                <span className="text-6xl drop-shadow-lg">🐫</span>
             </div>
          </div>
          <div className="border border-stone-700 rounded p-3 bg-stone-800/80 text-left space-y-2 text-sm text-stone-300 leading-relaxed">
            <p>You lead a Han caravan heading west. Carry silk, jade, and bronze 4,000 miles across deserts and mountains.</p>
            <p>Your inventory costs 50 silver in Chang'an. In Constantinople, it's worth 5,000.</p>
            <p className="text-indigo-300 font-bold">That can be a 100x gain. The road is hard, so plan carefully.</p>
          </div>
          <p className="text-xs text-stone-500 italic">Cities along the way will offer to buy your goods. Sell early for safety, or keep going for a bigger reward.</p>
          <button onClick={start} className="px-6 py-2.5 bg-indigo-700 hover:bg-indigo-600 text-white font-bold rounded transition-colors tracking-wide">START THE JOURNEY</button>
          <button onClick={onBack} className="block mx-auto text-xs text-stone-500 hover:text-stone-300 transition-colors">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── OUTFIT ──
  if (state.phase === "outfit") {
    return <SilkRoadOutfit onDone={onOutfitDone} />;
  }

  // ── END ──
  if (state.phase === "end") {
    const mult = state.earlySale ? state.saleMultiplier : (state.survived ? 100 : 0);
    const revenue = state.survived ? (state.earlySale ? r.goods * mult + (r.silver || 0) : r.goods * 100 + (r.silver || 0)) : 0;
    const cost = state.outfit.budgetSpent + OUTFIT_BUDGET;
    const profit = revenue - cost;
    const grade = getSilkRoadGrade(state.survived, mult, state.culturalExchange);
    const cityReached = state.earlySale ? state.saleCity : (state.survived ? "Constantinople" : `Day ${state.day}`);

    return (
      <div className="h-screen bg-stone-900 text-stone-100 p-4 overflow-y-auto" style={{ fontFamily: "'Georgia',serif" }}>
        <div className="max-w-lg mx-auto space-y-4">
          <h1 className={`text-2xl font-bold text-center ${state.survived ? "text-indigo-400" : "text-red-500"}`}>
            {state.survived ? (state.earlySale ? `JOURNEY ENDS: ${state.saleCity.toUpperCase()}` : "CONSTANTINOPLE") : "JOURNEY FAILED"}
          </h1>
          <p className="text-center text-stone-300 text-sm">
            {state.survived
              ? state.earlySale ? `You sold your goods at ${mult}x in ${state.saleCity}. You completed ${Math.round(progress)}% of the route.`
              : `You finished the full route and sold at 100x in Constantinople.`
              : `Your caravan failed on day ${state.day}. The desert is unforgiving.`}
          </p>

          {/* Profit Ledger */}
          <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1 text-xs">
            <h2 className="text-indigo-300 font-bold uppercase tracking-wide text-center mb-1">Journey Ledger</h2>
            <div className="flex justify-between text-stone-400"><span>Starting Costs</span><span className="text-red-400">-{cost} silver</span></div>
            {state.survived && <div className="flex justify-between text-stone-400"><span>Total Sale ({mult}x)</span><span className="text-emerald-400">+{revenue} silver</span></div>}
            <div className="border-t border-stone-600 mt-1 pt-1 flex justify-between font-bold">
              <span className="text-stone-200">Net Profit</span>
              <span className={profit >= 0 ? "text-emerald-400" : "text-red-500"}>{profit >= 0 ? "+" : ""}{profit} silver</span>
            </div>
          </div>

          {/* Cultural Exchange */}
          <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1 text-xs">
            <h2 className="text-amber-300 font-bold uppercase tracking-wide text-center mb-1">Cultural Exchange</h2>
            <div className="flex justify-between font-bold">
              <span className="text-stone-200">Knowledge Shared</span>
              <span className="text-amber-400">{state.culturalExchange} points</span>
            </div>
            <div className="w-full bg-stone-700 rounded-full h-2 mt-1">
              <div className="bg-amber-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(state.culturalExchange / 30 * 100, 100)}%` }} />
            </div>
            {state.culturalLog.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {state.culturalLog.map((log, i) => (
                  <p key={i} className="text-stone-500 text-xs">📜 {log}</p>
                ))}
              </div>
            )}
            {state.culturalExchange === 0 && <p className="text-stone-600 text-center italic mt-1">No exchanges recorded. You mostly traded and moved on.</p>}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1">
              <h2 className="text-indigo-300 font-bold text-xs uppercase tracking-wide text-center">Journey Stats</h2>
              {([["Reached", cityReached], ["Days", `${state.day}`], ["Distance", `${Math.round(state.distance)} mi`], ["Active Camels", `${r.camels}`]] as [string, string][]).map(([l, v]) => (
                <div key={l} className="flex justify-between text-stone-400 text-xs"><span>{l}</span><span className="text-stone-200">{v}</span></div>
              ))}
            </div>
            <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1">
              <h2 className="text-blue-300 font-bold text-xs uppercase tracking-wide text-center">Historical Context</h2>
              {([["Full journey", "1-3 years"], ["Most merchants", "Used Middlemen"], ["Silk markup", "~100x"], ["Cultural impact", "2000+ years"]] as [string, string][]).map(([l, v]) => (
                <div key={l} className="flex justify-between text-stone-400 text-xs"><span>{l}</span><span className="text-stone-200">{v}</span></div>
              ))}
            </div>
          </div>

          <div className="text-center"><span className="text-stone-500 text-xs">PERFORMANCE RATING: </span><span className={`text-4xl font-bold ${GC[grade]}`}>{grade}</span></div>

          <div className="bg-stone-800 border border-stone-700 rounded p-3">
            <p className="text-xs text-stone-500 leading-relaxed">The Silk Road wasn't one road — it was a web of routes connecting China to Rome for over 1,500 years. Silk, paper, gunpowder, the compass, Buddhism, Islam, and the Black Death all traveled these paths. No single merchant made the full journey — goods passed through dozens of hands, each adding their markup and their culture.</p>
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
            <button onClick={() => { setState(makeInit()); setUsedEvents(new Set()); }} className="px-5 py-2 bg-indigo-700 hover:bg-indigo-600 text-white font-bold rounded transition-colors">Submit New PO (Travel Again)</button>
            <br /><button onClick={onBack} className="text-xs text-stone-500 hover:text-stone-300 transition-colors">← Back to Campaigns</button>
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN GAME ──
  return (
    <div className="west-app h-screen bg-stone-900 text-stone-100 flex flex-col overflow-hidden" style={{ fontFamily: "'Georgia',serif" }}>
      {/* Top horizontal route map */}
      <div className="flex-shrink-0 bg-stone-800 border-b border-stone-700 px-3 pt-2 pb-3">
        <div className="w-full max-w-[1700px] mx-auto">
          <div className="relative w-full h-[160px] md:h-[180px] xl:h-[210px] rounded border border-stone-700 overflow-hidden" style={{ backgroundImage: "url(/faces/bg_travel.png)", backgroundSize: "cover", backgroundPosition: "center" }}>
            <div className="absolute inset-0 bg-stone-900/55" />
            <div className="absolute inset-x-6 top-[52%] h-[2px] bg-amber-200/80 z-10" />
            {SILK_STOPS.map((stop) => (
              <div key={stop.id} className="absolute z-20" style={{ left: `calc(${stop.pct}% - 8px)`, top: "45%" }}>
                <div className="w-4 h-4 rounded-full bg-stone-900 border border-amber-300" />
                <div className="text-[10px] text-stone-200 mt-1 whitespace-nowrap -translate-x-1/3">{stop.name}</div>
              </div>
            ))}
            <div className="absolute z-30" style={{ left: `calc(${progress}% - 10px)`, top: "38%", transition: "left 700ms ease" }}>
              <div className="w-5 h-5 rounded-full bg-indigo-400 border-2 border-indigo-100 shadow" />
              <p className="text-[10px] text-indigo-100 mt-1 -translate-x-1/4 whitespace-nowrap">Caravan</p>
            </div>
            <div className="absolute z-20 left-2 bottom-2 text-xs text-stone-200">Day {state.day} · {Math.round(state.distance)} / {TOTAL_DISTANCE} mi</div>
            <div className="absolute z-20 right-2 bottom-2 text-xs text-indigo-200">{Math.round(progress)}%</div>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0">
        <div className="max-w-[1700px] mx-auto">
          <DoomHUD members={partyMembers} />
        </div>
      </div>

      {/* Full-width strategy board */}
      <div className="flex-1 min-h-0 p-3 overflow-hidden">
        <div className="h-full max-w-[1700px] mx-auto grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_320px] gap-3">
        {/* Left: caravan status */}
        <aside className="bg-stone-800/90 border border-stone-700 rounded p-3 overflow-y-auto">
          <h3 className="text-xs uppercase tracking-wide font-bold text-amber-300 mb-2">Caravan Ledger</h3>
          <div className="grid grid-cols-2 gap-2 text-xs mb-2">
            <div className="bg-stone-900/60 border border-stone-700 rounded p-2">📦 Goods <span className="text-amber-300 font-bold">{r.goods}</span></div>
            <div className="bg-stone-900/60 border border-stone-700 rounded p-2">💰 Silver <span className="text-amber-300 font-bold">{r.silver}</span></div>
            <div className="bg-stone-900/60 border border-stone-700 rounded p-2">🐫 Camels <span className="text-amber-300 font-bold">{r.camels}</span></div>
            <div className="bg-stone-900/60 border border-stone-700 rounded p-2">⚔️ Guards <span className="text-amber-300 font-bold">{r.guards}</span></div>
            <div className="bg-stone-900/60 border border-stone-700 rounded p-2">🧰 Parts <span className="text-amber-300 font-bold">{r.spareParts||0}</span></div>
            <div className="bg-stone-900/60 border border-stone-700 rounded p-2">🛞 Carts <span className="text-amber-300 font-bold">{r.cartCondition||0}</span></div>
          </div>

          <div className="space-y-2 text-xs">
            {[['💧 Water', r.water || 0, 'bg-blue-500'], ['🥖 Rations', r.rations || 0, 'bg-amber-500'], ['😊 Morale', r.morale || 0, r.morale < 25 ? 'bg-red-500' : 'bg-emerald-500'], ['😷 Sickness', r.sickness || 0, 'bg-red-500'], ['🥾 Fatigue', r.fatigue || 0, 'bg-orange-500']].map(([label,val,color]) => (
              <div key={String(label)}>
                <div className="flex justify-between text-stone-300"><span>{label}</span><span>{Number(val)}</span></div>
                <div className="h-2 bg-stone-700 rounded overflow-hidden border border-stone-600"><div className={`${String(color)} h-2`} style={{width:`${Math.min(Number(val),100)}%`}}/></div>
              </div>
            ))}
          </div>

          {warnings.length > 0 && (
            <div className="mt-3 space-y-1">
              {warnings.map((w) => <p key={w} className="text-[11px] text-amber-300">⚠ {w}</p>)}
            </div>
          )}

          {nearbyStop && (
            <div className="mt-3 border border-indigo-700 rounded p-2 bg-indigo-950/30 space-y-2">
              <p className="text-xs text-indigo-300 font-bold">{nearbyStop.name} services available</p>
              <div className="grid grid-cols-1 gap-1">
                <button onClick={handleCityRepair} disabled={(r.silver||0)<120} className="text-xs py-1 rounded bg-stone-700 hover:bg-stone-600 disabled:opacity-50">Repair Carts (120)</button>
                <button onClick={handleCityHire} disabled={(r.silver||0)<95} className="text-xs py-1 rounded bg-stone-700 hover:bg-stone-600 disabled:opacity-50">Hire Guard + Hand (95)</button>
                <button onClick={handleCityResupply} disabled={(r.silver||0)<85} className="text-xs py-1 rounded bg-stone-700 hover:bg-stone-600 disabled:opacity-50">Resupply Water/Food (85)</button>
              </div>
            </div>
          )}
        </aside>

        {/* Center: core interactions */}
        <section className="min-h-0 overflow-y-auto space-y-3 pr-1">
          {state.phase === "traveling" && (
            <div className="space-y-3">
              <div className="border border-stone-700 rounded p-3 bg-stone-800/80">
                <p className="text-stone-300 text-sm leading-relaxed">
                  {r.water < 12 ? "Water is critically low. The caravan must find wells soon." :
                   r.rations < 15 ? "Rations are thin. Every meal now requires careful planning." :
                   r.cartCondition < 25 ? "Cart wear is severe. A major breakdown could halt travel." :
                   r.camels < 8 ? "The remaining animals are carrying too much weight." :
                   progress > 80 ? "Western markets are close. Stay disciplined for the final leg." :
                   "The caravan continues west with steady caution."}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <button onClick={() => { setState(p => ({ ...p, pace: "easy" })); advance(); }} className="py-2 bg-stone-700 hover:bg-stone-600 rounded text-xs font-bold">Cautious<br/><span className="font-normal text-stone-400">Lower strain</span></button>
                <button onClick={() => { setState(p => ({ ...p, pace: "normal" })); advance(); }} className="py-2 bg-indigo-800 hover:bg-indigo-700 rounded text-xs font-bold">Steady<br/><span className="font-normal text-stone-300">Balanced pace</span></button>
                <button onClick={() => { setState(p => ({ ...p, pace: "push" })); advance(); }} className="py-2 bg-red-900 hover:bg-red-800 rounded text-xs font-bold" disabled={(r.cartCondition||0)<=15 || (r.camels||0)<=6}>Aggressive<br/><span className="font-normal text-stone-300">Fast · high strain</span></button>
              </div>
            </div>
          )}

          {state.phase === "event" && state.currentEvent && (
            state.currentEvent.type === "push_luck" ? (
              <PushYourLuckEngine event={state.currentEvent} onUpdate={handlePushUpdate} onLeave={handlePushLeave} />
            ) : (
              <div className="border border-indigo-800 rounded bg-stone-800 overflow-hidden shadow-lg">
                {state.currentEvent.image && (
                  <div className="w-full h-32 relative border-b border-indigo-900/50">
                    <img src={`/faces/${state.currentEvent.image}`} alt={state.currentEvent.title} className="w-full h-full object-cover" style={{ imageRendering: "pixelated", objectPosition: "center" }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-800 via-transparent to-transparent" />
                  </div>
                )}
                <div className="p-3">
                  <h2 className="text-indigo-300 font-bold text-sm mb-1">{state.currentEvent.title}</h2>
                  <p className="text-stone-300 text-sm leading-relaxed mb-3">{state.currentEvent.text}</p>
                  <div className="space-y-1.5">
                    {state.currentEvent.choices?.map((c, i) => (
                      <button key={i} onClick={() => handleChoice(i)} className="w-full text-left p-2 bg-stone-700 hover:bg-stone-600 rounded text-xs text-stone-200 font-bold transition-colors border border-stone-600">▶ {c.text}</button>
                    ))}
                  </div>
                </div>
              </div>
            )
          )}

          {state.phase === "trivia" && state.currentTrivia && (
            <TriviaEngine question={state.currentTrivia} progress={progress} streak={state.triviaStreak} onComplete={handleTriviaComplete} />
          )}

          {state.phase === "result" && (
            <div className="space-y-3">
              <div className="border border-stone-700 rounded p-3 bg-stone-800/80">
                <p className="text-stone-300 text-sm leading-relaxed">{state.resultText}</p>
              </div>
              <button onClick={dismissResult} className="w-full py-2 bg-indigo-800 hover:bg-indigo-700 rounded text-sm font-bold transition-colors">Continue</button>
            </div>
          )}
        </section>

        {/* Right: running caravan notes */}
        <aside className="bg-stone-800/90 border border-stone-700 rounded p-3 min-h-0 overflow-y-auto">
          <h3 className="text-xs uppercase tracking-wide font-bold text-amber-300 mb-2">Caravan Notes</h3>
          <p className="text-[11px] text-stone-400 mb-2">Latest reports from scouts, guards, cooks, and cart crews.</p>
          <div className="space-y-2">
            {[...state.caravanFeed].slice(-12).reverse().map((note, idx) => (
              <div key={`${idx}-${note.slice(0,16)}`} className={`rounded border p-2 ${idx===0 ? "border-amber-700 bg-amber-950/20" : "border-stone-700 bg-stone-900/60"}`}>
                <p className="text-[11px] leading-relaxed text-stone-300">{note}</p>
              </div>
            ))}
          </div>
        </aside>
        </div>
      </div>
    </div>
  );
}

