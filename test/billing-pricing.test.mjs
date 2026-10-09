import test from 'node:test'
import assert from 'node:assert/strict'

import {
  HOLIDAY_VALLEY_FROM_MS, PRICING, WEEKEND_VALLEY_FROM_MS, bucketKey, costOf,
  isPeakTime, nextPeakChangeAt, normalizeUsage, parseBucketKey, priceFor,
  roundMoney, summarizeBuckets, unitPrices,
} from '../billing/pricing.mjs'

/** 北京时间某天的某个整点 → epoch ms（写测试比记 UTC 数字可靠）。 */
function bj(year, month, day, hour, minute = 0) {
  return Date.UTC(year, month - 1, day, hour - 8, minute, 0)
}

test('分时价：工作日高峰区间是北京时间 09–12 与 14–18', () => {
  // 2026-10-08 是周四，且不是法定节假日
  assert.equal(isPeakTime(bj(2026, 10, 8, 8, 59)), false)
  assert.equal(isPeakTime(bj(2026, 10, 8, 9, 0)), true)
  assert.equal(isPeakTime(bj(2026, 10, 8, 11, 59)), true)
  assert.equal(isPeakTime(bj(2026, 10, 8, 12, 0)), false)
  assert.equal(isPeakTime(bj(2026, 10, 8, 13, 59)), false)
  assert.equal(isPeakTime(bj(2026, 10, 8, 14, 0)), true)
  assert.equal(isPeakTime(bj(2026, 10, 8, 17, 59)), true)
  assert.equal(isPeakTime(bj(2026, 10, 8, 18, 0)), false)
  assert.equal(isPeakTime(bj(2026, 10, 8, 23, 30)), false)
})

test('分时价：周末全天谷价（生效分界 2026-08-23 之后）', () => {
  // 2026-10-10 是周六
  assert.equal(isPeakTime(bj(2026, 10, 10, 10, 0)), false)
  assert.equal(isPeakTime(bj(2026, 10, 11, 15, 0)), false) // 周日
  // 分界之前按旧规则：周末白天也算高峰
  assert.equal(bj(2026, 8, 1, 10, 0) < WEEKEND_VALLEY_FROM_MS, true)
  assert.equal(isPeakTime(bj(2026, 8, 1, 10, 0)), true) // 2026-08-01 是周六
})

test('分时价：法定节假日全天谷价，且只在生效分界之后', () => {
  // 2026-10-01 国庆，在分界之后 → 谷价
  assert.equal(bj(2026, 10, 1, 10, 0) >= HOLIDAY_VALLEY_FROM_MS, true)
  assert.equal(isPeakTime(bj(2026, 10, 1, 10, 0)), false)
  // 2026-05-01 劳动节，在分界之前 → 按旧规则算高峰（历史账按当时规则）
  assert.equal(isPeakTime(bj(2026, 5, 1, 10, 0)), true)
})

test('分时价：下一次切换点与 isPeakTime 同源', () => {
  const next = nextPeakChangeAt(bj(2026, 10, 8, 10, 30))
  assert.equal(next, bj(2026, 10, 8, 12, 0))
  assert.equal(isPeakTime(next), false)
  const next2 = nextPeakChangeAt(bj(2026, 10, 8, 13, 0))
  assert.equal(next2, bj(2026, 10, 8, 14, 0))
  assert.equal(isPeakTime(next2), true)
  assert.equal(nextPeakChangeAt('nonsense'), null)
  // 周五 18:30 已经是空闲，周末也全天空闲 → 下一次切换落在下周一 09:00
  assert.equal(nextPeakChangeAt(bj(2026, 10, 9, 18, 30)), bj(2026, 10, 12, 9, 0))
  assert.equal(isPeakTime(bj(2026, 10, 12, 9, 0)), true)
})

test('TokenUsage 归一：四桶互不重叠，reasoning 不另计', () => {
  assert.deepEqual(normalizeUsage({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 2, reasoningTokens: 4 }), {
    miss: 10, hit: 3, write: 2, out: 5,
  })
  assert.deepEqual(normalizeUsage(null), { miss: 0, hit: 0, write: 0, out: 0 })
  assert.deepEqual(normalizeUsage({ inputTokens: -1, outputTokens: 'x' }), { miss: 0, hit: 0, write: 0, out: 0 })
})

