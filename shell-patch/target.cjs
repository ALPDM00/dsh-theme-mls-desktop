/* target.cjs — find the DSH Desktop installation, and say how patched it is.
 *
 * Two jobs, both of them prerequisites for automating the patch step:
 *
 * 1. **Where is it?** `apply.cjs` used to hardcode this machine's path
 *    (`D:/Software/deepseekharness_desktop`). That is fine for one developer
 *    and useless for everyone else, so the path is now discovered, in this
 *    order:
 *
 *      1. an explicit `--app` / `DSH_THEME_APP` (a human said so; verified, and
 *         a mismatch is an error rather than a fallback),
 *      2. the environment the Desktop itself leaks to its runtime children —
 *         `DSH_DESKTOP_NODE_EXECUTABLE` and friends point *into* the install
 *         directory, so walking up from them lands on it,
 *      3. `process.execPath` — the DSH runtime is spawned as
 *         `<app>/resources/runtime/primary-runtime/dependencies/node/bin/node.exe`,
 *         which makes this the reliable anchor for plugin host code,
 *      4. a cache written by the last successful resolve,
 *      5. the platform's usual install directories.
 *
 *    Discovery alone is not enough to trust a directory: `verifyApp()` insists
 *    that `<dir>/resources/app.asar` exists, that its header parses, and that
 *    the archive declares the Desktop package. A stock Electron app next door
 *    must not be patched by accident.
 *
 * 2. **Is it patched?** `probeShell()` answers that *without extracting the
 *    archive*: `readHeader()` gives the entry table and every entry's offset, so
 *    the three target files are read straight out of the archive body. That is
 *    a few milliseconds instead of the ~12k-file extract `apply.cjs --check`
 *    needs, which is what makes it affordable to ask on every plugin load.
 *
 * Nothing here writes anything.
 */
'use strict';

// The unpatched filesystem: this module reads both the archive file itself and
// its `<archive>.unpacked` sibling, and Electron's wrapper would misroute both.
// See lib/real-fs.cjs -- and note that loading this module must never disable
// asar support, because index.js loads it inside the DSH Host process.
const fs = require('./lib/real-fs.cjs');
const os = require('node:os');
const path = require('node:path');
const asar = require('./lib/asar.cjs');
const { TARGET_FILES, revisionState, revisionComment } = require('./patches.cjs');

/** Directory that contains the archive, relative to the app root. */
const ARCHIVE_DIR = path.join('resources', 'app.asar');

/** macOS puts the same directory at `<bundle>/Contents/Resources`. */
const ARCHIVE_DIR_DARWIN = path.join('Resources', 'app.asar');

/** The Desktop's own package name, as declared inside the archive. */
const DESKTOP_PACKAGE = '@deepseek-ai/dsh-desktop';

/** Where the last successful resolve is remembered, relative to shell-patch/. */
const CACHE_FILE = path.join(__dirname, '.target.json');

/** Environment variables that name the installation root outright. */
const ENV_ANCHORS = ['DSH_THEME_APP', 'DSH_DESKTOP_APP', 'DSH_DESKTOP_HOME'];

/**
 * Environment variables that name a path *inside* the installation.
 *
 * These are what the Desktop leaks to the children it spawns, so their presence
 * is also the proof that this process is running from inside the installed app
 * rather than, say, from a `dsh web` session on the same machine — which is the
 * distinction the runtime hook needs before it touches someone's `app.asar`.
 */
const ENV_INSIDE = ['DSH_DESKTOP_NODE_EXECUTABLE', 'DSH_DESKTOP_EXECUTABLE'];

/** `--app` / `DSH_THEME_APP` are assertions: locate nothing else if they miss. */
const EXPLICIT_ENV = 'DSH_THEME_APP';

/**
 * Read one file out of an asar archive without extracting anything.
 *
 * `unpacked: true` entries live in the sibling `<archive>.unpacked` directory,
 * where the archive records only their size — that path is read instead.
 * @param {string} archive - path to the .asar file
 * @param {string} relative - archive-relative path, `/`-separated
 * @returns {string|null} the file's text, or null when it is not in the archive
 */
