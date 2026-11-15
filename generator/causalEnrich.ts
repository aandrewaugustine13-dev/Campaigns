/**
 * Second-pass causal enrichment.
 *
 * Pass 1 writes the spine: the systems skeleton, or the narrative plan.
 * This pass rewrites only the short causal metadata (tradeoffs, consequence
 * tags, arrival lines, and — on the narrative path — ending fragments).
 * It is one architect call. It does not sit inside the parallel Stage 2 fan-out.
 *
 * The pure helpers below are what the cleanup uses when the model omits a
 * link, repeats an arrival, or names a resource or flag that was not locked.
 */
import { GoogleGenAI } from "@google/genai";
import { parseModelJson } from "./json.js";
import { ARCHITECT_MODEL } from "./models.js";
import type { NarrativePlan, PlanBeatChoice } from "./storyPlan.js";

const ENRICH_MAX_TOKENS = 3000;
const ENRICH_THINKING_BUDGET = 1024;
const TRADE_OFF_WORDS = 25;
const CONTEXT_WORDS = 40;
const FRAGMENT_WORDS = 40;
const TAG_MAX = 48;
const NEAR_DUPLICATE = 0.6;

const TRADE_OFF_FALLBACK = [
  "Secures an immediate gain but spends a resource later beats still need.",
  "Preserves that resource but loses the faster historical opening.",
];

const STOP_WORDS = new Set([
  "the", "and", "but", "with", "from", "that", "this", "into", "onto", "after",
  "before", "their", "them", "they", "have", "has", "was", "were", "are", "its",
  "his", "her", "for", "not", "you", "your",
]);

export interface CausalMutation {
  track: string;
  delta?: number;
  tag?: string;
}

export interface CausalArrival {
  tag: string;
  context: string;
}

/** What the enrichment model is allowed to name. Anything else is dropped. */
export interface CausalAllowList {
  resources: readonly string[];
  tracks: readonly { id: string; kind: "number" | "tag" }[];
  flags: readonly string[];
}

export interface CausalAudit {
  /** Keys that were neither a locked resource, a state track, nor a known flag. */
  inventedKeys: string[];
  /** Known flag ids the patch tried to write. They are not copied onto the plan. */
  flagKeysTouched: string[];
  /** True when the patch carried a flags array. It is discarded. */
  droppedFlags: boolean;
  /** Early consequence tags that still appear on no later arrival. */
  unreferencedEarlyTags: string[];
  /** Node ids whose arrival lines were too alike and were split. */
  nearDuplicateNodes: string[];
}

export interface CausalChoiceView {
  id: string;
  mutates: CausalMutation[];
  tradeOff: string;
  consequenceTag: string;
}

export interface CausalNodeView {
  id: string;
  choices?: CausalChoiceView[];
  incomingContext?: CausalArrival[];
}

export interface CausalSkeletonView {
  initialResources: Record<string, number>;
  eventSkeletons: CausalNodeView[];
}

const ENRICHMENT_RULES = [
  "You add WEIGHT to a story that already exists. You do not rewrite the story.",
  "Output ONLY one JSON object. No markdown, no event prose, no scene text.",
  "Change only causal metadata: tradeOff, consequenceTag, incomingContext, and on a narrative plan the endingFragment.",
  "Do not change ids, order, phases, titles, scenes, choice text, stakes, resources, flags, or continuity anchors.",
  "tradeOff is at most 25 words and states both a gain and a cost.",
  "consequenceTag is a unique CONSTANT_CASE name, such as IGNORED_INTELLIGENCE_WARNING or DIVERTED_CONVOY_ROUTE. It is not a runtime flag.",
  "incomingContext is an array of { tag, context }. context is at most 40 words. It names which prior tag led here and how resources, relationships, or the situation have already shifted.",
  "The earliest node has no incomingContext. Every later node has one entry per arrival. Two entries on the same node must not say the same thing.",
  "HISTORICAL DILEMMA: every decision pits two competing historical pressures against each other, such as speed against security, loyalty against preservation, or short-term survival against the mission. Do not write a correct answer beside a foolish one. One option may be the worse historical bet, and it must still carry a real cost or a lost opportunity.",
  "NO INSTANT FUNNEL: do not collapse diverging choices into the next node as if both arrivals were the same. When branches meet again, incomingContext has a distinct entry for each arrival.",
  "DELAYED CAUSAL PAYOFF: at least one choice in the first two nodes carries a consequenceTag that a node at position 4 or later names in incomingContext. That later beat's stakes must change because of that tag.",
  "Mutations may name only the state-track ids you are given. Do not invent resource keys or flag ids.",
].join("\n");

