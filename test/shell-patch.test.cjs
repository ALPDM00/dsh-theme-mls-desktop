#!/usr/bin/env node
/* shell-patch.test.cjs — the patch set must be provably correct without an install.
 *
 * Three kinds of assertion, cheapest first:
 *
 *   1. structural -- the entries are self-consistent (marker really is introduced
 *      by the replacement, no two entries share a marker, no anchor is nested
 *      inside another). These run everywhere and cost nothing.
 *   2. text of the caption guard -- the actual thing that regressed. The window
 *      buttons are hidden by one entry and re-shown by a stock IPC handler in the
 *      same file, so the two are asserted together: the state, the park, the
 *      replay, and the ordering that makes the declaration reachable.
 *   3. the stale rule -- the classification that decides patch / skip / refuse.
 *
 * Pass an archive to also run the two checks that need the real shell text:
 * every anchor must hit exactly once *once the earlier entries have landed*, and
 * the patched files must parse. Point `--archive` (or `DSH_DESKTOP_ASAR_STOCK`)
 * at the pristine backup; the standard install path is tried by default.
 *
 *   node --experimental-vm-modules test/shell-patch.test.cjs
 *
 * Without an archive those are reported as SKIP, never as a pass.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const { MARKER, TARGET_FILES, REV_SLOT, REVISION_PREFIX, revisionState, revisionComment, PATCHES } =
  require(path.join(root, 'shell-patch', 'patches.cjs'));
const { classifyPatch, applyPatch } = require(path.join(root, 'shell-patch', 'apply.cjs'));

/**
 * The Desktop installation on *this* machine, discovered the way the patcher
 * finds it (see target.cjs): an explicit `DSH_THEME_APP` -> the runtime anchors
 * the shell hands its children -> `process.execPath` -> launcher shortcut -> the
 * remembered `.target.json` -> platform defaults. No path is pinned to one
 * developer's disk layout, so this suite travels between machines.
 */
const target = require(path.join(root, 'shell-patch', 'target.cjs'));
function discoverInstall() {
  try {
    const found = target.resolveApp({});
    return found !== null && typeof found.app === 'string' ? found.app : null;
  } catch {
    return null;
  }
}
const INSTALLED_APP = discoverInstall();
/** The archive this patch set is written for, or null when there is none. */
const INSTALLED = INSTALLED_APP === null ? null : path.join(INSTALLED_APP, 'resources', 'app.asar');
/** Where a pristine copy of the patched shell is expected to live. */
const PRISTINE_CANDIDATES = [
  ...(INSTALLED === null ? [] : [`${INSTALLED}.dsh-theme-marathon.bak`]),
  path.join(root, '..', 'deepseekharness_desktop', 'resources', 'app.asar.dsh-theme-marathon.bak'),
];

const archiveIndex = process.argv.indexOf('--archive');
const archive = archiveIndex > 0
  ? process.argv[archiveIndex + 1]
  : (process.env.DSH_DESKTOP_ASAR_STOCK ?? PRISTINE_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? null);

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

const entry = (name) => {
  const found = PATCHES.find((patch) => patch.name === name);
  assert.ok(found !== undefined, `no entry named "${name}"`);
  return found;
};

// ---------------------------------------------------------------------------
console.log('\nstructural');
// ---------------------------------------------------------------------------

test('every entry is a well-formed patch', () => {
  assert.ok(PATCHES.length >= 8, `expected the full set, got ${PATCHES.length}`);
  for (const patch of PATCHES) {
    for (const key of ['name', 'file', 'anchor', 'replacement', 'already']) {
      assert.strictEqual(typeof patch[key], 'string', `${patch.name ?? '?'}: ${key} must be a string`);
      assert.ok(patch[key].length > 0, `${patch.name}: ${key} is empty`);
    }
    assert.ok(!patch.optional, `${patch.name}: no entry may be optional, the upgrade ladder is gone`);
  }
});

