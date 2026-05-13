import { useEffect, useMemo, useRef, useState } from "react";

// ═══════════════════════════════════════════════════════════════
// THIRD CRUSADE — parallax background
// TODO[art]: replace each asset with crusade-specific art.
// File layout mirrors /backgrounds/chisholm/ exactly.
// ═══════════════════════════════════════════════════════════════

const CRUSADES_ASSETS = {
  skyDay: "/backgrounds/crusades/sky_day.png",
  skyDusk: "/backgrounds/crusades/sky_dusk.png",
  skyNight: "/backgrounds/crusades/sky_night.png",
  cloudsFar: "/backgrounds/crusades/clouds_far.png",
  hillsFar: "/backgrounds/crusades/hills_far.png",
  fieldsMid: "/backgrounds/crusades/fields_mid.png",
  roadForeground: "/backgrounds/crusades/road_foreground.png",
  columnStrip: "/backgrounds/crusades/column_strip.png",
  ridersStrip: "/backgrounds/crusades/riders_strip.png",
  baggageStrip: "/backgrounds/crusades/baggage_strip.png",
  dustFxStrip: "/backgrounds/crusades/dust_fx_strip.png",
} as const;

const PANORAMA_RATIO = 3 / 2;

interface LayerSpeedConfig {
  clouds: number;
  hills: number;
  fields: number;
  road: number;
}

interface CrusadesParallaxBackgroundProps {
  progress: number;
  pace: "rest" | "normal" | "push";
  height?: number;
  cycleDurationMs?: number;
  showForegroundActors?: boolean;
  showDustFx?: boolean;
  layerSpeed?: Partial<LayerSpeedConfig>;
}

function dayWeights(t: number) {
  const day = Math.max(0, 1 - Math.abs(t - 0.15) / 0.35);
  const dusk = Math.max(0, 1 - Math.abs(t - 0.5) / 0.28);
  const night = Math.max(0, 1 - Math.abs(t - 0.85) / 0.35);
  const total = day + dusk + night || 1;
  return { day: day / total, dusk: dusk / total, night: night / total };
}

