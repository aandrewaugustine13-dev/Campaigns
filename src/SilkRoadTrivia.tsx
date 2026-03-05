import { useState } from "react";

// ═══════════════════════════════════════════════════════════════
// SILK ROAD TRIVIA — Regional sages, TEKS-aligned questions
// Cultural diffusion & multiculturalism (6th grade Social Studies)
// ═══════════════════════════════════════════════════════════════

export interface TriviaQuestion {
  id: string;
  region: "desert" | "mountain" | "central" | "western";
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  difficulty: 1 | 2 | 3;
}

// Regional sage characters
interface Sage {
  name: string;
  title: string;
  region: string;
  flavor: string;
}

const SAGES: Record<string, Sage> = {
  desert: {
    name: "Zhang Qian",
    title: "Imperial Envoy",
    region: "Gansu Corridor",
    flavor: "A weathered traveler blocks your path. He carries scrolls instead of weapons. He offers a challenge: answer his question, and he will share a useful lesson.",
  },
  mountain: {
    name: "Ashoka's Pilgrim",
    title: "Wandering Monk",
    region: "Pamir Mountains",
    flavor: "A Buddhist monk sits cross-legged on a freezing rock, seemingly unbothered by the altitude. He smiles at your wheezing crew and offers a trade: wisdom for wisdom. Answer correctly, and he'll show you a shortcut only pilgrims know.",
  },
  central: {
    name: "Rostam the Scribe",
    title: "Sogdian Scholar",
    region: "Samarkand",
    flavor: "A Sogdian scholar in an ink-stained robe greets you in the bazaar. He records stories of each caravan that passes. Answer one question, and your journey will be written in his history.",
  },
  western: {
    name: "Theodora",
    title: "Roman Historian",
    region: "Anatolia",
    flavor: "A Greek-speaking scholar stops your caravan at a crossroads. She records trade goods for the Roman Senate. Show that you understand your cargo, and she will help your caravan pass customs quickly.",
  },
};

// ═══════════════════════════════════════════════════════════════
// QUESTION BANK — TEKS Cultural Diffusion & Multiculturalism
// ═══════════════════════════════════════════════════════════════

