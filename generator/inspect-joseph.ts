#!/usr/bin/env npx tsx
// Throwaway validator for the hand-built Joseph / Reconstruction test campaign.
// Loads the fixture as CampaignData and runs validate() against it, printing
// the report. Exits non-zero if there are any errors (warnings are allowed):
//   npm run joseph
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { validate, printReport } from "./validate.js";

const __root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = resolve(__root, "fixtures/joseph-reconstruction.json");

const raw = readFileSync(FIXTURE, "utf8");
const data = JSON.parse(raw);

console.log(`Validating: ${FIXTURE}`);
const report = validate(data);
printReport(report);

if (report.failed > 0) process.exit(2);
