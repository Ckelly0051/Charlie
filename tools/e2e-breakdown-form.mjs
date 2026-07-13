import puppeteer from 'puppeteer';

const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
let pass = 0, fail = 0;
const ok = (value, label, extra = '') => value ? (pass++, console.log(`  PASS  ${label}`)) : (fail++, console.log(`  FAIL  ${label}${extra ? ` -- ${extra}` : ''}`));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });

const classic = await browser.newPage();
await classic.goto(URL, { waitUntil: 'networkidle0' });
ok(!(await classic.$eval('#tagForm', form => form.classList.contains('breakdown-form-v2'))), 'Classic tag form is unchanged when the Phase 4C flag is off');
ok((await classic.$$('#tagForm .bdv-section-label')).length === 0, 'Flag-off mode injects no redesigned form markup');
await classic.close();

const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.setViewport({ width: 1280, height: 800 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_breakdown_form_v2', '1'));
await page.goto(URL, { waitUntil: 'networkidle0' });

let state = await page.evaluate(() => ({
  mounted: document.querySelector('#tagForm').classList.contains('breakdown-form-v2'),
  sections: [...document.querySelectorAll('.bdv-section-label strong')].map(el => el.textContent),
  required: ['tagUnit','tagDown','tagDistance','tagFormation','tagBackfield','tagStrength','tagPersonnel','tagMotion','tagRunPass','tagPlayType','tagPlayDir','tagResult','tagYardage','tagDefFront','tagCoverage','tagBlitz','tagStType','tagScoreFor','tagKickOutcome','tagKickDistance','tagHangTime','tagReturnYards','tagKickedTo','tagPlayerKicker','tagPlayerReturner','tagPlayersSection','tagPlayerBC','tagPlayerPasser','tagPlayerReceiver','tagPlayerTackler','tagPlayerTakeaway','customFieldsSection','notesArea','tagHash','tagQuarter','tagFieldSide','tagYardLine','tagDriveNumber','customTagInput','autoDDToggle','templateSelect'].every(id => !!document.getElementById(id)),
  offense: document.querySelector('.group-offense .tag-group-head').textContent.trim(),
  defense: document.querySelector('.group-defense .tag-group-head').textContent.trim(),
}));
ok(state.mounted && state.sections.length === 4, 'Flag-on mode composes four football sections over the live form', JSON.stringify(state));
ok(state.required, 'Every production offense, defense, player, custom, note, and situation control remains present');
ok(/^Our Offensive Look/.test(state.offense) && /^Defense Faced/.test(state.defense), 'Offense self-scout uses subject-correct section labels', JSON.stringify(state));
state = await page.evaluate(() => ({
  visible: [...document.querySelectorAll('#tagPlayersSection .player-role')].filter(el => getComputedStyle(el).display !== 'none').map(el => el.dataset.role),
  detail: document.querySelector('[data-bdv-section="people"] span').textContent,
}));
ok(state.visible.join(',') === 'ballCarrier,passer,receiver' && /ball carrier/.test(state.detail), 'Offense exposes only its three relevant shared player roles', JSON.stringify(state));

await page.evaluate(() => {
  const play = { id: 901, timestamp: { start: 0, end: 5 }, tags: { unit: 'offense', formation: '', backfield: '', strength: '', personnel: '', motion: '', runPass: '', playType: '', playDir: '', result: '', yardage: '', players: {}, grades: {}, custom: [] } };
  window.app.tagger.plays = [play];
  window.app.tagger.currentPlayId = play.id;
  window.app.tagger._loadTagForm(play);
  document.querySelector('#tagPlayerBC').value = '22';
  document.querySelector('#tagPlayerBC').dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('#tagFormation .pick[data-value="Shotgun"]').click();
});
ok((await page.evaluate(() => window.app.tagger.plays[0].tags.formation)) === 'Shotgun', 'Recomposition preserves the existing chip listener and tag-save path');

await page.evaluate(() => document.querySelector('#tagUnit .pick[data-value="defense"]').click());
await page.waitForFunction(() => document.querySelector('#tagForm').classList.contains('mode-defense'));
state = await page.evaluate(() => ({
  perspective: document.querySelector('#bdvPerspective').textContent,
  defense: document.querySelector('.group-defense .tag-group-head').textContent.trim(),
  offense: document.querySelector('.group-offense .tag-group-head').textContent.trim(),
  unit: window.app.tagger.plays[0].tags.unit,
}));
ok(state.unit === 'defense' && /Defense/.test(state.perspective), 'Existing unit toggle still writes the play and updates composition');
ok(/^Our Defensive Call/.test(state.defense) && /^Offense Faced/.test(state.offense), 'Defense leads with our call and labels the opponent look correctly', JSON.stringify(state));
state = await page.evaluate(() => ({
  visible: [...document.querySelectorAll('#tagPlayersSection .player-role')].filter(el => getComputedStyle(el).display !== 'none').map(el => el.dataset.role),
  active: document.querySelector('#tagPlayersSection .player-role.active')?.dataset.role,
  retained: window.app.tagger.plays[0].tags.players.ballCarrier,
  detail: document.querySelector('[data-bdv-section="people"] span').textContent,
}));
ok(state.visible.join(',') === 'tackler,takeaway' && state.active === 'tackler' && /tackles/.test(state.detail), 'Defense exposes Tackler/Takeaway and defaults quick-picks to Tackler', JSON.stringify(state));
ok(state.retained === '22', 'Switching units hides but never clears an existing offensive player assignment');

state = await page.evaluate(() => {
  const primary = document.querySelector('.group-defense');
  const secondary = document.querySelector('.group-offense');
  primary.querySelector('.tag-group-head').click();
  const primaryBodyVisible = getComputedStyle(primary.querySelector('.tag-group-body')).display !== 'none';
  const secondaryStartedCollapsed = getComputedStyle(secondary.querySelector('.tag-group-body')).display === 'none';
  secondary.querySelector('.tag-group-head').click();
  const secondaryOpened = getComputedStyle(secondary.querySelector('.tag-group-body')).display !== 'none';
  return { primaryBodyVisible, secondaryStartedCollapsed, secondaryOpened };
});
ok(state.primaryBodyVisible && state.secondaryStartedCollapsed && state.secondaryOpened, 'Primary form stays open while the faced group remains intentionally collapsible', JSON.stringify(state));

await page.evaluate(() => {
  const perspective = document.querySelector('#gamePerspective');
  perspective.value = 'scout';
  perspective.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForFunction(() => /Opponent scout/.test(document.querySelector('#bdvPerspective')?.textContent || ''));
state = await page.evaluate(() => ({
  perspective: document.querySelector('#bdvPerspective').textContent,
  defense: document.querySelector('.group-defense .tag-group-head').textContent.trim(),
}));
ok(/Opponent scout/.test(state.perspective) && /^Opponent Defensive Call/.test(state.defense), 'Opponent scout labels the opponent as the analytics subject');

await page.evaluate(() => document.querySelector('#tagUnit .pick[data-value="special"]').click());
await page.waitForFunction(() => document.querySelector('#tagForm').classList.contains('mode-special'));
state = await page.evaluate(() => ({
  perspective: document.querySelector('#bdvPerspective').textContent,
  primary: document.querySelector('[data-bdv-section="look"] strong').textContent,
  specialVisible: getComputedStyle(document.querySelector('.group-special')).display !== 'none',
  offenseHidden: getComputedStyle(document.querySelector('.group-offense')).display === 'none',
  defenseHidden: getComputedStyle(document.querySelector('.group-defense')).display === 'none',
  sharedPlayersHidden: getComputedStyle(document.querySelector('#tagPlayersSection')).display === 'none',
  specialistPlayersVisible: getComputedStyle(document.querySelector('.group-special .player-roles')).display !== 'none',
  activeRole: document.querySelector('.group-special .player-role.active')?.dataset.role,
  unit: window.app.tagger.plays[0].tags.unit,
}));
ok(state.unit === 'special' && /Opponent scout · Special Teams/.test(state.perspective), 'Special Teams preserves the live unit-save path and subject context', JSON.stringify(state));
ok(state.primary === 'Opponent Special Teams' && state.specialVisible && state.offenseHidden && state.defenseHidden, 'Special Teams exposes its complete phase group without competing side groups', JSON.stringify(state));
ok(state.sharedPlayersHidden && state.specialistPlayersVisible && state.activeRole === 'kicker', 'Special Teams uses its dedicated Kicker/Returner block without duplicate shared roles', JSON.stringify(state));

state = await page.evaluate(() => ({
  editor: !!document.querySelector('.bdv-st-editor'),
  unitChoices: document.querySelectorAll('[data-st-unit]').length,
  legacyScoreHidden: getComputedStyle(document.querySelector('#tagScoreFor').closest('.chip-section')).display === 'none',
  structuredBefore: window.app.tagger.plays[0].specialTeams || null,
}));
ok(state.editor && state.unitChoices === 6 && state.legacyScoreHidden, 'Redesigned Special Teams exposes six units and hides the legacy Scored-by control', JSON.stringify(state));
ok(state.structuredBefore === null, 'Changing the play unit to Special Teams does not invent structured details');

await page.evaluate(() => document.querySelector('[data-st-unit="puntReturn"]').click());
await page.evaluate(() => {
  document.querySelector('[data-st-outcome="returned"]').click();
  document.querySelector('[data-st-score="touchdown"]').click();
  const yds = document.querySelector('[data-st-input="return-yards"]');
  yds.value = '-3'; yds.dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('[data-st-spot-side="end:own"]').click();
  const end = document.querySelector('[data-st-input="end-yard"]');
  end.value = '12'; end.dispatchEvent(new Event('change', { bubbles: true }));
  const returner = document.querySelector('#tagPlayerReturner');
  returner.value = '4'; returner.dispatchEvent(new Event('change', { bubbles: true }));
});
state = await page.evaluate(() => {
  const play = window.app.tagger.plays[0];
  return { st: play.specialTeams, legacy: { stType: play.tags.stType || '', outcome: play.tags.kickOutcome || '', scoreFor: play.tags.scoreFor || '' } };
});
ok(state.st.unit === 'puntReturn' && state.st.subjectRole === 'receiving' && state.st.outcome.status === 'returned' && state.st.outcome.score === 'touchdown', 'Punt Return writes a normalized phase, role, outcome, and score', JSON.stringify(state));
ok(state.st.return.yards === -3 && state.st.return.end.fieldSide === 'own' && state.st.return.end.yardLine === '12', 'Structured return and end-spot fields preserve a negative return', JSON.stringify(state));
ok(state.st.players.returner === '4' && state.legacy.stType === '' && state.legacy.outcome === '' && state.legacy.scoreFor === '', 'Specialist sync writes structured player data and never writes legacy ST fields', JSON.stringify(state));

await page.evaluate(() => document.querySelector('[data-st-unit="fieldGoal"]').click());
await page.waitForSelector('#ffaConfirmModal');
await page.click('#ffaConfirmModal [data-act="cancel"]');
ok((await page.evaluate(() => window.app.tagger.plays[0].specialTeams.unit)) === 'puntReturn', 'Cancelling a unit change preserves existing structured details');
await page.evaluate(() => document.querySelector('[data-st-unit="fieldGoal"]').click());
await page.waitForSelector('#ffaConfirmModal');
await page.click('#ffaConfirmModal [data-act="ok"]');
await page.evaluate(() => {
  document.querySelector('[data-st-attempt="extraPoint"]').click();
  document.querySelector('[data-st-outcome="good"]').click();
});
state = await page.evaluate(() => {
  const play = window.app.tagger.plays[0];
  return { st: play.specialTeams, points: window.app.stats.constructor.playPoints(play), side: window.app.stats.constructor.scoringSide(play) };
});
ok(state.st.attemptType === 'extraPoint' && state.st.outcome.score === 'extraPoint' && state.points === 1 && state.side === 'us', 'Extra Point + Good derives structured scoring without Scored-by', JSON.stringify(state));

await page.evaluate(() => document.querySelector('[data-st-unit="puntReturn"]').click());
await page.waitForSelector('#ffaConfirmModal');
await page.click('#ffaConfirmModal [data-act="ok"]');
await page.evaluate(() => {
  document.querySelector('[data-st-score="safety"]').click();
});
state = await page.evaluate(() => ({
  labels: [...document.querySelectorAll('[data-st-owner]')].map(el => el.textContent.trim()),
  before: window.app.stats.constructor.scoringSide(window.app.tagger.plays[0]),
}));
ok(state.labels.join('|') === 'Scouted team|Other team' && state.before === 'unknown', 'Opponent-scout safety fails closed and asks with subject-team labels', JSON.stringify(state));
await page.evaluate(() => document.querySelector('[data-st-owner="opponent"]').click());
ok((await page.evaluate(() => window.app.stats.constructor.scoringSide(window.app.tagger.plays[0]))) === 'them', 'Explicit rare ownership resolves the score without legacy Us/Them data');

await page.evaluate(() => document.querySelector('[data-st-unit="fieldGoalBlock"]').click());
await page.waitForSelector('#ffaConfirmModal');
await page.click('#ffaConfirmModal [data-act="ok"]');
await page.evaluate(() => {
  document.querySelector('[data-st-outcome="blocked"]').click();
  document.querySelector('[data-st-score="touchdown"]').click();
  document.querySelector('[data-st-recovery="subject"]').click();
  const blocker = document.querySelector('[data-st-input="blocker"]');
  blocker.value = '55'; blocker.dispatchEvent(new Event('change', { bubbles: true }));
});
state = await page.evaluate(() => ({
  st: window.app.tagger.plays[0].specialTeams,
  side: window.app.stats.constructor.scoringSide(window.app.tagger.plays[0]),
}));
ok(state.st.outcome.recoveredBy === 'subject' && state.st.outcome.score === 'touchdown' && state.st.players.blocker === '55' && state.side === 'us', 'Field Goal Block can chart recovery ownership, return score, and blocker', JSON.stringify(state));

await page.evaluate(() => {
  const play = window.app.tagger.plays[0];
  window.app.tagger._loadTagForm(play);
});
state = await page.evaluate(() => ({
  selectedUnit: document.querySelector('[data-st-unit].active')?.dataset.stUnit,
  selectedScore: document.querySelector('[data-st-score].active')?.dataset.stScore,
  owner: document.querySelector('[data-st-owner].active')?.dataset.stOwner,
  allButtonsNative: [...document.querySelectorAll('.bdv-st-editor [data-st-unit],.bdv-st-editor [data-st-outcome],.bdv-st-editor [data-st-score]')].every(el => el.tagName === 'BUTTON' && el.type === 'button'),
}));
ok(state.selectedUnit === 'fieldGoalBlock' && state.selectedScore === 'touchdown' && state.allButtonsNative, 'Structured Special Teams reloads with keyboard-focusable selections intact', JSON.stringify(state));

await page.setViewport({ width: 390, height: 844 });
state = await page.evaluate(() => ({
  pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  formOverflow: document.querySelector('#tagForm').scrollWidth > document.querySelector('#tagForm').clientWidth,
  unitHeight: Math.min(...[...document.querySelectorAll('#tagUnit .pick')].map(el => el.getBoundingClientRect().height)),
  stHeight: Math.min(...[...document.querySelectorAll('.bdv-st-editor .pick')].map(el => el.getBoundingClientRect().height)),
}));
ok(!state.pageOverflow && !state.formOverflow && state.unitHeight >= 44 && state.stHeight >= 44, 'Mobile composition is overflow-free with touch-sized unit and phase controls', JSON.stringify(state));
ok(errors.length === 0, 'No page errors', errors.join(' | '));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
