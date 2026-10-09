/* ledger.js —— 账本：把已结算的 token 桶按「日」与「会话」两个维度持久化。
 *
 * 设计取舍（为什么账本里存 token 而不是钱）：
 *   钱 = Σ 桶 × 单价，而单价可以随官方调价变化。把 **token + 模型 + 峰谷档** 存下来，
 *   钱在**读取时**重算，于是改价之后历史数字自动跟着更新，而当时的峰谷档不会被篡改。
 *   日账按 `model\u0001peak|off` 分桶，正好覆盖「同一天既有高峰又有空闲」的情况。
 *
 * 落盘是 tmp + rename 原子写；写入方（index.js）自己防抖，本模块不做定时。
 */
import fs from 'node:fs'
import path from 'node:path'

export const LEDGER_VERSION = 1

/** 日账保留天数；会话记录保留条数；每个会话保留的轮次数。超出的从最旧的开始丢。 */
export const RETAIN_DAYS = 400
export const RETAIN_SESSIONS = 300
export const TURNS_PER_SESSION = 40

/** 空账本。 */
export function emptyLedger(priceRevision) {
  return {
    version: LEDGER_VERSION,
    priceRevision: String(priceRevision || ''),
    updatedAt: 0,
    days: {},
    sessions: {},
  }
}

/** 空桶。 */
function zeroBucket() {
  return { miss: 0, hit: 0, write: 0, out: 0 }
}

/**
 * 把一个 token 桶累加进某个分桶表（就地修改）。
 * @param {Record<string, object>} buckets - 形如 { 'model\u0001peak': {miss,hit,write,out} }
 * @param {string} key - bucketKey(model, peak)
 * @param {object} tokens - 四桶
 */
export function addBucket(buckets, key, tokens) {
  if (!buckets || !key || !tokens) return
  const slot = buckets[key] || (buckets[key] = zeroBucket())
  slot.miss += tokens.miss || 0
  slot.hit += tokens.hit || 0
  slot.write += tokens.write || 0
  slot.out += tokens.out || 0
}

/**
 * 记录一次已结算的用量。
 * @param {object} ledger - 账本对象（就地修改）。
 * @param {{day:string, sessionId:string, key:string, tokens:object, requests?:number}} entry
 */
export function recordUsage(ledger, entry) {
  const { day, sessionId, key, tokens } = entry || {}
  if (!day || !key || !tokens) return
  const requests = Number.isFinite(entry.requests) ? entry.requests : 1

  const dayRow = ledger.days[day] || (ledger.days[day] = {
    day, requests: 0, lastAt: 0, buckets: {},
  })
  dayRow.requests += requests
  addBucket(dayRow.buckets, key, tokens)

  if (sessionId) {
    const sessionRow = ledger.sessions[sessionId] || (ledger.sessions[sessionId] = {
      sessionId: String(sessionId), requests: 0, firstAt: 0, lastAt: 0, buckets: {}, turns: {},
    })
    sessionRow.requests += requests
    addBucket(sessionRow.buckets, key, tokens)
    if (!sessionRow.turns) sessionRow.turns = {}
  }
}

/**
 * 把一个会话的**逐轮**快照写进账本（替换式；折叠器是唯一真相源）。
 *
 * 为什么必须存逐轮：DSH 重启后宿主的折叠器是空的，而界面上那张纸条挂在
 * **已经渲染出来的轮次**上（`[data-turn-tail]`）。只存会话总量的话，重启后
 * 「当前这段对话」的每一轮都拿不到数字，纸条要等到下一轮才出现 —— 用户实测
 * 报的就是这个（"重新启动后该功能就不见了，重新对话可以正常显示"）。
 *
 * 只存 token 桶 + 两个时间边界：钱仍然在读取时按当前价目表现算。
 * @param {object} ledger
 * @param {string} sessionId
 * @param {Iterable<object>} turns - 折叠器的轮次行（Map 的 values 即可）。
 * @returns {boolean} 内容是否真的变了（用来决定要不要落盘）。
 */
