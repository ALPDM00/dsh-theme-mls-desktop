/* patches.cjs --exact source edits applied to the DSH Desktop shell (app.asar).
 *
 * Two files carry the whole feature:
 *
 *   lib/main.js          --the main window is created with `transparent: true`
 *                          (so the boot animation can actually show the desktop
 *                          through the window) and gains one IPC channel that
 *                          lets the renderer hide the native Windows caption
 *                          buttons for the duration of the boot animation.
 *   lib/preload-app.cjs  --publishes that channel as
 *                          `window.dshDesktopBoot.chrome(visible)`.
 *
 * Every entry is an exact, once-only string replacement: a marker comment is
 * inserted with the code, so re-running the patcher is a no-op and a future
 * shell build that no longer matches fails loudly instead of half-patching.
 */
'use strict';

const crypto = require('node:crypto');

/** Shared by every patched block; its presence means the patch already landed. */
const MARKER = 'DSH desktop boot chrome/transparency patch';

/**
 * Placeholder for a file's revision digest, resolved by `stampRevisions()`.
 *
 * `already` answers "is this block here?" and that is all it can answer: a block
 * whose payload changed keeps its marker, so an install written by an older
 * revision of this patch set looks *applied* while it is actually out of date.
 * That is not hypothetical -- it happened twice. The caption bug shipped because
 * `#00000000` was silently ignored by the overlay parser, and after the fix was
 * written the installer reported PATCHED for a shell that still had the old
 * colours, because the marker it keys on had not changed.
 *
 * So every patched file also carries a digest of the payload this revision
 * writes into it, as a comment. A stale file is then detectable without having to
 * know which entry drifted, which is what the check needs: the supported fix is
 * `revert.cjs` + `apply.cjs` either way.
 */
const REV_SLOT = '@@PATCH_REVISION@@';

/** The comment every patched file must carry, with the digest filled in. */
const REVISION_PREFIX = 'patch-revision:';

/** Fragment inserted into main.js: channel name, kill switch and the helper. */
const MAIN_SUPPORT = [
  `/* ${MARKER} --see shell-patch/patches.cjs. ${REVISION_PREFIX}${REV_SLOT} */`,
  '/**\tRenderer -> shell channel that toggles the Windows caption buttons. */',
  'const BOOT_CHROME_CHANNEL = "dsh-desktop:boot-chrome";',
  '/**\tSet `DSH_DESKTOP_BOOT_CHROME=0` to fall back to an opaque window without touching code. */',
  'function bootChromeEnabled() {',
  '\treturn process.env.DSH_DESKTOP_BOOT_CHROME !== "0";',
  '}',
  '/**',
  '* Window options that let the renderer paint a per-pixel transparent boot',
  '* plate. Electron can only build an alpha window at creation time, so this',
  '* cannot be switched on later from the page.',
  '* @returns BrowserWindow options, or an empty object when disabled.',
  '*/',
  'function transparentWindowOptions() {',
  '\tif (!bootChromeEnabled()) return {};',
  '\treturn { transparent: true, backgroundColor: "#00000000" };',
  '}',
  '',
].join('\n');

