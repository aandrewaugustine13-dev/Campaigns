// Chunked systems-path campaign generation.
//
// The monolithic generateCampaign call sent one Gemini request with a 16k-token
// ceiling, the full CampaignData schema, and a Chisholm Trail sample. Almost
// all of the wall-clock time was that single completion. This module splits
// the same campaign into small JSON calls:
//
//   1. generateSkeleton     — structure only (ids, phases, resources, route).
//   2. generateEventBatch   — full events, ~5 beats at a time, in parallel,
//      alongside generateSages and generateTrivia.
//   3. generateClosers      — verdict + reviewSummary, after the events and
//      the exam exist, so the recap can embed the real answers.
//
// Parallel fill is the speedup: several short calls overlap, and none of them
// re-reads the schema or the example campaign. Stage-1 artifacts (frame, cast,
// economy, fault line, story plan, reference facts) are still ground truth.
//
// Model routing lives in models.ts. The skeleton call uses the architect
// model. Event batches, sages, and trivia use the writer model inside one
// Promise.all, then closers use the writer model. campaignState is a compact
// causal plan on the skeleton (tracks, choice mutations, later reads). It is
// injected into those prompts and is not copied onto the campaign.
//
// validate() and the fact gate stay in core.ts. They run after imagery
// enrichment and fault-line / story-plan splicing, which is the existing
// order. Running them on the unspliced shell would reject a campaign the
// splice is about to finish, and the fact gate must remain on the accepted
// attempt only (generateValidatedCampaign). priorErrors from a failed
// validate() are routed back to the stage that owns the field, and each
// stage retries once on a malformed response.

import { GoogleGenAI } from "@google/genai";
import { parseModelJson } from "./json.js";
import type { GenerateInputs } from "./core.js";
import { ARCHITECT_MODEL, NODE_WRITER_MODEL } from "./models.js";
import type { EconomyResource } from "./economy.js";
import type { PersonalResource } from "./personalEconomy.js";
import type {
  EventGateQuestion,
  FaceLevel,
  GameEvent,
  OutfitScreenConfig,
  PaceConfig,
  RouteNode,
  SageEncounterData,
  TrailStop,
  Verdict,
} from "./schema.js";

/** Events per parallel fill call. Four to six is the useful range; five balances prose size against call count. */
export const EVENT_BATCH_SIZE = 5;

/** Output budget for the architect call. The causal plan is still structure, not prose. */
const SKELETON_MAX_TOKENS = 5000;

/**
 * Thinking tokens on the architect call only. A Pro thinking model can spend
 * the whole output budget before it emits JSON. Writer calls leave thinking
 * at the SDK default, which is what the Flash path already runs.
 */
const ARCHITECT_THINKING_BUDGET = 1024;

/** One planned write. Number tracks use delta. Tag tracks use tag. No prose. */
export interface StateMutation {
  track: string;
  /** Integer from -2 to 2. Set only for number tracks. */
  delta?: number;
  /** Short slug. Set only for tag tracks. */
  tag?: string;
}

/** Compact choice stub. Player-facing text is written later, in parallel. */
export interface ChoiceSkeleton {
  id: string;
  mutates: StateMutation[];
}

export interface EventSkeleton {
  id: string;
  /** Journey fraction, 0–1. Locked before any event prose is written. */
  phase_min: number;
  phase_max: number;
  title: string;
  type: "standard" | "push_luck";
  /** Pool beats leave this unset. A true pin is guaranteed to fire. */
  pinned?: boolean;
  /** Track ids whose earlier mutations must change this beat. Empty on the first event. */
  reads?: string[];
  /** Exactly two stubs on a standard event. Absent on push_luck. */
  choices?: ChoiceSkeleton[];
}

/** A mutable flag or numeric track. Ids are camelCase. There is no description. */
export interface CampaignStateTrack {
  id: string;
  kind: "number" | "tag";
  start: number | string;
  /** Number tracks only. The range stays inside -3..3. */
  min?: number;
  max?: number;
}

/**
 * Writer plan for consequential branching. Not a runtime flags array: a
 * non-empty flags field would make the player treat the run as character mode.
 */
export interface CampaignState {
  tracks: CampaignStateTrack[];
}

export interface SageSkeleton {
  id: string;
  name: string;
  title: string;
  /** Progress 0–100 where this encounter fires. */
  threshold: number;
}

/**
 * Shared sensory and narrative facts from Stage 1. Every parallel Stage 2
 * batch receives the same three, so nodes written at the same time still
 * sound like one journey. Skeleton-only: assembleCampaign does not copy it.
 */
export interface ContinuityAnchors {
  /** A named historical person, their role, and one personality trait. */
  companionOrAdversary: string;
  /** One concrete era-specific object or document the protagonist carries. */
  signatureItemOrDocument: string;
  /** One persistent sensory, weather, or setting detail of this era and place. */
  environmentalMotif: string;
}

export interface LockedResource {
  key: string;
  name: string;
  playerFacing: string;
  isMoney?: boolean;
  startsAt?: "low" | "moderate" | "high";
  /** Set only for the character-mode non-money win condition. */
  primary?: boolean;
}

/**
 * Structure locked before prose. Event bodies, sage questions, the exam,
 * the verdict, and the review summary are filled by later stages.
 * `teachableFacts` is the shared fact list so the parallel event and trivia
 * calls teach and test the same specifics.
 */
export interface CampaignSkeleton {
  id: string;
  title: string;
  subtitle: string;
  introBody: string;
  trailFeedOpener: string;
  theme?: string;
  progressionMode?: "journey" | "project";
  imageStyleKeyword?: string;
  totalDays: number;
  daysPerTurn: number;
  totalDistance: number;
  distanceUnit: string;
  initialResources: Record<string, number>;
  resourceCaps: Record<string, number>;
  resourceLabels: Record<string, string>;
  primaryResourceKey: string;
  primaryResourceStart: number;
  revenuePerUnit: number;
  route: RouteNode[];
  trailPath: [number, number][];
  trailStops: TrailStop[];
  mapImage: string;
  outfitConfig: OutfitScreenConfig;
  pixelColors: Record<string, string>;
  pixelFaces: Record<string, FaceLevel[]>;
  paces?: PaceConfig[];
  eventSkeletons: EventSkeleton[];
  sageSkeletons: SageSkeleton[];
  teachableFacts: string[];
  historicalContext: string;
  storyMeaning?: string;
  /** Compact causal plan. Skeleton-only, same as continuityAnchors. */
  campaignState: CampaignState;
  continuityAnchors: ContinuityAnchors;
}

export interface CampaignClosers {
  verdict: Verdict;
  reviewSummary: string;
}

export interface RoutedErrors {
  skeleton: string[];
  events: string[];
  sages: string[];
  trivia: string[];
  closers: string[];
}

const THEMES = [
  "frontier-leather",
  "broadsheet-sepia",
  "parchment-medieval",
  "expedition-journal",
  "declassified-typewriter",
  "classical-marble",
  "civil-rights-midcentury",
  "default",
] as const;

const OUTPUT_ONLY = "You output ONLY a single JSON object. No markdown, no code fences, no commentary.";

const BREVITY = [
  "BREVITY is a hard requirement. Event text is 2-3 short sentences, about 45 words max.",
  "Each choice line is about 12 words max. Questions are one sentence; answer choices are one short line.",
  "Sage greeting and advice are at most 2 sentences each. Explanations and trivia facts are at most 2-3 sentences.",
  "Favor concrete detail over exposition. Do not pad.",
].join(" ");

const MORAL_TAGS = [
  "MORAL TAGS: when a choice serves or betrays people, or holds or abandons integrity, set moralTag to one of",
  "\"principled\" | \"self-serving\" | \"obvious\". principled = serves others or holds a costly line, at a cost to yourself.",
  "self-serving = your interest at others' expense. obvious = the frictionless, wait-and-see path (thoughtless, not cruel).",
  "OMIT moralTag on purely tactical choices (which route, which supplies). Holding a stand that has become costly is principled,",
  "not a neutral continuation. A sacrifice that protects the many is principled; trading others away to save yourself is self-serving.",
  "The tag is about who is served and who pays, never about which option is mechanically best.",
].join(" ");

const IMAGE_QUERY = [
  "imageSearchQuery, when present, is 2-4 words: a concrete scene a period artist or camera could have stood in front of",
  "(a place, object, named battle, ship, or portrait). No feelings, no abstract nouns (supply, morale, power),",
  "no action verbs (fighting, marching, suffering). If no concrete scene fits, omit imageSearchQuery.",
].join(" ");

// Mirrors core.readingLevelSpec. Kept local so this module does not runtime-import
// core.ts (core.ts imports the orchestrator below).
function readingLevelSpec(grade: string): string {
  const m = grade.match(/(\d+)/);
  const g = m ? parseInt(m[1], 10) : 8;
  const gc = Math.max(4, Math.min(8, g));
  const ladder: Record<number, { avg: string; max: number }> = {
    4: { avg: "7-9", max: 12 },
    5: { avg: "8-10", max: 13 },
    6: { avg: "9-11", max: 14 },
    7: { avg: "10-12", max: 16 },
    8: { avg: "11-13", max: 18 },
  };
  const { avg, max: maxLen } = ladder[gc];
  const aim = Math.max(2, g - 1);
  const clauses = g <= 6 ? "avoid clauses nested inside clauses" : "at most one short subordinate clause, never nested";
  return [
    `READING LEVEL: write for grade ${g}, but AIM a little SIMPLER (around grade ${aim}).`,
    `Prose harder than grade ${g} is a failure; easier prose is fine. This sets difficulty and does not lengthen anything.`,
    `Sentences average about ${avg} words, ${maxLen} words maximum. One idea per sentence; ${clauses}.`,
    "Choose the most common concrete word. An unavoidable historical term is fine if you define it in plain words the first time.",
  ].join(" ");
}

function feedbackBlock(errors?: string[]): string {
  if (!errors?.length) return "";
  return `\nYOUR PREVIOUS ATTEMPT FAILED THESE CHECKS. Fix EVERY one that this stage owns:\n${errors.map((e) => `- ${e}`).join("\n")}\n`;
}

function referenceBlock(inputs: GenerateInputs): string {
  if (!inputs.referenceFacts?.length) return "";
  return [
    "VETTED REFERENCE FACTS (ground truth — do not contradict these, and do not invent names, dates, or numbers beyond them):",
    ...inputs.referenceFacts.map((f) => `- ${f}`),
    "",
  ].join("\n");
}

