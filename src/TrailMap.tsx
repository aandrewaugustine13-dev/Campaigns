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

// Points from the start of the trail up to the current position, used to
// draw the "traveled so far" portion of the route as a solid line.
function travelledPoints(
  trailPath: [number, number][],
  progress: number,
): [number, number][] {
  const p = Math.max(0, Math.min(100, progress)) / 100;
  const totalSegments = trailPath.length - 1;
  if (totalSegments <= 0) return [trailPath[0]];
  const exactIndex = p * totalSegments;
  const i = Math.min(Math.floor(exactIndex), totalSegments);
  const pts = trailPath.slice(0, i + 1);
  const here = getHerdPosition(trailPath, progress);
  pts.push([here.x, here.y]);
  return pts;
}

export default function TrailMap({
  progress,
  day,
  totalDays,
  trailPath,
  trailStops,
  mapImage,
  totalDistance,
  markerIcon = "/map-icons/herd.png",
}: {
  progress: number;
  day: number;
  totalDays: number;
  trailPath: [number, number][];
  trailStops: TrailStop[];
  mapImage: string;
  totalDistance: number;
  markerIcon?: string;
}) {
  const [milestoneId, setMilestoneId] = useState<string | null>(null);
  const reachedRef = useRef<Set<string>>(new Set([trailStops[0]?.id]));
  // The map box is locked to the image's real proportions once it loads. If
  // the image is missing (common for generated campaigns), we drop the aspect
  // lock entirely so the map fills its column instead of rendering as a thin
  // strip stuck at the Chisholm portrait ratio.
  const [imgAspect, setImgAspect] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

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
  const fullRoute = useMemo(
    () => trailPath.map(([x, y]) => `${x},${y}`).join(" "),
    [trailPath],
  );
  const traveledRoute = useMemo(
    () => travelledPoints(trailPath, progress).map(([x, y]) => `${x},${y}`).join(" "),
    [trailPath, progress],
  );
  // Labels for every stop, placed to whichever side keeps them on the map.
  const stopLabels = useMemo(
    () =>
      trailStops.map((stop) => {
        const [x, y] = trailPath[stop.pathIndex] ?? [50, 50];
        return { id: stop.id, name: stop.name, x, y, supply: stop.supply, side: x <= 50 ? "right" : "left" as "right" | "left" };
      }),
    [trailPath, trailStops],
  );
  const startId = trailStops[0]?.id;

  // Scale bar: convert a round mile count into a fraction of the map's
  // vertical span (the path's y-range), so it reflects real distance.
  const { scaleMiles, scaleHeightPct } = useMemo(() => {
    const ys = trailPath.map((p) => p[1]);
    const yRange = Math.max(...ys) - Math.min(...ys) || 1;
    const miles = totalDistance >= 400 ? 100 : totalDistance >= 120 ? 50 : Math.max(10, Math.round(totalDistance / 4));
    return { scaleMiles: miles, scaleHeightPct: (miles / totalDistance) * yRange };
  }, [trailPath, totalDistance]);

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
              style={imgFailed ? undefined : { aspectRatio: imgAspect ?? "412 / 1024" }}
            >
              {/* The parchment map */}
              <img
                src={mapImage}
                alt="Trail Map"
                className="absolute inset-0 w-full h-full object-fill"
                draggable={false}
                onLoad={(e) => {
                  const el = e.target as HTMLImageElement;
                  if (el.naturalWidth && el.naturalHeight) {
                    setImgAspect(`${el.naturalWidth} / ${el.naturalHeight}`);
                  }
                }}
                onError={(e) => {
                  const el = e.target as HTMLImageElement;
                  el.style.display = "none";
                  el.parentElement!.style.background = "linear-gradient(135deg, #3d2a1a 0%, #2a1f15 50%, #1a1510 100%)";
                  setImgFailed(true);
                }}
              />

              {/* Route overlay: faint full route + lit traveled portion.
                  non-scaling-stroke keeps line weight uniform despite the
                  distorted (preserveAspectRatio none) viewBox. */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{ zIndex: 10 }}
                aria-hidden="true"
              >
                <polyline
                  points={fullRoute}
                  fill="none"
                  stroke="rgba(231,196,128,0.28)"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
                <polyline
                  className="trail-route-march"
                  points={traveledRoute}
                  fill="none"
                  stroke="#d97706"
                  strokeWidth={2.5}
                  strokeDasharray="5 4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

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

              {/* Stop dots (for stops without a camp icon) + name labels */}
              {stopLabels.map((s) => {
                const hasCampIcon = s.supply && s.id !== startId;
                return (
                  <div key={`label-${s.id}`}>
                    {!hasCampIcon && (
                      <span
                        className="absolute pointer-events-none"
                        style={{
                          left: `${s.x}%`,
                          top: `${s.y}%`,
                          width: 7,
                          height: 7,
                          transform: "translate(-50%, -50%)",
                          borderRadius: "9999px",
                          background: s.id === startId ? "#fbbf24" : "#e7c480",
                          border: "1px solid rgba(0,0,0,0.6)",
                          zIndex: 13,
                        }}
                      />
                    )}
                    <span
                      className="absolute pointer-events-none whitespace-nowrap font-bold"
                      style={{
                        left: `${s.x}%`,
                        top: `${s.y}%`,
                        transform: s.side === "right" ? "translate(8px, -50%)" : "translate(calc(-100% - 8px), -50%)",
                        fontSize: "clamp(8px, 0.8vw, 10px)",
                        color: "#fde9c8",
                        background: "rgba(20,14,10,0.72)",
                        padding: "1px 5px",
                        borderRadius: 4,
                        textShadow: "0 1px 2px rgba(0,0,0,0.9)",
                        fontFamily: "'Georgia', serif",
                        zIndex: 16,
                      }}
                    >
                      {s.name}
                    </span>
                  </div>
                );
              })}

              {/* Compass — north is up on this map */}
              <div
                className="absolute pointer-events-none flex flex-col items-center"
                style={{ right: 8, top: 8, zIndex: 25, color: "#fde9c8" }}
              >
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: "clamp(26px, 2.6vw, 34px)",
                    height: "clamp(26px, 2.6vw, 34px)",
                    background: "radial-gradient(circle, rgba(40,28,18,0.92), rgba(20,14,10,0.92))",
                    border: "1.5px solid rgba(217,119,6,0.6)",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.6)",
                  }}
                >
                  <span style={{ fontSize: "clamp(13px, 1.4vw, 17px)", lineHeight: 1 }}>🧭</span>
                </div>
                <span
                  className="font-black mt-0.5"
                  style={{ fontSize: "clamp(9px, 0.9vw, 11px)", textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}
                >
                  N ↑
                </span>
              </div>

              {/* Scale bar — a round mile count as a fraction of the map's
                  vertical extent, giving a real sense of distance */}
              <div
                className="absolute pointer-events-none flex items-center gap-1"
                style={{ left: 8, bottom: 10, zIndex: 25 }}
              >
                <div
                  style={{
                    width: 3,
                    height: `${scaleHeightPct}%`,
                    minHeight: 14,
                    background: "#fde9c8",
                    borderRadius: 2,
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.6)",
                    position: "relative",
                  }}
                >
                  <span style={{ position: "absolute", left: -3, top: -1, width: 9, height: 2, background: "#fde9c8" }} />
                  <span style={{ position: "absolute", left: -3, bottom: -1, width: 9, height: 2, background: "#fde9c8" }} />
                </div>
                <span
                  className="font-bold"
                  style={{
                    fontSize: "clamp(8px, 0.8vw, 10px)",
                    color: "#fde9c8",
                    textShadow: "0 1px 2px rgba(0,0,0,0.9)",
                    fontFamily: "'Georgia', serif",
                  }}
                >
                  {scaleMiles} mi
                </span>
              </div>

              {/* "You are here" marker — pulse ring behind a bobbing icon.
                  The wrapper carries the position tween; inner layers carry
                  the looping pulse/bob so the two don't fight. */}
              <div
                className="absolute pointer-events-none select-none"
                style={{
                  left: `${herd.x}%`,
                  top: `${herd.y}%`,
                  transform: "translate(-50%, -50%)",
                  transition: "left 1.1s ease-in-out, top 1.1s ease-in-out",
                  zIndex: 20,
                }}
              >
                <span
                  className="trail-marker-ring"
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: "clamp(20px, 2vw, 26px)",
                    height: "clamp(20px, 2vw, 26px)",
                    transform: "translate(-50%, -50%)",
                    borderRadius: "9999px",
                    border: "2px solid rgba(217,119,6,0.7)",
                  }}
                />
                <img
                  src={markerIcon}
                  alt=""
                  aria-hidden="true"
                  className="trail-marker-bob relative block"
                  style={{
                    width: "clamp(14px, 1.4vw, 18px)",
                    height: "clamp(14px, 1.4vw, 18px)",
                    filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.7))",
                  }}
                  draggable={false}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
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
