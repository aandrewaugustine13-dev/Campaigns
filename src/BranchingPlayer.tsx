// ════════════════════════════════════════════════════════════════
// BRANCHING PLAYER (Product 2, new model) — Step 1.
//
// A SEPARATE, self-contained player for a BranchingStory passage graph. It does
// NOT touch GeneratedCampaign or the systems engine. It loads a story, renders
// the current passage's prose, shows its choices as buttons, follows `next` on
// click, RECORDS the choice-history (what the responsive ending + quiz will read),
// and stops at an ending. No phase windows, no day-count, no resource bars — the
// story IS the graph.
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  passageMap,
  isEnding,
  type BranchingStory,
  type ChoiceStep,
  type PlayResult,
} from "../generator/branchingStory";

interface BranchingPlayerProps {
  story: BranchingStory;
  /** Fired once when an ending passage is reached, with the recorded path. */
  onEnd?: (result: PlayResult) => void;
}

export default function BranchingPlayer({ story, onEnd }: BranchingPlayerProps) {
  const byId = useMemo(() => passageMap(story), [story]);
  const [currentId, setCurrentId] = useState(story.start);
  const [history, setHistory] = useState<ChoiceStep[]>([]);
  // onEnd fires exactly once per playthrough (a ref survives re-renders).
  const firedRef = useRef(false);

  const current = byId.get(currentId);

  const choose = useCallback((choiceIndex: number) => {
    const p = byId.get(currentId);
    const c = p?.choices?.[choiceIndex];
    if (!c) return;
    setHistory((h) => [...h, { passageId: currentId, choiceIndex, choiceText: c.text, next: c.next }]);
    setCurrentId(c.next);
  }, [byId, currentId]);

  useEffect(() => {
    if (isEnding(current) && !firedRef.current) {
      firedRef.current = true;
      onEnd?.({ endingId: currentId, history });
    }
  }, [current, currentId, history, onEnd]);

  if (!current) {
    return <div className="p-6 text-red-700">Story error: missing passage &ldquo;{currentId}&rdquo;.</div>;
  }

  const ended = isEnding(current);

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 flex items-center justify-center p-6">
      <div className="max-w-xl w-full space-y-8">
        <h1 className="text-xs uppercase tracking-widest text-stone-500 text-center">{story.title}</h1>

        {/* The current passage — continuous prose, simple and readable on a tablet. */}
        <p className="text-xl leading-relaxed font-serif whitespace-pre-line">{current.text}</p>

        {ended ? (
          <p className="text-center text-stone-500 italic">· The End ·</p>
        ) : (
          <div className="space-y-3">
            {(current.choices ?? []).map((c, i) => (
              <button
                key={i}
                onClick={() => choose(i)}
                className="block w-full text-left px-4 py-3 rounded border border-stone-300 bg-white hover:bg-stone-50 transition-colors text-lg leading-snug"
              >
                {c.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
