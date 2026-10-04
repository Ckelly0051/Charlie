/**
 * TRY CHARTING (coach, 2026-09-27). Driven through the real charting deck:
 *   - Attempt offers Kick XP, Run/Pass and Fake; a Fake is a run/pass try with
 *     isFake.
 *   - A run/pass try can score 1 (youth rules) or 2; a kick 1 or 2.
 *   - A kicked try has no Returner: Try (Kick) is Kicker only, Defending a Try
 *     (Kick) is Blocker only.
 *   - Run/Pass and Fake show the offensive options of an offensive snap (Try) or
 *     the defensive options of a defensive snap (Defending a Try), and the look
 *     is kept rather than stripped; Film Room locks none of its cells.
 *   - Switching back to Kick XP asks, then clears the run/pass detail.
 * The analytics exclusion is pinned in e2e-b2-tries.
 * Run:  node tools/e2e-st-try-charting.mjs
 */
import { APP_URL } from './app-entry.mjs';
import puppeteer from './test-browser.mjs';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log('  PASS  ' + label))
  : (fail++, console.log('  FAIL  ' + label + (detail ? ' -- ' + detail : '')));
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60)))));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); sessionStorage.setItem('seeded', '1'); } });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !!window.app?.teamHubScreen, { timeout: 15000 });

await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: 'Tries', team: 'Mavs', year: '2026' });
  const g = app.storage.seasonStore.activeGame();
  const mk = id => ({ id, timestamp: { start: id * 5, end: id * 5 + 4 }, notes: '', annotations: [], tags: { unit: 'special', custom: [], players: {}, grades: {} } });
  g.plays = [mk(1), mk(2)];
  g.nextId = 3;
  app.tagger.plays = g.plays; app.tagger.nextId = 3; app.tagger._emit('plays-loaded');
  await app.storage.commitActive();
  await app.workspaceShell.show('breakdown');
  app.tagger.selectPlay(1);
});
await settle(page);

const choose = async (label, text) => {
  const done = await page.evaluate((label, text) => {
    const box = [...document.querySelectorAll(`[data-native-choice="${label}"]`)].at(-1);
    const btn = [...(box?.querySelectorAll('button') || [])].find(b => b.textContent.trim() === text);
    if (!btn) return false;
    btn.scrollIntoView({ block: 'center' }); btn.click(); return true;
  }, label, text);
  await settle(page);
  return done;
};
const chip = async (field, text) => {
  await page.evaluate((field, text) => { const btn = [...document.querySelectorAll(`[data-native-field="${field}"] button`)].find(b => b.textContent.trim() === text); btn?.scrollIntoView({ block: 'center' }); btn?.click(); }, field, text);
  await settle(page);
};
const view = () => page.evaluate(() => {
  const app = window.app, play = app.tagger.getCurrentPlay();
  const groups = [...document.querySelectorAll('[data-native-tagging] details.gi-tag-group > summary strong')].map(s => s.textContent.trim());
  const roles = [...document.querySelectorAll('.gi-tag-players > div > strong')].map(s => s.textContent.trim());
  const attempt = [...document.querySelectorAll('[data-native-choice="Attempt"] button')].map(b => b.textContent.trim());
  const active = [...document.querySelectorAll('[data-native-choice="Attempt"] button.is-active')].map(b => b.textContent.trim());
  const points = [...document.querySelectorAll('[data-native-choice="Points awarded"] button')].map(b => b.textContent.trim());
  const Grid = app.playGrid.constructor;
  return { groups, roles, attempt, active, points, tags: { ...play.tags, players: { ...(play.tags.players || {}) } }, st: play.specialTeams,
    locked: { offense: Grid.cellLocked(play, { unit: 'offense' }), defense: Grid.cellLocked(play, { unit: 'defense' }) } };
});

