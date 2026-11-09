# 壳补丁（shell-patch/）—— 为什么需要它，以及它做了什么

> 这一页原本是 README 里的一节，为公开仓库拆出来独立成页；内容与主线一致，
> 交叉引用已改成文件链接。返回 [README](../README.md)。

## `shell-patch/` — 为什么需要它，以及它做了什么

有**两件事页面上做不到**，只能在 Electron 主进程里改：

1. **真透明**。窗口有无 alpha 通道由 `new BrowserWindow({ transparent: true })`
   在创建时决定，页面无论怎么设 `background: transparent` 都补不回来。
2. **隐藏右上角三个原生按钮**。它们是 `titleBarOverlay`（Chromium 原生绘制的覆盖层），
   不在 DOM 里，选择器抓不到。

所以本包带一个小补丁：把桌面 shell 的 `app.asar` 解开、按锚点改几处、重打包。
改动清单在 `shell-patch/patches.cjs`，覆盖三个文件：

- `lib/main.js`：
  - `transparentWindowOptions()` → 主窗口 `transparent: true`；
  - 启动即最大化（`setBounds(workArea)` 先落，再异步 `maximize()` 重试，
    规避 alpha 窗口被合成器拒绝最大化）；
  - 新增 `dsh-desktop:boot-chrome` IPC：`visible=false` 时把 `titleBarOverlay` 的
    `color`/`symbolColor` 设为全透明（`rgba(0, 0, 0, 0)`），`true` 时还原成侧栏底色；
  - **给 shell 自己的 `dsh-desktop:windows-appearance` handler 加一道闸**，
    见下节"按钮为什么会回来"；
  - 环境变量 `DSH_DESKTOP_BOOT_CHROME=0` 可整体关闭（窗口退回不透明）。
- `lib/preload-app.cjs`：暴露 `window.dshDesktopBootChrome.chrome(visible, who)`。
  用**自己的全局名**，因为 `dshDesktopBoot` 属于 shell 且发布在主世界，preload 在
  隔离世界里既看不到它、也不能重名暴露（会抛 `Cannot bind an API on top of an
  existing property`）。`who` 是可选的调用者名，只用于让 shell 的 stdout 能区分是
  文档补丁还是主题在发这条请求。
- `dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html`：在 `<head>` 最前面
  写一段脚本 + 一段样式，让**第一帧**就不透明（详见下）。

### 按钮为什么会回来（`windows-appearance` 与 boot-chrome 抢同一个 overlay）

这是"调用明明到了、右边三个按钮还在"的根因，值得单独写下来。

shell 的**自带 preload** 也在改 `titleBarOverlay`，而且不需要我们的补丁：

```js
// lib/preload-app.cjs（上游代码，未打补丁就有）
function syncWindowsAppearance() {          // win32 才跑
  …probe.style.background = var(--dsw-specific-sidebar-fill)…
  const observer = new MutationObserver(send);
  observer.observe(document.head, { childList: true, subtree: true, characterData: true });
  …
  send();                                   // DOMContentLoaded 时先发一次
}
// send() -> ipcRenderer.send("dsh-desktop:windows-appearance", lang, color, symbolColor)
```

主进程那份 handler 校验完颜色就直接 `setTitleBarOverlay({ color, symbolColor })`。
两个要点：

1. 它测出来的颜色**必然是不透明的**（`--dsw-specific-sidebar-fill`，深色下是
   `rgba(27, 27, 28, 1)`）——于是半透明覆盖层被原样改回不透明，按钮复现；
2. 它挂在 `document.head` 的 `childList/subtree/characterData` 上，
   **而启动动画正在往 head 里塞样式**，所以它会在启动期间反复触发。

实测（`shell-patch` 装好后冷启动一次，取 shell 的 stdout）：

