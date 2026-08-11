import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (value, label, detail = '') => value
  ? (pass++, console.log('  PASS  ' + label))
  : (fail++, console.log('  FAIL  ' + label + (detail ? ' -- ' + detail : '')));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.nativeTagging && document.querySelector('[data-native-team-hub]'));

console.log('\n== Play-call charting ==');
await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: 'Play Call Charting', team: 'Mavericks', year: '2026' });
  const store = app.storage.seasonStore;
  const game = store.activeGame();
  game.gameInfo = { ...(game.gameInfo || {}), opponent: 'Wildcats', week: '1', perspective: 'offense' };
  game.plays = [1, 2, 3].map(id => ({
    id, timestamp: { start: (id - 1) * 6, end: id * 6 - 1 }, notes: '',
    tags: {
      unit: 'offense', down: '', distance: '', quarter: '', fieldSide: 'own', yardLine: '',
      formation: '', qbAlignment: '', backfield: '', strength: '', personnel: '', motion: '',
      runPass: '', playType: '', result: '', yardage: '', hash: '', playDir: '',
      defFront: '', coverage: '', coverageFamily: '', blitz: '', driveNumber: '',
      playCall: '', playCallId: '', playConcept: '', players: {}, grades: {}, custom: [], customFields: {},
    },
  }));
  app.playbook.replace({ version: 1, calls: [
    { id: 'call_26_blast', name: '26 Blast', concept: 'Blast', favorite: true,
      defaults: { runPass: 'Run', playType: 'Run Inside', playDir: 'Right', formation: 'Power-I', backfield: 'I', strength: 'Right' } },
    { id: 'call_24_iso', name: '24 Iso', concept: 'Iso', favorite: false,
      defaults: { playType: 'Run Inside', playDir: 'Left', formation: 'Ace', backfield: 'Single', strength: 'Balanced' } },
  ] });
  store.data.playbook = app.playbook.snapshot();
  store.setActive(game.id);
  await store.persist();
  await app.storage._loadActiveGame({ renderGames: false });
  app.tagger.selectPlay(1);
  await app.workspaceShell.show('breakdown');
  app.history.reset();
});

let state = await page.evaluate(async () => {
  const root = document.querySelector('[data-native-tagging]');
  const field = root.querySelector('[data-native-play-call]');
  const input = field.querySelector('input');
  input.value = '26 Blast';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  const play = app.tagger.getCurrentPlay();
  return {
    label: field.querySelector('.gi-tag-field-label span')?.textContent.trim(),
    favorite: [...field.querySelectorAll('.gi-play-call-quick button')].some(button => button.textContent.includes('26 Blast')),
    call: [play.tags.playCall, play.tags.playCallId, play.tags.playConcept],
    defaults: { ...play.tags.playCallDefaults },
    values: { formation: play.tags.formation, backfield: play.tags.backfield, strength: play.tags.strength,
      runPass: play.tags.runPass, playType: play.tags.playType, playDir: play.tags.playDir },
    appliedText: field.querySelector('.gi-play-call-defaults')?.textContent || '',
    history: app.history.stack.length,
  };
});
ok(state.label === 'Our Play Call' && state.favorite, 'Self-scout offense shows Our Play Call with favorite access', JSON.stringify(state));
ok(JSON.stringify(state.call) === JSON.stringify(['26 Blast', 'call_26_blast', 'Blast']), 'Library selection stores durable call and concept snapshots', JSON.stringify(state.call));
ok(state.values.formation === 'Power-I' && state.values.backfield === 'I' && state.values.strength === 'Right'
  && state.values.runPass === 'Run' && state.values.playType === 'Run Inside' && state.values.playDir === 'Right',
  'Selecting a call applies its visible standardized defaults', JSON.stringify(state.values));
ok(Object.keys(state.defaults).length === 6 && state.appliedText.includes('Formation: Power-I') && state.history === 1,
  'Applied defaults are disclosed and selection is one undoable action', JSON.stringify(state));