export function toResourceKey(name: string, used: Set<string>): string {
  const words = name.replace(/['’]/g, "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  let base = "resource";
  if (words.length) {
    base = words
      .map((w, i) => {
        const lower = w.toLowerCase();
        return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join("");
    if (/^[0-9]/.test(base)) base = `r${base}`;
  }
  let key = base;
  let n = 2;
  while (used.has(key)) {
    key = `${base}${n}`;
    n += 1;
  }
  used.add(key);
  return key;
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Locked camelCase keys from a Stage-1 economy. Null when the campaign invents its own resources. */
export function lockedResourceSpecs(inputs: GenerateInputs): LockedResource[] | null {
  const personal = inputs.personalEconomy?.resources;
  const systems = inputs.economy?.resources;
  const specs: Array<PersonalResource | EconomyResource> | undefined = personal ?? systems;
  if (!specs?.length) return null;
  const used = new Set<string>();
  const locked: LockedResource[] = specs.map((r) => ({
    key: toResourceKey(r.name, used),
    name: r.name,
    playerFacing: r.playerFacing,
    startsAt: r.startsAt,
    isMoney: "isMoney" in r ? Boolean(r.isMoney) : false,
  }));
  if (inputs.personalEconomy) {
    const wanted = inputs.personalEconomy.primaryResource;
    const primary = locked.find((r) => !r.isMoney && (sameText(r.name, wanted) || sameText(r.playerFacing, wanted) || sameText(r.key, wanted)))
      ?? locked.find((r) => !r.isMoney);
    if (primary) primary.primary = true;
  }
  return locked;
}

const START_MAGNITUDE: Record<string, number> = { low: 30, moderate: 60, high: 85 };

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && isFinite(Number(v))) return Number(v);
  return undefined;
}

function lookupModelNumber(model: Record<string, unknown> | undefined, key: string, name: string): number | undefined {
  if (!model) return undefined;
  const direct = asNumber(model[key]);
  if (direct !== undefined) return direct;
  const targets = new Set([key.toLowerCase().replace(/[^a-z0-9]/g, ""), name.toLowerCase().replace(/[^a-z0-9]/g, "")]);
  for (const [k, v] of Object.entries(model)) {
    const n = asNumber(v);
    if (n === undefined) continue;
    if (targets.has(k.toLowerCase().replace(/[^a-z0-9]/g, ""))) return n;
  }
  return undefined;
}

/** Force initialResources / caps / labels / primaryResourceKey onto the locked keys. */
export function applyLockedResources(skeleton: CampaignSkeleton, locked: LockedResource[] | null): CampaignSkeleton {
  if (!locked?.length) {
    const keys = Object.keys(skeleton.initialResources ?? {});
    if (keys.length && !keys.includes(skeleton.primaryResourceKey)) skeleton.primaryResourceKey = keys[0];
    if (typeof skeleton.revenuePerUnit !== "number") skeleton.revenuePerUnit = 0;
    if (typeof skeleton.primaryResourceStart !== "number") {
      skeleton.primaryResourceStart = skeleton.initialResources?.[skeleton.primaryResourceKey] ?? 0;
    }
    return skeleton;
  }
  const init = skeleton.initialResources as unknown as Record<string, unknown> | undefined;
  const caps = skeleton.resourceCaps as unknown as Record<string, unknown> | undefined;
  const initialResources: Record<string, number> = {};
  const resourceCaps: Record<string, number> = {};
  const resourceLabels: Record<string, string> = {};
  for (const r of locked) {
    const startDefault = r.startsAt ? START_MAGNITUDE[r.startsAt] ?? 50 : 50;
    initialResources[r.key] = lookupModelNumber(init, r.key, r.name) ?? startDefault;
    resourceCaps[r.key] = lookupModelNumber(caps, r.key, r.name) ?? 100;
    resourceLabels[r.key] = r.playerFacing;
  }
  skeleton.initialResources = initialResources;
  skeleton.resourceCaps = resourceCaps;
  skeleton.resourceLabels = resourceLabels;
  const keys = locked.map((r) => r.key);
  const marked = locked.find((r) => r.primary)?.key;
  skeleton.primaryResourceKey = marked && keys.includes(marked)
    ? marked
    : keys.includes(skeleton.primaryResourceKey)
      ? skeleton.primaryResourceKey
      : (locked.find((r) => !r.isMoney)?.key ?? keys[0]);
  skeleton.primaryResourceStart = initialResources[skeleton.primaryResourceKey] ?? 0;
  if (locked.some((r) => r.isMoney) || typeof skeleton.revenuePerUnit !== "number") {
    if (locked.some((r) => r.isMoney)) skeleton.revenuePerUnit = 0;
    else if (typeof skeleton.revenuePerUnit !== "number") skeleton.revenuePerUnit = 0;
  }
  const allowed = new Set(keys);
  if (Array.isArray(skeleton.paces)) {
    for (const pace of skeleton.paces) {
      if (pace?.fx && typeof pace.fx === "object") {
        pace.fx = Object.fromEntries(Object.entries(pace.fx).filter(([k, v]) => allowed.has(k) && typeof v === "number"));
      }
    }
  }
  return skeleton;
}

export function splitEventBatches<T>(items: readonly T[], size = EVENT_BATCH_SIZE): T[][] {
  const n = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/** Round-robin so each parallel event batch owns specific facts and the union covers the list. */
export function assignFactsToBatches(batchCount: number, facts: readonly string[]): string[][] {
  const out = Array.from({ length: batchCount }, () => [] as string[]);
  if (batchCount === 0) return out;
  facts.forEach((fact, i) => {
    const text = fact.trim();
    if (text) out[i % batchCount].push(text);
  });
  return out;
}

export function triviaTargetCount(inputs: GenerateInputs, skeleton: Pick<CampaignSkeleton, "totalDays" | "daysPerTurn">): number {
  const requested = inputs.numQuestions;
  if (!inputs.faultLine) return requested;
  if (!(skeleton.daysPerTurn > 0)) return requested;
  const sized = Math.round(skeleton.totalDays / skeleton.daysPerTurn / 3);
  return Math.max(requested, Math.min(16, sized));
}

const SKELETON_FIELDS = new Set([
  "id", "title", "subtitle", "introBody", "trailFeedOpener", "primaryResourceKey",
  "historicalContext", "distanceUnit", "mapImage", "totalDays", "daysPerTurn",
  "totalDistance", "primaryResourceStart", "revenuePerUnit", "progressionMode",
  "theme", "storyMeaning", "imageStyleKeyword",
]);

/** Send each prior validation error to the stage that can repair it. Unmatched lines go to every stage so a retry cannot drop them. */
export function routePriorErrors(priorErrors: string[] | undefined): RoutedErrors {
  const buckets: RoutedErrors = { skeleton: [], events: [], sages: [], trivia: [], closers: [] };
  if (!priorErrors?.length) return buckets;
  for (const entry of priorErrors) {
    const field = (entry.split(":")[0] ?? "").trim();
    const head = field.split(/[.[\u2192]/)[0] ?? "";
    if (field.startsWith("events")) {
      buckets.events.push(entry);
      // Phase windows are locked by the skeleton, so an endgame-rhythm miss has to be repaired there too.
      if (field.includes("endgame")) buckets.skeleton.push(entry);
    } else if (field.startsWith("sages")) buckets.sages.push(entry);
    else if (field.startsWith("eventTrivia")) buckets.trivia.push(entry);
    else if (field.startsWith("verdict") || field === "reviewSummary") buckets.closers.push(entry);
    else if (
      SKELETON_FIELDS.has(field) || SKELETON_FIELDS.has(head) ||
      field.startsWith("paces") || field.startsWith("route") || field.startsWith("trail") ||
      field.startsWith("outfit") || field.startsWith("pixel") || field.startsWith("resource") ||
      field.startsWith("initial") || field.startsWith("flags")
    ) buckets.skeleton.push(entry);
    else {
      buckets.skeleton.push(entry);
      buckets.events.push(entry);
      buckets.sages.push(entry);
      buckets.trivia.push(entry);
      buckets.closers.push(entry);
    }
  }
  return buckets;
}

function resourceKeyList(skeleton: CampaignSkeleton): string[] {
  return Object.keys(skeleton.initialResources ?? {});
}

function constraintBrief(inputs: GenerateInputs, skeleton?: CampaignSkeleton): string {
  const lines: string[] = [];
  if (inputs.playerRole && !(inputs.povAvoid && inputs.povAvoid.trim())) {
    lines.push(`PLAYER ROLE (every sentence is from this point of view; the player IS this role): ${inputs.playerRole}`);
  }
  if (skeleton?.progressionMode) lines.push(`progressionMode: ${skeleton.progressionMode}`);
  if (skeleton) {
    const keys = resourceKeyList(skeleton);
    lines.push(`RESOURCE KEYS — use these exactly and no others: ${keys.join(", ") || "(none yet)"}`);
    lines.push(`primaryResourceKey: ${skeleton.primaryResourceKey}`);
  }
  if (inputs.cast?.length) {
    lines.push("CAST (these people only — do not invent additional named historical individuals; representative roles keep the given label and get no fabricated personal name):");
    for (const c of inputs.cast) lines.push(`- ${c.name} — ${c.role}. ${c.significance}`);
  }
  if (inputs.faultLine) {
    lines.push(`FAULT LINE (already compiled into events that will be spliced in AFTER you respond — do NOT write this dilemma, do NOT output a flags field, do NOT resolve it): ${inputs.faultLine.dilemma}`);
    lines.push(`Why there is no clean answer: ${inputs.faultLine.whyNoCleanAnswer}`);
  }
  if (inputs.storyPlan) {
    const beats = inputs.storyPlan.beats.filter((b) => b.included).map((b) => b.title);
    lines.push(`NARRATIVE SPINE (pinned beats are spliced in afterward — do NOT retell them): ${inputs.storyPlan.throughline}`);
    if (beats.length) lines.push(`Pinned beat titles: ${beats.join("; ")}`);
    lines.push("Do not author storyMeaning; the plan's ending is applied in code.");
  }
  return lines.join("\n");
}

function continuityBlock(skeleton: CampaignSkeleton): string {
  const anchors = skeleton.continuityAnchors;
  if (!anchors) return "";
  return [
    "CONTINUITY ANCHORS (the same three are given to every parallel batch — weave at least one into this node's passage or a choice consequence):",
    `- companionOrAdversary: ${anchors.companionOrAdversary}`,
    `- signatureItemOrDocument: ${anchors.signatureItemOrDocument}`,
    `- environmentalMotif: ${anchors.environmentalMotif}`,
  ].join("\n");
}

function formatMutation(mutation: StateMutation): string {
  if (mutation.tag !== undefined) return `${mutation.track}=${mutation.tag}`;
  const delta = mutation.delta ?? 0;
  return `${mutation.track}${delta >= 0 ? "+" : ""}${delta}`;
}

/** Full planned chain. Every parallel event batch sees every other beat's reads and mutations. */
function causalBlock(skeleton: CampaignSkeleton): string {
  const tracks = skeleton.campaignState?.tracks ?? [];
  if (tracks.length === 0) return "";
  const trackLines = tracks.map((track) => (
    track.kind === "number"
      ? `- ${track.id}: number, starts ${track.start}, range ${track.min}..${track.max}`
      : `- ${track.id}: tag, starts ${track.start}`
  ));
  const chain = skeleton.eventSkeletons.map((ev) => {
    const reads = ev.reads?.length ? `reads ${ev.reads.join(", ")}` : "reads nothing";
    if (ev.type === "push_luck" || !ev.choices?.length) {
      return `- ${ev.id} (${ev.title}, push_luck): ${reads}; no choice stubs`;
    }
    const stubs = ev.choices
      .map((choice) => `${choice.id} [${choice.mutates.map(formatMutation).join(", ") || "no mutation"}]`)
      .join("; ");
    return `- ${ev.id} (${ev.title}): ${reads}; choices ${stubs}`;
  });
  return [
    "CAUSAL STATE (Stage 1 plan — every parallel batch sees the full chain, because later nodes are written at the same time and cannot see the player's actual choice):",
    ...trackLines,
    ...chain,
    "Write exactly one player-facing choice per stub, in that order, with the same id. The result or the effects must show that stub's mutations in the scene.",
    "Do not mention track ids as game variables, scores, or meters.",
    "If this event lists reads, the passage and the stakes must reflect those tracks after the earlier mutations. An early choice has to visibly change what this beat costs or offers.",
    "Do not invent a flags array. A push_luck event has attempts, not choices.",
  ].join("\n");
}

/** Short form for sages, trivia, and closers, which do not write the choice stubs. */
function causalSummary(skeleton: CampaignSkeleton): string {
  const tracks = skeleton.campaignState?.tracks ?? [];
  if (tracks.length === 0) return "";
  const trackLine = tracks.map((track) => `${track.id} (${track.kind}, starts ${track.start})`).join(", ");
  const beats = skeleton.eventSkeletons.map((ev) => {
    const reads = ev.reads?.length ? `reads ${ev.reads.join("+")}` : "reads nothing";
    const mutations = [...new Set((ev.choices ?? []).flatMap((choice) => choice.mutates.map(formatMutation)))];
    return `${ev.title}: ${reads}${mutations.length ? `; may set ${mutations.join(", ")}` : ""}`;
  }).join(" | ");
  return `CAUSAL PLAN (do not contradict it, and do not name these tracks as meters or scores): ${trackLine}. ${beats}`;
}

function relationshipBlock(inputs: GenerateInputs): string {
  if (!inputs.faultLine) return "";
  return [
    "CHARACTER RELATIONSHIPS (required): do NOT output a flags array. The engine declares two numeric tracks, family and community, range -10..10.",
    "On standard-event choices, set flagWrites to SMALL integer deltas, each in -3..-1 or +1..+3. Example: \"flagWrites\": { \"family\": 2, \"community\": -1 }.",
    "You only see one batch, so THIS batch must write family at least once AND community at least once,",
    "include one choice with family positive and community negative, include one choice with community positive and family negative,",
    "and include at most one choice that raises both, and only by 1. Put ±3 on the conflict choices.",
    "A track that only rises is a score. No line of play may reach devotion to both (both tracks at +9).",
    "Result prose may show the human cost in words, never as a number and never as \"+2 family\".",
    "The event whose phase_min is 0.85 is the closing dilemma: at least two choices and the largest deltas.",
    "Do not write a second identity-defining fork. The compiled fault line already has the defining choice.",
  ].join(" ");
}

function economyChoiceBlock(inputs: GenerateInputs): string {
  if (inputs.personalEconomy) {
    return [
      "PERSONAL ECONOMY: a choice must move at least one of — a locked resource, family, or community — but NOT all of them, and NOT money on every choice.",
      "Money changes only when the choice genuinely spends or earns cash. A relational choice may carry flagWrites and no resource effect.",
      "Ending with more cash is not winning. Do not put effects on the money key unless cash actually moved.",
    ].join(" ");
  }
  if (inputs.economy) {
    return "SYSTEMS ECONOMY: every choice in a multi-option event must change at least one locked resource, via effects or via outcomes[].effects. Do not add resource keys.";
  }
  return "Every choice in a multi-option event must have a felt consequence: effects, outcomes, or earlyEnd. Effects may use only the locked resource keys.";
}

async function generateJson(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  maxOutputTokens: number,
  thinkingBudget?: number,
): Promise<unknown> {
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model,
    contents: user,
    config: {
      systemInstruction: system,
      maxOutputTokens,
      responseMimeType: "application/json",
      ...(thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget } } : {}),
    },
  });
  return parseModelJson(response.text ?? "");
}

/** One repair retry when the response is not usable JSON or fails the stage's shape check. */
async function callStage<T>(
  apiKey: string,
  model: string,
  system: string,
  buildUser: (errors: string[]) => string,
  maxOutputTokens: number,
  priorErrors: string[] | undefined,
  parse: (raw: unknown) => T,
  thinkingBudget?: number,
): Promise<T> {
  const run = async (errors: string[]) => parse(await generateJson(apiKey, model, system, buildUser(errors), maxOutputTokens, thinkingBudget));
  try {
    return await run(priorErrors ?? []);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return await run([...(priorErrors ?? []), `stage repair: ${msg}`]);
  }
}

function unwrapObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("stage did not return a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  for (const key of ["skeleton", "campaignSkeleton", "campaign", "data"]) {
    const inner = obj[key];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) return inner as Record<string, unknown>;
  }
  return obj;
}

