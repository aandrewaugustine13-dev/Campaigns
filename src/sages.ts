// ═══════════════════════════════════════════════════════════════
// SAGE ENCOUNTERS — guaranteed historical figure meetings
// Each fires once at a trail % threshold, always triggers, never skipped
// ═══════════════════════════════════════════════════════════════

export interface SageQuestion {
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string;  // shown after answering (correct or wrong)
  teksRef: string;      // TEKS standard reference
}

export interface SageEncounterData {
  id: string;
  name: string;
  title: string;        // role/description line under name
  portrait: string;     // path to portrait image (placeholder until art exists)
  threshold: number;    // trail % where this fires (0-100)
  bio: string;          // 2-3 sentence mini biography
  greeting: string;     // what they say when they appear
  advice: string;       // situational trail advice
  question: SageQuestion;
  reward: {
    correct: Record<string, number>;   // resource effects on correct answer
    wrong: Record<string, number>;     // resource effects on wrong answer (less but never punishing)
    knowledgeCorrect: number;
    knowledgeWrong: number;
  };
}

// ── PORTRAIT PLACEHOLDERS ────────────────────────────────────
// Replace these paths when real art is ready.
// Recommended: 512x512 portrait, illustrated style matching the map.
// File location: public/faces/sage_<id>.png
const PORTRAIT = (id: string) => `/faces/sage_${id}.png`;

// ═══════════════════════════════════════════════════════════════
// THE FIVE SAGES
// ═══════════════════════════════════════════════════════════════

