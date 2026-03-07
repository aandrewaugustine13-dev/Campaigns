import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// CHISHOLM TRAIL MAP — real map background with interactive overlay
// Coordinates are % positions mapped to the actual map image
// ═══════════════════════════════════════════════════════════════

interface TrailStop {
  id: string;
  name: string;
  x: number;        // % from left
  y: number;        // % from top
  pct: number;      // % along trail (0=San Antonio, 100=Abilene)
  supply: boolean;
  labelSide: "left" | "right";
}

const STOPS: TrailStop[] = [
  { id: "sanantonio", name: "San Antonio",      x: 46,  y: 87,  pct: 0,   supply: true,  labelSide: "left" },
  { id: "austin",     name: "Austin",           x: 56,  y: 76,  pct: 12,  supply: true,  labelSide: "right" },
  { id: "waco",       name: "Waco",             x: 60,  y: 64,  pct: 25,  supply: true,  labelSide: "right" },
  { id: "fortworth",  name: "Fort Worth",       x: 55,  y: 52,  pct: 37,  supply: true,  labelSide: "right" },
  { id: "redriver",   name: "Red River Station", x: 47, y: 43,  pct: 50,  supply: false, labelSide: "left" },
  { id: "arbuckle",   name: "Fort Arbuckle",    x: 61,  y: 36,  pct: 58,  supply: true,  labelSide: "right" },
  { id: "abilene",    name: "Abilene",          x: 59,  y: 10,  pct: 100, supply: true,  labelSide: "right" },
];

// Interpolate herd position between stops along the trail
function getHerdPos(progress: number): { x: number; y: number } {
  if (progress <= 0) return { x: STOPS[0].x, y: STOPS[0].y };
  if (progress >= 100) return { x: STOPS[STOPS.length - 1].x, y: STOPS[STOPS.length - 1].y };

  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i];
    const b = STOPS[i + 1];
    if (progress >= a.pct && progress <= b.pct) {
      const t = (progress - a.pct) / (b.pct - a.pct);
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      };
    }
  }
  return { x: STOPS[0].x, y: STOPS[0].y };
}

function nextSupplyTown(progress: number): TrailStop | null {
  return STOPS.find(s => s.supply && s.pct > progress) || null;
}

