/* ===========================================================================
 * dsh-theme-mls-desktop — 任务完成动画：引擎（payload 2/2）
 * -----------------------------------------------------------------------------
 * 与启动动画（engine-marathon.js / engine-intro.js）同一套注入契约：全部 DOM
 * 查找都限定在 #dshMarDoneHost 之下，id 前缀 `md-`，暴露为
 * `window.__mbDone = { start, stop, dismiss, cfg, state, seek, resume }`。
 *
 * 四拍时间线（全部毫秒，都是 CFG 里的可调项）：
 *
 *   ① 反向红色 S 型扫屏        RED_LEAD → SWEEP_END（约 1.5s）
 *      启动动画的红扫是 zone0 L→R、zone1 R→L、zone2 L→R（左上起）；这一拍是
 *      **整条路径反过来**：zone2 R→L、zone1 L→R、zone0 R→L —— 右下起、左上收。
 *      分块粒度、块矩形、RED_RISE / RED_HOLD / RED_EXIT 这些系数与启动动画
 *      逐字一致。
 *
 *   ② 矩阵像素定格             MARK_AT → BLACK_AT
 *      **一整块晶格、四种符号、一个尺寸、一格不落**（参数取自用户给的
 *      网格符号测试.html：cell 24 / glyph 12 / line 1.4 / 圆头圆角）：全屏共用同一个
 *      24px 格子（相位与启动动画点阵同一套），**每一格**按"格心落在哪块地盘"画一个
 *      符号 —— 侧栏红十字、输入框红方框、输出文本区墨方框、其余空白墨色实心圆。
 *      边界上直接换符号、不留空档（用户 2026-10-10：整屏就是一个矩阵，不要空缺）。
 *      **矩阵跟着红扫逐块亮起来**：某一块的红一开始溶解，那一块的矩阵就在它底下
 *      淡入 —— 不是等整条红扫完了再整屏跳出来。
 *
 *   ③ 渐变为纯黑               BLACK_AT → TILES_AT
 *      标记整体淡出，只剩满屏黑。
 *
 *   ④ 逐块显示内容 → 白点阵 → 绿横幅   TILES_AT 起
 *      满屏 80px 纯黑方块（与主题"配色切换"那一拍的方块同尺寸、同一套乱序）
 *      **硬切**逐块消失 —— 没有模糊、没有半透明、没有描边（用户 2026-10-10：
 *      不要玻璃质感，直接逐块显示内容，与黑白切换同一套逻辑），露出来的就是
 *      **正常界面**；白点阵（任务完成动画.html 那片会漂移、会闪灭的点阵，透明底）
 *      约 0.5s 内接上；再约 1s 绿色横幅自左向右展开。此后保持不动，等一次
 *      点击或按键。
 *      点阵墨色随配色翻转（白 / 近黑，见 done.css 的 `--md-ink`），否则
 *      「主白 + 绿」下白点会画在白色界面上（不可见）。
 *
 * 关闭：document 捕获阶段的 pointerdown / keydown，任意时刻按下即整段跳过
 * （含还没播完的 ①②③）。这一层始终 pointer-events:none，所以那一次按下不会
 * 被吞掉 —— 它同时抵达用户真正瞄准的元素（与 dsh-theme-endfield 的雷霆大字
 * 同款做法，见其 docs/features.md：给遮罩加 pointer-events:auto 会变成一块
 * 全屏点击黑洞）。
 * ========================================================================= */
