# 运行动画（两个独立选项）

> 2026-11-05 新增。对象是 DSH 客户端在回合进行中画在输入框上方的那条原生提示
> （鲸鱼图标 +「深度求索中，用时 N 秒 …」）。主题在**同一个「运行动画」分组**里提供
> 三个独立开关（默认：前两个开、跟随主题色关）：
>
> 1. **运行动画** —— 132px 条带，替换原生提示；居中的人形 + 短直线 + 光点，
>    下面三行文字跟随真实状态。
> 2. **点阵动画** —— 《动画1》的 21×21 点阵有机体，放在输入框右侧的空白里，
>    从零逐格生长；**不替换、也不改原生文字提示**。
> 3. **跟随主题色** —— 关：固定 `#C0FE04` / `#8F96B2`；开：条带墨色与点阵新生格
>    改读 `--mar-accent-text`（成熟格仍 `#8F96B2`）。
>
> 返回 [README](../README.md)。

## 1. 运行动画条带（选项 1）

```
┌──────────────────────────────────────────────────────────────┐
│                    空心人形 ──●── 实心人形                    │  视觉带
│                       深度求索中 ○ ○ ○                        │  13px / 22px
│                       用时 12 秒                              │
│                       调用工具 · read                         │
└──────────────────────────────────────────────────────────────┘
```

- **2026-11-05 按用户提供的原始游戏截图调整过**：两个人形高 46px，之间是一条
  **直线**（`sag = 0`）、长度固定 220px（160–260 之间自适应），整个装置居中；
  不再把人形顶到左右边缘、也不再用原 `运行动画.html` 的微下弯长弧线。
- 光点仍沿用原动画的节奏：3.0s 一轮、两个球间隔 0.433s、单球行程 1.03s。
- 三行文字画在同一张 canvas 里：**同字重（400）、同一支墨色**，没有标题后的呼吸点；
  视觉上跟左边空心人形一致。
- 背景透明：DSH 自己的底板透出来。默认墨色固定 `#C0FE04`（不跟主题色）；
  只有打开「跟随主题色」后才改读 `--mar-accent-text`。

## 2. 点阵动画（选项 2，《动画1》）

- 位置：**输入卡右侧的空白**。`[data-composer-seat]` 是 `position:sticky` 的定位容器，
  宿主 `#dshMarDotHost` 绝对定位在 seat 内；它按 `[data-composer-card]` 的实测宽度算
  右侧可用空白，`right = 空白/2 - 尺寸/2`，垂直居中对齐输入卡。
- 尺寸：`clamp(64, 空白 - 56, 120)`；空白不足 120px 时自动缩小，再不够就不显示
  （实测 1600 视口每侧约 213px → 120px）。窗口 resize 时重挂并重量。
- **没有静态点阵底/边框**：不亮的格子直接不存在；每一格第一次亮起时在 8 帧内
  从 0 淡到目标亮度，所以它从“几乎空”逐渐长成一团，不会一开始就铺满格子。
- **双色**：新生格闪 `#C0FE04`（酸绿），成熟后按 STATES 的 warm 值退到 `#8F96B2`
  （蓝灰，用户指定的原成熟色）。打开「跟随主题色」后新生格改读 `--mar-accent-text`，
  成熟色仍固定 `#8F96B2`。
- **不碰原生文字**：不加 `mar-run-on`、不隐藏 `[data-chat-running]` 的任何子节点，
  「深度求索中，用时 N 秒」照常显示（除非选项 1 把它替换掉）。
- 与选项 1 完全独立：关掉任一个不影响另一个；两个引擎各自一份 payload。

## 3. 挂载点与 DOM 契约（实测 DSH 0.2.2-rc.1）

运行状态是 `dsh-client-ui-chat` 的 `RunningStatus`：

```html
<div class="V4vHZW_running" data-chat-running data-holding="">
  <span class="BpRApG_visuallyHidden" role="status">深度求索中</span>
  <span class="V4vHZW_runningDivider"></span>
  <span class="V4vHZW_runningContent">…鲸鱼 + 用时文案…</span>
</div>
```

它住在转录 flow 的末尾。**两个动画都不挂在这里**：转录短时这一行会被
`margin-top:auto` 顶到屏幕中间，不是"输入框上方"。

```
[data-composer-seat]            ← 宿主那个 position:sticky 的输入框座位
  ├─ #dshMarRunHost             ← 选项 1：firstChild，占位 132px，在输入卡上方
  ├─ .an3WzG_composerStack
  │    └─ [data-slot="conversation.composer.bar"] → 输入卡
  └─ #dshMarDotHost             ← 选项 2：绝对定位，输入卡右侧空白
```

