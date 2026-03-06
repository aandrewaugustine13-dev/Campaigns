import { useEffect, useMemo, useRef, useState } from "react";
import {
  PORTRAIT_ROLE_CONFIG,
  PORTRAIT_TIMINGS,
  randomRange,
  type PortraitRoleId,
  type PortraitState,
} from "./portraitSystem";

interface AnimatedPortraitProps {
  roleId: PortraitRoleId;
  state: PortraitState;
  size?: number;
  damageTrigger?: number;
  blinkTrigger?: number;
}

interface FrameState {
  bobY: number;
  shakeX: number;
  shakeY: number;
  blinkClosed: boolean;
  redOverlay: number;
}

const INITIAL_FRAME: FrameState = {
  bobY: 0,
  shakeX: 0,
  shakeY: 0,
  blinkClosed: false,
  redOverlay: 0,
};

export default function AnimatedPortrait({
  roleId,
  state,
  size = 48,
  damageTrigger = 0,
  blinkTrigger = 0,
}: AnimatedPortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [frame, setFrame] = useState<FrameState>(INITIAL_FRAME);

  const nextBlinkAt = useRef(0);
  const blinkUntil = useRef(0);
  const nextBobAt = useRef(0);
  const bobUntil = useRef(0);
  const damageUntil = useRef(0);
  const flashUntil = useRef(0);

  const timing = PORTRAIT_TIMINGS[state];

  const src = useMemo(() => PORTRAIT_ROLE_CONFIG[roleId].baseSrc, [roleId]);

  useEffect(() => {
    const image = new Image();
    image.src = src;
    image.onload = () => {
      imageRef.current = image;
      setReady(true);
    };
    return () => {
      imageRef.current = null;
      setReady(false);
    };
  }, [src]);

  useEffect(() => {
    const now = performance.now();
    nextBlinkAt.current = now + randomRange(timing.blinkMinMs, timing.blinkMaxMs);
    nextBobAt.current = now + timing.bobIntervalMs;
  }, [state, timing.blinkMaxMs, timing.blinkMinMs, timing.bobIntervalMs]);

  useEffect(() => {
    if (!damageTrigger) return;
    const now = performance.now();
    damageUntil.current = now + timing.damageShakeDurationMs;
    flashUntil.current = now + 120;
    blinkUntil.current = now + Math.max(110, timing.blinkHoldMs * 0.9);
  }, [damageTrigger, timing.blinkHoldMs, timing.damageShakeDurationMs]);

  useEffect(() => {
    if (!blinkTrigger) return;
    blinkUntil.current = performance.now() + timing.blinkHoldMs;
  }, [blinkTrigger, timing.blinkHoldMs]);

  useEffect(() => {
    let raf = 0;

    const tick = () => {
      const now = performance.now();
      if (now >= nextBlinkAt.current) {
        blinkUntil.current = now + timing.blinkHoldMs;
        nextBlinkAt.current = now + randomRange(timing.blinkMinMs, timing.blinkMaxMs);
      }

      if (now >= nextBobAt.current) {
        bobUntil.current = now + timing.bobDurationMs;
        nextBobAt.current = now + timing.bobIntervalMs;
      }

      const blinkClosed = now < blinkUntil.current;
      const bobDirection = state === "tired" ? 1 : -1;
      const bobY = now < bobUntil.current ? bobDirection * timing.bobAmplitudePx : 0;

      let shakeX = 0;
      let shakeY = 0;
      if (now < damageUntil.current) {
        const amp = timing.damageShakeAmplitudePx;
        shakeX = Math.round((Math.random() * 2 - 1) * amp);
        shakeY = Math.round((Math.random() * 2 - 1) * amp * 0.45);
      } else if (state === "critical" && Math.random() < 0.09) {
        shakeX = Math.random() < 0.5 ? -1 : 1;
      }

      const flashAlpha = now < flashUntil.current ? 0.2 : 0;
      const pulseAlpha =
        state === "critical"
          ? 0.12 + (Math.sin((now / timing.criticalPulseIntervalMs) * Math.PI * 2) + 1) * 0.07
          : 0;
      const redOverlay = Math.max(flashAlpha, pulseAlpha);

      setFrame((prev) => {
        if (
          prev.blinkClosed === blinkClosed &&
          prev.bobY === bobY &&
          prev.shakeX === shakeX &&
          prev.shakeY === shakeY &&
          Math.abs(prev.redOverlay - redOverlay) < 0.01
        ) {
          return prev;
        }
        return { blinkClosed, bobY, shakeX, shakeY, redOverlay };
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state, timing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !ready) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = size;
    canvas.height = size;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);

    ctx.drawImage(image, frame.shakeX, frame.bobY + frame.shakeY, size, size);

    if (frame.blinkClosed) {
      const lidColor = "rgba(43,24,16,0.92)";
      ctx.fillStyle = lidColor;
      ctx.fillRect(0, Math.floor(size * 0.34), size, Math.ceil(size * 0.12));
      ctx.fillRect(0, Math.floor(size * 0.48), size, Math.ceil(size * 0.08));
    }

    if (state === "injured" && frame.redOverlay > 0.16) {
      ctx.fillStyle = "rgba(90,0,0,0.10)";
      ctx.fillRect(0, 0, size, size);
    }

    if (frame.redOverlay > 0) {
      ctx.fillStyle = `rgba(170, 0, 0, ${frame.redOverlay.toFixed(3)})`;
      ctx.fillRect(0, 0, size, size);
    }
  }, [ready, size, frame, state]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="w-full h-full"
      style={{ imageRendering: "pixelated" }}
      aria-label={`${PORTRAIT_ROLE_CONFIG[roleId].name} portrait`}
    />
  );
}
