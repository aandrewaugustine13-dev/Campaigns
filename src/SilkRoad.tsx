import { useState, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════
// SILK ROAD — Chang'an to Constantinople, 130 BCE
// ═══════════════════════════════════════════════════════════════

interface Resources { [key: string]: number; }
interface Outcome { weight: number; effects: Resources; result: string; earlyEnd?: boolean; }
interface Choice { text: string; effects?: Resources; result?: string; outcomes?: Outcome[]; earlyEnd?: boolean; }
interface GameEvent { id: string; phase_min: number; phase_max: number; weight: number; title: string; text: string; choices: Choice[]; }
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
// EVENTS
// ═══════════════════════════════════════════════════════════════

const EVENTS: GameEvent[] = [
  // ── DESERT PHASE (0-0.3) ──
  {id:"taklamakan",phase_min:0,phase_max:0.25,weight:5,title:"The Sea of Death",text:"The Taklamakan stretches ahead. Your guide says the name means 'go in and you won't come out.' Two routes: north around the edge — longer but there are oases. Or straight through — three days with no water.",choices:[
    {text:"Take the northern route. Follow the oases.",outcomes:[
      {weight:6,effects:{water:-8,camels:-1},result:"Slow going but the oases hold. One camel collapses from the heat and doesn't get up."},
      {weight:4,effects:{water:-4,morale:3},result:"Your guide knows every water hole. The crew sings at night. This is the way."}
    ]},
    {text:"Straight through. Three days.",outcomes:[
      {weight:4,effects:{water:-20,camels:-4,morale:-8,goods:-10},result:"Day two, a sandstorm. Four camels buried. Ten bales of silk gone. You drink the last water at dawn on day three."},
      {weight:6,effects:{water:-15,morale:5,camels:-2},result:"Your guide navigates by stars. Two camels drop but you cut a week off the journey."}
    ]},
    {text:"Wait for another caravan. Travel together.",outcomes:[
      {weight:5,effects:{water:-6,morale:2,silver:-15},result:"A Sogdian caravan arrives in three days. They charge for the privilege of company. Safer though."},
      {weight:5,effects:{water:-12,morale:-5},result:"Nobody comes. Four days wasted at the desert's edge."}
    ]}
  ]},
  {id:"sandstorm",phase_min:0,phase_max:0.35,weight:4,title:"Wall of Sand",text:"Horizon turns brown. Your guide's face goes pale. 'Cover the goods. Get the camels down. Now.'",choices:[
    {text:"Hunker down. Wait it out.",effects:{water:-5,morale:-3,goods:-5},result:"Two days buried in sand. Five bales ruined by grit. But you're alive."},
    {text:"Race for the rock formation ahead.",outcomes:[
      {weight:5,effects:{camels:-3,goods:-15,morale:-6},result:"Didn't make it. Three camels down, goods scattered across a mile of desert."},
      {weight:5,effects:{water:-2,morale:4},result:"The rocks break the wind. Your guide grins. 'I knew those rocks were there.'"}
    ]},
    {text:"Spread out. Don't lose everything in one place.",effects:{goods:-8,camels:-1,morale:-2},result:"Smart thinking. Losses spread thin. One camel wanders off and doesn't return."}
  ]},
  {id:"oasis_trade",phase_min:0.05,phase_max:0.3,weight:4,title:"The Oasis at Dunhuang",text:"Dunhuang — last stop before the desert. Buddhist monks have carved caves full of paintings into the cliffs. A merchant here offers 5x what you paid for your goods in Chang'an.",choices:[
    {text:"Sell everything. 5x is good money.",effects:{morale:6},result:"500 silver. Safe profit. Your journey ends here.",earlyEnd:true},
    {text:"Sell half. Lock in some profit, carry the rest.",effects:{goods:-50,silver:250,morale:3},result:"Half sold at 5x. Smart hedge. The merchant nods — he's seen a thousand caravans. Most don't come back."},
    {text:"Keep everything. The real money is west.",outcomes:[
      {weight:5,effects:{morale:2},result:"Your guards think you're greedy. Your translator thinks you're brave. Both might be right."},
      {weight:5,effects:{morale:-2},result:"The merchant laughs. 'I'll buy what's left off your corpse in Samarkand.'"}
    ]}
  ]},
  {id:"dunhuang_caves",phase_min:0.05,phase_max:0.25,weight:3,title:"The Mogao Caves",text:"Your translator is fascinated by the cave paintings — Buddhist stories rendered in a style mixing Chinese, Indian, and Central Asian art. A monk offers to teach your translator a sutra in exchange for a small jade figurine.",choices:[
    {text:"Trade the jade. Knowledge travels lighter than stone.",effects:{goods:-3,culturalExchange:3},result:"The monk teaches for three days. Your translator now carries Buddhist teachings westward in his memory. The jade stays in a cave that will endure two thousand years."},
    {text:"The jade is worth silver. Keep it.",effects:{morale:-1},result:"Your translator says nothing. But something dims in his eyes."},
    {text:"Offer silver instead of jade.",outcomes:[
      {weight:5,effects:{silver:-10,culturalExchange:2},result:"The monk accepts. He teaches a shorter version. Your translator copies the sutra onto paper."},
      {weight:5,effects:{},result:"'Silver buys things. Jade carries meaning.' The monk turns away."}
    ]}
  ]},
  {id:"water_crisis",phase_min:0.1,phase_max:0.35,weight:4,title:"Dry Wells",text:"Three wells in a row — all dry. Sand-filled, bone-dry. Your water is dropping fast and the camels are suffering.",choices:[
    {text:"Kill a camel. Drink the blood and stomach water.",effects:{camels:-1,water:5,morale:-4},result:"Disgusting. Effective. The crew won't look at you the same, but they're alive."},
    {text:"Press on. The next oasis has to be close.",outcomes:[
      {weight:4,effects:{water:-15,camels:-3,morale:-8,crew:-1},result:"It wasn't close. Three camels dead. A guard collapses and doesn't wake up."},
      {weight:6,effects:{water:-8,morale:3},result:"Your guide smells water on the wind. Green trees on the horizon by evening."}
    ]},
    {text:"Send the guide ahead on the fastest camel.",outcomes:[
      {weight:6,effects:{water:-6,morale:2},result:"He returns at dawn with full waterskins and directions. Two days detour but you'll live."},
      {weight:4,effects:{water:-10,morale:-6},result:"He doesn't come back for three days. You're rationing a cup a day when he finally appears."}
    ]}
  ]},
  // ── MOUNTAIN/CENTRAL PHASE (0.25-0.6) ──
  {id:"pamir_pass",phase_min:0.3,phase_max:0.5,weight:5,title:"The Roof of the World",text:"The Pamir Mountains. Passes above 15,000 feet. Air so thin the camels stumble. Your Chinese crew has never seen snow like this.",choices:[
    {text:"Take the high pass. Shorter but brutal.",outcomes:[
      {weight:5,effects:{camels:-5,goods:-10,morale:-6,crew:-1},result:"A guard slips on ice and falls. Five camels can't handle the altitude. Goods tumble into a gorge."},
      {weight:5,effects:{camels:-2,morale:4},result:"Clear day. The view stretches forever. Two camels stumble but survive. Your crew will talk about this pass for the rest of their lives."}
    ]},
    {text:"The valley route. Longer, lower, safer.",effects:{water:-8,camels:-1,morale:1},result:"Five extra days but nobody dies. One camel goes lame on loose rock."},
    {text:"Hire local Tajik guides.",outcomes:[
      {weight:7,effects:{silver:-20,culturalExchange:2,morale:3},result:"The Tajiks know every switchback. They share stories of Alexander the Great crossing these same passes. Your translator writes everything down."},
      {weight:3,effects:{silver:-20,goods:-15,morale:-5},result:"The 'guides' vanish in the night with fifteen bales of silk."}
    ]}
  ]},
  {id:"samarkand",phase_min:0.35,phase_max:0.5,weight:5,title:"The Jewel of the Road",text:"Samarkand. The crossroads of the world. Every language you've ever heard and twenty you haven't. A Sogdian merchant offers 15x your original price for everything you're carrying.",choices:[
    {text:"Sell it all. 15x is a fortune.",effects:{morale:8},result:"1,500 silver. You're rich. The journey ends in the most beautiful city you'll ever see.",earlyEnd:true},
    {text:"Sell a quarter. Resupply. Keep moving.",effects:{goods:-25,silver:375,water:15,morale:3},result:"Smart trade. Fresh water, fed camels, and still plenty to sell west."},
    {text:"Buy MORE goods here. Samarkand specialties for the Roman market.",outcomes:[
      {weight:6,effects:{silver:-50,goods:20,culturalExchange:2},result:"Lapis lazuli, Sogdian silver work, paper — Romans will pay anything for paper. Your translator explains Chinese papermaking to a local craftsman."},
      {weight:4,effects:{silver:-50,goods:10,morale:-2},result:"Overpaid. Your guard captain is furious. 'We're merchants, not collectors.'"}
    ]}
  ]},
  {id:"sogdian_papermaker",phase_min:0.35,phase_max:0.55,weight:3,title:"The Secret of Paper",text:"A Sogdian craftsman has heard of Chinese paper but has never seen it made. Your translator could demonstrate — but papermaking is a closely guarded Chinese secret. Sharing it would be a betrayal of your homeland's advantage.",choices:[
    {text:"Demonstrate. Knowledge wants to be free.",effects:{culturalExchange:4,morale:2},result:"Your translator shows the process. Within a decade, Samarkand will be the papermaking capital of the Islamic world. Within a century, paper reaches Europe. You just changed history."},
    {text:"Refuse. The secret stays Chinese.",effects:{morale:-1,silver:15},result:"The craftsman offers silver for even a hint. You take the money. Paper will reach the west eventually — but not through you."},
    {text:"Teach a simplified version. Hold back the best techniques.",effects:{culturalExchange:2,silver:10},result:"Half a secret is still a revolution. The craftsman produces rough paper within a week. Good enough to write on. Not good enough to threaten Chinese exports. Yet."}
  ]},
  {id:"bandits_mountain",phase_min:0.25,phase_max:0.55,weight:4,title:"Riders in the Pass",text:"Dust cloud behind you. Twelve mounted men gaining fast. Your guard captain draws his sword.",choices:[
    {text:"Stand and fight.",outcomes:[
      {weight:5,effects:{guards:-2,morale:5,goods:-5},result:"Your guards are outnumbered but better armed. Two go down. The bandits scatter with a few bales."},
      {weight:5,effects:{guards:-1,morale:4},result:"Chinese crossbows versus Central Asian bows. The crossbows win. One guard takes an arrow."}
    ]},
    {text:"Offer tribute. Ten percent.",effects:{goods:-10,morale:-3},result:"They take the tribute and ride on. Your guard captain spits in the dust."},
    {text:"Show the crossbows. Make them think twice.",outcomes:[
      {weight:6,effects:{morale:3,culturalExchange:1},result:"A demonstration shot splits a melon at two hundred yards. They've never seen a crossbow. They leave. Word will spread about Chinese weapons."},
      {weight:4,effects:{goods:-20,guards:-1,morale:-5},result:"They're not impressed. Or desperate enough not to care. One guard dead, twenty bales gone."}
    ]}
  ]},
  {id:"ferghana_horses",phase_min:0.3,phase_max:0.5,weight:3,title:"The Heavenly Horses",text:"Ferghana Valley — home of the legendary 'blood-sweating' horses the Chinese Emperor has fought wars over. A breeder offers to sell you three in exchange for silk.",choices:[
    {text:"Trade silk for horses. The Emperor would pay a fortune.",effects:{goods:-15,camels:3,morale:4,culturalExchange:2},result:"Three Ferghana horses. They're everything the legends promised. The breed will transform Chinese cavalry within a generation."},
    {text:"The silk is worth more in Rome.",effects:{morale:-1},result:"Your translator sighs. Some things are worth more than silver."},
    {text:"Ask to sketch the breeding techniques instead.",outcomes:[
      {weight:5,effects:{culturalExchange:3,silver:-5},result:"The breeder is flattered. He talks for hours about bloodlines. Your translator fills ten pages. This knowledge will reach Chang'an."},
      {weight:5,effects:{morale:-2},result:"The breeder is offended. 'You want my life's work for a few coins?' He walks away."}
    ]}
  ]},
  {id:"buddhist_monks",phase_min:0.2,phase_max:0.6,weight:3,title:"Pilgrims on the Road",text:"Buddhist monks heading east toward China. They carry Sanskrit texts they want translated into Chinese. Your translator speaks both languages.",choices:[
    {text:"Help them. Translate for three days.",effects:{water:-5,culturalExchange:4,morale:3},result:"Three days of sacred text translation. These sutras will reach Chinese monasteries within a year. The monks bless your caravan. Your translator calls it the most important thing he's ever done."},
    {text:"No time. Keep moving.",effects:{morale:-2},result:"The monks bow and continue east. The texts will find another translator. Eventually."},
    {text:"Trade — translation for travel advice.",effects:{culturalExchange:3,water:5},result:"They know every water source between here and Merv. Your translator works through the night on their texts. Fair exchange."}
  ]},
  // ── PERSIAN/LATE PHASE (0.5-0.8) ──
  {id:"merv",phase_min:0.5,phase_max:0.65,weight:5,title:"Merv — Gateway to Persia",text:"Merv, the great Persian trading city. Zoroastrian fire temples beside Buddhist stupas beside Greek columns. A Parthian noble offers 30x your original price.",choices:[
    {text:"Sell everything. 30x. Walk away wealthy.",effects:{morale:8},result:"3,000 silver. Your grandchildren will be rich. The road west is someone else's problem.",earlyEnd:true},
    {text:"Sell a third. Lighten the load for the final push.",effects:{goods:-33,silver:990,water:10,morale:4},result:"A third sold at 30x. Your camels walk lighter. Two thousand miles to go."},
    {text:"Trade for Persian goods. Diversify.",outcomes:[
      {weight:6,effects:{goods:10,silver:-30,culturalExchange:2},result:"Persian carpets, Zoroastrian metalwork, recipes for new spice blends. Romans will lose their minds over this."},
      {weight:4,effects:{silver:-30,goods:5,morale:-2},result:"Traded poorly. The Persian merchants are better at this than you."}
    ]}
  ]},
  {id:"zoroastrian_fire",phase_min:0.5,phase_max:0.7,weight:3,title:"The Eternal Flame",text:"A Zoroastrian priest invites your caravan to witness a fire ceremony. He's curious about the religions of China — Buddhism, Taoism, ancestor worship. He wants to understand.",choices:[
    {text:"Attend. Share what you know of eastern faiths.",effects:{culturalExchange:3,morale:3},result:"Two traditions meet at a fire that's burned for a hundred years. The priest writes down everything. Your translator does the same. Both walk away richer in the only way that matters."},
    {text:"Politely decline. Religion is dangerous politics.",effects:{morale:-1},result:"Safe choice. Boring choice. Your translator looks disappointed."},
    {text:"Attend, and bring a gift — a bronze mirror from Chang'an.",effects:{goods:-2,culturalExchange:4,morale:4},result:"The priest holds the mirror like it's sacred. He's never seen bronze work this fine. He gives you a Zoroastrian text in exchange. East meets west in firelight."}
  ]},
  {id:"parthian_toll",phase_min:0.55,phase_max:0.75,weight:4,title:"The Parthian Border",text:"Parthian soldiers block the road. The empire controls all trade heading to Rome. Toll: twenty percent of your goods or you don't pass.",choices:[
    {text:"Pay the toll. Cost of doing business.",effects:{goods:-20,morale:-2},result:"They take exactly twenty percent. Professional thieves in uniform."},
    {text:"Negotiate. Offer ten percent and information.",outcomes:[
      {weight:5,effects:{goods:-10,culturalExchange:1,morale:2},result:"Ten percent plus news from the east. The captain is more interested in Chinese military innovations than silk. Your translator is careful about what he shares."},
      {weight:5,effects:{goods:-25,morale:-4},result:"They take twenty-five percent for wasting their time. 'Next time, pay what we ask.'"}
    ]},
    {text:"Find another route. Bribe a local guide.",outcomes:[
      {weight:4,effects:{silver:-25,morale:3},result:"A shepherd knows a goat trail through the mountains. Three days extra but you keep everything."},
      {weight:6,effects:{silver:-25,goods:-30,guards:-1,morale:-6},result:"The 'guide' leads you straight into an ambush. Thirty bales gone, one guard killed."}
    ]}
  ]},
  {id:"roman_crossbow",phase_min:0.6,phase_max:0.85,weight:3,title:"The Weapon Question",text:"A Roman military officer examines your guards' crossbows with obvious hunger. He offers an enormous sum — 500 silver — for three crossbows and a demonstration of how they're made.",choices:[
    {text:"Sell them. 500 silver is 500 silver.",effects:{silver:500,guards:-1,culturalExchange:3},result:"Chinese crossbow technology reaches Rome. Within a century, it will transform European warfare. Your guard captain is one weapon short and furious. History doesn't care."},
    {text:"Refuse. Weapons secrets don't leave China.",effects:{morale:2},result:"The officer nods. Respects it. He'll get the technology eventually — through war instead of trade."},
    {text:"Demonstrate but don't sell. Let him see what he's up against.",effects:{culturalExchange:2,morale:3},result:"A political move. Rome now knows China has superior ranged weapons. Whether that prevents a war or starts one is someone else's problem."}
  ]},
  {id:"plague_caravan",phase_min:0.4,phase_max:0.75,weight:4,title:"Sick Caravan",text:"A caravan coming east — everyone's coughing, feverish. They want to trade. Your goods are fine. Their prices are desperate.",choices:[
    {text:"Trade with them. Great prices.",outcomes:[
      {weight:5,effects:{goods:15,silver:-10,crew:-1,morale:-8},result:"Great prices because they're dying. A week later, your translator is burning with fever. He survives. Barely."},
      {weight:5,effects:{goods:15,silver:-10,morale:2},result:"Luck holds. Great trade, no sickness. Sometimes the gamble pays."}
    ]},
    {text:"Keep distance. Share water and move on.",effects:{water:-5,morale:4,culturalExchange:1},result:"Mercy costs five waterskins. They'll remember a Chinese caravan that helped. That reputation travels ahead of you."},
    {text:"Avoid them entirely.",effects:{morale:-2},result:"Cold. But smart. Nobody gets sick."}
  ]},
  // ── ROMAN WORLD (0.7-1.0) ──
  {id:"antioch",phase_min:0.75,phase_max:0.88,weight:5,title:"Antioch — Rome's Eastern Door",text:"Antioch. You can smell the Mediterranean. Roman merchants swarm your caravan. 60x your original price offered before you've unpacked.",choices:[
    {text:"Sell here. 60x. You've made it far enough.",effects:{morale:8},result:"6,000 silver. More money than most Romans will see in a lifetime. The road to Constantinople is dangerous and the return is diminishing.",earlyEnd:true},
    {text:"Sell half. Save the best for Constantinople.",effects:{goods:-50,silver:3000,morale:4},result:"Half gone at 60x. You keep the finest silk and the rarest goods for the richest city in the world."},
    {text:"Buy Roman goods for the return trip.",outcomes:[
      {weight:6,effects:{silver:-100,goods:10,culturalExchange:3},result:"Roman glassware, wine, gold coins, woolen textiles. If you survive the return trip, these sell for 50x in Chang'an. You also document Roman engineering — aqueducts, roads, concrete."},
      {weight:4,effects:{silver:-100,goods:5},result:"Overpaid for mediocre Roman goods. The locals saw you coming."}
    ]}
  ]},
  {id:"roman_silk",phase_min:0.7,phase_max:0.95,weight:3,title:"The Senate's Obsession",text:"Roman senators are so obsessed with Chinese silk that the Senate has tried to ban it — too much gold flowing east. A senator's wife offers to buy your entire stock privately. Double the going rate. Very illegal.",choices:[
    {text:"Sell to her. Laws are for Romans, not Chinese merchants.",outcomes:[
      {weight:5,effects:{goods:-30,silver:600,morale:3},result:"Done in a warehouse at midnight. She pays in gold. You don't ask questions."},
      {weight:5,effects:{goods:-30,silver:600,morale:-5,guards:-1},result:"Roman soldiers raid the warehouse. Your guard takes a gladius to the arm. You escape with the gold."}
    ]},
    {text:"Sell at the public market. Legal and safe.",effects:{goods:-20,silver:200,morale:2},result:"Fair price. Legal. Boring. Your translator shrugs."},
    {text:"Use the silk as gifts. Build relationships.",effects:{goods:-10,culturalExchange:3,morale:4},result:"Silk gifts to influential Romans. They'll remember you. Trade routes are built on relationships, not transactions."}
  ]},
  {id:"roman_glassblowing",phase_min:0.75,phase_max:0.95,weight:3,title:"The Glassblower's Secret",text:"A Roman glassblower demonstrates techniques unknown in China — transparent glass, colored glass, glass blown into shapes. Your translator is mesmerized.",choices:[
    {text:"Pay him to teach your translator the basics.",effects:{silver:-30,culturalExchange:4},result:"Three days in a furnace-hot workshop. Your translator burns his hands twice but memorizes every step. Chinese glass will never be the same."},
    {text:"Buy finished glassware to sell in Chang'an.",effects:{silver:-20,goods:10,culturalExchange:1},result:"Beautiful work. Chang'an nobles will pay a fortune. But they'll never learn to make it themselves."},
    {text:"No time for crafts. Keep moving.",effects:{},result:"The road is long and you've been away from home for months. Fair enough."}
  ]},
  {id:"storm_at_sea",phase_min:0.85,phase_max:0.95,weight:4,title:"The Strait",text:"The crossing from Anatolia to Constantinople. A short sea voyage. The captain says a storm is coming — wait two days or risk it.",choices:[
    {text:"Wait. You've come too far to drown.",effects:{water:-6,morale:-2},result:"Two days watching waves. The storm passes. You cross in calm waters. Constantinople's walls appear like a dream."},
    {text:"Risk it. You can see the city from here.",outcomes:[
      {weight:4,effects:{goods:-20,camels:-3,morale:-8},result:"The storm hits mid-channel. Three camels overboard, twenty bales of goods in the sea. You wash up alive. Barely."},
      {weight:6,effects:{morale:5},result:"The captain knows these waters. You ride the storm's edge and dock before the worst hits. Constantinople by nightfall."}
    ]},
    {text:"Go overland. Longer but no boats.",effects:{water:-10,camels:-1,morale:1},result:"A week around the coast. One camel goes lame. Slow but certain."}
  ]},
  {id:"constantinople_arrival",phase_min:0.92,phase_max:1.0,weight:6,title:"The Golden City",text:"Constantinople. The walls are sixty feet high. The markets overflow with goods from every corner of the known world. Your silk is worth 100x what you paid in Chang'an. You made it.",choices:[
    {text:"Sell everything at full price. 100x.",effects:{morale:10},result:"The full payoff. You've crossed deserts, mountains, and empires. Every bale of silk, every jade figurine, every bronze mirror — sold at the highest possible price.",earlyEnd:true},
    {text:"Sell the trade goods. Keep one bale of silk for yourself.",effects:{goods:-5,morale:8,culturalExchange:1},result:"You keep the finest silk as a reminder. In old age, you'll run your fingers across it and remember the Taklamakan."},
    {text:"Establish a permanent trading post.",effects:{silver:-200,culturalExchange:5,morale:6},result:"Not just a trade — a bridge. You hire local translators, rent a warehouse, and create a permanent connection between east and west. The real Silk Road was never about one trip."}
  ]},
  // ── ANYTIME EVENTS ──
  {id:"caravan_tax",phase_min:0.15,phase_max:0.85,weight:3,title:"Local Warlord",text:"A local strongman wants payment for 'protection' on his stretch of road. His men outnumber your guards three to one.",choices:[
    {text:"Pay. Survival arithmetic.",effects:{silver:-25,morale:-2},result:"He takes the silver and waves you through. This is how empires work."},
    {text:"Offer to trade instead — goods for passage.",effects:{goods:-8,morale:1,culturalExchange:1},result:"He's never seen silk before. He rubs it between his fingers like a man discovering water. He lets you pass and asks your name."},
    {text:"Bluff. Claim imperial Chinese protection.",outcomes:[
      {weight:4,effects:{morale:5},result:"The name of the Han Emperor still carries weight out here. He backs down."},
      {weight:6,effects:{silver:-40,goods:-10,morale:-6},result:"He doesn't care about emperors 3,000 miles away. He takes double for the insult."}
    ]}
  ]},
  {id:"sick_camel",phase_min:0.1,phase_max:0.8,weight:3,title:"Lame Camel",text:"Your best pack camel is limping. Swollen leg, won't bear weight. It's carrying forty bales of silk.",choices:[
    {text:"Redistribute the load. Rest the camel.",effects:{camels:-1,morale:-1},result:"Other camels groan under the extra weight. The lame one is set free. It stands in the road watching you leave."},
    {text:"Slaughter it. Feed the crew.",effects:{camels:-1,morale:2,water:3},result:"The crew eats well. Camel meat and camel blood mixed with water. It tastes awful and keeps you alive."},
    {text:"Push it. The camel walks or we lose the silk.",outcomes:[
      {weight:4,effects:{camels:-1,goods:-10},result:"It collapses a mile later. Ten bales scatter. You should have listened."},
      {weight:6,effects:{morale:-2},result:"It limps for three days and somehow recovers. Camels are tougher than they look."}
    ]}
  ]},
  {id:"translator_discovery",phase_min:0.2,phase_max:0.8,weight:3,title:"The Translator's Notebook",text:"Your translator has been keeping a journal — languages, customs, trade practices, religious beliefs, recipes, medical treatments. Every culture you've encountered. He asks if you want to fund copies when you reach a city.",choices:[
    {text:"Fund it. That journal is more valuable than silk.",effects:{silver:-15,culturalExchange:3},result:"Three copies made by scribes in the next city. One stays, two travel. The knowledge of a dozen cultures preserved in one book."},
    {text:"Good for him. Not spending silver on paper.",effects:{},result:"The journal stays a single copy in one man's bag. If he dies, it dies with him."},
    {text:"Add to it. Document your own observations.",effects:{silver:-5,culturalExchange:2,morale:2},result:"Merchant and translator collaborate. Trade routes, water sources, prices, customs. A practical guide to the world."}
  ]},
  {id:"night_raid",phase_min:0.2,phase_max:0.75,weight:4,title:"Night Raid",text:"Screaming in the dark. Torches. Your guard captain shakes you awake. 'Bandits. Twenty at least.'",choices:[
    {text:"Fight. Wake everyone.",outcomes:[
      {weight:5,effects:{guards:-2,goods:-10,morale:-4},result:"Chaos in firelight. Two guards cut down. They grab what they can and vanish. Ten bales gone."},
      {weight:5,effects:{guards:-1,morale:6},result:"Your crossbows cut them apart in the dark. One guard takes a sword cut. The rest flee."}
    ]},
    {text:"Scatter the camels. Save the people.",effects:{camels:-4,goods:-15,morale:-3},result:"Four camels and their loads vanish in the dark. But everyone's alive."},
    {text:"Throw silver into the dark. Buy time.",effects:{silver:-30,morale:1},result:"They scramble for coins in the dirt. Your caravan slips away. Expensive but bloodless."}
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
  const loadLabel = ratio > 8 ? "Overloaded" : ratio > 6 ? "Heavy" : ratio > 4 ? "Good" : "Light";
  const loadColor = ratio > 8 ? "text-red-500" : ratio > 6 ? "text-orange-400" : ratio > 4 ? "text-emerald-400" : "text-blue-400";

  return (
    <div className="h-screen bg-stone-900 text-stone-100 flex flex-col overflow-hidden" style={{ fontFamily: "'Georgia',serif" }}>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-lg mx-auto space-y-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-indigo-400">PREPARE YOUR CARAVAN</h1>
            <p className="text-stone-500 text-xs mt-1">Chang'an Market · 130 BCE</p>
          </div>
          <div className="bg-stone-800 border border-stone-700 rounded p-3 text-xs text-stone-300 leading-relaxed">
            <p>The Han Emperor has granted your trading license. You have <span className="text-indigo-300 font-bold">{OUTFIT_BUDGET} silver</span> to outfit a caravan heading west.</p>
          </div>

          <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-3">
            {/* Camels */}
            <div>
              <div className="flex justify-between text-sm"><span>🐫 Camels</span><span className="text-amber-300 font-bold">{camels}</span></div>
              <input type="range" min={0} max={15} value={extraCamels} onChange={e => setExtraCamels(+e.target.value)} className="w-full accent-amber-500" />
              <p className="text-xs text-stone-500">15 silver each · Carry goods, survive desert</p>
            </div>
            {/* Guards */}
            <div>
              <div className="flex justify-between text-sm"><span>⚔️ Guards</span><span className="text-amber-300 font-bold">{guards}</span></div>
              <input type="range" min={0} max={8} value={extraGuards} onChange={e => setExtraGuards(+e.target.value)} className="w-full accent-amber-500" />
              <p className="text-xs text-stone-500">30 silver each · Protection from bandits</p>
            </div>
            {/* Water */}
            <div>
              <div className="flex justify-between text-sm"><span>💧 Water Supply</span><span className="text-amber-300 font-bold">{water}</span></div>
              <input type="range" min={0} max={25} value={extraWater} onChange={e => setExtraWater(+e.target.value)} className="w-full accent-amber-500" />
              <p className="text-xs text-stone-500">2 silver per skin · Life in the desert</p>
            </div>
            {/* Goods */}
            <div>
              <div className="flex justify-between text-sm"><span>📦 Trade Goods</span><span className="text-amber-300 font-bold">{goods}</span></div>
              <input type="range" min={0} max={40} value={extraGoods} onChange={e => setExtraGoods(+e.target.value)} className="w-full accent-amber-500" />
              <p className="text-xs text-stone-500">3 silver per bale · Silk, jade, bronze, spices</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-stone-800 border border-stone-700 rounded p-2">
              <span className="text-stone-500">Camel load:</span>
              <span className={`ml-1 font-bold ${loadColor}`}>{loadLabel}</span>
            </div>
            <div className="bg-stone-800 border border-stone-700 rounded p-2">
              <span className="text-stone-500">Silver left:</span>
              <span className={`ml-1 font-bold ${remaining >= 0 ? "text-emerald-400" : "text-red-500"}`}>{remaining}</span>
            </div>
          </div>

          {remaining < 0 && <p className="text-red-400 text-xs text-center">Over budget! Reduce your supplies.</p>}

          <div className="text-center pb-4">
            <button
              onClick={() => onDone({ goods, camels, guards, water, silver: remaining + 50, budgetSpent: spent })}
              disabled={remaining < 0}
              className={`px-6 py-2.5 font-bold rounded transition-colors tracking-wide ${remaining >= 0 ? "bg-indigo-700 hover:bg-indigo-600 text-white" : "bg-stone-700 text-stone-500 cursor-not-allowed"}`}
            >
              HEAD WEST
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
  const profitScore = Math.min(profitMultiplier / 100, 1) * 40; // 0-40 points
  const survivalScore = 30; // survived = full survival points
  const cultureScore = Math.min(culturalExchange / 30, 1) * 30; // 0-30 points
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

  const handleChoice = useCallback((idx: number) => {
    setState(prev => {
      if (!prev.currentEvent) return prev;
      const s = { ...prev, resources: { ...prev.resources }, culturalLog: [...prev.culturalLog] };
      const choice = s.currentEvent!.choices[idx];
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

  const dismissResult = useCallback(() => {
    setState(prev => ({ ...prev, phase: "traveling" as const, currentEvent: null, resultText: "" }));
  }, []);

  const r = state.resources;
  const progress = Math.min((state.distance / TOTAL_DISTANCE) * 100, 100);

  // ── INTRO ──
  if (state.phase === "intro") {
    return (
      <div className="h-screen bg-stone-900 text-stone-100 flex flex-col items-center justify-center p-4 overflow-hidden" style={{ fontFamily: "'Georgia',serif" }}>
        <div className="max-w-md w-full text-center space-y-4">
          <div>
            <h1 className="text-3xl font-bold tracking-wider text-indigo-400">THE SILK ROAD</h1>
            <p className="text-stone-500 text-xs tracking-[0.3em] uppercase mt-1">Chang'an to Constantinople · 130 BCE</p>
          </div>
          <div className="relative h-32 overflow-hidden rounded bg-gradient-to-b from-indigo-900 via-amber-900/40 to-stone-900 flex items-center justify-center">
            <span className="text-7xl">🐫</span>
          </div>
          <div className="border border-stone-700 rounded p-3 bg-stone-800/80 text-left space-y-2 text-sm text-stone-300 leading-relaxed">
            <p>You are a merchant in the Han Dynasty. Your caravan carries silk, jade, and bronze mirrors west — 4,000 miles through the deadliest deserts and highest mountains on earth.</p>
            <p>Your goods cost 50 silver in Chang'an. In Constantinople, they're worth 5,000.</p>
            <p className="text-indigo-300 font-bold">That's 100x your investment — if you make it there alive.</p>
          </div>
          <p className="text-xs text-stone-500 italic">Every major city along the way will offer to buy. Sell early and safe, or push west for the full payoff.</p>
          <button onClick={start} className="px-6 py-2.5 bg-indigo-700 hover:bg-indigo-600 text-white font-bold rounded transition-colors tracking-wide">PREPARE YOUR CARAVAN</button>
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
            {state.survived ? (state.earlySale ? `SOLD IN ${state.saleCity.toUpperCase()}` : "CONSTANTINOPLE") : "THE ROAD WINS"}
          </h1>
          <p className="text-center text-stone-300 text-sm">
            {state.survived
              ? state.earlySale ? `Sold goods at ${mult}x in ${state.saleCity}. ${Math.round(progress)}% of the journey complete.`
              : `Full journey complete. Goods sold at 100x in Constantinople.`
              : `Your caravan perished on day ${state.day}. The desert doesn't negotiate.`}
          </p>

          {/* Profit Ledger */}
          <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1 text-xs">
            <h2 className="text-indigo-300 font-bold uppercase tracking-wide text-center mb-1">The Ledger</h2>
            <div className="flex justify-between text-stone-400"><span>Caravan outfitting</span><span className="text-red-400">-{cost} silver</span></div>
            {state.survived && <div className="flex justify-between text-stone-400"><span>Goods sold ({mult}x)</span><span className="text-emerald-400">+{revenue} silver</span></div>}
            <div className="border-t border-stone-600 mt-1 pt-1 flex justify-between font-bold">
              <span className="text-stone-200">Net profit</span>
              <span className={profit >= 0 ? "text-emerald-400" : "text-red-500"}>{profit >= 0 ? "+" : ""}{profit} silver</span>
            </div>
          </div>

          {/* Cultural Exchange */}
          <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1 text-xs">
            <h2 className="text-amber-300 font-bold uppercase tracking-wide text-center mb-1">Cultural Exchange</h2>
            <div className="flex justify-between font-bold">
              <span className="text-stone-200">Knowledge shared</span>
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
            {state.culturalExchange === 0 && <p className="text-stone-600 text-center italic mt-1">No cultural exchanges made. The road remembers merchants who only took.</p>}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1">
              <h2 className="text-indigo-300 font-bold text-xs uppercase tracking-wide text-center">Your Journey</h2>
              {([["Reached", cityReached], ["Days", `${state.day}`], ["Distance", `${Math.round(state.distance)} mi`], ["Camels left", `${r.camels}`]] as [string, string][]).map(([l, v]) => (
                <div key={l} className="flex justify-between text-stone-400 text-xs"><span>{l}</span><span className="text-stone-200">{v}</span></div>
              ))}
            </div>
            <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1">
              <h2 className="text-blue-300 font-bold text-xs uppercase tracking-wide text-center">Historical Context</h2>
              {([["Full journey", "1-3 years"], ["Most merchants", "Sold at middlemen"], ["Silk markup", "~100x"], ["Cultural impact", "2000+ years"]] as [string, string][]).map(([l, v]) => (
                <div key={l} className="flex justify-between text-stone-400 text-xs"><span>{l}</span><span className="text-stone-200">{v}</span></div>
              ))}
            </div>
          </div>

          <div className="text-center"><span className="text-stone-500 text-xs">GRADE </span><span className={`text-4xl font-bold ${GC[grade]}`}>{grade}</span></div>

          <div className="bg-stone-800 border border-stone-700 rounded p-3">
            <p className="text-xs text-stone-500 leading-relaxed">The Silk Road wasn't one road — it was a web of routes connecting China to Rome for over 1,500 years. Silk, paper, gunpowder, the compass, Buddhism, Islam, and the Black Death all traveled these paths. No single merchant made the full journey — goods passed through dozens of hands, each adding their markup and their culture.</p>
          </div>

          {state.decisions.length > 0 && (
            <div className="bg-stone-800 border border-stone-700 rounded p-3 space-y-1">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wide">Decisions</h3>
              {state.decisions.map((d, i) => (
                <p key={i} className="text-xs text-stone-500"><span className="text-stone-600">Day {d.day}:</span> <span className="text-stone-400">{d.event}</span> — {d.choice}</p>
              ))}
            </div>
          )}
          <div className="text-center pb-4 space-y-2">
            <button onClick={() => { setState(makeInit()); setUsedEvents(new Set()); }} className="px-5 py-2 bg-indigo-700 hover:bg-indigo-600 text-white font-bold rounded transition-colors">Travel Again</button>
            <br /><button onClick={onBack} className="text-xs text-stone-500 hover:text-stone-300 transition-colors">← Back to Campaigns</button>
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN GAME ──
  const progressLabel = progress < 15 ? "Gansu Corridor" : progress < 30 ? "Taklamakan Desert" : progress < 45 ? "Ferghana Valley" : progress < 55 ? "Samarkand" : progress < 70 ? "Persia" : progress < 85 ? "Anatolia" : "Roman Empire";

  return (
    <div className="h-screen bg-stone-900 text-stone-100 flex flex-col overflow-hidden" style={{ fontFamily: "'Georgia',serif" }}>
      {/* Scene */}
      <div className="flex-shrink-0 bg-stone-800">
        <div className="max-w-lg mx-auto">
          <div className="relative w-full overflow-hidden rounded-b border-b border-stone-700" style={{ height: 100 }}>
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-900 via-amber-900/30 to-stone-800" />
            <div className="absolute bottom-1 left-2 text-xs font-bold" style={{ color: "#a0a0d4", opacity: 0.85, fontFamily: "monospace" }}>{Math.round(progress)}%</div>
            <div className="absolute bottom-1 right-2 text-xs font-bold" style={{ color: "#a0a0d4", opacity: 0.85, fontFamily: "monospace" }}>{Math.round(state.distance)} mi</div>
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs font-bold" style={{ color: "#a0a0d4", opacity: 0.65, fontFamily: "monospace" }}>{progressLabel}</div>
          </div>
        </div>
      </div>

      {/* Resource dashboard */}
      <div className="flex-shrink-0 bg-stone-900 px-4 pt-2 pb-1">
        <div className="max-w-lg mx-auto text-xs space-y-1">
          <div className="flex justify-between items-center">
            <span>📦 Goods <span className="text-amber-300 font-bold">{r.goods}</span></span>
            <span>🐫 Camels <span className="text-amber-300 font-bold">{r.camels}</span></span>
            <span>⚔️ Guards <span className="text-amber-300 font-bold">{r.guards}</span></span>
            <span>💰 Silver <span className="text-amber-300 font-bold">{r.silver}</span></span>
          </div>
          {([
            ["💧 Water", r.water, r.water < 15 ? "bg-red-500" : "bg-blue-500"],
            ["😊 Morale", r.morale, r.morale < 25 ? "bg-red-500" : "bg-green-500"],
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
            <span className="w-20 text-stone-400">📜 Culture</span>
            <div className="flex-1 bg-stone-700 rounded-full h-2.5">
              <div className="bg-amber-500 h-2.5 rounded-full transition-all" style={{ width: `${Math.min(state.culturalExchange / 30 * 100, 100)}%` }} />
            </div>
            <span className="text-stone-500 w-6 text-right">{state.culturalExchange}</span>
          </div>
          <div className="flex justify-between text-stone-500">
            <span>Day {state.day}</span>
            <span>{Math.round(state.distance)}/{TOTAL_DISTANCE} mi</span>
          </div>
        </div>
      </div>

      {/* Game area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="max-w-lg mx-auto space-y-3 mt-2">
          {state.phase === "traveling" && (
            <div className="space-y-3">
              <div className="border border-stone-700 rounded p-3 bg-stone-800/80">
                <p className="text-stone-300 text-sm leading-relaxed">
                  {r.water < 10 ? "Water's running low. The camels are suffering." :
                   r.morale < 25 ? "The crew is restless. Mutiny hangs in the air like desert heat." :
                   r.camels < 8 ? "Too few camels for the load. You're leaving goods behind." :
                   progress > 80 ? "The western cities are close. You can almost smell the Mediterranean." :
                   progress > 50 ? "Persia stretches before you. The hardest deserts are behind." :
                   progress > 30 ? "The mountains loom ahead. This is where the road earns its name." :
                   "The caravan moves west. Dust and horizon."}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setState(p => ({ ...p, pace: "easy" })); advance(); }} className="flex-1 py-2 bg-stone-700 hover:bg-stone-600 rounded text-xs font-bold transition-colors">
                  🐫 Cautious
                  <br /><span className="text-stone-500 font-normal">Slow · Less water</span>
                </button>
                <button onClick={() => { setState(p => ({ ...p, pace: "normal" })); advance(); }} className="flex-1 py-2 bg-indigo-800 hover:bg-indigo-700 rounded text-xs font-bold transition-colors">
                  🐫🐫 Steady
                  <br /><span className="text-stone-400 font-normal">Balanced</span>
                </button>
                <button onClick={() => { setState(p => ({ ...p, pace: "push" })); advance(); }} className="flex-1 py-2 bg-red-900 hover:bg-red-800 rounded text-xs font-bold transition-colors">
                  🐫🐫🐫 Push
                  <br /><span className="text-stone-400 font-normal">Fast · Hard</span>
                </button>
              </div>
            </div>
          )}

          {state.phase === "event" && state.currentEvent && (
            <div className="border-2 border-indigo-800 rounded p-3 bg-stone-800">
              <h2 className="text-indigo-300 font-bold text-sm mb-1">{state.currentEvent.title}</h2>
              <p className="text-stone-300 text-sm leading-relaxed mb-3">{state.currentEvent.text}</p>
              <div className="space-y-1.5">
                {state.currentEvent.choices.map((c, i) => (
                  <button key={i} onClick={() => handleChoice(i)} className="w-full text-left p-2 bg-stone-700 hover:bg-stone-600 rounded text-xs text-stone-200 font-bold transition-colors border border-stone-600">
                    ▶ {c.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {state.phase === "result" && (
            <div className="space-y-3">
              <div className="border border-stone-700 rounded p-3 bg-stone-800/80">
                <p className="text-stone-300 text-sm leading-relaxed">{state.resultText}</p>
              </div>
              <button onClick={dismissResult} className="w-full py-2 bg-indigo-800 hover:bg-indigo-700 rounded text-sm font-bold transition-colors">Continue</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