- 运行态判据只看 `[data-chat-running]`（0.2.2-rc.1 的 asar 里这个属性只出现一次；
  `[class*="_running"]` 会命中 7 个节点，不能用）。`data-holding` 出现 = 回合已经
  结束、宿主还在等动作行替换 → 立刻卸载。上一行是 turn-tail 时宿主会把运行行整个
  `display:none`，这种情况也排除。
- 选项 1 隐藏原生可见子节点：
  `body.mar-run-on [data-chat-running] > span:not([role="status"]){display:none!important}`；
  `role="status"` 的读屏 span 保留。
- 选项 1 的条带宽度跟着输入卡：用 `--dsh-composer-side-clearance` /
  `--dsh-composer-dock-inset` / `--dsh-composer-card-max-width` 三个宿主变量算。
- React 复写风险（实测中低）：seat 的 React children 只有 composer；运行行的 `tick` /
  `holding` 切换是 props 更新而不是 remount。两个宿主都是额外子节点，不进 React 的 diff；
  运行行被整个卸载时由我们自己的 DOM 轮询撤销。

## 4. 三行文字的数据来路（选项 1）

| 行 | 内容 | 来源 |
| --- | --- | --- |
| ① 标题 | `深度求索中`（中英跟随界面语言） | 直接读 `[data-chat-running] [role="status"]` 的 `textContent` |
| ② 用时 | `用时 12 秒` / `用时 1 分 3 秒` | 首选会话面 `ConversationSnapshot.turnTimings` 里没有 `endTime` 的最大轮次的 `startTime`；**真机上 `sessions` 面没有 `list`、拿不到当前 id**，第二优先是解析原生那一行自己的「用时 N 秒」文案并继续累加，再退回「第一次看见运行行」的时刻 |
| ③ 动作 | `调用工具 · read` / `正在分析请求` / `正在生成回复` / `等待模型响应` | 首选 `snapshot.runningCalls` 最后一个根节点的 `name`；快照不可用时读 DOM：`[data-tool][data-state="running"\|"preparing"]`（ui-tool 的 `ToolRow` 根节点，`data-tool` 就是 wire name）→ `[data-variant="think"][data-state="running"]` → `[data-streaming]` → 等待模型响应 |

会话面通过 `ctx.get('sessions').binding(id).session` 取得；`currentId` 与任务完成动画
共用同一套求法。不新建订阅：每 250ms 读一次快照即可，页面隐藏时 canvas 自己停 RAF。

> ⚠️ 这一版（0.2.2-rc.1）的客户端 `sessions` 服务面只有 `binding / scope / retain / …`，
> **没有 `list`**，所以 `doneCurrentId()` 在真机上可能恒为 `null`。设计因此以 DOM 为
> 主数据源，会话快照只是"有就用"的精度加成。

## 5. 代码与调参位置

| 东西 | 位置 |
| --- | --- |
| 两个选项的挂载 / 数据 / 开关 / 生命周期 | `src/client.template.js` 的 `// ---- running animation` 与 `// ---- dot animation` 段 |
| 条带几何与绘制（BEAM / PKT / FIG / TEXT；`sag = 0`、线长 220） | `src/run/engine-run.js` |
| 右侧点阵引擎（方形 canvas、DPR、reduced、destroy） | `src/run/engine-dot.js` |
| 点阵数据与绘制（21×21 / 141 帧 / 逐格淡入） | `src/run/think-anim1.js`（`FRAMES` / `STATES` 逐字来自《动画1》） |
| 构建注入 | `scripts/build.cjs` → `RUN_PAYLOAD` / `DOT_PAYLOAD` |
| 样式（隐藏原生子节点、条带宽度、点阵层） | `client.template.js` 样式表 `running animation` 段 |
| 设置项 / 存储键 | 同一个「运行动画」组：运行动画 `mar.run.v1`、点阵动画 `mar.dot.v1`、跟随主题色 `mar.run.follow.v1`（前两个默认 `true`，跟随默认 `false`） |
| 诊断钩子 | `window.__marRunDebug()`：三个开关、挂载、尺寸、条带 layout metrics、最近一帧状态 |

条带常量（源 `运行动画.html` → 132px 条带）：