state = await page.evaluate(async () => {
  app.nativeTagging.setField('playDir', 'Middle');
  app.history.reset();
  app.nativeTagging.selectPlayCall('24 Iso');
  await new Promise(resolve => setTimeout(resolve, 0));
  const after = structuredClone(app.tagger.getCurrentPlay().tags);
  const entries = app.history.stack.length;
  app.history.undo();
  const undone = structuredClone(app.tagger.getCurrentPlay().tags);
  app.history.redo();
  const redone = structuredClone(app.tagger.getCurrentPlay().tags);
  return { after, entries, undone, redone };
});
ok(state.after.playCall === '24 Iso' && state.after.formation === 'Ace' && state.after.backfield === 'Single'
  && state.after.strength === 'Balanced', 'Changing calls replaces only prior call-owned defaults', JSON.stringify(state.after));
ok(state.after.playDir === 'Middle' && !Object.hasOwn(state.after.playCallDefaults, 'playDir'),
  'A coach override survives a later call change and leaves default provenance', JSON.stringify(state.after.playCallDefaults));
ok(state.entries === 1 && state.undone.playCall === '26 Blast' && state.undone.playDir === 'Middle'
  && state.redone.playCall === '24 Iso' && state.redone.playDir === 'Middle',
  'Call change undoes and redoes as one complete transaction', JSON.stringify(state));

state = await page.evaluate(async () => {
  app.tagger.selectPlay(2);
  app.nativeTagging.selectPlayCall('Counter GT');
  await new Promise(resolve => setTimeout(resolve, 0));
  const free = structuredClone(app.tagger.getCurrentPlay().tags);
  const added = await app.nativeTagging.addPlayCall('Counter GT');
  await new Promise(resolve => setTimeout(resolve, 0));
  const saved = structuredClone(app.tagger.getCurrentPlay().tags);
  const library = app.playbook.list();
  app.gameContext.update({ perspective: 'scout' });
  app.nativeTagging._publish();
  await new Promise(resolve => setTimeout(resolve, 0));
  const label = document.querySelector('[data-native-play-call] .gi-tag-field-label span')?.textContent.trim();
  return { free, added, saved, library, label };
});
ok(state.free.playCall === 'Counter GT' && state.free.playCallId === '' && state.free.playConcept === '',
  'Free text stores an exact call without inventing concept or numbering meaning', JSON.stringify(state.free));
ok(state.added && state.saved.playCallId && state.library.some(call => call.name === 'Counter GT'),
  'Inline Add durably promotes free text into the team playbook', JSON.stringify({ saved: state.saved, library: state.library }));
ok(state.label === 'Opponent Play', 'Opponent scout uses the football-correct Opponent Play label', state.label);

state = await page.evaluate(() => {
  app.gameContext.update({ perspective: 'self' });
  app.tagger.selectPlay(3);
  app.history.stack = []; app.history.index = -1;
  const columns = app.playGrid.nativeSnapshot().allColumns;
  const upgradedDefault = app.playGrid.constructor._upgradeCols(
    app.playGrid.constructor.PRE_CALL_PRESETS.default);
  app.playGrid.nativeCommitEdit(3, 'playCall', '26 Blast');
  const after = structuredClone(app.tagger.getCurrentPlay().tags);
  const entries = app.history.stack.length;
  app.history.undo();
  const undone = structuredClone(app.tagger.getPlay(3).tags);
  app.history.redo();
  const redone = structuredClone(app.tagger.getPlay(3).tags);
  return { columns, upgradedDefault, after, entries, undone, redone };
});
ok(state.columns.some(col => col.key === 'playCall' && col.label === 'Play Call')
  && state.columns.some(col => col.key === 'playConcept' && col.label === 'Concept')
  && state.columns.some(col => col.key === 'notes' && col.label === 'Notes'),
  'Film Room exposes distinct Play Call, Concept, and Notes columns', JSON.stringify(state.columns));
