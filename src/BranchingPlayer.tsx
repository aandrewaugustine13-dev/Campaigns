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
        <p className="text-sm text-[#8a7f6a]">We hit an issue assembling the full story. Please choose a different story from the menu, or ask your teacher to regenerate it.</p>
        <BackLink onBack={onBack} />
      </div>
    </div>
  );
}

// Generate an educational 300–400 word summary of the specific playthrough.
// Pulls directly from the passages the student actually visited + the quiz facts.
// Respects outputLanguage so framing text matches the story language.
function generateStorySummary(
  story: BranchingStory,
  history: ChoiceStep[],
  endingId: string,
  language: string = "English"
): string {
  const byId = passageMap(story);

  // Reconstruct the exact sequence of passages the student read
  const path: string[] = [story.start];
  history.forEach((h) => path.push(h.next));

  const played = path
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<ReturnType<typeof byId.get>> => !!p && !!p.text);

  if (played.length === 0) {
    return language === "Spanish" ? "Llegaste al final de la historia." : "You reached the end of the story.";
  }

  const parts: string[] = [];

  // Intro (language-aware for POC)
  const protagonist = story.protagonist || "the central figure";
  const title = story.title || "";
  const introEn = `In "${title}", you lived through events as ${protagonist}. Your choices shaped which moments you witnessed and which historical figures you encountered along the way.`;
  const introEs = `En "${title}", viviste eventos como ${protagonist}. Tus elecciones moldearon los momentos que presenciaste y las figuras históricas que encontraste en el camino.`;
  const introOther = `In "${title}", you lived through events as ${protagonist} (story content generated in ${language}). Your choices shaped the moments and historical figures encountered.`;
  parts.push(language === "Spanish" ? introEs : (language === "English" ? introEn : introOther));

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
      .map((h) => {
        if (language === "Spanish") return `Elegiste "${h.choiceText}".`;
        if (language === "English") return `You chose "${h.choiceText}."`;
        return `Chose: "${h.choiceText}." (in ${language})`;
      })
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

  // Reflective close (language-aware)
  const closeEn = "Reviewing these events and the people involved helps connect the individual moments into a clearer picture of the history.";
  const closeEs = "Revisar estos eventos y las personas involucradas ayuda a conectar los momentos individuales en una imagen más clara de la historia.";
  const closeOther = `Reviewing these events helps understand the history (content in ${language}).`;
  parts.push(language === "Spanish" ? closeEs : (language === "English" ? closeEn : closeOther));

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

  // Polish: micro loading state for smoother passage changes and quiz submit
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);

  // Visual feedback for choice selection
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState<number | null>(null);

  // Text-to-speech for accessibility (per-passage read aloud)
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const current = byId.get(currentId);

  // Progress for student: clear step counter (even in branching, shows how far in their path)
  const currentStep = history.length + 1;
  const totalPassages = story.passages.length;

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
    const lang = story.outputLanguage || "English";
    return generateStorySummary(story, history, currentId, lang);
  }, [quizSubmitted, story, history, currentId]);

  useEffect(() => {
    setAnsweredQuestion(null);
  }, [currentId]);

  const choose = useCallback((choiceIndex: number) => {
    const p = byId.get(currentId);
    const c = p?.choices?.[choiceIndex];
    if (!c || !byId.has(c.next) || isAdvancing) return; // defensive + prevent double
    setSelectedChoiceIndex(choiceIndex);
    setIsAdvancing(true);
    // Small delay + visual feedback for smoother "page turn" feel between passages
    setTimeout(() => {
      setHistory((h) => [...h, { passageId: currentId, choiceIndex, choiceText: c.text, next: c.next }]);
      setCurrentId(c.next);
      setIsAdvancing(false);
      setSelectedChoiceIndex(null);
    }, 200); // slightly longer to show feedback
  }, [byId, currentId, isAdvancing]);

  // Text-to-speech handler using Web Speech API
  const handleSpeak = useCallback(() => {
    if (!current?.text || typeof window === 'undefined') return;

    const synth = window.speechSynthesis;
    if (!synth) {
      // Browser doesn't support it - silently do nothing for now (first version)
      return;
    }

    // If currently speaking this or anything, stop it
    if (isSpeaking) {
      synth.cancel();
      setIsSpeaking(false);
      return;
    }

    // Cancel any ongoing speech (important for reliability)
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(current.text);
    // Make it student-friendly: slightly slower and clear
    utterance.rate = 0.92;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onend = () => {
      setIsSpeaking(false);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
    };

    utteranceRef.current = utterance;
    synth.speak(utterance);
    setIsSpeaking(true);
  }, [current, isSpeaking]);

  // Stop speech when leaving the passage or unmounting
  useEffect(() => {
    setAnsweredQuestion(null);

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [currentId]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

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

  // Determine passage type for visual distinction
  const hasFigureQuestion = !!current.question;
  const hasChoices = !ended && (current.choices?.length ?? 0) > 0;

  // Ending visuals for the three distinct endings
  const endingVisuals = {
    broken: {
      label: "Broken",
      icon: "💔",
      color: "text-red-400",
      border: "border-red-700/60",
      bg: "bg-red-950/20",
      description: "You survived, but the journey took a heavy toll. Something vital was lost or broken within you."
    },
    indifferent: {
      label: "Indifferent",
      icon: "😐",
      color: "text-slate-400",
      border: "border-slate-600/60",
      bg: "bg-slate-900/20",
      description: "You made it through unscathed in spirit. The events passed over you, leaving little mark."
    },
    triumphant: {
      label: "Triumphant",
      icon: "🌟",
      color: "text-emerald-400",
      border: "border-emerald-600/60",
      bg: "bg-emerald-950/20",
      description: "You came through changed for the better. The costs were real, but you hold onto something meaningful."
    }
  };

  const currentEnding = ended && current.endingState ? endingVisuals[current.endingState] : null;

  return (
    <div className="min-h-screen bg-[#18140f] bg-[radial-gradient(at_50%_15%,#221f1a_0%,transparent_55%)] text-[#c5b8a0] flex items-center justify-center p-6">
      <div className="max-w-xl w-full space-y-5">
        <h1 className="text-xs uppercase tracking-widest text-[#8a7f6a] text-center">{story.title}</h1>

        {/* Clear progress indicator — high-visibility for students */}
        <div className="text-center -mt-1 mb-1">
          <div className="inline-flex items-baseline gap-1.5 text-[10px] tracking-[1.5px] text-[#8a7f6a]">
            <span>Passage</span>
            <span className="font-mono text-[#c9a36b] tabular-nums">{currentStep}</span>
            {totalPassages > 0 && <span className="opacity-60">/ {totalPassages}</span>}
          </div>
          {/* Subtle progress bar for finished / engaging feel */}
          <div className="mt-1.5 mx-auto w-36 h-[3px] bg-[#322c24] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#c9a36b] transition-all duration-300"
              style={{ width: `${Math.min(100, Math.round((currentStep / Math.max(1, totalPassages)) * 100))}%` }}
            />
          </div>
        </div>

        {/* Passage card: image (optional) + prose in a contained, game-like panel */}
        <div 
          className={`rounded-2xl overflow-hidden transition-all duration-200 ${isAdvancing ? 'opacity-40' : 'opacity-100'} ${
            hasFigureQuestion 
              ? 'border-2 border-[#c9a36b] bg-[#1f2a22]' 
              : hasChoices 
                ? 'border border-[#6a6358] bg-[#211e1a]' 
                : 'border border-[#3a3630] bg-[#211e1a]'
          }`}
        >
          {/* Teacher-curated image (if any) — shown during review/play for visual stories */}
          {current.image?.thumbUrl && (
            <div>
              <img
                src={current.image.thumbUrl}
                alt=""
                className="w-full h-auto"
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

          {/* The story passage prose — key triggers natural re-animation on change */}
          <div key={currentId} className="p-6 transition-opacity duration-300">
            {/* Type indicator for visual distinction */}
            {(hasFigureQuestion || hasChoices) && (
              <div className="mb-3 text-xs uppercase tracking-[2px] flex items-center gap-2 text-[#b89d6e]">
                {hasFigureQuestion ? (
                  <>
                    <span>🗣️</span>
                    <span>Figure Encounter</span>
                  </>
                ) : hasChoices ? (
                  <>
                    <span>⚖️</span>
                    <span>Decision Point</span>
                  </>
                ) : null}
              </div>
            )}

            {/* Speaker button for text-to-speech accessibility */}
            <div className="flex justify-end mb-2">
              <button
                onClick={handleSpeak}
                className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-all border ${
                  isSpeaking
                    ? 'bg-[#3a2f1f] border-[#c9a36b] text-[#c9a36b]'
                    : 'border-[#3a3630] text-[#8a7f6a] hover:text-[#c9a36b] hover:border-[#5a5548] hover:bg-[#2a2722]'
                }`}
                aria-label={isSpeaking ? 'Stop reading passage aloud' : 'Read passage aloud'}
                title={isSpeaking ? 'Stop' : 'Read aloud'}
              >
                <span className="text-sm">{isSpeaking ? '⏹' : '🔊'}</span>
                <span className="font-medium tracking-wide">{isSpeaking ? 'Stop' : 'Read'}</span>
              </button>
            </div>

            <p className="text-[21px] leading-[1.65] font-serif whitespace-pre-line text-[#e8dcc8]">
              {current.text}
            </p>
          </div>
        </div>

        {/* In-story question from historical figure (sage-style trivia, when present on the passage) */}
        {current.question && (
          <div className="border-2 border-[#c9a36b] bg-[#1f2a22] rounded-2xl p-4">
            <p className="font-semibold text-[#b89d6e]">A historical figure asks:</p>
            <p className="mt-2 text-lg font-medium text-[#e8dcc8]">{current.question.question}</p>
            {answeredQuestion === null ? (
              <div className="mt-3 space-y-2">
                {current.question.choices.map((c: string, i: number) => (
                  <button
                    key={i}
                    onClick={() => setAnsweredQuestion(i)}
                    className="block w-full text-left px-4 py-2.5 rounded-xl border border-[#3a3630] bg-[#24211d] hover:bg-[#2c2924] active:scale-[0.985] transition-all text-[#c5b8a0]"
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
            <div className={`text-center pt-1 ${currentEnding ? currentEnding.border : ''}`}>
              <p className={`text-xs tracking-[3px] uppercase flex items-center justify-center gap-2 ${currentEnding ? currentEnding.color : 'text-[#8a7f6a]'}`}>
                {currentEnding ? (
                  <>
                    <span>{currentEnding.icon}</span>
                    <span>— {currentEnding.label} —</span>
                    <span>{currentEnding.icon}</span>
                  </>
                ) : "— The End —"}
              </p>
              <div className="h-px w-8 bg-[#3a3630] mx-auto my-2" />
            </div>

            {currentEnding && (
              <div className={`mt-4 mb-4 p-4 rounded-2xl border ${currentEnding.border} ${currentEnding.bg} text-center`}>
                <div className={`text-3xl mb-2 ${currentEnding.color}`}>{currentEnding.icon}</div>
                <div className={`font-semibold text-lg tracking-tight ${currentEnding.color}`}>You reached a {currentEnding.label} ending</div>
                <p className="mt-2 text-sm text-[#c5b8a0]">{currentEnding.description}</p>
              </div>
            )}

            {/* Final check for understanding / comprehension quiz at the end of playthrough */}
            {story.finalQuiz && (
              <div className={`mt-5 border-2 border-[#c9a36b] bg-[#1f2a22] rounded-2xl p-5 transition-opacity shadow-sm ${isSubmittingQuiz ? 'opacity-80' : ''}`}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">🏆</span>
                  <h2 className="font-semibold text-xl text-[#c9a36b] tracking-tight">{story.finalQuiz.title}</h2>
                </div>
                <p className="text-sm mb-5 text-[#a69a80] leading-relaxed">{story.finalQuiz.instructions}</p>
                {!quizSubmitted ? (
                  <div className="space-y-4">
                    {story.finalQuiz.questions.map((q: any, qi: number) => {
                      const selected = quizAnswers[qi];
                      return (
                        <div key={qi} className="rounded-2xl border border-[#3a3630] bg-[#1c1915] p-4">
                          <div className="flex items-baseline gap-2 mb-3">
                            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-[#3a3630] text-[#c9a36b]">Q{qi + 1}</span>
                            <p className="text-[#e8dcc8] font-medium leading-snug">{q.question}</p>
                          </div>
                          <div className="space-y-2">
                            {q.choices.map((c: string, ci: number) => {
                              const isSel = selected === ci;
                              return (
                                <button
                                  key={ci}
                                  type="button"
                                  onClick={() => setQuizAnswers(prev => ({...prev, [qi]: ci}))}
                                  className={`w-full text-left px-4 py-3 rounded-xl border text-[15px] transition-all flex items-center gap-3 ${
                                    isSel 
                                      ? 'border-[#c9a36b] bg-[#2a2722] text-[#e8dcc8] ring-1 ring-[#c9a36b]/30' 
                                      : 'border-[#3a3630] bg-[#24211d] hover:bg-[#2c2924] text-[#c5b8a0] hover:border-[#5a5548]'
                                  }`}
                                >
                                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full border text-xs flex-shrink-0 ${isSel ? 'border-[#c9a36b] bg-[#c9a36b] text-[#1f2a22]' : 'border-[#5a5548] text-[#5a5548]'}`}>
                                    {String.fromCharCode(65 + ci)}
                                  </span>
                                  <span>{c}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    <button 
                      onClick={() => {
                        setIsSubmittingQuiz(true);
                        // Pleasant micro-delay for feedback — makes submit feel deliberate & processed
                        setTimeout(() => {
                          setQuizSubmitted(true);
                          setIsSubmittingQuiz(false);
                        }, 320);
                      }} 
                      className="mt-3 w-full px-6 py-3 bg-[#5c4635] hover:bg-[#6a523f] active:bg-[#3a2f1f] text-[#e8dcc8] rounded-2xl border-2 border-[#c9a36b]/50 text-base font-semibold tracking-wide transition-all disabled:opacity-50"
                      disabled={Object.keys(quizAnswers).length < (story.finalQuiz.questions?.length || 0) || isSubmittingQuiz}
                    >
                      {isSubmittingQuiz ? "Checking your answers…" : "Submit Final Answers"}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 text-sm">
                    {/* Results header */}
                    <div className="text-center pb-2">
                      <div className="text-xs uppercase tracking-[2px] text-[#b89d6e] mb-1">Quiz Complete</div>
                      {quizScore && (
                        <div className="inline-flex items-center gap-3 bg-[#2a2722] border border-[#c9a36b]/30 rounded-2xl px-6 py-2">
                          <div className="text-3xl font-semibold tabular-nums text-[#c9a36b]">{quizScore.percent}%</div>
                          <div className="text-left text-xs leading-tight">
                            <div className="text-[#e8dcc8]">{quizScore.correct} / {quizScore.total} correct</div>
                          </div>
                        </div>
                      )}
                    </div>

                    {story.finalQuiz.questions.map((q: any, qi: number) => {
                      const userAns = quizAnswers[qi];
                      const correct = userAns === q.correctIndex;
                      return (
                        <div 
                          key={qi} 
                          className={`rounded-xl border p-4 ${correct 
                            ? 'border-emerald-700/50 bg-emerald-900/10' 
                            : 'border-red-700/50 bg-red-900/10'
                          }`}
                        >
                          <p className="text-[#e8dcc8] font-medium mb-2"><strong>Q{qi + 1}: </strong>{q.question}</p>
                          
                          <div className="space-y-1 text-xs">
                            <div className={`flex items-start gap-2 ${correct ? 'text-emerald-400' : 'text-red-400'}`}>
                              <span className="font-mono mt-0.5">You:</span> 
                              <strong className="text-[#e8dcc8]">{q.choices[userAns]}</strong> 
                              <span>{correct ? "✓" : "✗"}</span>
                            </div>
                            <div className="flex items-start gap-2 text-[#c5b8a0]">
                              <span className="font-mono mt-0.5">Correct:</span> 
                              <span>{q.choices[q.correctIndex]}</span>
                            </div>
                          </div>

                          <p className="mt-2 text-[#a69a80] text-[13px] leading-snug">{q.explanation}</p>
                          {q.context && <p className="text-[10px] text-[#8a7f6a] mt-1">({q.context})</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Post-quiz learning support: always show a story summary after the quiz is submitted.
                Retake is offered only for scores below 90% and reuses the exact same questions. */}
            {quizSubmitted && story.finalQuiz && quizScore && (
              <div className="mt-6 space-y-4">
                {/* Educational story summary — generated from the passages the student actually played */}
                {storySummary && (
                  <div className="border border-[#3a3630] bg-[#211e1a] rounded-2xl p-5">
                    <div className="uppercase tracking-[2.5px] text-[#b89d6e] text-[10px] mb-2">What happened in your story</div>
                    <div className="text-[#e8dcc8] leading-[1.65] text-[15px]">
                      {storySummary}
                    </div>
                  </div>
                )}

                {/* Ending + Quiz results summary */}
                <div className={`text-center border-2 rounded-2xl p-5 ${currentEnding ? currentEnding.border + ' ' + currentEnding.bg : 'border-[#3a3630] bg-[#211e1a]'}`}>
                  {currentEnding && (
                    <div className={`text-lg font-semibold mb-1 ${currentEnding.color}`}>
                      {currentEnding.icon} {currentEnding.label} Ending {currentEnding.icon}
                    </div>
                  )}
                  <p className={quizScore.percent >= 90 ? "text-emerald-400 font-semibold text-lg" : "text-[#c5b8a0] text-base"}>
                    {quizScore.percent >= 90 
                      ? `Excellent work! You scored ${quizScore.percent}%.` 
                      : `You scored ${quizScore.percent}%.`}
                  </p>
                  <p className="mt-1 text-xs text-[#a69a80]">
                    {quizScore.percent >= 90 
                      ? "You have a strong understanding of the key events and figures." 
                      : "Review the summary and consider what you might do differently."}
                  </p>
                  {quizScore.percent < 90 && (
                    <button
                      onClick={() => {
                        setQuizAnswers({});
                        setQuizSubmitted(false);
                      }}
                      className="mt-3 px-6 py-2 rounded-2xl border border-[#c9a36b] bg-[#2a2722] hover:bg-[#3a2f1f] text-[#e8dcc8] text-sm tracking-wide"
                    >
                      Retake the Final Quiz
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Decision moment indicator (only for non-figure passages) */}
            {!ended && !hasFigureQuestion && (
              <div className="text-xs uppercase tracking-[2px] text-[#6a6358] mb-1 flex items-center gap-1.5">
                <span>⚖️</span> Make your choice
              </div>
            )}
            <div className={`space-y-2.5 pt-1 transition-opacity duration-200 ${isAdvancing ? 'opacity-70 pointer-events-none' : ''} ${!hasFigureQuestion ? 'border border-[#5a5548] rounded-xl p-2 bg-[#1c1915]' : ''}`}>
              {(current.choices ?? []).map((c, i) => {
              const isSelected = selectedChoiceIndex === i;
              const nextPassage = byId.get(c.next);
              const leadsToEnding = nextPassage?.endingState;
              const endingHint = leadsToEnding ? endingVisuals[leadsToEnding] : null;

              return (
                <button
                  key={i}
                  onClick={() => choose(i)}
                  disabled={isAdvancing}
                  className={`block w-full text-left px-4 py-3 rounded-2xl border transition-all text-[#e8dcc8] text-[17px] leading-snug disabled:opacity-70
                    ${isSelected
                      ? 'border-[#c9a36b] bg-[#2a2722] scale-[1.02] shadow-sm'
                      : endingHint 
                        ? `border-[#3a3630] bg-[#24211d] hover:bg-[#2c2924] active:scale-[0.985] active:bg-[#2c2924] ${endingHint.border.replace('border-', 'hover:border-')}`
                        : 'border-[#3a3630] bg-[#24211d] hover:bg-[#2c2924] active:scale-[0.985] active:bg-[#2c2924]'
                    } ${endingHint ? 'pr-3' : ''}`}
                >
                  <span className="flex items-center justify-between">
                    <span>{c.text}</span>
                    <span className="flex items-center gap-1 ml-2">
                      {isSelected && (
                        <span className="text-[#c9a36b] text-sm transition-all">→</span>
                      )}
                      {endingHint && (
                        <span className={`text-xs ${endingHint.color} opacity-70`} title={`Leads toward ${endingHint.label}`}>
                          {endingHint.icon}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
            </div>
          </>
        )}

        <BackLink onBack={onBack} />
      </div>
    </div>
  );
}
