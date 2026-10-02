import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function classify(output, code) {
  const line = output.split(/\r?\n/).filter(line => /RESULT:|ALL PASS|TOTALS/.test(line)).at(-1) || '';
  if (code !== 0 || !line || /[1-9][0-9]*\s+(failed|failures)|violations:\s*[1-9]/.test(line)) return { status: 'fail', line };
  return { status: /\(skipped\)/i.test(line) ? 'skip' : 'pass', line };
}

export const failureEvidence = output => output.split(/\r?\n/).filter(line => /^\s*FAIL(\s|$)/.test(line));
export const buildAccepted = result => result.code === 0;
export async function cleanupContexts(browser) {
  for (const context of browser.browserContexts()) {
    if (context !== browser.defaultBrowserContext()) await context.close();
  }
}

export function execute(command, args, env = process.env, signal) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd: ROOT, env, signal, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => resolveResult({ output, code: signal ? 1 : code }));
  });
}

export async function runHarnesses(files, { freshBrowser = false, recycleEvery = 20,
  launchBrowser = options => puppeteer.launch(options), executeHarness = execute } = {}) {
  let browser = null, runs = 0, launches = 0;
  const totals = { pass: 0, skip: 0, fail: 0 };
  const failed = [], slow = [];
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    for (const file of files) {
      if (controller.signal.aborted) throw new Error('Gate interrupted');
      const source = await readFile(resolve(ROOT, 'tools', file), 'utf8');
      if (!freshBrowser && source.includes("from './test-browser.mjs'") && (!browser || runs >= recycleEvery)) {
        if (browser) await browser.close();
        browser = await launchBrowser({ args: ['--no-sandbox'] });
        runs = 0;
        launches++;
      }
      const env = { ...process.env };
      delete env.GIQ_TEST_BROWSER_ENDPOINT;
      if (browser) env.GIQ_TEST_BROWSER_ENDPOINT = browser.wsEndpoint();
      const started = Date.now();
      let result;
      try { result = await executeHarness(process.execPath, [resolve(ROOT, 'tools', file)], env, controller.signal); }
      finally {
        // A crashed child may never call close(). Reclaim every non-default
        // context before the next child, rather than silently leaking state.
        if (browser) await cleanupContexts(browser);
      }
      runs++;
      const secs = Math.round((Date.now() - started) / 1000);
      const { status, line } = classify(result.output, result.code);
      totals[status]++;
      console.log(`${status === 'pass' ? 'ok  ' : status === 'skip' ? 'skip' : 'FAIL'} ${file.padEnd(42)} ${String(secs).padStart(4)}s  ${status === 'fail' ? `(exit ${result.code}) ` : ''}${line || '<no result line>'}`);
      if (secs >= 25) slow.push(`  ${secs}s  ${file}`);
      if (status === 'fail') {
        failed.push(file);
        const assertions = failureEvidence(result.output);
        if (assertions.length) console.log('       assertion failure(s):\n' + assertions.map(line => `       ${line}`).join('\n'));
        console.log(result.output.split(/\r?\n/).slice(-40).map(line => `       ${line}`).join('\n'));
      }
    }
  } finally {
    try { if (browser) await browser.close(); }
    finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); }
  }
  if (slow.length) console.log('\n=== harnesses over 25s ===\n' + slow.join('\n'));
  console.log(`\n=== ${files.length} harnesses | ${totals.pass} green | ${totals.skip} skipped | ${totals.fail} failed ===`);
  if (!freshBrowser) console.log(`Shared Chromium launches: ${launches} (special launch options use dedicated browsers).`);
  if (failed.length) console.log(`failed: ${failed.join(' ')}`);
  return totals.fail ? 1 : 0;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    const result = await execute(process.execPath, ['tools/e2e-gate-runner.mjs']);
    console.log(result.output);
    return result.code;
  }
  const known = new Set(['--no-build', '--fresh-browser', '--only']);
  let only = null;
  for (let i = 0; i < args.length; i++) {
    if (!known.has(args[i])) throw new Error(`Unknown gate option: ${args[i]}`);
    if (args[i] === '--only') {
      only = args[++i]?.split(',');
      if (!only?.length) throw new Error('--only requires comma-separated harness filenames');
    }
  }
  let files = (await readdir(resolve(ROOT, 'tools'))).filter(name => /^e2e-.*\.mjs$/.test(name)).sort();
  if (only) {
    for (const file of only) if (!files.includes(file)) throw new Error(`Unknown harness: ${file}`);
    files = files.filter(file => only.includes(file));
  }
  if (!args.includes('--no-build')) {
    console.log('=== BUILD ===');
    const build = process.platform === 'win32'
      ? await execute(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm run build'])
      : await execute('npm', ['run', 'build']);
    console.log(build.output.split(/\r?\n/).slice(-3).join('\n'));
    if (!buildAccepted(build)) { console.error(`BUILD FAILED (exit ${build.code}); refusing to gate a stale bundle.`); return 1; }
  }
  console.log(only ? '=== FOCUSED HARNESS RUN (not the full gate) ===' : '=== GATE ===');
  return runHarnesses(files, { freshBrowser: args.includes('--fresh-browser') });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = await main(); }
  catch (error) { console.error(error); process.exitCode = 1; }
}
