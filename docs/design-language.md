# DSH Theme · Marathon — Design Language

> 一个受《失落星船：马拉松》(Marathon) 启发的 deepseekHarness 主题插件。
> FUI（未来界面设计）+ 编辑级 Glitch + 瑞士平面/包豪斯几何，
> 在 DSH 自己的栅格系统里精确排布。

---

## 1. 设计意图（Intent）

把 DSH 的对话界面变成一份「**殖民地指挥官的简报文件**」：

- **理性底**：所有视觉元素都受 DSH 既有的 token 栅格与 `--dsw-alias-*` 系统支配，
  切换主题时不会破坏原有可访问性、断点、组件结构。
- **中性面**：正式界面上只有一套中性暗色（§2），酸绿只出现在两处——品牌锁定，
  和两个被点亮的交互态（悬停「新会话」、选中的会话行，§2.0）。
  不做多套配色、不做满屏绿字、不做满栏绿底。
- **无覆盖层**：主题**不往界面上叠任何东西**——不做栅格、扫描线、CRT、扫描带、
  铭牌或任何全屏层（都曾在 2026-09-18 之前存在，现已全部删除，见 §5/§6）。
  它做的只是改宿主的 token 与边线。唯一会全屏出现的是 §5.6 的一次性启动动画；
  唯一会叠东西的地方是设置对话框自带的方块遮罩（§8.1），它挂在面板**内部**、
  0.5s 后自移除、且不响应指针。
- **氛围字体**：UI 文字沿用 DSH 默认栈保持可读；
  仅装饰性文字使用 Maratype（用户提供的 OTF，
  由插件运行时嵌入为 base64，避免外部网络字体请求）。
- **启动序列**：每次页面加载后有一次性的全屏 Boot 动画，强化「进入指挥终端」的仪式感。

> **两条不再做的事**（2026-09-18 定稿，见 §8）：
> ① 不做页面内的开关面板——它曾经把主题关掉后连自己的按钮一起藏起来；
> ② 不做覆盖在 DSH 界面之上的铭牌层——它压住了左上角的 logo 和侧栏的「设置」。

> **重要边界**：本主题**仅以 Marathon 风格为灵感**——所有图形、文字、配色、
> 视觉元素均为程序生成或自绘，**不包含 Bungie / Marathon 的任何版权素材、
> 商标、官方艺术或受保护字体**。详见 `docs/ASSET_POLICY.md`。

---

## 2. 配色（Palette）

**只有一套配色，四个颜色。** 刻意不做亮场/暗场两套色阶——DSH 自己的 light / dark
开关对主题没有影响（`overrideTokens` 的 light 与 dark 下发同一个值）。
换色的入口只有一个：`src/client.template.js` 里的 `body.theme-marathon{…}`。

| Token                     | Hex / 值                  | 用途 |
| ------------------------- | ------------------------- | ---- |
| `--mar-bg-void`           | `#0B0D0B`                 | 主底色（页面、侧栏、代码块） |
| `--mar-bg-deep`           | `#0B0D0B`                 | 凹陷底（= 主底色） |
| `--mar-bg-panel`          | `#272733`                 | 抬起面：卡片、输入卡、菜单、按钮 |
| `--mar-bg-overlay`        | `#2E2F38`                 | 最高面：浮层、tooltip |
| `--mar-ink-primary`       | `#DFDEE0`                 | 正文 |
| `--mar-ink-secondary`     | `rgba(223,222,224,.72)`   | 次级文本（主色的透明度派生） |
| `--mar-ink-tertiary`      | `rgba(223,222,224,.45)`   | 弱化文本 |
| `--mar-line-faint`        | `#272733`                 | 极淡分隔线 |
| `--mar-line-strong`       | `#2E2F38`                 | 强分隔线 |
| `--mar-wash / strong`     | `rgba(223,222,224,.08/.14)` | hover / 选中态叠加 |
| `--mar-accent`            | `#C0FE04`                 | 品牌锁定、两个点亮态（悬停「新会话」/ 选中会话行）、focus 环 |
| `--mar-accent-ink`        | `#0B0D0B`                 | **坐在 accent 填充上的**字色/图标色（= 主底色） |
| `--mar-signal`            | `#FF003C`                 | 错误语义色 |

**加色规则**：新加一个颜色前先问「现有一档能不能用」。
这个主题最初有五档几乎一样的暗绿，就是这么来的。

### 2.0 两处绿色（2026-09-18 起）

绿色只出现在两类地方，规则很简单：

1. **品牌锁定**（左上 logo + 词标 + HARNESS 徽标）：
   `body.theme-marathon [class*="_brandIdentity|_brandMark|_brandName"]{color:var(--mar-accent)}`
2. **两个被点亮的交互态**：酸绿当**面**用，上面的字色必须是 `--mar-accent-ink`，
   绝不是 `--mar-ink-primary`——浅灰 `#DFDEE0` 压在 `#C0FE04` 上读不出来。

| 控件 | 选择器 | 处理 |
| ---- | ------ | ---- |
| 侧栏「新会话」按钮 | `[class*="_newSession"]:hover` | 悬停时实心 accent 填充 + accent ink；**静态不动** |
| 侧栏会话列表行 | `[class*="_sessionRow"][class*="_selected"]` | **只有选中**那行实心 accent 填充 + accent ink |
| 侧栏会话列表行（悬停） | `[class*="_sessionRow"]:hover:not([class*="_selected"])` | **什么都不变**——把 DSH 自带的 8% 悬停底色也压掉 |
| composer 发送按钮 | `button[class*="_primary"]` | 底色留给 DSH，只把箭头刷成 accent ink |

**静态一律不填充。** 上一版把「新会话」和每一行会话都刷成实心绿，结果整个侧栏
是一堵绿墙，选中行反而看不出来（因为它和普通行长得一样）。现在的规则是：
**不操作时全是 DSH 自己的中性面，只在两个动作上给绿**——指向「新会话」，或点开某个会话。

`[class*="_sessionRow"]:hover` 那条带 `:not()`，不是装饰：不带的话它的优先级与
`[_selected]` 填充相同，鼠标一停在当前会话行上就会把绿底抹掉。
它压的是 `--dsw-alias-interactive-bg-hover`（白 8%）——这一列平时是不动的，
所以那点淡色格外显眼，也被算作「改变」，一并静音。

选中行原来继承了一个接近纯白的 `#DFDEE0` 填充（某个 token 覆盖的副作用），
白字压白底基本读不出来；换成 accent 填充后这个问题从构造上消失。

### 2.1 与 DSH 默认令牌的映射

`--dsw-alias-*` / `--dsw-specific-*` 共 **84 个** token 被覆盖
（DSH dark 主题里 alias + specific 一共 89 个，剩下 5 个是黑色遮罩 scrim
和 `--dsw-alias-button-primary-fill`，后者本身引用 `--dsw-alias-brand-primary`，已随品牌色变绿）。

为什么不嫌多：DSH 明确声明「第三方主题是表层，**不验证一组覆盖是否完整**」，
而且它的 **light** token 集把大量面解析成纯白（`#ebeef2` 侧栏选项、`#f5f6f7` 提示条、
`#e6faed` 成功底色）与蓝灰叠加（`#263148` 的 hover/active）。
漏一个就是一块白底或一抹蓝。逐个核对的方法见 §11。

主要映射：

```
--dsw-alias-bg-base               → --mar-bg-void
--dsw-alias-bg-layer-1            → --mar-bg-deep
--dsw-alias-bg-layer-2            → --mar-bg-panel
--dsw-alias-bg-layer-3 / overlay  → --mar-bg-overlay
--dsw-alias-border-l1             → --mar-line-faint
--dsw-alias-border-l2/l3/l4       → --mar-line-strong
--dsw-alias-label-primary         → --mar-ink-primary
--dsw-alias-label-secondary       → --mar-ink-secondary
--dsw-alias-label-tertiary/caption→ --mar-ink-tertiary
--dsw-alias-brand-primary         → --mar-accent
--dsw-alias-state-error-primary   → --mar-signal
--dsw-alias-state-warn/success-primary → --mar-accent
--dsw-alias-interactive-bg-active/hover/hover-accent → --mar-wash(-strong)
--dsw-alias-interactive-bg-hover-danger → --mar-wash-danger
--dsw-specific-input-major / bubble / tip → --mar-bg-panel
--dsw-specific-menu / selector    → --mar-bg-overlay / --mar-bg-deep
```

> **坑**：DSH 自带的 `--dsw-alias-brand-primary-new-color` 在声明和唯一消费者
> （ui-trajectory）里都把后缀写重了一次，真实生效的名字是
> `--dsw-alias-brand-primary-new-colorprimary-new-color`，两个都要覆盖。

---

## 3. 字体（Typography）

### 3.1 UI 栈（保持可读）

```
--dsw-font-family:
  Inter, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;

--ds-font-family-code:
  "JetBrains Mono", "SF Mono", "Fira Code",
  Consolas, "Liberation Mono", Menlo, Courier, monospace;
```

> 不抢 DSH 的系统字体栈，只在装饰位置叠加 Maratype。

### 3.2 Maratype（本地嵌入）

- 路径：`assets/fonts/Maratype.otf`（用户提供）
- 嵌入方式：构建期 base64 注入 CSS `@font-face`，**不联网**
- 许可：`docs/ASSET_POLICY.md` 中注明出处 + 许可（OFL/SIL 优先，备选注明）
- 用途：装饰铭牌、坐标读数、状态条、设置面板分组标题
- 备用：若用户机器无法加载 OTF，回落到 `ui-monospace, monospace`

### 3.3 排版比例（4 / 8 / 16 栅格）

```
标题：Maratype, 14 / 18 / 24 / 32 px, 字距 +0.08em, uppercase
正文：Inter, 13 / 14 px
数据：JetBrains Mono, 12 / 13 px, 字距 +0.04em
铭牌：Maratype, 11 px, 字距 +0.12em
```

---

## 4. 网格与几何（Grid & Geometry）

### 4.1 栅格系统

