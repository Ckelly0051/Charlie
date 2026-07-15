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
  sections: [...document.querySelectorAll('.bdv-group > summary strong')].map(el => el.textContent),
  required: ['tagUnit','tagDown','tagDistance','tagFormation','tagBackfield','tagStrength','tagPersonnel','tagMotion','tagRunPass','tagPlayType','tagPlayDir','tagResult','tagYardage','tagDefFront','tagCoverage','tagBlitz','tagStType','tagScoreFor','tagKickOutcome','tagKickDistance','tagHangTime','tagReturnYards','tagKickedTo','tagPlayerKicker','tagPlayerReturner','tagPlayersSection','tagPlayerBC','tagPlayerPasser','tagPlayerReceiver','tagPlayerTackler','tagPlayerTakeaway','customFieldsSection','notesArea','tagHash','tagQuarter','tagFieldSide','tagYardLine','tagDriveNumber','customTagInput','autoDDToggle','templateSelect'].every(id => !!document.getElementById(id)),
  uniqueOwners: ['tagUnit','tagDown','tagDistance','tagFormation','tagBackfield','tagStrength','tagPersonnel','tagMotion','tagRunPass','tagPlayType','tagPlayDir','tagResult','tagYardage','tagDefFront','tagCoverage','tagBlitz','tagPlayersSection','notesArea','tagHash','tagQuarter','tagFieldSide','tagYardLine'].every(id => document.querySelectorAll(`#${id}`).length === 1),
  offense: document.querySelector('.group-offense .tag-group-head').textContent.trim(),
  defense: document.querySelector('.group-defense .tag-group-head').textContent.trim(),
}));
ok(state.mounted && ['Situation','Play & Result','Penalties','Players & Grades','Notes & Details'].every(label => state.sections.includes(label)), 'Flag-on mode composes real football groups over the live form', JSON.stringify(state));
ok(state.required, 'Every production offense, defense, player, custom, note, and situation control remains present');
ok(state.uniqueOwners, 'Every production tag field keeps exactly one DOM owner');
ok(/^Our Offensive Look/.test(state.offense) && /^Defense Faced/.test(state.defense), 'Offense self-scout uses subject-correct section labels', JSON.stringify(state));
state = await page.evaluate(() => ({
  visible: [...document.querySelectorAll('#tagPlayersSection .player-role')].filter(el => getComputedStyle(el).display !== 'none').map(el => el.dataset.role),
  detail: document.querySelector('[data-bdv-group="people"] summary span').textContent,
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
  firstGroup: document.querySelector('.tag-side-groups > .tag-group')?.dataset.group,
  defense: document.querySelector('.group-defense .tag-group-head').textContent.trim(),
  offense: document.querySelector('.group-offense .tag-group-head').textContent.trim(),
  unit: window.app.tagger.plays[0].tags.unit,
}));
ok(state.unit === 'defense' && state.firstGroup === 'defense', 'Existing unit toggle still writes the play and updates composition');
ok(/^Our Defensive Call/.test(state.defense) && /^Offense Faced/.test(state.offense), 'Defense leads with our call and labels the opponent look correctly', JSON.stringify(state));
state = await page.evaluate(() => ({
  visible: [...document.querySelectorAll('#tagPlayersSection .player-role')].filter(el => getComputedStyle(el).display !== 'none').map(el => el.dataset.role),
  active: document.querySelector('#tagPlayersSection .player-role.active')?.dataset.role,
  retained: window.app.tagger.plays[0].tags.players.ballCarrier,
  detail: document.querySelector('[data-bdv-group="people"] summary span').textContent,
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
await page.waitForFunction(() => /^Opponent Defensive Call/.test(document.querySelector('.group-defense .tag-group-head')?.textContent || ''));
state = await page.evaluate(() => ({
  defense: document.querySelector('.group-defense .tag-group-head').textContent.trim(),
}));
ok(/^Opponent Defensive Call/.test(state.defense), 'Opponent scout labels the opponent as the analytics subject');

await page.evaluate(() => document.querySelector('#tagUnit .pick[data-value="special"]').click());
await page.waitForFunction(() => document.querySelector('#tagForm').classList.contains('mode-special'));
state = await page.evaluate(() => ({
  primary: document.querySelector('.group-special .tag-group-head').textContent.trim(),
  specialVisible: getComputedStyle(document.querySelector('.group-special')).display !== 'none',
  offenseHidden: getComputedStyle(document.querySelector('.group-offense')).display === 'none',
  defenseHidden: getComputedStyle(document.querySelector('.group-defense')).display === 'none',
  sharedPlayersHidden: getComputedStyle(document.querySelector('#tagPlayersSection')).display === 'none',
  specialistPlayersVisible: getComputedStyle(document.querySelector('.group-special .player-roles')).display !== 'none',
  activeRole: document.querySelector('.group-special .player-role.active')?.dataset.role,
  unit: window.app.tagger.plays[0].tags.unit,
}));
ok(state.unit === 'special' && /^Opponent Special Teams/.test(state.primary), 'Special Teams preserves the live unit-save path and subject context', JSON.stringify(state));
ok(/^Opponent Special Teams/.test(state.primary) && state.specialVisible && state.offenseHidden && state.defenseHidden, 'Special Teams exposes its complete phase group without competing side groups', JSON.stringify(state));
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

state = await page.evaluate(() => {
  const grid = window.app.playGrid;
  const play = window.app.tagger.plays[0];
  const cols = grid.constructor.COLUMNS;
  const get = key => grid._cellHtml(play, cols.find(col => col.key === key)).replace(/<[^>]*>/g, '');
  return {
    preset: grid.constructor.PRESETS.special,
    unit: get('stUnit'), outcome: get('stOutcome'), kick: get('stKick'), ret: get('stReturn'),
    studyUnit: window.app.analyticsRegistry.values('specialTeamsPhase', play),
    studyOutcome: window.app.analyticsRegistry.values('specialTeamsOutcome', play),
    legacyPhase: window.app.analyticsRegistry.values('specialTeamsPhase', { tags: { stType: 'Punt' } }),
    malformedPhase: window.app.analyticsRegistry.values('specialTeamsPhase', { specialTeams: { unit: 'bogus' } }),
  };
});
ok(state.preset.join(',') === 'sit,stUnit,stOutcome,stKick,stReturn,penalty,penaltyYards,notes' && /Field Goal Block/.test(state.unit) && /blocked/.test(state.outcome), 'Film Room Special preset reads structured unit and outcome columns', JSON.stringify(state));
ok(state.studyUnit[0] === 'fieldGoalBlock' && state.studyOutcome[0] === 'blocked' && state.legacyPhase.length === 0 && state.malformedPhase.length === 0, 'Study dimensions consume validated structured Special Teams and quarantine legacy/malformed phases', JSON.stringify(state));

await page.evaluate(() => document.querySelector('[data-pen-add]').click());
await page.evaluate(() => {
  document.querySelector('[data-pen-chip="0:team:subject"]').click();
  const foul = document.querySelector('[data-pen-input="0:foul"]'); foul.value = 'Holding'; foul.dispatchEvent(new Event('change',{bubbles:true}));
  const yards = document.querySelector('[data-pen-input="0:yards"]'); yards.value = '8'; yards.dispatchEvent(new Event('change',{bubbles:true}));
  document.querySelector('[data-pen-chip="0:playCounts:false"]').click();
  document.querySelector('[data-pen-add]').click();
  document.querySelector('[data-pen-chip="1:team:opponent"]').click();
  const foul2 = document.querySelector('[data-pen-input="1:foul"]'); foul2.value = 'Facemask'; foul2.dispatchEvent(new Event('change',{bubbles:true}));
  document.querySelector('[data-pen-chip="1:disposition:declined"]').click();
  for (const [key,value] of [['down','1'],['distance','10'],['fieldSide','opp'],['yardLine','35']]) {
    const el = document.querySelector(`[data-pen-sit="${key}"]`); el.value=value; el.dispatchEvent(new Event('change',{bubbles:true}));
  }
  const confirmed=document.querySelector('[data-pen-sit="confirmed"]'); confirmed.checked=true; confirmed.dispatchEvent(new Event('change',{bubbles:true}));
});
state = await page.evaluate(() => {
  const play=window.app.tagger.plays[0], next={id:902,timestamp:{start:6,end:10},tags:{down:'',distance:'',fieldSide:'own',yardLine:'',quarter:'',driveNumber:'',unit:'special',formation:'',backfield:'',strength:'',personnel:'',motion:'',runPass:'',playType:'',playDir:'',result:'',yardage:'',defFront:'',coverage:'',blitz:'',stType:'',players:{},grades:{},custom:[]}};
  window.app.tagger.applyNextSituation(play,next);
  window.app.tagger._loadTagForm(play);
  const grid=window.app.playGrid, cols=grid.constructor.COLUMNS;
  const cell=key=>grid._cellHtml(play,cols.find(col=>col.key===key)).replace(/<[^>]*>/g,'');
  const stats=window.app.stats.compute([play]);
  return { penalties:play.penalties, situation:play.resultingSituation, next:next.tags, legacyResult:play.tags.result||'',
    penaltyCell:cell('penalty'), penaltyYards:cell('penaltyYards'), preset:grid.constructor.PRESETS.special,
    studyFouls:window.app.analyticsRegistry.values('penaltyFoul',play), studyRulings:window.app.analyticsRegistry.values('penaltyRuling',play),
    summary:stats.penalties, report:window.app.stats._renderPenalties(stats) };
});
ok(state.penalties.length===2 && state.penalties[0].yards===8 && state.penalties[0].playCounts===false && state.penalties[1].disposition==='declined', 'Penalty editor stores multiple independent fouls and actual enforcement', JSON.stringify(state));
ok(state.situation.confirmed && state.next.down==='1' && state.next.distance==='10' && state.next.fieldSide==='opp' && state.next.yardLine==='35', 'Confirmed resulting situation is the authoritative Auto D&D handoff', JSON.stringify(state));
ok(!state.legacyResult.includes('Penalty'), 'Structured penalty entry does not add the legacy Penalty result');
ok(state.preset.includes('penalty') && /Holding/.test(state.penaltyCell) && /Subject 8/.test(state.penaltyYards), 'Film Room summarizes structured penalties without a competing inline editor', JSON.stringify(state));
ok(state.studyFouls.join(',')==='Holding,Facemask' && state.studyRulings.join(',')==='accepted,declined', 'Study exposes every foul and ruling as film-linked dimensions', JSON.stringify(state));
ok(state.summary.flaggedPlays===1 && state.summary.fouls===2 && state.summary.accepted===1 && state.summary.declined===1 && state.summary.subjectYards===8 && /data-cut-type="penaltyFoul"/.test(state.report), 'Penalty report separates plays, foul records, rulings, accepted yards, and film links', JSON.stringify(state));
state = await page.evaluate(() => {
  const suggestions = [...document.querySelectorAll('#bdvPenaltyFouls option')].map(option => option.value);
  const yards = document.querySelector('[data-pen-input="0:yards"]');
  yards.value = '9'; yards.dispatchEvent(new Event('change', { bubbles:true }));
  const play = window.app.tagger.plays[0];
  return { suggestions, confirmed:play.resultingSituation?.confirmed, next:window.app.tagger.computeNextSituation(play) };
});
ok(state.suggestions.includes('False Start') && state.suggestions.includes('Defensive Pass Interference') && state.suggestions.includes('Roughing the Kicker'), 'Penalty foul suggestions cover offense, defense, and Special Teams while allowing custom text', JSON.stringify(state));
ok(state.confirmed===false && state.next===null, 'Changing enforcement invalidates a previously confirmed next situation', JSON.stringify(state));

await page.evaluate(() => document.querySelector('[data-pen-remove="0"]').click());
await page.waitForSelector('#ffaConfirmModal');
await page.click('#ffaConfirmModal [data-act="cancel"]');
ok((await page.evaluate(() => window.app.tagger.plays[0].penalties.length))===2, 'Cancelling penalty removal preserves every foul');
await page.evaluate(() => document.querySelector('[data-pen-remove="0"]').click());
await page.waitForSelector('#ffaConfirmModal');
await page.click('#ffaConfirmModal [data-act="ok"]');
ok((await page.evaluate(() => window.app.tagger.plays[0].penalties.length))===1, 'Confirmed removal deletes only the selected foul');

await page.evaluate(() => {
  const blank = id => ({ id, timestamp:{start:(id-1)*6,end:(id-1)*6+5}, notes:'', tags:{unit:'defense',down:'1',distance:'10',formation:'',backfield:'',strength:'',personnel:'',motion:'',runPass:'',playType:'',playDir:'',result:'',yardage:'',defFront:'',coverage:'',blitz:'',stType:'',players:{},grades:{},custom:[]} });
  window.app.tagger.plays = [blank(1), blank(2)]; window.app.tagger.currentPlayId = 1; window.app.tagger._loadTagForm(window.app.tagger.plays[0]);
  const tacklers = document.querySelector('#tagPlayerTackler'); tacklers.value='55, 22'; tacklers.dispatchEvent(new Event('change',{bubbles:true}));
  const grade = document.querySelector('#tagGradeTackler'); grade.value='1'; grade.dispatchEvent(new Event('change',{bubbles:true}));
  const notes = document.querySelector('#notesArea'); notes.value='Fit outside shoulder'; notes.dispatchEvent(new Event('input',{bubbles:true})); notes.dispatchEvent(new Event('change',{bubbles:true}));
  document.querySelector('#btnTagSaveNext').click();
});
state = await page.evaluate(() => ({
  current:window.app.tagger.currentPlayId, saved:document.querySelector('#btnTagSaveNext').classList.contains('just-saved'),
  players:window.app.tagger.plays[0].tags.players, grades:window.app.tagger.plays[0].tags.grades, notes:window.app.tagger.plays[0].notes,
}));
ok(state.current===2 && state.saved && state.players.tackler==='55, 22' && state.grades.tackler===1 && state.notes==='Fit outside shoulder', 'Save & Next preserves multi-tackler attribution, grade, notes, and gives affirmative feedback', JSON.stringify(state));
await page.evaluate(() => document.querySelector('#btnTagPrev').click());
state = await page.evaluate(() => ({ current:window.app.tagger.currentPlayId, tacklers:document.querySelector('#tagPlayerTackler').value, grade:document.querySelector('#tagGradeTackler').value, notes:document.querySelector('#notesArea').value }));
ok(state.current===1 && state.tacklers==='55, 22' && state.grade==='1' && state.notes==='Fit outside shoulder', 'Reopening the play restores every R6 field for editing', JSON.stringify(state));

state = await page.evaluate(() => {
  const blank = (id, notes) => ({ id, timestamp:{start:0,end:5}, notes, tags:{unit:'offense',down:'1',distance:'10',formation:'',backfield:'',strength:'',personnel:'',motion:'',runPass:'',playType:'',playDir:'',result:'',yardage:'',defFront:'',coverage:'',blitz:'',stType:'',players:{},grades:{},custom:[]} });
  const outgoing = blank(1, 'Outgoing original');
  const incoming = blank(1, 'Incoming original');
  const tagger = window.app.tagger;
  tagger.plays = [outgoing]; tagger.currentPlayId = 1; tagger._loadTagForm(outgoing);
  const notes = document.querySelector('#notesArea');
  notes.value = 'Outgoing pending'; notes.dispatchEvent(new Event('input',{bubbles:true}));
  tagger.plays = [incoming]; tagger.currentPlayId = 1;
  tagger._emit('plays-loaded'); tagger._emit('play-selected', incoming);
  return { outgoing: outgoing.notes, incoming: incoming.notes };
});
ok(state.outgoing === 'Outgoing pending' && state.incoming === 'Incoming original', 'Pending notes stay on their originating play when the next game reuses its numeric id', JSON.stringify(state));

state = await page.evaluate(async () => {
  const tagger = window.app.tagger;
  tagger._confirmDialog = async () => true;
  const play = tagger.getCurrentPlay();
  const notes = document.querySelector('#notesArea');
  notes.value = 'Must be cleared'; notes.dispatchEvent(new Event('input',{bubbles:true}));
  await tagger.clearCurrentTags();
  await new Promise(resolve => setTimeout(resolve, 550));
  return { stored: play.notes, visible: notes.value };
});
ok(state.stored === '' && state.visible === '', 'Clear Tags cancels a pending note instead of resurrecting it after debounce', JSON.stringify(state));

await page.evaluate(() => document.querySelector('#tagUnit .pick[data-value="special"]').click());

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