console.log('\n== 1. Try: attempt choices and a kicked try ==');
ok(await choose('Unit', 'Try'), 'the Special Teams unit Try is chosen');
ok(await choose('Attempt', 'Kick XP'), 'Kick XP is chosen');
let v = await view();
ok(v.attempt.join('|') === 'Kick XP|Run/Pass|Fake', 'Attempt offers Kick XP, Run/Pass and Fake', JSON.stringify(v.attempt));
ok(v.roles.join('|') === 'Kicker', 'a kicked try offers Kicker only, no Returner', JSON.stringify(v.roles));
ok(!v.groups.includes('Formation & Call') && !v.groups.includes('Play & Result'), 'a kicked try shows no offensive options', JSON.stringify(v.groups));
ok(v.locked.offense && v.locked.defense, 'Film Room locks the look cells on a kicked try', JSON.stringify(v.locked));

console.log('\n== 2. Run/Pass: offensive options, look kept, 1 or 2 points ==');
await choose('Attempt', 'Run/Pass');
v = await view();
ok(v.st.attemptType === 'twoPoint' && !v.st.isFake && v.active.join() === 'Run/Pass', 'Run/Pass stores a run/pass try', JSON.stringify({ a: v.st.attemptType, f: v.st.isFake, active: v.active }));
ok(['Formation & Call', 'Defense Faced', 'Play & Result'].every(g => v.groups.includes(g)), 'the offensive options of an offensive snap appear', JSON.stringify(v.groups));
ok(v.roles.join('|') === 'Ball Carrier|Passer|Receiver', 'the roles are Ball Carrier, Passer and Receiver', JSON.stringify(v.roles));
ok(!v.locked.offense && !v.locked.defense, 'Film Room locks no look cell on a run/pass try', JSON.stringify(v.locked));
await chip('formationFamily', 'Spread'); await chip('runPass', 'Run');
await page.evaluate(() => window.app.nativeTagging.setPlayer('ballCarrier', '22'));
await choose('Official result', 'Converted');
await settle(page);
v = await view();
ok(v.tags.formationFamily === 'Spread' && v.tags.runPass === 'Run' && v.tags.players.ballCarrier === '22', 'the formation, run/pass and ball carrier are kept, not stripped', JSON.stringify({ f: v.tags.formationFamily, rp: v.tags.runPass, bc: v.tags.players.ballCarrier }));
ok(v.points.join('|') === '1 Point|2 Points' && v.st.outcome.score === 'twoPoint', 'a converted run/pass try offers 1 or 2 points and defaults to 2', JSON.stringify({ points: v.points, score: v.st.outcome.score }));
await choose('Points awarded', '1 Point');
v = await view();
ok(v.st.outcome.score === 'extraPoint', 'a run/pass try can be charted for 1 point', JSON.stringify(v.st.outcome));
const saved = await page.evaluate(async () => { await window.app.storage.commitActive(); const g = window.app.storage.seasonStore.activeGame(); const p = g.plays.find(x => x.id === 1); return { formationFamily: p.tags.formationFamily, score: p.specialTeams.outcome.score }; });
ok(saved.formationFamily === 'Spread' && saved.score === 'extraPoint', 'the look and the 1 point survive a save', JSON.stringify(saved));

console.log('\n== 3. Fake ==');
await choose('Attempt', 'Fake');
v = await view();
ok(v.st.attemptType === 'twoPoint' && v.st.isFake === true && v.active.join() === 'Fake', 'Fake is a run/pass try marked fake', JSON.stringify({ a: v.st.attemptType, f: v.st.isFake, active: v.active }));
ok(v.groups.includes('Play & Result') && v.tags.formationFamily === 'Spread', 'a Fake keeps the offensive options and the look', JSON.stringify({ groups: v.groups, f: v.tags.formationFamily }));