- 基线栅格：8 px
- 列数：12 列（在 1280 px 容器下）
- 间距：8 / 16 / 24 / 32 px
- 边距：24 px（移动端 16 px）

### 4.2 FUI 装饰元素（程序生成）

全部由 SVG / CSS 几何绘出，**不引入位图**：

- 十字准星（crosshair）：4 / 8 / 16 px 三种
- 角标（corner brackets）：四角的 `┌ ┐ └ ┘` 风格
- 数据卡（data plate）：水平分隔 + 字段标签 + 值
- 坐标读数（coord readout）：`X:001 Y:028 Z:114` 风格
- 状态条（status strip）：标题左、状态右、底部一条 1 px 强线
- ~~扫描线 / 网格~~：**已从主题移除**（见 §5.1）

> 上面前四项属于铭牌层，也已在 2026-09-18 整层删除（§6）——这份清单保留为
> 设计语汇的参考，**不是**当前实现。

### 4.3 编辑级（Editorial）版式

参考瑞士平面设计 / 包豪斯几何：

- 所有元素严格左对齐或顶对齐
- 大号标题与小号正文构成强对比
- **全站直角**：一条通配规则把 `border-radius` 压成 `0`
  （`body.theme-marathon *`，含 `::before` / `::after`）——
  写过的短名单（button / input / card / panel）总会漏掉几个组件，
  实测就漏了会话行与项目行的 8px、工作区分组头的 12px、徽标的 24px、
  以及一个做成整圆的搜索图标
- 极少阴影：仅 `inset` 描边和 1 px 线条
- 大量使用 1 px 边线 + 留白表达结构

---

## 5. 覆盖层（Overlays）— 只剩两段一次性遮罩

**当前状态：没有常驻装饰覆盖层。** `.mar-layer` 节点数为 0。主题往 `<body>` 上放的
节点只有两类：两段**一次性**全屏遮罩（启动序列 §5.6、任务完成序列 §5.7，各自带
独立 host，跑完即整层移除）与可选的 §6 点阵场画布。

历史上这里有四层常驻覆盖（2026-09-18 全部删除），记录如下，**都不要重建**：

### 5.1 ~~栅格（Grid）~~ + ~~扫描线（Scanlines）~~ — 已移除

28 px 的 1 px 网格（`.mar-grid`）与 1 px/3 px 的重复渐变扫描线（`.mar-scanlines`，
`multiply` 混合、0.7 不透明度）在 2026-09-18 一并删除。原因：

- 扫描线是 `multiply`，给**每一个面**都压了一层固定暗度，UI 整体灰了一档；
- 栅格在文字上画出等距细线，读小字时像脏了；
- 两者都属于「为了质感而质感」——正式界面要的是平的 `#0B0D0B`。

### 5.2 ~~RGB 分离（Channel Split）~~ — 已移除

`h1/h2` 上的红/绿 `text-shadow` 重影已删除：正式界面要的是中性底 + 单一强调色，
不是每个标题都带毛边。选择器也**不要**再放宽成 `[class*="title"] / [class*="header"]`——
DSH 把侧栏每条会话行命名为 `…_title`、每个面板顶命名为 `…_header`，
一旦放宽，整列文字都会发虚（2026-09-18 修过一次的 bug）。

### 5.3 ~~CRT 光束 + 闪烁~~ — 已移除

`.mar-crt` 曾经叠一层 `opacity:.275` 的容器：`::before` 是 120 px 高、白 7% 的横向亮带，
`7s linear infinite` 自上而下扫过；`::after` 是整屏 `rgba(223,222,224,.015)` 底光
外加每 11 s 一次的极轻闪烁。这是一个**被阅读**的界面，不是被观看的屏幕，
移动的高光只会干扰阅读，已连同 keyframes 一起删除。

### 5.4 ~~扫描带（Sweep Band）~~ — 已移除

`.mar-sweep` 曾经是 220 px 高、白 5% 的带子，`screen` 混合，每 9 s 从 `top:-220px`
划到 `150vh`。同上，已删除。

### 5.5 减档（Reduced Motion）

主题样式表里没有常驻动画；会动的只有两处一次性动画，都吃这条规则：
启动序列（§5.6）与设置对话框的方块马赛克（§8.1）。
`@media (prefers-reduced-motion: reduce)` 命中时：Boot 不播、马赛克层根本不挂
（CSS 里 `.mar-mosaic{display:none}` 是第二道保险）。
**没有页面内开关**——见 §8。

### 5.6 启动序列（Boot Sequence）

页面加载时一次性全屏遮罩（实测约 12 s 走完并自移除）：

- 纯黑底 + 酸绿扫描线 + 居中 `MARATHON` 标识（Maratype）
- 中央一条 1px 描边的进度 / 扫描带，自下而上填充酸绿
- 右侧滚动「系统启动」式技术日志（程序生成，如
  `INIT NEURAL LINK…` / `CALIBRATE GRID…` / `MOUNT THEME…`）
- 四角 FUI 角标 + 坐标读数
- 引擎跑完 → `__mbBootDone` → 淡出 → 移除 `#dshMarBootHost`；
  另有 16 s watchdog 兜底，任何情况下都不会把界面留在黑屏上
- `prefers-reduced-motion: reduce` 时直接跳过（唯一出口）
- 引擎脚本被 CSP / 环境拦掉时，200 ms 内自行卸载，不留黑屏

> 启动动画**内部的**扫描线、角标等是它自己的 payload（`src/boot/boot.css`，
> 全部命名空间在 `#dshMarBootHost` 下），与本主题对 DSH 界面的覆盖层无关。

#### 5.6.1 插件加载前那一段：DSH 原生启动屏（2026-09-20）

原生启动屏（`HARNESS` 字样 + 转圈 + `Loading plugins…`）在任何插件 bundle
被请求**之前**就已经上屏了，所以 client 侧够不着它。做法是走宿主半
（`index.js`）的 `webserver/index-inject` 注入表，往服务端返回的
`index.html` 的 `<head>` 里塞一条 `<style>`（比所有样式表与脚本都早）：

| 规则 | 理由 |
| --- | --- |
| `html,body{background:#0B0D0B}` | 板子**改色而不是删掉**：那几百毫秒读作"一块黑板"，本来就是本主题的底色 |
| `[data-dsh-boot]:has([data-dsh-boot-spinner]){background:#0B0D0B!important}` | `[data-dsh-boot]` 是宿主给启动板自己的属性，比它那份哈希类名（`_boot_1ionb_3`）稳 |
| `[data-dsh-boot]:has([data-dsh-boot-spinner]) > *{display:none!important}` | 只在**原生转圈还在**时藏卡片内容 —— DSH 加载失败时 `render()` 会把 spinner 换掉，于是失败卡照常弹出：**消掉的是动画，不是错误** |

- 不动 `node_modules`、不改宿主任何文件；插件卸掉，原生启动屏原样回来。
- `html,body` 那条**不带 `!important`**：主题自己的 body 底色要能压过它。
- 实测（headless，冷 profile）：整个启动期逐 rAF 采样 `glyphFrames = 0`
  —— 原生卡片一帧都没被画出来；启动板底色 `rgb(11,13,11)`、卡片
  `display:none`；板子在 833 ms 被 `dispose()`，app 在 1314 ms 挂上，
  中间那段是主题自己的启动动画。
- **页面自己画的头一两帧仍可能是白的**：那是 Chrome 给"空文档"画的底色，
  任何页面都躲不掉（用一张全暗的本地页面做对照组，第一帧同样是白的；
  加 `<meta name="color-scheme" content="dark">` 也无效）。判断首帧颜色
  必须用 `Page.startScreencast` 抓"本页面上屏过的帧"，
  不能拿"navigate 之后马上截一张"当证据 —— 那可能还是导航前那张空白帧。

### 5.7 任务完成序列（Completion Sequence，2026-10-10）

一轮任务**正常结束**时叠一层四拍收尾动画（`src/boot/done.html` + `done.css` +
`engine-done.js`，由 `scripts/build.cjs` 内嵌成 `DONE_PAYLOAD`）。它同样是**一次性**
遮罩：独立 host `#dshMarDoneHost`（z-index 比启动覆盖层低一档）、独立 id 前缀 `md-`、
结束即整层移除 —— 与 §5.1–5.4 那批被删掉的常驻覆盖层不是一回事。

| 拍 | 层 | 内容 |
| --- | --- | --- |
| ① 反向红 S 扫屏 | `#md-scene`（canvas） | 启动动画那条 S 路径**倒过来**：zone2 R→L → zone1 R→L 反向 → zone1 L→R → zone0 R→L，右下起、左上收。分块与 `RED_RISE/HOLD/EXIT` 系数与启动动画逐字一致，所以两条动画读起来是同一套语言的正反两面 |
| ② 矩阵像素定格 | 同上 | 尺寸**与启动动画收尾的标记同源**：同一个 24px 晶格、符号取格距 × **0.34**（= 8.16px）、线宽 `max(0.9, 符号 × 0.20)` —— 全部是启动动画自己的取值，于是两条动画读起来是同一套像素。四块地盘只换符号（红十字 / 红方框 / 墨方框 / 墨实心圆 —— 圆比方框轻一档），而且**每一格都要有符号**：按格心归属，边界上直接换符号，**不留空档**（★留空的格位会在 UI 边界连成"分界线"）。**矩阵跟着红扫逐块亮起**：某一块的红一开始溶解，那一块的矩阵就在它底下淡入（画布三层：黑底 → 矩阵 → 红块） |
| ③ 渐变为黑 | 同上 | 矩阵淡出 900ms → **纯黑静置 700ms** |
| ④ 逐块硬切 → 点阵 → 绿横幅 | `#md-tiles` / `#md-dots` / `#md-banner-wrap` | 80px **纯黑方块**按 `mosaicOrder` 逐块硬切消失（JS 驱动，没有模糊/淡出/描边），露出来的是**底下的正常界面**；墨色点阵接上；绿色横幅自左向右展开 |

约定：

