import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { validate, type ValidationReport } from "./validate.js";
import { parseModelJson } from "./json.js";
import { enrichSagePortraits, enrichEventImages } from "./wikimedia.js";
import type { CastCharacter } from "./cast.js";
import type { SystemsEconomy } from "./economy.js";
import type { FaultLineSpec } from "./faultline.js";
import { faultLineToCampaignPieces } from "./faultlineCompile.js";
import { applyRelationshipTracks } from "./relationshipTracks.js";
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
  artStyle: string;
  // Optional locked constraints (Stage-1 artifacts authored / verified by a
  // teacher). When any of these is provided, buildUserMessage emits a LOCKED
  // CONSTRAINTS block that the SYSTEM_PROMPT treats as overriding its
  // journey / Oregon-Trail framing. When all four are absent, behavior is
  // byte-identical to the original path.
  frame?: string;
  playerRole?: string;
  cast?: CastCharacter[];
  economy?: SystemsEconomy;
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
- Outcomes must have positive integer \`weight\` values. Higher weight = more likely.
- Resource keys in effects/rewards/penalties MUST be keys that exist in initialResources. This is critical — a mismatched key silently breaks the game.
- Sage thresholds are trail progress percentages (0-100) at which the sage encounter triggers. Space them roughly evenly across the journey.
- Route must start with a node id "start" and end with a terminal node (empty edges array). Every edge \`to\` must reference an existing node id.
- trailPath coordinates are [x, y] percentages (0-100) representing the trail on a map. Start and end should roughly correspond to the real geography.
- trailStops must reference valid pathIndex values (indices into the trailPath array).
- Event phase_min/phase_max are 0.0-1.0 floats representing what portion of the journey the event can trigger in.
- pixelColors maps color-name strings to hex color codes (e.g. "skin": "#D4A574"). pixelFaces maps role ids to arrays of FaceLevel objects (threshold-based sprite swaps for the HUD). For a generated campaign, provide reasonable placeholder data.
- theme: pick ONE value from this allowlist whose era and visual register match the topic. Allowed values: "frontier-leather", "broadsheet-sepia", "parchment-medieval", "expedition-journal", "declassified-typewriter", "classical-marble", "default". Era guidance — frontier-leather: 19th-c westward US (cattle, trails, gold rush, frontier outposts); broadsheet-sepia: 19th-c American (Erie Canal, Alamo, Civil War, anything contemporaneous with newspaper engravings and lithographs); parchment-medieval: medieval and ancient Christian/Islamic world (Crusades, Black Death, illuminated-manuscript era); expedition-journal: exploration eras (Lewis & Clark, Magellan, Captain Cook, naturalist field-journal feel); declassified-typewriter: 20th-c Cold War / intelligence / mid-century political (Cuban Missile Crisis, Berlin Airlift, post-WWII document era); classical-marble: Greek and Roman antiquity (Punic Wars, Athenian Empire, anything BCE Mediterranean); default: fall back when no theme cleanly fits — do NOT force a theme that misses the era.
- outfitConfig.costs keys should match the equipment/supplies a player can buy for THIS journey — not generic Oregon Trail items. Think about what THIS expedition actually needed to prepare.
- imageStyleKeyword: ONE word matching the dominant visual medium of the topic's era. Examples: "lithograph" (most 19th-century US topics), "engraving" (older prints, 17th-18th century), "painting" (any era with portraitable subjects), "illumination" (medieval manuscripts), "photograph" (late 19th century onward), "daguerreotype" (1840s-1860s), "woodcut" (Renaissance, early printing). This is a one-token ranking booster for Wikimedia Commons file search — keep it strictly to ONE word.
- Each event MUST include an imageSearchQuery: short Wikimedia Commons file-search query for this event's visual. 2-4 words. MUST include at least one named entity (specific person, place, or event name). Optionally include a year (e.g. "1825", "1836") or a one-word art-style noun (e.g. "lithograph", "engraving", "painting"). Do NOT write descriptive sentences. Do NOT use verbs like "writing", "pouring", "fighting", "celebrating". Examples of GOOD queries: "Erie Canal 1825", "Alamo Travis", "Lewis Clark expedition", "Erie Canal lithograph", "Erie Canal aqueduct". Examples of BAD queries: "Travis writing letter Alamo defenders" (too descriptive, matches book titles), "De Witt Clinton pouring water Buffalo 1825" (verbs match descriptions of PDFs not images), "canal celebration scene" (no named entity).

OUTPUT FORMAT:
Output ONLY a single JSON object conforming to the CampaignData schema. No markdown, no code fences, no explanation. Just the JSON.`;

