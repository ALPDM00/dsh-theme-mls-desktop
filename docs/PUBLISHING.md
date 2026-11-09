# 发布到 npm registry

> 这一页给维护者：怎么把 `dsh-theme-mls-desktop` 发布到 npm，以及**为什么发布后
> 其他人更新会变简单**。安装/使用说明在 [README](../README.md) 与 [INSTALL.md](INSTALL.md)；
> 本页不重复。

---

## 一、结论先说：发了 npm 之后更新是怎么变简单的

DSH 的插件管理器（`@deepseek-ai/dsh-plugin-manager`）对**从 registry 安装、且用自己的
包名**装进来的插件，提供两件事（`updateRefusal()` 的判定条件）：

| 能力 | 内部实现 | 用户看到什么 |
| --- | --- | --- |
| 发现新版本 | `listVersions()` → `pnpm view <name> versions time dist-tags` | bundle 列表里出现「可更新」和新版本号 |
| 一键更新 | `updateBundle()` → 先校验目标版本（存在、声明 `dsh.bundle`、兼容当前 DSH），再原地替换 | 点更新即可；**安装失败会回滚旧版本** |

所以只要包在 registry 上、用户按包名安装，以后每次发版他们点一下就能升级，
不用再下载 tarball、解压、覆盖、手改 `bundles`。

反过来，**`link:` / GitHub tarball / 手工拷目录** 装进来的包没有「registry 来源」记录，
插件管理器不会替它更新 —— 主题设置页里那个「可更新」小圆点/横幅就是给这些用户兜底的
（它读 npm 的 `latest`，只提示、不自动装）。

本包的现状（`package.json` 里已配好）：

- 包名：`dsh-theme-mls-desktop`（**未加 scope**，registry 上 0.6.11 发布时查过 404，可用）；
- `publishConfig.registry = https://registry.npmjs.org/`、`access = public`；
- `prepublishOnly`：发布前自动跑 `node scripts/build.cjs`，保证 `client.js` 与 `src/` 同步；
- `files` 是白名单（约 1.1 MB 解压 / 410 KB tarball，40 来个文件），
  **不包含** `src/`、`scripts/`、`check.cjs`、测试与本机的 `shell-patch/.target.json` / 日志。

---

## 二、一次性准备：npm 账号与登录

1. 在 <https://www.npmjs.com/signup> 注册并**验证邮箱**（没验证不能发布）。
2. 强烈建议在账号设置里开 **2FA**（发布时会要 6 位 OTP；CI 用 Automation token 绕过）。
3. 在本机登录（npm 9+ 支持浏览器登录）：

   ```powershell
   npm.cmd login --auth-type=web
   npm.cmd whoami          # 应打印你的 npm 用户名
   ```

   > 本机 PowerShell 执行策略会拦 `npm.ps1`（报「禁止运行脚本」），所以命令都写成
   > `npm.cmd`。`dsh` 也有同样的问题，见 [INSTALL.md](INSTALL.md) 第〇节。

登录状态存在 `%USERPROFILE%\.npmrc`（**不要**把含 token 的 `.npmrc` 提交进仓库）。

---

## 三、首次发布（一次性）

先干跑一遍，确认内容与体积没问题：

```powershell
cd D:\PythonCode\ma\dsh-theme-mls-desktop213
npm.cmd publish --dry-run
```

输出会列出将上传的文件与 `name@version`。确认无误后正式发：

```powershell
npm.cmd publish
# 开了 2FA 会提示 OTP；也可以 npm.cmd publish --otp=123456
```

成功后验证：

```powershell
npm.cmd view dsh-theme-mls-desktop version       # 应等于 package.json 的版本
npm.cmd view dsh-theme-mls-desktop dist-tags     # latest 指向刚发的版本
```

> 版本号一旦发布就不能复用。`0.6.10` 已存在于 git 历史但没上 npm，
> 所以首次 npm 发布用 **0.6.11**（带 npm 发布配置与 npm 优先的更新检查）。

发完把这次的改动提交、打 `v0.6.11` tag 并推送（CI 发现该版本已在 registry 上会跳过发布，
不会红）。

---