- **遮罩是"透明的点阵 + 横幅"，不是一块黑板。** 用户口径：0.5s 逐块硬切揭示的是
  **正常界面**（正常画面在这个画面之下），点阵与绿色横幅只是浮在它上面的一层。
  所以原稿 `任务完成动画.html` 的 `#04060a` 底色、暗角（vignette）与扫描线
  （scanlines）**都不搬** —— 不透明的底会把界面盖住，暗角/扫描线会把界面压暗。
- **不要玻璃质感**（用户 2026-10-10 明确否决）：④ 的方块是纯黑硬切，与「配色切换」
  那一套"逐块变色"同逻辑。有静态守卫：payload 里再出现 `backdrop-filter`
  就是回归。方块由 **JS 按时间线**驱动（不是 CSS 动画），所以复核脚本的 `seek()` 也精确。
- **矩阵的"统一"+"填满"+"同尺寸"是硬约束**：四个地盘共用同一个 **24px 晶格**、同一个符号尺寸
  （格距 × 0.34 = 8.16px，与启动动画标记一致），而且**每一格都有符号** —— 按**格心**归属，
  边界上直接换符号，不留空档。实测四块地盘的列距都是 24px、相位都是 0（`…, 6, 30, 54, …`，
  与启动动画点阵同一套相位），四块地盘加起来的符号数正好等于视口内的格位数（1600×952 下
  480 / 132 / 1925 / 143）。给某一块单独换网格、换尺寸，或者让"放不下的格留空"（那些空格会
  连成 UI 边界的**分界线**），都是要修掉的问题。
- **矩阵必须跟着红扫**：`paint()` 的三层顺序是 **黑底 → 矩阵 → 红块**，矩阵每格的进度取
  它所在那一块红扫面板的 `holdEnd`（`regionMarkAlpha`）。所以红扫走到哪，矩阵就亮到哪；
  红块永远盖在矩阵之上，"没扫到的地带"也永远还是界面本色。
- **两套配色**：④ 那一拍浮在正常界面上，墨色由 `--md-ink` 给出并在 `body.mar-bg-light`
  下翻成 `#0B0D0B`；② 那一拍不吃它（底下是自铺黑幕，两套配色都读得清）。
- **`pointer-events: none` 是硬约束**，关闭靠 `document` **捕获阶段**的
  `pointerdown` / `keydown`：那一次按下同时完成两件事 —— 关掉动画，并正常抵达用户
  真正瞄准的元素。给遮罩加 `pointer-events:auto` 会变成一块吃掉点击的黑洞
  （`dsh-theme-endfield` 的雷霆大字文档里记过同一个坑）。
- **`--mar-*` 令牌基本不参与。** 四拍里的红 / 绿是"矩阵像素"与"信号横幅"的语义色，
  不是界面配色；跟着「主白 + 绿」翻转反而会出事（白方框在白底上消失）。
  只有 ④ 的**墨色**跟着配色走。
- **尊重系统「减少动态效果」**：整段跳过（这一拍没有静态形态可言，半成品比不放更糟），
  与 §5.5 同一条规则；另有抽屉里的独立开关（默认开）。

触发、关闭、设置项与复核方式见 [docs/COMPLETION.md](COMPLETION.md)；
设置页结构见 [docs/SETTINGS.md](SETTINGS.md)。
像素级判据见 （开发期探针）（无头 Chromium，按真机几何搭假 DSH DOM）。


---

## 6. 装饰层（Decorative Layers）

**除了启动遮罩，一层都没有了。** 这条曾经有五个 z-index 层级（栅格 / 扫描线 /
CRT / 扫描带 / 铭牌），2026-09-18 全部删除，理由是同一条：它们都是覆盖在
DSH 自己界面**之上**的全屏层，改的不是宿主，而是往宿主脸上盖东西。

按 z-index 由低到高，现在只剩：

| z | 层 | 内容 |
|---|----|------|
| 0 | DSH 原生 | DSH 自己的 UI —— 主题只在它上面改颜色/描边，不叠任何东西 |
| 40 | 设置面板马赛克 | `.mar-mosaic`，**面板内**的局部层（§8.1） |
| 40 | 看板入场 | `.mar-board-intro`，**看板内**的局部层；里面**每列**再套一个 `.mar-col-intro`（§8.2） |
| 2147483000 | 启动序列 | `#dshMarBootHost` 全屏 Boot 遮罩（一次性，自移除） |

后两个都是**挂在目标表面内部**的局部层：不会盖住宿主自己的控件，各自 1.9s / 0.5s 后
自删。`#dshMarBootHost` 自带 `pointer-events: none`，不抢 DSH 交互；除此之外主题不再
创建任何节点。

**删除清单**（全部 2026-09-18，理由见 §5）：栅格层、扫描线层、CRT 层、扫描带层、
铭牌层（四角括号 + 左上 "MARATHON // CMD TERMINAL" + 右上时钟 + 底部状态条，
左上压住 deepseek logo、底部压住侧栏「设置」）、RGB 分离、设置抽屉。

一条经验：**任何 z-index 高于 DSH 的全屏层都会遮住宿主自己的控件。**

---

## 7. 组件适配（Component Adaptation）

| DSH 组件 | 主题处理 |
|---------|---------|
| 品牌锁定（左上） | 绿色之一：酸绿 `--mar-accent` |
| 侧栏「新会话」按钮 | 静态不填充；`:hover` 时实心 `--mar-accent` + `--mar-accent-ink` 字/图标 |
| 侧栏会话列表行 | 静态与 `:hover` 都不填充；只有 `_selected` 实心 `--mar-accent` + accent ink |
| composer 发送按钮 | 底色不动，箭头 `fill` = `--mar-accent-ink` |
| 侧栏 / 页面底 | `#0B0D0B`，右侧 1 px `--mar-line-strong` 分隔 |
| 输入卡 / 弹出菜单 | `#272733` / `#2E2F38` |
| 消息气泡 | 1 px `--mar-line-faint` 描边 |
| 选中 / hover | `--mar-wash(-strong)`（白 8% / 14%），不用 DSH 的蓝灰 |
| 输入框聚焦 | 1 px `--mar-accent` 外框 |
| 滚动条 | 轨道 `--mar-bg-deep`，滑块 `--mar-line-strong` + 酸绿 1 px 边 |
| 圆角 | **全站 `0`**（`body.theme-marathon *` 通配 + `!important`）。唯一例外是启动动画里那颗 6px 状态灯：`#dshMarBootHost .mb-status-dot` 保持 `50%`，否则会方掉 |
| 设置对话框入场 | 5×5 方块马赛克揭示，0.5s 走完，见 §8.1 |
| 任务看板入场 | **五个选项卡各一套**：不透明黑板 + 4 个准星（各闪 0.1s 后常亮）→ 2px 绿框 → 2×2 四个象限块按 1-2-4-3 揭开 → 绿框随第 4 块同帧退场，五列同拍，1.90s 走完，见 §8.2 |
| 第三方插件注入的侧栏行 | **收起态**下压成 36×36 居中格（图标与 DSH 自己的一列对齐），并隐藏其标签，见 §7.1 |

### 7.1 第三方插件注入的侧栏行（2026-09-18 新增）

DSH 的侧栏没有给外部插件留槽位（`sidebar.workspaces` / `sidebar.settings` 都是独占），
所以插件只能**自己往侧栏里插一行**——`@linxin666/dsh-client-ui-task-board` 与 ssh 面板
都是这么做的，行上带 `data-dsh-part="sidebar-entry"`，摆在「新会话」与工作区浏览之间。
那一行是**满宽 + 左对齐图标 + 标签**，280px 宽时是对的；收起后的 56px 导轨则是另一套
布局：一列 36×36 的格子，**所有图标都落在导轨中线 x=28 上**，而插件注入的行不在
DSH 那套规则里。

实测（点「收起侧边栏」后）：

| | 改前 | 改后 |
| --- | --- | --- |
| 行盒子 | `x=10 w=35`（`padding:0 10px`） | `x=10 w=36`，`padding:0` |
| 图标中心 | **x=32**（偏右 4px） | **x=28**（与其它图标同一条线） |
| 行距 | 48 / **36** / 48 | 48 / 48 / 48 |
| 标签 span | 仍在流里（被裁切） | `display:none` |

插件自己的 CSS 里**有**这条规则，但它的选择器是
`[data-dsh-frame][data-sidebar-collapsed] .entry` —— 这台 DSH 的 frame 是
`div[class*="_frame"][data-sidebar-collapsed]`，**整份文档里没有任何 `data-dsh-frame`**，
所以它永远不会命中。

主题侧因此按**语义属性**接管，而不是按 hash 类名：

```css
body.theme-marathon [data-sidebar-collapsed] [data-dsh-part="sidebar-entry"]{
  justify-content:center; gap:0; width:36px; height:36px; padding:0; margin:0 0 12px;
}
body.theme-marathon [data-sidebar-collapsed] [data-dsh-part="sidebar-entry"] > span + span{display:none;}
```

> 为什么宽度写死 `36px` 而不是 `100%`：导轨内容盒实测只有 **35px**
> （父容器 `padding:18px 10px 6px`，列宽 56），`100%` 会算成 35；
> DSH 自己的那些行就是 36px（x=10…46），跟它们对齐才对。
> 也**不要**用 `margin:0 auto` —— 在 35px 的盒子里会变成 `-0.5px`
> （DSH 自己的 `_rail` 变体就是这么偏掉 0.5px 的）。

### 7.2 每轮 token 结算块（2026-10-09 新增）

**它是内容，不是界面层。** §5/§6 的「主题不往页面上叠东西」没有变：这个块贴在
**转录内部**的轮次尾巴上，跟着转录滚动、跟着会话销毁。

