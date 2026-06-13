#!/usr/bin/env npx tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
// ════════════════════════════════════════════════════════════════
// EVAL HARNESS — Tier 1 deterministic + Tier 2 model-graded + Tier 3 metrics
//
// Executes the rubric in docs/RUBRIC.md against the fixed test set
// (7 rubric topics + Pearl Harbor, the short-event timeline case):
// generates each campaign via generateValidatedCampaign
// (the real delivery gate, maxRegen=2 so the attempts metric is
// meaningful), consolidates the existing validator findings into
// named pass/warn/fail dimensions, adds the two NEW deterministic
// checks (Flesch-Kincaid reading level, prose length bounds), runs
// the five Tier-2 model-graded checks (quote-or-NONE prompt shape;
// cheap grader for most, stronger grader for factual accuracy —
// the generator NEVER grades its own homework), and logs
// cost/time/tokens/attempts per generation.
//
// The harness OBSERVES — it never modifies generation. Token usage
// is captured by instrumenting the Anthropic SDK's Messages
// prototype in THIS process only (production code is untouched).
//
// Run:      npx tsx generator/eval-harness.ts                 (full set)
//           npx tsx generator/eval-harness.ts --topics erie,crusade
//           npx tsx generator/eval-harness.ts --skip-grade    (Tier 1+3 only)
// Grade:    npx tsx generator/eval-harness.ts grade           (re-grade latest run's
//           npx tsx generator/eval-harness.ts grade <run.json>  saved campaigns — no
//                                                               regeneration cost)
// Compare:  npx tsx generator/eval-harness.ts compare         (last two runs)
//           npx tsx generator/eval-harness.ts compare a.json b.json
// Check:    npx tsx generator/eval-harness.ts check <campaign.json> [grade]
//           (free Tier-1-only debug on one campaign file)
//
// Outputs (history is KEPT, never overwritten):
//   eval-runs/YYYY-MM-DD-HHMM.json   full machine-readable results
//   eval-runs/YYYY-MM-DD-HHMM.md     human-readable scorecard report
// ════════════════════════════════════════════════════════════════
import { config as loadEnv } from "dotenv";
import { execSync } from "child_process";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { generateFrame } from "./frame.js";
import { generatePersonalEconomy } from "./personalEconomy.js";
import { generateCast } from "./cast.js";
import { generateFaultLine } from "./faultline.js";
import {
  generateValidatedCampaign,
  type GenerateInputs,
  type GenerateValidatedResult,
  type DeliveryFinding,
} from "./core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const __root = resolve(__dirname, "..");
loadEnv({ path: resolve(__root, ".env.local") });

const EVAL_DIR = resolve(__root, "eval-runs");

// ── Pricing ($ per million tokens; cache write 1.25x input, cache
// read 0.1x input). The generator runs on sonnet; Tier-2 graders use
// haiku (cheap) and opus (stronger, factual-accuracy only).
const PRICING = {
  model: "claude-sonnet-4-6",
  inputPerM: 3.0,
  outputPerM: 15.0,
  cacheWritePerM: 3.75,
  cacheReadPerM: 0.3,
};

const GRADER_CHEAP = "claude-haiku-4-5";
const GRADER_STRONG = "claude-opus-4-8";

const MODEL_PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  "claude-sonnet-4-6": { inputPerM: 3.0, outputPerM: 15.0 },
  "claude-haiku-4-5": { inputPerM: 1.0, outputPerM: 5.0 },
  "claude-opus-4-8": { inputPerM: 5.0, outputPerM: 25.0 },
};

function priceFor(model: string): { inputPerM: number; outputPerM: number } {
  const key = Object.keys(MODEL_PRICING).find((k) => (model ?? "").startsWith(k));
  return key ? MODEL_PRICING[key] : { inputPerM: PRICING.inputPerM, outputPerM: PRICING.outputPerM };
}

// ════════════════════════════════════════════════════════════════
// SDK INSTRUMENTATION — observe token usage without touching the
// generator. Every generator module calls client.messages.stream();
// we wrap the Messages prototype so each call's final usage lands in
// the collector, tagged with whatever stage the harness set.
// ════════════════════════════════════════════════════════════════
interface ApiCallRecord {
  stage: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  seconds: number;
}

const collector: { stage: string; calls: ApiCallRecord[] } = { stage: "?", calls: [] };

function recordUsage(stage: string, model: string, usage: any, seconds: number) {
  collector.calls.push({
    stage,
    model: model ?? PRICING.model,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    seconds,
  });
}

function instrumentSdk() {
  const MessagesProto = (Anthropic as any).Messages?.prototype;
  if (!MessagesProto?.stream) {
    console.warn("⚠ Could not instrument SDK (Messages.prototype.stream missing) — token metrics will be zero.");
    return;
  }
  const origStream = MessagesProto.stream;
  MessagesProto.stream = function (...args: any[]) {
    const stage = collector.stage;
    const t0 = Date.now();
    const stream = origStream.apply(this, args);
    stream.on("finalMessage", (msg: any) => {
      recordUsage(stage, msg?.model, msg?.usage, (Date.now() - t0) / 1000);
    });
    return stream;
  };
  const origCreate = MessagesProto.create;
  MessagesProto.create = function (...args: any[]) {
    const stage = collector.stage;
    const t0 = Date.now();
    const result = origCreate.apply(this, args);
    if (result && typeof result.then === "function") {
      result.then((msg: any) => {
        if (msg?.usage) recordUsage(stage, msg?.model, msg.usage, (Date.now() - t0) / 1000);
      }).catch(() => {});
    }
    return result;
  };
}

function costUSD(calls: ApiCallRecord[]): number {
  return calls.reduce((sum, c) => {
    const p = priceFor(c.model);
    return sum +
      (c.inputTokens * p.inputPerM +
        c.outputTokens * p.outputPerM +
        c.cacheWriteTokens * p.inputPerM * 1.25 +
        c.cacheReadTokens * p.inputPerM * 0.1) / 1_000_000;
  }, 0);
}

// ════════════════════════════════════════════════════════════════
// TEST SET — the rubric's fixed 7 topics plus Pearl Harbor (the
// short, compressed event that exercises timeline-coherence).
// Topic/era/mode come from
// the rubric; the standard strings and grades are the harness's
// canonical inputs (Erie and Lewis & Clark reuse the repo's existing
// canonical input sets verbatim; Montgomery and Dust Bowl reuse the
// batch-frontier-probe standards).
// ════════════════════════════════════════════════════════════════
interface TopicSpec {
  key: string;
  label: string;
  mode: "character" | "systems";
  topic: string;
  standard: string;
  grade: string;
  // fallback perspective when the frame stage proposes a non-character
  // type for a character-mode topic (same forcing pattern as the probes)
  role?: string;
  description?: string;
  // full locked Stage-1 inputs (Erie fixture path)
  lockedInputs?: Partial<GenerateInputs>;
}

const erieFixture = JSON.parse(readFileSync(resolve(__root, "fixtures/erie.json"), "utf8"));

