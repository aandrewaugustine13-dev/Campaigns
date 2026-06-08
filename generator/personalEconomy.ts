import Anthropic from "@anthropic-ai/sdk";
import { parseModelJson } from "./json.js";

// ════════════════════════════════════════════════════════════════
// CHARACTER-mode economy: a small, CONCRETE, PERSONAL resource set —
// the "Okie with $20" model. Where a systems campaign tracks abstract
// macro-forces (federalResolve, coalitionStrength…), a character lives
// on tangible, personal stakes they can watch move: cash they spend,
// the larder, their standing on the street. These are VISIBLE in play
// (unlike the family/community relationship tracks, which accumulate
// invisibly and surface only in the closing reckoning).
//
// Hard contract, distinct from generator/economy.ts (which is left
// byte-untouched and remains the systems path):
//   - EXACTLY ONE money resource (spendable cash; depletes when spent).
//   - 2–3 resources total (money + 1–2 campaign-fit concrete things).
//   - A NON-money `primaryResource` is named as the eventual
//     primaryResourceKey — money is NEVER the graded "win condition"
//     (hoarding cash must not read as a high score; that inverts the
//     whole moral model).
//   - No resource named "morale" (the engine has a morale==0 fail
//     special-case), and resources are MATERIAL stakes, not life/health
//     meters — a character must never "die" of a low bar.
// ════════════════════════════════════════════════════════════════

export type ResourceLevel = "low" | "moderate" | "high";

export interface PersonalResource {
  /** Internal/design name; a stable camelCase key is derived from it. */
  name: string;
  /** Short label the player sees on the HUD (e.g. "Cash", "The Larder"). */
  playerFacing: string;
  /** One sentence: what this is in THIS person's day-to-day life. */
  description: string;
  /** Qualitative starting level. Magnitudes are the campaign stage's concern. */
  startsAt: ResourceLevel;
  /** Kinds of choices that raise it. */
  raisedBy: string;
  /** What spends/depletes it. */
  drainedBy: string;
  /** What gets visibly harder as it runs low — never "game over". */
  degradationEffect: string;
  /** Exactly one resource sets this true: the spendable cash meter. */
  isMoney?: boolean;
}

export interface PersonalEconomy {
  campaignType: "character";
  /** One plain sentence: this person's concrete material stakes day to day. */
  premise: string;
  /** 2–3 resources: exactly one money + 1–2 campaign-fit concrete personal ones. */
  resources: PersonalResource[];
  /** The NON-money resource that becomes primaryResourceKey. Never the money one. */
  primaryResource: string;
}

// ── Validation (mirrors generator/economy.ts discipline) ─────────

export interface PersonalEconomyFinding {
  level: "error" | "warn";
  field: string;
  message: string;
}

const LEVELS: ResourceLevel[] = ["low", "moderate", "high"];

