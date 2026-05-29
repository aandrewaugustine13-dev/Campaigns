import Anthropic from "@anthropic-ai/sdk";

// ════════════════════════════════════════════════════════════════
// Stage 1 output: the ECONOMY + RATING RUBRIC for a "systems" campaign.
// Pure data. No beats, choices, UI, or wiring — this is the inspectable
// artifact produced from a TEKS standard before any game exists.
// ════════════════════════════════════════════════════════════════

export type ResourceLevel = "low" | "moderate" | "high";

export interface EconomyResource {
  /** Internal/design name for the resource. */
  name: string;
  /** Short label a 6th grader sees on the HUD. */
  playerFacing: string;
  /** One sentence: what this resource represents in the real history. */
  description: string;
  /** Qualitative starting level. Magnitudes are a later stage's concern. */
  startsAt: ResourceLevel;
  /** Kinds of choices that increase it. */
  raisedBy: string;
  /** What depletes it. */
  drainedBy: string;
  /** What visibly gets worse as it runs low — never "game over". */
  degradationEffect: string;
}

export interface RatingBand {
  /** Short band name, e.g. "Exemplary", "Mixed", "Poor". */
  label: string;
  /** What a run in this band looked like, in terms of historical understanding. */
  description: string;
}

export interface RatingRubric {
  /** How the end rating forms from resources + key choices, tied to learningObjective. */
  basis: string;
  /** Bands ordered best→worst, described as historical understanding, not score. */
  bands: RatingBand[];
}

export interface SystemsEconomy {
  campaignType: "systems";
  /** One plain sentence: the historical causal idea the standard is really about. */
  learningObjective: string;
  /** 2–4 resources that are the real stakes of THIS standard. */
  resources: EconomyResource[];
  ratingRubric: RatingRubric;
}

// ── Validation (mirrors generator/validate.ts discipline) ────────

export interface EconomyFinding {
  level: "error" | "warn";
  field: string;
  message: string;
}

const LEVELS: ResourceLevel[] = ["low", "moderate", "high"];

export function validateEconomy(data: unknown): EconomyFinding[] {
  const f: EconomyFinding[] = [];
  const push = (level: "error" | "warn", field: string, message: string) =>
    f.push({ level, field, message });

  if (typeof data !== "object" || data === null) {
    push("error", "root", "Economy is not an object");
    return f;
  }
  const d = data as Record<string, unknown>;

  if (d.campaignType !== "systems")
    push("error", "campaignType", 'campaignType must be the literal "systems"');
  if (typeof d.learningObjective !== "string" || (d.learningObjective as string).trim().length === 0)
    push("error", "learningObjective", "learningObjective must be a non-empty string");

  const resources = d.resources;
  if (!Array.isArray(resources)) {
    push("error", "resources", "resources must be an array");
  } else {
    if (resources.length < 2 || resources.length > 4)
      push("error", "resources", `resources must have 2–4 entries (got ${resources.length})`);
    resources.forEach((r, i) => {
      const rr = r as Record<string, unknown>;
      for (const k of ["name", "playerFacing", "description", "raisedBy", "drainedBy", "degradationEffect"] as const) {
        if (typeof rr[k] !== "string" || (rr[k] as string).trim().length === 0)
          push("error", `resources[${i}].${k}`, `Missing or empty: ${k}`);
      }
      if (!LEVELS.includes(rr.startsAt as ResourceLevel))
        push("error", `resources[${i}].startsAt`, 'startsAt must be "low", "moderate", or "high"');
      const deg = (rr.degradationEffect as string) || "";
      if (/game over|lose the game|locked out|fail the game|cannot continue|run ends/i.test(deg))
        push("warn", `resources[${i}].degradationEffect`,
          "degradationEffect implies termination — resources must degrade, never end the run");
    });
  }

  const rubric = d.ratingRubric as Record<string, unknown> | undefined;
  if (typeof rubric !== "object" || rubric === null) {
    push("error", "ratingRubric", "ratingRubric must be an object");
  } else {
    if (typeof rubric.basis !== "string" || (rubric.basis as string).trim().length === 0)
      push("error", "ratingRubric.basis", "ratingRubric.basis must be a non-empty string");
    if (!Array.isArray(rubric.bands) || (rubric.bands as unknown[]).length < 2) {
      push("error", "ratingRubric.bands", "ratingRubric.bands must have at least 2 bands");
    } else {
      (rubric.bands as unknown[]).forEach((b, i) => {
        const bb = b as Record<string, unknown>;
        if (typeof bb.label !== "string" || (bb.label as string).trim().length === 0)
          push("error", `ratingRubric.bands[${i}].label`, "Missing band label");
        if (typeof bb.description !== "string" || (bb.description as string).trim().length === 0)
          push("error", `ratingRubric.bands[${i}].description`, "Missing band description");
      });
    }
  }

  return f;
}

