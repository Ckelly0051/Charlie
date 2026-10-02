import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import testBrowser, { canShare, waitForApp } from './test-browser.mjs';
import { classify, execute, cleanupContexts, failureEvidence, buildAccepted, runHarnesses } from './run-gate.mjs';

async function probe(mode) {
  const browser = await testBrowser.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
  const page = await browser.newPage();
  await page.goto(process.env.GIQ_GATE_PROBE_URL);
  if (mode === 'write' || mode === 'leak') {
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

  const launched = [], endpoints = [];
  let calls = 0, cleaned = 0;
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
    executeHarness: async (command, args, env) => {
      endpoints.push(env.GIQ_TEST_BROWSER_ENDPOINT);
      const browser = launched.at(-1);
      const context = { async close() { cleaned++; browser.contexts = browser.contexts.filter(item => item !== context); } };
      browser.contexts.push(context);
      calls++;
      return { code: calls === 2 ? 1 : 0, output: '== RESULT: 1 passed, 0 failed ==' };
    },
  });
  check('runner keeps a nonzero child red and continues every harness', () => assert(exit === 1 && calls === 3));
  check('runner shares before the recycle boundary, then launches afresh', () => assert.deepEqual(endpoints,
    ['test-endpoint-0', 'test-endpoint-0', 'test-endpoint-1']));
  check('runner cleans orphan contexts after green and red children', () => assert.equal(cleaned, 3));
  check('runner closes recycled and final Chromium instances', () => assert(launched.every(browser => browser.closed)));

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
    await browser.createBrowserContext();
    await browser.createBrowserContext();
    await cleanupContexts(browser);
    check('runner reclaims orphan contexts', () => assert.equal(browser.browserContexts().length, 1));
    const after = await execute(process.execPath, ['tools/e2e-gate-runner.mjs', '--probe', 'read'], env);
    check('cleanup after a crashed child preserves a clean next child', () => assert.equal(after.code, 0, after.output));
    check('Chromium remains alive after all children close', () => assert(browser.connected));
  } catch (error) { fail++; console.log(`  FAIL  browser isolation: ${error.stack}`); }
  finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
  console.log(`== RESULT: ${pass} passed, ${fail} failed ==`);
  return fail ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = process.argv[2] === '--probe' ? await probe(process.argv[3]) : await runTests(); }
  catch (error) { console.error(error); process.exitCode = 1; }
}
