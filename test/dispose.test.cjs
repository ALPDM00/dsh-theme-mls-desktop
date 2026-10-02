/* test/dispose.test.cjs — the plugin-unload contract.
 *
 * Registry: on 2026-09-26 the desktop report was "after closing the plugin the
 * whole background animation swallows the UI; only a restart fixes it". Measured
 * on the real page (withdrawing the theme stylesheet while the nodes survive):
 *
 *   before   #mar-ascii-bg pos=static  #root top=952  scrollHeight=1904  centre hit the canvas
 *   after    #mar-ascii-bg pos=fixed   #root top=0    scrollHeight=952   centre hit the app
 *
 * The canvas is sized by its width/height ATTRIBUTES (innerWidth*dpr) and used to
 * take its geometry from the stylesheet alone, so a sheet that goes away while the
 * node stays turns it into a viewport-sized in-flow block that pushes #root off
 * the screen. Two things must therefore hold, and this file locks both down:
 *
 *   1. the canvas (and the boot host) carry their own geometry INLINE, so no
 *      stylesheet withdrawal can ever demote them to in-flow blocks;
 *   2. dispose() cannot be cut short — one throwing step must not skip the ones
 *      after it, the stylesheet must always be withdrawn, and the apply() guard
 *      must be cleared so a later re-enable really re-enables.
 *
 * jsdom has no layout engine, so the geometry is asserted as the inline-style
 * invariant that produces it; the rect-level evidence lives in the real-page
 * probe (see the note in bgMount). Run: `node test/dispose.test.cjs`.
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const clientSrc = fs.readFileSync(path.join(root, 'client.js'), 'utf8');

/* Same harness as plugin.test.cjs, but the styles insert is tracked so we can
 * tell whether its disposer was actually called. */
function boot() {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'outside-only'
  });
  const win = dom.window;
  win.__ModuleLoader__ = { load: () => {} };
  let captured = null;
  win.__ModuleLoader__.load = (spec) => { captured = spec; };
  let sheetWithdrawn = 0;
  win.styles = { insert: () => () => { sheetWithdrawn++; } };
  win.eval(clientSrc);
  const mod = captured.factory(function () { return {}; });
  const ctx = {
    get: (name) => (name === 'theme'
      ? { overrideTokens: () => () => {} }
      : null)
  };
  const apply = () => mod.apply(ctx);
  return {
    win, doc: win.document, mod, apply,
    sheetsWithdrawn: () => sheetWithdrawn,
  };
}

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  console.log('  ✓ ' + name);
  passed++;
}

console.log('dsh-theme-mls-desktop · dispose self-test\n');

// --- 1. the inline-geometry invariant --------------------------------------
// This is the actual regression guard: delete the cssText in bgMount and BOTH
// the theme tests and the app still work, right up until the sheet goes away.
(() => {
  const r = boot();
  const dispose = r.apply();
  const canvas = r.doc.getElementById('mar-ascii-bg');
  ok('canvas mounted', !!canvas);
  ok('canvas pins position inline', canvas.style.position === 'fixed');
  ok('canvas pins full-viewport size inline',
    canvas.style.width === '100%' && canvas.style.height === '100%');
  ok('canvas pins z-index:0 inline (stays under #root\'s positioned panels)',
    canvas.style.zIndex === '0');
  ok('canvas pins pointer-events:none inline (a full-screen canvas must not eat clicks)',
    canvas.style.pointerEvents === 'none');
  ok('canvas is body\'s first child', r.doc.body.firstChild === canvas);

  const host = r.doc.getElementById('dshMarBootHost');
  ok('boot host mounted', !!host);
  ok('boot host pins position + clipping inline',
    host.style.position === 'fixed' && host.style.overflow === 'hidden');
  ok('boot host pins pointer-events:none inline', host.style.pointerEvents === 'none');
  dispose();
})();

