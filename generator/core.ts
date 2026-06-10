import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { validate, type ValidationReport } from "./validate.js";
import { parseModelJson } from "./json.js";
import { enrichSagePortraits, enrichEventImages } from "./wikimedia.js";
import type { CastCharacter } from "./cast.js";
import type { SystemsEconomy } from "./economy.js";
import { type PersonalEconomy, validatePersonalEconomy } from "./personalEconomy.js";
import { type FaultLineSpec, validateFaultLine } from "./faultline.js";
import { faultLineToCampaignPieces, reserveClosingDilemma, validateEndgameRhythm } from "./faultlineCompile.js";
import { applyRelationshipTracks, validateRelationshipTracks } from "./relationshipTracks.js";
import type { FlagDecl } from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface GenerateInputs {
  topic: string;
  standard: string;
  grade: string;
  length: number;
  numQuestions: number;
  numSages: number;
  difficulty: string;
  // Optional locked constraints (Stage-1 artifacts authored / verified by a
  // teacher). When any of these is provided, buildUserMessage emits a LOCKED
  // CONSTRAINTS block that the SYSTEM_PROMPT treats as overriding its
  // journey / Oregon-Trail framing. When all four are absent, behavior is
  // byte-identical to the original path.
  frame?: string;
  playerRole?: string;
  cast?: CastCharacter[];
  economy?: SystemsEconomy;
  // CHARACTER-mode economy: a small, concrete, PERSONAL resource set
  // (money + 1–2 campaign-fit things) that replaces the abstract systems
  // macro-meters. Mutually exclusive with `economy` in practice — systems
  // campaigns pass `economy`, character campaigns pass `personalEconomy`.
  // Absent ⇒ no character economy block (systems prompt byte-identical).
  personalEconomy?: PersonalEconomy;
  // Optional CHARACTER-campaign spine. When present, its validated fault
  // line is COMPILED (generator/faultlineCompile.ts) into concrete pieces —
  // a declared flag, an early setter event carrying flagWrites, and later
  // reader events carrying FlagText variants — which are spliced into the
  // generated campaign, and a read-only summary is added to the prompt so
  // the model builds the surrounding campaign around (never re-resolving)
  // those fixed beats. Gated entirely on its own presence: when absent,
  // generation is byte-for-byte identical to the systems path.
  faultLine?: FaultLineSpec;
}

export interface GenerateResult {
  data: unknown;
  validation: ValidationReport;
  elapsedSeconds: number;
}

const schemaSource = readFileSync(resolve(__dirname, "schema.ts"), "utf-8");

function loadExample(): string {
  const base = resolve(__dirname, "../src/campaigns/chisholm");
  const config = readFileSync(resolve(base, "config.ts"), "utf-8");
  const events = readFileSync(resolve(base, "events.ts"), "utf-8");
  const sages = readFileSync(resolve(base, "sages.ts"), "utf-8");
  const routes = readFileSync(resolve(base, "routes.ts"), "utf-8");
  const eventTrivia = readFileSync(resolve(base, "eventTrivia.ts"), "utf-8");
  const trailMap = readFileSync(resolve(base, "trailMap.ts"), "utf-8");
  const outfitConfig = readFileSync(resolve(base, "outfitConfig.ts"), "utf-8");
  const index = readFileSync(resolve(base, "index.ts"), "utf-8");

  return [
    "=== EXAMPLE: Chisholm Trail campaign data files ===",
    "--- config.ts ---", config,
    "--- events.ts (first 3 events as example) ---", events.split("\n").slice(0, 60).join("\n"),
    "--- sages.ts (first sage as example) ---", sages.split("\n").slice(0, 45).join("\n"),
    "--- routes.ts ---", routes,
    "--- eventTrivia.ts ---", eventTrivia,
    "--- trailMap.ts ---", trailMap.split("\n").slice(0, 55).join("\n"),
    "--- outfitConfig.ts ---", outfitConfig,
    "--- index.ts (shows how fields map) ---", index,
  ].join("\n\n");
}

