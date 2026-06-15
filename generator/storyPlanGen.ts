// ════════════════════════════════════════════════════════════════
// Narrative-plan GENERATION (the Anthropic call). Split out from
// storyPlan.ts so that module stays PURE (types + validator only) and can be
// imported by the front-end (the teacher's plan-review checklist) without
// dragging the node SDK into the browser bundle — the same type-only boundary
// the rest of the Stage-1 studio uses. Server/CLI side only.
// ════════════════════════════════════════════════════════════════

import Anthropic from "@anthropic-ai/sdk";
import { parseModelJson } from "./json.js";
import { validateStoryPlan, type NarrativePlan, type StoryPlanFinding } from "./storyPlan.js";

const SYSTEM_PROMPT = `You are a narrative designer for standards-aligned history games in the Oregon Trail tradition. Given a single state standard and the SPECIFIC SUBJECT of a campaign, you author its NARRATIVE PLAN — the ORDERED arc of major beats the campaign will be built around, and the meaning the whole story lands on.

You output ONLY a single JSON object. No prose, no markdown, no code fences.

WHY THIS MATTERS. A campaign is otherwise just a bag of disconnected events that each stand alone. Your plan is the SPINE: its beats become fixed, guaranteed events that fire in this exact order, and the weaker random events fill in around them. A good plan turns a topic into a STORY — cause leads to consequence, the stakes rise, it breaks at a climax, and it RESOLVES into meaning.

AUTHOR AN ARC, NOT A LIST (non-negotiable):
- The beats are an ORDERED sequence in narrative time. Earlier beats CAUSE later ones; the tension BUILDS. A reader should feel the through-line, not a topic checklist.
- Use these roles, in this order: exactly ONE "cause" (where the story starts — the pressure or decision that sets it in motion), one to three "escalation" beats (the situation worsens or deepens, stakes rising), exactly ONE "climax" (the turning point everything builds to), and exactly ONE "resolution" (where it lands, the aftermath that makes the meaning possible). Aim for 4 to 6 beats total.
- Beats must appear in the array in arc order (cause first, resolution last). Their roles must not regress.

EVERY BEAT CARRIES ITS STAKES:
- "scene" is PLAYABLE event prose the engine will show verbatim: 2-3 short sentences (about 45 words max). Set the concrete moment and what is at stake in it, then stop. Vivid and specific, never a summary of a topic.
- "significance" is ONE sentence naming WHY THIS MOMENT MATTERS — the causal or character stakes, how it follows from what came before and feeds what comes next. This is the through-line made explicit; it is NOT the same as the scene's surface description.
- "title" is a short scene title. "phaseHint" is your sense of where it falls in the run (0.0 start to 1.0 end), arc-ordered and increasing.
- "id" is a short stable kebab-case id prefixed "beat_" (e.g. "beat_neworleans"), unique within the plan.
- "included" is true for every beat you author (the teacher will later toggle beats off; you propose them all on).

THE PLAYER ACTS AT THE PEAKS (this is the heart of the game):
- This is a decision game. The agency MUST live at the arc's tentpole moments, not in the filler around them. So EVERY cause, escalation, and CLIMAX beat carries "choices": 2-3 real decisions the player faces in that moment, under its specific pressure. The climax in particular is the player's hardest, highest-stakes decision — never a passive "watch it happen".
- Each choice has: "text" (one short line — the action taken), "result" (the distinct consequence shown after choosing — what that path costs or wins, in concrete terms), and "stake" (a NON-ZERO integer, roughly -10 to +10, the choice's net effect on the nation's MAIN resource — its standing/momentum/public support). A bold gamble that could backfire, a cautious hedge, a costly principled stand: give them DIFFERENT stakes and DIFFERENT results so the decision genuinely matters. A choice that does the right thing at real cost has a NEGATIVE stake; that is correct and good.
- The choices must be REAL trade-offs grounded in what this historical actor could actually have done at this moment — not a right answer and two wrong ones. A thoughtful person could defend more than one.
- EXCEPTION — the RESOLUTION beat has NO choices. It is the aftermath where the meaning lands, and WITNESSING it (not acting) is dramatically correct. Omit "choices" entirely on the resolution beat.

THE MEANING — THE STORY-LEVEL ENDING (this is the payoff):
- "meaning" is the "what it all added up to" synthesis — SIGNIFICANCE and IRONY, not a recap. It states what the events MEANT, the gap between what happened and what it changed. It is shown at the very end as the story's close, and it is DISTINCT from any moral judgment of the player and from any study recap.
- GOLD-STANDARD register — author "meaning" in THIS voice. For the War of 1812 (Battle of New Orleans): "The Battle of New Orleans was militarily pointless — the Treaty of Ghent had already been signed weeks before — but it made Andrew Jackson a national icon and let a bruised, divided country feel like it had won, papering over a war that settled almost nothing." Note what it does: states the irony, names the real consequence, refuses to just retell the sequence.
- Compressed: about 2 to 4 sentences. Make significance, do NOT narrate the timeline ("first… then… finally…" is a recap and fails).
- "throughline" is ONE sentence naming the spine (cause to consequence) the arc traces.

HISTORICAL HONESTY: every beat and the meaning must be grounded in the REAL history of this subject — real events, real causation, real outcome. Do not invent beats that did not happen. The irony in "meaning" must be a TRUE irony of the actual history.

OUTPUT SHAPE (TypeScript for reference — output JSON only):
type BeatRole = "cause" | "escalation" | "climax" | "resolution";
interface PlanBeatChoice { text: string; result: string; stake: number; }
interface PlanBeat { id: string; role: BeatRole; title: string; scene: string; significance: string; choices?: PlanBeatChoice[]; phaseHint: number; included: boolean; }
interface NarrativePlan { throughline: string; meaning: string; beats: PlanBeat[]; }

RULES: 4-6 beats, in arc order, with exactly one cause, one climax, one resolution, and one to three escalations between. Each beat has all fields; included is true. Every cause/escalation/climax beat has "choices" (2-3 real decisions, each with text + result + a non-zero stake); the resolution beat OMITS choices. meaning makes significance, not a recap. Output ONLY the JSON object conforming to NarrativePlan.`;

