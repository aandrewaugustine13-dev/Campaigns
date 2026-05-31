#!/usr/bin/env npx tsx
// ════════════════════════════════════════════════════════════════
// Numeric-flag Step 1 proof: the schema/resolver extension is ADDITIVE.
//
//   PARITY (must stay byte-identical):
//     1. Plain-string FlagText resolves to itself (non-flag campaigns).
//     2. Joseph's REAL boolean FlagText variants resolve exactly as before
//        for assertedRights true / false, and fall back to `default` when
//        the flag is absent. (Loaded from the fixture — real data.)
//   POSITIVE (the new path):
//     3. A numeric (track) flag resolves through whenAtLeast/whenAtMost
//        threshold bands with first-match-wins, falls back to default for a
//        non-number, and a boolean `equals` variant never matches a number.
//
// Pure data — no engine, no model call. Run with:  npm run test:numeric-flag
// ════════════════════════════════════════════════════════════════

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { resolveFlagText, type FlagText } from "./schema.js";
import { validate } from "./validate.js";
import { applyFlagWrites } from "../src/flagWrites.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── tiny assert harness (same style as faultlineCompile.test.ts) ──
let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  \u2713 ${label}`); }
  else { failed++; console.log(`  \u2717 ${label}${detail ? `\n      ${detail}` : ""}`); }
}

type ObjVariant = { whenFlag: string; equals?: unknown; text: string };
type ObjFlagText = { default: string; variants: ObjVariant[] };
const isFlagTextObject = (t: unknown): t is ObjFlagText =>
  typeof t === "object" && t !== null &&
  typeof (t as ObjFlagText).default === "string" && Array.isArray((t as ObjFlagText).variants);

function main() {
  console.log("\n=== Numeric-flag Step 1: resolver parity + threshold ===\n");

  // 1) Plain-string passthrough — non-flag campaigns are byte-identical.
  console.log("string passthrough:");
  check('plain string resolves to itself', resolveFlagText("just narration", {}) === "just narration");
  check('plain string ignores the flag map', resolveFlagText("x", { anything: 3 }) === "x");
  console.log("");

  // 2) PARITY on Joseph's REAL boolean variants (from the fixture).
  console.log("Joseph boolean-variant parity (real fixture data):");
  const josephPath = resolve(__dirname, "../fixtures/joseph-reconstruction.json");
  const joseph = JSON.parse(readFileSync(josephPath, "utf-8")) as { events: { title: string; text: FlagText }[] };
  const flagEvents = joseph.events.filter((e) => isFlagTextObject(e.text));
  check("fixture has at least one flag-keyed event", flagEvents.length >= 3,
    `found ${flagEvents.length}`);

  for (const ev of flagEvents) {
    const t = ev.text as unknown as ObjFlagText;
    const trueVar = t.variants.find((v) => v.equals === true);
    const falseVar = t.variants.find((v) => v.equals === false);
    if (!trueVar || !falseVar) { check(`"${ev.title}" has true+false variants`, false); continue; }

    check(`"${ev.title}" → true variant when assertedRights=true`,
      resolveFlagText(ev.text, { assertedRights: true }) === trueVar.text);
    check(`"${ev.title}" → false variant when assertedRights=false`,
      resolveFlagText(ev.text, { assertedRights: false }) === falseVar.text);
    check(`"${ev.title}" → default when flag absent`,
      resolveFlagText(ev.text, {}) === t.default);
  }
  console.log("");

  // 3) POSITIVE: numeric threshold bands (the new path), first-match-wins.
  console.log("numeric threshold resolution:");
  const tiered: FlagText = {
    default: "They meet you as a stranger.",
    variants: [
      { whenFlag: "familyRegard", whenAtLeast: 6, text: "beloved" },          // high tier first
      { whenFlag: "familyRegard", whenAtMost: -3, text: "feared" },
      { whenFlag: "familyRegard", whenAtLeast: 0, whenAtMost: 5, text: "uneasy" },
    ],
  };
  check("regard 8 → 'beloved'", resolveFlagText(tiered, { familyRegard: 8 }) === "beloved");
  check("regard 6 (boundary, inclusive) → 'beloved'", resolveFlagText(tiered, { familyRegard: 6 }) === "beloved");
  check("regard -5 → 'feared'", resolveFlagText(tiered, { familyRegard: -5 }) === "feared");
  check("regard 2 → 'uneasy' (middle band)", resolveFlagText(tiered, { familyRegard: 2 }) === "uneasy");
  check("first-match-wins: regard 5 → 'uneasy' (not beloved)", resolveFlagText(tiered, { familyRegard: 5 }) === "uneasy");
  check("flag absent → default", resolveFlagText(tiered, {}) === "They meet you as a stranger.");
  check("non-number value → default (no spurious match)",
    resolveFlagText(tiered, { familyRegard: true }) === "They meet you as a stranger.");

  // mixed-mode safety: a boolean equals variant must NOT match a numeric value.
  const mixed: FlagText = { default: "D", variants: [{ whenFlag: "n", equals: true, text: "EQ" }] };
  check("boolean equals variant never matches a number", resolveFlagText(mixed, { n: 1 }) === "D");
  console.log("");

  // 4) validate.ts numeric rules — positive + the no-score guardrails.
  console.log("validate() on numeric campaigns:");
  const errs = (c: unknown) =>
    validate(c).findings.filter((f) => f.level === "error").map((f) => `[${f.field}] ${f.message}`);
  const clone = (c: unknown) => JSON.parse(JSON.stringify(c));

  const base = numericCampaign();
  const baseErrs = errs(base);
  check("a valid numeric (track) campaign has zero errors", baseErrs.length === 0, baseErrs.join("; "));

  // NO-SCORE: numeric flag id colliding with a resource key is an ERROR.
  const collide = clone(base);
  collide.flags[0].id = "standing";        // same as a resource key
  collide.events[0].choices[0].flagWrites = { standing: 3 };
  collide.events[0].choices[1].flagWrites = { standing: -3 };
  collide.events[1].text.variants.forEach((v: { whenFlag: string }) => (v.whenFlag = "standing"));
  check("numeric flag colliding with a resource key ERRORS",
    errs(collide).some((e) => e.includes("collides with a resource key")));

  // NO-SCORE: numeric flag wired into resource effects is an ERROR.
  const inEffects = clone(base);
  inEffects.events[0].choices[0].effects = { familyRegard: 5 };
  check("numeric flag used in resource effects ERRORS",
    errs(inEffects).some((e) => e.includes("must not be a resource/score") || e.includes("not found in initialResources")));

  // exactly-one-mode: a numeric variant using `equals` is an ERROR.
  const numEquals = clone(base);
  numEquals.events[1].text.variants[0] = { whenFlag: "familyRegard", equals: 5, text: "x" };
  check("numeric variant using equals ERRORS",
    errs(numEquals).some((e) => e.includes("must use whenAtLeast/whenAtMost")));

  // exactly-one-mode: a boolean variant using a threshold band is an ERROR.
  const boolBand = clone(base);
  boolBand.flags.push({ id: "didSign", type: "boolean", initial: false });
  boolBand.events[0].choices[0].flagWrites.didSign = true;
  boolBand.events[1].text.variants.push({ whenFlag: "didSign", whenAtLeast: 1, text: "y" });
  check("boolean variant using whenAtLeast ERRORS",
    errs(boolBand).some((e) => e.includes("only valid on numeric flags")));
  console.log("");

  // 5) ENGINE write line (Step 3): applyFlagWrites dispatch + clamp.
  console.log("applyFlagWrites — write parity (boolean SET) + numeric ACCUMULATE/clamp:");

  // WRITE PARITY: Joseph's REAL boolean flagWrites must equal the legacy
  // blind-merge `{ ...current, ...writes }` exactly (byte-identical set-branch).
  const josephFull = JSON.parse(readFileSync(josephPath, "utf-8")) as
    { flags: unknown[]; events: { choices?: { flagWrites?: Record<string, FlagValue> }[] }[] };
  type FlagValue = boolean | null | number;
  const josephData = josephFull as unknown as Parameters<typeof applyFlagWrites>[0];
  const josephWrites = josephFull.events
    .flatMap((e) => e.choices ?? [])
    .map((c) => c.flagWrites)
    .filter((w): w is Record<string, FlagValue> => !!w);
  check("fixture has boolean flagWrites to compare", josephWrites.length >= 2, `found ${josephWrites.length}`);
  let parityHeld = true;
  for (const w of josephWrites) {
    const start: Record<string, FlagValue> = { assertedRights: false };
    const viaEngine = applyFlagWrites(josephData, start, w);
    const viaLegacy = { ...start, ...w };
    if (JSON.stringify(viaEngine) !== JSON.stringify(viaLegacy)) parityHeld = false;
  }
  check("boolean writes are byte-identical to the legacy blind-merge", parityHeld);

  // NUMERIC ACCUMULATE + CLAMP: init 0 → +2 → -1 → over-max clamp → under-min clamp.
  const numData = base as unknown as Parameters<typeof applyFlagWrites>[0]; // familyRegard ∈ [-10,10], init 0
  let f: Record<string, FlagValue> = {};                                   // empty ⇒ defaults to decl.initial (0)
  f = applyFlagWrites(numData, f, { familyRegard: 2 });
  check("init 0 + (+2) ⇒ 2", f.familyRegard === 2, String(f.familyRegard));
  f = applyFlagWrites(numData, f, { familyRegard: -1 });
  check("2 + (-1) ⇒ 1 (accumulates, not sets)", f.familyRegard === 1, String(f.familyRegard));
  f = applyFlagWrites(numData, f, { familyRegard: 20 });
  check("1 + (+20) ⇒ clamps to max 10", f.familyRegard === 10, String(f.familyRegard));
  f = applyFlagWrites(numData, f, { familyRegard: -30 });
  check("10 + (-30) ⇒ clamps to min -10", f.familyRegard === -10, String(f.familyRegard));

  // Non-flag campaign: still a plain blind-merge (untouched path).
  const noFlags = applyFlagWrites({ flags: [] } as unknown as Parameters<typeof applyFlagWrites>[0],
    { x: true }, { y: false } as Record<string, FlagValue>);
  check("no declared flags ⇒ blind merge (untouched path)",
    JSON.stringify(noFlags) === JSON.stringify({ x: true, y: false }));
  console.log("");

  console.log(`=== ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