```
+  934ms  measured caption palette parked  {"color":"rgba(0, 0, 0, 0)","symbolColor":"rgba(15, 17, 21, 1)"}
+ 3821ms  boot chrome hidden (first-frame) {"color":"rgba(0, 0, 0, 0)","symbolColor":"rgba(0, 0, 0, 0)"}
+ 5358ms  boot chrome hidden (theme)       {"color":"rgba(0, 0, 0, 0)","symbolColor":"rgba(0, 0, 0, 0)"}
+ 5640ms  measured caption palette parked  {"color":"rgba(27, 27, 28, 1)","symbolColor":"rgba(249, 250, 251, 1)"}   ← 就是这条会把按钮画回来
+ 5896ms  measured caption palette parked  {"color":"rgba(27, 27, 28, 1)","symbolColor":"rgba(249, 250, 251, 1)"}
+16334ms  boot chrome restored (theme)     {"color":"rgba(27, 27, 28, 1)","symbolColor":"rgba(249, 250, 251, 1)","height":40}
```

修法是让 boot-chrome 请求**有权威**：在两个 handler 同一个函数块里加两个变量，
隐藏期间把测得的调色板**存起来**（不是丢掉），恢复时把它原样replay，
所以最终颜色仍是 shell 自己量出来的那一对，而不是 `chromeFallbackFill()` 的近似值。
parked 这件事**必须打日志** —— "被压制的重绘"和"什么都没发生"看起来完全一样，
前两轮修复就是因此在自己的测试里全绿、而按钮还在。

注意 `bootChromeSuppressed = !visible` 写在 `apply()` **外面**：窗口还是
`show: false` 时 `apply()` 会被推迟到 `show`（见上面 934ms vs 3821ms 两行），
状态若跟着一起推迟，早期那几条重绘就压不住了。

### 0.5.4：恢复链丢了一次（「看不见但能点」）—— **patch-revision 变了，要重打**

0.5.2 修的是"启动期间按钮被画回来"；0.5.4 修的是另一个方向：**启动结束之后**按钮停在隐藏态。
三个按钮是 `titleBarOverlay`：`color` 与 `symbolColor` 同值时它们"隐形但仍占点击区域"，
启动动画正是用 `rgba(0, 0, 0, 0)` / `rgba(0, 0, 0, 0)` 藏它们的，动画结束必须再由页面要一次"恢复可见"。
恢复链有两处会丢：

1. 主进程对"窗口还没显示"的请求排队 `window.once('show', apply)`，**每次排队只带自己那一次调用的
   `visible`** —— `show` 落在"恢复之后、更晚的一次隐藏请求之前"，最后画上去的就是隐藏态；
2. 壳自己的测量（preload 的 `syncWindowsAppearance`）只在 `<head>` 变动和 `body` 的
   `style` / `data-ds-dark-theme` 上重跑，**不监听 `body.class`**；切浅色 / 深色只改 class，
   所以量到的是上一套配色。手动切一次会顺带设 `data-ds-dark-theme`，壳才重测 ——
  这就是"切一次就正常"的真相，不是切一下能修好，而是碰巧触发了重测。

**修法三条在页面侧、一条在壳补丁里**：

- `engine-intro.js` 的恢复改成 `assertChrome`（旁路 `chromeSent` 去重）+ 400ms / 1200ms 各再断言一次，
  且每次要「可见」都顺手 poke 一次 `<head>` 逼壳重测；
- `client.template.js` 的 caption 自愈负责持续对齐 —— 起手 90 秒内每 2 秒按壳同一口径重新量，
  变了立刻无去重地重发「可见」并 poke，没变时最多每 15 秒补一次（只重发、不 poke）；
- `shell-patch/patches.cjs`（`lib/main.js` 的 `windowsAppearance` handler）：`parkedCaptionPalette`
  改成**每次有效测量都更新**，`bootChromeSuppressed` 只决定"画不画"、不再决定"记不记"。
  原来的语义是"启动窗口期那一对颜色"，于是恢复之后任何一次「要可见」都会把启动期那一对重放回去 ——
  实测 boot 结束后 3 秒，浅色底盘的 `rgba(255,255,255,1)` 已经测到并画上去了，紧接着 400ms 的
  再断言（`who=theme-restore`）又把它盖回 `rgba(11,13,11,1)`，caption 心跳（`who=caption`）同样会盖。
  现在的 `parked` 含义是"最近一次已知正确的一对颜色"。

