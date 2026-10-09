import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * 计费 Host 半边的装配测试。
 *
 * 现在它**内置在主题里**（`billing/host.mjs`），所以这里是直接驱动 `applyBilling`，
 * 不再经过主题的 `index.js`（那半边还要管原生启动屏与 shell patch，属于另一组测试）。
 * 账本路径必须在 import 之前给出：模块级常量读环境变量。
 */
const LEDGER = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mls-host-')), 'ledger.json')
process.env.DSH_MLS_BILLING_LEDGER = LEDGER

const { applyBilling, ROUTE_PREFIX } = await import('../billing/host.mjs')
const { beijingParts, isPeakTime } = await import('../billing/pricing.mjs')

const PEAK = Date.UTC(2026, 9, 8, 2, 0, 0) // 北京时间 2026-10-08 10:00（周四高峰）
const EVENT_DAY = beijingParts(PEAK).day

function event(type, data, time = PEAK) {
  return { type, seq: 1, time, data }
}

function makeRoot(services = {}) {
  const listeners = new Map()
  const routes = []
  const effects = []
  const root = {
    logger: { info() {}, warn() {}, error() {} },
    get(name) { return services[name] ?? null },
    on(name, fn) {
      const list = listeners.get(name) || []
      list.push(fn)
      listeners.set(name, list)
      return () => {
        const at = list.indexOf(fn)
        if (at >= 0) list.splice(at, 1)
      }
    },
    effect(fn) { effects.push(fn()) },
    inject(_deps, callback) {
      callback({
        webServer: { register(route) { routes.push(route); return () => {} } },
        get: root.get,
        on: root.on,
      })
    },
  }
  return {
    root,
    routes,
    fire(name, ...args) {
      for (const fn of listeners.get(name) || []) fn(...args)
    },
    dispose() {
      for (const cleanup of effects.splice(0)) cleanup()
    },
  }
}

function fresh(services = {}) {
  fs.rmSync(LEDGER, { force: true })
  return makeRoot(services)
}

function makeRes() {
  const record = { status: 0, headers: null, body: '' }
  return {
    record,
    writeHead(status, headers) { record.status = status; record.headers = headers },
    end(text) { record.body = text ?? '' },
  }
}

async function callRoute(routes, url, options = {}) {
  const route = routes[0]
  assert.ok(route, '路由未注册')
  const res = makeRes()
  const req = {
    url,
    method: options.method || 'GET',
    headers: { host: '127.0.0.1:19387', ...(options.headers || {}) },
    on(name, fn) { if (name === 'end') fn() },
    destroy() {},
  }
  await route.handler(req, res)
  let json = null
  try {
    json = JSON.parse(res.record.body)
  } catch { /* 非 JSON */ }
  return { ...res.record, json }
}

function dayRow(state, day) {
  return (state.recentDays || []).find((row) => row.day === day) || null
}

test('applyBilling 注册带栅栏的 /state 与 /health，且不再暴露 /client.js', async () => {
  const ctx = fresh()
  applyBilling(ctx.root, { log() {} })
  assert.equal(ctx.routes.length, 1)
  assert.equal(ctx.routes[0].kind, 'prefix')
  assert.equal(ctx.routes[0].path, ROUTE_PREFIX)
  assert.equal(ROUTE_PREFIX, '/dsh-mls-billing')

  // 界面已经内置在主题的 client.js 里，所以没有 /client.js 这条路
  assert.equal((await callRoute(ctx.routes, '/dsh-mls-billing/client.js')).status, 404)

  const health = await callRoute(ctx.routes, '/dsh-mls-billing/health')
  assert.equal(health.json.ok, true)
  assert.equal(health.json.plugin, 'dsh-theme-mls-desktop')
  assert.equal(health.json.part, 'billing')
  assert.equal(health.json.ledger, LEDGER)
  ctx.dispose()
})

