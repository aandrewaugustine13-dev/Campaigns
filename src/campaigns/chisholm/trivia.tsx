import { useState } from "react";

// ═══════════════════════════════════════════════════════════════
// CHISHOLM TRAIL TRIVIA — Regional sages, TEKS-aligned questions
// 7th Grade Texas History — Ranching, Cattle Industry, & Cattle Trails
// TEKS §113.19 (Adopted 2022): Cotton, Cattle, and Railroads Era
// ═══════════════════════════════════════════════════════════════

export interface TriviaQuestion {
  id: string;
  region: "south" | "crossing" | "plains" | "railhead";
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  difficulty: 1 | 2 | 3;
}

interface Sage {
  name: string;
  title: string;
  region: string;
  flavor: string;
}

const SAGES: Record<string, Sage> = {
  south: {
    name: "Don Esteban",
    title: "Vaquero",
    region: "South Texas",
    flavor: "A weathered vaquero with silver-tipped spurs blocks your path at a creek crossing. His family has been working cattle in Texas since before the Republic. He tips his wide sombrero and grins. 'You think you invented the cattle drive, gringo? Answer my question and I'll teach you something your grandfather should have.'",
  },
  crossing: {
    name: "Quanah",
    title: "Comanche Horseman",
    region: "Indian Territory",
    flavor: "A Comanche rider appears on a ridge overlooking the trail. He watches your herd with the expression of a man who has seen a thousand drives cross his land. He rides down slowly. 'Your cattle eat our grass. Your boots press our soil. The least you can do is answer one question correctly.'",
  },
  plains: {
    name: "Bass Reeves",
    title: "Deputy Marshal",
    region: "Kansas Plains",
    flavor: "A tall man with a badge and a Winchester rides up from the east. He's one of the most feared lawmen on the plains and he's seen every kind of trouble a cattle drive can bring. He holsters his rifle. 'I don't shoot men who know their history. Let's see if you're educated or just dusty.'",
  },
  railhead: {
    name: "Joseph McCoy",
    title: "Cattle Buyer",
    region: "Abilene",
    flavor: "A man in a clean suit and a brand-new hat intercepts you outside Abilene. He built this entire railhead town just to buy your cattle. He pulls out a ledger and looks at you over his spectacles. 'I'll give you a premium if you can prove you understand the business you're in.'",
  },
};

// ═══════════════════════════════════════════════════════════════
// QUESTION BANK — 7th Grade Texas History TEKS
// Ranching, Cattle Industry, Cattle Trails, & Related Topics
// ═══════════════════════════════════════════════════════════════

