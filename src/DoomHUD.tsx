import React, { useEffect, useRef, useState } from "react";
import { getDoomFace } from "./AssetConfig";
import AnimatedPortrait from "./AnimatedPortrait";
import {
  getPortraitStateForHealth,
  isPortraitRole,
} from "./portraitSystem";

interface PartyMember {
  id: string;
  role: string;
  label: string;
  health: number;
}

// State-based portraits sliced from Grok-generated character sheets
// Falls back to static pixel dither PNGs if state portrait fails to load
const STATIC_PORTRAIT_MAP: Record<string, string> = {
  boss: "/faces/role01_64_dither.png",
  wrangler: "/faces/role02_64_dither.png",
  point: "/faces/role03_64_dither.png",
  hand: "/faces/role04_64_dither.png",
  cook: "/faces/role05_64_dither.png",
  scout: "/faces/role06_64_dither.png",
};

export default function DoomHUD({ members }: { members: PartyMember[] }) {
  const previousHealth = useRef<Record<string, number>>({});
  const [damageTriggers, setDamageTriggers] = useState<Record<string, number>>({});

  useEffect(() => {
    const nextTriggers: Record<string, number> = {};
    let changed = false;

    members.forEach((member) => {
      const prior = previousHealth.current[member.id];
      if (typeof prior === "number" && member.health < prior) {
        nextTriggers[member.id] = (damageTriggers[member.id] ?? 0) + 1;
        changed = true;
      }
      previousHealth.current[member.id] = member.health;
    });

    if (changed) {
      setDamageTriggers((prev) => ({ ...prev, ...nextTriggers }));
    }
  }, [members, damageTriggers]);

  return (
    <div className="flex-shrink-0 bg-[#2d1b11] border-t-4 border-[#1a0f0a] p-2 md:px-4">
      <div className="text-[#a0a0a0] text-xs font-bold uppercase mb-1 drop-shadow-md">
        Party Status HUD
      </div>
      <div className={`w-full grid gap-2 ${members.length <= 5 ? "grid-cols-5" : "grid-cols-6"}`}>
        {members.map((m) => {
          const faceSrc = getDoomFace(m.id, m.health);
          const fallbackSrc = STATIC_PORTRAIT_MAP[m.id];
          const isCritical = m.health <= 25;

          return (
            <div key={m.id} className="flex flex-col items-center bg-[#1a0f0a] border-2 border-[#3d2516] p-1">
              <div
                key={`portrait-${m.id}-${damageTriggers[m.id] ?? 0}`}
                className={`w-12 h-12 relative ${damageTriggers[m.id] ? "juice-portrait-hit" : ""}`}
              >
                <img
                  src={faceSrc}
                  alt={m.role}
                  className="w-full h-full object-cover"
                  style={{ imageRendering: "auto" }}
                  onError={(e) => { if (fallbackSrc) (e.target as HTMLImageElement).src = fallbackSrc; }}
                />
                {isCritical && (
                  <div className="absolute inset-0 bg-red-600 opacity-30 mix-blend-multiply animate-pulse"></div>
                )}
              </div>
              <span className="text-white font-bold mt-1" style={{ fontSize: "9px" }}>
                {m.role}
              </span>
              <div className="w-full h-1.5 bg-red-900 mt-1 border border-black overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${m.health > 50 ? "bg-green-500" : m.health > 25 ? "bg-yellow-500" : "bg-red-500"}`}
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
