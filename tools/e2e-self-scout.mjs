import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
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
await page.evaluate(() => document.querySelector('[data-ws-action="seasons"]')?.click());
await sleep(400);
await page.type('#teamSetupName', 'Mavericks');
await click('#btnTeamSetupSave');
await sleep(300);
await click('#btnExploreDemo');
await sleep(900);
// Open game 1 from the shell Home film inbox (the sole game-entry route).
await page.evaluate(() => document.querySelector('#wsFilmList [data-ws-game]')?.click());
await sleep(700);

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
r = await page.evaluate(() => {
  window.app.stats.showDashboard();
  window.app.reportsScreen.selectTab('selfscout');
  const pane = document.querySelector('#statsDashboard [data-pane="selfscout"]');
  return {
    hasDefSection: !!pane?.querySelector('.ss-def-section'),
    hasDefScoutHeading: /Defensive Self-Scout/.test(pane?.innerHTML || '')
  };
});
ok(r.hasDefSection, 'Self-Scout pane contains .ss-def-section', JSON.stringify(r));
ok(r.hasDefScoutHeading, 'Self-Scout pane shows the "Defensive Self-Scout" heading', JSON.stringify(r));

console.log('\n== 3. Mixed offense+defense: both tabs show the defensive scheme section ==');
r = await page.evaluate(() => {
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
  window.app.stats.showDashboard();
  window.app.reportsScreen.selectTab('selfscout');
  const selfScoutHasDef = !!document.querySelector('#statsDashboard [data-pane="selfscout"] .ss-def-section');
  window.app.reportsScreen.selectTab('defense');
  const def = document.querySelector('#statsDashboard [data-pane="defense"]');
  return {
    selfScoutHasDef,
    defenseHasScheme: !!def?.querySelector('.ss-def-section'),
    defenseHasHavoc: /Havoc/.test(def?.innerHTML || '')
  };
});
ok(r.selfScoutHasDef, 'Self-Scout tab shows defensive section with offense present', JSON.stringify(r));
ok(r.defenseHasScheme, 'Defense tab shows the scheme-tells section', JSON.stringify(r));
ok(r.defenseHasHavoc, 'Defense tab still shows the base defensive analytics', JSON.stringify(r));

console.log('\n== 4. generateDefensiveSelfScout computed ONCE per render (dedup) ==');
r = await page.evaluate(() => {
  const eng = window.app.stats;
  const orig = eng.generateDefensiveSelfScout.bind(eng);
  let count = 0;
  eng.generateDefensiveSelfScout = function (...a) { count++; return orig(...a); };
  eng._lastTab = 'overview';
  eng.showDashboard();
  window.app.reportsScreen.selectTab('selfscout');
  eng.generateDefensiveSelfScout = orig;   // restore
  return { count };
});
ok(r.count === 1, 'one defensive-self-scout computation per dashboard render', JSON.stringify(r));

console.log('\n== 5. Actionable tells: distance buckets, clickable-to-film, defensive counter ==');
r = await page.evaluate(() => {
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
  window.app.stats.showDashboard();
  window.app.reportsScreen.selectTab('selfscout');
  const pane = document.querySelector('#statsDashboard [data-pane="selfscout"]');
  return {
    comboVal: combo?.cutVal || null,
    comboMatched: matched,
    deadLinks,
    cutRows: pane.querySelectorAll('.ss-tells tr.cut-row').length,
    bucketLabel: /3rd &amp; Long/.test(pane.innerHTML),
    threat: /DC keys (run|pass)/.test(pane.innerHTML),
  };
});
ok(r.comboVal === 'Trips__3|Long', 'Formation × Down tell uses the down|bucket key', JSON.stringify(r));
ok(r.comboMatched === 10, 'exact distances 8-12 all bucket into "3rd & Long" (n=10)', JSON.stringify(r));
ok(r.deadLinks === 0, 'every clickable tell resolves to at least one play', JSON.stringify(r));
ok(r.cutRows >= 1, 'tells render as clickable cut-rows', JSON.stringify(r));
ok(r.bucketLabel, 'bucket label "3rd & Long" shown in the pane', JSON.stringify(r));
ok(r.threat, 'recommendations name what the defense does (the "so what")', JSON.stringify(r));