console.log('\n== 4. Back to Kick XP asks, then clears the run/pass detail ==');
await choose('Attempt', 'Kick XP');
const asked = await page.evaluate(() => document.querySelector('#ffaConfirmModal .ffa-confirm-msg')?.textContent || '');
ok(/Kick XP/.test(asked), 'a confirmation names the change', asked);
await page.click('#ffaConfirmModal [data-act="cancel"]'); await settle(page);
v = await view();
ok(v.st.attemptType === 'twoPoint' && v.tags.formationFamily === 'Spread', 'Cancel keeps the run/pass try untouched', JSON.stringify({ a: v.st.attemptType, f: v.tags.formationFamily }));
await choose('Attempt', 'Kick XP');
await page.click('#ffaConfirmModal [data-act="ok"]'); await settle(page);
v = await view();
ok(v.st.attemptType === 'extraPoint' && !v.st.isFake, 'confirming makes it a kicked try', JSON.stringify({ a: v.st.attemptType, f: v.st.isFake }));
ok(!v.tags.formationFamily && !v.tags.runPass && !v.tags.players.ballCarrier, 'the look, run/pass and ball carrier are cleared', JSON.stringify({ f: v.tags.formationFamily, rp: v.tags.runPass, bc: v.tags.players.ballCarrier }));
ok(v.roles.join('|') === 'Kicker', 'the roles return to Kicker only', JSON.stringify(v.roles));

console.log('\n== 5. Defending a Try ==');
await page.evaluate(() => window.app.tagger.selectPlay(2)); await settle(page);
await choose('Unit', 'Defending a Try');
await choose('Attempt', 'Kick XP');
v = await view();
ok(v.roles.join('|') === 'Blocker', 'defending a kicked try offers Blocker only', JSON.stringify(v.roles));
await page.evaluate(() => window.app.nativeTagging.setPlayer('blocker', '90')); await settle(page);
v = await view();
ok(v.st.players.blocker === '90', 'the blocker is recorded on the Special Teams event', JSON.stringify(v.st.players));
await choose('Attempt', 'Run/Pass');
v = await view();
ok(v.groups.indexOf('Our Defensive Call') >= 0 && v.groups.indexOf('Our Defensive Call') < v.groups.indexOf('Offense Faced') && v.groups.includes('Play & Result'),
  'defending a run/pass try shows the defensive options, our call first', JSON.stringify(v.groups));
ok(v.roles.join('|') === 'Tackler(s)|Takeaway', 'the roles are Tackler(s) and Takeaway', JSON.stringify(v.roles));
await chip('defFront', '4-3');
v = await view();
ok(v.tags.defFront === '4-3', 'the defensive call is kept, not stripped', JSON.stringify(v.tags.defFront));

console.log('\n== 6. Codex review of 67d1ee0 ==');
// P2: switching between Run/Pass and Fake keeps a charted score.
await page.evaluate(async () => {
  const app = window.app, g = app.storage.seasonStore.activeGame();
  const mk = id => ({ id, timestamp: { start: id * 5, end: id * 5 + 4 }, notes: '', annotations: [], tags: { unit: 'special', custom: [], players: {}, grades: {} } });
  g.plays.push(mk(3), mk(4)); app.tagger.plays = g.plays; app.tagger.nextId = 5; app.tagger._emit('plays-loaded');
  app.tagger.selectPlay(3);
});
await settle(page);
await choose('Unit', 'Try'); await choose('Attempt', 'Run/Pass'); await choose('Official result', 'Converted'); await choose('Points awarded', '1 Point');
await choose('Attempt', 'Fake');
v = await view();
ok(v.st.isFake === true && v.st.outcome.score === 'extraPoint', 'Run/Pass to Fake keeps a charted 1 point', JSON.stringify(v.st.outcome));
await choose('Attempt', 'Run/Pass');
v = await view();
ok(v.st.isFake === false && v.st.outcome.score === 'extraPoint', 'Fake back to Run/Pass keeps it too', JSON.stringify(v.st.outcome));
// P1: a play switch during the Kick XP confirmation changes only the play it asked about.
await page.evaluate(() => window.app.tagger.selectPlay(4)); await settle(page);
await choose('Unit', 'Try'); await choose('Attempt', 'Run/Pass'); await chip('formationFamily', 'Wing-T');
await page.evaluate(() => window.app.tagger.selectPlay(3)); await settle(page);
await chip('formationFamily', 'Spread'); await chip('runPass', 'Pass');
await choose('Attempt', 'Kick XP');
const askedFor = await page.evaluate(() => !!document.querySelector('#ffaConfirmModal'));
await page.evaluate(() => window.app.tagger.selectPlay(4)); await settle(page);
await page.click('#ffaConfirmModal [data-act="ok"]'); await settle(page); await settle(page);
const both = await page.evaluate(() => {
  const p = id => window.app.tagger.getPlay(id);
  const pick = x => ({ attempt: x.specialTeams?.attemptType, formationFamily: x.tags.formationFamily, runPass: x.tags.runPass });
  return { three: pick(p(3)), four: pick(p(4)) };
});
ok(askedFor, 'the confirmation opened for play 3', String(askedFor));
ok(both.three.attempt === 'extraPoint' && !both.three.formationFamily && !both.three.runPass, 'the play the confirmation named becomes Kick XP and is cleared', JSON.stringify(both.three));
ok(both.four.attempt === 'twoPoint' && both.four.formationFamily === 'Wing-T', 'the play selected during the confirmation is untouched', JSON.stringify(both.four));