function extractArray(raw: unknown, key: string): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
    for (const wrap of ["data", "campaign"]) {
      const inner = obj[wrap];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        const nested = (inner as Record<string, unknown>)[key];
        if (Array.isArray(nested)) return nested;
      }
    }
  }
  throw new Error(`response had no "${key}" array`);
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function requireText(obj: Record<string, unknown>, key: string): void {
  if (typeof obj[key] !== "string" || !(obj[key] as string).trim()) {
    throw new Error(`skeleton missing ${key}`);
  }
}

function uniqueIds(items: { id: string }[], prefix: string): void {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    let id = (item.id || `${prefix}_${i + 1}`).trim().replace(/\s+/g, "_");
    if (!id) id = `${prefix}_${i + 1}`;
    while (seen.has(id)) id = `${id}_${i + 1}`;
    seen.add(id);
    item.id = id;
  });
}

const TRACK_ID = /^[a-z][a-zA-Z0-9]{0,24}$/;
const CHOICE_ID = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;
const MAX_TRACKS = 4;

function clampInt(value: number, lo: number, hi: number): number {
  const rounded = Math.round(value);
  if (rounded < lo) return lo;
  if (rounded > hi) return hi;
  return rounded;
}

/** A tag is one token. A sentence is prose, so it does not survive. */
function tagToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return undefined;
  const token = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!/^[a-z][a-z0-9]{0,23}$/.test(token)) return undefined;
  return token;
}

function fallbackCampaignState(): CampaignState {
  return {
    tracks: [
      { id: "stakePressure", kind: "number", start: 0, min: -2, max: 2 },
      { id: "decisionTag", kind: "tag", start: "unset" },
    ],
  };
}

function readTrack(raw: unknown): CampaignStateTrack | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  if (!TRACK_ID.test(id)) return undefined;
  if (obj.kind === "tag") {
    return { id, kind: "tag", start: tagToken(obj.start) ?? "unset" };
  }
  if (obj.kind !== "number") return undefined;
  let min = clampInt(asNumber(obj.min) ?? -3, -3, 3);
  let max = clampInt(asNumber(obj.max) ?? 3, -3, 3);
  if (min > max) [min, max] = [max, min];
  if (min === max) {
    if (min > -3) min -= 1;
    else max += 1;
  }
  return {
    id,
    kind: "number",
    start: clampInt(asNumber(obj.start) ?? 0, min, max),
    min,
    max,
  };
}

/** Lenient, like continuity anchors: a missing object must not fail the stage or the existing fixtures. */
function normalizeCampaignState(raw: unknown): CampaignState {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const source = Array.isArray(obj.tracks) ? obj.tracks : [];
  const tracks: CampaignStateTrack[] = [];
  const seen = new Set<string>();
  for (const item of source) {
    if (tracks.length >= MAX_TRACKS) break;
    const track = readTrack(item);
    if (!track || seen.has(track.id)) continue;
    seen.add(track.id);
    tracks.push(track);
  }
  return tracks.length > 0 ? { tracks } : fallbackCampaignState();
}

function readTrackIds(raw: unknown, known: Set<string>): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !known.has(item) || ids.includes(item)) continue;
    ids.push(item);
  }
  return ids;
}

function readMutations(raw: unknown, tracks: CampaignStateTrack[]): StateMutation[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const mutations: StateMutation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const track = typeof obj.track === "string" ? byId.get(obj.track) : undefined;
    if (!track) continue;
    if (track.kind === "number") {
      const delta = asNumber(obj.delta);
      if (delta === undefined) continue;
      mutations.push({ track: track.id, delta: clampInt(delta, -2, 2) });
    } else {
      const tag = tagToken(obj.tag);
      if (!tag) continue;
      mutations.push({ track: track.id, tag });
    }
  }
  return mutations;
}

function parseChoiceStubs(raw: unknown, tracks: CampaignStateTrack[]): ChoiceSkeleton[] {
  if (!Array.isArray(raw)) return [];
  const stubs: ChoiceSkeleton[] = [];
  for (const item of raw) {
    if (stubs.length >= 2) break;
    const obj = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const id = typeof obj.id === "string" ? obj.id.trim() : "";
    stubs.push({
      id: CHOICE_ID.test(id) ? id : "",
      mutates: readMutations(obj.mutates, tracks),
    });
  }
  return stubs;
}

function fallbackMutation(tracks: CampaignStateTrack[], index: number): StateMutation[] {
  const numberTrack = tracks.find((track) => track.kind === "number");
  if (numberTrack) return [{ track: numberTrack.id, delta: index === 0 ? 1 : -1 }];
  return [{ track: tracks[0].id, tag: index === 0 ? "committed" : "withheld" }];
}

function completeChoiceStubs(existing: ChoiceSkeleton[] | undefined, tracks: CampaignStateTrack[]): ChoiceSkeleton[] {
  const stubs = (existing ?? []).slice(0, 2);
  while (stubs.length < 2) stubs.push({ id: "", mutates: [] });
  const seen = new Set<string>();
  return stubs.map((stub, index) => {
    let id = stub.id;
    if (!id || seen.has(id)) id = index === 0 ? "choiceA" : "choiceB";
    while (seen.has(id)) id = `${id}_${index + 1}`;
    seen.add(id);
    return {
      id,
      mutates: stub.mutates.length > 0 ? stub.mutates : fallbackMutation(tracks, index),
    };
  });
}

/** Later beats must name a track an earlier choice already writes. */
function enforceCausalReads(list: EventSkeleton[]): void {
  const mutated = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    const ev = list[i];
    if (i > 0 && mutated.size > 0) {
      const reads = ev.reads ?? [];
      if (!reads.some((id) => mutated.has(id))) {
        const prior = [...mutated][0];
        ev.reads = [prior, ...reads.filter((id) => id !== prior)];
      }
    }
    for (const choice of ev.choices ?? []) {
      for (const mutation of choice.mutates) mutated.add(mutation.track);
    }
  }
}

