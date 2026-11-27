#!/usr/bin/env node
/* tools/scene-server.cjs — 本地预览星球的临时服务器（不随插件发布）
 *
 *   node tools/scene-server.cjs [port]
 *
 * 提供三样东西，和宿主路由的行为一致：
 *   /                       tools/scene-demo.html
 *   /src/scene/engine-scene.js
 *   /dsh-mls-scene/<name>.msc    读 assets/scene/<name>.msc.gz，gunzip 后原样发出
 *
 * 之所以要"解压后发出"：生产路径（index.js 的路由）就是这么做的，客户端拿到
 * 的字节可以直接 new Int16Array，不需要 DecompressionStream。
 */
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2] || 8123);
const cache = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/' || url === '/index.html') {
    return send(res, 200, MIME['.html'], fs.readFileSync(path.join(__dirname, 'scene-demo.html')));
  }
  if (url === '/src/scene/engine-scene.js') {
    return send(res, 200, MIME['.js'], fs.readFileSync(path.join(ROOT, 'src', 'scene', 'engine-scene.js')));
  }
  const m = /^\/dsh-mls-scene\/([a-z]+)\.msc$/.exec(url);
  if (m) {
    const name = m[1];
    let buf = cache.get(name);
    if (!buf) {
      const file = path.join(ROOT, 'assets', 'scene', name + '.msc.gz');
      if (!fs.existsSync(file)) return send(res, 404, 'text/plain', 'no such scene');
      buf = zlib.gunzipSync(fs.readFileSync(file));
      cache.set(name, buf);
    }
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': 'no-store',
    });
    return res.end(buf);
  }
  return send(res, 404, 'text/plain', 'not found: ' + url);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('[scene-server] http://127.0.0.1:' + PORT + '/');
});
