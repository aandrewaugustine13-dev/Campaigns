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
  // Portrait load stage per member. Absent = try primary src; "fallback" = the
  // primary 404'd, show the static map image; "failed" = no image resolved,
  // render the letter fallback. React owns the whole subtree — no DOM mutation.
  const [portraitStage, setPortraitStage] = useState<Record<string, "fallback" | "failed">>({});

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

  // Theming via CSS variables: DoomHUD inherits data-theme from its ancestor
  // wrapper (GeneratedCampaign main view sets it; Chisholm App.tsx does not,
  // so :root defaults apply — keeping Chisholm's existing dark-leather look
  // unchanged). The theme prop is retained for API compatibility but unused.
  void theme;
  const themeClasses = {
    container: "theme-bg-card theme-border",
    title: "theme-text-accent",
    card: "theme-bg-card-inner theme-border",
    name: "theme-text",
    barBg: "theme-bg-track theme-divider",
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
          const stage = portraitStage[m.id];
          const displaySrc = stage === "failed" ? "" : stage === "fallback" ? fallbackSrc : faceSrc;

          return (
            <div key={m.id} className={`w-[78px] flex-shrink-0 flex flex-col items-center ${themeClasses.card} border rounded p-1`}>
              <div
                key={`portrait-${m.id}-${damageTriggers[m.id] ?? 0}`}
                className={`w-12 h-12 flex-shrink-0 relative ${damageTriggers[m.id] ? "juice-portrait-hit" : ""}`}
              >
                {displaySrc ? (
                  <img
                    src={displaySrc}
                    alt={m.role}
                    className="w-full h-full object-cover rounded-sm"
                    style={{ imageRendering: historicalAsset && stage !== "fallback" ? "auto" : "pixelated" }}
                    onError={() => {
                      setPortraitStage((prev) =>
                        !prev[m.id] && fallbackSrc
                          ? { ...prev, [m.id]: "fallback" }
                          : { ...prev, [m.id]: "failed" }
                      );
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
