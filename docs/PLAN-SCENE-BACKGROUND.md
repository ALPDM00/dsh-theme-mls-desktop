# 计划书：把 TAU CETI IV Explorer 做成主题的背景动画

> 面向：执行本计划的另一个 AI / 另一位开发者
> 仓库：`D:\PythonCode\ma\dsh-theme-mls-desktop213`（版本 0.6.16）
> 素材：`D:\PythonCode\ma\官方网页\`（tauceti.world 的完整离线镜像 + 逆向文档）
> 本文所有数字都是本机实测，不是估算。实测方法见 §3 与附录 A。

---

## 0. 结论先行

**可行，但不能"把网页搬进来"，必须"把视觉搬进来"。**

三条硬伤决定了原样嵌入做不到：

1. **体积**：官方 3D 几何共 56.3 MB（8 个 `.chunks`），其中三张地图占 55.1 MB。插件是 npm 包，不能背 65 MB。
2. **代码不可复用**：官方是 Next.js 15 + React 19 + R3F 9.5，全部代码在 turbopack chunk 里，与 React 运行时绑死。插件是零依赖 CJS + `<script>` 内联注入，没有 React，**不能 require 任何官方 chunk**。
3. **iframe 走不通**：把官方页塞进 iframe 当背景，`pointer-events:none` 之后无法拖拽（`OrbitControls` 在 React 内部，父页够不到）；给 `pointer-events:auto` 又不是背景了（挡住整个 UI）。与需求「去点击 + 可拖拽」直接冲突。

**可行的做法**：提取官方几何数据 → 转码成插件自带资产（实测 gzip 后 **9.9 MB**，单场景 3.5 MB）→ 手写一个约 900 行的 WebGL 线段渲染器 → 用官方的视觉参数（配色、fov 6 长焦、球面插值相机）复现观感 → 在插件既有的 `#mar-ascii-bg` 挂载点上换成一个 WebGL canvas。

产出物需要复现的三段动画，官方时序已在 §4 用逐帧截图实测，不需要猜。

**工作量估计**：数据管线 1 天 / 渲染器 3–4 天 / 集成与设置 2 天 / 过渡与轮播 2 天 / 打磨 2 天。

---

## 1. 输入端：素材到底有什么

### 1.1 目录与真相源

```
D:\PythonCode\ma\官方网页\
├─ _mirror\                     ← 唯一可信的运行时镜像（87 MB，断网可跑）
│  ├─ cdn\                      ← 8 个 .chunks + 6 json + 4 png + fbx + 54 个媒体
│  ├─ _next\static\chunks\      ← 29 个 JS（3.1 MB），含 5 个地图场景 chunk
│  ├─ _next\static\media\       ← lineSegmentsLoader.worker + overlay.gif
│  ├─ fonts\  icons\  __rsc\
│  ├─ explorer.html             ← /explorer
│  └─ explorer\                 ← Perimeter / Dire Marsh / Outpost 三个地点页
├─ serve.py                     ← 本地静态服务器（带 /cdn/ 端口改写、206 Range）
├─ 技术分析.md                  ← 逆向结论（`.chunks` 格式的权威描述在 §4）
├─ preview-星球.png  preview-地图-*.png
└─ _build\                      ← 抓取/截图工具（CDP，零依赖）
```

### 1.2 场景与资源的对应关系（实测，来自 `pages/explorer_config.json`）

| 场景 | 几何文件 | 原始体积 | 顶点 | 线段 |
|---|---|---|---|---|
| 星球 `/explorer` | `3fdfae69-…chunks` (planet_lines) | 0.06 MB | 3,173 | 3,150 |
| 星球上的飞船 | `caa68a98-…chunks` (marathon_ship) | 1.13 MB | 72,018 | 39,340 |
| 星球 mesh（可选） | `97b89f04-…fbx` | 29 KB | — | FBX |
| Perimeter | `9fdba452-…chunks` | 11.16 MB | 636,842 | 507,884 |
| Dire Marsh | `8a7afd32-…chunks` | 18.97 MB | 1,107,197 | 826,099 |
| Outpost | `4a5b068f-…chunks` | 25.00 MB | 1,484,926 | 1,049,958 |
| 三个 hotzones | `734b…` / `0d31…` / `2ff0…` | 0.31 / 3.24 / 5.12 MB | — | — |
| floor_texture（三页共用） | `2e3c1753-…png` | 24 KB | — | — |
| runner / uesc 路径 | 6 个 json | 0.2 MB | — | — |

**hotzones 不要**：红色半透明热区在背景里没意义，省 8.7 MB。

### 1.3 `.chunks` 格式（复述，避免执行者去翻文档）

```
[uint32 LE: zip 长度][zip 内容] 重复 N 次
   zip 内单个 .bin（stored，无压缩）
   .bin = [uint32 vertexFloatCount][uint32 indexCount][float32 × vfc][uint32 × ic]
```
索引是**全局连续**的，跨块无需偏移修正（技术分析 §4.3 已验证）。

