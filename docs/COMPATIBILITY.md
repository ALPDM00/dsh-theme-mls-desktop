# Compatibility — DSH Theme · Marathon

> **This file is inherited from the browser-only `dsh-theme-marathon` package and
> describes that variant.** Three things differ in this Desktop package:
>
> 1. `dsh.profile.bundles` must list the **package name** `dsh-theme-mls-desktop`;
>    the row `id: theme-mls-desktop` is what the package's `cordis.patch.yml`
>    *inserts* into the composed tree (see `README.md` §4 — `dsh plugin add` does
>    **not** add the `bundles` entry for the Desktop profile, so it is a required
>    manual step, and without it the plugin silently never loads);
> 2. `index.js` is **not** a no-op — it injects the pre-plugin `<style>` row
>    through `webserver/index-inject` and, on the Desktop, schedules the shell
>    patch (`shell-patch/auto.cjs`). See `README.md` §3 and §4;
> 3. four effects also need the shell patch applied to
>    `<install>/resources/app.asar` (transparent window, hidden caption buttons,
>    a see-through first frame, opens maximized). That step is automatic now, but
>    it is Desktop-only.
>
> Everything below about tokens, services and the client loader applies unchanged.

## Target runtime

| Component | Requirement |
| --------- | ----------- |
| deepseekHarness | `0.1.0-rc.8` or newer |
| Client loader | `window.__ModuleLoader__.load` (browser runtime) |
| Theme service | `ctx.get('theme').overrideTokens(id, map)` |
| Styles service | `styles.insert(css)` (optional; falls back to `<style>` injection) |
| Host half | None required (pure Client theme) |

This plugin uses the **exact same loading contract** as
[`@deepseek-ai/dsh-theme-endfield`](https://github.com/ymh0000123/dsh-theme-endfield):

- Registered through `cordis.patch.yml` → bundle row `id: theme-marathon`.
- `package.json` declares `dsh.bundle.patch` and `exports["./client"]`.
- All work happens in `client.js`; `index.js` is an intentional no-op Host half.

## What it overrides

Only design tokens via `overrideTokens`. The DSH layout, components, routing,
and data are **never** modified. Uninstalling the plugin restores the default
theme automatically (the `overrideTokens` / `styles.insert` disposers fire on
unload).

## Known limitations

- **Per-component selectors** (`[class*="sidebar"]`, `[class*="message"]`, …)
  are best-effort, additive-only (borders, radius, focus outline). Exact class
  names vary between DSH versions; if a future DSH refactors its DOM, some
  component-level accents may not appear — the boot overlay and the token
  palette are unaffected. (The theme no longer paints any overlay of its own:
  grid, scanlines, CRT and sweep were all removed on 2026-09-18.)
- **No settings UI.** There is no in-page drawer and no `localStorage` config:
  the theme applies unconditionally and is enabled/disabled from DSH's plugin
  list. (The old drawer had a real defect — its "启用主题" checkbox dropped the
  body class that styled its own gear button, so turning the theme off hid the
  only control that could turn it back on.)
- **Fonts**: Maratype is embedded base64; if missing, falls back to
  `ui-monospace, monospace`.

## Tested against

| Check | Method | Status |
| ----- | ------ | ------ |
| Plugin loads via `__ModuleLoader__` | `selftest.cjs` (jsdom) | ✅ |
| `overrideTokens` called with correct map | `selftest.cjs` | ✅ |
| CSS injected, font inlined, no placeholder | `check.cjs` + `selftest.cjs` | ✅ |
| Settings toggles mutate `localStorage` + body classes | `selftest.cjs` | ✅ |
| Manual install in a DSH profile | user-side (`dsh plugin --profile web add …`) | ⚠️ verify in copy |