**patch-revision 变了，需要重打一次**：`lib/main.js` = `bbea47336549`、
`lib/preload-app.cjs` = `f5937c0a5fa6`、`dist/index.html` = `782304e689f7`。

```bash
node shell-patch/auto.cjs --check     # 旧安装会报 STALE（旧 revision）
node shell-patch/auto.cjs --repair    # 先用 pristine 备份还原，再打新 revision
```

为什么不是自动的：`auto.cjs` 的 `needsPatch()` 只认 `unpatched`；`STALE` 必须由人显式 `--repair`，
因为重打会丢弃你对 `app.asar` 的其它手动改动 —— 这条路留成 opt-in，而不是默认替你决定。
打完重启桌面端。本机这份安装本次已重打完毕，只需要重启。

### 为什么连打包好的 `index.html` 也要改

桌面端**不把** webserver 的 `webserver/index-inject` 行拼进文档：它由
`serveWebDocument()` 近乎原样地提供打包的 `dist/index.html`，注入表改走 IPC
（`dsh-desktop:boot`）在页面侧应用，因此主题那行要晚约 1 秒才到 —— 而 DSH 自己的
启动板（`div[data-dsh-boot]`）约 100ms 就画上了，文档 `body` 本身还带
`background: var(--dsw-alias-bg-base, #fff)`。结果就是"先黑屏、后出现 logo"。
上游只给 macOS 关掉了这层底色（`html[data-platform=darwin]{background:transparent}`），
Windows 上得自己补。这段补丁因此写进文档本身：首帧就透明，并在应用真正挂载后
（`#root` 有子节点 **且** 里面没有 `[data-dsh-boot]`）自行解除，15s 兜底。

### 壳升级之后（2026-11-04，DSH `0.2.2-rc.1` / Electron 44）

桌面端升级会把 `app.asar` 整个换成原版（连 `resources/` 都是新写入的），补丁自然一起消失。
症状是三条同时出现、缺一不可地指向"壳补丁没了"：**窗口不透明、不最大化、右上角原生按钮
在启动动画上突兀地出现**（页面侧已经请求隐藏，但没有 IPC 通道，`chrome()` 是空操作）。

这次升级只改了一个锚点：`lib/main.js` 的 `windowsAppearance` handler 去掉了语言参数
（`language` → `_language`）与 `windowsLanguage = language` 那行。`APPEARANCE_ANCHOR` /
`MAIN_CAPTION_STATE` 已按新构建重写；其余八个锚点（`createWindow` 签名、electron import、
`createMainWindow`、`webviewTag` 块、`hideMainWindow` 尾巴、preload 的
`markDocumentPlatform`、`dist/index.html` 的 `<head>`）一字未变。

复核办法（都在本机、都不碰安装）：

```bash
node shell-patch/auto.cjs --check        # 几百毫秒：读 asar 头部判断三个文件的状态
node shell-patch/apply.cjs --check       # 慢：整包解压后逐条判定（结论应与上面一致）
DSH_PATCH_DUMP_ANCHORS=1 node shell-patch/apply.cjs
                                         # 不写入，只打印每个锚点在现役包里命中几次
```

`apply.cjs` 在写盘前会先用 `node --check` 语法校验改后的 `main.js` / `preload-app.cjs`，
再逐字节比对重打包结果；任何锚点不是"恰好 1 次"都会整体拒绝（`anchor occurs N times — the
shell build changed`），不会留一个半应用的壳。

### 用法

平时只需要 `auto.cjs` —— 它会自己找到安装目录、看状态、该打才打：

