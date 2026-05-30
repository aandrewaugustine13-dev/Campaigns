#!/usr/bin/env npx tsx
// Stage 1 systems-safety proof: with no faultLine, the splice is a strict
// no-op and validation is unchanged. Uses generator/output.json (an existing
// generated CampaignData) as the stand-in systems campaign.
//
//   npm run test:stage1-safety
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { applyFaultLine } from "./core.js";
import { validate } from "./validate.js";

const __root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const original = JSON.parse(readFileSync(resolve(__root, "generator/output.json"), "utf8"));

let failed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`  ${ok ? "\u2713" : "\u2717"} ${label}${ok || !detail ? "" : `\n      ${detail}`}`);
  if (!ok) failed++;
};

console.log("\n=== Stage 1: systems-path safety (faultLine undefined) ===\n");

// 1) Splice is a strict no-op when faultLine is absent.
const clone = JSON.parse(JSON.stringify(original));
const beforeStr = JSON.stringify(clone);
applyFaultLine(clone, undefined);
check("applyFaultLine(data, undefined) leaves the campaign byte-identical",
  JSON.stringify(clone) === beforeStr);

// 2) Validation result is identical before vs. after the (no-op) splice.
const reportBefore = validate(original);
const reportAfter = validate(clone);
check("validate() report unchanged by the no-op splice",
  JSON.stringify(reportBefore) === JSON.stringify(reportAfter),
  `before: ${reportBefore.passed}/${reportBefore.failed}/${reportBefore.warnings}, after: ${reportAfter.passed}/${reportAfter.failed}/${reportAfter.warnings}`);
console.log(`  (systems campaign validate(): ${reportBefore.passed} passed, ${reportBefore.failed} errors, ${reportBefore.warnings} warnings)`);

console.log(`\n=== ${failed === 0 ? "PASS" : "FAIL"} ===\n`);
if (failed > 0) process.exit(1);
