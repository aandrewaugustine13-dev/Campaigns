import React, { useEffect, useRef, useState } from "react";
import { getDoomFace } from "./AssetConfig";
import AnimatedPortrait from "./AnimatedPortrait";
import {
  getPortraitStateForHealth,
  isPortraitRole,
} from "./portraitSystem";
import { getCharacterAsset } from "./campaignAssets";

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

export default function DoomHUD({ members, theme = 'default', campaignId = 'default' }: { members: PartyMember[], theme?: string, campaignId?: string }) {
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

  const themeClasses = {
    default: {
      container: "bg-[#261b15] border-[#574230]",
      title: "text-[#c9b89f]",
      card: "bg-[#1b130f] border-[#5a4434]",
      name: "text-stone-200",
      barBg: "bg-[#3a281f] border-[#5a4432]"
    },
    frontier: {
      container: "bg-[#d9c5a3] border-[#b08d57]",
      title: "text-[#5d4a26]",
      card: "bg-[#e6d5b8] border-[#b08d57]",
      name: "text-stone-800",
      barBg: "bg-[#cdaa7d] border-[#b08d57]"
    },
    parchment: {
      container: "bg-[#f5ead2] border-stone-900",
      title: "text-stone-900",
      card: "bg-white/40 border-stone-900",
      name: "text-stone-900",
      barBg: "bg-stone-200 border-stone-900"
    }
  }[theme as 'frontier' | 'parchment' | 'default'] || {
    container: "bg-[#261b15] border-[#574230]",
    title: "text-[#c9b89f]",
    card: "bg-[#1b130f] border-[#5a4434]",
    name: "text-stone-200",
    barBg: "bg-[#3a281f] border-[#5a4432]"
  };

  return (
    <div className={`flex-shrink-0 ${themeClasses.container} border-t-2 p-2 md:px-4`}>
      <div className={`${themeClasses.title} text-xs font-bold uppercase mb-1 drop-shadow-md`}>
        Party Status HUD
      </div>
      <div className="w-full flex items-start justify-center gap-2 md:gap-3 overflow-x-auto py-1">
        {members.map((m) => {
          const historicalAsset = getCharacterAsset(campaignId, m.role);
          const faceSrc = historicalAsset ? historicalAsset.portrait : getDoomFace(m.id, m.health);
          const fallbackSrc = STATIC_PORTRAIT_MAP[m.id];
          const isCritical = m.health <= 25;

          return (
            <div key={m.id} className={`w-[78px] flex-shrink-0 flex flex-col items-center ${themeClasses.card} border rounded p-1`}>
              <div
                key={`portrait-${m.id}-${damageTriggers[m.id] ?? 0}`}
                className={`w-12 h-12 flex-shrink-0 relative ${damageTriggers[m.id] ? "juice-portrait-hit" : ""}`}
              >
                {faceSrc ? (
                  <img
                    src={faceSrc}
                    alt={m.role}
                    className="w-full h-full object-cover rounded-sm"
                    style={{ imageRendering: historicalAsset ? "auto" : "pixelated" }}
                    onError={(e) => { 
                      if (fallbackSrc) {
                        (e.target as HTMLImageElement).src = fallbackSrc;
                      } else {
                        (e.target as HTMLImageElement).style.display = 'none';
                        const parent = (e.target as HTMLImageElement).parentElement;
                        if (parent) {
                          parent.classList.add('flex', 'items-center', 'justify-center', 'bg-stone-700', 'text-stone-400', 'text-lg', 'font-bold');
                          parent.innerText = m.role.charAt(0);
                        }
                      }
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-stone-700 text-stone-400 text-lg font-bold rounded-sm">
                    {m.role.charAt(0)}
                  </div>
                )}
                {isCritical && (
                  <div className="absolute inset-0 bg-red-600 opacity-30 mix-blend-multiply animate-pulse"></div>
                )}
              </div>
              <span className={`${themeClasses.name} font-bold mt-1 tracking-wide`} style={{ fontSize: "9px" }}>
                {m.role}
              </span>
              <div className={`w-full h-1.5 ${themeClasses.barBg} mt-1 border overflow-hidden rounded-full`}>
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
