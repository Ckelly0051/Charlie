/* MISSED TACKLES IN REPORTS (DEFENSE) --------------------------------------------
   Approved comp design-comps/missed-tackles-reports-2026-10-07 (an exception to
   roadmap step 4, defensive side only), revised by
   design-comps/missed-tackles-reports-r2-2026-10-07: a Tackling module after Disruption, a
   Missed Tackles column in Game-by-game, a Season vs Last 3 row and a Missed
   Tackles column in Defensive player contributions (also Season > Defense), and
   MTkl in Players > Tackles. Exact totals; a blank is not charted and never 0;
   players are counted like tackles, one per play named. Study gets a Missed
   Tackles dimension and a Missed Tackler role.

   Run after build:  node tools/e2e-missed-tackles-reports.mjs */
import puppeteer from './test-browser.mjs';
import { APP_URL, gotoApp } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + JSON.stringify(extra) : ''}`); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const D = (extra) => ({ unit: 'defense', down: '1', distance: '10', quarter: 'Q1', ...extra });
const GAMES = [
  // Week 1: defense charted with no Missed Tackles count at all.
  [D({ runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '5', players: { tackler: '22' } })],
  // Week 2.
  [D({ runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '12', missedTackles: '2', players: { tackler: '22', missedTackler: '5, 44' } }),
   D({ runPass: 'Run', playType: 'Run Outside', result: 'Gain', yardage: '2', missedTackles: '0', players: { tackler: '5' } }),
   D({ runPass: 'Pass', playType: 'Short Pass', result: 'Gain', yardage: '8', missedTackles: '1', players: { tackler: '44', missedTackler: '5' } }),
   // An offensive snap's count is the opponent's misses, never our defense's.
   { unit: 'offense', down: '1', distance: '10', quarter: 'Q2', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '9', missedTackles: '3' }],
  // Week 3.
  [D({ runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '20', missedTackles: '4', players: { tackler: '22', missedTackler: '51' } }),
   D({ runPass: 'Run', playType: 'Run Outside', result: 'Loss', yardage: '-1', missedTackles: '0', players: { tackler: '22' } }),
   // Kick coverage misses wait for the reporting rebuild.
   { unit: 'special', quarter: 'Q2', missedTackles: '1', players: { missedTackler: '5' }, __st: { unit: 'kickoff' } }],
];

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 2400 });
  await gotoApp(page, APP_URL);
  await page.evaluate(async list => {
    const app = window.app;
    await app.storage.createSeason({ name: 'Missed Tackles Reports', team: 'MT', year: '2026' });
    const store = app.storage.seasonStore;
    const build = rows => rows.map(({ __st, players, ...row }, i) => ({
      id: i + 1, timestamp: { start: i * 10, end: i * 10 + 6 }, notes: '', annotations: [],
      tags: { custom: [], customFields: {}, grades: {}, players: { ...(players || {}) }, ...row }, ...(__st ? { specialTeams: __st } : {}),
    }));
    store.data.games = list.map((plays, index) => ({
      id: `g-${index}`, name: `Week ${index + 1}`, nextId: plays.length + 1, plays: build(plays),
      gameInfo: { opponent: `Opp ${index + 1}`, date: `2026-09-0${index + 1}`, week: String(index + 1), projectName: `Opp ${index + 1}`, perspective: 'self', scoreUs: 21, scoreThem: 7 },
      annotations: [], clipNames: [], isMultiClip: false, status: 'active', currentPlayId: 1,
    }));
    store.data.activeGameId = `g-${list.length - 1}`;
    app.roster.loadFrom([['5', 'Five'], ['22', 'Twentytwo'], ['44', 'Fortyfour'], ['51', 'Fiftyone']].map(([num, name]) => ({ num, name, pos: '', side: 'D' })), { persist: false });
    await app.storage._loadActiveGame();
  }, GAMES);
  await sleep(400);
  await page.evaluate(() => window.app.workspaceShell.show('reports'));
  await sleep(500);
  const click = (text, nth = 0) => page.evaluate((text, nth) => [...document.querySelectorAll('button')].filter(b => b.offsetParent && b.textContent.replace(/\s+/g, ' ').trim() === text)[nth]?.click(), text, nth);
  const module = name => page.evaluate(name => {
    const m = document.querySelector(`[data-def2-module="${name}"]`);
    if (!m) return null;
    return { height: m.style.getPropertyValue('--def2-module-height'), schema: m.dataset.def2Schema,
      heads: [...m.querySelectorAll('thead th')].map(th => th.textContent.replace(/[↕↑↓]/g, '').trim()),
      rows: [...m.querySelectorAll('tbody tr')].map(tr => [...tr.cells].map(td => td.textContent.trim())),
      prev: m.previousElementSibling?.dataset.def2Module };
  }, name);

  console.log('\n== Defense board, Full season ==');
  await page.evaluate(() => window.app.reportsScreen.selectTab('defense'));
  await sleep(500); await click('Full season'); await sleep(500);
  const t = await module('Tackling');
  ok(t && t.prev === 'Disruption' && t.schema === 'fixed' && t.height === `${96 + 6 * 38}px` && t.heads.join() === 'Measure,Value,Eligible snaps'
    && t.rows.map(r => r[0]).join('|') === 'Total Tackles|Missed Tackles|Missed Tackle rate|Plays with a Missed Tackle|Yards / play with a Missed Tackle|Yards / play without',
    'Tackling follows Disruption as a fixed six-row module in the approved order', t);
  const val = name => t?.rows.find(r => r[0] === name);
  ok(val('Total Tackles')?.[1] === '6' && val('Total Tackles')?.[2] === '6', 'Total Tackles counts each play with a tackler once, over every defensive snap', t?.rows);
  ok(val('Missed Tackle rate')?.[1] === '58.3%' && val('Missed Tackle rate')?.[2] === '5',
    'Missed Tackle rate is misses / (tackles + misses) over the snaps with a count charted: 7 / (5 + 7)', t?.rows);
  ok(val('Missed Tackles')?.[1] === '7' && val('Missed Tackles')?.[2] === '5', 'Missed Tackles is the exact sum (2+0+1+4+0) over the 5 snaps that charted a count', t?.rows);
  ok(val('Plays with a Missed Tackle')?.[1] === '3' && !val('Missed Tackle play rate'), 'plays with a miss count each play once; the play rate row is gone', t?.rows);
  ok(val('Yards / play with a Missed Tackle')?.[1] === '13.3' && val('Yards / play with a Missed Tackle')?.[2] === '3'
    && val('Yards / play without')?.[1] === '0.5' && val('Yards / play without')?.[2] === '2', 'yards per play with and without a miss', t?.rows);
  const g = await module('Game-by-game');
  const col = g?.heads.indexOf('Missed Tackles');
  ok(col === g?.heads.length - 1 && g.rows[0][col] === '—' && g.rows[1][col] === '3' && g.rows[2][col] === '4',
    'Game-by-game: a game with no count charted is —, never 0; offense and kick coverage counts are not the defense\'s', g);
  const s3 = await module('Season vs Last 3');
  const rateRow = s3?.rows.find(r => r[0] === 'Missed Tackle rate');
  ok(s3 && s3.height === `${96 + 7 * 38}px` && rateRow && rateRow[1] === '58.3%' && rateRow[2] === '58.3%', 'Season vs Last 3 shows the Missed Tackle rate', s3);
  const strip = await page.evaluate(() => {
    const k = document.querySelector('.gi-def2-kpis');
    return { tiles: [...k.children].map(el => [el.querySelector('span')?.textContent.trim(), el.querySelector('strong')?.textContent.trim()]),
      align: getComputedStyle(k.firstElementChild).textAlign, cols: getComputedStyle(k).gridTemplateColumns.split(' ').length,
      tall: [...k.querySelectorAll('span')].some(span => span.getBoundingClientRect().height > 38) };
  });
  const at = strip.tiles.findIndex(([label]) => label === 'Missed Tackles');
  // Two rows (six, then five) below 1640px; one row of eleven from 1640px.
  await page.setViewport({ width: 1920, height: 2400 }); await sleep(300);
  const wide = await page.evaluate(() => getComputedStyle(document.querySelector('.gi-def2-kpis')).gridTemplateColumns.split(' ').length);
  await page.setViewport({ width: 1440, height: 2400 }); await sleep(300);
  ok(strip.cols === 6 && wide === 11, 'the strip is two rows at 1440 and one row of eleven at 1920', { at1440: strip.cols, at1920: wide });
  ok(strip.tiles.length === 11 && strip.tiles[at - 1]?.[0] === 'Explosive Plays Allowed' && strip.tiles[at]?.[1] === '7',
    'the strip has eleven tiles: Missed Tackles (the exact total) follows Explosive Plays Allowed', strip.tiles);
  ok(strip.align === 'center' && !strip.tall, 'the strip is centered and every label holds two lines', strip);
  const pc = await module('Defensive player contributions');
  const mc = pc?.heads.indexOf('Missed Tackles');
  const byPlayer = Object.fromEntries((pc?.rows || []).map(r => [(r[0].match(/#(\d+)/) || [])[1], r[mc]]));
  ok(mc === pc?.heads.indexOf('Ast') + 1 && byPlayer['5'] === '2' && byPlayer['44'] === '1' && byPlayer['51'] === '1' && byPlayer['22'] === '0',
    'Defensive player contributions: Missed Tackles after Ast, one per play named, kick coverage excluded, a miss-only player listed', byPlayer);
  const refs = await page.evaluate(() => {
    const screen = window.app.reportsScreen, plays = screen._defenseScopedPlays;
    const board = window.app.stats.defenseBoard(plays, { scope: 'season', seasonPlays: plays });
    const row = name => board.tackling.find(r => r.name === name)?.refs;
    return { total: row('Missed Tackles'), without: row('Yards / play without'), five: board.players.find(p => String(p.num) === '5')?.refs };
  });
  ok(JSON.stringify(refs.total) === JSON.stringify(['g-1::1', 'g-1::3', 'g-2::1']) && JSON.stringify(refs.without) === JSON.stringify(['g-1::2', 'g-2::2']),
    'every Tackling number opens exactly the plays behind it', refs);

  console.log('\n== Current game ==');
  await click('Current game'); await sleep(500);
  const cg = await module('Tackling');
  ok(cg?.rows.find(r => r[0] === 'Missed Tackles')?.[1] === '4' && cg?.rows.find(r => r[0] === 'Missed Tackles')?.[2] === '2'
    && cg?.rows.find(r => r[0] === 'Total Tackles')?.[1] === '2' && cg?.rows.find(r => r[0] === 'Missed Tackle rate')?.[1] === '66.7%', 'Current game scope shows the one game', cg?.rows);

  console.log('\n== Season > Defense ==');
  await page.evaluate(() => window.app.reportsScreen.selectTab('season'));
  await sleep(500); await click('Defense', 1); await sleep(600);
  const st = await module('Tackling');
  ok(st?.rows.find(r => r[0] === 'Missed Tackles')?.[1] === '7', 'Season > Defense shows the same Tackling module', st?.rows);

  console.log('\n== Players > Tackles ==');
  await page.evaluate(() => window.app.reportsScreen.selectTab('players'));
  await sleep(500); await click('Full season'); await sleep(600);
  const pl = await page.evaluate(() => {
    const m = [...document.querySelectorAll('.gi-player-module')].find(el => /^Tackles/.test(el.querySelector('header strong')?.textContent || ''));
    const heads = [...m.querySelectorAll('thead th')].map(th => th.textContent.trim());
    const at = heads.indexOf('MTkl');
    const rows = Object.fromEntries([...m.querySelectorAll('tbody tr')].map(tr => [tr.querySelector('[data-player-open]')?.dataset.playerOpen, tr.cells[at]?.textContent.trim()]));
    const button = m.querySelector('[data-player-stat="tackles:mtkl:5"]');
    const cols = m.querySelectorAll('colgroup col').length;
    const overflow = [...m.querySelectorAll('th,td')].some(el => el.scrollWidth > el.clientWidth + 1);
    return { heads, at, rows, button: !!button, cols, overflow };
  });
  ok(pl.at === pl.heads.indexOf('Ast') + 1 && pl.rows['5'] === '2' && pl.rows['44'] === '1' && pl.rows['51'] === '1' && pl.rows['22'] === '0',
    'MTkl follows Ast with one per play named', pl);
  ok(pl.button && pl.cols === pl.heads.length && !pl.overflow, 'MTkl opens its film, has its own column width and nothing clips', pl);
  const credits = await page.evaluate(() => {
    const plays = window.app.storage.seasonStore.data.games.flatMap(g => g.plays.map(p => ({ ...p, __gid: g.id })));
    const five = window.app.stats._playerCredits(plays).get('5')?.roles.get('tackles')?.stats.get('mtkl') || [];
    return five.map(e => `${e.play.__gid}::${e.play.id}`);
  });
  ok(JSON.stringify(credits) === JSON.stringify(['g-1::1', 'g-1::3']), 'a player\'s MTkl film is the defensive plays they are named on', credits);

  console.log('\n== Study ==');
  const study = await page.evaluate(() => {
    const reg = window.app.analyticsRegistry, games = window.app.storage.seasonStore.data.games;
    const plays = games.flatMap(g => g.plays.map(p => ({ ...p, __gid: g.id })));
    const counts = plays.map(p => reg.values('missedTackles', p).join('|'));
    const missed = plays.map(p => reg.values('playerMissedTackler', p).join('|'));
    return { counts, missed, role: window.app.studyScreen.constructor.PLAYER_ROLES.missedTackler };
  });
  ok(study.counts.join(',') === ',2,0,1,3,4,0,1', 'Study groups plays by their exact count; a blank yields no value', study.counts);
  ok(study.missed.join(',') === ',5|44,,5,,51,,5' && study.role?.dimension === 'playerMissedTackler', 'Study credits our named players on defense and kick coverage', study);
} finally {
  await browser.close();
}
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
