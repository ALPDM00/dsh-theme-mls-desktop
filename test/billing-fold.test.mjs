import test from 'node:test'
import assert from 'node:assert/strict'

import { createFold } from '../billing/fold.mjs'
import { isPeakTime, summarizeBuckets, bucketKey } from '../billing/pricing.mjs'

function bj(year, month, day, hour, minute = 0) {
  return Date.UTC(year, month - 1, day, hour - 8, minute, 0)
}

const PEAK = bj(2026, 10, 8, 10, 0) // 周四 10:00
const OFF = bj(2026, 10, 8, 22, 0) // 周四 22:00

function ev(type, data, time) {
  return { type, seq: 1, time, data }
}

test('一步一结：usage 先到、step/end 定档结算', () => {
  const fold = createFold()
  const sid = 's1'
  assert.deepEqual(fold.ingest(sid, ev('request/header', { header: { config: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } } }, PEAK), isPeakTime), [])
  fold.ingest(sid, ev('step/start', { turn: 1, step: 1 }, PEAK), isPeakTime)
  fold.ingest(sid, ev('assistant/message', { turn: 1, step: 1, message: {}, usage: { inputTokens: 1e6, outputTokens: 1e6 } }, PEAK), isPeakTime)
  const settled = fold.ingest(sid, ev('step/end', { turn: 1, step: 1 }, PEAK), isPeakTime)
  assert.equal(settled.length, 1)
  assert.equal(settled[0].peak, true)
  assert.equal(settled[0].model, 'deepseek-v4-flash')
  assert.deepEqual(settled[0].tokens, { miss: 1e6, hit: 0, write: 0, out: 1e6 })

  const snap = fold.snapshot()
  const session = snap.sessions[0]
  assert.equal(session.requests, 1)
  assert.equal(session.turns.length, 1)
  assert.equal(summarizeBuckets(session.buckets).cost, 10) // 高峰：2 + 8
})

test('同一个 (turn, step) 再报一次是替换而不是累加', () => {
  const fold = createFold()
  const sid = 's1'
  fold.ingest(sid, ev('request/header', { header: { config: { model: 'deepseek-v4-flash' } } }, OFF), isPeakTime)
  fold.ingest(sid, ev('assistant/message', { turn: 1, step: 1, usage: { inputTokens: 100, outputTokens: 10 } }, OFF), isPeakTime)
  fold.ingest(sid, ev('assistant/message', { turn: 1, step: 1, usage: { inputTokens: 200, outputTokens: 20 } }, OFF), isPeakTime)
  const settled = fold.ingest(sid, ev('step/end', { turn: 1, step: 1 }, OFF), isPeakTime)
  assert.equal(settled.length, 1)
  assert.deepEqual(settled[0].tokens, { miss: 200, hit: 0, write: 0, out: 20 })
  const session = fold.snapshot().sessions[0]
  assert.equal(session.requests, 1)
  assert.equal(session.buckets[bucketKey('deepseek-v4-flash', false)].miss, 200)
  // 第二步：同一轮里再走一步，应该累加
  fold.ingest(sid, ev('assistant/message', { turn: 1, step: 2, usage: { inputTokens: 300 } }, OFF), isPeakTime)
  fold.ingest(sid, ev('step/end', { turn: 1, step: 2 }, OFF), isPeakTime)
  const after = fold.snapshot().sessions[0]
  assert.equal(after.requests, 2)
  assert.equal(after.buckets[bucketKey('deepseek-v4-flash', false)].miss, 500)
  assert.equal(after.turns[0].requests, 2)
})

test('没有 usage 的步不收费，也不凭空建出会话', () => {
  const fold = createFold()
  fold.ingest('s1', ev('assistant/message', { turn: 1, step: 1 }, OFF), isPeakTime)
  assert.deepEqual(fold.ingest('s1', ev('step/end', { turn: 1, step: 1 }, OFF), isPeakTime), [])
  assert.equal(fold.snapshot().sessions.length, 0)
})

