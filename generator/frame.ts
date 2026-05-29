import Anthropic from "@anthropic-ai/sdk";
import { parseModelJson } from "./json.js";

// ════════════════════════════════════════════════════════════════
// Stage 1 output: the proposed structural FRAME of a campaign — the
// controlling choices a teacher will later verify in a dropdown UI, but
// which we currently hand-author in a fixture file. Pure data. No beats,
// economy, cast, UI, or wiring — this is the inspectable artifact produced
// from a TEKS standard before any game exists.
//
// The frame is defined by TWO orthogonal axes:
//   campaignType    — what the DRAMA is: an impersonal "systems" process, or
//                     a "character" with relationships and a conscience.
//   progressionMode — how it ADVANCES: a "journey" over space, or a
//                     "project" over time/phases.
// They are independent: a systems game can be a journey OR a project, and a
// character game can be either too.
//
// CONTENT-SAFETY LAW: for topics where a management/optimization framing
// would require a child to optimize an atrocity (the slave trade, a
// genocide, the Columbian Exchange's human toll), the type MUST be
// "character" — experienced through a specific person — never "systems".
// ════════════════════════════════════════════════════════════════

export type CampaignType = "systems" | "character";
export type ProgressionMode = "journey" | "project";

export interface PlayerPerspective {
  /** Short label for who the player is, e.g. "the Corps of Discovery", "a Shoshone witness". */
  role: string;
  /** One sentence: who they are and what they experience in this campaign. */
  description: string;
}

export interface ProposedFrame {
  /** What the drama is: an impersonal process ("systems") or a person ("character"). */
  campaignType: CampaignType;
  /** How the campaign advances: over space ("journey") or over time/phases ("project"). */
  progressionMode: ProgressionMode;
  /** One short paragraph: the controlling structure of the experience, stated
   * plainly — and stating explicitly when it is NOT a journey. This is the text
   * that drives the campaign generator's structure. */
  frame: string;
  /** The primary player role this campaign is built around. */
  recommendedPerspective: PlayerPerspective;
  /** 1–3 other valid perspectives on the same standard — the "whose eyes"
   * choice a teacher picks from. Often the most pedagogically important option
   * is a non-dominant perspective (Indigenous, enslaved, laborer). */
  alternativePerspectives: PlayerPerspective[];
  /** 1–3 sentences on why these choices fit the standard, including the
   * content-safety reasoning when it drove a "character" choice. */
  rationale: string;
}

// ── Validation (mirrors generator/validate.ts + economy.ts discipline) ──

export interface FrameFinding {
  level: "error" | "warn";
  field: string;
  message: string;
}

const CAMPAIGN_TYPES: CampaignType[] = ["systems", "character"];
const PROGRESSION_MODES: ProgressionMode[] = ["journey", "project"];

function validatePerspective(
  p: unknown,
  field: string,
  push: (level: "error" | "warn", field: string, message: string) => void,
): void {
  const pp = p as Record<string, unknown>;
  if (typeof pp !== "object" || pp === null) {
    push("error", field, "perspective must be an object with role and description");
    return;
  }
  for (const k of ["role", "description"] as const) {
    if (typeof pp[k] !== "string" || (pp[k] as string).trim().length === 0)
      push("error", `${field}.${k}`, `Missing or empty: ${k}`);
  }
}

export function validateFrame(data: unknown): FrameFinding[] {
  const f: FrameFinding[] = [];
  const push = (level: "error" | "warn", field: string, message: string) =>
    f.push({ level, field, message });

  if (typeof data !== "object" || data === null) {
    push("error", "root", "Frame is not an object");
    return f;
  }
  const d = data as Record<string, unknown>;

  if (!CAMPAIGN_TYPES.includes(d.campaignType as CampaignType))
    push("error", "campaignType", 'campaignType must be "systems" or "character"');
  if (!PROGRESSION_MODES.includes(d.progressionMode as ProgressionMode))
    push("error", "progressionMode", 'progressionMode must be "journey" or "project"');

  if (typeof d.frame !== "string" || (d.frame as string).trim().length === 0)
    push("error", "frame", "frame must be a non-empty string");
  if (typeof d.rationale !== "string" || (d.rationale as string).trim().length === 0)
    push("error", "rationale", "rationale must be a non-empty string");

  validatePerspective(d.recommendedPerspective, "recommendedPerspective", push);

  const alts = d.alternativePerspectives;
  if (!Array.isArray(alts)) {
    push("error", "alternativePerspectives", "alternativePerspectives must be an array");
  } else {
    if (alts.length > 3)
      push("error", "alternativePerspectives", `alternativePerspectives must have 0–3 entries (got ${alts.length})`);
    alts.forEach((p, i) => validatePerspective(p, `alternativePerspectives[${i}]`, push));
  }

  return f;
}

