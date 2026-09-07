import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import { setupTeamAndDemo, createFirstTeam } from './hub-setup.mjs';
/* E2E harness — defensive self-scout in the stats dashboard. Covers the paths
   the other harnesses never open:
     1. The Self-Scout TAB renders the defensive section (the reported "self
        scout doesn't mention defense" bug — it only ever showed in a separate
        overlay before).
     2. Defensive plays tagged with Front/Coverage/Blitz but NO offensive
        playType still count (the _currentPlays() gating bug).
     3. The Defense TAB also shows the scheme-tells section.
     4. generateDefensiveSelfScout runs once per dashboard render, not twice.

   Run after build:  npm run build && node tools/e2e-self-scout.mjs */
import puppeteer from 'puppeteer';

const URL = TEST_APP_URL;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const click = (sel) => page.evaluate(s => { const el = document.querySelector(s); if (el) el.click(); return !!el; }, sel);

console.log('\n== Setup: team + demo + open a game (full app init) ==');
await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(600);
// Team/season setup lives in the library overlay, opened from the shell Home.
await setupTeamAndDemo(page);
await sleep(900);
// Open game 1 from the shell Home game list (the sole game-entry route).
// V2-A: no per-row Open button -- preview the row, then Continue charting.
await page.evaluate(() => document.querySelector('.ws-game-row')?.click());
await page.evaluate(() => document.getElementById('wsContinueCharting')?.click());
await sleep(700);
ok(await page.evaluate(() => window.app.workspace.currentRoute() === 'breakdown'),
  'setup: opening a game from Home genuinely lands in Break Down');

// Install an in-page play builder + a controlled play set.
await page.evaluate(() => {
  let idc = 1000;
  window.__mk = (over) => ({
    id: idc++, timestamp: { start: 0, end: 5 }, notes: '',
    tags: Object.assign({
      down: '', distance: '', quarter: '', fieldSide: 'own', yardLine: '',
      formation: '', personnel: '', motion: '', runPass: '', playType: '',
      result: '', yardage: '', hash: '', playDir: '', defFront: '', coverage: '',
      blitz: '', unit: 'offense', stType: '', players: {}, grades: {}, custom: []
    }, over)
  });
});

console.log('\n== 1. Gating fix: defensive scheme plays with NO playType still count ==');
let r = await page.evaluate(() => {
  const mk = window.__mk;
  // 6 defensive plays, Front + Coverage tagged, but no offensive playType and
  // no runPass — under the old _currentPlays() gate these were ALL dropped.
  const plays = [];
  for (let i = 0; i < 6; i++) {
    plays.push(mk({ unit: 'defense', down: '3', distance: '7',
      defFront: i % 2 ? 'Nickel' : '4-3', coverage: 'Cover 3',
      result: i % 3 === 0 ? 'Sack' : 'Incomplete', yardage: i % 3 === 0 ? '-5' : '0' }));
  }
  window.app.tagger.plays = plays;
  window.app.stats.filter.active = false;
  const ds = window.app.stats.generateDefensiveSelfScout();
  return { insufficient: !!ds.insufficient, totalPlays: ds.totalPlays, schemePlays: ds.schemePlays };
});
ok(r.insufficient === false, 'no-playType defensive plays are NOT dropped (gating fixed)', JSON.stringify(r));
ok(r.totalPlays === 6, 'all 6 scheme plays counted', JSON.stringify(r));

console.log('\n== 2. Self-Scout TAB renders the defensive section ==');
r = await page.evaluate(async () => {
  window.app.reportsScreen.show();
  window.app.reportsScreen.selectTab('selfscout');
  [...document.querySelectorAll('.gi-selfscout-nav button')]
    .find(button => button.firstChild.textContent.trim() === 'Defense')?.click();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const pane = document.querySelector('#statsDashboard [data-pane="selfscout"]');
  const titles = [...(pane?.querySelectorAll('.gi-ss-module > header strong') || [])]
    .map(node => node.textContent.trim());
  return {
    active: pane?.querySelector('.gi-selfscout-nav button.active')?.firstChild.textContent.trim(),
    titles,
  };
});
ok(r.active === 'Defense', 'Self-Scout exposes and selects its Defense section', JSON.stringify(r));
ok(['Positive Plays', 'Negative Plays', 'Top Calls', 'Worst Calls', 'Run Defense', 'Pass Defense']
  .every(title => r.titles.includes(title)), 'Self-Scout Defense renders the approved modules', JSON.stringify(r));

