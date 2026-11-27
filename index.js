// dsh-theme-mls-desktop — Host-side half.
//
// The theme itself is Client-side: every token, every rule and every animation
// lands from `client.js`. This Host half owns exactly three things, all of them
// about the interval *before* the theme's client bundle exists.
//
// 1. The **pre-plugin interval**.
//
//    Between the first paint and the moment the client bundle runs, DSH paints
//    its own boot screen (the "HARNESS" wordmark, a spinning arc and
//    "Loading plugins…"). No client plugin can reach that: it is already on
//    screen before any plugin bundle is fetched. This half clears it through the
//    webserver's structured index-injection seam (`webserver/index-inject`),
//    i.e. one `<style>` row in the served index.html <head> — earlier than every
//    stylesheet and every plugin, so there is no unstyled first frame and
//    nothing to flash.
//
// 2. The **transparent cold-start frame** (Desktop only).
//
//    The Desktop shell builds its main window with `transparent: true` (see
//    `shell-patch/`). For the desktop to actually show through, nothing on the
//    page may paint an opaque background — including DSH's own shells, which
//    normally sit on an opaque surface. This row keeps `html`, `body` and
//    `#root` see-through while `html[data-mar-boot]` is set; the client half sets
//    that attribute for the duration of the boot animation and removes it
//    afterwards, at which point the app's normal palette returns. The attribute
//    is also honoured during the pre-plugin interval, so the very first frame
//    after window creation is already transparent.
//
// 3. The **shell patch step** (Desktop only).
//
//    The window's alpha, the caption buttons and "opens maximized" cannot be
//    done from a page, so they are written into the shell's `app.asar` by
//    `shell-patch/`. Asking a user to run that by hand was the last manual step
//    in installing this theme; `scheduleShellPatch()` below removes it. See
//    `shell-patch/auto.cjs` for the whole contract.
//
// The theme keeps the `mar-` namespace it was built with: it is a naming choice
// inside one package, not a second identity to maintain.
//
// Everything stays inside our own package: no node_modules patch, no host file
// edit, nothing to redo when the Harness version moves.

const name = 'dsh-theme-mls-desktop'

/** Void colour of the fixed Marathon palette (`--mar-bg-void`). */
const VOID = '#0B0D0B'

/** 场景背景的资产路由前缀（客户端 src/scene/engine-scene.js 硬编码同一个值）。 */
const SCENE_ROUTE = '/dsh-mls-scene'

/**
 * Style row injected into the served index.html <head>.
 *
 * - The boot plate is **recoloured, not removed**. The loading state then reads
 *   as the page's own background, so the native screen has nothing left to show.
 * - Its content is hidden **only while it still carries the native spinner**
 *   (`[data-dsh-boot-spinner]` is DSH's own loading marker and is dropped from
 *   the card when the boot fails). A real plugin-load failure therefore still
 *   paints its "Failed to load plugins" card: the theme silences the animation
 *   without silencing the error.
 * - `html,body` carry the void colour as well, so the frame right after the
 *   plate is disposed cannot flash the default light canvas.
 * - In the transparent window the void colour is only a **fallback** for a stock
 *   Desktop build or the browser: on the desktop it is overridden while
 *   `html[data-mar-boot]` is present, which is exactly the boot interval.
 */
const NATIVE_BOOT_CSS = [
  'html,body{background:' + VOID + '}',
  '[data-dsh-boot]:has([data-dsh-boot-spinner]){background:' + VOID + '!important}',
  '[data-dsh-boot]:has([data-dsh-boot-spinner]) > *{display:none!important}',
  'html[data-mar-boot],html[data-mar-boot] body,html[data-mar-boot] #root{background:transparent!important}',
].join('')

/**
 * Ask the shell patcher to run, if this installation still needs it.
 *
 * Four of the things this theme promises happen before or outside the page and
 * therefore live in the shell's `app.asar` -- the window's own alpha, the native
 * caption buttons vanishing during boot, a non-opaque first frame, and the
 * window opening maximized. `shell-patch/apply.cjs` writes them; the problem this
 * function removes is that a user had to know to run it.
 *
 * Shape of the deal:
 *   - The state is read with `probeShell()`, which pulls just the three patched
 *     files out of the archive header. No extract, no repack, a few milliseconds.
 *   - Work is only started when the shell is genuinely stock. A shell already
 *     carrying this revision is left untouched; a shell carrying an *older*
 *     revision is reported and not guessed about (that means a Desktop update
 *     landed, and the repair is `--repair`, which restores the pristine archive
 *     first -- a human's call, because it discards any other edits).
 *   - It runs in a **detached child**, because patching extracts and repacks a
 *     109 MiB archive and plugin activation is not the place to spend 40 seconds.
 *   - It is skipped entirely unless this process is running *from inside* the
 *     installation. A `dsh web` session on a machine that also has the Desktop
 *     installed must not start rewriting that archive.
 *   - `DSH_THEME_AUTO_PATCH=0` turns all of it off, and nothing here can stop the
 *     plugin from loading: every failure path returns quietly.
 *
 * The effect lands on the *next* start, since the shell being patched is the one
 * already running. That is why `package.json` also carries a `postinstall` hook:
 * an install that runs lifecycle scripts is already patched before the first
 * launch, and this hook is the net for the installers that do not.
 * @param {object} ctx - Host context; used only for logging when available.
 */