/** Fragment inserted into main.js: the IPC listener that toggles the overlay.
 *
 * 2026-09-27 -- the hidden state moved to `rgba(0, 0, 0, 0)`.
 *
 * `#00000000` and `rgba(0, 0, 0, 0)` are both valid CSS and the Electron docs
 * list `#RRGGBBAA` as supported for this option, but a value the overlay's own
 * parser rejects does not fail loudly: the window simply keeps the opaque colours
 * it was constructed with. That is indistinguishable from "the patch does
 * nothing" -- which is what the user reported while the stdout log showed the
 * call arriving (hidden at 6.5 s and 8.3 s, restored at 19.3 s). So: use the
 * functional notation, and print the object that was actually passed instead of
 * only reporting that a call happened.
 *
 * Both colours stay overridable without repatching, because the two notations can
 * only be told apart on a live window:
 *
 *   DSH_DESKTOP_BOOT_CHROME_HIDDEN='#00000000'          A/B the notation
 *   DSH_DESKTOP_BOOT_CHROME_HIDDEN_HEIGHT='1'           second knob, see below
 *
 * `height` is deliberately NOT part of the default hidden state: shrinking the
 * band is the next thing to try if the colours turn out to be ignored, but a
 * window left without a reachable close button is exactly the failure the user
 * already hit once, so it stays behind an env var. The restore call always pins
 * the height back to the constructor's value, so turning the knob on and off
 * cannot strand the window.
 *
 * 2026-09-27 -- why the buttons came back (and why this block now reads the two
 * variables declared by MAIN_CAPTION_STATE).
 *
 * The shell's *own* preload never needed the patch to repaint the caption: it
 * measures the sidebar palette in `syncWindowsAppearance()` and sends it over
 * `DESKTOP_IPC.windowsAppearance` -- once on DOMContentLoaded and again on every
 * `document.head` mutation, which is precisely when a boot animation injects its
 * styles. The shell applies that message by calling `setTitleBarOverlay` too, and
 * the measured colour is opaque by construction (`--dsw-specific-sidebar-fill`).
 * So the sequence the user kept seeing was: theme asks for an empty band at
 * document-start, the measured palette arrives a moment later and repaints the
 * buttons, nothing else happens until the restore.
 *
 * `bootChromeSuppressed` makes the boot request authoritative and
 * `parkedCaptionPalette` keeps the measured pair to replay on restore, so the
 * caption ends on exactly the colours the shell measured rather than on
 * `chromeFallbackFill()`'s approximation. The park is logged; a suppressed
 * repaint is invisible by design, and "nothing happened" is indistinguishable
 * from "the guard is working", which is how the first two attempts at this fix
 * passed their own tests while the buttons stayed on screen.
 */
const MAIN_HANDLER = [
  '',
  `\t\t/* ${MARKER}. The renderer asks for an empty caption band while the boot`,
  '\t\t   animation plays, then restores the measured sidebar palette. Only the',
  '\t\t   primary product window may drive it, and only from the shell origin.',
  '\t\t   Both states report on stdout: a boot-time renderer decision is otherwise',
  '\t\t   unobservable from outside the window. */',
  '\t\t/**\tCaption band height, matching the BrowserWindow constructor. */',
  '\t\tconst CAPTION_HEIGHT = 40;',
  '\t\t/**',
  '\t\t* Options that make the caption band and its glyphs invisible.',
  '\t\t* @returns setTitleBarOverlay options.',
  '\t\t*/',
  '\t\tconst bootChromeHidden = () => {',
  '\t\t\tconst fill = process.env.DSH_DESKTOP_BOOT_CHROME_HIDDEN || "rgba(0, 0, 0, 0)";',
  '\t\t\tconst hidden = { color: fill, symbolColor: fill };',
  '\t\t\tconst height = Number(process.env.DSH_DESKTOP_BOOT_CHROME_HIDDEN_HEIGHT);',
  '\t\t\tif (Number.isInteger(height) && height >= 0) hidden.height = height;',
  '\t\t\treturn hidden;',
  '\t\t};',
  '\t\tipcMain.on(BOOT_CHROME_CHANNEL, (event, visible, who) => {',
  '\t\t\tconst window = mainWindow;',
  '\t\t\tif (window === void 0 || window.isDestroyed()) return;',
  '\t\t\tif (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return;',
  '\t\t\tif (!event.senderFrame.url.startsWith("dsh-app://app/")) return;',
  '\t\t\tif (process.platform !== "win32") return;',
  '\t\t\tif (typeof visible !== "boolean") return;',
  '\t\t\t// The state flips before anything is painted: the shell\'s own preload',
  '\t\t\t// republishes the measured palette from DOMContentLoaded on, which can',
  '\t\t\t// land before this window is first shown.',
  '\t\t\tbootChromeSuppressed = !visible;',
  '\t\t\tconst apply = () => {',
  '\t\t\t\tif (window.isDestroyed()) return;',
  '\t\t\t\tconst measured = parkedCaptionPalette;',
  '\t\t\t\tconst options = visible ? (measured === void 0 ? {',
  '\t\t\t\t\tcolor: chromeFallbackFill(),',
  '\t\t\t\t\tsymbolColor: nativeTheme.shouldUseDarkColors ? "#f9fafb" : "#0f1115",',
  '\t\t\t\t\theight: CAPTION_HEIGHT',
  '\t\t\t\t} : {',
  '\t\t\t\t\tcolor: measured.color,',
  '\t\t\t\t\tsymbolColor: measured.symbolColor,',
  '\t\t\t\t\theight: CAPTION_HEIGHT',
  '\t\t\t\t}) : bootChromeHidden();',
  '\t\t\t\ttry {',
  '\t\t\t\t\twindow.setTitleBarOverlay(options);',
  '\t\t\t\t\tconsole.log(`[dsh-desktop] boot chrome ${visible ? "restored" : "hidden"} (${typeof who === "string" && who.length > 0 ? who : "unattributed"}) ${JSON.stringify(options)}`);',
  '\t\t\t\t} catch (error) {',
  '\t\t\t\t\tconsole.error("[dsh-desktop] boot chrome failed", error);',
  '\t\t\t\t}',
  '\t\t\t};',
  '\t\t\tif (window.isVisible()) apply(); else window.once("show", apply);',
  '\t\t});',
].join('\n');

