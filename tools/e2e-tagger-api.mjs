/**
 * THE CHARTING DATA API (legacy excision Pass 2, step 1). PlayTagger writes a
 * play from explicit values — setTagValue, toggleTagValue, setPlayerValue,
 * setGradeValue — instead of mirrored form fields, the pattern behind S99-2
 * (shown and stored units drifting apart).
 *
 * 1. Each rule the write carries, with explicit expected values.
 * 2. While the transitional field path still exists, the old path (field +
 *    _saveField) and the new API give identical plays for the same operations.
 * Run:  node tools/e2e-tagger-api.mjs
 */
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log('  PASS  ' + label))
  : (fail++, console.log('  FAIL  ' + label + (detail ? ' -- ' + detail : '')));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !!window.app?.teamHubScreen, { timeout: 15000 });

const r = await page.evaluate(async () => {
  const app = window.app, t = app.tagger;
  await app.storage.createSeason({ name: 'API', team: 'Mavs', year: '2026' });
  const mk = (id, tags) => ({ id, timestamp: { start: id, end: id + 4 }, notes: '', annotations: [], tags: Object.assign(t.constructor.blankTags({ unit: 'offense' }), tags) });
  const clone = o => JSON.parse(JSON.stringify(o));
  const out = {};

  // --- 1. Rules, explicit values ---
  t.plays = [mk(1, { formation: 'Under Center + Flexbone', backfield: '' })]; t.selectPlay(1);
  out.display = { formation: t.displayTagValue('formation'), qb: t.displayTagValue('qbAlignment') };
  t.setTagValue('formation', 'Flexbone');
  out.promote = { formation: t.getPlay(1).tags.formation, qb: t.getPlay(1).tags.qbAlignment };

  t.plays = [mk(2, {})]; t.selectPlay(2);
  t.setTagValue('playType', 'Run Inside');
  out.runPass = t.getPlay(2).tags.runPass;
  t.setTagValue('yardage', '7');
  out.gain = { result: t.getPlay(2).tags.result, yardage: t.getPlay(2).tags.yardage };
  t.toggleTagValue('result', 'Loss');
  out.sign = { result: t.getPlay(2).tags.result, yardage: t.getPlay(2).tags.yardage, shown: t.displayTagValue('yardage') };
  t.toggleTagValue('result', 'Fumble');
  out.multiAdd = t.getPlay(2).tags.result;
  t.toggleTagValue('result', 'Fumble');
  out.multiRemove = t.getPlay(2).tags.result;
  t.toggleTagValue('hash', 'Left'); out.singleSet = t.getPlay(2).tags.hash;
  t.toggleTagValue('hash', 'Left'); out.singleClear = t.getPlay(2).tags.hash;
  t.setPlayerValue('ballCarrier', ' 22 '); t.setGradeValue('ballCarrier', '1');
  out.people = { player: t.getPlay(2).tags.players.ballCarrier, grade: t.getPlay(2).tags.grades.ballCarrier };
  t.setPlayerValue('ballCarrier', ''); t.setGradeValue('ballCarrier', '');
  out.peopleCleared = { player: 'ballCarrier' in t.getPlay(2).tags.players, grade: 'ballCarrier' in t.getPlay(2).tags.grades };
  let emits = 0; const off = t.on ? (t.on('play-updated', () => emits++), null) : null;
  t.setTagValue('down', '3'); out.oneEmit = emits;
  t.getPlay(2)._autoSit = true; t.setTagValue('distance', '4'); out.sit = t.getPlay(2)._autoSit;

  // --- 2. Old field path and new API agree, operation by operation ---
  const ops = [
    ['toggle', 'formation', 'Trips'], ['toggle', 'formation', 'Unbalanced'], ['toggle', 'formation', 'Trips'],
    ['toggle', 'qbAlignment', 'Shotgun'], ['toggle', 'playType', 'Run Outside'], ['toggle', 'playType', 'RPO'],
    ['toggle', 'result', 'Gain'], ['set', 'yardage', '12'], ['toggle', 'result', 'Sack'], ['toggle', 'defFront', '4-3'],
    ['toggle', 'coverage', 'Cover 3'], ['set', 'down', '2'], ['set', 'distance', '8'], ['toggle', 'hash', 'Right'],
  ];
  const starts = [{}, { formation: 'Shotgun + Trips', backfield: '' }, { formation: 'Under Center + Flexbone', backfield: '', coverage: 'Cover 3 Match' }];
  out.agree = [];
  for (const start of starts) {
    const a = mk(10, clone(start)), b = mk(11, clone(start));
    t.plays = [a, b];
    // Old path: seed the fields from the play, then field + _saveField.
    t.selectPlay(10);
    for (const [kind, key, value] of ops) {
      if (kind === 'toggle') t.tagFields[key].toggle(value); else t.tagFields[key].value = value;
      t._saveField(key);
    }
    // New path.
    t.selectPlay(11);
    for (const [kind, key, value] of ops) (kind === 'toggle' ? t.toggleTagValue(key, value) : t.setTagValue(key, value));
    const strip = p => { const c = clone(p.tags); return c; };
    const A = strip(t.getPlay(10)), B = strip(t.getPlay(11));
    const differ = [...new Set([...Object.keys(A), ...Object.keys(B)])].filter(k => JSON.stringify(A[k]) !== JSON.stringify(B[k])).map(k => `${k}: old ${JSON.stringify(A[k])} api ${JSON.stringify(B[k])}`);
    out.agree.push({ start, same: !differ.length, differ });
  }
  return out;
});

