/* pricing.js —— DeepSeek 官方分时价目表 + 峰谷判定 + 单步计价。
 *
 * 纯函数，零 IO、零 import：宿主半边与单测共用同一份真相。
 *
 * ── 单位与口径 ────────────────────────────────────────────────────────────
 * 价格单位是「元 / 百万 token」。每个字段写成 [空闲价, 高峰价]，
 * 与官方价目页的两列一一对应（不是 [高峰, 空闲]）。
 *
 * TokenUsage 的四桶来自 @deepseek-ai/dsh-llm 的 TokenUsage 定义，计数**互不重叠**：
 *   inputTokens      = 未命中缓存的输入     → miss
 *   cacheReadTokens  = 缓存命中             → hit
 *   cacheWriteTokens = 缓存写入             → write
 *   outputTokens     = 输出（**已含 reasoningTokens**）→ out
 * 所以 reasoning 不另计，cacheWrite 按官方口径落在「未命中」价上（见 WRITE_USES_MISS）。
 *
 * ── 峰谷规则（官方 2026-09-19 说明）──────────────────────────────────────
 *   高峰：周一至周五（不含中国法定节假日）北京时间 09:00–12:00、14:00–18:00
 *   空闲：其余时段，**包括周末与中国法定节假日全天**
 * 两条生效分界各自独立，之前的日志按旧规则计价：
 *   WEEKEND_VALLEY_FROM_MS = 北京时间 2026-08-23 00:00（周末全天谷价生效）
 *   HOLIDAY_VALLEY_FROM_MS = 北京时间 2026-09-19 00:00（法定节假日全天谷价生效）
 *
 * ⚠️ HOLIDAYS 只列「放假」的日期。调休上班日不需要单列：2026 年的调休
 *    （1/4、2/14、2/28、5/9、9/20、10/10）全部落在周末，而周末本来就是谷价。
 * ⚠️ 每年 11 月国务院发布次年安排后，必须回来补下一年的日期；
 *    漏补不会算错价，只会把法定节假日的白天当成高峰（偏高估）。
 */

/** 价目表版本；改了 PRICING 或峰谷规则就递增（账本会记下它，便于回溯）。 */
export const PRICE_REVISION = '2026-10-09.1'

/** 缓存写入是否按「未命中」价计费（DeepSeek 官方口径：是）。 */
export const WRITE_USES_MISS = true

/** 高峰时段（北京时间的小时区间，左闭右开）。 */
export const PEAK_HOURS = [
  [9, 12],
  [14, 18],
]

/** 周末全天谷价的生效时刻（epoch ms，= 北京时间 2026-08-23 00:00）。 */
export const WEEKEND_VALLEY_FROM_MS = Date.UTC(2026, 7, 22, 16, 0, 0)

/** 法定节假日全天谷价的生效时刻（epoch ms，= 北京时间 2026-09-19 00:00）。 */
export const HOLIDAY_VALLEY_FROM_MS = Date.UTC(2026, 8, 18, 16, 0, 0)

/**
 * 中国法定节假日「放假」日期（北京时间，YYYY-MM-DD）→ true。
 * 依据：《国务院办公厅关于 2026 年部分节假日安排的通知》+ DeepSeek 官方计费脚注。
 */
export const HOLIDAYS = Object.freeze({
  '2026-01-01': 1, '2026-01-02': 1, '2026-01-03': 1, // 元旦 1/1–1/3（1/4 调休上班，落在周日）
  '2026-02-15': 1, '2026-02-16': 1, '2026-02-17': 1, '2026-02-18': 1, '2026-02-19': 1, // 春节 2/15–2/23
  '2026-02-20': 1, '2026-02-21': 1, '2026-02-22': 1, '2026-02-23': 1,
  '2026-04-04': 1, '2026-04-05': 1, '2026-04-06': 1, // 清明 4/4–4/6
  '2026-05-01': 1, '2026-05-02': 1, '2026-05-03': 1, '2026-05-04': 1, '2026-05-05': 1, // 劳动节 5/1–5/5（5/9 调休，落在周六）
  '2026-06-19': 1, '2026-06-20': 1, '2026-06-21': 1, // 端午 6/19–6/21
  '2026-09-25': 1, '2026-09-26': 1, '2026-09-27': 1, // 中秋 9/25–9/27
  '2026-10-01': 1, '2026-10-02': 1, '2026-10-03': 1, '2026-10-04': 1, // 国庆 10/1–10/7（10/10 调休，落在周六）
  '2026-10-05': 1, '2026-10-06': 1, '2026-10-07': 1,
})

