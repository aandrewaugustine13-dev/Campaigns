/**
 * themes.ts — front-end entry point for the theme system.
 *
 * The canonical definition now lives in ../theme-system/themes.ts (shared with
 * the generator, which forces the classifier `theme` enum from the same
 * THEME_IDS). This module re-exports it verbatim so the app keeps importing
 * `./themes` while there is exactly ONE source of truth — adding a theme in
 * theme-system updates both sides at once.
 */
export * from '../theme-system/themes';
