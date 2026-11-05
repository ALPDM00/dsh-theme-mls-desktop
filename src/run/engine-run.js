/* ===========================================================================
 * dsh-theme-mls-desktop213 — 输入框上方「运行提示」紧凑条带引擎
 * -----------------------------------------------------------------------------
 * 视觉来源：D:\PythonCode\ma\运行动画.html（1920×1080，S=1/3 逻辑缩放）。
 * 原动画是整屏构图：左空心人形 + 右实心人形 + 一条微下弯传送线 + 每轮两个
 * 光点 + 三行居中文字。这里把同一套几何／节奏压进输入框上方 132px 高的条带：
 *
 *   ┌──────────────────────────────────────────────┐
 *   │  空心人形  ───────●──────────────  实心人形   │  视觉带 52px
 *   │              深度求索中 ○ ○ ○                 │  ← 13px / 22px 行高
 *   │              用时 12 秒                        │
 *   │              调用工具 · read                   │
 *   └──────────────────────────────────────────────┘
 *
 * 关键取舍：
 *   1. 背景保持透明，不填任何底色 —— DSH 自己的面板透出来。
 *   2. 人形按高度重新标定（原图 291 局部单位 → 44 CSS px），横向只保留
 *      原图 11.5% / 88.5% 的中心位置关系，所以 560~1000px 宽都能容纳。
 *   3. 传送线保持“两端低于中点”的微下弯（原图 sag≈13.9 源像素），光点严格
 *      沿用原动画的 3.0s 轮、0.433s 间隔、1.03s 行程与 P 曲线。
 *   4. 所有动态都在 RAF 里；prefers-reduced-motion / state.reduced 时只画
 *      一帧（三个标题点全亮，光点定格在传送线中点）。
 *
 * 对外 API（不依赖 import / require / 网络 / 外部资源）：
 *
 *   var inst = window.__marRunEngine.create(host, { height: 132 });
 *   inst.set({ mode:'run', title:'深度求索中', meta:'用时 12 秒',
 *              action:'调用工具 · read', ink:null, dim:null, reduced:false });
 *   inst.renderAt(0.6);   // 验收辅助：暂停 RAF 并定格到 t=0.6s（可选）
 *   inst.destroy();
 *
 * host 由插件创建；本引擎只负责在 host 内追加一个 <canvas>。
 * ========================================================================= */
