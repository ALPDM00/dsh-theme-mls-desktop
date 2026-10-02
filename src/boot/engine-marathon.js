/* ===========================================================================
 * dsh-theme-marathon — Boot payload: marathon stage engine
 * -----------------------------------------------------------------------------
 * Extracted from the standalone boot animation (启动动画.html) and adapted for
 * in-page injection:
 *   - every DOM lookup is scoped under #dshMarBootHost (ids are `mb-` prefixed)
 *   - HUD stays in the DOM but is CSS-hidden (display:none) — the engine may
 *     keep updating it without ever throwing on a null element
 *   - Space/Enter/click-to-replay bindings are REMOVED: inside the harness the
 *     overlay must never swallow keystrokes or clicks meant for the app
 *   - when the timeline reaches its end the loop freezes the final frame,
 *     cancels its rAF, detaches its resize listener and calls
 *     window.__mbBootDone() so the host driver can fade the overlay out
 *   - exposed as window.__mbMarathon = { start, stop, cfg }
 *
 * Timeline: intro runs ~7.1s first (engine-intro.js), then start() begins this
 * ~2.9-3.1s sequence.
 * ========================================================================= */
(function () {
  'use strict';

  // ---------------- DOM (scoped to the injected host) ----------------
  var hostEl = document.getElementById('dshMarBootHost');
  if (!hostEl) { if (typeof window !== 'undefined') window.__mbMarathonBroken = true; return; }
  function q(s) { return hostEl.querySelector(s); }

  var canvas    = q('#mb-canvas');
  var ctx       = canvas ? canvas.getContext('2d') : null;
  if (!ctx) { if (typeof window !== 'undefined') window.__mbMarathonBroken = true; return; }
  var elReadout = q('#mb-readout');
  var elLog     = q('#mb-log');
  var elStatus  = q('#mb-status-text');
  var elProg    = q('#mb-progress-fill');
  var elLockup  = q('#mb-lockup');
  var elReplay  = q('#mb-replay');

  // ---------------- CONFIG ----------------
  var CFG = {
    // dense grid (from reference)
    COLS: 200,
    ROWS_PER_ZONE: 18,
    ZONES: 3,

    // square cell size (px) — grid is perfectly square, no jitter.
    // Matches the reference's 12px radial-gradient dot matrix.
    // COLS / ROWS_PER_ZONE are derived from this at resize() so the
    // grid stays square on any viewport.
    CELL_SIZE: 12,

    // ===== 迷宫结构（递归回溯 + 5×5 tile）=====
    TILE_SIZE: 5,            // 1 个小方块 = 5×5 cells = 25 点阵
    MAZE_PATH_RATIO: 0.70,   // 路面 tile 比例（DOT 70%，墙 30%）
    MAZE_X_RATIO: 2/3,       // 墙 tile 中 X:PIN = 2:1

    // ===== 面板（大块）：动画闪烁单位 =====
    // 大块 = PANEL_TW×PANEL_TW tiles（25 个小块一起闪烁）；每 zone = 1 行面板。
    // 右上（zone 0）与下中（zone 2）放 PANEL_SPECIAL_W 宽的特殊面板，其余按 5 分组。
    PANEL_TW: 5,             // 正常面板宽度（tiles）
    PANEL_SPECIAL_W: 15,     // 特殊面板宽度（tiles）：右上 / 下中

    // glyph patterns
    PATTERN_COUNT: 3,  // 迷宫：0 DOT(路面), 1 X(墙壁), 2 PIN(墙壁)

    // glyph size & style（与网格符号测试页对齐：cell=24, scale=0.5, line=3.0）
    GLYPH_SCALE: 0.90,   // 符号大小 = CELL_SIZE × GLYPH_SCALE（=10.8）
    PIN_SCALE: 0.20,     // 小圆点 pin 半径 = size × PIN_SCALE（=2.4）
    LINE_WIDTH: 1.8,     // 空心/线条符号线宽（px，绝对值）

    // colors
    colorBg:    '#000000',
    colorBlue:  '#4D6CFE',   // 纯蓝背景（衔接前面的 solid-bg）
    colorLime:  '#C0FE04',
    colorRed:   '#FF003C',
    colorGray:  '#4D6CFE',   // 蓝色点阵
    colorFlash: '#FFFFFF',

    // static background dot-matrix (always underneath)
    // Aligned to CELL_SIZE so bg dots sit on the same grid as the cells.
    BG_SPACING: 12,
    BG_RADIUS: 1.0,
    BG_ALPHA: 0.18,

    // timeline (ms) — tuned for snappy feel
    PRE_DELAY:   200,
    DOT_START:   400,
    DOT_SPAN:    1000,
    DOT_FLASH:   20,     // per-region white flash（越小越快）
    DOT_SETTLE:  40,    // per-region settle to gray（越小越快）

    RED_START:   900,
    RED_SPAN:    800,
    RED_RISE:    180,    // per-region fade-in
    RED_HOLD:    400,    // per-region hold
    RED_EXIT:    280,    // per-region dissolve
    RED_END_PAD: 250,

    // ===== 结尾：贴在 UI 上的故障标记（侧栏十字 + 输入框填充块）=====
    // 十字不再贴屏幕四边，而是铺在左侧栏矩形内（与迷宫用同一套 12px 网格）；
    // 输入框被一片**小方框**铺满（同一套网格、同一档尺寸）。扫完后标记常亮保持 UI_HOLD，再与整块黑幕同时淡出
    // —— 标记按 UI_MARK_LEAD 倍速先走，界面从黑里整体升起。
    UI_ANCHORS: {
      // 侧栏根元素在指针进入侧栏时会摘掉 _quietBars，打开会话后更是整个换掉
      // （真机取证 .generated/probe-bgwho.cjs：active 相位侧栏根只剩 _root）。
      // 所以兜底一定是 _sidebarCol 本身 —— 两个相位都在，矩形都是整列。
      sidebar:  ['[class*="_quietBars"]', '[class*="_railIn"]', '[class*="_sidebarCol"]'],
      // 输入框：这两个旧锚点都不对。
      //  hero 相位下 composerHero/composerStack 是**同一个**外层 div，比卡片高 92px
      //  且左右各宽 16px —— 方框于是盖在一段空白上；
      //  打开会话后 composerHero 直接不存在，composerStack 变成整列宽 1310 的条带
      //  （卡片只有 780 宽）—— 方框横跨半个屏幕，这就是"对话框下移了"看到的现象。
      // DSH 自己的输入框是 uV2eYG_card（uV2eYG_root 是它的居中容器，打开会话后同样
      // 铺满整列，只用它仍会盖住卡片两侧的空白），故按 卡片 → 根 → 栈 → 外层 取第一个
      // 可用的。真机数据：hero 卡片 780x118@y471，active 卡片 780x94@y854。
      composer: ['[class*="uV2eYG_card"]', '[class*="uV2eYG_root"]',
                 '[class*="composerStack"]', '[class*="composerHero"]']
    },
    UI_CROSS_STEP: 2,       // 十字间距 = CELL_SIZE × 该值（1=12px，2=24px）
    UI_CROSS_DENSITY: 1,    // 网格里实际画的比例（1 = 全铺，0.5 = 随机一半）—— 十字与方框共用
    UI_CROSS_SCALE: 0.34,   // 十字臂长 = 间距 × 该值
    UI_BOX_SCALE: 0.34,     // 方框边长同公式（边长 = 间距 × 该值 × 1.7，与十字同档大小）
    UI_BOX_PAD: 0,          // 方框网格相对输入框矩形外扩（px，可为负）
    UI_MARK_ALPHA: 0.9,     // 标记最大不透明度
    UI_MARK_IN: 350,        // 标记淡入时长（从 MARK_AT 起）
    UI_HOLD: 400,           // 红扫结束后标记常亮保持
    UI_FADE: 620,           // 最后一拍：黑幕淡出时长
    UI_MARK_LEAD: 1.7,      // 标记淡出速度 = 黑幕的该倍数（>1 = 十字先走）
  };

  // derived: end of the last red sweep -> hold the marks -> one final cross-fade
  function computeTimeline() {
    CFG.SWEEP_END = CFG.RED_START + CFG.RED_SPAN + CFG.RED_RISE + CFG.RED_HOLD + CFG.RED_EXIT;
    CFG.LOCKUP_AT = CFG.SWEEP_END + CFG.RED_END_PAD;   // HUD / status text timing
    CFG.MARK_AT   = CFG.RED_START + 100;               // marks arrive with the red
    CFG.FADE_AT   = CFG.SWEEP_END + CFG.UI_HOLD;       // final cross-fade starts
    CFG.END       = CFG.FADE_AT + CFG.UI_FADE;
  }
  computeTimeline();
  // NOTE: no per-region "hole punching" any more (2026-09-20). The plate — blue
  // field + black slabs + red sweep — stays opaque end to end, and the ONE
  // reveal beat is the final cross-fade: the whole plate dissolves uniformly
  // toward the live app (界面整体淡入) while the UI-anchored marks leave first.

  // ---------------- glyph pattern constants ----------------
  var PAT = { DOT: 0, X: 1, PIN: 2 };

  // ---------------- helpers ----------------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function rand(s) {
    var x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // ---------------- state ----------------
  var W = 0, H = 0, DPR = 1;
  var zoneH = 0;
  var cellW = 0, cellH = 0;  // declared up-front (strict mode)
  var baseSize = 0;
  var cells = [];
  var tileRegions = [];   // region 列表（现在是面板/大块，每个 = 若干 5×5 tile）
  var panelAt = [];       // panelAt[tileRow][tileCol] = 所属面板 region
  var tilePat = [];       // tilePat[tileRow][tileCol] = tile 图案 (0 DOT / 1 X / 2 PIN)
  var tileRoad = [];      // tileRoad[tileRow][tileCol] = 是否路面
  var regionsByZone = [];
  var regionCells = {};      // regionCells[r.regionId] = [cellIdx, ...]
  var TOTAL_REGIONS = 0;
  var bgCanvas = null;
  var raf = null;
  var t0 = 0;
  // The blue field is painted once and then accumulated over — see render().
  var fieldPainted = false;
  var lastShown = 0;
  var lockupShown = false, replayShown = false;

  // log events
  var LOG = [
    { t: 200,  text: 'INIT NEURAL LINK' },
    { t: 600,  text: 'MOUNT FS // MARATHON' },
    { t: 1100, text: 'PARTITION VORONOI GRID' },
    { t: 1500, text: 'LOAD PIXEL SECTORS' },
    { t: 2000, text: 'REDACT // SIGNAL LOCK' },
    { t: 2700, text: 'ROLLING DISSOLVE' },
    { t: 3400, text: 'SYSTEM ONLINE' }
  ];

  // ===========================================================
  //  BUILD: Voronoi region seeds
  // ===========================================================
  function buildMaze() {
    var T = CFG.TILE_SIZE;                    // 5
    var TCOLS = Math.max(2, Math.floor(CFG.COLS / T));   // 21
    // 每 zone 的 tile 行数必须严格相等：否则窗口高度不是 5×3 整数倍时
    // （如 800px → ROWS_PER_ZONE=22 → floor 后 TROWS=13 → 4/4/5），
    // 下层多 1 行 tile 且最后一行吸收多余 cell 行 → S 路径三层宽度不等。
    // 用 ceil：每 zone 行数相同，最后一行吸收本 zone 余数 cell，三层对称。
    var tPZ = Math.max(1, Math.ceil(CFG.ROWS_PER_ZONE / T)); // 每 zone tile 行数
    var TROWS = tPZ * CFG.ZONES;             // 总 tile 行（3 层相等）
    CFG.TILE_COLS = TCOLS;
    CFG.TILE_ROWS = TROWS;

    // ---- 1) 递归回溯迷宫（房间网格在奇数行/奇数列）----
    // 房间 (rr, rc) → tile (2*rr+1, 2*rc+1)
    // 房间数 = floor(尺寸/2)：确保 2*rr+1 最大 < TROWS（防止奇数尺寸越界）
    var RC = Math.floor(TCOLS / 2);   // 房间列数
    var RR = Math.floor(TROWS / 2);   // 房间行数
    // road[tr][tc]: true = 路面 tile, false = 墙 tile
    var road = [];
    for (var tr = 0; tr < TROWS; tr++) { road[tr] = []; for (var tc = 0; tc < TCOLS; tc++) road[tr][tc] = false; }

    var visited = [];
    for (var r2 = 0; r2 < RR; r2++) { visited[r2] = []; for (var c2 = 0; c2 < RC; c2++) visited[r2][c2] = false; }
    var stack = [[0, 0]];
    visited[0][0] = true;
    road[1][1] = true;   // 房间 (0,0) → tile (1,1)

    var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    var seedB = 20260830;
    function rndM(s) { return rand(s * 2654435761 + seedB); }
    while (stack.length) {
      var cur = stack[stack.length - 1];
      var order = [0, 1, 2, 3].sort(function () {
        return rndM(stack.length * 31 + cur[0] * 17 + cur[1] * 7) - 0.5;
      });
      var moved = false;
      for (var d = 0; d < 4; d++) {
        var di = order[d];
        var nr = cur[0] + dirs[di][0], nc = cur[1] + dirs[di][1];
        if (nr < 0 || nr >= RR || nc < 0 || nc >= RC) continue;
        if (visited[nr][nc]) continue;
        visited[nr][nc] = true;
        // 打通：中间墙 tile + 新房间 tile
        road[2 * cur[0] + 1][2 * cur[1] + 1] = true;
        road[2 * cur[0] + 1 + dirs[di][0]][2 * cur[1] + 1 + dirs[di][1]] = true;
        road[2 * nr + 1][2 * nc + 1] = true;
        stack.push([nr, nc]);
        moved = true;
        break;
      }
      if (!moved) stack.pop();
    }

    // ---- 2) 拓宽：随机墙 tile（4 邻 ≥2 路）→ 路，直到路面比例达标 ----
    var total = TCOLS * TROWS;
    var pathCount = 0;
    for (var a = 0; a < TROWS; a++) for (var b = 0; b < TCOLS; b++) if (road[a][b]) pathCount++;
    var target = Math.floor(total * CFG.MAZE_PATH_RATIO);
    var guard = 0;
    while (pathCount < target && guard < total * 40) {
      guard++;
      var trX = Math.floor(rndM(guard * 11 + 3) * TROWS);
      var tcX = Math.floor(rndM(guard * 17 + 7) * TCOLS);
      if (road[trX][tcX]) continue;
      var nb = 0;
      if (trX > 0 && road[trX - 1][tcX]) nb++;
      if (trX < TROWS - 1 && road[trX + 1][tcX]) nb++;
      if (tcX > 0 && road[trX][tcX - 1]) nb++;
      if (tcX < TCOLS - 1 && road[trX][tcX + 1]) nb++;
      if (nb >= 2) { road[trX][tcX] = true; pathCount++; }
    }

    // ---- 3) 面板（大块）分组：动画闪烁单位从 tile 升级为大块 ----
    // 大块 = PANEL_TW × PANEL_TW tiles（25 个小块一起闪烁）。每 zone = 1 行面板
    //（纵向 = tPZ tiles，tPZ=5 时即"纵向 5 个小块"）。横向默认 5 tiles 宽；
    // 右上（zone 0）与下中（zone 2）放 PANEL_SPECIAL_W（15）tiles 宽特殊面板，
    // 其余按 5 分组、余数并入相邻面板 → 屏幕像拼装面板一样接连闪烁。
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

    // ---- 4) 生成 region（每个面板一个大 region；bbox = 整 zone 高 × tile 列范围）----
    // 跨 zone 边界 y 方向扩展半 cell（TILE_PAD = CELL_SIZE/2 = 6px）：
    // 让红波跨越 z = 0/1、z = 1/2 边界时不显示纯背景 1px 缝。
    // 仅在 zone 边界做，zone 内相邻面板之间不加 — 避开"亮 1px 框"全包现象。
    var TILE_PAD = CFG.CELL_SIZE / 2;
    tileRegions = [];
    regionsByZone = [];
    panelAt = []; tilePat = []; tileRoad = [];
    for (var z = 0; z < CFG.ZONES; z++) regionsByZone.push([]);
    var flatIdx = 0;
    for (var z = 0; z < CFG.ZONES; z++) {
      var widths = panelWidthsFor(z, TCOLS);
      var pcol = 0;
      for (var wi = 0; wi < widths.length; wi++) {
        var w = widths[wi];
        var tcA = pcol, tcB = pcol + w;
        var reg = {
          z: z, idx: flatIdx++, isCorridor: false,
          pat: 0,   // 面板不再直接带 pat；cell.pat 由 tilePat 决定
          px: ((tcA + tcB) / 2) * T * cellW,
          py: z * zoneH + zoneH / 2,
          pathOrder: 0, regionId: z * 100000 + wi * 1000 + tcA,
          redSeen: false,
          sizeR: 1, dens: 1,
          bboxHW: 0, bboxHH: 0, bboxCX: 0, bboxCY: 0,
          tcA: tcA, tcB: tcB, wTiles: w
        };
        // bbox = 整 zone 高 × tile 列范围（三层严格等高、面板间无缝）
        reg.x0 = tcA * T * cellW;
        reg.y0 = z * zoneH;
        reg.x1 = (tcB >= TCOLS) ? W : Math.min(W, tcB * T * cellW);
        reg.y1 = (z + 1) * zoneH;
        // 跨 zone 边界扩展：上半 / 下半各 TILE_PAD，跨过的 1px 缝被覆盖。
        if (z > 0)            reg.y0 = Math.max(0, reg.y0 - TILE_PAD);
        if (z < CFG.ZONES - 1) reg.y1 = Math.min(H, reg.y1 + TILE_PAD);
        reg.bboxHW = (reg.x1 - reg.x0) / 2;
        reg.bboxHH = (reg.y1 - reg.y0) / 2;
        reg.bboxCX = (reg.x0 + reg.x1) / 2;
        reg.bboxCY = (reg.y0 + reg.y1) / 2;
        reg.cx0 = reg.x0; reg.cx1 = reg.x1; reg.cy0 = reg.y0; reg.cy1 = reg.y1;
        tileRegions.push(reg);
        regionsByZone[z].push(reg);
        // 登记该面板覆盖的所有 tile：panelAt（归属）+ tileRoad/tilePat（迷宫图案）
        for (var tr = z * tPZ; tr < (z + 1) * tPZ; tr++) {
          if (!panelAt[tr]) panelAt[tr] = [];
          if (!tileRoad[tr]) tileRoad[tr] = [];
          if (!tilePat[tr]) tilePat[tr] = [];
          for (var tc = tcA; tc < tcB; tc++) {
            panelAt[tr][tc] = reg;
            var isPath = road[tr][tc];
            tileRoad[tr][tc] = isPath;
            // 路面 tile → DOT(0)；墙 tile → X(1) 或 PIN(2)
            tilePat[tr][tc] = isPath ? 0 : (rndM(tr * 997 + tc * 131 + 7) < CFG.MAZE_X_RATIO ? 1 : 2);
          }
        }
        pcol += w;
      }
    }
  }

  // ===========================================================
  //  BUILD: cell grid (perfect square, NO jitter)
  //  COLS / ROWS_PER_ZONE are derived from CELL_SIZE so the grid is
  //  always a perfect square on any viewport.
  //
  //  2026-10-02: cellH is now zoneH/rowsZ, not CELL_SIZE — the cell grid must
  //  EXACTLY tile each zone vertically, otherwise each zone boundary shows a
  //  `zoneH - rowsZ*CELL_SIZE` px wide pure-blue strip where the blue field
  //  bleeds through with no cell on either side. With H=952, ZONES=3, the
  //  math gives 317.33/26 = 12.205 (vs CELL_SIZE=12 → 5.33 px seam per
  //  boundary). cellW stays CELL_SIZE so the maze tiles stay near-square
  //  (12 × 12.205 = ~1.7% taller; glyphs are sized off cellW).
  // ============================================================
  function buildGrid() {
    cellW = CFG.CELL_SIZE;
    var rowsZ  = Math.max(4, Math.floor(zoneH / CFG.CELL_SIZE));
    cellH = zoneH / rowsZ;                       // exact-tile vertical cell height
    var cols   = Math.max(8, Math.floor(W / cellW));
    CFG.COLS  = cols;
    CFG.ROWS_PER_ZONE = rowsZ;
    var total = cols * rowsZ * CFG.ZONES;
    baseSize = cellW * CFG.GLYPH_SCALE;  // = CELL_SIZE × GLYPH_SCALE（测试页：24×0.5=12）
    cells = new Array(total);
    var idx = 0;
    for (var z = 0; z < CFG.ZONES; z++) {
      var zTop = z * zoneH;
      for (var row = 0; row < rowsZ; row++) {
        for (var col = 0; col < cols; col++) {
          // exact grid position — ZERO jitter for a perfectly neat array
          var cx = col * cellW + cellW / 2;
          var cy = zTop + row * cellH + cellH / 2;
          cells[idx] = {
            cx: cx, cy: cy,
            size: baseSize,
            zone: z, col: col, row: row,
            region: null, isEmpty: false
          };
          idx++;
        }
      }
    }
  }

  // ===========================================================
  //  BUILD: assign each cell to its nearest seed.
  //  With the TRUE Voronoi cells computed in computeVoronoiCells
  //  below, nearest-seed is EXACTLY equivalent to point-in-cell
  //  (the Voronoi cell of seed S is {x : S is nearest to x}).
  //  This guarantees no orphan cells and a gap-free red overlay.
  // ===========================================================
  function assignCellsToRegions() {
    regionCells = {};
    var T = CFG.TILE_SIZE;
    var tcols = CFG.TILE_COLS;
    // 1) 每个 cell 归属到其所在 tile → 所在面板（大块）region；
    //    图案仍由 tile 决定（路面 DOT / 墙 X·PIN），动画时机由面板决定。
    var tPZ2 = Math.max(1, Math.ceil(CFG.ROWS_PER_ZONE / T));   // 与 buildMaze 相同
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      // 按 zone 内行计算 tile 行：保证 cell 归属于本 zone 的 tile
      // （当 ROWS_PER_ZONE 不是 T 的倍数时，不能直接 floor(gRow/T)，否则 zone 边界错位）
      var zz = cell.zone;
      var kz = Math.min(tPZ2 - 1, Math.floor(cell.row / T));
      var tr = zz * tPZ2 + kz;
      var tc = Math.min(tcols - 1, Math.floor(cell.col / T));
      var reg = panelAt[tr][tc];   // ← 面板 region
      cell.region = reg;
      cell.pat = tilePat[tr][tc];  // ← tile 级图案 DOT(0) / X(1) / PIN(2)
      cell.isEmpty = false;
      (regionCells[reg.regionId] = regionCells[reg.regionId] || []).push(i);
    }
    // 2) 每个路面 tile 缺 1 个 DOT（24/25），墙 tile 全画
    for (var tr2 = 0; tr2 < CFG.TILE_ROWS; tr2++) {
      for (var tc2 = 0; tc2 < tcols; tc2++) {
        if (!tileRoad[tr2][tc2]) continue;
        var reg2 = panelAt[tr2][tc2];
        var lst = regionCells[reg2.regionId];
        if (lst && lst.length) {
          var drop = Math.floor(rand((tr2 * tcols + tc2) * 13 + 5) * lst.length);
          cells[lst[drop]].isEmpty = true;
        }
      }
    }
  }

  // ===========================================================
  //  BUILD: S-path order (zone0 L->R, zone1 R->L, zone2 L->R)
  // ===========================================================
  function assignRegionOrder() {
    // 镜像 S 路径（原始效果）：
    //   zone 0: L → R    zone 1: R → L    zone 2: L → R
    // 每个 zone 先按 px 方向排序（块），走廊 region 排到最后
    var cumulative = 0;
    for (var z = 0; z < CFG.ZONES; z++) {
      var dir = (z === 1) ? -1 : 1;
      // 将 corridor 分离出去
      var corridor = null, blocks = [];
      for (var i = 0; i < regionsByZone[z].length; i++) {
        if (regionsByZone[z][i].isCorridor) corridor = regionsByZone[z][i];
        else blocks.push(regionsByZone[z][i]);
      }
      blocks.sort(function (a, b) { return dir * (a.px - b.px); });
      // 块按 S 顺序累加 pathOrder；corridor 排最后
      for (var k = 0; k < blocks.length; k++) { blocks[k].pathOrder = cumulative; cumulative++; }
      if (corridor) { corridor.pathOrder = cumulative; cumulative++; }
      regionsByZone[z] = blocks.concat(corridor ? [corridor] : []);
    }
    TOTAL_REGIONS = cumulative;
    // 自适应时间：现在 region = 面板（大块），数量少（~9-13 个）。
    // 每个面板的闪烁间隔（系数越小越快）：120/110ms 时 9 个面板约 0.96s 扫完。
    // 想更快就把数字调小（如 80/70），想更慢就调大（如 300/280）。
    CFG.DOT_SPAN = Math.max(600, (TOTAL_REGIONS - 1) * 30);
    CFG.RED_SPAN = Math.max(500, (TOTAL_REGIONS - 1) * 20);
    computeTimeline();
    return cumulative;
  }

  // ===========================================================
  //  RECTANGULAR TILES via cell-bbox + half-cell padding.
  //  Red blocks are rectangles (4 sides) with 2D size variation,
  //  tiling seamlessly (each region's bbox expanded by half a cell
  //  toward every neighbour; the union covers the whole zone with
  //  no visible boundary lines).
  //  TILE_PAD 现在声明在 buildRegions 上方（要保证执行顺序早于此函数）。
  // ===========================================================

  function computeRectangularTiles() {
    for (var z = 0; z < CFG.ZONES; z++) {
      var seeds = regionsByZone[z];
      var zTop  = z * zoneH;
      var zBot  = (z + 1) * zoneH;
      for (var s = 0; s < seeds.length; s++) {
        var r = seeds[s];
        var list = regionCells[r.regionId] || [];
        var mnX, mxX, mnY, mxY;
        if (list.length === 0) {
          mnX = r.px - 6; mxX = r.px + 6;
          mnY = r.py - 6; mxY = r.py + 6;
        } else {
          mnX = Infinity; mxX = -Infinity; mnY = Infinity; mxY = -Infinity;
          for (var i = 0; i < list.length; i++) {
            var c = cells[list[i]];
            if (c.cx < mnX) mnX = c.cx;
            if (c.cx > mxX) mxX = c.cx;
            if (c.cy < mnY) mnY = c.cy;
            if (c.cy > mxY) mxY = c.cy;
          }
        }
        // expand by half a cell, clip to canvas/zone
        r.x0 = Math.max(0,     mnX - TILE_PAD);
        r.x1 = Math.min(W,     mxX + TILE_PAD);
        // Internal zone boundaries: force a 1px overlap so the two layers'
        // tiles always cross the boundary (zone z's bottom edge extends
        // 1px into zone z+1, zone z+1's top edge starts 1px inside zone z).
        // Both extensions are red so the overlap is invisible. This
        // eliminates the sub-pixel seam line that was previously visible
        // at the zone boundary.
        if (z === 0) r.y0 = Math.max(zTop, mnY - TILE_PAD);
        else         r.y0 = Math.min(zTop - 1, mnY - TILE_PAD);
        if (z === CFG.ZONES - 1) r.y1 = Math.min(zBot, mxY + TILE_PAD);
        else                     r.y1 = Math.max(zBot + 1, mxY + TILE_PAD);
        r.bboxHW = (r.x1 - r.x0) / 2;
        r.bboxHH = (r.y1 - r.y0) / 2;
        r.bboxCX = (r.x0 + r.x1) / 2;
        r.bboxCY = (r.y0 + r.y1) / 2;
        // keep raw cell-bbox for reference
        r.cx0 = mnX; r.cx1 = mxX; r.cy0 = mnY; r.cy1 = mxY;
      }
      // 右侧对齐：该 zone 最靠右的 region 的 tile 右边界扩展到 W，
      // 覆盖网格右侧空隙（COLS*CELL_SIZE 可能 < W），避免透出纯蓝背景形成竖边
      var rightmost = null, maxCx1 = -Infinity;
      for (var si = 0; si < seeds.length; si++) {
        if (seeds[si].cx1 > maxCx1) { maxCx1 = seeds[si].cx1; rightmost = seeds[si]; }
      }
      if (rightmost) {
        rightmost.x1 = W;
        rightmost.bboxHW = (rightmost.x1 - rightmost.x0) / 2;
        rightmost.bboxCX = (rightmost.x0 + rightmost.x1) / 2;
      }
    }
  }

  function buildAll() {
    zoneH = H / CFG.ZONES;
    // IMPORTANT: buildGrid FIRST — it sets CFG.COLS / CFG.ROWS_PER_ZONE
    // from CELL_SIZE. buildMaze() reads those, so it MUST run after
    // buildGrid, else the tile grid won't match the cells array.
    buildGrid();
    buildMaze();                 // 递归回溯迷宫 + tile region + bbox
    assignCellsToRegions();      // cell → tile region, 路面 tile 缺 1 点
    assignRegionOrder();         // S 路径排序
    // NOTE (2026-09-28): computeRectangularTiles() is deliberately NOT called.
    // The standalone cut defines it and never calls it either — it is dead code
    // there, and the panel rectangles `buildRegions()` already wrote
    // (reg.x0 = tcA*T*cellW … reg.y1 = (z+1)*zoneH) are what both cuts actually
    // paint. Calling it here replaced those exact tiling rects with a padded
    // cell-bbox that (a) overlaps its neighbours by up to half a cell and
    // (b) is forced 1px across every zone boundary, and the passes paint with
    // `globalAlpha`, so every overlap composites the red (and the black backdrop)
    // twice and turns each panel edge into a brighter 1px frame — a visible
    // 分层边界 around every panel that the standalone does not have. The padding
    // was there to bridge 12px gaps between neighbour bboxes; on the panel grid
    // there are none, because the panel widths are exact multiples of T tiles.
  }

  // ===========================================================
  //  UI-ANCHORED GLITCH MARKS — 侧栏十字 + 输入框方框点阵
  //  挂在**真实 DOM 矩形**上，每帧重新量（侧栏收起/展开、窗口缩放都跟得上），
  //  不再是原来那套"贴屏幕四边游走成串"。
  // ===========================================================
  var lastRect = { sidebar: null, composer: null };

  // 元素自己（或任一祖先）被隐藏了吗？DSH 在 hero→active 的过渡里用
  // `visibility:hidden` 停放 composerSeat，那种"藏着但量得到"的元素几何仍然正确，
  // 所以它只是**降级**条件（见 pickRect 的两趟扫描），不是排除条件。
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

  // 按 UI_ANCHORS 的顺序取第一个可用元素。两趟：先只收"真的可见"的，都不行才退回
  // 隐藏但量得到的（启动那一刻 DSH 还在 settling，可见性判定不该让标记整块消失）。
  function pickRect(key) {
    var list = CFG.UI_ANCHORS[key];
    var fallback = null, i, el, r;
    for (i = 0; i < list.length; i++) {
      el = document.querySelector(list[i]);
      if (!el) continue;
      r = rectOf(el);
      if (!r) continue;
      if (!r.hidden) return r;
      if (!fallback) fallback = r;
    }
    return fallback;
  }

  // 选择器全部落空时回退到上一帧量到的矩形
  // （DSH 侧栏在指针进入时会摘掉 _quietBars，那一帧不该整块消失）
  function anchorRect(key) {
    var r = pickRect(key);
    if (r) lastRect[key] = r; else r = lastRect[key];
    return r;
  }

  // 十字铺在侧栏矩形内：落点取全局 12px 网格的**格心**（与迷宫点阵同一套网格）
  function drawSidebarCrosses(alpha) {
    var r = anchorRect('sidebar');
    if (!r) return;
    var gs = CFG.CELL_SIZE;
    var step = gs * CFG.UI_CROSS_STEP;
    var size = step * CFG.UI_CROSS_SCALE;
    var x0 = (Math.ceil(r.x0 / gs - 0.5) + 0.5) * gs;
    var y0 = (Math.ceil(r.y0 / gs - 0.5) + 0.5) * gs;
    var n = 0;
    for (var y = y0; y <= r.y1; y += step) {
      for (var x = x0; x <= r.x1; x += step) {
        n++;
        if (CFG.UI_CROSS_DENSITY < 1 &&
            rand(n * 12.9898 + 78.233) > CFG.UI_CROSS_DENSITY) continue;
        drawPlus(x, y, size, alpha, CFG.colorRed);
      }
    }
  }

  // 输入框被**一片小方框**铺满：与侧栏十字**同一套网格、同一档尺寸与线宽**，
  // 只是把形状从"+"换成小方框（用户口径：与旁边的十字逻辑一样）。
  // 不是一个大框套在外面（描边），也不是一整块实心填充。
  function drawComposerBox(alpha) {
    var r = anchorRect('composer');
    if (!r) return;
    var p = CFG.UI_BOX_PAD;
    var x0 = r.x0 - p, y0 = r.y0 - p, x1 = r.x1 + p, y1 = r.y1 + p;
    if (x1 - x0 < 2 || y1 - y0 < 2) return;
    var gs = CFG.CELL_SIZE;
    var step = gs * CFG.UI_CROSS_STEP;
    var size = step * CFG.UI_BOX_SCALE;
    var half = size * 0.85;                 // 与 drawPlus 同一公式：半边长 = 半臂长
    var lw = Math.max(0.9, size * 0.20);    // 与 drawPlus 同一线宽
    if (half < 0.5) return;
    // 起点与十字相同：全局网格的**格心**（同一相位，两块点阵对得上）
    var gx = (Math.ceil(x0 / gs - 0.5) + 0.5) * gs;
    var gy = (Math.ceil(y0 / gs - 0.5) + 0.5) * gs;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = CFG.colorRed;
    ctx.lineWidth = lw;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    var n = 0;
    for (var y = gy; y <= y1; y += step) {
      for (var x = gx; x <= x1; x += step) {
        n++;
        if (CFG.UI_CROSS_DENSITY < 1 &&
            rand(n * 12.9898 + 78.233) > CFG.UI_CROSS_DENSITY) continue;
        ctx.rect(x - half, y - half, half * 2, half * 2);
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function rebuildAll() {
    buildAll();
    // 标记不再预计算：每帧从真实 DOM 矩形量（见 anchorRect / drawSidebarCrosses）
  }

  // ===========================================================
  //  PER-REGION TIMING — each region independent (no global sync)
  // ===========================================================
  function regionTimings(r) {
    var n = Math.max(1, TOTAL_REGIONS - 1);
    var rDotStart      = CFG.DOT_START + (r.pathOrder / n) * CFG.DOT_SPAN;
    var rRedStart      = CFG.RED_START + (r.pathOrder / n) * CFG.RED_SPAN;
    var rRedEnd        = rRedStart + CFG.RED_RISE;
    var rDissolveStart = rRedEnd + CFG.RED_HOLD;
    var rDissolveEnd   = rDissolveStart + CFG.RED_EXIT;
    return {
      rDotStart: rDotStart, rRedStart: rRedStart,
      rRedEnd: rRedEnd, rDissolveStart: rDissolveStart, rDissolveEnd: rDissolveEnd
    };
  }
  function regionRedAlpha(r, t) {
    var tn = regionTimings(r);
    if (t < tn.rRedStart) return 0;
    if (t < tn.rRedEnd)   return easeOut(clamp((t - tn.rRedStart) / CFG.RED_RISE, 0, 1));
    if (t < tn.rDissolveStart) return 1;
    if (t < tn.rDissolveEnd)   return clamp(1 - easeOut((t - tn.rDissolveStart) / CFG.RED_EXIT), 0, 1);
    return 0;
  }
  function regionDotAlpha(r, t) {
    var tn = regionTimings(r);
    var dt = t - tn.rDotStart;
    var flash = 0, dot = 0;
    if (dt >= 0) {
      if (dt < CFG.DOT_FLASH) flash = Math.sin((dt / CFG.DOT_FLASH) * Math.PI);
      dot = clamp((dt - CFG.DOT_FLASH) / CFG.DOT_SETTLE, 0, 1);
    }
    return { flash: flash, dot: dot };
  }

  // ===========================================================
  //  GLYPH DRAW — 3 patterns (DOT / X / PIN)
  // ===========================================================
  function drawGlyph(pat, cx, cy, size, alpha, color) {
    if (alpha <= 0.02) return;
    var s = size;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = CFG.LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (pat === PAT.DOT) {
      // 路面：实心大圆（半径 = size/2 = GLYPH_SCALE * CELL_SIZE / 2）
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.50, 0, 6.283);
      ctx.fill();
    } else if (pat === PAT.X) {
      // 墙壁：缩短的叉号（h = s*0.30 ≈ cell*0.27，cell 内留 ~5px 间隙，不与旁边 X 相连）
      var hx = s * 0.30;
      ctx.beginPath();
      ctx.moveTo(cx - hx, cy - hx); ctx.lineTo(cx + hx, cy + hx);
      ctx.moveTo(cx + hx, cy - hx); ctx.lineTo(cx - hx, cy + hx);
      ctx.stroke();
    } else { // PAT.PIN
      // 墙壁：小圆点（半径 = size * PIN_SCALE）
      ctx.beginPath();
      ctx.arc(cx, cy, s * CFG.PIN_SCALE, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPlus(cx, cy, size, alpha, color) {
    if (alpha <= 0.02) return;
    var h = size * 0.85;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.9, size * 0.20);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - h, cy); ctx.lineTo(cx + h, cy);
    ctx.moveTo(cx, cy - h); ctx.lineTo(cx, cy + h);
    ctx.stroke();
  }

  function listFor(r) {
    var idxs = regionCells[r.regionId] || [];
    var out = [];
    for (var i = 0; i < idxs.length; i++) {
      var c = cells[idxs[i]];
      if (c.isEmpty) continue;
      out.push(c);
    }
    return out;
  }

  // ===========================================================
  //  RENDER
  // ===========================================================
  function render(now) {
    var t = now - t0;

    // ---- the blue field is painted ONCE, not every frame ----
    // This is the one place where repainting from scratch every frame made the
    // animation visibly different from the standalone cut (启动动画.html).
    //
    // That cut never clears its canvas: a region's black backdrop, its white
    // flash and its dot matrix all composite on top of the previous frame. So a
    // region whose bgFade is a nominal 400ms linear ramp actually lands as a
    // ~200ms snap (alpha 115 at t=600 reached in one step, 255 when stepped
    // frame-by-frame), the white flash leaves a wash that the backdrop then eats,
    // and the dot matrix is at full strength from its first frame. Repainting
    // every frame instead holds every region on its ramp for the full 400ms, so
    // the S sweep shows three or four differently-tinted rectangles per zone --
    // the 分层边界 the standalone does not have.
    //
    // Painting the field once and letting the passes accumulate restores the
    // standalone's compositing. Doing it this way (rather than emulating
    // accumulated alphas numerically) also keeps the red sweep single-pass, which
    // is what the standalone does: there a region's red always starts after its
    // backdrop has reached opaque black, and the opaque black repaint that the
    // accumulating backdrop performs every frame wipes the previous frame's red.
    if (!fieldPainted) {
      fieldPainted = true;
      ctx.globalAlpha = 1;
      ctx.fillStyle = CFG.colorBlue;   // blue field the maze sits on (was the DOM
      ctx.fillRect(0, 0, W, H);        // #mb-solid-bg underlay; painted here now)
    }

    // NO per-region hole punching any more (2026-09-20): the plate stays opaque
    // end to end, and the ONE reveal beat is the final cross-fade at the bottom
    // of render() — 界面整体淡入, not panel by panel.

    // Per-region black backdrop fade-in (one region per white flash). It now
    // stays for EVERY region to the end — a panel reads 点阵 -> 黑 -> 红扫 ->
    // 回到黑, and the final cross-fade dissolves that black plate toward the app.
    for (var zb = 0; zb < CFG.ZONES; zb++) {
      var seedsB = regionsByZone[zb];
      for (var sib = 0; sib < seedsB.length; sib++) {
        var rb = seedsB[sib];
        var rtnB = regionTimings(rb);
        var bgFade = clamp((t - (rtnB.rDotStart + CFG.DOT_FLASH)) / 400, 0, 1);
        if (bgFade > 0) {
          ctx.globalAlpha = bgFade;
          ctx.fillStyle = CFG.colorBg;
          ctx.fillRect(rb.x0, rb.y0, rb.x1 - rb.x0, rb.y1 - rb.y0);
          ctx.globalAlpha = 1;
        }
      }
    }
    // 底部余量：网格 cell 行数可能不满画布高（ROWS_PER_ZONE*ZONES*cellH < H），
    // 跟随最后一个 region 同步补黑，并一直保持到最后一拍
    var lastR = regionsByZone[CFG.ZONES - 1][regionsByZone[CFG.ZONES - 1].length - 1];
    var lastTn = regionTimings(lastR);
    var lastBg = clamp((t - (lastTn.rDotStart + CFG.DOT_FLASH)) / 400, 0, 1);
    var gridBottom = CFG.ROWS_PER_ZONE * CFG.ZONES * cellH;
    if (lastBg > 0 && gridBottom < H) {
      ctx.globalAlpha = lastBg;
      ctx.fillStyle = CFG.colorBg;
      ctx.fillRect(0, gridBottom, W, H - gridBottom);
      ctx.globalAlpha = 1;
    }
    // Dots are occluded by that region's red alpha so the red block paints clean.
    for (var z = 0; z < CFG.ZONES; z++) {
      var seeds = regionsByZone[z];
      for (var si = 0; si < seeds.length; si++) {
        var r = seeds[si];
        var td = regionDotAlpha(r, t);
        var tr = regionRedAlpha(r, t);
        // mark region as "red-seen" the first time the red overlay
        // begins to cover it — once seen, dots are PERMANENTLY hidden
        // for this region (so after the red dissolves, the area shows
        // pure black instead of the dot pattern coming back).
        if (tr > 0.05) r.redSeen = true;
        // 一旦红覆盖过该 region → 其所有 cells 永久 isEmpty（不再绘制）
        if (r.redSeen) {
          var idxsR = regionCells[r.regionId] || [];
          for (var li = 0; li < idxsR.length; li++) cells[idxsR[li]].isEmpty = true;
        }
        // settled alpha (gray dot) — hidden while red covers OR after
        // the red has ever covered this region
        var settled = td.dot * (0.85 + 0.15 * r.sizeR);
        if (tr > 0.15 || r.redSeen) settled = 0;
        // white flash on the region's tile rectangle (one fill, not per cell)
        if (td.flash > 0.02 && tr < 0.5) {
          ctx.globalAlpha = td.flash * 0.80 * (1 - tr);
          ctx.fillStyle = CFG.colorFlash;
          ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
          ctx.globalAlpha = 1;
        }
        if (settled > 0.02) {
          var list = listFor(r);
          // sizeR scales glyph slightly; baseSize is the base
          var sz = baseSize * (0.90 + 0.20 * r.sizeR);
          // draw every filled cell in this region with its pattern at settled alpha
          for (var i = 0; i < list.length; i++) {
            var c = list[i];
            // 用 cell.pat（块内 cell.pat=0=DOT; 走廊 cell.pat ∈ {1=X, 2=PIN}）
            drawGlyph(c.pat, c.cx, c.cy, sz, settled, CFG.colorGray);
          }
        }
      }
    }
    ctx.globalAlpha = 1;

    // ---- PASS 2: red overlay (RECTANGLE per region, no black glyphs) ----
    // Per-region independent fade-in / hold / dissolve.
    // Rectangular tiles (not polygons) — sized like marathon-boot123.html.
    // Adjacent tiles overlap in the seam area (both are red, invisible),
    // so the three layers have no boundary lines.
    for (var z2 = 0; z2 < CFG.ZONES; z2++) {
      var seeds2 = regionsByZone[z2];
      for (var si2 = 0; si2 < seeds2.length; si2++) {
        var r2 = seeds2[si2];
        // 走廊 region 不画红色（其 bbox 是整个 zone，画出来是整屏大红块）
        // 走廊的 X/PIN 通过 PASS 1 的 redSeen 机制永久消失
        if (r2.isCorridor) continue;
        var ra = regionRedAlpha(r2, t);
        if (ra <= 0.02) continue;
        ctx.globalAlpha = ra;  // fully opaque at full coverage (was 0.95 — the
                                // 5% transparency let the static bg dots bleed
                                // through and formed a visible line at zone boundaries)
        ctx.fillStyle = CFG.colorRed;
        ctx.fillRect(r2.x0, r2.y0, r2.x1 - r2.x0, r2.y1 - r2.y0);
      }
    }
    ctx.globalAlpha = 1;

    // ---- PASS 2.5: the final beat. The whole plate (blue field + black slabs
    // + red sweep + dots) dissolves UNIFORMLY toward the live app, so the UI
    // rises in one piece — 界面整体淡入 — while the marks leave ahead of it.
    // `destination-out` erases by alpha regardless of how many layers were
    // painted above; nothing else would give a single clean cross-fade.
    var fadeT = clamp((t - CFG.FADE_AT) / CFG.UI_FADE, 0, 1);
    if (fadeT > 0) {
      // Settle the plate in one opaque black pass first. `destination-out` on an
      // accumulating canvas erases a little more every frame, which would compress
      // this 620ms cross-fade exactly the way accumulation compresses a region's
      // backdrop ramp. By now every region's backdrop is opaque black (the last red
      // dissolves at SWEEP_END, 400ms earlier), so settling changes nothing on
      // screen — it only makes the erase a single, frame-rate-independent pass.
      ctx.globalAlpha = 1;
      ctx.fillStyle = CFG.colorBg;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = fadeT;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // ---- PASS 3: UI-anchored glitch marks. 十字铺在左侧栏上、方框点阵铺在输入框上，
    // 两者都挂在真实 DOM 矩形上（anchorRect），并比黑幕先退（UI_MARK_LEAD），
    // 读起来就是"红色十字先没、界面随后整块升起"。
    if (t > CFG.MARK_AT) {
      var markA = clamp((t - CFG.MARK_AT) / CFG.UI_MARK_IN, 0, 1)
                * (1 - clamp(fadeT * CFG.UI_MARK_LEAD, 0, 1));
      if (markA > 0.02) {
        drawSidebarCrosses(markA * CFG.UI_MARK_ALPHA);
        drawComposerBox(markA * CFG.UI_MARK_ALPHA);
      }
    }

    // (intentionally NO drawGridFaint, NO zone dividers, NO scan-line pulse)

    // ---- chrome (DOM HUD, CSS-hidden) ----
    updateChrome(t);

    // ---- end of sequence: freeze frame, stop, notify the driver ----
    if (t >= CFG.END + 80) {
      if (!finished) { finished = true; if (typeof window.__mbBootDone === 'function') window.__mbBootDone(); }
      raf = null;
      return;
    }
    raf = requestAnimationFrame(render);
  }

  // ---------------- CHROME ----------------
  function updateChrome(t) {
    var total = CFG.END - CFG.PRE_DELAY;
    var mp = clamp((t - CFG.PRE_DELAY) / total, 0, 1);
    elProg.style.width = (mp * 100).toFixed(1) + '%';

    var lat = (47 + 0.5 * Math.sin(t * 0.0007)).toFixed(4);
    var lon = (122 + 0.5 * Math.cos(t * 0.0009)).toFixed(4);
    var pct = (mp * 100).toFixed(1);
    elReadout.textContent = 'LAT ' + lat + '\nLON -' + lon + '\nGRID ' + pct + '%';

    var st;
    if      (t < CFG.PRE_DELAY)      st = 'INITIALIZING';
    else if (t < CFG.DOT_START)      st = 'PARTITION GRID';
    else if (t < CFG.RED_START)      st = 'LOADING SECTORS';
    else if (t < CFG.RED_START + 200) st = 'REDACT // SIGNAL LOCK';
    else if (t < CFG.LOCKUP_AT - 200) st = 'ROLLING DISSOLVE';
    else                              st = 'SYSTEM ONLINE';
    elStatus.textContent = st;

    while (lastShown < LOG.length && t >= LOG[lastShown].t) {
      var d = hostEl.ownerDocument.createElement('div');
      d.className = 'mb-line';
      d.innerHTML = LOG[lastShown].text + '<span class="mb-cursor"></span>';
      elLog.appendChild(d);
      lastShown++;
    }
    if (lastShown > 0) {
      var cur = elLog.querySelectorAll('.mb-cursor');
      for (var i = 0; i < cur.length; i++) cur[i].style.display = (i === cur.length - 1) ? 'inline-block' : 'none';
    }

    if (!lockupShown && t >= CFG.LOCKUP_AT) {
      elLockup.classList.add('mb-show'); lockupShown = true;
    }
    if (!replayShown && t >= CFG.END + 300) {
      elReplay.classList.add('mb-show'); replayShown = true;
    }
  }

  // ---------------- LIFECYCLE ----------------
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // Setting canvas.width above wiped the backing store, so the accumulated
    // plate is gone and render() has to lay the blue field down again.
    fieldPainted = false;
    rebuildAll();
  }

  function reset() {
    if (raf) cancelAnimationFrame(raf);
    t0 = performance.now();
    lastShown = 0; lockupShown = false; replayShown = false;
    // The plate accumulates, so a replay has to start from a clean canvas and
    // lay the blue field down again.
    ctx.clearRect(0, 0, W, H);
    fieldPainted = false;
    // clear "red has covered this region" flags so dots can appear
    // again on replay (before the red sweeps back over)
    for (var z = 0; z < CFG.ZONES; z++) {
      for (var s = 0; s < regionsByZone[z].length; s++) {
        regionsByZone[z][s].redSeen = false;
      }
    }
    elLog.innerHTML = '';
    elLockup.classList.remove('mb-show');
    elReplay.classList.remove('mb-show');
    raf = requestAnimationFrame(render);
  }

  // ---------------- bindings ----------------
  // NOTE: no Space/Enter / click-to-replay handlers here on purpose — inside the
  // harness the boot overlay must never swallow keystrokes or clicks.
  var resizing = false;
  function onResize() {
    if (resizing) return;
    resizing = true;
    requestAnimationFrame(function () { resize(); resizing = false; });
  }
  window.addEventListener('resize', onResize);

  var started = false, finished = false, runClassed = false, runTimer = null;

  // resize() runs at load so the cell grid / regions exist; the render loop
  // only begins when the intro orchestrator calls start().
  resize();

  function start() {
    if (started || finished) return;
    started = true;
    reset();
    // #mb-boot fades in over 300ms (CSS). Only AFTER that fade can the intro's
    // fullscreen blue layer + host black backdrop be dropped (.mb-run): during
    // the fade the boot content is semi-transparent, so the DOM underlay must
    // stay put to avoid ghosting the live UI through it. From .mb-run on, the
    // canvas owns the backdrop and transparent pixels reveal the app.
    if (!runClassed) {
      runTimer = setTimeout(function () {
        if (!runClassed) { runClassed = true; hostEl.classList.add('mb-run'); }
        runTimer = null;
      }, 360);
    }
  }
  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (runTimer) { clearTimeout(runTimer); runTimer = null; }
    window.removeEventListener('resize', onResize);
  }

  // expose for the intro orchestrator (engine-intro.js) and the driver
  window.__mbMarathon = { start: start, stop: stop, cfg: CFG };

  // keep a debug hook (mirrors the standalone's __engine_state)
  window.__mbEngineState = function () {
    return {
      CFG: CFG, cells: cells, regionsByZone: regionsByZone,
      regionCells: regionCells, TOTAL_REGIONS: TOTAL_REGIONS,
      W: W, H: H, zoneH: zoneH, baseSize: baseSize
    };
  };
})();
