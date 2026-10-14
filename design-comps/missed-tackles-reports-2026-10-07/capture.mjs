import { fictionalRoster } from '../../tools/fictional-player-names.mjs';
// Missed tackles Reports comp: the real built app with the canonical season.
// Step 1 captures today's Defense, Players and Season tabs. Isolated browser
// data only; no coach file is written.
import fs from 'node:fs';
import puppeteer from 'puppeteer';
import { APP_URL } from 'file:///C:/Users/charl/Charlie/tools/app-entry.mjs';
import { CANONICAL_SEASON } from 'file:///C:/Users/charl/Charlie/tools/canonical-season.mjs';

const OUT = process.argv[2];
const season = JSON.parse(fs.readFileSync(CANONICAL_SEASON, 'utf8'));
season.roster = fictionalRoster(season.roster || []);
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_hint_shown', '1'));

export const open = async (width, height) => {
  await page.setViewport({ width, height });
  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.app?.workspaceShell);
  await page.evaluate(async data => {
    const app = window.app, store = app.storage.seasonStore;
    store.data = store._normalize(structuredClone(data));
    store.currentSeasonId = store.data.id;
    store.data.activeGameId = store.data.games.find(g => /holy family/i.test(g.gameInfo?.opponent || '')).id;
    app.storage._loadActiveGame();
    app.roster.players = data.roster || [];
    await app.workspaceShell.show('reports');
    await document.fonts.ready;
  }, season);
  await page.addStyleTag({ content: '.gi-toast-stack{display:none!important}' });
};
const tab = async name => {
  await page.evaluate(name => window.app.reportsScreen.selectTab(name), name);
  await new Promise(r => setTimeout(r, 900));
};