const QUESTIONS: TriviaQuestion[] = [
  // ── DESERT REGION (early journey, China/Central Asia) ──
  {
    id: "t01", region: "desert", difficulty: 1,
    question: "What is 'cultural diffusion'?",
    choices: [
      "When a culture disappears completely",
      "The spread of ideas, customs, and technologies between cultures",
      "When one culture conquers another by force",
      "A type of ancient trade agreement",
    ],
    correctIndex: 1,
    explanation: "Cultural diffusion is the spread of ideas, customs, and technologies from one culture to another — often through trade, migration, or conquest. The Silk Road was one of history's greatest engines of cultural diffusion. Silk went west, glass went east, and ideas went everywhere.",
  },
  {
    id: "t02", region: "desert", difficulty: 1,
    question: "Which of these inventions spread FROM China to the rest of the world along trade routes?",
    choices: [
      "The Roman aqueduct",
      "Paper and the compass",
      "Greek democracy",
      "The Egyptian plow",
    ],
    correctIndex: 1,
    explanation: "Paper, the compass, gunpowder, and printing all originated in China and spread westward through trade networks like the Silk Road. Paper alone revolutionized record-keeping across every civilization it reached. It took centuries to travel the full distance — ideas move at the speed of camels.",
  },
  {
    id: "t03", region: "desert", difficulty: 2,
    question: "Why did the Han Dynasty originally send envoys west along what became the Silk Road?",
    choices: [
      "To sell silk to Rome",
      "To find military allies against the Xiongnu",
      "To spread Buddhism",
      "To map the ocean",
    ],
    correctIndex: 1,
    explanation: "Emperor Wu sent Zhang Qian west around 130 BCE to find allies against the Xiongnu nomads threatening China's northern border. He failed at diplomacy but discovered an entire network of civilizations willing to trade. The Silk Road started as a failed military mission that accidentally created the world's greatest trade network.",
  },
  {
    id: "t04", region: "desert", difficulty: 2,
    question: "How did the Silk Road get its name?",
    choices: [
      "Ancient merchants called it that at the time",
      "A 19th-century German geographer named it",
      "It was named by Marco Polo in his journals",
      "Chinese emperors officially declared the name",
    ],
    correctIndex: 1,
    explanation: "The term 'Silk Road' was coined by German geographer Ferdinand von Richthofen in 1877 — almost 2,000 years after the routes were established. The merchants who actually used these paths never called them that. They probably just called it 'the road that might kill us.'",
  },
  {
    id: "t05", region: "desert", difficulty: 1,
    question: "Silk was so valuable in the ancient world because:",
    choices: [
      "It was the only fabric that existed",
      "China kept the production method secret for centuries",
      "It was made from gold thread",
      "Roman law required citizens to wear it",
    ],
    correctIndex: 1,
    explanation: "China guarded the secret of silk production (sericulture) for thousands of years. Smuggling silkworm eggs out of China was punishable by death. This monopoly is what made silk worth its weight in gold on the other end of the trade route — a perfect example of how controlling knowledge creates economic power.",
  },
  {
    id: "t06", region: "desert", difficulty: 2,
    question: "What role did the Sogdian people play on the Silk Road?",
    choices: [
      "They were the main military power controlling the routes",
      "They served as the primary merchant middlemen and translators",
      "They invented silk weaving",
      "They blocked all trade between East and West",
    ],
    correctIndex: 1,
    explanation: "The Sogdians, based in Central Asia around modern Uzbekistan, were the ultimate middlemen of the Silk Road. They spoke multiple languages, maintained trading posts across thousands of miles, and facilitated trade between cultures that couldn't communicate directly. They're a perfect example of how multiculturalism creates economic opportunity.",
  },

  // ── MOUNTAIN REGION (Pamirs, Buddhism, religious exchange) ──
  {
    id: "t07", region: "mountain", difficulty: 1,
    question: "Which major religion spread from India to China primarily through Silk Road trade routes?",
    choices: [
      "Christianity",
      "Islam",
      "Buddhism",
      "Zoroastrianism",
    ],
    correctIndex: 2,
    explanation: "Buddhism traveled from India to China along the Silk Road, carried by monks and merchants. It's one of history's best examples of cultural diffusion through trade — monks traveled with caravans for safety, and their ideas spread wherever the goods went. By 200 CE, Buddhism had transformed Chinese culture.",
  },
  {
    id: "t08", region: "mountain", difficulty: 2,
    question: "What happened when Buddhism reached China through the Silk Road?",
    choices: [
      "Chinese people adopted it exactly as it was practiced in India",
      "It was immediately banned by the emperor",
      "It blended with local beliefs like Daoism, creating unique Chinese forms",
      "It replaced all other Chinese religions completely",
    ],
    correctIndex: 2,
    explanation: "When Buddhism reached China, it blended with Daoist and Confucian ideas to create uniquely Chinese forms like Chan Buddhism (later Zen in Japan). This is called syncretism: when cultures blend rather than replace each other. It's what makes cultural diffusion creative rather than destructive.",
  },
  {
    id: "t09", region: "mountain", difficulty: 1,
    question: "The Silk Road didn't just move goods — it also spread:",
    choices: [
      "Only diseases",
      "Religions, languages, art styles, and technologies",
      "Only military strategies",
      "Only food recipes",
    ],
    correctIndex: 1,
    explanation: "Trade routes carry everything — not just goods. Religions, languages, artistic styles, mathematical concepts, agricultural techniques, and yes, diseases all traveled the Silk Road. When a Chinese merchant and a Persian trader haggled over silk prices, they were also exchanging worldviews. That's cultural diffusion in action.",
  },
  {
    id: "t10", region: "mountain", difficulty: 3,
    question: "The giant Buddha statues carved into cliffs at Bamiyan (Afghanistan) are evidence of:",
    choices: [
      "Roman military conquest of Central Asia",
      "Cultural diffusion of Buddhism along trade routes",
      "Chinese architectural influence in India",
      "Ancient tourism advertising",
    ],
    correctIndex: 1,
    explanation: "The Bamiyan Buddhas (destroyed by the Taliban in 2001) were carved around the 6th century CE in what is now Afghanistan — thousands of miles from Buddhism's birthplace in India. Their existence in Central Asia is direct physical evidence of how the Silk Road spread religion and art across vast distances.",
  },
  {
    id: "t11", region: "mountain", difficulty: 2,
    question: "What is 'syncretism' in the context of cultural exchange?",
    choices: [
      "When one culture completely destroys another",
      "When two or more cultural traditions blend together into something new",
      "When a culture refuses to interact with outsiders",
      "A type of ancient tax on imported goods",
    ],
    correctIndex: 1,
    explanation: "Syncretism is when cultural traditions mix and create something new — like Gandhara art, which fused Greek sculpture techniques with Buddhist subjects. You get Buddha statues wearing Greek-style robes. It happens naturally when cultures interact through trade, and it's one of the most creative outcomes of multiculturalism.",
  },

  // ── CENTRAL REGION (Samarkand, trade cities, economic exchange) ──
  {
    id: "t12", region: "central", difficulty: 1,
    question: "Cities like Samarkand became wealthy because they:",
    choices: [
      "Had large gold mines",
      "Were located at crossroads where multiple trade routes met",
      "Manufactured all the world's silk",
      "Were the capitals of the largest empires",
    ],
    correctIndex: 1,
    explanation: "Samarkand, Bukhara, and other 'oasis cities' got rich by being in the right place — at the crossroads of major trade routes. They taxed goods, housed merchants, provided banking services, and became incredibly multicultural. Location created wealth, and wealth attracted even more diverse cultures. It's a feedback loop.",
  },
  {
    id: "t13", region: "central", difficulty: 2,
    question: "What made the Silk Road a 'network' rather than a single road?",
    choices: [
      "It was built by a single emperor as one road",
      "Multiple routes branched around deserts, mountains, and political borders",
      "It only existed on water as a shipping lane",
      "It was a metaphor — no actual roads existed",
    ],
    correctIndex: 1,
    explanation: "The Silk Road was actually dozens of interconnected routes that shifted based on geography, weather, politics, and banditry. If one pass was snowed in, merchants took another. If a kingdom started charging too much tax, trade flowed around it. It was flexible, with many paths that changed over time.",
  },
  {
    id: "t14", region: "central", difficulty: 2,
    question: "How did the spread of Islam along trade routes differ from the spread of Buddhism?",
    choices: [
      "Islam never spread along trade routes",
      "Muslim merchants actively practiced and shared their faith in trade cities",
      "Buddhism spread faster because rulers forced it",
      "Islam only spread through military conquest, never trade",
    ],
    correctIndex: 1,
    explanation: "Muslim merchants were often active practitioners who built mosques in trade cities, married locally, and integrated their faith into daily commerce. Islamic banking practices and contract law became standard trade tools across the network. Both religions spread through trade — they just did it differently. Cultural diffusion has many mechanisms.",
  },
  {
    id: "t15", region: "central", difficulty: 1,
    question: "Which of these is an example of technology transfer along the Silk Road?",
    choices: [
      "Romans learning to make silk from the Chinese",
      "Chinese learning glassmaking techniques from the Romans",
      "Modern computers connecting the world",
      "Egyptians building the pyramids",
    ],
    correctIndex: 1,
    explanation: "China sent silk west; Rome sent glass east. Chinese craftsmen learned Roman glassblowing techniques, and eventually Western cultures cracked the secret of silk production. Technology transfer was bidirectional — both sides gained knowledge they didn't have before. That's the power of open trade networks.",
  },
  {
    id: "t16", region: "central", difficulty: 3,
    question: "The Black Death (bubonic plague) that killed millions in Europe likely traveled along:",
    choices: [
      "Roman roads only",
      "Silk Road trade routes from Central Asia",
      "Atlantic Ocean shipping lanes",
      "It originated in Europe",
    ],
    correctIndex: 1,
    explanation: "The plague bacteria likely traveled from Central Asia to Europe via Silk Road trade routes in the 1340s, carried by fleas on rats that traveled with merchant caravans. It's a grim reminder that trade routes spread everything — including disease. Cultural diffusion isn't always positive, and interconnection has real costs.",
  },

  // ── WESTERN REGION (Persia, Rome, Mediterranean exchange) ──
  {
    id: "t17", region: "western", difficulty: 1,
    question: "The Roman Empire's demand for silk was so extreme that:",
    choices: [
      "They successfully invaded China to get more",
      "Roman senators worried it was draining the empire's gold reserves",
      "They banned all foreign trade",
      "Romans invented synthetic silk",
    ],
    correctIndex: 1,
    explanation: "Roman senators including Pliny the Elder complained that Rome's appetite for silk was sending massive amounts of gold eastward, weakening the economy. This is one of history's first recorded trade deficit debates — and it shows how interconnected the ancient world already was. Sound familiar?",
  },
  {
    id: "t18", region: "western", difficulty: 2,
    question: "Gandhara art (found in modern Pakistan/Afghanistan) combined:",
    choices: [
      "Egyptian and Chinese styles",
      "Greek sculptural techniques with Buddhist religious subjects",
      "Roman architecture with Indian music",
      "Persian painting with Japanese calligraphy",
    ],
    correctIndex: 1,
    explanation: "After Alexander the Great's conquests brought Greek culture to Central Asia, local artists started depicting the Buddha using Greek sculptural techniques — realistic drapery, contrapposto poses, naturalistic faces. It's literally a fusion of two completely different civilizations meeting through conquest and trade. You can see Greek robes on an Indian religious figure.",
  },
  {
    id: "t19", region: "western", difficulty: 1,
    question: "What is multiculturalism in the context of Silk Road cities?",
    choices: [
      "When one culture forces others to assimilate",
      "Different cultures living together and exchanging ideas in shared spaces",
      "When a city only allows one ethnicity to trade",
      "A modern concept that didn't exist in ancient times",
    ],
    correctIndex: 1,
    explanation: "Silk Road cities like Samarkand, Baghdad, and Constantinople were intensely multicultural — you could hear a dozen languages in one bazaar. Different religions, cuisines, art forms, and technologies coexisted and cross-pollinated. Multiculturalism isn't a modern invention — it's been the natural result of trade for thousands of years.",
  },
  {
    id: "t20", region: "western", difficulty: 2,
    question: "How did Arabic numerals (0-9) reach Europe?",
    choices: [
      "Romans invented them",
      "They were carved into the Great Wall of China",
      "Indian mathematicians developed them, and they spread through Islamic trade networks to Europe",
      "European monks discovered them independently",
    ],
    correctIndex: 2,
    explanation: "The number system we use today was developed in India, adopted and refined by Islamic scholars (who added the concept of zero), and then transmitted to Europe through trade contacts in Spain and the Mediterranean. We call them 'Arabic' numerals, but they're really a product of Indian-Islamic-European cultural diffusion. The math in your phone exists because of ancient trade routes.",
  },
  {
    id: "t21", region: "western", difficulty: 3,
    question: "Why did most individual merchants NOT travel the entire Silk Road from China to Rome?",
    choices: [
      "It was illegal to cross certain borders",
      "Goods passed through chains of regional middlemen, each adding markup",
      "The road only existed in certain centuries",
      "Only government officials were allowed to travel long distances",
    ],
    correctIndex: 1,
    explanation: "Almost no single merchant made the full journey. Instead, goods passed through dozens of middlemen — a Chinese trader sold to a Sogdian, who sold to a Persian, who sold to a Roman. Each added their markup. By the time silk reached Rome at 100x the original price, it had funded entire economies along the way. The Silk Road was a relay race, not a marathon.",
  },
  {
    id: "t22", region: "desert", difficulty: 1,
    question: "What is an example of cultural diffusion you can see in your own life today?",
    choices: [
      "Eating pizza (Italian origin) in America",
      "Breathing air",
      "Walking to school",
      "Sleeping at night",
    ],
    correctIndex: 0,
    explanation: "Pizza, tacos, yoga, martial arts, Arabic numerals, the alphabet — your daily life is full of cultural diffusion. Every time you use an idea, food, word, or technology that originated in another culture, you're living proof that cultural exchange shapes civilization. The Silk Road started this process on a global scale.",
  },
  {
    id: "t23", region: "mountain", difficulty: 2,
    question: "Caravanserais (roadside inns) along the Silk Road helped cultural diffusion by:",
    choices: [
      "Keeping cultures completely separated",
      "Providing shared spaces where travelers from different cultures ate, slept, and traded together",
      "Only allowing one nationality at a time",
      "Banning all religious discussion",
    ],
    correctIndex: 1,
    explanation: "Caravanserais were the truck stops of the ancient world — fortified inns spaced a day's journey apart where merchants from completely different cultures shared meals, stories, and ideas. A Chinese silk trader might sleep next to an Indian spice merchant and a Persian horse dealer. These shared spaces were incubators for cultural exchange.",
  },
  {
    id: "t24", region: "central", difficulty: 3,
    question: "The concept of 'zero' as a number reached the Islamic world from India, then spread to Europe. This is an example of:",
    choices: [
      "Cultural isolation",
      "Relay diffusion — an idea passing through intermediary cultures",
      "Forced assimilation",
      "Cultural extinction",
    ],
    correctIndex: 1,
    explanation: "Relay diffusion is when an idea passes through multiple cultures on its way to a destination, often being modified at each stop. Indian mathematicians invented zero, Islamic scholars expanded it into algebra, and European thinkers used it to build modern science. Each culture added value. That's not just diffusion — it's collaborative innovation across centuries.",
  },
  {
    id: "t25", region: "western", difficulty: 1,
    question: "Which of these BEST describes the Silk Road's long-term impact?",
    choices: [
      "It only benefited China economically",
      "It connected distant civilizations, enabling the exchange of goods, ideas, religions, and technologies that shaped the modern world",
      "It was a minor trade route with no lasting effects",
      "It only existed for about 50 years",
    ],
    correctIndex: 1,
    explanation: "The Silk Road operated for over 1,500 years and fundamentally shaped human civilization. Buddhism, Islam, paper, gunpowder, the compass, mathematical concepts, agricultural techniques, artistic styles, and countless other innovations spread along these routes. The modern interconnected world is, in many ways, the Silk Road's legacy.",
  },
];