const SYSTEM_PROMPT = `You are a generator of historically authentic, standards-aligned educational "journey" campaigns in the style of Oregon Trail — one shared resource-management engine, with the content swapped per topic. You output ONLY a single JSON object. You never write code, components, or functions.

OVERRIDE: If the user message contains a "=== LOCKED CONSTRAINTS ===" block, those inputs are ground truth and OVERRIDE any genre, journey, trail, or Oregon-Trail framing elsewhere in this system prompt — build the campaign's real structure honestly to the declared frame, even where that conflicts with the language below.

CORE PHILOSOPHY (non-negotiable):
1. THE HISTORY IS THE MECHANICS. The resources you track must be the REAL logistical stakes of this specific historical endeavor — not generic food/gold/health slapped on every topic. Research what THIS journey actually had to manage and model THOSE. Playing the game IS learning what this endeavor truly demanded.
2. KNOWLEDGE DRIVES SUCCESS. Correct answers to standards-aligned questions produce the resource rewards that make the expedition thrive. A student who knows the material dominates.
3. LUCK IS TEXTURE, NOT STAKES. Random fortune adds fun and variety, but never requires knowledge. It's spice, not the meal.
4. CORE TENSION MAKES IT A GAME. There must be a real trade-off that forces decisions — typically push hard/fast vs. preserve the party/supplies. Speed traded against attrition.
5. EVENTS BREAK THE GRIND. Interrupt steady travel with: hard choices, setbacks, and lucky breaks — all themed to the REAL hazards and opportunities of THIS journey.
6. TEACH IN THE CONTENT, NEVER BOLT IT ON. The history lives in the authentic resources, the event flavor, and the question content — not in a popup lecture.

THE END CHECK FOR UNDERSTANDING:
- The eventTrivia array serves as the standards-aligned quiz.
- It must be PASSABLE by any student who engaged with the narrative.
- NEVER test knowledge the campaign did not actually teach. Every answer must be derivable from content the student encountered in play (event text, sage bios/advice, trivia snippets in events).
- The difficulty parameter scales RIGOR, not fairness.

STRUCTURAL RULES:
- BREVITY FOR READABILITY: this text is read on a small in-game panel, so keep it tight. Event \`text\` is 2-3 short sentences (about 45 words max) — set the scene and the stakes, then stop. Each choice \`text\` is a single short line (about 12 words max). Each question is one sentence; each answer choice is one short line. Sage \`greeting\` and \`advice\` are at most 2 sentences each; question \`explanation\` and event/trivia \`fact\` are at most 2-3 sentences. Favor concrete, vivid economy over exposition; never pad. Brevity is a hard requirement, not a stylistic preference.
- Every event must be either type "standard" (with choices array) or type "push_luck" (with attempts array + leaveText). Most should be standard; include 1-2 push_luck events for variety.
- Each choice in a standard event should either have flat \`effects\` + \`result\` (deterministic) OR an \`outcomes\` array (weighted random). Never both.
- MORAL TAGGING (feeds the campaign's closing moral verdict): when a choice carries a genuine MORAL dimension — it serves or betrays other people, holds or abandons integrity — add a \`moralTag\` set to ONE of: "principled" | "self-serving" | "obvious".
  - "principled": serves others / does the right thing / holds the line, AT A COST TO YOURSELF.
  - "self-serving": serves your own interest AT OTHERS' EXPENSE.
  - "obvious": the safe, telegraphed, frictionless call — the path of least resistance, coasting, "wait and see." NOT a moral failure, a thoughtlessness; the "took the easy road" option.
  - OMIT \`moralTag\` entirely on purely TACTICAL / LOGISTICS choices that carry no moral weight (e.g. fast route vs. safe route, which supplies to buy). Only morally-loaded choices are tagged; leaving tactical choices untagged keeps them out of the moral tally.
  - HOLDING A COSTLY POSITION IS A MORAL CHOICE, NOT A CONTINUATION. Choosing to HOLD, CONTINUE, or PERSIST in a stand that has become costly or dangerous is "principled" — it serves the cause at rising risk to yourself. Persisting under pressure is as morally loaded as initiating; do NOT reserve tags for choices that CHANGE direction (endorse, expand, defy, organize) while leaving the "keep holding the line under threat" option untagged. (The cost is what makes it moral — a frictionless "carry on as before" with no risk is still untagged.)
  - A GENUINE MORAL TRADE-OFF MUST BE TAGGED, never treated as a neutral negotiation. A choice that sacrifices one person or thing to protect others — e.g. "the leader stands down so the rank and file get amnesty" — is morally loaded. Whether it is "principled" or "self-serving" depends on who it ULTIMATELY serves: a costly sacrifice that protects the many is principled; trading away others to save yourself is self-serving.
  A choice's tag is about WHO IT SERVES AND WHO IT COSTS — never about whether it is mechanically optimal or rewarding. Worked example, at a strike under police/troop pressure: "Cross and report to work" = self-serving; "Stand with the strikers despite the cost" = principled; "Continue blocking the tracks despite the troops" = principled (a costly stand held under threat, NOT a tactical continuation); "Wait to see what the others do" = obvious; "Take the side road to avoid the crowd" = no tag (purely tactical).
- VERDICT (the campaign's moral close — author all THREE): output a top-level \`verdict\` object { "good": string, "bad": string, "indifferent": string }. One is shown at the end based on the player's hidden moral tally. They judge the player's CHARACTER — who they BECAME — not how well they played the game.
  - THE TALLY IS NOT A FLAG — DO NOT DECLARE ONE. The moral tally is computed automatically by the ENGINE from the per-choice \`moralTag\` values; it is never stored in the campaign JSON. Do NOT add a \`flags\` entry for the tally or the verdict — in particular do NOT create a numeric flag named \`moralWeight\` (or similar). The verdict is authored as PROSE ONLY (the three passages above); the tally that selects among them lives only in the engine. A generated journey/systems campaign outputs NO \`flags\` field at all.
  - \`good\`: the player who engaged and mostly chose the PRINCIPLED path.
  - \`bad\`: the player who engaged but mostly chose the SELF-SERVING path.
  - \`indifferent\`: the player who mostly took the OBVIOUS / coasting call — never really engaged, took the path of least resistance. NOT a moral failure, a thoughtlessness: you passed through this without it costing you anything, because you never engaged.
  Each verdict MUST:
  - Deliver a CLEAR verdict with ZERO ambiguity — look the player in the eye and tell them who they were. Never "what do you think this means."
  - Tie to the REAL historical outcome — use and echo this campaign's \`historicalContext\` (the actual fate of these people / this event). The character is rendered AGAINST what really happened. GOOD can still LOSE; BAD can still WIN materially; INDIFFERENT is cold. The verdict is NEVER congratulatory or "balanced" — it judges character, not optimization.
  - Imply a RETURN to the starting point — triumph or shame, you came back as this person.
  - Be COMPRESSED: about 3-5 short, declarative sentences. Gravitas comes from RESTRAINT, not from more words. STATE the feeling; do NOT explain it. This is the OPPOSITE of warm, long-winded educational prose — no editorializing, trust the weight.
  GOLD-STANDARD register — author in THIS exact voice. For the Pullman Strike (real outcome: strike broken, federal troops, ~30 dead, Eugene Debs imprisoned, the company won):
    good: "You stood with the workers. Not because it was safe — it wasn't — but because you'd seen the rent notices that didn't fall when the wages did, and you couldn't unsee them. It cost you. It cost them more. The troops came, the strike broke, and Eugene Debs went to prison for it. The company won, the way the company usually won in 1894. You lost. But you can name what you stood for, and history remembers the Pullman strikers as the ones who were right too early."
    bad: "You did the math, and the math said cross the line. Every time the choice came, you took the side that kept you fed and kept you safe. You weren't cruel. You were just looking out for yourself, and in 1894 that meant looking away from the people next to you. The strike broke. The company won. You were on the winning side. The men who went hungry holding the line went hungry without you. You can tell yourself you had no choice. You did. You made it."
    indifferent: "You kept your head down and took the easy road every time it offered itself. Not for the workers, not for the company — for the exit. When the choice was hard you waited for it to get simple, and it always did, because someone else made it for you. The strike happened around you. The troops came, the men died, Debs went to prison, and you were there. You passed through one of the hardest fights American workers ever picked, and it asked nothing of you, because you offered nothing. History didn't record where you stood. Neither could you."
  Match that compression, that flat unflinching judgment, that tie to the real outcome — for THIS campaign's own history.
- REVIEW SUMMARY (post-campaign recap + study aid): output a top-level \`reviewSummary\` string — flowing PROSE that recaps THIS campaign's events and history, about 300 words and NO MORE THAN ~325. It is shown at the very end as closure, and doubles as the study aid for the knowledge check.
  - IT MUST CONTAIN THE FULL, SPECIFIC ANSWER TO EVERY EXAM QUESTION you authored in \`eventTrivia\` — you wrote those questions, so you know exactly which facts the exam tests. Recoverable means the EXACT tested specific appears, not merely gestured at: if the correct answer hinges on an ENUMERATED LIST, every item in it must appear; if it hinges on a NAME, NUMBER, DATE, or LAW, that exact name/number/date/law must appear. A general paraphrase of a specific answer FAILS — e.g. if the answer is "the company owned the homes, the stores, and the church," the summary saying "a company-owned town" is NOT enough; the church must be named. Before finishing, CROSS-CHECK each exam question against your summary and confirm its complete correct answer is fully present.
  - EMBED THE ANSWERS IN THE NARRATIVE — NEVER SIGNPOST THEM. Do NOT label answers, do NOT restate or echo the question wording, do NOT write "the answer is" or "remember that" or "importantly". The tested facts must sit naturally inside a readable recap of what happened. A player who paid attention can RE-SCAN and find them fast; a player who didn't must actually READ and absorb. A thinly-disguised answer key (facts in question-order, or each sentence obviously keyed to one question) FAILS this — write a genuine recap that happens to be complete, not a list in disguise.
  - BUDGET THE WORDS ON THE TESTED FACTS. The tested specifics are NON-NEGOTIABLE and must all fit inside ~300 words; atmospheric color and non-load-bearing flavor are what you CUT to make room for them. Spend the budget on the facts the exam tests plus just enough connective narrative to keep it a genuine recap (not a list); trim everything that isn't carrying a tested fact or the through-line. If you are running long, cut flavor, never a tested specific.
  - TONE: clear, informative, age-appropriate explanation — the STUDY/CLOSURE register, NOT the verdict's compressed gravitas. Straightforwardly explanatory is correct here; the job is comprehension, not emotional weight. Reference the real events, the people, and the historicalContext so it reinforces what the playthrough actually covered.
- Outcomes must have positive integer \`weight\` values. Higher weight = more likely.
- Resource keys in effects/rewards/penalties MUST be keys that exist in initialResources. This is critical — a mismatched key silently breaks the game.
- Sage thresholds are trail progress percentages (0-100) at which the sage encounter triggers. Space them roughly evenly across the journey.
- Route must start with a node id "start" and end with a terminal node (empty edges array). Every edge \`to\` must reference an existing node id.
- trailPath coordinates are [x, y] percentages (0-100) representing the trail on a map. Start and end should roughly correspond to the real geography.
- trailStops must reference valid pathIndex values (indices into the trailPath array).
- Event phase_min/phase_max are 0.0-1.0 floats representing what portion of the journey the event can trigger in.
- pixelColors maps color-name strings to hex color codes (e.g. "skin": "#D4A574"). pixelFaces maps role ids to arrays of FaceLevel objects (threshold-based sprite swaps for the HUD). For a generated campaign, provide reasonable placeholder data.
- theme: pick ONE value from this allowlist whose era and visual register match the topic. Allowed values: "frontier-leather", "broadsheet-sepia", "parchment-medieval", "expedition-journal", "declassified-typewriter", "classical-marble", "civil-rights-midcentury", "default". PRECEDENCE: when a topic fits one of the narrower buckets — frontier-leather (westward/frontier/trail/gold-rush), expedition-journal (exploration), civil-rights-midcentury (1950s-60s social struggle), declassified-typewriter (20th-c Cold War/political) — that narrower bucket WINS over broadsheet-sepia; broadsheet-sepia is the fallback for 19th-c American topics that no narrower bucket covers. Era guidance — frontier-leather: 19th-c westward US (cattle, trails, gold rush, frontier outposts); broadsheet-sepia: the 19th-c American print/news/civic sphere — topics about newspapers, politics, civic infrastructure, and public life (Erie Canal, the Alamo, the Civil War); do NOT use broadsheet-sepia for 20th-century topics (use declassified-typewriter or civil-rights-midcentury) or for frontier/exploration topics (use frontier-leather or expedition-journal); parchment-medieval: medieval and ancient Christian/Islamic world (Crusades, Black Death, illuminated-manuscript era); expedition-journal: exploration eras (Lewis & Clark, Magellan, Captain Cook, naturalist field-journal feel); declassified-typewriter: 20th-c Cold War / intelligence / mid-century political (Cuban Missile Crisis, Berlin Airlift, post-WWII document era); classical-marble: Greek and Roman antiquity (Punic Wars, Athenian Empire, anything BCE Mediterranean); civil-rights-midcentury: the US civil-rights era and mid-20th-century American social struggle (Montgomery Bus Boycott, Little Rock, the sit-ins, the March on Washington, mid-century labor strikes) — a dignified documentary-newsprint register; default: fall back when no theme cleanly fits — do NOT force a theme that misses the era.
- outfitConfig.costs keys should match the equipment/supplies a player can buy for THIS journey — not generic Oregon Trail items. Think about what THIS expedition actually needed to prepare.
- imageStyleKeyword: ONE word matching the dominant visual medium of the topic's era. Examples: "lithograph" (most 19th-century US topics), "engraving" (older prints, 17th-18th century), "painting" (any era with portraitable subjects), "illumination" (medieval manuscripts), "photograph" (late 19th century onward), "daguerreotype" (1840s-1860s), "woodcut" (Renaissance, early printing). This is a one-token ranking booster for Wikimedia Commons file search — keep it strictly to ONE word.
- Each event MUST include an imageSearchQuery: a short Wikimedia Commons file-search query for this event's visual. 2-4 words. The SUBJECT of the query must be a SPECIFIC, DEPICTABLE NAMED THING that period artists actually portrayed: a named battle, a named person, a named place/fort/ship, a named treaty or document, or a dated named event. Optionally add a year (e.g. "1813") or a one-word medium (e.g. "engraving", "lithograph", "painting"). THE TEST: would a period artist have made a print OF this exact subject? If the query's head noun is an abstract concept, a social process, or a logistical category, Commons holds only BOOKS about it, not images — rewrite it around the nearest NAMED, DATED, DEPICTABLE event instead. For a beat that is genuinely about an undepictable logistical concept, (a) anchor to the nearest named depictable event/person/place/fort tied to that beat (real period art, the strongly preferred path); only if nothing named honestly fits, (b) emit no imageSearchQuery at all — an imageless event falls back cleanly to the campaign backdrop, which beats forcing an abstract query that returns a book scan. Do NOT write descriptive sentences. Do NOT use verbs like "writing", "marching", "supplying", "fighting". Do NOT make the subject an abstraction (e.g. "impressment", "supply", "militia camp", "naval power"). Examples of GOOD queries (named depictable subjects that return real period engravings): "Battle of Lake Erie 1813", "Burning of Washington 1814", "Isaac Brock Queenston Heights 1812", "Tecumseh Thames 1813", "Erie Canal 1825", "Alamo Travis". Examples of BAD queries: "Royal Navy impressment 1812" (abstract concept → book scans, not a depicted scene), "War of 1812 supply wagons frontier" (logistical category → empty image pool), "American militia camp supply" (generic category → matches book titles), "Travis writing letter Alamo defenders" (descriptive sentence + verb → matches book titles).

OUTPUT FORMAT:
Output ONLY a single JSON object conforming to the CampaignData schema. No markdown, no code fences, no explanation. Just the JSON.`;

