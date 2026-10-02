#!/usr/bin/env node
/* apply.cjs — patch the installed DSH Desktop shell for the Marathon theme.
 *
 * What it changes, and why (all of it is in patches.cjs):
 *   lib/main.js          `transparent: true` on the main BrowserWindow, the
 *                        product window opens maximized, plus one IPC channel
 *                        that hides the native Windows caption buttons while the
 *                        boot animation runs.
 *   lib/preload-app.cjs  publishes that channel as
 *                        `window.dshDesktopBootChrome.chrome(visible)`.
 *   .../dsh-web-frontend/dist/index.html
 *                        the served product document: makes its very first
 *                        frame see-through (the Desktop never splices the
 *                        webserver's index-injection rows into it, so the
 *                        theme's own row arrives about a second late) and asks
 *                        for the empty caption band at document-start.
 *
 * Safety model:
 *   1. every anchor is matched exactly once (patch counts are printed),
 *   2. the archive is extracted, patched on disk and repacked to a TEMPORARY
 *      file next to the original,
 *   3. the new archive is re-read, every entry is hashed and compared with the
 *      extracted tree, and only then is it moved over the original,
 *   4. the pristine archive is backed up first and `revert.cjs` restores it.
 *
 * Usage:
 *   node apply.cjs                 patch the installed app (with backup)
 *   node apply.cjs --check         report whether it is already patched
 *   node apply.cjs --app <dir>     use a different installation
 *   node apply.cjs --no-backup     skip the .bak copy (not recommended)
 *
 * With no `--app` the installation is discovered (see target.cjs). For the
 * unattended / "installed the plugin, now what" path use `auto.cjs`, which adds
 * the skip-if-current, lock and exit-code policy on top of this.
 */
'use strict';

// Archive I/O through the unpatched filesystem -- see lib/real-fs.cjs. This
// file used to set the process-wide `process.noAsar` switch instead, which is
// forbidden for anything auto.cjs can require: a library must not disable asar
// support in whatever process it is loaded into.
const fs = require('./lib/real-fs.cjs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const asar = require('./lib/asar.cjs');
const target = require('./target.cjs');
const { MARKER, TARGET_FILES, PATCHES, revisionState, revisionComment } = require('./patches.cjs');

function parseArgs(argv) {
  const options = { app: undefined, check: false, backup: true };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--check') options.check = true;
    else if (arg === '--no-backup') options.backup = false;
    else if (arg === '--app') options.app = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

/** Count non-overlapping occurrences of a literal string. */
function countOccurrences(haystack, needle) {
  if (needle === '') return 0;
  let count = 0;
  let index = 0;
  for (;;) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) return count;
    count++;
    index = found + needle.length;
  }
}

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Compare every entry of an archive against a directory tree. */
function archiveMatchesDirectory(archive, directory) {
  const { header, contentOffset } = asar.readHeader(archive);
  const fd = fs.openSync(archive, 'r');
  const problems = [];
  let checked = 0;
  try {
    const walk = (node, relative) => {
      for (const [name, entry] of Object.entries(node.files ?? {})) {
        const rel = relative === '' ? name : `${relative}/${name}`;
        if (entry.files !== undefined) { walk(entry, rel); continue; }
        if (entry.link !== undefined) continue;
        const onDisk = path.join(directory, ...rel.split('/'));
        let disk;
        try { disk = fs.readFileSync(onDisk); } catch { problems.push(`missing ${rel}`); continue; }
        if (entry.unpacked === true) { checked++; continue; }
        if (disk.length !== entry.size) { problems.push(`size ${rel} disk=${disk.length} header=${entry.size}`); continue; }
        const buffer = Buffer.alloc(entry.size);
        if (entry.size > 0) {
          let read = 0;
          while (read < entry.size) {
            const chunk = fs.readSync(fd, buffer, read, entry.size - read, contentOffset + Number(entry.offset) + read);
            if (chunk === 0) break;
            read += chunk;
          }
        }
        if (!buffer.equals(disk)) problems.push(`content ${rel}`);
        checked++;
      }
    };
    walk(header, '');
  } finally {
    fs.closeSync(fd);
  }
  return { checked, problems };
}

