import { useMemo, useState } from "react";
import SageEncounterV2, { shuffleChoices } from "./SageEncounterV2";
import { CrusadesCampaign, CRUSADES_INITIAL_FLAGS } from "./campaigns/crusades/index";
import { getNextSage, type Sage } from "./campaigns/crusades/sageEncounters";
import { useFloatingNumbers, useScreenShake, FloatingNumbers } from "./GameJuice";

// ═══════════════════════════════════════════════════════════════
// THIRD CRUSADE — top-level campaign wrapper
//
// Flow:
//   opening (4 panels) → banner (choice) → goodbye →
//   quota (decide → [history → forcedChoice?] → outcome) →
//   sageEncounter → interlude → …
//
// `coerced` set by the banner choice; persists for downstream
// narration. competence/honor/favor are the moral meters the
// quota event (and future events) move. CrusadesCampaign and
// the existing sage system are unchanged.
// ═══════════════════════════════════════════════════════════════

type Phase =
  | "opening"           // 4 narrative panels, tap-to-advance
  | "banner"            // panel 5: two-button choice, NOT tap-to-advance
  | "goodbyeWilling"    // post-accept goodbye, tap-to-advance
  | "goodbyeCoerced"    // post-refuse goodbye, tap-to-advance
  | "quota"             // The Quota — three-path moral decision
  | "letter"            // The Letter — breather event between quota and Eleanor
  | "sicily"            // The Sicily Crossing — 3-card click-through after Eleanor
  | "messina"           // Messina — three-path decision before Barbarossa
  | "sageEncounter"     // active sage encounter (any sage from SAGES)
  | "barbarossaWarning" // Barbarossa's planted warning after a clean encounter
  | "acre"              // The Acre siege decision — payoff to barbarossaWarning
  | "richardEnvoy"      // Richard assigns Hugh to the envoy after his sage
  | "saladinBearing"    // Pre-encounter bearing choice that tints Saladin's frame
  | "saladinClosing"    // Post-encounter ride-back beat; pivot to the homecoming arc
  | "imadClosing"       // Post-Imad closing monologue; final sage before battle climax
  | "interlude";        // placeholder between events (post-sage)

interface CrusadesProps { onBack: () => void; }

// ── Panel content. Text is locked — do not paraphrase. ────────
const OPENING_PANELS: { src: string; text: string }[] = [
  {
    src: "/backgrounds/crusades/opening/panel_01.png",
    text: "The year of our Lord 1187. Jerusalem has fallen. The Holy City — taken in the First Crusade with rivers of blood, held for eighty-eight years — is gone. Saladin's banners fly over its walls. Word of it crosses the sea like a sickness, and everywhere it lands, the same silence falls.",
  },
  {
    src: "/backgrounds/crusades/opening/panel_02.png",
    text: "In Rome, one man already knows the answer he will give them. He will not tell them it was politics, or poor generalship. He will tell them it was sin. Their sin. And that the only road back to grace runs through the desert, sword in hand.",
  },
  {
    src: "/backgrounds/crusades/opening/panel_03.png",
    text: "Children of Christ. The Holy City weeps. The tomb of our Lord is held by those who deny Him — and I ask you: how, but that we earned it? We grew soft. We turned our blades on each other. The loss of Jerusalem is not God's failure. It is ours. But our God is merciful. To every man who takes the cross, I promise this: every sin of your life, washed away. And to those who would stay home while Christ's tomb lies in heathen hands? Ask what answer you will give, on the last day, when He asks where you were.",
  },
  {
    src: "/backgrounds/crusades/opening/panel_04.png",
    text: "He lets it land. He has given them heaven, and he has given them dread, and he knows — as he has always known — which of the two will fill the ships. Far from Rome, the call rolls downhill. Past the great houses. Down to the small men who have always known: when great men speak of holy war, it is the low men who fill the graves. In a crowd, a hedge knight stands very still. He holds no land. He has a sword, a horse, and three reasons asleep at home he has never wished to leave. He does not yet know they are already coming for him.",
  },
];

const GOODBYE_WILLING_PANELS: { src: string; text: string }[] = [
  {
    src: "/backgrounds/crusades/opening/goodbye_willing_01.png",
    text: "[Final dawn farewell. His wife Alyse, cold, says aloud:] \"Look at them. Look at your children. And tell me which one of them is worth less to you than a city you have never seen.\"",
  },
  {
    src: "/backgrounds/crusades/opening/goodbye_willing_02.png",
    text: "[Hugh says nothing — the truth would only frighten her.] \"I cannot defend this house, Hugh. When winter comes and the stores run thin and there is no man at this door, it will be me and three small children and whatever mercy the world decides to show us. You are not going to save Jerusalem. You are leaving us to save yourself a worse goodbye.\"",
  },
  {
    src: "/backgrounds/crusades/opening/goodbye_willing_03.png",
    text: "[His daughter reaches for him. His wife does not. He goes anyway.]",
  },
];

const GOODBYE_COERCED_PANELS: { src: string; text: string }[] = [
  {
    src: "/backgrounds/crusades/opening/goodbye_coerced_01.png",
    text: "[He said no. Before dawn, the door comes off its hinges. The King's men take him from his bed. Alyse screaming, the children awake, his son making a sound he'll hear forever. No goodbye — that's what they steal. One look back: Alyse in the doorway, candlelit, white with terror and rage, arm flung toward him. The dark swallows his daughter calling his name.]",
  },
  {
    src: "/backgrounds/crusades/opening/goodbye_coerced_02.png",
    text: "Whatever else this war makes of you, it began like this: with you telling the truth, and the truth meaning nothing at all.",
  },
];

// ═══════════════════════════════════════════════════════════════
// "THE SICILY CROSSING" — 3-card click-through, between Eleanor
// and Messina. Educational; no choice. Teaches the real history
// the player will then act on at Messina.
// ═══════════════════════════════════════════════════════════════

const SICILY_PANELS: { src: string; text: string }[] = [
  {
    src: "/backgrounds/crusades/sicily/panel_01.png",
    text: "Richard's army did not march to the Holy Land. They sailed — south through France to the sea, then onto a fleet bound for the Mediterranean. The crossing was its own war: storms, sickness, and the slow grinding boredom of men packed onto ships with nowhere to go.",
  },
  {
    src: "/backgrounds/crusades/sicily/panel_02.png",
    text: "They wintered on the island of Sicily, and the winter was long. More crusaders would die on this journey of disease and hunger than ever fell to a Saracen blade. The French and the English, supposedly allies, eyed each other across the camp like rival dogs.",
  },
  {
    src: "/backgrounds/crusades/sicily/panel_03.png",
    text: "And then came the first true test of what this holy war actually was. The first city Richard's army would storm was not held by Saladin. It was Messina — a Christian city. A dispute over money, a slighted sister, a local king who would not pay. The cross had not yet met the crescent, and already the swords were out.",
  },
];

// ═══════════════════════════════════════════════════════════════
// "THE QUOTA" — France, 1190 (first heavy decision)
// All deltas, narration, and shake intensities are tunable below.
// ═══════════════════════════════════════════════════════════════

type MeterDeltas = { competence?: number; honor?: number; favor?: number };

const QUOTA_DELTAS: Record<
  "refuse" | "comply" | "elderRight" | "elderWrongInit" | "elderHardball" | "elderWalkAway",
  MeterDeltas
> = {
  refuse:         { honor:  3, favor: -3, competence:  0 },
  comply:         { honor: -3, favor:  2, competence:  2 },
  elderRight:     { honor:  2, favor:  2, competence:  2 },
  elderWrongInit: {                       competence: -2 }, // applied on landing in forcedChoice
  elderHardball:  { honor: -3, favor:  2                  }, // stacks on top of elderWrongInit
  elderWalkAway: {             favor: -2, competence: -2  }, // stacks on top of elderWrongInit
};

// Heavier shake on the cruel paths; restrained on moral/clean ones.
const QUOTA_SHAKE: Record<
  "refuse" | "comply" | "elderRight" | "elderWrongInit" | "elderHardball" | "elderWalkAway",
  "light" | "medium" | "heavy"
> = {
  refuse:         "light",
  comply:         "heavy",
  elderRight:     "light",
  elderWrongInit: "light",
  elderHardball:  "heavy",
  elderWalkAway:  "medium",
};

// The recurring marshal — unnamed-but-consistent figure who reads
// Hugh's standing back to him after every assignment.
const MARSHAL_LINES = {
  pleased:   "Five men, and no fuss worth hearing about. The King values a man who delivers.",
  cold:      "Empty-handed. I'll remember that, hedge knight. So will the men above me.",
  surprised: "Five, and the village didn't even riot. You've a head on you, for a hedge knight.",
} as const;

type OutcomeId = "refuse" | "comply" | "elderRight" | "elderHardball" | "elderWalkAway";

const QUOTA_OUTCOMES: Record<OutcomeId, { narration: string; marshal: keyof typeof MARSHAL_LINES }> = {
  refuse: {
    narration:
      "You ride out empty-handed. Word reaches Richard's officers that the hedge knight would not fill his quota. You have made an enemy of the men who keep the King's favor — and you do not yet know how long that memory will last. But you can still look at your own hands.",
    marshal: "cold",
  },
  comply: {
    narration:
      "You take the strong ones. A woman claws at your stirrup; you ride through her. Five men, roped at the wrists, stumble behind your horse as the village wails. The quota is met. Richard's officers will hear you are dependable. You try not to think of a doorway, and a candle, and an arm flung out toward you.",
    marshal: "pleased",
  },
  elderRight: {
    narration:
      "The elder studies you, then nods slowly. \"You understand.\" Together you find them — a blacksmith's restless second son, a man drowning in debt, two youths who have dreamed of nothing but the Holy Land. They come willingly. No family is broken. You ride out with five men who chose this, the village unbowed behind you, and a quota met clean. You did not know a man could do this job without leaving wreckage. Today you learned he can — if he knows what he's doing.",
    marshal: "surprised",
  },
  elderHardball: {
    narration:
      "You do the ugly thing, and you do it badly — grabbing men at random, the town now openly hostile because you came as a friend and turned. Richard's officers get their five. They will not hear how it went, only that it was done. But you will remember that you tried to be better, and weren't sharp enough to manage it.",
    marshal: "pleased",
  },
  elderWalkAway: {
    narration:
      "You leave with nothing. No men, no goodwill, no quota — just a village that watched you fail and a long ride to explain yourself. Richard's officers do not forgive a man who comes back empty and foolish both.",
    marshal: "cold",
  },
};

