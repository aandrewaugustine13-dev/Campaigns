#!/usr/bin/env npx tsx
// ════════════════════════════════════════════════════════════════
// Stage 0 proof for faultLineToCampaignPieces.
//
//   1. Feed it a VALIDATED Joseph fault-line spec (the same fault line
//      hand-built Joseph encodes) and assert the emitted pieces match
//      hand-built Joseph's flags[] / setter / readers SHAPE.
//   2. Wrap those pieces in a minimal CampaignData and assert validate()
//      returns ZERO errors and ZERO warnings (in particular, no
//      declared-but-unused-flag warnings: the flag is both written and read).
//
// No model call. Run with:  npm run test:faultline
// ════════════════════════════════════════════════════════════════

import { validateFaultLine, type FaultLineSpec } from "./faultline.js";
import { faultLineToCampaignPieces } from "./faultlineCompile.js";
import { validate } from "./validate.js";

// ── tiny assert harness ──────────────────────────────────────────
let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    console.log(`  \u2717 ${label}${detail ? `\n      ${detail}` : ""}`);
  }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── The validated Joseph fault line (mirrors fixtures/joseph-reconstruction.json) ──
const josephSpec: FaultLineSpec = {
  campaignType: "character",
  dilemma:
    "Does Joseph let his name stand openly on the voter rolls, or stay off them to keep his family safe?",
  whyNoCleanAnswer:
    "To register is to claim the freedom the law now promises, at the risk of night-rider violence to his family; to stay off the rolls is to keep them whole, at the cost of the very rights he was freed to hold. Neither choice is the one a good man simply makes.",
  flag: {
    id: "assertedRights",
    type: "boolean",
    initial: false,
    label: "Let his name stand on the rolls in daylight",
  },
  values: [
    {
      value: true,
      meaning:
        "A man who let his name stand in daylight, and carries both the danger and the dignity of being seen.",
    },
    {
      value: false,
      meaning:
        "A man who kept his family whole by staying unseen, and carries the safety and the swallowed shame of it.",
    },
  ],
  setter: {
    beat: "The Registrar's Book",
    situation:
      "The registrar's office smells of ink and old smoke. The book lies open on the table, a column of names half filled. The clerk watches me over his spectacles; behind him, two men I do not know lean against the wall and say nothing. My wife waits outside with the children. To sign is to be counted — and to be counted is to be seen, by everyone, including men who would rather I vanish.",
    options: [
      {
        choiceText: "Register to vote, in daylight, where everyone can see.",
        writes: true,
        moralReading:
          "I take the pen. My hand wants to shake and I do not let it. The clerk writes my name out in full, and the two men by the wall watch me walk back into the sun. Whatever comes now, it comes to a man who is on the rolls.",
      },
      {
        choiceText: "Stay off the rolls this year. Keep the family whole.",
        writes: false,
        moralReading:
          "I tell the clerk I will think on it, and I take my wife's arm and we go. The book stays one name short. There is no shame in living to plant another season, I tell myself — and almost believe it.",
      },
    ],
  },
  readers: [
    {
      beat: "Hoofbeats After Midnight",
      whenValue: true,
      narration:
        "Hooves on the road past midnight. The door is barred and the children are behind me, and I sit with the lamp dark because my name is on the registrar's list and every soul in the county knows it. The riders slow at our gate. For a long moment there is only the breathing of horses and the creak of leather. Then they move on — this time. I do not sleep. A man who steps forward learns the night is longer.",
    },
    {
      beat: "Hoofbeats After Midnight",
      whenValue: false,
      narration:
        "Hooves on the road past midnight. I lie still and listen. The riders do not slow at our gate — there is no name here to punish, nothing on any list to answer for. They pass, and we are safe, and the safety tastes like ashes. I kept us whole by keeping us small. I do not sleep either.",
    },
    {
      beat: "Sunday, and the Talk Turns to the Courthouse",
      whenValue: true,
      narration:
        "Sunday. When the talk turns to the courthouse and who will speak for us, eyes find me — I am the one who signed, the man who let his name stand in daylight. An older woman takes my hand at the door: 'We watched you do it.' The weight of being looked to settles on my shoulders, heavier and finer than I expected.",
    },
    {
      beat: "Sunday, and the Talk Turns to the Courthouse",
      whenValue: false,
      narration:
        "Sunday. When the talk turns to the courthouse and who will speak for us, I keep to the back bench and study my hands. No one asks me; everyone knows I stayed off the rolls. There is no blame in their faces, which is somehow worse. I carry the cost of being unseen home with me, and it has no name I can say aloud.",
    },
    {
      beat: "The Season Turns",
      whenValue: true,
      narration:
        "The season turns. I am not a famous man, and the work is far from finished — but when my son asks one day what I did when it mattered, I will tell him I let them write my name where anyone could read it. Some nights that feels like courage. Some nights it feels like a target I painted on my own back. Both are true. I chose to be counted, and that choice is who I am now.",
    },
    {
      beat: "The Season Turns",
      whenValue: false,
      narration:
        "The season turns. I kept my family whole through a hard year, and that is no small thing. But when my son asks one day what I did when it mattered, I will have to tell him I stayed off the rolls and waited for a safer day that did not come. I chose us over the book. Some nights I know it was wisdom. Some nights it is only the shame I swallowed at the registrar's door. Both are true. That choice, too, is who I am now.",
    },
  ],
};

