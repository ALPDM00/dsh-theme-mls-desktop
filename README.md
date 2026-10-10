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
- **主题设置页**：外观 / 背景动画 / 任务完成动画 / 每轮 Token 结算 四组，各自独立开关。
  见 [docs/SETTINGS.md](docs/SETTINGS.md)。
- **主题视觉**：主黑+绿 / 主白+绿 两套配色、全直角、HUD 角标、马赛克面板切换、视口转场 ——
  完整设计规则见 [docs/design-language.md](docs/design-language.md)。

## 安装

> ⚠️ **本插件会（可选地）修改你的桌面端安装**：把 `<install>/resources/app.asar` 打一个小补丁，
> 用来实现透明窗口、隐藏原生 caption 按钮、启动即最大化。补丁**只改这几个行为**、可一键还原、
> 用摘要识别版本，细节与安全模型见 [docs/SHELL-PATCH.md](docs/SHELL-PATCH.md)；
> 不想要它就别装（主题其余部分照常工作）。

> ⚠️ **`dsh plugin --profile desktop add …` 在较新的 dsh 上会被拒绝** —— 闸门在
> `@deepseek-ai/dsh/lib/bin.js`，对 `desktop` 一律报
> `error: profile "desktop" is managed exclusively by the Electron application`。
> 桌面端自带那份（0.2.0-rc.2）写的是 `if (!manageDesktopProfile) rejectElectronProfile(...)`，
> 而 `manageDesktopProfile` 是 `runCli()` 的函数参数、默认 `false`，**随包代码里没有任何地方
> 把它设成 `true`**；npm 全局那份（0.1.5-rc.1）则是无条件拒绝。所以下面第 ① 步能不能跑，
> 取决于你手上是哪份 dsh —— 完整对照、以及**不依赖 CLI 的全手工装法**见
> [docs/INSTALL.md](docs/INSTALL.md)。**第 ② 步无论走哪条路都必需。**

```bash
# ① 装插件本体（依赖、shell-patch/、client.js 全跟着进）
dsh plugin --profile desktop add github:ALPDM00/dsh-theme-mls-desktop
#    ⚠️ pnpm 会把本包的 postinstall 记成 "ignored build"（ERR_PNPM_IGNORED_BUILDS）
#       并让命令以退出码 1 结束 —— 依赖其实已经装好了，这不是失败。

# ② 让 desktop profile 真挂上这个 bundle
#    —— desktop profile 的 CLI 不会自己写 `bundles`（上游行为，不是本包能改的）
node -e "
  const fs = require('fs')
  const p = (process.env.DSH_HOME || '') + '/profiles/desktop/package.json'
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  j.dsh = j.dsh || {}; j.dsh.profile = j.dsh.profile || {}
  j.dsh.profile.bundles = Array.from(new Set([...(j.dsh.profile.bundles || []), 'dsh-theme-mls-desktop']))
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n')
"

# ③ 若壳补丁没自动打上，手工补一次
#    —— 目录不是标准安装位置时必须显式给 --app，否则它找不到你的壳
node node_modules/dsh-theme-mls-desktop/shell-patch/auto.cjs --app "<桌面端安装目录>"

# ④ 启动桌面端一次，关掉，再启动 —— 就能看到效果
```

第 ② 步为什么必需、`bundles` 里该写包名还是 `id`、以及装不上时怎么逐项查，都在
[docs/INSTALL.md](docs/INSTALL.md)。补丁的检查 / 还原：

```bash
npm run patch:check     # 只报告当前状态，不改任何东西
npm run patch:revert    # 用 pristine 备份还原 app.asar
```

## 设置

设置 ›「主题设置」，按功能分成四组（每组一个大标题，组内开关紧贴自己的参数）：

| 分组 | 内容 |
| --- | --- |
| **外观** | 配色：主黑 + 绿 / 主白 + 绿（互斥单选） |
| **背景动画** | 启用开关 + 点阵密度 + 呼吸速度（关掉时后两行变暗并禁用） |
| **任务完成动画** | 启用开关 + 完成文案 + 预览按钮 + 状态小字 |
| **每轮 Token 结算** | 启用开关 |

改这些设置存在 DSH 自己的设置存储里（主题名下的 `mar.*` 键），与页面端口无关。
每一项的默认值、边界情况与调参位置见 [docs/SETTINGS.md](docs/SETTINGS.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/INSTALL.md](docs/INSTALL.md) | 完整安装步骤、排错、以及"装好了却没反应"的逐项检查 |
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