---

## 2. 三条候选路线与取舍

| | A. iframe 嵌原页 | B. 自研 WebGL（**推荐**） | C. 搬 three.js 进包 |
|---|---|---|---|
| 观感一致度 | 100% | 90–95% | 90–95% |
| 包体积 | +65 MB（不可裁） | +9.9 MB | +0.6 MB 库 +9.9 MB 数据 |
| 去点击 | 能做到 | 天然没有 | 天然没有 |
| 可拖拽 | **做不到** | 能 | 能 |
| 真背景化 | 做不到（自带 HUD） | 能 | 能 |
| 过渡/轮播 | 只能听官方的 | 完全可控 | 完全可控 |
| 性能 | R3F + React 协调，最重 | 最轻（2 个 draw call） | 轻 |
| 风险 | 高（跨域/HUD 遮挡/无法交互） | 中（渲染器要自己写） | 高（three 是 ESM+打包，插进来要改构建） |

**选 B。** 理由不是"一致度够"，而是 A 和 C 都过不了 `可拖拽 + 背景化` 这一关，而那是需求的硬条件。

> B 的"90–95%"具体差在哪：官方用 `Line2`（屏幕空间宽线 + dash + 抗锯齿），我们用 `gl.LINES`（1px 硬件线）。背景尺寸下肉眼几乎不可分；若必须一致，可在 P4 加后处理描边（不推荐，性价比低）。

---

## 3. 实测数据（决定可行性的硬指标）

### 3.1 体积：转码后能压到多少

对每个 `.chunks` 做三件事：**丢短段（< 0.02 单位）→ 顶点重编号 → int16 量化 → gzip**。

| 场景 | 原始 | int16 位置 | uint32 索引 | 未压缩 | **gzip** |
|---|---|---|---|---|---|
| planet | 0.06 MB | 19 KB | 25 KB | 0.04 MB | **0.01 MB** |
| ship | 1.13 MB | 432 KB | 315 KB | 0.71 MB | **0.31 MB** |
| Perimeter | 11.16 MB | 3.82 MB | 4.06 MB | 7.52 MB | **3.01 MB** |
| Dire Marsh | 18.97 MB | 4.15 MB | 3.66 MB | 7.45 MB | **3.07 MB** |
| Outpost | 25.00 MB | 4.28 MB | 3.69 MB | 7.60 MB | **3.46 MB** |
| 合计 | 56.3 MB | | | 23.3 MB | **9.86 MB** |

**丢短段是安全的**：实测段长分布（p50 约 0.015–0.09 单位），丢掉 < 0.02 后——

| 场景 | 保留段数 | 保留**总长** |
|---|---|---|
| Perimeter | 99.98% | 100.0% |
| Dire Marsh | 55.4% | 94.7% |
| Outpost | 43.9% | 91.7% |

即 Outpost 丢掉 56% 的段，只丢了 8.3% 的总线长——被丢的全是亚像素碎段，画面上看不出来。

### 3.2 渲染代价

最重的 Outpost：46.1 万段 / 71.4 万顶点。单次 `drawArrays(LINES)`，两个 buffer 共 8 MB（量化后），显存无压力。Radeon 780M 实测同类场景（官方原页）稳定 60 fps，我们的渲染器只会更轻（无 React 协调、无 drei Html 投影）。

### 3.3 环境验证

本机用 Chrome 157 + 真 GPU 跑通官方镜像：
```
GPU: ANGLE (AMD, AMD Radeon 780M Graphics, D3D11 vs_5_0 ps_5_0)
```
WebGL2 可用。DSH 桌面是同一 Chromium 内核，但**版本可能更低**，所以渲染器要用 WebGL1 兼容写法（`webgl2 || webgl`），并对 `getContext` 失败做降级（退回现有点阵场，见 §7.4）。

---

## 4. 目标效果规格（官方时序，逐帧实测）

采样方式：CDP `Page.captureScreenshot`，250 ms 一帧，真 GPU，1600×1000。截图在 `官方网页\_build\frames_planet`、`frames_map`、`frames_switch`。

### 4.1 场景一：星球（`/explorer`）

| 时刻 | 画面 |
|---|---|
| 0 – 0.9 s | 全黑，UI 未出 |
| 0.9 s | 星球出现，**很小、极暗**（线框几乎看不见） |
| 1.25 s | 直径约 200 px，暗紫 |
| 1.76 s | 直径约 600 px，亮度接近最终值 |
| 2.0 s | 完全到位 |
| 2.0 s → | 只有自转 |

