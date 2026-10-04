/**
 * COMPARE BUILDS (docs/archive/plans/LEGACY-EXCISION-PLAN.md, Phase 0). Proves a change
 * meant to alter nothing on screen alters nothing: every route is captured
 * from a baseline revision's build and from the current build, same session,
 * same data, and the screenshots must be byte-identical.
 *
 *   node tools/compare-builds.mjs <baseline-rev> [--keep]
 *
 * The baseline is exported with `git archive` into a temp folder (no git
 * worktree), linked to this checkout's node_modules through a junction, and
 * built there. Cleanup removes the JUNCTION FIRST (rmdir on a junction unlinks
 * it), verifies this checkout's node_modules still has its packages, and only
 * then deletes the temp folder: removing a folder through a junction once
 * emptied the real node_modules (2026-09-24).
 *
 * The current build is `npm run build` in this checkout. Exit 1 when any
 * capture differs. Internal: `--capture <outDir>` captures the build served by
 * GIQ_APP_ROOT (or dist/).
 */
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

async function capture(outDir) {
  const { APP_URL } = await import('./app-entry.mjs');
  const { default: puppeteer } = await import('puppeteer');
  const { setupTeamAndDemo } = await import('./hub-setup.mjs');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 180000 });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.app?.workspaceShell && window.app?.teamHubScreen, { timeout: 20000 });
  await setupTeamAndDemo(page, 'St. Joseph Mavericks');
  await page.waitForFunction(() => (window.app.storage?.seasonStore?.data?.games?.length || 0) > 0, { timeout: 20000 });
  await page.evaluate(async () => {
    const app = window.app, game = app.storage.seasonStore.data.games[0];
    await app.openGame(game.id);
    if (app.quickChart?.isActive) app.quickChart.toggle();
    app.tagger.selectPlay(app.tagger.plays[2]?.id);
  });
  // Deterministic captures: no animation or transition mid-flight, no caret,
  // no toast (a toast's fade made two builds of the same code differ).
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}.gi-native-toast,[data-native-toast]{display:none!important}' });
  const settle = async () => {
    await page.evaluate(() => { document.querySelectorAll('.gi-native-toast').forEach(t => t.click()); document.activeElement?.blur?.(); });
    // The pointer at one fixed spot, so hover is the same in both builds.
    await page.mouse.move(2, 2);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await new Promise(r => setTimeout(r, 300));
  };
  const route = id => page.evaluate(async v => { await window.app.workspaceShell.show(v); }, id);
  const tab = id => page.evaluate(t => document.querySelector(`[data-report-tab="${t}"]`)?.click(), id);
  // Each state names the screen it must show; a capture whose screen is not
  // on display FAILS instead of photographing whatever was there before
  // (Codex review, 2026-09-25: two Reports tab ids were wrong and both builds
  // captured the previous tab, which compared identical).
  const onRoute = r => `document.getElementById('workspaceShell')?.dataset.route === '${r}'`;
  const states = [
    ['home', () => route('home'), onRoute('home')],
    ['breakdown-chart', async () => { await route('breakdown'); await page.evaluate(() => { const w = window.app.breakdownWorkspace; w._setFilmFocus(false, { persist: false }); w._setView('chart'); }); },
      onRoute('breakdown') + " && !!document.querySelector('[data-bd-view=\"chart\"][aria-pressed=\"true\"]')"],
    ['breakdown-tools', () => page.evaluate(() => document.querySelector('[data-bd-tools-toggle]')?.click()), "!!document.querySelector('.gi-breakdown-tools.is-open')"],
    ['breakdown-film-below', () => page.evaluate(() => { const w = window.app.breakdownWorkspace; document.querySelector('[data-bd-tools-toggle][aria-expanded="true"]')?.click(); w._setView('film-room'); w.setFilmLayout({ dock: 'bottom' }, { persist: false }); }),
      "!!document.querySelector('[data-native-breakdown-route][data-fr-dock=\"bottom\"]') && !!document.querySelector('[data-bd-view=\"film-room\"][aria-pressed=\"true\"]') && !document.querySelector('.gi-breakdown-tools.is-open')"],
    ['breakdown-film-beside', () => page.evaluate(() => window.app.breakdownWorkspace.setFilmLayout({ dock: 'side' }, { persist: false })), "!!document.querySelector('[data-native-breakdown-route][data-fr-dock=\"side\"]')"],
    ['breakdown-focus', () => page.evaluate(() => { const w = window.app.breakdownWorkspace; w.setFilmLayout({ dock: 'bottom' }, { persist: false }); w._setView('chart'); w._setFilmFocus(true, { persist: false }); }), "!!document.querySelector('.gi-breakdown-route.is-film-focus')"],
    ['study', async () => { await page.evaluate(() => window.app.breakdownWorkspace._setFilmFocus(false, { persist: false })); await route('study'); }, onRoute('study')],
    ...['overview', 'offense', 'defense', 'special', 'players', 'selfscout', 'matchup', 'season'].map(t => [`reports-${t}`, async () => { await route('reports'); await tab(t); },
      onRoute('reports') + ` && !!document.querySelector('[data-report-tab="${t}"].active')`]),
    ['plan', () => route('plan'), onRoute('plan')],
  ];
  const results = {};
  for (const [w, h] of [[1440, 900], [1280, 800], [768, 1024], [390, 844]]) {
    await page.setViewport({ width: w, height: h });
    for (const [name, go, shows] of states) {
      await go(); await settle();
      if (!(await page.evaluate(expr => { try { return !!eval(expr); } catch { return false; } }, shows))) {
        await browser.close();
        throw new Error(`${w}-${name}: the screen it names is not showing (${shows})`);
      }
      const buffer = await page.screenshot();
      const file = `${w}-${name}.png`;
      fs.writeFileSync(path.join(outDir, file), buffer);
      results[file] = crypto.createHash('sha256').update(buffer).digest('hex');
    }
  }
  fs.writeFileSync(path.join(outDir, 'hashes.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}

function junctionTarget(link) {
  try { return fs.readlinkSync(link); } catch { return null; }
}

async function compare(rev, keep) {
  const sha = execSync(`git rev-parse --short ${rev}`, { cwd: ROOT }).toString().trim();
  const head = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  const dirty = execSync('git status --porcelain --untracked-files=no', { cwd: ROOT }).toString().trim();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'giq-compare-'));
  const base = path.join(work, 'base');
  const link = path.join(base, 'node_modules');
  fs.mkdirSync(base);
  let failed = false;
  try {
    execSync(`git archive --format=tar -o "${path.join(work, 'base.tar')}" ${sha}`, { cwd: ROOT });
    execSync(`tar -xf "${path.join(work, 'base.tar')}" -C "${base}"`);
    execSync(`cmd /c mklink /J "${link}" "${path.join(ROOT, 'node_modules')}"`, { stdio: 'ignore' });
    console.log(`Building baseline ${sha}...`);
    execSync('npm run build', { cwd: base, stdio: 'ignore' });
    console.log(`Building current ${head}${dirty ? ' (with uncommitted tracked changes)' : ''}...`);
    execSync('npm run build', { cwd: ROOT, stdio: 'ignore' });
    const self = fileURLToPath(import.meta.url);
    const run = (root, out) => {
      const r = spawnSync(process.execPath, [self, '--capture', out], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, GIQ_APP_ROOT: root } });
      if (r.status !== 0) throw new Error(`capture failed for ${root}`);
      return JSON.parse(fs.readFileSync(path.join(out, 'hashes.json'), 'utf8'));
    };
    console.log('Capturing baseline...');
    const a = run(path.join(base, 'dist'), path.join(work, 'shots-base'));
    console.log('Capturing current...');
    const b = run(path.join(ROOT, 'dist'), path.join(work, 'shots-current'));
    const names = Object.keys(a.results);
    let differ = names.filter(n => a.results[n] !== b.results[n]);
    // A real change differs every time; rasterization noise (a stray pixel)
    // does not. Anything that differed is captured again from both builds and
    // reported only if it differs again.
    let flaky = [];
    if (differ.length) {
      console.log(`${differ.length} differed; capturing both builds again to separate change from noise...`);
      const a2 = run(path.join(base, 'dist'), path.join(work, 'shots-base-2'));
      const b2 = run(path.join(ROOT, 'dist'), path.join(work, 'shots-current-2'));
      flaky = differ.filter(n => a2.results[n] === b2.results[n]);
      differ = differ.filter(n => a2.results[n] !== b2.results[n]);
    }
    const distinct = new Set(Object.values(b.results)).size;
    console.log(`\n${names.length} captures (${distinct} distinct), baseline ${sha} vs current ${head}`);
    if (a.errors.length || b.errors.length) console.log(`page errors: baseline ${a.errors.length}, current ${b.errors.length}`);
    if (flaky.length) console.log(`Differed once, identical on the retry (noise): ${flaky.join(', ')}`);
    if (differ.length) {
      failed = true;
      console.log(`DIFFER (${differ.length}):`); for (const n of differ) console.log(`  ${n}`);
      console.log(`Screenshots: ${work}`);
    } else console.log('IDENTICAL: every capture is byte-identical.');
  } finally {
    // Junction first, verify, then the folder.
    if (junctionTarget(link) !== null || fs.existsSync(link)) spawnSync('cmd', ['/c', 'rmdir', link], { stdio: 'ignore' });
    const stillLinked = junctionTarget(link) !== null || fs.existsSync(link);
    const packages = fs.readdirSync(path.join(ROOT, 'node_modules')).length;
    if (stillLinked || packages < 10) {
      console.log(`CLEANUP STOPPED: junction still present (${stillLinked}) or node_modules looks empty (${packages}). Left ${work} in place.`);
      process.exitCode = 1;
    } else if (!keep && !failed) {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }
  if (failed) process.exitCode = 1;
}

if (args[0] === '--capture') await capture(path.resolve(args[1]));
else if (!args[0] || args[0].startsWith('--')) { console.log('usage: node tools/compare-builds.mjs <baseline-rev> [--keep]'); process.exitCode = 2; }
else await compare(args[0], args.includes('--keep'));
