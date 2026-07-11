import { useState, useRef, useEffect } from "react";
import BranchingPlayer from "./BranchingPlayer";
import BranchingReview from "./BranchingReview";
import StoryPreviewScreen, { type PreviewApproval } from "./StoryPreview";
import type { BranchingStory } from "../generator/branchingStory";
import { AlertCircle, ArrowLeft, Sparkles } from "lucide-react";
import {
  Stepper,
  StudioShell,
  StudioPanel,
  StudioCard,
  StudioButton,
  StudioSpinner,
  StudioHeader,
} from "./components/studio";

interface Props {
  onBack: () => void;
}

// PLAN A — the cheap PREVIEW gate is the REQUIRED front door.
//
// There is intentionally NO topic form here that calls /api/branching directly.
// The expensive full generation (generateBranchingStory) is reachable ONLY
// through `generateFromApproval`, which is only ever invoked by the preview
// gate's onApprove. A teacher must see the summary + TEKS coverage checklist and
// click "Approve & Generate" before a single token of the full story is written.
// (The earlier drift skipped the gate and generated immediately — that path is
// deleted, not hidden.)
//
// UI: light SaaS studio shell — matches StoryPreview (the real product path).
type Phase = "preview" | "generating" | "error" | "review" | "playing";

const GEN_STEPS = [
  { id: "inputs", label: "Inputs", shortLabel: "Inputs" },
  { id: "preview", label: "Preview", shortLabel: "Preview" },
  { id: "generate", label: "Generate", shortLabel: "Generate" },
];