console.log('\n== 7. Special Teams roster ownership ==');
await page.evaluate(() => {
  const app = window.app;
  app.roster.players = [{ num: '22', name: 'Our Specialist', side: 'B' }];
  const g = app.storage.seasonStore.activeGame();
  for (let id = 10; id < 16; id++) g.plays.push({ id, timestamp: { start: id * 5, end: id * 5 + 4 }, notes: '', annotations: [],
    tags: { unit: 'special', custom: [], players: {}, grades: {} } });
  app.tagger.plays = g.plays; app.tagger.nextId = 16; app.tagger._emit('plays-loaded');
});
for (const [i, unit, ownRole, opponentRole] of [
  [10, 'Kick Return', 'returner', 'kicker'], [11, 'Punt Return / Block', 'returner', 'kicker'],
  [12, 'Kickoff', 'kicker', 'returner'], [13, 'Punt', 'kicker', 'returner'],
  [14, 'Field Goal', 'kicker', 'returner'], [15, 'Field Goal Block', 'returner', 'kicker'],
]) {
  await page.evaluate(id => window.app.tagger.selectPlay(id), i); await settle(page);
  ok(await choose('Unit', unit), `${unit}: unit selected`);
  const pickers = await page.evaluate(({ ownRole, opponentRole }) => {
    const row = role => document.querySelector(`[aria-label="${role} player number"]`)?.parentElement;
    return { own: ownRole ? !!row(ownRole)?.querySelector('.gi-player-roster-toggle') : true,
      ownOpen: ownRole ? row(ownRole)?.querySelector('.gi-player-roster-toggle')?.getAttribute('aria-expanded') === 'true' : true,
      opponent: !!row(opponentRole)?.querySelector('.gi-player-roster-toggle'),
      opponentLabel: row(opponentRole)?.querySelector('strong')?.textContent.trim(),
      buttons: row(opponentRole)?.querySelectorAll('.gi-player-quick button').length || 0 };
  }, { ownRole, opponentRole });
  ok(pickers.own && !pickers.opponent && pickers.buttons === 0,
    `${unit}: only our specialist can pick from our roster`, JSON.stringify(pickers));
  ok(pickers.ownOpen && pickers.opponentLabel?.startsWith('Opponent '),
    `${unit}: our picker opens by default and the opposing role is named`, JSON.stringify(pickers));
  if (['Kick Return', 'Punt Return / Block', 'Field Goal Block'].includes(unit)) {
    const layout = await page.evaluate(() => ({
      roles: [...document.querySelectorAll('.gi-tag-players > div > strong')].map(n => n.textContent.trim()),
      blockers: [...document.querySelectorAll('[data-native-tagging] input')].filter(input =>
        input.getAttribute('aria-label') === 'blocker player number' || input.closest('label')?.textContent.includes('Blocker #')).length,
    }));
    ok(layout.roles.join('|') === 'Opponent Kicker|Returner', `${unit}: approved Kicker then Returner order is unchanged`, JSON.stringify(layout));
    if (unit === 'Field Goal Block') ok(layout.blockers === 1, 'Field Goal Block has exactly one Blocker input', JSON.stringify(layout));
  }
}
await page.evaluate(() => window.app.tagger.selectPlay(10)); await settle(page);
await page.evaluate(() => {
  const kicker = document.querySelector('[aria-label="kicker player number"]');
  kicker.value = '99'; kicker.dispatchEvent(new Event('change', { bubbles: true }));
});
await settle(page);
await page.evaluate(() => {
  const row = document.querySelector('[aria-label="returner player number"]').parentElement;
  const toggle = row.querySelector('.gi-player-roster-toggle');
  if (toggle?.getAttribute('aria-expanded') !== 'true') toggle?.click();
});
await settle(page);
const attribution = await page.evaluate(() => {
  const input = document.querySelector('[aria-label="returner player number"]');
  const button = [...input.parentElement.querySelectorAll('.gi-player-quick button')].find(b => b.textContent.trim() === '22');
  button?.click();
  return { picked: !!button, players: { ...window.app.tagger.getCurrentPlay().tags.players } };
});
ok(attribution.picked && attribution.players.kicker === '99' && attribution.players.returner === '22',
  'Kick Return preserves a manually charted opposing kicker and quick-picks our returner', JSON.stringify(attribution));