console.log('\n== 3. Mixed offense+defense: both tabs show the defensive scheme section ==');
r = await page.evaluate(async () => {
  const mk = window.__mk;
  const plays = [];
  // Offensive plays so the offensive self-scout (ssReport) is non-null.
  for (let i = 0; i < 6; i++) {
    plays.push(mk({ unit: 'offense', down: '1', distance: '10', formation: 'Trips',
      playType: i % 2 ? 'Short Pass' : 'Run Inside', runPass: i % 2 ? 'Pass' : 'Run',
      result: 'Gain', yardage: '6' }));
  }
  // Defensive plays WITH runPass so compute()'s defPlays (and hasData) include
  // them — that drives the Defense tab's scheme section.
  for (let i = 0; i < 6; i++) {
    plays.push(mk({ unit: 'defense', down: '2', distance: '8',
      defFront: 'Nickel', coverage: 'Cover 2', blitz: i % 2 ? 'Edge' : '',
      runPass: 'Pass', result: i % 2 ? 'Sack' : 'Incomplete', yardage: i % 2 ? '-6' : '0' }));
  }
  window.app.tagger.plays = plays;
  window.app.reportsScreen.show();
  window.app.reportsScreen.selectTab('selfscout');
  [...document.querySelectorAll('.gi-selfscout-nav button')]
    .find(button => button.firstChild.textContent.trim() === 'Defense')?.click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const selfScoutHasDef = [...document.querySelectorAll('#statsDashboard [data-pane="selfscout"] .gi-ss-module > header strong')]
    .some(node => node.textContent.trim() === 'Run Defense');
  window.app.reportsScreen.selectTab('defense');
  // Defense shows one SECTION at a time (2026-09-04). The scheme tells live in
  // section 5, so its tab is activated before the pane is read.
  [...document.querySelectorAll('.gi-def-secnav-item')]
    .find(b => b.textContent.includes('Self-scout'))?.click();
  // A tab click is Preact state and flushes on a deferred frame; reading in
  // the same tick reads the previous section.
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const def = document.querySelector('#statsDashboard [data-pane="defense"]');
  return {
    selfScoutHasDef,
    defenseHasScheme: !!def?.querySelector('.ss-tells'),
    defenseHasHavoc: /Havoc/.test(def?.innerHTML || '')
  };
});
ok(r.selfScoutHasDef, 'Self-Scout tab shows defensive section with offense present', JSON.stringify(r));
ok(r.defenseHasScheme, 'Defense tab shows the scheme-tells section', JSON.stringify(r));
ok(r.defenseHasHavoc, 'Defense tab still shows the base defensive analytics', JSON.stringify(r));

console.log('\n== 4. generateDefensiveSelfScout computed ONCE per render (dedup) ==');
r = await page.evaluate(async () => {
  const eng = window.app.stats;
  const orig = eng.generateDefensiveSelfScout.bind(eng);
  let count = 0;
  eng.generateDefensiveSelfScout = function (...a) { count++; return orig(...a); };
  eng._lastTab = 'overview';
  window.app.reportsScreen.show();
  window.app.reportsScreen.selectTab('selfscout');
  eng.generateDefensiveSelfScout = orig;   // restore
  return { count };
});
ok(r.count === 1, 'one defensive-self-scout computation per dashboard render', JSON.stringify(r));

console.log('\n== 4b. Self-Scout is natively owned, not an HTML-string fallback ==');
r = await page.evaluate(() => {
  const engine = window.app.stats;
  window.app.reportsScreen.selectTab('selfscout');
  const pane = document.querySelector('#statsDashboard [data-pane="selfscout"]');
  return {
    legacyAbsent: typeof engine._renderSelfScoutBody !== 'function',
    nativeBoard: !!pane?.querySelector('.gi-selfscout-board'),
    legacyBindings: pane?.querySelectorAll('[data-cut-type],[data-cut-val]').length || 0,
  };
});
ok(r.legacyAbsent && r.nativeBoard, 'Self-Scout renders through its real native component even when the legacy body renderer refuses', JSON.stringify(r));
ok(r.legacyBindings === 0, 'Self-Scout carries no retired selector-rebinding attributes', JSON.stringify(r));

