/* test/plugin.test.cjs — load the built client.js inside a jsdom browser
 * stub and assert the loading contract holds. Run: `node test/plugin.test.cjs`. */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const clientSrc = fs.readFileSync(path.join(root, 'client.js'), 'utf8');

function runClient(preset) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only'
  });
  const win = dom.window;
  if (preset) {
    Object.keys(preset).forEach((k) => win.localStorage.setItem(k, String(preset[k])));
  }
  let captured = null;
  win.__ModuleLoader__ = { load: (spec) => { captured = spec; } };
  let cssCaptured = null;
  win.styles = { insert: (css) => { cssCaptured = css; return () => {}; } };

  win.eval(clientSrc);
  assert.ok(captured, 'window.__ModuleLoader__.load should be called');
  const mod = captured.factory(function () { return {}; });
  assert.strictEqual(typeof mod.apply, 'function', 'module must export apply');

  let tokensCaptured = null;
  const fakeCtx = {
    get: (name) => {
      if (name === 'theme') {
        return { overrideTokens: (id, map) => { tokensCaptured = { id, map }; return () => {}; } };
      }
      return null;
    }
  };
  const dispose = mod.apply(fakeCtx);
  return { dom, win, mod, captured, cssCaptured, tokensCaptured, dispose };
}

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  console.log('  ✓ ' + name);
  passed++;
}

console.log('dsh-theme-mls-desktop · plugin self-test\n');

