/* tools/audit-hooks.cjs — DSH 升级后先跑这个（不进包）
 *
 * 把插件 JS 里用到的选择器钩子，逐个对到**当前安装的** DSH 真实类名 / data 属性上，
 * 报出"这一版已经不存在"的那些。
 *
 *   node tools/audit-hooks.cjs
 *
 * 只看 JS 里的 querySelector / querySelectorAll / closest / matches —— CSS 里的死
 * 规则只是观感噪音，JS 里的死判据会让整段逻辑**静默**失效（0.7.2 修的
 * `doneStatusOn()` 就是：0.2.3 移除了 `_turnStatus` 类名，那条 DOM 兜底判据从此
 * 恒为 false，任务完成动画少了一条触发路径）。
 *
 * 安装目录默认取本机 Desktop 的 app.asar，可用 `DSH_INSTALL_DIR` 覆盖
 * （npm 安装时指向 `<prefix>/node_modules/@deepseek-ai/dsh`）。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PLUGIN = path.resolve(__dirname, '..');
const INSTALL = process.env.DSH_INSTALL_DIR ||
  'D:/Software/DeepSeek_Desktop/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh';
// INSTALL 指向 `…/node_modules/@deepseek-ai/dsh`，往上两层就是 node_modules
const ASAR = path.resolve(INSTALL, '..', '..');

// ---- 1) 从插件源码里抠出用到的选择器 ---------------------------------------
const sources = [
  path.join(PLUGIN, 'src', 'client.template.js'),
  path.join(PLUGIN, 'billing', 'host.mjs'),
  path.join(PLUGIN, 'index.js'),
];

const uses = [];   // { token, kind, where }
const selectorCalls = /(?:querySelector(?:All)?|closest|matches|getElementsByClassName)\s*\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;

for (const file of sources) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  let m;
  while ((m = selectorCalls.exec(text)) !== null) {
    const sel = m[2];
    const line = text.slice(0, m.index).split('\n').length;
    for (const cm of sel.matchAll(/\[class\*=["']([^"']+)["']\]/g)) {
      uses.push({ token: cm[1], kind: 'class*', where: path.basename(file) + ':' + line, sel });
    }
    for (const cm of sel.matchAll(/\[class\^=["']([^"']+)["']\]/g)) {
      uses.push({ token: cm[1], kind: 'class^', where: path.basename(file) + ':' + line, sel });
    }
    for (const cm of sel.matchAll(/\[(data-[a-z0-9-]+)/g)) {
      uses.push({ token: cm[1], kind: 'data', where: path.basename(file) + ':' + line, sel });
    }
  }
  // 直接写在 JS 里的 data 属性字符串比较（dataset / getAttribute('data-…')）
  lines.forEach((line, i) => {
    for (const cm of line.matchAll(/getAttribute\(\s*['"](data-[a-z0-9-]+)['"]/g)) {
      uses.push({ token: cm[1], kind: 'data', where: path.basename(file) + ':' + (i + 1), sel: line.trim() });
    }
    for (const cm of line.matchAll(/hasAttribute\(\s*['"](data-[a-z0-9-]+)['"]/g)) {
      uses.push({ token: cm[1], kind: 'data', where: path.basename(file) + ':' + (i + 1), sel: line.trim() });
    }
  });
}

// 去重（同一个 token 只报第一次出现的位置 + 出现次数）
const byToken = new Map();
for (const u of uses) {
  const key = u.kind + ':' + u.token;
  if (!byToken.has(key)) byToken.set(key, { ...u, hits: 0, places: [] });
  const rec = byToken.get(key);
  rec.hits++;
  if (rec.places.length < 4) rec.places.push(u.where + '  ' + u.sel.slice(0, 90));
}

// ---- 2) 把安装包里所有能拿到的文本扫成一个索引 ------------------------------
const index = new Map();      // needle -> 第一次出现的文件
const exts = new Set(['.css', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.html']);
let scanned = 0, skipped = 0;

function scanDir(dir, depth) {
  if (depth > 9) return;
  let list;
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of list) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.bin') continue;
      scanDir(p, depth + 1);
      continue;
    }
    const ext = path.extname(e.name);
    if (!exts.has(ext)) { continue; }
    if (/\.map$/.test(e.name)) continue;
    let size = 0;
    try { size = fs.statSync(p).size; } catch { continue; }
    if (size > 3 * 1024 * 1024) { skipped++; continue; }
    let text;
    try { text = fs.readFileSync(p, 'utf8'); } catch { continue; }
    scanned++;
    for (const key of byToken.keys()) {
      if (index.has(key)) continue;
      const token = byToken.get(key).token;
      if (text.includes(token)) index.set(key, p);
    }
  }
}

const t0 = Date.now();
// 只扫这份插件真正会碰到的包（client 侧 UI + 少数宿主包），否则要读几万个文件
const roots = [];
try {
  for (const d of fs.readdirSync(ASAR)) {
    if (/^@deepseek-ai/.test(d)) continue;
    if (/^dsh-(client|web|api|host|session|agent)/.test(d)) roots.push(path.join(ASAR, d));
  }
  const scope = path.join(ASAR, '@deepseek-ai');
  if (fs.existsSync(scope)) {
    for (const d of fs.readdirSync(scope)) {
      if (/dsh-(client|web|api|host)/.test(d)) roots.push(path.join(scope, d));
    }
  }
} catch (e) {
  console.error('cannot read install dir: ' + e.message);
  process.exit(1);
}
for (const r of roots) scanDir(r, 0);
console.log('[audit] 扫了 ' + scanned + ' 个文件（跳过 ' + skipped + ' 个大文件），用时 ' +
  ((Date.now() - t0) / 1000).toFixed(1) + 's\n');

// ---- 3) 报告 ---------------------------------------------------------------
const alive = [], dead = [];
for (const [key, rec] of byToken) {
  (index.has(key) ? alive : dead).push({ key, rec, file: index.get(key) });
}
dead.sort((a, b) => a.key.localeCompare(b.key));
alive.sort((a, b) => a.key.localeCompare(b.key));

console.log('== 在 0.2.3 上找不到的钩子（' + dead.length + '）==');
for (const d of dead) {
  console.log('  ✗ ' + d.key + '  ×' + d.rec.hits + '   ' + d.rec.places[0]);
  for (let i = 1; i < d.rec.places.length; i++) console.log('      ' + d.rec.places[i]);
}
console.log('\n== 还在的钩子（' + alive.length + '）==');
for (const a of alive) {
  console.log('  ✓ ' + a.key.padEnd(34) + ' <- ' + path.basename(path.dirname(path.dirname(a.file))) + '/' + path.basename(a.file));
}