// Build the LOCKED CONSTRAINTS block injected before the example dump when
// the caller supplies any Stage-1 artifact. The block declares the frame,
// player role, cast, and economy as ground truth and tells the model to
// build the campaign AROUND them — including OMITTING journey-only fields
// honestly when the frame is not a journey, rather than faking them.
function buildLockedConstraints(inputs: GenerateInputs): string {
  const { frame, playerRole, cast, economy, personalEconomy } = inputs;
  if (!frame && !playerRole && !cast && !economy && !personalEconomy) return "";

  const lines: string[] = [];
  lines.push("");
  lines.push("=== LOCKED CONSTRAINTS (ground truth — overrides system prompt and example) ===");
  lines.push("");
  lines.push(
    "These inputs were authored and verified by a teacher. Build the campaign AROUND them. Do NOT invent new resources, rename them, drop them, regenerate your own, swap cast members, or reshape the campaign into a journey if the frame is not a journey.",
  );
  lines.push("");

  if (frame) {
    lines.push("--- FRAME (the kind of experience this is — controlling structure) ---");
    lines.push(frame);
    lines.push("");
    lines.push(
      "The FRAME is the controlling structure of this campaign. If the frame says this is NOT a journey, you MUST NOT produce a journey/trail/route/supply-trek structure: no \"press onward,\" no SAFE/FAST/PROFIT route forks, no trail stops, no trading posts, no point-A-to-point-B travel, unless the frame explicitly calls for them. The Chisholm example below is ONE possible shape among many — your structure follows the FRAME, NOT the example.",
    );
    lines.push("");
    lines.push(
      "PROGRESSION MODE: at the top level of the JSON output, set \"progressionMode\" to \"project\" when the frame is NOT a journey, or to \"journey\" (or omit it) when it IS. This single field tells the engine and validator which shape this campaign takes.",
    );
    lines.push("");
    lines.push(
      "HONEST STRUCTURE OVER FAKE TRAVEL: in project mode, OMIT or leave empty the journey-only fields rather than fake them. Specifically set totalDistance to 0, distanceUnit to \"\", paces to [], trailPath to [], trailStops to [], and outfitConfig.herdOptions to []; reduce route to a single terminal node like [{ \"id\": \"start\", \"title\": \"...\", \"description\": \"...\", \"edges\": [] }]. Do not invent miles, paces, trail coordinates, or route forks just to fill these fields. An empty field is the correct answer here, not a project disguised in trail clothing.",
    );
    lines.push("");
    lines.push(
      "TIME-BASED PROGRESSION FOR PROJECTS: in project mode the world advances through TIME, not distance, so totalDays and daysPerTurn are REQUIRED — populate them with real values matching the frame's time span. Examples: an eight-year canal project at quarterly Commission reviews ≈ totalDays: 2920, daysPerTurn: 90; a six-month siege at weekly war-council ticks ≈ totalDays: 180, daysPerTurn: 7. Event phase_min / phase_max 0–1 windows are computed as currentDay / totalDays. Do NOT zero totalDays or daysPerTurn for a project.",
    );
    lines.push("");
  }

  if (playerRole) {
    lines.push("--- PLAYER ROLE (who the player is) ---");
    lines.push(playerRole);
    lines.push("");
    lines.push(
      "Every event, sage encounter, and trivia question must be written from THIS role's point of view. The player IS this role; do not narrate the player as a separate character or as a generic traveler.",
    );
    lines.push("");
  }

  if (economy) {
    lines.push("--- ECONOMY (the exact resources — use these and only these) ---");
    lines.push(JSON.stringify(economy, null, 2));
    lines.push("");
    const keyHints = Array.isArray(economy.resources)
      ? economy.resources.map((r) => `"${r.name}" → playerFacing "${r.playerFacing}"`).join("; ")
      : "(see resources above)";
    lines.push(
      `For each economy resource above, derive a stable camelCase identifier from its name and use THAT identifier consistently as the key in initialResources, resourceCaps, resourceLabels, every effects map, every outcomes[*].effects, every event-trivia rewards/penalties, every sage reward.correct / reward.wrong, and primaryResourceKey. Resources in order: ${keyHints}. Set resourceLabels[key] to the resource's playerFacing string. Do NOT add resources beyond these. Do NOT rename or drop any. EVERY choice the player can make MUST move at least ONE of these economy resources.`,
    );
    lines.push("");
    lines.push(
      "The ratingRubric above is how the end rating is described. Reflect its basis in historicalContext and let its bands inform how the end grading reads.",
    );
    lines.push("");
  }

  // CHARACTER economy: small, concrete, personal resources (money + 1–2).
  // Replaces the abstract systems macro-meters for a first-person campaign.
  // Only emitted when a personalEconomy is supplied, so the systems `economy`
  // block above is byte-identical for systems campaigns.
  if (personalEconomy) {
    const money = personalEconomy.resources.find((r) => r.isMoney);
    const keyHints = personalEconomy.resources
      .map((r) => `"${r.name}"${r.isMoney ? " (money — spendable cash)" : ""} → playerFacing "${r.playerFacing}"`)
      .join("; ");
    lines.push("--- PERSONAL ECONOMY (the player's concrete day-to-day stakes — use these and only these) ---");
    lines.push(personalEconomy.premise);
    lines.push(JSON.stringify(personalEconomy.resources, null, 2));
    lines.push("");
    lines.push(
      `These are this PERSON's tangible, VISIBLE stakes — money they spend, things they can hold and lose — NOT abstract collective forces. For each resource, derive a stable camelCase identifier from its name and use THAT identifier consistently as the key in initialResources, resourceCaps, resourceLabels, and every choice's effects map. Resources: ${keyHints}. Set resourceLabels[key] to the resource's playerFacing string. Pick honest starting magnitudes that match each startsAt and the "${money?.playerFacing ?? "money"}" being a modest personal sum (the Okie-with-$20 feel), not a fortune. Do NOT add resources beyond these; do NOT rename or drop any.`,
    );
    lines.push("");
    lines.push(
      `PRIMARY RESOURCE: set primaryResourceKey to the derived identifier of "${personalEconomy.primaryResource}". The money resource ("${money?.name ?? ""}") is spent and shown but is NEVER primaryResourceKey — ending with more cash is NOT a high score, and hoarding money instead of helping people must never read as "winning". Set revenuePerUnit to 0.`,
    );
    lines.push("");
    lines.push(
      "FELT CONSEQUENCE, NOT A MONEY METER ON EVERYTHING: every choice must move at least ONE of — a personal resource above, OR the family relationship track, OR the community relationship track (see the RELATIONSHIP TRACKS section below). But do NOT make a choice move ALL of them, and do NOT spend or change money on every choice. Money moves only when a choice genuinely costs or earns cash; many choices land on a relationship track and nothing else. A choice whose whole weight is relational should carry family/community deltas and no resource effect at all. This keeps money from becoming a meter that ticks on every single decision.",
    );
    lines.push("");
  }

  if (cast) {
    lines.push("--- CAST (the exact people the player encounters — use these and only these) ---");
    lines.push(JSON.stringify(cast, null, 2));
    lines.push("");
    lines.push(
      "These are the figures the player meets and deals with. Use them as the sage encounters and as the named actors inside events. Do NOT invent additional named historical individuals. Keep real names spelled exactly as given. Representative roles (realPerson: false) must be referred to by the role label given (e.g. \"Irish labor foreman\") and not given fabricated personal names. portraitPolicy may guide the sage portrait approach but does not block their inclusion.",
    );
    lines.push("");
  }

  lines.push("=== END LOCKED CONSTRAINTS ===");
  lines.push("");

  return lines.join("\n");
}