const TEST_SET: TopicSpec[] = [
  {
    key: "pullman", label: "Pullman", mode: "character",
    topic: "The Pullman Strike of 1894", grade: "8th grade",
    standard: "The Pullman Strike of 1894: railroad labor, the company town, the national boycott, and federal intervention in the Gilded Age",
    role: "A Pullman railcar worker in the 1894 strike",
    description: "A worker in the Pullman company town weighing whether to strike, hold the line under federal pressure, or cross.",
  },
  {
    key: "montgomery", label: "Montgomery", mode: "character",
    topic: "The Montgomery Bus Boycott", grade: "8th grade",
    standard: "The Civil Rights Movement: the Montgomery Bus Boycott and everyday courage in 1955 Alabama",
    role: "A Black domestic worker in 1955 Montgomery",
    description: "A bus-riding domestic worker deciding daily whether to walk, organize, and hold out across the 381-day boycott.",
  },
  {
    key: "war1812", label: "War of 1812", mode: "character",
    topic: "The War of 1812", grade: "8th grade",
    standard: "The War of 1812: impressment and the road to war, the burning of Washington, Fort McHenry, and what the war settled for the young republic",
    role: "A young militiaman in the War of 1812",
    description: "A state militiaman serving through invasion scares, supply failures, and the defense of his home region.",
  },
  {
    // Short, compressed event — the positive test case for
    // timeline-coherence. The generator picks its own totalDays /
    // daysPerTurn from the standard; that timescale choice is exactly
    // what this topic exists to exercise.
    key: "pearlharbor", label: "Pearl Harbor", mode: "character",
    topic: "The Attack on Pearl Harbor", grade: "8th grade",
    standard: "World War II: the December 7, 1941 attack on Pearl Harbor and the United States' entry into the Second World War",
    role: "A U.S. sailor stationed at Pearl Harbor in December 1941",
    description: "A sailor aboard ship at Pearl Harbor living through the morning of the attack and its immediate aftermath.",
  },
  {
    key: "erie", label: "Erie Canal", mode: "systems",
    topic: erieFixture.topic, grade: erieFixture.grade,
    standard: erieFixture.standard,
    lockedInputs: erieFixture,
  },
  {
    key: "crusade", label: "Third Crusade", mode: "character",
    topic: "The Third Crusade", grade: "7th grade",
    standard: "The Third Crusade (1189-1192): Richard the Lionheart and Saladin, the siege of Acre, and the struggle over Jerusalem in the medieval world",
    role: "A crusader foot soldier on the Third Crusade",
    description: "A common soldier marching from Acre toward Jerusalem, weighing faith, survival, and what is owed to comrades and captives.",
  },
  {
    key: "dustbowl", label: "Dust Bowl", mode: "character",
    topic: "The Dust Bowl", grade: "8th grade",
    standard: "The Dust Bowl and the Great Depression: tenant farmers, drought, and migration west in the 1930s",
    role: "A tenant farmer on the southern Plains in the 1930s",
    description: "A farmer watching the land blow away, deciding whether to hold on, take relief, or join the migration west.",
  },
  {
    key: "lewisclark", label: "Lewis & Clark", mode: "systems",
    topic: "Lewis and Clark Expedition", grade: "5th grade",
    standard: "TEKS 5.1(A), 5.1(B) — Historical significance of the Lewis and Clark Expedition, its role in westward expansion, and its interactions with Native peoples",
  },
];

// ════════════════════════════════════════════════════════════════
// TIER 1 — NEW deterministic checks
// ════════════════════════════════════════════════════════════════
type CheckStatus = "pass" | "warn" | "fail";

interface DimensionResult {
  status: CheckStatus;
  detail: string;
}

// ── Flesch-Kincaid ────────────────────────────────────────────────
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  let s = (w.replace(/e$/, "").match(/[aeiouy]{1,2}/g) ?? []).length;
  return Math.max(1, s);
}

function fleschKincaidGrade(text: string): { grade: number; words: number; sentences: number } {
  const sentences = (text.match(/[^.!?]+[.!?]+/g) ?? [text]).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  if (words.length === 0 || sentences.length === 0) return { grade: 0, words: 0, sentences: 0 };
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const grade = 0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59;
  return { grade: Math.round(grade * 10) / 10, words: words.length, sentences: sentences.length };
}

// Collect the kid-facing IN-PLAY prose: event text (incl. FlagText
// default + variants), choice text/results, outcome texts, trivia
// questions/choices/facts/explanations, sage greeting/advice/bio,
// intro. Verdict + reviewSummary are deliberately excluded here —
// they have their own prose-length check and a more literary register.
function collectBodyProse(d: any): string {
  const parts: string[] = [];
  const push = (v: unknown) => { if (typeof v === "string" && v.trim()) parts.push(v.trim()); };
  push(d.introBody); push(d.subtitle); push(d.trailFeedOpener);
  for (const ev of d.events ?? []) {
    if (typeof ev.text === "string") push(ev.text);
    else if (ev.text && typeof ev.text === "object") {
      push(ev.text.default);
      for (const v of ev.text.variants ?? []) push(v.text);
    }
    for (const c of ev.choices ?? []) {
      push(c.text); push(c.result);
      for (const o of c.outcomes ?? []) push(o.text ?? o.result);
    }
    for (const a of ev.attempts ?? []) { push(a.text); push(a.successText); push(a.failText); }
    push(ev.fact);
  }
  for (const s of d.sages ?? []) {
    push(s.greeting); push(s.advice); push(s.bio);
    push(s.question?.question); push(s.question?.explanation);
    for (const c of s.question?.choices ?? []) push(c);
  }
  for (const q of d.eventTrivia ?? []) {
    push(q.question); push(q.fact); push(q.explanation);
    for (const c of q.choices ?? []) push(c);
  }
  return parts.join(" ");
}

function gradeNumber(grade: string): number {
  const m = grade.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 8;
}

// Band proposal: PASS within target grade ±2 (a campaign reads fine a
// little below grade; much above it shuts out struggling readers),
// WARN within ±3, FAIL beyond.
function checkReadingLevel(d: any, grade: string): DimensionResult & { fk: number } {
  const prose = collectBodyProse(d);
  const { grade: fk, words } = fleschKincaidGrade(prose);
  const target = gradeNumber(grade);
  const dist = Math.abs(fk - target);
  const status: CheckStatus = dist <= 2 ? "pass" : dist <= 3 ? "warn" : "fail";
  return {
    status, fk,
    detail: `FK ${fk} vs target ${target} (band ±2 pass / ±3 warn; ${words} words of body prose)`,
  };
}

// ── Prose length bounds ───────────────────────────────────────────
// Bands recalibrated 2026-06-11 against the measured hand-approved
// outputs of run 2026-06-11-1118 (verdict sentences 6-12, median 8;
// summary words 313-405, median 337) — the rubric's original ~3-5 /
// ~300 numbers predated real approved output. Verdict (per passage):
// PASS 5-10, WARN 3-4 or 11-12 (verdicts are meant compressed, so the
// long tail flags rather than passes), FAIL <=2 or >=13. Summary:
// PASS 275-425, WARN 225-274 or 426-500, FAIL <225 or >500.
function sentenceCount(text: string): number {
  return (text.match(/[^.!?]+[.!?]+/g) ?? (text.trim() ? [text] : [])).filter((s) => s.trim().length > 0).length;
}

function checkProseLength(d: any): DimensionResult {
  const problems: string[] = [];
  let worst: CheckStatus = "pass";
  const bump = (s: CheckStatus) => { if (s === "fail" || (s === "warn" && worst === "pass")) worst = s; };

  const v = d.verdict;
  if (v && typeof v === "object") {
    for (const k of ["good", "bad", "indifferent"] as const) {
      const n = sentenceCount(String(v[k] ?? ""));
      const s: CheckStatus =
        n >= 5 && n <= 10 ? "pass" :
        (n >= 3 && n <= 4) || (n >= 11 && n <= 12) ? "warn" : "fail";
      bump(s);
      if (s !== "pass") problems.push(`verdict.${k}: ${n} sentences (pass 5-10, warn 3-4/11-12)`);
    }
  } else {
    bump("fail");
    problems.push("verdict absent — no passages to measure");
  }

  if (typeof d.reviewSummary === "string" && d.reviewSummary.trim()) {
    const words = d.reviewSummary.trim().split(/\s+/).length;
    const s: CheckStatus =
      words >= 275 && words <= 425 ? "pass" :
      (words >= 225 && words < 275) || (words > 425 && words <= 500) ? "warn" : "fail";
    bump(s);
    if (s !== "pass") problems.push(`reviewSummary: ${words} words (pass 275-425, warn 225-274/426-500)`);
  } else {
    bump("fail");
    problems.push("reviewSummary absent — no summary to measure");
  }

  return { status: worst, detail: problems.length ? problems.join("; ") : "verdict passages 5-10 sentences; summary 275-425 words" };
}

// ── Timeline coherence (Part 1, deterministic) ────────────────────
// The engine's character-mode "time passes" beats compute their span
// from daysPerTurn × turns-skipped, capped at MAX_SKIP_CHUNK turns per
// beat, then render it with skipDurationLine (ported verbatim from
// src/GeneratedCampaign.tsx so the check reads the EXACT words a learner
// would see). A beat is a bridge over dead air; it only reads sensibly
// when the campaign has enough turns that a single beat spans a minority
// of the event AND its announced calendar unit matches how long the
// whole event actually is. A short event configured with a long-campaign
// timescale violates this — too few turns, or one beat swallowing the
// event, or "weeks/months pass" announced inside a sub-fortnight span
// (the Pearl Harbor failure). Beats fire in character mode only
// (isCharacterMode === flags present); systems campaigns never show
// them, so the dimension is n/a-pass there.
const MAX_SKIP_CHUNK = 6; // mirrors src/GeneratedCampaign.tsx

