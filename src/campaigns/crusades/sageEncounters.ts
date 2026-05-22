// ═══════════════════════════════════════════════════════════════
// THIRD CRUSADE — sage encounter resolution system
// Two-attempt question flow with streak-scaled rewards and a
// position-weighted embarrassment roll on a both-wrong outcome.
//
// NOTE: This is the *resolution* module. The sage data list (the
// five historical-figure stubs at fixed thresholds) lives in
// ./sages.ts and uses the shared SageEncounterData shape from
// ../types. The types and logic below are intentionally local to
// this file — not yet wired into anything.
// ═══════════════════════════════════════════════════════════════

// ---- Global tuning knobs (all reward/penalty math lives here) ----
const SAGE_TUNING = {
  firstTryBaseReward: 100,      // base points for a first-try correct answer
  secondTryReward: 40,          // flat reward for second-try correct (no multiplier)
  streakStep: 0.5,              // multiplier grows by this each unbroken first-try answer
  // streak 0 = 1.0x, streak 1 = 1.5x, streak 2 = 2.0x, etc.
  embarrassmentChance: 0.5,     // 50/50 roll on a both-wrong answer
} as const;

export type EncounterRegister = 'personal' | 'parley';
export type QuestionType = 'recall' | 'significance';

export interface SageQuestion {
  prompt: string;
  type: QuestionType;
  choices: string[];
  correctIndex: number;
  responses: {
    approve: string;   // first-try correct
    scold: string;     // second-try correct, the teaching beat
    fail: string;      // both tries wrong
  };
}

export interface Sage {
  id: string;
  name: string;
  threshold: number;            // % progress where this sage appears (0-1)
  register: EncounterRegister;  // drives narration framing + penalty weight
  penaltyWeight: number;        // points lost on a failed embarrassment roll
  intro: string;                // scene-setting paragraph shown once before Q1
  questions: [SageQuestion, SageQuestion]; // exactly two: recall then significance
}

// ---- Resolution logic ----
export type AnswerOutcome =
  | { result: 'firstTry'; points: number; newStreak: number; response: string }
  | { result: 'secondTry'; points: number; newStreak: number; response: string }
  | { result: 'failed'; points: number; newStreak: number; response: string; embarrassed: boolean };

export function resolveQuestion(
  question: SageQuestion,
  sage: Sage,
  attempt: 1 | 2,
  correct: boolean,
  currentStreak: number
): AnswerOutcome {
  // First try, correct: full reward x multiplier, streak grows
  if (attempt === 1 && correct) {
    const multiplier = 1 + currentStreak * SAGE_TUNING.streakStep;
    return {
      result: 'firstTry',
      points: Math.round(SAGE_TUNING.firstTryBaseReward * multiplier),
      newStreak: currentStreak + 1,
      response: question.responses.approve,
    };
  }

  // Second try, correct: flat base reward, streak BREAKS, gentle scold
  if (attempt === 2 && correct) {
    return {
      result: 'secondTry',
      points: SAGE_TUNING.secondTryReward,
      newStreak: 0,
      response: question.responses.scold,
    };
  }

  // Both wrong: streak breaks, 50/50 position-scaled embarrassment
  const embarrassed = Math.random() < SAGE_TUNING.embarrassmentChance;
  return {
    result: 'failed',
    points: embarrassed ? -sage.penaltyWeight : 0,
    newStreak: 0,
    response: question.responses.fail,
    embarrassed,
  };
}

// ═══════════════════════════════════════════════════════════════
// SAGES — Third Crusade encounter list (two-question shape)
// Five sages, in ascending threshold order. Each carries an intro
// scene-setter shown once before Q1, then a recall question, then
// a significance question.
// ═══════════════════════════════════════════════════════════════

