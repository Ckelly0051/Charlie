/**
 * Reports > Self-Scout — the approved 2026-09-05 desktop composition, its
 * five sections, the analytics contracts they rest on, and the copy and
 * containment rules the comp record fixes.
 *
 * Comp and decision record: design-comps/reports-self-scout-2026-09-05/
 * (`self-scout.html`, `RATIONALE.md`, sections 17-18 and the revision 4
 * typography correction). Authoritative checkpoint dd9812a.
 *
 * Every assertion drives the real route and reads the rendered result or the
 * engine's own output. None of it searches source text: a test that greps a
 * selector passes against a file that never renders. Where a test is about
 * column geometry it measures the rendered cell against its own content box,
 * because `table-layout:fixed` overflows silently rather than growing.
 */
import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 240000 });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(TEST_APP_URL, { waitUntil: 'networkidle0' });
await sleep(600);
await page.evaluate(async () => {
  await window.app.storage.createSeason({ name: '2026 Self-Scout QA', team: 'Ridgebacks', year: '2026', level: 'Varsity' });
});

const off = t => ({ unit: 'offense', ...t });
const def = t => ({ unit: 'defense', ...t });
const rep = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

/* A real offensive identity: a Power-I run game that works, an Empty
   third-down quick game that does not, a balanced Trips base, and an Ace
   package carrying the one sack and the one giveaway. */
const OFFENSE = [
  ...rep(14, i => off({ formation: 'Power-I', personnel: '21', backfield: 'Power', strength: 'Right', hash: 'Middle',
    runPass: 'Run', playType: 'Run Inside', playCall: '26 Blast', playConcept: 'Inside Zone',
    result: i % 5 === 0 ? 'Touchdown' : 'Gain', yardage: String(6 + (i % 5) * 3),
    down: String((i % 3) + 1), distance: i % 3 === 0 ? '10' : '5' })),
  ...rep(12, i => off({ formation: 'Empty', personnel: '10', strength: 'Left', hash: 'Left',
    runPass: 'Pass', playType: 'Quick Pass', playCall: 'Stick', playConcept: 'Stick',
    result: i % 3 === 0 ? 'Incomplete' : 'Gain', yardage: i % 3 === 0 ? '0' : '4', down: '3', distance: '8' })),
  ...rep(16, i => off({ formation: 'Trips', personnel: '11', strength: 'Right', hash: 'Right',
    runPass: i % 3 === 0 ? 'Run' : 'Pass', playType: i % 3 === 0 ? 'Run Outside' : 'Short Pass',
    playCall: i % 3 === 0 ? 'Outside Zone' : 'Smash', playConcept: i % 3 === 0 ? 'Outside Zone' : 'Smash',
    result: 'Gain', yardage: String(3 + (i % 6) * 2), down: String((i % 4) + 1), distance: String(3 + (i % 8)) })),
  ...rep(10, i => off({ formation: 'Ace', personnel: '12', strength: 'Left', hash: 'Middle',
    runPass: i < 7 ? 'Run' : 'Pass', playType: i < 7 ? 'Run Inside' : 'Deep Pass',
    playCall: i < 7 ? 'Iso' : 'Four Verts', playConcept: i < 7 ? 'Iso' : 'Verticals',
    result: i === 9 ? 'Interception' : (i === 8 ? 'Sack' : 'Gain'),
    yardage: i === 9 ? '0' : (i === 8 ? '-7' : String(2 + i)), down: '1', distance: '10' })),
  /* Red-zone touchdowns and a third-down conversion the summary must count. */
  ...rep(3, i => off({ formation: 'Power-I', personnel: '22', backfield: 'Power', strength: 'Right', hash: 'Middle',
    runPass: 'Run', playType: 'Run Inside', playCall: 'Power G', playConcept: 'Power',
    result: 'Touchdown', yardage: '6', down: '3', distance: '4', fieldSide: 'opp', yardLine: '6' })),
];
/* Defensive calls. `4-2-5 + Cover 3` is charted with NO pressure at all: the
   composite identity must omit the blank rather than inventing "No blitz". */
const DEFENSE = [
  ...rep(18, i => def({ defFront: '4-2-5', coverage: 'Cover 3',
    runPass: i % 2 ? 'Pass' : 'Run', playType: i % 2 ? 'Short Pass' : 'Run Inside',
    result: i % 4 === 0 ? 'No Gain' : 'Gain', yardage: String(i % 4 === 0 ? 1 : 5 + (i % 5)),
    down: String((i % 3) + 1), distance: '8' })),
  ...rep(11, i => def({ defFront: '3-3-5', coverage: 'Cover 2', blitz: 'Edge',
    runPass: 'Pass', playType: 'Deep Pass',
    result: i % 5 === 0 ? 'Sack' : (i % 4 === 0 ? 'Incomplete' : 'Gain'),
    yardage: i % 5 === 0 ? '-8' : (i % 4 === 0 ? '0' : '11'), down: '3', distance: '9' })),
  ...rep(9, i => def({ defFront: '4-2-5', coverage: 'Cover 1', blitz: 'Mike',
    runPass: 'Run', playType: 'Run Outside',
    result: i % 3 === 0 ? 'Loss' : 'Gain', yardage: i % 3 === 0 ? '-2' : '4', down: '2', distance: '6' })),
  /* Two calls that tie on stop rate and differ only on yards allowed, so the
     second ranking key is exercised rather than assumed. */
  ...rep(4, () => def({ defFront: 'Bear', coverage: 'Cover 0', blitz: 'Field',
    runPass: 'Run', playType: 'Run Inside', result: 'No Gain', yardage: '1', down: '2', distance: '7' })),
  ...rep(4, () => def({ defFront: 'Okie', coverage: 'Cover 0', blitz: 'Field',
    runPass: 'Run', playType: 'Run Inside', result: 'No Gain', yardage: '2', down: '2', distance: '7' })),
];
const FULL = [...OFFENSE, ...DEFENSE];
/* Defense charted but never scheme-tagged: the section must say so. */
const DEF_UNATTRIBUTED = [...OFFENSE, ...rep(14, i => def({ runPass: i % 2 ? 'Pass' : 'Run',
  playType: i % 2 ? 'Short Pass' : 'Run Inside', result: 'Gain', yardage: '5', down: '1', distance: '10' }))];
/* Under the six-snap scheme gate. */
const DEF_INSUFFICIENT = [...OFFENSE, ...rep(4, () => def({ defFront: '4-2-5', coverage: 'Cover 3',
  runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '4', down: '1', distance: '10' }))];
