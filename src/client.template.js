/* =============================================================================
 * dsh-theme-mls-desktop — Client half
 * -----------------------------------------------------------------------------
 * GENERATED FILE. Do not edit client.js directly — edit src/client.template.js
 * and run `node scripts/build.js` (it base64-inlines assets/fonts/Maratype.otf
 * in place of the __MARATYPE_BASE64__ placeholder).
 *
 * Loading contract (identical to @deepseek-ai/dsh-theme-endfield):
 *   - Registered through window.__ModuleLoader__.load({ id, factory }).
 *   - factory returns a module whose `apply(ctx)` is invoked by the DSH
 *     Cordis runtime.
 *   - Theme tokens are overridden via ctx.get('theme').overrideTokens(id, map).
 *   - Extra CSS is injected via the `styles` global when present, otherwise a
 *     <style data-plugin="..."> tag is appended to <head>.
 *
 * All user-facing settings are persisted in localStorage and surfaced through a
 * self-contained floating settings drawer (no dependency on an unverified
 * settings-service API).
 * ========================================================================== */

window.__ModuleLoader__.load({
  id: 'dsh-theme-mls-desktop',
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    var PLUGIN_ID = 'dsh-theme-mls-desktop';
    // 本地版本号（构建时由 scripts/build.cjs 从 package.json 注入）。更新检查把它
    // 与 GitHub main 分支的 package.json 版本比较；见 updateCheck()。
    var PLUGIN_VERSION = '__MAR_PLUGIN_VERSION__';

    // Boot payload (namespaced CSS + DOM + marathon engine + intro engine, plus
    // base64-embedded PNGs) is injected here at build time by scripts/build.cjs —
    // source of truth lives in src/boot/* and assets/boot/*. When null (raw
    // template run without a build) the boot overlay simply does not mount.
    var BOOT_PAYLOAD = /*__BOOT_PAYLOAD__*/ null;

    // Task-completion overlay payload (reverse red S sweep -> matrix marks ->
    // black -> hard-cut tiles revealing the live UI + dot field + green banner),
    // injected here at build time by scripts/build.cjs from src/boot/done.*
// same contract as BOOT_PAYLOAD above. Null in a raw template run: the
    // overlay then simply never mounts, and the trigger it would have served
    // stays inert.
    var DONE_PAYLOAD = /*__DONE_PAYLOAD__*/ null;

    // Running-strip payload (运行动画): the compact canvas engine that plays in
    // the native [data-chat-running] row above the composer. Same build-time
    // contract as BOOT/DONE above; null in a raw template run, in which case
    // the strip simply never mounts and the native status row is left alone.
    var RUN_PAYLOAD = /*__RUN_PAYLOAD__*/ null;

    // Right-side dot animation (动画1) payload. Separate from RUN_PAYLOAD on
    // purpose: 2026-11-05 the user asked for the two animations to be two
    // independent options, so either engine can be absent / off without the
    // other noticing.
    var DOT_PAYLOAD = /*__DOT_PAYLOAD__*/ null;

    function apply(ctx) {
      var doc = (typeof document !== 'undefined') ? document : null;

      // ---- stale boot flag (#5) --------------------------------------------
      // `html[data-mar-boot]` is the boot overlay's see-through switch, and
      // boot.css turns it into `html[data-mar-boot] body > * { visibility:hidden }`.
      // Its only writer is the boot payload's own intro engine
      // (src/boot/engine-intro.js → forceTransparent(true)) and its only
      // remover is `__mbIntroStop()`. A plugin hot reload throws the module away
      // (and with it the engine) before that hook can run, so the attribute
      // survives the host being removed: the NEXT stylesheet is injected with
      // the flag still on and the whole app renders invisible behind an empty
      // html — the "热重载后整页文字不可见" report.
      // Cleared HERE, before the idempotency guard, on purpose: a second apply()
      // that short-circuits two lines below still has to be able to un-hide the
      // page. removeAttribute is idempotent, so a clean first load pays nothing.
      if (doc && doc.documentElement) doc.documentElement.removeAttribute('data-mar-boot');

      // ---- idempotency -----------------------------------------------------
      // 2026-11-06: DSH 的 client HMR（dsh-client-modules `replace()`）在重跑本插件
      // 前会先 `removeOwnedStyles(id)` —— 直接摘掉我们的 <style data-plugin=…>，然后
      // 才 import + refresh。如果上一次的 dispose 没跑完（或没被调用），下面这行闸门
      // 会让新 apply 直接 return，页面就停在「样式表被摘掉、旧节点还在」的半死状态：
      // 主题整体变淡，点阵失去 `position:absolute` 变成普通块，掉到输入框左下角。
      // 所以闸门以「我们的样式表还在」为条件：样式表没了就当作全新 apply（旧 host
      // 会在 runApply / dotSyncDom 里按 id 清掉）。
      if (typeof window !== 'undefined' && window.__dshThemeMarathonApplied) {
        var marSheet = doc
          ? (doc.querySelector('style[data-plugin="' + PLUGIN_ID + '"]') ||
             doc.querySelector('style[data-dyn="' + PLUGIN_ID + '"]'))
          : null;
        if (marSheet) return;
        window.__dshThemeMarathonApplied = false;
      }
      if (typeof window !== 'undefined') window.__dshThemeMarathonApplied = true;
      // 本次安装的实例号：旧实例（HMR 半拆除）在下一个 tick 看到令牌不一致会退场。
      INSTANCE_TOKEN = (typeof window !== 'undefined')
        ? (window.__marThemeRunToken = (window.__marThemeRunToken || 0) + 1)
        : 0;

      if (!doc) return;

      var body = doc.body;
      if (!body) return;

      //   NEVER capture the theme service at apply time.
      //   DSH's client services are registered by their own plugins and the
      //   activation order is NOT guaranteed. Measured on the Desktop
      //   2026-11-05 (`mar.debug.v1` → `themeService:false`): at apply time
      //   `ctx.get('theme')` was still null, and because this line used to cache
      //   it, every service-backed path was dead for the whole session —
      //   `overrideTokens` never ran, and the appearance preference could not be
      //   read at all. That is exactly the reported bug: 通用设置 → 深色 changed
      //   DSH's own palette while the theme's plate stayed light, with no pour.
      //   It is the same "only fetched once" trap the sessions service had (see
      //   the 会话面 note further down). Read it live; cache only a real answer.
      var theme = null;
      var themeSvcCalls = 0, themeSvcAt = 0;   // diagnostics only (mar.debug.v1)

      function themeSvc() {
        if (theme) return theme;
        themeSvcCalls++;
        try {
          theme = (ctx && typeof ctx.get === 'function') ? ctx.get('theme') : null;
        } catch (e) { theme = null; }
        if (theme) themeSvcAt = Date.now();
        return theme;
      }

      // ---- CSS injection (idempotent) -------------------------------------
      function insertCss(css) {
        if (typeof styles !== 'undefined' && styles && typeof styles.insert === 'function') {
          return styles.insert(css);
        }
        var old = doc.querySelectorAll('style[data-plugin="' + PLUGIN_ID + '"]');
        for (var i = 0; i < old.length; i++) {
          if (old[i].parentNode) old[i].parentNode.removeChild(old[i]);
        }
        var el = doc.createElement('style');
        el.setAttribute('data-plugin', PLUGIN_ID);
        el.textContent = css;
        doc.head.appendChild(el);
        return function () { if (el.parentNode) el.parentNode.removeChild(el); };
      }

      // ---- token map: ONE source of truth, projected TWO ways --------------
      // One palette, no light/dark variants: both slots resolve to the same
      // --mar-* custom property so DSH's own light/dark switch never fights the
      // theme. The palette is specified entirely in the injected stylesheet.
      //
      // DSH resolves every surface through these aliases (backgrounds, borders,
      // ink, links, states). The theme needs them to point at its own palette,
      // and there are two ways to make that happen:
      //
      //   1. the theme service: `ctx.get('theme').overrideTokens(id, map)`. This
      //      is the sanctioned path — the layer is folded into the snapshot that
      //      ui-layout's presenter projects onto the document;
      //   2. a DIRECT inline write on <body> (themeAliasApply below).
      //
      // Path 2 is not a hack around the presenter: the presenter writes the
      // snapshot's tokens the same way — as inline custom properties on body
      // (dsh-client-ui-layout `lib/types/client/theme-presenter.js`: "the
      // theme's alias tokens … as inline variables on body"). It is the SAME
      // channel, just sourced from us.
      //
      // It is also REQUIRED, measured 2026-10-16 on the live Desktop window:
      // the service path had silently done nothing, so every DSH surface still
      // wore its native palette — body background #151517 (= DSH's dark base,
      // `--dsw-static-neutral-bluish-950`) instead of the theme's `#0B0D0B`,
      // the 对话/轨迹 tab active colour and the sidebar folder icons still
      // `#7AAAFF` (= `--dsw-static-deepseek-400`, DSH's business blue), and the
      // user-visible symptom "上一轮改动并没有实现". The theme's own CSS rules
      // (accent fills etc.) had been masking how much of the palette never
      // landed. Writes are re-asserted after the presenter's own writes (it
      // removes the names it applied before writing the next snapshot) — see
      // the theme/change hook and the 1.2s sweep.
      //
      // Coverage note: DSH's light token set resolves most surfaces to pure
      // white (--dsw-static-neutral-bluish-00). Overriding only the main chain
      // (bg-base / layer-1 / layer-2 / overlay) leaves the composer card, the
      // "new session" button, menus and code blocks white — light text on
      // white. The list below is therefore *complete*, not decorative: every
      // entry still resolves to one of the four palette colours.
      var both = function (v) { return { light: v, dark: v }; };
      var MAR_TOKEN_MAP = {
          '--dsw-alias-bg-base':           both('var(--mar-bg-void)'),
          '--dsw-alias-bg-layer-1':        both('var(--mar-bg-deep)'),
          '--dsw-alias-bg-layer-2':        both('var(--mar-bg-panel)'),
          '--dsw-alias-bg-layer-3':        both('var(--mar-bg-overlay)'),
          '--dsw-alias-bg-overlay':        both('var(--mar-bg-overlay)'),
          '--dsw-alias-bg-module-platform':both('var(--mar-bg-panel)'),
          '--dsw-alias-bg-multi-select':   both('var(--mar-bg-panel)'),
          '--dsw-alias-bg-skeleton':       both('var(--mar-line-faint)'),
          '--dsw-alias-border-l1':         both('var(--mar-line-faint)'),
          '--dsw-alias-border-l2':         both('var(--mar-line-strong)'),
          '--dsw-alias-border-l3':         both('var(--mar-line-strong)'),
          '--dsw-alias-border-l4':         both('var(--mar-line-strong)'),
          '--dsw-alias-border-inverted':   both('var(--mar-line-strong)'),
          '--dsw-alias-border-inverted2':  both('var(--mar-line-faint)'),
          '--dsw-alias-border-l2-darkmode-thin': both('var(--mar-line-faint)'),
          '--dsw-alias-label-primary':     both('var(--mar-ink-primary)'),
          '--dsw-alias-label-secondary':   both('var(--mar-ink-secondary)'),
          '--dsw-alias-label-tertiary':    both('var(--mar-ink-tertiary)'),
          '--dsw-alias-label-primary-dimmed': both('var(--mar-ink-secondary)'),
          // foreground/inverted sit *on* a solid fill — --dsw-alias-brand-primary
          // (bright acid green) and friends — so they are the ink for that fill
          // and must NOT be `var(--mar-bg-void)`. They used to be, which read as
          // "black on green" for as long as the surface stayed dark; the moment
          // 「主白 + 绿」 turns the UI light (--mar-solid-ink below), a void-bound
          // ink would have flipped to WHITE on the same green fill. --mar-solid-ink
          // is a constant: it never moves with the light scheme.
          '--dsw-alias-label-primary-foreground': both('var(--mar-solid-ink)'),
          '--dsw-alias-label-primary-inverted':   both('var(--mar-solid-ink)'),
          '--dsw-alias-brand-primary':     both('var(--mar-accent)'),
          '--dsw-alias-brand-primary-invert': both('var(--mar-solid-ink)'),
          '--dsw-alias-brand-text':        both('var(--mar-ink-primary)'),
          // ---- the last native blues, second pass (2026-10-11) ----------------
          // Measured by scanning the installed app.asar byte-exactly (see
          // .generated/scan-blue-tokens.cjs / scan-blue-usage.cjs): these ALIASES
          // still resolved to DSH's blue and paint visible UI — the 「深度思考」
          // label, the document-preview selection, the onboarding card. They are
          // semantic aliases, not part of the static ramps, so they can be pinned
          // outright.
          // The static blue / deepseek / neutral-bluish RAMPS stay untouched on
          // purpose: they also feed Markdown syntax highlighting (the bundle maps
          // e.g. "85,85,255" -> --dsw-static-blue-400), so pinning a whole ramp
          // would recolour code blocks too.
          //
          // DELIBERATELY **NOT** PINNED — `--dsw-alias-link`. It is the colour of
          // a link INSIDE the conversation text, and that is user content, not
          // chrome: 2026-10-16 the user asked for exactly this ("我们对话中所输出
          // 的文本，有些是蓝色的内容，这部分不用改，保持默认就行"). It was pinned for one
          // round and then reverted; DSH's own link blue stays. Anything that IS
          // chrome (the active 对话/轨迹 tab, the sidebar folder icons) rides
          // `--dsw-alias-state-business-primary`, which is pinned above and has
          // been since the beginning.
          //   deep-diving is TEXT, so it goes through --mar-accent-text: the accent
          // as a letterform is readable on the dark plate and becomes the ink on
          // the white one — the theme's own rule for accent-as-text.
          '--dsw-alias-label-deep-diving':     both('var(--mar-accent-text)'),
          '--dsw-alias-label-deep-diving-shimmer': both('var(--mar-accent-text)'),
          // the selection is a WASH (native: blue at 40%): the accent at the same
          // 40%, not --mar-wash-accent (its 14% is too faint to read as selected)
          '--dsw-alias-bg-document-selection': both('var(--mar-select)'),
          '--dsw-alias-onboarding-accent':     both('var(--mar-accent)'),
          '--dsw-alias-state-error-primary':   both('var(--mar-signal)'),
          '--dsw-alias-state-error-secondary': both('var(--mar-signal)'),
          '--dsw-alias-state-warn-primary':    both('var(--mar-accent)'),
          '--dsw-alias-state-warn-secondary':  both('var(--mar-accent)'),
          '--dsw-alias-state-warn-label':      both('var(--mar-accent)'),
          '--dsw-alias-state-success-primary':   both('var(--mar-accent)'),
          '--dsw-alias-state-success-secondary': both('var(--mar-accent)'),
          // "business" is DSH's blue (tab underline, links) — collapse onto the
          // theme accent so nothing blue leaks through
          '--dsw-alias-state-business-primary':  both('var(--mar-accent)'),
          '--dsw-alias-state-business-tertiary': both('var(--mar-ink-tertiary)'),
          '--dsw-alias-button-elevated-fill':  both('var(--mar-bg-deep)'),
          '--dsw-alias-button-floating-fill':  both('var(--mar-bg-deep)'),
          '--dsw-alias-button-floating-hover': both('var(--mar-bg-panel)'),
          '--dsw-alias-button-ghost-active-fill':  both('var(--mar-bg-panel)'),
          '--dsw-alias-button-ghost-active-hover': both('var(--mar-bg-overlay)'),
          '--dsw-alias-button-ghost-active-border':both('var(--mar-line-strong)'),
          '--dsw-alias-button-primary-dimmed': both('var(--mar-bg-panel)'),
          '--dsw-alias-button-primary-hover':  both('var(--mar-bg-panel)'),
          '--dsw-alias-button-info-fill':      both('var(--mar-accent)'),
          '--dsw-alias-button-info-hover':     both('var(--mar-ink-secondary)'),
          // a "contrast" control is an accent-filled solid, and its label comes
          // from label-primary-foreground above — so it has to BE the accent,
          // not `var(--mar-ink-primary)`, or the light layer turns it black on
          // black. Everything solid resolves to the accent; nothing else does.
          '--dsw-alias-button-contrast-fill':  both('var(--mar-accent)'),
          '--dsw-alias-interactive-bg-hover-solid': both('var(--mar-bg-panel)'),
          '--dsw-alias-markdown-code-block':          both('var(--mar-bg-deep)'),
          '--dsw-alias-markdown-code-block-banner':   both('var(--mar-bg-panel)'),
          '--dsw-alias-markdown-inline-code':         both('var(--mar-line-faint)'),
          '--dsw-alias-markdown-placeholder':         both('var(--mar-bg-panel)'),
          '--dsw-alias-markdown-citation':            both('var(--mar-line-strong)'),
          '--dsw-alias-markdown-tag':                 both('var(--mar-line-strong)'),
          '--dsw-alias-markdown-code-segment-selected':   both('var(--mar-line-strong)'),
          '--dsw-alias-markdown-code-segment-unselected': both('var(--mar-line-faint)'),
          '--dsw-alias-tooltip-bg':        both('var(--mar-bg-overlay)'),
          '--dsw-alias-toast-bg':          both('var(--mar-bg-panel)'),
          // Scrollbars are deliberately NOT themed any more. The theme used to
          // paint the thumb with a 1px accent border and give hover an accent
          // fill, which read as "the scrollbar is green" — the reported wrong
          // colour. DSH's own scrollbar defaults are used instead, so the four
          // --dsw-alias-scrollbar-* overrides and the ::-webkit-scrollbar rules
          // are both gone. Do not reintroduce a --mar-accent here.
          '--dsw-specific-input-major':    both('var(--mar-bg-panel)'),
          '--dsw-specific-menu':           both('var(--mar-bg-overlay)'),
          '--dsw-specific-selector':       both('var(--mar-bg-deep)'),
          '--dsw-specific-login-input':    both('var(--mar-bg-deep)'),
          '--dsw-specific-bubble':         both('var(--mar-bg-panel)'),
          '--dsw-specific-bubble-highlight': both('var(--mar-line-faint)'),
          '--dsw-specific-sidebar-fill':   both('var(--mar-bg-void)'),
          // ---- second pass (2026-09-18) --------------------------------------
          // These 20 were left on DSH's own palette and only showed up when
          // probing every --dsw token instead of eyeballing the screenshot: in
          // the *light* set they are near-white surfaces (#ebeef2 sidebar nav
          // item, #f5f6f7 tip, #e6faed success tint) or blue-grey washes
          // (#263148 interactive hover/active) and a stray blue brand
          // (#4176e6). They are the last off-palette colours in the UI.
          '--dsw-alias-interactive-bg-active':        both('var(--mar-wash-strong)'),
          '--dsw-alias-interactive-bg-hover':         both('var(--mar-wash)'),
          '--dsw-alias-interactive-bg-hover-accent':  both('var(--mar-wash-strong)'),
          '--dsw-alias-interactive-bg-hover-danger':  both('var(--mar-wash-danger)'),
          '--dsw-alias-button-tool-bar-fill':         both('var(--mar-wash)'),
          '--dsw-alias-button-tool-bar-fill-invisible': both('var(--mar-wash-faint)'),
          '--dsw-alias-button-tool-bar-hover':        both('var(--mar-wash-strong)'),
          '--dsw-alias-label-caption':                both('var(--mar-ink-tertiary)'),
          '--dsw-alias-label-dimmed':                 both('var(--mar-ink-secondary)'),
          '--dsw-alias-label-primary-bluish':         both('var(--mar-ink-primary)'),
          // DSH ships this token name with a typo (the suffix is duplicated in
          // the declaration *and* in the one consumer, ui-trajectory), so the
          // typo'd spelling is the one that actually resolves — cover both.
          '--dsw-alias-brand-primary-new-color':      both('var(--mar-accent)'),
          '--dsw-alias-brand-primary-new-colorprimary-new-color': both('var(--mar-accent)'),
          '--dsw-alias-state-success-tertiary':       both('var(--mar-wash)'),
          '--dsw-alias-state-warn-tertiary':          both('var(--mar-wash)'),
          '--dsw-specific-sidebar-nav-item-active':        both('var(--mar-bg-panel)'),
          '--dsw-specific-sidebar-nav-item-active-accent': both('var(--mar-bg-panel)'),
          '--dsw-specific-sidebar-nav-item-hover':         both('var(--mar-bg-panel)'),
          '--dsw-specific-tip':                       both('var(--mar-bg-panel)'),
          '--dsw-alias-bg-mask-drop':                 both('var(--mar-scrim)')
      };

      //   Path 1 — the theme service. Retried until it answers: at apply time it
      //   is usually not registered yet (see themeSvc), so a single attempt here
      //   would silently lose the layer for the whole session. `themeAdopt` calls
      //   this again on each sweep until it sticks.
      var themeTokensDone = false;
      function themeOverrideTokens() {
        if (themeTokensDone) return;
        var svc = themeSvc();
        if (!svc || typeof svc.overrideTokens !== 'function') return;
        try {
          svc.overrideTokens(PLUGIN_ID, MAR_TOKEN_MAP);
          themeTokensDone = true;
        } catch (e) {}
      }
      themeOverrideTokens();

      //   Path 2 — the same map, written straight onto <body> as inline custom
      //   properties. Every DSH surface inherits from <body>, so this lands even
      //   when the service path does not answer (see the note above). Values are
      //   `var(--mar-*)`, which resolve against <body>'s own declarations, so
      //   the theme's light layer keeps working through them.
      var aliasLastAt = 0;
      function themeAliasApply() {
        if (!body || !body.style) return;
        for (var name in MAR_TOKEN_MAP) {
          if (!Object.prototype.hasOwnProperty.call(MAR_TOKEN_MAP, name)) continue;
          var modes = MAR_TOKEN_MAP[name];
          body.style.setProperty(name, modes.dark !== undefined ? modes.dark : modes.light);
        }
        aliasLastAt = Date.now();
      }

      //   One-shot self-check, written to localStorage so support can read it
      //   back out of the profile (`mar.debug.v1`). It is the only honest way to
      //   tell "the palette landed" from "the theme's own CSS rules are masking
      //   that it never did": body's computed background is the tell.
      function marThemeReport() {
        try {
          if (!window.localStorage) return;
          var cs = (typeof window.getComputedStyle === 'function')
            ? window.getComputedStyle(body) : null;
          window.localStorage.setItem('mar.debug.v1', JSON.stringify({
            at: Date.now(),
            themeService: !!(function () {
              var svc = themeSvc();
              return svc && typeof svc.getTheme === 'function';
            })(),
            themeServiceCalls: themeSvcCalls,
            themeServiceAt: themeSvcAt,
            domThemeSource: (function () {
              try { return doc.documentElement.getAttribute('data-ds-theme-source') || ''; } catch (e) { return ''; }
            })(),
            preference: BG_STATE.pref,
            colorScheme: BG_STATE.scheme,
            accent: ACCENT_STATE.color,
            bodyBg: cs ? cs.backgroundColor : '',
            aliasBgBase: cs ? cs.getPropertyValue('--dsw-alias-bg-base').trim() : '',
            lastAlignedAt: aliasLastAt
          }));
        } catch (e) {}
      }

      // ---- stylesheet ------------------------------------------------------
      var FONT_B64 = '__MARATYPE_BASE64__';
      var css = [
        '@font-face{',
        '  font-family:"Maratype";',
        '  src:url(data:font/otf;base64,' + FONT_B64 + ') format("opentype");',
        // `block`, not `swap`. Maratype is used ONLY inside the boot overlay
        // (`#dshMarBootHost`), and the overlay is mounted late -- after the
        // plugin bundle runs -- so with `swap` the caption painted once with
        // fallback metrics and again with the real ones (~200ms apart, measured),
        // which read as the wordmark jumping sideways. A `block` period hides
        // the text instead of painting it wrong; the font is a data: URL, so it
        // resolves in about the same ~200ms.
        '  font-weight:400;font-style:normal;font-display:block;',
        '}',

        '/* ---- palette variables ------------------------------------------------',
        '   One fixed palette. Three surfaces + one text colour + one accent:',
        '     #0B0D0B  the surface (page, sidebar, code blocks)',
        '     #272733  raised surface (cards, composer, menus, buttons)',
        '     #2E2F38  top surface + every hairline (popovers, tooltips, borders)',
        '     #DFDEE0  text (secondary/tertiary and the hover washes are alpha',
        '              reductions of this one value — no extra greys)',
        '     #C0FE04  accent — brand lockup, and the fill of the two primary',
        '              controls (新会话 / 会话列表行 / 发送按钮)',
        '     --mar-accent-ink is what sits *on* an accent fill: the surface',
        '     colour #0B0D0B. Accent fill + accent ink is the one high-contrast',
        '     pairing in the theme; do not put #DFDEE0 on #C0FE04.',
        '   Do not add a colour here without a reason; "just one more shade" is',
        '   how this theme ended up with five near-identical dark greens. */',
        'body.theme-marathon{',
        '  --mar-accent:#C0FE04;',
        '  --mar-accent-ink:#0B0D0B;',
        '  /* --mar-solid-ink is the ink for any SOLID fill (the accent, and the',
        '     few tokens that resolve through a solid). It is a constant: unlike',
        '     every other colour here it is never re-declared by the light layer,',
        '     because a solid fill does not change when the UI goes light. */',
        '  --mar-solid-ink:#0B0D0B;',
        '  --mar-signal:#FF003C;',
        '  --mar-bg-void:#0B0D0B;',
        '  /* The slab colour for the two mosaic reveals (settings panel, task board).',
        '     It is NOT --mar-bg-void, because a slab has to CONTRAST with the surface',
        '     it blanks and void is the extreme end of each palette: on 主黑 void is far',
        '     below the #272733 panel (a big jump, visible), but on 主白 void is #FFFFFF',
        '     against a #F2F3EE panel — almost the same colour, so the whole wave was',
        '     invisible ("白色模式下动画效果不明显"). Measured palette, both modes, and',
        '     the light slab is set to #C7CABF so the two modes read with comparable',
        '     strength. Dark keeps void, which already worked. */',
        '  --mar-mosaic-fill:#0B0D0B;',
        '  --mar-bg-deep:#0B0D0B;',
        '  --mar-bg-panel:#272733;',
        '  --mar-bg-overlay:#2E2F38;',
        '  --mar-ink-primary:#DFDEE0;',
        '  --mar-ink-secondary:rgba(223,222,224,.72);',
        '  --mar-ink-tertiary:rgba(223,222,224,.45);',
        '  --mar-line-faint:#272733;',
        '  --mar-line-strong:#2E2F38;',
        '  /* hover / selection washes (text colour at low alpha) */',
        '  --mar-wash-faint:rgba(223,222,224,.05);',
        '  --mar-wash:rgba(223,222,224,.08);',
        '  --mar-wash-strong:rgba(223,222,224,.14);',
        '  --mar-wash-danger:rgba(255,0,60,.10);',
        '  /* the document-preview selection band. DSH ships it as its blue at 40%;',
        '     the accent at the same 40% keeps the weight while dropping the blue.',
        '     Derived from --mar-accent, so it needs no light-layer entry. */',
        '  --mar-select:color-mix(in srgb,var(--mar-accent) 40%,transparent);',
        '  /* ---- 每轮 Token 结算便签：永远保持最初那支酸绿，不跟主题色走 ------',
        '     用户 2026-10-17："你多更改了我 TOKEN 结算的颜色，这里保持我们原来的',
        '     绿色就好。" 便签（.mlsb-*）以前直接吃 --mar-accent / --mar-accent-ink，',
        '     于是换主题色时它也跟着变色；更要紧的是，偏暗的主题色会把 accent-ink',
        '     翻成白墨（见 accentInk），那顶在**固定绿**的横幅上就是白字压酸绿 ——',
        '     所以这里必须是一对独立的常量，而不只是"把 accent 复制一遍"。 */',
        '  --mar-bill-accent:#C0FE04;',
        '  --mar-bill-ink:#0B0D0B;',
        '  /* 便签里那几个酸绿数字（.mlsb-acid）是**文字**：深色底盘上用酸绿，',
        '     浅色底盘上必须退回主墨色（与 --mar-accent-text 同一个道理）。 */',
        '  --mar-bill-acid:#C0FE04;',
        '  /* the accent at low alpha, for hovering something that is accent-',
        '     selected — a wash, not a second accent face */',
        '  --mar-wash-accent:rgba(192,254,4,.14);',
        '  /* the accent AS TEXT — a different job from --mar-accent-ink, which is',
        '     the ink you put ON an accent fill. On the dark plate the accent reads',
        '     as a letterform just fine (#C0FE04 on the hover wash is 8.4:1). On the',
        '     light plate the same green on the same wash is 1.06:1 — the label',
        '     simply disappears (measured: hovering a settings nav cell in',
        '     「主白 + 绿」 turned 插件 into a green ghost). So in the light scheme',
        '     "accent text" is the primary ink instead: there, green is a surface',
        '     (a fill, a wash, a notch) and never a letterform. Anything that draws',
        '     the accent as `color` goes through this variable, not --mar-accent. */',
        '  --mar-accent-text:#C0FE04;',
        '  /* scrims */',
        '  --mar-scrim:rgba(11,13,11,.75);',
        '}',

        '/* ---- light layer: what 「主白 + 绿」 does to the whole UI -------------',
        '   The field is a LIGHT surface: a white plate with green glyphs on it,',
        '   so the UI on top has to be light too — white plate, black ink, the',
        '   four surfaces light, the same accent green. That is the exact mirror of',
        '   「主黑 + 绿」, which needs nothing here because DSH already ships a dark',
        '   palette; this layer is the whole difference between the two pairs.',
        '   (The predecessor of this layer carried a bright acid-green field and',
        '   was self-contradictory: white ink on green wherever a container stepped',
        '   aside, dark olive everywhere else under a 60% black veil — the field',
        '   that "looks like it never applied" and "white on green, I cannot read',
        '   it" at the same time. A white field deletes the contradiction instead',
        '   of patching it: both pairs are now one colour for the field and the',
        '   opposite for the ink, with green reserved for glyphs and accents.)',
        '   It is a SCHEME, not a second theme — only the --mar-* surface/ink/line',
        '   variables move, and only while .mar-bg-light is on <body>. JS sets it',
        '   from BG_STATE.scheme, i.e. from the chosen colour pair and NOT from the',
        '   field switch: 背景动画 must keep the white UI. Binding it to the drawn',
        '   field instead is exactly the reported bug — 「主白 + 绿」 + 关掉背景动画',
        '   dropped the page back to the dark pairing, as if 主黑 + 绿 had been',
        '   picked. Nothing has to be re-injected into DSH: every --dsw token',
        '   already resolves through these variables.',
        '   --mar-accent / --mar-accent-ink / --mar-solid-ink are deliberately',
        '   absent below: brand lockup and accent fills keep black ink on green',
        '   in both modes. --mar-accent-text is the one accent-related variable',
        '   that DOES move — it is the "would have been green text" case, and on',
        '   a white plate that has to become the ink.',
        '   Palette only — the field layer is untouched: no scrim sits between',
        '   the canvas and the chrome on either scheme (see BG_MODES), so the',
        '   glyphs read at full strength on white exactly as they do on black,',
        '   and black ink keeps them decoration rather than noise. */',
        'body.theme-marathon.mar-bg-light{',
        '  --mar-bg-void:#FFFFFF;',
        '  /* #C7CABF (= --mar-line-strong here) instead of the white void: the panels',
        '     the slabs blank are #F2F3EE, so a white slab was invisible. See the note',
        '     on the dark declaration. */',
        '  --mar-mosaic-fill:#C7CABF;',
        '  --mar-bg-deep:#FFFFFF;',
        '  --mar-bg-panel:#F2F3EE;',
        '  --mar-bg-overlay:#E8EAE3;',
        '  --mar-ink-primary:#0B0D0B;',
        '  /* the accent may no longer be TEXT here — see --mar-accent-text above */',
        '  --mar-accent-text:#0B0D0B;',
        '  /* same rule for the settlement note\'s green NUMBERS (the green BAR keeps',
        '     its black ink on both plates — it is a face, not a letterform) */',
        '  --mar-bill-acid:#0B0D0B;',
        '  --mar-ink-secondary:rgba(11,13,11,.72);',
        '  --mar-ink-tertiary:rgba(11,13,11,.45);',
        '  --mar-line-faint:#E3E5DC;',
        '  --mar-line-strong:#C7CABF;',
        '  --mar-wash-faint:rgba(11,13,11,.04);',
        '  --mar-wash:rgba(11,13,11,.07);',
        '  --mar-wash-strong:rgba(11,13,11,.12);',
        '  --mar-scrim:rgba(11,13,11,.55);',
        '}',

        '/* ---- squareness: every corner, not a hand-picked list -------------',
        '   This used to be a short list (button / input / textarea / card /',
        '   panel) and everything else kept DSH\'s own radii. Measured on the live',
        '   page that left the session + project rows at 8px, the 工作区 section',
        '   header at 12px, the 预览版 badge at 24px, the 识图 button at 8px and',
        '   the search affordance as a full circle. The brief is "all right',
        '   angles", so this is one blanket rule rather than a list that will',
        '   always be one component behind.',
        '   The boot overlay is the single exception: #dshMarBootHost is appended',
        '   to <body>, so a universal selector reaches inside it, and its status',
        '   lamp is a 6px disc drawn with border-radius:50% (src/boot/boot.css)',
        '   that would come out as a square. The rule right after re-rounds it —',
        '   an id + class selector outranks `body.theme-marathon *` at equal',
        '   !important, so it wins on specificity and does not depend on which',
        '   stylesheet order the host happens to inject. */',
        'body.theme-marathon *,',
        'body.theme-marathon *::before,',
        'body.theme-marathon *::after{border-radius:0!important;}',
        'body.theme-marathon #dshMarBootHost .mb-status-dot{border-radius:50%!important;}',
        'body.theme-marathon ::selection{background:var(--mar-accent);color:#000;}',
        // (no ::-webkit-scrollbar rules — the theme leaves the scrollbar at DSH's
        //  default; see the note in the token map above.)

        '/* ---- brand lockup (top-left only) ----------------------------------',
        '   DSH draws the deepseek mark, the wordmark and the HARNESS badge as two',
        '   SVGs with fill:currentColor inside the sidebar brand button. That one',
        '   lockup stays on the accent so the identity reads green while the rest',
        '   of the UI is neutral text — but only where green is legible: on the',
        '   light plate the lockup takes the ink (--mar-accent-text), because',
        '   #C0FE04 on white is 1.2:1, i.e. a smudge. Selectors use the readable',
        '   half of DSH CSS module names (hHd-Xa_brandMark / _brandName /',
        '   _brandIdentity) so a DSH rebuild that changes only the hash prefix',
        '   keeps matching. */',
        'body.theme-marathon [class*="_brandIdentity"],',
        'body.theme-marathon [class*="_brandMark"],',
        'body.theme-marathon [class*="_brandName"]{color:var(--mar-accent-text);}',
        '/* the HARNESS badge inside the wordmark SVG is the one shape that must NOT',
        '   follow that ink. It is a single <rect fill="currentColor"> (x=129.348',
        '   w=52 h=14 rx=2 — the only rect in that SVG) and its letters are paths',
        '   filled with var(--dsw-alias-label-primary-inverted), i.e. --mar-solid-ink',
        '   #0B0D0B in BOTH modes. So painting the lockup with the ink makes pill',
        '   and letters the same colour and the badge reads as a blank black bar',
        '   (caught live: the light-mode lockup came out as a solid #0B0D0B chip).',
        '   The pill stays on the accent, which is how it looked before: on the',
        '   light plate the badge is a green FACE carrying black letters, exactly',
        '   as in the dark mode. Scoped to .mar-bg-light — the dark mode keeps',
        '   currentColor, and the rect is unique, so nothing else can catch. */',
        'body.theme-marathon.mar-bg-light [class*="_brandName"] svg rect{fill:var(--mar-accent);}',

        '/* ---- left rail: the two states that light up -----------------------',
        '   The static state is deliberately untouched. DSH paints 新会话 and the',
        '   session rows with its own neutral surface and that is exactly what the',
        '   previous round shipped, so the theme declares no fill for a control at',
        '   rest — no wall of acid green down the sidebar.',
        '   Only two moments change a colour:',
        '     1. sidebar 新会话 button   on :hover        -> accent fill',
        '     2. sidebar session row     on [_selected]   -> accent fill',
        '   Session rows have NO accent hover rule on purpose. The rail is a list',
        '   you scan, not a set of buttons; lighting every row the pointer crosses',
        '   turned the sidebar into a strobe, and it drowned out the one row that',
        '   actually matters — the selected session. Selection is the only state',
        '   in that region that changes anything.',
        '   "Anything" includes DSH\'s own hover wash: --dsw-alias-interactive-bg-',
        '   hover already tints a hovered row by 8% white, which is visible exactly',
        '   because that column is otherwise still. It is muted below. The :not()',
        '   matters — without it this rule has the same specificity as the',
        '   [_selected] fill and would blank out the current session whenever the',
        '   pointer happened to rest on it.',
        '   An accent fill carries --mar-accent-ink (#0B0D0B) as its text: light',
        '   grey on #C0FE04 is unreadable. DSH re-lights hover/selected rows from',
        '   its own background tokens, hence !important on every declaration.',
        '   The send button keeps DSH\'s fill and only has its arrow inked. */',
        'body.theme-marathon [class*="_sessionRow"]:hover:not([class*="_selected"]){',
        '  background:transparent!important;',
        '  background-image:none!important;',
        '}',
        'body.theme-marathon [class*="_newSession"]:hover,',
        'body.theme-marathon [class*="_newSession"][class*="_active"],',
        'body.theme-marathon [class*="_sessionRow"][class*="_selected"]{',
        '  background:var(--mar-accent)!important;',
        '  background-image:none!important;',
        '  border-color:var(--mar-accent)!important;',
        '  color:var(--mar-accent-ink)!important;',
        '}',
        '/* icons are fill:currentColor, and the "1天" age label sets its own',
        '   colour — both have to be forced onto the ink or they stay light grey */',
        'body.theme-marathon [class*="_newSession"]:hover,',
        'body.theme-marathon [class*="_newSession"][class*="_active"],',
        'body.theme-marathon [class*="_sessionRow"][class*="_selected"]{',
        '  color:var(--mar-accent-ink)!important;',
        '  fill:var(--mar-accent-ink)!important;',
        '}',
        '/* #4 (2026-11-04): the selected row lights up, but its SECONDARY content',
        '   kept its own dark-mode preferences — the age label (`_time` paints',
        '   --dsw-alias-label-tertiary), the "…" menu wrapper and the icon strokes —',
        '   so after a selection the row read as half-themed (issue #4).',
        '   The row itself is a FACE (accent green), so everything inside it has to',
        '   take the ink of a face. Three constraints:',
        '     · ONLY `color` is forced, never `fill`. The icons are line icons',
        '       (`fill:none; stroke:currentColor`), and painting their `fill` would',
        '       flood every glyph into a solid ink block — that is why the rule',
        '       above (which pins fill on the ROW for the `_newSession` button) is',
        '       not repeated here;',
        '     · the descendants must lose their own surfaces: the menu trigger is',
        '       a span carrying `background-color:var(--dsw-alias-button-elevated-',
        '       fill)`, and any nested chip would otherwise leave a dark rectangle',
        '       on the green face;',
        '     · the Menu wrapper needs its own rule: the background sits on the',
        '       span wrapper, and the wrapper is not the button (the first rule',
        '       would also reach it inside a selected row, but the menu opens in',
        '       a floating layer outside the row, so it needs the unconditional',
        '       form). */',
        'body.theme-marathon [class*="_sessionRow"][class*="_selected"] *{',
        '  color:var(--mar-accent-ink)!important;',
        '  background-color:transparent!important;',
        '  background-image:none!important;',
        '  box-shadow:none!important;',
        '}',
        'body.theme-marathon [class*="_rowActions"] span[class*="_root_"]{',
        '  background-color:transparent!important;',
        '  background-image:none!important;',
        '  box-shadow:none!important;',
        '}',
        '/* send button: THE THEME ACCENT. Disabled state is intentionally included',
        '   (`:not(:disabled)` was removed) — DSH paints the button blue by default',
        '   whether enabled or not, but more importantly: the button starts DISABLED',
        '   and only flips to enabled once the composer textarea has content. The',
        '   `:not(:disabled)` guard meant our override only kicked in *after* the user',
        '   typed, so the resting state (and the state most users see first) was DSH\'s',
        '   blue. The "发送按钮的颜色没有改变" complaint was exactly this. background-',
        '   image is cleared because DSH\'s primary fill can carry a gradient that',
        '   background-color alone would not cover. */',
        'body.theme-marathon button[class*="_primary"]{',
        '  background-color:var(--mar-accent)!important;',
        '  background-image:none!important;',
        '  border-color:var(--mar-accent)!important;',
        '  color:var(--mar-accent-ink)!important;',
        '}',
        'body.theme-marathon button[class*="_primary"] svg,',
        'body.theme-marathon button[class*="_primary"] svg *{fill:var(--mar-accent-ink)!important;}',

        '/* ---- injected sidebar entries in the collapsed rail -----------------',
        '   Plugins cannot register a sidebar slot, so they inject their own row',
        '   (data-dsh-part="sidebar-entry") between 新会话 and the workspace',
        '   browser — task-board does, ssh does. That row is a full-width,',
        '   left-aligned icon + label, which is right at 280px. The collapsed',
        '   rail is a different layout: a 56px column of 36x36 cells whose icons',
        '   all sit on the rail centre (x=28), and the injected row is not part',
        '   of the shell stylesheet that does that. Measured after 收起侧边栏:',
        '   shell rows at x=10 w=36 (icon centre 28); the injected row stayed at',
        '   x=10 w=35 with padding 0 10px, so its icon landed on x=32 — 4px to',
        '   the right of every other icon — and without the 12px gap under it the',
        '   rail rhythm was off too (48/36/48 instead of an even 48).',
        '   The injecting plugin ships a rule for exactly this, but it is keyed',
        '   on [data-dsh-frame][data-sidebar-collapsed] and this DSH build puts',
        '   the flag on div[class*="_frame"][data-sidebar-collapsed] with no',
        '   data-dsh-frame in the document at all — so it never fires.',
        '   Matching data-dsh-part (a semantic attribute the plugins set',
        '   themselves) instead of a hash class covers every family plugin and',
        '   survives their rebuilds. */',
        'body.theme-marathon [data-sidebar-collapsed] [data-dsh-part="sidebar-entry"]{',
        '  justify-content:center;',
        '  gap:0;',
        '  width:36px;',
        '  height:36px;',
        '  padding:0;',
        '  margin:0 0 12px;',
        '}',
        '/* the label has no room in the rail — same thing the plugin\'s own dead',
        '   rule wanted: the icon is the first span, the label the last one */',
        'body.theme-marathon [data-sidebar-collapsed] [data-dsh-part="sidebar-entry"] > span + span{',
        '  display:none;',
        '}',

        '/* ---- decorative overlays: ALL REMOVED (2026-09-18) ---------------',
        '   Four layers used to sit on top of DSH, all of them full-viewport and',
        '   all of them pure texture for its own sake:',
        '     .mar-grid       28px 1px hairline grid',
        '     .mar-scanlines  1px/3px repeating gradient, multiply, 70% opacity',
        '     .mar-crt        a 120px white band sweeping down every 7s + flicker',
        '     .mar-sweep      a 220px white band crossing the screen every 9s',
        '   The two static ones darkened every surface and drew hairlines across',
        '   text; the two animated ones added a moving highlight over an interface',
        '   that is read, not watched. Gone: rules, keyframes, DOM nodes, the',
        '   .mar-layer base rule and the --mar-int intensity variable they were all',
        '   scaled by. Nothing renders above DSH chrome any more.',
        '   Do NOT reintroduce a full-screen overlay here without a reason; the',
        '   only remaining animation is the one-shot boot sequence (see below). */',

        '/* ---- FUI plates / RGB split on headings: REMOVED ----------------',
        '   The plate layer — four corner brackets, the top-left call-sign strip,',
        '   the top-right clock and the bottom status bar — sat *over* DSH chrome:',
        '   the call-sign covered the deepseek logo + wordmark and the status bar',
        '   covered the sidebar 设置 row. All of it is gone; the logo and wordmark',
        '   are what identifies this build.',
        '   The red/green text-shadow on h1/h2 went with it — the brief is a',
        '   neutral surface with a single accent, not a red/green ghost edge on',
        '   every heading. */',

        '/* ---- per-component FUI touches (safe, additive only) ---- */',
        'body.theme-marathon [class*="sidebar"]{border-right:1px solid var(--mar-line-strong);}',
        'body.theme-marathon [class*="message"]{border:1px solid var(--mar-line-faint)!important;border-radius:0!important;}',
        'body.theme-marathon input:focus,',
        'body.theme-marathon textarea:focus{outline:1px solid var(--mar-accent);}',

        '/* ---- settings panel: mosaic reveal ------------------------------------',
        '   Opening 设置 cuts the panel into a 5x5 grid of squares. The panel is',
        '   800x800 (measured), so 20% x 20% tiles come out 160px square; keeping',
        '   the geometry in percentages means a future panel resize keeps the',
        '   tiling proportional instead of drifting off the edge.',
        '   Each tile is filled with the surface colour and then switched off —',
        '   first a few together, then one every MOSAIC_STEP seconds in a fixed',
        '   pseudo-random order — so the panel reads as if it is being wiped off',
        '   square by square.',
        '   A tile does NOT animate. It is opaque, and on the frame its delay',
        '   expires it is simply gone: duration is 0, so the delay is the whole',
        '   animation. An earlier build scaled each tile down (1 -> .7) as it',
        '   left, which turned one sweep into 25 separate little shrinks — every',
        '   square visibly moving on its own. Nothing may animate here but the',
        '   delay.',
        '   The content underneath is NOT part of the transition either: it is',
        '   simply there once the tiles have cleared. A content fade used to sit',
        '   on top of this and made the whole dialog look like it was fading in.',
        '   The whole reveal is on a 0.5s budget (see the MOSAIC_* constants in',
        '   the JS half): 22 steps x 0.0155s = 0.341s of delay, and a tile costs',
        '   no time on top of that — change the step and redo the arithmetic.',
        '   25 tiles in a third of a second is a flicker, not a wave; that is the',
        '   point, it must not delay the panel.',
        '   Geometry is CSS; only order + delay are JS (see mountSettingsMosaic). */',
        'body.theme-marathon .mar-mosaic{',
        '  position:absolute;inset:0;z-index:40;pointer-events:none;overflow:hidden;',
        '}',
        '/* duration:0s — the animation carries nothing but the delay, so the tile',
        '   flips from opaque to gone on the exact frame the delay lands. `both`',
        '   keeps the from-value during the delay, which is why the tile is solid',
        '   until its turn. Do not give this a duration or a transform. */',
        'body.theme-marathon .mar-mosaic i{',
        '  position:absolute;display:block;background:var(--mar-mosaic-fill);',
        '  animation:mar-tile-out 0s linear both;',
        '}',
        '@keyframes mar-tile-out{',
        '  from{opacity:1;}',
        '  to{opacity:0;}',
        '}',
        '/* No content fade. The columns are deliberately left untouched: a fade',
        '   (opacity .15 -> 1) running across them read as the dialog itself',
        '   fading in behind the tiles, and it left the text legible only at the',
        '   very end. Do not re-add it. */',
        '@media (prefers-reduced-motion: reduce){',
        '  body.theme-marathon .mar-mosaic{display:none!important;}',
        '}',

        '/* ---- task board: ONE intro per column --------------------------------',
        '   @linxin666/dsh-client-ui-task-board paints five columns into the centre',
        '   column and has no entrance animation of its own. This one plays over',
        '   EACH of the five 选项卡 (待规划 / 待办 / 进行中 / 已完成 / 已失败) at the',
        '   same time, in four beats, then takes itself off. The choreography is',
        '   the user\'s own reference file, ported from the card onto the column:',
        '     1. the tab is an opaque slab with four reticles on it; every reticle',
        '        flashes for .1s and then holds steady',
        '     2. a 2px accent frame arrives on the tab edge',
        '     3. the slab is a 2x2 grid of four rectangles; they leave one at a',
        '        time in the order 1-2-4-3 — top-left, top-right, bottom-right,',
        '        bottom-left, i.e. clockwise — each taking its reticle with it',
        '     4. the frame leaves on the same frame as the fourth rectangle',
        '   The unit is the COLUMN (the five 选项卡). Not the board (one reticle',
        '   over all five is not what the brief asks for) and not the card (the',
        '   rectangles belong to the tab, not to the task). Four reticles + one',
        '   frame + four rectangles per tab, and all five tabs run on one clock.',
        '   Measured column box: 243x821, background #272733.',
        '   THE RECTANGLES MUST BE --mar-bg-void (the settings mosaic colour):',
        '   dark slabs over a grey column. The first cut filled them with',
        '   --mar-bg-panel, i.e. the COLUMN\'S OWN colour, on the theory that they',
        '   should read as an empty column. On an empty board that renders as',
        '   nothing at all: the four rectangles are laid out perfectly and the',
        '   screen does not change, so the 1-2-4-3 order is unreadable. Grey on',
        '   grey is not a subtle reveal, it is an absent one. Do not go back.',
        '   The rectangles are the settings mosaic trick, not a new one: opaque,',
        '   duration 0, so nothing about a rectangle animates — the delay is the',
        '   whole animation and on its frame the rectangle is simply gone. They',
        '   reuse @keyframes mar-tile-out (1 -> 0, the slab leaves), the same one',
        '   the mosaic uses. `both` holds the from-value across the delay, so a',
        '   rectangle is genuinely there until its frame and then simply is not —',
        '   it never fades, slides or scales.',
        '   Paint order inside one tab is DOM order: the four rectangles, then the',
        '   frame. The rectangles are opaque, so anything appended before them',
        '   would be hidden for the whole run. A reticle is a CHILD of its own',
        '   rectangle, and that is what ties the beats together: it is on screen',
        '   for as long as its quadrant is covered, and it goes the moment the',
        '   quadrant comes back.',
        '   Geometry is CSS (below); timing and order are JS (mountBoardIntro).',
        '   The whole sequence is on a 2s budget: the frame arrives 1.20 -> 1.36s,',
        '   the rectangles leave at 1.50 / 1.58 / 1.66 / 1.74s, and the frame',
        '   leaves on the same frame as the last one (1.74 -> 1.90s). Changing any',
        '   number means redoing that arithmetic; the .16s in the frame\'s two',
        '   animation shorthands is the other half of it. check.cjs holds the',
        '   relations: the frame is fully in before the first rectangle returns',
        '   (FRAME_AT + .16 <= BLOCK_AT), BLOCK_AT + 3*STEP == LAST_AT,',
        '   LAST_AT + .16 == SPAN, SPAN <= 2.',
        '   Everything is found by semantic attribute — the board node is',
        '   [data-dsh-taskboard-board], the columns [data-dsh-part="column"] —',
        '   never by a CSS-module hash. */',
        'body.theme-marathon [data-dsh-taskboard-board]{position:relative;}',
        'body.theme-marathon .mar-board-intro{',
        '  position:absolute;inset:0;z-index:40;pointer-events:none;overflow:hidden;',
        '  /* the reticle is sized off the SHORTER side of a quadrant (its width, on a',
        '     tall column) — that is what keeps it square and proportional. */',
        '  --mar-cross-size:50%;',
        '  --mar-cross-bar:1.5px;',
        '  --mar-cross-dot:7px;',
        '}',
        '/* one of these per column, pinned to that column\'s box by the JS. The grid',
        '   is the whole trick: four equal cells, so the four rectangles ARE the four',
        '   quadrants of the tab and the four reticles land on the quadrant centres',
        '   without anyone computing a percentage. */',
        'body.theme-marathon .mar-col-intro{',
        '  position:absolute;display:grid;',
        '  grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;',
        '}',
        '/* one quadrant: an opaque slab that hides the tab, with a reticle centred in',
        '   it. mar-tile-out (1 -> 0), duration 0, per-rectangle delay — at its frame',
        '   the slab is simply gone. The reticle goes with it: it is a child. */',
        'body.theme-marathon .mar-col-intro .mar-col-mask{',
        '  position:relative;overflow:hidden;display:grid;place-items:center;',
        '  background:var(--mar-mosaic-fill);',
        '  animation:mar-tile-out 0s linear both;',
        '}',
        '/* the reticle: a 1.5px cross with a 7px diamond on it, drawn from three <i>',
        '   children rather than pseudo-elements — a diamond is a rotated square, and',
        '   the theme squares every ::before/::after. The glow is the accent at 45%,',
        '   derived from the token instead of declared, so no new colour is added. */',
        'body.theme-marathon .mar-col-intro .mar-cross{',
        '  position:relative;width:var(--mar-cross-size);aspect-ratio:1;display:block;',
        '  animation:mar-cross-flash .1s linear;',
        '}',
        'body.theme-marathon .mar-col-intro .mar-cross i{',
        '  position:absolute;display:block;background:var(--mar-accent);',
        '  box-shadow:0 0 6px color-mix(in srgb,var(--mar-accent) 45%,transparent);',
        '}',
        'body.theme-marathon .mar-col-intro .mar-cross .mar-h{',
        '  left:0;right:0;top:50%;height:var(--mar-cross-bar);transform:translateY(-50%);',
        '}',
        'body.theme-marathon .mar-col-intro .mar-cross .mar-v{',
        '  top:0;bottom:0;left:50%;width:var(--mar-cross-bar);transform:translateX(-50%);',
        '}',
        'body.theme-marathon .mar-col-intro .mar-cross .mar-dot{',
        '  left:50%;top:50%;width:var(--mar-cross-dot);height:var(--mar-cross-dot);',
        '  transform:translate(-50%,-50%) rotate(45deg);',
        '}',
        '/* the frame arrives once the reticles have settled (BOARD_FRAME_AT) and',
        '   leaves on the frame the fourth rectangle does (BOARD_LAST_AT). Two fades',
        '   rather than one: the second carries no backwards fill, so before its delay',
        '   it contributes nothing and the first keeps the frame solid. It is appended',
        '   last, so it paints over the opaque slabs. */',
        'body.theme-marathon .mar-col-intro .mar-col-frame{',
        '  position:absolute;inset:0;display:block;box-sizing:border-box;',
        '  border:2px solid var(--mar-accent);',
        '  animation:mar-fade-in .16s linear var(--mar-frame-at,5s) both,',
        '            mar-fade-out .16s linear var(--mar-frame-out-at,5s) forwards;',
        '}',
        '@keyframes mar-cross-flash{',
        '  0%{opacity:0}14%{opacity:1}28%{opacity:0}42%{opacity:1}',
        '  56%{opacity:0}72%{opacity:1}86%{opacity:.15}100%{opacity:1}}',
        '@keyframes mar-fade-in{from{opacity:0;}to{opacity:1;}}',
        '@keyframes mar-fade-out{from{opacity:1;}to{opacity:0;}}',
        '@media (prefers-reduced-motion: reduce){',
        '  body.theme-marathon .mar-board-intro{display:none!important;}',
        '}',

        '/* ---- motion control ---- */',
        '/* Nothing to switch: the theme sheet now declares no animation at all',
        '   (the only motion left is the boot overlay, which skips itself under',
        '   prefers-reduced-motion — see src/boot/boot.css / buildBoot below). */',

        '/* ---- background layer: ASCII dot field (background ONLY) ------------- */',
        '/* The canvas paints its own field colour (--mar-bg-field, written by JS from',
        '   the chosen palette); clearRect only wipes the glyph layer, so the field is',
        '   never repainted per frame. z-index:0 + first child of <body> puts it under',
        '   #root without touching any stacking context DSH owns. */',
        '#mar-ascii-bg{position:fixed;inset:0;width:100%;height:100%;display:block;',
        '  z-index:0;pointer-events:none;background:var(--mar-bg-field,#0B0D0B);}',
        '/* Visibility: the full-viewport containers step aside — the frame, the two',
        '   columns, and whichever node inside each column paints an opaque plate',
        '   (JS decides that by asking for a background, not by class name: the',
        '   sidebar root loses `_quietBars` as soon as a conversation is open, and a',
        '   name-only match left the whole column opaque — the field simply gone).',
        '   Rows, buttons and cards sit deeper and keep their own surface colour.',
        '   A modal is NOT part of the page and is never marked, even though DSH',
        '   renders the settings dialog inside the sidebar subtree: marking it made',
        '   the dialog see-through the moment its opening mosaic finished. JS prunes',
        '   the walk at the modal boundary (bgModal), so this mark only ever lands on',
        '   the page layout.',
        '   An out-of-flow LAYER is not part of the page either, and the walk does not',
        '   enter one (bgLayer). DSH plugins mount their views as absolutely',
        '   positioned panels — @linxin666/dsh-client-ui-task-board appends',
        '   `[data-dsh-taskboard-view]{position:absolute;inset:0;z-index:60}` to the',
        '   centre column and hides the conversation behind it — so marking it (and',
        '   the board root plus its five 243x821 columns underneath) turned the whole',
        '   board see-through the moment its own intro wiped off. Chrome is always in',
        '   flow; a floating panel is content.',
        '   background-image goes too, not just the colour: the composer seat hides',
        '   the field with a `linear-gradient(transparent, page-colour)` dissolve,',
        '   which no amount of `background-color:transparent` can touch. That was the',
        '   "the field does not cover the message area at the bottom" report — a dead',
        '   black band across the lower ~110px of every session. */',
        'body.theme-marathon.mar-bg-on .mar-bg-clear{background-color:transparent!important;',
        '  background-image:none!important;}',
        '/* #3 (2026-11-04): the composer SEAT stays see-through — that is what makes',
        '   its dissolve band work — but nothing INSIDE it may. DSH renders both the',
        '   input card and the ask_user_question card inside [data-composer-seat];',
        '   the ask card is 320x240, so it cleared the 200x200 plate floor and the',
        '   background walker marked it `.mar-bg-clear`: the question card turned',
        '   transparent and floated its text on the dot field (issue #3).',
        '   The walker now refuses to descend into the seat (see bgPaintWalker), and',
        '   bgUnmarkComposer sweeps stray marks off on every pass; this rule is the',
        '   last line of defence for a mark applied by an older revision. It repaints',
        '   the card with the seat\'s own surface token, so the card is opaque again',
        '   without touching the seat\'s dissolve band. */',
        'body.theme-marathon.mar-bg-on [data-composer-seat] [class*="_card"]{',
        '  background:var(--dsw-specific-input-major)!important;',
        '  background-image:none!important;}',
        '/* The rail keeps its OWN opaque plate now ("侧边栏不要透明"), and that plate',
        '   must be painted from the THEME palette, not from DSH\'s.',
        '   --dsw-specific-sidebar-fill IS overridden to var(--mar-bg-void), but a',
        '   token override is written wherever ui-layout applies its inline alias',
        '   tokens, and a var() inside it resolves at THAT element — not at the rail.',
        '   So the rail never saw the theme\'s value and fell back to DSH\'s own',
        '   surface, which under 跟随系统 is the light one: "点击切换主题颜色，左边',
        '   的侧边栏...保持白色". Painting the column directly resolves --mar-bg-void at',
        '   the rail itself, where body.theme-marathon is an ancestor and the light',
        '   layer (body.mar-bg-light) is in scope, so the plate follows the pair. */',
        'body.theme-marathon [class*="_sidebarCol"],',
        'body.theme-marathon [class*="_sidebarCol"] [class*="_root"]{background:var(--mar-bg-void)!important;',
        '  background-image:none!important;}',
        '/* The INNER plate matters as much as the column: while the rail was being',
        '   cleared to transparent the column\'s own fill never showed, and taking the',
        '   rail out of the clear-passes exposed the element underneath it. Measured on',
        '   the Desktop with the pair on 主黑: the column painted rgb(11,13,11) and the',
        '   _root inside it still painted DSH\'s rgb(249,250,251) — the white rail in',
        '   "切换主题颜色，左边的侧边栏...保持白色". Both are painted from the theme',
        '   palette now, so the rail no longer depends on DSH\'s resolved scheme. */',
        '/* DSH paints a 24px-tall gradient on a child node just above the avatar',
        '   (`_9lNZKa_fade` here — the hash is build-specific, the readable suffix is',
        '   `_fade`). End colour rgb(27,27,28) → fades from transparent to that',
        '   shadow. In the unthemed client the rail paints that same rgb(27,27,28)',
        '   underneath it, so the band is invisible. Our rail paints #0B0D0B',
        '   (--mar-bg-void), ten shades darker than the fade\'s end, so the gradient',
        '   shows as a distinct lighter bar above the avatar — measured 2026-10-02',
        '   (probe-sidebar). Scoped to the rail so no other `_fade` element is hit. */',
        'body.theme-marathon [class*="_sidebarCol"] [class*="_fade"]{background-image:none!important;}',
        '/* settings pane: covers the native content column (nav column is 188px).',
        '   The pane still reads as the host\'s own page (ink + font inheriting, same',
        '   surface), but it now PAINTS that surface itself:',
        '   background is --dsw-alias-bg-layer-2, the very token AnXs9G_panel uses',
        '   (overridden by the theme to --mar-bg-panel), so it is pixel-identical to',
        '   the panel behind it — except that the native page can no longer show',
        '   through if the hide rule ever misses its target again (2026-11-04: DSH',
        '   0.2.2 renamed the column from `_content` to `_options` and the old',
        '   selector silently matched nothing — the previous tab stayed painted',
        '   under this transparent pane). Only the green segment selected state is',
        '   ours. */',
        '.mar-set-pane{position:absolute;left:188px;top:0;right:0;bottom:0;z-index:3;',
        '  box-sizing:border-box;padding:26px 24px;overflow:auto;',
        '  background:var(--dsw-alias-bg-layer-2, var(--mar-bg-panel));color:inherit;',
        '  font-size:13px;line-height:1.6;}',
        '/* #1 (2026-11-04): 主题设置 has no close button of its own because it is not',
        '   a host page — the host\'s close button lives in the dialog header cell',
        '   (`_header > button._close`, 28x28, top-right of the panel grid), and the',
        '   pane above is absolutely positioned from left:188px/top:0 with z-index:3,',
        '   so it paints straight OVER that header cell. The button is still in the',
        '   DOM and still clickable, it is simply covered — hence "设置里没有关闭按钮"',
        '   once the theme tab is open, while every native tab keeps one (issue #1).',
        '   `.mar-set-closebar` is a zero-height STICKY row at the top of the pane,',
        '   so the button (a) lives inside the pane, (b) sits in its top-right',
        '   corner exactly where the native one sits, (c) is never clipped by the',
        '   pane and (d) does not scroll away with the settings list — the pane is',
        '   the scroller, and an absolutely positioned child would leave with the',
        '   content. It is out of the flow (height:0), so the title keeps its',
        '   position and nothing is pushed down. Square, transparent until hover,',
        '   ink-secondary → ink-primary — the theme\'s own control language. */',
        '.mar-set-closebar{position:sticky;top:0;z-index:4;height:0;display:flex;',
        '  justify-content:flex-end;pointer-events:none;}',
        '.mar-set-close{display:none;align-items:center;justify-content:center;',
        '  width:28px;height:28px;padding:0;margin:2px 0 0 auto;border-radius:0;',
        '  font:inherit;font-size:18px;line-height:1;cursor:pointer;',
        '  color:var(--mar-ink-secondary);background:transparent;border:1px solid transparent;',
        '  pointer-events:auto;}',
        '.mar-tab-on .mar-set-close{display:inline-flex;}',
        '.mar-set-close:hover{color:var(--mar-ink-primary);border-color:var(--mar-line-strong);}',
        '.mar-set-close:focus-visible{outline:1px solid var(--mar-accent);outline-offset:2px;}',
        '/* ---- 更新提示（2026-11-05）：主题设置 nav 上的小圆点 + 面板顶部横幅 ----',
        '   小点颜色跟主题色（--mar-accent）。横幅只在“发现新版本”时出现；',
        '   「检查更新」手动重查、「不再提示」记住这个版本并在有更新版本前不再打扰。 */',
        '[data-mar-nav]{position:relative;}',
        '[data-mar-nav].mar-has-update::after{content:"";position:absolute;top:9px;right:10px;',
        '  width:6px;height:6px;border-radius:50%;background:var(--mar-accent);',
        '  box-shadow:0 0 0 2px var(--mar-bg-void);}',
        // 主题的“所有元素/伪元素一律直角”总规则带 !important，会把这个点压成方块；
        // 这里用更高特异性把它抢回圆形。选中状态（整格是主题色面）时圆点改用
        // accent-ink 才看得见 —— 仍然是主题色系，不是写死的颜色。
        'body.theme-marathon [data-mar-nav].mar-has-update::after{border-radius:50%!important;}',
        '[data-mar-nav].mar-nav-on.mar-has-update::after{background:var(--mar-accent-ink);',
        '  box-shadow:0 0 0 2px var(--mar-accent);}',
        '.mar-update{display:flex;align-items:center;gap:10px;flex-wrap:wrap;',
        '  margin:0 0 20px;padding:9px 12px;border:1px solid var(--mar-line-strong);',
        '  background:var(--mar-bg-panel);}',
        '.mar-update[hidden]{display:none;}',
        '.mar-update-tag{flex:0 0 auto;padding:2px 6px;font-size:11px;font-weight:700;',
        '  background:var(--mar-accent);color:var(--mar-accent-ink);}',
        '.mar-update-text{flex:1;min-width:120px;font-size:12px;opacity:.8;}',
        '.mar-update-actions{display:flex;gap:8px;}',
        '.mar-update button{font:inherit;font-size:11px;padding:3px 8px;cursor:pointer;',
        '  color:var(--mar-ink-primary);background:transparent;border:1px solid var(--mar-line-strong);}',
        '.mar-update button:hover{border-color:var(--mar-ink-primary);}',
        '.mar-update button:focus-visible{outline:1px solid var(--mar-accent);outline-offset:2px;}',
        '.mar-set-pane h4{margin:0 0 4px;font-size:17px;font-weight:700;letter-spacing:.04em;}',
        '.mar-set-pane .mar-set-sub{margin:0 0 24px;font-size:11px;opacity:.55;}',
        '.mar-set-group{margin:0 0 24px;}',
        '.mar-set-group:last-child{margin-bottom:0;}',
        '.mar-set-head{display:flex;align-items:center;gap:8px;margin:0 0 12px;',
        '  font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;}',
        '.mar-set-head::before{content:"";flex:0 0 auto;width:9px;height:9px;',
        '  background:var(--mar-accent);}',
        '.mar-set-head::after{content:"";flex:1;height:1px;background:var(--mar-line-faint);}',
        '.mar-set-row .mar-seg{margin:0;flex:1;}',
        '.mar-seg{display:flex;gap:8px;margin:0 0 22px;}',
        '.mar-seg button{font:inherit;color:inherit;background:transparent;',
        '  border:1px solid var(--mar-line-strong);padding:8px 10px;cursor:pointer;',
        '  display:flex;align-items:center;gap:8px;}',
        '.mar-seg button[aria-checked="true"]{color:var(--mar-accent-ink);',
        '  background:var(--mar-accent);border-color:var(--mar-accent);}',
        '.mar-seg button:focus-visible{outline:1px solid var(--mar-accent);outline-offset:2px;}',
        '/* --- 主题色：色块（2026-10-11 起；标题 2026-10-17 从「配色」改名）-----',
        '   点一下就把 UI 强调色（--mar-accent 系列）换成它。每一格画的是图形',
        '   （366x237，data-accent → 哪张图由构建脚本的 FACTIONS 决定）：六个阵营',
        '   + 默认色的马拉松 LOGO。背景色 --sw 是图形的兜底。',
        '   **一行 4 个**（用户 2026-10-17："放大一些，差不多一列 4 个即可"）：',
        '   flex-basis 定死 1/4 宽而不是 flex-grow，所以 7 格排成 4 + 3，后一排左对齐。',
        '   刻意**不**用 .mar-set-row——那一行在关闭背景动画时会被 dim（见下面那条），',
        '   而主题色与点阵无关（用户："配色只调整 UI 的，不动其他"）。 */',
        '.mar-sw{display:flex;gap:8px;flex-wrap:wrap;}',
        '.mar-sw button{display:block;flex:0 0 calc((100% - 24px) / 4);min-width:0;',
        '  aspect-ratio:366/237;',
        '  padding:0;margin:0;cursor:pointer;border:1px solid var(--mar-line-strong);',
        '  background-color:var(--sw);background-image:var(--sw-img,none);',
        '  background-size:100% 100%;background-repeat:no-repeat;}',
        '.mar-sw button:hover{border-color:var(--mar-ink-primary);}',
        '.mar-sw button[aria-checked="true"]{border-color:var(--mar-ink-primary);',
        '  box-shadow:inset 0 0 0 2px var(--mar-bg-void);}',
        '.mar-sw button:focus-visible{outline:1px solid var(--mar-accent);outline-offset:2px;}',
        '/*__FACTION_CSS__*/',
        '/* the field switch — its OWN control, not a third segment. The pair below',
        '   is a radio group that always carries exactly one of its two choices, so',
        '   turning the animation off cannot un-pick a colour pair (and turning a',
        '   pair on cannot start the animation). Squared, like every other control;',
        '   the knob is the accent only while it is on. */',
        '.mar-set-switch{margin:0 0 10px;}',
        '.mar-switch{appearance:none;-webkit-appearance:none;flex:0 0 34px;width:34px;height:18px;',
        '  margin:0;padding:0;position:relative;cursor:pointer;background:transparent;',
        '  border:1px solid var(--mar-line-strong);}',
        '.mar-switch::after{content:"";position:absolute;left:2px;top:2px;width:12px;height:12px;',
        '  background:var(--mar-ink-tertiary);}',
        '.mar-switch:checked{border-color:var(--mar-accent);background:var(--mar-wash-accent);}',
        '.mar-switch:checked::after{left:18px;background:var(--mar-accent);}',
        '.mar-switch:focus-visible{outline:1px solid var(--mar-accent);outline-offset:2px;}',
        '/* density / breathing only describe the field, so they dim while it is off',
        '   (the switch row itself never does; neither do the task-completion rows,',
        '   which have nothing to do with the background field, nor 外观 — its two',
        '   buttons have nothing to do with the field either, and dimming them read as',
        '   "像有一层灰黑色蒙住了" (user 2026-10-17). */',
        '.mar-set-pane.mar-anim-off .mar-set-row:not(.mar-set-switch):not(.mar-set-done):not(.mar-set-appearance){opacity:.45;}',
        '.mar-set-row{display:flex;align-items:center;gap:12px;margin:0 0 10px;}',
        '/* 标签一律不换行：这行只有 8 个汉字（「每轮 Token 结算」），88px 的槽位',
        '   会让它折成两行，读起来像排版事故。112px + nowrap 一次解决。',
        '   开关行的 开/关 也不该被推进那个 58px 的定宽槽（不然它离开关很远 ——',
        '   用户 2026-10-10）。范围条行的值保留定宽右对齐。 */',
        '.mar-set-row label{flex:0 0 112px;white-space:nowrap;}',
        '.mar-set-row input[type=range]{flex:1;accent-color:var(--mar-accent);min-width:0;}',
        '.mar-set-row .mar-val{flex:0 0 58px;text-align:right;font-variant-numeric:tabular-nums;}',
        '.mar-set-switch .mar-val{flex:0 0 auto;text-align:left;}',
        '.mar-set-row input[type=text]{flex:1;min-width:0;font:inherit;color:inherit;',
        '  background:transparent;border:1px solid var(--mar-line-strong);padding:4px 8px;}',
        '.mar-set-row input[type=text]:focus{outline:1px solid var(--mar-accent);outline-offset:0;}',
        '.mar-set-row button{font:inherit;color:inherit;background:transparent;cursor:pointer;',
        '  flex:0 0 auto;padding:4px 10px;border:1px solid var(--mar-line-strong);}',
        '.mar-set-row button:hover{border-color:var(--mar-accent);color:var(--mar-accent-text);}',
        '.mar-set-row button:focus-visible{outline:1px solid var(--mar-accent);outline-offset:2px;}',
        '.mar-set-note{min-height:14px;margin:-4px 0 6px;padding-left:124px;}',
        '.mar-set-note span{font-size:11px;line-height:14px;opacity:.72;}',
        '/* the nav cells — OURS and THE HOST\'S — and the pane switch. Hover AND',
        '   selected are ours, because the host paints its own "active" cell the',
        '   panel colour and that reads as nothing. Both states are green, but in',
        '   two different jobs:',
        '     hover    — the accent as a WASH (low-alpha accent, the --mar-wash-*',
        '                family), so the label stays legible while it lights up',
        '     selected — the accent as a FACE, which by this theme\'s own rule',
        '                takes --mar-accent-ink (#0B0D0B) as its ink. Never',
        '                #DFDEE0 on acid green; and the marker bar goes dark too,',
        '                since a green notch on a green fill is not a notch.',
        '   The hover INK is --mar-accent-text, not --mar-accent: on the dark plate',
        '   those are the same green, but on the light one the wash is a pale green',
        '   plate and acid-green text on it is 1.06:1 — hovering 插件 made the word',
        '   disappear (measured; the user\'s "主绿 + 黑 下看不清"). The wash keeps',
        '   being the accent; only the letterform flips to the ink, which is exactly',
        '   the dark mode\'s logic with the plate swapped black -> white.',
        '   The selected rules come AFTER the hover rule on purpose: they have the',
        '   same specificity, so without that order, hovering an already-selected',
        '   cell would trade the solid fill back for the tint.',
        '',
        '   These rules address EVERY nav cell, not just the one we append. Scoping',
        '   them to [data-mar-nav] (or to `.mar-nav-on`) is what made the first',
        '   attempt look like nothing had changed: the host\'s own 通用设置 / 模型 /',
        '   插件 / Agent 预设 / 插件市场 / Skill Inject / 技能市场 cells got neither',
        '   the tint nor the fill, while our 主题设置 cell — the only one carrying',
        '   those hooks — lit up as designed. */',
        'body.theme-marathon [class*="_navCell"]{cursor:pointer;',
        '  transition:background-color .12s linear,color .12s linear;}',
        '/* While our pane owns the content column, no NATIVE cell may wear the',
        '   accent. The host never learns that we switched, so its own cell still',
        '   carries `_active`/aria-current and would light up next to ours — two',
        '   green cells, only one of them meaningful.',
        '   `color` has to be reset here too, and that is not cosmetic: the fill was',
        '   the only thing standing between --mar-accent-ink (#0B0D0B) and the panel',
        '   colour, so leaving the ink behind gives a transparent cell with near-black',
        '   text — the cell simply disappears. (Caught live: probe-nt5 A4.)',
        '   The hover case needs its OWN rule rather than a `:not(:hover)` exemption',
        '   on this one: the selected selector above scores (0,4,1) and the plain',
        '   hover rule only (0,3,1), so exempting `:hover` here lets the host\'s stale',
        '   `_active` win and the tint comes out as a second solid accent fill.',
        '   (Caught live: probe-nt5 A5.) */',
        'body.theme-marathon .mar-tab-on [class*="_navCell"].mar-nav-muted{',
        '  background-color:transparent!important;box-shadow:none!important;',
        '  color:var(--mar-ink-primary)!important;}',
        'body.theme-marathon .mar-tab-on [class*="_navCell"].mar-nav-muted:hover{',
        '  background-color:var(--mar-wash-accent)!important;color:var(--mar-accent-text)!important;}',
        'body.theme-marathon [class*="_navCell"]:hover{',
        '  background-color:var(--mar-wash-accent)!important;color:var(--mar-accent-text)!important;}',
        'body.theme-marathon [class*="_navCell"]:hover *{color:inherit!important;}',
        '/* Selected: ours by class, the host\'s by the two hooks it actually sets',
        '   (`_active` on the way in, aria-current="true" on the way out) — either',
        '   alone is a single point of failure across a DSH rebuild. */',
        'body.theme-marathon [class*="_navCell"].mar-nav-on,',
        'body.theme-marathon [class*="_navCell"][class*="_active"],',
        'body.theme-marathon [class*="_navCell"][aria-current="true"]{',
        '  background-color:var(--mar-accent)!important;color:var(--mar-accent-ink)!important;',
        '  box-shadow:inset 2px 0 0 0 var(--mar-accent-ink);}',
        'body.theme-marathon [class*="_navCell"].mar-nav-on *,',
        'body.theme-marathon [class*="_navCell"][class*="_active"] *,',
        'body.theme-marathon [class*="_navCell"][aria-current="true"] *{color:inherit!important;}',
        'body.theme-marathon [class*="_navCell"].mar-nav-on:hover,',
        'body.theme-marathon [class*="_navCell"][class*="_active"]:hover,',
        'body.theme-marathon [class*="_navCell"][aria-current="true"]:hover{',
        '  background-color:var(--mar-accent)!important;color:var(--mar-accent-ink)!important;}',
        '/* our tab covers the content column, so hide it while ours is showing.',
        '   2026-11-04 — DSH 0.2.2 renamed that column\'s CSS-module token from',
        '   `_content` to `_options` (SettingsRoot: AnXs9G_options, the direct child',
        '   that carries renderSlot("settings.section")). The old selector matched',
        '   nothing, so the previous tab stayed painted underneath our pane and the',
        '   two pages ghosted into each other. Hide by BOTH known tokens AND by the',
        '   structural marker mountSettingsTab puts on the real column',
        '   (`data-mar-host-content`), which it finds by geometry, not by hash — so',
        '   the next rename cannot bring the ghost back silently. */',
        'body.theme-marathon .mar-tab-on > [class*="_content"],',
        'body.theme-marathon .mar-tab-on > [class*="_options"],',
        'body.theme-marathon .mar-tab-on > [data-mar-host-content]{visibility:hidden!important;}',

        '/* ---- "Deep diving..." turn status: flat ink, no shimmer --------------',
        '   The host paints this line as a gradient clipped to the text between two',
        '   --dsw-static-deepseek-* stops (a blue the theme never overrides) and',
        '   slides it with a 1.8s shimmer. Recolouring it to the accent was the first',
        '   try, but the sweep cannot be kept: background-clip paints the WHOLE line,',
        '   and the clock span is a CHILD of this element, so it sits on top of that',
        '   paint (the child can neither opt out of it nor overpaint it when the',
        '   highlight is bright) — 15s into a run the clock arrived with a bright',
        '   green band across it. Removed on request: no background, no clip, no',
        '   animation — the label is flat --mar-accent-text ink (the accent on the',
        '   dark plate, the primary ink on the light one, where green would be a',
        '   ghost on white) and the clock stays a plain',
        '   count. The 26px row, the font and the clock markup are still the host\'s.',
        '   Do NOT bring a background/gradient/clip back here: any one of the three',
        '   repaints the band over the clock. */',
        'body.theme-marathon [class*="_turnStatus"]{',
        '  background:none;',
        '  background-clip:border-box;',
        '  -webkit-background-clip:border-box;',
        '  animation:none;',
        '  color:var(--mar-status-ink,var(--mar-accent-text));',
        '  -webkit-text-fill-color:currentColor;',
        '}',
        '/* The clock keeps the host\'s own caption colour; it is stripped of any',
        '   background/animation of its own so nothing can sweep across it. */',
        'body.theme-marathon [class*="_turnStatus"] [class*="_turnStatusClock"]{',
        '  background:none;',
        '  animation:none;',
        '  -webkit-text-fill-color:var(--dsw-alias-label-caption);',
        '}',

        '/* ---- running animation（运行动画，2026-11-05）------------------------',
        '   The 运行动画 switch replaces the native "深度求索中，用时 N 秒" line',
        '   with #dshMarRunHost. Two things are keyed on [data-chat-running] — a',
        '   DATA attribute, not a CSS-module hash, so a DSH rebuild cannot',
        '   silently detach it:',
        '     1. the native row is the RUN-STATE signal (it exists exactly while',
        '        the turn is running) and the source of the SR-only title;',
        '     2. its two VISIBLE children are hidden; the role="status" span',
        '        stays, so the live region keeps announcing "深度求索中".',
        '   The strip itself is NOT mounted in that row: the row lives at the end',
        '   of the transcript and floats upward in a short conversation. It is',
        '   inserted into [data-composer-seat] (the sticky input seat), first',
        '   child, so it sits exactly above the input card. */',
        'body.mar-run-on [data-chat-running]{width:100%;gap:0;}',
        'body.mar-run-on [data-chat-running] > span:not([role="status"]){display:none!important;}',
        // The strip lives in `[data-composer-seat]` (the sticky composer seat),
        // immediately above the composer stack — i.e. exactly "输入框的上方",
        // even when the transcript is short and the native running row sits
        // higher up. The width/max-width mirror the queue dock's own geometry
        // (dsh-client-ui-conversation QueueDock.module.css) so the strip lines
        // up with the card, not with the full column.
        'body.mar-run-on #dshMarRunHost{display:block;flex:none;' +
        '  width:calc(100% - var(--dsh-composer-side-clearance,16px) - var(--dsh-composer-side-clearance,16px)' +
        '    - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px));' +
        '  max-width:calc(var(--dsh-composer-card-max-width,952px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px));' +
        '  margin:0 auto var(--dsh-composer-stack-gap,6px);}',
        // 点阵动画（动画1）：贴在输入卡右侧的空白里，绝对定位在 composer seat
        // 内（seat 是 sticky = positioned）。right / top / 尺寸由 JS 按实测空白
        // 算好，这里只管层与命中测试。
        'body.mar-dot-on #dshMarDotHost{position:absolute;display:block;' +
        '  pointer-events:none;z-index:1;}',

        '/* ---- the last native blues: COMPONENT-scoped custom properties --------',
        '   The five aliases above can be pinned through overrideTokens because DSH',
        '   declares them itself. These six cannot: the bundle declares them on the',
        '   consuming element (e.g. `._code_1wejo_8{--dsh-file-type-default-color:',
        '   var(--dsw-static-deepseek-500)}`), and an element\'s OWN custom-property',
        '   declaration beats anything inherited from <body> — so an override has to',
        '   match that element, not the token. Selectors therefore key on the READABLE',
        '   half of the CSS-module class name (`_code_`, `_table`, `_turnLabelActive`,',
        '   `_toast_`, `_colorMessages`): the hash segment changes on every DSH build,',
        '   the readable one does not. Measured against the installed bundle with',
        '   .generated/scan-blue-usage.cjs, and out-specifying the host rule is part',
        '   of the check (.generated/verify-blues.cjs).',
        '   All six are !important because the host rules are not, and being certain',
        '   matters more than being polite here — each one is a single unambiguous',
        '   colour property. */',
        '/* the trajectory turn rail / active label: was blue-500 mixed into the plate */',
        'body.theme-marathon [class*="_table"]{',
        '  --trajectory-turn-accent:color-mix(in srgb,var(--mar-accent) 22%,var(--mar-bg-deep))!important;}',
        'body.theme-marathon [class*="_turnLabelActive"]{color:var(--mar-accent-text)!important;}',
        '/* the toast\'s inline "操作" action: was var(--dsw-static-deepseek-400) directly */',
        'body.theme-marathon [class*="_toast_"] [class*="_action_"]{',
        '  color:var(--mar-accent-text)!important;}',
        '/* the context meter\'s "对话" tint: was var(--dsw-static-blue-450) */',
        'body.theme-marathon [class*="_colorMessages"]{--meter-tint:var(--mar-accent)!important;}',
        '/* file-type chips (attachments): .code/.html/.markdown/.word/.other were',
        '   deepseek-500 / -450 / neutral-bluish-300. Only the blue ones are pinned —',
        '   .excel/.image/... keep their semantic green/violet. */',
        'body.theme-marathon [class*="_code_"],',
        'body.theme-marathon [class*="_html_"],',
        'body.theme-marathon [class*="_markdown_"],',
        'body.theme-marathon [class*="_word_"],',
        'body.theme-marathon [class*="_other_"]{',
        '  --dsh-file-type-default-color:var(--mar-accent-text)!important;}',

        '/* ---- colour-pair switch: the settings mosaic, replayed over the palette --',
        '   Picking 主白 + 绿 or 主黑 + 绿 repaints the whole UI in a single frame:',
        '   every --dsw-* resolves again at once, so there is nothing to see. This',
        '   plays the settings mosaic over that frame instead — the same square tiles,',
        '   the same fixed pseudo-random order, the same 3-tile head, i.e. literally',
        '   MOSAIC_GRID / MOSAIC_HEAD / mosaicOrder(), the constants the panel reveal',
        '   uses. Squares turn one at a time, and a square that has NOT turned yet',
        '   still shows the OLD picture. That last part is the',
        '   requirement, and it is the whole reason this is built on View Transitions:',
        '   they are the only thing that hands us the before and the after picture at',
        '   the same time (::view-transition-old(root) / -new(root)). Both are STATIC',
        '   snapshots — the canvas inside them does not move for the ~0.34s this runs,',
        '   which is the accepted cost. The old one is pinned (no animation, opacity',
        '   1) and the new one is clipped to the squares that have already turned.',
        '   The clip is a clip-path:path() carrying one subpath per tile: a tile that',
        '   has turned is its own rectangle, one that has not collapses to a',
        '   zero-area rectangle. Keeping the COMMAND COUNT identical in every frame is',
        '   what keeps the value animatable, and `animation-timing-function:steps(1,',
        '   end)` on every frame is what makes a tile arrive WHOLE instead of growing',
        '   out of its own top-left corner. The frames are generated at click time',
        '   because they depend on the viewport size (vtGrid / vtBuildFrames below);',
        '   the name here is only the anchor the generated @keyframes has to match.',
        '   The tiles are SQUARES. The panel grid is square only because the panel is',
        '   (800x800 / 5 = 160px); the same 5x5 over a 1574x900 viewport gives 315x180',
        '   slivers, so the side is taken from the SHORT edge (min(vw,vh) / MOSAIC_GRID',
        '   = the panel\'s own 5-across) and the column / row counts follow from it —',
        '   9 x 5 = 45 tiles of 174.9 x 180 on that viewport. Counts are derived, never',
        '   stored, so the tiles stay square at any window size.',
        '   The reveal stays 0.341s long: that is the length the panel mosaic has at',
        '   15.5ms a beat, and the switch was asked to keep the panel\'s total length',
        '   (2026-09-21). With a viewport-derived tile count the beats are necessarily',
        '   shorter instead — 45 tiles -> 8.1ms. The panel mosaic itself is untouched.',
        '   Four other ways were built and measured on this browser; none works, do',
        '   not go back to any of them:',
        '     · N mask layers, each with its own animation-delay — mask-image and',
        '       mask-size are LIST properties, and an animation animates the whole',
        '       property, so all the instances fight over one value: with four layers',
        '       on four different delays, computed mask-size read back identical for',
        '       all of them;',
        '     · mask-composite:intersect, to get "ring ∩ tile grid" out of two',
        '       layers — never computed at all, on a plain div either;',
        '     · clip-path:url(#svg-clip) with one rect per tile — the same shape as the',
        '       path() above and far easier to read, but the URL is resolved once, when',
        '       the snapshot is created: growing those rects afterwards (CSS or',
        '       setAttribute) never moves the clip again;',
        '     · a plain mask-size animation with no list — that one works, but the',
        '       front edge is smooth, so tiles get cut in half mid-beat, and whole',
        '       tiles is the entire point of the effect.',
        '   And one that works but was rejected on look (2026-09-21): a square',
        '   wave-front growing out of the centre — clip-path:inset() driven by ONE',
        '   registered <length> with steps(). It is monotone, so it can only make',
        '   rings; it cannot reproduce the mosaic order.',
        '   The html.mar-vt-on prefix keeps the rules off any other view transition',
        '   that might run on this page; --mar-vt-dur is written from the panel mosaic',
        '   arithmetic right before the transition starts. */',
        ':root.mar-vt-on::view-transition-old(root){animation:none;opacity:1;}',
        '/* The root group carries a UA animation of its own (-ua-view-transition-group-anim-root,',
        '   0.25s). Leaving it on makes the transition\'s length ambiguous — measured',
        '   2026-09-21: the transition finished on the UA clock (0.25s) and tore this',
        '   scoped rule down in the middle of the reveal, at which point the default',
        '   cross-fade took the squares that had not turned yet. Root geometry never',
        '   changes, so dropping it costs nothing and makes the reveal\'s own length',
        '   (vtDuration) the only clock. */',
        ':root.mar-vt-on::view-transition-group(root){animation:none;}',
        ':root.mar-vt-on::view-transition-new(root){animation:mar-vt-mosaic var(--mar-vt-dur) both;}',
        '/* (the mar-vt-on rules above are the live mechanism again — the viewport',
        '   reveal is the clipped view-transition snapshot, which is the only way the',
        '   squares can carry the page content. A DOM layer of flat tiles was tried in',
        '   between and removed: it can only blank the screen with one colour.) */',

        '/* ---- boot sequence ---- */',
        '/* (the boot overlay CSS is not part of the theme sheet anymore — it ships',
        '    inside the injected boot payload, see src/boot/boot.css. The host',
        '    <style data-boot> is created at runtime inside #dshMarBootHost.) */',

        // ---- per-turn token settlement block ------------------------------
        //   一次「任务结算」小纸条：挂— *每一轮已经结— *的轮次尾巴上
        //   （DSH 自己— [data-turn-tail="<turn>"]，见 dsh-client-ui-chat
//   TurnTailNodeView）。它是内容的一部分，跟着转录一起滚动、跟着会话一
//   销毁，所以没有任何跨会话的展开状态需要维护
//
        //   尺寸与形状取自用户模板（token结算.html）：宽 268px、展开后整块 ≈240px 高；
        //   绿条两侧各一个十字、绿条下方展开的信息面板与— *无缝拼接**（绿条下
//   变直角、面板下方给圆角），绿条与灰条之间留 5px 间隙
//   圆角由下面的 `body.theme-marathon .mlsb-*` 规则— !important 顶出— —
//   §4.3 那条全站直角通配规则会让它变方，这里必须显式豁免（与启动动画
//   那颗状态灯同一手法：多一个类，特异性压过通配规则）
//
        //   颜色全部来自主题 token（这个文件就是主题本身），英文用 Maratype
//   数字用等宽栈—         '/* ---- per-turn token settlement ---- */',
        // 出现动画— 026-10-09 用户）：纸条在轮次结— 1— s 后才落地（宿— /state 是轮询的），
        // 所以给它一— *从中间向两端展开**的入场：clip-path 从「中间一条零宽的缝」长到整块
// — clip-path 而不— scaleX —— scaleX 会把卡片里的字一起压扁
'@keyframes mlsb-reveal{',
        '  from{clip-path:inset(0 50% 0 50%);}',
        '  to{clip-path:inset(0 0 0 0);}',
        '}',
        //   ── 尺寸：只有一个旋— ──────────────────────────────────────────────
        //   2026-10-09 用户："可以放大 0.5 倍左右，目前来看有点挤"。所有尺寸都写成
        //   `calc(<原始—  * var(--mlsb-s))`，所以「再大一— 小一点」只改这一个数
//   1.5 — — 402px、绿— 42px、明细行 33px、灰— 39px、圆— 9px、间— 7.5px
'.mlsb-turn{margin:12px auto 0;--mlsb-s:1.5;width:calc(268px * var(--mlsb-s));max-width:100%;',
        '  --mlsb-radius:calc(6px * var(--mlsb-s));--mlsb-gap:calc(5px * var(--mlsb-s));',
        '  font-family:var(--dsw-font-family);animation:mlsb-reveal .18s cubic-bezier(.2,.8,.2,1) both;}',
        // 2026-10-09（用户）：消息内居中 + 绿条上不放费用 + 两侧各一个十字；字体回默认
'.mlsb-turn-head{display:grid;grid-template-columns:calc(18px * var(--mlsb-s)) 1fr calc(18px * var(--mlsb-s));',
        '  align-items:center;gap:calc(6px * var(--mlsb-s));width:100%;height:calc(28px * var(--mlsb-s));',
        '  padding:0 calc(9px * var(--mlsb-s));border:0;background:var(--mar-bill-accent);color:var(--mar-bill-ink);',
        '  cursor:pointer;font:inherit;text-align:center;transition:border-radius .2s cubic-bezier(.2,.8,.2,1);}',
        '.mlsb-turn-head:hover{filter:brightness(1.05);}',
        '.mlsb-turn-head:focus-visible{outline:1px solid var(--mar-ink-primary);outline-offset:2px;}',
        '.mlsb-turn-title{font:800 calc(11px * var(--mlsb-s))/1 var(--dsw-font-family);',
        '  letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.mlsb-cross{font:400 calc(14px * var(--mlsb-s))/1 Arial,sans-serif;color:var(--mar-bill-ink);}',
        '.mlsb-cross.mlsb-left{justify-self:start;}',
        '.mlsb-cross.mlsb-right{justify-self:end;}',
        // 展开/收起动画— 026-10-09 用户）：`display` 不能过渡，所以用模板那套
        // `grid-template-rows:0fr → 1fr`（内层再包一层 min-height:0/overflow:hidden）：
        // 收起时高度为 0 但仍在文档流里，于是高度与透明度都能平滑过渡
'.mlsb-turn-body{display:grid;grid-template-rows:0fr;opacity:0;overflow:hidden;background:var(--mar-bg-panel);',
        '  transition:grid-template-rows .2s cubic-bezier(.2,.8,.2,1),opacity .16s ease;}',
        '.mlsb-turn-body-inner{min-height:0;overflow:hidden;}',
        '.mlsb-turn.mlsb-open .mlsb-turn-body{grid-template-rows:1fr;opacity:1;}',
        '.mlsb-row{display:flex;align-items:center;justify-content:space-between;gap:calc(10px * var(--mlsb-s));',
        '  height:calc(22px * var(--mlsb-s));padding:0 calc(9px * var(--mlsb-s));',
        '  border-bottom:1px solid var(--mar-line-faint);background:var(--mar-wash);',
        '  font-size:calc(11px * var(--mlsb-s));line-height:1;color:var(--mar-ink-secondary);}',
        '.mlsb-row:nth-child(odd){background:var(--mar-wash-strong);}',
        '.mlsb-row:last-child{border-bottom:0;}',
        '.mlsb-row b{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;',
        '  font-size:calc(11px * var(--mlsb-s));font-weight:700;',
        '  font-variant-numeric:tabular-nums;color:var(--mar-ink-primary);}',
        '.mlsb-row b.mlsb-acid{color:var(--mar-bill-acid);}',
        '.mlsb-row b.mlsb-signal{color:var(--mar-signal);}',
        '.mlsb-turn-foot{display:flex;align-items:center;justify-content:space-between;gap:calc(8px * var(--mlsb-s));',
        '  height:calc(26px * var(--mlsb-s));padding:0 calc(9px * var(--mlsb-s));',
        '  margin-top:var(--mlsb-gap);background:var(--mar-bg-overlay);color:var(--mar-ink-primary);',
        '  font-size:calc(11px * var(--mlsb-s));}',
        '.mlsb-turn-clock{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;',
        '  font-weight:700;letter-spacing:.04em;}',
        '.mlsb-turn-note{color:var(--mar-ink-tertiary);font-size:calc(11px * var(--mlsb-s));letter-spacing:.02em;}',
        //   ⚠️ i 角标（暂时注释掉— 026-10-09 用户— 任务用时不需要这— i 和方框了
//   相关代码先注释掉，万一后面需要再启动和修— ）。要恢复的话，把下面两行
        //   和 buildTurnBlock() 里那行 appendChild(mlsbEl('span','mlsb-info','i')) 一起取消注释。
        'body.theme-marathon *::after{border-radius:0!important;}',
        // '.mlsb-info{display:inline-grid;place-items:center;width:14px;height:14px;flex:none;',
        // '  border:1px solid currentColor;border-radius:50%!important;font:700 9px/1 Georgia,serif;}',
        // 'body.theme-marathon .mlsb-info{border-radius:50%!important;}',
        'body.theme-marathon .mlsb-turn-head{border-radius:var(--mlsb-radius)!important;}',
        'body.theme-marathon .mlsb-turn.mlsb-open .mlsb-turn-head{',
        '  border-radius:var(--mlsb-radius) var(--mlsb-radius) 0 0!important;}',
        'body.theme-marathon .mlsb-turn-body{border-radius:0 0 var(--mlsb-radius) var(--mlsb-radius)!important;}',
        'body.theme-marathon .mlsb-turn-foot{border-radius:var(--mlsb-radius)!important;}',
        //   动效要能被关掉：与主题其它动效同一条 reduced-motion 规则（入场、展开、圆角过渡）
        '@media (prefers-reduced-motion: reduce){',
        '  .mlsb-turn{animation:none;}',
        '  .mlsb-turn-body,.mlsb-turn-head{transition:none;}',
        '}'
      ].join('\n');

      var disposeStyles = insertCss(css);

      // ---- decorative DOM: NONE -------------------------------------------
      // No decorative layer sits on the page any more. The grid, scanlines, CRT
      // and sweep were removed on 2026-09-18; what is left is two one-shot
      // overlays that belong to a specific surface and remove themselves —
      // `.mar-mosaic` inside the settings panel, `.mar-board-intro` inside the
      // task board — plus the boot overlay below (#dshMarBootHost). None of
      // them is a full-viewport texture.

      // ======================================================================
      //  BACKGROUND LAYER — ASCII dot field
      //  --------------------------------------------------------------------
      //  Ported from the standalone "ASCII 点阵呼吸场" page: a monospace grid
      //  whose per-cell strength comes from four superposed sine waves — dense
      //  glyphs where the field is strong, nothing where it is weak. Deviations
      //  from the original, all on request:
      //    * the '*' glyphs are gone from the palette (they read as noise)
      //    * TWO colour pairs instead of one, both of them GREEN ON THE FIELD
      //      and mirror images of each other:
      //        主白 + 绿  → white field, acid-green glyphs, and a LIGHT UI
      //        主黑 + 绿  → black field, acid-green glyphs, dark UI untouched
      //      Green is the constant (glyphs, brand, accents); the PLATE is what
      //      flips, and the UI ink flips with it — black ink on the white plate,
      //      light ink on the dark one (see .mar-bg-light in the stylesheet).
      //      The dark pair leaves DSH's palette completely alone.
      //    * the pair and the field switch are SEPARATE state: the 背景动画
      //      switch stops drawing the field but keeps BG_STATE.scheme, so the UI
      //      stays white in 主白 + 绿 (it used to drop back to the dark pairing).
      //      The pair buttons are a radio group — exactly one is always chosen —
      //      and the switch is its own control, OFF by default.
      //    * it is a BACKGROUND, nothing else: fixed, first child of <body>,
      //      z-index 0, pointer-events:none. The only page surfaces it changes
      //      are the full-viewport containers marked `.mar-bg-clear` (see
      //      bgClearTargets: the frame, both columns, and the opaque plate each
      //      column owns); every control keeps the colour it already owns.
      //    * the marks are re-applied on any DOM change (bgWatch/bgKick), so a
      //      session switch cannot leave the sidebar on an opaque plate for a
      //      whole second — that is what read as "the field disappears and
      //      comes back".
      //    * pair / density / opacity / speed are user settings, persisted in
      //      localStorage and surfaced in DSH's settings dialog under the
      //      「主题设置」 tab this file injects (mountSettingsTab below).
      //  Knobs: BG_STATE.anim (the field switch), .scheme (light|dark), .cell,
      //  .alpha (how visible the glyphs are), .speed.
      //  The canvas carries the field colour itself (--mar-bg-field), so
      //  clearRect only wipes glyphs — the field is never repainted per frame.
      // ======================================================================
      var BG_STORE_KEY = 'dsh-theme-marathon.bg.v1';
      var BG_PALETTE = '   ...:::---+++◦◦••▢▣';   // sparse -> dense; ' ' = skip
      var BG_FLOOR = 0.22;      // strength below this is not drawn at all
      var BG_ALPHA0 = 0.08;     // alpha of the weakest glyph
      var BG_ALPHA1 = 0.55;     // extra alpha at full strength
      var BG_FPS = 30;          // the field breathes slowly; 30 is plenty
      //   field         the field's own plate colour
      //   light         the UI on top has to flip with it (see the light layer
      //                 in the stylesheet): white plate, black ink. It is what
      //                 the 背景动画 switch must NOT take away — see bgApplyMode.
      //   (the GLYPH colour is not here any more — it is the theme accent, see
      //    bgInk() below; 2026-10-19 用户："将主题色适配到背景动画中")
      //  There is no scrim ("veil") any more. It existed for one reason: 60%
      //  black over the old acid-green field was the only way to keep white ink
      //  legible, so the .mar-bg-clear containers took a wash. With the field
      //  green-on-plate in BOTH pairs the glyphs are decoration and the ink is
      //  the plate's opposite, so the field simply runs through the chrome —
      //  which is what the dark pair has always done. Two measured reasons it
      //  could not stay:
      //    * it broke the mirror (one pair washed, the other not);
      //    * it COMPOUNDS. The frame, the centre column and that column's own
      //      plate are all marked and nested, so a 60% scrim landed three times
      //      over: 0.4^3 = 6% transmission. Measured on the white pair the field
      //      was drawn (7509 glyph px on the canvas) and the page still had ZERO
      //      green pixels — "主白 + 绿 也要有点阵" was a field painting
      //      perfectly and visible nowhere.
      var BG_MODES = {
        light: { field: '#FFFFFF', light: true },    // 浅色底盘：白底
        dark:  { field: '#0B0D0B', light: false }    // 深色底盘：黑底
      };
      //  The glyph colour IS the theme accent as of 2026-10-19 (用户："将主题色适配到
      //  背景动画中"). It used to be the frozen '192,254,4' — that was the 2026-10-11
      //  decision ("配色只调整 UI 的，不动其他"), which the user has now superseded for
      //  this one surface. --mar-accent is written inline on <body> by accentApply(),
      //  so ACCENT_STATE is the same value with no DOM round-trip. Returns the
      //  'r,g,b' triple the canvas alpha prefix expects.
      function bgInk() {
        return accentRgb(ACCENT_STATE.color).join(',');
      }
      var BG_STATE = bgLoad();
      //   `pref` is the DSH appearance preference (light | dark | system) — the
      //   same value 通用设置 edits. `scheme` is only ever the RESOLVED pair
      //   (light | dark) used to paint; a system preference lands here as
      //   whatever the OS currently says. bgLoad keeps a copy purely so a host
      //   without the theme service still has something to paint; wherever the
      //   service exists it is read back on mount and wins (see themeAdopt).
      var SYSTEM_MQ = null;

      var bgCanvas = null, bgCtx = null, bgMounted = false;
      var bgRaf = 0, bgElapsed = 0, bgLastMs = 0, bgDrawMs = 0, bgResizeTimer = null;
      var bgW = 0, bgH = 0, bgCols = 0, bgRows = 0, bgDpr = 1;

      function bgNum(v, a, b) { return v < a ? a : (v > b ? b : v); }

      // Read once at apply(); every later change goes through the pane handlers.
      //   anim    whether the field is DRAWN at all: its own switch, OFF by
      //           default, so the theme is usable without the dot field. ('green'
      //           and the off|light|dark triple are the v1/v2 stores, migrated
      //           on read.)
      //   scheme  which colour PAIR the UI wears: light | dark. Exactly one of
      //           the two is always chosen (the pair buttons are a radio group),
      //           and it is kept while the field is off, so the 背景动画 switch
      //           cannot flip the UI back.
      //   alpha   how visible the glyphs are, 0..1 (默认 1 = 原来的强度).
      //           用户 2026-10-19："再给背景动画添加一个透明度，用于调节可见范围"。
      //           它乘在每条字形的 alpha 上，所以 0 就是"看不见"、1 是原样。
      function bgLoad() {
        var out = { anim: false, scheme: 'dark', pref: 'dark', cell: 16, speed: 0.55, alpha: 1 };
        var raw = null;
        try { raw = (typeof window !== 'undefined' && window.localStorage) ? window.localStorage.getItem(BG_STORE_KEY) : null; } catch (e) { raw = null; }
        if (!raw) return out;
        var s = null;
        try { s = JSON.parse(raw); } catch (e) { s = null; }
        if (!s || typeof s !== 'object') return out;
        // v2 stored ONE mode (off|light|dark) that doubled as the pair: 'off'
        // carried no pair at all, which is exactly why turning the animation off
        // forgot which UI to keep. Split it on read — the pair always survives,
        // the field switch is its own boolean.
        var pair = (s.scheme === 'light' || s.scheme === 'dark') ? s.scheme : null;
        if (s.mode === 'light' || s.mode === 'dark') { out.anim = true; pair = pair || s.mode; }
        else if (s.mode === 'green') { out.anim = true; pair = pair || 'light'; }  // v1: acid field -> white field
        else if (s.mode === 'off') out.anim = false;
        if (typeof s.anim === 'boolean') out.anim = s.anim;   // v3 wins over a migrated mode
        if (pair) out.scheme = pair;
        //  v4 (2026-11-05): the preference joined the store. A store written
        //  before it has no `pref`; the pair it was carrying IS the preference
        //  it represented (an explicit light/dark), so it migrates losslessly.
        if (s.pref === 'light' || s.pref === 'dark' || s.pref === 'system') out.pref = s.pref;
        else out.pref = out.scheme;
        if (typeof s.cell === 'number') out.cell = bgNum(Math.round(s.cell), 8, 48);
        if (typeof s.speed === 'number') out.speed = bgNum(s.speed, 0, 1.5);
        //  Store written before 2026-10-19 has no alpha → full strength (1), which
        //  is exactly what those builds looked like.
        if (typeof s.alpha === 'number') out.alpha = bgNum(s.alpha, 0, 1);
        return out;
      }
      function bgSave() {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(BG_STORE_KEY, JSON.stringify(BG_STATE));
          }
        } catch (e) {}
      }

      // ======================================================================
      //  主题配色 — the UI accent, and the ONLY thing the 配色 swatches drive
      //  --------------------------------------------------------------------
      //  Seven flat rectangles in the settings pane (配色 group); picking one
      //  repaints the UI accent, nothing else. It deliberately does NOT touch
      //  the dot field, the boot animation or the completion animation
      //  (2026-10-11 user: "配色只调整 UI 的，不动其他") — BG_MODES.ink stays
      //  '192,254,4' and both boot payloads keep their own colours, so this is
      //  a UI-accent switch and not a second theme.
      //
      //  The default is the original acid green, so a store written before this
      //  setting existed comes back looking exactly as it did.
      // ======================================================================
      var ACCENT_STORE_KEY = 'dsh-theme-marathon.accent.v1';
      var ACCENT_DEFAULT = '#C0FE04';
      var ACCENT_ORDER = ['#05C938', '#E60B10', '#E7337C', '#E5710C',
                          '#C272E9', '#81E8B1', ACCENT_DEFAULT];
      var ACCENT_STATE = { color: accentLoad() };

      // One spelling for the store, the data-accent attribute and the compare:
      // upper case, always '#', #RGB expanded to #RRGGBB.
      function accentNorm(v) {
        var s = String(v == null ? '' : v).trim().toUpperCase();
        if (s.charAt(0) !== '#') s = '#' + s;
        if (/^#[0-9A-F]{3}$/.test(s)) {
          s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
        }
        return /^#[0-9A-F]{6}$/.test(s) ? s : '';
      }
      //  Anything outside the seven is NOT selectable: a hand-edited
      //  localStorage value must never paint a colour the pane cannot un-pick.
      function accentValid(v) { return ACCENT_ORDER.indexOf(accentNorm(v)) >= 0; }

      function accentLoad() {
        var v = '';
        try {
          v = (typeof window !== 'undefined' && window.localStorage)
            ? window.localStorage.getItem(ACCENT_STORE_KEY) : '';
        } catch (e) { v = ''; }
        return accentValid(v) ? accentNorm(v) : ACCENT_DEFAULT;
      }
      function accentSave() {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(ACCENT_STORE_KEY, ACCENT_STATE.color);
          }
        } catch (e) {}
      }
      function accentRgb(hex) {
        var h = accentNorm(hex) || ACCENT_DEFAULT;
        return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16),
                parseInt(h.slice(5, 7), 16)];
      }
      //  The ink that sits ON an accent fill. The old theme could hard-code
      //  #0B0D0B because there was exactly ONE accent; with seven of them the
      //  fill can be dark (the red is only 4.75:1 against black), so the ink is
      //  measured: whichever of #0B0D0B / #FFFFFF has the higher contrast wins.
      //  --mar-accent-ink and --mar-solid-ink must get the SAME value — the
      //  second is what DSH's own on-solid labels resolve through.
      function accentInk(hex) {
        var c = accentRgb(hex);
        var lin = [0, 0, 0];
        for (var i = 0; i < 3; i++) {
          var v = c[i] / 255;
          lin[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        }
        var L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
        var onDark = (L + 0.05) / 0.05;   // contrast against #0B0D0B
        var onWhite = 1.05 / (L + 0.05);
        return onWhite > onDark ? '#FFFFFF' : '#0B0D0B';
      }

      //  The whole state change. Set INLINE on <body> so it outranks both the
      //  base block and the light layer in the injected stylesheet — the light
      //  layer's own --mar-accent-text:#0B0D0B is therefore re-derived here
      //  rather than left to the cascade.
      function accentApply() {
        var color = ACCENT_STATE.color;
        var rgb = accentRgb(color);
        var ink = accentInk(color);
        var light = body.classList.contains('mar-bg-light');
        body.style.setProperty('--mar-accent', color);
        body.style.setProperty('--mar-accent-ink', ink);
        body.style.setProperty('--mar-solid-ink', ink);
        //  On the white plate the accent is a SURFACE and never a letterform
        //  (see the long note on --mar-accent-text in the stylesheet).
        body.style.setProperty('--mar-accent-text', light ? '#0B0D0B' : color);
        body.style.setProperty('--mar-wash-accent',
          'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',.14)');
        //  The dot field's glyphs ARE this accent now (bgInk), so repaint the canvas
        //  immediately instead of waiting for the next rAF frame. It matters most
        //  under reduced motion, where the field is a single static frame that
        //  would otherwise keep the previous colour until something else redraws.
        //  bgW/bgCtx are 0/null before the first bgResize, hence the guard.
        if (bgCtx && BG_STATE.anim && bgW > 0) {
          try { bgDraw(bgElapsed); } catch (e) {}
        }
      }

      // ---- RESERVED: the switch animation ----------------------------------
      //  "在切换颜色时，也需要有一个动画，我们先预留动画接口" (2026-10-11).
      //  The colour change itself is accentApply(); the animation that dresses
      //  it is not written yet. The CONTRACT is fixed now so the animation can
      //  be dropped in later without touching the click path or its tests:
      //    · next   the colour being switched TO, already normalised+validated
      //    · apply  the one and only state change — call it EXACTLY ONCE, and
      //             synchronously from inside the player (vtPour above has the
      //             same shape, so it can be reused verbatim if the mosaic pour
      //             is what the animation turns out to be)
      //  Today it is a pass-through: the swatch repaints instantly and nothing
      //  animates. Do not "temporarily" call apply() a second time here.
      function accentSwitchFx(next, apply) {
        if (typeof apply === 'function') apply();
      }

      function bgResize() {
        if (!bgCanvas || !bgCtx || typeof window === 'undefined') return;
        bgDpr = Math.min(window.devicePixelRatio || 1, 2);
        bgW = window.innerWidth;
        bgH = window.innerHeight;
        bgCanvas.width = Math.round(bgW * bgDpr);
        bgCanvas.height = Math.round(bgH * bgDpr);
        try { bgCtx.setTransform(bgDpr, 0, 0, bgDpr, 0, 0); } catch (e) {}
        bgCols = Math.ceil(bgW / BG_STATE.cell);
        bgRows = Math.ceil(bgH / BG_STATE.cell);
      }

      function bgDraw(t) {
        if (!bgCtx || !BG_STATE.anim) return;
        var g = bgCtx, cell = BG_STATE.cell;
        //  The glyph colour is the live theme accent (bgInk), and the per-glyph
        //  alpha is the old curve scaled by the 透明度 knob — so alpha 1 reproduces
        //  every earlier build exactly, and 0 draws nothing at all.
        var ink = bgInk();
        var alphaMul = bgNum(BG_STATE.alpha, 0, 1);
        g.clearRect(0, 0, bgW, bgH);
        g.font = '500 ' + Math.max(9, Math.round(cell * 0.8)) +
          'px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        g.textBaseline = 'top';
        var cx = bgCols * 0.5, cy = bgRows * 0.5;
        for (var r = 0; r < bgRows; r++) {
          for (var c = 0; c < bgCols; c++) {
            var n = (Math.sin(c * 0.18 + t) +
                     Math.sin(r * 0.24 - t * 0.7) +
                     Math.sin((c + r) * 0.12 + t * 0.45) +
                     Math.sin(Math.hypot(c - cx, r - cy) * 0.16 - t * 0.55)) * 0.25;
            var v = (n + 1) * 0.5;
            if (v < BG_FLOOR) continue;
            var ch = BG_PALETTE.charAt(Math.min(BG_PALETTE.length - 1, Math.floor(v * BG_PALETTE.length)));
            if (ch === ' ') continue;
            g.fillStyle = 'rgba(' + ink + ',' +
              ((BG_ALPHA0 + (v - BG_FLOOR) * BG_ALPHA1) * alphaMul).toFixed(3) + ')';
            g.fillText(ch, c * cell, r * cell);
          }
        }
      }

      // rAF runs every frame but only paints every 1000/BG_FPS ms: the field's
      // own clock (bgElapsed) advances on wall time, so capping the paint rate
      // slows nothing down, it only drops frames.
      function bgTick(now) {
        if (!bgCanvas || !bgCtx) { bgRaf = 0; return; }
        if (doc.hidden) { bgRaf = 0; bgLastMs = 0; return; }
        if (!bgLastMs) bgLastMs = now;
        if (now - bgDrawMs < 1000 / BG_FPS) { bgRaf = window.requestAnimationFrame(bgTick); return; }
        bgElapsed += (now - bgLastMs) * BG_STATE.speed / 1000;
        bgLastMs = now;
        bgDrawMs = now;
        bgDraw(bgElapsed);
        bgRaf = window.requestAnimationFrame(bgTick);
      }

      function bgStart() {
        if (bgRaf || !bgCanvas || !BG_STATE.anim) return;
        // reduced motion: no loop at all — one static frame still shows the field.
        // Same bail-out when there is no rAF (jsdom in the unit test).
        if (reducedMotion() || typeof window === 'undefined' || !window.requestAnimationFrame) {
          bgDraw(bgElapsed);
          return;
        }
        bgLastMs = 0;
        bgDrawMs = 0;
        bgRaf = window.requestAnimationFrame(bgTick);
      }
      function bgStop() {
        if (bgRaf && typeof window !== 'undefined' && window.cancelAnimationFrame) {
          window.cancelAnimationFrame(bgRaf);
        }
        bgRaf = 0;
      }

      // ---- who steps aside for the field ------------------------------------
      // Two passes, because they have different costs and different jobs.
      //
      // PASS 1 — anchors. Pure selector lookups, no style reads, so it is cheap
      // enough to run on *every* DOM change. The frame is #root's inner div; each
      // column is one level down; each column's own root is the FIRST `_root`
      // descendant in document order (the outermost container always is):
      //   sidebar  hero phase `hHd-Xa_root hHd-Xa_quietBars` / active `hHd-Xa_root`
      //   centre   `wSkVaW_root`
      // This is where the old code went wrong: it looked for `_quietBars` only,
      // so as soon as a conversation was open the sidebar root kept its opaque
      // rgb(11,13,11) plate and the field vanished behind the sidebar — the
      // "sometimes the sidebar has the animation, sometimes it doesn't" report.
      // (Measured live: .generated/probe-bgwho.cjs, .generated/probe-rootes.cjs.)
      function bgAnchorTargets() {
        var root = doc.getElementById('root');
        var frame = root ? (root.querySelector(':scope > div > div') || root.firstElementChild) : null;
        var list = [];
        if (!frame) return list;
        list.push(frame);
        var cc = frame.querySelector(':scope > [class*="_centerCol"]');
        // The SIDEBAR IS DELIBERATELY LEFT OUT. The field used to run through the
        // whole chrome, the rail included; the rail now keeps its own opaque
        // plate (--dsw-specific-sidebar-fill = --mar-bg-void) so it reads as a
        // solid rail against the breathing field instead of a hole punched in it
        // ("侧边栏不要透明"). The frame is still marked — it is the shared parent
        // and the rail paints its own background over it — and the centre column
        // is cleared exactly as before.
        if (cc) {
          list.push(cc);
          var plate = cc.querySelector('[class*="_root"]');
          if (plate) list.push(plate);
        }
        // The composer's DISSOLVE band. In a session the seat turns sticky and
        // paints `linear-gradient(transparent 0px, rgb(11,13,11) 36px)` so the
        // conversation fades out under it — and everything past the 36px stop is
        // solid page colour. It is 1284x146: full width, but only 146 tall, so
        // the 200x200 plate floor in pass 2 never reaches it and the bottom
        // ~110px of the viewport stayed a dead black strip while every other
        // pixel breathed. Hence an ANCHOR: a selector is exact and costs nothing.
        // On the home page the same node is `static` with no gradient (the hero
        // composer is centred, nothing to dissolve), so marking it is a no-op
        // there. (Measured: .generated/probe-nt5.cjs, .generated/probe-bgcover.cjs)
        var seat = cc ? cc.querySelector('[class*="composerSeat"]') : null;
        if (seat) list.push(seat);
        return list;
      }

      // PASS 2 — "who actually paints a plate". Walks both columns and marks any
      // node whose own background would hide the field. This reads computed style
      // and layout, so it runs on mount, on the 1.2s sweep, and on a throttled
      // follow-up — never per frame. The size floor is what keeps it honest:
      // session rows (254x34), the new-session button (252x38) and the list's
      // bottom fade (256x24) are the only other things that paint in there, and
      // all of them must keep their colour (selection and hover live on them).
      //
      // A MODAL is not part of the page and must never be marked. DSH mounts its
      // settings dialog inside the sidebar's own subtree — measured path:
      //   hHd-Xa_root > hHd-Xa_footArea > hHd-Xa_settingsArea > div >
      //   VOzbGW_overlay (position:fixed, z-index:1000) > VOzbGW_panel (800x800)
      // — so this walk used to reach the dialog and strip its 800x800 plate. The
      // opening mosaic hid it (opaque tiles over the whole panel) and the moment
      // the reveal finished the tiles wiped off to nothing but a see-through
      // dialog: "the settings tab goes transparent once the animation ends, but
      // it still clicks". It was the panel and our own .mar-set-pane both being
      // marked. The walk now stops at the modal boundary — do not remove that.
      // (Measured live: .generated/probe-navtab2.cjs.)
      //
      // The same reasoning covers any out-of-flow layer, modal or not — see
      // bgLayer below for the task board, which is the same bug in a different
      // plugin. Both prunes refuse to MARK a node and refuse to DESCEND into it.
      function bgModal(el) {
        if (!el.getAttribute) return false;
        if (el.getAttribute('role') === 'dialog') return true;
        if (el.getAttribute('aria-modal') === 'true') return true;
        var cls = typeof el.className === 'string' ? el.className : '';
        return /(^|\s)[A-Za-z0-9_-]*(_overlay|_modal|_dialog|_popover)(\s|$)/.test(cls);
      }

      // An out-of-flow LAYER (absolute / fixed) is a panel floating above the page
      // shell — i.e. content, not chrome — and the walk must not enter it. This is
      // how DSH plugins mount a view: @linxin666/dsh-client-ui-task-board appends
      //   [data-dsh-taskboard-view]{position:absolute;inset:0;z-index:60}
      // to the centre column and hides the conversation with
      //   [class*=centerCol] > :not([data-dsh-taskboard-view]){display:none!important}
      // (see the plugin's board-mount.tsx). Marking it was bad enough — the board
      // root (relative, 1294x900) and its five 243x821 columns live *underneath*,
      // so pruning only the layer itself would not have saved anything: all seven
      // nodes were on the .mar-bg-clear list and the board went see-through the
      // moment its own intro wiped off ("the task board turns transparent once the
      // animation ends"). Chrome never floats: frame relative, both columns
      // static/relative, each column's _root static, the composer seat sticky.
      // (Measured live: .generated/probe-boardbg.cjs, .generated/probe-boardbg2.cjs.)
      function bgLayer(el) {
        if (typeof window === 'undefined' || !window.getComputedStyle) return false;
        var cs;
        try { cs = window.getComputedStyle(el); } catch (e) { return false; }
        return cs.position === 'absolute' || cs.position === 'fixed';
      }

      function bgPaints(el) {
        if (!el || el.nodeType !== 1 || typeof window === 'undefined' || !window.getComputedStyle) return false;
        var cs;
        try { cs = window.getComputedStyle(el); } catch (e) { return false; }
        // a floating layer sits above the page; clearing it would punch a hole
        // straight through to whatever is behind (backstop for a modal that does
        // not carry any of the class/role hints above, and for any other panel)
        if (cs.position === 'fixed' || cs.position === 'absolute') return false;
        var r = el.getBoundingClientRect();
        if (r.width < 200 || r.height < 200) return false;   // 只有"整块底板"才算
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
        var m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor);
        if (!m) return false;
        var p = m[1].split(/[,\/]/).map(parseFloat);
        return (p.length > 3 ? p[3] : 1) > 0.3;
      }

      // #3 (2026-11-04) — the composer SEAT is a boundary, like a modal.
      // The seat itself is cleared on purpose (its dissolve gradient is the
      // bottom band of every session, and 1284x146 never reaches the 200x200
      // floor anyway, so it is cleared via bgAnchorTargets). Everything INSIDE
      // it is content: the input card, and the ask_user_question card, which is
      // 320x240 — big enough to pass bgPaints, so the walk used to mark it
      // `.mar-bg-clear` and the question card became transparent ("提问卡片
      // 变透明", issue #3). Refuse to MARK and refuse to DESCEND, exactly like
      // bgModal/bgLayer above. The 0.2.2 host marks the seat with BOTH
      // `data-composer-seat` (stable semantic hook, set by
      // dsh-client-ui-conversation ConversationRoot) and the hashed
      // `..._composerSeat` class; the class form is kept for older builds that
      // predate the attribute.
      function bgIsComposerSeat(el) {
        if (!el || !el.getAttribute) return false;
        if (el.hasAttribute && el.hasAttribute('data-composer-seat')) return true;
        var cls = typeof el.className === 'string' ? el.className : '';
        return /(^|\s)[A-Za-z0-9_-]*composerSeat(\s|$)/.test(cls);
      }

      function bgPaintWalker(el, out, depth) {
        if (!el || el.nodeType !== 1 || depth > 9) return;
        if (bgModal(el) || bgLayer(el)) return;   // 不标记它，也不进它的子树
        if (bgIsComposerSeat(el)) return;         // #3: 座位内部是内容，见上
        // 我们自己的每轮结算纸条：它是**内容**（转录的一部分），不是界面底板
// 展开后它— 268x240，正好越— bgPaints — 200x200 底板门槛 —
// 少了这一条，ASCII 背景模式下纸条会被清成透明（数字浮在网格上）
if (el.hasAttribute && el.hasAttribute('data-mlsb-turn')) return;
        if (bgPaints(el)) out.push(el);
        for (var i = 0; i < el.children.length; i++) {
          bgPaintWalker(el.children[i], out, depth + 1);
        }
      }

      function bgPaintTargets() {
        var list = [];
        var root = doc.getElementById('root');
        var frame = root ? (root.querySelector(':scope > div > div') || root.firstElementChild) : null;
        if (!frame) return list;
        // The sidebar is NOT walked (see bgAnchorTargets): the rail keeps its own
        // opaque plate, so nothing inside it may be marked transparent.
        var cc = frame.querySelector(':scope > [class*="_centerCol"]');
        if (cc) bgPaintWalker(cc, list, 0);
        return list;
      }

      // 打过标记的节点（用来发现"标记跟着旧节点被换掉—
var bgCleared = [];

      function bgMarkAdd(list) {
        var i;
        for (i = 0; i < list.length; i++) {
          list[i].classList.add('mar-bg-clear');
          if (bgCleared.indexOf(list[i]) < 0) bgCleared.push(list[i]);
        }
        var keep = [];
        for (i = 0; i < bgCleared.length; i++) {
          if (doc.contains(bgCleared[i])) keep.push(bgCleared[i]);
        }
        bgCleared = keep;
      }

      // The rail must stay OPAQUE, and `.mar-bg-clear` is only ever ADDED by the
      // passes above — nothing takes it off. So a node that was marked before the
      // rail was taken out of the walk (an older revision of this theme in the
      // same page, or a swap that reused the node) would stay see-through for
      // good. Sweeping it off is a no-op on a clean load and the belt for every
      // other path. Cheap: one subtree query on the same 1.2s tick as the marks.
      function bgUnmarkSidebar() {
        var root = doc.getElementById('root');
        var frame = root ? (root.querySelector(':scope > div > div') || root.firstElementChild) : null;
        var sc = frame ? frame.querySelector(':scope > [class*="_sidebarCol"]') : null;
        if (!sc) return;
        sc.classList.remove('mar-bg-clear');
        var marked = sc.querySelectorAll('.mar-bg-clear');
        for (var i = 0; i < marked.length; i++) marked[i].classList.remove('mar-bg-clear');
      }

      function bgUnmarkComposer() {
        // #3 belt-and-braces: the seat ITSELF keeps its mark (that is the
        // dissolve band), but nothing inside it may. The walk no longer enters
        // the seat, so this is a no-op on a clean load; it is here for the same
        // reason as bgUnmarkSidebar — a node marked by an older revision (or by
        // a pass that ran before the seat was identified) must not stay
        // see-through for good. Two selectors because 0.2.2 ships the
        // data attribute while older builds only had the hashed class.
        var root = doc.getElementById('root');
        var frame = root ? (root.querySelector(':scope > div > div') || root.firstElementChild) : null;
        var cc = frame ? frame.querySelector(':scope > [class*="_centerCol"]') : null;
        if (!cc) return;
        var seat = cc.querySelector('[data-composer-seat]') ||
          cc.querySelector('[class*="composerSeat"]');
        if (!seat) return;
        var marked = seat.querySelectorAll('.mar-bg-clear');
        for (var i = 0; i < marked.length; i++) marked[i].classList.remove('mar-bg-clear');
      }

      function bgMarkClear(remove) {
        var i;
        if (remove) {
          var all = bgAnchorTargets().concat(bgPaintTargets()).concat(bgCleared);
          for (i = 0; i < all.length; i++) all[i].classList.remove('mar-bg-clear');
          bgCleared = [];
          bgUnmarkSidebar();
          bgUnmarkComposer();
          return;
        }
        bgMarkAdd(bgAnchorTargets());
        bgMarkAdd(bgPaintTargets());
        bgUnmarkSidebar();
        bgUnmarkComposer();
      }

      // DSH 换会— / 进出会话都会重建侧栏与中列的根节点，而标记是挂在**节点**上的
// 节点一换，新节点没— .mar-bg-clear，点阵就被它的底色盖住，要等 1.2s 那趟
      // 扫描才补回来 —— 用户看到的正— 切换的时候背景动画会消失再出—
// 所— DOM 一动就补，分两档：
      //   · 锚点那一趟（不读样式）→ 每个 DOM 变化批次都跑，节点被换掉— *下一— *就补
//   · 底板扫描那一趟（要读样式）→ 只在标记掉线后跑，且 400ms 内不重复
      var bgObserver = null, bgKickRaf = 0, bgKickFullAt = 0;

      function bgKick() {
        if (bgKickRaf || typeof window === 'undefined' || !window.requestAnimationFrame) return;
        bgKickRaf = window.requestAnimationFrame(function () {
          bgKickRaf = 0;
          if (!BG_STATE.anim) return;
          bgMarkAdd(bgAnchorTargets());
          // #3: the anchor pass never marks inside the seat, but a DOM swap can
          // bring in a node that already carries a stale `.mar-bg-clear`
          // (React reuses nodes across turns). One subtree query per frame is
          // cheap and keeps the ask card opaque without waiting for the 1.2s
          // sweep.
          bgUnmarkComposer();
          var lost = false, i;
          for (i = 0; i < bgCleared.length; i++) {
            if (!doc.contains(bgCleared[i])) { lost = true; break; }
          }
          var now = Date.now();
          if (lost && now - bgKickFullAt >= 400) {
            bgKickFullAt = now;
            bgMarkAdd(bgPaintTargets());
          }
        });
      }

      function bgWatch() {
        if (typeof MutationObserver === 'undefined' || typeof window === 'undefined') return;
        var host = doc.getElementById('root') || body;
        if (bgObserver && bgObserver.__marHost === host) return;
        if (bgObserver) { try { bgObserver.disconnect(); } catch (e) {} }
        bgObserver = new MutationObserver(bgKick);
        bgObserver.__marHost = host;
        // `attributes` 不是可选项。侧栏的 hero 态是— DSH 自己— `_quietBars` 类保
// 透明的，— *第一— * hover 会把那个类摘掉（缩起— rail 展开，之后一直是展开
        // 态，所以只发生一次）——侧栏根当场按自己的底色 rgb(11,13,11) 画成不透明
// 这是一— *只有类变化、没有子节点变化**的重绘，旧的只订— childList 的观察器
        // 根本不响，只能等下一次碰巧有节点增删才被 bgKick 补上标记，用户看到的就是
        // 实测（headless Chrome + CDP 真的把指针移进去，逐帧采样侧栏根的 computed
        // background）：只订— childList 时不透明窗口 **517ms**；加上类过滤— **0ms**
// 代价有上限：bgKick 本身— bgKickRaf 做了 rAF 节流，一帧最多一趟锚点扫
// （纯选择器、不读样式；读样式的底板扫描还要 lost + 400ms 两道闸），
// attributes + attributeFilter — Chromium 侧只是按名字过滤
bgObserver.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      }

      //   DSH'S APPEARANCE PREFERENCE IS THE SINGLE SOURCE OF TRUTH.
      //   通用设置 → 外观 has three cells (浅色 / 深色 / 跟随系统), and the
      //   主题设置 「外观·配色」 row is a MIRROR of the same value, not a second
      //   switch. The theme service owns the durable `preference` (host
      //   user-settings): `system` is resolved through `prefers-color-scheme`,
      //   `active.colorScheme` is always the resolved light/dark, and the service
      //   re-emits `theme/change` when the OS flips while the preference is
      //   `system`.
      //   This plugin therefore only READS it and repaints its own plate. It used
      //   to write an explicit light/dark back on mount and every 1.2s, which is
      //   exactly what made 跟随系统 impossible: the theme overwrote the
      //   preference the user had just picked in 通用设置.
      var THEME_PREF_IDS = { light: true, dark: true, system: true };
      var SYSTEM_MQ_HANDLER = null;

      function themeSnapshot() {
        var svc = themeSvc();
        if (svc && typeof svc.getTheme === 'function') {
          try {
            var snap = svc.getTheme();
            if (snap && snap.active) {
              var scheme = snap.active.colorScheme === 'light' ? 'light' : 'dark';
              var pref = THEME_PREF_IDS[snap.preference] ? snap.preference : scheme;
              return { pref: pref, scheme: scheme };
            }
          } catch (e) {}
        }
        //   FALLBACK — the presenter's own projection. ui-layout publishes the
        //   preference as `html[data-ds-theme-source]` ('system' only when the
        //   preference is system, else the resolved scheme) and the resolved
        //   palette as `body[data-ds-dark-theme]`. Those two attributes are the
        //   same ones the shell preload reads, and they land within the same
        //   frame as a 通用设置 click — so even when the service still isn't
        //   reachable from this plugin's ctx, the row can follow DSH and repaint.
        //   Guarded on the source attribute existing: before the presenter's
        //   first projection both attributes are absent and "absent dark" must
        //   not be read as "the user picked light".
        try {
          var src = doc.documentElement.getAttribute('data-ds-theme-source');
          if (src === 'light' || src === 'dark' || src === 'system') {
            return {
              pref: src,
              scheme: body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'
            };
          }
        } catch (e) {}
        return null;
      }

      // The OS answer, for a host without the theme service (the web build and
      // old hosts). It is the same query the theme service itself uses.
      function systemScheme() {
        try {
          if (typeof window !== 'undefined' && window.matchMedia &&
              window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
        } catch (e) {}
        return 'light';
      }

      // Repaint the plate. `animate` is the 0.341s mosaic pour — the SAME
      // reveal the 配色 buttons have always used, so a switch made from
      // 通用设置 or by the OS reads exactly like one made in this pane.
      function themeAdoptScheme(scheme, animate) {
        var next = scheme === 'light' ? 'light' : 'dark';
        if (next === BG_STATE.scheme) return false;
        BG_STATE.scheme = next;
        bgSave();
        if (animate) vtPour(bgApplyMode);
        else bgApplyMode();
        syncPanes();
        // The Windows caption is measured from the document palette; its own
        // observer fires on body class/style, which bgApplyMode just moved —
        // poke it anyway so a system flip that changed nothing else still
        // re-measures (same self-heal path as the parked-caption fix).
        try { captionPokeHead(); } catch (e) {}
        return true;
      }

      // Adopt whatever DSH currently says. Preference and resolved scheme are
      // adopted independently: light→system can keep the same plate but must
      // move the selected cell, and an OS flip moves the plate while the
      // preference stays `system`.
      function themeAdopt(animate) {
        //   The service may have registered after apply() — retry the token layer
        //   here until it sticks (cheap no-op once done).
        themeOverrideTokens();
        var snap = themeSnapshot();
        if (!snap) return false;
        var moved = false;
        if (snap.pref !== BG_STATE.pref) {
          BG_STATE.pref = snap.pref;
          bgSave();
          syncPanes();
          moved = true;
        }
        return themeAdoptScheme(snap.scheme, animate) || moved;
      }

      // The ONE write path of this row: the service persists it (which is the
      // 通用设置 cell moving too) and emits theme/change. The service resolves
      // synchronously, so read the plate straight back before that event lands —
      // the click has to feel immediate.
      function themeSetPreference(next) {
        if (!THEME_PREF_IDS[next]) return false;
        if (next !== BG_STATE.pref) {
          BG_STATE.pref = next;
          bgSave();
        }
        var svc = themeSvc();
        var wrote = false;
        if (svc && typeof svc.setTheme === 'function') {
          try { svc.setTheme(next); wrote = true; } catch (e) {}
        }
        var scheme;
        if (wrote) {
          // Trust the service's resolution, but only when it actually accepted
          // the write: a host whose setTheme is async would otherwise leave the
          // click with no repaint at all.
          var snap = themeSnapshot();
          scheme = (snap && snap.pref === next) ? snap.scheme
            : (next === 'system' ? systemScheme() : next);
        } else {
          // No service handle (yet): drive the SAME two signals the presenter
          // writes, so the cell still works. Narrow fallback — the service path
          // is preferred, and DSH's own projection wins again the moment it
          // lands. `data-ds-theme-source` is also what the shell preload feeds
          // to nativeTheme, so the caption follows even in this mode.
          scheme = next === 'system' ? systemScheme() : next;
          try {
            doc.documentElement.style.colorScheme = scheme;
            doc.documentElement.setAttribute('data-ds-theme-source', next);
            if (scheme === 'dark') body.setAttribute('data-ds-dark-theme', '');
            else body.removeAttribute('data-ds-dark-theme');
          } catch (e) {}
        }
        themeAdoptScheme(scheme, true);
        syncPanes();
        return true;
      }

      //   The presenter's projection is also the fastest notification we can get
      //   without the service: 通用设置 writes `html[data-ds-theme-source]` and
      //   `body[data-ds-dark-theme]` in the same apply, so this observer turns a
      //   click anywhere in DSH into the same pour this pane plays — no service
      //   handle, no 1.2s wait. Our own changes go through the service and land
      //   here too, where themeAdopt simply no-ops.
      var themeDomObs = null;
      function themeDomWatch() {
        if (themeDomObs || typeof MutationObserver === 'undefined') return;
        themeDomObs = new MutationObserver(function () {
          // No pour while the cold-start overlay owns the screen: a presenter
          // projection that lands during the reveal must snap, not animate.
          var booting = false;
          try {
            booting = typeof captionBootRunning === 'function' && captionBootRunning();
          } catch (e) {}
          if (themeAdopt(!booting)) marThemeReport();
        });
        try {
          themeDomObs.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-ds-theme-source'] });
          themeDomObs.observe(body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
        } catch (e) {
          themeDomObs = null;
        }
      }

      // Fallback for a host without the theme service: follow the OS directly.
      function systemWatch() {
        if (SYSTEM_MQ || typeof window === 'undefined' || !window.matchMedia) return;
        try { SYSTEM_MQ = window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) { SYSTEM_MQ = null; }
        if (!SYSTEM_MQ) return;
        SYSTEM_MQ_HANDLER = function () {
          // With the service present it emits theme/change itself — let that
          // path own the switch so the two never race.
          if (themeSnapshot()) return;
          if (BG_STATE.pref !== 'system') return;
          themeAdoptScheme(systemScheme(), true);
        };
        try {
          if (SYSTEM_MQ.addEventListener) SYSTEM_MQ.addEventListener('change', SYSTEM_MQ_HANDLER);
          else if (SYSTEM_MQ.addListener) SYSTEM_MQ.addListener(SYSTEM_MQ_HANDLER);
        } catch (e) {}
      }

      function bgApplyMode() {
        var on = BG_STATE.anim;
        // The UI palette follows the chosen COLOUR PAIR, never the field switch.
        // It used to be read off the drawn field (null once that was off), so
        // switching the animation off in 主白 + 绿 tore the light layer off the
        // page and left the dark palette behind — the report "关闭后会切换为主黑+绿".
        // The pair is its own state (BG_STATE.scheme) and survives the switch,
        // which is also why the pair buttons are a radio group that can never
        // end up with nothing selected.
        var ui = BG_MODES[BG_STATE.scheme] || BG_MODES.dark;
        if (on) body.classList.add('mar-bg-on'); else body.classList.remove('mar-bg-on');
        // no veil any more (see BG_MODES): the field runs through the chrome
        body.classList.remove('mar-bg-veil');
        if (ui.light) body.classList.add('mar-bg-light'); else body.classList.remove('mar-bg-light');
        body.style.setProperty('--mar-bg-field', ui.field);
        //  The accent is re-applied here, AFTER the light class moved: which
        //  variable carries the accent as TEXT depends on the plate, and this is
        //  the one place both sides of that decision are already in hand.
        accentApply();
        //  …and the alias map with it. It does not change with the plate (the
        //  values are var(--mar-*)), but this is the one call site that runs on
        //  mount AND on every plate switch, and re-asserting costs nothing.
        themeAliasApply();
        if (bgCanvas) bgCanvas.style.display = on ? 'block' : 'none';
        bgMarkClear(!on);
        if (!on) { bgStop(); return; }
        bgResize();
        bgDraw(bgElapsed);
        bgStart();
      }

      // ---- colour-pair switch: the settings mosaic over the palette --------
      // The stylesheet block above explains why it is built this way. This half
      // builds the frames and drives one view transition:
      //   · the tile order and the 3-tile head are the PANEL mosaic's own
      //     constants (mosaicOrder / MOSAIC_GRID / MOSAIC_HEAD), and the total
      //     length is the panel's own 0.341s (MOSAIC_PANEL_TOTAL), so the two
      //     reveals end on the same beat;
      //   · the tile count depends on the tile size and the viewport, so the
      //     frames are generated per click into <style id="mar-vt-frames"> and
      //     thrown away with the transition — nothing is left on the page.
      var vtPouring = false;
      var vtStyle = null;

      //   Degrade to a plain switch, never to a broken one: no View Transitions, no
      //   clip-path:path(), reduced motion, or a hidden document. The hidden-document
      //   gate is load-bearing on the Desktop: Chromium ABORTS a view transition when
      //   the document is not visible and rejects `ready` with InvalidStateError
      //   (measured with the window occluded: finished landed at +31ms with no
      //   animation at all), so pouring there would build the whole thing and paint
      //   nothing. A Desktop window is occluded far more easily than a browser tab.
      function vtPourReady() {
        return typeof doc.startViewTransition === 'function' &&
          typeof window.CSS !== 'undefined' &&
          typeof window.CSS.supports === 'function' &&
          window.CSS.supports('clip-path', "path('M0 0H10V10H0Z')") &&
          !reducedMotion() &&
          doc.visibilityState !== 'hidden';
      }

      //   A TILE IS THE SETTINGS PANEL'S OWN TILE. The panel measures 800x800
      //   and splits it MOSAIC_GRID ways, so its tiles are 800 / 5 = 160px, and
      //   the window pour uses the same side (2026-10-02: "方块太大了…与设置里
      //   的方块大小接近或一致，我能够接受边框位置显示不完整"). It used to be
      //   derived from the viewport (min(vw,vh) / MOSAIC_GRID, matching the web
      //   build), which pours 190.4px tiles on a 1600x952 window — the "too big"
      //   this fixes. ceil() keeps the grid covering the viewport, so the last
      //   column/row simply runs past the edge and is clipped — that is the
      //   accepted incomplete border, not a bug.
      //   MOSAIC_TILE is the ONE knob for the pour's tile size, in CSS px.
      //   160 = the settings panel's own tile; 80 = half of it both ways
      //   (2026-10-02: "要长宽都缩小一半"). The tile size changes the tile COUNT
      //   (1600x952 gives 20 x 12 = 240 tiles at 80px) but NOT the pour's length,
      //   which is pinned to the panel's own 0.341s — see MOSAIC_PANEL_TOTAL
      //   below. Smaller tiles therefore mean more tiles turning per frame, not a
      //   longer reveal.
      var MOSAIC_TILE = 80;
      function vtGrid(vw, vh) {
        var side = MOSAIC_TILE;
        return {
          side: side,
          cols: Math.max(1, Math.ceil(vw / side)),
          rows: Math.max(1, Math.ceil(vh / side))
        };
      }

      //   SUBPATHS ARE EMITTED IN REVEAL ORDER, NOT IN TILE-INDEX ORDER.
      //   Emitting them row-major (tile 0, 1, 2, ...) made the geometry the only
      //   thing the order could be read from, and the measured consequence was a
      //   TOP-LEFT SKEW under exactly the truncation this function exists to avoid:
      //   the clipped region stopped after ~18 subpaths, and since those were the
      //   first eighteen tiles of a row-major grid, the reveal was confined to
      //   cols 0-5 x rows 0-2 at every moment including the 100% frame — "只有左上角
      //   的这个区域会有方块动画，时间一到，全局就改变颜色". With the subpaths in
      //   `order` (mosaicOrder's shuffle), any partial application cuts the
      //   LAST-turned tiles instead, and the revealed set stays spatially uniform.
      //   The web build still emits row-major with degenerate zero-area paths for
      //   the unturned tiles; the REVEALED SET at any frame is identical either
      //   way (the first liveCount entries of the same mosaicOrder shuffle), so
      //   this divergence from the web is invisible and deliberate — it is the
      //   belt against the Desktop-only truncation above.
      //   A tile keeps its own rectangle, grown by 1px so neighbours overlap (no
      //   hairline seam).
      //
      //   g.scale: THE PATH IS EATEN IN DEVICE PIXELS ON THE DESKTOP WINDOW.
      //   Measured 2026-10-02 on the real shell (maximized, 1600x952 CSS
      //   viewport, devicePixelRatio = 2): with CSS-px coordinates the clip only
      //   ever covered the top-left ~857x476 CSS px — the whole grid rendered at
      //   half size inside that rectangle ("切换动画会先在左上角大约横向9个方块，
      //   纵向5个方块的区域进行") and everything outside it snapped when the
      //   transition finished. Scaling every emitted coordinate by dpr makes the
      //   path cover the viewport again (pour #2 of that measurement, same
      //   window). At dpr 1 — the web build and any non-HiDPI screen — the scale
      //   is 1 and this is a no-op. Read it per pour, not once: the window can
      //   move between monitors with different scale factors.
      function vtClipFor(order, liveCount, g) {
        var S = g.scale || 1;
        var out = [];
        for (var i = 0; i < liveCount; i++) {
          var t = order[i];
          var c = t % g.cols, r = Math.floor(t / g.cols);
          var x0 = Math.round(c * g.side * S) - 1;
          var x1 = Math.round((c + 1) * g.side * S) + 1;
          var y0 = Math.round(r * g.side * S) - 1;
          var y1 = Math.round((r + 1) * g.side * S) + 1;
          out.push('M' + x0 + ' ' + y0 + 'H' + x1 + 'V' + y1 + 'H' + x0 + 'Z');
        }
        //   MOSAIC_HEAD tiles are always live, so this is belt — but an empty
        //   path() is invalid and would drop the whole clip.
        if (!out.length) return "path('M0 0H0V0H0Z')";
        return "path('" + out.join(' ') + "')";
      }

      //   THE POUR LASTS EXACTLY AS LONG AS THE SETTINGS PANEL'S OWN MOSAIC.
      //   The panel fires MOSAIC_HEAD tiles on the first frame and then one every
      //   MOSAIC_STEP, so its 25 tiles take (25 - 3) * 0.0155 = 0.341s. The pour
      //   is asked for the same TOTAL (2026-10-02: "总时长需要与设置页面的动画
      //   时长一致"), which the 80px grid cannot do one-tile-per-beat: a 1600x952
      //   window has 240 tiles, and 240 beats of 15.5ms is 3.7s.
      //   So the frame count is what is fixed here, not the beat: 0.341s at 60Hz
      //   is ~20 frames, and the tiles are dealt out evenly across them — about
      //   13 tiles per frame on that window. SEVERAL TILES THEREFORE TURN ON THE
      //   SAME FRAME; that is the only way to hold both the size and the length.
      //   (Spreading the same 240 tiles across 240 stops inside 0.341s was the
      //   alternative — 1.4ms per stop, i.e. ~12 stops per frame. It renders
      //   IDENTICALLY, because steps(1,end) paints the last stop of each frame,
      //   but it ships ~12x the CSS for nothing: this build is ~72KB of frames,
      //   that one would be ~850KB. Grouped stops it is.)
      //   The panel's own total is DERIVED ON EVERY READ rather than cached in a
      //   `var` here: MOSAIC_GRID / MOSAIC_HEAD / MOSAIC_STEP belong to the panel
      //   mosaic and are declared further down this same scope, so a `var`
      //   evaluated at this point reads `undefined` — hoisting gives undefined
      //   rather than a ReferenceError, and the NaN that follows builds an EMPTY
      //   @keyframes rule. Measured 2026-10-02: 0 bytes of frames in the page,
      //   the pour degraded to a plain cross-fade, and no tile ever appeared.
      var MOSAIC_FPS = 60;
      function vtPanelTotal() {
        return (MOSAIC_GRID * MOSAIC_GRID - MOSAIC_HEAD) * MOSAIC_STEP;
      }

      //   The stop count is the frame budget — one stop per paintable frame, and
      //   never more stops than there are tiles to turn.
      function vtStops(total) {
        var frames = Math.round(vtPanelTotal() * MOSAIC_FPS);
        return Math.max(2, Math.min(frames, total - MOSAIC_HEAD + 1));
      }

      //   The panel mosaic fires MOSAIC_HEAD tiles on the first frame (so the
      //   reveal never starts from an empty screen) and then deals the rest out
      //   evenly over the remaining stops; the last stop is clamped to `total`, so
      //   the grid is always fully revealed before the transition ends.
      //   `steps(1,end)` per stop is what makes a tile arrive WHOLE: without it the
      //   path interpolates and every square visibly grows out of its own corner.
      function vtBuildFrames(g) {
        var total = g.cols * g.rows;
        var order = mosaicOrder(total);
        var stops = vtStops(total);
        var per = Math.ceil((total - MOSAIC_HEAD) / (stops - 1));
        var css = '@keyframes mar-vt-mosaic{';
        for (var i = 0; i < stops; i++) {
          var live = Math.min(total, MOSAIC_HEAD + i * per);
          //   Full precision on purpose: with toFixed(4) a stop can land a hair PAST
          //   its own beat, and a clock sampling exactly on the beat reads the
          //   previous frame.
          css += ((i * 100) / (stops - 1)) + '%{clip-path:' +
            vtClipFor(order, live, g) +
            ';animation-timing-function:steps(1,end);}';
        }
        return css + '}';
      }

      //   The reveal's length is the PANEL's length, full stop — see the note on
      //   MOSAIC_PANEL_TOTAL. It used to follow the tile count (one MOSAIC_STEP
      //   each), which is what made an 80px grid take 3.7s.
      function vtDuration() {
        return vtPanelTotal();
      }

      function vtPourFinish() {
        vtPouring = false;
        var root = doc.documentElement;
        if (root) {
          root.classList.remove('mar-vt-on');
          root.style.removeProperty('--mar-vt-dur');
        }
        if (vtStyle && vtStyle.parentNode) vtStyle.parentNode.removeChild(vtStyle);
      }

      //   apply() is the state change itself (bgApplyMode), handed in so this
      //   wrapper never has to know what is being switched.
      //
      //   WHY THIS IS A VIEW TRANSITION AND NOT A DOM TILE LAYER.
      //   A layer of flat tiles CANNOT reproduce what this effect is: the tiles have
      //   to carry the page's CONTENT, and only the view transition's new snapshot
      //   does (::view-transition-new(root) is the whole new page, clipped by the
      //   mosaic). A DOM layer of solid squares can only blank the screen with one
      //   colour and then punch holes in it, which reads as the opposite effect —
      //   measured against the web build, whose squares are new-palette content
      //   appearing one by one OVER the old page ("你的客户端方块是纯色的，网页版的
      //   是有内容的"). So the layer was removed again.
      //
      //   The earlier conclusion that this shell does not repaint a clipped
      //   pseudo-element was WRONG, and the mistake is worth recording: the build it
      //   was measured on had 190px stretched tiles and 42 beats squeezed into 0.341s
      //   (8.1ms each, about two tiles per 60Hz frame), so the reveal genuinely did
      //   look like "everything changes at once" — and the diagnostic that "proved"
      //   it did not repaint was reading the clip's COMPUTED value, which steps
      //   correctly either way. With the window visible the transition runs its full
      //   length (measured: ready +95ms, finished +1241ms on a 1s pour) and the
      //   screen does follow it. Never diagnose this from computed style again.
      function vtPour(apply) {
        //   A second click while the first pour is still running switches
        //   immediately instead of queueing: startViewTransition() during a live
        //   transition is skipped anyway, and the state must never lag behind the
        //   button. Tearing the previous pour down here rather than on a wall-clock
        //   timer is also what keeps the flag from wedging if finished never settles.
        if (vtPouring) vtPourFinish();
        if (!vtPourReady()) { apply(); return; }
        var root = doc.documentElement;
        var vw = root.clientWidth || window.innerWidth || 0;
        var vh = root.clientHeight || window.innerHeight || 0;
        if (!vw || !vh) { apply(); return; }
        var g = vtGrid(vw, vh);
        // The clip path is eaten in device pixels on this window — see
        // vtClipFor. Read the ratio per pour: it changes when the window moves
        // to a monitor with a different scale factor.
        g.scale = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        var dur = vtDuration();
        if (!vtStyle) { vtStyle = doc.createElement('style'); vtStyle.id = 'mar-vt-frames'; }
        vtStyle.textContent = vtBuildFrames(g);
        if (!vtStyle.parentNode) doc.head.appendChild(vtStyle);
        root.style.setProperty('--mar-vt-dur', dur + 's');
        //   The class has to be on BEFORE the transition starts: the snapshot
        //   pseudo-elements resolve their styles once, at creation.
        root.classList.add('mar-vt-on');
        vtPouring = true;
        var tx = null;
        try { tx = doc.startViewTransition(apply); }
        catch (e) { vtPourFinish(); apply(); return; }
        //   `ready` REJECTS on every abort (InvalidStateError) and nothing would
        //   handle it otherwise; vtPourReady() refuses a hidden document, this is the
        //   belt for every other abort reason. `finished` is handled below.
        if (tx && tx.ready && typeof tx.ready.then === 'function') {
          tx.ready.then(null, function () {});
        }
        if (tx && tx.finished && typeof tx.finished.then === 'function') {
          tx.finished.then(vtPourFinish, vtPourFinish);
        } else {
          vtPourFinish();
        }
        //   No wall-clock fallback: the reveal runs on the animation clock and the
        //   timer would run on the wall clock, so stopping one without the other
        //   truncates the reveal mid-way (measured 2026-09-21: the `dur + 1s` timer
        //   fired with only 3 of 45 tiles turned, dropped mar-vt-on, and let the UA
        //   cross-fade take every square that had not turned yet). The re-entry
        //   teardown at the top of this function covers the case it was there for.
      }

      function bgOnResize() {
        if (bgResizeTimer) clearTimeout(bgResizeTimer);
        bgResizeTimer = setTimeout(function () {
          bgResizeTimer = null;
          bgResize();
          bgDraw(bgElapsed);
        }, 120);
      }
      function bgOnVisibility() {
        if (doc.hidden) bgStop();
        else bgStart();
      }

      function bgMount() {
        if (bgMounted) return;
        bgMounted = true;
        bgCanvas = doc.createElement('canvas');
        bgCanvas.id = 'mar-ascii-bg';
        bgCanvas.setAttribute('aria-hidden', 'true');
        // Geometry is pinned INLINE as well as in the stylesheet rule above.
        // If the sheet is withdrawn while the node survives -- DSH's `styles`
        // service drops a plugin's sheet on unload, and a dispose that throws
        // before bgTeardown() leaves the canvas behind -- the canvas would fall
        // back to its width/height ATTRIBUTES (innerWidth*dpr) and become an
        // in-flow block the size of the viewport, pushing #root completely
        // off-screen. Measured: #root rect top 0 -> 952, scrollHeight 952 ->
        // 1904, and elementFromPoint at the centre returned the canvas -- i.e.
        // the animated field "swallowing the whole UI", restart-only to fix.
        // Inline geometry cannot be withdrawn with a stylesheet, so the worst
        // case degrades to "an unthemed page with a full-screen backdrop".
        bgCanvas.style.cssText =
          'position:fixed;left:0;top:0;width:100%;height:100%;display:block;' +
          'z-index:0;pointer-events:none;';
        if (body.firstChild) body.insertBefore(bgCanvas, body.firstChild);
        else body.appendChild(bgCanvas);
        bgCtx = null;
        try {
          bgCtx = bgCanvas.getContext ? bgCanvas.getContext('2d', { alpha: true }) : null;
        } catch (e) { bgCtx = null; }   // jsdom / CSP: no 2d context, field stays empty
        if (typeof window !== 'undefined' && window.addEventListener) {
          window.addEventListener('resize', bgOnResize, { passive: true });
          doc.addEventListener('visibilitychange', bgOnVisibility);
        }
        // DSH 是唯一数据源：先把当前的偏好 / 解析后的浅深接过来，再画第一帧。
        themeAdopt(false);
        bgApplyMode();
        // 服务与 presenter 可能比插件晚落地（桌面端冷启动实测过），补几次
        // "只读对齐" —— themeAdopt 只在偏好或解析结果真的变了时才动。
        systemWatch();
        // presenter 的两次投影（html 的 theme-source / body 的 dark 属性）就是
        // 现成的通知通道：通用设置一改，这里立刻跟着换底盘并播动画，不依赖
        // theme 服务是否已经在 ctx 上可见。
        themeDomWatch();
        if (typeof setTimeout === 'function') {
          setTimeout(function () { themeAdopt(false); }, 0);
          setTimeout(function () { themeAdopt(false); }, 400);
          setTimeout(function () { themeAdopt(false); }, 1500);
        }
        bgWatch();
      }

      function bgTeardown() {
        bgStop();
        if (bgResizeTimer) { clearTimeout(bgResizeTimer); bgResizeTimer = null; }
        if (typeof window !== 'undefined' && window.removeEventListener) {
          window.removeEventListener('resize', bgOnResize);
          doc.removeEventListener('visibilitychange', bgOnVisibility);
        }
        if (bgObserver) { try { bgObserver.disconnect(); } catch (e) {} bgObserver = null; }
        if (bgKickRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(bgKickRaf);
        bgKickRaf = 0;
        bgKickFullAt = 0;
        bgMarkClear(true);
        bgCleared = [];
        body.classList.remove('mar-bg-on', 'mar-bg-veil', 'mar-bg-light');
        body.style.removeProperty('--mar-bg-field');
        body.style.removeProperty('--mar-bg-veil-a');
        body.style.removeProperty('--mar-bg-veil-rgb');   // 旧版本留下的变量，顺手清掉
        //  配色也走 inline 变量，dispose 时必须一并摘掉，否则主题卸了、
        //  强调色还留在 <body> 上（下一份主题会继承一个不属于它的颜色）。
        body.style.removeProperty('--mar-accent');
        body.style.removeProperty('--mar-accent-ink');
        body.style.removeProperty('--mar-solid-ink');
        body.style.removeProperty('--mar-accent-text');
        body.style.removeProperty('--mar-wash-accent');
        //  …and the projected alias map: an unthemed page must not keep DSH
        //  aliases pointing at variables that are about to disappear.
        for (var tName in MAR_TOKEN_MAP) {
          if (Object.prototype.hasOwnProperty.call(MAR_TOKEN_MAP, tName)) {
            body.style.removeProperty(tName);
          }
        }
        if (bgCanvas && bgCanvas.parentNode) bgCanvas.parentNode.removeChild(bgCanvas);
        bgCanvas = null;
        bgCtx = null;
        bgMounted = false;
      }

      // ---- task-completion animation --------------------------------------
      // 触发、挂载与拆卸。四拍动画本身在 src/boot/engine-done.js（与启动动画
      // 同一— payload 契约），这里只管"什么时候放、放完怎么—
//
      // 触发信号— *唯一权威— *：`@deepseek-ai/dsh-client-runtime`
// `sessions.list`（SessionListState）里当前会话— `running`
// 应用自己的回合状态标签、停止按钮、侧栏那— 跑完— 的绿点读的都
// 这一份快照，所以不去监— spinner 或类名：那些带构建哈希、不是契约，
      // 而且"出现了一— spinner"— 一个回合开始了"并不是同一件事
//
      // 只认边沿，不认电平。一个回合进行中快照会以每秒几十次的频率推送，
      // 只有 true — false 的跳变才播；每个会话**第一个可读到的值记为基线并
      // 静默**，所— 切进一个已经在跑的会话"不会误报"任务完成"
//
      // 用户主动中断不播：那一轮收尾的 assistant 节点在客户端
      // ConversationSnapshot 上带 `interrupted: true`（界面上那枚"已停— 
      // 标记的来源），失败收尾是 `turn-error` 节点 —— 两种都不— 任务完成"
// 判据只看**倒数第一— * assistant / turn-error 节点：一轮中— steering
      // 会留下一— interrupted 的中间步，但那一轮的最后一步是正常收尾的，
      // 那种情况照样要播
var DONE_STORE_KEY = 'mar.done.v1';
      var DONE_TEXT_DEFAULT = '//RUN_COMPLETE';

      function doneLoad() {
        try {
          var raw = (typeof window !== 'undefined' && window.localStorage)
            ? window.localStorage.getItem(DONE_STORE_KEY) : null;
          if (!raw) return { on: true, text: DONE_TEXT_DEFAULT };
          var parsed = JSON.parse(raw);
          return {
            on: !(parsed && parsed.on === false),
            text: (parsed && typeof parsed.text === 'string' && parsed.text.length)
              ? parsed.text : DONE_TEXT_DEFAULT
          };
        } catch (e) { return { on: true, text: DONE_TEXT_DEFAULT }; }
      }
      function doneSave() {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(DONE_STORE_KEY, JSON.stringify(DONE_STATE));
          }
        } catch (e) {}
      }
      var DONE_STATE = doneLoad();
      function doneEnabled() { return DONE_STATE.on !== false; }

      // 尊重系统「减少动态效果」：整段跳过（这一拍没有静态形态可言，半成品
      // 比不放更糟）。开关关掉时同样— 零开销"：不订阅、不建节点、不留定时器
function marDoneReduced() {
        return !!(typeof window !== 'undefined' && window.matchMedia &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      }

      var doneCleanup = null;

      function buildDone() {
        if (doneCleanup) return true;
        if (!DONE_PAYLOAD) return false;
        if (marDoneReduced()) return false;
        // 覆盖层几何与裁剪同样钉一份内联：宿主自己会给 #root 里的元素做巨
// 缩放（HUI 框实— 19558x8778px），这一层必须永远是一— viewport 大小
        // 的裁剪盒，不能变成一个巨型滚动区。pointer-events 始终— none —
// 关闭由引擎在 document 捕获阶段承担（见 engine-done.js）
var host = doc.createElement('div');
        host.id = 'dshMarDoneHost';
        host.style.cssText =
          'position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147482900;' +
          'background:transparent;overflow:hidden;pointer-events:none;';
        var st = doc.createElement('style');
        st.setAttribute('data-done', '1');
        st.textContent = DONE_PAYLOAD.css;
        host.appendChild(st);
        var tmp = doc.createElement('div');
        tmp.innerHTML = DONE_PAYLOAD.html;
        while (tmp.firstChild) host.appendChild(tmp.firstChild);
        body.appendChild(host);

        var removed = false;
        function teardown() {
          if (removed) return;
          removed = true;
          try { if (window.__mbDone) window.__mbDone.stop(); } catch (e) {}
          window.__mbDoneFinish = null;
          if (host.parentNode) host.parentNode.removeChild(host);
          doneCleanup = null;
        }
        // 引擎在用户按下、淡— 180ms 之后回调这里 —— 由它把整层摘掉
window.__mbDoneFinish = teardown;

        var script = doc.createElement('script');
        script.textContent = DONE_PAYLOAD.engine;
        host.appendChild(script);

        // 引擎— CSP 之类拦掉了：立刻摘掉，别留一个空壳（与启动覆盖层
// `ran` 判定同一口径）
if (!window.__mbDone) {
          teardown();
          return false;
        }
        doneCleanup = teardown;
        return true;
      }

      // 返回 'ok' | 'off' | 'reduced' | 'unavailable' —— 设置页用它把
      // "按钮点了没反应"翻译成一句人话。
      function playDone(force) {
        if (!force && !doneEnabled()) return 'off';
        if (marDoneReduced()) return 'reduced';
        if (!buildDone()) return 'unavailable';
        try {
          window.__mbDone.start({ text: DONE_STATE.text });
        } catch (e) {
          if (doneCleanup) doneCleanup();
          return 'unavailable';
        }
        return 'ok';
      }
      function stopDone() { if (doneCleanup) doneCleanup(); }

      var doneSessions = null;
      var donePrev = {};        // sessionId -> 上一次读到的 running（列表快照）
      var doneUnsub = null;
      var donePending = null;   // 结算延迟的定时器
      var donePokeTimer = null; // 等 sessions 服务的补挂定时器
      var donePokeLeft = 0;
      var doneDomTimer = null;  // 纯 DOM 判据的轮询
var doneDomObserver = null;
      var doneWrapped = {};     // sessionId -> 已经包过 cancel() 的那个会话面实例
      var doneStopped = {};     // sessionId -> 本轮里用户按过停
var doneFaceUnsub = null; // 正在显示的那个会话面（ConversationSnapshot）的订阅
      var doneFaceId = null;
      var doneTurnSeen = {};    // sessionId -> 最近读到的"已完成轮次"编号（单调）
      var doneFaceRun = {};     // sessionId -> 会话面上一次读到的 running
      var doneLast = null;      // { why } 最近一次判定的结果 —— 写进设置页那行小
// 四个判据各自的实况（诊断用）：列表推送次— / 面推送次— / 门控次数 /
      // 回合尾巴节点— / 回合指示器的最后状— / 最近几— 结束"是哪个判据发现的
      var listPublishes = 0, facePublishes = 0, faceEdges = 0;
      var domTailSeen = null, domStatusSeen = null, domHits = 0, domRenders = 0;
      var domLastScope = null, domLastTail = null;  // 同一个转录的身份（挂载/切会话会换）
      var domScopeNow = null;
      var domScopeSession = void 0;  // 转录基线建立时的"当前会话" id（切会话就换转录）
      // 回合尾巴判据的门：先看见"回合进行中"（`_turnStatus` 出现）才算数。
      // 转录挂载历史时从没见过 running，于是绝不会把"铺历史"当成"刚结束一轮" ——
      // 用户 2026-10-10：启动动画之后自己播了一次、切回旧会话又重复播。
      var domTurnOpen = false;
      var lastEnds = [];
      var doneLogged = false;

      // ---- 会话面：现取，绝不缓— -----------------------------------------
      // DSH 的客户端服务是各插件自己 register 的，激活顺序不保证 —— 用户
      // 2026-10-10 实测"预览能播、真触发不播"，根因就— apply() 那一
// ctx.get('sessions') 还是空的：只取一次，订阅就再也不会挂上（预览
// 需要服务，所以照样能播）
function doneGet() {
        try { return (ctx && typeof ctx.get === 'function') ? ctx.get('sessions') : null; }
        catch (e) { return null; }
      }

      function installDone(sessions) {
        // 这个构建的客户端 sessions 服务面没有 list（只有 binding / scope / retain），
        // 所以不能再要求 list.subscribe；list 有就顺带订阅。
        if (!sessions) return false;
        if (typeof sessions.binding !== 'function' &&
            !(sessions.list && typeof sessions.list.subscribe === 'function')) return false;
        if (doneUnsub && doneSessions === sessions) return true;
        if (doneUnsub) { try { doneUnsub(); } catch (e) {} doneUnsub = null; }
        doneSessions = sessions;
        donePrev = {};
        doneStopped = {};
        doneTurnSeen = {};
        doneFaceRun = {};
        doneLast = null;
        lastEnds = [];
        listPublishes = 0;
        facePublishes = 0;
        faceEdges = 0;
        domTailSeen = null;
        domStatusSeen = null;
        domRenders = 0;
        domTurnOpen = false;
        domLastScope = null;
        domLastTail = null;
        if (sessions.list && typeof sessions.list.subscribe === 'function') {
          doneUnsub = sessions.list.subscribe(doneOnList);
          // 立刻读一次：把"打开页面时已经在跑的那个会话"记成基线而不是跳变
          doneOnList();
        }
        syncDoneState();
        return true;
      }

      // 补挂：现取一次，拿不到就— 400ms 再问一次（最— budget 次）
function pokeDone(budget) {
        if (installDone(doneGet())) { stopPoke(); return; }
        if (budget) donePokeLeft = budget;
        if (donePokeLeft <= 0 || donePokeTimer) return;
        donePokeLeft--;
        donePokeTimer = setTimeout(function () {
          donePokeTimer = null;
          pokeDone();
        }, 400);
      }
      function stopPoke() {
        if (donePokeTimer) { clearTimeout(donePokeTimer); donePokeTimer = null; }
      }

      // 首— ctx.inject：它会在服务就绪时回调（宿主半边— webServer 用的就是
      // 同一个写法）。它不保证一定回调（老宿— / 依赖名不同），所以同时保
// "现取 + 补挂"那条— —— 两条一起走
function attachDone() {
        try {
          if (ctx && typeof ctx.inject === 'function') {
            ctx.inject(['sessions'], function (sctx) {
              var s = null;
              try {
                s = (sctx && sctx.sessions) ||
                    (sctx && typeof sctx.get === 'function' ? sctx.get('sessions') : null);
              } catch (e) { s = null; }
              installDone(s);
            });
          }
        } catch (e) { /* 老宿主没有 inject：走补挂 */ }
        pokeDone(75);   // ≈30s
        // — DOM 的两条判据并行跑（不依赖任何服务
doneWatchDom();
        // 12s 后打一行实况到 console：桌面端 DevTools 里能直接读到触发链的状
if (!doneLogged) {
          doneLogged = true;
          setTimeout(function () { doneLog(doneStateText()); }, 12000);
        }
        return !!doneUnsub;
      }

      // ---- 用户按过停止吗？ -------------------------------------------------
      // DSH 的停止按钮调会话面上— cancel()（ISession 上唯一的取消动词）。就
// 包一层记一— —— 直取用户意图，比读收尾节点上— `interrupted` 标记
// （后者是 projection 的产物，而且 ConversationSnapshot.nodes 未必带它）
// 包装幂等，并且按**实例**记：会话面被重建时会重包
function doneWrapCancel(id) {
        if (!doneSessions || !id) return;
        var face = null;
        try {
          var b = doneSessions.binding(id);
          face = b && b.session;
        } catch (e) { face = null; }
        if (!face || typeof face.cancel !== 'function') return;
        if (doneWrapped[id] === face) return;
        var orig = face.cancel;
        try {
          face.cancel = function () {
            // **只有这一轮真的在跑时按下— 停止"才算— *：有些收尾路径也会调
            // cancel，那种情况下— doneStopped 记上会把"正常完成"一起吞掉
if (doneRunning(id)) doneStopped[id] = true;
            return orig.apply(this, arguments);
          };
          doneWrapped[id] = face;
        } catch (e) { /* 冻结对象：那就只靠下面那两条快照判据 */ }
      }

      // ---- "刚刚结束了一— 的判— ------------------------------------------
      // **不再只看 running 的边— *（那是上一版的判据，短任务会翻车：一轮可能在两次
      // 快照推送之间就— true→false 走完，快照批量推送时就更看不到了 —— 用户
      // 2026-10-10 怀— 任务时间太短"，正是这个）。改成看会话快照里那— *单调计数— *
// ConversationSnapshot.turnEnds — Map<轮次—  seq>，每结束一轮就多一项；
      // 只要它涨了，就说— 刚结束了一— ，中间态有没有被看到都不影响
// 会话面（binding(id).session）才是权威的每会话视图：应用自己的回合状态标签读
// 就是它，— running 也在它上面
function doneTurnMark(snap) {
        var ends = snap && snap.turnEnds;
        var max = -1;
        if (ends && typeof ends.forEach === 'function') {
          ends.forEach(function (v, k) { if (k > max) max = k; });
        }
        return max;
      }

      function doneFaceOf(id) {
        if (!doneSessions || !id || typeof doneSessions.binding !== 'function') return null;
        try {
          var b = doneSessions.binding(id);
          return (b && b.session) || null;
        } catch (e) { return null; }
      }

      // 盯住"正在显示的那个会— ：它的快照一变就判一次；换会话时换订阅
function doneWatchFace(id) {
        if (!id) {
          if (doneFaceUnsub) { try { doneFaceUnsub(); } catch (e) {} }
          doneFaceUnsub = null; doneFaceId = null;
          return;
        }
        if (doneFaceId === id && doneFaceUnsub) return;
        var face = doneFaceOf(id);
        if (!face || typeof face.subscribe !== 'function') {
          // 这个会话还没 staged：不— doneFaceId，下一次列表推送再
if (doneFaceUnsub) { try { doneFaceUnsub(); } catch (e) {} doneFaceUnsub = null; }
          doneFaceId = null;
          return;
        }
        if (doneFaceUnsub) { try { doneFaceUnsub(); } catch (e) {} doneFaceUnsub = null; }
        try {
          doneFaceUnsub = face.subscribe(function () { doneOnFace(id); });
          doneFaceId = id;
        } catch (e) { doneFaceUnsub = null; doneFaceId = null; return; }
        doneOnFace(id);
      }

      function doneOnFace(id) {
        var face = doneFaceOf(id);
        if (!face || typeof face.getSnapshot !== 'function') return;
        var snap;
        try { snap = face.getSnapshot(); } catch (e) { return; }
        if (!snap) return;
        facePublishes++;
        var mark = doneTurnMark(snap);
        var running = snap.running === true;
        var prev = doneTurnSeen[id];
        var prevRun = doneFaceRun[id];
        doneFaceRun[id] = running;
        if (prev === undefined) { doneTurnSeen[id] = mark; return; }   // 基线：静
var why = null;
        if (mark > prev) { doneTurnSeen[id] = mark; why = 'turnEnds'; }
        else if (prevRun === true && running === false) why = 'faceEdge';
        if (running) {
          // 新一轮开跑了：把还没播完（或还没开播）的完成动画整段让位
          if (prevRun !== true) doneStopped[id] = false;   // 上一轮的"按过停止"不跨轮
          if (donePending) { clearTimeout(donePending); donePending = null; }
          if (doneCleanup) stopDone();
          if (!why) return;      // 只是又跑起来了，不是"刚结束了一轮" 
        }
        if (!why) return;
        faceEdges++;
        doneEndedRound(id, why);
      }

      // 四个判据最后都汇到这里：只有它决定"播不— 。四个判据互相独立，是为
// 不管宿主给出哪一路信号（计数— / 会话— / 列表 / DOM），都能发现"刚结束一—
      // 拿不到会话面时的中断判据：刚收尾的那一轮里若带"已中断 / 已停止"字样，
      // 就当用户中断/报错收尾不播（标签文案随语言，中英都认）。只取回合尾巴往上
      // 两层，不扫整页。
      function doneDomInterrupted() {
        try {
          var el = doc.querySelector('[data-turn-tail]');
          var scope = el ? (el.parentElement || el) : null;
          var txt = scope ? String(scope.textContent || '') : '';
          return /已中断|已停止|interrupted/i.test(txt);
        } catch (e) { return false; }
      }

      function doneEndedRound(id, why) {
        lastEnds.push({ id: id, why: why, at: Date.now() });
        if (lastEnds.length > 8) lastEnds.shift();
        if (id) {
          if (id !== doneCurrentId()) { doneNote('刚结束的那轮不在当前显示的会话里（' + why + '）'); return; }
          if (doneTurnBad(id)) { doneNote('那轮是停止 / 中断 / 报错收尾（' + why + '）'); return; }
        } else if (why === 'turnTail' || why === 'turnStatus') {
          if (doneDomInterrupted()) { doneNote('那轮是中断收尾（DOM 判据）'); return; }
        } else {
          doneNote('结束了，但拿不到会话 id');
          return;
        }
        doneSchedule(why);
      }

      // 最近一次判定的结果 —— 设置页那行小字会带上它，于是"为什么没— 永远看得见
// 同时往 console 打一行（桌面— DevTools 里能直接读）
function doneNote(why) {
        doneLast = { why: why, at: Date.now() };
        syncDoneState();
        doneLog(why);
      }
      function doneLog(msg) {
        try {
          if (typeof console !== 'undefined' && console && typeof console.info === 'function') {
            console.info('[theme-mls] 任务完成动画：' + msg);
          }
        } catch (e) {}
      }

      // 那一轮是不是"中断 / 报错"收尾的？三条判据，任一条命中都不播
//   — 本轮里用户按过停止（doneStopped）；
      //   — 收尾节点— turn-error
//   — 倒数第一— assistant 节点— interrupted— 已停— 标记的来源）
function doneTurnBad(sessionId) {
        if (!sessionId) return false;
        if (doneStopped[sessionId]) return true;
        var face = doneFaceOf(sessionId);
        if (!face || typeof face.getSnapshot !== 'function') return false;
        try {
          var snap = face.getSnapshot();
          var nodes = (snap && snap.nodes) || [];
          for (var i = nodes.length - 1; i >= 0; i--) {
            var n = nodes[i];
            if (!n) continue;
            if (n.kind === 'turn-error') return true;
            if (n.kind === 'assistant') return n.interrupted === true;
          }
        } catch (e) {}
        return false;
      }

      // 抽屉里那行小字：— 触发到底挂上没有、上一次为什么没— 变成可见的事实
// 用户 2026-10-10 遇到的就— 预览能播、真触发不播"，而当时页面上没有任何
      // 地方能看出订阅根本没挂上（后来又多了"短任— 这一种）
function doneStateText() {
        var head;
        if (!doneEnabled()) head = '已关闭';
        // 列表订阅挂上 ≠ 会话面也盯上了：两者失效的后果完全不同，不能报假绿灯。
        // 2026-10-11：这句原先只看 doneUnsub，于是 doneFaceId 为 null 时照样显示
        // "会话面已盯住"，把排查往"触发链没问题"的方向带偏了一整轮。
        else if (doneUnsub) head = doneFaceId
          ? '触发已就绪（会话快照订阅 + 会话面已盯住）'
          : '触发已就绪（会话快照订阅）；会话面未订上 —— 当前会话认不出来';
        else if (doneDomTimer) head = '触发已就绪（回合收尾 DOM 判据：data-turn-tail / turnStatus）';
        else head = '触发未就绪：等待 sessions 服务…';
        return doneLast && doneLast.why ? head + ' · 最近：' + doneLast.why : head;
      }
      function syncDoneState() {
        try {
          var el = doc.getElementById('mar-done-state');
          if (el) el.textContent = doneStateText();
        } catch (e) {}
      }

      // "客户端正在显示的那个会话"是哪个？
      //
      // **不能读 `snap.current` —— 这个字段不存在。** 宿主 0.2.0-rc.2 的列表快照
      // （`@deepseek-ai/dsh-api-session-controller` 的 `createSnapshotStore`）只有
      // `ids` / `byId` / `phase` / `projectionsBySession` 四项。原先那句
      // `(snap && snap.current) ? ... : null` 于是在这版宿主上**恒为 null**，而调用
      // 方有三处依赖它 —— 会话面 `doneWatchFace(current)` 从不执行、列表的下降沿被
      // `if (!current || id !== current) continue` 全数吞掉、`doneWrapCancel()` 也
      // 从不包装。结果：动画一次都播不出来，而设置页那行小字还写着"会话面已盯住"。
      //
      // 正确的求法与宿主自己一致：当前会话是 `byId` 里 `retainedBy.mainView > 0`
      // 的那一个 —— DSH 客户端自己就有 8 处这么写（`dsh-client-ui-layout` 拿它做
      // 窗口标题、`dsh-client-ui-workspace` 拿它当 mainSessionId，等等）。保留
      // `snap.current` 只是为兼容真给了这个字段的老宿主。
      function doneCurrentId() {
        try {
          var snap = doneSessions && doneSessions.list && doneSessions.list.getSnapshot();
          if (!snap) return null;
          if (snap.current) return String(snap.current);
          var rows = snap.byId || {};
          for (var key in rows) {
            var row = rows[key];
            if (row && row.retainedBy && row.retainedBy.mainView > 0) return String(key);
          }
          return null;
        } catch (e) { return null; }
      }
      // "还在跑吗"：以**会话— *上的 running 为准（应用自己的回合状态标签读的就
// 它），列表快照只作兜— —— 两处不一致时以会话面为准
function doneRunning(id) {
        if (!id) return false;
        var face = doneFaceOf(id);
        if (face && typeof face.getSnapshot === 'function') {
          try {
            var s = face.getSnapshot();
            if (s && typeof s.running === 'boolean') return s.running === true;
          } catch (e) {}
        }
        if (!doneSessions || !doneSessions.list) return false;
        try {
          var snap = doneSessions.list.getSnapshot();
          var row = snap && snap.byId ? snap.byId[id] : null;
          return !!(row && row.running === true);
        } catch (e) { return false; }
      }

      // 一轮结束后立刻又接上下一轮（队列输入、连续追问）的情况不少，那一拍不该先
      // 铺一整屏再被下一轮打— —— 等一小会儿再确认一次：还在跑就整个不播
// 已经在等的时— *不重置计— *（两条判据可能都命中同一次结束，别把等待越推越后）
function doneSchedule(why) {
        if (donePending) return;
        donePending = setTimeout(function () {
          donePending = null;
          if (!doneEnabled()) { doneNote('开关已关闭'); return; }
          // 拿不到会话 id（这个构建没有 sessions.list）时 DOM 判据照样播，
          // 只跳过那些需要 id 的复查
          var id = doneCurrentId();
          if (id && doneRunning(id)) { doneNote('新一轮已经开跑，跳过（' + (why || '') + '）'); return; }
          if (id && doneTurnBad(id)) { doneNote('那轮是停止 / 中断 / 报错收尾（' + (why || '') + '）'); return; }
          if (doneCleanup) { doneNote('上一段还在播放，跳过'); return; }
          var res = playDone();
          doneNote(res === 'ok' ? '已播放（' + (why || '') + '）' :
                   res === 'off' ? '开关已关闭' :
                   res === 'reduced' ? '系统「减少动态效果」生效中' : '覆盖层不可用');
        }, 350);
      }

      function doneOnList() {
        if (!doneSessions || !doneSessions.list ||
            typeof doneSessions.list.getSnapshot !== 'function') return;
        var snap;
        try { snap = doneSessions.list.getSnapshot(); } catch (e) { return; }
        if (!snap) return;
        listPublishes++;
        var byId = snap.byId || {};
        var ids = snap.ids || [];
        // **别在这儿再读一次 `snap.current`：宿主没有这个字段**（详见 doneCurrentId()）。
        // 这里原先有一份独立副本，于是即便 doneCurrentId() 修好了，列表这条判据照样
        // 因为 current 恒为 null 而把下降沿全部跳过 —— 动画还是播不出来。
        var current = doneCurrentId();
        // 正在显示的会话：— 备好"用户按了停止"的监听（幂等，按实例记）
        //                 — 把会话面订阅指到它（"刚结束一— 的主判据
if (current) {
          doneWrapCancel(current);
          doneWatchFace(current);
        }
        var seen = {};
        for (var i = 0; i < ids.length; i++) {
          var id = String(ids[i]);
          seen[id] = true;
          var row = byId[id];
          if (!row) continue;
          var running = row.running === true;
          if (!(id in donePrev)) {
            donePrev[id] = running;   // 基线：静默（切进一个已经在跑的会话不误报）
            continue;
          }
          var was = donePrev[id];
          if (was === running) continue;
          donePrev[id] = running;
          if (running) {
            // 新一轮开始了：上一次的"按过停止"不再算数，并把还没播完（或还
// 开播）的完成动画整段让— —— 不能— 任务完成"压在正在跑的任务上面
doneStopped[id] = false;
            if (donePending) { clearTimeout(donePending); donePending = null; }
            if (doneCleanup) stopDone();
            continue;
          }
          // 列表这一路的兜底判据：只看客户端正在显示的那个会
if (!current || id !== current) continue;
          doneEndedRound(id, 'listEdge');
        }
        for (var k in donePrev) { if (!seen[k]) delete donePrev[k]; }
      }

      // ---- 第四、第五道判据：纯 DOM ------------------------------------------
      // 前三条都要宿主给出服— 快照；这两条只读页面，是"服务没就绪也能发现回合结— 
      // 的最后一道。两个锚点都在本主题自己的兼容面上：
      //   · `[data-turn-tail="<轮次>"]` —— 每轮收尾节点（计费纸条就是贴它上面的
//     — docs/COMPATIBILITY.md），**新增一个就是刚结束一— *
//   · `[class*="_turnStatus"]` —— 回合进行中指示器（本主题的样式表里就有它），
      //     它被移除 = 回合结束
// 只在"— 列表都没挂上"或者两条都拿不到时才真正起作用？不 —— 全部并行跑，
      // 因为它们的成本只是每 400ms 一— querySelector，而漏判的代价是整段没播
function doneCountTails() {
        try { return doc.querySelectorAll('[data-turn-tail]').length; } catch (e) { return 0; }
      }
      function doneStatusOn() {
        try { return !!doc.querySelector('[class*="_turnStatus"]'); } catch (e) { return false; }
      }
      // 转录（可能出现回合尾巴的那个容器）：首次挂载 / 切换会话 / 重绘会换掉它。
      function doneDomScope() {
        try {
          var el = doc.querySelector('[data-conversation-scroll]');
          if (el) return el;
          var t = doc.querySelector('[data-turn-tail]');
          return t ? (t.parentElement || t) : null;
        } catch (e) { return null; }
      }
      function doneLastTail() {
        try {
          var l = doc.querySelectorAll('[data-turn-tail]');
          return l.length ? l[l.length - 1] : null;
        } catch (e) { return null; }
      }
      // 只认"**同一个转录里**新追加了一个回合尾巴"。判据（2026-10-11 升级）：
      //   ① **容器**：转录容器还是同一个、还挂在文档里；
      //   ② **会话身份**：基线建立时的"当前会话" id 没变 —— 切会话一定换转录，
      //      用会话身份判最稳；
      //   ③ 容器认不出来时，退回"上次看到的尾巴还在文档里"这个更弱的判据。
      //
      // 为什么不继续用"只看尾巴节点 isConnected"那条老判据：对话区是**虚拟滚动**
      // （`dsh-client-ui-chat` 的 virtualizer），尾巴节点会被回收/重建，于是
      // `isConnected` 会无规律地翻假，整条兜底判据随之失灵。2026-10-11 实测：
      // `domRenders` 涨了 23 次而 `domHits` 恒为 0 —— 一次都没命中过。
      function doneSameTranscript() {
        var id = doneCurrentId();
        try {
          if (domLastScope && domLastScope === domScopeNow && domLastScope.isConnected === true) {
            if (domScopeSession === void 0) return true;   // 还没记过身份：先认
            return domScopeSession === id;
          }
        } catch (e) { /* 落到下面那条弱判据 */ }
        if (domLastTail) {
          try { return domLastTail.isConnected === true; } catch (e) { return false; }
        }
        return false;
      }
      function doneDomRebase() {
        domTailSeen = doneCountTails();
        domStatusSeen = doneStatusOn();
        domScopeNow = doneDomScope();
        domLastScope = domScopeNow;
        domLastTail = doneLastTail();
        domScopeSession = doneCurrentId();
      }
      function doneDomPoll() {
        var tails = doneCountTails();
        var on = doneStatusOn();
        domScopeNow = doneDomScope();
        var lastTail = doneLastTail();
        if (domTailSeen === null) { doneDomRebase(); return; }   // 基线：第一次只记录
        // "回合进行中"的上升沿开一次门（启动时已经在跑的那种不算，靠状态消失那条判据）
        if (on === true && domStatusSeen === false) domTurnOpen = true;
        var same = doneSameTranscript();
        var tailGrew = same && domTurnOpen && tails > domTailSeen;
        var statusLeft = same && domStatusSeen === true && on === false;
        var had = !!(domLastScope || domLastTail);
        domTailSeen = tails;
        domStatusSeen = on;
        domLastScope = domScopeNow;
        domLastTail = lastTail;
        if (!same) {
          // 换了转录（首次挂载 / 切会话 / 重绘）：上一个尾巴已经不在了
          domRenders++;
          domTurnOpen = false;
          if (had) doneLog('转录换了（挂载 / 切会话 / 重绘），不触发');
          return;
        }
        if (tailGrew) domTurnOpen = false;
        if (!tailGrew && !statusLeft) {
          if (on) {
            // 又跑起来了：让还没播完的完成动画让位
            if (donePending) { clearTimeout(donePending); donePending = null; }
            if (doneCleanup) stopDone();
          }
          return;
        }
        domHits++;
        if (statusLeft) domTurnOpen = false;
        doneEndedRound(doneCurrentId(), tailGrew ? 'turnTail' : 'turnStatus');
      }
      var doneDomQueue = 0;
      function doneDomKick() {
        if (doneDomQueue) return;
        doneDomQueue = setTimeout(function () { doneDomQueue = 0; doneDomPoll(); }, 200);
      }
      function doneWatchDom() {
        if (doneDomTimer) return;
        try {
          if (typeof MutationObserver === 'function') {
            doneDomObserver = new MutationObserver(doneDomKick);
            doneDomObserver.observe(doc.body, { childList: true, subtree: true });
          }
        } catch (e) { doneDomObserver = null; }
        doneDomTimer = setInterval(doneDomPoll, 400);   // 属性/时序漏了也能发现
        doneDomPoll();
      }
      function doneStopDom() {
        if (doneDomTimer) { clearInterval(doneDomTimer); doneDomTimer = null; }
        if (doneDomQueue) { clearTimeout(doneDomQueue); doneDomQueue = 0; }
        if (doneDomObserver) { try { doneDomObserver.disconnect(); } catch (e) {} doneDomObserver = null; }
      }

      // 诊断用（DevTools — `__marDoneDebug()`）：触发链上每一步的实况
try {
        if (typeof window !== 'undefined') {
          window.__marDoneDebug = function () {
            return {
              switchOn: doneEnabled(),
              sessionsService: !!doneSessions,
              subscribed: !!doneUnsub,
              face: doneFaceId,
              faceSubscribed: !!doneFaceUnsub,
              pokeLeft: donePokeLeft,
              prev: donePrev,
              stopped: doneStopped,
              turnSeen: doneTurnSeen,
              faceRun: doneFaceRun,
              last: doneLast,
              mounted: !!doneCleanup,
              // 四条判据的实况：哪条有信号一眼看—
              listPublishes: listPublishes,
              facePublishes: facePublishes,
              faceEdges: faceEdges,
              domTails: domTailSeen,
              domSession: domScopeSession,
              domStatus: domStatusSeen,
              domHits: domHits,
              domRenders: domRenders,
              lastEnds: lastEnds
            };
          };
        }
      } catch (e) {}

      // ---- running animation（运行动画，2026-11-05 用户要求）----------------
      // 把输入框上方那条原生运行提示（鲸鱼 + “深度求索中，用时 N 秒 …”）换成
      // D:\PythonCode\ma\运行动画.html 的语言：左空心人形 / 右实心人形 / 传送线
      // + 两个光点，下面三行**跟随真实状态**的文字（见 src/run/*.js）：
      //   ① 标题：读宿主那个 role=status 的隐藏 span，中英文都跟宿主走；
      //   ② 用时：会话快照 turnTimings 里“当前打开的轮次”的 startTime；真机
      //      sessions 面没有 list 时，解析原生行的“用时 N 秒”文案并继续累加；
      //   ③ 动作 / 模式：快照 runningCalls / partial；快照不可用时读 DOM 的
      //      [data-tool][data-state] / [data-variant=think] / [data-streaming]。
      // 挂载点：`[data-composer-seat]` 的第一个子节点（sticky 输入框座位），
      // 所以条带**永远贴在输入卡正上方**；`[data-chat-running]` 只提供“在跑”
      // 这个信号与读屏标题。原生可见子节点由 body.mar-run-on 的样式表隐藏，
      // role=status 的读屏 span 保留（见上面 css 段）。
      // 引擎本体在 src/run/engine-run.js（构建时作为 RUN_PAYLOAD 注入）。
      // 这里只负责“何时挂 / 喂什么状态 / 何时拆”。
      var RUN_STORE_KEY = 'mar.run.v1';
      var RUN_HEIGHT = 132;
      function runLoad() {
        try {
          var raw = (typeof window !== 'undefined' && window.localStorage)
            ? window.localStorage.getItem(RUN_STORE_KEY) : null;
          if (!raw) return { on: true };
          var parsed = JSON.parse(raw);
          return { on: !(parsed && parsed.on === false) };
        } catch (e) { return { on: true }; }
      }
      function runSave() {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(RUN_STORE_KEY, JSON.stringify(RUN_STATE));
          }
        } catch (e) {}
      }
      var RUN_STATE = runLoad();
      function runEnabled() { return RUN_STATE.on !== false; }
      // 跟随主题色（2026-11-05 用户追加）：默认 OFF —— 两个动画保持固定
      // #C0FE04（条带 / 点阵新生格）与 #8F96B2（点阵成熟格）。打开后条带墨色与
      // 点阵新生格改读 `--mar-accent-text`，跟着七选一主题色 / 浅色底盘走。
      var FOLLOW_STORE_KEY = 'mar.run.follow.v1';
      function followLoad() {
        try {
          var raw = (typeof window !== 'undefined' && window.localStorage)
            ? window.localStorage.getItem(FOLLOW_STORE_KEY) : null;
          if (!raw) return { follow: false };
          var parsed = JSON.parse(raw);
          return { follow: !!(parsed && parsed.follow === true) };
        } catch (e) { return { follow: false }; }
      }
      function followSave() {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(FOLLOW_STORE_KEY, JSON.stringify(FOLLOW_STATE));
          }
        } catch (e) {}
      }
      var FOLLOW_STATE = followLoad();
      function accentFollow() { return FOLLOW_STATE.follow === true; }
      function runReduced() {
        return !!(typeof window !== 'undefined' && window.matchMedia &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      }

      var runHost = null, runRow = null, runEngine = null;
      var runTick = null, runScriptEl = null, runStartFallback = 0;
      var runObserver = null, runTimer = null, runKickTimer = 0, runBroken = false;
      var runLast = null;
      // 原生运行行自己报的已跑秒数 + 采样时刻（快照拿不到时的用时来源）
      var runNativeSec = null, runNativeAt = 0;

      function runEngineApi() {
        var api = (typeof window !== 'undefined') ? window.__marRunEngine : null;
        if (!api) return null;
        if (typeof api.create === 'function') return api;
        if (typeof api === 'function') return { create: api };
        return null;
      }
      function runEnsureEngine() {
        if (runEngineApi()) return true;
        if (!RUN_PAYLOAD || !RUN_PAYLOAD.engine) return false;
        if (!runScriptEl) {
          try {
            runScriptEl = doc.createElement('script');
            runScriptEl.setAttribute('data-mar-run-engine', '1');
            runScriptEl.textContent = RUN_PAYLOAD.engine;
            (doc.head || doc.documentElement).appendChild(runScriptEl);
          } catch (e) { runScriptEl = null; }
        }
        return !!runEngineApi();
      }

      function runInk() {
        // 默认固定 #C0FE04（不跟主题色）；设置页「跟随主题色」打开后才读
        // --mar-accent-text —— 这是用户主动选的，不是主题强加的。
        if (!accentFollow()) return '#C0FE04';
        var ink = '';
        try {
          ink = String(getComputedStyle(body).getPropertyValue('--mar-accent-text') || '').trim();
        } catch (e) { ink = ''; }
        return ink || '#C0FE04';
      }
      // Mirror of the host's own formatRunDuration: <60s → “N 秒”, else “N 分 M 秒”.
      function runDuration(ms, zh) {
        var s = Math.max(1, Math.round(ms / 1000));
        if (s < 60) return zh ? ('用时 ' + s + ' 秒') : ('for ' + s + 's');
        var m = Math.floor(s / 60), r = s % 60;
        return zh ? ('用时 ' + m + ' 分 ' + r + ' 秒') : ('for ' + m + 'm ' + r + 's');
      }
      function runOpenTurnStart(snap) {
        var best = null;
        try {
          if (!snap || !snap.turnTimings || typeof snap.turnTimings.forEach !== 'function') return null;
          snap.turnTimings.forEach(function (v, k) {
            if (!v || v.startTime === undefined) return;
            if (v.endTime !== undefined && v.endTime !== null) return;   // closed turn
            if (best === null || k > best.turn) best = { turn: k, t: v.startTime };
          });
        } catch (e) { return null; }
        return best ? Number(best.t) : null;
      }
      // ---- DOM 侧状态补偿（生产构建的关键一条）-----------------------------
      // 0.2.2-rc.1 的客户端 `sessions` 服务面**没有 list**（只有 binding / scope /
      // retain），`doneCurrentId()` 因此拿不到当前会话 id，会话快照这条路在真机上
      // 可能整条为空。所以动作 / 模式 / 已跑时长必须能从 DOM 直接读：
      //   · 运行中的工具行：`[data-tool][data-state="running"| "preparing"]`
      //     （ui-tool 的 ToolRow 根节点，data-tool 就是 wire name）；
      //   · 思考中：`[data-variant="think"][data-state="running"]`；
      //   · 正在出字：`[data-streaming]`；
      //   · 原生那一行自己的 `深度求索中，用时 12 秒` 文案可以解析出已跑秒数 ——
      //     切进一个已经在跑的会话时，这比"第一次看见条带"准。
      function runDomScope() {
        try { return doc.querySelector('[data-conversation-scroll]') || doc; }
        catch (e) { return doc; }
      }
      // 上一行是 turn-tail 时宿主会把新 running 行整个 display:none（ChatView 的
      // `.flowItem[turn-tail] + .running{display:none}`）——那不是"在跑"。
      function runRowVisible(row) {
        try { return !!row && getComputedStyle(row).display !== 'none'; }
        catch (e) { return !!row; }
      }
      function runDomState(zh) {
        var scope = runDomScope();
        try {
          var calls = scope.querySelectorAll('[data-tool][data-state="running"], [data-tool][data-state="preparing"]');
          if (calls.length) {
            var name = calls[calls.length - 1].getAttribute('data-tool');
            if (name) return { mode: 'run', action: (zh ? '调用工具 · ' : 'Tool · ') + name };
          }
          if (scope.querySelector('[data-variant="think"][data-state="running"]')) {
            return { mode: 'think', action: zh ? '正在分析请求' : 'Analyzing the request' };
          }
          if (scope.querySelector('[data-streaming]')) {
            return { mode: 'run', action: zh ? '正在生成回复' : 'Writing the reply' };
          }
        } catch (e) {}
        return { mode: 'think', action: zh ? '等待模型响应' : 'Waiting for the model' };
      }
      function runStateOf(snap, zh) {
        if (!snap) return runDomState(zh);
        var calls = snap.runningCalls;
        if (calls && calls.length) {
          var last = calls[calls.length - 1];
          var name = last && (last.name || (last.call && last.call.name));
          if (name) return { mode: 'run', action: (zh ? '调用工具 · ' : 'Tool · ') + String(name) };
        }
        var blocks = snap.partial && snap.partial.blocks;
        if (blocks && blocks.length) {
          var hasReasoning = false, hasText = false;
          for (var i = 0; i < blocks.length; i++) {
            var b = blocks[i];
            if (!b) continue;
            if (b.kind === 'reasoning') hasReasoning = true;
            if (b.kind === 'text' && b.text && b.text.trim()) hasText = true;
          }
          if (hasText) return { mode: 'run', action: zh ? '正在生成回复' : 'Writing the reply' };
          if (hasReasoning) return { mode: 'think', action: zh ? '正在分析请求' : 'Analyzing the request' };
        }
        // 快照只说了"在跑"、没说细节：DOM 里能看见工具行就用它。
        return runDomState(zh);
      }
      // 原生运行行自己那行文字里的已跑时长（秒）。中 / 英两种格式都认。
      function runParseNativeSeconds(row) {
        var text = '';
        try {
          var content = row.querySelector('[class*="runningContent"]');
          text = String((content || row).textContent || '');
        } catch (e) { return null; }
        var m;
        if ((m = /(\d+)\s*分\s*(\d+)\s*秒/.exec(text))) return (+m[1]) * 60 + (+m[2]);
        if ((m = /(\d+)\s*秒/.exec(text))) return +m[1];
        if ((m = /(\d+)\s*m(?:in)?\s*(\d+)\s*s/i.exec(text))) return (+m[1]) * 60 + (+m[2]);
        if ((m = /for\s+(\d+)\s*s/i.exec(text))) return +m[1];
        return null;
      }
      function runSnapshotNow() {
        var id = null;
        try { id = doneCurrentId(); } catch (e) { id = null; }
        if (!id) return null;
        var face = null;
        try { face = doneFaceOf(id); } catch (e) { face = null; }
        if (!face || typeof face.getSnapshot !== 'function') return null;
        try { return face.getSnapshot() || null; } catch (e) { return null; }
      }
      function runPush() {
        if (!runEngine) return;
        if (!runHost || !runHost.isConnected) {
          runSyncDom();
          return;
        }
        var row = null;
        try { row = doc.querySelector('[data-chat-running]'); } catch (e) { row = null; }
        if (!row || row.hasAttribute('data-holding') || !runRowVisible(row)) { runSyncDom(); return; }
        runRow = row;
        var snap = runSnapshotNow();
        var nativeEl = null;
        try { nativeEl = row.querySelector('[role="status"]'); } catch (e) {}
        var title = (nativeEl && nativeEl.textContent) ? nativeEl.textContent.trim() : '深度求索中';
        if (!title) title = '深度求索中';
        var zh = /[\u4e00-\u9fff]/.test(title);

        var nativeSec = runParseNativeSeconds(row);
        if (nativeSec !== null && nativeSec >= 1) {
          runNativeSec = nativeSec;
          runNativeAt = Date.now();
        }
        var start = runOpenTurnStart(snap);
        var elapsedMs;
        if (start !== null && isFinite(start)) {
          elapsedMs = Date.now() - start;
        } else if (runNativeSec !== null) {
          elapsedMs = runNativeSec * 1000 + Math.max(0, Date.now() - runNativeAt);
        } else {
          elapsedMs = Date.now() - (runStartFallback || Date.now());
        }
        var look = runStateOf(snap, zh);
        var state = {
          mode: 'run',
          title: title,
          meta: runDuration(elapsedMs, zh),
          action: look.action,
          ink: runInk(),
          reduced: runReduced()
        };
        try {
          if (typeof runEngine.set === 'function') runEngine.set(state);
          else if (typeof runEngine.update === 'function') runEngine.update(state);
          runLast = state;
        } catch (e) { /* one bad frame must not tear the strip down */ }
      }
      function runUnmount() {
        if (runTick) { clearInterval(runTick); runTick = null; }
        if (runEngine) {
          try { if (typeof runEngine.destroy === 'function') runEngine.destroy(); } catch (e) {}
          runEngine = null;
        }
        if (runHost && runHost.parentNode) {
          try { runHost.parentNode.removeChild(runHost); } catch (e) {}
        }
        runHost = null;
        runRow = null;
        runNativeSec = null;
        runNativeAt = 0;
        syncRunState();
      }
      function runMount(seat, row) {
        runUnmount();
        if (!runEnsureEngine()) { runBroken = true; syncRunState(); return; }
        var api = runEngineApi();
        if (!api) { runBroken = true; syncRunState(); return; }
        var host = doc.createElement('div');
        host.id = 'dshMarRunHost';
        host.className = 'mar-run-host';
        host.style.cssText = 'display:block;width:100%;min-width:0;';
        // First child of the sticky composer seat: above the composer stack, so
        // it stays pinned just above the input no matter how short the
        // transcript is. (The native [data-chat-running] row lives at the end
        // of the transcript and would float upward in a short conversation.)
        try { seat.insertBefore(host, seat.firstChild); } catch (e) { return; }
        runHost = host;
        runRow = row;
        runStartFallback = Date.now();
        runNativeSec = null;
        runNativeAt = 0;
        try {
          runEngine = api.create(host, { height: RUN_HEIGHT, reduced: runReduced() });
        } catch (e) { runEngine = null; }
        if (!runEngine) {
          runBroken = true;
          runUnmount();
          syncRunState();
          return;
        }
        runBroken = false;
        runPush();
        runTick = setInterval(runPush, 250);
        syncRunState();
      }
      function runSyncDom() {
        if (!runEnabled()) { if (runHost) runUnmount(); return; }
        // Raw template run (no build) / a payload that never arrived: do not
        // retry a mount every 400ms; the switch's status line explains it.
        if (!RUN_PAYLOAD && !runEngineApi()) return;
        var row = null, seat = null;
        try {
          row = doc.querySelector('[data-chat-running]');
          seat = doc.querySelector('[data-composer-seat]');
        } catch (e) { row = null; seat = null; }
        // data-holding = the turn has ended and the host is keeping the row as a
        // hidden placeholder under the actions row. Nothing to draw there.
        if (!row || row.hasAttribute('data-holding') || !seat || !runRowVisible(row)) {
          if (runHost) runUnmount();
          return;
        }
        if (!runHost || runHost.parentNode !== seat || !runHost.isConnected) runMount(seat, row);
        else runRow = row;
      }
      function runKick() {
        if (runKickTimer) return;
        runKickTimer = setTimeout(function () {
          runKickTimer = 0;
          runSyncDom();
          dotSyncDom();
        }, 100);
      }
      function runWatch() {
        if (runTimer) return;
        try {
          if (typeof MutationObserver === 'function') {
            runObserver = new MutationObserver(runKick);
            runObserver.observe(doc.body, { childList: true, subtree: true });
          }
        } catch (e) { runObserver = null; }
        runTimer = setInterval(function () {
          // HMR 半拆除时旧实例的定时器可能还活着：新实例 apply 后令牌会变，旧实例
          // 在这里自行退场（只摘自己的两个动画，不碰主题）。
          if (staleInstance()) { retireStale(); return; }
          runSyncDom();
          dotSyncDom();
        }, 400);
        runSyncDom();
        dotSyncDom();
      }
      function runUnwatch() {
        if (runTimer) { clearInterval(runTimer); runTimer = null; }
        if (runKickTimer) { clearTimeout(runKickTimer); runKickTimer = 0; }
        if (runObserver) { try { runObserver.disconnect(); } catch (e) {} runObserver = null; }
      }
      // ---- instance token（2026-11-06） --------------------------------------
      // DSH 的 client HMR 会重跑 apply()。如果上一次的 dispose 没跑完（实测：
      // removeOwnedStyles 先摘了样式表，但旧实例的 400ms 定时器还活着），旧实例会
      // 继续往座位里挂点阵/条带，和新实例打架。每次真正安装都递增一个全局令牌，
      // 旧实例在下一个 tick 自行退场。
      var INSTANCE_TOKEN;   // 赋值在 apply 顶部的安装路径里（见 __marThemeRunToken）
      function staleInstance() {
        return typeof window !== 'undefined' &&
          window.__marThemeRunToken !== INSTANCE_TOKEN;
      }
      function retireStale() {
        runUnwatch();
        runUnmount();
        dotUnmount();
      }
      function runStateText() {
        if (!runEnabled()) return '已关闭';
        if (!RUN_PAYLOAD) return '运行动画引擎缺失（payload 被丢弃）';
        if (runBroken) return '运行动画覆盖层不可用';
        if (runHost) return '运行中 · 已替换原生提示';
        return '待命 · 替换任务时的原生提示';
      }
      function syncRunState() {
        try {
          var el = doc.getElementById('mar-run-state');
          if (el) el.textContent = runStateText();
        } catch (e) {}
      }

      // ---- dot animation（点阵动画，《动画1》，独立选项，2026-11-05）---------
      // 用户要求：两个动画作为**两个独立选项**；动画1 放在输入框右侧（空间足够）；
      // 不要一开始就铺格子，要逐格生长；文字提示保持原生，不换成运行动画那三行。
      // 所以这里只做一层纯装饰：绝对定位在 `[data-composer-seat]` 右侧的空白里，
      // 只画 21×21 有机体——不碰 `[data-chat-running]` 的任何子节点，也不加
      // `mar-run-on`，原生提示该怎么显示还怎么显示。
      var DOT_STORE_KEY = 'mar.dot.v1';
      var DOT_MIN = 64, DOT_MAX = 120, DOT_PAD = 28, DOT_BOTTOM_PAD = 8;
      function dotLoad() {
        try {
          var raw = (typeof window !== 'undefined' && window.localStorage)
            ? window.localStorage.getItem(DOT_STORE_KEY) : null;
          if (!raw) return { on: true };
          var parsed = JSON.parse(raw);
          return { on: !(parsed && parsed.on === false) };
        } catch (e) { return { on: true }; }
      }
      function dotSave() {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(DOT_STORE_KEY, JSON.stringify(DOT_STATE));
          }
        } catch (e) {}
      }
      var DOT_STATE = dotLoad();
      function dotEnabled() { return DOT_STATE.on !== false; }

      var dotHost = null, dotEngine = null, dotScriptEl = null, dotBroken = false;
      var dotObserver = null, dotAnchor = null;
      // 原生输入卡的基准几何（只看可见卡时更新）：审批/提问接管期间沿用它，
      // 点阵因此不会因为接管卡宽窄不同而挪位。见 dotBaseOf()。
      var dotBase = null;

      function dotEngineApi() {
        var api = (typeof window !== 'undefined') ? window.__marDotEngine : null;
        if (!api) return null;
        if (typeof api.create === 'function') return api;
        if (typeof api === 'function') return { create: api };
        return null;
      }
      function dotEnsureEngine() {
        if (dotEngineApi()) return true;
        if (!DOT_PAYLOAD || !DOT_PAYLOAD.engine) return false;
        if (!dotScriptEl) {
          try {
            dotScriptEl = doc.createElement('script');
            dotScriptEl.setAttribute('data-mar-dot-engine', '1');
            dotScriptEl.textContent = DOT_PAYLOAD.engine;
            (doc.head || doc.documentElement).appendChild(dotScriptEl);
          } catch (e) { dotScriptEl = null; }
        }
        return !!dotEngineApi();
      }
      function dotUnmount() {
        if (dotObserver) { try { dotObserver.disconnect(); } catch (e) {} dotObserver = null; }
        dotAnchor = null;
        if (dotEngine) {
          try { if (typeof dotEngine.destroy === 'function') dotEngine.destroy(); } catch (e) {}
          dotEngine = null;
        }
        if (dotHost && dotHost.parentNode) {
          try { dotHost.parentNode.removeChild(dotHost); } catch (e) {}
        }
        dotHost = null;
        syncDotState();
      }
      function dotPush() {
        if (!dotEngine) return;
        try {
          dotEngine.set({ fresh: runInk(), reduced: runReduced() });
        } catch (e) {}
      }
      // 右侧空白：输入卡外沿到 composer seat 边缘的一半（左右对称）。
      // 2026-11-05 bug 修复：输入框高度/宽度变化后（textarea 变高、窗口缩放）
      // 必须**重新量**，否则绝对定位的宿主会停在旧坐标上“乱跑”。现在每次
      // 400ms 轮询 + ResizeObserver 都会调用 dotPlace() 重算 top/right/size。
      //
      // 2026-11-06 bug：审批卡 / 提问卡接管 composer 时，slot 链的 overlay
      // fallback 把原生 composer 留在 DOM 里，只给外层套一个 display:none
      // （dsh-client-ui-renderer 的 renderChainResult）。隐藏卡的 rect 全是 0，
      // 旧公式 top = 0 - seat.top - size - 8 被 clamp 到 0，点阵于是跳到 seat
      // 顶部——用户看到它“自己跑到输入框上面”，审批消失（卡恢复可见）又落回
      // 右下角。锚点必须取**当前可见**的那张卡：
      //   · 平时：[data-composer-card]；
      //   · 审批/提问接管：[data-approval-key] / [data-question-key] 里的
      //     card（根节点的第一个元素子节点）。
      // 一个都量不到（例如揭幕/animation 期间整体隐藏）就收起点阵，宁可没有
      // 也不要把 top 钳在 0 上停在半空。
      //
      // 2026-11-06 第二轮（用户：“审批出现时点阵会略微改变位置，想固定住”）：审批卡
      // 的 max-width 是 chat-content-width，输入卡是它 +32，所以接管时右侧留白
      // 变宽 16px，按接管卡重算就会横移 8px。位置必须**钉在审批出现前的那一帧**：
      // 基准卡（宽度 + 底边距）只在原生输入卡可见时更新，接管期间沿用缓存。
      // 纵向改用 seat 底边做锚（两种卡都贴 seat 底部），高度变化不影响。
      function dotAnchorOf(seat) {
        var i, r, el;
        try {
          var cards = seat.querySelectorAll('[data-composer-card]');
          for (i = 0; i < cards.length; i++) {
            r = cards[i].getBoundingClientRect();
            if (r.width > 1 && r.height > 1) return { el: cards[i], takeover: false };
          }
          var roots = seat.querySelectorAll('[data-approval-key],[data-question-key]');
          for (i = 0; i < roots.length; i++) {
            el = roots[i].firstElementChild;
            if (!el) continue;
            r = el.getBoundingClientRect();
            if (r.width > 1 && r.height > 1) return { el: el, takeover: true };
          }
        } catch (e) {}
        return null;
      }
      function dotBaseOf(seat, anchor) {
        var sr = null, cr = null;
        try {
          sr = seat.getBoundingClientRect();
          cr = anchor.el.getBoundingClientRect();
        } catch (e) { return null; }
        if (!sr || !cr || cr.width < 2 || cr.height < 2) return null;
        // seat 宽度变了（窗口缩放）说明缓存已过期：接管期间量不到输入卡，只能
        // 先用接管卡兜底，等接管结束再用输入卡重建基准。
        if (anchor.takeover) {
          if (dotBase && Math.abs(sr.width - dotBase.seatWidth) <= 2) return dotBase;
          return { width: cr.width, bottomGap: sr.bottom - cr.bottom, seatWidth: sr.width };
        }
        dotBase = { width: cr.width, bottomGap: sr.bottom - cr.bottom, seatWidth: sr.width };
        return dotBase;
      }
      function dotGeom(seat, anchor) {
        var sr = null, base = null;
        try { sr = seat.getBoundingClientRect(); } catch (e) { return null; }
        // 零尺寸 = display:none 的 fallback 卡；量不出就返回 null（收起），
        // 绝不让位置落进 clamp 变成 0。
        base = dotBaseOf(seat, anchor);
        if (!sr || !base || base.width < 2) return null;
        var margin = (sr.width - base.width) / 2;
        if (margin < DOT_MIN + DOT_PAD * 2) return null;
        var size = Math.max(DOT_MIN, Math.min(DOT_MAX, Math.round(margin - DOT_PAD * 2)));
        // 固定在卡的**右下角**：右边居中于右侧空白，底边距卡片底
        // DOT_BOTTOM_PAD（卡片长高时它跟着底边走，不会往上漂）。以 seat 底边
        // 为锚，审批卡与输入卡切换时纵向也不动。
        var bottom = Math.round(base.bottomGap + DOT_BOTTOM_PAD);
        if (bottom < 0) bottom = 0;
        return {
          size: size,
          bottom: bottom,
          right: Math.round(margin / 2 - size / 2)
        };
      }
      function dotPlace(seat, anchor) {
        if (!dotHost) return false;
        var g = dotGeom(seat, anchor);
        if (!g) return false;
        // 定位必须是内联的：HMR 重载会先摘掉主题样式表，若这时旧 host 还活着，
        // 只靠样式表里的 `position:absolute` 会让它变成 seat 里的普通块（掉到输入
        // 框左下）。内联 position 让点阵在任何「半拆除」状态下都还在右下角。
        if (dotHost.style.position !== 'absolute') {
          dotHost.style.position = 'absolute';
          dotHost.style.pointerEvents = 'none';
          dotHost.style.zIndex = '1';
        }
        var px = g.size + 'px';
        if (dotHost.style.width !== px) {
          dotHost.style.width = px;
          dotHost.style.height = px;
        }
        dotHost.style.right = g.right + 'px';
        dotHost.style.bottom = g.bottom + 'px';
        return true;
      }
      // 锚点会在「正常输入卡 ⇄ 审批/提问卡」之间切换，观察对象要跟着换。
      function dotObserve(seat, anchor) {
        if (dotObserver && dotAnchor && dotAnchor.el === anchor.el) return;
        if (dotObserver) { try { dotObserver.disconnect(); } catch (e) {} dotObserver = null; }
        dotAnchor = anchor;
        if (typeof ResizeObserver !== 'function') return;
        try {
          dotObserver = new ResizeObserver(function () {
            if (dotHost && dotAnchor) { dotPlace(seat, dotAnchor); dotPush(); }
          });
          dotObserver.observe(seat);
          dotObserver.observe(anchor.el);
        } catch (e) { dotObserver = null; }
      }
      function dotSyncDom() {
        if (!dotEnabled()) { if (dotHost) dotUnmount(); return; }
        if (!DOT_PAYLOAD && !dotEngineApi()) return;
        var row = null, seat = null;
        try {
          row = doc.querySelector('[data-chat-running]');
          seat = doc.querySelector('[data-composer-seat]');
        } catch (e) { row = null; }
        if (!row || row.hasAttribute('data-holding') || !runRowVisible(row) || !seat) {
          if (dotHost) dotUnmount();
          return;
        }
        // 可见的卡：平时是输入卡，被审批/提问接管时换成接管卡。
        var anchor = dotAnchorOf(seat);
        if (!anchor) {
          if (dotHost) dotUnmount();
          return;
        }
        if (dotHost && dotHost.parentNode === seat) {
          if (!dotPlace(seat, anchor)) {
            // 右侧空白被压到放不下 64px：收起，等空间回来再挂。
            dotUnmount();
            return;
          }
          dotObserve(seat, anchor);
          dotPush();
          return;
        }
        var g = dotGeom(seat, anchor);
        if (!g) {
          if (dotHost) dotUnmount();
          return;
        }
        dotUnmount();
        if (!dotEnsureEngine()) { dotBroken = true; syncDotState(); return; }
        var api = dotEngineApi();
        if (!api) { dotBroken = true; syncDotState(); return; }
        // 同上：把上一个实例留下的同名 host 清掉。
        try {
          var staleDots = doc.querySelectorAll('#dshMarDotHost');
          for (var sd = 0; sd < staleDots.length; sd++) {
            if (staleDots[sd] !== dotHost && staleDots[sd].parentNode) {
              staleDots[sd].parentNode.removeChild(staleDots[sd]);
            }
          }
        } catch (e) {}
        var host = doc.createElement('div');
        host.id = 'dshMarDotHost';
        host.className = 'mar-dot-host';
        host.setAttribute('aria-hidden', 'true');
        host.style.cssText = 'position:absolute;pointer-events:none;z-index:1;' +
          'width:' + g.size + 'px;height:' + g.size + 'px;' +
          'right:' + g.right + 'px;bottom:' + g.bottom + 'px;';
        try { seat.appendChild(host); } catch (e) { return; }
        dotHost = host;
        try { dotEngine = api.create(host, { reduced: runReduced() }); } catch (e) { dotEngine = null; }
        if (!dotEngine) {
          dotBroken = true;
          dotUnmount();
          syncDotState();
          return;
        }
        dotBroken = false;
        // 输入框 / 接管卡尺寸变化（textarea 长高、卡片换宽、审批卡展开、seat
        // 因条带出现而变高）时立刻重新贴合右下角，不用等下一次 400ms 轮询。
        dotObserve(seat, anchor);
        dotPush();
        syncDotState();
      }
      function dotStateText() {
        if (!dotEnabled()) return '已关闭';
        if (!DOT_PAYLOAD) return '点阵引擎缺失（payload 被丢弃）';
        if (dotBroken) return '点阵动画不可用';
        if (dotHost) return '运行中 · 显示在输入框右侧';
        return '待命 · 任务时在输入框右侧显示';
      }
      function syncDotState() {
        try {
          var el = doc.getElementById('mar-dot-state');
          if (el) el.textContent = dotStateText();
        } catch (e) {}
      }
      function dotOnResize() {
        // 窗口缩放：重新量一次右下角。宿主已存在时 dotSyncDom 会走 dotPlace。
        if (dotHost) dotSyncDom();
      }

      function runApply() {
        // 上一次实例（HMR 半拆除）可能把 #dshMarRunHost / #dshMarDotHost 留在
        // 座位里。按 id 兜底清掉，别让两个实例各挂一份（点阵会闪、条带会叠）。
        try {
          var staleHosts = doc.querySelectorAll('#dshMarRunHost, #dshMarDotHost');
          for (var sh = 0; sh < staleHosts.length; sh++) {
            if (staleHosts[sh] !== runHost && staleHosts[sh] !== dotHost &&
                staleHosts[sh].parentNode) {
              staleHosts[sh].parentNode.removeChild(staleHosts[sh]);
            }
          }
        } catch (e) {}
        if (runEnabled()) {
          body.classList.add('mar-run-on');
          runSyncDom();
        } else {
          body.classList.remove('mar-run-on');
          runUnmount();
        }
        if (dotEnabled()) body.classList.add('mar-dot-on');
        else { body.classList.remove('mar-dot-on'); dotUnmount(); }
        if (runEnabled() || dotEnabled()) {
          if (typeof window !== 'undefined' && !runResizeBound) {
            window.addEventListener('resize', dotOnResize);
            runResizeBound = true;
          }
          runWatch();
        } else {
          runUnwatch();
        }
        syncRunState();
        syncDotState();
      }
      var runResizeBound = false;

      // 诊断钩子（DevTools / 无头夹具）：开关、挂载点、最近一帧喂给引擎的状态。
      try {
        if (typeof window !== 'undefined') {
          window.__marRunDebug = function () {
            return {
              enabled: runEnabled(),
              payload: !!RUN_PAYLOAD,
              mounted: !!runHost,
              engine: !!runEngine,
              broken: runBroken,
              reduced: runReduced(),
              rowPresent: !!(runRow && runRow.isConnected),
              last: runLast,
              follow: accentFollow(),
              metrics: (runEngine && typeof runEngine.metrics === 'function')
                ? runEngine.metrics() : null,
              dot: {
                enabled: dotEnabled(),
                payload: !!DOT_PAYLOAD,
                mounted: !!dotHost,
                engine: !!dotEngine,
                broken: dotBroken,
                size: dotHost ? dotHost.getBoundingClientRect().width : 0,
                rect: dotHost ? (function () {
                  var r = dotHost.getBoundingClientRect();
                  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
                })() : null
              }
            };
          };
        }
      } catch (e) {}

      // ---- settings tab: 「主题设置」 -------------------------------------
      // DSH's settings dialog is a nav column + a content column. We append one
      // nav cell and, when it is chosen, cover the content column with our own
      // pane. The cell copies its className off a real sibling at mount time,
      // so a DSH rebuild that only changes the CSS-module hash keeps the same
      // look. Highlight is ours (`.mar-nav-on`), because the host's own
      // "active" background is only one shade off the panel and reads as
      // nothing. Clicking any native cell drops us back to the host's content.
      var MAR_TAB_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
        '<rect x="1.6" y="1.6" width="12.8" height="12.8" stroke="currentColor" stroke-width="1.2"/>' +
        '<path d="M8 4.4v7.2M4.4 8h7.2" stroke="currentColor" stroke-width="1.2"/></svg>';

      // ---- update check（2026-11-05；2026-11-06 起 npm registry 优先）------
      // 0.6.11 起本包发布在 npm registry：从 registry 安装的用户，DSH 插件管理器
      // 自己就会列出新版本并一键更新（它只对 registry 来源的包做 listVersions /
      // updateBundle，见 @deepseek-ai/dsh-plugin-manager）。客户端这份检查是给
      // 「GitHub tarball / 手工拷贝」用户的兜底：先问 npm registry 的 /latest
      // （与插件管理器同一个事实来源、发布后即时可见），失败再退 GitHub。
      // 版本比本地新时：
      //   · 在「主题设置」nav 格右上角点一个**跟主题色**的小圆点；
      //   · 在主题设置面板最上方显示「可更新 / 检查更新 / 不再提示」横幅。
      // 只做提示，不下载、不自动安装；「不再提示」记住跳过的版本，出现更新的
      // 版本时还会再提示。网络/代理失败时静默，用户点「检查更新」才显示失败原因。
      var UPDATE_STORE_KEY = 'mar.update.v1';
      var UPDATE_TTL = 6 * 60 * 60 * 1000;
      // npm registry 的 /latest 是权威来源，发布后即时可见；GitHub API 的 contents
      // 接口没有 raw 那条 5 分钟 CDN 缓存（实测 push 后 raw 仍给旧版本），留作
      // 第二兜底；两个 raw 入口再兜限流/网络失败。
      var UPDATE_SOURCES = [
        { url: 'https://registry.npmjs.org/dsh-theme-mls-desktop/latest', kind: 'npm' },
        { url: 'https://api.github.com/repos/ALPDM00/dsh-theme-mls-desktop/contents/package.json?ref=main&_=', kind: 'api' },
        { url: 'https://raw.githubusercontent.com/ALPDM00/dsh-theme-mls-desktop/main/package.json', kind: 'raw' },
        { url: 'https://gh-proxy.com/https://raw.githubusercontent.com/ALPDM00/dsh-theme-mls-desktop/main/package.json', kind: 'raw' }
      ];
      function updateVersionFromPayload(json) {
        if (!json) return null;
        if (json.name === 'dsh-theme-mls-desktop' && typeof json.version === 'string') return json.version.trim();
        if (typeof json.content === 'string') {
          try {
            var bin = atob(json.content.replace(/\s+/g, ''));
            var bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            var text = (typeof TextDecoder === 'function') ? new TextDecoder('utf-8').decode(bytes) : bin;
            var pkg = JSON.parse(text);
            if (pkg && pkg.name === 'dsh-theme-mls-desktop' && typeof pkg.version === 'string') {
              return pkg.version.trim();
            }
          } catch (e) { return null; }
        }
        return null;
      }
      function updateParseVersion(value) {
        var m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(value || '').trim());
        if (!m) return null;
        return { n: [+m[1], +m[2], +m[3]], pre: m[4] || '' };
      }
      function updateVersionGt(a, b) {
        var A = updateParseVersion(a), B = updateParseVersion(b);
        if (!A || !B) return false;
        for (var i = 0; i < 3; i++) if (A.n[i] !== B.n[i]) return A.n[i] > B.n[i];
        if (A.pre === B.pre) return false;
        if (A.pre && !B.pre) return false;   // 预发布 < 正式版
        if (!A.pre && B.pre) return true;
        return A.pre > B.pre;
      }
      function updateLoad() {
        var empty = { latest: null, checkedAt: 0, skipVersion: null, status: 'idle', error: null };
        try {
          var raw = (typeof window !== 'undefined' && window.localStorage)
            ? window.localStorage.getItem(UPDATE_STORE_KEY) : null;
          if (!raw) return empty;
          var p = JSON.parse(raw);
          return {
            latest: (p && typeof p.latest === 'string') ? p.latest : null,
            checkedAt: (p && typeof p.checkedAt === 'number') ? p.checkedAt : 0,
            skipVersion: (p && typeof p.skipVersion === 'string') ? p.skipVersion : null,
            status: 'idle',
            error: null
          };
        } catch (e) { return empty; }
      }
      function updateSave() {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(UPDATE_STORE_KEY, JSON.stringify({
              latest: UPDATE_STATE.latest,
              checkedAt: UPDATE_STATE.checkedAt,
              skipVersion: UPDATE_STATE.skipVersion
            }));
          }
        } catch (e) {}
      }
      var UPDATE_STATE = updateLoad();
      var updateFetching = false;
      var updateShowStatus = false;
      function updateAvailable() {
        return !!UPDATE_STATE.latest &&
          updateVersionGt(UPDATE_STATE.latest, PLUGIN_VERSION) &&
          UPDATE_STATE.skipVersion !== UPDATE_STATE.latest;
      }
      function updateBannerMode() {
        if (updateAvailable()) return 'available';
        if (!updateShowStatus) return 'hidden';
        if (updateFetching || UPDATE_STATE.status === 'checking') return 'checking';
        if (UPDATE_STATE.status === 'error') return 'error';
        if (UPDATE_STATE.status === 'ok') return 'latest';
        return 'hidden';
      }
      function updateRender() {
        try {
          var nav = doc.querySelector('[data-mar-nav]');
          if (nav) {
            if (updateAvailable()) nav.classList.add('mar-has-update');
            else nav.classList.remove('mar-has-update');
          }
        } catch (e) {}
        var bar = null;
        try { bar = doc.getElementById('mar-update-bar'); } catch (e) { bar = null; }
        if (!bar) return;
        var mode = updateBannerMode();
        if (mode === 'hidden') { bar.hidden = true; return; }
        bar.hidden = false;
        bar.setAttribute('data-mode', mode);
        var tag = doc.getElementById('mar-update-tag');
        var text = doc.getElementById('mar-update-text');
        var mute = doc.getElementById('mar-update-mute');
        var check = doc.getElementById('mar-update-check');
        if (mode === 'available') {
          if (tag) tag.textContent = '可更新';
          if (text) text.textContent = 'v' + UPDATE_STATE.latest + '（当前 v' + PLUGIN_VERSION + '）';
          if (mute) mute.hidden = false;
        } else if (mode === 'checking') {
          if (tag) tag.textContent = '检查更新';
          if (text) text.textContent = '正在检查更新…';
          if (mute) mute.hidden = true;
        } else if (mode === 'latest') {
          if (tag) tag.textContent = '已是最新';
          if (text) text.textContent = '当前 v' + PLUGIN_VERSION;
          if (mute) mute.hidden = true;
        } else {
          if (tag) tag.textContent = '检查失败';
          if (text) text.textContent = UPDATE_STATE.error || '无法连接更新源';
          if (mute) mute.hidden = true;
        }
        if (check) check.disabled = (mode === 'checking');
      }
      function updateCheck(force, manual) {
        if (updateFetching) return;
        if (manual) updateShowStatus = true;
        if (!force && UPDATE_STATE.checkedAt && Date.now() - UPDATE_STATE.checkedAt < UPDATE_TTL) {
          updateRender();
          return;
        }
        updateFetching = true;
        UPDATE_STATE.status = 'checking';
        UPDATE_STATE.error = null;
        updateRender();
        var idx = 0;
        function finish(version, error) {
          updateFetching = false;
          UPDATE_STATE.checkedAt = Date.now();
          if (version) {
            UPDATE_STATE.latest = version;
            UPDATE_STATE.status = 'ok';
            UPDATE_STATE.error = null;
          } else {
            UPDATE_STATE.status = 'error';
            UPDATE_STATE.error = error || '无法连接更新源';
          }
          updateSave();
          updateRender();
        }
        function attempt() {
          if (idx >= UPDATE_SOURCES.length) { finish(null); return; }
          var src = UPDATE_SOURCES[idx++];
          var url = src.url + (src.kind === 'api' ? String(Date.now()) : '');
          var ctrl = null;
          try { if (typeof AbortController === 'function') ctrl = new AbortController(); } catch (e) { ctrl = null; }
          var timer = setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) {} }, 8000);
          var req = null;
          var options = { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined };
          if (src.kind === 'api') options.headers = { Accept: 'application/vnd.github+json' };
          if (src.kind === 'npm') options.headers = { Accept: 'application/json' };
          try { req = fetch(url, options); }
          catch (e) { clearTimeout(timer); attempt(); return; }
          req.then(function (res) {
            if (!res || !res.ok) throw new Error('HTTP');
            return res.json();
          }).then(function (json) {
            clearTimeout(timer);
            var version = updateVersionFromPayload(json);
            if (!version) throw new Error('unexpected payload');
            finish(version, null);
          }).catch(function () {
            clearTimeout(timer);
            attempt();
          });
        }
        attempt();
      }
      function updateBindPane(pane) {
        if (!pane || pane.__marUpdateBound) return;
        pane.__marUpdateBound = true;
        var check = pane.querySelector('#mar-update-check');
        var mute = pane.querySelector('#mar-update-mute');
        if (check) check.addEventListener('click', function () { updateCheck(true, true); });
        if (mute) mute.addEventListener('click', function () {
          UPDATE_STATE.skipVersion = UPDATE_STATE.latest;
          updateShowStatus = false;
          updateSave();
          updateRender();
        });
      }
      try {
        if (typeof window !== 'undefined') {
          window.__marUpdateDebug = function () {
            return {
              current: PLUGIN_VERSION,
              latest: UPDATE_STATE.latest,
              checkedAt: UPDATE_STATE.checkedAt,
              skipVersion: UPDATE_STATE.skipVersion,
              status: UPDATE_STATE.status,
              error: UPDATE_STATE.error,
              fetching: updateFetching,
              available: updateAvailable()
            };
          };
        }
      } catch (e) {}

      //  The seven swatches. No visible text — the colour/artwork IS the label; the
      //  hex only survives as an aria-label so the group is still usable from a
      //  keyboard/screen reader. The flat colour is a custom property (--sw) that
      //  doubles as the artwork's fallback; --sw-img comes from the generated
      //  per-data-accent rules (build.cjs FACTIONS).
      //  (There used to be a bgSegChip() preview inside the 浅色/深色 buttons; the
      //  user asked for plain words on 2026-10-17, so it is gone.)
      function accentSwatches() {
        var out = '';
        for (var i = 0; i < ACCENT_ORDER.length; i++) {
          var c = ACCENT_ORDER[i];
          out += '<button type="button" role="radio" data-accent="' + c +
            '" aria-checked="false" aria-label="' + c +
            '" style="--sw:' + c + '"></button>';
        }
        return out;
      }

      function mountSettingsTab(panel) {
        if (!panel || panel.__marTabMount) return;
        var list = panel.querySelector('[class*="_navList"]');
        var sample = list ? list.querySelector('button') : null;
        if (!list || !sample) return;
        panel.__marTabMount = true;

        // strip any "*_active" token — our cell starts unselected
        var baseCls = String(sample.className).split(/\s+/).filter(function (t) {
          return t && !/_active$/.test(t);
        }).join(' ');

        var btn = doc.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-mar-nav', '1');
        btn.className = baseCls;
        btn.innerHTML = MAR_TAB_ICON + '<span>主题设置</span>';
        list.appendChild(btn);
        updateRender();   // 若检查结果早已回来，给 nav 格补上小圆点

        var pane = null;
        // The HOST's cells only. This used to be a bare `[class*="_navCell"]`
        // query taken after our button was appended, so our own cell landed in
        // the list and got `.mar-nav-muted` — whose transparent background is
        // `!important` and would therefore beat the selected cell's accent fill.
        // (It was harmless while the highlight was text-only; it is not any more.)
        var nativeCells = panel.querySelectorAll('[class*="_navCell"]:not([data-mar-nav])');

        // Build the pane ONCE, here, and park it hidden inside the dialog. Doing
        // it lazily on the first click cost ~90ms of innerHTML parsing + style
        // recalc, which read as the panel "loading" after the tab was pressed.
        // Parked with visibility (not display) so it keeps its layout box: the
        // switch on click is then a paint-only change, no reflow.
        pane = buildPane(panel, hidePane);
        pane.style.visibility = 'hidden';
        pane.style.pointerEvents = 'none';
        panel.appendChild(pane);
        updateBindPane(pane);
        updateRender();   // 横幅只在有新版本时显示

        // ---- close button (#1, 2026-11-04) ----------------------------------
        // WHY there is no close button today: the host's own one lives in the
        // dialog header cell — measured on 0.2.2: `_panel > _header > button._close`
        // (28x28, the top-right cell of the panel grid) — and the pane above is
        // absolutely positioned from left:188px / top:0 with z-index:3, i.e. it
        // paints straight OVER that header cell. The button is still in the DOM
        // and still clickable; it is simply covered. Every native tab keeps its
        // own header, so only 主题设置 lost the affordance (issue #1).
        // The pane therefore supplies one, and it DELEGATES to the host instead
        // of guessing at state: the settings dialog documents exactly three
        // close paths (see SettingsPanel in dsh-client-ui-settings-general):
        //   1. the header close button,
        //   2. a click on the overlay mask,
        //   3. document-level Escape (useModalLayer).
        // In that order, with "hand our column back" as the last resort. Escape
        // is also honoured by us (onDocKeydown) so the key works even when the
        // host's own listener is missing — belt and braces, not a replacement.
        var closingTab = false;
        function closeSettingsTab() {
          if (closingTab) return;
          closingTab = true;
          try {
            var hostBtn = panel.querySelector('[class*="_header"] button[class*="_close"]');
            if (hostBtn && typeof hostBtn.click === 'function') { hostBtn.click(); return; }
            var mask = panel.querySelector('[class*="_mask"]');
            if (mask && typeof mask.click === 'function') { mask.click(); return; }
            try {
              var esc = new KeyboardEvent('keydown', {
                key: 'Escape', code: 'Escape', bubbles: true, cancelable: true,
              });
              (doc.activeElement || doc.body).dispatchEvent(esc);
            } catch (e) { /* no KeyboardEvent constructor: fall through */ }
            if (pane && typeof pane.__marClose === 'function') pane.__marClose();
          } finally {
            closingTab = false;
          }
        }

        function onDocKeydown(ev) {
          if (!ev || (ev.key !== 'Escape' && ev.key !== 'Esc' && ev.keyCode !== 27)) return;
          if (!doc.contains(panel)) {
            // the dialog was replaced/unmounted: stop holding the document
            doc.removeEventListener('keydown', onDocKeydown, true);
            return;
          }
          if (!panel.classList.contains('mar-tab-on')) return;   // native tab owns the key
          closeSettingsTab();
        }
        doc.addEventListener('keydown', onDocKeydown, true);
        panel.__marEsc = onDocKeydown;

        // The button lives INSIDE the pane (that is where the affordance belongs):
        // a zero-height sticky bar at the top, the button pinned to its right.
        // A plain absolute child would be clipped/scrolled by the pane's
        // `overflow:auto`; sticky stays put while the list scrolls. `.mar-tab-on`
        // gates its display so the native tabs keep their own header untouched.
        if (!pane.__marCloseBtn) {
          var closeBar = doc.createElement('div');
          closeBar.className = 'mar-set-closebar';
          var closeBtn = doc.createElement('button');
          closeBtn.type = 'button';
          closeBtn.className = 'mar-set-close';
          closeBtn.setAttribute('data-mar-close', '1');
          closeBtn.setAttribute('aria-label', '关闭设置');
          closeBtn.title = '关闭设置';
          closeBtn.innerHTML = '×';
          closeBtn.addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            closeSettingsTab();
          });
          closeBar.appendChild(closeBtn);
          pane.insertBefore(closeBar, pane.firstChild);
          pane.__marCloseBtn = closeBtn;
        }

        function muteNative(mute) {
          for (var i = 0; i < nativeCells.length; i++) {
            nativeCells[i].classList[mute ? 'add' : 'remove']('mar-nav-muted');
          }
        }

        // 2026-11-04 — WHERE THE HOST'S CONTENT COLUMN IS, without trusting a
        // CSS-module hash. 0.2.0-rc.2 called it `_content`; 0.2.2 calls it
        // `_options` (AnXs9G_options). The stylesheet used to key on the token
        // alone, so that rename left the previous settings tab painted under our
        // transparent pane ("先点通用设置，再点主题设置，上一页的信息残留").
        // Resolution order: a known token if one matches, otherwise the largest
        // direct child of the panel that is neither our pane, the nav (contains
        // nav cells), nor the title/header rows. The result is tagged with
        // [data-mar-host-content] and the stylesheet hides THAT, so a future
        // rename only has to keep the panel's shape, not its hash.
        var hostContent = null;
        function findHostContent() {
          if (hostContent && hostContent.parentNode === panel) return hostContent;
          hostContent = null;
          var known = null;
          try {
            known = panel.querySelector(':scope > [class*="_options"]') ||
              panel.querySelector(':scope > [class*="_content"]');
          } catch (e) { known = null; }
          if (known) { hostContent = known; return hostContent; }
          var pr = panel.getBoundingClientRect();
          var threshold = pr.width * pr.height * 0.3;
          for (var i = 0; i < panel.children.length; i++) {
            var child = panel.children[i];
            if (child === pane || child.getAttribute('data-mar-pane')) continue;
            // our own out-of-flow layers (the settings mosaic, the pane) are not
            // the host's content column even when they cover more area
            if (child.classList && (child.classList.contains('mar-mosaic') ||
                child.classList.contains('mar-set-pane'))) continue;
            var cs = null;
            try { cs = getComputedStyle(child); } catch (e) { cs = null; }
            if (cs && (cs.position === 'absolute' || cs.position === 'fixed')) continue;
            if (child.querySelector && (child.querySelector('[data-mar-nav]') ||
                child.querySelector('[class*="_navCell"]'))) continue;
            var r = child.getBoundingClientRect();
            if (r.width * r.height > threshold) { hostContent = child; return hostContent; }
          }
          return null;
        }
        function markHostContent(on) {
          var node = findHostContent();
          if (!node) return;
          if (on) {
            if (!node.hasAttribute('data-mar-host-content')) node.setAttribute('data-mar-host-content', '');
          } else if (node.hasAttribute('data-mar-host-content')) {
            node.removeAttribute('data-mar-host-content');
          }
        }
        // The 1.2s sweep re-asserts it while our tab is on (a React re-render can
        // swap the column node out; the marker would leave with it).
        panel.__marMarkHost = markHostContent;
        function hidePane() {
          panel.classList.remove('mar-tab-on');
          btn.classList.remove('mar-nav-on');
          if (btn.getAttribute) btn.setAttribute('aria-current', 'false');
          // the pane is absolutely positioned over the content column, so it has
          // to leave the paint order too — hiding the host's own content is not
          // enough (the pane would sit on top of it forever). visibility (not
          // display) keeps the layout box alive, so re-opening is paint-only.
          if (pane) { pane.style.visibility = 'hidden'; pane.style.pointerEvents = 'none'; }
          muteNative(false);
          markHostContent(false);
        }
        function showPane() {
          if (!pane) {
            pane = buildPane(panel, hidePane);   // never null in practice
            updateBindPane(pane);
          }
          if (pane.parentNode !== panel) panel.appendChild(pane);
          syncPane(pane);
          updateRender();
          pane.style.visibility = 'visible';
          pane.style.pointerEvents = 'auto';
          panel.classList.add('mar-tab-on');
          btn.classList.add('mar-nav-on');
          if (btn.setAttribute) btn.setAttribute('aria-current', 'true');
          muteNative(true);
          markHostContent(true);
        }
        btn.addEventListener('click', function (ev) {
          ev.preventDefault();
          showPane();
        });
        // any click on a NATIVE cell hands the content column back
        list.addEventListener('click', function (ev) {
          var n = ev.target;
          while (n && n !== list) {
            if (n === btn) return;
            n = n.parentNode;
          }
          hidePane();
        }, true);
      }

      function buildPane(panel, onClose) {
        var pane = doc.createElement('div');
        pane.className = 'mar-set-pane';
        pane.setAttribute('data-mar-pane', '1');
        pane.innerHTML =
          '<h4>主题设置</h4>' +
          '<p class="mar-set-sub">Marathon FUI · 主题色与各项动画开关</p>' +
          // 更新横幅：只在发现新版本时显示（面板最上方）。「检查更新」手动重查，
          // 「不再提示」记住当前版本；nav 上的小点由 updateRender() 同步。
          '<div class="mar-update" id="mar-update-bar" hidden data-mode="available">' +
            '<span class="mar-update-tag" id="mar-update-tag">可更新</span>' +
            '<span class="mar-update-text" id="mar-update-text"></span>' +
            '<span class="mar-update-actions">' +
              '<button type="button" id="mar-update-check">检查更新</button>' +
              '<button type="button" id="mar-update-mute">不再提示</button>' +
            '</span>' +
          '</div>' +
          '<div class="mar-set-group">' +
            '<div class="mar-set-head">外观</div>' +
            // 只有两个词，没有预览图案 —— 用户 2026-10-17："只需要显示浅色和深色即可，
            // 目前两个按钮前方还有图案"。mar-set-appearance 让它不被"关闭背景动画就
            // 变暗"那条规则连坐（那一层 45% 的暗正是"像有一层灰黑色蒙住了"）。
            // 2026-11-05（用户）：外观改成和「通用设置 → 外观」同构的三格，
            // 并接成双向——点这里等于改通用设置，改通用设置/系统切黑白这里
            // 也跟着变。选中态跟 preference，不跟解析后的浅/深（见 syncPane）。
            '<div class="mar-set-row mar-set-appearance"><label>配色</label>' +
            '<div class="mar-seg" role="radiogroup" aria-label="外观配色">' +
            '<button type="button" role="radio" data-pair="light" aria-checked="false">浅色</button>' +
            '<button type="button" role="radio" data-pair="dark" aria-checked="false">深色</button>' +
            '<button type="button" role="radio" data-pair="system" aria-checked="false">跟随系统</button>' +
            '</div></div>' +
            // 一句说明，既是给用户的交代，也是"两边同一件事"的明示。它同样带
            // mar-set-appearance，所以不会被"关闭背景动画就调暗"那条规则连坐。
            '<div class="mar-set-row mar-set-note mar-set-appearance">' +
            '<span>跟随系统：随 Windows 的深浅色自动切换，与「通用设置 → 外观」同步</span></div>' +
          '</div>' +
          '<div class="mar-set-group">' +
            '<div class="mar-set-head">主题色</div>' +
            '<div class="mar-sw" role="radiogroup" aria-label="主题色">' +
              accentSwatches() +
            '</div>' +
          '</div>' +
          '<div class="mar-set-group">' +
            '<div class="mar-set-head">背景动画</div>' +
            '<div class="mar-set-row mar-set-switch"><label for="mar-bg-anim">启用</label>' +
            '<input type="checkbox" class="mar-switch" id="mar-bg-anim">' +
            '<span class="mar-val" data-val="anim"></span></div>' +
            '<div class="mar-set-row"><label for="mar-bg-cell">点阵密度</label>' +
            '<input type="range" id="mar-bg-cell" min="8" max="40" step="2">' +
            '<span class="mar-val" data-val="cell"></span></div>' +
            // 透明度（2026-10-19 用户："再给背景动画添加一个透明度，用于调节可见范围"）：
            // 乘在每条字形的 alpha 上，100% = 原来的强度，0% = 看不见。
            '<div class="mar-set-row"><label for="mar-bg-alpha">透明度</label>' +
            '<input type="range" id="mar-bg-alpha" min="0" max="1" step="0.01">' +
            '<span class="mar-val" data-val="alpha"></span></div>' +
            '<div class="mar-set-row"><label for="mar-bg-speed">呼吸速度</label>' +
            '<input type="range" id="mar-bg-speed" min="0" max="1.5" step="0.05">' +
            '<span class="mar-val" data-val="speed"></span></div>' +
          '</div>' +
          // 启动动画：冷启动揭幕（鲸鱼 → HUI 框 → 蓝块 → 红扫 → 揭幕）。
          // 一个开关，没有别的行 —— 用户 2026-10-17 明确要求删掉那句
          // "只在下次冷启动生效（揭幕发生在设置页能打开之前，本次改不了）"。
          // 它本来就跑在设置页能打开之前，所以也没什么可预览的。
          // （开关行本身带 `.mar-set-switch`，因此天然不在"关闭背景动画就变暗"
          //   的名单里；这一组将来若加非开关行，记得进那个 `:not(...)` 排除表。）
          '<div class="mar-set-group">' +
            '<div class="mar-set-head">启动动画</div>' +
            '<div class="mar-set-row mar-set-switch"><label for="mar-boot">启用</label>' +
            '<input type="checkbox" class="mar-switch" id="mar-boot">' +
            '<span class="mar-val" data-val="boot"></span></div>' +
          '</div>' +
          // 运行动画（2026-11-05 用户要求）：把输入框上方那条原生“深度求索中”
          // 提示换成运行动画.html 的条带。默认 ON；两个“为什么”的状态小字写在
          // 开关下面 —— 引擎缺失 / 减少动态效果时用户能看见原因。
          '<div class="mar-set-group">' +
            '<div class="mar-set-head">运行动画</div>' +
            '<div class="mar-set-row mar-set-switch"><label for="mar-run">启用</label>' +
            '<input type="checkbox" class="mar-switch" id="mar-run">' +
            '<span class="mar-val" data-val="run"></span></div>' +
            '<div class="mar-set-row mar-set-note"><span id="mar-run-state"></span></div>' +
            // 点阵动画（动画1，2026-11-05 用户要求把开关移进「运行动画」组）：
            // 仍是独立开关，但和上方的人形条带同属一个分组。
            '<div class="mar-set-row mar-set-switch"><label for="mar-dot">点阵动画</label>' +
            '<input type="checkbox" class="mar-switch" id="mar-dot">' +
            '<span class="mar-val" data-val="dot"></span></div>' +
            '<div class="mar-set-row mar-set-note"><span id="mar-dot-state"></span></div>' +
            // 跟随主题色（2026-11-05 用户追加）：一个开关，主动决定两个动画
            // 是否改用当前主题强调色；默认关 = 保持固定 #C0FE04 / #8F96B2。
            '<div class="mar-set-row mar-set-switch"><label for="mar-follow">跟随主题色</label>' +
            '<input type="checkbox" class="mar-switch" id="mar-follow">' +
            '<span class="mar-val" data-val="follow"></span></div>' +
          '</div>' +
          '<div class="mar-set-group">' +
            '<div class="mar-set-head">任务完成动画</div>' +
            '<div class="mar-set-row mar-set-switch"><label for="mar-done">启用</label>' +
            '<input type="checkbox" class="mar-switch" id="mar-done">' +
            '<span class="mar-val" data-val="done"></span></div>' +
            '<div class="mar-set-row mar-set-done"><label for="mar-done-text">完成文案</label>' +
            '<input type="text" id="mar-done-text" maxlength="48" spellcheck="false" ' +
            'placeholder="' + DONE_TEXT_DEFAULT + '">' +
            '<button type="button" id="mar-done-play">预览</button></div>' +
            '<div class="mar-set-row mar-set-done mar-set-note"><span id="mar-done-note"></span></div>' +
            '<div class="mar-set-row mar-set-done mar-set-note"><span id="mar-done-state"></span></div>' +
          '</div>' +
          '<div class="mar-set-group">' +
            '<div class="mar-set-head">每轮 Token 结算</div>' +
            '<div class="mar-set-row mar-set-switch"><label for="mar-billing">启用</label>' +
            '<input type="checkbox" class="mar-switch" id="mar-billing">' +
            '<span class="mar-val" data-val="billing"></span></div>' +
          '</div>';

        var seg = pane.querySelector('.mar-seg');
        var animIn = pane.querySelector('#mar-bg-anim');
        var billIn = pane.querySelector('#mar-billing');
        var doneIn = pane.querySelector('#mar-done');
        var doneTextIn = pane.querySelector('#mar-done-text');
        var donePlay = pane.querySelector('#mar-done-play');
        var doneNoteEl = pane.querySelector('#mar-done-note');
        var cellIn = pane.querySelector('#mar-bg-cell');
        var speedIn = pane.querySelector('#mar-bg-speed');
        var alphaIn = pane.querySelector('#mar-bg-alpha');
        var bootIn = pane.querySelector('#mar-boot');
        var runIn = pane.querySelector('#mar-run');
        var dotIn = pane.querySelector('#mar-dot');
        var followIn = pane.querySelector('#mar-follow');

        // 启动动画（2026-10-17）：独立开关，**默认 ON**。它没有即时反馈 ——
        // 揭幕只在冷启动那一瞬播，设置页能打开时它早结束了 —— 所以这里只写盘，
        // 另外：万一揭幕正好还在跑（装载后几秒内就打开设置），关掉即收掉它。
        if (bootIn) {
          bootIn.addEventListener('change', function () {
            BOOT_STATE.on = !!bootIn.checked;
            bootSave();
            if (!BOOT_STATE.on && bootCleanup) {
              try { bootCleanup(); } catch (e) {}
            }
            syncPane(pane);
          });
        }

        // 运行动画（2026-11-05）：独立开关，默认 ON。关掉 = 立刻摘掉条带、
        // 把原生提示的可见子节点还回去（body 上的 mar-run-on 没了）；打开 =
        // 马上开始盯 [data-chat-running]，当前正好在跑就不用等下一轮。
        if (runIn) {
          runIn.addEventListener('change', function () {
            RUN_STATE.on = !!runIn.checked;
            runSave();
            runApply();
            syncPane(pane);
          });
        }

        // 点阵动画（动画1，2026-11-05）：与运行动画完全独立的第二个选项。
        // 关掉 = 摘掉输入框右侧的 canvas、不再观察；打开 = 如果正好在跑，
        // 立刻让它在右侧生长出来。
        if (dotIn) {
          dotIn.addEventListener('change', function () {
            DOT_STATE.on = !!dotIn.checked;
            dotSave();
            runApply();
            syncPane(pane);
          });
        }

        // 跟随主题色：只改配色，不碰两个动画的挂载 / 开关。
        if (followIn) {
          followIn.addEventListener('change', function () {
            FOLLOW_STATE.follow = !!followIn.checked;
            followSave();
            runPush();
            dotPush();
            syncPane(pane);
          });
        }

        // 「每轮 Token 结算」：一个独立的开关（2026-10-09 用户要求加进主题设置）。
if (billIn) {
          billIn.addEventListener('change', function () {
            BILLING_STATE.on = !!billIn.checked;
            billingSave();
            billingApply();
            syncPane(pane);
          });
        }

        // 「任务完成动画」：一个开— + 一行文— + 一个预览
//   关掉 = 不订阅（watchDone 只在打开时挂）、不建节点、不留定时器
//   正在播的那一段立刻收掉；打开 = 立刻接上会话快照（基线静默，不会
        //   因为"打开开关时正好有个会话在跑"而误播）
// 预览忽略开关本身（它就是拿来试的），但照样尊重系统「减少动态效果」，
        // 并把"为什么没— 写进下面那行小字 —— 一个点了没反应的按钮比没有按钮
        // 更糟
if (doneIn) {
          doneIn.addEventListener('change', function () {
            DONE_STATE.on = !!doneIn.checked;
            doneSave();
            if (doneNoteEl) doneNoteEl.textContent = '';
            if (doneEnabled()) attachDone(); else stopDone();
            syncPane(pane);
          });
        }
        if (doneTextIn) {
          doneTextIn.addEventListener('change', function () {
            var v = String(doneTextIn.value || '').replace(/\s+/g, ' ').trim();
            DONE_STATE.text = v || DONE_TEXT_DEFAULT;
            doneSave();
            if (doneNoteEl) doneNoteEl.textContent = '';
            syncPane(pane);
          });
        }
        if (donePlay) {
          donePlay.addEventListener('click', function () {
            stopDone();
            var result = playDone(true);
            if (!doneNoteEl) return;
            // 预览永远显示**触发链的实况**：这— 预览能播、真触发不播"的时候，
            // 用户按一次预览就把诊断读出来了（用户 2026-10-10 连报两轮）
var head =
              result === 'reduced' ? '系统「减少动态效果」生效中，这一拍被跳过' :
              result === 'unavailable' ? '完成动画覆盖层不可用（payload 缺失或被 CSP 拦下）' :
              '';
            var dbg = (typeof window !== 'undefined' && typeof window.__marDoneDebug === 'function')
              ? window.__marDoneDebug() : null;
            var live = dbg
              ? '触发：' + (dbg.subscribed ? '服务已挂' : '服务未就绪') +
                (dbg.faceSubscribed ? ' + 会话面已盯住' : '') +
                '｜列表推送 ' + dbg.listPublishes + ' 次 · 会话面 ' + dbg.facePublishes +
                ' 次（边沿 ' + dbg.faceEdges + '）· 回合尾 ' + dbg.domTails +
                '｜最近：' + (dbg.last && dbg.last.why ? dbg.last.why : '还没有判定')
              : '';
            doneNoteEl.textContent = [head, live].filter(Boolean).join('　');
          });
        }

        // 背景动画 is its own switch and NEVER touches the pair: stopping the
        // field leaves the UI exactly as it is (this is the "关闭后会切换为
        // 主黑+绿" report). Density / breathing only describe the field, so they
        // dim while it is off but keep their values.
        animIn.addEventListener('change', function () {
          BG_STATE.anim = !!animIn.checked;
          bgSave();
          bgApplyMode();
          syncPane(pane);
        });

        // The preference is a radio group: exactly one of 浅色 / 深色 / 跟随系统
        // is always chosen. A click writes the SAME preference 通用设置 edits
        // (the service persists it and resolves `system`), so the two rows can
        // never disagree. The pour is played by the write path, and only when
        // the resolved plate actually moves.
        seg.addEventListener('click', function (ev) {
          var b = ev.target;
          while (b && b !== seg) {
            if (b.getAttribute && b.getAttribute('data-pair')) break;
            b = b.parentNode;
          }
          if (!b || b === seg) return;
          var next = b.getAttribute('data-pair');
          if (!THEME_PREF_IDS[next]) return;
          if (next === BG_STATE.pref) { syncPane(pane); return; }
          if (!themeSetPreference(next)) syncPane(pane);
        });

        // 配色：又一个 radio group —— 七个色块里永远有一个是选中的。它只换
        // UI 强调色，既不碰场开关也不碰 plate（两者都在上面各自的状态里）。
        var swRow = pane.querySelector('.mar-sw');
        if (swRow) {
          swRow.addEventListener('click', function (ev) {
            var b = ev.target;
            while (b && b !== swRow) {
              if (b.getAttribute && b.getAttribute('data-accent')) break;
              b = b.parentNode;
            }
            if (!b || b === swRow) return;
            var next = accentNorm(b.getAttribute('data-accent'));
            if (!accentValid(next) || next === ACCENT_STATE.color) {
              syncPane(pane); return;
            }
            ACCENT_STATE.color = next;
            accentSave();
            //  预留的动画接口：accentSwitchFx 独占那一次 apply()。
            accentSwitchFx(next, accentApply);
            syncPane(pane);
          });
        }
        cellIn.addEventListener('input', function () {
          BG_STATE.cell = bgNum(parseInt(cellIn.value, 10) || 16, 8, 48);
          bgSave();
          bgResize();
          bgDraw(bgElapsed);
          syncPane(pane);
        });
        // 透明度：只重画当前这一帧（不用 resize），所以拖动是即时的。
        if (alphaIn) {
          alphaIn.addEventListener('input', function () {
            BG_STATE.alpha = bgNum(parseFloat(alphaIn.value), 0, 1);
            if (!isFinite(BG_STATE.alpha)) BG_STATE.alpha = 1;
            bgSave();
            bgDraw(bgElapsed);
            syncPane(pane);
          });
        }
        speedIn.addEventListener('input', function () {
          BG_STATE.speed = bgNum(parseFloat(speedIn.value) || 0, 0, 1.5);
          bgSave();
          syncPane(pane);
        });
        if (onClose) pane.__marClose = onClose;
        // Paint the CURRENT state into the parked pane as well: it is built and
        // hidden at mount time, so without this the first frame after the tab is
        // clicked would show the markup defaults (both pairs unpressed) rather
        // than the stored pair.
        syncPane(pane);
        return pane;
      }

      function syncPane(pane) {
        if (!pane) return;
        var animIn = pane.querySelector('#mar-bg-anim');
        if (animIn) animIn.checked = !!BG_STATE.anim;
        //   选中态跟的是 PREFERENCE（light | dark | system），不是解析后的
        //   scheme：跟随系统时唯一选中的永远是「跟随系统」，哪怕它此刻解析成
        //   深色 —— 与通用设置那三格显示的规则完全一致。
        var btns = pane.querySelectorAll('.mar-seg button');
        for (var i = 0; i < btns.length; i++) {
          var on = btns[i].getAttribute('data-pair') === BG_STATE.pref;
          btns[i].setAttribute('aria-checked', on ? 'true' : 'false');
        }
        // 配色：同样一个永远唯一的选中项；顺便把色值写回 --sw，这样填充不
        // 依赖 style 属性里自定义属性被解析的运气（将来换成 SVG 时这段保留）。
        var sws = pane.querySelectorAll('.mar-sw button');
        for (var j = 0; j < sws.length; j++) {
          var hex = accentNorm(sws[j].getAttribute('data-accent'));
          sws[j].setAttribute('aria-checked', hex === ACCENT_STATE.color ? 'true' : 'false');
          if (hex && sws[j].style && sws[j].style.setProperty) {
            sws[j].style.setProperty('--sw', hex);
          }
        }
        var cellIn = pane.querySelector('#mar-bg-cell');
        var speedIn = pane.querySelector('#mar-bg-speed');
        var alphaIn = pane.querySelector('#mar-bg-alpha');
        if (cellIn) { cellIn.value = String(BG_STATE.cell); cellIn.disabled = !BG_STATE.anim; }
        if (alphaIn) { alphaIn.value = String(BG_STATE.alpha); alphaIn.disabled = !BG_STATE.anim; }
        if (speedIn) { speedIn.value = String(BG_STATE.speed); speedIn.disabled = !BG_STATE.anim; }
        // 每轮 Token 结算：自己一个开关（与背景动画互不影响）
        var billIn = pane.querySelector('#mar-billing');
        if (billIn) billIn.checked = billingEnabled();
        // 任务完成动画：开— + 文案（各一个，同样与背景动画互不影响）
        var doneIn = pane.querySelector('#mar-done');
        if (doneIn) doneIn.checked = doneEnabled();
        var doneTextIn = pane.querySelector('#mar-done-text');
        if (doneTextIn && doneTextIn !== doc.activeElement) doneTextIn.value = DONE_STATE.text;
        syncDoneState();
        // 启动动画：只有一个开关。开关行天然是"亮"的（`.mar-set-switch` 在调暗
        // 名单之外），所以这里不写任何说明文字——用户 2026-10-17 要求删掉那句。
        var bootIn = pane.querySelector('#mar-boot');
        if (bootIn) bootIn.checked = bootEnabled();
        // 运行动画：开关 + 状态小字（引擎缺失 / 减少动态效果 / 正在替换）
        var runIn = pane.querySelector('#mar-run');
        if (runIn) runIn.checked = runEnabled();
        syncRunState();
        // 点阵动画：独立开关 + 状态小字（引擎缺失 / 右侧空间不足 / 正在显示）
        var dotIn = pane.querySelector('#mar-dot');
        if (dotIn) dotIn.checked = dotEnabled();
        syncDotState();
        var followIn = pane.querySelector('#mar-follow');
        if (followIn) followIn.checked = accentFollow();
        if (BG_STATE.anim) pane.classList.remove('mar-anim-off');
        else pane.classList.add('mar-anim-off');
        var vals = {
          anim: BG_STATE.anim ? '开' : '关',
          cell: BG_STATE.cell + ' px',
          alpha: Math.round(bgNum(BG_STATE.alpha, 0, 1) * 100) + '%',
          speed: BG_STATE.speed.toFixed(2),
          billing: billingEnabled() ? '开' : '关',
          done: doneEnabled() ? '开' : '关',
          boot: bootEnabled() ? '开' : '关',
          run: runEnabled() ? '开' : '关',
          dot: dotEnabled() ? '开' : '关',
          follow: accentFollow() ? '开' : '关'
        };
        var outs = pane.querySelectorAll('.mar-val');
        for (var k = 0; k < outs.length; k++) {
          var key = outs[k].getAttribute('data-val');
          outs[k].textContent = vals[key] || '';
        }
      }

      //   一次改动可能来自通用设置 / 系统（不是这个 pane 的点击），所以把
      //   DOM 里所有已建好的 pane 都同步一遍——parked 的那个也要，否则第一次
      //   点回「主题设置」会先看到旧选中态。pane 数量最多一个，成本可忽略。
      function syncPanes() {
        var panes = doc.querySelectorAll('[data-mar-pane]');
        for (var i = 0; i < panes.length; i++) syncPane(panes[i]);
      }

      // ---- boot overlay ----------------------------------------------------
      // New deepseek intro + marathon sequence, adapted from the standalone
      // 启动动画.html. Everything is injected as ONE self-contained host
      // (#dshMarBootHost, transparent, fixed, topmost, pointer-events:none) so it
      // can never interfere with the DSH app underneath. Lifecycle:
      //   marathon engine ends -> __mbBootDone -> fade -> remove host
      //   watchdog (18s) guarantees the overlay can never stay stuck
      //   plugin dispose  -> bootCleanup() tears everything down
      //
      // DESKTOP: the shell's window is created with `transparent: true` (see
      // shell-patch/), so this overlay paints no backdrop of its own — the
      // desktop shows through it while the green whale logo and the HUI frames
      // appear one after another. See src/boot/boot.css.
      var bootCleanup = null;

      // ---- stale boot flag watchdog (#5) ------------------------------------
      // The attribute is written by the payload's intro engine (forceTransparent
      // in src/boot/engine-intro.js) — that is, only AFTER #dshMarBootHost has
      // been appended to <body>, so a correctly-running boot always has a host
      // behind the flag. The failure mode is the OTHER order: an attribute that
      // survives its host (hot reload, a torn-down module, an engine that died
      // mid-way), and boot.css then hides every `body > *` behind it. Two
      // guards, both cheap:
      //   · an attribute observer reacts the moment the flag is written — if no
      //     host exists at that instant, it is a leftover and is dropped;
      //   · an 8s backstop, re-armed on every apply() and on every write, so a
      //     write that lands before the host (or a host removed right after)
      //     can never outlive the grace window. 8s > the 18s-bounded reveal's
      //     own teardown path is not needed: the backstop only acts when the
      //     host is ALREADY gone.
      var BOOT_FLAG_GRACE_MS = 8000;
      var bootFlagTimer = null;
      var bootFlagObserver = null;

      function bootFlagDrop() {
        if (!doc || !doc.documentElement) return false;
        if (!doc.documentElement.hasAttribute('data-mar-boot')) return false;
        // a live overlay is the ONLY legitimate reason for the flag
        if (doc.getElementById('dshMarBootHost')) return false;
        doc.documentElement.removeAttribute('data-mar-boot');
        return true;
      }

      function bootFlagArm() {
        if (typeof setTimeout !== 'function') return;
        if (bootFlagTimer) clearTimeout(bootFlagTimer);
        bootFlagTimer = setTimeout(function () {
          bootFlagTimer = null;
          bootFlagDrop();
        }, BOOT_FLAG_GRACE_MS);
      }

      function bootFlagWatch() {
        if (!doc || !doc.documentElement) return;
        bootFlagDrop();
        bootFlagArm();
        if (bootFlagObserver || typeof MutationObserver === 'undefined') return;
        bootFlagObserver = new MutationObserver(function () {
          // No host at write time = a leftover from a dead boot. Otherwise the
          // write is legitimate; re-arm so the grace window starts at the write,
          // not at apply().
          if (bootFlagDrop()) return;
          bootFlagArm();
        });
        try {
          bootFlagObserver.observe(doc.documentElement, {
            attributes: true, attributeFilter: ['data-mar-boot'],
          });
        } catch (e) { bootFlagObserver = null; }
      }
      // Session marker: the animation plays once per cold start. Reopening the
      // window from the tray does not reload the page, and an in-app reload is
      // explicitly excluded below, so together the two cover both "don't replay
      // on a refresh" and "don't replay when the window is restored".
      var BOOT_ONCE_KEY = 'mar.boot.played';

      function bootIsPageLoad() {
        try {
          var entries = performance.getEntriesByType('navigation');
          if (entries && entries.length > 0 && entries[0].type) return entries[0].type === 'navigate';
        } catch (e) {}
        // No Navigation Timing (older engines, tests): assume a real load.
        return true;
      }
      function bootAlreadyPlayed() {
        try { return sessionStorage.getItem(BOOT_ONCE_KEY) === '1'; } catch (e) { return false; }
      }
      function markBootPlayed() {
        try { sessionStorage.setItem(BOOT_ONCE_KEY, '1'); } catch (e) {}
      }

      // ---- native caption band: self-heal (2026-11-04) ---------------------
      // 用户报：「正常界面下右上角三个按钮不见了（看不见），但能在大概的位置
      // 点击，有效果；我在主题设置里切换了一次浅色和深色后又正常了」。
      //
      // 三个按钮是 Electron 的 titleBarOverlay：**画面**来自这个页面，**按钮**
      // 来自窗口框架。所以「看得见形状却看不见按钮」只有一种可能 —— 覆盖层的
      // color 与 symbolColor 取到了同一个值，也就是壳补丁的隐藏态
      // bootChromeHidden() = 两者都 "rgba(0, 0, 0, 0)"。那个态是启动动画期间
      // 用的，动画结束必须由页面再要一次「恢复可见」。这条恢复链有两处会丢：
      //
      //   ① 主进程对「窗口还没显示」的请求是排队 window.once('show', apply)，
      //      而每次排队只带**自己那一次调用**的 visible：只要 show 事件落在
      //      「恢复之后、更晚的一次隐藏请求之前」，最后画上去的就是隐藏态。
      //   ② 壳自己的配色测量（preload 的 syncWindowsAppearance）只在 <head>
      //      变更和 body 的 style / data-ds-dark-theme 上重跑，**不监听
      //      body.class**；而主题切浅色/深色只改 class。所以壳量到的是上一套
      //      配色。用户手动切一次时主题会顺带给宿主设 theme（data-ds-dark-theme
      //      变动），测量才重跑 —— 这才是「切一次就正常」的真相：不是切一下
      //      能修好，而是碰巧触发了重测。
      //
      // 这里不猜主进程的状态，只按我们自己量到的一对颜色做三件确定的事：
      //   1) 起手 90 秒内每 2 秒、以及 body 的 class/style 一变，就按壳的同一
      //      口径重新量一次（隐藏 span 取 --dsw-specific-sidebar-fill 当底色、
      //      --dsw-alias-label-primary 当字形色）；
      //   2) 与上次送出的不一样，就**无去重地**再要一次「可见」（要去纠的可能
      //      正是主进程停在隐藏态），并在 <head> 里 append/remove 一个空
      //      <style> 逼壳重跑测量 —— 两步合起来才同时覆盖上面两条缝；
      //   3) 启动动画期间（html[data-mar-boot] 或 #dshMarBootHost 还在）一律
      //      不动，否则会把动画要隐藏的按钮又画回去（0.5.2 修过的「按钮突兀」）。
      // 非桌面壳（没有 dshDesktopBootChrome）时整段是空转。
      var CAPTION_PROBE_ID = 'mar-caption-probe';
      var CAPTION_WINDOW_MS = 90000;
      var CAPTION_TICK_MS = 2000;
      var CAPTION_RESEND_MS = 15000;
      var captionLastKey = '';
      var captionLastAt = 0;
      var captionPokes = 0;
      var captionTimer = null;
      var captionObserver = null;
      var captionPending = null;
      var captionDeep = null;

      function captionBridge() {
        if (typeof window === 'undefined') return null;
        var bridge = window.dshDesktopBootChrome;
        if (bridge && typeof bridge.chrome === 'function') return bridge;
        var boot = window.dshDesktopBoot;
        if (boot && typeof boot.chrome === 'function') return boot;
        return null;
      }

      // Same measurement the shell's preload does, so both sides agree on the
      // pair. `position:fixed` keeps the probe out of every theme scan
      // (bgPaintWalker skips fixed/absolute layers); body's *child* list is not
      // observed by the shell, so mounting it cannot cause a repaint by itself.
      function captionMeasure() {
        if (!body || !body.appendChild) return null;
        var probe = doc.getElementById(CAPTION_PROBE_ID);
        if (!probe) {
          probe = doc.createElement('span');
          probe.id = CAPTION_PROBE_ID;
          probe.setAttribute('aria-hidden', 'true');
          probe.style.cssText = 'position:fixed;left:-8px;top:-8px;width:0;height:0;' +
            'visibility:hidden;pointer-events:none;overflow:hidden;' +
            'background-color:var(--dsw-specific-sidebar-fill);' +
            'color:var(--dsw-alias-label-primary);';
          try { body.appendChild(probe); } catch (e) { return null; }
        }
        if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return null;
        var cs = window.getComputedStyle(probe);
        if (!cs) return null;
        return { fill: cs.backgroundColor, ink: cs.color };
      }

      function captionBootRunning() {
        if (doc.documentElement && doc.documentElement.hasAttribute('data-mar-boot')) return true;
        return !!(doc.getElementById && doc.getElementById('dshMarBootHost'));
      }

      function captionPokeHead() {
        var head = doc.head || doc.documentElement;
        if (!head || !head.appendChild) return;
        try {
          var poke = doc.createElement('style');
          poke.setAttribute('data-mar-caption-poke', '1');
          head.appendChild(poke);
          if (poke.parentNode) poke.parentNode.removeChild(poke);
        } catch (e) {}
      }

      function captionSync() {
        if (captionBootRunning()) return false;
        var pair = captionMeasure();
        if (!pair || !pair.fill || !pair.ink) return false;
        // A fully transparent fill means the palette has not resolved yet (the
        // stylesheet lands after the first paint). Sending it would ask the shell
        // to paint a see-through band — that is the bug, not the fix.
        if (/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(pair.fill)) return false;
        var key = pair.fill + '|' + pair.ink;
        var changed = key !== captionLastKey;
        var now = Date.now();
        // The re-assert is deliberately not deduped on `changed`: the state being
        // corrected IS "hidden", which our own previous request already asked to
        // leave. But it also must not be one IPC every tick for 90 s, so a repeat
        // of the same request is throttled to one per 15 s — six in the window,
        // and instantly again the moment anything about the palette moves.
        if (!changed && (now - captionLastAt) < CAPTION_RESEND_MS) return false;
        captionLastKey = key;
        captionLastAt = now;
        var bridge = captionBridge();
        if (bridge) {
          try { bridge.chrome(true, 'caption'); } catch (e) {}
        }
        // The <head> poke is what makes the SHELL re-measure, and it costs a
        // document-wide mutation, so it is rationed: on every palette change
        // (that is the "切浅色/深色" repair path) plus the first few ticks after
        // mount, which is where a shell that missed the restore is caught.
        // A throttled re-assert therefore only repeats the visibility request.
        if (changed || captionPokes < 3) {
          captionPokes++;
          captionPokeHead();
        }
        return changed;
      }

      function captionSchedule() {
        if (typeof setTimeout !== 'function') return;
        if (captionPending !== null) return;
        captionPending = setTimeout(function () {
          captionPending = null;
          try { captionSync(); } catch (e) {}
        }, 120);
      }

      function captionTick() {
        try { captionSync(); } catch (e) {}
      }

      function captionMount() {
        if (typeof setTimeout !== 'function') return;
        // body.class is the theme's own switch (theme-marathon, mar-bg-light,
        // mar-bg-on …) and is precisely what the shell does not watch.
        if (typeof MutationObserver === 'function' && body) {
          try {
            captionObserver = new MutationObserver(function () { captionSchedule(); });
            captionObserver.observe(body, { attributes: true, attributeFilter: ['class', 'style'] });
            if (doc.documentElement) {
              captionObserver.observe(doc.documentElement, { attributes: true, attributeFilter: ['lang', 'class'] });
            }
          } catch (e) { captionObserver = null; }
        }
        if (typeof doc.addEventListener === 'function') {
          doc.addEventListener('visibilitychange', captionOnVisible);
        }
        captionTimer = setInterval(captionTick, CAPTION_TICK_MS);
        captionDeep = setTimeout(captionTeardownTimer, CAPTION_WINDOW_MS);
        // Deferred: buildBoot() runs a few lines above and sets
        // html[data-mar-boot] synchronously, so an immediate call is a no-op.
        captionSchedule();
      }

      function captionOnVisible() {
        if (typeof doc === 'undefined' || doc.hidden) return;
        captionSchedule();
      }

      function captionTeardownTimer() {
        if (captionTimer) { clearInterval(captionTimer); captionTimer = null; }
        if (captionDeep) { clearTimeout(captionDeep); captionDeep = null; }
      }

      // Last word on the way out: the plugin may be unloaded while the shell is
      // still holding a state we asked for (or a restore we asked for never
      // landed). Ask for "visible" once more, without touching the DOM.
      function captionAskVisible() {
        var bridge = captionBridge();
        if (!bridge) return;
        try { bridge.chrome(true, 'caption-dispose'); } catch (e) {}
      }

      function captionDispose() {        captionTeardownTimer();
        if (captionPending !== null) { clearTimeout(captionPending); captionPending = null; }
        if (captionObserver) { captionObserver.disconnect(); captionObserver = null; }
        if (typeof doc.removeEventListener === 'function') {
          doc.removeEventListener('visibilitychange', captionOnVisible);
        }
        captionLastKey = '';
        var probe = doc.getElementById(CAPTION_PROBE_ID);
        if (probe && probe.parentNode) probe.parentNode.removeChild(probe);
      }


      function bootIsPageLoad() {
        try {
          var entries = performance.getEntriesByType('navigation');
          if (entries && entries.length > 0 && entries[0].type) return entries[0].type === 'navigate';
        } catch (e) {}
        // No Navigation Timing (older engines, tests): assume a real load.
        return true;
      }
      function bootAlreadyPlayed() {
        try { return sessionStorage.getItem(BOOT_ONCE_KEY) === '1'; } catch (e) { return false; }
      }
      function markBootPlayed() {
        try { sessionStorage.setItem(BOOT_ONCE_KEY, '1'); } catch (e) {}
      }

      // ---- 启动动画 开关（2026-10-17，用户要求） ---------------------------
      // 冷启动揭幕以前**没有 UI 开关**：想关只能停用整个插件（docs/INSTALL.md
      // 当时就是这么写的）。现在它是设置页里的一组，和其它开关一样独立。
      //   · 默认 **ON**，所以老用户的行为一个字节不变；
      //   · 它**只在下次冷启动生效** —— 揭幕发生在插件 mount 的当下，等设置页
      //     能打开时它早结束了。所以这里不做"预览"，只在行下面写清楚这一点；
      //   · 关掉时如果揭幕**正好还在跑**（理论上可能：装载后几秒内就打开设置），
      //     直接把覆盖层收掉（bootCleanup 就是现成的 teardown）。
      var BOOT_STORE_KEY = 'mar.boot.v1';
      function bootLoad() {
        try {
          var raw = (typeof window !== 'undefined' && window.localStorage)
            ? window.localStorage.getItem(BOOT_STORE_KEY) : null;
          if (!raw) return { on: true };
          var parsed = JSON.parse(raw);
          return { on: !(parsed && parsed.on === false) };
        } catch (e) { return { on: true }; }
      }
      function bootSave() {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(BOOT_STORE_KEY, JSON.stringify(BOOT_STATE));
          }
        } catch (e) {}
      }
      var BOOT_STATE = bootLoad();
      function bootEnabled() { return BOOT_STATE.on !== false; }
      function bootReduced() {
        return !!(typeof window !== 'undefined' && window.matchMedia &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      }

      function buildBoot() {
        if (bootCleanup) return;                 // already running / done
        if (!BOOT_PAYLOAD) return;               // template without build
        // The master switch. OFF means the cold-start reveal never mounts: no
        // host, no stylesheet, no engine scripts, no watchdog timer.
        if (!bootEnabled()) return;
        // The only ways out are the OS-level reduced-motion preference and the
        // cold-start gate (first document load of this window only).
        if (bootReduced()) return;
        if (bootAlreadyPlayed() || !bootIsPageLoad()) return;
        markBootPlayed();

        var host = doc.createElement('div');
        host.id = 'dshMarBootHost';
        // no `mar-layer` class any more — that base rule was removed together
        // with the decorative layers; the host is positioned by its own
        // `#dshMarBootHost{position:fixed;inset:0;…}` rule in the boot payload.
        host.className = 'mar-boot-host';
        // Geometry and clipping are pinned inline as well as in boot.css, for the
        // same reason as #mar-ascii-bg: the HUI frames zoom to 19558x8778px
        // (measured), and they are only kept from blowing the document up to that
        // size by the host's `overflow:hidden`. If the sheet were ever withdrawn
        // while the host was still mounted, the overlay would stop being a
        // viewport-sized clipping box and become a 19558x8778 scroll area.
        host.style.cssText =
          'position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147483000;' +
          'background:transparent;overflow:hidden;pointer-events:none;';

        // 1) namespaced boot stylesheet (payload css), scoped by the host id
        var st = doc.createElement('style');
        st.setAttribute('data-boot', '1');
        st.textContent = BOOT_PAYLOAD.css;
        host.appendChild(st);

        // 2) payload DOM (intro + marathon containers; images already base64)
        var tmp = doc.createElement('div');
        tmp.innerHTML = BOOT_PAYLOAD.html;
        while (tmp.firstChild) host.appendChild(tmp.firstChild);

        body.appendChild(host);

        var removed = false;
        var watchdog = null;

        function teardown() {
          if (removed) return;
          removed = true;
          if (watchdog) { clearTimeout(watchdog); watchdog = null; }
          if (typeof window !== 'undefined') {
            try { if (window.__mbMarathon) window.__mbMarathon.stop(); } catch (e) {}
            // __mbIntroStop restores html/body/#root backgrounds and the native
            // window buttons, and must run even if the payload never started.
            try { if (window.__mbIntroStop) window.__mbIntroStop(); } catch (e) {}
            window.__mbBootDone = null;
          }
          if (host.parentNode) host.parentNode.removeChild(host);
          // #5: the host is the flag's ONLY justification. __mbIntroStop above
          // normally gives the attribute back, but it lives in the payload and
          // may be missing (CSP, an engine that died early, a torn-down module),
          // so drop it here as well — removing the host and keeping the flag is
          // exactly the state that blanked the whole window.
          bootFlagDrop();
          bootCleanup = null;
        }

        function fadeOut() {
          if (removed) return;
          host.style.opacity = '0';
          setTimeout(teardown, 550);
        }

        // marathon engine calls this when its timeline fully finished
        window.__mbBootDone = function () {
          if (removed) return;
          setTimeout(fadeOut, 250);   // brief hold before the fade
        };

        // safety net — if an engine crashed or rAF was throttled, never leave a
        // stuck overlay over the harness. The desktop cut is ~2s longer than the
        // web one (staged reveal + flat-plate hold), hence 18s.
        watchdog = setTimeout(fadeOut, 18000);

        // 3) engines. Classic scripts execute synchronously on append; the
        // marathon engine must be registered first (intro starts it late).
        function injectScript(src) {
          var s = doc.createElement('script');
          s.textContent = src;
          host.appendChild(s);
        }
        injectScript(BOOT_PAYLOAD.marathon);
        injectScript(BOOT_PAYLOAD.intro);
        // 2026-09-26 — engine-intro.js announces itself at the tail of its own
        // IIFE (hide the native window buttons + make the page see-through). The
        // call used to sit *between* the two injectScript lines above, i.e. before
        // the script that defines the hook was appended, so `window.__mbIntroStart`
        // was undefined and the whole desktop contract silently never ran: the
        // boot played on an opaque plate with the caption buttons on top.
        // Kept as a belt-and-braces call for a payload whose tail somehow did not
        // run; both steps are idempotent.
        try { if (window.__mbIntroStart) window.__mbIntroStart(); } catch (e) {}

        // if CSP / jsdom blocked both engines, drop the overlay quickly instead
        // of leaving an empty transparent window (marathonBroken still lets the
        // intro orchestrator handle its own fallback)
        var ran = (typeof window !== 'undefined') &&
          (!!window.__mbMarathon || !!window.__mbIntroStop || !!window.__mbMarathonBroken);
        if (!ran) setTimeout(fadeOut, 200);

        bootCleanup = teardown;
      }

      // ---- settings panel: mosaic reveal ----------------------------------
      // DSH's settings dialog has no entrance animation of its own (measured:
      // transform none, opacity 1, getAnimations() empty), so this is the only
      // thing that plays when it opens. Tuning knobs:
      //   MOSAIC_GRID  5      tiles per side — 5x5 = 25 on the 800x800 panel,
      //                       i.e. 160px squares
      //   MOSAIC_STEP  .0155  seconds between tiles
      //   MOSAIC_HEAD  3      how many tiles share the very first frame
      //   MOSAIC_DUR   0      per-tile length. Zero on purpose: a tile is
      //                       switched off, not animated. Keep it in sync with
      //                       the `animation:mar-tile-out 0s` duration above.
      // Budget: the whole reveal has 0.5s. Last tile fires at
      // (25 - 3) * 0.0155 = 0.341s and, being instantaneous, that is also
      // where the reveal ends — nothing is moving at 0.5s. The panel's own
      // content carries no animation at all (a fade on it was removed on
      // request). Change the step and the arithmetic has to be redone.
      var MOSAIC_GRID = 5;
      var MOSAIC_STEP = 0.0155;
      var MOSAIC_HEAD = 3;
      var MOSAIC_DUR = 0;

      var mosaicTimer = null;
      var mosaicLayerOn = null;
      var mosaicObserver = null;
      // DSH 0.2.0-rc.2 portals the settings dialog to <body>, so a second
      // observer on body's OWN children is what actually sees it mount. See
      // watchSettingsHost() for the measured path.
      var mosaicBodyObserver = null;
      var mosaicRoot = null;
      var mosaicSweeper = null;
      var settingsKick = 0;      // rAF handle for the immediate settings sweep
      var settingsPokes = [];    // startup retries aimed at installing the observer

      function reducedMotion() {
        return !!(typeof window !== 'undefined' && window.matchMedia &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      }

      // Deterministic shuffle (mulberry32 + Fisher-Yates). The brief asked for
      // "random, but not really random": the order looks scattered yet is the
      // same on every open, so a reveal that looks wrong can be reproduced.
      function mosaicOrder(n) {
        var seed = 0x9E3779B9, out = [], i, j, t;
        function rnd() {
          seed = (seed + 0x6D2B79F5) | 0;
          t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
        for (i = 0; i < n; i++) out.push(i);
        for (i = n - 1; i > 0; i--) {
          j = Math.floor(rnd() * (i + 1));
          t = out[i]; out[i] = out[j]; out[j] = t;
        }
        return out;
      }

      // The settings dialog, found by structure rather than by hash prefix:
      // the panel is the ancestor of the nav cells that carries a "*_panel"
      // class. A DSH rebuild that changes only the hash keeps matching.
      function findSettingsPanel() {
        var cells = doc.querySelectorAll('[class*="_navCell"]');
        for (var i = 0; i < cells.length; i++) {
          var n = cells[i];
          while (n && n !== body) {
            if (typeof n.className === 'string' &&
                /(^|\s)[A-Za-z0-9_-]*_panel(\s|$)/.test(n.className)) return n;
            n = n.parentNode;
          }
        }
        return null;
      }

      function clearMosaic() {
        if (mosaicTimer) { clearTimeout(mosaicTimer); mosaicTimer = null; }
        if (mosaicLayerOn) {
          var l = mosaicLayerOn.querySelector('.mar-mosaic');
          if (l && l.parentNode) l.parentNode.removeChild(l);
          mosaicLayerOn.classList.remove('mar-mosaic-on');
          mosaicLayerOn = null;
        }
      }

      function mountMosaic(panel) {
        if (!panel || reducedMotion()) return;
        if (panel.querySelector('.mar-mosaic')) return;
        panel.__marMosaicPlayed = true;

        var total = MOSAIC_GRID * MOSAIC_GRID;
        var order = mosaicOrder(total);
        var pct = 100 / MOSAIC_GRID;
        var layer = doc.createElement('div');
        layer.className = 'mar-mosaic';

        for (var seq = 0; seq < total; seq++) {
          var idx = order[seq];
          var cell = doc.createElement('i');
          cell.style.left = ((idx % MOSAIC_GRID) * pct) + '%';
          cell.style.top = (Math.floor(idx / MOSAIC_GRID) * pct) + '%';
          cell.style.width = pct + '%';
          cell.style.height = pct + '%';
          // toFixed(4), not (2): the step is 0.0155s, so two decimals would
          // round every delay onto 0.02s and collapse the whole wave into a
          // flat sheet — the tiles would still fire, just not in sequence.
          cell.style.animationDelay =
            (seq < MOSAIC_HEAD ? 0 : (seq - MOSAIC_HEAD + 1) * MOSAIC_STEP).toFixed(4) + 's';
          layer.appendChild(cell);
        }

        // mar-mosaic-on is a state flag, not an animation hook — nothing in the
        // sheet keys off it any more (the panel's columns used to fade under
        // it). It means "this panel has a reveal on it", which is what the
        // teardown path and the unit test check.
        panel.appendChild(layer);
        panel.classList.add('mar-mosaic-on');
        mosaicLayerOn = panel;

        // last tile's delay + its own duration, plus a frame of slack
        var span = (total - MOSAIC_HEAD) * MOSAIC_STEP + MOSAIC_DUR + 0.2;
        mosaicTimer = setTimeout(clearMosaic, span * 1000);
      }

      // "is the dialog currently open?" — walking up to look for display:none
      // instead of testing offsetParent/getClientRects: offsetParent is null for
      // anything under a position:fixed ancestor (the dialog is), and jsdom — used
      // by the unit test — has no layout engine at all, so rects are always empty
      // and every panel would look closed. DSH unmounts the dialog when it closes,
      // so the doc.contains() check alone covers the real case.
      function panelVisible(panel) {
        if (!doc.contains(panel)) return false;
        var n = panel, style;
        while (n && n !== body) {
          style = (typeof window !== 'undefined' && window.getComputedStyle)
            ? window.getComputedStyle(n) : null;
          if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
          n = n.parentNode;
        }
        return true;
      }

      // Immediate settings sweep: the MutationObserver on _settingsArea calls
      // this instead of waiting for the 1.2s timer, so the 「主题设置」 tab is
      // attached on the same frame the dialog mounts. Coalesced through rAF —
      // mounting the dialog fires a burst of mutations and we only want one
      // sweep out of it. Returns silently if the sweep is already queued.
      function kickSettingsSweep() {
        if (settingsKick) return;
        if (typeof requestAnimationFrame === 'function') {
          settingsKick = requestAnimationFrame(function () {
            settingsKick = 0;
            sweepSettingsPanel();
          });
        } else {
          settingsKick = setTimeout(function () {
            settingsKick = 0;
            sweepSettingsPanel();
          }, 0);
        }
      }

      // The mount host the current DSH build actually uses. Installed once, and
      // deliberately narrow: `childList` on <body> with NO `subtree`, so it fires
      // when the dialog's overlay is appended/removed as a direct child of body
      // and at no other time. The `_settingsArea` observer stays as well, because
      // an older DSH layout mounts the dialog *inside* that subtree and we must
      // keep working there. Both funnel into the same rAF-coalesced kick.
      function watchSettingsHost() {
        if (mosaicBodyObserver) return;
        if (typeof MutationObserver === 'undefined') return;
        var host = doc.body;
        if (!host) return;
        mosaicBodyObserver = new MutationObserver(kickSettingsSweep);
        try { mosaicBodyObserver.observe(host, { childList: true }); }
        catch (e) { mosaicBodyObserver = null; }
      }

      function sweepSettingsPanel() {
        // WHERE THE DIALOG ACTUALLY MOUNTS DEPENDS ON THE DSH BUILD.
        // The comment below (and the modal note in bgModal) describes the layout
        // this was written against: the dialog was a descendant of
        // `_settingsArea` (hHd-Xa_root > _footArea > _settingsArea > div >
        // _overlay > _panel). DSH 0.2.0-rc.2 — the Desktop runtime — **portals
        // it to <body> instead**. Measured live on the Desktop:
        //   body.theme-marathon > div.wCInkW_overlay > div.wCInkW_panel
        //        > nav.wCInkW_nav > div.wCInkW_navList > button.wCInkW_navCell
        // while `_settingsArea` holds nothing but the account-menu launcher
        // (`data-slot="sidebar.settings"`). `contains()` on the dialog returns
        // false. So the _settingsArea observer never fired when 设置 opened and
        // the theme fell back to the 1.2s `sweepReveals` interval — which is the
        // delay before the mosaic reveal and the 「主题设置」 tab appear.
        // Observing body's OWN children (childList, NO subtree) is exact for that
        // mount and costs nothing: it fires only when a direct child of <body> is
        // added or removed, which is a handful of times per session.
        watchSettingsHost();

        // (re)attach if the sidebar was rebuilt underneath us — the dialog is
        // mounted inside the sidebar, so watching that subtree is enough and
        // costs nothing while the conversation streams.
        var area = doc.querySelector('[class*="_settingsArea"]');
        if (area && area !== mosaicRoot) {
          if (mosaicObserver) { try { mosaicObserver.disconnect(); } catch (e) {} }
          mosaicRoot = area;
          // The dialog is a child of _settingsArea, and _settingsArea itself is
          // permanent (it lives in the sidebar footer whether or not settings
          // are open), so this subtree is exactly the right place to watch. The
          // callback must NOT wait for the 1.2s sweep: the tab has to be there
          // the moment the dialog paints, otherwise opening 设置 shows the tab
          // popping in half a second later. rAF-coalesced so the burst of
          // mutations that mounts the dialog costs one sweep, not ten.
          mosaicObserver = new MutationObserver(kickSettingsSweep);
          try { mosaicObserver.observe(area, { childList: true, subtree: true }); }
          catch (e) { mosaicObserver = null; }
        }
        var panel = findSettingsPanel();
        if (!panel) {
          // Dialog unmounted (DSH removes the overlay when it closes, so this is
          // the normal "closed" path). findSettingsPanel() can no longer see the
          // old panel, so drop the bookkeeping here — otherwise the layer would
          // stay attached to a detached node and the timer would outlive it.
          if (mosaicLayerOn) clearMosaic();
          return;
        }
        if (!panelVisible(panel)) {
          // closed: arm it so the reveal plays again next time it opens
          if (panel.__marMosaicPlayed) { panel.__marMosaicPlayed = false; clearMosaic(); }
          return;
        }
        if (!panel.__marMosaicPlayed) mountMosaic(panel);
        mountSettingsTab(panel);
        // Keep the host content hidden while our tab is on: a React re-render
        // can replace the column node, taking the data-mar-host-content marker
        // with it. Idempotent — one attribute write at most.
        if (panel.classList.contains('mar-tab-on') && typeof panel.__marMarkHost === 'function') {
          panel.__marMarkHost(true);
        }
      }

      // ---- task board: one intro per column --------------------------------
      // The board is owned by @linxin666/dsh-client-ui-task-board, which is
      // always mounted in the centre column and merely hidden while inactive,
      // so "the board just opened" is a visibility question, not a mount one.
      // The unit of the animation is the COLUMN (the five 选项卡), not the board
      // and not the card. Each tab gets four reticles on an opaque slab, the
      // slab being a 2x2 grid of four rectangles that leave one at a time, plus
      // one frame; all five tabs run on the same clock. Four beats:
      //   reticles flash then hold   0    -> .1s    [stylesheet]
      //   frame arrives              1.20 -> 1.36s [stylesheet, .16s fade]
      //   rectangles leave           1.50 / 1.58 / 1.66 / 1.74s
      //   frame leaves with the 4th  1.74 -> 1.90s
      // The frame leaves ON the last rectangle's frame, which is what the
      // reference does: the ring is up for the whole of the reveal and is gone
      // the instant the tab is complete. Tuning knobs:
      //   BOARD_FRAME_AT    1.20  when the frame arrives
      //   BOARD_BLOCK_AT    1.50  when the first rectangle leaves
      //   BOARD_BLOCK_STEP  .08   gap between rectangles (4 -> .24s)
      //   BOARD_LAST_AT     1.74  = BLOCK_AT + 3 * BLOCK_STEP; frame leaves here
      //   BOARD_INTRO_SPAN  1.90  = LAST_AT + the .16s fade in the stylesheet
      //   BOARD_BLOCK_TURN  [0,1,3,2]  which cell leaves on which beat, as
      //                                0-based cell offsets in row-major order
      //                                (0=TL 1=TR 2=BL 3=BR) — that IS the 1-2-4-3
      //                                the brief asks for: TL, TR, BR, BL
      // The .1s flash and the .16s frame fades live in the stylesheet; change
      // one and the other has to follow, or the beats stop adding up.
      var BOARD_FRAME_AT = 1.20;
      var BOARD_BLOCK_AT = 1.50;
      var BOARD_BLOCK_STEP = 0.08;
      var BOARD_LAST_AT = 1.74;
      var BOARD_INTRO_SPAN = 1.90;
      var BOARD_BLOCKS = 4;
      var BOARD_BLOCK_TURN = [0, 1, 3, 2];
      var BOARD_CROSS_ARMS = ['mar-h', 'mar-v', 'mar-dot'];

      var boardIntroOn = null;
      var boardIntroTimer = null;
      var boardObserver = null;

      function clearBoardIntro() {
        if (boardIntroTimer) { clearTimeout(boardIntroTimer); boardIntroTimer = null; }
        if (boardIntroOn) {
          var l = boardIntroOn.querySelector('.mar-board-intro');
          if (l && l.parentNode) l.parentNode.removeChild(l);
          boardIntroOn = null;
        }
      }

      function mountBoardIntro(board) {
        if (!board || reducedMotion()) return;
        if (board.querySelector('.mar-board-intro')) return;
        board.__marIntroPlayed = true;

        var br = board.getBoundingClientRect();
        var layer = doc.createElement('div');
        layer.className = 'mar-board-intro';

        // One decimal is enough to stay on sub-pixel layouts, and dropping the
        // trailing .0 keeps the generated markup readable.
        function px(v) { return (Math.round(v * 10) / 10) + 'px'; }

        // The delay belongs to the CELL, not to the beat: cell
        // BOARD_BLOCK_TURN[b] leaves on beat b. Read it that way round and the
        // 1-2-4-3 is just the table above.
        var cellDelay = [];
        for (var b = 0; b < BOARD_BLOCK_TURN.length; b++) {
          cellDelay[BOARD_BLOCK_TURN[b]] = BOARD_BLOCK_AT + b * BOARD_BLOCK_STEP;
        }

        // One block per column, clipped to the board. Append order inside a tab
        // is load-bearing: the rectangles are opaque, so the frame has to come
        // after them or it would never be seen.
        var cols = board.querySelectorAll('[data-dsh-part="column"]');
        for (var k = 0; k < cols.length; k++) {
          var r = cols[k].getBoundingClientRect();
          var x1 = Math.max(r.left, br.left);
          var y1 = Math.max(r.top, br.top);
          var x2 = Math.min(r.right, br.right);
          var y2 = Math.min(r.bottom, br.bottom);
          if (x2 - x1 < 8 || y2 - y1 < 8) continue;

          var box = doc.createElement('div');
          box.className = 'mar-col-intro';
          box.style.left = px(x1 - br.left);
          box.style.top = px(y1 - br.top);
          box.style.width = px(x2 - x1);
          box.style.height = px(y2 - y1);
          // the two frame fades take only their delays from here; the lengths
          // are in the stylesheet
          box.style.setProperty('--mar-frame-at', BOARD_FRAME_AT + 's');
          box.style.setProperty('--mar-frame-out-at', BOARD_LAST_AT + 's');

          // cells in row-major order: 0=TL 1=TR 2=BL 3=BR
          for (var c = 0; c < BOARD_BLOCKS; c++) {
            var mask = doc.createElement('span');
            mask.className = 'mar-col-mask';
            // toFixed(2) is enough here — the step is .08s, not the mosaic's
            // .0155s, so nothing is lost to rounding.
            mask.style.animationDelay = cellDelay[c].toFixed(2) + 's';

            var cross = doc.createElement('span');
            cross.className = 'mar-cross';
            for (var a = 0; a < BOARD_CROSS_ARMS.length; a++) {
              var arm = doc.createElement('i');
              arm.className = BOARD_CROSS_ARMS[a];
              cross.appendChild(arm);
            }
            mask.appendChild(cross);
            box.appendChild(mask);
          }
          var frame = doc.createElement('span');
          frame.className = 'mar-col-frame';
          box.appendChild(frame);

          layer.appendChild(box);
        }

        // nothing laid out (board measured mid-transition, columns collapsed)
// leave the flag set so we do not thrash, next open replays it
        if (!layer.firstChild) return;

        board.appendChild(layer);
        boardIntroOn = board;
        boardIntroTimer = setTimeout(clearBoardIntro, (BOARD_INTRO_SPAN + 0.1) * 1000);
      }

      function sweepBoardIntro() {
        var board = doc.querySelector('[data-dsh-taskboard-board]');
        if (!board) {
          if (boardIntroOn) clearBoardIntro();
          return;
        }
        if (!panelVisible(board)) {
          // closed: rearm so the next open plays the intro again
          if (board.__marIntroPlayed) { board.__marIntroPlayed = false; clearBoardIntro(); }
          return;
        }
        if (!board.__marIntroPlayed) mountBoardIntro(board);
      }

      // The plugin reflects its open state as an attribute on <html>, so an
      // attribute observer catches the open on the same turn instead of waiting
      // for the 1.2s sweep; the sweep stays as the backstop (it is what notices
      // a shell rebuild that swaps the board node out from under us).
      sweepBoardIntro();
      if (typeof MutationObserver !== 'undefined') {
        boardObserver = new MutationObserver(sweepBoardIntro);
        try {
          boardObserver.observe(doc.documentElement, {
            attributes: true, attributeFilter: ['data-dsh-taskboard-active'],
          });
        } catch (e) { boardObserver = null; }
      }

      // both reveals ride the same tick — one timer for the whole theme
      sweepSettingsPanel();
      // The MutationObserver can only be installed once _settingsArea exists,
      // and DSH renders that with the sidebar — which may be after this line
      // runs. Without these pokes the first settings open inside the first
      // 1.2s would fall back to the timer and pop the tab in late.
      kickSettingsSweep();
      if (typeof setTimeout === 'function') {
        settingsPokes = [setTimeout(kickSettingsSweep, 320), setTimeout(kickSettingsSweep, 1000)];
      }
      function sweepReveals() {
        sweepSettingsPanel();
        sweepBoardIntro();
        // 轮次尾巴是新渲染出来— — 每次巡扫都补一次结算纸条（拿不到数据时— no-op
billingTick();
        //   Cheap safety net, not a write: if a theme/change was missed (or the
        //   service landed after this plugin at boot), adopt the preference and
        //   the resolved scheme now. It no-ops unless one of the two moved, so
        //   it can never fight 通用设置 and can never oscillate.
        themeAdopt(false);
        //   Same reason, same tick: DSH's theme presenter projects the resolved
        //   snapshot onto <body> as inline custom properties and REMOVES the ones
        //   it wrote last time — which are these same names. Re-asserting here is
        //   what keeps the palette from being undone a beat after it lands.
        themeAliasApply();
        if (BG_STATE.anim) { bgMarkClear(false); bgWatch(); }
      }
      if (typeof setInterval !== 'undefined') mosaicSweeper = setInterval(sweepReveals, 1200);

      // ---- per-turn token settlement ---------------------------------------
      //   每一— *已经结束**的任务，在它的轮次尾巴上贴一张结算小纸条：花了多少钱
//   四桶怎么分、命中率多少、这轮跑了多久
//
      //   为什么贴在轮次尾巴上（而不是像上一版那样浮在输入框上方）：
      //     · 它是**那一轮的注脚**，跟着转录一起滚— —— 用户滚动时位置不变，
      //       因为位置本来就由转录决定
//     · 切会— = 转录整块换掉 = 纸条跟着消失，不存在"展开状态跨会话残留"
//     · DSH 自己在每轮结尾已经画了动作行（复— 分支/用量），我们贴在它前面，
      //       读起来就— 任务结束 — 结算 — 动作"
//
      //   锚点是 DSH 自己的语义属性 `[data-turn-tail="<turn>"]`
      //   （dsh-client-ui-chat — TurnTailNodeView；比哈希类名稳）
//   数据来自主题 Host 半边— `/dsh-mls-billing/state`
var BILLING_ENDPOINT = '/dsh-mls-billing/state';
      var BILLING_POLL_MS = 2000;
      // 会话匹配已经是**精确的**（见 billingDisplayedSessionId），所以这里只剩"别翻太旧"。
      var BILLING_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
      var BILLING_STORE_KEY = 'mar.billing.v1';
      var BILLING_ROWS = [
        ['消费 Token', 'total', 1],
        ['输入 Token', 'input', 0],
        ['输出 Token', 'output', 0],
        ['缓存命中 Token', 'hit', 0],
        ['缓存命中率', 'hitRate', 1],
        ['缓存未命中 Token', 'miss', 0],
        ['本次费用', 'cost', 0],
        ['计费状态', 'status', 1]
      ];
      var billingState = null;
      var billingOpen = {};        // turn -> true；块随转录销毁，所以这份状态天然不跨会
var billingTimer = null;

      // 开关（主题设置里的「每轮 Token 结算」）：默认开，持久化在 localStorage。
function billingLoad() {
        try {
          var raw = (typeof window !== 'undefined' && window.localStorage)
            ? window.localStorage.getItem(BILLING_STORE_KEY) : null;
          if (!raw) return { on: true };
          var parsed = JSON.parse(raw);
          return { on: !(parsed && parsed.on === false) };
        } catch (e) { return { on: true }; }
      }
      function billingSave() {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(BILLING_STORE_KEY, JSON.stringify(BILLING_STATE));
          }
        } catch (e) {}
      }
      var BILLING_STATE = billingLoad();
      function billingEnabled() { return BILLING_STATE.on !== false; }

      // 「客户端当前显示的那个会话」是哪个？
      //
      // **不能读 `snap.current` —— 这个字段不存在**（完整说明见 doneCurrentId()）。
      // 宿主 0.2.0-rc.2 的列表快照只有 ids / byId / phase / projectionsBySession 四项，
      // 所以原先 `(snap && snap.current) ? ... : null` **在这版宿主上恒为 null**，
      // 于是这个函数的两个调用方每次都走「退到最近有账的那个会话」那条 fallback：
      //   · billingTick()：看着 A 会话、后台在跑 B 会话时，会把 B 的数字贴到 A 的尾巴上；
      //   · billingFetch()：不再带 `?session=`，宿主就不会为当前这段对话回填历史账，
      //     重启后旧轮次贴不上便签。
      // 现在与宿主自己的算法一致：byId 里 `retainedBy.mainView > 0` 的那一个。
      //
      // 顺带去掉原来那次性的 `ctx.get('sessions')` 抓取：服务的注册顺序不保证，
      // 抓到 null 就永久失效（完成动画那半边 2026-10-10 已经踩过同一个坑）。这里每次现取。
      function billingDisplayedSessionId() {
        try {
          var sessions = (ctx && typeof ctx.get === 'function') ? ctx.get('sessions') : null;
          if (!sessions || !sessions.list || typeof sessions.list.getSnapshot !== 'function') return null;
          var snap = sessions.list.getSnapshot();
          if (!snap) return null;
          if (snap.current) return String(snap.current);
          var rows = snap.byId || {};
          for (var key in rows) {
            var row = rows[key];
            if (row && row.retainedBy && row.retainedBy.mainView > 0) return String(key);
          }
          return null;
        } catch (e) { return null; }
      }

      /** 摘掉页面上所有纸条（关掉开关、或页面重挂时用）。 */
      function billingDetachAll() {
        var blocks = doc.querySelectorAll('[data-mlsb-turn]');
        for (var i = 0; i < blocks.length; i++) {
          if (blocks[i].parentNode) blocks[i].parentNode.removeChild(blocks[i]);
        }
      }

      /** 开关变化后的即时生效：关 → 摘掉并停止轮询；开 → 立刻拉一次。 */
      function billingApply() {
        if (!billingEnabled()) {
          billingState = null;
          billingDetachAll();
          return;
        }
        billingFetch();
      }

      function mlsbEl(tag, cls, text) {
        var node = doc.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = text;
        return node;
      }

      function mlsbCount(value) {
        var n = Number(value);
        if (!isFinite(n)) return '--';
        return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      }

      function mlsbMoney(value, currency) {
        var n = Number(value);
        if (!isFinite(n)) return '--';
        var symbol = currency === 'USD' ? '$' : '¥';
        var abs = Math.abs(n);
        var digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
        return symbol + n.toFixed(digits);
      }

      function mlsbClock(ms) {
        var total = Math.max(0, Math.floor(Number(ms) / 1000));
        var pad = function (v) { return v < 10 ? '0' + v : String(v); };
        return pad(Math.floor(total / 60)) + ':' + pad(total % 60);
      }

      /** 这一轮该显示的状态：结束/结算中/未定价。 */
      function mlsbStatus(turn, streaming) {
        if (turn.unpriced && turn.unpriced.length > 0) return 'UNPRICED';
        if (streaming) return 'STREAMING';
        return 'SETTLED';
      }

      function buildTurnBlock(turn) {
        var root = mlsbEl('div', 'mlsb-turn');
        root.setAttribute('data-mlsb-turn', String(turn.turn));
        var head = mlsbEl('button', 'mlsb-turn-head');
        head.type = 'button';
        head.setAttribute('aria-expanded', 'false');
        // 2026-10-09（用户）：消息内居中 + 绿条上不放费用 + 两侧各一个十字；字体回默认
var crossLeft = mlsbEl('span', 'mlsb-cross mlsb-left', '+');
        var title = mlsbEl('span', 'mlsb-turn-title', 'TOKEN USAGE');
        var crossRight = mlsbEl('span', 'mlsb-cross mlsb-right', '+');
        head.appendChild(crossLeft);
        head.appendChild(title);
        head.appendChild(crossRight);
        var body = mlsbEl('div', 'mlsb-turn-body');
        // `grid-template-rows:0fr → 1fr`（内层再包一层 min-height:0/overflow:hidden）：
        // 它才是被压成 0 高度的那个；行本身留在里面，展开时高度平滑长出来
var bodyInner = mlsbEl('div', 'mlsb-turn-body-inner');
        var values = {};
        for (var i = 0; i < BILLING_ROWS.length; i++) {
          var row = mlsbEl('div', 'mlsb-row');
          row.appendChild(mlsbEl('span', null, BILLING_ROWS[i][0]));
          var value = mlsbEl('b', BILLING_ROWS[i][2] ? 'mlsb-acid' : null, '--');
          value.setAttribute('data-mlsb', 'turn-' + BILLING_ROWS[i][1]);
          row.appendChild(value);
          bodyInner.appendChild(row);
          values[BILLING_ROWS[i][1]] = value;
        }
        body.appendChild(bodyInner);
        var foot = mlsbEl('div', 'mlsb-turn-foot');
        foot.appendChild(mlsbEl('span', 'mlsb-turn-note', '任务用时'));
        var right = mlsbEl('span', 'mlsb-turn-clock');
        var clock = mlsbEl('span', null, '--:--');
        clock.setAttribute('data-mlsb', 'turn-clock');
        right.appendChild(clock);
        // i 角标：用— 2026-10-09 要求先去掉（"任务用时不需要这— i 和方框了"）
// 需要时取消注释即可（样式里对应的两行也一起取消注释）
// right.appendChild(mlsbEl('span', 'mlsb-info', 'i'));
        foot.appendChild(right);
        root.appendChild(head);
        root.appendChild(body);
        root.appendChild(foot);
        root.mlsbValues = values;
        root.mlsbCrosses = [crossLeft, crossRight];
        root.mlsbHead = head;
        head.addEventListener('click', function () {
          var next = !(root.classList.contains('mlsb-open'));
          if (next) root.classList.add('mlsb-open'); else root.classList.remove('mlsb-open');
          billingOpen[turn.turn] = next;
          head.setAttribute('aria-expanded', next ? 'true' : 'false');
          var sign = next ? '\u2212' : '+';
          crossLeft.textContent = sign;
          crossRight.textContent = sign;
        });
        return root;
      }

      function updateTurnBlock(block, turn) {
        var values = block.mlsbValues;
        var totals = turn.totals || { total: 0, input: 0, out: 0, hit: 0, miss: 0, hitRate: 0 };
        var status = mlsbStatus(turn, false);
        values.total.textContent = mlsbCount(totals.total);
        values.input.textContent = mlsbCount(totals.input);
        values.output.textContent = mlsbCount(totals.out);
        values.hit.textContent = mlsbCount(totals.hit);
        values.hitRate.textContent = (Number(totals.hitRate) * 100).toFixed(1) + '%';
        values.miss.textContent = mlsbCount(totals.miss);
        values.cost.textContent = mlsbMoney(turn.cost, turn.currency || 'CNY');
        values.status.textContent = status;
        values.status.className = status === 'UNPRICED' ? 'mlsb-signal' : (BILLING_ROWS[7][2] ? 'mlsb-acid' : null);
        block.querySelector('[data-mlsb="turn-clock"]').textContent = mlsbClock(turn.durationMs);
        var open = billingOpen[turn.turn] === true;
        if (open) block.classList.add('mlsb-open'); else block.classList.remove('mlsb-open');
        var head = block.mlsbHead;
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        var sign = open ? '\u2212' : '+';
        for (var c = 0; c < block.mlsbCrosses.length; c++) block.mlsbCrosses[c].textContent = sign;
      }

      /**
       * 把纸条贴到轮次尾巴上—        * 贴的位置— *动作行之— *（复— 分支那行），读作「任务结— — 结算 — 动作」；
       * 找不到动作行就追加到末尾（两种都不会破坏 React 自己管理的节点引用）—        */
      function billingAttach(host, block) {
        var actions = host.lastElementChild;
        if (actions && actions !== block && /_actions/.test(String(actions.className || ''))) {
          host.insertBefore(block, actions);
        } else {
          host.appendChild(block);
        }
      }

      function billingTick() {
        // 开关关— — 摘干净并退出（巡扫— 1.2s 调一次，这里必须最先判断）
        if (!billingEnabled()) {
          if (doc.querySelector('[data-mlsb-turn]')) billingDetachAll();
          return;
        }
        if (!billingState) return;
        // 优先— *客户端选中的那个会— *；拿不到选择（老宿— 服务缺席）才退
// "最近有账的那个会话"。这一步是"重启后当前这段对话也能贴— 的关键
var displayed = billingDisplayedSessionId();
        var session = null;
        if (displayed) {
          var list = billingState.sessions || [];
          for (var s = 0; s < list.length; s++) {
            if (list[s].sessionId === displayed) { session = list[s]; break; }
          }
          if (!session) return;            // 这段对话还没有账 → 什么都不贴
        } else {
          session = billingState.current || null;
        }
        if (!session) return;
        var turns = session.turns || [];
        var now = Date.now();
        for (var i = 0; i < turns.length; i++) {
          var turn = turns[i];
          // 只结— *已结— *的轮次：任务没结束就没有"本轮用时"可言
          if (!turn.closed) continue;
          if (now - Number(turn.endedAt || 0) > BILLING_FRESH_MS) continue;
          var host = doc.querySelector('[data-turn-tail="' + turn.turn + '"]');
          if (!host) continue;
          var block = host.querySelector(':scope > [data-mlsb-turn="' + turn.turn + '"]');
          if (!block) {
            block = buildTurnBlock(turn);
            billingAttach(host, block);
          }
          updateTurnBlock(block, turn);
        }
      }

      function billingFetch() {
        if (typeof fetch !== 'function') return;
        if (!billingEnabled()) return;      // 开关关掉就不打扰宿
// 页面在后台时不轮询：桌面端最小化时省电，也不产生无意义请
if (doc.hidden) return;
        // 把「我正在显示哪个会话」带过去：宿主若发现这段对话还没有逐轮数据
        // （本功能上线之前跑过的轮次），会就地回填一次再返回 —— 于是重启
// 当前这段对话也能立刻贴上纸条，而不是只有新跑的轮次才有
var displayed = billingDisplayedSessionId();
        var url = BILLING_ENDPOINT + (displayed ? '?session=' + encodeURIComponent(displayed) : '');
        fetch(url, { cache: 'no-store' })
          .then(function (response) { return response.ok ? response.json() : null; })
          .then(function (body) {
            if (!body) return;
            billingState = body;
            billingTick();
          })
          .catch(function () { /* 宿主计费半边不在（或还没起来）：静默 */ });
      }

      if (typeof setInterval === 'function') {
        billingTimer = setInterval(billingFetch, BILLING_POLL_MS);
        billingApply();
      }
      if (typeof doc.addEventListener === 'function') {
        doc.addEventListener('visibilitychange', function () { if (!doc.hidden) billingFetch(); });
      }

      // ---- no settings drawer, no kill switch ------------------------------
      // Removed on purpose. The drawer's enable checkbox dropped the
      // `theme-marathon` body class, and the floating gear button was styled by
      // a body.theme-marathon-scoped rule — so switching the theme off
      // un-styled the very button needed to switch it back on. The theme is now
      // unconditional: enable/disable it from DSH's plugin list instead.

      // ---- apply ----------------------------------------------------------
      // Every class below is a fixed part of the theme; nothing is read from
      // localStorage any more, so a stale key from an older build can never put
      // the page into a half-themed state. There is no longer any intensity
      // constant either — --mar-int went away with the last animated layer.
      body.classList.add('theme-marathon');

      // legacy class names from pre-2026-09 builds — drop them if an older
      // session left them behind, they no longer have any CSS behind them
      body.classList.remove('theme-marathon-void', 'theme-marathon-surface',
        'theme-marathon-no-grid', 'theme-marathon-no-scanlines', 'theme-marathon-no-crt',
        'theme-marathon-no-sweep', 'theme-marathon-no-rgb', 'theme-marathon-no-plates',
        'theme-marathon-motion-off', 'theme-marathon-motion-reduced');

      buildBoot();
      // #5: arm the stale-flag guard on every apply — the attribute is written
      // by the boot payload long after this line, so the observer has to be up
      // before the reveal starts (and it is what catches the write if the host
      // is already gone).
      bootFlagWatch();
      // 原生窗口按钮的自愈：起手 90 秒内每 2 秒一次 + body class/style 变化时
      // 一次（见 captionMount）。必须排在 buildBoot() 之后、bgMount() 之前：
      // 揭幕的那几秒它什么都不做，动画一结束它第一个 tick 正好接上恢复。
      captionMount();
      bgMount();
      //  The palette is projected here as well, before anything can read it, and
      //  the self-check lands a beat later (after DSH's own presenter has had its
      //  say) so the report records the SETTLED state, not the hopeful one.
      themeAliasApply();
      if (typeof setTimeout === 'function') setTimeout(marThemeReport, 1500);
      // 任务完成动画：先挂上触发链（会话服务可能还没 register，attachDone
// 等它）；真正播不播还要过开关与「减少动态效果」两道闸（见 doneSchedule /
      // playDone）
attachDone();
      // 运行动画：挂上 DOM 侧的生命周期（原生运行行出现 → 条带出现；行被宿主
      // 摘掉 → 条带跟着没）。它不依赖 done 的开关：会话面订阅由 attachDone
      // 统一装好，这里只读快照。
      runApply();
      // 轻量更新检查：缓存 6 小时内不重复请求；失败静默（用户手动点「检查更新」才报错）。
      try { updateCheck(false); } catch (e) {}
      // 重连会重放列表基线，重新确认一次订阅还活着（服务实例被换掉时重挂）
      try {
        if (ctx && typeof ctx.on === 'function') {
          ctx.on('connection/reset', function () { pokeDone(15); });
          //  Two things happen on every theme change: the presenter re-projects
          //  (and removes the token names it wrote last time — the same names we
          //  write), and the preference / resolved scheme may have moved (a
          //  通用设置 click, or the OS flipping while on 跟随系统). Defer past the
          //  other listeners so the presenter has landed, then adopt — which
          //  plays the same pour a click in this pane plays — and re-assert the
          //  alias map. No write goes back to setTheme, so this cannot loop.
          ctx.on('theme/change', function () {
            setTimeout(function () {
              themeAdopt(true);
              themeAliasApply();
              marThemeReport();
            }, 0);
          });
        }
      } catch (e) {}

      // ---- dispose (plugin unload) ---------------------------------------
      // Every step is isolated, because a dispose is only correct as a WHOLE.
      // A dispose that throws halfway leaves a half-torn-down theme, and the
      // one half-state that cannot be recovered from is "stylesheet withdrawn,
      // nodes still in the DOM" (see bgMount: the canvas then becomes a
      // viewport-sized in-flow block and #root is pushed off-screen). So no
      // step may be able to skip the ones after it, and the stylesheet is
      // deliberately withdrawn LAST: if anything at all goes wrong, an
      // unstyled-but-mounted theme is a far better failure than a headless
      // document. The final sweep re-checks by id/selector rather than by
      // in-memory reference, which covers the paths where a reference was lost.
      return function dispose() {
        var steps = [
          function () { if (bootCleanup) bootCleanup(); },
          function () { if (typeof window !== 'undefined') window.__mbBootDone = null; },
          // per-turn token settlement: 停掉轮询、摘掉所有纸条、丢掉缓存的快照
// 纸条本身挂在转录内部（转录由 DSH 管理），这里按属性兜底清一遍，
          function () { if (billingTimer) { clearInterval(billingTimer); billingTimer = null; } },
          function () { billingState = null; },
          // task-completion animation: 退订会话快照与会话面、停掉补挂、清掉结算延迟、摘掉覆盖层
          function () { if (doneUnsub) { try { doneUnsub(); } catch (e) {} doneUnsub = null; } },
          function () { if (doneFaceUnsub) { try { doneFaceUnsub(); } catch (e) {} } doneFaceUnsub = null; doneFaceId = null; },
          function () { stopPoke(); donePokeLeft = 0; },
          function () { doneStopDom(); },
          function () { if (donePending) { clearTimeout(donePending); donePending = null; } },
          function () {
            donePrev = {}; doneWrapped = {}; doneStopped = {}; doneTurnSeen = {};
            doneFaceRun = {}; doneLast = null; lastEnds = []; doneSessions = null;
            domTailSeen = null; domStatusSeen = null; domLastScope = null; domLastTail = null;
          },
          function () {
            if (typeof window !== 'undefined') window.__marDoneDebug = null;
          },
          function () { stopDone(); },
          // running animation / dot animation: stop the shared DOM watcher,
          // destroy both engines, drop the injected engine scripts and forget
          // the broken flags so a later re-enable starts from a clean slate.
          function () { runUnwatch(); runUnmount(); dotUnmount(); },
          function () {
            if (typeof window !== 'undefined' && runResizeBound) {
              window.removeEventListener('resize', dotOnResize);
              runResizeBound = false;
            }
          },
          function () {
            if (runScriptEl && runScriptEl.parentNode) runScriptEl.parentNode.removeChild(runScriptEl);
            runScriptEl = null;
            runBroken = false;
            runLast = null;
          },
          function () {
            if (dotScriptEl && dotScriptEl.parentNode) dotScriptEl.parentNode.removeChild(dotScriptEl);
            dotScriptEl = null;
            dotBroken = false;
            if (typeof window !== 'undefined') {
              window.__marRunEngine = null;
              window.__marDotEngine = null;
              window.__marRunDebug = null;
            }
          },
          function () {
            var blocks = doc.querySelectorAll('[data-mlsb-turn]');
            for (var b = 0; b < blocks.length; b++) {
              if (blocks[b].parentNode) blocks[b].parentNode.removeChild(blocks[b]);
            }
          },
          // settings-panel watcher: layer, timer and observer
          function () { clearMosaic(); },
          function () { if (mosaicSweeper) { clearInterval(mosaicSweeper); mosaicSweeper = null; } },
          function () { if (mosaicObserver) { mosaicObserver.disconnect(); mosaicObserver = null; } },
          function () { if (mosaicBodyObserver) { mosaicBodyObserver.disconnect(); mosaicBodyObserver = null; } },
          function () { mosaicRoot = null; },
          // the immediate-sweep kick and its startup pokes must not fire after a
          // dispose (they would re-mount the tab into a dialog we just left)
          function () {
            if (settingsKick && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(settingsKick);
            if (settingsKick && typeof clearTimeout === 'function') clearTimeout(settingsKick);
            settingsKick = 0;
            for (var pk = 0; pk < settingsPokes.length; pk++) clearTimeout(settingsPokes[pk]);
            settingsPokes = [];
          },
          function () {
            var panels = doc.querySelectorAll('[class*="_panel"]');
            for (var p = 0; p < panels.length; p++) {
              panels[p].classList.remove('mar-mosaic-on');
              panels[p].__marMosaicPlayed = false;
            }
          },
          // task-board intro: same teardown, plus the re-arm flag
          function () { clearBoardIntro(); },
          function () { if (boardObserver) { boardObserver.disconnect(); boardObserver = null; } },
          function () {
            var boards = doc.querySelectorAll('[data-dsh-taskboard-board]');
            for (var b = 0; b < boards.length; b++) boards[b].__marIntroPlayed = false;
          },
          // background layer: loop, canvas, listeners, clear-marks, body classes
          function () { bgTeardown(); },
          function () { if (themeDomObs) { try { themeDomObs.disconnect(); } catch (e) {} themeDomObs = null; } },
          // OS-scheme fallback listener (only installed on hosts without the
          // theme service): never leave it behind pointing at a dead state.
          function () {
            if (SYSTEM_MQ && SYSTEM_MQ_HANDLER) {
              try {
                if (SYSTEM_MQ.removeEventListener) SYSTEM_MQ.removeEventListener('change', SYSTEM_MQ_HANDLER);
                else if (SYSTEM_MQ.removeListener) SYSTEM_MQ.removeListener(SYSTEM_MQ_HANDLER);
              } catch (e) {}
            }
            SYSTEM_MQ = null;
            SYSTEM_MQ_HANDLER = null;
          },
          function () {
            var panes = doc.querySelectorAll('[data-mar-pane]');
            for (var q = 0; q < panes.length; q++) {
              if (panes[q].parentNode) panes[q].parentNode.removeChild(panes[q]);
            }
            var cells = doc.querySelectorAll('[data-mar-nav]');
            for (var w = 0; w < cells.length; w++) {
              if (cells[w].parentNode) cells[w].parentNode.removeChild(cells[w]);
            }
            // #1: the close button lives on the PANEL (not the pane), so it is
            // not covered by the [data-mar-pane] sweep above. Its Escape hook
            // sits on the document, so undo it while the panel is still within
            // reach (onDocKeydown would self-heal on the next keypress, but a
            // dispose must not leave a listener behind).
            var closers = doc.querySelectorAll('[data-mar-close]');
            for (var c = 0; c < closers.length; c++) {
              var hostPanel = closers[c].parentNode;
              if (hostPanel && hostPanel.__marEsc) {
                doc.removeEventListener('keydown', hostPanel.__marEsc, true);
                hostPanel.__marEsc = null;
              }
              if (closers[c].parentNode) closers[c].parentNode.removeChild(closers[c]);
            }
          },
          // #5: the stale-flag watchdog must not outlive the theme — its 8s
          // timer and its attribute observer are both ours.
          function () {
            if (bootFlagTimer && typeof clearTimeout === 'function') clearTimeout(bootFlagTimer);
            bootFlagTimer = null;
            if (bootFlagObserver) {
              try { bootFlagObserver.disconnect(); } catch (e) {}
              bootFlagObserver = null;
            }
          },
          // caption 自愈：定时器、观察器、visibilitychange 监听与那枚度量 span
          // 都是我们挂的，跟着 dispose 一起收；最后一个动作是把「可见」再要一次，
          // 插件卸掉之后窗口不该停在一个我们改过的 caption 状态上。
          function () { captionDispose(); captionAskVisible(); },
          // Sweep by id/selector instead of trusting the references above: the
          // boot host (engine threw before wiring itself up), the background
          // canvas (bgTeardown lost its handle, or the node was re-created), and
          // any of the body classes bgTeardown would have removed.
          function () {
            var strays = [doc.getElementById('dshMarBootHost'), doc.getElementById('mar-ascii-bg'),
                          doc.getElementById('dshMarDoneHost'), doc.getElementById('dshMarRunHost'),
                          doc.getElementById('dshMarDotHost')];
            for (var s = 0; s < strays.length; s++) {
              if (strays[s] && strays[s].parentNode) strays[s].parentNode.removeChild(strays[s]);
            }
            body.classList.remove('theme-marathon', 'mar-bg-on', 'mar-bg-veil', 'mar-bg-light',
              'mar-run-on', 'mar-dot-on',
              'theme-marathon-void', 'theme-marathon-surface', 'theme-marathon-no-grid',
              'theme-marathon-no-scanlines', 'theme-marathon-no-crt', 'theme-marathon-no-sweep',
              'theme-marathon-no-rgb', 'theme-marathon-no-plates', 'theme-marathon-motion-off',
              'theme-marathon-motion-reduced');
            // __mbIntroStop() clears this too, but that hook lives inside a boot
            // script this dispose is in the middle of tearing down, so do not
            // depend on it. A stale attribute is not cosmetic: boot.css turns it
            // into `html[data-mar-boot] body > * { visibility:hidden }`, so with
            // the host gone and the sheet re-injected on a later enable it would
            // hide the entire app behind nothing at all.
            if (doc.documentElement) doc.documentElement.removeAttribute('data-mar-boot');
          },
          // LAST, on purpose — see the note above this function.
          function () { if (typeof disposeStyles === 'function') disposeStyles(); },
          // Let a later re-enable actually re-apply. Without this the guard at
          // the top of apply() short-circuits the second activation and the
          // theme comes back half-dead: no sheet, no canvas, no boot.
          function () { if (typeof window !== 'undefined') window.__dshThemeMarathonApplied = false; },
        ];
        for (var i = 0; i < steps.length; i++) {
          try { steps[i](); } catch (e) {}
        }
      };
    }

    exports.apply = apply;
    return exports;
  }
});
