// Missed tackles Reports, revision 2: the built app (Tackling module as
// approved 2026-10-07) with the canonical season, the proposed complete
// Tackling module and comparison row applied in the page. Isolated browser
// data only; no coach file is written.
import fs from 'node:fs';
import puppeteer from 'puppeteer';
import { APP_URL } from 'file:///C:/Users/charl/Charlie/tools/app-entry.mjs';
import { CANONICAL_SEASON } from 'file:///C:/Users/charl/Charlie/tools/canonical-season.mjs';

const OUT = process.argv[2];
const season = JSON.parse(fs.readFileSync(CANONICAL_SEASON, 'utf8'));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_hint_shown', '1'));

const open = async (width, height) => {
  await page.setViewport({ width, height });
  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.app?.workspaceShell);
  await page.evaluate(async data => {
    const app = window.app, store = app.storage.seasonStore;
    store.data = store._normalize(structuredClone(data));
    store.currentSeasonId = store.data.id;
    // The same illustrative counts as revision 1: deterministic, longer gains
    // likelier to include a miss, Week 1 left uncharted.
    const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
    store.data.games.forEach((g, gi) => (g.plays || []).forEach(p => {
      if (p.tags?.unit !== 'defense' || gi === 0) return;
      const r = hash(`${gi}|${p.id}|missed`), y = Math.max(0, Number(p.tags.yardage) || 0), miss = Math.min(.85, .1 + y * .045);
      p.tags.missedTackles = r >= miss ? '0' : r < miss * .55 ? '1' : r < miss * .82 ? '2' : r < miss * .95 ? '3' : '4';
    }));
    store.data.activeGameId = store.data.games.find(g => /holy family/i.test(g.gameInfo?.opponent || '')).id;
    app.storage._loadActiveGame();
    app.roster.players = data.roster || [];
    await app.workspaceShell.show('reports');
    await document.fonts.ready;
  }, season);
  await page.addStyleTag({ content: '.gi-toast-stack{display:none!important}' });
  await page.evaluate(() => window.app.reportsScreen.selectTab('defense'));
  await new Promise(r => setTimeout(r, 700));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.offsetParent && b.textContent.trim() === 'Full season')?.click());
  await new Promise(r => setTimeout(r, 900));
};

// The proposal, computed from the same cohorts the board uses.
const revise = () => page.evaluate(() => {
  const screen = window.app.reportsScreen, S = window.app.stats.constructor;
  const plays = screen._defenseScopedPlays;
  const def = plays.filter(p => p.tags?.unit === 'defense' && S._tryPenaltyResolved(p));
  const count = p => { const v = String(p.tags?.missedTackles ?? ''); return /^[0-9]$/.test(v) ? Number(v) : null; };
  const tackled = p => S.splitPlayers(S.effectivePlayers(p).tackler).length > 0;
  const charted = def.filter(p => count(p) != null);
  const misses = charted.reduce((s, p) => s + count(p), 0);
  const madeAll = def.filter(tackled).length, madeCharted = charted.filter(tackled).length;
  const withMiss = charted.filter(p => count(p) > 0), without = charted.filter(p => count(p) === 0);
  const ypp = rows => { const c = rows.filter(p => S.isRun(p) || S.isPass(p)); return c.length ? (c.reduce((s, p) => s + (parseInt(p.tags.yardage, 10) || 0), 0) / c.length).toFixed(1) : '—'; };
  const pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}%` : '—';
  const games = window.app.storage.seasonStore.data.games, last3 = new Set(games.slice(-3).map(g => String(g.id)));
  const recent = charted.filter(p => last3.has(String(p.__gid)));
  const recentMiss = recent.reduce((s, p) => s + count(p), 0), recentMade = recent.filter(tackled).length;
  const rows = [
    ['Tackles Made', madeAll, def.length],
    ['Missed Tackles', misses, charted.length],
    ['Missed Tackle rate', pct(misses, madeCharted + misses), charted.length],
    ['Plays with a Missed Tackle', withMiss.length, charted.length],
    ['Yards / play with a Missed Tackle', ypp(withMiss), withMiss.length],
    ['Yards / play without', ypp(without), without.length],
  ];
  const module = document.querySelector('[data-def2-module="Tackling"]');
  module.style.setProperty('--def2-module-height', `${96 + rows.length * 38}px`);
  module.querySelector('tbody').innerHTML = rows.map(r => `<tr class=" cut-row" tabindex="0" role="button">${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
  const cmp = [...document.querySelector('[data-def2-module="Season vs Last 3"]').querySelectorAll('tbody tr')].find(tr => /Missed Tackle/.test(tr.cells[0].textContent));
  cmp.cells[0].textContent = 'Missed Tackle rate';
  cmp.cells[1].textContent = pct(misses, madeCharted + misses);
  cmp.cells[2].textContent = pct(recentMiss, recentMade + recentMiss);
  module.scrollIntoView({ block: 'center' });
  return rows;
});

for (const [w, h] of [[1440, 900], [1280, 800]]) {
  await open(w, h);
  await page.screenshot({ path: `${OUT}/current-tackling-${w}x${h}.png` });
  const rows = await revise();
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: `${OUT}/proposed-tackling-${w}x${h}.png` });
  if (w === 1440) console.log(JSON.stringify(rows));
}
await browser.close();
