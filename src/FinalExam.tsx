import { useMemo, useState } from "react";
import CampaignLog from "./CampaignLog";

// ════════════════════════════════════════════════════════════════
// FinalExam — the end-of-campaign TEKS check for understanding.
//
// A mandatory, gated quiz. The player cannot reach the final results /
// grade until they pass. Design goals:
//   - Anti-clickthrough: no correctness is revealed DURING an attempt,
//     so a disengaged player cannot trial-and-error their way through.
//   - Findable answers: on failure the player is shown which questions
//     they missed (not the answers) and a "Review your trail" panel of
//     their own decision log, then may retake. The material to study is
//     the run they just played.
//   - Reinforcement on success: facts are revealed only after passing.
//
// Reused by Chisholm (App.tsx, stone styling) and the generic
// GeneratedCampaign engine (themed styling).
// ════════════════════════════════════════════════════════════════

export interface ExamQuestion {
  id: string;
  question: string;
  choices: string[];
  correctIndex: number;
  fact?: string;
  teksRef?: string;
}

export interface ExamDecisionEntry {
  day: number;
  event: string;
  choice: string;
  text?: string;
  detail?: string;
}

interface FinalExamProps {
  questions: ExamQuestion[];
  decisionLog?: ExamDecisionEntry[];
  /** Minimum correct answers required to pass. Default = 70% rounded up. */
  passThreshold?: number;
  /** Use theme-* classes (generated campaigns) instead of stone utilities. */
  themed?: boolean;
  title?: string;
  subtitle?: string;
  onPass: (correct: number, total: number) => void;
}

// Fisher–Yates copy.
function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// A question with its choices shuffled and the correct index remapped.
interface PreparedQuestion extends ExamQuestion {
  shuffledChoices: string[];
  shuffledCorrect: number;
}

function prepare(questions: ExamQuestion[]): PreparedQuestion[] {
  return shuffle(questions).map((q) => {
    const order = shuffle(q.choices.map((_, i) => i));
    return {
      ...q,
      shuffledChoices: order.map((i) => q.choices[i]),
      shuffledCorrect: order.indexOf(q.correctIndex),
    };
  });
}