/**
 * 内置价目表：{ [模型名子串]: { hit, miss, write, out } }，每项都是 [空闲, 高峰]。
 *
 * 匹配规则是**模型名子串**、**按键长降序**（避免短关键字误伤别的模型），
 * 与官方当前在售的两个 DeepSeek 路由一致。未命中任何键时回落到 _default。
 *
 * 数值来源：DeepSeek 官方价目页（2026-09-19 复核）
 *   Flash（deepseek-flash = DeepSeek-V4.1-Flash）：命中 0.02/0.04，未命中 1/2，输出 4/8
 *   Pro  （deepseek-v4-pro，Flash 的 3 倍价）：命中 0.15/0.30，未命中 4.5/9，输出 13.5/27
 */
const FLASH = { hit: [0.02, 0.04], miss: [1, 2], write: [1, 2], out: [4, 8] }
const PRO = { hit: [0.15, 0.3], miss: [4.5, 9], write: [4.5, 9], out: [13.5, 27] }

export const PRICING = Object.freeze({
  'deepseek-flash': FLASH,
  'deepseek-v4-flash': FLASH,
  'deepseek-v4-flash-vision-exp': FLASH, // 旧名已下线，请求由 V4.1-Flash 提供，按 Flash 价计费
  'deepseek-v4-pro': PRO,
  _default: FLASH,
})

/** 空 token 桶。 */
export function emptyTokens() {
  return { miss: 0, hit: 0, write: 0, out: 0 }
}

/**
 * 把 TokenUsage 归一成四桶（计数互不重叠，reasoning 已含在 out 里）。
 * @param {object|null|undefined} usage - @deepseek-ai/dsh-llm 的 TokenUsage。
 * @returns {{miss:number,hit:number,write:number,out:number}}
 */
