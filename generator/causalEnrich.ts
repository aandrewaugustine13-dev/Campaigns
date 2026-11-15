/**
 * Pass 2 — causal enrichment.
 *
 * Pass 1 writes the spine: the systems skeleton, or the narrative plan.
 * This pass rewrites only the short causal metadata (tradeoffs, consequence
 * tags, arrival lines, the later-read map, option gates, and — on the
 * narrative path — ending fragments). It is one architect call. It does not
 * sit inside the parallel Stage 2 fan-out. Pass 3 renders prose. Pass 4
 * cleanup reuses the pure checks below, then the existing closers and fact gate.
 *
 * The pure helpers below are what the cleanup uses when the model omits a
 * link, repeats an arrival, or names a resource or flag that was not locked.
 */
import { GoogleGenAI } from "@google/genai";
import { parseModelJson } from "./json.js";
import { ARCHITECT_MODEL } from "./models.js";
import type { NarrativePlan, PlanBeatChoice } from "./storyPlan.js";

const ENRICH_MAX_TOKENS = 4096;
const ENRICH_THINKING_BUDGET = 1024;
const TRADE_OFF_WORDS = 25;
const CONTEXT_WORDS = 40;
const FRAGMENT_WORDS = 40;
const GATE_NOTE_WORDS = 16;
const TAG_MAX = 48;
const NEAR_DUPLICATE = 0.6;
/** Share of non-final choices that a later node must actually consume. */
export const PERSISTENT_DIVERGENCE = 0.6;
const LATER_READ_CAP = 48;

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

export type CausalChange = "options" | "stakes" | "resources";
export type GateEffect = "hide" | "raise_cost" | "alter";

/** How one prior tag changes a specific later option. Note is at most 16 words. */
export interface CausalOptionGate {
  choiceId: string;
  effect: GateEffect;
  note: string;
}

/**
 * One cell of the later-read map: a future node consumes this tag and the
 * consumption changes options, stakes, or resources. Compact on purpose.
 */
export interface CausalLaterRead {
  tag: string;
  nodeId: string;
  changes: CausalChange;
  gate?: CausalOptionGate;
}

/** Whether non-final choices are consumed before the campaign ends. */
export interface ChoiceWeightAudit {
  weightedChoices: number;
  nonFinalChoices: number;
  /** weightedChoices / nonFinalChoices, or 1 when there is nothing to weigh. */
  ratio: number;
  meetsPersistentDivergence: boolean;
  /** False when every read lands on the final node and a mid node exists. */
  weightLandsBeforeTheEnd: boolean;
  /** Early tags with a node two steps later that never cites them there. */
  earlyTagsWithoutDelay: string[];
  ok: boolean;
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
  /** The later-read map after cleanup. */
  laterReads: CausalLaterRead[];
  /** Whether choices carry weight before the final node. */
  weight: ChoiceWeightAudit;
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
  /** Which later node consumes each tag. Skeleton-only. */
  laterReads?: CausalLaterRead[];
}

