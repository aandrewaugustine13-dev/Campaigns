# Chisholm Trail Parallax Asset Contract

This folder is the single canonical runtime source for the Chisholm Trail background system.
Every active path must resolve to exactly one PNG in this directory.

## Canonical runtime files
- `/backgrounds/chisholm/sky_day.png`
- `/backgrounds/chisholm/sky_dusk.png`
- `/backgrounds/chisholm/sky_night.png`
- `/backgrounds/chisholm/clouds_far.png`
- `/backgrounds/chisholm/hills_far.png`
- `/backgrounds/chisholm/prairie_mid.png`
- `/backgrounds/chisholm/trail_foreground.png`
- `/backgrounds/chisholm/herd_strip.png`
- `/backgrounds/chisholm/riders_strip.png`
- `/backgrounds/chisholm/chuckwagon_strip.png`
- `/backgrounds/chisholm/dust_fx_strip.png`

Removed legacy file:
- `camp_foreground.png` (unused / not loaded by runtime)

## Runtime behavior expectations
- Layer art uses direct file paths only (no gradient fallback layer substitution).
- Parallax tile distance is viewport-aware and tied to the rendered panorama width.
- Foreground strips preserve PNG transparency and animate as sprite sheets.

## Naming policy
Use lowercase snake_case PNG names only. Keep one file per layer/strip with no alternates in active runtime paths.
