#!/usr/bin/env node
/* tests.cjs — fast regression tests for lib/asar.cjs, no real archive needed.
 *
 * The bug that broke the desktop install was two wrong UInt32s in the Pickle
 * header: `@8` held `headerBufLen` instead of `headerBufLen - 4`, and `@12`
 * counted a NUL byte that is padding rather than JSON. Chromium then refused
 * the whole archive and silently booted `default_app.asar`. These tests pin the
 * exact field values so that can never ship again.
 *
 * Usage: node tests.cjs
 */
'use strict';

// Unpatched filesystem -- see lib/real-fs.cjs. No process-wide `noAsar` switch.
const assert = require('assert');
const crypto = require('crypto');
const fs = require('./lib/real-fs.cjs');
const os = require('os');
const path = require('path');
const asar = require('./lib/asar.cjs');

let passed = 0;
const failures = [];
function test(name, body) {
  try {
    body();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL ${name}\n       ${error.message}`);
  }
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-tests-'));
const source = path.join(scratch, 'tree');
const archive = path.join(scratch, 'out.asar');

function buildTree() {
  fs.rmSync(source, { recursive: true, force: true });
  fs.mkdirSync(path.join(source, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(source, 'empty'), { recursive: true });
  fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ name: 'x', main: 'lib/main.js' }));
  fs.writeFileSync(path.join(source, 'lib', 'main.js'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(source, 'lib', 'odd.bin'), Buffer.from([1, 2, 3]));
  fs.writeFileSync(path.join(source, 'zero.txt'), '');
}
buildTree();

test('createPackage reports the canonical Pickle fields', () => {
  const result = asar.createPackage(source, archive);
  const { headerBufLen, payloadSize, jsonLen } = result.fields;
  assert.strictEqual(headerBufLen % 4, 0, 'headerBufLen must be 4-byte aligned');
  assert.strictEqual(payloadSize, headerBufLen - 4, '@8 must be headerBufLen - 4, not headerBufLen');
  // jsonLen must be the JSON's real byte length, with padding excluded.
  const jsonEnd = scanEnd(fs.readFileSync(archive));
  assert.strictEqual(jsonEnd - 16, jsonLen, '@12 must be the exact JSON byte length');
  const padding = headerBufLen - 8 - jsonLen;
  assert.ok(padding >= 0 && padding <= 3, `padding must be 0..3, got ${padding}`);
});

/** Independent brace walker, used to cross-check the writer's jsonLen. */
function scanEnd(bytes) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 16; index < bytes.length; index++) {
    const byte = bytes[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (byte === 0x5c) escaped = true;
      else if (byte === 0x22) inString = false;
      continue;
    }
    if (byte === 0x22) inString = true;
    else if (byte === 0x7b) depth++;
    else if (byte === 0x7d && --depth === 0) return index + 1;
  }
  throw new Error('unterminated JSON');
}

test('readHeader accepts what createPackage wrote', () => {
  asar.createPackage(source, archive);
  const { fields, contentOffset, size } = asar.readHeader(archive);
  assert.strictEqual(fields.payloadSize, fields.headerBufLen - 4);
  assert.strictEqual(contentOffset, 8 + fields.headerBufLen);
  assert.ok(contentOffset <= size);
});

test('readHeader rejects @8 = headerBufLen (the shipped bug)', () => {
  asar.createPackage(source, archive);
  const bytes = fs.readFileSync(archive);
  bytes.writeUInt32LE(bytes.readUInt32LE(4), 8);   // payloadSize := headerBufLen
  fs.writeFileSync(archive, bytes);
  assert.throws(() => asar.readHeader(archive), /@8 must be headerBufLen - 4/);
});

test('readHeader rejects a jsonLen that swallows the padding', () => {
  asar.createPackage(source, archive);
  const bytes = fs.readFileSync(archive);
  bytes.writeUInt32LE(bytes.readUInt32LE(12) + 1, 12);
  fs.writeFileSync(archive, bytes);
  assert.throws(() => asar.readHeader(archive), /exact byte length/);
});

test('readHeader rejects a jsonLen that understates the JSON', () => {
  asar.createPackage(source, archive);
  const bytes = fs.readFileSync(archive);
  bytes.writeUInt32LE(bytes.readUInt32LE(12) - 1, 12);
  fs.writeFileSync(archive, bytes);
  // Either the padding bound or the exact-length check rejects it; both are
  // "the size word does not describe this JSON".
  assert.throws(() => asar.readHeader(archive), /exact byte length|padding/);
});

test('readHeader rejects an unaligned headerBufLen', () => {
  asar.createPackage(source, archive);
  const bytes = fs.readFileSync(archive);
  bytes.writeUInt32LE(bytes.readUInt32LE(4) + 1, 4);
  fs.writeFileSync(archive, bytes);
  assert.throws(() => asar.readHeader(archive), /aligned|padding/);
});

test('readHeader rejects a bad Pickle marker', () => {
  asar.createPackage(source, archive);
  const bytes = fs.readFileSync(archive);
  bytes.writeUInt32LE(8, 0);
  fs.writeFileSync(archive, bytes);
  assert.throws(() => asar.readHeader(archive), /Pickle marker/);
});

test('pack -> unpack reproduces every file byte for byte', () => {
  asar.createPackage(source, archive);
  const out = path.join(scratch, 'extracted');
  fs.rmSync(out, { recursive: true, force: true });
  const count = asar.extractAll(archive, out);
  assert.strictEqual(count, 4);
  const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  for (const relative of ['package.json', 'lib/main.js', 'lib/odd.bin', 'zero.txt']) {
    assert.strictEqual(hash(path.join(out, relative)), hash(path.join(source, relative)), relative);
  }
  assert.ok(fs.statSync(path.join(out, 'empty')).isDirectory(), 'empty directory survives');
});

test('repacking an unchanged tree is byte-identical', () => {
  const first = path.join(scratch, 'a.asar');
  const second = path.join(scratch, 'b.asar');
  asar.createPackage(source, first);
  const out = path.join(scratch, 'again');
  fs.rmSync(out, { recursive: true, force: true });
  asar.extractAll(first, out);
  asar.createPackage(out, second);
  assert.ok(fs.readFileSync(first).equals(fs.readFileSync(second)), 'deterministic packer');
});

test('unpacked entries are declared and mirrored beside the archive', () => {
  const out = path.join(scratch, 'unpacked.asar');
  fs.rmSync(`${out}.unpacked`, { recursive: true, force: true });
  asar.createPackage(source, out, { unpacked: ['lib/odd.bin'] });
  const { header } = asar.readHeader(out);
  assert.strictEqual(header.files.lib.files['odd.bin'].unpacked, true);
  assert.ok(fs.existsSync(path.join(`${out}.unpacked`, 'lib', 'odd.bin')), 'payload copied next to the archive');
  const target = path.join(scratch, 'unpacked-out');
  fs.rmSync(target, { recursive: true, force: true });
  asar.extractAll(out, target);
  assert.deepStrictEqual([...fs.readFileSync(path.join(target, 'lib', 'odd.bin'))], [1, 2, 3]);
});

fs.rmSync(scratch, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