| 常量 | 取值 | 说明 |
| --- | --- | --- |
| `FIG` | 人形高 46px（窄于 520px 时 38） | 局部 164×291，4 矩形 + 2 腿，头偏移右 -6，圆角 4.5 / 空心描边 12 |
| `BEAM` | 直线（sag 0）、长度 220px（160–260）、线厚 ≈ 人形高 × 4.1% | 2026-11-05 按用户截图改；两端仍渐细 |
| `PKT` | 3.0s 轮、emit `[0, 0.433]`、travel 1.03s | 源动画逐帧实测值；半径两端小、中点大 |
| `TEXT` | 标题 13px/600、其余 13px/400、行高 22 | 三行中线相对条带顶约 69 / 91 / 113 |
| 点阵 | 21×21 / 141 帧 / 15fps，边长 64–120px | 无底板；每格首次亮起 8 帧淡入 |

## 6. 生命周期与失败路径

1. `apply()` 末尾调用 `runApply()`：按两个动画开关分别给 `<body>` 加 `mar-run-on` /
   `mar-dot-on`，起一个共享的 `MutationObserver`（body childList，100ms 合并）+
   400ms 轮询（只跑任一动画开启时）；「跟随主题色」只影响颜色，不影响挂载。
2. 看见 `[data-chat-running]` 且不在 `data-holding`、可见、找得到 seat：
   - 选项 1：创建 `#dshMarRunHost` 插到 `seat.firstChild`，注入 `RUN_PAYLOAD.engine`；
   - 选项 2：找 `[data-composer-card]` 量右侧空白，创建 `#dshMarDotHost` 绝对定位，
     注入 `DOT_PAYLOAD.engine`。
3. 选项 1 每 250ms 读一次快照 / 原生标题，`inst.set(state)`；点阵引擎自己按 RAF 动画，
   400ms 轮询只补 ink / reduced。
4. 运行行消失 / 进入 holding / 座位被重建 → 两个宿主各自摘掉并 `destroy()`。
5. 引擎脚本被 CSP 拦下或 `create()` 抛错：撤掉对应宿主，设置页状态小字显示不可用；
   另一个选项不受影响。
6. 系统 `prefers-reduced-motion: reduce`：两者都只画一帧静态。
7. `dispose()`：停观察器 / 定时器、销毁两个引擎、摘两个宿主、删两个注入 `<script>`、
   移除 resize 监听、清 `window.__marRunEngine` / `__marDotEngine` / `__marRunDebug`、
   去掉 `body.mar-run-on` / `mar-dot-on`。

## 7. 已知边界

- **切进一个已经在跑的会话**：会话快照拿不到时，用时从原生那一行的「用时 N 秒」文案
  解析后继续累加，精度到秒；首帧连文案都没有时才从"条带第一次出现"开始算。
- **工具名过长**：第三行先缩到 80% 字号，再省略号；820px 宽下约 35 个中文字以内不裁。
- **`data-tool` 是 ui-tool 的 DOM 契约**：它和 `data-state` 一起在 `ToolRow` 根节点上。
  将来若改名，第三行会退回「等待模型响应」，条带其余部分不受影响。
- **右侧空间不足**：窗口窄 / 宿主把输入卡调得很宽时，点阵会缩小到 64px；连 64px 都
  放不下就不显示（不压到输入卡上）。
- **运行行被上一行 turn-tail 隐藏**：宿主把运行行 `display:none` 时它仍然在 DOM 里，
  我们的判据会先把两个动画都撤掉。
- **没有"预览"按钮**：两个动画都只在真实回合里出现（与原生提示同一时机）。要手工验，
  用无头夹具（见下）或 DevTools 里 `__marRunDebug()`。

## 8. 验证

开发期无头夹具（不随包发布）：

```bash
node .generated/verify-run.cjs
```

它加载**真实 `client.js`**，用 0.2.2-rc.1 的真实类名复刻「转录 + 运行行 + composer seat」，
断言 72 项：三个开关互相独立 / 条带挂载与几何（高度 132、底 ≤ 卡顶、**直线 sag=0、
线长 220、人形 46、无呼吸点、三条同字重**）/ 点阵挂载在卡右侧且垂直对齐、尺寸 64–120、
逐格像素、**新生绿与成熟 `#8F96B2` 双色** / **跟随主题色开（#FF00AA）关（#C0FE04）** /
原生子节点隐藏与 `role=status` 保留 / 用时与工具名（快照 + DOM 双路）/ 行消失与重挂 /
`display:none` / 三个 `localStorage` 键。
截图写在 `.generated/probe-out/run/`。

单独预览：

- 条带：`.generated/run-strip/preview.html?w=820&mode=run&clean=1&t=0.6`
- 点阵右侧：`.generated/run-strip/dot-preview.html`

静态校验：`node check.cjs`；构建：`node scripts/build.cjs`
（`src/run/engine-run.js` → `RUN_PAYLOAD`；`engine-dot.js` + `think-anim1.js` → `DOT_PAYLOAD`）。