// ═══════════════════════════════════════════════════════════════
// REWARD GENERATION — Streaks compound, jackpots are telegraphed
// ═══════════════════════════════════════════════════════════════

interface TriviaReward {
  type: "silver" | "supplies" | "shortcut" | "cultural" | "jackpot";
  label: string;
  effects: Record<string, number>;
  isJackpot: boolean;
}

function getStreakMultiplier(streak: number): number {
  if (streak <= 1) return 1;
  if (streak === 2) return 1.5;
  if (streak === 3) return 2;
  if (streak === 4) return 2.5;
  return 3; // 5+ streak = 3x, absolute domination
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
  
  // Jackpot chance: 15% base, +5% per streak, +5% for difficulty 3
  const jackpotChance = 0.15 + (Math.max(0, streak - 1) * 0.05) + (difficulty === 3 ? 0.05 : 0);
  
  if (Math.random() < jackpotChance) {
    // JACKPOT — massive reward, scales with streak
    const jackpotRoll = Math.random();
    if (jackpotRoll < 0.35) {
      const silver = Math.round(120 * mult);
      return { type: "jackpot", isJackpot: true, label: "The sage opens a hidden vault carved into the rock. Inside: a merchant king's forgotten fortune.", effects: { silver } };
    } else if (jackpotRoll < 0.65) {
      const dist = Math.round(300 * mult);
      return { type: "jackpot", isJackpot: true, label: "The sage reveals an ancient shortcut — a passage through the mountains that cuts weeks off your journey.", effects: { shortcut: dist } };
    } else {
      const silver = Math.round(60 * mult);
      const water = Math.round(20 * mult);
      return { type: "jackpot", isJackpot: true, label: "The sage leads you to a hidden caravanserai stocked with supplies, silver, and fresh camels. Your crew erupts in cheers.", effects: { silver, water, morale: 15, camels: Math.round(3 * mult) } };
    }
  }
  
  // Standard rewards — bigger base than before, multiplied by streak
  const roll = Math.random();
  if (roll < 0.3) {
    const silver = Math.round(50 * mult);
    return { type: "silver", isJackpot: false, label: "The sage reveals a cache of silver hidden beneath a waystone.", effects: { silver } };
  } else if (roll < 0.55) {
    const water = Math.round(15 * mult);
    const morale = Math.round(8 * mult);
    return { type: "supplies", isJackpot: false, label: "The sage shares provisions from a secret oasis known only to scholars.", effects: { water, morale } };
  } else if (roll < 0.8) {
    const ce = Math.round(6 * mult);
    const morale = Math.round(5 * mult);
    return { type: "cultural", isJackpot: false, label: "The sage shares deep knowledge that transforms how your crew sees the world.", effects: { culturalExchange: ce, morale } };
  } else {
    const dist = Math.round(200 * mult);
    return { type: "shortcut", isJackpot: false, label: "The sage shows you a hidden pass that saves days of travel.", effects: { shortcut: dist } };
  }
}

