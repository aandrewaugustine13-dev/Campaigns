import type { EventGateQuestion } from "./gameModels";

export const CHISHOLM_EVENT_TRIVIA: EventGateQuestion[] = [
  {
    id: "c1",
    question: "Why did trail crews avoid deep river crossings when possible?",
    choices: ["To save rope", "To reduce cattle losses", "To avoid maps"],
    correctIndex: 1,
    fact: "Deep crossings could scatter or drown cattle, so scouts searched for safer fords.",
  },
  {
    id: "c2",
    question: "What did a chuck wagon carry on long drives?",
    choices: ["Food and tools", "Railroad parts", "Gold bars"],
    correctIndex: 0,
    fact: "Chuck wagons carried food, tools, and medical supplies for the crew.",
  },
  {
    id: "c3",
    question: "Why did crews rest cattle on good grass?",
    choices: ["To train horses", "To grow beards", "To keep herd health up"],
    correctIndex: 2,
    fact: "Rest and grazing helped cattle keep weight before market.",
  },
  {
    id: "c4",
    question: "What risk made night storms dangerous?",
    choices: ["Stampedes", "Fog only", "Dry boots"],
    correctIndex: 0,
    fact: "Sudden noise and lightning could trigger a stampede.",
  },
  {
    id: "c5",
    question: "Why pay legal tolls in Nations territory?",
    choices: ["It was required for passage", "It bought new wagons", "It changed weather"],
    correctIndex: 0,
    fact: "Treaties gave Native Nations legal control over key routes.",
  },
];
