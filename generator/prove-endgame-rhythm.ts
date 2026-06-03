// Proof harness for the ENDGAME RHYTHM guard (validateEndgameRhythm) + the
// deterministic placement (reserveClosingDilemma / reader-window cap).
//
//   npx tsx generator/prove-endgame-rhythm.ts
//
// Proves, WITHOUT calling the model:
//   • a clean character campaign (re-placed Joseph) PASSES all three checks;
//   • each hand-broken variant REJECTS with the specific E1/E2/E3 finding;
//   • a systems campaign (no faultLine) never runs the guard (byte-identical).
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateEndgameRhythm, READER_PHASE_END } from "./faultlineCompile.js";
import { validateForDelivery } from "./core.js";

const here = dirname(fileURLToPath(import.meta.url));
const load = (p: string) => JSON.parse(readFileSync(resolve(here, p), "utf8"));
const clone = (x: unknown) => JSON.parse(JSON.stringify(x));
const sep = (s: string) => console.log(`\n${"═".repeat(72)}\n${s}\n${"═".repeat(72)}`);

const choiceCount = (e: any) => (Array.isArray(e.choices) ? e.choices.length : 0);

function report(label: string, data: any): number {
  const findings = validateEndgameRhythm(data);
  const errs = findings.filter((f) => f.level === "error");
  console.log(`\n${label}: ${errs.length === 0 ? "✅ PASS" : "⛔ REJECT"}  (${errs.length} error)`);
  for (const f of errs) console.log(`  [${f.field}] ${f.message}`);
  return errs.length;
}

function windows(label: string, data: any) {
  console.log(`  ${label} windows:`);
  for (const e of data.events ?? []) {
    const kind = choiceCount(e) === 1 ? "reader " : "dilemma";
    console.log(`    [${(e.phase_min ?? 0).toFixed(2)}, ${(e.phase_max ?? 1).toFixed(2)}]  ${kind}  ${(e.title ?? "").slice(0, 40)}`);
  }
}

const joseph = load("joseph-generated-output.json");

// ── Case 0: clean (re-placed Joseph) PASSES ──
sep("CASE 0 — clean character campaign (re-placed Joseph) → PASS");
windows("Joseph", joseph);
report("joseph endgame-rhythm", joseph);

// ── Case 1: E1 — no dilemma owns the tail (closer pulled back to mid-arc) ──
sep("CASE 1 — E1 break: closer re-windowed to mid-arc, nothing owns the tail");
const e1 = clone(joseph);
const tailDil = (e1.events as any[]).find((e) => choiceCount(e) >= 2 && (e.phase_min ?? 0) >= 0.8);
tailDil.phase_min = 0.45;
tailDil.phase_max = 0.75;
report("e1 (no late dilemma)", e1);

// ── Case 2: E2 — a reader tiles past the reader band to the very end ──
sep("CASE 2 — E2 break: a single-choice reader extended to phase_max 1.0");
const e2 = clone(joseph);
const aReader = (e2.events as any[]).find((e) => choiceCount(e) === 1);
aReader.phase_max = 1.0;
report("e2 (reader tiles tail)", e2);

// ── Case 3: E3 — too many reader beats for the dilemma bank ──
sep("CASE 3 — E3 break: extra single-choice reader beats exceed min(3, ⌈D/4⌉)");
const e3 = clone(joseph);
const D = (e3.events as any[]).filter((e) => choiceCount(e) >= 2).length;
const cap = Math.max(1, Math.min(3, Math.ceil(D / 4)));
const existingReaders = (e3.events as any[]).filter((e) => choiceCount(e) === 1).length;
for (let i = existingReaders; i <= cap + 1; i++) {
  (e3.events as any[]).push({ id: `extra_reader_${i}`, phase_min: 0.4, phase_max: 0.8, weight: 5, title: `Extra reflection ${i}`, text: "…", type: "standard", choices: [{ text: "Go on." }] });
}
console.log(`  D=${D} dilemmas → cap=${cap}; injected readers to total ${(e3.events as any[]).filter((e) => choiceCount(e) === 1).length}`);
report("e3 (over reader cap)", e3);

// ── Case 4: systems campaign → guard never runs (byte-identical delivery) ──
sep("CASE 4 — systems campaign (no faultLine): rhythm guard does NOT run");
const erie = load("output-erie.json");
const { findings } = validateForDelivery(erie, {});
const endgameFindings = findings.filter((f) => f.field.includes("endgame"));
console.log(`  validateForDelivery(systems, {}) → ${endgameFindings.length} endgame.* findings (expected 0)`);
console.log(`  ${endgameFindings.length === 0 ? "✅ guard skipped — systems delivery unchanged" : "⛔ guard leaked into systems"}`);

sep("DONE");
console.log(`(reader band ceiling = ${READER_PHASE_END})`);