const QUESTIONS: TriviaQuestion[] = [
  // ── SOUTH REGION (Texas origins, vaquero heritage, longhorns) ──
  {
    id: "ct01", region: "south", difficulty: 1,
    question: "Where did the tradition of cattle ranching in Texas originally come from?",
    choices: [
      "English colonists brought it from Britain",
      "Spanish and Mexican vaqueros established it centuries before Anglo settlers arrived",
      "It was invented by the Republic of Texas in 1836",
      "American cowboys learned it from French fur traders",
    ],
    correctIndex: 1,
    explanation: "Cattle ranching in Texas has deep Spanish and Mexican roots. Vaqueros — the original cowboys — developed the techniques, vocabulary, and equipment (lasso, chaps, rodeo) that Anglo-American cowboys later adopted. Words like 'lariat,' 'bronco,' 'corral,' and 'ranch' all come from Spanish. The Texas cattle industry was built on a Mexican foundation.",
  },
  {
    id: "ct02", region: "south", difficulty: 1,
    question: "What breed of cattle dominated the Texas cattle drives of the 1860s–1880s?",
    choices: [
      "Angus",
      "Hereford",
      "Texas Longhorn",
      "Holstein",
    ],
    correctIndex: 2,
    explanation: "The Texas Longhorn was the backbone of the cattle drive era. Descended from Spanish cattle brought to the Americas in the 1500s, Longhorns were tough, drought-resistant, and could survive the 800-mile drive to Kansas on grass alone. They weren't the best beef cattle, but they were nearly indestructible — exactly what you need for an 800-mile walk.",
  },
  {
    id: "ct03", region: "south", difficulty: 2,
    question: "Why did Texas cattle drives to northern railheads begin after the Civil War?",
    choices: [
      "Texas had millions of cattle but no local railroads to ship them to eastern markets",
      "The U.S. government ordered all cattle moved north",
      "Texas banned cattle ranching after 1865",
      "Northern states had no cattle of their own",
    ],
    correctIndex: 0,
    explanation: "After the Civil War, Texas was economically devastated but had an estimated 5 million longhorns roaming free. A steer worth $4 in Texas could sell for $40 in northern markets — but Texas had no railroads connecting to the East. The solution: walk the cattle 800 miles north to Kansas railheads. The massive price difference created one of the most iconic industries in American history.",
  },
  {
    id: "ct04", region: "south", difficulty: 2,
    question: "What was a 'maverick' in the context of Texas ranching?",
    choices: [
      "A type of saddle used by vaqueros",
      "An unbranded calf or steer with no identified owner",
      "A cattle rustler who stole from other ranches",
      "The lead steer of a cattle drive",
    ],
    correctIndex: 1,
    explanation: "The term comes from Samuel Maverick, a Texas rancher who famously didn't brand his cattle. Any unbranded animal became known as a 'maverick.' On the open range, mavericks were fair game — whoever branded them first owned them. This is why the word 'maverick' eventually came to mean an independent, unorthodox person. Texas literally invented that word.",
  },
  {
    id: "ct05", region: "south", difficulty: 1,
    question: "What role did brands play in the Texas cattle industry?",
    choices: [
      "They were purely decorative",
      "They identified which rancher owned each animal — the original property registry",
      "They were used to track a cow's age",
      "Only the government was allowed to brand cattle",
    ],
    correctIndex: 1,
    explanation: "Brands were the legal proof of ownership on the open range, where thousands of cattle from different ranches grazed together. Each ranch registered a unique brand with the county. Reading brands became a specialized skill — experienced cowboys could identify dozens of ranches by their marks. Brand law is still active in Texas today.",
  },
  {
    id: "ct06", region: "south", difficulty: 2,
    question: "Approximately what percentage of cowboys on the Chisholm Trail were Black or Mexican?",
    choices: [
      "Less than 1%",
      "About 5%",
      "Roughly 25% or more",
      "Over 75%",
    ],
    correctIndex: 2,
    explanation: "Historical records show that roughly one in four cowboys was either Black or Mexican. Many Black cowboys were formerly enslaved men who learned cattle work on Texas ranches. Famous Black cowboys include Bose Ikard (Charles Goodnight's most trusted hand) and Bill Pickett (who invented bulldogging). The Hollywood image of an all-white cowboy crew is historically inaccurate.",
  },

  // ── CROSSING REGION (rivers, Indian Territory, trail logistics) ──
  {
    id: "ct07", region: "crossing", difficulty: 1,
    question: "Who was Jesse Chisholm, the man the trail was named after?",
    choices: [
      "A Texas cattle rancher who drove the first herd north",
      "A trader of Cherokee and Scottish descent who blazed a wagon trail through Indian Territory",
      "The mayor of Abilene, Kansas",
      "A U.S. Army general who mapped the route",
    ],
    correctIndex: 1,
    explanation: "Jesse Chisholm was a trader of Cherokee and Scottish heritage who created a wagon trail from his trading post near Wichita, Kansas down into Indian Territory. He never drove cattle — he traded goods. Texas drovers later used his trail as a route north, and the name stuck. The man the trail is named after was Native American, not a cowboy.",
  },
  {
    id: "ct08", region: "crossing", difficulty: 2,
    question: "What was the biggest danger at river crossings during a cattle drive?",
    choices: [
      "Alligators attacking the herd",
      "Cattle panicking in deep water, drowning, or causing a deadly pileup",
      "Bridges collapsing under the weight",
      "Quicksand that only affected horses",
    ],
    correctIndex: 1,
    explanation: "River crossings were the most lethal part of any cattle drive. Longhorns could swim, but in fast current or deep water they panicked, piled up, and drowned. Cowboys had to swim their horses alongside the herd to keep them moving. The Red River crossing alone killed more cowboys and cattle than any other single hazard on the trail.",
  },
  {
    id: "ct09", region: "crossing", difficulty: 1,
    question: "When cattle drives crossed Indian Territory, tribes often charged a toll. Why was this legal?",
    choices: [
      "It wasn't legal — drovers had no choice but to pay",
      "Treaties gave Native Nations sovereignty over their land, including the right to charge for passage",
      "The U.S. government set the toll prices",
      "Cowboys voluntarily donated money to the tribes",
    ],
    correctIndex: 1,
    explanation: "Indian Territory (modern Oklahoma) was sovereign land belonging to Native Nations including the Cherokee, Chickasaw, Choctaw, Creek, and Seminole. Treaties with the U.S. government gave them the legal right to control passage through their territory. The typical toll was about ten cents per head. Smart trail bosses paid it — the alternative was losing far more cattle trying to go around.",
  },
  {
    id: "ct10", region: "crossing", difficulty: 2,
    question: "What was 'Texas fever' (also called 'Spanish fever'), and why did it cause conflict?",
    choices: [
      "A disease that killed cowboys in the summer heat",
      "A tick-borne cattle disease that Texas longhorns carried without symptoms but that killed northern cattle",
      "A type of prairie fire that spread along the trail",
      "Homesickness that caused cowboys to quit mid-drive",
    ],
    correctIndex: 1,
    explanation: "Texas Longhorns carried a tick-borne parasite (Babesia) that didn't affect them but was deadly to northern cattle breeds. When Texas herds passed through, local cattle died. This led Missouri and Kansas to pass quarantine laws banning Texas cattle from settled areas — which is exactly why the Chisholm Trail had to route through unsettled territory. Biology shaped the economics of the entire industry.",
  },
  {
    id: "ct11", region: "crossing", difficulty: 3,
    question: "How did cattle drives affect the Native American nations whose territory they crossed?",
    choices: [
      "They had no impact whatsoever",
      "Drives brought income through tolls but also depleted grazing land and spread disease to tribal herds",
      "Native Americans refused to allow any cattle through their territory",
      "Cattle drives only crossed government-owned land",
    ],
    correctIndex: 1,
    explanation: "The impact was complex. Tolls provided income, and some tribal members traded with passing drovers. But millions of cattle trampling through depleted grass that tribal herds needed, and Texas fever killed Native-owned cattle. The drives also attracted railroads and settlers, accelerating the loss of Native lands. Economic benefit in the short term, territorial loss in the long term — a pattern repeated across American expansion.",
  },
  {
    id: "ct12", region: "crossing", difficulty: 1,
    question: "What was a stampede, and what usually caused one?",
    choices: [
      "A planned movement of cattle at high speed",
      "A panicked mass flight of cattle triggered by sudden noise, lightning, or unfamiliar smells",
      "A celebration held when the herd reached water",
      "A type of horse race between cowboys",
    ],
    correctIndex: 1,
    explanation: "A stampede was every trail boss's nightmare — 2,000+ longhorns running blind in the dark. Lightning, a snapping branch, a coyote, or even a cowboy sneezing could trigger one. Cowboys had to ride to the front and turn the leaders into a circle, often at full gallop in pitch darkness. More cowboys died from stampedes than from any other hazard on the trail.",
  },

  // ── PLAINS REGION (trail life, economics, key figures) ──
  {
    id: "ct13", region: "plains", difficulty: 1,
    question: "Charles Goodnight is considered one of the most important figures in Texas ranching because he:",
    choices: [
      "Invented barbed wire",
      "Co-developed the Goodnight-Loving Trail and invented the chuck wagon",
      "Was the first governor of Texas",
      "Discovered oil on his ranch",
    ],
    correctIndex: 1,
    explanation: "Charles Goodnight blazed the Goodnight-Loving Trail from Texas to Colorado and invented the chuck wagon by converting an old Army wagon into a mobile kitchen. The chuck wagon was as important to the cattle drive as the cattle themselves — it fed the crew, carried supplies, and served as the social center of camp. Goodnight also helped save the American bison from extinction.",
  },
  {
    id: "ct14", region: "plains", difficulty: 2,
    question: "What was the 'chuck wagon' and why was it essential to a cattle drive?",
    choices: [
      "A wagon that carried extra cattle",
      "The mobile kitchen and supply center that fed the entire crew for months on the trail",
      "A wagon used exclusively for carrying guns",
      "A temporary bank that held the cowboys' wages",
    ],
    correctIndex: 1,
    explanation: "The chuck wagon was the heart of the cattle drive. Invented by Charles Goodnight in 1866, it carried food, water, cooking equipment, medical supplies, and bedrolls. The cook (called 'Cookie') was often the second most important person after the trail boss. Cowboys who disrespected the cook didn't eat. On a two-month drive through empty prairie, that wagon was the only thing between the crew and starvation.",
  },
  {
    id: "ct15", region: "plains", difficulty: 2,
    question: "Richard King founded the King Ranch in South Texas. Why is it historically significant?",
    choices: [
      "It was the first ranch to use tractors",
      "It became one of the largest ranches in the world and pioneered modern ranching practices",
      "It was the only ranch that hired women",
      "It was the first ranch in North America",
    ],
    correctIndex: 1,
    explanation: "The King Ranch, founded in 1853, grew to over 825,000 acres — larger than the state of Rhode Island. Richard King pioneered practices like selective breeding, land management, and hiring entire Mexican villages as permanent ranch hands (called Kineños). The King Ranch helped transform ranching from open-range chaos into a managed, scientific industry. It still operates today.",
  },
  {
    id: "ct16", region: "plains", difficulty: 1,
    question: "A typical Chisholm Trail drive from Texas to Kansas covered about how many miles?",
    choices: [
      "About 100 miles",
      "About 400 miles",
      "About 800 miles",
      "Over 2,000 miles",
    ],
    correctIndex: 2,
    explanation: "The Chisholm Trail ran roughly 800 miles from San Antonio, Texas to Abilene, Kansas. A herd averaging 10–15 miles per day would take about two months to make the journey. That's two months of river crossings, stampedes, storms, and thirst — all to get cattle to a railroad that could ship them east. The entire American beef industry was built on cowboys walking cattle 800 miles.",
  },
  {
    id: "ct17", region: "plains", difficulty: 3,
    question: "How did the expansion of railroads into Texas eventually end the era of the great cattle drives?",
    choices: [
      "Railroads made cattle illegal to transport",
      "When railroads reached Texas, cattle could be shipped locally instead of walked hundreds of miles north",
      "Cowboys refused to work near trains",
      "The government banned cattle drives to protect railroad tracks",
    ],
    correctIndex: 1,
    explanation: "The cattle drive existed because of a gap: cattle were in Texas, railroads were in Kansas. As railroad companies like the Texas and Pacific extended track into Texas in the 1870s–1880s, ranchers could ship cattle from local depots instead of driving them 800 miles. By 1890, the long drive was essentially dead — killed by the very railroads it was designed to reach. Technology solved the problem it created.",
  },
  {
    id: "ct18", region: "plains", difficulty: 2,
    question: "What was the 'open range,' and why did it matter for the cattle industry?",
    choices: [
      "A type of cooking stove used on the trail",
      "Unfenced public land where any rancher's cattle could graze freely",
      "A military training ground in Kansas",
      "A brand name for Texas beef",
    ],
    correctIndex: 1,
    explanation: "Before barbed wire, the Texas prairie was unfenced — 'open range' where cattle from multiple ranches grazed together. Twice a year, ranchers held roundups to sort cattle by brand. The open range made the cattle industry possible but also made it chaotic. When barbed wire arrived in the 1870s, it ended the open range, caused 'fence-cutting wars,' and transformed ranching from a frontier free-for-all into a modern fenced operation.",
  },

  // ── RAILHEAD REGION (Abilene, economics, end of era) ──
  {
    id: "ct19", region: "railhead", difficulty: 1,
    question: "Why was Abilene, Kansas chosen as the destination for the Chisholm Trail?",
    choices: [
      "It was the capital of Kansas",
      "Joseph McCoy built stockyards there connected to the Kansas Pacific Railway",
      "It had the best grass in Kansas",
      "It was the closest town to Texas",
    ],
    correctIndex: 1,
    explanation: "Illinois livestock dealer Joseph G. McCoy chose Abilene because it sat on the Kansas Pacific Railway and was far enough west to avoid Kansas quarantine laws against Texas cattle. He built stockyards, a hotel, and shipping facilities. In its first year (1867), Abilene shipped 35,000 head east. McCoy essentially invented the cattle town — he saw a gap in the market and built the infrastructure to fill it.",
  },
  {
    id: "ct20", region: "railhead", difficulty: 2,
    question: "A steer worth $4 in Texas could sell for $40 in Abilene. This price difference existed because:",
    choices: [
      "Kansas had a law requiring high cattle prices",
      "Texas had a massive oversupply while eastern cities had huge demand and no local cattle",
      "The U.S. government subsidized Kansas cattle buyers",
      "Texas cattle were a different species than Kansas cattle",
    ],
    correctIndex: 1,
    explanation: "This is supply and demand at its rawest. Texas had 5 million cattle and no way to ship them. Eastern cities had millions of hungry people and no cattle. The 800-mile gap between supply and demand created a 10x price multiplier. The entire cattle drive industry existed to exploit that gap. When railroads finally eliminated the distance, the price difference — and the drives — disappeared.",
  },
  {
    id: "ct21", region: "railhead", difficulty: 2,
    question: "What was the role of 'cow towns' like Abilene, Dodge City, and Wichita?",
    choices: [
      "They were permanent ranching communities",
      "They were railroad shipping points where cattle were loaded onto trains and cowboys spent their wages",
      "They were military forts along the trail",
      "They were farming communities that opposed the cattle trade",
    ],
    correctIndex: 1,
    explanation: "Cow towns were economic engines built around one purpose: transferring cattle from trail to train. They had stockyards, hotels, saloons, supply stores, and banks. Cowboys who'd been eating dust for two months spent their wages fast. These towns boomed and busted — Abilene's cattle trade lasted only about four years before the railroad moved west and Dodge City took over. The cow town followed the railroad.",
  },
  {
    id: "ct22", region: "railhead", difficulty: 1,
    question: "What invention helped end the open range and change ranching forever in the 1870s–1880s?",
    choices: [
      "The telegraph",
      "Barbed wire",
      "The steam engine",
      "Dynamite",
    ],
    correctIndex: 1,
    explanation: "Barbed wire, patented by Joseph Glidden in 1874, was cheap, effective fencing that could control cattle on the vast prairie. It ended the open range, made cattle drives unnecessary (you could keep cattle on your own land), and caused violent 'fence-cutting wars' between big ranchers and small farmers. A simple piece of twisted wire fundamentally restructured the entire Texas economy.",
  },
  {
    id: "ct23", region: "south", difficulty: 3,
    question: "How did the cattle industry change the demographics and economy of post-Civil War Texas?",
    choices: [
      "It had no significant economic impact",
      "It provided economic recovery, created jobs across racial lines, and connected Texas to national markets",
      "It only benefited plantation owners",
      "It caused Texas to become an industrial state immediately",
    ],
    correctIndex: 1,
    explanation: "After the Civil War, Texas's cotton economy was shattered. The cattle industry provided an alternative path to economic recovery. It employed formerly enslaved people, Mexican vaqueros, and Anglo settlers alike. Cattle money built towns, funded railroads, and connected Texas to national commerce. The cattle era bridged Texas from a defeated Confederate state to a participant in the national industrial economy.",
  },
  {
    id: "ct24", region: "crossing", difficulty: 2,
    question: "What was a 'remuda' on a cattle drive?",
    choices: [
      "The group of extra horses kept for the cowboys to rotate through",
      "A type of Mexican food served on the trail",
      "The name for the last cowboy in line",
      "A waterproof tent used during storms",
    ],
    correctIndex: 0,
    explanation: "The remuda (from the Spanish 'remudar,' to exchange) was the herd of spare horses — typically 6 to 10 per cowboy. A working cowboy might ride three or four different horses per day because cattle work exhausted them. The wrangler managed the remuda. Like 'lasso,' 'corral,' and 'ranch,' the word 'remuda' reflects the Spanish and Mexican origins of American cowboy culture.",
  },
  {
    id: "ct25", region: "plains", difficulty: 3,
    question: "The 'Great Die-Up' of 1886–1887 devastated the cattle industry. What caused it?",
    choices: [
      "A massive disease outbreak",
      "A catastrophic winter following a drought-weakened summer killed an estimated 90% of cattle on the northern plains",
      "The U.S. government confiscated all cattle",
      "A volcanic eruption blocked sunlight for a year",
    ],
    correctIndex: 1,
    explanation: "The summer of 1886 brought severe drought, leaving cattle thin and weak. Then one of the worst winters in recorded history hit the plains — blizzards, temperatures to -40°F, and ice that sealed off grass. Up to 90% of cattle on the northern ranges died. The disaster proved that open-range ranching was unsustainable and accelerated the shift to fenced, managed ranching. Nature ended the cowboy era more decisively than any law could.",
  },
];