const ENRICHMENT_RULES = [
  "You add WEIGHT to a story that already exists. You do not rewrite the story.",
  "Output ONLY one JSON object. No markdown, no event prose, no scene text.",
  "Change only causal metadata: tradeOff, consequenceTag, incomingContext, laterReads, and on a narrative plan the endingFragment.",
  "Do not change ids, order, phases, titles, scenes, choice text, stakes, resources, flags, or continuity anchors.",
  "tradeOff is at most 25 words and states both a gain and a cost.",
  "consequenceTag is a unique CONSTANT_CASE name, such as IGNORED_INTELLIGENCE_WARNING or DIVERTED_CONVOY_ROUTE. It is not a runtime flag.",
  "incomingContext is an array of { tag, context }. context is at most 40 words. It names which prior tag led here and how resources, relationships, or the situation have already shifted.",
  "The earliest node has no incomingContext. Every later node has one entry per arrival. Two entries on the same node must not say the same thing.",
  "HISTORICAL DILEMMA: every decision pits two competing historical pressures against each other, such as speed against security, loyalty against preservation, or short-term survival against the mission. Do not write a correct answer beside a foolish one. One option may be the worse historical bet, and it must still carry a real cost or a lost opportunity.",
  "NO INSTANT FUNNEL: do not collapse diverging choices into the next node as if both arrivals were the same. When branches meet again, incomingContext has a distinct entry for each arrival.",
  "DELAYED CAUSAL PAYOFF: at least one choice in the first two nodes carries a consequenceTag that a node at position 4 or later names in incomingContext. That later beat's stakes must change because of that tag.",
  "PERSISTENT DIVERGENCE: at least 60% of choices that are not on the final node must appear in laterReads. Each of those reads changes options, stakes, or available resources. A tag that only colors the final scene does not count.",
  "MID-GAME PAYOFF: a choice from the first two nodes must be consumed at least two nodes later whenever a node that far exists. The final node cannot be the only place weight lands. Put at least one read on a node before the end.",
  "laterReads maps a consequenceTag to the future node that consumes it: { tag, nodeId, changes }. changes is options, stakes, or resources. nodeId is a later node, never the node that authored the tag.",
  "When changes is options, add gate: { choiceId, effect, note }. effect is hide, raise_cost, or alter. note is at most 16 words and states what the prior tag does to that later option. hide means the option is already foreclosed. raise_cost means a steeper loss of a locked resource. alter means the option's terms change. choiceId must exist on that later node.",
  "Mutations and gates may name only the state-track ids and locked resource keys you are given. Do not invent resource keys or flag ids.",
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

interface ChoiceSite {
  tag: string;
  nodeIndex: number;
  choiceId: string;
}

function choiceSites(nodes: readonly CausalNodeView[]): ChoiceSite[] {
  const sites: ChoiceSite[] = [];
  nodes.forEach((node, nodeIndex) => {
    node.choices?.forEach((choice) => {
      if (choice.consequenceTag) sites.push({ tag: choice.consequenceTag, nodeIndex, choiceId: choice.id });
    });
  });
  return sites;
}

function nodeIndexOf(nodes: readonly CausalNodeView[]): Map<string, number> {
  return new Map(nodes.map((node, index) => [node.id, index]));
}

function emptyWeight(): ChoiceWeightAudit {
  return {
    weightedChoices: 0,
    nonFinalChoices: 0,
    ratio: 1,
    meetsPersistentDivergence: true,
    weightLandsBeforeTheEnd: true,
    earlyTagsWithoutDelay: [],
    ok: true,
  };
}

/**
 * Choices have weight before the end when enough non-final tags are consumed
 * by a later node, an early tag still matters two nodes later, and the final
 * node is not the only consumer.
 */
export function auditChoiceWeight(nodes: readonly CausalNodeView[], reads: readonly CausalLaterRead[]): ChoiceWeightAudit {
  const last = nodes.length - 1;
  const indexOf = nodeIndexOf(nodes);
  const sites = choiceSites(nodes);
  const nonFinal = sites.filter((site) => site.nodeIndex < last);
  const readAt = (read: CausalLaterRead) => indexOf.get(read.nodeId);
  const covers = (tag: string, pred: (index: number) => boolean) => reads.some((read) => {
    if (read.tag !== tag) return false;
    const index = readAt(read);
    return index !== undefined && pred(index);
  });
  const weightedChoices = nonFinal.filter((site) => covers(site.tag, (index) => index > site.nodeIndex)).length;
  const ratio = nonFinal.length === 0 ? 1 : weightedChoices / nonFinal.length;
  const earlyEnd = nodes.length >= 4 ? 2 : 1;
  const earlyTagsWithoutDelay = sites
    .filter((site) => site.nodeIndex < earlyEnd && site.nodeIndex + 2 <= last)
    .filter((site) => !covers(site.tag, (index) => index >= site.nodeIndex + 2))
    .map((site) => site.tag);
  const weightLandsBeforeTheEnd = nodes.length < 3
    || nonFinal.length === 0
    || reads.some((read) => {
      const index = readAt(read);
      return index !== undefined && index < last;
    });
  const meetsPersistentDivergence = ratio + 1e-9 >= PERSISTENT_DIVERGENCE;
  return {
    weightedChoices,
    nonFinalChoices: nonFinal.length,
    ratio,
    meetsPersistentDivergence,
    weightLandsBeforeTheEnd,
    earlyTagsWithoutDelay,
    ok: meetsPersistentDivergence && weightLandsBeforeTheEnd && earlyTagsWithoutDelay.length === 0,
  };
}

function readChange(value: unknown): CausalChange | undefined {
  if (typeof value !== "string") return undefined;
  const token = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (token === "options" || token === "option" || token === "choices" || token === "choice") return "options";
  if (token === "stakes" || token === "stake" || token === "situation") return "stakes";
  if (token === "resources" || token === "resource") return "resources";
  return undefined;
}

function readGateEffect(value: unknown): GateEffect | undefined {
  if (typeof value !== "string") return undefined;
  const token = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (token === "hide" || token === "hidden" || token === "foreclose" || token === "foreclosed") return "hide";
  if (token === "raise_cost" || token === "raise" || token === "cost") return "raise_cost";
  if (token === "alter" || token === "change" || token === "changed") return "alter";
  return undefined;
}

function noteResourceKey(name: string, allow: CausalAllowList | undefined, invented: Set<string>, touchedFlags: Set<string>): void {
  if (!name) return;
  if (!allow) {
    invented.add(name);
    return;
  }
  if (allow.flags.includes(name)) touchedFlags.add(name);
  else if (!allow.resources.includes(name) && !allow.tracks.some((track) => track.id === name)) invented.add(name);
}

function readGate(raw: unknown, invented: Set<string>, touchedFlags: Set<string>, allow?: CausalAllowList): CausalOptionGate | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const choiceId = typeof obj.choiceId === "string" ? obj.choiceId.trim() : typeof obj.id === "string" ? obj.id.trim() : "";
  const effect = readGateEffect(obj.effect);
  const note = typeof obj.note === "string" ? clipWords(obj.note, GATE_NOTE_WORDS) : "";
  if (typeof obj.resource === "string") noteResourceKey(obj.resource, allow, invented, touchedFlags);
  if (!choiceId || !effect || !note) return undefined;
  return { choiceId, effect, note };
}