/**
 * Decide what one entry should do to one file.
 *
 * `current` is the text as it stands (already carrying whatever earlier entries
 * in the same run produced), `original` is the text the file had before the run.
 * The distinction exists only for the stale test: the first entry to patch a file
 * inserts `MARKER`, so testing `current` would make every later entry read its own
 * work as evidence that an older revision is on disk.
 *
 * "stale" is the case `already` alone cannot see: the file carries the marker but
 * not this entry's fragment, which means the block is there in a *shape this
 * revision no longer writes*. The old fix was an in-place upgrade ladder; it grew
 * a rung per payload change and eventually inserted a duplicate handler, so now
 * the answer is "revert, then apply" -- and it has to be loud, because `main:
 * boot chrome IPC` now reads variables a neighbouring entry declares, so a silent
 * skip would ship a ReferenceError instead of a caption bug.
 * @param {string} original - file text before this run
 * @param {string} current - file text after the entries already processed
 * @param {{already: string}} patch - entry being considered
 * @returns {'applied'|'stale'|'apply'}
 */
function classifyPatch(original, current, patch) {
  if (current.includes(patch.already)) return 'applied';
  if (original.includes(MARKER)) return 'stale';
  return 'apply';
}

/**
 * Apply one patch to a source text, tolerating the file's line-ending style.
 *
 * The bundled shell is written with `\n`, but an extracted or reformatted copy
 * may use `\r\n`. Anchors are therefore matched against a `\n`-normalized copy
 * and the replacement is re-encoded with whatever the file already uses.
 *
 * `optional: true` still means "a missing anchor is a skip, not an error", but
 * `PATCHES` no longer contains one: the boot-chrome block used to be followed by
 * a ladder of optional in-place upgrades, and that ladder is gone (see
 * patches.cjs). Keeping the flag costs one branch and makes the mechanism
 * available again if a future entry genuinely has two valid shapes.
 *
 * A stale install is NOT handled here -- apply.cjs' main loop refuses to write
 * when a file carries the marker but not the entry's fragment.
 * @param {string} text - current file body
 * @param {{anchor: string, replacement: string, already: string, name: string, file: string, optional?: boolean}} patch
 * @returns {string} the patched body
 */
function applyPatch(text, patch) {
  const crlf = text.includes('\r\n');
  const body = crlf ? text.replace(/\r\n/gu, '\n') : text;
  const anchor = crlf ? patch.anchor.replace(/\r\n/gu, '\n') : patch.anchor;
  const replacement = crlf ? patch.replacement.replace(/\r\n/gu, '\n') : patch.replacement;

  const hits = countOccurrences(body, anchor);
  if (hits === 0 && patch.optional === true) return text;
  if (hits !== 1) {
    throw new Error(`anchor for "${patch.name}" occurs ${hits} times in ${patch.file} (expected exactly 1) — the shell build changed`);
  }
  const patched = body.replace(anchor, replacement);
  if (!patched.includes(patch.already)) {
    throw new Error(`"${patch.name}" did not introduce its marker — refusing to continue`);
  }
  return crlf ? patched.replace(/\n/gu, '\r\n') : patched;
}

/**
 * Patch one installation.
 * @param {string[]} [argv] - arguments after the script name, so callers
 *   (auto.cjs, tests) can drive this without a child process.
 * @returns {number} exit code (0 on success)
 */
