import Anthropic from "@anthropic-ai/sdk";
import { parseModelJson } from "./json.js";
import type { FlagDecl, FlagValue } from "./schema.js";

// ════════════════════════════════════════════════════════════════
// Stage 1 output: the MORAL FAULT LINE of a "character" campaign — the
// single defining choice that most determines WHO this person becomes.
// Pure data. No beats, events, UI, or wiring — this is the inspectable
// artifact a later character-campaign stage will consume to wire ONE
// persistent flag into events. Mirrors economy.ts / cast.ts discipline.
//
// It is the spine the way the Third Crusade's `coerced` is the spine of
// Hugh's arc: did you take the cross freely, or under compulsion? Set
// once by an early choice, never trivial, colors who the character is.
//
// NO-CLEAN-ANSWER LAW: a fault line is a genuine two-sided human dilemma.
// If one side is obviously "what a good person does," it is NOT a fault
// line. It is never a quiz answer (a historically correct pick), a
// resource (a meter), or a preference (it doesn't change who you are).
//
// MORAL-WEIGHT LAW: identity is a FLAG, never a SCORE. The setter writes
// only a flag value; it carries no resource reward. Narration describes
// human consequence, never quiz feedback ("you chose correctly").
// ════════════════════════════════════════════════════════════════

// Builds on the landed engine types (schema.ts) — reused verbatim, never
// replaced. `flag` is a real FlagDecl; values/writes/whenValue are real
// FlagValues. The richer fields below are the moral/pedagogical layer the
// engine does not store but the generator must reason through.

export interface FaultLineValue {
  /** A legal value for flag.type. */
  value: FlagValue;
  /** Who the character IS when the flag holds this value — human, not score. */
  meaning: string;
}

export interface FaultLineSetterOption {
  /** The player-facing option (becomes a Choice.text later). */
  choiceText: string;
  /** The flag value this option sets (becomes flagWrites: { [flag.id]: writes }). */
  writes: FlagValue;
  /** What choosing this says about the person — NEVER "correct"/"+points". */
  moralReading: string;
}

export interface FaultLineSetter {
  /** Where in the arc this fires — early, before the rest is lived in its shadow. */
  beat: string;
  /** The in-world moment the player faces. */
  situation: string;
  /** The options; ≥2, each writing a distinct flag value. */
  options: FaultLineSetterOption[];
}

export interface FaultLineReader {
  /** The later moment whose narration changes ("the army storms a Christian city"). */
  beat: string;
  /** Which flag value this variant responds to (a FlagText variant's `equals`). */
  whenValue: FlagValue;
  /** The changed narration — human consequence (becomes a FlagText variant's `text`). */
  narration: string;
}

export interface FaultLineSpec {
  campaignType: "character";
  /** One sentence: the two-sided question. */
  dilemma: string;
  /** What each side costs, and why neither is "right". */
  whyNoCleanAnswer: string;
  /** The persistent flag — a landed FlagDecl, reused verbatim. */
  flag: FlagDecl;
  /** Who the character is at each storable value. */
  values: FaultLineValue[];
  /** The one early defining choice that writes the flag. */
  setter: FaultLineSetter;
  /** ≥1 later beat whose narration changes by flag value. */
  readers: FaultLineReader[];
}

// ── Validation (mirrors generator/economy.ts discipline) ─────────

export interface FaultLineFinding {
  level: "error" | "warn";
  field: string;
  message: string;
}

const FLAG_TYPES = ["boolean", "tristate"] as const;
type FlagType = (typeof FLAG_TYPES)[number];

// A value is legal for a flag iff: tristate allows null|false|true,
// boolean allows only false|true. (Mirrors validate.ts flagValueLegal.)
function flagValueLegal(type: FlagType, v: unknown): boolean {
  if (type === "tristate") return v === null || v === true || v === false;
  return v === true || v === false;
}

// Stable key for set-membership over FlagValues (true | false | null).
function valueKey(v: FlagValue): string {
  return v === null ? "null" : String(v);
}