// Ported verbatim from the engine — same bands, same words.
const TL_NUM_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const tlCap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
function skipDurationLine(days: number): string {
  const d = Math.max(1, Math.round(days));
  if (d === 1) return "A day passes.";
  if (d <= 10) return `${tlCap(TL_NUM_WORDS[d])} days pass.`;
  if (d <= 24) return `${tlCap(TL_NUM_WORDS[Math.max(2, Math.round(d / 7))])} weeks pass.`;
  if (d <= 45) return "A month passes.";
  if (d <= 75) return "Two months pass.";
  const m = Math.round(d / 30);
  const word = TL_NUM_WORDS[Math.min(m, 10)];
  return m * 30 > d ? `Nearly ${word} months pass.` : `${tlCap(word)} months pass.`;
}

function checkTimelineCoherence(d: any): DimensionResult {
  const isCharacterMode = (d?.flags?.length ?? 0) > 0;
  if (!isCharacterMode) {
    return { status: "pass", detail: "n/a — systems mode (no character 'time passes' beats fire)" };
  }
  const totalDays = Number(d?.totalDays) || 0;
  const daysPerTurn = Number(d?.daysPerTurn) || 0;
  if (totalDays <= 0 || daysPerTurn <= 0) {
    return { status: "warn", detail: `cannot assess — totalDays=${d?.totalDays}, daysPerTurn=${d?.daysPerTurn}` };
  }

  const totalTurns = totalDays / daysPerTurn;
  const maxBeatDays = Math.min(MAX_SKIP_CHUNK * daysPerTurn, totalDays);
  const frac = maxBeatDays / totalDays;
  const worstLine = skipDurationLine(maxBeatDays);
  const coarseUnit = /week|month/.test(worstLine); // beat announces weeks or months

  // FAIL conditions — the beat language is absurd for the event's span:
  //  1. the whole event fits inside a single skip chunk (≤6 turns) — one
  //     beat can swallow it entirely;
  //  2. a beat announces weeks/months while the entire event is ≤2 weeks;
  //  3. a single beat covers >60% of the whole event.
  // WARN — borderline: very few turns (<9), or one beat covers >50%.
  const fails: string[] = [];
  if (totalTurns < MAX_SKIP_CHUNK) fails.push(`only ~${totalTurns.toFixed(1)} turns — one beat can skip the whole event`);
  if (coarseUnit && totalDays <= 14) fails.push(`beat says "${worstLine}" but the entire event is only ${totalDays} days`);
  if (frac > 0.6) fails.push(`one beat covers ${Math.round(frac * 100)}% of the campaign`);

  const warns: string[] = [];
  if (totalTurns < 9) warns.push(`only ~${totalTurns.toFixed(1)} turns — dead-air collapse can dominate`);
  if (frac > 0.5) warns.push(`one beat covers ${Math.round(frac * 100)}% of the campaign`);

  const status: CheckStatus = fails.length ? "fail" : warns.length ? "warn" : "pass";
  const reasons = fails.length ? fails : warns;
  const facts = `${totalDays}d / ${daysPerTurn}d-per-turn ≈ ${totalTurns.toFixed(1)} turns; worst beat "${worstLine}" spans ${Math.round(maxBeatDays)}d (${Math.round(frac * 100)}% of event)`;
  return { status, detail: reasons.length ? `${reasons.join("; ")} — ${facts}` : facts };
}

// ════════════════════════════════════════════════════════════════
// TIER 1 — consolidate EXISTING validator findings into named
// dimensions. Each finding is routed to exactly one dimension by
// field/message; whatever isn't claimed lands in schema-valid.
// ════════════════════════════════════════════════════════════════
const TIER1_DIMENSIONS = [
  "schema-valid",
  "no-inert-choice",
  "no-lethal-degradation",
  "moral-tag-valid",
  "verdict-present",
  "summary-present",
  "resource-keys",
  "reading-level",
  "prose-length",
  "timeline-coherence",
] as const;

// Tier 2 — model-graded (rubric order; v1 = safety/credibility critical)
const TIER2_DIMENSIONS = [
  "factual-accuracy",    // v1, stronger grader
  "standard-alignment",  // v1, cheap grader
  "age-appropriate",     // v1, cheap grader
  "verdict-lands",       // v2, cheap grader
  "answers-embedded",    // v2, cheap grader
] as const;

const DIMENSIONS = [...TIER1_DIMENSIONS, ...TIER2_DIMENSIONS] as const;
type DimensionName = (typeof DIMENSIONS)[number];
type Tier2Name = (typeof TIER2_DIMENSIONS)[number];

function routeFinding(f: DeliveryFinding): DimensionName {
  const field = f.field ?? "";
  const msg = f.message ?? "";
  if (msg.includes("felt consequence")) return "no-inert-choice";
  if (field.includes("degradationEffect") || msg.includes("never end the run or kill")) return "no-lethal-degradation";
  if (field.includes("moralTag") || msg.includes("moralTag")) return "moral-tag-valid";
  if (field.startsWith("verdict")) return "verdict-present";
  if (field === "reviewSummary") return "summary-present";
  if (
    field === "events→resources" || field === "primaryResourceKey" ||
    field === "resourceLabels" || field === "resourceCaps" ||
    msg.includes("resource key")
  ) return "resource-keys";
  return "schema-valid";
}

function consolidateTier1(
  result: { findings: DeliveryFinding[]; data: any } | null,
  grade: string,
  generationThrew: boolean,
): { dimensions: Partial<Record<DimensionName, DimensionResult>>; fk: number | null } {
  const dims: Partial<Record<DimensionName, DimensionResult>> = {};

  if (generationThrew || !result) {
    for (const name of TIER1_DIMENSIONS) dims[name] = { status: "fail", detail: "generation failed — nothing to check" };
    return { dimensions: dims, fk: null };
  }

  const d = result.data as any;
  const byDim = new Map<DimensionName, DeliveryFinding[]>();
  for (const f of result.findings) {
    const dim = routeFinding(f);
    if (!byDim.has(dim)) byDim.set(dim, []);
    byDim.get(dim)!.push(f);
  }

  const fromFindings = (name: DimensionName, passDetail: string): DimensionResult => {
    const fs = byDim.get(name) ?? [];
    const errors = fs.filter((f) => f.level === "error");
    const warns = fs.filter((f) => f.level === "warn");
    if (errors.length) return { status: "fail", detail: errors.map((f) => `[${f.field}] ${f.message}`).join("; ") };
    if (warns.length) return { status: "warn", detail: warns.map((f) => `[${f.field}] ${f.message}`).join("; ") };
    return { status: "pass", detail: passDetail };
  };

  dims["schema-valid"] = fromFindings("schema-valid", "parses; conforms to CampaignData");
  dims["no-inert-choice"] = fromFindings("no-inert-choice", "every multi-option choice carries a felt consequence");
  dims["no-lethal-degradation"] = fromFindings("no-lethal-degradation", "personal resources degrade, never kill");
  dims["moral-tag-valid"] = fromFindings("moral-tag-valid", "all moralTags ∈ {principled, self-serving, obvious}");
  dims["resource-keys"] = fromFindings("resource-keys", "all effects reference declared resource keys");

  // Presence checks are the harness's own (the validator only checks
  // these fields IF present; the rubric requires them present).
  const v = d?.verdict;
  const verdictOk = v && ["good", "bad", "indifferent"].every((k) => typeof v[k] === "string" && v[k].trim());
  const verdictFindings = fromFindings("verdict-present", "");
  dims["verdict-present"] = !verdictOk
    ? { status: "fail", detail: "verdict missing or a passage is empty (need good/bad/indifferent)" }
    : verdictFindings.status !== "pass" ? verdictFindings
    : { status: "pass", detail: "all 3 verdict passages present and non-empty" };

  const summaryOk = typeof d?.reviewSummary === "string" && d.reviewSummary.trim().length > 0;
  const summaryFindings = fromFindings("summary-present", "");
  dims["summary-present"] = !summaryOk
    ? { status: "fail", detail: "reviewSummary missing or empty" }
    : summaryFindings.status !== "pass" ? summaryFindings
    : { status: "pass", detail: "review summary present" };

  const rl = checkReadingLevel(d, grade);
  dims["reading-level"] = { status: rl.status, detail: rl.detail };
  dims["prose-length"] = checkProseLength(d);
  dims["timeline-coherence"] = checkTimelineCoherence(d);

  return { dimensions: dims, fk: rl.fk };
}