**判定：进入动画 = 相机 dolly-in + 线框透明度淡入，时长约 1.1 s，缓动 `power1.inOut`。**
官方参数（`812914…js` 内）：`PLANET_RADIUS = 0.5`、`<group scale={1/0.5}>` → 世界半径 1；`fov = 6`、`near = 1`、`far = 1e9`；初始机位 `(-12, 12, 12)`，`controls.target = (0, 5, 30)`。

复现要点：**fov 必须是 6（长焦）**，这是"远观行星"电影感的来源；换成 45° 就变成游戏截图了。

### 4.2 场景二/三/四：城市地图（`/explorer/Outpost` 等）

| 时刻 | 画面 |
|---|---|
| 0.5 – 1.5 s | 全屏**竖向纹理板**（见 4.3），中间一个小方块在转 |
| 2.0 s | 纹理板消失；地图出现，**缩到约满屏的 18%**、居中，只有轮廓色块 |
| 2.5 s | 放大中，线条细节开始显形 |
| 4.0 s | 满屏，细节完整 |
| 4.0 s → | 静止（无自转、无漂移） |

**判定：进入动画 = 缩放 0.18 → 1.0，约 2.0 s，`power2.out`；缩放期间线框 alpha 从 0.5 → 1。**

### 4.3 切换过渡（星球 → 地图，点卡片实测）

| 时刻 | 画面 |
|---|---|
| +0.2 s | 旧页消失，全屏被**不规则矩形块**铺满 |
| +0.5 s | 块阵扩展到全屏，每块是一种图案 |
| +1.1 s | 块阵开始解体：黑块穿插，新页从缝里透出 |
| +1.8 s | 块阵完全消失，新页已是"地图 18% 小尺寸"状态 |
| +1.8 → 3.6 s | 地图放大到满屏 |

**块阵的构成**（从截图逐块量出，约 8 列 × 2 行，宽高不等）：图案共 5 种——① 大圆点阵、② 方框网格、③ 极细横线、④ 小方点阵、⑤ 45° 斜线，另加纯黑块。颜色统一 `#5200FF`，底色 `#000`。

这就是要复刻的"过渡动画"：**不是交叉淡入，是「纹理块阵铺屏 → 块阵碎裂 → 新场景从 18% 放大到位」**。官方没有专门的 transition 组件，它是加载骨架（loading skeleton）+ 缩放进入两段拼起来的——所以我们照这个拼法复刻，观感一致。

### 4.4 需求映射

| 用户要求 | 本方案的落点 |
|---|---|
| 保留进入动画 | §4.1 / 4.2 的 dolly-in 与 zoom-in，逐场景播放 |
| 切换要有过渡动画（重要） | §4.3 块阵 + 缩放，切换与自动轮播都走它 |
| 设置页提供选项 | §9，沿用 `buildPane()` 的既有控件风格 |
| 自动轮播 | §9 `interval`，到点播放过渡 |
| 去掉点击事件 | 自研渲染器没有 raycast，天然无点击 |
| 可拖拽查看 | §7.5，空白区域拖拽（不抢 UI 输入） |

---

## 5. 架构与文件清单

```
插件内新增（全部新文件，不改任何现有引擎）
├─ assets/scene/                         ★ 二进制资产（构建产物，提交进仓库）
│  ├─ planet.msc        (~10 KB)          星球线框
│  ├─ ship.msc          (~320 KB)         星球上的飞船
│  ├─ perimeter.msc     (~3.0 MB)
│  ├─ diremarsh.msc     (~3.1 MB)
│  └─ outpost.msc       (~3.5 MB)
├─ tools/build-scene.cjs                 ★ 数据管线（Node，零依赖，一次性把 .chunks 转成 .msc）
├─ src/scene/engine-scene.js             ★ 渲染器 + 动画编排（浏览器侧，被内联注入）
└─ src/scene/engine-scene.css            ★ 场景层样式（可选，若全部写 inline 则不需要）

要改的现有文件（只有 3 个）
├─ index.js                    + 静态资产路由（ctx.webServer.register，仿 billing/host.mjs:493）
├─ scripts/build.cjs           + 注入 /*__SCENE_PAYLOAD__*/（仿第 332 行的 marker 机制）
├─ src/client.template.js      + SCENE_PAYLOAD 占位、场景开关、设置分组、bgApplyMode 分支
└─ package.json                + "assets/scene/" 进 files；版本号 +0.1.0
```

**为什么数据不进 `client.js`**：`client.js` 现在 668 KB，靠 `<script>` 内联注入。塞 9.9 MB 进去会变成 13 MB 的 base64 字符串，解析慢且没法按需加载。所以走 HTTP：宿主路由返回**已解压**的二进制（Node 侧 gunzip 一次并缓存），客户端 `fetch` 拿到的就是可直接 `new Int16Array` 的字节。这样客户端也不需要 `DecompressionStream`。

