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
    <button onClick={onBack} className="block w-full text-center text-xs text-[#8a7f6a] hover:text-[#c5b8a0] mt-6 tracking-wide">
      ← Back to Campaigns
    </button>
  );
}

// Graceful fallback for a story a model emitted broken — a clear message, never a
// crash and never a kid stranded in a dead/looping passage.
function Unplayable({ onBack }: { onBack?: () => void }) {
  return (
    <div className="min-h-screen bg-[#18140f] bg-[radial-gradient(at_50%_15%,#221f1a_0%,transparent_55%)] text-[#c5b8a0] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-3 border border-[#3a3630] bg-[#211e1a] rounded-2xl p-6">
        <p className="text-lg font-serif">This story isn&rsquo;t ready to play yet.</p>
        <p className="text-sm text-[#8a7f6a]">Something went wrong putting it together. Please pick another story.</p>
        <BackLink onBack={onBack} />
      </div>
    </div>
  );
}

// Generate an educational 300–400 word summary of the specific playthrough.
// Pulls directly from the passages the student actually visited + the quiz facts.
function generateStorySummary(
  story: BranchingStory,
  history: ChoiceStep[],
  endingId: string
): string {
  const byId = passageMap(story);

  // Reconstruct the exact sequence of passages the student read
  const path: string[] = [story.start];
  history.forEach((h) => path.push(h.next));

  const played = path
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<ReturnType<typeof byId.get>> => !!p && !!p.text);

  if (played.length === 0) {
    return "You reached the end of the story.";
  }

  const parts: string[] = [];

  // Intro
  const protagonist = story.protagonist || "the central figure";
  parts.push(
    `In "${story.title}", you lived through events as ${protagonist}. Your choices shaped which moments you witnessed and which historical figures you encountered along the way.`
  );

  // Sample representative beats from the actual path (beginning, turning points, ending)
  const indices: number[] = [0];
  if (played.length >= 3) indices.push(Math.min(2, played.length - 1));
  if (played.length >= 5) indices.push(Math.floor(played.length * 0.45));
  if (played.length >= 7) indices.push(Math.floor(played.length * 0.7));
  indices.push(played.length - 1);

  const used = new Set<string>();
  indices.forEach((i) => {
    const p = played[i];
    if (!p) return;
    // Take the first 1–2 natural sentences for a concise scene
    let excerpt = p.text.replace(/\s+/g, " ").trim();
    const sentences = excerpt.split(/(?<=[.!?])\s+/).filter(Boolean);
    excerpt = sentences.slice(0, 2).join(" ");
    if (excerpt.length > 210) excerpt = excerpt.slice(0, 207) + "…";
    if (excerpt && !used.has(excerpt)) {
      used.add(excerpt);
      parts.push(excerpt);
    }
  });

  // Personalize with choices the student actually made
  if (history.length > 0) {
    const choiceNotes = history
      .slice(0, 3)
      .map((h) => `You chose "${h.choiceText}."`)
      .join(" ");
    if (choiceNotes) parts.push(choiceNotes);
  }

  // Pull educational content from the final quiz (these are the core facts the story was built to teach)
  if (story.finalQuiz?.questions?.length) {
    const takeaways: string[] = [];
    story.finalQuiz.questions.forEach((q: any) => {
      if (typeof q.explanation === "string" && q.explanation.trim()) {
        let exp = q.explanation.replace(/\s+/g, " ").trim();
        if (exp.length > 130) exp = exp.slice(0, 127) + "…";
        takeaways.push(exp);
      }
    });
    if (takeaways.length > 0) {
      parts.push(
        "Important facts from this story: " + takeaways.slice(0, 4).join(" ")
      );
    }
  }

  // Reflective close
  parts.push(
    "Reviewing these events and the people involved helps connect the individual moments into a clearer picture of the history."
  );

  let summary = parts.join(" ");

  // Ensure we reach a helpful length by adding one more substantial excerpt when the path is rich
  const wordCount = summary.split(/\s+/).length;
  if (wordCount < 260 && played.length > 4) {
    const midPassage = played[Math.floor(played.length / 2)] || played[2];
    if (midPassage) {
      const extra = midPassage.text.replace(/\s+/g, " ").trim().slice(0, 280);
      summary += " " + extra;
    }
  }

  // Cap at ~380 words for readability while staying in the requested 300–400 range
  const words = summary.split(/\s+/);
  if (words.length > 385) {
    summary = words.slice(0, 385).join(" ") + ".";
  }

  return summary;
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

  // Score derived only after the student submits the final quiz
  const quizScore = useMemo(() => {
    if (!quizSubmitted || !story.finalQuiz?.questions?.length) return null;
    const questions = story.finalQuiz.questions;
    const correctCount = questions.reduce((acc: number, q: any, idx: number) => {
      return acc + (quizAnswers[idx] === q.correctIndex ? 1 : 0);
    }, 0);
    const total = questions.length;
    const percent = Math.round((correctCount / total) * 100);
    return { correct: correctCount, total, percent };
  }, [quizSubmitted, story.finalQuiz, quizAnswers]);

  // The story summary is generated from the exact path the student took
  // plus the built-in quiz content. It only computes after submission.
  const storySummary = useMemo(() => {
    if (!quizSubmitted || !story.finalQuiz) return "";
    return generateStorySummary(story, history, currentId);
  }, [quizSubmitted, story, history, currentId]);

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
    <div className="min-h-screen bg-[#18140f] bg-[radial-gradient(at_50%_15%,#221f1a_0%,transparent_55%)] text-[#c5b8a0] flex items-center justify-center p-6">
      <div className="max-w-xl w-full space-y-5">
        <h1 className="text-xs uppercase tracking-widest text-[#8a7f6a] text-center">{story.title}</h1>

        {/* Passage card: image (optional) + prose in a contained, game-like panel */}
        <div className="border border-[#3a3630] bg-[#211e1a] rounded-2xl overflow-hidden">
          {/* Teacher-curated image (if any) — shown during review/play for visual stories */}
          {current.image?.thumbUrl && (
            <div>
              <img
                src={current.image.thumbUrl}
                alt=""
                className="w-full max-h-72 object-cover"
              />
              {(current.image.artist || current.image.license) && (
                <div className="text-[10px] text-[#8a7f6a] px-4 pt-1.5 pb-2 border-t border-[#3a3630]">
                  {current.image.artist || "Curated"} {current.image.license ? `· ${current.image.license}` : ""}
                  {current.image.sourceUrl && (
                    <>
                      {" · "}
                      <a
                        href={current.image.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-[#c5b8a0]"
                      >
                        Source
                      </a>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* The story passage prose */}
          <div className="p-6">
            <p className="text-[21px] leading-[1.65] font-serif whitespace-pre-line text-[#e8dcc8]">
              {current.text}
            </p>
          </div>
        </div>

        {/* In-story question from historical figure (sage-style trivia, when present on the passage) */}
        {current.question && (
          <div className="border border-[#3a3630] bg-[#1c1915] rounded-2xl p-4">
            <p className="font-semibold text-[#b89d6e]">A historical figure asks:</p>
            <p className="mt-2 text-lg font-medium text-[#e8dcc8]">{current.question.question}</p>
            {answeredQuestion === null ? (
              <div className="mt-3 space-y-2">
                {current.question.choices.map((c: string, i: number) => (
                  <button
                    key={i}
                    onClick={() => setAnsweredQuestion(i)}
                    className="block w-full text-left px-3 py-2 rounded-xl border border-[#3a3630] bg-[#24211d] hover:bg-[#2a2722] transition-colors text-[#c5b8a0]"
                  >
                    {c}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-sm">
                <p className="text-[#c5b8a0]">Your answer: <strong className="text-[#e8dcc8]">{current.question.choices[answeredQuestion]}</strong></p>
                <p className={answeredQuestion === current.question.correctIndex ? "text-emerald-400 font-semibold mt-1" : "text-red-400 font-semibold mt-1"}>
                  {answeredQuestion === current.question.correctIndex ? "Correct!" : "Not quite."}
                </p>
                <p className="mt-1 text-[#a69a80]">{current.question.explanation}</p>
                <button
                  onClick={() => setAnsweredQuestion(null)}
                  className="mt-2 text-xs text-[#b89d6e] underline hover:text-[#c9a36b]"
                >
                  Hide feedback
                </button>
              </div>
            )}
          </div>
        )}

        {ended ? (
          <>
            <p className="text-center text-[#8a7f6a] italic mt-1 tracking-wide">— The End —</p>

            {/* Final check for understanding / comprehension quiz at the end of playthrough */}
            {story.finalQuiz && (
              <div className="mt-5 border border-[#3a3630] bg-[#211e1a] rounded-2xl p-4">
                <h2 className="font-semibold text-lg mb-1.5 text-[#c9a36b]">{story.finalQuiz.title}</h2>
                <p className="text-sm mb-4 text-[#a69a80]">{story.finalQuiz.instructions}</p>
                {!quizSubmitted ? (
                  <div className="space-y-4">
                    {story.finalQuiz.questions.map((q: any, qi: number) => (
                      <div key={qi}>
                        <p className="text-[#e8dcc8]"><strong>Q{qi + 1}: </strong>{q.question}</p>
                        <div className="mt-1.5 space-y-1.5">
                          {q.choices.map((c: string, ci: number) => (
                            <label key={ci} className="flex items-center gap-2 text-sm text-[#c5b8a0]">
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
                      className="mt-2 px-4 py-2 bg-[#463426] hover:bg-[#5a4635] text-[#e8dcc8] rounded-xl border border-[#3a3630] disabled:opacity-50"
                      disabled={Object.keys(quizAnswers).length < (story.finalQuiz.questions?.length || 0)}
                    >
                      Submit Final Answers
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 text-sm">
                    {story.finalQuiz.questions.map((q: any, qi: number) => {
                      const userAns = quizAnswers[qi];
                      const correct = userAns === q.correctIndex;
                      return (
                        <div key={qi} className="border-t border-[#3a3630] pt-2.5">
                          <p className="text-[#e8dcc8]"><strong>Q{qi + 1}: </strong>{q.question}</p>
                          <p className={correct ? "text-emerald-400" : "text-red-400"}>
                            Your answer: {q.choices[userAns]} {correct ? "✓" : "✗"}
                          </p>
                          <p className="text-[#c5b8a0]">Correct: {q.choices[q.correctIndex]}</p>
                          <p className="text-[#a69a80]">{q.explanation}</p>
                          {q.context && <p className="text-xs text-[#8a7f6a]">({q.context})</p>}
                        </div>
                      );
                    })}

                    {/* Score shown immediately after the answer review */}
                    {quizScore && (
                      <div className="pt-3 mt-1 border-t border-[#3a3630] text-center">
                        <div className="text-lg font-semibold text-[#c9a36b]">
                          {quizScore.correct} / {quizScore.total} correct — {quizScore.percent}%
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Post-quiz learning support: always show a story summary after the quiz is submitted.
                Retake is offered only for scores below 90% and reuses the exact same questions. */}
            {quizSubmitted && story.finalQuiz && quizScore && (
              <>
                {/* Educational story summary — generated from the passages the student actually played */}
                {storySummary && (
                  <div className="mt-6 border border-[#3a3630] bg-[#211e1a] rounded-2xl p-5">
                    <div className="uppercase tracking-[2.5px] text-[#b89d6e] text-[10px] mb-2">Story Summary</div>
                    <div className="text-[#e8dcc8] leading-[1.65] text-[15px]">
                      {storySummary}
                    </div>
                  </div>
                )}

                {/* Conditional completion or second-chance retake */}
                {quizScore.percent >= 90 ? (
                  <div className="mt-4 text-center">
                    <p className="text-emerald-400 font-medium">Excellent work! You scored {quizScore.percent}%.</p>
                    <p className="mt-1 text-xs text-[#8a7f6a]">You have a strong understanding of the key events and figures.</p>
                  </div>
                ) : (
                  <div className="mt-5 text-center">
                    <button
                      onClick={() => {
                        setQuizAnswers({});
                        setQuizSubmitted(false);
                      }}
                      className="px-6 py-2.5 rounded-2xl border border-[#3a3630] bg-[#24211d] hover:bg-[#2c2924] text-[#e8dcc8] text-sm tracking-wide"
                    >
                      Retake Quiz
                    </button>
                    <p className="mt-2 text-xs text-[#8a7f6a]">
                      Review the summary above, then try the same questions again.
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="space-y-2.5 pt-1">
            {(current.choices ?? []).map((c, i) => (
              <button
                key={i}
                onClick={() => choose(i)}
                className="block w-full text-left px-4 py-3 rounded-2xl border border-[#3a3630] bg-[#24211d] hover:bg-[#2c2924] transition-colors text-[#e8dcc8] text-[17px] leading-snug"
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
