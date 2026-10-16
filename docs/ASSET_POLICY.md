# 资产政策 —— DSH 主题 · Marathon

> **一句话**：本主题**以**《失落星船：马拉松》(Marathon, Bungie)**为灵感**，
> **不含**任何 Bungie / Marathon 的官方截图、渲染图、音频、模型或受保护字体；
> 界面里每一个像素都由插件在运行时程序化生成 —— **唯一的例外**是设置页
> 「主题色」用的七张图形（`assets/factions/*.svg`：六个阵营标记 + 马拉松 LOGO），
> 它们是维护者手绘的矢量重绘，见 §2 与 §3。

## 1. 灵感 vs 抄袭

《Marathon》（Bungie 的游戏）在这里**只作为视觉参考**：配色气质、HUD 语汇、
栅格纪律、故障语言。本插件**不**复现以下任何东西：

- 不使用 Bungie / Marathon 拥有的截图、渲染图、logo 或图标；
- 不含游戏音频、视频、3D 模型；
- 不含提取或再分发的 Bungie 字体；
- 除描述性主题名 `dsh-theme-marathon` 外，不以任何商标名作为产品身份
  （它是给一个无关工具 deepseekHarness 做的、非商业的同人皮肤）。

## 2. 本插件实际随包发布的东西

| 资产 | 来源 | 许可 / 说明 |
| ---- | ---- | ----------- |
| `client.js`（生成物） | 本项目编写 | MIT |
| CSS（调色板 token、品牌点缀、启动覆盖层） | 在 `src/client.template.js` 里程序化生成 | MIT |
| 启动覆盖层 CSS（`src/boot/boot.css`） | 程序化 + base64 内联图；无版权素材 | MIT |
| 启动覆盖层图像（`assets/boot/green-logo.png`、`blue-pixel.png`、`invert-blue-pixel.png`） | 把 DeepSeek 公司品牌标记程序化重绘为 PNG，用于启动转场 | DeepSeek 品牌标记 —— 合理引用；**不是** Bungie / Marathon |
| ~~FUI 字符（准星、角标、数据牌）~~ | 已于 2026-09-18 随铭牌层一起移除 | MIT |
| `Maratype.otf` | 启动覆盖层的装饰字体，**由维护者随包分发**，以保证所有人渲染一致 | 见 §3（权利与下架承诺） |
| `assets/factions/*.svg`（赛博艾克米 / 阿拉克尼 / 纽卡洛里 / 特莱克斯 / 米达 / 关口 / 马拉松LOGO） | 设置页「主题色」那排色块的图案。**维护者手绘的矢量重绘**（纯几何路径 + 卡角刻线）：六个阵营符号 + 默认色那格用的马拉松 LOGO；构建时（`scripts/build.cjs`）URL-encode 成 data URI 内联进 `client.js` | 指向 Bungie《Marathon》的符号 —— **合理引用的同人重绘，不是提取自游戏的美术**；与字体同一条下架承诺（见 §3）。想排掉就删 `assets/factions/` 并重新构建（那排色块会退回纯色填充） |
| `design-language.md`、`README.md` | 本项目编写的文档 | MIT |

## 3. Maratype 字体与阵营标记 —— 随包分发与下架承诺

`Maratype.otf` 是启动覆盖层用的装饰字体，**由维护者直接放进本仓库随包分发**
（`assets/fonts/Maratype.otf`），这样每个装到这个主题的人看到的启动动画都一致。
插件在构建时（`scripts/build.cjs`）把它以 base64 data-URI 内联，因此运行时不发起任何网络请求。

`assets/factions/*.svg`（六个阵营标记）同样是**维护者手绘的矢量重绘**，在设置页
「主题色」里充当七个色块的图案。构建时按 `data-accent` 生成一条规则、URL-encode 成
`data:image/svg+xml` 就地内联，运行时同样不发起网络请求。

对这两项的共同态度：

- 维护者不对 Maratype 主张任何所有权，也不声称自己签发了它的再分发许可；
  阵营标记是对 Bungie《Marathon》阵营符号的**同人重绘**，维护者同样不主张权利；
- **若你享有其中任何一项的权利并认为这里的再分发不妥**，请在仓库里开 issue，
  维护者会在 14 天内移除它并改发回落方案（见 §5）；
- 移掉字体后**构建照样成功**：`@font-face` 只会解析到回落字体栈 `ui-monospace, monospace`，
  启动覆盖层的版式不受影响（只是字面不同）；
- 移掉阵营标记后**构建照样成功**：那六个色块退回纯色填充（`--sw`），
  默认色 `#C0FE04` 本来就一直是纯色 —— 想自己排掉就删 `assets/factions/`。
- 想自己排掉它：删掉 `assets/fonts/Maratype.otf`（并把它从 `package.json` 的 `files` 里去掉）。

## 4. 发布与市场

提交到 `dsh-market` 时，条目必须声明本主题为 **`type: theme`** 并链接本政策。
审核方应确认：

- 未以 Bungie / Marathon 商标作为商店身份；
- 未打包任何版权媒体；
- 装饰字体的再分发权利由上传者负责。

## 5. 下架

若日后发现某项资产构成侵权，维护者会移除它并改发回落方案。
请在仓库里开 issue；14 天内响应。