/* No offensive play classifies as run or pass. */
const NO_OFFENSE = [...rep(6, () => off({ playType: 'Kneel', result: 'No Gain', yardage: '0', down: '1', distance: '10' })), ...DEFENSE];
/* Sparse: two offensive groups, one call below the three-play qualification. */
const SPARSE = [
  ...rep(5, i => off({ formation: 'Trips', personnel: '11', strength: 'Right', hash: 'Right', runPass: 'Run',
    playType: 'Run Outside', playCall: 'Outside Zone', playConcept: 'Outside Zone',
    result: 'Gain', yardage: String(5 + i), down: '1', distance: '10' })),
  ...rep(2, i => off({ formation: 'Ace', personnel: '12', strength: 'Left', hash: 'Middle', runPass: 'Pass',
    playType: 'Short Pass', playCall: 'Stick', playConcept: 'Stick',
    result: i === 1 ? 'Incomplete' : 'Gain', yardage: i === 1 ? '0' : '7', down: '2', distance: '6' })),
  ...rep(7, i => def({ defFront: '4-2-5', coverage: 'Cover 3', blitz: i % 3 === 0 ? 'Mike' : '',
    runPass: i % 2 ? 'Pass' : 'Run', playType: i % 2 ? 'Short Pass' : 'Run Inside',
    result: i % 2 ? 'Gain' : 'No Gain', yardage: i % 2 ? '7' : '1', down: '2', distance: '6' })),
];
/* Imported labels longer than any panel can give them. */
const LONG_LABELS = [
  ...rep(9, i => off({ formation: 'Trips Right Wing Nasty Over', personnel: '11 Personnel (Base Spread)',
    backfield: 'Offset Weak', strength: 'Right', hash: 'Right', runPass: 'Pass', playType: 'Play Action',
    playCall: 'Boot Right Y-Cross Deep Over Alert', playConcept: 'Play Action Crossers Deep Over',
    result: 'Gain', yardage: String(9 + i), down: '2', distance: '7' })),
  ...rep(8, i => off({ formation: 'Empty Trey Bunch Left Tight', personnel: '10 Personnel (Empty Spread)',
    strength: 'Left', hash: 'Left', runPass: 'Pass', playType: 'Quick Pass',
    playCall: 'Quick Game Stick Nod Alert Fade Now', playConcept: 'Quick Game Stick Concept Alert',
    result: i % 3 === 0 ? 'Incomplete' : 'Gain', yardage: i % 3 === 0 ? '0' : '5', down: '3', distance: '11' })),
  ...rep(12, i => def({ defFront: i % 2 ? 'Over Front 4-2-5 Nickel Field' : 'Under Front 3-3-5 Dime Boundary',
    coverage: i % 2 ? 'Cover 3 Sky Match Weak' : 'Cover 4 Quarters Match Strong',
    blitz: i % 4 === 0 ? 'Field Nickel Pressure Overload' : '',
    runPass: i % 2 ? 'Pass' : 'Run', playType: i % 2 ? 'Deep Pass' : 'Run Inside',
    result: i % 3 === 0 ? 'No Gain' : 'Gain', yardage: i % 3 === 0 ? '1' : String(6 + (i % 4)),
    down: String((i % 3) + 1), distance: '8' })),
];

const load = async plays => {
  await page.evaluate(async list => {
    const store = window.app.storage.seasonStore;
    store.data.games = [{
      id: 'g-0', name: 'Week 1 vs Northgate', nextId: list.length + 1,
      plays: list.map((row, i) => ({ id: i + 1, timestamp: { start: i * 10, end: i * 10 + 6 },
        notes: '', annotations: [], tags: { custom: [], players: {}, grades: {}, quarter: 'Q1', ...row } })),
      gameInfo: { opponent: 'Northgate', date: '2026-09-01', week: '1', projectName: 'Northgate',
        perspective: 'self', scoreUs: 21, scoreThem: 7 },
      annotations: [], clipNames: [], isMultiClip: false, status: 'active', currentPlayId: 1,
    }];
    store.data.activeGameId = 'g-0';
    await window.app.storage._loadActiveGame({ renderGames: false });
  }, plays);
  await sleep(450);
  await page.evaluate(() => window.app.workspaceShell.show('reports'));
  await sleep(250);
  await page.evaluate(() => { window.app.reportsScreen.selfScoutSection = 'summary'; });
  await page.evaluate(() => window.app.reportsScreen.selectTab('selfscout'));
  await sleep(650);
};
const setSection = async title => {
  await page.evaluate(t => [...document.querySelectorAll('.gi-selfscout-nav button')]
    .find(b => b.textContent.trim().startsWith(t))?.click(), title);
  await sleep(320);
};
/** The engine's own Self-Scout models over the rendered cohort. */
const model = () => page.evaluate(() => {
  const screen = window.app.reportsScreen;
  const engine = window.app.stats;
  const { scoped } = screen._selfScoutCohort();
  const performance = engine.compute(scoped);
  const report = engine.generateSelfScout(scoped);
  const callRows = engine._selfScoutRows(engine._selfScoutGroup(performance.offPlays,
    p => p.tags.playCall || p.tags.playConcept || null));
  return {
    summary: report ? engine.selfScoutSummary(performance, callRows) : null,
    defSummary: engine.selfScoutDefenseSummary(performance),
    efficiency: performance.efficiency, downs: performance.downs, scoring: performance.scoring,
    rushing: performance.rushing, passing: performance.passing,
    negative: performance.negativePlays, redZone: performance.situational.redZone,
    defensive: performance.defensive,
    offRefs: Object.fromEntries(callRows.map(r => [r.key, r.refs])),
    offPlayCalls: performance.offPlays.map(p => ({
      ref: engine.constructor._compositeRef(p), call: p.tags.playCall || p.tags.playConcept || null })),
    defPlayCalls: performance.defPlays.map(p => ({
      ref: engine.constructor._compositeRef(p), call: engine.constructor._defenseCallKey(p) })),
    defYards: performance.defPlays.reduce((sum, p) => sum + (parseInt(p.tags.yardage) || 0), 0),
    totalPlays: report ? report.totalPlays : 0,
  };
});
const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

