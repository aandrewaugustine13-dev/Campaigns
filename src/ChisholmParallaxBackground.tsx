import { useEffect, useMemo, useRef, useState } from "react";

const CHISHOLM_ASSETS = {
  skyDay: "/backgrounds/chisholm/sky_day.png",
  skyDusk: "/backgrounds/chisholm/sky_dusk.png",
  skyNight: "/backgrounds/chisholm/sky_night.png",
  cloudsFar: "/backgrounds/chisholm/clouds_far.png",
  hillsFar: "/backgrounds/chisholm/hills_far.png",
  prairieMid: "/backgrounds/chisholm/prairie_mid.png",
  trailForeground: "/backgrounds/chisholm/trail_foreground.png",
  herdStrip: "/backgrounds/chisholm/herd_strip.png",
  ridersStrip: "/backgrounds/chisholm/riders_strip.png",
  chuckwagonStrip: "/backgrounds/chisholm/chuckwagon_strip.png",
  dustFxStrip: "/backgrounds/chisholm/dust_fx_strip.png",
} as const;

const PANORAMA_RATIO = 3 / 2;

interface LayerSpeedConfig {
  clouds: number;
  hills: number;
  prairie: number;
  trail: number;
}

interface ChisholmParallaxBackgroundProps {
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
  return {
    day: day / total,
    dusk: dusk / total,
    night: night / total,
  };
}