export const CAUSAL_ENRICHMENT_SYSTEM = ENRICHMENT_RULES;

export function clipWords(value: string, maxWords: number): string {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

export function normalizeConsequenceTag(value: unknown, fallback: string): string {
  const source = typeof value === "string" && value.trim() ? value : fallback;
  const broken = source
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  let tag = broken.toUpperCase();
  if (!/^[A-Z]/.test(tag)) tag = `CHOICE_${tag}`.replace(/^CHOICE_$/, "");
  tag = tag.slice(0, TAG_MAX).replace(/_$/g, "");
  return /^[A-Z][A-Z0-9_]{0,47}$/.test(tag) ? tag : "UNSTATED_CONSEQUENCE";
}

function contentWords(value: string): Set<string> {
  return new Set(
    value.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  );
}

/** 1 when the lines share every content word. Short repeated arrivals score high. */
export function contextSimilarity(a: string, b: string): number {
  const left = contentWords(a);
  const right = contentWords(b);
  if (left.size === 0 || right.size === 0) return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

export function contextsAreNearDuplicate(a: string, b: string): boolean {
  return contextSimilarity(a, b) >= NEAR_DUPLICATE;
}

/** Split arrival lines that would read as the same neutral scene. Returns true when a line changed. */
export function separateNearDuplicateContexts(entries: CausalArrival[]): boolean {
  const used: string[] = [];
  let changed = false;
  for (const entry of entries) {
    const close = used.some((prev) => contextsAreNearDuplicate(prev, entry.context));
    if (close) {
      const prose = entry.tag.toLowerCase().replace(/_/g, " ");
      entry.context = clipWords(
        `After ${prose}, this arrival carries its own loss: supplies, trust, or time have already shifted.`,
        CONTEXT_WORDS,
      );
      let n = 2;
      while (used.some((prev) => contextsAreNearDuplicate(prev, entry.context))) {
        entry.context = clipWords(
          `After ${prose}, arrival ${n} still carries a different loss in supplies, trust, or time.`,
          CONTEXT_WORDS,
        );
        n += 1;
      }
      changed = true;
    }
    used.push(entry.context);
  }
  return changed;
}

/**
 * Tags from the first one or two nodes that the delayed beat never cites.
 * Tags born on the last node are not expected to be cited again.
 */
export function unreferencedEarlyTags(nodes: readonly CausalNodeView[]): string[] {
  if (nodes.length < 2) return [];
  const sourceEnd = nodes.length >= 4 ? 2 : 1;
  const citedFrom = nodes.length >= 4 ? 3 : nodes.length - 1;
  const early = new Set<string>();
  nodes.slice(0, sourceEnd).forEach((node) => {
    node.choices?.forEach((choice) => {
      if (choice.consequenceTag) early.add(choice.consequenceTag);
    });
  });
  const cited = new Set<string>();
  nodes.slice(citedFrom).forEach((node) => {
    node.incomingContext?.forEach((entry) => cited.add(entry.tag));
  });
  return [...early].filter((tag) => !cited.has(tag));
}

function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

function readPatchLists(raw: unknown): { choices: Record<string, unknown>[]; arrivals: Record<string, unknown>[] } {
  const obj = asObject(raw);
  const choices = Array.isArray(obj.choices) ? obj.choices.filter((item) => item && typeof item === "object") as Record<string, unknown>[] : [];
  const arrivals = Array.isArray(obj.arrivals) ? obj.arrivals.filter((item) => item && typeof item === "object") as Record<string, unknown>[] : [];
  if (choices.length > 0 || arrivals.length > 0) return { choices, arrivals };
  const nested = obj.eventSkeletons ?? obj.events ?? obj.beats;
  if (!Array.isArray(nested)) return { choices: [], arrivals: [] };
  for (const item of nested) {
    if (!item || typeof item !== "object") continue;
    const node = item as Record<string, unknown>;
    const id = typeof node.id === "string" ? node.id : "";
    if (node.incomingContext) arrivals.push({ eventId: id, beatId: id, incomingContext: node.incomingContext });
    if (!Array.isArray(node.choices)) continue;
    node.choices.forEach((choice, index) => {
      if (!choice || typeof choice !== "object") return;
      const row = choice as Record<string, unknown>;
      choices.push({ ...row, eventId: id, beatId: id, choiceId: row.id, choiceIndex: index });
    });
  }
  return { choices, arrivals };
}

function readArrivals(raw: unknown): CausalArrival[] {
  const items = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
  const entries: CausalArrival[] = [];
  for (const item of items) {
    if (entries.length >= 4) break;
    if (typeof item === "string") {
      const context = clipWords(item, CONTEXT_WORDS);
      if (context) entries.push({ tag: "", context });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const contextRaw = obj.context ?? obj.text;
    const context = typeof contextRaw === "string" ? clipWords(contextRaw, CONTEXT_WORDS) : "";
    if (!context) continue;
    const tagRaw = obj.tag ?? obj.consequenceTag ?? obj.fromTag;
    entries.push({
      tag: typeof tagRaw === "string" && tagRaw.trim() ? normalizeConsequenceTag(tagRaw, "") : "",
      context,
    });
  }
  return entries;
}

function acceptMutation(
  raw: unknown,
  allow: CausalAllowList,
  invented: Set<string>,
  touchedFlags: Set<string>,
): CausalMutation | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const track = typeof obj.track === "string" ? obj.track : "";
  if (!track) return undefined;
  const knownTrack = allow.tracks.find((item) => item.id === track);
  if (!knownTrack) {
    if (allow.flags.includes(track)) touchedFlags.add(track);
    else if (!allow.resources.includes(track)) invented.add(track);
    return undefined;
  }
  if (knownTrack.kind === "number") {
    const delta = typeof obj.delta === "number" && Number.isFinite(obj.delta) ? Math.round(obj.delta) : undefined;
    if (delta === undefined) return undefined;
    return { track, delta: Math.max(-2, Math.min(2, delta)) };
  }
  const tag = typeof obj.tag === "string" ? obj.tag.trim().toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  if (!/^[a-z][a-z0-9]{0,23}$/.test(tag)) return undefined;
  return { track, tag };
}

function emptyAudit(): CausalAudit {
  return { inventedKeys: [], flagKeysTouched: [], droppedFlags: false, unreferencedEarlyTags: [], nearDuplicateNodes: [] };
}

/**
 * Merge a systems enrichment patch onto the skeleton. Ids, phases, resources,
 * and anchors are left alone. Unknown resource and flag keys are dropped.
 */
export function applyCausalEnrichment(skeleton: CausalSkeletonView, patch: unknown, allow: CausalAllowList): CausalAudit {
  const audit = emptyAudit();
  const invented = new Set<string>();
  const touchedFlags = new Set<string>();
  const root = asObject(patch);
  if (Array.isArray(root.flags) || Array.isArray(asObject(root.skeleton).flags)) audit.droppedFlags = true;
  const { choices, arrivals } = readPatchLists(patch);
  const byId = new Map(skeleton.eventSkeletons.map((event) => [event.id, event]));

  for (const row of choices) {
    const node = byId.get(typeof row.eventId === "string" ? row.eventId : "");
    const choiceId = typeof row.choiceId === "string" ? row.choiceId : typeof row.id === "string" ? row.id : "";
    const choice = node?.choices?.find((item) => item.id === choiceId);
    if (!node || !choice) continue;
    if (typeof row.tradeOff === "string" && row.tradeOff.trim()) choice.tradeOff = clipWords(row.tradeOff, TRADE_OFF_WORDS);
    if (typeof row.consequenceTag === "string" && row.consequenceTag.trim()) {
      choice.consequenceTag = normalizeConsequenceTag(row.consequenceTag, choice.id);
    }
    if (Array.isArray(row.mutates)) {
      choice.mutates = row.mutates
        .map((item) => acceptMutation(item, allow, invented, touchedFlags))
        .filter((item): item is CausalMutation => Boolean(item));
    }
  }

  for (const row of arrivals) {
    const eventId = typeof row.eventId === "string" ? row.eventId : typeof row.beatId === "string" ? row.beatId : "";
    const node = byId.get(eventId);
    if (!node || !row.incomingContext) continue;
    const entries = readArrivals(row.incomingContext);
    if (entries.length === 0) continue;
    node.incomingContext = entries;
    if (separateNearDuplicateContexts(node.incomingContext)) audit.nearDuplicateNodes.push(node.id);
  }

  audit.inventedKeys = [...invented];
  audit.flagKeysTouched = [...touchedFlags];
  audit.unreferencedEarlyTags = unreferencedEarlyTags(skeleton.eventSkeletons);
  return audit;
}

function stampNodeTags(nodes: CausalNodeView[]): void {
  const seen = new Set<string>();
  nodes.forEach((node) => {
    node.choices?.forEach((choice, index) => {
      const tradeOff = clipWords(choice.tradeOff ?? "", TRADE_OFF_WORDS);
      choice.tradeOff = tradeOff || TRADE_OFF_FALLBACK[index % TRADE_OFF_FALLBACK.length];
      let tag = normalizeConsequenceTag(choice.consequenceTag, choice.id || `choice${index + 1}`);
      let unique = tag;
      let n = 2;
      while (seen.has(unique)) {
        const suffix = `_${n}`;
        unique = `${tag.slice(0, TAG_MAX - suffix.length)}${suffix}`;
        n += 1;
      }
      seen.add(unique);
      choice.consequenceTag = unique;
    });
  });
}

/**
 * Fill missing tags and make sure a later node cites an early one.
 * Used after a narrative patch, and safe to run when the model returned nothing.
 */
export function repairCausalNodes(nodes: CausalNodeView[]): CausalAudit {
  const audit = emptyAudit();
  stampNodeTags(nodes);
  const priorChoices = () => {
    const all: { tag: string; tradeOff: string; eventIndex: number }[] = [];
    nodes.forEach((node, eventIndex) => {
      node.choices?.forEach((choice) => all.push({ tag: choice.consequenceTag, tradeOff: choice.tradeOff, eventIndex }));
    });
    return all;
  };
  nodes.forEach((node, index) => {
    if (index === 0) {
      delete node.incomingContext;
      return;
    }
    const prior = priorChoices().filter((choice) => choice.eventIndex < index);
    const known = new Set(prior.map((choice) => choice.tag));
    const supplied = new Map<string, string>();
    for (const entry of node.incomingContext ?? []) {
      if (entry.tag && known.has(entry.tag) && entry.context && !supplied.has(entry.tag)) supplied.set(entry.tag, entry.context);
    }
    const lastIndex = prior.length > 0 ? prior[prior.length - 1].eventIndex : -1;
    const immediate = prior.filter((choice) => choice.eventIndex === lastIndex);
    const early = prior.filter((choice) => choice.eventIndex <= 1);
    const delayedTarget = nodes.length >= 4 ? index >= 3 : index === nodes.length - 1;
    const wanted: typeof prior = [];
    const push = (choices: typeof prior) => {
      for (const choice of choices) {
        if (wanted.length >= 4) return;
        if (wanted.some((item) => item.tag === choice.tag)) continue;
        wanted.push(choice);
      }
    };
    if (delayedTarget) push(early);
    push(immediate);
    push(prior.filter((choice) => supplied.has(choice.tag)));
    if (wanted.length === 0) {
      delete node.incomingContext;
      return;
    }
    node.incomingContext = wanted.map((choice) => ({
      tag: choice.tag,
      context: supplied.get(choice.tag) || clipWords(choice.tradeOff, CONTEXT_WORDS),
    }));
    if (separateNearDuplicateContexts(node.incomingContext)) audit.nearDuplicateNodes.push(node.id);
  });
  audit.unreferencedEarlyTags = unreferencedEarlyTags(nodes);
  return audit;
}

function fragmentFrom(choice: PlanBeatChoice): string | undefined {
  const raw = typeof choice.endingFragment === "string" ? choice.endingFragment.trim() : "";
  if (!raw) return undefined;
  const clipped = clipWords(raw, FRAGMENT_WORDS);
  return clipped || undefined;
}

/**
 * Strengthen a narrative plan's choice metadata and ending fragments.
 * Scene, stake, role, and meaning stay as the first pass wrote them.
 */
export function applyNarrativeEnrichment(plan: NarrativePlan, patch: unknown): CausalAudit {
  const root = asObject(patch);
  const audit = emptyAudit();
  if (Array.isArray(root.flags)) audit.droppedFlags = true;
  const invented = new Set<string>();
  const parsed = readPatchLists(patch);
  const choices = parsed.choices;
  const beats = plan.beats.filter((beat) => beat.included);
  const byId = new Map(beats.map((beat) => [beat.id, beat]));

  for (const row of choices) {
    const beatId = typeof row.beatId === "string" ? row.beatId : typeof row.eventId === "string" ? row.eventId : "";
    const beat = byId.get(beatId);
    if (!beat?.choices?.length) continue;
    const index = typeof row.choiceIndex === "number" && row.choiceIndex >= 0 ? row.choiceIndex : -1;
    const choice = index >= 0 ? beat.choices[index] : undefined;
    if (!choice) continue;
    if (typeof row.tradeOff === "string" && row.tradeOff.trim()) choice.tradeOff = clipWords(row.tradeOff, TRADE_OFF_WORDS);
    if (typeof row.consequenceTag === "string" && row.consequenceTag.trim()) {
      choice.consequenceTag = normalizeConsequenceTag(row.consequenceTag, `${beat.id}_${index + 1}`);
    }
    if (typeof row.endingFragment === "string" && row.endingFragment.trim()) {
      const next = clipWords(row.endingFragment, FRAGMENT_WORDS);
      if (next) choice.endingFragment = next;
    }
    if (Array.isArray(row.mutates)) {
      for (const item of row.mutates) {
        const track = item && typeof item === "object" && typeof (item as { track?: unknown }).track === "string"
          ? (item as { track: string }).track
          : "";
        if (track) invented.add(track);
      }
    }
  }

  for (const row of parsed.arrivals) {
    const beatId = typeof row.beatId === "string" ? row.beatId : typeof row.eventId === "string" ? row.eventId : "";
    const beat = byId.get(beatId);
    if (!beat || !row.incomingContext) continue;
    const entries = readArrivals(row.incomingContext);
    if (entries.length > 0) beat.incomingContext = entries;
  }

  const nodes: CausalNodeView[] = beats.map((beat) => ({
    id: beat.id,
    choices: beat.choices?.map((choice, index) => ({
      id: `${beat.id}_${index + 1}`,
      mutates: [],
      tradeOff: choice.tradeOff ?? "",
      consequenceTag: choice.consequenceTag ?? "",
    })),
    incomingContext: beat.incomingContext ? beat.incomingContext.map((entry) => ({ ...entry })) : undefined,
  }));
  const repaired = repairCausalNodes(nodes);
  beats.forEach((beat, index) => {
    const node = nodes[index];
    beat.choices?.forEach((choice, choiceIndex) => {
      const stub = node.choices?.[choiceIndex];
      if (!stub) return;
      choice.tradeOff = stub.tradeOff;
      choice.consequenceTag = stub.consequenceTag;
      if (!fragmentFrom(choice) && choice.tradeOff) {
        choice.endingFragment = clipWords(`You chose this, and it ${choice.tradeOff.charAt(0).toLowerCase()}${choice.tradeOff.slice(1)}`, FRAGMENT_WORDS);
      }
    });
    if (node.incomingContext?.length) beat.incomingContext = node.incomingContext;
    else delete beat.incomingContext;
  });
  // A narrative plan has no resource map at enrichment time. Any mutation key
  // the model emitted is outside the locked set (the compiler maps stake later).
  audit.inventedKeys = [...invented];
  audit.droppedFlags = audit.droppedFlags || repaired.droppedFlags;
  audit.unreferencedEarlyTags = repaired.unreferencedEarlyTags;
  audit.nearDuplicateNodes = repaired.nearDuplicateNodes;
  return audit;
}

function systemsUser(skeleton: CausalSkeletonView & {
  title?: string;
  historicalContext?: string;
  teachableFacts?: string[];
  continuityAnchors?: { companionOrAdversary: string; signatureItemOrDocument: string; environmentalMotif: string };
  campaignState?: { tracks: { id: string; kind: string; start: number | string }[] };
}, allow: CausalAllowList): string {
  const events = skeleton.eventSkeletons.map((event) => ({
    id: event.id,
    choices: (event.choices ?? []).map((choice) => ({
      id: choice.id,
      tradeOff: choice.tradeOff,
      consequenceTag: choice.consequenceTag,
      mutates: choice.mutates,
    })),
    incomingContext: event.incomingContext ?? [],
  }));
  const anchors = skeleton.continuityAnchors;
  return [
    "Enrich this finished skeleton. Return causal metadata only.",
    `Locked resource keys: ${allow.resources.join(", ") || "(none)"}`,
    `State tracks mutations may use: ${allow.tracks.map((track) => track.id).join(", ") || "(none)"}`,
    `Known flags, which you must not write: ${allow.flags.join(", ") || "(none)"}`,
    anchors
      ? `Continuity: ${anchors.companionOrAdversary} | ${anchors.signatureItemOrDocument} | ${anchors.environmentalMotif}`
      : "",
    skeleton.historicalContext ? `History: ${clipWords(skeleton.historicalContext, 80)}` : "",
    skeleton.teachableFacts?.length ? `Facts: ${skeleton.teachableFacts.slice(0, 6).join(" | ")}` : "",
    JSON.stringify({ events }),
    'Output { "choices": [ { "eventId", "choiceId", "tradeOff", "consequenceTag", "mutates" } ], "arrivals": [ { "eventId", "incomingContext": [ { "tag", "context" } ] } ] }.',
  ].filter(Boolean).join("\n\n");
}

function narrativeUser(plan: NarrativePlan, topic: string, standard: string): string {
  const beats = plan.beats.filter((beat) => beat.included).map((beat) => ({
    id: beat.id,
    role: beat.role,
    title: beat.title,
    choices: (beat.choices ?? []).map((choice, index) => ({
      choiceIndex: index,
      text: choice.text,
      result: choice.result,
      stake: choice.stake,
      endingFragment: choice.endingFragment ?? "",
      tradeOff: choice.tradeOff ?? "",
      consequenceTag: choice.consequenceTag ?? "",
    })),
  }));
  return [
    "Enrich this finished narrative spine. Return causal metadata only. Do not rewrite scenes.",
    `Subject: ${topic}`,
    `Standard: ${standard}`,
    `Throughline: ${plan.throughline}`,
    `Meaning: ${clipWords(plan.meaning, 60)}`,
    JSON.stringify({ beats }),
    "On every decision choice set tradeOff, consequenceTag, and a stronger endingFragment: one past-tense sentence that names the gain and the cost and can be read aloud in the ending.",
    "On every beat after the first, set incomingContext. A beat at position 4 or later must cite a tag from the first two decision beats.",
    'Output { "choices": [ { "beatId", "choiceIndex", "tradeOff", "consequenceTag", "endingFragment" } ], "arrivals": [ { "beatId", "incomingContext": [ { "tag", "context" } ] } ] }.',
  ].join("\n\n");
}

async function requestPatch(apiKey: string, user: string): Promise<unknown> {
  const client = new GoogleGenAI({ apiKey });
  const once = async (extra: string) => {
    const response = await client.models.generateContent({
      model: ARCHITECT_MODEL,
      contents: extra ? `${user}\n\n${extra}` : user,
      config: {
        systemInstruction: CAUSAL_ENRICHMENT_SYSTEM,
        maxOutputTokens: ENRICH_MAX_TOKENS,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: ENRICH_THINKING_BUDGET },
      },
    });
    return parseModelJson(response.text ?? "");
  };
  try {
    return await once("");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return once(`The previous reply was not usable JSON (${message}). Return the JSON object only.`);
  }
}

export async function enrichCampaignSkeleton<T extends CausalSkeletonView>(
  apiKey: string,
  skeleton: T,
  allow: CausalAllowList,
): Promise<CausalAudit> {
  const patch = await requestPatch(apiKey, systemsUser(skeleton, allow));
  return applyCausalEnrichment(skeleton, patch, allow);
}

export async function enrichNarrativePlan(
  apiKey: string,
  plan: NarrativePlan,
  topic: string,
  standard: string,
): Promise<CausalAudit> {
  const patch = await requestPatch(apiKey, narrativeUser(plan, topic, standard));
  return applyNarrativeEnrichment(plan, patch);
}