console.log('\n== 8. Review: scout labels and role stability ==');
await page.evaluate(() => {
  window.app.storage.gameInfo.perspective = 'scout';
  window.app.nativeTagging._queuePublish();
});
await settle(page);
const scoutLabel = await page.$eval('[aria-label="kicker player number"]', input => input.parentElement.querySelector('strong').textContent.trim());
ok(scoutLabel === 'Other team Kicker', 'scout receiving unit names the other team kicker', scoutLabel);
await page.evaluate(() => { window.app.storage.gameInfo.perspective = 'offense'; window.app.nativeTagging._queuePublish(); });
await settle(page);
for (const [id, role, unit, attempt] of [[15, 'returner', 'Field Goal Block', null], [2, 'tackler', 'Defending a Try', 'Run/Pass'], [4, 'ballCarrier', 'Try', 'Run/Pass']]) {
  await page.evaluate(id => window.app.tagger.selectPlay(id), id); await settle(page);
  await choose('Unit', unit);
  if (attempt) await choose('Attempt', attempt);
  await page.evaluate(() => window.app.nativeTagging.setField('quarter', '3'));
  await settle(page);
  const active = await page.evaluate(() => ({ role: window.app.roster.activeRole,
    labels: [...document.querySelectorAll('.gi-tag-players > .is-active > strong')].map(n => n.textContent.trim()) }));
  ok(active.role === role && active.labels.length === 1 && !active.labels[0].startsWith('Opponent'),
    `play ${id}: ${role} stays active after an edit`, JSON.stringify(active));
}
await page.evaluate(() => window.app.tagger.selectPlay(2)); await settle(page);
await choose('Attempt', 'Kick XP');
if (await page.$('#ffaConfirmModal [data-act="ok"]')) await page.click('#ffaConfirmModal [data-act="ok"]');
await settle(page);
await page.evaluate(() => window.app.nativeTagging.setField('quarter', '4'));
await settle(page);
const kickDefenseRole = await page.evaluate(() => ({ role: window.app.roster.activeRole,
  active: document.querySelector('.gi-tag-players > .is-active > strong')?.textContent.trim() }));
ok(kickDefenseRole.role === 'blocker' && kickDefenseRole.active === 'Blocker',
  'defending a kicked try keeps Blocker active after an edit', JSON.stringify(kickDefenseRole));

ok(errors.length === 0, 'no page or console errors', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
