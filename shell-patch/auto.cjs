#!/usr/bin/env node
/* auto.cjs — make "install the plugin" and "the shell effects work" one step.
 *
 * The plugin's client bundle can do everything it wants inside the page; four of
 * the things the theme promises cannot, because they happen before or outside the
 * page:
 *
 *   - the window's own alpha (`transparent: true`)            -- lib/main.js
 *   - the native caption buttons disappearing during boot      -- lib/main.js
 *   - the first frame not being an opaque slab                 -- the served index.html
 *   - the window opening maximized                             -- lib/main.js
 *
 * Those live in the shell's `app.asar`, which is why `shell-patch/apply.cjs`
 * exists. Requiring the user to find and run it is the part this file removes.
 * Three callers use it, in decreasing order of reliability:
 *
 *   1. `postinstall` in package.json. Runs while the plugin is being installed,
 *      i.e. before the next start, so the very first launch after installing the
 *      theme already has the effects. Not every installer runs lifecycle scripts
 *      (`pnpm` skips them for `link:` dependencies, and DSH's plugin manager may
 *      install that way), so it cannot be the only path.
 *   2. The plugin's own host half (`index.js`), which calls this in a detached
 *      child on every load. Universal -- it does not care how the plugin got
 *      there -- but the shell it patches is already running, so its work lands on
 *      the *next* start.
 *   3. A human: `node shell-patch/auto.cjs`.
 *
 * Contract:
 *   - Idempotent. A shell already carrying this revision is left alone; the
 *     archive is not opened for writing at all.
 *   - Atomic. All the verification lives in apply.cjs: nothing is committed
 *     unless the staged archive round-trips byte-for-byte and the patched
 *     sources still parse.
 *   - Refuses to guess. A stale revision is reported, never silently re-applied:
 *     `--repair` (revert from the pristine backup, then apply) is opt-in, because
 *     the backup predates any other edits a user may have made to the archive.
 *   - Never breaks an install. `--lenient` (used by postinstall and by the
 *     runtime hook) makes it exit 0 no matter what went wrong; the default is
 *     honest exit codes for a human at a terminal.
 *
 * Usage:
 *   node shell-patch/auto.cjs                 patch if needed, with a backup
 *   node shell-patch/auto.cjs --check         report the state, change nothing
 *   node shell-patch/auto.cjs --app <dir>     a specific installation
 *   node shell-patch/auto.cjs --repair        revert a stale revision, then apply
 *   node shell-patch/auto.cjs --json          machine-readable report
 *   node shell-patch/auto.cjs --quiet         one summary line
 *   node shell-patch/auto.cjs --lenient       always exit 0 (installer use)
 */
'use strict';

// Archive I/O through the unpatched filesystem -- see lib/real-fs.cjs. The
// process-wide `process.noAsar` switch this file used to set is gone: this
// module is reachable from inside the plugin, and disabling asar support in
// somebody else's process is exactly what took the Desktop shell down on
// 2026-09-28.
const fs = require('./lib/real-fs.cjs');
const path = require('node:path');
const target = require('./target.cjs');
const { TARGET_FILES, revisionComment } = require('./patches.cjs');

/** Guard against two installers (or a hook plus a postinstall) racing. */
const LOCK_FILE = path.join(__dirname, '.auto-apply.lock');

/** Appended to on every run that changes anything; a breadcrumb for support. */
const LOG_FILE = path.join(__dirname, 'auto-apply.log');

/** A lock older than this is considered abandoned. */
const LOCK_STALE_MS = 10 * 60 * 1000;

/**
 * Set by the runtime hook (see index.js).
 *
 * The hook starts this file from `process.execPath`, which inside the Desktop is
 * either the bundled node or Electron running as node — and Electron running as
 * node rejects unknown command-line switches, so the hook cannot pass flags. It
 * sets this instead, and the flags below are implied.
 */
const HOOK_ENV = 'DSH_THEME_AUTO_HOOK';

/** Set to `0` to make every automatic caller a no-op. */
const OFF_ENV = 'DSH_THEME_AUTO_PATCH';

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_BUSY = 2;
const EXIT_UNRESOLVED = 3;
const EXIT_NEEDS_HUMAN = 4;

