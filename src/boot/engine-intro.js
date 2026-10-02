/* ===========================================================================
 * dsh-theme-mls-desktop — Boot payload: intro stage engine + orchestrator
 * -----------------------------------------------------------------------------
 * Desktop cut of the standalone intro (启动动画.html). The timeline is not
 * duplicated here: every delay/duration is read back from the CSS custom
 * properties on #dshMarBootHost that the keyframes themselves use, so retiming
 * the reveal is a one-file change in src/boot/boot.css.
 *
 * Reveal contract (the whole point of this stage on desktop):
 *      first     the green whale logo, alone on a TRANSPARENT window
 *      then      caption -> the five HUI frames, one after another -> blue tile
 *      then      the blue tile zooms to full screen and hands over to the
 *                marathon stage through one opaque #mb-solid-bg beat
 *
 * Desktop-only duties handled here:
 *   - html/body/#root backgrounds are forced to `transparent` for the duration,
 *     so the Electron window's alpha surface is what shows the desktop.
 *   - the native Windows caption buttons are hidden for the animation and
 *     restored on every exit path (end, failure, dispose).
 *   - `window.__mbIntroStop()` is the single teardown hook the host driver calls
 *     on normal end, on the watchdog, and on plugin dispose.
 *
 * Every desktop-only step degrades to a no-op on a stock shell or in a browser:
 * `dshDesktopBoot.chrome` simply does not exist there, and the animation still
 * plays — just with the window's own chrome and background.
 *
 * If the marathon engine failed to load, the orchestrator still calls
 * window.__mbBootDone() so the overlay is never left stuck on screen.
 * ========================================================================= */
