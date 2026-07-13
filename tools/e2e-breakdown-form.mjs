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

await page.setViewport({ width: 390, height: 844 });
state = await page.evaluate(() => ({
  pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  formOverflow: document.querySelector('#tagForm').scrollWidth > document.querySelector('#tagForm').clientWidth,
  unitHeight: Math.min(...[...document.querySelectorAll('#tagUnit .pick')].map(el => el.getBoundingClientRect().height)),
}));
ok(!state.pageOverflow && !state.formOverflow && state.unitHeight >= 44, 'Mobile composition is overflow-free with touch-sized unit controls', JSON.stringify(state));
ok(errors.length === 0, 'No page errors', errors.join(' | '));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
