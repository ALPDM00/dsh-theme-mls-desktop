/* src/scene/engine-scene.js — TAU CETI IV 线框星球背景（WebGL，零依赖）
 *
 * 构建时被 scripts/build.cjs 读成字符串，JSON 内联进 client.js 的
 * SCENE_PAYLOAD.engine；客户端在需要时把它当一个 classic <script> 追加进文档
 * （same trick as BOOT_PAYLOAD，见 client.template.js 的 injectScript）。
 *
 * 对外只有 window.__marScene 一个对象：
 *   available()             WebGL 能否用（禁用硬件加速 / 远程桌面 → false）
 *   mount(canvas, opts)     canvas 由客户端创建并挂好，这里只接管它的 GL
 *   unmount()               停 rAF、摘监听、释放 GL 资源
 *   setOption(key, value)   opacity | drag | spin | fps
 *   setPlace(name)          切场景（本版只有 planet，三张地图留给下一段）
 *   stats()                 调试用 {fps, segments, place, gl}
 *
 * 数据走宿主路由（.msc v1，见 docs/PLAN-SCENE-BACKGROUND.md §6），宿主解压后的
 * 二进制正好是 Int16Array / Uint32Array 的视图 —— 客户端不需要 DecompressionStream。
 *
 * 视觉参数全部来自官方 /explorer（技术分析.md §3.1）：
 *   相机 fov 6°（长焦）、初始机位 (-12,12,12)、星球线 #5200FF、飞船线 #F24723、
 *   group scale = 2（PLANET_RADIUS = 0.5 → 世界半径 1）。
 *   官方那颗 29KB 的 FBX 星球网格在背景里只干一件事：**写深度**，把背面的线和
 *   被星球挡住的飞船藏起来。这里用一个程序生成的球面顶替它（只写深度、不写
 *   颜色），否则线框会前后两层叠在画面里，观感完全不同。
 */
