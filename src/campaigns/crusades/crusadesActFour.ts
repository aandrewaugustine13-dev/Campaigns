// ═══════════════════════════════════════════════════════════════
// THIRD CRUSADE — Act Four: The Complete Ending
// ═══════════════════════════════════════════════════════════════

// ── Beat 1: The Journey Home (bridge) ────────────────────────

export const JOURNEY_HOME_TEXT = `The war does not end with a battle. It ends with a signature — a truce between Richard and Saladin, sealed while the men who fought grumble that they crossed the world for nothing. Jerusalem stays in Saladin's hands. Christian pilgrims may pray there. And that, after three years and a sea of the dead, is all.

You turn west. The march that took years to come takes months to unwind. The same roads, the same sea, the same exhausted column — but quieter now. No one sings of glory. The men who are left have seen what glory costs, and they keep their songs to themselves.`;

export function getJourneyHomeTintedParagraph(standing: "high" | "mid" | "low"): string {
  if (standing === "high") {
    return "You have time, on that long road, to take stock of the man riding home. You left your door a hedge knight with nothing but a sword and three reasons to stay. You return a man the King of England knows by name, trusted, changed. The sea you crossed going out is the same sea coming back. You are not the same.";
  }
  if (standing === "low") {
    return "You have time, on that long road, to take stock of the man riding home. You left your door a hedge knight with nothing but a sword and three reasons to stay. You return hollowed out, carrying things you cannot put down, unsure what is left of the man who left. The sea you crossed going out is the same sea coming back. You are not the same.";
  }
  return "You have time, on that long road, to take stock of the man riding home. You left your door a hedge knight with nothing but a sword and three reasons to stay. You return a man who survived — neither hero nor villain, but different, in ways you cannot yet name. The sea you crossed going out is the same sea coming back. You are not the same.";
}

export const JOURNEY_HOME_CLOSING = "And every mile west, the thing you have not let yourself think about grows louder. Home. Your wife. Your children, who were small and are not small anymore. You do not know what is waiting. You only know you are almost there.";

// ── Beat 2: Barbarossa's Final Visit ─────────────────────────

export const BARBAROSSA_FINAL_INTRO = `One night on the road home, the fire burns low, and the air goes cold in the way you have learned to recognize. The water-and-reed light. The faded gold. He is back — fainter than ever, as if the journey home has cost even the dead something.

"So. You are going home. I never did. The river took me, and I never saw my walls again." He studies you with eyes like deep water. "Before I let you go, drowned man to living one — one last thing. You should understand what this war you bled for will mean, long after every man who fought it is dust."`;

export const BARBAROSSA_FINAL_QUESTION = {
  prompt: "Tell me, soldier — when the chroniclers weigh this Crusade, what will they say it accomplished?",
  choices: [
    "It failed to retake Jerusalem, but it secured Christian access to the holy sites through a truce — and showed that the two faiths could make peace as well as war.",
    "It recaptured Jerusalem permanently for Christendom.",
    "It destroyed Saladin's empire and ended Muslim rule in the region.",
    "It accomplished nothing of any lasting significance whatsoever.",
  ],
  correctIndex: 0,
};

export const BARBAROSSA_FINAL_CORRECT = `He nods, slow and grave. "Just so. Not a triumph. Not a disaster. A hard, human thing — two great men who could not win, choosing not to bleed their people white over a city neither could hold. History will argue about whether that was wisdom or weakness for eight hundred years. Let them argue."`;

export const BARBAROSSA_FINAL_TEACHING = `He shakes his head — not unkindly. "No. Think again. Not a triumph. Not a disaster. A hard, human thing — two great men who could not win, choosing not to bleed their people white over a city neither could hold. The truce secured pilgrim access — that was all the war bought, and it was not nothing. History will argue about whether that was wisdom or weakness for eight hundred years. Let them argue."`;

export const BARBAROSSA_FINAL_DREAD = `"But that is the world's reckoning, and it is not the one that should frighten you tonight. You think the war was the hard part. You survived it. But the man who marched out of that village is gone — you spent him, mile by mile, choice by choice. What walks through your door is someone else, wearing his face. And they will see it before you say a word. Your wife. Your children. In the first breath, before the embrace, they will know what the road made of you. I cannot tell you what they will see — I never earned a homecoming, and the dead do not get to know the ends of stories they were cut from. Maybe a man they can still love. Maybe a stranger. Maybe something they fear. That reckoning is yours alone, and it comes at dawn."

He begins to come apart, threads unraveling into water.

"Go home, Hugh of Warwick. Go and find out what you are. It is the only question this whole bloody war was ever really asking."

And he is gone, and there is only the sound of water, and then the grey light of the last morning.`;

// ── Beat 3: The Homecoming Reveal ────────────────────────────

export type HomecomingTier = "moral" | "pragmatic" | "feared";

