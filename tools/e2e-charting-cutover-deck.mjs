/* Charting cutover, Step 1: the deck and Film Room behaviors of the owned fields
   (Formation Family, Receiver Set, Gap, motion path, RPO, QB run, Reverse), driven
   through real clicks. GRIDIRON-IQ-PLAN-V2.md, "Approved Break Down charting comp -
   build contract". Run after build: node tools/e2e-charting-cutover-deck.mjs */
import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (value, label, detail = '') => value ? (pass++, console.log('  PASS  ' + label)) : (fail++, console.log('  FAIL  ' + label + (detail ? ' -- ' + detail : '')));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.nativeTagging && document.querySelector('[data-native-home]'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: 'Cutover Deck', team: 'Mavericks', year: '2026' });
  app.roster.loadFrom([{ num: '7', name: 'Miller', side: 'O' }, { num: '22', name: 'Jones', side: 'B' }]);
  const store = app.storage.seasonStore, game = store.activeGame();
  game.gameInfo = { ...(game.gameInfo || {}), opponent: 'Alpha', week: '1', gameType: 'game', perspective: 'offense' };
  const blank = () => app.tagger.constructor.blankTags({ unit: 'offense' });
  game.plays = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, timestamp: { start: i * 6, end: i * 6 + 5 }, notes: '', tags: blank() }));
  store.setActive(game.id); await store.persist(); await app.storage._loadActiveGame({ renderGames: false });
  app.tagger.selectPlay(1); await app.workspaceShell.show('breakdown');
  app.history.reset();
});
await sleep(400);

// Helpers run in the page.
const P = {
  tags: () => page.evaluate(() => JSON.parse(JSON.stringify(window.app.tagger.getCurrentPlay().tags))),
  select: id => page.evaluate(id => { window.app.tagger.selectPlay(id); window.app.history.reset(); }, id),
  entries: () => page.evaluate(() => window.app.history.stack.length),
  chip: (field, label) => page.evaluate((field, label) => {
    const group = document.querySelector(`[data-native-tagging] [data-native-field="${field}"]`);
    const button = group && [...group.querySelectorAll('button')].find(b => b.textContent.trim() === label);
    if (!button) return false; button.click(); return true;
  }, field, label),
  chips: field => page.evaluate(field => [...document.querySelectorAll(`[data-native-tagging] [data-native-field="${field}"] .gi-tag-chips button`)].map(b => b.textContent.trim()), field),
  active: field => page.evaluate(field => [...document.querySelectorAll(`[data-native-tagging] [data-native-field="${field}"] button.is-active`)].map(b => b.textContent.trim()), field),
  dialog: () => page.evaluate(() => { const d = document.querySelector('#ffaConfirmModal'); return d ? d.querySelector('.ffa-confirm-msg').textContent : null; }),
  answer: yes => page.evaluate(yes => { const d = document.querySelector('#ffaConfirmModal'); const b = d && (d.querySelector(yes ? '[data-act="ok"],[data-key="ok"],.btn-primary,.btn-danger' : '[data-act="cancel"],[data-key="cancel"]') || [...d.querySelectorAll('button')][yes ? 1 : 0]); if (b) b.click(); return !!b; }, yes),
};
const settle = () => sleep(120);

console.log('\n== 1. Fields, order and copy ==');
{
  const s = await page.evaluate(() => {
    const root = document.querySelector('[data-native-tagging]');
    const order = [...root.querySelectorAll('[data-native-field]')].map(n => n.dataset.nativeField);
    return { order, text: root.textContent, labels: [...root.querySelectorAll('.gi-tag-field-label')].map(n => n.textContent) };
  });
  const at = f => s.order.indexOf(f);
  ok(at('formationFamily') > -1 && at('formationFamily') < at('receiverSet') && at('receiverSet') < at('qbAlignment') && at('qbAlignment') < at('backfield'), 'Formation Family, Receiver Set, QB Alignment, Backfield are separate fields in that order', s.order.join());
  ok(!/optional/i.test(s.text) && !/select all/i.test(s.text), 'the deck carries no "optional" or "select all" subtext');
  ok(s.labels.some(l => /^Formation Family/.test(l)) && s.labels.some(l => /^Receiver Set/.test(l)) && s.labels.some(l => /^Play Direction/.test(l)), 'the fields are labeled Formation Family, Receiver Set and Play Direction');
  ok((await P.chips('receiverSet')).join() === '2x2,3x1,2x1,3x2,1x1,4x1,2x0,3x0', 'Receiver Set offers the distributions', (await P.chips('receiverSet')).join());
  const fam = await P.chips('formationFamily');
  ok(['Power-I', 'Split Back', 'Spread', 'Wing-T'].every(v => fam.includes(v)), 'the Family library offers Power-I and Split Back with the seeded vocabulary', fam.join());
  const heights = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-native-tagging] .gi-tag-chips button')].filter(b => b.getClientRects().length).map(b => Math.round(b.getBoundingClientRect().height)))]);
  ok(heights.join() === '27', 'every desktop chip is 27px tall', heights.join());
}

