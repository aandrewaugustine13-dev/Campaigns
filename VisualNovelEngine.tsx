// src/VisualNovelEngine.tsx
import React from "react";
import { getBackgroundForEvent } from "./AssetConfig";

interface VisualNovelProps {
  currentEvent: any; // Use your GameEvent type here
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

      {/* 2. STREET FIGHTER PORTRAITS (Mid-ground) */}
      <div className="absolute bottom-16 w-full flex justify-between px-4">
        <div className="flex flex-col items-center transform transition-transform hover:scale-105">
          <img 
            src={`/assets/portraits/boss_${bossHealth > 50 ? 'confident' : 'wary'}.png`} 
            className="h-48 drop-shadow-xl" 
            style={{ imageRendering: "pixelated" }} 
            alt="Trail Boss" 
          />
        </div>
        <div className="flex flex-col items-center transform transition-transform hover:scale-105">
          <img 
            src={`/assets/portraits/scout_${scoutHealth > 50 ? 'cautious' : 'desperate'}.png`} 
            className="h-48 drop-shadow-xl" 
            style={{ imageRendering: "pixelated" }} 
            alt="Scout" 
          />
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