test('the replacement really does introduce its marker', () => {
  for (const patch of PATCHES) {
    assert.ok(patch.replacement.includes(patch.already),
      `${patch.name}: replacement does not contain already=${JSON.stringify(patch.already)}`);
  }
});

test('no two entries share a marker', () => {
  const seen = new Map();
  for (const patch of PATCHES) {
    assert.ok(!seen.has(patch.already), `marker reused by ${seen.get(patch.already)} and ${patch.name}`);
    seen.set(patch.already, patch.name);
  }
});

test('no anchor is nested inside another', () => {
  for (const outer of PATCHES) {
    for (const inner of PATCHES) {
      if (outer === inner) continue;
      assert.ok(!outer.anchor.includes(inner.anchor),
        `${inner.name}'s anchor sits inside ${outer.name}'s -- order would decide the outcome`);
    }
  }
});

test('the appearance guard is ordered before the boot-chrome block', () => {
  const names = PATCHES.map((patch) => patch.name);
  const guard = names.indexOf('main: measured caption palette respects boot chrome');
  const boot = names.indexOf('main: boot chrome IPC');
  assert.ok(guard >= 0 && boot >= 0, 'both entries must exist');
  assert.ok(guard < boot,
    'the appearance guard edits the two lines the boot-chrome anchor ends on; applying them in the other order misses');
});

// ---------------------------------------------------------------------------
console.log('\nthe caption guard');
// ---------------------------------------------------------------------------

const guardPayload = entry('main: measured caption palette respects boot chrome').replacement;
const bootPayload = entry('main: boot chrome IPC').replacement;

test('the guard declares the state exactly once', () => {
  assert.ok(guardPayload.includes('let bootChromeSuppressed = false;'),
    'the guard must declare bootChromeSuppressed -- the boot block only assigns it');
  assert.ok(guardPayload.includes('let parkedCaptionPalette;'),
    'the guard must declare parkedCaptionPalette');
});

test('the guard parks the measured palette instead of applying it', () => {
  assert.ok(guardPayload.includes('if (bootChromeSuppressed) {'),
    'the guard must branch on the suppressed state');
  assert.ok(guardPayload.includes('parkedCaptionPalette = { color, symbolColor };'),
    'while the band is hidden the measured palette must be parked, not painted');
  assert.ok(guardPayload.includes('} else mainWindow.setTitleBarOverlay({ color, symbolColor });'),
    'and it must still be painted when the band is visible');
  assert.ok(guardPayload.includes('measured caption palette parked'),
    'the park must be observable: a suppressed repaint looks exactly like no repaint at all');
  assert.ok(guardPayload.includes('JSON.stringify(parkedCaptionPalette)'),
    'the parked pair must be printed, not just announced');
});

test('the boot block flips the state before it paints', () => {
  const flip = bootPayload.indexOf('bootChromeSuppressed = !visible;');
  assert.ok(flip > 0, 'the boot block must set bootChromeSuppressed');
  // The shell's preload republishes the palette from DOMContentLoaded on, which
  // can precede this window's first `show`; anything deferred into `apply()` is
  // therefore too late to suppress it.
  const apply = bootPayload.indexOf('const apply = () => {');
  assert.ok(apply > 0, 'the boot block must have an apply()');
  assert.ok(flip < apply, 'the state must flip before apply() is defined, not inside it');
  assert.ok(!bootPayload.includes('\t\t\t\tbootChromeSuppressed = '),
    'the assignment must not live inside apply()');
});

test('restoring replays the measured palette, with the height pinned', () => {
  assert.ok(bootPayload.includes('const measured = parkedCaptionPalette;'), 'restore must read the parked pair');
  assert.ok(bootPayload.includes('color: measured.color,'), 'restore must prefer the measured colour');
  assert.ok(bootPayload.includes('symbolColor: measured.symbolColor,'), 'restore must prefer the measured symbol colour');
  assert.ok(bootPayload.includes('height: CAPTION_HEIGHT'), 'both restore branches must pin the caption height');
  const pinned = bootPayload.match(/height: CAPTION_HEIGHT/gu) ?? [];
  assert.strictEqual(pinned.length, 2, `both restore shapes must pin the height, found ${pinned.length}`);
});