// Read-only FAULT LINE context. Emitted ONLY when a faultLine is supplied.
// It does NOT ask the model to generate the fault-line beats — those are
// compiled in code and spliced in afterward. Its sole job is to tell the
// model those fixed beats already exist so the surrounding campaign it DOES
// generate stays consistent with them and never re-resolves the dilemma.
function buildFaultLineContext(fl: FaultLineSpec): string {
  const beats: string[] = [];
  const seen = new Set<string>();
  for (const r of fl.readers) {
    if (!seen.has(r.beat)) { seen.add(r.beat); beats.push(r.beat); }
  }

  const lines: string[] = [];
  lines.push("");
  lines.push("");
  lines.push("=== FAULT LINE (an already-authored spine — READ-ONLY context, do NOT generate these beats) ===");
  lines.push("");
  lines.push(
    "This is a CHARACTER campaign. Its moral spine has ALREADY been authored, validated, and compiled into concrete events that will be ADDED TO YOUR OUTPUT AUTOMATICALLY after you respond. You must NOT generate these beats yourself. They are described here only so the surrounding campaign you DO generate stays consistent with them.",
  );
  lines.push("");
  lines.push(`THE DILEMMA (the one defining choice): ${fl.dilemma}`);
  lines.push(`WHY THERE IS NO CLEAN ANSWER: ${fl.whyNoCleanAnswer}`);
  lines.push("");
  lines.push(`THE DEFINING CHOICE — a fixed EARLY event titled "${fl.setter.beat}": ${fl.setter.situation}`);
  lines.push("Its options and consequences are already written; one early choice settles who this person becomes.");
  lines.push("");
  lines.push("LATER SCENES THAT REMEMBER THE CHOICE — fixed events already written:");
  for (const b of beats) lines.push(`- ${b}`);
  lines.push("");
  lines.push("RULES FOR THE SURROUNDING CAMPAIGN YOU GENERATE:");
  lines.push(
    "- Do NOT output a \"flags\" field, and do NOT write your own version of the defining choice above or resolve this dilemma in any event you create. The fixed events already do that; duplicating or pre-empting it would break the campaign.",
  );
  lines.push(
    "- Leave the OPENING to the defining choice. Your earliest events should establish the world and the pressure, not pose a second identity-defining fork.",
  );
  lines.push(
    "- This is a character study, not a score: do NOT add any resource/meter that rewards or punishes the defining choice. Identity is carried by the fixed flag, never by points.",
  );
  lines.push(
    "- Otherwise generate normally — events, sages, and eventTrivia that deepen this person's world and the history around this fault line, written from the player role's point of view and consistent with the LOCKED CONSTRAINTS.",
  );
  lines.push("");
  lines.push("=== END FAULT LINE ===");
  lines.push("");
  return lines.join("\n");
}

