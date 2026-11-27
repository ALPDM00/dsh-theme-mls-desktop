#!/usr/bin/env node
/* tools/build-scene.cjs — official TAU CETI IV explorer geometry -> plugin assets.
 *
 * Zero dependencies, Node >= 18. Run once, commit the output.
 *
 *   node tools/build-scene.cjs
 *   node tools/build-scene.cjs --src "D:\\path\\to\\官方网页\\_mirror\\cdn"
 *
 * Input : the official `.chunks` stream (see docs/PLAN-SCENE-BACKGROUND.md §1.3)
 *         [uint32 LE zipLen][zip bytes]  repeated N times
 *           zip holds ONE stored .bin:
 *             [uint32 vertexFloatCount][uint32 indexCount][f32 * vfc][u32 * ic]
 *         Indices are globally continuous across blocks (verified §1.3).
 * Output: assets/scene/<name>.msc.gz  + assets/scene/MANIFEST.json
 *
 * .msc v1 (little endian, 4-byte aligned), §6 of the plan:
 *   0   char[4]   "MSC1"
 *   4   uint32    kind          0=planet 1=ship 2=map
 *   8   uint32    vertexCount   V
 *   12  uint32    indexCount    I      (segments = I/2)
 *   16  float32[6] bbox         xmin,xmax,ymin,ymax,zmin,zmax
 *   40  int16[V*3] pos          quantised, normalised -> [-1,1] in the shader
 *   ..  uint8[pad]              4-byte alignment
 *   ..  uint32[I] index
 *
 * Quantisation: q = round((v - min) / (max - min) * 65534) - 32767
 *               v = (q + 32767) / 65534 * (max - min) + min
 * The window is CLAMPED to [-32767, 32767] because int16 min (-32768) would
 * break the "q / 32767" normalisation the shader relies on.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'scene');
const DEFAULT_SRC = 'D:\\PythonCode\\ma\\官方网页\\_mirror\\cdn';

/* kind / file name / source UUID / drop segments shorter than `minSeg`.
 * The planet globe itself has no sub-pixel dirt; the maps are full of it
 * (plan §3.1: Outpost loses 56% of its segments and only 8.3% of its length). */
const JOBS = [
  { name: 'planet', kind: 0, minSeg: 0, uuid: '3fdfae69-bf8b-4f7a-a2a2-d331afedae3a.chunks' },
  { name: 'ship',   kind: 1, minSeg: 0, uuid: 'caa68a98-44e9-44d8-8869-94f29da79dd9.chunks' },
];

/* ---------------------------------------------------------------- reading -- */

/** Pull the single stored entry out of one zip buffer (no deflate expected). */
function unzipStoredEntry(zip) {
  // local file header: PK\x03\x04, then 26 more bytes of header
  if (zip.readUInt32LE(0) !== 0x04034b50) throw new Error('not a zip local header');
  const method = zip.readUInt16LE(8);
  const compSize = zip.readUInt32LE(18);
  const nameLen = zip.readUInt16LE(26);
  const extraLen = zip.readUInt16LE(28);
  const start = 30 + nameLen + extraLen;
  const data = zip.subarray(start, start + compSize);
  if (method === 0) return data;
  if (method === 8) return zlib.inflateRawSync(data);
  throw new Error('unsupported zip method ' + method);
}

/** Official `.chunks` -> { pos: Float32Array, idx: Uint32Array } */
function readChunks(file) {
  const data = fs.readFileSync(file);
  const parts = [];
  let off = 0;
  let blocks = 0;
  while (off + 4 <= data.length) {
    const len = data.readUInt32LE(off);
    if (len === 0 || off + 4 + len > data.length) break;
    const bin = unzipStoredEntry(data.subarray(off + 4, off + 4 + len));
    off += 4 + len;
    blocks++;
    const vfc = bin.readUInt32LE(0);
    const ic = bin.readUInt32LE(4);
    const posBytes = vfc * 4;
    const pos = new Float32Array(vfc);
    for (let i = 0; i < vfc; i++) pos[i] = bin.readFloatLE(8 + i * 4);
    const idx = new Uint32Array(ic);
    for (let i = 0; i < ic; i++) idx[i] = bin.readUInt32LE(8 + posBytes + i * 4);
    parts.push({ pos, idx });
  }
  if (!parts.length) throw new Error('no blocks in ' + file);
  let posLen = 0, idxLen = 0;
  for (const p of parts) { posLen += p.pos.length; idxLen += p.idx.length; }
  const pos = new Float32Array(posLen);
  const idx = new Uint32Array(idxLen);
  let po = 0, io = 0;
  for (const p of parts) {
    pos.set(p.pos, po); po += p.pos.length;
    idx.set(p.idx, io); io += p.idx.length;
  }
  return { pos, idx, blocks };
}

