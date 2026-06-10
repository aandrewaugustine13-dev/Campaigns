import { useState } from "react";
import type { SageEncounterData } from "./campaigns/types";
import { truncateCredit } from "./lib/attribution";

// ═══════════════════════════════════════════════════════════════
// SAGE ENCOUNTER — full encounter flow
// Phase 1: Intro (greeting + advice) → Phase 2: Question → Phase 3: Result
//
// Fully theme-driven: every surface, border, font, and accent reads
// the CSS variables from themes.css (inherited from the data-theme
// wrapper). Outside a wrapper (Chisholm in App.tsx) the :root
// fallbacks reproduce the legacy dark amber look. The only fixed
// colors are the correct/wrong trust signals, which are deliberately
// identical across themes.
// ═══════════════════════════════════════════════════════════════

type SagePhase = "intro" | "question" | "result";

interface Props {
  sage: SageEncounterData;
  onComplete: (correct: boolean) => void;
}

export default function SageEncounter({ sage, onComplete }: Props) {
  const [phase, setPhase] = useState<SagePhase>("intro");
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [wasCorrect, setWasCorrect] = useState(false);

  const handleAnswer = (index: number) => {
    const correct = index === sage.question.correctIndex;
    setSelectedAnswer(index);
    setWasCorrect(correct);
    setPhase("result");
  };

  return (
    <div className="space-y-3 theme-body-font">
      {/* ── Header: Name + Title ────────────────────────── */}
      <div className="rounded-lg overflow-hidden theme-bg-card theme-border border-2">
        <div className="flex items-start gap-3 p-3">
          {/* Portrait */}
          <div className="flex-shrink-0">
            <div
              className="w-20 h-20 rounded-lg overflow-hidden border-2 theme-border theme-bg-card-inner"
              style={{ aspectRatio: "1 / 1" }}
            >
              <img
                src={sage.portrait}
                alt={sage.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const el = e.target as HTMLImageElement;
                  el.style.display = "none";
                  el.parentElement!.innerHTML = `
                    <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;
                      font-size:24px;font-weight:bold;color:var(--text-accent);font-family:var(--font-display);
                      background:var(--bg-card-inner);">
                      ${sage.name.split(" ").map((w: string) => w[0]).join("")}
                    </div>`;
                }}
              />
            </div>
            {sage.portraitAttribution && (
              <p className="w-20 mt-0.5 theme-text-muted leading-tight" style={{ fontSize: "11px" }}>
                {truncateCredit(sage.portraitAttribution.artist)}
                {" · "}
                <a
                  href={sage.portraitAttribution.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-80"
                >
                  Source
                </a>
              </p>
            )}
          </div>

          {/* Name + bio */}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold theme-text-accent theme-display-font leading-tight">
              {sage.name}
            </h2>
            <p className="text-xs theme-text-accent-2 font-bold uppercase tracking-wider mb-1">
              {sage.title}
            </p>
            <p className="text-xs theme-text-muted leading-relaxed">
              {sage.bio}
            </p>
          </div>
        </div>
      </div>

      {/* ── Phase: Intro — greeting + advice in one panel ── */}
      {phase === "intro" && (
        <div className="space-y-3">
          <div className="border theme-divider rounded-lg p-3 theme-bg-card-inner">
            <p className="theme-text text-base leading-relaxed italic">
              {sage.greeting}
            </p>
          </div>
          <div className="border-2 theme-border rounded-lg p-3 theme-bg-card-inner">
            <p className="theme-text text-base leading-relaxed">
              {sage.advice}
            </p>
          </div>
          <button
            onClick={() => setPhase("question")}
            className="w-full py-2.5 theme-btn-action rounded-lg text-sm font-bold transition-colors"
          >
            {sage.name.split(" ")[0]} has a question for you
          </button>
        </div>
      )}

      {/* ── Phase: Question ─────────────────────────────── */}
      {phase === "question" && (
        <div className="space-y-3">
          <div className="border-2 theme-border rounded-lg p-3 theme-bg-card-inner">
            <p className="text-xs theme-text-accent theme-display-font font-bold uppercase tracking-wider mb-2">
              📜 A Question for You
            </p>
            <p className="theme-text text-base leading-relaxed mb-3">
              {sage.question.question}
            </p>
            <div className="space-y-2">
              {sage.question.choices.map((choice: string, i: number) => (
                <button
                  key={i}
                  onClick={() => handleAnswer(i)}
                  className="w-full text-left text-base leading-snug px-3 py-2.5 rounded-lg theme-bg-card theme-border border theme-text transition-all hover:opacity-80"
                >
                  <span className="theme-text-accent font-bold mr-2">
                    {String.fromCharCode(65 + i)}.
                  </span>
                  {choice}
                </button>
              ))}
            </div>
            <p className="text-[10px] theme-text-muted opacity-70 mt-2 text-center">
              {sage.question.teksRef}
            </p>
          </div>
        </div>
      )}

      {/* ── Phase: Result ───────────────────────────────── */}
      {phase === "result" && selectedAnswer !== null && (
        <div className="space-y-3">
          {/* Correct/Wrong banner — trust signals, NOT themed */}
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
              className={`text-lg font-bold theme-display-font ${wasCorrect ? "text-emerald-500" : "text-red-500"}`}
            >
              {wasCorrect ? "Correct" : "Not quite"}
            </p>
          </div>

          {/* Show what they picked vs correct */}
          {!wasCorrect && (
            <div className="border theme-divider rounded-lg p-3 theme-bg-card-inner">
              <p className="text-xs theme-text-muted mb-1">You answered:</p>
              <p className="text-sm text-red-500 line-through mb-2">
                {sage.question.choices[selectedAnswer]}
              </p>
              <p className="text-xs theme-text-muted mb-1">Correct answer:</p>
              <p className="text-sm text-emerald-600 font-bold">
                {sage.question.choices[sage.question.correctIndex]}
              </p>
            </div>
          )}

          {/* Explanation — always shown */}
          <div className="border-2 theme-border rounded-lg p-3 theme-bg-card-inner">
            <p className="text-xs theme-text-accent theme-display-font font-bold uppercase tracking-wider mb-1">
              📖 Historical Context
            </p>
            <p className="theme-text text-base leading-relaxed">
              {sage.question.explanation}
            </p>
          </div>

          {/* Reward summary */}
          <div className="border theme-divider rounded-lg p-2 theme-bg-card-inner text-center">
            <p className="text-xs theme-text-muted">
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
            className="w-full py-2.5 theme-btn-action rounded-lg text-sm font-bold transition-colors"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