/* ══ 1. The approved composition ══════════════════════════════════════════ */
console.log('\n== 1. The approved composition ==');
await load(FULL);
const comp = await page.evaluate(() => {
  const report = document.querySelector('.gi-selfscout-report');
  const toolbar = document.querySelector('.gi-selfscout-toolbar');
  const nav = document.querySelector('.gi-selfscout-nav');
  const acts = document.querySelector('.gi-selfscout-acts');
  const box = el => el?.getBoundingClientRect();
  return {
    board: !!document.querySelector('.gi-selfscout-board'),
    sections: [...nav.querySelectorAll('button')].map(b => b.firstChild.textContent.trim()),
    // Scope, section navigation and Export share ONE control row.
    oneRow: Math.abs(box(toolbar).top - box(nav).top) < 2 && Math.abs(box(nav).top - box(acts).top) < 2,
    exportLabel: acts.querySelector('button')?.textContent.trim(),
    capped: Math.round(box(report).width) <= 1648,
    centred: Math.abs(box(report).left - (window.innerWidth - box(report).width - box(report).left)) < 40,
    navCounts: [...nav.querySelectorAll('button > b')].map(b => b.textContent.trim()),
    active: nav.querySelector('button.active')?.firstChild.textContent.trim(),
    sample: [...(document.querySelector('.gi-selfscout-sample')?.querySelectorAll('b') || [])]
      .map(b => b.textContent.trim()),
    summaryModules: document.querySelectorAll('.gi-ss-module').length,
    summaryDimmed: nav.querySelector('button')?.classList.contains('is-none'),
  };
});
ok(comp.board, 'the Self-Scout board renders');
ok(JSON.stringify(comp.sections) === JSON.stringify(
  ['Offensive Summary', 'Calls & Situations', 'Structure', 'Defense', 'Tendencies']),
'five sections in the approved order', JSON.stringify(comp.sections));
ok(comp.oneRow, 'scope, section navigation and Export share one control row');
ok(comp.exportLabel === 'Export report', 'the export command reads "Export report"', comp.exportLabel);
ok(comp.capped, 'the report canvas is capped at 1648px');
ok(comp.active === 'Offensive Summary', 'the board opens on Offensive Summary', comp.active);
ok(comp.navCounts.every(v => /^\d+$/.test(v)), 'every section names its own row count', comp.navCounts.join(','));
/* The Offensive Summary badge counted `callRows` — the ranked play-call list
   built from `playCall || playConcept`. The canonical season charts neither in
   any of its six games, so it read 0 in BOTH scopes above a section rendering
   populated KPIs, and the zero dimmed the tab through `is-none`. It counts the
   classified sample the summary is actually computed over. */
ok(comp.summaryModules > 0 && Number(comp.navCounts[0]) > 0,
  'a populated Offensive Summary never badges zero',
  JSON.stringify({ count: comp.navCounts[0], modules: comp.summaryModules }));
ok(comp.navCounts[0] === comp.sample[0],
  'the Offensive Summary badge is the classified sample the section is computed over',
  JSON.stringify({ badge: comp.navCounts[0], sample: comp.sample[0] }));
ok(comp.summaryDimmed === false,
  'a populated Offensive Summary tab is not dimmed as empty', String(comp.summaryDimmed));

/* ══ 2. Module headers carry the title only ═══════════════════════════════ */
console.log('\n== 2. Module headers carry the title only ==');
const BANNED = [
  '3+ plays', 'classified plays', 'success baseline', 'predictability qualifies',
  'no red zone snaps charted', 'select a row to watch film', 'what to keep and what to break',
  'where possessions are won or lost', 'what the huddle gives away',
  '0 is balanced; 100 is one-dimensional', 'Recommendations', 'Film Room Insights', 'N/A',
];
const SECTION_TITLES = ['Offensive Summary', 'Calls & Situations', 'Structure', 'Defense', 'Tendencies'];
let metaCount = 0, bannedHits = [], titles = [];
for (const title of SECTION_TITLES) {
  await setSection(title);
  const found = await page.evaluate(banned => {
    const board = document.querySelector('.gi-selfscout-board');
    const text = board ? board.textContent : (document.querySelector('.gi-reports-empty')?.textContent || '');
    return {
      metas: [...document.querySelectorAll('.gi-ss-module > header span')].length,
      titles: [...document.querySelectorAll('.gi-ss-module > header strong')].map(s => s.textContent.trim()),
      hits: banned.filter(word => text.includes(word)),
    };
  }, BANNED);
  metaCount += found.metas;
  bannedHits.push(...found.hits.map(h => `${title}: ${h}`));
  titles.push(...found.titles);
}
ok(metaCount === 0, 'no module renders a subhead, count, threshold or caption', `${metaCount} found`);
ok(bannedHits.length === 0, 'no banned production copy renders in any section', bannedHits.join(' / '));
ok(titles.length > 0 && titles.every(t => !/\d/.test(t)),
  'no module title carries a number', titles.filter(t => /\d/.test(t)).join(','));

/* ══ 3. Typography and density ════════════════════════════════════════════ */
console.log('\n== 3. Typography and density ==');
await setSection('Offensive Summary');
const type = await page.evaluate(() => {
  const px = (el, prop) => el ? parseFloat(getComputedStyle(el)[prop]) : null;
  const face = el => el ? getComputedStyle(el).fontFamily : '';
  const title = document.querySelector('.gi-ss-module > header strong');
  const th = document.querySelector('table.gi-ss-table thead th');
  const td = document.querySelector('table.gi-ss-table tbody td');
  const tr = document.querySelector('table.gi-ss-table tbody tr');
  const navButton = document.querySelector('.gi-selfscout-nav button');
  const all = [...document.querySelectorAll('.gi-selfscout-board *')]
    .filter(el => el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim()));
  return {
    titleSize: px(title, 'fontSize'), titleFace: face(title),
    titleTransform: title ? getComputedStyle(title).textTransform : '',
    titleSpacing: title ? getComputedStyle(title).letterSpacing : '',
    thSize: px(th, 'fontSize'), thWeight: px(th, 'fontWeight'), thFace: face(th),
    tdSize: px(td, 'fontSize'), rowHeight: tr ? Math.round(tr.getBoundingClientRect().height) : null,
    navSize: px(navButton, 'fontSize'), navTransform: navButton ? getComputedStyle(navButton).textTransform : '',
    floor: Math.min(...all.map(el => parseFloat(getComputedStyle(el).fontSize))),
  };
});
ok(type.titleSize === 14, 'module titles are 14px', String(type.titleSize));
ok(/Plex Sans/.test(type.titleFace) && !/Condensed/.test(type.titleFace),
  'module titles use readable IBM Plex Sans', type.titleFace);
ok(type.titleTransform === 'none' && (type.titleSpacing === 'normal' || parseFloat(type.titleSpacing) === 0),
  'module titles carry no forced uppercase and no tracking', `${type.titleTransform} / ${type.titleSpacing}`);
ok(type.thSize === 12 && type.thWeight === 600, 'table column headers are 12px semibold',
  `${type.thSize}px / ${type.thWeight}`);
ok(/Plex Sans/.test(type.thFace) && !/Condensed/.test(type.thFace), 'column headers use Plex Sans', type.thFace);
ok(type.tdSize === 13, 'data rows are 13px', String(type.tdSize));
ok(type.rowHeight === 38, 'data rows are 38px', String(type.rowHeight));
ok(type.navSize === 12 && type.navTransform === 'none',
  'section navigation is readable 12px Sans with no forced uppercase', `${type.navSize} / ${type.navTransform}`);
ok(type.floor >= 9.5, 'nothing on the board renders below the 9.5px floor', String(type.floor));