function scheduleShellPatch(ctx) {
  const log = (text) => {
    if (ctx && ctx.logger && typeof ctx.logger.info === 'function') ctx.logger.info(text)
    else if (ctx && typeof ctx.log === 'function') ctx.log(text)
    else console.log('[theme-mls-desktop] ' + text)
  }
  if (process.env.DSH_THEME_AUTO_PATCH === '0') {
    log('shell patch: skipped (DSH_THEME_AUTO_PATCH=0)')
    return
  }
  let target
  let auto
  // Everything below loads third-party (ours) code into the Host process, so it
  // must not be able to change process-wide runtime state on the way in. The one
  // that bites is `process.noAsar`: with Electron's asar wrapper switched off,
  // the Host can no longer read the runtime it was launched from, and startup
  // dies with "1 required plugin did not activate" (2026-09-28). The library no
  // longer does that -- see shell-patch/lib/real-fs.cjs -- and this snapshot is
  // the belt to that pair of braces, so a future edit that reintroduces the
  // switch is neutralised instead of taking the whole shell down.
  const noAsarBefore = process.noAsar
  try {
    // Both are plain relative requires: `shell-patch/` ships inside the package
    // (`files` in package.json), so there is no install step to depend on. The
    // patcher itself is deliberately only *resolved*, never required: requiring
    // `auto.cjs` would start a patch run inside the Host.
    target = require('./shell-patch/target.cjs')
    auto = require.resolve('./shell-patch/auto.cjs')
  } catch (error) {
    log('shell patch: unavailable in this build (' + (error && error.code) + ')')
    return
  } finally {
    if (process.noAsar !== noAsarBefore) {
      process.noAsar = noAsarBefore
      log('shell patch: restored process.noAsar (a loader in shell-patch/ changed it)')
    }
  }
  let found
  try {
    found = target.resolveApp({})
  } catch (error) {
    log('shell patch: could not resolve the Desktop installation (' + (error && error.message) + ')')
    return
  }
  if (found.app === null) {
    // Two very different situations share this branch: "no Desktop on this
    // machine / a browser-only profile", which is normal and silent, and "a path
    // was asserted and it is not a usable installation", which the user needs to
    // hear about because nothing else will tell them.
    if (typeof found.reason === 'string') {
      log('shell patch: could not resolve the Desktop installation (' + found.how + ': ' + found.reason + ')')
    }
    return
  }
  if (found.insideApp !== true) {
    log('shell patch: ' + found.app + ' found, but this process does not run from inside it — leaving it alone')
    return
  }
  let probe
  try {
    probe = target.probeShell(found.app)
  } catch (error) {
    log('shell patch: could not read the installed shell (' + (error && error.message) + ')')
    return
  }
  if (probe.state === 'current') return
  if (!target.needsPatch(probe.state)) {
    log('shell patch: the installed shell is "' + probe.state + '" — run `node shell-patch/auto.cjs --repair` to fix it')
    return
  }
  try {
    const { spawn } = require('node:child_process')
    const child = spawn(process.execPath, [auto], {
      // Flags cannot be passed here: `process.execPath` may be Electron running
      // as node, which rejects switches it does not recognise. The hook is
      // announced through the environment instead (see auto.cjs).
      env: { ...process.env, DSH_THEME_AUTO_HOOK: '1' },
      cwd: __dirname,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
    log('shell patch: the installed shell is stock — patching app.asar in the background; restart once it finishes')
  } catch (error) {
    log('shell patch: could not start the patcher (' + (error && error.message) + ')')
  }
}

/**
 * 计费半边（**内置在主题里**，不再是一个独立插件）。
 *
 * `billing/` 是 ESM（`.mjs`），而本文件是 CJS，所以这里用**动态 import** 把它挂上来；
 * 于是计费与主题同生共死：主题被禁用，路由、事件订阅与账本定时器一起拆掉。
 *
 * 为什么动态 import 而不是静态：主题的 Host 半边必须能在**任何**宿主上加载成功
 * （它还要负责清掉插件加载前的原生启动屏），计费半边是可选能力，
 * 它出问题只能是「没有计费」，绝不能变成「主题加载失败」。
 * @param ctx - Host context.
 * @param log - 与 scheduleShellPatch 共用的日志函数。
 */
function scheduleBilling(ctx, log) {
  import('./billing/host.mjs')
    .then((mod) => {
      mod.applyBilling(ctx, { log: (level, text) => log('billing: ' + text) })
    })
    .catch((error) => {
      log('billing: unavailable (' + String((error && error.message) || error) + ')')
    })
}

/**
 * 场景背景的几何资产路由（TAU CETI IV 星球线框）。
 *
 * `assets/scene/*.msc.gz` 是 `tools/build-scene.cjs` 的产物：官方 `.chunks` 里的
 * 线框几何经过"丢碎段 → 重编号 → int16 量化 → gzip"之后的二进制（格式见
 * docs/PLAN-SCENE-BACKGROUND.md §6）。它**不能**塞进 `client.js`：几 MB 二进制
 * 变成 base64 会把 668 KB 的客户端包撑到十几 MB。
 *
 * 所以走宿主路由：磁盘上是 `.msc.gz`，进程内解压一次并缓存，浏览器 `fetch` 拿到的
 * 就是可以直接 `new Int16Array(buf)` 的原始字节 —— 客户端连 `DecompressionStream`
 * 都不需要。前缀路由由宿主自己加鉴权（与 billing 的 `/dsh-mls-billing/*` 同一套），
 * 页面里的 same-origin fetch 带得上凭据。
 *
 * 文件名走白名单正则，路径拼接之外的任何输入都不信任（`..` 进不来）。
 * 路由随插件卸载一起撤销（`dispose`）。
 * @param ctx - Host context; `webServer` 服务可能比插件晚就绪，所以用 inject 等它。
 * @param log - 与 apply() 共用的日志函数。
 */
function registerSceneRoutes(ctx, log) {
  const path = require('node:path')
  const fs = require('node:fs')
  const zlib = require('node:zlib')
  const dir = path.join(__dirname, 'assets', 'scene')
  const cache = new Map()
  if (!fs.existsSync(dir)) {
    log('scene: assets/scene missing — run `node tools/build-scene.cjs`')
    return
  }
  ctx.inject(['webServer'], (wsCtx) => {
    const dispose = wsCtx.webServer.register({
      kind: 'prefix',
      path: SCENE_ROUTE,
      handler: (req, res) => {
        const file = String(req.url || '').split('?')[0]
          .replace(/^\/dsh-mls-scene\/?/, '')
        if (!/^[a-z]+\.msc$/.test(file)) {
          res.statusCode = 404
          res.end()
          return
        }
        const key = file.slice(0, -4)
        let buf = cache.get(key)
        if (!buf) {
          try {
            buf = zlib.gunzipSync(fs.readFileSync(path.join(dir, key + '.msc.gz')))
          } catch (error) {
            res.statusCode = 404
            res.end()
            return
          }
          cache.set(key, buf)
        }
        res.setHeader('Content-Type', 'application/octet-stream')
        res.setHeader('Content-Length', buf.length)
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        res.end(buf)
      },
    })
    if (typeof dispose === 'function') {
      wsCtx.on('dispose', () => {
        try {
          dispose()
        } catch {
          /* 卸载路径不抛 */
        }
      })
    }
  })
}

/**
 * Host activation. The webserver emits `webserver/index-inject` on every
 * index render and each listener pushes its current rows, so the table is
 * read fresh per response and unloading the plugin withdraws the row.
 * @param ctx - Host context carrying the webserver event.
 */
async function apply(ctx) {
  const log = (text) => {
    try {
      if (ctx && ctx.logger && typeof ctx.logger.info === 'function') ctx.logger.info(text)
      else if (ctx && typeof ctx.log === 'function') ctx.log(text)
      else console.log('[theme-mls-desktop] ' + text)
    } catch {
      /* ignore */
    }
  }
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'style', text: NATIVE_BOOT_CSS })
  })
  // 场景背景的几何数据：独立能力，挂不上只是"没有星球"，绝不能让主题加载失败。
  try {
    registerSceneRoutes(ctx, log)
  } catch (error) {
    log('scene: route unavailable (' + String((error && error.message) || error) + ')')
  }
  try {
    scheduleBilling(ctx, log)
  } catch (error) {
    // 计费半边是可选能力：它挂了也不能让主题加载失败。
    log('billing: unavailable (' + String((error && error.message) || error) + ')')
  }
  try {
    scheduleShellPatch(ctx)
  } catch (error) {
    // Never let a convenience become a load failure.
    try {
      if (ctx && ctx.logger && typeof ctx.logger.warn === 'function') ctx.logger.warn(String(error))
    } catch {
      /* ignore */
    }
  }
}

module.exports = { name, apply, scheduleBilling, NATIVE_BOOT_CSS, VOID, scheduleShellPatch }
