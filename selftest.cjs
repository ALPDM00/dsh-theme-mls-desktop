#!/usr/bin/env node
/* selftest.cjs — convenience runner for the jsdom self-test.
 * Exits non-zero if the test throws. */
const path = require('path');
try {
  require(path.join(__dirname, 'test', 'plugin.test.cjs'));
} catch (e) {
  console.error('\nSELFTEST FAILED:');
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
}
