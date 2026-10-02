#!/usr/bin/env node
/* auto-apply.test.cjs — the "install the plugin and the shell effects work" path.
 *
 * The whole point of `shell-patch/auto.cjs` is that nobody has to think about it,
 * which makes its failure modes the quiet kind: patching when it should not,
 * skipping when it should not, or blocking an install. So this file drives the
 * *real* auto.cjs and asserts the decisions, not the archive surgery beneath them.
 *
 * Three groups:
 *
 *   discovery  -- target.cjs, against synthetic installs built with the real
 *                 packer, so a wrong directory can never be mistaken for the
 *                 Desktop and a right one is never missed.
 *   probe      -- the cheap state read, cross-checked against the two archives
 *                 that actually exist on this machine: the pristine backup must
 *                 read `unpatched` and the installed one must read `current`.
 *                 A false `current` here would silently disable the patcher.
 *   policy     -- auto.cjs, run from a temporary harness whose target / apply /
 *                 revert modules are stubs. Every branch -- skip, apply, refuse,
 *                 repair, lock, kill switch -- is asserted for the call it makes
 *                 and the exit code it returns.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const asar = require(path.join(__dirname, '..', 'shell-patch', 'lib', 'asar.cjs'));

const root = path.join(__dirname, '..');
const target = require(path.join(root, 'shell-patch', 'target.cjs'));
const { TARGET_FILES, MARKER, revisionComment } = require(path.join(root, 'shell-patch', 'patches.cjs'));

/**
 * The Desktop installation on *this* machine, discovered the same way the
 * patcher finds it: an explicit `DSH_THEME_APP` -> what the shell tells its
 * runtime children -> `process.execPath` -> launcher shortcut -> the
 * remembered `.target.json` -> platform defaults. Nothing here is pinned to one
 * developer's disk layout, so the suite travels between machines; where no
 * shell exists the rows that need one SKIP with a reason instead of passing
 * vacuously.
 */
