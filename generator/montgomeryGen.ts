/**
 * Montgomery campaign generator. Three passes, never one 45-node call.
 *
 * Pass 1 — architect blueprint on grok-4.7 (reasoning effort high, temperature 0.7).
 * Pass 2 — four chapter calls, in parallel, on grok-4.7 (reasoning effort medium,
 *          temperature 0.8). A 429 on one chapter backs off and retries that
 *          chapter only, twice.
 * Pass 3 — stitchMontgomery scaffolds, overlays, repairs broken links, and validates.
 *
 * Calls https://api.x.ai/v1/responses with XAI_API_KEY. The apiKey argument is
 * used only when that env var is unset, and it must be an xAI key.
 * This path does not replace generateCampaign or generateBranchingStory.
 */
import { parseModelJson } from "./json.js";
import {
  CHAPTERS,
  allNodeIds,
  bottleneckId,
  chapterNodeIds,
  legalSinks,
  normalizeBlueprint,
  readNodes,
  stitchMontgomery,
  type ChapterNumber,
  type MontgomeryBlueprint,
  type MontgomeryCampaign,
  type MontgomeryReport,
} from "./montgomery.js";

export const MONTGOMERY_GROK_MODEL = "grok-4.7";
export const MONTGOMERY_TIMEOUT_MS = 180_000;
export const BLUEPRINT_TEMPERATURE = 0.7;
export const CHAPTER_TEMPERATURE = 0.8;
export const BLUEPRINT_REASONING_EFFORT = "high" as const;
export const CHAPTER_REASONING_EFFORT = "medium" as const;
export const CHAPTER_RATE_LIMIT_RETRIES = 2;

const XAI_RESPONSES_URL = "https://api.x.ai/v1/responses";
const BLUEPRINT_MAX_TOKENS = 4096;
const CHAPTER_MAX_TOKENS = 8192;

type ReasoningEffort = "low" | "medium" | "high" | "xhigh";
type JsonSchema = Record<string, unknown>;

export interface MontgomeryInputs {
  topic: string;
  gradeLevel: string;
  standard: string;
}

export interface MontgomeryResult {
  campaign: MontgomeryCampaign;
  report: MontgomeryReport;
  blueprint: MontgomeryBlueprint;
}

export interface GrokStageCall {
  system: string;
  user: string;
  schemaName: string;
  schema: JsonSchema;
  temperature: number;
  reasoningEffort: ReasoningEffort;
  maxOutputTokens: number;
}

export interface GrokResponsesBody {
  model: string;
  temperature: number;
  max_output_tokens: number;
  reasoning: { effort: ReasoningEffort };
  input: Array<{ role: "system" | "user"; content: string }>;
  text: {
    format: {
      type: "json_schema";
      name: string;
      schema: JsonSchema;
      strict: true;
    };
  };
}

export const MONTGOMERY_BLUEPRINT_SYSTEM = [
  "You plan a four-chapter Choose Your Own Adventure history. Every student who survives a chapter meets at the next historical bottleneck.",
  "Name four real bottleneck events in historical order, each with the curriculum concept it teaches.",
  "Each chapter has a bold road, a diplomatic road, and a cautious road, plus the historical blunder behind the red ending, the passive trap behind the yellow ending, and the lateral warp that joins one road to another.",
  "The climax covers players who survive all four bottlenecks: costly survival inside the history, a final sidelining, and the last historical mistake.",
  "Return only valid JSON matching the blueprint schema. No markdown fences. No commentary.",
].join("\n");

export const MONTGOMERY_CHAPTER_SYSTEM = [
  "You write one chapter diamond of a Choose Your Own Adventure history.",
  "Historical texture comes first: the places, dates, tools, ranks, and pressures of the real event, in second person and past tense.",
  "Red and yellow prunes are sharp causal consequences. The red ending is the historical blunder that destroys the player's position, and the scene shows what that action costs. The yellow ending is the passive trap that sidelines the player while the event continues without them.",
  "Choices that enter a Historical Bottleneck carry bridgeText so this road's cost arrives seamlessly in the next scene. The bottleneck narrative itself stays true for every survivor.",
  "Return only valid JSON matching the chapter diamond schema. No markdown fences. No commentary.",
].join("\n");

