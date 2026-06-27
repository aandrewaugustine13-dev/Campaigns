/* eslint-disable @typescript-eslint/no-explicit-any */
// ════════════════════════════════════════════════════════════════
// FACT GATE — generation-time enforcement against factual fabrication.
//
// The generator's observed failure mode (eval-runs/, 5 graded runs) is
// SLOT ERRORS: wrong who/where/when/how-many filled into a true story,
// a different slot each run. Regeneration re-rolls those dice (proven:
// Montgomery fabricated a different fact on four consecutive runs), so
// this gate NEVER regenerates. It does what the hand-run 1732
// correction proved converges:
//
//   detect (Gemini, quote-or-NONE, internal/external labels)
//     → correct surgically (Gemini op-list: exact-string replace +
//       quiz re-key, applied exact-match-or-drop)
//     → verify the corrections (Gemini, TARGETED), capped at 2 cycles.
//
// Re-verify is TARGETED, not a fresh full-dossier scan (changed
// 2026-06-12, cost): it judges only whether the applied ops resolve
// the flagged claims and whether the replacement text itself is
// accurate. The 1037 run proved full re-scans were not load-bearing:
// the run's one factual-accuracy fail (Dust Bowl) was a claim the
// INITIAL scan missed (no cycle would have caught it), while War of
// 1812 shipped a residual and still passed. Fresh-scan discovery
// beyond the first detection is the eval grader's job (the
// independent scorekeeper); paying Opus full-dossier+thinking per
// cycle roughly doubled character-campaign cost ($0.36 → $0.76).
//
// Disposition at the cap (user decision, 2026-06-12):
//   - residual claims on a KEYED QUIZ ANSWER (the question stem or the
//     keyed-correct choice) → HARD REJECT. A kid must never be graded
//     on a fabrication. Non-negotiable.
//   - other residuals (narrative/fact-text) → SHIP with the warnings
//     logged; a corrected campaign is strictly better than today's
//     unchecked ship, and grader passes are stochastic, so "verified
//     clean" is asymptotic anyway. The eval harness's post-hoc grader
//     stays the independent scorekeeper.
//
// Model separation: the generator uses one model; detection/verification
// uses Gemini — the generator never grades its own homework. The corrector
// also uses Gemini, acting under the grader's explicit corrections
// (instruction-following dominates priors; proven by the manual pass).
// ════════════════════════════════════════════════════════════════
import { GoogleGenAI } from "@google/genai";
import { parseModelJson } from "./json.js";
import { validate } from "./validate.js";

const GATE_MODEL = "gemini-3.5-flash";      // detect + re-verify (needs real knowledge)
const CORRECTOR_MODEL = "gemini-3.5-flash"; // constrained string surgery
const MAX_CORRECTION_CYCLES = 2;
const MIN_FIND_LENGTH = 10; // refuse micro-replacements ("1856") that could mangle unrelated text

export interface FactClaim {
  quote: string;
  why: string;
  kind: "internal" | "external";
  correct: string;       // the grader's one-line statement of the correct fact
  quizKeyed?: boolean;   // computed by the gate, not the grader: quote located in a question stem or keyed-correct choice
}

export interface FactGateResult {
  // "gate-error": the initial fact check itself failed (API/parse) after a
  // retry — the campaign ships UNCHECKED with a warning finding, never
  // silently. All other statuses are real gate verdicts.
  status: "clean" | "shipped-with-warnings" | "rejected-keyed-answer" | "rejected-structural" | "gate-error";
  flagged: number;            // claims found on the first check
  cycles: number;             // correction cycles actually run
  opsApplied: number;
  opsDropped: number;
  residual: FactClaim[];      // claims still standing after the final verify
  log: string[];              // telemetry lines (also printed via console)
}

