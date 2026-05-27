import type { CampaignConfig } from "../types";
import { TOTAL_DAYS, DAYS_PER_TURN, INIT_R, RESOURCE_CAPS, RESOURCE_LABELS, PACES, getPhrase, buildTrailFeedEntries, getPartyMembers } from "./config";
import { EVENTS } from "./events";
import { SAGES } from "./sages";
import { CHISHOLM_ROUTE } from "./routes";
import { CHISHOLM_EVENT_TRIVIA } from "./eventTrivia";
import { TRAIL_PATH, STOPS, MAP_IMAGE, TOTAL_DISTANCE, getRegionFlavor } from "./trailMap";
import ChisholmParallaxBackground from "./parallax";
import ChisholmTriviaEngine, { pickTriviaQuestion } from "./trivia";
import { CHISHOLM_OUTFIT_CONFIG } from "./outfitConfig";
import { FC, FACES } from "./pixelFaces";

export const ChisholmCampaign: CampaignConfig = {
  id: "chisholm",
  isPublished: true,
  title: "CHISHOLM TRAIL",
  subtitle: "San Antonio to Abilene, 1867",
  introBody: "Spring, 1867. San Antonio, Texas. You have $2,000 and a reputation. Every outfit choice matters now — weak crews and wagons break on the trail.",
  trailFeedOpener: "Spring 1867: the outfit gathers in San Antonio and checks the wagon.",

  totalDays: TOTAL_DAYS,
  daysPerTurn: DAYS_PER_TURN,
  totalDistance: TOTAL_DISTANCE,
  distanceUnit: "miles",

  initialResources: INIT_R,
  resourceCaps: RESOURCE_CAPS,
  resourceLabels: RESOURCE_LABELS,

  paces: PACES,
  events: EVENTS,
  sages: SAGES,
  route: CHISHOLM_ROUTE,
  eventTrivia: CHISHOLM_EVENT_TRIVIA,

  trailPath: TRAIL_PATH,
  trailStops: STOPS,
  mapImage: MAP_IMAGE,

  ParallaxBackground: ChisholmParallaxBackground,
  TriviaEngine: ChisholmTriviaEngine,

  outfitConfig: CHISHOLM_OUTFIT_CONFIG,

  getRegionFlavor,
  getProgressPhrase: getPhrase,
  buildTrailFeedEntries,
  getPartyMembers,
  pickTriviaQuestion,

  primaryResourceKey: "herd",
  primaryResourceStart: INIT_R.herd,
  revenuePerUnit: 40,
  historicalContext: "The Chisholm Trail operated from 1867 to roughly 1884. An estimated 5 million cattle and 1 million mustangs were driven north along this and other trails. The cattle drive era built the Texas economy after the Civil War, created the cowboy legend, and connected the frontier to the industrial East. Barbed wire, railroads, and quarantine laws ended the drives — but the culture they created defined Texas forever.",

  pixelColors: FC,
  pixelFaces: FACES,
};