/* ══ 4. Offensive Summary — composition and canonical values ══════════════ */
console.log('\n== 4. Offensive Summary ==');
const m = await model();
const summaryDom = await page.evaluate(() => {
  const bands = [...document.querySelectorAll('.gi-ss-band')];
  const rows = band => [...band.querySelectorAll('.gi-ss-crow')]
    .map(r => [r.querySelector('span').textContent.trim(), r.querySelector('strong').textContent.trim()]);
  return {
    kpis: [...document.querySelectorAll('.gi-overview-kpi')]
      .map(k => [k.querySelector('span').textContent.trim(), k.querySelector('strong').textContent.trim()]),
    bandShape: bands.map(b => b.className.trim()),
    modules: bands.map(b => [...b.querySelectorAll('.gi-ss-module > header strong')].map(s => s.textContent.trim())),
    positive: rows(bands[0]), negative: bands[0] ? rows(bands[0]) : [],
    rowsByModule: [...document.querySelectorAll('.gi-ss-module')].map(mod => [
      mod.querySelector('header strong').textContent.trim(), rows(mod)]),
    columns: [...document.querySelectorAll('table.gi-ss-table thead')]
      .map(t => [...t.querySelectorAll('th')].map(x => x.textContent.trim()).join(' | ')),
  };
});
ok(summaryDom.kpis.length === 6, 'six offensive KPI tiles', String(summaryDom.kpis.length));
ok(JSON.stringify(summaryDom.kpis.map(k => k[0])) === JSON.stringify(
  ['Success Rate', 'Yards / Play', 'Explosive Rate', 'Negative Play Rate', 'Third Down', 'Red Zone TD']),
'the approved six KPI labels', JSON.stringify(summaryDom.kpis.map(k => k[0])));
ok(summaryDom.bandShape.length === 3 && summaryDom.bandShape.every(c => c.includes('b-2')),
  'three two-column rows beneath the KPI band', summaryDom.bandShape.join(' / '));
ok(JSON.stringify(summaryDom.modules) === JSON.stringify([
  ['Positive Plays', 'Negative Plays'], ['Top Calls', 'Worst Calls'], ['Run Offense', 'Pass Offense']]),
'the approved module pairs and order', JSON.stringify(summaryDom.modules));
const byModule = Object.fromEntries(summaryDom.rowsByModule);
ok(JSON.stringify(byModule['Positive Plays'].map(r => r[0])) === JSON.stringify(
  ['Successful plays', 'Explosive plays', 'Touchdowns', 'Third-down conversions', 'Red-zone touchdowns']),
'Positive Plays lists the five approved rows', JSON.stringify(byModule['Positive Plays']));
ok(JSON.stringify(byModule['Negative Plays'].map(r => r[0])) === JSON.stringify(
  ['Negative plays', 'Turnovers', 'Sacks', 'Plays for loss', 'Penalties']),
'Negative Plays lists the five approved rows', JSON.stringify(byModule['Negative Plays']));
ok(JSON.stringify(byModule['Run Offense'].map(r => r[0])) === JSON.stringify(
  ['Attempts', 'Rushing yards', 'Yards per carry', 'Success rate', 'Explosive runs']),
'Run Offense lists the five approved rows', JSON.stringify(byModule['Run Offense']));
ok(JSON.stringify(byModule['Pass Offense'].map(r => r[0])) === JSON.stringify(
  ['Attempts', 'Passing yards', 'Yards per attempt', 'Success rate', 'Explosive passes', 'Sacks']),
'Pass Offense lists the six approved rows', JSON.stringify(byModule['Pass Offense']));
ok(summaryDom.columns.every(c => c === 'Call / Concept | Plays | Yds / Play | Success'),
  'Top and Worst Calls carry the approved four columns', summaryDom.columns.join(' // '));

/* Canonical reuse: every summary count equals its existing metric owner. */
const p = m.summary.positive, n = m.summary.negative;
ok(p.successful === m.efficiency.successes,
  'Successful plays is compute()\'s own success count', `${p.successful} vs ${m.efficiency.successes}`);
ok(p.explosive === m.efficiency.explosivePlays,
  'Explosive plays is compute()\'s own explosive count', `${p.explosive} vs ${m.efficiency.explosivePlays}`);
ok(p.touchdowns === m.scoring.touchdowns,
  'Touchdowns is compute()\'s own scoring count', `${p.touchdowns} vs ${m.scoring.touchdowns}`);
ok(p.redZoneTouchdowns === m.redZone.tds && p.redZoneTouchdowns > 0,
  'Red-zone touchdowns is the canonical red-zone cohort', `${p.redZoneTouchdowns} vs ${m.redZone.tds}`);
ok(`${p.thirdDownConversions}/${m.downs.byDown['3'].total}` === m.downs.thirdDownConv,
  'Third-down conversions matches the canonical conversion rate',
  `${p.thirdDownConversions} vs ${m.downs.thirdDownConv}`);
ok(n.negative === m.negative.distinct && n.turnovers === m.negative.turnovers
  && n.sacks === m.passing.sacks && n.playsForLoss === m.negative.playsForLoss
  && n.penalties === m.negative.penalties,
'every negative-play count is `_negativePlayStats`\'s own');
ok(m.summary.run.attempts === m.rushing.attempts
  && m.summary.run.yards === m.rushing.yards
  && m.summary.pass.attempts === m.passing.attempts
  && m.summary.pass.yards === m.passing.yards
  && m.summary.pass.sacks === m.passing.sacks,
  'run and pass totals use the canonical rushing and passing ledgers',
  JSON.stringify({ summary: m.summary, rushing: m.rushing, passing: m.passing }));

/* ══ 5. Offensive call ranking ════════════════════════════════════════════ */
console.log('\n== 5. Offensive call ranking ==');
const rank = m.summary;
ok(rank.topCalls.every(r => r.n >= 3) && rank.worstCalls.every(r => r.n >= 3),
  'no call under three plays is ranked',
  JSON.stringify([...rank.topCalls, ...rank.worstCalls].map(r => `${r.key}:${r.n}`)));
const descending = rows => rows.every((row, i) => i === 0 || (
  rows[i - 1].succRate > row.succRate
  || (rows[i - 1].succRate === row.succRate && rows[i - 1].avg > row.avg)
  || (rows[i - 1].succRate === row.succRate && rows[i - 1].avg === row.avg && rows[i - 1].n >= row.n)));
ok(descending(rank.topCalls), 'Top Calls rank by success rate, then yards per play, then sample',
  JSON.stringify(rank.topCalls.map(r => `${r.key} ${r.succRate}% ${r.avg} n=${r.n}`)));
ok(descending([...rank.worstCalls].reverse()), 'Worst Calls is that same ranking reversed',
  JSON.stringify(rank.worstCalls.map(r => `${r.key} ${r.succRate}% ${r.avg} n=${r.n}`)));
const rerun = await model();
ok(JSON.stringify(rerun.summary.topCalls.map(r => r.key)) === JSON.stringify(rank.topCalls.map(r => r.key))
  && JSON.stringify(rerun.summary.worstCalls.map(r => r.key)) === JSON.stringify(rank.worstCalls.map(r => r.key)),
'the ranking is deterministic across repeated evaluation');