function normalizeEventSkeletons(raw: unknown, inputs: GenerateInputs, state: CampaignState): EventSkeleton[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("skeleton emitted no event skeletons");
  const known = new Set(state.tracks.map((track) => track.id));
  const list: EventSkeleton[] = raw.map((item, i) => {
    const e = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    let phaseMin = clamp01(asNumber(e.phase_min) ?? i / raw.length);
    let phaseMax = clamp01(asNumber(e.phase_max) ?? Math.min(1, phaseMin + 0.25));
    if (phaseMax < phaseMin) [phaseMin, phaseMax] = [phaseMax, phaseMin];
    const type = e.type === "push_luck" ? "push_luck" : "standard";
    const sk: EventSkeleton = {
      id: typeof e.id === "string" ? e.id : `event_${i + 1}`,
      phase_min: phaseMin,
      phase_max: phaseMax,
      title: typeof e.title === "string" && e.title.trim() ? e.title.trim() : `Event ${i + 1}`,
      type,
      reads: readTrackIds(e.reads, known),
      choices: parseChoiceStubs(e.choices, state.tracks),
    };
    if (e.pinned === true) sk.pinned = true;
    return sk;
  });
  list.sort((a, b) => a.phase_min - b.phase_min || a.title.localeCompare(b.title));
  uniqueIds(list, "event");
  if (inputs.length > 0 && list.length !== inputs.length) {
    throw new Error(`skeleton emitted ${list.length} event skeletons; expected ${inputs.length}`);
  }
  if (inputs.faultLine) {
    const closer = list.find((e) => e.type === "standard" && e.phase_min >= 0.85 && e.phase_max >= 0.9);
    if (!closer) {
      const lastStandard = [...list].reverse().find((e) => e.type === "standard") ?? list[list.length - 1];
      lastStandard.type = "standard";
      lastStandard.phase_min = 0.85;
      lastStandard.phase_max = 1;
    }
    list.sort((a, b) => a.phase_min - b.phase_min || a.title.localeCompare(b.title));
  }
  const firstTrack = state.tracks[0].id;
  list.forEach((ev, index) => {
    if (index === 0) ev.reads = [];
    else if (!ev.reads?.length) ev.reads = [firstTrack];
    if (ev.type === "push_luck") delete ev.choices;
    else ev.choices = completeChoiceStubs(ev.choices, state.tracks);
  });
  enforceCausalReads(list);
  return list;
}

function normalizeSageSkeletons(raw: unknown, inputs: GenerateInputs): SageSkeleton[] {
  const want = Math.max(0, inputs.numSages);
  if (want === 0) return [];
  const source = Array.isArray(raw) ? raw : [];
  const list: SageSkeleton[] = source.slice(0, want || source.length).map((item, i) => {
    const s = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    return {
      id: typeof s.id === "string" ? s.id : `sage_${i + 1}`,
      name: typeof s.name === "string" && s.name.trim() ? s.name.trim() : `Guide ${i + 1}`,
      title: typeof s.title === "string" && s.title.trim() ? s.title.trim() : "Guide",
      threshold: Math.round(asNumber(s.threshold) ?? 50),
    };
  });
  if (want > 0 && list.length < want) {
    const cast = inputs.cast ?? [];
    while (list.length < want) {
      const i = list.length;
      const person = cast[i];
      list.push({
        id: `sage_${i + 1}`,
        name: person?.name ?? `Guide ${i + 1}`,
        title: person?.role ?? "Guide",
        threshold: 50,
      });
    }
  }
  const sized = want > 0 ? list.slice(0, want) : list;
  sized.forEach((s, i) => {
    s.threshold = Math.round(((i + 1) / (sized.length + 1)) * 100);
  });
  uniqueIds(sized, "sage");
  return sized;
}