// ── Dossier: the kid-facing content, with keyed answers marked so the
// grader can both check them and NOT flag distractors (distractors are
// supposed to be false). ──────────────────────────────────────────────
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
    for (const t of ev.trivia ?? []) L.push(`  fact: ${t}`);
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
      (s.question.choices ?? []).forEach((c: string, i: number) =>
        L.push(`    choice${i === s.question.correctIndex ? " (KEYED CORRECT)" : ""}: ${c}`));
      if (s.question.explanation) L.push(`  explanation: ${s.question.explanation}`);
    }
  }
  L.push("");
  for (const q of d.eventTrivia ?? []) {
    L.push(`TRIVIA [${q.id}]: ${q.question ?? ""}`);
    (q.choices ?? []).forEach((c: string, i: number) =>
      L.push(`  choice${i === q.correctIndex ? " (KEYED CORRECT)" : ""}: ${c}`));
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

const GATE_SYSTEM = `You are a strict historical fact-checker for kid-facing educational game content. You answer ONLY the narrow question asked. Every judgment must QUOTE the exact evidence, or answer NONE. Output ONLY the requested JSON object — no markdown fences, no commentary.`;

function buildGatePrompt(d: any, topic: string): string {
  return `${buildDossier(d)}

---
The above is a historical educational game about: ${topic}

List any historical claims that are factually false or invented. Quote each, or answer NONE.

Rules for judging:
- A fictional player-perspective character and fictional minor cast members are an expected genre device — do NOT flag them. The fictional protagonist may also be improbably PRESENT at real events and beside real figures (the genre device) — do NOT flag the implausibility of their presence (one person could not realistically be everywhere; that is intentional). DO still flag any invented words, quotes, or actions attributed to a REAL figure, or any altered or fabricated real event. (Implausible presence = allowed; fabricated history = flagged.) Flag HISTORICAL claims (events, dates, named real people, place-names, numbers, causation) that are false or invented and presented as fact. Grade-level simplification is acceptable; falsification is not.
- Quiz distractor choices are SUPPOSED to be false — never flag a distractor. DO check every choice marked (KEYED CORRECT): a keyed answer that is historically wrong must be flagged.
- ALSO cross-check the content against ITSELF: where the narrative, trivia facts, and summary state inconsistent versions of the same fact, flag it with kind "internal" and quote BOTH sides in the quote field. Use kind "external" for claims that contradict the historical record.
- For each claim, state the correct fact in one line in the "correct" field.

Output JSON:
{"claims": [{"quote": "<exact quote (both sides, for internal)>", "why": "<what is wrong>", "kind": "internal"|"external", "correct": "<the correct fact, one line>"}]}
If there are none, output {"claims": []}.`;
}

// ── Corrector: constrained op-list against the raw field strings ────
const CORRECTOR_SYSTEM = `You are a surgical copy-editor. You fix ONLY the specific factual errors you are given, by exact string replacement, changing as little text as possible. You never rewrite style, never touch anything not implicated by a listed error, and output ONLY the requested JSON object.`;

// pixelFaces/pixelColors/trailPath are bulky non-prose structures the
// corrector never needs; strip them from its view (ops still apply to
// the real, full object).
function correctorView(d: any): string {
  const { pixelFaces, pixelColors, trailPath, ...rest } = d ?? {};
  return JSON.stringify(rest, null, 1);
}

function buildCorrectorPrompt(d: any, claims: FactClaim[]): string {
  return `CAMPAIGN JSON (the source of truth for exact strings — your "find" values must be verbatim substrings of string values in this JSON):

${correctorView(d)}

---
A historical fact-checker flagged these errors. Fix EVERY one:

${claims.map((c, i) => `${i + 1}. [${c.kind}] WRONG: "${c.quote}"
   WHY: ${c.why}
   CORRECT FACT: ${c.correct}`).join("\n\n")}

Produce a minimal list of operations:
- {"op": "replace", "find": "<exact substring of a string value, AT LEAST 10 characters, long enough to be unambiguous>", "replace": "<corrected text>"} — fixes prose. Keep the surrounding voice and rhythm; change only what the error requires. If the same wrong claim appears in several places, emit one op per distinct wording.
- {"op": "rekey", "questionId": "<eventTrivia id or sage id>", "correctChoice": "<the exact text of the choice that should be keyed correct>"} — use when a quiz keys the wrong choice as correct. Only choices that already exist may be keyed; if no existing choice is correct, instead use a "replace" op to rewrite the keyed choice's text to the correct fact.
- {"op": "dropImage", "eventId": "<event id>"} — use when a correction changes a place, person, or thing that an event's attached image depicts (check the event's image.searchQuery / imageSearchQuery): a corrected venue or attribution must not keep a photo of the WRONG one.

CRITICAL — fix each error EVERYWHERE it appears: search the whole JSON for every restatement of the wrong fact, INCLUDING event titles, sage text, trivia facts, the verdict, and the review summary. A claim whose quote names an event title means the TITLE string itself needs a replace op. Your "find" values must be verbatim substrings of the JSON's string values (the fact-checker's quotes may be paraphrased or elided — locate the real strings yourself).

Output JSON: {"ops": [...]}`;
}

interface ReplaceOp { op: "replace"; find: string; replace: string }
interface RekeyOp { op: "rekey"; questionId: string; correctChoice: string }
interface DropImageOp { op: "dropImage"; eventId: string }
type CorrectionOp = ReplaceOp | RekeyOp | DropImageOp;

// Apply ops with exact-match-or-drop semantics. Replace ops walk every
// string value and replace ALL occurrences of `find` (the same wrong
// sentence often appears verbatim in narrative + summary). Returns
// applied/dropped counts plus the ops that actually landed (the
// targeted re-verify judges those); never throws on a miss.
export function applyOps(data: any, ops: CorrectionOp[]): { applied: number; dropped: string[]; appliedOps: CorrectionOp[] } {
  let applied = 0;
  const dropped: string[] = [];
  const appliedOps: CorrectionOp[] = [];

  const replaceEverywhere = (obj: any, find: string, replace: string): boolean => {
    let hit = false;
    const walk = (o: any) => {
      if (Array.isArray(o)) { o.forEach((v, i) => { if (typeof v === "string" && v.includes(find)) { o[i] = v.split(find).join(replace); hit = true; } else walk(v); }); return; }
      if (o && typeof o === "object") {
        for (const k of Object.keys(o)) {
          const v = o[k];
          if (typeof v === "string" && v.includes(find)) { o[k] = v.split(find).join(replace); hit = true; }
          else walk(v);
        }
      }
    };
    walk(obj);
    return hit;
  };

  for (const op of ops ?? []) {
    if (op?.op === "replace" && typeof op.find === "string" && typeof op.replace === "string") {
      if (op.find.length < MIN_FIND_LENGTH) { dropped.push(`replace (find too short): "${op.find}"`); continue; }
      if (replaceEverywhere(data, op.find, op.replace)) { applied++; appliedOps.push(op); }
      else dropped.push(`replace (not found): "${op.find.slice(0, 80)}"`);
    } else if (op?.op === "rekey" && typeof op.questionId === "string" && typeof op.correctChoice === "string") {
      const norm = (s: string) => s.trim().toLowerCase();
      let done = false;
      for (const q of data.eventTrivia ?? []) {
        if (q.id !== op.questionId) continue;
        const idx = (q.choices ?? []).findIndex((c: string) => norm(c) === norm(op.correctChoice));
        if (idx >= 0) { q.correctIndex = idx; done = true; }
      }
      for (const s of data.sages ?? []) {
        if (s.id !== op.questionId || !s.question) continue;
        const idx = (s.question.choices ?? []).findIndex((c: string) => norm(c) === norm(op.correctChoice));
        if (idx >= 0) { s.question.correctIndex = idx; done = true; }
      }
      if (done) { applied++; appliedOps.push(op); }
      else dropped.push(`rekey (question/choice not found): ${op.questionId} → "${op.correctChoice.slice(0, 60)}"`);
    } else if (op?.op === "dropImage" && typeof (op as DropImageOp).eventId === "string") {
      const ev = (data.events ?? []).find((e: any) => e?.id === (op as DropImageOp).eventId);
      if (ev && (ev.image || ev.imageSearchQuery)) {
        delete ev.image;
        delete ev.imageSearchQuery;
        applied++;
        appliedOps.push(op);
      } else dropped.push(`dropImage (event/image not found): ${(op as DropImageOp).eventId}`);
    } else {
      dropped.push(`malformed op: ${JSON.stringify(op).slice(0, 80)}`);
    }
  }
  return { applied, dropped, appliedOps };
}

// ── Keyed-quiz detection (deterministic, not grader-asserted): a claim
// is quiz-keyed when its quote lands in a question stem or in the
// KEYED-CORRECT choice of any eventTrivia or sage question. Distractors
// are exempt (they're meant to be wrong); fact/explanation text is
// warning-tier, not graded-on. ───────────────────────────────────────
export function isQuizKeyed(claim: FactClaim, data: any): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const quote = norm(claim.quote ?? "");
  if (!quote) return false;
  // Internal claims quote both sides; check fragments too.
  const fragments = [quote, ...quote.split(/"|“|”/).map(norm).filter((f) => f.length >= 15)];
  // Exact match at any length; containment only when the CONTAINED side
  // is substantial (>=12 chars) — otherwise tiny fields/quotes ("a",
  // "Brock") false-positive against unrelated text.
  const hits = (field: unknown) => {
    if (typeof field !== "string" || !field.trim()) return false;
    const f = norm(field);
    return fragments.some((frag) =>
      f === frag ||
      (frag.length >= 12 && f.includes(frag)) ||
      (f.length >= 12 && frag.includes(f)));
  };
  for (const q of data.eventTrivia ?? []) {
    if (hits(q.question)) return true;
    const keyed = (q.choices ?? [])[q.correctIndex];
    if (hits(keyed)) return true;
  }
  for (const s of data.sages ?? []) {
    const q = s.question;
    if (!q) continue;
    if (hits(q.question)) return true;
    const keyed = (q.choices ?? [])[q.correctIndex];
    if (hits(keyed)) return true;
  }
  return false;
}

// Tolerant parse: parseModelJson handles fences and prose-BEFORE-json,
// but not trailing junk after a parsed value (observed from the
// corrector). Fall back to the longest balanced top-level {...} block
// that parses.
function parseLoose<T>(text: string): T {
  try { return parseModelJson<T>(text); } catch { /* fall through */ }
  const s = text;
  const candidates: string[] = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (inStr) { if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") { depth--; if (depth === 0 && start >= 0) { candidates.push(s.slice(start, i + 1)); start = -1; } }
  }
  for (const c of candidates.sort((a, b) => b.length - a.length)) {
    try { return JSON.parse(c) as T; } catch { /* next */ }
  }
  throw new Error(`No parseable JSON object in model response. Began: "${s.slice(0, 120)}"`);
}

// One retry on any failure (API error or unparseable output) — a flaky
// model response must never kill a generation.
async function callJson<T>(client: GoogleGenAI, model: string, system: string, prompt: string, maxTokens: number, thinking: boolean): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < 2; i++) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: system,
          maxOutputTokens: maxTokens,
          ...(thinking ? { thinkingConfig: { thinkingBudget: 8192 } } : {}),
          responseMimeType: "application/json",
        },
      });
      const text = response.text ?? "";
      return parseLoose<T>(text);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// null = the check itself errored after retry (distinct from "no claims").