```bash
node shell-patch/auto.cjs --check                              # 只报告状态，不动任何文件
node shell-patch/auto.cjs                                      # 需要就打（自动备份）
node shell-patch/auto.cjs --repair                             # 旧修订：先还原再打
node shell-patch/doctor.cjs                                    # 只读体检：状态 / 结构 / 与备份的差异
npm run patch:revert                                           # 从备份还原
```

底层的两个命令仍然可用，`--app` 不再是必须的（不给就自己找）：

```bash
node shell-patch/inspect.cjs "<安装目录>/resources/app.asar"   # 体检头部
node shell-patch/apply.cjs --check                             # 逐条列出每个条目的状态
node shell-patch/apply.cjs                                     # 应用（自动备份）
node shell-patch/revert.cjs                                    # 从备份还原
```

`apply.cjs --check` 会把整包解到临时目录再逐条判定（准确但慢）；`auto.cjs` 的状态
读的是 `target.cjs` 里的 `probeShell()` —— 它靠 asar 头部里的偏移**直接把那三个文件
读出来**，不解包、不重打包，几毫秒。所以它能被放在每次插件加载时问一次。

### 写完之后怎么自证：两次回读 + 文档结构校验

`apply.cjs` 里有两次回读，缺一不可：

1. **提交前**：暂存 asar 重新打开，把每个条目逐字节跟"打好补丁的目录树"比一遍
   （**双向**：归档里缺文件、目录里多文件都算失败），然后把三个目标文件按归档头部
   读回来，断言各自的 `patch-revision` 摘要、每个条目的 `already` 片段都在；
2. **提交后**：真正落在安装目录里的 `app.asar` 再读一遍。这一步专治"提交"本身：
   Windows 上桌面端开着时会锁住 `app.asar`，`rename` 被拒就退化成**原地重写**，
   那条路不经 rename、也不由上面那一层覆盖。回读失败会自动从 `.bak` 还原并非 0 退出。

`index.html` 额外做**结构校验**（`apply.cjs` 的 `documentProblems()`）：`<head>` /
`<body>` / `</html>` 在、`<script>`↔`</script>` 与 `<style>`↔`</style>` 数量相等、
没有 `U+FFFD` / NUL、首帧脚本仍在 `<head>` 里。`node --check` 只认 JavaScript，
"一个 `<script>` 开标签被吃掉、浏览器把后面的 JS 当正文渲染"这种损坏只能靠这一层
（issue #6 报告的形态）。

出了事用只读体检命令，它**不写任何文件**：

```bash
node shell-patch/doctor.cjs                 # 或 npm run patch:doctor
node shell-patch/doctor.cjs --json          # 机器可读，适合贴进 issue
node shell-patch/doctor.cjs --json --out doctor.json   # 由 fs 写 UTF-8（PowerShell 的 > 是 UTF-16）
node shell-patch/doctor.cjs --app <安装目录>
```

报告内容：找到的安装与 `.bak`、三个文件的字节数 / SHA-256 / 修订状态 / 结构问题、
跟 pristine `.bak` 的**第一处差异字节**（带两侧上下文），以及归档里 `index.html` 的
字节数 —— 用来回答"我抓到的页面为什么有 50 KB"：比它多出来的部分是 Host 在服务时拼
进去的插件注入行（`dsh-host-webserver` 的 `renderIndexInjections()`），并不在这个归档里。
返回码 0 = 没发现损坏（stock 也算没损坏，只是没打补丁），1 = 有问题。

`auto.cjs` 失败时会把**原因**写进 `shell-patch/auto-apply.log`
（`FAILED <目录> (state …, via …): <原因>`）。这条之前只在 apply 正常返回却没成功时才写，
锚点变化这种直接抛异常的情况一个字都不会留 —— 由插件加载触发的 hook 用的是
`stdio: 'ignore'`，所以那种失败在外部是完全静默的。

### 安装目录是怎么找到的（`target.cjs`）

按顺序试，第一个通过 `verifyApp()` 的就算数：

1. `--app <dir>` / `DSH_THEME_APP` —— **这是断言，不是提示**：不合法就直接失败，
   不会退回去猜别的目录（错打别人一个包比失败糟得多）；