// Hand-built Joseph's known-good shapes (from fixtures/joseph-reconstruction.json)
const EXPECTED_FLAG = {
  id: "assertedRights",
  type: "boolean",
  initial: false,
  label: "Let his name stand on the rolls in daylight",
};
const EXPECTED_SETTER_CHOICE_TEXTS = [
  "Register to vote, in daylight, where everyone can see.",
  "Stay off the rolls this year. Keep the family whole.",
];
const EXPECTED_SETTER_WRITES = [{ assertedRights: true }, { assertedRights: false }];
const EXPECTED_READER_TITLES = [
  "Hoofbeats After Midnight",
  "Sunday, and the Talk Turns to the Courthouse",
  "The Season Turns",
];

// ── A minimal, validator-clean CampaignData carrying ONLY the pieces ──
// (plus the scaffolding validate() requires even in project mode).
function buildMinimalCampaign(pieces: ReturnType<typeof faultLineToCampaignPieces>) {
  return {
    id: "fl-stage0",
    title: "Fault-line Stage 0",
    subtitle: "compiler output under test",
    introBody: "A minimal campaign that carries only the compiled fault-line pieces.",
    trailFeedOpener: "The year begins.",
    theme: "broadsheet-sepia",
    progressionMode: "project",
    totalDays: 7,
    daysPerTurn: 1,
    totalDistance: 0,
    distanceUnit: "season",
    initialResources: { standing: 55, spirit: 60 },
    resourceCaps: { standing: 100, spirit: 100 },
    resourceLabels: { standing: "Standing", spirit: "Spirit" },
    flags: [pieces.flagDecl],
    paces: [],
    events: [pieces.setterEvent, ...pieces.readerEvents],
    sages: [
      {
        id: "stub_sage",
        name: "A Teacher",
        title: "Schoolteacher",
        portrait: "",
        threshold: 999,
        bio: "Stub sage for validation.",
        greeting: "Sit a moment.",
        advice: "Know the law on paper and the law on the road.",
        question: {
          question: "What did the Freedmen's Bureau provide?",
          choices: ["Schooling and legal aid", "Confederate taxes"],
          correctIndex: 0,
          explanation: "It provided education, relief, and legal protection to freedpeople.",
          teksRef: "TEKS 8.9",
        },
        reward: {
          correct: { standing: 5, spirit: 5 },
          wrong: { spirit: 1 },
          knowledgeCorrect: 5,
          knowledgeWrong: 1,
        },
      },
    ],
    route: [{ id: "start", title: "The Home Place", description: "A rented patch of land.", edges: [] }],
    eventTrivia: [
      {
        id: "black_codes",
        question: "What were the Black Codes?",
        choices: ["Laws restricting freedpeople", "Voting protections"],
        correctIndex: 0,
        fact: "State laws that severely limited the rights of freedpeople.",
      },
    ],
    trailPath: [],
    trailStops: [],
    mapImage: "none",
    outfitConfig: { budget: 0, costs: {}, herdOptions: [] },
    primaryResourceKey: "standing",
    primaryResourceStart: 55,
    revenuePerUnit: 0,
    historicalContext: "Freedpeople weighed daily, dangerous choices about claiming new rights.",
    pixelColors: {},
    pixelFaces: { joseph: [{ threshold: 0, sprite: "steady", label: "weary but standing" }] },
  };
}