test('session/event 折叠 → 本轮小结算（费用、四桶、用时、closed）', async () => {
  const ctx = fresh()
  applyBilling(ctx.root, { log() {} })
  const session = { id: 's-turn-1' }
  const t0 = PEAK
  const t1 = PEAK + 96_000 // 这一轮跑了 96 秒

  ctx.fire('session/event', session, event('turn/start', { turn: 3 }, t0))
  ctx.fire('session/event', session, event('request/header', {
    header: { config: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } },
  }, t0))
  ctx.fire('session/event', session, event('step/start', { turn: 3, step: 1 }, t0))
  ctx.fire('session/event', session, event('assistant/message', {
    turn: 3, step: 1, message: {}, usage: { inputTokens: 1e6, outputTokens: 1e6, cacheReadTokens: 1e6 },
  }, t0))
  ctx.fire('session/event', session, event('step/end', { turn: 3, step: 1 }, t1 - 1000))

  // 还没 turn/end：这一轮不算结束，界面不该给它贴纸条
  let state = (await callRoute(ctx.routes, '/dsh-mls-billing/state')).json
  let turn = state.current.turns.find((row) => row.turn === 3)
  assert.equal(turn.closed, false)
  assert.equal(turn.cost, 10.04) // 高峰：未命中 2 + 输出 8 + 命中 0.04
  assert.equal(turn.durationMs, 95_000) // 未结束 → 按最后一次用量算到现在
  assert.equal(turn.totals.total, 3e6)

  ctx.fire('session/event', session, event('turn/end', { turn: 3, reason: { kind: 'success' } }, t1))
  state = (await callRoute(ctx.routes, '/dsh-mls-billing/state')).json
  turn = state.current.turns.find((row) => row.turn === 3)
  assert.equal(turn.closed, true, 'turn/end 之后这一轮就是「已结束」')
  assert.equal(turn.durationMs, 96_000, '用时 = turn/start … turn/end，之后冻住')
  assert.equal(turn.startedAt, t0)
  assert.equal(turn.endedAt, t1)
  assert.equal(dayRow(state, EVENT_DAY).requests, 1)
  assert.equal(state.lastTurn.turn, 3)
  assert.equal(state.lastTurn.cost, 10.04)
  ctx.dispose()
})

test('没有用量的空轮次不会长出一条 ¥0.00 的小结', async () => {
  const ctx = fresh()
  applyBilling(ctx.root, { log() {} })
  const session = { id: 's-empty' }
  ctx.fire('session/event', session, event('turn/start', { turn: 1 }, PEAK))
  ctx.fire('session/event', session, event('turn/end', { turn: 1, reason: { kind: 'rejected' } }, PEAK + 500))
  const state = (await callRoute(ctx.routes, '/dsh-mls-billing/state')).json
  assert.equal(state.current, null, '没有任何用量 → 没有当前会话')
  assert.equal(state.sessions.length, 0)
  ctx.dispose()
})

test('未定价模型单列，且这一轮标明它是兜底价', async () => {
  const ctx = fresh()
  applyBilling(ctx.root, { log() {} })
  const session = { id: 's-unpriced' }
  ctx.fire('session/event', session, event('request/context', { provider: 'local', model: 'my-local-model' }, PEAK))
  ctx.fire('session/event', session, event('turn/start', { turn: 1 }, PEAK))
  ctx.fire('session/event', session, event('assistant/message', { turn: 1, step: 1, usage: { inputTokens: 1e6 } }, PEAK))
  ctx.fire('session/event', session, event('step/end', { turn: 1, step: 1 }, PEAK))
  ctx.fire('session/event', session, event('turn/end', { turn: 1, reason: { kind: 'success' } }, PEAK + 1000))
  const state = (await callRoute(ctx.routes, '/dsh-mls-billing/state')).json
  assert.deepEqual(dayRow(state, EVENT_DAY).unpriced, ['my-local-model'])
  const turn = state.current.turns[0]
  assert.deepEqual(turn.unpriced, ['my-local-model'])
  assert.equal(turn.byModel[0].priced, false)
  ctx.dispose()
})

