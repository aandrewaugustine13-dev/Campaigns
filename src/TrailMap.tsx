import { useState, useEffect, useRef, useMemo } from "react";
import type { TrailStop } from "./campaigns/types";

// ═══════════════════════════════════════════════════════════════
// TRAIL MAP — parchment map with herd following the trail
// Accepts campaign-specific path, stops, map image, and distance.
// ═══════════════════════════════════════════════════════════════

function getHerdPosition(
  trailPath: [number, number][],
  progress: number,
): { x: number; y: number } {
  const p = Math.max(0, Math.min(100, progress)) / 100;
  const totalSegments = trailPath.length - 1;
  const exactIndex = p * totalSegments;
  const i = Math.floor(exactIndex);
  const t = exactIndex - i;

  if (i >= totalSegments) return { x: trailPath[totalSegments][0], y: trailPath[totalSegments][1] };

  const [x1, y1] = trailPath[i];
  const [x2, y2] = trailPath[i + 1];
  return {
    x: x1 + (x2 - x1) * t,
    y: y1 + (y2 - y1) * t,
  };
}

function nextSupplyTown(trailStops: TrailStop[], progress: number): TrailStop | null {
  return trailStops.find(s => s.supply && s.pct > progress) || null;
}

export default function TrailMap({
  progress,
  day,
  totalDays,
  trailPath,
  trailStops,
  mapImage,
  totalDistance,
}: {
  progress: number;
  day: number;
  totalDays: number;
  trailPath: [number, number][];
  trailStops: TrailStop[];
  mapImage: string;
  totalDistance: number;
}) {
  const [milestoneId, setMilestoneId] = useState<string | null>(null);
  const reachedRef = useRef<Set<string>>(new Set([trailStops[0]?.id]));

  useEffect(() => {
    for (const stop of trailStops) {
      if (progress >= stop.pct && !reachedRef.current.has(stop.id)) {
        reachedRef.current.add(stop.id);
        setMilestoneId(stop.id);
        const t = setTimeout(() => setMilestoneId(null), 3000);
        return () => clearTimeout(t);
      }
    }
  }, [progress, trailStops]);

  const campMarkers = useMemo(
    () =>
      trailStops
        .filter((stop) => stop.supply && stop.id !== trailStops[0]?.id)
        .map((stop) => {
          const [x, y] = trailPath[stop.pathIndex];
          return { id: stop.id, name: stop.name, x, y };
        }),
    [trailPath, trailStops],
  );

  const herd = useMemo(() => getHerdPosition(trailPath, progress), [trailPath, progress]);
  const nextSupply = nextSupplyTown(trailStops, progress);
  const approachingSupply = nextSupply && (nextSupply.pct - progress) < 8;
  const currentStop = [...trailStops].reverse().find(s => progress >= s.pct) || trailStops[0];
  const flashStop = milestoneId ? trailStops.find(s => s.id === milestoneId) : null;
  const distMult = totalDistance / 100;

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
                src={mapImage}
                alt="Trail Map"
                className="absolute inset-0 w-full h-full object-fill"
                draggable={false}
                onError={(e) => {
                  const el = e.target as HTMLImageElement;
                  el.style.display = "none";
                  el.parentElement!.style.background = "linear-gradient(135deg, #3d2a1a 0%, #2a1f15 50%, #1a1510 100%)";
                }}
              />

              {/* Static camp markers */}
              {campMarkers.map((camp) => (
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
              <span>{Math.round(progress * distMult)} mi</span>
              <span>{totalDistance} mi</span>
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
                ? `🏪 ${nextSupply.name} — ${Math.round((nextSupply.pct - progress) * distMult)} mi`
                : `Next supplies: ${nextSupply.name} (${Math.round((nextSupply.pct - progress) * distMult)} mi)`
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
