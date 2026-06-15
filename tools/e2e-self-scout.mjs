/* E2E harness — defensive self-scout in the stats dashboard. Covers the paths
   the other harnesses never open:
     1. The Self-Scout TAB renders the defensive section (the reported "self
        scout doesn't mention defense" bug — it only ever showed in a separate
        overlay before).
     2. Defensive plays tagged with Front/Coverage/Blitz but NO offensive
        playType still count (the _currentPlays() gating bug).
     3. The Defense TAB also shows the scheme-tells section.
     4. generateDefensiveSelfScout runs once per dashboard render, not twice.

   Run after build:  bash build.sh && node tools/e2e-self-scout.mjs */
import puppeteer from 'puppeteer';

const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
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
await page.type('#teamSetupName', 'Mavericks');
await click('#btnTeamSetupSave');
await sleep(300);
await click('#btnExploreDemo');
await sleep(900);
await page.evaluate(() => document.querySelectorAll('.sch-row')[0].click());
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
    plays.push(mk({ unit: 'offense', down: '1', distance: '10', formation: 'Shotgun',
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
  const ss = document.querySelector('#statsDashboard [data-pane="selfscout"]');
  const def = document.querySelector('#statsDashboard [data-pane="defense"]');
  return {
    selfScoutHasDef: !!ss?.querySelector('.ss-def-section'),
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
  eng.showDashboard();
  eng.generateDefensiveSelfScout = orig;   // restore
  return { count };
});
ok(r.count === 1, 'one defensive-self-scout computation per dashboard render', JSON.stringify(r));

console.log('\n== 5. Actionable tells: distance buckets, clickable-to-film, defensive counter ==');
r = await page.evaluate(() => {
  const mk = window.__mk;
  // 10 offensive plays: Shotgun on 3rd down, varied exact distances 8-12
  // (all "Long"), every one a pass — a strong, exploitable, single tell that
  // ONLY emerges if exact distances are bucketed together.
  const plays = [];
  for (let i = 0; i < 10; i++) plays.push(mk({ unit: 'offense', down: '3',
    distance: String(8 + (i % 5)), formation: 'Shotgun', playType: 'Short Pass',
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
ok(r.comboVal === 'Shotgun__3|Long', 'Formation × Down tell uses the down|bucket key', JSON.stringify(r));
ok(r.comboMatched === 10, 'exact distances 8-12 all bucket into "3rd & Long" (n=10)', JSON.stringify(r));
ok(r.deadLinks === 0, 'every clickable tell resolves to at least one play', JSON.stringify(r));
ok(r.cutRows >= 1, 'tells render as clickable cut-rows', JSON.stringify(r));
ok(r.bucketLabel, 'bucket label "3rd & Long" shown in the pane', JSON.stringify(r));
ok(r.threat, 'recommendations name what the defense does (the "so what")', JSON.stringify(r));

console.log('\n== 6. Predictability Map: Formation × Situation heat-map, click-to-film ==');
r = await page.evaluate(() => {
  const mk = window.__mk;
  const plays = [];
  // I-Form 1st = run-heavy; Shotgun 3rd & Long = pass-heavy; Singleback 2nd & Med = balanced.
  for (let i = 0; i < 8; i++) plays.push(mk({ unit: 'offense', down: '1', distance: '10',
    formation: 'I-Form', playType: i < 7 ? 'Run Inside' : 'Short Pass', runPass: i < 7 ? 'Run' : 'Pass', result: 'Gain', yardage: '4' }));
  for (let i = 0; i < 8; i++) plays.push(mk({ unit: 'offense', down: '3', distance: String(8 + i % 4),
    formation: 'Shotgun', playType: 'Short Pass', runPass: 'Pass', result: 'Incomplete', yardage: '2' }));
  for (let i = 0; i < 8; i++) plays.push(mk({ unit: 'offense', down: '2', distance: '5',
    formation: 'Singleback', playType: i % 2 ? 'Short Pass' : 'Run Inside', runPass: i % 2 ? 'Pass' : 'Run', result: 'Gain', yardage: '5' }));
  window.app.tagger.plays = plays;
  window.app.stats.filter.active = false;
  const m = window.app.stats.generateSelfScout().matrix;
  // 1st & 4th collapse to the down; 2nd/3rd bucket by distance.
  const iformFirst = window.app.tagger.plays.filter(window.app.stats._buildCutFilter('comboFS', 'I-Form__1')).length;
  const shotgun3L = window.app.tagger.plays.filter(window.app.stats._buildCutFilter('comboFS', 'Shotgun__3|Long')).length;
  window.app.stats.showDashboard();
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
ok(r.shotgun3L === 8, 'Shotgun × 3rd & Long cell cut resolves to its 8 plays', JSON.stringify(r));
ok(r.clickableCells >= 3, 'populated cells are clickable to film', JSON.stringify(r));

console.log('\n== 7. Personnel → Formation Diversity: locked/leaning tells, click-to-film ==');
r = await page.evaluate(() => {
  const mk = window.__mk;
  const plays = [];
  // 11 personnel → always Shotgun (locked, 100%)
  for (let i = 0; i < 8; i++) plays.push(mk({ unit: 'offense', down: '1', distance: '10',
    personnel: '11', formation: 'Shotgun', playType: i % 2 ? 'Short Pass' : 'Run Inside',
    runPass: i % 2 ? 'Pass' : 'Run', result: 'Gain', yardage: '5' }));
  // 12 personnel → I-Form 6/8 (75%, leaning), Singleback 2/8
  for (let i = 0; i < 6; i++) plays.push(mk({ unit: 'offense', down: '1', distance: '10',
    personnel: '12', formation: 'I-Form', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '4' }));
  for (let i = 0; i < 2; i++) plays.push(mk({ unit: 'offense', down: '2', distance: '6',
    personnel: '12', formation: 'Singleback', playType: 'Short Pass', runPass: 'Pass', result: 'Gain', yardage: '6' }));
  // 21 personnel → diverse (no tell) — 3 formations roughly equal
  for (let i = 0; i < 6; i++) plays.push(mk({ unit: 'offense', down: '2', distance: '5',
    personnel: '21', formation: ['I-Form', 'Singleback', 'Pistol'][i % 3],
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
ok(r.p11TopPct === 100 && r.p11TopForm === 'Shotgun', '11 personnel locked to Shotgun at 100%', JSON.stringify(r));
ok(r.p12TopPct === 75 && r.p12TopForm === 'I-Form', '12 personnel leaning to I-Form at 75%', JSON.stringify(r));
ok(r.p21TopPct <= 50, '21 personnel is diverse (no tell)', JSON.stringify(r));
ok(r.hasSection, 'Personnel → Formation Diversity section renders', JSON.stringify(r));
ok(r.cutRowCount === 2, 'only locked/leaning groups render (11 and 12, not 21)', JSON.stringify(r));
ok(r.deadLinks === 0, 'all cut-rows resolve to plays', JSON.stringify(r));
ok(r.hasLockedFlag && r.hasLeaningFlag, 'Locked and Leaning flags both shown', JSON.stringify(r));
ok(r.hasPersonnelTell, 'Personnel Tell appears in Film Room Insights', JSON.stringify(r));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) console.log('Console/page errors:\n' + errors.join('\n'));
else console.log('No console/page errors.');
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