export function computeHomecomingTier(
  honor: number,
  competence: number,
  honoredSaladin: boolean,
  jaffaOutcomeId: string | null,
): HomecomingTier {
  const merciful = jaffaOutcomeId === "letGoHonored" || jaffaOutcomeId === "letGoPlain";
  if (honor > 5 || (honor >= 4 && honoredSaladin && merciful)) return "moral";
  if (honor < 2 && competence > 4) return "feared";
  return "pragmatic";
}

export const HOMECOMING_SHARED_OPENING = `You crest the last rise at dawn, and there it is. Smaller than you remembered. The same door. The same yard where they dragged you out, or where you walked away — you are no longer sure which memory is the true one, or whether it matters now.

You stop your horse at the edge of the yard. Three years. A sea, a war, a sultan's tent, a dead emperor's warnings. All of it has come down to this — the few steps between you and a door.

You go in.`;

export const HOMECOMING_BRANCHES: Record<HomecomingTier, string> = {
  moral: `Your wife turns from the hearth. She is older. So are you. For a long moment neither of you moves.

Then she crosses the room and puts her hand against your face — not to embrace you, not yet, but to look at you. To read what the road wrote there. And whatever she finds, her eyes fill, and she says, very quietly, "You came back. You're still in there. I can see you."

Your children hang back, shy of this stranger who is their father — until the youngest, who barely remembers you, studies your face the way children do, and decides something, and crosses the room to take your hand.

You are broken. You know that. You will wake some nights with the war still in you, and there are things you did that you will never speak of. But you came home a man your family recognizes. A man they are not afraid to love. In the years to come, when your children are grown and the world asks them what kind of man their father was, they will not hesitate.

That is the only homecoming worth crossing a world for. You are home.`,

  pragmatic: `Your wife turns from the hearth. She is older, and well — they all are. The house is sound. There is food on the table and wood by the fire and no want in this room. You did that. The choices you made out there, the favor you earned, the things you were willing to do — they bought this. Safety. A roof. Full bellies.

She comes to you and embraces you, and it is real, and there is love in it. But there is something else, too — a small hesitation, a flicker behind her eyes, gone almost before you catch it. She has heard things. Or she simply sees, the way Barbarossa said she would, the shape of what you became to keep them safe.

Your children are healthy and they are glad and they are also, just slightly, careful with you. They will grow up wanting for nothing, and grateful, and they will love you. But there will always be a small distance — a thing they sense and never name, a question about their father they will carry and never quite ask.

You kept them safe. It cost more than they will ever know, and a little more than you can stand. It was, perhaps, worth it. Most nights you believe that. You are home.`,

  feared: `They are waiting for you, because word travels ahead of a man who has risen as far as you have. There is no scramble, no surprise. The house is fine — finer than you left it. Title. The King's favor. Land, perhaps, coming. You won everything a hedge knight could dream of winning.

Your wife inclines her head. She does not cross the room. She greets you the way one greets a powerful man — with care, with correctness, with a small watchfulness in her eyes that is not love and is not quite fear but lives somewhere between. The children stand straight. They are polite. They do not run to you. The youngest looks to their mother before looking at you, checking, the way you check the mood of someone who holds power over you.

You have everything. The house is yours, the people in it are yours, and not one face in this room is glad — only careful. You went to war and you became someone who wins, and you brought him home, and he is a stranger in his own house, ruling a family that does not know how to love what he became.

Barbarossa told you they would see it before you said a word. They did. You are home — and you have never been so alone.`,
};

// ── Beat 4: The Check for Understanding (5 TEKS questions) ───

export interface QuizQuestion {
  prompt: string;
  choices: string[];
  correctIndex: number;
}

export const FINAL_QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    prompt: "Why did the Third Crusade begin?",
    choices: [
      "Saladin recaptured Jerusalem in 1187, and the Pope called on Christendom to retake it.",
      "The Byzantine Empire fell and Europe rushed to defend Constantinople.",
      "Richard the Lionheart wanted to expand England's territory into the Middle East.",
      "A famine in Europe drove thousands to seek new lands in the East.",
    ],
    correctIndex: 0,
  },
  {
    prompt: "The works of the ancient Greek thinkers, lost to Europe, were preserved where during this era?",
    choices: [
      "In the libraries of the Muslim world.",
      "In hidden vaults beneath the Vatican.",
      "In monasteries in Ireland and Scotland.",
      "They were not preserved — they were rediscovered independently.",
    ],
    correctIndex: 0,
  },
  {
    prompt: "What is it called when goods, ideas, and knowledge spread from one culture to another — as they did between East and West during the Crusades?",
    choices: [
      "Cultural diffusion.",
      "Cultural appropriation.",
      "Manifest destiny.",
      "Imperialism.",
    ],
    correctIndex: 0,
  },
  {
    prompt: "How did the Third Crusade actually end?",
    choices: [
      "With the Treaty of Jaffa — Jerusalem stayed under Saladin's control, but Christian pilgrims were granted safe access to the holy sites.",
      "With Richard conquering Jerusalem and holding it for ten years.",
      "With Saladin's unconditional surrender to Richard.",
      "With both armies destroyed by plague, forcing an armistice.",
    ],
    correctIndex: 0,
  },
  {
    prompt: "Richard the Lionheart won his battles against Saladin. Why did he still never retake Jerusalem?",
    choices: [
      "He knew he could capture the city but could not hold it, so far from his supply lines and surrounded by Saladin's lands.",
      "Saladin's army was too large to defeat in open battle.",
      "The Pope ordered him to return home before he could attack.",
      "His own soldiers mutinied and refused to march on the city.",
    ],
    correctIndex: 0,
  },
];

