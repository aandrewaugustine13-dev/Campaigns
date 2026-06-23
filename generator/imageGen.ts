// ════════════════════════════════════════════════════════════════
// GEMINI ILLUSTRATION GENERATION — the AI image lane (SEPARATE from Claude).
//
// A POST-generation, teacher-curated illustration source: passage prose →
// generate one storybook illustration → it appears as a CANDIDATE in the same
// review picker the Wikimedia flow uses. Claude story-gen + factGate are
// untouched and run BEFORE this; a failure here returns null → the caller falls
// back to text-only (the proven default). Blast radius = images only.
//
// No SDK: a plain fetch to the Gemini REST generateContent endpoint, keyed on
// GEMINI_API_KEY (a SECOND provider in its own lane, never Claude's key).
//
// AI-LABELING IS NON-NEGOTIABLE: a generated image is a SYNTHESIZED picture, not
// a historical artifact. The caller stamps the result's artist/license so a kid
// can never mistake an AI's guess at the past for a real period source.
// ════════════════════════════════════════════════════════════════

// gemini-2.5-flash-image ("Nano Banana") — the cheapest current image model
// (~$0.039/image at 1K, generateContent endpoint). Verified Jun 2026; pricing
// and model names move — re-check before relying on the number.
const MODEL = "gemini-2.5-flash-image";
// v1beta, NOT v1: image output (responseModalities: ["TEXT","IMAGE"]) is only
// accepted on v1beta — v1 rejects it with 400 "Unknown name responseModalities".
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 60_000;

export interface IllustrationInputs {
  /** The story's topic/title — anchors the historical period. */
  topic: string;
  /** The passage prose to illustrate (the scene). */
  scene: string;
  /** Optional explicit era directive; falls back to "the period and place of <topic>". */
  era?: string;
  /** How honestly to depict the scene (e.g. "mature"). Threaded from the gate —
   * replaces the old hardcoded "children's / nothing frightening" language.
   * Defaults to "mature". */
  contentMaturity?: string;
}

export interface IllustrationResult {
  /** data: URL (base64) — inline for the slice; bytes-persistence is a full-pass question. */
  dataUrl: string;
  mimeType: string;
  /** The EXACT prompt sent (so the teacher/dev can see what produced the image). */
  prompt: string;
  model: string;
  bytes: number;
  ms: number;
}

// PURE + exported so the exact prompt is reproducible/inspectable. A fixed style
// directive (consistency across a whole story) + a hard period-accuracy clause
// (the only automated nudge against anachronism — the teacher's eye is the real
// guard) + the scene.
export function buildImagePrompt(inputs: IllustrationInputs): string {
  const era = inputs.era?.trim() || `the historical period and place of: ${inputs.topic}`;
  const maturity = inputs.contentMaturity?.trim() || "mature";
  return `A single illustration for a history lesson about ${inputs.topic}.

STYLE (keep consistent across the whole story): warm, painterly storybook illustration; muted historical color palette; natural lighting. No text, words, captions, letters, or numbers anywhere in the image.

CONTENT MATURITY (${maturity}): depict the scene HONESTLY for this audience — do not sanitize the hardship, fear, or danger of the real history. Do not add gratuitous gore, but do not soften the moment into something false.

HISTORICAL ACCURACY — CRITICAL: depict ONLY ${era}. Every visible detail — clothing, hairstyles, architecture, tools, weapons, vehicles, furnishings, landscape — must be accurate to that exact time and place. NO anachronisms: nothing from a later era, no modern objects.

SCENE TO ILLUSTRATE: ${inputs.scene.trim()}

Composition: one clear focal moment, framed like a picture-book page.`;
}

// Returns null on ANY failure (missing key handled by the caller, network error,
// content-filter refusal, no image part, bad JSON) — the fallback contract:
// null → the review picker simply shows no AI candidate, text-only stays intact.
export async function generateIllustration(
  inputs: IllustrationInputs,
  apiKey: string,
): Promise<IllustrationResult | null> {
  const prompt = buildImagePrompt(inputs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[image-gen] HTTP ${res.status} from Gemini`);
      return null;
    }
    const data: any = await res.json();
    // Find the image part (REST may use camelCase inlineData or snake inline_data).
    const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p) => p?.inlineData?.data || p?.inline_data?.data);
    const inline = imgPart?.inlineData ?? imgPart?.inline_data;
    if (!inline?.data) {
      console.warn("[image-gen] no image part in Gemini response");
      return null;
    }
    const mimeType: string = inline.mimeType ?? inline.mime_type ?? "image/png";
    return {
      dataUrl: `data:${mimeType};base64,${inline.data}`,
      mimeType,
      prompt,
      model: MODEL,
      bytes: Math.round((inline.data.length * 3) / 4), // approx decoded size
      ms: Date.now() - t0,
    };
  } catch (e) {
    console.warn(`[image-gen] generation failed: ${String(e).slice(0, 120)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