/**
 * The stock handler this entry rewrites, byte for byte.
 *
 * It is a stock block that the boot-chrome work has to *edit* rather than
 * surround, because the shell registers it first and it is the only other writer
 * of `setTitleBarOverlay` in the file. Keeping the whole handler in the anchor
 * (instead of just the two lines that change) means the `already` marker and the
 * anchor cannot disagree about which revision is on disk -- the failure mode that
 * made the old in-place upgrade ladder insert a duplicate copy of MAIN_HANDLER.
 *
 * `\\d` / `\\s` are doubled because this is a JS string literal, not the regex.
 */
const APPEARANCE_ANCHOR = [
  '\t\tipcMain.on(DESKTOP_IPC.windowsAppearance, (event, language, color, symbolColor) => {',
  '\t\t\tif (mainWindow === void 0 || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) return;',
  '\t\t\tif (!event.senderFrame.url.startsWith(`dsh-app://app/`)) return;',
  '\t\t\tif (typeof language === "string" && /^[a-zA-Z]+(?:-[a-zA-Z0-9]+)*$/u.test(language)) windowsLanguage = language;',
  '\t\t\tconst validColor = (value) => typeof value === "string" && /^(?:#[\\da-f]{3,8}|rgba?\\([\\d.,%\\s]+\\))$/iu.test(value);',
  '\t\t\tif (validColor(color) && validColor(symbolColor)) mainWindow.setTitleBarOverlay({',
  '\t\t\t\tcolor,',
  '\t\t\t\tsymbolColor',
  '\t\t\t});',
  '\t\t});',
].join('\n');

/**
 * Fragment replacing APPEARANCE_ANCHOR: the same handler, plus the two pieces of
 * state that let the boot animation win.
 *
 * Declared here rather than in MAIN_HANDLER so both `let`s are textually above
 * their first reader and sit in the same function block as the handler that
 * assigns them. MAIN_HANDLER only reads and assigns them.
 */
const MAIN_CAPTION_STATE = [
  `\t\t/* ${MARKER}. The shell measures the sidebar palette in its own preload`,
  '\t\t   (syncWindowsAppearance) and republishes it over this channel once on',
  '\t\t   DOMContentLoaded and again on every head/body mutation -- which is exactly',
  '\t\t   when a boot animation injects its styles. That palette is opaque by',
  '\t\t   construction (--dsw-specific-sidebar-fill), so without this guard it lands',
  '\t\t   right after the theme asks for an empty caption band and paints the window',
  '\t\t   buttons back on screen. While the band is suppressed the measured pair is',
  '\t\t   parked and replayed by the restore. */',
  '\t\tlet bootChromeSuppressed = false;',
  '\t\tlet parkedCaptionPalette;',
  '',
  '\t\tipcMain.on(DESKTOP_IPC.windowsAppearance, (event, language, color, symbolColor) => {',
  '\t\t\tif (mainWindow === void 0 || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) return;',
  '\t\t\tif (!event.senderFrame.url.startsWith(`dsh-app://app/`)) return;',
  '\t\t\tif (typeof language === "string" && /^[a-zA-Z]+(?:-[a-zA-Z0-9]+)*$/u.test(language)) windowsLanguage = language;',
  '\t\t\tconst validColor = (value) => typeof value === "string" && /^(?:#[\\da-f]{3,8}|rgba?\\([\\d.,%\\s]+\\))$/iu.test(value);',
  '\t\t\tif (validColor(color) && validColor(symbolColor)) {',
  '\t\t\t\tif (bootChromeSuppressed) {',
  '\t\t\t\t\tparkedCaptionPalette = { color, symbolColor };',
  '\t\t\t\t\t// Reported because a suppressed repaint is otherwise invisible: the',
  '\t\t\t\t\t// symptom it prevents is "nothing happened", which is the same thing',
  '\t\t\t\t\t// a working guard looks like.',
  '\t\t\t\t\tconsole.log(`[dsh-desktop] measured caption palette parked (boot chrome hidden) ${JSON.stringify(parkedCaptionPalette)}`);',
  '\t\t\t\t} else mainWindow.setTitleBarOverlay({ color, symbolColor });',
  '\t\t\t}',
  '\t\t});',
].join('\n');

