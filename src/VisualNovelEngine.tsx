import React from "react";
import { getDoomFace } from "./AssetConfig";

interface VisualNovelProps {
  currentEvent: any;
  handleChoice: (index: number) => void;
  bossHealth: number;
  scoutHealth: number;
}

export default function VisualNovelEngine({ currentEvent, handleChoice, bossHealth, scoutHealth }: VisualNovelProps) {
  if (!currentEvent) return null;

  return (
    <div className="border-4 border-[#1a0f0a]">
      {/* Scene — parallax layers + portraits */}
      <div className="relative w-full overflow-hidden" style={{ height: 200 }}>
        {/* Layer 1: Static sky */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(/faces/bg_sky.png)`,
            backgroundSize: "cover",
            backgroundPosition: "center bottom",
            imageRendering: "pixelated",
          }}
        />
        {/* Layer 2: Scrolling cattle strip */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: 65,
            backgroundImage: `url(/faces/fg_cattle.png)`,
            backgroundSize: "auto 100%",
            backgroundRepeat: "repeat-x",
            backgroundPosition: "bottom",
            animation: "bgScroll 25s linear infinite, cattleBob 0.6s ease-in-out infinite",
            imageRendering: "pixelated",
          }}
        />
        {/* Vignette */}
        <div className="absolute inset-0" style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)",
        }} />

        {/* Boss portrait — left */}
        <div className="absolute bottom-2 left-3 z-10">
          <div className="bg-[#1a0f0a]/80 border-2 border-[#3d2516] p-0.5 rounded">
            <img
              src={getDoomFace("boss", bossHealth)}
              className="w-16 h-16"
              style={{ imageRendering: "pixelated" }}
              alt="Trail Boss"
            />
          </div>
          <div className="text-center">
            <span className="text-[#e6c280] font-bold drop-shadow-md" style={{ fontSize: '9px' }}>Trail Boss</span>
          </div>
        </div>

        {/* Scout portrait — right */}
        <div className="absolute bottom-2 right-3 z-10">
          <div className="bg-[#1a0f0a]/80 border-2 border-[#3d2516] p-0.5 rounded">
            <img
              src={getDoomFace("scout", scoutHealth)}
              className="w-16 h-16"
              style={{ imageRendering: "pixelated" }}
              alt="Scout"
            />
          </div>
          <div className="text-center">
            <span className="text-[#e6c280] font-bold drop-shadow-md" style={{ fontSize: '9px' }}>Scout</span>
          </div>
        </div>
      </div>

      {/* Dialogue box — below the scene */}
      <div className="bg-[#1a0f0a] p-2">
        <div className="bg-[#e6c280] border-4 border-[#8b5a2b] rounded shadow-[4px_4px_0px_rgba(0,0,0,0.5)] p-3">
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
    </div>
  );
}
