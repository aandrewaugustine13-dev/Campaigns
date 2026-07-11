import { useState, useEffect } from "react";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import type { NarrativePlan } from "../generator/storyPlan";
import { toggleBeatIncluded, isDecisionBeat, reviewStatus } from "./storyPlanReview";
import {
  Stepper,
  StudioShell,
  StudioPanel,
  StudioCard,
  StudioCardTitle,
  StudioButton,
  StudioBadge,
  StudioHeader,
} from "./components/studio";

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

const WIZARD_STEPS = [
  { id: "input", label: "Basics", shortLabel: "Basics" },
  { id: "frame", label: "Structure", shortLabel: "Structure" },
  { id: "build", label: "Review", shortLabel: "Review" },
  { id: "plan", label: "Story arc", shortLabel: "Story arc" },
];

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
  // Keep local edit state in sync when the parent regenerates a new plan.
  useEffect(() => { setEdited(plan); }, [plan]);
  const status = reviewStatus(edited);

  return (
    <StudioShell
      header={
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 rounded-md px-1 py-0.5 -ml-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                Back to review
              </button>
            ) : (
              <span />
            )}
            <span className="text-[11px] font-medium text-stone-400">Step 4 of 4</span>
          </div>
          <Stepper steps={WIZARD_STEPS} currentIndex={3} />
        </div>
      }
    >
      <StudioPanel className="space-y-5">
        <StudioHeader
          eyebrow="Final check"
          title="Review the story arc"
          description="These beats are guaranteed to appear, in order. Uncheck any you don't want; the generator fills texture around the ones you keep."
        />

        {/* Through-line */}
        <StudioCard className="!bg-stone-50/80 !shadow-none">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-1.5">Through-line</div>
          <p className="text-sm text-stone-700 italic leading-relaxed">{edited.throughline}</p>
        </StudioCard>

        {/* Beats checklist */}
        <div className="space-y-2">
          {edited.beats.map((b) => {
            const on = b.included;
            return (
              <label
                key={b.id}
                className={[
                  "flex gap-3 items-start p-3.5 rounded-xl border cursor-pointer transition-all duration-150",
                  "focus-within:ring-4 focus-within:ring-indigo-500/10",
                  on
                    ? "bg-white border-stone-200 shadow-sm hover:border-indigo-200"
                    : "bg-stone-50/80 border-stone-100 opacity-70 hover:opacity-100",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setEdited((p) => toggleBeatIncluded(p, b.id))}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500/30 accent-indigo-600"
                  aria-label={`Include "${b.title}"`}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StudioBadge tone="indigo">{ROLE_LABEL[b.role] ?? b.role}</StudioBadge>
                    <span className="text-[10px] font-medium text-stone-400">
                      {isDecisionBeat(b) ? "decision" : "witnessing"}
                    </span>
                    <span className={`text-sm font-semibold ${on ? "text-stone-900" : "text-stone-400 line-through"}`}>
                      {b.title}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 leading-relaxed">{b.significance}</p>
                </div>
              </label>
            );
          })}
        </div>

        {/* The ending (read-only — it lands at the close regardless of beats) */}
        <StudioCard>
          <StudioCardTitle>The ending — what it all added up to</StudioCardTitle>
          <p className="text-sm text-stone-700 leading-relaxed">{edited.meaning}</p>
        </StudioCard>

        {/* Validity — arc-shape errors (restore a beat) are the teacher's to
            fix; content errors (a malformed field) are not — offer regenerate. */}
        {status.arcErrors.length > 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 space-y-1.5">
            <p className="text-rose-800 text-xs font-semibold">The arc no longer holds — restore a beat to continue:</p>
            <ul className="list-disc list-inside text-rose-700/90 text-xs space-y-0.5">
              {status.arcErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}
        {status.contentErrors.length > 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 space-y-2.5">
            <p className="text-rose-800 text-xs font-semibold">This plan has a problem that editing can&apos;t fix — regenerate it:</p>
            <ul className="list-disc list-inside text-rose-700/90 text-xs space-y-0.5">
              {status.contentErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
            {onRegenerate && (
              <StudioButton
                variant="danger"
                size="sm"
                onClick={onRegenerate}
                loading={regenerating}
                disabled={regenerating}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} aria-hidden />
                {regenerating ? "Regenerating…" : "Regenerate the story plan"}
              </StudioButton>
            )}
          </div>
        )}
        {status.arcErrors.length === 0 && status.contentErrors.length === 0 && status.warnings.length > 0 && (
          <p className="text-amber-700 text-xs bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            {status.warnings.join(" · ")}
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
          <span className="text-xs text-stone-500 text-center sm:text-left">
            {status.includedCount} of {status.total} beats included
          </span>
          <StudioButton
            size="lg"
            onClick={() => onConfirm(edited)}
            disabled={!status.canConfirm || busy}
            loading={busy}
          >
            {busy ? "Generating…" : "Build campaign"}
            {!busy && <ArrowRight className="h-4 w-4" aria-hidden />}
          </StudioButton>
        </div>
      </StudioPanel>
    </StudioShell>
  );
}
