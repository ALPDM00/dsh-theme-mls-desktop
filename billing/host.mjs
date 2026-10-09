/* billing/host.mjs —— 计费半边（内置在主题里，不再是一个独立插件）。
 *
 * 这一半做的事情：
 *   1. **逐笔计价**：订阅宿主 `session/event`，按 (turn, step) 折叠真实 usage，
 *      用 `step/end.time` 定峰谷档；轮次的用时来自 `turn/start` … `turn/end`，
 *      在 `turn/end` 之后**冻住**（界面上的「运行时间」要的是「这轮任务跑了多久」）。
 *   2. **账本**：日账 + 会账落在 `$DSH_HOME/storages/mls-billing-ledger.json`，原子写、防抖。
 *   3. **只读 HTTP**：`/dsh-mls-billing/state`、`/health`、`POST /balance/refresh`，
 *      全部带同源/回环栅栏。**没有** /client.js —— 界面就在主题自己的 client.js 里。
 *
 * 与主题其余部分的关系：主题的 index.js（CJS）在 apply() 里动态 import 本文件，
 * 于是计费逻辑与主题同生共死：主题被禁用，计费也一起停，不残留路由与定时器。
 *
 * 设计边界（与之前独立包时相同）：
 *   · 不引入任何 `@deepseek-ai/dsh-*` 运行时依赖，宿主的兼容闸门对我们无话可说；
 *   · 需要宿主服务一律 `ctx.get(...)`，缺了只是「没有余额」，绝不拦住 apply；
 *   · 任何异常都不向外抛，计费半边永远不能拖住宿主启动或卸载。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createFold } from './fold.mjs'
import {
  loadLedger, markSessionStart, prune, recordUsage, saveLedger, saveTurns, touch,
} from './ledger.mjs'
import {
  PEAK_HOURS, PRICE_REVISION, beijingParts, bucketKey, costOf, isPeakTime,
  nextPeakChangeAt, summarizeBuckets,
} from './pricing.mjs'

/** DSH 主目录：用户数据（账本）放这里，而不是 node_modules 里（升级会被清）。 */
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
/** 账本路径（环境变量可覆盖，便于开发与测试）。 */
const LEDGER_FILE = process.env.DSH_MLS_BILLING_LEDGER
  || path.join(DSH_HOME, 'storages', 'mls-billing-ledger.json')
/** 路由前缀（`WebRoute.kind === 'prefix'`）。 */
export const ROUTE_PREFIX = '/dsh-mls-billing'
/** 账本防抖落盘间隔。 */
const SAVE_DEBOUNCE_MS = 2000
/** 余额缓存 TTL 与单次请求超时。 */
const BALANCE_TTL_MS = 60_000
const BALANCE_TIMEOUT_MS = 8_000
/** 失败时的短重试间隔：启动那一刻账号/凭据服务常常还没就绪，别把失败缓存一分钟。 */
const BALANCE_RETRY_MS = 10_000
/** `/state` 里每会话保留的最近轮次数。 */
const STATE_TURNS = 20
/** 从持久化日志回填时的超时：回填是"锦上添花"，绝不能把 /state 拖死。 */
const BACKFILL_TIMEOUT_MS = 8000

/** 北京时间日期串（账本按北京日切分，与官方账单一致）。 */
function beijingDay(timeMs) {
  return beijingParts(timeMs).day
}

/** 给一个 promise 加超时。 */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

/** 判断请求是否来自回环地址（localhost / *.localhost / 127.0.0.0/8 / ::1）。 */
function isLoopbackHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[/u, '').replace(/\]$/u, '')
  if (!host) return false
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::1') return true
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(host)
  if (!match) return false
  if (Number(match[1]) !== 127) return false
  return [match[2], match[3], match[4]].every((part) => Number(part) <= 255)
}

/**
 * 请求栅栏：非回环 Host 必须显式声明在 `DSH_MLS_BILLING_TRUSTED_HOSTS`，
 * 且任何情况都拒绝跨站标记与不同源的 Origin。
 * @returns {number|null} null=放行，否则应回的状态码。
 */
