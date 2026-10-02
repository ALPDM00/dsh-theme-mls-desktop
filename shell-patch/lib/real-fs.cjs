/* real-fs.cjs — a filesystem that sees real bytes, not Electron's asar mount.
 *
 * Electron's `fs` wrapper hijacks any path containing `.asar` followed by a
 * path separator and serves it out of the archive's virtual mount. That is the
 * right behaviour for application code and exactly the wrong behaviour for this
 * package, which reads and rewrites the archive itself:
 *
 *   - opening `<install>/resources/app.asar` has to read the Pickle header,
 *     not mount the archive;
 *   - reading `<install>/resources/app.asar.unpacked/<inner>` has to read the
 *     sibling directory, not `<inner>` inside the archive.
 *
 * Electron ships `original-fs` for precisely this — the same module with the
 * wrapper left off — so that is preferred. Outside Electron (plain Node,
 * `npm run patch`, the test harness, `postinstall`) there is no wrapper to
 * bypass and the ordinary module is already correct.
 *
 * ## Why this exists instead of `process.noAsar = true`
 *
 * The obvious bypass is to switch the wrapper off for the whole process. That is
 * fine in a CLI entry point that owns its process, and it is what four files in
 * this directory used to do. It is *not* fine in a module that can be loaded
 * inside somebody else's process, and `index.js` does exactly that: it loads
 * `shell-patch/target.cjs` inside the DSH Host (Electron running as node) on
 * every plugin load, to probe the installed shell.
 *
 * The switch is process-wide and irreversible-looking, so on 2026-09-28 the Host
 * lost asar support the moment the theme plugin activated:
 *
 *   - `typert-loader` failed all 20 of its ESM `import()`s with
 *     ERR_MODULE_NOT_FOUND (the files are in the archive; the resolver could no
 *     longer see them);
 *   - `getDshRuntimeVersion()` could not read `dsh-app-boot/package.json`, so
 *     peer-dependency validation failed and profile rows were disabled;
 *   - `webRuntime` was never provided by anything, so `connection` (a required
 *     plugin) stayed pending, taking `session-log-download`, `open-in-app`,
 *     `file-upload`, `api-remotes` and `ui-deliverables` with it;
 *   - the shell showed "The application could not start or stopped
 *     unexpectedly".
 *
 * A library must not flip a process-wide switch to do its own I/O. Use this
 * module instead — it changes no global state, so loading it is always safe.
 */
'use strict';

let fs;
try {
  // Resolvable only inside Electron; it is the unpatched Node fs.
  fs = require('original-fs');
} catch {
  fs = require('fs');
}

module.exports = fs;
