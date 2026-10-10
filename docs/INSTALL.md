# 安装与排错

> 这一页原本是 README 里的一节，为公开仓库拆出来独立成页；内容与主线一致，
> 交叉引用已改成文件链接。返回 [README](../README.md)。

## 安装

需要你装的：`<owner>` 用 GitHub 用户名（已填 `ALPDM00`）。

```bash
# ① 装插件本体（依赖、shell-patch/、client.js 全跟着进）
dsh plugin --profile desktop add github:ALPDM00/dsh-theme-mls-desktop

# ② 让 profile 真挂上这个 bundle
#    —— desktop profile 的 CLI 不会自己加 `bundles`（上游限制，不是本包能改的）。
#       装完顺手补一行。Windows 默认数据目录在 %APPDATA%\DeepSeekHarness，
#       所以 profile 在 <DSH_HOME>\profiles\desktop\package.json：
node -e "
  const fs = require('fs')
  const p = (process.env.DSH_HOME || '') + '/profiles/desktop/package.json'
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  j.dsh = j.dsh || {}; j.dsh.profile = j.dsh.profile || {}
  j.dsh.profile.bundles = Array.from(new Set([
    ...(j.dsh.profile.bundles || []),
    'dsh-theme-mls-desktop',
  ]))
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n')
"

# ③ 启动桌面端一次（让它发现并打 app.asar），关掉，再启动 —— 就能看到效果
```

详细说明（为什么必须有第 ② 步、`bundles` 行名是包名而非 `id`、以及 `bundles` 不一致时怎么查）全在 [docs/INSTALL.md](INSTALL.md)。

---

## 安装（装好插件之后，壳补丁会自己补上）

**① 装插件**（主题、启动动画、样式）：

```bash
dsh plugin --profile desktop add <本包路径或 github:ALPDM00/dsh-theme-mls-desktop>
```

⚠️ **`dsh plugin add` 不会替你挂载插件 —— 装完必须再手工补一行 `bundles`。**

这不是配置习惯问题，是 desktop profile 的代码路径决定的：`dsh plugin` 对
`desktop` 走的是 `runProfilePnpm()`（就是把参数原样交给 pnpm），而其它 profile
走 `runPluginCommand()`；**只有后者带 `reconcilePlugins()`** —— 那个函数才是
"按'装上的依赖是否声明 `dsh.bundle.patch`'来增删 `dsh.profile.bundles`"的地方
（见 `@deepseek-ai/dsh/lib/plugin-BGnVfe_D.js`）。而 `bundles` 才是 profile
启动时真正拼进来的层列表。

于是 CLI 会：写 `dependencies`、更新 `pnpm-lock.yaml`、在 `node_modules` 里建好
链接 —— 全绿，**但 `bundles` 一行不加**。症状因此极具迷惑性：命令成功、lockfile
一致、`node_modules` 里能看到包，插件却完全不生效。

> 2026-10-01 实测：`dsh plugin --profile desktop add <路径>` 输出
> `Already up to date`；此后 `dependencies` 与 lockfile 都已指向新路径、junction
> 也已重建，`bundles` 仍然没有本包 —— 因为 09-26 那次装的就是这个流程，所以
> 本包自始至终**从未被挂载过**，可补丁（`app.asar`）却早就打好了。

所以：**命令行装完，去 `$DSH_HOME/profiles/desktop/package.json` 手工补一行**。
本机是 `D:\Software\DeepSeekHarness\.dsh\profiles\desktop\`，补完长这样：

```json
"dependencies": { "dsh-theme-mls-desktop": "link:D:/PythonCode/ma/dsh-theme-mls-desktop213" },
"dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-theme-mls-desktop"] } }
```

补完怎么确认真的挂上了：用**另一个** dsh 安装去拼一次这个 profile ——
`node <那个 dsh 安装>/node_modules/@deepseek-ai/dsh/lib/bin.js --profile desktop --dump-config`
会打印拼好的层树，应当在末尾看到

> **别用桌面端自带的那个 `dsh`。** `@deepseek-ai/dsh/lib/bin.js` 里对
> `profile === "desktop"` 有一道硬闸门：
> `error: profile "desktop" is managed exclusively by the Electron application`
> —— 连 `--dump-config` 都不给，只有 `dsh plugin` 一条路放行。
> 本机是用 `D:\Software\DeepSeekHarness` 那份拼的；它比桌面端旧（0.1.1-rc.2 vs
> 桌面端的 0.2.0-rc.2），会多报几条 `entry "ui-chat" not found` /
> `"ui-settings-account" not found`，那是版本差噪声，不影响"本包在不在层里"这个判断。

```
# == dsh-theme-mls-desktop
- id: theme-mls-desktop
  name: dsh-theme-mls-desktop
