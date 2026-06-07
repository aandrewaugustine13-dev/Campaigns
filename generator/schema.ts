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
// which the reader must distinguish from an explicit false. numeric flags
// store a number — an ACCUMULATING track (moral weight, regard) that choices
// nudge up/down across the run and the ending reads back as tiers.
export type FlagValue = boolean | null | number;

export interface FlagDecl {
  // unique within campaign, camelCase. NAMING CONVENTION for numeric (track)
  // flags: end the id in an accumulating-noun suffix — `...Regard`, `...Weight`,
  // or `...Standing` (e.g. familyRegard, communityRegard, moralWeight) — so a
  // bare number in a campaign file reads as a track, not a one-off value.
  id: string;
  type: "boolean" | "tristate" | "numeric";
  // boolean → false|true ; tristate → null|false|true ; numeric → a number
  // (typically 0), the track's starting value.
  initial: FlagValue;
  // numeric only: optional inclusive clamp bounds for the accumulating track.
  // When present, writes clamp to [min, max] (cf. resource caps). Strongly
  // encouraged so accumulation and reader tiers stay bounded.
  min?: number;
  max?: number;
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

// A variant selects on EITHER an exact value (boolean/tristate) OR a numeric
// threshold band (numeric flags) — exactly one mode per variant:
//   - boolean/tristate: `equals` — strict equality (behavior unchanged).
//   - numeric: `whenAtLeast` and/or `whenAtMost` — an inclusive band. With
//     first-match-wins ordering, list the highest tier first.
export interface FlagVariant {
  whenFlag: string;              // a declared flag id
  equals?: FlagValue;            // boolean/tristate: value that selects this variant
  whenAtLeast?: number;          // numeric: select if flags[whenFlag] >= whenAtLeast
  whenAtMost?: number;           // numeric: select if flags[whenFlag] <= whenAtMost
  text: string;
}

// True iff a variant selects against the flag's current value. boolean/
// tristate variants use strict equality on `equals` (UNCHANGED — existing
// campaigns resolve byte-identically); numeric variants use an inclusive
// threshold band. A variant with neither form never matches (defensive;
// validation forbids it).
function flagVariantMatches(v: FlagVariant, actual: FlagValue | undefined): boolean {
  if (v.equals !== undefined) return actual === v.equals;
  if (v.whenAtLeast === undefined && v.whenAtMost === undefined) return false;
  if (typeof actual !== "number") return false;
  if (v.whenAtLeast !== undefined && actual < v.whenAtLeast) return false;
  if (v.whenAtMost !== undefined && actual > v.whenAtMost) return false;
  return true;
}

// The single flag reader. STRICT SUPERSET: a plain string resolves to
// itself (so non-flag campaigns are byte-identical), and an empty/partial
// flag map matches no variant and falls back to `default`.
export function resolveFlagText(value: FlagText, flags: Record<string, FlagValue>): string {
  if (typeof value === "string") return value;
  for (const v of value.variants) {
    if (flagVariantMatches(v, flags[v.whenFlag])) return v.text;
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
  // Hidden moral signal for the generated-campaign verdict system. A SEPARATE
  // axis from flags/resources: the engine accumulates it into a standalone
  // GameState.moralTally and it never touches data.flags, so a tagged choice
  // does NOT flip a systems campaign into character mode. Optional & additive:
  // absent ⇒ untagged ⇒ byte-identical. (Stage 1 foundation: the tally is
  // accumulated but not yet read; the verdict that consumes it ships later.)
  moralTag?: "principled" | "self-serving" | "obvious";
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

// ── Reckoning (character-mode closing readout) ──────────────────
// The end-of-campaign "how they remember you" for the two relationship
// tracks. Each is a FlagText whose numeric variants (whenAtLeast/whenAtMost)
// tier the accumulated track value into prose, read by resolveFlagText at the
// close. Optional & additive: absent ⇒ no reckoning (systems and track-less
// character campaigns are unaffected). The two readouts stay SEPARATE — never
// a single combined verdict — so each relationship is its own truth.
export interface Reckoning {
  family: FlagText;
  community: FlagText;
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

  // Reckoning (character-mode closing readout; optional & additive)
  reckoning?: Reckoning;
}
