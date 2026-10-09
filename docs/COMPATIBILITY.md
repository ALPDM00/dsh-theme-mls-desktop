# 兼容性 —— DSH 主题 · Marathon（桌面版）

> **本文件继承自纯浏览器的 `dsh-theme-marathon` 包、原本描述的是网页版。**
> 桌面版有三处不同：
>
> 1. `dsh.profile.bundles` 必须列出**包名** `dsh-theme-mls-desktop`；而
>    `id: theme-mls-desktop` 那一行是本包 `cordis.patch.yml` **插入**组合树的行
>    （见 `README.md` §4 —— `dsh plugin add` **不会**替桌面 profile 写 `bundles`，
>    所以这是必需的手工步骤，漏了插件会静默不加载）；
> 2. `index.js` **不是空壳**：它通过 `webserver/index-inject` 注入预插件期的
>    `<style>` 行，并在桌面端调度 shell 补丁（`shell-patch/auto.cjs`）。见 `README.md` §3/§4；
> 3. 另有四个效果需要把补丁打进 `<install>/resources/app.asar`（透明窗口、隐藏原生
>    caption 按钮、首帧可透视、启动即最大化）。这一步现在是自动的，但**仅桌面端**。
>
> 下面关于 token、服务与客户端加载器的部分，两个版本完全一致。

## 目标运行环境

| 组件 | 要求 |
| ---- | ---- |
| deepseekHarness | `0.1.0-rc.8` 或更新 |
| 客户端加载器 | `window.__ModuleLoader__.load`（浏览器运行时） |
| 主题服务 | `ctx.get('theme').overrideTokens(id, map)` |
| 样式服务 | `styles.insert(css)`（可选；缺席时回落到注入 `<style>`） |
| Host 半边 | `webserver/index-inject`（预插件期样式行）+ `shell-patch/` + **计费半侧**（见下） |
| Web 服务 | `ctx.inject(['webServer'], …)` → `ctx.webServer.register({kind:'prefix', path, handler})` |
| 会话事件流 | `ctx.on('session/event', (session, event))`、`ctx.on('session/disposed', …)` |
| 转录锚点 | `[data-turn-tail="<轮次号>"]`（每轮结算块贴在这里；来自 `dsh-client-ui-chat` 的 `TurnTailNodeView`） |
| 输入卡锚点 | `[class*="composerSeat"]`（启动标记 / 输入卡定位，已实测） |
| 余额服务 | `ctx.get('deepseekAccount').getBalance(meta)` → 回落 `ctx.get('credentials').resolve('DEEPSEEK_API_KEY')` |
| 会话持久化 | `ctx.sessionPersistence.readFrom(id, 0)`（回填"本功能上线前"的旧轮次，见 `README.md` §7） |
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

只通过 `overrideTokens` 覆盖设计 token。DSH 的布局、组件、路由与数据**从不**被改动。
卸载插件即自动恢复默认主题（`overrideTokens` / `styles.insert` 的 disposer 在卸载时触发）。

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

## 已验证项

| 检查 | 方法 | 状态 |
| ---- | ---- | ---- |
| 插件经 `__ModuleLoader__` 加载 | `selftest.cjs`（jsdom） | ✅ |
| `overrideTokens` 收到正确的映射 | `selftest.cjs` | ✅ |
| CSS 注入、字体内联、无占位符残留 | `check.cjs` + `selftest.cjs` | ✅ |
| 设置项读写 `localStorage` 与 body 类 | `selftest.cjs`、`test/plugin.test.cjs`（116 项） | ✅ |
| 卸载/重挂载不留残留 | `test/dispose.test.cjs`（28 项） | ✅ |
| 计费引擎（价目表、峰谷、折叠、账本、宿主装配、回填） | `npm run test:billing`（43 项） | ✅ |
| 每轮结算块（落位、八行、用时冻结、圆角/间隙/尺寸、动画、开关、会话匹配） | `npm run test:billing-ui`（35 项） | ✅ |
| 在 DSH profile 里手工安装 | 用户侧（`dsh plugin --profile desktop add …`） | ⚠️ 需在副本中自行验证 |
