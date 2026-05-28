// CampaignData — the JSON-only subset of CampaignConfig.
// This is what the LLM generator outputs. The player engine pairs it
// with generic implementations of the stripped fields (React components,
// functions) to produce a full CampaignConfig at runtime.

// ── Primitives ──────────────────────────────────────────────────

export type Resources = Record<string, number>;

// ── Pace ────────────────────────────────────────────────────────

export interface PaceConfig {
  id: string;
  label: string;
  desc: string;
  mpd: number;
  fx: Resources;
}

// ── Events ──────────────────────────────────────────────────────

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

// ── Sages ───────────────────────────────────────────────────────

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

// ── Route ───────────────────────────────────────────────────────

export interface RouteEdge {
  to: string;
  tag: "SAFE" | "FAST" | "PROFIT";
  label: string;
}

export interface RouteNode {
  id: string;
  title: string;
  description: string;
  edges: RouteEdge[];
}

// ── Event trivia (gate questions) ───────────────────────────────

export interface EventGateQuestion {
  id: string;
  question: string;
  choices: string[];
  correctIndex: number;
  fact: string;
}

// ── Trail / map ─────────────────────────────────────────────────

export interface TrailStop {
  id: string;
  name: string;
  pathIndex: number;
  pct: number;
  supply: boolean;
}

// ── Outfit screen ───────────────────────────────────────────────

export interface OutfitScreenConfig {
  budget: number;
  baseCrew: number;
  baseHorses: number;
  baseSupplies: number;
  costs: Record<string, number>;
  wageCosts: Record<string, number>;
  wageMorale: Record<string, number>;
  herdOptions: number[];
}

// ── Pixel face system ───────────────────────────────────────────

export interface FaceLevel {
  threshold: number;
  sprite: string;
  label: string;
}

// ═════════════════════════════════════════════════════════════════
// CampaignData — the full JSON-serializable output target
// ═════════════════════════════════════════════════════════════════

export interface CampaignData {
  // Identity
  id: string;
  title: string;
  subtitle: string;
  introBody: string;
  trailFeedOpener: string;
  theme?: string;
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

  // Outfit screen
  outfitConfig: OutfitScreenConfig;

  // Grading / end screen
  primaryResourceKey: string;
  primaryResourceStart: number;
  revenuePerUnit: number;
  historicalContext: string;

  // Pixel face system
  pixelColors: Record<string, string>;
  pixelFaces: Record<string, FaceLevel[]>;
}