// --- 2. a clean dispose leaves nothing behind -------------------------------
(() => {
  const r = boot();
  const dispose = r.apply();
  // Simulate a dispose that lands mid-boot: the overlay has already claimed
  // `html[data-mar-boot]`, and the hook that normally gives it back is NOT
  // reachable (jsdom runs scripts 'outside-only', so the injected boot scripts
  // never execute and window.__mbIntroStop is undefined — the same shape as a
  // boot script that died before its tail). A stale attribute is not cosmetic:
  // boot.css turns it into `visibility:hidden` for everything except the boot
  // host, so once the host is gone the whole app would be invisible.
  r.doc.documentElement.setAttribute('data-mar-boot', '');
  dispose();
  ok('canvas gone', !r.doc.getElementById('mar-ascii-bg'));
  ok('boot host gone', !r.doc.getElementById('dshMarBootHost'));
  ok('body class cleared', !r.doc.body.classList.contains('theme-marathon'));
  ok('no mar- nodes left', r.doc.querySelectorAll('[class*="mar-"]').length === 0);
  ok('no data-mar-* nodes left', r.doc.querySelectorAll('[data-mar-pane],[data-mar-nav]').length === 0);
  ok('html[data-mar-boot] cleared without relying on __mbIntroStop',
    !r.doc.documentElement.hasAttribute('data-mar-boot'));
  ok('stylesheet withdrawn', r.sheetsWithdrawn() === 1);
  ok('apply() guard cleared (so a re-enable can re-apply)',
    r.win.__dshThemeMarathonApplied === false);
})();

// --- 3. one throwing step must not skip the rest ----------------------------
// The stylesheet has to be withdrawn LAST and unconditionally: "sheet gone, nodes
// left" is the unrecoverable half-state, so a step that throws early must not be
// able to reach the end without the withdrawal having happened.
(() => {
  const r = boot();
  const dispose = r.apply();
  const realQSA = r.doc.querySelectorAll.bind(r.doc);
  // clearMosaic() and the panel walk both ask for [class*="_panel"]; make that
  // lookup throw, which is step 3-ish — long before bgTeardown and the sheet.
  r.doc.querySelectorAll = (sel) => {
    if (String(sel).includes('_panel')) throw new Error('boom: simulated DOM failure');
    return realQSA(sel);
  };
  let threw = false;
  try { dispose(); } catch (e) { threw = true; }
  r.doc.querySelectorAll = realQSA;

  ok('dispose does not propagate the failure to the host', !threw);
  ok('a step that threw did not stop the canvas from being removed',
    !r.doc.getElementById('mar-ascii-bg'));
  ok('a step that threw did not stop the sheet from being withdrawn',
    r.sheetsWithdrawn() === 1);
  ok('a step that threw did not stop the body class being cleared',
    !r.doc.body.classList.contains('theme-marathon'));
  ok('a step that threw did not stop the guard from being cleared',
    r.win.__dshThemeMarathonApplied === false);
})();

// --- 4. dispose then re-enable really re-enables ----------------------------
// Before the guard reset, the second apply() returned undefined and mounted
// nothing: the theme came back half-dead (no sheet, no canvas, no boot).
(() => {
  const r = boot();
  const first = r.apply();
  first();
  const second = r.apply();
  ok('second apply returns a disposer', typeof second === 'function');
  ok('second apply re-mounts the canvas',
    r.doc.querySelectorAll('#mar-ascii-bg').length === 1);
  ok('second apply does not duplicate the canvas',
    r.doc.querySelectorAll('canvas#mar-ascii-bg').length === 1);
  ok('second apply re-adds the body class', r.doc.body.classList.contains('theme-marathon'));
  ok('guard is set again', r.win.__dshThemeMarathonApplied === true);
  second();
  ok('and it disposes cleanly too', !r.doc.getElementById('mar-ascii-bg'));
})();

console.log('\nAll ' + passed + ' dispose checks passed.\n');
