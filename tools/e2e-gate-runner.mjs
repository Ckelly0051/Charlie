import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, rmdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import fs, { readFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import testBrowser, { canShare, waitForApp } from './test-browser.mjs';
import { classify, execute, cleanupContexts, closeBrowser, failureEvidence, buildAccepted, runHarnesses, harnessDeadline } from './run-gate.mjs';

// Only the termination probes defer their deadline until they are running.
// Ordinary gate children still receive a wall-clock deadline from spawn.
function afterReady(path, predicate) {
  return (callback, ms) => {
    let cancelled = false, pollTimer, executionTimer;
    const startupTimer = setTimeout(() => { cancelled = true; clearTimeout(pollTimer); callback(); }, 15000);
    const poll = async () => {
      let ready = false;
      try { ready = predicate(await readFile(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (cancelled) return;
      if (ready) { clearTimeout(startupTimer); executionTimer = setTimeout(callback, ms); }
      else pollTimer = setTimeout(poll, 20);
    };
    void poll();
    return () => { cancelled = true; clearTimeout(startupTimer); clearTimeout(pollTimer); clearTimeout(executionTimer); };
  };
}

async function logProbe(mode, logPath) {
  const write = fs.writeSync, close = fs.closeSync;
  if (mode === 'short') fs.writeSync = (fd, chunk, offset, length) => write(fd, chunk, offset, Math.min(1, length));
  if (mode === 'zero') fs.writeSync = () => 0;
  if (mode === 'error') fs.writeSync = () => { throw Object.assign(new Error('simulated disk full'), { code: 'ENOSPC' }); };
  if (mode === 'close') fs.closeSync = fd => { close(fd); throw new Error('simulated close failure'); };
  syncBuiltinESMExports();
  let result;
  try {
    result = await execute(process.execPath, ['-e', mode === 'short' || mode === 'close'
      ? 'console.log("complete diagnostic");process.exit(0)'
      : 'console.log("OWNED_PID="+process.pid);setInterval(()=>{},1000)'], process.env, undefined, { logPath, timeoutMs: 5000 });
  } finally { fs.writeSync = write; fs.closeSync = close; syncBuiltinESMExports(); }
  const pid = Number(result.output.match(/OWNED_PID=(\d+)/)?.[1]);
  let alive = false;
  if (pid) { try { process.kill(pid, 0); alive = true; } catch {} }
  console.log(JSON.stringify({ ...result, alive, logMatches: (await readFile(logPath, 'utf8')) === result.output }));
}

async function probe(mode) {
  const browser = await testBrowser.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
  const page = await browser.newPage();
  await page.goto(process.env.GIQ_GATE_PROBE_URL);
  if (mode === 'write' || mode === 'leak' || mode === 'hang') {
    await page.evaluate(async () => {
      localStorage.setItem('probe', 'old');
      document.cookie = 'probe=old; path=/';
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('probe');
        request.onsuccess = () => { request.result.close(); resolve(); };
        request.onerror = () => reject(request.error);
      });
      await caches.open('probe');
    });
    const sibling = await browser.newPage();
    await sibling.goto(process.env.GIQ_GATE_PROBE_URL);
    assert.equal(await sibling.evaluate(() => localStorage.getItem('probe')), 'old');
    const extra = await browser.createBrowserContext();
    const isolated = await extra.newPage();
    await isolated.goto(process.env.GIQ_GATE_PROBE_URL);
    assert.equal(await isolated.evaluate(() => localStorage.getItem('probe')), null);
    if (mode === 'leak') process.exit(1);
    if (mode === 'hang') {
      console.log('hung browser probe ready');
      setInterval(() => {}, 1000);
      await new Promise(() => {});
    }
  } else {
    const state = await page.evaluate(async () => ({ value: localStorage.getItem('probe'),
      cookies: document.cookie, databases: await indexedDB.databases(), caches: await caches.keys() }));
    assert.deepEqual(state, { value: null, cookies: '', databases: [], caches: [] });
  }
  await browser.close();
  await browser.close();
  console.log('== RESULT: 1 passed, 0 failed ==');
}

export async function runTests() {
  let pass = 0, fail = 0;
  const check = (label, fn) => { try { fn(); pass++; console.log(`  PASS  ${label}`); }
    catch (error) { fail++; console.log(`  FAIL  ${label}: ${error.message}`); } };
  const cases = [
    ['== RESULT: 24 passed, 0 failed ==', 0, 'pass'],
    ['ALL PASS - 18 passed, 0 failed', 0, 'pass'],
    ['ALL PASS - 16 campaigns clean, 0 failures', 0, 'pass'],
    ['TOTALS - violations: 0', 0, 'pass'],
    ['== RESULT: 20 passed, 3 failed ==', 1, 'fail'],
    ['ALL PASS - 4 campaigns clean, 1 failures', 1, 'fail'],
    ['TOTALS - violations: 12', 1, 'fail'],
    ['', 0, 'fail'],
    ['PASS unknown groups fail closed\n== RESULT: 12 passed, 0 failed ==', 0, 'pass'],
    ['== RESULT: 20 passed ==', 1, 'fail'],
    ['== RESULT: 20 passed ==', 0, 'pass'],
    ['== RESULT: 20 passed, 0 failed ==', 1, 'fail'],
    ['== RESULT: 20 passed, 2 failed ==', 0, 'fail'],
    ['== RESULT: 0 passed, 0 failed (skipped) ==', 0, 'skip'],
    ['== RESULT: 0 passed, 0 failed (skipped) ==', 1, 'fail'],
  ];
  for (const [output, code, status] of cases) check(`scoring ${status}: ${output || '<empty>'}, exit ${code}`,
    () => assert.equal(classify(output, code).status, status));
  check('standard launch options can share', () => assert(canShare({ args: ['--no-sandbox'], headless: 'new', protocolTimeout: 240000 })));
  for (const options of [{ args: ['--autoplay-policy=no-user-gesture-required'] }, { headless: false },
    { userDataDir: 'some-profile' }, { executablePath: 'other-chrome' }, { unknownOption: true }]) {
    check(`nonstandard options use their own launch: ${JSON.stringify(options)}`, () => assert(!canShare(options)));
  }
  const buildFailure = await execute(process.execPath, ['-e', 'console.log("simulated failed build");process.exit(7)']);
  check('child exit code survives output capture', () => assert.equal(buildFailure.code, 7));
  check('failed build refuses the gate', () => assert.equal(buildAccepted(buildFailure), false));
  check('successful build permits the gate', () => assert.equal(buildAccepted({ code: 0 }), true));
  check('buried assertion survives a long diagnostic tail', () => assert.deepEqual(
    failureEvidence('  FAIL  buried assertion\n' + '  PASS later assertion\n'.repeat(42)), ['  FAIL  buried assertion']));

  check('stress campaigns retain a ten-minute execution budget', () => assert.equal(harnessDeadline('e2e-integrity.mjs'), 600000));
  check('pure analytics checks have a one-minute execution budget', () => assert.equal(harnessDeadline('e2e-crosstab.mjs'), 60000));
  check('ordinary browser journeys have a three-minute execution budget', () => assert.equal(harnessDeadline('e2e-native-reports.mjs'), 180000));
  const scratch = await mkdtemp(resolve(tmpdir(), 'giq-gate-deadlines-'));
  try {
    const logPath = resolve(scratch, 'failure.log');
    const logged = await execute(process.execPath, ['-e', 'console.log("FIRST");console.error("stderr evidence");console.log("tail\\n".repeat(80));process.exit(7)'], process.env, undefined, { logPath });
    const saved = await readFile(logPath, 'utf8');
    check('complete durable diagnostics include early stdout and stderr beyond the console tail', () => assert(saved.includes('FIRST') && saved.includes('stderr evidence') && saved === logged.output));
    check('durable logging preserves the original failure exit code', () => assert.equal(logged.code, 7));
    const heartbeat = resolve(scratch, 'heartbeat');
    const slowEnv = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import=data:text/javascript,await%20new%20Promise(r%3D%3EsetTimeout(r,1200))` };
    const timed = await execute(process.execPath, ['tools/e2e-gate-runner.mjs', '--process-probe', heartbeat], slowEnv, undefined,
      { timeoutMs: 100, logPath: resolve(scratch, 'timeout.log'), deadlineScheduler: afterReady(heartbeat, text => text.length > 0) });
    check('a hung child fails explicitly at its deadline even after a green result line', () => assert(timed.timedOut && timed.code === 1 && classify(timed.output, timed.code).status === 'fail'));
    check('timeout diagnostics retain the deadline and the completed partial output', () => assert(timed.output.includes('TIMEOUT:') && timed.output.includes('RESULT: 1 passed')));
    const before = (await stat(heartbeat)).size;
    await new Promise(resolve => setTimeout(resolve, 200));
    check('timeout terminates the descendant process, not just its parent', () => assert.equal(before, statSyncSize()));
    function statSyncSize() { return readFileSync(heartbeat).length; }
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 200);
    const interrupted = await execute(process.execPath, ['-e', 'setInterval(()=>{},1000)'], process.env, controller.signal,
      { timeoutMs: 5000, logPath: resolve(scratch, 'interrupted.log') });
    clearTimeout(abortTimer);
    check('external interruption fails distinctly from a harness timeout', () => assert(interrupted.aborted && !interrupted.timedOut && interrupted.code === 1));
    check('interruption is retained in the durable log', () => assert(interrupted.output.includes('INTERRUPTED:')));
    for (const mode of ['short', 'zero', 'error', 'close']) {
      const probeResult = await execute(process.execPath, ['tools/e2e-gate-runner.mjs', '--log-probe', mode, resolve(scratch, `${mode}.log`)]);
      assert.equal(probeResult.code, 0, probeResult.output);
      const data = JSON.parse(probeResult.output.trim());
      check(`logging ${mode} preserves controlled results and process cleanup`, () => {
        assert.equal(data.code, mode === 'short' ? 0 : 1);
        assert.equal(data.alive, false);
        if (mode === 'short') assert(data.logMatches);
        else assert(data.logError && data.output.includes('LOG FAILED:'));
      });
    }
  } finally {
    assert.equal(dirname(scratch), resolve(tmpdir()));
    assert(scratch.startsWith(resolve(tmpdir(), 'giq-gate-deadlines-')));
    await rm(scratch, { recursive: true, force: true });
  }

  const launched = [], endpoints = [];
  let calls = 0, cleaned = 0;
  const deadlines = [];
  const exit = await runHarnesses(Array(3).fill('e2e-native-reports.mjs'), {
    recycleEvery: 2,
    launchBrowser: async () => {
      const defaultContext = {};
      const browser = { closed: false, contexts: [defaultContext],
        wsEndpoint: () => `test-endpoint-${launched.indexOf(browser)}`,
        defaultBrowserContext: () => defaultContext,
        browserContexts: () => [...browser.contexts],
        async close() { browser.closed = true; } };
      launched.push(browser);
      return browser;
    },
    executeHarness: async (command, args, env, signal, options) => {
      deadlines.push(options);
      endpoints.push(env.GIQ_TEST_BROWSER_ENDPOINT);
      const browser = launched.at(-1);
      const context = { async close() { cleaned++; browser.contexts = browser.contexts.filter(item => item !== context); } };
      browser.contexts.push(context);
      calls++;
      return { code: calls === 2 ? 1 : 0, timedOut: calls === 2, output: '== RESULT: 1 passed, 0 failed ==' };
    },
  });
  check('runner keeps a nonzero child red and continues every harness', () => assert(exit === 1 && calls === 3));
  check('runner shares before the recycle boundary, then launches afresh', () => assert.deepEqual(endpoints,
    ['test-endpoint-0', 'test-endpoint-0', 'test-endpoint-1']));
  check('runner cleans orphan contexts after green and red children', () => assert.equal(cleaned, 3));
  check('runner closes recycled and final Chromium instances', () => assert(launched.every(browser => browser.closed)));
  check('runner passes deadlines and distinct log paths to every child', () => assert(deadlines.every(item => item.timeoutMs === 180000) && new Set(deadlines.map(item => item.logPath)).size === 3));

  await assert.rejects(cleanupContexts({ browserContexts: () => [{close: () => new Promise(() => {})}],
    defaultBrowserContext: () => null }, 20), /cleanup exceeded/);
  check('context cleanup cannot hang beyond its own deadline', () => assert(true));
  const browserChild = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, detached: process.platform !== 'win32', stdio: 'ignore' });
  const browserExited = new Promise(resolve => browserChild.once('exit', resolve));
  let disconnected = false;
  await closeBrowser({close: () => new Promise(() => {}), process: () => browserChild,
    disconnect: () => { disconnected = true; }}, 20);
  await browserExited;
  check('stalled browser shutdown force-terminates its owned process and disconnects', () => assert(disconnected));
  let cleanupRuns = 0, recoveryLaunches = 0, recoveryCloses = 0;
  const recoveryResult = await runHarnesses(Array(2).fill('e2e-native-reports.mjs'), {
    cleanupTimeoutMs: 20,
    launchBrowser: async () => {
      const first = ++recoveryLaunches === 1;
      const root = {};
      return { wsEndpoint: () => 'synthetic', defaultBrowserContext: () => root,
        browserContexts: () => first ? [root, { close: () => new Promise(() => {}) }] : [root],
        close: async () => { recoveryCloses++; } };
    },
    executeHarness: async () => { cleanupRuns++; return {code:0,output:'== RESULT: 1 passed, 0 failed =='}; },
  });
  check('stalled cleanup makes the journey red, replaces Chromium and runs the next child', () => assert(recoveryResult === 1 && cleanupRuns === 2 && recoveryLaunches === 2 && recoveryCloses === 2));

  const server = createServer((request, response) => response.end('<!doctype html><title>Gate isolation</title>'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const readyPage = await browser.newPage();
    await readyPage.setContent('<!doctype html><title>Readiness</title>');
    await assert.rejects(waitForApp(readyPage, 100), /timeout/i);
    check('readiness rejects a page without the App', () => assert(true));
    await readyPage.evaluate(() => {
      window.app = { workspaceShell: { root: { dataset: { route: 'home' } } },
        homeScreen: { snapshot: () => ({ status: 'ready' }) } };
    });
    await assert.rejects(waitForApp(readyPage, 100), /timeout/i);
    check('readiness rejects an unrendered Home', () => assert(true));
    await readyPage.evaluate(() => {
      const home = document.createElement('main'); home.setAttribute('data-native-home', ''); document.body.append(home);
      window.app.homeScreen.snapshot = () => ({ status: 'loading' });
    });
    await assert.rejects(waitForApp(readyPage, 100), /timeout/i);
    check('readiness rejects unfinished Home state', () => assert(true));
    await readyPage.evaluate(() => {
      window.app.homeScreen.snapshot = () => ({ status: 'ready' });
      window.app.workspaceShell.root.dataset.route = 'study';
    });
    await assert.rejects(waitForApp(readyPage, 100), /timeout/i);
    check('readiness rejects a non-startup route', () => assert(true));
    await readyPage.evaluate(() => { window.app.workspaceShell.root.dataset.route = 'home'; });
    await readyPage.evaluate(() => Object.defineProperty(document.fonts, 'status', { configurable: true, value: 'loading' }));
    await assert.rejects(waitForApp(readyPage, 100), /timeout/i);
    check('readiness rejects pending fonts', () => assert(true));
    await readyPage.evaluate(() => { delete document.fonts.status; });
    await waitForApp(readyPage, 500);
    check('readiness resolves when the startup state and rendered Home agree', () => assert(true));
    await readyPage.close();
    const env = { ...process.env, GIQ_TEST_BROWSER_ENDPOINT: browser.wsEndpoint(),
      GIQ_GATE_PROBE_URL: `http://127.0.0.1:${server.address().port}/` };
    for (const mode of ['write', 'read', 'leak']) {
      const result = await execute(process.execPath, ['tools/e2e-gate-runner.mjs', '--probe', mode], env);
      check(`${mode} child uses the shared process with isolated storage`, () => assert.equal(result.code, mode === 'leak' ? 1 : 0, result.output));
      if (mode !== 'leak') check(`${mode} child closes every owned context without closing Chromium`, () => assert.equal(browser.browserContexts().length, 1));
    }
    const hungLog = resolve(await mkdtemp(resolve(tmpdir(), 'giq-gate-browser-')), 'hung.log');
    const hung = await execute(process.execPath, ['tools/e2e-gate-runner.mjs', '--probe', 'hang'], env, undefined,
      { timeoutMs: 100, logPath: hungLog, deadlineScheduler: afterReady(hungLog, text => text.includes('hung browser probe ready')) });
    await rm(hungLog); await rmdir(dirname(hungLog));
    check('a real browser child deadline fails and retains its partial output', () => assert(hung.timedOut && hung.output.includes('hung browser probe ready')));
    check('timed-out browser child does not terminate the shared Chromium process', () => assert(browser.connected));
    await browser.createBrowserContext();
    await browser.createBrowserContext();
    await cleanupContexts(browser);
    check('runner reclaims orphan contexts', () => assert.equal(browser.browserContexts().length, 1));
    const after = await execute(process.execPath, ['tools/e2e-gate-runner.mjs', '--probe', 'read'], env);
    check('cleanup after crashed and timed-out children preserves a clean next child', () => assert.equal(after.code, 0, after.output));
    check('Chromium remains alive after all children close', () => assert(browser.connected));
  } catch (error) { fail++; console.log(`  FAIL  browser isolation: ${error.stack}`); }
  finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
  console.log(`== RESULT: ${pass} passed, ${fail} failed ==`);
  return fail ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === '--process-probe') {
      spawn(process.execPath, ['-e', 'const fs=require("node:fs");setInterval(()=>fs.appendFileSync(process.argv[1],"tick\\n"),30)', process.argv[3]], { stdio: 'ignore', windowsHide: true });
      console.log('== RESULT: 1 passed, 0 failed ==');
      setInterval(() => {}, 1000);
    } else if (process.argv[2] === '--log-probe') await logProbe(process.argv[3], process.argv[4]);
    else process.exitCode = process.argv[2] === '--probe' ? await probe(process.argv[3]) : await runTests();
  }
  catch (error) { console.error(error); process.exitCode = 1; }
}
