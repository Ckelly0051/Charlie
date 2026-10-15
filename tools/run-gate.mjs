import { spawn } from 'node:child_process';
import { readdir, readFile, mkdir, mkdtemp, appendFile } from 'node:fs/promises';
import { openSync, writeSync, closeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import { buildIdentity, sourceIdentity, fixtureIdentity, evidenceFile,
  newReceipt, recordResult, finishReceipt, saveReceipt } from './gate-receipt.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEADLINES = {
  'e2e-integrity.mjs': 600000, // Seeded cross-game operation sequences check live/store invariants.
  'e2e-catalog-fuzzer.mjs': 600000, // Serialized catalog failure campaigns exercise durable rollback.
  'e2e-sql-fuzzer.mjs': 600000, // Seeded SQL mutation/reopen campaigns check retained records.
  'e2e-analytics-registry.mjs': 60000, // Preserve the existing tighter cap for a DOM-free registry census.
  'e2e-analytics-projection.mjs': 60000, // Preserve the existing tighter cap for pure projection contracts.
  'e2e-crosstab.mjs': 60000, // Preserve the existing tighter cap for pure cross-tab calculations.
};
export function harnessDeadline(file) {
  return DEADLINES[file] ?? 180000;
}
async function logDirectory(root = ROOT) {
  const base = resolve(root, 'artifacts', 'gate-logs');
  await mkdir(base, { recursive: true });
  return mkdtemp(resolve(base, `${new Date().toISOString().replace(/[:.]/g, '-')}-`));
}
function terminateTree(child) {
  if (!child.pid) return Promise.resolve();
  if (process.platform === 'win32') return new Promise(resolveKill => {
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => { killer.kill('SIGKILL'); child.kill('SIGKILL'); resolveKill(); }, 5000);
    killer.once('error', () => { clearTimeout(timer); child.kill('SIGKILL'); resolveKill(); });
    killer.once('close', code => { clearTimeout(timer); if (code !== 0) child.kill('SIGKILL'); resolveKill(); });
  });
  try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') child.kill('SIGKILL'); }
  return Promise.resolve();
}
function scheduleDeadline(callback, ms) {
  const timer = setTimeout(callback, ms);
  return () => clearTimeout(timer);
}
async function bounded(operation, ms, label) {
  let timer;
  try {
    return await Promise.race([operation(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
    })]);
  } finally { clearTimeout(timer); }
}
export async function closeBrowser(browser, timeoutMs = 10000) {
  try { await bounded(() => browser.close(), timeoutMs, 'Browser shutdown'); }
  catch (error) {
    const child = browser.process?.();
    if (!child?.pid) throw error;
    await terminateTree(child);
    browser.disconnect();
  }
}
export function classify(output, code) {
  const line = output.split(/\r?\n/).filter(line => /RESULT:|ALL PASS|TOTALS/.test(line)).at(-1) || '';
  if (code !== 0 || !line || /[1-9][0-9]*\s+(failed|failures)|violations:\s*[1-9]/.test(line)) return { status: 'fail', line };
  return { status: /\(skipped\)/i.test(line) ? 'skip' : 'pass', line };
}

export const failureEvidence = output => output.split(/\r?\n/).filter(line => /^\s*FAIL(\s|$)/.test(line));
export const buildAccepted = result => result.code === 0;
export async function cleanupContexts(browser, timeoutMs = 10000) {
  await bounded(async () => {
    for (const context of browser.browserContexts()) {
      if (context !== browser.defaultBrowserContext()) await context.close();
    }
  }, timeoutMs, 'Browser context cleanup');
}