/** Pull laterReads out of a patch. Unknown shapes are ignored. Keys are audited, not stored. */
function parseLaterReads(raw: unknown, invented: Set<string>, touchedFlags: Set<string>, allow?: CausalAllowList): CausalLaterRead[] {
  const root = asObject(raw);
  const reads: CausalLaterRead[] = [];
  const take = (item: unknown, tagHint?: string) => {
    if (!item || typeof item !== "object") return;
    const obj = item as Record<string, unknown>;
    if (typeof obj.resource === "string") noteResourceKey(obj.resource, allow, invented, touchedFlags);
    const tagRaw = typeof obj.tag === "string" && obj.tag.trim() ? obj.tag : tagHint;
    const nodeId = typeof obj.nodeId === "string" ? obj.nodeId.trim() : typeof obj.eventId === "string" ? obj.eventId.trim() : typeof obj.beatId === "string" ? obj.beatId.trim() : "";
    const changes = readChange(obj.changes);
    if (!tagRaw || !nodeId || !changes) return;
    const gate = readGate(obj.gate, invented, touchedFlags, allow);
    reads.push({
      tag: normalizeConsequenceTag(tagRaw, ""),
      nodeId,
      changes,
      ...(gate ? { gate } : {}),
    });
  };
  const lists = [root.laterReads, root.reads];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) take(item);
  }
  if (Array.isArray(root.choices)) {
    for (const choice of root.choices) {
      if (!choice || typeof choice !== "object") continue;
      const row = choice as Record<string, unknown>;
      const tagHint = typeof row.consequenceTag === "string" ? row.consequenceTag : undefined;
      if (Array.isArray(row.consumedBy)) for (const item of row.consumedBy) take(item, tagHint);
    }
  }
  return reads;
}

function fallbackGateNote(tag: string): string {
  const prose = tag.toLowerCase().replace(/_/g, " ");
  return clipWords(`After ${prose}, this option costs more or no longer works the same way.`, GATE_NOTE_WORDS);
}

