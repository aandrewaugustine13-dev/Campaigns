// ════════════════════════════════════════════════════════════════
// STORY-PREVIEW GENERATION (the cheap/fast model call). Split from
// storyPreview.ts so that module stays PURE (importable by the browser). This is
// the CONFIDENCE GATE generation — a small prompt on a cheap model (sonnet, not
// the opus that writes the story) that returns a summary + coverage checklist
// WITHOUT writing the story. SDK side only.
// ════════════════════════════════════════════════════════════════
import Anthropic from "@anthropic-ai/sdk";
import { parseModelJson } from "./json.js";
import { validateStoryPreview, type StoryPreview, type PreviewFinding } from "./storyPreview.js";

const MODEL = "claude-sonnet-4-6"; // cheap + fast — the gate, not the story (opus)

const SYSTEM_PROMPT = `You help a teacher decide, BEFORE any full story is written, whether a planned branching history story will cover their curriculum standard. You output ONLY a single JSON object — a short PREVIEW, never the story itself. No prose, no markdown, no code fences.

Given a topic, a standard, an optional must-cover note, and optional OUTPUT LANGUAGE, produce:
- "protagonist": ONE line naming who the story will follow — an ordinary young person living through this history (a regular kid, not a famous leader).
- "summary": 2 to 3 plain sentences describing the story's arc and its feel — what the kid lives through and the shape of it. Plain language; this is a teacher's at-a-glance read.
- "coverage": a CHECKLIST of 8 to 14 SHORT, SPECIFIC items — the concrete historical topics, events, people, places, and facts the story will teach. Each item is something a teacher can check directly against their standard: name the real events/people/terms (not vague themes). If the teacher gave a must-cover note, every item in it MUST appear in this checklist.

All output text (protagonist, summary, coverage items) must be written in the OUTPUT LANGUAGE if provided and not English. Use natural, high-quality phrasing in that language. For English, use English as usual.

Do NOT write the story, scenes, choices, or passages. This is only the preview a teacher approves before the story is generated.

OUTPUT SHAPE (TypeScript for reference — output JSON only):
interface StoryPreview { protagonist: string; summary: string; coverage: string[]; }

Output ONLY the JSON object conforming to StoryPreview.`;

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
  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(inputs) }],
  });
  let raw = "";
  stream.on("text", (t) => { raw += t; });
  await stream.finalMessage();

  const data = parseModelJson<StoryPreview>(raw);
  const findings = validateStoryPreview(data);
  return { data, raw, findings };
}