// A minimal, validator-clean project campaign carrying ONE numeric track flag:
// familyRegard ∈ [-10,10], init 0, nudged ±3 by a setter, read as tiers later.
function numericCampaign() {
  return {
    id: "num-stage2", title: "Numeric Stage 2", subtitle: "track flag under test",
    introBody: "A minimal campaign carrying one numeric track flag.",
    trailFeedOpener: "The year begins.", theme: "broadsheet-sepia",
    progressionMode: "project", totalDays: 7, daysPerTurn: 1,
    totalDistance: 0, distanceUnit: "season",
    initialResources: { standing: 55, spirit: 60 },
    resourceCaps: { standing: 100, spirit: 100 },
    resourceLabels: { standing: "Standing", spirit: "Spirit" },
    flags: [{ id: "familyRegard", type: "numeric", initial: 0, min: -10, max: 10, label: "How the family regards you" }],
    paces: [],
    events: [
      {
        id: "setter", phase_min: 0, phase_max: 0.2, weight: 1, type: "standard",
        title: "A Lean Winter", text: "You have a little money and two mouths that aren't yours asking.",
        choices: [
          { text: "Feed your own first.", flagWrites: { familyRegard: 3 }, result: "You keep your house fed." },
          { text: "Share what little you have.", flagWrites: { familyRegard: -3 }, result: "Your shelves go barer." },
        ],
      },
      {
        id: "reader", phase_min: 0.6, phase_max: 0.9, weight: 1, type: "standard",
        title: "The Door at Dusk",
        text: {
          default: "They meet you as you are.",
          variants: [
            { whenFlag: "familyRegard", whenAtLeast: 2, text: "Your family meets you with quiet pride." },
            { whenFlag: "familyRegard", whenAtMost: -2, text: "Your family meets you with worn patience." },
          ],
        },
        choices: [{ text: "Step inside.", result: "You cross the threshold." }],
      },
    ],
    sages: [{
      id: "stub_sage", name: "A Teacher", title: "Schoolteacher", portrait: "", threshold: 999,
      bio: "Stub.", greeting: "Sit.", advice: "Know the law.",
      question: { question: "What did the Freedmen's Bureau provide?", choices: ["Schooling and legal aid", "Confederate taxes"], correctIndex: 0, explanation: "Education, relief, legal protection.", teksRef: "TEKS 8.9" },
      reward: { correct: { standing: 5 }, wrong: { spirit: 1 }, knowledgeCorrect: 5, knowledgeWrong: 1 },
    }],
    route: [{ id: "start", title: "The Home Place", description: "A rented patch.", edges: [] }],
    eventTrivia: [{ id: "black_codes", question: "What were the Black Codes?", choices: ["Laws restricting freedpeople", "Voting protections"], correctIndex: 0, fact: "Laws limiting freedpeople." }],
    trailPath: [], trailStops: [], mapImage: "none",
    outfitConfig: { budget: 0, costs: {}, herdOptions: [] },
    primaryResourceKey: "standing", primaryResourceStart: 55, revenuePerUnit: 0,
    historicalContext: "Freedpeople weighed daily, dangerous choices.",
    pixelColors: {}, pixelFaces: { joseph: [{ threshold: 0, sprite: "steady", label: "weary" }] },
  };
}

main();
