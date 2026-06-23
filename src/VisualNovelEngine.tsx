import React, { useEffect, useMemo, useState } from "react";
import { getDoomFace } from "./AssetConfig";
import { truncateCredit } from "./lib/attribution";

interface SageAdvice {
  name: string;
  role: string;
  line: string;
}

interface CommonsImage {
  thumbUrl: string;
  artist: string;
  license: string;
  sourceUrl: string;
}

interface VisualNovelProps {
  currentEvent: any;
  handleChoice: (index: number) => void;
  bossHealth: number;
  scoutHealth: number;
  insight?: number;
  onSpendInsightForHints?: () => void;
  showRiskHints?: boolean;
  riskHints?: string[];
  backdropImage?: CommonsImage;
  // Chisholm-specific Trail Boss / Scout pixel-art portraits overlay the
  // scene panel. Generated campaigns pass false to suppress them — the
  // sage and party display lives in DoomHUD instead. Defaults true so
  // App.tsx (Chisholm) keeps its current render path unchanged.
  showCharacterOverlay?: boolean;
}

export default function VisualNovelEngine({
  currentEvent,
  handleChoice,
  bossHealth,
  scoutHealth,
  insight = 0,
  onSpendInsightForHints,
  showRiskHints = false,
  riskHints = [],
  backdropImage,
  showCharacterOverlay = true,
}: VisualNovelProps) {
  if (!currentEvent) return null;

  const [showSages, setShowSages] = useState(false);

  useEffect(() => {
    setShowSages(false);
  }, [currentEvent?.id]);

  const didYouKnow = useMemo(() => {
    const trivia = Array.isArray(currentEvent.trivia) ? currentEvent.trivia : [];
    if (trivia.length === 0) return null;
    const key = String(currentEvent.id || currentEvent.title || "event");
    const seed = key.split("").reduce((sum: number, ch: string) => sum + ch.charCodeAt(0), 0);
    return trivia[seed % trivia.length];
  }, [currentEvent]);

  const sageLines: SageAdvice[] = useMemo(() => {
    const sages = Array.isArray(currentEvent.sageAdvice) ? currentEvent.sageAdvice : [];
    return sages.slice(0, 2);
  }, [currentEvent]);

  // Image priority: event-specific → campaign backdrop → themed fallback /
  // Chisholm pixel-art parallax.
  const sceneImage: CommonsImage | undefined = currentEvent.image ?? backdropImage;

  return (
    <div className="border-4 theme-dialogue-frame-border">
      {/* Scene — historical image, themed fallback, or Chisholm parallax.
          Fixed 3:2 aspect-ratio frame (shared ratio language with the intro
          banner 16:9 and sage portrait 1:1) so every scene renders identically
          proportioned regardless of source image size, instead of the old flat
          200px height whose aspect drifted with panel width. All children are
          inset-0 (fill) or bottom-anchored (portraits/cattle), so the ratio
          swap keeps them placed. */}
      <div className="relative w-full overflow-hidden theme-dialogue-frame" style={{ aspectRatio: "3 / 2" }}>
        {sceneImage ? (
          // object-contain (not cover): event lithographs are often tall
          // portraits; cover cropped their top/bottom (heads/feet). Contain
          // shows the whole image, letterboxed against the dialogue-frame matte
          // so the bars read as intentional framing, not a gap.
          <img
            src={sceneImage.thumbUrl}
            alt={currentEvent.title ?? ""}
            className="absolute inset-0 w-full h-full object-contain"
          />
        ) : showCharacterOverlay ? (
          <>
            {/* Layer 1: Static sky */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(/faces/bg_sky.png)`,
                backgroundSize: "cover",
                backgroundPosition: "center bottom",
                imageRendering: "pixelated",
              }}
            />
            {/* Layer 2: Scrolling cattle strip */}
            <div
              className="absolute bottom-0 left-0 right-0"
              style={{
                height: 65,
                backgroundImage: `url(/faces/fg_cattle.png)`,
                backgroundSize: "auto 100%",
                backgroundRepeat: "repeat-x",
                backgroundPosition: "bottom",
                animation: "bgScroll 25s linear infinite, cattleBob 0.6s ease-in-out infinite",
                imageRendering: "pixelated",
              }}
            />
          </>
        ) : (
          <div className="absolute inset-0 theme-parallax" />
        )}
        {/* Vignette */}
        <div className="absolute inset-0" style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)",
        }} />

        {/* Boss + Scout pixel-art portraits — Chisholm only */}
        {showCharacterOverlay && (
          <>
            <div className="absolute bottom-2 left-3 z-10">
              <div className="bg-[#1a0f0a]/80 border-2 border-[#3d2516] p-0.5 rounded">
                <img
                  src={getDoomFace("boss", bossHealth)}
                  className="w-16 h-16"
                  style={{ imageRendering: "pixelated" }}
                  alt="Trail Boss"
                />
              </div>
              <div className="text-center">
                <span className="text-[#e6c280] font-bold drop-shadow-md" style={{ fontSize: '9px' }}>Trail Boss</span>
              </div>
            </div>

            <div className="absolute bottom-2 right-3 z-10">
              <div className="bg-[#1a0f0a]/80 border-2 border-[#3d2516] p-0.5 rounded">
                <img
                  src={getDoomFace("scout", scoutHealth)}
                  className="w-16 h-16"
                  style={{ imageRendering: "pixelated" }}
                  alt="Scout"
                />
              </div>
              <div className="text-center">
                <span className="text-[#e6c280] font-bold drop-shadow-md" style={{ fontSize: '9px' }}>Scout</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Attribution — shown only when a Commons image is displayed */}
      {sceneImage && (
        <div className="theme-dialogue-frame theme-dialogue-attribution px-2 pt-1 leading-tight" style={{ fontSize: "11px" }}>
          {truncateCredit(sceneImage.artist)} · {sceneImage.license} ·{" "}
          <a
            href={sceneImage.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline theme-dialogue-attribution-link"
          >
            Source
          </a>
        </div>
      )}

      {/* Dialogue box — below the scene */}
      <div className="theme-dialogue-frame p-2">
        <div className="theme-dialogue-bg theme-dialogue-border border-4 rounded shadow-[4px_4px_0px_rgba(0,0,0,0.5)] p-3">
          <p className="theme-dialogue-text font-bold text-base mb-2 drop-shadow-sm leading-relaxed">
            {currentEvent.text}
          </p>

          {didYouKnow && (
            <p className="theme-dialogue-text-muted text-xs mb-2 theme-dialogue-accent border rounded px-2 py-1">
              <span className="font-bold">Did you know?</span> {didYouKnow}
            </p>
          )}

          {sageLines.length > 0 && (
            <div className="mb-2">
              <button
                onClick={() => setShowSages(v => !v)}
                className="text-xs font-bold px-2 py-1 rounded border-2 theme-dialogue-accent"
              >
                {showSages ? "Hide Sage Advice" : "Ask a Sage"}
              </button>
              {showSages && (
                <div className="mt-1 space-y-1">
                  {sageLines.map((sage, i) => (
                    <p key={i} className="text-xs theme-dialogue-text theme-dialogue-accent border rounded px-2 py-1">
                      <span className="font-bold">{sage.name}</span> ({sage.role}): {sage.line}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {!!onSpendInsightForHints && (
            <div className="mb-2">
              <button
                onClick={onSpendInsightForHints}
                disabled={showRiskHints || insight <= 0}
                className={`text-xs font-bold px-2 py-1 rounded border ${showRiskHints || insight <= 0 ? "border-[#3a3630] bg-[#1c1915] text-[#6a6358]" : "bg-[#c9a36b]/10 border-[#c9a36b] text-[#c9a36b] hover:bg-[#c9a36b]/20"}`}
              >
                {showRiskHints ? "Sage Risk Hints Shown" : `Ask a Sage (Spend 1 Insight)`}
              </button>
            </div>
          )}

          <div className="space-y-1">
            {currentEvent.choices.map((c: any, i: number) => (
              <button
                key={i}
                onClick={() => handleChoice(i)}
                className="w-full text-left p-2.5 bg-[#211e1a] hover:bg-[#2a2723] border border-[#3a3630] hover:border-[#c9a36b] rounded font-bold text-sm leading-snug text-[#c5b8a0] transition-colors"
              >
                <span>▶ {c.text}</span>
                {showRiskHints && riskHints[i] && (
                  <span className="ml-2 text-[10px] font-bold text-[#c9a36b] opacity-80">[{riskHints[i]}]</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
