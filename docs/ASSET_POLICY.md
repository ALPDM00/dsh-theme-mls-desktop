# Asset Policy — DSH Theme · Marathon

> **TL;DR** — This theme is **inspired by** *Marathon* (Bungie). It contains
> **zero** copyrighted Bungie/Marathon assets, trademarks, official artwork, or
> protected fonts. Every pixel is generated at runtime by the plugin itself.

## 1. Inspiration vs. copying

*Marathon* (the Bungie game) is used **only as a visual reference** — colour
mood, HUD vocabulary, grid discipline, glitch language. The plugin does **not**
reproduce any of the following:

- No screenshots, renders, logos, or iconography owned by Bungie / Marathon.
- No game audio, video, or 3D models.
- No extracted or redistributed Bungie fonts or typefaces.
- No trademarked names used as product identity beyond the descriptive theme
  title `dsh-theme-marathon` (a fan-made, non-commercial skin for an unrelated
  tool, deepseekHarness).

## 2. What this plugin actually ships

| Asset | Source | License / note |
| ----- | ------ | -------------- |
| `client.js` (generated) | Authored by this project | MIT |
| CSS (palette tokens, brand accents, boot overlay) | Generated procedurally in `src/client.template.js` | MIT |
| Boot overlay CSS (`src/boot/boot.css`) | Procedural + base64-inline images; no copyrighted source material | MIT |
| Boot overlay images (`assets/boot/green-logo.png`, `blue-pixel.png`, `invert-blue-pixel.png`) | Programmatic DeepSeek company brand mark recreated as PNG for the boot transition | DeepSeek brand mark — fair-use reference; not Bungie / Marathon |
| ~~FUI glyphs (crosshair, corner brackets, data plates)~~ | Removed 2026-09-18 with the plate layer | MIT |
| `Maratype.otf` | **User-supplied** decorative font | **Must be cleared by the user** — see §3 |
| `design-language.md`, `README.md` | Authored docs | MIT |

## 3. Maratype font — responsibility boundary

`Maratype.otf` is provided by the **end user** for their own personal use. The
plugin embeds it as a base64 data-URI at build time (`scripts/build.cjs`) so no
network request is made at runtime.

- The plugin author does **not** claim ownership of Maratype.
- If Maratype is **not** licensed for redistribution, the user must:
  1. keep `assets/fonts/Maratype.otf` **out of any public publish**, or
  2. replace it with a font they are licensed to ship (e.g. an OFL typeface), or
  3. delete the font and accept the `ui-monospace, monospace` fallback.
- The build will still succeed without the font; the `@font-face` simply
  resolves to the fallback stack.

## 4. Publishing & the marketplace

When submitting to `dsh-market`, the entry must declare this theme as
**`type: theme`** and link this policy. Reviewers should confirm:

- No Bungie/Marathon trademark is used as a store identity.
- No copyrighted media is bundled.
- The decorative font's redistribution rights are the uploader's responsibility.

## 5. Takedown

If any asset is later found to infringe, the maintainer will remove it and ship
the fallback stack. File an issue on the repository; response within 14 days.
