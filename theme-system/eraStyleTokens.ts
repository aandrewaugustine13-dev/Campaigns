/**
 * eraStyleTokens.ts — per-era visual style fragments for AI IMAGE GENERATION.
 *
 * Sibling of themes.ts and keyed on the SAME ThemeId vocabulary: the era the
 * campaign already declares for page theming (story.era) also picks the image
 * style — one era identifier, two renderers (CSS theme + gen prompt).
 *
 * Each token composes up to three parts:
 *   1. HOUSE_BASELINE — the shared cinematic look every era inherits.
 *   2. filmAnchor    — a specific cinematic reference for the era.
 *   3. finish        — 'glossy' keeps the baseline; 'documentary' SUPPRESSES it
 *      (no cinematic gloss) and biases toward photojournalistic realism.
 *
 * FAIL-SOFT CONTRACT: eraStyleFragment never throws. Unknown/missing/stubbed
 * era → HOUSE_BASELINE only. Image gen must keep working for every era even
 * before its token exists.
 */

import { isThemeId, type ThemeId } from './themes.js';

export type EraFinish = 'glossy' | 'documentary';

export interface EraStyleToken {
  /** The per-era cinematic reference, written as a prompt fragment. */
  filmAnchor: string;
  /** 'glossy' = house baseline + anchor; 'documentary' = anchor only, no gloss. */
  finish: EraFinish;
}

/** The shared look every glossy era inherits. Also the sole fallback for eras
 * with no token yet. */
export const HOUSE_BASELINE =
  'cinematic, painterly, atmospheric lighting, epic scale, subtle film grain, ' +
  'in the visual style of a Ridley Scott historical epic';

/** What replaces the house baseline when finish === 'documentary'. */
const DOCUMENTARY_BIAS =
  'photojournalistic realism, documentary photography, natural available light';

/**
 * Phase 1: ONLY depression-fsa (Dust Bowl) is live — we verify the token
 * visibly biases output before replicating. Planned next (STUBS, do not
 * enable until the Dust Bowl test passes):
 *
 *   'parchment-medieval' (Crusades) — finish 'glossy':
 *     "in the mood of Kingdom of Heaven: muted golds and steel, candlelit
 *      interiors, dust and smoke hanging in sunbeams"
 *   'civil-rights-midcentury' — finish 'documentary' (OVERRIDES the house
 *     baseline entirely — no cinematic gloss, no Ridley Scott):
 *     "in the style of Gordon Parks photojournalism: black and white,
 *      documentary, natural light, dignified, unglamorous"
 */
export const ERA_STYLE_TOKENS: Partial<Record<ThemeId, EraStyleToken>> = {
  'depression-fsa': {
    filmAnchor:
      'in the mood of The Grapes of Wrath: desaturated, dusty, harsh prairie ' +
      'light, weathered faces, WPA-era realism',
    finish: 'glossy',
  },
};

/**
 * Resolve an era identifier (the campaign's ThemeId, possibly absent or a
 * legacy slug) to the composed style fragment for the gen prompt.
 * Never throws; anything unrecognized falls back to HOUSE_BASELINE.
 */
export function eraStyleFragment(eraId: string | null | undefined): string {
  const token = isThemeId(eraId) ? ERA_STYLE_TOKENS[eraId] : undefined;
  if (!token) return HOUSE_BASELINE;
  if (token.finish === 'documentary') {
    return `${token.filmAnchor}; ${DOCUMENTARY_BIAS}`;
  }
  return `${HOUSE_BASELINE}; ${token.filmAnchor}`;
}
