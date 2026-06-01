// Reckoning harness — renders the character-mode closing readout from a
// generated campaign at SEVERAL family/community track combinations, without a
// full playthrough. Mirrors the render logic in src/GeneratedCampaign.tsx (the
// reckoning early-return): two SEPARATE tiered readouts via resolveFlagText +
// the factual economy coda. Lets us READ whether the prose lands across the
// whole tier range, not just one outcome.
//
//   npx tsx generator/inspect-reckoning.ts
//
// The economy coda is shown with an ILLUSTRATIVE end-of-run resource state
// (resources are independent of the tracks — they reflect whatever a real
// playthrough leaves behind). Each combo is paired with a thematically-fitting
// economy purely so the corroboration reads ("$3 and a near-empty larder"
// alongside "they remember who was not there"); the pairing is not mechanical.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveFlagText } from "./schema";
import type { CampaignData, FlagValue } from "./schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  readFileSync(join(__dirname, "joseph-generated-output.json"), "utf8"),
) as CampaignData;

// Money detection mirrors src/GeneratedCampaign.tsx (MONEY_RE / findMoneyKey).
const MONEY_RE = /cash|coin|money|silver|gold|fund|treasur|budget|capital|wealth|currency|denari|florin|dinar|ducat|specie|bullion|purse/i;
const isMoney = (key: string, label?: string) =>
  MONEY_RE.test(key) || (label ? MONEY_RE.test(label) : false);
const moneyKey = Object.keys(data.initialResources ?? {}).find((k) =>
  isMoney(k, data.resourceLabels?.[k]),
);

// Factual coda, exactly as the component formats it: money key prefixed with
// "$", everything else a plain rounded number. Never evaluative.
function coda(resources: Record<string, number>): string {
  return Object.entries(resources)
    .map(([k, v]) => {
      const label = data.resourceLabels?.[k] ?? k;
      const val = k === moneyKey ? `$${Math.round(v)}` : `${Math.round(v)}`;
      return `${label} ${val}`;
    })
    .join("  ·  ");
}

interface Combo {
  name: string;
  family: number;
  community: number;
  economy: Record<string, number>; // illustrative end-of-run state
}

// keys from joseph-generated-output.json: wages (Cash on Hand), larder (Food
// Stores), familyStanding (Your Family's Security). Tracks range [-10, 10];
// tier thresholds are ≥4 / -3..3 / ≤-4.
const combos: Combo[] = [
  {
    name: "family HIGH / community LOW   — the absent-father case",
    family: 7,
    community: -7,
    economy: { wages: 26, larder: 24, familyStanding: 72 },
  },
  {
    name: "family LOW / community HIGH   — gave to others at home's cost",
    family: -7,
    community: 7,
    economy: { wages: 3, larder: 6, familyStanding: 30 },
  },
  {
    name: "both MIDDLE                   — recognizably human, inconsistent",
    family: 0,
    community: 0,
    economy: { wages: 11, larder: 14, familyStanding: 48 },
  },
  {
    name: "both HIGH                     — the corner: held it all together",
    family: 8,
    community: 8,
    economy: { wages: 6, larder: 12, familyStanding: 58 },
  },
  {
    name: "both LOW                      — the corner: survived, kept apart",
    family: -8,
    community: -8,
    economy: { wages: 2, larder: 4, familyStanding: 24 },
  },
];

const reck = data.reckoning;
if (!reck) {
  console.error("This campaign has no `reckoning` field — nothing to render.");
  process.exit(1);
}

const RULE = "━".repeat(78);
console.log(`\n${RULE}`);
console.log(`  RECKONING HARNESS — ${data.title}`);
console.log(`  (no grade · no rating · no ledger — two separate truths + factual coda)`);
console.log(RULE);

for (const c of combos) {
  const flags: Record<string, FlagValue> = {
    family: c.family,
    community: c.community,
  };
  const familyText = resolveFlagText(reck.family, flags);
  const communityText = resolveFlagText(reck.community, flags);

  console.log(`\n${RULE}`);
  console.log(`▌ ${c.name}`);
  console.log(`▌ family=${c.family >= 0 ? "+" : ""}${c.family}   community=${c.community >= 0 ? "+" : ""}${c.community}`);
  console.log(RULE);

  console.log(`\n  ── Those closest to you ──   (how your family came to regard you)\n`);
  console.log(wrap(familyText, "    "));

  console.log(`\n  ── The people around you ──   (how the wider community came to regard you)\n`);
  console.log(wrap(communityText, "    "));

  console.log(`\n  Where things stood at year's end`);
  console.log(`    ${coda(c.economy)}`);
}

console.log(`\n${RULE}\n`);

// Soft wrap for terminal readability so the prose reads like prose.
function wrap(text: string, indent: string, width = 74): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > width) {
      lines.push(indent + line.trim());
      line = w;
    } else {
      line += " " + w;
    }
  }
  if (line.trim()) lines.push(indent + line.trim());
  return lines.join("\n");
}
