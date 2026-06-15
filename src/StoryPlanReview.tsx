import { useState } from "react";
import type { NarrativePlan } from "../generator/storyPlan";
import { toggleBeatIncluded, isDecisionBeat, reviewStatus } from "./storyPlanReview";

// Teacher's narrative-plan review (step 8). Shows the proposed story arc as a
// checklist — each major beat can be toggled IN or OUT (v1 = include/exclude
// only; reorder/edit later). Included beats become the campaign's pinned,
// guaranteed events; the meaning becomes the story-level ending. Confirm is
// gated on the arc still holding (validateStoryPlan, via reviewStatus).

const ROLE_LABEL: Record<string, string> = {
  cause: "Cause",
  escalation: "Escalation",
  climax: "Climax",
  resolution: "Resolution",
};

export default function StoryPlanReview({
  plan,
  onConfirm,
  onBack,
  onRegenerate,
  busy = false,
  regenerating = false,
}: {
  plan: NarrativePlan;
  onConfirm: (plan: NarrativePlan) => void;
  onBack?: () => void;
  // Re-propose the whole plan from the model — the honest path when the plan has
  // a CONTENT error (a malformed field) that toggling beats can't fix.
  onRegenerate?: () => void;
  busy?: boolean;
  regenerating?: boolean;
}) {
  const [edited, setEdited] = useState<NarrativePlan>(plan);
  const status = reviewStatus(edited);

  return (
    <div className="h-screen bg-stone-900 text-stone-100 flex flex-col overflow-hidden" style={{ fontFamily: "'Georgia', serif" }}>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-5">

          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold text-amber-400">Review the Story Arc</h1>
            <p className="text-stone-500 text-sm">
              These beats are <span className="text-stone-300">guaranteed</span> to appear, in order. Uncheck any you don't want; the rest fills in around them.
            </p>
          </div>

          {/* Through-line */}
          <div className="bg-stone-800/60 border border-stone-700 rounded p-3">
            <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">Through-line</div>
            <p className="text-sm text-stone-200 italic">{edited.throughline}</p>
          </div>

          {/* Beats checklist */}
          <div className="space-y-2">
            {edited.beats.map((b) => {
              const on = b.included;
              return (
                <label
                  key={b.id}
                  className={`flex gap-3 items-start p-3 rounded border cursor-pointer transition-colors ${
                    on
                      ? "bg-stone-800 border-stone-700 hover:border-amber-700"
                      : "bg-stone-900 border-stone-800 opacity-55 hover:opacity-80"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setEdited((p) => toggleBeatIncluded(p, b.id))}
                    className="mt-1 accent-amber-500 w-4 h-4 shrink-0"
                    aria-label={`Include "${b.title}"`}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-amber-500/90">{ROLE_LABEL[b.role] ?? b.role}</span>
                      <span className="text-[10px] text-stone-500">· {isDecisionBeat(b) ? "decision" : "witnessing"}</span>
                      <span className={`text-sm font-bold ${on ? "text-stone-100" : "text-stone-400 line-through"}`}>{b.title}</span>
                    </div>
                    <p className="text-xs text-stone-400 leading-snug">{b.significance}</p>
                  </div>
                </label>
              );
            })}
          </div>

          {/* The ending (read-only — it lands at the close regardless of beats) */}
          <div className="bg-stone-800/60 border border-stone-700 rounded p-3">
            <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">The ending — what it all added up to</div>
            <p className="text-sm text-stone-200 leading-relaxed">{edited.meaning}</p>
          </div>

          {/* Validity — arc-shape errors (restore a beat) are the teacher's to
              fix; content errors (a malformed field) are not — offer regenerate. */}
          {status.arcErrors.length > 0 && (
            <div className="bg-red-950/40 border border-red-800 rounded p-3 space-y-1">
              <p className="text-red-300 text-xs font-bold">The arc no longer holds — restore a beat to continue:</p>
              <ul className="list-disc list-inside text-red-300/90 text-xs space-y-0.5">
                {status.arcErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          {status.contentErrors.length > 0 && (
            <div className="bg-red-950/40 border border-red-800 rounded p-3 space-y-2">
              <p className="text-red-300 text-xs font-bold">This plan has a problem that editing can't fix — regenerate it:</p>
              <ul className="list-disc list-inside text-red-300/90 text-xs space-y-0.5">
                {status.contentErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
              {onRegenerate && (
                <button
                  onClick={onRegenerate}
                  disabled={regenerating}
                  className="px-4 py-1.5 bg-red-800 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs font-bold transition-colors"
                >
                  {regenerating ? "Regenerating…" : "↻ Regenerate the story plan"}
                </button>
              )}
            </div>
          )}
          {status.arcErrors.length === 0 && status.contentErrors.length === 0 && status.warnings.length > 0 && (
            <p className="text-amber-400/80 text-xs">{status.warnings.join(" · ")}</p>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-stone-500">{status.includedCount} of {status.total} beats included</span>
            <button
              onClick={() => onConfirm(edited)}
              disabled={!status.canConfirm || busy}
              className="px-6 py-2.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed rounded font-bold transition-colors"
            >
              {busy ? "Generating…" : "Build Campaign"}
            </button>
          </div>

          {onBack && (
            <button onClick={onBack} className="block w-full text-xs text-stone-500 hover:text-stone-300 text-center transition-colors">
              &larr; Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