const QUOTA_HOOK =
  "Your commander hands you a number. This village owes the King five men for the holy war, and it falls to you to choose them. The mothers already know why you have come. They watch you from their doorways.";

const QUOTA_DECIDE_BUTTONS: { id: "refuse" | "comply" | "elder"; label: string; line: string }[] = [
  {
    id: "refuse",
    label: "Refuse",
    line: "\"These are not soldiers. They are farmers, and fathers, and I will not do to them what was done to me.\"",
  },
  {
    id: "comply",
    label: "Comply without mercy",
    line: "\"The King commands it. I take the five strongest and I do not look back.\"",
  },
  {
    id: "elder",
    label: "Meet the elder",
    line: "\"Every village has men who would go gladly. Let me find them.\"",
  },
];

const QUOTA_HISTORY_QUESTION = {
  prompt:
    "The elder is wary. To win his trust, you must show you understand why men take the cross. He tests you — what truly drives men to this war?",
  choices: [
    "Younger sons with no land to inherit, men in debt seeking relief, and those promised their sins washed clean.",
    "Only the most devout, who care nothing for worldly reward.",
    "Men forced at swordpoint, as there is no other reason to go.",
    "Knights seeking glory in tournament and single combat.",
  ],
  correctIndex: 0,
} as const;

const QUOTA_FORCED_SETUP =
  "The elder's face closes. You have shown him nothing but ignorance, and he will not help a man who does not understand his own war. The five men must still come from somewhere.";

const QUOTA_FORCED_BUTTONS: { id: "hardball" | "walkAway"; label: string }[] = [
  { id: "hardball", label: "Hardball — take them anyway" },
  { id: "walkAway", label: "Walk away" },
];

type QuotaStep = "decide" | "history" | "forcedChoice" | "outcome";

// ═══════════════════════════════════════════════════════════════
// "THE LETTER" — France, on the march (small breather event)
// One choice, two options. helpedTheBoy tints Eleanor's intro only.
// ═══════════════════════════════════════════════════════════════

const LETTER_DELTAS: Record<"help" | "push", MeterDeltas> = {
  help: { honor: 2, favor: -1 },
  push: {},
};

// null = no shake (no meter movement, no need for feedback).
const LETTER_SHAKE: Record<"help" | "push", "light" | "medium" | "heavy" | null> = {
  help: "light",
  push: null,
};

const LETTER_HOOK =
  "The column has slowed. Ahead, a boy — no older than fifteen, a conscript's tunic too big for him — sits in the mud with a scrap of parchment and a stick of charcoal, weeping. He cannot write. He is trying to send something home before the sea takes them all, and he does not have the letters to do it.";

const LETTER_BOY_LINE =
  "Please, ser. I only want my mother to have my words. If I don't come back — I want her to have something that's mine.";

const LETTER_BUTTONS: { id: "help" | "push"; label: string; line: string }[] = [
  {
    id: "help",
    label: "Help him",
    line: "\"Give me the charcoal, lad. Tell me what to say.\"",
  },
  {
    id: "push",
    label: "Push on",
    line: "\"Keep moving, lad. We all have people. The sea won't wait.\"",
  },
];

// Help-outcome is rendered as three blocks: lead-in narration, the
// in-world letter set apart as an artifact, then aftermath narration.
const LETTER_HELP_OUTCOME = {
  lead:
    "You kneel in the mud beside him and take the charcoal. He speaks haltingly, and you write it down in a hand not much better than his would be:",
  letter:
    "Mother. I am well. The food is poor and the marching is long but I am well. Do not sell the goat. I will come home and we will be as we were. Pray for me. Your son—",
  aftermath:
    "He cannot finish the last word. He just nods, and you write his name, and he holds the parchment to his chest like it is the only warm thing in France.\n\nBehind you, one of the King's marshals watches, and says nothing, and his silence is its own verdict. A knight who stops in the mud for a crying boy is a knight they will count on a little less. You find you do not care. Somewhere, a letter is going home. That is enough for today.",
};

const LETTER_PUSH_OUTCOME =
  "You ride past. It is the disciplined thing, the soldier's thing — the column cannot stop for every frightened boy, and there will be a thousand frightened boys before this is over. You tell yourself this. The boy's weeping falls away behind you, swallowed by the sound of ten thousand men marching toward the sea. You do not look back. You are getting better at not looking back. You do not yet know that this is something a man can lose, and not get returned to him.";

// Eleanor intro tints — replace her base intro when set. Written as
// dialogue (wrap in quotes at render time, matching her questions).
const ELEANOR_INTRO_OVERRIDES = {
  warm:
    "I heard what you did on the road, ser Hugh — that you stopped to give a frightened boy his words. Sit. Sit by me.",
  worried:
    "I am told you did not stop for the boy on the road. No — don't defend it, it was the soldier's choice, the sensible one. That is what worries me. You are a man with people of your own, and you are already learning not to look back. I have buried sons, ser Hugh. Let an old woman tell you what that costs a man, before you pay it.",
} as const;

type LetterStep = "decide" | "outcome";

// ═══════════════════════════════════════════════════════════════
// "MESSINA" — Sicily, 1190 (first storming, against Christians)
// Structural clone of The Quota: decide → [history → forced?] →
// outcome. Deltas, narration, and shake intensities tunable below.
// Narration absorbs the marshal beat (no separate callout block).
// ═══════════════════════════════════════════════════════════════

const MESSINA_DELTAS: Record<
  "plunder" | "refuse" | "gateRight" | "gateWrongInit" | "gateHardball" | "gatePullBack",
  MeterDeltas
> = {
  plunder:        { favor:  2, competence:  2, honor: -3 },
  refuse:         { honor:  3, favor: -2, competence:  0 },
  gateRight:      { honor:  0, favor:  2, competence:  2 },
  gateWrongInit:  {                       competence: -2 }, // applied on landing in forcedChoice
  gateHardball:   { favor:  2, honor: -3                  }, // stacks on top of gateWrongInit
  gatePullBack:   { favor: -2, competence: -2             }, // stacks on top of gateWrongInit
};

const MESSINA_SHAKE: Record<
  "plunder" | "refuse" | "gateRight" | "gateWrongInit" | "gateHardball" | "gatePullBack",
  "light" | "medium" | "heavy"
> = {
  plunder:        "heavy",
  refuse:         "light",
  gateRight:      "light",
  gateWrongInit:  "light",
  gateHardball:   "heavy",
  gatePullBack:   "medium",
};

type MessinaOutcomeId = "plunder" | "refuse" | "gateRight" | "gateHardball" | "gatePullBack";

const MESSINA_OUTCOMES: Record<MessinaOutcomeId, { narration: string }> = {
  plunder: {
    narration:
      "You take what the city offers. Silver, grain, whatever isn't nailed down and some that is. Your men eat well tonight and the marshals mark you willing. You tell yourself a soldier follows orders. You do not let yourself think the word 'Christian,' because the word does not pay.",
  },
  refuse: {
    narration:
      "You hold your men back, and you stand between a few terrified families and the worst of it. It costs you. The other captains feast and you do not; the marshals note, again, that the hedge knight has a tender conscience. But the families you shielded will remember a knight who did not.",
  },
  gateRight: {
    narration:
      "You understand it's leverage, not holy war. You direct your men to seize the stores and the treasury — Tancred's debt made good — and spare the homes and the families. Richard gets his payment, your men get their share, and Messina is not put to the torch. The marshals notice a man who can get the King paid without making a massacre of it.",
  },
  gateHardball: {
    narration:
      "You misjudged it. With nothing else to show, you wave your men into the houses and take what they can carry. The city burns the same as it would have. Your share comes with it, and the marshals are pleased — but you know you tried for the better road and could not find it.",
  },
  gatePullBack: {
    narration:
      "You misjudged it, then pulled your men out rather than join the worst of it. Richard gets less than he wanted from your sector. The marshals do not credit a captain who fumbles the question and then walks away from the answer. You come out of Messina with neither the silver nor the standing.",
  },
};

const MESSINA_HOOK =
  "Messina burns. Richard has given the order — the city that mocked him will be taken and stripped. Your men look to you. The gates are open, the houses are full, and these are Christians, same as you. What do you do?";

const MESSINA_DECIDE_BUTTONS: { id: "plunder" | "refuse" | "gate"; label: string; line: string }[] = [
  {
    id: "plunder",
    label: "Join the plunder",
    line: "\"The King commands it. The city is ours to take.\"",
  },
  {
    id: "refuse",
    label: "Refuse / protect civilians",
    line: "\"I did not take the cross to rob fellow Christians. I'll have no part in it.\"",
  },
  {
    id: "gate",
    label: "The third door",
    line: "\"There's a smarter way to profit here than burning it all.\"",
  },
];

const MESSINA_HISTORY_QUESTION = {
  prompt:
    "You know why Richard truly turned on Messina. It was not faith. If you understand his real reason, you can take what he wants without the worst of the cruelty. Why did Richard sack a Christian city?",
  choices: [
    "Politics and money — a dispute over his sister's dowry and the local king Tancred's refusal to pay what was owed.",
    "The people of Messina had secretly converted to Islam.",
    "God commanded him to purify all cities along the route.",
    "Saladin's spies were hiding within the city walls.",
  ],
  correctIndex: 0,
} as const;

const MESSINA_FORCED_SETUP =
  "You read it wrong. There is no clever play here, only the ugly one. The men are already moving on the houses. You can join the take, or you can call yours off — but the city falls either way.";

const MESSINA_FORCED_BUTTONS: { id: "hardball" | "pullBack"; label: string }[] = [
  { id: "hardball", label: "Join the plunder" },
  { id: "pullBack", label: "Pull back" },
];

type MessinaStep = "decide" | "history" | "forcedChoice" | "outcome";