/**
 * 2026-09-26 -- the desktop's first frame.
 *
 * The product window is per-pixel transparent (see MAIN_SUPPORT), but its
 * *document* paints the product palette from its very first frame: the served
 * `index.html` links a stylesheet whose `body` rule is
 * `background: var(--dsw-alias-bg-base, #fff)`, and the frontend bundle builds
 * DSH's own boot plate (`div[data-dsh-boot]`, CSS class `_boot_*`, wordmark plus
 * spinner plus "Loading plugins...") into `#root` about 100 ms in, with
 * `background: var(--dsw-alias-bg-base, var(--dsh-boot-bg, Canvas))`.
 * Upstream neutralises that for macOS only (`html[data-platform=darwin]{background:
 * transparent}`); on Windows the palette lands opaque over the whole window.
 *
 * The theme already silences that plate -- but only through the webserver's
 * `webserver/index-inject` row, and the Desktop does **not** splice that row
 * into the document: `serveWebDocument()` serves the packaged
 * `dsh-web-frontend/dist/index.html` almost verbatim and hands the injection
 * table to the renderer over IPC instead (`dsh-desktop:boot`), so every row --
 * including the theme's -- arrives about a second in, long after the plate is up.
 *
 * Hence this entry: one script and one stylesheet written into the packaged
 * document itself, so the first painted frame is already see-through. The gate is
 * the boot-chrome bridge rather than the URL, because the preload publishes that
 * global only in the frame whose window is transparent (`dsh-app://app`, win32),
 * which makes a deliberately narrow gate also the testable one.
 */
const DIST_INDEX_FILE = 'dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html';

/** The `<head>` the patcher opens, with the line it anchors on. */
const DIST_INDEX_ANCHOR = '  <head>\n    <meta charset="utf-8" />';

const DIST_INDEX_FIRST_FRAME = [
  `    <script>/* DSH desktop first-frame patch (see shell-patch/patches.cjs). The`,
  'window is transparent, but this document paints the product palette from its very',
  'first frame -- upstream only neutralises that for darwin. Runs before any',
  'stylesheet is parsed, so the first painted frame is already see-through and the',
  `native window buttons are gone before they can be seen. ${REVISION_PREFIX}${REV_SLOT} */`,
  '(function () {',
  '  /* The bridge exists only in the desktop product frame (see the preload patch),',
  '     which is exactly the frame whose window is transparent. A stock shell and the',
  '     browser cut keep their own look. */',
  '  var bridge = window.dshDesktopBootChrome;',
  '  if (!bridge || typeof bridge.chrome !== "function") return;',
  '  var root = document.documentElement;',
  '  if (root === null) return;',
  '  root.setAttribute("data-dsh-desktop", "");',
  '  try { bridge.chrome(false, "first-frame"); } catch (error) {}',
  '  var start = Date.now();',
  '  var release = function () {',
  '    root.removeAttribute("data-dsh-desktop");',
  '    try { bridge.chrome(true, "first-frame"); } catch (error) {}',
  '  };',
  '  /* The transparency must not outlive the boot, and a hidden caption must never',
  '     outlive it either: a disabled theme, or a load that skips the animation,',
  '     still gets its window back.',
  '',
  '     "The application is up" is NOT "#root has children": the frontend builds',
  '     DSH boot plate into #root about 100 ms in, and the first cut of this script',
  '     therefore released the frame while the plate was still the only thing on',
  '     screen. The plate is the marker to wait out -- ui-renderer hydrates it away',
  '     (`mountApp`: `:scope > [data-dsh-boot]`) once the real application renders. */',
  '  var tick = function () {',
  '    if (root.hasAttribute("data-mar-boot")) {',
  '      /* The theme owns the frame and the buttons from here on. */',
  '      root.removeAttribute("data-dsh-desktop");',
  '      return;',
  '    }',
  '    var host = document.getElementById("root");',
  '    var mounted = host !== null && host.childElementCount > 0 && host.querySelector("[data-dsh-boot]") === null;',
  '    if (Date.now() - start > 15000 || mounted) {',
  '      release();',
  '      return;',
  '    }',
  '    setTimeout(tick, 100);',
  '  };',
  '  setTimeout(tick, 100);',
  '})();<\/script>',
  '    <style>html[data-dsh-desktop],html[data-dsh-desktop] body,html[data-dsh-desktop] #root{background:transparent!important}',
  'html[data-dsh-desktop] [data-dsh-boot]{background:transparent!important}',
  'html[data-dsh-desktop] [data-dsh-boot]:has([data-dsh-boot-spinner]) > *{display:none!important}</style>',
].join('\n');