function readEntry(archive, relative) {
  const { header, contentOffset } = asar.readHeader(archive);
  const segments = relative.split('/');
  let node = header;
  for (const segment of segments) {
    const next = node.files === undefined ? undefined : node.files[segment];
    if (next === undefined) return null;
    node = next;
  }
  if (node.files !== undefined || node.link !== undefined) return null;
  if (node.unpacked === true) {
    const mirror = path.join(`${archive}.unpacked`, ...segments);
    return fs.existsSync(mirror) ? fs.readFileSync(mirror, 'utf8') : null;
  }
  const size = Number(node.size ?? 0);
  if (size === 0) return '';
  const buffer = Buffer.alloc(size);
  const fd = fs.openSync(archive, 'r');
  try {
    let read = 0;
    while (read < size) {
      const chunk = fs.readSync(fd, buffer, read, size - read, contentOffset + Number(node.offset) + read);
      if (chunk === 0) break;
      read += chunk;
    }
  } finally {
    fs.closeSync(fd);
  }
  return buffer.toString('utf8');
}

/**
 * Where the archive lives under this app root, or null when there is none.
 * @param {string} app - candidate app root
 * @returns {string|null} absolute path to app.asar
 */
function archiveIn(app) {
  for (const relative of [ARCHIVE_DIR, ARCHIVE_DIR_DARWIN]) {
    const candidate = path.join(app, relative);
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* try the next layout */
    }
  }
  return null;
}

/**
 * Does this directory look like a DSH Desktop installation?
 *
 * The archive header is read (not just the file's existence) because the next
 * thing that happens to a directory that passes is a 114 MiB rewrite: a
 * truncated or foreign `app.asar` must be rejected here, while the only cost is
 * one 8 KiB read.
 * @param {string} app - candidate installation directory
 * @returns {{ok: true, archive: string, package: string, version: string}|{ok: false, reason: string}}
 */
function verifyApp(app) {
  if (typeof app !== 'string' || app === '') return { ok: false, reason: 'empty path' };
  const archive = archiveIn(app);
  if (archive === null) return { ok: false, reason: `no ${ARCHIVE_DIR}` };
  try {
    asar.readHeader(archive);
  } catch (error) {
    return { ok: false, reason: `unreadable archive (${error.message})` };
  }
  let manifest = null;
  try {
    manifest = readEntry(archive, 'package.json');
  } catch {
    manifest = null;
  }
  let name = '';
  let version = '';
  if (manifest !== null) {
    try {
      const parsed = JSON.parse(manifest);
      name = String(parsed.name ?? '');
      version = String(parsed.version ?? '');
    } catch {
      name = '';
    }
  }
  if (name !== '' && name !== DESKTOP_PACKAGE) {
    return { ok: false, reason: `archive declares "${name}", not ${DESKTOP_PACKAGE}` };
  }
  // The three target files are deliberately NOT required here. If a future shell
  // build moves one, the useful message is "the shell build changed", and that
  // comes from probeShell() reporting the file as missing -- whereas failing
  // verification would read as "no installation found" and send the reader
  // looking for a directory that is right in front of them.
  return { ok: true, archive, package: name || '(no package.json)', version };
}

/**
 * Ancestor directories of `start` that are installations, nearest first.
 * Handles both "we were handed the install root" and "we were handed a path
 * four levels inside it" -- the second is the normal case, because the DSH
 * runtime is spawned from `<app>/resources/runtime/.../node/bin/node.exe`.
 * @param {string} start - file or directory to walk up from
 * @returns {string[]} candidate installation directories
 */
function walkUp(start) {
  const found = [];
  let current = start;
  try {
    if (fs.statSync(current).isFile()) current = path.dirname(current);
  } catch {
    current = path.dirname(current);
  }
  for (let depth = 0; depth < 8 && current !== '' && current !== path.dirname(current); depth++) {
    if (archiveIn(current) !== null) found.push(current);
    current = path.dirname(current);
  }
  return found;
}