**为什么不放 `mar-scene.js` 独立文件让浏览器 `<script src>` 加载**：宿主路由虽然能 serve，但插件卸载时的清理边界会变复杂（现有做法是注入到 boot host 里，随 host 一起销毁）。沿用现有机制，只把**数据**走网络。

---

## 6. 二进制格式 `.msc`（v1）

单文件、小端、4 字节对齐。

```
偏移  类型        字段
0     char[4]     magic = "MSC1"
4     uint32      kind      0=planet 1=ship 2=map
8     uint32      vertexCount      V
12    uint32      indexCount       I   （线段数 = I/2，索引成对）
16    float32[6]  bbox      xmin,xmax,ymin,ymax,zmin,zmax
40    int16[V*3]  pos       量化坐标，见下
40+6V uint8[pad]            补齐到 4 字节边界（pad = (4 - (6V % 4)) % 4）
..    uint32[I]   index     顶点索引
```

**量化**：`q = round((v - min) / (max - min) * 65534) - 32767`，落回时 `v = (q + 32767) / 65534 * (max - min) + min`。

精度核对：地图 bbox 跨度约 100 单位 → 量化步长 `100/65534 ≈ 0.0015` 单位。地图满屏时 1 单位 ≈ 6 px，即步长 ≈ 0.009 px，**远优于亚像素**，不会出现抖动。

**为 GPU 直接可用而设计**：
- `gl.vertexAttribPointer(loc, 3, gl.SHORT, true /* normalized */, 0, offset)`
  → 得到 [-1, 1]，shader 里 `pos = q * halfSize + center`（两个 `vec3` uniform）。
- 索引 `Uint32Array` 需要 `OES_element_index_uint`（WebGL1）或直接用 WebGL2。

`kind` 让客户端决定用哪套相机预设，不必在外层再记一张表。

**校验**：管线脚本写完必须回读一遍——`V` 与 `I` 与写前一致、bbox 覆盖所有顶点、抽样 100 个顶点反量化误差 < 0.002。

---

## 7. 渲染器规格 `src/scene/engine-scene.js`

单文件 IIFE，尾部挂 `window.__marScene = { mount, unmount, setPlace, next, setOption, stats }`。构建时作为字符串内联（同 `BOOT_PAYLOAD` 的做法，见 `client.template.js:5438` 的 `injectScript`）。

### 7.1 结构

```
create(canvas, opts)
├─ GL 初始化      webgl2 → webgl → 失败返回 null（调用方降级）
├─ program        ｜一个 program 画所有东西
│    vs: aPos(int16 normalized) → uCenter/uHalf → uViewProj → uGlobalScale
│        + uPointScale（GL_POINTS 时按距离扩点）
│    fs: uColor * uAlpha
├─ buffers        每场景一套 { posBuf, idxBuf, V, I }，切换时预载，最多同时驻留 2 套
├─ camera         { theta, phi, dist, target }，四元/球面插值
└─ loop           rAF，限帧（默认 30，可降到 15 / 8）
```

### 7.2 绘制

```
每场景 2 个 draw call：
  gl.LINES   — 线框本体（地图 46 万段 / 星球 3150 段 + 飞船 39340 段）
  gl.POINTS  — 顶点星点（仅星球页用，模拟官方的 PointsField；点大小 1.6px × dpr）
```

两处必须注意：

1. **深度**：地图是俯视，开 `DEPTH_TEST` 但**不开** `CULL_FACE`（线段没有正反面）。
2. **`gl.lineWidth` 在多数平台只支持 1**——不要指望调宽。要粗线就在 shader 里把线段扩成三角带（P4 可选，默认不做）。

### 7.3 相机预设

```js
// 星球：长焦远观，官方参数
PLANET  = { fov: 6,  near: 1,   far: 1e9, dist: 30, target: [0, 0, 0], tumble: 0.006 }  // rad/s
// 地图：俯视，视野覆盖 bbox 最大边 × 1.25
MAP     = { fov: 28, near: 0.1, far: 1000, tiltX: -Math.PI/2 * 0.92, dist: 自动 }
```

地图相机的 `dist` 由 bbox 算出：`dist = 0.5 * max(w,h) / Math.tan(fov/2) * 1.15`。这样三张地图的"满屏"观感一致，不用逐张调。

### 7.4 降级

`getContext` 返回 null（禁用硬件加速 / 远程桌面 / 虚拟机）→ `mount()` 返回 false，主逻辑把 `BG_STATE.anim` 的路径原样留给点阵场，并在设置页相应行显示"当前设备不支持"（样式同 `.mar-set-note` 的既有灰字）。

**不要**在失败时循环重试——`bgApplyMode` 会被 DOM 变化频繁触发，重试会刷屏。

### 7.5 拖拽

背景层是 `pointer-events:none`，所以不能靠 canvas 自己收事件。走 document 级监听：