const PRELOAD_API = [
  `// ${MARKER}. ${REVISION_PREFIX}${REV_SLOT}`,
  'if (location.protocol === `dsh-app:` && location.hostname === "app" && process.platform === "win32") {',
  '\t// Shipped with the desktop patch: lets the product page hide the native',
  '\t// window buttons while the theme boot animation runs. Needs a global of its',
  '\t// own -- see the note in shell-patch/patches.cjs; adding to the shell\'s',
  '\t// `dshDesktopBoot` is impossible from an isolated preload world.',
  '\t// `who` is optional and only names the requester in the shell log.',
  '\tconst bootChrome = (visible, who) => electron.ipcRenderer.send("dsh-desktop:boot-chrome", visible, who);',
  '\ttry {',
  '\t\telectron.contextBridge.exposeInMainWorld("dshDesktopBootChrome", { chrome: bootChrome });',
  '\t} catch (error) {',
  '\t\tconsole.error("Desktop boot chrome bridge failed", error);',
  '\t}',
  '}',
].join('\n');

/**
 * Fragment inserted into main.js: "open the product window maximized".
 *
 * It is its own patch entry rather than part of MAIN_SUPPORT on purpose. An
 * installation that already carries the transparency patch is recognised by
 * `MARKER` and skipped -- MAIN_SUPPORT is never re-inserted (that would duplicate
 * `BOOT_CHROME_CHANNEL`) -- so anything appended to that fragment would never
 * reach an already-patched shell. This one anchors on the *tail of the
 * transparency helper* instead, which exists after MAIN_SUPPORT has landed,
 * whether it landed today or in an earlier run.
 */
const MAXIMIZE_SUPPORT = [
  '',
  `/* ${MARKER}: the product window opens maximized (stock is a 1280x820 window). */`,
  '/**\tSet `DSH_DESKTOP_WINDOW_MAXIMIZED=0` to go back to the stock window size. */',
  'function primaryWindowMaximized() {',
  '\treturn process.env.DSH_DESKTOP_WINDOW_MAXIMIZED !== "0";',
  '}',
  '/**',
  '* Open the primary window maximized.',
  '*',
  '* On a frameless alpha window Electron treats "maximized" as "equals the work',
  '* area" and never issues a native SW_MAXIMIZE, so the work area is taken up front:',
  '* same end state, and the stock 1280x820 size is never painted. Landing on it first',
  '* also matters because `setBounds()` is *both* "maximize" and "un-maximize" for',
  '* this window -- the first cut polled `isMaximized()` on the same tick as',
  '* `maximize()`, read the stale false, and then un-maximized itself with',
  '* `setBounds()`. So: work area first, then `maximize()` (which makes the window',
  '* report the maximized state to the shell) re-tried asynchronously.',
  '* @param window - the product BrowserWindow, already constructed.',
  '*/',
  'function maximizeWindowAtStartup(window) {',
  '\tif (!primaryWindowMaximized()) return;',
  '\tconst workArea = screen.getPrimaryDisplay().workArea;',
  '\twindow.setBounds(workArea);',
  '\tconst attempt = (tries) => {',
  '\t\tif (window.isDestroyed() || window.isMaximized()) return;',
  '\t\ttry { window.maximize(); } catch (error) {}',
  '\t\tif (tries > 1) setTimeout(() => attempt(tries - 1), 300);',
  '\t\telse if (!window.isDestroyed()) window.setBounds(workArea);',
  '\t};',
  '\tconst start = () => attempt(4);',
  '\tif (window.isVisible()) start(); else window.once("show", start);',
  '}',
].join('\n');

