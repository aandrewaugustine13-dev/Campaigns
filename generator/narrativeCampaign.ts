// ════════════════════════════════════════════════════════════════
// PRODUCT 2 — FIRST-PERSON NARRATIVE (the choose-your-own-adventure).
//
// A spine-only, all-pinned, LINEAR campaign assembled DETERMINISTICALLY from a
// validated NarrativePlan. The fixed historical spine (the existing, proven
// narrative-spine machinery) IS the whole campaign: there is NO weighted random
// pool, NO sage, NO push-your-luck, NO multi-resource economy, NO expedition/
// outfit, NO branching route. Those are Product 1 (systems) features — this
// product SHEDS them by never authoring them, and nothing is deleted.
//
// This is a SEPARATE orchestrator. It composes the SHARED pure modules
// (storyPlanCompile, validate, schema) but does NOT touch generateCampaign —
// Product 1's path stays byte-identical.
//
//   narrativePlanToCampaign(plan, identity)  — PURE. plan → CampaignData. No
//                 model call, no network, no SDK. Fully unit-testable.
//   generateNarrativeCampaign(apiKey, inputs) — thin async wrapper: author the
//                 plan (generateStoryPlan, the one proven model stage) then
//                 assemble. The only model call is the spine generation.
//
// WHY SPINE-ONLY (no pool): the random pool is the systems-game DNA — it drops
// disconnected vignettes (and push-luck) BETWEEN the arc beats and is the source
// of the incoherence. A CYOA has no filler: the four deciding beats + the
// witnessing resolution are the entire ordered experience, so the run is fully
// deterministic and the ending is a pure function of the recorded choices.
// ════════════════════════════════════════════════════════════════

import type { CampaignData, OutfitScreenConfig } from "./schema.js";
import type { NarrativePlan } from "./storyPlan.js";
import type { NarrativeQuizBundle } from "./narrativeQuiz.js";
import { storyPlanToCampaignPieces } from "./storyPlanCompile.js";

// The SINGLE character/moral track. Product 2 has one track only (not a
// multi-resource economy): a decision beat's authored `stake` maps onto THIS
// key at compile time, so choices still carry mechanical weight. (Choice-memory
// — the richer per-beat record the ending reads — lands in a later step; this
// track is just the mechanical stake carrier.)
export const NARRATIVE_TRACK_KEY = "standing";

// The narrative product is spine-only, so the systems structures exist on the
// CampaignData type but are EMPTY (the validator gates their existence checks
// off for productType "narrative"). One shared empty outfit keeps the type happy.
const EMPTY_OUTFIT: OutfitScreenConfig = {
  budget: 0,
  baseCrew: 0,
  baseHorses: 0,
  baseSupplies: 0,
  costs: {},
  wageCosts: {},
  wageMorale: {},
  herdOptions: [],
};

// The identity/copy a narrative campaign needs that the PLAN does not itself
// carry. Kept explicit so the assembler stays pure and deterministic — the
// async wrapper fills these from the generation inputs.
export interface NarrativeIdentity {
  id: string;
  title: string;
  subtitle: string;
  introBody: string;
  trailFeedOpener: string;
  historicalContext: string;
  theme?: string;
  /** Player-facing label for the single track. Default "Standing". */
  trackLabel?: string;
  /** Starting value of the single track (0–100). Default 50. */
  trackStart?: number;
}

// ── The pure transform: NarrativePlan → spine-only CampaignData ───
// Every event is a PINNED beat (pinSeq 0..n-1, contiguous, arc-ordered); the
// spine tiles the full [0,1] arc because nothing fills the gaps. storyMeaning
// is carried verbatim (it becomes the constant coda of the assembled ending in
// a later step). Returns a CampaignData that validate() accepts as a narrative
// product (systems-only existence checks are gated off there).
export function narrativePlanToCampaign(
  plan: NarrativePlan,
  identity: NarrativeIdentity,
  // The closing assessment (Option A — authored by the separate narrativeQuiz
  // stage). Its questions become the FINAL-EXAM bank (eventTrivia; the mid-run
  // gate is suppressed for narrative) and its reviewSummary the study aid.
  // Optional so the pure spine tests can assemble a quiz-less campaign; absent ⇒
  // empty bank (validate() gates the eventTrivia requirement off for narrative).
  quiz?: NarrativeQuizBundle,
): CampaignData {
  const trackKey = NARRATIVE_TRACK_KEY;
  const trackStart = identity.trackStart ?? 50;
  const trackLabel = identity.trackLabel ?? "Standing";

  // Full-arc band: the spine IS the whole campaign (no surrounding pool to leave
  // room for), so the pinned beats tile the entire arc. primaryResourceKey lets
  // the compiler map each decision beat's `stake` onto the single track.
  const { pinnedEvents, storyMeaning } = storyPlanToCampaignPieces(plan, {
    primaryResourceKey: trackKey,
    band: { min: 0, max: 1 },
  });

  return {
    // Identity
    id: identity.id,
    title: identity.title,
    subtitle: identity.subtitle,
    introBody: identity.introBody,
    trailFeedOpener: identity.trailFeedOpener,
    theme: identity.theme,
    isPublished: false,
    // Product 2 advances beat-by-beat; "project" is the closest engine mode and
    // it switches OFF the journey-only validator checks (distance/map/trail/pace).
    progressionMode: "project",
    productType: "narrative",

    // Journey parameters — unused by a spine-only narrative run; legal placeholders.
    totalDays: pinnedEvents.length,
    daysPerTurn: 1,
    totalDistance: 0,
    distanceUnit: "",

    // The single character/moral track is the ONLY resource.
    initialResources: { [trackKey]: trackStart },
    resourceCaps: { [trackKey]: 100 },
    resourceLabels: { [trackKey]: trackLabel },

    // SHED systems machinery — present but empty (validator gates these for narrative).
    paces: [],
    events: pinnedEvents,
    sages: [],
    route: [],
    // FINAL-EXAM bank only (mid-run trivia gate is suppressed for narrative in
    // the engine). Empty when no quiz was authored.
    eventTrivia: quiz?.questions ?? [],
    trailPath: [],
    trailStops: [],
    mapImage: "",
    outfitConfig: EMPTY_OUTFIT,

    // Grading / end screen
    primaryResourceKey: trackKey,
    primaryResourceStart: trackStart,
    revenuePerUnit: 0,
    historicalContext: identity.historicalContext,

    // Cosmetic — objects required by the type/validator; empty is legal.
    pixelColors: {},
    pixelFaces: {},

    // Study aid that embeds every exam answer (the proven anti-misinformation
    // discipline). Authored by the quiz stage; absent ⇒ no recap.
    ...(quiz?.reviewSummary ? { reviewSummary: quiz.reviewSummary } : {}),

    // Story-level ENDING (kept; also mirrored as the assembled ending's coda).
    storyMeaning,
    // The constant frame for the responsive assembled ending: the per-choice
    // fragments ride on the events' choices; only the constant coda lives here.
    endingFrame: { coda: storyMeaning },
  } satisfies CampaignData;
}

