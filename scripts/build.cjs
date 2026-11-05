#!/usr/bin/env node
/* scripts/build.cjs — assemble the final client.js that DSH loads.
 *
 * 1. base64-inline assets/fonts/Maratype.otf into the __MARATYPE_BASE64__
 *    placeholder inside src/client.template.js (theme @font-face).
 * 2. base64-inline assets/boot/*.png into the __IMG_*_B64__ tokens inside
 *    src/boot/boot.html.
 * 3. URL-encode assets/factions/*.svg into the `/*__FACTION_CSS__*​/` slot of the
 *    template's stylesheet — one rule per 配色 swatch, keyed on data-accent.
 * 4. JSON-embed the boot payload { css, html, marathon, intro } into the
 *    BOOT_PAYLOAD marker line in src/client.template.js.
 *
 * Run `node scripts/build.cjs`, then `node check.cjs` for static validation.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }

// ---- 0) 配色 swatch artwork ------------------------------------------------
// Seven plates, seven colours: six Marathon factions plus the Marathon logo
// itself for the DEFAULT palette entry (马拉松LOGO.svg, added 2026-10-16 on the
// user's request), so no swatch is left as a flat fill any more.
//
// The hex here is the ACCENT the swatch SELECTS (client.template.js's
// ACCENT_ORDER); the artwork's own plate colour differs by a hair for the six
// factions (e.g. 特莱克斯 draws on #EA710B, the palette value is #E5710C) because
// the two were produced separately. The palette value wins: it is what the UI
// actually wears. 马拉松LOGO.svg is the exception — its plate IS #C0FE04.
const FACTIONS = [
  ['05C938', '赛博艾克米.svg'],   // green
  ['E60B10', '阿拉克尼.svg'],     // red
  ['E7337C', '纽卡洛里.svg'],     // pink
  ['E5710C', '特莱克斯.svg'],     // orange
  ['C272E9', '米达.svg'],         // purple
  ['81E8B1', '关口.svg'],         // mint
  ['C0FE04', '马拉松LOGO.svg']    // the default: the Marathon logo
];
const factionDir = path.join(root, 'assets', 'factions');

// ---- 0b) 名字不可信，内容可信 ----------------------------------------------
// Issue #3 (2026-10-26) reported this repo's artwork as "filenames mangled by a
// GBK/UTF-8 round-trip, and 赛博艾克米.svg missing entirely". The files were never
// missing here, and nothing in the repository is GBK: the cause is a checkout
// whose file *names* were written as raw UTF-8 bytes and then read back through
// the ANSI code page (cp936 on a Chinese Windows), which turns
// `赛博艾克米.svg` into `璧涘崥鑹惧厠绫?svg`. Node then reads that mojibake name
// back faithfully, so `readFileSync` still works -- only the *lookup by literal
// name* in this script fails, which is exactly the symptom the reporter hit
// ("missing faction artwork: …/赛博艾克米.svg").
//
// Every plate carries its own `<title>`, so resolve by that first: the lookup
// then survives any filename encoding, any rename, and any archive tool that
// re-mangles names on extract. Falls back to the literal name for a stock
// checkout, and fails with a list of what IS there when neither works.
const factionFiles = (() => {
  try { return fs.readdirSync(factionDir).filter((n) => /\.svg$/i.test(n)); }
  catch { return []; }
})();
const factionByTitle = new Map();
for (const candidate of factionFiles) {
  let text = '';
  try { text = fs.readFileSync(path.join(factionDir, candidate), 'utf8'); } catch { continue; }
  const m = /<title>([\s\S]*?)<\/title>/i.exec(text);
  if (m) {
    const title = m[1].trim();
    if (title && !factionByTitle.has(title)) factionByTitle.set(title, candidate);
  }
}
const rescued = [];
function resolveFaction(file) {
  const direct = path.join(factionDir, file);
  if (fs.existsSync(direct)) return direct;
  const base = file.replace(/\.svg$/i, '');
  const byTitle = factionByTitle.get(base);
  if (byTitle) {
    rescued.push(base + '.svg -> ' + byTitle);
    return path.join(factionDir, byTitle);
  }
  return null;
}

const factionRules = FACTIONS.map(([hex, file]) => {
  const resolved = resolveFaction(file);
  if (resolved === null) {
    console.error('[build] missing faction artwork: ' + path.join(factionDir, file));
    console.error('[build] files actually present: ' + (factionFiles.join(', ') || '(none)'));
    console.error('[build] titles read from them: ' + (Array.from(factionByTitle.keys()).join(', ') || '(none)'));
    console.error('[build] if the names above look like 璧涘崥鑹惧厠绫?svg, this checkout stored ' +
      'UTF-8 bytes under an ANSI code page; the content lookup should have covered that, ' +
      'so a missing <title> or a renamed plate is the real cause.');
    process.exit(1);
  }
  const p = resolved;
  // data:image/svg+xml with the SVG's own text percent-encoded. Smaller than
  // base64 for source-like text, and it stays readable in the built file.
  // WHAT MUST NEVER SURVIVE ENCODING: the generated rule is spliced into the
  // template's stylesheet as the body of an ordinary single-quoted JS string, so
  // a raw single quote, backslash or newline would end the literal and take the
  // whole client bundle down with it (measured: the swatches rendered nothing and
  // the page never reported). `%22` stays encoded — the double quotes in
  // `url("…")` are the delimiters *we* write.
  const svg = fs.readFileSync(p, 'utf8').replace(/\s+/g, ' ').trim();
  const enc = encodeURIComponent(svg)
    .replace(/%20/g, ' ')
    .replace(/%3D/g, '=')
    .replace(/%3A/g, ':')
    .replace(/%2F/g, '/')
    .replace(/%2C/g, ',')
    .replace(/'/g, '%27')
    .replace(/\\/g, '%5C');
  const rule = '.mar-sw button[data-accent="#' + hex + '"]{--sw-img:url("data:image/svg+xml,' + enc + '");}';
  if (/['\\\r\n]/.test(rule)) {
    console.error('[build] generated 配色 rule for ' + file + ' contains a character that would break the JS string literal');
    process.exit(1);
  }
  return rule;
}).join('');   // NO newlines: the slot it lands in is an ordinary single-quoted
                // JS string in the template's stylesheet array, and a raw \n
                // would end the literal (measured: the swatches went blank and
                // the whole bundle failed to parse).

// ---- 1) font ---------------------------------------------------------------
const fontPath = path.join(root, 'assets', 'fonts', 'Maratype.otf');
if (!fs.existsSync(fontPath)) {
  console.error('[build] missing font:', fontPath);
  process.exit(1);
}
const fontB64 = fs.readFileSync(fontPath).toString('base64');

// ---- 2) boot payload sources ----------------------------------------------
const tplPath = path.join(root, 'src', 'client.template.js');
const tpl = read('src/client.template.js');
// The client half compares this against the npm registry's `latest` (falling back
// to package.json on GitHub main).
const pluginVersion = JSON.parse(read('package.json')).version;

const bootCss     = read('src/boot/boot.css');
let bootHtml      = read('src/boot/boot.html');
const bootMarathon= read('src/boot/engine-marathon.js');
const bootIntro   = read('src/boot/engine-intro.js');

// Task-completion overlay (reverse red S sweep -> matrix marks -> black ->
// glass tiles + dot field + green banner). Same shape as the boot payload but
// with no image tokens: every pixel of it is drawn programmatically.
const doneCss     = read('src/boot/done.css');
const doneHtml    = read('src/boot/done.html');
const doneEngine  = read('src/boot/engine-done.js');

// Running strip (运行动画): a compact canvas engine that replaces the native
// "深度求索中" row above the composer. It is injected as its own payload for
// the same reason as the two overlays: the template's settings/DOM half must
// never have to parse or string-build the engine.
const runEngine   = read('src/run/engine-run.js');
// 动画1（点阵有机体）是**独立选项**：自己的小引擎 + 逐帧数据。
const dotEngine   = read('src/run/engine-dot.js');
const runThink    = read('src/run/think-anim1.js');

const imgAssets = {
  __IMG_BLUE_B64__:   path.join(root, 'assets', 'boot', 'blue-pixel.png'),
  __IMG_GREEN_B64__:  path.join(root, 'assets', 'boot', 'green-logo.png'),
  __IMG_INVERT_B64__: path.join(root, 'assets', 'boot', 'invert-blue-pixel.png')
};
Object.keys(imgAssets).forEach((token) => {
  const p = imgAssets[token];
  if (!fs.existsSync(p)) {
    console.error('[build] missing boot image:', p);
    process.exit(1);
  }
  if (bootHtml.indexOf(token) === -1) {
    console.error('[build] token not present in src/boot/boot.html:', token);
    process.exit(1);
  }
  const b64 = fs.readFileSync(p).toString('base64');
  bootHtml = bootHtml.split(token).join('data:image/png;base64,' + b64);
});

// The inverted-blue logo flickers from 1.20s for 0.25s — re-enabled 2026-10-02.
// The asset is wired into the desktop cut's boot payload too; the transparent
// window shows the user's wallpaper through the flicker rather than against a
// black plate, but the user wanted the beat back.
if (/__IMG_[A-Z_]+__/.test(bootHtml)) {
  console.error('[build] unreplaced image token remains in boot.html');
  process.exit(1);
}

const payload = {
  css: bootCss,
  html: bootHtml,
  marathon: bootMarathon,
  intro: bootIntro
};

// The completion overlay travels as its own JSON payload so the two overlays can
// never be confused for one another (and so the boot payload's structure — and
// every byte-level assertion about it in check.cjs — stays exactly as it was).
const donePayload = {
  css: doneCss,
  html: doneHtml,
  engine: doneEngine
};

// The running strip is engine-only: its host element and the switch live in the
// template, so there is nothing to inline but the script itself.
const runPayload = { engine: runEngine };
// The right-side dot animation travels separately so either option can be
// enabled without dragging the other engine in.
const dotPayload = { engine: dotEngine + '\n;\n' + runThink };

// ---- 3) assemble -----------------------------------------------------------
if (tpl.indexOf('__MARATYPE_BASE64__') === -1) {
  console.error('[build] placeholder __MARATYPE_BASE64__ not found in template');
  process.exit(1);
}
const marker = '/*__BOOT_PAYLOAD__*/ null';
if (tpl.indexOf(marker) === -1) {
  console.error('[build] marker "' + marker + '" not found in template — boot payload would be dropped');
  process.exit(1);
}
const doneMarker = '/*__DONE_PAYLOAD__*/ null';
if (tpl.indexOf(doneMarker) === -1) {
  console.error('[build] marker "' + doneMarker + '" not found in template — completion payload would be dropped');
  process.exit(1);
}
const runMarker = '/*__RUN_PAYLOAD__*/ null';
if (tpl.indexOf(runMarker) === -1) {
  console.error('[build] marker "' + runMarker + '" not found in template — running-strip payload would be dropped');
  process.exit(1);
}
const versionMarker = '__MAR_PLUGIN_VERSION__';
if (tpl.indexOf(versionMarker) === -1) {
  console.error('[build] marker "' + versionMarker + '" not found in template — update check version would be dropped');
  process.exit(1);
}
const dotMarker = '/*__DOT_PAYLOAD__*/ null';
if (tpl.indexOf(dotMarker) === -1) {
  console.error('[build] marker "' + dotMarker + '" not found in template — dot-animation payload would be dropped');
  process.exit(1);
}

