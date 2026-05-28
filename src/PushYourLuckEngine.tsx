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

interface CommonsImage {
  thumbUrl: string;
  artist: string;
  license: string;
  sourceUrl: string;
}

interface PushYourLuckEngineProps {
  event: {
    title: string;
    text: string;
    attempts?: PushAttempt[];
    leaveText?: string;
    // Two image shapes coexist: legacy string path (Silk Road's hand-coded
    // pixel art under /campaigns/silkroad/) and CommonsImage (generator-
    // produced via wikimedia.ts enrichEventImages). Discriminated at render.
    image?: string | CommonsImage;
  };
  onUpdate: (effects: Resources) => void;
  onLeave: (finalLog: string[]) => void;
  backdropImage?: CommonsImage;
}

function isCommonsImage(v: unknown): v is CommonsImage {
  return typeof v === "object" && v !== null && typeof (v as any).thumbUrl === "string";
}

export default function PushYourLuckEngine({ event, onUpdate, onLeave, backdropImage }: PushYourLuckEngineProps) {
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

  // Resolve banner image: Commons object on event → string path on event
  // (Silk Road legacy) → campaign backdrop → none.
  const commonsImage: CommonsImage | undefined = isCommonsImage(event.image)
    ? event.image
    : backdropImage;
  const legacyImagePath: string | undefined = typeof event.image === "string" ? event.image : undefined;

  return (
    <div className="border border-[#6a503d] rounded bg-stone-800 shadow-lg overflow-hidden">
      {commonsImage ? (
        <div className="w-full h-32 relative border-b border-[#5b4536]">
          <img
            src={commonsImage.thumbUrl}
            alt={event.title}
            className="w-full h-full object-cover"
            style={{ objectPosition: "center" }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-800 via-transparent to-transparent" />
        </div>
      ) : legacyImagePath ? (
        <div className="w-full h-32 relative border-b border-[#5b4536]">
          <img
            src={`/campaigns/silkroad/${legacyImagePath}`}
            alt={event.title}
            className="w-full h-full object-cover"
            style={{ imageRendering: "pixelated", objectPosition: "center" }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-800 via-transparent to-transparent" />
        </div>
      ) : null}

      {commonsImage && (
        <div className="bg-stone-900 px-3 py-1 text-stone-500 border-b border-stone-700 leading-tight" style={{ fontSize: "11px" }}>
          {commonsImage.artist} · {commonsImage.license} ·{" "}
          <a
            href={commonsImage.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-stone-300"
          >
            Source
          </a>
        </div>
      )}

      <div className="p-3 space-y-4">
        <div>
          <h2 className="text-amber-300 font-bold text-lg mb-2 tracking-wide">{event.title}</h2>
          <div className="bg-stone-900 border border-stone-700 p-3 rounded space-y-2 h-40 overflow-y-auto text-xs leading-relaxed">
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
              className="w-full text-left p-3 bg-[#5a351b] hover:bg-[#704122] rounded text-sm text-amber-100 font-bold transition-colors border border-[#8c623d] flex justify-between items-center"
            >
              <span>▶ {currentAttempt.buttonText}</span>
              <span className="text-red-400 text-xs">Risk: {Math.round(currentAttempt.riskChance * 100)}%</span>
            </button>
          )}
          
          <button 
            onClick={() => onLeave(log)}
            className="w-full text-center p-2 bg-stone-700 hover:bg-[#4a372a] rounded text-xs text-stone-300 font-bold transition-colors border border-stone-600 mt-2"
          >
            {failed ? "Limp away in defeat" : (event.leaveText || "Move On")}
          </button>
        </div>
      </div>
    </div>
  );
}
