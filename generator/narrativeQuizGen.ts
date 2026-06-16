// ════════════════════════════════════════════════════════════════
// NARRATIVE-QUIZ GENERATION (the Anthropic call). Split from narrativeQuiz.ts so
// that module stays PURE (types + validator only) and browser-safe. Server/CLI
// side only. Mirrors storyPlanGen.ts: a sighted self-repair loop that feeds the
// validation errors back so the bank self-heals before it reaches the campaign.
// ════════════════════════════════════════════════════════════════

import Anthropic from "@anthropic-ai/sdk";
import { parseModelJson } from "./json.js";
import type { NarrativePlan } from "./storyPlan.js";
import {
  validateNarrativeQuiz,
  beatsDigest,
  type NarrativeQuizBundle,
  type QuizFinding,
} from "./narrativeQuiz.js";

const SYSTEM_PROMPT = `You write a standards-aligned end-of-unit ASSESSMENT for a first-person history story (a choose-your-own-adventure) that a student has just played. You are given the state standard, the student's grade, and the ORDERED story beats they actually experienced. You output ONLY a single JSON object. No prose, no markdown, no code fences.

WHAT YOU PRODUCE:
- "questions": a bank of multiple-choice questions for the closing exam. Each has: "id" (short stable kebab-case, unique), "question" (one sentence), "choices" (2-4 short answer options), "correctIndex" (0-based index of the correct option), and "fact" (1-2 sentences stating/justifying the correct answer — the explanation a student sees).
- "reviewSummary": flowing PROSE recap of this story and its history, about 300 words (NO MORE THAN ~325). It is the student's study aid AND the source the exam answers come from.

GROUND THE ASSESSMENT IN TWO THINGS AT ONCE:
1. WHAT THEY PLAYED. The beats below are the concrete moments the student lived through. Anchor questions in those events — the assessment should test the history they actually encountered, not trivia from outside the story.
2. THE STANDARD. The few beats cannot cover an entire standard alone. Use the standard to round out coverage: include the core facts, causes, and consequences the standard requires, choosing the ones the story's events set up.
Never test a fact the story did not teach and the summary does not contain.

ANSWER-EMBEDDING LAW (non-negotiable, mirrors the systems exam):
- "reviewSummary" MUST contain the full, specific correct answer to EVERY question. Recoverable means the EXACT tested specific appears, not gestured at: a NAME, NUMBER, DATE, or LAW that a question keys on must appear verbatim in the summary; an enumerated-list answer needs every item present. A general paraphrase of a specific answer FAILS.
- SELF-CHECK before finalizing: go through every question one at a time and find the exact phrase in your summary that gives a student the information to answer it. If you cannot point to one, the answer is MISSING — revise the summary to embed it (naturally, never labeled) before finalizing.

HISTORICAL HONESTY: every question, every keyed-correct answer, and every fact in the summary must be strictly true to the REAL history. A distractor (wrong choice) may be false — that is its job — but the keyed answer and the summary must never contain a fabrication. A student must never be graded on an invented fact.

READING LEVEL: write questions, choices, and summary at the given grade — plain, concrete language.

OUTPUT SHAPE (TypeScript for reference — output JSON only):
interface Question { id: string; question: string; choices: string[]; correctIndex: number; fact: string; }
interface QuizBundle { questions: Question[]; reviewSummary: string; }

Output ONLY the JSON object conforming to QuizBundle.`;

export interface NarrativeQuizInputs {
  /** The authoritative subject of the campaign. */
  topic: string;
  /** Student grade — sets the reading level. */
  grade?: string;
  /** How many exam questions to author. Default 6. */
  numQuestions?: number;
}

function buildUserMessage(
  standard: string,
  plan: NarrativePlan,
  inputs: NarrativeQuizInputs,
  priorErrors?: string[],
): string {
  const n = inputs.numQuestions ?? 6;
  const gradeLine = inputs.grade ? `\nGRADE (reading level): ${inputs.grade}` : "";
  const feedback = priorErrors && priorErrors.length
    ? `\nYOUR PREVIOUS ATTEMPT FAILED THESE CHECKS. Fix EVERY one, keeping the rest faithful to the rules (in particular: every keyed answer must appear verbatim in reviewSummary):\n${priorErrors.map((e) => `- ${e}`).join("\n")}\n`
    : "";

  return `Author the closing assessment for a campaign built on THIS standard:

SUBJECT (what this campaign is about): ${inputs.topic}
STANDARD (alignment): ${standard}${gradeLine}

THE STORY BEATS THE STUDENT PLAYED (anchor questions here, then use the standard to round out coverage):
${beatsDigest(plan)}

Write ${n} multiple-choice questions and a ~300-word reviewSummary that embeds every correct answer.
${feedback}
Output ONLY the JSON object conforming to QuizBundle.`;
}

export interface GenerateNarrativeQuizResult {
  data: NarrativeQuizBundle;
  raw: string;
  findings: QuizFinding[];
}

export async function generateNarrativeQuiz(
  standard: string,
  apiKey: string,
  plan: NarrativePlan,
  inputs: NarrativeQuizInputs,
  opts: { maxRepair?: number } = {},
): Promise<GenerateNarrativeQuizResult> {
  const client = new Anthropic({ apiKey });
  const maxRepair = opts.maxRepair ?? 2;
  const minQuestions = Math.max(4, (inputs.numQuestions ?? 6) - 1);

  let last!: GenerateNarrativeQuizResult;
  let priorErrors: string[] = [];
  for (let attempt = 0; attempt <= maxRepair; attempt++) {
    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(standard, plan, inputs, attempt > 0 ? priorErrors : undefined) }],
    });

    let rawText = "";
    stream.on("text", (t) => { rawText += t; });
    await stream.finalMessage();

    const data = parseModelJson<NarrativeQuizBundle>(rawText);
    const findings = validateNarrativeQuiz(data, { minQuestions });
    last = { data, raw: rawText, findings };

    const errors = findings.filter((f) => f.level === "error");
    if (errors.length === 0) return last;
    priorErrors = errors.map((f) => `${f.field}: ${f.message}`);
    if (attempt < maxRepair) console.warn(`[narrativeQuiz] attempt ${attempt + 1}/${maxRepair + 1}: ${errors.length} error(s) — repairing`);
  }
  return last;
}
