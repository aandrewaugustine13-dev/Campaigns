import Anthropic from "@anthropic-ai/sdk";
import { parseModelJson } from "./json.js";

// ════════════════════════════════════════════════════════════════
// Stage 1 output: the PROPOSED CAST for a "systems" campaign — the real
// historical people (and clearly-labeled representative roles) a campaign
// on a given standard would need. Pure data. No beats, UI, screens, or
// wiring — this is the inspectable artifact a teacher-verification screen
// will later consume.
//
// ACCURACY LAW: real named figures must be accurately named; representative
// roles must be flagged as types. NEVER fabricate a fake named individual
// presented as historical.
// ════════════════════════════════════════════════════════════════

export type PortraitPolicy =
  | "documented_likeness" // real portraits/photos exist
  | "period_artifact"     // no portrait, but period imagery (effigy, coin, manuscript)
  | "stylized_plate";     // no period likeness exists; use a consistent illustrated treatment

export interface CastCharacter {
  /** Real figure: their actual name. Representative role: a clear label like "Irish labor foreman (representative)". */
  name: string;
  /** True ONLY for actual named historical individuals. */
  realPerson: boolean;
  /** Their function in this history, short phrase (champion, engineer, labor, opponent, etc.). */
  role: string;
  /** One sentence: why they matter to the standard's history — what they let the player encounter or understand. */
  significance: string;
  /** How the player meets or deals with them, given the player's role in this campaign. */
  relationshipToPlayer: string;
  /** Drives the art pipeline later. Set honestly based on whether a period likeness plausibly exists. */
  portraitPolicy: PortraitPolicy;
}

export interface ProposedCast {
  campaignType: "systems";
  /** The 4–7 figures most essential to the standard's learning — not an exhaustive roster. */
  cast: CastCharacter[];
}

// ── Validation (mirrors generator/validate.ts + economy.ts discipline) ──

export interface CastFinding {
  level: "error" | "warn";
  field: string;
  message: string;
}

const PORTRAIT_POLICIES: PortraitPolicy[] = [
  "documented_likeness",
  "period_artifact",
  "stylized_plate",
];

// Deliberately simple, noisy heuristic: does this name read like a generic
// role rather than a proper personal name? A warn, never an error.
function looksLikeRole(name: string): boolean {
  const n = name.trim();
  return (
    /^(a|an|the)\s/i.test(n) ||
    /representative|generic|typical|unnamed|\brole\b/i.test(n) ||
    !/[A-Z][a-z]+/.test(n)
  );
}

export function validateCast(data: unknown): CastFinding[] {
  const f: CastFinding[] = [];
  const push = (level: "error" | "warn", field: string, message: string) =>
    f.push({ level, field, message });

  if (typeof data !== "object" || data === null) {
    push("error", "root", "Cast is not an object");
    return f;
  }
  const d = data as Record<string, unknown>;

  if (d.campaignType !== "systems")
    push("error", "campaignType", 'campaignType must be the literal "systems"');

  const cast = d.cast;
  if (!Array.isArray(cast)) {
    push("error", "cast", "cast must be an array");
    return f;
  }
  if (cast.length < 4 || cast.length > 7)
    push("error", "cast", `cast must have 4–7 entries (got ${cast.length})`);

  cast.forEach((c, i) => {
    const cc = c as Record<string, unknown>;
    for (const k of ["name", "role", "significance", "relationshipToPlayer"] as const) {
      if (typeof cc[k] !== "string" || (cc[k] as string).trim().length === 0)
        push("error", `cast[${i}].${k}`, `Missing or empty: ${k}`);
    }
    if (typeof cc.realPerson !== "boolean")
      push("error", `cast[${i}].realPerson`, "realPerson must be a boolean");
    if (!PORTRAIT_POLICIES.includes(cc.portraitPolicy as PortraitPolicy))
      push("error", `cast[${i}].portraitPolicy`,
        'portraitPolicy must be "documented_likeness", "period_artifact", or "stylized_plate"');

    // Light-touch accuracy warns (noisy is fine).
    if (cc.realPerson === true && typeof cc.name === "string" && looksLikeRole(cc.name))
      push("warn", `cast[${i}].name`,
        `realPerson is true but name "${cc.name}" reads like a representative role — verify it is a real named figure`);
    if (cc.realPerson === true && cc.portraitPolicy === "stylized_plate")
      push("warn", `cast[${i}].portraitPolicy`,
        "real named figure with stylized_plate — confirm no documented likeness or period artifact exists");
  });

  return f;
}

