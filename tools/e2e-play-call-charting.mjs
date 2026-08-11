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
  game.plays = [1, 2].map(id => ({
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
ok(errors.length === 0, 'No page errors', errors.join('\n'));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
await browser.close();
if (fail) process.exit(1);
