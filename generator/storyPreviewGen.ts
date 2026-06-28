// ════════════════════════════════════════════════════════════════
// STORY-PREVIEW GENERATION (the cheap/fast model call). Split from
// storyPreview.ts so that module stays PURE (importable by the browser). This is
// the CONFIDENCE GATE generation — a small prompt on a cheap model (sonnet, not
// the opus that writes the story) that returns a summary + coverage checklist
// WITHOUT writing the story. SDK side only.
// ════════════════════════════════════════════════════════════════
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { parseModelJson } from "./json.js";
import { validateStoryPreview, type StoryPreview, type PreviewFinding } from "./storyPreview.js";
import { THEME_IDS, THEME_CLASSIFIER_INSTRUCTION } from "../theme-system/themes.js";

const MODEL = "gemini-3.5-flash"; // cheap + fast — the gate, not the story

// Same relaxation as the story writer: a preview for combat-heavy topics (the
// War of 1812, etc.) can trip Gemini's default DANGEROUS_CONTENT / HARASSMENT
// filters. Relax those two to BLOCK_ONLY_HIGH so the gate doesn't block before
// the teacher ever sees a preview. Other categories keep their defaults.
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

const SYSTEM_PROMPT = `You help a teacher decide, BEFORE any full story is written, whether a planned branching history story will cover their curriculum standard. You output ONLY a single JSON object — a short PREVIEW, never the story itself. No prose, no markdown, no code fences.

Given a topic, a standard, an optional must-cover note, and optional OUTPUT LANGUAGE, produce:
- "protagonist": ONE line naming who the story will follow — an ordinary young person living through this history (a regular kid, not a famous leader).
- "summary": 2 to 3 plain sentences describing the story's arc and its feel — what the kid lives through and the shape of it. Plain language; this is a teacher's at-a-glance read.
- "coverage": a CHECKLIST of 8 to 14 SHORT, SPECIFIC items — the concrete historical topics, events, people, places, and facts the story will teach. Each item is something a teacher can check directly against their standard: name the real events/people/terms (not vague themes). If the teacher gave a must-cover note, every item in it MUST appear in this checklist.
- "theme": ONE theme id chosen per the THEME SELECTION rules below.

All output text (protagonist, summary, coverage items) must be written in the OUTPUT LANGUAGE if provided and not English. Use natural, high-quality phrasing in that language. For English, use English as usual. The "theme" id is a fixed token from the closed list — it is NOT translated.

Do NOT write the story, scenes, choices, or passages. This is only the preview a teacher approves before the story is generated.

OUTPUT SHAPE (TypeScript for reference — output JSON only):
interface StoryPreview { protagonist: string; summary: string; coverage: string[]; theme: string; }

Output ONLY the JSON object conforming to StoryPreview.

THEME SELECTION
${THEME_CLASSIFIER_INSTRUCTION}`;

// Structured-output schema. The "theme" field is a STRICT enum drawn from the
// single source of truth (theme-system/themes.ts) — the model physically cannot
// emit a token outside the closed list, so resolveTheme always gets a valid id.
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    protagonist: { type: Type.STRING },
    summary: { type: Type.STRING },
    coverage: { type: Type.ARRAY, items: { type: Type.STRING } },
    theme: { type: Type.STRING, enum: THEME_IDS as string[] },
  },
  required: ["protagonist", "summary", "coverage", "theme"],
  propertyOrdering: ["protagonist", "summary", "coverage", "theme"],
};

export interface PreviewInputs {
  topic: string;
  standard: string;
  mustCover?: string;
  outputLanguage?: string;
}

export interface GenerateStoryPreviewResult {
  data: StoryPreview;
  raw: string;
  findings: PreviewFinding[];
}

function buildUserMessage(inputs: PreviewInputs): string {
  const mustCover = inputs.mustCover && inputs.mustCover.trim()
    ? `\nMUST COVER (the teacher's required content — every item here must appear in the coverage checklist): ${inputs.mustCover.trim()}`
    : "";
  const lang = inputs.outputLanguage && inputs.outputLanguage !== "English"
    ? `\nOUTPUT LANGUAGE: ${inputs.outputLanguage} — generate the protagonist, summary, and all coverage items in natural ${inputs.outputLanguage}.`
    : "";
  return `Produce the preview for a branching history story planned on THIS topic:

TOPIC: ${inputs.topic}
STANDARD: ${inputs.standard}${mustCover}${lang}

Give the protagonist, a 2-3 sentence summary, and a specific coverage checklist a teacher can check against the standard. Output ONLY the JSON object conforming to StoryPreview.`;
}

export async function generateStoryPreview(
  inputs: PreviewInputs,
  apiKey: string,
): Promise<GenerateStoryPreviewResult> {
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: MODEL,
    contents: buildUserMessage(inputs),
    config: {
      systemInstruction: SYSTEM_PROMPT,
      maxOutputTokens: 1500,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      safetySettings: SAFETY_SETTINGS,
    },
  });

  // Detect a safety block (prompt-level blockReason or candidate finishReason)
  // before parsing — otherwise an empty body surfaces as an opaque parse error.
  // Log a specific warning and throw a clear, teacher-facing message; the route
  // handler's catch turns it into a clean 500 response instead of a crash.
  const blockReason = response.promptFeedback?.blockReason;
  const finishReason = response.candidates?.[0]?.finishReason as string | undefined;
  if (blockReason || finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT") {
    console.warn(
      `[story-preview] generation BLOCKED by Gemini safety filters ` +
      `(promptFeedback.blockReason=${blockReason ?? "none"}, finishReason=${finishReason ?? "none"})`
    );
    throw new Error("The preview was blocked by the content safety filter. Try rephrasing the topic or lowering the content maturity.");
  }

  const raw = response.text ?? "";

  const data = parseModelJson<StoryPreview>(raw);
  const findings = validateStoryPreview(data);
  return { data, raw, findings };
}
