#!/usr/bin/env npx tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
// ════════════════════════════════════════════════════════════════
// Stage 2 end-to-end proof: generate ONE character campaign from a real
// standard (Joseph / Reconstruction) with ZERO hand-authoring, exactly as
// the studio pipeline now does it:
//
//   frame  →  (chosen perspective)  →  faultline + economy + cast  →  core.ts
//
// Then prove the OUTPUT structurally:
//   - schema-valid (validate() zero errors)
//   - flags[] present
//   - exactly ONE early setter event with flagWrites on >=2 options writing
//     >=2 distinct values
//   - >=1 later reader event with FlagText variants
//   - setter phase strictly before every reader phase
//
// Writes the full generated campaign to generator/joseph-generated-output.json.
// Run:  npm run e2e:character
// ════════════════════════════════════════════════════════════════
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync } from "fs";
import { generateFrame } from "./frame.js";
import { generateEconomy } from "./economy.js";
import { generateCast } from "./cast.js";
import { generateFaultLine } from "./faultline.js";
import { generateCampaign, type GenerateInputs } from "./core.js";
import { validate } from "./validate.js";

const __root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(__root, ".env.local") });

const STANDARD =
  "TEKS 8.9 — Reconstruction: the experience of freedpeople, the Black Codes, and the promise and collapse of federal protection in the postwar South";
