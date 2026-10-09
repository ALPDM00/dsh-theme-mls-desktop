# 资产政策 —— DSH 主题 · Marathon

> **一句话**：本主题**以**《失落星船：马拉松》(Marathon, Bungie)**为灵感**，
> **不含**任何 Bungie / Marathon 的版权素材、商标、官方美术或受保护字体。
> 每一个像素都由插件在运行时程序化生成。

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
| `Maratype.otf` | **用户提供**的装饰字体 | **须由用户自行厘清权利** —— 见 §3 |
| `design-language.md`、`README.md` | 本项目编写的文档 | MIT |

## 3. Maratype 字体 —— 责任边界

`Maratype.otf` 由**最终用户**为个人使用而提供。插件在构建时
（`scripts/build.cjs`）把它以 base64 data-URI 内联，因此运行时不发起任何网络请求。

- 插件作者**不主张**对 Maratype 的所有权；
- 若 Maratype **未**获准再分发，用户必须：
  1. 让它**不出现在任何公开分发**里（把 `assets/fonts/Maratype.otf` 排除在发布之外），或
  2. 换成自己有分发许可的字体（例如某个 OFL 字体），或
  3. 删掉字体、接受 `ui-monospace, monospace` 回落；
- 没有字体时构建照样成功：`@font-face` 只是解析到回落字体栈。

## 4. 发布与市场

提交到 `dsh-market` 时，条目必须声明本主题为 **`type: theme`** 并链接本政策。
审核方应确认：

- 未以 Bungie / Marathon 商标作为商店身份；
- 未打包任何版权媒体；
- 装饰字体的再分发权利由上传者负责。

## 5. 下架

若日后发现某项资产构成侵权，维护者会移除它并改发回落方案。
请在仓库里开 issue；14 天内响应。
