# 组成、构建与自测

> 这一页原本是 README 里的一节，为公开仓库拆出来独立成页；内容与主线一致，
> 交叉引用已改成文件链接。返回 [README](../README.md)。

## 组成

```
├── index.js                宿主半侧：预插件期样式注入 + 透明帧规则 + 挂载计费半侧
├── client.js               构建产物（浏览器半侧，勿手改）
├── cordis.patch.yml        bundle 挂载声明
├── src/
│   ├── client.template.js  主题本体模板（唯一手写的大文件，含每轮结算块）
│   └── boot/
│       ├── boot.css        启动动画样式 + 揭幕时间线（单一真相源）
│       ├── boot.html       启动动画 DOM
│       ├── engine-intro.js 启动编排：绿鲸鱼先行 / 透明窗口 / 原生按钮交接
│       └── engine-marathon.js  marathon 阶段动画引擎
├── assets/                 字体与启动图（构建时 base64 内联成 `__IMG_*_B64__`）
│                           `invert-blue-pixel.png` 仍在使用：`boot.html` 的
│                           反转蓝 logo 闪烁那一拍读它
├── billing/                ★ 计费半侧（见 [docs/BILLING.md](BILLING.md)）
│   ├── host.mjs            装配：session 事件 → 逐笔结算 → 账本 → /dsh-mls-billing/*
│   ├── fold.mjs            会话事件 → 逐笔结算单（含每轮的用时）
│   ├── pricing.mjs         DeepSeek 分时价目表 + 峰谷判定 + 汇总计价
│   └── ledger.mjs          日账 / 会账、原子写、容错读
├── scripts/build.cjs       组装 client.js
├── shell-patch/            ★ 桌面 shell 补丁（见第 3 节）
│   ├── target.cjs          安装目录发现 + 便宜的状态探测（不解包）
│   ├── auto.cjs            ★ 自动化入口：该打才打、并发加锁、失败不阻塞安装
│   ├── apply.cjs           真正的补丁应用（解包 / 改 / 重打包 / 逐字节校验 / 提交）
│   ├── revert.cjs          从 pristine 备份还原
│   ├── lib/real-fs.cjs     Electron 的 `original-fs`：绕开 asar 包装而**不动全局开关**
│   ├── lib/asar.cjs        零依赖 asar 读写（Pickle 头 / 打包 / 解包）
│   └── patches.cjs         补丁条目 + 修订摘要（单一真相源）
└── assets/                 启动图像与字体（构建时 base64 内联）
```

## 构建与自测

```bash
npm run build         # src/* -> client.js（产物，请勿直接编辑）
npm run patch:check   # 这台机器上的桌面壳现在是什么状态（不改任何文件）
npm run patch:revert  # 用 pristine 备份还原 app.asar
```

> 开发期的静态校验、jsdom 测试与像素复核脚本（`check.cjs` / 本机自检 / `test/` 等）
> **不随本仓库发布**（见 README「仓库内容」）。本机保留着它们，用来守住契约、锚点与动画的
> 几何/时间线；其中静态校验的每条守卫都有对应的**变异反证**（把源码改坏，确认守卫真的会红），
> 所以"守卫绿"是有意义的。改动 `src/` 之后**必须**跑一次 `npm run build`。