console.log('\n== 2. Family and Receiver Set are single selections ==');
{
  await P.chip('formationFamily', 'Spread'); await P.chip('receiverSet', '3x1'); await settle();
  let t = await P.tags();
  ok(t.formationFamily === 'Spread' && t.receiverSet === '3x1', 'each stores its own field', JSON.stringify([t.formationFamily, t.receiverSet]));
  await P.chip('formationFamily', 'Wing-T'); await settle(); t = await P.tags();
  ok(t.formationFamily === 'Wing-T' && t.receiverSet === '3x1' && (await P.active('formationFamily')).join() === 'Wing-T', 'choosing another Family replaces it and leaves the Receiver Set', JSON.stringify(t));
  await P.chip('formationFamily', 'Wing-T'); await settle(); t = await P.tags();
  ok(t.formationFamily === '', 'choosing the active Family clears it');
  await page.evaluate(() => { window.app.tagger.getCurrentPlay().tags.formationFamily = 'Beast'; window.app.tagger._emit('play-updated', window.app.tagger.getCurrentPlay()); });
  await settle();
  ok((await P.active('formationFamily')).join() === 'Beast', 'a stored Family the library does not offer is still shown, selected');
  await P.chip('formationFamily', 'Beast'); await P.chip('receiverSet', '3x1'); await settle();
}