export function normalizeUsage(usage) {
  const num = (value) => {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  if (!usage || typeof usage !== 'object') return emptyTokens()
  return {
    miss: num(usage.inputTokens),
    hit: num(usage.cacheReadTokens),
    write: num(usage.cacheWriteTokens),
    out: num(usage.outputTokens),
  }
}

/** 两个桶相加（不修改入参）。 */
export function addTokens(a, b) {
  const left = a || emptyTokens()
  const right = b || emptyTokens()
  return {
    miss: (left.miss || 0) + (right.miss || 0),
    hit: (left.hit || 0) + (right.hit || 0),
    write: (left.write || 0) + (right.write || 0),
    out: (left.out || 0) + (right.out || 0),
  }
}

/** 桶是否全为 0。 */
export function isZeroTokens(tokens) {
  if (!tokens) return true
  return !tokens.miss && !tokens.hit && !tokens.write && !tokens.out
}

/**
 * 北京时间（UTC+8）的日历要素。用固定偏移而不是 Intl：这台机器上多语言/时区
 * 库的实现差异会把同一时刻判成不同的小时（社区插件踩过），固定偏移不可变。
 * @param {number} timeMs - epoch 毫秒。
 * @returns {{day:string, hour:number, weekday:number, minutes:number}} weekday 0=周日。
 */
export function beijingParts(timeMs) {
  const shifted = new Date(Number(timeMs) + 8 * 3600 * 1000)
  return {
    day: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours(),
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  }
}

/** 这一天（北京时间日期串）是否法定节假日。 */
export function isHoliday(day) {
  return Object.hasOwn(HOLIDAYS, String(day))
}

/**
 * 是否高峰时段。
 * @param {number} timeMs - epoch 毫秒（**调用方传毫秒**；宿主事件里的 `time` 就是毫秒）。
 * @returns {boolean}
 */
export function isPeakTime(timeMs) {
  const n = Number(timeMs)
  if (!Number.isFinite(n)) return false
  const { day, hour, weekday } = beijingParts(n)
  if (n >= WEEKEND_VALLEY_FROM_MS && (weekday === 0 || weekday === 6)) return false
  if (n >= HOLIDAY_VALLEY_FROM_MS && isHoliday(day)) return false
  for (const [start, end] of PEAK_HOURS) {
    if (hour >= start && hour < end) return true
  }
  return false
}

/**
 * 下一次峰谷切换时刻（epoch 毫秒），与 isPeakTime 同源（含周末与节假日规则）。
 * 只扫北京时间的 0/9/12/14/18 点边界；最长假期（春节 9 天）也在 12 天余量内。
 * @param {number} timeMs - epoch 毫秒。
 * @returns {number|null} null 表示 12 天内没有切换点（当前规则下不会发生）。
 */
export function nextPeakChangeAt(timeMs) {
  const n = Number(timeMs)
  if (!Number.isFinite(n)) return null
  const current = isPeakTime(n)
  // 北京当日 00:00 的 epoch ms：先在 +8h 平移坐标系里取整日，再**平移回来**。
  // 少了最后这个 -8h，所有候选点会整体偏后 8 小时（曾经把 12:00 的切换点报成 20:00）。
  const shiftedDayStart = Math.floor((n + 8 * 3600 * 1000) / 86400000) * 86400000
  const dayStart = shiftedDayStart - 8 * 3600 * 1000
  for (let d = 0; d <= 12; d++) {
    for (const edge of [0, 9, 12, 14, 18]) {
      const candidate = dayStart + d * 86400000 + edge * 3600 * 1000
      if (candidate <= n + 1) continue
      if (isPeakTime(candidate) !== current) return candidate
    }
  }
  return null
}

/**
 * 取一个模型的价目项，按键长降序做子串匹配。
 * @param {string} model - 模型 id（大小写不敏感）。
 * @returns {{price:object, matched:string, known:boolean}} known=false 表示落到 _default（未定价，界面应单列）。
 */
export function priceFor(model) {
  const m = String(model || '').toLowerCase()
  let matched = null
  for (const key of Object.keys(PRICING)) {
    if (key === '_default') continue
    if (m.includes(key)) {
      if (matched === null || key.length > matched.length) matched = key
    }
  }
  if (matched === null) return { price: PRICING._default, matched: '_default', known: false }
  return { price: PRICING[matched], matched, known: true }
}

/**
 * 一个 (模型, 峰谷) 组合的单价快照（元 / 百万 token）。
 * @param {string} model
 * @param {boolean} peak
 * @returns {{miss:number,hit:number,write:number,out:number,known:boolean,matched:string}}
 */
export function unitPrices(model, peak) {
  const { price, matched, known } = priceFor(model)
  const pick = (pair) => pair[peak ? 1 : 0]
  return {
    miss: pick(price.miss),
    hit: pick(price.hit),
    write: WRITE_USES_MISS ? pick(price.miss) : pick(price.write),
    out: pick(price.out),
    known,
    matched,
  }
}

/** 四舍五入到 8 位小数（钱的最小可记账位，与账本精度一致）。 */
export function roundMoney(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1e8) / 1e8
}

/**
 * 给一个 token 桶计价。
 * @param {{miss:number,hit:number,write:number,out:number}} tokens
 * @param {string} model
 * @param {number} timeMs - 该步的计价时刻（幂等：同一桶同一时刻结果恒定）。
 * @returns {{cost:number, currency:'CNY', peak:boolean, priced:boolean, model:string, unit:object, parts:object}}
 */
