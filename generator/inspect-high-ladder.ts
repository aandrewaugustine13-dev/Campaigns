#!/usr/bin/env npx tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
// Render a character campaign's reckoning up the HIGH ladder (both tracks equal)
// so we can read WHERE the prose turns from "did right by them" to
// "devotion / beloved / gave everything" — the point that sets the frontier cutoff.
//
//   npx tsx generator/inspect-high-ladder.ts generator/probe-out/lowell.json
//
// Also dumps the raw band thresholds so the tier count (3 vs 5) is unambiguous.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveFlagText } from "./schema";
import type { CampaignData, FlagValue } from "./schema";

const file = process.argv[2];
if (!file) {
  console.error("usage: npx tsx generator/inspect-high-ladder.ts <campaign.json>");
  process.exit(1);
}
const data = JSON.parse(readFileSync(resolve(file), "utf8")) as CampaignData;
const reck = data.reckoning;
if (!reck) {
  console.error(`${file} has no reckoning field.`);
  process.exit(1);
}
const RULE = "━".repeat(78);

function wrap(text: string, indent = "    ", width = 74): string {
  const words = text.split(/\s+/); const lines: string[] = []; let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > width) { lines.push(indent + line.trim()); line = w; }
    else line += " " + w;
  }
  if (line.trim()) lines.push(indent + line.trim());
  return lines.join("\n");
}

const ladder = [[4, 4], [5, 5], [6, 6], [7, 7], [9, 9]];

console.log(`\n${RULE}\n  ${data.title} — HIGH-LADDER reckoning (both tracks equal)\n${RULE}`);
for (const [f, c] of ladder) {
  const flags: Record<string, FlagValue> = { family: f, community: c };
  console.log(`\n${RULE}\n▌ family=+${f}   community=+${c}\n${RULE}`);
  console.log(`\n  ── Those closest to you ──\n`);
  console.log(wrap(resolveFlagText(reck.family, flags)));
  console.log(`\n  ── The people around you ──\n`);
  console.log(wrap(resolveFlagText(reck.community, flags)));
}

console.log(`\n${RULE}\n  RAW BANDS (tier count + thresholds)\n${RULE}`);
for (const track of ["family", "community"] as const) {
  const ft = (reck as any)[track];
  console.log(`\n${track}: ${(ft?.variants?.length ?? 0)} variant band(s) + default`);
  for (const v of ft?.variants ?? [])
    console.log(`  whenAtLeast=${v.whenAtLeast ?? "—"} whenAtMost=${v.whenAtMost ?? "—"} :: "${String(v.text).slice(0, 64)}…"`);
  console.log(`  default :: "${String(ft?.default).slice(0, 64)}…"`);
}
console.log();