// ════════════════════════════════════════════════════════════════
// TIER 2 — model-graded checks (rubric prompt shapes, verbatim at
// the core; a JSON envelope is added so judgments parse reliably).
// Rule: never "is this good?" — narrow, quotable, checkable
// questions. Every judgment must quote its evidence or answer NONE,
// so the audit loop can verify the grader against the source text.
// ════════════════════════════════════════════════════════════════
import { parseModelJson } from "./json.js";

// "timeline-coherence" is a Tier-1 deterministic dimension that ALSO
// carries a cheap Tier-2 grader component (historical-duration
// plausibility), so it appears here alongside the pure Tier-2 names.
type GradedName = Tier2Name | "timeline-coherence";

interface GraderRecord {
  dimension: GradedName;
  model: string;
  rawResponse: string;
  parsed: unknown;
}

// The kid-facing content dossier — everything a student reads, with
// section labels so grader quotes are findable in the source.
function buildDossier(d: any): string {
  const L: string[] = [];
  L.push(`TITLE: ${d.title ?? ""}`);
  L.push(`SUBTITLE: ${d.subtitle ?? ""}`);
  L.push(`INTRO: ${d.introBody ?? ""}`);
  if (d.historicalContext) L.push(`HISTORICAL CONTEXT: ${d.historicalContext}`);
  L.push("");
  for (const ev of d.events ?? []) {
    L.push(`EVENT [${ev.id}] ${ev.title ?? ""}`);
    if (typeof ev.text === "string") L.push(`  text: ${ev.text}`);
    else if (ev.text && typeof ev.text === "object") {
      L.push(`  text: ${ev.text.default ?? ""}`);
      for (const v of ev.text.variants ?? []) L.push(`  text variant: ${v.text}`);
    }
    for (const c of ev.choices ?? []) {
      L.push(`  choice: ${c.text ?? ""}`);
      if (c.result) L.push(`    result: ${c.result}`);
      for (const o of c.outcomes ?? []) if (o.result ?? o.text) L.push(`    outcome: ${o.result ?? o.text}`);
    }
    for (const a of ev.attempts ?? []) {
      if (a.text) L.push(`  attempt: ${a.text}`);
      if (a.successText) L.push(`    success: ${a.successText}`);
      if (a.failText) L.push(`    failure: ${a.failText}`);
    }
    if (ev.fact) L.push(`  fact: ${ev.fact}`);
  }
  L.push("");
  for (const s of d.sages ?? []) {
    L.push(`SAGE ${s.name ?? ""} (${s.title ?? ""})`);
    if (s.bio) L.push(`  bio: ${s.bio}`);
    if (s.greeting) L.push(`  greeting: ${s.greeting}`);
    if (s.advice) L.push(`  advice: ${s.advice}`);
    if (s.question) {
      L.push(`  question: ${s.question.question ?? ""}`);
      L.push(`  choices: ${(s.question.choices ?? []).join(" | ")}`);
      if (s.question.explanation) L.push(`  explanation: ${s.question.explanation}`);
    }
  }
  L.push("");
  for (const q of d.eventTrivia ?? []) {
    L.push(`TRIVIA [${q.id}]: ${q.question ?? ""}`);
    L.push(`  choices: ${(q.choices ?? []).join(" | ")}`);
    if (q.fact) L.push(`  fact: ${q.fact}`);
    if (q.explanation) L.push(`  explanation: ${q.explanation}`);
  }
  if (d.verdict) {
    L.push("");
    L.push(`VERDICT (good): ${d.verdict.good ?? ""}`);
    L.push(`VERDICT (bad): ${d.verdict.bad ?? ""}`);
    L.push(`VERDICT (indifferent): ${d.verdict.indifferent ?? ""}`);
  }
  if (d.reviewSummary) {
    L.push("");
    L.push(`REVIEW SUMMARY: ${d.reviewSummary}`);
  }
  return L.join("\n");
}

// The exam = eventTrivia + sage questions (mirrors GeneratedCampaign's
// examQuestions assembly), with correct answers marked for the grader.
function buildExamSheet(d: any): string {
  const L: string[] = [];
  for (const q of d.eventTrivia ?? []) {
    const correct = (q.choices ?? [])[q.correctIndex] ?? "?";
    L.push(`Q [${q.id}]: ${q.question}\n  CORRECT ANSWER: ${correct}`);
  }
  for (const s of d.sages ?? []) {
    const q = s.question ?? {};
    const correct = (q.choices ?? [])[q.correctIndex] ?? "?";
    L.push(`Q [sageq_${s.id}]: ${q.question}\n  CORRECT ANSWER: ${correct}`);
  }
  return L.join("\n");
}

const GRADER_SYSTEM = `You are a strict, literal grader for kid-facing educational history-game content. You answer ONLY the narrow question asked. Every judgment must QUOTE the exact evidence from the provided content, or answer NONE/NO — never editorialize, never grade overall quality. Output ONLY the requested JSON object, no markdown fences, no commentary.`;

interface GraderSpec {
  dimension: GradedName;
  model: string;
  maxTokens: number;
  thinking: boolean;
  buildPrompt: (d: any, spec: TopicSpec | { standard: string; grade: string; topic: string }) => string;
  judge: (parsed: any) => DimensionResult;
}