export function saveTurns(ledger, sessionId, turns) {
  const row = ledger.sessions[String(sessionId || '')]
  if (!row) return false
  const next = {}
  for (const turn of turns || []) {
    const key = String(turn.turn)
    next[key] = {
      turn: Number(turn.turn) || 0,
      requests: Number(turn.requests) || 0,
      startedAt: Number(turn.startedAt) || 0,
      endedAt: Number(turn.endedAt) || 0,
      buckets: { ...(turn.buckets || {}) },
    }
  }
  // 只留最近 TURNS_PER_SESSION 轮（数字大的是更近的轮次）
  const keys = Object.keys(next).sort((a, b) => Number(b) - Number(a))
  const bounded = {}
  for (const key of keys.slice(0, TURNS_PER_SESSION)) bounded[key] = next[key]

  const before = JSON.stringify(row.turns || {})
  const after = JSON.stringify(bounded)
  if (before === after) return false
  row.turns = bounded
  return true
}

/**
 * 记下一个会话的**首次**用量时刻（单调取小）。界面的「运行时间」用它算会话时长；
 * 跨重启靠账本里这一行恢复。
 * @param {object} ledger
 * @param {string} sessionId
 * @param {number} atMs
 */
export function markSessionStart(ledger, sessionId, atMs) {
  const row = ledger.sessions[String(sessionId || '')]
  if (!row) return
  const at = Number(atMs)
  if (!Number.isFinite(at) || at <= 0) return
  row.firstAt = row.firstAt > 0 ? Math.min(row.firstAt, at) : at
}

/** 把某一天/某会话的最后活动时刻推高（单调，不回退）。 */
export function touch(ledger, whenMs, sessionId) {
  const at = Number(whenMs)
  if (!Number.isFinite(at)) return
  ledger.updatedAt = Math.max(Number(ledger.updatedAt) || 0, at)
  const day = new Date(at + 8 * 3600 * 1000).toISOString().slice(0, 10)
  const dayRow = ledger.days[day]
  if (dayRow) dayRow.lastAt = Math.max(dayRow.lastAt || 0, at)
  if (sessionId && ledger.sessions[sessionId]) {
    ledger.sessions[sessionId].lastAt = Math.max(ledger.sessions[sessionId].lastAt || 0, at)
  }
}

/**
 * 修剪：日账按日期倒序保留 RETAIN_DAYS 天，会话按 lastAt 倒序保留 RETAIN_SESSIONS 条。
 * @returns {number} 被删除的条目数。
 */
export function prune(ledger, retainDays = RETAIN_DAYS, retainSessions = RETAIN_SESSIONS) {
  let removed = 0
  const days = Object.keys(ledger.days || {}).sort()
  for (const day of days.slice(0, Math.max(0, days.length - retainDays))) {
    delete ledger.days[day]
    removed++
  }
  const sessions = Object.entries(ledger.sessions || {})
    .map(([id, row]) => [id, Number(row.lastAt) || 0])
    .sort((a, b) => b[1] - a[1])
  for (const [id] of sessions.slice(retainSessions)) {
    delete ledger.sessions[id]
    removed++
  }
  // 每个会话的轮次也修剪一遍（数字最大的最靠后 ⇒ 保留末尾的那一段）
  for (const row of Object.values(ledger.sessions || {})) {
    const keys = Object.keys(row.turns || {})
    if (keys.length <= TURNS_PER_SESSION) continue
    for (const key of keys.sort((a, b) => Number(a) - Number(b)).slice(0, keys.length - TURNS_PER_SESSION)) {
      delete row.turns[key]
      removed++
    }
  }
  return removed
}

/**
 * 校验并规整一份从磁盘读回来的账本。**不信任磁盘上的任何形状**：
 * 字段类型不对就重建那一块，而不是让运行期在别处炸。
 * @param {unknown} raw
 * @param {string} priceRevision - 当前价目表版本。
 * @returns {object} 可用的账本对象。
 */
