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
  validateStory,
  type BranchingStory,
  type ChoiceStep,
  type PlayResult,
  type StoryValidation,
} from "../generator/branchingStory";

interface BranchingPlayerProps {
  story: BranchingStory;
  /** Fired once when an ending passage is reached, with the recorded path. */
  onEnd?: (result: PlayResult) => void;
  /** Fired once when the story is too broken to play (validation errors). */
  onUnplayable?: (validation: StoryValidation) => void;
  /** Optional return-to-menu affordance (navigation only). */
  onBack?: () => void;
}

function BackLink({ onBack }: { onBack?: () => void }) {
  if (!onBack) return null;
  return (
    <button onClick={onBack} className="block w-full text-center text-xs text-stone-400 hover:text-stone-600 mt-6">
      &larr; Back to Campaigns
    </button>
  );
}

// Graceful fallback for a story a model emitted broken — a clear message, never a
// crash and never a kid stranded in a dead/looping passage.
function Unplayable({ onBack }: { onBack?: () => void }) {
  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-3">
        <p className="text-lg font-serif">This story isn&rsquo;t ready to play yet.</p>
        <p className="text-sm text-stone-500">Something went wrong putting it together. Please pick another story.</p>
        <BackLink onBack={onBack} />
      </div>
    </div>
  );
}

export default function BranchingPlayer({ story, onEnd, onUnplayable, onBack }: BranchingPlayerProps) {
  const byId = useMemo(() => passageMap(story), [story]);
  // Validate up front: the player only ever runs a story proven safe start-to-end,
  // so a malformed graph degrades gracefully instead of rendering into a wall.
  const validation = useMemo(() => validateStory(story), [story]);
  const [currentId, setCurrentId] = useState(story.start);
  const [history, setHistory] = useState<ChoiceStep[]>([]);
  // onEnd / onUnplayable fire exactly once per playthrough (a ref survives re-renders).
  const firedRef = useRef(false);

  const current = byId.get(currentId);

  const choose = useCallback((choiceIndex: number) => {
    const p = byId.get(currentId);
    const c = p?.choices?.[choiceIndex];
    if (!c || !byId.has(c.next)) return; // defensive: never follow a dangling link
    setHistory((h) => [...h, { passageId: currentId, choiceIndex, choiceText: c.text, next: c.next }]);
    setCurrentId(c.next);
  }, [byId, currentId]);

  useEffect(() => {
    if (!validation.playable && !firedRef.current) {
      firedRef.current = true;
      onUnplayable?.(validation);
      return;
    }
    if (validation.playable && isEnding(current) && !firedRef.current) {
      firedRef.current = true;
      onEnd?.({ endingId: currentId, history });
    }
  }, [validation, current, currentId, history, onEnd, onUnplayable]);

  // A broken story (or a missing current passage, the runtime safety net) → fallback.
  if (!validation.playable || !current) return <Unplayable onBack={onBack} />;

  const ended = isEnding(current);

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 flex items-center justify-center p-6">
      <div className="max-w-xl w-full space-y-8">
        <h1 className="text-xs uppercase tracking-widest text-stone-500 text-center">{story.title}</h1>

        {/* Teacher-curated image (if any) — shown during review/play for visual stories */}
        {current.image?.thumbUrl && (
          <div className="mb-4">
            <img
              src={current.image.thumbUrl}
              alt=""
              className="w-full rounded border border-stone-300 max-h-72 object-cover"
            />
            {(current.image.artist || current.image.license) && (
              <div className="text-[10px] text-stone-500 mt-1 px-0.5">
                {current.image.artist || "Curated"} {current.image.license ? `· ${current.image.license}` : ""}
                {current.image.sourceUrl && (
                  <>
                    {" · "}
                    <a
                      href={current.image.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-stone-400"
                    >
                      Source
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        )}

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

        <BackLink onBack={onBack} />
      </div>
    </div>
  );
}
