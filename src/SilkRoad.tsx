import { useState, useCallback } from "react";
import PushYourLuckEngine from "./PushYourLuckEngine";
import DoomHUD from "./DoomHUD";
import { getDoomFace } from "./AssetConfig";

// ═══════════════════════════════════════════════════════════════
// SILK ROAD — Chang'an to Constantinople, 130 BCE
// ═══════════════════════════════════════════════════════════════

interface Resources { [key: string]: number; }
interface Outcome { weight: number; effects: Resources; result: string; earlyEnd?: boolean; }
interface Choice { text: string; effects?: Resources; result?: string; outcomes?: Outcome[]; earlyEnd?: boolean; }
interface PushAttempt { id: string; buttonText: string; successText: string; failureText: string; riskChance: number; rewards: Resources; penalties: Resources; }
interface GameEvent { 
  id: string; phase_min: number; phase_max: number; weight: number; title: string; text: string; 
  type?: "standard" | "push_luck"; 
  choices?: Choice[];              
  attempts?: PushAttempt[];        
  leaveText?: string;
  image?: string; // 🔴 NEW: Image support             
}
interface Decision { event: string; choice: string; day: number; }

interface CaravanConfig {
  goods: number;
  camels: number;
  guards: number;
  water: number;
  silver: number;
  budgetSpent: number;
}

interface SRState {
  day: number; turn: number; resources: Resources;
  phase: "intro" | "outfit" | "traveling" | "event" | "result" | "end";
  pace: string; distance: number; currentEvent: GameEvent | null;
  resultText: string; decisions: Decision[];
  gameOver: boolean; survived: boolean; earlySale: boolean;
  saleCity: string; saleMultiplier: number;
  outfit: CaravanConfig;
  culturalExchange: number;
  culturalLog: string[];
}

const TOTAL_DISTANCE = 4000;
const JOURNEY_DAYS = 120;

const INIT_R: Resources = {
  goods: 100, water: 50, camels: 20, morale: 55,
  silver: 100, guards: 6, crew: 4,
};