console.log('\n== 4c. Adversarial repair cases: cohort, concept film, escaping, visual semantics ==');
r = await page.evaluate(async () => {
  const mk = window.__mk;
  const stats = window.app.stats;
  stats.filter.active = false;

  stats.tagger.plays = [mk({ unit:'offense', runPass:'Run', playType:'', result:'Gain', yardage:'4' })];
  const runPassReport = stats.generateSelfScout();
  const runPassComputed = stats.compute().offPlays.length;

  stats.tagger.plays = [mk({ unit:'offense', runPass:'Run', playType:'Run Inside',
    playCall:'', playConcept:'Counter', result:'Gain', yardage:'5' })];
  const conceptRows = stats._selfScoutRows(stats._selfScoutGroup(
    stats._offensePlays(), play => play.tags.playCall || play.tags.playConcept || null
  ));
  const conceptMatches = stats.tagger.plays.filter(stats._buildCutFilter('playCallOrConcept', 'Counter')).length;

  stats.tagger.plays = Array.from({ length:5 }, () => mk({ unit:'offense', runPass:'Run',
    playType:'Run Inside', formation:'Ace & Empty', result:'Gain', yardage:'8' }));
  const escapedReport = stats.generateSelfScout();
  window.app.reportsScreen.selectTab('selfscout');
  [...document.querySelectorAll('.gi-selfscout-nav button')]
    .find(button => button.firstChild.textContent.trim() === 'Tendencies')?.click();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const pane = document.querySelector('#statsDashboard [data-pane="selfscout"]');
  const tellText = pane.querySelector('.gi-ss-table tbody tr td')?.textContent || '';
  return {
    runPassTotal: runPassReport?.totalPlays || 0,
    runPassComputed,
    conceptKeys: conceptRows.map(row => row.key),
    conceptMatches,
    rawTellLabel: escapedReport.tells.find(t => t.cutType === 'formation')?.label || '',
    tellText,
    cutRows: pane.querySelectorAll('.gi-ss-table tbody tr.cut-row').length,
    active: pane.querySelector('.gi-selfscout-nav button.active')?.firstChild.textContent.trim(),
  };
});
ok(r.runPassTotal === 1 && r.runPassComputed === 1,
  'Run/Pass-only offense is included consistently in Self-Scout and KPI computation', JSON.stringify(r));
ok(r.conceptKeys.includes('Counter') && r.conceptMatches === 1,
  'a concept-only performance row resolves its exact film cohort', JSON.stringify(r));
ok(r.rawTellLabel === 'From Ace & Empty' && r.tellText === 'From Ace & Empty',
  'native tell labels stay raw in data and render one escaped time', JSON.stringify(r));
ok(r.active === 'Tendencies' && r.cutRows > 0,
  'the approved Tendencies table keeps actionable rows linked to film', JSON.stringify(r));

console.log('\n== 5. Actionable tells: distance buckets, clickable-to-film, defensive counter ==');
r = await page.evaluate(async () => {
  const mk = window.__mk;
  // 10 offensive plays: Trips on 3rd down, varied exact distances 8-12
  // (all "Long"), every one a pass — a strong, exploitable, single tell that
  // ONLY emerges if exact distances are bucketed together.
  const plays = [];
  for (let i = 0; i < 10; i++) plays.push(mk({ unit: 'offense', down: '3',
    distance: String(8 + (i % 5)), formation: 'Trips', playType: 'Short Pass',
    runPass: 'Pass', result: 'Incomplete', yardage: '2' }));
  window.app.tagger.plays = plays;
  window.app.stats.filter.active = false;
  const rep = window.app.stats.generateSelfScout();
  // The combined Formation × Down tell should exist and bucket all 10 plays.
  const combo = rep.tells.find(t => t.cutType === 'comboFD');
  let matched = 0;
  if (combo) {
    const f = window.app.stats._buildCutFilter(combo.cutType, combo.cutVal);
    matched = window.app.tagger.plays.filter(p => f(p)).length;
  }
  // Every tell that carries a cut must resolve to >=1 play (no dead links).
  const deadLinks = rep.tells.filter(t => t.cutType).filter(t => {
    const f = window.app.stats._buildCutFilter(t.cutType, t.cutVal);
    return !f || window.app.tagger.plays.filter(p => f(p)).length === 0;
  }).length;
  window.app.reportsScreen.show();
  window.app.reportsScreen.selectTab('selfscout');
  [...document.querySelectorAll('.gi-selfscout-nav button')]
    .find(button => button.firstChild.textContent.trim() === 'Tendencies')?.click();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const pane = document.querySelector('#statsDashboard [data-pane="selfscout"]');
  return {
    comboVal: combo?.cutVal || null,
    comboMatched: matched,
    deadLinks,
    cutRows: pane.querySelectorAll('.gi-ss-table tbody tr.cut-row').length,
    bucketLabel: /3rd &amp; Long/.test(pane.innerHTML),
    active: pane.querySelector('.gi-selfscout-nav button.active')?.firstChild.textContent.trim(),
  };
});
ok(r.comboVal === 'Trips__3|Long', 'Formation × Down tell uses the down|bucket key', JSON.stringify(r));
ok(r.comboMatched === 10, 'exact distances 8-12 all bucket into "3rd & Long" (n=10)', JSON.stringify(r));
ok(r.deadLinks === 0, 'every clickable tell resolves to at least one play', JSON.stringify(r));
ok(r.cutRows >= 1, 'tells render as clickable cut-rows', JSON.stringify(r));
ok(r.bucketLabel, 'bucket label "3rd & Long" shown in the pane', JSON.stringify(r));
ok(r.active === 'Tendencies', 'the data-only Tendencies section is active without retired recommendation prose', JSON.stringify(r));

