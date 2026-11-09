#!/usr/bin/env node
/* doctor.cjs — read-only health report for a patched DSH Desktop shell.
 *
 * `apply.cjs` verifies what it writes; `auto.cjs` reports a state. Neither is
 * useful *after* something already looks wrong, because both answer questions
 * about a run that is over. This one answers the post-mortem questions a bug
 * report has to answer, and it never writes to the installation:
 *
 *   - which archive is in play, and is the pristine `.bak` still next to it;
 *   - do the three patched files still carry this revision's digest comment,
 *     or did a Desktop upgrade put a stock file back / leave an older block;
 *   - is the served `index.html` structurally intact (balanced script/style
 *     tags, head/body, clean UTF-8) — the "page renders its own JavaScript as
 *     text" failure of issue #6;
 *   - how does each patched file compare with the pristine backup: identical,
 *     or different at which byte (first 40 chars of context);
 *   - how big is `index.html` inside the archive, so a much larger body served
 *     at `/` can be blamed on the Host's injection rows instead of this patch.
 *
 * Exit code is 0 unless a check failed, so a bug report can quote it. Being
 * stocked (unpatched) is reported, but is not a failure.
 *
 * Usage:
 *   node shell-patch/doctor.cjs              inspect the discovered installation
 *   node shell-patch/doctor.cjs --app <dir>  a specific installation
 *   node shell-patch/doctor.cjs --json       machine-readable report
 *   node shell-patch/doctor.cjs --json --out doctor.json
 *                                            same, written as UTF-8 by fs (a shell
 *                                            `>` is UTF-16 under PowerShell)
 */
'use strict';

// Read the archive file itself, not through Electron's asar wrapper: see
// lib/real-fs.cjs. Nothing here writes anything, ever.
const fs = require('./lib/real-fs.cjs');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('./lib/asar.cjs');
const target = require('./target.cjs');
const { documentProblems } = require('./apply.cjs');
const { TARGET_FILES, PATCHES, revisionState, revisionComment } = require('./patches.cjs');

/** Bytes the Desktop's own document server splices into index.html. */
const DESKTOP_BOOT_READY = '<script>globalThis.__DSH_BOOT_READY__ = Promise.withResolvers()<\/script>';

