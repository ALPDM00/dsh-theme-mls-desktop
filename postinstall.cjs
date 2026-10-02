#!/usr/bin/env node
/* postinstall.cjs — the npm entry point for the shell patch step.
 *
 * `package.json` points `postinstall` here rather than straight at
 * `shell-patch/auto.cjs`, for one reason: **an install must never fail because of
 * this step.** `auto.cjs` already promises that for everything it controls
 * (`--lenient` makes every outcome exit 0), but it cannot promise it for the case
 * where the file is not there at all — a hand-copied or partially-zipped plugin
 * directory loses `shell-patch/` before it loses anything else, and `require`
 * failing would abort `npm install` with a confusing module-not-found error.
 *
 * This file lives at the package root, so it is present whenever the package is.
 * It is a thin wrapper on purpose: all the policy lives in `shell-patch/auto.cjs`.
 */
'use strict';

try {
  const auto = require('./shell-patch/auto.cjs');
  const code = auto.main(['--quiet', '--lenient'], process.env);
  // Zero regardless of what it reports: `--lenient` normally gets there first,
  // and an install is the wrong moment to argue with a user about a patch.
  process.exitCode = 0;
  void code;
} catch (error) {
  // Loud enough to find in an install log, and harmless to everything else.
  console.error(
    `[dsh-theme-mls-desktop] shell patch skipped: ${error && error.message ? error.message : error}`,
  );
  console.error('[dsh-theme-mls-desktop] the theme still works; the transparent window, hidden');
  console.error('[dsh-theme-mls-desktop] caption buttons and "opens maximized" need it. Run');
  console.error('[dsh-theme-mls-desktop] `npm run patch` from the plugin directory to retry.');
  process.exitCode = 0;
}