/** Tail of MAIN_SUPPORT: the anchor the maximize fragment is appended to. */
const TRANSPARENT_HELPER_TAIL = [
  'function transparentWindowOptions() {',
  '\tif (!bootChromeEnabled()) return {};',
  '\treturn { transparent: true, backgroundColor: "#00000000" };',
  '}',
].join('\n');

/*
 * 2026-09-26 -- what the live shell actually reports about "maximized" here:
 *
 *   external ShowWindow(hwnd, SW_MAXIMIZE)   -> IsZoomed TRUE,  rect 3226x1930
 *   Electron window.maximize()               -> IsZoomed FALSE, rect 3200x1904
 *                                               (== workArea), isMaximized() TRUE
 *
 * Frameless + per-pixel alpha: Electron implements `maximize()` as "resize to the
 * work area" and `isMaximized()` as a bounds comparison against it. That is why
 * `setBounds()` and `maximize()` are not two steps towards one goal -- they fight.
 * The retry form lives in MAXIMIZE_SUPPORT above; there is no separate upgrade
 * fragment for it any more (upgrading = revert.cjs + apply.cjs).
 */

/**
 * Each entry: a file, an anchor that must occur exactly once, and the text that
 * replaces it. `already` is tested first so the patcher is idempotent.
 */
/**
 * The entries, written with `REV_SLOT` where the digest goes.
 *
 * Not exported: the digest is computed from this text, and a payload that
 * contained its own digest could not be computed at all.
 */
const RAW_PATCHES = [
  {
    name: 'main: transparent window helper',
    file: 'lib/main.js',
    already: MARKER,
    anchor: 'function createWindow(preload, show = false, primary = false) {',
    replacement: `${MAIN_SUPPORT}function createWindow(preload, show = false, primary = false) {`,
  },
  {
    name: 'main: maximize helper',
    file: 'lib/main.js',
    already: 'function maximizeWindowAtStartup(window) {',
    anchor: TRANSPARENT_HELPER_TAIL,
    replacement: `${TRANSPARENT_HELPER_TAIL}${MAXIMIZE_SUPPORT}`,
  },
  {
    name: 'main: import screen',
    file: 'lib/main.js',
    already: 'protocol, screen, session',
    anchor: 'protocol, session, shell, systemPreferences } from "electron";',
    replacement: 'protocol, screen, session, shell, systemPreferences } from "electron";',
  },
  {
    name: 'main: open maximized',
    file: 'lib/main.js',
    already: 'maximizeWindowAtStartup(window);',
    anchor: '\t\tconst window = createWindow(appPreload, false, true);\n\t\tmainWindow = window;',
    replacement: '\t\tconst window = createWindow(appPreload, false, true);\n\t\tmaximizeWindowAtStartup(window);\n\t\tmainWindow = window;',
  },
  {
    name: 'main: transparent primary window',
    file: 'lib/main.js',
    already: '...transparentWindowOptions()',
    anchor: '\t\t\twebviewTag: primary,\n\t\t\tdevTools: true\n\t\t}',
    replacement: '\t\t\twebviewTag: primary,\n\t\t\tdevTools: true\n\t\t},\n\t\t...transparentWindowOptions()',
  },
  {
    name: 'main: measured caption palette respects boot chrome',
    file: 'lib/main.js',
    // Edits a stock block instead of inserting next to it, so it must be listed
    // before the entry that owns the neighbouring region -- both anchors touch
    // the same two lines, and applying them the other way round would make the
    // second one miss.
    already: 'let bootChromeSuppressed = false;',
    anchor: APPEARANCE_ANCHOR,
    replacement: MAIN_CAPTION_STATE,
  },
  {
    name: 'main: boot chrome IPC',
    file: 'lib/main.js',
    // Insert-only, like every entry here: `already` names a fragment of the block,
    // and the anchor is the stock tail of `createMainWindow`.
    //
    // `already` deliberately names a line that only the CURRENT payload has. The
    // old "insert the block" marker (`ipcMain.on(BOOT_CHROME_CHANNEL`) is present
    // in every revision, so it cannot tell a current install from a stale one --
    // and since this block now reads variables declared by the entry above, a
    // stale skip would ship a ReferenceError. apply.cjs turns the mismatch into
    // an explicit "run revert.cjs first" instead.
    //
    // 2026-09-27 -- the in-place upgrade ladder that used to live here is GONE.
    // It grew a rung per payload change (bare -> stdout report -> requester name
    // -> ...), and because one rung's anchor did not include the handler's header
    // comment, it left the old comment behind and inserted a second copy. The
    // supported upgrade path is now `revert.cjs` then `apply.cjs` -- one extra
    // command, and it cannot drift, duplicate, or half-apply.
    already: 'bootChromeSuppressed = !visible;',
    anchor: '\t\t});\n\t}\n\tconst hideMainWindow = (window) => {',
    replacement: `\t\t});${MAIN_HANDLER}\n\t}\n\tconst hideMainWindow = (window) => {`,
  },
  {
    name: 'preload: boot chrome bridge',
    file: 'lib/preload-app.cjs',
    already: 'dshDesktopBootChrome',
    anchor: '});\n}\nmarkDocumentPlatform();',
    replacement: `});\n}\n${PRELOAD_API}\nmarkDocumentPlatform();`,
  },
  {
    name: 'dist: transparent first frame (desktop)',
    file: DIST_INDEX_FILE,
    already: 'data-dsh-desktop',
    anchor: DIST_INDEX_ANCHOR,
    replacement: `  <head>\n${DIST_INDEX_FIRST_FRAME}\n    <meta charset="utf-8" />`,
  },
];

