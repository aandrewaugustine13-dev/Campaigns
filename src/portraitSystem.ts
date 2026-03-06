export type PortraitState = "happy" | "tired" | "injured" | "critical";

export interface PortraitTiming {
  blinkMinMs: number;
  blinkMaxMs: number;
  blinkHoldMs: number;
  bobIntervalMs: number;
  bobDurationMs: number;
  bobAmplitudePx: number;
  damageShakeAmplitudePx: number;
  damageShakeDurationMs: number;
  criticalPulseIntervalMs: number;
}

export const PORTRAIT_ROLE_CONFIG = {
  boss: {
    name: "Trail Boss",
    baseSrc: "/faces/role01_64_dither.png",
  },
  wrangler: {
    name: "Wrangler",
    baseSrc: "/faces/role02_64_dither.png",
  },
  point: {
    name: "Point Rider",
    baseSrc: "/faces/role03_64_dither.png",
  },
  hand: {
    name: "Ranch Hand",
    baseSrc: "/faces/role04_64_dither.png",
  },
  cook: {
    name: "Cook",
    baseSrc: "/faces/role05_64_dither.png",
  },
  scout: {
    name: "Scout",
    baseSrc: "/faces/role06_64_dither.png",
  },
} as const;

export type PortraitRoleId = keyof typeof PORTRAIT_ROLE_CONFIG;

export const PORTRAIT_TIMINGS: Record<PortraitState, PortraitTiming> = {
  happy: {
    blinkMinMs: 1700,
    blinkMaxMs: 3800,
    blinkHoldMs: 90,
    bobIntervalMs: 1800,
    bobDurationMs: 220,
    bobAmplitudePx: 1,
    damageShakeAmplitudePx: 2,
    damageShakeDurationMs: 140,
    criticalPulseIntervalMs: 1800,
  },
  tired: {
    blinkMinMs: 1200,
    blinkMaxMs: 2600,
    blinkHoldMs: 180,
    bobIntervalMs: 2200,
    bobDurationMs: 260,
    bobAmplitudePx: 1,
    damageShakeAmplitudePx: 2,
    damageShakeDurationMs: 150,
    criticalPulseIntervalMs: 1600,
  },
  injured: {
    blinkMinMs: 900,
    blinkMaxMs: 2200,
    blinkHoldMs: 140,
    bobIntervalMs: 2400,
    bobDurationMs: 220,
    bobAmplitudePx: 1,
    damageShakeAmplitudePx: 3,
    damageShakeDurationMs: 180,
    criticalPulseIntervalMs: 1500,
  },
  critical: {
    blinkMinMs: 700,
    blinkMaxMs: 1700,
    blinkHoldMs: 200,
    bobIntervalMs: 1200,
    bobDurationMs: 220,
    bobAmplitudePx: 1,
    damageShakeAmplitudePx: 3,
    damageShakeDurationMs: 210,
    criticalPulseIntervalMs: 1200,
  },
};

export function isPortraitRole(roleId: string): roleId is PortraitRoleId {
  return roleId in PORTRAIT_ROLE_CONFIG;
}

export function getPortraitStateForHealth(health: number): PortraitState {
  if (health > 70) return "happy";
  if (health > 40) return "tired";
  if (health > 20) return "injured";
  return "critical";
}

export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
