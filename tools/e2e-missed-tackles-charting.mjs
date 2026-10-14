import { installExportCapture } from './export-capture.mjs';
/* MISSED TACKLES CHARTING -------------------------------------------------------
   Approved comp design-comps/missed-tackles-2026-10-06; contract
   GRIDIRON-IQ-TAG-MODEL.md §3a. Missed Tackles is one more row in Players &
   Grades. On our snaps (defense, kick coverage) it names our players, one miss
   each like Tackler(s), with no count box (coach, 2026-10-07). On the
   opponent's snaps (offense, returns) it is a Count only, 0-9, blank not
   charted. No row on Field Goal, FG Block or kicked tries.

   Run after build:  node tools/e2e-missed-tackles-charting.mjs */
import puppeteer from './test-browser.mjs';
import { APP_URL, gotoApp } from './app-entry.mjs';
import { MissedTackles } from '../js/missed-tackles.js';
import { PlayTagger } from '../js/play-tagger.js';
import { ChartingDetails } from '../js/charting-details.js';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + JSON.stringify(extra) : ''}`); } };

console.log('\n== Model ==');
{
  const play = (unit, special) => ({ tags: { unit }, specialTeams: special });
  const modes = {
    defense: MissedTackles.modeOf(play('defense')), offense: MissedTackles.modeOf(play('offense')),
    kickoff: MissedTackles.modeOf(play('special', { unit: 'kickoff' })), punt: MissedTackles.modeOf(play('special', { unit: 'punt' })),
    kickoffReturn: MissedTackles.modeOf(play('special', { unit: 'kickoffReturn' })), puntReturn: MissedTackles.modeOf(play('special', { unit: 'puntReturn' })),
    fieldGoal: MissedTackles.modeOf(play('special', { unit: 'fieldGoal' })), fieldGoalBlock: MissedTackles.modeOf(play('special', { unit: 'fieldGoalBlock' })),
    kickedTry: MissedTackles.modeOf(play('special', { unit: 'try', attemptType: 'extraPoint' })),
    runPassTry: MissedTackles.modeOf(play('special', { unit: 'try', attemptType: 'twoPoint' })),
    runPassTryDefense: MissedTackles.modeOf(play('special', { unit: 'tryDefense', attemptType: 'twoPoint' })),
  };
  ok(modes.defense === 'ours' && modes.offense === 'theirs' && modes.kickoff === 'ours' && modes.punt === 'ours'
    && modes.kickoffReturn === 'theirs' && modes.puntReturn === 'theirs' && modes.fieldGoal === null
    && modes.fieldGoalBlock === null && modes.kickedTry === null && modes.runPassTry === 'theirs'
    && modes.runPassTryDefense === 'ours', 'each unit charts the approved side of missed tackles', modes);
  const off = missedTackles => ({ tags: { unit: 'offense', missedTackles } });
  ok(MissedTackles.count(off(undefined)) === null && MissedTackles.count(off('')) === null
    && MissedTackles.count(off('0')) === 0 && MissedTackles.count(off('7')) === 7
    && MissedTackles.count(off('3+')) === null, 'the opponent Count: blank is not charted, 0 is a charted zero, counts are exact 0-9');
  const def = (players, missedTackles) => ({ tags: { unit: 'defense', missedTackles, players: { missedTackler: players } } });
  ok(MissedTackles.count(def('59, 82, 15')) === 3 && MissedTackles.count(def('')) === 0 && MissedTackles.count(def('5', '4')) === 1
    && MissedTackles.count({ tags: { unit: 'special' }, specialTeams: { unit: 'fieldGoal' } }) === null,
    'our misses are the players named, 0 when no one is named; a Count stored on our snap is never read', [MissedTackles.count(def('59, 82, 15')), MissedTackles.count(def('5', '4'))]);
  ok(PlayTagger.blankTags().missedTackles === '', 'every new or cleared play starts with Missed Tackles blank');
  ok(!PlayTagger.SCHEME_KEYS.includes('missedTackles') && !PlayTagger.CARRY_SCHEME_KEYS.includes('missedTackles'),
    'Missed Tackles never carries through Copy Previous, templates or Carry Scheme');

  const bad = ChartingDetails.vocabularyProblems({ missedTackles: '3+' });
  ok(bad.length === 1 && /Missed Tackles/.test(bad[0]) && !ChartingDetails.vocabularyProblems({ missedTackles: '0' }).length,
    'CSV validation refuses a count outside 0-9', bad);
}

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
try {
  const page = await browser.newPage();
await installExportCapture(page);
  await page.setViewport({ width: 1440, height: 900 });
  await gotoApp(page, APP_URL);
  await page.evaluate(async () => {
    const app = window.app;
    await app.storage.createSeason({ name: 'Missed Tackles', team: 'MT', year: '2026' });
    const store = app.storage.seasonStore, game = store.activeGame();
    const t = extra => ({ ...extra });
    game.plays = [
      { id: 1, timestamp: { start: 0, end: 4 }, tags: t({ unit: 'defense', down: '1', distance: '10' }) },
      { id: 2, timestamp: { start: 4, end: 8 }, tags: t({ unit: 'offense', down: '1', distance: '10' }) },
      { id: 3, timestamp: { start: 8, end: 12 }, tags: t({ unit: 'special' }), specialTeams: { unit: 'kickoff' } },
      { id: 4, timestamp: { start: 12, end: 16 }, tags: t({ unit: 'special' }), specialTeams: { unit: 'puntReturn' } },
      { id: 5, timestamp: { start: 16, end: 20 }, tags: t({ unit: 'special' }), specialTeams: { unit: 'fieldGoal' } },
    ].map(p => ({ ...p, tags: { players: {}, grades: {}, custom: [], customFields: {}, ...p.tags }, annotations: [], notes: '' }));
    game.nextId = 6;
    app.storage._loadActiveGame();
    app.roster.players = [{ num: '2', name: 'Two', side: 'D' }, { num: '3', name: 'Three', side: 'D' }, { num: '9', name: 'Nine', side: 'O' }];
    await app.workspaceShell.show('breakdown');
  });
  const settle = () => new Promise(r => setTimeout(r, 250));
  const rows = id => page.evaluate(async id => {
    window.app.tagger.selectPlay(id);
    await new Promise(r => setTimeout(r, 250));
    const group = [...document.querySelectorAll('details.gi-tag-group')].find(d => /Players/.test(d.querySelector('summary')?.textContent || ''));
    return [...(group?.querySelectorAll('.gi-tag-players > div') || [])].map(row => ({
      label: row.querySelector('strong')?.textContent.trim(),
      input: !!row.querySelector('input'),
      grade: !!row.querySelector('select[aria-label$="grade"]'),
      count: row.querySelector('select[aria-label="Missed Tackles count"]') ? [...row.querySelector('select[aria-label="Missed Tackles count"]').options].map(o => o.value) : null,
      roster: !!row.querySelector('.gi-player-roster-toggle'),
    }));
  }, id);

  console.log('\n== Film Room ==');
  const grid = await page.evaluate(() => {
    const Grid = window.app.playGrid.constructor, col = Grid.COLUMNS.find(c => c.key === 'missedTackles');
    const fg = { tags: { unit: 'special' }, specialTeams: { unit: 'fieldGoal' } }, ko = { tags: { unit: 'special' }, specialTeams: { unit: 'kickoff' } };
    return { label: col?.label, options: col ? window.app.playGrid._options(col) : null,
      locked: col ? [Grid.cellLocked(fg, col), Grid.cellLocked(ko, col), Grid.cellLocked({ tags: { unit: 'defense' } }, col), Grid.cellLocked({ tags: { unit: 'offense' } }, col)] : null,
      shown: col ? [Grid.lockedText({ tags: { unit: 'defense', players: { missedTackler: '2, 3' } } }, col), Grid.lockedText(fg, col)] : null };
  });
  ok(grid.label === 'MTkl' && JSON.stringify(grid.options) === JSON.stringify(MissedTackles.COUNTS), 'Film Room offers an MTkl column with the 0-9 counts', grid);
  ok(JSON.stringify(grid.locked) === '[true,true,true,false]', 'the MTkl cell is editable only on the opponent\'s snaps', grid.locked);
  ok(JSON.stringify(grid.shown) === '["2",""]', 'on our snaps MTkl shows the players named; with no row it is blank', grid.shown);
  console.log('\n== Deck rows ==');
  const counts = ['', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const at = (list, label) => list.findIndex(r => r.label === label);
  const d = await rows(1);
  const dm = d[at(d, 'Missed Tackles')];
  ok(at(d, 'Missed Tackles') === at(d, 'Tackler(s)') + 1 && dm?.input && dm.roster && !dm.grade && dm.count === null,
    'defense: Missed Tackles follows Tackler(s) with players only: no Count and no grade', d);
  const o = await rows(2);
  const om = o[at(o, 'Missed Tackles')];
  ok(at(o, 'Missed Tackles') === at(o, 'Receiver') + 1 && om && !om.input && !om.roster && !om.grade && JSON.stringify(om.count) === JSON.stringify(counts),
    'offense: Missed Tackles follows Receiver, count only', o);
  const k = await rows(3);
  const km = k[at(k, 'Missed Tackles')];
  const kt = k[at(k, 'Tackler(s)')];
  ok(at(k, 'Tackler(s)') === at(k, 'Opponent Returner') + 1 && kt?.input && kt.roster && kt.grade,
    'kickoff: Tackler(s) follows Opponent Returner with our coverage players and a grade (coach, 2026-10-07)', k);
  ok(at(k, 'Missed Tackles') === at(k, 'Tackler(s)') + 1 && km?.input && km.roster && !km.grade && km.count === null,
    'kickoff: Missed Tackles follows Tackler(s) with our coverage players', k);
  const r = await rows(4);
  const rm = r[at(r, 'Missed Tackles')];
  ok(at(r, 'Missed Tackles') === at(r, 'Returner') + 1 && rm && !rm.input && !rm.roster, 'punt return: Missed Tackles follows Returner, count only', r);
  const f = await rows(5);
  ok(at(f, 'Missed Tackles') === -1, 'field goal: no Missed Tackles row', f);

  console.log('\n== Writes ==');
  const write = await page.evaluate(async () => {
    const app = window.app, tagger = app.tagger;
    tagger.selectPlay(2);
    await new Promise(r => setTimeout(r, 250));
    const select = () => document.querySelector('select[aria-label="Missed Tackles count"]');
    const choose = async v => { const s = select(); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 150)); return tagger.getCurrentPlay().tags.missedTackles; };
    // History merges edits to one play within 800ms; space them so each is its own step.
    const gap = () => new Promise(r => setTimeout(r, 900));
    const two = await choose('2'); await gap();
    const zero = await choose('0'); await gap();
    app.history.undo(); await new Promise(r => setTimeout(r, 200));
    const undoBack = tagger.getCurrentPlay().tags.missedTackles;
    tagger.selectPlay(2); await new Promise(r => setTimeout(r, 250));
    const blank = await choose('');
    tagger.saveDraft();
    tagger.selectPlay(1); await new Promise(r => setTimeout(r, 250));
    const row = [...document.querySelectorAll('.gi-tag-players > div')].find(el => el.querySelector('strong')?.textContent.trim() === 'Missed Tackles');
    row.querySelector('input').focus(); row.querySelector('input').click();
    await new Promise(r => setTimeout(r, 150));
    const pick = async num => { [...document.querySelectorAll('.gi-tag-players > div')].find(el => el.querySelector('strong')?.textContent.trim() === 'Missed Tackles').querySelector(`.gi-player-quick button[title^="#${num}"]`)?.click(); await new Promise(r => setTimeout(r, 150)); return tagger.getCurrentPlay().tags.players.missedTackler || ''; };
    const one = await pick('2'), both = await pick('3'), toggled = await pick('2');
    const offered = [...[...document.querySelectorAll('.gi-tag-players > div')].find(el => el.querySelector('strong')?.textContent.trim() === 'Missed Tackles').querySelectorAll('.gi-player-quick button')].map(b => b.textContent.trim());
    const tackler = tagger.getCurrentPlay().tags.players.tackler || '';
    tagger.saveDraft();
    return { two, zero, blank, undoBack, one, both, toggled, offered, tackler };
  });
  ok(write.two === '2' && write.zero === '0' && write.blank === '', 'the opponent Count writes exact values; clearing it writes blank, not 0', write);
  ok(write.undoBack === '2', 'a Count change is one undoable write', write);
  ok(write.one === '2' && write.both === '2, 3' && write.toggled === '3' && write.tackler === '', 'the roster picker toggles comma-separated players like Tackler(s) and never touches Tackler(s)', write);
  ok(write.offered.join() === '2,3', 'the picker offers our defensive players only', write.offered);

  console.log('\n== Spacing ==');
  const geo = await page.evaluate(() => {
    for (const row of document.querySelectorAll('.gi-tag-players > div')) { const t = row.querySelector('.gi-player-roster-toggle'); if (t?.getAttribute('aria-expanded') === 'true') t.click(); }
    return new Promise(res => setTimeout(() => {
      const grid = document.querySelector('.gi-tag-players'), row = grid.querySelector(':scope > div'), toggle = grid.querySelector('.gi-player-roster-toggle');
      res({ rowGap: getComputedStyle(grid).rowGap, pad: getComputedStyle(row).paddingTop, toggle: getComputedStyle(toggle).minHeight, height: Math.round(row.getBoundingClientRect().height) });
    }, 200));
  });
  ok(geo.rowGap === '8px' && geo.pad === '0px' && geo.toggle === '20px' && geo.height === 51, 'plain player rows use the approved 8px group gap with no nested inset or border and a 20px roster disclosure', geo);

  console.log('\n== CSV ==');
  const csv = await page.evaluate(async () => {
    const app = window.app, tagger = app.tagger;
    const p1 = tagger.plays.find(p => p.id === 1); p1.tags.missedTackles = '5'; p1.tags.players.missedTackler = '2, 3';
    const p2 = tagger.plays.find(p => p.id === 2); p2.tags.missedTackles = '0';
    let text = '';
    const save = window.__exportCapture;
    window.__exportCapture = async blob => { text = await blob.text(); return true; };
    try { app.storage.exportCsv(); await new Promise(r => setTimeout(r, 100)); } finally { window.__exportCapture = save; }
    const parsed = app.storage.importPlaysFromText(text);
    const lines = text.split('\n'), cols = lines[0].split(','), at = cols.findIndex(c => /^"?Missed Tackles"?$/.test(c.trim()));
    return { header: lines[0], line1: lines[1], defenseCount: lines[1]?.split(',')[at], mapped: parsed?.colMap ? Object.values(parsed.colMap) : null };
  });
  ok(/Missed Tackles/.test(csv.header) && /Missed Tacklers/.test(csv.header), 'CSV export writes Missed Tackles and Missed Tacklers columns', csv.header);
  ok(String(csv.defenseCount).replace(/"/g, '') === '2', 'a defensive row exports the players named as its Missed Tackles, not a stored Count', csv.defenseCount);
  ok(csv.mapped && csv.mapped.includes('missedTackles') && csv.mapped.includes('missedTackler'), 'CSV import maps both columns back', csv.mapped);
} finally {
  await browser.close();
}
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
