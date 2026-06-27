/**
 * themes.ts — the ONE source of truth for theme ids + selection.
 * The model never writes CSS. Its whole job is to return one ThemeId from the
 * closed list below; themes.css does 100% of the rendering.
 *
 * This file is the canonical definition shared by BOTH sides: the generator
 * (server/CLI — e.g. storyPreviewGen.ts forces the `theme` enum from THEME_IDS)
 * and the front-end (src/themes.ts re-exports this module verbatim, so the two
 * can never drift).
 */

export type ThemeId =
  | 'broadsheet-sepia'
  | 'ww1-fieldpost'
  | 'declassified-typewriter'
  | 'parchment-medieval'
  | 'classical-marble'
  | 'expedition-journal'
  | 'frontier-leather'
  | 'civil-rights-midcentury'
  | 'imperial-chinese-scroll'
  | 'islamic-golden-age'
  | 'depression-fsa'
  | 'default';

export const THEME_IDS: ThemeId[] = [
  'broadsheet-sepia',
  'ww1-fieldpost',
  'declassified-typewriter',
  'parchment-medieval',
  'classical-marble',
  'expedition-journal',
  'frontier-leather',
  'civil-rights-midcentury',
  'imperial-chinese-scroll',
  'islamic-golden-age',
  'depression-fsa',
  'default',
];

export function isThemeId(x: unknown): x is ThemeId {
  return typeof x === 'string' && (THEME_IDS as string[]).includes(x);
}

/* ------------------------------------------------------------------ *
 * PLAYER ERA SLUGS.
 * The BranchingPlayer's BOLD per-era theming (the `.branching-player
 * [data-era="…"]` engine in themes.css) uses its OWN era-slug
 * vocabulary, distinct from ThemeId. The wrapper must carry a
 * data-era from THIS list or no per-era block matches and every story
 * renders the same default dark-leather look. Map ThemeId → slug here;
 * ThemeIds with no matching era fall back to 'default'.
 * ------------------------------------------------------------------ */

export type PlayerEra =
  | 'western'
  | 'revolutionary'
  | 'ww1-fieldpost'
  | 'cold-war'
  | 'civil-rights'
  | 'classical'
  | 'industrial'
  | 'dustbowl'
  | 'default';

const THEME_TO_PLAYER_ERA: Record<ThemeId, PlayerEra> = {
  'frontier-leather': 'western',
  'broadsheet-sepia': 'revolutionary',
  'ww1-fieldpost': 'ww1-fieldpost',
  'declassified-typewriter': 'cold-war',
  'classical-marble': 'classical',
  'civil-rights-midcentury': 'civil-rights',
  'parchment-medieval': 'default',
  'expedition-journal': 'default',
  'imperial-chinese-scroll': 'default',
  'islamic-golden-age': 'default',
  'depression-fsa': 'dustbowl',
  default: 'default',
};

/** Resolve a ThemeId to the BOLD player-era slug consumed by data-era. */
export function playerEraForTheme(theme: ThemeId): PlayerEra {
  return THEME_TO_PLAYER_ERA[theme] ?? 'default';
}

/** One-line "use when" per theme — feed these to the classifier prompt. */
export const THEME_USE_WHEN: Record<ThemeId, string> = {
  'broadsheet-sepia': 'early-modern Anglo-American events, ~1770–1860 (Revolution, 1812, early republic)',
  'ww1-fieldpost': 'World War I / the Western Front, 1914–1918',
  'declassified-typewriter': 'the Cold War, ~1945–1991 (Berlin, espionage, the arms race)',
  'parchment-medieval': 'the European Middle Ages, ~800–1450',
  'classical-marble': 'Greco-Roman antiquity',
  'expedition-journal': 'age of exploration / 19th-c field expeditions',
  'frontier-leather': 'the American West, ~1850–1900',
  'civil-rights-midcentury': 'the US civil rights era, ~1955–1968',
  'imperial-chinese-scroll': 'Tang or Song dynasty China / the Silk Road',
  'islamic-golden-age': 'the Abbasid Islamic Golden Age (Baghdad, House of Wisdom, Crusades from the Muslim side)',
  'depression-fsa': '1930s Dust Bowl, the Great Depression, FSA documentary America',
  default: 'anything with no strong era/region match — a correct, non-failure answer',
};

/* ------------------------------------------------------------------ *
 * TIER 1 — heuristic. Free, handles obvious cases.
 * Returns 'default' when nothing matches (a correct answer, not a failure).
 * ------------------------------------------------------------------ */