/** The files this patch set touches, in the order they first appear. */
const TARGET_FILES = [...new Set(RAW_PATCHES.map((patch) => patch.file))];

/**
 * Short digest of everything this revision writes into one file.
 * @param {string} file - archive-relative path
 * @returns {string} 12 hex characters, or '' for a file no entry targets
 */
function revisionOf(file) {
  const bodies = RAW_PATCHES.filter((patch) => patch.file === file).map((patch) => patch.replacement);
  if (bodies.length === 0) return '';
  return crypto.createHash('sha256').update(bodies.join('\n')).digest('hex').slice(0, 12);
}

/** file -> revision digest. */
const REVISIONS = new Map(TARGET_FILES.map((file) => [file, revisionOf(file)]));

/** The exact comment a current install carries for this file. */
function revisionComment(file) {
  return `${REVISION_PREFIX}${REVISIONS.get(file) ?? ''}`;
}

/**
 * Resolve `REV_SLOT`, everywhere it appears, to the file's digest.
 * @param {string} text - payload, anchor or marker
 * @param {string} file - file the text belongs to
 * @returns {string} text with the digest substituted
 */
function stamp(text, file) {
  return text.split(REV_SLOT).join(REVISIONS.get(file) ?? '');
}

const PATCHES = RAW_PATCHES.map((patch) => ({
  ...patch,
  anchor: stamp(patch.anchor, patch.file),
  replacement: stamp(patch.replacement, patch.file),
  already: stamp(patch.already, patch.file),
}));

/**
 * Is an installed file the revision this patch set writes?
 *
 * Three answers, and the middle one is the whole point:
 *   current    -- the digest comment matches; leave it alone.
 *   stale      -- the file is patched (one of this revision's markers is present)
 *                 but its digest comment is missing or different. The blocks are
 *                 all there and every marker matches, which is precisely why this
 *                 cannot be detected entry by entry.
 *   unpatched  -- nothing this patch set writes is in the file.
 * @param {string} file - archive-relative path
 * @param {string} text - the file's contents
 * @returns {'current'|'stale'|'unpatched'}
 */
function revisionState(file, text) {
  if (text.includes(revisionComment(file))) return 'current';
  // Any marker of any entry targeting this file. Also covers installs written
  // before this digest comment existed, which have no `patch-revision:` at all.
  const fingerprints = RAW_PATCHES.filter((patch) => patch.file === file).map((patch) => patch.already);
  if (fingerprints.some((fingerprint) => text.includes(fingerprint))) return 'stale';
  if (text.includes(REVISION_PREFIX)) return 'stale';
  return 'unpatched';
}

module.exports = {
  MARKER,
  REV_SLOT,
  REVISION_PREFIX,
  TARGET_FILES,
  REVISIONS,
  revisionOf,
  revisionComment,
  revisionState,
  PATCHES,
};
