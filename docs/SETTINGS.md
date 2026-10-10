# 设置页与调参位置

> 这一页原本是 README 里的一节，为公开仓库拆出来独立成页；内容与主线一致，
> 交叉引用已改成文件链接。返回 [README](../README.md)。

### 「主题设置」页（设置对话框里那一个 nav cell）

| 控件 | 语义 |
| --- | --- |
| **每轮 Token 结算** 开关 | 独立开关，**默认开启** —— 关掉就不再贴结算纸条、已有的立刻摘掉、也停止轮询计费接口（见 [docs/BILLING.md](BILLING.md)） |
| **任务完成动画** 开关 | 独立开关，**默认开启** —— 一轮正常结束时播放四拍收尾动画（见下）；关掉即不订阅会话快照、不建节点、不留定时器 |
| **完成文案** + 预览 | 绿色横幅上那行字，默认 `//RUN_COMPLETE`，可改成任意文本（≤48 字）；「预览」立刻重播一次（忽略开关本身，但仍尊重系统「减少动态效果」，并把原因写在那行小字里）。下面一行小字是**触发状态**：已挂上会话订阅 / 等待 sessions 服务 / 已关闭 |
| **背景动画** 开关 | 独立开关，**默认关闭** —— 点阵场是可选效果。它不碰配色：关掉只收起场，配色（也就是整个 UI）停在原地 |
| **主白 + 绿 / 主黑 + 绿** | 单选，二者恒有且只有一个被选中；不论场开不开都会换配色。换另一对时重放 0.341s 马赛克「灌注」 |
| 点阵密度 / 呼吸速度 | 只描述点阵场，场关闭时变暗且 `disabled`，数值保留 |

控件结构与文案与网页版 `dsh-theme-marathon` **完全一致**（`buildPane` 两个文件逐字节相同），
存储键也共用 `dsh-theme-marathon.bg.v1`。0.2.0 起存的形状从 `{mode, scheme, cell, speed}`
变为 `{anim, scheme, cell, speed}`；旧形状读取时自动迁移（`mode: off` → `anim: false` 并保留
它的 `scheme`，`mode: light|dark|green` → `anim: true` + 那一对配色）。
「每轮 Token 结算」与「任务完成动画」是后加的两个独立开关，各有自己的存储键
（`mar.billing.v1` / `mar.done.v1`），与配色那一对互不影响。

## 设置页与调参位置

**设置页（设置 ›「主题设置」）按功能分成四组**，每组一个带色块与横线的大标题
（用户 2026-10-10："需要有一个大标题来区分功能"，并参考了同类的 endfield 主题）：

| 分组 | 里面有什么 |
| --- | --- |
| **外观** | 配色（主黑 + 绿 / 主白 + 绿 单选） |
| **背景动画** | 启用开关 + **它自己的两项参数（点阵密度 / 呼吸速度）紧跟在下面** —— 关掉时这两行会变暗并禁用（以前开关和参数之间隔着整个"任务完成动画"分组，用户反馈"离得太远"） |
| **任务完成动画** | 启用开关 + 完成文案 + 预览按钮 + 两行小字（预览反馈 / 触发状态与最近一次判定） |
| **每轮 Token 结算** | 启用开关 |

组内行距 10px、组间 24px；小字与输入框左对齐（124px = 标签列 + 间隙）。
改结构就改 `src/client.template.js` 的 `buildPane()` 与 `.mar-set-*` / `.mar-set-head` 那组 CSS；
开发期的自检里有三条断言盯着"分组标题的顺序"与"开关紧贴它的参数行"，改顺序时别把它们改乱。

| 想改什么 | 改哪里 |
| --- | --- |
| 揭幕顺序与时长 | `src/boot/boot.css` 顶部的 `--mb-t-*` 变量（keyframes 与 JS 都读它） |
| 绿鲸鱼的光晕/尺寸 | `src/boot/boot.css` 的 `.mb-logo-top` |
| 蓝色板块停留时长 | `src/boot/engine-intro.js` 的 `HOLD_MS` |
| 动画只在冷启动播放 | `src/client.template.js` 的 `buildBoot()` 开头门控 |
| 看门狗兜底时长 | `src/client.template.js` 的 `watchdog`（当前 18s） |
| 完成动画的四拍时长 / 文案默认值 | `src/boot/engine-done.js` 的 `CFG`（改完必须 `node scripts/build.cjs`；④ 的旋钮都叫 `REVEAL_*`，别与 ① 的 `TILE_SIZE` 撞名） |
| 完成动画的晶格 / 符号尺寸 | `src/boot/engine-done.js` 的 `CFG.UI_CELL`（晶格间距，24px）与 `CFG.UI_GLYPH_SCALE`（符号边长 = 格距 × 该值，0.34 → 8.16px，**与启动动画标记同尺寸**）。想让它再小/再大就只改这两个（线宽会按 `UI_LINE_MIN` / `UI_LINE_SCALE` 自动跟着缩放） |
| 完成动画的线宽 / 线帽 | `CFG.UI_LINE_MIN` / `UI_LINE_SCALE`（线宽 = `max(UI_LINE_MIN, 符号边长 × UI_LINE_SCALE)`，与启动动画标记同一条公式）与 `UI_LINE_CAP` / `UI_LINE_JOIN` |
| 完成动画的黑屏时长 | `src/boot/engine-done.js` 的 `CFG.BLACK_FADE`（矩阵淡出）与 `CFG.BLACK_HOLD`（纯黑静置） |
| 完成动画的开关与文案 | 设置页「任务完成动画」那两行；存储键 `mar.done.v1` |
| 完成动画的触发判据 | `src/client.template.js` 的 `/* ---- task-completion animation ---- */` 段（DOM 判据 `doneDomPoll` / `doneSameTranscript` / `doneDomInterrupted`，会话面与列表判据 `doneOnFace` / `doneOnList`，收尾复查 `doneSchedule`） |
| 主题配色/组件 | `src/client.template.js`（改完必须 `npm run build`） |
| 结算块的宽度/行高/色 | `src/client.template.js` 的 `/* ---- per-turn token settlement ---- */` 段（见 [docs/BILLING.md](BILLING.md)） |
| 价目表 / 峰谷规则 / 法定节假日 | `billing/pricing.mjs` |
