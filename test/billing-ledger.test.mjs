import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  LEDGER_VERSION, addBucket, emptyLedger, loadLedger, normalizeLedger,
  prune, recordUsage, saveLedger, touch,
} from '../billing/ledger.mjs'
import { bucketKey } from '../billing/pricing.mjs'

function tmpFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mls-ledger-'))
  return path.join(dir, name)
}

test('addBucket 就地累加，缺键自动建', () => {
  const buckets = {}
  addBucket(buckets, 'k', { miss: 1, hit: 2, write: 3, out: 4 })
  addBucket(buckets, 'k', { miss: 10 })
  assert.deepEqual(buckets.k, { miss: 11, hit: 2, write: 3, out: 4 })
})

test('recordUsage 同时记日账与会账，requests 累加', () => {
  const ledger = emptyLedger('rev')
  const key = bucketKey('deepseek-v4-flash', true)
  recordUsage(ledger, { day: '2026-10-08', sessionId: 's1', key, tokens: { miss: 1e6, hit: 0, write: 0, out: 0 } })
  recordUsage(ledger, { day: '2026-10-08', sessionId: 's1', key, tokens: { miss: 0, hit: 0, write: 0, out: 2e6 } })
  recordUsage(ledger, { day: '2026-10-09', sessionId: 's2', key, tokens: { miss: 1, hit: 0, write: 0, out: 0 } })
  assert.equal(ledger.days['2026-10-08'].requests, 2)
  assert.equal(ledger.days['2026-10-08'].buckets[key].miss, 1e6)
  assert.equal(ledger.days['2026-10-08'].buckets[key].out, 2e6)
  assert.equal(ledger.sessions.s1.requests, 2)
  assert.equal(ledger.sessions.s2.requests, 1)
})

test('touch 单调：更早的时刻不会把 lastAt 拉回去，且按北京日切分', () => {
  const ledger = emptyLedger('rev')
  recordUsage(ledger, { day: '2026-10-08', sessionId: 's1', key: 'k', tokens: { miss: 1 } })
  // 北京时间 2026-10-08 10:00 = UTC 02:00
  touch(ledger, Date.UTC(2026, 9, 8, 2, 0, 0), 's1')
  assert.equal(ledger.days['2026-10-08'].lastAt, Date.UTC(2026, 9, 8, 2, 0, 0))
  assert.equal(ledger.sessions.s1.lastAt, Date.UTC(2026, 9, 8, 2, 0, 0))
  // 更早的时刻不回退
  touch(ledger, Date.UTC(2026, 9, 8, 1, 0, 0), 's1')
  assert.equal(ledger.days['2026-10-08'].lastAt, Date.UTC(2026, 9, 8, 2, 0, 0))
  assert.equal(ledger.updatedAt, Date.UTC(2026, 9, 8, 2, 0, 0))
  // 北京时间切日：UTC 16:00 已经属于第二天（那一行不存在时不动任何东西）
  touch(ledger, Date.UTC(2026, 9, 8, 16, 0, 0), 's1')
  assert.equal(ledger.days['2026-10-09'], undefined)
  assert.equal(ledger.updatedAt, Date.UTC(2026, 9, 8, 16, 0, 0))
})

test('prune 保留最近 N 天与最近 N 个会话', () => {
  const ledger = emptyLedger('rev')
  for (const [index, day] of ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'].entries()) {
    recordUsage(ledger, { day, sessionId: 's' + index, key: 'k', tokens: { miss: 1 } })
    ledger.days[day].lastAt = Date.parse(day + 'T00:00:00Z')
    ledger.sessions['s' + index].lastAt = index
  }
  const removed = prune(ledger, 2, 2)
  assert.deepEqual(Object.keys(ledger.days).sort(), ['2026-01-03', '2026-01-04'])
  assert.deepEqual(Object.keys(ledger.sessions).sort(), ['s2', 's3'])
  assert.equal(removed, 4) // 2 天 + 2 会话
})

test('normalizeLedger 不信任磁盘形状', () => {
  assert.deepEqual(normalizeLedger(null, 'rev'), emptyLedger('rev'))
  assert.equal(normalizeLedger({ version: 99 }, 'rev').version, LEDGER_VERSION)
  const messy = normalizeLedger({
    version: LEDGER_VERSION,
    days: {
      '2026-10-08': { day: '2026-10-08', requests: 'x', buckets: { k: { miss: '5', hit: null, evil: 1 }, bad: 'nope' } },
      '2026-10-09': 'not an object',
    },
    sessions: { s1: { sessionId: 's1', buckets: {} }, s2: 7 },
  }, 'rev')
  assert.equal(messy.days['2026-10-08'].requests, 0)
  assert.deepEqual(messy.days['2026-10-08'].buckets.k, { miss: 5, hit: 0, write: 0, out: 0 })
  assert.equal(messy.days['2026-10-09'], undefined)
  assert.ok(messy.sessions.s1)
  assert.equal(messy.sessions.s2, undefined)
})

test('loadLedger / saveLedger：往返一致，坏文件与缺文件都退回空账本', () => {
  const file = tmpFile('ledger.json')
  const missing = loadLedger(file, 'rev')
  assert.equal(missing.error, null)
  assert.deepEqual(missing.ledger, emptyLedger('rev'))

  const ledger = emptyLedger('rev')
  recordUsage(ledger, { day: '2026-10-08', sessionId: 's1', key: bucketKey('m', true), tokens: { miss: 7 } })
  assert.deepEqual(saveLedger(file, ledger), { ok: true, error: null })
  const reloaded = loadLedger(file, 'rev')
  assert.equal(reloaded.error, null)
  assert.equal(reloaded.ledger.days['2026-10-08'].buckets[bucketKey('m', true)].miss, 7)
  // 落地的是 JSON（不是 JS 字面量），且没有残留 tmp
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8'))).sort(), ['days', 'priceRevision', 'sessions', 'updatedAt', 'version'])
  assert.equal(fs.existsSync(file + '.tmp'), false)

  fs.writeFileSync(file, '{ this is not json', 'utf8')
  const broken = loadLedger(file, 'rev')
  assert.ok(broken.error)
  assert.deepEqual(broken.ledger, emptyLedger('rev'))
})

test('saveLedger 到不可写路径时返回错误而不是抛', () => {
  const result = saveLedger(path.join(os.tmpdir(), 'mls-nonexistent-\u0000dir', 'x.json'), emptyLedger('rev'))
  assert.equal(result.ok, false)
  assert.ok(result.error)
})