## 四、以后每次发版的顺序（重要）

`client.js` 里的 `PLUGIN_VERSION` 是构建时从 `package.json` 注入的，所以**先改版本、再构建、
最后提交/打 tag/发布**，否则 git tag 里的产物会和 npm 上的不是同一份：

```powershell
cd D:\PythonCode\ma\dsh-theme-mls-desktop213

# ① 改版本（不自动 commit/tag）
npm.cmd version patch --no-git-tag-version      # 修 bug 用 patch；新功能用 minor

# ② 改代码 + 写 CHANGELOG

# ③ 构建 + 回归（构建会刷新 client.js 里注入的版本号）
npm.cmd run build
node check.cjs                                  # 静态校验
node .generated/check-doc-links.cjs             # README/docs 相对链接
node .generated/verify-run.cjs                  # 浏览器回归（需要本机 Chrome/Edge）

# ④ 提交 + 打 tag
git add -A
git commit -m "v0.6.12: <一句话>"
git tag v0.6.12

# ⑤ 发布 —— 二选一：
#    a) 手动发（首次、或想盯着输出）：
npm.cmd publish
#    b) 或者只推 tag，让 GitHub Actions 发（见第五节）：
git push origin main --follow-tags

# ⑥ 推送仓库与 tag（用 ⑤a 手动发过的话，再推 tag；CI 发现版本已在 registry 会跳过）
git push origin main --follow-tags
```

发完做一次**干净环境冒烟**（不要用 `link:` 的开发目录）：

```powershell
npm.cmd pack dsh-theme-mls-desktop@latest
# 解压 tarball，按 docs/INSTALL.md 第一节「不走插件管理器」装进一个测试 profile，
# 或直接在插件管理器里装 npm 上的这个版本，然后重启桌面端。
```

### 预发布 / 回滚

- 预发布：`npm.cmd publish --tag beta`（`beta` 不会顶掉 `latest`，用户要显式装 `@beta`）。
- 发现坏版本：`npm.cmd deprecate dsh-theme-mls-desktop@0.6.12 "原因"`（推荐），
  再发一个修好的 patch。`npm unpublish` 只有发布后 72 小时内、且没人依赖时才可用，
  不要把它当回滚手段。
- 撤销 latest 指向：`npm.cmd dist-tag add dsh-theme-mls-desktop@0.6.11 latest`。

---

## 五、GitHub Actions 自动发布（可选，推荐）

仓库里有 `.github/workflows/publish.yml`：**推送 `v*` tag 时**自动 `npm publish`。
一次性配置：

1. 在 npm 生成 **Granular Access Token**：Access Tokens → Generate New Token →
   Permissions 选 `Read and write`、只勾这个包；**Bypass 2FA 选开启**（CI 没人输 OTP）。
2. 打开 GitHub 仓库 → Settings → Secrets and variables → Actions → New repository secret，
   名字填 `NPM_TOKEN`，值粘贴 token。
3. 之后发版只要 `git push origin v0.6.12`，工作流会在 Ubuntu 上 checkout、build、发布
   （tag 与 `package.json` 版本不一致会直接失败；该版本已在 registry 上则跳过发布）。

> token 只放 GitHub Secret，别写进仓库；泄露了就立刻在 npm 上 revoke。
> 包目前是 unscoped：任何人都能创建 `@scope/dsh-theme-mls-desktop` 这种**同名但不同 scope**
> 的包冒充，README 里已经写死「认准 `npm view dsh-theme-mls-desktop`」，
> 若以后想更强归属，可以迁到 `@alpd/...`（代价是要改 `cordis.patch.yml` 与用户的 `bundles` 里
> 的包名，属于破坏性变更，非必要不做）。

---

## 六、发布前的检查清单（照抄）

