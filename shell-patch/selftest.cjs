/* selftest.cjs — validate the asar reader/writer without touching a large tree.
 *
 * Copies a small subset of an existing archive into a scratch directory,
 * repacks it, extracts it again and compares byte-for-byte. Confirms that the
 * reader, the writer and the alignment/header math agree with a real archive.
 *
 * Usage: node selftest.cjs <archive> <prefix> [workdir]
 */
'use strict';

// Unpatched filesystem -- see lib/real-fs.cjs. No process-wide `noAsar` switch.
const fs = require('./lib/real-fs.cjs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const asar = require('./lib/asar.cjs');

const archive = process.argv[2];
const prefix = process.argv[3];
if (archive === undefined || prefix === undefined) {
  console.error('usage: node selftest.cjs <archive> <prefix> [workdir]');
  process.exit(2);
}
const work = process.argv[4] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'asar-selftest-'));

function countFiles(node) {
  let count = 0;
  for (const entry of Object.values(node.files ?? {})) count += entry.files !== undefined ? countFiles(entry) : 1;
  return count;
}

/** Pull one subtree out of the archive header, or the whole header. */
function subtree(header, prefixPath) {
  let node = header;
  if (prefixPath !== '') {
    for (const part of prefixPath.split('/')) {
      node = node.files?.[part];
      if (node === undefined) throw new Error(`asar selftest: ${prefixPath} is not in the archive`);
    }
  }
  return node;
}

const { header, contentOffset } = asar.readHeader(archive);
const node = subtree(header, prefix);
const expectedFiles = countFiles(node);
console.log('[selftest] subtree', prefix, 'files', expectedFiles);

// Materialise the chosen subtree by hand, straight from the header, so this
// test does not depend on extractAll.
const source = path.join(work, 'source');
const target = path.join(work, 'roundtrip');
fs.rmSync(source, { recursive: true, force: true });
fs.rmSync(target, { recursive: true, force: true });

const fd = fs.openSync(archive, 'r');
const write = (entry, relative) => {
  const absolute = path.join(source, ...relative.split('/'));
  if (entry.files !== undefined) {
    fs.mkdirSync(absolute, { recursive: true });
    for (const [name, child] of Object.entries(entry.files)) write(child, `${relative}/${name}`);
    return;
  }
  if (entry.link !== undefined) return;
  if (entry.unpacked === true) {
    fs.copyFileSync(path.join(`${archive}.unpacked`, ...relative.split('/')), absolute);
    return;
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const buffer = Buffer.alloc(entry.size ?? 0);
  if (buffer.length > 0) {
    let read = 0;
    while (read < buffer.length) {
      const chunk = fs.readSync(fd, buffer, read, buffer.length - read, contentOffset + Number(entry.offset) + read);
      if (chunk === 0) throw new Error(`asar selftest: short read at ${relative}`);
      read += chunk;
    }
  }
  fs.writeFileSync(absolute, buffer);
};
try {
  const root = path.join(source, ...prefix.split('/'));
  fs.mkdirSync(root, { recursive: true });
  for (const [name, child] of Object.entries(node.files ?? {})) write(child, `${prefix}/${name}`);
} finally {
  fs.closeSync(fd);
}

const repacked = path.join(work, 'roundtrip.asar');
asar.createPackage(source, repacked, { unpacked: new Set() });
const extracted = asar.extractAll(repacked, target);
console.log('[selftest] extracted', extracted, 'files', `${(fs.statSync(repacked).size / 1024).toFixed(1)} KiB`);

const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const failures = [];
const walk = (directory, relative) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const rel = relative === '' ? entry.name : `${relative}/${entry.name}`;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, rel);
    else if (entry.isFile() && hash(absolute) !== hash(path.join(target, rel))) failures.push(rel);
  }
};
walk(source, '');

if (failures.length > 0) {
  console.error('[selftest] FAILED on', failures.length, 'files:', failures.slice(0, 10).join(', '));
  process.exit(1);
}
console.log('[selftest] OK — round trip is byte-identical');
