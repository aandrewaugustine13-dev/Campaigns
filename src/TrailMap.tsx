import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// CHISHOLM TRAIL MAP — parchment map with game overlay
// Coordinates are % positions matched to the actual map artwork
// ═══════════════════════════════════════════════════════════════

interface TrailStop {
  id: string;
  name: string;
  x: number;
  y: number;
  pct: number;
  supply: boolean;
}

// Positions mapped to the parchment map image
const STOPS: TrailStop[] = [
  { id: "sanantonio", name: "San Antonio",       x: 46, y: 89,  pct: 0,   supply: true  },
  { id: "austin",     name: "Austin",            x: 52, y: 78,  pct: 12,  supply: true  },
  { id: "waco",       name: "Waco",              x: 57, y: 64,  pct: 25,  supply: true  },
  { id: "fortworth",  name: "Fort Worth",        x: 42, y: 53,  pct: 37,  supply: true  },
  { id: "redriver",   name: "Red River",         x: 40, y: 43,  pct: 50,  supply: false },
  { id: "chisholm",   name: "Chisholm's Post",   x: 38, y: 31,  pct: 60,  supply: true  },
  { id: "wichita",    name: "Wichita",           x: 54, y: 19,  pct: 82,  supply: true  },
  { id: "abilene",    name: "Abilene",           x: 50, y: 10,  pct: 100, supply: true  },
];

function getHerdPos(progress: number): { x: number; y: number } {
  if (progress <= 0) return { x: STOPS[0].x, y: STOPS[0].y };
  if (progress >= 100) return { x: STOPS[STOPS.length - 1].x, y: STOPS[STOPS.length - 1].y };
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i];
    const b = STOPS[i + 1];
    if (progress >= a.pct && progress <= b.pct) {
      const t = (progress - a.pct) / (b.pct - a.pct);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  return { x: STOPS[0].x, y: STOPS[0].y };
}

function nextSupplyTown(progress: number): TrailStop | null {
  return STOPS.find(s => s.supply && s.pct > progress) || null;
}

// ═══════════════════════════════════════════════════════════════
// HERD ICON
// ═══════════════════════════════════════════════════════════════

function HerdIcon({ x, y }: { x: number; y: number }) {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: "translate(-50%, -50%)",
        transition: "left 0.8s ease, top 0.8s ease",
        zIndex: 25,
      }}
    >
      {/* Glow */}
      <div
        className="absolute rounded-full"
        style={{
          width: 56,
          height: 56,
          left: -28,
          top: -28,
          background: "radial-gradient(circle, rgba(251,191,36,0.3) 0%, transparent 65%)",
          animation: "trailPulse 2.5s ease-in-out infinite",
        }}
      />
      {/* Illustrated herd */}
      <img
        src="/faces/icon_herd.png"
        alt="Your herd"
        style={{
          width: 52,
          height: 52,
          marginLeft: -26,
          marginTop: -26,
          mixBlendMode: "multiply",
          filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.4))",
        }}
        draggable={false}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN MAP
// ═══════════════════════════════════════════════════════════════