export default function CreateBranching({ onBack }: Props) {
  const [phase, setPhase] = useState<Phase>("preview");
  const [approval, setApproval] = useState<PreviewApproval | null>(null);
  const [story, setStory] = useState<BranchingStory | null>(null);
  // Teacher-visible warnings carried from generation (e.g. the fact-gate could
  // not verify the history) — surfaced in the review screen before publish.
  const [notices, setNotices] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [genStep, setGenStep] = useState("Preparing your story...");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Update friendly step messages over time for better perceived progress during the (long) full generation.
  useEffect(() => {
    if (phase !== "generating") {
      setGenStep("Preparing your story...");
      return;
    }
    let msg = "Preparing your story...";
    if (elapsed < 6) msg = "Analyzing your topic and TEKS standards...";
    else if (elapsed < 14) msg = "Crafting the story spine and major turning points...";
    else if (elapsed < 25) msg = "Adding rich passages, choices, and figure encounters...";
    else if (elapsed < 38) msg = "Writing the final quiz and in-passage questions...";
    else msg = "Validating every path so the branching graph works perfectly...";
    setGenStep(msg);
  }, [elapsed, phase]);

  const startTimer = () => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(t => t + 1), 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  // THE ONLY PATH INTO FULL GENERATION. Called solely by the gate's onApprove
  // (and by the error screen's "Try again", which re-runs an ALREADY-approved
  // preview — it never bypasses the gate). No other caller exists.
  const generateFromApproval = async (appr: PreviewApproval) => {
    setApproval(appr);
    setPhase("generating");
    setError("");
    startTimer();

    try {
      const res = await fetch("/api/branching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: appr.topic,
          standard: appr.standard,
          teks: appr.teks || [],
          mustCover: appr.mustCover,
          contentMaturity: appr.contentMaturity,
          proseRegister: appr.proseRegister,
          scope: appr.scope,
          gumpIntensity: appr.gumpIntensity,
          outputLanguage: appr.outputLanguage,
          era: appr.era,
        }),
      });
      const data = await res.json();

      stopTimer();

      if (!res.ok || !data?.ok || !data.story) {
        const msg = data?.error || data?.validation?.findings?.map((f: any) => f.message).join(" • ") || "The story generator could not complete this request.";
        throw new Error(msg);
      }

      // Surface any warn-level findings (the fact-gate "could not verify the
      // history" warning must reach the teacher BEFORE they publish — never
      // ship an unverified story silently into a kid's hands).
      const warns: string[] = Array.isArray(data.validation?.findings)
        ? data.validation.findings.filter((f: any) => f.level === "warn").map((f: any) => f.message)
        : [];
      setNotices(warns);
      setStory(data.story as BranchingStory);
      setAttempts(data.attempts ?? 1);
      setPhase("review");
    } catch (e: any) {
      stopTimer();
      setError(e?.message || String(e));
      setPhase("error");
    }
  };

  const backToPreview = () => {
    setStory(null);
    setApproval(null);
    setNotices([]);
    setPhase("preview");
    setError("");
    setAttempts(0);
    setElapsed(0);
  };

  const confirmReviewed = (reviewed: BranchingStory) => {
    setStory(reviewed);
    setPhase("playing");
  };

  // Teacher review + image curation after generation
  if (phase === "review" && story) {
    return (
      <BranchingReview
        story={story}
        topic={approval?.topic}
        standard={approval?.standard}
        notices={notices}
        onConfirm={confirmReviewed}
        onBack={backToPreview}
      />
    );
  }

  // Playing the (possibly reviewed) story
  if (phase === "playing" && story) {
    return (
      <BranchingPlayer
        story={story}
        onBack={backToPreview}
        era={story.era}
      />
    );
  }

  // Generating (richer feedback for long operation)
  if (phase === "generating") {
    return (
      <StudioShell
        header={
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-stone-400">
                <Sparkles className="h-3.5 w-3.5 text-indigo-500" aria-hidden />
                First-person story
              </span>
              <span className="text-[11px] font-medium text-stone-400">Step 3 of 3</span>
            </div>
            <Stepper steps={GEN_STEPS} currentIndex={2} />
          </div>
        }
      >
        <StudioPanel>
          <div className="pt-4 sm:pt-8">
            <StudioCard className="text-center !py-10 space-y-4">
              <StudioHeader
                title="Writing your story…"
                description="Building a choose-your-path experience with validated branches, figure meetings, and a comprehension quiz."
              />
              <StudioSpinner
                label={genStep}
                sublabel={`${elapsed}s elapsed · typically 45–90 seconds`}
              />
              <div className="mx-auto max-w-xs">
                <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500/80 transition-all duration-1000 ease-out"
                    style={{ width: `${Math.min(94, 10 + elapsed * 1.1)}%` }}
                  />
                </div>
                <p className="text-[11px] text-stone-400 mt-2">
                  We validate every ending before we hand it to you.
                </p>
              </div>
              {approval && (
                <p className="text-[11px] text-stone-500">
                  <span className="font-medium text-stone-700">{approval.topic}</span>
                  {" · "}
                  {approval.standard}
                </p>
              )}
              <StudioButton variant="secondary" onClick={backToPreview}>
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Cancel and edit inputs
              </StudioButton>
            </StudioCard>
          </div>
        </StudioPanel>
      </StudioShell>
    );
  }

  // Error
  if (phase === "error") {
    return (
      <StudioShell
        header={
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 rounded-md px-1 py-0.5 -ml-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Campaigns
            </button>
            <span className="text-[11px] font-medium text-stone-400">First-person story</span>
          </div>
        }
      >
        <StudioPanel>
          <div className="pt-4 sm:pt-8 max-w-md mx-auto">
            <StudioCard className="text-center space-y-4 !py-10">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 ring-1 ring-rose-100">
                <AlertCircle className="h-6 w-6 text-rose-600" aria-hidden />
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-semibold text-stone-900">We ran into a problem</h1>
                <p className="text-sm text-stone-500">Something went wrong creating the story. You can safely try again.</p>
              </div>
              <div className="rounded-lg border border-rose-100 bg-rose-50/80 px-3.5 py-3 text-left">
                <p className="text-sm text-rose-800 break-words whitespace-pre-wrap leading-relaxed">
                  {error || "The story service could not complete the request."}
                </p>
                <p className="text-xs text-rose-600/80 mt-2 leading-snug">
                  Common causes: temporary service hiccup, very specific topic/TEKS, or rate limiting. The preview gate protects you from wasted full generations.
                </p>
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <StudioButton
                  onClick={() => approval && generateFromApproval(approval)}
                  disabled={!approval}
                >
                  Try again
                </StudioButton>
                <StudioButton variant="secondary" onClick={backToPreview}>
                  Edit inputs & preview again
                </StudioButton>
                <StudioButton variant="ghost" size="sm" onClick={onBack}>
                  Back to Campaigns
                </StudioButton>
              </div>
              {attempts > 0 && (
                <p className="text-[11px] text-stone-400">Previous attempts: {attempts}</p>
              )}
            </StudioCard>
          </div>
        </StudioPanel>
      </StudioShell>
    );
  }

  // DEFAULT PHASE: the cheap preview gate — the only entrance to generation.
  return (
    <StoryPreviewScreen
      onBack={onBack}
      onApprove={generateFromApproval}
    />
  );
}