```js
onPointerDown(e):
  if (e.button !== 0) return
  if (hitsInteractive(e.target)) return        // 见下
  drag = { x: e.clientX, y: e.clientY }
onPointerMove(e):
  if (!drag) return
  dTheta -= (e.clientX - drag.x) * 0.005
  dPhi   += (e.clientY - drag.y) * 0.005
  drag = { x: e.clientX, y: e.clientY }
onPointerUp: drag = null
```

`hitsInteractive(el)` 沿 `composedPath()` 向上找，命中下列任一即放弃拖拽：
`input, textarea, select, button, a, [contenteditable], [role=button], [role=slider], [role=dialog], [data-composer-seat], .mar-set-pane, [class*="_composerSeat"]`

**为什么不用"点在空白处"判定**：DSH 的 `.mar-bg-clear` 容器铺满视口且必须保持可点击（它是页面底板），`elementFromPoint` 永远返回它。用"命中可交互元素就让路"是唯一稳的判据。

拖拽结束不回弹（星球保留用户角度，地图 6 s 无操作后缓慢回中，缓动 2 s）。

### 7.6 性能守则

- `doc.hidden` → 停 rAF（沿用 `bgOnVisibility`）。
- `reducedMotion()` → 只画一帧静态图，不启动循环（沿用 `bgStart` 的既有语义）。
- 地图场景：静止 8 s 后帧率降到 8 fps；一旦有拖拽/切换立刻回 30。
- 切换场景时，旧场景的 buffer 保留 ≤ 3 s 再释放（过渡要用它）。

---

## 8. 集成点（逐处，带现有标识符）

> **动任何一处之前先 `git commit`**。这个仓库的既有约定是"改坏了要能立刻回退"，`src/client.template.js` 里大量注释记录了历史回归，不要顺手"优化"。

### 8.1 宿主侧：资产路由（`index.js`，仿 `billing/host.mjs:493`）

```js
// index.js apply(ctx) 里新增
ctx.on('webserver/ready', () => { /* 或直接在 apply 里 */ })
const SCENE_DIR = require('node:path').join(__dirname, 'assets', 'scene')
const cache = new Map()   // name -> Buffer（已解压）

function registerSceneRoutes(ctx) {
  const webServer = typeof ctx.get === 'function' ? ctx.get('webServer') : null
  if (!webServer || typeof webServer.register !== 'function') return
  return webServer.register({
    kind: 'prefix',
    path: '/dsh-mls-scene',
    handler: (req, res) => {
      const name = String((req.url || '').split('?')[0]).replace(/^\/dsh-mls-scene\/?/, '')
      if (!/^[a-z]+\.msc$/.test(name)) { res.statusCode = 404; res.end(); return }
      let buf = cache.get(name)
      if (!buf) {
        buf = zlib.gunzipSync(pfs.readFileSync(path.join(SCENE_DIR, name)))
        cache.set(name, buf)
      }
      res.setHeader('Content-Type', 'application/octet-stream')
      res.setHeader('Content-Length', buf.length)
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      res.end(buf)
    }
  })
}
```

要点：
- 文件名白名单正则，别做路径拼接之外的任何信任（`..` 会被正则挡掉）。
- `.gz` 落盘、解压后缓存 → 每次安装只解一次。
- 磁盘上是 `assets/scene/*.msc.gz`，serve 时去掉 `.gz`——保持 URL 干净。**注意上面的 `files` 白名单要写 `assets/scene/`。**

### 8.2 构建：注入引擎（`scripts/build.cjs`）

仿第 332–356 行的 marker 机制，新增 3 行：

```js
const sceneEngine = read('src/scene/engine-scene.js');
const scenePayload = { engine: sceneEngine };
const sceneMarker = '/*__SCENE_PAYLOAD__*/ null';
if (tpl.indexOf(sceneMarker) === -1) { console.error('[build] scene marker missing'); process.exit(1); }
// assemble 段里：
out = out.split(sceneMarker).join(JSON.stringify(scenePayload));
```
并在文件尾的"占位符残留"断言里把这个 marker 加进去（第 387 行的 `||` 链）。

### 8.3 客户端：挂载点替换（`src/client.template.js`）

现有事实（别记错）：
- 背景 canvas：`bgMount()`（第 2619 行），`id = 'mar-ascii-bg'`，`position:fixed; inset:0; z-index:0; pointer-events:none`，是 `body` 的第一个子节点。
- 总开关：`bgApplyMode()`（第 2328 行），读 `BG_STATE.anim`，负责 `mar-bg-on` / `mar-bg-light` / `--mar-bg-field` / `bgMarkClear()` / `bgStart()`。
- 底板让位：`.mar-bg-clear`（第 947、972 行），由 `bgMarkClear` 打标。
- 存储：`dsh-theme-marathon.bg.v1`。

改法（**不新增挂载点，复用同一个位置**）：