type Rule = { id: ThemeId; kw: RegExp; teks?: RegExp };

const RULES: Rule[] = [
  { id: 'ww1-fieldpost', kw: /\b(world war i|wwi|ww1|first world war|western front|trench|1914|1915|1916|1917|1918|somme|verdun|gallipoli|armistice|no man'?s land)\b/i },
  { id: 'declassified-typewriter', kw: /\b(cold war|berlin wall|iron curtain|cuban missile|kgb|cia|espionage|arms race|nuclear|sputnik|mccarthy|194[5-9]|19[5-8]\d|1991)\b/i },
  { id: 'broadsheet-sepia', kw: /\b(american revolution|declaration of independence|founding father|war of 1812|boston tea|17[789]\d|18[0-5]\d|colonial|continental congress|federalist)\b/i },
  { id: 'parchment-medieval', kw: /\b(medieval|middle ages|feudal|knight|crusade|monk|cathedral|black death|charlemagne|magna carta|8\d\d|9\d\d|1[0-3]\d\d|144\d)\b/i },
  { id: 'classical-marble', kw: /\b(ancient greece|ancient rome|greco-roman|roman empire|roman republic|athens|sparta|caesar|augustus|colosseum|parthenon|spqr|hellenistic|punic)\b/i },
  { id: 'expedition-journal', kw: /\b(exploration|expedition|explorer|voyage|magellan|columbus|lewis and clark|darwin|beagle|naturalist|cartograph|age of (sail|discovery)|circumnavigat)\b/i },
  { id: 'frontier-leather', kw: /\b(wild west|frontier|gold rush|cowboy|gunslinger|homestead|oregon trail|transcontinental|185\d|186\d|187\d|188\d|189\d|saloon|outlaw)\b/i },
  { id: 'civil-rights-midcentury', kw: /\b(civil rights|segregation|jim crow|montgomery|selma|march on washington|mlk|martin luther king|rosa parks|freedom rider|195[5-9]|196[0-8]|desegregat)\b/i },
  { id: 'imperial-chinese-scroll', kw: /\b(tang dynasty|song dynasty|silk road|imperial china|dynast|confuci|great wall|forbidden|literati|6\d\d|7\d\d|8\d\d|9\d\d|10\d\d|11\d\d|12\d\d)\b/i },
  { id: 'islamic-golden-age', kw: /\b(abbasid|golden age of islam|house of wisdom|baghdad|caliphate|al-?khwarizmi|avicenna|ibn |75\d|8\d\d|9\d\d|10\d\d|11\d\d|125\d)\b/i },
  { id: 'depression-fsa', kw: /\b(dust bowl|dustbowl|great depression|okies?|fsa|farm security|wpa|new deal|grapes of wrath|sharecropp|193\d)\b/i },
];

export function detectEraForTopic(topic: string, teks?: string): ThemeId {
  const hay = `${topic} ${teks ?? ''}`;
  for (const r of RULES) {
    if (r.kw.test(hay)) return r.id;
    if (r.teks && teks && r.teks.test(teks)) return r.id;
  }
  return 'default';
}

/* ------------------------------------------------------------------ *
 * TIER 2 — classifier. Add EXACTLY ONE field to the structured output the
 * StoryPreview gate already generates (no new API call):
 *
 *   theme: ThemeId
 *
 * Paste THEME_CLASSIFIER_INSTRUCTION into that gate's prompt.
 * ------------------------------------------------------------------ */

export const THEME_CLASSIFIER_INSTRUCTION = [
  'Pick exactly ONE theme id for this story from the list below.',
  'If there is no strong era/region match, return "default". "default" is a correct answer, not a failure.',
  'Never invent an id that is not in the list.',
  '',
  ...THEME_IDS.map((id) => `- ${id}: ${THEME_USE_WHEN[id]}`),
].join('\n');

/* ------------------------------------------------------------------ *
 * RESOLUTION ORDER:
 *   teacher override > classifier (when non-default) > heuristic > default
 * Resolve to one token, set data-theme={token} on the passage container,
 * and persist the token with the saved story so replays are stable.
 * ------------------------------------------------------------------ */

export function resolveTheme(input: {
  override?: ThemeId | null;       // manual selector in StoryPreview
  classifier?: ThemeId | null;     // model's `theme` field
  topic: string;
  teks?: string;
}): ThemeId {
  if (input.override && isThemeId(input.override)) return input.override;
  if (input.classifier && isThemeId(input.classifier) && input.classifier !== 'default') {
    return input.classifier;
  }
  return detectEraForTopic(input.topic, input.teks);
}