/* ══ 6. Offensive call film cohorts ═══════════════════════════════════════ */
console.log('\n== 6. Offensive call film cohorts ==');
let cohortMismatch = [];
for (const row of [...rank.topCalls, ...rank.worstCalls]) {
  const expected = [...new Set(m.offPlayCalls.filter(x => x.call === row.key && x.ref).map(x => x.ref))].sort();
  const actual = [...(row.refs || [])].sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual) || expected.length !== row.n) {
    cohortMismatch.push(`${row.key}: n=${row.n} refs=${actual.length} expected=${expected.length}`);
  }
}
ok(cohortMismatch.length === 0,
  'every ranked call carries the exact composite refs of its contributing plays', cohortMismatch.join(' / '));
ok([...rank.topCalls, ...rank.worstCalls].every(r => r.refs.every(ref => /^[^:]+::\d+$/.test(ref))),
  'those refs are composite gameId::playId values',
  JSON.stringify(rank.topCalls[0]?.refs?.slice(0, 2)));
await setSection('Offensive Summary');
const clickable = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('table.gi-ss-table tbody tr')];
  return { total: rows.length, cut: rows.filter(r => r.classList.contains('cut-row')).length };
});
ok(clickable.total > 0 && clickable.cut === clickable.total,
  'every ranked call row is a real film action', `${clickable.cut}/${clickable.total}`);

/* ══ 7. Defensive composite call contract ═════════════════════════════════ */
console.log('\n== 7. Defensive composite call contract ==');
const d = m.defSummary;
const keys = d.calls.map(r => r.key);
ok(keys.includes('4-2-5 · Cover 3'),
  'a front and coverage with no charted pressure is ONE call, with the blank omitted', keys.join(' / '));
ok(!keys.some(k => /no blitz/i.test(k)),
  'an untagged pressure is never relabelled "No blitz"', keys.join(' / '));
ok(keys.includes('4-2-5 · Cover 1 · Mike') && keys.includes('3-3-5 · Cover 2 · Edge'),
  'front, coverage and pressure join in that order into one composite identity', keys.join(' / '));
ok(!keys.some(k => k.split(' · ').length > 3), 'a call never carries more than its three components', keys.join(' / '));
const cover3 = d.calls.find(r => r.key === '4-2-5 · Cover 3');
ok(cover3 && cover3.n === 18, 'the composite groups every play that shares the identity', String(cover3?.n));
ok(d.topCalls.every(r => r.n >= 3) && d.worstCalls.every(r => r.n >= 3),
  'no defensive call under three plays is ranked');
const defDescending = rows => rows.every((row, i) => i === 0 || (
  rows[i - 1].stopRate > row.stopRate
  || (rows[i - 1].stopRate === row.stopRate && rows[i - 1].avgYds < row.avgYds)
  || (rows[i - 1].stopRate === row.stopRate && rows[i - 1].avgYds === row.avgYds && rows[i - 1].n >= row.n)));
ok(defDescending(d.topCalls), 'Top Calls rank by stop rate, then LOWER yards allowed, then sample',
  JSON.stringify(d.topCalls.map(r => `${r.key} ${r.stopRate}% ${r.avgYds}`)));
ok(defDescending([...d.worstCalls].reverse()), 'defensive Worst Calls is that same ranking reversed',
  JSON.stringify(d.worstCalls.map(r => `${r.key} ${r.stopRate}% ${r.avgYds}`)));
const bear = d.calls.find(r => r.key === 'Bear · Cover 0 · Field');
const okie = d.calls.find(r => r.key === 'Okie · Cover 0 · Field');
ok(bear && okie && bear.stopRate === okie.stopRate && bear.avgYds < okie.avgYds
  && d.calls.filter(r => r.stopRate === bear.stopRate).length >= 2
  && d.topCalls.findIndex(r => r.key === bear.key) < d.topCalls.findIndex(r => r.key === okie.key),
'a stop-rate tie is broken by the lower yards allowed',
`${bear?.stopRate}/${bear?.avgYds} vs ${okie?.stopRate}/${okie?.avgYds}`);
let defCohortMismatch = [];
for (const row of d.calls) {
  const expected = [...new Set(m.defPlayCalls.filter(x => x.call === row.key && x.ref).map(x => x.ref))].sort();
  if (JSON.stringify(expected) !== JSON.stringify(row.refs) || expected.length !== row.n) {
    defCohortMismatch.push(`${row.key}: n=${row.n} refs=${row.refs.length} expected=${expected.length}`);
  }
}
ok(defCohortMismatch.length === 0,
  'every defensive call retains the exact composite refs behind its own count', defCohortMismatch.join(' / '));

/* ══ 8. Defense section composition and canonical values ══════════════════ */
console.log('\n== 8. Defense section ==');
await setSection('Defense');
const defDom = await page.evaluate(() => {
  const bands = [...document.querySelectorAll('.gi-ss-band')];
  return {
    kpis: [...document.querySelectorAll('.gi-overview-kpi')].map(k => k.querySelector('span').textContent.trim()),
    modules: bands.map(b => [...b.querySelectorAll('.gi-ss-module > header strong')].map(s => s.textContent.trim())),
    bandShape: bands.map(b => b.className.trim()),
    columns: [...document.querySelectorAll('table.gi-ss-table thead')]
      .map(t => [...t.querySelectorAll('th')].map(x => x.textContent.trim()).join(' | ')),
    rowsByModule: Object.fromEntries([...document.querySelectorAll('.gi-ss-module')].map(mod => [
      mod.querySelector('header strong').textContent.trim(),
      [...mod.querySelectorAll('.gi-ss-crow')].map(r => r.querySelector('span').textContent.trim())])),
  };
});
/* Yards Allowed / Play LEADS and Stop Rate is last. Stop Rate held the
   headline slot after the coach rejected it as the primary defensive
   comparison; the six-tile band and every other tile are unchanged. */
ok(JSON.stringify(defDom.kpis) === JSON.stringify(
  ['Yards Allowed / Play', 'Havoc Rate', 'Sacks', 'TFL', 'Takeaways', 'Stop Rate']),
'six defensive KPI tiles in the approved order, led by Yards Allowed / Play', JSON.stringify(defDom.kpis));
ok(defDom.kpis[0] === 'Yards Allowed / Play' && !defDom.kpis.slice(0, 3).includes('Stop Rate'),
  'Stop Rate holds no headline or primary-comparison position on the Self-Scout defensive board',
  JSON.stringify(defDom.kpis));
ok(JSON.stringify(defDom.modules) === JSON.stringify([
  ['Positive Plays', 'Negative Plays'], ['Top Calls', 'Worst Calls'], ['Run Defense', 'Pass Defense']]),
'Defense uses the same three-row composition', JSON.stringify(defDom.modules));
ok(defDom.bandShape.every(c => c.includes('b-2')), 'all three defensive rows are two-column');
ok(defDom.columns.every(c => c === 'Call | Plays | Stop | Yds / Play'),
  'the defensive call table carries the approved four columns', defDom.columns.join(' // '));