export function validatePersonalEconomy(data: unknown): PersonalEconomyFinding[] {
  const f: PersonalEconomyFinding[] = [];
  const push = (level: "error" | "warn", field: string, message: string) =>
    f.push({ level, field, message });

  if (typeof data !== "object" || data === null) {
    push("error", "root", "Personal economy is not an object");
    return f;
  }
  const d = data as Record<string, unknown>;

  if (d.campaignType !== "character")
    push("error", "campaignType", 'campaignType must be the literal "character"');
  if (typeof d.premise !== "string" || (d.premise as string).trim().length === 0)
    push("error", "premise", "premise must be a non-empty string");

  const resources = d.resources;
  let moneyName: string | undefined;
  if (!Array.isArray(resources)) {
    push("error", "resources", "resources must be an array");
  } else {
    if (resources.length < 2 || resources.length > 3)
      push("error", "resources", `resources must have 2–3 entries (money + 1–2), got ${resources.length}`);
    let moneyCount = 0;
    resources.forEach((r, i) => {
      const rr = r as Record<string, unknown>;
      for (const k of ["name", "playerFacing", "description", "raisedBy", "drainedBy", "degradationEffect"] as const) {
        if (typeof rr[k] !== "string" || (rr[k] as string).trim().length === 0)
          push("error", `resources[${i}].${k}`, `Missing or empty: ${k}`);
      }
      if (!LEVELS.includes(rr.startsAt as ResourceLevel))
        push("error", `resources[${i}].startsAt`, 'startsAt must be "low", "moderate", or "high"');
      if (typeof rr.name === "string" && rr.name.trim().toLowerCase() === "morale")
        push("error", `resources[${i}].name`, 'resource must not be named "morale" (engine fail special-case)');
      if (rr.isMoney === true) { moneyCount++; moneyName = rr.name as string; }
      const deg = (rr.degradationEffect as string) || "";
      if (/game over|lose the game|locked out|fail the game|cannot continue|run ends|dies?|death/i.test(deg))
        push("error", `resources[${i}].degradationEffect`,
          "degradationEffect implies termination/death — personal resources degrade, never end the run or kill the character");
    });
    if (moneyCount !== 1)
      push("error", "resources", `exactly ONE resource must have isMoney:true (got ${moneyCount})`);
  }

  // primaryResource: a NON-money resource present in the set (never money).
  if (typeof d.primaryResource !== "string" || (d.primaryResource as string).trim().length === 0) {
    push("error", "primaryResource", "primaryResource must name the non-money anchor resource");
  } else if (Array.isArray(resources)) {
    const names = resources.map((r) => (r as Record<string, unknown>).name);
    if (!names.includes(d.primaryResource))
      push("error", "primaryResource", `primaryResource "${d.primaryResource}" is not one of the resources`);
    if (d.primaryResource === moneyName)
      push("error", "primaryResource", "primaryResource must NOT be the money resource (cash is never the graded win condition)");
  }

  return f;
}

// ── Generation (reuses the same Anthropic plumbing as economy.ts) ─

const SYSTEM_PROMPT = `You are a narrative-systems designer for standards-aligned history games. Given a single state standard and the PERSPECTIVE of one ordinary person living through it, you define a SMALL, CONCRETE, PERSONAL economy — the tangible material stakes that person manages day to day. Think "the Okie family with $20 and a failing truck", not abstract political forces.

You output ONLY a single JSON object. No prose, no markdown, no code fences.

NON-NEGOTIABLE PRINCIPLES:
1. CONCRETE AND PERSONAL, NOT ABSTRACT MACRO-FORCES. The resources are things THIS person can hold, spend, lose, or feel in their own life — cash, the larder/food stores, tools or livestock, their standing on the street, a roof over the family. NEVER abstract collective meters like "federal resolve", "coalition strength", or "political will" — those belong to a systems campaign, not a person.
2. EXACTLY ONE MONEY RESOURCE. One resource is spendable cash (isMoney: true): it depletes when spent and is the player's immediate, visible budget. Name it plainly for the era ("Cash", "Savings", "Coins", "Dollars").
3. SMALL: money + ONE or TWO others, 2–3 total. A person tracks a few concrete things, not a dashboard. Pick the 1–2 non-money resources that genuinely fit THIS campaign's life (a sharecropper's larder and standing; a millworker's savings and health-of-the-tools; a migrant's cash and the truck).
4. CASH IS NOT A SCORE. Money is spent to live and to help others — running low is friction, not failure, and ending rich is NOT "winning". Name a NON-money resource as primaryResource (the eventual graded anchor). The money resource must never be primaryResource.
5. NO DEATH-BY-BAR — EVEN FOR WAR, SIEGE, BATTLE, OR VIOLENT TOPICS. Personal resources degrade into HARDSHIP, never into "game over," death, or the character being killed/captured. degradationEffect is visible friction — harder choices, worse terms, hunger, exhaustion, lost standing — never termination or a wound that kills. Lethal stakes are real in these histories, but they live in EVENT outcomes and narration, NOT in a personal resource bar. For a war/violent topic, do NOT model a "health"/"wounds"/"life" bar whose emptying = death; instead model the cost that persists — e.g. a soldier's Condition degrades fresh → exhausted → barely standing, narrowing options and making choices harder but never killing him; a family's Shelter or Larder erodes under bombardment. Do NOT name any resource "morale". A character must never die of a low bar.

OUTPUT SHAPE (TypeScript for reference — output JSON only):
type ResourceLevel = "low" | "moderate" | "high";
interface PersonalResource { name: string; playerFacing: string; description: string; startsAt: ResourceLevel; raisedBy: string; drainedBy: string; degradationEffect: string; isMoney?: boolean; }
interface PersonalEconomy { campaignType: "character"; premise: string; resources: PersonalResource[]; primaryResource: string; }

RULES: campaignType is always the literal "character". Provide 2–3 resources, exactly one with isMoney:true. startsAt is qualitative ONLY. primaryResource names one of the NON-money resources. Output ONLY the JSON object.`;

