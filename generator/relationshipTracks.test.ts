#!/usr/bin/env npx tsx
// ════════════════════════════════════════════════════════════════
// Step 1 proof for the relationship tracks (family, community).
//
//   1. Both decls are numeric and bounded, with the reserved ids.
//   2. applyRelationshipTracks injects BOTH beside an existing fault-line
//      flag — tracks prepended, fault-line flag preserved (distinct id),
//      and a stray pre-existing flag carrying a reserved id is de-duped.
//   3. STRICT NO-OP without faultLine — data is byte-identical.
//   4. The Joseph fixture and a systems fixture are byte-identical after a
//      no-faultLine call (the systems/Joseph-without-regen path is untouched).
//
// No model call, no engine. Run with:  npm run test:relationship-tracks
// ════════════════════════════════════════════════════════════════

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  FAMILY_FLAG,
  COMMUNITY_FLAG,
  RELATIONSHIP_TRACKS,
  RELATIONSHIP_TRACK_IDS,
  applyRelationshipTracks,
  validateRelationshipTracks,
} from "./relationshipTracks.js";
import { validate } from "./validate.js";
import type { FaultLineSpec } from "./faultline.js";
import type { FlagDecl } from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── tiny assert harness (same style as faultlineCompile.test.ts) ──
let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  \u2713 ${label}`); }
  else { failed++; console.log(`  \u2717 ${label}${detail ? `\n      ${detail}` : ""}`); }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// A minimal stand-in fault line — applyRelationshipTracks only uses its
// PRESENCE as the gate (it reads no fields), so a tiny object suffices.
const stubFaultLine = {
  campaignType: "character",
  flag: { id: "assertedRights", type: "boolean", initial: false },
} as unknown as FaultLineSpec;

function main() {
  console.log("\n=== Step 1: relationship tracks (family, community) ===\n");

  // 1) Both decls present, numeric, bounded, reserved ids.
  console.log("declarations:");
  check("exactly two tracks", RELATIONSHIP_TRACKS.length === 2);
  check("ids are family + community",
    eq(RELATIONSHIP_TRACKS.map((t) => t.id), ["family", "community"]));
  for (const t of [FAMILY_FLAG, COMMUNITY_FLAG]) {
    check(`${t.id} is numeric`, t.type === "numeric");
    check(`${t.id} has numeric min+max bounds`,
      typeof t.min === "number" && typeof t.max === "number");
    check(`${t.id} bounds are ordered and straddle zero (min<0<max)`,
      (t.min as number) < 0 && (t.max as number) > 0 && (t.min as number) < (t.max as number));
    check(`${t.id} initial 0 is within bounds`,
      t.initial === 0 && 0 >= (t.min as number) && 0 <= (t.max as number));
    check(`${t.id} has a label`, typeof t.label === "string" && (t.label as string).length > 0);
  }
  check("reserved-id set matches the track ids",
    RELATIONSHIP_TRACK_IDS.has("family") && RELATIONSHIP_TRACK_IDS.has("community") &&
    RELATIONSHIP_TRACK_IDS.size === 2);
  console.log("");

  // 2) Injection beside a fault-line flag: tracks prepended, fault-line flag
  //    preserved, stray reserved-id flag de-duped.
  console.log("injection beside a fault-line flag:");
  const flFlag: FlagDecl = { id: "assertedRights", type: "boolean", initial: false };
  const withFL: Record<string, unknown> = { flags: [flFlag] };
  applyRelationshipTracks(withFL, stubFaultLine);
  const flags1 = withFL.flags as FlagDecl[];
  check("result has exactly 3 flags (2 tracks + fault-line flag)", flags1.length === 3);
  check("tracks are prepended (family, community first)",
    eq(flags1.slice(0, 2), [FAMILY_FLAG, COMMUNITY_FLAG]));
  check("fault-line flag (distinct id) is preserved",
    flags1.some((f) => f.id === "assertedRights" && f.type === "boolean"));

  // a stray model-emitted flag carrying a reserved id must be de-duped
  const withStray: Record<string, unknown> = {
    flags: [{ id: "family", type: "numeric", initial: 5, min: 0, max: 99 }, flFlag],
  };
  applyRelationshipTracks(withStray, stubFaultLine);
  const flags2 = withStray.flags as FlagDecl[];
  check("stray 'family' flag is de-duped (exactly one family)",
    flags2.filter((f) => f.id === "family").length === 1);
  check("the surviving 'family' is the canonical decl (not the stray)",
    eq(flags2.find((f) => f.id === "family"), FAMILY_FLAG));
  check("no duplicate track ids after injection",
    new Set(flags2.map((f) => f.id)).size === flags2.length);

  // injection on a campaign with no flags array at all
  const noFlags: Record<string, unknown> = {};
  applyRelationshipTracks(noFlags, stubFaultLine);
  check("injects both tracks even when flags[] was absent",
    eq(noFlags.flags, [FAMILY_FLAG, COMMUNITY_FLAG]));
  console.log("");

  // 3) STRICT NO-OP without faultLine — byte-identical.
  console.log("strict no-op without faultLine:");
  const before: Record<string, unknown> = { flags: [flFlag], events: [{ id: "e1" }], title: "x" };
  const snapshot = JSON.stringify(before);
  applyRelationshipTracks(before, undefined);
  check("no faultLine ⇒ data untouched (byte-identical)", JSON.stringify(before) === snapshot);
  console.log("");

  // 4) Real fixtures are byte-identical after a no-faultLine call.
  console.log("fixture no-op (systems + Joseph stay byte-identical):");
  for (const rel of ["../fixtures/erie.json", "../fixtures/joseph-reconstruction.json"]) {
    const raw = readFileSync(resolve(__dirname, rel), "utf-8");
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const snap = JSON.stringify(obj);
    applyRelationshipTracks(obj, undefined);
    check(`${rel.split("/").pop()} is byte-identical after no-faultLine call`,
      JSON.stringify(obj) === snap);
  }
  console.log("");

  // 5) validateRelationshipTracks battery — positive + each negative.
  console.log("battery (validateRelationshipTracks):");
  const errs = (c: unknown) =>
    validateRelationshipTracks(c).filter((x) => x.level === "error").map((x) => `[${x.field}] ${x.message}`);
  const warns = (c: unknown) =>
    validateRelationshipTracks(c).filter((x) => x.level === "warn").map((x) => `[${x.field}] ${x.message}`);
  const clone = (c: unknown) => JSON.parse(JSON.stringify(c));

  const base = relationshipCampaign();
  const baseErrs = errs(base);
  check("a valid two-track campaign passes the battery (zero errors)", baseErrs.length === 0, baseErrs.join("; "));

  // NOT-ALL-POSITIVE (the honesty guardrail): strip every negative delta.
  const allPos = clone(base);
  for (const ev of allPos.events) for (const c of ev.choices ?? []) {
    if (c.flagWrites) for (const k of Object.keys(c.flagWrites)) c.flagWrites[k] = Math.abs(c.flagWrites[k]) || 1;
  }
  check("all-positive deltas ERROR (only-improves = a score, not a relationship)",
    errs(allPos).some((e) => e.includes("only ever increased")));

  // FRONTIER (devotion-anchored, +9): a dodgeable help-both line that reaches
  // BOTH tracks ≥+9 ERRORs (devotion-to-both is the falsehood); a line that tops
  // out in the "did right by them" band (+4..+8) must NOT — being decently
  // regarded by both is the legitimate human outcome the prose endorses. We graft
  // a costless help-both onto choices[0] of each event (leaving the conflict /
  // negative choices intact, so not-all-positive and conflict-floor still pass).
  const devotedBoth = clone(base);
  for (const ev of devotedBoth.events) ev.choices[0].flagWrites = { family: 5, community: 5 };
  check("a line reaching BOTH tracks ≥+9 ERRORs (devotion-to-both is the falsehood)",
    errs(devotedBoth).some((e) => e.includes("[events\u2192frontier]")), errs(devotedBoth).join("; "));

  const decentBoth = clone(base);
  for (const ev of decentBoth.events) ev.choices[0].flagWrites = { family: 4, community: 4 };
  check("a line topping out at +8/+8 (did-right-by-both band) does NOT trip the frontier",
    !errs(decentBoth).some((e) => e.includes("[events\u2192frontier]")), errs(decentBoth).join("; "));

  // missing a track entirely
  const missing = clone(base);
  missing.flags = missing.flags.filter((fl: FlagDecl) => fl.id !== "community");
  check("missing 'community' track ERRORS in battery",
    errs(missing).some((e) => e.includes('"community" is not declared')));

  // under-written: strip every 'family' write but the first, leaving exactly one
  const underWritten = clone(base);
  let keptFamily = false;
  for (const ev of underWritten.events) for (const c of ev.choices ?? []) {
    if (c.flagWrites && "family" in c.flagWrites) {
      if (keptFamily) delete c.flagWrites.family;
      else keptFamily = true;
    }
  }
  check("track written by <2 choices ERRORS (touched-by-≥N)",
    errs(underWritten).some((e) => e.includes('"family"') && e.includes("\u22652")));

  // scorekeeping label → warn
  const scoreLabel = clone(base);
  scoreLabel.flags.find((fl: FlagDecl) => fl.id === "family").label = "Family Score";
  check("scorekeeping label WARNS (reuses SCORE_RE)",
    warns(scoreLabel).some((w) => w.includes("flags.family.label")));
  console.log("");

  // reckoning checks
  console.log("reckoning (required + threshold-valid):");
  const noReckoning = clone(base); delete noReckoning.reckoning;
  check("missing reckoning ERRORS", errs(noReckoning).some((e) => e.includes("[reckoning]")));

  const plainReckoning = clone(base); plainReckoning.reckoning.family = "they remember you fondly";
  check("plain-string reckoning readout ERRORS (must be tiered)",
    errs(plainReckoning).some((e) => e.includes("reckoning.family") && e.includes("tiered FlagText")));

  const wrongFlag = clone(base); wrongFlag.reckoning.family.variants[0].whenFlag = "community";
  check("reckoning tier reading the WRONG track ERRORS",
    errs(wrongFlag).some((e) => e.includes("must read its own track")));

  const equalsTier = clone(base);
  equalsTier.reckoning.community.variants[0] = { whenFlag: "community", equals: 5, text: "x" };
  check("reckoning tier using equals (not a band) ERRORS",
    errs(equalsTier).some((e) => e.includes("not equals")));

  const oneBand = clone(base);
  oneBand.reckoning.family.variants = [{ whenFlag: "family", whenAtLeast: 4, text: "only one" }];
  check("reckoning with <2 tiers ERRORS",
    errs(oneBand).some((e) => e.includes("reckoning.family") && e.includes("\u22652 tiers")));
  console.log("");

  // 6) Universal validate.ts additions (fire only if tracks present).
  console.log("universal validate() additions:");
  // reserved id squatted by a NON-numeric flag
  const reservedSquat = clone(base);
  reservedSquat.flags = [
    { id: "family", type: "boolean", initial: false },   // reserved id, wrong type
    COMMUNITY_FLAG,
  ];
  const squatErrs = validate(reservedSquat).findings.filter((x) => x.level === "error").map((x) => x.message);
  check("reserved id on a non-numeric flag ERRORS in universal validate",
    squatErrs.some((m) => m.includes("reserved relationship-track id")), squatErrs.join("; "));

  // paired-if-present: one track without the other
  const unpaired = clone(base);
  unpaired.flags = unpaired.flags.filter((fl: FlagDecl) => fl.id !== "community");
  const unpairedErrs = validate(unpaired).findings.filter((x) => x.level === "error").map((x) => x.message);
  check("one track without the other ERRORS in universal validate (paired-if-present)",
    unpairedErrs.some((m) => m.includes("declared as a pair")), unpairedErrs.join("; "));

  // the positive two-track campaign has ZERO universal-validate ERRORS
  // (never-read warnings are expected pre-reckoning and are not errors).
  const baseReport = validate(base);
  check("valid two-track campaign has zero universal-validate ERRORS",
    baseReport.failed === 0,
    baseReport.findings.filter((x) => x.level === "error").map((x) => `[${x.field}] ${x.message}`).join("; "));
  console.log("");

  // 7) Joseph (no tracks) still 0/0 on universal validate; systems unaffected.
  console.log("additive guarantee (Joseph 0/0, systems clean):");
  const joseph = JSON.parse(readFileSync(resolve(__dirname, "../fixtures/joseph-reconstruction.json"), "utf-8"));
  const jr = validate(joseph);
  check("hand-built Joseph still validates 0 errors / 0 warnings", jr.failed === 0 && jr.warnings === 0,
    `errors=${jr.failed} warnings=${jr.warnings}`);
  const erie = JSON.parse(readFileSync(resolve(__dirname, "../fixtures/erie.json"), "utf-8"));
  const erieRel = validate(erie).findings.filter((x) =>
    x.field.includes("relationship") || x.field === "flags.family" || x.field === "flags.community");
  check("systems (erie) gets NO relationship-track findings", erieRel.length === 0,
    erieRel.map((x) => x.field).join("; "));
  console.log("");

  console.log(`=== ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