(function () {
  'use strict';

  var hostEl = document.getElementById('dshMarDoneHost');
  if (!hostEl) { if (typeof window !== 'undefined') window.__mbDoneBroken = true; return; }
  function q(s) { return hostEl.querySelector(s); }
  var doc = hostEl.ownerDocument || document;

  var scene   = q('#md-scene');
  var sctx    = scene ? scene.getContext('2d') : null;
  var dotsC   = q('#md-dots');
  var dctx    = dotsC ? dotsC.getContext('2d') : null;
  var elTiles = q('#md-tiles');
  var elText  = q('#md-banner-text');
  if (!sctx || !dctx || !elTiles || !elText) {
    if (typeof window !== 'undefined') window.__mbDoneBroken = true;
    return;
  }

  var TAU = Math.PI * 2;

  // ---------------- CONFIG ----------------
  var CFG = {
    // ===== 场：与 engine-marathon.js 同一套面板划分 =====
    // ① 只画 PASS 2 的那些**矩形**（启动动画的红色扫块），所以迷宫、点阵图案、
    // cell 网格都不需要 —— 只要"zone 内按 5 个小块一组分面板"这条规则，
    // 否则扫块的粒度会和启动动画对不上。
    CELL_SIZE: 12,
    TILE_SIZE: 5,
    ZONES: 3,
    PANEL_TW: 5,
    PANEL_SPECIAL_W: 15,

    colorBg:    '#000000',
    colorRed:   '#FF003C',
    // ② 的墨色：那一拍底下是自铺的黑幕（③ 要"渐变为纯黑"），所以两套配色都
    // 读得清，不必跟着配色翻。
    colorPlateInk: '#FFFFFF',
    // ④ 的墨色：点阵浮在**正常界面**上，默认白；done.css 的 `--md-ink` 在
    // 「主白 + 绿」下把它翻成近黑（liveInk() 每 ~30 帧重读一次）。
    colorDotInk:   '#FFFFFF',

    // ===== ① 反向红色 S 型扫屏 =====
    RED_LEAD: 120,   // 第一块红出现前的静默（覆盖层刚挂上时给它一拍）
    RED_SPAN: 500,   // 首块 → 末块红起点的跨度；buildRegions() 会按块数
                     //   重算成 max(500, (TOTAL-1)*20)（与启动动画同一条规则）
    RED_RISE: 180,   // 单块红淡入
    RED_HOLD: 400,   // 单块红保持
    RED_EXIT: 280,   // 单块红溶解回黑
    BACK_IN:  120,   // 单块的黑底淡入（起点 = 该块红起点 − BACK_IN，于是"红到位"
                     //   时它下面的黑刚好不透明：既擦掉上一帧的红、也让红块不会
                     //   半透明地叠在界面上。比块间距（≈50ms）长一档才读得出
                     //   "黑先到、红后到"的擦除感，又不至于让整个 zone 一起变黑）

    // ===== ② 矩阵像素定格 =====
    // 尺寸与启动动画里那套标记**逐字对齐**（用户 2026-10-10："还可以再缩小一点，
    // 与启动动画里蓝扫的大小类似"）：两边都是同一个 24px 格子（= CELL_SIZE 12 ×
    // 启动动画的十字步长 2），符号大小都取"间距 × 0.34" → **8.16px**，连空心/线条
    // 符号的线宽都用同一条公式 `max(0.9, size × 0.20)`（启动动画 engine-marathon 里
    // 十字缩放同样取 0.34、线宽同样取 `Math.max(0.9, size * 0.20)`）。于是启动动画
    // 收尾的标记与任务完成动画的矩阵读起来是同一套像素。
    // **每一格都要有符号**（格心落在哪块地盘就画那块的符号）—— 用户 2026-10-10：
    // "矩阵之间有明显的分界线…整个画面都是一个矩阵，不要哪里有空缺"，
    // 所以这里没有"放不下就留空"那一套，格子一个不落、边界上直接换符号。
    MARK_IN: 350,        // 单块地盘的矩阵淡入（跟着它那一块的红扫走，见 paintScene）
    MARK_HOLD: 600,      // 全屏矩阵铺满后的保持
    UI_CELL: 24,         // 晶格间距（= 启动动画标记的 24px 格子，相位也一致）
    UI_GLYPH_SCALE: 0.34,// 符号外接正方形边长 = UI_CELL × 该值（= 8.16px，与启动动画标记同值）
    UI_DOT_SCALE: 0.30,  // 空白区实心圆的半径 = 符号边长 × 该值（比方框/十字轻一档）
    UI_LINE_MIN: 0.9,    // 空心/线条符号的线宽 = max(该值, 符号边长 × UI_LINE_SCALE)
    UI_LINE_SCALE: 0.20, //   （与启动动画标记的线宽公式完全相同）
    UI_LINE_CAP: 'round',// 圆头圆角的线条符号（与启动动画标记一致）
    UI_LINE_JOIN: 'round',
    UI_BUCKETS: 6,       // 每块地盘的淡入量化档数（每帧 4×6 个 path，足够）

    // ===== ③ 渐变为纯黑 =====
    BLACK_FADE: 900,     // 矩阵整体淡出的时长（用户 2026-10-10：再长一点）
    BLACK_HOLD: 700,     // 淡完之后**纯黑静置**的时长（"多留一点黑屏的时间"）

    // ===== ④ 逐块显示内容 → 白点阵 → 绿横幅 =====
    // NOTE: 名字必须与 ① 的 `TILE_SIZE`（迷宫 tile 边长 = 5）区分开 —— 两者
    // 曾经同名，后者把前者覆盖成 80，面板划分整个塌成 3 条整幅横带
    // （.generated/probe-done-regions.cjs 抓到的就是这一条）。
    REVEAL_TILE: 80,       // 方块边长（CSS px）—— 与主题"配色切换"那一拍一致
    REVEAL_DUR: 520,       // 第一块翻到最后一块翻完
    REVEAL_DOTS_LEAD: 80,  // 方块开始后多久点阵跟上（"连接上"的关键：两者重叠）
    REVEAL_DOTS_IN: 500,   // 点阵淡入
    BANNER_DELAY: 1000,    // 点阵铺满后再等这么久才出横幅
    BANNER_DUR: 500,       // 横幅自左向右展开
    BANNER_TEXT: '//RUN_COMPLETE',

    // ===== 白点阵（原稿 任务完成动画.html 的参数，逐字照搬）=====
    DOT_SPACING: 75,
    DOT_R: 0.8,
    DOT_ALPHA_REST: 0.85,
    DOT_FLICKER_AMP: 0.16,
    DOT_WIND_DIR: 1,
    DOT_WIND_AMP_MAX: 18,
    JIT_FREQ_MIN: 0.02,
    JIT_FREQ_MAX: 0.30,
    FLK_FREQ_MIN: 0.01,
    FLK_FREQ_MAX: 0.35,
    WIND_DEAD: 0.28,
    BLINK_DUR: 90,
    BLINK_GAP_MIN: 2500,
    BLINK_GAP_MAX: 8000,
    BLINK_CLUSTER_P: 0.45,
    BLINK_KILL_TH: 0.12,

    // ===== DOM 锚点 =====
    // sidebar / composer 与启动标记（engine-marathon.js 的 UI_ANCHORS）同一张表：
    // 同一时刻、同一份测量口径，两块动画才落在同一个位置上。
    // transcript 只属于这一拍：`[data-conversation-scroll]` 是对话列自己的转录
    // 滚动区（ui-conversation 的 ConversationRoot 写在它上面的语义属性，比带哈希
    // 的类名稳），兜底才用列容器。
    ANCHORS: {
      sidebar: ['[class*="_quietBars"]', '[class*="_railIn"]', '[class*="_sidebarCol"]'],
      composer: ['[class*="uV2eYG_card"]', '[class*="uV2eYG_root"]',
                 '[class*="composerStack"]', '[class*="composerHero"]'],
      transcript: ['[data-conversation-scroll]', '[class*="_centerCol"]']
    }
  };

  // ---------------- helpers ----------------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  // 确定性乱序（mulberry32 + Fisher-Yates），与 client.template.js 里那套
  // "配色切换"用的 mosaicOrder 逐字一致：看着是散的，实际每次同一顺序，
  // 于是"这一拍看起来不对"可以复现。
  function mosaicOrder(n) {
    var seed = 0x9E3779B9, out = [], i, j, t;
    function rnd() {
      seed = (seed + 0x6D2B79F5) | 0;
      t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    for (i = 0; i < n; i++) out.push(i);
    for (i = n - 1; i > 0; i--) {
      j = Math.floor(rnd() * (i + 1));
      t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  // ---------------- state ----------------
  var W = 0, H = 0, DPR = 1;
  var regions = [];      // 反向 S 顺序
  var TOTAL = 0;
  var t0 = 0, raf = null, running = false;
  var sceneHidden = false, bannerShown = false;
  var tilesBuilt = false, tileNodes = null, tileOpenAt = null, tileOpened = 0;
  var lastFrame = 0;
  var lastRect = { sidebar: null, composer: null, transcript: null };
  var inkCache = null, inkFrames = 0;

  // 时间线。② 不再是"红扫完 → 等一拍 → 整屏矩阵"：矩阵**按地盘跟着红扫逐块淡入**
  // （每块的起点 = 它自己那一下红开始溶解的时刻，见 regionMarkAlpha），所以
  //   MARK_AT   = 第一块开始出矩阵
  //   MARK_DONE = 最后一块的矩阵铺满
  //   BLACK_AT  = 再保持 MARK_HOLD → 开始淡出
  // 第一块 / 最后一块的具体时刻由 buildRegions() 算出来后又调一次本函数。
  function computeTimeline() {
    CFG.SWEEP_END = CFG.RED_LEAD + CFG.RED_SPAN + CFG.RED_RISE + CFG.RED_HOLD + CFG.RED_EXIT;
    if (regions.length) {
      // 有真实块时刻就用真实的（改块数 / 改系数都不会错位）
      var minHold = Infinity, maxDone = -Infinity;
      for (var i = 0; i < regions.length; i++) {
        minHold = Math.min(minHold, regions[i].holdEnd);
        maxDone = Math.max(maxDone, regions[i].holdEnd + CFG.MARK_IN);
      }
      CFG.MARK_AT = minHold;
      CFG.MARK_DONE = maxDone;
    } else {
      // 还没建块（引擎加载时先算一次，只为让 CFG 有个完整形状）
      CFG.MARK_AT = CFG.RED_LEAD + CFG.RED_RISE + CFG.RED_HOLD;
      CFG.MARK_DONE = CFG.SWEEP_END - CFG.RED_EXIT + CFG.MARK_IN;
    }
    CFG.BLACK_AT  = CFG.MARK_DONE + CFG.MARK_HOLD;
    CFG.TILES_AT  = CFG.BLACK_AT + CFG.BLACK_FADE + CFG.BLACK_HOLD;
    CFG.DOTS_AT   = CFG.TILES_AT + CFG.REVEAL_DOTS_LEAD;
    CFG.BANNER_AT = CFG.TILES_AT + CFG.REVEAL_DUR + CFG.BANNER_DELAY;
    CFG.END       = CFG.BANNER_AT + CFG.BANNER_DUR;
  }
  computeTimeline();

  // ===========================================================
  //  ① 场的构建 —— zone 内按 5 个小块分组，与启动动画同一套面板宽度
  // ===========================================================
  function panelWidthsFor(zoneIdx, tcols) {
    var SPW = CFG.PANEL_SPECIAL_W;
    function chunk(tiles) {
      var out = [];
      while (tiles >= CFG.PANEL_TW) { out.push(CFG.PANEL_TW); tiles -= CFG.PANEL_TW; }
      if (tiles > 0) {
        if (out.length) out[out.length - 1] += tiles;
        else out.push(tiles);
      }
      return out;
    }
    if (zoneIdx === 0) {
      // 右上：右侧 15 tiles 宽特殊面板，其余 5/组
      if (tcols <= SPW) return [tcols];
      return chunk(tcols - SPW).concat([SPW]);
    }
    if (zoneIdx === 2) {
      // 下中：中间 15 tiles 宽，两侧 5/组
      if (tcols <= SPW) return [tcols];
      var left = Math.floor((tcols - SPW) / 2);
      var right = tcols - SPW - left;
      return chunk(left).concat([SPW], chunk(right));
    }
    return chunk(tcols);
  }

  function buildRegions() {
    var T = CFG.TILE_SIZE;
    var cellW = CFG.CELL_SIZE;
    var TILE_PAD = CFG.CELL_SIZE / 2;
    var cols = Math.max(8, Math.floor(W / cellW));
    var TCOLS = Math.max(2, Math.floor(cols / T));
    var zoneH = H / CFG.ZONES;
    var byZone = [[], [], []];
    for (var z = 0; z < CFG.ZONES; z++) {
      var widths = panelWidthsFor(z, TCOLS);
      var pcol = 0;
      for (var wi = 0; wi < widths.length; wi++) {
        var w = widths[wi];
        var tcA = pcol, tcB = pcol + w;
        var reg = {
          z: z,
          x0: tcA * T * cellW,
          y0: z * zoneH,
          x1: (tcB >= TCOLS) ? W : Math.min(W, tcB * T * cellW),
          y1: (z + 1) * zoneH
        };
        // 跨 zone 边界各扩半格：红波跨 z=0/1、z=1/2 时不显示纯背景缝
        // （与 engine-marathon 的 buildMaze 同一条规则）。
        if (z > 0) reg.y0 = Math.max(0, reg.y0 - TILE_PAD);
        if (z < CFG.ZONES - 1) reg.y1 = Math.min(H, reg.y1 + TILE_PAD);
        byZone[z].push(reg);
        pcol += w;
      }
    }
    // 反向 S：zone2 R→L、zone1 L→R、zone0 R→L。
    // 启动动画是 zone0 L→R / zone1 R→L / zone2 L→R（左上起），把整条顺序
    // 反过来就是右下起、左上收 —— 即用户要的"与启动动画反过来的 S"。
    var out = [];
    for (var zz = CFG.ZONES - 1; zz >= 0; zz--) {
      var list = byZone[zz].slice();
      var dir = (zz === 1) ? 1 : -1;
      list.sort(function (a, b) { return dir * (a.x0 - b.x0); });
      for (var k = 0; k < list.length; k++) out.push(list[k]);
    }
    for (var o = 0; o < out.length; o++) out[o].order = o;
    regions = out;
    TOTAL = regions.length;

    // 每块自己的四个时刻（系数与启动动画一致）
    var n = Math.max(1, TOTAL - 1);
    CFG.RED_SPAN = Math.max(500, (TOTAL - 1) * 20);
    for (var i = 0; i < TOTAL; i++) {
      var r = regions[i];
      r.redStart = CFG.RED_LEAD + (r.order / n) * CFG.RED_SPAN;
      r.redFull  = r.redStart + CFG.RED_RISE;
      r.holdEnd  = r.redFull + CFG.RED_HOLD;
      r.dissEnd  = r.holdEnd + CFG.RED_EXIT;
      r.backStart = Math.max(0, r.redStart - CFG.BACK_IN);
    }
    computeTimeline();
  }

  function redAlpha(r, t) {
    if (t < r.redStart) return 0;
    if (t < r.redFull) return easeOut(clamp((t - r.redStart) / CFG.RED_RISE, 0, 1));
    if (t < r.holdEnd) return 1;
    if (t < r.dissEnd) return clamp(1 - easeOut((t - r.holdEnd) / CFG.RED_EXIT), 0, 1);
    return 0;
  }

  // ===========================================================
  //  DOM 测量 —— 与 engine-marathon 的 pickRect / composerRect 同一口径
  // ===========================================================
  function hiddenTree(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      var s = window.getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden') return true;
      n = n.parentElement;
    }
    return false;
  }

  function rectOf(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    if (r.right < 0 || r.bottom < 0 ||
        r.left > window.innerWidth || r.top > window.innerHeight) return null;
    return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, hidden: hiddenTree(el) };
  }

  // 两趟：先只收"真的可见"的，都不行才退回"藏着但量得到"的
  // （DSH 在 hero → active 的 settling 相位把 composerSeat 停在 visibility:hidden）。
  function pickRect(key) {
    var list = CFG.ANCHORS[key];
    var fallback = null, i, el, r;
    for (i = 0; i < list.length; i++) {
      el = doc.querySelector(list[i]);
      if (!el) continue;
      r = rectOf(el);
      if (!r) continue;
      if (!r.hidden) return r;
      if (!fallback) fallback = r;
    }
    return fallback;
  }

  // 类名 token 以 `_card` 结尾、并且真的量得到的元素（现役构建 RlGAzG_card）
  function cardIn(scope) {
    if (!scope || !scope.querySelectorAll) return null;
    var els = scope.querySelectorAll('[class*="_card"]');
    var fallback = null;
    for (var i = 0; i < els.length; i++) {
      var cls = els[i].className;
      if (typeof cls !== 'string') continue;      // SVG 的 className 是 SVGAnimatedString
      var tok = cls.split(/\s+/), hit = false;
      for (var j = 0; j < tok.length; j++) {
        if (/_card$/.test(tok[j])) { hit = true; break; }
      }
      if (!hit) continue;
      var r = rectOf(els[i]);
      if (!r) continue;
      if (!r.hidden) return r;
      if (!fallback) fallback = r;
    }
    return fallback;
  }

  function composerRect() {
    var r = cardIn(doc.querySelector('[class*="composerStack"]')) ||
            cardIn(doc.querySelector('[class*="composerHero"]'));
    if (r) return r;
    return pickRect('composer');
  }

  // 输出文本区域 = 转录滚动区 − 输入卡那一条 − 侧栏的地盘。
  // 输入卡 sticky 在滚动区底部，它属于"输入框"那一块红色方框，不该再被白色
  // 方框盖一遍（否则交界上两层格子会咬在一起）。
  function transcriptRect(sidebar, composer) {
    var r = pickRect('transcript');
    if (!r) return null;
    var x0 = r.x0, y1 = r.y1;
    if (sidebar && sidebar.x1 > x0 && sidebar.x1 < r.x1) x0 = sidebar.x1;
    if (composer && composer.y0 > r.y0 && composer.y0 < r.y1) y1 = Math.min(y1, composer.y0 - 8);
    if (r.x1 - x0 < 40 || y1 - r.y0 < 40) return null;
    return { x0: x0, y0: r.y0, x1: r.x1, y1: y1 };
  }

  // 每帧现量；选择器全部落空时退回上一帧量到的矩形（侧栏在指针进入时会摘掉
  // `_quietBars`，那一帧不该整块消失）。
  function markRects() {
    var sb = pickRect('sidebar');
    if (sb) lastRect.sidebar = sb; else sb = lastRect.sidebar;
    var cp = composerRect();
    if (cp) lastRect.composer = cp; else cp = lastRect.composer;
    var tr = transcriptRect(sb, cp);
    if (tr) lastRect.transcript = tr; else tr = lastRect.transcript;
    return { sidebar: sb, composer: cp, transcript: tr };
  }

  function pointIn(x, y, r) {
    return !!r && x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
  }

  // ===========================================================
  //  ② 矩阵像素 —— 一整块晶格，四种符号，一个尺寸，**一格不落**
  // ===========================================================
  // 地盘编码（避免每格分配对象）：
  //   0 空白（墨实心圆）  1 侧栏（红十字）  2 输入框（红方框）  3 输出区（墨方框）
  var TURF_BLANK = 0, TURF_SIDEBAR = 1, TURF_COMPOSER = 2, TURF_TRANSCRIPT = 3;

  // 格心落在哪块地盘就归谁（四块地盘互不重叠，判的就是一个点）。
  // **不再判"符号放不放得下"**：放不下就留空会在 UI 边界上留下一条一条空档，
  // 看上去就是"矩阵之间有明显分界线"（用户 2026-10-10）。现在边界上直接换符号，
  // 整屏是一个连续矩阵。
  function turfAt(x, y, rects) {
    if (pointIn(x, y, rects.sidebar)) return TURF_SIDEBAR;
    if (pointIn(x, y, rects.composer)) return TURF_COMPOSER;
    if (pointIn(x, y, rects.transcript)) return TURF_TRANSCRIPT;
    return TURF_BLANK;
  }

  // 这一格所在的那一块（红扫面板）此刻的"矩阵进度"：那一块的红一开始溶解，它的
  // 矩阵就跟着淡入。所以矩阵是**跟着红扫一块块亮起来**的，而不是等整条红扫完了
  // 再整屏跳出来（用户 2026-10-10："红扫后应该就可以逐渐看到"）。
  function regionMarkAlpha(x, y, t) {
    for (var i = 0; i < regions.length; i++) {
      var r = regions[i];
      if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) {
        return clamp((t - r.holdEnd) / CFG.MARK_IN, 0, 1);
      }
    }
    return 0;
  }

  // 每格的进度量化成 UI_BUCKETS 档；一趟扫描按（符号种类 × 档）分组，之后每档
  // 一次 stroke/fill —— 既保证"一格一个符号"，又不必为每格单独落笔。
  var matrixAcc = null;

  function drawMatrix(t, rects, fade) {
    if (fade <= 0) return;
    var g = sctx;
    var gs = CFG.CELL_SIZE;
    var cell = CFG.UI_CELL;
    var size = cell * CFG.UI_GLYPH_SCALE;
    var half = size / 2;
    var dotR = size * CFG.UI_DOT_SCALE;
    // 线宽与启动动画的标记同一条公式
    var lw = Math.max(CFG.UI_LINE_MIN, size * CFG.UI_LINE_SCALE);
    var NB = Math.max(1, CFG.UI_BUCKETS | 0);
    var KINDS = 4;                      // 0 红十字 / 1 红方框 / 2 墨方框 / 3 墨实心圆
    if (!matrixAcc) {
      matrixAcc = [];
      for (var mk = 0; mk < KINDS * NB; mk++) matrixAcc.push([]);
    }
    for (var mz = 0; mz < matrixAcc.length; mz++) matrixAcc[mz].length = 0;
    // 格心相位 = 启动动画点阵那一套（…, 6, 18, 30 …）里每 2 格取一个；
    // 右边/下边多扫一格，好让最后那一列的符号也够到视口边缘。
    for (var y = gs / 2; y <= H + gs / 2; y += cell) {
      for (var x = gs / 2; x <= W + gs / 2; x += cell) {
        var turf = turfAt(x, y, rects);
        var prog = regionMarkAlpha(x, y, t);
        if (prog <= 0.02) continue;
        var b = Math.min(NB - 1, Math.max(0, Math.ceil(prog * NB) - 1));
        var kind = turf === TURF_SIDEBAR ? 0
                 : turf === TURF_COMPOSER ? 1
                 : turf === TURF_TRANSCRIPT ? 2 : 3;
        matrixAcc[kind * NB + b].push(x, y);
      }
    }
    g.lineWidth = lw;
    g.lineCap = CFG.UI_LINE_CAP;
    g.lineJoin = CFG.UI_LINE_JOIN;
    for (var k = 0; k < KINDS; k++) {
      for (var bi = 0; bi < NB; bi++) {
        var list = matrixAcc[k * NB + bi];
        if (!list.length) continue;
        g.globalAlpha = ((bi + 1) / NB) * fade;
        g.beginPath();
        for (var n = 0; n < list.length; n += 2) {
          var px = list[n], py = list[n + 1];
          if (k === 0) {
            g.moveTo(px - half, py); g.lineTo(px + half, py);
            g.moveTo(px, py - half); g.lineTo(px, py + half);
          } else if (k === 3) {
            g.moveTo(px + dotR, py);
            g.arc(px, py, dotR, 0, TAU);
          } else {
            g.rect(px - half, py - half, half * 2, half * 2);
          }
        }
        if (k === 0 || k === 1) {
          g.strokeStyle = CFG.colorRed;
          g.stroke();
        } else if (k === 2) {
          g.strokeStyle = CFG.colorPlateInk;
          g.stroke();
        } else {
          g.fillStyle = CFG.colorPlateInk;
          g.fill();
        }
      }
    }
    g.globalAlpha = 1;
  }

  // ===========================================================
  //  白点阵（原稿 任务完成动画.html 的画布，去掉 #04060a 底色、暗角与扫描线）
  //  底色去掉后它才是一层**透明**的遮罩：正常界面在它之下。
  //  墨色随配色翻转（liveInk），「主白 + 绿」下才不会把白点画在白界面上。
  // ===========================================================
  var dotRows = [];
  var jitPhases = null, flkPhases = null, blinkPhase = null, blinkReadyAt = null;
  var dotsCols = 0, dotsRows = 0;

  function liveInk() {
    if (inkCache && inkFrames > 0) { inkFrames--; return inkCache; }
    inkFrames = 30;   // 约每半秒重读一次：遮罩期间切了配色也跟着走
    var v = '';
    try { v = window.getComputedStyle(hostEl).getPropertyValue('--md-ink') || ''; } catch (e) { v = ''; }
    v = v.trim();
    inkCache = v || CFG.colorDotInk;
    return inkCache;
  }

  function buildDotGrid() {
    dotRows = [];
    dotsCols = Math.max(2, Math.floor(W / CFG.DOT_SPACING) + 1);
    dotsRows = Math.max(2, Math.floor(H / CFG.DOT_SPACING) + 1);
    var offX = (W - (dotsCols - 1) * CFG.DOT_SPACING) / 2;
    var offY = (H - (dotsRows - 1) * CFG.DOT_SPACING) / 2;
    for (var r = 0; r < dotsRows; r++) {
      var line = [];
      for (var c = 0; c < dotsCols; c++) {
        line.push({ x: offX + c * CFG.DOT_SPACING, y: offY + r * CFG.DOT_SPACING });
      }
      dotRows.push(line);
    }
    jitPhases = new Float32Array(dotsRows);
    flkPhases = new Float32Array(dotsRows);
    for (var i = 0; i < dotsRows; i++) {
      jitPhases[i] = Math.random() * TAU;
      flkPhases[i] = Math.random() * TAU;
    }
    var total = dotsCols * dotsRows;
    blinkPhase = new Float32Array(total);
    blinkReadyAt = new Float32Array(total);
    for (var k = 0; k < total; k++) {
      blinkPhase[k] = -1;
      blinkReadyAt[k] = Math.random() * CFG.BLINK_GAP_MAX;
    }
  }

  function rowStrength(r, now) {
    var t = now * 0.001;
    var s =
      Math.sin(t * 0.41 + r * 0.09) * 0.55 +
      Math.sin(t * 0.23 + r * 0.17) * 0.30 +
      Math.sin(t * 0.67 + r * 0.31) * 0.15;
    var v = (s + 1) * 0.5;
    if (v <= CFG.WIND_DEAD) return 0;
    v = (v - CFG.WIND_DEAD) / (1 - CFG.WIND_DEAD);
    return v * v;
  }

  function startBlink(r, c, now) {
    var idx = r * dotsCols + c;
    blinkPhase[idx] = 0;
    blinkReadyAt[idx] = now + CFG.BLINK_GAP_MIN +
                        Math.random() * (CFG.BLINK_GAP_MAX - CFG.BLINK_GAP_MIN);
    if (Math.random() < CFG.BLINK_CLUSTER_P) {
      var dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      var count = 1 + (Math.random() < 0.35 ? 1 : 0);
      for (var k = 0; k < count; k++) {
        var d = dirs[(Math.random() * 4) | 0];
        var nr = r + d[0], nc = c + d[1];
        if (nr < 0 || nr >= dotsRows || nc < 0 || nc >= dotsCols) continue;
        var nidx = nr * dotsCols + nc;
        if (blinkPhase[nidx] >= 0) continue;
        if (now < blinkReadyAt[nidx]) continue;
        blinkPhase[nidx] = 0;
        blinkReadyAt[nidx] = now + CFG.BLINK_GAP_MIN +
                             Math.random() * (CFG.BLINK_GAP_MAX - CFG.BLINK_GAP_MIN);
      }
    }
  }

  function stepDotField(dt, now) {
    if (!dotsRows) return;
    for (var r = 0; r < dotsRows; r++) {
      var s = rowStrength(r, now);
      var jf = CFG.JIT_FREQ_MIN + (CFG.JIT_FREQ_MAX - CFG.JIT_FREQ_MIN) * s;
      var ff = CFG.FLK_FREQ_MIN + (CFG.FLK_FREQ_MAX - CFG.FLK_FREQ_MIN) * s;
      jitPhases[r] += jf * dt;
      flkPhases[r] += ff * dt;
      var base = r * dotsCols;
      for (var c = 0; c < dotsCols; c++) {
        var idx = base + c;
        if (blinkPhase[idx] >= 0) {
          blinkPhase[idx] += dt / CFG.BLINK_DUR;
          if (blinkPhase[idx] >= 1) blinkPhase[idx] = -1;
        } else if (now >= blinkReadyAt[idx]) {
          startBlink(r, c, now);
        }
      }
    }
  }

  function drawDotField(now, fade) {
    var g = dctx;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!dotsRows || fade <= 0) return;
    g.fillStyle = liveInk();
    for (var r = 0; r < dotsRows; r++) {
      var s = rowStrength(r, now);
      var s2 = s * s;
      var offset = CFG.DOT_WIND_DIR * CFG.DOT_WIND_AMP_MAX * s2 * Math.sin(jitPhases[r]);
      var alpha = CFG.DOT_ALPHA_REST + CFG.DOT_FLICKER_AMP * s * Math.sin(flkPhases[r]);
      if (alpha < 0.05) alpha = 0.05;
      if (alpha > 0.98) alpha = 0.98;
      var line = dotRows[r];
      var base = r * dotsCols;
      g.globalAlpha = alpha * fade;
      g.beginPath();
      for (var c = 0; c < dotsCols; c++) {
        if (blinkPhase[base + c] >= 0) continue;
        var x = line[c].x + offset, y = line[c].y;
        g.moveTo(x + CFG.DOT_R, y);
        g.arc(x, y, CFG.DOT_R, 0, TAU);
      }
      g.fill();
      for (var c2 = 0; c2 < dotsCols; c2++) {
        var bp = blinkPhase[base + c2];
        if (bp < 0) continue;
        var k = Math.sin(Math.PI * bp);
        var a = 1 - k;
        if (a < CFG.BLINK_KILL_TH) continue;
        var x2 = line[c2].x + offset, y2 = line[c2].y;
        g.globalAlpha = alpha * a * fade;
        g.beginPath();
        g.arc(x2, y2, CFG.DOT_R, 0, TAU);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  // ===========================================================
  //  ④ 逐块显示内容 —— 硬切方块，JS 驱动（所以 seek() 也是精确的）
  // ===========================================================
  // 每块自己一个"翻开时刻"，按 mosaicOrder 的乱序在 REVEAL_DUR 内铺开；翻开 =
  // 这一块不再挡住下面的东西（visibility:hidden）。**没有**淡出、模糊或描边 ——
  // 与「配色切换」/设置页马赛克同一套"逐块硬切"逻辑（用户 2026-10-10 明确要求
  // 去掉玻璃质感）。方块起始就是纯黑，与上一拍画布上的黑幕逐像素接得上。
  function buildTiles() {
    tilesBuilt = true;
    var side = CFG.REVEAL_TILE;
    var cols = Math.max(1, Math.ceil(W / side));
    var rows = Math.max(1, Math.ceil(H / side));
    var total = cols * rows;
    var order = mosaicOrder(total);
    var frag = doc.createDocumentFragment();
    tileNodes = new Array(total);
    tileOpenAt = new Float64Array(total);
    for (var i = 0; i < total; i++) {
      var tile = order[i];
      var node = doc.createElement('i');
      var c = tile % cols, r = Math.floor(tile / cols);
      node.style.left = (c * side) + 'px';
      node.style.top = (r * side) + 'px';
      node.style.width = (side + 1) + 'px';
      node.style.height = (side + 1) + 'px';
      frag.appendChild(node);
      tileNodes[i] = node;
      tileOpenAt[i] = CFG.TILES_AT + (i / Math.max(1, total - 1)) * CFG.REVEAL_DUR;
    }
    elTiles.appendChild(frag);
    tileOpened = 0;
  }

  function openTiles(t) {
    if (!tilesBuilt) return;
    while (tileOpened < tileNodes.length && tileOpenAt[tileOpened] <= t) {
      tileNodes[tileOpened].className = 'md-off';
      tileOpened++;
    }
  }

  function dropTiles() {
    if (!tilesBuilt) return;
    tilesBuilt = false;
    tileNodes = null;
    tileOpenAt = null;
    tileOpened = 0;
    while (elTiles.firstChild) elTiles.removeChild(elTiles.firstChild);
  }

  // ===========================================================
  //  RENDER
  // ===========================================================
  // 画布是三层的，每帧按 黑底 → 矩阵 → 红块 的顺序重画（整块画布不 clear）：
  //   ① 黑底逐块累加，不透明的那一层同时擦掉上一帧的红 —— 与 engine-marathon 的
  //      PASS 1 完全同一套语义；
  //   ② 矩阵跟着红扫**逐块**淡入：红扫走到哪一块，那一块的矩阵就在它底下亮起来
  //      （用户 2026-10-10："红扫后应该就可以逐渐看到"）；
  //   ③ 红块最后画：没扫完的块仍然被红盖着，zone 边界那 12px 重叠带也永远由红赢。
  function drawSweepBack(t) {
    var g = sctx;
    var i, r;
    for (i = 0; i < regions.length; i++) {
      r = regions[i];
      var ba = clamp((t - r.backStart) / CFG.BACK_IN, 0, 1);
      if (ba <= 0) continue;
      g.globalAlpha = ba;
      g.fillStyle = CFG.colorBg;
      g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    }
    g.globalAlpha = 1;
  }

  function drawSweepRed(t) {
    var g = sctx;
    for (var i = 0; i < regions.length; i++) {
      var r = regions[i];
      var ra = redAlpha(r, t);
      if (ra <= 0.02) continue;
      g.globalAlpha = ra;
      g.fillStyle = CFG.colorRed;
      g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    }
    g.globalAlpha = 1;
  }

  function hideScene() {
    sceneHidden = true;
    scene.style.display = 'none';
  }

  function showBanner() {
    bannerShown = true;
    // 文案已在 start() 写进去了；这里只负责展开（corner lines 走 CSS 延迟）
    hostEl.classList.add('md-banner');
  }

  function phaseAt(t) {
    if (t < CFG.MARK_AT) return 'sweep';
    if (t < CFG.BLACK_AT) return 'marks';
    if (t < CFG.TILES_AT) return 'black';
    if (t < CFG.BANNER_AT) return 'tiles';
    if (t < CFG.END) return 'banner';
    return 'hold';
  }

  // 一幅画：时间线上的 t 对应的画面。拆出来是为了给复核脚本一个确定性的
  // `seek()` —— 逐帧累加出来的黑幕必须按同样的小步长重放。
  function paint(t, dt) {
    if (!sceneHidden) {
      sctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      var rects = markRects();
      var fade = clamp((t - CFG.BLACK_AT) / CFG.BLACK_FADE, 0, 1);
      drawSweepBack(t);
      drawMatrix(t, rects, 1 - fade);
      drawSweepRed(t);
      // 换层不用淡入淡出：方块起始就是**纯黑**，与画布上那片黑逐像素接得上，
      // 所以先把方块铺好、再把画布摘掉，屏幕上没有跳变。
      if (t >= CFG.TILES_AT) {
        if (!tilesBuilt) buildTiles();
        hideScene();
      }
    } else if (tilesBuilt) {
      openTiles(t);
      if (t >= CFG.TILES_AT + CFG.REVEAL_DUR + 120) dropTiles();
    }

    if (t >= CFG.DOTS_AT) {
      stepDotField(dt, t);
      drawDotField(t, clamp((t - CFG.DOTS_AT) / CFG.REVEAL_DOTS_IN, 0, 1));
    }
    if (t >= CFG.BANNER_AT && !bannerShown) showBanner();
  }

  function render(now) {
    if (!lastFrame) lastFrame = now;
    var dt = now - lastFrame;
    lastFrame = now;
    if (dt > 50) dt = 50;
    paint(now - t0, dt);
    raf = requestAnimationFrame(render);
  }

  // ---------------- resize ----------------
  var resizing = false;
  function onResize() {
    if (resizing) return;
    resizing = true;
    requestAnimationFrame(function () { resize(); resizing = false; });
  }

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    var cvs = [scene, dotsC];
    for (var i = 0; i < cvs.length; i++) {
      cvs[i].width  = W * DPR;
      cvs[i].height = H * DPR;
      cvs[i].style.width  = W + 'px';
      cvs[i].style.height = H + 'px';
    }
    sctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    dctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // canvas.width 赋值会清空后备缓冲：累加出来的那一层黑幕必须重铺。
    if (running && !sceneHidden) sctx.clearRect(0, 0, W, H);
    buildRegions();
    buildDotGrid();
    // 方块按视口算，缩放后必须重铺（只有真的已经进入那一拍时才重建）
    if (running && t0 && performance.now() - t0 >= CFG.TILES_AT) {
      dropTiles();
      buildTiles();
    }
  }

  // ---------------- 关闭 ----------------
  // 捕获阶段 + pointerdown：一个事件覆盖鼠标/触摸/触控笔，按下即消失；用捕获
  // 阶段是因为菜单、下拉、拖拽手柄常在自己的处理器里 stopPropagation，冒泡
  // 阶段听不到那些按下。这一层始终 pointer-events:none，所以那一次按下**同时**
  // 完成两件事：关掉动画，并正常抵达用户真正瞄准的元素。
  function onDismiss() { dismiss(); }

  function bindDismiss() {
    doc.addEventListener('pointerdown', onDismiss, true);
    doc.addEventListener('keydown', onDismiss, true);
  }
  function unbindDismiss() {
    doc.removeEventListener('pointerdown', onDismiss, true);
    doc.removeEventListener('keydown', onDismiss, true);
  }

  function dismiss() {
    if (!running) return;
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    unbindDismiss();
    hostEl.classList.add('md-gone');
    setTimeout(function () {
      if (typeof window.__mbDoneFinish === 'function') {
        try { window.__mbDoneFinish(); } catch (e) {}
      }
    }, 200);
  }

  // ---------------- LIFECYCLE ----------------
  // 只挂监听、不做任何绘制：真正的开始由 client.template.js 在触发时调用 start()
  // （与 engine-marathon 的 resize()/start() 分工一致）。
  window.addEventListener('resize', onResize);
  resize();

  // 把这一层恢复成"第一帧之前"：时间线里所有一次性副作用（换层、横幅、方块）
  // 都必须回退，两张画布都必须清空 —— 累加语义下，一帧残留的红就足以让后面
  // 每一拍的画面都对不上。start() 与复核用的 seek() 共用它。
  function resetScene() {
    sceneHidden = false; bannerShown = false;
    lastFrame = 0;
    lastRect = { sidebar: null, composer: null, transcript: null };
    hostEl.classList.remove('md-banner', 'md-gone');
    scene.style.display = '';
    dropTiles();
    buildRegions();
    buildDotGrid();
    sctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    sctx.clearRect(0, 0, W, H);
    dctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    dctx.clearRect(0, 0, W, H);
  }

  function start(opts) {
    if (running) return;
    var o = opts || {};
    if (typeof o.text === 'string' && o.text.length) CFG.BANNER_TEXT = o.text;
    // 文案在 start() 就写进 DOM，而不是等横幅展开那一拍才写：横幅的
    // clip-path 从起点就开始往右推，晚一帧写就会闪出上一轮（或 payload 默认）
    // 的那行字。
    elText.textContent = CFG.BANNER_TEXT;
    running = true;
    inkFrames = 0;   // 强制重读一次 --md-ink（配色可能在上一轮之后被切过）
    resetScene();
    bindDismiss();
    t0 = performance.now();
    raf = requestAnimationFrame(render);
  }

  function stop() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    unbindDismiss();
  }

  window.__mbDone = {
    start: start,
    stop: stop,
    dismiss: dismiss,
    cfg: CFG,
    // 复核脚本用的只读状态（.generated/verify-done.cjs）：进度、当前拍、四块地盘
    // 的真实测量值、点阵墨色、方块翻开进度。生产代码不读它。
    state: function () {
      var t = running ? (performance.now() - t0) : -1;
      return {
        t: t,
        phase: running ? phaseAt(t) : 'idle',
        CFG: CFG,
        W: W, H: H, TOTAL: TOTAL,
        rects: markRects(),
        regions: regions,
        ink: liveInk(),
        tiles: { built: tilesBuilt, total: tileNodes ? tileNodes.length : 0, opened: tileOpened }
      };
    },
    // TEST-ONLY（只被 .generated/verify-done.cjs 调用）：先把这一层复位，再按
    // 16ms 小步把时间线重放到 target，随后把 rAF 停住并冻结这一帧（否则 rAF
    // 会立刻用"真实的"（更早的）时间覆盖它）。seeking 之后可以 resume() 继续。
    seek: function (target) {
      if (!running) return false;
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      resetScene();
      var step = 16, tt;
      for (tt = step; tt <= target; tt += step) paint(tt, step);
      if (tt - step < target) paint(target, step);
      t0 = performance.now() - target;
      lastFrame = 0;
      return true;
    },
    resume: function () {
      if (!running || raf) return false;
      lastFrame = 0;
      raf = requestAnimationFrame(render);
      return true;
    }
  };
  if (typeof window !== 'undefined') window.__mbDoneReady = true;
})();