function fence(req, write = false) {
  try {
    const headers = (req && req.headers) || {}
    let url = null
    try {
      url = new URL('http://' + String(headers.host || ''))
    } catch {
      return 403
    }
    const trusted = String(process.env.DSH_MLS_BILLING_TRUSTED_HOSTS || '')
      .split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean)
    const authority = url.host.toLowerCase()
    const hostname = url.hostname.toLowerCase()
    const listed = trusted.some((entry) => (entry.includes(':') ? entry === authority : entry === hostname))
    if (!isLoopbackHostname(hostname)) {
      if (!listed) return 403
      if (write) return 403
    }
    const site = String(headers['sec-fetch-site'] || '').toLowerCase()
    if (site === 'cross-site') return 403
    const origin = headers.origin
    if (typeof origin === 'string' && origin && origin !== 'null') {
      let originUrl = null
      try {
        originUrl = new URL(origin)
      } catch {
        return 403
      }
      if (originUrl.host.toLowerCase() !== authority) return 403
    }
    return null
  } catch {
    return 403
  }
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(text),
  })
  res.end(text)
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > 65536) {
        req.destroy()
        resolve('')
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(''))
  })
}

/**
 * 挂上计费半边。
 * @param {object} root - 主题 Host 半边的 ctx。
 * @param {{log?:(level:string,text:string)=>void}} [options]
 */