// Read-only RELATIONSHIP-TRACK law. Emitted ONLY when a faultLine is supplied
// (the same character gate as the fault-line context and the code-side track
// injection). The two tracks themselves are declared in code
// (relationshipTracks.ts); this block tells the model to (a) write small
// family/community deltas onto its generated choices reflecting each choice's
// real moral tradeoff, (b) carry that relational cost in prose result text
// without any number, and (c) end on a climactic dilemma. It NEVER asks the
// model to declare the tracks (those are injected). The deltas now color result
// prose only — the closing readout is the moral VERDICT (authored separately).
function buildRelationshipLaw(): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("");
  lines.push("=== RELATIONSHIP TRACKS (the character-mode payoff — REQUIRED) ===");
  lines.push("");
  lines.push(
    "This character campaign carries TWO fixed, invisible relationship tracks, ALREADY DECLARED FOR YOU in code (do NOT output them in a \"flags\" field):",
  );
  lines.push("  - family    — how those closest to this person come to regard them");
  lines.push("  - community — how the wider people around this person come to regard them");
  lines.push(
    "Both are numeric tracks on the range -10..+10, starting at 0. They are NEVER shown to the player as a number or bar; they surface only in the result PROSE — the human cost of a choice shown in words, never a figure.",
  );
  lines.push("");
  lines.push(
    "(a) ATTACH DELTAS TO YOUR CHOICES. On the standard events YOU generate, most choices should carry a `flagWrites` map that nudges one or both tracks, e.g. \"flagWrites\": { \"family\": 2, \"community\": -1 }. Each delta is a SMALL integer in -3..-1 or +1..+3, and must reflect the REAL moral meaning of that choice for THIS person — who it serves and who it costs.",
  );
  lines.push(
    "  - INDEPENDENT, not a seesaw. A choice may help one and hurt the other, help both, hurt both, or move only one. Decide each from the choice's own content; do NOT mechanically mirror them.",
  );
  lines.push(
    "  - GENUINE COST IS REQUIRED. Real choices wound a relationship. Across the whole campaign BOTH tracks MUST be LOWERED by at least one choice — a track that only ever rises is a score, not a relationship, and the campaign is rejected. Do not make every choice flattering.",
  );
  lines.push(
    "  - YOU CANNOT BE GOOD TO EVERYONE (the central trade). The biggest gains MUST conflict: the choice that most helps family must visibly COST community, and the choice that most helps community must COST family. Put your LARGEST deltas (±3) on these conflict choices. There must be NO single line of play that leaves BOTH family and community well-regarded at once — to earn one's high regard, the player must let the other slip. If a determined player can pin both tracks high, the campaign is rejected.",
  );
  lines.push(
    "  - BUT NOT EVERY CHOICE IS A SEESAW. The independence above is real: help-both, hurt-both, and one-sided choices remain valid wherever the content warrants — sometimes there genuinely was no trade, sometimes a choice cost everyone, sometimes only one group was touched. Keep any mutual-gain (help-both) choices SMALL (±1) and uncommon so they can't quietly add up to a double-win. The rule is that the BIGGEST gains conflict and the good-to-everyone ending is impossible — NOT that every choice opposes.",
  );
  lines.push(
    "  - NOT A QUIZ. There is no 'correct' delta. Protecting family at the community's expense is not 'wrong' — it costs community and helps family. Author the cost honestly; never reward a 'right answer'.",
  );
  lines.push("");
  lines.push(
    "(b) LET RESULT PROSE CARRY THE COST — WITHOUT NUMBERS. When a choice wounds a relationship, its `result` text may show it in human terms (\"your wife says nothing, but she counts the coins\") — NEVER a number, never \"+2 family\". This is what makes a choice FEEL consequential in the moment.",
  );
  lines.push("");
  lines.push(
    "(c) END ON A CHOICE — ONE CLIMACTIC CLOSING DILEMMA. The closing VERDICT is the campaign's REFLECTION; the PLAY must therefore CLIMAX on a hard decision, never trail off into reflection beats. Author ONE late, climactic standard event — this person's hardest, most defining choice, where the central tension comes to a head — and place it in the campaign's TAIL with \"phase_min\": 0.85 and \"phase_max\": 1.0. It carries \u22652 real choices bearing the LARGEST moral weight (your biggest family/community deltas). Any quieter reflection/consequence beats stay EARLIER (before phase 0.85); the LAST thing the player does before the verdict is CHOOSE, not read.",
  );
  lines.push("");
  lines.push("=== END RELATIONSHIP TRACKS ===");
  lines.push("");
  return lines.join("\n");
}