ok(JSON.stringify(defDom.rowsByModule['Positive Plays']) === JSON.stringify(
  ['Stops', 'Sacks', 'Tackles for loss', 'Takeaways']), 'defensive Positive Plays lists the four approved rows');
ok(JSON.stringify(defDom.rowsByModule['Negative Plays']) === JSON.stringify(
  ['Successful plays allowed', 'Explosive plays allowed', 'Touchdowns allowed']),
'defensive Negative Plays lists the three approved rows');
ok(JSON.stringify(defDom.rowsByModule['Run Defense']) === JSON.stringify(
  ['Attempts', 'Rushing yards allowed', 'Yards allowed per play', 'Stop rate', 'Explosive runs allowed', 'Tackles for loss']),
'Run Defense lists the six approved rows');
ok(JSON.stringify(defDom.rowsByModule['Pass Defense']) === JSON.stringify(
  ['Attempts', 'Passing yards allowed', 'Yards allowed per play', 'Stop rate', 'Explosive passes allowed', 'Sacks']),
'Pass Defense lists the six approved rows');
ok(d.kpis.sacks === m.defensive.sacks && d.kpis.tfl === m.defensive.tfl
  && d.kpis.takeaways === m.defensive.turnovers && d.kpis.havocRate === m.defensive.havocRate,
'every defensive KPI is `_defensiveStats`\'s own value');
ok(d.positive.stops + d.negative.successfulAllowed === d.totalPlays,
  'stops and successful plays allowed partition the defensive cohort',
  `${d.positive.stops}+${d.negative.successfulAllowed} vs ${d.totalPlays}`);
ok(d.run.attempts + d.pass.attempts === d.totalPlays,
  'run and pass defense reconcile with the defensive play total',
  `${d.run.attempts}+${d.pass.attempts} vs ${d.totalPlays}`);
ok(d.run.yardsAllowed + d.pass.yardsAllowed === m.defYards,
  'run and pass yards allowed reconcile with the defensive total',
  `${d.run.yardsAllowed}+${d.pass.yardsAllowed} vs ${m.defYards}`);
ok(d.run.tfl + d.pass.tfl === m.defensive.tfl,
  'the phase-specific tackles for loss sum to the canonical defensive TFL count',
  `${d.run.tfl}+${d.pass.tfl} vs ${m.defensive.tfl}`);
ok(d.run.sacks + d.pass.sacks === m.defensive.sacks,
  'the phase-specific sacks sum to the canonical defensive sack count',
  `${d.run.sacks}+${d.pass.sacks} vs ${m.defensive.sacks}`);

/* ══ 9. Section state survives an ordinary Reports re-render ══════════════ */
console.log('\n== 9. Section persistence ==');
await setSection('Structure');
await page.evaluate(() => window.app.reportsScreen._renderActiveTab());
await sleep(400);
const held = await page.evaluate(() => ({
  active: document.querySelector('.gi-selfscout-nav button.active')?.firstChild.textContent.trim(),
  controller: window.app.reportsScreen.selfScoutSection,
}));
ok(held.active === 'Structure', 'the selected section survives a Reports re-render', held.active);
ok(held.controller === 'structure', 'the section is owned at the controller boundary', held.controller);
await page.evaluate(() => window.app.reportsScreen.selectTab('overview'));
await sleep(300);
await page.evaluate(() => window.app.reportsScreen.selectTab('selfscout'));
await sleep(500);
const returned = await page.evaluate(() =>
  document.querySelector('.gi-selfscout-nav button.active')?.firstChild.textContent.trim());
ok(returned === 'Structure', 'leaving and returning to Self-Scout keeps the section', returned);

/* ══ 10. Interaction states ═══════════════════════════════════════════════ */
console.log('\n== 10. Interaction states ==');
await setSection('Offensive Summary');
const states = await page.evaluate(() => {
  const probe = el => {
    if (!el) return null;
    const before = getComputedStyle(el);
    const rest = { bg: before.backgroundColor, color: before.color,
      w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height };
    return rest;
  };
  const nav = document.querySelector('.gi-selfscout-nav button:not(.active)');
  const th = document.querySelector('table.gi-ss-table thead th');
  const row = document.querySelector('table.gi-ss-table tbody tr.cut-row');
  return {
    navRest: probe(nav), thCursor: th ? getComputedStyle(th).cursor : '',
    rowCursor: row ? getComputedStyle(row).cursor : '',
    rowTabIndex: row ? row.tabIndex : null, rowRole: row ? row.getAttribute('role') : null,
    exportCursor: getComputedStyle(document.querySelector('.gi-selfscout-acts .btn')).cursor,
    navCursor: nav ? getComputedStyle(nav).cursor : '',
  };
});
ok(states.navCursor === 'pointer' && states.thCursor === 'pointer'
  && states.rowCursor === 'pointer' && states.exportCursor === 'pointer',
'every interactive control shows a pointer',
`${states.navCursor}/${states.thCursor}/${states.rowCursor}/${states.exportCursor}`);
ok(states.rowTabIndex === 0 && states.rowRole === 'button', 'a film row is keyboard reachable',
  `${states.rowTabIndex}/${states.rowRole}`);
const hover = await page.evaluate(async () => {
  const nav = document.querySelector('.gi-selfscout-nav button:not(.active)');
  const box = nav.getBoundingClientRect();
  return { w: box.width, h: box.height };
});
await page.hover('.gi-selfscout-nav button:not(.active)');
await frame();
const afterHover = await page.evaluate(() => {
  const nav = document.querySelector('.gi-selfscout-nav button:not(.active)');
  const box = nav.getBoundingClientRect();
  return { bg: getComputedStyle(nav).backgroundColor, w: box.width, h: box.height };
});
ok(Math.abs(afterHover.w - hover.w) < 0.5 && Math.abs(afterHover.h - hover.h) < 0.5,
  'hover changes colour without changing layout dimensions');