// ═══════════════════════════════════════════════════════════════
// PICK A QUESTION FOR A REGION
// ═══════════════════════════════════════════════════════════════

export function pickTriviaQuestion(progress: number, usedIds: Set<string>): TriviaQuestion | null {
  const region = progress < 25 ? "desert" : progress < 50 ? "mountain" : progress < 75 ? "central" : "western";
  const pool = QUESTIONS.filter(q => q.region === region && !usedIds.has(q.id));
  // Fallback: if region pool exhausted, pull from any unused
  const finalPool = pool.length > 0 ? pool : QUESTIONS.filter(q => !usedIds.has(q.id));
  if (finalPool.length === 0) return null;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

export function getSageForProgress(progress: number): Sage {
  if (progress < 25) return SAGES.desert;
  if (progress < 50) return SAGES.mountain;
  if (progress < 75) return SAGES.central;
  return SAGES.western;
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

export default function TriviaEngine({ question, progress, streak, onComplete }: TriviaEngineProps) {
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

  // Jackpot visual class
  const borderClass = isJackpotAvailable 
    ? "border-2 border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.3)]" 
    : "border-2 border-amber-700";

  return (
    <div className={`${borderClass} rounded bg-stone-800 overflow-hidden shadow-lg`}>
      {/* Sage Header */}
      <div className={`px-3 py-2 border-b ${isJackpotAvailable ? "bg-gradient-to-r from-yellow-900/60 via-amber-800/40 to-yellow-900/60 border-yellow-700/50" : "bg-gradient-to-r from-amber-900/60 to-stone-800 border-amber-800/50"}`}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{isJackpotAvailable ? "✨" : "🧙"}</span>
          <div className="flex-1">
            <span className={`font-bold text-sm ${isJackpotAvailable ? "text-yellow-300" : "text-amber-300"}`}>{sage.name}</span>
            <span className="text-stone-500 text-xs ml-2">— {sage.title}</span>
          </div>
        </div>
        {/* Streak Banner */}
        {streak >= 2 && (
          <div className="mt-1 text-center">
            <span className="text-xs font-bold tracking-wider text-amber-400">{streakLabel}</span>
          </div>
        )}
      </div>

      <div className="p-3 space-y-3">
        {/* Jackpot Telegraph */}
        {isJackpotAvailable && (
          <div className="bg-yellow-900/20 border border-yellow-700/40 rounded p-2 text-center animate-pulse">
            <p className="text-xs text-yellow-300 font-bold">⚡ The sage's eyes glow with ancient knowledge. The stakes feel higher than usual. ⚡</p>
          </div>
        )}

        {/* Sage Flavor Text */}
        <p className="text-stone-400 text-xs leading-relaxed italic">{sage.flavor}</p>

        {/* Question */}
        <div className="bg-stone-900/60 border border-stone-700 rounded p-2.5">
          <p className="text-stone-200 text-sm font-bold leading-relaxed">"{question.question}"</p>
        </div>

        {/* Answer Choices */}
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

        {/* Result + Teaching Moment */}
        {revealed && (
          <div className="space-y-2 animate-fadeIn">
            {/* Correct/Incorrect Banner */}
            {isCorrect ? (
              <div className={`rounded p-2 text-center font-bold text-sm ${reward.isJackpot ? "bg-yellow-900/40 text-yellow-300 border border-yellow-600" : "bg-emerald-900/40 text-emerald-300 border border-emerald-700"}`}>
                {reward.isJackpot ? "🏆 CORRECT — LEGENDARY REWARD!" : "✓ Correct! The sage nods approvingly."}
              </div>
            ) : (
              <div className="rounded p-2 text-center font-bold text-sm bg-amber-900/30 text-amber-300 border border-amber-700">
                ✗ Not quite — but the sage smiles and explains.
                {streak >= 2 && <span className="block text-xs text-amber-500 mt-0.5">Streak broken.</span>}
              </div>
            )}

            {/* Teaching Moment (always shown) */}
            <div className="bg-stone-900/60 border border-stone-600 rounded p-2.5">
              <p className="text-xs text-stone-400 leading-relaxed">
                <span className="text-amber-400 font-bold">📜 </span>
                {question.explanation}
              </p>
            </div>

            {/* Reward (only on correct) */}
            {isCorrect && (
              <div className={`rounded p-2.5 text-center ${reward.isJackpot ? "bg-yellow-900/30 border border-yellow-700" : "bg-emerald-900/30 border border-emerald-800"}`}>
                <p className={`text-xs font-bold ${reward.isJackpot ? "text-yellow-300" : "text-emerald-300"}`}>{reward.label}</p>
                <p className={`text-sm font-bold mt-1 ${reward.isJackpot ? "text-yellow-400" : "text-emerald-400"}`}>
                  {Object.entries(reward.effects).map(([k, v]) => 
                    k === "shortcut" ? `+${v} miles` : k === "culturalExchange" ? `+${v} cultural pts` : `+${v} ${k}`
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