export const SAGES: Sage[] = [

  // ── 1. ELEANOR OF AQUITAINE (threshold 0.15) ────────────────
  {
    id: 'eleanor',
    name: 'Eleanor of Aquitaine',
    threshold: 0.15,
    register: 'personal',
    penaltyWeight: 10,
    intro:
      'An old woman sits wrapped in furs, sharp-eyed despite her years. This is Eleanor of Aquitaine, mother of King Richard and once queen of both France and England. She has summoned you before you march.',
    questions: [
      {
        prompt:
          '"Three years ago, a Muslim leader captured the holy city of Jerusalem from the Christians. That is why my son now goes to war. Do you recall the name of the man who took the city?"',
        type: 'recall',
        choices: ['Saladin', 'The Byzantine Emperor', 'Frederick Barbarossa', 'King Philip of France'],
        correctIndex: 0,
        responses: {
          approve: '"Saladin. Yes." Her jaw tightens. "Remember the name. You will hear it again before the end."',
          scold:   '"Saladin, child. The man who took the holy city. Know your enemy\'s name before you march at him."',
          fail:    '"You march to a war and don\'t know who holds the prize?" She sighs. "It is Saladin. Carry that with you."',
        },
      },
      {
        prompt:
          '"My son\'s soldiers are mostly poor men leaving their farms behind. The Church has offered them a powerful reward for going, one worth more to them than money. What did the Church promise?"',
        type: 'significance',
        choices: [
          'Forgiveness of their sins',
          'A castle of their own',
          'Gold from the king',
          'Freedom from taxes forever',
        ],
        correctIndex: 0,
        responses: {
          approve: '"Just so. They march for their souls. Faith moves armies, child. Never forget it."',
          scold:   '"Their sins, boy, forgiven. The Church promised heaven. That is why a poor man leaves his fields to die in the sun."',
          fail:    '"Not gold, not castles. Heaven. The promise of forgiveness is a wage no king could ever match."',
        },
      },
    ],
  },

  // ── 2. FREDERICK BARBAROSSA (threshold 0.35) ────────────────
  {
    id: 'barbarossa',
    name: 'Frederick Barbarossa',
    threshold: 0.35,
    register: 'personal',
    penaltyWeight: 25,
    intro:
      'A cold wind, and then a figure that should not be here: the ghost of Frederick Barbarossa, Holy Roman Emperor. He led the largest army of the crusade overland toward the Holy Land. He never arrived. The whole camp still whispers of his fate.',
    questions: [
      {
        prompt:
          '"I crossed a thousand miles with the mightiest army of all. Yet I died before I ever saw the Holy Land, and not in battle. I fell while crossing a river. How did I die?"',
        type: 'recall',
        choices: [
          'He drowned',
          'He was poisoned',
          'He fell from his horse',
          'He died of old age in his tent',
        ],
        correctIndex: 0,
        responses: {
          approve: '"Drowned. An emperor, felled by a river, not a sword." The shade laughs bitterly. "The road east kills more than any enemy blade."',
          scold:   '"I drowned, boy. I told you, in a river. The journey itself is the enemy you forget."',
          fail:    '"Poison? A fall?" The ghost shakes its head. "I drowned. I said as much. Listen better, or the road takes you too."',
        },
      },
      {
        prompt:
          '"My army was so vast that no fleet of ships could carry us all across the sea. So we were forced to travel the long, hard way instead. How did we reach the Holy Land?"',
        type: 'significance',
        choices: [
          'By marching overland on foot',
          'By swimming',
          'By building a giant bridge',
          'By tunneling underground',
        ],
        correctIndex: 0,
        responses: {
          approve: '"Overland. On foot, for months. And the marching destroyed us long before any battle could."',
          scold:   '"We walked, boy. Overland. There were never enough ships, so an army that size must march into the grave."',
          fail:    '"Swim? Tunnel?" The shade scoffs. "We marched. On foot. The long road, because no ship could hold us."',
        },
      },
    ],
  },

  // ── 3. RICHARD I (threshold 0.55) ───────────────────────────
  {
    id: 'richard',
    name: 'Richard I',
    threshold: 0.55,
    register: 'personal',
    penaltyWeight: 40,
    intro:
      'A broad-shouldered man in a battle-stained surcoat looks you over. This is King Richard the Lionheart of England, leader of the crusade. He is choosing men he can trust, and his eyes have settled on you.',
    questions: [
      {
        prompt:
          '"Before we could march south, we spent nearly a year laying siege to a great port city on the coast. Taking it cost us dearly. We made it our base. Which city was it?"',
        type: 'recall',
        choices: ['Acre', 'London', 'Cairo', 'Athens'],
        correctIndex: 0,
        responses: {
          approve: '"Acre. Good. You know the war you\'re fighting." He studies you. "I have need of a man who pays attention. Perhaps you."',
          scold:   '"Acre, man. The siege that cost us a year of blood. Know the ground you stand on."',
          fail:    '"You don\'t even know where we\'ve bled?" He frowns. "Acre. Remember it. A king cannot send a fool to speak for him."',
        },
      },
      {
        prompt:
          '"Saladin and I are enemies, and yet I am about to send messengers to his camp to bargain with him. Even at war, kings do this. What is the purpose of sending such messengers?"',
        type: 'significance',
        choices: [
          'To make a deal both sides can accept',
          'To surrender the army',
          'To start a bigger war',
          'To spy and then attack',
        ],
        correctIndex: 0,
        responses: {
          approve: '"Just so. Steel settles some things. Words settle the rest." He nods. "You will carry my words to him. Do not embarrass me."',
          scold:   '"To bargain, man. To make terms. Not every matter is won by the sword, even between enemies."',
          fail:    '"Surrender? No." Richard barks a laugh. "To make a deal. War and talk are two hands of the same body."',
        },
      },
    ],
  },

  // ── 4. SALADIN (threshold 0.75) ─────────────────────────────
  {
    id: 'saladin',
    name: 'Salah ad-Din Yusuf ibn Ayyub',
    threshold: 0.75,
    register: 'parley',
    penaltyWeight: 75,
    intro:
      "You are led into the enemy's camp as King Richard's messenger. Inside a great tent sits Saladin, Sultan of Egypt and Syria, the man your army came to fight. He is famous on both sides for his intelligence and his honor. He studies you with calm curiosity.",
    questions: [
      {
        prompt:
          '"Your king fights for Jerusalem. But the city is holy to my faith too. Muslims believe the Prophet Muhammad rose to heaven from that very place. To how many faiths is Jerusalem sacred?"',
        type: 'recall',
        choices: [
          'Three: Judaism, Christianity, and Islam',
          'Only Islam',
          'Only Christianity',
          'None, it is just a city',
        ],
        correctIndex: 0,
        responses: {
          approve: '"Three faiths, yes. Few of your countrymen trouble to learn it." He inclines his head. "A man who understands his enemy is rare."',
          scold:   '"Three, envoy. Jews, Christians, and Muslims all hold it sacred. That is why the city is so bitterly fought over."',
          fail:    '"Only yours?" His eyes cool. "Three faiths hold Jerusalem holy. Tell your king his men fight blind."',
        },
      },
      {
        prompt:
          '"When I recaptured Jerusalem, my advisors urged me to massacre the Christians inside, as crusaders had once massacred Muslims there. Instead I let them leave in peace. What does this choice show about me?"',
        type: 'significance',
        choices: [
          'That he valued mercy and honor, even toward enemies',
          'That he was too weak to fight',
          'That he was afraid of Richard',
          'That he had run out of soldiers',
        ],
        correctIndex: 0,
        responses: {
          approve: '"You see clearly, envoy. Mercy is not weakness. It is the hardest discipline a powerful man can keep."',
          scold:   '"Weakness?" A thin smile. "No. I spared them by choice. Mercy toward an enemy is a kind of strength."',
          fail:    '"You mistake mercy for fear." He turns away. "Then you have learned nothing in my tent. A pity."',
        },
      },
    ],
  },

  // ── 5. IMAD AD-DIN AL-ISFAHANI (threshold 0.90) ─────────────
  {
    id: 'imad',
    name: 'Imad ad-Din al-Isfahani',
    threshold: 0.90,
    register: 'parley',
    penaltyWeight: 90,
    intro:
      "At the edge of Saladin's court sits a man surrounded by books and papers: Imad ad-Din, the Sultan's secretary and historian. He records the events of the war. He is more interested in ideas than in swords, and he watches you with a scholar's sharp eye.",
    questions: [
      {
        prompt:
          '"During the centuries your Europe forgot the great thinkers of ancient Greece, their books were saved, translated, and studied in the libraries of my world. Where were the works of the ancient Greeks preserved?"',
        type: 'recall',
        choices: [
          'In the libraries of the Muslim world',
          'In English castles',
          'They were lost and never recovered',
          'Buried with the Greeks',
        ],
        correctIndex: 0,
        responses: {
          approve: '"Just so. Aristotle, Euclid, the great physicians, we kept them all. You will carry some of this knowledge home without knowing where it came from."',
          scold:   '"Here, scribe, in our libraries. The wisdom of the Greeks survived in Arabic while your monks copied only prayers."',
          fail:    '"Lost forever?" He shakes his head. "We preserved them. Your scholars will one day owe a debt to mine."',
        },
      },
      {
        prompt:
          '"When your crusaders go home, they will bring back more than wounds. They will carry new foods, new medicines, and new ideas from our world. What is it called when ideas and goods spread from one culture to another?"',
        type: 'significance',
        choices: [
          'Cultural diffusion',
          'A crusade',
          'A siege',
          'A pilgrimage',
        ],
        correctIndex: 0,
        responses: {
          approve: '"Cultural diffusion. Yes. War ends, scribe. But the ideas that cross between us endure for centuries. That is the true exchange."',
          scold:   '"It is called cultural diffusion, scribe, the spread of ideas between peoples. Remember the word. It outlasts every war."',
          fail:    '"Not a siege, not a pilgrimage." He almost pities you. "Cultural diffusion. The flow of ideas between worlds. Learn it."',
        },
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// HELPER — find the next sage that should fire
// Returns the lowest-threshold sage not yet in completedIds whose
// threshold the player has reached. Returns null when none remain.
// ═══════════════════════════════════════════════════════════════

export function getNextSage(
  progress: number,
  completedIds: Set<string>,
): Sage | null {
  const eligible = SAGES
    .filter((s) => !completedIds.has(s.id) && progress >= s.threshold)
    .sort((a, b) => a.threshold - b.threshold);
  return eligible[0] ?? null;
}