function clipSentence(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Keep a model's anchors when they are real sentences. Otherwise fill a short fallback so a missing object does not fail the stage. */
function normalizeContinuityAnchors(raw: unknown, title: string, historicalContext: string): ContinuityAnchors {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const name = title.trim() || "this campaign";
  const place = clipSentence(historicalContext, 80);
  const text = (key: keyof ContinuityAnchors, fallback: string) => {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return clipSentence(value, 240);
    return fallback;
  };
  return {
    companionOrAdversary: text(
      "companionOrAdversary",
      `A named local with a sharp temper keeps crossing the protagonist's path through ${name}.`,
    ),
    signatureItemOrDocument: text(
      "signatureItemOrDocument",
      `The protagonist carries one worn, era-specific paper from ${name}.`,
    ),
    environmentalMotif: text(
      "environmentalMotif",
      place || `The same weather and ground keep returning through ${name}.`,
    ),
  };
}

export function normalizeSkeleton(raw: unknown, inputs: GenerateInputs): CampaignSkeleton {
  const obj = unwrapObject(raw);
  for (const key of ["id", "title", "subtitle", "introBody", "trailFeedOpener", "historicalContext"]) {
    requireText(obj, key);
  }
  const mode = obj.progressionMode === "project" ? "project" : obj.progressionMode === "journey" ? "journey" : undefined;
  const skeleton = obj as unknown as CampaignSkeleton;
  skeleton.progressionMode = mode ?? (inputs.frame ? skeleton.progressionMode : "journey");
  if (skeleton.progressionMode !== "project" && skeleton.progressionMode !== "journey") {
    skeleton.progressionMode = "journey";
  }
  skeleton.totalDays = asNumber(obj.totalDays) ?? 0;
  skeleton.daysPerTurn = asNumber(obj.daysPerTurn) ?? 0;
  skeleton.totalDistance = asNumber(obj.totalDistance) ?? 0;
  skeleton.revenuePerUnit = asNumber(obj.revenuePerUnit) ?? 0;
  skeleton.primaryResourceStart = asNumber(obj.primaryResourceStart) ?? 0;
  if (!(skeleton.totalDays > 0) || !(skeleton.daysPerTurn > 0)) {
    throw new Error("skeleton needs totalDays > 0 and daysPerTurn > 0");
  }
  if (!skeleton.initialResources || typeof skeleton.initialResources !== "object" || Array.isArray(skeleton.initialResources)) {
    throw new Error("skeleton missing initialResources");
  }
  delete (skeleton as { flags?: unknown }).flags;
  skeleton.campaignState = normalizeCampaignState(obj.campaignState);
  skeleton.eventSkeletons = normalizeEventSkeletons(obj.eventSkeletons ?? obj.events, inputs, skeleton.campaignState);
  skeleton.sageSkeletons = normalizeSageSkeletons(obj.sageSkeletons ?? obj.sages, inputs);
  const facts = obj.teachableFacts;
  skeleton.teachableFacts = Array.isArray(facts) ? facts.filter((f): f is string => typeof f === "string" && f.trim().length > 0) : [];
  if (skeleton.progressionMode === "project") {
    skeleton.totalDistance = 0;
    skeleton.distanceUnit = "";
    skeleton.trailPath = [];
    skeleton.trailStops = [];
    skeleton.paces = [];
    skeleton.mapImage = typeof skeleton.mapImage === "string" ? skeleton.mapImage : "";
    // A project has no route forks. One terminal start node is the honest shape.
    skeleton.route = [{ id: "start", title: skeleton.title, description: skeleton.subtitle, edges: [] }];
    if (skeleton.outfitConfig && typeof skeleton.outfitConfig === "object") skeleton.outfitConfig.herdOptions = [];
  } else {
    if (typeof skeleton.distanceUnit !== "string" || !skeleton.distanceUnit.trim()) {
      throw new Error("skeleton missing distanceUnit");
    }
    if (typeof skeleton.mapImage !== "string" || !skeleton.mapImage.trim()) skeleton.mapImage = "map-placeholder.png";
    if (!Array.isArray(skeleton.route) || skeleton.route.length === 0) throw new Error("skeleton route is empty");
    if (!skeleton.route.some((n) => n?.id === "start")) throw new Error('skeleton route has no node id "start"');
    if (!Array.isArray(skeleton.paces) || skeleton.paces.length === 0) throw new Error("skeleton paces is empty");
    if (!Array.isArray(skeleton.trailPath) || skeleton.trailPath.length < 2) throw new Error("skeleton trailPath needs at least 2 points");
    if (!Array.isArray(skeleton.trailStops) || skeleton.trailStops.length < 2) throw new Error("skeleton trailStops needs at least 2 stops");
  }
  if (!skeleton.outfitConfig || typeof skeleton.outfitConfig !== "object") throw new Error("skeleton missing outfitConfig");
  if (typeof skeleton.outfitConfig.budget !== "number") skeleton.outfitConfig.budget = 0;
  if (!skeleton.outfitConfig.costs || typeof skeleton.outfitConfig.costs !== "object") skeleton.outfitConfig.costs = {};
  if (!skeleton.pixelColors || typeof skeleton.pixelColors !== "object") {
    skeleton.pixelColors = { skin: "#D4A574", hair: "#3B2A1A", coat: "#6B4F3A" };
  }
  if (!skeleton.pixelFaces || typeof skeleton.pixelFaces !== "object") skeleton.pixelFaces = {};
  if (!skeleton.resourceCaps || typeof skeleton.resourceCaps !== "object") skeleton.resourceCaps = {};
  if (!skeleton.resourceLabels || typeof skeleton.resourceLabels !== "object") skeleton.resourceLabels = {};
  if (inputs.storyPlan) delete skeleton.storyMeaning;
  applyLockedResources(skeleton, lockedResourceSpecs(inputs));
  if (Object.keys(skeleton.initialResources).length === 0) throw new Error("skeleton has no resource keys");
  for (const key of Object.keys(skeleton.initialResources)) {
    if (typeof skeleton.resourceLabels[key] !== "string" || !skeleton.resourceLabels[key].trim()) skeleton.resourceLabels[key] = key;
    if (typeof skeleton.resourceCaps[key] !== "number") skeleton.resourceCaps[key] = 100;
  }
  if (!(skeleton.primaryResourceKey in skeleton.initialResources)) {
    throw new Error(`primaryResourceKey "${skeleton.primaryResourceKey}" is not in initialResources`);
  }
  skeleton.continuityAnchors = normalizeContinuityAnchors(
    obj.continuityAnchors,
    skeleton.title,
    skeleton.historicalContext,
  );
  if (inputs.lockedTheme && (THEMES as readonly string[]).includes(inputs.lockedTheme)) {
    skeleton.theme = inputs.lockedTheme;
  }
  return skeleton;
}

function pairById<T>(
  skeletons: { id: string }[],
  raw: unknown[],
  label: string,
): unknown[] {
  if (raw.length !== skeletons.length) {
    throw new Error(`${label} returned ${raw.length}; expected ${skeletons.length} (${skeletons.map((s) => s.id).join(", ")})`);
  }
  const pool = raw.map((item) => (item && typeof item === "object" ? item as Record<string, unknown> : {}));
  const used = new Set<number>();
  return skeletons.map((sk) => {
    let idx = pool.findIndex((item, i) => !used.has(i) && item.id === sk.id);
    if (idx === -1) idx = pool.findIndex((_, i) => !used.has(i));
    if (idx === -1) throw new Error(`${label} could not pair ${sk.id}`);
    used.add(idx);
    return pool[idx];
  });
}

const INSIGHT_MAX = 140;

function trimInsight(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  if (text.length <= INSIGHT_MAX) return text;
  return `${text.slice(0, INSIGHT_MAX - 1).trimEnd()}…`;
}

export function lockEvent(sk: EventSkeleton, raw: unknown): GameEvent {
  const ev = (raw && typeof raw === "object" ? { ...(raw as GameEvent) } : {}) as GameEvent;
  ev.id = sk.id;
  ev.phase_min = sk.phase_min;
  ev.phase_max = sk.phase_max;
  ev.type = sk.type;
  if (typeof ev.title !== "string" || !ev.title.trim()) ev.title = sk.title;
  if (typeof ev.weight !== "number" || !(ev.weight > 0)) ev.weight = 5;
  if (sk.pinned) ev.pinned = true;
  else delete ev.pinned;
  delete (ev as { reads?: unknown }).reads;
  delete (ev as { campaignState?: unknown }).campaignState;
  ev.choices?.forEach((choice, i) => {
    const stub = sk.type === "standard" ? sk.choices?.[i] : undefined;
    const loose = choice as { id?: string; mutates?: unknown };
    if (stub) loose.id = stub.id;
    delete loose.mutates;
  });
  for (const choice of ev.choices ?? []) {
    const own = trimInsight(choice.historicalInsight);
    if (own) choice.historicalInsight = own;
    else delete choice.historicalInsight;
    for (const outcome of choice.outcomes ?? []) {
      const line = trimInsight(outcome.historicalInsight);
      if (line) outcome.historicalInsight = line;
      else delete outcome.historicalInsight;
    }
  }
  return ev;
}

function lockSage(sk: SageSkeleton, raw: unknown): SageEncounterData {
  const sage = (raw && typeof raw === "object" ? { ...(raw as SageEncounterData) } : {}) as SageEncounterData;
  sage.id = sk.id;
  sage.name = sk.name;
  sage.threshold = sk.threshold;
  if (typeof sage.title !== "string" || !sage.title.trim()) sage.title = sk.title;
  if (typeof sage.portrait !== "string" || !sage.portrait.trim()) sage.portrait = "placeholder.png";
  return sage;
}

const SKELETON_SYSTEM = [
  OUTPUT_ONLY,
  "You lock the STRUCTURE of one historically authentic educational campaign. Do not write event prose, sage questions, trivia, a verdict, or a review summary. Choice stubs are an id plus state mutations only — no button text and no results.",
  "If the user message contains LOCKED CONSTRAINTS, they are ground truth and override any Oregon Trail / journey habit. A frame that is not a journey is a project: no fake miles, trail forks, or supply trek.",
  BREVITY,
  "Resource keys in initialResources, resourceCaps, resourceLabels, pace fx, and primaryResourceKey must be the same camelCase identifiers. primaryResourceKey must be one of those keys.",
  "Route: a node id \"start\", every edge.to is an existing node id, edge.tag is SAFE, FAST, or PROFIT, and at least one node has an empty edges array.",
  "Journey campaigns need non-empty paces, distanceUnit, mapImage, trailPath of [x, y] percentages (at least 2), and trailStops (at least 2) whose pathIndex values index into trailPath.",
  "Project campaigns set progressionMode to \"project\", totalDistance 0, distanceUnit \"\", paces [], trailPath [], trailStops [], outfitConfig.herdOptions [], and a route that is a single terminal start node. totalDays and daysPerTurn stay real and positive in both modes.",
  `theme, if set, is one of: ${THEMES.join(", ")}. Use the narrowest era match. imageStyleKeyword is ONE medium word (lithograph, engraving, painting, photograph, woodcut, illumination, daguerreotype).`,
  "pixelColors and pixelFaces are placeholders, not real sprites. outfitConfig.costs are what THIS endeavor actually packed, not generic trail goods.",
  "Do NOT output a flags field. campaignState is a plan for the writers, not a runtime flags array. Do NOT write the fault-line dilemma or any pinned story-plan beat; those are spliced in later.",
  "campaignState is required. It is { tracks } with 2 or 3 tracks and no prose. A track is { id, kind: \"number\" or \"tag\", start }, and number tracks also have min and max. Number ranges stay inside -3..3. A tag start is one short token with no spaces. ids are camelCase.",
  "eventSkeletons carry id, phase_min, phase_max, title, type (\"standard\" or \"push_luck\"), pinned (false for pool beats), reads, and, for standard events, exactly two choice stubs { id, mutates }. No choice prose. push_luck has reads and no choices. Most types are standard; include 1 or 2 push_luck. Phases are 0–1 and cover the journey.",
  "mutates entries are { track, delta } on number tracks or { track, tag } on tag tracks. delta is an integer from -2 to 2. tag is one short token.",
  "The earliest event reads nothing. Every later event's reads lists track ids whose earlier mutations must change this beat's stakes, options, or outcome. At least one later event reads a track an earlier choice mutates.",
  "sageSkeletons carry only id, name, title, threshold (0–100, spaced across the run).",
  "teachableFacts are the concrete specifics later stages will teach and quiz: each one states the exact name, number, date, law, or FULL enumerated list. One fact per exam question.",
  "historicalContext is the real outcome in a short paragraph. storyMeaning, only when no narrative spine was supplied, is one short paragraph on what the history added up to — significance and irony, not a verdict on the player.",
  "continuityAnchors is required. It is one object with three one-sentence strings:",
  "companionOrAdversary — a named historical person, their specific role, and one personality trait, who can recur beside the protagonist;",
  "signatureItemOrDocument — one concrete era-specific physical object or document the protagonist carries;",
  "environmentalMotif — one persistent sensory, weather, or setting detail tied to this era and this geography.",
  "If the user message says RE-ROLL POV (KEEP TEKS), keep the standard, the grade, and the theme, and choose a different protagonist than the person, class, and post it names.",
  "If the user message names a LOCKED THEME, that theme string is mandatory.",
].join("\n");

function skeletonUser(inputs: GenerateInputs, errors: string[]): string {
  const locked = lockedResourceSpecs(inputs);
  const factCount = inputs.faultLine ? Math.min(16, Math.max(inputs.numQuestions, 12)) : Math.max(inputs.numQuestions, 0);
  const reroll = typeof inputs.povAvoid === "string" && inputs.povAvoid.trim().length > 0;
  const lines = [
    "LOCKED CONSTRAINTS (ground truth):",
    inputs.frame ? `FRAME (controlling structure):\n${inputs.frame}` : "FRAME: none supplied. This is a journey unless the topic clearly is not one.",
    !reroll && inputs.playerRole ? `PLAYER ROLE:\n${inputs.playerRole}` : "",
    inputs.lockedTheme ? `LOCKED THEME: theme must be "${inputs.lockedTheme}". Do not choose a different theme.` : "",
    reroll
      ? [
          "RE-ROLL POV (KEEP TEKS):",
          "Keep this TEKS standard, this grade, and the theme. Do not change them.",
          `Do NOT reuse this previous micro-perspective, social class, or geographic post:\n${inputs.povAvoid?.trim()}`,
          "Choose a markedly different historical person: a different job, class, and vantage. A front-line sapper becomes a telegraph operator or a diplomatic courier, not a renamed version of the same post.",
          "Write the title, subtitle, intro, and event skeletons from that new pair of eyes.",
        ].join("\n")
      : "",
    locked
      ? `ECONOMY KEYS are already chosen. Use these keys and no others:\n${locked.map((r) => `- "${r.key}" player-facing "${r.playerFacing}"${r.isMoney ? " (money — never primaryResourceKey)" : ""}${r.primary ? " (PRIMARY — set primaryResourceKey to this)" : ""}`).join("\n")}`
      : "No locked economy. Invent 2–4 camelCase resource keys that are the real stakes of this topic.",
    inputs.economy ? `Economy design (magnitudes are yours; keys above win if they differ):\n${JSON.stringify(inputs.economy)}` : "",
    inputs.personalEconomy ? `Personal economy (revenuePerUnit must be 0; money is never primaryResourceKey):\n${inputs.personalEconomy.premise}\n${JSON.stringify(inputs.personalEconomy.resources)}` : "",
    constraintBrief(inputs),
    referenceBlock(inputs),
    readingLevelSpec(inputs.grade),
    "",
    `Topic: ${inputs.topic}`,
    `Standard: ${inputs.standard}`,
    `Grade: ${inputs.grade}`,
    `Difficulty: ${inputs.difficulty}`,
    `eventSkeletons: exactly ${inputs.length > 0 ? inputs.length : "8"}`,
    `sageSkeletons: exactly ${inputs.numSages}`,
    `teachableFacts: ${factCount}`,
    inputs.faultLine ? "Include exactly one standard eventSkeleton with phase_min 0.85 and phase_max 1. That beat is the closing dilemma." : "",
    feedbackBlock(errors),
    "Output the skeleton JSON object only.",
  ];
  return lines.filter((line) => line !== "").join("\n");
}

export async function generateSkeleton(
  apiKey: string,
  inputs: GenerateInputs,
  priorErrors?: string[],
): Promise<CampaignSkeleton> {
  return callStage(
    apiKey,
    ARCHITECT_MODEL,
    SKELETON_SYSTEM,
    (errors) => skeletonUser(inputs, errors),
    SKELETON_MAX_TOKENS,
    priorErrors,
    (raw) => normalizeSkeleton(raw, inputs),
    ARCHITECT_THINKING_BUDGET,
  );
}

const EVENT_SYSTEM = [
  OUTPUT_ONLY,
  "You fill complete events for the skeletons you are given. Do not add, drop, or rename their ids. Keep phase_min, phase_max, and type.",
  BREVITY,
  MORAL_TAGS,
  "A standard event has choices. Each choice has either flat effects plus result, OR an outcomes array of { weight, effects, result }, never both. weights are positive integers.",
  "When a choice lines up with or violates the historical reality or the TEKS concept, set historicalInsight to ONE sentence of at most 140 characters saying why. Put it on the outcome, or on the flat choice when there is no outcomes array. Omit it on a purely mechanical choice.",
  "CONTINUITY: the user message lists continuityAnchors shared with every other batch. Weave at least one anchor naturally into each event's passage or a choice consequence. Do not label it as a motif. The companion, the carried object, and the weather should make these parallel nodes read as one journey.",
  "CAUSAL STATE: the user message lists campaignState and the full planned chain of reads and mutations, shared with every parallel batch. Write exactly one player-facing choice per stub, in the same order and with the same id. The result or the effects must show that stub's mutations in the scene. If the skeleton lists reads, this beat's passage and stakes must change because of those earlier mutations. Do not mention track ids as variables, scores, or meters. Do not output a flags array.",
  "A push_luck event has leaveText and attempts: { id, buttonText, successText, failureText, riskChance (0–1, rising), rewards, penalties }. No choices on a push_luck event.",
  "Every multi-option event's choices must have a felt consequence. A bare result string is not one.",
  IMAGE_QUERY,
  "Optional trivia on an event is an array of one-sentence teaching snippets, not question ids. Optional sageAdvice is { name, role, line } using cast names only.",
].join("\n");

function eventUser(
  skeleton: CampaignSkeleton,
  batch: EventSkeleton[],
  inputs: GenerateInputs,
  errors: string[],
  assignedFacts: string[] | undefined,
): string {
  return [
    constraintBrief(inputs, skeleton),
    continuityBlock(skeleton),
    causalBlock(skeleton),
    economyChoiceBlock(inputs),
    relationshipBlock(inputs),
    referenceBlock(inputs),
    readingLevelSpec(inputs.grade),
    `Historical context (do not contradict): ${skeleton.historicalContext}`,
    assignedFacts?.length
      ? `Weave EACH of these facts into this batch's event text or trivia snippets, in the scene, unlabeled:\n${assignedFacts.map((f) => `- ${f}`).join("\n")}`
      : "",
    `Fill these event skeletons and no others, in this order:\n${JSON.stringify(batch)}`,
    feedbackBlock(errors),
    'Output { "events": [ ... ] } with one complete event per skeleton.',
  ].filter(Boolean).join("\n\n");
}

export async function generateEventBatch(
  apiKey: string,
  skeleton: CampaignSkeleton,
  batch: EventSkeleton[],
  inputs: GenerateInputs,
  priorErrors?: string[],
  assignedFacts?: string[],
): Promise<GameEvent[]> {
  if (batch.length === 0) return [];
  return callStage(
    apiKey,
    NODE_WRITER_MODEL,
    EVENT_SYSTEM,
    (errors) => eventUser(skeleton, batch, inputs, errors, assignedFacts),
    6000,
    priorErrors,
    (raw) => pairById(batch, extractArray(raw, "events"), "event batch").map((item, i) => lockEvent(batch[i], item)),
  );
}

const SAGE_SYSTEM = [
  OUTPUT_ONLY,
  "You write sage encounters: a person the player meets, a short bio, a greeting, advice, and one standards-aligned question.",
  BREVITY,
  "Use the skeleton's id, name, and threshold. Do not invent people who are not in the skeletons.",
  "question has question, choices (3 or 4), correctIndex, explanation, and teksRef (the standard's code, or a short label of that standard).",
  "The correct answer must be taught by the bio, the advice, or the explanation. reward.correct and reward.wrong use ONLY the locked resource keys. knowledgeCorrect and knowledgeWrong are small integers.",
  "portrait is the string \"placeholder.png\". threshold is a progress percent.",
  "Difficulty scales rigor, not fairness. Never test a fact the encounter itself does not teach.",
  "The user message includes continuity anchors and a causal plan. The encounter may refer to the companion, the carried object, or the weather, and it must not contradict the planned stakes. Do not name tracks as meters.",
].join("\n");

function sageUser(skeleton: CampaignSkeleton, inputs: GenerateInputs, errors: string[]): string {
  return [
    constraintBrief(inputs, skeleton),
    continuityBlock(skeleton),
    causalSummary(skeleton),
    referenceBlock(inputs),
    readingLevelSpec(inputs.grade),
    `Standard: ${inputs.standard}`,
    `Difficulty: ${inputs.difficulty}`,
    `Historical context: ${skeleton.historicalContext}`,
    skeleton.teachableFacts.length ? `Facts you may teach and then ask:\n${skeleton.teachableFacts.map((f) => `- ${f}`).join("\n")}` : "",
    `Fill these sage skeletons:\n${JSON.stringify(skeleton.sageSkeletons)}`,
    feedbackBlock(errors),
    'Output { "sages": [ ... ] } in the same order.',
  ].filter(Boolean).join("\n\n");
}

export async function generateSages(
  apiKey: string,
  skeleton: CampaignSkeleton,
  inputs: GenerateInputs,
  priorErrors?: string[],
): Promise<SageEncounterData[]> {
  if (skeleton.sageSkeletons.length === 0) return [];
  return callStage(
    apiKey,
    NODE_WRITER_MODEL,
    SAGE_SYSTEM,
    (errors) => sageUser(skeleton, inputs, errors),
    3000,
    priorErrors,
    (raw) => pairById(skeleton.sageSkeletons, extractArray(raw, "sages"), "sage stage").map((item, i) => lockSage(skeleton.sageSkeletons[i], item)),
  );
}

const TRIVIA_SYSTEM = [
  OUTPUT_ONLY,
  "You write the campaign's exam, an array of short factual checks.",
  BREVITY,
  "Each item is { id, question, choices (3 or 4 short lines), correctIndex, fact }. fact is 1-3 sentences that teach the answer in plain words.",
  "The correct choice must contain the exact tested specific: the full list, the name, the number, the date, or the law. A paraphrase that drops an item is wrong.",
  "Ask only what the supplied facts and historical context teach. Difficulty scales rigor, not trickiness. Ids are unique.",
  "The user message includes a causal plan and continuity anchors. Questions must not contradict them. Do not name tracks as meters.",
].join("\n");

function triviaUser(skeleton: CampaignSkeleton, inputs: GenerateInputs, count: number, errors: string[]): string {
  const facts = skeleton.teachableFacts.slice(0, Math.max(count, skeleton.teachableFacts.length));
  return [
    constraintBrief(inputs, skeleton),
    continuityBlock(skeleton),
    causalSummary(skeleton),
    referenceBlock(inputs),
    readingLevelSpec(inputs.grade),
    `Standard: ${inputs.standard}`,
    `Grade: ${inputs.grade}`,
    `Difficulty: ${inputs.difficulty}`,
    `Historical context: ${skeleton.historicalContext}`,
    facts.length ? `Ask these facts. The correct choice must state each one specifically:\n${facts.map((f) => `- ${f}`).join("\n")}` : "Ground every question in the historical context.",
    `Write exactly ${count} questions.`,
    feedbackBlock(errors),
    'Output { "eventTrivia": [ ... ] }.',
  ].filter(Boolean).join("\n\n");
}

export async function generateTrivia(
  apiKey: string,
  skeleton: CampaignSkeleton,
  inputs: GenerateInputs,
  priorErrors?: string[],
): Promise<EventGateQuestion[]> {
  const count = triviaTargetCount(inputs, skeleton);
  if (count <= 0) return [];
  return callStage(
    apiKey,
    NODE_WRITER_MODEL,
    TRIVIA_SYSTEM,
    (errors) => triviaUser(skeleton, inputs, count, errors),
    3000,
    priorErrors,
    (raw) => {
      const arr = extractArray(raw, "eventTrivia");
      if (arr.length !== count) throw new Error(`trivia stage returned ${arr.length}; expected ${count}`);
      return arr.map((item, i) => {
        const q = (item && typeof item === "object" ? item : {}) as EventGateQuestion;
        if (typeof q.id !== "string" || !q.id.trim()) q.id = `q${i + 1}`;
        return q;
      });
    },
  );
}

const CLOSER_SYSTEM = [
  OUTPUT_ONLY,
  "You write the campaign's moral verdict and its review summary. You do not rewrite events.",
  "VERDICT is { good, bad, indifferent }. One passage is shown from the player's hidden moral tally. They judge who the player BECAME, not how well they scored.",
  "good = mostly principled. bad = mostly self-serving. indifferent = mostly the obvious, coasting path — thoughtless, not monstrous.",
  "Each passage: a clear verdict with no rhetorical question; tied to this campaign's real historical outcome (good can still lose, bad can still win materially, indifferent is cold);",
  "implies a return to who they were at the start; 3-5 short declarative sentences. State the feeling. Do not explain it. Do not congratulate. Do not mention a moral flag, a score, or the words principled / self-serving.",
  "Register, for a broken strike in which troops came, about thirty died, Debs went to prison, and the company won:",
  "good: \"You stood with the workers. Not because it was safe — it wasn't — but because you'd seen the rent notices that didn't fall when the wages did, and you couldn't unsee them. It cost you. It cost them more. The troops came, the strike broke, and Eugene Debs went to prison for it. The company won, the way the company usually won in 1894. You lost. But you can name what you stood for, and history remembers the Pullman strikers as the ones who were right too early.\"",
  "bad: \"You did the math, and the math said cross the line. Every time the choice came, you took the side that kept you fed and kept you safe. You weren't cruel. You were just looking out for yourself, and in 1894 that meant looking away from the people next to you. The strike broke. The company won. You were on the winning side. The men who went hungry holding the line went hungry without you. You can tell yourself you had no choice. You did. You made it.\"",
  "indifferent: \"You kept your head down and took the easy road every time it offered itself. Not for the workers, not for the company — for the exit. When the choice was hard you waited for it to get simple, and it always did, because someone else made it for you. The strike happened around you. The troops came, the men died, Debs went to prison, and you were there. You passed through one of the hardest fights American workers ever picked, and it asked nothing of you, because you offered nothing. History didn't record where you stood. Neither could you.\"",
  "Match that compression for THIS campaign's own history.",
  "REVIEW SUMMARY is flowing prose, about 300 words and no more than 325. It recaps what happened and is the study aid for the exam.",
  "It MUST contain the full specific correct answer to EVERY exam question you are given — every trivia question and every sage question.",
  "Recoverable means the exact tested specific appears. If the answer is a list, every item appears. If it is a name, number, date, or law, that exact item appears. A looser paraphrase fails.",
  "Embed the answers in the narrative. Do NOT label them, echo the question, or write \"the answer is\" / \"remember that\" / \"importantly\".",
  "Spend the word budget on the tested facts plus just enough connective tissue to stay a recap. Cut flavor before you cut a tested specific.",
  "Tone here is clear and age-appropriate, not the verdict's gravitas.",
  "Before you finish, point at the phrase in the summary that answers each question. If you cannot, the answer is missing — revise before output.",
  "The user message includes the causal plan and the continuity anchors. The verdict may weigh what those planned stakes cost, without naming tracks as scores or meters, and without contradicting the anchors.",
].join("\n");

function examLines(trivia: EventGateQuestion[], sages: SageEncounterData[] | undefined): string {
  const lines: string[] = [];
  trivia.forEach((q, i) => {
    const answer = Array.isArray(q.choices) ? q.choices[q.correctIndex] : "";
    lines.push(`Trivia ${i + 1}: ${q.question} || correct answer: ${answer ?? ""}`);
  });
  for (const sage of sages ?? []) {
    const q = sage.question;
    if (!q) continue;
    const answer = Array.isArray(q.choices) ? q.choices[q.correctIndex] : "";
    lines.push(`Sage (${sage.name}): ${q.question} || correct answer: ${answer ?? ""}`);
  }
  return lines.join("\n");
}

function closerUser(
  skeleton: CampaignSkeleton,
  events: GameEvent[],
  trivia: EventGateQuestion[],
  inputs: GenerateInputs,
  errors: string[],
  sages: SageEncounterData[] | undefined,
): string {
  const beatLines = events.map((e) => `- ${e.title}: ${typeof e.text === "string" ? e.text : ""}`).join("\n");
  return [
    constraintBrief(inputs, skeleton),
    continuityBlock(skeleton),
    causalSummary(skeleton),
    referenceBlock(inputs),
    readingLevelSpec(inputs.grade),
    `Historical outcome: ${skeleton.historicalContext}`,
    skeleton.storyMeaning ? `Story meaning (do not contradict; do not replace the verdict with it): ${skeleton.storyMeaning}` : "",
    `Events the player actually saw:\n${beatLines}`,
    `EXAM — every correct answer below must appear in reviewSummary:\n${examLines(trivia, sages)}`,
    feedbackBlock(errors),
    'Output { "verdict": { "good": "...", "bad": "...", "indifferent": "..." }, "reviewSummary": "..." }.',
  ].filter(Boolean).join("\n\n");
}

export async function generateClosers(
  apiKey: string,
  skeleton: CampaignSkeleton,
  events: GameEvent[],
  trivia: EventGateQuestion[],
  inputs: GenerateInputs,
  priorErrors?: string[],
  sages?: SageEncounterData[],
): Promise<CampaignClosers> {
  return callStage(
    apiKey,
    NODE_WRITER_MODEL,
    CLOSER_SYSTEM,
    (errors) => closerUser(skeleton, events, trivia, inputs, errors, sages),
    2500,
    priorErrors,
    (raw) => {
      const obj = unwrapObject(raw);
      const verdict = obj.verdict as Verdict | undefined;
      const reviewSummary = obj.reviewSummary;
      if (!verdict || typeof verdict !== "object") throw new Error("closers missing verdict");
      for (const key of ["good", "bad", "indifferent"] as const) {
        if (typeof verdict[key] !== "string" || !verdict[key].trim()) throw new Error(`closers missing verdict.${key}`);
      }
      if (typeof reviewSummary !== "string" || !reviewSummary.trim()) throw new Error("closers missing reviewSummary");
      return { verdict, reviewSummary };
    },
  );
}

export function assembleCampaign(
  skeleton: CampaignSkeleton,
  events: GameEvent[],
  sages: SageEncounterData[],
  trivia: EventGateQuestion[],
  closers: CampaignClosers,
): Record<string, unknown> {
  const byId = new Map(events.map((e) => [e.id, e]));
  const ordered = skeleton.eventSkeletons.map((sk) => byId.get(sk.id)).filter((e): e is GameEvent => Boolean(e));
  const data: Record<string, unknown> = {
    id: skeleton.id,
    title: skeleton.title,
    subtitle: skeleton.subtitle,
    introBody: skeleton.introBody,
    trailFeedOpener: skeleton.trailFeedOpener,
    totalDays: skeleton.totalDays,
    daysPerTurn: skeleton.daysPerTurn,
    totalDistance: skeleton.totalDistance,
    distanceUnit: skeleton.distanceUnit,
    initialResources: skeleton.initialResources,
    resourceCaps: skeleton.resourceCaps,
    resourceLabels: skeleton.resourceLabels,
    paces: skeleton.paces ?? [],
    events: ordered.length === skeleton.eventSkeletons.length ? ordered : events,
    sages,
    route: skeleton.route,
    eventTrivia: trivia,
    trailPath: skeleton.trailPath,
    trailStops: skeleton.trailStops,
    mapImage: skeleton.mapImage,
    outfitConfig: skeleton.outfitConfig,
    primaryResourceKey: skeleton.primaryResourceKey,
    primaryResourceStart: skeleton.primaryResourceStart,
    revenuePerUnit: skeleton.revenuePerUnit,
    historicalContext: skeleton.historicalContext,
    pixelColors: skeleton.pixelColors,
    pixelFaces: skeleton.pixelFaces,
    verdict: closers.verdict,
    reviewSummary: closers.reviewSummary,
  };
  if (skeleton.theme) data.theme = skeleton.theme;
  if (skeleton.progressionMode) data.progressionMode = skeleton.progressionMode;
  if (skeleton.imageStyleKeyword) data.imageStyleKeyword = skeleton.imageStyleKeyword;
  if (skeleton.storyMeaning) data.storyMeaning = skeleton.storyMeaning;
  return data;
}

// ── Difficulty normalizer ───────────────────────────────────────
// Parallel event batches pick resource deltas independently, so a campaign
// can come back unwinnable or riskless. This is a seeded resource walk, not
// the player loop: no pace drain, no trivia, no Math.random. It only scales
// negative choice deltas on non-terminal beats.

const DIFFICULTY_RANDOM_RUNS = 200;
const DIFFICULTY_SKILLED_RUNS = 50;
const DIFFICULTY_SKILL = 0.55;
const DIFFICULTY_SEED = 0xC0FFEE;

interface SimEffects { [key: string]: number }
interface SimOutcome { weight: number; effects?: SimEffects; earlyEnd?: boolean }
interface SimChoice { effects?: SimEffects; outcomes?: SimOutcome[]; earlyEnd?: boolean }
interface SimEvent {
  id: string;
  phase_min: number;
  phase_max: number;
  weight: number;
  type?: string;
  choices?: SimChoice[];
}

function finiteNum(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readEffects(raw: unknown): SimEffects | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const effects: SimEffects = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) effects[key] = value;
  }
  return effects;
}