console.log('\n== 6. Predictability Map: Formation × Situation heat-map, click-to-film ==');
r = await page.evaluate(() => {
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
  window.app.stats.showDashboard();
  window.app.reportsScreen.selectTab('selfscout');
  const pane = document.querySelector('#statsDashboard [data-pane="selfscout"]');
  return {
    rows: m.rows, cols: m.cols.map(c => c.key),
    iformFirst, shotgun3L,
    hasMap: /Predictability Map/.test(pane.innerHTML),
    clickableCells: pane.querySelectorAll('.sm-table .sm-cell.cut-row').length,
  };
});
ok(r.hasMap, 'Predictability Map section renders', JSON.stringify(r));
ok(r.rows.length === 3 && r.cols.length === 3, 'matrix has 3 formations × 3 situations present in data', JSON.stringify(r));
ok(r.cols.includes('1') && r.cols.includes('3|Long'), '1st collapses to the down; 3rd buckets by distance', JSON.stringify(r));
ok(r.iformFirst === 8, 'I-Form × 1st cell cut resolves to its 8 plays', JSON.stringify(r));
ok(r.shotgun3L === 8, 'Trips × 3rd & Long cell cut resolves to its 8 plays', JSON.stringify(r));
ok(r.clickableCells >= 3, 'populated cells are clickable to film', JSON.stringify(r));