// ═══════════════════════════════════════════════════════════════
// "BARBAROSSA'S WARNING" — the planted prophecy. Intro tints are
// per-Messina-path; the warning text on the post-encounter phase
// is the seed for a later Acre beat, so its language must stay
// preserved exactly.
// ═══════════════════════════════════════════════════════════════

const BARBAROSSA_INTRO_OVERRIDES = {
  plundered:
    "I see Messina on you, boy. The first stain is always a Christian one. No — I do not judge. I am dead; judgment is above my rank now. But I marked the same road you walk.",
  spared:
    "You kept your hands clean at Messina. Good. It will get harder than that. Sit, and listen to a dead man who learned too late.",
} as const;

const BARBAROSSA_WARNING_TEXT =
  "Hear me, for I paid in full for what I know. The enemy you fear is not the enemy that kills you. I was the mightiest of the three kings, and no Saracen felled me — a river did, and my own certainty. When you reach the great siege, the men will clamor to attack, to spend themselves on the walls. Do not. The walls are not your enemy. Hunger is. Sickness is. The waiting is. Guard your strength and your stores, keep the camp clean, hold your discipline when others throw theirs away — and you will live to see the city fall while better men rot in the mud. Remember: at the siege, patience is the sword.";

// ═══════════════════════════════════════════════════════════════
// "ACRE" — the great siege (standalone decision; not a sage).
// Payoff to barbarossaWarningHeard: path B forks on the flag —
// the player who heard Barbarossa's prophecy gets the strategic
// clarity that earns a full clean-run reward; the player who
// didn't merely guesses right and gets a thinner payoff. Path A
// is what Barbarossa explicitly warned against.
// ═══════════════════════════════════════════════════════════════

const ACRE_DELTAS: Record<
  "assault" | "holdWith" | "holdWithout" | "split",
  MeterDeltas
> = {
  assault:     { favor:  1, competence: -2 },
  holdWith:    { competence:  3 },
  holdWithout: { competence:  1 },
  split:       {},
};

const ACRE_SHAKE: Record<
  "assault" | "holdWith" | "holdWithout" | "split",
  "light" | "medium" | "heavy"
> = {
  assault:     "heavy",
  holdWith:    "light",
  holdWithout: "light",
  split:       "light",
};

type AcreOutcomeId = "assault" | "holdWith" | "holdWithout" | "split";

const ACRE_OUTCOMES: Record<AcreOutcomeId, { narration: string }> = {
  assault: {
    narration:
      "The assault is everything the captains promised — loud, brave, and useless. You lose good men on the walls and gain nothing but a day's distraction from the dying. The flux does not care how bravely you charged. By morning the camp is sicker than before, and the city still stands.",
  },
  holdWith: {
    narration:
      "A dead emperor told you patience is the sword — that the siege kills more men than the enemy ever could, and discipline is the only shield. He paid for that knowledge with his life. You will not waste it. You hold the line, keep the camp clean, ration hard, and wait. The sickness that guts the other companies barely touches yours. When the city finally falls, your men are among the few who can still stand. Word of it travels further than you know.",
  },
  holdWithout: {
    narration:
      "Something tells you to wait — you couldn't say what, only that throwing tired, sick men at stone walls feels like a way to die for nothing. You hold. It helps, some. Your company fares a little better than most. But you are guessing, and you know it, and the guessing costs you men you might have saved if you'd truly understood what this siege was.",
  },
  split: {
    narration:
      "You hedge. A cautious probe, the bulk of your men held back. It is neither the disaster of a full assault nor the discipline that saves an army. You lose a little, gain a little, and the siege grinds on indifferent to your caution.",
  },
};

const ACRE_HOOK =
  "The siege has become a graveyard. Not from Saracen arrows — from the camp itself. Men die of the flux and the fever faster than any sword could manage, and the rot and hunger grind on with no end in sight. The other captains are done waiting. They want to throw everything at the walls in one great assault. Glory or death, they say, but at least an end. Your men look to you. What do you do?";

const ACRE_DECIDE_BUTTONS: { id: "assault" | "hold" | "split"; label: string; line: string }[] = [
  {
    id: "assault",
    label: "Join the assault",
    line: "\"The men want to fight. Better to die on the walls than rot in this mud. We attack.\"",
  },
  {
    id: "hold",
    label: "Hold, fortify, wait",
    line: "\"No. We hold. Clean the camp, guard the stores, keep discipline, and let the city starve before we do. We wait.\"",
  },
  {
    id: "split",
    label: "Split the difference",
    line: "\"We probe the walls but hold our main strength in reserve.\"",
  },
];

type AcreStep = "decide" | "outcome";

// ═══════════════════════════════════════════════════════════════
// "RICHARD I" — post-Acre, on the march to Jaffa with Arsuf
// looming. Greeting and envoy line are both tinted by Hugh's
// standing; the tier is locked when the sage encounter begins
// so the +2/+2 reward can't flip the envoy line mid-encounter.
// ═══════════════════════════════════════════════════════════════

type RichardTier = "impressed" | "cold" | "read";

// Tunable thresholds. Order in computeRichardTier is:
// impressed → cold → read (default). Adjust if a tier feels off in play.
// IMPRESSED is gated solely on acreCleanRun — the IMPRESSED greeting
// references Acre conduct directly, so that flag is the real signal.
const RICHARD_TINT_THRESHOLDS = {
  coldFavor: 3,
  coldMaxHonor: 0,
} as const;

const RICHARD_CORRECT_DELTAS: MeterDeltas = { competence: 2, favor: 2 };

const RICHARD_GREETINGS: Record<RichardTier, string> = {
  impressed:
    "You. The hedge knight. I'm told that while my well-born captains were screaming for an assault on Acre's walls, you were the one keeping your men fed and clean and alive through the rot. That you understood the siege before the siege understood you. I have a great many brave fools, ser Hugh. I have very few who think. Walk with me.",
  cold:
    "You're the one they call reliable. The one who does what's asked and doesn't trouble himself with the why of it. Good. I have no use for a conscience just now — I have use for a man who follows an order into a hard place and comes back. That's you, isn't it? Don't answer. I already know.",
  read:
    "You. Can you read? Truly read, not just squint at your own name? — Good. Christ's blood, half the men I knighted can't tell a treaty from a tavern slate. That makes you rarer than courage out here. Come here. I have a use for a literate man, and it isn't a flattering one.",
};

const RICHARD_ENVOY_LINES: Record<RichardTier, string> = {
  impressed:
    "I'm sending men to Saladin's camp under truce. I want eyes there that can think — tell me what you see, not what you're told to see. Go.",
  cold:
    "You'll carry my terms to Saladin. You'll keep your face still and your mouth shut and you'll remember every word said. That's all I need of you.",
  read:
    "You'll go to Saladin's camp with the envoy. Someone has to read the terms and carry the reply, and it might as well be the one man here who won't need it read to him. Don't embarrass me.",
};

function computeRichardTier(
  acreCleanRun: boolean,
  honor: number,
  favor: number,
): RichardTier {
  if (acreCleanRun) return "impressed";
  if (favor >= RICHARD_TINT_THRESHOLDS.coldFavor && honor <= RICHARD_TINT_THRESHOLDS.coldMaxHonor) return "cold";
  return "read";
}

// ═══════════════════════════════════════════════════════════════
// "SALADIN" encounter frame — a pre-question bearing choice that
// tints how he addresses Hugh. His Q1 (the three faiths) and Q2
// (the mercy at Jerusalem) are untouched in sageEncounters.ts;
// only the framing/warmth shifts. Saladin's dignity is constant
// across both paths — it's Hugh's ability to see it that changes.
// ═══════════════════════════════════════════════════════════════

type BearingTier = "hammer" | "respect";

const SALADIN_BEARING_DELTAS: Record<BearingTier, MeterDeltas> = {
  hammer:  { favor:  2, honor: -2 },
  respect: { honor:  3, favor: -1 },
};

const SALADIN_BEARING_SHAKE: Record<BearingTier, "light" | "medium" | "heavy"> = {
  hammer:  "medium",
  respect: "light",
};

const SALADIN_SCENE_SETTER =
  "You ride into Saladin's camp under the white flag of a messenger. You feel the hatred before you see it — the eyes of his soldiers follow you, hands resting on hilts, faces tight with contempt. You are the enemy, riding into their home. But not one of them touches you. They know the law: you do not kill a messenger. Whatever else this army is, it is disciplined, and it is held to a code.\n\nYou are brought before the Sultan himself. Salah ad-Din — the man your whole world has taught you to call a monster. He rises. He greets you with a courtesy you did not expect and have rarely been shown by your own lords. He offers you the chance to deliver your king's terms.\n\nHow do you carry yourself?";

const SALADIN_BEARING_BUTTONS: { id: BearingTier; label: string; line: string }[] = [
  {
    id: "hammer",
    label: "The King's hammer",
    line: "\"I am the envoy of Richard of England, and I'll not bow or scrape before the enemy of Christ. I deliver my king's terms standing, and I look this man in the eye as what he is: an enemy.\"",
  },
  {
    id: "respect",
    label: "Respect and humility",
    line: "You take in the camp, the discipline, the bearing of the man before you, and something shifts. This is no savage from the East. This is a great leader of men — perhaps the equal of any you have met. You deliver your king's terms plainly, with the respect one honorable man owes another.",
  },
];

// The "beat after choosing" — Saladin's reaction to Hugh's bearing.
// Used as the sage's intro override (replaces Saladin's stock intro,
// which is redundant with the bearing scene-setter that just played).
const SALADIN_INTRO_OVERRIDES: Record<BearingTier, string> = {
  hammer:
    "Saladin listens to your cold words without flinching. He does not rise to your contempt, does not match it, does not punish it. He simply regards you with a calm that makes your hardness feel suddenly small — the steadiness of a man who has nothing to prove to you. 'You serve your king well,' he says, and means it, and somehow that is worse than if he'd been angry.",
  respect:
    "Saladin notices. Of course he notices — he has spent his life reading men. He inclines his head, and calls for water and dates to be brought to you, a tired messenger far from home. 'Sit,' he says. 'We are enemies today. That does not mean we must be less than men.' For the length of one cup of water, the war is somewhere else.",
};