export class MontgomeryRateLimitError extends Error {
  readonly status = 429;
  constructor(message: string) {
    super(message);
    this.name = "MontgomeryRateLimitError";
  }
}

export function isRateLimitError(err: unknown): boolean {
  if (err instanceof MontgomeryRateLimitError) return true;
  return Boolean(err && typeof err === "object" && "status" in err && (err as { status?: unknown }).status === 429);
}

/** Prefer XAI_API_KEY. A passed key is used only when the env var is unset. */
export function resolveMontgomeryApiKey(passed: string): string {
  const fromEnv = process.env.XAI_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const key = passed.trim();
  if (!key) throw new Error("Montgomery generation needs XAI_API_KEY.");
  return key;
}

export function grokResponsesBody(call: GrokStageCall): GrokResponsesBody {
  return {
    model: MONTGOMERY_GROK_MODEL,
    temperature: call.temperature,
    max_output_tokens: call.maxOutputTokens,
    reasoning: { effort: call.reasoningEffort },
    input: [
      { role: "system", content: call.system },
      { role: "user", content: call.user },
    ],
    text: {
      format: {
        type: "json_schema",
        name: call.schemaName,
        schema: call.schema,
        strict: true,
      },
    },
  };
}

/**
 * Run `run`. On a 429, wait 1s then 2s and try again.
 * `maxRetries` is the number of extra attempts after the first failure.
 * Any other error is thrown immediately.
 */
export async function retryOnRateLimit<T>(
  run: () => Promise<T>,
  options: {
    maxRetries?: number;
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (attempt: number, delayMs: number) => void;
  } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? CHAPTER_RATE_LIMIT_RETRIES;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let attempt = 0;
  for (;;) {
    try {
      return await run();
    } catch (err) {
      if (!isRateLimitError(err) || attempt >= maxRetries) throw err;
      const delayMs = 1000 * 2 ** attempt;
      attempt += 1;
      options.onRetry?.(attempt, delayMs);
      await sleep(delayMs);
    }
  }
}

export function blueprintResponseSchema(): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "protagonist", "bottlenecks", "chapters", "climax"],
    properties: {
      title: { type: "string" },
      protagonist: { type: "string", description: "The player character, inside the history." },
      bottlenecks: {
        type: "array",
        minItems: 4,
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["chapter", "title", "date", "concept", "summary"],
          properties: {
            chapter: { type: "integer", enum: [1, 2, 3, 4] },
            title: { type: "string", description: "Name of the real historical bottleneck." },
            date: { type: "string" },
            concept: { type: "string", description: "The curriculum idea this event teaches." },
            summary: { type: "string", description: "What is already true when every survivor arrives." },
          },
        },
      },
      chapters: {
        type: "array",
        minItems: 4,
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["chapter", "branches", "redBlunder", "yellowTrap", "warp"],
          properties: {
            chapter: { type: "integer", enum: [1, 2, 3, 4] },
            branches: {
              type: "array",
              minItems: 3,
              maxItems: 3,
              items: { type: "string" },
              description: "Bold, then diplomatic, then cautious. One sentence each.",
            },
            redBlunder: { type: "string", description: "The historical mistake that makes the red ending fatal." },
            yellowTrap: { type: "string", description: "The passive choice that sidelines the player." },
            warp: { type: "string", description: "How one road joins another inside the chapter." },
          },
        },
      },
      climax: {
        type: "object",
        additionalProperties: false,
        required: ["green", "yellow", "red"],
        properties: {
          green: { type: "string", description: "Costly survival inside the history." },
          yellow: { type: "string", description: "Sidelined at the end." },
          red: { type: "string", description: "The last historical mistake." },
        },
      },
    },
  };
}