// ═══════════════════════════════════════════════════════════════
// REWARD GENERATION — Streaks compound, jackpots are telegraphed
// ═══════════════════════════════════════════════════════════════

interface TriviaReward {
  type: "cash" | "supplies" | "shortcut" | "knowledge" | "jackpot";
  label: string;
  effects: Record<string, number>;
  isJackpot: boolean;
}

function getStreakMultiplier(streak: number): number {
  if (streak <= 1) return 1;
  if (streak === 2) return 1.5;
  if (streak === 3) return 2;
  if (streak === 4) return 2.5;
  return 3;
}

function getStreakLabel(streak: number): string {
  if (streak <= 1) return "";
  if (streak === 2) return "📈 2-STREAK — 1.5x REWARDS";
  if (streak === 3) return "🔥 3-STREAK — DOUBLE REWARDS";
  if (streak === 4) return "⚡ 4-STREAK — 2.5x REWARDS";
  return "👑 " + streak + "-STREAK — TRIPLE REWARDS";
}

function randomReward(streak: number, difficulty: number): TriviaReward {
  const mult = getStreakMultiplier(streak);

  const jackpotChance = 0.15 + (Math.max(0, streak - 1) * 0.05) + (difficulty === 3 ? 0.05 : 0);

  if (Math.random() < jackpotChance) {
    const jackpotRoll = Math.random();
    if (jackpotRoll < 0.35) {
      const herd = Math.round(25 * mult);
      return { type: "jackpot", isJackpot: true, label: "The sage points to a hidden box canyon full of unbranded longhorns. Free cattle, no questions asked.", effects: { herd, morale: 10 } };
    } else if (jackpotRoll < 0.65) {
      const dist = Math.round(60 * mult);
      return { type: "jackpot", isJackpot: true, label: "The sage reveals a shortcut — a pass through the hills that cuts days off the drive.", effects: { shortcut: dist } };
    } else {
      const supplies = Math.round(12 * mult);
      const herd = Math.round(10 * mult);
      return { type: "jackpot", isJackpot: true, label: "The sage leads you to an abandoned homestead with a stocked root cellar and a corral of stray cattle.", effects: { supplies, herd, morale: 15, horses: Math.round(3 * mult) } };
    }
  }

  const roll = Math.random();
  if (roll < 0.3) {
    const herd = Math.round(8 * mult);
    const morale = Math.round(5 * mult);
    return { type: "cash", isJackpot: false, label: "The sage points out stray cattle grazing in a nearby draw.", effects: { herd, morale } };
  } else if (roll < 0.55) {
    const supplies = Math.round(8 * mult);
    const morale = Math.round(5 * mult);
    return { type: "supplies", isJackpot: false, label: "The sage shares provisions from a hidden cache known only to old-timers.", effects: { supplies, morale } };
  } else if (roll < 0.8) {
    const hk = Math.round(6 * mult);
    const morale = Math.round(5 * mult);
    return { type: "knowledge", isJackpot: false, label: "The sage shares hard-won wisdom that lifts the crew's spirits and understanding.", effects: { historicalKnowledge: hk, morale } };
  } else {
    const dist = Math.round(40 * mult);
    return { type: "shortcut", isJackpot: false, label: "The sage shows you a cattle ford that saves a full day's drive.", effects: { shortcut: dist } };
  }
}