console.log('\n== 1. The write rules ==');
ok(r.display.formation === 'Flexbone' && r.display.qb === 'Under Center', 'a legacy combined formation shows as its projected parts', JSON.stringify(r.display));
ok(r.promote.formation === 'Flexbone' && r.promote.qb === 'Under Center', 'writing the formation promotes the embedded QB alignment into its own field', JSON.stringify(r.promote));
ok(r.runPass === 'Run', 'an unambiguous play type fills Run/Pass', r.runPass);
ok(r.gain.result === 'Gain' && r.gain.yardage === '7', 'positive yardage with no result fills Gain', JSON.stringify(r.gain));
ok(r.sign.result === 'Loss' && r.sign.yardage === '-7' && r.sign.shown === '7', 'Loss replaces its rival Gain, signs the stored yardage, and shows the magnitude', JSON.stringify(r.sign));
ok(r.multiAdd === 'Loss + Fumble' && r.multiRemove === 'Loss', 'a multi-select chip adds and removes a combinable value', JSON.stringify([r.multiAdd, r.multiRemove]));
ok(r.singleSet === 'Left' && r.singleClear === '', 'a single-select chip sets, and a second tap clears', JSON.stringify([r.singleSet, r.singleClear]));
ok(r.people.player === '22' && r.people.grade === 1 && !r.peopleCleared.player && !r.peopleCleared.grade, 'players and grades trim, parse, and clear by removal', JSON.stringify(r));
ok(r.oneEmit === 1, 'one write is one play-updated emit (one undo step)', String(r.oneEmit));
ok(r.sit === false, 'a hand-entered down or distance marks the situation as the coach\'s', String(r.sit));

console.log('\n== 2. Old field path and new API agree ==');
for (const a of r.agree) ok(a.same, `identical plays from ${JSON.stringify(a.start)} through 14 operations`, a.differ.join(' | '));

console.log('\n== 3. Keyboard shortcuts write through the same API ==');
const kb = await page.evaluate(async () => {
  const app = window.app, t = app.tagger;
  t.plays = [{ id: 30, timestamp: { start: 0, end: 4 }, notes: '', annotations: [], tags: t.constructor.blankTags({ unit: 'offense' }) }];
  t.selectPlay(30);
  document.activeElement?.blur?.();
  const key = (code, shift = false) => document.body.dispatchEvent(new KeyboardEvent('keydown', { code, key: code.replace(/^(Key|Digit)/, '').toLowerCase(), shiftKey: shift, bubbles: true, cancelable: true }));
  key('Digit3', true); const down = t.getPlay(30).tags.down;
  key('Digit3', true); const downCleared = t.getPlay(30).tags.down;
  key('KeyR'); key('KeyQ'); const types = t.getPlay(30).tags.playType;
  key('KeyR'); const typesAfter = t.getPlay(30).tags.playType;
  key('KeyG'); key('KeyL'); const result = t.getPlay(30).tags.result;
  return { down, downCleared, types, typesAfter, result };
});
ok(kb.down === '3' && kb.downCleared === '', 'Shift+3 sets 3rd down and a second press clears it', JSON.stringify(kb));
ok(kb.types === 'Run Inside + RPO' && kb.typesAfter === 'RPO', 'R and Q build a multi-select play type; R again removes Run Inside', JSON.stringify(kb));
ok(kb.result === 'Loss', 'L replaces its rival Gain', JSON.stringify(kb));
ok(!errors.length, 'no page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