export default function CrusadesParallaxBackground({
  progress,
  pace,
  height = 190,
  cycleDurationMs = 110000,
  showForegroundActors = true,
  showDustFx = true,
  layerSpeed,
}: CrusadesParallaxBackgroundProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [timeTick, setTimeTick] = useState(() => Date.now());
  const [viewportWidth, setViewportWidth] = useState(() => typeof window !== "undefined" ? window.innerWidth : 0);

  useEffect(() => {
    const interval = window.setInterval(() => setTimeTick(Date.now()), 200);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!rootRef.current) return;
    const element = rootRef.current;
    setViewportWidth(element.clientWidth);
    const observer = new ResizeObserver(() => { setViewportWidth(element.clientWidth); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const travelFactor = pace === "push" ? 0.85 : pace === "normal" ? 1 : 1.25;
  const speeds: LayerSpeedConfig = {
    clouds: 280 * travelFactor,
    hills: 180 * travelFactor,
    fields: 110 * travelFactor,
    road: 70 * travelFactor,
    ...layerSpeed,
  };

  const cycle = useMemo(() => (timeTick % cycleDurationMs) / cycleDurationMs, [timeTick, cycleDurationMs]);
  const sky = useMemo(() => dayWeights(cycle), [cycle]);
  const distanceLabel = progress < 10 ? "Warwick" : progress > 90 ? "Jerusalem" : `${Math.round(progress * 24)} leagues`;

  const tileWidth = useMemo(() => {
    const fromHeight = Math.round(height * PANORAMA_RATIO);
    return Math.max(fromHeight, viewportWidth || fromHeight);
  }, [height, viewportWidth]);

  const actorScale = height / 190;

  // NOTE: while the real PNGs are TODO, the layers below render as
  // empty boxes. The campaign still boots — the gradient overlay
  // and the progress labels are visible.
  return (
    <div ref={rootRef} className="relative w-full overflow-hidden rounded-b border-b border-stone-700" style={{ height, background: "linear-gradient(180deg, #6b5b3a 0%, #8a7547 60%, #5a4a2a 100%)" }}>
      <div className="absolute inset-0" style={{ opacity: sky.day, backgroundImage: `url(${CRUSADES_ASSETS.skyDay})`, backgroundSize: "cover", backgroundPosition: "center bottom" }} />
      <div className="absolute inset-0" style={{ opacity: sky.dusk, backgroundImage: `url(${CRUSADES_ASSETS.skyDusk})`, backgroundSize: "cover", backgroundPosition: "center bottom", mixBlendMode: "screen" }} />
      <div className="absolute inset-0" style={{ opacity: sky.night, backgroundImage: `url(${CRUSADES_ASSETS.skyNight})`, backgroundSize: "cover", backgroundPosition: "center bottom" }} />

      <div className="absolute top-0 left-0" style={{ height: "65%", width: `calc(100% + ${tileWidth}px)`, backgroundImage: `url(${CRUSADES_ASSETS.cloudsFar})`, backgroundRepeat: "repeat-x", backgroundSize: `${tileWidth}px 100%`, opacity: 0.7, animation: `pan ${speeds.clouds}s linear infinite` }} />
      <div className="absolute left-0 bottom-0" style={{ height: "55%", width: `calc(100% + ${tileWidth}px)`, backgroundImage: `url(${CRUSADES_ASSETS.hillsFar})`, backgroundRepeat: "repeat-x", backgroundSize: `${tileWidth}px 100%`, animation: `pan ${speeds.hills}s linear infinite` }} />
      <div className="absolute left-0 bottom-0" style={{ height: "45%", width: `calc(100% + ${tileWidth}px)`, backgroundImage: `url(${CRUSADES_ASSETS.fieldsMid})`, backgroundRepeat: "repeat-x", backgroundSize: `${tileWidth}px 100%`, animation: `pan ${speeds.fields}s linear infinite` }} />
      <div className="absolute left-0 bottom-0" style={{ height: "35%", width: `calc(100% + ${tileWidth}px)`, backgroundImage: `url(${CRUSADES_ASSETS.roadForeground})`, backgroundRepeat: "repeat-x", backgroundSize: `${tileWidth}px 100%`, animation: `pan ${speeds.road}s linear infinite` }} />

      {showForegroundActors && (
        <>
          <div className="absolute left-[-25%]" style={{ bottom: `${Math.round(-height * 0.15)}px` }}>
            <img src={CRUSADES_ASSETS.columnStrip} alt="" draggable={false} style={{ height: Math.round(height * 1.05 * actorScale), width: "auto", pointerEvents: "none" }} />
          </div>
          <div className="absolute left-[-18%]" style={{ bottom: `${Math.round(-height * 0.08)}px` }}>
            <img src={CRUSADES_ASSETS.ridersStrip} alt="" draggable={false} style={{ height: Math.round(height * 0.9 * actorScale), width: "auto", pointerEvents: "none" }} />
          </div>
          <div className="absolute left-[-18%]" style={{ bottom: `${Math.round(-height * 0.02)}px` }}>
            <img src={CRUSADES_ASSETS.baggageStrip} alt="" draggable={false} style={{ height: Math.round(height * 0.72 * actorScale), width: "auto", pointerEvents: "none" }} />
          </div>
        </>
      )}

      {showDustFx && (
        <div className="absolute left-[-10%]" style={{ bottom: `${Math.round(-height * 0.25)}px` }}>
          <img src={CRUSADES_ASSETS.dustFxStrip} alt="" draggable={false} style={{ height: Math.round(height * 0.95 * actorScale), width: "auto", opacity: 0.75, pointerEvents: "none" }} />
        </div>
      )}

      <div className="absolute inset-0" style={{ background: "linear-gradient(transparent 58%, rgba(0,0,0,0.34) 100%)" }} />
      <div className="absolute right-0 top-0 h-full w-1/3" style={{ background: "linear-gradient(270deg, rgba(8,8,8,0.42), rgba(8,8,8,0))" }} />
      <div className="absolute bottom-1 left-2 text-xs font-bold" style={{ color: "#f1d59b", opacity: 0.92, fontFamily: "monospace" }}>{Math.round(progress)}%</div>
      <div className="absolute bottom-1 right-2 text-xs font-bold" style={{ color: "#f1d59b", opacity: 0.92, fontFamily: "monospace" }}>{distanceLabel}</div>
    </div>
  );
}

export { CRUSADES_ASSETS };