function parseArgs(argv) {
  const options = { app: undefined, json: false, out: undefined, help: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--app') options.app = argv[++index];
    else if (arg === '--json') options.json = true;
    else if (arg === '--out') options.out = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

/** Entry-type census of an archive header. */
function census(archive) {
  const { header, fields } = asar.readHeader(archive);
  const counts = { files: 0, directories: 0, links: 0, unpacked: 0 };
  const walk = (node) => {
    for (const entry of Object.values(node.files ?? {})) {
      if (entry.files !== undefined) { counts.directories++; walk(entry); continue; }
      if (entry.link !== undefined) { counts.links++; continue; }
      counts.files++;
      if (entry.unpacked === true) counts.unpacked++;
    }
  };
  walk(header);
  return { ...counts, fields };
}

/**
 * Offset of the first differing byte plus context, or null when equal.
 * @param {Buffer} left
 * @param {Buffer} right
 * @returns {{at: number, left: string, right: string}|null}
 */
function firstDifference(left, right) {
  const limit = Math.min(left.length, right.length);
  for (let at = 0; at < limit; at++) {
    if (left[at] === right[at]) continue;
    const from = Math.max(0, at - 24);
    return {
      at,
      left: JSON.stringify(left.subarray(from, at + 24).toString('utf8')),
      right: JSON.stringify(right.subarray(from, at + 24).toString('utf8')),
    };
  }
  if (left.length === right.length) return null;
  return { at: limit, left: JSON.stringify(left.subarray(Math.max(0, limit - 24)).toString('utf8')), right: JSON.stringify(right.subarray(Math.max(0, limit - 24)).toString('utf8')) };
}

/**
 * Inspect one installation.
 * @param {object} options - parsed CLI options
 * @returns {{report: object, problems: string[]}}
 */
function inspect(options) {
  const report = { ok: false, app: null, archive: null, problems: [], files: {} };
  const found = target.resolveApp({ explicit: options.app });
  if (found.app === null) {
    report.reason = found.reason ?? `looked in ${found.tried.length} place(s)`;
    report.tried = found.tried;
    return { report, problems: [`could not locate an installation (${report.reason})`] };
  }
  report.app = found.app;
  report.via = found.how;

  const probe = target.probeShell(found.app);
  report.archive = probe.archive;
  report.state = probe.state;
  report.backup = probe.backup;
  report.archiveBytes = fs.statSync(probe.archive).size;
  if (probe.backup !== null) report.backupBytes = fs.statSync(probe.backup).size;
  report.entries = census(probe.archive);
  if (probe.backup !== null) report.backupEntries = census(probe.backup);

  for (const file of TARGET_FILES) {
    const details = { path: file, wanted: revisionComment(file), fragments: [], document: [] };
    report.files[file] = details;
    let text = null;
    try {
      text = target.readEntry(probe.archive, file);
    } catch (error) {
      details.error = error.message;
      report.problems.push(`${file}: unreadable (${error.message})`);
      continue;
    }
    if (text === null) {
      details.state = 'missing';
      report.problems.push(`${file}: not present in the archive`);
      continue;
    }
    const bytes = Buffer.from(text, 'utf8');
    details.bytes = bytes.length;
    details.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    details.state = revisionState(file, text);
    for (const patch of PATCHES) {
      if (patch.file !== file) continue;
      if (!text.includes(patch.already)) details.fragments.push(patch.name);
    }
    details.document = documentProblems(file, text);
    for (const problem of details.document) report.problems.push(`${file}: ${problem}`);

    if (probe.backup !== null) {
      let pristine = null;
      try {
        pristine = target.readEntry(probe.backup, file);
      } catch (error) {
        details.backupError = error.message;
      }
      if (pristine !== null) {
        const pristineBytes = Buffer.from(pristine, 'utf8');
        details.backupBytes = pristineBytes.length;
        details.backupDiffers = !pristineBytes.equals(bytes);
        if (details.backupDiffers) {
          details.firstDifference = firstDifference(pristineBytes, bytes);
        }
      }
    }
  }

  // A stock shell missing every fragment is *expected*, not damage: only a
  // revision that disagrees with the rest of the shell (stale blocks, or a mixed
  // install where one file is patched and another is not) is reported as a
  // problem. Otherwise the tool would cry wolf on every fresh installation.
  for (const [file, details] of Object.entries(report.files)) {
    if (details.state === undefined || details.state === 'missing') continue;
    if (details.state === 'stale') {
      report.problems.push(`${file}: revision is stale (wanted ${details.wanted})`);
      for (const name of details.fragments) report.problems.push(`${file}: "${name}" is missing its fragment`);
    } else if (details.state === 'unpatched' && report.state !== 'unpatched') {
      report.problems.push(`${file}: unpatched while the rest of the shell is ${report.state}`);
    }
  }

  // The served document is `index.html` + whatever the Desktop / Host splices in.
  // Printing the entry size makes "my page is 50 KB, is the archive broken?" a
  // question with an arithmetic answer.
  const document = TARGET_FILES.find((file) => /\.html?$/iu.test(file));
  if (document !== undefined && report.files[document].bytes !== undefined) {
    report.served = {
      entryBytes: report.files[document].bytes,
      desktopDocumentBytes: report.files[document].bytes + Buffer.byteLength(DESKTOP_BOOT_READY),
    };
  }
  report.ok = report.problems.length === 0;
  return { report, problems: report.problems };
}

/** Human-readable rendering of an inspection. */
function print(report) {
  const line = (text) => console.log(text);
  line('[doctor] dsh-theme-mls-desktop — shell patch health (read-only)');
  if (report.app === null) {
    line(`[doctor] PROBLEM  ${report.reason}`);
    for (const candidate of (report.tried ?? []).slice(0, 8)) line(`[doctor]   tried ${candidate}`);
    return;
  }
  line(`[doctor] app        ${report.app}`);
  line(`[doctor] found by   ${report.via}`);
  line(`[doctor] archive    ${report.archive} (${(report.archiveBytes / 1048576).toFixed(1)} MiB)`);
  line(`[doctor] state      ${report.state}`);
  line(`[doctor] backup     ${report.backup === null ? 'none' : `${report.backup} (${(report.backupBytes / 1048576).toFixed(1)} MiB)`}`);
  const entries = report.entries;
  line(`[doctor] entries    files=${entries.files} dirs=${entries.directories} links=${entries.links} unpacked=${entries.unpacked}`);
  line(`[doctor] header     headerBufLen=${entries.fields.headerBufLen} payloadSize=${entries.fields.payloadSize} jsonLen=${entries.fields.jsonLen}`);
  if (report.backupEntries !== undefined) {
    const pristine = report.backupEntries;
    line(`[doctor] backup hdr files=${pristine.files} dirs=${pristine.directories} links=${pristine.links} unpacked=${pristine.unpacked}`);
  }

  for (const [file, details] of Object.entries(report.files)) {
    line('');
    line(`[doctor] ${file}`);
    if (details.error !== undefined) {
      line(`[doctor]   ERROR    ${details.error}`);
      continue;
    }
    if (details.state === 'missing') {
      line('[doctor]   MISSING  not in the archive');
      continue;
    }
    line(`[doctor]   size     ${details.bytes} B   sha256 ${details.sha256.slice(0, 16)}…`);
    const stock = details.state === 'unpatched' && report.state === 'unpatched';
    line(`[doctor]   revision ${details.state}${details.state === 'current' || stock ? '' : ` (wanted ${details.wanted})`}`);
    if (stock) line('[doctor]   patch    not applied (a stock shell; run node shell-patch/auto.cjs)');
    else if (details.fragments.length > 0) line(`[doctor]   MISSING  fragments: ${details.fragments.join(' | ')}`);
    if (!/\.html?$/iu.test(file)) {
      line('[doctor]   syntax   JavaScript target (apply.cjs checks it with node --check)');
    } else if (details.document.length > 0) {
      for (const problem of details.document) line(`[doctor]   BROKEN   ${problem}`);
    } else {
      line('[doctor]   document structurally sound');
    }
    if (details.backupDiffers === true) {
      const at = details.firstDifference;
      line(`[doctor]   vs .bak  differs from the pristine backup${at === null ? '' : ` (first difference at byte ${at.at})`}`);
      if (at !== null) {
        line(`[doctor]             .bak ${at.left}`);
        line(`[doctor]             now  ${at.right}`);
      }
    } else if (details.backupDiffers === false) {
      line('[doctor]   vs .bak  identical to the pristine backup');
    }
  }

  if (report.served !== undefined) {
    line('');
    line(`[doctor] served     index.html in the archive is ${report.served.entryBytes} B;`);
    line(`[doctor]            the Desktop's own document is that + ${Buffer.byteLength(DESKTOP_BOOT_READY)} B.`);
    line('[doctor]            a much larger body at "/" is the Host splicing plugin');
    line('[doctor]            injection rows in — that text is not in this archive.');
  }

  line('');
  if (report.problems.length === 0) {
    if (report.state === 'current') line('[doctor] OK — patched and structurally sound');
    else line(`[doctor] OK — no damage found, but the shell is ${report.state} (nothing here is broken)`);
  } else {
    line(`[doctor] ${report.problems.length} problem(s):`);
    for (const problem of report.problems) line(`[doctor]   - ${problem}`);
    line('[doctor] fix: node shell-patch/revert.cjs, then node shell-patch/auto.cjs');
    line('[doctor]      (or paste this output into the issue — it names the failing file)');
  }
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
    return 0;
  }
  const { report } = inspect(options);
  // `--out` writes the JSON with fs, i.e. as UTF-8. A shell redirect would do
  // whatever the shell does (`>` in Windows PowerShell means UTF-16LE, which no
  // JSON reader accepts), and the whole point of this report is being pasted
  // into an issue.
  if (options.out !== undefined) {
    fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[doctor] wrote ${options.out}`);
  }
  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else print(report);
  return report.problems.length === 0 ? 0 : 1;
}

module.exports = { main, inspect, census, firstDifference };

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error('[doctor] FAILED');
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}