const GRADERS: GraderSpec[] = [
  {
    // v1, safety-critical — STRONGER grader: catching fabrication needs knowledge.
    dimension: "factual-accuracy",
    model: GRADER_STRONG,
    maxTokens: 4000,
    thinking: true,
    buildPrompt: (d, spec) => `${buildDossier(d)}

---
The above is a historical educational game about: ${spec.topic}

List any historical claims that are factually false or invented. Quote each, or answer NONE.

Notes for judging: a fictional player-perspective character and fictional minor cast members are an expected genre device — do NOT flag them. Flag HISTORICAL claims (events, dates, named real people, numbers, causation) that are false or invented and presented as fact. Grade-level simplification of real history is acceptable; falsification is not.

Output JSON: {"claims": [{"quote": "<exact quote>", "why": "<what is false/invented>"}]}
If there are none, output {"claims": []}.`,
    judge: (p) => {
      const claims = Array.isArray(p?.claims) ? p.claims : null;
      if (!claims) return { status: "warn", detail: "grader output unparseable" };
      if (claims.length === 0) return { status: "pass", detail: "NONE — no false or invented historical claims found" };
      return { status: "fail", detail: claims.map((c: any) => `"${c.quote}" — ${c.why}`).join(" · ") };
    },
  },
  {
    // v1, credibility — cheap grader.
    dimension: "standard-alignment",
    model: GRADER_CHEAP,
    maxTokens: 1500,
    thinking: false,
    buildPrompt: (d, spec) => `${buildDossier(d)}

---
TARGET STANDARD: ${spec.standard}

Does this content address the standard above? Quote the content that does, or answer NO.

Output JSON: {"addresses": true|false, "quotes": ["<exact quote>", ...]}
"addresses" may be true ONLY if you can quote specific content that teaches the standard.`,
    judge: (p) => {
      if (typeof p?.addresses !== "boolean") return { status: "warn", detail: "grader output unparseable" };
      const quotes = Array.isArray(p.quotes) ? p.quotes.filter((q: any) => typeof q === "string" && q.trim()) : [];
      if (p.addresses && quotes.length > 0) {
        return { status: "pass", detail: `addresses the standard — e.g. "${String(quotes[0]).slice(0, 120)}"` };
      }
      return { status: "fail", detail: p.addresses ? "claimed YES but quoted no evidence" : "NO — grader found no content addressing the standard" };
    },
  },
  {
    // v1, safety-critical — cheap grader.
    dimension: "age-appropriate",
    model: GRADER_CHEAP,
    maxTokens: 1500,
    thinking: false,
    buildPrompt: (d, spec) => `${buildDossier(d)}

---
TARGET AUDIENCE: ${spec.grade} students.

Any content inappropriate for the target grade (graphic violence, adult themes)? Quote it or NONE.

Note: this is real history — hardship, injustice, war, and death may be PRESENT and age-appropriately handled; flag only gratuitous/graphic treatment or adult themes unsuitable for this grade.

Output JSON: {"findings": [{"quote": "<exact quote>", "why": "<why inappropriate for this grade>"}]}
If there are none, output {"findings": []}.`,
    judge: (p) => {
      const findings = Array.isArray(p?.findings) ? p.findings : null;
      if (!findings) return { status: "warn", detail: "grader output unparseable" };
      if (findings.length === 0) return { status: "pass", detail: "NONE — no age-inappropriate content found" };
      return { status: "fail", detail: findings.map((f: any) => `"${f.quote}" — ${f.why}`).join(" · ") };
    },
  },
  {
    // v2 — cheap grader.
    dimension: "verdict-lands",
    model: GRADER_CHEAP,
    maxTokens: 2000,
    thinking: false,
    buildPrompt: (d, spec) => `Topic: ${spec.topic}
Standard: ${spec.standard}

VERDICT (good): ${d.verdict?.good ?? "(absent)"}
VERDICT (bad): ${d.verdict?.bad ?? "(absent)"}
VERDICT (indifferent): ${d.verdict?.indifferent ?? "(absent)"}

These are the closing moral verdicts of the game. For EACH passage: does it judge the player's CHARACTER (who they became — not how well they optimized the game), tie to the real historical outcome, and avoid being congratulatory? Quote the line that shows each judgment.

Output JSON: {"passages": {"good": {"judgesCharacter": bool, "tiesToRealOutcome": bool, "congratulatory": bool, "quote": "<line quoted as evidence>"}, "bad": {...}, "indifferent": {...}}}`,
    judge: (p) => {
      const ps = p?.passages;
      if (!ps?.good || !ps?.bad || !ps?.indifferent) return { status: "warn", detail: "grader output unparseable" };
      const problems: string[] = [];
      for (const k of ["good", "bad", "indifferent"]) {
        const v = ps[k];
        if (!v.judgesCharacter) problems.push(`${k}: judges play, not character ("${String(v.quote ?? "").slice(0, 90)}")`);
        if (!v.tiesToRealOutcome) problems.push(`${k}: not tied to the real outcome`);
        if (v.congratulatory) problems.push(`${k}: congratulatory ("${String(v.quote ?? "").slice(0, 90)}")`);
      }
      if (problems.length === 0) return { status: "pass", detail: "all 3 passages judge character, tie to the real outcome, non-congratulatory" };
      return { status: "fail", detail: problems.join(" · ") };
    },
  },
  {
    // v2 — cheap grader.
    dimension: "answers-embedded",
    model: GRADER_CHEAP,
    maxTokens: 3000,
    thinking: false,
    buildPrompt: (d) => `EXAM QUESTIONS (the post-game check for understanding — eventTrivia + sage questions):
${buildExamSheet(d)}

REVIEW SUMMARY (shown to the student before the exam retake):
${d.reviewSummary ?? "(absent)"}

For each exam question, is its answer in the summary? Embedded naturally or signposted? Quote it.
("Signposted" = the summary telegraphs it as a quiz answer, e.g. "remember that...", "the answer is...", or a bolded/listed fact dump. "Embedded" = the fact lives naturally inside the narrative recap.)

Output JSON: {"questions": [{"id": "<question id>", "inSummary": bool, "style": "embedded"|"signposted"|null, "quote": "<the summary text containing the answer, or null>"}]}`,
    judge: (p) => {
      const qs = Array.isArray(p?.questions) ? p.questions : null;
      if (!qs || qs.length === 0) return { status: "warn", detail: "grader output unparseable" };
      const missing = qs.filter((q: any) => !q.inSummary);
      const signposted = qs.filter((q: any) => q.inSummary && q.style === "signposted");
      if (missing.length > 0) {
        return { status: "fail", detail: `${missing.length}/${qs.length} answers NOT in summary: ${missing.map((q: any) => q.id).join(", ")}` };
      }
      if (signposted.length > 0) {
        return { status: "warn", detail: `${signposted.length}/${qs.length} signposted (not embedded): ${signposted.map((q: any) => `${q.id} "${String(q.quote ?? "").slice(0, 70)}"`).join(" · ")}` };
      }
      return { status: "pass", detail: `all ${qs.length} exam answers embedded naturally in the summary` };
    },
  },
  {
    // timeline-coherence Part 2 — cheap grader. Catches what the
    // deterministic check cannot: a config that is internally coherent
    // (enough turns, proportionate beat language) but HISTORICALLY wrong
    // — e.g. a multi-year event smoothly configured as 90 days, or a
    // single-day event stretched to weeks. Narrow, duration-only,
    // state-the-real-span-or-confirm. Merged into the deterministic
    // timeline-coherence verdict (worst-of) by mergeDimensions().
    dimension: "timeline-coherence",
    model: GRADER_CHEAP,
    maxTokens: 600,
    thinking: false,
    buildPrompt: (d, spec) => `This educational history game is about: ${spec.topic}
It is configured so the player lives through the event over ${d.totalDays} in-game days.

Judge ONLY the duration. Is ${d.totalDays} days a plausible span for the real historical event or period this game depicts?
- If the real event spanned MUCH less or MUCH more time than ${d.totalDays} days, set "plausible" false and state the actual rough duration.
- Otherwise set "plausible" true (PLAUSIBLE).

Output JSON: {"plausible": true|false, "actualDuration": "<rough real duration, or null>", "note": "<short phrase, or null>"}`,
    judge: (p) => {
      if (typeof p?.plausible !== "boolean") return { status: "warn", detail: "grader output unparseable" };
      if (p.plausible) return { status: "pass", detail: `PLAUSIBLE — configured span fits the real event` };
      const dur = typeof p.actualDuration === "string" && p.actualDuration.trim() ? p.actualDuration.trim() : "much shorter/longer";
      const note = typeof p.note === "string" && p.note.trim() ? ` (${p.note.trim()})` : "";
      return { status: "warn", detail: `implausible span — real event ≈ ${dur}${note}` };
    },
  },
];

async function runGraders(
  apiKey: string,
  d: any,
  spec: { standard: string; grade: string; topic: string },
): Promise<{ dimensions: Partial<Record<DimensionName, DimensionResult>>; records: GraderRecord[] }> {
  const client = new Anthropic({ apiKey, timeout: 10 * 60_000, maxRetries: 1 });
  const dimensions: Partial<Record<DimensionName, DimensionResult>> = {};
  const records: GraderRecord[] = [];

  for (const g of GRADERS) {
    collector.stage = `grader:${g.dimension}`;
    try {
      const raw = await withRetry(`grader ${g.dimension}`, async () => {
        const stream = client.messages.stream({
          model: g.model,
          max_tokens: g.maxTokens,
          ...(g.thinking ? { thinking: { type: "adaptive" as const } } : {}),
          system: GRADER_SYSTEM,
          messages: [{ role: "user", content: g.buildPrompt(d, spec) }],
        });
        let text = "";
        stream.on("text", (t: string) => { text += t; });
        await stream.finalMessage();
        return text;
      });
      let parsed: unknown = null;
      try { parsed = parseModelJson(raw); } catch { /* judge() handles null */ }
      dimensions[g.dimension] = g.judge(parsed);
      records.push({ dimension: g.dimension, model: g.model, rawResponse: raw, parsed });
    } catch (e) {
      dimensions[g.dimension] = { status: "warn", detail: `grader call failed: ${String(e).slice(0, 140)}` };
      records.push({ dimension: g.dimension, model: g.model, rawResponse: `ERROR: ${String(e)}`, parsed: null });
    }
  }
  return { dimensions, records };
}