// ═══════════════════════════════════════════════════════════════
// PICK A QUESTION FOR A REGION
// ═══════════════════════════════════════════════════════════════

export function pickTriviaQuestion(progress: number, usedIds: Set<string>): TriviaQuestion | null {
  const region = progress < 25 ? "south" : progress < 50 ? "crossing" : progress < 75 ? "plains" : "railhead";
  const pool = QUESTIONS.filter(q => q.region === region && !usedIds.has(q.id));
  const finalPool = pool.length > 0 ? pool : QUESTIONS.filter(q => !usedIds.has(q.id));
  if (finalPool.length === 0) return null;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

export function getSageForProgress(progress: number): Sage {
  if (progress < 25) return SAGES.south;
  if (progress < 50) return SAGES.crossing;
  if (progress < 75) return SAGES.plains;
  return SAGES.railhead;
}

// ═══════════════════════════════════════════════════════════════
// TRIVIA UI COMPONENT
// ═══════════════════════════════════════════════════════════════

interface TriviaEngineProps {
  question: TriviaQuestion;
  progress: number;
  streak: number;
  onComplete: (correct: boolean, effects: Record<string, number>) => void;
}

export default function ChisholmTriviaEngine({ question, progress, streak, onComplete }: TriviaEngineProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const sage = getSageForProgress(progress);
  const isCorrect = selected === question.correctIndex;
  const [reward] = useState(() => randomReward(streak, question.difficulty));
  const streakLabel = getStreakLabel(streak);
  const isJackpotAvailable = reward.isJackpot;

  const handleSelect = (idx: number) => {
    if (revealed) return;
    setSelected(idx);
    setRevealed(true);
  };

  const handleDismiss = () => {
    if (isCorrect) {
      onComplete(true, reward.effects);
    } else {
      onComplete(false, {});
    }
  };

  const borderClass = isJackpotAvailable
    ? "border-2 border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.3)]"
    : "border-2 border-amber-700";

  return (
    <div className={`${borderClass} rounded bg-stone-800 overflow-hidden shadow-lg`}>
      <div className={`px-3 py-2 border-b ${isJackpotAvailable ? "bg-gradient-to-r from-yellow-900/60 via-amber-800/40 to-yellow-900/60 border-yellow-700/50" : "bg-gradient-to-r from-amber-900/60 to-stone-800 border-amber-800/50"}`}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{isJackpotAvailable ? "✨" : "🤠"}</span>
          <div className="flex-1">
            <span className={`font-bold text-sm ${isJackpotAvailable ? "text-yellow-300" : "text-amber-300"}`}>{sage.name}</span>
            <span className="text-stone-500 text-xs ml-2">— {sage.title}</span>
          </div>
        </div>
        {streak >= 2 && (
          <div className="mt-1 text-center">
            <span className="text-xs font-bold tracking-wider text-amber-400">{streakLabel}</span>
          </div>
        )}
      </div>

      <div className="p-3 space-y-3">
        {isJackpotAvailable && (
          <div className="bg-yellow-900/20 border border-yellow-700/40 rounded p-2 text-center animate-pulse">
            <p className="text-xs text-yellow-300 font-bold">⚡ The old-timer's eyes gleam. Something valuable rides on this answer. ⚡</p>
          </div>
        )}

        <p className="text-stone-400 text-xs leading-relaxed italic">{sage.flavor}</p>

        <div className="bg-stone-900/60 border border-stone-700 rounded p-2.5">
          <p className="text-stone-200 text-sm font-bold leading-relaxed">"{question.question}"</p>
        </div>

        <div className="space-y-1.5">
          {question.choices.map((choice, i) => {
            let style = "bg-stone-700 hover:bg-stone-600 border-stone-600 text-stone-200";
            if (revealed) {
              if (i === question.correctIndex) {
                style = "bg-emerald-900/60 border-emerald-500 text-emerald-200";
              } else if (i === selected && !isCorrect) {
                style = "bg-red-900/40 border-red-700 text-red-300";
              } else {
                style = "bg-stone-800 border-stone-700 text-stone-500";
              }
            }
            return (
              <button
                key={i}
                onClick={() => handleSelect(i)}
                disabled={revealed}
                className={`w-full text-left p-2 rounded text-xs font-bold transition-colors border ${style} ${!revealed ? "cursor-pointer" : "cursor-default"}`}
              >
                <span className="text-stone-500 mr-1.5">{["A", "B", "C", "D"][i]}.</span> {choice}
              </button>
            );
          })}
        </div>

        {revealed && (
          <div className="space-y-2 animate-fadeIn">
            {isCorrect ? (
              <div className={`rounded p-2 text-center font-bold text-sm ${reward.isJackpot ? "bg-yellow-900/40 text-yellow-300 border border-yellow-600" : "bg-emerald-900/40 text-emerald-300 border border-emerald-700"}`}>
                {reward.isJackpot ? "🏆 CORRECT — LEGENDARY REWARD!" : "✓ Correct! The old-timer tips his hat."}
              </div>
            ) : (
              <div className="rounded p-2 text-center font-bold text-sm bg-amber-900/30 text-amber-300 border border-amber-700">
                ✗ Not quite — but the sage nods and explains.
                {streak >= 2 && <span className="block text-xs text-amber-500 mt-0.5">Streak broken.</span>}
              </div>
            )}

            <div className="bg-stone-900/60 border border-stone-600 rounded p-2.5">
              <p className="text-xs text-stone-400 leading-relaxed">
                <span className="text-amber-400 font-bold">📜 TEKS: </span>
                {question.explanation}
              </p>
            </div>

            {isCorrect && (
              <div className={`rounded p-2.5 text-center ${reward.isJackpot ? "bg-yellow-900/30 border border-yellow-700" : "bg-emerald-900/30 border border-emerald-800"}`}>
                <p className={`text-xs font-bold ${reward.isJackpot ? "text-yellow-300" : "text-emerald-300"}`}>{reward.label}</p>
                <p className={`text-sm font-bold mt-1 ${reward.isJackpot ? "text-yellow-400" : "text-emerald-400"}`}>
                  {Object.entries(reward.effects).map(([k, v]) =>
                    k === "shortcut" ? `+${v} miles` : k === "historicalKnowledge" ? `+${v} knowledge` : `+${v} ${k}`
                  ).join(" · ")}
                </p>
                {streak >= 1 && getStreakMultiplier(streak) > 1 && (
                  <p className="text-xs text-amber-500 mt-1">({getStreakMultiplier(streak)}x streak reward added)</p>
                )}
              </div>
            )}

            <button
              onClick={handleDismiss}
              className={`w-full py-2 rounded text-sm font-bold transition-colors ${reward.isJackpot && isCorrect ? "bg-yellow-700 hover:bg-yellow-600 text-yellow-100" : "bg-amber-800 hover:bg-amber-700 text-amber-100"}`}
            >
              {isCorrect ? "Collect Reward & Continue" : "Thank the Sage & Continue"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