// ── Generation (reuses the same Anthropic plumbing as economy.ts) ───

const SYSTEM_PROMPT = `You are a historical-cast designer for standards-aligned history games in the Oregon Trail tradition. Given a single state standard (e.g. a TEKS code and its description), you propose the CAST of historical figures a "systems"-type campaign built on that standard would need — the real people (and clearly-labeled representative roles) the player encounters. In a systems campaign the player IS the historical process (the expedition, the project), not a named character.

You output ONLY a single JSON object. No prose, no markdown, no code fences.

ACCURACY LAW (this is an educational product — a teacher will verify every fact):
- PREFER REAL NAMED FIGURES where they exist, and name them accurately. A real figure (realPerson: true) must be a genuine historical individual with their actual name and an accurate role and significance.
- USE REPRESENTATIVE ROLES ONLY where no single named individual fits (e.g. "Irish labor foreman (representative)"). Mark these realPerson: false and label the name clearly as a type.
- NEVER FABRICATE. Do not invent a fake named person who did not exist and present them as real. Inventing a named historical individual is a banned output. When unsure whether a specific named person fits, use a representative role instead.

DESIGN PRINCIPLES:
1. DERIVE FROM THIS STANDARD'S REAL HISTORY. The cast must come from the actual people and roles central to THIS topic — not a generic set.
2. ESSENTIAL, NOT EXHAUSTIVE. Propose the 4–7 figures most essential to the standard's learning: the champion, the people who did the work, the opposition, the affected. Skip minor names.
3. EACH FIGURE EARNS THEIR PLACE. significance must say, in one sentence, what this person lets the player encounter or understand about the standard's history. relationshipToPlayer must say how the player (as the historical process) meets or deals with them.
4. SET portraitPolicy HONESTLY. "documented_likeness" when real portraits/photos plausibly exist; "period_artifact" when no portrait but period imagery does (effigy, coin, manuscript, engraving); "stylized_plate" when no period likeness exists and a consistent illustrated treatment is needed (most representative roles).

OUTPUT SHAPE (TypeScript for reference — output JSON only):
type PortraitPolicy = "documented_likeness" | "period_artifact" | "stylized_plate";
interface CastCharacter { name: string; realPerson: boolean; role: string; significance: string; relationshipToPlayer: string; portraitPolicy: PortraitPolicy; }
interface ProposedCast { campaignType: "systems"; cast: CastCharacter[]; }

RULES: campaignType is always the literal "systems". Provide 4–7 cast members. realPerson is true only for genuine named individuals. Representative roles have realPerson: false and a name clearly labeled as a type. Output ONLY the JSON object.`;

function buildUserMessage(standard: string): string {
  return `Propose the Stage 1 cast for a systems-type campaign built on THIS standard:

${standard}

Derive the cast from the real history of this specific standard. Prefer accurately-named real figures; use clearly-labeled representative roles only where no single named individual fits; never fabricate a fake named person. Keep the cast to the 4–7 figures most essential to the learning. Set portraitPolicy honestly.

Output ONLY the JSON object conforming to ProposedCast.`;
}

export interface GenerateCastResult {
  data: ProposedCast;
  raw: string;
  findings: CastFinding[];
}

export async function generateCast(
  standard: string,
  apiKey: string,
): Promise<GenerateCastResult> {
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

  const data = parseModelJson<ProposedCast>(rawText);
  const findings = validateCast(data);
  return { data, raw: rawText, findings };
}
