/* CHARTING SAVE ------------------------------------------------------------------
   GRIDIRON-IQ-SAVE-CONTRACT.md. Chart edits a draft of the open play; the
   stored play, the reports and the disk change only on Save, which keeps
   exactly what the play can show (PlayShape). Switching units before saving
   loses nothing; leaving a play with unsaved changes asks Save, Discard or
   Stay; values the app fills in never make a play unsaved. Film Room edits are
   saves and keep only what the play can show. A tackle counts only where the
   play shows Tackler(s): defense, kick coverage, or an offensive turnover.

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
  ok(PlayShape.roles(play('offense', { result: 'Interception' })).includes('tackler')
    && PlayShape.roles(play('offense', { result: 'Fumble', fumbleRecovery: 'opponent' })).includes('tackler')
    && !PlayShape.roles(play('offense', { result: 'Fumble', fumbleRecovery: 'subject' })).includes('tackler')
    && !PlayShape.roles(play('offense', { result: 'Gain' })).includes('tackler'),
    'an offensive snap ending in an interception or a lost fumble opens Tackler(s); a recovered fumble does not');
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
      { id: 2, timestamp: { start: 4, end: 8 }, tags: { ...base, unit: 'offense', down: '1', distance: '10', fieldSide: 'own', yardLine: '30', result: 'Gain', yardage: '4' } },
      { id: 3, timestamp: { start: 8, end: 12 }, tags: { ...base, unit: 'offense' } },
      { id: 4, timestamp: { start: 12, end: 16 }, tags: { ...base, unit: 'offense', result: 'Interception', players: { tackler: '9' } } },
      { id: 5, timestamp: { start: 16, end: 20 }, tags: { ...base, unit: 'offense', result: 'Gain', players: { tackler: '9' } } },
      { id: 6, timestamp: { start: 20, end: 24 }, tags: { ...base, unit: 'special', result: 'Gain' }, specialTeams: { unit: 'kickoff' } },
    ].map(p => ({ ...p, annotations: [], notes: '' }));
    game.nextId = 7;
    app.storage._loadActiveGame();
    app.roster.players = [{ num: '5', name: 'Five', side: 'D' }, { num: '9', name: 'Nine', side: 'O' }];
    app.tagger.autoDD = true;
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
      liveDown: live?.tags.down || '', unsaved: !!document.querySelector('[data-native-unsaved]'), dirty: t.hasUnsavedChanges(),
      saveEnabled: !document.querySelector('[data-native-save]')?.disabled,
      roles: [...(group?.querySelectorAll('.gi-tag-players > div > strong') || [])].map(node => node.textContent.trim()),
      tacklerInput: document.querySelector('[aria-label="tackler player number"]')?.value ?? null,
      dialog: [...document.querySelectorAll('.gi-overlay-layer.is-modal button')].map(button => button.textContent.trim()),
    };
  });
  const click = async selector => { await page.click(selector); await settle(); };
  const clickDialog = async label => {
    await page.evaluate(label => [...document.querySelectorAll('.gi-overlay-layer.is-modal button')].find(b => b.textContent.trim() === label)?.click(), label);
    await settle();
  };

  console.log('\n== Switching units before Save loses nothing ==');
  await select(1);
  await click('.gi-unit-switch [data-unit="offense"]');
  let s = await state();
  ok(s.liveUnit === 'defense' && s.liveTackler === '5' && s.unsaved && s.saveEnabled && !s.roles.includes('Tackler(s)'),
    'a unit switch changes only the draft: the stored play is still defense, Chart shows the offense roles and Unsaved changes', s);
  await click('.gi-unit-switch [data-unit="defense"]');
  s = await state();
  ok(s.tacklerInput === '5' && s.roles.includes('Tackler(s)') && !s.dirty && !s.unsaved,
    'switching back shows the Tackler as charted, with nothing unsaved', s);

  console.log('\n== Save stores what Chart shows ==');
  await click('.gi-unit-switch [data-unit="offense"]');
  await click('[data-native-save]');
  s = await state();
  ok(s.liveUnit === 'offense' && s.liveTackler === '' && s.liveBlitz === 'Fire' && !s.unsaved && !s.saveEnabled,
    'Save stores the offense charting: the hidden Tackler is gone, the Defense Faced Blitz stays', s);
  await page.evaluate(() => window.app.history.undoAll()); await settle();
  s = await state();
  ok(s.current === 1 && s.liveUnit === 'defense' && s.liveTackler === '5', 'one Undo restores the saved play as it was before Save, still open', s);

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

  console.log('\n== Values the app fills in never make a play unsaved ==');
  await select(2);
  await page.evaluate(() => window.app._advancePlay()); await settle();
  s = await state();
  const carried = await page.evaluate(() => ({ shown: window.app.tagger.getCurrentPlay().tags.down, stored: window.app.tagger.getPlay(3).tags.down || '' }));
  ok(s.current === 3 && carried.shown === '2' && carried.stored === '' && !s.dirty,
    'Save & Next fills the next play\'s down on screen without storing it or marking it unsaved', carried);
  await select(4);
  s = await state();
  const after = await page.evaluate(() => window.app.tagger.getPlay(3).tags.down || '');
  ok(s.current === 4 && !s.dialog.length && after === '', 'leaving a play with only filled-in values asks nothing and stores nothing', { after, dialog: s.dialog });

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
  ok(s.roles.includes('Tackler(s)'), 'an offensive interception shows Tackler(s)', s.roles);
  await select(5);
  s = await state();
  ok(!s.roles.includes('Tackler(s)'), 'an offensive gain shows no Tackler(s)', s.roles);
  const credit = await page.evaluate(() => {
    const app = window.app, plays = app.tagger.plays;
    const players = app.stats.playersBoard(plays).players;
    const nine = players.find(player => player.num === '9');
    const tackles = nine?.roles?.find?.(role => role.key === 'tackles') || null;
    const board = app.stats.defenseBoard(plays, {}).players.find(row => row.num === '9');
    return { players: tackles?.stats?.tkl?.n ?? null, board: board?.tackles ?? null };
  });
  ok(String(credit.players) === '1' && credit.board === 1,
    'the interception tackle counts once in Players and in the Defense board; the hidden Tackler on a gain counts nowhere', credit);

  console.log('\n== Film Room edits keep only what the play shows ==');
  const grid = await page.evaluate(() => {
    const app = window.app, PlayGrid = app.playGrid.constructor;
    const col = key => PlayGrid.COLUMNS.find(item => item.key === key);
    const kickoff = app.tagger.getPlay(6);
    return { resultLocked: PlayGrid.cellLocked(kickoff, col('result')), unitLocked: PlayGrid.cellLocked(kickoff, col('unit')) };
  });
  ok(grid.resultLocked && !grid.unitLocked, 'Film Room locks Result on a kickoff, as Chart hides it', grid);
  await select(3);
  const unitEdit = await page.evaluate(async () => {
    const app = window.app;
    await app.playGrid.nativeCommitEdit(1, 'unit', 'Offense');
    return { unit: app.tagger.getPlay(1).tags.unit, tackler: app.tagger.getPlay(1).tags.players?.tackler || '' };
  });
  ok(unitEdit.unit === 'offense' && unitEdit.tackler === '', 'a Film Room unit change is a save: the defense Tackler is removed', unitEdit);
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
} finally {
  await browser.close();
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