// Merge Tier-1 dimensions with Tier-2 grader dimensions. Almost all
// dimensions belong to exactly one tier, so a plain spread is correct —
// EXCEPT timeline-coherence, which has BOTH a deterministic component
// (from consolidateTier1) and a grader component (historical-duration
// plausibility): those two are folded into one verdict (worst-of
// status; both rationales kept, labeled [config]/[history]).
const STATUS_ORDER: Record<CheckStatus, number> = { pass: 0, warn: 1, fail: 2 };

function combineTimeline(det: DimensionResult, grader: DimensionResult): DimensionResult {
  const status = STATUS_ORDER[grader.status] > STATUS_ORDER[det.status] ? grader.status : det.status;
  return { status, detail: `[config] ${det.detail} · [history] ${grader.detail}` };
}

function mergeDimensions(
  t1: Partial<Record<DimensionName, DimensionResult>>,
  t2: Partial<Record<DimensionName, DimensionResult>>,
): Partial<Record<DimensionName, DimensionResult>> {
  const merged = { ...t1, ...t2 };
  if (t1["timeline-coherence"] && t2["timeline-coherence"]) {
    merged["timeline-coherence"] = combineTimeline(t1["timeline-coherence"], t2["timeline-coherence"]);
  }
  return merged;
}

// ════════════════════════════════════════════════════════════════
// RUNNER
// ════════════════════════════════════════════════════════════════
interface StageMetric { stage: string; calls: number; tokensIn: number; tokensOut: number; seconds: number }

interface CampaignEval {
  key: string;
  label: string;
  topic: string;
  mode: string;
  grade: string;
  standard?: string;
  status: "ok" | "rejected" | "exception";
  error?: string;
  title?: string;
  attempts: number;
  dimensions: Partial<Record<DimensionName, DimensionResult>>;
  graders?: GraderRecord[];
  fleschKincaid: number | null;
  metrics: {
    tokensIn: number;
    tokensOut: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
    costUSD: number;
    wallSeconds: number;
    stages: StageMetric[];
  };
  findings: DeliveryFinding[];
  data: unknown;
}

async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= tries; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      console.warn(`    (${label} attempt ${i}/${tries} threw: ${String(e).slice(0, 120)} — ${i < tries ? "retrying" : "giving up"})`);
    }
  }
  throw lastErr;
}

async function runTopic(apiKey: string, spec: TopicSpec, skipGrade = false): Promise<CampaignEval> {
  const callStart = collector.calls.length;
  const t0 = Date.now();
  let result: GenerateValidatedResult | null = null;
  let error: string | undefined;
  let graderDims: Partial<Record<DimensionName, DimensionResult>> = {};
  let graderRecords: GraderRecord[] | undefined;

  try {
    let inputs: GenerateInputs;

    if (spec.lockedInputs) {
      // Erie path: the canonical Stage-1 locked fixture, used verbatim.
      collector.stage = "campaign";
      inputs = spec.lockedInputs as GenerateInputs;
    } else if (spec.mode === "character") {
      // Full character pipeline, exactly as the studio/probes do it:
      // frame → faultline + personal economy + cast → campaign.
      // Stages run sequentially so token usage attributes cleanly.
      collector.stage = "frame";
      console.log("  → frame …");
      const { data: frame } = await withRetry("frame", () => generateFrame(spec.standard, apiKey));
      const persp = frame.campaignType === "character"
        ? frame.recommendedPerspective
        : { role: spec.role!, description: spec.description! };
      if (frame.campaignType !== "character") {
        console.log(`    (frame proposed '${frame.campaignType}'; forcing character with the topic-fit perspective)`);
      }
      const perspString = `${persp.role} — ${persp.description}`;

      collector.stage = "faultline";
      console.log("  → faultline …");
      const flRes = await withRetry("faultline", () => generateFaultLine(spec.standard, perspString, apiKey));
      collector.stage = "personal-economy";
      console.log("  → personal economy …");
      const peRes = await withRetry("personal-economy", () => generatePersonalEconomy(spec.standard, perspString, apiKey));
      collector.stage = "cast";
      console.log("  → cast …");
      const castRes = await withRetry("cast", () => generateCast(spec.standard, apiKey));

      inputs = {
        topic: persp.role,
        standard: spec.standard,
        grade: spec.grade,
        length: 6, numQuestions: 4, numSages: 3, difficulty: "medium",
        frame: frame.frame,
        playerRole: perspString,
        cast: castRes.data.cast,
        personalEconomy: peRes.data,
        faultLine: flRes.data,
      };
      collector.stage = "campaign";
    } else {
      collector.stage = "campaign";
      inputs = {
        topic: spec.topic, standard: spec.standard, grade: spec.grade,
        length: 5, numQuestions: 3, numSages: 3, difficulty: "medium",
      };
    }

    console.log("  → campaign generation (delivery gate, maxRegen 2) …");
    result = await generateValidatedCampaign(apiKey, inputs, { maxRegen: 2 });

    // Tier 2 — grade only what the delivery gate actually shipped.
    if (!skipGrade && result.status === "ok") {
      console.log("  → Tier-2 graders (5 checks) …");
      const graded = await runGraders(apiKey, result.data, spec);
      graderDims = graded.dimensions;
      graderRecords = graded.records;
    }
  } catch (e) {
    error = String(e);
  }

  const wallSeconds = (Date.now() - t0) / 1000;
  const calls = collector.calls.slice(callStart);

  // Per-stage rollup
  const stageMap = new Map<string, StageMetric>();
  for (const c of calls) {
    const s = stageMap.get(c.stage) ?? { stage: c.stage, calls: 0, tokensIn: 0, tokensOut: 0, seconds: 0 };
    s.calls += 1; s.tokensIn += c.inputTokens; s.tokensOut += c.outputTokens; s.seconds += c.seconds;
    stageMap.set(s.stage, s);
  }

  const { dimensions, fk } = consolidateTier1(result, spec.grade, !!error);
  const d = result?.data as any;

  return {
    key: spec.key,
    label: spec.label,
    topic: spec.topic,
    mode: spec.mode,
    grade: spec.grade,
    standard: spec.standard,
    status: error ? "exception" : result!.status === "ok" ? "ok" : "rejected",
    error,
    title: typeof d?.title === "string" ? d.title : undefined,
    attempts: result?.attempts ?? 0,
    dimensions: mergeDimensions(dimensions, graderDims),
    graders: graderRecords,
    fleschKincaid: fk,
    metrics: {
      tokensIn: calls.reduce((s, c) => s + c.inputTokens, 0),
      tokensOut: calls.reduce((s, c) => s + c.outputTokens, 0),
      cacheWriteTokens: calls.reduce((s, c) => s + c.cacheWriteTokens, 0),
      cacheReadTokens: calls.reduce((s, c) => s + c.cacheReadTokens, 0),
      costUSD: Math.round(costUSD(calls) * 10000) / 10000,
      wallSeconds: Math.round(wallSeconds * 10) / 10,
      stages: [...stageMap.values()],
    },
    findings: result?.findings ?? [],
    data: result?.data ?? null,
  };
}

// ════════════════════════════════════════════════════════════════
// OUTPUT
// ════════════════════════════════════════════════════════════════
const ICON: Record<CheckStatus, string> = { pass: "✅", warn: "⚠️", fail: "❌" };

function scoreLine(c: CampaignEval): string {
  const present = Object.values(c.dimensions).filter(Boolean) as DimensionResult[];
  const passed = present.filter((d) => d.status === "pass").length;
  const total = present.length;
  const overall = c.status !== "ok" ? "❌" : present.some((d) => d.status === "fail") ? "❌" :
    present.some((d) => d.status === "warn") ? "⚠️" : "✅";
  const worst = (Object.entries(c.dimensions) as [DimensionName, DimensionResult][])
    .filter(([, d]) => d && d.status !== "pass")
    .map(([n, d]) => `${d.status === "fail" ? "✗" : "⚠"} ${n}`)
    .join("  ");
  return `${c.label.padEnd(14)} ${overall} ${passed}/${total}  $${c.metrics.costUSD.toFixed(2)}  ${Math.round(c.metrics.wallSeconds)}s  ${c.attempts} attempt${c.attempts === 1 ? "" : "s"}${worst ? "  " + worst : ""}`;
}