function buildUserMessage(standard: string, perspective: string, topic?: string, priorErrors?: string[]): string {
  const subjectBlock = topic && topic.trim()
    ? `SUBJECT (authoritative — what this campaign is about): ${topic}\nSTANDARD (supporting reference / alignment code): ${standard}`
    : standard;
  // On a self-retry, the previous spec's exact validator errors are fed back so
  // the model corrects THOSE specific failures rather than redrawing blind.
  const feedback = priorErrors && priorErrors.length
    ? `\n\nYOUR PREVIOUS SPEC FAILED THESE VALIDATION CHECKS. Fix EVERY one — re-author the offending field(s) so it passes, keeping the rest faithful to the rules above:\n${priorErrors.map((e) => `- ${e}`).join("\n")}\n`
    : "";
  return `Define the small, concrete, PERSONAL economy for a character-type campaign built on THIS standard, lived through THIS person's eyes:

${subjectBlock}

PERSPECTIVE (whose life these stakes belong to): ${perspective}

Give this person money (one spendable cash resource) plus one or two concrete things that genuinely fit their daily life under this history. Keep it personal and material — what they can hold, spend, and lose — never abstract political forces. Name a non-money resource as primaryResource. Cash is spent to live, never a win condition.
${feedback}
Output ONLY the JSON object conforming to PersonalEconomy.`;
}

export interface GeneratePersonalEconomyResult {
  data: PersonalEconomy;
  raw: string;
  findings: PersonalEconomyFinding[];
}

// Total proposer attempts: the first draw + up to (N-1) sighted self-retries.
// Capped so a model that can't converge can't loop forever — after the cap the
// last attempt is returned with its findings surfaced, so the caller still sees
// what failed (recover-then-surface, never spin).
const MAX_ECONOMY_ATTEMPTS = 3;

export async function generatePersonalEconomy(
  standard: string,
  perspective: string,
  apiKey: string,
  topic?: string,
): Promise<GeneratePersonalEconomyResult> {
  const client = new Anthropic({ apiKey });
  let last!: GeneratePersonalEconomyResult;
  let priorErrors: string[] = [];

  // SELF-VALIDATE-AND-RETRY: a spec that violates its OWN rules (e.g. a lethal
  // degradationEffect on a war topic) is caught and re-authored here, UPSTREAM,
  // so it never enters the campaign-generation loop — which is structurally
  // powerless to fix a frozen input spec. Prefer recover (re-author with the
  // errors fed back) over refuse (just returning the broken spec).
  for (let attempt = 1; attempt <= MAX_ECONOMY_ATTEMPTS; attempt++) {
    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(standard, perspective, topic, attempt > 1 ? priorErrors : undefined) }],
    });

    let rawText = "";
    stream.on("text", (t) => { rawText += t; });
    await stream.finalMessage();

    const data = parseModelJson<PersonalEconomy>(rawText);
    const findings = validatePersonalEconomy(data);
    last = { data, raw: rawText, findings };

    const errs = findings.filter((f) => f.level === "error");
    if (errs.length === 0) {
      if (attempt > 1) console.log(`[personal-economy] recovered clean on attempt ${attempt}/${MAX_ECONOMY_ATTEMPTS}`);
      return last;
    }

    console.warn(`[personal-economy] attempt ${attempt}/${MAX_ECONOMY_ATTEMPTS}: ${errs.length} error${errs.length === 1 ? "" : "s"} — ${attempt < MAX_ECONOMY_ATTEMPTS ? "re-authoring with errors fed back" : "cap reached, surfacing findings"}`);
    for (const f of errs) console.warn(`[personal-economy]   [${f.field}] ${f.message}`);
    priorErrors = errs.map((f) => `[${f.field}] ${f.message}`);
  }

  // Capped out without converging — return the last attempt; findings are
  // non-empty so the caller (and the delivery gate) still sees the failure.
  return last;
}