export interface StoryPlanInputs {
  /** The authoritative subject of the campaign (what it is about). */
  topic?: string;
  /** Whose eyes the player sees through, if a perspective has been chosen. */
  perspective?: string;
  /** From the frame: "systems" or "character" — shapes the arc's emphasis. */
  campaignType?: "systems" | "character";
  /** From the frame: "journey" or "project" — shapes how beats advance. */
  progressionMode?: "journey" | "project";
}

function buildUserMessage(standard: string, inputs: StoryPlanInputs): string {
  const { topic, perspective, campaignType, progressionMode } = inputs;
  // The descriptive SUBJECT (when provided) is authoritative; the code is
  // supporting metadata (mirrors frame.ts / faultline.ts).
  const subjectBlock = topic && topic.trim()
    ? `SUBJECT (authoritative — what this campaign is about): ${topic}\nSTANDARD (supporting reference / alignment code): ${standard}`
    : `STANDARD: ${standard}`;

  const frameLines: string[] = [];
  if (campaignType) frameLines.push(`CAMPAIGN TYPE: ${campaignType}`);
  if (progressionMode) frameLines.push(`PROGRESSION: ${progressionMode} (${progressionMode === "journey" ? "advances over distance/space" : "advances over time/phases"})`);
  if (perspective) frameLines.push(`PLAYER PERSPECTIVE (whose eyes): ${perspective}`);
  const frameBlock = frameLines.length ? `\n${frameLines.join("\n")}\n` : "";

  // Character-mode coexistence (design §6): a character campaign already has a
  // moral fault line that owns the opening defining choice and the closing
  // dilemma. Tell the plan to leave those bookends to the character spine and
  // keep its climax the person's defining historical confrontation, not a
  // second identity fork.
  const characterNote = campaignType === "character"
    ? "\nThis is a CHARACTER campaign: it already has a separate moral fault line that owns the player's defining choice at the very start and a climactic dilemma at the very end. Do NOT duplicate those — let your CAUSE establish the world and pressure (not a second identity choice), and let your CLIMAX be this person's defining HISTORICAL confrontation. The resolution's meaning is the historical close, not a verdict on the player.\n"
    : "";

  return `Author the narrative plan for a campaign built on THIS standard:

${subjectBlock}
${frameBlock}${characterNote}
Work the real history of this subject into an ORDERED arc: a cause that sets it in motion, escalation that raises the stakes, the climax it builds to, and the resolution that makes its meaning land. Give every beat playable scene prose and a one-sentence significance (why it matters in the chain of cause and consequence). Then write "meaning": the "what it all added up to" synthesis — the true irony of this history, in the gold-standard voice, not a recap.

Output ONLY the JSON object conforming to NarrativePlan.`;
}

export interface GenerateStoryPlanResult {
  data: NarrativePlan;
  raw: string;
  findings: StoryPlanFinding[];
}

export async function generateStoryPlan(
  standard: string,
  apiKey: string,
  inputs: StoryPlanInputs = {},
): Promise<GenerateStoryPlanResult> {
  const client = new Anthropic({ apiKey });

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(standard, inputs) }],
  });

  let rawText = "";
  stream.on("text", (t) => { rawText += t; });
  await stream.finalMessage();

  const data = parseModelJson<NarrativePlan>(rawText);
  const findings = validateStoryPlan(data);
  return { data, raw: rawText, findings };
}