console.log('\n== 6. Predictability Map: Formation × Situation heat-map, click-to-film ==');
r = await page.evaluate(async () => {
  const mk = window.__mk;
  const plays = [];
  // I-Form 1st = run-heavy; Trips 3rd & Long = pass-heavy; Singleback 2nd & Med = balanced.
  for (let i = 0; i < 8; i++) plays.push(mk({ unit: 'offense', down: '1', distance: '10',
    formation: 'I-Form', playType: i < 7 ? 'Run Inside' : 'Short Pass', runPass: i < 7 ? 'Run' : 'Pass', result: 'Gain', yardage: '4' }));
  for (let i = 0; i < 8; i++) plays.push(mk({ unit: 'offense', down: '3', distance: String(8 + i % 4),
    formation: 'Trips', playType: 'Short Pass', runPass: 'Pass', result: 'Incomplete', yardage: '2' }));
  for (let i = 0; i < 8; i++) plays.push(mk({ unit: 'offense', down: '2', distance: '5',
    formation: 'Singleback', playType: i % 2 ? 'Short Pass' : 'Run Inside', runPass: i % 2 ? 'Pass' : 'Run', result: 'Gain', yardage: '5' }));
  window.app.tagger.plays = plays;
  window.app.stats.filter.active = false;
  const m = window.app.stats.generateSelfScout().matrix;
  // 1st & 4th collapse to the down; 2nd/3rd bucket by distance.
  const iformFirst = window.app.tagger.plays.filter(window.app.stats._buildCutFilter('comboFS', 'I-Form__1')).length;
  const shotgun3L = window.app.tagger.plays.filter(window.app.stats._buildCutFilter('comboFS', 'Trips__3|Long')).length;
  window.app.reportsScreen.show();
  window.app.reportsScreen.selectTab('selfscout');
  [...document.querySelectorAll('.gi-selfscout-nav button')]
    .find(button => button.firstChild.textContent.trim() === 'Tendencies')?.click();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const pane = document.querySelector('#statsDashboard [data-pane="selfscout"]');
  return {
    rows: m.rows, cols: m.cols.map(c => c.key),
    iformFirst, shotgun3L,
    hasMap: /Predictability map/i.test(pane.innerHTML),
    clickableCells: pane.querySelectorAll('.gi-ss-map .gi-ss-cell.cut-row').length,
  };
});
ok(r.hasMap, 'Predictability Map section renders', JSON.stringify(r));
ok(r.rows.length === 3 && r.cols.length === 3, 'matrix has 3 formations × 3 situations present in data', JSON.stringify(r));
ok(r.cols.includes('1') && r.cols.includes('3|Long'), '1st collapses to the down; 3rd buckets by distance', JSON.stringify(r));
ok(r.iformFirst === 8, 'I-Form × 1st cell cut resolves to its 8 plays', JSON.stringify(r));
ok(r.shotgun3L === 8, 'Trips × 3rd & Long cell cut resolves to its 8 plays', JSON.stringify(r));
ok(r.clickableCells >= 3, 'populated cells are clickable to film', JSON.stringify(r));

