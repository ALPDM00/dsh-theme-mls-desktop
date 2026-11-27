#!/usr/bin/env node
/* tools/screencast.cjs — 用 CDP Page.startScreencast 密集抓帧（不进包）
 *
 *   node tools/screencast.cjs <url> <outdir> [durMs] [maxWidth]
 *
 * 为什么不用 Page.captureScreenshot：单次截图在有 R3F + 4 万线段的无头页面上要
 * ~1.2s，进入动画只有 1s，抓不到过程。screencast 走合成器帧流，能拿到 ~10-30fps
 * 的连续帧（哪怕渲染器本身很慢），每帧带自己的 timestamp。
 *
 * 输出：outdir/f0000_<ms>.jpg，ms 是相对导航开始的时间。
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_ = process.argv[2] || 'http://127.0.0.1:8099/explorer';
const OUT = process.argv[3] || path.join(os.tmpdir(), 'cast');
const DUR = Number(process.argv[4] || 6000);
const MAXW = Number(process.argv[5] || 900);
const PORT = 9500 + Math.floor(Math.random() * 200);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-'));

const chromeArgs = [
  '--hide-scrollbars',
  '--no-first-run',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile,
  '--window-size=1600,1000',
  'about:blank',
];
// HEADFUL=1：真窗口（放在屏幕外）走真 GPU。无头 + SwiftShader 在官方那种 R3F 页面上
// 只有 ~1fps，screencast 5s 只给 3 帧，根本看不到 1s 的进入动画。
if (process.env.HEADFUL === '1') {
  chromeArgs.unshift('--window-position=-2400,0', '--window-size=1600,1000', '--new-window');
} else {
  chromeArgs.unshift('--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader');
}

const chrome = spawn(CHROME, chromeArgs, { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let ver = null;
  for (let i = 0; i < 80 && !ver; i++) {
    await sleep(250);
    try { ver = await (await fetch('http://127.0.0.1:' + PORT + '/json/version')).json(); } catch (e) { /* 还没起 */ }
  }
  if (!ver) throw new Error('chrome devtools did not come up');

  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const frames = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      return;
    }
    if (m.method === 'Page.screencastFrame') {
      frames.push({ t: m.params.metadata.timestamp, data: m.params.data, sessionId: m.params.sessionId });
      send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {});
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  await S('Page.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await S('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: MAXW, maxHeight: Math.round(MAXW * 1000 / 1600), everyNthFrame: 1 });

  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  await S('Page.navigate', { url: URL_ });
  await sleep(DUR);
  await S('Page.stopScreencast');
  await send('Target.closeTarget', { targetId });

  const base = frames.length ? frames[0].t : 0;
  frames.forEach((f, i) => {
    const ms = Math.round((f.t - base) * 1000);
    fs.writeFileSync(path.join(OUT, 'f' + String(i).padStart(4, '0') + '_' + String(ms).padStart(5, '0') + 'ms.jpg'),
      Buffer.from(f.data, 'base64'));
  });
  console.log('[cast] ' + frames.length + ' frames in ' + (Date.now() - t0) + 'ms -> ' + OUT);
  ws.close();
}

main()
  .then(() => { chrome.kill(); setTimeout(() => process.exit(0), 100); })
  .catch((err) => {
    console.error('[cast] ' + (err && err.message));
    chrome.kill();
    setTimeout(() => process.exit(1), 100);
  });
