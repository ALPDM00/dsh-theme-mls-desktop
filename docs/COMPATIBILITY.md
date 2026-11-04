# 兼容性 —— DSH 主题 · Marathon（桌面版）

> 本文件与网页版 [`dsh-theme-marathon`](https://github.com/ALPDM00/dsh-theme-marathon) 共享
> 大部分宿主契约（token、服务、客户端加载器）。桌面版的差异只有三处：
>
> 1. `dsh.profile.bundles` 必须列出**包名** `dsh-theme-mls-desktop`；而
>    `id: theme-mls-desktop` 那一行是本包 `cordis.patch.yml` **插入**组合树的行
>    （`dsh plugin add` **不会**替桌面 profile 写 `bundles`，所以这是必需的手工步骤，
>    漏了插件会静默不加载 —— 见 [docs/INSTALL.md](INSTALL.md)）；
> 2. `index.js` **不是空壳**：它通过 `webserver/index-inject` 注入预插件期的 `<style>` 行，
>    并在桌面端调度 shell 补丁（`shell-patch/auto.cjs`）。见
>    [docs/ARCHITECTURE.md](ARCHITECTURE.md) 与 [docs/SHELL-PATCH.md](SHELL-PATCH.md)；
> 3. 另有四个效果需要把补丁打进 `<install>/resources/app.asar`（透明窗口、隐藏原生
>    caption 按钮、首帧可透视、启动即最大化）。这一步现在是自动的，但**仅桌面端**。
>
> 下面关于 token、服务与客户端加载器的部分，两个版本完全一致。

## 目标运行环境

| 组件 | 要求 |
| ---- | ---- |
| deepseekHarness | `0.1.0-rc.8` 或更新（已实测 `0.2.0-rc.2` 与 `0.2.2-rc.1` / Electron 44） |
| 客户端加载器 | `window.__ModuleLoader__.load`（浏览器运行时） |
| 主题服务 | `ctx.get('theme').overrideTokens(id, map)` |
| 样式服务 | `styles.insert(css)`（可选；缺席时回落到注入 `<style>`） |
| Host 半边 | `webserver/index-inject`（预插件期样式行）+ `shell-patch/` + **计费半侧**（见下） |
| Web 服务 | `ctx.inject(['webServer'], …)` → `ctx.webServer.register({kind:'prefix', path, handler})` |
| 会话事件流 | `ctx.on('session/event', (session, event))`、`ctx.on('session/disposed', …)` |
| 转录锚点 | `[data-turn-tail="<轮次号>"]`（每轮结算块贴在这里；来自 `dsh-client-ui-chat` 的 `TurnTailNodeView`） |
| 转录滚动区 | `[data-conversation-scroll]`（`dsh-client-ui-conversation` 的 `ConversationRoot` 写在转录滚动区上的语义属性）—— 任务完成动画的白色方框铺在"它减去输入卡那一条、再减去侧栏"之后的矩形里；兜底用 `[class*="_centerCol"]` |
| 回合结束（任务完成动画的主判据） | ① DOM：转录里 **`[data-turn-tail]` 又追加了一个节点**，且**同一个转录**（上一次看到的尾巴节点仍在文档里）并且**这一轮先出现过 `[class*="_turnStatus"]`**（回合进行中指示器）；② DOM：`[class*="_turnStatus"]` 从有到无；③ 会话面 `ctx.get('sessions').binding(id).session` 的 `ConversationSnapshot.turnEnds` 增长（单调计数器）；④ 列表快照 `sessions.list` 的 `byId[id].running` 边沿（**只有宿主暴露 `list` 时才有**）。判据 ③④ 需要"当前会话 id"，而真机服务面**没有 `list`、也拿不到 id**（见下），所以 ①② 才是主判据 |
| 回合"中断/报错"收尾 | 有会话 id 时读 `binding(id).session.getSnapshot().nodes` 末尾的 assistant `interrupted: true` / `turn-error` 节点，并拦下 `session.cancel()`；没有 id 时读 `[data-turn-tail]` 父元素里的「已中断 / 已停止」字样 |
| **`sessions` 服务面（实测）** | 真机客户端 `ctx.get('sessions')` 是 `{ retain, using, retainInfo, refreshProjections, search, fork, scope, binding }` —— **没有 `list`**（`SessionListState` 是 ui-conversation 域自己的 store）。任何"没有 `list.subscribe` 就不装触发链"的写法都会让它永远不触发；也**拿不到"当前会话 id"**（DOM 里没有 `data-session*`），所以 `binding(id)` / `scope(id)` 无法自举 |
| 输入卡锚点 | 启动标记的方框点阵按**类名 token 以 `_card` 结尾**在 composer 栈里就地找真卡片（现役构建 `GRgSLq_card`；`0.2.0-rc.2` 是 `RlGAzG_card`，只作历史参考；`composerSeat` / `composerStack` / `composerHero` 只作兜底）—— `uV2eYG_*` 在现役 app.asar 里已完全不存在 |
| 余额服务 | `ctx.get('deepseekAccount').getBalance(meta)` → 回落 `ctx.get('credentials').resolve('DEEPSEEK_API_KEY')` |
| 会话持久化 | `ctx.sessionPersistence.readFrom(id, 0)`（回填"本功能上线前"的旧轮次，见 [docs/BILLING.md](BILLING.md)） |
| 会话选中项 | `ctx.get('sessions').list.getSnapshot().current`（精确判断"客户端正在显示哪段对话"） |

> **兼容闸门（0.2.x）**：宿主的 `evaluatePluginCompatibility` **只检查 `peerDependencies` 里
> 名为 `@deepseek-ai/dsh` 或 `@deepseek-ai/dsh-*` 的项**。本包不声明任何 `dsh-*` peer，
> 宿主服务一律走 `ctx.get()` / `inject([...])`，所以既不会被判 incompatible，
> 也不会因为把 peer 钉在旧版本而在未来被静默 `disabled`。计费半侧同样不 import 任何
> `@deepseek-ai/dsh-*`：它在 `index.js` 里被**动态 import**，出问题只是「没有计费」，
> 绝不会让主题加载失败。

本插件与 [`@deepseek-ai/dsh-theme-endfield`](https://github.com/ymh0000123/dsh-theme-endfield)
使用**完全相同的加载契约**：

- 通过 `cordis.patch.yml` 注册 → bundle 行 `id: theme-mls-desktop`；
- `package.json` 声明 `dsh.bundle.patch` 与 `exports["./client"]`；
- 主题本身在客户端；`index.js` 是 Host 半边，负责页面做不到的事
  （预插件期启动样式行、桌面 shell 补丁、以及计费引擎）。

## 它覆盖了什么

主要通过 `overrideTokens` 覆盖设计 token；另有**加性**的 DOM（不属于覆盖，卸载即拆）：

| 加性 DOM | 位置 | 何时存在 |
| --- | --- | --- |
| 启动 / 完成覆盖层 | `#dshMarBootHost` / `#dshMarDoneHost`，`body` 末尾，`pointer-events:none` | 播放期间，结束后自删 |
| 背景点阵 | `#mar-ascii-bg`，`body` 第一个子节点，`pointer-events:none` | 开关打开时 |
| 「主题设置」页 | 设置对话框内部（宿主自己的 `_panel` 里） | 打开设置页时 |
| **运行动画条带** | `#dshMarRunHost`，`[data-composer-seat]` 的第一个子节点 | 回合运行期间；关掉开关 / 回合结束即拆 |
| **点阵动画** | `#dshMarDotHost`，`[data-composer-seat]` 内、输入卡右侧的绝对定位层 | 回合运行期间；关掉开关 / 回合结束即拆 |

DSH 的组件、路由与**数据**从不被写；运行条带只**读**会话快照（`sessions.binding(id).session
.getSnapshot()`）与宿主自己的 `role="status"` 文案。卸载插件即恢复默认主题（`overrideTokens`
/ `styles.insert` 的 disposer 在卸载时触发，加性 DOM 由 `dispose()` 自清）。

## 壳补丁与壳版本

`shell-patch/` 的三处改动都按**字面锚点**改 `app.asar` 里的源码，所以它跟的是**桌面壳构建**，
不是 DSH 的语义版本。桌面端升级会把 `app.asar` 换回原版：补丁没了的症状恰好是三条一起回来
——窗口不透明、不最大化、右上角三个原生按钮在启动动画上突兀地出现。插件每次加载都会
`probeShell()` 看一次；原版就自动在后台重打（`docs/SHELL-PATCH.md`）。

| 壳构建 | `lib/main.js` 里的 `windowsAppearance` handler | 说明 |
| --- | --- | --- |
| `0.2.0-rc.2` | `(event, language, color, symbolColor)`，还会写 `windowsLanguage` | 旧锚点 |
| `0.2.2-rc.1` | `(event, _language, color, symbolColor)`，语言不再从这里写 | 2026-11-04 适配 |

同一次适配里还确认了：前端启动板仍然在 `#root > [data-dsh-boot]` 上、spinner 仍然通过
`dataset.dshBootSpinner` 落 `data-dsh-boot-spinner`（`dsh-web-frontend` 的 boot kernel），
`serveWebDocument()` 仍然不拼接 `webserver/index-inject` 行（所以首帧补丁仍必须写进
`dist/index.html`）。前端新增了 `globalThis.__DSH_BOOT_READY__` 与
`html[data-windows-titlebar]`（只影响浮动面板的定位，不画底色），不影响本包的启动路径。

## 运行动画的宿主锚点（2026-11-05 实测 `0.2.2-rc.1`）

| 锚点 | 语义 | 稳定性 |
| --- | --- | --- |
| `[data-chat-running]` | 回合进行中那一行（`RunningStatus` 根） | 整个 asar 只出现 1 次；用它，不要用 `[class*="_running"]`（命中 7 个节点） |
| `[data-chat-running][data-holding]` | 回合已结束、动作行尚未替换（整行 `visibility:hidden`） | 出现即卸载条带 |
| `[data-chat-running] [role="status"]` | 宿主自己的本地化「深度求索中」文案 | 标题行直接读它，中英文跟宿主 |
| `[data-composer-seat]` | `position:sticky; bottom:0` 的输入框座位 | 两个动画都挂它：条带是 firstChild；点阵是它内部的绝对定位层 |
| `[data-composer-card]` | 输入卡本身（宿主自己的 `GRgSLq_card` 带这个 data 属性） | 点阵按它的实测宽度算右侧空白与垂直中心 |
| `--dsh-composer-side-clearance` / `--dsh-composer-dock-inset` / `--dsh-composer-card-max-width` | 输入卡宽度预算（继承自 `.an3WzG_body`） | 条带宽度按 queue dock 同一公式算，缺变量时回落到 16 / 8 / 952 |
| `ConversationSnapshot.turnTimings` / `.runningCalls` / `.partial` | 用时 / 当前工具 / 生成阶段 | 只读；缺失时逐项降级（用时退回「第一次看见运行行」） |

React 侧结论：`RunningStatus` 的 children 是 3 个无 key 的 span，`holding` 只增删 index 0，
running / holding 共用同一个 key `"running"` —— 是 props 更新不是 remount。两个动画都挂在
`[data-composer-seat]`（React children 只有 composer）里，因此不进 React 的 diff；运行行被
整个卸载时由我们自己的 DOM 轮询撤销。详见 [docs/RUNNING.md](RUNNING.md)。

## 已知限制

- **按组件的选择器**（`[class*="sidebar"]`、`[class*="message"]` 等）是尽力而为、
  只做加法（边框、圆角、focus 轮廓）。具体类名随 DSH 版本变化；若未来 DSH 重构 DOM，
  某些组件级点缀可能不再出现 —— 启动覆盖层与 token 调色板不受影响。
  （主题已不再绘制任何自己的覆盖层：网格、扫描线、CRT、扫描带都在 2026-09-18 移除。）
- **没有页面内设置抽屉**：主题无条件生效，启用/禁用走 DSH 的插件列表。
  （旧的抽屉有个真实缺陷：它那个「启用主题」复选框会摘掉给齿轮按钮本身设样式的 body 类，
  于是关掉主题就再也点不回来。）唯一在页面内的设置是设置对话框里的「主题设置」页
  —— 它挂在 DSH 自己的对话框里，不是我们自己叠的层。
- **字体**：主题 UI 用宿主默认字体栈；Maratype 只用于启动覆盖层，以 base64 内联，
  缺失时回落到 `ui-monospace, monospace`。

## 本机验证过的项

开发期在本机跑过下面这些检查（**校验脚本不随本仓库发布**，这里只记结论）：

| 检查 | 状态 |
| ---- | ---- |
| 插件经 `__ModuleLoader__` 加载 | ✅ |
| `overrideTokens` 收到正确的映射 | ✅ |
| CSS 注入、字体内联、无占位符残留 | ✅ |
| 设置项读写与 body 类 | ✅ |
| 卸载/重挂载不留残留 | ✅ |
| 计费引擎（价目表、峰谷、折叠、账本、宿主装配、回填） | ✅ |
| 每轮结算块（落位、八行、用时冻结、圆角/间隙/尺寸、动画、开关、会话匹配） | ✅ |
| 任务完成动画的触发链与四拍（含"挂载历史不误播、切会话不重播"） | ✅ |
| 启动动画引擎的几何与时间线 | ✅ |
| 桌面壳补丁（结构自洽、发现、应用/还原、并发加锁） | ✅ |
| 在 DSH profile 里手工安装 | ⚠️ 需在副本中自行验证 |
