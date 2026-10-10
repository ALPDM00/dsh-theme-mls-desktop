/* test/done-engine.test.cjs — exercise the task-completion overlay in jsdom:
 * the TRIGGER (where the behavioural risk is — it shipped broken once because the
 * sessions service is registered by another plugin, so a single `ctx.get()`
 * inside apply() wired nothing at all), the mount/teardown lifecycle, and the
 * reverse-S ordering the animation is built on.
 *
 *   apply()  -> attachDone(): ctx.inject(['sessions'], …) AND a poke loop
 *     -> first readable `running` per session is a BASELINE (silent)
 *     -> running true -> false on the *displayed* session schedules the overlay
 *     -> a user stop (session.cancel()), an interrupted or an errored turn end
 *        is suppressed
 *     -> a new turn starting tears a playing overlay down
 *     -> pointerdown / keydown removes it (document capture phase)
 *     -> dispose() unsubscribes and removes whatever is mounted
 *
 * The four painted acts themselves (reverse red sweep geometry, the unified
 * matrix lattice, the fade to black, the hard-cut tile reveal + dot field +
 * banner, and the light-palette ink flip) are verified by
 * `.generated/verify-done.cjs` (headless Chromium over CDP, pixels read back).
 * Run: `node test/done-engine.test.cjs`.
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const clientSrc = fs.readFileSync(path.join(root, 'client.js'), 'utf8');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Minimal 2D context stub (same shape as test/boot-engine.test.cjs). The
// completion engine paints rects, crosses, boxes, dots and arcs.
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
    rect: noop, arc: noop, fill: noop, stroke: noop
  };
}

/**
 * Boot one fresh jsdom + plugin instance.
 * @param {object} [opts]
 * @param {boolean} [opts.reduce] - make matchMedia report prefers-reduced-motion
 * @param {object} [opts.store] - seed localStorage 'mar.done.v1'
 * @param {boolean} [opts.noSessions] - omit the sessions service entirely
 * @param {boolean} [opts.late] - `sessions` is ABSENT at apply() time and only
 *   becomes readable later (the real ordering that broke the trigger).
 * @param {boolean} [opts.inject] - false removes ctx.inject, leaving only the
 *   poke loop as a way to attach.
 */
