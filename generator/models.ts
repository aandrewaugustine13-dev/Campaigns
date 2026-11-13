/**
 * Chunked generation model split. Toggle or A/B test with env vars.
 *
 * The architect call writes the compact causal skeleton (structure and state
 * logic only). The writer calls expand events, sages, trivia, and closers.
 * Writer calls stay parallel. Nothing else in the pipeline reads these ids:
 * Stage-1 proposers, the monolithic path, the fact gate, and image generation
 * keep their own model strings.
 *
 * Defaults are model ids this repo already uses. gemini-2.5-pro and
 * gemini-2.5-flash are deprecated, and from 1 Dec 2026 the API reroutes
 * gemini-2.5-pro onto a Flash model and gemini-2.5-flash onto Flash-Lite.
 * Using those names as the default would erase the architect/writer split.
 * Set CAMPAIGN_ARCHITECT_MODEL or CAMPAIGN_NODE_WRITER_MODEL to try them,
 * or any other id, without a code change.
 *
 * Architect default matches GRADER_STRONG in generator/eval-harness.ts.
 * Writer default is the Flash id the chunked path already runs.
 */
function modelFromEnv(name: string, fallback: string): string {
  const value = process.env[name];
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

export const ARCHITECT_MODEL = modelFromEnv("CAMPAIGN_ARCHITECT_MODEL", "gemini-3.1-pro-preview");

export const NODE_WRITER_MODEL = modelFromEnv("CAMPAIGN_NODE_WRITER_MODEL", "gemini-3.5-flash");

export const CAMPAIGN_MODELS = {
  architect: ARCHITECT_MODEL,
  nodeWriter: NODE_WRITER_MODEL,
} as const;