function buildMarkdown(meta: any, campaigns: CampaignEval[]): string {
  const lines: string[] = [];
  lines.push(`# Eval run — ${meta.timestamp}`);
  lines.push("");
  lines.push(`Generator \`${meta.pricing.model}\` · graders \`${GRADER_CHEAP}\` (cheap) / \`${GRADER_STRONG}\` (factual-accuracy) · commit \`${meta.gitCommit}\` · maxRegen ${meta.maxRegen}${meta.gradedFrom ? ` · re-graded from \`${meta.gradedFrom}\`` : ""}`);
  lines.push("");

  // ── Scorecard: campaigns × dimensions ──
  lines.push("## Scorecard");
  lines.push("");
  lines.push(`| Campaign | ${DIMENSIONS.join(" | ")} |`);
  lines.push(`|---|${DIMENSIONS.map(() => "---").join("|")}|`);
  for (const c of campaigns) {
    const cells = DIMENSIONS.map((n) => (c.dimensions[n] ? ICON[c.dimensions[n]!.status] : "—"));
    lines.push(`| ${c.label}${c.status !== "ok" ? ` (${c.status.toUpperCase()})` : ""} | ${cells.join(" | ")} |`);
  }
  lines.push("");

  // ── Cost / time ──
  lines.push("## Cost & time");
  lines.push("");
  lines.push("| Campaign | Mode | Attempts | Tokens in | Tokens out | Cost | Wall time | FK grade |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const c of campaigns) {
    lines.push(`| ${c.label} | ${c.mode} | ${c.attempts} | ${c.metrics.tokensIn.toLocaleString()} | ${c.metrics.tokensOut.toLocaleString()} | $${c.metrics.costUSD.toFixed(3)} | ${Math.round(c.metrics.wallSeconds)}s | ${c.fleschKincaid ?? "—"} (target ${gradeNumber(c.grade)}) |`);
  }
  const totalCost = campaigns.reduce((s, c) => s + c.metrics.costUSD, 0);
  const totalSecs = campaigns.reduce((s, c) => s + c.metrics.wallSeconds, 0);
  const failures = campaigns.filter((c) => c.status !== "ok").length;
  lines.push(`| **Total** | | | ${campaigns.reduce((s, c) => s + c.metrics.tokensIn, 0).toLocaleString()} | ${campaigns.reduce((s, c) => s + c.metrics.tokensOut, 0).toLocaleString()} | **$${totalCost.toFixed(2)}** | **${Math.round(totalSecs / 60)}m ${Math.round(totalSecs % 60)}s** | |`);
  lines.push("");
  lines.push(`**Failure rate: ${failures}/${campaigns.length}** (status ≠ ok after the delivery gate's retries)`);
  lines.push("");

  // ── Failures & warnings called out ──
  const problems = campaigns.flatMap((c) =>
    (Object.entries(c.dimensions) as [DimensionName, DimensionResult][])
      .filter(([, d]) => d && d.status !== "pass")
      .map(([n, d]) => ({ campaign: c.label, dim: n, status: d.status, detail: d.detail })));
  lines.push("## Failures & warnings");
  lines.push("");
  if (problems.length === 0 && campaigns.every((c) => c.status === "ok")) {
    lines.push("None — all dimensions pass on all campaigns.");
  } else {
    for (const c of campaigns.filter((c) => c.status !== "ok")) {
      lines.push(`- **${c.label}: generation ${c.status.toUpperCase()}**${c.error ? ` — ${c.error.slice(0, 200)}` : ""}`);
    }
    for (const p of problems) {
      lines.push(`- ${ICON[p.status as CheckStatus]} **${p.campaign} · ${p.dim}** — ${p.detail}`);
    }
  }
  lines.push("");

  // ── Tier-2 judgments in full (the audit surface: every judgment
  // carries its quoted evidence; spot-check these against the source).
  // Includes timeline-coherence's grader component — shown only when its
  // grader actually ran (a record exists), so a --skip-grade run's
  // deterministic-only verdict doesn't masquerade as a graded judgment. ──
  const AUDIT_DIMENSIONS: GradedName[] = [...TIER2_DIMENSIONS, "timeline-coherence"];
  const isGraded = (c: CampaignEval, n: GradedName) =>
    !!c.dimensions[n] && !!c.graders?.some((g) => g.dimension === n);
  const anyGraded = campaigns.some((c) => AUDIT_DIMENSIONS.some((n) => isGraded(c, n)));
  if (anyGraded) {
    lines.push("## Tier-2 grader judgments (audit surface)");
    lines.push("");
    for (const c of campaigns) {
      const graded = AUDIT_DIMENSIONS.filter((n) => isGraded(c, n));
      if (graded.length === 0) continue;
      lines.push(`### ${c.label}`);
      for (const n of graded) {
        const d = c.dimensions[n]!;
        const model = c.graders?.find((g) => g.dimension === n)?.model ?? "?";
        lines.push(`- ${ICON[d.status]} **${n}** (\`${model}\`) — ${d.detail}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

// ════════════════════════════════════════════════════════════════
// COMPARE MODE — diff the last two runs per campaign per dimension
// ════════════════════════════════════════════════════════════════
function listRuns(): string[] {
  if (!existsSync(EVAL_DIR)) return [];
  return readdirSync(EVAL_DIR).filter((f: string) => f.endsWith(".json")).sort().map((f: string) => resolve(EVAL_DIR, f));
}

function compare(fileA?: string, fileB?: string) {
  let a = fileA, b = fileB;
  if (!a || !b) {
    const runs = listRuns();
    if (runs.length < 2) {
      console.error(`Need two runs to compare — found ${runs.length} in eval-runs/.`);
      process.exit(1);
    }
    a = runs[runs.length - 2];
    b = runs[runs.length - 1];
  }
  const runA = JSON.parse(readFileSync(a, "utf8"));
  const runB = JSON.parse(readFileSync(b, "utf8"));
  console.log(`\nComparing ${basename(a)} → ${basename(b)}\n`);

  let changes = 0;
  for (const cb of runB.campaigns) {
    const ca = runA.campaigns.find((c: any) => c.key === cb.key);
    if (!ca) { console.log(`${cb.label}: NEW in this run`); changes++; continue; }

    if (ca.status !== cb.status) {
      console.log(`${cb.label} generation ${ca.status.toUpperCase()}→${cb.status.toUpperCase()} since last run`);
      changes++;
    }
    for (const dim of DIMENSIONS) {
      const sa = ca.dimensions?.[dim]?.status;
      const sb = cb.dimensions?.[dim]?.status;
      if (sa && sb && sa !== sb) {
        console.log(`${cb.label} ${dim} ${sa.toUpperCase()}→${sb.toUpperCase()} since last run${sb !== "pass" ? `  (${cb.dimensions[dim].detail})` : ""}`);
        changes++;
      }
    }
    if (ca.fleschKincaid != null && cb.fleschKincaid != null && Math.abs(ca.fleschKincaid - cb.fleschKincaid) >= 1) {
      console.log(`${cb.label} reading level FK ${ca.fleschKincaid}→${cb.fleschKincaid}`);
      changes++;
    }
    if (ca.attempts !== cb.attempts) {
      console.log(`${cb.label} attempts ${ca.attempts}→${cb.attempts}`);
      changes++;
    }
  }
  for (const ca of runA.campaigns) {
    if (!runB.campaigns.find((c: any) => c.key === ca.key)) { console.log(`${ca.label}: missing from new run`); changes++; }
  }

  const costA = runA.campaigns.reduce((s: number, c: any) => s + (c.metrics?.costUSD ?? 0), 0);
  const costB = runB.campaigns.reduce((s: number, c: any) => s + (c.metrics?.costUSD ?? 0), 0);
  const secsA = runA.campaigns.reduce((s: number, c: any) => s + (c.metrics?.wallSeconds ?? 0), 0);
  const secsB = runB.campaigns.reduce((s: number, c: any) => s + (c.metrics?.wallSeconds ?? 0), 0);
  console.log(`\nTotals: cost $${costA.toFixed(2)}→$${costB.toFixed(2)}  time ${Math.round(secsA)}s→${Math.round(secsB)}s`);
  if (changes === 0) console.log("No per-dimension changes between the two runs.");
}

// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════
async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "compare") {
    compare(args[1], args[2]);
    return;
  }

  // Debug mode: run the Tier-1 checks on an already-generated campaign
  // JSON (no API calls, no cost). `npx tsx generator/eval-harness.ts check <file> [grade]`
  if (args[0] === "check") {
    const file = args[1];
    if (!file) { console.error("Usage: eval-harness.ts check <campaign.json> [grade]"); process.exit(1); }
    const data = JSON.parse(readFileSync(resolve(file), "utf8"));
    const { validateForDelivery } = await import("./core.js");
    const { findings } = validateForDelivery(data, {});
    const { dimensions, fk } = consolidateTier1({ findings, data }, args[2] ?? "8th grade", false);
    for (const name of TIER1_DIMENSIONS) {
      console.log(`  ${ICON[dimensions[name]!.status]} ${name.padEnd(24)} ${dimensions[name]!.detail}`);
    }
    console.log(`  FK grade: ${fk}`);
    return;
  }

  // Grade mode: run the Tier-2 graders against an EXISTING run's saved
  // campaign data — no regeneration cost. Tier 1 is recomputed from the
  // stored findings/data (free, reflects current calibration). Writes a
  // NEW timestamped run (history append-only) with meta.gradedFrom.
  if (args[0] === "grade") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { console.error("ANTHROPIC_API_KEY not set (.env.local)."); process.exit(1); }
    let src = args[1];
    if (!src) {
      const runs = listRuns();
      if (runs.length === 0) { console.error("No runs in eval-runs/ to grade."); process.exit(1); }
      src = runs[runs.length - 1];
    }
    instrumentSdk();
    const run = JSON.parse(readFileSync(resolve(src), "utf8"));
    console.log(`Grading saved campaigns from ${basename(src)} (Tier 2 only costs; no regeneration)\n`);

    for (const c of run.campaigns as CampaignEval[]) {
      const spec = TEST_SET.find((t) => t.key === c.key);
      if (!c.data || c.status !== "ok") {
        console.log(`── ${c.label}: skipped (status ${c.status})`);
        continue;
      }
      if (!spec && !c.standard) {
        console.log(`── ${c.label}: skipped (no standard known for alignment grading)`);
        continue;
      }
      console.log(`── ${c.label} — running 5 graders …`);
      const callStart = collector.calls.length;
      const gradeSpec = {
        topic: c.topic, grade: c.grade,
        standard: c.standard ?? spec!.standard,
      };
      // Recompute Tier 1 from the stored findings + data, then merge Tier 2.
      const { dimensions: t1, fk } = consolidateTier1({ findings: c.findings, data: c.data }, c.grade, false);
      const { dimensions: t2, records } = await runGraders(apiKey, c.data, gradeSpec);
      c.dimensions = mergeDimensions(t1, t2);
      c.fleschKincaid = fk;
      c.graders = records;
      c.standard = gradeSpec.standard;
      const graderCalls = collector.calls.slice(callStart);
      const graderCost = costUSD(graderCalls);
      c.metrics.costUSD = Math.round((c.metrics.costUSD + graderCost) * 10000) / 10000;
      for (const gc of graderCalls) {
        c.metrics.tokensIn += gc.inputTokens;
        c.metrics.tokensOut += gc.outputTokens;
      }
      const stageMap = new Map<string, StageMetric>();
      for (const gc of graderCalls) {
        const s = stageMap.get(gc.stage) ?? { stage: gc.stage, calls: 0, tokensIn: 0, tokensOut: 0, seconds: 0 };
        s.calls += 1; s.tokensIn += gc.inputTokens; s.tokensOut += gc.outputTokens; s.seconds += gc.seconds;
        stageMap.set(s.stage, s);
      }
      c.metrics.stages = [...c.metrics.stages.filter((s) => !s.stage.startsWith("grader:")), ...stageMap.values()];
      console.log(`  ${scoreLine(c)}\n`);
    }

    const now2 = new Date();
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const stamp2 = `${now2.getFullYear()}-${pad2(now2.getMonth() + 1)}-${pad2(now2.getDate())}-${pad2(now2.getHours())}${pad2(now2.getMinutes())}`;
    const meta2 = { ...run.meta, timestamp: stamp2, gradedFrom: basename(src), gradedAt: now2.toISOString() };
    mkdirSync(EVAL_DIR, { recursive: true });
    const jsonPath2 = resolve(EVAL_DIR, `${stamp2}.json`);
    const mdPath2 = resolve(EVAL_DIR, `${stamp2}.md`);
    writeFileSync(jsonPath2, JSON.stringify({ meta: meta2, campaigns: run.campaigns }, null, 2), "utf8");
    writeFileSync(mdPath2, buildMarkdown(meta2, run.campaigns), "utf8");
    const gradeCost = (run.campaigns as CampaignEval[]).flatMap((c) => c.metrics.stages.filter((s) => s.stage.startsWith("grader:")))
      .reduce((sum, s) => sum + s.tokensIn + s.tokensOut, 0);
    console.log("══════════════════ SCORECARD ══════════════════");
    for (const c of run.campaigns) console.log("  " + scoreLine(c));
    console.log("────────────────────────────────────────────────");
    console.log(`  Grader tokens this pass: ${gradeCost.toLocaleString()}`);
    console.log(`  JSON:  ${jsonPath2}`);
    console.log(`  MD:    ${mdPath2}`);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set (.env.local).");
    process.exit(1);
  }

  const skipGrade = args.includes("--skip-grade");
  let topics = TEST_SET;
  const ti = args.indexOf("--topics");
  if (ti !== -1 && args[ti + 1]) {
    const keys = args[ti + 1].split(",").map((s) => s.trim());
    topics = TEST_SET.filter((t) => keys.includes(t.key));
    if (topics.length === 0) {
      console.error(`No topics match "${args[ti + 1]}". Keys: ${TEST_SET.map((t) => t.key).join(", ")}`);
      process.exit(1);
    }
  }

  instrumentSdk();

  let gitCommit = "unknown";
  try { gitCommit = execSync("git rev-parse --short HEAD", { cwd: __root }).toString().trim(); } catch { /* not fatal */ }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║        CAMPAIGNS — GENERATION EVAL (Phase 1)        ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  ${topics.length} campaign(s) · generator ${PRICING.model} · graders ${GRADER_CHEAP}/${GRADER_STRONG} · commit ${gitCommit}`);
  console.log(`  Tier 1 deterministic + Tier 2 model-graded${skipGrade ? " (SKIPPED via --skip-grade)" : ""} + Tier 3 metrics.\n`);

  const campaigns: CampaignEval[] = [];
  for (const spec of topics) {
    console.log(`── ${spec.label} (${spec.mode}, ${spec.grade}) ────────────────────`);
    const evalResult = await runTopic(apiKey, spec, skipGrade);
    campaigns.push(evalResult);
    console.log(`  ${scoreLine(evalResult)}\n`);
  }

  const meta = {
    timestamp: stamp,
    startedAt: now.toISOString(),
    gitCommit,
    pricing: PRICING,
    graders: { cheap: GRADER_CHEAP, strong: GRADER_STRONG, skipped: skipGrade },
    maxRegen: 2,
    phase: 2,
    harnessVersion: 2,
  };

  mkdirSync(EVAL_DIR, { recursive: true });
  const jsonPath = resolve(EVAL_DIR, `${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify({ meta, campaigns }, null, 2), "utf8");
  const mdPath = resolve(EVAL_DIR, `${stamp}.md`);
  writeFileSync(mdPath, buildMarkdown(meta, campaigns), "utf8");

  // ── Final scorecard ──
  console.log("══════════════════ SCORECARD ══════════════════");
  for (const c of campaigns) console.log("  " + scoreLine(c));
  const totalCost = campaigns.reduce((s, c) => s + c.metrics.costUSD, 0);
  const totalSecs = campaigns.reduce((s, c) => s + c.metrics.wallSeconds, 0);
  const failures = campaigns.filter((c) => c.status !== "ok").length;
  console.log("────────────────────────────────────────────────");
  console.log(`  Total: $${totalCost.toFixed(2)} · ${Math.round(totalSecs / 60)}m ${Math.round(totalSecs % 60)}s · failure rate ${failures}/${campaigns.length}`);
  console.log(`  JSON:  ${jsonPath}`);
  console.log(`  MD:    ${mdPath}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
