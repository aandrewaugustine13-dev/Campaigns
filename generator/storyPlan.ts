// ════════════════════════════════════════════════════════════════
// Stage 1 output: the NARRATIVE PLAN of a campaign — an ORDERED arc of
// major beats (cause → escalation → climax → resolution) plus the
// meaning the whole story lands on. Pure data. No events, UI, or wiring
// — this is the inspectable artifact a teacher reviews (toggling beats
// in/out) before any game is generated, and which storyPlanCompile.ts
// later compiles into PINNED, guaranteed events. Mirrors the discipline
// of frame.ts / faultline.ts (types + validator + generation stage).
//
// WHY THIS EXISTS. The diagnosis found campaigns are a phase-windowed
// weighted POOL of standalone events with no throughline and no
// meaning-making ending. The plan is the spine that fixes that: its
// included beats become GUARANTEED events in arc order, and its
// `meaning` becomes the story-level ending (CampaignData.storyMeaning),
// distinct from the player verdict and the study-aid review summary.
//
// ARC LAW: a plan is a STORY, not a checklist. It must contain at least
// one cause beat, escalation, EXACTLY ONE climax, and a resolution sense
// (carried by `meaning`), and its beats must be orderable into that arc.
//
// MEANING LAW: `meaning` makes SIGNIFICANCE (what it added up to, the
// irony) — it is NOT a recap. The New Orleans line is the spec:
// "militarily pointless since the treaty was already signed, but it made
// Jackson a national icon and let a bruised country feel like it won."
// ════════════════════════════════════════════════════════════════

import Anthropic from "@anthropic-ai/sdk";
import { parseModelJson } from "./json.js";

// The four arc roles, in narrative order. `pinSeq` (assigned by the
// compiler) follows the beats' order; this enum is what makes the order
// MEANINGFUL — cause precedes escalation precedes the single climax
// precedes resolution.
export const BEAT_ROLES = ["cause", "escalation", "climax", "resolution"] as const;
export type BeatRole = (typeof BEAT_ROLES)[number];

// Rank used to test arc monotonicity. Multiple escalation beats are fine
// (they share rank 1); cause/climax/resolution are bookends.
const ROLE_RANK: Record<BeatRole, number> = {
  cause: 0,
  escalation: 1,
  climax: 2,
  resolution: 3,
};

export interface PlanBeat {
  /** Stable id, e.g. "beat_neworleans" — becomes the pinned event id. */
  id: string;
  /** The beat's place in the arc. EXACTLY ONE beat is the climax. */
  role: BeatRole;
  /** Short scene title (becomes the pinned event's title). */
  title: string;
  /** Playable event prose, within the brevity caps — the compiler emits this
   * as the pinned event's `text`, so the beat is a real, playable event. */
  scene: string;
  /** WHY this moment matters: the causal / character stakes. Becomes the
   * pinned event's `significance` and the teacher's checkbox explanation. */
  significance: string;
  /** Suggested 0–1 arc position; the compiler enforces actual ordering by
   * role + array order, but this is the author's intent and the teacher hint. */
  phaseHint: number;
  /** Teacher checkbox. Default true. An excluded beat is NOT compiled into a
   * pinned event (v1 = include/exclude only; reorder/edit comes later). */
  included: boolean;
}

export interface NarrativePlan {
  /** One sentence: the spine (cause → consequence) the arc traces. */
  throughline: string;
  /** THE ENDING — the meaning-making synthesis (significance + irony), the
   * "what it all added up to" beat. Becomes CampaignData.storyMeaning. */
  meaning: string;
  /** The ordered major beats. */
  beats: PlanBeat[];
}

// ── Validation (mirrors generator/faultline.ts discipline) ────────

export interface StoryPlanFinding {
  level: "error" | "warn";
  field: string;
  message: string;
}

// Cheap heuristic for "this `meaning` is a recap, not a synthesis": a
// step-by-step retelling chains sequence markers ("First… then… finally…").
// Two or more such markers reads as a recap. Noisy is fine — it only WARNS.
const SEQ_MARKER_RE = /\b(first|then|next|after that|afterwards?|finally|in the end|lastly)\b/gi;