export function chapterResponseSchema(ids: readonly string[]): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["nodes"],
    properties: {
      nodes: {
        type: "array",
        minItems: ids.length,
        maxItems: ids.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "narrative", "ending", "historicalWhy", "choices"],
          properties: {
            id: { type: "string", enum: [...ids] },
            title: { type: "string" },
            narrative: { type: "string", description: "Scene prose. A bottleneck stays true for every survivor." },
            ending: {
              anyOf: [
                { type: "string", enum: ["red", "yellow", "green"] },
                { type: "null" },
              ],
              description: "red, yellow, or green on an ending node. Null on every other node.",
            },
            historicalWhy: {
              type: ["string", "null"],
              description: "The historical reason a red or yellow ending follows from the choice. Null otherwise.",
            },
            choices: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["text", "targetNodeId", "bridgeText"],
                properties: {
                  text: { type: "string", description: "A physical or strategic action." },
                  targetNodeId: { type: "string", description: "Id of the node this choice opens." },
                  bridgeText: {
                    type: ["string", "null"],
                    description: "One or two sentences when this choice enters a bottleneck or the climax. Null otherwise.",
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function blueprintUser(inputs: MontgomeryInputs): string {
  return [
    `Topic: ${inputs.topic}`,
    `Grade: ${inputs.gradeLevel}`,
    `Standard: ${inputs.standard}`,
    "Plan exactly four bottlenecks, in historical order, that a class must not skip.",
    "Branch summaries are one sentence each. Red and yellow lines name the real historical failure.",
  ].join("\n");
}

function chapterIds(chapter: ChapterNumber): string[] {
  return chapter === 4
    ? [...chapterNodeIds(chapter), "climax_green", "climax_yellow", "climax_red"]
    : chapterNodeIds(chapter);
}

function chapterUser(blueprint: MontgomeryBlueprint, chapter: ChapterNumber): string {
  const spec = blueprint.chapters.find((item) => item.chapter === chapter);
  const bottleneck = blueprint.bottlenecks.find((item) => item.chapter === chapter);
  const next = blueprint.bottlenecks.find((item) => item.chapter === (chapter + 1) as ChapterNumber);
  return [
    `Topic: ${blueprint.topic}`,
    `Grade: ${blueprint.gradeLevel}`,
    `Standard: ${blueprint.standard}`,
    `Protagonist: ${blueprint.protagonist}`,
    `Write chapter ${chapter} only.`,
    `Bottleneck: ${bottleneck?.title} (${bottleneck?.date}). Concept: ${bottleneck?.concept}. ${bottleneck?.summary}`,
    `Bold branch: ${spec?.branches[0]}`,
    `Diplomatic branch: ${spec?.branches[1]}`,
    `Cautious branch: ${spec?.branches[2]}`,
    `Red blunder: ${spec?.redBlunder}`,
    `Yellow trap: ${spec?.yellowTrap}`,
    `Warp: ${spec?.warp}`,
    chapter < 4
      ? `Surviving Tier-2 choices target ${bottleneckId(chapter + 1)} (${next?.title ?? "the next bottleneck"}).`
      : `Surviving Tier-2 choices target one of ${legalSinks(4).join(", ")}. Green: ${blueprint.climax.green} Yellow: ${blueprint.climax.yellow} Red: ${blueprint.climax.red}`,
    `Ids for this diamond: ${chapterIds(chapter).join(", ")}`,
  ].join("\n");
}

export function blueprintGrokCall(inputs: MontgomeryInputs): GrokStageCall {
  return {
    system: MONTGOMERY_BLUEPRINT_SYSTEM,
    user: blueprintUser(inputs),
    schemaName: "montgomery_blueprint",
    schema: blueprintResponseSchema(),
    temperature: BLUEPRINT_TEMPERATURE,
    reasoningEffort: BLUEPRINT_REASONING_EFFORT,
    maxOutputTokens: BLUEPRINT_MAX_TOKENS,
  };
}

export function chapterGrokCall(blueprint: MontgomeryBlueprint, chapter: ChapterNumber): GrokStageCall {
  return {
    system: MONTGOMERY_CHAPTER_SYSTEM,
    user: chapterUser(blueprint, chapter),
    schemaName: `montgomery_chapter_${chapter}`,
    schema: chapterResponseSchema(chapterIds(chapter)),
    temperature: CHAPTER_TEMPERATURE,
    reasoningEffort: CHAPTER_REASONING_EFFORT,
    maxOutputTokens: CHAPTER_MAX_TOKENS,
  };
}

interface XaiResponsesPayload {
  status?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}

function outputText(payload: XaiResponsesPayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  const parts: string[] = [];
  for (const item of payload.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
    }
  }
  if (parts.length === 0) throw new Error("xAI response contained no output text");
  return parts.join("");
}

async function postGrok(apiKey: string, call: GrokStageCall): Promise<unknown> {
  const response = await fetch(XAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resolveMontgomeryApiKey(apiKey)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(grokResponsesBody(call)),
    signal: AbortSignal.timeout(MONTGOMERY_TIMEOUT_MS),
  });
  const rawText = await response.text();
  if (response.status === 429) {
    throw new MontgomeryRateLimitError(rawText.slice(0, 300) || "xAI rate limit (429)");
  }
  if (!response.ok) {
    throw new Error(`xAI responses ${response.status}: ${rawText.slice(0, 400)}`);
  }
  let payload: XaiResponsesPayload;
  try {
    payload = JSON.parse(rawText) as XaiResponsesPayload;
  } catch {
    throw new Error("xAI response was not JSON");
  }
  if (payload.status && payload.status !== "completed") {
    throw new Error(`xAI response status ${payload.status}`);
  }
  return parseModelJson(outputText(payload));
}

/** Pass 1. Compact historical blueprint. No scene prose. */
export async function generateMontgomeryBlueprint(apiKey: string, inputs: MontgomeryInputs): Promise<MontgomeryBlueprint> {
  const raw = await postGrok(apiKey, blueprintGrokCall(inputs));
  return normalizeBlueprint(raw, inputs.topic, inputs.gradeLevel, inputs.standard);
}

/** Pass 2. One diamond. A 429 retries this chapter only. Safe to run beside the other three. */
export async function generateMontgomeryChapter(
  apiKey: string,
  blueprint: MontgomeryBlueprint,
  chapter: ChapterNumber,
): Promise<ReturnType<typeof readNodes>> {
  const raw = await retryOnRateLimit(
    () => postGrok(apiKey, chapterGrokCall(blueprint, chapter)),
    {
      maxRetries: CHAPTER_RATE_LIMIT_RETRIES,
      onRetry: (attempt, delayMs) => {
        console.warn(`[montgomery] pass 2 chapter ${chapter} hit 429; retry ${attempt} of ${CHAPTER_RATE_LIMIT_RETRIES} in ${delayMs}ms`);
      },
    },
  );
  return readNodes(raw).filter((node) => node.chapter === chapter || (chapter === 4 && node.id.startsWith("climax_")));
}

/**
 * Pass 1, then four parallel chapter calls, then the deterministic stitcher.
 * A failed chapter call leaves that diamond on the blueprint scaffold.
 */
export async function generateMontgomeryCampaign(apiKey: string, inputs: MontgomeryInputs): Promise<MontgomeryResult> {
  console.log(`[montgomery] pass 1 blueprint model=${MONTGOMERY_GROK_MODEL} reasoning=${BLUEPRINT_REASONING_EFFORT} temperature=${BLUEPRINT_TEMPERATURE}`);
  const started = Date.now();
  const blueprint = await generateMontgomeryBlueprint(apiKey, inputs);
  console.log(`[montgomery] pass 1 blueprint ${((Date.now() - started) / 1000).toFixed(1)}s — ${blueprint.bottlenecks.map((item) => item.title).join(" | ")}`);

  const fillStarted = Date.now();
  const chapters = await Promise.all(CHAPTERS.map(async (chapter) => {
    try {
      return await generateMontgomeryChapter(apiKey, blueprint, chapter);
    } catch (err) {
      console.warn(
        `[montgomery] pass 2 chapter ${chapter} failed; keeping the scaffold diamond:`,
        err instanceof Error ? err.message : err,
      );
      return [];
    }
  }));
  const written = chapters.reduce((sum, nodes) => sum + nodes.length, 0);
  console.log(`[montgomery] pass 2 diamonds ${((Date.now() - fillStarted) / 1000).toFixed(1)}s — ${written} nodes on writer=${MONTGOMERY_GROK_MODEL} reasoning=${CHAPTER_REASONING_EFFORT}`);

  const { campaign, report } = stitchMontgomery(blueprint, chapters);
  console.log(
    `[montgomery] pass 3 stitch ${report.ok ? "ok" : "broken"} — repairs ${report.repairs.length}, errors ${report.findings.filter((item) => item.level === "error").length}, nodes ${campaign.nodes.length}/${allNodeIds().length}`,
  );
  return { campaign, report, blueprint };
}
