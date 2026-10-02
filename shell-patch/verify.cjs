/* verify.cjs — byte-for-byte round-trip check for the asar helpers.
 *
 * 1. extracts the archive to a scratch directory,
 * 2. repacks that directory into a new archive,
 * 3. extracts the new archive,
 * 4. hashes both trees and compares every path, size and SHA-256.
 *
 * Usage: node verify.cjs <archive> [scratchDir]
 */
'use strict';

// Unpatched filesystem -- see lib/real-fs.cjs. No process-wide `noAsar` switch.
const fs = require('./lib/real-fs.cjs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const asar = require('./lib/asar.cjs');

const archive = process.argv[2];
if (archive === undefined) {
  console.error('usage: node verify.cjs <archive> [scratchDir]');
  process.exit(2);
}
const scratch = process.argv[3] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'asar-verify-'));

function hashTree(root) {
  const out = new Map();
  const walk = (directory, relative) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const rel = relative === '' ? entry.name : `${relative}/${entry.name}`;
      const absolute = path.join(directory, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        out.set(rel, `link:${fs.readlinkSync(absolute)}`);
        continue;
      }
      if (stat.isDirectory()) {
        walk(absolute, rel);
        continue;
      }
      if (stat.isFile()) out.set(rel, `${stat.size}:${crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')}`);
    }
  };
  walk(root, '');
  return out;
}

function collectUnpacked(archivePath) {
  const root = `${archivePath}.unpacked`;
  const set = new Set();
  if (!fs.existsSync(root)) return set;
  const walk = (directory, relative) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const rel = relative === '' ? entry.name : `${relative}/${entry.name}`;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute, rel);
      else if (entry.isFile()) set.add(rel.replace(/\\/gu, '/'));
    }
  };
  walk(root, '');
  return set;
}

const original = path.join(scratch, 'original');
const repacked = path.join(scratch, 'repacked');
const roundTripArchive = path.join(scratch, 'roundtrip.asar');

fs.rmSync(original, { recursive: true, force: true });
fs.rmSync(repacked, { recursive: true, force: true });
fs.rmSync(`${roundTripArchive}.unpacked`, { recursive: true, force: true });
fs.rmSync(roundTripArchive, { force: true });

console.log('[verify] archive      ', archive, `${(fs.statSync(archive).size / 1048576).toFixed(1)} MiB`);
const unpackedSet = collectUnpacked(archive);
console.log('[verify] unpacked refs', unpackedSet.size);

const extractedCount = asar.extractAll(archive, original);
console.log('[verify] extracted    ', extractedCount);

const packed = asar.createPackage(original, roundTripArchive, { unpacked: unpackedSet });
console.log('[verify] repacked     ', packed);

const reExtractedCount = asar.extractAll(roundTripArchive, repacked);
console.log('[verify] re-extracted ', reExtractedCount, `${(fs.statSync(roundTripArchive).size / 1048576).toFixed(1)} MiB`);

// Electron reads unpacked payloads from the sibling directory, which must carry
// exactly the same files as the source installation.
const unpackedBefore = hashTree(`${archive}.unpacked`);
const unpackedAfter = hashTree(`${roundTripArchive}.unpacked`);
console.log(`[verify] unpacked before=${unpackedBefore.size} after=${unpackedAfter.size}`);
for (const [relative, hash] of unpackedBefore) {
  const other = unpackedAfter.get(relative);
  if (other === undefined) console.log('[verify] UNPACKED MISSING:', relative);
  else if (other !== hash) console.log('[verify] UNPACKED DIFFERS:', relative);
}

const before = hashTree(original);
const after = hashTree(repacked);
const missing = [];
const differing = [];
for (const [relative, hash] of before) {
  const other = after.get(relative);
  if (other === undefined) missing.push(relative);
  else if (other !== hash) differing.push(relative);
}
const added = [...after.keys()].filter((relative) => !before.has(relative));

console.log(`[verify] entries before=${before.size} after=${after.size}`);
if (missing.length > 0) console.log('[verify] MISSING:', missing.slice(0, 20).join(', '));
if (added.length > 0) console.log('[verify] ADDED:  ', added.slice(0, 20).join(', '));
if (differing.length > 0) console.log('[verify] DIFFER:', differing.slice(0, 20).join(', '));
const header = asar.readHeader(roundTripArchive);
console.log('[verify] header content offset', header.contentOffset, 'archive size', header.size);
console.log('[verify] header fields', JSON.stringify(header.fields));
const sourceHeader = asar.readHeader(archive);
console.log('[verify] source content offset', sourceHeader.contentOffset, 'archive size', sourceHeader.size);
console.log('[verify] source fields', JSON.stringify(sourceHeader.fields));

// A correct packer reproduces the source header words exactly: same JSON, same
// padding, hence the same headerBufLen / payloadSize / jsonLen. Writing the
// wrong words here is what makes Chromium discard the archive and boot
// default_app.asar, so this is asserted, not just printed.
const fieldsMatch =
  header.fields.headerBufLen === sourceHeader.fields.headerBufLen &&
  header.fields.payloadSize === sourceHeader.fields.payloadSize &&
  header.fields.jsonLen === sourceHeader.fields.jsonLen;
console.log(`[verify] pickle fields match source: ${fieldsMatch}`);
// The data section is copied verbatim, so an unchanged tree must reproduce the
// whole file byte for byte.
const identical = fs.readFileSync(archive).equals(fs.readFileSync(roundTripArchive));
console.log(`[verify] whole archive byte-identical to source: ${identical}`);

if (
  missing.length === 0 &&
  added.length === 0 &&
  differing.length === 0 &&
  unpackedBefore.size === unpackedAfter.size &&
  fieldsMatch &&
  identical
) {
  console.log('[verify] OK — round trip is byte-identical, header included');
  process.exit(0);
}
console.error('[verify] FAILED');
process.exit(1);
