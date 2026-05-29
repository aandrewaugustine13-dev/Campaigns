import type { ExamQuestion } from "../../FinalExam";

// ════════════════════════════════════════════════════════════════
// CHISHOLM TRAIL — final exam (TEKS check for understanding)
//
// Ten questions whose answers are all derivable from material the
// player encountered in play: event text, the trail feed, sage
// advice, and the in-event trivia. A student who actually engaged
// can pass; a clicker has to go back through the run to find them.
// teksRef values target Texas History (Grade 7) strands.
// ════════════════════════════════════════════════════════════════

export const CHISHOLM_FINAL_EXAM: ExamQuestion[] = [
  {
    id: "fx1",
    question: "Why did trail crews search for safer fords instead of deep river crossings?",
    choices: ["To save rope", "To reduce cattle losses", "To avoid drawing maps", "To rest the horses"],
    correctIndex: 1,
    fact: "Deep crossings could scatter or drown cattle, so scouts searched for safer fords.",
    teksRef: "TEKS 7.4",
  },
  {
    id: "fx2",
    question: "What did the chuck wagon carry on a long drive?",
    choices: ["Food, tools, and medical supplies", "Railroad parts", "Gold bars", "Spare cattle"],
    correctIndex: 0,
    fact: "Chuck wagons carried food, tools, and medical supplies for the crew.",
    teksRef: "TEKS 7.4",
  },
  {
    id: "fx3",
    question: "Why did crews rest cattle on good grass before market?",
    choices: ["To train the horses", "To keep herd health and weight up", "To slow the trip", "To save ammunition"],
    correctIndex: 1,
    fact: "Rest and grazing helped cattle keep weight, which raised their value at the railhead.",
    teksRef: "TEKS 7.12",
  },
  {
    id: "fx4",
    question: "What made night storms especially dangerous on the trail?",
    choices: ["They could trigger a stampede", "They washed away maps", "They dried out boots", "They scared the cook"],
    correctIndex: 0,
    fact: "Sudden noise and lightning could trigger a stampede that scattered the herd.",
    teksRef: "TEKS 7.4",
  },
  {
    id: "fx5",
    question: "Why did drovers pay tolls when crossing the Native Nations' territory?",
    choices: ["It bought new wagons", "It changed the weather", "Treaties gave Native Nations legal control of the routes", "It was a tax on beef"],
    correctIndex: 2,
    fact: "Treaties gave Native Nations legal control over key routes, so passage required paying tolls.",
    teksRef: "TEKS 7.11",
  },
  {
    id: "fx6",
    question: "Where did the Chisholm Trail drives end, and why there?",
    choices: ["San Antonio, the starting market", "Abilene, Kansas, because of the railhead", "Dallas, the largest city", "New Orleans, the nearest port"],
    correctIndex: 1,
    fact: "Drives pushed north to Abilene because the Kansas Pacific railhead could ship cattle east to market.",
    teksRef: "TEKS 7.12",
  },
  {
    id: "fx7",
    question: "Why was the herd worth far more in Kansas than in Texas?",
    choices: ["Texas cattle were smaller", "The rail connection opened eastern markets and higher prices", "Kansas had better grass", "The cattle were a different breed"],
    correctIndex: 1,
    fact: "Texas had a glut of cheap cattle; reaching the rail in Kansas connected them to eastern markets paying many times more per head.",
    teksRef: "TEKS 7.12",
  },
  {
    id: "fx8",
    question: "What was the main trade-off when the boss chose a hard, fast pace?",
    choices: ["More distance but worse herd condition and morale", "More cash but fewer horses", "Better weather but less grass", "More ammo but heavier wagons"],
    correctIndex: 0,
    fact: "Pushing the pace covered more ground but drained herd condition, morale, and supplies faster.",
    teksRef: "TEKS 7.12",
  },
  {
    id: "fx9",
    question: "Why did a shortage of cowboys put the whole drive at risk?",
    choices: ["No one could cook", "Too few hands meant the herd was harder to control and protect", "The wagon could not move", "The trail closed"],
    correctIndex: 1,
    fact: "With too few hands, herd control and night security slipped, and losses climbed.",
    teksRef: "TEKS 7.4",
  },
  {
    id: "fx10",
    question: "Roughly how long and how far was a typical Chisholm Trail drive?",
    choices: ["About 100 miles over a week", "About 800 miles over two to three months", "About 3,000 miles over a year", "About 400 miles over two weeks"],
    correctIndex: 1,
    fact: "A typical drive ran roughly 800 miles and took two to three months from Texas to the Kansas railheads.",
    teksRef: "TEKS 7.9",
  },
];
