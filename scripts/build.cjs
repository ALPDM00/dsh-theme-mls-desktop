#!/usr/bin/env node
/* scripts/build.cjs — assemble the final client.js that DSH loads.
 *
 * 1. base64-inline assets/fonts/Maratype.otf into the __MARATYPE_BASE64__
 *    placeholder inside src/client.template.js (theme @font-face).
 * 2. base64-inline assets/boot/*.png into the __IMG_*_B64__ tokens inside
 *    src/boot/boot.html.
 * 3. JSON-embed the boot payload { css, html, marathon, intro } into the
 *    BOOT_PAYLOAD marker line in src/client.template.js.
 *
 * Run `node scripts/build.cjs`, then `node check.cjs` for static validation.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }

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

const payloadJson = JSON.stringify(payload);
const doneJson = JSON.stringify(donePayload);
let out = tpl.split('__MARATYPE_BASE64__').join(fontB64);
out = out.split(marker).join(payloadJson);
out = out.split(doneMarker).join(doneJson);

if (out.indexOf('__MARATYPE_BASE64__') !== -1) {
  console.error('[build] __MARATYPE_BASE64__ placeholder still present after replace');
  process.exit(1);
}
// NOTE: a plain `indexOf('__IMG_')` false-positives on the inlined base64
// payload (its alphabet includes the underscore), so match the placeholder shape.
if (out.indexOf('/*__BOOT_PAYLOAD__*/') !== -1 || out.indexOf('/*__DONE_PAYLOAD__*/') !== -1 ||
    /__IMG_[A-Z_]+__/.test(out)) {
  console.error('[build] boot/done placeholder/image token still present after replace');
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

fs.writeFileSync(path.join(root, 'client.js'), out);
console.log('[build] wrote client.js (' + out.length + ' bytes)');
console.log('[build]   boot css    ' + bootCss.length + ' bytes');
console.log('[build]   boot html   ' + bootHtml.length + ' bytes');
console.log('[build]   marathon    ' + bootMarathon.length + ' bytes');
console.log('[build]   intro       ' + bootIntro.length + ' bytes');
console.log('[build]   done css    ' + doneCss.length + ' bytes');
console.log('[build]   done html   ' + doneHtml.length + ' bytes');
console.log('[build]   done engine ' + doneEngine.length + ' bytes');
console.log('[build]   payload JSON' + payloadJson.length + ' bytes, done JSON ' +
  doneJson.length + ' bytes, font b64 ' + fontB64.length + ')');