test('turn/end 结算还没等到 step/end 的残余（取消/崩溃）', () => {
  const fold = createFold()
  fold.ingest('s1', ev('request/header', { header: { config: { model: 'deepseek-v4-flash' } } }, PEAK), isPeakTime)
  fold.ingest('s1', ev('assistant/message', {
    turn: 7, step: 1, message: {}, interrupted: true, usage: { inputTokens: 10, outputTokens: 2 },
  }, PEAK), isPeakTime)
  const settled = fold.ingest('s1', ev('turn/end', { turn: 7, reason: { kind: 'cancelled' } }, PEAK), isPeakTime)
  assert.equal(settled.length, 1)
  assert.equal(settled[0].interrupted, true)
  assert.equal(settled[0].at, PEAK)
  assert.equal(settled[0].peak, true)
})

test('跨峰谷边界：按结算时刻定档，不按 usage 到达时刻', () => {
  const fold = createFold()
  fold.ingest('s1', ev('request/header', { header: { config: { model: 'deepseek-v4-flash' } } }, bj(2026, 10, 8, 11, 59)), isPeakTime)
  // 11:59 到 usage，12:01 才 step/end → 按空闲价
  fold.ingest('s1', ev('assistant/message', { turn: 1, step: 1, usage: { inputTokens: 1e6 } }, bj(2026, 10, 8, 11, 59)), isPeakTime)
  const settled = fold.ingest('s1', ev('step/end', { turn: 1, step: 1 }, bj(2026, 10, 8, 12, 1)), isPeakTime)
  assert.equal(settled[0].peak, false)
  assert.equal(summarizeBuckets(fold.snapshot().sessions[0].buckets).cost, 1)
})

test('session/disposed 把残余结算掉并清空', () => {
  const fold = createFold()
  fold.ingest('s1', ev('request/header', { header: { config: { model: 'deepseek-v4-flash' } } }, OFF), isPeakTime)
  fold.ingest('s1', ev('assistant/message', { turn: 3, step: 1, usage: { outputTokens: 5 } }, OFF), isPeakTime)
  const settled = fold.dispose('s1', isPeakTime)
  assert.equal(settled.length, 1)
  assert.equal(fold.snapshot().pendingSteps, 0)
})

test('request/context 也能提供模型；未给模型时用会话上已知的', () => {
  const fold = createFold()
  fold.ingest('s1', ev('request/context', { provider: 'deepseek-official', model: 'deepseek-v4-pro' }, PEAK), isPeakTime)
  fold.ingest('s1', ev('assistant/message', { turn: 1, step: 1, usage: { outputTokens: 1e6 } }, PEAK), isPeakTime)
  const settled = fold.ingest('s1', ev('step/end', { turn: 1, step: 1 }, PEAK), isPeakTime)
  assert.equal(settled[0].model, 'deepseek-v4-pro')
  assert.equal(summarizeBuckets(fold.snapshot().sessions[0].buckets).cost, 27)
})

test('未知事件类型被忽略，且不改变会话', () => {
  const fold = createFold()
  assert.deepEqual(fold.ingest('s1', ev('assistant/chunk', { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 999 } } }, PEAK), isPeakTime), [])
  assert.deepEqual(fold.ingest('s1', ev('todo/write', { todos: [] }, PEAK), isPeakTime), [])
  assert.equal(fold.snapshot().sessions.length, 0)
})

test('hydrateSessions：重启后本会话数字还在', () => {
  const fold = createFold()
  fold.hydrateSessions({
    s1: { sessionId: 's1', requests: 2, lastAt: OFF, buckets: { [bucketKey('deepseek-v4-flash', false)]: { miss: 1e6, hit: 0, write: 0, out: 0 } } },
  })
  const session = fold.snapshot().sessions.find((row) => row.sessionId === 's1')
  assert.equal(session.requests, 2)
  assert.equal(session.model, 'deepseek-v4-flash')
  assert.equal(summarizeBuckets(session.buckets).cost, 1)
})
