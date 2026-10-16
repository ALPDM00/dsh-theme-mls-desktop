# dsh-theme-mls-desktop

> **Marathon 风格的 FUI / 编辑排印故障主题** —— **deepseekHarness 桌面端（Electron）** 专版。
>
> 真的透明冷启动、反向 S 扫描的收尾动画、内置每轮 token 结算。
> **全部图形由插件在运行时程序化生成**，不含任何 Bungie / Marathon 的版权素材。

|  |  |
| --- | --- |
| 平台 | deepseekHarness **desktop** profile（Electron 壳） |
| 运行环境 | deepseekHarness `0.1.0-rc.8` 或更新；已实测 `0.2.0-rc.2` |
| 加载契约 | `window.__ModuleLoader__.load`（浏览器半）+ `webserver/index-inject`（宿主半）+ 可选壳补丁 |
| 许可 | MIT（第三方素材见 [docs/ASSET_POLICY.md](docs/ASSET_POLICY.md)） |

它是网页版 [`dsh-theme-marathon`](https://github.com/ALPDM00/dsh-theme-marathon) 的**桌面专版**：主题视觉完全相同，差别全在**启动那一刻**与几个只有桌面端才有的能力。

| 能力 | 网页版 | 本包（桌面版） |
| --- | --- | --- |
| 启动背景 | 纯黑板 | **真透明**，透出桌面 / 壁纸 |
| 揭幕顺序 | 绿 logo 与其它元素同帧出现 | **绿鲸鱼先行**：文字 → 五个绿框 → 蓝色像素块逐个释放 |
| 原生窗口按钮 | n/a | 动画期间隐藏，结束后恢复 |
| 重播时机 | 每次页面加载 | **仅冷启动一次**（刷新、收起再从托盘打开都不重播） |
| 启动即最大化 / 首帧可透视 | n/a | 由 **壳补丁**（`app.asar`）提供，见 [docs/SHELL-PATCH.md](docs/SHELL-PATCH.md) |

## 特性

- **启动动画**：透明窗口 + 绿鲸鱼揭幕 + marathon 像素场，全程程序化绘制（`src/boot/*`）。
- **任务完成动画**：一轮正常结束时四拍收尾 —— 反向红 S 扫屏 → **24px 矩阵跟着红扫逐块亮起**
  → 渐黑 + 纯黑静置 → 纯黑方块逐块硬切揭示界面 + 墨色点阵 + 绿色横幅（`//RUN_COMPLETE`）。
  点一下或按任意键就消失，且不吞掉那一次点击。见 [docs/COMPLETION.md](docs/COMPLETION.md)。
- **每轮 token 结算**：每轮结束在轮次尾巴贴一张 `TOKEN USAGE` 小便签（本轮费用 / 四桶 token /
  命中率 / 用时，含峰谷计价），开关在设置页里。见 [docs/BILLING.md](docs/BILLING.md)。
- **主题设置页**：外观 / 主题色 / 背景动画 / 任务完成动画 / 每轮 Token 结算 五组，各自独立。
  见 [docs/SETTINGS.md](docs/SETTINGS.md)。
- **主题视觉**：浅色 / 深色两套底盘 + 七选一的主题配色（UI 强调色，默认 `#C0FE04`）、
  全直角、HUD 角标、马赛克面板切换、视口转场 ——
  完整设计规则见 [docs/design-language.md](docs/design-language.md)。
- **没有原生蓝**：链接、深度思考那行、文档预览选区、附件类型色块、toast 的「操作」、
  轨迹/回合时间线的强调、上下文计量的「对话」色、引导卡片，全部收回主题配色。
  唯一保留的是 Markdown 代码块的语法高亮（它吃的是 DSH 的静态色阶，钉掉会连高亮一起改掉）。

## 安装

> ⚠️ **本插件会（可选地）修改你的桌面端安装**：把 `<install>/resources/app.asar` 打一个小补丁，
> 用来实现透明窗口、隐藏原生 caption 按钮、启动即最大化。补丁**只改这几个行为**、可一键还原、
> 用摘要识别版本，细节与安全模型见 [docs/SHELL-PATCH.md](docs/SHELL-PATCH.md)；
> 不想要它就别装（主题其余部分照常工作）。

> ⚠️ **别用 `dsh plugin --profile desktop add …` —— 它在这两代 dsh 上都是死路。**
> 闸门在 `@deepseek-ai/dsh/lib/bin.js`，对 `desktop` 一律报
> `error: profile "desktop" is managed exclusively by the Electron application`，
> 而且**连 `--profile desktop --dump-config` 一起挡**。桌面端自带那份（0.2.0-rc.2）写的是
> `if (!manageDesktopProfile) rejectElectronProfile(...)`，而 `manageDesktopProfile` 是
> `runCli()` 的函数参数、默认 `false`，**随包代码里没有任何地方把它设成 `true`**；
> npm 全局那份（0.1.5-rc.1）则是无条件拒绝。报错本身不提任何替代路径 ——
> 完整对照表与逐项排错见 [docs/INSTALL.md](docs/INSTALL.md)。

desktop profile 启动时只认两件事：**在 `node_modules` 里能解析到本包**，
以及 **`dsh.profile.bundles` 里有它的包名**。达成这两件事就有主题。

```bash
# ① 取包 —— 不要指望 git
#    本机 git 的 schannel 常建不起 TLS（SEC_E_NO_CREDENTIALS），
#    `github:` 这类 spec 无论交给 dsh 还是 pnpm 都会死在取包上。
#    改用 node 直接抓 codeload 的 tar.gz（走镜像，绕开 github.com 直连不通）：
node -e "
  fetch('https://gh-proxy.com/https://codeload.github.com/ALPDM00/dsh-theme-mls-desktop/tar.gz/refs/heads/main')
    .then(r => r.arrayBuffer())
    .then(b => require('fs').writeFileSync('mls.tar.gz', Buffer.from(b)))
"
tar -xzf mls.tar.gz

# ② 解压出来的整个目录放进 profile 的 node_modules
#    （$DSH_HOME 见桌面端环境变量；本例是 D:\Software\DeepSeekHarness\.dsh）
#      <解压目录>  ->  $DSH_HOME/profiles/desktop/node_modules/dsh-theme-mls-desktop

# ③ 让 desktop profile 真挂上这个 bundle
#    —— desktop profile 的 CLI 不会自己写 `bundles`（上游行为，不是本包能改的），
#       所以**无论用哪条路装的，这一步都得手工补**
node -e "
  const fs = require('fs')
  const p = (process.env.DSH_HOME || '') + '/profiles/desktop/package.json'
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  j.dsh = j.dsh || {}; j.dsh.profile = j.dsh.profile || {}
  j.dsh.profile.bundles = Array.from(new Set([...(j.dsh.profile.bundles || []), 'dsh-theme-mls-desktop']))
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n')
"

# ④ 启动桌面端一次，关掉，再启动 —— 就能看到效果
```

> ⚠️ **如果你是让 AI 在 DSH 会话里代装**（现在很常见），它多半会卡在权限上：
> 会话沙箱默认只能写会话工作区，`$DSH_HOME` 在外面，于是第 ② ③ 步报
> `EPERM: operation not permitted` 或 `[sandbox: file access denied]`。
> **那不是插件坏了，是那一步需要你批准写 `$DSH_HOME`。** 五道关卡的清单在
> [docs/INSTALL.md](docs/INSTALL.md) 第〇节。

挂载是否真的生效、`bundles` 里该写包名还是 `id`、以及装不上时怎么逐项查，都在
[docs/INSTALL.md](docs/INSTALL.md)。补丁的检查 / 还原：

```bash
npm run patch:check     # 只报告当前状态，不改任何东西
npm run patch:revert    # 用 pristine 备份还原 app.asar
```

## 卸载

把 `bundles` 里的 `dsh-theme-mls-desktop` 去掉（或交给插件管理器卸载）之后，
**磁盘上确实是干净的**：

- `$DSH_HOME/profiles/desktop/package.json` 的 `dependencies` / `bundles` 里都没有它；
- `node_modules/dsh-theme-mls-desktop` 已删除（`link:` 装法删的只是链接，不动你的开发目录）；
- 启动时拼出来的 `cordis.yml` 里也没有它。

> ⚠️ **但正在运行的那个窗口不会立刻卸掉主题。** 卸载改的是磁盘上的配置，而**已经注入页面的
> 客户端半还活在渲染进程里** —— 于是会出现「我明明卸载了，任务完成动画还在播 / 主题还在」。
> 2026-10-11 实测：03:42:52 卸载，磁盘三处全部干净、宿主半的计费账本
> （`$DSH_HOME/storages/mls-billing-ledger.json`）最后一次写入停在 03:39:22 之后不再更新，
> **但收尾动画在卸载之后仍然照放**，一直放到窗口重载为止。

处理办法：**刷新页面 / 重启桌面端**，之后就彻底安静。若重启后还在，那与插件残留无关 ——
`shell-patch` 仍留在 `app.asar` 里（它独立于插件存在，只影响透明 / 原生按钮 / 启动最大化，
**不含**收尾动画），`npm run patch:revert` 还原即可。

残留的小尾巴（都不影响功能，介意可以手删）：

- `node_modules/.package-map.json`、`pnpm-workspace.yaml` 的 `allowBuilds` 里可能还留着一行包名
  —— 那是 pnpm 的记账文件，不是"仍然启用"；
- `$DSH_HOME/storages/mls-billing-ledger.json` 是本主题的计费账本，卸载不会删它。

## 设置

设置 ›「主题设置」，按功能分成六组（每组一个大标题，组内开关紧贴自己的参数）：

| 分组 | 内容 |
| --- | --- |
| **外观** | 配色：浅色 / 深色（互斥单选，指底盘，不含强调色） |
| **主题色** | 七选一的**主题配色**：`#05C938` / `#E60B10` / `#E7337C` / `#E5710C` / `#C272E9` / `#81E8B1` / `#C0FE04`（默认）。366:237 的色块、**一行 4 个**、**无文本**，点一下即换 UI 强调色；六格画的是阵营标记（赛博艾克米 / 阿拉克尼 / 纽卡洛里 / 特莱克斯 / 米达 / 关口），默认色那格是马拉松 LOGO |
| **背景动画** | 启用开关 + 点阵密度 + 呼吸速度（关掉时后两行变暗并禁用） |
| **启动动画** | 启用开关（默认开）。**只在下次冷启动生效** —— 揭幕发生在设置页能打开之前，所以这一组只有一个开关 |
| **任务完成动画** | 启用开关 + 完成文案 + 预览按钮 + 状态小字 |
| **每轮 Token 结算** | 启用开关。⚠️ 结算纸条**固定用最初那支酸绿**，不跟主题色走 |

改这些设置存在 DSH 自己的设置存储里（主题名下的 `mar.*` 键），与页面端口无关。
每一项的默认值、边界情况与调参位置见 [docs/SETTINGS.md](docs/SETTINGS.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/INSTALL.md](docs/INSTALL.md) | 完整安装步骤（含"让 AI 代装"）、排错、卸载与残留、以及"装好了却没反应"的逐项检查 |
| [docs/SHELL-PATCH.md](docs/SHELL-PATCH.md) | 壳补丁做了什么、为什么需要、怎么升级与还原、安全模型 |
| [docs/COMPLETION.md](docs/COMPLETION.md) | 任务完成动画的四拍、每个旋钮、以及它怎么判断"一轮结束了" |
| [docs/SETTINGS.md](docs/SETTINGS.md) | 设置页结构、每一项的默认值与作用、调参位置总表 |
| [docs/BILLING.md](docs/BILLING.md) | 每轮 token 结算：数据来路、峰谷计价、宿主半边 |
| [docs/design-language.md](docs/design-language.md) | 设计语言：配色、令牌映射、对比度、动效规则、反模式 |
| [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) | 依赖的宿主契约与锚点、兼容闸门、已知边界 |
| [docs/ASSET_POLICY.md](docs/ASSET_POLICY.md) | 资产政策：灵感 vs 抄袭、随包发布的东西、字体责任边界 |
| [CHANGELOG.md](CHANGELOG.md) | 逐版本变更（含每条改动的原因与实测结论） |

## 仓库内容

本仓库只放**运行这个主题需要的东西** + 说明文档：

- 运行所需：`index.js`（宿主半）、`client.js`（浏览器半产物）、`cordis.patch.yml`、
  `billing/`、`shell-patch/`、`assets/`、`postinstall.cjs`；
- 源码：`src/`（`client.template.js` 是主题本体，`src/boot/*` 是启动动画；`client.js` 由
  `npm run build` 从它们组装出来，**请勿直接编辑产物**）；
- 文档：`README.md`、`CHANGELOG.md`、`docs/`；
- 改动 `src/` 之后必须跑一次 `npm run build`。

> 开发期的静态校验、jsdom 测试与像素复核脚本（`check.cjs` / 本机自检 / `test/` 等）
> **不随本仓库发布**；它们只在本机用来守住上面这些契约，删掉不影响主题功能。

## 项目结构

```text
index.js                宿主半：预插件期样式注入 + 调度壳补丁 + 挂载计费
client.js               浏览器半产物（由 src/ 组装；请勿直接编辑）
cordis.patch.yml        bundle 挂载声明
src/
  client.template.js    主题本体模板（唯一手写的大文件：样式 + 设置页 + 收尾动画 + 结算块）
  boot/                 启动动画：boot.css / boot.html / engine-intro.js / engine-marathon.js
billing/                计费半侧：host / fold / pricing / ledger
shell-patch/            桌面壳补丁：发现安装、apply / revert / verify / inspect
scripts/build.cjs       组装 client.js
docs/                   上表那些文档
assets/                 启动图像与字体（见资产政策）
```

## 资产与许可

MIT。所有图形均由插件**程序化生成**或为本项目原创；**不含**任何 Bungie / Marathon 版权素材。
随包发布的启动图像是把 DeepSeek 的品牌标记程序化重绘的 PNG（**不是**游戏素材），字体见下。

> ⚠️ **`assets/fonts/Maratype.otf` 是由使用者提供的装饰字体**，本仓库不主张其权利。
> 如果你要**公开分发**（fork、打包、放到市场），请按 [docs/ASSET_POLICY.md](docs/ASSET_POLICY.md) §3
> 三选一：确认你有再分发许可 / 换成 OFL 字体 / 删掉它（构建会自动回落到 `ui-monospace, monospace`）。

## 与上游网页版的关系

本包从 [`dsh-theme-marathon`](https://github.com/ALPDM00/dsh-theme-marathon) 派生，共享同一套
`mar-` 命名空间与主题视觉。同步上游主题改动时需要手工挑拣 `src/client.template.js` 的主题部分；
启动阶段（`src/boot/*`）与壳补丁（`shell-patch/`）是本包独有的桌面实现。

## 许可证

MIT，仅覆盖本项目的原创代码。第三方素材（品牌标记、字体）的归属与再分发责任见
[docs/ASSET_POLICY.md](docs/ASSET_POLICY.md)。