console.log('\n== 7. Personnel → Formation Diversity: locked/leaning tells, click-to-film ==');
r = await page.evaluate(() => {
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
  window.app.stats.showDashboard();
  window.app.reportsScreen.selectTab('selfscout');
  const pane = document.querySelector('#statsDashboard [data-pane="selfscout"]');
  const section = pane?.querySelector('.ss-personnel-diversity');
  const cutRows = section ? section.querySelectorAll('tr.cut-row') : [];
  const deadLinks = Array.from(cutRows).filter(row => {
    const f = window.app.stats._buildCutFilter(row.dataset.cutType, row.dataset.cutVal);
    return !f || window.app.tagger.plays.filter(p => f(p)).length === 0;
  }).length;
  // Check Film Room Insights for the Personnel Tell
  const insightTags = rep.insights.map(i => i.tag);
  return {
    p11TopPct: p11?.topPct, p11TopForm: p11?.topFormation, p11Unique: p11?.uniqueFormations,
    p12TopPct: p12?.topPct, p12TopForm: p12?.topFormation,
    p21TopPct: p21?.topPct,
    hasSection: !!section,
    cutRowCount: cutRows.length,
    deadLinks,
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
ok(r.deadLinks === 0, 'all cut-rows resolve to plays', JSON.stringify(r));
ok(r.hasLockedFlag && r.hasLeaningFlag, 'Locked and Leaning flags both shown', JSON.stringify(r));
ok(r.hasPersonnelTell, 'Personnel Tell appears in Film Room Insights', JSON.stringify(r));

console.log('\n== S6-4c AX-2: the Predictability Map says what it means ==');
r = await page.evaluate(() => {
  const engine = window.app.stats;
  const html = engine._renderSelfScoutMatrix(engine.generateSelfScout().matrix);
  const host = document.createElement('div');
  host.innerHTML = html;
  const caption = host.querySelector('.viz-caption')?.textContent || '';
  const cells = [...host.querySelectorAll('.sm-cell')];
  const populated = cells.filter(cell => !cell.classList.contains('sm-empty'));
  const baselineMatch = caption.match(/your (\d+)% average/);
  // Recompute the baseline from the matrix itself, so the legend cannot claim a
  // number the data does not support. A 0% here was a real defect: it made every
  // predictable cell read as "working" because nothing could fall below it.
  const matrix = engine.generateSelfScout().matrix;
  let n = 0, s = 0;
  Object.values(matrix.cells).forEach(cell => { if (cell && cell.n) { n += cell.n; s += cell.succ || 0; } });
  const expected = n ? Math.round(s / n * 100) : 0;
  return {
    empty: cells.filter(cell => cell.classList.contains('sm-empty')).length,
    noDataWords: host.querySelectorAll('.sm-nodata').length,
    populated: populated.length,
    everyCellHasN: populated.every(cell => /^n=\d+/.test(cell.querySelector('.sm-n')?.textContent || '')),
    states: ['is-exploit', 'is-working', 'is-balanced', 'is-low'].filter(cls => host.querySelector('.sm-cell.' + cls)),
    keys: [...host.querySelectorAll('.sm-key')].map(node => node.textContent.trim()),
    corner: host.querySelector('.sm-corner')?.textContent || '',
    rowHeaders: host.querySelectorAll('th.sm-row-label[scope="row"]').length,
    rows: matrix.rows.length,
    cuts: host.querySelectorAll('.sm-cell.cut-row[data-cut-type="comboFS"]').length,
    baseline: baselineMatch ? Number(baselineMatch[1]) : null, expected,
    // H5/H11 rewrote captions to literal definitions, so the wording moved on
    // from "run/pass-classifiable offensive plays only". The GUARANTEE is
    // unchanged and still asserted: the caption must state which snaps are
    // included, or a coach reads the matrix as covering every play.
    mentionsInclusion: /offensive snaps with a run\/pass classification only/i.test(caption),
    mentionsThreshold: /Fewer than \d+ plays/.test(caption),
  };
});
ok(r.empty > 0 && r.noDataWords === r.empty,
  'An empty cell says "No data" in words rather than rendering a dot that reads as a value', JSON.stringify({ empty: r.empty, noData: r.noDataWords }));
ok(r.populated > 0 && r.everyCellHasN,
  'Every populated cell carries its sample size attached to the lean', JSON.stringify({ populated: r.populated }));
ok(r.baseline !== null && r.baseline === r.expected && r.baseline > 0,
  'The legend states the real baseline the cells are judged against', JSON.stringify({ shown: r.baseline, expected: r.expected }));
// Drive the classifier with a matrix built to contain one of each case, so this
// proves the RULE rather than whichever cases a fixture happens to produce.
r = await page.evaluate(() => {
  const engine = window.app.stats;
  const cell = (n, runs, succ) => ({ n, runs, passes: n - runs, succ, yards: n * 5 });
  // The cell key is formation + U+0001 + situation. Building it any other way
  // matches nothing — which is exactly what this test did on its first run.
  const K = (row, col) => `${row}${col}`;
  const matrix = {
    rows: ['Heavy', 'Light'],
    cols: [{ key: 'A', label: '1st' }, { key: 'B', label: '3rd & Long' }],
    rowN: { Heavy: 20, Light: 20 },
    cells: {
      // Predictable (100% run) and well above the baseline → a strength.
      [K('Heavy', 'A')]: cell(10, 10, 10),
      // Predictable (100% run) and well below it → the one to fix.
      [K('Heavy', 'B')]: cell(10, 10, 0),
      // Balanced.
      [K('Light', 'A')]: cell(10, 5, 5),
      // Two snaps: a lean, but far too few to call anything.
      [K('Light', 'B')]: cell(2, 2, 0),
    },
  };
  const host = document.createElement('div');
  host.innerHTML = engine._renderSelfScoutMatrix(matrix);
  const at = key => [...host.querySelectorAll('.sm-cell')].map(c => c.className);
  return {
    classes: at(), low: host.querySelectorAll('.sm-cell.is-low').length,
    exploit: host.querySelectorAll('.sm-cell.is-exploit').length,
    working: host.querySelectorAll('.sm-cell.is-working').length,
    balanced: host.querySelectorAll('.sm-cell.is-balanced').length,
    lowLabelled: /low/.test(host.querySelector('.sm-cell.is-low .sm-n')?.textContent || ''),
  };
});
ok(r.exploit === 1 && r.working === 1 && r.balanced === 1 && r.low === 1,
  'Predictable-and-ineffective, predictable-but-working, balanced and low-sample are four distinct states', JSON.stringify(r));
ok(r.lowLabelled,
  'A cell with too few snaps is labelled low rather than painted as a certainty', JSON.stringify({ lowLabelled: r.lowLabelled }));
r = await page.evaluate(() => {
  const engine = window.app.stats;
  const html = engine._renderSelfScoutMatrix(engine.generateSelfScout().matrix);
  const host = document.createElement('div'); host.innerHTML = html;
  const caption = host.querySelector('.viz-caption')?.textContent || '';
  return { keys: [...host.querySelectorAll('.sm-key')].map(n => n.textContent.trim()),
    // H5/H11 rewrote captions to literal definitions, so the wording moved on
    // from "run/pass-classifiable offensive plays only". The GUARANTEE is
    // unchanged and still asserted: the caption must state which snaps are
    // included, or a coach reads the matrix as covering every play.
    mentionsInclusion: /offensive snaps with a run\/pass classification only/i.test(caption),
    mentionsThreshold: /Fewer than \d+ plays/.test(caption),
    corner: host.querySelector('.sm-corner')?.textContent || '' };
});
ok(r.keys.length === 3 && r.mentionsInclusion && r.mentionsThreshold && /Formation/.test(r.corner),
  'The legend names the states, the inclusion rule and the small-sample threshold', JSON.stringify({ keys: r.keys, corner: r.corner }));
ok(r.rowHeaders === r.rows && r.cuts === r.populated,
  'Every formation is a row header and every populated cell keeps its exact film cut', JSON.stringify({ rowHeaders: r.rowHeaders, rows: r.rows, cuts: r.cuts, populated: r.populated }));

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
