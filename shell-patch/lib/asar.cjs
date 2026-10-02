/* asar.cjs — read and write Electron ASAR archives with no dependencies.
 *
 * The file is a two-word Pickle header, then the file payloads. `headerBufLen`
 * is an ALIGNED length, the two size words are NOT interchangeable, and getting
 * them wrong makes Chromium reject the whole archive (which silently falls back
 * to `default_app.asar`, i.e. Electron's stock welcome page):
 *
 *   @0   UInt32  = 4                            (fixed; the size of the next field)
 *   @4   UInt32  headerBufLen = 8 + jsonLen + padding     (JSON + its NUL padding)
 *   @8   UInt32  payloadSize  = headerBufLen - 4          (NOT headerBufLen!)
 *   @12  UInt32  jsonLen                                  (JSON bytes, NO padding!)
 *   @16  bytes   header JSON, NUL-padded to `headerBufLen`
 *                first file payload at 8 + headerBufLen
 *
 * Invariants, asserted by {@link assertPickle} on every write and every read:
 *   headerBufLen >= 8, headerBufLen % 4 === 0
 *   payloadSize === headerBufLen - 4
 *   jsonLen + padding === headerBufLen - 8, with padding in 0..3
 *
 * The header JSON is   {"files":{"<name>":{"size":n,"offset":"0"}|{"files":{...}}}}
 * with offsets relative to the first payload byte. `unpacked: true` marks an
 * entry whose payload lives in `<archive>.unpacked/` instead. An optional
 * `integrity` block (Electron's `contentHash` / `blocks`) is not emitted; it is
 * only an anti-tamper checksum and is not required to load an archive.
 */
'use strict';

// Archive I/O needs real bytes: Electron's wrapper would mount the archive
// instead of reading it, and would redirect `<archive>.unpacked/...` *into* the
// archive. `lib/real-fs.cjs` resolves to Electron's `original-fs` for exactly
// that, so the wrapper is bypassed without touching global state.
//
// Do not "fix" this by setting `process.noAsar`. That switch is process-wide,
// and `index.js` loads this module inside the DSH Host process to probe the
// installed shell: turning asar support off there breaks the Host itself (see
// real-fs.cjs for the 2026-09-28 incident).
const fs = require('./real-fs.cjs');
const path = require('path');

const ALIGN = 4;
/** Fixed first word of every asar Pickle: the size of the word that follows. */
const PICKLE_MARKER = 4;
/** Bytes before the header JSON: the two size words plus the Pickle's own pair. */
const JSON_START = 16;
/** Bytes before the first payload when the JSON is empty (`headerBufLen` is 8). */
const PICKLE_HEADER_BYTES = 8;

function align4(value) {
  return value + ((ALIGN - (value % ALIGN)) % ALIGN);
}

/**
 * Enforce the header arithmetic above. Called on both read and write so a
 * malformed archive can never be produced *or* silently accepted.
 * @param {{headerBufLen: number, payloadSize: number, jsonLen: number, fileSize?: number, realJsonLen?: number}} fields
 * @returns {number} the first payload's absolute offset
 */
function assertPickle(fields) {
  const { headerBufLen, payloadSize, jsonLen, fileSize, realJsonLen } = fields;
  const fail = (message) => {
    throw new Error(`asar: malformed header — ${message} (headerBufLen=${headerBufLen} payloadSize=${payloadSize} jsonLen=${jsonLen})`);
  };
  if (!Number.isInteger(headerBufLen) || headerBufLen < PICKLE_HEADER_BYTES) fail('headerBufLen is too small');
  if (headerBufLen % ALIGN !== 0) fail('headerBufLen is not 4-byte aligned');
  if (payloadSize !== headerBufLen - 4) fail('@8 must be headerBufLen - 4');
  if (!Number.isInteger(jsonLen) || jsonLen < 2) fail('jsonLen is out of range');
  const padding = headerBufLen - PICKLE_HEADER_BYTES - jsonLen;
  if (padding < 0 || padding > ALIGN - 1) fail(`jsonLen leaves ${padding} bytes of padding (must be 0..${ALIGN - 1})`);
  // With the JSON's real length known, the field must be exact: a size that
  // includes padding is the second way Chromium's parser rejects the archive.
  if (realJsonLen !== undefined && realJsonLen !== jsonLen) fail(`@12 jsonLen must be the JSON's exact byte length (${realJsonLen})`);
  if (fileSize !== undefined && PICKLE_HEADER_BYTES + headerBufLen > fileSize) fail('header runs past the end of the archive');
  return PICKLE_HEADER_BYTES + headerBufLen;
}

/**
 * Cut arbitrary text at the closing brace of its leading JSON object, so NUL
 * padding after the header cannot break `JSON.parse`.
 * @param {string} text
 * @returns {string}
 */
function trimToJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('asar: header JSON is missing its opening brace');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth++;
    else if (character === '}' && --depth === 0) return text.slice(start, index + 1);
  }
  throw new Error('asar: header JSON is missing its closing brace');
}

