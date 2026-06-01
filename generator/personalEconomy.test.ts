#!/usr/bin/env npx tsx
// ════════════════════════════════════════════════════════════════
// validatePersonalEconomy guardrails — the small concrete personal
// economy that replaces the systems macro-meters for character mode.
//
// Locks the load-bearing invariants:
//   - exactly ONE money resource; 2–3 total
//   - primaryResource is a NON-money resource (cash is never the score)
//   - no resource named "morale" (engine fail special-case)
//   - degradationEffect can't imply death/termination
//
// No model call. Run with:  npm run test:personal-economy
// ════════════════════════════════════════════════════════════════
import { validatePersonalEconomy, type PersonalEconomy } from "./personalEconomy.js";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  \u2713 ${label}`); }
  else { failed++; console.log(`  \u2717 ${label}${detail ? `\n      ${detail}` : ""}`); }
}

const valid = (): PersonalEconomy => ({
  campaignType: "character",
  premise: "A freedman's household lives on the cash crop, the larder, and standing on the street.",
  resources: [
    { name: "cash", playerFacing: "Cash", description: "Spendable coins for the year.", startsAt: "low", raisedBy: "wages, selling crop", drainedBy: "rent, supplies, helping kin", degradationEffect: "harder terms, leaner choices", isMoney: true },
    { name: "larder", playerFacing: "The Larder", description: "Food put by for the family.", startsAt: "moderate", raisedBy: "a good harvest", drainedBy: "hard winters, extra mouths", degradationEffect: "hungry, weaker bargaining" },
    { name: "standing", playerFacing: "Standing on the Street", description: "How neighbors reckon you.", startsAt: "moderate", raisedBy: "showing up, keeping word", drainedBy: "broken promises, absence", degradationEffect: "fewer allies when it counts" },
  ],
  primaryResource: "standing",
});

const errs = (d: unknown) => validatePersonalEconomy(d).filter((f) => f.level === "error").map((f) => `[${f.field}] ${f.message}`);
const clone = (d: PersonalEconomy): any => JSON.parse(JSON.stringify(d));

function main() {
  console.log("\n=== validatePersonalEconomy ===\n");

  console.log("positive:");
  check("a valid money+2 personal economy has zero errors", errs(valid()).length === 0,
    errs(valid()).join("; "));

  console.log("\nguardrails:");

  const noMoney = clone(valid()); noMoney.resources.forEach((r: any) => { r.isMoney = false; });
  check("zero money resources ERRORS", errs(noMoney).some((e) => e.includes("exactly ONE")));

  const twoMoney = clone(valid()); twoMoney.resources[1].isMoney = true;
  check("two money resources ERRORS", errs(twoMoney).some((e) => e.includes("exactly ONE")));

  const moneyPrimary = clone(valid()); moneyPrimary.primaryResource = "cash";
  check("money as primaryResource ERRORS (cash is never the graded win)",
    errs(moneyPrimary).some((e) => e.includes("primaryResource") && e.toLowerCase().includes("money")));

  const tooMany = clone(valid());
  tooMany.resources.push({ name: "tools", playerFacing: "Tools", description: "x", startsAt: "low", raisedBy: "x", drainedBy: "x", degradationEffect: "x" });
  check("4+ resources ERRORS (must stay small, 2–3)", errs(tooMany).some((e) => e.includes("2\u20133")));

  const named = clone(valid()); named.resources[1].name = "morale";
  check('a resource named "morale" ERRORS (engine fail special-case)',
    errs(named).some((e) => e.includes("morale")));

  const deadly = clone(valid()); deadly.resources[1].degradationEffect = "the family dies of starvation";
  check("degradationEffect implying death ERRORS", errs(deadly).some((e) => e.includes("termination/death")));

  const badPrimary = clone(valid()); badPrimary.primaryResource = "nonexistent";
  check("primaryResource not in the set ERRORS", errs(badPrimary).some((e) => e.includes("not one of the resources")));

  const wrongType = clone(valid()); wrongType.campaignType = "systems";
  check('campaignType must be "character"', errs(wrongType).some((e) => e.includes("campaignType")));

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main();