// Scorekeeping language that betrays a disguised right-answer / quiz. A
// moral field must read as human consequence, never feedback. Noisy is fine.
const SCOREKEEPING_RE =
  /correct answer|chose correctly|right answer|wrong answer|wrong choice|best choice|\boptimal\b|you (?:win|lose)\b|\+\s*\d+|\bpoints\b|\bscore\b/i;

// Setter options carry exactly these keys. Any extra key that names a
// resource/effect/reward means the option is trying to SCORE identity.
const ALLOWED_OPTION_KEYS = new Set(["choiceText", "writes", "moralReading"]);
const REWARDISH_KEY_RE = /effect|reward|resource|delta/i;

export function validateFaultLine(data: unknown): FaultLineFinding[] {
  const f: FaultLineFinding[] = [];
  const push = (level: "error" | "warn", field: string, message: string) =>
    f.push({ level, field, message });

  if (typeof data !== "object" || data === null) {
    push("error", "root", "Fault line is not an object");
    return f;
  }
  const d = data as Record<string, unknown>;

  if (d.campaignType !== "character")
    push("error", "campaignType", 'campaignType must be the literal "character"');

  for (const k of ["dilemma", "whyNoCleanAnswer"] as const) {
    if (typeof d[k] !== "string" || (d[k] as string).trim().length === 0)
      push("error", k, `${k} must be a non-empty string`);
  }
  if (typeof d.whyNoCleanAnswer === "string" && SCOREKEEPING_RE.test(d.whyNoCleanAnswer))
    push("warn", "whyNoCleanAnswer", "reads like quiz feedback — describe human cost, not a correct answer");

  // ── flag (a FlagDecl) ──
  const flag = d.flag as Record<string, unknown> | undefined;
  let flagType: FlagType | null = null;
  if (typeof flag !== "object" || flag === null) {
    push("error", "flag", "flag must be a FlagDecl object");
  } else {
    if (typeof flag.id !== "string" || (flag.id as string).trim().length === 0)
      push("error", "flag.id", "flag.id must be a non-empty string");
    if (!FLAG_TYPES.includes(flag.type as FlagType)) {
      push("error", "flag.type", 'flag.type must be "boolean" or "tristate"');
    } else {
      flagType = flag.type as FlagType;
      if (!flagValueLegal(flagType, flag.initial))
        push("error", "flag.initial", `flag.initial is not a legal value for a ${flagType} flag`);
    }
    if (flag.label !== undefined && typeof flag.label !== "string")
      push("error", "flag.label", "flag.label, if present, must be a string");
  }

  // ── values ──
  const values = d.values;
  if (!Array.isArray(values)) {
    push("error", "values", "values must be an array");
  } else {
    if (values.length < 2)
      push("error", "values", `values must describe both sides (≥2 entries, got ${values.length})`);
    values.forEach((v, i) => {
      const vv = v as Record<string, unknown>;
      if (typeof vv.meaning !== "string" || (vv.meaning as string).trim().length === 0)
        push("error", `values[${i}].meaning`, "Missing or empty: meaning");
      else if (SCOREKEEPING_RE.test(vv.meaning as string))
        push("warn", `values[${i}].meaning`, "reads like quiz feedback — describe who the person is, not a score");
      if (flagType && !flagValueLegal(flagType, vv.value))
        push("error", `values[${i}].value`, `value is not legal for a ${flagType} flag`);
    });
  }

  // ── setter ──
  const setter = d.setter as Record<string, unknown> | undefined;
  if (typeof setter !== "object" || setter === null) {
    push("error", "setter", "setter must be an object");
  } else {
    for (const k of ["beat", "situation"] as const) {
      if (typeof setter[k] !== "string" || (setter[k] as string).trim().length === 0)
        push("error", `setter.${k}`, `Missing or empty: ${k}`);
    }
    const options = setter.options;
    if (!Array.isArray(options)) {
      push("error", "setter.options", "setter.options must be an array");
    } else {
      if (options.length < 2)
        push("error", "setter.options", `a fault line needs ≥2 options (got ${options.length})`);
      const writeSet = new Set<string>();
      options.forEach((o, i) => {
        const oo = o as Record<string, unknown>;
        if (typeof oo.choiceText !== "string" || (oo.choiceText as string).trim().length === 0)
          push("error", `setter.options[${i}].choiceText`, "Missing or empty: choiceText");
        if (typeof oo.moralReading !== "string" || (oo.moralReading as string).trim().length === 0)
          push("error", `setter.options[${i}].moralReading`, "Missing or empty: moralReading");
        else if (SCOREKEEPING_RE.test(oo.moralReading as string))
          push("warn", `setter.options[${i}].moralReading`, "reads like quiz feedback — say what the choice means about the person, not whether it was right");
        if (flagType && !flagValueLegal(flagType, oo.writes))
          push("error", `setter.options[${i}].writes`, `writes is not legal for a ${flagType} flag`);
        else if (flagType)
          writeSet.add(valueKey(oo.writes as FlagValue));
        // MORAL-WEIGHT LAW: identity is a flag, never a score. An option
        // must not carry a resource reward/effect of any kind.
        for (const key of Object.keys(oo)) {
          if (!ALLOWED_OPTION_KEYS.has(key) && REWARDISH_KEY_RE.test(key))
            push("error", `setter.options[${i}].${key}`,
              "setter option must not carry a resource reward — identity is a flag, not a score");
        }
      });
      if (flagType && writeSet.size < 2)
        push("error", "setter.options",
          "options must write ≥2 DISTINCT flag values (a fault line with one outcome is not a fault line)");
    }
  }

  // ── readers ──
  const readers = d.readers;
  if (!Array.isArray(readers)) {
    push("error", "readers", "readers must be an array");
  } else {
    if (readers.length < 1)
      push("error", "readers", "a fault line needs ≥1 reader (a later beat that changes)");
    readers.forEach((r, i) => {
      const rr = r as Record<string, unknown>;
      for (const k of ["beat", "narration"] as const) {
        if (typeof rr[k] !== "string" || (rr[k] as string).trim().length === 0)
          push("error", `readers[${i}].${k}`, `Missing or empty: ${k}`);
      }
      if (typeof rr.narration === "string" && SCOREKEEPING_RE.test(rr.narration))
        push("warn", `readers[${i}].narration`, "reads like quiz feedback — narrate human consequence, not a verdict");
      if (flagType && !flagValueLegal(flagType, rr.whenValue))
        push("error", `readers[${i}].whenValue`, `whenValue is not legal for a ${flagType} flag`);
    });
  }

  return f;
}