// ── Beat 5: The Epilogue (true history) ──────────────────────

export const EPILOGUE_TEXT = `The Third Crusade ended in 1192, not with a conqueror's triumph but with a soldier's compromise — the Treaty of Jaffa. Richard the Lionheart, who never lost a battle to Saladin, sailed home without ever setting foot in Jerusalem. He had judged correctly: the city could be taken, but never held.

On his way home, Richard was captured by a rival Christian lord and held for an enormous ransom that nearly bankrupted England to pay. The Lionheart, the hero of the age, spent over a year in a foreign prison.

Saladin died only months after the war ended, in 1193. He had given away most of his wealth in charity during his life — so much that when he died, there was scarcely enough left to pay for his funeral. The most powerful man in the Muslim world was buried on borrowed money.

Jerusalem remained in Muslim hands. Christian pilgrims walked its streets in peace, as the truce promised. And two men who had spent three years trying to destroy each other were remembered, by their own peoples and by history, as having shown one another a respect that their allies never matched.`;

// ── Beat 6: The Contextual Importance ────────────────────────

export const IMPORTANCE_TEXT = `The Third Crusade did not change the map for long. But it changed how the two worlds saw each other. The legend of Saladin — the merciful, honorable enemy — traveled back to Europe and reshaped the way an entire civilization imagined its rival. For centuries afterward, even Europe's own writers held him up as the model of a noble king.

The Crusades as a whole, for all their bloodshed, cracked open a door between East and West. Through it flowed the preserved wisdom of the ancient Greeks, the mathematics and medicine and astronomy of the Muslim world, new foods, new goods, new ideas — the cultural diffusion that helped pull Europe out of its long isolation and toward the Renaissance to come.

And the war asked a question that has never stopped being asked: what does it cost to fight for something you believe is holy — and who pays that cost? Not the popes who preach it or the kings who command it. The Sir Hughs. The hedge knights. The mothers in the doorways. The frightened boys who cannot write their own letters home.

That is why this story is worth knowing. Not for the battles. For the people the great men spent to fight them.`;

// ── Beat 7: The Score Explanation ────────────────────────────

export type OutcomeIdForScore = "refuse" | "comply" | "elderRight" | "elderHardball" | "elderWalkAway";
export type JaffaIdForScore = "cutDown" | "letGoHonored" | "letGoPlain" | "prisoner";

export function getQuotaLine(outcomeId: string | null): string {
  switch (outcomeId) {
    case "refuse": return "When the village owed five men, you refused the order — and that was the first mark of the man you would become.";
    case "comply": return "When the village owed five men, you took them by force — and that was the first mark of the man you would become.";
    case "elderRight": return "When the village owed five men, you found the willing ones — and that was the first mark of the man you would become.";
    case "elderHardball": return "When the village owed five men, you bargained hard and bent them to your will — and that was the first mark of the man you would become.";
    case "elderWalkAway": return "When the village owed five men, you walked away from the elder's offer and forced the issue — and that was the first mark of the man you would become.";
    default: return "";
  }
}

export function getSaladinLine(honoredSaladin: boolean): string {
  if (honoredSaladin) return "In Saladin's tent, you saw a great man and honored him — and learned what kind of soldier you were.";
  return "In Saladin's tent, you treated him with contempt — and learned what kind of soldier you were.";
}

export function getJaffaLine(jaffaOutcomeId: string | null): string {
  switch (jaffaOutcomeId) {
    case "cutDown": return "On the field at Jaffa, with a defenseless man at your feet, you cut him down — the truest measure of your honor.";
    case "letGoHonored": return "On the field at Jaffa, with a defenseless man at your feet, you spared him — the truest measure of your honor.";
    case "letGoPlain": return "On the field at Jaffa, with a defenseless man at your feet, you spared him — the truest measure of your honor.";
    case "prisoner": return "On the field at Jaffa, with a defenseless man at your feet, you took him captive — the truest measure of your honor.";
    default: return "";
  }
}

export function getVerdictSummary(tier: HomecomingTier): string {
  switch (tier) {
    case "moral": return "You came home a moral compass your family could still recognize.";
    case "pragmatic": return "You came home safe but slightly strange to those you protected.";
    case "feared": return "You came home powerful and feared and alone.";
  }
}

export const SCORE_OUTRO = `You could not win this war. No one could — not even the Lionheart. The only thing you ever truly controlled was the man you chose to be inside it. That choice is the one your family read on your face at the door. That choice is the one history would have recorded, if history ever remembered the hedge knights.

It does not. But your children will.`;
