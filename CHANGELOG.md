# Changelog

所有显著改动都列在这。版本号遵循 [SemVer](https://semver.org/)：
主版本号 = 不兼容的 API/视觉变更；
次版本号 = 向后兼容的新功能；
修订号 = 向后兼容的 bug 修复。

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