(function () {
  'use strict';

  var DEFAULT_HEIGHT = 132;                 // 交付口径：132 CSS px
  var FONT_STACK = "'Microsoft YaHei','Noto Sans SC','PingFang SC',sans-serif";

  /* =========================================================================
   * 一、参数区（全部来自 运行动画.html，转换关系写在每条旁边）
   * ========================================================================= */

  /* ---- 传送线 -------------------------------------------------------------
   * 2026-11-05 用户：改成一条**标准直线**——矩形截面、两端各 1.5px 圆角，
   * 不再做原文件那种两端渐细（尖头）。线厚仍按人形高比例取 ~1.9px。
   */
  var BEAM = {
    widthRatio: 0.041,      // 线厚 = 人形高 × 4.1%（46 → 1.9px）
    widthMin: 1.2,
    widthMax: 2.4,
    capRadius: 1.5          // 两端圆角（CSS px；不超过半线厚）
  };

  /* ---- 光点（视频逐帧实测，原样保留）-------------------------------------
   * loop 3.0s 一轮；每轮 emit 两个球，间隔 0.433s（13 帧）；单球 travel
   * 1.03s（31 帧）；两个球都消失后空窗 1.54s。
   * 源文件飞行范围 x 432→1490，相对传送线两端各内缩 ≈4.7%。
   * 半径源值 r0=10 / rMax=19（直径 20→38→20），按“人形高”比例换算到条带：
   * 19/291 = 6.5% × 44 ≈ 3.0px；r0 / rMax = 10/19 ≈ 0.526，两端小、中点大。
   */
  var PKT = {
    loop: 3.0,
    emit: [0, 0.433],
    travel: 1.03,
    insetRatio: 0.047,
    r0OfMax: 0.526,         // 源文件 r0/rMax = 10/19：两端半径是最峰值的 52.6%
    rMaxRatio: 0.068,       // 半径峰 ≈ 人形高 × 6.8%（44 → 3.0px）
    rMin: 2.6,
    rMaxLimit: 3.8,
    // 位移 LUT：源文件实测基本线性、略 S 形，两端速度慢、中段快。
    ease: [
      [0.00, 0.00], [0.10, 0.05], [0.20, 0.13], [0.30, 0.23],
      [0.40, 0.35], [0.50, 0.49], [0.60, 0.63], [0.70, 0.75],
      [0.80, 0.86], [0.90, 0.95], [1.00, 1.00]
    ]
  };

  /* ---- 人形（源文件局部坐标 164×291，原样搬过来）-------------------------
   * rects: [x, y, w, h] → 头 / 左臂 / 躯干 / 右臂；腿是两条 41 宽的竖条。
   * 身体底边 182，腿顶 170：重叠 12 源像素恰好并成一条胯线（原注释）。
   * headDy：右人形头单独上移 6 源像素；hollow：左边空心、右边实心。
   * rad=4.5 / inset=12 是源文件的圆角与空心描边厚度；缩放后分别约
   * 0.7px / 1.8px，因此空心描边在 132px 高时仍然清楚。
   */
  var FIG = {
    W: 183,
    H: 291,
    // 2026-11-05 用户：“退回到我自己修改的版本” —— 即 v0.6.6 的粗细
    // （手臂/腿 41、描边 12）再加上他手调的臂隙 18；随后他又把空心描边手调到 8。
    // 为容纳 18 的间隙，整体宽度 173 → 183；腰部仍保持错位相接（臂/躯干底 182，腿顶 170）。
    // 局部单位（183×291）：头 65×68、颈隙 13、躯干 65×101、臂 41×101、
    // 臂—躯干隙 18、腿 41×121（腿隙 35）。
    rects: [
      [ 59,   0,  65,  68],   // 头（与躯干间留 13 颈隙）
      [  0,  81,  41, 101],   // 左臂 → 底 182（与腿 170 起错位重叠 8）
      [ 59,  81,  65, 101],   // 躯干 → 底 182
      [142,  81,  41, 101]    // 右臂 → 底 182
    ],
    legs: [[33, 41], [109, 41]],
    legY: 170,
    legBottom: 291,
    titleBottom: 182,
    headDy: { L: 0, R: -6 },
    rad: 4.5,
    inset: 8,                 // 空心描边：用户在 12 的基础上手调到 8
    pad: 9                    // 源文件离屏画布 HP：给描边留的边距
  };

  /* ---- 文字 --------------------------------------------------------------
   * 源文件 60px / 行距 ≈ 79.5px（1.325 倍），按整屏 1080 折算到 132px 条带
   * 会只剩 7px 左右，太糊；交付明确“字号约 13px、行高 22px”，这里以可读性
   * 为准，只保留源文件的“三行居中、第一行带点”的结构。
   * 标题点：半径 1.55px、点间距 5.2px、文字后留白 4.5px，亮度依次呼吸。
   */
  var TEXT = {
    titleSize: 13,
    lineSize: 13,
    lineHeight: 22,
    // 2026-11-05 用户：三条文字颜色统一、不加粗、不要标题后的呼吸点动画，
    // 视觉上跟左边空心人形一致 —— 全部 400 字重、同一支固定墨色、行高不变。
    titleWeight: 400,
    lineWeight: 400,
    gap: 10,                  // 视觉带底 → 第一行文字顶端
    padX: 24                  // 文字左右安全边距
  };

  /* ---- 条带布局 ----------------------------------------------------------
   * 2026-11-05 用户按原始游戏截图（人形 + 短线）要求改成**居中紧凑构图**：
   * 两个人形之间是一条**直线**，长度固定约 220px（源 1920 构图里 1172px 是
   * 61% 宽，铺满 820px 条带会显得线太长）；人形高度 46px。整个装置居中，
   * 不再把人形顶到左右边缘。视觉带 54px；文字仍居中放在下方。
   */
  var STRIP = {
    bandTop: 4,
    figH: 46,
    figHMin: 38,
    figHSmallBelow: 520,      // 更窄时把人形缩到 38
    figBeamY: 0.55,           // 直线穿过人形高度的 55%（参考截图）
    lineLen: 220,             // 直线长度（CSS px）
    lineLenMin: 160,
    lineLenMax: 260,
    sideGap: 10,              // 人形边缘 → 直线端点
    bandH: 54
  };

  /* =========================================================================
   * 二、工具
   * ========================================================================= */
  var clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var ss = function (a, b, v) {
    var x = clamp01((v - a) / (b - a));
    return x * x * (3 - 2 * x);
  };

  // 颜色归一化探针：随便给一个 CSS 颜色，浏览器把它解析成 #rrggbb / rgba()。
  // 解析失败时 fillStyle 保持上一次的值，我们用哨兵判断。
  var probe = document.createElement('canvas').getContext('2d');
  function normalizeColor(value) {
    if (!value) return '';
    try {
      probe.fillStyle = '#010203';
      probe.fillStyle = String(value).trim();
      var out = probe.fillStyle;
      return out === '#010203' ? '' : out;
    } catch (e) {
      return '';
    }
  }

  function alphaColor(cssColor, alpha) {
    var c = normalizeColor(cssColor);
    var m;
    if (!c) return '';
    if (c.charAt(0) === '#') {
      var hex = c.slice(1);
      if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
      if (hex.length === 6 || hex.length === 8) {
        var r = parseInt(hex.slice(0, 2), 16);
        var g = parseInt(hex.slice(2, 4), 16);
        var b = parseInt(hex.slice(4, 6), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
      }
    }
    m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(c);
    if (m) return 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + alpha + ')';
    return '';
  }

  function lut(L, u) {
    if (u <= L[0][0]) return L[0][1];
    for (var i = 1; i < L.length; i++) {
      if (u <= L[i][0]) {
        var t = (u - L[i - 1][0]) / (L[i][0] - L[i - 1][0]);
        var s = 0.5 - 0.5 * Math.cos(Math.PI * t);
        return L[i - 1][1] + (L[i][1] - L[i - 1][1]) * s;
      }
    }
    return L[L.length - 1][1];
  }

  function rr(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /* =========================================================================
   * 三、布局 / 几何
   * ========================================================================= */

  function figRects(hollow) {
    var dy = FIG.headDy[hollow ? 'L' : 'R'];
    var out = [];
    var i, r;
    for (i = 0; i < FIG.rects.length; i++) {
      r = FIG.rects[i];
      out.push(i === 0 ? [r[0], r[1] + dy, r[2], r[3]] : r);
    }
    var lh = FIG.legBottom - FIG.legY;
    for (i = 0; i < FIG.legs.length; i++) {
      out.push([FIG.legs[i][0], FIG.legY, FIG.legs[i][1], lh]);
    }
    return out;
  }

  function computeLayout(w, h) {
    var sv = h / DEFAULT_HEIGHT;                 // 垂直缩放（默认高度时=1）
    var figH = (w < STRIP.figHSmallBelow ? STRIP.figHMin : STRIP.figH) * sv;
    var figW = figH * (FIG.W / FIG.H);
    var bandTop = STRIP.bandTop * sv;

    // 居中的“人形—短线—人形”装置。线长固定，不随条带宽度拉长；窗口太窄
    // 时把人形往里收，最后才让线段略微缩短。
    var lineLen = clamp(STRIP.lineLen * sv, STRIP.lineLenMin, STRIP.lineLenMax);
    var maxHalf = Math.max(24, w / 2 - figW - 16 - STRIP.sideGap * sv);
    var half = Math.min(lineLen / 2, maxHalf);
    var x0 = w / 2 - half;
    var x1 = w / 2 + half;
    var gap = STRIP.sideGap * sv;
    var centerL = x0 - gap - figW / 2;
    var centerR = x1 + gap + figW / 2;
    var span = x1 - x0;
    var cy = bandTop + figH * STRIP.figBeamY;
    var lineW = clamp(figH * BEAM.widthRatio, BEAM.widthMin, BEAM.widthMax);

    var textTop = bandTop + figH + TEXT.gap * sv;
    var lineH = TEXT.lineHeight * sv;
    var lineY = [textTop + lineH / 2, textTop + lineH * 1.5, textTop + lineH * 2.5];

    var rMax = clamp(figH * PKT.rMaxRatio, PKT.rMin, PKT.rMaxLimit);
    return {
      w: w,
      h: h,
      sv: sv,
      bandTop: bandTop,
      figH: figH,
      figW: figW,
      figTop: bandTop,
      figBottom: bandTop + figH,
      centerL: centerL,
      centerR: centerR,
      lineW: lineW,
      beam: {
        x0: x0,
        x1: x1,
        cx: w / 2,
        cy: cy,
        sag: 0,                    // 2026-11-05：直线（原弧线取消）
        halfH: lineW / 2,
        cap: Math.min(BEAM.capRadius, lineW / 2)
      },
      pkt: {
        x0: x0 + span * PKT.insetRatio,
        x1: x1 - span * PKT.insetRatio,
        r0: rMax * PKT.r0OfMax,
        rMax: rMax
      },
      text: {
        cx: w / 2,
        lineY: lineY,
        lineH: lineH,
        titleSize: TEXT.titleSize * sv,
        lineSize: TEXT.lineSize * sv,
        maxW: w - TEXT.padX * 2
      }
    };
  }

  function beamYAt(L, x) {
    return L.beam.cy + L.beam.sag;
  }

  /* =========================================================================
   * 四、绘制：传送线 / 人形 / 光点
   * ========================================================================= */

  // 一条标准直线：矩形截面 + 两端 1.5px 圆角（不再是两端渐细的尖头）。
  function drawBeam(c, L, color, alpha) {
    var b = L.beam;
    var x = b.x0;
    var y = b.cy - b.halfH;
    var w = b.x1 - b.x0;
    var h = b.halfH * 2;
    var r = Math.max(0, Math.min(b.cap == null ? 1.5 : b.cap, w / 2, h / 2));
    if (w <= 0) return;
    c.save();
    c.globalAlpha = alpha == null ? 1 : alpha;
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
    c.fill();
    c.restore();
  }

  /* 人形离屏精灵：空心用“填充并集 → destination-out 内缩区”，和源文件一致。
   * 这样相邻块（臂底 / 躯干底 / 腿顶）的边会自然并成同一条线，不会出现
   * 一条条独立描边叠在一起的脏边。每个尺寸 / DPR / 颜色只重建一次。 */
  function buildFigureSprite(figH, dpr, color, hollow) {
    var scale = figH / FIG.H;
    var pad = FIG.pad;
    var wCss = Math.ceil((FIG.W + pad * 2) * scale);
    var hCss = Math.ceil((FIG.H + pad * 2) * scale);
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(wCss * dpr));
    cv.height = Math.max(1, Math.round(hCss * dpr));
    var c = cv.getContext('2d');
    var unit = scale * dpr;
    c.setTransform(unit, 0, 0, unit, pad * scale * dpr, pad * scale * dpr);

    var rects = figRects(hollow);
    var i, r;
    c.fillStyle = color;
    for (i = 0; i < rects.length; i++) {
      r = rects[i];
      rr(c, r[0], r[1], r[2], r[3], FIG.rad);
      c.fill();
    }
    if (hollow) {
      c.globalCompositeOperation = 'destination-out';
      for (i = 0; i < rects.length; i++) {
        r = rects[i];
        var ins = FIG.inset;
        rr(c, r[0] + ins, r[1] + ins, r[2] - ins * 2, r[3] - ins * 2,
          Math.max(FIG.rad - ins, 1));
        c.fill();
      }
      c.globalCompositeOperation = 'source-over';
    }
    return { canvas: cv, wCss: wCss, hCss: hCss, scale: scale, pad: pad };
  }

  function drawFigure(c, sprite, cx, top, figH) {
    var scale = figH / FIG.H;
    var x = cx - (FIG.W / 2 + sprite.pad) * scale;
    var y = top - sprite.pad * scale;
    c.drawImage(sprite.canvas, x, y, sprite.wCss, sprite.hCss);
  }

  function drawPacket(c, L, u, color, fixedMax) {
    var p = lut(PKT.ease, clamp01(u));
    var x = L.pkt.x0 + (L.pkt.x1 - L.pkt.x0) * p;
    var y = beamYAt(L, x);
    var b = Math.sin(Math.PI * clamp01(p));
    var r = fixedMax ? L.pkt.rMax : L.pkt.r0 + (L.pkt.rMax - L.pkt.r0) * b;
    var a = fixedMax ? 1 : ss(0, 0.03, u) * (1 - ss(0.97, 1, u));

    c.save();
    c.translate(x, y);
    c.scale(1, 0.95);                 // 源文件同样是轻微压扁的圆
    c.globalAlpha = a;
    c.fillStyle = color;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  /* =========================================================================
   * 五、绘制：两种模式的视觉带
   * ========================================================================= */

  // mode='run'：完整复刻源动画的视觉带
  function drawRunBand(c, L, t, colors, reduced) {
    drawBeam(c, L, colors.ink, 1);

    drawFigure(c, L.sprites.L, L.centerL, L.figTop, L.figH);
    drawFigure(c, L.sprites.R, L.centerR, L.figTop, L.figH);

    if (reduced) {
      // 静止帧：一个光点定格在传送线中点（p=0.5 时 x 基本就是线段中点）
      drawPacket(c, L, 0.5, colors.ink, true);
      return;
    }
    var tt = t % PKT.loop;
    for (var i = 0; i < PKT.emit.length; i++) {
      var age = (tt - PKT.emit[i] + PKT.loop) % PKT.loop;
      if (age <= PKT.travel) drawPacket(c, L, age / PKT.travel, colors.ink, false);
    }
  }

  /* =========================================================================
   * 六、绘制：三行文字
   * ========================================================================= */

  function ellipsize(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    var chars = Array.from(text);
    while (chars.length > 1) {
      chars.pop();
      var trial = chars.join('') + '…';
      if (ctx.measureText(trial).width <= maxW) return trial;
    }
    return '…';
  }

  function fitLine(ctx, text, weight, size, maxW) {
    var s = size;
    text = text == null ? '' : String(text);
    ctx.font = weight + ' ' + s + 'px ' + FONT_STACK;
    while (s > size * 0.8 && ctx.measureText(text).width > maxW) {
      s -= 0.5;
      ctx.font = weight + ' ' + s + 'px ' + FONT_STACK;
    }
    if (ctx.measureText(text).width > maxW) {
      text = ellipsize(ctx, text, maxW);
      ctx.font = weight + ' ' + s + 'px ' + FONT_STACK;
    }
    return { text: text, font: weight + ' ' + s + 'px ' + FONT_STACK, width: ctx.measureText(text).width };
  }

  function buildMetrics(ctx, L, state) {
    var title = fitLine(ctx, state.title, TEXT.titleWeight, L.text.titleSize, L.text.maxW);
    var meta = fitLine(ctx, state.meta, TEXT.lineWeight, L.text.lineSize, L.text.maxW);
    var action = fitLine(ctx, state.action, TEXT.lineWeight, L.text.lineSize, L.text.maxW);

    return {
      title: title,
      meta: meta,
      action: action,
      startX: L.text.cx - title.width / 2
    };
  }

  function drawText(c, L, M, t, colors, reduced) {
    if (!M) return;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    // 三条文字同色（固定墨色，不跟主题色）、同字重、无标题点动画。
    c.fillStyle = colors.ink;
    c.globalAlpha = 1;

    c.font = M.title.font;
    c.fillText(M.title.text, M.startX, L.text.lineY[0]);

    c.font = M.meta.font;
    c.fillText(M.meta.text, L.text.cx - M.meta.width / 2, L.text.lineY[1]);

    c.font = M.action.font;
    c.fillText(M.action.text, L.text.cx - M.action.width / 2, L.text.lineY[2]);

    c.globalAlpha = 1;
  }

  /* =========================================================================
   * 七、引擎实例
   * ========================================================================= */

  function create(host, opts) {
    if (!host || !host.appendChild) throw new Error('[marRunEngine] host is required');
    opts = opts || {};

    var height = clamp(parseInt(opts.height, 10) || DEFAULT_HEIGHT, 96, 240);
    var explicitReduced = opts.reduced != null;
    var reducedMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

    var state = {
      mode: opts.mode === 'think' ? 'think' : 'run',
      title: opts.title != null ? String(opts.title) : '深度求索中',
      meta: opts.meta != null ? String(opts.meta) : '用时 0 秒',
      action: opts.action != null ? String(opts.action) : '调用工具 · read',
      ink: opts.ink != null ? opts.ink : null,
      dim: opts.dim != null ? opts.dim : null,
      reduced: explicitReduced ? !!opts.reduced : !!(reducedMq && reducedMq.matches)
    };

    var cv = document.createElement('canvas');
    cv.className = 'mar-run-canvas';
    cv.setAttribute('aria-hidden', 'true');
    cv.style.display = 'block';
    cv.style.width = '100%';
    cv.style.height = height + 'px';
    cv.style.pointerEvents = 'none';
    host.appendChild(cv);

    var ctx = cv.getContext('2d');
    var W = 0, dpr = 1, L = null, M = null;
    var colors = { ink: '#C0FE04', dim: 'rgba(192,254,4,0.72)', dimAlpha: 1 };
    var sprites = { key: '', L: null, R: null };
    var raf = 0;
    var destroyed = false;
    var t0 = (window.performance && performance.now ? performance.now() : Date.now());
    var hiddenAt = 0;
    var observer = null;

    function nowMs() {
      return (window.performance && performance.now) ? performance.now() : Date.now();
    }

    function readInk() {
      // 2026-11-05 用户：两个动画都**不跟主题色**走，固定用我们设定的颜色。
      var ink = state.ink || '#C0FE04';
      ink = normalizeColor(ink) || '#C0FE04';
      colors.ink = ink;
      colors.dim = alphaColor(ink, 0.72) || ink;
      colors.dimAlpha = 1;
    }

    function ensureSprites() {
      var key = dpr + '|' + L.figH + '|' + colors.ink;
      if (sprites.key === key) return;
      sprites.key = key;
      sprites.L = buildFigureSprite(L.figH, dpr, colors.ink, true);
      sprites.R = buildFigureSprite(L.figH, dpr, colors.ink, false);
    }

    function rebuild() {
      if (!L) return;
      L.sprites = sprites;
      ensureSprites();
      M = buildMetrics(ctx, L, state);
    }

    function layout() {
      var w = Math.round(host.clientWidth || 0);
      if (w < 1) w = opts.fallbackWidth ? Math.round(opts.fallbackWidth) : 0;
      if (w < 1) return false;
      var d = Math.min(window.devicePixelRatio || 1, 3);
      if (w === W && d === dpr && L) return false;

      W = w;
      dpr = d;
      cv.width = Math.max(1, Math.round(W * dpr));
      cv.height = Math.max(1, Math.round(H() * dpr));
      cv.style.width = '100%';
      cv.style.height = height + 'px';
      L = computeLayout(W, height);
      sprites.key = '';
      readInk();
      rebuild();
      return true;
    }

    function H() { return height; }

    function render(t) {
      if (!L) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      drawRunBand(ctx, L, t, colors, state.reduced);
      drawText(ctx, L, M, t, colors, state.reduced);
    }

    function tick(now) {
      raf = 0;
      if (destroyed || state.reduced || document.hidden) return;
      var t = ((now == null ? nowMs() : now) - t0) / 1000;
      render(t);
      raf = requestAnimationFrame(tick);
    }

    function start() {
      if (destroyed || raf) return;
      if (state.reduced || document.hidden) {
        render(state.reduced ? 0.35 : (nowMs() - t0) / 1000);
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    function stop() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    function onResize() {
      if (destroyed) return;
      if (layout()) {
        if (state.reduced) render(0.35); else start();
      }
    }

    function onVisibility() {
      if (destroyed) return;
      if (document.hidden) {
        hiddenAt = nowMs();
        stop();
      } else {
        if (hiddenAt) {
          t0 += nowMs() - hiddenAt;
          hiddenAt = 0;
        }
        start();
      }
    }

    function onMotionPreference() {
      if (explicitReduced || destroyed) return;
      state.reduced = !!(reducedMq && reducedMq.matches);
      if (state.reduced) { stop(); render(0.35); } else start();
    }

    function set(patch) {
      if (destroyed || !patch) return api;
      if (patch.mode != null) state.mode = patch.mode === 'think' ? 'think' : 'run';
      if (patch.title != null) state.title = String(patch.title);
      if (patch.meta != null) state.meta = String(patch.meta);
      if (patch.action != null) state.action = String(patch.action);
      if (patch.ink !== undefined) state.ink = patch.ink == null ? null : patch.ink;
      if (patch.dim !== undefined) state.dim = patch.dim == null ? null : patch.dim;
      if (patch.reduced != null) {
        state.reduced = !!patch.reduced;
        explicitReduced = true;
      }
      readInk();
      rebuild();
      if (state.reduced) {
        stop();
        render(0.35);
      } else {
        start();
      }
      return api;
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      stop();
      if (observer) {
        try { observer.disconnect(); } catch (e) { /* noop */ }
        observer = null;
      }
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      if (reducedMq && reducedMq.removeEventListener) {
        reducedMq.removeEventListener('change', onMotionPreference);
      }
      if (cv.parentNode) cv.parentNode.removeChild(cv);
    }

    // ---- 首次布局 + 监听 ---------------------------------------------------
    layout();
    if (L) {
      start();
    } else {
      // host 还没有尺寸（例如刚插入 DOM）：等一帧再量。
      requestAnimationFrame(function () { onResize(); });
    }

    if (window.ResizeObserver) {
      observer = new ResizeObserver(onResize);
      try { observer.observe(host); } catch (e) { observer = null; }
    }
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    if (reducedMq && reducedMq.addEventListener) {
      reducedMq.addEventListener('change', onMotionPreference);
    }

    var api = {
      set: set,
      destroy: destroy,
      canvas: cv,
      resize: onResize,
      // 验收用：当前布局（居中人形 + 直线；sag 必须为 0）。
      metrics: function () {
        if (!L) return null;
        return {
          width: W,
          height: height,
          beamX0: L.beam.x0,
          beamX1: L.beam.x1,
          beamCy: L.beam.cy,
          beamSpan: L.beam.x1 - L.beam.x0,
          sag: L.beam.sag,
          beamHalfH: L.beam.halfH,
          beamCap: L.beam.cap == null ? 0 : L.beam.cap,
          figH: L.figH,
          textLineY: L.text.lineY.slice(),
          ink: colors.ink,
          titleWeight: TEXT.titleWeight,
          lineWeight: TEXT.lineWeight,
          titleDots: 0,
          figure: {
            headW: FIG.rects[0][2],
            torsoW: FIG.rects[2][2],
            armW: FIG.rects[1][2],
            legW: FIG.legs[0][1],
            armGap: FIG.rects[2][0] - (FIG.rects[1][0] + FIG.rects[1][2]),
            neckGap: FIG.rects[1][1] - (FIG.rects[0][1] + FIG.rects[0][3]),
            hollowInset: FIG.inset,
            armX0: FIG.rects[1][0],
            armX1: FIG.rects[1][0] + FIG.rects[1][2],
            torsoX0: FIG.rects[2][0],
            torsoX1: FIG.rects[2][0] + FIG.rects[2][2],
            legX0: FIG.legs[0][0],
            legX1: FIG.legs[0][0] + FIG.legs[0][1],
            legRightX0: FIG.legs[1][0]
          }
        };
      },
      // 验收/截图辅助：暂停 RAF 并把画面定格在指定时间（秒）。
      renderAt: function (seconds) {
        var v = parseFloat(seconds);
        if (destroyed || !isFinite(v)) return api;
        stop();
        render(v);
        return api;
      },
      pause: function () { stop(); return api; },
      resume: function () { start(); return api; }
    };
    return api;
  }

  window.__marRunEngine = {
    create: create,
    version: '0.1.0'
  };
})();
