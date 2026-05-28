import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { validate, type ValidationReport } from "./validate.js";
import { enrichSagePortraits } from "./wikimedia.js";

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
- theme should be set based on the requested art style (e.g., "frontier", "parchment", or "default").
- outfitConfig.costs keys should match the equipment/supplies a player can buy for THIS journey — not generic Oregon Trail items. Think about what THIS expedition actually needed to prepare.

OUTPUT FORMAT:
Output ONLY a single JSON object conforming to the CampaignData schema. No markdown, no code fences, no explanation. Just the JSON.`;

function buildUserMessage(inputs: GenerateInputs): string {
  return `Here is the TypeScript schema your output must conform to:

\`\`\`typescript
${schemaSource}
\`\`\`

Here is a complete example campaign (Chisholm Trail) so you can see the level of detail, tone, and structure expected:

${loadExample()}

Now generate a new campaign with these parameters:
- Topic: ${inputs.topic}
- Standard: ${inputs.standard}
- Grade / reading level: ${inputs.grade}
- Number of events: ${inputs.length}
- Number of event trivia (gate questions): ${inputs.numQuestions}
- Number of sage encounters: ${inputs.numSages}
- Difficulty: ${inputs.difficulty}
- Art Style / Theme: ${inputs.artStyle}

Output ONLY the JSON object. No markdown fences, no commentary.`;
}

export async function generateCampaign(
  apiKey: string,
  inputs: GenerateInputs,
): Promise<GenerateResult> {
  const client = new Anthropic({ apiKey });
  const startTime = Date.now();

  const stream = client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(inputs) }],
  });

  let rawText = "";
  stream.on("text", (text) => { rawText += text; });
  await stream.finalMessage();

  const elapsedSeconds = (Date.now() - startTime) / 1000;

  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  const data = JSON.parse(cleaned);
  data.isPublished = false;

  await enrichSagePortraits(data, {
    topic: inputs.topic,
    title: typeof data.title === "string" ? data.title : "",
  });

  const validation = validate(data);

  return { data, validation, elapsedSeconds };
}