export function applyBilling(root, options = {}) {
  const log = options.log || ((level, text) => {
    try {
      const method = level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'log'
      console[method]('[mls-billing] ' + text)
    } catch { /* 忽略 */ }
  })

  const fold = createFold()
  const state = {
    startedAt: Date.now(),
    lastActiveSessionId: null,
    lastTurn: null,
    lastError: null,
    lastBalanceError: null,
    balance: { at: 0, value: null },
    ledgerError: null,
    saveTimer: null,
    dirty: false,
  }

  // ── 账本 ──────────────────────────────────────────────────────────────
  const loaded = loadLedger(LEDGER_FILE, PRICE_REVISION)
  const ledger = loaded.ledger
  state.ledgerError = loaded.error
  if (loaded.error) log('warn', `账本读取失败，已从空账本开始：${loaded.error}`)
  fold.hydrateSessions(ledger.sessions)

  function saveNow() {
    state.dirty = false
    if (state.saveTimer) {
      clearTimeout(state.saveTimer)
      state.saveTimer = null
    }
    try {
      prune(ledger, undefined, undefined)
    } catch (error) {
      state.ledgerError = String((error && error.message) || error)
    }
    const result = saveLedger(LEDGER_FILE, ledger)
    if (!result.ok) {
      state.ledgerError = result.error
      log('warn', `账本写入失败：${result.error}`)
    } else {
      state.ledgerError = null
    }
  }

  function markDirty() {
    state.dirty = true
    if (state.saveTimer) return
    state.saveTimer = setTimeout(() => {
      state.saveTimer = null
      saveNow()
    }, SAVE_DEBOUNCE_MS)
    if (typeof state.saveTimer.unref === 'function') state.saveTimer.unref()
  }

  /**
   * 把某个会话的**逐轮**快照同步进账本。
   *
   * 只在轮次边界（turn/start · assistant/message · step/end · turn/end）调用 ——
   * `session/event` 对每个流式 chunk 都会触发，每次同步就太密了。
   * `turn/end` 有时**没有结算单**（最后一步的结算发生在 step/end），但它正好是
   * 「这一轮用时冻住」的那一刻，所以必须在这里也同步。
   * @returns {boolean} 内容变了就返回 true（由调用方决定落盘）。
   */
  function syncTurns(sessionId) {
    try {
      // peekSession（只读）而不是 sessionSlot：后者会把「没有账的空轮次」也建出一个会话，
      // 于是干净地被拒绝的一轮会在 /state 里长出一条 ¥0.00 的小结。
      const slot = fold.peekSession(sessionId)
      if (!slot) return false
      return saveTurns(ledger, sessionId, slot.turns.values())
    } catch (error) {
      state.ledgerError = String((error && error.message) || error)
      return false
    }
  }

  // ── 结算落账 ──────────────────────────────────────────────────────────
  function applySettlement(settlement) {
    if (!settlement) return
    const at = Number(settlement.at) || Date.now()
    const day = beijingDay(at)
    const key = bucketKey(settlement.model, settlement.peak)
    try {
      recordUsage(ledger, { day, sessionId: settlement.sessionId, key, tokens: settlement.tokens })
      markSessionStart(ledger, settlement.sessionId, at)
      touch(ledger, at, settlement.sessionId)
      markDirty()
    } catch (error) {
      state.ledgerError = String((error && error.message) || error)
      log('warn', `记账失败：${state.ledgerError}`)
    }
    const priced = costOf(settlement.tokens, settlement.model, at)
    state.lastActiveSessionId = settlement.sessionId
    state.lastTurn = {
      sessionId: settlement.sessionId,
      turn: settlement.turn,
      step: settlement.step,
      at,
      model: settlement.model,
      peak: settlement.peak,
      priced: priced.priced,
      tokens: settlement.tokens,
      cost: priced.cost,
      currency: priced.currency,
      interrupted: settlement.interrupted,
    }
  }

  // ── 快照 ──────────────────────────────────────────────────────────────
  function withMoney(row) {
    const money = summarizeBuckets(row.buckets)
    const { buckets, ...rest } = row
    return { ...rest, ...money }
  }

  function buildState() {
    const now = Date.now()
    const today = beijingDay(now)
    const foldSnapshot = fold.snapshot()
    const sessions = foldSnapshot.sessions
      .slice()
      .sort((a, b) => b.lastAt - a.lastAt)
      .map((slot) => ({
        ...withMoney(slot),
        turns: (slot.turns || []).slice(0, STATE_TURNS).map(withMoney),
      }))
    // `current`：优先"最近一次结算过的那个会话"；刚重启（还没有任何结算）时退回
    // **最近活动**的那个 —— sessions 已按 lastAt 倒序，所以就是第一个。
    const current = sessions.find((slot) => slot.sessionId === state.lastActiveSessionId)
      || sessions[0]
      || null
    const dayRow = ledger.days[today] || null
    const recentDays = Object.keys(ledger.days).sort().slice(-14).map((day) => ({
      day,
      requests: ledger.days[day].requests,
      lastAt: ledger.days[day].lastAt,
      ...summarizeBuckets(ledger.days[day].buckets),
    }))
    return {
      plugin: 'dsh-theme-mls-desktop',
      part: 'billing',
      version: 2,
      priceRevision: PRICE_REVISION,
      startedAt: state.startedAt,
      now,
      peak: {
        isPeak: isPeakTime(now),
        peakHours: PEAK_HOURS,
        nextChangeAt: nextPeakChangeAt(now),
        beijing: beijingParts(now),
      },
      today: dayRow
        ? { day: today, requests: dayRow.requests, lastAt: dayRow.lastAt, ...summarizeBuckets(dayRow.buckets) }
        : { day: today, requests: 0, lastAt: 0, cost: 0, currency: 'CNY', unpriced: [], byModel: [], totals: summarizeBuckets({}).totals },
      recentDays,
      sessions,
      current,
      lastTurn: state.lastTurn,
      runtime: {
        sessionElapsedMs: current && current.firstAt ? Math.max(0, now - current.firstAt) : 0,
        pluginElapsedMs: Math.max(0, now - state.startedAt),
        streaming: foldSnapshot.pendingSteps > 0,
      },
      balance: state.balance.value,
      events: foldSnapshot.events,
      pendingSteps: foldSnapshot.pendingSteps,
      errors: { ledger: state.ledgerError, balance: state.lastBalanceError },
    }
  }

  // ── 余额 ──────────────────────────────────────────────────────────────
  function clientMetadata() {
    return {
      version: String(process.env.DSH_CLIENT_VERSION || process.env.DSH_VERSION || '') || 'unknown',
      locale: String(process.env.DSH_LOCALE || '') || 'zh_CN',
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    }
  }

  async function balanceFromAccount(ctx) {
    let account = null
    try {
      account = typeof ctx.get === 'function' ? ctx.get('deepseekAccount') : null
    } catch {
      account = null
    }
    if (!account || typeof account.getBalance !== 'function') {
      return { ok: false, code: 'NO_ACCOUNT_SERVICE', error: '当前 DSH 没有账号服务' }
    }
    let result = null
    try {
      result = await account.getBalance(clientMetadata())
    } catch (error) {
      return { ok: false, code: 'ACCOUNT_CALL_FAILED', error: String((error && error.message) || error).slice(0, 160) }
    }
    if (!result) return { ok: false, code: 'NOT_SIGNED_IN', error: '未登录 DeepSeek 账号（没有账号凭据）' }
    if (result.status !== 'ready') return { ok: false, code: 'ACCOUNT_NOT_READY', error: `账号余额接口未就绪（${String(result.status || 'unknown')}）` }
    const list = (value) => (Array.isArray(value) ? value : []).filter((wallet) => wallet && Number.isFinite(Number(wallet.balance)))
    const normal = list(result.value)
    const bonus = list(result.bonusWallets)
    const all = normal.concat(bonus)
    if (all.length === 0) {
      return { ok: false, code: 'NO_WALLET', error: normal.length || bonus.length ? '钱包字段不可用' : '账号没有余额钱包' }
    }
    const currencyOf = (wallet) => String((wallet && wallet.currency) || 'CNY').toUpperCase()
    const nonzero = all.filter((wallet) => Number(wallet.balance) > 0)
    const picked = nonzero.find((wallet) => currencyOf(wallet) === 'CNY') || nonzero[0]
      || all.find((wallet) => currencyOf(wallet) === 'CNY') || all[0]
    const currency = currencyOf(picked)
    const sumOf = (wallets) => wallets
      .filter((wallet) => currencyOf(wallet) === currency)
      .reduce((total, wallet) => total + Number(wallet.balance), 0)
    const recharge = sumOf(normal)
    const bonusTotal = sumOf(bonus)
    return {
      ok: true,
      total: Number((recharge + bonusTotal).toFixed(6)),
      recharge: Number(recharge.toFixed(6)),
      bonus: Number(bonusTotal.toFixed(6)),
      currency,
      source: 'account',
    }
  }

  async function balanceFromApiKey(ctx) {
    let key = null
    try {
      const credentials = typeof ctx.get === 'function' ? ctx.get('credentials') : null
      if (!credentials || typeof credentials.resolve !== 'function') {
        return { ok: false, code: 'NO_CREDENTIALS_SERVICE', error: '当前 DSH 没有凭据服务' }
      }
      key = await credentials.resolve('DEEPSEEK_API_KEY')
    } catch {
      return { ok: false, code: 'NO_API_KEY', error: '未配置 DEEPSEEK_API_KEY' }
    }
    if (!key) return { ok: false, code: 'NO_API_KEY', error: '未配置 DEEPSEEK_API_KEY' }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), BALANCE_TIMEOUT_MS)
    try {
      const response = await fetch('https://api.deepseek.com/user/balance', {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        signal: controller.signal,
      })
      if (!response.ok) return { ok: false, code: 'BALANCE_HTTP_' + response.status, error: `余额接口返回 ${response.status}` }
      const body = await response.json()
      const infos = Array.isArray(body && body.balance_infos) ? body.balance_infos : []
      if (infos.length === 0) return { ok: false, code: 'NO_BALANCE_INFO', error: '余额接口没有返回钱包' }
      const pick = infos.find((info) => info && info.currency === 'CNY' && Number(info.total_balance) > 0)
        || infos.find((info) => Number(info.total_balance) > 0)
        || infos.find((info) => info && info.currency === 'CNY')
        || infos[0]
      return {
        ok: true,
        total: Number(pick.total_balance),
        recharge: Number.isFinite(Number(pick.topped_up_balance)) ? Number(pick.topped_up_balance) : null,
        bonus: Number.isFinite(Number(pick.granted_balance)) ? Number(pick.granted_balance) : null,
        currency: String(pick.currency || 'CNY').toUpperCase(),
        available: body.is_available !== false,
        source: 'api-key',
      }
    } catch (error) {
      const aborted = error && (error.name === 'AbortError' || error.code === 'ABORT_ERR')
      return { ok: false, code: aborted ? 'BALANCE_TIMEOUT' : 'BALANCE_FETCH_FAILED', error: aborted ? '余额请求超时' : String((error && error.message) || error).slice(0, 160) }
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * 取余额。成功缓存 60s；**失败只缓存 10s** —— 插件加载那一刻账号服务常常还没就绪，
   * 把「没有账号服务」按成功 TTL 缓存一分钟，界面上就是一分钟都读不到余额。
   */
  async function refreshBalance(ctx, force = false) {
    const now = Date.now()
    const value = state.balance.value
    if (!force && value) {
      const ttl = value.ok ? BALANCE_TTL_MS : BALANCE_RETRY_MS
      if (now - state.balance.at < ttl) return value
    }
    const account = await balanceFromAccount(ctx)
    const result = account.ok ? account : await balanceFromApiKey(ctx)
    const next = result.ok
      ? { ok: true, ...result, updatedAt: new Date(now).toISOString() }
      : {
        ok: false,
        code: account.code || 'UNKNOWN',
        error: `${account.error || '账号余额不可用'}；API key 路：${result.error || '不可用'}`,
        updatedAt: new Date(now).toISOString(),
      }
    state.balance = { at: now, value: next }
    state.lastBalanceError = next.ok ? null : next.error
    return next
  }

  /** 后台预热余额；`/state` 不阻塞等它。 */
  function primeBalance(ctx) {
    refreshBalance(ctx, false).catch(() => {})
  }

  // ── 装配 ──────────────────────────────────────────────────────────────
  const disposers = []
  root.effect(() => () => {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose()
      } catch { /* 卸载路径不抛 */ }
    }
    try {
      if (state.dirty) saveNow()
    } catch { /* 忽略 */ }
  })

  try {
    root.inject(['webServer'], (ctx) => {
      disposers.push(ctx.on('session/event', (session, event) => {
        try {
          const sessionId = session && session.id ? String(session.id) : 'default'
          for (const settlement of fold.ingest(sessionId, event, isPeakTime)) applySettlement(settlement)
          // 轮次边界上把逐轮数据同步进账本（含 turn/end —— 那一刻「本轮用时」才冻住）
          if (event && (event.type === 'turn/start' || event.type === 'turn/end'
            || event.type === 'step/end' || event.type === 'assistant/message')) {
            if (syncTurns(sessionId)) markDirty()
          }
        } catch (error) {
          log('warn', `事件折叠失败：${String((error && error.message) || error)}`)
        }
      }))

      disposers.push(ctx.on('session/disposed', (session) => {
        try {
          const sessionId = session && session.id ? String(session.id) : 'default'
          for (const settlement of fold.dispose(sessionId, isPeakTime)) applySettlement(settlement)
          if (syncTurns(sessionId)) markDirty()
        } catch { /* 忽略 */ }
      }))

      disposers.push(ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: async (req, res) => {
          let url = null
          try {
            url = new URL(req.url || '/', 'http://localhost')
          } catch {
            sendJson(res, 400, { ok: false, error: 'bad url' })
            return
          }
          const sub = url.pathname.slice(ROUTE_PREFIX.length) || '/'
          const method = String(req.method || 'GET').toUpperCase()
          const rejected = fence(req, method !== 'GET' && method !== 'HEAD')
          if (rejected !== null) {
            sendJson(res, rejected, { ok: false, error: 'forbidden' })
            return
          }
          try {
            if (method === 'GET' && (sub === '/state' || sub === '/')) {
              // 客户端把"它正在显示的那个会话"带过来（`?session=<id>`）。若这段对话
              // 还没有逐轮数据（本功能上线前就跑过的轮次），就地回填一次再返回 ——
              // 于是"重启后当前这段对话"也能立刻贴上纸条。
              const wanted = url.searchParams.get('session')
              if (wanted) {
                try {
                  await backfillSession(wanted)
                } catch { /* 静默：回填失败不影响快照 */ }
              }
              // 顺手把过期的余额在后台换掉，前端下一次轮询就能看到新值
              const stale = state.balance.value
                ? Date.now() - state.balance.at > (state.balance.value.ok ? BALANCE_TTL_MS : BALANCE_RETRY_MS)
                : true
              if (stale) primeBalance(ctx)
              sendJson(res, 200, buildState())
              return
            }
            if (method === 'GET' && sub === '/backfill') {
              // 供排查用：显式回填一个会话，返回结果
              const wanted = url.searchParams.get('session')
              const done = wanted ? await backfillSession(wanted) : false
              sendJson(res, 200, { ok: true, session: wanted, backfilled: done })
              return
            }
            if (method === 'GET' && sub === '/health') {
              sendJson(res, 200, {
                ok: true,
                plugin: 'dsh-theme-mls-desktop',
                part: 'billing',
                ledger: LEDGER_FILE,
                ledgerError: state.ledgerError,
                balanceError: state.lastBalanceError,
                events: fold.snapshot().events,
              })
              return
            }
            if (method === 'POST' && sub === '/balance/refresh') {
              await readBody(req)
              sendJson(res, 200, await refreshBalance(ctx, true))
              return
            }
            sendJson(res, 404, { ok: false, error: 'not found' })
          } catch (error) {
            state.lastError = String((error && error.message) || error)
            try {
              sendJson(res, 500, { ok: false, error: state.lastError })
            } catch { /* 响应可能已经开始 */ }
          }
        },
      }))

      primeBalance(ctx)
      log('info', `计费半边已就绪（账本 ${LEDGER_FILE}，接口 ${ROUTE_PREFIX}/state）`)

      // ── 回填：从 DSH 自己的持久化后端重放会话日志 ────────────────────────
      //   只存"以后的轮次"是不够的：纸张挂在**已经渲染出来的轮次**上，而本功能
      //   上线之前跑过的那些轮次从来没有逐轮数据（用户实测："重启后刚刚的对话没有纸条，
      //   另一个工具区里新跑的却有"）。所以这里用 `ctx.sessionPersistence.readFrom()`
      //   把日志重放一遍 —— **走 DSH 自己的服务**，不碰磁盘格式（JSONL/zstd 怎么编码
      //   由后端决定），只借它的 `readFrom(id, fromSeq)`。
      //   一次会话只试一次；失败/超时都静默（纸条是锦上添花，不能拖慢 /state）。
      const backfillTried = new Set()

      async function backfillSession(sessionId) {
        const id = String(sessionId || '')
        if (!id || backfillTried.has(id)) return false
        const existing = fold.peekSession(id)
        if (existing && existing.turns.size > 0) return false      // 已经有逐轮数据，无需回填
        const persistence = typeof ctx.get === 'function' ? ctx.get('sessionPersistence') : null
        if (!persistence || typeof persistence.readFrom !== 'function') return false
        backfillTried.add(id)
        try {
          const read = await withTimeout(persistence.readFrom(id, 0), BACKFILL_TIMEOUT_MS)
          const events = read && Array.isArray(read.events) ? read.events : []
          if (events.length === 0) return false
          const replay = createFold()
          for (const event of events) replay.ingest(id, event, isPeakTime)
          const replayed = replay.snapshot().sessions.find((row) => row.sessionId === id)
          if (!replayed || !Array.isArray(replayed.turns) || replayed.turns.length === 0) return false

          // 账本里连会话行都没有（插件上线前就存在的对话）：把重放出来的存量也建上，
          // 否则 saveTurns 无处可写，回填结果一出重启就没了。
          if (!ledger.sessions[id]) {
            ledger.sessions[id] = {
              sessionId: id,
              requests: replayed.requests || 0,
              firstAt: replayed.firstAt || 0,
              lastAt: replayed.lastAt || 0,
              buckets: { ...(replayed.buckets || {}) },
              turns: {},
            }
          }
          fold.installTurns(id, replayed.turns)
          const slot = fold.peekSession(id)
          if (slot && !slot.requests) {
            slot.requests = replayed.requests || 0
            slot.firstAt = replayed.firstAt || 0
            slot.lastAt = replayed.lastAt || 0
            if (Object.keys(slot.buckets).length === 0) slot.buckets = { ...(replayed.buckets || {}) }
          }
          if (slot && saveTurns(ledger, id, slot.turns.values())) markDirty()
          log('info', `已从持久化日志回填 ${replayed.turns.length} 轮（${id}）`)
          return true
        } catch (error) {
          log('warn', `回填失败（${id}）：${String((error && error.message) || error)}`)
          return false
        }
      }
    })
  } catch (error) {
    log('warn', `webServer 注入失败：${String((error && error.message) || error)}`)
  }

  try {
    root.on('dispose', () => {
      try {
        if (state.dirty) saveNow()
      } catch { /* 忽略 */ }
    })
  } catch { /* 宿主可能不支持该事件 */ }

  return { buildState, saveNow }
}
