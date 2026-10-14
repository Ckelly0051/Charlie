/* CHARTING SAVE ------------------------------------------------------------------
   GRIDIRON-IQ-SAVE-CONTRACT.md. Chart edits a draft of the open play; the
   stored play, the reports and the disk change only on Save, which keeps
   exactly what the play can show (PlayShape). A parent change (unit, Special
   Teams unit, try attempt) is a Save that asks first only when it would remove
   values the coach charted; values the app filled in never ask. Leaving a play
   with unsaved changes (another play, clip navigation, a typed note) asks
   Stay, Discard or Save. Film Room edits are saves. A tackle counts where the
   play shows Tackler(s): defense, kick coverage, or an offensive turnover,
   which also names our missed tacklers; any change of possession holds the
   opponent's tacklers, credited to no one of ours.

   Run after build:  node tools/e2e-charting-save.mjs */
import puppeteer from './test-browser.mjs';
import { APP_URL, gotoApp } from './app-entry.mjs';
import { PlayShape } from '../js/play-shape.js';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + JSON.stringify(extra) : ''}`); } };

console.log('\n== PlayShape ==');
{
  const play = (unit, tags = {}, specialTeams) => ({ tags: { unit, ...tags }, specialTeams });
  ok(JSON.stringify(PlayShape.roles(play('defense'))) === JSON.stringify(['tackler', 'takeaway', 'missedTackler'])
    && JSON.stringify(PlayShape.roles(play('offense'))) === JSON.stringify(['ballCarrier', 'passer', 'receiver']),
    'defense charts Tackler(s), Takeaway and our misses; offense charts Ball Carrier, Passer and Receiver');
  ok(JSON.stringify(PlayShape.roles(play('offense', { result: 'Interception' }))) === JSON.stringify(['ballCarrier', 'passer', 'receiver', 'tackler', 'missedTackler', 'opponentTackler'])
    && PlayShape.roles(play('offense', { result: 'Fumble', fumbleRecovery: 'opponent' })).includes('tackler')
    && !PlayShape.roles(play('offense', { result: 'Fumble', fumbleRecovery: 'subject' })).includes('tackler')
    && !PlayShape.roles(play('offense', { result: 'Gain' })).includes('tackler'),
    'an offensive turnover opens our Tackler(s) and missed tacklers and the opponent\'s tacklers; a recovered fumble does not');
  ok(PlayShape.roles(play('defense', { result: 'Interception' })).includes('opponentTackler')
    && PlayShape.roles(play('defense', { result: 'Fumble', fumbleRecovery: 'subject' })).includes('opponentTackler')
    && !PlayShape.roles(play('defense', { result: 'Fumble', fumbleRecovery: 'opponent' })).includes('opponentTackler')
    && !PlayShape.roles(play('defense', { result: 'Gain' })).includes('opponentTackler'),
    'a defensive takeaway opens the opponent\'s tacklers beside ours; a fumble the opponent kept does not');
  const hidden = PlayShape.hidden(play('offense', { result: 'Gain', blitz: 'Fire', players: { tackler: '5', ballCarrier: '22' } }));
  ok(hidden.length === 1 && hidden[0].field === 'players.tackler',
    'an offensive play holding a Tackler with no turnover holds one hidden value; Defense Faced looks are shown', hidden);
  const kickoff = play('special', { result: 'Gain', yardage: '5', formationFamily: 'Trips' }, { unit: 'kickoff' });
  ok(PlayShape.hidden(kickoff).map(item => item.field).sort().join() === 'formationFamily,result,yardage',
    'a kickoff shows no scrimmage look or Play & Result', PlayShape.hidden(kickoff));
  const fake = play('special', { result: 'Gain', yardage: '12', players: { ballCarrier: '7' } }, { unit: 'punt', isFake: true });
  ok(!PlayShape.hidden(fake).length && PlayShape.isKickFake(fake), 'a Fake punt charts its run in Play & Result', PlayShape.hidden(fake));
  const settled = play('offense', { result: 'Gain', players: { tackler: '5' }, grades: { tackler: 1 } }, { unit: 'kickoff' });
  const removed = PlayShape.settle(settled);
  ok(!settled.tags.players.tackler && settled.tags.grades.tackler === undefined && settled.specialTeams === undefined && removed.length === 3
    && PlayShape.settle(settled).length === 0, 'settle removes the hidden role, its grade and Special Teams data, and is idempotent', removed);
}

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await gotoApp(page, APP_URL);
  await page.evaluate(async () => {
    const app = window.app;
    await app.storage.createSeason({ name: 'Charting Save', team: 'CS', year: '2026' });
    const game = app.storage.seasonStore.activeGame();
    const base = { players: {}, grades: {}, custom: [], customFields: {} };
    game.plays = [
      { id: 1, timestamp: { start: 0, end: 4 }, tags: { ...base, unit: 'defense', down: '1', distance: '10', blitz: 'Fire', result: 'Gain', yardage: '4', players: { tackler: '5' } } },
      { id: 2, timestamp: { start: 4, end: 8 }, tags: { ...base, unit: 'offense', down: '1', distance: '10', fieldSide: 'own', yardLine: '30', result: 'Gain', yardage: '4', formationFamily: 'Spread' } },
      { id: 3, timestamp: { start: 8, end: 12 }, tags: { ...base, unit: 'offense' } },
      { id: 4, timestamp: { start: 12, end: 16 }, tags: { ...base, unit: 'offense', result: 'Interception', players: { tackler: '9', missedTackler: '9', opponentTackler: '33' } } },
      { id: 5, timestamp: { start: 16, end: 20 }, tags: { ...base, unit: 'offense', result: 'Gain', players: { tackler: '9' } } },
      { id: 6, timestamp: { start: 20, end: 24 }, tags: { ...base, unit: 'special', result: 'Gain', players: { tackler: '5' } }, specialTeams: { unit: 'kickoff' } },
      { id: 7, timestamp: { start: 24, end: 28 }, tags: { ...base, unit: 'defense', result: 'Interception', players: { tackler: '5' } } },
    ].map(p => ({ ...p, annotations: [], notes: '' }));
    game.nextId = 8;
    app.storage._loadActiveGame();
    app.roster.players = [{ num: '5', name: 'Five', side: 'D' }, { num: '9', name: 'Nine', side: 'O' }];
    app.tagger.autoDD = true;
    app.tagger.carryScheme = true;
    await app.workspaceShell.show('breakdown');
  });
  const settle = (ms = 200) => new Promise(r => setTimeout(r, ms));
  const select = async id => { await page.evaluate(id => window.app.tagger.selectPlay(id), id); await settle(); };
  const state = () => page.evaluate(() => {
    const app = window.app, t = app.tagger;
    const live = t.getPlay(t.currentPlayId);
    const group = [...document.querySelectorAll('details.gi-tag-group')].find(d => /Players/.test(d.querySelector('summary')?.textContent || ''));
    return {
      current: t.currentPlayId, liveUnit: live?.tags.unit, liveTackler: live?.tags.players?.tackler || '', liveBlitz: live?.tags.blitz || '',
      liveDown: live?.tags.down || '', liveFormation: live?.tags.formationFamily || '', liveNotes: live?.notes || '',
      unsaved: !!document.querySelector('[data-native-unsaved]'), dirty: t.hasUnsavedChanges(),
      saveEnabled: !document.querySelector('[data-native-save]')?.disabled,
      deckUnit: document.querySelector('.gi-unit-switch button[aria-pressed="true"]')?.dataset.unit || '',
      roles: [...(group?.querySelectorAll('.gi-tag-players > div > strong') || [])].map(node => node.textContent.trim()),
      dialog: [...document.querySelectorAll('.gi-overlay-layer.is-modal button')].map(button => button.textContent.trim()),
      message: document.querySelector('.gi-overlay-layer.is-modal .gi-overlay-body > p')?.textContent || '',
    };
  });
  const click = async selector => { await page.click(selector); await settle(); };
  const clickDialog = async label => {
    await page.evaluate(label => [...document.querySelectorAll('.gi-overlay-layer.is-modal button')].find(b => b.textContent.trim() === label)?.click(), label);
    await settle();
  };

  console.log('\n== Switching units is a save that asks before removing charted values ==');
  await select(1);
  await click('.gi-unit-switch [data-unit="offense"]');
  let s = await state();
  ok(s.dialog.join() === 'Cancel,Change unit' && /Tackler\(s\) \(5\)/.test(s.message) && s.liveUnit === 'defense',
    'switching a charted defensive play to Offense asks first and names the Tackler it removes', { dialog: s.dialog, message: s.message });
  await clickDialog('Cancel');
  s = await state();
  ok(s.liveUnit === 'defense' && s.liveTackler === '5' && s.deckUnit === 'defense' && !s.dirty, 'Cancel changes nothing: the play stays defense with its Tackler', s);
  await click('.gi-unit-switch [data-unit="offense"]');
  await clickDialog('Change unit');
  s = await state();
  ok(s.liveUnit === 'offense' && s.liveTackler === '' && s.liveBlitz === 'Fire' && !s.dirty && !s.unsaved,
    'Change unit saves the offense play: the Tackler is gone, the Defense Faced Blitz stays, nothing is unsaved', s);
  await page.evaluate(() => window.app.history.undoAll()); await settle();
  s = await state();
  ok(s.current === 1 && s.liveUnit === 'defense' && s.liveTackler === '5', 'one Undo restores the play as it was, still open', s);
  await select(3);
  await click('.gi-unit-switch [data-unit="defense"]');
  s = await state();
  ok(!s.dialog.length && s.liveUnit === 'defense', 'a play with nothing charted to lose changes unit at once, saved', s);
  await click('.gi-unit-switch [data-unit="offense"]');
  await select(6);
  await page.evaluate(() => window.app.nativeTagging.setSpecialUnit('punt')); await settle();
  s = await state();
  const punt = await page.evaluate(() => ({ unit: window.app.tagger.getPlay(6).specialTeams?.unit, tackler: window.app.tagger.getPlay(6).tags.players?.tackler }));
  ok(!s.dialog.length && punt.unit === 'punt' && punt.tackler === '5',
    'a value the play already could not show (a Result on a kickoff) never asks; the coverage Tackler stays on the punt', { dialog: s.dialog, punt });
  await page.evaluate(() => window.app.history.undoAll()); await settle();

  console.log('\n== Leaving with unsaved changes asks ==');
  await select(1);
  await page.evaluate(() => window.app.nativeTagging.setField('down', '2'));
  await settle();
  s = await state();
  ok(s.dirty && s.liveDown === '1', 'a chip edit is unsaved: the stored play still reads 1st down', s);
  await select(2);
  s = await state();
  ok(s.current === 1 && s.dialog.join() === 'Stay,Discard,Save', 'selecting another play asks Stay, Discard or Save', s.dialog);
  await clickDialog('Stay');
  s = await state();
  ok(s.current === 1 && s.dirty, 'Stay keeps the play open with its unsaved changes', s);
  await select(2);
  await clickDialog('Discard');
  s = await state();
  const discarded = await page.evaluate(() => window.app.tagger.getPlay(1).tags.down);
  ok(s.current === 2 && discarded === '1', 'Discard leaves the stored play unchanged and opens the next play', { current: s.current, discarded });
  await select(1);
  await page.evaluate(() => window.app.tagger.setTagValue('down', '3')); await settle();
  await select(2);
  await clickDialog('Save');
  s = await state();
  const saved = await page.evaluate(() => window.app.tagger.getPlay(1).tags.down);
  ok(s.current === 2 && saved === '3', 'Save in the prompt stores the change and opens the next play', { current: s.current, saved });
  await page.evaluate(() => window.app.nativeTagging.setNotes('quick note'));
  await select(4);
  s = await state();
  ok(s.current === 2 && s.dialog.join() === 'Stay,Discard,Save', 'a note typed a moment before leaving is already an unsaved change', s.dialog);
  await clickDialog('Save');
  const note = await page.evaluate(() => window.app.tagger.getPlay(2).notes);
  ok(note === 'quick note', 'Save stores the note', note);
  const typed = await page.evaluate(() => {
    const app = window.app, t = app.tagger;
    app.nativeTagging.setNotes('a'); app.nativeTagging.setNotes('ab');
    t.undoDraft(); const blank = t.getCurrentPlay().notes || '';
    app.nativeTagging.setNotes('c'); t.undoDraft();
    const out = { blank, afterUndo: t.getCurrentPlay().notes || '' };
    t.discardDraft();
    return out;
  });
  ok(typed.blank === '' && typed.afterUndo === '', 'typing right after Undo is its own step: Undo removes it', typed);

  console.log('\n== Values the app fills in ==');
  await select(2);
  await page.evaluate(() => window.app._advancePlay()); await settle();
  s = await state();
  const carried = await page.evaluate(() => ({ down: window.app.tagger.getCurrentPlay().tags.down, formation: window.app.tagger.getCurrentPlay().tags.formationFamily, stored: window.app.tagger.getPlay(3).tags.formationFamily || '' }));
  ok(s.current === 3 && carried.down === '2' && carried.formation === 'Spread' && carried.stored === '' && !s.dirty,
    'Save & Next fills the next play\'s down and carried formation on screen without storing them or marking them unsaved', carried);
  await select(4);
  s = await state();
  const after = await page.evaluate(() => window.app.tagger.getPlay(3).tags.down || '');
  ok(s.current === 4 && !s.dialog.length && after === '', 'leaving a play with only filled-in values asks nothing and stores nothing', { after, dialog: s.dialog });
  await select(2);
  await page.evaluate(() => window.app._advancePlay()); await settle();
  await click('.gi-unit-switch [data-unit="special"]');
  s = await state();
  ok(s.current === 3 && !s.dialog.length && s.liveUnit === 'special' && s.liveFormation === '', 'switching a play holding only filled-in values never asks', s);
  await click('.gi-unit-switch [data-unit="offense"]');
  await select(2);
  await click('.gi-unit-switch [data-unit="special"]');
  s = await state();
  ok(s.dialog.join() === 'Cancel,Change unit' && /Formation \(Spread\)/.test(s.message), 'the same formation charted by the coach asks before it goes', s.message);
  await clickDialog('Cancel');
  await page.evaluate(() => window.app._advancePlay()); await settle();
  const undone = await page.evaluate(() => { const t = window.app.tagger; t.setTagValue('formationFamily', 'I-Form'); t.undoDraft(); return { formation: t.getCurrentPlay().tags.formationFamily, current: t.currentPlayId }; });
  await click('.gi-unit-switch [data-unit="special"]');
  s = await state();
  ok(undone.current === 3 && undone.formation === 'Spread' && !s.dialog.length && s.liveUnit === 'special',
    'Undo of a coach edit restores the carried formation as filled in: switching units still never asks', { undone, dialog: s.dialog, message: s.message });
  if (s.dialog.length) await clickDialog('Cancel');
  await click('.gi-unit-switch [data-unit="offense"]');

  console.log('\n== Reports read saved plays only ==');
  await select(2);
  await page.evaluate(() => window.app.tagger.setTagValue('yardage', '40')); await settle();
  const report = await page.evaluate(() => window.app.tagger.plays.find(p => p.id === 2).tags.yardage);
  ok(report === '4', 'an unsaved Yards edit is not in the plays the reports read', report);
  const recovery = await page.evaluate(() => { const app = window.app; app.storage.commitActive(); return app.storage.seasonStore.activeGame().chartDraft || null; });
  ok(recovery?.id === 2 && /40/.test(recovery.charting), 'the unsaved draft is saved with its game for recovery, apart from the plays', recovery);
  const offered = await page.evaluate(async () => {
    const app = window.app, t = app.tagger;
    // A relaunch: the game loads with its recovery copy and the play opens.
    const game = app.storage.seasonStore.activeGame();
    t.draft = null; t.recovery = null;
    app.storage._deserialize(game);
    t.selectPlay(2); t.getCurrentPlay();
    await new Promise(r => setTimeout(r, 200));
    const buttons = [...document.querySelectorAll('.gi-overlay-layer.is-modal button')].map(b => b.textContent.trim());
    [...document.querySelectorAll('.gi-overlay-layer.is-modal button')].find(b => b.textContent.trim() === 'Restore')?.click();
    await new Promise(r => setTimeout(r, 200));
    return { buttons, restored: t.getCurrentPlay().tags.yardage, stored: t.getPlay(2).tags.yardage, dirty: t.hasUnsavedChanges() };
  });
  ok(offered.buttons.join() === 'Discard,Restore' && offered.restored === '40' && offered.stored === '4' && offered.dirty,
    'reopening the play offers Restore; restoring brings the change back unsaved', offered);
  await click('[data-native-save]');
  const cleared = await page.evaluate(() => { const app = window.app; app.storage.commitActive(); return app.storage.seasonStore.activeGame().chartDraft ?? null; });
  ok(cleared === null, 'saving clears the recovery copy');

  console.log('\n== Turnover tacklers and tackle credit ==');
  await select(4);
  s = await state();
  ok(['Tackler(s)', 'Our Missed Tackles', 'Missed Tackles', 'Opponent Tackler(s)'].every(label => s.roles.includes(label)),
    'an offensive interception shows our Tackler(s), our missed tacklers, the opponent\'s missed-tackle count and the opponent\'s tacklers', s.roles);
  await select(7);
  s = await state();
  ok(['Tackler(s)', 'Takeaway', 'Opponent Tackler(s)'].every(label => s.roles.includes(label)), 'a defensive interception shows the opponent\'s tacklers beside ours', s.roles);
  await select(5);
  s = await state();
  ok(!s.roles.includes('Tackler(s)') && !s.roles.includes('Opponent Tackler(s)'), 'an offensive gain shows no tacklers', s.roles);
  const credit = await page.evaluate(() => {
    const app = window.app, plays = app.tagger.plays.map(p => { const copy = { ...p }; Object.defineProperty(copy, '__gid', { value: 'g' }); return copy; });
    const players = app.stats.playersBoard(plays).players;
    const facts = num => players.find(player => player.num === num)?.roles?.find?.(role => role.key === 'tackles')?.stats || {};
    const board = app.stats.defenseBoard(plays, {}).players.find(row => row.num === '9');
    const reg = app.analyticsRegistry, byId = id => plays.find(p => p.id === id);
    return { tkl: facts('9').tkl?.n ?? null, mtkl: facts('9').mtkl?.n ?? null, opponent: players.some(player => player.num === '33'), board: board?.tackles ?? null,
      study: { turnover: reg.values('playerTackler', byId(4)), coverage: reg.values('playerTackler', byId(6)), gain: reg.values('playerTackler', byId(5)), missed: reg.values('playerMissedTackler', byId(4)) } };
  });
  ok(credit.tkl === 1 && credit.mtkl === 1 && credit.board === 1 && !credit.opponent,
    'the interception tackle and the miss count for #9 in Players and the Defense board; the opponent\'s #33 is credited to no one of ours', credit);
  const returnCredit = await page.evaluate(() => {
    const app = window.app, base = { grades: {}, custom: [], customFields: {} };
    const mk = (id, tags) => { const p = { id, timestamp: { start: id, end: id + 1 }, notes: '', annotations: [], tags: { ...base, ...tags } }; Object.defineProperty(p, '__gid', { value: 'r' }); return p; };
    const plays = [
      mk(1, { unit: 'offense', runPass: 'Pass', playType: 'Dropback', result: 'Sack + Fumble', fumbleRecovery: 'opponent', yardage: '-7', players: { passer: '12', tackler: '5' } }),
      mk(2, { unit: 'offense', runPass: 'Pass', result: 'Interception', yardage: '-3', players: { passer: '12', tackler: '9' } }),
      mk(3, { unit: 'defense', result: 'Sack', yardage: '-6', players: { tackler: '5' } }),
    ];
    const tackles = num => app.stats.playersBoard(plays).players.find(p => p.num === num)?.roles?.find(r => r.key === 'tackles')?.stats || {};
    const engine = app.analyticsRegistry.metricsEngine(), study = id => engine.metric([plays[0], plays[1]], id, {}, { allowUnlinkedPlays: true }).value;
    return { five: { tkl: tackles('5').tkl?.n ?? 0, sack: tackles('5').sack?.n ?? 0, tfl: tackles('5').tfl?.n ?? 0 }, nine: { tkl: tackles('9').tkl?.n ?? 0, tfl: tackles('9').tfl?.n ?? 0 },
      study: { sacks: study('sacksMade'), tfl: study('tfl') } };
  });
  ok(returnCredit.five.tkl === 2 && returnCredit.five.sack === 1 && returnCredit.five.tfl === 0 && returnCredit.nine.tkl === 1 && returnCredit.nine.tfl === 0,
    'a return tackle after our turnover is a tackle, never the opponent\'s sack or a tackle for loss; a defensive sack still counts', returnCredit);
  ok(returnCredit.study.sacks === 0 && returnCredit.study.tfl === 0, 'Study\'s Sacks and TFL never credit a return tackle', returnCredit.study);
  ok(credit.study.turnover.join() === '9' && credit.study.coverage.join() === '5' && !credit.study.gain.length && credit.study.missed.join() === '9',
    'Study\'s Tackler role includes kick coverage and the offensive turnover tackle, not a hidden Tackler; Missed Tackler includes the turnover', credit.study);

  console.log('\n== Roster grid ==');
  const roster = await page.evaluate(async () => {
    const app = window.app, kept = app.roster.players;
    app.roster.players = Array.from({ length: 30 }, (_, i) => ({ num: String(i + 1), name: `P${i + 1}`, side: 'D' }));
    app.tagger.selectPlay(1); app.nativeTagging.refresh?.();
    await new Promise(r => setTimeout(r, 250));
    const toggle = [...document.querySelectorAll('.gi-player-roster-toggle')].find(b => /Show roster/.test(b.textContent));
    toggle?.click();
    await new Promise(r => setTimeout(r, 200));
    const quick = document.querySelector('.gi-player-quick');
    const row = quick ? parseFloat(getComputedStyle(quick.querySelector('button')).height) : 0;
    const out = quick ? { height: quick.clientHeight, scroll: quick.scrollHeight, row } : null;
    app.roster.players = kept;
    return out;
  });
  ok(roster && roster.scroll === roster.height && roster.row === 27,
    'a long roster uses complete 27px wrapping rows in the shared form, not a nested scroller', roster);

  console.log('\n== Film Room edits are saves ==');
  const grid = await page.evaluate(() => {
    const app = window.app, PlayGrid = app.playGrid.constructor;
    const col = key => PlayGrid.COLUMNS.find(item => item.key === key);
    const kickoff = app.tagger.getPlay(6);
    return { resultLocked: PlayGrid.cellLocked(kickoff, col('result')), unitLocked: PlayGrid.cellLocked(kickoff, col('unit')) };
  });
  ok(grid.resultLocked && !grid.unitLocked, 'Film Room locks Result on a kickoff, as Chart hides it', grid);
  await select(3);
  const pendingUnit = page.evaluate(() => window.app.playGrid.nativeCommitEdit(1, 'unit', 'Offense'));
  await settle();
  s = await state();
  ok(s.dialog.join() === 'Cancel,Change unit', 'a Film Room unit change that removes charted values asks first', s.dialog);
  await clickDialog('Change unit');
  await pendingUnit;
  const unitEdit = await page.evaluate(() => ({ unit: window.app.tagger.getPlay(1).tags.unit, tackler: window.app.tagger.getPlay(1).tags.players?.tackler || '' }));
  ok(unitEdit.unit === 'offense' && unitEdit.tackler === '', 'confirmed, it saves the play without the defense Tackler', unitEdit);
  await select(2);
  await page.evaluate(() => window.app.tagger.setTagValue('down', '4')); await settle();
  const pending = page.evaluate(() => window.app.playGrid.nativeCommitEdit(2, 'quarter', '2'));
  await settle();
  s = await state();
  ok(s.dialog.join() === 'Stay,Discard,Save', 'editing the open play in Film Room with unsaved Chart changes asks first', s.dialog);
  await clickDialog('Save');
  await pending;
  const both = await page.evaluate(() => ({ down: window.app.tagger.getPlay(2).tags.down, quarter: window.app.tagger.getPlay(2).tags.quarter }));
  ok(both.down === '4' && both.quarter === '2', 'Save keeps the Chart change and then applies the Film Room edit', both);

  console.log('\n== Clip navigation leaves the play like any other move ==');
  const clips = await page.evaluate(async () => {
    const app = window.app, store = app.storage.seasonStore;
    const game = store.addGame();
    await app.storage.switchToGame(game.id);
    const clip = name => new File([new Blob([new Uint8Array(32)])], name, { type: 'video/mp4' });
    await app.playlist.addFiles([clip('CLIP_A.mp4'), clip('CLIP_B.mp4')]);
    await new Promise(r => setTimeout(r, 300));
    app.playlist.switchToClip(0);
    await new Promise(r => setTimeout(r, 100));
    return { count: app.playlist.clips.length, current: app.tagger.currentPlayId, index: app.playlist.activeClipIndex };
  });
  await page.evaluate(() => window.app.tagger.setTagValue('down', '2')); await settle();
  await page.evaluate(() => { window.__nextClip = window.app.playlist.nextClip(); });
  await settle();
  s = await state();
  const stayed = await page.evaluate(() => ({ current: window.app.tagger.currentPlayId, index: window.app.playlist.activeClipIndex }));
  ok(clips.count === 2 && s.dialog.join() === 'Stay,Discard,Save' && stayed.current === clips.current && stayed.index === clips.index,
    'Next clip with unsaved changes asks first and stays on the clip', { clips, dialog: s.dialog, stayed });
  await clickDialog('Save');
  await page.evaluate(() => window.__nextClip);
  const moved = await page.evaluate(id => ({ index: window.app.playlist.activeClipIndex, saved: window.app.tagger.getPlay(id)?.tags.down }), clips.current);
  ok(moved.index === clips.index + 1 && moved.saved === '2', 'Save stores the change and then moves to the next clip', moved);
} finally {
  await browser.close();
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
