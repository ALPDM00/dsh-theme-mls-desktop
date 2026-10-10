# 安装与排错

> 这一页原本是 README 里的一节，为公开仓库拆出来独立成页；内容与主线一致。
> 返回 [README](../README.md)。

---

## 一、先看这一节：`dsh plugin` 未必给你走

`@deepseek-ai/dsh/lib/bin.js` 里对 `profile === "desktop"` 有一道闸门：

```
error: profile "desktop" is managed exclusively by the Electron application
```

**这道闸门同样挡在 `plugin` 子命令前面。** 桌面端自带的那份 dsh（0.2.0-rc.2）里它是这样写的：

```js
plugin.requiredOption("--profile <name>", ...).action((args, options) => {
  if (options.profile === "") program.error('error: --profile needs a name');
  if (!manageDesktopProfile) rejectElectronProfile(plugin, options.profile);
  ...
});
```

`manageDesktopProfile` 是 `runCli(options)` 的**函数参数**，默认 `false`；它的注释写明用途是
「permit Desktop's installed carrier to manage its reserved profile's plugins」—— 那扇门只留给
桌面端自己的载体进程。**随包发布的代码里没有任何地方把它设成 `true`**：2026-10-11 扫过
`app.asar` 里 296 个非 `node_modules` 的 `.js/.cjs/.mjs`，没有一处引用它。

npm 全局装的那份（0.1.5-rc.1）更干脆 —— `rejectElectronProfile(plugin, options.profile)` 是
**无条件**调用的，连这个参数都没有。

所以「只有 `dsh plugin` 一条路放行」这个说法**不成立**。按 dsh 构建实测：

| 你手上的 dsh | `dsh plugin --profile desktop add …` | `--profile desktop --dump-config` |
| --- | --- | --- |
| 桌面端自带 0.2.0-rc.2 | ❌ 被闸门拒绝 | ❌ 被闸门拒绝 |
| npm 全局 0.1.5-rc.1 | ❌ 被闸门拒绝（无条件） | ❌ 被闸门拒绝 |
| 不带闸门的老构建（实测 0.1.1-rc.2） | ✅ 转发给 pnpm | ✅ |

手边没有不带闸门的构建也没关系 —— 走「三、全手工安装」，效果一样。
**无论走哪条路，第「四、补 `bundles`」都是必需的。**

---

## 二、CLI 路径（手上那份 dsh 不带闸门时）

```bash
# ① 装插件本体（依赖、shell-patch/、client.js 全跟着进）
dsh plugin --profile desktop add github:ALPDM00/dsh-theme-mls-desktop
```

⚠️ **这个命令很可能以退出码 1 结束，而依赖其实已经装好了。**

pnpm 11 对没写进 profile 的 `pnpm-workspace.yaml` → `allowBuilds` 白名单的依赖，
**不跑它的生命周期脚本**，并报：

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: dsh-theme-mls-desktop@…
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

`dsh` 会把 pnpm 的非零退出码原样透出（`dsh: pnpm failed in profile directory …`）。
但这时去看 profile：`dependencies` 已经有了、`pnpm-lock.yaml` 已更新、`node_modules` 里
也能看到包。**唯一被拦下的是 `postinstall`** —— 也就是壳补丁那一步。

想让它真的跑起来（装完第一次启动就带壳效果），二选一：

- 把包名加进 profile 的 `pnpm-workspace.yaml` → `allowBuilds`；或
- 在 profile 目录跑一次 `pnpm approve-builds`。

没放行也不会坏：`shell-patch` 还有第二条自动路径（插件被加载时的钩子）兜底，
见「五、桌面壳补丁」。

---

## 三、全手工安装（不依赖任何 CLI）

profile 启动时真正需要的只有两样东西：**能在 `node_modules` 里解析到本包**，
以及 **`dsh.profile.bundles` 里有它**。任何能达成这两件事的做法都可以。

```bash
# ① 把包装进 profile 的 node_modules
#    —— 仓库内容直接解压拷进去，或者用任意包管理器往 profile 目录装都行
<把 dsh-theme-mls-desktop 放到> $DSH_HOME/profiles/desktop/node_modules/dsh-theme-mls-desktop

# ② 补 bundles（见下一节）
```

---

## 四、补 `bundles`（无论哪条路都必需）