async function fresh(opts) {
  const o = opts || {};
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://localhost/',
    pretendToBeVisual: true,
    runScripts: 'dangerously'
  });
  const win = dom.window;
  const errors = [];
  win.addEventListener('error', (e) => errors.push(String(
    e.error && e.error.stack ? e.error.stack : e.message)));

  win.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type === '2d') { if (!this._mbCtx) this._mbCtx = makeCtx(); return this._mbCtx; }
    return null;
  };

  // Reduced-motion probe: the plugin asks window.matchMedia on every mount.
  win.matchMedia = (query) => ({
    matches: !!o.reduce && /prefers-reduced-motion/.test(String(query)),
    media: String(query),
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}
  });

  if (o.store) win.localStorage.setItem('mar.done.v1', JSON.stringify(o.store));

  // A realistic transcript anchor. The DOM belt keys off "the SAME transcript gained
  // a turn tail", so the container has to exist from the start — exactly as it does
  // in the app (the empty transcript is mounted before the first turn runs).
  const scroll = win.document.createElement('div');
  scroll.setAttribute('data-conversation-scroll', '');
  win.document.body.appendChild(scroll);
  // A turn's DOM life cycle, as the real app renders it: the running indicator
  // (`_turnStatus`) appears while the turn runs, then goes away and the turn tail
  // (`data-turn-tail`) is appended. The tail belt only counts a tail that follows a
  // running indicator (otherwise mounting a session's history would look like a
  // finished turn — that was the "plays by itself after the boot animation" report).
  function domTurnStart() {
    const s = win.document.createElement('i');
    s.className = 'Zz_turnStatus';
    s.setAttribute('data-test-status', '1');
    scroll.appendChild(s);
  }
  function domTurnEnd(turn, opts) {
    const o = opts || {};
    const s = scroll.querySelector('[data-test-status]');
    if (s && s.parentNode) s.parentNode.removeChild(s);
    const wrap = win.document.createElement('div');
    if (o.interrupted) wrap.innerHTML = '<span>已中断</span>';
    const t = win.document.createElement('div');
    t.setAttribute('data-turn-tail', String(turn));
    wrap.appendChild(t);
    scroll.appendChild(wrap);
  }
  function domMountHistory(turns) {
    const wrap = win.document.createElement('div');
    for (let i = 1; i <= turns; i++) {
      const t = win.document.createElement('div');
      t.setAttribute('data-turn-tail', String(i));
      wrap.appendChild(t);
    }
    scroll.appendChild(wrap);
  }

  let captured = null;
  // The plugin logs every trigger decision through console.info — surface it when
  // MAR_DEBUG is set, so a failing trigger chain explains itself.
  if (process.env.MAR_DEBUG) {
    const orig = win.console.info;
    win.console.info = (m) => { console.log('    [plugin] ' + m); };
    win.console.info.orig = orig;
  }
  win.__ModuleLoader__ = { load: (spec) => { captured = spec; } };
  win.dshDesktopBoot = { chrome: () => {} };

  // ---- sessions double -----------------------------------------------------
  // Two feeds have to be modelled, because the trigger uses both:
  //   · `list` — SessionListState: ids / byId[id].running / current
  //   · `binding(id).session` — ConversationSnapshot: `running`, `turnEnds`
  //     (the monotone counter the trigger watches) and `cancel()` (wrapped by the
  //     plugin to learn that the user pressed stop).
  // The FACES must be stable per session: the plugin keys its cancel() wrapper and
  // its subscription on the instance it resolves.
  let state = { ids: [], byId: {}, current: undefined };
  const nodes = {};        // sessionId -> ConversationSnapshot.nodes
  const turns = {};        // sessionId -> Map<turn, seq> (turnEnds)
  const runningBit = {};   // sessionId -> face-level running
  const faces = {};
  const faceSubs = {};
  const cancelCalls = {};
  const listeners = [];
  function faceSnap(id) {
    return {
      nodes: nodes[id] || [],
      turnEnds: turns[id] || new Map(),
      running: !!runningBit[id]
    };
  }
  function faceFor(id) {
    if (!faces[id]) {
      faces[id] = {
        getSnapshot: () => faceSnap(id),
        subscribe: (fn) => {
          (faceSubs[id] = faceSubs[id] || []).push(fn);
          return () => {
            const l = faceSubs[id] || [];
            const i = l.indexOf(fn);
            if (i >= 0) l.splice(i, 1);
          };
        },
        cancel: () => {
          cancelCalls[id] = (cancelCalls[id] || 0) + 1;
          return Promise.resolve({ accepted: true });
        }
      };
    }
    return faces[id];
  }
  function emitFace(id) { (faceSubs[id] || []).slice().forEach((fn) => fn()); }
  const sessions = {
    list: {
      getSnapshot: () => state,
      listenerCount: () => listeners.length,
      subscribe: (fn) => {
        listeners.push(fn);
        return () => {
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        };
      }
    },
    binding: (id) => ({ session: faceFor(id) })
  };
  // The LIVE client `sessions` face has no `list` at all (binding / scope / retain /
  // … only — verified against the running client through Cordis Inspect). Modelling
  // that here is what keeps the original bug dead.
  if (o.noList) delete sessions.list;
  function push(next, nodeList) {
    if (nodeList) nodes[next.current || 's1'] = nodeList;
    state = next;
    listeners.slice().forEach((fn) => fn());
  }
  // 一轮开始 / 结束，只走**会话面**（模拟"短任务"：列表快照可能一次 running=true
  // 都没推出来，只有会话面的 turnEnds 涨了一项）。
  function startFaceTurn(id) { runningBit[id] = true; emitFace(id); }
  function endFaceTurn(id, turn, nodeList) {
    runningBit[id] = false;
    turns[id] = turns[id] || new Map();
    turns[id].set(turn, 10000 + turn);
    if (nodeList) nodes[id] = nodeList;
    emitFace(id);
  }

  let live = !o.late;
  const injectCbs = [];
  const fakeCtx = {
    get: (name) => {
      if (name === 'theme') return { overrideTokens: () => () => {} };
      if (name === 'sessions') return (o.noSessions || !live) ? null : sessions;
      return null;
    }
  };
  if (o.inject !== false) {
    fakeCtx.inject = (deps, cb) => { if (live) cb(fakeCtx); else injectCbs.push(cb); };
  }
  function releaseSessions() {
    live = true;
    injectCbs.splice(0).forEach((cb) => cb(fakeCtx));
  }

  win.eval(clientSrc);
  assert.ok(captured, 'module loader called');
  const dispose = captured.factory(() => ({}))['apply'](fakeCtx);

  const doc = win.document;
  const host = () => doc.getElementById('dshMarDoneHost');
  const dismiss = () => doc.dispatchEvent(new win.Event('pointerdown', { bubbles: true }));

  return { win, doc, dispose, sessions, push, host, dismiss, errors,
    faces, cancelCalls, releaseSessions, startFaceTurn, endFaceTurn, scroll,
    domTurnStart, domTurnEnd, domMountHistory };
}