- [ ] npm 已登录（`npm.cmd whoami`），账号邮箱已验证、2FA 可用
- [ ] `package.json` 版本比 registry 上最新版大（`npm.cmd view ... version`）
- [ ] `CHANGELOG.md` 写了这一版的原因与验证结论
- [ ] `npm.cmd run build` 后 `client.js` 有预期变化（或明确「无变化」）
- [ ] `node check.cjs`、`check-doc-links.cjs`、`verify-run.cjs` 全绿
- [ ] 壳补丁动过就再跑一遍（这两条在干净安装上做，或先 `--app` 指向一个复制出来的安装目录）：
      `node shell-patch/tests.cjs`（0.6.12 起 20 项）、`node shell-patch/doctor.cjs`
      （读当前安装：`state`、三个文件的修订、文档结构、与 `.bak` 的差异字节）
- [ ] `npm.cmd publish --dry-run` 的文件清单不含本机状态（`.target.json` / `*.log` / 测试文件），
      也不含 `docs/ISSUE_REPLIES-*.md`（议题回复草稿，由 `files` 里的
      `!docs/ISSUE_REPLIES-*.md` 排除），且包含 `shell-patch/doctor.cjs`
      （`files` 白名单里的 `shell-patch/{…,doctor,…}.cjs`）
- [ ] `README.md` / `docs/` 里关于版本、安装、更新路径的表述与实际一致
- [ ] 资产政策：`assets/fonts/Maratype.otf` 是使用者提供的字体，
      **公开分发到 npm 之前**请按 [ASSET_POLICY.md](ASSET_POLICY.md) §3 三选一
      （已确认可再分发 / 换 OFL 字体 / 删掉它，构建会自动回落到 `ui-monospace, monospace`）
- [ ] 发完 `npm view` 校验版本与 dist-tags，并在干净环境装一次冒烟

---

## 七、常见错误

| 现象 | 原因 / 处理 |
| --- | --- |
| `E401 Unauthorized` | 没登录或 token 失效：`npm.cmd login --auth-type=web`，再 `whoami` |
| `E403 Forbidden` / 要 OTP | 开了 2FA：加 `--otp=<6 位>`，或改用 Automation token（CI） |
| `E403 You do not have permission to publish` | 包名已被别人占用 / 你的账号不在 maintainers 里；换 scope 或联系现维护者 |
| `EPUBLISHCONFLICT` / `cannot publish over the previously published version` | 版本号已存在；`npm.cmd version patch` 后重发 |
| `E404 Not Found`（发布时） | `publishConfig.registry` 与登录的 registry 不一致；用 `npm.cmd config get registry` 对齐 |
| 安装时报 `ERR_PNPM_IGNORED_BUILDS` | pnpm 拦了 `postinstall`（壳补丁那一步）。主题照常工作，加载钩子会兜底；想装完即生效就在插件管理器里批准构建，或在 profile 的 `pnpm-workspace.yaml` 里放行 |
| 用户装了却「看不到更新」 | 该用户是 `link:` / tarball / 手工拷装法 → 没有 registry 来源，插件管理器不列更新；让他按 [INSTALL.md](INSTALL.md) 第一节用包名重装 |
| `.npmignore` 里的排除规则没生效 | 有 `files` 白名单时 npm 不看 `.npmignore`；排除项要写进 `files` 的模式里（本包 `shell-patch/{apply,auto,doctor,inspect,patches,revert,target}.cjs` 就是这么写的） |
| 发布后 registry 上还是旧版 | npm 有分钟级缓存；`npm view ... version` 确认，别连续重复 publish |

---

## 八、用户侧怎么更新（可以直接抄进公告）

从 npm registry 安装（插件管理器里按包名 `dsh-theme-mls-desktop`）：

1. 设置 › 插件 → 找到 `dsh-theme-mls-desktop`，出现「可更新」时点更新；
2. 等它装完（失败会自动回滚旧版本），重启桌面端；
3. 如果这次发版改了壳补丁 revision，启动后跑一次
   `node shell-patch/auto.cjs --check`：显示 `STALE` 就 `--repair`，再重启一次。

从 GitHub / 手工安装的用户：

1. 主题设置页 nav 右上角出现小圆点 = 有新版；进主题设置点「检查更新」看版本号；
2. 重新 `npm.cmd pack dsh-theme-mls-desktop@latest` → 覆盖 `node_modules` 里的目录 → 重启；
3. 想以后都能一键更新，就按 [INSTALL.md](INSTALL.md) 第一节改成「插件管理器按包名安装」。
