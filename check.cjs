#!/usr/bin/env node
/* check.cjs — static validation of the plugin manifest & built client.
 * No runtime/browser needed. Exits non-zero on any failure. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname);
let failures = 0;
function fail(msg) { console.error('  ✗ ' + msg); failures++; }
function ok(msg) { console.log('  ✓ ' + msg); }

console.log('dsh-theme-mls-desktop · static check');

// package.json
const pkgPath = path.join(root, 'package.json');
if (!fs.existsSync(pkgPath)) fail('package.json missing');
else {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (pkg.name !== 'dsh-theme-mls-desktop') fail('package name mismatch: ' + pkg.name);
  else ok('package name = dsh-theme-mls-desktop');
  if (!pkg.exports || pkg.exports['./client'] !== './client.js') fail('exports["./client"] must -> ./client.js');
  else ok('exports["./client"] -> ./client.js');
  if (!pkg.dsh || !pkg.dsh.bundle || !pkg.dsh.bundle.patch) fail('package.json.dsh.bundle.patch missing');
  else ok('dsh.bundle.patch declared');
}

// cordis.patch.yml
const ymlPath = path.join(root, 'cordis.patch.yml');
if (!fs.existsSync(ymlPath)) fail('cordis.patch.yml missing');
else {
  const yml = fs.readFileSync(ymlPath, 'utf8');
  if (yml.includes('id: theme-mls-desktop') && yml.includes('dsh-theme-mls-desktop')) ok('cordis.patch.yml registers theme-mls-desktop');
  else fail('cordis.patch.yml does not register theme-mls-desktop');
}

// index.js (host half: the pre-plugin interval)
const hostPath = path.join(root, 'index.js');
if (!fs.existsSync(hostPath)) fail('index.js missing');
else {
  const host = fs.readFileSync(hostPath, 'utf8');
  const mod = require(hostPath);
  if (typeof mod.apply !== 'function') fail('index.js must export apply(ctx)');
  else ok('index.js exports apply(ctx)');
  if (!/on\(\s*'webserver\/index-inject'/.test(host)) fail("index.js does not listen on 'webserver/index-inject'");
  else ok("index.js listens on webserver/index-inject");
  //    the row has to be a structured <style> row (the seam's own vocabulary),
  //    not a raw tapIndex string transform
  if (!/table\.push\(\s*\{\s*kind:\s*'style'/.test(host)) fail('index.js must push a { kind: \'style\' } row');
  else if (/tapIndex/.test(host)) fail('index.js fell back to tapIndex; the structured row is enough');
  else ok("index.js pushes a structured style row");

  const css = mod.NATIVE_BOOT_CSS;
  if (typeof css !== 'string' || css.length === 0) fail('NATIVE_BOOT_CSS missing');
  else {
    //    the host row must hide the native boot screen *while it is loading*
    //    and leave the failure card reachable: the spinner is the marker DSH
    //    drops on failure, so gating on it is what keeps "silent animation"
    //    from turning into "silent error".
    if (!/\[data-dsh-boot\]:has\(\[data-dsh-boot-spinner\]\)/.test(css)) fail('NATIVE_BOOT_CSS must gate on [data-dsh-boot]:has([data-dsh-boot-spinner])');
    else ok('native boot screen is gated on the spinner (failure card survives)');
    if (!/\[data-dsh-boot\]:has\(\[data-dsh-boot-spinner\]\)\s*>\s*\*\{display:\s*none/.test(css)) fail('NATIVE_BOOT_CSS does not hide the boot card contents');
    else ok('boot card contents hidden while loading');
    if (!/background:\s*#0B0D0B/.test(css)) fail('NATIVE_BOOT_CSS lost the void colour');
    else ok('boot plate recoloured to the void colour (#0B0D0B)');
    const htmlBodyRule = (css.match(/html,body\{[^}]*\}/) || [''])[0];
    if (htmlBodyRule === '') fail('NATIVE_BOOT_CSS lost the html,body background rule');
    else if (/!important/.test(htmlBodyRule)) fail('the html,body rule must not be !important — the theme has to be able to take over once it loads');
    else ok('html,body background stays overridable (no !important)');
    //    guard: never hide the whole plate, that would silence load failures too
    if (/\[data-dsh-boot\]\s*\{[^}]*display:\s*none/.test(css)) fail('NATIVE_BOOT_CSS hides the whole boot plate — load failures would go silent');
    else ok('the plate itself is never display:none');
  }
}

// assets/fonts/Maratype.otf
const fontPath = path.join(root, 'assets', 'fonts', 'Maratype.otf');
if (!fs.existsSync(fontPath)) fail('assets/fonts/Maratype.otf missing');
else ok('Maratype.otf present (user-supplied decorative font)');

// built client.js — `MLS_CLIENT_JS` lets a test point at a mutated copy to prove
// a guard can actually fail (a check that cannot be made to fail proves nothing).
const clientPath = process.env.MLS_CLIENT_JS ? path.resolve(process.env.MLS_CLIENT_JS) : path.join(root, 'client.js');
if (!fs.existsSync(clientPath)) fail('client.js missing — run `node scripts/build.cjs`');
else {
  const src = fs.readFileSync(clientPath, 'utf8');
  if (src.length < 1000) fail('client.js suspiciously small (' + src.length + ' bytes)');
  else ok('client.js present (' + src.length + ' bytes)');
  if (!src.includes('window.__ModuleLoader__.load')) fail('client.js does not call __ModuleLoader__.load');
  else ok('uses window.__ModuleLoader__.load');
  if (!src.includes('overrideTokens')) fail('client.js does not call overrideTokens');
  else ok('calls theme.overrideTokens');
  if (!src.includes('@font-face') || !src.includes('base64,')) fail('Maratype not inlined as base64 @font-face');
  else ok('Maratype inlined as base64 @font-face');
  if (src.includes('__MARATYPE_BASE64__')) fail('placeholder still present in built client.js');
  else ok('no __MARATYPE_BASE64__ placeholder remains');
  // boot payload (deepseek intro + marathon stage, injected at runtime)
  if (!src.includes('dshMarBootHost')) fail('boot host id missing');
  else ok('boot host #dshMarBootHost present');
  if (!src.includes('#mb-canvas') || !src.includes('#mb-intro')) fail('boot payload DOM (mb-canvas/mb-intro) missing');
  else ok('boot payload DOM embedded');
  if (!src.includes('__mbMarathon') || !src.includes('__mbIntroStop')) fail('boot engines (__mbMarathon/__mbIntroStop) missing');
  else ok('boot engines embedded');
  // NOTE: a plain `__IMG_` test false-positives on the inlined base64 payload
  // (its alphabet includes the underscore), so match the placeholder shape.
  if (src.includes('/*__BOOT_PAYLOAD__*/') || /__IMG_[A-Z_]+__/.test(src)) fail('boot placeholder/image tokens still present');
  else ok('no boot placeholder/image token remains');
  // regression guard: the marathon engine must call the driver-registered
  // __mbBootDone (an earlier build called a stale __mbMarathonDone that
  // nothing defined — the overlay then only left via the 16s watchdog)
  if (src.includes('__mbMarathonDone')) fail('stale __mbMarathonDone callback name still present');
  else ok('no stale __mbMarathonDone callback');
  // ---- task-completion overlay (payload 2/2) --------------------------------
  // The overlay travels as its OWN JSON payload inside client.js
  // (keys css/html/engine, after the boot payload's css/html/marathon/intro).
  // Pull it out and UNESCAPE it, so the guards below read the real source instead
  // of a JSON-escaped copy — that escaping is why the boot-mark guards further
  // down still have to write `\\?` in their patterns. Scoping also matters the
  // other way round: the boot engine legitimately owns UI_CROSS_STEP / UI_BOX_*
  // for its own 24px mark grids, so "the done engine has no such knobs" can only
  // be asserted against the done engine's own text.
  let doneCss = '', doneSrc = '';
  {
    const pick = (key, last) => {
      const re = new RegExp('"' + key + '":"((?:[^"\\\\]|\\\\.)*)"', 'g');
      const hits = [];
      let m;
      while ((m = re.exec(src)) !== null) hits.push(m[1]);
      if (!hits.length) return '';
      const raw = last ? hits[hits.length - 1] : hits[0];
      try { return JSON.parse('"' + raw + '"'); } catch (e) { return ''; }
    };
    doneSrc = pick('engine', true);
    if (doneSrc.indexOf('#dshMarDoneHost') !== -1) {
      doneCss = pick('css', true);
      if (doneCss.indexOf('#dshMarDoneHost') === -1) doneCss = pick('css', false);
    }
  }
  if (!doneSrc || !doneCss) fail('completion payload (DONE_PAYLOAD css/engine) is not embedded in client.js');
  else {
    if (!src.includes('dshMarDoneHost')) fail('completion host id missing');
    else ok('completion host #dshMarDoneHost present');
    if (!src.includes('#md-scene') || !src.includes('#md-dots') ||
        !src.includes('#md-tiles') || !src.includes('#md-banner-text')) fail('completion payload DOM (md-scene/md-dots/md-tiles/md-banner-text) missing');
    else ok('completion payload DOM embedded');
    if (src.includes('/*__DONE_PAYLOAD__*/')) fail('completion placeholder still present in built client.js');
    else ok('no completion placeholder remains');
    if (!doneSrc.includes('window.__mbDone') || !doneSrc.includes('window.__mbDoneReady')) fail('completion engine (__mbDone) missing from the payload');
    else ok('completion engine embedded');
    // ① the sweep must be the BOOT S REVERSED, with the same coefficients. The
    //    reversed build is literally the zone loop counting down (zone2 R→L first,
    //    zone0 R→L last) — assert that shape, not a comment about it.
    if (!/for \(var zz = CFG\.ZONES - 1; zz >= 0; zz--\)/.test(doneSrc)) fail('the completion sweep does not build its zones in reverse order');
    else if (!/var dir = \(zz === 1\) \? 1 : -1;/.test(doneSrc)) fail('the reversed S does not flip the middle zone back to L→R');
    else if (!/RED_RISE:\s*180/.test(doneSrc) || !/RED_HOLD:\s*400/.test(doneSrc) || !/RED_EXIT:\s*280/.test(doneSrc)) fail('the completion sweep does not keep the boot red-sweep coefficients');
    else ok('reverse S sweep: zones counted down, middle zone flipped, boot coefficients kept');
    // ② ONE lattice, FOUR symbols, ONE size — sized to match the boot animation's
    //    marks (user 2026-10-10: "矩阵似乎有些太大了…与启动动画里蓝扫的大小类似").
    //    Earlier rounds: a 12px cell with 8px glyphs was too dense ("现在的矩阵密集，
    //    且排列不规范"), then a 12px glyph on 24px was too big. Now: 24px lattice,
    //    8.16px glyph — the boot's own UI_CROSS_SCALE.
    //    The gate is the CELL, not the glyph: a cell belongs to the turf holding
    //    it whole, so the four turfs leave each other a full cell of empty slots
    //    instead of the grid being pulled inward.
    if (!doneSrc.includes('function drawMatrix')) fail('the matrix painter (drawMatrix) is missing');
    // The matrix is deliberately the SAME pixel size as the boot animation's marks
    // (user 2026-10-10: "矩阵似乎有些太大了…与启动动画里蓝扫的大小类似"): both sit on the
    // same 24px lattice and both take 0.34 of it (= 8.16px), with the boot's own
    // line-width formula max(0.9, size × 0.20).
    else if (!/UI_CELL:\s*24/.test(doneSrc) || !/UI_GLYPH_SCALE:\s*0\.34/.test(doneSrc) ||
             !/UI_LINE_MIN:\s*0\.9/.test(doneSrc) || !/UI_LINE_SCALE:\s*0\.20/.test(doneSrc))
      fail('the matrix no longer matches the boot marks (24px cell × 0.34 = 8.16px glyph, line width max(0.9, size×0.20))');
    else if (!/UI_CROSS_SCALE:\s*0\.34/.test(src) || !/UI_CROSS_STEP:\s*2/.test(src))
      fail('the boot animation\'s marks no longer use 0.34 on a 2-cell step — the two animations would stop matching');
    else if (!/var lw = Math\.max\(CFG\.UI_LINE_MIN, size \* CFG\.UI_LINE_SCALE\);/.test(doneSrc))
      fail('the matrix does not derive its line width from the glyph size (the boot does)');
    else if (!/UI_DOT_SCALE:\s*0\.\d+/.test(doneSrc)) fail('the blank-turf dot has no size knob (UI_DOT_SCALE)');
    else if (/UI_CROSS_STEP|UI_CROSS_SCALE|UI_BOX_SCALE|UI_BOX_PAD|UI_DOT_R|UI_GLYPH:/.test(doneSrc)) fail('the old per-turf mark grids are back — the matrix must be one lattice of one size');
    // EVERY cell carries a glyph: no "won't fit, leave it empty" gate, because that
    // leaves visible seams between turfs (user 2026-10-10: "矩阵之间有明显的分界线…
    // 整个画面都是一个矩阵，不要哪里有空缺").
    else if (/glyphFits|insideRect|hitsRect/.test(doneSrc)) fail('the per-cell fit gate is back — it leaves empty cells along the UI boundaries');
    else if (!/var turf = turfAt\(x, y, rects\);/.test(doneSrc)) fail('the matrix does not assign every cell by its centre');
    else if (!/for \(var y = gs \/ 2; y <= H \+ gs \/ 2; y \+= cell\)/.test(doneSrc)) fail('the cell loop does not cover the whole viewport');
    else if (!/function regionMarkAlpha[\s\S]{0,600}?\(t - r\.holdEnd\) \/ CFG\.MARK_IN/.test(doneSrc)) fail('the matrix does not light up panel by panel behind the red sweep');
    else ok('completion marks: 24px lattice (网格符号测试.html values), every cell filled, matrix follows the sweep');
    // the four turfs map to the four symbols the request named, at that one size
    if (!/TURF_SIDEBAR = 1, TURF_COMPOSER = 2, TURF_TRANSCRIPT = 3/.test(doneSrc)) fail('the four completion turfs are not declared');
    else if (!/turf === TURF_SIDEBAR \? 0[\s\S]{0,140}?TURF_COMPOSER \? 1[\s\S]{0,140}?TURF_TRANSCRIPT \? 2 : 3/.test(doneSrc)) fail('the four turfs do not map onto the four symbol kinds');
    else if (!/g\.moveTo\(px - half, py\); g\.lineTo\(px \+ half, py\)/.test(doneSrc)) fail('the sidebar turf is not a cross');
    else if (!/g\.rect\(px - half, py - half, half \* 2, half \* 2\)/.test(doneSrc)) fail('the box turfs are not rectangles');
    else if (!/g\.arc\(px, py, dotR, 0, TAU\)/.test(doneSrc)) fail('the blank turf is not a solid dot');
    else if (!/k === 0 \|\| k === 1[\s\S]{0,140}?strokeStyle = CFG\.colorRed/.test(doneSrc)) fail('the sidebar / input-card turfs are not the red pair');
    else if (!/k === 2[\s\S]{0,140}?strokeStyle = CFG\.colorPlateInk/.test(doneSrc)) fail('the transcript turf is not the ink pair');
    else ok('completion marks: 侧栏红十字 / 输入框红方框 / 输出区墨方框 / 空白墨实心圆（同一 12px 尺寸）');
    // the input-card / transcript anchors must survive a CSS-module rehash
    if (!/\[class\*="_card"\]/.test(doneSrc) || !doneSrc.includes("'[data-conversation-scroll]'")) fail('completion anchors are not hash-proof (card token / conversation-scroll)');
    else ok('completion anchors are hash-proof (…_card token + [data-conversation-scroll])');
    // ③ the fade to black + a real BLACK HOLD, and the three canvas layers must be
    //    painted 黑底 → 矩阵 → 红块 in that order (so the matrix lights up *behind*
    //    the red as the sweep passes, instead of being wiped by it).
    if (!/BLACK_FADE/.test(doneSrc) || !/TILES_AT/.test(doneSrc) || !/BLACK_HOLD/.test(doneSrc)) fail('the black beat (BLACK_FADE → BLACK_HOLD → TILES_AT) is missing');
    else if (!/CFG\.TILES_AT\s*=\s*CFG\.BLACK_AT \+ CFG\.BLACK_FADE \+ CFG\.BLACK_HOLD/.test(doneSrc)) fail('the flat-black hold is not part of the timeline');
    else if (!/drawSweepBack\(t\);[\s\S]{0,80}?drawMatrix\(t, rects, 1 - fade\);[\s\S]{0,80}?drawSweepRed\(t\);/.test(doneSrc)) fail('the canvas layers are not 黑底 → 矩阵 → 红块');
    else if (!/CFG\.BLACK_AT\s*=\s*CFG\.MARK_DONE \+ CFG\.MARK_HOLD/.test(doneSrc)) fail('the marks no longer hold before the fade (MARK_DONE / MARK_HOLD)');
    else ok('black beat: 黑底→矩阵→红块 layered, MARK_DONE hold, BLACK_FADE + BLACK_HOLD');
    // ④ HARD-CUT tiles revealing the live UI (user 2026-10-10: "不要玻璃质感的方块了,
    //    直接改为逐块显示内容即可,与黑白切换的那套逻辑类似"). So: the same 80px size and
    //    the same mosaic order as the colour-pair pour, driven from JS (one `md-off`
    //    per tile), and NO frosted pane left behind.
    if (!/mosaicOrder/.test(doneSrc)) fail('the reveal tiles do not reuse the colour-pair mosaic order');
    else if (!/REVEAL_TILE:\s*80/.test(doneSrc)) fail('the reveal knob is missing (REVEAL_TILE)');
    else if (!/TILE_SIZE:\s*5/.test(doneSrc)) fail('the field tile size (TILE_SIZE: 5) was clobbered — the reveal knob must not reuse that name');
    else if (/glass|backdrop-filter/i.test(doneSrc) || /glass|backdrop-filter/i.test(doneCss)) fail('glass panes are back — the reveal must be plain hard-cut tiles');
    else if (!/function openTiles[\s\S]{0,600}?className = 'md-off'/.test(doneSrc)) fail('the reveal tiles are not flipped one by one from JS');
    else if (!/function dropTiles/.test(doneSrc)) fail('the reveal tiles are never taken down again');
    else if (!doneCss.includes('#md-tiles i.md-off')) fail('the .md-off tile state has no CSS');
    else if (!doneCss.includes('#C0FD04')) fail('the completion banner lost its green');
    else ok('tile reveal: 80px hard-cut tiles, mosaic order, JS-driven (md-off), no glass');
    // ⑤ BOTH palettes. The dot field rides on top of the LIVE UI, so its ink has to
    //    follow the colour pair — a white dot on the white palette is no dot at all.
    if (!/--md-ink:\s*#FFFFFF/.test(doneCss) || !/body\.mar-bg-light #dshMarDoneHost\s*\{\s*--md-ink:\s*#0B0D0B;?\s*\}/.test(doneCss)) fail('the completion overlay does not flip its ink with the light palette');
    else if (!/function liveInk[\s\S]{0,600}?--md-ink/.test(doneSrc)) fail('the dot field does not read --md-ink');
    else ok('completion ink follows the colour pair (--md-ink flips on body.mar-bg-light)');
    // The overlay must NEVER swallow the dismissing press: it stays
    // pointer-events:none and listens on document in the CAPTURE phase (so a
    // stopPropagation in a menu cannot strand it) — the endfield 雷霆大字 lesson.
    if (!/pointer-events:\s*none/.test(doneCss) || !doneSrc.includes("addEventListener('pointerdown', onDismiss, true)")) fail('the completion overlay can swallow the dismissing press (pointer-events / capture listener)');
    else ok('completion overlay stays click-through (pointer-events:none + capture-phase dismissal)');
  }
  // trigger: displayed-session RUNNING EDGE **plus a monotone turn counter**,
  // stopped/interrupted/errored ends out, and the subscription must be able to
  // ARRIVE LATE — the client session service is registered by another plugin, so
  // reading ctx.get('sessions') once inside apply() silently wires nothing (user
  // 2026-10-10: 预览能播、真触发不播). ctx.inject(['sessions'], …) is the idiom
  // the host half already uses for webServer; the poke loop is the belt.
  // The counter matters: a SHORT turn can go true→false between two snapshot
  // pushes (batched publishes), so an edge-only trigger never sees it — the user
  // suspected exactly that ("是不是因为任务时间太短了"). ConversationSnapshot
  // .turnEnds is monotone, so a missed intermediate state cannot hide the end.
  // The live client `sessions` face has NO `list` (binding/scope/retain/… only —
  // verified through Cordis Inspect against the running client). If installDone
  // demands list.subscribe again, the whole trigger chain silently never attaches;
  // that WAS the user's bug ("预览能播、真任务不播"), so it gets its own block and an
  // exact shape to match, not a loose "mentions binding somewhere" test.
  {
    const at = src.indexOf('function installDone(sessions)');
    const block = at < 0 ? '' : src.slice(at, at + 800);
    if (!block) fail('the completion trigger has no installDone()');
    else if (!/if \(!sessions\) return false;/.test(block)) fail('installDone no longer accepts a face-only sessions service');
    else if (/!sessions\.list/.test(block.split('if (sessions.list')[0] || '')) fail('installDone insists on sessions.list again — the live client face has no list, so the trigger would never attach');
    else if (!/typeof sessions\.binding !== 'function'/.test(block)) fail('installDone does not fall back to the sessions face (binding)');
    else ok('completion trigger: installDone accepts the live face-only sessions service');
  }
  if (!src.includes('mar.done.v1') || !src.includes('function doneOnList') ||
      !src.includes('function doneTurnBad') || !src.includes('function doneSchedule') ||
      !src.includes('function doneWrapCancel')) fail('the completion trigger (doneOnList/doneTurnBad/doneSchedule/doneWrapCancel) is missing');
  else if (!src.includes("ctx.inject(['sessions']") || !src.includes('function pokeDone') ||
      !src.includes('function installDone')) fail('the completion trigger cannot attach late (ctx.inject / pokeDone / installDone)');
  else if (!src.includes('function doneWatchFace') || !src.includes('function doneOnFace') ||
      !src.includes('function doneFaceOf')) fail('the completion trigger does not watch the displayed session face');
  // The live client `sessions` face has NO `list` (binding/scope/retain/… only —
  // verified through Cordis Inspect). If installDone demands list.subscribe again,
  // the whole trigger chain silently never attaches: that WAS the user's bug.
  else if (!src.includes('function doneDomInterrupted') || !/why === 'turnTail'/.test(src)) fail('the id-free DOM trigger path (turnTail / doneDomInterrupted) is missing');
  // A DOM trigger that fires on "the tail count grew" treats a transcript MOUNT
  // (and every session switch) as a finished turn: the animation played by itself
  // right after the boot animation, and revisiting a session replayed it
  // (user 2026-10-10). It has to be "the SAME transcript gained a tail", and a tail
  // only counts once a turn has actually been seen running.
  else if (!src.includes('function doneSameTranscript') ||
      !/domLastTail\.isConnected === true/.test(src)) fail('the DOM trigger lost the "same transcript gained a tail" rule (a mount / session switch would replay the animation)');
  else if (!/on === true && domStatusSeen === false\) domTurnOpen = true;/.test(src)) fail('the DOM tail trigger lost its "a turn was running" gate (mounting history would play)');
  else if (!src.includes('function doneTurnMark') || !src.includes('snap.turnEnds') ||
      !src.includes('doneTurnSeen')) fail('the completion trigger has no monotone turn-end counter (short turns would be missed)');
  else if (!src.includes('doneStopped[sessionId]') ||
      !src.includes("if (n.kind === 'turn-error') return true;") ||
      !src.includes('return n.interrupted === true;')) fail('the completion trigger does not suppress stopped / interrupted / errored turn ends');
  else if (!src.includes('marDoneReduced')) fail('the completion overlay does not respect prefers-reduced-motion');
  else ok('completion trigger: late-attaching list + session-face subscription, monotone turn counter, stop/interrupt/error suppression');
  // UI reveal (2026-09-20, revised on request): the plate — blue field + black
  // slabs + red sweep — now stays opaque end to end, and the ONE reveal beat is
  // the final cross-fade: render() erases the whole plate uniformly
  // (`destination-out`) so 界面整体淡入 in one piece, while the UI-anchored
  // glitch marks (十字 on the sidebar, 红填充 on the composer) leave ahead of it.
  // The old panel-by-panel "hole punching" (ctx.clearRect per dissolving region)
  // is gone for good — assert it does not come back.
  if (!src.includes("hostEl.classList.add('mb-run')") || !src.includes('#dshMarBootHost.mb-run')) fail('canvas-owned underlay (.mb-run) missing');
  else ok('canvas-owned underlay embedded (.mb-run)');
  if (/ctx\.clearRect\(\s*rh\.x0/.test(src)) fail('per-region hole punching is back — the reveal is one cross-fade now');
  else if (!src.includes('destination-out') || !src.includes('CFG.FADE_AT')) fail('the final cross-fade (destination-out @ FADE_AT) is missing');
  else ok('single reveal beat: uniform cross-fade at FADE_AT');
  // The marks must be pinned to the two UI landmarks the request named, and the
  // selectors must survive DSH renaming its CSS-module hash prefix (the user
  // quoted `hHd-Xa_quietBars` / `wSkVaW_composerStack` — both are hash-prefixed,
  // so `[class*="_quietBars"]` / `[class*="composerHero"]` is the durable form).
  // NOTE: the engine source sits inside a JSON string in client.js, so every `"`
  // in it is escaped as `\"` — hence the `\\?` in these two patterns.
  if (!/UI_ANCHORS/.test(src) || !/\[class\*=\\?"_quietBars\\?"\]/.test(src) || !/\[class\*=\\?"composerHero\\?"\]/.test(src)) fail('glitch marks are not anchored on the sidebar / composer');
  else if (!/function drawSidebarCrosses/.test(src) || !/function drawComposerBox/.test(src)) fail('mark painters (drawSidebarCrosses / drawComposerBox) missing');
  else if (!/UI_CROSS_STEP/.test(src) || !/UI_MARK_LEAD/.test(src)) fail('mark tuning knobs (UI_CROSS_* / UI_MARK_*) missing');
  // the composer mark is a GRID OF SMALL BOXES, same logic as the sidebar crosses
  // (user, 2026-09-20). Two earlier variants were tried and rejected: one single
  // outline around the composer (`strokeRect`) and one solid red plate
  // (`fillRect` + `UI_BOX_FILL`). The tell for the good version is the per-cell
  // `ctx.rect(x - half, y - half, half*2, half*2)` — same half-arm formula as the
  // crosses. Asserted on whole-source markers, not a regex window: the function
  // body is ~1.2 kB and a window would drift into the next function.
  else if (!src.includes('half * 2, half * 2') || !src.includes('UI_BOX_SCALE')) fail('composer mark is not a tiled grid of boxes (expected per-cell ctx.rect using the shared half-arm formula)');
  else if (src.includes('strokeRect') || src.includes('UI_BOX_FILL')) fail('composer mark is a single box (strokeRect) or a solid plate (UI_BOX_FILL) again — it must tile small boxes like the sidebar crosses');
  else ok('glitch marks anchored: 十字铺侧栏 + 输入框方框点阵, leaving ahead of the plate');
  // ---- ASCII background layer (2026-09-20) ---------------------------------
  // Background ONLY: one fixed canvas under #root, with the four structural
  // full-viewport containers released via .mar-bg-clear and NOTHING else;
  // two colour pairs (主白+绿 / 主黑+绿) surfaced through a settings tab this
  // plugin injects into DSH's settings dialog. The original page's '*' glyphs
  // were removed on request — they must not creep back into the palette.
  if (!src.includes("var BG_PALETTE = '")) fail('background glyph palette missing');
  else if (src.split('var BG_PALETTE =')[1].split(';')[0].indexOf('*') >= 0) fail("the '*' glyph is back in the background palette");
  else if (!src.includes("light: { field: '#FFFFFF', ink: '192,254,4', light: true }") ||
           !src.includes("dark:  { field: '#0B0D0B', ink: '192,254,4', light: false }")) fail('the two background pairs (主白+绿 / 主黑+绿) are not the pinned mirror pair');
  // The white pair still has to flip the WHOLE UI: a white field under a dark UI
  // is the mirror of the old broken pairing (there it was white ink on green).
  // Three things have to hold together or the mode is broken again:
  //   * the UI flips to a light palette whenever that pair is chosen;
  //   * the scrim over the released containers is WHITE on that pair — the plate
  //     colour, so it dims the glyphs instead of fighting the field;
  //   * --mar-solid-ink (the ink for an accent/solid fill) must NOT move with the
  //     light layer. It used to be --mar-bg-void, which flips to white — that is
  //     white on green, the exact pairing this whole round exists to remove.
  else if (!src.includes('.mar-bg-light{') || !/\.mar-bg-light\{[\s\S]{0,40}?--mar-bg-void:#FFFFFF;/.test(src) ||
           !src.includes('--mar-ink-primary:#0B0D0B;')) fail('the light UI layer is missing (white field + dark UI = white on white)');
  else if (/body\.theme-marathon\.mar-bg-light\{[\s\S]{0,520}?--mar-solid-ink/.test(src)) fail('--mar-solid-ink is re-declared by the light layer — an accent fill would lose its black ink');
  else if (!src.includes("both('var(--mar-solid-ink)')")) fail('the on-solid label tokens are no longer pinned to --mar-solid-ink');
  else if (src.includes("'--dsw-alias-label-primary-foreground': both('var(--mar-bg-void)')")) fail('label-primary-foreground is bound to a surface colour again (it flips with the light layer)');
  // 2026-09-21 第二轮（user: "我们的背景动画也需要添加上，主白+绿色"）：遮罩整套拆掉。
  // 它只对旧的酸绿场有意义，而且会**叠加** —— frame / centerCol / 该列自己的 _root
  // 三层都带 .mar-bg-clear 且互相嵌套，60% 白雾落三遍 = 0.4^3 ≈ 6% 透过率。实测：
  // 画布在画（7509 个字形像素），屏幕上绿点 0 个。两套配色现在都是"场只换底"，
  // 点阵整片穿过界面，字色是底的对照色 —— 与主黑+绿 完全同构。
  else if (!src.includes('.mar-bg-clear{background-color:transparent!important;') ||
           !src.includes('background-image:none!important;}')) fail('the released containers no longer step aside (colour + background-image)');
  else if (src.includes('.mar-bg-veil .mar-bg-clear') || src.includes("classList.add('mar-bg-veil')") ||
           src.includes("'#mar-bg-veil'") || src.includes('id="mar-bg-veil"')) {
    fail('the veil is back — it compounds over the nested marked plates and hides the white field completely');
  }
  else if (!src.includes("classList.add('mar-bg-light')")) fail('the light layer is never switched on by the pair');
  // 2026-09-21 (user: "在关闭动画中，如果选为主绿+黑，关闭后会切换为主黑+绿"): the
  // colour pair and the field switch are SEPARATE state. The UI has to be read
  // from BG_STATE.scheme — reading it off the drawn field (null once the field is
  // off) is precisely the bug: 关闭动画 tore the light layer off 主白 + 绿.
  // 2026-10: they are two CONTROLS now, not one three-way segment —
  // 关闭背景动画 is an independent switch (default OFF) and 主白+绿 / 主黑+绿 are a
  // radio group, so exactly one pair is always chosen and the switch can never
  // change it. The three guarantees above are still asserted, plus the split.
  else if (!/var ui = BG_MODES\[BG_STATE\.scheme\]/.test(src)) fail('the UI pair is not read from BG_STATE.scheme (关掉背景动画 would flip 主白 + 绿 back to the dark pair)');
  else if (/if \(m && m\.light\)/.test(src)) fail('the light layer is bound to the drawn field again — 关掉背景动画 tears it off the page');
  else if (!src.includes("var out = { anim: false, scheme: 'dark', cell: 16, speed: 0.55 };")) fail('the field switch does not default to OFF (背景动画 must start disabled)');
  else if (!src.includes("if (typeof s.anim === 'boolean') out.anim = s.anim;") ||
           !src.includes("else if (s.mode === 'off') out.anim = false;")) fail('the stored state is not migrated — a v2 mode must split into the switch flag + the pair it was carrying');
  else if (!src.includes("animIn.addEventListener('change'") ||
           !src.includes('BG_STATE.anim = !!animIn.checked;')) fail('the 背景动画 switch does not drive BG_STATE.anim');
  else if (!src.includes('data-pair="light"') || !src.includes('data-pair="dark"') ||
           !src.includes("btns[i].getAttribute('data-pair') === BG_STATE.scheme")) fail('主白 + 绿 / 主黑 + 绿 are not a radio group — the chosen pair could be lost while the field is off');
  else if (/data-bg=|aria-pressed/.test(src)) fail('the old three-way off|light|dark segment is back — 背景动画 is an independent switch, not a third choice');
  // 2026-10-01: the theme must ALSO drive DSH's own appearance preference. The
  // token overrides are mode-independent, but body[data-ds-dark-theme] and html's
  // color-scheme are not — 主白 + 绿 with 通用设置 left on 深色 keeps native
  // controls and DSH's dark-scoped rules dark, which is the "颜色的切换也不完整"
  // report. It must be guarded (only write when the RESOLVED scheme disagrees) or
  // setTheme's theme/change would let it oscillate.
  else if (!/function syncThemePreference\(wantLight\)/.test(src) ||
           !/theme\.setTheme\(lastRequestedScheme\)/.test(src) ||
           !/if \(lastRequestedScheme === \(wantLight \? 'light' : 'dark'\)\) return;/.test(src) ||
           !/body\.removeAttribute\('data-ds-dark-theme'\)/.test(src) ||
           !/body\.setAttribute\('data-ds-dark-theme', ''\)/.test(src)) fail('the theme no longer drives DSH\'s scheme (DOM signal + one service write per scheme) — DSH stayed light under a dark pair, leaving a white settings pane, black rail ink, a white composer and a white footer bar');
  else if (!/syncThemePreference\(ui\.light\);/.test(src)) fail('bgApplyMode does not sync the appearance preference, so it would only happen on some paths');
  else if (!src.includes('#mar-ascii-bg{position:fixed;inset:0') || !src.includes('z-index:0;pointer-events:none')) fail("the background canvas is not a non-interactive bottom layer");
  else if (!src.includes('function bgAnchorTargets') ||
           !src.includes('function bgPaintTargets') ||
           !src.includes('function bgUnmarkSidebar') ||
           !src.includes("querySelector(':scope > div > div')") ||
           !src.includes('_centerCol')) fail('background clear-marks are not pinned to the frame + the centre column + its own _root (the sidebar is deliberately excluded — it stays opaque)');
  else if (!src.includes('function bgTeardown')) fail('background layer has no teardown (it would outlive the plugin)');
  else if (!src.includes('function mountSettingsTab') || !src.includes('主题设置') || !src.includes('data-mar-nav')) fail('the background settings tab is missing');
  else if (!src.includes('dsh-theme-marathon.bg.v1')) fail('background settings are not persisted');
  // Responsiveness guards (2026-09-20, user: "设置选项卡在点击后不会立马出现"):
  //  * the tab must be mounted from the MutationObserver on _settingsArea, not
  //    only from the 1.2s timer — otherwise opening 设置 pops the tab in up to
  //    1.2s late (measured 831ms before, 49ms after).
  //  * the pane must be BUILT when the tab is mounted and parked at
  //    visibility:hidden — building it lazily on the first click cost ~90ms and
  //    read as the panel "loading".
  else if (!src.includes('new MutationObserver(kickSettingsSweep)')) fail('settings tab is not mounted immediately (observer no longer kicks the sweep)');
  else if (!src.includes('function kickSettingsSweep') || !src.includes('requestAnimationFrame(function () {')) fail('the immediate settings sweep is not rAF-coalesced');
  // 2026-10-01, measured on the Desktop: DSH 0.2.0-rc.2 **portals** the settings
  // dialog to <body> (body > div.wCInkW_overlay > div.wCInkW_panel > nav >
  // _navList > _navCell) and `_settingsArea` holds only the account-menu launcher
  // (`data-slot="sidebar.settings"`), so the _settingsArea observer above never
  // fires there. Without this second observer 设置 falls back to the 1.2s
  // sweepReveals interval — the "点击设置后动画有延迟" report. It must stay
  // NARROW (childList only, no subtree): body's direct children are the overlay
  // and a couple of boot nodes, so this fires a handful of times per session.
  else if (!/mosaicBodyObserver\.observe\(host, \{ childList: true \}\)/.test(src)) fail('no body-level settings-dialog observer: DSH 0.2.0-rc.2 portals the settings dialog to <body>, so the _settingsArea observer never fires and the 主题设置 tab / mosaic reveal wait up to 1.2s for the sweep');
  else if (!src.includes("pane.style.visibility = 'hidden'") || !src.includes("pane.style.visibility = 'visible'")) fail('the settings pane is not pre-built / parked hidden (it would rebuild on every click)');
  else if (/function showPane\(\)[\s\S]{0,400}?style\.display = 'block'/.test(src)) fail('the pane is switched with display again — that forces a reflow on every open');
  else ok('ascii background layer: 2 palettes (no *), structure-only clear-marks, own settings tab');
  // regression guards (2026-09-18):
  //  * the floating settings drawer is gone for good — its "启用主题" checkbox
  //    dropped the body class that styled its own gear button, so turning the
  //    theme off made the button unreachable.
  //  * the FUI plate layer is gone — its strips covered the deepseek logo and
  //    the sidebar 设置 row.
  if (/mar-set-toggle|dsh-theme-marathon-enabled/.test(src)) fail('in-page settings drawer / kill switch is back');
  else ok('no in-page settings drawer / kill switch');
  if (src.includes('mar-hud') || src.includes('MARATHON // CMD TERMINAL')) fail('HUD plate layer is back');
  else ok('no HUD plate layer');
  //  * every decorative overlay is gone (2026-09-18): the 28px grid, the
  //    multiply scanlines, the CRT beam/flicker and the sweep band. They were
  //    full-viewport layers stacked on top of DSH chrome — pure texture, and the
  //    scanlines darkened every surface by a fixed amount.
  //    Match rule heads / keyframe names, NOT bare class names: the removal note
  //    left in the stylesheet names all four in prose, so a substring test would
  //    match its own comment and fail spuriously. The keyframe test therefore
  //    lists the four dead animation names instead of a bare `mar-` prefix —
  //    the live mar-tile-out keyframe (settings panel reveal) is started by an
  //    explicit user action and removes itself.
  if (/\.mar-(grid|scanlines|crt|sweep)\s*\{|\.mar-layer\s*\{|mar-layer mar-|--mar-(grid-size|int)\s*:|@keyframes\s+mar-(crt|sweep|grid|scan)/.test(src)) fail('decorative overlay layer is back');
  else ok('no decorative overlay layers');
  if (!src.includes('--mar-bg-void:#0B0D0B') || !src.includes('--mar-bg-panel:#272733') || !src.includes('--mar-bg-overlay:#2E2F38') || !src.includes('--mar-ink-primary:#DFDEE0')) fail('fixed palette (#0B0D0B / #272733 / #2E2F38 / #DFDEE0) missing');
  else ok('fixed palette present');
  //  * left rail lighting (2026-09-18, revised): the static state is DSH's own
  //    neutral surface — no accent fill at rest. Exactly two states light up:
  //    新会话 on :hover and a session row on [_selected]. Session rows are a
  //    list, not a row of buttons, so even hover must leave them alone — the
  //    rule for them mutes DSH's own hover wash instead of painting an accent.
  if (!/--mar-accent-ink\s*:/.test(src)) fail('--mar-accent-ink missing (accent fill text colour)');
  else if (!/\[class\*="_newSession"\]:hover/.test(src)) fail('新会话 does not light up on hover');
  else if (!/\[class\*="_sessionRow"\]\[class\*="_selected"\]/.test(src)) fail('selected session row is not lit');
  else if (/\[class\*="_sessionRow"\]\s*[,\{]/.test(src)) fail('session rows carry a static fill (at rest they must match DSH)');
  else if (!/\[class\*="_sessionRow"\]:hover:not\(\[class\*="_selected"\]\)\{[\s\S]{0,120}?background:transparent!important/.test(src)) fail('session row hover is not muted');
  else if (!/button\[class\*="_primary"\]\{[\s\S]{0,200}?background-color:var\(--mar-accent\)!important/.test(src)) fail('the send button does not take the theme accent — it used to keep DSH\'s own fill and only ink the arrow, which read as "发送按钮的颜色没有改变"');
  else if (/button\[class\*="_primary"\]:not\(:disabled\)/.test(src)) fail('the send button selector still has :not(:disabled) — DSH paints the button blue while disabled (its resting state), and the guard meant our override only kicked in *after* the user typed. The "发送按钮的颜色没有改变" complaint was exactly this. Drop the guard');
  // 2026-10-01: the scrollbar must stay DSH's default. It used to carry an accent
  // border on the thumb and an accent hover ("the scrollbar is green").
  else if (/::-webkit-scrollbar[^{\n]*\{/.test(src)) fail('the theme styles ::-webkit-scrollbar again — the scrollbar must stay at DSH\'s default ("滚动条不要有绿色，保持默认就行")');
  else if (/--dsw-alias-scrollbar-(?:bg|hover)-l[12]/.test(src)) fail('a --dsw-alias-scrollbar-* override is back — those were what made the scrollbar green');
  else ok('left rail: 新会话:hover lights up, rows stay neutral, only [_selected] fills');
  //  * squareness (2026-09-18): one blanket rule instead of a short list, with
  //    the boot overlay's status disc as the single documented exception.
  if (!/body\.theme-marathon \*::after\{border-radius:0!important;\}/.test(src)) fail('blanket squareness rule missing');
  else if (!/body\.theme-marathon \*::before,/.test(src)) fail('squareness rule does not cover ::before');
  else if (!/body\.theme-marathon #dshMarBootHost \.mb-status-dot\{border-radius:50%!important;\}/.test(src)) fail('boot status disc exemption missing (it would render as a square)');
  else ok('blanket squareness rule + boot status disc exemption');
  //  * settings panel mosaic reveal (2026-09-18)
  if (!/\.mar-mosaic\s*\{/.test(src) || !/@keyframes\s+mar-tile-out/.test(src)) fail('settings mosaic CSS missing');
  else if (!/function mountMosaic/.test(src) || !/MOSAIC_GRID/.test(src) || !/MOSAIC_STEP/.test(src)) fail('settings mosaic mounting missing');
  else if (!/prefers-reduced-motion/.test(src) || !/reducedMotion\(\)/.test(src)) fail('settings mosaic does not honour reduced-motion');
  //  * tiles switch off, they do not animate (2026-09-18, revised): the tile
  //    animation exists only to carry the delay — duration 0s, opacity only.
  //    A scale (1 -> .7) on every tile turned one sweep into 25 little shrinks.
  else if (!/animation:mar-tile-out 0s/.test(src)) fail('tile animation is no longer instantaneous');
  else if (/@keyframes\s+mar-tile-out\{[\s\S]{0,160}?transform/.test(src)) fail('tile keyframes scale again (tiles must switch off, not shrink)');
  //  * no content fade (2026-09-18, revised): the panel's columns carry no
  //    animation — the tiles are the whole transition. A fade sitting on top of
  //    them read as the dialog fading in, which is not the effect. Test the
  //    rule heads, not the bare name: the removal note names what was deleted.
  else if (/@keyframes\s+mar-mosaic-content/.test(src) ||
           /\[class\*="_panel"\]\.mar-mosaic-on\s*>\s*\*/.test(src)) fail('settings panel content fade is back');
  else ok('settings panel mosaic reveal wired (5x5 tiles, instantaneous, deterministic order, no content fade)');
  //  * colour-pair switch (2026-09-21): switching 主白 + 绿 <-> 主黑 + 绿 used to
  //    repaint the whole UI in a single frame. It now plays the SETTINGS MOSAIC
  //    over that frame — the same SQUARE tiles, the same fixed pseudo-random
  //    order, the same 3-tile head, the same 0.341s total — so squares turn one at
  //    a time and a square that has NOT turned yet still shows the OLD picture.
  //    The tiles are square because the panel grid is square: 800x800 / 5 = 160px
  //    there, and the natural port of "5 across, 5 down" would be 315x180 slivers
  //    over a 1574x900 viewport. So the side comes from the viewport's SHORT edge
  //    and the column / row counts are derived from it (9x5 = 45 tiles on that
  //    viewport): the beats come out shorter than the panel's 0.0155s, the total
  //    is unchanged.
  //    That last part is the requirement, and it is why the whole thing has to
  //    run on View Transitions: they are the only thing that hands us the before
  //    and the after picture at the same time. The old snapshot is pinned and the
  //    new one is clipped to the squares that have already turned.
  //    FOUR other mechanisms were built and measured on this browser and all four
  //    are unusable; the assertions below pin the working one AND keep those from
  //    coming back:
  //      · N mask layers, each with its own animation-delay — mask-image/mask-size
  //        are LIST properties and an animation animates the whole property, so
  //        every instance fought over one value: four layers on four delays read
  //        back an identical computed mask-size;
  //      · mask-composite:intersect, to intersect "rings ∩ tile grid" — never
  //        computed, on a plain div either;
  //      · clip-path:url(#svg-clip) with one rect per tile — the same shape as the
  //        path() we ship and far easier to read, but the URL is resolved once,
  //        when the snapshot is created: growing those rects afterwards (CSS or
  //        setAttribute) never moved the clip again;
  //      · a plain mask-size animation without any list — that one does work, but
  //        its front edge is smooth, so tiles get cut in half mid-beat. Whole
  //        tiles is the entire point of this effect.
  //    And one that WORKS but was rejected on look: the centre-out square ring
  //    (clip-path:inset() driven by one registered length + steps()). It is
  //    monotone, so it cannot reproduce the mosaic order.
  //    Matching CSS DECLARATIONS (quote + optional indent + property:), never
  //    bare names: the comments above name these mechanisms on purpose.
  if (!/:root\.mar-vt-on::view-transition-old\(root\)\{animation:none;opacity:1;\}/.test(src)) fail('the old snapshot is not pinned at opacity 1 — it would fade out in .25s and a square that has not turned yet would go blank instead of showing the old UI');
  else if (!/:root\.mar-vt-on::view-transition-new\(root\)\{animation:mar-vt-mosaic var\(--mar-vt-dur\) both;\}/.test(src)) fail('the mosaic is not scoped to our own transition (html.mar-vt-on) — it would clip somebody else\'s view transition');
  else if (/['"]\s*mask-composite:/.test(src)) fail('mask-composite is back — measured: never computed in this browser, plain div included');
  else if (/['"]\s*clip-path:url\(#/.test(src)) fail('clip-path:url() is back — measured: the URL resolves once at snapshot creation and never updates');
  else if (/['"]\s*mask-image:/.test(src)) fail('the reveal went back to layering masks (mask-* are list properties; per-layer delays cannot be expressed)');
  else if (/['"]\s*clip-path:inset\(/.test(src)) fail('the centre-out ring is back — it is monotone and cannot reproduce the mosaic order');
  else if (/@property --mar-vt-r/.test(src)) fail('the registered pour length is back (the ring driver removed in 2026-09-21)');
  else ok('colour-pair switch: mosaic squares via clip-path:path(), old snapshot pinned, five dead ends still banned');
  if (!/function vtPour\(apply\)/.test(src)) fail('the switch driver is gone');
  else if (!/if \(next === prevPair\) \{ syncPane\(pane\); return; \}/.test(src)) fail('the pour is not gated on the colour PAIR actually moving (re-picking the same pair would pour for nothing)');
  // 2026-10-01: THE REVEAL MUST BE A VIEW TRANSITION, and this block used to say the
  // exact opposite — it is worth recording why it flipped.
  //   · The effect's squares carry the PAGE CONTENT, and only the view transition's
  //     new snapshot does that (::view-transition-new(root) is the whole new page,
  //     clipped by the mosaic). It was compared against the web build, whose squares
  //     are new-palette content appearing one by one OVER the old page.
  //   · A DOM layer of flat tiles was built in between and REMOVED: it can only blank
  //     the screen with a single colour and then punch holes in it, which is the
  //     opposite effect ("你的客户端方块是纯色的，网页版的是有内容的").
  //   · The "this shell does not repaint a clipped pseudo-element" conclusion that
  //     justified the layer was WRONG. The build it was measured on had 190px
  //     stretched tiles and 42 beats squeezed into 0.341s (8.1ms each, ~2 tiles per
  //     60Hz frame), so the reveal really did look like "everything at once"; and the
  //     diagnostic that appeared to prove it read the clip's COMPUTED value, which
  //     steps correctly either way. With the window visible the transition runs its
  //     full length (measured: ready +95ms, finished +1241ms on a 1s pour).
  //   So: never diagnose this from computed style, and never replace it with flat
  //   tiles.
  else if (!/doc\.startViewTransition\(apply\)/.test(src)) fail('the viewport reveal is not a View Transition — flat tiles cannot carry page content, which is the whole effect ("网页版的是有内容的")');
  else if (/vtLayer|mar-pour/.test(src)) fail('the flat-tile layer is back — it can only blank the screen with one colour instead of revealing the new page square by square');
  else if (!/function vtClipFor\(order, liveCount, g\)/.test(src)) fail('no tile-union clip builder — the new snapshot has nothing to be clipped by');
  else if (!/function vtBuildFrames\(g\)/.test(src) || !/var order = mosaicOrder\(total\);/.test(src)) fail('the frames do not use the PANEL mosaic order (mosaicOrder) — the two reveals would drift apart');
  else if (!/';animation-timing-function:steps\(1,end\);\}'/.test(src)) fail('no steps(1,end) per frame — the path would interpolate and every square would grow out of its own corner');
  else if (!/vtStyle\.textContent = vtBuildFrames\(g\);/.test(src)) fail('the frames are not rebuilt for the current viewport');
  //    A wall-clock fallback timer used to sit on the tail of vtPour
  //    (`setTimeout(vtPourFinish, (dur + 1) * 1000)`). It only agrees with the
  //    reveal at 1x: the timer runs on the wall clock, the reveal on the
  //    animation clock, so slowing or freezing the animation for verification
  //    let the timer fire first — measured 2026-09-21 at 50x slow motion, it
  //    dropped mar-vt-on when only 3 of 25 tiles had turned, the UA group /
  //    fade-out were instantiated, and every square still on the old palette
  //    was cross-faded away. The re-entry teardown below covers what it was for.
  //   The rule here BANS a wall-clock teardown: the reveal runs on the animation
  //    clock inside a view-transition pseudo-element, and a timer would truncate
  //    it. The transition's own `finished` promise is the correct teardown, and
  //    the assertion below pins it.
  else if (!/tx\.finished\.then\(vtPourFinish, vtPourFinish\)/.test(src)) fail('the transition\'s `finished` promise is not wired to the teardown — mar-vt-on and the frames would stay behind');
  else if (!/if \(vtPouring\) vtPourFinish\(\);/.test(src)) fail('a new switch no longer tears the previous pour down — the flag can wedge and every later switch would silently skip the reveal');
  else ok('switch driver: capability probe, scoping class, no wall-clock fallback, gated on the pair');
  //    The frames are a clip-path:path() with one subpath per tile on a SQUARE
  //    grid, in the panel mosaic's own order — assert the pieces, not just "a path
  //    exists":
  if (!/function vtGrid\(vw, vh\)\s*\{[\s\S]{0,200}?var side = MOSAIC_TILE;/.test(src)) fail('the tile side no longer comes from MOSAIC_TILE (the settings panel\'s own 160px tile) — the pour must match the panel mosaic ("与设置里的方块大小接近或一致")');
  else if (!/cols: Math\.max\(1, Math\.ceil\(vw \/ side\)\)/.test(src) || !/rows: Math\.max\(1, Math\.ceil\(vh \/ side\)\)/.test(src)) fail('the column / row counts are not derived from the square side (stored counts would drift from the viewport)');
  else if (!/var x0 = Math\.round\(c \* g\.side \* S\) - 1;/.test(src) || !/var y0 = Math\.round\(r \* g\.side \* S\) - 1;/.test(src)) fail('the tile rectangle is not built from `side` times the device-pixel scale — the Desktop eats the path in device px, so without g.scale the clip covers only the top-left 1/dpr of the window ("切换动画会先在左上角...的区域进行")');
  else if (!/g\.scale = \(typeof window !== 'undefined' && window\.devicePixelRatio\) \|\| 1;/.test(src)) fail('vtPour does not read devicePixelRatio per pour — the clip scale would go stale when the window moves between monitors');
  else if (!/vtClipFor\(order, live, g\)/.test(src) || !/var live = Math\.min\(total, MOSAIC_HEAD \+ i \* per\);/.test(src)) fail('the frames do not fire MOSAIC_HEAD tiles on the first beat and then `per` tiles per stop — the reveal would not finish on the last frame');
  else if (!/var side = MOSAIC_TILE;/.test(src) ||
           !/cols: Math\.max\(1, Math\.ceil\(vw \/ side\)\)/.test(src) ||
           !/rows: Math\.max\(1, Math\.ceil\(vh \/ side\)\)/.test(src)) fail('the tile side is not MOSAIC_TILE, or the counts are no longer derived from it — the grid must still cover the viewport (last column/row clipped at the edge)');
  else if (!/var order = mosaicOrder\(total\);/.test(src)) fail('the reveal no longer uses the PANEL mosaic order (mosaicOrder) — the two reveals would drift apart');
  else if (!/@keyframes mar-vt-mosaic\{/.test(src) || !/%\{clip-path:'/.test(src)) fail('the generated frames do not build the mar-vt-mosaic keyframes the sheet expects');
  else if (!/root\.classList\.add\('mar-vt-on'\)/.test(src) || !/root\.classList\.remove\('mar-vt-on'\)/.test(src)) fail('the switch does not put the scoping class on and off — the mosaic rules are scoped to :root.mar-vt-on');
  else if (!/root\.style\.setProperty\('--mar-vt-dur', dur \+ 's'\)/.test(src)) fail('the reveal duration is not written to --mar-vt-dur, so the animation would fall back to the UA clock');
  else if (!/function vtDuration\(\)\s*\{[\s\S]{0,200}?return vtPanelTotal\(\);/.test(src)) {
    fail('the reveal length is not pinned to the settings panel\'s own total (vtPanelTotal = 0.341s) — the user asked for "总时长需要与设置页面的动画时长一致", and a per-tile beat makes an 80px grid take 3.7s');
  } else if (!/var dur = vtDuration\(\);/.test(src)) {
    fail('vtPour does not take the panel-pinned duration');
  } else if (!/function vtPanelTotal\(\)\s*\{[\s\S]{0,200}?return \(MOSAIC_GRID \* MOSAIC_GRID - MOSAIC_HEAD\) \* MOSAIC_STEP;/.test(src)) {
    fail('the panel total is not derived from the panel\'s own grid/head/step on every read — a `var` here reads MOSAIC_GRID as undefined (declared later) and the keyframes rule comes out empty (measured 2026-10-02: 0 bytes, plain cross-fade)');
  } else if (!/function vtStops\(total\)\s*\{[\s\S]{0,300}?Math\.min\(frames, total - MOSAIC_HEAD \+ 1\)/.test(src)) {
    fail('the stop count is not capped by the paintable frame budget and by the tile count — steps(1,end) needs one stop per frame, and more stops than tiles is wasted CSS');
  }
  else if (!/doc\.head\.appendChild\(vtStyle\)/.test(src) || !/vtStyle\.parentNode\.removeChild\(vtStyle\)/.test(src)) fail('the generated mar-vt-mosaic frames are not injected per switch, or never removed from the page');
  else if (!/root\.style\.removeProperty\('--mar-vt-dur'\)/.test(src)) fail('vtPourFinish leaves --mar-vt-dur behind');
  else if (!/var g = vtGrid\(vw, vh\);/.test(src)) fail('the tile layer is not rebuilt for the current viewport — the grid would be stale after a resize');
  else ok('mosaic frames: square grid off the short edge, one subpath per tile, panel order, hard cut per tile, injected and removed');
  //  * third-party sidebar entries in the collapsed rail (2026-09-18): plugins
  //    cannot register a sidebar slot, so they inject a full-width row with a
  //    left-aligned icon + label (data-dsh-part="sidebar-entry"). The collapsed
  //    rail is a 56px column of centred 36x36 cells instead, and the injecting
  //    plugin's own collapsed rule is keyed on [data-dsh-frame] — an attribute
  //    this DSH build does not have anywhere — so it never fires. Measured
  //    without this rule: the task-board icon sat on x=32 while every shell
  //    icon sits on x=28.
  if (!/\[data-sidebar-collapsed\]\s+\[data-dsh-part="sidebar-entry"\]\{/.test(src)) fail('injected sidebar entries are not centred in the collapsed rail');
  else if (!/\[data-sidebar-collapsed\]\s+\[data-dsh-part="sidebar-entry"\]\s*>\s*span\s*\+\s*span\{/.test(src)) fail('injected sidebar entry label is not hidden in the collapsed rail');
  else if (!/\[data-sidebar-collapsed\]\s+\[data-dsh-part="sidebar-entry"\]\{[\s\S]{0,220}?width:36px;/.test(src)) fail('collapsed sidebar entry is not a 36px cell');
  else ok('injected sidebar entries centred in the collapsed rail (icon-only 36x36)');
  //  * task-board intro (2026-09-18, rewritten to the user's reference file):
  //    @linxin666/dsh-client-ui-task-board has no entrance animation of its
  //    own, so one plays over it. The unit is the COLUMN — each of the five
  //    选项卡 is an opaque slab with four reticles on it, a 2px frame, and a
  //    2x2 grid of four rectangles that LEAVE one at a time in 1-2-4-3.
  //    (Two earlier builds were wrong and are asserted against below: one put a
  //    single reticle over the whole board, the next cut each CARD into four
  //    horizontal strips.)
  if (!/\[data-dsh-taskboard-board\]\{position:relative;\}/.test(src)) fail('board root is not a positioning context for the intro layer');
  else if (!/@keyframes\s+mar-cross-flash/.test(src)) fail('the reticle flash keyframes are missing');
  else if (!/@keyframes\s+mar-fade-in/.test(src) || !/@keyframes\s+mar-fade-out/.test(src)) fail('the frame fade keyframes are missing');
  else if (!/\.mar-col-intro\{[\s\S]{0,160}?grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;/.test(src)) fail('a tab is not a 2x2 grid of four rectangles');
  else if (!/\.mar-col-intro \.mar-col-mask\{[\s\S]{0,200}?animation:mar-tile-out 0s/.test(src)) fail('the rectangles animate instead of leaving on their frame (mar-tile-out 0s)');
  else if (!/\.mar-col-intro \.mar-col-mask\{[\s\S]{0,200}?background:var\(--mar-mosaic-fill\)/.test(src)) fail('the rectangles are not filled with --mar-mosaic-fill — using --mar-bg-void made a WHITE slab on a #F2F3EE panel, i.e. an invisible reveal in 主白');
  //    regression (2026-09-18 at night): the first cut filled the rectangles
  //    with --mar-bg-panel — the COLUMN'S OWN colour. Grey on grey is an absent
  //    reveal, not a subtle one: the four were laid out perfectly and nothing on
  //    screen changed, so the 1-2-4-3 was unreadable and the effect had to be
  //    reported as invisible. They must stay darker than the tab they cover.
  else if (/\.mar-col-mask\{[\s\S]{0,200}?background:var\(--mar-bg-panel\)/.test(src)) fail('the rectangles are filled with the column colour again — they would be invisible on an empty board');
  else ok('the four rectangles contrast with the tab (--mar-bg-void over #272733)');
  if (!/\.mar-col-intro \.mar-col-frame\{[\s\S]{0,200}?border:2px solid var\(--mar-accent\)/.test(src)) fail('the frame is not a 2px accent ring on the tab edge');
  else if (!/\.mar-col-frame\{[\s\S]{0,320}?mar-fade-in \.16s linear var\(--mar-frame-at/.test(src)) fail('the frame does not take its arrival delay from BOARD_FRAME_AT');
  else if (!/\.mar-col-frame\{[\s\S]{0,320}?mar-fade-out \.16s linear var\(--mar-frame-out-at/.test(src)) fail('the frame does not take its departure delay from BOARD_LAST_AT');
  else ok('the frame is a 2px ring, arriving on BOARD_FRAME_AT and leaving on BOARD_LAST_AT');
  if (!/\.mar-cross\{[\s\S]{0,140}?width:var\(--mar-cross-size\)/.test(src) || !/mar-cross-flash \.1s linear/.test(src)) fail('the reticle is not the sizing/flashing one the reference uses');
  else if (!/mar-cross \.mar-h\{/.test(src) || !/mar-cross \.mar-v\{/.test(src) || !/mar-cross \.mar-dot\{/.test(src)) fail('the reticle is not drawn from its three bars');
  else if (!/mar-dot\{[\s\S]{0,160}?rotate\(45deg\)/.test(src)) fail('the reticle centre is no longer a diamond');
  else ok('reticle = 3 bars, diamond centre, .1s flash');
  if (!/querySelectorAll\('\[data-dsh-part="column"\]'\)/.test(src)) fail('the intro does not iterate the columns');
  else if (!/BOARD_BLOCK_TURN\s*=\s*\[0,\s*1,\s*3,\s*2\]/.test(src)) fail('the 1-2-4-3 order is missing');
  else if (!/function mountBoardIntro/.test(src) || !/BOARD_CROSS_ARMS\s*=\s*\['mar-h',\s*'mar-v',\s*'mar-dot'\]/.test(src)) fail('board intro mounting is missing');
  else ok('task board intro wired (per-tab slab + 4 reticles + 2px frame + 1-2-4-3)');
  //    regressions: neither earlier shape may come back — one reticle over the
  //    whole board, or rectangles cut per CARD. Matching RULE HEADS, not bare
  //    names (the comments above name them on purpose).
  if (/\.mar-card-mask\s*\{|\.mar-card-mask\s+i\s*\{|className\s*=\s*'mar-card-mask'/.test(src)) fail('per-card rectangles are back — the intro unit is the column, not the card');
  else if (/\.mar-col-strip\s*\{|className\s*=\s*'mar-col-strip'/.test(src)) fail('the horizontal-strip cut is back — the rectangles are the tab\'s four quadrants');
  else if (/mar-reticle-in|mar-reticle-out|mar-tile-in|--mar-out-at/.test(src)) fail('dead keyframes/vars from an earlier cut are back (mar-reticle-*, mar-tile-in, --mar-out-at)');
  else ok('no per-card / per-strip / per-board leftovers');
  //    the beats must add up, and the two that matter are: the frame has to be
  //    fully in before the first rectangle returns, and the frame has to leave
  //    on the very frame the fourth one does. Budget is 2s.
  {
    const num = (re) => parseFloat((src.match(re) || [])[1]);
    const frameAt = num(/BOARD_FRAME_AT\s*=\s*([\d.]+)/);
    const at = num(/BOARD_BLOCK_AT\s*=\s*([\d.]+)/);
    const step = num(/BOARD_BLOCK_STEP\s*=\s*([\d.]+)/);
    const lastAt = num(/BOARD_LAST_AT\s*=\s*([\d.]+)/);
    const span = num(/BOARD_INTRO_SPAN\s*=\s*([\d.]+)/);
    if ([frameAt, at, step, lastAt, span].some((v) => !isFinite(v))) fail('board intro constants missing');
    else if (frameAt + 0.16 > at + 1e-9) fail('the frame is still fading in when the first rectangle returns (' + frameAt + '+.16 > ' + at + ')');
    else if (Math.abs(at + 3 * step - lastAt) > 1e-9) fail('the fourth rectangle leaves at ' + (at + 3 * step) + 's but BOARD_LAST_AT is ' + lastAt + 's');
    else if (Math.abs(lastAt + 0.16 - span) > 1e-9) fail('BOARD_INTRO_SPAN must be BOARD_LAST_AT + the .16s fade in the stylesheet');
    else if (span > 2) fail('board intro budget ' + span + 's exceeds the 2s the brief allows');
    else ok('board intro budget = ' + span + 's (frame ' + frameAt + 's, rectangles leave ' + at + '/' + (at + step) + '/' + (at + 2 * step) + '/' + (at + 3 * step) + 's)');
  }

  // ---- terminal running indicator: REMOVED (2026-09-20, on request) -------
  //    The 8-block rotating stick built from 运行动画.html was taken back out.
  //    Asserted as GONE rather than simply deleted: it was a self-contained
  //    block, and a leftover `[class*="_runState_"]` rule would quietly repaint
  //    DSH's own glyph with nobody noticing.
  if (/_runState_|mar-run-stick|mar-run-b\d|mar-run-ink|mar-run-step|mar-run-box/.test(src)) {
    fail('the 8-block running stick is back (removed on request)');
  } else ok('running stick removed — no _runState_ / mar-run-* left in the build');

  // ---- "Deep diving..." turn status: flat ink, no shimmer ------------------
  //    background-clip:text paints the WHOLE line and the clock is a CHILD of
  //    it, so the moving highlight lands on the clock (the green band the user
  //    photographed). Any background / clip / animation here brings it back.
  if (!/\[class\*="_turnStatus"\]\{[\s\S]{0,220}?background:none;/.test(src)) {
    fail('turn status paints a background again — the shimmer band returns over the clock');
  } else if (!/\[class\*="_turnStatus"\]\{[\s\S]{0,260}?-webkit-background-clip:border-box;/.test(src)) {
    fail('turn status no longer resets -webkit-background-clip (the host still clips to text)');
  } else if (!/\[class\*="_turnStatus"\]\{[\s\S]{0,340}?animation:none;/.test(src)) {
    fail('turn status still runs the host 1.8s shimmer');
  } else if (!/\[class\*="_turnStatus"\]\{[\s\S]{0,240}?color:var\(--mar-status-ink,var\(--mar-accent-text\)\)/.test(src)) {
    fail('turn status does not take its ink from --mar-status-ink / --mar-accent-text');
  } else if (!/\[class\*="_turnStatus"\] \[class\*="_turnStatusClock"\]\{[\s\S]{0,180}?-webkit-text-fill-color:var\(--dsw-alias-label-caption\)/.test(src)) {
    fail('the clock is not pinned to its own opaque fill (a parent gradient could show through it)');
  } else ok('turn status = flat --mar-status-ink, no background/clip/animation; the clock keeps a plain count');

  // ---- the accent is a SURFACE, never a letterform (2026-09-21) ------------
  //    「主绿 + 黑」 flips the UI onto a white plate. Acid green as TEXT on that
  //    plate is 1.2:1 on white and 1.06:1 on its own hover wash — measured live
  //    by hovering 插件 in the settings nav, which turned the word into a green
  //    ghost. (The user's report: "主绿 + 黑 下 看不清，而且有时候只有主黑 + 绿
  //    会生效" — on the dark plate the same rule is 8.4:1, so only the green mode
  //    broke.) So every accent-as-`color` rule reads --mar-accent-text, which
  //    the light layer re-declares as the primary ink. The accent as a FILL is
  //    untouched and stays mode-independent: --mar-accent + --mar-accent-ink.
  //    The residual-pattern guard has to exclude `background-color:` (a plain
  //    `color:var(--mar-accent)` substring match would fire on the legit
  //    accent-face fill in the selected-cell rule).
  if (!src.includes('--mar-accent-text:#C0FE04;')) {
    fail('--mar-accent-text is not declared on the base theme block');
  } else if (!/mar-bg-light\{[\s\S]{0,700}?--mar-accent-text:#0B0D0B;/.test(src)) {
    fail('the light layer does not flip --mar-accent-text — green text on the white plate is invisible');
  } else if (/(^|[^-\w])color:var\(--mar-accent\)[;!]/.test(src)) {
    fail('a rule paints the accent as text again — use --mar-accent-text, or it disappears in 「主绿 + 黑」');
  } else if (!/\[class\*="_brandName"\]\{color:var\(--mar-accent-text\);\}/.test(src)) {
    fail('the brand lockup is not on --mar-accent-text (#C0FE04 on white is 1.2:1)');
  } else if (!/\.mar-bg-light \[class\*="_brandName"\] svg rect\{fill:var\(--mar-accent\);\}/.test(src)) {
    fail('the HARNESS badge pill is not pinned to the accent — with the lockup on the ink, pill and letters both come out #0B0D0B (a blank black chip)');
  } else ok('accent-as-text goes through --mar-accent-text (light layer flips it to the ink); accent-as-fill is unchanged');

  // ---- boot marks: which element each point-cloud hugs ---------------------
  //    Read from the engine SOURCE, not the bundle: the engine is embedded as a
  //    JSON string, so its newlines arrive in client.js as literal \n and any
  //    cross-line pattern there is a trap (see the rework of mar-run-b earlier).
  const eng = fs.readFileSync(path.join(root, 'src', 'boot', 'engine-marathon.js'), 'utf8');
  if (!eng.includes("composer: ['[class*=\"uV2eYG_card\"]'")) {
    fail('the composer mark no longer anchors on uV2eYG_card first (the 1310px band comes back)');
  } else if (!eng.includes("sidebar:  ['[class*=\"_quietBars\"]', '[class*=\"_railIn\"]', '[class*=\"_sidebarCol\"]']")) {
    fail('the sidebar mark lost its _sidebarCol fallback (it vanishes once a session is open)');
  } else if (!eng.includes('function hiddenTree(el)') ||
             !eng.includes('if (!r.hidden) return r;')) {
    fail('pickRect lost its two-pass visible-first pick');
  } else ok('boot marks hug the real input card, with a sidebar anchor that survives opening a session');

  // ---- boot marks: the box grid must hug the CARD, never the rail ------------
  //    (2026-10-10; user: "重启后输入框在底部时，红色方框会与红色十字重叠一部分，
  //    超出了应有的区域"). Two independent causes, both pinned here:
  //      * `uV2eYG` does not exist anywhere in the current app.asar (full-archive
  //        scan: 0 hits), so the box grid had always been falling through to
  //        composerStack / composerHero — a 903x264 band around a 780x118 card
  //        (measured off boot3-frame-029: crosses x[0..276] full height, boxes
  //        out to x=1381 and 264 tall). The card is now found by class token
  //        (RlGAzG_card today, i.e. any token ending in `_card`) inside that stack;
  //      * a window below the 1024 breakpoint with the sidebar expanded over the
  //        centre column puts the band underneath the rail, so every box cell that
  //        lands in the sidebar rect is dropped — the crosses keep their own ground.
  if (!eng.includes('function cardIn(scope)') || !eng.includes('function composerRect()')) {
    fail('the composer mark no longer resolves the real input card (cardIn/composerRect) — the 903x264 band anchor is back');
  } else if (!eng.includes('if (hitsRect(x, y, half + lw, bar)) continue;') || !eng.includes('function hitsRect(x, y, hw, r)')) {
    fail('the composer mark no longer subtracts the sidebar rect by glyph extent — a box on the boundary still laps over the crosses');
  } else if (!/function drawComposerBox\(alpha, rect, avoid\)/.test(eng)) {
    fail('drawComposerBox lost its rect/avoid arguments — the two marks would be measured twice per frame and could disagree');
  } else ok('boot marks: boxes hug the real input card and never enter the rail');

  // ---- boot S-path: cross-zone overlap so the red sweep hides the 1px seam ----
  //    (2026-10-02; user: "后续的S型蓝色和红色动画之间应该是无缝的，在上中下结构里是无缝的")
  //    The buildRegions rect for each zone used to be exactly [z*zoneH,(z+1)*zoneH),
  //    so adjacent zones touched at y=zoneH with no overlap — the red sweep showed
  //    a 1px sub-pixel seam at every zone boundary. The desktop cut dropped
  //    computeRectangularTiles() (which had a 1px forced overlap) because the
  //    half-cell TILE_PAD it applied in every direction created a brighter frame
  //    around every panel during transitions. The minimal fix is to extend ONLY
  //    across zone boundaries (not within zones), so the overlap is limited to
  //    the two zone-boundary seams and within-zone panels stay tile-exact.
  if (!/if \(z > 0\)\s+reg\.y0 = Math\.max\(0, reg\.y0 - TILE_PAD\);/.test(eng) ||
      !/if \(z < CFG\.ZONES - 1\) reg\.y1 = Math\.min\(H, reg\.y1 \+ TILE_PAD\);/.test(eng)) {
    fail('panel rects no longer extend by TILE_PAD at the zone boundaries — the red sweep will show a 1px seam at y=zoneH and y=2*zoneH again');
  } else if (/var TILE_PAD = CFG\.CELL_SIZE \/ 2;[\s\S]{0,40}?function computeRectangularTiles/.test(eng)) {
    fail('TILE_PAD is still declared right above computeRectangularTiles — the buildRegions-time pad reads undefined and the seam comes back. Move the declaration above buildRegions');
  } else ok('boot S-path: panel rects extend by half a cell across zone boundaries, so the red sweep hides the 1px inter-zone seam');

  // ---- boot grid: cellH must exactly tile each zone vertically ----------------
  //    (2026-10-02; user: "蓝色部分还是有明显的分割")
  //    With H=952, ZONES=3, CELL_SIZE=12: zoneH=317.33 but rowsZ*12=312 → 5.33px
  //    pure-blue strip between every pair of zones, where the blue field shows
  //    through with no cell glyph on either side. The dot grid reads as
  //    "broken at the boundary". Fix: cellH = zoneH / rowsZ (12.205 for the
  //    default) so the cell column exactly fills each zone; cellW stays at
  //    CELL_SIZE so the maze tiles stay near-square.
  if (!/cellH = zoneH \/ rowsZ;/.test(eng)) {
    fail('cellH is no longer derived from zoneH/rowsZ — every zone boundary will show a 5.33px pure-blue strip with no cell glyph on either side');
  } else if (/cellH = CFG\.CELL_SIZE;/.test(eng)) {
    fail('buildGrid is back to setting cellH = CELL_SIZE — the cell grid will leave a non-integer gap at each zone boundary and the blue field will bleed through');
  } else ok('boot grid: cellH = zoneH/rowsZ so the cell column exactly tiles each zone and the blue field has no inter-zone seam');

  // ---- boot caption: the logo text must not shift on its first frames -------
  //    (2026-09-26; user: "绿色logo的字在一开始有偏移，后续正常")
  //    Cause: the caption was centred with `left:50%` + `translateX(-50%)` while
  //    the Maratype @font-face was `font-display:swap`. The fallback measures the
  //    two lines wider than the real face, so on the swap the browser re-measured
  //    and the element's left edge jumped while the rise animation was already
  //    running — the text slid into place over the first frames. Two independent
  //    things have to hold, and both are asserted:
  //      * the font must not swap mid-animation (`block`), so nothing is measured
  //        twice;
  //      * the centring must not live in `transform`, because a keyframe that
  //        animates `transform` replaces the centring term outright while it runs
  //        — so the caption is a full-width band instead, and `mb-rise` may only
  //        carry translateY.
  if (!src.includes('font-display:block')) {
    fail('the Maratype @font-face is not font-display:block — the swap re-measures the centred caption and the logo text jumps on the first frames');
  } else if (src.includes('font-display:swap')) {
    fail('font-display:swap is back on the boot font — the logo text slides into place again');
  } else if (!/#dshMarBootHost \.mb-caption \{[\s\S]{0,140}?left: 0; right: 0;[\s\S]{0,80}?text-align: center;/.test(src)) {
    fail('the boot caption is not a full-width centred band (needs left:0 + right:0 + text-align:center)');
  } else if (/(^|[^-\w])mb-caption[\s\S]{0,200}?translateX\(-50%\)/.test(src)) {
    fail('the boot caption is centred with translateX(-50%) again — a transform-animating keyframe overwrites it (see above)');
  } else if (/@keyframes mb-rise[\s\S]{0,240}?translateX/.test(src)) {
    fail('a mb-rise keyframe animates translateX — it replaces the caption\'s own transform term');
  } else ok('boot caption: full-width centred band, block font, rise keyframes carry translateY only');

  // ---- background layer: the clear-marks -----------------------------------
  //    The sidebar root is `_root _quietBars` in the hero phase and plain `_root`
  //    once a conversation is open, and it lives at depth 2 (behind a
  //    display:contents wrapper) — so neither a `_quietBars` search nor a
  //    direct-children scan finds it. That was the bug: the whole column kept an
  //    opaque rgb(11,13,11) plate and the field disappeared behind the sidebar
  //    (.generated/probe-bgwho.cjs / probe-rootes.cjs). Marks must also be
  //    re-applied the moment the DOM changes, not only on the 1.2s sweep, or a
  //    session switch reads as "the field vanishes and comes back".
  if (!/function bgAnchorTargets\(\)/.test(src) ||
      !/var plate = cc\.querySelector\('\[class\*="_root"\]'\);/.test(src)) {
    fail('the anchor pass is gone — the centre column\'s plate (depth 2, plain _root) goes unmarked again');
  } else if (/bgPaintWalker\(sc, list, 0\)/.test(src) || /list\.push\(sc\)/.test(src)) {
    fail('the sidebar is walked/cleared again — the rail must keep its own opaque plate ("侧边栏不要透明"); it is the one surface the field does NOT run through');
  } else if (!/function bgUnmarkSidebar\(\)/.test(src) ||
             !/bgMarkAdd\(bgPaintTargets\(\)\);\s*\n\s*bgUnmarkSidebar\(\);/.test(src)) {
    fail('nothing sweeps .mar-bg-clear off the sidebar subtree: the class is only ever ADDED, so a node marked by an earlier pass would stay see-through for good');
  } else if (!/var seat = cc \? cc\.querySelector\('\[class\*="composerSeat"\]'\) : null;/.test(src) ||
             !/if \(seat\) list\.push\(seat\);/.test(src)) {
    fail('the composer seat is no longer an anchor — it is 1284x146, so the 200x200 plate floor never reaches it and its dissolve gradient blacks out the bottom of every session again');
  } else if (!/\.mar-bg-clear\{background-color:transparent!important;[\s\S]{0,60}?background-image:none!important;/.test(src)) {
    fail('clearing a plate no longer kills its background-image — the composer dissolve is a linear-gradient, and background-color:transparent cannot touch a gradient');
  } else if (!/function bgPaints\(el\)/.test(src) || !/if \(r\.width < 200 \|\| r\.height < 200\) return false;/.test(src)) {
    fail('bgPaints lost its size floor (rows / the new-session button / the list fade would be marked)');
  } else if (!/function bgMarkAdd\(list\)/.test(src) ||
             !/bgMarkAdd\(bgAnchorTargets\(\)\);/.test(src)) {
    fail('bgKick no longer re-applies the cheap anchor pass');
  } else if (!/var bgObserver = null, bgKickRaf = 0, bgKickFullAt = 0;/.test(src) ||
             !/bgObserver\.observe\(host, \{ childList: true, subtree: true, attributes: true, attributeFilter: \['class'\] \}\)/.test(src)) {
    fail('the DOM observer must also watch class changes: a session switch needs it to re-mark the rebuilt columns, and the FIRST sidebar hover drops DSH\'s _quietBars — a class-only repaint with no childList mutation — which left the rail an opaque rgb(11,13,11) plate until an unrelated node change kicked it (measured 517ms opaque; 0ms with the class filter)');
  } else if (!/if \(lost && now - bgKickFullAt >= 400\) \{/.test(src)) {
    fail('the plate scan is not gated on "a mark went offline" + the 400ms throttle');
  } else if (!/function bgModal\(el\)/.test(src) ||
             !/if \(bgModal\(el\) \|\| bgLayer\(el\)\) return;/.test(src)) {
    fail('the plate walk does not stop at the modal / layer boundary — DSH mounts the settings dialog inside the sidebar subtree, so the dialog would be marked and go see-through');
  } else if (!/el\.getAttribute\('role'\) === 'dialog'/.test(src) ||
             !/el\.getAttribute\('aria-modal'\) === 'true'/.test(src) ||
             !/_overlay\|_modal\|_dialog\|_popover/.test(src)) {
    fail('bgModal lost one of its hints (role / aria-modal / class token)');
  } else if (!/if \(cs\.position === 'fixed' \|\| cs\.position === 'absolute'\) return false;/.test(src)) {
    fail('bgPaints no longer refuses floating layers — a modal or panel without a class hint would be marked again');
  } else if (!/function bgLayer\(el\)/.test(src) ||
             !/return cs\.position === 'absolute' \|\| cs\.position === 'fixed';/.test(src)) {
    fail('bgLayer is gone — the task board view ([data-dsh-taskboard-view], position:absolute appended to the centre column) and its five 243x821 columns would be marked and the whole board would go see-through');
  } else ok('background clear-marks: cheap anchor pass on every DOM change, style-reading plate scan on mount/sweep/loss');

  // ---- the nav cells: hover + selected, OURS AND THE HOST'S ----------------
  //    Both states are accent green and both are ours (the host paints its own
  //    "active" cell the panel colour, which reads as nothing). Selected uses the
  //    accent as a FACE, so the ink has to be --mar-accent-ink — the theme's own
  //    rule. The selected rules must sit AFTER the hover rule: same specificity,
  //    so the other order would let a hover trade the solid fill back for a tint.
  //    The rules must NOT be scoped to [data-mar-nav] / .mar-nav-on: that is
  //    exactly what made the first attempt a no-op — the host's own 通用设置 /
  //    模型 / 插件 / … cells carry neither hook, so only our 主题设置 cell lit up.
  //    Our cell must also stay out of `nativeCells`, or `.mar-nav-muted`'s
  //    !important transparent background would beat the accent fill.
  //    Cross-line: the sheet lives in client.js as an array of JS string lines,
  //    so two adjacent CSS lines are separated by `',\n        '` — a plain
  //    `\s*` between them does NOT match. Use a short lazy `[\s\S]{0,N}?`.
  if (!src.includes('--mar-wash-accent:rgba(192,254,4,.14);')) {
    fail('the accent wash token is gone — the hover tint has nothing to read from');
  } else if (!/\[class\*="_navCell"\]:hover\{[\s\S]{0,20}?background-color:var\(--mar-wash-accent\)!important;color:var\(--mar-accent-text\)!important;/.test(src)) {
    fail('the nav cells have no green hover state (wash + --mar-accent-text ink)');
  } else if (/\[class\*="_navCell"\]\[data-mar-nav\]:hover\{/.test(src)) {
    fail('the hover tint is scoped to our own cell again — the host\'s own cells would get nothing');
  } else if (src.indexOf('mar-nav-on:hover') < src.indexOf('[class*="_navCell"]:hover{')) {
    fail('the selected rules come before the hover rule — source order is what keeps the fill');
  } else if (!/\[class\*="_navCell"\]\.mar-nav-on,[\s\S]{0,170}?background-color:var\(--mar-accent\)!important;color:var\(--mar-accent-ink\)!important;/.test(src)) {
    fail('the selected settings tab does not use accent-as-a-face with --mar-accent-ink');
  } else if (!/\[class\*="_navCell"\]\[class\*="_active"\][\s\S]{0,170}?background-color:var\(--mar-accent\)!important;color:var\(--mar-accent-ink\)!important;/.test(src) ||
             !/\[class\*="_navCell"\]\[aria-current="true"\]/.test(src)) {
    fail('the host\'s own selected cell is not covered (needs both the `_active` token and aria-current as hooks)');
  } else if (!/\.mar-nav-on \*,[\s\S]{0,220}?\[aria-current="true"\] \*\{color:inherit!important;\}/.test(src)) {
    fail('the selected cell\'s label / icon no longer inherit the ink — the host colours them itself, so a green fill would keep near-white text');
  } else if (!/\.mar-tab-on \[class\*="_navCell"\]\.mar-nav-muted\{[\s\S]{0,150}?color:var\(--mar-ink-primary\)!important;\}/.test(src)) {
    fail('the native-cell stand-down is gone or no longer resets the ink — a transparent cell would keep #0B0D0B text and vanish into the panel');
  } else if (!/\.mar-tab-on \[class\*="_navCell"\]\.mar-nav-muted:hover\{[\s\S]{0,20}?background-color:var\(--mar-wash-accent\)!important;/.test(src)) {
    fail('the stand-down has no explicit :hover rule — with only a :not(:hover) exemption the host\'s stale _active (0,4,1) beats the plain hover rule (0,3,1) and the tint renders as a second solid fill');
  } else if (/\.mar-nav-muted:not\(:hover\)/.test(src)) {
    fail('the stand-down is back to a :not(:hover) exemption — see above');
  } else if (!/querySelectorAll\('\[class\*="_navCell"\]:not\(\[data-mar-nav\]\)'\)/.test(src)) {
    fail('nativeCells includes our own cell again — mar-nav-muted would strip the accent fill');
  } else ok('nav cells (ours + the host\'s): green hover (wash) + green selected (accent face, dark ink), one cell at a time');
}

console.log('');
if (failures > 0) {
  console.error(failures + ' check(s) failed.');
  process.exit(1);
}
console.log('All static checks passed.');
process.exit(0);