// ── Thin async orchestrator ──────────────────────────────────────
// The one model call is the spine generation (generateStoryPlan — already proven,
// with its own validate + self-repair loop). Everything after is pure assembly.
// Mirrors the inputs the systems orchestrator accepts, minus the systems-only ones.
export interface NarrativeInputs {
  topic: string;
  standard: string;
  /** Whose eyes the player sees through (the first-person perspective). */
  perspective?: string;
  /** Student grade — sets the quiz reading level. */
  grade?: string;
  /** Closing-exam bank size. Default 6. */
  numQuestions?: number;
  /** Optional identity/copy overrides; sensible defaults are derived from the plan. */
  identity?: Partial<NarrativeIdentity>;
  /** Run the fact gate over the assembled campaign. Default ON — a classroom
   * quiz that mis-keys a fact is misinformation; the keyed-answer hard reject is
   * non-negotiable. Set false only for a deliberately unchecked path. */
  factGate?: boolean;
}

export interface GenerateNarrativeResult {
  data: CampaignData;
  plan: NarrativePlan;
  /** The closing assessment bundle (questions + reviewSummary). */
  quiz: NarrativeQuizBundle;
  /** Fact-gate verdict over the assembled campaign (absent when factGate is off). */
  factGate?: import("./factGate.js").FactGateResult;
}

// Derive a stable kebab id from the topic (e.g. "War of 1812" → "war-of-1812").
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "narrative";
}

export async function generateNarrativeCampaign(
  apiKey: string,
  inputs: NarrativeInputs,
): Promise<GenerateNarrativeResult> {
  // Lazy import keeps the SDK out of any pure consumer that only needs the assembler.
  const { generateStoryPlan } = await import("./storyPlanGen.js");
  const { data: plan } = await generateStoryPlan(inputs.standard, apiKey, {
    topic: inputs.topic,
    perspective: inputs.perspective,
    campaignType: "character",
    // Product 2 assembles a responsive ending from the player's choices, so the
    // plan must author an endingFragment per decision-beat choice.
    requireEndingFragments: true,
  });

  // Separate, beats-grounded quiz stage (Option A). Isolated from the plan call
  // above, so a bad quiz never re-rolls the proven spine/ending.
  const { generateNarrativeQuiz } = await import("./narrativeQuizGen.js");
  const { data: quiz } = await generateNarrativeQuiz(inputs.standard, apiKey, plan, {
    topic: inputs.topic,
    grade: inputs.grade,
    numQuestions: inputs.numQuestions,
  });

  const o = inputs.identity ?? {};
  const identity: NarrativeIdentity = {
    id: o.id ?? slugify(inputs.topic),
    title: o.title ?? inputs.topic,
    subtitle: o.subtitle ?? plan.throughline,
    introBody: o.introBody ?? plan.throughline,
    trailFeedOpener: o.trailFeedOpener ?? plan.beats[0]?.scene ?? plan.throughline,
    historicalContext: o.historicalContext ?? plan.meaning,
    theme: o.theme,
    trackLabel: o.trackLabel,
    trackStart: o.trackStart,
  };

  const data = narrativePlanToCampaign(plan, identity, quiz);

  // FACT GATE over the assembled campaign — the anti-misinformation backbone.
  // A keyed-answer fabrication is a hard reject (factGate.isQuizKeyed); other
  // residuals are corrected/shipped-with-warnings. Default ON.
  let factGate: import("./factGate.js").FactGateResult | undefined;
  if (inputs.factGate !== false) {
    const { runFactGate } = await import("./factGate.js");
    factGate = await runFactGate(apiKey, data, inputs.standard ? `${inputs.topic} — standard: ${inputs.standard}` : inputs.topic);
  }

  return { data, plan, quiz, factGate };
}