test('价目表：模型名子串匹配，未知模型落到 _default 且标记未定价', () => {
  assert.equal(priceFor('deepseek-v4-flash').known, true)
  assert.equal(priceFor('deepseek-flash').known, true)
  assert.equal(priceFor('deepseek-v4-pro').matched, 'deepseek-v4-pro')
  assert.equal(priceFor('deepseek-v4-flash').matched, 'deepseek-v4-flash')
  const unknown = priceFor('some-local-qwen')
  assert.equal(unknown.known, false)
  assert.equal(unknown.matched, '_default')
  assert.equal(unknown.price, PRICING._default)
})

test('单价：高峰取第二列，缓存写入按未命中价', () => {
  const off = unitPrices('deepseek-v4-flash', false)
  assert.deepEqual({ ...off, known: undefined, matched: undefined }, {
    miss: 1, hit: 0.02, write: 1, out: 4, known: undefined, matched: undefined,
  })
  const peak = unitPrices('deepseek-v4-flash', true)
  assert.deepEqual({ ...peak, known: undefined, matched: undefined }, {
    miss: 2, hit: 0.04, write: 2, out: 8, known: undefined, matched: undefined,
  })
  const pro = unitPrices('deepseek-v4-pro', true)
  assert.equal(pro.out, 27)
})

test('单步计价：Flash 满桶在高峰 vs 空闲', () => {
  const tokens = normalizeUsage({ inputTokens: 1e6, outputTokens: 1e6 })
  const peak = costOf(tokens, 'deepseek-v4-flash', bj(2026, 10, 8, 10, 0))
  assert.equal(peak.peak, true)
  assert.equal(peak.cost, 10) // 未命中 2 + 输出 8
  const off = costOf(tokens, 'deepseek-v4-flash', bj(2026, 10, 8, 22, 0))
  assert.equal(off.peak, false)
  assert.equal(off.cost, 5) // 未命中 1 + 输出 4
})

test('单步计价：命中与写入分别走自己的价', () => {
  const tokens = { miss: 0, hit: 1e6, write: 1e6, out: 0 }
  const off = costOf(tokens, 'deepseek-v4-flash', bj(2026, 10, 8, 22, 0))
  assert.equal(off.cost, roundMoney(0.02 + 1)) // 命中 0.02 + 写入按未命中价 1
  const priced = costOf(tokens, 'unknown-model', bj(2026, 10, 8, 22, 0))
  assert.equal(priced.priced, false)
})

test('桶键：模型名里出现任何可见字符都能往返', () => {
  for (const model of ['deepseek-v4-flash', 'a|b', 'a\u0001b', '']) {
    const key = bucketKey(model, true)
    const parsed = parseBucketKey(key)
    assert.equal(parsed.peak, true)
    assert.equal(parsed.model, model)
  }
  assert.equal(parseBucketKey('no-separator').peak, false)
})

test('汇总：按档位取价，钱在读取时算，历史档位不被篡改', () => {
  const buckets = {
    [bucketKey('deepseek-v4-flash', true)]: { miss: 1e6, hit: 0, write: 0, out: 0 },
    [bucketKey('deepseek-v4-flash', false)]: { miss: 1e6, hit: 0, write: 0, out: 0 },
    [bucketKey('mystery', false)]: { miss: 1e6, hit: 0, write: 0, out: 0 },
  }
  const summary = summarizeBuckets(buckets)
  assert.equal(summary.cost, 4) // 2 + 1 + 1（mystery 走 _default 空闲价）
  assert.deepEqual(summary.unpriced, ['mystery'])
  const flash = summary.byModel.find((row) => row.model === 'deepseek-v4-flash')
  assert.equal(flash.tokens.miss, 2e6)
  assert.equal(flash.tokensPeak.miss, 1e6)
  assert.equal(flash.tokensOff.miss, 1e6)
  assert.equal(flash.priced, true)
  const mystery = summary.byModel.find((row) => row.model === 'mystery')
  assert.equal(mystery.priced, false)
})