export const SAGES: SageEncounterData[] = [

  // ── 1. CHARLES GOODNIGHT — 15% (Austin area) ─────────────
  {
    id: "goodnight",
    name: "Charles Goodnight",
    title: "Cattleman & Trail Blazer",
    portrait: PORTRAIT("goodnight"),
    threshold: 15,
    bio: "Charles Goodnight co-blazed the Goodnight-Loving Trail and invented the chuck wagon — the mobile kitchen that made long cattle drives possible. A Confederate veteran turned rancher, he became one of the most successful cattlemen in Texas history.",
    greeting: "Your outfit camps near a rival drive. The trail boss rides over — a hard-looking man with sun-cracked hands and sharp eyes. He introduces himself as Charles Goodnight.",
    advice: "\"Your cook's wagon is a mess. Let me show you something.\" He spends an hour reorganizing your chuck wagon, showing how to mount the water barrel and tool chest properly. \"A fed crew is a loyal crew. Lose the cook and you lose the drive.\"",
    question: {
      question: "Why did massive cattle drives from Texas begin after 1865?",
      choices: [
        "Longhorns were brought to Texas for the first time from Mexico",
        "Texas had millions of cattle but no railroad — drives connected ranches to Northern markets",
        "The U.S. government paid cowboys to move cattle north as a jobs program",
        "Gold was discovered in Kansas and cowboys drove cattle there to feed miners",
      ],
      correctIndex: 1,
      explanation: "After the Civil War, Texas had an estimated 5 million longhorns but no railroads. Cattle worth $4 a head in Texas sold for $40 in Northern markets. The drives existed to bridge that gap — moving cattle on foot to railheads in Kansas where they could be shipped east by rail.",
      teksRef: "6.12(A) — Economic patterns of cattle ranching and the cattle drive era",
    },
    reward: {
      correct: { supplies: 8, herdCondition: 5 },
      wrong: { supplies: 3 },
      knowledgeCorrect: 4,
      knowledgeWrong: 2,
    },
  },

  // ── 2. JESSE CHISHOLM — 40% (approaching Red River) ──────
  {
    id: "chisholm",
    name: "Jesse Chisholm",
    title: "Trader, Scout & Trail Namesake",
    portrait: PORTRAIT("chisholm"),
    threshold: 40,
    bio: "Jesse Chisholm was half Cherokee and half Scottish. He spoke 14 languages and worked as a trader, interpreter, and guide across the Southern Plains. The trail that bears his name was originally his trading route between his post near Wichita and Texas — cattle drivers followed the path he'd already worn into the prairie.",
    greeting: "A trading party approaches from the north. Their leader is a wiry man with Cherokee features and a Scottish surname. Jesse Chisholm himself — the man whose wagon ruts you've been following for 300 miles.",
    advice: "\"You're on my trail because it follows water and avoids the worst crossings. That's not luck — I spent twenty years learning where the creeks run shallow.\" He marks your map with better fords ahead. \"The Washita will be high this time of year. Cross at the bend, not the narrows.\"",
    question: {
      question: "The Chisholm Trail was originally created as what?",
      choices: [
        "A military road built by the U.S. Army to connect frontier forts",
        "A trade route used by Jesse Chisholm to move goods between Indigenous nations and Texas",
        "A cattle trail designed by Texas ranchers to reach Abilene",
        "A stagecoach route connecting San Antonio to Kansas City",
      ],
      correctIndex: 1,
      explanation: "Jesse Chisholm was a trader, not a cattleman. His trail was a trade route connecting his trading post near present-day Wichita to points south. Texas cattle drivers adopted his path because it was already proven — it followed water, avoided rough terrain, and was known to Indigenous nations along the route. Chisholm himself never drove cattle on it.",
      teksRef: "6.4(A) — Contributions of individuals to Texas economic development",
    },
    reward: {
      correct: { insight: 2 },
      wrong: { insight: 1 },
      knowledgeCorrect: 5,
      knowledgeWrong: 2,
    },
  },

  // ── 3. QUANAH PARKER — 55% (Indian Territory) ────────────
  {
    id: "quanah",
    name: "Quanah Parker",
    title: "Comanche War Chief",
    portrait: PORTRAIT("quanah"),
    threshold: 55,
    bio: "Quanah Parker was the last chief of the Quahadi Comanche and the son of Chief Peta Nocona and Cynthia Ann Parker, a white captive who was adopted into Comanche life. He led the resistance against buffalo hunters and settlers at the Battle of Adobe Walls in 1874. After the Red River War, he became a statesman who navigated between Comanche traditions and the new reality of reservation life.",
    greeting: "A line of Comanche riders appears on a ridge overlooking your herd. Your crew reaches for their guns. The lead rider descends slowly — a powerful young warrior with braided hair and piercing eyes. He wants to talk, not fight.",
    advice: "\"You cross Comanche land. Every herd that passes kills more grass our buffalo need.\" He studies your outfit with calculating eyes. \"Move fast through the Territory. Don't let your cattle graze the creek bottoms — that grass feeds our horses. You'll have less trouble if you respect that.\"",
    question: {
      question: "What was the primary relationship between cattle drives and Plains Indian nations like the Comanche?",
      choices: [
        "The drives had no impact on Indigenous peoples because they followed different routes",
        "Cattle drives destroyed grazing land that buffalo herds depended on, threatening Indigenous ways of life",
        "Plains Indians eagerly traded with cattle drivers and welcomed the economic opportunity",
        "The U.S. government paid Indigenous nations to allow cattle drives through their territory",
      ],
      correctIndex: 1,
      explanation: "Cattle drives were one of many forces destroying the buffalo-based economy of Plains nations. Millions of cattle trampled and overgrazed land that sustained buffalo herds. Combined with commercial buffalo hunting, railroad expansion, and military campaigns, the cattle drives contributed to the collapse of Indigenous independence on the Southern Plains. This wasn't accidental — it was part of a larger pattern of displacement.",
      teksRef: "6.2(B) — Impact of westward expansion on Indigenous peoples",
    },
    reward: {
      correct: { morale: 8 },
      wrong: { morale: 3 },
      knowledgeCorrect: 5,
      knowledgeWrong: 3,
    },
  },

  // ── 4. BASS REEVES — 72% (deep Indian Territory) ─────────
  {
    id: "reeves",
    name: "Bass Reeves",
    title: "Deputy U.S. Marshal",
    portrait: PORTRAIT("reeves"),
    threshold: 72,
    bio: "Bass Reeves was born into slavery in 1838 and escaped to Indian Territory during the Civil War, where he lived among the Cherokee, Creek, and Seminole nations and learned their languages. After emancipation, he became one of the first Black deputy U.S. marshals west of the Mississippi. Over 32 years he arrested more than 3,000 felons and was never wounded — despite being shot at countless times.",
    greeting: "A tall man on a gray horse rides into your camp at dusk, a silver star on his chest. Your crew tenses — law in the Nations usually means trouble. But this man moves easy, speaks Muscogee to your Chickasaw guide, then switches to English without missing a beat. Deputy U.S. Marshal Bass Reeves.",
    advice: "\"Seen your dust cloud for two days. You're not the only ones who noticed — there's a band of horse thieves working this stretch.\" He checks his revolvers. \"Keep your remuda close tonight and post double watch. I'll be in the area.\" He glances at your Black cowboys and nods with something like recognition. \"Good crew you've got.\"",
    question: {
      question: "Historians estimate that what portion of working cowboys in the post-Civil War West were Black Americans?",
      choices: [
        "Almost none — Black Americans were not allowed to work as cowboys",
        "About 1 in 20 (5%)",
        "About 1 in 4 (25%)",
        "More than half (60%)",
      ],
      correctIndex: 2,
      explanation: "Historians estimate that roughly one in four cowboys were Black Americans. After emancipation, cattle work was one of the few industries open to Black men in Texas. They served as trail hands, cooks, wranglers, and bronc busters — though they were rarely promoted to trail boss. Men like Bose Ikard, who rode for Charles Goodnight, and Bass Reeves, who became a legendary lawman, represent a chapter of Western history that was systematically erased from popular culture for over a century.",
      teksRef: "6.1(A) — Contributions of diverse groups to Texas culture and history",
    },
    reward: {
      correct: { ammo: 15, morale: 5 },
      wrong: { ammo: 5 },
      knowledgeCorrect: 5,
      knowledgeWrong: 3,
    },
  },

  // ── 5. SATANTA — 84% (approaching Kansas) ────────────────
  {
    id: "satanta",
    name: "Satanta",
    title: "Kiowa Chief — The Orator of the Plains",
    portrait: PORTRAIT("satanta"),
    threshold: 84,
    bio: "Satanta (White Bear) was a Kiowa chief famous for his eloquence, his military leadership, and his defiant resistance to reservation confinement. He was known to U.S. officials as \"The Orator of the Plains\" for speeches that articulated the Kiowa position with devastating clarity. He was imprisoned at Huntsville, Texas, where he died in 1878 — officially by suicide, though the circumstances remain disputed.",
    greeting: "On a hill above the Kansas border, a Kiowa chief watches your herd pass. He's older than Quanah — battle-scarred, wearing a cavalry officer's coat taken as a trophy. He rides down not to threaten, but to speak. His reputation precedes him — this is Satanta, and he has something to say.",
    advice: "\"I have watched a hundred herds cross this grass. Each one leaves less for us. Your people build fences and call it progress. We call it the end of everything.\" He's not asking for payment. He's bearing witness. \"Remember that this land was not empty before your cattle came. Tell your children the truth about what was here.\"",
    question: {
      question: "How did the cattle drive era and westward expansion ultimately affect Plains Indian nations?",
      choices: [
        "Plains nations adapted easily by becoming cattle ranchers themselves",
        "The impact was temporary — Plains nations recovered their land within a decade",
        "Destruction of buffalo herds, loss of grazing land, and military campaigns forced Plains nations onto reservations, ending their independent way of life",
        "The U.S. government negotiated fair treaties that compensated Plains nations for lost land",
      ],
      correctIndex: 2,
      explanation: "The cattle drive era was part of a larger catastrophe for Plains Indian nations. Commercial buffalo hunting killed an estimated 50 million buffalo by the 1880s. Cattle drives overgrazed land that sustained remaining herds. Military campaigns like the Red River War of 1874-75 forced the last free bands onto reservations. The treaties that existed were routinely broken. The entire Southern Plains way of life — built over thousands of years around the buffalo — was destroyed in less than two decades.",
      teksRef: "6.2(B) — Impact of westward expansion; 6.15(A) — Causes and effects of changing demographics",
    },
    reward: {
      correct: { insight: 3 },
      wrong: { insight: 1 },
      knowledgeCorrect: 6,
      knowledgeWrong: 3,
    },
  },
];

// ═══════════════════════════════════════════════════════════════
// HELPER — find the next sage that should fire
// ═══════════════════════════════════════════════════════════════

export function getNextSage(
  progress: number,
  prevProgress: number,
  sageIndex: number
): SageEncounterData | null {
  if (sageIndex >= SAGES.length) return null;
  const sage = SAGES[sageIndex];
  // Fire if we've crossed or passed the threshold this turn
  if (progress >= sage.threshold && prevProgress < sage.threshold) {
    return sage;
  }
  // Also fire if we somehow jumped past it (push pace)
  if (progress >= sage.threshold && sageIndex < SAGES.length) {
    return sage;
  }
  return null;
}
