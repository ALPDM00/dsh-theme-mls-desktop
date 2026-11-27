#!/usr/bin/env node
/* tools/scene-shot.cjs — 用 CDP 给场景预览拍图（零依赖，Node >= 22）
 *
 *   node tools/scene-shot.cjs <url> <out.png> [waitMs] [w] [h]
 *
 * 为什么不用 chrome --screenshot --virtual-time-budget：虚拟时间会被场景自己的
 * rAF 循环飞快烧掉，截图经常落在 fetch 回来之前（实测：画面全黑、0 segs）。
 * 这里用真实时间等待，截图前先问一次 __marScene.stats()，把状态打在 stdout 上。
 */
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CHROME = process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.argv[2] || 'http://127.0.0.1:8123/';
const out = process.argv[3] || path.join(os.tmpdir(), 'scene.png');
const waitMs = Number(process.argv[4] || 3000);
const W = Number(process.argv[5] || 1600);
const H = Number(process.argv[6] || 1000);
const PORT = 9411 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-shot-'));

const chrome = spawn(CHROME, [
  '--headless=new',
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--hide-scrollbars',
  '--disable-extensions',
  '--no-first-run',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile,
  '--window-size=' + W + ',' + H,
  url,
], { stdio: 'ignore' });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  let pages = null;
  for (let i = 0; i < 80; i++) {
    await sleep(250);
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) { pages = page; break; }
    } catch (e) { /* not up yet */ }
  }
  if (!pages) throw new Error('chrome devtools did not come up');

  const ws = new WebSocket(pages.webSocketDebuggerUrl);
  let seq = 0;
  const waiting = new Map();
  const logs = [];
  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.method === 'Runtime.consoleAPICalled') {
      logs.push(msg.params.type + ': ' + (msg.params.args || [])
        .map((a) => (a.value !== undefined ? String(a.value) : (a.description || a.type))).join(' '));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      logs.push('EXCEPTION: ' + JSON.stringify(msg.params.exceptionDetails &&
        (msg.params.exceptionDetails.exception || msg.params.exceptionDetails.text)));
    }
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  function send(method, params) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  // 真实时间等待：进入动画 1s，留足余量，再等 fetch。
  //
  // 第 7 个参数（minIntro）给了就走另一条路：等引擎挂上 → `setPlace()` 把进入动画
  // **重新起算** → 睡 minIntro 秒 → 截图。Chrome 冷启动到 CDP 能说话有一两秒抖动，
  // 按墙钟抓帧经常抓到全黑或已经过完的那一帧；这样每一拍都能精确抓到。
  const minIntro = process.argv[7] === undefined ? null : Number(process.argv[7]);
  if (minIntro === null) {
    await sleep(waitMs);
  } else {
    const until = Date.now() + Math.max(waitMs, 20000);
    for (;;) {
      const probe = await send('Runtime.evaluate', {
        expression: 'JSON.stringify(window.__marScene && window.__marScene.debug ? window.__marScene.debug() : null)',
        returnByValue: true,
      }).catch(() => null);
      const raw = probe && probe.result && probe.result.value;
      let d = null;
      try { d = raw ? JSON.parse(raw) : null; } catch (e) { d = null; }
      if (d && d.mounted) break;
      if (Date.now() > until) throw new Error('engine never mounted');
      await sleep(80);
    }
    await send('Runtime.evaluate', { expression: 'window.__marScene.setPlace("planet")' });
    await sleep(Math.max(0, Math.round(minIntro * 1000)));
  }

  const stats = await send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__marScene ? window.__marScene.stats() : { error: "no engine" })',
    returnByValue: true,
  });
  const info = await send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__marScene && window.__marScene.debug ? window.__marScene.debug() : null)',
    returnByValue: true,
  });
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('[scene-shot] ' + out + '  ' + fs.statSync(out).size + ' bytes');
  console.log('[scene-shot] stats ' + (stats.result && stats.result.value));
  if (info && info.result && info.result.value) console.log('[scene-shot] debug ' + info.result.value);
  if (logs.length) console.log('[scene-shot] console:\n  ' + logs.slice(-20).join('\n  '));
  ws.close();
}

main()
  .then(() => { chrome.kill(); setTimeout(() => process.exit(0), 100); })
  .catch((err) => {
    console.error('[scene-shot] ' + (err && err.message));
    chrome.kill();
    setTimeout(() => process.exit(1), 100);
  });