1. `bgMount()` 末尾追加：创建第二个 canvas `#mar-scene-bg`，`z-index:-1`（在点阵 canvas 之下，这样点阵还能叠在上面），同样的 inline 几何，同一父节点。
2. `bgApplyMode()` 末尾追加 `sceneApply()`：根据 `SCENE_STATE` 决定 `#mar-scene-bg` 的 `display`，并调 `window.__marScene.mount/unmount`。
3. `bgTeardown()` 里追加 `window.__marScene && window.__marScene.unmount()` + 移除 canvas。
4. `.mar-bg-clear` 的标记逻辑**完全不动**——它对场景层同样有效，因为它是"把底板清透明"，与底下画什么无关。

一个坑必须先处理：**底盘色**。`bgApplyMode` 把 `--mar-bg-field` 写成 `#0B0D0B` 或 `#FFFFFF`（浅色模式）。WebGL 场景底下是黑的，浅色模式会变成"白底上一个黑洞"。处理方式：`body.mar-scene-on` 时把 `--mar-bg-field` 改成 `transparent`，并让场景 canvas 自己 `clearColor(0,0,0,0)`，浅色模式下场景整体乘一个 `#FFFFFF` 底 + 线框反相（或直接禁止浅色模式下启用场景，设置页给一行说明）。**推荐后者（P2 先禁止，P4 再考虑反相）**——浅色背景下的紫线框几乎看不见，做了也白做。

### 8.4 设置页（`buildPane()`，第 4654 行的「背景动画」分组之后）

新增一组 `TAU CETI IV`，结构沿用 `.mar-set-group` / `.mar-set-head` / `.mar-set-row` / `.mar-set-switch`。**注意**：`.mar-anim-off` 那条规则（第 1166 行）会把非白名单行调到 45% 透明——新组里的行如果与点阵无关，要加排除类 `mar-set-scene`，并把它加进那条选择器的 `:not()` 链。

---

## 9. 设置项规格

存储键 `mar.scene.v1`（与 `dsh-theme-marathon.bg.v1` 独立，互不影响）：

```js
{
  on: false,            // 启用场景背景（默认关，和点阵场的默认一致）
  place: 'planet',      // planet | perimeter | diremarsh | outpost
  interval: 0,          // 自动轮播秒数；0 = 不轮播。候选 0/15/30/60/180
  transition: true,     // 切换时播块阵过渡
  drag: true,           // 允许拖拽
  opacity: 0.85,        // 0..1，乘在线框 alpha 上
  fps: 30,              // 30 | 15 | 8
  drift: true           // 地图缓慢漂移（关闭则完全静止）
}
```

设置页控件（6 行，顺序即渲染顺序）：

| 控件 | 类型 | 说明 |
|---|---|---|
| 启用 | `.mar-set-switch` | 打开即加载默认场景，播进入动画 |
| 场景 | `.mar-seg` 四格 | 星球 / Perimeter / Dire Marsh / Outpost；点了立刻切，播过渡 |
| 自动轮播 | `.mar-seg` 五格 | 关 / 15s / 30s / 60s / 3min |
| 切换过渡 | `.mar-set-switch` | 关掉则硬切 |
| 允许拖拽 | `.mar-set-switch` | 关掉后只有自转/漂移 |
| 透明度 | `input[type=range]` | 0–100%，拖动即时生效 |
| 帧率 | `.mar-seg` 三格 | 30 / 15 / 8，低配机器用 |
| 状态小字 | `.mar-set-note` | 显示：已加载 / 当前设备不支持 WebGL / 内存中场景数 |

与点阵场的关系：**两者独立**。同开时点阵 canvas 加 `body.mar-scene-on` 后设 `background:transparent`（现在它靠 CSS `--mar-bg-field` 铺底，会挡住场景）。这条写在 P4。

---

## 10. 任务分解（每段可独立验收）

### P0 数据管线（1 天）