const sortCycle = await page.evaluate(async () => {
  const table = document.querySelector('table.gi-ss-table');
  const widths = () => [...table.querySelectorAll('thead th')].map(th => Math.round(th.getBoundingClientRect().width));
  const order = () => [...table.querySelectorAll('tbody td:first-child')].map(td => td.textContent.trim());
  const th = table.querySelectorAll('thead th')[1];
  const base = { w: widths(), o: order() };
  th.click(); await new Promise(r => requestAnimationFrame(r));
  const desc = { w: widths(), o: order(), cls: th.className };
  th.click(); await new Promise(r => requestAnimationFrame(r));
  const asc = { w: widths(), o: order(), cls: th.className };
  th.click(); await new Promise(r => requestAnimationFrame(r));
  const off = { w: widths(), o: order(), cls: th.className };
  return { base, desc, asc, off };
});
ok(sortCycle.desc.cls.includes('is-desc') && sortCycle.asc.cls.includes('is-asc')
  && !sortCycle.off.cls.includes('is-sorted'), 'sort runs descending, ascending, then off',
`${sortCycle.desc.cls} / ${sortCycle.asc.cls} / ${sortCycle.off.cls}`);
ok(JSON.stringify(sortCycle.base.w) === JSON.stringify(sortCycle.desc.w)
  && JSON.stringify(sortCycle.desc.w) === JSON.stringify(sortCycle.off.w),
'sorting never moves a column edge', JSON.stringify(sortCycle.desc.w));
ok(JSON.stringify(sortCycle.off.o) === JSON.stringify(sortCycle.base.o),
  'a third click returns the model\'s own order');

/* ══ 11. Sparse, insufficient and unattributed states ═════════════════════ */
console.log('\n== 11. Sparse, insufficient and unattributed states ==');
await load(DEF_INSUFFICIENT);
await setSection('Defense');
const insufficient = await page.evaluate(() => ({
  title: document.querySelector('.gi-reports-empty h3')?.textContent.trim(),
  body: document.querySelector('.gi-reports-empty p')?.textContent.trim(),
  cta: document.querySelector('.gi-reports-empty-cta')?.textContent.trim(),
}));
ok(insufficient.title === 'Defensive Self-Scout' && /of 6 scheme-tagged/.test(insufficient.body || ''),
  'an under-gate defense states the exact sample it still needs', JSON.stringify(insufficient));
ok(insufficient.cta === 'Open Break Down', 'the empty state offers the charting command', insufficient.cta);

await load(DEF_UNATTRIBUTED);
await setSection('Defense');
const unattributed = await page.evaluate(() => document.querySelector('.gi-reports-empty p')?.textContent.trim());
ok(/None carries a Front, Coverage or Blitz\.$/.test(unattributed || ''),
  'charted but unattributed defense says which tags are missing', unattributed);

await load(NO_OFFENSE);
const noOffense = await page.evaluate(() => ({
  title: document.querySelector('.gi-reports-empty h3')?.textContent.trim(),
  body: document.querySelector('.gi-reports-empty p')?.textContent.trim(),
}));
ok(noOffense.title === 'No offensive attribution'
  && noOffense.body === 'No offensive plays are classified as run or pass.',
'the offensive empty state carries the approved copy', JSON.stringify(noOffense));
await setSection('Defense');
const defStillThere = await page.evaluate(() => document.querySelectorAll('.gi-overview-kpi').length);
ok(defStillThere === 6, 'Defense still reports when no offensive play classifies', String(defStillThere));

await load(SPARSE);
const sparse = await model();
ok(sparse.summary.topCalls.every(r => r.n >= 3) && sparse.summary.topCalls.length === 1,
  'a sparse season ranks only the calls that qualify',
  JSON.stringify(sparse.summary.topCalls.map(r => `${r.key}:${r.n}`)));
const sparseDom = await page.evaluate(() => ({
  empties: [...document.querySelectorAll('.gi-table-empty')].map(el => el.textContent.trim()),
  kpiBlank: [...document.querySelectorAll('.gi-overview-kpi.is-blank strong')].map(el => el.textContent.trim()),
  zeroRows: [...document.querySelectorAll('.gi-ss-crow')]
    .filter(r => r.querySelector('strong').textContent.trim() === '0').length,
}));
ok(sparseDom.empties.every(t => t === 'No data'), 'an empty table carries the one approved absence literal',
  JSON.stringify(sparseDom.empties));
ok(sparseDom.kpiBlank.every(t => t === 'No data'), 'an unavailable KPI reads "No data" with no explanation',
  JSON.stringify(sparseDom.kpiBlank));
ok(sparseDom.zeroRows > 0, 'a measured zero keeps its number rather than becoming an absence');

/* ══ 12. Containment at 1440 and 1280 ═════════════════════════════════════ */
console.log('\n== 12. Containment at 1440 and 1280 ==');
await load(LONG_LABELS);
const widths = [[1440, 900], [1280, 720]];
let overflowAt = [], clipped = [], stacked = [];
for (const [w, h] of widths) {
  await page.setViewport({ width: w, height: h });
  await sleep(250);
  await page.evaluate(() => window.app.reportsScreen._renderActiveTab());
  await sleep(400);
  for (const title of SECTION_TITLES) {
    await setSection(title);
    await frame();
    const measured = await page.evaluate(() => {
      const doc = document.documentElement;
      const bands = [...document.querySelectorAll('.gi-ss-band.b-2')];
      const paired = bands.map(band => {
        const mods = [...band.querySelectorAll('.gi-ss-module')];
        return mods.length === 2 && Math.abs(mods[0].getBoundingClientRect().top
          - mods[1].getBoundingClientRect().top) < 2;
      });
      // `table-layout:fixed` overflows SILENTLY, so a clipped cell is invisible
      // to scrollWidth. Measure the text against the cell's own content box.
      // A truncation is ALLOWED only when the element ellipsises AND the full
      // value stays available on that element's own title. Anything else --
      // a clipped column header above all, which has no title to fall back
      // on -- is a defect.
      const clips = [];
      const bounded = cell => {
        const inner = cell.firstElementChild;
        if (!inner || cell.childElementCount !== 1) return false;
        const style = getComputedStyle(inner);
        return style.textOverflow === 'ellipsis' && style.overflow !== 'visible'
          && !!(inner.getAttribute('title') || '').trim();
      };
      document.querySelectorAll('table.gi-ss-table td, table.gi-ss-table th').forEach(cell => {
        if (!cell.getClientRects().length) return;
        const range = document.createRange();
        range.selectNodeContents(cell);
        const text = range.getBoundingClientRect().width;
        const style = getComputedStyle(cell);
        const inner = cell.getBoundingClientRect().width
          - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        if (text - inner > 1 && !bounded(cell)) clips.push(cell.textContent.trim().slice(0, 34));
      });
      return { overflow: doc.scrollWidth - doc.clientWidth, paired, clips,
        scrollers: [...document.querySelectorAll('.gi-table-wrap')]
          .filter(el => el.scrollWidth - el.clientWidth > 1).length };
    });
    if (measured.overflow > 0) overflowAt.push(`${w}:${title}=${measured.overflow}`);
    if (measured.clips.length) clipped.push(`${w}:${title}: ${measured.clips.join(' | ')}`);
    if (measured.paired.some(x => !x)) stacked.push(`${w}:${title}`);
    if (measured.scrollers) clipped.push(`${w}:${title}: ${measured.scrollers} engaged scroller(s)`);
  }
}
ok(overflowAt.length === 0, 'no page-level horizontal overflow at 1440 or 1280', overflowAt.join(' / '));
ok(clipped.length === 0, 'no clipped cell and no engaged scroller at 1440 or 1280', clipped.join(' / '));
ok(stacked.length === 0, 'the two-column summary layouts hold through 1280', stacked.join(' / '));
await page.setViewport({ width: 1440, height: 900 });
await sleep(200);

