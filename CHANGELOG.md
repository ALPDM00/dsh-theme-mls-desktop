# Changelog

所有显著改动都列在这。版本号遵循 [SemVer](https://semver.org/)：
主版本号 = 不兼容的 API/视觉变更；
次版本号 = 向后兼容的新功能；
修订号 = 向后兼容的 bug 修复。

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