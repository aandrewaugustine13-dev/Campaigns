#!/usr/bin/env npx tsx
// ════════════════════════════════════════════════════════════════
// QUIZ-STAGE proof (Option A) — parts (a) and (b).
//
//   1. validateNarrativeQuiz ACCEPTS a well-formed bank whose answers are
//      embedded in the reviewSummary, and REJECTS malformed banks (too few
//      questions, out-of-range correctIndex, empty summary), WARNING when a
//      keyed answer is not recoverable from the summary.
//   2. narrativePlanToCampaign(plan, identity, quiz) populates eventTrivia (the
//      final-exam bank) + reviewSummary, and validate() accepts it.
//   3. FACT GATE catches a planted fabrication: factGate.isQuizKeyed locates a
//      grader's claim on a KEYED-correct answer over a NARRATIVE campaign's
//      dossier (→ the hard-reject path), and does NOT fire for narrative-only text.
//
// No model call. Run with:  npm run test:narrative-quiz
// ════════════════════════════════════════════════════════════════

import type { NarrativePlan } from "./storyPlan.js";
import { validateNarrativeQuiz, type NarrativeQuizBundle } from "./narrativeQuiz.js";
import { narrativePlanToCampaign, type NarrativeIdentity } from "./narrativeCampaign.js";
import { validate } from "./validate.js";
import { isQuizKeyed, type FactClaim } from "./factGate.js";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`); }
}

const plan: NarrativePlan = {
  throughline: "A republic votes itself into a war and salvages pride from a needless battle.",
  meaning: "The Battle of New Orleans was militarily pointless yet politically everything.",
  beats: [
    { id: "beat_declare", role: "cause", title: "The Vote for War",
      scene: "Congress votes for war against the strongest navy on earth.",
      significance: "It sets the unready nation on its course.",
      choices: [
        { text: "Vote for war", result: "The declaration passes.", stake: 6, endingFragment: "You voted for war." },
        { text: "Prepare first", result: "You are branded a coward.", stake: -4, endingFragment: "You begged for time." },
      ], phaseHint: 0.1, included: true },
    { id: "beat_neworleans", role: "climax", title: "The Battle of New Orleans",
      scene: "Behind cotton bales, the line shatters the British assault.",
      significance: "The lopsided victory — and the hinge of the irony.",
      choices: [
        { text: "Hold the line", result: "The charge breaks.", stake: 9, endingFragment: "You held the line." },
        { text: "Sally out", result: "You gamble it away.", stake: -6, endingFragment: "You marched out." },
      ], phaseHint: 0.85, included: true },
    { id: "beat_ghent", role: "resolution", title: "Word of the Treaty",
      scene: "Peace was signed before the battle was ever fought.",
      significance: "The resolution that makes the irony land.",
      phaseHint: 0.96, included: true },
  ],
};

const identity: NarrativeIdentity = {
  id: "war-of-1812", title: "The War of 1812", subtitle: plan.throughline,
  introBody: "You sit in Congress as the drums of war begin.",
  trailFeedOpener: "The War Hawks call for blood.",
  historicalContext: "The war settled little but reshaped national feeling.",
};

// A well-formed bank whose keyed answers all appear VERBATIM in the summary.
const goodQuiz: NarrativeQuizBundle = {
  questions: [
    { id: "q_treaty", question: "Where was the treaty ending the war signed?",
      choices: ["Ghent", "Paris", "London"], correctIndex: 0, fact: "The Treaty of Ghent ended the war." },
    { id: "q_moot", question: "Why was the Battle of New Orleans militarily moot?",
      choices: ["The treaty was already signed", "The British never landed"], correctIndex: 0,
      fact: "Peace had been signed at Ghent weeks before the battle." },
    { id: "q_who", question: "Who led the American defense at New Orleans?",
      choices: ["Andrew Jackson", "James Madison"], correctIndex: 0, fact: "Andrew Jackson commanded the defense." },
    { id: "q_navy", question: "Which navy did the young republic declare war on?",
      choices: ["The British Royal Navy", "The French fleet"], correctIndex: 0,
      fact: "The republic declared war on the British Royal Navy." },
  ],
  reviewSummary:
    "The young republic declared war on the British Royal Navy in 1812. The fighting went badly until, behind cotton bales at New Orleans, Andrew Jackson shattered the British assault. The irony is that the treaty was already signed — the Treaty of Ghent had ended the war in Europe weeks before the battle was ever fought, in London's view a settled matter — so the great victory changed nothing on paper, yet it made a national hero.",
};

function main() {
  console.log("\n=== Quiz stage (Option A): validation + assembly + fact gate ===\n");

  // 1) Validator accepts the good bank, rejects malformed ones.
  console.log("validateNarrativeQuiz:");
  const goodErrors = validateNarrativeQuiz(goodQuiz).filter((f) => f.level === "error");
  check("a well-formed, answer-embedded bank passes", goodErrors.length === 0,
    goodErrors.map((f) => `[${f.field}] ${f.message}`).join("; "));
  const goodWarns = validateNarrativeQuiz(goodQuiz).filter((f) => f.level === "warn");
  check("no embedding warnings (every keyed answer is recoverable from the summary)", goodWarns.length === 0,
    goodWarns.map((f) => `[${f.field}] ${f.message}`).join("; "));

  const tooFew = validateNarrativeQuiz({ ...goodQuiz, questions: goodQuiz.questions.slice(0, 2) }).filter((f) => f.level === "error");
  check("a bank with < 4 questions is rejected", tooFew.some((f) => f.field === "questions"));

  const badIndex = validateNarrativeQuiz({
    ...goodQuiz,
    questions: [{ ...goodQuiz.questions[0], correctIndex: 9 }, ...goodQuiz.questions.slice(1)],
  }).filter((f) => f.level === "error");
  check("an out-of-range correctIndex is rejected", badIndex.some((f) => f.field.includes("correctIndex")));

  const noSummary = validateNarrativeQuiz({ ...goodQuiz, reviewSummary: "" }).filter((f) => f.level === "error");
  check("an empty reviewSummary is rejected", noSummary.some((f) => f.field === "reviewSummary"));

  const notEmbedded = validateNarrativeQuiz({
    ...goodQuiz,
    reviewSummary: "A short recap that mentions none of the specific keyed answers at all.",
  }).filter((f) => f.level === "warn");
  check("a keyed answer missing from the summary WARNS (study-aid gap)", notEmbedded.length > 0);
  console.log("");

  // 2) Assembly populates the final-exam bank + reviewSummary and validates.
  console.log("assembly into the campaign:");
  const data = narrativePlanToCampaign(plan, identity, goodQuiz);
  check("eventTrivia is populated with the quiz bank", data.eventTrivia.length === goodQuiz.questions.length);
  check("reviewSummary is set", data.reviewSummary === goodQuiz.reviewSummary);
  const report = validate(data);
  check("validate() accepts the quiz-bearing narrative campaign (0 errors)", report.failed === 0,
    report.findings.filter((f) => f.level === "error").map((f) => `[${f.field}] ${f.message}`).join("; "));
  console.log("");

  // 3) Fact gate — a planted KEYED fabrication is caught (hard-reject path).
  console.log("fact gate over the narrative dossier (isQuizKeyed):");
  // Plant a fabricated keyed answer: a (false) "Treaty of Paris of 1814" keyed correct.
  const fabricated = narrativePlanToCampaign(plan, identity, {
    ...goodQuiz,
    questions: [
      { id: "q_fab", question: "Which treaty ended the War of 1812?",
        choices: ["The Treaty of Paris of 1814", "The Treaty of Ghent"], correctIndex: 0,
        fact: "FABRICATED — the real treaty was the Treaty of Ghent." },
      ...goodQuiz.questions,
    ],
  });
  const keyedClaim: FactClaim = {
    quote: "The Treaty of Paris of 1814",
    why: "No such treaty ended the War of 1812; it was the Treaty of Ghent.",
    kind: "external", correct: "The War of 1812 was ended by the Treaty of Ghent (1814).",
  };
  check("a grader claim quoting the KEYED-correct (fabricated) answer is flagged quiz-keyed → HARD REJECT",
    isQuizKeyed(keyedClaim, fabricated) === true);

  const narrativeClaim: FactClaim = {
    quote: "Behind cotton bales, the line shatters the British assault.",
    why: "This is scene prose, not a quiz answer.",
    kind: "internal", correct: "n/a",
  };
  check("a claim quoting narrative-only text is NOT quiz-keyed (would ship-with-warnings, not hard-reject)",
    isQuizKeyed(narrativeClaim, fabricated) === false);
  console.log("");

  console.log(`=== ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

main();