// ── Generation (reuses the same Anthropic plumbing as economy.ts) ─

const SYSTEM_PROMPT = `You are a narrative designer for standards-aligned history games. Given a single state standard and the SPECIFIC PERSON whose eyes the player sees through, you identify the ONE MORAL FAULT LINE of that character's story — the single defining choice that most determines WHO this person becomes — and express it as one persistent flag.

You output ONLY a single JSON object. No prose, no markdown, no code fences.

WHAT A FAULT LINE IS. It is the spine of the character's whole arc, the way "did you take the cross freely, or under compulsion?" is the spine of a crusading knight's. It is set ONCE by an early choice, it is never trivial, and it colors who the character fundamentally is for the rest of the campaign.

THE METHOD — reason through these five steps for THIS person:
1. NAME THE PRESSURE. Name the real historical force this specific person stood inside — the structural pressure their life was caught in. The fault line is born from that pressure; never invent a generic one.
2. FIND THE SELF-DEFINING MOMENT. Find the moment that pressure forced a decision about IDENTITY — not a logistics decision (what to pack, which road), but one where the person had to act and the action settled who they were. It happens EARLY, because the rest of the arc is lived in its shadow.
3. STATE IT TWO-SIDED. State it as a question where BOTH sides are human and costly. One side preserves something at the price of something else; the other preserves the other thing at the reverse price. You must be able to name what each side costs.
4. THE NEGATIVE TEST — THIS IS THE ONE THAT MATTERS. Ask: could you write a sympathetic, non-condemning account of a real person who chose EITHER side? If one side is obviously "what a good person does," you have NOT found the fault line — discard it and look again. A clean answer is automatic failure. Reject anything that is really (a) a quiz answer with a historically correct pick, (b) a resource/meter to optimize, or (c) a preference that doesn't change who the person IS.
5. ANCHOR IN THE PERIOD. Both sides must be choices a real person of that time and place actually faced — authentic to the history, never a modern projection onto it.

MORAL-WEIGHT LAW (non-negotiable):
- IDENTITY IS A FLAG, NEVER A SCORE. The setter writes ONLY a flag value. A setter option must carry NO resource reward, effect, points, or delta of any kind. Who-you-are is structurally separate from how-you're-doing.
- NEVER LABEL A SIDE CORRECT. moralReading says what choosing an option means ABOUT THE PERSON; it never says the choice was right, wrong, best, or optimal. Reader narration describes HUMAN CONSEQUENCE, never quiz feedback.
- For the gravest topics the dilemma IS the weight. Handle it with gravity: real cost on both sides, no "you chose correctly."

THE FLAG. flag.initial is the character's state BEFORE the setter fires — and at the start of a fault-line campaign the defining choice has not yet happened, so the honest pre-state is "unset". Therefore DEFAULT TO A TRISTATE with initial: null (the setter then writes true or false). Use a boolean ONLY when one side is genuinely the character's default/unmarked condition before they ever choose, and set initial to that side (false or true). NEVER use null as the initial of a boolean flag — null is a tristate-only value; a boolean initial must be false or true.

OUTPUT SHAPE (TypeScript for reference — output JSON only):
type FlagValue = boolean | null;
interface FlagDecl { id: string; type: "boolean" | "tristate"; initial: FlagValue; label?: string; }
interface FaultLineValue { value: FlagValue; meaning: string; }
interface FaultLineSetterOption { choiceText: string; writes: FlagValue; moralReading: string; }
interface FaultLineSetter { beat: string; situation: string; options: FaultLineSetterOption[]; }
interface FaultLineReader { beat: string; whenValue: FlagValue; narration: string; }
interface FaultLineSpec { campaignType: "character"; dilemma: string; whyNoCleanAnswer: string; flag: FlagDecl; values: FaultLineValue[]; setter: FaultLineSetter; readers: FaultLineReader[]; }

RULES: campaignType is always the literal "character". flag.type is exactly "boolean" or "tristate". Provide one value meaning per side (≥2). setter.options has ≥2 options writing ≥2 DISTINCT flag values, and NO option carries any resource reward/effect. Provide ≥1 reader. Output ONLY the JSON object conforming to FaultLineSpec.`;