export default function FinalExam({
  questions,
  decisionLog = [],
  passThreshold,
  themed = false,
  title = "Final Exam",
  subtitle = "Pass the check for understanding to complete the campaign.",
  onPass,
}: FinalExamProps) {
  const total = questions.length;
  const threshold = passThreshold ?? Math.ceil(total * 0.7);

  // Regenerated per attempt (attempt counter forces re-prepare on retake).
  const [attempt, setAttempt] = useState(0);
  const prepared = useMemo(() => prepare(questions), [questions, attempt]);

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]); // chosen shuffled index per question
  const [phase, setPhase] = useState<"taking" | "scored">("taking");
  const [showReview, setShowReview] = useState(false);

  const ui = themed
    ? {
        card: "theme-bg-card theme-border",
        inner: "theme-bg-card-inner theme-divider",
        text: "theme-text",
        muted: "theme-text-muted",
        accent: "theme-text-accent",
        btn: "theme-btn-action",
        choice: "theme-dialogue-accent",
      }
    : {
        card: "bg-stone-800 border-stone-700",
        inner: "bg-stone-900/60 border-stone-700",
        text: "text-stone-100",
        muted: "text-stone-300",
        accent: "text-amber-400",
        btn: "bg-amber-700 hover:bg-amber-600 text-white",
        choice: "bg-stone-700 hover:bg-stone-600 border-stone-600 text-stone-100",
      };

  const answerCurrent = (shuffledChoiceIndex: number) => {
    const nextAnswers = [...answers];
    nextAnswers[index] = shuffledChoiceIndex;
    setAnswers(nextAnswers);
    if (index + 1 < total) {
      setIndex(index + 1);
    } else {
      setPhase("scored");
    }
  };

  const correctCount = prepared.reduce(
    (sum, q, i) => sum + (answers[i] === q.shuffledCorrect ? 1 : 0),
    0,
  );
  const passed = correctCount >= threshold;

  const retake = () => {
    setAnswers([]);
    setIndex(0);
    setShowReview(false);
    setPhase("taking");
    setAttempt((a) => a + 1);
  };

  // ── Taking: one question at a time, no correctness feedback ──────
  if (phase === "taking") {
    const q = prepared[index];
    return (
      <div className={`border rounded-lg p-4 space-y-4 ${ui.card}`}>
        <div>
          <h2 className={`text-lg font-bold ${ui.accent}`}>{title}</h2>
          <p className={`text-xs ${ui.muted}`}>{subtitle}</p>
        </div>

        <div className={`w-full rounded-full h-1.5 ${themed ? "theme-bg-track" : "bg-stone-700"}`}>
          <div
            className={`h-1.5 rounded-full transition-all ${themed ? "" : "bg-amber-500"}`}
            style={{ width: `${(index / total) * 100}%`, backgroundColor: themed ? "var(--text-accent)" : undefined }}
          />
        </div>
        <p className={`text-xs font-bold uppercase tracking-wider ${ui.muted}`}>
          Question {index + 1} of {total}
          {q.teksRef ? ` · ${q.teksRef}` : ""}
        </p>

        <p className={`text-sm leading-relaxed ${ui.text}`}>{q.question}</p>

        <div className="space-y-2">
          {q.shuffledChoices.map((choice, i) => (
            <button
              key={i}
              onClick={() => answerCurrent(i)}
              className={`w-full text-left text-sm px-3 py-2.5 rounded-lg border-2 font-bold transition-colors ${ui.choice}`}
            >
              <span className="font-bold mr-2">{String.fromCharCode(65 + i)}.</span>
              {choice}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Scored ───────────────────────────────────────────────────────
  return (
    <div className={`border rounded-lg p-4 space-y-4 ${ui.card}`}>
      <div className="text-center">
        <h2 className={`text-lg font-bold ${ui.accent}`}>{title}</h2>
        <p className={`text-4xl font-bold mt-1 ${passed ? "text-emerald-400" : "text-red-400"}`}>
          {correctCount} / {total}
        </p>
        <p className={`text-sm mt-1 ${ui.muted}`}>
          {passed
            ? "Passed. You engaged with the history."
            : `You need ${threshold} correct to pass. Review your trail and try again.`}
        </p>
      </div>

      {passed ? (
        <>
          {/* Reinforcement: reveal the facts only after passing. */}
          <div className="space-y-2">
            {prepared.map((q, i) => {
              const wasRight = answers[i] === q.shuffledCorrect;
              return (
                <div key={q.id} className={`border rounded-lg p-2.5 ${ui.inner}`}>
                  <p className={`text-xs font-bold ${wasRight ? "text-emerald-400" : "text-red-400"}`}>
                    {wasRight ? "Correct" : "Missed"} · {q.question}
                  </p>
                  {q.fact && <p className={`text-xs mt-1 ${ui.muted}`}>{q.fact}</p>}
                </div>
              );
            })}
          </div>
          <button
            onClick={() => onPass(correctCount, total)}
            className={`w-full py-2.5 rounded-lg text-sm font-bold transition-colors ${ui.btn}`}
          >
            See Your Results
          </button>
        </>
      ) : (
        <>
          {/* Failure: show WHICH questions were missed, not the answers. */}
          <div className={`border rounded-lg p-2.5 ${ui.inner}`}>
            <p className={`text-xs font-bold uppercase tracking-wider ${ui.muted}`}>Questions to revisit</p>
            <p className={`text-sm mt-1 ${ui.text}`}>
              {prepared
                .map((q, i) => (answers[i] === q.shuffledCorrect ? null : i + 1))
                .filter((n) => n !== null)
                .join(", ")}
            </p>
          </div>

          <button
            onClick={() => setShowReview((v) => !v)}
            className={`w-full py-2 rounded-lg text-xs font-bold border-2 ${ui.choice}`}
          >
            {showReview ? "Hide Trail Review" : "Review Your Trail"}
          </button>

          {showReview && (
            <CampaignLog
              entries={decisionLog}
              themed={themed}
              title="Review Your Trail"
              subtitle="Expand any entry to find the answers you skipped. Then retake the exam."
            />
          )}

          <button
            onClick={retake}
            className={`w-full py-2.5 rounded-lg text-sm font-bold transition-colors ${ui.btn}`}
          >
            Retake the Exam
          </button>
        </>
      )}
    </div>
  );
}
