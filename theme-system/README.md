# Period Theme System — drop-in files

Two files do the work. The mockup (`Period Themes.dc.html` in the workspace) is the
visual target; these are the production code you paste into your repo.

```
themes.ts    ThemeId union · detectEraForTopic (Tier 1) · classifier prompt + resolveTheme
themes.css   the stylesheet that renders every theme from one data-theme attribute
```

## Integration — 4 steps

1. **Drop in the files.** Put `themes.ts` next to your existing theme code and merge
   `themes.css` into (or import it alongside) your current `themes.css`.

2. **Add the slot hooks.** In `BranchingPlayer.tsx` add `data-slot="…"` attributes to
   the existing elements — see the SLOT MAP comment at the top of `themes.css`. Don't
   restructure markup; if a slot already has a stable class, change the selector in the
   CSS to match instead. Required for ornaments to land:
   - `data-slot="passage"` on the container that gets `data-theme`
   - `data-slot="story-title"`, `data-slot="kicker"`, `data-slot="body"`,
     `data-slot="tracker"`, `data-slot="figure-encounter"`, `data-slot="mcq"`,
     `data-slot="choice"`, `data-slot="ending"` (+ `data-state`), `data-slot="tts"`
   - `data-slot="masthead"` (broadsheet wraps the title), `data-slot="censor-stamp"`
     (ww1 violet stamp element), `data-slot="unwan"` (islamic header panel)

3. **Wire selection.** Replace your ad-hoc detection with `resolveTheme()`:
   - Add the single field `theme: ThemeId` to the structured output the StoryPreview
     gate already generates (no new API call). Paste `THEME_CLASSIFIER_INSTRUCTION`
     into that prompt.
   - `const token = resolveTheme({ override, classifier: gate.theme, topic, teks });`
   - `<div data-slot="passage" data-theme={token}> … </div>`
   - Persist `token` with the saved story so replays are stable.

4. **Markers + per-passage seals.** A few themes want specific marker glyphs in the
   `.marker` spans you render for options:
   - imperial-chinese-scroll → 一 二 三 四
   - islamic-golden-age → ۞
   - others → I/II/III, A/B/C, or 1/2/3 (your call; CSS styles whatever you put there)
   For the Chinese seal, vary the character per passage so it doesn't go wallpaper
   (set it on the figure card, overriding `--seal-glyph` inline).

## Notes carried from the spec

- **Fonts:** `themes.css` hot-links Google Fonts for DEV. For production (classroom
  wifi) self-host woff2 with `font-display:swap`, and subset Noto Serif TC / Reem Kufi
  to the glyphs you actually use — they're megabytes unsubset.
- **The one rule:** each theme's era-lock is type/ornament/layout, never color. The
  ornament hooks (masthead rules, violet censor stamp, illuminated `::first-letter`,
  incised text-shadow, vertical writing-mode, ʿunwan panel) are where the era lives.
- **Reduced motion** is already wrapped in `prefers-reduced-motion: no-preference`.
- **declassified-typewriter** (your existing Cold War theme) is included so the enum is
  complete and so the WWI differentiator is explicit: violet stamp + khaki + poster
  condensed vs. black stamp + manila + clean typewriter.

## What still needs a human / Claude Code

The TSX edits (steps 2–3) happen in your repo, which I can't see. Open the repo in
Claude Code, hand it this folder + the original spec, and say "wire this in per the
README." The CSS and selection logic are done; the plumbing is the remaining work.
