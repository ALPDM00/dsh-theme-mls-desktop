/* test/billing-ui.test.cjs — 每轮 token 结算块的 jsdom 回归。
 *
 * 它驱动的是**构建产物** client.js（跟真实页面跑的同一份），断言五件事：
 *   1. 只给**已结束**的轮次贴纸条（任务没结束就没有"本轮用时"）；
 *   2. 纸条贴在轮次尾巴的动作行**之前**（读作：任务结束 → 结算 → 操作）；
 *   3. 八行数字 + 本轮费用 + **冻结的用时**（turn/end 之后不再增长）；
 *   4. 展开/收起只改这一张纸条（没有跨会话状态 —— 纸条随转录销毁）；
 *   5. i 角标在（圆的那个，靠主题里的 border-radius 豁免）。
 *
 * Run: `node test/billing-ui.test.cjs`
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const clientSrc = fs.readFileSync(path.join(root, 'client.js'), 'utf8');

const PAGE = `<!DOCTYPE html><html><head></head><body>
  <div id="root"><div><div class="_frame_xk">
    <div class="_centerCol_mv">
      <div class="_chatRoot_ab"><div class="_chatScroll_cd"><div class="_column_ef">
        <div class="_flowItem" data-chat-turn="6" data-chat-flow-kind="turn-process">
          <div class="_msg">上一轮</div>
        </div>
        <div class="_turnTailRoot_gh" data-turn-tail="6">
          <div class="_tailSlot_ij"></div>
          <div class="_actions_kl"><button type="button">copy</button></div>
        </div>
        <div class="_flowItem" data-chat-turn="7" data-chat-flow-kind="turn-process">
          <div class="_msg">这一轮</div>
        </div>
        <div class="_turnTailRoot_gh" data-turn-tail="7">
          <div class="_tailSlot_ij"></div>
          <div class="_actions_kl"><button type="button">copy</button></div>
        </div>
      </div></div></div>
    </div>
  </div></div></div>
</body></html>`;

/** 一轮已结束、一轮还在跑的会话状态。 */
function stateFixture(overrides = {}) {
  const now = Date.now();
  const closed = {
    turn: 7,
    requests: 2,
    startedAt: now - 96_000,
    endedAt: now - 4_000,
    lastAt: now - 4_000,
    closed: true,
    durationMs: 96_000,
    model: 'deepseek-v4-flash',
    cost: 10.04,
    currency: 'CNY',
    unpriced: [],
    totals: { miss: 12114, hit: 84106, write: 0, out: 32240, total: 128460, input: 96220, hitRate: 0.8741 },
    byModel: [{ model: 'deepseek-v4-flash', cost: 10.04, tokens: {}, priced: true }],
    ...overrides,
  };
  const running = {
    turn: 8,
    requests: 1,
    startedAt: now - 3_000,
    endedAt: 0,
    lastAt: now - 1_000,
    closed: false,
    durationMs: 2_000,
    model: 'deepseek-v4-flash',
    cost: 0.0042,
    currency: 'CNY',
    unpriced: [],
    totals: { miss: 100, hit: 10, write: 0, out: 20, total: 130, input: 110, hitRate: 0.0909 },
    byModel: [],
  };
  const session = {
    sessionId: 's-ui',
    requests: 3,
    firstAt: now - 100_000,
    lastAt: now,
    model: 'deepseek-v4-flash',
    cost: 10.05,
    currency: 'CNY',
    unpriced: [],
    totals: {},
    byModel: [],
    turns: [running, closed],
  };
  return {
    plugin: 'dsh-theme-mls-desktop',
    part: 'billing',
    version: 2,
    now,
    peak: { isPeak: false, nextChangeAt: now + 3600e3 },
    today: { day: '2026-10-09', cost: 10.04, totals: {}, byModel: [] },
    recentDays: [],
    // `/state` 的形状：sessions 是全部会账，current 只是"最近有账的那个"的指针
    sessions: [session],
    current: session,
    lastTurn: null,
    runtime: { sessionElapsedMs: 100_000, pluginElapsedMs: 100_000, streaming: true },
    balance: null,
    errors: { ledger: null, balance: null },
  };
}

