/**
 * Montgomery campaign generator. Three passes, never one 45-node call.
 *
 * Pass 1 — architect blueprint. Four bottleneck events and the shape of each diamond.
 * Pass 2 — four chapter calls, in parallel. Each writes only that diamond.
 * Pass 3 — stitchMontgomery scaffolds, overlays, repairs broken links, and validates.
 *
 * This path does not replace generateCampaign or generateBranchingStory.
 */
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { parseModelJson } from "./json.js";
import { ARCHITECT_MODEL, NODE_WRITER_MODEL } from "./models.js";
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

const BLUEPRINT_MAX_TOKENS = 4096;
const CHAPTER_MAX_TOKENS = 8192;
const ARCHITECT_THINKING_BUDGET = 1024;

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

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

const BLUEPRINT_SYSTEM = [
  "You plan a Choose Your Own Adventure history. You output one JSON object and no scene prose.",
  "The campaign is four chapter diamonds plus a climax. Every student who survives a chapter meets at the next historical bottleneck.",
  "For each chapter name the real bottleneck event: title, date, and the curriculum concept it teaches.",
  "For each chapter give three branch summaries in this order: bold, diplomatic, cautious. Name the historical blunder that makes the red ending fatal, the passive trap that makes the yellow ending a sidelining, and the lateral warp that joins one branch to another.",
  "Climax is three outcomes for players who survive all four bottlenecks: green (costly survival inside the history), yellow (sidelined at the end), red (the last historical mistake).",
  "Do not write node prose, choices, or ids. Do not invent a fake event.",
  'Output { "title", "protagonist", "bottlenecks": [ { "chapter", "title", "date", "concept", "summary" } ], "chapters": [ { "chapter", "branches": [bold, diplomatic, cautious], "redBlunder", "yellowTrap", "warp" } ], "climax": { "green", "yellow", "red" } }.',
].join("\n");

const CHAPTER_SYSTEM = [
  "You write ONE chapter of a Choose Your Own Adventure history. Output one JSON object. No markdown.",
  "Second person, past tense. Concrete places, dates, and actions. Teach the historical concept inside the consequence, not in a lecture.",
  "The bottleneck narrative starts in the middle of the historical event. It must still be true no matter which earlier branch arrived. Do not say which road the reader took, and do not say 'whether you chose'.",
  "Choices are physical or strategic actions. Do not write introspection such as 'if you feel worried' or 'you wonder'.",
  "Both options of a dilemma carry a real cost. A bold action spends something. A cautious action loses an opening. Neither is a joke answer.",
  "Use only the ids you are given. A red or yellow ending has no choices. Its narrative explains the historical reason that choice fails.",
  "Every choice that targets a bottleneck includes bridgeText: one or two sentences, 8 to 40 words, describing how THIS path arrives. The bottleneck narrative itself stays branch-neutral.",
  "At least one Tier-1 choice warps to the warp node or to a Tier-2 node of a different letter.",
  "At least one choice in the chapter targets the red ending, and at least one targets the yellow ending.",
  "Tier-2 choices are the only choices that leave the chapter. In chapters 1–3 they target the next bottleneck. In chapter 4 they target climax_green, climax_yellow, or climax_red.",
  'Output { "nodes": [ { "id", "title", "narrative", "ending"?, "historicalWhy"?, "choices": [ { "text", "targetNodeId", "bridgeText"? } ] } ] }.',
].join("\n");

async function requestJson(apiKey: string, model: string, system: string, user: string, maxOutputTokens: number, thinking: boolean): Promise<unknown> {
  const client = new GoogleGenAI({ apiKey });
  const once = async (extra: string) => {
    const response = await client.models.generateContent({
      model,
      contents: extra ? `${user}\n\n${extra}` : user,
      config: {
        systemInstruction: system,
        maxOutputTokens,
        responseMimeType: "application/json",
        safetySettings: SAFETY_SETTINGS,
        ...(thinking ? { thinkingConfig: { thinkingBudget: ARCHITECT_THINKING_BUDGET } } : {}),
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

function blueprintUser(inputs: MontgomeryInputs): string {
  return [
    `Topic: ${inputs.topic}`,
    `Grade: ${inputs.gradeLevel}`,
    `Standard: ${inputs.standard}`,
    "Plan exactly four bottlenecks, in historical order, that a class must not skip.",
    "Branch summaries are one sentence each. Red and yellow lines name the real historical failure, not a moral.",
  ].join("\n");
}

function chapterUser(blueprint: MontgomeryBlueprint, chapter: ChapterNumber): string {
  const spec = blueprint.chapters.find((item) => item.chapter === chapter);
  const bottleneck = blueprint.bottlenecks.find((item) => item.chapter === chapter);
  const next = blueprint.bottlenecks.find((item) => item.chapter === (chapter + 1) as ChapterNumber);
  const ids = chapter === 4 ? [...chapterNodeIds(chapter), "climax_green", "climax_yellow", "climax_red"] : chapterNodeIds(chapter);
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
    `Ids you may use: ${ids.join(", ")}`,
    "Do not write nodes from any other chapter.",
  ].join("\n");
}

/** Pass 1. Compact historical blueprint. No scene prose. */
export async function generateMontgomeryBlueprint(apiKey: string, inputs: MontgomeryInputs): Promise<MontgomeryBlueprint> {
  const raw = await requestJson(apiKey, ARCHITECT_MODEL, BLUEPRINT_SYSTEM, blueprintUser(inputs), BLUEPRINT_MAX_TOKENS, true);
  return normalizeBlueprint(raw, inputs.topic, inputs.gradeLevel, inputs.standard);
}

/** Pass 2. One diamond. Safe to run beside the other three chapters. */
export async function generateMontgomeryChapter(
  apiKey: string,
  blueprint: MontgomeryBlueprint,
  chapter: ChapterNumber,
): Promise<ReturnType<typeof readNodes>> {
  const raw = await requestJson(
    apiKey,
    NODE_WRITER_MODEL,
    CHAPTER_SYSTEM,
    chapterUser(blueprint, chapter),
    CHAPTER_MAX_TOKENS,
    false,
  );
  return readNodes(raw).filter((node) => node.chapter === chapter || (chapter === 4 && node.id.startsWith("climax_")));
}

/**
 * Pass 1, then four parallel chapter calls, then the deterministic stitcher.
 * A failed chapter call leaves that diamond on the blueprint scaffold.
 */
export async function generateMontgomeryCampaign(apiKey: string, inputs: MontgomeryInputs): Promise<MontgomeryResult> {
  console.log(`[montgomery] pass 1 blueprint architect=${ARCHITECT_MODEL}`);
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
  console.log(`[montgomery] pass 2 diamonds ${((Date.now() - fillStarted) / 1000).toFixed(1)}s — ${written} nodes on writer=${NODE_WRITER_MODEL}`);

  const { campaign, report } = stitchMontgomery(blueprint, chapters);
  console.log(
    `[montgomery] pass 3 stitch ${report.ok ? "ok" : "broken"} — repairs ${report.repairs.length}, errors ${report.findings.filter((item) => item.level === "error").length}, nodes ${campaign.nodes.length}/${allNodeIds().length}`,
  );
  return { campaign, report, blueprint };
}