2. DSH 桌面端传给子进程的路径（`DSH_DESKTOP_NODE_EXECUTABLE` 等）—— 它们指向安装
   目录**内部**，往上走就能找到根；
3. `process.execPath` —— DSH 运行时是 `<安装目录>/resources/runtime/…/node/bin/node.exe`，
   所以从插件宿主里跑一定能找到；
4. 开始菜单/桌面快捷方式 —— `.lnk` 里把安装目录存成**明文 UTF-16**，这是用户自定义
   安装位置（本机现在是 `D:\Software\DeepSeek_Desktop`；旧路径
   `D:\Software\deepseekharness_desktop` 已随那次搬家不存在了）唯一被写下来的地方；
   Linux 读 `.desktop` 的 `Exec=`；
5. 上次成功找到的缓存（`shell-patch/.target.json`，已 gitignore）；
6. 平台默认目录 + 当前工作目录往上走。

`verifyApp()` 不是"这个目录存在就算"：它要 `resources/app.asar` **在**、头部**能解析**、
包内 `package.json` 的 `name` **是** `@deepseek-ai/dsh-desktop`。隔壁一个普通 Electron
应用不会被误伤。

### 这个补丁是**可选**的

不打补丁主题照常工作 —— `window.dshDesktopBootChrome`（也接受 shell 原生的
`dshDesktopBoot.chrome`）不存在时，引擎里那两处调用就是空操作，
动画仍在跑，只是窗口不透明、按钮不隐藏。
（在纯浏览器里也一样，所以本包不会因为离开桌面端而报错。）

### 升级既有安装：`revert.cjs` + `apply.cjs`，版本由摘要识别

补丁条目是**插入式**的：`already` 只回答"这个块在不在"。它在两种情况下会失效：

1. 某个块的 **payload 变了、`already` 没变** —— 这时旧安装看起来"已应用"，
   实际是上一版；这是这个包真实踩过的坑（`#00000000` 被覆盖层解析器静默忽略，
   改完颜色后 `--check` 依然报 `PATCHED`，而盘上那份还是旧颜色）。
2. 曾经有过一套**就地升级阶梯**（`optional: true` 的升级条目逐版补）。
   它每改一次 payload 就要加一级，而某一级的锚点没包含 handler 的头注释，
   于是留下了旧注释 + 插入了第二份 handler —— 实装 asar 里出现了**两份重复的注释块**。

现在两条都堵上了：

- **阶梯删掉。** 升级路径就是 `revert.cjs`（从 `app.asar.dsh-theme-marathon.bak` 还原）
  再 `apply.cjs`。多一条命令，但不会漂移、不会重复、不会半应用。
- **每个被改的文件都带一份"修订摘要"注释**：`patch-revision:<12位摘要>`，
  摘要 = 本次修订写进**那个文件**的所有 payload 拼起来的 sha256 前缀，
  由 `patches.cjs` 在导出前自动填进 `@@PATCH_REVISION@@` 占位符。
  `apply.cjs` 在写任何东西**之前**先比这个摘要：
  - `current` — 摘要一致，跳过；
  - `stale` — 文件已被打补丁（任一 marker 命中，或存在别的 `patch-revision:`），
    但摘要不符 → **拒绝并提示 revert + apply**；
  - `unpatched` — 什么都没打，正常打。

  摘要随 payload **自动变化**，所以不存在"改了代码忘了改版本号"这种事：
  改了 payload 而没 revert，安装检查一定红。

改补丁后请在同一台机器上重跑开发期的校验（**校验脚本不随本仓库发布**，见 README
「仓库内容」）：

- 静态复核：结构自洽 / 守卫文本 / stale 规则 / 摘要身份 / 对干净包整体重放 /
  改后文件仍能解析 / 实装包是本修订 / 宿主安全（加载 `shell-patch/` 不得关掉 asar）；