| 事 | 取值 / 位置 |
| --- | --- |
| 锚点 | `[data-turn-tail="<轮次号>"]`（DSH 的 `TurnTailNodeView`；语义属性，不是哈希类名） |
| 插入位置 | 动作行**之前**（`:scope > [class*="_actions"]`）→ 读作「任务结束 → 结算 → 操作」 |
| 对齐 | **消息内居中**（`margin:12px auto 0`），不是靠左 |
| 尺寸 | **一个旋钮** `--mlsb-s:1.5`：宽 `calc(268px * var(--mlsb-s))` = 402px；绿条 42px、明细行 33px、灰条 39px、圆角 9px、间隙 7.5px。所有尺寸都写成 `calc(<原始值> * var(--mlsb-s))` |
| 绿条 | `--mar-accent` 填充 + `--mar-accent-ink`（黑）字；**只有 `TOKEN USAGE`**，左右各一个黑色十字（`+`，展开时两边一起变 `−`） |
| 明细行 | 高 33px，`--mar-wash` / `--mar-wash-strong` 交替，1px `--mar-line-faint` 分隔 |
| 灰条 | `--mar-bg-overlay` 填充 + `--mar-ink-primary` 字；左边「任务用时」、右边 `mm:ss`（**没有 i 角标**） |
| 圆角 | `--mlsb-radius:calc(6px * var(--mlsb-s))`；绿条收起时四角圆、**展开时下方变直角**衔接信息面板，面板顶直角、**底圆角**，灰条四角圆 |
| 间隙 | 绿条/面板与灰条之间 `--mlsb-gap:calc(5px * var(--mlsb-s))`（`margin-top`）——两者**不紧贴** |
| 字体 | **回到宿主默认栈**：标题 `font:800 …/1 var(--dsw-font-family)`、备注同栈；只有数字走等宽栈 + `tabular-nums`（Maratype 不再用于这一块） |
| 强调色 | 只做**文字**时用 `--mar-accent-text`（不是 `--mar-accent`），否则「主绿 + 黑」看不见 |
| 用时口径 | `turn/end.time − turn/start.time`，`turn/end` 之后**冻住** |
| 触发时机 | 只在 `closed`（`turn/end` 到过）之后贴；没有用量的空轮次不贴 |
| 贴哪一段对话 | **精确**：`ctx.get('sessions').list.current`（DSH 的选中项）；拿不到才退回「最近有账的会话」 |
| 重启后 | ① 账本里存**逐轮**数据（`ledger.sessions[sid].turns`，每会话最近 40 轮），启动 `hydrateSessions` 回填；② 客户端把 `?session=<显示的会话>` 带给宿主，宿主发现这段对话没有逐轮数据就 `ctx.sessionPersistence.readFrom(id, 0)` **重放一遍**（本功能上线前的旧轮次靠它补上；每会话只试一次、8s 超时、失败静默、结果写回账本） |
| 开关 | 主题设置里的「每轮 Token 结算」，`localStorage['mar.billing.v1']`，默认开；关掉即摘纸条 + 停轮询 |
| **入场动画** | `@keyframes mlsb-reveal`：`clip-path:inset(0 50% 0 50%) → inset(0 0 0 0)`，`.18s` —— **从中间向两端展开**。用 clip-path 不用 `scaleX`（后者会把字一起压扁） |
| **展开/收起动画** | `grid-template-rows:0fr → 1fr` + `opacity`，`.2s`；内层 `min-height:0;overflow:hidden` —— 模板的做法；`display:none` 不能过渡 |
| 圆角过渡 | 绿条 `transition:border-radius .2s`，展开时下方两角平滑变直角 |
| 减档 | 上面三条都在 `@media (prefers-reduced-motion: reduce)` 里关掉 |
| i 角标 | **已按用户要求停用**（样式与创建代码都注释保留，需要时一起放开） |

**两轮用户实测后的修正**（原版浮在输入框上方、还是个独立插件）：

第一轮：

1. 太宽太长 → 268×240 的小纸条；
2. 是「另外一个插件」→ 内置进主题（`billing/` + `src/client.template.js`）；
3. 展开态跨会话残留、滚动时纹丝不动 → 改贴在轮次尾巴上（位置由转录决定，随会话销毁）；
4. 运行时间一直涨 → 改成**本轮用时并冻住**；
5. 英文没用主题字体 → `TOKEN USAGE` 等一律 `Maratype`。

第二轮（2026-10-09，模板 `token结算.html` 里本来就有这些参考）：

6. 靠左 → **消息内居中**；
7. 绿条上有费用 → 去掉，**只留 `TOKEN USAGE` + 左右两个黑色十字**（模板的 `.symbol` 就是它）；
8. `i` 与方框 → **去掉并注释**（"万一后面需要再启动和修改"）；
9. 需要圆角，且**绿条展开后下方变直角**衔接信息面板、**面板下方圆角**（模板 `.header[aria-expanded=true]` + `.details-wrap` 就是这套）；
10. 绿条与灰条紧贴 → 留 `--mlsb-gap:5px`（模板 `.details-wrap{margin-bottom:var(--gap)}`）。

第三轮（2026-10-09，动作要快、要简单）：

11. 纸条要 1–2s 才出现（宿主 `/state` 是 2s 轮询）→ 补一个**从中间向两端展开**的入场（`mlsb-reveal`，`.18s`）；
12. 展开/收起是「啪」地跳变 → 改用模板那套 `grid-template-rows:0fr → 1fr` + 透明度过渡（`.2s`）。

第四轮（2026-10-09）：

13. 有点挤 → 整体**放大 1.5 倍**，并把所有尺寸收敛成一个 `--mlsb-s` 旋钮；**字体回默认栈**（不再用 Maratype）；
14. **重启桌面端后功能不见了、重新对话才正常** → 两层修复：账本里存**逐轮**数据并在启动回填；
    贴纸前用 `ctx.get('sessions').list.current` **精确**确认"客户端显示的是哪一段对话"；
15. 加一个开关 → 主题设置里新增 **「每轮 Token 结算」**（`localStorage['mar.billing.v1']`，默认开）。

第五轮（2026-10-09，用户复测："刚刚的对话没纸条，另一个工具区里新跑的却有"）：

16. 诊断：**宿主半边的代码要重启才生效**，所以"本功能上线前跑过的轮次"从来没有逐轮数据 ——
    实测账本里本话 `requests=215 / turns=0`，而重启后新跑的那个工具区会话 `turns=1`。
    → 新增**按需回填**：客户端带 `?session=` 来，宿主用 `ctx.sessionPersistence.readFrom(id, 0)`
    重放日志补出逐轮数据（走 DSH 自己的服务，不碰磁盘格式），每会话一次、8s 超时、失败静默。

> 为什么圆角要 `!important`：§4.3 那条 `body.theme-marathon *{border-radius:0!important}`
> 会把纸条也压成直角。豁免写在 `body.theme-marathon .mlsb-*` 上（多一个类，特异性压过通配），
> 与启动动画那颗 6px 状态灯同一手法。

> **背景层必须放行它。** ASCII 背景的「谁在画底板」扫描（`bgPaints`）有一个 200×200 的
> 尺寸门槛，而展开后的纸条约 268×240，正好越过它。所以 `bgPaintWalker()` 显式跳过
> `[data-mlsb-turn]`：它是内容不是底板 —— 少了这一条，展开时数字会浮在网格上。

> **为什么"居中"能这么写**：轮次尾巴的容器是 DSH 自己的
> `.zZmEaW_root{flex-direction:column;gap:16px;display:flex}`（`ui-chat` 的
> `TurnTailNodeView.module.css`）。它是**列**弹性容器，所以固定 `width:268px` +
> `margin-inline:auto` 在交叉轴上自动居中 —— 换成 `text-align` 或
> `justify-content` 都不会有用（那些走主轴/行内）。同一个 `gap:16px` 还顺手提供了
> 纸条与动作行之间的间距；纸条自己不再需要下外边距。

---

## 8. 不再有页面内设置（No In-Page Settings）

**主题无条件生效。** 没有浮动齿轮按钮，没有设置抽屉，没有 localStorage 开关。

原因（2026-09-18 修的真实 bug）：抽屉里的「启用主题」复选框会摘掉 body 上的
`theme-marathon` 类，而齿轮按钮的定位/配色规则本身写成
`body.theme-marathon .mar-set-toggle{…}`——**关掉主题 = 齿轮同时失去样式，
用户再也点不回来**。这类「唯一逃生舱口长在要关掉的东西里」的设计直接废除。

- 想关主题：去 DSH 的插件列表禁用 `dsh-theme-marathon`
- 旧版本残留的 `dsh-theme-marathon-*` localStorage 键**全部失效**（代码里已不再读取），
  且 `apply()` 会主动清掉 body 上可能残留的旧类名，避免半主题状态
- 可调项只剩一处：`src/client.template.js` 里 `body.theme-marathon{…}` 的一组
  `--mar-*` 颜色变量，加上 `docs/` 里的这些说明

### 8.1 设置对话框入场：方块马赛克（2026-09-18 新增）

点击侧栏「设置」打开对话框时，面板不是淡入，而是**被方块逐格擦出来**。

- 面板实测 **800×800**，切成 **5×5 = 25 个 160px 正方形**
  （CSS 里写成 `20% × 20%`，面板若改尺寸仍按比例铺满，不会溢出）
- 25 块按**固定伪随机顺序**（mulberry32 + Fisher-Yates，种子写死）逐个**熄灭**：
  到点直接没，不做动画（`animation:mar-tile-out 0s`，keyframes 里只有 `opacity`）。
  曾经每块自己 `scale 1→.7`，于是一次扫描被拆成 25 个独立的小动作，方块四周还
  会露出缝隙 —— 现已删除并加断言防回归
- **前 3 块同帧**（delay 0），其余每块间隔 **0.0155s**，最后一格 delay 0.341s；
  方块是瞬时的，所以**整段 0.341s 走完**，之后整层自移除（0.541s）
- **面板内容不淡入**：两列（`nav` / `content`）不带任何动画，方块清掉时文字已经在那里。
  曾经给它们挂过一条 0.45s 的 `opacity .15 → 1`，观感变成"整个对话框在淡入"，
  而不是"方块擦出来"，已删除且加了断言防回归（静态守卫 + 单测各一条）
