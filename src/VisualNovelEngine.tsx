import React from "react";
import { getBackgroundForEvent, getDoomFace } from "./AssetConfig";

interface VisualNovelProps {
  currentEvent: any;
  handleChoice: (index: number) => void;
  bossHealth: number;
  scoutHealth: number;
}

export default function VisualNovelEngine({ currentEvent, handleChoice, bossHealth, scoutHealth }: VisualNovelProps) {
  if (!currentEvent) return null;
  const bgImage = getBackgroundForEvent(currentEvent.id);

  return (
    <div className="relative w-full bg-black overflow-hidden border-4 border-stone-800">
      {/* Background scene */}
      <div className="relative w-full h-40">
        <img
          src={bgImage}
          alt="Background"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ imageRendering: "pixelated" }}
        />
      </div>

      {/* Dialogue area with flanking portraits */}
      <div className="relative bg-[#1a0f0a] px-2 py-2">
        <div className="flex items-end gap-2">
          {/* Boss portrait - left */}
          <div className="flex-shrink-0 flex flex-col items-center">
            <div className="bg-[#1a0f0a] border-2 border-[#3d2516] p-0.5 rounded">
              <img
                src={getDoomFace("boss", bossHealth)}
                className="w-14 h-14"
                style={{ imageRendering: "pixelated" }}
                alt="Trail Boss"
              />
            </div>
            <span className="text-[#e6c280] font-bold mt-0.5" style={{ fontSize: '8px' }}>Boss</span>
          </div>

          {/* Dialogue box - center */}
          <div className="flex-1 min-w-0">
            <div className="bg-[#e6c280] border-4 border-[#8b5a2b] rounded shadow-[4px_4px_0px_rgba(0,0,0,0.5)] p-2.5">
              <p className="text-[#5c3a21] font-bold text-sm mb-2 drop-shadow-sm leading-snug">
                {currentEvent.text}
              </p>
              <div className="space-y-1">
                {currentEvent.choices.map((c: any, i: number) => (
                  <button
                    key={i}
                    onClick={() => handleChoice(i)}
                    className="w-full text-left p-1.5 bg-[#d4a86a] border-2 border-[#b88645] hover:bg-[#ffdf99] hover:border-[#d4a86a] text-[#4a2e1b] font-bold text-xs transition-colors shadow-inner"
                  >
                    ▶ {c.text}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Scout portrait - right */}
          <div className="flex-shrink-0 flex flex-col items-center">
            <div className="bg-[#1a0f0a] border-2 border-[#3d2516] p-0.5 rounded">
              <img
                src={getDoomFace("scout", scoutHealth)}
                className="w-14 h-14"
                style={{ imageRendering: "pixelated" }}
                alt="Scout"
              />
            </div>
            <span className="text-[#e6c280] font-bold mt-0.5" style={{ fontSize: '8px' }}>Scout</span>
          </div>
        </div>
      </div>
    </div>
  );
}