export function buildUserMessage(inputs: GenerateInputs, priorErrors?: string[]): string {
  const locked = buildLockedConstraints(inputs);
  // Gated solely on faultLine presence — never folded into the frame/economy/
  // cast conditionals, since systems campaigns carry those. Empty ⇒ the
  // systems prompt is byte-for-byte unchanged.
  const faultLineContext = inputs.faultLine ? buildFaultLineContext(inputs.faultLine) : "";
  const relationshipLaw = inputs.faultLine ? buildRelationshipLaw() : "";
  // The eventTrivia bank is DRAWN repeatedly (a knowledge-check every few
  // turns), so its size must track the campaign's turn count — not a flat
  // number. The model authors totalDays/daysPerTurn, so it alone knows the
  // turn count at generation time; instruct it to self-size the bank. Gated on
  // faultLine: the else-branch is byte-identical to the prior flat line, so the
  // systems prompt is unchanged.
  const triviaSpec = inputs.faultLine
    ? `- Number of event trivia (gate questions): emit a DISTINCT bank of at least ${inputs.numQuestions}, but SIZED TO THIS CAMPAIGN'S LENGTH. The engine draws a short knowledge-check every few turns across the entire run, so a small bank will visibly repeat. For a time-based / project campaign, emit roughly ONE distinct question per THREE turns of your own totalDays \u00f7 daysPerTurn (e.g. a ~48-turn span \u2248 16 questions), capped at about 16 to stay within the output budget. Each is a brief factual check; a larger bank is strictly better than a repeating one.`
    : `- Number of event trivia (gate questions): ${inputs.numQuestions}`;
  const exampleIntro = locked
    ? "Here is one example campaign (Chisholm Trail). Treat it as ONE possible shape among many — your structure follows the LOCKED CONSTRAINTS above, NOT this example:"
    : "Here is a complete example campaign (Chisholm Trail) so you can see the level of detail, tone, and structure expected:";
  const tail = locked
    ? "\nThe LOCKED CONSTRAINTS above are ground truth. They override any conflicting guidance in the schema's field shapes or in the example above.\n"
    : "";
  // Sighted retry: on attempt N+1 the prior attempt's CAMPAIGN-AUTHORED validation
  // errors (the ones THIS generation can fix — never the frozen input-spec errors)
  // are fed back so the model corrects those specific failures instead of
  // re-rolling blind. Empty on attempt 1, so attempt 1 is byte-identical to today.
  const feedback = priorErrors && priorErrors.length
    ? `\nYOUR PREVIOUS ATTEMPT FAILED THESE VALIDATION CHECKS. Fix EVERY one — re-author the offending field(s) so it passes, keeping the rest faithful to the rules above:\n${priorErrors.map((e) => `- ${e}`).join("\n")}\n`
    : "";

  return `Here is the TypeScript schema your output must conform to:

\`\`\`typescript
${schemaSource}
\`\`\`
${locked}${faultLineContext}${relationshipLaw}
${exampleIntro}

${loadExample()}

Now generate a new campaign with these parameters:
- Topic: ${inputs.topic}
- Standard: ${inputs.standard}
- Grade / reading level: ${inputs.grade}
- Number of events: ${inputs.length}
${triviaSpec}
- Number of sage encounters: ${inputs.numSages}
- Difficulty: ${inputs.difficulty}
${tail}${feedback}
Output ONLY the JSON object. No markdown fences, no commentary.`;
}