test('the hidden state uses functional notation and stays overridable', () => {
  assert.ok(bootPayload.includes('"rgba(0, 0, 0, 0)"'),
    'hidden colours must use rgba(), the notation the overlay parser is documented to accept');
  assert.ok(!bootPayload.includes('color: "#00000000"'),
    'hex-with-alpha silently kept the opaque constructor colours once already');
  assert.ok(bootPayload.includes('DSH_DESKTOP_BOOT_CHROME_HIDDEN'),
    'the hidden colour must stay overridable without repatching');
  assert.ok(bootPayload.includes('DSH_DESKTOP_BOOT_CHROME_HIDDEN_HEIGHT'),
    'the escaped height knob must stay available');
});

test('the log prints the options that were actually passed', () => {
  assert.ok(bootPayload.includes('${JSON.stringify(options)}'),
    'a call that arrives but does nothing is unobservable otherwise');
  assert.ok(bootPayload.includes('"first-frame"') || bootPayload.includes('typeof who === "string"'),
    'the shell log must be able to name the requester');
});

// ---------------------------------------------------------------------------
console.log('\nrevision identity');
// ---------------------------------------------------------------------------

test('every patched file carries a resolved revision comment', () => {
  for (const file of TARGET_FILES) {
    const comment = revisionComment(file);
    assert.match(comment, new RegExp(`^${REVISION_PREFIX}[0-9a-f]{12}$`), `${file}: malformed revision comment`);
    const stamped = PATCHES.filter((patch) => patch.file === file)
      .map((patch) => `${patch.anchor}\n${patch.replacement}\n${patch.already}`).join('\n');
    assert.ok(!stamped.includes(REV_SLOT), `${file}: ${REV_SLOT} survived into an exported payload`);
    assert.ok(stamped.includes(comment), `${file}: no payload carries ${comment}`);
  }
});

test('the revision comment distinguishes a stale file from a pristine one', () => {
  const file = 'lib/main.js';
  const comment = revisionComment(file);
  const pristine = 'const a = 1;\n';
  assert.strictEqual(revisionState(file, pristine), 'unpatched');
  assert.strictEqual(revisionState(file, `${pristine}\n/* ${comment} */\n`), 'current');
  // A different digest, same marker: patched, but not by this revision.
  assert.strictEqual(revisionState(file, `${pristine}\n/* ${REVISION_PREFIX}000000000000 */\n`), 'stale');
  // An install written before digest comments existed. Its markers all match, so
  // every per-entry check passes -- which is exactly why this test exists.
  assert.strictEqual(revisionState(file, `/* ${MARKER} --see shell-patch/patches.cjs. */\n${pristine}`), 'stale');
  assert.strictEqual(revisionState(file, `no markers here, just ${REVISION_PREFIX}nonsense`), 'stale');
});

// ---------------------------------------------------------------------------
console.log('\nthe stale rule');
// ---------------------------------------------------------------------------

const pristine = 'const a = 1;\n';

test('a pristine file is patched', () => {
  for (const patch of PATCHES) assert.strictEqual(classifyPatch(pristine, pristine, patch), 'apply', patch.name);
});

test('a fully patched file is skipped', () => {
  for (const patch of PATCHES) {
    const patched = patch.replacement;
    assert.strictEqual(classifyPatch(patched, patched, patch), 'applied', patch.name);
  }
});