// --- Test 1: defaults (enabled, palette void) ---
(() => {
  const r = runClient({});
  ok('tokens overridden with plugin id', r.tokensCaptured && r.tokensCaptured.id === 'dsh-theme-mls-desktop');
  ok('bg-base maps to --mar-bg-void var', r.tokensCaptured.map['--dsw-alias-bg-base'].light === 'var(--mar-bg-void)');
  ok('brand maps to --mar-accent var', r.tokensCaptured.map['--dsw-alias-brand-primary'].dark === 'var(--mar-accent)');
  ok('css injected via styles.insert', typeof r.cssCaptured === 'string' && r.cssCaptured.length > 1000);
  ok('css has @font-face + base64', r.cssCaptured.includes('@font-face') && r.cssCaptured.includes('base64,'));
  ok('css references Maratype family', r.cssCaptured.includes('"Maratype"'));
  ok('css has no placeholder', !r.cssCaptured.includes('__MARATYPE_BASE64__'));
  // 2026-09-18: every decorative overlay (grid, scanlines, CRT, sweep) was
  // removed. Match on rule heads / keyframe names, never on the bare class
  // names — the removal note kept in the stylesheet mentions all four in prose,
  // so a substring test would hit that comment and fail spuriously. The
  // keyframe test names the four dead animations explicitly instead of using a
  // bare `mar-` prefix, so the settings-reveal keyframes (which only run after
  // a click and remove themselves) are not mistaken for a texture layer.
  ok('css drops all decorative overlays',
    !/\.mar-(grid|scanlines|crt|sweep)\s*\{|--mar-(grid-size|int)\s*:|@keyframes\s+mar-(crt|sweep|grid|scan)/.test(r.cssCaptured));
  ok('css has no full-screen .mar-layer base rule', !/\.mar-layer\s*\{/.test(r.cssCaptured));
  // left rail lighting (2026-09-18): static state is DSH's own neutral
  // surface; 新会话 lights on hover, a session row only on [_selected], and a
  // session row's own hover is muted so that column never moves on its own.
  ok('css defines --mar-accent-ink', /--mar-accent-ink\s*:\s*#0B0D0B/.test(r.cssCaptured));
  ok('css lights 新会话 on hover',
    /\[class\*="_newSession"\]:hover/.test(r.cssCaptured));
  ok('css covers the selected session row',
    /\[class\*="_sessionRow"\]\[class\*="_selected"\]/.test(r.cssCaptured));
  ok('css gives session rows no static fill',
    !/\[class\*="_sessionRow"\]\s*[,\{]/.test(r.cssCaptured));
  ok('css mutes the session row hover wash',
    /\[class\*="_sessionRow"\]:hover:not\(\[class\*="_selected"\]\)\{[\s\S]{0,120}?background:transparent!important/.test(r.cssCaptured));
  ok('css inks the composer send arrow', /button\[class\*="_primary"\]/.test(r.cssCaptured));
  // settings reveal
  ok('css has the settings mosaic + tile keyframes',
    /\.mar-mosaic\s*\{/.test(r.cssCaptured) && r.cssCaptured.includes('mar-tile-out'));
  // no fade on the panel's own columns — the tiles are the whole transition.
  // Match rule heads, not the bare keyframe name: the removal note in the
  // stylesheet is allowed to describe what was deleted.
  ok('css leaves the settings panel content un-animated',
    !/@keyframes\s+mar-mosaic-content/.test(r.cssCaptured) &&
    !/\[class\*="_panel"\]\.mar-mosaic-on\s*>\s*\*/.test(r.cssCaptured));
  // a tile is switched off, not animated: zero duration, no transform/scale.
  // The tile fires on its delay and is gone — an earlier build scaled each one
  // down (1 -> .7), which read as 25 separate motions instead of one sweep.
  {
    // slice the keyframes block: from{...} plus to{...} (braces counted, since
    // the block itself ends with another brace)
    const kf = (r.cssCaptured.match(/@keyframes\s+mar-tile-out\{([\s\S]*?\}\s*\})/) || [])[1] || '';
    ok('tile keyframes carry no transform (no per-square shrink)',
      kf !== '' && !/transform|scale/.test(kf) && /opacity:1/.test(kf) && /opacity:0/.test(kf));
    ok('tile animation has zero duration (the delay is the whole motion)',
      /\.mar-mosaic i\{[^}]*animation:mar-tile-out 0s/.test(r.cssCaptured));
  }
  ok('settings mosaic honours reduced-motion',
    /prefers-reduced-motion:\s*reduce\)\{[\s\S]*?\.mar-mosaic/.test(r.cssCaptured));
  // injected sidebar entries (2026-09-18): plugins cannot register a sidebar
  // slot, so they inject their own full-width row. The collapsed rail wants a
  // centred 36x36 cell; the plugin's own rule for that is keyed on an attribute
  // this DSH build does not carry, so the theme has to do it.
  ok('css centres injected sidebar entries in the collapsed rail',
    /\[data-sidebar-collapsed\]\s+\[data-dsh-part="sidebar-entry"\]\{[\s\S]{0,220}?width:36px;/.test(r.cssCaptured));
  ok('css hides the injected entry label in the rail',
    /\[data-sidebar-collapsed\]\s+\[data-dsh-part="sidebar-entry"\]\s*>\s*span\s*\+\s*span\{/.test(r.cssCaptured));
  // task board intro — the unit is the COLUMN, not the board and not the card.
  // Choreography is the user's own reference file: a tab is an opaque slab
  // carrying four reticles, then a 2px frame, then the slab's 2x2 grid of four
  // rectangles leaves one at a time in 1-2-4-3.
  ok('css makes the board root a positioning context',
    /\[data-dsh-taskboard-board\]\{position:relative;\}/.test(r.cssCaptured));
  ok('css has the flash + the two frame fades, and no dead keyframes',
    /@keyframes\s+mar-cross-flash/.test(r.cssCaptured) &&
    /@keyframes\s+mar-fade-in/.test(r.cssCaptured) && /@keyframes\s+mar-fade-out/.test(r.cssCaptured) &&
    !/mar-reticle/.test(r.cssCaptured) && !/mar-tile-in/.test(r.cssCaptured));
  ok('css makes a tab a 2x2 grid of four rectangles',
    /\.mar-col-intro\{[^}]*grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr/.test(r.cssCaptured));
  ok('css gives the rectangles zero duration (they leave, they do not animate)',
    /\.mar-col-intro \.mar-col-mask\{[^}]*animation:mar-tile-out 0s/.test(r.cssCaptured));
  // the tab's own colour would make them invisible — see check.cjs
  ok('css fills a rectangle with --mar-mosaic-fill so it shows against the tab',
    /\.mar-col-intro \.mar-col-mask\{[^}]*background:var\(--mar-mosaic-fill\)/.test(r.cssCaptured) &&
    !/\.mar-col-mask\{[^}]*background:var\(--mar-bg-panel\)/.test(r.cssCaptured));
  ok('css draws the reticle from three bars sized off its rectangle',
    /\.mar-cross\{[^}]*width:var\(--mar-cross-size\)/.test(r.cssCaptured) &&
    /\.mar-cross \.mar-h\{/.test(r.cssCaptured) && /\.mar-cross \.mar-v\{/.test(r.cssCaptured) &&
    /\.mar-cross \.mar-dot\{/.test(r.cssCaptured) &&
    /\.mar-dot\{[\s\S]{0,160}?rotate\(45deg\)/.test(r.cssCaptured));
  ok('css makes the frame a 2px ring taking both delays from the JS',
    /\.mar-col-frame\{[^}]*border:2px solid var\(--mar-accent\)/.test(r.cssCaptured) &&
    /\.mar-col-frame\{[\s\S]{0,320}?var\(--mar-frame-at/.test(r.cssCaptured) &&
    /\.mar-col-frame\{[\s\S]{0,320}?var\(--mar-frame-out-at/.test(r.cssCaptured));
  ok('css has no per-card mask and no horizontal strip cut left',
    !/\.mar-card-mask\s*\{/.test(r.cssCaptured) && !/\.mar-board-frame\s*\{/.test(r.cssCaptured) &&
    !/\.mar-col-strip\s*\{/.test(r.cssCaptured));
  ok('board intro honours reduced-motion',
    /prefers-reduced-motion:\s*reduce\)\{[\s\S]*?\.mar-board-intro/.test(r.cssCaptured));
  ok('css keeps the single fixed palette', r.cssCaptured.includes('--mar-bg-void:#0B0D0B') && r.cssCaptured.includes('--mar-bg-panel:#272733') && r.cssCaptured.includes('--mar-bg-overlay:#2E2F38') && r.cssCaptured.includes('--mar-ink-primary:#DFDEE0'));
  ok('css squares every corner (blanket rule, boot disc exempt)',
    /body\.theme-marathon \*::after\{border-radius:0!important;\}/.test(r.cssCaptured) &&
    /#dshMarBootHost \.mb-status-dot\{border-radius:50%!important;\}/.test(r.cssCaptured));
  ok('css drops the HUD plate layer', !r.cssCaptured.includes('.mar-hud') && !r.cssCaptured.includes('.mar-strip') && !r.cssCaptured.includes('.mar-corner'));
  // Asserted on the drawer's OWN class names, not on the `.mar-set-` prefix:
  // the 主题设置 pane added on 2026-09-20 legitimately uses
  // `.mar-set-pane` / `.mar-set-row` / `.mar-switch`.
  ok('css drops the settings drawer',
    !r.cssCaptured.includes('.mar-set-toggle') && !r.cssCaptured.includes('.mar-set-panel'));
  ok('css drops the heading RGB split', !r.cssCaptured.includes('theme-marathon-no-rgb'));
  ok('body has theme-marathon class', r.win.document.body.classList.contains('theme-marathon'));
  ok('no HUD layer injected', !r.win.document.querySelector('.mar-hud'));
  ok('no settings drawer injected', !r.win.document.querySelector('.mar-set-toggle') && !r.win.document.querySelector('.mar-set-panel'));
  ok('boot host injected', !!r.win.document.querySelector('#dshMarBootHost'));
  // ---- ASCII background layer (2026-09-20) --------------------------------
  const bg = r.win.document.getElementById('mar-ascii-bg');
  ok('ascii background canvas mounted as first child of body',
    !!bg && r.win.document.body.firstChild === bg);
  // 2026-10: 关闭背景动画 is an INDEPENDENT switch and it defaults to OFF, so a
  // fresh install has no dot field and no light layer (the dark pair is the
  // default UI).
  ok('background animation is OFF by default',
    !r.win.document.body.classList.contains('mar-bg-on') &&
    !r.win.document.body.classList.contains('mar-bg-light') &&
    bg.style.display === 'none');
  ok('css carries the background layer + the two controls',
    r.cssCaptured.includes('#mar-ascii-bg') &&
    /mar-bg-on\s+\.mar-bg-clear/.test(r.cssCaptured) &&
    !r.cssCaptured.includes('mar-bg-veil') &&
    r.cssCaptured.includes('.mar-set-switch') && r.cssCaptured.includes('.mar-switch') &&
    r.cssCaptured.includes('.mar-seg button[aria-checked="true"]') &&
    !r.cssCaptured.includes('aria-pressed') &&
    r.cssCaptured.includes('.mar-set-pane') && r.cssCaptured.includes('.mar-nav-on'));
  // the four structural containers are the only things we let step aside
  const clearMarks = r.win.document.querySelectorAll('.mar-bg-clear');
  const structural = [];
  clearMarks.forEach((el) => {
    const cls = String(el.className);
    if (/_frame|_sidebarCol|_centerCol|_quietBars|_root/.test(cls)) structural.push(cls);
  });
  ok('background clear-marks hit structure only (or none, in an empty sheet)',
    clearMarks.length === structural.length);
  ok('no settings tab injected without a real settings dialog',
    !r.win.document.querySelector('[data-mar-nav]'));
  ok('boot payload stylesheet mounted inside host', (() => {
    const st = r.win.document.querySelector('#dshMarBootHost style[data-boot]');
    return !!st && st.textContent.includes('#dshMarBootHost') && st.textContent.includes('#mb-boot');
  })());
  ok('boot payload DOM present (intro + marathon canvas)', !!r.win.document.querySelector('#dshMarBootHost #mb-canvas') && !!r.win.document.querySelector('#dshMarBootHost #mb-intro'));
  ok('boot engines embedded as scripts', (() => {
    const sc = r.win.document.querySelectorAll('#dshMarBootHost script');
    return sc.length === 2 && sc[0].textContent.includes('__mbMarathon') && sc[1].textContent.includes('__mbIntroStop');
  })());
  ok('dispose is a function', typeof r.dispose === 'function');
})();

// --- Test 1b: the field switch + the colour pair are independent (2026-10) ---
// 关闭背景动画 is its own switch and defaults to OFF; 主白+绿 / 主黑+绿 are a
// radio group that survives it. The store key is unchanged, so the old triple
// (mode: off|light|dark, plus a scheme for the 'off' case) has to migrate.
(() => {
  const key = 'dsh-theme-marathon.bg.v1';
  const fresh = runClient({});
  ok('fresh install: no stored state -> animation OFF, dark pair',
    !fresh.win.document.body.classList.contains('mar-bg-on') &&
    !fresh.win.document.body.classList.contains('mar-bg-light'));
  const v2 = runClient({ [key]: JSON.stringify({ mode: 'light' }) });
  ok('v2 {mode:light} migrates to anim:true + the white pair',
    v2.win.document.body.classList.contains('mar-bg-on') &&
    v2.win.document.body.classList.contains('mar-bg-light'));
  const v2off = runClient({ [key]: JSON.stringify({ mode: 'off', scheme: 'light' }) });
  ok('v2 {mode:off, scheme:light} migrates to anim:false with the white UI kept',
    !v2off.win.document.body.classList.contains('mar-bg-on') &&
    v2off.win.document.body.classList.contains('mar-bg-light'));
  const v2green = runClient({ [key]: JSON.stringify({ mode: 'green' }) });
  ok('v1 {mode:green} migrates to anim:true + the white pair',
    v2green.win.document.body.classList.contains('mar-bg-on') &&
    v2green.win.document.body.classList.contains('mar-bg-light'));
  const v3 = runClient({ [key]: JSON.stringify({ anim: true, scheme: 'light' }) });
  ok('v3 {anim:true, scheme:light} restores both flags',
    v3.win.document.body.classList.contains('mar-bg-on') &&
    v3.win.document.body.classList.contains('mar-bg-light'));
})();

// --- Test 2: no kill switch (regression, 2026-09-18) ---
// The old build read `dsh-theme-marathon-enabled` and dropped the
// `theme-marathon` body class when it was '0'. That class also styled the
// floating settings gear, so "关闭主题" hid the only control that could turn
// the theme back on. A stale '0' in localStorage must now be inert.
(() => {
  const r = runClient({ 'dsh-theme-marathon-enabled': '0', 'dsh-theme-marathon-boot': '0' });
  ok('legacy enabled=0 no longer disables the theme', r.win.document.body.classList.contains('theme-marathon'));
  ok('legacy enabled=0 leaves no settings drawer', !r.win.document.querySelector('.mar-set-toggle'));
  ok('boot host still injected despite legacy enabled=0', !!r.win.document.querySelector('#dshMarBootHost'));
})();

// --- Test 3: legacy palette / effect keys are inert ---
(() => {
  const r = runClient({ 'dsh-theme-marathon-palette': 'surface', 'dsh-theme-marathon-plates': '0', 'dsh-theme-marathon-motion': 'off' });
  ok('legacy palette key adds no palette class',
    !r.win.document.body.classList.contains('theme-marathon-surface') && !r.win.document.body.classList.contains('theme-marathon-void'));
  ok('legacy effect keys add no toggle classes',
    !/\btheme-marathon-(no-|motion-)/.test(r.win.document.body.className));
  ok('no decorative overlay nodes injected',
    r.win.document.querySelectorAll('.mar-grid, .mar-scanlines, .mar-crt, .mar-sweep, .mar-layer').length === 0);
  ok('body carries no mar-layer node even with the boot host mounted',
    !r.win.document.querySelector('.mar-layer') &&
    !!r.win.document.querySelector('#dshMarBootHost.mar-boot-host'));
})();

// --- Test 4: dispose tears down ---
(() => {
  const r = runClient({});
  ok('no mosaic layer before the settings dialog is opened', !r.win.document.querySelector('.mar-mosaic'));
  r.dispose();
  ok('dispose removes theme-marathon', !r.win.document.body.classList.contains('theme-marathon'));
  ok('dispose leaves no decorative nodes', r.win.document.querySelectorAll('.mar-layer, .mar-crt, .mar-sweep, .mar-grid, .mar-scanlines').length === 0);
  ok('dispose removes boot host', !r.win.document.querySelector('#dshMarBootHost') && !r.win.document.querySelector('.mar-boot-host'));
  ok('dispose leaves no mosaic layer', !r.win.document.querySelector('.mar-mosaic'));
})();

// --- Test 4b: host half — the pre-plugin interval ---
// The native boot screen ("HARNESS" + spinner + "Loading plugins…") is already
// on screen before any client bundle is fetched, so the only hook early enough
// is the webserver's structured index-injection table. This drives that seam
// with a fake ctx and checks the row we hand the host.
(() => {
  const host = require(path.join(root, 'index.js'));
  ok('host half exports apply(ctx)', typeof host.apply === 'function');

  const listeners = new Map();
  const fakeCtx = { on: (name, fn) => { listeners.set(name, fn); } };
  host.apply(fakeCtx);
  ok('host half subscribes to webserver/index-inject', listeners.has('webserver/index-inject'));

  const table = [];
  listeners.get('webserver/index-inject')(table);
  ok('exactly one row is contributed per index render', table.length === 1);
  ok('the row is a structured style row', table[0].kind === 'style' && typeof table[0].text === 'string');
  ok('the row cannot close its own element early', !/<\/style/i.test(table[0].text));

  const css = table[0].text;
  ok('the plate is recoloured to the void colour', /\[data-dsh-boot\]:has\(\[data-dsh-boot-spinner\]\)\{background:#0B0D0B!important\}/.test(css));
  ok('the loading card is emptied while the spinner is still there', /\[data-dsh-boot\]:has\(\[data-dsh-boot-spinner\]\) > \*\{display:none!important\}/.test(css));
  // the spinner is DSH's own loading marker and `render()` drops it when the
  // boot fails, which is what lets the failure card back through
  ok('the gate is the spinner, not a hidden flag the theme would have to guess', css.includes('data-dsh-boot-spinner'));
  ok('the plate itself is never display:none (failures stay visible)', !/\[data-dsh-boot\]\{[^}]*display:none/.test(css));
  ok('html,body carry the void colour so the plate cannot flash white', /html,body\{background:#0B0D0B\}/.test(css));
  ok('the html,body rule stays overridable by the theme', !/html,body\{[^}]*!important/.test(css));

  // idempotent: the table is rebuilt per render, so pushing twice must not
  // duplicate the row inside one table
  const table2 = [];
  listeners.get('webserver/index-inject')(table2);
  ok('each render gets exactly one style row', table2.length === 1);
})();

// --- Test 5: settings mosaic mounting (structural, no DSH needed) ---
// The panel is located by structure (the "*_panel" ancestor of the nav cells),
// so a fake panel with the same shape drives the same code path DSH drives.
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// The reveal clears itself ~0.69s after it mounts and the plugin only sweeps
// for the dialog every 1200ms, so a fixed "sleep then look" can easily land
// after the layer is already gone. Poll for it instead.
async function waitFor(fn, ms) {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(50);
  }
}

(async () => {
  const r = runClient({});
  const d = r.win.document;
  const overlay = d.createElement('div'); overlay.className = 'zz_overlay';
  const panel = d.createElement('div'); panel.className = 'zz_panel';
  const nav = d.createElement('nav'); nav.className = 'zz_nav zz_navList';
  for (let i = 0; i < 8; i++) { const c = d.createElement('button'); c.className = 'zz_navCell'; nav.appendChild(c); }
  panel.appendChild(nav);
  panel.appendChild(d.createElement('div'));
  overlay.appendChild(panel);
  d.body.appendChild(overlay);

  // the plugin sweeps every 1200ms — poll through at least one sweep. Every
  // assertion below runs in the same tick as the hit, so the layer is still up.
  const layer = await waitFor(() => panel.querySelector('.mar-mosaic'), 2500);
  ok('settings panel receives the mosaic layer', !!layer);
  ok('mosaic is a 5x5 grid (25 tiles)', !!layer && layer.children.length === 25);
  ok('panel is marked mar-mosaic-on', panel.classList.contains('mar-mosaic-on'));
  ok('tiles are declared as 20% squares', !!layer && layer.children[0].style.width === '20%' && layer.children[0].style.height === '20%');

  // geometry: 5 distinct lefts and 5 distinct tops, all on the 20% lattice
  const cols = new Set(), rows = new Set();
  const lattice = ['0%', '20%', '40%', '60%', '80%'];
  if (layer) for (const c of layer.children) { cols.add(c.style.left); rows.add(c.style.top); }
  ok('tiles tile a 5x5 lattice without overlap or gap',
    cols.size === 5 && rows.size === 5 &&
    Array.from(cols).every((v) => lattice.indexOf(v) >= 0) &&
    Array.from(rows).every((v) => lattice.indexOf(v) >= 0));

  // timing: 3 tiles share frame 0, then one every 0.0155s — the entire reveal
  // is on a 0.5s budget. Tiles are instantaneous, so the last tile's delay
  // (0.341s) is also the end of the reveal.
  const lastStart = layer ? parseFloat(layer.children[24].style.animationDelay) : NaN;
  ok('3 tiles share the first frame, the rest step 0.0155s',
    !!layer &&
    parseFloat(layer.children[0].style.animationDelay) === 0 &&
    parseFloat(layer.children[1].style.animationDelay) === 0 &&
    parseFloat(layer.children[2].style.animationDelay) === 0 &&
    Math.abs(parseFloat(layer.children[3].style.animationDelay) - 0.0155) < 1e-9 &&
    Math.abs(lastStart - 0.341) < 1e-9);
  ok('the whole reveal finishes inside 0.5s', lastStart <= 0.5 + 1e-6);

  // --- the 主题设置 pane's two controls (2026-10) ---------------------------
  // The pane is built when the tab mounts (not on first click), so it is here.
  // 关闭背景动画 is an independent switch (off by default); 主白+绿 / 主黑+绿
  // are a radio group: toggling the field must never move the pair, and picking
  // a pair must never start the field.
  const pane = panel.querySelector('.mar-set-pane');
  ok('settings pane is pre-built inside the dialog', !!pane);
  // 2026-10-10: the pane is grouped under section headings, and the background
  // switch sits DIRECTLY above its two knobs — they used to be separated by the
  // whole completion-animation block and the colour pair.
  {
    const heads = pane ? Array.from(pane.querySelectorAll('.mar-set-head'))
      .map((h) => String(h.textContent).trim()) : [];
    ok('settings pane is grouped under section headings', 
      heads.join('|') === '外观|背景动画|任务完成动画|每轮 Token 结算',
      'headings: ' + heads.join('|'));
    const bgRow = pane ? pane.querySelector('#mar-bg-anim').closest('.mar-set-row') : null;
    ok('the background switch is followed immediately by its density / breathing knobs',
      !!(bgRow && bgRow.nextElementSibling &&
        bgRow.nextElementSibling.querySelector('#mar-bg-cell') &&
        bgRow.nextElementSibling.nextElementSibling &&
        bgRow.nextElementSibling.nextElementSibling.querySelector('#mar-bg-speed')));
    ok('the pane keeps a title and a one-line subtitle',
      !!(pane && pane.querySelector('h4') && pane.querySelector('.mar-set-sub')));
  }
  const animIn = pane && pane.querySelector('#mar-bg-anim');
  const pairs = pane ? panel.querySelectorAll('.mar-seg button') : [];
  const pairOn = () => Array.from(pairs).filter((b) => b.getAttribute('aria-checked') === 'true');
  ok('background animation switch is its own control, OFF by default',
    !!animIn && animIn.type === 'checkbox' && animIn.checked === false && pairs.length === 2);
  ok('exactly one colour pair is selected (主黑 + 绿 by default)',
    pairOn().length === 1 && pairOn()[0].getAttribute('data-pair') === 'dark');
  ok('density / breathing are parked while the field is off',
    pane.querySelector('#mar-bg-cell').disabled === true &&
    pane.querySelector('#mar-bg-speed').disabled === true);
  // 每轮 Token 结算（2026-10-09）：与背景动画并列的**独立**开关，默认开
  const billIn = pane && pane.querySelector('#mar-billing');
  ok('per-turn settlement switch is its own control, ON by default',
    !!billIn && billIn.type === 'checkbox' && billIn.checked === true);
  billIn.checked = false;
  billIn.dispatchEvent(new r.win.Event('change', { bubbles: true }));
  ok('turning the settlement off is stored under its own key',
    JSON.parse(r.win.localStorage.getItem('mar.billing.v1')).on === false &&
    billIn.checked === false);
  billIn.checked = true;
  billIn.dispatchEvent(new r.win.Event('change', { bubbles: true }));
  ok('turning it back on stores {on:true} and does not disturb the background switch',
    JSON.parse(r.win.localStorage.getItem('mar.billing.v1')).on === true &&
    d.body.classList.contains('mar-bg-on') === false);
  // 任务完成动画（2026-10-10）：又一个**独立**开关（默认开）+ 一行可改文案 + 预览
  const doneIn = pane && pane.querySelector('#mar-done');
  const doneText = pane && pane.querySelector('#mar-done-text');
  const donePlay = pane && pane.querySelector('#mar-done-play');
  const doneNote = pane && pane.querySelector('#mar-done-note');
  ok('task-completion switch is its own control, ON by default',
    !!doneIn && doneIn.type === 'checkbox' && doneIn.checked === true);
  ok('the banner copy defaults to //RUN_COMPLETE and is editable',
    !!doneText && doneText.type === 'text' && doneText.value === '//RUN_COMPLETE' &&
    !!donePlay && !!doneNote);
  doneIn.checked = false;
  doneIn.dispatchEvent(new r.win.Event('change', { bubbles: true }));
  ok('turning the completion animation off is stored under its own key',
    JSON.parse(r.win.localStorage.getItem('mar.done.v1')).on === false &&
    d.body.classList.contains('mar-bg-on') === false);
  doneText.value = 'SHIP IT';
  doneText.dispatchEvent(new r.win.Event('change', { bubbles: true }));
  ok('the copy is stored', JSON.parse(r.win.localStorage.getItem('mar.done.v1')).text === 'SHIP IT');
  doneText.value = '   ';
  doneText.dispatchEvent(new r.win.Event('change', { bubbles: true }));
  ok('a blank / whitespace-only copy falls back to //RUN_COMPLETE',
    JSON.parse(r.win.localStorage.getItem('mar.done.v1')).text === '//RUN_COMPLETE' &&
    doneText.value === '//RUN_COMPLETE');
  // The preview is the only user-triggered mount. This jsdom runs with
  // runScripts:'outside-only', so the injected engine never executes: the button
  // must say WHY instead of looking dead, and it must not leave a hollow host.
  donePlay.dispatchEvent(new r.win.Event('click', { bubbles: true }));
  ok('a preview whose engine cannot run reports it and leaves no hollow host',
    !d.getElementById('dshMarDoneHost') && /不可用/.test(doneNote.textContent));
  ok('the pane reports whether the trigger is attached (user 2026-10-10)',
    !!pane.querySelector('#mar-done-state') &&
    /已就绪|未就绪|已关闭/.test(pane.querySelector('#mar-done-state').textContent));
  doneIn.checked = true;
  doneIn.dispatchEvent(new r.win.Event('change', { bubbles: true }));
  ok('turning the completion animation back on stores {on:true}',
    JSON.parse(r.win.localStorage.getItem('mar.done.v1')).on === true);
  // switch ON: the field starts, the pair does not move
  animIn.checked = true;
  animIn.dispatchEvent(new r.win.Event('change', { bubbles: true }));
  ok('turning the animation on starts the field and keeps the pair',
    d.body.classList.contains('mar-bg-on') &&
    !d.body.classList.contains('mar-bg-light') &&
    pairOn().length === 1 && pairOn()[0].getAttribute('data-pair') === 'dark' &&
    pane.querySelector('#mar-bg-cell').disabled === false);
  // pair -> 主白 + 绿: the palette flips, the field keeps running
  pairs[0].dispatchEvent(new r.win.Event('click', { bubbles: true }));
  ok('picking 主白 + 绿 flips the UI pair but not the field switch',
    d.body.classList.contains('mar-bg-light') && d.body.classList.contains('mar-bg-on') &&
    animIn.checked === true &&
    pairOn().length === 1 && pairOn()[0].getAttribute('data-pair') === 'light');
  // switch OFF: the field stops, the white UI stays (this was the bug)
  animIn.checked = false;
  animIn.dispatchEvent(new r.win.Event('change', { bubbles: true }));
  ok('turning the animation off keeps the chosen pair (主白 + 绿 stays white)',
    !d.body.classList.contains('mar-bg-on') &&
    d.body.classList.contains('mar-bg-light') &&
    pairOn().length === 1 && pairOn()[0].getAttribute('data-pair') === 'light' &&
    pane.querySelector('#mar-bg-cell').disabled === true);

  // the order is a fixed permutation: same layout every run
  const order1 = layer ? Array.from(layer.children).map((c) => c.style.left + '/' + c.style.top).join(',') : '';
  overlay.remove();
  await sleep(1500);
  ok('closing the dialog clears the layer and re-arms the reveal',
    !panel.querySelector('.mar-mosaic') && !panel.classList.contains('mar-mosaic-on'));

  // reopen with a brand-new panel -> must play again, in the same order
  const overlay2 = d.createElement('div'); overlay2.className = 'zz_overlay';
  const panel2 = d.createElement('div'); panel2.className = 'zz_panel';
  const nav2 = d.createElement('nav'); nav2.className = 'zz_nav';
  for (let i = 0; i < 8; i++) { const c = d.createElement('button'); c.className = 'zz_navCell'; nav2.appendChild(c); }
  panel2.appendChild(nav2);
  overlay2.appendChild(panel2);
  d.body.appendChild(overlay2);
  const layer2 = await waitFor(() => panel2.querySelector('.mar-mosaic'), 2500);
  const order2 = layer2 ? Array.from(layer2.children).map((c) => c.style.left + '/' + c.style.top).join(',') : '';
  ok('reopening replays the reveal', !!layer2 && layer2.children.length === 25);
  ok('tile order is deterministic across opens', order1 !== '' && order1 === order2);

  r.dispose();
  ok('dispose tears the mosaic down', !panel2.querySelector('.mar-mosaic'));

  // --- Test 6: task-board intro — a slab + 4 reticles + frame PER COLUMN ---
  // The board is a third-party plugin's DOM: a root carrying
  // data-dsh-taskboard-board with columns marked data-dsh-part="column" (one per
  // 选项卡: backlog / todo / running / done / failed). jsdom has no layout
  // engine, so the boxes the intro pins its blocks from are stubbed per element
  // — deliberately with the real measured geometry (board 1294x900 at x=280,
  // columns 243x821 at x=296/551/806/1060/1315) so the offsets in the assertion
  // are the ones the running app produces.
  {
    const r6 = runClient({});
    const d6 = r6.win.document;
    d6.documentElement.style.colorScheme = '';
    r6.win.Element.prototype.getBoundingClientRect = function () {
      const b = this.__box;
      const x = b ? b[0] : 0, y = b ? b[1] : 0, w = b ? b[2] : 0, h = b ? b[3] : 0;
      return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h };
    };

    const view = d6.createElement('div');
    view.className = 'zz_boardView';
    view.style.display = 'none';                    // closed board: must not play
    const board = d6.createElement('div');
    board.setAttribute('data-dsh-taskboard-board', '');
    board.__box = [280, 0, 1294, 900];

    // the five columns, at the coordinates the real board lays them out at
    const COL_BOXES = [
      ['backlog', [296, 57, 243, 821]],
      ['todo', [551, 57, 243, 821]],
      ['running', [806, 57, 243, 821]],
      ['done', [1060, 57, 243, 821]],
      ['failed', [1315, 57, 243, 821]],
    ];
    for (const [status, box] of COL_BOXES) {
      const col = d6.createElement('div');
      col.setAttribute('data-dsh-part', 'column');
      col.setAttribute('data-status', status);
      col.__box = box;
      for (let i = 0; i < 2; i++) {                  // a couple of cards inside
        const card = d6.createElement('button');
        card.setAttribute('data-dsh-part', 'card');
        card.__box = [box[0] + 9, box[1] + 41 + i * 92, 225, 84];
        col.appendChild(card);
      }
      board.appendChild(col);
    }
    view.appendChild(board);
    d6.body.appendChild(view);

    // the plugin reflects the open state on <html>; that is what the theme
    // observes, so opening it here is the same signal the real one sends
    await sleep(30);
    ok('board intro does not play while the board is hidden', !board.querySelector('.mar-board-intro'));

    view.style.display = 'block';
    d6.documentElement.setAttribute('data-dsh-taskboard-active', '');
    const layer6 = await waitFor(() => board.querySelector('.mar-board-intro'), 1500);
    ok('opening the board mounts the intro layer', !!layer6);

    const blocks = layer6 ? Array.from(layer6.querySelectorAll('.mar-col-intro')) : [];
    ok('one intro block per 选项卡 (all five)', blocks.length === 5);
    ok('every block is pinned to its own column box, board-relative',
      blocks.length === 5 &&
      blocks[0].style.left === '16px' && blocks[0].style.top === '57px' &&
      blocks[0].style.width === '243px' && blocks[0].style.height === '821px' &&
      blocks[1].style.left === '271px' && blocks[2].style.left === '526px' &&
      blocks[3].style.left === '780px' && blocks[4].style.left === '1035px');
    ok('each tab is 4 rectangles + 1 frame, and nothing per-card',
      blocks.length === 5 && blocks.every((b) =>
        b.querySelectorAll('.mar-col-mask').length === 4 &&
        b.querySelectorAll('.mar-col-frame').length === 1 &&
        b.querySelectorAll('.mar-card-mask').length === 0));
    ok('each rectangle carries its own reticle, so the reticle leaves with it',
      blocks.length === 5 && blocks.every((b) =>
        Array.from(b.querySelectorAll('.mar-col-mask')).every((m) =>
          m.querySelectorAll('.mar-cross').length === 1)));
    ok('a reticle is three bars (h, v, diamond)',
      blocks.length === 5 && (() => {
        const c = blocks[0].querySelector('.mar-cross');
        const kids = c ? Array.from(c.children).map((e) => e.className) : [];
        return kids.join(',') === 'mar-h,mar-v,mar-dot';
      })());
    ok('paint order inside a tab: the four rectangles, then the frame',
      blocks.length === 5 && (() => {
        const kids = Array.from(blocks[0].children).map((e) => e.className);
        return kids.length === 5 &&
          kids.slice(0, 4).every((c) => c === 'mar-col-mask') &&
          kids[4] === 'mar-col-frame';
      })());
    ok('the frame takes both of its delays from the JS budget',
      blocks.length === 5 &&
      blocks[0].style.getPropertyValue('--mar-frame-at') === '1.2s' &&
      blocks[0].style.getPropertyValue('--mar-frame-out-at') === '1.74s');

    // cells are row-major: 0=top-left 1=top-right 2=bottom-left 3=bottom-right,
    // so a 1-2-4-3 walk is 0, 1, 3, 2 — the bottom-RIGHT cell leaves on the
    // third beat and the bottom-left one last.
    const masks = blocks.length === 5 ? Array.from(blocks[0].querySelectorAll('.mar-col-mask')) : [];
    const delays = masks.map((m) => parseFloat(m.style.animationDelay));
    ok('the four rectangles leave in the order 1-2-4-3 (TL, TR, BR, BL)',
      delays.length === 4 &&
      Math.abs(delays[0] - 1.50) < 1e-9 && Math.abs(delays[1] - 1.58) < 1e-9 &&
      Math.abs(delays[2] - 1.74) < 1e-9 && Math.abs(delays[3] - 1.66) < 1e-9);
    // compare as numbers: jsdom serialises "1.50s" back as "1.5s", so string
    // equality on the raw style value is a trap here
    const seq = delays.map((d) => d.toFixed(2)).join(',');
    ok('all five tabs play the same sequence (simultaneously, not staggered)',
      blocks.length === 5 && blocks.every((b) =>
        Array.from(b.querySelectorAll('.mar-col-mask'))
          .map((m) => parseFloat(m.style.animationDelay).toFixed(2)).join(',') === seq));
    // the frame must be fully in before the first rectangle returns, and it has
    // to leave on the very frame the fourth one does — that is the reference's
    // choreography, not an approximation of it
    const frameAt = parseFloat(blocks[0].style.getPropertyValue('--mar-frame-at'));
    const frameOut = parseFloat(blocks[0].style.getPropertyValue('--mar-frame-out-at'));
    ok('the frame is solid before the first rectangle returns',
      frameAt + 0.16 <= Math.min(...delays) + 1e-9);
    ok('the frame leaves on the fourth rectangle\'s own frame',
      Math.abs(frameOut - Math.max(...delays)) < 1e-9);
    ok('the whole sequence closes inside 2s', frameOut + 0.16 <= 2 + 1e-9);

    await sleep(2100); // SPAN 1.90 + the .1s the clear timer sits on top
    ok('intro layer removes itself', !board.querySelector('.mar-board-intro'));

    // close -> reopen must play again. Closing is what the plugin does when the
    // board is dismissed: the <html> flag goes away, the CSS hides the view,
    // and the theme's observer re-arms on that same turn.
    view.style.display = 'none';
    d6.documentElement.removeAttribute('data-dsh-taskboard-active');
    await sleep(30);
    view.style.display = 'block';
    d6.documentElement.setAttribute('data-dsh-taskboard-active', '');
    const replayed = await waitFor(() => board.querySelector('.mar-board-intro'), 1500);
    ok('reopening the board replays the intro', !!replayed);

    r6.dispose();
    ok('dispose tears the board intro down', !board.querySelector('.mar-board-intro'));
  }

  console.log('\nAll ' + passed + ' checks passed.');
  process.exit(0);
})();
