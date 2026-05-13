import type { OutfitScreenConfig } from "../types";

// ═══════════════════════════════════════════════════════════════
// THIRD CRUSADE — outfit screen
// TODO[content]: real outfit economy. Values below are placeholders
// chosen to mirror Chisholm's shape so the screen renders.
// ═══════════════════════════════════════════════════════════════

export const OUTFIT_BUDGET = 1500;
export const BASE_CREW = 20;       // foot + retinue
export const BASE_HORSES = 12;
export const BASE_SUPPLIES = 50;
export const COST_RETAINER = 30;
export const COST_HORSE = 55;
export const COST_SUPPLY = 4;
export const COST_ARMS = 25;
export const COST_SPAREPARTS = 40; // mail / harness repair
export const COST_MEDICAL_GEAR = 60;
export const COST_HORSE_QUALITY = 80;
export const WAGE_COST: Record<string, number> = { low: 0, standard: 120, good: 260 };
export const WAGE_MORALE: Record<string, number> = { low: 35, standard: 50, good: 68 };
export const RETAINER_OPTIONS = [12, 20, 28, 36, 44];

export const CRUSADES_OUTFIT_CONFIG: OutfitScreenConfig = {
  budget: OUTFIT_BUDGET,
  baseCrew: BASE_CREW,
  baseHorses: BASE_HORSES,
  baseSupplies: BASE_SUPPLIES,
  costs: {
    cowboy: COST_RETAINER,    // re-used slot — "retainer" in this campaign
    horse: COST_HORSE,
    supply: COST_SUPPLY,
    gun: COST_ARMS,           // re-used slot — "arms" in this campaign
    spareParts: COST_SPAREPARTS,
    medicalGear: COST_MEDICAL_GEAR,
    horseQuality: COST_HORSE_QUALITY,
  },
  wageCosts: WAGE_COST,
  wageMorale: WAGE_MORALE,
  herdOptions: RETAINER_OPTIONS,  // re-used slot — retinue size
};
