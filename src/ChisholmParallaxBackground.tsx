import { useEffect, useMemo, useState } from "react";

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
  const [timeTick, setTimeTick] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setTimeTick(Date.now()), 200);
    return () => window.clearInterval(interval);
  }, []);

  const travelFactor = pace === "push" ? 0.85 : pace === "normal" ? 1 : 1.25;
  const speeds: LayerSpeedConfig = {
    clouds: 280 * travelFactor,
    hills: 180 * travelFactor,
    prairie: 110 * travelFactor,
    trail: 70 * travelFactor,
    ...layerSpeed,
  };

  const cycle = useMemo(() => ((timeTick % cycleDurationMs) / cycleDurationMs), [timeTick, cycleDurationMs]);
  const sky = useMemo(() => dayWeights(cycle), [cycle]);
  const distanceLabel = progress < 10 ? "San Antonio" : progress > 90 ? "Abilene" : `${Math.round(progress * 8)} mi`;

  return (
    <div className="relative w-full overflow-hidden rounded-b border-b border-stone-700" style={{ height }}>
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
        className="absolute inset-0 chisholm-pan"
        style={{
          ["--pan-duration" as string]: `${speeds.clouds}s`,
          backgroundImage: `url(${CHISHOLM_ASSETS.cloudsFar})`,
          backgroundRepeat: "repeat-x",
          backgroundSize: "auto 55%",
          opacity: 0.7,
        }}
      />

      <div
        className="absolute inset-x-0 bottom-0 chisholm-pan"
        style={{
          height: "52%",
          ["--pan-duration" as string]: `${speeds.hills}s`,
          backgroundImage: `url(${CHISHOLM_ASSETS.hillsFar})`,
          backgroundRepeat: "repeat-x",
          backgroundSize: "auto 100%",
          opacity: 0.95,
        }}
      />

      <div
        className="absolute inset-x-0 bottom-0 chisholm-pan"
        style={{
          height: "40%",
          ["--pan-duration" as string]: `${speeds.prairie}s`,
          backgroundImage: `url(${CHISHOLM_ASSETS.prairieMid})`,
          backgroundRepeat: "repeat-x",
          backgroundSize: "auto 100%",
        }}
      />

      <div
        className="absolute inset-x-0 bottom-0 chisholm-pan"
        style={{
          height: "30%",
          ["--pan-duration" as string]: `${speeds.trail}s`,
          backgroundImage: `url(${CHISHOLM_ASSETS.trailForeground})`,
          backgroundRepeat: "repeat-x",
          backgroundSize: "auto 100%",
        }}
      />

      {showForegroundActors && (
        <>
          <div className="absolute bottom-[18%] left-[-25%] chisholm-actor-move" style={{ ["--actor-duration" as string]: "58s" }}>
            <div
              className="chisholm-sprite-strip"
              style={{
                ["--strip-frames" as string]: "8",
                ["--strip-fps" as string]: "1.1s",
                width: 120,
                height: 34,
                backgroundImage: `url(${CHISHOLM_ASSETS.herdStrip})`,
              }}
            />
          </div>

          <div className="absolute bottom-[19%] left-[-18%] chisholm-actor-move" style={{ ["--actor-duration" as string]: "76s", ["--actor-delay" as string]: "-14s" }}>
            <div
              className="chisholm-sprite-strip"
              style={{
                ["--strip-frames" as string]: "6",
                ["--strip-fps" as string]: "0.9s",
                width: 72,
                height: 30,
                backgroundImage: `url(${CHISHOLM_ASSETS.ridersStrip})`,
              }}
            />
          </div>

          <div className="absolute bottom-[17.5%] left-[-18%] chisholm-actor-move" style={{ ["--actor-duration" as string]: "95s", ["--actor-delay" as string]: "-30s" }}>
            <div
              className="chisholm-sprite-strip"
              style={{
                ["--strip-frames" as string]: "6",
                ["--strip-fps" as string]: "1.2s",
                width: 92,
                height: 34,
                backgroundImage: `url(${CHISHOLM_ASSETS.chuckwagonStrip})`,
              }}
            />
          </div>
        </>
      )}

      {showDustFx && (
        <div className="absolute bottom-[16%] left-[-10%] chisholm-actor-move" style={{ ["--actor-duration" as string]: "68s", ["--actor-delay" as string]: "-8s" }}>
          <div
            className="chisholm-sprite-strip"
            style={{
              ["--strip-frames" as string]: "10",
              ["--strip-fps" as string]: "1s",
              width: 84,
              height: 34,
              backgroundImage: `url(${CHISHOLM_ASSETS.dustFxStrip})`,
              opacity: 0.75,
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