ok(state.upgradedDefault.includes('playCall'),
  'A saved pre-call stock preset upgrades to reveal Play Call', JSON.stringify(state.upgradedDefault));
ok(state.after.playCall === '26 Blast' && state.after.playCallId === 'call_26_blast'
  && state.after.playConcept === 'Blast' && state.after.formation === 'Power-I',
  'Film Room selects a saved call through the same snapshot/default rules as Chart', JSON.stringify(state.after));
ok(state.entries === 1 && state.undone.playCall === '' && state.redone.playCall === '26 Blast',
  'Film Room call selection is one complete undo/redo transaction', JSON.stringify(state));

state = await page.evaluate(() => {
  const gameId = app.storage.seasonStore.activeGame().id;
  const plays = app.tagger.plays;
  const call = app.study.run({ plays, dimension: 'playCall', measures: ['sampleSize', 'successRate'], context: { gameId } });
  const concept = app.study.run({ plays, dimension: 'playConcept', measures: ['sampleSize'], context: { gameId } });
  const blast = call.groups.find(group => group.value === '26 Blast');
  const blastConcept = concept.groups.find(group => group.value === 'Blast');
  return {
    call: blast,
    concept: blastConcept,
    registryCall: app.analyticsRegistry.matchingRefs(plays, 'playCall', '26 Blast', { gameId }),
    registryConcept: app.analyticsRegistry.matchingRefs(plays, 'playConcept', 'Blast', { gameId }),
    dimensions: app.studyScreen.constructor.DIMENSIONS,
    group: app.studyScreen.constructor.DIMENSION_GROUPS.find(item => item.name === 'Offensive look')?.ids || [],
  };
});
ok(state.dimensions.includes('playCall') && state.dimensions.includes('playConcept')
  && state.group.includes('playCall') && state.group.includes('playConcept'),
  'Study exposes Play Call and Play Concept under Offensive look');
ok(state.call?.sampleSize === 1 && JSON.stringify(state.call.matchingPlayIds) === JSON.stringify(state.registryCall)
  && state.call.measures.sampleSize === 1,
  'Study Play Call result equals the canonical composite-ref cut and measures that cohort', JSON.stringify(state));
ok(state.concept?.sampleSize === 1 && JSON.stringify(state.concept.matchingPlayIds) === JSON.stringify(state.registryConcept),
  'Study Concept roll-up equals the canonical composite-ref cut', JSON.stringify(state));
