import React from "react";
import { getDoomFace } from "./AssetConfig";

interface PartyMember {
  id: string;
  role: string;
  label: string;
  health: number;
}

const STATIC_PORTRAIT_MAP: Record<string, string> = {
  boss: "/faces/role01_64_dither.png",
  wrangler: "/faces/role02_64_dither.png",
  point: "/faces/role03_64_dither.png",
  hand: "/faces/role04_64_dither.png",
  cook: "/faces/role05_64_dither.png",
  scout: "/faces/role06_64_dither.png",
};

export default function DoomHUD({ members }: { members: PartyMember[] }) {
  return (
    <div className="flex-shrink-0 bg-[#2d1b11] border-t-4 border-[#1a0f0a] p-2">
      <div className="text-[#a0a0a0] text-xs font-bold uppercase mb-1 drop-shadow-md">
        Party Status HUD
      </div>
      <div className={`max-w-lg mx-auto grid gap-2 ${members.length <= 5 ? "grid-cols-5" : "grid-cols-6"}`}>
        {members.map((m) => {
          const faceSrc = STATIC_PORTRAIT_MAP[m.id] ?? getDoomFace(m.id, m.health);
          const isCritical = m.health <= 25;

          return (
            <div key={m.id} className="flex flex-col items-center bg-[#1a0f0a] border-2 border-[#3d2516] p-1">
              <div className="w-12 h-12 relative">
                <img
                  src={faceSrc}
                  alt={m.role}
                  className="w-full h-full object-cover"
                  style={{ imageRendering: "pixelated" }}
                />
                {isCritical && (
                  <div className="absolute inset-0 bg-red-600 opacity-30 mix-blend-multiply"></div>
                )}
              </div>
              <span className="text-white font-bold mt-1" style={{ fontSize: "9px" }}>
                {m.role}
              </span>
              <div className="w-full h-1.5 bg-red-900 mt-1 border border-black">
                <div
                  className={`h-full ${m.health > 50 ? "bg-green-500" : "bg-red-500"}`}
                  style={{ width: `${m.health}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