/**
 * Read the archive header plus the content start offset.
 *
 * Electron's own parser is strict, so this reader is too: the size words are
 * cross-checked against the JSON's real length before anything is trusted.
 * @param {string} archive - path to the .asar file
 * @returns {{header: object, contentOffset: number, size: number, fields: object}}
 */
function readHeader(archive) {
  const fd = fs.openSync(archive, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const head = Buffer.alloc(JSON_START);
    if (fs.readSync(fd, head, 0, JSON_START, 0) !== JSON_START) throw new Error('asar: archive is too small to hold a header');
    if (head.readUInt32LE(0) !== PICKLE_MARKER) throw new Error('asar: unexpected header Pickle marker');
    const headerBufLen = head.readUInt32LE(4);
    const payloadSize = head.readUInt32LE(8);
    const jsonLen = head.readUInt32LE(12);
    // Read the padded header buffer, cut at the JSON's closing brace, then hold
    // the declared jsonLen to that real length before trusting any offset.
    const buffer = Buffer.alloc(headerBufLen - PICKLE_HEADER_BYTES);
    if (fs.readSync(fd, buffer, 0, buffer.length, JSON_START) !== buffer.length) throw new Error('asar: short read of the header JSON');
    const text = trimToJsonObject(buffer.toString('utf8'));
    const realJsonLen = Buffer.byteLength(text, 'utf8');
    const contentOffset = assertPickle({ headerBufLen, payloadSize, jsonLen, realJsonLen, fileSize: size });
    const header = JSON.parse(text);
    return { header, contentOffset, size, fields: { headerBufLen, payloadSize, jsonLen } };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Extract an archive to a directory. Symbolic links are restored when the
 * archive records a `link` entry, and `unpacked: true` entries are copied from
 * the sibling `.unpacked` directory.
 * @param {string} archive
 * @param {string} destination
 * @returns {number} extracted file count
 */
function extractAll(archive, destination) {
  const { header, contentOffset } = readHeader(archive);
  const fd = fs.openSync(archive, 'r');
  const unpackedRoot = archive + '.unpacked';
  let count = 0;
  try {
    const walk = (node, relative) => {
      const files = node.files ?? {};
      for (const name of Object.keys(files)) {
        const entry = files[name];
        const rel = relative === '' ? name : `${relative}/${name}`;
        const target = path.join(destination, ...rel.split('/'));
        if (entry.files !== undefined) {
          fs.mkdirSync(target, { recursive: true });
          walk(entry, rel);
          continue;
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (entry.link !== undefined) {
          try {
            fs.symlinkSync(entry.link, target);
          } catch {
            // A dangling or already-present link is not fatal for our purpose.
          }
          count++;
          continue;
        }
        if (entry.unpacked === true) {
          fs.copyFileSync(path.join(unpackedRoot, ...rel.split('/')), target);
          count++;
          continue;
        }
        const length = entry.size ?? 0;
        const offset = contentOffset + Number(entry.offset ?? 0);
        const buffer = Buffer.alloc(length);
        if (length > 0) {
          let read = 0;
          while (read < length) {
            const chunk = fs.readSync(fd, buffer, read, length - read, offset + read);
            if (chunk === 0) throw new Error(`asar: short read for ${rel}`);
            read += chunk;
          }
        }
        fs.writeFileSync(target, buffer);
        count++;
      }
    };
    walk(header, '');
  } finally {
    fs.closeSync(fd);
  }
  return count;
}

/** Directory names never worth packing (build artefacts, VCS metadata). */
const ALWAYS_IGNORE = new Set(['.git', '.DS_Store', 'node_modules/.cache']);

/**
 * List a directory as an asar header tree plus an ordered payload list.
 * @param {string} root
 * @returns {{tree: object, payloads: Array<{relative: string, path: string}>}}
 */
function collect(root) {
  const payloads = [];

  const walk = (directory, relative) => {
    const names = fs.readdirSync(directory, { withFileTypes: true }).map((entry) => entry.name).sort();
    const files = {};
    for (const name of names) {
      const rel = relative === '' ? name : `${relative}/${name}`;
      if (ALWAYS_IGNORE.has(rel.replace(/\\/gu, '/'))) continue;
      const absolute = path.join(directory, name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        files[name] = { link: fs.readlinkSync(absolute) };
        continue;
      }
      if (stat.isDirectory()) {
        files[name] = { files: walk(absolute, rel).files };
        continue;
      }
      if (!stat.isFile()) continue;
      files[name] = { size: stat.size, __source: absolute, __relative: rel.replace(/\\/gu, '/') };
      payloads.push({ relative: files[name].__relative, path: absolute, size: stat.size });
    }
    return { files };
  };

  return { tree: walk(root, ''), payloads };
}

/**
 * Pack a directory into an asar archive.
 * @param {string} source - directory to pack
 * @param {string} archive - destination .asar path
 * @param {{unpacked?: Iterable<string>}} [options] - relative paths to declare
 *   `unpacked: true`; their payload is copied from `<source>/<path>` to
 *   `<archive>.unpacked/<path>` and left out of the archive body. The sibling
 *   directory is otherwise removed, so a name left behind by an earlier run can
 *   never be mistaken for this archive's unpacked payload.
 * @returns {{files: number, bytes: number, fields: object}}
 */
function createPackage(source, archive, options = {}) {
  const unpackedSet = new Set(options.unpacked ?? []);
  // `unpackedMirror: false` skips rebuilding `<archive>.unpacked`.
  //
  // A caller that only validates the staged archive and then commits it by
  // renaming it over the real one never reads that mirror: Electron resolves
  // declared-unpacked paths against the archive's own sibling, which is already
  // in place and unchanged. Rebuilding it costs ~1500 file copies and a
  // recursive delete per run, and that delete can be refused outright by a
  // sandbox (safe-delete guards count bulk removals per turn), which would fail
  // an otherwise good patch.
  const mirrorUnpacked = options.unpackedMirror !== false;
  const { tree, payloads } = collect(source);
  payloads.sort((a, b) => (a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0));
  const stored = payloads.filter((payload) => !unpackedSet.has(payload.relative));

  let cursor = 0;
  const offsets = new Map();
  for (const payload of stored) {
    offsets.set(payload.relative, cursor);
    cursor = align4(cursor + payload.size);
  }

  // Stamp offsets into the tree, then drop the private collection fields.
  const strip = (node, relative) => {
    const files = node.files ?? {};
    const out = {};
    for (const name of Object.keys(files)) {
      const entry = files[name];
      const rel = relative === '' ? name : `${relative}/${name}`;
      if (entry.files !== undefined) {
        out[name] = { files: strip(entry, rel).files };
        continue;
      }
      if (entry.link !== undefined) {
        out[name] = { link: entry.link };
        continue;
      }
      if (unpackedSet.has(rel)) {
        out[name] = { size: entry.size, unpacked: true };
        continue;
      }
      out[name] = { size: entry.size, offset: String(offsets.get(rel)) };
    }
    return { files: out };
  };
  const header = strip(tree, '');
  // JSON.stringify escapes non-ASCII code points, so the byte length is not the
  // string length: every size word below must use the bytes.
  const headerJson = Buffer.from(JSON.stringify(header), 'utf8');
  const jsonLen = headerJson.length;
  const padding = (ALIGN - (jsonLen % ALIGN)) % ALIGN;
  const headerBufLen = PICKLE_HEADER_BYTES + jsonLen + padding;
  const payloadSize = headerBufLen - 4;
  // Assert our own arithmetic before a single byte is written: a wrong word here
  // makes Chromium discard the archive and silently boot default_app.asar.
  const contentOffset = assertPickle({ headerBufLen, payloadSize, jsonLen });
  if (contentOffset !== 8 + headerBufLen) throw new Error('asar: internal content offset mismatch');

  fs.mkdirSync(path.dirname(archive), { recursive: true });
  const out = fs.openSync(archive, 'w');
  try {
    const prefix = Buffer.alloc(JSON_START);
    prefix.writeUInt32LE(PICKLE_MARKER, 0);
    prefix.writeUInt32LE(headerBufLen, 4);
    prefix.writeUInt32LE(payloadSize, 8);
    prefix.writeUInt32LE(jsonLen, 12);
    fs.writeSync(out, prefix);
    fs.writeSync(out, headerJson);
    if (padding > 0) fs.writeSync(out, Buffer.alloc(padding));

    let written = 0;
    for (const payload of stored) {
      const body = fs.readFileSync(payload.path);
      fs.writeSync(out, body);
      written += payload.size;
      const gap = align4(payload.size) - payload.size;
      if (gap > 0) fs.writeSync(out, Buffer.alloc(gap));
    }

    // Mirror the declared-unpacked payloads beside the archive, which is where
    // Electron's loader reads them from. Rebuilt from scratch so a stale sibling
    // directory (or a name left over from the staging archive) can never be
    // mistaken for this archive's unpacked payload.
    const unpackedRoot = `${archive}.unpacked`;
    if (!mirrorUnpacked) {
      if (fs.existsSync(unpackedRoot)) console.warn(`[asar] WARNING  not rebuilding the unpacked mirror; ${unpackedRoot} is stale`);
    } else {
      if (unpackedSet.size > 0 || fs.existsSync(unpackedRoot)) {
        try { fs.rmSync(unpackedRoot, { recursive: true, force: true }); }
        catch (error) { console.warn(`[asar] WARNING  could not clear ${unpackedRoot} (${error.code ?? error.message}); payloads will be merged into it`); }
      }
      for (const payload of payloads) {
        if (!unpackedSet.has(payload.relative)) continue;
        const destination = path.join(unpackedRoot, ...payload.relative.split('/'));
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(payload.path, destination);
      }
    }

    return { files: payloads.length, bytes: PICKLE_HEADER_BYTES + headerBufLen + written, fields: { headerBufLen, payloadSize, jsonLen } };
  } finally {
    fs.closeSync(out);
  }
}

module.exports = { readHeader, extractAll, createPackage, align4, assertPickle };
