/* Charting cutover, Step 1: the deck and Film Room behaviors of the owned fields
   (Formation, Receiver Distribution, Gap, motion path, RPO, QB run, Reverse), driven
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
  ok(at('formationFamily') > -1 && at('formationFamily') < at('qbAlignment') && at('qbAlignment') < at('backfield') && at('backfield') < at('receiverStrength') && at('receiverStrength') < at('receiverSet'), 'Formation, QB Alignment, Backfield and Receiver Strength precede Distribution', s.order.join());
  ok(!/optional/i.test(s.text) && !/select all/i.test(s.text), 'the deck carries no "optional" or "select all" subtext');
  ok(s.labels.some(l => /^Formation/.test(l)) && s.labels.some(l => /^Receiver Distribution/.test(l)) && s.labels.some(l => /^Play Direction/.test(l)), 'the fields are labeled Formation, Receiver Distribution and Play Direction');
  ok((await P.chips('receiverSet')).join() === '2x2,3x1,2x1,3x2,1x1,4x1,2x0,3x0', 'Receiver Distribution offers the distributions', (await P.chips('receiverSet')).join());
  const fam = await P.chips('formationFamily');
  ok(['Power-I', 'Split Back', 'Spread', 'Wing-T'].every(v => fam.includes(v)), 'the Family library offers Power-I and Split Back with the seeded vocabulary', fam.join());
  const heights = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-native-tagging] .gi-tag-chips button')].filter(b => b.getClientRects().length).map(b => Math.round(b.getBoundingClientRect().height)))]);
  ok(heights.join() === '27', 'every desktop chip is 27px tall', heights.join());
}

console.log('\n== 2. Family and Receiver Distribution are single selections ==');
{
  await P.chip('formationFamily', 'Spread'); await P.chip('receiverSet', '3x1'); await settle();
  let t = await P.tags();
  ok(t.formationFamily === 'Spread' && t.receiverSet === '3x1', 'each stores its own field', JSON.stringify([t.formationFamily, t.receiverSet]));
  await P.chip('formationFamily', 'Wing-T'); await settle(); t = await P.tags();
  ok(t.formationFamily === 'Wing-T' && t.receiverSet === '3x1' && (await P.active('formationFamily')).join() === 'Wing-T', 'choosing another Family replaces it and leaves the Receiver Distribution', JSON.stringify(t));
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
  ok(saved.formationFamily === 'Spread' && saved.receiverSet === '2x2' && saved.motion === 'Orbit' && saved.motionStart === 'Left' && saved.motionEnd === 'Right', 'a template carries Family, Receiver Distribution, motion and its path', JSON.stringify(saved));
  ok(!('gap' in saved) && !('rpoRead' in saved) && !('qbRun' in saved), 'and none of what happened on the snap');
  await P.select(6);
  const applied = await page.evaluate(() => { window.app.tagger.applyTemplate('Cutover Look'); const t = window.app.tagger.getCurrentPlay().tags; return [t.formationFamily, t.receiverSet, t.motion, t.motionStart, t.motionEnd]; });
  ok(applied.join() === 'Spread,2x2,Orbit,Left,Right', 'applying it fills the same fields', applied.join());
  const carry = await page.evaluate(() => { const tg = window.app.tagger; return { keys: tg.constructor.SCHEME_KEYS, carry: tg.constructor.CARRY_SCHEME_KEYS }; });
  ok(['formationFamily', 'receiverSet', 'motionStart', 'motionEnd'].every(k => carry.keys.includes(k)) && !carry.keys.includes('gap') && !carry.keys.includes('formation'), 'Same as Last copies the look and the path, never the gap');
}

console.log('\n== 7b. Changing a Play Call asks before it clears charting ==');
{
  await page.evaluate(() => {
    const pb = window.app.playbook;
    pb.add({ name: 'Sweep Left', concept: '', defaults: { playDir: 'Left' } });
    pb.add({ name: 'Sweep Right', concept: '', defaults: { playDir: 'Right' } });
    // Earlier sections charted these plays; a call never replaces what the coach charted, so start blank.
    for (const id of [2, 3]) window.app.tagger.getPlay(id).tags = window.app.tagger.constructor.blankTags({ unit: 'offense' });
  });
  const ask = expr => page.evaluate(expr => { window.__callResult = undefined; Promise.resolve(eval(expr)).then(r => { window.__callResult = r; }); }, expr);
  const result = () => page.evaluate(() => window.__callResult);
  // Chart.
  await P.select(2);
  await page.evaluate(() => { window.app.nativeTagging.selectPlayCall('Sweep Left'); window.app.nativeTagging.setField('gap', 'L-A'); });
  await settle();
  let t = await P.tags();
  ok(t.playCall === 'Sweep Left' && t.playDir === 'Left' && t.gap === 'L-A', 'Chart: a call sets its Direction and a Gap charts under it', JSON.stringify([t.playCall, t.playDir, t.gap]));
  await ask("window.app.nativeTagging.selectPlayCall('Sweep Right')"); await sleep(200);
  ok(/Gap L-A/.test(await P.dialog() || ''), 'Chart: a call that would clear the Gap asks and names it', String(await P.dialog()));
  await P.answer(false); await sleep(200);
  t = await P.tags();
  ok(await result() === false && t.playCall === 'Sweep Left' && t.playDir === 'Left' && t.gap === 'L-A', 'Chart: declining changes nothing', JSON.stringify([t.playCall, t.playDir, t.gap]));
  await ask("window.app.nativeTagging.selectPlayCall('Sweep Right')"); await sleep(200);
  await P.answer(true); await sleep(250);
  t = await P.tags();
  ok(t.playCall === 'Sweep Right' && t.playDir === 'Right' && t.gap === '', 'Chart: confirming applies the call and clears the Gap', JSON.stringify([t.playCall, t.playDir, t.gap]));
  // A call with nothing to clear applies at once.
  await page.evaluate(() => { window.app.nativeTagging.selectPlayCall('Sweep Left'); });
  await settle();
  ok(await page.evaluate(() => !document.querySelector('#ffaConfirmModal')) && (await P.tags()).playDir === 'Left', 'Chart: a call with nothing to clear applies without a prompt');
  // Film Room.
  await P.select(3);
  await page.evaluate(() => { const g = window.app.playGrid; g.nativeCommitEdit(3, 'playCall', 'Sweep Left'); g.nativeCommitEdit(3, 'gap', 'L-B'); });
  await settle();
  t = await P.tags();
  ok(t.playDir === 'Left' && t.gap === 'L-B', 'Film Room: the same call and Gap', JSON.stringify([t.playDir, t.gap]));
  await ask("window.app.playGrid.nativeCommitEdit(3, 'playCall', 'Sweep Right')"); await sleep(200);
  ok(/Gap L-B/.test(await P.dialog() || ''), 'Film Room: a call that would clear the Gap asks and names it', String(await P.dialog()));
  await P.answer(false); await sleep(200);
  t = await P.tags();
  ok(await result() === false && t.playCall === 'Sweep Left' && t.gap === 'L-B', 'Film Room: declining changes nothing', JSON.stringify([t.playCall, t.gap]));
  await ask("window.app.playGrid.nativeCommitEdit(3, 'playCall', 'Sweep Right')"); await sleep(200);
  await P.answer(true); await sleep(250);
  t = await P.tags();
  ok(t.playCall === 'Sweep Right' && t.playDir === 'Right' && t.gap === '', 'Film Room: confirming applies the call and clears the Gap', JSON.stringify([t.playCall, t.playDir, t.gap]));
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
  ok(labels.includes('Formation') && labels.includes('Receiver distribution') && !labels.includes('Receiver look'), 'the play detail lists Formation and distribution without Receiver Look', labels.join());
}

console.log('\n== 9. Special Teams keeps no offensive look ==');
{
  await P.select(1);
  ok(!(await P.chips('receiverLook')).length, 'no separate receiver look row remains');
  ok((await P.chips('receiverStrength')).join() === 'Left,Right,Balanced', 'Receiver Strength is independently available');
  for (const name of ['Twins','Trips','Bunch','Tight Bunch']) ok((await P.chips('formationFamily')).includes(name), name + ' is a Formation choice');
  await P.chip('receiverStrength', 'Left'); await P.chip('lineBalance', 'Unbalanced'); await P.chip('formationFamily', 'Tight Bunch'); await settle();
  let t = await P.tags();
  ok(t.formationFamily === 'Tight Bunch' && t.receiverStrength === 'Left' && t.lineBalance === 'Unbalanced', 'formation and strength are independent');
  await P.chip('formationFamily', 'Tight Bunch'); await settle();
  t = await P.tags();
  ok(t.formationFamily === '' && t.receiverStrength === 'Left' && !(await P.dialog()), 'clearing Formation keeps Receiver Strength without a confirmation');
  const r = await page.evaluate(() => {
    const app = window.app, p = app.tagger.getCurrentPlay(), grid = app.playGrid;
    const available = grid.nativeEditor(p.id, 'receiverStrength') !== null;
    grid.nativeCommitEdit(p.id, 'formationFamily', 'Bunch');
    grid.nativeCommitEdit(p.id, 'receiverStrength', 'Right');
    grid.nativeCommitEdit(p.id, 'lineBalance', 'Balanced');
    return { available, tags: p.tags };
  });
  ok(r.available && r.tags.formationFamily === 'Bunch' && r.tags.receiverStrength === 'Right' && r.tags.lineBalance === 'Balanced', 'Film Room edits independent formation and strengths');
  const carry = await page.evaluate(() => window.app.tagger.constructor.CARRY_SCHEME_KEYS);
  ok(['formationFamily','receiverStrength','lineBalance'].every(k => carry.includes(k)) && !carry.includes('receiverLook'), 'carry-forward owns only current fields');
  const csv = await page.evaluate(async () => {
    const app = window.app, storage = app.storage;
    const original = storage._download;
    let blob;
    try { storage._download = value => { blob = value; }; storage.exportCsv(); }
    finally { storage._download = original; }
    const text = await blob.text(), before = app.tagger.plays.length;
    const count = storage.applyPlayImport(storage.importPlaysFromText(text));
    const imported = app.tagger.plays[before], badBefore = app.tagger.plays.length;
    const refused = storage.applyPlayImport(storage.importPlaysFromText('Unit,Receiver Strength\noffense,Middle'));
    return { text, count, tags: imported?.tags, refused, unchanged: app.tagger.plays.length === badBefore };
  });
  ok(csv.count > 0 && csv.tags.formationFamily === 'Bunch' && csv.tags.receiverStrength === 'Right' && csv.tags.lineBalance === 'Balanced', 'CSV round trip preserves Formation and Receiver Strength');
  ok(csv.refused === 0 && csv.unchanged, 'invalid Receiver Strength is refused before writing');
}
{
  await P.select(1);
  await page.evaluate(() => { window.app.tagger.getCurrentPlay().tags.formationFamily = 'Spread'; window.app.tagger.getCurrentPlay().tags.receiverSet = '3x1'; });
  await page.evaluate(() => window.app.nativeTagging.setUnit('special')); await settle();
  const t = await P.tags();
  ok(t.formationFamily === '' && t.receiverSet === '' && !t.receiverLook && !t.receiverStrength && !t.lineBalance, 'a Special Teams play holds no offensive look fields', JSON.stringify(t));
  await page.evaluate(() => window.app.nativeTagging.setUnit('offense')); await settle();
}

ok(errors.length === 0, 'no page errors', errors.slice(0, 2).join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