- `prefers-reduced-motion: reduce` 时整层不挂（CSS 与 JS 双重保护）

**0.5 秒的预算怎么来的**（改任何一个常量都要重算这两行）：

```
最后一块 delay = (25 - 3) × MOSAIC_STEP = 22 × 0.0155 = 0.341s
整段结束       = 0.341 + MOSAIC_DUR(0)               = 0.341s   ≤ 0.5s
```

25 格在三分之一秒内扫完是一记**闪**，不是一道波——这是刻意的：它不能拖住面板。
`animationDelay` 用 **`toFixed(4)`** 而不是 `(2)`：步长只有 0.0155s，
两位小数会把所有延迟都舍到 0.02s，方块照样消失、但不再成序。

**为什么是固定顺序而不是真随机**：真随机的话，某次"看着不对"就没法复现。
顺序定死，观感是散的、调试是可重复的。

**实现要点**（动之前先读这段）：

| 事 | 在哪 |
| -- | ---- |
| 格子几何 / 熄灭 | 样式表 `.mar-mosaic` + `@keyframes mar-tile-out`（`0s`、只有 opacity） |
| 顺序 / 延迟 / 挂载卸载 | `mountMosaic()` / `clearMosaic()` |
| 面板定位 | `findSettingsPanel()` —— **按结构找**：`[class*="_navCell"]` 的祖先里 class 匹配 `*_panel` 的那个，不写死 hash 前缀 |
| 何时播 | `sweepSettingsPanel()` 每 1.2s 巡检 + 以 `[class*="_settingsArea"]` 为根的 MutationObserver |
| 播过没有 | panel 元素上的 `__marMosaicPlayed`；面板不可见时重置 → **每次打开都重播** |
| 常量 | `MOSAIC_GRID` / `MOSAIC_STEP` / `MOSAIC_HEAD` / `MOSAIC_DUR`（`MOSAIC_DUR = 0`，都在 `client.template.js` 顶部） |

**可见性判断用 `panelVisible()`，不要改回 `offsetParent` / `getClientRects`**：
对话框在 `position:fixed` 的 overlay 里，`offsetParent` 可能为 null；
而单测跑在 jsdom 上（没有排版引擎，rects 永远是空的）。
现在的写法是「在文档里 + 祖先链上没有 `display:none` / `visibility:hidden`」，
两边都成立。DSH 关对话框时是**整块卸载**，所以 `doc.contains()` 一条就覆盖真实场景
（这一点已在真实页面上验过：关闭再打开，动画确实重播）。

**Z 序**：`.mar-mosaic` 是**面板的子元素**（`position:absolute;inset:0;z-index:40`），
跟着 DSH 自己的定位走，不参与 §6 说的那套全屏层。

### 8.2 任务看板入场：每个选项卡一套准星 + 四个象限块带序揭开（2026-09-18 新增 / 09-20 按参考文件重做）

`@linxin666/dsh-client-ui-task-board` 把看板画进中栏，**它自己没有任何入场动画**。

**这段动画的编排来自用户自己写的参考文件**（`Downloads/index.html`，一张卡片上的
"闪烁 → 准星 → 绿框 → 区域逐块显示 → 移除绿框"）。主题做的是**把它的编排从卡片搬到
选项卡（列）上**：参考文件里的一"张卡片"，在这里就是一"个选项卡"。

**单位是「列」，不是看板、也不是卡片。** 看板是五个选项卡
（待规划 backlog / 待办 todo / 进行中 running / 已完成 done / 已失败 failed），
**每一列各拿一套**：自己的 4 个准星、自己的 2px 绿框、自己的 4 个象限块。
五列**同时**播，时间轴完全一致。点开时叠一层一次性层，走完就整层自删：

| 拍 | 时间 | 内容 |
| -- | ---- | ---- |
| 1 | 0 → 0.10s | 整个选项卡是一块**不透明黑板**，上面 **4 个准星**各闪一下（`mar-cross-flash`），随后**常亮约 1.1s** |
| 2 | 1.20 → 1.36s | **2px 酸绿边框**淡入，贴着选项卡四边 |
| 3 | 1.50 / 1.58 / 1.66 / 1.74s | 黑板是 **2×2 四个象限块**，按 **1-2-4-3** 逐块离开（左上→右上→**右下**→左下），**每块把自己的准星一起带走** |
| 4 | 1.74 → 1.90s | 第 4 块离开的**同一帧**，绿框开始淡出；整层随后自删 |

- 四块用 `display:grid` 的 `1fr 1fr / 1fr 1fr`：**格子本身就是象限**，
  于是"四个矩形"和"四个准星落在象限中心"两件事都由布局解决，**不用算任何百分比**
- 每块用**设置马赛克那套**：实心、`animation:mar-tile-out 0s`，
  唯一在动的是 delay —— 到点整块直接没，不淡不滑不缩放
  （马赛克也是 `mar-tile-out`：同一套技术、同一份 keyframes）
- 矩形颜色 = **`--mar-bg-void`（`#0B0D0B`）**，比列**深**。
  实测列 `background` = `rgb(39,39,51)`、看板 `rgb(11,13,11)`。
  **这条是整段的命门**：早先一版把矩形填成 `--mar-bg-panel`（= 列自己的底色），
  于是屏幕上**什么都没发生** —— 四个矩形位置、尺寸、顺序全对，灰块盖灰列，
  肉眼零变化，1-2-4-3 自然也读不出来（用户原话："效果不明显，我看不出来"）。
  深块压灰列才看得见：t=1.70 时**只剩左下象限**是 `(11,13,11)`，
  其余三块已是列色 `(39,39,51)`。复盘：马赛克之所以看得见，正是因为它用 void 盖 panel；
  照抄技术却换掉颜色，等于照抄了个寂寞
- **绘制顺序靠 DOM 顺序**（都是定位元素、`z-index:auto`）：先 4 个矩形、最后绿框。
  矩形不透明，绿框必须追加在它们之后才看得见；
  像素实测 t=1.70：矩形体内 `(11,13,11)`、同一帧绿框边框处 `(192,254,4)`
- **准星是它所在象限块的子节点** —— 这不是省事，是编排：
  准星的寿命就等于该象限被盖住的时长，象限一回来，准星跟着没了
- 准星 = 三根 `<i>`（横、竖、45° 菱形点），不是伪元素：
  主题有一条 `*::before/*::after{border-radius:0}` 的全局方圆规则，菱形是旋转方块，别去撞它
- 准星尺寸取**所在块宽度的 50%**（`--mar-cross-size`）。列是 242.8×821 的竖长条，
  取宽那一侧才让准星保持正方形、且四列之间大小一致；实测 60.7×60.7，臂 1.5px、菱形点 9.9×9.9
- 辉光是**从 token 推导**的 `color-mix(in srgb,var(--mar-accent) 45%,transparent)`，
  不往调色板里加新颜色（§2 的"别再添一个色号"）；不想要辉光就删这一条 `box-shadow`
- 列盒子在**挂载那一刻**量（`getBoundingClientRect`）并换算成看板相对坐标；
  实测列 `242.8×821` 在 `x=296/550.8/805.6/1060/1315.2`（看板 `1294×900` 在 `x=280`）

**2 秒预算怎么来的**（改任何一个常量都要重算这三行）：

```
绿框到位 = BOARD_FRAME_AT + 0.16（mar-fade-in 的时长） = 1.20 + 0.16 = 1.36s ≤ 1.50s（首块离开）
第 4 块  = BOARD_BLOCK_AT + 3 × BOARD_BLOCK_STEP      = 1.50 + 0.24 = 1.74s
整段结束 = 1.74 + 0.16（mar-fade-out 的时长）          = 1.90s  ≤ 2.0s
矩形本身耗时 = 0（到点即没）
```

两处衔接是要点，都有静态守卫硬校验：
**绿框必须在第一块离开前就位**（`FRAME_AT + .16 ≤ BLOCK_AT`），
**绿框必须在第 4 块离开的同一帧开始退**（`LAST_AT == BLOCK_AT + 3×STEP`）。

**实现要点**：

| 事 | 在哪 |
| -- | ---- |
| 准星几何 / 闪烁 keyframes | 样式表 `.mar-board-intro`（`--mar-cross-size/bar/dot` 三个可调尺寸）+ `.mar-cross` / `.mar-h` / `.mar-v` / `.mar-dot` / `@keyframes mar-cross-flash` |
| 矩形几何 | 样式表 `.mar-col-intro{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}` + `.mar-col-mask`（`background:var(--mar-bg-void)`） |
| 绿框 | 样式表 `.mar-col-frame`（`inset:0`、`border:2px`、两条 `mar-fade-*`，delay 由两个自定义属性给） |
| 每列的盒子 | `mountBoardIntro()` 里按 `getBoundingClientRect()` 算，写成 `.mar-col-intro` 的 inline `left/top/width/height` |
| 顺序 / 延迟 / 挂载卸载 | `mountBoardIntro()` / `clearBoardIntro()` |
| 看板定位 | `[data-dsh-taskboard-board]`（插件自己写的语义属性，不写死 hash） |
| 列定位 | `[data-dsh-part="column"]`（另有 `data-status` 可取 backlog/todo/…） |
| 卡片定位 | `[data-dsh-part="card"]`（**入场已经不碰卡片**，只是"这一列里有什么"的语义锚点） |
| 何时播 | 观察 `<html data-dsh-taskboard-active>` 的属性 MutationObserver（插件开/关看板都会改它）+ 1.2s 巡检兜底 |
| 播过没有 | 看板节点上的 `__marIntroPlayed`；看板不可见时重置 → **每次打开都重播** |
| 常量 | `BOARD_FRAME_AT` / `BOARD_BLOCK_AT` / `BOARD_BLOCK_STEP` / `BOARD_LAST_AT` / `BOARD_INTRO_SPAN` / `BOARD_BLOCK_TURN = [0,1,3,2]` / `BOARD_CROSS_ARMS = ['mar-h','mar-v','mar-dot']` |