async function factCheck(client: GoogleGenAI, data: any, topic: string): Promise<FactClaim[] | null> {
  try {
    const parsed = await callJson<{ claims: FactClaim[] }>(
      client, GATE_MODEL, GATE_SYSTEM, buildGatePrompt(data, topic), 4000, true);
    const claims = Array.isArray(parsed?.claims) ? parsed.claims : [];
    return claims.filter((c) => c && typeof c.quote === "string" && typeof c.why === "string")
      .map((c) => ({ ...c, kind: c.kind === "internal" ? "internal" as const : "external" as const, correct: String(c.correct ?? "") }));
  } catch {
    return null;
  }
}

// ── Targeted re-verify: did the applied ops resolve the flagged
// claims, and is the replacement text itself accurate? Gemini (needs
// real knowledge to judge the corrected facts) but NO thinking and a
// small prompt — this is claim-by-claim judgment, not open-ended
// detection. ~2-3K in vs ~9.5K+thinking for a full re-scan, which is
// where the gate's cost doubling lived. ──────────────────────────────
function describeOp(op: CorrectionOp): string {
  if (op.op === "replace") return `replaced "${op.find}" → "${op.replace}" (ALL occurrences, whole campaign)`;
  if (op.op === "rekey") return `re-keyed question ${op.questionId}: the correct answer is now the choice "${op.correctChoice}"`;
  return `removed the image attached to event ${op.eventId}`;
}