export function normalizeLedger(raw, priceRevision) {
  const ledger = emptyLedger(priceRevision)
  if (!raw || typeof raw !== 'object') return ledger
  if (Number(raw.version) !== LEDGER_VERSION) return ledger

  ledger.priceRevision = String(raw.priceRevision || priceRevision || '')
  ledger.updatedAt = Number(raw.updatedAt) || 0

  for (const [day, row] of Object.entries(raw.days || {})) {
    if (!row || typeof row !== 'object') continue
    const clean = { day: String(row.day || day), requests: Number(row.requests) || 0, lastAt: Number(row.lastAt) || 0, buckets: {} }
    for (const [key, tokens] of Object.entries(row.buckets || {})) {
      if (!tokens || typeof tokens !== 'object') continue
      clean.buckets[key] = {
        miss: Number(tokens.miss) || 0,
        hit: Number(tokens.hit) || 0,
        write: Number(tokens.write) || 0,
        out: Number(tokens.out) || 0,
      }
    }
    ledger.days[clean.day] = clean
  }

  for (const [id, row] of Object.entries(raw.sessions || {})) {
    if (!row || typeof row !== 'object') continue
    const clean = {
      sessionId: String(row.sessionId || id),
      requests: Number(row.requests) || 0,
      firstAt: Number(row.firstAt) || 0,
      lastAt: Number(row.lastAt) || 0,
      buckets: {},
      turns: {},
    }
    for (const [key, tokens] of Object.entries(row.buckets || {})) {
      if (!tokens || typeof tokens !== 'object') continue
      clean.buckets[key] = {
        miss: Number(tokens.miss) || 0,
        hit: Number(tokens.hit) || 0,
        write: Number(tokens.write) || 0,
        out: Number(tokens.out) || 0,
      }
    }
    // 逐轮：同样是 token 桶 + 两个时间边界，形状不信任
    const turns = row.turns && typeof row.turns === 'object' && !Array.isArray(row.turns) ? row.turns : {}
    for (const [key, turn] of Object.entries(turns)) {
      if (!turn || typeof turn !== 'object') continue
      const number = Number(turn.turn)
      if (!Number.isFinite(number)) continue
      const cleanTurn = {
        turn: number,
        requests: Number(turn.requests) || 0,
        startedAt: Number(turn.startedAt) || 0,
        endedAt: Number(turn.endedAt) || 0,
        buckets: {},
      }
      for (const [bucketKey, tokens] of Object.entries(turn.buckets || {})) {
        if (!tokens || typeof tokens !== 'object') continue
        cleanTurn.buckets[bucketKey] = {
          miss: Number(tokens.miss) || 0,
          hit: Number(tokens.hit) || 0,
          write: Number(tokens.write) || 0,
          out: Number(tokens.out) || 0,
        }
      }
      clean.turns[String(number)] = cleanTurn
    }
    ledger.sessions[clean.sessionId] = clean
  }

  return ledger
}

/**
 * 读账本。任何失败（不存在、半截文件、JSON 坏了）都返回空账本 —— 计费半边
 * 永远不能因为账本坏了而拖住宿主启动。
 * @param {string} file - 账本绝对路径。
 * @param {string} priceRevision
 * @returns {{ledger:object, error:string|null}}
 */
export function loadLedger(file, priceRevision) {
  try {
    const text = fs.readFileSync(file, 'utf8')
    return { ledger: normalizeLedger(JSON.parse(text), priceRevision), error: null }
  } catch (error) {
    if (error && error.code === 'ENOENT') return { ledger: emptyLedger(priceRevision), error: null }
    return { ledger: emptyLedger(priceRevision), error: String((error && error.message) || error) }
  }
}

/**
 * 原子写账本：先写 `<file>.tmp`，再 rename 覆盖。rename 在同分区上是原子的，
 * 所以读者永远看不到半截 JSON（这是社区插件踩过 crash 后账本损坏之后的共识做法）。
 * @param {string} file
 * @param {object} ledger
 * @returns {{ok:boolean, error:string|null}}
 */
export function saveLedger(file, ledger) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(ledger), 'utf8')
    fs.renameSync(tmp, file)
    return { ok: true, error: null }
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) }
  }
}