- 自动化复核：把 `auto.cjs` 的真源码放进临时 harness 里跑，只把 `target.cjs` /
  `apply.cjs` / `revert.cjs` 三个边界换成桩，逐条验证它的决策
  （安装目录发现、状态探测、跳过 / 应用 / 拒绝 / 修复 / 锁 / 总开关）；
- 两者都配了**变异反证**：把断言逐个改坏（只改临时副本，不改工作区），要求每一条都真的变红。
  断言必须**能失败**才有意义 —— 这一层曾经抓出过一个真缺口：`probeShell` 对 macOS 布局
  （`Resources/app.asar`）的处理原先没有任何断言覆盖，现在补上了。

静态复核里对着**干净包**的那一半需要一份未打补丁的 `app.asar` 备份，它**自己找**：
先 `resolveApp()` 定位这台机器上的桌面端，再取
`<app>/resources/app.asar.dsh-theme-marathon.bak`（即 `apply.cjs` 提交前留下的那份）。
也可以用 `--archive <path>` 或环境变量 `DSH_DESKTOP_ASAR_STOCK` 显式指定。

守卫类断言必须**能失败**才有意义，所以还有一个证伪脚本
（`<工作区>/.workbuddy/tmp/falsify-shell-patch.py`）：它依次注入 6 个变异
（状态不翻转 / 翻转挪进 `apply()` / 颜色换回 `#00000000` / 恢复不再钉 height /
不再打印 options / 隐藏期直接应用调色板），要求每一次都恰好把对应的那条断言变红。
第一版 `rgba` 变异其实**没被抓住** —— 它改中的是文档注释里的字样，payload 根本没变，
正好说明为什么"能失败的测试"这一条要单独跑一遍。

### 安全模型

1. 锚点必须**恰好命中一次**，否则整体拒绝，不半途而改；
2. 解包 → 改文件 → 重打包到**临时文件**；
3. 校验新包头部 + **逐字节**比对整棵树，全部通过才提交；
4. 提交前先备份原包为 `app.asar.dsh-theme-marathon.bak`。

> **踩过的坑（已加回归测试）**：手写打包器时把 Pickle 头部的两个 uint32 写错了 ——
> `@8` 写成 `headerBufLen`（应为 `headerBufLen - 4`）、`@12` 多算了一个 padding 字节。
> Chromium 的 `archive.cc` 解析不了头部就**放弃整个包**，静默退回内置
> `default_app.asar`，表现为双击图标只看到 Electron 欢迎页。
> 现在 `lib/asar.cjs` 在**读写双向**强制完整不变量；开发期的复核里有一组断言专门盯住
> 这两个字段，另有一项**往返校验**要求**重打包后的整个 app.asar 与源文件逐字节相同**。

归档 I/O 要真字节，就要绕开 Electron 的 fs 包装（它会把含 `.asar` + 分隔符的路径
重定向进虚拟挂载，也会把 `<archive>.unpacked/…` 读**进**归档里）。绕开的正确做法是
`lib/real-fs.cjs`（Electron 自带的 `original-fs`）—— 它**不改变任何进程级状态**。

> **踩过的坑（已加 3 项回归断言 + 变异验证）**：绕开的"显然写法"是
> `process.noAsar = true`。这在一个独占进程的 CLI 入口里没问题，但
> `index.js` 会在**DSH 宿主进程内部**加载 `shell-patch/`（每次插件加载都做一次状态探测），
> 而这个开关是**进程级**的：宿主当场失去 asar 支持，读不到自己所在的 `app.asar` ——
> `typert-loader` 的 20 个 `import()` 全部 `ERR_MODULE_NOT_FOUND`、`webRuntime`
> 服务无人提供、`connection`（必装）连带 5 个插件一起 pending，桌面壳直接弹
> "The application could not start or stopped unexpectedly"。
> 现在包里**任何文件都不再设这个开关**（`verify:patch` 有静态断言盯着），
> 并且 `index.js` 会在加载 `shell-patch/` 前后**快照/恢复**它作为兜底 ——
> 兜底只用于防事故，测试会断言它**从未被触发**。
