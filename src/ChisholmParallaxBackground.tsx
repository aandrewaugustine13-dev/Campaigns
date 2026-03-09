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
  const [assetReady, setAssetReady] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const interval = window.setInterval(() => setTimeTick(Date.now()), 200);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(CHISHOLM_ASSETS);
    entries.forEach(([key, src]) => {
      const img = new Image();
      img.onload = () => {
        if (!cancelled) setAssetReady((prev) => ({ ...prev, [key]: true }));
      };
      img.onerror = () => {
        if (!cancelled) {
          setAssetReady((prev) => ({ ...prev, [key]: false }));
          console.warn(`[ChisholmParallaxBackground] Asset failed to decode: ${src}`);
        }
      };
      img.src = src;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const withFallback = (key: keyof typeof CHISHOLM_ASSETS, fallback: string) =>
    assetReady[key] === false ? fallback : `url(${CHISHOLM_ASSETS[key]}), ${fallback}`;

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
          backgroundImage: withFallback("skyDay", "linear-gradient(180deg, #8ec8f0 0%, #d6ebff 45%, #f5d8aa 100%)"),
          backgroundSize: "cover",
          backgroundPosition: "center bottom",
        }}
      />
      <div
        className="absolute inset-0 chisholm-layer"
        style={{
          opacity: sky.dusk,
          backgroundImage: withFallback("skyDusk", "linear-gradient(180deg, #f7b37b 0%, #cf6e56 45%, #5f3a5f 100%)"),
          backgroundSize: "cover",
          backgroundPosition: "center bottom",
          mixBlendMode: "screen",
        }}
      />
      <div
        className="absolute inset-0 chisholm-layer"
        style={{
          opacity: sky.night,
          backgroundImage: withFallback("skyNight", "radial-gradient(circle at 70% 20%, rgba(255,255,220,0.25), transparent 20%), linear-gradient(180deg, #101530 0%, #1e2b46 45%, #1d2234 100%)"),
          backgroundSize: "cover",
          backgroundPosition: "center bottom",
        }}
      />

      <div
        className="absolute inset-0 chisholm-pan"
        style={{
          ["--pan-duration" as string]: `${speeds.clouds}s`,
          backgroundImage: withFallback("cloudsFar", "radial-gradient(ellipse at 15% 20%, rgba(255,255,255,0.2), transparent 40%), radial-gradient(ellipse at 75% 26%, rgba(255,255,255,0.12), transparent 35%)"),
          backgroundRepeat: "repeat-x, no-repeat, no-repeat",
          backgroundSize: "auto 55%, 100% 100%, 100% 100%",
          opacity: 0.7,
        }}
      />

      <div
        className="absolute inset-x-0 bottom-0 chisholm-pan"
        style={{
          height: "52%",
          ["--pan-duration" as string]: `${speeds.hills}s`,
          backgroundImage: withFallback("hillsFar", "linear-gradient(180deg, transparent 0%, rgba(92, 110, 88, 0.78) 45%, rgba(73, 88, 72, 0.92) 100%)"),
          backgroundRepeat: "repeat-x, no-repeat",
          backgroundSize: "auto 100%, 100% 100%",
          opacity: 0.95,
        }}
      />

      <div
        className="absolute inset-x-0 bottom-0 chisholm-pan"
        style={{
          height: "40%",
          ["--pan-duration" as string]: `${speeds.prairie}s`,
          backgroundImage: withFallback("prairieMid", "linear-gradient(180deg, rgba(96, 112, 61, 0.6) 0%, rgba(82, 92, 50, 0.92) 60%, rgba(71, 70, 38, 1) 100%)"),
          backgroundRepeat: "repeat-x, no-repeat",
          backgroundSize: "auto 100%, 100% 100%",
        }}
      />

      <div
        className="absolute inset-x-0 bottom-0 chisholm-pan"
        style={{
          height: "30%",
          ["--pan-duration" as string]: `${speeds.trail}s`,
          backgroundImage: withFallback("trailForeground", "linear-gradient(180deg, rgba(93, 70, 44, 0.2) 0%, rgba(93, 70, 44, 0.85) 50%, rgba(60, 45, 30, 1) 100%)"),
          backgroundRepeat: "repeat-x, no-repeat",
          backgroundSize: "auto 100%, 100% 100%",
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
                backgroundImage: withFallback("herdStrip", "linear-gradient(180deg, rgba(35, 26, 18, 0.75), rgba(35, 26, 18, 0.75))"),
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
                backgroundImage: withFallback("ridersStrip", "linear-gradient(180deg, rgba(26, 19, 13, 0.8), rgba(26, 19, 13, 0.8))"),
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
                backgroundImage: withFallback("chuckwagonStrip", "linear-gradient(180deg, rgba(47, 32, 21, 0.9), rgba(47, 32, 21, 0.9))"),
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
              backgroundImage: withFallback("dustFxStrip", "radial-gradient(ellipse at center, rgba(184, 145, 96, 0.26), rgba(184, 145, 96, 0.02))"),
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