// ═══════════════════════════════════════════════════════════════
// MAP COMPONENT
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
    <div className="flex flex-col h-full bg-[#1a1408] border-r border-stone-800 overflow-hidden">
      {/* Map image with overlay */}
      <div className="flex-1 relative min-h-0 overflow-hidden">
        <img
          src="/faces/map_chisholm.png"
          alt="Chisholm Trail Map"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: "center top" }}
          draggable={false}
        />

        {/* Dark overlay for contrast */}
        <div className="absolute inset-0 bg-black/20 pointer-events-none" />

        {/* Stop markers */}
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
              }}
            >
              {/* Approaching supply pulse */}
              {isApproaching && (
                <div
                  className="absolute rounded-full"
                  style={{
                    width: 28,
                    height: 28,
                    left: -14,
                    top: -14,
                    border: "1.5px solid #22d3ee",
                    animation: "trailPulse 1.5s ease-out infinite",
                    opacity: 0.8,
                  }}
                />
              )}

              {/* Dot */}
              <div
                className="rounded-full transition-all duration-300"
                style={{
                  width: isCurrent ? 10 : reached ? 8 : 6,
                  height: isCurrent ? 10 : reached ? 8 : 6,
                  marginLeft: isCurrent ? -5 : reached ? -4 : -3,
                  marginTop: isCurrent ? -5 : reached ? -4 : -3,
                  backgroundColor: reached
                    ? (stop.supply ? "#fbbf24" : "#d97706")
                    : "rgba(87,83,78,0.7)",
                  border: `2px solid ${reached ? "#451a03" : "rgba(68,64,60,0.6)"}`,
                  boxShadow: isFlashing
                    ? "0 0 12px rgba(251,191,36,0.9), 0 0 24px rgba(251,191,36,0.4)"
                    : isCurrent
                    ? "0 0 8px rgba(251,191,36,0.5)"
                    : "none",
                }}
              />

              {/* Supply icon */}
              {stop.supply && !reached && (
                <div
                  className="absolute text-[8px]"
                  style={{
                    top: -14,
                    left: -4,
                    opacity: isApproaching ? 1 : 0.5,
                    filter: isApproaching ? "drop-shadow(0 0 3px #22d3ee)" : "none",
                  }}
                >
                  🏪
                </div>
              )}
            </div>
          );
        })}

        {/* ── Herd Icon ─────────────────────────────────── */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${herd.x}%`,
            top: `${herd.y}%`,
            transform: "translate(-50%, -50%)",
            transition: "left 0.8s ease, top 0.8s ease",
            zIndex: 20,
          }}
        >
          {/* Glow underneath */}
          <div
            className="absolute rounded-full"
            style={{
              width: 30,
              height: 30,
              left: -15,
              top: -15,
              background: "radial-gradient(circle, rgba(251,191,36,0.35) 0%, transparent 70%)",
              animation: "trailPulse 2s ease-in-out infinite",
            }}
          />
          {/* Herd cluster SVG */}
          <svg
            width="24" height="24" viewBox="0 0 24 24"
            style={{ marginLeft: -12, marginTop: -12, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.8))" }}
          >
            {/* Trail dust puff */}
            <ellipse cx="12" cy="20" rx="8" ry="3" fill="#a08060" opacity="0.3">
              <animate attributeName="rx" values="6;9;6" dur="1.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.3;0.15;0.3" dur="1.5s" repeatCount="indefinite" />
            </ellipse>
            {/* Main cattle body - top-down longhorn silhouette */}
            <ellipse cx="12" cy="12" rx="5" ry="3.5" fill="#5c3a1e" />
            {/* Horns */}
            <line x1="5" y1="11" x2="3" y2="9" stroke="#d4a843" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="19" y1="11" x2="21" y2="9" stroke="#d4a843" strokeWidth="1.5" strokeLinecap="round" />
            {/* Head */}
            <ellipse cx="12" cy="9" rx="2.5" ry="2" fill="#7a5230" />
            {/* Trailing cattle (smaller, slightly behind) */}
            <ellipse cx="9" cy="16" rx="3" ry="2" fill="#4a2e15" opacity="0.7" />
            <ellipse cx="15" cy="16.5" rx="2.5" ry="1.8" fill="#4a2e15" opacity="0.6" />
            {/* Subtle movement lines */}
            <line x1="8" y1="18" x2="6" y2="20" stroke="#a08060" strokeWidth="0.5" opacity="0.4" />
            <line x1="16" y1="18.5" x2="18" y2="20.5" stroke="#a08060" strokeWidth="0.5" opacity="0.4" />
          </svg>
        </div>

        {/* Milestone arrival banner */}
        {flashStop && (
          <div
            className="absolute left-0 right-0 top-4 z-30 flex justify-center pointer-events-none"
          >
            <div
              className="px-3 py-1.5 rounded text-[11px] font-black uppercase tracking-wider"
              style={{
                background: "linear-gradient(135deg, rgba(69,26,3,0.9), rgba(146,64,14,0.9))",
                color: "#fef3c7",
                textShadow: "0 1px 2px rgba(0,0,0,0.7)",
                boxShadow: "0 0 20px rgba(217,119,6,0.5), inset 0 1px 0 rgba(251,191,36,0.3)",
                border: "1px solid rgba(217,119,6,0.4)",
                animation: "milestoneSlideIn 2.5s ease-out forwards",
              }}
            >
              Reached {flashStop.name}
            </div>
          </div>
        )}
      </div>

      {/* Bottom info panel */}
      <div className="px-2 py-2 border-t border-stone-800/60 bg-[#1a1408]/95 space-y-1 flex-shrink-0">
        <div className="flex justify-between items-start">
          <div className="text-[10px] text-amber-400 font-bold truncate">
            📍 {currentStop.name}
          </div>
          <div className="text-[9px] text-stone-500 text-right flex-shrink-0 ml-2">
            Day {day}/{totalDays}
          </div>
        </div>
        <div className="text-[9px] text-stone-500">
          {Math.round(progress * 8)} / 800 mi
        </div>

        {nextSupply && (
          <div className={`text-[9px] ${approachingSupply ? "text-cyan-400 font-bold" : "text-stone-600"}`}>
            {approachingSupply ? "🏪 Town ahead — " : "Next supplies: "}
            {nextSupply.name} ({Math.round((nextSupply.pct - progress) * 8)} mi)
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS for game logic integration
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