`BOARD_BLOCK_TURN` 就是「1-2-4-3」本身：它不是"第几拍"，而是
**"第 b 拍轮到哪个格子"**，格子按行优先编号 `0=左上 1=右上 2=左下 3=右下`。
`[0,1,3,2]` 读出来就是左上、右上、**右下**、左下。
想换顺序只改这四个数字，其余不用动（静态守卫会核对上面那两条衔接式与 `SPAN ≤ 2`）。

> **四个走过的弯路，别再回去**：
> ① 最初把准星和绿框**只做了一份、盖在整块看板上** —— 需求是每列一份；
> ② 之后把矩形切在**卡片**上、且切成 4 条**横条** —— 需求是切在**选项卡**上、
>    且是**象限**（参考文件里就是 2×2）；
> ③ 再之后把矩形填成**列自己的颜色** —— 等于隐形，需求是看得见的四个矩形；
> ④ 曾经用 `--mar-out-at` 让**整层淡出**收尾 —— 参考文件是"绿框跟着第 4 块一起退"，
>    没有整层淡出这一拍。
> 四条都写成了回归断言（静态守卫的 "no per-card / per-strip / per-board leftovers"、
> "the four rectangles contrast with the tab"；单测的 "one intro block per 选项卡 (all five)"、
> "each tab is 4 rectangles + 1 frame, and nothing per-card"）。

> **参考文件是用来量、不是用来读的。** 这次把 `Downloads/index.html` 直接渲染出来量了一遍：
> 绿框 1212ms 出现，四块在 1511 / 1594 / 1678 / 1761ms 离开（TL→TR→BR→BL），
> 第 4 块离开的**同一帧** `framed` 被移除；准星盒子 = 块宽的 50%（71.5px/143px），
> 臂 1.5px、菱形点 7px。有这些数，"照参考改"才不会变成"凭印象改"。

> 调试提示：动画全程只有 1.9s，**按墙钟时间截图必然对不上** ——
> 抓图本身要几十到两百毫秒，抓到的往往是"下一拍"。可靠办法只有一个：
> 把整层的动画 `pause()` 之后设 `currentTime = 毫秒数`，画面就是那一拍的静止画面，
> 采样和截图都变成确定性的（见 （开发期探针））。
> `currentTime` 把 delay 也算在内，所以 `currentTime = 1500` 就是"动画开始后第 1.50 秒"。

> **探针失败会留下上一次的 JSON。** 真机服务没起来时，探针 3 秒后放弃、进程 FATAL 退出，
> **但 `vcol2.json` 还是上一次那份**，读出来会以为是"本次结果"，而且是一份**旧版本结构**的结果
> —— 这次差点据此得出"改了没用"的结论。读完探针产物先看退出码与文件 mtime。


---

### 8.3 配色对切换：重放设置面板那套马赛克（2026-09-21 定稿）

**需求原话**（三次）：先是"每个方块由内向外开始铺，然后变色，**没铺到的就不变**"；
看过第一版之后改成——"这个效果不太好，不如我们改成**与设置面板一致的播放动画**？
只不过这次是**播放的时候顺带切换颜色**"，并明确"**不用再从内到外的执行动画了**"；
第二版跑通之后补了最后一条——"**是的，是这个效果，但我更希望是正方形，而不是长方形**"。

所以定稿是：**顺序、头 3 块、整场时长、落块方式照抄设置面板的马赛克**，
配色在播放过程中换掉，**方块是正方形**。最后半句"没铺到的就不变"是这套方案的全部难度所在。

切配色是改 `--mar-*` → 全站 `--dsw-*` 重算，**同一帧**内所有像素一起变；
想让"还没翻到的格子还是旧画面"，就必须在**同一时刻同时存在新旧两份像素**。
纯 CSS 做不到，只有 View Transitions 给得了：`::view-transition-old(root)` 是旧快照，
`::view-transition-new(root)` 是新快照，两个伪元素叠在一起，谁在上、被裁成什么形状，全由我们定。

代价是明说过的：过渡期间两个快照都是**静态位图**，canvas 上的点阵场会被冻住 0.341s。

#### 五条死路（都实测过，各自留了探针/断言）

| 试过的机制 | 结果 | 证据 |
| --------- | ---- | ---- |
| 多层 `mask-image` + 每层各自的 `animation-delay` | 整屏**瞬间**全变，铺不出来 | `mask-image` / `mask-size` 是**列表属性**，一个 animation 动画的是整个属性值，多个"层"没有各自的动画实例，延迟根本没地方挂 |
| `mask-composite: intersect` | 计算值直接不是它 | 拿一个**普通 div** 试也一样不生效，与 VS 无关，退掉 |
| `clip-path: url(#svg-clip)` + 动态改内部 `<rect>` | 形状能显示，但**长不大** | 该 url 在快照创建时**解析一次**；之后无论改 CSS 还是 `setAttribute`，裁剪范围纹丝不动 |
| 单个 `mask-size` 动画（不玩列表） | **能铺**，但**边缘是平滑的** | 半拍的位置上格子被切一半，斜边/毛边都出来了。"一块一块地亮"正是这个效果的全部意义，所以也退掉 |
| `inset()` + 一个注册过的 `<length>` + `steps()`（**中心向外的方形波前**） | 能跑、很好看，但**结构上就做不出马赛克顺序** | 它只用一个标量当时间轴，函数**单调** → 只能画出一圈一圈的环/方波前，无法表达"第 7 块 → 第 19 块 → 第 2 块"这种乱序。2026-09-21 用户看过实机后否掉，换成下面的方案 |

顺带撞出两个 VS 伪元素的坑，写在这里省得下次再试：

- `@keyframes` **必须把 `from` 和 `to` 都显式写出来**——省略 100% 那一帧在 VS 伪元素上不会补全。
- `fill: forwards` 在 VS 伪元素上**不渲染**，动画结束仍停在 `from`。

#### 采用的机制：正方形网格 + `clip-path:path()` + 每格一条子路径 + `steps(1,end)`

```
:root.mar-vt-on::view-transition-old(root){animation:none;opacity:1;}
:root.mar-vt-on::view-transition-group(root){animation:none;}
:root.mar-vt-on::view-transition-new(root){animation:mar-vt-mosaic var(--mar-vt-dur) both;}
```

`mar-vt-mosaic` 是按视口尺寸**在每次点击时现算**的（`vtGrid()` + `vtBuildFrames()`），塞进
`<style id="mar-vt-frames">`，过渡收尾时连同 class 一起删掉——页面上不留东西。

#### 网格：方块是正方形，行列数由视口短边推出来（2026-09-21 第二轮）

设置面板的格子之所以是正方形，只是因为**面板本身就是正方形**（800×800 / 5 = 160px）。
把同一套"5 列 × 5 行"原样铺到 1574×900 的视口上，得到的是 **315×180 的长条** —— 用户一眼就看了出来。

所以边长取**视口短边**：`side = min(vw, vh) / MOSAIC_GRID`（`MOSAIC_GRID` 仍是那个"5 等分"，
也就是面板自己"5 格宽"的含义），行列数由它推出来，**不存常量**：

| 量 | 计算 | 1574×900 上 |
| --- | --- | --- |
| `side` | `min(vw, vh) / MOSAIC_GRID` | 180 |
| `cols` | `Math.ceil(vw / side)` | 9 |
| `rows` | `Math.ceil(vh / side)` | 5 |
| 实际格子 | `vw/cols` × `vh/rows` | **174.9 × 180**（偏差 2.8%） |
| 总格数 | `cols × rows` | **45** |

`ceil` 保证网格盖满视口，代价是格子会**略小于** `side`，永远不会超出去。
行列数是派生量而非写死的，所以在任何窗口尺寸下格子都保持方形。

要点：

- **一帧一条 `path()`，里面永远是 `cols × rows` 个子路径**，顺序固定为 tile `0..total-1`：
  - 已翻的格子 = **它自己的矩形**，四周各 `Math.round` 后再**外扩 1px**
    （相邻两块因此重叠，不会出现发丝缝；最后一帧也能盖到视口边缘外）；
  - 没翻的格子 = `M0 0H0V0H0Z`，**面积为零**。
  为什么要留零面积而不是干脆不写？因为**命令数必须逐帧恒定**，`clip-path` 才可插值；
  路径一开始变长变短，浏览器就放弃动画。这是这套方案里唯一一个"看着多余但删了就废"的地方。
- **那 1px 外扩横竖都得做。** 只做横向的话长条是没了，接缝会改从竖边冒出来。
- 每个 stop 都带 `animation-timing-function:steps(1,end)` → 格子是**整块到位**的，
  不会从自己左上角"长"出来。少了它，效果就退化成 §8.1 面板马赛克里被否掉的那一种。
- **顺序与头 3 块复用面板的常量**（`mosaicOrder()` / `MOSAIC_HEAD`），不另立一套数值，
  否则两个揭示迟早会走形。帧 i 翻 `MOSAIC_HEAD + i` 块，落在 `i / (stops - 1)`。
- **整场时长也锚在面板上**（`vtDuration()` 就是面板那 0.341s），但**每拍步长不再等于 `MOSAIC_STEP`**：
  格数由视口决定，42 拍摊在 0.341s 上就是 **8.12ms/拍**，比面板的 15.5ms 短。
  这是第二轮明确选定的取舍（"整场仍是 0.341s"）。面板自己仍是 15.5ms/拍，没动。
- **旧快照钉在 `opacity:1` 且 `animation:none`** 是这套效果能成立的前提。
  VS 默认会让新旧两层**交叉淡出**——那等于"整屏一起变淡再变亮"，正是需求里排除掉的那种。
- **`::view-transition-group(root)` 必须把 UA 自己的动画也关掉。**
  它身上挂着 `-ua-view-transition-group-anim-root`（0.25s）；不管它，过渡的长度就是**两个钟**
  里短的那个，过渡会在 0.25s 处收摊、把这段作用域规则一起拆掉，被拆的那一刻起
  默认 cross-fade 接管——**还没翻色的格子整片被淡掉**。root 的几何根本不变，关掉零代价，
  于是 `vtDuration()` 成为唯一的钟。