function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
    return 0;
  }

  const found = target.resolveApp({ explicit: options.app });
  if (found.app === null) {
    const detail = found.reason === undefined ? `looked in ${found.tried.length} place(s)` : `${found.how}: ${found.reason}`;
    throw new Error(
      `could not find a DeepSeek Harness Desktop installation (${detail}).\n` +
        '  Pass --app <install dir> (the directory holding resources/app.asar).\n' +
        found.tried.map((candidate) => `    tried ${candidate}`).join('\n'),
    );
  }
  const archive = path.join(found.app, 'resources', 'app.asar');
  console.log(`[apply] archive    ${archive}`);
  console.log(`[apply] found by   ${found.how}`);
  console.log(`[apply] size       ${(fs.statSync(archive).size / 1048576).toFixed(1)} MiB`);

  // ---- --check -------------------------------------------------------------
  if (options.check) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-patch-check-'));
    try {
      asar.extractAll(archive, scratch);
      const read = (file) => fs.readFileSync(path.join(scratch, ...file.split('/')), 'utf8');
      // The revision gate first: it is the only check that can see a block whose
      // payload changed without its marker changing.
      const revisions = new Map(TARGET_FILES.map((file) => [file, revisionState(file, read(file))]));
      const label = { current: 'PATCHED  ', stale: 'STALE    ', unpatched: 'STOCK    ' };
      for (const [file, state] of revisions) {
        const detail = state === 'current' ? revisionComment(file) : `wanted ${revisionComment(file)}`;
        console.log(`[apply] ${label[state]} ${file} :: ${detail}`);
      }
      // Per entry, this only reports the file's verdict: every entry of a current
      // file is in place, and every entry of a stale file is in question.
      for (const patch of PATCHES) {
        console.log(`[apply] ${label[revisions.get(patch.file)]} ${patch.file} :: ${patch.name}`);
      }
      if ([...revisions.values()].includes('stale')) {
        console.log('[apply] NOTE     STALE means an older revision of this patch is on disk; run revert.cjs then apply.cjs');
      }
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
    return 0;
  }

  // ---- report what a stock shell looks like, so a failed run is diagnosable --
  if (process.env.DSH_PATCH_DUMP_ANCHORS === '1') {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-patch-dump-'));
    try {
      asar.extractAll(archive, scratch);
      for (const patch of PATCHES) {
        const text = fs.readFileSync(path.join(scratch, ...patch.file.split('/')), 'utf8');
        const body = text.replace(/\r\n/gu, '\n');
        const anchor = patch.anchor.replace(/\r\n/gu, '\n');
        console.log(`[dump] ${patch.name}: ${countOccurrences(body, anchor)} hits`);
      }
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  }

  // ---- backup --------------------------------------------------------------
  if (options.backup) {
    const backup = `${archive}.dsh-theme-marathon.bak`;
    if (!fs.existsSync(backup)) {
      console.log(`[apply] backing up -> ${backup}`);
      fs.copyFileSync(archive, backup);
    } else {
      console.log(`[apply] backup already present: ${backup}`);
    }
  }

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-patch-'));
  const staged = path.join(scratch, 'tree');
  const stagingArchive = path.join(path.dirname(archive), 'app.asar.marathon-staging');
  console.log(`[apply] scratch    ${scratch}`);
  console.log('[apply] tip        set DSH_PATCH_KEEP_SCRATCH=1 to keep the patched tree for diffing');

  try {
    // ---- extract -----------------------------------------------------------
    const unpackedSet = new Set();
    const unpackedRoot = `${archive}.unpacked`;
    if (fs.existsSync(unpackedRoot)) {
      const walk = (directory, relative) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const rel = relative === '' ? entry.name : `${relative}/${entry.name}`;
          if (entry.isDirectory()) walk(path.join(directory, entry.name), rel);
          else if (entry.isFile()) unpackedSet.add(rel.replace(/\\/gu, '/'));
        }
      };
      walk(unpackedRoot, '');
    }
    const extracted = asar.extractAll(archive, staged);
    console.log(`[apply] extracted  ${extracted} files, ${unpackedSet.size} unpacked refs`);

    // ---- revision gate -----------------------------------------------------
    // Do this before anything is written, and before the entries are considered.
    // `already` can only answer "is this block present", so a shell written by an
    // older revision of this patch set passes every per-entry check while holding
    // a payload that no longer matches. The digest comment is what makes that
    // state visible; the answer is always the same, so it is explained once.
    const staleFiles = TARGET_FILES.filter((file) =>
      revisionState(file, fs.readFileSync(path.join(staged, ...file.split('/')), 'utf8')) === 'stale');
    if (staleFiles.length > 0) {
      console.error('[apply] this installation carries an OLDER revision of the patch:');
      for (const file of staleFiles) {
        console.error(`  - ${file} (wants ${revisionComment(file)})`);
      }
      console.error('[apply] nothing was written. Run `node shell-patch/revert.cjs`, then apply again.');
      throw new Error('stale patch revision on disk; revert first');
    }

    // ---- patch -------------------------------------------------------------
    const touched = new Map();
    // The text each file had BEFORE this run. The stale test has to look at that
    // copy, not at the in-flight one: the first entry to patch main.js inserts
    // the marker, so every later entry would otherwise read its own work as
    // evidence of an older revision.
    const originals = new Map();
    const stale = [];
    for (const patch of PATCHES) {
      const target = path.join(staged, ...patch.file.split('/'));
      let text = touched.get(target);
      if (text === undefined) {
        text = fs.readFileSync(target, 'utf8');
        originals.set(target, text);
      }
      // Second line of defence. The revision gate above already refuses a stale
      // file, so this cannot normally fire -- it stays because `classifyPatch` is
      // the single documented answer to "what should happen to this entry", and
      // having the loop ask it is what keeps both paths honest.
      const verdict = classifyPatch(originals.get(target), text, patch);
      if (verdict === 'applied') {
        console.log(`[apply] already applied: ${patch.name}`);
        touched.set(target, text);
        continue;
      }
      if (verdict === 'stale') {
        stale.push(patch);
        continue;
      }
      const before = text;
      text = applyPatch(text, patch);
      touched.set(target, text);
      // Only an `optional` entry can come back unchanged (every other shape mismatch throws).
      console.log(`[apply] ${text === before ? 'absent,  ' : 'patched: '}${patch.name}`);
    }
    if (stale.length > 0) {
      console.error('[apply] this installation carries an OLDER revision of the patch:');
      for (const patch of stale) console.error(`  - ${patch.file} :: ${patch.name}`);
      console.error('[apply] nothing was written. Run `node shell-patch/revert.cjs`, then apply again.');
      throw new Error('stale patch revision on disk; revert first');
    }
    for (const [file, text] of touched) fs.writeFileSync(file, text);

    // ---- repack to a staging path -----------------------------------------
    // `createPackage` truncates, so a leftover from an interrupted run is not a
    // reason to abort here -- and deleting it is not required.
    try { fs.rmSync(stagingArchive, { force: true }); }
    catch (error) { console.warn(`[apply] WARNING  could not clear ${stagingArchive} (${error.code ?? error.message}); it will be overwritten`); }
    // The staged archive is verified and then renamed over the real one, so its
    // own `<staging>.unpacked` mirror is never read: the archive that ends up in
    // place resolves its declared-unpacked paths against the sibling that is
    // already there (untouched by this patch). Rebuilding the mirror would copy
    // ~1500 files and then delete them again.
    const packed = asar.createPackage(staged, stagingArchive, { unpacked: unpackedSet, unpackedMirror: false });
    console.log(`[apply] repacked   ${packed.files} files, ${(packed.bytes / 1048576).toFixed(1)} MiB`);

    // ---- verify the staged archive against the patched tree ---------------
    const names = [...new Set(PATCHES.map((patch) => patch.file))].join(', ');
    // First the header itself. readHeader asserts @8 === @4 - 4 and an exact
    // @12; Chromium is stricter still, and a wrong word there makes it discard
    // the whole archive and silently boot default_app.asar — i.e. the stock
    // welcome page instead of the application. This gate is what makes that
    // particular failure impossible to ship.
    const stagedHeader = asar.readHeader(stagingArchive);
    console.log(`[apply] header     headerBufLen=${stagedHeader.fields.headerBufLen} payloadSize=${stagedHeader.fields.payloadSize} jsonLen=${stagedHeader.fields.jsonLen}`);
    const check = archiveMatchesDirectory(stagingArchive, staged);
    if (check.problems.length > 0) {
      console.error('[apply] staged archive does not match the patched tree:');
      for (const problem of check.problems.slice(0, 20)) console.error('  -', problem);
      throw new Error('staged archive failed verification; the installation was NOT touched');
    }
    console.log(`[apply] verified   ${check.checked} entries round-trip byte-for-byte (incl. ${names})`);
    // Sanity: the patched sources still parse as JavaScript. `node --check`
    // understands both the shell's ESM main (Node >= 22 detects module syntax
    // from the `import` statements) and its CommonJS preload.
    //
    // A spawn failure is NOT a syntax failure: restricted environments (agent
    // sandboxes, some corporate EDR setups) make `spawnSync` return EBUSY/EPERM
    // before node ever sees the file, and aborting there would block a perfectly
    // good patch. `result.error` therefore downgrades to a warning, an actual
    // non-zero status still aborts, and marking the file as broken is impossible.
    const { spawnSync } = require('child_process');
    const checked = new Set();
    for (const patch of PATCHES) {
      const file = path.join(staged, ...patch.file.split('/'));
      if (checked.has(file)) continue;
      checked.add(file);
      // Only JavaScript can be syntax-checked; the mirror entries (the served
      // index.html) are documents, and `node --check` would reject them.
      if (!/\.(?:c|m)?js$/u.test(file)) continue;
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (result.error !== undefined) {
        console.warn(`[apply] WARNING  could not syntax-check ${patch.file} (${result.error.code ?? result.error.message}); verify it yourself`);
        continue;
      }
      if (result.status !== 0) {
        throw new Error(`patched ${patch.file} no longer parses:\n${result.stderr || result.stdout}`);
      }
      console.log(`[apply] parses     ${patch.file}`);
    }

    // ---- commit -----------------------------------------------------------
    // A running shell keeps app.asar open, which blocks a rename on Windows.
    // Rewriting the same file in place is allowed and leaves its identity (and
    // the already-mapped regions of a running process) alone; the pristine copy
    // is on disk either way, so a failure cannot lose the original.
    try {
      fs.renameSync(stagingArchive, archive);
      console.log('[apply] committed  app.asar replaced (rename)');
    } catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
      console.log(`[apply] rename blocked (${error.code}) — rewriting app.asar in place`);
      const bytes = fs.readFileSync(stagingArchive);
      fs.writeFileSync(archive, bytes);
      console.log(`[apply] committed  app.asar rewritten in place (${(bytes.length / 1048576).toFixed(1)} MiB)`);
    }
    console.log('[apply] DONE — restart DeepSeek Harness to pick the patch up');
    return 0;
  } finally {
    // Cleanup must never mask the outcome: a delete can legitimately fail (another
    // process holding the file, a sandbox with a bulk-delete guard) and reporting
    // "FAILED" after a patch has already been committed sends the reader hunting a
    // bug that does not exist. The leftovers are named instead.
    const drop = (target, options) => {
      try { fs.rmSync(target, options); }
      catch (error) { console.warn(`[apply] WARNING  could not remove ${target} (${error.code ?? error.message}); delete it yourself`); }
    };
    drop(stagingArchive, { force: true });
    if (process.env.DSH_PATCH_KEEP_SCRATCH === '1') console.log(`[apply] scratch kept: ${scratch}`);
    else drop(scratch, { recursive: true, force: true });
  }
}

// Exported so the patch-set test can exercise the stale rule without an archive;
// the CLI body stays behind the `require.main` guard so requiring this file does
// not touch an installation.
module.exports = { classifyPatch, applyPatch };
module.exports.main = main;

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error('\n[apply] FAILED');
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}