(function () {
  'use strict';

  var hostEl = document.getElementById('dshMarBootHost');
  if (!hostEl) return;
  function q(s) { return hostEl.querySelector(s); }

  var HUI = [1, 2, 3, 4, 5];
  var HUI_END_SCALE = 7, HUI_LAYER_STEP = 0.3;
  var HUI_SPEED = 0.03, HUI_POWER = 6;
  var BLUE_SPEED = 0.01, BLUE_POWER = 30;
  var HOLD_MS = 1000;    // how long the flat blue plate sits before the handover
  var LOGO_FADE_MS = 400;

  var rafIds = [];
  var timers = [];

  // ---- timeline read back from CSS ------------------------------------------
  function cssNumber(name, fallback) {
    var raw = '';
    try { raw = (getComputedStyle(hostEl).getPropertyValue(name) || '').trim(); } catch (e) { raw = ''; }
    var value = parseFloat(raw);
    return isFinite(value) ? value : fallback;
  }
  function cssMs(name, fallbackSeconds) {
    return Math.round(cssNumber(name, fallbackSeconds) * 1000);
  }
  var T = {
    hui:      cssMs('--mb-t-hui', 2.35),
    huiStep:  cssMs('--mb-t-hui-step', 0.10),
    huiRush:  cssMs('--mb-t-hui-rush', 2.86),
    huiDur:   cssMs('--mb-t-hui-dur', 2.80),
    blueRush: cssMs('--mb-t-blue-rush', 2.88),
    blueDur:  cssMs('--mb-t-blue-dur', 2.85)
  };

  // ---- desktop window chrome -----------------------------------------------
  // Root attribute + the `html[data-mar-boot]` rule in boot.css let the
  // stylesheet drop DSH's own backgrounds while the overlay is up, so the window
  // has nothing opaque over its alpha surface.
  var rootEl = document.documentElement;
  var forcedTransparent = false;
  function forceTransparent(on) {
    if (!rootEl) return;
    if (on) {
      if (!forcedTransparent) {
        rootEl.setAttribute('data-mar-boot', '');
        forcedTransparent = true;
      }
      return;
    }
    if (forcedTransparent) {
      rootEl.removeAttribute('data-mar-boot');
      forcedTransparent = false;
    }
  }

  // Resolved once: `false` means "this shell has no boot-chrome bridge" (stock
  // desktop build, browser, or jsdom in tests), so every later call is a no-op.
  // `chromeSent` drops repeats: the start hook is called both by this engine and,
  // as a fallback, by the host, and one IPC per actual state change is enough.
  //
  // Two names are accepted. `dshDesktopBootChrome` is the one the desktop patch
  // actually installs; it exists because `dshDesktopBoot` belongs to the shell
  // and is exposed in the MAIN world, so a preload cannot add a method to it --
  // `globalThis.dshDesktopBoot` is undefined in the preload's own isolated world,
  // and re-exposing the same name throws "Cannot bind an API on top of an
  // existing property". The fallback covers a shell that ever implements it
  // natively.
  //
  // The second argument names the caller. It is optional and exists only so the
  // shell's stdout can tell this call apart from the packaged-document patch,
  // which speaks the same two-state language over the same channel; before it,
  // a cold-start trace showed two identical `boot chrome hidden` lines with no
  // way to attribute either.
  var chrome = null;
  var chromeSent = null;
  function setChrome(visible) {
    if (chrome === null) {
      var bridge = (typeof window !== 'undefined') ? window.dshDesktopBootChrome : null;
      var boot = (typeof window !== 'undefined') ? window.dshDesktopBoot : null;
      if (bridge && typeof bridge.chrome === 'function') chrome = bridge.chrome;
      else if (boot && typeof boot.chrome === 'function') chrome = boot.chrome;
      else chrome = false;
    }
    if (chrome === false) return;
    if (chromeSent === visible) return;
    try { chrome(visible, 'theme'); chromeSent = visible; } catch (e) { chrome = false; }
  }

  function later(fn, ms) {
    var id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  // ---- zoom engines --------------------------------------------------------
  function makeEase(endScale, initialSpeed, power) {
    return function (t) {
      var p = initialSpeed * t + (1 - initialSpeed) * Math.pow(t, power);
      return 1 + (endScale - 1) * p;
    };
  }
  function rush(els, startMs, endScale, initialSpeed, power, durationMs) {
    later(function () {
      var t0 = performance.now();
      for (var i = 0; i < els.length; i++) {
        if (els[i]) els[i].classList.add('mb-rush');
      }
      var ease = makeEase(endScale, initialSpeed, power);
      function step(now) {
        var t = Math.min((now - t0) / durationMs, 1);
        var scale = ease(t);
        for (var j = 0; j < els.length; j++) {
          if (els[j]) els[j].style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
        }
        if (t < 1) rafIds.push(requestAnimationFrame(step));
      }
      rafIds.push(requestAnimationFrame(step));
    }, startMs);
  }

  // All five frames start zooming at the SAME instant, each carrying its own end
  // scale. The standalone does `[1..5].forEach(... run(..., 2860, ...))`, i.e. it
  // does not stagger the zoom at all -- only the hard-cut appearance is
  // staggered (2.35s .. 2.75s, via the CSS delays). Staggering the zoom as well
  // (which this used to do, one frame every 220ms from 1.28s) turns the five
  // nested frames into a visible cascade instead of one simultaneous flare.
  for (var n = 0; n < HUI.length; n++) {
    var order = HUI[n];
    var endScale = HUI_END_SCALE * (1 + (5 - order) * HUI_LAYER_STEP);
    rush([q('.mb-hui-' + order)], T.huiRush, endScale, HUI_SPEED, HUI_POWER, T.huiDur);
  }
  // Both blue elements start together at 2.88s. The tile's opacity fade-in is
  // its own CSS animation at 3.06s; only its transform is driven from here.
  rush([q('.mb-logo-blue')], T.blueRush, 40, BLUE_SPEED, BLUE_POWER, T.blueDur);
  rush([q('.mb-logo-blue-bg')], T.blueRush, 40, BLUE_SPEED, BLUE_POWER, T.blueDur);

  // ---- orchestration: intro -> flat blue -> handover to marathon ------------
  var solidBg = q('#mb-solid-bg');
  var logoBlueBg = q('.mb-logo-blue-bg');
  var logoTop = q('.mb-logo-top');
  var caption = q('.mb-caption');
  var boot = q('#mb-boot');

  // The blue plate is fully covering once the slowest zoom has landed
  // (2.88s + 2.85s = 5.73s, the standalone's SOLID_COVER_AT).
  var COVER_AT = T.blueRush + T.blueDur;

  function stop() {
    for (var i = 0; i < rafIds.length; i++) cancelAnimationFrame(rafIds[i]);
    rafIds = [];
    for (var j = 0; j < timers.length; j++) clearTimeout(timers[j]);
    timers = [];
  }

  // 1) the zoom has covered the window: make the plate opaque and drop the
  //    scaling blue tile underneath it (blue on blue, so no discontinuity).
  //    This is also where the page stops being see-through: from here on the
  //    opaque #mb-solid-bg (then the marathon canvas, which paints the same
  //    blue) covers the window, so the theme's own field canvas and DSH's page
  //    plates can come back underneath without anything popping. Releasing the
  //    attribute this early is deliberate -- holding it until teardown would
  //    make the dot field reappear only after the overlay had already faded,
  //    i.e. as a visible flash on an otherwise settled screen.
  later(function () {
    if (solidBg) solidBg.style.opacity = '1';
    if (logoBlueBg) logoBlueBg.style.display = 'none';
    forceTransparent(false);
  }, COVER_AT);

  // 2) the flat plate holds for a beat, then the green marks fade off it.
  //
  // 2026-09-26 — the fade is declared `!important` because the two marks are
  // the only intro elements that could ever grow a CSS animation of their own
  // (they have none today, deliberately: the standalone shows them from frame 0),
  // and a finished animation's forwards fill sits above every normal author
  // declaration *including inline styles*. Important inline declarations are the
  // one thing that outranks an animation, so this stays correct either way.
  function fadeOut(el) {
    if (!el) return;
    el.style.transition = 'opacity ' + LOGO_FADE_MS + 'ms ease';
    try { el.style.setProperty('opacity', '0', 'important'); }
    catch (e) { el.style.opacity = '0'; }
  }
  later(function () {
    fadeOut(logoTop);
    fadeOut(caption);
  }, COVER_AT + HOLD_MS);

  // 3) marks gone: reveal the marathon stage (its first canvas frame paints the
  //    same blue), then release the desktop chrome when the whole boot ends.
  later(function () {
    if (boot) boot.style.opacity = '1';
    if (typeof window.__mbMarathon.start === 'function') {
      window.__mbMarathon.start();
    } else if (typeof window.__mbBootDone === 'function') {
      window.__mbBootDone();
    }
  }, COVER_AT + HOLD_MS + LOGO_FADE_MS);

  // ---- lifecycle hooks -----------------------------------------------------
  // Called by host buildBoot() before the payload runs: hide the window buttons,
  // make the page transparent, and never leave either stuck.
  window.__mbIntroStart = function () {
    forceTransparent(true);
    setChrome(false);
  };
  // Called by host teardown (normal end, watchdog, or plugin dispose).
  window.__mbIntroStop = function () {
    stop();
    forceTransparent(false);
    setChrome(true);
  };

  // 2026-09-26 — announce ourselves. The host used to call __mbIntroStart()
  // *before* appending this script (it appends the marathon engine, calls the
  // hook, then appends the intro), so the hook did not exist yet, the call was
  // an undefined-guarded no-op, and neither half of the desktop contract ever
  // happened: html/body/#root kept DSH's opaque background (so the transparent
  // window showed nothing) and the native caption buttons stayed visible for the
  // whole animation.
  //
  // Running it at the end of this IIFE is still inside the same synchronous task
  // as mounting the overlay — classic scripts execute on append — so no frame is
  // painted in between and the very first one is already transparent. Both steps
  // are idempotent, so the host may keep calling the hook.
  window.__mbIntroStart();
})();