test('an older revision is reported stale, not silently skipped', () => {
  // The shape of the install that shipped the caption bug: main.js carries the
  // marker, but the boot-chrome block predates the guard.
  const oldRevision = `/* ${MARKER} --see shell-patch/patches.cjs. */\n`
    + 'ipcMain.on(BOOT_CHROME_CHANNEL, (event, visible, who) => {\n\twindow.setTitleBarOverlay({ color: "#00000000" });\n});\n';
  for (const name of ['main: measured caption palette respects boot chrome', 'main: boot chrome IPC']) {
    assert.strictEqual(classifyPatch(oldRevision, oldRevision, entry(name)), 'stale', name);
  }
  // ...while entries whose payload did not change stay `applied`, so revert+apply
  // is only demanded by the entries that actually need it.
  assert.strictEqual(classifyPatch(oldRevision, oldRevision, entry('main: transparent window helper')), 'applied');
});

test('an earlier entry in the same run does not fake staleness', () => {
  // apply.cjs inserts MARKER with its first entry and then keeps patching the same
  // file from memory. Testing the in-flight text instead of the original made the
  // remaining main.js entries read their own run as an old install.
  const first = entry('main: transparent window helper');
  const second = entry('main: import screen');
  const afterFirst = first.replacement;
  assert.ok(afterFirst.includes(MARKER), 'the first entry introduces the marker');
  assert.strictEqual(classifyPatch(pristine, afterFirst, second), 'apply',
    'the second entry must still be allowed to patch');
});