function parseArgs(argv) {
  const options = {
    app: undefined,
    check: false,
    repair: false,
    json: false,
    quiet: false,
    lenient: false,
    backup: true,
    help: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--app') options.app = argv[++index];
    else if (arg === '--check' || arg === '-n') options.check = true;
    else if (arg === '--repair') options.repair = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--quiet' || arg === '-q') options.quiet = true;
    else if (arg === '--lenient') options.lenient = true;
    else if (arg === '--no-backup') options.backup = false;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

/** Emit a line unless the caller asked for one-line output. */
function reporter(options) {
  const lines = [];
  return {
    lines,
    /** Diagnostic detail: kept out of `--quiet` and out of `--json` stdout. */
    detail(text) {
      lines.push(text);
      if (!options.quiet && !options.json) console.log(text);
    },
    /** The one thing the reader must know. Always printed unless `--json`. */
    summary(text) {
      lines.push(text);
      if (!options.json) console.log(text);
    },
  };
}

/** Run `fn` with `console.log` swallowed, so a delegated tool cannot be chatty. */
function muted(fn) {
  const real = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = real;
  }
}

/** Append to the run log. Never throws: logging must not fail a patch. */
function appendLog(text) {
  try {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${text}\n`);
  } catch {
    /* read-only plugin directory: fall back to stdout only */
  }
}

/**
 * Take the run lock.
 *
 * Returns a release function, or null when another run holds it. The lock is a
 * file rather than a real mutex because the two racers here are separate
 * processes started minutes apart by unrelated parts of the host.
 * @returns {(() => void)|null}
 */
function acquireLock() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(LOCK_FILE, 'wx');
      fs.writeSync(fd, `${process.pid} ${Date.now()}\n`);
      fs.closeSync(fd);
      return () => {
        try {
          fs.rmSync(LOCK_FILE, { force: true });
        } catch {
          /* leave it; the staleness rule will clear it */
        }
      };
    } catch (error) {
      if (error.code !== 'EEXIST') return () => {};
      let stale = false;
      try {
        const [pid, at] = fs.readFileSync(LOCK_FILE, 'utf8').trim().split(/\s+/u);
        stale = Date.now() - Number(at) > LOCK_STALE_MS || !alive(Number(pid));
      } catch {
        stale = true;
      }
      if (!stale) return null;
      try {
        fs.rmSync(LOCK_FILE, { force: true });
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Is a process id still around? */
function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** Human-readable name for a probe state. */
function label(state) {
  return {
    current: 'PATCHED ',
    stale: 'STALE   ',
    mixed: 'PARTIAL ',
    unpatched: 'STOCK   ',
    unreadable: 'UNKNOWN ',
  }[state] ?? state;
}

/**
 * Report the discovered installation and its state.
 * @param {object} found - resolveApp() result
 * @param {object} report - reporter()
 * @param {object|null} probe - probeShell() result, when the target verified
 */
function describe(found, report, probe) {
  report.detail(`[auto] target     ${found.app}`);
  report.detail(`[auto] found by   ${found.how}`);
  if (probe === null) return;
  const mib = (fs.statSync(probe.archive).size / 1048576).toFixed(1);
  report.detail(`[auto] archive    ${probe.archive} (${mib} MiB)`);
  report.detail(`[auto] state      ${label(probe.state)}`);
  for (const file of TARGET_FILES) {
    const value = probe.files[file];
    const want = value === 'current' ? 'ok' : `wants ${revisionComment(file)}`;
    report.detail(`[auto]   ${label(value)} ${file} :: ${value === 'current' ? want : want}`);
  }
  if (probe.backup === null) report.detail('[auto] backup     none yet (will be created before writing)');
  else report.detail(`[auto] backup     ${probe.backup}`);
}

/** Instructions for a state this tool will not resolve on its own. */
function repairAdvice(probe) {
  return [
    '[auto] this installation carries blocks from an OLDER revision of this patch set.',
    `[auto]   run: node ${path.join('shell-patch', 'auto.cjs')} --repair`,
    '[auto] --repair restores the pristine archive from the backup first, so any',
    '[auto] other manual edits to app.asar would be lost with it. That is why it is',
    '[auto] not the default.',
  ].join('\n');
}

/**
 * Do the work.
 * @param {string[]} [argv] - arguments after the script name
 * @param {object} [env] - environment to read (defaults to process.env)
 * @returns {number} exit code
 */
function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  const fromHook = env[HOOK_ENV] === '1';
  if (fromHook) {
    // An unattended caller: it must never fail an install, and it must not
    // scribble over whatever the user is looking at.
    options.lenient = true;
    options.quiet = true;
  }
  if (env[OFF_ENV] === '0') {
    if (options.json) process.stdout.write(`${JSON.stringify({ tool: 'auto', state: 'disabled', action: 'none' })}\n`);
    else console.log(`[auto] disabled by ${OFF_ENV}=0 — nothing changed.`);
    return EXIT_OK;
  }
  if (options.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
    return EXIT_OK;
  }
  const report = reporter(options);
  const found = target.resolveApp({ explicit: options.app, env });

  // Belt and braces for the hook path: the hook itself checks this before
  // spawning, but a plugin loaded by a *web* profile on a machine that also has
  // the Desktop installed must never end up rewriting the Desktop's archive.
  if (fromHook && found.app !== null && found.insideApp !== true) {
    report.summary('[auto] this process does not run from inside the installation; leaving it alone.');
    return EXIT_OK;
  }

  if (found.app === null) {
    const report_ = {
      tool: 'auto',
      state: 'unresolved',
      how: found.how,
      tried: found.tried,
      reason: found.reason ?? null,
      action: 'none',
    };
    report.detail('[auto] could not find a DeepSeek Harness Desktop installation.');
    if (found.reason !== undefined) report.detail(`[auto] ${found.how}: ${found.reason}`);
    report.detail(`[auto] looked in ${found.tried.length} place(s):`);
    for (const candidate of found.tried.slice(0, 12)) report.detail(`[auto]   ${candidate}`);
    if (found.tried.length > 12) report.detail(`[auto]   ... and ${found.tried.length - 12} more`);
    report.summary('[auto] nothing to do. Pass --app <install dir> to point at one.');
    if (options.json) process.stdout.write(`${JSON.stringify(report_, null, 2)}\n`);
    return options.lenient ? EXIT_OK : EXIT_UNRESOLVED;
  }

  const probe = target.probeShell(found.app);
  if (probe.state !== 'unreadable') target.writeCache(found.app);
  describe(found, report, probe);

  const result = {
    tool: 'auto',
    app: found.app,
    how: found.how,
    archive: probe.archive,
    state: probe.state,
    files: probe.files,
    revision: probe.revision,
    backup: probe.backup,
    action: 'none',
    exit: EXIT_OK,
  };
  const finish = () => {
    if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    result.exit = options.lenient ? EXIT_OK : result.exit;
    return result.exit;
  };

  // ---- states that need no work ------------------------------------------
  if (probe.state === 'current') {
    report.summary(`[auto] already patched (this revision) — nothing to do.`);
    return finish();
  }
  if (probe.state === 'unreadable') {
    report.summary('[auto] the archive does not contain the files this patch edits.');
    report.detail('[auto] that normally means the installed shell build differs from the one');
    report.detail('[auto] these patches were written against. Nothing was changed.');
    result.exit = EXIT_NEEDS_HUMAN;
    return finish();
  }
  if (options.check) {
    report.summary(`[auto] ${label(probe.state)} would be patched. (--check: nothing changed)`);
    if (target.needsRepair(probe.state)) report.summary(repairAdvice(probe));
    result.exit = target.needsPatch(probe.state) ? EXIT_OK : EXIT_NEEDS_HUMAN;
    return finish();
  }
  if (target.needsRepair(probe.state)) {
    result.action = options.repair ? 'repair' : 'advise';
    if (!options.repair) {
      report.summary(repairAdvice(probe));
      result.exit = EXIT_NEEDS_HUMAN;
      return finish();
    }
  }

  // ---- the lock ----------------------------------------------------------
  const release = acquireLock();
  if (release === null) {
    report.summary('[auto] another auto-apply run is in progress; leaving it to finish.');
    result.exit = EXIT_BUSY;
    return finish();
  }
  let applied = false;
  try {
    // Re-probe under the lock: the racer we just beat may have finished the job.
    const again = target.probeShell(found.app);
    if (again.state === 'current') {
      report.summary('[auto] already patched (this revision) — nothing to do.');
      return finish();
    }

    if (result.action === 'repair') {
      const reverted = muted(() => require('./revert.cjs').main(['--app', found.app]));
      if (reverted !== EXIT_OK) {
        report.summary('[auto] revert failed; the installation was not touched.');
        result.exit = EXIT_FAILED;
        return finish();
      }
      report.detail('[auto] reverted   app.asar restored from the pristine backup');
      result.action = 'repair+apply';
    }

    result.action = result.action === 'repair+apply' ? result.action : 'apply';
    report.detail('[auto] patching…  (app.asar is rewritten; the backup is kept)');
    const code = muted(() =>
      require('./apply.cjs').main(['--app', found.app, ...(options.backup ? [] : ['--no-backup'])])
    );
    applied = code === EXIT_OK;
    result.exit = applied ? EXIT_OK : EXIT_FAILED;
    if (applied) {
      const after = target.probeShell(found.app);
      result.stateAfter = after.state;
      result.archiveMtime = after.archiveMtime;
      report.summary(`[auto] patched    ${label(after.state)}`);
      report.summary('[auto] DONE      restart DeepSeek Harness to see the effect');
      appendLog(`patched ${found.app} (was ${probe.state}, now ${after.state}, via ${found.how})`);
    } else {
      report.summary('[auto] patch did not complete; app.asar was left as it was.');
      appendLog(`FAILED ${found.app} (state ${probe.state}, via ${found.how})`);
    }
    return finish();
  } finally {
    release();
  }
}

module.exports = { main, parseArgs, acquireLock, LOCK_FILE, LOG_FILE, HOOK_ENV, OFF_ENV };

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    const lenient = process.argv.includes('--lenient');
    console.error('\n[auto] FAILED');
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = lenient ? EXIT_OK : EXIT_FAILED;
  }
}
