import type { Resources, PaceConfig, PartyMember } from "../types";
import { FACES, gf } from "./pixelFaces";

// ═══════════════════════════════════════════════════════════════
// THIRD CRUSADE (1190–1192) — campaign tunables
// Protagonist: Sir Hugh of Warwick, English household knight in
// Richard I's army.
// ═══════════════════════════════════════════════════════════════

export const TOTAL_DAYS = 180;
export const DAYS_PER_TURN = 5;

// Resources ported from Chisholm/Silk Road plus crusade-specific
// stand-ins. `faith` and `zeal` are flavour-only display values for
// now and are NOT yet wired into any mechanical effect.
// TODO[content]: tune initial values once events are written.
export const INIT_R: Resources = {
  men: 40,           // mounted retinue + foot
  horses: 18,
  supplies: 60,      // food, fodder, basic logistics
  water: 50,         // critical in the Levant
  morale: 55,
  faith: 60,         // flavour-only for now
  zeal: 50,          // flavour-only for now
  silver: 200,       // pay, ransoms, bribes
  arms: 30,          // arrows, spears, mail in repair
};

export const RESOURCE_CAPS: Record<string, number> = {
  men: 60, horses: 30, supplies: 100, water: 100,
  morale: 100, faith: 100, zeal: 100, silver: 4000, arms: 60,
};

export function clampR(k: string, v: number): number {
  const max = RESOURCE_CAPS[k] || 100;
  return Math.max(0, Math.min(v, max));
}

// Cautious / Forced March / Plunder mirror Chisholm's pace + route
// tags (SAFE / FAST / PROFIT).
export const PACES: PaceConfig[] = [
  { id: "cautious",     label: "Cautious",     desc: "Short marches · spare the men", mpd: 6,  fx: { morale: 1, supplies: -1, water: -2 } },
  { id: "normal",       label: "Normal",       desc: "Standard column pace",          mpd: 9,  fx: { morale: -1, supplies: -2, water: -3 } },
  { id: "forced_march", label: "Forced March", desc: "Push hard · burn men and water", mpd: 13, fx: { morale: -4, supplies: -3, water: -5, men: -1 } },
];

export const RESOURCE_LABELS: Record<string, string> = {
  men: "men", horses: "horses", supplies: "supplies", water: "water",
  morale: "morale", faith: "faith", zeal: "zeal", silver: "silver", arms: "arms",
};

export function getPhrase(p: number): string {
  // TODO[content]: rewrite once route geography is finalised.
  if (p < 0.10) return "England recedes. The Channel is cold and grey.";
  if (p < 0.25) return "France, then the long roads south to the ports.";
  if (p < 0.45) return "Sicily winters loud. Richard quarrels with everyone.";
  if (p < 0.60) return "The fleet bears east. Cyprus burns on the horizon.";
  if (p < 0.80) return "Acre's walls in sight. The siege has waited for us.";
  if (p < 0.95) return "The coast road south. Jaffa, and beyond it, Jerusalem.";
  return "The Holy City is close enough to taste — or to refuse.";
}

export function buildTrailFeedEntries(
  resources: Resources,
  paceId: string,
  hardPaceStreak: number,
  distanceGain: number,
  day: number,
): string[] {
  // TODO[content]: real flavour passes once events are written.
  const notes: string[] = [];
  notes.push(`Day ${day}: ${Math.round(distanceGain)} leagues covered at ${paceId} pace.`);
  if (resources.water < 20) notes.push("The water-skins are nearly dry. The chaplain prays for rain.");
  if (resources.supplies < 20) notes.push("The quartermaster halves the rations again.");
  if (resources.morale < 25) notes.push("The men mutter in the dark. Even the sergeant is quiet.");
  if (resources.men <= 10) notes.push("Too few left in the retinue to hold a line.");
  if (hardPaceStreak >= 2) notes.push("Two days of forced march. The horses are blown.");
  if (notes.length < 2) notes.push("The column holds. Another day on the road.");
  return notes.slice(0, 3);
}

// Six DoomHUD party members. Order matters — first slot is the
// captain (Sir Hugh).
export function getPartyMembers(resources: Resources): PartyMember[] {
  const menPct = Math.min((resources.men / 40) * 100, 100);
  return [
    { id: "captain",   role: "Sir Hugh",  label: gf(FACES.captain,   resources.morale).label,  health: resources.morale },
    { id: "sergeant",  role: "Sergeant",  label: gf(FACES.sergeant,  resources.morale).label,  health: resources.morale },
    { id: "manAtArms", role: "Man-at-Arms", label: gf(FACES.manAtArms, menPct).label,            health: menPct },
    { id: "archer",    role: "Archer",    label: gf(FACES.archer,    resources.arms).label,    health: resources.arms },
    { id: "squire",    role: "Squire",    label: gf(FACES.squire,    resources.morale).label,  health: resources.morale },
    { id: "chaplain",  role: "Chaplain",  label: gf(FACES.chaplain,  resources.faith).label,   health: resources.faith },
  ];
}
