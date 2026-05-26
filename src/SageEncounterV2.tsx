import { useMemo, useState } from "react";
import type { Sage, AnswerOutcome } from "./campaigns/crusades/sageEncounters";
import { resolveQuestion } from "./campaigns/crusades/sageEncounters";

// Fisher–Yates: returns the shuffled choices plus the new index of the
// originally-correct answer. Used to randomize answer positions per
// question so the correct answer isn't always slot A.
export function shuffleChoices(
  choices: string[],
  correctIndex: number,
): { choices: string[]; correctIndex: number } {
  const indices = choices.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return {
    choices: indices.map((i) => choices[i]),
    correctIndex: indices.indexOf(correctIndex),
  };
}

// ═══════════════════════════════════════════════════════════════
// SAGE ENCOUNTER V2 — two-question, two-attempt resolution flow
//
// Q1 (recall) → Q2 (significance), each with up to two attempts.
// Calls resolveQuestion() from the sage module, threads the live
// streak from Q1 → Q2, and emits the aggregate result on done.
//
// No greeting/advice/bio — the new Sage interface intentionally
// omits those; narration lives in the per-question response
// strings (approve / scold / fail).
//
// The old SageEncounter.tsx (single-question SageEncounterData
// shape) is still used by the Chisholm campaign and is unchanged.
// ═══════════════════════════════════════════════════════════════

export interface EncounterResult {
  totalPoints: number;
  newStreak: number;
  outcomes: [AnswerOutcome, AnswerOutcome];
}

interface Props {
  sage: Sage;
  currentStreak: number;
  onComplete: (result: EncounterResult) => void;
  // When set, replaces sage.intro in the intro phase. Used to tint a
  // sage's opening based on upstream story state (e.g. Eleanor's
  // warm-or-worried variant keyed off "The Letter"). Other phases
  // are unaffected.
  introOverride?: string;
  // Optional italic lead-in sentence shown above each question's prompt.
  // Tuple positions correspond to questionIndex (0 = recall, 1 = significance).
  // A position left undefined renders no lead-in for that question.
  questionLeadIns?: [string?, string?];
}

type LocalPhase = "intro" | "ask" | "outcome";