(function (global) {
  'use strict';

  var ROUTE = '/dsh-mls-scene/';           // host 路由前缀，见 index.js
  var WORLD = 2;                           // 官方 <group scale={1 / PLANET_RADIUS}>, PLANET_RADIUS = 0.5

  /* ---- 相机：全部照官方 862914f853440105.js 的数值 ------------------------
   *
   * 官方进入动画（用户实测 + `tR()` 源码对齐）：
   *   - **星球全程在画面里**，一开始只是 opacity 0（看不见），1s 内淡入；
   *   - 相机半径从头到尾不变（20.7846），只插值两个角：
   *       仰角 35.26° → 9.47°、方位角 −45° → 0°，缓动 power1.inOut（二次）；
   *   - 视线目标**一直是原点**（`tR` 里那句 `controls.target → (0,0,0)` 在官方
   *     运行时本来就是 (0,0,0)，是个空动画）。所以画面上是"球面经纬线向左上方
   *     滑过去"，而不是"星球从画面外扫进来"（我第一版按计划书的 dolly-in 描述做错，
   *     第二版又把视线目标拉回原点、等于把星球甩出画面，都改了）。
   *   - 线框淡入是独立时间线：几何就绪后 1s，power2.inOut（官方 `LineSegments fade`）。
   *
   * 自转：OrbitControls autoRotate / autoRotateSpeed 0.5
   *   angle/s = (2π/60) × 0.5 = 0.05236 rad/s（3°/s），方向 rotateLeft → 方位角递减
   *   （= 从观察者看**逆时针**，与用户 2026-11-26 的要求一致）。
   */
  var RADIUS = Math.sqrt(432);             // |(-12,12,12)| = 20.7846，官方全程不变的机位半径
  var YAW_A = -Math.PI / 4;                // 起始方位角 atan2(-12, 12)
  var PITCH_A = Math.asin(12 / RADIUS);    // 起始仰角 35.26°
  var YAW_B = 0;                           // 终点方位角：官方把相机落到 +z 轴上
  var PITCH_B = Math.asin(5 / Math.sqrt(925));   // 终点仰角 9.47°（h × normalize(0,5,30)）
  var INTRO_MS = 1000;                     // 官方 duration: 1
  var FADE_MS = 1000;                      // 官方 LineSegments fade：opacity 0→1，1s
  var SPIN = (Math.PI * 2 / 60) * 0.5;     // autoRotateSpeed 0.5
  var SPIN_SIGN = -1;                      // rotateLeft：方位角递减

  //  底板色（深色 = --mar-bg-void #0B0D0B，浅色 = #FFFFFF）由客户端传进来，
  //  清屏色、深度球的填充、画布 CSS 底色三者必须同一个色 —— 否则 WebGL 的纯黑
  //  会和 DSH 的底盘差一档（用户 2026-11-26："背景的黑色应该要与 deepseekharness
  //  的黑色保持一致，目前的更黑"）。
  var DEFAULT_BG = [0x0B / 255, 0x0D / 255, 0x0B / 255];
  //  线色：深色底盘用官方 PRIMARY / RED；浅色底盘同色相压暗一点，白底上够清楚。
  var INK = {
    dark: { planet: [0x52 / 255, 0x00 / 255, 0xFF / 255], ship: [0xF2 / 255, 0x47 / 255, 0x23 / 255] },
    light: { planet: [0x46 / 255, 0x00 / 255, 0xD8 / 255], ship: [0xCE / 255, 0x33 / 255, 0x14 / 255] }
  };

  /* 每个场景要拉的文件。planet = 星球线框 + 贴在球面上的飞船。 */
  var PLACES = {
    planet: { files: ['planet', 'ship'], fov: 6, dist: RADIUS }
  };

  var state = {
    canvas: null,
    gl: null,
    loc: null,
    buffers: {},             // name -> { kind, vbo, ibo, count, V, indexType, center, half, segments }
    occluder: null,          // 只写深度的球
    place: 'planet',
    cam: { yaw: YAW_A, pitch: PITCH_A, dist: RADIUS, fov: 6, baseDist: RADIUS },
    opts: {
      opacity: 0.85, drag: true, spin: true, fps: 30, still: false,
      bg: DEFAULT_BG.slice(0),   // 底板色（客户端按当前配色传 --mar-bg-void）
      light: false               // 浅色底盘：线色压暗、深度球填白底
    },
    alpha: 0,
    fadeStart: 0,            // 几何第一次就绪的时刻；线框淡入从这一刻起算
    started: 0,
    intro: 0,                // 0..1，进入动画进度
    raf: 0,
    lastMs: 0,
    drawMs: 0,
    frames: 0,
    fpsAt: 0,
    fpsValue: 0,
    drag: null,
    mounted: false,
    supported: null,
    pending: {}              // name -> { ok: [fn], fail: [fn] }
  };

  /* ---------------------------------------------------------------- 矩阵 -- */

  function mat4() { return new Float32Array(16); }

  function perspective(out, fovyDeg, aspect, near, far) {
    var f = 1 / Math.tan(fovyDeg * Math.PI / 360);
    var nf = 1 / (near - far);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
    return out;
  }

  function lookAt(out, eye, center, up) {
    var zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    var zl = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;
    var xx = up[1] * zz - up[2] * zy;
    var xy = up[2] * zx - up[0] * zz;
    var xz = up[0] * zy - up[1] * zx;
    var xl = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1;
    xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy;
    var yy = zz * xx - zx * xz;
    var yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  }

  function mul(out, a, b) {
    var o = (out === a || out === b) ? mat4() : out;
    for (var c = 0; c < 4; c++) {
      var b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return o;
  }

  /* ------------------------------------------------------------------ GL -- */

  var VS = [
    'attribute vec3 aPos;',
    'uniform vec3 uCenter;',
    'uniform vec3 uHalf;',
    'uniform mat4 uMVP;',
    'uniform float uPointSize;',
    'void main() {',
    '  vec3 p = uCenter + aPos * uHalf;',
    '  gl_Position = uMVP * vec4(p, 1.0);',
    '  gl_PointSize = uPointSize;',
    '}'
  ].join('\n');

  var FS = [
    'precision mediump float;',
    'uniform vec4 uColor;',
    'void main() {',
    '  gl_FragColor = uColor;',
    '}'
  ].join('\n');

  function createGL(canvas) {
    var attrs = {
      alpha: false, antialias: true, depth: true, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false,
      powerPreference: 'low-power'
    };
    var gl = null;
    try { gl = canvas.getContext('webgl2', attrs); } catch (e) { gl = null; }
    if (!gl) {
      try {
        gl = canvas.getContext('webgl', attrs) ||
          canvas.getContext('experimental-webgl', attrs);
      } catch (e2) { gl = null; }
    }
    return gl || null;
  }

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('scene shader: ' + log);
    }
    return s;
  }

  function buildProgram(gl) {
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('scene program: ' + gl.getProgramInfoLog(prog));
    }
    return {
      prog: prog,
      aPos: gl.getAttribLocation(prog, 'aPos'),
      uCenter: gl.getUniformLocation(prog, 'uCenter'),
      uHalf: gl.getUniformLocation(prog, 'uHalf'),
      uMVP: gl.getUniformLocation(prog, 'uMVP'),
      uColor: gl.getUniformLocation(prog, 'uColor'),
      uPointSize: gl.getUniformLocation(prog, 'uPointSize')
    };
  }

  /* --------------------------------------------------------- .msc 解码 -- */

  function parseMsc(buf) {
    var dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x3143534D) throw new Error('bad .msc magic');
    var kind = dv.getUint32(4, true);
    var V = dv.getUint32(8, true);
    var I = dv.getUint32(12, true);
    var bbox = [];
    for (var k = 0; k < 6; k++) bbox.push(dv.getFloat32(16 + k * 4, true));
    var pad = (4 - (V * 6) % 4) % 4;
    var idxOff = 40 + V * 6 + pad;
    if (idxOff + I * 4 !== buf.byteLength) throw new Error('bad .msc size');
    return {
      kind: kind, V: V, I: I,
      pos: new Int16Array(buf, 40, V * 3),
      idx: new Uint32Array(buf, idxOff, I),
      center: [(bbox[0] + bbox[1]) / 2 * WORLD,
               (bbox[2] + bbox[3]) / 2 * WORLD,
               (bbox[4] + bbox[5]) / 2 * WORLD],
      half: [(bbox[1] - bbox[0]) / 2 * WORLD,
             (bbox[3] - bbox[2]) / 2 * WORLD,
             (bbox[5] - bbox[4]) / 2 * WORLD]
    };
  }

  function upload(gl, data) {
    // 飞船 78,680 个索引 > 65535，必须走 uint32 索引 —— 那是 WebGL2 或
    // OES_element_index_uint 才有的能力。老机器（WebGL1 且无该扩展）上宁可少一条
    // 飞船，也不要 drawElements 抛异常把整个循环带停下。
    var shortIndex = data.I <= 65535 && data.V <= 65535;
    if (!shortIndex) {
      var isGL2 = !!(global.WebGL2RenderingContext && gl instanceof global.WebGL2RenderingContext);
      if (!isGL2 && !gl.getExtension('OES_element_index_uint')) {
        throw new Error('uint32 indices unsupported on this GL');
      }
    }
    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.pos, gl.STATIC_DRAW);
    var idx = shortIndex ? new Uint16Array(data.idx) : data.idx;
    var ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    return {
      vbo: vbo, ibo: ibo,
      count: data.I, V: data.V,
      indexType: shortIndex ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT,
      center: data.center, half: data.half,
      segments: data.I / 2
    };
  }

  /* 只写深度的球面：官方那颗 FBX mesh 的替身。
   * 半径比线框小 0.5%（0.995）+ LEQUAL：前半球线不会 z-fight，
   * 后半球线（以及藏进球里的飞船）被挡住 —— 这就是"正面网格"观感的来源。 */
  function buildOccluder(gl, radius) {
    var SEG = 64, RING = 40, i, j;
    var verts = [];
    for (i = 0; i <= RING; i++) {
      var v = i / RING * Math.PI;
      var sy = Math.cos(v), sr = Math.sin(v);
      for (j = 0; j <= SEG; j++) {
        var u = j / SEG * Math.PI * 2;
        verts.push(Math.cos(u) * sr * radius, sy * radius, Math.sin(u) * sr * radius);
      }
    }
    var idx = [];
    for (i = 0; i < RING; i++) {
      for (j = 0; j < SEG; j++) {
        var a = i * (SEG + 1) + j, b = a + SEG + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    var ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    return { vbo: vbo, ibo: ibo, count: idx.length };
  }

  /* --------------------------------------------------------------- 加载 -- */

  function loadScene(name, ok, fail) {
    if (state.buffers[name]) { if (ok) ok(state.buffers[name]); return; }
    if (state.pending[name]) {
      if (ok) state.pending[name].ok.push(ok);
      if (fail) state.pending[name].fail.push(fail);
      return;
    }
    var entry = { ok: ok ? [ok] : [], fail: fail ? [fail] : [] };
    state.pending[name] = entry;
    fetch(ROUTE + name + '.msc', { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.arrayBuffer();
      })
      .then(function (buf) {
        if (!state.gl) return;                     // 已经 unmount，丢掉这次结果
        var rec = upload(state.gl, parseMsc(buf));
        state.buffers[name] = rec;
        delete state.pending[name];
        // 官方 LineSegments 的 fade 是"几何就绪后 1s 淡入"，起点就是这一刻。
        if (!state.fadeStart) {
          state.fadeStart = (global.performance && performance.now()) || Date.now();
        }
        for (var i = 0; i < entry.ok.length; i++) { try { entry.ok[i](rec); } catch (e) {} }
      })
      .catch(function (err) {
        delete state.pending[name];
        for (var i = 0; i < entry.fail.length; i++) { try { entry.fail[i](err); } catch (e) {} }
        if (global.console && global.console.warn) global.console.warn('[scene] ' + name, err);
      });
  }

  /* --------------------------------------------------------------- 相机 -- */

  function eyeOf(cam) {
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    return [cam.dist * cp * Math.sin(cam.yaw), cam.dist * sp, cam.dist * cp * Math.cos(cam.yaw)];
  }

  function resize() {
    var c = state.canvas, gl = state.gl;
    if (!c || !gl) return;
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round((c.clientWidth || global.innerWidth || 1) * dpr));
    var h = Math.max(1, Math.round((c.clientHeight || global.innerHeight || 1) * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  //  GSAP 的缓动名要照字面翻译：power1 = 二次，power2 = 三次。
  function power1InOut(t) {          // 相机角度（power1.inOut）
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function power2InOut(t) {          // 线框淡入（power2.inOut）
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // '#0B0D0B' -> [0.043, 0.051, 0.043]，给 clearColor / 深度球用。
  function parseHex(hex) {
    var s = String(hex || '').replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return [parseInt(s.slice(0, 2), 16) / 255,
            parseInt(s.slice(2, 4), 16) / 255,
            parseInt(s.slice(4, 6), 16) / 255];
  }

  function setBg(hex) {
    var rgb = parseHex(hex);
    if (rgb) state.opts.bg = rgb;
  }

  function draw() {
    var gl = state.gl;
    if (!gl || !state.canvas) return;
    resize();
    var w = state.canvas.width, h = state.canvas.height;
    var cam = state.cam;
    var proj = perspective(mat4(), cam.fov, w / h,
      Math.max(0.5, cam.dist * 0.08), cam.dist * 8);
    // 视线目标恒为原点：官方 tR 里那句 controls.target → (0,0,0) 在运行时是空动画。
    // 所以星球全程居中，进入动画只体现为"经纬线向左上方滑 + 淡入"。
    var view = lookAt(mat4(), eyeOf(cam), [0, 0, 0], [0, 1, 0]);
    var mvp = mul(mat4(), proj, view);

    var bg = state.opts.bg || DEFAULT_BG;
    var ink = state.opts.light ? INK.light : INK.dark;

    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    var L = state.loc;
    gl.useProgram(L.prog);
    gl.uniformMatrix4fv(L.uMVP, false, mvp);
    gl.uniform1f(L.uPointSize, 1);
    gl.enableVertexAttribArray(L.aPos);

    /* 1) 深度球：用**底板色**填满，把背面的线和被挡住的飞船盖掉。
     *    深色底盘上就是原来的"只写深度"（黑盖黑，看不出区别）；浅色底盘必须是
     *    白色填充 —— 只写深度的话背面线框会透在白底上，星球就不是实心的了。 */
    if (state.occluder) {
      gl.uniform3f(L.uCenter, 0, 0, 0);
      gl.uniform3f(L.uHalf, 1, 1, 1);
      gl.uniform4f(L.uColor, bg[0], bg[1], bg[2], 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, state.occluder.vbo);
      gl.vertexAttribPointer(L.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, state.occluder.ibo);
      gl.drawElements(gl.TRIANGLES, state.occluder.count, gl.UNSIGNED_SHORT, 0);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    var a = state.alpha * state.opts.opacity;
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var names = ['planet', 'ship'];
    for (var i = 0; i < names.length; i++) {
      var rec = state.buffers[names[i]];
      if (!rec || !rec.count) continue;
      var col = names[i] === 'ship' ? ink.ship : ink.planet;
      gl.uniform3f(L.uCenter, rec.center[0], rec.center[1], rec.center[2]);
      gl.uniform3f(L.uHalf, rec.half[0], rec.half[1], rec.half[2]);
      gl.uniform4f(L.uColor, col[0], col[1], col[2], a);
      gl.bindBuffer(gl.ARRAY_BUFFER, rec.vbo);
      gl.vertexAttribPointer(L.aPos, 3, gl.SHORT, true, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, rec.ibo);
      gl.drawElements(gl.LINES, rec.count, rec.indexType, 0);
      /* 顶点点云（官方的 PointsField）：深度测试让背面的点自然消失。 */
      if (names[i] === 'planet') {
        gl.uniform1f(L.uPointSize, Math.max(1, 1.6 * dpr));
        gl.uniform4f(L.uColor, col[0], col[1], col[2], a * 0.35);
        gl.drawArrays(gl.POINTS, 0, rec.V);
        gl.uniform1f(L.uPointSize, 1);
      }
    }

    state.frames++;
    var now = (global.performance && performance.now()) || Date.now();
    if (!state.fpsAt) state.fpsAt = now;
    else if (now - state.fpsAt >= 1000) {
      state.fpsValue = Math.round(state.frames * 1000 / (now - state.fpsAt));
      state.frames = 0;
      state.fpsAt = now;
    }
  }

  function tick(now) {
    state.raf = 0;
    if (!state.mounted) return;
    if (global.document && global.document.hidden) return;   // visibilitychange 会把它拉回来
    var dt = state.lastMs ? Math.min(0.1, (now - state.lastMs) / 1000) : 0;
    state.lastMs = now;

    // ---- 进入动画：官方 tR() 的等距球面扫掠（视线目标恒在原点） --------------
    if (state.intro < 1) {
      state.intro = Math.min(1, (now - state.started) / INTRO_MS);
      var camE = power1InOut(state.intro);
      state.cam.yaw = YAW_A + (YAW_B - YAW_A) * camE;
      state.cam.pitch = PITCH_A + (PITCH_B - PITCH_A) * camE;
    } else if (state.opts.spin) {
      state.cam.yaw += SPIN_SIGN * SPIN * dt;
    }

    // ---- 线框淡入：几何就绪后 1s，power2.inOut（官方 LineSegments fade） ----
    if (!state.opts.still && state.fadeStart) {
      state.alpha = power2InOut(Math.min(1, (now - state.fadeStart) / FADE_MS));
    }

    if (now - state.drawMs >= 1000 / Math.max(1, state.opts.fps || 30)) {
      state.drawMs = now;
      draw();
    }
    state.raf = requestAnimationFrame(tick);
  }

  function start() {
    state.lastMs = 0;
    // 减少动态效果（opts.still）：只画一帧"已经到位"的静态图，不启动循环。
    // 与点阵场 bgStart() 的既有语义一致 —— 用户仍然看得见星球，只是它不动。
    if (state.opts.still) {
      state.intro = 1;
      state.alpha = 1;
      state.cam.dist = state.cam.baseDist;
      draw();
      return;
    }
    if (state.raf || !state.mounted) return;
    state.drawMs = 0;
    state.raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
  }

  /* --------------------------------------------------------------- 拖拽 -- */
  /* 背景层是 pointer-events:none，收不到自己的事件，所以走 document 级监听：
   * 命中任何可交互元素就让路 —— DSH 的 .mar-bg-clear 底板铺满视口，
   * "点到空白处"这个判据永远不成立（计划书 §7.5）。 */
  var INTERACTIVE = 'input,textarea,select,button,a,[contenteditable],[role=button],' +
    '[role=slider],[role=dialog],[data-composer-seat],.mar-set-pane,[class*="_composerSeat"]';

  function hitsInteractive(target) {
    if (!target || !target.closest) return false;
    try { return !!target.closest(INTERACTIVE); } catch (e) { return false; }
  }

  var dragHandler = null;

  function attachDrag() {
    if (dragHandler) return;
    function down(e) {
      if (!state.opts.drag || e.button !== 0) return;
      if (hitsInteractive(e.target)) return;
      state.drag = { x: e.clientX, y: e.clientY };
      state.lastMs = 0;
      start();
    }
    function move(e) {
      if (!state.drag) return;
      var dx = e.clientX - state.drag.x, dy = e.clientY - state.drag.y;
      state.drag.x = e.clientX;
      state.drag.y = e.clientY;
      // 手感照 OrbitControls：rotateSpeed 0.5，2π/视口高 的系数
      var vh = (state.canvas && state.canvas.clientHeight) || global.innerHeight || 1000;
      var k = (Math.PI * 2 * 0.5) / Math.max(1, vh);
      state.cam.yaw -= dx * k;
      state.cam.pitch = Math.max(-1.25, Math.min(1.25, state.cam.pitch + dy * k));
      state.lastMs = 0;
      start();
    }
    function up() { state.drag = null; }
    global.addEventListener('pointerdown', down, true);
    global.addEventListener('pointermove', move, true);
    global.addEventListener('pointerup', up, true);
    global.addEventListener('pointercancel', up, true);
    dragHandler = { down: down, move: move, up: up };
  }

  function detachDrag() {
    if (!dragHandler) return;
    global.removeEventListener('pointerdown', dragHandler.down, true);
    global.removeEventListener('pointermove', dragHandler.move, true);
    global.removeEventListener('pointerup', dragHandler.up, true);
    global.removeEventListener('pointercancel', dragHandler.up, true);
    dragHandler = null;
    state.drag = null;
  }

  function onVisibility() {
    if (!state.mounted) return;
    if (global.document && global.document.hidden) stop();
    else start();
  }

  /* ----------------------------------------------------------------- API -- */

  var api = {
    available: function () {
      if (state.supported === null) {
        state.supported = false;
        try {
          var c = global.document.createElement('canvas');
          var gl = createGL(c);
          if (gl) {
            state.supported = true;
            var lose = gl.getExtension('WEBGL_lose_context');
            if (lose) lose.loseContext();
          }
        } catch (e) { state.supported = false; }
      }
      return state.supported;
    },

    mount: function (canvas, opts) {
      if (!canvas || !api.available()) return false;
      if (state.mounted) api.unmount();
      state.canvas = canvas;
      state.gl = createGL(canvas);
      if (!state.gl) return false;
      try {
        state.loc = buildProgram(state.gl);
      } catch (err) {
        if (global.console && global.console.warn) global.console.warn('[scene]', err);
        state.gl = null;
        return false;
      }
      state.occluder = buildOccluder(state.gl, 0.995);
      if (opts) {
        if (typeof opts.opacity === 'number') state.opts.opacity = opts.opacity;
        if (typeof opts.drag === 'boolean') state.opts.drag = opts.drag;
        if (typeof opts.spin === 'boolean') state.opts.spin = opts.spin;
        if (typeof opts.fps === 'number') state.opts.fps = opts.fps;
        if (opts.still) state.opts.still = true;
        if (typeof opts.bg === 'string') setBg(opts.bg);
        if (typeof opts.light === 'boolean') state.opts.light = opts.light;
        if (typeof opts.yaw === 'number') state.cam.yaw = opts.yaw;
        if (typeof opts.pitch === 'number') state.cam.pitch = opts.pitch;
        if (typeof opts.dist === 'number') state.cam.baseDist = opts.dist;
      }
      state.mounted = true;
      state.lastMs = 0;
      attachDrag();
      global.document.addEventListener('visibilitychange', onVisibility);
      api.setPlace((opts && opts.place && PLACES[opts.place]) ? opts.place : 'planet');
      start();
      return true;
    },

    unmount: function () {
      stop();
      state.mounted = false;
      detachDrag();
      global.document.removeEventListener('visibilitychange', onVisibility);
      var gl = state.gl;
      if (gl) {
        try {
          for (var k in state.buffers) {
            if (Object.prototype.hasOwnProperty.call(state.buffers, k)) {
              gl.deleteBuffer(state.buffers[k].vbo);
              gl.deleteBuffer(state.buffers[k].ibo);
            }
          }
          if (state.occluder) {
            gl.deleteBuffer(state.occluder.vbo);
            gl.deleteBuffer(state.occluder.ibo);
          }
          if (state.loc) gl.deleteProgram(state.loc.prog);
        } catch (e) {}
      }
      state.buffers = {};
      state.pending = {};
      state.occluder = null;
      state.loc = null;
      state.gl = null;
      state.canvas = null;
      state.intro = 0;
      state.alpha = 0;
      state.fadeStart = 0;
      state.cam.yaw = YAW_A;
      state.cam.pitch = PITCH_A;
    },

    setOption: function (key, value) {
      if (key === 'place') { api.setPlace(value); return; }
      // 底板色 / 浅色底盘是"下一帧就要生效"的，直接重画一次，不走 start() 的节流。
      if (key === 'bg') { setBg(value); if (state.mounted) draw(); return; }
      if (key === 'light') { state.opts.light = !!value; if (state.mounted) draw(); return; }
      if (!Object.prototype.hasOwnProperty.call(state.opts, key)) return;
      state.opts[key] = value;
      if (key === 'drag' && !value) state.drag = null;
      state.lastMs = 0;
      if (state.mounted) start();
    },

    setPlace: function (name) {
      if (!PLACES[name]) return;
      state.place = name;
      state.cam.fov = PLACES[name].fov;
      state.cam.baseDist = PLACES[name].dist;
      state.cam.dist = PLACES[name].dist;
      state.started = (global.performance && performance.now()) || Date.now();
      state.intro = 0;
      state.alpha = 0;
      state.lastMs = 0;
      // 每次进场都从官方的起始机位重来：相机 (-12,12,12) 看向原点（星球全程在画面
      // 里，只有经纬线在滑 + 淡入），线框淡入等几何就绪后重新起算。
      state.cam.yaw = YAW_A;
      state.cam.pitch = PITCH_A;
      if (!state.buffers.planet && !state.buffers.ship) state.fadeStart = 0;
      var files = PLACES[name].files.slice();
      for (var i = 0; i < files.length; i++) {
        loadScene(files[i], function () { if (state.opts.still) draw(); });
      }
      if (state.mounted) start();
    },

    stats: function () {
      var segs = 0;
      for (var k in state.buffers) {
        if (Object.prototype.hasOwnProperty.call(state.buffers, k)) segs += state.buffers[k].segments;
      }
      return {
        fps: state.fpsValue,
        segments: segs,
        place: state.place,
        mounted: state.mounted,
        gl: state.gl ? ((global.WebGL2RenderingContext && state.gl instanceof global.WebGL2RenderingContext) ? 'webgl2' : 'webgl') : null
      };
    },

    /* 只读：调参 / 截图对拍用。想知道"这一帧是不是进入动画的某一拍"就看 intro。 */
    debug: function () {
      return {
        mounted: state.mounted,
        intro: state.intro,
        alpha: state.alpha,
        fadeStart: state.fadeStart,
        yaw: state.cam.yaw,
        pitch: state.cam.pitch,
        dist: state.cam.dist,
        bg: state.opts.bg,
        light: state.opts.light
      };
    }
  };

  global.__marScene = api;
})(window);
