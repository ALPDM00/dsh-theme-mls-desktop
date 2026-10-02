#!/usr/bin/env node
/* inspect.cjs — print and validate the Pickle header of an asar archive.
 *
 * Independent of asar.cjs: it re-derives the header arithmetic from raw bytes
 * (the same way Electron's archive.cc does) and reports every field, so a
 * malformed archive is caught before it can be installed.
 *
 * Usage: node inspect.cjs <app.asar> [more.asar ...]
 */
'use strict';

// Unpatched filesystem -- see lib/real-fs.cjs. No process-wide `noAsar` switch.
const fs = require('./lib/real-fs.cjs');

/** Walk the JSON object starting at `start`, returning the index just past it. */
function scanJsonEnd(bytes, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < bytes.length; index++) {
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
  return -1;
}

function inspect(file) {
  const bytes = fs.readFileSync(file);
  const marker = bytes.readUInt32LE(0);
  const headerBufLen = bytes.readUInt32LE(4);
  const payloadSize = bytes.readUInt32LE(8);
  const jsonLen = bytes.readUInt32LE(12);
  const jsonEnd = scanJsonEnd(bytes, 16);
  const realJsonLen = jsonEnd < 0 ? -1 : jsonEnd - 16;
  const padding = (4 - (realJsonLen % 4)) % 4;
  const expected = {
    headerBufLen: 8 + realJsonLen + padding,
    payloadSize: 8 + realJsonLen + padding - 4,
    jsonLen: realJsonLen
  };
  const problems = [];
  if (marker !== 4) problems.push(`@0 marker = ${marker}, expected 4`);
  if (headerBufLen !== expected.headerBufLen) problems.push(`@4 headerBufLen = ${headerBufLen}, expected ${expected.headerBufLen}`);
  if (payloadSize !== expected.payloadSize) problems.push(`@8 payloadSize = ${payloadSize}, expected ${expected.payloadSize}`);
  if (jsonLen !== expected.jsonLen) problems.push(`@12 jsonLen = ${jsonLen}, expected ${expected.jsonLen}`);
  if (8 + headerBufLen > bytes.length) problems.push('header runs past EOF');

  let header = null;
  try { header = JSON.parse(bytes.subarray(16, jsonEnd).toString('utf8')); } catch (error) { problems.push(`JSON parse: ${error.message}`); }

  let files = 0;
  let unpacked = 0;
  let outOfRange = 0;
  if (header) {
    const dataBytes = bytes.length - (8 + headerBufLen);
    const walk = (node) => {
      for (const entry of Object.values(node.files ?? {})) {
        if (entry.files !== undefined) { walk(entry); continue; }
        if (entry.link !== undefined) continue;
        files++;
        if (entry.unpacked === true) { unpacked++; continue; }
        if (Number(entry.offset) + entry.size > dataBytes) outOfRange++;
      }
    };
    walk(header);
  }

  return { file, size: bytes.length, marker, headerBufLen, payloadSize, jsonLen, realJsonLen, expected, problems, files, unpacked, outOfRange };
}

let failed = false;
for (const file of process.argv.slice(2)) {
  const info = inspect(file);
  console.log(`file            : ${info.file}`);
  console.log(`size            : ${info.size}`);
  console.log(`@0 marker       : ${info.marker}`);
  console.log(`@4 headerBufLen : ${info.headerBufLen}   (expected ${info.expected.headerBufLen})`);
  console.log(`@8 payloadSize  : ${info.payloadSize}   (expected ${info.expected.payloadSize})`);
  console.log(`@12 jsonLen     : ${info.jsonLen}   (real ${info.realJsonLen})`);
  console.log(`entries         : ${info.files} files, ${info.unpacked} unpacked, outOfRange=${info.outOfRange}`);
  console.log(`problems        : ${info.problems.length ? info.problems.join(' | ') : 'none'}`);
  console.log('');
  if (info.problems.length > 0) failed = true;
}
process.exit(failed ? 1 : 0);
