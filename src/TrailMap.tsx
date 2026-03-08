import { useState, useEffect, useRef, useMemo } from "react";

// ═══════════════════════════════════════════════════════════════
// CHISHOLM TRAIL MAP — parchment map with herd following the trail
// No clutter. Just the map art and your cattle moving north.
// ═══════════════════════════════════════════════════════════════

// Trail path points traced from the dotted line on the map image
// Each point is [x%, y%] from top-left of the image
// More points = smoother curve following the actual trail
const TRAIL_PATH: [number, number][] = [
  [50, 91],    // San Antonio
  [50, 88],
  [51, 85],
  [52, 82],    // heading toward Austin
  [53, 80],
  [54, 78],    // Austin
  [55, 75],
  [56, 72],
  [57, 69],
  [58, 66],
  [58, 64],    // Waco
  [57, 61],
  [55, 58],
  [52, 56],
  [48, 54],
  [45, 53],    // Fort Worth
  [44, 51],
  [44, 49],
  [44, 47],
  [45, 45],
  [45, 43],    // Red River / Trail Crossing
  [45, 41],
  [44, 39],
  [43, 37],
  [42, 35],
  [41, 33],
  [40, 31],    // Chisholm's Post area
  [40, 29],
  [41, 27],
  [42, 25],
  [44, 23],
  [46, 21],
  [49, 19],
  [52, 18],    // Wichita
  [52, 16],
  [51, 14],
  [50, 12],
  [49, 10],    // Abilene
];

// Trail stops — for the info panel and milestone detection
interface TrailStop {
  id: string;
  name: string;
  pathIndex: number;  // index into TRAIL_PATH where this stop sits
  pct: number;        // % along trail
  supply: boolean;
}

const STOPS: TrailStop[] = [
  { id: "sanantonio", name: "San Antonio",     pathIndex: 0,  pct: 0,   supply: true  },
  { id: "austin",     name: "Austin",          pathIndex: 5,  pct: 12,  supply: true  },
  { id: "waco",       name: "Waco",            pathIndex: 10, pct: 25,  supply: true  },
  { id: "fortworth",  name: "Fort Worth",      pathIndex: 15, pct: 37,  supply: true  },
  { id: "redriver",   name: "Red River",       pathIndex: 20, pct: 50,  supply: false },
  { id: "chisholm",   name: "Chisholm's Post", pathIndex: 26, pct: 60,  supply: true  },
  { id: "wichita",    name: "Wichita",         pathIndex: 32, pct: 82,  supply: true  },
  { id: "abilene",    name: "Abilene",         pathIndex: 36, pct: 100, supply: true  },
];

// Interpolate position along the trail path
function getHerdPosition(progress: number): { x: number; y: number } {
  const p = Math.max(0, Math.min(100, progress)) / 100;
  const totalSegments = TRAIL_PATH.length - 1;
  const exactIndex = p * totalSegments;
  const i = Math.floor(exactIndex);
  const t = exactIndex - i;

  if (i >= totalSegments) return { x: TRAIL_PATH[totalSegments][0], y: TRAIL_PATH[totalSegments][1] };

  const [x1, y1] = TRAIL_PATH[i];
  const [x2, y2] = TRAIL_PATH[i + 1];
  return {
    x: x1 + (x2 - x1) * t,
    y: y1 + (y2 - y1) * t,
  };
}

function nextSupplyTown(progress: number): TrailStop | null {
  return STOPS.find(s => s.supply && s.pct > progress) || null;
}

const CAMP_MARKERS = STOPS
  .filter((stop) => stop.supply && stop.id !== "sanantonio")
  .map((stop) => {
    const [x, y] = TRAIL_PATH[stop.pathIndex];
    return { id: stop.id, name: stop.name, x, y };
  });

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

  const herd = useMemo(() => getHerdPosition(progress), [progress]);
  const nextSupply = nextSupplyTown(progress);
  const approachingSupply = nextSupply && (nextSupply.pct - progress) < 8;
  const currentStop = [...STOPS].reverse().find(s => progress >= s.pct) || STOPS[0];
  const flashStop = milestoneId ? STOPS.find(s => s.id === milestoneId) : null;

  return (
    <div
      className="h-full overflow-hidden"
      style={{
        background: "#1c140f",
        borderRight: "2px solid #4f3828",
      }}
    >
      <div className="flex h-full min-h-0 flex-col xl:flex-row">
        {/* Map + herd overlay */}
        <div className="flex-1 min-h-0 p-2 xl:p-3 xl:pr-2">
          <div className="h-full w-full flex items-center justify-center">
            <div
              className="relative h-full max-h-full w-full max-w-full"
              style={{ aspectRatio: "412 / 1024" }}
            >
              {/* The parchment map */}
              <img
                src="/faces/map_chisholm.png"
                alt="Chisholm Trail"
                className="absolute inset-0 w-full h-full object-fill"
                draggable={false}
              />

              {/* Static camp markers */}
              {CAMP_MARKERS.map((camp) => (
                <img
                  key={camp.id}
                  src="/map-icons/camp.png"
                  alt=""
                  aria-hidden="true"
                  className="absolute pointer-events-none select-none"
                  style={{
                    left: `${camp.x}%`,
                    top: `${camp.y}%`,
                    width: "clamp(12px, 1.2vw, 16px)",
                    height: "clamp(12px, 1.2vw, 16px)",
                    transform: "translate(-50%, -50%)",
                    zIndex: 12,
                  }}
                  draggable={false}
                />
              ))}

              {/* Herd marker */}
              <img
                src="/map-icons/herd.png"
                alt=""
                aria-hidden="true"
                className="absolute pointer-events-none select-none"
                style={{
                  left: `${herd.x}%`,
                  top: `${herd.y}%`,
                  width: "clamp(14px, 1.4vw, 18px)",
                  height: "clamp(14px, 1.4vw, 18px)",
                  transform: "translate(-50%, -50%)",
                  transition: "left 1s ease-in-out, top 1s ease-in-out",
                  zIndex: 20,
                }}
                draggable={false}
              />

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
                    📍 {flashStop.name}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info panel — minimal */}
        <div
          className="flex-shrink-0 px-3 py-2 space-y-1.5 border-t-2 border-t-[#3d2516] xl:w-44 2xl:w-52 xl:border-t-0 xl:border-l xl:border-l-stone-800"
          style={{
            background: "linear-gradient(135deg, #312219, #1b1410)",
          }}
        >
          <div className="flex justify-between items-center xl:flex-col xl:items-start xl:gap-1">
            <span className="text-xs text-amber-400 font-bold" style={{ fontFamily: "'Georgia', serif" }}>
              📍 {currentStop.name}
            </span>
            <span className="text-[10px] text-stone-500">
              Day {day}/{totalDays}
            </span>
          </div>

          {/* Trail progress bar */}
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

          {/* Next supply */}
          {nextSupply && (
            <div
              className={`text-[11px] ${approachingSupply ? "text-cyan-400 font-bold" : "text-stone-500"}`}
              style={{ fontFamily: "'Georgia', serif" }}
            >
              {approachingSupply
                ? `🏪 ${nextSupply.name} — ${Math.round((nextSupply.pct - progress) * 8)} mi`
                : `Next supplies: ${nextSupply.name} (${Math.round((nextSupply.pct - progress) * 8)} mi)`
              }
            </div>
          )}
        </div>
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