- `--mar-vt-dur` 由 `vtDuration()` 的算术在起跑前写进 `:root`，CSS 里不写死。

#### 参数（都在 `src/client.template.js`，`vtPour()` 上方）

| 常量 | 现值 | 含义 |
| ---- | ---- | ---- |
| `MOSAIC_GRID` | `5` | 视口**短边**的等分数 = 面板的"5 格宽"；**不是**列数/行数 |
| `MOSAIC_STEP` | `0.0155` | 面板每块之间的间隔（s）；切配色时**只用来推总时长，不当步长用** |
| `MOSAIC_HEAD` | `3` | 第一拍一次性翻 3 块，面板的值 |

派生：`vtDuration() = (25 - 3) × 0.0155 = 0.341s` —— 它只跟面板常量有关，**与格数无关**；
格数 `cols × rows` 由视口推（本机 45）；帧数 `stops = 45 - 3 + 1 = 43`，每拍 `0.341 / 42 ≈ 8.12ms`。

#### 门控与收尾

- **只在配色对真的变了时才铺。** 点"关闭动画"（`mode=off`）只关画布、不动界面配色，
  走瞬时路径，不铺：`if (BG_STATE.scheme !== prevPair) vtPour(bgApplyMode); else bgApplyMode();`
- 能力探针 `vtPourReady()`：`startViewTransition` + `CSS.supports('clip-path', "path(…)")`
  + `!reducedMotion()`。任一不满足就直接 `apply()`，**退化为瞬时切换**，不铺不报错。
- 收尾 `vtPourFinish()` 移除 `mar-vt-on`、`--mar-vt-dur` 和 `#mar-vt-frames`，只由
  `transition.finished.then` 触发。
- **没有墙钟兜底计时器，而且是故意的。** 早先尾巴上留着
  `setTimeout(vtPourFinish, (dur + 1) * 1000)` 当保险；它跑在**墙钟**上，而揭示跑在
  **动画钟**上，两者只在 1× 时碰巧对齐（1341ms > 341ms）。一旦动画被放慢或冻住取证，
  墙钟计时器就先到点：实测放慢 50× 时它在**第 3/25 块**就摘了 `mar-vt-on`，
  UA 的 `group`/`fade-out` 随即被实例化，没翻色的格子全被 cross-fade 抹掉。
  ——更坏的是它让**所有"冻结时间轴"的取证都在说谎**：探针把动画冻在 t=0，
  计时器照常走，于是"没翻到的格子变了"看起来像渲染 bug。
  它本来要防的"`finished` 万一不结算就把标志位焊死"，现在由**下一次点击自己收尾**
  （`if (vtPouring) vtPourFinish();`）——不依赖任何时钟，也就不可能与动画钟打架。

#### 怎么验的

关键是**先把探针自己的噪声摘掉**，再谈采样：

- **不 `pause()`**。冻结时间轴的老手法（§8.2）在这里会把 `finished` 的结算搅乱，
  所以改用 `Animation.updatePlaybackRate(0.02)`（+ 8ms 巡扫新生成的动画）**慢放 50 倍**：
  相对时序完全不变，只是把 0.341s 拉成 6.8s，截图来得及，且不改变任何状态机。
- **点阵场先 `display:none`**。它每帧重绘，留着像素差分全是噪声。
- **判据逐帧自证、与时序无关**：每一格在每一帧里，只能**整块等于旧参照**或**整块等于新参照**；
  既不像旧也不像新 = 混合 = cross-fade 又回来了 = 失败。
  （不能用"这一拍该翻到第几格"来判：截图是异步合成的，落地帧可能早于也可能晚于
  主线程读到的动画时刻——实测两个方向都出现过，只差 1 格。任何"期望状态"断言都不成立。）
- 另加两条不含截图噪声的断言：clip 里"已翻格数"**单调不回退**（clip 是直接读的，与合成无关）；
  收尾前最后一帧必须几乎翻满（≥24/25）。

用开发期探针逐帧采集 + 离线判定，实测：

| t(ms) | 已翻 | 旧格 | 新格 | 旧格离旧参照的最大距离 |
| ----- | ---- | ---- | ---- | ---------------------- |
| 0     | 3    | 22   | 0    | **0.0** |
| 47    | 6    | 19   | 3    | **0.0** |
| 93    | 9    | 16   | 6    | **0.0** |
| 140   | 12   | 13   | 9    | **0.0** |
| 185   | 15   | 11   | 11   | **0.0** |
| 232   | 18   | 7    | 15   | **0.0** |
| 279   | 21   | 4    | 18   | **0.0** |
| 325   | 24   | 1    | 21   | **0.0** |

已翻格数 `[3, 6, 9, 12, 15, 18, 21, 24]`：每 46ms 正好 3 块 = 每 15.5ms 一块 = `MOSAIC_STEP`，
与面板同钟；没有一格是混合；没翻到的格子与旧参照**逐像素相同（距离 0.0）**。

**反证（这一步不能省）。** 一条"永远为绿"的判据等于没有判据——尤其是格数变多之后
绝对阈值被放宽过一次（见下），更得证明它还有牙。把
`setTimeout(vtPourFinish, (dur + 1) * 1000)` 塞回**构建产物**（`client.js`，改完 `curl` 确认
下发的字节数真的变了：280661 → 280739），同一套探针立刻给出：
`oldOp` 从 1 → 0.736 → 0.361 → 0.147 → 0.042 → 0.003 一路淡出，
`mar-vt-on` 在**第二帧**就被摘掉，t=47 / 93 / 139ms 三帧里分别有 15 / 15 / 3 格
**既不像旧也不像新**（`do` 与 `dn` 同量级、都落在 20~145 的中段），`VERDICT: FAIL`。
随后 `scripts/build.cjs` 重建，`md5` 回到**逐字节相同**的原值
（`ad976723c98721735ca9546542ef982a`），再跑一遍 `PASS`。

> **绝对阈值放宽过一次，原因记在这里。** 旧版格子是 315×180、判据用"离参照的平均绝对差 < 6.0"，
> 干净利落。格子缩到 174.9×180 之后出现假阳性：某一格离新参照 6.4，只因为**点阵场在过渡期间是
> 冻结的快照**、而 `after` 参照是恢复播放之后的实时画面 —— 含 canvas 的格子天然对不上一点，
> 格子越小这点残差在格子里的占比越大。改法是**绝对阈值 10.0 + 相对判据**
> （`dn < do × 0.35` 就归"新"）：混合态里 `do` 与 `dn` 同量级，比值接近 1，照样判红，
> 上面那条反证就是证明。

> **1× 上的耗时**（安静档量 View Transition 自己的分相位，不放任何采样器）：点击 → `ready`
> 约 **50ms**，`finished - ready` 约 **378ms**（揭示 341ms + 起跑前约 2 帧），
> 点击到收尾合计约 **437ms**。
> 同一份代码在 `--disable-gpu` 下是 511~590ms —— 差值来自**软件光栅化两张整页快照**，
> 是 headless 取证的假象，不是实机表现。
> 另外 8ms 采样器本身会把这段撑到 ~510ms，所以量耗时时必须开安静档。

回归断言：静态守卫的正向断言（旧快照钉住、`mar-vt-mosaic` 限定在 `mar-vt-on`、
`vtClipFor` 的零面积塌缩与 `M/H/V/H/Z` 五命令、`Math.round(...) ± 1` 的 1px 外扩、
`vtBuildFrames` 内 `mosaicOrder(total)`、`steps(1,end)`、`MOSAIC_HEAD + i`、
`vtDuration` = `(25 - 3) × 0.0155`、每点击注入 + 收尾移除、**禁止 `setTimeout(vtPourFinish`**、
重入收尾 `if (vtPouring) vtPourFinish();`），外加**反向断言**禁止上面五条死路复活。

> 匹配的是 **CSS 声明**（引号 + 可选缩进 + `属性:`），**不是裸名字**：
> 上面那些"某某机制已弃用"的注释本身就在源码里，用裸名字匹配会自己把自己判红。
> 这一段是踩过的：写出名字就会触发反向断言。
> 同理 `var order = mosaicOrder(total);` 在产物里出现**两次**（面板 + 帧生成），
> 断言必须锚定在 `vtBuildFrames` 内部，否则 `String.replace` 改的是面板那份，
> 断言永远为绿。

---

## 9. 安装与回滚

```
# 安装
dsh plugin --profile web add github:<owner>/dsh-theme-marathon

# 卸载
dsh plugin --profile web remove dsh-theme-marathon
```

卸载时：

- `theme.overrideTokens` 的 dispose 触发，DSH 自动恢复默认令牌
- `styles.insert` 返回的 dispose 触发，注入的 `<style>` 移除
- 启动动画 host 一并拆除；设置马赛克层与看板入场层移除、巡检定时器与两个
  MutationObserver 断开、面板上的 `mar-mosaic-on` / `__marMosaicPlayed` 与看板上的
  `__marIntroPlayed` 复位（对应界面还开着就卸载插件也不会留残留）
- 旧版遗留的 localStorage 键已无人读取，可在 DevTools 里手动清掉（不影响功能）

---

## 10. 兼容性目标

针对 `deepseekHarness 0.1.0-rc.8+`，与 `@deepseek-ai/dsh-theme-endfield`
同一加载契约（`__ModuleLoader__.load` / `theme.overrideTokens` / `styles.insert`）。

不修改 DSH 任何源码、不新增 Host 端服务、不动 bundle 栈以外的任何东西。

---

## 11. 自检（这个主题怎么验）

```bash
node scripts/build.cjs         # 生成 client.js（把 Maratype + boot payload 内联）
```

改动之后，本机的开发期校验脚本会来一遍（**不随本仓库发布**，见 README「仓库内容」）：
静态清单/契约/反模式断言、jsdom 的行为回归，以及**真实浏览器**里的
"覆盖完整性 / 真实 DOM 解析值 / 启动动画挂载与自移除 / 冻结时间轴逐拍采样 + 定帧截图"。
设计语言里的每一条硬规则（直角通配的豁免、马赛克预算、看板入场顺序、视口转场的两条衔接式…）
都有对应的断言，而且断言都做过**变异反证**：把源码改坏，确认它真的会红。

