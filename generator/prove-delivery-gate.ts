// Proof harness for the delivery validation gate (validateForDelivery).
//
//   npx tsx generator/prove-delivery-gate.ts
//
// Exercises three cases WITHOUT calling the model:
//   1. A clean SYSTEMS campaign (no faultLine/personalEconomy inputs) → SHIPS.
//   2. The hand-tuned JOSEPH character campaign + its specs → SHIPS (all batteries).
//   3. A deliberately FRONTIER-LEAKED Joseph clone → REJECTED, showing the readout
//      exactly as the dev API surfaces it ("[field] message").
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { validateForDelivery } from "./core.js";
import type { FaultLineSpec } from "./faultline.js";
import type { PersonalEconomy } from "./personalEconomy.js";

const here = dirname(fileURLToPath(import.meta.url));
const load = (p: string) => JSON.parse(readFileSync(resolve(here, p), "utf-8"));

// ── Joseph's specs (the generation INPUTS the proposers would emit) ──
const josephFaultLine: FaultLineSpec = {
  campaignType: "character",
  dilemma:
    "Does Joseph let his name stand openly on the voter rolls, or stay off them to keep his family safe?",
  whyNoCleanAnswer:
    "To register is to claim the freedom the law now promises, at the risk of night-rider violence to his family; to stay off the rolls is to keep them whole, at the cost of the very rights he was freed to hold. Neither choice is the one a good man simply makes.",
  flag: { id: "assertedRights", type: "boolean", initial: false, label: "Let his name stand on the rolls in daylight" },
  values: [
    { value: true, meaning: "A man who let his name stand in daylight, and carries both the danger and the dignity of being seen." },
    { value: false, meaning: "A man who kept his family whole by staying unseen, and carries the safety and the swallowed shame of it." },
  ],
  setter: {
    beat: "The Registrar's Book",
    situation:
      "The registrar's office smells of ink and old smoke. The book lies open on the table, a column of names half filled. To sign is to be counted — and to be counted is to be seen, by everyone, including men who would rather I vanish.",
    options: [
      { choiceText: "Register to vote, in daylight, where everyone can see.", writes: true, moralReading: "I take the pen. The clerk writes my name out in full. Whatever comes now, it comes to a man who is on the rolls." },
      { choiceText: "Stay off the rolls this year. Keep the family whole.", writes: false, moralReading: "I tell the clerk I will think on it, and we go. The book stays one name short." },
    ],
  },
  readers: [
    { beat: "Hoofbeats After Midnight", whenValue: true, narration: "Hooves on the road past midnight. My name is on the list and every soul in the county knows it. The riders slow at our gate, then move on — this time. I do not sleep." },
    { beat: "Hoofbeats After Midnight", whenValue: false, narration: "Hooves on the road past midnight. There is no name here to punish. They pass, and the safety tastes like ashes." },
  ],
};

const josephPersonalEconomy: PersonalEconomy = {
  campaignType: "character",
  premise: "A freedman's household lives on the cash crop, the larder, and standing on the street.",
  resources: [
    { name: "cash", playerFacing: "Cash", description: "Spendable coins for the year.", startsAt: "low", raisedBy: "wages, selling crop", drainedBy: "rent, supplies, helping kin", degradationEffect: "harder terms, leaner choices", isMoney: true },
    { name: "larder", playerFacing: "The Larder", description: "Food put by for the family.", startsAt: "moderate", raisedBy: "a good harvest", drainedBy: "hard winters, extra mouths", degradationEffect: "hungry, weaker bargaining" },
    { name: "standing", playerFacing: "Standing on the Street", description: "How neighbors reckon you.", startsAt: "moderate", raisedBy: "showing up, keeping word", drainedBy: "broken promises, absence", degradationEffect: "fewer allies when it counts" },
  ],
  primaryResource: "standing",
};

const sep = (s: string) => console.log(`\n${"═".repeat(72)}\n${s}\n${"═".repeat(72)}`);

function report(label: string, data: unknown, inputs: { faultLine?: FaultLineSpec; personalEconomy?: PersonalEconomy }) {
  const { findings, errorCount } = validateForDelivery(data, inputs);
  const errs = findings.filter((f) => f.level === "error");
  const warns = findings.filter((f) => f.level === "warn");
  const verdict = errorCount === 0 ? "✅ SHIPS" : "⛔ REJECTED";
  console.log(`\n${label}: ${verdict}  (${errorCount} error, ${warns.length} warn)`);
  if (errs.length) {
    console.log("  ── rejection readout (as the API surfaces it) ──");
    for (const f of errs) console.log(`  [${f.field}] ${f.message}`);
  }
  if (warns.length) for (const f of warns) console.log(`  (warn) [${f.field}] ${f.message}`);
  return errorCount;
}

// ── Case 1: clean systems campaign ──
sep("CASE 1 — clean SYSTEMS campaign (Erie Canal, generator/output-erie.json)");
report("systems output-erie.json", load("output-erie.json"), {});

// ── Case 2: hand-tuned Joseph character campaign + its specs ──
sep("CASE 2 — hand-tuned JOSEPH character campaign + faultLine + personalEconomy");
const joseph = load("joseph-generated-output.json");
report("joseph (full battery)", joseph, { faultLine: josephFaultLine, personalEconomy: josephPersonalEconomy });

// ── Case 3: deliberately frontier-leaked Joseph ──
// The frontier guard now fires only on DEVOTION-to-both (both tracks ≥ +9), so
// the break must pin both that high. We add a strong "help both" choice
// (+5 family / +5 community) to every event that already moves a track, WITHOUT
// removing the genuine conflict/negative choices. That's the true dodgeable
// leak: real tradeoffs exist, but a player can dodge them all down one
// help-both line and end DEVOTED to everyone. With ≥2 such events the best
// both-line clears +9/+9, so the frontier guard must fire at the new threshold.
sep("CASE 3 — deliberately BROKEN Joseph (frontier leak: dodgeable help-both line reaches devotion-to-both)");
const broken = JSON.parse(JSON.stringify(joseph));
for (const ev of broken.events ?? []) {
  const choices = ev.choices;
  if (!Array.isArray(choices) || choices.length === 0) continue;
  const movesTrack = choices.some(
    (c: any) => c.flagWrites && typeof c.flagWrites === "object" &&
      (typeof c.flagWrites.family === "number" || typeof c.flagWrites.community === "number"),
  );
  if (!movesTrack) continue;
  // Graft a costless help-both option onto the first choice (keep the rest,
  // including conflicts/negatives, intact).
  choices[0].flagWrites = { ...(choices[0].flagWrites ?? {}), family: 5, community: 5 };
}
report("broken joseph (frontier)", broken, { faultLine: josephFaultLine, personalEconomy: josephPersonalEconomy });

sep("DONE");