function sanitizeLaterReads(nodes: readonly CausalNodeView[], reads: readonly CausalLaterRead[]): CausalLaterRead[] {
  const sites = new Map(choiceSites(nodes).map((site) => [site.tag, site]));
  const indexOf = nodeIndexOf(nodes);
  const kept: CausalLaterRead[] = [];
  const seen = new Set<string>();
  for (const read of reads) {
    const source = sites.get(read.tag);
    const target = indexOf.get(read.nodeId);
    if (!source || target === undefined || target <= source.nodeIndex) continue;
    const key = `${read.tag}|${read.nodeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const targetNode = nodes[target];
    let gate = read.gate;
    if (gate && !targetNode?.choices?.some((choice) => choice.id === gate?.choiceId)) gate = undefined;
    if (read.changes === "options" && !gate) {
      const choice = targetNode?.choices?.[0];
      if (choice) gate = { choiceId: choice.id, effect: "raise_cost", note: fallbackGateNote(read.tag) };
    }
    kept.push({ tag: read.tag, nodeId: read.nodeId, changes: gate ? read.changes : read.changes === "options" && !targetNode?.choices?.length ? "stakes" : read.changes, ...(gate ? { gate } : {}) });
  }
  return kept;
}

function consumerIndex(length: number, sourceIndex: number, wantDelay: boolean, wantMid: boolean): number | undefined {
  const last = length - 1;
  const later: number[] = [];
  for (let index = sourceIndex + 1; index <= last; index += 1) later.push(index);
  if (later.length === 0) return undefined;
  let pool = later;
  if (wantDelay) {
    const delayed = later.filter((index) => index >= sourceIndex + 2);
    if (delayed.length > 0) pool = delayed;
  }
  if (wantMid) {
    const mid = pool.filter((index) => index < last);
    if (mid.length > 0) pool = mid;
  }
  return pool[0];
}

function pushRead(nodes: readonly CausalNodeView[], reads: CausalLaterRead[], seen: Set<string>, tag: string, target: number, prefer: CausalChange): void {
  if (reads.length >= LATER_READ_CAP) return;
  const node = nodes[target];
  if (!node) return;
  const key = `${tag}|${node.id}`;
  if (seen.has(key)) return;
  const choice = node.choices?.[0];
  const changes: CausalChange = !choice && prefer === "options" ? "stakes" : prefer;
  const gate = changes === "options" && choice
    ? { choiceId: choice.id, effect: "raise_cost" as const, note: fallbackGateNote(tag) }
    : undefined;
  seen.add(key);
  reads.push({ tag, nodeId: node.id, changes, ...(gate ? { gate } : {}) });
}

/**
 * Fill the later-read map until the weight check passes, or until no legal
 * consumer remains. Does not rewrite scenes, ids, or resources.
 */
export function ensureChoiceWeight(nodes: readonly CausalNodeView[], reads: readonly CausalLaterRead[]): { laterReads: CausalLaterRead[]; audit: ChoiceWeightAudit } {
  const kept = sanitizeLaterReads(nodes, reads);
  const seen = new Set(kept.map((read) => `${read.tag}|${read.nodeId}`));
  const last = nodes.length - 1;
  const earlyEnd = nodes.length >= 4 ? 2 : 1;
  const indexOf = nodeIndexOf(nodes);
  const sites = choiceSites(nodes);
  const cycle: CausalChange[] = ["options", "stakes", "resources"];
  let cursor = kept.length;

  const covers = (tag: string, pred: (index: number) => boolean) => kept.some((read) => {
    if (read.tag !== tag) return false;
    const index = indexOf.get(read.nodeId);
    return index !== undefined && pred(index);
  });

  for (const site of sites) {
    if (site.nodeIndex >= earlyEnd || site.nodeIndex + 2 > last) continue;
    if (covers(site.tag, (index) => index >= site.nodeIndex + 2)) continue;
    const target = consumerIndex(nodes.length, site.nodeIndex, true, true);
    if (target === undefined) continue;
    pushRead(nodes, kept, seen, site.tag, target, cycle[cursor % cycle.length]);
    cursor += 1;
  }

  if (nodes.length >= 3 && !kept.some((read) => {
    const index = indexOf.get(read.nodeId);
    return index !== undefined && index < last;
  })) {
    const site = sites.find((item) => item.nodeIndex < last && consumerIndex(nodes.length, item.nodeIndex, false, true) !== undefined);
    const target = site ? consumerIndex(nodes.length, site.nodeIndex, false, true) : undefined;
    if (site && target !== undefined) {
      pushRead(nodes, kept, seen, site.tag, target, "stakes");
    }
  }

  const nonFinal = sites.filter((site) => site.nodeIndex < last);
  let guard = 0;
  while (guard < nonFinal.length && kept.length < LATER_READ_CAP) {
    const audit = auditChoiceWeight(nodes, kept);
    if (audit.meetsPersistentDivergence) break;
    const site = nonFinal.find((item) => !covers(item.tag, (index) => index > item.nodeIndex));
    if (!site) break;
    const target = consumerIndex(nodes.length, site.nodeIndex, true, true);
    if (target === undefined) break;
    const before = kept.length;
    pushRead(nodes, kept, seen, site.tag, target, cycle[cursor % cycle.length]);
    cursor += 1;
    if (kept.length === before) break;
    guard += 1;
  }

  return { laterReads: kept, audit: auditChoiceWeight(nodes, kept) };
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
  return {
    inventedKeys: [],
    flagKeysTouched: [],
    droppedFlags: false,
    unreferencedEarlyTags: [],
    nearDuplicateNodes: [],
    laterReads: [],
    weight: emptyWeight(),
  };
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

  const weighted = ensureChoiceWeight(skeleton.eventSkeletons, parseLaterReads(patch, invented, touchedFlags, allow));
  skeleton.laterReads = weighted.laterReads;
  audit.inventedKeys = [...invented];
  audit.flagKeysTouched = [...touchedFlags];
  audit.unreferencedEarlyTags = unreferencedEarlyTags(skeleton.eventSkeletons);
  audit.laterReads = weighted.laterReads;
  audit.weight = weighted.audit;
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
export function repairCausalNodes(nodes: CausalNodeView[], existingReads: readonly CausalLaterRead[] = []): CausalAudit {
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
  const weighted = ensureChoiceWeight(nodes, existingReads);
  audit.unreferencedEarlyTags = unreferencedEarlyTags(nodes);
  audit.laterReads = weighted.laterReads;
  audit.weight = weighted.audit;
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
  const draftReads = parseLaterReads(patch, invented, new Set());
  const repaired = repairCausalNodes(nodes, draftReads);
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
  if (repaired.laterReads.length > 0) plan.laterReads = repaired.laterReads;
  else delete plan.laterReads;
  // A narrative plan has no resource map at enrichment time. Any mutation key
  // the model emitted is outside the locked set (the compiler maps stake later).
  audit.inventedKeys = [...invented];
  audit.droppedFlags = audit.droppedFlags || repaired.droppedFlags;
  audit.unreferencedEarlyTags = repaired.unreferencedEarlyTags;
  audit.nearDuplicateNodes = repaired.nearDuplicateNodes;
  audit.laterReads = repaired.laterReads;
  audit.weight = repaired.weight;
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
    'Output { "choices": [ { "eventId", "choiceId", "tradeOff", "consequenceTag", "mutates" } ], "arrivals": [ { "eventId", "incomingContext": [ { "tag", "context" } ] } ], "laterReads": [ { "tag", "nodeId", "changes", "gate": { "choiceId", "effect", "note" } } ] }.',
  ].filter(Boolean).join("\n\n");
}

function narrativeUser(plan: NarrativePlan, topic: string, standard: string): string {
  const beats = plan.beats.filter((beat) => beat.included).map((beat) => ({
    id: beat.id,
    role: beat.role,
    title: beat.title,
    choices: (beat.choices ?? []).map((choice, index) => ({
      choiceIndex: index,
      choiceId: `${beat.id}_${index + 1}`,
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
    "laterReads must send at least 60% of non-final choices to a later beat. A choice from the first two beats must be read at least two beats later. At least one read lands before the final beat. changes is options, stakes, or resources. A gate choiceId is the choiceId shown above.",
    'Output { "choices": [ { "beatId", "choiceIndex", "tradeOff", "consequenceTag", "endingFragment" } ], "arrivals": [ { "beatId", "incomingContext": [ { "tag", "context" } ] } ], "laterReads": [ { "tag", "nodeId", "changes", "gate": { "choiceId", "effect", "note" } } ] }.',
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
