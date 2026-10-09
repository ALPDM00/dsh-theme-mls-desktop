/* fold.js —— 会话事件 → 逐笔计费用量 的状态机。
 *
 * 输入是宿主 firehose `ctx.on('session/event', (session, event))` 里的 `event`，
 * 输出是**已结算的结算单**（settlement）：一笔真实用量的 token 四桶 + 模型 + 峰谷档。
 * 本模块不碰磁盘、不算钱（钱由 pricing.js 在读取时按桶算），所以它是纯内存、
 * 可被单测直接喂事件流验证。
 *
 * ── 为什么以「步」为单位 ──────────────────────────────────────────────
 * 一次 model call = 一个 step（`step/start` … `step/end`），真实 usage 挂在
 * `assistant/message.data.usage` 上。同一个 (turn, step) **替换而不是累加**：
 * 重试、取消后的补写、崩溃恢复补写的 step/end 都可能在同一个 (turn,step) 上
 * 再报一次，累加会把账算多。社区实现（token-billing / dsh-billing / usage-meter）
 * 一致的做法就是「先减后加」等价的「替换」，这里用 Map 的键天然实现。
 *
 * ── 结算时刻用谁 ──────────────────────────────────────────────────────
 * usage 先到（`assistant/message`），步边界后到（`step/end`）。峰谷档按**结算时刻**定，
 * 而 `step/end.time` 才是这一步真正结束的时刻（跨 09:00 / 12:00 / 14:00 / 18:00
 * 边界的步按结束时刻计价，与官方账单口径一致）。所以：
 *   · `assistant/message` 只登记 pending（记下 usage 与它自己的 time）；
 *   · `step/end` 用**自己的 event.time** 结算 pending；
 *   · `turn/end` 结算该轮还没等到 step/end 的残余（取消/崩溃），用 pending 上记的时刻。
 * 事件里的 `time` 是 epoch 毫秒（见 SessionEvent 类型定义），全程毫秒，不换算。
 */
import { bucketKey, emptyTokens, normalizeUsage } from './pricing.mjs'

/** 每个会话内存里保留的最近轮次数（用于「逐轮费用」）。 */
export const RETAIN_TURNS = 50

function stepKey(sessionId, turn, step) {
  return `${sessionId}\u0001${turn}\u0001${step}`
}

/** 轮次起点的键：`turn/start` 常常早于该轮的第一笔用量。 */
function turnKey(sessionId, turn) {
  return `${sessionId}\u0001turn\u0001${turn}`
}

/**
 * 建一个折叠器。
 * @returns {object} 折叠器实例。
 */
