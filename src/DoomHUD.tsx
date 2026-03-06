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
    <div className="flex-shrink-0 bg-[#2d1b11] border-t-4 border-[#1a0f0a] p-2">
      <div className="text-[#a0a0a0] text-xs font-bold uppercase mb-1 drop-shadow-md">
        Party Status HUD
      </div>
      <div className={`max-w-lg mx-auto grid gap-2 ${members.length <= 5 ? "grid-cols-5" : "grid-cols-6"}`}>
        {members.map((m) => {
          const isCritical = m.health <= 25;

          return (
            <div key={m.id} className="flex flex-col items-center bg-[#1a0f0a] border-2 border-[#3d2516] p-1">
              <div className="w-12 h-12 relative border border-black">
                {isPortraitRole(m.id) ? (
                  <AnimatedPortrait
                    roleId={m.id}
                    state={getPortraitStateForHealth(m.health)}
                    damageTrigger={damageTriggers[m.id] ?? 0}
                  />
                ) : (
                  <img
                    src={getDoomFace(m.id, m.health)}
                    alt={m.role}
                    className="w-full h-full object-cover"
                    style={{ imageRendering: "pixelated" }}
                  />
                )}
                {isCritical && !isPortraitRole(m.id) && (
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