```

注意这行补丁行来自本包的 `cordis.patch.yml`（`insert:` 一条
`id: theme-mls-desktop`），所以 `bundles` 里写的是**包名**
`dsh-theme-mls-desktop`，不是 `theme-mls-desktop`。

**注意 `link:` 是本机绝对路径**，换台机器就失效了。要在别的机器上装，走插件管理器
（`dshmarket`，本机 desktop profile 已启用）或 `dsh plugin --profile desktop add <路径|github:…>`，
让 profile 管理器自己写依赖 —— 手工维护 `bundles` 只是应急手段（本机 09-26 就是这么补上的，
备份在 `package.json.bak-20260926-035625`）。

**② 桌面壳补丁（透明窗口 + 隐藏原生按钮 + 首帧透明 + 启动即最大化）自动应用。**

这一步改的是宿主应用的 `app.asar`，不可能靠"页面里的代码"完成，所以有两条自动路径：

| 入口 | 谁触发 | 时机 |
| --- | --- | --- |
| `postinstall` → `auto.cjs --quiet --lenient` | 安装器跑生命周期脚本时 | 安装期间，**下一次启动就已经生效** |
| `index.js` 的 `scheduleShellPatch()` → 分离子进程跑 `auto.cjs` | 插件被加载时 | 每次启动都会问一次，但已经打过就直接返回 |

第二条是兜底：`pnpm` 对 `link:` 依赖**不跑**生命周期脚本，`dshmarket` 也可能这样装，
所以不能只靠 `postinstall`。两条都不需要用户知道 `shell-patch/` 的存在。

它的行为边界（都写在 `shell-patch/auto.cjs` 的头注释里）：

- **不打无准备的补丁**：只有在壳确实是原装（`unpatched`）时才动手；已经是本修订就
  一个字节都不碰；
- **旧修订不猜**：盘上是**上一版**补丁时只报告、不自动改 —— `--repair`（先从干净备份
  还原再打）是显式选项，因为那份备份会连带丢掉用户对 `app.asar` 的其他手改；
- **不同时打**：`shell-patch/.auto-apply.lock` 挡住并发（安装器的钩子 + 加载钩子）；
- **不在别人家里动手**：只有本进程确实跑在那个安装目录**里面**才会自动执行 —— 同机器上
  另开一个 `dsh web` 会话不会去改桌面端的包；
- **不阻塞启动**：补丁要解包+重打包 109 MiB，所以走**分离子进程**；
- **不在宿主进程里留下痕迹**：`index.js` 在 **DSH 宿主进程内部**加载 `shell-patch/`
  只做只读探测，绝不改任何进程级状态（尤其 `process.noAsar`，见 [docs/SHELL-PATCH.md](SHELL-PATCH.md) 的复盘）；
- **不会让安装失败**：`--lenient` 下任何情况都退 0，日志写进 `shell-patch/auto-apply.log`；
- **总开关**：`DSH_THEME_AUTO_PATCH=0` 关掉全部自动行为，只剩手动的 `npm run patch`。

首次安装的时序：`postinstall` 跑到了 → 第一次启动就有全部效果；没跑到（`link:` 装法）
→ 第一次启动时钩子打好补丁，**再启动一次**才看得到（因为被改的那个壳正在运行中）。

下面是"别人装完插件能拿到什么"的完整对照（补丁本身是可选的，行为契约见 [docs/SHELL-PATCH.md](SHELL-PATCH.md)）：

| 效果 | 靠什么 | 装插件即有？ |
| --- | --- | --- |
| 主题配色 / 组件样式 | `client.js` | ✅ |
| 冷启动绿鲸鱼动画 | `client.js` + `assets/` | ✅ |
| 窗口真透明（能看到桌面） | `shell-patch` 改 `lib/main.js` | ✅ 自动（每台机器各自打一次） |
| 启动期间隐藏右上角三个按钮 | `shell-patch` 改 `lib/main.js` | ✅ 同上 |
| 首帧就不黑屏 | `shell-patch` 改打包的 `dist/index.html` | ✅ 同上 |
| 启动即最大化 | `shell-patch` 改 `lib/main.js` | ✅ 同上 |
| 插件确实被挂载 | `profiles/desktop/package.json` 的 `bundles` | ❌ 安装/启用动作本身 |

⚠️ **不要同时启用 `dsh-theme-marathon` 和本包** —— 两者是同一套主题的网页/桌面两份，
同时挂载会重复注入启动覆盖层。二选一。

⚠️ 本包的**启动动画**没有 UI 开关。不想要冷启动揭幕就只能停用插件；停用/启用已做过
回归（`test/dispose.test.cjs`，28 项）。这里说的**不是**设置里的「主题设置」页 ——
那一页有「背景动画」独立开关（默认关闭）+ 主白+绿 / 主黑+绿 互斥配色，和网页版一字不差。
