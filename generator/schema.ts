// CampaignData — the JSON-only subset of CampaignConfig.
// This is what the LLM generator outputs. The player engine pairs it
// with generic implementations of the stripped fields (React components,
// functions) to produce a full CampaignConfig at runtime.

// ── Primitives ──────────────────────────────────────────────────

export type Resources = Record<string, number>;

// ── Flags (persistent typed facts) ──────────────────────────────
// Flags are a SEPARATE system from resources. Resources are numeric
// meters you spend and refill; flags are typed facts about who the
// player is or what they did. All of the following is optional and
// additive: a campaign with no `flags` behaves EXACTLY as before.

// A flag's stored value. boolean flags use false|true; tristate flags
// add null to mean "unset" (the choice that would set it never fired),
// which the reader must distinguish from an explicit false.
export type FlagValue = boolean | null;

export interface FlagDecl {
  id: string;                    // unique within campaign, camelCase
  type: "boolean" | "tristate";
  initial: FlagValue;            // boolean → false|true ; tristate → null|false|true
  label?: string;                // optional, editor/debug only
}

// Map of flagId → value a choice sets when taken. Sibling to a Choice's
// numeric `effects`; deliberately mirrors the Resources map shape.
export type FlagWrites = Record<string, FlagValue>;

// Narrative text that may vary on a flag value. A plain string is the
// (unchanged) common case; the object form picks the first matching
// variant, else `default`. The resolver is a strict superset — a plain
// string resolves to itself — so non-flag campaigns are unaffected.
export type FlagText =
  | string
  | { default: string; variants: FlagVariant[] };

export interface FlagVariant {
  whenFlag: string;              // a declared flag id
  equals: FlagValue;             // value that selects this variant
  text: string;
}

// The single flag reader. STRICT SUPERSET: a plain string resolves to
// itself (so non-flag campaigns are byte-identical), and an empty/partial
// flag map matches no variant and falls back to `default`.
export function resolveFlagText(value: FlagText, flags: Record<string, FlagValue>): string {
  if (typeof value === "string") return value;
  for (const v of value.variants) {
    if (flags[v.whenFlag] === v.equals) return v.text;
  }
  return value.default;
}

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
  flagWrites?: FlagWrites;
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
  text: FlagText;               // plain string, or flag-keyed variants (Stage B)
  type?: "standard" | "push_luck";
  choices?: Choice[];
  attempts?: PushAttempt[];
  leaveText?: string;
  trivia?: string[];
  sageAdvice?: SageAdvice[];
  riskProfile?: ("LOW" | "MED" | "HIGH")[];
  triviaGate?: boolean;
  imageSearchQuery?: string;
  image?: CommonsImage;
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

// Event imagery and campaign backdrop. Looser license pool than portraits
// (PD + CC0 + CC-BY + CC-BY-SA) — variety matters more than canonicity here.
// TODO: CC-BY-SA "share-alike" obligations may become relevant if the
// teacher-editing workflow later lets users modify and export these images.
// For now, in-platform display with attribution satisfies the license.
export interface CommonsImage {
  thumbUrl: string;
  artist: string;
  license: string;
  sourceUrl: string;
  searchQuery: string;
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
  /** Engine progression mode. Absent ⇒ treated as "journey" for back-compat.
   * "journey": distance + pace drives turns (totalDistance / paces required).
   * "project": time-based phases (totalDays / daysPerTurn required, travel
   * fields left empty). Validator gates journey-only checks on this value. */
  progressionMode?: "journey" | "project";

  // Journey parameters
  totalDays: number;
  daysPerTurn: number;
  totalDistance: number;
  distanceUnit: string;

  // Resources
  initialResources: Resources;
  resourceCaps: Resources;
  resourceLabels: Record<string, string>;

  // Flags (persistent typed facts; optional & additive — absent ⇒ no flag system)
  flags?: FlagDecl[];

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

  // Imagery (post-generation Commons enrichment)
  imageStyleKeyword?: string;
  backdropImage?: CommonsImage;
}