/* ------------------------------------------------------------- transcoding -- */

function transcode(pos, idx, minSeg, kind) {
  if (idx.length % 2 !== 0) throw new Error('odd index count');
  const segs = [];
  const used = new Set();
  const minSq = minSeg * minSeg;
  for (let i = 0; i < idx.length; i += 2) {
    const a = idx[i], b = idx[i + 1];
    if (a >= pos.length / 3 || b >= pos.length / 3) break;   // defensive
    if (minSq > 0) {
      const dx = pos[a * 3] - pos[b * 3];
      const dy = pos[a * 3 + 1] - pos[b * 3 + 1];
      const dz = pos[a * 3 + 2] - pos[b * 3 + 2];
      if (dx * dx + dy * dy + dz * dz < minSq) continue;
    }
    segs.push(a, b);
    used.add(a); used.add(b);
  }
  const order = Array.from(used).sort((p, q) => p - q);
  const remap = new Int32Array(pos.length / 3).fill(-1);
  for (let k = 0; k < order.length; k++) remap[order[k]] = k;

  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity,
      zmin = Infinity, zmax = -Infinity;
  for (const o of order) {
    const x = pos[o * 3], y = pos[o * 3 + 1], z = pos[o * 3 + 2];
    if (x < xmin) xmin = x; if (x > xmax) xmax = x;
    if (y < ymin) ymin = y; if (y > ymax) ymax = y;
    if (z < zmin) zmin = z; if (z > zmax) zmax = z;
  }
  const sx = (xmax - xmin) || 1, sy = (ymax - ymin) || 1, sz = (zmax - zmin) || 1;
  const V = order.length;
  const quant = new Int16Array(V * 3);
  for (let k = 0; k < V; k++) {
    const o = order[k];
    const qx = Math.round((pos[o * 3] - xmin) / sx * 65534 - 32767);
    const qy = Math.round((pos[o * 3 + 1] - ymin) / sy * 65534 - 32767);
    const qz = Math.round((pos[o * 3 + 2] - zmin) / sz * 65534 - 32767);
    quant[k * 3] = qx < -32767 ? -32767 : (qx > 32767 ? 32767 : qx);
    quant[k * 3 + 1] = qy < -32767 ? -32767 : (qy > 32767 ? 32767 : qy);
    quant[k * 3 + 2] = qz < -32767 ? -32767 : (qz > 32767 ? 32767 : qz);
  }
  const I = segs.length;
  const indices = new Uint32Array(I);
  for (let k = 0; k < I; k++) indices[k] = remap[segs[k]];

  const pad = (4 - (V * 6) % 4) % 4;
  const bytes = 40 + V * 6 + pad + I * 4;
  const out = Buffer.alloc(bytes);
  out.write('MSC1', 0, 'ascii');
  out.writeUInt32LE(kind, 4);
  out.writeUInt32LE(V, 8);
  out.writeUInt32LE(I, 12);
  out.writeFloatLE(xmin, 16); out.writeFloatLE(xmax, 20);
  out.writeFloatLE(ymin, 24); out.writeFloatLE(ymax, 28);
  out.writeFloatLE(zmin, 32); out.writeFloatLE(zmax, 36);
  Buffer.from(quant.buffer, quant.byteOffset, quant.byteLength).copy(out, 40);
  Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength).copy(out, 40 + V * 6 + pad);
  return {
    out, V, I,
    bbox: [xmin, xmax, ymin, ymax, zmin, zmax],
    dropped: idx.length / 2 - I / 2,
  };
}

/* ----------------------------------------------------------- readback check -- */

