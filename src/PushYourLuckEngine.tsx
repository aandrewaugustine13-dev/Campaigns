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
  };
  onUpdate: (effects: Resources) => void;
  onLeave: (finalLog: string[]) => void;
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
    <div className="border-2 border-amber-800 rounded p-3 bg-stone-800 space-y-4 shadow-lg">
      <div>
        <h2 className="text-amber-400 font-bold text-lg mb-2">{event.title}</h2>
        <div className="bg-stone-900 border border-stone-700 p-3 rounded space-y-2 h-48 overflow-y-auto font-mono text-xs">
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
  );
}
