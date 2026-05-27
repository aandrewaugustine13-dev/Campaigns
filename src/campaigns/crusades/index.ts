import type { CampaignConfig } from "../types";
import { TOTAL_DAYS, DAYS_PER_TURN, INIT_R, RESOURCE_CAPS, RESOURCE_LABELS, PACES, getPhrase, buildTrailFeedEntries, getPartyMembers } from "./config";
import { EVENTS } from "./events";
import { SAGES } from "./sages";
import { CRUSADES_ROUTE } from "./routes";
import { CRUSADES_EVENT_TRIVIA } from "./eventTrivia";
import { TRAIL_PATH, STOPS, MAP_IMAGE, TOTAL_DISTANCE, getRegionFlavor } from "./trailMap";
import CrusadesParallaxBackground from "./parallax";
import CrusadesTriviaEngine, { pickTriviaQuestion } from "./trivia";
import { CRUSADES_OUTFIT_CONFIG } from "./outfitConfig";
import { FC, FACES } from "./pixelFaces";

// ═══════════════════════════════════════════════════════════════
// THIRD CRUSADE — campaign module
// Protagonist: Sir Hugh of Warwick, English household knight in
// Richard I's army.
// Mirrors the Chisholm campaign module shape exactly.
// ═══════════════════════════════════════════════════════════════

export const CrusadesCampaign: CampaignConfig = {
  id: "crusades",
  isPublished: true,
  title: "THE THIRD CRUSADE",
  subtitle: "Warwick to Jerusalem, 1190–1192",
  // TODO[content]: real intro + opening trail-feed copy.
  introBody: "1190. Richard the Lionheart has taken the cross. From Warwick to Jerusalem is two thousand miles of road, sea, and siege. Sir Hugh of Warwick rides with the king's host.",
  trailFeedOpener: "Summer 1190: the household banner is raised in Warwick and the road to Vézelay opens.",

  totalDays: TOTAL_DAYS,
  daysPerTurn: DAYS_PER_TURN,
  totalDistance: TOTAL_DISTANCE,
  distanceUnit: "leagues",

  initialResources: INIT_R,
  resourceCaps: RESOURCE_CAPS,
  resourceLabels: RESOURCE_LABELS,

  paces: PACES,
  events: EVENTS,
  sages: SAGES,
  route: CRUSADES_ROUTE,
  eventTrivia: CRUSADES_EVENT_TRIVIA,

  trailPath: TRAIL_PATH,
  trailStops: STOPS,
  mapImage: MAP_IMAGE,

  ParallaxBackground: CrusadesParallaxBackground,
  TriviaEngine: CrusadesTriviaEngine,

  outfitConfig: CRUSADES_OUTFIT_CONFIG,

  getRegionFlavor,
  getProgressPhrase: getPhrase,
  buildTrailFeedEntries,
  getPartyMembers,
  pickTriviaQuestion,

  primaryResourceKey: "men",
  primaryResourceStart: INIT_R.men,
  revenuePerUnit: 0, // not a revenue-driven campaign
  // TODO[content]: real historical context paragraph.
  historicalContext: "TODO[content]: the Third Crusade (1189–1192), called in response to Saladin's capture of Jerusalem in 1187, was led by Richard I of England, Philip II of France, and Frederick I Barbarossa.",

  pixelColors: FC,
  pixelFaces: FACES,
};

// ── Crusade-specific state flag exported separately ─────────────
// `coerced` is set during the cold-open prologue:
//   false → Hugh took the cross willingly
//   true  → Hugh refused, was pressed into the host anyway
// It will later modify narration flavour but does not branch
// content. The flag lives on the campaign state, not on the
// CampaignConfig.
// TODO[content]: thread `coerced` into narration substitutions.
export const CRUSADES_INITIAL_FLAGS = {
  coerced: false as boolean,
};