export default function ChisholmParallaxBackground({
  progress,
  pace,
  height = 190,
  cycleDurationMs = 110000,
  showForegroundActors = true,
  showDustFx = true,
  layerSpeed,
}: ChisholmParallaxBackgroundProps) {
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
    const observer = new ResizeObserver(() => {
      setViewportWidth(element.clientWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const travelFactor = pace === "push" ? 0.85 : pace === "normal" ? 1 : 1.25;
  const speeds: LayerSpeedConfig = {
    clouds: 280 * travelFactor,
    hills: 180 * travelFactor,
    prairie: 110 * travelFactor,
    trail: 70 * travelFactor,
    ...layerSpeed,
  };

  const cycle = useMemo(() => (timeTick % cycleDurationMs) / cycleDurationMs, [timeTick, cycleDurationMs]);
  const sky = useMemo(() => dayWeights(cycle), [cycle]);
  const distanceLabel = progress < 10 ? "San Antonio" : progress > 90 ? "Abilene" : `${Math.round(progress * 8)} mi`;

  const tileWidth = useMemo(() => {
    const fromHeight = Math.round(height * PANORAMA_RATIO);
    return Math.max(fromHeight, viewportWidth || fromHeight);
  }, [height, viewportWidth]);

  const actorScale = height / 190;

  return (
    <div ref={rootRef} className="relative w-full overflow-hidden rounded-b border-b border-stone-700" style={{ height }}>
      <div
        className="absolute inset-0 chisholm-layer"
        style={{
          opacity: sky.day,
          backgroundImage: `url(${CHISHOLM_ASSETS.skyDay})`,
          backgroundSize: "cover",
          backgroundPosition: "center bottom",
        }}
      />
      <div
        className="absolute inset-0 chisholm-layer"
        style={{
          opacity: sky.dusk,
          backgroundImage: `url(${CHISHOLM_ASSETS.skyDusk})`,
          backgroundSize: "cover",
          backgroundPosition: "center bottom",
          mixBlendMode: "screen",
        }}
      />
      <div
        className="absolute inset-0 chisholm-layer"
        style={{
          opacity: sky.night,
          backgroundImage: `url(${CHISHOLM_ASSETS.skyNight})`,
          backgroundSize: "cover",
          backgroundPosition: "center bottom",
        }}
      />

      <div
        className="absolute top-0 left-0 h-full chisholm-pan"
        style={{
          width: `calc(100% + ${tileWidth}px)`,
          ["--pan-duration" as string]: `${speeds.clouds}s`,
          ["--pan-distance" as string]: `${tileWidth}px`,
          backgroundImage: `url(${CHISHOLM_ASSETS.cloudsFar})`,
          backgroundRepeat: "repeat-x",
          backgroundSize: `${tileWidth}px 55%`,
          backgroundPosition: "0 0",
          opacity: 0.7,
        }}
      />

      <div
        className="absolute left-0 bottom-0 chisholm-pan"
        style={{
          height: "52%",
          width: `calc(100% + ${tileWidth}px)`,
          ["--pan-duration" as string]: `${speeds.hills}s`,
          ["--pan-distance" as string]: `${tileWidth}px`,
          backgroundImage: `url(${CHISHOLM_ASSETS.hillsFar})`,
          backgroundRepeat: "repeat-x",
          backgroundSize: `${tileWidth}px 100%`,
        }}
      />

      <div
        className="absolute left-0 bottom-0 chisholm-pan"
        style={{
          height: "40%",
          width: `calc(100% + ${tileWidth}px)`,
          ["--pan-duration" as string]: `${speeds.prairie}s`,
          ["--pan-distance" as string]: `${tileWidth}px`,
          backgroundImage: `url(${CHISHOLM_ASSETS.prairieMid})`,
          backgroundRepeat: "repeat-x",
          backgroundSize: `${tileWidth}px 100%`,
        }}
      />

      <div
        className="absolute left-0 bottom-0 chisholm-pan"
        style={{
          height: "30%",
          width: `calc(100% + ${tileWidth}px)`,
          ["--pan-duration" as string]: `${speeds.trail}s`,
          ["--pan-distance" as string]: `${tileWidth}px`,
          backgroundImage: `url(${CHISHOLM_ASSETS.trailForeground})`,
          backgroundRepeat: "repeat-x",
          backgroundSize: `${tileWidth}px 100%`,
        }}
      />

      {showForegroundActors && (
        <>
          {/* Herd — content is 193px tall centered at ~53% in a 1024px image */}
          <div className="absolute left-[-25%] chisholm-actor-move" style={{
            ["--actor-duration" as string]: "58s",
            bottom: `${Math.round(-height * 0.15)}px`,
          }}>
            <img
              src={CHISHOLM_ASSETS.herdStrip}
              alt=""
              draggable={false}
              style={{
                height: Math.round(height * 1.05 * actorScale),
                width: "auto",
                pointerEvents: "none",
              }}
            />
          </div>

          {/* Riders — content is 304px tall centered at ~51% in a 1024px image */}
          <div className="absolute left-[-18%] chisholm-actor-move" style={{
            ["--actor-duration" as string]: "76s",
            ["--actor-delay" as string]: "-14s",
            bottom: `${Math.round(-height * 0.08)}px`,
          }}>
            <img
              src={CHISHOLM_ASSETS.ridersStrip}
              alt=""
              draggable={false}
              style={{
                height: Math.round(height * 0.9 * actorScale),
                width: "auto",
                pointerEvents: "none",
              }}
            />
          </div>

          {/* Chuckwagon — content is 515px tall centered at ~49% in a 1024px image */}
          <div className="absolute left-[-18%] chisholm-actor-move" style={{
            ["--actor-duration" as string]: "95s",
            ["--actor-delay" as string]: "-30s",
            bottom: `${Math.round(-height * 0.02)}px`,
          }}>
            <img
              src={CHISHOLM_ASSETS.chuckwagonStrip}
              alt=""
              draggable={false}
              style={{
                height: Math.round(height * 0.72 * actorScale),
                width: "auto",
                pointerEvents: "none",
              }}
            />
          </div>
        </>
      )}

      {showDustFx && (
        <div className="absolute left-[-10%] chisholm-actor-move" style={{
          ["--actor-duration" as string]: "68s",
          ["--actor-delay" as string]: "-8s",
          bottom: `${Math.round(-height * 0.25)}px`,
        }}>
          <img
            src={CHISHOLM_ASSETS.dustFxStrip}
            alt=""
            draggable={false}
            style={{
              height: Math.round(height * 0.95 * actorScale),
              width: "auto",
              opacity: 0.75,
              pointerEvents: "none",
            }}
          />
        </div>
      )}

      <div className="absolute inset-0" style={{ background: "linear-gradient(transparent 58%, rgba(0,0,0,0.34) 100%)" }} />
      <div className="absolute right-0 top-0 h-full w-1/3" style={{ background: "linear-gradient(270deg, rgba(8,8,8,0.42), rgba(8,8,8,0))" }} />
      <div className="absolute bottom-1 left-2 text-xs font-bold" style={{ color: "#f1d59b", opacity: 0.92, fontFamily: "monospace" }}>{Math.round(progress)}%</div>
      <div className="absolute bottom-1 right-2 text-xs font-bold" style={{ color: "#f1d59b", opacity: 0.92, fontFamily: "monospace" }}>{distanceLabel}</div>
    </div>
  );
}

export { CHISHOLM_ASSETS };
