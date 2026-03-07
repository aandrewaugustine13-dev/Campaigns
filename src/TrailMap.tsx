import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// CHISHOLM TRAIL MAP — real map image with game overlay
// ═══════════════════════════════════════════════════════════════

interface TrailStop {
  id: string;
  name: string;
  x: number;        // % from left on the map image
  y: number;        // % from top
  pct: number;      // % along trail (0=San Antonio, 100=Abilene)
  supply: boolean;
  labelSide: "left" | "right";
}

// Coordinates mapped to the actual map image towns
const STOPS: TrailStop[] = [
  { id: "sanantonio", name: "San Antonio",       x: 46, y: 87,  pct: 0,   supply: true,  labelSide: "left"  },
  { id: "austin",     name: "Austin",            x: 56, y: 76,  pct: 12,  supply: true,  labelSide: "right" },
  { id: "waco",       name: "Waco",              x: 60, y: 64,  pct: 25,  supply: true,  labelSide: "right" },
  { id: "fortworth",  name: "Fort Worth",        x: 55, y: 52,  pct: 37,  supply: true,  labelSide: "right" },
  { id: "redriver",   name: "Red River Station",  x: 47, y: 43,  pct: 50,  supply: false, labelSide: "left"  },
  { id: "arbuckle",   name: "Fort Arbuckle",     x: 61, y: 36,  pct: 58,  supply: true,  labelSide: "right" },
  { id: "abilene",    name: "Abilene",           x: 59, y: 10,  pct: 100, supply: true,  labelSide: "right" },
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
// STOP MARKER — game-style waypoint
// ═══════════════════════════════════════════════════════════════

function StopMarker({
  stop,
  reached,
  isCurrent,
  isApproaching,
  isFlashing,
}: {
  stop: TrailStop;
  reached: boolean;
  isCurrent: boolean;
  isApproaching: boolean;
  isFlashing: boolean;
}) {
  // Label offset based on side
  const labelStyle: React.CSSProperties = stop.labelSide === "right"
    ? { left: "100%", marginLeft: 10, textAlign: "left" as const }
    : { right: "100%", marginRight: 10, textAlign: "right" as const };

  return (
    <div
      className="absolute"
      style={{
        left: `${stop.x}%`,
        top: `${stop.y}%`,
        transform: "translate(-50%, -50%)",
        zIndex: isCurrent ? 15 : 10,
      }}
    >
      {/* Approaching supply town — pulsing ring */}
      {isApproaching && (
        <div
          className="absolute rounded-full border-2 border-cyan-400"
          style={{
            width: 44,
            height: 44,
            left: -22,
            top: -22,
            animation: "trailPulse 1.5s ease-out infinite",
          }}
        />
      )}

      {/* Main marker */}
      <div
        className="rounded-full flex items-center justify-center transition-all duration-300"
        style={{
          width: isCurrent ? 22 : 18,
          height: isCurrent ? 22 : 18,
          marginLeft: isCurrent ? -11 : -9,
          marginTop: isCurrent ? -11 : -9,
          backgroundColor: reached
            ? (stop.supply ? "#fbbf24" : "#d97706")
            : "rgba(68,64,60,0.8)",
          border: `3px solid ${
            isFlashing ? "#fef3c7"
            : reached ? "#451a03"
            : "rgba(87,83,78,0.6)"
          }`,
          boxShadow: isFlashing
            ? "0 0 16px rgba(251,191,36,1), 0 0 32px rgba(251,191,36,0.5)"
            : isCurrent
            ? "0 0 12px rgba(251,191,36,0.6)"
            : isApproaching
            ? "0 0 10px rgba(34,211,238,0.5)"
            : "0 2px 4px rgba(0,0,0,0.5)",
        }}
      >
        {/* Icon inside the marker */}
        <span style={{ fontSize: isCurrent ? 11 : 9, lineHeight: 1 }}>
          {stop.supply
            ? (reached ? "✓" : "🏪")
            : (reached ? "✓" : "•")
          }
        </span>
      </div>

      {/* Label */}
      <div
        className="absolute whitespace-nowrap pointer-events-none"
        style={{
          top: "50%",
          transform: "translateY(-50%)",
          ...labelStyle,
        }}
      >
        <div
          className="px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: "rgba(20,14,6,0.85)",
            border: `1px solid ${reached ? "rgba(217,119,6,0.4)" : "rgba(87,83,78,0.3)"}`,
          }}
        >
          <span
            className="font-bold"
            style={{
              fontSize: 12,
              color: reached ? "#fbbf24" : "#78716c",
              textShadow: "0 1px 2px rgba(0,0,0,0.8)",
            }}
          >
            {stop.name}
          </span>
          {stop.supply && !reached && (
            <span
              className="ml-1"
              style={{
                fontSize: 10,
                color: isApproaching ? "#22d3ee" : "#a8a29e",
              }}
            >
              supplies
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// HERD ICON — the player's cattle drive on the trail
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
      {/* Glow ring */}
      <div
        className="absolute rounded-full"
        style={{
          width: 48,
          height: 48,
          left: -24,
          top: -24,
          background: "radial-gradient(circle, rgba(251,191,36,0.3) 0%, transparent 65%)",
          animation: "trailPulse 2.5s ease-in-out infinite",
        }}
      />

      {/* Herd cluster */}
      <svg
        width="40" height="40" viewBox="0 0 40 40"
        style={{
          marginLeft: -20,
          marginTop: -20,
          filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.9))",
        }}
      >
        {/* Dust cloud */}
        <ellipse cx="20" cy="34" rx="14" ry="4" fill="#a08060" opacity="0.25">
          <animate attributeName="rx" values="10;15;10" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.25;0.1;0.25" dur="2s" repeatCount="indefinite" />
        </ellipse>

        {/* Trailing cattle */}
        <ellipse cx="13" cy="26" rx="5" ry="3.5" fill="#3d2512" opacity="0.6" />
        <ellipse cx="27" cy="27" rx="4.5" ry="3" fill="#3d2512" opacity="0.5" />

        {/* Lead steer body */}
        <ellipse cx="20" cy="19" rx="8" ry="5.5" fill="#5c3a1e" />
        {/* Head */}
        <ellipse cx="20" cy="13" rx="4" ry="3.5" fill="#7a5230" />
        {/* Horns */}
        <line x1="14" y1="12" x2="8" y2="8" stroke="#d4a843" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="26" y1="12" x2="32" y2="8" stroke="#d4a843" strokeWidth="2.5" strokeLinecap="round" />
        {/* Horn tips */}
        <circle cx="8" cy="8" r="1" fill="#fef3c7" />
        <circle cx="32" cy="8" r="1" fill="#fef3c7" />
        {/* Eye */}
        <circle cx="18" cy="12" r="1" fill="#1a0f0a" />
        <circle cx="22" cy="12" r="1" fill="#1a0f0a" />

        {/* Dust lines */}
        <line x1="10" y1="30" x2="6" y2="34" stroke="#a08060" strokeWidth="0.8" opacity="0.3" />
        <line x1="30" y1="30" x2="34" y2="34" stroke="#a08060" strokeWidth="0.8" opacity="0.3" />
        <line x1="20" y1="32" x2="20" y2="37" stroke="#a08060" strokeWidth="0.8" opacity="0.2" />
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN MAP COMPONENT
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
      className="flex flex-col h-full overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #1a1408 0%, #0f0c06 100%)",
        borderRight: "3px solid #2d1b11",
      }}
    >
      {/* Title bar */}
      <div
        className="flex-shrink-0 px-3 py-2 text-center"
        style={{
          background: "linear-gradient(135deg, #2d1b11, #1a1408)",
          borderBottom: "2px solid #3d2516",
        }}
      >
        <div className="text-sm font-bold text-amber-500 uppercase tracking-widest"
          style={{ fontFamily: "'Georgia', serif" }}>
          Chisholm Trail
        </div>
        <div className="text-xs text-stone-500" style={{ fontFamily: "'Georgia', serif" }}>
          San Antonio to Abilene — 1867
        </div>
      </div>

      {/* Map area */}
      <div className="flex-1 relative min-h-0 overflow-hidden">
        <img
          src="/faces/map_chisholm.png"
          alt="Chisholm Trail"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: "center top" }}
          draggable={false}
        />

        {/* Slight vignette for depth */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at center, transparent 50%, rgba(10,8,3,0.4) 100%)",
          }}
        />

        {/* Stop markers */}
        {STOPS.map(stop => (
          <StopMarker
            key={stop.id}
            stop={stop}
            reached={progress >= stop.pct}
            isCurrent={stop.id === currentStop.id && progress > 0}
            isApproaching={!!(approachingSupply && nextSupply?.id === stop.id)}
            isFlashing={stop.id === milestoneId}
          />
        ))}

        {/* Herd icon */}
        <HerdIcon x={herd.x} y={herd.y} />

        {/* Milestone arrival banner */}
        {flashStop && (
          <div className="absolute left-0 right-0 top-3 z-30 flex justify-center pointer-events-none">
            <div
              className="px-4 py-2 rounded-lg font-black uppercase tracking-wider"
              style={{
                fontSize: 13,
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

      {/* Info panel */}
      <div
        className="flex-shrink-0 px-3 py-2.5 space-y-1.5"
        style={{
          background: "linear-gradient(135deg, #2d1b11, #1a1408)",
          borderTop: "2px solid #3d2516",
        }}
      >
        {/* Current location */}
        <div className="flex justify-between items-center">
          <span className="text-xs text-amber-400 font-bold" style={{ fontFamily: "'Georgia', serif" }}>
            📍 {currentStop.name}
          </span>
          <span className="text-xs text-stone-500">
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

        {/* Next supply town */}
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
  if (progress < 58) return "Red River crossing. You're leaving Texas.";
  if (progress < 80) return "Indian Territory. Chickasaw and Choctaw country.";
  if (progress < 95) return "Kansas grasslands. You can almost smell Abilene.";
  return "Railhead country. Cattle buyers everywhere.";
}

export function isNearSupplyTown(progress: number): { near: boolean; town: string | null; distance: number } {
  const next = STOPS.find(s => s.supply && s.pct > progress);
  if (!next) return { near: false, town: null, distance: 999 };
  const dist = next.pct - progress;
  return { near: dist < 8, town: next.name, distance: Math.round(dist * 8) };
}