export function createFold() {
  /** @type {Map<string, object>} sessionId → 会话聚合 */
  const sessions = new Map()
  /** @type {Map<string, object>} `${sid}\u0001${turn}\u0001${step}` → 待结算用量 */
  const pending = new Map()
  /**
   * `turn/start` 记下的轮次起点。
   * **单独存**：`turn/start` 总是早于这一轮的第一笔用量，而轮次行只有在结算时才会建，
   * 所以把起点挂在"还不存在的行"上会丢。副作用是「没有用量的空轮次」不再建出会话/轮次
   * （干净的拒绝/空输入不该在界面上长出一个 ¥0.00 的小结）。
   * @type {Map<string, number>}
   */
  const turnStarts = new Map()
  /** @type {Map<string, {model:string, provider:string|null, turn:number, step:number}>} */
  const current = new Map()
  let events = 0

  function sessionSlot(sessionId) {
    const id = String(sessionId || 'default')
    let slot = sessions.get(id)
    if (!slot) {
      slot = {
        sessionId: id,
        requests: 0,
        firstAt: 0,
        lastAt: 0,
        model: '',
        provider: null,
        buckets: {},
        turns: new Map(),
      }
      sessions.set(id, slot)
    }
    return slot
  }

  function turnSlot(slot, turn) {
    let row = slot.turns.get(turn)
    if (!row) {
      // startedAt / endedAt 来自 turn/start 与 turn/end 两个边界事件，用来算**这一轮的用时**。
      // 界面上的「运行时间」要的是「这个任务跑了多久」，所以它必须在 turn/end 之后**冻住**。
      row = {
        turn,
        requests: 0,
        startedAt: Number(turnStarts.get(turnKey(slot.sessionId, turn))) || 0,
        endedAt: 0,
        lastAt: 0,
        model: '',
        buckets: {},
      }
      slot.turns.set(turn, row)
      if (slot.turns.size > RETAIN_TURNS) {
        const oldest = [...slot.turns.keys()].sort((a, b) => a - b).slice(0, slot.turns.size - RETAIN_TURNS)
        for (const key of oldest) slot.turns.delete(key)
      }
    }
    return row
  }

  /**
   * 结算一笔用量（就地累加进会话与轮聚合），并返回结算单。
   */
  function settle(record, atMs) {
    const slot = sessionSlot(record.sessionId)
    const model = record.model || slot.model || ''
    const peak = record.peak // 由调用方按 atMs 定档后写入
    const key = bucketKey(model, peak)
    const tokens = record.tokens

    slot.requests += 1
    slot.firstAt = slot.firstAt > 0 ? Math.min(slot.firstAt, atMs) : atMs
    slot.lastAt = Math.max(slot.lastAt, atMs)
    slot.model = model
    const scale = (buckets) => {
      const row = buckets[key] || (buckets[key] = emptyTokens())
      row.miss += tokens.miss
      row.hit += tokens.hit
      row.write += tokens.write
      row.out += tokens.out
    }
    scale(slot.buckets)

    const turn = turnSlot(slot, record.turn)
    turn.requests += 1
    // 没有 turn/start 的旧日志（或合成事件）也要有个起点，否则这一轮的用时会算成 0
    turn.startedAt = turn.startedAt > 0 ? Math.min(turn.startedAt, atMs) : atMs
    turn.lastAt = Math.max(turn.lastAt, atMs)
    turn.model = model
    scale(turn.buckets)

    return {
      sessionId: slot.sessionId,
      turn: record.turn,
      step: record.step,
      at: atMs,
      model,
      provider: record.provider || slot.provider || null,
      peak,
      tokens,
      interrupted: record.interrupted === true,
    }
  }

  /** 取出并清掉某个 (turn, step) 的 pending（保证同一笔只结算一次）。 */
  function takePending(sessionId, turn, step) {
    const key = stepKey(sessionId, turn, step)
    const record = pending.get(key)
    if (record) pending.delete(key)
    return record
  }

  /**
   * 喂一个会话事件。
   * @param {string} sessionId
   * @param {object} event - SessionEvent（`{type, seq, time, data}`）。
   * @param {(atMs:number)=>boolean} isPeak - 峰谷判定（注入进来便于单测定档）。
   * @returns {object[]} 本次产生的结算单（0 或 1 条）。
   */
  function ingest(sessionId, event, isPeak) {
    const id = String(sessionId || 'default')
    if (!event || typeof event !== 'object') return []
    events++
    const data = event.data && typeof event.data === 'object' ? event.data : {}
    const now = Number.isFinite(Number(event.time)) ? Number(event.time) : Date.now()

    switch (event.type) {
      case 'request/header': {
        const slot = sessionSlot(id)
        const config = data.header && data.header.config ? data.header.config : null
        if (config && config.model) slot.model = String(config.model)
        if (config && config.provider) slot.provider = String(config.provider)
        // 让「当前步」也吃到它：header 在派发之前写入，晚到的 usage 找不到更近的模型信息
        const cur = current.get(id) || { turn: -1, step: -1, model: '', provider: null }
        current.set(id, { ...cur, model: slot.model, provider: slot.provider })
        return []
      }
      case 'request/context': {
        const slot = sessionSlot(id)
        if (data.model) slot.model = String(data.model)
        if (data.provider) slot.provider = String(data.provider)
        const cur = current.get(id) || { turn: -1, step: -1, model: '', provider: null }
        current.set(id, { ...cur, model: slot.model, provider: slot.provider })
        return []
      }
      case 'turn/start': {
        // 只登记起点，**不建会话、也不建轮次**：一轮真正「有账」是从某一笔 usage 开始的，
        // 被拒绝/空输入就结束的轮次不该在界面上长出一个 ¥0.00 的小结。
        const turn = Number(data.turn) || 0
        turnStarts.set(turnKey(id, turn), now)
        const slot = sessions.get(id)
        const row = slot ? slot.turns.get(turn) : null
        if (row) row.startedAt = row.startedAt > 0 ? row.startedAt : now
        if (slot) current.set(id, { turn, step: 0, model: slot.model, provider: slot.provider })
        return []
      }
      case 'step/start': {
        const slot = sessionSlot(id)
        current.set(id, {
          turn: Number(data.turn) || 0,
          step: Number(data.step) || 0,
          model: slot.model,
          provider: slot.provider,
        })
        return []
      }
      case 'assistant/chunk': {
        // 流式 usage 只是**临时**读数：它不代表这一步已经结束，且官方在 ≥0.1.7-rc.2
        // 已把 usage chunk 并进 assistant/message。这里只记下用于界面「正在烧」的估算，
        // 不写账本 —— 计费只认 assistant/message 的最终 usage。
        return []
      }
      case 'assistant/message': {
        const tokens = normalizeUsage(data.usage)
        const turn = Number(data.turn) || 0
        const step = Number(data.step) || 0
        if (!data.usage) {
          // 没有 usage：不收费（adapter 没报账，凭空估一个数字比不显示更糟）
          return []
        }
        const slot = sessionSlot(id)
        pending.set(stepKey(id, turn, step), {
          sessionId: id,
          turn,
          step,
          model: slot.model,
          provider: slot.provider,
          tokens,
          at: now,
          interrupted: data.interrupted === true,
        })
        return []
      }
      case 'step/end': {
        const turn = Number(data.turn) || 0
        const step = Number(data.step) || 0
        const record = takePending(id, turn, step)
        if (!record) return []
        record.peak = isPeak(now)
        return [settle(record, now)]
      }
      case 'turn/end': {
        const turn = Number(data.turn) || 0
        const settlements = []
        for (const [key, record] of pending) {
          if (record.sessionId !== id || record.turn !== turn) continue
          pending.delete(key)
          record.peak = isPeak(record.at)
          settlements.push(settle(record, record.at))
        }
        // 冻住这一轮的用时：界面的「运行时间」读 endedAt - startedAt，此后不再增长
        const slot = sessions.get(id)
        const row = slot ? slot.turns.get(turn) : null
        if (row) {
          row.endedAt = now
          if (!(row.startedAt > 0)) row.startedAt = Math.min(row.lastAt || now, now)
        }
        turnStarts.delete(turnKey(id, turn))
        current.delete(id)
        return settlements
      }
      default:
        return []
    }
  }

  /** 丢掉一个会话的内存状态（`session/disposed`）。pending 里的残余先结算掉。 */
  function dispose(sessionId, isPeak) {
    const id = String(sessionId || 'default')
    const settlements = []
    for (const [key, record] of pending) {
      if (record.sessionId !== id) continue
      pending.delete(key)
      record.peak = isPeak(record.at)
      settlements.push(settle(record, record.at))
    }
    current.delete(id)
    return settlements
  }

  /**
   * 直接装上一批轮次数据（用于**回填**：从持久化日志重放出来的逐轮结果）。
   *
   * 只写 `turns`，**不碰**会话级聚合 —— 聚合是从账本回填的（跨重启的既有存量），
   * 把重放结果再累进去就是双重计数。
   * @param {string} sessionId
   * @param {Iterable<object>} turns - `{ turn, requests, startedAt, endedAt, model, buckets }`
   * @returns {number} 装完后这个会话的轮次数
   */
  function installTurns(sessionId, turns) {
    const slot = sessionSlot(sessionId)
    for (const turn of turns || []) {
      const number = Number(turn.turn)
      if (!Number.isFinite(number)) continue
      slot.turns.set(number, {
        turn: number,
        requests: Number(turn.requests) || 0,
        startedAt: Number(turn.startedAt) || 0,
        endedAt: Number(turn.endedAt) || 0,
        lastAt: Math.max(Number(turn.endedAt) || 0, Number(turn.lastAt) || 0, Number(turn.startedAt) || 0),
        model: String(turn.model || ''),
        buckets: { ...(turn.buckets || {}) },
      })
    }
    return slot.turns.size
  }

  /**
   * 从账本回填会话聚合**与逐轮数据**（重启后当前这段对话的每一轮也要有数字）。
   * @param {Record<string, object>} sessionsFromLedger - ledger.sessions
   */
  function hydrateSessions(sessionsFromLedger) {
    for (const [id, row] of Object.entries(sessionsFromLedger || {})) {
      const slot = sessionSlot(id)
      slot.requests = Number(row.requests) || 0
      slot.firstAt = Number(row.firstAt) || 0
      slot.lastAt = Number(row.lastAt) || 0
      slot.buckets = { ...(row.buckets || {}) }
      const model = Object.keys(slot.buckets)[0]
      if (model) slot.model = String(model).split('\u0001')[0]

      // 逐轮回填：纸条挂在**已经渲染出来的轮次**（[data-turn-tail]）上，
      // 没有这一步，DSH 重启后「当前这段对话」的每一轮都拿不到数字 ——
      // 用户实测："重新启动后该功能就不见了，重新对话可以正常显示"。
      const turns = row.turns && typeof row.turns === 'object' ? row.turns : {}
      for (const [key, turn] of Object.entries(turns)) {
        const number = Number(turn.turn)
        if (!Number.isFinite(number)) continue
        const buckets = { ...(turn.buckets || {}) }
        const turnModel = Object.keys(buckets)[0]
        const startedAt = Number(turn.startedAt) || 0
        const endedAt = Number(turn.endedAt) || 0
        slot.turns.set(number, {
          turn: number,
          requests: Number(turn.requests) || 0,
          startedAt,
          endedAt,
          lastAt: Math.max(endedAt, startedAt),
          model: turnModel ? String(turnModel).split('\u0001')[0] : '',
          buckets,
        })
      }
    }
  }

  /**
   * JSON 快照。**只给数据，不算钱** —— 钱由调用方用 summarizeBuckets 现算。
   * @returns {object}
   */
  function snapshot() {
    return {
      events,
      pendingSteps: pending.size,
      sessions: [...sessions.values()].map((slot) => ({
        sessionId: slot.sessionId,
        requests: slot.requests,
        firstAt: slot.firstAt,
        lastAt: slot.lastAt,
        model: slot.model,
        provider: slot.provider,
        buckets: { ...slot.buckets },
        turns: [...slot.turns.values()]
          .sort((a, b) => b.turn - a.turn)
          .map((row) => {
            const startedAt = Number(row.startedAt) || 0
            const endedAt = Number(row.endedAt) || 0
            return {
              turn: row.turn,
              requests: row.requests,
              startedAt,
              endedAt,
              lastAt: row.lastAt,
              // closed = 这一轮真的结束了（turn/end 到过）；用时按它冻住
              closed: endedAt > 0,
              durationMs: startedAt > 0 ? Math.max(0, (endedAt > 0 ? endedAt : row.lastAt) - startedAt) : 0,
              model: row.model,
              buckets: { ...row.buckets },
            }
          }),
      })),
    }
  }

  /** 只读地取一个已经存在的会话（**不会**像 sessionSlot 那样把它建出来）。 */
  function peekSession(sessionId) {
    return sessions.get(String(sessionId || 'default')) || null
  }

  return { ingest, dispose, hydrateSessions, installTurns, snapshot, sessionSlot, peekSession }
}