console.log('\n== Play-call Reports ==');
state = await page.evaluate(async () => {
  const [first, second, third] = app.tagger.plays;
  Object.assign(first.tags, { playCall: '26 Blast', playCallId: 'call_26_blast', playConcept: 'Blast',
    runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '6', down: '1', distance: '10',
    formation: 'Power-I', personnel: '21', fieldSide: 'own', yardLine: '20', strength: 'Right', playDir: 'Right' });
  Object.assign(second.tags, { playCall: 'Counter GT', playConcept: 'Counter', runPass: 'Run',
    playType: 'Run Outside', result: 'Loss', yardage: '-2', down: '3', distance: '2',
    formation: 'Ace', personnel: '11', fieldSide: 'opp', yardLine: '35', strength: 'Right', playDir: 'Left' });
  Object.assign(third.tags, { result: 'Touchdown', yardage: '15', down: '2', distance: '5',
    personnel: '22', fieldSide: 'opp', yardLine: '12' });
  app.storage.commitActive();
  const analysis = app.stats._playCallAnalysis(app.tagger.plays);
  await app.workspaceShell.show('reports');
  app.reportsScreen.selectTab('offense');
  await new Promise(resolve => setTimeout(resolve, 100));
  const root = document.querySelector('#wsReports');
  const callRows = [...root.querySelectorAll('.gi-call-table tbody tr')];
  const blastRow = callRows.find(row => row.cells[0]?.textContent.trim() === '26 Blast');
  const contexts = [...root.querySelectorAll('.gi-call-context')];
  const downTable = contexts.find(node => node.querySelector('h4')?.textContent.trim() === 'Down & Distance');
  const situationRow = [...(downTable?.querySelectorAll('tbody tr') || [])]
    .find(row => row.cells[0]?.textContent.trim() === '1st & Long');
  const calls = [];
  const original = app.filmNavigation.watch;
  app.filmNavigation.watch = (refs, options) => { calls.push({ refs, label: options?.label }); return Promise.resolve({ completed: true }); };
  situationRow?.click();
  app.filmNavigation.watch = original;
  return {
    analysis,
    callText: blastRow?.textContent || '',
    conceptText: root.querySelector('.gi-call-concepts')?.textContent || '',
    lenses: contexts.map(node => node.querySelector('h4')?.textContent.trim()),
    situationRefs: (situationRow?.dataset.playCallRefs || '').split(',').filter(Boolean),
    calls,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});
if (process.env.GIQ_PLAY_CALL_SCREENSHOT) await page.screenshot({ path: process.env.GIQ_PLAY_CALL_SCREENSHOT, fullPage: false });
const reportBlast = state.analysis.calls.find(row => row.name === '26 Blast');
ok(reportBlast?.n === 2 && reportBlast.sharePct === 66.7 && reportBlast.successRate === 100
  && reportBlast.yardsPerPlay === 10.5 && reportBlast.explosiveRate === 50 && reportBlast.negativeRate === 0,
  'Reports derives call frequency, Success Rate, Yards per Play, explosive, and negative rates from canonical metrics', JSON.stringify(reportBlast));
ok(state.callText.includes('26 Blast') && state.callText.includes('Blast') && state.callText.includes('66.7%')
  && state.conceptText.includes('Blast') && state.conceptText.includes('26 Blast'),
  'Reports renders exact calls and nests precise calls under their concept roll-up', JSON.stringify({ call: state.callText, concept: state.conceptText }));
ok(['Down & Distance', 'Formation', 'Personnel', 'Field Position', 'Direction vs Strength']
  .every(label => state.lenses.includes(label)),
  'Reports answers what we call by situation, structure, personnel, field position, and strength relationship', JSON.stringify(state.lenses));
ok(state.situationRefs.length === 1 && state.calls.length === 1
  && JSON.stringify(state.calls[0].refs) === JSON.stringify(state.situationRefs)
  && /^[^:]+::1$/.test(state.situationRefs[0]) && !state.overflow,
  'A situational result opens only its exact composite-ref film cohort without horizontal page overflow', JSON.stringify(state));

state = await page.evaluate(() => {
  const game = app.storage.seasonStore.activeGame();
  const play = app.tagger.getPlay(1);
  const label = app.callSheet._playLabel(play);
  const plan = { name: 'Call Plan', items: [{ id: 'i1', kind: 'film', label: 'Blast family', refs: [`${game.id}::1`] }] };
  const built = app.planExport.build(plan, [game]);
  const html = app.planExport.html(built);
  return { label, resolved: built.items[0].plays[0], html };
});
ok(state.label.startsWith('26 Blast') && state.label.includes('(Blast)') && !state.label.startsWith('Power-I'),
  'Call Sheet leads with the exact call while retaining legacy fallback only for plays without one', state.label);
ok(state.resolved.playCall === '26 Blast' && state.resolved.playConcept === 'Blast'
  && state.html.includes('<th>Play Call</th>') && state.html.includes('<th>Concept</th>')
  && state.html.includes('26 Blast'),
  'Plan data and printable output carry exact call and concept separately from look, play type, and notes', JSON.stringify(state.resolved));

ok(errors.length === 0, 'No page errors', errors.join('\n'));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
await browser.close();
if (fail) process.exit(1);