/**
 * Installation directories named by launchers the user already has.
 *
 * On Windows this reads the Start Menu `.lnk` files, which store their target
 * as a plain UTF-16 string; on Linux it reads `.desktop` `Exec=` lines. Both are
 * how the *official installer* records where it put things, which is exactly the
 * answer the standard-directory guesses cannot give when a user picked a custom
 * location (`D:\Software\...`, an external drive, a PortableApps folder).
 *
 * The `.lnk` reader is deliberately not a real shell-link parser: it pulls
 * printable UTF-16 runs out of the file and considers every path-shaped prefix of
 * each run. `verifyApp()` is the filter, so a wrong guess costs one `statSync`.
 * @param {object} [options]
 * @returns {string[]} candidate installation directories
 */
function launcherPaths({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
  const roots = [];
  const names = /deepseek|harness/iu;
  if (platform === 'win32') {
    const appData = env.APPDATA;
    if (appData !== undefined) roots.push(path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
    if (env.ProgramData !== undefined) roots.push(path.join(env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
  } else if (platform === 'linux') {
    roots.push(path.join(home, '.local', 'share', 'applications'), '/usr/share/applications', '/usr/local/share/applications');
  } else {
    return [];
  }

  const found = [];
  for (const root of roots) {
    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !names.test(entry.name)) continue;
      if (!/\.(?:lnk|desktop)$/iu.test(entry.name)) continue;
      const file = path.join(root, entry.name);
      let text;
      try {
        const bytes = fs.readFileSync(file);
        text = /\.desktop$/iu.test(entry.name) ? bytes.toString('utf8') : utf16Runs(bytes).join('\n');
      } catch {
        continue;
      }
      for (const candidate of pathPrefixes(text)) {
        if (!found.includes(candidate)) found.push(candidate);
      }
    }
  }
  return found;
}

/** Printable ASCII runs inside a UTF-16LE buffer, the encoding `.lnk` uses. */
function utf16Runs(buffer) {
  const runs = [];
  let current = '';
  for (let index = 0; index + 1 < buffer.length; index += 2) {
    const code = buffer.readUInt16LE(index);
    if (code >= 32 && code < 127) current += String.fromCharCode(code);
    else {
      if (current.length > 4) runs.push(current);
      current = '';
    }
  }
  if (current.length > 4) runs.push(current);
  return runs;
}

/**
 * Every path-shaped prefix in a blob of text.
 *
 * A `.lnk` holds `#D:\Software\app` immediately followed by
 * `D:\Software\app\App.exe`, so the clean target is a prefix that ends right
 * before a separator -- which is why prefixes are cut at separators rather than
 * only at whitespace.
 * @param {string} text
 * @returns {string[]} candidates, capped
 */
function pathPrefixes(text, limit = 64) {
  const found = [];
  const starts = [];
  const re = /[A-Za-z]:[\\/]/gu;
  for (let match = re.exec(text); match !== null; match = re.exec(text)) starts.push(match.index);
  for (const start of starts) {
    if (found.length >= limit) break;
    found.push(text.slice(start));
    for (let index = start + 2; index < text.length && found.length < limit; index++) {
      const char = text[index];
      if (char === '\\' || char === '/') found.push(text.slice(start, index));
      else if (char === '\n') break;
    }
  }
  return found.filter((candidate) => candidate.length > 3);
}

/** Platform-standard installation directories, most likely first. */
function standardPaths({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
  const names = ['DeepSeek Harness', 'deepseekharness_desktop', 'deepseek-harness-desktop'];
  const roots = [];
  if (platform === 'win32') {
    for (const key of ['LOCALAPPDATA', 'ProgramFiles', 'ProgramFiles(x86)', 'APPDATA']) {
      const base = env[key];
      if (base === undefined || base === '') continue;
      roots.push(path.join(base, 'Programs'), base);
    }
  } else if (platform === 'darwin') {
    roots.push('/Applications', path.join(home, 'Applications'));
  } else {
    roots.push('/opt', '/usr/local/lib', path.join(home, '.local', 'share'));
  }
  const candidates = [];
  for (const root of roots) {
    for (const name of names) {
      // macOS anchors on the bundle's Contents dir, everything else on the
      // directory that holds `resources/`.
      candidates.push(platform === 'darwin' ? path.join(root, `${name}.app`, 'Contents') : path.join(root, name));
    }
    // One bounded readdir, so an installer that picked its own folder name
    // under a standard root is still found.
    candidates.push(...siblingsMatching(root));
  }
  return candidates;
}

/** Immediate subdirectories of `root` whose name mentions DeepSeek/Harness. */
function siblingsMatching(root, limit = 8) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries) {
    if (found.length >= limit) break;
    if (!entry.isDirectory()) continue;
    if (!/deepseek|harness|dsh/iu.test(entry.name)) continue;
    found.push(path.join(root, entry.name));
  }
  return found;
}

/**
 * Is this process running out of `app`?
 *
 * True when the running interpreter, or one of the paths the Desktop hands down,
 * lives inside the installation. Used to gate the runtime hook: `dsh web` on a
 * machine that also has the Desktop installed must not start rewriting the
 * Desktop's archive behind the user's back.
 * @param {string} app - installation directory
 * @param {object} [context]
 * @returns {boolean}
 */
function runsFrom(app, { env = process.env, execPath = process.execPath } = {}) {
  const anchors = [execPath, ...ENV_INSIDE.map((key) => env[key])].filter((value) => typeof value === 'string' && value !== '');
  return anchors.some((anchor) => walkUp(anchor).includes(app));
}

/**
 * Locate the installation.
 *
 * Returns the first candidate that `verifyApp()` accepts, plus why it was
 * chosen. When an explicit path was given it must be valid: silently patching
 * some other installation is worse than failing.
 * @param {object} [options]
 * @param {string} [options.explicit] - `--app` value
 * @param {object} [options.env] - environment to read (defaults to process.env)
 * @param {string} [options.execPath] - runtime anchor (defaults to process.execPath)
 * @returns {{app: string, archive: string, package: string, version: string, how: string, insideApp: boolean}
 *   |{app: null, how: 'explicit', tried: string[], reason: string}
 *   |{app: null, how: 'search', tried: string[]}}
 */
function resolveApp(options = {}) {
  const env = options.env ?? process.env;
  const execPath = options.execPath ?? process.execPath;
  const explicit = options.explicit ?? (env[EXPLICIT_ENV] ?? undefined);

  // 1. Explicit. Defined by argument or by DSH_THEME_APP; a miss is fatal.
  if (typeof explicit === 'string' && explicit !== '') {
    const verdict = verifyApp(explicit);
    return verdict.ok
      ? { ...verdict, app: explicit, how: 'explicit', insideApp: runsFrom(explicit, { env, execPath }) }
      : { app: null, how: 'explicit', tried: [explicit], reason: verdict.reason };
  }

  const tried = [];
  let seen = 0;
  const consider = (candidate, how) => {
    if (typeof candidate !== 'string' || candidate === '') return null;
    if (tried.includes(candidate)) return null;
    tried.push(candidate);
    if (++seen > 400) return null;
    const verdict = verifyApp(candidate);
    return verdict.ok ? { ...verdict, app: candidate, how, insideApp: runsFrom(candidate, { env, execPath }) } : null;
  };

  // 2. What the Desktop tells its runtime children, and 3. where the runtime
  //    itself lives. Both are anchors *inside* the installation, which is why
  //    they are tried before any guess about where a user put it.
  for (const key of [...ENV_ANCHORS, ...ENV_INSIDE]) {
    const value = env[key];
    if (typeof value !== 'string' || value === '') continue;
    for (const candidate of walkUp(value)) {
      const hit = consider(candidate, `env ${key}`);
      if (hit !== null) return hit;
    }
  }
  for (const candidate of walkUp(execPath)) {
    const hit = consider(candidate, 'process.execPath');
    if (hit !== null) return hit;
  }

  // 4. Launchers the user already has: the one place a custom install directory
  //    is written down in plain text.
  for (const candidate of launcherPaths({ env })) {
    const hit = consider(candidate, 'launcher shortcut');
    if (hit !== null) return hit;
  }

  // 5. Remembered from last time. Cheap, and it keeps working when the Desktop
  //    is installed somewhere unusual.
  const cached = readCache(env);
  if (cached !== null) {
    const hit = consider(cached, 'cached');
    if (hit !== null) return hit;
  }

  // 6. Platform defaults, plus (for a developer running this by hand from a
  //    build tree) wherever we happen to be standing.
  for (const candidate of standardPaths({ env })) {
    const hit = consider(candidate, 'standard location');
    if (hit !== null) return hit;
  }
  for (const candidate of walkUp(process.cwd())) {
    const hit = consider(candidate, 'working directory');
    if (hit !== null) return hit;
  }

  return { app: null, how: 'search', tried };
}

/**
 * The cache file in play: `DSH_THEME_CACHE` replaces it, never adds to it.
 * An override that still consulted the default would be no isolation at all.
 * @param {object} env
 * @returns {string}
 */
function cachePath(env = process.env) {
  const override = env.DSH_THEME_CACHE;
  return typeof override === 'string' && override !== '' ? override : CACHE_FILE;
}

/** The cached installation directory, or null. Never throws. */
function readCache(env = process.env) {
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath(env), 'utf8'));
    return typeof parsed.app === 'string' && parsed.app !== '' ? parsed.app : null;
  } catch {
    /* no cache, or an unreadable one: not an error */
  }
  return null;
}

