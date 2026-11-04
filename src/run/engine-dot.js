/* ===========================================================================
 * dsh-theme-mls-desktop213 — 输入框右侧「点阵动画」引擎（动画1）
 * -----------------------------------------------------------------------------
 * 只负责一块方形 canvas：把 src/run/think-anim1.js 的 21×21 有机体画出来。
 * 与运行动画条带（engine-run.js）完全独立：
 *   · 不画任何文字、不接管原生提示；
 *   · 没有静态点阵底/边框 —— 第一帧几乎是空的，格子随时间逐格生长；
 *   · host 的尺寸由插件算好（输入卡右侧的空白），这里只按 host 尺寸铺满。
 *
 * 对外 API（无 import / require / 网络）：
 *
 *   var inst = window.__marDotEngine.create(host, { reduced: false });
 *   inst.set({ reduced: false });      // ink 参数保留但忽略：颜色固定
 *   inst.destroy();
 * ========================================================================= */
(function () {
  'use strict';

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
  }

  function create(host, opts) {
    opts = opts || {};
    if (!host) throw new Error('dot engine: host required');
    if (typeof window === 'undefined' || !window.__marThinkAnim ||
        typeof window.__marThinkAnim.draw !== 'function') {
      throw new Error('dot engine: __marThinkAnim missing');
    }

    var cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'display:block;width:100%;height:100%;';
    host.appendChild(cv);
    var ctx = cv.getContext('2d');

    var state = {
      reduced: opts.reduced === true,
      fresh: opts.fresh || '#C0FE04'
    };
    var reducedMq = null;
    try { reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { reducedMq = null; }
    var explicitReduced = opts.reduced !== undefined;
    var w = 0, h = 0, dpr = 1, raf = 0, t0 = nowMs(), hiddenAt = 0, destroyed = false;

    function layout() {
      var r = host.getBoundingClientRect();
      var nw = Math.max(1, Math.round(r.width));
      var nh = Math.max(1, Math.round(r.height));
      var nd = Math.min(window.devicePixelRatio || 1, 3);
      if (nw === w && nh === h && nd === dpr) return false;
      w = nw; h = nh; dpr = nd;
      cv.width = Math.max(1, Math.round(w * dpr));
      cv.height = Math.max(1, Math.round(h * dpr));
      return true;
    }

    function render(t) {
      if (!w || !h) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var size = Math.min(w, h);
      window.__marThinkAnim.draw(ctx, w / 2, h / 2, size, t, state.reduced, state.fresh);
    }

    function tick(now) {
      raf = 0;
      if (destroyed || state.reduced || document.hidden) return;
      render(((now == null ? nowMs() : now) - t0) / 1000);
      raf = requestAnimationFrame(tick);
    }

    function start() {
      if (destroyed || raf) return;
      if (state.reduced || document.hidden) {
        render(state.reduced ? 3.2 : (nowMs() - t0) / 1000);
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    function stop() {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }

    function onResize() {
      if (destroyed) return;
      if (layout()) { render((nowMs() - t0) / 1000); }
    }

    function onVisibility() {
      if (destroyed) return;
      if (document.hidden) {
        hiddenAt = nowMs();
        stop();
      } else {
        if (hiddenAt) { t0 += nowMs() - hiddenAt; hiddenAt = 0; }
        start();
      }
    }

    function onMotionPreference() {
      if (explicitReduced || destroyed) return;
      state.reduced = !!(reducedMq && reducedMq.matches);
      if (state.reduced) { stop(); render(3.2); } else start();
    }

    var observer = null;
    layout();
    render(0);
    start();
    if (window.ResizeObserver) {
      observer = new ResizeObserver(onResize);
      try { observer.observe(host); } catch (e) { observer = null; }
    }
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    if (reducedMq && reducedMq.addEventListener) reducedMq.addEventListener('change', onMotionPreference);

    var api = {
      set: function (patch) {
        if (destroyed || !patch) return api;
        // `fresh` is the “新生格” colour: fixed #C0FE04 by default, or the
        // active theme accent when the user turns 跟随主题色 on.
        if (patch.fresh !== undefined) state.fresh = patch.fresh == null ? '#C0FE04' : String(patch.fresh);
        if (patch.reduced != null) {
          state.reduced = !!patch.reduced;
          explicitReduced = true;
        }
        if (state.reduced) { stop(); render(3.2); } else start();
        return api;
      },
      resize: function () { onResize(); return api; },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        stop();
        if (observer) { try { observer.disconnect(); } catch (e) {} observer = null; }
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVisibility);
        if (reducedMq && reducedMq.removeEventListener) reducedMq.removeEventListener('change', onMotionPreference);
        if (cv.parentNode) cv.parentNode.removeChild(cv);
      }
    };
    return api;
  }

  window.__marDotEngine = { create: create, version: '1.0.0' };
})();