// Splice the compiled fault-line pieces into a parsed campaign. STRICT
// NO-OP when faultLine is absent, so the systems path is untouched. The
// flag is prepended (defensively de-duplicated against any flag the model
// emitted), the setter goes in early and the readers after — array order
// is immaterial to the engine (it selects events by phase window), so this
// is purely the declare→set→read lifecycle made concrete.
export function applyFaultLine(data: Record<string, unknown>, faultLine?: FaultLineSpec): void {
  if (!faultLine) return;
  const pieces = faultLineToCampaignPieces(faultLine);
  const existingFlags = Array.isArray(data.flags) ? (data.flags as FlagDecl[]) : [];
  data.flags = [pieces.flagDecl, ...existingFlags.filter((f) => f && f.id !== pieces.flagDecl.id)];
  const existingEvents = Array.isArray(data.events) ? (data.events as unknown[]) : [];
  data.events = [pieces.setterEvent, ...existingEvents, ...pieces.readerEvents];
}

export async function generateCampaign(
  apiKey: string,
  inputs: GenerateInputs,
  // Sighted-retry feedback: the prior attempt's CAMPAIGN-AUTHORED error findings
  // ("field: message"). Absent/empty on the first attempt — when absent the user
  // message is byte-identical to today. The wrapper passes only the fixable
  // (validate(data)) findings; never the frozen input-spec ones.
  priorErrors?: string[],
): Promise<GenerateResult> {
  // A generated campaign is large; the stream can legitimately run several
  // minutes. Give it a generous ceiling and a retry so a stalled connection
  // fails fast and recovers instead of hanging until something upstream gives.
  const client = new Anthropic({ apiKey, timeout: 15 * 60_000, maxRetries: 1 });
  const startTime = Date.now();

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(inputs, priorErrors) }],
  });

  let rawText = "";
  stream.on("text", (text) => { rawText += text; });
  await stream.finalMessage();

  const elapsedSeconds = (Date.now() - startTime) / 1000;

  const data = parseModelJson<Record<string, unknown>>(rawText);
  data.isPublished = false;

  const imageryCtx = {
    topic: inputs.topic,
    title: typeof data.title === "string" ? data.title : "",
  };
  await enrichSagePortraits(data);
  await enrichEventImages(data, imageryCtx);

  // Character path only: splice the compiled fault-line pieces in after
  // imagery (the compiled events carry no imageSearchQuery by design) and
  // before validation, so validate() sees the full, final campaign. No-op
  // for systems campaigns (no faultLine).
  applyFaultLine(data, inputs.faultLine);
  // Character path only: inject the two fixed relationship tracks (family,
  // community) beside the fault line, gated on the SAME faultLine presence.
  // Strict no-op for systems campaigns. (Step 1: declarations only — per-choice
  // deltas and the reckoning are wired in later steps.)
  applyRelationshipTracks(data, inputs.faultLine);
  // Character path only: reserve the campaign's TAIL [0.85, 1.0] for a climactic
  // closing DILEMMA so the final beat before the reckoning is a CHOICE, not a
  // reflection "Go on." (the reckoning is the reflection). Prefers the model's
  // authored climax (the prompt nudges for one); degrades to re-windowing the
  // latest dilemma. Gated on faultLine — strict no-op for systems campaigns.
  if (inputs.faultLine) reserveClosingDilemma(data);

  const validation = validate(data);

  return { data, validation, elapsedSeconds };
}