function readSimEvents(raw: unknown): SimEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const ev = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const choices = Array.isArray(ev.choices)
      ? ev.choices.map((choice) => {
          const ch = choice && typeof choice === "object" ? choice as Record<string, unknown> : {};
          const outcomes = Array.isArray(ch.outcomes)
            ? ch.outcomes.map((outcome) => {
                const o = outcome && typeof outcome === "object" ? outcome as Record<string, unknown> : {};
                return {
                  weight: typeof o.weight === "number" && Number.isFinite(o.weight) ? o.weight : 1,
                  effects: readEffects(o.effects),
                  earlyEnd: o.earlyEnd === true,
                };
              })
            : undefined;
          return { effects: readEffects(ch.effects), outcomes, earlyEnd: ch.earlyEnd === true };
        })
      : undefined;
    return {
      id: typeof ev.id === "string" && ev.id ? ev.id : `event_${index + 1}`,
      phase_min: finiteNum(ev.phase_min),
      phase_max: finiteNum(ev.phase_max, 1),
      weight: finiteNum(ev.weight, 1) || 1,
      type: typeof ev.type === "string" ? ev.type : "standard",
      choices,
    };
  });
}

function terminalEventIds(events: SimEvent[]): Set<string> {
  const ids = new Set<string>();
  let last: SimEvent | undefined;
  for (const ev of events) {
    if (ev.phase_min >= 0.85) ids.add(ev.id);
    if (!last || ev.phase_min >= last.phase_min) last = ev;
  }
  if (last) ids.add(last.id);
  return ids;
}

