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

  // For in-story sage/figure questions
  const [answeredQuestion, setAnsweredQuestion] = useState<number | null>(null);

  // For final comprehension check / quiz at end
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const current = byId.get(currentId);

  useEffect(() => {
    setAnsweredQuestion(null);
  }, [currentId]);

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

        {/* In-story question from historical figure (sage-style trivia, when present on the passage) */}
        {current.question && (
          <div className="mt-4 p-4 border border-blue-300 bg-blue-50 rounded">
            <p className="font-semibold text-blue-800">A historical figure asks you:</p>
            <p className="mt-2 text-lg font-medium">{current.question.question}</p>
            {answeredQuestion === null ? (
              <div className="mt-3 space-y-2">
                {current.question.choices.map((c: string, i: number) => (
                  <button
                    key={i}
                    onClick={() => setAnsweredQuestion(i)}
                    className="block w-full text-left px-3 py-2 rounded border border-blue-200 bg-white hover:bg-blue-100 transition-colors"
                  >
                    {c}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3">
                <p>Your answer: <strong>{current.question.choices[answeredQuestion]}</strong></p>
                <p className={answeredQuestion === current.question.correctIndex ? "text-green-700 font-bold" : "text-red-700 font-bold"}>
                  {answeredQuestion === current.question.correctIndex ? "Correct!" : "Not quite."}
                </p>
                <p className="text-sm mt-1 text-stone-700">{current.question.explanation}</p>
                <button 
                  onClick={() => setAnsweredQuestion(null)} 
                  className="mt-2 text-sm text-blue-600 underline"
                >
                  Hide feedback
                </button>
              </div>
            )}
          </div>
        )}

        {ended ? (
          <>
            <p className="text-center text-stone-500 italic mt-4">· The End ·</p>

            {/* Final check for understanding / comprehension quiz at the end of playthrough */}
            {story.finalQuiz && (
              <div className="mt-6 p-4 border border-green-300 bg-green-50 rounded">
                <h2 className="font-bold text-lg mb-2 text-green-800">{story.finalQuiz.title}</h2>
                <p className="text-sm mb-4 text-green-700">{story.finalQuiz.instructions}</p>
                {!quizSubmitted ? (
                  <div className="space-y-4">
                    {story.finalQuiz.questions.map((q: any, qi: number) => (
                      <div key={qi}>
                        <p><strong>Q{qi + 1}: </strong>{q.question}</p>
                        <div className="mt-1 space-y-1">
                          {q.choices.map((c: string, ci: number) => (
                            <label key={ci} className="flex items-center gap-2 text-sm">
                              <input 
                                type="radio" 
                                name={`finalq${qi}`} 
                                onChange={() => setQuizAnswers(prev => ({...prev, [qi]: ci}))}
                                checked={quizAnswers[qi] === ci}
                              />
                              {c}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                    <button 
                      onClick={() => setQuizSubmitted(true)} 
                      className="mt-4 px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800"
                      disabled={Object.keys(quizAnswers).length < (story.finalQuiz.questions?.length || 0)}
                    >
                      Submit Final Answers
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {story.finalQuiz.questions.map((q: any, qi: number) => {
                      const userAns = quizAnswers[qi];
                      const correct = userAns === q.correctIndex;
                      return (
                        <div key={qi} className="border-t pt-2">
                          <p><strong>Q{qi + 1}: </strong>{q.question}</p>
                          <p className={correct ? "text-green-700" : "text-red-700"}>
                            Your answer: {q.choices[userAns]} {correct ? "✓" : "✗"}
                          </p>
                          <p className="text-sm">Correct: {q.choices[q.correctIndex]}</p>
                          <p className="text-sm text-stone-600">{q.explanation}</p>
                          {q.context && <p className="text-xs text-stone-500">({q.context})</p>}
                        </div>
                      );
                    })}
                    <p className="mt-2 text-sm text-green-700">Thank you for completing the check for understanding!</p>
                  </div>
                )}
              </div>
            )}
          </>
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