export default function SageEncounterV2({ sage, currentStreak, onComplete, introOverride, questionLeadIns }: Props) {
  const [questionIndex, setQuestionIndex] = useState<0 | 1>(0);
  const [attempt, setAttempt] = useState<1 | 2>(1);
  const [localPhase, setLocalPhase] = useState<LocalPhase>("intro");
  const [wrongFirstChoice, setWrongFirstChoice] = useState<number | null>(null);
  const [firstOutcome, setFirstOutcome] = useState<AnswerOutcome | null>(null);
  const [lastOutcome, setLastOutcome] = useState<AnswerOutcome | null>(null);
  // liveStreak: starts at currentStreak, updates between Q1 and Q2 so Q2
  // sees the streak Q1 produced. Final value is reported via onComplete.
  const [liveStreak, setLiveStreak] = useState<number>(currentStreak);

  const question = sage.questions[questionIndex];
  // Shuffle once per (sage, question). Stable across the two attempts so
  // the disabled wrong-answer slot stays put. Re-shuffles on replay.
  const shuffled = useMemo(
    () => shuffleChoices(question.choices, question.correctIndex),
    [question],
  );

  const handleAnswer = (choiceIndex: number) => {
    const correct = choiceIndex === shuffled.correctIndex;

    // First-try wrong: silently advance to attempt 2 (do not resolve yet).
    if (attempt === 1 && !correct) {
      setWrongFirstChoice(choiceIndex);
      setAttempt(2);
      return;
    }

    const outcome = resolveQuestion(question, sage, attempt, correct, liveStreak);
    setLastOutcome(outcome);
    setLiveStreak(outcome.newStreak);
    setLocalPhase("outcome");
  };

  const handleContinue = () => {
    if (questionIndex === 0) {
      // Q1 done → set up Q2.
      setFirstOutcome(lastOutcome);
      setQuestionIndex(1);
      setAttempt(1);
      setWrongFirstChoice(null);
      setLastOutcome(null);
      setLocalPhase("ask");
      return;
    }

    // Q2 done → emit aggregate result.
    const q1 = firstOutcome;
    const q2 = lastOutcome;
    if (!q1 || !q2) return; // defensive: should never happen
    onComplete({
      totalPoints: q1.points + q2.points,
      newStreak: q2.newStreak,
      outcomes: [q1, q2],
    });
  };

  return (
    <div className="space-y-3">
      {/* ── Header: name + register + question progress ─────── */}
      <div
        className="rounded-lg p-3"
        style={{
          background: "linear-gradient(135deg, #2d1b11, #1a1408)",
          border: "2px solid #3d2516",
        }}
      >
        <h2
          className="text-lg font-bold text-amber-400 leading-tight"
          style={{ fontFamily: "'Georgia', serif" }}
        >
          {sage.name}
        </h2>
        <p className="text-xs text-amber-600 font-bold uppercase tracking-wider">
          {sage.register === "parley" ? "Parley" : "Personal Audience"}
          {localPhase !== "intro" && (
            <>
              {" · "}Question {questionIndex + 1} of 2
              {" · "}streak {liveStreak}
            </>
          )}
        </p>
      </div>

      {/* ── Phase: Intro — scene-setter shown once before Q1 ── */}
      {localPhase === "intro" && (
        <div className="space-y-3">
          <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
            {(introOverride ?? sage.intro).split("\n\n").map((para, i) => (
              <p
                key={i}
                className={`text-stone-300 text-sm leading-relaxed italic ${i > 0 ? "mt-3" : ""}`}
              >
                {para}
              </p>
            ))}
          </div>
          <button
            onClick={() => setLocalPhase("ask")}
            className="w-full py-2.5 bg-amber-800 hover:bg-amber-700 rounded-lg text-sm font-bold transition-colors"
            style={{ fontFamily: "'Georgia', serif" }}
          >
            Continue
          </button>
        </div>
      )}

      {/* ── Phase: Ask ──────────────────────────────────────── */}
      {localPhase === "ask" && (
        <div className="border border-indigo-700/60 rounded-lg p-3 bg-indigo-950/40 space-y-3">
          <p className="text-xs text-indigo-300 font-bold uppercase tracking-wider">
            {question.type === "recall" ? "📜 Recall" : "💭 Significance"}
            {attempt === 2 && (
              <span className="ml-2 text-amber-400">· Second attempt</span>
            )}
          </p>
          {questionLeadIns?.[questionIndex] && (
            <p className="text-stone-400 text-sm leading-relaxed italic">
              {questionLeadIns[questionIndex]}
            </p>
          )}
          <p className="text-stone-200 text-sm leading-relaxed">
            {question.prompt}
          </p>
          <div className="space-y-2">
            {shuffled.choices.map((choice, i) => {
              const isDisabled = attempt === 2 && wrongFirstChoice === i;
              return (
                <button
                  key={i}
                  disabled={isDisabled}
                  onClick={() => handleAnswer(i)}
                  className={`w-full text-left text-sm px-3 py-2.5 rounded-lg border transition-all ${
                    isDisabled
                      ? "bg-stone-900/40 border-stone-700/40 text-stone-600 line-through cursor-not-allowed"
                      : "bg-indigo-900/60 hover:bg-indigo-800/80 border-indigo-700/40 hover:border-indigo-600/60"
                  }`}
                  style={{ fontFamily: "'Georgia', serif" }}
                >
                  <span className="text-indigo-300 font-bold mr-2">
                    {String.fromCharCode(65 + i)}.
                  </span>
                  {choice}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Phase: Outcome ──────────────────────────────────── */}
      {localPhase === "outcome" && lastOutcome && (
        <div className="space-y-3">
          {/* Result banner — colored by outcome.result */}
          <div
            className="rounded-lg p-3 text-center"
            style={{
              background:
                lastOutcome.result === "firstTry"
                  ? "linear-gradient(135deg, rgba(22,101,52,0.3), rgba(20,83,45,0.2))"
                  : lastOutcome.result === "secondTry"
                  ? "linear-gradient(135deg, rgba(120,53,15,0.3), rgba(146,64,14,0.2))"
                  : "linear-gradient(135deg, rgba(127,29,29,0.3), rgba(153,27,27,0.2))",
              border: `2px solid ${
                lastOutcome.result === "firstTry"
                  ? "rgba(34,197,94,0.4)"
                  : lastOutcome.result === "secondTry"
                  ? "rgba(245,158,11,0.4)"
                  : "rgba(239,68,68,0.4)"
              }`,
            }}
          >
            <p
              className={`text-lg font-bold ${
                lastOutcome.result === "firstTry"
                  ? "text-emerald-400"
                  : lastOutcome.result === "secondTry"
                  ? "text-amber-400"
                  : "text-red-400"
              }`}
              style={{ fontFamily: "'Georgia', serif" }}
            >
              {lastOutcome.result === "firstTry"
                ? "Correct"
                : lastOutcome.result === "secondTry"
                ? "Correct, second try"
                : "Failed"}
            </p>
            <p className="text-xs text-stone-300 mt-1">
              {lastOutcome.points >= 0 ? `+${lastOutcome.points}` : lastOutcome.points} points
              {lastOutcome.result === "failed" && lastOutcome.embarrassed && (
                <span className="ml-2 text-red-400">· embarrassed</span>
              )}
            </p>
          </div>

          {/* The response string — the narration beat */}
          <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20 space-y-2">
            <p className="text-stone-300 text-sm leading-relaxed italic">
              {lastOutcome.response}
            </p>
            {question.explanation && (
              <p className="text-stone-400 text-xs leading-relaxed border-t border-amber-800/20 pt-2">
                <span className="text-amber-600/80 font-bold uppercase tracking-widest mr-2 text-[10px]">Context</span>
                {question.explanation}
              </p>
            )}
          </div>

          <button
            onClick={handleContinue}
            className="w-full py-2.5 bg-amber-800 hover:bg-amber-700 rounded-lg text-sm font-bold transition-colors"
            style={{ fontFamily: "'Georgia', serif" }}
          >
            {questionIndex === 0
              ? `${sage.name.split(" ")[0]} has another question`
              : "Continue"}
          </button>
        </div>
      )}
    </div>
  );
}