// A minimal two-track character campaign: family & community each written by
// ≥2 choices, each with at least one NEGATIVE delta (so it can fall). Passes
// universal validate (errors), modulo never-read warnings expected before the
// reckoning step wires the readers.
function relationshipCampaign() {
  return {
    id: "rel-stage2", title: "Relationship Stage 2", subtitle: "two tracks under test",
    introBody: "A minimal character campaign carrying the family and community tracks.",
    trailFeedOpener: "The season begins.", theme: "broadsheet-sepia",
    progressionMode: "project", totalDays: 7, daysPerTurn: 1,
    totalDistance: 0, distanceUnit: "season",
    initialResources: { standing: 55, spirit: 60 },
    resourceCaps: { standing: 100, spirit: 100 },
    resourceLabels: { standing: "Standing", spirit: "Spirit" },
    flags: [
      { ...FAMILY_FLAG },
      { ...COMMUNITY_FLAG },
    ],
    paces: [],
    events: [
      {
        id: "ev_a", phase_min: 0.0, phase_max: 0.3, weight: 5, type: "standard",
        title: "A Lean Winter", text: "A little money, and more than one mouth asking.",
        choices: [
          { text: "Provide for your own first.", flagWrites: { family: 2, community: -1 }, result: "Your house is fed; the street notices you passed it by." },
          { text: "Share what you can spare.", flagWrites: { family: -1, community: 2 }, result: "Your wife says nothing, but she counts the coins." },
        ],
      },
      {
        id: "ev_b", phase_min: 0.4, phase_max: 0.7, weight: 5, type: "standard",
        title: "The Meeting", text: "They ask you to stand up and be named, or to stay seated and safe.",
        choices: [
          { text: "Stand and be counted.", flagWrites: { community: 2, family: -1 }, result: "The room remembers; your family worries." },
          { text: "Keep your head down.", flagWrites: { family: 1, community: -2 }, result: "You go home whole; the others mark your silence." },
        ],
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
    reckoning: {
      family: {
        default: "Your family holds you somewhere between gratitude and grievance.",
        variants: [
          { whenFlag: "family", whenAtLeast: 4, text: "Your wife meets your eyes; the children trust the hand that fed them first." },
          { whenFlag: "family", whenAtLeast: -3, whenAtMost: 3, text: "Your family keeps a careful, unspoken ledger of the nights you chose elsewhere." },
          { whenFlag: "family", whenAtMost: -4, text: "Your wife counts the coins you gave away and says nothing, which is its own kind of saying." },
        ],
      },
      community: {
        default: "The wider street regards you with a wary, middling memory.",
        variants: [
          { whenFlag: "community", whenAtLeast: 4, text: "When the talk turns to who stood up, the street says your name without being asked." },
          { whenFlag: "community", whenAtLeast: -3, whenAtMost: 3, text: "Neighbors nod to you in passing and remember, mostly, that you kept to your own." },
          { whenFlag: "community", whenAtMost: -4, text: "The people you passed by remember the passing; their nods come a beat too late now." },
        ],
      },
    },
  };
}

main();