export default function TrailMap({
  progress,
  day,
  totalDays,
}: {
  progress: number;
  day: number;
  totalDays: number;
}) {
  const [milestoneId, setMilestoneId] = useState<string | null>(null);
  const reachedRef = useRef<Set<string>>(new Set(["sanantonio"]));

  useEffect(() => {
    for (const stop of STOPS) {
      if (progress >= stop.pct && !reachedRef.current.has(stop.id)) {
        reachedRef.current.add(stop.id);
        setMilestoneId(stop.id);
        const t = setTimeout(() => setMilestoneId(null), 3000);
        return () => clearTimeout(t);
      }
    }
  }, [progress]);

  const herd = getHerdPos(progress);
  const nextSupply = nextSupplyTown(progress);
  const approachingSupply = nextSupply && (nextSupply.pct - progress) < 8;
  const currentStop = [...STOPS].reverse().find(s => progress >= s.pct) || STOPS[0];
  const flashStop = milestoneId ? STOPS.find(s => s.id === milestoneId) : null;

  return (
    <div
      className="w-full flex flex-col h-full overflow-hidden"
      style={{
        background: "#1a1408",
        borderRight: "3px solid #2d1b11",
      }}
    >
      {/* Map area — show full map art while consuming available sidebar width */}
      <div className="flex-1 relative min-h-0 overflow-hidden bg-[#171106]">
        <div className="absolute inset-0 flex justify-center">
          <div className="relative w-full" style={{ aspectRatio: "412 / 1024", maxHeight: "100%" }}>
            <img
              src="/faces/map_chisholm.png"
              alt="Chisholm Trail"
              className="absolute inset-0 h-full w-full object-contain"
              style={{ objectPosition: "center top" }}
              draggable={false}
            />

            {/* Stop markers — dots only, map already has labels */}
            {STOPS.map(stop => {
              const reached = progress >= stop.pct;
              const isCurrent = stop.id === currentStop.id && progress > 0;
              const isApproaching = approachingSupply && nextSupply?.id === stop.id;
              const isFlashing = stop.id === milestoneId;

              return (
                <div
                  key={stop.id}
                  className="absolute"
                  style={{
                    left: `${stop.x}%`,
                    top: `${stop.y}%`,
                    transform: "translate(-50%, -50%)",
                    zIndex: isCurrent ? 15 : 10,
                  }}
                >
                  {/* Approaching supply pulse ring */}
                  {isApproaching && (
                    <div
                      className="absolute rounded-full border-2 border-cyan-400"
                      style={{
                        width: 40,
                        height: 40,
                        left: -20,
                        top: -20,
                        animation: "trailPulse 1.5s ease-out infinite",
                      }}
                    />
                  )}

                  {/* Marker dot */}
                  <div
                    className="rounded-full flex items-center justify-center transition-all duration-300"
                    style={{
                      width: isCurrent ? 18 : 14,
                      height: isCurrent ? 18 : 14,
                      marginLeft: isCurrent ? -9 : -7,
                      marginTop: isCurrent ? -9 : -7,
                      backgroundColor: reached
                        ? (stop.supply ? "#fbbf24" : "#d97706")
                        : "rgba(68,64,60,0.6)",
                      border: `2px solid ${
                        isFlashing ? "#fef3c7" : reached ? "#451a03" : "rgba(87,83,78,0.5)"
                      }`,
                      boxShadow: isFlashing
                        ? "0 0 16px rgba(251,191,36,1), 0 0 30px rgba(251,191,36,0.5)"
                        : isCurrent
                        ? "0 0 10px rgba(251,191,36,0.6)"
                        : "0 1px 3px rgba(0,0,0,0.5)",
                      fontSize: 8,
                      color: reached ? "#451a03" : "#78716c",
                    }}
                  >
                    {reached ? "✓" : ""}
                  </div>

                  {/* Supply tag — illustrated store for unreached supply towns */}
                  {stop.supply && !reached && (
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        top: -24,
                        left: "50%",
                        transform: "translateX(-50%)",
                      }}
                    >
                      <img
                        src="/faces/icon_store.png"
                        alt="Supplies"
                        style={{
                          width: isApproaching ? 36 : 28,
                          height: isApproaching ? 36 : 28,
                          mixBlendMode: "multiply",
                          opacity: isApproaching ? 1 : 0.6,
                          filter: isApproaching ? "drop-shadow(0 0 4px rgba(34,211,238,0.6))" : "none",
                          transition: "all 0.3s ease",
                        }}
                        draggable={false}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Herd icon */}
            <HerdIcon x={herd.x} y={herd.y} />
          </div>
        </div>

        {/* Milestone arrival banner */}
        {flashStop && (
          <div className="absolute left-0 right-0 top-3 z-30 flex justify-center pointer-events-none">
            <div
              className="px-3 py-1.5 rounded-lg font-black uppercase tracking-wider"
              style={{
                fontSize: 12,
                background: "linear-gradient(135deg, rgba(69,26,3,0.95), rgba(146,64,14,0.95))",
                color: "#fef3c7",
                textShadow: "0 1px 3px rgba(0,0,0,0.8)",
                boxShadow: "0 0 24px rgba(217,119,6,0.6), inset 0 1px 0 rgba(251,191,36,0.3)",
                border: "2px solid rgba(217,119,6,0.5)",
                fontFamily: "'Georgia', serif",
                animation: "milestoneSlideIn 2.5s ease-out forwards",
              }}
            >
              📍 Reached {flashStop.name}
            </div>
          </div>
        )}
      </div>

      {/* Bottom info panel */}
      <div
        className="flex-shrink-0 px-3 py-2 space-y-1.5"
        style={{
          background: "linear-gradient(135deg, #2d1b11, #1a1408)",
          borderTop: "2px solid #3d2516",
        }}
      >
        <div className="flex justify-between items-center">
          <span className="text-xs text-amber-400 font-bold" style={{ fontFamily: "'Georgia', serif" }}>
            📍 {currentStop.name}
          </span>
          <span className="text-[10px] text-stone-500">
            Day {day}/{totalDays}
          </span>
        </div>

        {/* Mileage bar */}
        <div className="space-y-0.5">
          <div className="flex justify-between text-[10px] text-stone-500">
            <span>{Math.round(progress * 8)} mi</span>
            <span>800 mi</span>
          </div>
          <div className="w-full h-2 bg-stone-800 rounded-full overflow-hidden border border-stone-700">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #92400e, #d97706, #fbbf24)",
              }}
            />
          </div>
        </div>

        {nextSupply && (
          <div
            className={`text-[11px] ${approachingSupply ? "text-cyan-400 font-bold" : "text-stone-500"}`}
            style={{ fontFamily: "'Georgia', serif" }}
          >
            {approachingSupply
              ? `🏪 ${nextSupply.name} ahead — ${Math.round((nextSupply.pct - progress) * 8)} mi`
              : `Next supplies: ${nextSupply.name} (${Math.round((nextSupply.pct - progress) * 8)} mi)`
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

export function getRegionFlavor(progress: number): string {
  if (progress < 12) return "South Texas brush country. Mesquite and prickly pear.";
  if (progress < 25) return "Rolling Hill Country. The Brazos is ahead.";
  if (progress < 37) return "Blackland Prairie. Rich soil, wide sky.";
  if (progress < 50) return "Cross Timbers. Last piece of Texas before the Nations.";
  if (progress < 60) return "Red River crossing. You're leaving Texas.";
  if (progress < 82) return "Indian Territory. Chickasaw and Choctaw country.";
  if (progress < 95) return "Kansas grasslands. You can almost smell Abilene.";
  return "Railhead country. Cattle buyers everywhere.";
}

export function isNearSupplyTown(progress: number): { near: boolean; town: string | null; distance: number } {
  const next = STOPS.find(s => s.supply && s.pct > progress);
  if (!next) return { near: false, town: null, distance: 999 };
  const dist = next.pct - progress;
  return { near: dist < 8, town: next.name, distance: Math.round(dist * 8) };
}