const DEFAULT_OUTFIT: CaravanConfig = {
  goods: 100, camels: 20, guards: 6, water: 50, silver: 100, budgetSpent: 0,
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
// EVENTS - INJECTED WITH ANCIENT CORPORATE BUREAUCRACY & IMAGES
// ═══════════════════════════════════════════════════════════════

const EVENTS: GameEvent[] = [
  // ── DESERT PHASE (0-0.3) ──
  {id:"taklamakan",phase_min:0,phase_max:0.25,weight:5,title:"The Sea of Death",text:"The Taklamakan Desert. The local guides refuse to enter, citing 'severe un-aliveness' as a working condition. Two routes: north around the edge (longer, but has water), or straight through (three days, zero infrastructure).",choices:[
    {text:"Take the northern route. Play it safe with the logistics.",outcomes:[
      {weight:6,effects:{water:-8,camels:-1},result:"Slow going. The oases hold just enough water to justify the detour. One camel submits its resignation by collapsing in the dunes."},
      {weight:4,effects:{water:-4,morale:3},result:"Your guide knows every water hole. The crew is highly motivated by the fact that they aren't dead. Excellent team synergy."}
    ]},
    {text:"Straight through. Cut the travel time, maximize ROI.",outcomes:[
      {weight:4,effects:{water:-20,camels:-4,morale:-8,goods:-10},result:"Catastrophic supply chain failure. A sandstorm buries four camels. You drink the last water drop at dawn on day three. HR is going to hear about this."},
      {weight:6,effects:{water:-15,morale:5,camels:-2},result:"A brutal but highly efficient sprint. Two camels are written off as operational losses, but you cut a week off the journey."}
    ]},
    {text:"Wait for a Sogdian caravan. Outsource the navigation.",outcomes:[
      {weight:5,effects:{water:-6,morale:2,silver:-15},result:"They arrive and charge an extortionate consulting fee to let you follow them. Safer, though."},
      {weight:5,effects:{water:-12,morale:-5},result:"You wait four days. Nobody shows up. Time is money, and you just burned both."}
    ]}
  ]},
  
  {id:"imperial_audit",image:"evt_audit.png",phase_min:0.05,phase_max:0.35,weight:4,title:"The Mid-Desert Performance Review",text:"A low-level Han bureaucrat catches up to your caravan on a remarkably fast horse. He ignores the starving camels, pulls out a bamboo scroll, and informs you that your 'silver burn rate is unacceptable' and you are behind on your Q3 silk projections.",choices:[
    {text:"Bribe him to falsify the report.",effects:{silver:-25,morale:2},result:"25 silver changes hands. He notes that your 'operational efficiency is exceeding expectations' and rides back east. Middle management is universal."},
    {text:"Argue about the physical reality of the desert.",outcomes:[
      {weight:5,effects:{morale:-4},result:"He writes down 'belligerent attitude toward leadership' and officially fines you for insubordination. He leaves without offering you water."},
      {weight:5,effects:{morale:4},result:"You point to a bleached human skull in the sand and ask him to audit that. He pales, signs off on the paperwork, and leaves."}
    ]},
    {text:"Give him a bale of silk to present to his boss.",effects:{goods:-5,culturalExchange:1},result:"A strategic corporate gift. He promises to put in a good word with the Ministry of Trade. Expensive, but it secures your political cover."}
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
    text: "You find a ruined watchtower half-buried in the dunes. The garrison is long gone, probably due to budget cuts. There might be abandoned supplies inside, but the stone roof looks like a massive liability.",
    leaveText: "Ignore it. Not worth the worker's comp claims.",
    attempts: [
      {
        id: "outpost_1",
        buttonText: "Search the outer administrative courtyard",
        successText: "Found a half-buried lockbox of silver coins left by the quartermaster.",
        failureText: "A guard sprained his ankle on loose stones. Complete waste of time.",
        riskChance: 0.15,
        rewards: { silver: 25 },
        penalties: { morale: -3 }
      },
      {
        id: "outpost_2",
        buttonText: "Pry open the sealed storehouse",
        successText: "Jackpot. Untouched water skins and a bundle of raw silk left off the official ledger.",
        failureText: "The door was rigged. A collapsing beam crushed a camel. HR nightmare.",
        riskChance: 0.40,
        rewards: { water: 15, goods: 5 },
        penalties: { camels: -1, morale: -5 }
      },
      {
        id: "outpost_3",
        buttonText: "Dig into the commander's quarters",
        successText: "Found the commander's personal stash and ancient tactical maps. A fortune.",
        failureText: "The entire structure caved in. It took hours to dig your men out. Morale is shattered.",
        riskChance: 0.75,
        rewards: { silver: 60, culturalExchange: 5 },
        penalties: { guards: -1, crew: -1, morale: -15 }
      }
    ]
  },

  {id:"guard_strike",phase_min:0.2,phase_max:0.6,weight:4,title:"Contractor Dispute",text:"Your mercenary guards have formed a committee. They claim the desert constitutes a 'hostile work environment' not covered in their original contract. They want double their per diem, effective immediately.",choices:[
    {text:"Pay the premium. Retention is cheaper than hiring new guards.",effects:{silver:-40,morale:5},result:"They accept the silver and immediately go back to work. Mercenaries are nothing if not transactional."},
    {text:"Refuse. A contract is a contract.",outcomes:[
      {weight:4,effects:{guards:-2,morale:-8},result:"Two of your best guards quit on the spot and walk back east. You are now severely understaffed in bandit territory."},
      {weight:6,effects:{morale:-2},result:"You stare them down. They grumble about taking this to the guild, but they fall back in line."}
    ]},
    {text:"Promote the loudest complainer to 'Shift Manager'.",effects:{silver:-10,morale:3},result:"You give the ringleader a fake title and 10 silver. He instantly turns on the other guards and orders them back to work. Divide and conquer."}
  ]},

  // ── MOUNTAIN/CENTRAL PHASE (0.25-0.6) ──
  {id:"pamir_pass",phase_min:0.3,phase_max:0.5,weight:5,title:"The Roof of the World",text:"The Pamir Mountains. Passes above 15,000 feet. The air is so thin your camels are wheezing. Your Chinese crew is staring at the snow like it's a structural defect in the sky.",choices:[
    {text:"Take the high pass. Brutal, but fast.",outcomes:[
      {weight:5,effects:{camels:-5,goods:-10,morale:-6,crew:-1},result:"Total disaster. Five camels fail to meet performance standards and fall into a gorge. Ten bales of silk lost."},
      {weight:5,effects:{camels:-2,morale:4},result:"Clear skies. Only two camels written off as shrinkage. The crew feels a massive sense of accomplishment."}
    ]},
    {text:"The valley route. Longer, lower, safer.",effects:{water:-8,camels:-1,morale:1},result:"Five extra days of operational overhead, but nobody dies. One camel goes lame on loose rock."},
    {text:"Hire local Tajik guides as temporary contractors.",outcomes:[
      {weight:7,effects:{silver:-20,culturalExchange:2,morale:3},result:"Money well spent. They know every switchback. They share local folklore, which your translator meticulously documents."},
      {weight:3,effects:{silver:-20,goods:-15,morale:-5},result:"The 'guides' vanish in the night with fifteen bales of silk. You just got scammed."}
    ]}
  ]},

  {id:"samarkand",phase_min:0.35,phase_max:0.5,weight:5,title:"The Jewel of the Road",text:"Samarkand. The ultimate networking event. Every language on earth is spoken here. A Sogdian broker in a very nice silk tunic offers you 15x your original price to liquidate your entire inventory right now.",choices:[
    {text:"Accept the buyout. 15x is a massive win.",effects:{morale:8},result:"1,500 silver. You ring the sales bell. The journey ends in the most beautiful city you'll ever see. Let someone else deal with the Romans.",earlyEnd:true},
    {text:"Sell a quarter. Secure some liquid capital, keep moving.",effects:{goods:-25,silver:375,water:15,morale:3},result:"A smart, hedged portfolio strategy. Fresh water, fed camels, and still plenty of inventory to sell out west."},
    {text:"Buy Samarkand specialties to flip in Rome.",outcomes:[
      {weight:6,effects:{silver:-50,goods:20,culturalExchange:2},result:"You buy lapis lazuli and high-end paper. The Romans will pay astronomical markups for this. Incredible pivot."},
      {weight:4,effects:{silver:-50,goods:10,morale:-2},result:"You got out-negotiated. Your guard captain is furious. 'We are logistics, not a hedge fund!'"}
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
        buttonText: "Demand standard market rates",
        successText: "He grumbles about overhead but agrees. A solid, safe trade.",
        failureText: "He takes offense to your tone and walks away. Deal's off.",
        riskChance: 0.20,
        rewards: { silver: 30 },
        penalties: { morale: -2 }
      },
      {
        id: "bazaar_2",
        buttonText: "Push for a heavy vendor discount",
        successText: "He caves! You secure top-tier gems at a massive discount.",
        failureText: "He signals his muscle. They rough up your guards and 'confiscate' a bale of silk as a consulting fee.",
        riskChance: 0.50,
        rewards: { silver: 45, goods: 5 },
        penalties: { goods: -5, guards: -1, morale: -8 }
      },
      {
        id: "bazaar_3",
        buttonText: "Threaten to take your business to his primary competitor",
        successText: "Total leverage. He panics and dumps his best stock on you at a massive loss just to keep the account.",
        failureText: "A fatal miscalculation. You are ambushed by his men while trying to leave the alley. Hostile takeover.",
        riskChance: 0.85,
        rewards: { silver: 100, culturalExchange: 4 },
        penalties: { silver: -50, goods: -10, morale: -15 }
      }
    ]
  },

  {id:"parthian_toll",phase_min:0.55,phase_max:0.75,weight:4,title:"The Parthian Border",text:"Parthian soldiers block the road. The empire controls all trade heading to Rome. Toll: an un-negotiable 20% tariff on all goods. Welcome to international commerce.",choices:[
    {text:"Pay the tariff. Cost of doing business.",effects:{goods:-20,morale:-2},result:"They take exactly 20%. Professional thieves with excellent paperwork."},
    {text:"Negotiate. Offer 10% and 'exclusive intelligence'.",outcomes:[
      {weight:5,effects:{goods:-10,culturalExchange:1,morale:2},result:"The captain is more interested in Chinese military innovations than silk. You trade stories for a discount."},
      {weight:5,effects:{goods:-25,morale:-4},result:"They reject your counter-offer and take 25% for wasting their time. A brutal lesson in leverage."}
    ]},
    {text:"Find an undocumented bypass route.",outcomes:[
      {weight:4,effects:{silver:-25,morale:3},result:"You bribe a shepherd to show you a goat trail. It adds three days, but you avoid the tariff entirely."},
      {weight:6,effects:{silver:-25,goods:-30,guards:-1,morale:-6},result:"The 'guide' leads you into an ambush. You lose 30 bales, a guard, and your dignity."}
    ]}
  ]},
  
  // ── ROMAN WORLD (0.7-1.0) ──
  {id:"antioch",phase_min:0.75,phase_max:0.88,weight:5,title:"Antioch — Rome's Eastern Door",text:"Antioch. You can smell the Mediterranean. Roman merchants swarm your caravan like vultures. They are offering 60x your original Chang'an procurement price before you've even unpacked.",choices:[
    {text:"Sell here. 60x. Cash out and retire.",effects:{morale:8},result:"6,000 silver. Your KPIs are completely shattered. The road to Constantinople is dangerous, let someone else handle the final mile.",earlyEnd:true},
    {text:"Sell half. Save the premium stock for Constantinople.",effects:{goods:-50,silver:3000,morale:4},result:"Half gone at 60x. You keep the finest silk for the richest city in the world. Excellent revenue management."},
    {text:"Buy Roman goods to establish a two-way pipeline.",outcomes:[
      {weight:6,effects:{silver:-100,goods:10,culturalExchange:3},result:"Roman glassware and gold coins. If you survive the return trip, this sells for 50x in Chang'an. You are building an empire."},
      {weight:4,effects:{silver:-100,goods:5},result:"You bought overpriced tourist junk. The locals definitely saw you coming."}
    ]}
  ]},
  {id:"roman_silk",phase_min:0.7,phase_max:0.95,weight:3,title:"The Senate's Obsession",text:"Roman senators are so obsessed with Chinese silk that the government is trying to regulate it. A senator's wife approaches you for an off-the-books transaction. Double the going rate, paid in gold.",choices:[
    {text:"Take the deal. We are merchants, not compliance officers.",outcomes:[
      {weight:5,effects:{goods:-30,silver:600,morale:3},result:"Done in a warehouse at midnight. She pays in gold. You don't ask for a receipt."},
      {weight:5,effects:{goods:-30,silver:600,morale:-5,guards:-1},result:"A sting operation! Roman guards raid the warehouse. You escape with the gold, but lose a guard to a gladius."}
    ]},
    {text:"Stick to the public market. Legal and audited.",effects:{goods:-20,silver:200,morale:2},result:"Fair price. Legal. Incredibly boring. Your men are disappointed in your lack of ambition."},
    {text:"Use the silk to 'lobby' influential Romans.",effects:{goods:-10,culturalExchange:3,morale:4},result:"You give the silk away as 'gifts'. They will remember you. Business is built on relationships, not single transactions."}
  ]},
  {id:"constantinople_arrival",phase_min:0.92,phase_max:1.0,weight:6,title:"The Golden City",text:"Constantinople. The markets overflow with goods. Your remaining inventory is currently valued at 100x what you paid in Chang'an. You survived the world's longest business trip.",choices:[
    {text:"Liquidate everything at 100x.",effects:{morale:10},result:"The ultimate payoff. You crossed deserts, mountains, and hostile corporate takeovers. Every bale of silk sold at maximum value.",earlyEnd:true},
    {text:"Sell the goods, but keep one bale for yourself.",effects:{goods:-5,morale:8,culturalExchange:1},result:"You keep the finest silk as a severance package. In old age, you'll look at it and remember the Taklamakan."},
    {text:"Establish a permanent branch office.",effects:{silver:-200,culturalExchange:5,morale:6},result:"You hire local reps, rent a warehouse, and establish a permanent B2B connection between east and west. You are no longer a merchant; you are an institution."}
  ]}
];

// ═══════════════════════════════════════════════════════════════
// OUTFIT SCREEN
// ═══════════════════════════════════════════════════════════════

const OUTFIT_BUDGET = 500;

function SilkRoadOutfit({ onDone }: { onDone: (config: CaravanConfig) => void }) {
  const [extraCamels, setExtraCamels] = useState(5);
  const [extraGuards, setExtraGuards] = useState(2);
  const [extraWater, setExtraWater] = useState(10);
  const [extraGoods, setExtraGoods] = useState(20);

  const baseCamels = 15, baseGuards = 4, baseWater = 40, baseGoods = 80;
  const camels = baseCamels + extraCamels;
  const guards = baseGuards + extraGuards;
  const water = baseWater + extraWater;
  const goods = baseGoods + extraGoods;

  const spent = extraCamels * 15 + extraGuards * 30 + extraWater * 2 + extraGoods * 3;
  const remaining = OUTFIT_BUDGET - spent;

  const ratio = goods / camels;
  const loadLabel = ratio > 8 ? "OSHA Violation" : ratio > 6 ? "Heavy" : ratio > 4 ? "Optimized" : "Underutilized";
  const loadColor = ratio > 8 ? "text-red-500" : ratio > 6 ? "text-orange-400" : ratio > 4 ? "text-emerald-400" : "text-blue-400";

  return (
    <div className="h-screen bg-stone-900 text-stone-100 flex flex-col overflow-hidden" style={{ fontFamily: "'Georgia',serif" }}>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-lg mx-auto space-y-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-indigo-400">PROCUREMENT PHASE</h1>
            <p className="text-stone-500 text-xs mt-1">Chang'an Logistics Hub · 130 BCE</p>
          </div>
          <div className="bg-stone-800 border border-stone-700 rounded p-3 text-xs text-stone-300 leading-relaxed">
            <p>The Han Emperor has approved your budget. You have <span className="text-indigo-300 font-bold">{OUTFIT_BUDGET} silver</span> to acquire assets for the western expansion. Do not embarrass the dynasty.</p>
          </div>

          <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-3">
            <div>
              <div className="flex justify-between text-sm"><span>🐫 Camels</span><span className="text-amber-300 font-bold">{camels}</span></div>
              <input type="range" min={0} max={15} value={extraCamels} onChange={e => setExtraCamels(+e.target.value)} className="w-full accent-amber-500" />
              <p className="text-xs text-stone-500">15 silver each · Core transport infrastructure</p>
            </div>
            <div>
              <div className="flex justify-between text-sm"><span>⚔️ Guards</span><span className="text-amber-300 font-bold">{guards}</span></div>
              <input type="range" min={0} max={8} value={extraGuards} onChange={e => setExtraGuards(+e.target.value)} className="w-full accent-amber-500" />
              <p className="text-xs text-stone-500">30 silver each · Risk management contractors</p>
            </div>
            <div>
              <div className="flex justify-between text-sm"><span>💧 Water</span><span className="text-amber-300 font-bold">{water}</span></div>
              <input type="range" min={0} max={25} value={extraWater} onChange={e => setExtraWater(+e.target.value)} className="w-full accent-amber-500" />
              <p className="text-xs text-stone-500">2 silver per skin · Keeps the assets alive</p>
            </div>
            <div>
              <div className="flex justify-between text-sm"><span>📦 Inventory</span><span className="text-amber-300 font-bold">{goods}</span></div>
              <input type="range" min={0} max={40} value={extraGoods} onChange={e => setExtraGoods(+e.target.value)} className="w-full accent-amber-500" />
              <p className="text-xs text-stone-500">3 silver per bale · Silk, jade, bronze (Your ROI)</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-stone-800 border border-stone-700 rounded p-2">
              <span className="text-stone-500">Camel load:</span>
              <span className={`ml-1 font-bold ${loadColor}`}>{loadLabel}</span>
            </div>
            <div className="bg-stone-800 border border-stone-700 rounded p-2">
              <span className="text-stone-500">Budget left:</span>
              <span className={`ml-1 font-bold ${remaining >= 0 ? "text-emerald-400" : "text-red-500"}`}>{remaining}</span>
            </div>
          </div>

          {remaining < 0 && <p className="text-red-400 text-xs text-center">Over budget! Corporate will not approve this PO.</p>}

          <div className="text-center pb-4">
            <button
              onClick={() => onDone({ goods, camels, guards, water, silver: remaining + 50, budgetSpent: spent })}
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
        goods: config.goods, water: config.water, camels: config.camels,
        guards: config.guards, morale: 55, crew: 4, silver: config.silver,
      },
      culturalExchange: 0, culturalLog: [],
    }));
  }, []);

  const advance = useCallback(() => {
    setState(prev => {
      const s = { ...prev, resources: { ...prev.resources } };
      s.turn++;
      const daysPerTurn = s.pace === "push" ? 5 : s.pace === "normal" ? 4 : 3;
      s.day += daysPerTurn;
      const dist = s.pace === "push" ? 55 : s.pace === "normal" ? 40 : 25;
      s.distance = Math.min(s.distance + dist + Math.floor(Math.random() * 15), TOTAL_DISTANCE);

      // Daily consumption
      s.resources.water = clamp(s.resources.water - (s.pace === "push" ? 4 : s.pace === "normal" ? 3 : 2), 0, 100);
      s.resources.morale = clamp(s.resources.morale + (s.pace === "push" ? -2 : s.pace === "easy" ? 1 : 0), 0, 100);

      // Camel attrition on push
      if (s.pace === "push" && Math.random() < 0.15) {
        s.resources.camels = Math.max(0, s.resources.camels - 1);
      }

      // Water crisis
      if (s.resources.water <= 5) {
        s.resources.morale = clamp(s.resources.morale - 5, 0, 100);
        if (Math.random() < 0.3) s.resources.camels = Math.max(0, s.resources.camels - 1);
      }

      // End conditions
      if (s.resources.crew <= 1 || s.resources.camels <= 2 || s.resources.water <= 0) {
        return { ...s, phase: "end" as const, gameOver: true, survived: false };
      }
      if (s.distance >= TOTAL_DISTANCE) {
        return { ...s, phase: "end" as const, gameOver: true, survived: true };
      }

      // Event?
      const event = pickEvent(s.day, JOURNEY_DAYS, EVENTS, usedEvents);
      if (event) {
        setUsedEvents(p => new Set(p).add(event.id));
        s.currentEvent = event;
        s.phase = "event";
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

  const dismissResult = useCallback(() => {
    setState(prev => ({ ...prev, phase: "traveling" as const, currentEvent: null, resultText: "" }));
  }, []);

  const r = state.resources;
  const progress = Math.min((state.distance / TOTAL_DISTANCE) * 100, 100);

  // 🔴 NEW: DYNAMIC BACKGROUND LOGIC (procedural SVG until real art exists)
  const getBackgroundSvg = (p: number) => {
    const w = 480, h = 120;
    let sky: string, ground: string, accent: string;
    if (p < 30) { sky = "#c4604a"; ground = "#c4a060"; accent = "#e8a060"; }       // desert
    else if (p < 60) { sky = "#4a6a90"; ground = "#5a5a40"; accent = "#8ab4d4"; }  // mountains
    else { sky = "#3a4a6e"; ground = "#6b5e3a"; accent = "#d4a050"; }              // western cities
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${sky}"/><stop offset="100%" stop-color="${accent}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#s)"/><rect y="${h*0.6}" width="${w}" height="${h*0.4}" fill="${ground}"/><path d="M0,${h*0.55} Q${w*0.2},${h*0.45} ${w*0.4},${h*0.55} Q${w*0.6},${h*0.48} ${w*0.8},${h*0.52} L${w},${h*0.58} L${w},${h*0.6} L0,${h*0.6} Z" fill="${ground}" opacity="0.7"/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  };
  const currentBgImage = getBackgroundSvg(progress);
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
             <div 
              className="w-full h-full"
              style={{ background: "linear-gradient(135deg, #3a4a6e 0%, #c4604a 50%, #d4a050 100%)" }}
             />
             <div className="absolute inset-0 bg-stone-900/40 flex items-center justify-center">
                <span className="text-6xl drop-shadow-lg">🐫</span>
             </div>
          </div>
          <div className="border border-stone-700 rounded p-3 bg-stone-800/80 text-left space-y-2 text-sm text-stone-300 leading-relaxed">
            <p>You are a lead account executive for the Han Dynasty. Your territory is "The West." Your quota is to move silk, jade, and bronze 4,000 miles through the deadliest deserts and mountains on earth.</p>
            <p>Your inventory costs 50 silver in Chang'an. In Constantinople, it's worth 5,000.</p>
            <p className="text-indigo-300 font-bold">That's 100x ROI. The Emperor does not care about your supply chain issues.</p>
          </div>
          <p className="text-xs text-stone-500 italic">Middlemen at every city will offer to buy your route out. Sell early and safe, or push west to hit your ultimate KPIs.</p>
          <button onClick={start} className="px-6 py-2.5 bg-indigo-700 hover:bg-indigo-600 text-white font-bold rounded transition-colors tracking-wide">REQUEST PROCUREMENT BUDGET</button>
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
            {state.survived ? (state.earlySale ? `ACCOUNT CLOSED: ${state.saleCity.toUpperCase()}` : "CONSTANTINOPLE") : "OPERATIONAL FAILURE"}
          </h1>
          <p className="text-center text-stone-300 text-sm">
            {state.survived
              ? state.earlySale ? `Liquidated inventory at ${mult}x in ${state.saleCity}. ${Math.round(progress)}% of the pipeline complete.`
              : `Full logistical journey complete. Inventory sold at 100x in Constantinople.`
              : `Your assets perished on day ${state.day}. The desert does not accept excuses.`}
          </p>

          {/* Profit Ledger */}
          <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1 text-xs">
            <h2 className="text-indigo-300 font-bold uppercase tracking-wide text-center mb-1">Q3 Financial Ledger</h2>
            <div className="flex justify-between text-stone-400"><span>Procurement Overhead</span><span className="text-red-400">-{cost} silver</span></div>
            {state.survived && <div className="flex justify-between text-stone-400"><span>Gross Revenue ({mult}x)</span><span className="text-emerald-400">+{revenue} silver</span></div>}
            <div className="border-t border-stone-600 mt-1 pt-1 flex justify-between font-bold">
              <span className="text-stone-200">Net Profit</span>
              <span className={profit >= 0 ? "text-emerald-400" : "text-red-500"}>{profit >= 0 ? "+" : ""}{profit} silver</span>
            </div>
          </div>

          {/* Cultural Exchange */}
          <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1 text-xs">
            <h2 className="text-amber-300 font-bold uppercase tracking-wide text-center mb-1">Cultural KPI (Networking)</h2>
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
            {state.culturalExchange === 0 && <p className="text-stone-600 text-center italic mt-1">Zero cultural impact. You strictly treated this as a transactional relationship.</p>}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1">
              <h2 className="text-indigo-300 font-bold text-xs uppercase tracking-wide text-center">Operational Metrics</h2>
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
    <div className="h-screen bg-stone-900 text-stone-100 flex flex-col overflow-hidden" style={{ fontFamily: "'Georgia',serif" }}>
      {/* 🔴 NEW: DYNAMIC SCENE BANNER */}
      <div className="flex-shrink-0 bg-stone-800 border-b border-stone-700">
        <div className="max-w-lg mx-auto">
          <div className="relative w-full overflow-hidden" style={{ height: 120 }}>
            <img 
              src={currentBgImage} 
              alt="Silk Road Environment"
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-900 via-stone-900/40 to-transparent" />
            <div className="absolute bottom-1 left-2 text-xs font-bold" style={{ color: "#a0a0d4", opacity: 0.85, fontFamily: "monospace" }}>{Math.round(progress)}%</div>
            <div className="absolute bottom-1 right-2 text-xs font-bold" style={{ color: "#a0a0d4", opacity: 0.85, fontFamily: "monospace" }}>{Math.round(state.distance)} mi</div>
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs font-bold" style={{ color: "#a0a0d4", opacity: 0.85, fontFamily: "monospace" }}>{progressLabel}</div>
          </div>
        </div>
      </div>

      {/* Resource dashboard */}
      <div className="flex-shrink-0 bg-stone-900 px-4 pt-2 pb-1">
        <div className="max-w-lg mx-auto text-xs space-y-1">
          <div className="flex justify-between items-center">
            <span>📦 Inventory <span className="text-amber-300 font-bold">{r.goods}</span></span>
            <span>🐫 Assets <span className="text-amber-300 font-bold">{r.camels}</span></span>
            <span>⚔️ Contractors <span className="text-amber-300 font-bold">{r.guards}</span></span>
            <span>💰 Capital <span className="text-amber-300 font-bold">{r.silver}</span></span>
          </div>
          {([
            ["💧 Hydration", r.water, r.water < 15 ? "bg-red-500" : "bg-blue-500"],
            ["😊 Synergy", r.morale, r.morale < 25 ? "bg-red-500" : "bg-green-500"],
          ] as [string, number, string][]).map(([label, val, color]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-20 text-stone-400">{label}</span>
              <div className="flex-1 bg-stone-700 rounded-full h-2.5">
                <div className={`${color} h-2.5 rounded-full transition-all`} style={{ width: `${val}%` }} />
              </div>
              <span className="text-stone-500 w-6 text-right">{val}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="w-20 text-stone-400">📜 Networking</span>
            <div className="flex-1 bg-stone-700 rounded-full h-2.5">
              <div className="bg-amber-500 h-2.5 rounded-full transition-all" style={{ width: `${Math.min(state.culturalExchange / 30 * 100, 100)}%` }} />
            </div>
            <span className="text-stone-500 w-6 text-right">{state.culturalExchange}</span>
          </div>
          <div className="flex justify-between text-stone-500 mt-1">
            <span>Day {state.day}</span>
            <span>{Math.round(state.distance)}/{TOTAL_DISTANCE} mi</span>
          </div>
        </div>
      </div>

      {/* Party Status HUD */}
      <DoomHUD members={partyMembers} />

      {/* Game area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="max-w-lg mx-auto space-y-3 mt-2">
          {state.phase === "traveling" && (
            <div className="space-y-3">
              <div className="border border-stone-700 rounded p-3 bg-stone-800/80">
                <p className="text-stone-300 text-sm leading-relaxed">
                  {r.water < 10 ? "Hydration levels critical. The camel assets are depreciating rapidly." :
                   r.morale < 25 ? "Workplace morale is abysmal. The contractors are discussing a strike." :
                   r.camels < 8 ? "Severe logistical bottleneck. You don't have enough camels for this inventory." :
                   progress > 80 ? "The Mediterranean market is close. You can smell the final payout." :
                   progress > 50 ? "Entering the Persian territory. The worst operational hazards are behind you." :
                   progress > 30 ? "The mountains loom ahead. This is where the supply chain usually breaks." :
                   "The caravan moves west. Just you and the operational overhead."}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setState(p => ({ ...p, pace: "easy" })); advance(); }} className="flex-1 py-2 bg-stone-700 hover:bg-stone-600 rounded text-xs font-bold transition-colors">
                  🐫 Risk-Averse
                  <br /><span className="text-stone-500 font-normal">Slow · Retains water</span>
                </button>
                <button onClick={() => { setState(p => ({ ...p, pace: "normal" })); advance(); }} className="flex-1 py-2 bg-indigo-800 hover:bg-indigo-700 rounded text-xs font-bold transition-colors">
                  🐫🐫 Optimized
                  <br /><span className="text-stone-400 font-normal">Standard KPI</span>
                </button>
                <button onClick={() => { setState(p => ({ ...p, pace: "push" })); advance(); }} className="flex-1 py-2 bg-red-900 hover:bg-red-800 rounded text-xs font-bold transition-colors">
                  🐫🐫🐫 Aggressive
                  <br /><span className="text-stone-400 font-normal">High Burn Rate</span>
                </button>
              </div>
            </div>
          )}

          {/* 🔴 CONDITIONAL ENGINE RENDERING */}
          {state.phase === "event" && state.currentEvent && (
            state.currentEvent.type === "push_luck" ? (
              <PushYourLuckEngine
                event={state.currentEvent}
                onUpdate={handlePushUpdate}
                onLeave={handlePushLeave}
              />
            ) : (
              <div className="border-2 border-indigo-800 rounded bg-stone-800 overflow-hidden shadow-lg">
                {/* 🔴 NEW: STANDARD EVENT IMAGE INJECTION */}
                {state.currentEvent.image && (
                  <div className="w-full h-32 relative border-b border-indigo-900/50">
                    <img 
                      src={`/faces/${state.currentEvent.image}`} 
                      alt={state.currentEvent.title}
                      className="w-full h-full object-cover"
                      style={{ imageRendering: "pixelated", objectPosition: "center" }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-800 via-transparent to-transparent" />
                  </div>
                )}
                <div className="p-3">
                  <h2 className="text-indigo-300 font-bold text-sm mb-1">{state.currentEvent.title}</h2>
                  <p className="text-stone-300 text-sm leading-relaxed mb-3">{state.currentEvent.text}</p>
                  <div className="space-y-1.5">
                    {state.currentEvent.choices?.map((c, i) => (
                      <button key={i} onClick={() => handleChoice(i)} className="w-full text-left p-2 bg-stone-700 hover:bg-stone-600 rounded text-xs text-stone-200 font-bold transition-colors border border-stone-600">
                        ▶ {c.text}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )
          )}

          {state.phase === "result" && (
            <div className="space-y-3">
              <div className="border border-stone-700 rounded p-3 bg-stone-800/80">
                <p className="text-stone-300 text-sm leading-relaxed">{state.resultText}</p>
              </div>
              <button onClick={dismissResult} className="w-full py-2 bg-indigo-800 hover:bg-indigo-700 rounded text-sm font-bold transition-colors">Acknowledge</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