1. 写 `tools/build-scene.cjs`（附录 A 给了验证过的 Python 版，照抄算法即可；Node 版注意 `zlib.gunzipSync` 与 `Buffer.readUInt32LE`）。
2. 从 `官方网页\_mirror\cdn\` 读 5 个文件（planet / ship / 3 张地图），输出 `assets/scene/*.msc.gz`。
3. 断言：内存中解析后的 `V/I` 与写入头部一致；bbox 覆盖全部顶点；抽样反量化误差 < 0.002；**每个文件 gzip 后 ≤ 3.6 MB**。
4. 产出 `assets/scene/MANIFEST.json`：`{name, kind, V, I, bbox, bytes}`，客户端用它做预检（避免拿错文件）。

**验收**：跑一次脚本，5 个文件生成，总大小 ≤ 10 MB，重跑结果字节相同（幂等）。

### P1 渲染器最小可跑（2 天）

1. `src/scene/engine-scene.js`：GL 初始化、program、解码 `.msc`、画星球。
2. 静态挂到一张临时页面上跑通（不经插件），用官方 `preview-星球.png` 做对照。
3. 目标：星球线框、飞船红线、自转、拖拽都能动。

**验收**：临时页 60 fps；截图与 `preview-星球.png` 的构图（星球占屏比例、初始朝向）肉眼一致。

### P2 三张地图 + 相机预设（2 天）

1. 地图解码 → `gl.LINES`，俯视相机，`dist` 由 bbox 自动算。
2. 对照 `preview-地图-Outpost.png` 调 `tiltX` 与视野系数。

**验收**：三张地图满屏后，外轮廓在画面中的占比与官方截图差 < 5%；切换三张地图时观感一致（不需要逐张手调）。

### P3 集成进插件（2 天）

1. `index.js` 路由（§8.1）→ `curl` 能下到二进制。
2. `scripts/build.cjs` 注入（§8.2）→ `npm run build` 通过。
3. `client.template.js` 挂载点（§8.3）→ 设置里打开能看到。
4. 卸载/禁用插件 → canvas 与 rAF 都要清干净（照 `bgTeardown` 的既有规矩）。

**验收**：冷启动 → 设置开场景 → 关掉 → 反复三次无残留、无内存增长；禁用插件后 `document.querySelectorAll('canvas')` 不含 `#mar-scene-bg`。

### P4 动画与设置（2 天）

1. 进入动画：星球 dolly-in 1.1 s、地图 zoom-in 2.0 s（§4.1/4.2）。
2. 过渡块阵 + 缩放（§4.3），切换与轮播共用。
3. 自动轮播定时器（页面隐藏时暂停，`visibilitychange` 恢复）。
4. 设置页 8 个控件 + 存储 + 与点阵场的叠加规则。

**验收**：连续点四个场景，每次都有块阵过渡且不闪白；自动轮播到点切换；关掉"切换过渡"是硬切。

### P5 打磨（2 天）

1. 低配降级、reducedMotion 单帧、8 fps 静止模式。
2. 浅色模式：要么禁止，要么做反相（二选一，别半成品）。
3. `README` / `docs/SETTINGS.md` / `CHANGELOG` 补条目。
4. 跑 `node check.cjs` 与 `npm run build`，把新断言加进去。

---

## 11. 验收清单（硬指标）

- [ ] `npm run build` 通过，`client.js` 无占位符残留
- [ ] 包体积增量 ≤ 11 MB
- [ ] 首帧到可见 ≤ 1.5 s（本地路由取 3.5 MB gzip）
- [ ] 场景运行时帧率 ≥ 25 fps（1600×1000，Radeon 780M），CPU 单核 ≤ 15%
- [ ] 拖拽不干扰输入框/按钮/侧栏滚动
- [ ] 关闭开关后 `rAF` 为 0（用 CDP Performance 面板确认）
- [ ] 与点阵场同开/互斥都不崩
- [ ] 浅色模式下行为明确（禁止 or 反相），不出现"白底黑洞"
- [ ] 插件禁用后无 canvas / 无定时器 / 无路由残留
- [ ] `check.cjs` 全绿

---

## 12. 风险与禁止事项

**禁止**
- ❌ 不要 `npm install` 任何东西（本仓库零依赖构建，本机无外网）
- ❌ 不要改 `client.js`（它是 `npm run build` 的产物）
- ❌ 不要动 `src/boot/engine-*.js` 与 `src/run/*`
- ❌ 不要改 `.mar-bg-clear` 的标记逻辑（`bgModal` / `bgLayer` / `bgIsComposerSeat` 三个剪枝各自对应一次线上回归，注释里写了症状）
- ❌ 不要用 iframe（§2）
- ❌ 不要在 `bgApplyMode` 里做同步的重活（它被 DOM 变化频繁触发）

**风险**

| 风险 | 概率 | 处置 |
|---|---|---|
| DSH 桌面 Chromium 版本过低，WebGL2 缺 | 中 | 走 WebGL1 + `OES_element_index_uint`；再不行降级点阵 |
| 100 万段在集显上掉到 20 fps | 中 | 已有 `fps` 档位；P5 可再来一层"远距离抽段" |
| `.msc` 转码后出现可见抖动 | 低 | int16 步长 0.0015 单位 ≈ 0.009 px，理论无感；若出现，改 bbox 分块量化 |
| 与 `.mar-bg-clear` 的 45% 变暗规则冲突 | 中 | 新组加 `mar-set-scene` 排除类（§8.4） |
| 用户想"星球 + 点阵"叠在一起 | 低 | P4 已留了口子（点阵透明底），默认互斥 |

---

## 附录 A：数据管线（Python 版，本机已验证跑通）

放在 `官方网页/_build/` 下直接跑。Node 版照抄，只换 IO。

```python
import struct, io, zipfile, array, gzip, os, json

def read_chunks(path):
    """官方 .chunks → (float32 位置数组, uint32 索引数组)"""
    data = open(path, 'rb').read()
    off = 0
    pos, idx = array.array('f'), array.array('I')
    while off + 4 <= len(data):
        L = struct.unpack_from('<I', data, off)[0]
        if L == 0 or off + 4 + L > len(data):
            break
        z = zipfile.ZipFile(io.BytesIO(data[off + 4: off + 4 + L]))
        off += 4 + L
        b = z.read(z.namelist()[0])
        nvf, ic = struct.unpack_from('<II', b, 0)
        pos.frombytes(b[8: 8 + nvf * 4])
        idx.frombytes(b[8 + nvf * 4: 8 + nvf * 4 + ic * 4])
    return pos, idx

def transcode(pos, idx, min_seg, kind):
    """丢短段 → 顶点重编号 → int16 量化 → 打包"""
    used, segs = set(), []
    for i in range(len(idx) // 2):
        a, b = idx[2 * i], idx[2 * i + 1]
        ax, bx = a * 3, b * 3
        dx, dy, dz = pos[ax] - pos[bx], pos[ax+1] - pos[bx+1], pos[ax+2] - pos[bx+2]
        if dx*dx + dy*dy + dz*dz < min_seg * min_seg:
            continue
        segs.append((a, b)); used.add(a); used.add(b)
    order = sorted(used)
    remap = {v: k for k, v in enumerate(order)}

    xs = [pos[o*3] for o in order]; ys = [pos[o*3+1] for o in order]; zs = [pos[o*3+2] for o in order]
    xmin, xmax, ymin, ymax, zmin, zmax = min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)
    sx, sy, sz = (xmax-xmin) or 1, (ymax-ymin) or 1, (zmax-zmin) or 1

    q = array.array('h')
    for o in order:
        q.append(int(round((pos[o*3]   - xmin) / sx * 65534 - 32767)))
        q.append(int(round((pos[o*3+1] - ymin) / sy * 65534 - 32767)))
        q.append(int(round((pos[o*3+2] - zmin) / sz * 65534 - 32767)))

    ii = array.array('I')
    for a, b in segs:
        ii.append(remap[a]); ii.append(remap[b])

    V, I = len(order), len(ii)
    pad = (4 - (V * 6) % 4) % 4
    out = b'MSC1' + struct.pack('<III', kind, V, I) \
        + struct.pack('<6f', xmin, xmax, ymin, ymax, zmin, zmax) \
        + q.tobytes() + b'\x00' * pad + ii.tobytes()
    return out, V, I, (xmin, xmax, ymin, ymax, zmin, zmax)

JOBS = [
    ('3fdfae69-bf8b-4f7a-a2a2-d331afedae3a.chunks', 'planet',    0,    0),
    ('caa68a98-44e9-44d8-8869-94f29da79dd9.chunks', 'ship',      1,    0),
    ('9fdba452-9beb-41a4-9100-19a6948e3587.chunks', 'perimeter', 2, 0.02),
    ('8a7afd32-1c1e-4e9e-8649-80a1415d08ba.chunks', 'diremarsh', 2, 0.02),
    ('4a5b068f-2bcc-4c19-ac2c-33f4fadba063.chunks', 'outpost',   2, 0.02),
]
```

跑完对每个文件断言：
```python
assert len(out) % 4 == 0
gz = gzip.compress(out, 6)
assert len(gz) <= 3_600_000            # Outpost 实测 3.46 MB
assert V * 6 + 40 + pad + I * 4 == len(out)
```

**实测产出**（可直接作为断言基线）：

| 文件 | 顶点 | 段数 | gzip |
|---|---|---|---|
| planet.msc | 3,173 | 3,150 | 10 KB |
| ship.msc | 72,018 | 39,340 | 320 KB |
| perimeter.msc | 636,759 | 507,785 | 3.01 MB |
| diremarsh.msc | 692,410 | 457,721 | 3.07 MB |
| outpost.msc | 714,131 | 460,769 | 3.46 MB |

---

## 附录 B：怎么在本地复核官方效果

```bash
cd D:\PythonCode\ma\官方网页
python serve.py 8099                      # 起镜像（换端口会自动改写 /cdn/ 绝对地址）
chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\probe about:blank
node _build/probe_intro.mjs  http://127.0.0.1:8099/explorer        _build/frames_planet 5000 250
node _build/probe_intro.mjs  http://127.0.0.1:8099/explorer/Outpost _build/frames_map   6000 250
node _build/probe_switch.mjs _build/frames_switch                 # 星球→地图 的真实切换
```

> 三个 `probe_*.mjs` 是我为这次可行性分析写的，已在 `_build/` 里，可直接复用。
> headless 截图必须加 `--enable-unsafe-swiftshader`，否则 Canvas 里没有星球（渲染器降级，不是镜像坏了）。