function buildReVerifyPrompt(claims: FactClaim[], appliedOps: CorrectionOp[], topic: string): string {
  return `In a historical educational game about: ${topic}

A fact-checker flagged these claims:

${claims.map((c, i) => `${i + 1}. [${c.kind}] WRONG: "${c.quote}"
   WHY: ${c.why}
   CORRECT FACT: ${c.correct}`).join("\n\n")}

A copy-editor then applied EXACTLY these corrections to the content:

${appliedOps.map((o) => `- ${describeOp(o)}`).join("\n")}

For each flagged claim, judge:
(a) RESOLVED — do the applied corrections remove or fix the wrong claim?
(b) ACCURATE — is the replacement text itself historically correct (consistent with the CORRECT FACT line), introducing no new error?

List the claims that are NOT fully resolved or whose correction is itself wrong. Judge ONLY the numbered claims against the listed corrections — nothing else.

Output JSON: {"unresolved": [{"index": <claim number>, "why": "<what is still wrong>"}]}
If every claim is resolved correctly, output {"unresolved": []}.`;
}

// null = the verify call itself errored after retry.
async function reVerify(client: GoogleGenAI, claims: FactClaim[], appliedOps: CorrectionOp[], topic: string): Promise<FactClaim[] | null> {
  try {
    const parsed = await callJson<{ unresolved: { index: number; why: string }[] }>(
      client, GATE_MODEL, GATE_SYSTEM, buildReVerifyPrompt(claims, appliedOps, topic), 1500, false);
    const unresolved = Array.isArray(parsed?.unresolved) ? parsed.unresolved : [];
    const out: FactClaim[] = [];
    for (const u of unresolved) {
      const claim = claims[Number(u?.index) - 1];
      if (claim) out.push({ ...claim, why: typeof u.why === "string" && u.why ? u.why : claim.why });
    }
    return out;
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
// The gate. MUTATES `data` in place (corrections), mirroring how
// applyFaultLine/enrichment already work in this pipeline.
// ════════════════════════════════════════════════════════════════
export async function runFactGate(
  apiKey: string,
  data: any,
  topic: string,
  opts: { validateStructure?: (d: any) => { failed: number } } = {},
): Promise<FactGateResult> {
  const client = new GoogleGenAI({ apiKey });
  // Post-correction structural re-check. Defaults to the CampaignData validator;
  // callers with a different content shape (e.g. the branching passage graph)
  // inject their own, so a clean string-surgery pass is never mis-flagged as a
  // structural break against the wrong schema.
  const checkStructure: (d: any) => { failed: number } = opts.validateStructure ?? validate;
  const log: string[] = [];
  const say = (line: string) => { log.push(line); console.log(`[generate] fact-gate: ${line}`); };

  let checked = await factCheck(client, data, topic);
  if (checked === null) {
    say("GATE ERROR — initial fact check failed after retry; shipping UNCHECKED (warning finding attached)");
    return { status: "gate-error", flagged: 0, cycles: 0, opsApplied: 0, opsDropped: 0, residual: [], log };
  }
  let claims = checked;
  const flagged = claims.length;
  if (flagged === 0) {
    say("PASS (0 claims)");
    return { status: "clean", flagged: 0, cycles: 0, opsApplied: 0, opsDropped: 0, residual: [], log };
  }
  const internals = claims.filter((c) => c.kind === "internal").length;
  say(`FLAGGED ${flagged} claim(s) (${internals} internal, ${flagged - internals} external)`);
  for (const c of claims) say(`  [${c.kind}] "${c.quote.slice(0, 90)}" — ${c.why.slice(0, 110)}`);

  let cycles = 0;
  let totalApplied = 0;
  let totalDropped = 0;

  while (claims.length > 0 && cycles < MAX_CORRECTION_CYCLES) {
    cycles++;
    let ops: CorrectionOp[] = [];
    try {
      const parsed = await callJson<{ ops: CorrectionOp[] }>(
        client, CORRECTOR_MODEL, CORRECTOR_SYSTEM, buildCorrectorPrompt(data, claims), 3000, false);
      ops = parsed?.ops ?? [];
    } catch (e) {
      say(`corrector call failed after retry (${String(e).slice(0, 100)}) — treating as no progress`);
    }
    const { applied, dropped, appliedOps } = applyOps(data, ops);
    totalApplied += applied;
    totalDropped += dropped.length;
    say(`cycle ${cycles} — applied ${applied} op(s), dropped ${dropped.length}`);
    for (const dr of dropped) say(`  dropped: ${dr}`);

    // Surgical string ops can't break structure, but verify anyway —
    // a structural break here must never ship.
    const report = checkStructure(data);
    if (report.failed > 0) {
      say(`REJECT — corrections introduced ${report.failed} structural error(s)`);
      return { status: "rejected-structural", flagged, cycles, opsApplied: totalApplied, opsDropped: totalDropped, residual: claims, log };
    }

    if (applied === 0) {
      // No progress is possible; current claims are the residuals.
      say("no ops applied — treating current claims as residual");
      break;
    }

    // TARGETED verify of the applied ops — not a fresh full scan (see
    // file header for why; the initial detect call is the only full
    // scan the gate pays for).
    const unresolved = await reVerify(client, claims, appliedOps, topic);
    if (unresolved === null) {
      // Corrections applied but unverifiable. Keep the pre-correction
      // claims as residuals — CONSERVATIVE: likely fixed, but the
      // keyed-answer rule below still gets to reject on them, which is
      // the safe direction for the non-negotiable.
      say(`re-verify ${cycles} — FAILED after retry; keeping prior claims as unverified residuals`);
      break;
    }
    claims = unresolved;
    say(claims.length === 0 ? `re-verify ${cycles} — all flagged claims resolved` : `re-verify ${cycles} — ${claims.length} claim(s) unresolved`);
  }

  if (claims.length === 0) {
    return { status: "clean", flagged, cycles, opsApplied: totalApplied, opsDropped: totalDropped, residual: [], log };
  }

  // Residuals at the cap: the keyed-quiz rule decides disposition.
  const residual = claims.map((c) => ({ ...c, quizKeyed: isQuizKeyed(c, data) }));
  const keyed = residual.filter((c) => c.quizKeyed);
  if (keyed.length > 0) {
    say(`REJECT — ${keyed.length} residual claim(s) on a KEYED QUIZ ANSWER (a kid must never be graded on a fabrication)`);
    for (const c of keyed) say(`  keyed residual: "${c.quote.slice(0, 90)}"`);
    return { status: "rejected-keyed-answer", flagged, cycles, opsApplied: totalApplied, opsDropped: totalDropped, residual, log };
  }
  say(`SHIP WITH WARNINGS — ${residual.length} non-keyed residual claim(s) logged`);
  for (const c of residual) say(`  residual: [${c.kind}] "${c.quote.slice(0, 90)}"`);
  return { status: "shipped-with-warnings", flagged, cycles, opsApplied: totalApplied, opsDropped: totalDropped, residual, log };
}
