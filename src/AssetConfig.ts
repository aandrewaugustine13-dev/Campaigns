// src/AssetConfig.ts
import { GameState } from "./App"; // Assuming your types are exported from App.tsx

// Map the current event ID to a specific background image
export const getBackgroundForEvent = (eventId: string | undefined): string => {
  switch (eventId) {
    case "river_crossing_early": return "/assets/backgrounds/river_crossing.png";
    case "tornado": return "/assets/backgrounds/green_sky.png";
    case "prairie_fire": return "/assets/backgrounds/prairie_fire.png";
    default: return "/assets/backgrounds/prairie_sunset.png"; // Default Stardew-style prairie
  }
};

// Map health/morale percentages to specific "Doom Face" image paths
export const getDoomFace = (role: string, healthPct: number): string => {
  if (healthPct <= 0) return `/assets/doom_faces/${role}_dead.png`;
  if (healthPct <= 25) return `/assets/doom_faces/${role}_25.png`; // Bloodied/Skeleton
  if (healthPct <= 50) return `/assets/doom_faces/${role}_50.png`; // Sweating/Lame
  return `/assets/doom_faces/${role}_100.png`;                     // Confident
};