⚠️ **`dsh plugin add` 不会替你挂载插件 —— 装完必须再手工补一行 `bundles`。**

这不是配置习惯问题，是 desktop profile 的代码路径决定的。0.2.0-rc.2 的
`@deepseek-ai/dsh/lib/plugin-BGnVfe_D.js` 里，分支长这样：

```js
const result = profile === "desktop" ? await withFileLock(join(dir, "package.json"), async () => {
  requireDesktopProfile(dir);
  return runProfilePnpm(context, args, options);     // ← 把参数原样交给 pnpm
}, { waitMs: 12e4 }) : await runPluginCommand(context, args, options);
```

**desktop 分支只做一件事：把参数转发给 pnpm。** 于是 CLI 会写 `dependencies`、更新
`pnpm-lock.yaml`、在 `node_modules` 里建好链接 —— 全绿，**但 `bundles` 一行不加**。
而 `bundles` 才是 profile 启动时真正拼进来的层列表。

> 早期构建的机制与现在不同：0.1.1-rc.2 的 `plugin-9h8shc4d.js` 里有一个 `reconcilePlugins`，
> 它在 0.2.0-rc.2 里已经不存在。但**不管哪一代，实测结果一致**：desktop profile 不会被写
> `bundles`。

症状因此极具迷惑性：命令成功（或"失败"于 ignored-build）、lockfile 一致、`node_modules`
里能看到包，插件却完全不生效。

> 2026-10-11 复现：用不带闸门的 dsh 装完，`dependencies` 与 `pnpm-lock.yaml` 都已指向本包、
> `node_modules/dsh-theme-mls-desktop` 已就位（`client.js` 的 SHA-256 与仓库发布内容一致），
> `bundles` 仍然是空的 —— 补上之后 `--dump-config` 才出现本包的层。

所以：**装完去 `$DSH_HOME/profiles/desktop/package.json` 手工补一行**。补完长这样：

```json
"dependencies": { "dsh-theme-mls-desktop": "<装它的方式>" },
"dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-theme-mls-desktop"] } }
```

补完怎么确认真的挂上了：用**另一个不带闸门的 dsh 安装**去拼一次这个 profile ——

```bash
node <那个 dsh 安装>/node_modules/@deepseek-ai/dsh/lib/bin.js --profile desktop --dump-config
```

会打印拼好的层树，应当在**末尾**看到：

```
# == dsh-theme-mls-desktop
- id: theme-mls-desktop
  name: dsh-theme-mls-desktop
```

注意这行补丁行来自本包的 `cordis.patch.yml`（`insert:` 一条 `id: theme-mls-desktop`），
所以 `bundles` 里写的是**包名** `dsh-theme-mls-desktop`，不是 `theme-mls-desktop`。

> 用比桌面端旧的 dsh 拼时，会多报几条 `entry "ui-chat" not found` /
> `"ui-settings-account" not found`，那是版本差噪声，不影响"本包在不在层里"这个判断。

---

## 五、桌面壳补丁（透明窗口 + 隐藏原生按钮 + 首帧透明 + 启动即最大化）

这一步改的是宿主应用的 `app.asar`，不可能靠"页面里的代码"完成，所以有两条自动路径：

| 入口 | 谁触发 | 时机 |
| --- | --- | --- |
| `postinstall` → `auto.cjs --quiet --lenient` | 安装器跑生命周期脚本时 | 安装期间，**下一次启动就已经生效** |
| `index.js` 的 `scheduleShellPatch()` → 分离子进程跑 `auto.cjs` | 插件被加载时 | 每次启动都会问一次，但已经打过就直接返回 |

第二条是兜底，而且**经常是唯一真正生效的一条**：pnpm 会拦 `postinstall`（见上文
`ERR_PNPM_IGNORED_BUILDS`），`link:` 依赖也**不跑**生命周期脚本。两条都不需要用户知道
`shell-patch/` 的存在。

### 手工打补丁

```bash
node node_modules/dsh-theme-mls-desktop/shell-patch/auto.cjs --app "<桌面端安装目录>"
node node_modules/dsh-theme-mls-desktop/shell-patch/auto.cjs --check --app "<桌面端安装目录>"   # 只看不动
```

