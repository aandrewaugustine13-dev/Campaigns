import React, { useState } from "react";

interface Resources { [key: string]: number; }
interface PushAttempt {
  id: string;
  buttonText: string;
  successText: string;
  failureText: string;
  riskChance: number;
  rewards: Resources;
  penalties: Resources;
}

interface PushYourLuckEngineProps {
  event: {
    title: string;
    text: string;
    attempts?: PushAttempt[];
    leaveText?: string;
    image?: string; // 🔴 NEW: Added image support
    trivia?: string[];
    sageAdvice?: { name: string; role: string; line: string }[];
  };
  onUpdate: (effects: Resources) => void;
  onLeave: (finalLog: string[]) => void;
}

function PushSageReveal({ sages }: { sages: { name: string; role: string; line: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const sage = sages[0];
  return (
    <div className="mb-2">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full text-left p-2 bg-stone-700/50 border border-stone-600 rounded text-stone-300 text-xs font-bold hover:bg-stone-600 transition-colors"
        >
          🧙 Ask a Sage for guidance…
        </button>
      ) : (
        <div className="bg-stone-700/50 border border-stone-600 rounded p-2">
          <p className="text-amber-300 text-xs font-bold">{sage.name}, {sage.role}:</p>
          <p className="text-stone-300 text-xs italic mt-0.5">"{sage.line}"</p>
        </div>
      )}
    </div>
  );
}

function PushTriviaBox({ trivia }: { trivia: string[] }) {
  const text = React.useMemo(
    () => trivia[Math.floor(Math.random() * trivia.length)],
    // New trivia fact is picked once per trivia array reference (i.e., per event)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trivia]
  );
  return (
    <div className="bg-amber-900/30 border border-amber-800/50 rounded p-2 mb-2">
      <p className="text-amber-200 text-xs italic">
        💡 <strong>Did you know?</strong> {text}
      </p>
    </div>
  );
}

export default function PushYourLuckEngine({ event, onUpdate, onLeave }: PushYourLuckEngineProps) {
  const [attemptIndex, setAttemptIndex] = useState(0);
  const [log, setLog] = useState<string[]>([event.text]);
  const [failed, setFailed] = useState(false);

  const attempts = event.attempts || [];
  const currentAttempt = attempts[attemptIndex];

  const handleAttempt = () => {
    if (!currentAttempt) return;

    const roll = Math.random();

    if (roll < currentAttempt.riskChance) {
      // Failed!
      setLog(prev => [...prev, `💥 CRITICAL FAILURE: ${currentAttempt.failureText}`]);
      onUpdate(currentAttempt.penalties);
      setFailed(true); // Lock out further attempts
    } else {
      // Succeeded!
      setLog(prev => [...prev, `✅ SUCCESS: ${currentAttempt.successText}`]);
      onUpdate(currentAttempt.rewards);
      setAttemptIndex(prev => prev + 1); // Unlock the next tier
    }
  };

  return (
    <div className="border-2 border-amber-800 rounded bg-stone-800 shadow-lg overflow-hidden">
      {/* 🔴 NEW: Dynamic Image Banner */}
      {event.image && (
        <div className="w-full h-32 relative border-b border-amber-900/50">
          <img 
            src={`/campaigns/silkroad/${event.image}`} 
            alt={event.title}
            className="w-full h-full object-cover"
            style={{ imageRendering: "pixelated", objectPosition: "center" }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-800 via-transparent to-transparent" />
        </div>
      )}

      <div className="p-3 space-y-4">
        <div>
          <h2 className="text-amber-400 font-bold text-lg mb-2">{event.title}</h2>
          {/* Did you know? */}
          {event.trivia && event.trivia.length > 0 && (
            <PushTriviaBox trivia={event.trivia} />
          )}
          {/* Ask a Sage */}
          {event.sageAdvice && event.sageAdvice.length > 0 && (
            <PushSageReveal sages={event.sageAdvice} />
          )}
          <div className="bg-stone-900 border border-stone-700 p-3 rounded space-y-2 h-40 overflow-y-auto font-mono text-xs">
            {log.map((entry, i) => (
              <p key={i} className={entry.includes('CRITICAL FAILURE') ? 'text-red-400 font-bold' : entry.includes('SUCCESS') ? 'text-emerald-400' : 'text-stone-300'}>
                {entry}
              </p>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {!failed && attemptIndex < attempts.length && (
            <button 
              onClick={handleAttempt}
              className="w-full text-left p-3 bg-amber-900/50 hover:bg-amber-800 rounded text-sm text-amber-100 font-bold transition-colors border border-amber-700 flex justify-between items-center"
            >
              <span>▶ {currentAttempt.buttonText}</span>
              <span className="text-red-400 text-xs">Risk: {Math.round(currentAttempt.riskChance * 100)}%</span>
            </button>
          )}
          
          <button 
            onClick={() => onLeave(log)}
            className="w-full text-center p-2 bg-stone-700 hover:bg-stone-600 rounded text-xs text-stone-300 font-bold transition-colors border border-stone-600 mt-2"
          >
            {failed ? "Limp away in defeat" : (event.leaveText || "Move On")}
          </button>
        </div>
      </div>
    </div>
  );
}
