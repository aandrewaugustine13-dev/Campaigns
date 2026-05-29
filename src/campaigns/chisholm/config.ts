import type { Resources, PaceConfig, PartyMember } from "../types";
import { FACES, gf } from "./pixelFaces";

export const TOTAL_DAYS = 125;
export const DAYS_PER_TURN = 5;

export const INIT_R: Resources = {
  herd: 2500, crew: 12, horses: 60, supplies: 65,
  morale: 55, herdCondition: 60, wagonCondition: 72, cash: 250,
};

export const RESOURCE_CAPS: Record<string, number> = {
  herd: 3500, crew: 24, horses: 70, ammo: 240,
  spareParts: 12, wagonCondition: 100, cash: 5000,
};

export function clampR(k: string, v: number): number {
  const max = RESOURCE_CAPS[k] || 100;
  return Math.max(0, Math.min(v, max));
}

// Pace is the core push-vs-preserve tension. Easy genuinely restores
// the herd and crew but is too slow to finish on its own; Push covers
// ground fast but burns condition, morale, and supplies hard. The wide
// mpd spread (4/8/12) forces a real strategy of when to spend and when
// to recover rather than parking on one setting.
export const PACES: PaceConfig[] = [
  { id: "easy",   label: "Easy",   desc: "4 mi/day · Herd fattens", mpd: 4,  fx: { herdCondition:  4, morale:  2, supplies: -1 } },
  { id: "normal", label: "Normal", desc: "8 mi/day · Standard",      mpd: 8,  fx: { herdCondition: -1, morale: -1, supplies: -2 } },
  { id: "push",   label: "Push",   desc: "12 mi/day · Brutal",       mpd: 12, fx: { herdCondition: -7, morale: -5, supplies: -4 } },
];

export const RESOURCE_LABELS: Record<string, string> = {
  herd: "herd", crew: "crew", horses: "horses", ammo: "ammo",
  supplies: "supplies", morale: "morale", herdCondition: "cond", wagonCondition: "wagon",
};

export function getPhrase(p: number): string {
  if (p < 0.15) return "Eight hundred miles of dust and trouble ahead.";
  if (p < 0.3)  return "Days blur. Dust, cattle, sky. Repeat.";
  if (p < 0.5)  return "Indian Territory looms. Crew gets quiet.";
  if (p < 0.7)  return "Past halfway. Kansas might be real.";
  if (p < 0.85) return "Grass is changing. Cooler nights.";
  if (p < 0.95) return "Scout says he can smell Abilene.";
  return "The railhead is close.";
}

export function getTrailGrade(survived: boolean, herdPct: number, historicalKnowledge: number): string {
  if (!survived) return herdPct > 0.5 ? "D" : "F";
  const herdScore = Math.min(herdPct / 0.95, 1) * 50;
  const survivalScore = 20;
  const knowledgeScore = Math.min(historicalKnowledge / 30, 1) * 30;
  const total = herdScore + survivalScore + knowledgeScore;
  if (total >= 85) return "A+";
  if (total >= 75) return "A";
  if (total >= 65) return "B";
  if (total >= 50) return "C";
  return "D";
}

export function buildTrailFeedEntries(
  resources: Resources,
  paceId: string,
  hardPaceStreak: number,
  distanceGain: number,
  day: number,
): string[] {
  const notes: string[] = [];
  notes.push(`Day ${day}: ${Math.round(distanceGain)} miles covered at ${paceId} pace.`);

  if (resources.supplies < 15) notes.push("Supplies are running thin. The cook asks for careful rationing.");
  else if (resources.supplies < 30) notes.push("Salt pork is shrinking faster than expected.");

  if (resources.morale < 20) notes.push("Camp is quieter tonight, and spirits are low.");
  else if (resources.morale < 35) notes.push("Several riders look worn after the long days.");

  if (resources.wagonCondition <= 0) notes.push("The chuck wagon is lost. Travel is now much harder.");
  else if (resources.wagonCondition < 20) notes.push("The rear axle sounds rough. Repairs are urgent.");
  else if (resources.wagonCondition < 40) notes.push("The wagon frame is strained. A hard crossing could break it.");

  if ((resources.spareParts || 0) <= 0) notes.push("No spare parts remain. Another breakdown could end the drive.");
  if (resources.crew <= 7) notes.push("Too few hands are riding. Herd control is slipping.");
  if (resources.herdCondition < 30) notes.push("A few cattle need closer watching on the trail.");
  if (hardPaceStreak >= 2) notes.push("Back-to-back hard days are tiring horses and crew.");

  if (notes.length < 2) notes.push("The outfit stays steady today, but caution still matters.");
  return notes.slice(0, 3);
}

export function getPartyMembers(resources: Resources): PartyMember[] {
  return [
    { id: "boss",     role: "Boss",    label: gf(FACES.boss,     resources.morale).label,      health: resources.morale },
    { id: "scout",    role: "Scout",   label: gf(FACES.scout,    resources.morale).label,      health: resources.morale },
    { id: "cook",     role: "Cook",    label: gf(FACES.cook,     resources.supplies).label,    health: resources.supplies },
    { id: "wrangler", role: "Wrangler",label: gf(FACES.wrangler, resources.herdCondition).label, health: resources.herdCondition },
    { id: "point",    role: "Point",   label: gf(FACES.point,    resources.herdCondition).label, health: resources.herdCondition },
    { id: "hand",     role: "Hands",   label: gf(FACES.hand,     Math.min(resources.crew / 18 * 100, 100)).label, health: Math.min(resources.crew / 18 * 100, 100) },
  ];
}