// All validator findings share one shape, so the batteries merge into the
// universal report's findings without translation.
export interface DeliveryFinding {
  level: "error" | "warn";
  field: string;
  message: string;
  // "data": authored by THIS generation (validate(data) / relationship-tracks /
  // endgame-rhythm) — the campaign retry CAN fix it, so it's fed back as sighted
  // feedback. "spec": a frozen INPUT spec (faultLine / personalEconomy) — the
  // campaign retry is powerless over it (handled upstream), so it is NEVER fed back.
  source: "data" | "spec";
}

// Run EVERY validator that applies to this campaign and unify their findings.
// Universal validate() ALWAYS; the character batteries only when their inputs
// are present — faultLine ⇒ the fault-line + relationship-track batteries
// (the relationship battery is where the frontier "can't be good to everyone"
// guard lives), personalEconomy ⇒ the personal-economy battery. A systems
// campaign (no faultLine, no personalEconomy) therefore sees exactly the
// universal validate() it always has — no behavior change.
//
// Note the two targets: validate() and validateRelationshipTracks() inspect the
// PRODUCED campaign (`data`) — that is where the frontier/inert/choiceless
// guards live — while validateFaultLine() and validatePersonalEconomy() check
// the generation INPUT SPECS, which is what those validators are written to
// accept. The field paths are namespaced so a rejection points at the right one.
export function validateForDelivery(
  data: unknown,
  inputs: Pick<GenerateInputs, "faultLine" | "personalEconomy">,
): { findings: DeliveryFinding[]; errorCount: number } {
  // Tag each finding by SOURCE so the sighted retry feeds back only the
  // campaign-fixable ("data") ones. validate(data), relationship-tracks, and
  // endgame-rhythm all inspect the PRODUCED campaign → "data". validateFaultLine
  // and validatePersonalEconomy inspect the frozen INPUT specs → "spec".
  const findings: DeliveryFinding[] = validate(data).findings.map((f) => ({ ...f, source: "data" as const }));
  if (inputs.faultLine) {
    findings.push(...validateFaultLine(inputs.faultLine).map((f) => ({ ...f, field: `faultLine.${f.field}`, source: "spec" as const })));
    findings.push(...validateRelationshipTracks(data).map((f) => ({ ...f, source: "data" as const })));
    // Endgame-rhythm guard: campaign must END ON A DILEMMA, readers capped and
    // off the tail. Inspects the PRODUCED data (post reserveClosingDilemma).
    findings.push(...validateEndgameRhythm(data).map((f) => ({ ...f, source: "data" as const })));
  }
  if (inputs.personalEconomy) {
    findings.push(...validatePersonalEconomy(inputs.personalEconomy).map((f) => ({ ...f, field: `personalEconomy.${f.field}`, source: "spec" as const })));
  }
  const errorCount = findings.filter((f) => f.level === "error").length;
  return { findings, errorCount };
}

export interface GenerateValidatedResult {
  status: "ok" | "rejected";
  data: unknown;
  validation: ValidationReport; // universal validate() of the final attempt
  findings: DeliveryFinding[];  // unified findings across all applicable validators
  errorCount: number;
  attempts: number;
  elapsedSeconds: number;
}

// The delivery gate. Runs the single-shot generator, validates the result with
// EVERY applicable validator, and BLOCKS delivery on any ERROR-level finding
// (warnings ship as advisory). `maxRegen` is the number of EXTRA attempts after
// the first; DEFAULT 0 = hard reject with no regeneration. The 0 default is
// deliberate: silent auto-regeneration would mask how often the generator
// actually leaks the frontier, and reading that raw rate is the whole point of
// wiring this in. Raise maxRegen later (e.g. 2) to smooth stochastic leaks once
// the rate is known. EVERY attempt's error findings are logged server-side
// regardless of maxRegen, so the leak rate stays measurable even after it goes up.
export async function generateValidatedCampaign(
  apiKey: string,
  inputs: GenerateInputs,
  opts: { maxRegen?: number } = {},
): Promise<GenerateValidatedResult> {
  const maxRegen = opts.maxRegen ?? 0;
  const tag = inputs.faultLine ? "character" : "systems";
  let last!: GenerateResult;
  let lastFindings: DeliveryFinding[] = [];
  let lastErrorCount = 0;
  let totalElapsed = 0;

  for (let attempt = 1; attempt <= maxRegen + 1; attempt++) {
    // Sighted retry: on attempt >= 2 feed back ONLY the prior attempt's
    // campaign-authored (source "data") error findings — the ones this
    // generation can actually fix. Input-spec errors (faultLine/personalEconomy)
    // are excluded; they're handled upstream and are unfixable here, so feeding
    // them back would be noise. Empty on attempt 1 ⇒ byte-identical to today.
    const priorErrors = lastFindings
      .filter((f) => f.level === "error" && f.source === "data")
      .map((f) => `${f.field}: ${f.message}`);
    last = await generateCampaign(apiKey, inputs, attempt > 1 ? priorErrors : undefined);
    totalElapsed += last.elapsedSeconds;
    const { findings, errorCount } = validateForDelivery(last.data, inputs);
    lastFindings = findings;
    lastErrorCount = errorCount;

    // Breadth-rate telemetry — log every attempt's verdict + error findings,
    // always, so the frontier-leak rate is observable from the server logs.
    const errs = findings.filter((f) => f.level === "error");
    if (errs.length === 0) {
      console.log(`[generate] ${tag} attempt ${attempt}/${maxRegen + 1}: PASS (0 errors)`);
    } else {
      console.warn(`[generate] ${tag} attempt ${attempt}/${maxRegen + 1}: REJECT (${errs.length} error${errs.length === 1 ? "" : "s"})`);
      for (const f of errs) console.warn(`[generate]   [${f.field}] ${f.message}`);
    }

    if (errorCount === 0) {
      return {
        status: "ok",
        data: last.data,
        validation: last.validation,
        findings,
        errorCount,
        attempts: attempt,
        elapsedSeconds: totalElapsed,
      };
    }
  }

  return {
    status: "rejected",
    data: last.data,
    validation: last.validation,
    findings: lastFindings,
    errorCount: lastErrorCount,
    attempts: maxRegen + 1,
    elapsedSeconds: totalElapsed,
  };
}
