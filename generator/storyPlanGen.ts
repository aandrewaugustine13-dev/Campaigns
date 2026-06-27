// ════════════════════════════════════════════════════════════════
// Narrative-plan GENERATION (the Gemini call). Split out from
// storyPlan.ts so that module stays PURE (types + validator only) and can be
// imported by the front-end (the teacher's plan-review checklist) without
// dragging the node SDK into the browser bundle — the same type-only boundary
// the rest of the Stage-1 studio uses. Server/CLI side only.
// ════════════════════════════════════════════════════════════════

import { GoogleGenAI } from "@google/genai";
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

EVERY BEAT GETS AN IMAGE QUERY (so the spine isn't imageless):
- Give EVERY beat an "imageQuery": a 2-4 word Wikimedia Commons file-search query for THIS beat's visual. It MUST be a CONCRETE, DEPICTABLE subject a period artist or photographer actually stood in front of — a NAMED battle/place/person/ship/event, or a concrete scene of place + setting, anchored with the YEAR. PREFER the specific over the generic. Do NOT use abstractions, concepts, emotions, or verbs (NOT "press gang sailors", "impressment", "fighting", "suffering") — those return book scans or wrong-era photos, not the scene. GOOD: "Battle of New Orleans 1815", "Burning of Washington 1814", "USS Constitution Guerriere 1812", "Tecumseh portrait". BAD: "sailors fighting", "war at sea", "American pride".
- Also give the WHOLE plan an "imageStyleKeyword": ONE word for the dominant visual medium of this topic's era — "engraving" or "lithograph" for early-19th-century, "painting" for portraitable eras, "photograph" only for late-19th-century onward, "woodcut"/"illumination" for older. This is a Commons ranking booster; keep it to ONE word and ERA-CORRECT (a pre-1840 topic is NOT a "photograph").
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
interface PlanBeat { id: string; role: BeatRole; title: string; scene: string; significance: string; choices?: PlanBeatChoice[]; imageQuery: string; phaseHint: number; included: boolean; }
interface NarrativePlan { throughline: string; meaning: string; imageStyleKeyword: string; beats: PlanBeat[]; }

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
  /** PRODUCT 2 (narrative) — when set, instruct the author to add an
   * `endingFragment` to every decision-beat choice and validate its presence.
   * Off ⇒ the systems plan path is byte-identical (no fragment authored). */
  requireEndingFragments?: boolean;
}

function buildUserMessage(standard: string, inputs: StoryPlanInputs, priorErrors?: string[]): string {
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

  // PRODUCT 2 (narrative): the deterministically-assembled ending recites the
  // player's OWN choices back. So EVERY decision-beat choice must carry an
  // `endingFragment` in ADDITION to the fields in the OUTPUT SHAPE. (Systems
  // plans omit this block entirely ⇒ byte-identical.)
  const endingNote = inputs.requireEndingFragments
    ? `\nNARRATIVE-ENDING REQUIREMENT (this campaign assembles a responsive ending from the player's choices): give EVERY choice on a cause/escalation/climax beat an additional field "endingFragment" — ONE retrospective, past-tense sentence the ending will RECITE BACK if the player picked that option. It names what they DID at this beat and what it cost or won, and it must read aloud naturally in sequence with the other beats' fragments and flow toward the closing synthesis ("meaning"). It is DISTINCT from "result": "result" is the immediate in-the-moment consequence; "endingFragment" is the looking-back-from-the-end voice. Example pair — result: "The declaration passes; the country is committed, ready or not." → endingFragment: "You cast your vote for war, and a republic that was not ready marched anyway." The resolution beat has no choices and needs no fragment. So each such choice has: text, result, stake, AND endingFragment.\n`
    : "";

  // Sighted repair: on a retry, feed back the prior attempt's validation errors
  // so the model fixes those exact fields instead of re-rolling blind (mirrors
  // the campaign generator's feedback block). Empty on the first attempt.
  const feedback = priorErrors && priorErrors.length
    ? `\nYOUR PREVIOUS ATTEMPT FAILED THESE VALIDATION CHECKS. Fix EVERY one — re-author the offending field(s) so it passes, keeping the rest faithful to the rules above (in particular: EVERY choice on a cause/escalation/climax beat needs a NON-ZERO integer stake, and the resolution beat carries NO choices):\n${priorErrors.map((e) => `- ${e}`).join("\n")}\n`
    : "";

  return `Author the narrative plan for a campaign built on THIS standard:

${subjectBlock}
${frameBlock}${characterNote}${endingNote}
Work the real history of this subject into an ORDERED arc: a cause that sets it in motion, escalation that raises the stakes, the climax it builds to, and the resolution that makes its meaning land. Give every beat playable scene prose and a one-sentence significance (why it matters in the chain of cause and consequence). Then write "meaning": the "what it all added up to" synthesis — the true irony of this history, in the gold-standard voice, not a recap.
${feedback}
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
  // Number of EXTRA repair attempts after the first. The model occasionally
  // slips a forbidden value (e.g. a stake-0 choice) despite the prompt; a
  // sighted retry that feeds the validation errors back lets the plan self-heal
  // before it ever reaches the teacher. Default 2.
  opts: { maxRepair?: number } = {},
): Promise<GenerateStoryPlanResult> {
  const client = new GoogleGenAI({ apiKey });
  const maxRepair = opts.maxRepair ?? 2;

  let last!: GenerateStoryPlanResult;
  let priorErrors: string[] = [];
  for (let attempt = 0; attempt <= maxRepair; attempt++) {
    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: buildUserMessage(standard, inputs, attempt > 0 ? priorErrors : undefined),
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 4000,
        responseMimeType: "application/json",
      },
    });
    const rawText = response.text ?? "";

    const data = parseModelJson<NarrativePlan>(rawText);
    const findings = validateStoryPlan(data, { requireEndingFragments: inputs.requireEndingFragments });
    last = { data, raw: rawText, findings };

    const errors = findings.filter((f) => f.level === "error");
    if (errors.length === 0) return last;
    // Feed the exact failures back and try once more.
    priorErrors = errors.map((f) => `${f.field}: ${f.message}`);
    if (attempt < maxRepair) console.warn(`[storyplan] attempt ${attempt + 1}/${maxRepair + 1}: ${errors.length} error(s) — repairing`);
  }
  // Best effort after exhausting repairs: return the last attempt; its findings
  // still carry the errors so the UI's regenerate path is the backstop.
  return last;
}