// Build the LOCKED CONSTRAINTS block injected before the example dump when
// the caller supplies any Stage-1 artifact. The block declares the frame,
// player role, cast, and economy as ground truth and tells the model to
// build the campaign AROUND them — including OMITTING journey-only fields
// honestly when the frame is not a journey, rather than faking them.
function buildLockedConstraints(inputs: GenerateInputs): string {
  const { frame, playerRole, cast, economy } = inputs;
  if (!frame && !playerRole && !cast && !economy) return "";

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
// real moral tradeoff, (b) fill the `reckoning` slot with tiered FlagText for
// each track, and (c) carry relational cost in prose result text without any
// number. It NEVER asks the model to declare the tracks (those are injected).
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
    "Both are numeric tracks on the range -10..+10, starting at 0. They are NEVER shown to the player as a number or bar; they surface only in the closing reckoning and, optionally, in prose.",
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
    "  - NOT A QUIZ. There is no 'correct' delta. Protecting family at the community's expense is not 'wrong' — it costs community and helps family. Author the cost honestly; never reward a 'right answer'.",
  );
  lines.push("");
  lines.push(
    "(b) FILL THE `reckoning` FIELD. Output a top-level \"reckoning\": { \"family\": FlagText, \"community\": FlagText }. Each is a closing readout of how that group remembers this person, tiered by the accumulated track value using numeric variants (whenAtLeast / whenAtMost). Give each THREE bands covering the whole -10..+10 range — a high band (whenAtLeast: 4), a middle band (whenAtLeast: -3, whenAtMost: 3), and a low band (whenAtMost: -4) — listing the HIGH band FIRST (first-match-wins). Each band is 1-2 sentences of human memory: how they hold this person now. It is NOT a verdict, a score, or 'you win/lose'. Neither extreme is 'winning'; each is a different truth with its own cost. Keep the two readouts SEPARATE — never one combined judgment.",
  );
  lines.push(
    "    Shape: \"reckoning\": { \"family\": { \"default\": \"...\", \"variants\": [ { \"whenFlag\": \"family\", \"whenAtLeast\": 4, \"text\": \"...\" }, { \"whenFlag\": \"family\", \"whenAtLeast\": -3, \"whenAtMost\": 3, \"text\": \"...\" }, { \"whenFlag\": \"family\", \"whenAtMost\": -4, \"text\": \"...\" } ] }, \"community\": { \"default\": \"...\", \"variants\": [ … same three bands, each with \"whenFlag\": \"community\" … ] } }",
  );
  lines.push("");
  lines.push(
    "(c) LET RESULT PROSE CARRY THE COST — WITHOUT NUMBERS. When a choice wounds a relationship, its `result` text may show it in human terms (\"your wife says nothing, but she counts the coins\") — NEVER a number, never \"+2 family\". This is what makes a choice FEEL consequential in the moment.",
  );
  lines.push("");
  lines.push("=== END RELATIONSHIP TRACKS ===");
  lines.push("");
  return lines.join("\n");
}

export function buildUserMessage(inputs: GenerateInputs): string {
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
- Art Style / Theme: ${inputs.artStyle}
${tail}
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
    messages: [{ role: "user", content: buildUserMessage(inputs) }],
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
  await enrichSagePortraits(data, imageryCtx);
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

  const validation = validate(data);

  return { data, validation, elapsedSeconds };
}
