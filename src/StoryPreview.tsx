// ════════════════════════════════════════════════════════════════
// TEACHER PREVIEW SCREEN — the cheap confidence gate (authoring flow, slice 1).
//
// A teacher enters topic + standard + an optional plain-language "must-cover"
// note, hits Preview, and gets a cheap/fast story SUMMARY + TEKS COVERAGE
// checklist to eyeball against their standard — BEFORE paying for a full story
// generation. They can revise and re-preview freely (it's cheap), then Approve.
//
// This screen IS the required front door (Plan A): "Approve & Generate" hands
// the approved inputs to onApprove, and the parent (CreateBranching) runs the
// full generateBranchingStory. This gate is the ONLY entrance to that expensive
// call — there is no path to generation that skips the preview.
// ════════════════════════════════════════════════════════════════
import { useState, useCallback } from "react";
import type { StoryPreview, PreviewFinding } from "../generator/storyPreview";

export interface PreviewApproval {
  topic: string;
  standard: string;
  mustCover?: string;
  preview: StoryPreview;
}

interface StoryPreviewScreenProps {
  onBack?: () => void;
  /** Called when the teacher approves the previewed inputs. The parent runs the
   * full generation from here — this is the only entrance to it. */
  onApprove?: (approval: PreviewApproval) => void;
}

async function postPreview(body: { topic: string; standard: string; mustCover?: string }): Promise<{ data: StoryPreview; findings: PreviewFinding[] }> {
  const res = await fetch("/api/story-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || (payload && payload.error)) throw new Error(payload?.error || `Server returned ${res.status}`);
  return payload as { data: StoryPreview; findings: PreviewFinding[] };
}

export default function StoryPreviewScreen({ onBack, onApprove }: StoryPreviewScreenProps) {
  const [topic, setTopic] = useState("");
  const [standard, setStandard] = useState("");
  const [mustCover, setMustCover] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [preview, setPreview] = useState<StoryPreview | null>(null);
  const [error, setError] = useState("");
  const [approved, setApproved] = useState(false);

  const canPreview = topic.trim().length > 0 && standard.trim().length > 0 && status !== "loading";

  const runPreview = useCallback(async () => {
    setStatus("loading"); setError(""); setApproved(false); setPreview(null);
    try {
      const { data } = await postPreview({ topic: topic.trim(), standard: standard.trim(), mustCover: mustCover.trim() || undefined });
      setPreview(data);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [topic, standard, mustCover]);

  const approve = useCallback(() => {
    if (!preview) return;
    setApproved(true);
    onApprove?.({ topic: topic.trim(), standard: standard.trim(), mustCover: mustCover.trim() || undefined, preview });
  }, [preview, topic, standard, mustCover, onApprove]);

  // Editing any input invalidates a shown preview (revise → re-preview).
  const onEdit = <T,>(set: (v: T) => void) => (v: T) => { set(v); if (status === "done") { setStatus("idle"); setApproved(false); } };

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100 p-6" style={{ fontFamily: "'Georgia', serif" }}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-amber-400">New Story — Preview</h1>
          <p className="text-sm text-stone-400">Confirm the story will cover your standard before generating it. Revising is cheap — preview as often as you like.</p>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-stone-500">Topic</span>
            <input value={topic} onChange={(e) => onEdit(setTopic)(e.target.value)} placeholder="e.g. the Dust Bowl"
              className="mt-1 w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-stone-100" />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-stone-500">Standard (TEKS)</span>
            <input value={standard} onChange={(e) => onEdit(setStandard)(e.target.value)} placeholder="e.g. TEKS US.x — …"
              className="mt-1 w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-stone-100" />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-stone-500">Must cover (optional, plain language)</span>
            <textarea value={mustCover} onChange={(e) => onEdit(setMustCover)(e.target.value)} rows={2}
              placeholder="e.g. show why families left their farms, and the trip to California"
              className="mt-1 w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-stone-100" />
          </label>
          <button onClick={runPreview} disabled={!canPreview}
            className="px-5 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed rounded font-bold transition-colors">
            {status === "loading" ? "Previewing…" : preview ? "Re-preview" : "Preview"}
          </button>
        </div>

        {status === "error" && (
          <div className="border border-red-800 bg-red-950/40 rounded p-3 text-sm text-red-300">Preview failed: {error}</div>
        )}

        {preview && status === "done" && (
          <div className="border border-stone-700 bg-stone-800/50 rounded p-4 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-stone-500">The story will follow</p>
              <p className="text-stone-200">{preview.protagonist}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-stone-500">Summary</p>
              <p className="text-stone-200 leading-relaxed">{preview.summary}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-stone-500">Covers (check against your standard)</p>
              <ul className="mt-1 space-y-1">
                {preview.coverage.map((c, i) => (
                  <li key={i} className="text-stone-200 text-sm flex gap-2"><span className="text-amber-500">✓</span>{c}</li>
                ))}
              </ul>
            </div>

            {approved ? (
              <div className="border border-emerald-800 bg-emerald-950/40 rounded p-3 text-sm text-emerald-300">
                Approved — generating the full story now…
              </div>
            ) : (
              <div className="flex items-center gap-3 pt-1">
                <button onClick={approve}
                  className="px-5 py-2 bg-emerald-700 hover:bg-emerald-600 rounded font-bold transition-colors">
                  Approve &amp; Generate
                </button>
                <span className="text-xs text-stone-500">Not right? Edit the fields above and preview again.</span>
              </div>
            )}
          </div>
        )}

        {onBack && (
          <button onClick={onBack} className="block text-xs text-stone-500 hover:text-stone-300">&larr; Back to Campaigns</button>
        )}
      </div>
    </div>
  );
}
