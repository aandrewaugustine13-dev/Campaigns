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
    <div className="relative w-full h-80 bg-black overflow-hidden border-4 border-stone-800">
      {/* 1. LAYERED BACKGROUND */}
      <img
        src={bgImage}
        alt="Background"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ imageRendering: "pixelated" }}
      />

      {/* 2. CHARACTER PORTRAITS (Mid-ground) */}
      <div className="absolute bottom-20 w-full flex justify-between px-4">
        <div className="flex flex-col items-center">
          <div className="bg-[#1a0f0a] border-2 border-[#3d2516] p-1 rounded">
            <img
              src={getDoomFace("boss", bossHealth)}
              className="w-16 h-16 drop-shadow-xl"
              style={{ imageRendering: "pixelated" }}
              alt="Trail Boss"
            />
          </div>
          <div className="bg-[#1a0f0a]/80 border border-[#3d2516] px-2 py-0.5 mt-1 rounded">
            <span className="text-[#e6c280] font-bold" style={{ fontSize: '10px' }}>Trail Boss</span>
            <span className="text-stone-400 ml-1" style={{ fontSize: '9px' }}>{Math.round(bossHealth)}%</span>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <div className="bg-[#1a0f0a] border-2 border-[#3d2516] p-1 rounded">
            <img
              src={getDoomFace("scout", scoutHealth)}
              className="w-16 h-16 drop-shadow-xl"
              style={{ imageRendering: "pixelated" }}
              alt="Scout"
            />
          </div>
          <div className="bg-[#1a0f0a]/80 border border-[#3d2516] px-2 py-0.5 mt-1 rounded">
            <span className="text-[#e6c280] font-bold" style={{ fontSize: '10px' }}>Scout</span>
            <span className="text-stone-400 ml-1" style={{ fontSize: '9px' }}>{Math.round(scoutHealth)}%</span>
          </div>
        </div>
      </div>

      {/* 3. STARDEW VALLEY DIALOGUE BOX (Foreground) */}
      <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-11/12">
        <div className="bg-[#e6c280] border-4 border-[#8b5a2b] rounded shadow-[4px_4px_0px_rgba(0,0,0,0.5)] p-3">
          <h2 className="text-[#5c3a21] font-bold text-sm mb-2 drop-shadow-sm">
            {currentEvent.text}
          </h2>
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
    </div>
  );
}