// ════════════════════════════════════════════════════════════════
function main() {
  console.log("\n=== Stage 0: faultLineToCampaignPieces ===\n");

  // 0) The input spec is itself a VALID fault line.
  const specFindings = validateFaultLine(josephSpec);
  const specErrors = specFindings.filter((f) => f.level === "error");
  console.log("Input fault-line spec validation:");
  check("spec has zero fault-line validation errors", specErrors.length === 0,
    specErrors.map((f) => `[${f.field}] ${f.message}`).join("; "));
  console.log("");

  const pieces = faultLineToCampaignPieces(josephSpec);

  // 1) flagDecl matches hand-built Joseph and the spec, verbatim.
  console.log("flagDecl:");
  check("flagDecl deep-equals the spec flag", eq(pieces.flagDecl, josephSpec.flag));
  check("flagDecl matches hand-built Joseph flags[0]", eq(pieces.flagDecl, EXPECTED_FLAG));
  console.log("");

  // 2) setterEvent: an early standard event whose options write the flag
  //    and carry NO resource reward.
  const s = pieces.setterEvent;
  console.log("setterEvent:");
  check("type is 'standard'", s.type === "standard");
  check("has exactly 2 choices", Array.isArray(s.choices) && s.choices.length === 2);
  check("choice texts match hand-built Joseph",
    eq(s.choices?.map((c) => c.text), EXPECTED_SETTER_CHOICE_TEXTS));
  check("each choice writes the flag (true then false)",
    eq(s.choices?.map((c) => c.flagWrites), EXPECTED_SETTER_WRITES));
  check("NO choice carries `effects` (identity is a flag, not a score)",
    (s.choices ?? []).every((c) => !("effects" in c)));
  check("setter text is a plain string (writes, never reads)", typeof s.text === "string");
  check("setter text is the spec's situation", s.text === josephSpec.setter.situation);
  console.log("");

  // 3) readerEvents: grouped by beat; each a FlagText scene that varies by flag.
  const rs = pieces.readerEvents;
  console.log("readerEvents:");
  check("6 reader entries collapse into 3 scenes (grouped by beat)", rs.length === 3);
  check("reader titles match hand-built Joseph", eq(rs.map((e) => e.title), EXPECTED_READER_TITLES));
  rs.forEach((e, i) => {
    const t = e.text as { default: string; variants: { whenFlag: string; equals: unknown; text: string }[] };
    const isObj = typeof t === "object" && t !== null && typeof t.default === "string" && Array.isArray(t.variants);
    check(`scene ${i} text is a FlagText object with default + variants`, isObj);
    if (isObj) {
      check(`scene ${i} all variants read the flag 'assertedRights'`,
        t.variants.every((v) => v.whenFlag === "assertedRights"));
      check(`scene ${i} has a true variant and a false variant`,
        eq(new Set(t.variants.map((v) => v.equals)), new Set([true, false])) ||
        eq([...t.variants.map((v) => v.equals)].sort(), [false, true]));
    }
  });
  // Variant narration fidelity: the validated content survives VERBATIM.
  const trueIdx = josephSpec.readers.filter((r) => r.whenValue === true);
  const firstSceneTrue = (rs[0].text as { variants: { equals: unknown; text: string }[] }).variants
    .find((v) => v.equals === true)?.text;
  check("variant narration is preserved verbatim from the spec",
    firstSceneTrue === trueIdx[0].narration);
  console.log("");

  // 4) The lifecycle ordering invariant holds structurally.
  console.log("lifecycle ordering:");
  const minReaderPhase = Math.min(...rs.map((e) => e.phase_min));
  check("setter phase_max strictly precedes every reader phase_min",
    s.phase_max < minReaderPhase, `setter.phase_max=${s.phase_max}, min reader.phase_min=${minReaderPhase}`);
  console.log("");

  // 5) A minimal CampaignData carrying these pieces validates clean.
  console.log("validate() on a minimal CampaignData carrying the pieces:");
  const report = validate(buildMinimalCampaign(pieces));
  const unusedFlagFindings = report.findings.filter(
    (f) => f.field === "flags\u2192writes" || f.field === "flags\u2192reads",
  );
  check("zero errors", report.failed === 0,
    report.findings.filter((f) => f.level === "error").map((f) => `[${f.field}] ${f.message}`).join("; "));
  check("zero unused-flag warnings", unusedFlagFindings.length === 0,
    unusedFlagFindings.map((f) => `[${f.field}] ${f.message}`).join("; "));
  check("zero warnings overall", report.warnings === 0,
    report.findings.filter((f) => f.level === "warn").map((f) => `[${f.field}] ${f.message}`).join("; "));
  console.log(`  (validate(): ${report.passed} checks passed, ${report.failed} errors, ${report.warnings} warnings)`);
  console.log("");

  console.log(`=== ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

main();