// ── Generation (reuses the same Anthropic plumbing as economy.ts) ───

const SYSTEM_PROMPT = `You are an instructional designer for standards-aligned history games in the Oregon Trail tradition. Given a single state standard (e.g. a TEKS code and its description), you PROPOSE the structural FRAME of a campaign built on it — the controlling choices a teacher will later verify before any game is generated.

You output ONLY a single JSON object. No prose, no markdown, no code fences.

THE FRAME IS TWO ORTHOGONAL AXES — choose each honestly from the real shape of THIS standard's history:

AXIS 1 — campaignType: what the DRAMA is.
- "systems": the player IS an impersonal process — an expedition, a commission, a project. The drama lives in managing resources and constraints. (Lewis & Clark; the Erie Canal.)
- "character": the player is a PERSON with relationships and a conscience. The drama is moral and interpersonal. (A knight on Crusade.)
- Economic-management games are NOT a third type — they are "systems".

AXIS 2 — progressionMode: how the campaign ADVANCES.
- "journey": progress is distance/route over space. (Lewis & Clark crossing the continent.)
- "project": progress is time/phases over months or years. (The Erie Canal built across eight years of Commission reviews.)
- This is INDEPENDENT of campaignType: a systems game can be a journey OR a project, and a character game can be either too. Do not assume systems⇒journey.

CONTENT-SAFETY LAW (overrides any optimization instinct):
- For topics where a "systems"/management/optimization framing would require a child to optimize an atrocity — the transatlantic slave trade, a genocide, the human toll of the Columbian Exchange, forced removal — you MUST recommend campaignType "character", experienced through a specific person, because gamifying the management of mass death is never acceptable. When this rule drives your choice, name that reasoning explicitly in the rationale.

DESIGN PRINCIPLES:
1. THE FRAME STATES THE CONTROLLING STRUCTURE. Write "frame" as one short paragraph naming plainly what kind of experience this is and how it is shaped. When it is NOT a journey, say so explicitly (e.g. "A multi-year public-works project the player oversees through phases of construction and politics — NOT a journey from place to place.").
2. PERSPECTIVE IS A REAL CHOICE. recommendedPerspective is the primary player role. alternativePerspectives are 1–3 GENUINELY DIFFERENT vantage points on the same standard — not restatements of the same role. For many topics the most pedagogically important alternative is a non-dominant perspective (Indigenous, enslaved, laboring), and you should offer it where the history supports it.
3. ROLES ARE CONCRETE. Each perspective's "role" is a short label ("the Corps of Discovery", "a Shoshone witness", "an Irish canal laborer"); its "description" is one sentence on who they are and what they experience.
4. THE RATIONALE JUSTIFIES THE FRAME. In 1–3 sentences, say why this campaignType and progressionMode fit the real history of THIS standard — and include the content-safety reasoning whenever it drove a "character" choice.

OUTPUT SHAPE (TypeScript for reference — output JSON only):
type CampaignType = "systems" | "character";
type ProgressionMode = "journey" | "project";
interface PlayerPerspective { role: string; description: string; }
interface ProposedFrame { campaignType: CampaignType; progressionMode: ProgressionMode; frame: string; recommendedPerspective: PlayerPerspective; alternativePerspectives: PlayerPerspective[]; rationale: string; }

RULES: campaignType is exactly "systems" or "character". progressionMode is exactly "journey" or "project". Provide 1–3 alternativePerspectives, each genuinely distinct from the recommended one. Output ONLY the JSON object.`;

function buildUserMessage(standard: string): string {
  return `Propose the Stage 1 structural frame for a campaign built on THIS standard:

${standard}

Choose campaignType and progressionMode honestly from the real shape of this specific standard's history, treating the two axes as independent. Write a frame that states the controlling structure plainly and says explicitly when it is not a journey. Propose a primary perspective plus 1–3 genuinely different alternatives, offering a non-dominant perspective where the history supports it. Apply the content-safety law: if a management framing would mean optimizing an atrocity, recommend "character" and name that reasoning in the rationale.

Output ONLY the JSON object conforming to ProposedFrame.`;
}

export interface GenerateFrameResult {
  data: ProposedFrame;
  raw: string;
  findings: FrameFinding[];
}

export async function generateFrame(
  standard: string,
  apiKey: string,
): Promise<GenerateFrameResult> {
  const client = new Anthropic({ apiKey });

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(standard) }],
  });

  let rawText = "";
  stream.on("text", (t) => { rawText += t; });
  await stream.finalMessage();

  const data = parseModelJson<ProposedFrame>(rawText);
  const findings = validateFrame(data);
  return { data, raw: rawText, findings };
}
