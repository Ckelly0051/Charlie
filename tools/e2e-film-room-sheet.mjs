/**
 * FILM ROOM: THE PLAY SHEET AND THE SHOWN-PLAYS SUMMARY (coach direction,
 * 2026-09-24). The play card lists every chartable field for the selected play,
 * grouped, with `Not charted` where the unit charts a field nobody filled. The
 * controls card measures the plays on screen through the SAME owners the
 * Reports boards use -- compute() for offense, the Defense board's dashboard and
 * stop rate for defense -- and states only counts for a mix of units.
 * Section 4 binds that to the canonical 2025 JV season (read-only, hash-checked):
 * a whole game filtered to one unit reads exactly what its board reads.
 * Run:  node tools/e2e-film-room-sheet.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import { CANONICAL_SEASON } from './canonical-season.mjs';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log('  PASS  ' + label))
  : (fail++, console.log('  FAIL  ' + label + (detail ? ' -- ' + detail : '')));
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 40)))));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !!window.app?.teamHubScreen, { timeout: 15000 });

await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: 'Sheet', team: 'Mavs', year: '2026' });
  const g = app.storage.seasonStore.activeGame();
  const mk = (id, unit, tags, extra = {}) => ({ id, timestamp: { start: id * 5, end: id * 5 + 4 }, notes: '', annotations: [],
    tags: Object.assign({ unit, custom: [], players: {}, grades: {} }, tags), ...extra });
  g.plays = [
    mk(1, 'offense', { quarter: 'Q1', down: '1', distance: '10', hash: 'Left', fieldSide: 'own', yardLine: '25', formationFamily: 'Spread', personnel: '11',
      qbAlignment: 'Shotgun', runPass: 'Pass', playType: 'Short Pass', playDir: 'Right', result: 'Gain', yardage: '7', players: { passer: '7', receiver: '88' },
      grades: { passer: '1' }, customFields: { cfPressure: 'Edge' }, custom: ['Motion tell'] },
      { notes: 'Slot ran the wrong depth.' }),
    mk(2, 'offense', { down: '2', distance: '3', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '14' }),
    mk(3, 'offense', { down: '3', distance: '8', runPass: 'Pass', playType: 'Deep Pass', result: 'Interception', yardage: '' }),
    mk(4, 'defense', { down: '1', distance: '10', defFront: '4-3', coverage: 'Cover 3', runPass: 'Run', playType: 'Run Outside', result: 'Gain', yardage: '3', players: { tackler: '55' } }),
    mk(5, 'defense', { down: '3', distance: '5', defFront: '3-4', runPass: 'Pass', playType: 'Short Pass', result: 'Touchdown', yardage: '20' }),
    // A structured punt return touchdown, saved by the Special Teams editor with
    // no Touchdown result tag (review, 97b2f37), and a legacy one with no side.
    mk(6, 'special', { stType: 'Punt' }, { specialTeams: { unit: 'puntReturn',
      kick: { distance: 40, hangTime: 4.1, landing: { fieldSide: 'own', yardLine: '30' } },
      return: { attempted: true, yards: 70, end: { fieldSide: 'opp', yardLine: '0' } },
      outcome: { status: 'returned', score: 'touchdown' }, players: { returner: '88' } } }),
    mk(7, 'special', { stType: 'Kickoff', result: 'Touchdown' }),
  ];
  g.nextId = 8;
  app.customFields.defs = [{ id: 'cfPressure', name: 'Pressure' }];
  app.roster.loadFrom([{ num: '7', name: 'Quinn Parker' }, { num: '88', name: 'Dax Reed' }], { persist: false });
  app.tagger.plays = g.plays; app.tagger.nextId = 8; app.tagger._emit('plays-loaded');
  await app.storage.commitActive();
  await app.workspaceShell.show('breakdown');
  document.querySelector('[data-bd-view="film-room"]').click();
});
await settle(page);

const sheet = () => page.evaluate(() => {
  const card = document.querySelector('[data-play-sheet]');
  const groups = [...card.querySelectorAll('[data-sheet-group]')].map(g => ({
    key: g.dataset.sheetGroup, title: g.querySelector('h3')?.textContent.trim(),
    rows: Object.fromEntries([...g.querySelectorAll('dl>div')].map(d => [d.querySelector('dt')?.textContent.trim() || '', d.querySelector('dd')?.textContent.trim()])),
  }));
  return { groups, details: card.querySelectorAll('details').length };
});

console.log('\n== 1. The play sheet lists every chartable field ==');
await page.evaluate(() => window.app.tagger.selectPlay(1)); await settle(page);
let s = await sheet();
const g = key => s.groups.find(x => x.key === key);
ok(s.groups.map(x => x.key).join() === 'situation,offense,defense,play,players,grades,custom,notes',
  'an offensive play: Situation, Our offensive look, Defense faced, Play & result, Players, Grades, Custom, Notes, in that order', JSON.stringify(s.groups.map(x => x.key)));
// Review (97b2f37): grades and custom fields and tags are chartable, so the sheet shows them.
ok(g('grades').rows.Passer === '+1' && g('custom').rows.Pressure === 'Edge' && g('custom').rows.Tags === 'Motion tell',
  'grades, custom fields and custom tags are on the sheet', JSON.stringify({ grades: g('grades'), custom: g('custom') }));
ok(g('situation').rows.Quarter === 'Q1' && g('situation').rows['Down & distance'] === '1st & 10' && g('situation').rows['Field position'] === 'Own 25' && g('situation').rows.Hash === 'Left',
  'situation values are the charted ones', JSON.stringify(g('situation').rows));
ok(g('offense').title === 'Our offensive look' && g('offense').rows['Formation'] === 'Spread' && g('offense').rows.Personnel === '11' && g('offense').rows['Play call'] === 'Not charted',
  'the unit\'s look is filled where charted and says Not charted where not', JSON.stringify(g('offense')));
ok(g('defense').title === 'Defense faced' && Object.values(g('defense').rows).every(v => v === 'Not charted'), 'the faced side is listed, uncharted', JSON.stringify(g('defense')));
ok(g('play').rows['Run / pass'] === 'Pass' && g('play').rows['Play type'] === 'Short Pass' && /Gain/.test(g('play').rows.Result),
  'play and result come from the charted tags and the chyron wording', JSON.stringify(g('play').rows));
ok(g('players').rows.Passer === '#7 Quinn Parker' && g('players').rows.Receiver === '#88 Dax Reed', 'credited players carry their roster names', JSON.stringify(g('players').rows));
ok(g('notes').rows[''] === 'Slot ran the wrong depth.' && s.details === 0, 'notes show in full, with no disclosure', JSON.stringify(g('notes')));
await page.evaluate(() => window.app.tagger.selectPlay(4)); await settle(page);
s = await sheet();
ok(s.groups[1]?.key === 'defense' && s.groups[1].title === 'Our defensive call' && s.groups[2]?.title === 'Offense faced' && g('players').rows.Tackler === '#55',
  'a defensive play leads with Our defensive call; an unrostered player shows the number', JSON.stringify(s.groups.map(x => [x.key, x.title])));
ok(!s.groups.some(x => x.key === 'notes') && !s.groups.some(x => x.key === 'grades') && g('custom').rows.Pressure === 'Not charted' && g('custom').rows.Tags === 'Not charted',
  'no notes or grades group when none were charted; an empty custom field says Not charted', JSON.stringify(s.groups.map(x => x.key)));
await page.evaluate(() => window.app.tagger.selectPlay(6)); await settle(page);
s = await sheet();
ok(s.groups.map(x => x.key).join() === 'situation,special,players,custom',
  'a special-teams play shows Special teams, not the offensive and defensive looks', JSON.stringify(s.groups.map(x => x.key)));
const stRows = g('special').rows;
ok(stRows['Kick distance'] === '40 yds' && stRows['Hang time'] === '4.1 s' && stRows['Landing spot'] === 'Own 30'
  && stRows['Return yards'] === '70 yds' && stRows['Return ended'] === 'Opp 0' && stRows['Return attempted'] === 'Yes'
  && stRows['Scored by'] === 'Our team' && stRows.Onside === 'No' && g('players').rows.Returner === '#88 Dax Reed',
  'the Special Teams event\'s kick, return, scoring side and credited players are all on the sheet', JSON.stringify({ stRows, players: g('players').rows }));

console.log('\n== 2. Shown plays: measured by the Reports owners ==');
const summary = () => page.evaluate(() => {
  const el = document.querySelector('[data-film-summary]');
  return { side: el?.dataset.filmSummary, sub: el?.querySelector('header p')?.textContent.trim(),
    rows: Object.fromEntries([...el.querySelectorAll('dl>div')].map(d => [d.querySelector('dt').textContent.trim(), d.querySelector('dd').textContent.trim()])) };
});
let m = await summary();
ok(m.side === 'mixed' && m.rows.Offense === '3' && m.rows.Defense === '2' && m.rows['Special teams'] === '2' && Object.keys(m.rows).length === 3,
  'a mix of units states its counts and measures nothing', JSON.stringify(m));
await page.evaluate(() => window.app.nativeFilmRoom.toggleFilter('unit', 'offense')); await settle(page);
m = await summary();
const offTruth = await page.evaluate(() => {
  const app = window.app, S = app.stats.constructor, own = app.tagger.plays.filter(p => (p.tags.unit || 'offense') === 'offense');
  const st = app.stats.compute(own);
  return { ypp: Number(S.yardsPerPlay(st)).toFixed(1), sr: Number(st.efficiency.successRate).toFixed(1) + '%', ex: String(st.efficiency.explosivePlays) };
});
ok(m.side === 'offense' && m.rows['Yards / play'] === offTruth.ypp && m.rows['Success rate'] === offTruth.sr && m.rows['Explosive plays'] === offTruth.ex,
  'offense reads compute()\'s yards per play, Success Rate and explosives', JSON.stringify({ m, offTruth }));
ok(m.rows['Run / pass'] === '1 / 2 · 33% run' && m.rows.Turnovers === '1' && m.rows.Touchdowns === '0' && m.sub === '3 plays · 3 classified',
  'offense counts: run/pass split, turnovers, touchdowns', JSON.stringify(m));
await page.evaluate(() => window.app.nativeFilmRoom.toggleFilter('unit', 'defense')); await settle(page);
m = await summary();
const defTruth = await page.evaluate(() => {
  const app = window.app, own = app.tagger.plays.filter(p => p.tags.unit === 'defense');
  return { ypp: Number(app.stats.defenseDashboard(own).summary.ypp).toFixed(1), stop: Number(app.stats.defensiveCohortMetrics(own).stopRate).toFixed(1) + '%' };
});
ok(m.side === 'defense' && m.rows['Yards / play allowed'] === defTruth.ypp && m.rows['Stop rate'] === defTruth.stop && m.rows['Touchdowns allowed'] === '1' && m.rows.Takeaways === '0',
  'defense reads the Defense board\'s yards per play allowed and the stop rate', JSON.stringify({ m, defTruth }));
await page.evaluate(() => { window.app.nativeFilmRoom.clearFilters(); window.app.nativeFilmRoom.toggleFilter('unit', 'special'); }); await settle(page);
m = await summary();
ok(m.side === 'special' && m.rows['Touchdowns for'] === '1' && m.rows['Touchdowns against'] === '0' && m.rows['Touchdowns, side not charted'] === '1',
  'Special Teams touchdowns read the structured event (no result tag needed) and a legacy one counts with no side', JSON.stringify(m));
await page.evaluate(() => { window.app.nativeFilmRoom.clearFilters(); window.app.nativeFilmRoom.toggleFilter('flags', 'untagged'); }); await settle(page);
m = await summary();
ok(m.side !== undefined && m.sub, 'a filter that empties or narrows the set still renders a summary', JSON.stringify(m));
await page.evaluate(() => { window.app.nativeFilmRoom.clearFilters(); window.app.nativeFilmRoom.toggleFilter('downs', '3'); window.app.nativeFilmRoom.toggleFilter('unit', 'offense'); }); await settle(page);
m = await summary();
ok(m.rows['Yards / play'] !== undefined && m.sub === '1 play · 1 classified' && m.rows['Run / pass'] === '0 / 1 · 0% run',
  'a filtered subset is measured, not the whole unit', JSON.stringify(m));
await page.evaluate(() => window.app.nativeFilmRoom.clearFilters()); await settle(page);

const header = () => page.evaluate(() => {
  const th = [...document.querySelectorAll('[data-native-film-room] thead th')].find(h => h.querySelector('span')?.textContent.trim() === 'Yds');
  return th ? (th.querySelector('small')?.textContent.trim() ?? '') : null;
});
await page.evaluate(() => { window.app.nativeFilmRoom.clearFilters(); window.app.nativeFilmRoom.toggleFilter('unit', 'defense'); }); await settle(page);
// Two defensive plays are below the five-play floor for a header tendency.
const defHeader = await header();
await page.evaluate(() => window.app.nativeFilmRoom.clearFilters()); await settle(page);
const mixedHeader = await header();
ok(defHeader === '' && mixedHeader === '', 'the Yds header states no average for a mix of units or a set under five plays', JSON.stringify({ defHeader, mixedHeader }));

console.log('\n== 3. Both cards fit their column ==');
const fit = await page.evaluate(() => {
  const over = el => el ? el.scrollWidth - el.clientWidth : null;
  return { sheet: over(document.querySelector('[data-play-sheet]')), controls: over(document.querySelector('[data-film-controls]')),
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});
ok(fit.sheet <= 0 && fit.controls <= 0 && fit.page <= 0, 'no sideways overflow in either card or the page', JSON.stringify(fit));
// The summary fills the table-below card; the table-beside bar has no spare
// height, so it is not shown there and cannot push the table down.
await page.evaluate(() => window.app.breakdownWorkspace.setFilmLayout({ dock: 'side' }, { persist: false })); await settle(page);
const side = await page.evaluate(() => ({ shown: !!document.querySelector('[data-film-summary]')?.getClientRects().length,
  bar: Math.round(document.querySelector('[data-film-controls]').getBoundingClientRect().height) }));
await page.evaluate(() => window.app.breakdownWorkspace.resetFilmLayout()); await settle(page);
const below = await page.evaluate(() => !!document.querySelector('[data-film-summary]')?.getClientRects().length);
ok(below && !side.shown && side.bar <= 160, 'the summary shows in the table-below card and not in the table-beside bar', JSON.stringify({ below, side }));

console.log('\n== 4. Canonical season: a whole game reads what its board reads ==');
const SOURCE = CANONICAL_SEASON;
if (!existsSync(SOURCE)) {
  if (process.env.GIQ_REALDATA_OPTIONAL === '1') console.log('  SKIP  canonical season absent (GIQ_REALDATA_OPTIONAL=1)');
  else ok(false, 'canonical season present', SOURCE);
} else {
  const raw = readFileSync(SOURCE); const before = createHash('sha256').update(raw).digest('hex');
  const rows = await page.evaluate(async data => {
    const app = window.app, S = app.stats.constructor;
    return data.games.map(game => {
      const plays = game.plays.map(p => ({ ...p, __gid: game.id }));
      const off = app.stats.playSetSummary(plays, { side: 'offense' }), def = app.stats.playSetSummary(plays, { side: 'defense' });
      const st = app.stats.compute(plays.filter(p => (p.tags?.unit || 'offense') === 'offense'));
      const defense = plays.filter(p => p.tags?.unit === 'defense');
      const board = app.stats.defenseBoard(defense, { labels: {}, seasonPlays: plays, roster: [], scope: 'game' }).dashboard.summary;
      return { game: game.gameInfo?.opponent,
        off: [off.ypp, off.rate, off.measured], offBoard: [Number(S.yardsPerPlay(st)), Number(st.efficiency.successRate), st.allPlays],
        def: [def.ypp, def.rate, def.measured], defBoard: [board.ypp, app.stats.defensiveCohortMetrics(defense).stopRate, board.measured] };
    });
  }, JSON.parse(raw.toString('utf8')));
  const same = rows.every(r => JSON.stringify(r.off) === JSON.stringify(r.offBoard) && JSON.stringify(r.def) === JSON.stringify(r.defBoard));
  ok(rows.length === 6 && same, 'on all six games the summary equals the Offense report and the Defense board', JSON.stringify(rows.filter(r => JSON.stringify(r.off) !== JSON.stringify(r.offBoard) || JSON.stringify(r.def) !== JSON.stringify(r.defBoard))));
  const lakes = rows.find(r => /OL Lakes/.test(r.game));
  ok(lakes && lakes.def[0] === 3.4 && lakes.def[2] === 37, 'OL Lakes defense: 3.4 yards per play allowed over 37 run/pass snaps, as its board states', JSON.stringify(lakes));
  const lakesGame = JSON.parse(raw.toString('utf8')).games.find(x => /OL Lakes/i.test(x.gameInfo?.opponent || ''));
  const onScreen = await page.evaluate(async (data, gid) => {
    const app = window.app, store = app.storage.seasonStore;
    store.data = store._normalize(JSON.parse(JSON.stringify(data)));
    store.currentSeasonId = data.id; store.data.id = data.id; store.data.activeGameId = gid;
    await app.storage._loadActiveGame();
    app.nativeFilmRoom.clearFilters(); app.nativeFilmRoom.toggleFilter('unit', 'defense');
    await new Promise(r => setTimeout(r, 200));
    const th = [...document.querySelectorAll('[data-native-film-room] thead th')].find(h => h.querySelector('span')?.textContent.trim() === 'Yds');
    const dd = [...document.querySelectorAll('[data-film-summary] dl>div')].find(d => d.querySelector('dt').textContent.trim() === 'Yards / play allowed');
    const out = { header: th?.querySelector('small')?.textContent.trim() ?? null, summary: dd?.querySelector('dd').textContent.trim() ?? null };
    app.nativeFilmRoom.clearFilters();
    return out;
  }, JSON.parse(raw.toString('utf8')), lakesGame.id);
  ok(onScreen.header === '3.4 / play' && onScreen.summary === '3.4', 'OL Lakes defense: the Yds header and the summary both read the board\'s 3.4', JSON.stringify(onScreen));
  ok(createHash('sha256').update(readFileSync(SOURCE)).digest('hex') === before, 'the canonical season file is unchanged');
}

ok(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