function effectSum(effects?: SimEffects): number {
  if (!effects) return 0;
  let sum = 0;
  for (const value of Object.values(effects)) sum += value;
  return sum;
}

function hasNegative(effects?: SimEffects): boolean {
  if (!effects) return false;
  return Object.values(effects).some((value) => value < 0);
}

function hasScalablePenalty(events: SimEvent[], terminal: Set<string>): boolean {
  for (const ev of events) {
    if (terminal.has(ev.id)) continue;
    for (const choice of ev.choices ?? []) {
      if (choice.earlyEnd) continue;
      if (hasNegative(choice.effects)) return true;
      for (const outcome of choice.outcomes ?? []) {
        if (!outcome.earlyEnd && hasNegative(outcome.effects)) return true;
      }
    }
  }
  return false;
}

/** mulberry32. One generator per measurement so the rate does not depend on call order. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedIndex(rng: () => number, weights: number[]): number {
  let total = 0;
  for (const weight of weights) if (weight > 0) total += weight;
  if (!(total > 0)) return 0;
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] > 0) roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

function tiltWeights(favs: number[], base: number[], skill: number): number[] {
  const min = Math.min(...favs);
  const span = (Math.max(...favs) - min) || 1;
  return favs.map((fav, i) => {
    const norm = (fav - min) / span;
    const factor = 1 + skill * (norm - 0.5) * 2;
    return Math.max(0.05, (base[i] > 0 ? base[i] : 1) * factor);
  });
}

function choiceFavorability(choice: SimChoice): number {
  if (choice.outcomes && choice.outcomes.length > 0) {
    let weight = 0;
    let sum = 0;
    for (const outcome of choice.outcomes) {
      const w = outcome.weight > 0 ? outcome.weight : 1;
      weight += w;
      sum += w * effectSum(outcome.effects);
    }
    return weight ? sum / weight : 0;
  }
  return effectSum(choice.effects);
}

interface PackedSim {
  turns: number;
  pools: number[][];
  eventWeight: number[];
  terminal: Uint8Array;
  choiceCount: number[];
  outcomeCount: number[][];
  outcomeWeight: number[][][];
  skilledOutcomeWeight: number[][][];
  skilledChoiceWeight: number[][];
  choiceEarly: boolean[][];
  outcomeEarly: boolean[][][];
  deltas: number[][][][];
  initial: Float64Array;
  caps: Float64Array;
  morale: number;
  lowIndexes: number[];
  keys: number;
}

function packSim(
  events: SimEvent[],
  terminal: Set<string>,
  initial: Record<string, number>,
  caps: Record<string, number>,
  primary: string,
  turns: number,
): PackedSim {
  const keys = Object.keys(initial);
  const indexOf = new Map(keys.map((key, index) => [key, index]));
  const rowFor = (effects?: SimEffects): number[] => {
    const row = new Array<number>(keys.length).fill(0);
    if (!effects) return row;
    for (const [key, value] of Object.entries(effects)) {
      const index = indexOf.get(key);
      if (index !== undefined) row[index] = value;
    }
    return row;
  };
  const outcomeCount: number[][] = [];
  const outcomeWeight: number[][][] = [];
  const skilledOutcomeWeight: number[][][] = [];
  const skilledChoiceWeight: number[][] = [];
  const choiceEarly: boolean[][] = [];
  const outcomeEarly: boolean[][][] = [];
  const deltas: number[][][][] = [];
  const choiceCount: number[] = [];
  const eventWeight: number[] = [];
  const term = new Uint8Array(events.length);
  events.forEach((ev, ei) => {
    if (terminal.has(ev.id)) term[ei] = 1;
    eventWeight.push(ev.weight > 0 ? ev.weight : 1);
    const choices = ev.choices ?? [];
    choiceCount.push(choices.length);
    const counts: number[] = [];
    const weights: number[][] = [];
    const skilledWeights: number[][] = [];
    const early: boolean[] = [];
    const outcomeEnds: boolean[][] = [];
    const rows: number[][][] = [];
    const favs: number[] = [];
    for (const choice of choices) {
      early.push(choice.earlyEnd === true);
      favs.push(choiceFavorability(choice));
      if (choice.outcomes && choice.outcomes.length > 0) {
        counts.push(choice.outcomes.length);
        weights.push(choice.outcomes.map((outcome) => outcome.weight));
        skilledWeights.push(tiltWeights(
          choice.outcomes.map((outcome) => effectSum(outcome.effects)),
          choice.outcomes.map((outcome) => outcome.weight),
          DIFFICULTY_SKILL,
        ));
        outcomeEnds.push(choice.outcomes.map((outcome) => outcome.earlyEnd === true));
        rows.push(choice.outcomes.map((outcome) => rowFor(outcome.effects)));
      } else {
        counts.push(1);
        weights.push([1]);
        skilledWeights.push([1]);
        outcomeEnds.push([false]);
        rows.push([rowFor(choice.effects)]);
      }
    }
    outcomeCount.push(counts);
    outcomeWeight.push(weights);
    skilledOutcomeWeight.push(skilledWeights);
    skilledChoiceWeight.push(choices.length > 1 ? tiltWeights(favs, choices.map(() => 1), DIFFICULTY_SKILL) : []);
    choiceEarly.push(early);
    outcomeEarly.push(outcomeEnds);
    deltas.push(rows);
  });
  const pools: number[][] = [];
  for (let turn = 0; turn < turns; turn++) {
    const progress = turns <= 1 ? 0.5 : turn / (turns - 1);
    const pool: number[] = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === "push_luck" || !(ev.choices && ev.choices.length)) continue;
      if (progress >= ev.phase_min && progress <= ev.phase_max) pool.push(i);
    }
    pools.push(pool);
  }
  const initArr = new Float64Array(keys.length);
  const capArr = new Float64Array(keys.length);
  const lowIndexes: number[] = [];
  keys.forEach((key, index) => {
    initArr[index] = initial[key];
    capArr[index] = caps[key] ?? 100;
    if (key !== primary && capArr[index] > 10) lowIndexes.push(index);
  });
  return {
    turns, pools, eventWeight, terminal: term, choiceCount,
    outcomeCount, outcomeWeight, skilledOutcomeWeight, skilledChoiceWeight,
    choiceEarly, outcomeEarly, deltas, initial: initArr, caps: capArr,
    morale: indexOf.get("morale") ?? -1, lowIndexes, keys: keys.length,
  };
}

function packedDead(sim: PackedSim, buf: Float64Array): boolean {
  if (sim.morale >= 0 && buf[sim.morale] <= 0) return true;
  let low = 0;
  for (let i = 0; i < sim.lowIndexes.length; i++) if (buf[sim.lowIndexes[i]] <= 0) low++;
  return low >= 2;
}

function playPacked(sim: PackedSim, scalar: number, skilled: boolean, rng: () => number, buf: Float64Array): boolean {
  buf.set(sim.initial);
  for (let turn = 0; turn < sim.turns; turn++) {
    const pool = sim.pools[turn];
    const poolSize = pool.length;
    if (poolSize === 0) continue;
    let ev = pool[0];
    if (poolSize > 1) {
      let total = 0;
      for (let i = 0; i < poolSize; i++) total += sim.eventWeight[pool[i]];
      let roll = rng() * (total > 0 ? total : 1);
      ev = pool[poolSize - 1];
      for (let i = 0; i < poolSize; i++) {
        roll -= sim.eventWeight[pool[i]];
        if (roll <= 0) { ev = pool[i]; break; }
      }
    }
    const choiceCount = sim.choiceCount[ev];
    if (choiceCount === 0) continue;
    const ci = choiceCount === 1 ? 0
      : skilled ? weightedIndex(rng, sim.skilledChoiceWeight[ev])
      : Math.floor(rng() * choiceCount);
    const outcomeCount = sim.outcomeCount[ev][ci];
    const oi = outcomeCount <= 1 ? 0
      : weightedIndex(rng, skilled ? sim.skilledOutcomeWeight[ev][ci] : sim.outcomeWeight[ev][ci]);
    const scale = sim.terminal[ev] === 0 && !sim.choiceEarly[ev][ci] && !sim.outcomeEarly[ev][ci][oi];
    const delta = sim.deltas[ev][ci][oi];
    for (let k = 0; k < sim.keys; k++) {
      let d = delta[k];
      if (d === 0) continue;
      if (scale && d < 0) d = Math.round(d * scalar);
      let next = buf[k] + d;
      const cap = sim.caps[k];
      if (next < 0) next = 0;
      else if (next > cap) next = cap;
      buf[k] = next;
    }
    if (packedDead(sim, buf)) return false;
    if (sim.choiceEarly[ev][ci] || sim.outcomeEarly[ev][ci][oi]) return true;
  }
  return !packedDead(sim, buf);
}

function survivalRate(sim: PackedSim, runs: number, seed: number, scalar: number, skilled: boolean): number {
  const rng = mulberry32(seed);
  const buf = new Float64Array(sim.keys);
  let lived = 0;
  for (let i = 0; i < runs; i++) if (playPacked(sim, scalar, skilled, rng, buf)) lived++;
  return runs > 0 ? lived / runs : 1;
}

function scaleEffectsObject(raw: unknown, scalar: number): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const effects = raw as Record<string, unknown>;
  for (const [key, value] of Object.entries(effects)) {
    if (typeof value === "number" && value < 0) effects[key] = Math.round(value * scalar);
  }
}

function applyDifficultyScalar(campaign: Record<string, unknown>, scalar: number, terminal: Set<string>): void {
  if (!Array.isArray(campaign.events)) return;
  for (const item of campaign.events) {
    if (!item || typeof item !== "object") continue;
    const ev = item as Record<string, unknown>;
    const id = typeof ev.id === "string" ? ev.id : "";
    if (terminal.has(id) || !Array.isArray(ev.choices)) continue;
    for (const choice of ev.choices) {
      if (!choice || typeof choice !== "object") continue;
      const ch = choice as Record<string, unknown>;
      if (ch.earlyEnd === true) continue;
      scaleEffectsObject(ch.effects, scalar);
      if (!Array.isArray(ch.outcomes)) continue;
      for (const outcome of ch.outcomes) {
        if (!outcome || typeof outcome !== "object") continue;
        const o = outcome as Record<string, unknown>;
        if (o.earlyEnd === true) continue;
        scaleEffectsObject(o.effects, scalar);
      }
    }
  }
}

/**
 * Pull a systems campaign's random survival into 55–70% by scaling negative
 * choice deltas. Too deadly (under 35%) shrinks those penalties. Too easy
 * (over 85%) grows them. Closing beats, earlyEnd choices, positive deltas,
 * and flag writes are left alone. No model call.
 */