// ---------------------------------------------------------------------------
if (archive === null) {
  skip('the whole set applies cleanly to the pristine shell', 'no --archive given');
  skip('the patched files parse as javascript', 'no --archive given');
} else {
  console.log('\nagainst the pristine archive');
  const asar = require(path.join(root, 'shell-patch', 'lib', 'asar.cjs'));
  const { header, contentOffset } = asar.readHeader(archive);
  const fd = fs.openSync(archive, 'r');
  const readEntry = (want) => {
    let node = header;
    for (const part of want.split('/')) {
      node = node.files?.[part];
      if (node === undefined) throw new Error(`${want} is not in ${archive}`);
    }
    const buffer = Buffer.alloc(node.size);
    if (node.size > 0) fs.readSync(fd, buffer, 0, node.size, contentOffset + Number(node.offset));
    return buffer.toString('utf8');
  };
  const cache = new Map();
  const pristineFor = (file) => {
    if (!cache.has(file)) cache.set(file, readEntry(file));
    return cache.get(file);
  };
  /** The patched text of every file, filled in by the first archive test. */
  const patchedFiles = new Map();
  let parseSkip = null;
  try {
    // Entries are cumulative, exactly like apply.cjs: `main: maximize helper`
    // anchors on text that `main: transparent window helper` inserts, so checking
    // each anchor against the pristine file would be wrong for half of them.
    test('the whole set applies cleanly to the pristine shell', () => {
      for (const patch of PATCHES) {
        const base = patchedFiles.get(patch.file) ?? pristineFor(patch.file);
        const verdict = classifyPatch(pristineFor(patch.file), base, patch);
        assert.strictEqual(verdict, 'apply', `${patch.name}: expected to patch, got ${verdict}`);
        const hits = base.split(patch.anchor).length - 1;
        assert.strictEqual(hits, 1, `${patch.name}: anchor hits = ${hits} once the earlier entries landed`);
        patchedFiles.set(patch.file, applyPatch(base, patch));
      }
      for (const patch of PATCHES) {
        // Also the idempotence assertion: `applied` is decided by the marker, which
        // is the only thing that makes a second run a no-op -- several anchors
        // (e.g. `function createWindow`) survive their own patch on purpose.
        assert.strictEqual(classifyPatch(pristineFor(patch.file), patchedFiles.get(patch.file), patch), 'applied',
          `${patch.name}: marker not introduced`);
      }
      // The failure that motivated all of this: two copies of one handler.
      const main = patchedFiles.get('lib/main.js');
      assert.strictEqual(main.split('ipcMain.on(BOOT_CHROME_CHANNEL').length - 1, 1, 'duplicate boot-chrome handler');
      assert.strictEqual(main.split('ipcMain.on(DESKTOP_IPC.windowsAppearance').length - 1, 1, 'duplicate appearance handler');
      assert.strictEqual(main.split('let bootChromeSuppressed = false;').length - 1, 1, 'duplicate state block');
      assert.strictEqual(main.split(`/* ${MARKER}. The renderer asks`).length - 1, 1, 'duplicate handler comment');
    });

    test('the patched files parse as javascript', () => {
      if (patchedFiles.size === 0) throw new Error('the apply test did not run');
      const { problems, checked, spawnFailure } = checkSyntax(patchedFiles);
      // A real syntax error is always loud, even in the degraded mode.
      assert.deepStrictEqual(problems, [], 'patched javascript does not parse');
      if (spawnFailure !== null) parseSkip = `${spawnFailure}; ${checked.length} file(s) parsed`;
      else assert.strictEqual(checked.length, 2, `expected main.js and preload-app.cjs, checked ${checked.join(', ')}`);
    });
    if (parseSkip !== null) {
      // The test above already counted itself as passed; take it back and report
      // the honest outcome instead of a green that only half-checked.
      passed--;
      const index = failures.findIndex((failure) => failure.startsWith('the patched files parse as javascript'));
      assert.strictEqual(index, -1, 'a passing test cannot also be in the failure list');
      skip('the patched files parse as javascript', parseSkip);
    }
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Parse every patched JavaScript file, preferring in-process parsing.
 *
 * The shell's `lib/main.js` is ESM, and the only in-process way to parse ESM
 * without executing it is `vm.SourceTextModule`, which Node gates behind
 * `--experimental-vm-modules` (the `test:patch` script passes it). When it is
 * unavailable the file falls back to `node --check` in a child process -- which
 * this sandbox refuses with EBUSY, so the fallback reports a skip rather than
 * pretending the file parsed. `lib/preload-app.cjs` is CommonJS and always
 * parses in-process via `vm.Script`.
 *
 * The extension decides the module kind for a spawned `--check`, so deferred ESM
 * goes out as `.mjs`.
 * @param {Map<string, string>} files - archive path -> patched text
 * @returns {{problems: string[], checked: string[], spawnFailure: string|null}}
 */
function checkSyntax(files) {
  const os = require('os');
  const vm = require('vm');
  const { spawnSync } = require('child_process');
  const modules = typeof vm.SourceTextModule === 'function';
  const problems = [];
  const checked = [];
  const deferred = [];

  for (const [file, text] of files) {
    if (!/\.(?:c|m)?js$/u.test(file)) continue;
    try {
      if (file.endsWith('.cjs')) new vm.Script(text, { filename: file });
      else if (modules) new vm.SourceTextModule(text, { identifier: file });
      else { deferred.push(file); continue; }
      checked.push(file);
    } catch (error) {
      problems.push(`${file}: ${error.message}`);
    }
  }

  let spawnFailure = null;
  if (deferred.length > 0) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-patch-parse-'));
    try {
      for (const file of deferred) {
        const target = path.join(scratch, `${path.basename(file)}.mjs`);
        fs.writeFileSync(target, files.get(file));
        const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
        if (result.error !== undefined) {
          spawnFailure = `${result.error.code ?? result.error.message} (could not parse ${file} in-process either)`;
          continue;
        }
        if (result.status !== 0) problems.push(`${file}: ${result.stderr || result.stdout}`);
        else checked.push(file);
      }
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  }
  return { problems, checked, spawnFailure };
}

// ---------------------------------------------------------------------------
if (INSTALLED === null || !fs.existsSync(INSTALLED)) {
  skip('the installed shell carries this revision', `${INSTALLED ?? 'no Desktop installation'} not found`);
} else {
  console.log('\nthe installation on disk');
  test('the installed shell carries this revision', () => {
    const asar = require(path.join(root, 'shell-patch', 'lib', 'asar.cjs'));
    const { header, contentOffset } = asar.readHeader(INSTALLED);
    const fd = fs.openSync(INSTALLED, 'r');
    const stale = [];
    try {
      for (const file of TARGET_FILES) {
        let node = header;
        for (const part of file.split('/')) {
          node = node.files?.[part];
          if (node === undefined) throw new Error(`${file} is not in the installed archive`);
        }
        const buffer = Buffer.alloc(node.size);
        if (node.size > 0) fs.readSync(fd, buffer, 0, node.size, contentOffset + Number(node.offset));
        const state = revisionState(file, buffer.toString('utf8'));
        if (state !== 'current') stale.push(`${file}: ${state}, wants ${revisionComment(file)}`);
      }
    } finally {
      fs.closeSync(fd);
    }
    // The exact state that shipped the caption bug once: the archive *is* patched,
    // every per-entry marker matches, and the payload is nonetheless the previous
    // revision's. Only the digest comment can see that.
    assert.deepStrictEqual(stale, [],
      `installed shell is not this revision: run revert.cjs then apply.cjs\n       ${stale.join('\n       ')}`);
  });
}

// ---------------------------------------------------------------------------
console.log('\nhost safety');
// ---------------------------------------------------------------------------

// `index.js` loads these into the DSH Host process on every plugin load, to decide
// whether the installed shell needs patching. That process is Electron in Node
// mode, where asar support is how it reads the runtime it was launched from, and
// `process.noAsar` is process-wide -- so a single module-scope assignment in a
// library is enough to break the whole shell. On 2026-09-28 it did: typert-loader
// failed all 20 of its ESM imports with ERR_MODULE_NOT_FOUND, `webRuntime` was
// never provided, six plugins stayed pending and the shell refused to start.
// `lib/real-fs.cjs` (Electron's `original-fs`) is the supported bypass; these
// three assertions are what stop the switch from coming back.
const HOST_LOADED = [
  'shell-patch/lib/real-fs.cjs',
  'shell-patch/lib/asar.cjs',
  'shell-patch/patches.cjs',
  'shell-patch/target.cjs',
];

test('loading the modules the Host loads leaves process.noAsar alone', () => {
  assert.strictEqual(process.noAsar, undefined, 'process.noAsar was already set before this check');
  for (const relative of HOST_LOADED) {
    const file = path.join(root, relative);
    delete require.cache[require.resolve(file)];
    require(file);
    assert.strictEqual(process.noAsar, undefined,
      `${relative} sets the process-wide process.noAsar switch on load`);
  }
});

test('every shell-patch module index.js requires in the Host is covered above', () => {
  const source = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
  const required = [...source.matchAll(/require\('\.\/(shell-patch\/[^']+)'\)/gu)].map((match) => match[1]);
  assert.ok(required.length > 0, 'index.js no longer requires anything from shell-patch/');
  for (const relative of required) {
    // `auto.cjs` is only ever *resolved* (then spawned), never required here.
    if (relative.endsWith('auto.cjs')) continue;
    assert.ok(HOST_LOADED.includes(relative),
      `${relative} is required inside the Host but missing from HOST_LOADED`);
  }
});

test('no module under shell-patch/ assigns the process-wide noAsar switch', () => {
  const offenders = [];
  // Prose that names the switch is fine; an assignment is not.
  const isComment = (trimmed) => trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.cjs')) {
        fs.readFileSync(full, 'utf8').split('\n').forEach((line, index) => {
          const code = line.trim();
          if (!isComment(code) && /process\.noAsar\s*=/u.test(code)) {
            offenders.push(`${path.relative(root, full)}:${index + 1}`);
          }
        });
      }
    }
  };
  walk(path.join(root, 'shell-patch'));
  assert.deepStrictEqual(offenders, [], 'use shell-patch/lib/real-fs.cjs instead of disabling asar support');
});

// ---------------------------------------------------------------------------
const total = passed + failures.length + skipped.length;
console.log(`\n${passed}/${total} passed${skipped.length > 0 ? `, ${skipped.length} skipped` : ''}`);
if (failures.length > 0) {
  console.log('\nfailures:');
  for (const failure of failures) console.log(`  - ${failure}`);
}
process.exitCode = failures.length === 0 ? 0 : 1;
