import { useState, useRef, useEffect } from "react";
import BranchingPlayer from "./BranchingPlayer";
import BranchingReview from "./BranchingReview";
import StoryPreviewScreen, { type PreviewApproval } from "./StoryPreview";
import type { BranchingStory } from "../generator/branchingStory";
import { PageContainer, MainTitle, Button, BackButton } from "./components/ui";

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
type Phase = "preview" | "generating" | "error" | "review" | "playing";

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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

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
          mustCover: appr.mustCover,
          contentMaturity: appr.contentMaturity,
          proseRegister: appr.proseRegister,
          scope: appr.scope,
          gumpIntensity: appr.gumpIntensity,
        }),
      });
      const data = await res.json();

      stopTimer();

      if (!res.ok || !data?.ok || !data.story) {
        const msg = data?.error || data?.validation?.findings?.map((f: any) => f.message).join(" • ") || "Generation failed";
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
      />
    );
  }

  // Generating (simple spinner)
  if (phase === "generating") {
    return (
      <PageContainer maxWidth="max-w-md">
        <MainTitle className="text-3xl">Generating Branching Story…</MainTitle>
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 border-4 border-[#c9a36b]/30 border-t-[#c9a36b] rounded-full animate-spin" />
        </div>
        <p className="text-[#c5b8a0] text-lg text-center font-mono mb-3">{elapsed}s</p>
        <p className="text-[#8a7f6a] text-sm text-center max-w-xs mx-auto mb-8">
          The model is writing a real choose-your-path story and we validate the graph before handing it to the player.
        </p>
        <Button variant="secondary" label="Cancel" onClick={backToPreview} />
      </PageContainer>
    );
  }

  // Error
  if (phase === "error") {
    return (
      <PageContainer maxWidth="max-w-md">
        <MainTitle className="text-3xl text-[#c25c5c]">Generation Failed</MainTitle>

        <div className="border border-[#5c2a2a] bg-[#2a1f1f] rounded-2xl p-4 text-left text-sm text-[#d88a8a] mb-6 whitespace-pre-wrap">
          {error}
        </div>

        <div className="space-y-3">
          <Button
            variant="primary"
            label="Try Again"
            onClick={() => approval && generateFromApproval(approval)}
            disabled={!approval}
          />
          <Button
            variant="secondary"
            label="Edit inputs"
            onClick={backToPreview}
          />
        </div>

        <div className="mt-6">
          <BackButton onClick={onBack} />
        </div>
      </PageContainer>
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