// Closing beats — the ride back from Saladin's camp. Tinted by
// bearingTier. This is the pivot from the outward journey to the
// homecoming arc; the road turns home after this.
const SALADIN_CLOSING_BEATS: Record<BearingTier, string> = {
  hammer:
    "You carry Saladin's reply back across the lines, and you tell yourself you did your duty. You stood proud. You showed the enemy no weakness. Your king would approve.\n\nBut the sultan's calm follows you out of the tent and will not leave. He had every reason to match your contempt, and he did not. He simply looked at you, and was greater than you, and let you go.\n\nYou ride back toward your own army, and you are thinking — though you try not to — of home. Of a doorway. Of the man you were when you left it, and the man you are becoming out here. The war is not over. But you are beginning to wonder what, exactly, you will be carrying back through that door.",
  respect:
    "You carry Saladin's reply back across the lines, and the camp of your own army feels different when you return to it — louder, coarser, smaller. You have stood in the presence of two kings and an emperor's ghost, and a sultan your whole world called a monster treated you with more grace than any of them.\n\nYou do not have the words for what shifted in that tent. Only that you went in certain of who the enemy was, and came out less certain of everything.\n\nAnd somewhere in the certainty you lost, you find you are thinking of home. Of a doorway. Of faces you have not seen in longer than you can stand to count. The war is not over. But for the first time, you let yourself believe there might be a road back.",
};

// One-line italic lead-ins above each question's prompt. Saladin's
// dignity is constant — these only tint the warmth of his framing.
const SALADIN_QUESTION_LEAD_INS: Record<BearingTier, [string, string]> = {
  hammer: [
    "He gives no sign of having noticed your hardness. He simply begins, as though you had been courteous:",
    "Your coldness costs him nothing. He goes on, patient as stone:",
  ],
  respect: [
    "He sets his cup down and turns to you as a man addresses a guest he wishes to know:",
    "He weighs his next words, addressing you as one might a student he hopes will understand:",
  ],
};

// ═══════════════════════════════════════════════════════════════
// "IMAD AD-DIN AL-ISFAHANI" — the quiet think-beat. No bearing
// choice, no meter-moving decision — standard sage flow. The
// handoff narration from Saladin replaces Imad's stock intro;
// the closing monologue fires after Q2 regardless of outcome.
// ═══════════════════════════════════════════════════════════════

const IMAD_INTRO_HANDOFF =
  "You rise to carry the Sultan's reply back to your king. But Saladin lifts a hand.\n\n'Before you go — there is a man you should meet. My secretary. He keeps the record of this war, and of much else besides.' A faint smile. 'Your kings believe this war will be remembered as they fought it. He will show you how it is actually remembered — and by whom. Go to him. Then carry what you learn back to Richard, and see if he is wise enough to hear it.'\n\nYou are led deeper into the camp, to a tent lit with oil lamps and stacked, floor to ceiling, with books. More books than you have seen in your life. A thin, sharp-eyed man looks up from his writing.";

const IMAD_CLOSING_TEXT =
  "Imad sets down his pen. 'You came here to deliver a king's terms. You will leave with something your king does not have: the truth of his own war.\n\nYour Richard is a great soldier. He will win his battles. He may even reach the walls of the Holy City. But he will not hold it. Jerusalem sits far from his sea and his supplies, ringed by our lands, defended by a people who will never stop coming. He can take it for a season. He cannot keep it. The wise thing — the only thing — is peace. A truce that lets his pilgrims pray and lets the city stand. Whether he is wise enough for that, you will soon learn.'\n\nHe returns to his writing. 'And one more thing, messenger, since you will carry stories home. Every man believes he writes his own legend. He does not. Others write it — chroniclers like me, kings like yours, and the people who knew him. You will be remembered exactly as those who outlive you choose to remember you. Remember that, when you finally go home.'\n\nYou ride back toward Richard's camp with more than a reply. You carry the shape of the whole war, and a question you cannot put down: not how Richard will be remembered — but how you will be.";

// ── Opening panel: <img> with a visibly labeled gray fallback
// when the asset is missing. Designed so missing art is obvious,
// not silently hidden behind a gradient.
function OpeningPanel({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="w-full h-48 rounded border-2 border-dashed border-stone-600 bg-stone-800 flex items-center justify-center">
        <div className="text-center px-3">
          <div className="text-stone-400 text-xs font-bold uppercase tracking-wider">Missing art</div>
          <div className="text-stone-500 text-[10px] font-mono mt-1 break-all">{src}</div>
        </div>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="w-full h-48 object-cover rounded border border-stone-700 bg-stone-950"
    />
  );
}

// ── Compact meter readout. Used as a header on quota + interlude. ─
function MeterReadout({ competence, honor, favor }: { competence: number; honor: number; favor: number }) {
  const fmt = (v: number) => (v >= 0 ? `+${v}` : `${v}`);
  const tone = (v: number) =>
    v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-stone-400";
  return (
    <span className="font-mono text-xs">
      <span className="text-stone-500">comp </span><span className={tone(competence)}>{fmt(competence)}</span>
      <span className="text-stone-600"> · </span>
      <span className="text-stone-500">honor </span><span className={tone(honor)}>{fmt(honor)}</span>
      <span className="text-stone-600"> · </span>
      <span className="text-stone-500">favor </span><span className={tone(favor)}>{fmt(favor)}</span>
    </span>
  );
}