function runBillingUi(state, options = {}) {
  const dom = new JSDOM(PAGE, { url: 'https://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const win = dom.window;
  if (options.localStorage) {
    for (const [key, value] of Object.entries(options.localStorage)) win.localStorage.setItem(key, value);
  }
  let captured = null;
  win.__ModuleLoader__ = { load: (spec) => { captured = spec; } };
  let cssCaptured = '';
  win.styles = { insert: (css) => { cssCaptured = css; return () => {}; } };
  const fetches = [];
  win.fetch = (url) => {
    fetches.push(String(url));
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(state) });
  };
  win.eval(clientSrc);
  assert.ok(captured, 'client.js should call __ModuleLoader__.load');
  const mod = captured.factory(function () { return {}; });
  const dispose = mod.apply({
    get: (name) => {
      if (name === 'theme') return { overrideTokens: () => () => {} };
      // 「客户端当前显示哪个会话」由 sessions 服务的 list.current 给出（可选）
      if (name === 'sessions') return options.sessions || null;
      return null;
    },
  });
  return { dom, win, dispose, fetches, css: cssCaptured };
}

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  console.log('  ✓ ' + name);
  passed++;
}

(async function main() {
  console.log('dsh-theme-mls-desktop · per-turn settlement UI\n');

  const r = runBillingUi(stateFixture());
  try {
    await settle(60);
    const doc = r.win.document;

    ok('轮询了计费接口', r.fetches.some((u) => u.includes('/dsh-mls-billing/state')));

    const tail7 = doc.querySelector('[data-turn-tail="7"]');
    const tail6 = doc.querySelector('[data-turn-tail="6"]');
    const block = tail7.querySelector('[data-mlsb-turn="7"]');
    ok('已结束的轮次尾巴上贴了结算块', !!block);
    ok('还在跑的轮次（turn 6 不在状态里）没有块', !tail6.querySelector('[data-mlsb-turn]'));
    ok('块贴在动作行之前（任务结束 → 结算 → 操作）',
      block.nextElementSibling === tail7.querySelector('._actions_kl'));

    const text = (key) => {
      const node = block.querySelector('[data-mlsb="turn-' + key + '"]');
      return node ? node.textContent : '(missing)';
    };
    ok('消耗 Token 千分位', text('total') === '128,460');
    ok('输入 / 输出 / 命中 / 未命中', text('input') === '96,220' && text('output') === '32,240' && text('hit') === '84,106' && text('miss') === '12,114');
    ok('缓存命中率一位小数', text('hitRate') === '87.4%');
    ok('本次费用按量级取小数位（明细里那一行）', text('cost') === '¥10.04');
    ok('计费状态 SETTLED', text('status') === 'SETTLED');
    ok('运行时间 = 这一轮的用时（mm:ss）', block.querySelector('[data-mlsb="turn-clock"]').textContent === '01:36');

    // 2026-10-09 第二轮反馈：绿条上不放费用，只留标题，两侧各一个十字
    const head = block.mlsbHead;
    const crosses = [...head.querySelectorAll('.mlsb-cross')];
    ok('绿条只有标题 + 左右各一个十字（没有费用）',
      head.querySelector('.mlsb-turn-title').textContent === 'TOKEN USAGE' &&
      crosses.length === 2 &&
      !head.querySelector('[data-mlsb="turn-cost"]'));
    ok('左十字在左、右十字在右（网格三列）',
      crosses[0].classList.contains('mlsb-left') && crosses[1].classList.contains('mlsb-right'));
    ok('十字是黑色（--mar-accent-ink）',
      /\.mlsb-cross\{[^}]*color:var\(--mar-accent-ink\)/.test(r.css));

    // 2026-10-09 第二轮反馈：i 与它的方框先去掉（代码注释保留）
    ok('任务用时只剩标签与读数（i 角标已按注释停用）',
      block.querySelectorAll('.mlsb-turn-foot > span').length === 2 &&
      !block.querySelector('.mlsb-info') &&
      !/^\.mlsb-info\{/m.test(r.css));

    // 展开 / 收起：两边一起翻，且只改这一张
    head.dispatchEvent(new r.win.MouseEvent('click', { bubbles: true }));
    ok('展开后加 mlsb-open 且两个十字都变减号',
      block.classList.contains('mlsb-open') &&
      crosses.every((c) => c.textContent === '\u2212') &&
      head.getAttribute('aria-expanded') === 'true');
    head.dispatchEvent(new r.win.MouseEvent('click', { bubbles: true }));
    ok('再点一下收起', !block.classList.contains('mlsb-open') && crosses.every((c) => c.textContent === '+'));

    // 2026-10-09 第二轮反馈：消息内居中、圆角拼接、绿条与灰条之间留间隙
    ok('块在消息内居中（左右 auto）', /\.mlsb-turn\{margin:12px auto 0;/.test(r.css));
    ok('展开时绿条下方变直角、接住信息面板',
      /\.mlsb-open \.mlsb-turn-head\{[\s\S]{0,80}?border-radius:var\(--mlsb-radius\) var\(--mlsb-radius\) 0 0!important/.test(r.css));
    ok('信息面板下方是圆角', /\.mlsb-turn-body\{border-radius:0 0 var\(--mlsb-radius\) var\(--mlsb-radius\)!important/.test(r.css));
    ok('绿条与灰条之间留间隙',
      /--mlsb-gap:calc\(5px \* var\(--mlsb-s\)\)/.test(r.css) &&
      /\.mlsb-turn-foot\{[\s\S]{0,220}?margin-top:var\(--mlsb-gap\)/.test(r.css));
    ok('灰条四角是圆角', /\.mlsb-turn-foot\{border-radius:var\(--mlsb-radius\)!important;\}/.test(r.css));

    // 2026-10-09 第四轮反馈：整体放大 0.5 倍（只留 --mlsb-s 一个旋钮）+ 字体回默认
    ok('尺寸只有 --mlsb-s 一个旋钮（1.5 倍）',
      /--mlsb-s:1\.5/.test(r.css) &&
      /width:calc\(268px \* var\(--mlsb-s\)\)/.test(r.css) &&
      /height:calc\(28px \* var\(--mlsb-s\)\)/.test(r.css) &&
      /height:calc\(22px \* var\(--mlsb-s\)\)/.test(r.css) &&
      /--mlsb-radius:calc\(6px \* var\(--mlsb-s\)\)/.test(r.css));
    ok('结算块字体回到默认栈（不再用 Maratype）',
      /\.mlsb-turn-title\{font:800 calc\(11px \* var\(--mlsb-s\)\)\/1 var\(--dsw-font-family\)/.test(r.css) &&
      !/\.mlsb-(turn-title|turn-note)[^{]*\{[^}]*Maratype/.test(r.css));

    // 2026-10-09 第三轮反馈：出现动画 + 展开/收起动画
    ok('出现动画：从中间向两端展开（clip-path，不是 scaleX）',
      /@keyframes mlsb-reveal\{[\s\S]{0,90}?from\{clip-path:inset\(0 50% 0 50%\);\}[\s\S]{0,60}?to\{clip-path:inset\(0 0 0 0\);\}/.test(r.css) &&
      /\.mlsb-turn\{[^}]*animation:mlsb-reveal \.18s/.test(r.css));
    ok('展开/收起走 grid-template-rows 0fr→1fr 过渡（不是 display 切换）',
      /\.mlsb-turn-body\{display:grid;grid-template-rows:0fr;opacity:0;/.test(r.css) &&
      /\.mlsb-turn-body\{[^}]*transition:grid-template-rows .2s/.test(r.css) &&
      /\.mlsb-turn\.mlsb-open \.mlsb-turn-body\{grid-template-rows:1fr;opacity:1;\}/.test(r.css));
    ok('收起态不再是 display:none', !/\.mlsb-turn-body\{display:none/.test(r.css));
    ok('行盒内层（min-height:0 / overflow:hidden）在 DOM 里，八行都在里面',
      !!block.querySelector('.mlsb-turn-body-inner') &&
      block.querySelectorAll('.mlsb-turn-body-inner > .mlsb-row').length === 8);
    ok('reduced-motion 下关掉入场与过渡',
      /prefers-reduced-motion: reduce\)\{[\s\S]{0,240}?\.mlsb-turn\{animation:none;\}/.test(r.css) &&
      /prefers-reduced-motion: reduce\)\{[\s\S]{0,240}?\.mlsb-turn-body,\.mlsb-turn-head\{transition:none;\}/.test(r.css));

    // 用时是冻结的：再过一会儿也不会变（它读的是 turn.durationMs，不是墙上时钟）
    await settle(1200);
    ok('用时冻结（1.2s 后仍是同一读数）',
      block.querySelector('[data-mlsb="turn-clock"]').textContent === '01:36' &&
      doc.querySelectorAll('[data-mlsb-turn="7"]').length === 1);

    // 宿主重渲染：整块尾巴被换掉 → 下一轮巡扫重新贴上，且不重复
    const fresh = doc.createElement('div');
    fresh.className = '_turnTailRoot_gh';
    fresh.setAttribute('data-turn-tail', '7');
    fresh.innerHTML = '<div class="_tailSlot_ij"></div><div class="_actions_kl"><button>copy</button></div>';
    tail7.parentNode.replaceChild(fresh, tail7);
    await settle(1400);
    ok('尾巴被替换后重新贴回（且只贴一张）',
      fresh.querySelectorAll('[data-mlsb-turn="7"]').length === 1 &&
      fresh.querySelector('[data-mlsb-turn="7"]').nextElementSibling === fresh.querySelector('._actions_kl'));
  } finally {
    r.dispose();
    r.dom.window.close();
  }

  // 还没结束的轮次不该有块
  const r2 = runBillingUi(stateFixture());
  try {
    await settle(60);
    const doc2 = r2.win.document;
    const tail8 = doc2.createElement('div');
    tail8.className = '_turnTailRoot_gh';
    tail8.setAttribute('data-turn-tail', '8');
    doc2.querySelector('._column_ef').appendChild(tail8);
    await settle(1400);
    ok('turn/end 还没到的轮次不贴块（没有"本轮用时"可言）', !tail8.querySelector('[data-mlsb-turn="8"]'));
  } finally {
    r2.dispose();
    r2.dom.window.close();
  }

  // 2026-10-09 第四轮反馈（重启后不见）：会话匹配改成精确的 ——
  // 见到「客户端显示的那个会话」就用它，而不是"最近有账的那个"。
  const r3 = runBillingUi(stateFixture(), {
    sessions: { list: { getSnapshot: () => ({ current: 's-ui' }) } },
  });
  try {
    await settle(60);
    ok('sessions.list.current 命中时照常贴（重启后当前这段对话也贴得上）',
      !!r3.win.document.querySelector('[data-mlsb-turn="7"]'));
    ok('轮询把「我正在显示哪个会话」带给宿主（宿主据此回填旧轮次）',
      r3.fetches.some((u) => u.includes('/dsh-mls-billing/state?session=s-ui')));
  } finally {
    r3.dispose();
    r3.dom.window.close();
  }

  const r4 = runBillingUi(stateFixture(), {
    sessions: { list: { getSnapshot: () => ({ current: 's-other' }) } },
  });
  try {
    await settle(60);
    ok('显示的会话与有账的会话不一致时，一张都不贴（不会把 B 的数字贴到 A 的尾巴）',
      !r4.win.document.querySelector('[data-mlsb-turn]'));
  } finally {
    r4.dispose();
    r4.dom.window.close();
  }

  // 主题设置里的「每轮 Token 结算」开关：关掉 = 不贴 + 不轮询
  const r5 = runBillingUi(stateFixture(), { localStorage: { 'mar.billing.v1': '{"on":false}' } });
  try {
    await settle(80);
    ok('开关关掉时不贴纸条，也不去打扰宿主',
      !r5.win.document.querySelector('[data-mlsb-turn]') && r5.fetches.length === 0);
  } finally {
    r5.dispose();
    r5.dom.window.close();
  }

  console.log('\nAll ' + passed + ' billing-ui checks passed.');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