const payloadJson = JSON.stringify(payload);
const doneJson = JSON.stringify(donePayload);
const runJson = JSON.stringify(runPayload);
const dotJson = JSON.stringify(dotPayload);
const factionMarker = '/*__FACTION_CSS__*/';
if (tpl.indexOf(factionMarker) === -1) {
  console.error('[build] marker "' + factionMarker + '" not found in template — 配色 artwork would be dropped');
  process.exit(1);
}
let out = tpl.split('__MARATYPE_BASE64__').join(fontB64);
out = out.split(versionMarker).join(pluginVersion);
out = out.split(marker).join(payloadJson);
out = out.split(doneMarker).join(doneJson);
out = out.split(runMarker).join(runJson);
out = out.split(dotMarker).join(dotJson);
out = out.split(factionMarker).join(factionRules);

if (out.indexOf('__MARATYPE_BASE64__') !== -1) {
  console.error('[build] __MARATYPE_BASE64__ placeholder still present after replace');
  process.exit(1);
}
// NOTE: a plain `indexOf('__IMG_')` false-positives on the inlined base64
// payload (its alphabet includes the underscore), so match the placeholder shape.
if (out.indexOf('/*__BOOT_PAYLOAD__*/') !== -1 || out.indexOf('/*__DONE_PAYLOAD__*/') !== -1 ||
    out.indexOf('/*__RUN_PAYLOAD__*/') !== -1 || out.indexOf('/*__DOT_PAYLOAD__*/') !== -1 ||
    out.indexOf(versionMarker) !== -1 ||
    out.indexOf(factionMarker) !== -1 || /__IMG_[A-Z_]+__/.test(out)) {
  console.error('[build] boot/done/run/dot/version/faction placeholder or image token still present after replace');
  process.exit(1);
}
if (out.indexOf('dshMarBootHost') === -1 || out.indexOf('#mb-canvas') === -1) {
  console.error('[build] boot payload missing from output');
  process.exit(1);
}
if (out.indexOf('dshMarDoneHost') === -1 || out.indexOf('#md-scene') === -1 ||
    out.indexOf('#md-banner-text') === -1) {
  console.error('[build] completion payload missing from output');
  process.exit(1);
}
if (out.indexOf('var RUN_PAYLOAD = null') !== -1 || runJson.length < 1000) {
  console.error('[build] running-strip payload missing from output');
  process.exit(1);
}
if (out.indexOf('var DOT_PAYLOAD = null') !== -1 || dotJson.length < 1000 ||
    out.indexOf('__marThinkAnim') === -1 || out.indexOf('__marDotEngine') === -1) {
  console.error('[build] dot-animation payload missing from output');
  process.exit(1);
}