export function execute(command, args, env = process.env, signal,
  { timeoutMs = 180000, logPath, deadlineScheduler = scheduleDeadline, cwd = ROOT } = {}) {
  return new Promise((resolveResult, reject) => {
    const fd = logPath ? openSync(logPath, 'wx') : null;
    const child = spawn(command, args, { cwd, env, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', timedOut = false, aborted = false, kill = null, spawnError = null, logError = null, ended = false;
    const logFailure = error => {
      if (logError) return;
      logError = error;
      output += `\nLOG FAILED: ${error.message}\n`;
      if (!ended) stop('log');
    };
    const capture = chunk => {
      output += chunk;
      if (fd === null || logError) return;
      try {
        let offset = 0;
        while (offset < chunk.length) {
          const written = writeSync(fd, chunk, offset, chunk.length - offset);
          if (written <= 0) throw new Error('Log write made no progress');
          offset += written;
        }
      } catch (error) { logFailure(error); }
    };
    const stop = reason => {
      if (kill) return;
      timedOut = reason === 'timeout'; aborted = reason === 'abort';
      // Termination must not depend on successfully writing its diagnostic.
      kill = terminateTree(child);
      capture(Buffer.from(`\n${timedOut ? 'TIMEOUT' : aborted ? 'INTERRUPTED' : 'LOG FAILURE'}: child ${child.pid} (${timeoutMs}ms deadline)\n`));
    };
    const abort = () => stop('abort');
    const cancelDeadline = deadlineScheduler(() => stop('timeout'), timeoutMs);
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.once('error', error => { spawnError = error; capture(Buffer.from(`${error.stack}\n`)); });
    child.once('close', async (code, exitSignal) => {
      ended = true;
      cancelDeadline(); signal?.removeEventListener('abort', abort);
      await kill;
      if (fd !== null) {
        try { closeSync(fd); } catch (error) { logFailure(error); }
      }
      if (spawnError) reject(spawnError);
      else resolveResult({ output, code: timedOut || aborted || exitSignal || logError ? 1 : code, timedOut, aborted,
        logError: logError?.message });
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export async function runHarnesses(files, { freshBrowser = false, recycleEvery = 20,
  launchBrowser = options => puppeteer.launch(options), executeHarness = execute,
  logDir, deadlineFor = harnessDeadline, cleanupTimeoutMs = 10000, onResult = async () => {},
  root = ROOT, origin = performance.now(), phase = (name, run) => run() } = {}) {
  logDir ||= await logDirectory(root);
  console.log(`Full harness logs: ${logDir}`);
  let browser = null, runs = 0, launches = 0;
  const totals = { pass: 0, skip: 0, fail: 0 };
  const failed = [], slow = [];
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    for (const [index, file] of files.entries()) {
      if (controller.signal.aborted) throw new Error('Gate interrupted');
      const source = await readFile(resolve(root, 'tools', file), 'utf8');
      if (!freshBrowser && source.includes("from './test-browser.mjs'") && (!browser || runs >= recycleEvery)) {
        if (browser) await phase('browser shutdown', () => closeBrowser(browser, cleanupTimeoutMs));
        browser = await phase('browser launch', () => launchBrowser({ args: ['--no-sandbox'] }));
        runs = 0;
        launches++;
      }
      const env = { ...process.env };
      delete env.GIQ_TEST_BROWSER_ENDPOINT;
      if (browser) env.GIQ_TEST_BROWSER_ENDPOINT = browser.wsEndpoint();
      const started = performance.now();
      let result, durationMs;
      try { result = await executeHarness(process.execPath, [resolve(root, 'tools', file)], env, controller.signal,
        { timeoutMs: deadlineFor(file), logPath: resolve(logDir, `${index}-${file}.log`), cwd: root }); }
      finally {
        durationMs = performance.now() - started;
        // A crashed child may never call close(). Reclaim every non-default
        // context before the next child, rather than silently leaking state.
        if (browser) {
          try { await phase('browser context cleanup', () => cleanupContexts(browser, cleanupTimeoutMs)); }
          catch (error) {
            const damaged = browser;
            browser = null;
            await phase('browser shutdown', () => closeBrowser(damaged, cleanupTimeoutMs));
            result ||= { code: 1, output: '' };
            result.code = 1;
            const diagnostic = `\nCLEANUP FAILED: ${error.message}\n`;
            result.output += diagnostic;
            try { await appendFile(resolve(logDir, `${index}-${file}.log`), diagnostic); }
            catch (logError) { result.output += `LOG FAILED: ${logError.message}\n`; }
          }
        }
      }
      runs++;
      const secs = Math.round(durationMs / 1000);
      const { status, line } = classify(result.output, result.code);
      await onResult({ file, status, code: result.code, resultLine: line,
        startedMs: started - origin, durationMs, deadlineMs: deadlineFor(file),
        timedOut: !!result.timedOut, interrupted: !!result.aborted, logError: result.logError || null,
        logPath: resolve(logDir, `${index}-${file}.log`) });
      totals[status]++;
      console.log(`${status === 'pass' ? 'ok  ' : status === 'skip' ? 'skip' : 'FAIL'} ${file.padEnd(42)} ${String(secs).padStart(4)}s  ${status === 'fail' ? `(exit ${result.code}) ` : ''}${line || '<no result line>'}`);
      if (secs >= 25) slow.push(`  ${secs}s  ${file}`);
      if (status === 'fail') {
        failed.push(file);
        console.log(`       ${result.timedOut ? `TIMEOUT after ${Math.round(durationMs)}ms (${deadlineFor(file)}ms deadline); ` : ''}complete output: ${resolve(logDir, `${index}-${file}.log`)}`);
        const assertions = failureEvidence(result.output);
        if (assertions.length) console.log('       assertion failure(s):\n' + assertions.map(line => `       ${line}`).join('\n'));
        console.log(result.output.split(/\r?\n/).slice(-40).map(line => `       ${line}`).join('\n'));
      }
    }
  } finally {
    try { if (browser) await phase('browser shutdown', () => closeBrowser(browser, cleanupTimeoutMs)); }
    finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); }
  }
  if (slow.length) console.log('\n=== harnesses over 25s ===\n' + slow.join('\n'));
  console.log(`\n=== ${files.length} harnesses | ${totals.pass} green | ${totals.skip} skipped | ${totals.fail} failed ===`);
  if (!freshBrowser) console.log(`Shared Chromium launches: ${launches} (special launch options use dedicated browsers).`);
  if (failed.length) console.log(`failed: ${failed.join(' ')}`);
  return totals.fail ? 1 : 0;
}

export async function main(args = process.argv.slice(2), { root = ROOT, budgetMs, blockBudget, deadlineFor, canonicalFixture } = {}) {
  const origin = performance.now(), startedAt = new Date().toISOString(), phases = [];
  const phase = async (name, run) => {
    const started = performance.now();
    try { return await run(); }
    finally { phases.push({ name, startedMs: started - origin, durationMs: performance.now() - started }); }
  };
  const selfTest = args.includes('--self-test');
  if (selfTest && args.length !== 1) throw new Error('--self-test cannot be combined with other options');
  const known = new Set(['--no-build', '--fresh-browser', '--only', '--self-test']);
  let only = null;
  for (let i = 0; i < args.length; i++) {
    if (!known.has(args[i])) throw new Error(`Unknown gate option: ${args[i]}`);
    if (args[i] === '--only') {
      only = args[++i]?.split(',');
      if (!only?.length) throw new Error('--only requires comma-separated harness filenames');
    }
  }
  let files = (await readdir(resolve(root, 'tools'))).filter(name => /^e2e-.*\.mjs$/.test(name)).sort();
  if (selfTest) only = ['e2e-gate-runner.mjs'];
  if (only) {
    for (const file of only) if (!files.includes(file)) throw new Error(`Unknown harness: ${file}`);
    files = files.filter(file => only.includes(file));
  }
  const logDir = await logDirectory(root);
  const receiptPath = resolve(logDir, 'receipt.json');
  const buildRoot = resolve(process.env.GIQ_APP_ROOT || resolve(root, 'dist'));
  const receipt = newReceipt({ scope: selfTest ? 'self-test' : only ? 'focused' : 'full', files,
    source: await phase('source fingerprint', () => sourceIdentity(root)),
    fixtures: await phase('fixtures', () => fixtureIdentity(root, canonicalFixture)), buildRoot, startedAt, budgetMs, blockBudget, phases,
    environment: { node: process.version, platform: process.platform,
      githubActions: process.env.GITHUB_ACTIONS === 'true',
      appRootOverride: process.env.GIQ_APP_ROOT || null,
      realDataOptional: process.env.GIQ_REALDATA_OPTIONAL === '1',
      freshBrowser: args.includes('--fresh-browser') } });
  await saveReceipt(receiptPath, receipt);
  console.log(`Run receipt: ${receiptPath}`);
  let exitCode = 1, failure = null;
  try {
    if (!args.includes('--no-build') && !selfTest) {
      const logPath = resolve(logDir, 'build.log');
      console.log('=== BUILD ===');
      console.log(`Full build log: ${logPath}`);
      const build = await phase('build', () => process.platform === 'win32'
        ? execute(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm run build'], process.env, undefined, { timeoutMs: 300000, logPath, cwd: root })
        : execute('npm', ['run', 'build'], process.env, undefined, { timeoutMs: 300000, logPath, cwd: root }));
      console.log(build.output.split(/\r?\n/).slice(-3).join('\n'));
      receipt.build = { ...receipt.build, state: buildAccepted(build) ? 'pass' : 'fail',
        code: build.code, timedOut: !!build.timedOut, logError: build.logError || null,
        log: await evidenceFile(logPath, root) };
      if (!buildAccepted(build)) throw new Error(`BUILD FAILED (exit ${build.code}); refusing to gate a stale bundle.`);
    } else {
      receipt.build.state = selfTest ? 'not-required' : 'skipped';
    }
    if (!selfTest) receipt.build.before = await phase('build fingerprint', () => buildIdentity(buildRoot));
    await saveReceipt(receiptPath, receipt);
    console.log(only ? '=== FOCUSED HARNESS RUN (not the full gate) ===' : '=== GATE ===');
    exitCode = await runHarnesses(files, { freshBrowser: args.includes('--fresh-browser'), logDir, root, origin, phase, deadlineFor,
      onResult: async result => {
        const { logPath, ...evidence } = result;
        recordResult(receipt, { ...evidence, log: await evidenceFile(logPath, root) });
        await saveReceipt(receiptPath, receipt);
      } });
  } catch (error) { failure = error.message; console.error(error); }
  let source = null, fixtures = null, build = null;
  try {
    source = await phase('source fingerprint', () => sourceIdentity(root));
    fixtures = await phase('fixtures', () => fixtureIdentity(root, canonicalFixture));
    if (receipt.build.before) build = await phase('build fingerprint', () => buildIdentity(buildRoot));
  } catch (error) { failure = [failure, error.message].filter(Boolean).join('; '); exitCode = 1; }
  finishReceipt(receipt, { source, fixtures, build, exitCode, error: failure, wallMs: performance.now() - origin });
  await saveReceipt(receiptPath, receipt);
  console.log(`Wall time: ${(receipt.timing.wallMs / 1000).toFixed(3)}s; setup: ${(receipt.timing.setupMs / 1000).toFixed(3)}s; harnesses: ${(receipt.timing.harnessMs / 1000).toFixed(3)}s; other: ${(receipt.timing.otherMs / 1000).toFixed(3)}s`);
  if (receipt.timing.overBudget) console.log(`BUDGET EXCEEDED (${receipt.timing.budgetMs}ms; ${receipt.timing.blocking ? 'blocking' : 'report-only'}); slowest harnesses:\n` +
    receipt.timing.slowestHarnesses.map(result => `  ${Math.round(result.durationMs)}ms  ${result.file}`).join('\n'));
  console.log(`Receipt: ${receipt.outcome}; performance: ${receipt.performanceOutcome}; release evidence eligible: ${receipt.releaseEligible}; installed approval: not assessed`);
  return receipt.outcome === 'fail' || (receipt.timing.blocking && receipt.timing.overBudget) ? 1 : exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = await main(); }
  catch (error) { console.error(error); process.exitCode = 1; }
}
