import type React from "react";
import type { RouteNode, EventGateQuestion } from "../gameModels";

// ═══════════════════════════════════════════════════════════════
// SHARED ENGINE TYPES
// These are the contracts between campaigns and the engine.
// ═══════════════════════════════════════════════════════════════

export type Resources = Record<string, number>;

// Minimal shape the engine needs to track trivia state.
// Campaign-specific trivia questions extend this structurally.
export interface TriviaQuestion {
  id: string;
}

// ── Event system ─────────────────────────────────────────────

export interface Outcome {
  weight: number;
  effects: Resources;
  result: string;
  earlyEnd?: boolean;
}

export interface Choice {
  text: string;
  effects?: Resources;
  result?: string;
  outcomes?: Outcome[];
  earlyEnd?: boolean;
}

export interface PushAttempt {
  id: string;
  buttonText: string;
  successText: string;
  failureText: string;
  riskChance: number;
  rewards: Resources;
  penalties: Resources;
}

export interface SageAdvice {
  name: string;
  role: string;
  line: string;
}

export interface GameEvent {
  id: string;
  phase_min: number;
  phase_max: number;
  weight: number;
  title: string;
  text: string;
  type?: "standard" | "push_luck";
  choices?: Choice[];
  attempts?: PushAttempt[];
  leaveText?: string;
  trivia?: string[];
  sageAdvice?: SageAdvice[];
  riskProfile?: ("LOW" | "MED" | "HIGH")[];
  triviaGate?: boolean;
}

// ── Sage system ──────────────────────────────────────────────

export interface SageQuestion {
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  teksRef: string;
}

export interface PortraitAttribution {
  artist: string;
  license: string;
  sourceUrl: string;
}

export interface SageEncounterData {
  id: string;
  name: string;
  title: string;
  portrait: string;
  portraitAttribution?: PortraitAttribution;
  threshold: number;
  bio: string;
  greeting: string;
  advice: string;
  question: SageQuestion;
  reward: {
    correct: Resources;
    wrong: Resources;
    knowledgeCorrect: number;
    knowledgeWrong: number;
  };
}

// ── Pace system ──────────────────────────────────────────────

export interface PaceConfig {
  id: string;
  label: string;
  desc: string;
  mpd: number;
  fx: Resources;
}

// ── Map / trail system ───────────────────────────────────────

export interface TrailStop {
  id: string;
  name: string;
  pathIndex: number;
  pct: number;
  supply: boolean;
}

// ── HUD / party system ───────────────────────────────────────

export interface FaceLevel {
  threshold: number;
  sprite: string;
  label: string;
}

export interface PartyMember {
  id: string;
  role: string;
  label: string;
  health: number;
}

// ── Outfit screen ────────────────────────────────────────────

export interface OutfitConfig {
  herd: number;
  crew: number;
  horses: number;
  supplies: number;
  guns: number;
  spareParts: number;
  medicalGear: number;
  horseQuality: number;
  wages: "low" | "standard" | "good";
  budgetSpent: number;
  startingCash: number;
}

export interface OutfitScreenConfig {
  budget: number;
  baseCrew: number;
  baseHorses: number;
  baseSupplies: number;
  costs: {
    cowboy: number;
    horse: number;
    supply: number;
    gun: number;
    spareParts: number;
    medicalGear: number;
    horseQuality: number;
  };
  wageCosts: Record<string, number>;
  wageMorale: Record<string, number>;
  herdOptions: number[];
}

// ── Parallax background contract ─────────────────────────────

export interface ParallaxBackgroundProps {
  progress: number;
  pace: "rest" | "normal" | "push";
  height?: number;
}

// ── Trivia engine contract ────────────────────────────────────

export interface TriviaEngineProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  question: any;
  progress: number;
  streak: number;
  onComplete: (correct: boolean, effects: Resources) => void;
}

// ═══════════════════════════════════════════════════════════════
// CAMPAIGN CONFIG — the contract a campaign must satisfy
// ═══════════════════════════════════════════════════════════════

export interface CampaignConfig {
  // Identity
  id: string;
  title: string;
  subtitle: string;
  introBody: string;
  trailFeedOpener: string;
  isPublished?: boolean;

  // Journey parameters
  totalDays: number;
  daysPerTurn: number;
  totalDistance: number;
  distanceUnit: string;

  // Resources
  initialResources: Resources;
  resourceCaps: Resources;
  resourceLabels: Record<string, string>;

  // Game mechanics data
  paces: PaceConfig[];
  events: GameEvent[];
  sages: SageEncounterData[];
  route: RouteNode[];
  eventTrivia: EventGateQuestion[];

  // Map
  trailPath: [number, number][];
  trailStops: TrailStop[];
  mapImage: string;

  // Campaign-specific components
  ParallaxBackground: React.ComponentType<ParallaxBackgroundProps>;
  TriviaEngine: React.ComponentType<TriviaEngineProps>;

  // Outfit screen
  outfitConfig: OutfitScreenConfig;

  // Campaign-specific functions
  getRegionFlavor: (progress: number) => string;
  getProgressPhrase: (progress: number) => string;
  buildTrailFeedEntries: (
    resources: Resources,
    paceId: string,
    hardPaceStreak: number,
    distanceGain: number,
    day: number,
  ) => string[];
  getPartyMembers: (resources: Resources) => PartyMember[];
  pickTriviaQuestion: (progress: number, usedIds: Set<string>) => TriviaQuestion | null;

  // Grading / end screen
  primaryResourceKey: string;
  primaryResourceStart: number;
  revenuePerUnit: number;
  historicalContext: string;

  // Pixel face system (for the inline canvas HUD portraits)
  pixelColors: Record<string, string>;
  pixelFaces: Record<string, FaceLevel[]>;
}