// 2026-11-05 用户反馈：只是推送（push）时界面也闪成了任务完成动画。根因不是 git，
// 而是推送前习惯性地跑了一次 build：即使源码没变，fs.writeFileSync 也会刷新
// client.js 的 mtime，DSH 的 client-hmr 按 bundle 的 mtime/ctime/size 判断“重编译”，
// 于是把正在跑的客户端插件热重载了一次，收尾动画 / 运行动画被从中间截断。
// 因此内容完全一致时**不写盘**：推送、复查构建都不再可能触发 HMR；源码真的变了才写。
const outPath = path.join(root, 'client.js');
let previous = null;
try { previous = fs.readFileSync(outPath, 'utf8'); } catch (e) { previous = null; }
if (previous === out) {
  console.log('[build] client.js unchanged (' + Buffer.byteLength(out, 'utf8') +
    ' bytes) — not rewriting, so client-hmr stays quiet');
} else {
  fs.writeFileSync(outPath, out);
  // Bytes, not UTF-16 length: the bundle carries a lot of Chinese, so the in-memory
  // string is ~7% shorter than the file and a report that printed it read as a
  // truncated write.
  console.log('[build] wrote client.js (' + Buffer.byteLength(out, 'utf8') + ' bytes)');
}
console.log('[build]   boot css    ' + bootCss.length + ' bytes');
console.log('[build]   boot html   ' + bootHtml.length + ' bytes');
console.log('[build]   marathon    ' + bootMarathon.length + ' bytes');
console.log('[build]   intro       ' + bootIntro.length + ' bytes');
console.log('[build]   done css    ' + doneCss.length + ' bytes');
console.log('[build]   done html   ' + doneHtml.length + ' bytes');
console.log('[build]   done engine ' + doneEngine.length + ' bytes');
console.log('[build]   run engine  ' + runEngine.length + ' bytes');
console.log('[build]   dot engine  ' + dotEngine.length + ' bytes');
console.log('[build]   think anim1 ' + runThink.length + ' bytes');
console.log('[build]   payload JSON' + payloadJson.length + ' bytes, done JSON ' +
  doneJson.length + ' bytes, font b64 ' + fontB64.length + ')');
console.log('[build]   配色 artwork  ' + FACTIONS.length + ' faction(s), ' +
  factionRules.length + ' bytes of generated CSS');
if (rescued.length > 0) {
  // Loud on purpose: the build now succeeds either way, but the checkout is
  // carrying mis-encoded file names and the *next* tool (an editor, an archive
  // step, `git status`) will keep tripping over them. Re-clone, or make git and
  // the shell agree on UTF-8 (Windows: `chcp 65001`, or the "Beta: Use Unicode
  // UTF-8 for worldwide language support" option).
  console.log('[build]   ! resolved by <title>, not by filename [' + rescued.join('; ') + ']');
  console.log('[build]   ! this checkout stored UTF-8 file names under the ANSI code page — ' +
    'cosmetic for the build, but fix the checkout (re-clone / UTF-8 code page) before committing.');
}