function discoverInstall() {
  try {
    const found = target.resolveApp({});
    return found !== null && typeof found.app === 'string' ? found.app : null;
  } catch {
    return null;
  }
}
/** The installation this patch set is written for, or null when absent. */
const INSTALLED_APP = discoverInstall();
/** ...and its archive. `probeShell()` wants the app root, `readEntry()` the file. */
const INSTALLED = INSTALLED_APP === null ? null : path.join(INSTALLED_APP, 'resources', 'app.asar');
/** Where a pristine copy of the patched shell is expected to live. */
const PRISTINE_CANDIDATES = [
  ...(INSTALLED === null ? [] : [`${INSTALLED}.dsh-theme-marathon.bak`]),
  path.join(root, '..', 'deepseekharness_desktop', 'resources', 'app.asar.dsh-theme-marathon.bak'),
];
/** Whether a real installation was found. Guards the `null` INSTALLED. */
function installed() {
  return INSTALLED !== null && fs.existsSync(INSTALLED);
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-auto-'));
/** A temp directory that lives until the process ends. */
function temp(name) {
  const directory = path.join(temporary, name);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

let passed = 0;
const skipped = [];
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
function skip(name, why) {
  skipped.push(name);
  console.log(`  SKIP ${name} (${why})`);
}

// ---------------------------------------------------------------------------
// Synthetic installations
// ---------------------------------------------------------------------------

/**
 * Build a directory that `verifyApp()` should accept.
 *
 * Packed with the real asar writer, because the point is to test the reader:
 * hand-rolled archives would only prove the two agree with each other.
 *
 * Requests with identical arguments return the **same** directory. Creating a
 * fixture costs a handful of directories -- one per path segment of
 * `dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html` -- and
 * removing one costs ~0.2 s on a virus-scanned temp volume, so a suite that built
 * its own copy per test spends more time in teardown than in assertions. Nothing
 * here writes to a fixture after it is built, so sharing is safe; the tests that
 * add paths to one (the runtime tree an `execPath` anchor needs) add the same
 * paths to the same fixture.
 * @param {object} options
 * @param {string} options.name - package name to declare inside `package.json`
 * @param {object} options.files - archive-relative path -> text
 * @param {boolean} [options.omitArchive] - leave out `resources/app.asar`
 * @param {boolean} [options.truncate] - write a broken archive
 * @returns {string} the app root
 */
const appCache = new Map();
/**
 * The one source tree every shape is packed from.
 *
 * All shapes write the same four files (`package.json` plus the three the patch
 * edits), so they can share a single tree and differ only in content. Building a
 * private tree per shape cost seven directories each, and directories are the
 * expensive thing to remove here -- see the teardown note at the end of the file.
 */
const fixtureSource = path.join(temporary, 'fixture-source');

/**
 * Write the shared source tree: `package.json` plus whichever target files this
 * shape keeps.
 * @param {string} name - the package name to declare
 * @param {object} files - archive-relative path -> text
 */
function writeFixtureSource(name, files) {
  fs.mkdirSync(fixtureSource, { recursive: true });
  fs.writeFileSync(path.join(fixtureSource, 'package.json'), JSON.stringify({ name, version: '9.9.9' }));
  for (const [relative, text] of Object.entries(files)) {
    const file = path.join(fixtureSource, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  // The tree is shared between shapes, so a file this shape deliberately omits has
  // to be removed rather than merely not written -- otherwise the previous shape's
  // copy is still there and the archive is not what the test asked for.
  for (const file of TARGET_FILES) {
    if (file in files) continue;
    try {
      fs.rmSync(path.join(fixtureSource, ...file.split('/')), { force: true });
    } catch {
      /* not there in the first place */
    }
  }
}

function syntheticApp(options) {
  const key = JSON.stringify(options);
  const cached = appCache.get(key);
  if (cached !== undefined) return cached;

  const { name, files, omitArchive = false, truncate = false } = options;
  const app = temp(`app-${appCache.size}`);
  if (!omitArchive) {
    const archive = path.join(app, 'resources', 'app.asar');
    fs.mkdirSync(path.dirname(archive), { recursive: true });
    if (truncate) {
      fs.writeFileSync(archive, Buffer.from('not an asar at all'));
    } else {
      writeFixtureSource(name, files);
      asar.createPackage(fixtureSource, archive, {});
    }
  }
  appCache.set(key, app);
  return app;
}

/** The three files the patch edits, in the shape a stock shell has them. */
const STOCK_FILES = Object.fromEntries(TARGET_FILES.map((file) => [file, `// stock ${file}\n`]));
/** One file carrying an older revision's block: the marker, but a wrong digest. */
const STALE_FILES = {
  ...STOCK_FILES,
  'lib/main.js': `// stock lib/main.js\n/* ${MARKER} --see shell-patch/patches.cjs. patch-revision:000000000000 */\n`,
};

console.log('discovery');

test('walkUp finds the installation from a path deep inside it', () => {
  const app = syntheticApp({ name: '@deepseek-ai/dsh-desktop', files: STOCK_FILES });
  const inside = path.join(app, 'resources', 'runtime', 'primary-runtime', 'dependencies', 'node', 'bin');
  fs.mkdirSync(inside, { recursive: true });
  const found = target.walkUp(path.join(inside, 'node.exe'));
  assert.ok(found.includes(app), `walkUp(${inside}) = ${JSON.stringify(found)}`);
});

test('walkUp stops at eight levels and does not invent a match', () => {
  const app = syntheticApp({ name: '@deepseek-ai/dsh-desktop', files: STOCK_FILES });
  const deep = path.join(app, ...Array.from({ length: 9 }, (unused, index) => `d${index}`));
  fs.mkdirSync(deep, { recursive: true });
  assert.deepStrictEqual(target.walkUp(deep), []);
});

test('verifyApp rejects a directory with no resources/app.asar', () => {
  const app = syntheticApp({ name: '@deepseek-ai/dsh-desktop', files: STOCK_FILES, omitArchive: true });
  const verdict = target.verifyApp(app);
  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.reason, /app\.asar/u);
});

test('verifyApp rejects a truncated archive instead of trusting the file name', () => {
  const app = syntheticApp({ name: '@deepseek-ai/dsh-desktop', files: STOCK_FILES, truncate: true });
  const verdict = target.verifyApp(app);
  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.reason, /unreadable archive/u);
});

test('verifyApp rejects an Electron app that is not the Desktop', () => {
  const app = syntheticApp({ name: 'some-other-electron-app', files: STOCK_FILES });
  const verdict = target.verifyApp(app);
  assert.strictEqual(verdict.ok, false);
  assert.match(verdict.reason, /some-other-electron-app/u);
});

test('verifyApp accepts the Desktop and reports its version', () => {
  const app = syntheticApp({ name: '@deepseek-ai/dsh-desktop', files: STOCK_FILES });
  const verdict = target.verifyApp(app);
  assert.strictEqual(verdict.ok, true);
  assert.strictEqual(verdict.package, '@deepseek-ai/dsh-desktop');
  assert.strictEqual(verdict.version, '9.9.9');
  assert.ok(verdict.archive.endsWith(path.join('resources', 'app.asar')));
});

test('verifyApp and probeShell both accept the macOS layout (Resources/app.asar)', () => {
  const app = temp('mac-app');
  const archive = path.join(app, 'Resources', 'app.asar');
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  // Same shared source tree, packed into the macOS place instead.
  writeFixtureSource('@deepseek-ai/dsh-desktop', STOCK_FILES);
  asar.createPackage(fixtureSource, archive, {});
  assert.strictEqual(target.verifyApp(app).ok, true);
  // probeShell has to find it there too. Asserting only verifyApp would leave the
  // reader free to hardcode `resources/`, which is how the first version of this
  // file failed silently on a platform that was never going to be a Mac.
  //
  // The exact path probeShell reports is deliberately not asserted: NTFS is
  // case-insensitive, so on Windows the `resources/app.asar` spelling resolves to
  // this very directory and either answer is correct. The separate
  // `ARCHIVE_DIR_DARWIN` spelling is what a case-sensitive filesystem needs.
  assert.strictEqual(target.probeShell(app).state, 'unpatched');
});

test('pathPrefixes pulls the install directory out of a shortcut blob', () => {
  // The shape a real Start Menu .lnk decodes to: the target path appears glued
  // to its neighbours, which is why prefixes are cut at separators.
  const blob = 'EElectron desktop shell#D:\\Software\\deepseekharness_desktop8D:\\Software\\deepseekharness_desktop\\DeepSeek Harness.exe`';
  const found = target.pathPrefixes(blob);
  assert.ok(found.includes('D:\\Software\\deepseekharness_desktop'), JSON.stringify(found));
});

test('pathPrefixes ignores text that holds no absolute path', () => {
  assert.deepStrictEqual(target.pathPrefixes('no paths here / just words'), []);
});

test('utf16Runs decodes a .lnk body', () => {
  const runs = target.utf16Runs(Buffer.from('#C:\\Apps\\DeepSeek Harness\u0000', 'utf16le'));
  assert.ok(runs.some((run) => run.includes('C:\\Apps')), JSON.stringify(runs));
});

test('runsFrom is true for an interpreter inside the app and false outside', () => {
  const app = syntheticApp({ name: '@deepseek-ai/dsh-desktop', files: STOCK_FILES });
  const inner = path.join(app, 'resources', 'runtime', 'node', 'bin', 'node.exe');
  assert.strictEqual(target.runsFrom(app, { env: {}, execPath: inner }), true);
  assert.strictEqual(target.runsFrom(app, { env: {}, execPath: '/usr/bin/node' }), false);
  assert.strictEqual(
    target.runsFrom(app, { env: { DSH_DESKTOP_NODE_EXECUTABLE: inner }, execPath: '/usr/bin/node' }),
    true,
  );
});

test('resolveApp honours an explicit --app and reports how it found it', () => {
  const app = syntheticApp({ name: '@deepseek-ai/dsh-desktop', files: STOCK_FILES });
  const found = target.resolveApp({ explicit: app, env: {}, execPath: '/usr/bin/node' });
  assert.strictEqual(found.app, app);
  assert.strictEqual(found.how, 'explicit');
  assert.strictEqual(found.insideApp, false);
});

test('an explicit --app that misses is fatal, never a fallback to guessing', () => {
  const found = target.resolveApp({ explicit: path.join(temporary, 'nope'), env: { DSH_THEME_APP: path.join(temporary, 'nope') }, execPath: '/usr/bin/node' });
  assert.strictEqual(found.app, null);
  assert.strictEqual(found.how, 'explicit');
  assert.ok(typeof found.reason === 'string' && found.reason !== '', 'expected a reason');
});

test('resolveApp follows the Desktop env anchors into the installation', () => {
  const app = syntheticApp({ name: '@deepseek-ai/dsh-desktop', files: STOCK_FILES });
  const inner = path.join(app, 'resources', 'runtime', 'node', 'bin', 'node.exe');
  fs.mkdirSync(path.dirname(inner), { recursive: true });
  fs.writeFileSync(inner, '');
  const found = target.resolveApp({ env: { DSH_DESKTOP_NODE_EXECUTABLE: inner }, execPath: '/usr/bin/node' });
  assert.strictEqual(found.app, app);
  assert.strictEqual(found.how, 'env DSH_DESKTOP_NODE_EXECUTABLE');
  assert.strictEqual(found.insideApp, true, 'an env anchor inside the app means we run from inside it');
});

test('resolveApp says nothing was found rather than throwing', () => {
  // `DSH_THEME_CACHE` has to be redirected too: the real cache is written after
  // the first successful resolve on this machine, and it would keep answering
  // "found it" for a test that is asking about finding nothing.
  const found = target.resolveApp({
    env: {
      LOCALAPPDATA: path.join(temporary, 'empty-local'),
      APPDATA: path.join(temporary, 'empty-roaming'),
      DSH_THEME_CACHE: path.join(temporary, 'no-such-cache.json'),
    },
    execPath: path.join(temporary, 'nowhere', 'node.exe'),
  });
  assert.strictEqual(found.app, null, `found ${found.app} via ${found.how}`);
  assert.strictEqual(found.how, 'search');
  assert.ok(Array.isArray(found.tried));
});

test('the cached location is reused when nothing else identifies the install', () => {
  const app = syntheticApp({ name: '@deepseek-ai/dsh-desktop', files: STOCK_FILES });
  const cache = path.join(temp('cache'), 'target.json');
  fs.writeFileSync(cache, JSON.stringify({ app }));
  const found = target.resolveApp({
    env: {
      LOCALAPPDATA: path.join(temporary, 'empty-local'),
      APPDATA: path.join(temporary, 'empty-roaming'),
      DSH_THEME_CACHE: cache,
    },
    execPath: path.join(temporary, 'nowhere', 'node.exe'),
  });
  assert.strictEqual(found.app, app);
  assert.strictEqual(found.how, 'cached');
});

test('a stale cache entry does not stop the search', () => {
  const app = syntheticApp({ name: '@deepseek-ai/dsh-desktop', files: STOCK_FILES });
  const cache = path.join(temp('cache-bad'), 'target.json');
  fs.writeFileSync(cache, JSON.stringify({ app: path.join(temporary, 'moved-away') }));
  const previous = process.env.DSH_THEME_APP;
  process.env.DSH_THEME_APP = app;
  try {
    const found = target.resolveApp({
      env: {
        DSH_THEME_APP: app,
        LOCALAPPDATA: path.join(temporary, 'empty-local'),
        DSH_THEME_CACHE: cache,
      },
      execPath: path.join(temporary, 'nowhere', 'node.exe'),
    });
    assert.strictEqual(found.app, app);
  } finally {
    if (previous === undefined) delete process.env.DSH_THEME_APP;
    else process.env.DSH_THEME_APP = previous;
  }
});

// ---------------------------------------------------------------------------

console.log('\nprobe');

const pristine = process.env.DSH_DESKTOP_ASAR_STOCK ?? PRISTINE_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? null;

if (pristine === null) {
  skip('a pristine archive reads as unpatched', 'no backup found; set DSH_DESKTOP_ASAR_STOCK');
  skip('the installed archive reads as this revision', 'no backup found');
} else {
  /** A minimal app root whose archive is a copy of `from`. */
  const mirror = (name, from) => {
    const app = temp(name);
    fs.mkdirSync(path.join(app, 'resources'), { recursive: true });
    fs.copyFileSync(from, path.join(app, 'resources', 'app.asar'));
    return app;
  };

  test('a pristine archive reads as unpatched (and the read needs no extract)', () => {
    const app = mirror('pristine', pristine);
    const probe = target.probeShell(app);
    assert.strictEqual(probe.state, 'unpatched');
    for (const file of TARGET_FILES) assert.strictEqual(probe.files[file], 'unpatched', file);
    assert.strictEqual(target.needsPatch(probe.state), true);
  });

  if (installed()) {
    test('the installed archive reads as this revision', () => {
      const probe = target.probeShell(INSTALLED_APP);
      assert.strictEqual(probe.state, 'current', JSON.stringify(probe.files));
      assert.strictEqual(target.needsPatch(probe.state), false);
      assert.strictEqual(target.needsRepair(probe.state), false);
    });
    test('the installed archive carries every target file', () => {
      for (const file of TARGET_FILES) {
        assert.strictEqual(typeof target.readEntry(INSTALLED, file), 'string', `${file} unreadable`);
      }
    });
  } else {
    skip('the installed archive reads as this revision', `${INSTALLED} is absent`);
    skip('the installed archive carries every target file', `${INSTALLED} is absent`);
  }
}

test('an older revision reads as stale, not as current', () => {
  const app = syntheticApp({ name: '@deepseek-ai/dsh-desktop', files: STALE_FILES });
  const probe = target.probeShell(app);
  assert.strictEqual(probe.state, 'stale');
  assert.strictEqual(target.needsPatch(probe.state), false);
  assert.strictEqual(target.needsRepair(probe.state), true);
});

test('a half-patched shell reads as mixed, and also needs a repair', () => {
  const files = { ...STOCK_FILES, 'lib/preload-app.cjs': `// patched\n/* ${MARKER} --see shell-patch/patches.cjs. ${revisionComment('lib/preload-app.cjs') } */\n` };
  const app = syntheticApp({ name: '@deepseek-ai/dsh-desktop', files });
  const probe = target.probeShell(app);
  assert.strictEqual(probe.state, 'mixed', JSON.stringify(probe.files));
  assert.strictEqual(target.needsRepair(probe.state), true);
});

test('an archive missing a target file reads as unreadable, not as unpatched', () => {
  const files = { ...STOCK_FILES };
  delete files['lib/preload-app.cjs'];
  const app = syntheticApp({ name: '@deepseek-ai/dsh-desktop', files });
  const probe = target.probeShell(app);
  assert.strictEqual(probe.state, 'unreadable');
  assert.strictEqual(target.needsPatch(probe.state), false, 'unreadable must not look like work to do');
  assert.strictEqual(target.needsRepair(probe.state), false);
});

// ---------------------------------------------------------------------------
// policy: the real auto.cjs, driven from a harness with stubbed edges
// ---------------------------------------------------------------------------

console.log('\npolicy');

/**
 * Build a harness holding a copy of the real auto.cjs, the real patches.cjs, the
 * real lib/ (auto.cjs reads the archive through lib/real-fs.cjs) and three stub
 * modules. Copying auto.cjs rather than reimplementing it is the point: the
 * decisions under test are the ones that actually ship.
 *
 * One instance serves the whole group (`policy` below). `reset()` clears the
 * state a test leaves behind; the stub modules are read fresh from
 * `control.json` on every call, so tests cannot contaminate each other through
 * module state -- and a directory costs ~0.2 s to remove on this volume, which
 * makes 20 of them pure waste. The one thing `reset()` has to be careful about
 * is the call log, because "was the patcher invoked" is the assertion.
 */
function harness() {
  const dir = temp('harness/shell-patch');
  fs.copyFileSync(path.join(root, 'shell-patch', 'auto.cjs'), path.join(dir, 'auto.cjs'));
  fs.copyFileSync(path.join(root, 'shell-patch', 'patches.cjs'), path.join(dir, 'patches.cjs'));
  // The whole directory, not one file: a future lib/ addition should not surface
  // here as a confusing MODULE_NOT_FOUND.
  const libSource = path.join(root, 'shell-patch', 'lib');
  const libTarget = path.join(dir, 'lib');
  fs.mkdirSync(libTarget, { recursive: true });
  for (const name of fs.readdirSync(libSource)) {
    fs.copyFileSync(path.join(libSource, name), path.join(libTarget, name));
  }
  const app = syntheticApp({ name: '@deepseek-ai/dsh-desktop', files: STOCK_FILES });

  const control = path.join(dir, 'control.json');
  const write = (state, extra = {}) =>
    fs.writeFileSync(control, JSON.stringify({ state, insideApp: true, app, applyCode: 0, revertCode: 0, ...extra }));
  const lock = path.join(dir, '.auto-apply.lock');
  const callsFile = path.join(dir, 'calls.log');

  fs.writeFileSync(
    path.join(dir, 'target.cjs'),
    `'use strict';
const fs = require('fs');
const control = () => JSON.parse(fs.readFileSync(${JSON.stringify(control)}, 'utf8'));
exports.probeShell = (app) => { const c = control(); return { app, archive: app + '/resources/app.asar', state: c.state, files: {}, revision: {}, archiveMtime: 0, backup: null }; };
exports.resolveApp = () => { const c = control(); return c.app === null ? { app: null, how: 'search', tried: ['a', 'b'] } : { app: c.app, archive: c.app + '/resources/app.asar', how: 'explicit', insideApp: c.insideApp }; };
exports.needsPatch = (state) => state === 'unpatched';
exports.needsRepair = (state) => state === 'stale' || state === 'mixed';
exports.writeCache = () => true;
`,
  );
  const recorder = (name, codeKey) => `'use strict';
const fs = require('fs');
exports.main = (argv) => {
  fs.appendFileSync(${JSON.stringify(callsFile)}, ${JSON.stringify(name)} + ' ' + JSON.stringify(argv) + '\\n');
  return JSON.parse(fs.readFileSync(${JSON.stringify(control)}, 'utf8'))[${JSON.stringify(codeKey)}];
};
`;
  fs.writeFileSync(path.join(dir, 'apply.cjs'), recorder('apply', 'applyCode'));
  fs.writeFileSync(path.join(dir, 'revert.cjs'), recorder('revert', 'revertCode'));

  const calls = () => {
    try {
      return fs
        .readFileSync(callsFile, 'utf8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => [line.slice(0, line.indexOf(' ')), JSON.parse(line.slice(line.indexOf(' ') + 1))]);
    } catch {
      return [];
    }
  };
  /** Between tests: forget the calls, and drop any lock a test planted. */
  const reset = () => {
    for (const file of [callsFile, lock]) {
      try {
        fs.rmSync(file, { force: true });
      } catch {
        /* nothing to remove */
      }
    }
  };
  /** Run the real auto.cjs, capturing stdout. */
  const run = (argv, env = {}) => {
    const auto = require(path.join(dir, 'auto.cjs'));
    const out = [];
    const real = console.log;
    console.log = (...args) => out.push(args.join(' '));
    let code;
    try {
      code = auto.main(argv, { ...process.env, ...env });
    } finally {
      console.log = real;
    }
    return { code, out: out.join('\n'), calls: calls(), lock: fs.existsSync(lock) };
  };
  return { dir, app, lock, write, run, reset, calls };
}

/** The single harness the policy tests share. */
const policy = harness();

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_BUSY = 2;
const EXIT_UNRESOLVED = 3;
const EXIT_NEEDS_HUMAN = 4;

test('a stock shell is patched, with the installation passed through', () => {
  policy.reset();
  policy.write('unpatched');
  const result = policy.run([]);
  assert.strictEqual(result.code, EXIT_OK, result.out);
  assert.deepStrictEqual(result.calls, [['apply', ['--app', policy.app]]], result.out);
  assert.strictEqual(result.lock, false, 'the lock must be released');
});

test('a shell already carrying this revision is not opened at all', () => {
  policy.reset();
  policy.write('current');
  const result = policy.run([]);
  assert.strictEqual(result.code, EXIT_OK);
  assert.deepStrictEqual(result.calls, [], result.out);
  assert.match(result.out, /already patched/u);
});

test('--check reports and changes nothing', () => {
  policy.reset();
  policy.write('unpatched');
  const result = policy.run(['--check']);
  assert.strictEqual(result.code, EXIT_OK);
  assert.deepStrictEqual(result.calls, [], result.out);
  assert.match(result.out, /nothing changed|would be patched/u);
});

test('a stale revision is refused, with the repair command spelled out', () => {
  policy.reset();
  policy.write('stale');
  const result = policy.run([]);
  assert.strictEqual(result.code, EXIT_NEEDS_HUMAN, result.out);
  assert.deepStrictEqual(result.calls, [], 'a stale shell must never be written to');
  assert.match(result.out, /--repair/u);
});

test('--repair reverts before it applies', () => {
  policy.reset();
  policy.write('stale');
  const result = policy.run(['--repair']);
  assert.strictEqual(result.code, EXIT_OK, result.out);
  assert.deepStrictEqual(
    result.calls.map((call) => call[0]),
    ['revert', 'apply'],
    result.out,
  );
  assert.deepStrictEqual(result.calls[0][1], ['--app', policy.app]);
});

test('--lenient turns a refusal into a success, for installers', () => {
  policy.reset();
  policy.write('stale');
  const result = policy.run(['--lenient']);
  assert.strictEqual(result.code, EXIT_OK, result.out);
  assert.deepStrictEqual(result.calls, []);
});

test('an unreadable archive is reported, and nothing is attempted', () => {
  policy.reset();
  policy.write('unreadable');
  const result = policy.run([]);
  assert.strictEqual(result.code, EXIT_NEEDS_HUMAN, result.out);
  assert.deepStrictEqual(result.calls, []);
  assert.match(result.out, /does not contain the files/u);
});

test('an installation that cannot be found exits non-zero, loudly', () => {
  policy.reset();
  policy.write('unpatched', { app: null });
  const result = policy.run([]);
  assert.strictEqual(result.code, EXIT_UNRESOLVED, result.out);
  assert.deepStrictEqual(result.calls, []);
  assert.match(result.out, /could not find/u);
  assert.match(result.out, /--app/u);
});

test('an installation that cannot be found is not an install failure', () => {
  policy.reset();
  policy.write('unpatched', { app: null });
  assert.strictEqual(policy.run(['--lenient']).code, EXIT_OK);
  assert.strictEqual(policy.run(['--quiet', '--lenient']).code, EXIT_OK);
});

test('DSH_THEME_AUTO_PATCH=0 disables every automatic caller', () => {
  policy.reset();
  policy.write('unpatched');
  const result = policy.run([], { DSH_THEME_AUTO_PATCH: '0' });
  assert.strictEqual(result.code, EXIT_OK);
  assert.deepStrictEqual(result.calls, [], result.out);
  assert.match(result.out, /disabled/u);
});

test('the hook mode is quiet, lenient, and gated on running from inside the app', () => {
  policy.reset();
  policy.write('unpatched', { insideApp: false });
  const result = policy.run([], { DSH_THEME_AUTO_HOOK: '1' });
  assert.strictEqual(result.code, EXIT_OK, result.out);
  assert.deepStrictEqual(result.calls, [], 'a web session must not rewrite the Desktop archive');
  assert.match(result.out, /does not run from inside/u);
});

test('the hook mode patches when it really is running from inside', () => {
  policy.reset();
  policy.write('unpatched', { insideApp: true });
  const result = policy.run([], { DSH_THEME_AUTO_HOOK: '1' });
  assert.strictEqual(result.code, EXIT_OK, result.out);
  assert.deepStrictEqual(result.calls.map((call) => call[0]), ['apply']);
  assert.match(result.out, /restart/iu);
});

test('two runs cannot patch at once', () => {
  policy.reset();
  policy.write('unpatched');
  fs.writeFileSync(path.join(policy.dir, '.auto-apply.lock'), `${process.pid} ${Date.now()}\n`);
  const result = policy.run([]);
  assert.strictEqual(result.code, EXIT_BUSY, result.out);
  assert.deepStrictEqual(result.calls, [], 'the lock must hold the second run off');
  assert.match(result.out, /in progress/u);
});

test('an abandoned lock is stolen rather than deadlocking forever', () => {
  policy.reset();
  policy.write('unpatched');
  fs.writeFileSync(path.join(policy.dir, '.auto-apply.lock'), `999999 ${Date.now() - 11 * 60 * 1000}\n`);
  const result = policy.run([]);
  assert.strictEqual(result.code, EXIT_OK, result.out);
  assert.deepStrictEqual(result.calls.map((call) => call[0]), ['apply']);
});

test('--no-backup is passed through to the patcher', () => {
  policy.reset();
  policy.write('unpatched');
  const result = policy.run(['--no-backup']);
  assert.deepStrictEqual(result.calls[0][1], ['--app', policy.app, '--no-backup'], result.out);
});

test('--json emits one parseable object and nothing else the reader must skip', () => {
  policy.reset();
  policy.write('unpatched');
  const auto = require(path.join(policy.dir, 'auto.cjs'));
  const written = [];
  const real = process.stdout.write;
  process.stdout.write = (chunk) => {
    written.push(String(chunk));
    return true;
  };
  let code;
  try {
    code = auto.main(['--json'], { ...process.env });
  } finally {
    process.stdout.write = real;
  }
  const parsed = JSON.parse(written.join(''));
  assert.strictEqual(code, EXIT_OK);
  assert.strictEqual(parsed.app, policy.app);
  assert.strictEqual(parsed.action, 'apply');
  assert.strictEqual(parsed.exit, EXIT_OK);
});

test('an unknown flag is an error, not a silent typo-tolerant no-op', () => {
  policy.reset();
  policy.write('unpatched');
  assert.throws(() => require(path.join(policy.dir, 'auto.cjs')).main(['--ap', '/x'], process.env), /unknown argument/u);
});

test('--help prints the header and touches nothing', () => {
  policy.reset();
  policy.write('unpatched');
  const result = policy.run(['--help']);
  assert.strictEqual(result.code, EXIT_OK);
  assert.deepStrictEqual(result.calls, []);
  assert.match(result.out, /Usage:/u);
});

test('a failing patcher is reported as a failure, and the lock still comes off', () => {
  policy.reset();
  // The stub reports the status `control.json` asks for, so a failing patch is
  // arranged through the fixture rather than by rewriting the shared stub.
  policy.write('unpatched', { applyCode: 1 });
  const result = policy.run([]);
  assert.strictEqual(result.code, EXIT_FAILED, result.out);
  assert.deepStrictEqual(result.calls.map((call) => call[0]), ['apply']);
  assert.strictEqual(result.lock, false, 'a failure must not leave the lock behind');
});

// ---------------------------------------------------------------------------
// the host hook that calls all of this
// ---------------------------------------------------------------------------

console.log('\nhost hook');

const host = require(path.join(root, 'index.js'));

test('index.js exposes the hook and still exposes its original surface', () => {
  assert.strictEqual(typeof host.scheduleShellPatch, 'function');
  assert.strictEqual(host.name, 'dsh-theme-mls-desktop');
  assert.strictEqual(typeof host.apply, 'function');
  assert.match(host.NATIVE_BOOT_CSS, /data-mar-boot/u);
});

test('the host hook does not disable asar support in the process it runs in', () => {
  // The Host *is* Electron, and asar support is how it reads the runtime it was
  // launched from. Leaving `process.noAsar` set while loading the shell-patch
  // modules made the whole shell refuse to start on 2026-09-28: typert-loader
  // failed all 20 of its ESM imports, `webRuntime` was never provided and six
  // plugins stayed pending. This drives the real load path (index.js ->
  // shell-patch/target.cjs -> lib/asar.cjs) in one process.
  assert.ok(!process.noAsar, 'requiring index.js already disabled asar support');
  const previousApp = process.env.DSH_THEME_APP;
  // A *valid* installation, so the hook walks past resolution and loads the real
  // modules. It must never actually patch: we are not running from inside it,
  // and it already carries this revision.
  process.env.DSH_THEME_APP = INSTALLED_APP ?? temporary;
  const lines = [];
  try {
    host.scheduleShellPatch({ logger: { info: (text) => lines.push(String(text)) } });
  } finally {
    if (previousApp === undefined) delete process.env.DSH_THEME_APP;
    else process.env.DSH_THEME_APP = previousApp;
  }
  assert.ok(!process.noAsar, 'scheduleShellPatch disabled asar support (use shell-patch/lib/real-fs.cjs)');
  // index.js also snapshots and restores the switch. That net exists so a
  // regression cannot take the shell down, but it must never be *needed*: if it
  // fires, the library is wrong even though this process survived.
  assert.strictEqual(
    lines.filter((line) => /restored process\.noAsar/u.test(line)).length, 0,
    'a shell-patch loader still sets process.noAsar on load and is relying on the index.js net',
  );
});

// "An installation we are not running from" only means something when there is
// one on this machine. With none, the hook takes the "could not resolve" branch
// and the assertions below would be describing a different situation entirely --
// so this row SKIPs rather than passing vacuously.
if (INSTALLED_APP === null) {
  skip('the host hook refuses to touch an installation it is not running from', 'no Desktop installation on this machine');
} else {
  test('the host hook refuses to touch an installation it is not running from', () => {
    const previous = process.env.DSH_THEME_APP;
    process.env.DSH_THEME_APP = INSTALLED_APP;
    const lines = [];
    const fake = { logger: { info: (text) => lines.push(String(text)) } };
    try {
      host.scheduleShellPatch(fake);
    } finally {
      if (previous === undefined) delete process.env.DSH_THEME_APP;
      else process.env.DSH_THEME_APP = previous;
    }
    assert.strictEqual(lines.length, 1, JSON.stringify(lines));
    assert.match(lines[0], /^shell patch: /u);
    assert.match(lines[0], /does not run from inside|already patched/u);
  });
}

test('the host hook reports an unusable installation instead of failing the load', () => {
  const broken = temp('broken-install');
  fs.mkdirSync(path.join(broken, 'resources'), { recursive: true });
  fs.writeFileSync(path.join(broken, 'resources', 'app.asar'), 'junk');
  const previous = process.env.DSH_THEME_APP;
  process.env.DSH_THEME_APP = broken;
  const lines = [];
  const logged = [];
  try {
    assert.doesNotThrow(() =>
      host.scheduleShellPatch({
        logger: { info: (text) => lines.push(String(text)), warn: (text) => logged.push(String(text)) },
      }),
    );
  } finally {
    if (previous === undefined) delete process.env.DSH_THEME_APP;
    else process.env.DSH_THEME_APP = previous;
  }
  assert.strictEqual(lines.length, 1, JSON.stringify(lines));
  assert.match(lines[0], /^shell patch: could not resolve/u);
  assert.match(lines[0], /unreadable archive/u);
});

test('the host hook honours the kill switch', () => {
  const previous = process.env.DSH_THEME_AUTO_PATCH;
  process.env.DSH_THEME_AUTO_PATCH = '0';
  const lines = [];
  try {
    host.scheduleShellPatch({ logger: { info: (text) => lines.push(String(text)) } });
  } finally {
    if (previous === undefined) delete process.env.DSH_THEME_AUTO_PATCH;
    else process.env.DSH_THEME_AUTO_PATCH = previous;
  }
  assert.deepStrictEqual(lines, ['shell patch: skipped (DSH_THEME_AUTO_PATCH=0)']);
});

// ---------------------------------------------------------------------------

// One single delete at the very end.
//
// Every fixture is a directory tree, and on a virus-scanned volume removing one
// directory costs ~0.2 s (measured: 10 directories took 1.1 s, while the 115 MiB
// archive copy took 0.3 s to delete). So teardown is one call, the fixtures are
// shared between tests wherever their shape allows, and
// `DSH_AUTO_TEST_KEEP=1` skips it entirely for environments where deleting is
// guarded or slow -- it prints the directory so it can be removed by hand.
if (process.env.DSH_AUTO_TEST_KEEP === '1') {
  console.log(`\ntemporary fixtures kept at ${temporary}`);
} else {
  try {
    fs.rmSync(temporary, { recursive: true, force: true });
  } catch {
    /* the temp dir can stay; the assertions are already reported */
  }
}

console.log(`\n${passed}/${passed + failures.length} passed`);
if (skipped.length > 0) console.log(`${skipped.length} skipped`);
if (failures.length > 0) {
  console.log('\nfailures:');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exitCode = 1;
}
