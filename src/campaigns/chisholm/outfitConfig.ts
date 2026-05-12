import type { OutfitScreenConfig } from "../types";

export const OUTFIT_BUDGET = 2000;
export const BASE_CREW = 8;
export const BASE_HORSES = 30;
export const BASE_SUPPLIES = 35;
export const COST_COWBOY = 120;
export const COST_HORSE = 40;
export const COST_SUPPLY = 6;
export const COST_GUN = 35;
export const COST_SPAREPARTS = 65;
export const COST_MEDICAL_GEAR = 75;
export const COST_HORSE_QUALITY = 90;
export const WAGE_COST: Record<string, number> = { low: 0, standard: 160, good: 360 };
export const WAGE_MORALE: Record<string, number> = { low: 35, standard: 50, good: 68 };
export const HERD_OPTIONS = [1500, 2000, 2500, 3000, 3500];

export const CHISHOLM_OUTFIT_CONFIG: OutfitScreenConfig = {
  budget: OUTFIT_BUDGET,
  baseCrew: BASE_CREW,
  baseHorses: BASE_HORSES,
  baseSupplies: BASE_SUPPLIES,
  costs: {
    cowboy: COST_COWBOY,
    horse: COST_HORSE,
    supply: COST_SUPPLY,
    gun: COST_GUN,
    spareParts: COST_SPAREPARTS,
    medicalGear: COST_MEDICAL_GEAR,
    horseQuality: COST_HORSE_QUALITY,
  },
  wageCosts: WAGE_COST,
  wageMorale: WAGE_MORALE,
  herdOptions: HERD_OPTIONS,
};
