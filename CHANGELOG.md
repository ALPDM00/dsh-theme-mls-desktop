# Changelog

所有显著改动都列在这。版本号遵循 [SemVer](https://semver.org/)：
主版本号 = 不兼容的 API/视觉变更；
次版本号 = 向后兼容的新功能；
修订号 = 向后兼容的 bug 修复。

## [0.5.0] - 2026-10-16

**主题配色：UI 强调色从"只有一种酸绿"变成设置页里七选一；「外观」下的两套配色改名成
浅色 / 深色。同时把 UI 上最后几处**原生蓝**（链接 / 深度思考 / 文档选区 / 附件色块 /
toast 操作 / 轨迹强调 / 上下文计量 / 引导卡片）一并收回主题配色。强调色只改 UI，
点阵场与两个动画用色一个字节没动。**

**并且修掉了一个一直存在、只是被掩盖着的根因：整套调色板从未真正落到页面上**
（见下面「修复」一节）。用户 2026-10-16 的原话是"上一轮对话中改动的东西，其实并没有实现"。

### 修复
- **调色板现在真的落到 `<body>` 上了。** `theme.overrideTokens()` 在桌面端这一侧
  **静默地什么都没做**：实测（`cap-window.py` 抓运行中的窗口 + 读像素）body 背景是
  `#151517`（= DSH 深色底 `--dsw-static-neutral-bluish-950`），而不是主题的 `#0B0D0B`；
  左上角「对话 / 轨迹」的选中字色与下划线、侧栏工作区文件夹图标是 `#7AAFF`
  （= `--dsw-static-deepseek-400`，DSH 的 business 蓝）。主题自己那批 `!important`
  CSS 规则（选中会话行 / 发送按钮 / 计费横幅…）一直在生效，所以肉眼看起来"主题在跑"，
  实际上**所有走 DSH 别名的表面都还是原生配色**。
  修法：把那张 token 表抽成唯一的 `MAR_TOKEN_MAP`，除了照旧交给主题服务，**再逐条 inline 写到
  `<body>` 上** —— 这正是 DSH 自己的 presenter 干的事
  （`dsh-client-ui-layout` 的 `theme-presenter.js`：alias token 以 inline 变量写在 body 上），
  所以这不是绕开它，而是用同一条通道、只是由我们自己写。presenter 每次投影前会**删掉它上次写的
  那批名字**（正是同一批），因此重写时机是：挂载时、`bgApplyMode()`（换底盘）、
  `ctx.on('theme/change')`（滞后一个 tick 落在其它监听器之后）、以及每 1.2s 的那趟巡扫
  （与 `syncThemePreference` 同一个理由、同一个位置）。dispose 会把整批变量摘干净。
- **新增自检 `mar.debug.v1`**：一次性把「主题服务是否可用 / 当前强调色 / body 计算背景 /
  `--dsw-alias-bg-base` 的计算值」写进 localStorage。判"调色板到底落没落"就靠它，
  不必再靠肉眼看颜色（第 1 条就是靠这个思路抓出来的）。support 可直接从 profile 的
  leveldb 里读回来。
- **`.generated/verify-blues.cjs` 之外新增三把取证工具**：`scan-blue-aliases.cjs`
  （递归解析 `var()` 链，找**最终**是蓝的 token —— 之前两个扫描器都只看字面蓝，
  `--dsw-alias-x: var(--dsw-static-blue-450)` 这种完全漏掉）、`cap-window.py`
  （`PrintWindow` 离屏抓真机窗口，不抢焦点）、`scan-blue-literals.cjs`（CSS 规则里的字面蓝）。

### 新增
- **冷启动揭幕有了自己的开关**（2026-10-17 用户要求："为启动动画添加一个开关"）。
  此前它**没有 UI 开关**——想关只能停用整个插件（`docs/INSTALL.md` 当时就是这么写的）。
  现在是设置页里独立的一组「**启动动画**」：**默认开**（老用户行为一个字节不变），
  存自己的键 **`mar.boot.v1`**，开关关掉时 `buildBoot()` 直接返回——不建 host、不注样式、
  不跑引擎脚本、不留看门狗（`test/plugin.test.cjs` 用一条端到端断言锁住："存了 `{on:false}` 就
  **一定**见不到 `#dshMarBootHost`"）。
  ⚠️ 它**只在下次冷启动生效**：揭幕发生在插件 mount 的当下，等设置页能打开时它早结束了。
  这一组因此**只有一个开关**——最初还写了一行"只在下次冷启动生效（…本次改不了）"的说明，
  用户当天看到就要求删掉（"这句话删除掉"），所以那行连同 `.mar-set-boot` 的调暗豁免一起撤掉
  （只剩一个开关行，它本身带 `.mar-set-switch`，天然不在"场关就调暗"的名单里）。
  另外关掉时如果揭幕**正好还在跑**（装载后几秒内就打开设置），会立刻调 `bootCleanup()` 收掉它。
- **设置页新增主题色分组**（在「外观」正下方；2026-10-11 叫「配色」，2026-10-17 按用户要求
  改名为「**主题色**」）：七个色块、**无文本**，点一下即切换 UI 强调色。候选与默认值：
  `#05C938` / `#E60B10` / `#E7337C` / `#E5710C` / `#C272E9` / `#81E8B1` / **`#C0FE04`（默认）**。
  2026-10-17 又按用户要求把图形**放大到一行 4 个**（`flex:0 0 calc((100% - 24px)/4)`，
  7 格排成 4 + 3、后一排左对齐；不再用 `flex-grow` 挤成一行 7 个）。
- **「外观」那一行去掉预览图案，并且不再被"关闭背景动画就变暗"连坐。** 用户 2026-10-17：
  「外观-配色，只需要显示浅色和深色即可，目前两个按钮前方还有图案」+「这里的颜色一直是更深的，
  像是有一层灰黑色蒙住了」。两件事都对上了：按钮前面的 `bgSegChip()` 预览块删掉（连 CSS）；
  而 `.mar-set-pane.mar-anim-off .mar-set-row{opacity:.45}` 那条"场关闭就把描述场的行调暗"的规则
  把**外观行也一起调暗了**——背景动画默认关闭，所以那排按钮一直顶着 45% 的透明压在深色面板上。
  现在给它加了 `.mar-set-appearance` 并在规则里 `:not(...)` 排除；顺带把副标题的「主题配色」
  改成「主题色」。
- **七格色块全部画上了图形**（用户 2026-10-11 提供 `6大阵营/svg`，2026-10-16 接上并补齐默认色）：
  赛博艾克米→`#05C938`、阿拉克尼→`#E60B10`、纽卡洛里→`#E7337C`、特莱克斯→`#E5710C`、
  米达→`#C272E9`、关口→`#81E8B1`，**默认色 `#C0FE04` 那格是马拉松 LOGO**
  （`马拉松LOGO.svg`，2026-10-16 追加；此前它是唯一的纯色格）。构建时 `scripts/build.cjs` 把每张 SVG
  URL-encode 成 `data:image/svg+xml` 内联，并按 `data-accent` 生成一条 `--sw-img` 规则 ——
  **必须连成一行、且不能含裸的单引号 / 反斜杠**，因为它落在模板样式表里一个普通的
  单引号 JS 字符串里（踩过两次：换行/单引号会把整个 bundle 变成语法错误，七个色块全空白）。
  图形的长宽比是 366:237，色块用 `flex:1 1 0` + `aspect-ratio` 铺满一行。
  注：图形自己画的那层底色与调色板取值有一点点差（如特莱克斯画在 `#EA710B`、
  调色板是 `#E5710C`），**以调色板为准**（那才是 UI 真正穿上的颜色）。
- **强调色的墨色是量出来的。** `--mar-accent` / `--mar-accent-ink` / `--mar-solid-ink` /
  `--mar-accent-text` / `--mar-wash-accent` 由 `accentApply()` inline 写到 `<body>`。
  旧的 `#0B0D0B` 墨色只在单一酸绿下成立；`#E60B10` 这类偏暗的强调色黑墨只有 4.4:1，
  所以按相对亮度二选一（该色拿到 `#FFFFFF`，其余仍是 `#0B0D0B`）。浅色底盘上强调色
  永远只做**面**不做**字**，`--mar-accent-text` 取主墨色。
- **「每轮 Token 结算」便签固定用最初那支酸绿，不再跟主题色走。** 用户 2026-10-17：
  「你多更改了我 TOKEN 结算的颜色，这里保持我们原来的绿色就好」。便签（`.mlsb-*`）以前直接吃
  `--mar-accent` / `--mar-accent-ink` / `--mar-accent-text`，换主题色时整张纸条跟着变色。
  现在有自己的常量对：`--mar-bill-accent`（绿条填充）/ `--mar-bill-ink`（条上的黑字与十字）/
  `--mar-bill-acid`（明细行里那几个酸绿数字，浅色底盘上翻成主墨色）。
  用独立常量不只是"复制一遍 accent"——偏暗的主题色会把 `--mar-accent-ink` 翻成**白墨**
  （见上面的 `accentInk`），白字压在**固定绿**的横幅上就废了，所以条的墨色必须是常量。
- **存储键 `dsh-theme-marathon.accent.v1`**：一个十六进制字符串，读写都归一化成大写；
  不在那七个里的值（手改 localStorage、旧版残留）一律读回默认，绝不让 pane 选不回去的颜色
  留在页面上。dispose 会把五个 inline 变量一并摘掉。
- **预留配色切换动画接口** `accentSwitchFx(next, apply)`（用户 2026-10-11："切换颜色时也需要
  有一个动画，我们先预留动画接口"）。目前是空实现——点色块即时生效、不播动画。契约：
  动画必须**恰好调用一次** `apply()`，且同步从播放器里调；现成的 `vtPour(apply)` 就是同一形状。
  `check.cjs` 盯着这个接口存在、且点色块的路径只走它。

### 变更
- **`--dsw-alias-link` 退回 DSH 默认。** 会话正文里的链接是**用户内容**，不是界面 chrome
  （用户 2026-10-16：「我们对话中所输出的文本，有些是蓝色的内容，这部分不用改，保持默认就行」）。
  Markdown 代码块的高亮色阶本来就没动。界面 chrome 的蓝继续收：选中的「对话 / 轨迹」与侧栏
  文件夹图标走 `--dsw-alias-state-business-primary`，那个一直钉着（调色板落地后它们才真的变绿）。
- **「外观」下的两套配色改名：主白 + 绿 / 主黑 + 绿 → 浅色 / 深色。** 旧名字把强调色写进了
  底盘里，而强调色现在是另一件事。分段按钮里的预览色块同步改成"底盘 + 该底盘的主墨色"，
  不再画成绿。**只改文案与预览**：`BG_STATE.scheme` 的取值仍是 `light` / `dark`，
  存储键与迁移逻辑一个字没动，旧存档照常读回。
- **只调 UI，不动其他。** 点阵场的字形色仍是 `BG_MODES.ink = '192,254,4'`，启动入场动画
  （绿鲸鱼 / 蓝像素 / 红扫）与任务完成动画（四拍 / 横幅）的用色都不跟主题配色走
  （用户 2026-10-11："配色只调整 UI 的，不动其他"）。

### 校验
- `check.cjs` 新增一条守卫（七个色值 / 浅色-深色文案 / 色块填充与选中态 / 五个变量 /
  量测墨色 / `accentSwitchFx` 接口 / dispose 清理）。
- `test/plugin.test.cjs` 新增 6 条断言（默认值、越界回退、大小写归一、深色强调色拿白墨、
  浅色底盘上 `--mar-accent-text` 是主墨、dispose 摘 inline 变量），分组标题断言改为五组。
- 新增 `.generated/verify-accent.cjs`：在**真 Chrome** 里跑构建后的 `client.js`，用一个
  800x560 的假设置面板驱动同一条代码路径，**读回像素**确认七个色块各自画对了颜色、
  选中的那个带内嵌 void 描边，并在切色 / 切底盘后复验（23 项全绿，截图在
  `.generated/probe-out/accent/`）。

### 其余原生蓝（2026-10-11 第二轮，用户："先改了看看效果"）
原先列出来的"仍有原生蓝"里，用户点名了五处，其余按维护者判断处理。两条机制，用哪条不是风格选择：
- **DSH 自己声明的别名 → `overrideTokens` 直接钉**（五个）：`--dsw-alias-link`（链接）、
  `--dsw-alias-label-deep-diving(-shimmer)`（「深度思考」那行）、
  `--dsw-alias-bg-document-selection`（文档预览选区，新增 `--mar-select` = 强调色 40%，
  与原生同样的浓度）、`--dsw-alias-onboarding-accent`（引导卡片）。文字类的两个走
  `--mar-accent-text`（深色底盘=强调色，浅色底盘=主墨），与主题自己「强调色不做浅底盘上的字」同一条规则。
- **组件自持的令牌 → 样式表规则，按可读类名半段匹配**（五个）：
  `--trajectory-turn-accent`（`[class*="_table"]`）、`[class*="_turnLabelActive"]`、
  `[class*="_toast_"] [class*="_action_"]`（toast 的「操作」）、
  `[class*="_colorMessages"]`（上下文计量的 `--meter-tint`）、
  `[class*="_code_"/"_html_"/"_markdown_"/"_word_"/"_other_"]`（附件类型色块）。
  这些令牌声明在**消费它的元素自己身上**，从 `<body>` 继承的覆盖压不过它，只能去匹配那个元素；
  选择器只认类名的可读半段（`_code_`、`_table`…），因为 hash 段每次 DSH 构建都会变。
- **故意不动**：`--dsw-static-blue-*` / `--dsw-static-deepseek-*` / `--dsw-static-neutral-bluish-*`
  三档静态色阶——它们同时喂着 Markdown 代码块高亮（bundle 里有 `"85,85,255" → --dsw-static-blue-400`
  这类映射），整档钉掉会连语法高亮一起改；`--dsh-file-type-violet`（图片/视频类型色，DSH 自己
  注明是刻意选的紫）；三条新手引导卡片的渐变边框。
- 复核：`.generated/verify-blues.cjs`（20 项）。它把 `app.asar` 里**消费这些蓝色的宿主规则逐字**
  抽出来、配上真实的哈希类名做夹具，在真 Chrome 里跑两遍——主题关掉那遍必须仍是蓝的（证明夹具真的
  生效、检查能变红），打开那遍必须全变成强调色。另有 `check.cjs` 一条守卫链与 `plugin.test.cjs`
  三条断言（别把 static 色阶钉进去）。取证脚本：`.generated/scan-blue-tokens.cjs` /
  `scan-blue-usage.cjs`。

## [0.4.3] - 2026-10-11

**安装与卸载文档按实测补墙。只改文档与版本号，运行时行为一个字节没动。**

### 文档
- **README 安装节重写。** `dsh plugin --profile desktop add …` 从"第 ① 步"降级为
  "**别用**" —— 它在桌面端自带的 0.2.0-rc.2 与 npm 全局的 0.1.5-rc.1 上**都是**死路
  （前者靠无人置 `true` 的 `manageDesktopProfile`，后者无条件拒绝），且报错不提任何替代
  路径。替换为不依赖 CLI 的三步：**node 抓 codeload tarball → 解进 `node_modules` →
  补 `bundles`**。
- **README 新增「卸载」节。** 卸载会把磁盘清干净，但**不会把主题从正在运行的窗口里拔掉**，
  详见下面那条实测结论。
- **`docs/INSTALL.md` 新增第〇节「如果你让 AI 代装（在 DSH 会话里）」。** 把"把链接丢给自己
  的 AI 让它装"这条路实测会撞的五道关列成表：github 直连不通 / PowerShell 执行策略挡
  `dsh.ps1`（`npm.ps1` 同理）/ `desktop` 闸门 / 会话沙箱写 `$DSH_HOME` 报 `EPERM` /
  `git clone` 的 schannel 建不起 TLS。并给出**唯一走得通的取包通道**：node 抓 `codeload`
  的 `tar.gz`（实测 454,892 字节，`tar -xzf` 解出 44 文件 / 1,188,203 字节，与仓库一致）。
  同一节还点明 `web_fetch` 顶不上这条路 —— 它只返回文本，`.png` / `.otf` 拿不到。顺带记下
  本地开发用 `link:` 的注意事项（不跑生命周期脚本）。
- **`docs/INSTALL.md` 新增第八节「卸载与残留」。**
- **`docs/INSTALL.md` 第五节补上壳补丁的确切改动面。** 用游标逐文件比对补丁前后的
  `app.asar`，改动**只有三处**：`dsh-web-frontend/dist/index.html`（825 → 3328 字节，
  首帧脚本 + 把透明移交给主题的 `data-mar-boot`）、`lib/main.js`、`lib/preload-app.cjs`。
- **`docs/INSTALL.md` 第二节补一句**：`allowBuilds` 里若留下 `set this to true or false`
  占位符，说明 `pnpm approve-builds` 从没走完、`postinstall` 一次都没跑过。

### 实测结论（本轮新增两条）
- **卸载后动画还在放，不是残留配置。** 2026-10-11 实测：卸载后
  `package.json` 的 `dependencies` / `bundles`、`cordis.yml`、`node_modules/` 三处全部干净，
  宿主半的计费账本 `storages/mls-billing-ledger.json` 最后一次写入停在卸载之前且不再更新
  —— **但「任务完成动画」仍然照放**。原因是**已经注入页面的客户端半活在渲染进程里**，
  卸载只改磁盘配置，不会把它从 DOM/JS 里摘走；**刷新页面 / 重启桌面端即消失**。
  以后遇到"卸载了还有动静"先按这条判，别去翻 `bundles`。
- **别把这个 tarball URL 当 pnpm 依赖 spec。** 插件管理器把依赖写成
  `dsh-theme-mls-desktop@https://gh-proxy.com/…/tar.gz/refs/heads/main` 之后，pnpm 反复报
  `ERR_PNPM_TARBALL_INTEGRITY`（镜像来回重打包，字节不稳定 → 校验和对不上），最后
  `dsh: pnpm printed nothing for 600000ms and was terminated`。要装 tarball 就自己
  `tar -xzf` 解进 `node_modules`。

---

## [0.4.2] - 2026-10-11

**修「任务完成动画」一次都播不出来，以及计费便签认错会话。** 同一个根因：客户端读了
一个**宿主根本没有的字段** —— 会话列表快照的 `current`。源码里它被**三处各自独立**
读取，全部恒为 null。

### 修复
- **`snap.current` 不存在。** 宿主 0.2.0-rc.2 的列表快照
  （`@deepseek-ai/dsh-api-session-controller` 的 `createSnapshotStore`）只有
  `ids` / `byId` / `phase` / `projectionsBySession` 四项。三处读取分别是：
  - `doneCurrentId()`：原先 `(snap && snap.current) ? ... : null` 恒为 null，于是
    会话面 `doneWatchFace(current)` 从不执行（**会话面永不订阅**）、
    `doneWrapCancel()` 从不包装。
  - `doneOnList()` 里**另有一份独立副本** `var current = snap.current ? ... : null`，
    它不调用 `doneCurrentId()` —— 列表的下降沿被
    `if (!current || id !== current) continue` 全数吞掉，`doneEndedRound()` 一次都
    调不到。**这是动画播不出来的直接原因。**
  - `billingDisplayedSessionId()`（每轮 token 结算便签认「当前显示的会话」）：
    `billingTick()` 因此退到「最近有账的那个会话」，会把别的会话的数字贴到当前会话
    的尾巴上；`billingFetch()` 也不再带 `?session=`，宿主不会为当前这段对话回填
    历史账，重启后旧轮次贴不上便签。

  2026-10-11 在真实安装上取 `__marDoneDebug()` 实测：`face: null`、
  `faceSubscribed: false`、`facePublishes: 0`、`lastEnds: []`，而
  `stopped: {<本会话>: false}` 恰好证明列表**看到了**开跑——结束那一步全被吞掉。

  三处统一改为宿主自己的算法：`byId` 里 `retainedBy.mainView > 0` 的那一个
  （DSH 客户端自身有 8 处这么写）。保留 `snap.current` 以兼容真给了该字段的老宿主。
- **顺带去掉 `billingDisplayedSessionId()` 里那次性的 `ctx.get('sessions')` 抓取。**
  服务的注册顺序不保证，抓到 null 就永久失效 —— 完成动画那半边 2026-10-10 已经踩过
  同一个坑。现在每次现取。
- **`doneStateText()` 报假绿灯。** 原先只要有列表订阅就显示"会话面已盯住"，并不检查
  `doneFaceId`；正是这句话把排查往"触发链没问题"的方向带偏了一整轮。现在如实区分
  "会话面未订上 —— 当前会话认不出来"。
- **纯 DOM 兜底判据在虚拟滚动下恒失灵。** 老判据只看上一个尾巴节点的 `isConnected`，
  而 `dsh-client-ui-chat` 的 virtualizer 会回收/重建尾巴节点，`isConnected` 就无规律
  地翻假——实测 `domRenders` 涨 23 次而 `domHits` 恒为 0。改为「容器没变 + 基线当时
  的会话身份没变」，切会话仍能被识别为换转录；容器认不出来时才退回那条老判据。
- **`src/client.template.js` 里一处换行被吃掉的损坏。** `__marDoneDebug()` 的
  `listPublishes:` 整行被并进了上一行注释里，于是诊断输出里一直没有这个字段
  （对照实测输出：其它字段按字母序齐全，唯独缺它）。已修复。

### 诊断
- `__marDoneDebug()` 新增 `domSession`（转录基线建立时的"当前会话" id）。

### 教训
- 同一个事实在源码里被读了三遍（`doneCurrentId()` / `doneOnList()` / 计费半边），
  修一处不够。发版前应当直接 `grep` 那个字段名，而不是只顺着调用链看。

## [0.4.1] - 2026-10-11

**安装文档按实测重写。只改文档与版本号，运行时行为一个字节没动。**

2026-10-11 在一台真实机器上照公开 README 走了一遍完整的第三方安装，发现原文档里三处
与实际不符，逐条改掉，并把可复现的证据写进 [docs/INSTALL.md](docs/INSTALL.md)。

### 修复
- **文档：闸门的真实范围。** 原文说「只有 `dsh plugin` 一条路放行」，实测不成立 ——
  `rejectElectronProfile()` 同样挡在 `plugin` 子命令前。桌面端自带 0.2.0-rc.2 写的是
  `if (!manageDesktopProfile) rejectElectronProfile(plugin, options.profile)`，而
  `manageDesktopProfile` 是 `runCli()` 的函数参数、默认 `false`，随包发布的代码里
  **没有任何地方把它设成 `true`**（扫过 `app.asar` 里 296 个非 `node_modules` 的 JS，
  无命中）；npm 全局 0.1.5-rc.1 则是无条件拒绝。新增按构建分列的可用性对照表，
  并给出**不依赖 CLI 的全手工装法**。
- **文档：pnpm 会把 `postinstall` 判成 ignored build。** pnpm 11 对未列入 profile 的
  `pnpm-workspace.yaml` → `allowBuilds` 白名单的依赖不跑生命周期脚本，报
  `ERR_PNPM_IGNORED_BUILDS` 并让 `dsh plugin … add` **以退出码 1 结束** —— 而依赖其实
  已经装好，症状极具误导性。文档里"装完下一次启动就有全部效果"因此要先放行白名单；
  放行不了的，说明 `shell-patch` 的第二条钩子路径会兜底。
- **文档：人工打补丁找不到非标准安装目录。** 在普通 shell 里跑 `node shell-patch/auto.cjs`
  时，自动发现只覆盖「桌面端子进程环境 / `process.execPath` / 上次缓存 / 平台常规目录」，
  装在别的盘（例如 `D:\Software\DeepSeek_Desktop`）会直接报 `state: unresolved`；
  必须 `--app <安装目录>`。已把解析顺序与这条实测补进 README 的安装步骤与本文档。
- **文档：顺手修掉 `docs/INSTALL.md` 里指向自己的链接**（README 拆页时留下的残留），
  并去掉一处把两代 dsh 机制混写的解释 —— `reconcilePlugins` 只存在于 0.1.1-rc.2 的
  `plugin-9h8shc4d.js`，`runProfilePnpm` / `runPluginCommand` 只存在于 0.2.0-rc.2。
  现在改成按当前构建的源码说话，并保留「不管哪一代，desktop 都不会被写 `bundles`」
  这个实测结论。

## [0.4.0] - 2026-10-10

**新增「任务完成动画」**：一轮任务正常结束时，在正常界面之上叠一层四拍收尾动画 ——
反向红 S 扫屏 → 矩阵像素定格 → 渐变为黑 → 纯黑方块逐块硬切、露出正常界面并衔接墨色点阵、
绿色横幅展开；最后那一屏必须**点一下鼠标或按任意键**才消失。

### 新增
- **覆盖层 payload**（`src/boot/done.html` + `done.css` + `engine-done.js`，由
  `scripts/build.cjs` 内嵌成 `client.js` 的 `DONE_PAYLOAD`）：与启动覆盖层同一套注入契约，
  独立 host `#dshMarDoneHost`（z-index 比 `#dshMarBootHost` 低一档）、独立 id 前缀 `md-`。
- **四拍时间线**（`engine-done.js` 的 `CFG`）：
  ① 反向红色 S 扫屏 —— 与启动动画同一条 S 路径**倒过来**（zone2 R→L → zone1 R→L 反向 →
  zone1 L→R → zone0 R→L，右下起、左上收），分块粒度与 `RED_RISE/RED_HOLD/RED_EXIT` 系数
  与启动动画逐字一致；
  ② 矩阵像素定格 —— **参数取自用户的 `网格符号测试.html`**：晶格 **24px**、符号 **12px**
  （`GLYPH_SCALE 0.50`）、线宽 **1.4px**、圆头圆角、**符号不贴边**；**判的是「格位」**
  （整格落在哪块地盘才算它的），四块地盘互相让出整整一格空档。四种符号只换形状：
  侧栏红十字、输入框红方框、输出文本区墨方框、其余空白墨实心圆。
  **矩阵跟着红扫逐块亮起**：某一块的红一开始溶解，那一块的矩阵就在它底下淡入；
  ③ 渐变为纯黑；
  ④ 80px **纯黑硬切方块**（与「配色切换」同一尺寸、同一套 `mosaicOrder` 乱序、JS 驱动）
  逐块消失，露出来的就是底下的正常界面；随后墨色点阵（`任务完成动画.html` 那片会漂移会
  闪灭的点阵，去掉了原稿的 `#04060a` 底色与暗角/扫描线，因为它要浮在界面之上）接上，
  再约 1s 绿色横幅自左向右展开。
- **触发**：`ctx.get('sessions').list` 快照里**当前会话**的 `running`（与应用的回合状态、
  停止按钮、侧栏绿点同一权威位），只认 `true → false` 边沿，每个会话第一个读到的值只作
  基线；**用户按停止**、**收尾 assistant 节点带 `interrupted: true`**、**失败收尾
  （`turn-error`）**都不播；落点后 350ms 再复查一次（连续追问 / 队列续跑让位），播放期间
  又开一轮则整段收掉。
- **关闭**：`document` 捕获阶段的 `pointerdown` / `keydown`，任意时刻按下即整段跳过。
  这一层始终 `pointer-events:none` —— 那一次按下不会被吞掉，它同时抵达用户真正瞄准的元素
  （与 `dsh-theme-endfield` 的雷霆大字同款做法）。
- **设置**：浮动抽屉新增「任务完成动画」开关（默认开）、「完成文案」（默认
  `//RUN_COMPLETE`，可改任意文本）、「预览」按钮，以及一行**触发状态**小字（已挂上会话
  订阅 / 等待服务 / 已关闭）；存储键 `mar.done.v1`。尊重系统「减少动态效果」：整段跳过。
- **两套配色都适配**：④ 那一拍浮在**正常界面**上，墨色由 `done.css` 的 `--md-ink` 给出，
  并在 `body.mar-bg-light`（主白 + 绿）下翻成 `#0B0D0B` —— 否则白点阵会画在白色界面上。
  ② 那一拍不吃这个变量：它底下是自铺的黑幕，两套配色下都是"黑幕 + 红十字/红方框/墨符号"。

### 修复
- **触发链根本没挂上**（用户首测："预览能播、真触发不播"）：客户端服务是各插件自己
  `register` 的，`apply()` 那一刻 `ctx.get('sessions')` 还是空的，而原实现只取一次 ——
  订阅于是永远没建立。现在首选 `ctx.inject(['sessions'], …)`（宿主半边挂 `webServer` 用的
  是同一个写法），并保留"现取 + 每 400ms 补挂（约 30s）"这条兜底；`connection/reset` 后
  再补一次。`document` 上还留了一个 `__marDoneDebug()`，一眼能看出订阅在不在。
- **用户按停止不播**：不再只靠收尾节点上的 `interrupted` 标记（那是 projection 的产物，
  这一代构建未必带上），而是就地包一层会话面的 `cancel()`（DSH 停止按钮唯一调用的取消
  动词）—— 直取用户意图；`interrupted` 与 `turn-error` 两条判据都保留。标记只在本轮有效，
  下一轮开始即清。
- **CFG 名字撞车**：④ 的方块尺寸最初也叫 `TILE_SIZE`，把 ① 的迷宫 tile 边长（5）覆盖成
  80 —— 面板划分整个塌成 3 条整幅横带（角度对不上启动动画）。已改名 `REVEAL_TILE` 并加
  check 守卫。真机复现与定位靠 `.generated/probe-done-regions.cjs`。
- **设置页排版**：`标签`槽位 88px 会把「每轮 Token 结算」折成两行（现在 112px +
  `white-space:nowrap`）；开关行的「开/关」也不再被推进那个 58px 的定宽槽、而是紧贴开关。

### 变更（第五轮真机反馈，2026-10-10）
- **矩阵缩小到与启动动画的标记同尺寸**（用户："矩阵似乎有些太大了…与启动动画里蓝扫的大小
  类似"）：符号从 12px 改到 **8.16px** —— 正是启动动画收尾那套标记自己的取值（它的格子是
  `CELL_SIZE 12 × UI_CROSS_STEP 2 = 24px`、缩放取 0.34），线宽也换成它那条公式
  `max(0.9, size × 0.20)`（于是 8.16px 的符号配 1.63px 线）。晶格仍是同一个 24px、相位不变，
  启动动画的收尾标记与任务完成动画的矩阵因此读起来是同一套像素。守卫加了两条：一侧的参数
  变了、或启动动画那侧的 0.34 / 步长 2 变了，都会立刻报红。
- **设置页重新分组、加大标题**（用户："需要有一个大标题来区分功能"，参考同类 endfield 主题的
  分法）：主题设置（大标题）+ 一句话副标题，下面四组 —— **外观 / 背景动画 / 任务完成动画 /
  每轮 Token 结算**，每组一个带色块与横线的大标题；开关行的文案统一成「启用」（分组标题即
  功能名）。组内行距 10px、组间 24px，小字与输入框左对齐（124px）。
- **背景动画的开关与它的参数归位**（用户："背景设置的开关与点阵密度和呼吸速度离得太远"）：
  这三行现在是同一组里紧挨着的连续三行（以前开关和参数之间隔着整个"任务完成动画"分组与配色
  单选），关掉时下面两行照旧变暗禁用。
- 回归：`selftest`（`test/plugin.test.cjs`）新增三条 —— 分区标题必须按
  `外观|背景动画|任务完成动画|每轮 Token 结算` 排列、背景开关必须**紧贴**它的密度/呼吸两行、
  面板必须保留大标题与副标题。

### 修复（第三轮真机实测，2026-10-10）
- **真凶：客户端 `sessions` 服务面没有 `list`**（用户第三次反馈"还是无法触发"）。用 Cordis
  Inspect 向运行中的客户端核实：真机服务面是
  `{ retain, using, retainInfo, refreshProjections, search, fork, scope, binding }` ——
  **根本没有 `list`**。而 `installDone()` 要求 `sessions.list.subscribe` 是函数，否则直接
  `return false`，于是整条触发链**从来没装上**（`pokeDone` 空转 30s 后放弃）——"预览能播
  （预览不需要服务）、真任务永远不播"就是这么来的。现在只要服务面可用就装上，`list` 有就
  顺带订阅。
- **触发主判据换成不依赖会话 id 的 DOM 锚点**：`[data-turn-tail]` 新增一个节点 = 刚结束一轮
  （**计费纸条就是贴这个锚点的，所以它在真机上已经被验证可用**），加上
  `[class*="_turnStatus"]` 从有到无。没有会话面可用时，收尾节点里的"已中断 / 已停止"字样由
  DOM 读出，照样抑制中断收尾。会话面的 `turnEnds` 单调计数器与两条 `running` 边沿都保留为
  额外判据。
- **按了停止不再吞掉正常完成**：`cancel()` 包装只在那**一刻真的在跑**时记"用户按过停止"
  （有些收尾路径自己也会调 `cancel`，原来会把正常完成一起吞掉）；新一轮的上升沿会清掉它。
- **诊断升级**：设置页那行小字会写清用了哪条判据、最近一次判定的结果；每次判定往 console 打
  一行 `[theme-mls] 任务完成动画：…`；`__marDoneDebug()` 多了 `listPublishes /
  facePublishes / faceEdges / domTails / domStatus / lastEnds`。预览按钮也会顺带把触发状态
  贴在下面 —— 一次点击就能读出"为什么没播"。
- **矩阵填满整屏**（用户："矩阵之间有明显的分界线，这些分界线也需要填充上去"）：去掉"符号放
  不下就留空"的判定（它会在 UI 边界上连成一条条空档），改成**按格心归属、每格都有符号**；
  格位与相位不变。像素复核新增"四块地盘加起来的符号数 = 视口内格位数"的断言（实测 480 /
  132 / 1925 / 143，一个不差）。
- **空白区的实心圆缩小一档**（用户："白色圆形实心小点，缩小一点"）：半径 = 符号边长 ×
  `UI_DOT_SCALE`（0.30，即 3.6px，原先是 6px）；方框与十字不变。
- **DOM 判据把"转录挂载"误判成"刚结束一轮"**（用户第四轮：启动动画一结束自己播了一次；
  切回已经播过的会话又重复播）：上一版一看到"回合尾巴数量变多"就触发，而转录**首次挂载 /
  切换会话 / 整屏重绘**都会把历史里的尾巴一次铺出来。现在加两道闸 ——
  ① **同一个转录**：上次看到的尾巴节点还在文档里（说明没人换过转录），或（还没有尾巴时）
  容器还是同一个且仍在文档里；② **先看见回合在跑**（`[class*="_turnStatus"]` 出现过一次）
  之后多出来的尾巴才算结束。挂载 / 切会话只更新基线，并在 console 记一行"转录换了…不触发"。
  回归测试：挂载历史不播、之后真的结束一轮照播、切会话不重复播。
- **回归测试**：`test/done-engine.test.cjs` 新增"服务面没有 `list`"的两条（触发照播 / 中断照
  抑制）与 DOM 判据路径（含上面那三条挂载/切换的用例）；`check.cjs` 为 `installDone` 可用
  服务面的形状、以及 DOM 判据的"同一个转录 + 回合在跑"两道闸加了专门守卫（各带
  `MLS_CLIENT_JS` 变异证明可证伪）。

### 修复（第二轮真机实测，2026-10-10）
- **短任务还是不播**（用户："是不是因为任务时间太短了？"）：上一版只认列表 `running` 的
  `true → false` 边沿，而一轮很短时完全可能**在两次快照推送之间就把整个翻转走完**
  （快照批量推送时更看不到边沿）—— 于是整轮被漏掉。现在盯**会话面**
  （`sessions.binding(id).session`，应用自己的回合状态标签读的那一份视图）的快照里那个
  **单调计数器** `ConversationSnapshot.turnEnds`：**它涨了就是"刚结束一轮"**，中间态有没有
  被看到都不影响；列表的 `running` 边沿降级为兜底（老宿主照样能触发）。会话面订阅随
  "当前显示的会话"切换而重挂，每会话第一次读到的计数器只作基线。jsdom 里新增两条测试：
  "列表一次 `running=true` 都没推、只有计数器涨了 —— 必须照播"、"第二轮也得各有一次"。
- **矩阵改成跟着红扫逐块亮起**（用户："红扫后应该就可以逐渐看到背景了，而不是红扫完成了过
  一会才显示矩阵"）：原来是"红扫整个走完 → 等 40ms → 整屏矩阵同时淡入"，中间那一段是死的
  黑屏。现在 `paint()` 把画布按 **黑底 → 矩阵 → 红块** 三层重画，矩阵的每一格按**它所在那
  一块红扫面板**的进度淡入（`regionMarkAlpha` 读 `r.holdEnd`）：红扫走到哪一块，那一块的
  矩阵就在它底下亮起来，红块仍然盖在上面。`MARK_AT` 因此提前到第一块的 `holdEnd`，
  `MARK_DONE` = 最后一块铺满。像素复核里加了可证伪的一条：红扫还在跑时矩阵已出现，
  且**只出现在下半屏**（最先被扫过的地带）。
- **矩阵参数与"格位"重做**（用户："现在的矩阵密集，且排列不规范"，并给了
  `网格符号测试.html`）：换成参考页的 **24px 晶格 / 12px 符号 / 1.4px 线宽 / 圆头圆角**，
  并把判定从"符号实体"改成**「格位」**—— 整格（24px 见方）落在哪块地盘里才算它的，
  于是四块地盘互相让出整整一格空档、符号永不贴边也永不互相咬，放不下的格**留空**而不内缩
  网格。实测四块地盘 pitch 全 24、phase 全 0，符号数 380 / 93 / 1782 / 84。
- **黑屏时间加长**（用户："矩阵后逐渐变黑的时间可以再延长一点，多留一点'黑屏'的时间"）：
  `BLACK_FADE` 600 → **900ms**，并新增 `BLACK_HOLD` **700ms** 的**纯黑静置**再开始逐块揭示
  （`TILES_AT = BLACK_AT + BLACK_FADE + BLACK_HOLD`）。
- **触发链再加一层可见性**：设置页那行小字现在会带上**最近一次的判定结果**（已播放 /
  新一轮已经开跑，跳过 / 那轮是停止·中断·报错收尾 / 刚结束的那轮不在当前显示的会话里 / …），
  `__marDoneDebug()` 也多了 `faceSubscribed` / `turnSeen` / `last`。以后再"没触发"，
  页面上直接写着原因。

### 工程质量
- `test/done-engine.test.cjs`（jsdom，`npm run test:done`）：基线静默、边沿触发、
  **订阅迟到**（`ctx.inject` 回调 与 无 inject 时的补挂轮询，两条路各测一遍）、
  **短任务**（列表一次 `running=true` 都没推、只有会话面 `turnEnds` 涨一轮 —— 必须照播）、
  每一轮各有一次、列表边沿单独也能触发（兜底）、
  用户按停止（`session.cancel`）抑制且不泄漏到下一轮、中断/报错抑制、中途 interrupted 但
  收尾正常的那一轮照播、新一轮让位、点按关闭、开关关掉 / `prefers-reduced-motion` 都不挂载、
  无 sessions 服务也能 apply、dispose 退订并摘掉覆盖层，以及"24px 晶格 + 矩阵跟着红扫 +
  反向 S 顺序与启动动画同系数 + CFG 不撞名"的结构断言。
- `.generated/verify-done.cjs`（无头 Chromium + 假 DSH DOM + 像素读回，按 `.gitignore`
  不入库）：1600x952 下按真机几何搭 rail 276 / `RlGAzG_card` 780x94 贴底 /
  `[data-conversation-scroll]`，然后逐拍断言 ——
  红扫 150ms 时只有右下那一块是红的、结束前 200ms 只有左上那一块是红的（方向可证伪）；
  **矩阵跟着红扫亮起**（红扫还在跑时矩阵已出现 250 个十字，且最上面的十字 y=335 —— 只在
  下半屏，即最先被扫过的地带）；
  四块地盘的符号**都在 24px 晶格、同一相位**（pitch 全 24、phase 全 0；侧栏 10 列 / 输入框
  31 列 / 输出区 54 列 / 空白 21 列），十字 380 + 红方框 93 + 墨方框 1782 + 墨点 84，
  全部零越界、空白点零侵入任何一块地盘；黑幕那一拍 1523200/1523200 像素全黑；硬切方块
  240 块（中途 120 开 / 120 未开，同一帧里既有黑块也有界面本色）；绿色横幅 96448px
  完全展开、不透（点阵不穿透）、下方界面仍可读（107 万像素是界面本色）；切到主白 + 绿后
  墨色翻成 `#0B0D0B`、墨点仍在（195 个暗点）且白点归零。
  ①②③ 与方块揭示都是时间的纯函数（方块由 JS 驱动，不是 CSS 动画），用 `__mbDone.seek()`
  （测试专用 hook）按 16ms 小步重放抓帧；只有横幅的 CSS 展开走墙钟，必须实时采样 ——
  截图会晚到 300-600ms，那是唯一能把"最后一拍"拍准的办法。
- `check.cjs` 新增一组完成动画守卫（payload 内嵌 + 反向循环 + 红扫系数 +
  网格符号测试页的三档矩阵参数（`UI_CELL` 24 / `UI_GLYPH_SCALE` 0.50 / `UI_LINE_WIDTH` 1.4）
  + 格位判定 + 矩阵跟着红扫 + 四块地盘配色 + 三层绘制顺序（黑底→矩阵→红块）+ 渐黑与纯黑静置 +
  硬切方块（并禁止 `backdrop-filter`/玻璃回归）+ `--md-ink` 双配色 + 捕获阶段关闭 +
  迟到挂载 + **`turnEnds` 单调计数器**），`.generated/falsify-check.cjs` 用 **15 个变异**
  逐个证明它们**真能变红**（走 check.cjs 自己的 `MLS_CLIENT_JS` 临时副本通道，
  不再改写 client.js）。
- 诊断工具（`.generated/`，不入库）：`probe-done-regions.cjs`（把面板/晶格的真实几何打出来
  —— 上面那条撞名就是这么抓到的）、`dump-done-engine.cjs`（从 client.js 里抽出内嵌 payload
  源码）、`scan-asar.cjs`（按字节扫 `app.asar` 里的 token，用来确认 `interrupted` 的真实
  写法与来源）。

## [0.3.1] - 2026-10-10

**修启动动画末尾的两块红色标记**：方框点阵不再压在左侧栏的十字上，也不再铺到输入框之外。

### 修复
- **输入框方框点阵改用真卡片**：`uV2eYG_card` / `uV2eYG_root` 这两个锚点在当前
  `app.asar` 里**一个字节都不存在**（全量扫描 0 命中），所以方框一直落在
  `composerStack` / `composerHero` 上 —— 那是**整段条带**：hero 相位实测 903x264，
  而卡片只有 780x118。现在由 `composerRect()` 按"类名 token 以 `_card` 结尾"
  （现役构建 `RlGAzG_card`，`fileCard` / `cardWorkspaceTrigger` 因此被排除）
  在 composer 栈里就地量出真卡片，旧的整段条带只作兜底。
- **方框不再进侧栏**：落点先与侧栏矩形对一次，**连符号实体（含线宽）碰到侧栏的整格
  直接丢弃** —— 只判中心点不够：中心差一格时方框的边仍会压住十字臂尖（实测这种
  漏网的有 3 格）。窄窗口（<1024）下把侧栏展开压在中栏上时，条带会伸到侧栏底下，
  实测这一条能拦下 48 个越界格；十字保住自己的地盘，两块标记不再重叠。
- **方框不再探出卡片**：只有整格（含线宽）都在卡片矩形内的点才画，方框网格变成
  卡片内一圈整齐的内缩点阵（780x118 卡片 → 31x4 格），「超出应有的区域」消失。

### 工程质量
- `check.cjs` 新增 3 条守卫（`cardIn` / `composerRect` 存在、按符号实体对侧栏做减法、
  `drawComposerBox(alpha, rect, avoid)` 参数形状），复现旧行为即变红。
- 判定依据可复核（都在 `.generated/`，按 `.gitignore` 不入库）：
  - `png-scan.cjs` / `png-profile.cjs` / `png-map.cjs` / `png-decode.cjs`：把启动帧
    解码成像素分布与文本布局 —— 真机帧 `boot3-frame-029` 即"侧栏十字 x[0..276] 满高
    + 方框铺到 x=1381、高 264"的那一帧；
  - `asar-ls.cjs` / `cls-find.cjs` / `css-find.cjs` / `css-dump.cjs`：在 `app.asar`
    里反查真实类名与布局 CSS（`uV2eYG` 正是这样确认 0 命中的）；
  - `verify-marks.cjs`：无头浏览器里按真机几何搭一套 DSH DOM（rail 276 宽、hero 条带
    903x264 里放 780x118 卡片、active 卡片贴底、以及"卡片类名不可得 + 侧栏压住中栏"
    三种场景），跑完启动动画末尾那一拍，把像素按**连通域**分类成十字/方框（靠四角
    是否着色区分），断言：十字都在侧栏内、方框都在卡片内、两者零重叠。
    修复前（`--old`，把两处修改还原）必须变红，实测：hero 232/360 个方框探出卡片、
    active 63/159 个探出、overlay 48 个压在侧栏上；修复后三种场景全部 PASS。


## [0.3.0] - 2026-10-09

**内置「每轮 token 结算」**：每一轮任务结束后，在它的轮次尾巴上贴一张结算小纸条
（`TOKEN USAGE` 绿条 + 八行明细 + 灰色「任务用时」条）。计费不再是独立插件。

### 新增
- **计费半侧**（`billing/`，ESM，由 `index.js` 动态 import）：逐笔 token 折叠
  （`fold.mjs`）、DeepSeek 官方分时价目表与峰谷判定（`pricing.mjs`）、日账/会账
  与原子写（`ledger.mjs`）、装配与只读接口（`host.mjs`）。
- **结算块**（客户端）：贴在 `[data-turn-tail="<轮次号>"]` 的动作行之前 ——
  跟着转录滚动、切会话随转录销毁，没有跨会话状态。
- **接口**：`GET /dsh-mls-billing/state`、`/health`、`POST /balance/refresh`、
  `GET /backfill?session=<id>`（同源/回环栅栏，凭据不下发浏览器）。

### 计费口径
- 四桶互不重叠：未命中（`inputTokens`）、命中（`cacheReadTokens`）、缓存写入
  （按**未命中**价）、输出（**已含** reasoning）；命中率 = `hit / (hit + miss)`。
- 高峰 = 周一至周五（不含中国法定节假日）北京 09:00–12:00、14:00–18:00；
  周末与法定节假日全天为谷价（生效分界：周末 2026-08-23、节假日 2026-09-19）。
- 定档时刻用 `step/end.time`；钱在**读取时**按当前价目表算，历史峰谷档不被篡改；
  未定价模型单列（`UNPRICED`，走告警色），不静默算进总额。
- 「任务用时」= `turn/end − turn/start`，`turn/end` 之后**冻住**（DSH 自己的页脚两种模式都不显示耗时）。

### 交互与外观
- 尺寸只有一个旋钮 `--mlsb-s:1.5`；居中；绿条只有 `TOKEN USAGE` + 左右两个黑色十字；
  圆角 6px×缩放（展开时绿条下方直角接面板、面板下方圆角）；绿条与灰条之间留 5px；
  字体回到宿主默认栈（数字仍走等宽栈）。
- 动效：落地时**从中间向两端展开**（`clip-path`，`.18s`）；展开/收起走
  `grid-template-rows:0fr → 1fr` + 透明度（`.2s`）；`prefers-reduced-motion` 下全部关闭。
- **主题设置里多一个开关**「每轮 Token 结算」（`localStorage['mar.billing.v1']`，默认开）：
  关掉立即摘掉所有纸条并停止轮询。

### 修复
- **重启桌面端后当前这段对话没有纸条**：
  ① 账本新增**逐轮**数据（每会话最近 40 轮），启动时回填；
  ② 贴纸前用 `ctx.get('sessions').list.current` **精确**判断"客户端显示的是哪段对话"，
  避免把另一段对话的数字贴到本段尾巴上；
  ③ 本功能上线**之前**跑过的轮次按需回填：客户端带 `?session=` 来，宿主用
  `ctx.sessionPersistence.readFrom(id, 0)` 重放日志补出逐轮数据（走 DSH 自己的服务，
  不碰磁盘格式；每会话一次、8s 超时、失败静默）。
- 余额失败只缓存 10s（原先 60s），避免"启动时账号服务还没就绪"导致界面上一分钟读不到余额。

### 工程质量
- 新增测试：`npm run test:billing`（43 项：价目表/峰谷、折叠含用时与空轮次、账本容错、
  宿主装配与栅栏、回填）+ `npm run test:billing-ui`（35 项 jsdom：落位、八行口径、
  用时冻结、圆角/间隙/尺寸、动画、开关、会话精确匹配）；`npm test` 113 → 116 项
  （新增主题设置面板里的开关回归）。
- `check.cjs` 全绿（含 accent-as-text、直角豁免、背景清场放行结算块等既有断言）。
- `docs/COMPATIBILITY.md` 与 `docs/ASSET_POLICY.md` 改为中文，并补上计费半侧的宿主契约。

## [0.2.0] - 2026-10-08

「主题设置」页与网页版对齐：点阵动画变成独立开关，两组配色成为互斥单选。

### 变更
- **背景动画** 从原来的三段式 `关闭背景动画 / 主白 + 绿 / 主黑 + 绿` 里拆出来，成为
  **独立开关**，**默认关闭**（新装 / 清空 `localStorage` 后不播放点阵场）。
- **主白 + 绿 / 主黑 + 绿** 变成单选组：恒有且只有一个被选中，与动画开关互不影响 ——
  关掉动画不会把配色弹回主黑 + 绿，换配色也不会顺带把动画打开。
- 状态模型由 `BG_STATE.mode (off|light|dark)` 拆成 `BG_STATE.anim`（布尔）+
  `BG_STATE.scheme`（light|dark）；`bgApplyMode` / `bgDraw` / `bgStart` / `bgKick` /
  `sweepReveals` 全部改读新字段。
- 存储形状 `dsh-theme-marathon.bg.v1` 从 `{mode, scheme, cell, speed}` 变为
  `{anim, scheme, cell, speed}`；旧形状读取时按语义迁移（`mode: off` → `anim: false` 且
  保留 `scheme`，`mode: light|dark|green` → `anim: true` + 对应配色）。
- 点阵密度 / 呼吸速度在场关闭时变暗且 `disabled`；面板在挂载时就同步当前状态（不再等到
  第一次点击 tab）。
- 换配色只在真的换了另一对时重放马赛克灌注。
- 面板结构与文案与网页版 `dsh-theme-marathon` 的 `buildPane` **逐字节一致**（顺带补上了
  桌面版缺的 `.mar-val` 数值样式）。

### 工程质量
- `check.cjs` 与 `test/plugin.test.cjs`（113 项）增加与网页版相同的断言：
  默认关闭、四种存储形状迁移、配色单选组、旧 `data-bg=` / `aria-pressed` 不得回来、
  以及通过真实面板控件驱动的「开关不影响配色 / 配色不影响开关」交互回归。

## [0.1.0] - 2026-10-02

首次正式发布（GitHub 上传前的整理快照）。

### 视觉与启动
- 启动背景真透明（依赖 `shell-patch/` 改 `lib/main.js` 的 `transparentWindowOptions()`）。
- 启动即最大化，规避 alpha 窗口被合成器拒绝最大化（`setBounds()` 后异步 `maximize()` 重试）。
- 原生 caption 按钮在动画期间隐藏、动画结束后恢复；`windows-appearance` handler 被加闸，被它复位的覆盖层重新保存/恢复。
- 冷启动流程：绿鲸鱼先行 → 五个绿框依次出现 → 蓝色像素块逐个释放 → S 路径红色横扫 → 蓝色"LOADING..."字幕带 → 揭幕。
- 切换动画：与网页版 `dsh-theme-marathon` 对齐 —— 9×5 网格 + 路径遮罩，`clip-path: path()` 路径坐标按 `devicePixelRatio` 缩放。
- 反转蓝 logo 闪烁：1.20s 起 0.25s 内单次出现，复用 `assets/boot/invert-blue-pixel.png`。

### 主题与组件
- `client.js` 覆盖 `theme` 服务的 `overrideTokens`（仅改 token，不动 DOM/路由）。
- 发送按钮 (`button._primary`) 取同款绿（`--mar-accent`）作为底色 + 边框，禁用态同样生效。
- 左侧栏的新会话项：hover 时绿色块亮起，选中态取 `--mar-accent`，未选中项不染色。
- 设置面板：进入瞬间 5×5 马赛克铺设 + 2px 边框；任务板：每选项板 + 4 个 reticle + 2px 边框 1-2-4-3 顺序登场。
- 菜单板项：`--mar-bg-void` 矩形与 `--dsw-default-tab` 对比鲜明。

### 工程质量
- `npm run build` → `npm run check`（103 项静态断言）+ `npm test`（101 项 jsdom）+ `npm run verify:*`（patch 23 / auto 47）全过。
- `shell-patch/` 的所有路径都做 SHA256 校验、Pickle 头字段、`process.noAsar` 兜底，verbatim 字节比对。
- `lib/asar.cjs` 自己解包/重打包，结果与源文件**逐字节相同**。
- 升级路径：`revert.cjs` + `apply.cjs`，**不再就地升级阶梯**（旧版会留下重复的 handler）。
- `.gitignore` 屏蔽 5 个 .bak 调试快照、`preview.html`、`auto-apply.log`、`assets/screenshots/` 等开发期遗留。
- `package.json` 加 `repository` / `bugs` / `homepage` 指向 `github.com/ALPDM00/dsh-theme-mls-desktop`。

### 与网页版的边界
- 本包是 `dsh-theme-marathon`（网页版）的桌面专版；视觉一致，差异在启动那一刻。
- 不同时启用两者 —— 同时挂载会重复注入启动覆盖层。
- 共享同一套 `mar-` 命名空间。