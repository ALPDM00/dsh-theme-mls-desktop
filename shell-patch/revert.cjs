#!/usr/bin/env node
/* revert.cjs — restore the pristine DSH Desktop shell.
 *
 * Copies `<app>/resources/app.asar.dsh-theme-marathon.bak` back over
 * `app.asar`. The `.unpacked` sibling directory is never touched by the patch,
 * so nothing else has to be restored.
 *
 * Usage: node revert.cjs [--app <dir>]
 *
 * With no `--app` the installation is discovered (see target.cjs).
 */
'use strict';

// Unpatched filesystem -- see lib/real-fs.cjs. This module is required by
// auto.cjs and shipped inside a plugin, so it must not flip the process-wide
// `process.noAsar` switch the way it used to.
const fs = require('./lib/real-fs.cjs');
const path = require('path');
const target = require('./target.cjs');

/**
 * @param {string[]} [argv] - arguments after the script name, so auto.cjs can
 *   run a repair in-process instead of spawning another node.
 * @returns {number} exit code
 */
function main(argv = process.argv.slice(2)) {
  let app;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--app') app = argv[++index];
    else if (argv[index] === '--help' || argv[index] === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
      return 0;
    } else throw new Error(`unknown argument: ${argv[index]}`);
  }

  if (app === undefined) {
    const found = target.resolveApp({});
    if (found.app === null) {
      throw new Error(
        `could not find a DeepSeek Harness Desktop installation (looked in ${found.tried.length} place(s)).\n` +
          '  Pass --app <install dir> (the directory holding resources/app.asar).',
      );
    }
    app = found.app;
  }

  const archive = path.join(app, 'resources', 'app.asar');
  const backup = `${archive}.dsh-theme-marathon.bak`;
  if (!fs.existsSync(backup)) throw new Error(`no backup found: ${backup}`);
  fs.copyFileSync(backup, archive);
  console.log(`[revert] restored ${archive}`);
  console.log(`[revert] from     ${backup} (${(fs.statSync(backup).size / 1048576).toFixed(1)} MiB)`);
  console.log('[revert] the backup is kept; delete it manually once you are happy');
  return 0;
}

module.exports = { main };

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error('[revert] FAILED');
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}