export default function Crusades({ onBack }: CrusadesProps) {
  const [phase, setPhase] = useState<Phase>("opening");
  const [coerced, setCoerced] = useState<boolean>(CRUSADES_INITIAL_FLAGS.coerced);
  // Panel cursor for click-through phases. Reset on phase entry.
  const [panelIndex, setPanelIndex] = useState<number>(0);

  // ── Moral meters. Moved by quota; future events will also move them. ─
  const [competence, setCompetence] = useState<number>(0);
  const [honor, setHonor] = useState<number>(0);
  const [favor, setFavor] = useState<number>(0);

  // ── Quota event internal sub-state ─────────────────────────
  const [quotaStep, setQuotaStep] = useState<QuotaStep>("decide");
  const [outcomeId, setOutcomeId] = useState<OutcomeId | null>(null);

  // ── Letter event internal sub-state ────────────────────────
  const [letterStep, setLetterStep] = useState<LetterStep>("decide");
  const [letterChoice, setLetterChoice] = useState<"help" | "push" | null>(null);
  // null = letter not yet seen → use Eleanor's base intro. After the
  // letter resolves it's true/false → drives the warm/worried override.
  const [helpedTheBoy, setHelpedTheBoy] = useState<boolean | null>(null);

  // ── Messina event internal sub-state ───────────────────────
  const [messinaStep, setMessinaStep] = useState<MessinaStep>("decide");
  const [messinaOutcomeId, setMessinaOutcomeId] = useState<MessinaOutcomeId | null>(null);
  // null = Messina not yet resolved → no Barbarossa intro tint. After
  // resolution: 'plundered' (path A, gate-wrong→hardball) tints him
  // grave; 'spared' (path B, clean gate, gate-wrong→pull-back) tints
  // him approving. Pull-back is grouped with spared because Hugh did
  // not actually plunder.
  const [messinaResult, setMessinaResult] = useState<"plundered" | "spared" | null>(null);

  // ── Barbarossa warning flag: persists for the rest of the run, ─
  // set only on a clean (no-fail) encounter. The Acre beat reads
  // this to decide whether the player has the prophecy in hand.
  const [barbarossaWarningHeard, setBarbarossaWarningHeard] = useState<boolean>(false);

  // ── Acre event internal sub-state ──────────────────────────
  const [acreStep, setAcreStep] = useState<AcreStep>("decide");
  const [acreOutcomeId, setAcreOutcomeId] = useState<AcreOutcomeId | null>(null);

  // ── Acre clean-run flag: set only on the "hold" path AND only
  // when the player heard Barbarossa's warning. Persists for the
  // rest of the run and drives Richard's IMPRESSED greeting tier.
  const [acreCleanRun, setAcreCleanRun] = useState<boolean>(false);

  // ── Richard tier: locked when his sage encounter begins so the ─
  // greeting and envoy line stay matched even though the +2/+2
  // correct-answer reward fires between them. null until locked.
  const [richardTier, setRichardTier] = useState<RichardTier | null>(null);

  // ── Saladin bearing: set by player choice in saladinBearing, then
  // locked. Drives Saladin's intro override and per-question lead-ins.
  const [bearingTier, setBearingTier] = useState<BearingTier | null>(null);
  // Persistent flag for the homecoming reveal (TBD). True iff path B.
  const [honoredSaladin, setHonoredSaladin] = useState<boolean>(false);

  // ── Sage encounter state (persists across all sages) ───────
  const [streak, setStreak] = useState<number>(0);
  const [sagePoints, setSagePoints] = useState<number>(0);
  const [completedSageIds, setCompletedSageIds] = useState<Set<string>>(() => new Set());
  const [activeSage, setActiveSage] = useState<Sage | null>(null);

  // ── Existing GameJuice: floating numbers + screen shake ────
  const { floats, spawn } = useFloatingNumbers();
  const { shakeClass, shake } = useScreenShake();

  // DEV: no real progress engine yet — pass 1.0 so any uncompleted sage is
  // eligible. Real engine wiring will pass actual journey progress.
  const nextSage = getNextSage(1.0, completedSageIds);

  // Shuffle the history question once per component mount.
  const shuffledHistory = useMemo(
    () => shuffleChoices([...QUOTA_HISTORY_QUESTION.choices], QUOTA_HISTORY_QUESTION.correctIndex),
    [],
  );
  const shuffledMessinaHistory = useMemo(
    () => shuffleChoices([...MESSINA_HISTORY_QUESTION.choices], MESSINA_HISTORY_QUESTION.correctIndex),
    [],
  );

  // ── Apply a delta set + fire GameJuice (float per nonzero, shake). ─
  const applyMeters = (d: MeterDeltas, sh: "light" | "medium" | "heavy") => {
    if (d.competence) { setCompetence((v) => v + d.competence!); spawn(d.competence, "competence"); }
    if (d.honor)      { setHonor((v) => v + d.honor!);          spawn(d.honor,      "honor"); }
    if (d.favor)      { setFavor((v) => v + d.favor!);          spawn(d.favor,      "favor"); }
    shake(sh);
  };

  // ── Quota handlers ─────────────────────────────────────────
  const handleQuotaDecide = (id: "refuse" | "comply" | "elder") => {
    if (id === "refuse") {
      applyMeters(QUOTA_DELTAS.refuse, QUOTA_SHAKE.refuse);
      setOutcomeId("refuse"); setQuotaStep("outcome");
    } else if (id === "comply") {
      applyMeters(QUOTA_DELTAS.comply, QUOTA_SHAKE.comply);
      setOutcomeId("comply"); setQuotaStep("outcome");
    } else {
      setQuotaStep("history");
    }
  };

  const handleHistoryAnswer = (i: number) => {
    if (i === shuffledHistory.correctIndex) {
      applyMeters(QUOTA_DELTAS.elderRight, QUOTA_SHAKE.elderRight);
      setOutcomeId("elderRight"); setQuotaStep("outcome");
    } else {
      // Immediate competence dock; then forced second choice.
      applyMeters(QUOTA_DELTAS.elderWrongInit, QUOTA_SHAKE.elderWrongInit);
      setQuotaStep("forcedChoice");
    }
  };

  const handleForcedChoice = (id: "hardball" | "walkAway") => {
    if (id === "hardball") {
      applyMeters(QUOTA_DELTAS.elderHardball, QUOTA_SHAKE.elderHardball);
      setOutcomeId("elderHardball");
    } else {
      applyMeters(QUOTA_DELTAS.elderWalkAway, QUOTA_SHAKE.elderWalkAway);
      setOutcomeId("elderWalkAway");
    }
    setQuotaStep("outcome");
  };

  const handleQuotaContinue = () => {
    // Always route through the letter event next — it's the on-ramp
    // that explains how Eleanor comes to know Hugh.
    setPhase("letter");
  };

  // ── Letter handlers ────────────────────────────────────────
  const handleLetterDecide = (id: "help" | "push") => {
    const deltas = LETTER_DELTAS[id];
    const sh = LETTER_SHAKE[id];
    if (sh) applyMeters(deltas, sh);
    setLetterChoice(id);
    setHelpedTheBoy(id === "help");
    setLetterStep("outcome");
  };

  const handleLetterContinue = () => {
    if (nextSage) {
      enterSage(nextSage);
    } else {
      setPhase("interlude");
    }
  };

  // ── Messina handlers ───────────────────────────────────────
  const handleMessinaDecide = (id: "plunder" | "refuse" | "gate") => {
    if (id === "plunder") {
      applyMeters(MESSINA_DELTAS.plunder, MESSINA_SHAKE.plunder);
      setMessinaOutcomeId("plunder");
      setMessinaResult("plundered");
      setMessinaStep("outcome");
    } else if (id === "refuse") {
      applyMeters(MESSINA_DELTAS.refuse, MESSINA_SHAKE.refuse);
      setMessinaOutcomeId("refuse");
      setMessinaResult("spared");
      setMessinaStep("outcome");
    } else {
      setMessinaStep("history");
    }
  };

  const handleMessinaHistoryAnswer = (i: number) => {
    if (i === shuffledMessinaHistory.correctIndex) {
      applyMeters(MESSINA_DELTAS.gateRight, MESSINA_SHAKE.gateRight);
      setMessinaOutcomeId("gateRight");
      setMessinaResult("spared");
      setMessinaStep("outcome");
    } else {
      applyMeters(MESSINA_DELTAS.gateWrongInit, MESSINA_SHAKE.gateWrongInit);
      setMessinaStep("forcedChoice");
    }
  };

  const handleMessinaForcedChoice = (id: "hardball" | "pullBack") => {
    if (id === "hardball") {
      applyMeters(MESSINA_DELTAS.gateHardball, MESSINA_SHAKE.gateHardball);
      setMessinaOutcomeId("gateHardball");
      setMessinaResult("plundered");
    } else {
      applyMeters(MESSINA_DELTAS.gatePullBack, MESSINA_SHAKE.gatePullBack);
      setMessinaOutcomeId("gatePullBack");
      setMessinaResult("spared");
    }
    setMessinaStep("outcome");
  };

  const handleMessinaContinue = () => {
    if (nextSage) {
      enterSage(nextSage);
    } else {
      setPhase("interlude");
    }
  };

  // ── Acre handlers ──────────────────────────────────────────
  const handleAcreDecide = (id: "assault" | "hold" | "split") => {
    if (id === "assault") {
      applyMeters(ACRE_DELTAS.assault, ACRE_SHAKE.assault);
      setAcreOutcomeId("assault");
    } else if (id === "split") {
      applyMeters(ACRE_DELTAS.split, ACRE_SHAKE.split);
      setAcreOutcomeId("split");
    } else {
      // hold — forks on barbarossaWarningHeard. With the warning the
      // player knows what they're doing → bigger reward + clean-run
      // flag. Without it, they guess right but pay for the guessing.
      if (barbarossaWarningHeard) {
        applyMeters(ACRE_DELTAS.holdWith, ACRE_SHAKE.holdWith);
        setAcreCleanRun(true);
        setAcreOutcomeId("holdWith");
      } else {
        applyMeters(ACRE_DELTAS.holdWithout, ACRE_SHAKE.holdWithout);
        setAcreOutcomeId("holdWithout");
      }
    }
    setAcreStep("outcome");
  };

  const handleAcreContinue = () => {
    setPhase("interlude");
  };

  // ── Saladin bearing handler ────────────────────────────────
  const handleSaladinBearing = (tier: BearingTier) => {
    applyMeters(SALADIN_BEARING_DELTAS[tier], SALADIN_BEARING_SHAKE[tier]);
    setBearingTier(tier);
    if (tier === "respect") setHonoredSaladin(true);
    // Hand off to the sage encounter with the tier locked.
    setPhase("sageEncounter");
  };

  // Per-sage intro tinting. Eleanor reads helpedTheBoy; Barbarossa
  // reads messinaResult; Richard reads the locked richardTier.
  // Other sages get no override.
  let sageIntroOverride: string | undefined;
  if (activeSage?.id === "eleanor" && helpedTheBoy !== null) {
    sageIntroOverride = helpedTheBoy
      ? `"${ELEANOR_INTRO_OVERRIDES.warm}"`
      : `"${ELEANOR_INTRO_OVERRIDES.worried}"`;
  } else if (activeSage?.id === "barbarossa" && messinaResult !== null) {
    sageIntroOverride = messinaResult === "plundered"
      ? `"${BARBAROSSA_INTRO_OVERRIDES.plundered}"`
      : `"${BARBAROSSA_INTRO_OVERRIDES.spared}"`;
  } else if (activeSage?.id === "richard" && richardTier !== null) {
    // Richard-only: keep the base intro (the barley moment) and append
    // the tinted greeting, so both land in one continuous panel. Eleanor
    // and Barbarossa overrides remain pure replacements by design.
    sageIntroOverride = `${activeSage.intro}\n\n"${RICHARD_GREETINGS[richardTier]}"`;
  } else if (activeSage?.id === "saladin" && bearingTier !== null) {
    // Replace Saladin's stock intro with the post-bearing "beat after
    // choosing" — the bearing scene-setter (in saladinBearing) already
    // covers entering the camp, so the stock intro would duplicate.
    sageIntroOverride = SALADIN_INTRO_OVERRIDES[bearingTier];
  } else if (activeSage?.id === "imad") {
    // Saladin's handoff narration replaces Imad's stock intro — it
    // leads Hugh deeper into the camp and ends with him arriving at
    // Imad's tent of books. The stock intro is now redundant.
    sageIntroOverride = IMAD_INTRO_HANDOFF;
  }

  // Per-question lead-ins (currently Saladin only). Lookup keyed on
  // active sage; null when no tinted lead-ins apply.
  const sageQuestionLeadIns: [string?, string?] | undefined =
    activeSage?.id === "saladin" && bearingTier !== null
      ? SALADIN_QUESTION_LEAD_INS[bearingTier]
      : undefined;

  // Lock per-sage state at sage entry. For Richard, captures the tier
  // synchronously so the greeting (computed on the first render after
  // entry) matches the envoy line shown after the +2/+2 reward.
  const enterSage = (sage: Sage) => {
    if (sage.id === "richard") {
      setRichardTier(computeRichardTier(acreCleanRun, honor, favor));
    }
    setActiveSage(sage);
    // Saladin routes to the bearing choice first; everyone else goes
    // directly to the question flow. bearingTier is set inside that
    // phase before sageEncounter renders.
    setPhase(sage.id === "saladin" ? "saladinBearing" : "sageEncounter");
  };

  // ── Opening (panels 1–4, tap-to-advance) ───────────────────
  if (phase === "opening") {
    const panel = OPENING_PANELS[panelIndex];
    const isLast = panelIndex === OPENING_PANELS.length - 1;
    return (
      <div className="h-screen bg-stone-900 text-stone-100 overflow-y-auto" style={{ fontFamily: "'Georgia', serif" }}>
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          <button
            type="button"
            onClick={() => {
              if (isLast) { setPanelIndex(0); setPhase("banner"); }
              else setPanelIndex((i) => i + 1);
            }}
            className="block w-full text-left space-y-3 focus:outline-none focus:ring-2 focus:ring-amber-700/40 rounded-lg p-1 -m-1"
          >
            <OpeningPanel src={panel.src} alt={`Opening panel ${panelIndex + 1}`} />
            <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
              <p className="text-stone-200 text-sm leading-relaxed italic">{panel.text}</p>
            </div>
            <p className="text-center text-stone-500 text-xs italic">
              tap to continue · {panelIndex + 1} / {OPENING_PANELS.length}
            </p>
          </button>
          <button onClick={onBack} className="block w-full text-stone-500 hover:text-stone-300 text-xs mt-3">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── The Banner (panel 5; two-button choice, NOT tap-to-advance) ─
  if (phase === "banner") {
    return (
      <div className="h-screen bg-stone-900 text-stone-100 overflow-y-auto" style={{ fontFamily: "'Georgia', serif" }}>
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          <h1 className="text-2xl font-bold text-amber-400">The Banner</h1>
          <OpeningPanel src="/backgrounds/crusades/opening/panel_05.png" alt="The Banner" />
          {/* Reused amber/stone two-button block from the original prologue.
              Tapping anywhere else on the screen does NOT advance — only these
              two buttons resolve the choice. */}
          <div className="space-y-2 pt-1">
            <button
              onClick={() => { setCoerced(false); setPanelIndex(0); setPhase("goodbyeWilling"); }}
              className="w-full py-3 bg-amber-800 hover:bg-amber-700 rounded font-bold transition-colors text-left px-4"
            >
              Take the cross.
              <div className="text-xs font-normal text-amber-300 mt-1">
                Hugh accepts, plainly, not begrudging.
              </div>
            </button>
            <button
              onClick={() => { setCoerced(true); setPanelIndex(0); setPhase("goodbyeCoerced"); }}
              className="w-full py-3 bg-stone-700 hover:bg-stone-600 rounded font-bold transition-colors text-left px-4"
            >
              Refuse.
              <div className="text-xs font-normal text-stone-300 mt-1">
                "I will not go."
              </div>
            </button>
            <button onClick={onBack} className="block w-full text-stone-500 hover:text-stone-300 text-xs mt-3">← Back to Campaigns</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Goodbye flows (tap-to-advance, either willing or coerced) ─
  if (phase === "goodbyeWilling" || phase === "goodbyeCoerced") {
    const panels = phase === "goodbyeWilling" ? GOODBYE_WILLING_PANELS : GOODBYE_COERCED_PANELS;
    const panel = panels[panelIndex];
    const isLast = panelIndex === panels.length - 1;
    return (
      <div className="h-screen bg-stone-900 text-stone-100 overflow-y-auto" style={{ fontFamily: "'Georgia', serif" }}>
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          <button
            type="button"
            onClick={() => {
              if (isLast) { setPanelIndex(0); setPhase("quota"); }
              else setPanelIndex((i) => i + 1);
            }}
            className="block w-full text-left space-y-3 focus:outline-none focus:ring-2 focus:ring-amber-700/40 rounded-lg p-1 -m-1"
          >
            <OpeningPanel src={panel.src} alt={`Goodbye panel ${panelIndex + 1}`} />
            <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
              <p className="text-stone-200 text-sm leading-relaxed italic">{panel.text}</p>
            </div>
            <p className="text-center text-stone-500 text-xs italic">
              tap to continue · {panelIndex + 1} / {panels.length}
            </p>
          </button>
          <button onClick={onBack} className="block w-full text-stone-500 hover:text-stone-300 text-xs mt-3">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── The Quota (decide → [history → forcedChoice?] → outcome) ─
  if (phase === "quota") {
    const outcome = outcomeId ? QUOTA_OUTCOMES[outcomeId] : null;
    return (
      <div
        className={`h-screen bg-stone-900 text-stone-100 overflow-y-auto ${shakeClass}`}
        style={{ fontFamily: "'Georgia', serif" }}
      >
        {/* Floating numbers overlay — fixed center, pointer-events-none, z-50. */}
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 pointer-events-none z-50">
          <FloatingNumbers floats={floats} />
        </div>

        <div className="max-w-2xl mx-auto p-4 space-y-3">
          {/* Header: location stamp + live meter readout */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-amber-400 uppercase tracking-wider">France, 1190 · The Quota</p>
            <MeterReadout competence={competence} honor={honor} favor={favor} />
          </div>

          {/* ── Decide step ── */}
          {quotaStep === "decide" && (
            <>
              <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
                <p className="text-stone-300 text-sm leading-relaxed italic">{QUOTA_HOOK}</p>
              </div>
              <div className="border border-indigo-700/60 rounded-lg p-3 bg-indigo-950/40 space-y-2">
                {QUOTA_DECIDE_BUTTONS.map((b, i) => (
                  <button
                    key={b.id}
                    onClick={() => handleQuotaDecide(b.id)}
                    className="w-full text-left text-sm px-3 py-2.5 rounded-lg border bg-indigo-900/60 hover:bg-indigo-800/80 border-indigo-700/40 hover:border-indigo-600/60 transition-all"
                    style={{ fontFamily: "'Georgia', serif" }}
                  >
                    <span className="text-indigo-300 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                    <span className="font-bold text-stone-200">{b.label}</span>
                    <span className="block text-stone-400 italic mt-1 ml-5">{b.line}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── History step (path C only) ── */}
          {quotaStep === "history" && (
            <>
              <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
                <p className="text-stone-300 text-sm leading-relaxed italic">{QUOTA_HISTORY_QUESTION.prompt}</p>
              </div>
              <div className="border border-indigo-700/60 rounded-lg p-3 bg-indigo-950/40">
                <p className="text-xs text-indigo-300 font-bold uppercase tracking-wider mb-3">📜 Recall</p>
                <div className="space-y-2">
                  {shuffledHistory.choices.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => handleHistoryAnswer(i)}
                      className="w-full text-left text-sm px-3 py-2.5 rounded-lg border bg-indigo-900/60 hover:bg-indigo-800/80 border-indigo-700/40 hover:border-indigo-600/60 transition-all"
                      style={{ fontFamily: "'Georgia', serif" }}
                    >
                      <span className="text-indigo-300 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Forced-choice step (wrong history answer fallback) ── */}
          {quotaStep === "forcedChoice" && (
            <>
              <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
                <p className="text-stone-300 text-sm leading-relaxed italic">{QUOTA_FORCED_SETUP}</p>
              </div>
              <div className="border border-indigo-700/60 rounded-lg p-3 bg-indigo-950/40 space-y-2">
                {QUOTA_FORCED_BUTTONS.map((b, i) => (
                  <button
                    key={b.id}
                    onClick={() => handleForcedChoice(b.id)}
                    className="w-full text-left text-sm px-3 py-2.5 rounded-lg border bg-indigo-900/60 hover:bg-indigo-800/80 border-indigo-700/40 hover:border-indigo-600/60 transition-all"
                    style={{ fontFamily: "'Georgia', serif" }}
                  >
                    <span className="text-indigo-300 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                    <span className="font-bold text-stone-200">{b.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── Outcome step: narration beat + marshal's report-back ── */}
          {quotaStep === "outcome" && outcome && (
            <>
              <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
                <p className="text-stone-300 text-sm leading-relaxed italic">{outcome.narration}</p>
              </div>
              <div className="border border-stone-600 rounded-lg p-3 bg-stone-800/60">
                <p className="text-xs text-stone-400 font-bold uppercase tracking-wider mb-1">The King's Marshal</p>
                <p className="text-stone-200 text-sm leading-relaxed italic">"{MARSHAL_LINES[outcome.marshal]}"</p>
              </div>
              <button
                onClick={handleQuotaContinue}
                className="w-full py-2.5 bg-amber-800 hover:bg-amber-700 rounded-lg text-sm font-bold transition-colors"
                style={{ fontFamily: "'Georgia', serif" }}
              >
                Continue
              </button>
            </>
          )}

          <p className="text-[10px] text-stone-500 text-center font-mono">
            coerced: {coerced ? "true" : "false"} · campaign: {CrusadesCampaign.id}
          </p>
          <button onClick={onBack} className="block mx-auto text-xs text-stone-500 hover:text-stone-300 transition-colors mt-2">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── The Letter (breather between quota and Eleanor) ────────
  if (phase === "letter") {
    return (
      <div
        className={`h-screen bg-stone-900 text-stone-100 overflow-y-auto ${shakeClass}`}
        style={{ fontFamily: "'Georgia', serif" }}
      >
        {/* Floating numbers overlay — fixed center, pointer-events-none, z-50. */}
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 pointer-events-none z-50">
          <FloatingNumbers floats={floats} />
        </div>

        <div className="max-w-2xl mx-auto p-4 space-y-3">
          {/* Header: location stamp + live meter readout */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-amber-400 uppercase tracking-wider">France · On the March</p>
            <MeterReadout competence={competence} honor={honor} favor={favor} />
          </div>

          {/* ── Decide step ── */}
          {letterStep === "decide" && (
            <>
              <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
                <p className="text-stone-300 text-sm leading-relaxed italic">{LETTER_HOOK}</p>
              </div>
              {/* Boy's line — small italic dialogue beat between the hook and the choices. */}
              <div className="pl-4 border-l-2 border-stone-700">
                <p className="text-stone-300 text-sm leading-relaxed italic">"{LETTER_BOY_LINE}"</p>
              </div>
              <div className="border border-indigo-700/60 rounded-lg p-3 bg-indigo-950/40 space-y-2">
                {LETTER_BUTTONS.map((b, i) => (
                  <button
                    key={b.id}
                    onClick={() => handleLetterDecide(b.id)}
                    className="w-full text-left text-sm px-3 py-2.5 rounded-lg border bg-indigo-900/60 hover:bg-indigo-800/80 border-indigo-700/40 hover:border-indigo-600/60 transition-all"
                    style={{ fontFamily: "'Georgia', serif" }}
                  >
                    <span className="text-indigo-300 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                    <span className="font-bold text-stone-200">{b.label}</span>
                    <span className="block text-stone-400 italic mt-1 ml-5">{b.line}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── Outcome step ── */}
          {letterStep === "outcome" && letterChoice === "help" && (
            <>
              <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
                <p className="text-stone-300 text-sm leading-relaxed italic">{LETTER_HELP_OUTCOME.lead}</p>
              </div>
              {/* The in-world letter, set apart as an artifact. */}
              <div className="border-l-4 border-amber-700/40 bg-amber-100/5 pl-4 py-3 pr-3">
                <p className="text-stone-100 text-sm leading-relaxed italic" style={{ fontFamily: "'Georgia', serif" }}>
                  {LETTER_HELP_OUTCOME.letter}
                </p>
              </div>
              <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
                {LETTER_HELP_OUTCOME.aftermath.split("\n\n").map((para, i) => (
                  <p key={i} className={`text-stone-300 text-sm leading-relaxed italic ${i > 0 ? "mt-3" : ""}`}>{para}</p>
                ))}
              </div>
              <button
                onClick={handleLetterContinue}
                className="w-full py-2.5 bg-amber-800 hover:bg-amber-700 rounded-lg text-sm font-bold transition-colors"
                style={{ fontFamily: "'Georgia', serif" }}
              >
                Continue
              </button>
            </>
          )}

          {letterStep === "outcome" && letterChoice === "push" && (
            <>
              <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
                <p className="text-stone-300 text-sm leading-relaxed italic">{LETTER_PUSH_OUTCOME}</p>
              </div>
              <button
                onClick={handleLetterContinue}
                className="w-full py-2.5 bg-amber-800 hover:bg-amber-700 rounded-lg text-sm font-bold transition-colors"
                style={{ fontFamily: "'Georgia', serif" }}
              >
                Continue
              </button>
            </>
          )}

          <button onClick={onBack} className="block mx-auto text-xs text-stone-500 hover:text-stone-300 transition-colors mt-2">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── Messina (decide → [history → forcedChoice?] → outcome) ─
  if (phase === "messina") {
    const outcome = messinaOutcomeId ? MESSINA_OUTCOMES[messinaOutcomeId] : null;
    return (
      <div
        className={`h-screen bg-stone-900 text-stone-100 overflow-y-auto ${shakeClass}`}
        style={{ fontFamily: "'Georgia', serif" }}
      >
        {/* Floating numbers overlay — fixed center, pointer-events-none, z-50. */}
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 pointer-events-none z-50">
          <FloatingNumbers floats={floats} />
        </div>

        <div className="max-w-2xl mx-auto p-4 space-y-3">
          {/* Header: location stamp + live meter readout */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-amber-400 uppercase tracking-wider">Sicily, 1190 · Messina</p>
            <MeterReadout competence={competence} honor={honor} favor={favor} />
          </div>

          {/* ── Decide step ── */}
          {messinaStep === "decide" && (
            <>
              <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
                <p className="text-stone-300 text-sm leading-relaxed italic">{MESSINA_HOOK}</p>
              </div>
              <div className="border border-indigo-700/60 rounded-lg p-3 bg-indigo-950/40 space-y-2">
                {MESSINA_DECIDE_BUTTONS.map((b, i) => (
                  <button
                    key={b.id}
                    onClick={() => handleMessinaDecide(b.id)}
                    className="w-full text-left text-sm px-3 py-2.5 rounded-lg border bg-indigo-900/60 hover:bg-indigo-800/80 border-indigo-700/40 hover:border-indigo-600/60 transition-all"
                    style={{ fontFamily: "'Georgia', serif" }}
                  >
                    <span className="text-indigo-300 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                    <span className="font-bold text-stone-200">{b.label}</span>
                    <span className="block text-stone-400 italic mt-1 ml-5">{b.line}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── History step (path C only) ── */}
          {messinaStep === "history" && (
            <>
              <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
                <p className="text-stone-300 text-sm leading-relaxed italic">{MESSINA_HISTORY_QUESTION.prompt}</p>
              </div>
              <div className="border border-indigo-700/60 rounded-lg p-3 bg-indigo-950/40">
                <p className="text-xs text-indigo-300 font-bold uppercase tracking-wider mb-3">📜 Recall</p>
                <div className="space-y-2">
                  {shuffledMessinaHistory.choices.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => handleMessinaHistoryAnswer(i)}
                      className="w-full text-left text-sm px-3 py-2.5 rounded-lg border bg-indigo-900/60 hover:bg-indigo-800/80 border-indigo-700/40 hover:border-indigo-600/60 transition-all"
                      style={{ fontFamily: "'Georgia', serif" }}
                    >
                      <span className="text-indigo-300 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Forced-choice step (wrong history answer fallback) ── */}
          {messinaStep === "forcedChoice" && (
            <>
              <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
                <p className="text-stone-300 text-sm leading-relaxed italic">{MESSINA_FORCED_SETUP}</p>
              </div>
              <div className="border border-indigo-700/60 rounded-lg p-3 bg-indigo-950/40 space-y-2">
                {MESSINA_FORCED_BUTTONS.map((b, i) => (
                  <button
                    key={b.id}
                    onClick={() => handleMessinaForcedChoice(b.id)}
                    className="w-full text-left text-sm px-3 py-2.5 rounded-lg border bg-indigo-900/60 hover:bg-indigo-800/80 border-indigo-700/40 hover:border-indigo-600/60 transition-all"
                    style={{ fontFamily: "'Georgia', serif" }}
                  >
                    <span className="text-indigo-300 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                    <span className="font-bold text-stone-200">{b.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── Outcome step: narration only (marshal reaction baked in). ── */}
          {messinaStep === "outcome" && outcome && (
            <>
              <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
                <p className="text-stone-300 text-sm leading-relaxed italic">{outcome.narration}</p>
              </div>
              <button
                onClick={handleMessinaContinue}
                className="w-full py-2.5 bg-amber-800 hover:bg-amber-700 rounded-lg text-sm font-bold transition-colors"
                style={{ fontFamily: "'Georgia', serif" }}
              >
                Continue
              </button>
            </>
          )}

          <button onClick={onBack} className="block mx-auto text-xs text-stone-500 hover:text-stone-300 transition-colors mt-2">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── The Sicily Crossing (3-card click-through; no choice) ─
  if (phase === "sicily") {
    const panel = SICILY_PANELS[panelIndex];
    const isLast = panelIndex === SICILY_PANELS.length - 1;
    return (
      <div className="h-screen bg-stone-900 text-stone-100 overflow-y-auto" style={{ fontFamily: "'Georgia', serif" }}>
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          <p className="text-xs text-amber-400 uppercase tracking-wider">The Sicily Crossing</p>
          <button
            type="button"
            onClick={() => {
              if (isLast) { setPanelIndex(0); setPhase("messina"); }
              else setPanelIndex((i) => i + 1);
            }}
            className="block w-full text-left space-y-3 focus:outline-none focus:ring-2 focus:ring-amber-700/40 rounded-lg p-1 -m-1"
          >
            <OpeningPanel src={panel.src} alt={`Sicily panel ${panelIndex + 1}`} />
            <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
              <p className="text-stone-200 text-sm leading-relaxed italic">{panel.text}</p>
            </div>
            <p className="text-center text-stone-500 text-xs italic">
              tap to continue · {panelIndex + 1} / {SICILY_PANELS.length}
            </p>
          </button>
          <button onClick={onBack} className="block w-full text-stone-500 hover:text-stone-300 text-xs mt-3">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── Sage encounter (any sage from getNextSage) ─────────────
  if (phase === "sageEncounter" && activeSage) {
    const sageInFlight = activeSage; // local capture for closure-narrowed type
    return (
      <div className="h-screen bg-stone-900 text-stone-100 overflow-y-auto" style={{ fontFamily: "'Georgia', serif" }}>
        <div className="max-w-2xl mx-auto p-4 space-y-3">
          <p className="text-xs text-amber-400 uppercase tracking-wider">
            Sage Encounter · threshold {Math.round(sageInFlight.threshold * 100)}%
          </p>
          <SageEncounterV2
            sage={sageInFlight}
            currentStreak={streak}
            introOverride={sageIntroOverride}
            questionLeadIns={sageQuestionLeadIns}
            onComplete={(result) => {
              setStreak(result.newStreak);
              setSagePoints((p) => p + result.totalPoints);
              setCompletedSageIds((prev) => {
                const next = new Set(prev);
                next.add(sageInFlight.id);
                return next;
              });
              setActiveSage(null);

              // Per-sage post-encounter routing.
              if (sageInFlight.id === "eleanor") {
                setPanelIndex(0);
                setPhase("sicily");
              } else if (sageInFlight.id === "barbarossa") {
                // Warning only fires when both questions resolved correctly
                // (firstTry or secondTry). On any failure his existing
                // scold/fail strings already carry the teaching beat.
                // Either way the next phase is Acre — the warning is just
                // an extra panel on the clean path.
                const cleanRun = result.outcomes.every(
                  (o) => o.result === "firstTry" || o.result === "secondTry",
                );
                if (cleanRun) {
                  setBarbarossaWarningHeard(true);
                  setPhase("barbarossaWarning");
                } else {
                  setPhase("acre");
                }
              } else if (sageInFlight.id === "richard") {
                // Q2 ("winning isn't holding") — meter reward fires on
                // any non-failed correct answer. The envoy assignment
                // fires regardless of right/wrong.
                const q2 = result.outcomes[1];
                if (q2.result === "firstTry" || q2.result === "secondTry") {
                  applyMeters(RICHARD_CORRECT_DELTAS, "light");
                }
                setPhase("richardEnvoy");
              } else if (sageInFlight.id === "saladin") {
                // Ride-back beat fires regardless of question outcomes;
                // it's the pivot from outward arc to the homecoming arc.
                setPhase("saladinClosing");
              } else if (sageInFlight.id === "imad") {
                // Imad's closing monologue — the final sage beat before
                // the battle climax / journey home arc (TBD).
                setPhase("imadClosing");
              } else {
                setPhase("interlude");
              }
            }}
          />
          <button onClick={onBack} className="block mx-auto text-xs text-stone-500 hover:text-stone-300 transition-colors mt-2">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── Barbarossa's warning (fires only on a clean encounter) ─
  if (phase === "barbarossaWarning") {
    return (
      <div className="h-screen bg-stone-900 text-stone-100 overflow-y-auto" style={{ fontFamily: "'Georgia', serif" }}>
        <div className="max-w-2xl mx-auto p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-amber-400 uppercase tracking-wider">Frederick Barbarossa · A Final Word</p>
            <MeterReadout competence={competence} honor={honor} favor={favor} />
          </div>
          <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
            <p className="text-stone-200 text-sm leading-relaxed italic">"{BARBAROSSA_WARNING_TEXT}"</p>
          </div>
          <button
            onClick={() => setPhase("acre")}
            className="w-full py-2.5 bg-amber-800 hover:bg-amber-700 rounded-lg text-sm font-bold transition-colors"
            style={{ fontFamily: "'Georgia', serif" }}
          >
            Continue
          </button>
          <button onClick={onBack} className="block mx-auto text-xs text-stone-500 hover:text-stone-300 transition-colors mt-2">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── The Acre siege (standalone decision; payoff to barbarossa) ─
  if (phase === "acre") {
    const outcome = acreOutcomeId ? ACRE_OUTCOMES[acreOutcomeId] : null;
    return (
      <div
        className={`h-screen bg-stone-900 text-stone-100 overflow-y-auto ${shakeClass}`}
        style={{ fontFamily: "'Georgia', serif" }}
      >
        {/* Floating numbers overlay — fixed center, pointer-events-none, z-50. */}
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 pointer-events-none z-50">
          <FloatingNumbers floats={floats} />
        </div>

        <div className="max-w-2xl mx-auto p-4 space-y-3">
          {/* Header: location stamp + live meter readout */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-amber-400 uppercase tracking-wider">Acre, 1191 · The Siege</p>
            <MeterReadout competence={competence} honor={honor} favor={favor} />
          </div>

          {/* ── Decide step ── */}
          {acreStep === "decide" && (
            <>
              <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
                <p className="text-stone-300 text-sm leading-relaxed italic">{ACRE_HOOK}</p>
              </div>
              <div className="border border-indigo-700/60 rounded-lg p-3 bg-indigo-950/40 space-y-2">
                {ACRE_DECIDE_BUTTONS.map((b, i) => (
                  <button
                    key={b.id}
                    onClick={() => handleAcreDecide(b.id)}
                    className="w-full text-left text-sm px-3 py-2.5 rounded-lg border bg-indigo-900/60 hover:bg-indigo-800/80 border-indigo-700/40 hover:border-indigo-600/60 transition-all"
                    style={{ fontFamily: "'Georgia', serif" }}
                  >
                    <span className="text-indigo-300 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                    <span className="font-bold text-stone-200">{b.label}</span>
                    <span className="block text-stone-400 italic mt-1 ml-5">{b.line}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── Outcome step: narration only (casualties land in prose). ── */}
          {acreStep === "outcome" && outcome && (
            <>
              <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
                <p className="text-stone-300 text-sm leading-relaxed italic">{outcome.narration}</p>
              </div>
              <button
                onClick={handleAcreContinue}
                className="w-full py-2.5 bg-amber-800 hover:bg-amber-700 rounded-lg text-sm font-bold transition-colors"
                style={{ fontFamily: "'Georgia', serif" }}
              >
                Continue
              </button>
            </>
          )}

          <button onClick={onBack} className="block mx-auto text-xs text-stone-500 hover:text-stone-300 transition-colors mt-2">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── Richard's envoy assignment (fires after his sage; always) ─
  if (phase === "richardEnvoy") {
    return (
      <div className="h-screen bg-stone-900 text-stone-100 overflow-y-auto" style={{ fontFamily: "'Georgia', serif" }}>
        <div className="max-w-2xl mx-auto p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-amber-400 uppercase tracking-wider">Richard I · The Envoy</p>
            <MeterReadout competence={competence} honor={honor} favor={favor} />
          </div>
          <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
            <p className="text-stone-200 text-sm leading-relaxed italic">
              {richardTier !== null ? `"${RICHARD_ENVOY_LINES[richardTier]}"` : ""}
            </p>
          </div>
          <button
            onClick={() => setPhase("interlude")}
            className="w-full py-2.5 bg-amber-800 hover:bg-amber-700 rounded-lg text-sm font-bold transition-colors"
            style={{ fontFamily: "'Georgia', serif" }}
          >
            Continue
          </button>
          <button onClick={onBack} className="block mx-auto text-xs text-stone-500 hover:text-stone-300 transition-colors mt-2">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── Saladin closing beat (post-encounter; hands off to Imad) ──
  if (phase === "saladinClosing") {
    const text = bearingTier !== null ? SALADIN_CLOSING_BEATS[bearingTier] : "";
    return (
      <div className="h-screen bg-stone-900 text-stone-100 overflow-y-auto" style={{ fontFamily: "'Georgia', serif" }}>
        <div className="max-w-2xl mx-auto p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-amber-400 uppercase tracking-wider">The Ride Back · Toward Home</p>
            <MeterReadout competence={competence} honor={honor} favor={favor} />
          </div>
          <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
            {text.split("\n\n").map((para, i) => (
              <p
                key={i}
                className={`text-stone-200 text-sm leading-relaxed italic ${i > 0 ? "mt-3" : ""}`}
              >
                {para}
              </p>
            ))}
          </div>
          <button
            onClick={() => {
              // Hands off to Imad (the next sage by threshold) rather
              // than dropping back to interlude.
              if (nextSage) enterSage(nextSage);
              else setPhase("interlude");
            }}
            className="w-full py-2.5 bg-amber-800 hover:bg-amber-700 rounded-lg text-sm font-bold transition-colors"
            style={{ fontFamily: "'Georgia', serif" }}
          >
            Continue
          </button>
          <button onClick={onBack} className="block mx-auto text-xs text-stone-500 hover:text-stone-300 transition-colors mt-2">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── Imad closing monologue (post-encounter; final sage before TBD) ─
  if (phase === "imadClosing") {
    return (
      <div className="h-screen bg-stone-900 text-stone-100 overflow-y-auto" style={{ fontFamily: "'Georgia', serif" }}>
        <div className="max-w-2xl mx-auto p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-amber-400 uppercase tracking-wider">Imad ad-Din · The Shape of the War</p>
            <MeterReadout competence={competence} honor={honor} favor={favor} />
          </div>
          <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
            {IMAD_CLOSING_TEXT.split("\n\n").map((para, i) => (
              <p
                key={i}
                className={`text-stone-200 text-sm leading-relaxed italic ${i > 0 ? "mt-3" : ""}`}
              >
                {para}
              </p>
            ))}
          </div>
          <button
            onClick={() => setPhase("interlude")}
            className="w-full py-2.5 bg-amber-800 hover:bg-amber-700 rounded-lg text-sm font-bold transition-colors"
            style={{ fontFamily: "'Georgia', serif" }}
          >
            Continue
          </button>
          <button onClick={onBack} className="block mx-auto text-xs text-stone-500 hover:text-stone-300 transition-colors mt-2">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── Saladin bearing choice (pre-encounter; tints Saladin's frame) ─
  if (phase === "saladinBearing") {
    return (
      <div
        className={`h-screen bg-stone-900 text-stone-100 overflow-y-auto ${shakeClass}`}
        style={{ fontFamily: "'Georgia', serif" }}
      >
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 pointer-events-none z-50">
          <FloatingNumbers floats={floats} />
        </div>

        <div className="max-w-2xl mx-auto p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-amber-400 uppercase tracking-wider">Saladin's Camp · Under the White Flag</p>
            <MeterReadout competence={competence} honor={honor} favor={favor} />
          </div>

          <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
            {SALADIN_SCENE_SETTER.split("\n\n").map((para, i) => (
              <p
                key={i}
                className={`text-stone-300 text-sm leading-relaxed italic ${i > 0 ? "mt-3" : ""}`}
              >
                {para}
              </p>
            ))}
          </div>

          <div className="border border-indigo-700/60 rounded-lg p-3 bg-indigo-950/40 space-y-2">
            {SALADIN_BEARING_BUTTONS.map((b, i) => (
              <button
                key={b.id}
                onClick={() => handleSaladinBearing(b.id)}
                className="w-full text-left text-sm px-3 py-2.5 rounded-lg border bg-indigo-900/60 hover:bg-indigo-800/80 border-indigo-700/40 hover:border-indigo-600/60 transition-all"
                style={{ fontFamily: "'Georgia', serif" }}
              >
                <span className="text-indigo-300 font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
                <span className="font-bold text-stone-200">{b.label}</span>
                <span className="block text-stone-400 italic mt-1 ml-5">{b.line}</span>
              </button>
            ))}
          </div>

          <button onClick={onBack} className="block mx-auto text-xs text-stone-500 hover:text-stone-300 transition-colors mt-2">← Back to Campaigns</button>
        </div>
      </div>
    );
  }

  // ── Interlude (post-sage placeholder; next event lands here) ─
  return (
    <div className="h-screen bg-stone-900 text-stone-100 overflow-y-auto" style={{ fontFamily: "'Georgia', serif" }}>
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-amber-400 uppercase tracking-wider">The Road Continues</p>
          <MeterReadout competence={competence} honor={honor} favor={favor} />
        </div>
        <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
          <p className="text-stone-400 text-sm leading-relaxed italic">
            The column moves on. Days pass without event worth recording.
          </p>
        </div>

        {/* DEV trigger + observability. Real engine will replace this. */}
        <div className="space-y-1.5">
          <button
            onClick={() => {
              if (nextSage) {
                enterSage(nextSage);
              }
            }}
            disabled={!nextSage}
            className="w-full py-2 bg-amber-900 hover:bg-amber-800 disabled:bg-stone-800 disabled:text-stone-500 disabled:cursor-not-allowed rounded text-sm font-bold transition-colors"
          >
            {nextSage ? `DEV · trigger next sage: ${nextSage.name}` : "DEV · all sages encountered"}
          </button>
          <p className="text-[10px] text-stone-500 text-center font-mono">
            streak: {streak} · sage points: {sagePoints} · coerced: {coerced ? "true" : "false"} · messina: {messinaResult ?? "none"} · barbarossaWarningHeard: {barbarossaWarningHeard ? "true" : "false"} · acreCleanRun: {acreCleanRun ? "true" : "false"} · richardTier: {richardTier ?? "none"} · bearingTier: {bearingTier ?? "none"} · honoredSaladin: {honoredSaladin ? "true" : "false"} · completed: {completedSageIds.size === 0 ? "none" : Array.from(completedSageIds).join(", ")}
          </p>
        </div>

        <button onClick={onBack} className="block mx-auto text-xs text-stone-500 hover:text-stone-300 transition-colors">← Back to Campaigns</button>
      </div>
    </div>
  );
}
