import { useState } from "react";
import type { SageEncounterData } from "./Sages";

// ═══════════════════════════════════════════════════════════════
// SAGE ENCOUNTER — full encounter flow
// Phase 1: Greeting + Bio → Phase 2: Advice → Phase 3: Question → Phase 4: Result
// ═══════════════════════════════════════════════════════════════

type SagePhase = "greeting" | "advice" | "question" | "result";

interface Props {
  sage: SageEncounterData;
  onComplete: (correct: boolean) => void;
}

export default function SageEncounter({ sage, onComplete }: Props) {
  const [phase, setPhase] = useState<SagePhase>("greeting");
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [wasCorrect, setWasCorrect] = useState(false);

  const handleAnswer = (index: number) => {
    const correct = index === sage.question.correctIndex;
    setSelectedAnswer(index);
    setWasCorrect(correct);
    setPhase("result");
  };

  return (
    <div className="space-y-3">
      {/* ── Header: Name + Title ────────────────────────── */}
      <div
        className="rounded-lg overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #2d1b11, #1a1408)",
          border: "2px solid #3d2516",
        }}
      >
        <div className="flex items-start gap-3 p-3">
          {/* Portrait placeholder */}
          <div
            className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 border-amber-800/60"
            style={{
              background: "linear-gradient(135deg, #3d2516, #2d1b11)",
            }}
          >
            <img
              src={sage.portrait}
              alt={sage.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback: show initials on failed load
                const el = e.target as HTMLImageElement;
                el.style.display = "none";
                el.parentElement!.innerHTML = `
                  <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;
                    font-size:24px;font-weight:bold;color:#d97706;font-family:Georgia,serif;
                    background:linear-gradient(135deg,#3d2516,#2d1b11);">
                    ${sage.name.split(" ").map(w => w[0]).join("")}
                  </div>`;
              }}
            />
          </div>

          {/* Name + bio */}
          <div className="flex-1 min-w-0">
            <h2
              className="text-lg font-bold text-amber-400 leading-tight"
              style={{ fontFamily: "'Georgia', serif" }}
            >
              {sage.name}
            </h2>
            <p className="text-xs text-amber-600 font-bold uppercase tracking-wider mb-1">
              {sage.title}
            </p>
            <p className="text-xs text-stone-400 leading-relaxed">
              {sage.bio}
            </p>
          </div>
        </div>
      </div>

      {/* ── Phase: Greeting ─────────────────────────────── */}
      {phase === "greeting" && (
        <div className="space-y-3">
          <div className="border border-stone-700 rounded-lg p-3 bg-stone-800/80">
            <p className="text-stone-300 text-sm leading-relaxed italic">
              {sage.greeting}
            </p>
          </div>
          <button
            onClick={() => setPhase("advice")}
            className="w-full py-2.5 bg-amber-800 hover:bg-amber-700 rounded-lg text-sm font-bold transition-colors"
            style={{ fontFamily: "'Georgia', serif" }}
          >
            Listen
          </button>
        </div>
      )}

      {/* ── Phase: Advice ───────────────────────────────── */}
      {phase === "advice" && (
        <div className="space-y-3">
          <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/30">
            <p className="text-amber-200 text-sm leading-relaxed">
              {sage.advice}
            </p>
          </div>
          <button
            onClick={() => setPhase("question")}
            className="w-full py-2.5 bg-amber-800 hover:bg-amber-700 rounded-lg text-sm font-bold transition-colors"
            style={{ fontFamily: "'Georgia', serif" }}
          >
            {sage.name.split(" ")[0]} has a question for you
          </button>
        </div>
      )}

      {/* ── Phase: Question ─────────────────────────────── */}
      {phase === "question" && (
        <div className="space-y-3">
          <div className="border border-indigo-700/60 rounded-lg p-3 bg-indigo-950/40">
            <p className="text-xs text-indigo-300 font-bold uppercase tracking-wider mb-2">
              📜 Trail Wisdom
            </p>
            <p className="text-stone-200 text-sm leading-relaxed mb-3">
              {sage.question.question}
            </p>
            <div className="space-y-2">
              {sage.question.choices.map((choice, i) => (
                <button
                  key={i}
                  onClick={() => handleAnswer(i)}
                  className="w-full text-left text-sm px-3 py-2.5 rounded-lg bg-indigo-900/60 hover:bg-indigo-800/80 border border-indigo-700/40 hover:border-indigo-600/60 transition-all"
                  style={{ fontFamily: "'Georgia', serif" }}
                >
                  <span className="text-indigo-300 font-bold mr-2">
                    {String.fromCharCode(65 + i)}.
                  </span>
                  {choice}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-indigo-400/60 mt-2 text-center">
              {sage.question.teksRef}
            </p>
          </div>
        </div>
      )}

      {/* ── Phase: Result ───────────────────────────────── */}
      {phase === "result" && selectedAnswer !== null && (
        <div className="space-y-3">
          {/* Correct/Wrong banner */}
          <div
            className="rounded-lg p-3 text-center"
            style={{
              background: wasCorrect
                ? "linear-gradient(135deg, rgba(22,101,52,0.3), rgba(20,83,45,0.2))"
                : "linear-gradient(135deg, rgba(127,29,29,0.3), rgba(153,27,27,0.2))",
              border: `2px solid ${wasCorrect ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
            }}
          >
            <p
              className={`text-lg font-bold ${wasCorrect ? "text-emerald-400" : "text-red-400"}`}
              style={{ fontFamily: "'Georgia', serif" }}
            >
              {wasCorrect ? "Correct" : "Not quite"}
            </p>
          </div>

          {/* Show what they picked vs correct */}
          {!wasCorrect && (
            <div className="border border-stone-700 rounded-lg p-3 bg-stone-800/60">
              <p className="text-xs text-stone-500 mb-1">You answered:</p>
              <p className="text-sm text-red-400/80 line-through mb-2">
                {sage.question.choices[selectedAnswer]}
              </p>
              <p className="text-xs text-stone-500 mb-1">Correct answer:</p>
              <p className="text-sm text-emerald-400">
                {sage.question.choices[sage.question.correctIndex]}
              </p>
            </div>
          )}

          {/* Explanation — always shown */}
          <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20">
            <p className="text-xs text-amber-500 font-bold uppercase tracking-wider mb-1">
              📖 Historical Context
            </p>
            <p className="text-stone-300 text-sm leading-relaxed">
              {sage.question.explanation}
            </p>
          </div>

          {/* Reward summary */}
          <div className="border border-stone-700 rounded-lg p-2 bg-stone-800/40 text-center">
            <p className="text-xs text-stone-400">
              +{wasCorrect ? sage.reward.knowledgeCorrect : sage.reward.knowledgeWrong} Historical Knowledge
              {wasCorrect && sage.reward.correct.supplies && ` · +${sage.reward.correct.supplies} Supplies`}
              {wasCorrect && sage.reward.correct.morale && ` · +${sage.reward.correct.morale} Morale`}
              {wasCorrect && sage.reward.correct.ammo && ` · +${sage.reward.correct.ammo} Ammo`}
              {wasCorrect && sage.reward.correct.herdCondition && ` · +${sage.reward.correct.herdCondition} Herd Condition`}
              {wasCorrect && sage.reward.correct.insight && ` · +${sage.reward.correct.insight} Insight`}
            </p>
          </div>

          {/* Continue button */}
          <button
            onClick={() => onComplete(wasCorrect)}
            className="w-full py-2.5 bg-amber-800 hover:bg-amber-700 rounded-lg text-sm font-bold transition-colors"
            style={{ fontFamily: "'Georgia', serif" }}
          >
            Continue Trail
          </button>
        </div>
      )}
    </div>
  );
}
