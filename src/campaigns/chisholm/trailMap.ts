import type { TrailStop } from "../types";

export const TRAIL_PATH: [number, number][] = [
  [50, 91],    // San Antonio
  [50, 88],
  [51, 85],
  [52, 82],    // heading toward Austin
  [53, 80],
  [54, 78],    // Austin
  [55, 75],
  [56, 72],
  [57, 69],
  [58, 66],
  [58, 64],    // Waco
  [57, 61],
  [55, 58],
  [52, 56],
  [48, 54],
  [45, 53],    // Fort Worth
  [44, 51],
  [44, 49],
  [44, 47],
  [45, 45],
  [45, 43],    // Red River / Trail Crossing
  [45, 41],
  [44, 39],
  [43, 37],
  [42, 35],
  [41, 33],
  [40, 31],    // Chisholm's Post area
  [40, 29],
  [41, 27],
  [42, 25],
  [44, 23],
  [46, 21],
  [49, 19],
  [52, 18],    // Wichita
  [52, 16],
  [51, 14],
  [50, 12],
  [49, 10],    // Abilene
];

export const STOPS: TrailStop[] = [
  { id: "sanantonio", name: "San Antonio",     pathIndex: 0,  pct: 0,   supply: true  },
  { id: "austin",     name: "Austin",          pathIndex: 5,  pct: 12,  supply: true  },
  { id: "waco",       name: "Waco",            pathIndex: 10, pct: 25,  supply: true  },
  { id: "fortworth",  name: "Fort Worth",      pathIndex: 15, pct: 37,  supply: true  },
  { id: "redriver",   name: "Red River",       pathIndex: 20, pct: 50,  supply: false },
  { id: "chisholm",   name: "Chisholm's Post", pathIndex: 26, pct: 60,  supply: true  },
  { id: "wichita",    name: "Wichita",         pathIndex: 32, pct: 82,  supply: true  },
  { id: "abilene",    name: "Abilene",         pathIndex: 36, pct: 100, supply: true  },
];

export const MAP_IMAGE = "/faces/map_chisholm.png";

export const TOTAL_DISTANCE = 800;

export function getRegionFlavor(progress: number): string {
  if (progress < 12) return "South Texas brush country. Mesquite and prickly pear.";
  if (progress < 25) return "Rolling Hill Country. The Brazos is ahead.";
  if (progress < 37) return "Blackland Prairie. Rich soil, wide sky.";
  if (progress < 50) return "Cross Timbers. Last piece of Texas before the Nations.";
  if (progress < 60) return "Red River crossing. You're leaving Texas.";
  if (progress < 82) return "Indian Territory. Chickasaw and Choctaw country.";
  if (progress < 95) return "Kansas grasslands. You can almost smell Abilene.";
  return "Railhead country. Cattle buyers everywhere.";
}

export function isNearSupplyTown(progress: number): { near: boolean; town: string | null; distance: number } {
  const next = STOPS.find(s => s.supply && s.pct > progress);
  if (!next) return { near: false, town: null, distance: 999 };
  const dist = next.pct - progress;
  return { near: dist < 8, town: next.name, distance: Math.round(dist * (TOTAL_DISTANCE / 100)) };
}