console.log('\n== 7. Personnel → Formation Diversity: locked/leaning tells, click-to-film ==');
r = await page.evaluate(async () => {
  const mk = window.__mk;
  const plays = [];
  // 11 personnel → always Trips (locked, 100%)
  for (let i = 0; i < 8; i++) plays.push(mk({ unit: 'offense', down: '1', distance: '10',
    personnel: '11', formation: 'Trips', playType: i % 2 ? 'Short Pass' : 'Run Inside',
    runPass: i % 2 ? 'Pass' : 'Run', result: 'Gain', yardage: '5' }));
  // 12 personnel → I-Form 6/8 (75%, leaning), Singleback 2/8
  for (let i = 0; i < 6; i++) plays.push(mk({ unit: 'offense', down: '1', distance: '10',
    personnel: '12', formation: 'I-Form', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '4' }));
  for (let i = 0; i < 2; i++) plays.push(mk({ unit: 'offense', down: '2', distance: '6',
    personnel: '12', formation: 'Singleback', playType: 'Short Pass', runPass: 'Pass', result: 'Gain', yardage: '6' }));
  // 21 personnel → diverse (no tell) — 3 formations roughly equal
  for (let i = 0; i < 6; i++) plays.push(mk({ unit: 'offense', down: '2', distance: '5',
    personnel: '21', formation: ['I-Form', 'Singleback', 'Bunch'][i % 3],
    playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '3' }));
  window.app.tagger.plays = plays;
  window.app.stats.filter.active = false;
  const rep = window.app.stats.generateSelfScout();
  const pd = rep.personnelDiversity;
  const p11 = pd.find(p => p.personnel === '11');
  const p12 = pd.find(p => p.personnel === '12');
  const p21 = pd.find(p => p.personnel === '21');
  // Render and check DOM
  window.app.reportsScreen.show();
  window.app.reportsScreen.selectTab('selfscout');
  [...document.querySelectorAll('.gi-selfscout-nav button')]
    .find(button => button.firstChild.textContent.trim() === 'Structure')?.click();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const pane = document.querySelector('#statsDashboard [data-pane="selfscout"]');
  const section = [...(pane?.querySelectorAll('.gi-ss-module') || [])]
    .find(module => module.querySelector('header strong')?.textContent.trim() === 'Personnel to formation');
  const cutRows = section ? section.querySelectorAll('tr.cut-row') : [];
  const originalWatch = window.app.stats._watchPlays;
  let watched = 0;
  window.app.stats._watchPlays = predicate => { watched = window.app.tagger.plays.filter(predicate).length; };
  cutRows[0]?.click();
  window.app.stats._watchPlays = originalWatch;
  // Check Film Room Insights for the Personnel Tell
  const insightTags = rep.insights.map(i => i.tag);
  return {
    p11TopPct: p11?.topPct, p11TopForm: p11?.topFormation, p11Unique: p11?.uniqueFormations,
    p12TopPct: p12?.topPct, p12TopForm: p12?.topFormation,
    p21TopPct: p21?.topPct,
    hasSection: !!section,
    cutRowCount: cutRows.length,
    watched,
    hasLockedFlag: /Locked/.test(section?.innerHTML || ''),
    hasLeaningFlag: /Leaning/.test(section?.innerHTML || ''),
    hasPersonnelTell: insightTags.includes('Personnel Tell'),
  };
});
ok(r.p11TopPct === 100 && r.p11TopForm === 'Trips', '11 personnel locked to Trips at 100%', JSON.stringify(r));
ok(r.p12TopPct === 75 && r.p12TopForm === 'I-Form', '12 personnel leaning to I-Form at 75%', JSON.stringify(r));
ok(r.p21TopPct <= 50, '21 personnel is diverse (no tell)', JSON.stringify(r));
ok(r.hasSection, 'Personnel → Formation Diversity section renders', JSON.stringify(r));
ok(r.cutRowCount === 2, 'only locked/leaning groups render (11 and 12, not 21)', JSON.stringify(r));
ok(r.watched === 8, 'a native personnel row launches exactly its eight-play film cohort', JSON.stringify(r));
ok(r.hasLockedFlag && r.hasLeaningFlag, 'Locked and Leaning flags both shown', JSON.stringify(r));
ok(r.hasPersonnelTell, 'Personnel Tell appears in Film Room Insights', JSON.stringify(r));