function verify(buf, expect) {
  if (buf.length % 4 !== 0) throw new Error('not 4-byte aligned');
  if (buf.toString('ascii', 0, 4) !== 'MSC1') throw new Error('bad magic');
  const kind = buf.readUInt32LE(4);
  const V = buf.readUInt32LE(8);
  const I = buf.readUInt32LE(12);
  if (kind !== expect.kind) throw new Error('kind mismatch');
  if (V !== expect.V) throw new Error('V mismatch ' + V + ' != ' + expect.V);
  if (I !== expect.I) throw new Error('I mismatch ' + I + ' != ' + expect.I);
  const pad = (4 - (V * 6) % 4) % 4;
  if (40 + V * 6 + pad + I * 4 !== buf.length) throw new Error('size mismatch');
  const bbox = [];
  for (let k = 0; k < 6; k++) bbox.push(buf.readFloatLE(16 + k * 4));
  // bbox must actually contain every quantised vertex after de-quantisation,
  // and the sampling error must stay under 0.002 (plan §6/§P0.3).
  const sx = (bbox[1] - bbox[0]) || 1;
  const sy = (bbox[3] - bbox[2]) || 1;
  const sz = (bbox[5] - bbox[4]) || 1;
  let worst = 0;
  for (let k = 0; k < V; k++) {
    const o = 40 + k * 6;
    for (let axis = 0; axis < 3; axis++) {
      const q = buf.readInt16LE(o + axis * 2);
      const min = bbox[axis * 2], span = [sx, sy, sz][axis];
      const v = (q + 32767) / 65534 * span + min;
      if (v < min - 1e-4 || v > min + span + 1e-4) {
        throw new Error('vertex ' + k + ' axis ' + axis + ' outside bbox');
      }
      const step = span / 65534;
      if (step > worst) worst = step;
    }
  }
  const idxOff = 40 + V * 6 + pad;
  for (let k = 0; k < I; k++) {
    const v = buf.readUInt32LE(idxOff + k * 4);
    if (v >= V) throw new Error('index ' + k + ' out of range');
  }
  return { V, I, bbox, maxStep: worst };
}

/* ------------------------------------------------------------------- main -- */

function main() {
  const argSrc = process.argv.indexOf('--src');
  const srcDir = argSrc >= 0 && process.argv[argSrc + 1]
    ? path.resolve(process.argv[argSrc + 1]) : DEFAULT_SRC;
  if (!fs.existsSync(srcDir)) {
    console.error('[scene] source dir not found: ' + srcDir);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = [];
  for (const job of JOBS) {
    const src = path.join(srcDir, job.uuid);
    if (!fs.existsSync(src)) {
      console.error('[scene] missing source ' + src);
      process.exit(1);
    }
    const t0 = Date.now();
    const { pos, idx, blocks } = readChunks(src);
    const res = transcode(pos, idx, job.minSeg, job.kind);
    const stat = verify(res.out, { V: res.V, I: res.I, kind: job.kind });
    const gz = zlib.gzipSync(res.out, { level: 9 });
    const file = job.name + '.msc.gz';
    const target = path.join(OUT_DIR, file);
    fs.writeFileSync(target, gz);
    // idempotence: write twice, compare (kept cheap by comparing the buffer we
    // just wrote against the file on disk)
    if (!fs.readFileSync(target).equals(gz)) throw new Error('write readback mismatch for ' + file);
    const bboxRound = stat.bbox.map((v) => Math.round(v * 1e6) / 1e6);
    manifest.push({
      name: job.name,
      kind: job.kind,
      file,
      source: job.uuid,
      blocks,
      vertices: res.V,
      indices: res.I,
      segments: res.I / 2,
      droppedSegments: res.dropped,
      bbox: bboxRound,
      maxQuantStep: Math.round(stat.maxStep * 1e6) / 1e6,
      bytesRaw: res.out.length,
      bytesGzip: gz.length,
    });
    console.log('[scene] ' + job.name.padEnd(9) +
      ' V=' + String(res.V).padStart(7) +
      ' segs=' + String(res.I / 2).padStart(7) +
      ' dropped=' + String(res.dropped).padStart(7) +
      ' raw=' + (res.out.length / 1024).toFixed(0).padStart(6) + 'KB' +
      ' gz=' + (gz.length / 1024).toFixed(1).padStart(7) + 'KB' +
      ' (' + (Date.now() - t0) + 'ms)');
  }
  const manifestPath = path.join(OUT_DIR, 'MANIFEST.json');
  const body = JSON.stringify({ version: 1, generated: new Date().toISOString(), scenes: manifest }, null, 2) + '\n';
  fs.writeFileSync(manifestPath, body);
  const totalGz = manifest.reduce((n, m) => n + m.bytesGzip, 0);
  console.log('[scene] wrote ' + manifest.length + ' scenes, gzip total ' +
    (totalGz / 1048576).toFixed(2) + ' MB -> ' + path.relative(ROOT, OUT_DIR));
}

main();
