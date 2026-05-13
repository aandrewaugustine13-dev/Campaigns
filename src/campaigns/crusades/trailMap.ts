import type { TrailStop } from "../types";

// ═══════════════════════════════════════════════════════════════
// THIRD CRUSADE — map / trail
// TODO[art]: real map image of Western Europe → Levant route.
// TODO[content]: real path coordinates and stop list.
// Placeholder coordinates below trace a left-to-right arc across
// a hypothetical map so the trail rendering doesn't break.
// ═══════════════════════════════════════════════════════════════

export const TRAIL_PATH: [number, number][] = [
  [10, 35],   // London / Warwick
  [15, 38],   // Channel
  [20, 42],   // Vézelay
  [25, 48],   // Rhône valley
  [30, 55],   // Marseilles
  [38, 60],   // Mediterranean leg
  [46, 62],   // Sicily — Messina
  [55, 60],   // Crete waters
  [65, 56],   // Cyprus
  [74, 52],   // Acre
  [78, 56],   // Jaffa
  [82, 58],   // approach to Jerusalem
];

export const STOPS: TrailStop[] = [
  { id: "warwick",     name: "Warwick",     pathIndex: 0,  pct: 0,   supply: true  },
  { id: "vezelay",     name: "Vézelay",     pathIndex: 2,  pct: 15,  supply: true  },
  { id: "marseilles",  name: "Marseilles",  pathIndex: 4,  pct: 30,  supply: true  },
  { id: "messina",     name: "Messina",     pathIndex: 6,  pct: 50,  supply: true  },
  { id: "cyprus",      name: "Cyprus",      pathIndex: 8,  pct: 65,  supply: true  },
  { id: "acre",        name: "Acre",        pathIndex: 9,  pct: 75,  supply: true  },
  { id: "jaffa",       name: "Jaffa",       pathIndex: 10, pct: 88,  supply: true  },
  { id: "jerusalem",   name: "Jerusalem",   pathIndex: 11, pct: 100, supply: false },
];

// TODO[art]: real campaign map at /faces/map_crusades.png
export const MAP_IMAGE = "/faces/map_crusades.png";

export const TOTAL_DISTANCE = 2400;

export function getRegionFlavor(progress: number): string {
  // TODO[content]: real regional flavour copy.
  if (progress < 15) return "England and the Channel. The world Hugh knows.";
  if (progress < 30) return "France. Long roads. Long muster.";
  if (progress < 50) return "The Mediterranean. Ships and storms.";
  if (progress < 65) return "Sicily and the eastern sea. Frankish quarrels.";
  if (progress < 75) return "Cyprus. An unplanned conquest.";
  if (progress < 88) return "The Levant coast. Acre's walls.";
  return "The road south. Jerusalem near.";
}

export function isNearSupplyTown(progress: number): { near: boolean; town: string | null; distance: number } {
  const next = STOPS.find(s => s.supply && s.pct > progress);
  if (!next) return { near: false, town: null, distance: 999 };
  const dist = next.pct - progress;
  return { near: dist < 8, town: next.name, distance: Math.round(dist * (TOTAL_DISTANCE / 100)) };
}