/** running true -> false on the displayed session s1 (a normal completion). */
async function complete(env, nodeList) {
  env.push({ ids: ['s1'], byId: { s1: { running: true } }, current: 's1' });   // baseline
  await sleep(30);
  env.push({ ids: ['s1'], byId: { s1: { running: false } }, current: 's1' }, nodeList); // edge
}

const failures = [];
function check(name, fn) {
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { failures.push(name + ' — ' + (e && e.message)); console.log('  ✗ ' + name + ' — ' + (e && e.message)); }
}

(async () => {
  // ---------------------------------------------------------------- baseline
  {
    const env = await fresh();
    env.push({ ids: ['s1'], byId: { s1: { running: false } }, current: 's1' });
    await sleep(500);
    check('first readable running value is a baseline: nothing plays',
      () => assert.strictEqual(env.host(), null, 'no overlay after a baseline read'));
    env.dispose();
  }

  // ------------------------------------------------- normal completion plays
  {
    const env = await fresh();
    const doc = env.doc;
    assert.strictEqual(env.host(), null, 'overlay must not exist before a turn ends');
    await complete(env);
    await sleep(650);

    check('running true→false mounts the completion overlay', () => {
      assert.ok(env.host(), '#dshMarDoneHost missing');
      assert.ok(doc.querySelector('#dshMarDoneHost #md-scene'), 'scene canvas missing');
      assert.ok(doc.querySelector('#dshMarDoneHost #md-dots'), 'dot canvas missing');
      assert.ok(doc.querySelector('#dshMarDoneHost #md-tiles'), 'tile layer missing');
      assert.ok(doc.querySelector('#dshMarDoneHost #md-banner-text'), 'banner text missing');
    });
    check('overlay is click-through and painted below the boot overlay', () => {
      const css = env.host().style.cssText;
      assert.ok(/pointer-events:\s*none/.test(css), 'overlay must stay pointer-events:none');
      const z = /z-index:\s*(\d+)/.exec(css);
      assert.ok(z && Number(z[1]) < 2147483000, 'completion overlay must sit below #dshMarBootHost');
    });
    check('engine registered with the default banner text', () => {
      assert.strictEqual(env.win.__mbDone.cfg.BANNER_TEXT, '//RUN_COMPLETE');
      assert.strictEqual(doc.querySelector('#md-banner-text').textContent, '//RUN_COMPLETE');
    });
    check('engine starts in the sweep act', () => {
      assert.strictEqual(env.win.__mbDone.state().phase, 'sweep');
    });
    check('the sweep runs bottom-right → top-left (reverse of the boot S)', () => {
      const st = env.win.__mbDone.state();
      const r = st.regions;
      const why = ' (' + r.length + ' panels, viewport ' + st.W + 'x' + st.H + ')';
      assert.ok(r.length >= 6, 'expected several sweep panels' + why);
      assert.strictEqual(r[0].z, 2, 'first panel must be in the bottom zone' + why);
      assert.ok(r[0].x1 >= st.W - 1, 'first panel must reach the right edge (bottom-right origin)' + why);
      assert.strictEqual(r[r.length - 1].z, 0, 'last panel must be in the top zone' + why);
      assert.strictEqual(r[r.length - 1].x0, 0, 'last panel must sit at the left edge (top-left finish)' + why);
      for (let i = 1; i < r.length; i++) {
        assert.ok(r[i].z <= r[i - 1].z, 'zones must be visited bottom-up' + why);
        if (r[i].z !== r[i - 1].z) continue;
        if (r[i].z === 1) assert.ok(r[i].x0 > r[i - 1].x0, 'middle zone is traversed L→R' + why);
        else assert.ok(r[i].x0 < r[i - 1].x0, 'outer zones are traversed R→L' + why);
      }
    });
    check('timeline keeps the boot red-sweep coefficients', () => {
      const c = env.win.__mbDone.cfg;
      assert.strictEqual(c.RED_RISE, 180);
      assert.strictEqual(c.RED_HOLD, 400);
      assert.strictEqual(c.RED_EXIT, 280);
      assert.ok(c.SWEEP_END > 0 && c.MARK_AT < c.SWEEP_END,
        'the matrix must start while the sweep is still running');
      assert.ok(c.BLACK_AT > c.MARK_DONE, 'the black beat must follow the finished matrix');
      assert.ok(c.TILES_AT > c.BLACK_AT, 'the tile reveal must follow the fade to black');
      assert.ok(c.BANNER_AT - (c.TILES_AT + c.REVEAL_DUR) >= 900,
        'banner waits ~1s after the dot field is in');
    });
    check('the field tile size is not clobbered by the reveal knob', () => {
      const c = env.win.__mbDone.cfg;
      assert.strictEqual(c.TILE_SIZE, 5, 'the maze tile size must stay 5');
      assert.strictEqual(c.REVEAL_TILE, 80, 'the reveal tiles must be 80px');
    });
    check('one lattice, one glyph size (sized to the boot marks)', () => {
      const c = env.win.__mbDone.cfg;
      assert.strictEqual(c.UI_CELL, 24, 'the lattice must be the 24px cell the boot marks use');
      assert.strictEqual(c.UI_GLYPH_SCALE, 0.34, 'glyph = 24 x 0.34 = 8.16px (the boot UI_CROSS_SCALE)');
      assert.strictEqual(c.UI_LINE_MIN, 0.9, 'line width floor (the boot formula)');
      assert.strictEqual(c.UI_LINE_SCALE, 0.2, 'line width = size x 0.20 (the boot formula)');
      assert.strictEqual(c.UI_LINE_WIDTH, undefined, 'the old fixed line width must be gone');
      assert.strictEqual(c.UI_GLYPH, undefined, 'the old single-size knob must be gone');
      assert.strictEqual(c.UI_STEP, undefined, 'the old step knob must be gone');
    });
    check('the matrix lights up panel by panel behind the red sweep', () => {
      const c = env.win.__mbDone.cfg;
      assert.ok(c.MARK_AT < c.SWEEP_END,
        'the matrix must start before the sweep is over (' + c.MARK_AT + ' vs ' + c.SWEEP_END + ')');
      assert.ok(c.MARK_DONE > c.MARK_AT, 'MARK_DONE must follow MARK_AT');
      assert.strictEqual(c.TILES_AT, c.BLACK_AT + c.BLACK_FADE + c.BLACK_HOLD,
        'the reveal must follow fade + flat-black hold');
      assert.ok(c.BLACK_HOLD >= 500, 'there must be a real black hold (' + c.BLACK_HOLD + 'ms)');
      assert.ok(c.BLACK_FADE >= 800, 'the fade to black must be long (' + c.BLACK_FADE + 'ms)');
    });
    check('the reveal is hard-cut tiles, not glass', () => {
      const style = env.doc.querySelector('#dshMarDoneHost style').textContent;
      assert.ok(!/backdrop-filter/.test(style), 'no frosted panes');
      assert.ok(/visibility:\s*hidden/.test(style), 'the tile-off state must be a hard cut');
    });
    check('the ink follows the palette', () => {
      const style = env.doc.querySelector('#dshMarDoneHost style').textContent;
      assert.ok(/--md-ink:\s*#FFFFFF/.test(style), 'dark palette ink missing');
      assert.ok(/body\.mar-bg-light #dshMarDoneHost\s*\{\s*--md-ink:\s*#0B0D0B/.test(style),
        'light palette ink flip missing');
    });

    check('pointerdown dismisses it (document capture phase)', () => {
      assert.ok(env.host(), 'precondition: overlay still playing');
    });
    env.dismiss();
    await sleep(420);
    check('pointerdown removes the overlay and clears its hook', () => {
      assert.strictEqual(env.host(), null, 'overlay survived a dismissal');
      assert.strictEqual(env.win.__mbDoneFinish, null, '__mbDoneFinish not cleared');
    });
    check('no runtime errors', () => assert.deepStrictEqual(env.errors, []));
    env.dispose();
  }

  // ------------------------------- the subscription must arrive LATE (bug #1)
  // Real ordering: apply() runs before the sessions service is registered, so
  // ctx.get('sessions') is null there. ctx.inject is the idiom; the poke loop is
  // the belt for hosts without it. Both paths have to end in a working trigger.
  for (const useInject of [true, false]) {
    const label = useInject ? 'ctx.inject callback' : 'the poke loop (no ctx.inject)';
    const env = await fresh({ late: true, inject: useInject });
    check(label + ': nothing is subscribed while the service is missing', () => {
      assert.strictEqual(env.win.__marDoneDebug().subscribed, false);
      assert.strictEqual(env.win.__marDoneDebug().sessionsService, false);
    });
    env.releaseSessions();
    await sleep(useInject ? 60 : 700);   // the poke fires every 400ms
    check(label + ': the trigger attaches once the service appears', () => {
      assert.strictEqual(env.win.__marDoneDebug().subscribed, true,
        'subscription still missing: ' + JSON.stringify(env.win.__marDoneDebug()));
    });
    await complete(env);
    await sleep(650);
    check(label + ': a normal completion then plays', () => {
      assert.ok(env.host(), 'overlay did not mount after the late attach');
    });
    env.dismiss();
    await sleep(420);
    env.dispose();
  }

  // ------------------------------- a sessions face WITHOUT `list` (the real one)
  // The live client service face is `{ retain, using, retainInfo, refreshProjections,
  // search, fork, scope, binding }` — no `list`. Demanding `sessions.list.subscribe`
  // made the trigger bail out forever, which is exactly the user's "预览能播、真任务
  // 不播". The DOM anchors must therefore carry the trigger on their own.
  {
    const env = await fresh({ noList: true });
    check('a sessions face without `list` is still accepted', () => {
      assert.strictEqual(env.win.__marDoneDebug().sessionsService, true,
        'the trigger refused a face-only sessions service: ' +
        JSON.stringify(env.win.__marDoneDebug()));
      assert.strictEqual(env.win.__marDoneDebug().subscribed, false, 'there is no list to subscribe to');
    });
    // a completed turn shows up as a new turn-tail node inside the mounted
    // transcript (the anchor the billing paper already relies on)
    env.domTurnStart();
    await sleep(300);
    env.domTurnEnd(1);
    await sleep(700);
    check('a new turn-tail node plays the animation (no session id needed)', () => {
      assert.ok(env.host(), 'no play from the DOM anchor: ' +
        JSON.stringify(env.win.__marDoneDebug()));
    });
    if (env.host()) { env.dismiss(); await sleep(420); }
    env.dispose();
  }
  {
    // A transcript that MOUNTS with history (every session does, and the boot
    // animation lands right on top of it) must not look like a finished turn.
    const env = await fresh({ noList: true });
    env.domMountHistory(3);
    await sleep(700);
    check('mounting a transcript that already carries turn tails does not play',
      () => assert.strictEqual(env.host(), null, 'played on a mount'));
    // ...and the next REAL turn end still plays
    env.domTurnStart();
    await sleep(300);
    env.domTurnEnd(4);
    await sleep(700);
    check('...while the next real turn end still plays',
      () => assert.ok(env.host(), 'missed the real end: ' +
        JSON.stringify(env.win.__marDoneDebug())));
    if (env.host()) { env.dismiss(); await sleep(420); }
    env.dispose();
  }
  {
    // Revisiting a session re-renders the transcript (the old tails are gone):
    // that must not replay the animation.
    const env = await fresh({ noList: true });
    env.domMountHistory(1);
    await sleep(120);
    env.domTurnStart();
    await sleep(300);
    env.domTurnEnd(2);
    await sleep(700);
    check('a turn end plays once', () => assert.ok(env.host(), 'did not play'));
    env.dismiss();
    await sleep(500);
    // switch away and back: the transcript is replaced wholesale, and the new
    // session's own history has MORE tails than the old one did
    while (env.scroll.firstChild) env.scroll.removeChild(env.scroll.firstChild);
    env.domMountHistory(5);
    await sleep(700);
    check('switching sessions (a re-rendered transcript) does not replay',
      () => assert.strictEqual(env.host(), null, 'replayed on a session switch: ' +
        JSON.stringify(env.win.__marDoneDebug())));
    env.dispose();
  }
  {
    // ...and an interrupted turn is still suppressed, read off the DOM (the label
    // next to the turn tail), because there is no session face to ask.
    const env = await fresh({ noList: true });
    env.domTurnStart();
    await sleep(300);
    env.domTurnEnd(1, { interrupted: true });
    await sleep(700);
    check('an interrupted turn-tail (DOM label) does not play', () => {
      assert.strictEqual(env.host(), null, 'played for an interrupted turn');
    });
    env.dispose();
  }

  // --------------------------------- a SHORT turn that only the face sees (bug #2)
  // User 2026-10-10: "是不是因为任务时间太短了？" — a short turn can go
  // running true→false entirely between two list pushes (or inside one batched
  // push), so an edge-only trigger never sees it. ConversationSnapshot.turnEnds is
  // monotone: the counter growing IS the evidence, with no edges required.
  {
    const env = await fresh();
    env.push({ ids: ['s1'], byId: { s1: { running: false } }, current: 's1' });   // baseline
    await sleep(80);
    // 一轮开始并结束：**列表快照一次 running=true 都没推**，只有会话面在动
    env.startFaceTurn('s1');
    await sleep(20);
    env.endFaceTurn('s1', 1);
    await sleep(750);
    check('a short turn the list never marks running still plays (turnEnds counter)', () => {
      assert.ok(env.host(), 'overlay did not mount: ' +
        JSON.stringify(env.win.__marDoneDebug()));
    });
    if (env.host()) { env.dismiss(); await sleep(420); }
    env.dispose();
  }
  {
    // ...and it stays in sync: a second turn ends the same way, so a second
    // ceremony must follow (the counter keeps growing).
    const env = await fresh();
    env.push({ ids: ['s1'], byId: { s1: { running: false } }, current: 's1' });
    await sleep(80);
    env.startFaceTurn('s1');
    env.endFaceTurn('s1', 1);
    await sleep(750);
    const first = !!env.host();
    env.dismiss();
    await sleep(420);
    env.startFaceTurn('s1');
    env.endFaceTurn('s1', 2);
    await sleep(750);
    check('each finished turn gets its own ceremony (the counter is per turn)', () => {
      assert.ok(first, 'the first turn did not play');
      assert.ok(env.host(), 'the second turn did not play');
    });
    if (env.host()) { env.dismiss(); await sleep(420); }
    env.dispose();
  }
  {
    // The list edge is still a working belt (a host that never publishes
    // turnEnds): the falling edge of byId[id].running must still trigger.
    const env = await fresh();
    await complete(env);
    await sleep(650);
    check('the list running edge still triggers on its own', () => {
      assert.ok(env.host(), 'the list-edge path stopped working');
    });
    env.dispose();
  }

  // ------------------------------------------------ a new turn cancels it
  {
    const env = await fresh();
    await complete(env);
    await sleep(650);
    assert.ok(env.host(), 'precondition: overlay playing');
    env.push({ ids: ['s1'], byId: { s1: { running: true } }, current: 's1' });
    await sleep(60);
    check('a new turn starting tears the playing overlay down',
      () => assert.strictEqual(env.host(), null, 'overlay outlived the start of a new turn'));
    env.dispose();
  }

  // ------------------------------------------------ stopped / interrupted / errored
  {
    // The stop button calls session.cancel(). The plugin wraps it on the instance
    // it resolves, so this is a direct read of user intent — no `interrupted` flag
    // needed (that one is a projection artifact this build may not even set).
    const env = await fresh();
    env.push({ ids: ['s1'], byId: { s1: { running: true } }, current: 's1' });
    env.startFaceTurn('s1');              // the face carries the same bit in the real app
    await sleep(60);                       // let doneOnList wrap cancel()
    env.faces.s1.cancel();
    env.push({ ids: ['s1'], byId: { s1: { running: false } }, current: 's1' });
    await sleep(700);
    check('a user stop (session.cancel) suppresses the animation', () => {
      assert.strictEqual(env.cancelCalls.s1, 1, 'the wrapped cancel was not called');
      assert.strictEqual(env.host(), null, 'played for a user-stopped turn');
    });
    // ...and the very next turn still plays (the mark is per turn, not sticky).
    // Both feeds move together in the real app, so move both here.
    env.push({ ids: ['s1'], byId: { s1: { running: true } }, current: 's1' });
    env.startFaceTurn('s1');
    await sleep(30);
    env.push({ ids: ['s1'], byId: { s1: { running: false } }, current: 's1' });
    env.endFaceTurn('s1', 2);
    await sleep(650);
    check('the stop mark does not leak into the next turn',
      () => assert.ok(env.host(), 'the turn after a stop was suppressed too'));
    env.dispose();
  }
  {
    const env = await fresh();
    await complete(env, [{ kind: 'user', turn: 1 }, { kind: 'assistant', turn: 1, interrupted: true }]);
    await sleep(650);
    check('an interrupted turn end does not play',
      () => assert.strictEqual(env.host(), null, 'played for a user-interrupted turn'));
    env.dispose();
  }
  {
    const env = await fresh();
    await complete(env, [{ kind: 'assistant', turn: 1 }, { kind: 'turn-error', turn: 1 }]);
    await sleep(650);
    check('a failed turn end does not play',
      () => assert.strictEqual(env.host(), null, 'played for a turn that errored'));
    env.dispose();
  }
  {
    // A mid-turn steering interrupt leaves an interrupted step behind, but the
    // turn's LAST assistant node is a normal one — that turn still completed.
    const env = await fresh();
    await complete(env, [
      { kind: 'assistant', turn: 1, interrupted: true },
      { kind: 'assistant', turn: 1 },
      { kind: 'turn-tail', turn: 1 }
    ]);
    await sleep(650);
    check('a mid-turn interrupted step does not suppress a turn that did finish',
      () => assert.ok(env.host(), 'suppressed a normally-finished turn'));
    env.dispose();
  }

  // ------------------------------------------------ switch / reduced motion
  {
    const env = await fresh({ store: { on: false, text: '//RUN_COMPLETE' } });
    await complete(env);
    await sleep(650);
    check('with the switch off nothing mounts',
      () => assert.strictEqual(env.host(), null, 'played while the switch was off'));
    env.dispose();
  }
  {
    const env = await fresh({ store: { on: true, text: 'DONE!' } });
    await complete(env);
    await sleep(650);
    check('the configured banner text reaches the DOM',
      () => assert.strictEqual(env.doc.querySelector('#md-banner-text').textContent, 'DONE!'));
    env.dismiss();
    await sleep(420);
    env.dispose();
  }
  {
    const env = await fresh({ reduce: true });
    await complete(env);
    await sleep(650);
    check('prefers-reduced-motion skips the whole act',
      () => assert.strictEqual(env.host(), null, 'played under prefers-reduced-motion'));
    env.dispose();
  }

  // ------------------------------------------------ no sessions service
  {
    const env = await fresh({ noSessions: true });
    check('a ctx without a sessions service still applies',
      () => assert.ok(env.doc.body.classList.contains('theme-marathon')));
    env.dispose();
  }

  // ------------------------------------------------ dispose
  {
    const env = await fresh();
    await complete(env);
    await sleep(650);
    assert.ok(env.host(), 'precondition: overlay playing');
    env.dispose();
    check('dispose() removes a playing overlay', () => assert.strictEqual(env.host(), null));
    check('dispose() unsubscribes from the session list',
      () => assert.strictEqual(env.sessions.list.listenerCount(), 0,
        'the session-list subscription outlived dispose()'));
    // pushing after dispose must be inert (the listener is gone, so nothing runs)
    env.push({ ids: ['s1'], byId: { s1: { running: false } }, current: 's1' });
    await sleep(500);
    check('no overlay after dispose', () => assert.strictEqual(env.host(), null));
  }

  if (failures.length) {
    console.error('\nDONE-ENGINE TEST FAILED:\n  - ' + failures.join('\n  - '));
    process.exit(1);
  }
  console.log('\nAll task-completion checks passed.');
  process.exit(0);
})().catch((e) => {
  console.error('\nDONE-ENGINE TEST FAILED:');
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