export function costOf(tokens, model, timeMs) {
  const bucket = tokens || emptyTokens()
  const peak = isPeakTime(timeMs)
  const unit = unitPrices(model, peak)
  const parts = {
    miss: (bucket.miss || 0) * unit.miss / 1e6,
    hit: (bucket.hit || 0) * unit.hit / 1e6,
    write: (bucket.write || 0) * unit.write / 1e6,
    out: (bucket.out || 0) * unit.out / 1e6,
  }
  const cost = roundMoney(parts.miss + parts.hit + parts.write + parts.out)
  return {
    cost,
    currency: 'CNY',
    peak,
    // priced=false：模型不在价目表里，数字按 _default 兜底，消费方**必须**把它单列出来
    priced: unit.known,
    model: String(model || ''),
    unit,
    parts,
  }
}

/**
 * 一个桶在账本里的键：`model\u0001peak|off`。
 * 用不可见分隔符而不是 `|`：模型 id 里可能出现任何可见字符，而 \u0001 不会。
 * @param {string} model
 * @param {boolean} peak
 * @returns {string}
 */
export function bucketKey(model, peak) {
  return `${String(model || '')}\u0001${peak ? 'peak' : 'off'}`
}

/** 解析 bucketKey。 */
export function parseBucketKey(key) {
  const text = String(key || '')
  const at = text.lastIndexOf('\u0001')
  if (at < 0) return { model: text, peak: false }
  return { model: text.slice(0, at), peak: text.slice(at + 1) === 'peak' }
}

/**
 * 把一组 { bucketKey: tokens } 汇总成钱（**读取时**计价，所以改价后历史数字会跟着更新，
 * 但每个桶的峰谷档与模型是当时定死的，不会被改价改变口径）。
 * @param {Record<string, object>} buckets
 * @returns {{cost:number, currency:'CNY', unpriced:string[], byModel:Array<object>}}
 */
export function summarizeBuckets(buckets) {
  let total = 0
  const unpriced = new Set()
  const byModel = new Map()
  const totals = emptyTokens()
  for (const [key, tokens] of Object.entries(buckets || {})) {
    // 档位是**当时**定死的，所以直接按档位取单价，不再走 isPeakTime ——
    // 否则「现在几点」会改变历史桶的价（读取时计价不等于读取时定档）。
    const { model, peak } = parseBucketKey(key)
    const unit = unitPrices(model, peak)
    const bucket = tokens || emptyTokens()
    const cost = roundMoney(
      (bucket.miss || 0) * unit.miss / 1e6
      + (bucket.hit || 0) * unit.hit / 1e6
      + (bucket.write || 0) * unit.write / 1e6
      + (bucket.out || 0) * unit.out / 1e6,
    )
    total += cost
    if (!unit.known) unpriced.add(model || '(unknown)')
    const slot = byModel.get(model) || {
      model, cost: 0, currency: 'CNY',
      tokens: emptyTokens(), tokensPeak: emptyTokens(), tokensOff: emptyTokens(),
      priced: true,
    }
    slot.cost = roundMoney(slot.cost + cost)
    slot.tokens = addTokens(slot.tokens, bucket)
    if (peak) slot.tokensPeak = addTokens(slot.tokensPeak, bucket)
    else slot.tokensOff = addTokens(slot.tokensOff, bucket)
    slot.priced = slot.priced && unit.known
    byModel.set(model, slot)

    totals.miss += bucket.miss || 0
    totals.hit += bucket.hit || 0
    totals.write += bucket.write || 0
    totals.out += bucket.out || 0
  }
  const all = totals.miss + totals.hit + totals.write + totals.out
  return {
    cost: roundMoney(total),
    currency: 'CNY',
    unpriced: [...unpriced],
    byModel: [...byModel.values()].sort((a, b) => b.cost - a.cost),
    /** 四桶合计 + 派生口径（界面直接用，不要再各算一份）。 */
    totals: {
      ...totals,
      total: all,
      // 输入 = 未命中 + 命中 + 缓存写入；命中率按「命中 /(命中 + 未命中)」，与官方账单口径一致
      input: totals.miss + totals.hit + totals.write,
      hitRate: totals.hit + totals.miss > 0 ? totals.hit / (totals.hit + totals.miss) : 0,
    },
  }
}