function buildUserMessage(standard: string, perspective: string, topic?: string): string {
  // The descriptive SUBJECT (when provided) is authoritative; the code is
  // supporting metadata. Empty topic ⇒ "STANDARD: ${standard}" (byte-identical).
  const subjectBlock = topic && topic.trim()
    ? `SUBJECT (authoritative — what this campaign is about): ${topic}\nSTANDARD (supporting reference / alignment code): ${standard}`
    : `STANDARD: ${standard}`;
  return `Identify the ONE moral fault line for a character campaign built on THIS standard, played through THIS person's eyes:

${subjectBlock}

PLAYER PERSPECTIVE (whose eyes — the fault line depends on this): ${perspective}

Work the five-step method for THIS specific person. Apply the negative test ruthlessly: if either side is the obvious "good" choice, you have the wrong fault line — find the real one, where a sympathetic person could go either way. Set it with one early defining choice (≥2 options, each writing a distinct flag value, none carrying a resource reward), and give at least one later beat whose narration changes by the flag's value. Keep the moral weight: human cost on both sides, never a verdict.

Output ONLY the JSON object conforming to FaultLineSpec.`;
}

export interface GenerateFaultLineResult {
  data: FaultLineSpec;
  raw: string;
  findings: FaultLineFinding[];
}

export async function generateFaultLine(
  standard: string,
  perspective: string,
  apiKey: string,
  topic?: string,
): Promise<GenerateFaultLineResult> {
  const client = new Anthropic({ apiKey });

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(standard, perspective, topic) }],
  });

  let rawText = "";
  stream.on("text", (t) => { rawText += t; });
  await stream.finalMessage();

  const data = parseModelJson<FaultLineSpec>(rawText);
  const findings = validateFaultLine(data);
  return { data, raw: rawText, findings };
}