要看**真实界面**（不要只看代码推断）：这些校验都是**无头 Chromium + 真实 DOM** 做的——
接上本机跑着的页面，采样解析后的 token 值、连采动画帧数、用 `Page.startScreencast` 取首帧，
需要时**冻结时间轴**逐拍采样并定帧截图。所有探针脚本都是开发期工具，**不随本仓库发布**。

判据（本轮新增）：

- 收起侧栏后，导轨里**每个图标**的 `cx` 与栏中心（56/2 = 28）相差 **0**；
  注入行的盒子是 `x=10 w=36`、`margin:0 0 12px`，标签 span `display:none`；
  图标中心的 y 间距是**均匀的 48**
- 打开看板那一瞬间抓层：`.mar-board-intro` 下有 **5 个 `.mar-col-intro`**（每列一个），
  每个的 `left/top/width/height` = 该列盒子换算成看板相对坐标
  （实测列 `242.8×821` 在 `296/550.8/805.6/1060/1315.2`，看板在 `280`，所以 inline 是 `16/270.8/525.6/780.4/1035.2`）
- 每个列块里 **4 个 `.mar-col-mask` + 1 个 `.mar-col-frame`**，
  且**子节点顺序就是这两组**（四块→框；都定位、`z-index:auto`，DOM 顺序即绘制顺序）
- 四块是 `display:grid` 的 `1fr 1fr / 1fr 1fr` 单元格，盒子实测
  `121.4×410.5` 在 `(296,57) (417.4,57) (296,467.5) (417.4,467.5)` —— 正好是列的四个象限
- 每个块里 **1 个 `.mar-cross`**，由三根 `<i>` 组成（`mar-h` / `mar-v` / `mar-dot`）；
  准星盒子 `60.7×60.7`（= 块宽的 50%）、中心落在块中心（实测 `[357,262] [478,262] [357,673] [478,673]`），
  臂 `60.7×1.5`、菱形点 `9.9×9.9`（7px 旋转 45° 的外接盒）、颜色 `rgb(192,254,4)`、
  辉光 `color(srgb … / 0.45) 0px 0px 6px`（由 `color-mix` 从 token 推导）
- 矩形：`background` = **`rgb(11,13,11)`（`--mar-bg-void`，比列深）**、名称 `mar-tile-out`、时长 **0s**、
  `animationDelay` 按格子（左上/右上/左下/右下）是 **1.50 / 1.58 / 1.74 / 1.66**
- 绿框：`border 2px rgb(192,254,4)`、`box-sizing:border-box`、`inset:0`（贴选项卡四边）
- **冻结时间轴**（`pause()` + `currentTime = t`，见 （开发期探针））
  逐拍采样每列 4 块的不透明度（左上 右上 左下 右下）：

  ```
  t=0     1.00 1.00 1.00 1.00    准星 0    框 0.00   ← 黑板 + 准星闪烁的第 0 帧
  t=0.10  1.00 1.00 1.00 1.00    准星 1    框 0.00   ← 闪完，常亮
  t=1.20  1.00 1.00 1.00 1.00    准星 1    框 0.00   ← 绿框 delay 未到
  t=1.28  1.00 1.00 1.00 1.00    准星 1    框 0.50   ← 绿框淡入中
  t=1.36  1.00 1.00 1.00 1.00    准星 1    框 1.00   ← 绿框就位（比首块离开早 0.14s）
  t=1.50  0.00 1.00 1.00 1.00    准星 1    框 1.00   ← 左上离开
  t=1.58  0.00 0.00 1.00 1.00    准星 1    框 1.00   ← 右上离开
  t=1.66  0.00 0.00 1.00 0.00    准星 1    框 1.00   ← **右下**离开（4 排在 3 前面）
  t=1.74  0.00 0.00 0.00 0.00    准星 1    框 1.00   ← 左下离开；绿框同帧开始退
  t=1.78  0.00 0.00 0.00 0.00              框 0.75
  t=1.90  0.00 0.00 0.00 0.00    准星 1    框 0.00   ← 整层收尾
  ```

  「已离开」的编号读出来是 `[1] → [1,2] → [1,2,4] → [1,2,3,4]`，**这就是 1-2-4-3 的直接证据**
- 五列的这些数**逐字段相同** → 五列同拍（探针里逐行打 `同拍` / `DIFF`）
- **绘制顺序的硬证据用像素采样，不要用 `elementsFromPoint`**：
  层是 `pointer-events:none`，命中测试直接穿透。改成在 t=1.70（只剩左下是黑的）的定帧上采：
  矩形体内 `(11,13,11)`、已被揭开的左上象限是列色 `(39,39,51)`、
  **同一帧绿框边框处 `(192,254,4)`（正压在仍然不透明的左下方块上）** → 框画在块之上。
  再对比 t=0.10（绿框 delay 未到，该处是列色）与 t=1.90（收尾，该处也是列色）——
  三点连起来才算证明
- 1.90s 后层自删、无 `mar-` 前缀的孤儿动画；**关掉再打开必须重播**（`replay` 里 5 个块 / 20 个矩形）

判据（原生启动屏，2026-09-20 新增）：

- 服务端返回的 `index.html` 里，`<head>` 紧跟其后就是我们的 `<style>`
  （在 `__ModuleLoader__` 脚本与所有 `<link rel=stylesheet>` **之前**）：
  `GET /` → 断言 body 里含 `data-dsh-boot-spinner` 且它出现在第一个 `<script>` 之前
- 真机逐 rAF 采样整段启动期（（开发期探针），
  采样器由 `Page.addScriptToEvaluateOnNewDocument` 在**任何页面脚本之前**装上）：
  - `log.glyphFrames === 0`、`log.firstGlyph === null` → 原生卡片（HARNESS + 转圈）**一帧都没被画出来**
  - `log.first.plateBg === 'rgb(11, 13, 11)'`、`log.first.htmlBg === 'rgb(11, 13, 11)'`、
    `log.first.cardDisplay === 'none'`、`log.first.plateBox === 视口高`（板子铺满）
  - `log.goneAt`（板子被 `dispose()` 的时刻）早于 app 挂上，中间那段屏幕上是主题自己的启动动画
- 同一探针在**真实引擎**里跑 `:has()` 闸门：
  `gate.loading.cardDisplay === 'none'`（带 `[data-dsh-boot-spinner]` → 藏）
  且 `gate.failed.cardDisplay === 'block'`（DSH 加载失败时 spinner 被换掉 → **失败卡必须照常显示**）
- 首帧颜色只认 `Page.startScreencast` 推出的帧（（开发期探针））：
  本页面上屏的第一帧若是白的，那是 Chrome 给空文档画的底色 —— 拿全暗的本地页面对照，
  第一帧同样白，加 `color-scheme` meta 也无效。**别把"navigate 后马上截图"当首帧证据。**

判据（既有，仍然必须成立）：

- 左栏静态：新会话按钮解析成 `rgb(11,13,11)` 底 + `rgb(46,47,56)` 边（DSH 自己的面），
  会话行 `rgba(0,0,0,0)` 透明底。**任何静态绿底都是回归。**
- 悬停「新会话」：`background` 变 `#C0FE04`、`color` 与 svg `fill` 变 `rgb(11,13,11)`；
  移开后必须回到中性面
- 悬停任一会话行：`background` 与常态**逐字段相同**（含把 DSH 的 8% wash 压掉）；
  只有 `_selected` 那行是实心绿 + accent ink
- 发送按钮 svg path 的 `fill` = `rgb(11,13,11)`
- 全站扫描：**非零 `border-radius` 的元素数为 0**；合成一个
  `#dshMarBootHost > .mb-status-dot` 时它必须仍是 `50%`（否则启动动画的状态灯会方掉）
- 设置对话框刚打开时 `.mar-mosaic` 存在、子元素 **25** 个、
  `animationDelay` 有 3 个是 0、之后按 0.0155s 递增到 0.341s、`animationName` = `mar-tile-out`
- 每一格的 `animation-duration` 必须是 **0**、computed `transform` 必须是 **`none`**：
  出现任何非 `none` 的 transform（缩放矩阵）就是"每格自己做动画"回来了
- 用 `layer.getAnimations({subtree:true})` 量时间轴：`max(delay + duration)` **≤ 500ms**
  （别用 `animationend` 的墙钟时间——它多带约 40ms 的 MutationObserver 跳转与事件派发开销）
- 连采几次统计"还亮着的格子数"：必须**单调递减**（约 +30ms 剩 21、+100ms 剩 16、+200ms 剩 0），
  这是"按时间顺序熄灭"的直接证据
- **面板自身与两列的 `opacity` 从头到尾恒为 `1`、`getAnimations()` 为空** ——
  任何一个采样点读到 `opacity < 1` 或 `mar-mosaic-content`，就是淡入回来了
- 约 0.55s 后 `.mar-mosaic` 与 `mar-mosaic-on` 都消失，`document.getAnimations()` 为空，
  且无 `mar-` 前缀的孤儿动画
- **关闭再打开，`.mar-mosaic` 必须重新出现**（这是 `__marMosaicPlayed` 复位那段的验证）

> 自清只要 0.55s，而巡检间隔是 1.2s —— 探针/单测**不能"睡一觉再看"**，
> 会直接睡过整段动画。一律改成轮询到出现为止（单测里的 `waitFor()`）。

`computed` 值不能靠 `getPropertyValue` 盲扫：`--dsw-*` 里只有被定义的那批会解析出颜色，
挨个列清单要直接读 `dsh-client-ui-theme/lib/client.js` 的 dark / light 块
（`list-uncovered.cjs` 就是这么做的）。

---

_版本：v0.1.0 · 与 dsh-theme-endfield v0.x 同代 ·
灵感来源 Marathon / Ash Thorp / 编辑级 Glitch 平面设计_