console.log('\n== S6-4c AX-2: the Predictability Map says what it means ==');
r = await page.evaluate(async () => {
  const engine = window.app.stats;
  window.app.reportsScreen.show();
  window.app.reportsScreen.selectTab('selfscout');
  [...document.querySelectorAll('.gi-selfscout-nav button')]
    .find(button => button.firstChild.textContent.trim() === 'Tendencies')?.click();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const pane = document.querySelector('#statsDashboard [data-pane="selfscout"]');
  const table = pane?.querySelector('.gi-ss-map');
  const cells = [...(table?.querySelectorAll('.gi-ss-cell') || [])];
  const populated = cells.filter(cell => !cell.classList.contains('is-nodata'));
  const matrix = engine.generateSelfScout().matrix;
  const view = engine._selfScoutMatrixView(matrix);
  const expected = engine.generateSelfScout().predictability;
  const shown = Number.parseInt(pane?.querySelector('.gi-ss-pred-val')?.textContent || '', 10);
  const legend = pane?.querySelector('.gi-ss-legend')?.textContent || '';
  return {
    empty: cells.filter(cell => cell.classList.contains('is-nodata')).length,
    noDataWords: [...cells].filter(cell => cell.classList.contains('is-nodata') && cell.textContent.trim() === 'No data').length,
    populated: populated.length,
    everyCellHasN: populated.every(cell => /^n=\d+/.test(cell.querySelector('.n')?.textContent || '')),
    shown,
    expected,
    rowHeaders: table?.querySelectorAll('tbody tr > td:first-child').length || 0,
    rows: view?.rows.length || 0,
    cuts: table?.querySelectorAll('.gi-ss-cell[role="button"]').length || 0,
    corner: table?.querySelector('thead th')?.textContent || '',
    legendRules: /Predictable, below baseline/i.test(legend)
      && /Predictable, at or above baseline/i.test(legend)
      && /Balanced/i.test(legend) && /Under \d+ plays/i.test(legend),
  };
});
ok(r.empty > 0 && r.noDataWords === r.empty,
  'An empty cell says "No data" in words rather than rendering a value', JSON.stringify({ empty: r.empty, noData: r.noDataWords }));
ok(r.populated > 0 && r.everyCellHasN,
  'Every populated cell carries its sample size attached to the lean', JSON.stringify({ populated: r.populated }));
ok(Number.isFinite(r.shown) && r.shown === r.expected,
  'The native module shows the engine-owned predictability score', JSON.stringify({ shown: r.shown, expected: r.expected }));
ok(r.legendRules && /Formation/.test(r.corner),
  'The native legend distinguishes risk, strength, balance, and low-sample states', JSON.stringify({ corner: r.corner }));
ok(r.rowHeaders === r.rows && r.cuts === r.populated,
  'Every formation is a row header and every populated cell keeps its exact film action', JSON.stringify({ rowHeaders: r.rowHeaders, rows: r.rows, cuts: r.cuts, populated: r.populated }));

// Drive the structured classifier with one of each state so the assertion does
// not depend on whichever cases the season fixture happens to produce.
r = await page.evaluate(() => {
  const engine = window.app.stats;
  const cell = (n, runs, succ) => ({ n, runs, passes: n - runs, succ, yards: n * 5 });
  const K = (row, col) => `${row}\u0001${col}`;
  const matrix = {
    rows: ['Heavy', 'Light'],
    cols: [{ key: 'A', label: '1st' }, { key: 'B', label: '3rd & Long' }],
    rowN: { Heavy: 20, Light: 20 },
    cells: {
      [K('Heavy', 'A')]: cell(10, 10, 10),
      [K('Heavy', 'B')]: cell(10, 10, 0),
      [K('Light', 'A')]: cell(10, 5, 5),
      [K('Light', 'B')]: cell(2, 2, 0),
    },
  };
  const view = engine._selfScoutMatrixView(matrix);
  const cells = view.rows.flatMap(row => row.cells).filter(item => !item.empty);
  const counts = Object.fromEntries(['exploit', 'working', 'balanced', 'low'].map(state => [state, cells.filter(item => item.state === state).length]));
  return { counts, lowIsNotStrong: cells.find(item => item.state === 'low')?.strong === false };
});
ok(Object.values(r.counts).every(count => count === 1),
  'Predictable-and-ineffective, predictable-but-working, balanced and low-sample remain four distinct states', JSON.stringify(r));