export function validateStoryPlan(data: unknown): StoryPlanFinding[] {
  const f: StoryPlanFinding[] = [];
  const push = (level: "error" | "warn", field: string, message: string) =>
    f.push({ level, field, message });

  if (typeof data !== "object" || data === null) {
    push("error", "root", "Narrative plan is not an object");
    return f;
  }
  const d = data as Record<string, unknown>;

  for (const k of ["throughline", "meaning"] as const) {
    if (typeof d[k] !== "string" || (d[k] as string).trim().length === 0)
      push("error", k, `${k} must be a non-empty string`);
  }
  if (typeof d.meaning === "string") {
    const markers = d.meaning.match(SEQ_MARKER_RE);
    if (markers && markers.length >= 2)
      push("warn", "meaning", "reads like a step-by-step recap (chains sequence markers) — `meaning` must make significance (what it added up to, the irony), not retell the sequence");
  }

  const beats = d.beats;
  if (!Array.isArray(beats)) {
    push("error", "beats", "beats must be an array");
    return f;
  }
  if (beats.length < 2) {
    push("error", "beats", `a story arc needs ≥2 beats (got ${beats.length})`);
  }

  const ids = new Set<string>();
  const roleCounts: Record<string, number> = {};
  const includedRanks: number[] = [];

  beats.forEach((b, i) => {
    const bb = b as Record<string, unknown>;
    const prefix = `beats[${i}]`;

    for (const k of ["id", "title", "scene", "significance"] as const) {
      if (typeof bb[k] !== "string" || (bb[k] as string).trim().length === 0)
        push("error", `${prefix}.${k}`, `Missing or empty: ${k}`);
    }
    if (typeof bb.id === "string" && bb.id.trim().length > 0) {
      if (ids.has(bb.id)) push("error", `${prefix}.id`, `Duplicate beat id: "${bb.id}"`);
      ids.add(bb.id);
    }

    const role = bb.role as BeatRole;
    if (!BEAT_ROLES.includes(role)) {
      push("error", `${prefix}.role`, `role must be one of: ${BEAT_ROLES.join(", ")}`);
    } else {
      roleCounts[role] = (roleCounts[role] ?? 0) + 1;
    }

    if (typeof bb.phaseHint !== "number" || (bb.phaseHint as number) < 0 || (bb.phaseHint as number) > 1)
      push("error", `${prefix}.phaseHint`, "phaseHint must be a number in [0, 1]");

    if (typeof bb.included !== "boolean")
      push("error", `${prefix}.included`, "included must be a boolean");

    // The arc-shape checks below only consider INCLUDED beats — an excluded
    // beat is never compiled, so it cannot break the arc.
    if (bb.included === true && BEAT_ROLES.includes(role))
      includedRanks.push(ROLE_RANK[role]);
  });

  // ARC LAW (over included beats): need a cause, EXACTLY ONE climax, and a
  // resolution; escalation is strongly expected (warn if absent).
  const includedBeats = beats.filter((b) => (b as Record<string, unknown>).included === true);
  if (includedBeats.length === 0) {
    push("error", "beats", "no beats are included — the arc is empty");
  } else {
    const includedRole = (r: BeatRole) =>
      includedBeats.filter((b) => (b as Record<string, unknown>).role === r).length;
    if (includedRole("cause") < 1)
      push("error", "beats.cause", "the arc needs an included `cause` beat (where the story starts)");
    const climaxes = includedRole("climax");
    if (climaxes < 1)
      push("error", "beats.climax", "the arc needs an included `climax` beat (the turning point it builds to)");
    else if (climaxes > 1)
      push("error", "beats.climax", `exactly ONE climax is allowed; ${climaxes} included beats are marked climax`);
    if (includedRole("resolution") < 1)
      push("error", "beats.resolution", "the arc needs an included `resolution` beat (where it lands)");
    if (includedRole("escalation") < 1)
      push("warn", "beats.escalation", "no included `escalation` beat — the arc jumps from cause to climax without a build");
  }

  // ARC MONOTONICITY: in array order, included beats must not REGRESS in role
  // rank (a resolution before the climax, a climax before the cause). Equal
  // ranks are fine (multiple escalations).
  for (let i = 1; i < includedRanks.length; i++) {
    if (includedRanks[i] < includedRanks[i - 1]) {
      push("error", "beats.order", "included beats are out of arc order — roles must not regress (cause → escalation → climax → resolution) in array order");
      break;
    }
  }

  return f;
}

// ── Generation (reuses the same Anthropic plumbing as frame.ts) ───

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

THE MEANING — THE STORY-LEVEL ENDING (this is the payoff):
- "meaning" is the "what it all added up to" synthesis — SIGNIFICANCE and IRONY, not a recap. It states what the events MEANT, the gap between what happened and what it changed. It is shown at the very end as the story's close, and it is DISTINCT from any moral judgment of the player and from any study recap.
- GOLD-STANDARD register — author "meaning" in THIS voice. For the War of 1812 (Battle of New Orleans): "The Battle of New Orleans was militarily pointless — the Treaty of Ghent had already been signed weeks before — but it made Andrew Jackson a national icon and let a bruised, divided country feel like it had won, papering over a war that settled almost nothing." Note what it does: states the irony, names the real consequence, refuses to just retell the sequence.
- Compressed: about 2 to 4 sentences. Make significance, do NOT narrate the timeline ("first… then… finally…" is a recap and fails).
- "throughline" is ONE sentence naming the spine (cause to consequence) the arc traces.

HISTORICAL HONESTY: every beat and the meaning must be grounded in the REAL history of this subject — real events, real causation, real outcome. Do not invent beats that did not happen. The irony in "meaning" must be a TRUE irony of the actual history.

OUTPUT SHAPE (TypeScript for reference — output JSON only):
type BeatRole = "cause" | "escalation" | "climax" | "resolution";
interface PlanBeat { id: string; role: BeatRole; title: string; scene: string; significance: string; phaseHint: number; included: boolean; }
interface NarrativePlan { throughline: string; meaning: string; beats: PlanBeat[]; }

RULES: 4-6 beats, in arc order, with exactly one cause, one climax, one resolution, and one to three escalations between. Each beat has all fields; included is true. meaning makes significance, not a recap. Output ONLY the JSON object conforming to NarrativePlan.`;

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
    max_tokens: 3000,
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
