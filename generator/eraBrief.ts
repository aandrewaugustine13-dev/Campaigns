// ════════════════════════════════════════════════════════════════
// ERA BRIEF — Gemini grounds the image lane (NOT the story/factGate lanes).
//
// Given {topic, standard}, Gemini writes:
//   (a) brief    — a period-anchoring directive for the image generator: the
//                  exact years/place, what people wore, architecture, technology,
//                  and an explicit FORBID list (anachronisms + commonly-confused
//                  neighbor periods). This feeds buildImagePrompt's `era` slot,
//                  so the anchoring comes from the model that knows the period —
//                  not from the story title (which mis-anchored the cold 1812 run).
//   (b) checklist — teacher-facing, specific things to VERIFY in the resulting
//                  image. The point of the cold test: does the model's own
//                  checklist name the things that actually go wrong?
//
// One call per STORY (not per passage) — cheap. Uses GOOGLE_API_KEY. This is a
// NEW, additive use of Gemini in the image lane; it does not touch
// branchingStoryGen / factGate / branchingStory.
// ════════════════════════════════════════════════════════════════
import { GoogleGenAI } from "@google/genai";
import { parseModelJson } from "./json.js";

const MODEL = "gemini-3.5-flash"; // period accuracy is a knowledge task — use the strong model

export interface EraBrief {
  brief: string;
  checklist: string[];
}

const SYSTEM = `You are a historical-accuracy consultant for a children's history tool that GENERATES ILLUSTRATIONS with an AI image model. Image models confidently render the WRONG period (e.g. they drift to a more iconic neighbor era) unless tightly anchored. For a given topic and curriculum standard you produce a period-anchoring brief for the image prompt AND a teacher's verification checklist. Output ONLY a single JSON object — no prose, no markdown, no code fences.`;

function buildUser(topic: string, standard: string): string {
  return `TOPIC: ${topic}
STANDARD: ${standard}

Produce JSON conforming to:
{
  "brief": "<2 to 4 sentences anchoring the EXACT period and place for an image generator. State the specific years and setting. Name concretely what people WORE (garments, hats, hairstyles), the architecture, and the tools/technology that WOULD and would NOT be present. Then give an explicit FORBID list: anachronisms AND commonly-confused neighbor periods named outright (e.g. 'NOT the American Revolution — no tricorn hats'; 'no automobiles or electric light if before their adoption'). Be concrete and visual, written as direct instructions to an image generator.>",
  "checklist": ["<5 to 8 SHORT, SPECIFIC visual checks a teacher should verify in the generated image — each tied to THIS exact period and checkable by eye (clothing, hats, hair, technology, vehicles, architecture, signage, anything this era is commonly gotten wrong). Name the period-correct expectation AND the likely wrong version to watch for.>"]
}

Output ONLY the JSON object.`;
}

// ── Per-passage Commons queries ──────────────────────────────────────────────
// The fix for "same image every beat": a constant topic base produced identical
// queries → identical ranked results. Here Gemini turns ONE passage (+ topic/
// standard for period anchoring) into 2–4 SHORT real-noun search queries about
// what THAT beat is actually depicting — so the queries vary per passage and
// stay historically anchored. The story is first-person fiction; the model
// ignores the invented character and extracts the real historical subject.
const PASSAGE_Q_MODEL = "gemini-3.5-flash"; // cheap/fast — called lazily per viewed passage

const PASSAGE_Q_SYSTEM = `You generate Wikimedia Commons image-search queries for a children's history tool. Given a historical TOPIC and STANDARD and ONE passage of a first-person historical STORY, output 2 to 4 SHORT queries (2 to 5 words each) of REAL, searchable historical nouns: the actual people, places, events, battles, objects, or scenes THIS passage depicts, anchored to the correct period and place. The story is fiction with an invented "you" character — IGNORE the character and their name; extract the REAL historical subject the passage portrays. Prefer concrete, period-correct terms an archive or museum would use to label an image. Output ONLY a JSON object, no prose, no markdown.`;

function buildPassageQ(topic: string, standard: string, passageText: string): string {
  return `TOPIC: ${topic}
STANDARD: ${standard}
PASSAGE: ${passageText}

Output JSON: {"queries": ["<2-5 real-noun words>", ...]} — 2 to 4 queries, each specific to what THIS passage is about, period-anchored, NO fictional names.`;
}

export async function generatePassageQueries(topic: string, standard: string, passageText: string, apiKey: string): Promise<string[]> {
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: PASSAGE_Q_MODEL,
    contents: buildPassageQ(topic, standard, passageText),
    config: {
      systemInstruction: PASSAGE_Q_SYSTEM,
      maxOutputTokens: 400,
      responseMimeType: "application/json",
    },
  });
  const raw = response.text ?? "";

  const parsed = parseModelJson<{ queries?: unknown }>(raw);
  if (!parsed || !Array.isArray(parsed.queries)) return [];
  return parsed.queries
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .map((q) => q.trim())
    .slice(0, 4);
}

export async function generateEraBrief(topic: string, standard: string, apiKey: string): Promise<EraBrief> {
  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model: MODEL,
    contents: buildUser(topic, standard),
    config: {
      systemInstruction: SYSTEM,
      maxOutputTokens: 1500,
      responseMimeType: "application/json",
    },
  });
  const raw = response.text ?? "";

  const parsed = parseModelJson<Partial<EraBrief>>(raw);
  const brief = typeof parsed?.brief === "string" ? parsed.brief.trim() : "";
  const checklist = Array.isArray(parsed?.checklist)
    ? parsed!.checklist!.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    : [];
  return { brief, checklist };
}