const FALLBACK_PERSPECTIVE = {
  role: "Joseph, a freedman in the Reconstruction South",
  description:
    "A formerly enslaved man living through Reconstruction, weighing how openly to claim the rights the law now names.",
};

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "\u2713" : "\u2717"} ${label}${ok || !detail ? "" : `\n      ${detail}`}`);
  if (!ok) failed++;
};

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set (.env.local).");
    process.exit(1);
  }

  console.log("\n=== Stage 2: end-to-end CHARACTER generation (Joseph / Reconstruction) ===\n");
  console.log(`Standard: ${STANDARD}\n`);

  // 1) Frame.
  console.log("→ /api/frame …");
  const { data: frame } = await generateFrame(STANDARD, apiKey);
  console.log(`   campaignType=${frame.campaignType}  progressionMode=${frame.progressionMode}`);
  const isCharacter = frame.campaignType === "character";
  const persp = isCharacter ? frame.recommendedPerspective : FALLBACK_PERSPECTIVE;
  if (!isCharacter) {
    console.log(`   (frame proposed '${frame.campaignType}'; forcing the character path with a Joseph perspective to exercise Stage 2)`);
  }
  const perspString = `${persp.role} — ${persp.description}`;
  console.log(`   perspective: ${perspString}\n`);

  // 2) Fault line (chosen perspective) + economy + cast, in parallel.
  console.log("→ /api/faultline + /api/economy + /api/cast …");
  const [flRes, ecoRes, castRes] = await Promise.all([
    generateFaultLine(STANDARD, perspString, apiKey),
    generateEconomy(STANDARD, apiKey),
    generateCast(STANDARD, apiKey),
  ]);
  const flErrors = flRes.findings.filter((f) => f.level === "error");
  console.log(`   fault line: flag='${flRes.data.flag.id}' (${flRes.data.flag.type}), ${flRes.data.setter.options.length} setter options, ${flRes.data.readers.length} reader entries`);
  console.log(`   fault-line validation: ${flErrors.length} errors, ${flRes.findings.length - flErrors.length} warnings\n`);
  check("proposed fault line has zero validation errors", flErrors.length === 0,
    flErrors.map((f) => `[${f.field}] ${f.message}`).join("; "));

  // 3) Full campaign generation (core.ts compiles + splices the fault line).
  const inputs: GenerateInputs = {
    topic: persp.role,
    standard: STANDARD,
    grade: "8th grade",
    length: 6,
    numQuestions: 4,
    numSages: 3,
    difficulty: "medium",
    artStyle: "broadsheet-sepia",
    frame: frame.frame,
    playerRole: perspString,
    cast: castRes.data.cast,
    economy: ecoRes.data,
    faultLine: flRes.data,
  };
  console.log("→ generateCampaign (3–5 min) …");
  const result = await generateCampaign(apiKey, inputs);
  console.log(`   done in ${result.elapsedSeconds.toFixed(0)}s\n`);

  const data = result.data as any;
  const outPath = resolve(__root, "generator/joseph-generated-output.json");
  writeFileSync(outPath, JSON.stringify(data, null, 2), "utf8");
  console.log(`Wrote generated campaign to ${outPath}\n`);

  // ── Structural proof ──────────────────────────────────────────
  console.log("Structural checks on the GENERATED output:\n");

  // schema-valid
  const report = validate(data);
  check("schema-valid (validate() zero errors)", report.failed === 0,
    report.findings.filter((f) => f.level === "error").map((f) => `[${f.field}] ${f.message}`).join("; "));

  // flags[] present
  const flags = Array.isArray(data.flags) ? data.flags : [];
  check("flags[] present and non-empty", flags.length >= 1,
    `flags=${JSON.stringify(flags)}`);
  const declaredIds = new Set(flags.map((f: any) => f?.id));

  // exactly one setter event with flagWrites on >=2 options writing >=2 distinct values
  const events: any[] = Array.isArray(data.events) ? data.events : [];
  const setters = events.filter(
    (e) => Array.isArray(e.choices) && e.choices.some((c: any) => c && c.flagWrites),
  );
  check("exactly ONE event carries flagWrites (the setter)", setters.length === 1,
    `found ${setters.length}: ${setters.map((e) => e.id).join(", ")}`);
  const setter = setters[0];
  if (setter) {
    const writers = setter.choices.filter((c: any) => c.flagWrites);
    check("setter has >=2 options writing the flag", writers.length >= 2,
      `${writers.length} option(s) with flagWrites`);
    const distinct = new Set(writers.map((c: any) => JSON.stringify(c.flagWrites)));
    check("setter options write >=2 DISTINCT flag values", distinct.size >= 2,
      `distinct writes: ${[...distinct].join(" | ")}`);
    check("setter options carry NO resource effects (identity is a flag, not a score)",
      writers.every((c: any) => !("effects" in c)));
  }

  // >=1 later reader with FlagText variants, all reading a declared flag
  const readers = events.filter(
    (e) => e.text && typeof e.text === "object" && Array.isArray(e.text.variants),
  );
  check(">=1 reader event with FlagText variants", readers.length >= 1,
    `found ${readers.length}`);
  const allVariantsDeclared = readers.every((e) =>
    e.text.variants.every((v: any) => declaredIds.has(v.whenFlag)),
  );
  check("every reader variant reads a DECLARED flag", allVariantsDeclared);

  // setter phase strictly before every reader phase
  if (setter && readers.length >= 1) {
    const minReader = Math.min(...readers.map((e) => e.phase_min));
    check("setter phase_max strictly precedes every reader phase_min",
      setter.phase_max < minReader,
      `setter.phase_max=${setter.phase_max}, min reader.phase_min=${minReader}`);
  }

  // ── Echo the fault-line slice + surrounding event titles ──────
  console.log("\n--- Compiled fault-line slice in the generated campaign ---");
  console.log("flags[]:", JSON.stringify(data.flags, null, 2));
  console.log("\nsetter event:", JSON.stringify(setter, null, 2));
  console.log("\nreader events:", JSON.stringify(readers, null, 2));
  console.log("\nAll event ids/titles (setter + readers are fl_*):");
  for (const e of events) console.log(`  - ${e.id} :: ${e.title}  [phase ${e.phase_min}-${e.phase_max}]`);

  console.log(`\n=== ${failed === 0 ? "ALL STRUCTURAL CHECKS PASSED" : `${failed} CHECK(S) FAILED`} ===`);
  console.log("(Stage 3 — play-testing — is the human's gate; this is NOT 'done'.)\n");
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