// ── Generation (reuses the same Anthropic plumbing as core.ts) ───

const SYSTEM_PROMPT = `You are an instructional systems designer for standards-aligned history games in the Oregon Trail tradition. Given a single state standard (e.g. a TEKS code and its description), you define the ECONOMY and RATING RUBRIC for a "systems"-type campaign — one the player manages across the whole run, where the player IS the historical process (the expedition, the project), not a named character.

You output ONLY a single JSON object. No prose, no markdown, no code fences.

NON-NEGOTIABLE PRINCIPLES:
1. RESOURCES ARE THE REAL STAKES OF THIS STANDARD. Derive 2–4 resources from what THIS specific historical endeavor actually had to manage. Never default to a generic food/gold/health set. If the standard is about a diplomatic process, the resources are the levers of that process; if it is about an engineering project, they are the real constraints of that project. Research the actual causal logic of this topic.
2. THE LEARNING OBJECTIVE IS THE POINT OF THE STANDARD. State, in one plain sentence a 6th grader could read, the historical CAUSAL idea the standard is really about (e.g. for Lewis & Clark: "the expedition's survival depended on cooperation with the Native nations whose land it crossed"). This is the spine the rating measures.
3. RESOURCES DEGRADE, THEY NEVER TERMINATE. As a resource runs low, choices get harder and outcomes grimmer — but the run ALWAYS reaches the end. The player cannot lose, be locked out, or hit "game over". degradationEffect must describe visible friction, never termination.
4. THE RATING MEASURES HISTORICAL UNDERSTANDING, NOT MIN-MAXING. The rubric must reward choices that tracked the real historical causal logic the standard is about. A top run is one where the player understood the actual dynamics; a poor run is one where they fought against them. Describe bands in terms of understanding, not points or optimization.

OUTPUT SHAPE (TypeScript for reference — output JSON only):
type ResourceLevel = "low" | "moderate" | "high";
interface EconomyResource { name: string; playerFacing: string; description: string; startsAt: ResourceLevel; raisedBy: string; drainedBy: string; degradationEffect: string; }
interface RatingBand { label: string; description: string; }
interface RatingRubric { basis: string; bands: RatingBand[]; }
interface SystemsEconomy { campaignType: "systems"; learningObjective: string; resources: EconomyResource[]; ratingRubric: RatingRubric; }

RULES: campaignType is always the literal "systems". Provide 2–4 resources. startsAt is qualitative ONLY — exactly one of "low", "moderate", or "high" (never a number). Provide at least 3 rating bands ordered best to worst. Output ONLY the JSON object.`;

function buildUserMessage(standard: string): string {
  return `Define the Stage 1 economy and rating rubric for a systems-type campaign built on THIS standard:

${standard}

Derive the resources from the real causal logic of this specific standard. Make the learning objective the genuine point of the standard. Ensure every resource can degrade but never ends the run. Tie the rating bands to historical understanding, not score optimization.

Output ONLY the JSON object conforming to SystemsEconomy.`;
}

export interface GenerateEconomyResult {
  data: SystemsEconomy;
  raw: string;
  findings: EconomyFinding[];
}

export async function generateEconomy(
  standard: string,
  apiKey: string,
): Promise<GenerateEconomyResult> {
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

  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  const data = JSON.parse(cleaned) as SystemsEconomy;
  const findings = validateEconomy(data);
  return { data, raw: rawText, findings };
}
