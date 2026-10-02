/* test/boot-engine.test.cjs — exercise the boot payload in jsdom to verify
 * structure + lifecycle wiring:
 *
 *   apply() mounts #dshMarBootHost
 *     -> marathon engine builds the maze grid synchronously at mount
 *     -> start() returns without throwing and the render loop is wired
 *     -> dispose() removes the host + clears window.__mbBootDone
 *
 * jsdom's requestAnimationFrame does not advance performance.now() in lockstep
 * with its rAF callbacks, so we DO NOT assert "host removed after marathon
 * ended" here — that path is exercised by `npm run verify:boot` (headless
 * Chromium over CDP). Run: `node test/boot-engine.test.cjs`.
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const clientSrc = fs.readFileSync(path.join(root, 'client.js'), 'utf8');

// Minimal 2D context stub — enough surface for the marathon renderer AND for
// the ASCII background field: bgMount -> bgApplyMode -> bgDraw paints its glyphs
// with fillText, so a stub without it throws "g.fillText is not a function" and
// takes the whole boot test down with it (every other assertion in this file
// was silently skipped because of that).
function makeCtx() {
  const noop = () => {};
  return {
    canvas: null,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    lineCap: 'butt', lineJoin: 'miter', globalAlpha: 1,
    font: '10px monospace', textBaseline: 'alphabetic',
    setTransform: noop, save: noop, restore: noop,
    clearRect: noop, fillRect: noop, strokeRect: noop, fillText: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    arc: noop, fill: noop, stroke: noop
  };
}

(async () => {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://localhost/',
    pretendToBeVisual: true,
    runScripts: 'dangerously'
  });
  const win = dom.window;
  const errors = [];
  win.addEventListener('error', (e) => errors.push(String(e.error && e.error.stack ? e.error.stack : e.message)));

  // canvas stub: jsdom has no node-canvas, so getContext('2d') -> stub
  win.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type === '2d') { if (!this._mbCtx) this._mbCtx = makeCtx(); return this._mbCtx; }
    return null;
  };

  let captured = null;
  win.__ModuleLoader__ = { load: (spec) => { captured = spec; } };
  // Desktop shell bridge stub — the intro must announce itself as soon as it
  // mounts (2026-09-26 regression: the hook was called before it existed).
  const chromeCalls = [];
  const chromeWho = [];
  win.dshDesktopBoot = { chrome: (visible, who) => { chromeCalls.push(visible); chromeWho.push(who); } };
  let tokens = null;
  const fakeCtx = {
    get: (name) => name === 'theme'
      ? { overrideTokens: (id, map) => { tokens = { id, map }; return () => {}; } }
      : null
  };

  win.eval(clientSrc);
  assert.ok(captured, 'module loader called');
  const mod = captured.factory(() => ({}));
  const dispose = mod.apply(fakeCtx);

  const doc = win.document;
  assert.ok(doc.querySelector('#dshMarBootHost'), 'boot host mounted');
  assert.ok(doc.querySelector('#dshMarBootHost #mb-canvas'), 'marathon canvas mounted');
  assert.ok(typeof win.__mbMarathon === 'object' && typeof win.__mbMarathon.start === 'function', 'marathon engine registered');
  assert.ok(typeof win.__mbIntroStop === 'function', 'intro engine registered');
  assert.ok(typeof win.__mbMarathon.cfg === 'object' && win.__mbMarathon.cfg.ZONES === 3, 'CFG exposed');

  // --- desktop contract, asserted at mount time -----------------------------
  // The payload must announce itself while it mounts, not on the first timer:
  // html[data-mar-boot] is what makes html/body/#root see-through, and
  // chrome(false) is what blanks the native Windows caption buttons.
  assert.ok(doc.documentElement.hasAttribute('data-mar-boot'),
    'mounting the boot overlay sets html[data-mar-boot] (transparent page)');
  assert.strictEqual(chromeCalls[0], false,
    'mounting the boot overlay hides the native window buttons (chrome(false))');
  // The second argument is a requester name, not a payload: the packaged-document
  // patch asks for the same state over the same channel, and a cold-start trace
  // with two identical `boot chrome hidden` lines could not be attributed without
  // it (2026-09-26: shell log read "hidden" at 6082ms and 7971ms, source unknown).
  assert.strictEqual(chromeWho[0], 'theme',
    'the boot-chrome call names its requester (chrome(visible, "theme"))');

  // maze grid was built synchronously at mount (resize() ran)
  const st = win.__mbEngineState();
  assert.ok(st.cells && st.cells.length > 1000, 'cell grid built (' + (st.cells ? st.cells.length : 0) + ' cells)');
  assert.ok(st.TOTAL_REGIONS >= 6, 'regions built (' + st.TOTAL_REGIONS + ')');

  // start the marathon stage immediately (the intro orchestrator would do this
  // at ~7.1s; we bypass it to keep the test fast). jsdom's rAF will tick a few
  // times but won't drive performance.now() to END, so we just verify the
  // engine's render loop is wired and dispose() is clean.
  win.__mbMarathon.start();
  await new Promise((r) => setTimeout(r, 400));

  // start/stop bindings remain callable
  assert.ok(win.__mbMarathon.start && win.__mbMarathon.stop, 'marathon start/stop bindings present');

  // teardown must remove the host and clear the boot-done hook
  dispose();
  assert.ok(!doc.querySelector('#dshMarBootHost'), 'dispose() removes boot host');
  assert.ok(win.__mbBootDone === null, 'dispose() clears window.__mbBootDone');
  assert.ok(!doc.documentElement.hasAttribute('data-mar-boot'),
    'dispose() drops html[data-mar-boot] (page is opaque again)');
  assert.strictEqual(chromeCalls[chromeCalls.length - 1], true,
    'dispose() restores the native window buttons (chrome(true))');
  assert.ok(errors.length === 0, 'no runtime errors during boot: ' + errors.join('\n'));

  console.log('  ✓ boot host mounted + engines registered');
  console.log('  ✓ transparent page + caption buttons handed over at mount (chrome: ' + JSON.stringify(chromeCalls) + ', requester: ' + JSON.stringify(chromeWho[0]) + ')');
  console.log('  ✓ maze grid built (' + st.cells.length + ' cells, ' + st.TOTAL_REGIONS + ' regions)');
  console.log('  ✓ marathon start() wired without errors');
  console.log('  ✓ dispose() removes boot host + clears __mbBootDone');
  console.log('  ✓ zero runtime errors');
  console.log('\nAll boot-engine checks passed.');
  process.exit(0);
})().catch((e) => {
  console.error('\nBOOT-ENGINE TEST FAILED:');
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
