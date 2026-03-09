# Chisholm Trail Parallax Asset Contract

These files are the fixed drop-in contract for the reusable Chisholm Trail layered background.
Do **not** rename files; final production art should replace placeholders using the same names.

> Note: this repo currently avoids committing binary assets. The `.png` files in this folder are text stubs so the paths exist; replace each with actual PNG artwork before release.

## Required files
- `/public/backgrounds/chisholm/sky_day.png`
- `/public/backgrounds/chisholm/sky_dusk.png`
- `/public/backgrounds/chisholm/sky_night.png`
- `/public/backgrounds/chisholm/clouds_far.png`
- `/public/backgrounds/chisholm/hills_far.png`
- `/public/backgrounds/chisholm/prairie_mid.png`
- `/public/backgrounds/chisholm/trail_foreground.png`
- `/public/backgrounds/chisholm/herd_strip.png`
- `/public/backgrounds/chisholm/riders_strip.png`
- `/public/backgrounds/chisholm/chuckwagon_strip.png`
- `/public/backgrounds/chisholm/dust_fx_strip.png`

## Dimensions and format guidance
All files should be PNG. Maintain a wide, cinematic aspect and preserve transparency where noted.

| File | Recommended Size | Aspect Ratio | Transparency | Notes |
|---|---:|---:|---|---|
| `sky_day.png` | 3840x1080 | 32:9 | Optional | Full sky paint; can be opaque. |
| `sky_dusk.png` | 3840x1080 | 32:9 | Optional | Dusk variation blended over day/night. |
| `sky_night.png` | 3840x1080 | 32:9 | Optional | Night variation; stars/moon can be baked in. |
| `clouds_far.png` | 4096x512 | 8:1 | **Yes** | Tiling cloud strip for slow parallax. |
| `hills_far.png` | 4096x640 | 32:5 | **Yes** | Distant rolling silhouette, tileable horizontally. |
| `prairie_mid.png` | 4096x640 | 32:5 | **Yes** | Mid prairie silhouettes, tileable horizontally. |
| `trail_foreground.png` | 4096x512 | 8:1 | **Yes** | Foreground trail/base silhouettes, tileable horizontally. |
| `herd_strip.png` | 768x96 | 8:1 | **Yes** | Sprite strip, 8 frames, side-view silhouette loop. |
| `riders_strip.png` | 576x96 | 6:1 | **Yes** | Sprite strip, 6 frames, subtle horse/rider gait. |
| `chuckwagon_strip.png` | 576x96 | 6:1 | **Yes** | Sprite strip, 6 frames, subtle wheel/wagon bounce. |
| `dust_fx_strip.png` | 960x96 | 10:1 | **Yes** | Sprite strip, 10 frames, light looping dust puff. |

## Looping and readability expectations
- Keep actor/fx strips clean silhouettes for readability behind UI.
- Avoid high-contrast highlights near UI zones.
- Ensure all horizontal layers tile seamlessly.
- Keep motion subtle; loops should avoid abrupt frame jumps.