console.log('\n== 3. Gap sits under Play Direction and follows it ==');
{
  await P.select(2);
  ok((await page.evaluate(() => !document.querySelector('[data-native-tagging] [data-native-field="gap"]'))), 'no Gap field before a direction is charted');
  await P.chip('playDir', 'Right'); await settle();
  const geo = await page.evaluate(() => {
    const dir = document.querySelector('[data-native-tagging] [data-native-field="playDir"]');
    const gap = document.querySelector('[data-native-tagging] [data-native-field="gap"]');
    const chips = gap ? [...gap.querySelectorAll('.gi-tag-chips button')] : [];
    const tops = new Set(chips.map(b => Math.round(b.getBoundingClientRect().top)));
    return { directlyBelow: !!gap && dir.nextElementSibling === gap, labels: chips.map(b => b.textContent.trim()), rows: tops.size, overflow: gap ? gap.scrollWidth - gap.clientWidth : 0, clipped: chips.some(b => b.scrollWidth > b.clientWidth + 1) };
  });
  ok(geo.directlyBelow, 'the Gap field opens immediately below Play Direction');
  ok(geo.labels.join() === 'L-A,L-B,L-C,L-D,R-A,R-B,R-C,R-D,Center,Other', 'ten choices in the approved order', geo.labels.join());
  ok(geo.rows === 1 && geo.overflow <= 1 && !geo.clipped, 'the ten choices sit in one desktop row without clipping', JSON.stringify(geo));
  await page.evaluate(() => window.app.history.reset());
  await P.chip('gap', 'L-B'); await settle();
  let t = await P.tags();
  ok(t.gap === 'L-B' && t.playDir === 'Left', 'a sided Gap sets its Play Direction', JSON.stringify([t.gap, t.playDir]));
  ok(await P.entries() === 1, 'the Gap and its direction are one undoable write', String(await P.entries()));
  await page.evaluate(() => window.app.history.undo()); await settle(); t = await P.tags();
  ok(t.gap === '' && t.playDir === 'Right', 'undo restores both fields together', JSON.stringify([t.gap, t.playDir]));
  await P.chip('gap', 'Center'); await settle(); t = await P.tags();
  ok(t.gap === 'Center' && t.playDir === 'Middle', 'Center sets Middle');
  await P.chip('gap', 'Other'); await settle(); t = await P.tags();
  ok(t.gap === 'Other' && t.playDir === 'Middle', 'Other leaves the direction alone');
  await P.chip('gap', 'L-C'); await settle();
  await page.evaluate(() => window.app.history.reset());
  await P.chip('playDir', 'Right'); await settle(); t = await P.tags();
  ok(t.playDir === 'Right' && t.gap === '' && (await P.dialog()) === null, 'choosing another direction clears a contradictory Gap at once, with no prompt', JSON.stringify(t));
  ok(await P.entries() === 1, 'and it is one undoable write');
  await P.chip('gap', 'R-A'); await settle();
  await page.evaluate(() => window.app.history.reset());
  await P.chip('playDir', 'Right'); await settle();   // removing the direction
  const message = await P.dialog();
  ok(!!message && /Gap R-A/.test(message), 'removing the direction under a charted Gap asks first and names what it clears', String(message));
  let now = await P.tags();
  ok(now.playDir === 'Right' && now.gap === 'R-A', 'nothing changes while the question is open');
  await P.answer(false); await settle(); now = await P.tags();
  ok(now.playDir === 'Right' && now.gap === 'R-A' && await P.entries() === 0, 'declining changes nothing and records nothing');
  await P.chip('playDir', 'Right'); await settle(); await P.answer(true); await settle(); now = await P.tags();
  ok(now.playDir === '' && now.gap === '' && await P.entries() === 1, 'confirming clears both in ONE undoable write', JSON.stringify(now) + ' entries ' + await P.entries());
  await page.evaluate(() => window.app.history.undo()); await settle(); now = await P.tags();
  ok(now.playDir === 'Right' && now.gap === 'R-A', 'undo brings the direction and the Gap back', JSON.stringify(now));
}

console.log('\n== 4. Motion path opens under Motion ==');
{
  await P.select(3);
  ok(await page.evaluate(() => !document.querySelector('[data-native-detail="motion"]')), 'no path before a Motion type');
  await P.chip('motion', 'Jet'); await settle();
  const geo = await page.evaluate(() => {
    const motion = document.querySelector('[data-native-tagging] [data-native-field="motion"]');
    const detail = document.querySelector('[data-native-detail="motion"]');
    return { below: !!detail && motion.nextElementSibling === detail, fields: detail ? [...detail.querySelectorAll('[data-native-field]')].map(n => n.dataset.nativeField) : [], side: detail ? (() => { const [a, b] = [...detail.querySelectorAll('[data-native-field]')].map(n => n.getBoundingClientRect()); return Math.abs(a.top - b.top) < 2; })() : false };
  });
  ok(geo.below && geo.fields.join() === 'motionStart,motionEnd' && geo.side, 'Starts and Ends open side by side directly below the Motion chips', JSON.stringify(geo));
  ok((await P.chips('motionStart')).join() === 'Left,Middle,Right', 'each uses the offense left / middle / right');
  await P.chip('motionStart', 'Left'); await P.chip('motionEnd', 'Right'); await settle();
  let t = await P.tags();
  ok(t.motionStart === 'Left' && t.motionEnd === 'Right' && t.motion === 'Jet', 'start and end are stored separately from the motion type', JSON.stringify([t.motion, t.motionStart, t.motionEnd]));
  await P.chip('motion', 'Orbit'); await settle(); t = await P.tags();
  ok(t.motion === 'Orbit' && t.motionStart === 'Left' && t.motionEnd === 'Right', 'changing the motion type keeps its path');
  await page.evaluate(() => window.app.history.reset());
  await P.chip('motion', 'Orbit'); await settle();
  const message = await P.dialog();
  ok(!!message && /Motion start Left/.test(message) && /Motion end Right/.test(message), 'removing Motion with a path asks first and names it', String(message));
  await P.answer(true); await settle(); t = await P.tags();
  ok(t.motion === '' && t.motionStart === '' && t.motionEnd === '' && await P.entries() === 1, 'confirming clears the motion and its path in one undoable write', JSON.stringify(t));
  await page.evaluate(() => window.app.history.undo()); await settle(); t = await P.tags();
  ok(t.motion === 'Orbit' && t.motionStart === 'Left' && t.motionEnd === 'Right', 'undo restores all three');
}