/* ══ Twelve fixed down-and-distance rows, explicit yardage labels ═════════
   `downDistRows` returned only the buckets the cohort happened to observe,
   volume-sorted and sliced to fifteen, so the situations an offense never
   faced simply vanished and the board was not comparable between games. And
   `_ddPretty` printed the ENGINE's internal bucket names — "1st & Long" —
   everywhere except Reports > Defense, which patched the string at three call
   sites. `_ddPretty` is now the one owner of the approved wording. */
console.log('\n== Down and distance: twelve fixed rows, explicit yardage ==');
await load(FULL);
await setSection('Calls & Situations');
const dd = await page.evaluate(() => {
  const mod = [...document.querySelectorAll('.gi-ss-module')]
    .find(m => m.querySelector('header strong')?.textContent.trim() === 'By down and distance');
  if (!mod) return null;
  return [...mod.querySelectorAll('tbody tr')].map(tr =>
    [...tr.children].map(td => td.textContent.trim()));
});
const DD_EXPECTED = ['1st & 1-3', '1st & 4-6', '1st & 7+', '2nd & 1-3', '2nd & 4-6', '2nd & 7+',
  '3rd & 1-3', '3rd & 4-6', '3rd & 7+', '4th & 1-3', '4th & 4-6', '4th & 7+'];
ok(dd !== null, 'the By down and distance module renders');
ok(JSON.stringify((dd || []).map(r => r[0])) === JSON.stringify(DD_EXPECTED),
  'all twelve down-and-distance combinations render in football order with explicit yardage',
  JSON.stringify((dd || []).map(r => r[0])));
ok(!(dd || []).some(r => /\b(Short|Medium|Long)\b/.test(r[0])),
  'no row prints the engine\'s internal bucket name instead of its yardage',
  JSON.stringify((dd || []).map(r => r[0]).filter(x => /\b(Short|Medium|Long)\b/.test(x))));
/* An unobserved bucket is HELD, never a fabricated zero. */
const heldRows = (dd || []).filter(r => r.slice(1).every(c => c === '-'));
const zeroRows = (dd || []).filter(r => r[1] === '0');
ok(zeroRows.length === 0,
  'an unfaced situation holds its row with the approved absence treatment, never a 0 sample',
  JSON.stringify(zeroRows.slice(0, 3)));
ok(heldRows.length + (dd || []).filter(r => r[1] !== '-').length === 12,
  'every one of the twelve rows is either populated or held', JSON.stringify({ held: heldRows.length, total: dd?.length }));
/* The legacy word is gone from the board. */
const boardText = await page.evaluate(() => document.querySelector('.gi-selfscout-board')?.textContent || '');
ok(!/giveaway/i.test(boardText), 'the board says Turnovers, never Giveaways',
  (boardText.match(/.{0,30}[Gg]iveaway.{0,20}/) || [''])[0]);

/* ══ Defensive tendencies never report a dimension as predictive of itself ══
   `_defTellsFrom` is dimension-agnostic and emitted a Front tell and a
   Coverage tell for EVERY grouping. Grouped by front, every play in the
   `Maverick` group carries the front `Maverick`, so the tell read
   `Maverick -> Maverick 100%`. A guaranteed 100% also scores higher than any
   real tendency, so the tautologies crowded genuine tells out of the ranked
   slice and the recommendations built from it. */
console.log('\n== Defensive tendencies carry no tautology ==');
await load(FULL);
await setSection('Tendencies');
const defTells = await page.evaluate(() => {
  const mod = [...document.querySelectorAll('.gi-ss-module')]
    .find(m => m.querySelector('header strong')?.textContent.trim() === 'Defensive tendencies');
  if (!mod) return null;
  return [...mod.querySelectorAll('tbody tr')].map(tr => {
    const cells = [...tr.children].map(td => td.textContent.trim());
    // Situation | Call | "<tellVal> <pct>%" | Stop | Havoc | Plays
    const lean = cells[2] || '';
    return { situation: cells[0], call: cells[1], tellVal: lean.replace(/\s+\d+%$/, '').trim() };
  });
});
const tautologies = (defTells || []).filter(r => r.situation && r.tellVal && r.situation === r.tellVal);
ok(defTells !== null && defTells.length > 0,
  'the Defensive tendencies module renders tells on this fixture', JSON.stringify(defTells?.length));
ok(tautologies.length === 0,
  'no defensive tell reports its own grouping dimension back as the tendency',
  JSON.stringify(tautologies.slice(0, 4)));
/* The cross-dimensional tell is the REASON those groupings exist and must
   survive the fix: "when we line up in this front, do we blitz?" is real. */
ok((defTells || []).every(r => ['Front', 'Coverage', 'Blitz'].includes(r.call)),
  'every surviving tell still names a real call dimension',
  JSON.stringify([...new Set((defTells || []).map(r => r.call))]));

if (process.argv.includes('--capture')) {
  const dir = 'artifacts/self-scout-production-reviewed';
  await mkdir(dir, { recursive: true });
  await load(FULL);
  for (const [width, height, sections] of [
    [1440, 900, SECTION_TITLES],
    [1280, 720, ['Offensive Summary', 'Defense']],
  ]) {
    await page.setViewport({ width, height });
    await sleep(250);
    for (const title of sections) {
      await setSection(title);
      const slug = title.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
      await page.screenshot({ path: `${dir}/${width}-${slug}.png`, fullPage: false });
    }
  }
  await page.setViewport({ width: 1440, height: 900 });
}

/* ══ 13. The Season report's own copy of the tab ══════════════════════════ */
console.log('\n== 13. Season report Self-Scout ==');
await load(FULL);
await page.evaluate(() => window.app.reportsScreen.selectTab('season'));
await sleep(700);
await page.evaluate(() => [...document.querySelectorAll('.gi-subtab')]
  .find(b => b.textContent.trim() === 'Self-Scout')?.click());
await sleep(600);
const season = await page.evaluate(() => ({
  board: !!document.querySelector('.gi-selfscout-board'),
  sections: [...document.querySelectorAll('.gi-selfscout-nav button')].map(b => b.firstChild.textContent.trim()),
  kpis: document.querySelectorAll('.gi-overview-kpi').length,
  metas: document.querySelectorAll('.gi-ss-module > header span').length,
}));
ok(season.board && season.sections.length === 5 && season.kpis === 6,
  'the Season report renders the same five-section board', JSON.stringify(season));
ok(season.metas === 0, 'the Season copy carries no module metadata either', String(season.metas));

console.log(`\nPage/console errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 6).join('\n'));
ok(errors.length === 0, 'no page or console errors across every section and state');
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