ok(r.lowIsNotStrong,
  'A cell with too few snaps remains low-confidence rather than becoming a certainty', JSON.stringify(r));
console.log('\n== S6-4c AX-3: repeated findings collapse into one theme ==');
r = await page.evaluate(() => {
  const engine = window.app.stats;
  // Six same-type findings and one of another type. Before AX-3 the flat top-6
  // cap let one class take every slot, so the other finding never appeared.
  const many = ['Trips', 'Ace', 'Wing-T', 'Bunch', 'Empty', 'Doubles'].map((subject, index) => ({
    type: 'direction', subject, priority: 100 - index, tag: 'Direction Tell',
    text: `From <strong>${subject}</strong>, you go <strong>left</strong> 100% of the time.`,
  }));
  many.push({ type: 'motion', subject: null, priority: 5, tag: 'Motion Tell', text: 'Motion tips the pass.' });
  const themed = engine.constructor._themeInsights(many);
  const byType = {};
  themed.forEach(item => { byType[item.type] = (byType[item.type] || 0) + 1; });
  const theme = themed.find(item => /-theme$/.test(item.type));
  // The recommendation-list form of the same rule.
  const tells = ['3rd & Long', '2nd & Long', '22 personnel', '11 personnel', 'Wing-T'].map(label => ({ label }));
  const recs = engine.constructor._themedRecommendations(tells,
    t => `DETAIL:${t.label}`, rest => `THEME:${rest.length}:${[...new Set(rest.map(x => x.label))].join('|')}`);
  return {
    total: themed.length, byType, themeText: theme?.text || '', themeType: theme?.type || '',
    survivedOtherType: byType.motion === 1,
    recs, detailCount: recs.filter(line => line.startsWith('DETAIL:')).length,
    themeCount: recs.filter(line => line.startsWith('THEME:')).length,
  };
});
ok(r.byType.direction === 2 && r.survivedOtherType,
  'One finding class cannot take every slot — each contributes its two strongest', JSON.stringify(r.byType));
ok(/-theme$/.test(r.themeType) && /4 more direction tendencies/.test(r.themeText) && /Wing-T/.test(r.themeText),
  'The remainder collapses into one themed line that names the rest', JSON.stringify({ type: r.themeType, text: r.themeText }));
ok(!/&amp;amp;|&lt;strong/.test(r.themeText),
  'The themed line does not double-escape the labels it names', JSON.stringify({ text: r.themeText }));
ok(r.detailCount === 2 && r.themeCount === 1 && /THEME:3:/.test(r.recs[2]),
  'Recommendations show the two strongest in full and name the rest once', JSON.stringify(r.recs));
r = await page.evaluate(() => {
  // Wiring, not just the helper. The assertions above call `_themeInsights`
  // directly, so they stay green even if `_findInsights` goes back to the flat
  // top-6 cap — the helper would be correct and unused. This proves the real
  // path runs through it.
  const engine = window.app.stats;
  const Klass = engine.constructor;
  const original = Klass._themeInsights;
  let called = 0;
  Klass._themeInsights = list => { called += 1; return [{ type: 'sentinel', text: 'SENTINEL', priority: 1 }]; };
  const out = engine._findInsights(engine.tagger.plays.filter(p => p && p.tags));
  Klass._themeInsights = original;
  return { called, viaTheme: out.length === 1 && out[0].type === 'sentinel' };
});
ok(r.called === 1 && r.viaTheme,
  'The live insight path runs through the theming step, not a flat cap', JSON.stringify(r));
r = await page.evaluate(() => {
  // Every real game must still produce a self-scout: the first version of this
  // change threw on two of six real games because an insight referenced a
  // variable outside its scope, and the report silently became an error object.
  const engine = window.app.stats;
  const report = engine.generateSelfScout();
  return { ok: !!report && report.totalPlays > 0, keys: report ? Object.keys(report).length : 0, err: report?.__err || null };
});
ok(r.ok && !r.err, 'Self-scout still generates a complete report for a charted game', JSON.stringify(r));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) console.log('Console/page errors:\n' + errors.join('\n'));
else console.log('No console/page errors.');
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