⚠️ **`--app` 在目录非标准时是必须的。** `auto.cjs` / `target.cjs` 的自动发现顺序是：

1. `--app` / `DSH_THEME_APP`（显式指定，是断言 —— 指错了就直接报错，不会退而求其次）；
2. 桌面端泄漏给它子进程的环境变量（`DSH_DESKTOP_NODE_EXECUTABLE`、`DSH_DESKTOP_EXECUTABLE`）；
3. `process.execPath`；
4. 上一次成功解析写下的缓存 `shell-patch/.target.json`；
5. 平台常规安装目录（`%LOCALAPPDATA%\Programs`、`Program Files` 等）。

2、3 只有**跑在桌面端内部**时才存在。所以在一个普通 shell 里手工跑，若缓存还没写过、
安装目录又不是常规位置，就会得到 `state: unresolved` 与一串"找过这些地方"的列表 ——
**它找不到你的壳，不是你的壳有问题**，加 `--app` 即可。

它的行为边界（都写在 `shell-patch/auto.cjs` 的头注释里）：

- **不打无准备的补丁**：只有在壳确实是原装（`unpatched`）时才动手；已经是本修订就
  一个字节都不碰；
- **旧修订不猜**：盘上是**上一版**补丁时只报告、不自动改 —— `--repair`（先从干净备份
  还原再打）是显式选项，因为那份备份会连带丢掉用户对 `app.asar` 的其他手改；
- **不同时打**：`shell-patch/.auto-apply.lock` 挡住并发（安装器的钩子 + 加载钩子）；
- **不在别人家里动手**：钩子路径要求本进程确实跑在那个安装目录**里面**才会自动执行 ——
  同机器上另开一个 `dsh web` 会话不会去改桌面端的包；
- **不阻塞启动**：补丁要解包+重打包 100 MiB 量级，所以走**分离子进程**；
- **不在宿主进程里留下痕迹**：`index.js` 在 **DSH 宿主进程内部**加载 `shell-patch/`
  只做只读探测，绝不改任何进程级状态（尤其 `process.noAsar`，见
  [docs/SHELL-PATCH.md](SHELL-PATCH.md) 的复盘）；
- **不会让安装失败**：`--lenient` 下任何情况都退 0，日志写进 `shell-patch/auto-apply.log`；
- **总开关**：`DSH_THEME_AUTO_PATCH=0` 关掉全部自动行为，只剩手动的 `npm run patch`。

首次安装的时序：`postinstall` 跑到了 → 第一次启动就有全部效果；没跑到（pnpm 拦了、或
`link:` 装法）→ 第一次启动时钩子打好补丁，**再启动一次**才看得到（因为被改的那个壳
正在运行中）。

---

## 六、装完能拿到什么

补丁本身是可选的，行为契约见 [docs/SHELL-PATCH.md](SHELL-PATCH.md)。

| 效果 | 靠什么 | 装插件即有？ |
| --- | --- | --- |
| 主题配色 / 组件样式 | `client.js` | ✅ |
| 冷启动绿鲸鱼动画 | `client.js` + `assets/` | ✅ |
| 窗口真透明（能看到桌面） | `shell-patch` 改 `lib/main.js` | ✅ 自动（每台机器各自打一次） |
| 启动期间隐藏右上角三个按钮 | `shell-patch` 改 `lib/main.js` | ✅ 同上 |
| 首帧就不黑屏 | `shell-patch` 改打包的 `dist/index.html` | ✅ 同上 |
| 启动即最大化 | `shell-patch` 改 `lib/main.js` | ✅ 同上 |
| 插件确实被挂载 | `profiles/desktop/package.json` 的 `bundles` | ❌ 安装/启用动作本身 |

---

## 七、两个必须知道的边界

⚠️ **不要同时启用 `dsh-theme-marathon` 和本包** —— 两者是同一套主题的网页/桌面两份，
同时挂载会重复注入启动覆盖层。二选一。

⚠️ 本包的**启动动画**没有 UI 开关。不想要冷启动揭幕就只能停用插件；停用/启用已做过
回归（卸载/重挂载回归）。这里说的**不是**设置里的「主题设置」页 ——
那一页有「背景动画」独立开关（默认关闭）+ 主白+绿 / 主黑+绿 互斥配色，和网页版一字不差。