test('同源/回环栅栏：非回环 Host、跨站标记、跨源 Origin、非回环写接口一律 403', async () => {
  const ctx = fresh()
  applyBilling(ctx.root, { log() {} })
  assert.equal((await callRoute(ctx.routes, '/dsh-mls-billing/state', { headers: { host: 'evil.example.com' } })).status, 403)
  assert.equal((await callRoute(ctx.routes, '/dsh-mls-billing/state', { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
  assert.equal((await callRoute(ctx.routes, '/dsh-mls-billing/state', { headers: { origin: 'http://evil.example.com' } })).status, 403)
  assert.equal((await callRoute(ctx.routes, '/dsh-mls-billing/balance/refresh', {
    method: 'POST', headers: { host: 'evil.example.com' },
  })).status, 403)
  assert.equal((await callRoute(ctx.routes, '/dsh-mls-billing/state')).status, 200)
  ctx.dispose()
})

test('余额：没有账号/凭据服务时返回带两条原因的失败而不是抛', async () => {
  const ctx = fresh()
  applyBilling(ctx.root, { log() {} })
  const result = await callRoute(ctx.routes, '/dsh-mls-billing/balance/refresh', { method: 'POST' })
  assert.equal(result.status, 200)
  assert.equal(result.json.ok, false)
  assert.equal(result.json.code, 'NO_ACCOUNT_SERVICE')
  assert.match(result.json.error, /API key 路/)
  ctx.dispose()
})

test('余额：账号服务可用时充值 + 赠送一起算', async () => {
  const account = {
    getBalance() {
      return { status: 'ready', value: [{ currency: 'CNY', balance: 3.5 }], bonusWallets: [{ currency: 'CNY', balance: 1.25 }] }
    },
  }
  const ctx = fresh({ deepseekAccount: account })
  applyBilling(ctx.root, { log() {} })
  const result = await callRoute(ctx.routes, '/dsh-mls-billing/balance/refresh', { method: 'POST' })
  assert.equal(result.json.ok, true)
  assert.equal(result.json.source, 'account')
  assert.equal(result.json.total, 4.75)
  assert.equal(result.json.recharge, 3.5)
  assert.equal(result.json.bonus, 1.25)
  ctx.dispose()
})

test('余额失败只缓存 10s：下一次刷新不会因为"启动时账号服务还没就绪"而一直读不到', async () => {
  const services = {}
  const ctx = fresh(services)
  applyBilling(ctx.root, { log() {} })
  const first = await callRoute(ctx.routes, '/dsh-mls-billing/balance/refresh', { method: 'POST' })
  assert.equal(first.json.ok, false)
  // 服务在启动之后才出现（真实情形：applyBilling 跑得比账号服务早）
  services.deepseekAccount = {
    getBalance() { return { status: 'ready', value: [{ currency: 'CNY', balance: 7.5 }], bonusWallets: [] } },
  }
  const cached = await callRoute(ctx.routes, '/dsh-mls-billing/state')
  assert.equal(cached.json.balance.ok, false, '失败在 10s 内仍走缓存')
  const forced = await callRoute(ctx.routes, '/dsh-mls-billing/balance/refresh', { method: 'POST' })
  assert.equal(forced.json.ok, true)
  assert.equal(forced.json.total, 7.5)
  ctx.dispose()
})

test('重启后**当前这段对话的每一轮**都还在（纸条不必等下一轮才出现）', async () => {
  const ctx = fresh()
  applyBilling(ctx.root, { log() {} })
  const session = { id: 's-turns' }
  const t0 = PEAK
  const t1 = PEAK + 96_000
  ctx.fire('session/event', session, event('turn/start', { turn: 5 }, t0))
  ctx.fire('session/event', session, event('request/header', { header: { config: { model: 'deepseek-v4-flash' } } }, t0))
  ctx.fire('session/event', session, event('assistant/message', {
    turn: 5, step: 1, message: {}, usage: { inputTokens: 1e6, outputTokens: 1e6 },
  }, t0))
  ctx.fire('session/event', session, event('step/end', { turn: 5, step: 1 }, t1 - 1000))
  ctx.fire('session/event', session, event('turn/end', { turn: 5, reason: { kind: 'success' } }, t1))
  ctx.dispose()

  const saved = JSON.parse(fs.readFileSync(LEDGER, 'utf8'))
  assert.ok(saved.sessions['s-turns'].turns, '账本里应有逐轮数据')
  assert.equal(saved.sessions['s-turns'].turns['5'].startedAt, t0)
  assert.equal(saved.sessions['s-turns'].turns['5'].endedAt, t1)

  // 重启：一个新的宿主，没有任何事件 —— 逐轮数据必须已经在那儿
  const ctx2 = makeRoot()
  applyBilling(ctx2.root, { log() {} })
  const state = (await callRoute(ctx2.routes, '/dsh-mls-billing/state')).json
  const restored = state.sessions.find((row) => row.sessionId === 's-turns')
  assert.ok(restored, '会话应被回填')
  const turn = restored.turns.find((row) => row.turn === 5)
  assert.ok(turn, '逐轮数据应被回填（这是"重启后纸条不见了"的修复点）')
  assert.equal(turn.closed, true)
  assert.equal(turn.durationMs, 96_000, '用时在重启后仍然是冻结的那个值')
  assert.equal(turn.startedAt, t0)
  assert.equal(turn.endedAt, t1)
  assert.equal(turn.cost, 10) // 高峰 Flash：未命中 2 + 输出 8
  assert.equal(turn.totals.total, 2e6)
  assert.equal(state.current.sessionId, 's-turns', 'current 也指向这段对话')
  ctx2.dispose()
})

test('空轮次不写逐轮数据，也不会凭空建出会话', async () => {
  const ctx = fresh()
  applyBilling(ctx.root, { log() {} })
  const session = { id: 's-empty-turns' }
  ctx.fire('session/event', session, event('turn/start', { turn: 1 }, PEAK))
  ctx.fire('session/event', session, event('turn/end', { turn: 1, reason: { kind: 'rejected' } }, PEAK + 500))
  const state = (await callRoute(ctx.routes, '/dsh-mls-billing/state')).json
  assert.equal(state.sessions.length, 0)
  ctx.dispose()
  const saved = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, 'utf8')) : { sessions: {} }
  assert.equal(saved.sessions['s-empty-turns'], undefined)
})

test('本功能上线前跑过的轮次：/state?session= 会从持久化日志回填', async () => {
  // 模拟一段"插件上线前就存在"的对话：账本里连会话行都没有，宿主折叠器里也没有它。
  const ctx = fresh({
    sessionPersistence: {
      async readFrom(id) {
        assert.equal(id, 's-legacy')
        return {
          meta: { id },
          events: [
            event('turn/start', { turn: 9 }, PEAK),
            event('request/header', { header: { config: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } } }, PEAK),
            event('step/start', { turn: 9, step: 1 }, PEAK),
            event('assistant/message', {
              turn: 9, step: 1, message: {}, usage: { inputTokens: 1e6, outputTokens: 1e6, cacheReadTokens: 1e6 },
            }, PEAK),
            event('step/end', { turn: 9, step: 1 }, PEAK + 95_000),
            event('turn/end', { turn: 9, reason: { kind: 'success' } }, PEAK + 96_000),
          ],
        }
      },
    },
  })
  applyBilling(ctx.root, { log() {} })

  // 不带 session 时看不到什么（这段对话在宿主里还不存在）
  let state = (await callRoute(ctx.routes, '/dsh-mls-billing/state')).json
  assert.equal(state.sessions.length, 0)

  // 客户端带着"我在显示哪个会话"来 —— 宿主回填一次再返回
  state = (await callRoute(ctx.routes, '/dsh-mls-billing/state?session=s-legacy')).json
  const restored = state.sessions.find((row) => row.sessionId === 's-legacy')
  assert.ok(restored, '回填后应出现这段对话')
  const turn = restored.turns.find((row) => row.turn === 9)
  assert.ok(turn, '回填后应带上那一轮')
  assert.equal(turn.closed, true)
  assert.equal(turn.durationMs, 96_000)
  assert.equal(turn.cost, 10.04) // 高峰 Flash：未命中 2 + 输出 8 + 命中 0.04

  // 回填结果会落进账本（下次重启不必再回放）
  ctx.dispose()
  const saved = JSON.parse(fs.readFileSync(LEDGER, 'utf8'))
  assert.ok(saved.sessions['s-legacy'], '账本里应补上这段对话的会话行')
  assert.equal(saved.sessions['s-legacy'].turns['9'].endedAt, PEAK + 96_000)

  // 再起一个宿主：这次直接从账本回填，不需要持久化服务
  // （用 makeRoot 而不是 fresh —— fresh 会把账本删掉，那是"干净首启"的语义）
  const ctx2 = makeRoot()
  applyBilling(ctx2.root, { log() {} })
  const state2 = (await callRoute(ctx2.routes, '/dsh-mls-billing/state')).json
  const again = state2.sessions.find((row) => row.sessionId === 's-legacy')
  assert.ok(again && again.turns.length === 1, '第二次重启不再依赖回放')
  assert.equal(again.turns[0].durationMs, 96_000)
  ctx2.dispose()
})

test('回填只对需要的会话做一次；失败静默', async () => {
  let calls = 0
  const ctx = fresh({
    sessionPersistence: {
      async readFrom() {
        calls++
        throw new Error('backend exploded')
      },
    },
  })
  applyBilling(ctx.root, { log() {} })
  const first = (await callRoute(ctx.routes, '/dsh-mls-billing/state?session=s-x')).json
  const second = (await callRoute(ctx.routes, '/dsh-mls-billing/state?session=s-x')).json
  assert.equal(calls, 1, '同一个会话只尝试一次')
  assert.equal(first.plugin, 'dsh-theme-mls-desktop')
  assert.equal(second.plugin, 'dsh-theme-mls-desktop')
  ctx.dispose()
})

test('没有持久化服务时，带 session 的 /state 照常返回（回填是可选能力）', async () => {
  const ctx = fresh()
  applyBilling(ctx.root, { log() {} })
  const state = (await callRoute(ctx.routes, '/dsh-mls-billing/state?session=s-none')).json
  assert.equal(state.plugin, 'dsh-theme-mls-desktop')
  assert.equal(state.sessions.length, 0)
  ctx.dispose()
})

test('卸载时落盘，重启后能读回来（本会话、首笔时刻）', async () => {
  const ctx = fresh()
  applyBilling(ctx.root, { log() {} })
  const session = { id: 's-persist' }
  ctx.fire('session/event', session, event('request/header', { header: { config: { model: 'deepseek-v4-pro' } } }, PEAK))
  ctx.fire('session/event', session, event('assistant/message', { turn: 2, step: 1, usage: { inputTokens: 1e6 } }, PEAK))
  ctx.fire('session/event', session, event('step/end', { turn: 2, step: 1 }, PEAK))
  ctx.dispose()

  assert.equal(fs.existsSync(LEDGER), true)
  const saved = JSON.parse(fs.readFileSync(LEDGER, 'utf8'))
  assert.equal(saved.days[EVENT_DAY].requests, 1)
  assert.equal(saved.sessions['s-persist'].requests, 1)
  assert.equal(saved.sessions['s-persist'].firstAt, PEAK)

  const ctx2 = makeRoot()
  applyBilling(ctx2.root, { log() {} })
  const state = (await callRoute(ctx2.routes, '/dsh-mls-billing/state')).json
  const restored = state.sessions.find((row) => row.sessionId === 's-persist')
  assert.equal(restored.requests, 1)
  assert.equal(restored.cost, 9) // Pro 高峰未命中价 9
  assert.equal(dayRow(state, EVENT_DAY).cost, 9)
  ctx2.dispose()
})

test('缺 webServer：applyBilling 不抛（计费是可选能力，绝不能拦住主题加载）', () => {
  const root = {
    logger: { info() {}, warn() {}, error() {} },
    get() { return null },
    on() { return () => {} },
    effect() {},
    inject() { throw new Error('service unavailable') },
  }
  assert.doesNotThrow(() => applyBilling(root, { log() {} }))
})

test('/state.peak 与「现在」同源', async () => {
  const ctx = fresh()
  applyBilling(ctx.root, { log() {} })
  const state = (await callRoute(ctx.routes, '/dsh-mls-billing/state')).json
  assert.equal(state.peak.isPeak, isPeakTime(state.now))
  assert.ok(state.peak.nextChangeAt > state.now)
  assert.equal(state.peak.beijing.day, beijingParts(state.now).day)
  assert.equal(state.today.day, beijingParts(state.now).day)
  ctx.dispose()
})
