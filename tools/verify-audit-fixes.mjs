// One-off verification for the four audit fixes (gauge track var, EPA note,
// season self-scout delegation, cross-game drive reconstruction).
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const bundle = 'file://' + path.join(here, '..', 'football-film-analyzer.html');

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`);
  ok ? pass++ : fail++;
};

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(bundle, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 600));

// --- Set up demo season (2 games, fully tagged) ---
await page.evaluate(() => {
  document.getElementById('teamSetupName').value = 'Test Team';
  document.getElementById('btnTeamSetupSave').click();
});
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.getElementById('btnExploreDemo')?.click());
await new Promise(r => setTimeout(r, 1200));

// 1. Gauge track uses the CSS var (no hard-coded-only stroke).
const gauge = await page.evaluate(() => window.Charts ? Charts.gauge(50, 'x') : (typeof Charts !== 'undefined' ? Charts.gauge(50, 'x') : null));
check('gauge track stroke is var(--gauge-track,…)', !!gauge && gauge.includes('var(--gauge-track'), String(gauge).slice(0, 120));

// 2. Cross-game drives: two "games" with overlapping clocks must not interleave or merge.
const driveRes = await page.evaluate(() => {
  const mk = (gi, start, tags) => {
    const p = { id: start, timestamp: { start, end: start + 5 }, tags: Object.assign({ unit: 'offense' }, tags) };
    Object.defineProperty(p, '__seasonGameIdx', { value: gi, enumerable: false });
    return p;
  };
  // Game 0: a drive in progress at clip times 100, 110 (no possession-ending result).
  // Game 1: starts back at clip time 5 — a naive timestamp sort would put it FIRST.
  const plays = [
    mk(0, 100, { down: '1', distance: '10', runPass: 'Run', yardage: '4' }),
    mk(0, 110, { down: '2', distance: '6', runPass: 'Pass', yardage: '7' }),
    mk(1, 5, { down: '1', distance: '10', runPass: 'Run', yardage: '3' }),
    mk(1, 15, { down: '2', distance: '7', runPass: 'Pass', yardage: '20' }),
  ];
  const se = window.app.stats;
  const drives = se._reconstructDrives(plays);
  return {
    count: drives.length,
    firstGame: drives[0].map(p => p.__seasonGameIdx).join(','),
    secondGame: drives[1] ? drives[1].map(p => p.__seasonGameIdx).join(',') : '',
  };
});
check('drives split at the game boundary', driveRes.count === 2, JSON.stringify(driveRes));
check('drives keep game order despite clock overlap', driveRes.firstGame === '0,0' && driveRes.secondGame === '1,1', JSON.stringify(driveRes));

// 3. Season self-scout delegates to StatsEngine (renders predictability headline).
const ssHtml = await page.evaluate(() => window.app.season._renderSelfScout());
check('season self-scout shows Predictability (StatsEngine report)', ssHtml.includes('Predictability') && ssHtml.includes('/100'), ssHtml.slice(0, 160));
check('season self-scout has no leftover _isRun', await page.evaluate(() => typeof window.app.season._isRun === 'undefined'));

// 4. EPA group table notes truncation when >8 rows.
const epaNote = await page.evaluate(() => {
  const se = window.app.stats;
  const rows = Array.from({ length: 11 }, (_, i) => ({ name: 'T' + i, count: 2, total: 1, perPlay: 0.5 }));
  // Re-create groupTable behavior through _renderAdvanced's stats shape.
  const stats = se.compute(window.app.tagger.plays);
  const html = se._renderAdvanced(Object.assign({}, stats, {
    advanced: Object.assign({}, stats.advanced, { count: 1, total: 1, perPlay: 1, curve: [{ cum: 1 }], byType: rows, byFormation: [], byPersonnel: [], byDown: {}, top: [], worst: [] })
  }));
  return html.includes('Top 8 of 11 by EPA/play');
});
check('EPA table shows "Top 8 of N" note', epaNote);

check('no page errors', errors.length === 0, errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