export function normalizeCampaignDifficulty(campaign: Record<string, unknown>): void {
  if (Array.isArray(campaign.flags) && campaign.flags.length > 0) return;
  const events = readSimEvents(campaign.events);
  if (events.length === 0) return;
  const initial = readEffects(campaign.initialResources) ?? {};
  const capSource = readEffects(campaign.resourceCaps) ?? {};
  const caps: Record<string, number> = {};
  for (const key of Object.keys(initial)) caps[key] = capSource[key] ?? 100;
  const primary = typeof campaign.primaryResourceKey === "string" ? campaign.primaryResourceKey : "";
  const terminal = terminalEventIds(events);
  const turns = Math.max(4, Math.min(24, Math.round(finiteNum(campaign.totalDays, 1) / Math.max(1, finiteNum(campaign.daysPerTurn, 1)))));
  const sim = packSim(events, terminal, initial, caps, primary, turns);

  const pre = survivalRate(sim, DIFFICULTY_RANDOM_RUNS, DIFFICULTY_SEED, 1, false);
  const preSkilled = survivalRate(sim, DIFFICULTY_SKILLED_RUNS, DIFFICULTY_SEED + 1, 1, true);
  let scalar = 1;
  if ((pre < 0.35 || pre > 0.85) && hasScalablePenalty(events, terminal)) {
    const tooHard = pre < 0.35;
    let lo = tooHard ? 0.15 : 1;
    let hi = tooHard ? 1 : 3;
    let best = tooHard ? 0.55 : 1.5;
    let bestDist = Infinity;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      const rate = survivalRate(sim, DIFFICULTY_RANDOM_RUNS, DIFFICULTY_SEED, mid, false);
      const dist = Math.abs(rate - 0.625);
      if (dist < bestDist) { bestDist = dist; best = mid; }
      if (rate >= 0.55 && rate <= 0.70) { best = mid; break; }
      if (rate < 0.625) hi = mid;
      else lo = mid;
    }
    scalar = best;
    if (scalar !== 1) applyDifficultyScalar(campaign, scalar, terminal);
  }
  const post = scalar === 1 ? pre : survivalRate(sim, DIFFICULTY_RANDOM_RUNS, DIFFICULTY_SEED, scalar, false);
  const postSkilled = scalar === 1 ? preSkilled : survivalRate(sim, DIFFICULTY_SKILLED_RUNS, DIFFICULTY_SEED + 1, scalar, true);
  console.log(
    `[difficulty] random survival ${(pre * 100).toFixed(0)}% → ${(post * 100).toFixed(0)}% (high-competence ${(preSkilled * 100).toFixed(0)}% → ${(postSkilled * 100).toFixed(0)}%), scalar ${scalar.toFixed(2)}`,
  );
}

/**
 * Chunked replacement for the single generateContent call.
 *
 * Skeleton first, so later calls share one set of resource keys and beat ids.
 * Event batches of EVENT_BATCH_SIZE run concurrently with the sage and trivia
 * calls — that overlap is why this is faster than one 16k-token completion.
 * Closers run last, with the real exam answers in hand. The returned object
 * is the campaign shell; generateCampaign still enriches images, splices
 * Stage-1 fault-line and story-plan pieces, and runs validate().
 */
export async function generateCampaignChunked(
  apiKey: string,
  inputs: GenerateInputs,
  priorErrors?: string[],
): Promise<Record<string, unknown>> {
  const routed = routePriorErrors(priorErrors);
  console.log(`[generate] models architect=${ARCHITECT_MODEL} writer=${NODE_WRITER_MODEL}`);
  const skeletonStarted = Date.now();
  const skeleton = await generateSkeleton(apiKey, inputs, routed.skeleton);
  const batches = splitEventBatches(skeleton.eventSkeletons, EVENT_BATCH_SIZE);
  const factGroups = assignFactsToBatches(batches.length, skeleton.teachableFacts);
  console.log(
    `[generate] chunked skeleton ${((Date.now() - skeletonStarted) / 1000).toFixed(1)}s — ${skeleton.eventSkeletons.length} events in ${batches.length} batches`,
  );

  const fillStarted = Date.now();
  const [eventGroups, sages, trivia] = await Promise.all([
    Promise.all(batches.map((batch, i) =>
      generateEventBatch(apiKey, skeleton, batch, inputs, routed.events, factGroups[i]),
    )),
    generateSages(apiKey, skeleton, inputs, routed.sages),
    generateTrivia(apiKey, skeleton, inputs, routed.trivia),
  ]);
  const events = eventGroups.flat();
  console.log(
    `[generate] chunked fill ${((Date.now() - fillStarted) / 1000).toFixed(1)}s — ${events.length} events, ${sages.length} sages, ${trivia.length} trivia`,
  );

  const closerStarted = Date.now();
  const closers = await generateClosers(apiKey, skeleton, events, trivia, inputs, routed.closers, sages);
  console.log(`[generate] chunked closers ${((Date.now() - closerStarted) / 1000).toFixed(1)}s`);

  const campaign = assembleCampaign(skeleton, events, sages, trivia, closers);
  // Character runs end on the clock, not a resource death. Leave their deltas alone.
  if (!inputs.personalEconomy && !inputs.faultLine) normalizeCampaignDifficulty(campaign);
  return campaign;
}