const click = async (text, nth = 0) => {
  await page.evaluate((text, nth) => [...document.querySelectorAll('button')].filter(b => b.offsetParent && b.textContent.replace(/\s+/g, ' ').trim() === text)[nth]?.click(), text, nth);
  await new Promise(r => setTimeout(r, 800));
};
const MODE = process.argv[3] || 'survey';
if (MODE === 'survey') {
  await open(1440, 3000);
  await tab('defense'); await click('Full season');
  for (const [n, label] of [[1, '1 Performance'], [2, '2 Opponent offense'], [3, '3 Scheme & passing'], [4, '4 Situations']]) {
    await click(label);
    await page.screenshot({ path: `${OUT}/survey-defense-${n}.png`, fullPage: true });
  }
  await tab('season'); await click('Defense', 1);
  await page.screenshot({ path: `${OUT}/survey-season-defense.png`, fullPage: true });
  await click('Trends');
  await page.screenshot({ path: `${OUT}/survey-season-trends.png`, fullPage: true });
  await tab('players'); await click('Full season'); await click('Defense 8');
  await page.screenshot({ path: `${OUT}/survey-players-defense.png`, fullPage: true });
}
if (MODE === 'dom') {
  await open(1440, 3000);
  await tab('defense'); await click('Full season');
  console.log(await page.evaluate(() => {
    const titled = re => [...document.querySelectorAll('h2,h3,h4,header,strong')].find(el => re.test(el.textContent.trim()))?.closest('section,article,div[class*="module"]');
    const skel = el => el ? el.outerHTML.replace(/<tr[\s\S]*?<\/tr>/g, (m, i) => m).slice(0, 2600) : 'none';
    return ['Disruption', 'Game-by-game', 'Season vs Last 3', 'Defensive player contributions'].map(n => `=== ${n}\n` + skel(titled(new RegExp('^' + n + '$')))).join('\n');
  }));
  await tab('players'); await click('Full season');
  console.log(await page.evaluate(() => { const m = [...document.querySelectorAll('h2,h3,h4,strong')].find(el => /^Tackles/.test(el.textContent.trim()))?.closest('section,article'); return '=== Tackles\n' + (m?.outerHTML.slice(0, 3200) || 'none'); }));
}
// The proposal. No season has missed tackles charted yet, so the page gets an
// illustrative, deterministic set on defensive snaps (Week 1 left uncharted to
// show "—"), and every number below is computed from that one set.
const seed = async () => page.evaluate(() => {
  const app = window.app, store = app.storage.seasonStore;
  const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const games = store.data.games;
  games.forEach((g, gi) => (g.plays || []).forEach(p => {
    if (p.tags?.unit !== 'defense') return;
    if (gi === 0) { delete p.tags.missedTackles; return; }
    // Longer gains are likelier to include a miss, as on film.
    const r = hash(`${gi}|${p.id}|missed`), y = Math.max(0, Number(p.tags.yardage) || 0);
    const miss = Math.min(.85, .1 + y * .045);
    p.tags.missedTackles = r >= miss ? '0' : r < miss * .55 ? '1' : r < miss * .82 ? '2' : r < miss * .95 ? '3' : '4';
    const n = Number(p.tags.missedTackles);
    const pool = ['5', '59', '42', '7', '81', '99', '82', '2', '25'];
    const names = n && hash(`${p.id}:${g.id}`) > .2 ? [...new Set([pool[Math.floor(hash(`a${g.id}${p.id}`) * pool.length)], n > 1 ? pool[Math.floor(hash(`b${g.id}${p.id}`) * pool.length)] : null].filter(Boolean))] : [];
    p.tags.players = { ...(p.tags.players || {}), ...(names.length ? { missedTackler: names.join(', ') } : {}) };
  }));
  app.storage._loadActiveGame();
});
const numbers = () => page.evaluate(() => {
  const store = window.app.storage.seasonStore, games = store.data.games;
  const count = v => Number(v);
  const yards = p => Number(p.tags?.yardage) || 0;
  const classified = p => /^(run|pass)$/i.test(p.tags?.runPass || '');
  const charted = games.flatMap(g => (g.plays || []).filter(p => p.tags?.unit === 'defense' && p.tags.missedTackles != null).map(p => ({ ...p, __g: g })));
  const sum = list => list.reduce((s, p) => s + count(p.tags.missedTackles), 0);
  const withMiss = charted.filter(p => count(p.tags.missedTackles) > 0);
  const ypp = list => { const c = list.filter(classified); return c.length ? (c.reduce((s, p) => s + yards(p), 0) / c.length).toFixed(1) : '—'; };
  const last3 = games.slice(-3).map(g => g.id), recent = charted.filter(p => last3.includes(p.__g.id));
  const pct = (a, b) => b ? `${(100 * a / b).toFixed(1)}%` : '—';
  const perGame = Object.fromEntries(games.map(g => { const c = charted.filter(p => p.__g === g); return [g.gameInfo?.opponent, c.length ? String(sum(c)) : '—']; }));
  const perPlayer = {};
  for (const p of charted) for (const n of String(p.tags.players?.missedTackler || '').match(/\d+/g) || []) perPlayer[n] = (perPlayer[n] || 0) + 1;
  return { eligible: charted.length, total: sum(charted), plays: withMiss.length, rate: pct(withMiss.length, charted.length),
    yppMiss: ypp(withMiss), yppNone: ypp(charted.filter(p => count(p.tags.missedTackles) === 0)),
    rateLast3: pct(recent.filter(p => count(p.tags.missedTackles) > 0).length, recent.length), perGame, perPlayer };
});
const injectDefense = async n => page.evaluate(n => {
  const mod = name => document.querySelector(`[data-def2-module="${name}"]`);
  const row = cells => `<tr class=" cut-row" tabindex="0" role="button">${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
  // 1. Tackling, after Disruption, in Disruption's own fixed-table markup.
  const tackling = mod('Disruption').cloneNode(false);
  tackling.dataset.def2Module = 'Tackling';
  tackling.style.setProperty('--def2-module-height', `${96 + 5 * 38}px`);
  tackling.innerHTML = `<header><h3>Tackling</h3></header><div class="gi-def2-tablewrap"><table><thead><tr><th>Measure</th><th>Value</th><th>Eligible snaps</th></tr></thead><tbody>`
    + row(['Missed Tackles', n.total, n.eligible])
    + row(['Plays with a Missed Tackle', n.plays, n.eligible])
    + row(['Missed Tackle play rate', n.rate, n.eligible])
    + row(['Yards / play with a Missed Tackle', n.yppMiss, n.plays])
    + row(['Yards / play without', n.yppNone, n.eligible - n.plays]) + '</tbody></table></div>';
  mod('Disruption').after(tackling);
  // 2. Game-by-game: a Missed Tackles column; an uncharted game is "—".
  const gbg = mod('Game-by-game');
  gbg.querySelector('thead tr').insertAdjacentHTML('beforeend', '<th>Missed Tackles</th>');
  for (const tr of gbg.querySelectorAll('tbody tr')) tr.insertAdjacentHTML('beforeend', `<td>${tr.classList.contains('is-held') ? '-' : (n.perGame[tr.cells[0].textContent.trim()] ?? '—')}</td>`);
  // 3. Season vs Last 3: one more row.
  const s3 = mod('Season vs Last 3');
  s3.style.setProperty('--def2-module-height', `${96 + 7 * 38}px`);
  s3.querySelector('tbody').insertAdjacentHTML('beforeend', '<tr class=""><td>Missed Tackle play rate</td><td>' + n.rate + '</td><td>' + n.rateLast3 + '</td></tr>');
  // 4. Player contributions: a Missed column after Ast.
  const pc = mod('Defensive player contributions');
  const astTh = [...pc.querySelectorAll('thead th')].find(th => th.textContent.startsWith('Ast'));
  const th = astTh.cloneNode(true); th.firstChild.textContent = 'Missed Tackles'; th.title = 'Sort by Missed Tackles'; astTh.after(th);
  const idx = [...astTh.parentNode.children].indexOf(astTh);
  for (const tr of pc.querySelectorAll('tbody tr')) {
    const num = (tr.cells[0].textContent.match(/#(\d+)/) || [])[1];
    tr.cells[idx].insertAdjacentHTML('afterend', `<td>${num ? (n.perPlayer[num] || 0) : '-'}</td>`);
  }
  tackling.scrollIntoView({ block: 'center' });
}, n);
const injectPlayers = async n => page.evaluate(n => {
  const mod = [...document.querySelectorAll('.gi-player-module')].find(m => /^Tackles/.test(m.querySelector('header strong')?.textContent || ''));
  const cols = mod.querySelector('colgroup'), ths = [...mod.querySelectorAll('thead th')];
  const ast = ths.findIndex(th => th.textContent.trim() === 'Ast');
  cols.children[ast].after(cols.children[ast].cloneNode());
  const th = ths[ast].cloneNode(true); th.textContent = 'MTkl'; th.title = 'Missed Tackles'; th.className = ''; ths[ast].after(th);
  for (const tr of mod.querySelectorAll('tbody tr')) {
    const num = tr.querySelector('[data-player-open]')?.dataset.playerOpen;
    const v = num ? (n.perPlayer[num] || 0) : '–';
    tr.cells[ast].insertAdjacentHTML('afterend', `<td data-col="missed">${num && v ? `<button type="button" class="gi-player-stat">${v}</button>` : v}</td>`);
  }
}, n);

if (MODE === 'propose') {
  for (const [w, h] of [[1440, 900], [1280, 800]]) {
    await open(w, h); await seed();
    const n = await numbers();
    if (w === 1440) console.log(JSON.stringify(n));
    await tab('defense'); await click('Full season'); await injectDefense(n);
    await new Promise(r => setTimeout(r, 300));
    await page.screenshot({ path: `${OUT}/defense-tackling-${w}x${h}.png` });
    await tab('players'); await click('Full season'); await injectPlayers(n);
    await new Promise(r => setTimeout(r, 300));
    await page.screenshot({ path: `${OUT}/players-tackles-${w}x${h}.png` });
  }
  await open(1440, 3000); await seed();
  const n = await numbers();
  await tab('defense'); await click('Full season'); await injectDefense(n);
  await page.evaluate(() => document.querySelector('.gi-def2-board, main')?.scrollTo?.(0, 0));
  await page.screenshot({ path: `${OUT}/defense-full-1440.png` });
  await tab('season'); await click('Defense', 1); await injectDefense(n);
  await page.screenshot({ path: `${OUT}/season-defense-full-1440.png` });
}
await browser.close();