console.log('\n== 5. RPO details, and Run/Pass stays explicit ==');
{
  await P.select(4);
  await P.chip('playType', 'RPO'); await settle();
  const geo = await page.evaluate(() => {
    const type = document.querySelector('[data-native-tagging] [data-native-field="playType"]');
    const detail = document.querySelector('[data-native-detail="rpo"]');
    return { below: !!detail && type.nextElementSibling === detail, fields: detail ? [...detail.querySelectorAll('[data-native-field]')].map(n => n.dataset.nativeField) : [] };
  });
  ok(geo.below && geo.fields.join() === 'rpoRead,rpoDefender,rpoDecision', 'read, defender number and decision open directly below Play Type', JSON.stringify(geo));
  ok((await P.chips('rpoRead')).join() === 'End,Apex,Box,Other' && (await P.chips('rpoDecision')).join() === 'Give,Keep,Throw', 'the approved read and decision choices');
  let t = await P.tags();
  ok(t.runPass === '', 'choosing RPO does not fill Run/Pass');
  await P.chip('rpoRead', 'Apex'); await P.chip('rpoDecision', 'Throw');
  await page.evaluate(() => { const i = document.querySelector('[data-native-field="rpoDefender"] input'); i.value = '24'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await settle(); t = await P.tags();
  ok(t.rpoRead === 'Apex' && t.rpoDecision === 'Throw' && t.rpoDefender === '24' && t.runPass === '', 'read, decision and defender store separately; Run/Pass stays blank', JSON.stringify(t));
  ok(await page.evaluate(() => !document.querySelector('[data-rpo-conflict]')), 'no conflict is shown while Run/Pass is blank');
  await P.chip('runPass', 'Run'); await settle();
  const warned = await page.evaluate(() => document.querySelector('[data-rpo-conflict]')?.textContent || '');
  t = await P.tags();
  ok(/Throw is a pass/.test(warned) && t.runPass === 'Run', 'a Throw decision against an explicit Run shows a correction and overwrites nothing', warned);
  await page.evaluate(() => [...document.querySelectorAll('[data-rpo-conflict] button')].find(b => /Set Pass/.test(b.textContent))?.click());
  await settle(); t = await P.tags();
  ok(t.runPass === 'Pass' && !(await page.evaluate(() => document.querySelector('[data-rpo-conflict]'))), 'the correction sets Run/Pass on request and the warning clears');
  await page.evaluate(() => window.app.history.reset());
  await P.chip('playType', 'RPO'); await settle();
  const message = await P.dialog();
  ok(!!message && /RPO read Apex/.test(message) && /RPO defender 24/.test(message) && /RPO decision Throw/.test(message), 'removing RPO with details asks first and names them', String(message));
  await P.answer(true); await settle(); t = await P.tags();
  ok(t.playType === '' && t.rpoRead === '' && t.rpoDefender === '' && t.rpoDecision === '' && await P.entries() === 1, 'confirming clears the play type and its details in one undoable write', JSON.stringify(t));
}

console.log('\n== 6. QB Run and Reverse are Play Types ==');
{
  await P.select(5);
  ok((await P.chips('playType')).includes('QB Run') && (await P.chips('playType')).includes('Reverse'), 'QB Run and Reverse are chips in Play Type');
  await P.chip('playType', 'QB Run'); await settle();
  ok((await P.chips('qbRun')).join() === 'Designed,Scramble,RPO Keeper' && await page.evaluate(() => { const type = document.querySelector('[data-native-tagging] [data-native-field="playType"]'); return type.nextElementSibling?.dataset.nativeDetail === 'qbRun'; }), 'QB Run opens Designed / Scramble / RPO keeper directly below Play Type');
  await P.chip('qbRun', 'Scramble'); await P.chip('playType', 'RPO'); await settle();
  let t = await P.tags();
  ok(t.playType === 'QB Run + RPO' && t.qbRun === 'Scramble' && t.runPass === '', 'QB Run and RPO coexist and Run/Pass is still blank', JSON.stringify(t));
  ok(await page.evaluate(() => !!document.querySelector('[data-native-detail="rpo"]') && !!document.querySelector('[data-native-detail="qbRun"]')), 'both detail groups show');
  await P.chip('playType', 'RPO'); await settle(); await P.answer(true);   // no RPO details charted: no prompt expected
  await P.chip('playType', 'Reverse'); await settle(); t = await P.tags();
  ok(t.playType === 'QB Run + Reverse' && t.runPass === '', 'Reverse is selectable and does not classify the play', JSON.stringify(t));
  const stats = await page.evaluate(() => { const p = window.app.tagger.getCurrentPlay(), SE = window.app.stats.constructor; return { run: SE.isRun(p), pass: SE.isPass(p) }; });
  ok(!stats.run && !stats.pass, 'analytics leave it unclassified until the coach sets Run/Pass', JSON.stringify(stats));
  await P.chip('runPass', 'Run'); await settle();
  ok(await page.evaluate(() => window.app.stats.constructor.isRun(window.app.tagger.getCurrentPlay())), 'an explicit Run/Pass classifies it');
  await page.evaluate(() => { window.app.tagger.setTagValue('playType', ''); document.activeElement?.blur?.(); });
  await page.keyboard.press('KeyH'); await settle();
  ok((await P.tags()).playType === 'QB Run', 'H charts QB Run from the keyboard');
  await page.keyboard.press('KeyH'); await page.keyboard.press('KeyJ'); await settle();
  ok((await P.tags()).playType === 'Reverse', 'H toggles QB Run off and J charts Reverse');
}

console.log('\n== 7. Templates and carry ==');
{
  await P.select(3);   // Orbit with a path, from section 4
  await page.evaluate(() => { const t = window.app.tagger.getCurrentPlay().tags; t.formationFamily = 'Spread'; t.receiverSet = '2x2'; t.gap = ''; window.app.tagger._emit('play-updated', window.app.tagger.getCurrentPlay()); });
  const saved = await page.evaluate(async () => {
    const tg = window.app.tagger; tg._promptDialog = async () => 'Cutover Look';
    await tg.saveTemplate(); return tg._templateStore()['Cutover Look'];
  });
  ok(saved.formationFamily === 'Spread' && saved.receiverSet === '2x2' && saved.motion === 'Orbit' && saved.motionStart === 'Left' && saved.motionEnd === 'Right', 'a template carries Family, Receiver Set, motion and its path', JSON.stringify(saved));
  ok(!('gap' in saved) && !('rpoRead' in saved) && !('qbRun' in saved), 'and none of what happened on the snap');
  await P.select(6);
  const applied = await page.evaluate(() => { window.app.tagger.applyTemplate('Cutover Look'); const t = window.app.tagger.getCurrentPlay().tags; return [t.formationFamily, t.receiverSet, t.motion, t.motionStart, t.motionEnd]; });
  ok(applied.join() === 'Spread,2x2,Orbit,Left,Right', 'applying it fills the same fields', applied.join());
  const carry = await page.evaluate(() => { const tg = window.app.tagger; return { keys: tg.constructor.SCHEME_KEYS, carry: tg.constructor.CARRY_SCHEME_KEYS }; });
  ok(['formationFamily', 'receiverSet', 'motionStart', 'motionEnd'].every(k => carry.keys.includes(k)) && !carry.keys.includes('gap') && !carry.keys.includes('formation'), 'Same as Last copies the look and the path, never the gap');
}

console.log('\n== 8. Film Room edits the same fields ==');
{
  await page.evaluate(() => window.app.workspaceShell.show('breakdown'));
  const cols = await page.evaluate(() => window.app.playGrid.constructor.COLUMNS.map(c => c.key));
  ok(['formationFamily', 'receiverSet', 'motionStart', 'motionEnd', 'gap', 'rpoRead', 'rpoDefender', 'rpoDecision', 'qbRun'].every(k => cols.includes(k)) && !cols.includes('formation'), 'Film Room has a column for each owned field and none for the retired Formation');
  const r = await page.evaluate(async () => {
    const app = window.app, g = app.playGrid, tg = app.tagger;
    const mk = tags => { const id = Math.max(...tg.plays.map(p => p.id)) + 1; const play = { id, timestamp: { start: id, end: id + 1 }, notes: '', tags: { ...tg.constructor.blankTags({ unit: 'offense' }), ...tags } }; tg.plays.push(play); return play; };
    const out = {};
    const a = mk({ playType: 'Run Inside', runPass: 'Run' });
    out.lockedRead = g.nativeEditor(a.id, 'rpoRead');
    out.lockedStart = g.nativeEditor(a.id, 'motionStart');
    out.openGap = !!g.nativeEditor(a.id, 'gap');
    g.nativeCommitEdit(a.id, 'gap', 'L-A');
    out.gapEdit = [a.tags.gap, a.tags.playDir];
    g.nativeCommitEdit(a.id, 'playDir', 'Right');
    out.dirEdit = [a.tags.gap, a.tags.playDir];
    const b = mk({ playType: 'RPO', runPass: 'Pass', rpoRead: 'Box', rpoDecision: 'Give' });
    out.openRead = !!g.nativeEditor(b.id, 'rpoRead');
    tg.history = app.history; app.history.reset();
    const pending = g.nativeCommitEdit(b.id, 'playType', 'Short Pass');
    out.thenable = !!pending && typeof pending.then === 'function';
    out.beforeAnswer = [b.tags.playType, b.tags.rpoRead];
    window.__pending = pending; window.__b = b.id;
    out.message = document.querySelector('#ffaConfirmModal .ffa-confirm-msg')?.textContent || null;
    return out;
  });
  ok(r.lockedRead === null && r.lockedStart === null, 'a detail cell is locked while the field that opens it is blank');
  ok(r.openGap && r.gapEdit.join() === 'L-A,Left', 'a Gap edit sets the direction, as in Chart', r.gapEdit.join());
  ok(r.dirEdit.join() === ',Right', 'a contradicting direction edit clears the Gap, as in Chart', r.dirEdit.join());
  ok(r.openRead, 'an RPO detail cell opens where RPO is charted');
  ok(r.thenable && /RPO read Box/.test(r.message || '') && /RPO decision Give/.test(r.message || ''), 'removing RPO through Film Room asks first and names the details', String(r.message));
  ok(r.beforeAnswer.join() === 'RPO,Box', 'nothing changes while the question is open');
  await P.answer(true); await settle();
  const after = await page.evaluate(() => { const p = window.app.tagger.getPlay(window.__b); return [p.tags.playType, p.tags.rpoRead, p.tags.rpoDecision, window.app.history.stack.length]; });
  ok(after.join() === 'Short Pass,,,1', 'confirming edits the type and clears its details in one write', after.join());
  const sheet = await page.evaluate(() => { const app = window.app; app.tagger.selectPlay(1); const s = app.breakdownTheater?._playSheet?.(app.tagger.getPlay(1)) || null; return s && s.groups.map(g => [g.title, g.rows.map(r => r.label)]); });
  const labels = sheet ? sheet.flatMap(([, rows]) => rows) : [];
  ok(labels.includes('Formation family') && labels.includes('Receiver set') && !labels.includes('Formation'), 'the play detail lists Formation family and Receiver set', labels.join());
}

console.log('\n== 9. Special Teams keeps no offensive look ==');
{
  await P.select(1);
  await page.evaluate(() => { window.app.tagger.getCurrentPlay().tags.formationFamily = 'Spread'; window.app.tagger.getCurrentPlay().tags.receiverSet = '3x1'; });
  await page.evaluate(() => window.app.nativeTagging.setUnit('special')); await settle();
  const t = await P.tags();
  ok(t.formationFamily === '' && t.receiverSet === '', 'a Special Teams play holds no Formation Family or Receiver Set', JSON.stringify([t.formationFamily, t.receiverSet]));
  await page.evaluate(() => window.app.nativeTagging.setUnit('offense')); await settle();
}

ok(errors.length === 0, 'no page errors', errors.slice(0, 2).join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