/** Remember a resolved installation. Best effort: a read-only plugin dir is fine. */
function writeCache(app, env = process.env) {
  try {
    fs.writeFileSync(cachePath(env), `${JSON.stringify({ app, at: new Date().toISOString() }, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

/** Newest mtime in a directory, with a hard cap on how much is walked. */
function newestMtime(directory, limit = 400) {
  let newest = 0;
  let seen = 0;
  const stack = [directory];
  while (stack.length > 0 && seen < limit) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      seen++;
      if (seen > limit) break;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else {
        try {
          newest = Math.max(newest, fs.statSync(full).mtimeMs);
        } catch {
          /* raced with a delete: ignore */
        }
      }
    }
  }
  return newest;
}

/**
 * How patched is this installation?
 *
 * Reads only the files the patch set writes, and rolls the per-file verdicts up
 * into one state. `stale` and `mixed` both mean "revert, then apply": the shell
 * carries blocks from an older revision of this patch set, which `apply.cjs`
 * refuses to build on.
 * @param {string} app - installation directory
 * @returns {{app: string, archive: string, state: string, files: object, revision: object,
 *   archiveMtime: number, backup: string|null}}
 */
function probeShell(app) {
  const archive = archiveIn(app);
  const files = {};
  const revision = {};
  for (const file of TARGET_FILES) {
    revision[file] = revisionComment(file);
    let text = null;
    try {
      text = archive === null ? null : readEntry(archive, file);
    } catch (error) {
      files[file] = `error: ${error.message}`;
      continue;
    }
    files[file] = text === null ? 'missing' : revisionState(file, text);
  }
  const verdicts = Object.values(files);
  let state;
  if (verdicts.some((value) => typeof value !== 'string' || value.startsWith('error') || value === 'missing')) state = 'unreadable';
  else if (verdicts.every((value) => value === 'current')) state = 'current';
  else if (verdicts.every((value) => value === 'unpatched')) state = 'unpatched';
  else if (verdicts.some((value) => value === 'current') && verdicts.some((value) => value === 'unpatched')) state = 'mixed';
  else state = 'stale';
  return {
    app,
    archive: archive ?? path.join(app, ARCHIVE_DIR),
    state,
    files,
    revision,
    archiveMtime: newestMtime(path.dirname(archive ?? path.join(app, ARCHIVE_DIR))),
    backup: archive !== null && fs.existsSync(`${archive}.dsh-theme-marathon.bak`) ? `${archive}.dsh-theme-marathon.bak` : null,
  };
}

/** Does this state need the patcher to run? */
function needsPatch(state) {
  return state === 'unpatched';
}

/** Does this state need a human (revert, then apply)? */
function needsRepair(state) {
  return state === 'stale' || state === 'mixed';
}

module.exports = {
  ARCHIVE_DIR,
  ARCHIVE_DIR_DARWIN,
  DESKTOP_PACKAGE,
  CACHE_FILE,
  EXPLICIT_ENV,
  ENV_ANCHORS,
  ENV_INSIDE,
  readEntry,
  archiveIn,
  verifyApp,
  walkUp,
  runsFrom,
  launcherPaths,
  utf16Runs,
  pathPrefixes,
  standardPaths,
  siblingsMatching,
  resolveApp,
  cachePath,
  readCache,
  writeCache,
  probeShell,
  needsPatch,
  needsRepair,
};
