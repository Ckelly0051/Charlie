/**
 * Reports > Special Teams — the approved composition, its football contracts,
 * and the two engine corrections the coach approved on 2026-09-04.
 *
 * Comp and decision record: design-comps/reports-special-teams-2026-09-04/.
 *
 * Every assertion drives the real route and reads the rendered result. None of
 * it searches source text: a test that greps for a selector passes against a
 * file that never renders. Where a test is about an engine formula it reads
 * the engine directly and then asserts the board agrees, so the two can never
 * drift apart silently.
 */
import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* THE SHARED TYPE FLOOR, no longer deferred. `docs/VISUAL-SYSTEM-RULES.md` sets
   12.5px as the coach-facing floor, and the 2026-09-19 acceptance pass migrated
   this board to it: its canonical minimum was 9.5px with 98 elements below the
   floor, and is now 12.5px with none. THIS HARNESS RUNS A SYNTHETIC FIXTURE, so
   it cannot establish that value -- `CLAUDE.md` is explicit that synthetic data
   cannot establish Reports visual parity. The canonical census lives in
   `tools/e2e-reports-typefloor-realdata.mjs`; this is a same-fixture regression
   guard that keeps the board from drifting back below the floor. */
const ST_TYPE_FLOOR = 12.5;


const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 180000 });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(TEST_APP_URL, { waitUntil: 'networkidle0' });
await sleep(500);

await page.evaluate(async () => {
  await window.app.storage.createSeason({ name: '2026 ST QA', team: 'Mavericks', year: '2026', level: 'Varsity' });
});

/** Loads one game of Special Teams plays and opens the tab. */
const load = async (plays, opts = {}) => {
  await page.evaluate(async (rows, o) => {
    const store = window.app.storage.seasonStore;
    const built = rows.map((row, i) => ({
      id: i + 1, timestamp: { start: i * 10, end: i * 10 + 6 }, notes: '', annotations: [],
      tags: { custom: [], players: {}, grades: {}, unit: 'special', quarter: 'Q1', ...(row.tags || row) },
      ...(row.specialTeams ? { specialTeams: row.specialTeams } : {}),
    }));
    store.data.games = [{
      id: 'g-st', name: 'Wildcats', nextId: built.length + 1, plays: built,
      gameInfo: { opponent: 'Wildcats', date: '2026-09-04', week: '1', projectName: 'Wildcats',
        perspective: 'self', scoreUs: o.scoreUs == null ? 21 : o.scoreUs, scoreThem: 7 },
      annotations: [], clipNames: [], isMultiClip: false, status: 'active', currentPlayId: 1,
    }];
    store.data.activeGameId = 'g-st';
    await window.app.storage._loadActiveGame({ renderGames: false });
  }, plays, opts);
  await sleep(400);
  await page.evaluate(() => window.app.workspaceShell.show('reports'));
  await sleep(300);
  await page.evaluate(() => window.app.reportsScreen.selectTab('special'));
  await sleep(600);
};

const section = async id => {
  await page.evaluate(s => document.querySelector(`[data-st-section="${s}"]`)?.click(), id);
  await page.mouse.move(3000, 3000);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
};
/* Structured Special Teams fixtures. The old stType / kickOutcome shape was
   retired (legacy excision, 2026-09-26); every fixture below is its structured
   equivalent, and a Special Teams snap with no unit charted is a play with no
   `specialTeams` event at all. */
const ST = (unit, { status = null, distance = null, returnYards = null, score = null, attemptType = null,
  result = null, recoveredBy = null, players = {}, tags = {} } = {}) => ({
  tags: { players, ...tags },
  specialTeams: { version: 1, unit, attemptType, result,
    kick: { distance }, return: { attempted: status === 'returned' ? true : null, yards: returnYards, end: {} },
    outcome: { status, recoveredBy, score, scoredBy: null },
    players: { kicker: players.kicker || '', punter: players.punter || '', returner: players.returner || '' } },
});
const boardText = () => page.evaluate(() =>
  document.querySelector('[data-native-report-content]')?.textContent || '');

/* ══ 1. The approved composition renders ══════════════════════════════════ */
console.log('\n== 1. The approved composition ==');
await load([
  ST('kickoff', { status: 'touchback' }),
  ST('kickoff', { status: 'returned', returnYards: 18 }),
  ST('punt', { status: 'fairCatch', distance: 40 }),
  ST('puntReturn', { status: 'returned', returnYards: 9 }),
  ST('fieldGoal', { attemptType: 'fieldGoal', status: 'good', score: 'fieldGoal', distance: 32 }),
  ST('try', { attemptType: 'extraPoint', result: 'converted', score: 'extraPoint' }),
]);

const shape = await page.evaluate(() => {
  const pane = document.querySelector('[data-native-report-content]');
  return {
    board: !!pane.querySelector('.gi-st-board'),
    kpis: pane.querySelectorAll('.gi-st-board .gi-overview-kpi').length,
    ledger: pane.querySelectorAll('.gi-st-unit-card').length,
    // The five sections are pages in the shared secondary bar under the strip
    // (coach-approved comp, 2026-09-23); one page's modules are on screen.
    navs: document.querySelectorAll('[data-reports-secbar] [data-st-section]').length,
    rules: document.querySelectorAll('[data-reports-secbar] [data-st-section][aria-selected="true"]').length,
    names: [...pane.querySelectorAll('.gi-st-unit-name')].map(e => e.textContent.trim()),
  };
});
ok(shape.board, 'the Special Teams board renders');
ok(shape.kpis === 6, 'the KPI band is six tiles, the board\'s own rhythm', `saw ${shape.kpis}`);
ok(shape.ledger === 6, 'the unit ledger shows all six units of the model', `saw ${shape.ledger}`);
ok(shape.navs === 5, 'five unit surfaces', `saw ${shape.navs}`);
ok(shape.rules === 1, 'exactly one section is on screen at a time', `saw ${shape.rules}`);
ok(String(shape.names) === String(['Kickoff', 'Kick Return', 'Punt', 'Punt Return / Block', 'Field Goal', 'Field Goal Block']),
  'the ledger keeps kickoff distinct from kick return and punt from punt return',
  shape.names.join(' | '));

/* ══ 2. Absence is one label, and a measured zero is not an absence ═══════ */
console.log('\n== 2. No data, and the zero that is not an absence ==');
await load([
  // 4 kickoffs, none a touchback, no distance ever charted: touchback rate is
  // an observed 0%, kick distance is genuinely absent. They must not look the
  // same on the board.
  ST('kickoff', { status: 'fairCatch' }),
  ST('kickoff', { status: 'fairCatch' }),
  ST('kickoff', { status: 'returned', returnYards: 20 }),
  ST('kickoff', { status: 'returned', returnYards: 14 }),
]);
const absence = await page.evaluate(() => {
  const pane = document.querySelector('[data-native-report-content]');
  const rows = [...pane.querySelectorAll('.gi-st-row')].map(r => ({
    label: r.querySelector('span').textContent.trim(),
    value: r.querySelector('strong').textContent.trim(),
    blank: r.querySelector('strong').classList.contains('is-blank'),
  }));
  const kpi = [...pane.querySelectorAll('.gi-st-board .gi-overview-kpi')].map(k => ({
    label: k.querySelector('span').textContent.trim(),
    value: k.querySelector('strong').textContent.trim(),
    hasSub: !!k.querySelector('small'),
    size: parseFloat(getComputedStyle(k.querySelector('strong')).fontSize),
  }));
  return { rows, kpi, text: pane.textContent };
});
const tbRow = absence.rows.find(r => r.label === 'Touchback rate');
const distRow = absence.rows.find(r => r.label === 'Kick distance, average');
ok(tbRow && tbRow.value === '0%' && !tbRow.blank,
  'an observed zero keeps its number: 0% touchbacks over four charted kickoffs',
  JSON.stringify(tbRow));
ok(distRow && distRow.value === 'No data' && distRow.blank,
  'an uncharted measurement reads No data, never 0', JSON.stringify(distRow));
ok(!/not charted|not derivable|none attempted|none charted|in this scope/i.test(absence.text),
  'the board carries exactly one absence label, with none of the retired variants');
// Every tile now carries NAMED values on a line, so a populated tile's figure
// lives in a `.gi-kpi-stat-n` rather than being the tile's whole `strong`.
const blankKpi = absence.kpi.find(k => k.value === 'No data');
ok(blankKpi && !blankKpi.hasSub, 'a No data KPI drops its sub rather than printing the same words twice');
const kpiType = await page.evaluate(() => {
  const pane = document.querySelector('[data-native-report-content]');
  const blank = [...pane.querySelectorAll('.gi-st-board .gi-overview-kpi')]
    .find(t => t.classList.contains('is-blank'));
  const stat = pane.querySelector('.gi-st-board .gi-kpi-stat-n');
  const cs = el => (el ? parseFloat(getComputedStyle(el).fontSize) : null);
  const weight = el => (el ? getComputedStyle(el).fontWeight : null);
  return { blankSize: cs(blank?.querySelector('strong')), statSize: cs(stat),
    blankWeight: weight(blank?.querySelector('strong')), statWeight: weight(stat) };
});
ok(kpiType.blankSize != null && kpiType.statSize != null
  && kpiType.blankSize <= kpiType.statSize,
  'No data is never larger than a real value, so an absence cannot become the biggest figure in the band',
  JSON.stringify(kpiType));
ok(Number(kpiType.blankWeight) < Number(kpiType.statWeight),
  'and it is lighter than a real value, so colour and weight carry the subordination',
  JSON.stringify(kpiType));

/* ══ 3. A unit with no snaps is not a unit with zero performance ══════════ */
console.log('\n== 3. Empty units ==');
const emptyCards = await page.evaluate(() => [...document.querySelectorAll('.gi-st-unit-card')]
  .map(c => ({ name: c.querySelector('.gi-st-unit-name').textContent.trim(),
    n: c.querySelector('.gi-st-unit-n').textContent.trim(),
    none: c.classList.contains('is-none') })));
const punt = emptyCards.find(c => c.name === 'Punt');
ok(punt && punt.none && punt.n === 'No data',
  'a unit with no charted snaps says No data and shows no number at all', JSON.stringify(punt));
ok(emptyCards.filter(c => c.none).length === 5 && emptyCards.length === 6,
  'the five empty units stay visible rather than being omitted from the report',
  `${emptyCards.filter(c => c.none).length} of ${emptyCards.length}`);

/* ══ 4. FIELD GOAL COHORT — the fix, failing-first on the old behavior ════ */
console.log('\n== 4. An extra point is not a field goal (coach decision) ==');
await load([
  ST('try', { attemptType: 'extraPoint', result: 'converted', score: 'extraPoint', players: { kicker: '19' } }),
  ST('try', { attemptType: 'extraPoint', result: 'converted', score: 'extraPoint', players: { kicker: '19' } }),
  ST('punt', { status: 'downed', distance: 38, players: { kicker: '35' } }),
]);
const fgCohort = await page.evaluate(() => {
  const e = window.app.stats, sc = window.app.reportsScreen;
  const { scoped } = sc._specialTeamsCohort();
  const stats = e.compute(scoped);
  const kicker = (stats.individuals.kickers || []).find(k => k.num === '19');
  return { unitAtt: stats.specialTeams.fg.att, kickerAtt: kicker ? kicker.fgAtt : 0, kickerPresent: !!kicker };
});
ok(fgCohort.unitAtt === 0, 'the Field Goal unit counts no attempt when only extra points were charted');
ok(fgCohort.kickerAtt === 0,
  'and no kicker is credited a field-goal attempt the unit does not recognize',
  `kicker fgAtt=${fgCohort.kickerAtt}`);
ok(fgCohort.unitAtt === fgCohort.kickerAtt,
  'the team report and the kicker rollup answer with ONE definition of a field goal');

/* ══ 5. PUNT NET — no invented touchback placement ════════════════════════ */
console.log('\n== 5. A touchback net is not derivable without a ruleset ==');
await load([
  ST('punt', { status: 'downed', distance: 40 }),
  ST('punt', { status: 'touchback', distance: 50 }),
]);
const net = await page.evaluate(() => {
  const e = window.app.stats, sc = window.app.reportsScreen;
  const { scoped } = sc._specialTeamsCohort();
  const p = e.compute(scoped).specialTeams.punts;
  return { net: p.netAvg, gross: p.grossAvg, netRefs: p.refs.netAvg.length, n: p.n };
});
// Old behavior subtracted a flat 20 from the touchback: (40 + 30) / 2 = 35.0.
ok(net.net === 40, 'net covers only the punt whose net is derivable, and is not 35.0 from an invented 20-yard touchback',
  `netAvg=${net.net}`);
ok(net.netRefs === 1 && net.n === 2,
  'the net average names exactly the punts it was computed from, not every punt',
  `refs=${net.netRefs} of ${net.n} punts`);
ok(net.gross === 45, 'gross still covers both punts -- the touchback leaves only the NET', `gross=${net.gross}`);

/* ══ 6. Snaps reconcile, and a unit-less snap is disclosed ════════════════ */
console.log('\n== 6. Reconciliation and the unassigned snap ==');
await load([
  ST('kickoff', { status: 'touchback' }),
  ST('punt', { status: 'downed', distance: 40 }),
  // A Special Teams snap with no unit charted belongs to no unit. It must not vanish.
  { result: 'Gain', yardage: '13' },
]);
const recon = await page.evaluate(() => {
  const pane = document.querySelector('[data-native-report-content]');
  const line = pane.querySelector('.gi-st-unassigned');
  const tile = [...pane.querySelectorAll('.gi-st-board .gi-overview-kpi')]
    .find(k => /special teams snaps/i.test(k.querySelector('span').textContent));
  const snaps = [...(tile?.querySelectorAll('.gi-kpi-stat') || [])]
    .find(s => /^snaps$/i.test(s.querySelector('.gi-kpi-stat-l')?.textContent?.trim() || ''))
    ?.querySelector('.gi-kpi-stat-n').textContent.trim();
  return { line: line ? line.textContent.replace(/\s+/g, ' ').trim() : null, snaps };
});
ok(recon.snaps === '3', 'every special-teams snap is counted, including the one no unit claims', recon.snaps);
ok(recon.line === '1 snap is not assigned to a unit',
  'a snap charted under a label the model has no unit for is disclosed, not silently absorbed',
  String(recon.line));

await load([
  ST('kickoff', { status: 'touchback' }),
  ST('punt', { status: 'downed', distance: 40 }),
]);
const reconClean = await page.evaluate(() =>
  !!document.querySelector('[data-native-report-content] .gi-st-unassigned'));
ok(!reconClean, 'when every snap reconciles the line does not render at all -- no arithmetic restating the ledger');

/* THE MIXED COHORT: eight Special Teams snaps, five carrying a structured unit
   and three with no unit charted (the shape the coach's season has after the old
   Special Teams values were blanked, 2026-09-26). The three join no unit module
   and the disclosure names them; the Try is counted once, as a try. */
const stEvent = (unit, outcome, extra = {}) => ({ version: 1, unit,
  outcome: { status: null, recoveredBy: null, score: null, ...outcome },
  kick: { distance: 40 }, return: { attempted: null, yards: null, end: {} }, players: {}, ...extra });
await load([
  { specialTeams: stEvent('kickoff', { status: 'touchback' }) },
  { specialTeams: stEvent('kickoffReturn', { status: 'fairCatch' }) },
  { specialTeams: stEvent('puntReturn', { status: 'fairCatch' }) },
  { specialTeams: stEvent('punt', { status: 'downed' }) },
  { specialTeams: stEvent('try', { score: 'extraPoint' }, { attemptType: 'extraPoint', result: 'converted' }) },
  {},
  { result: 'Good' },
  { result: 'Gain' },
]);
const mixed = await page.evaluate(() => {
  const pane = document.querySelector('[data-native-report-content]');
  const line = pane.querySelector('.gi-st-unassigned');
  const model = window.app.stats.compute(window.app.tagger.plays, { allPlays: window.app.tagger.plays });
  const st = model.specialTeams;
  return {
    line: line ? line.textContent.replace(/\s+/g, ' ').trim() : null,
    structured: !!st.structured,
    tries: { n: st.tries.n, tryUnits: st.tries.tryUnits },
    fgAtt: st.fg.att,
    xpAtt: model.conversions.xp.att,
    tryRows: [...pane.querySelectorAll('.gi-st-board [data-st-section]')].length,
  };
});
ok(mixed.structured && mixed.tries.n === 1 && mixed.tries.tryUnits === 1
  && mixed.fgAtt === 0 && mixed.xpAtt === 1,
  'the extra point is counted once, as a try, and never as a field-goal attempt',
  JSON.stringify(mixed));
ok(mixed.line === '3 snaps are not assigned to a unit',
  'only snaps NO module claims are unassigned: the three Special Teams snaps with no unit charted',
  String(mixed.line));

/* A charted `Defending a Try` is outside the conversion denominator by
   construction -- it is the OPPONENT's attempt, which is a different statement
   from a try with no scoring team tagged. */
await load([
  { specialTeams: stEvent('tryDefense', { score: 'extraPoint' }, { attemptType: 'extraPoint', result: 'converted' }) },
  { specialTeams: stEvent('tryDefense', {}, { attemptType: 'extraPoint', result: 'failed' }) },
  { specialTeams: stEvent('try', { score: 'extraPoint' }, { attemptType: 'extraPoint', result: 'converted' }) },
]);
const tryLabels = await page.evaluate(() => {
  const module = [...document.querySelectorAll('[data-native-report-content] .gi-overview-module')]
    .find(m => /^Tries$/.test(m.querySelector('header strong')?.textContent?.trim() || ''));
  return [...(module?.querySelectorAll('.gi-st-row') || [])]
    .map(row => `${row.querySelector('span')?.textContent?.trim()}=${row.querySelector('strong')?.textContent?.trim()}`);
});
ok(tryLabels.includes('Tries charted=3') && tryLabels.includes('Opponent tries=2')
  && !tryLabels.some(row => /No scoring team tagged/.test(row)),
  'the try remainder is named: the opponent\'s two tries are stated as theirs, not as untagged',
  JSON.stringify(tryLabels));

/* ══ 7. Outcome distributions are exclusive and open film ═════════════════ */
console.log('\n== 7. Outcome distribution ==');
await load([
  ST('punt', { status: 'fairCatch', distance: 40 }),
  ST('punt', { status: 'fairCatch', distance: 38 }),
  ST('punt', { status: 'blocked', distance: 44 }),
  ST('punt', { distance: 41 }),
]);
await section('st3');
const dist = await page.evaluate(() => {
  const bars = [...document.querySelectorAll('.gi-st-outcome')];
  return bars.map(b => ({
    label: b.querySelector('.gi-st-outcome-label').textContent.trim(),
    value: b.querySelector('.gi-st-outcome-value').textContent.trim(),
    clickable: b.tagName === 'BUTTON',
  }));
});
const fc = dist.find(d => d.label === 'Fair catch');
const uncharted = dist.find(d => d.label === 'No data');
ok(fc && fc.value === '2 (50%)', 'an outcome states its count and its share of the unit', JSON.stringify(fc));
ok(uncharted && uncharted.value === '1 (25%)',
  'a snap whose outcome was never charted is its own row, never dropped or folded into another',
  JSON.stringify(uncharted));
ok(dist.reduce((s, d) => s + Number(d.value.split(' (')[0]), 0) === 4,
  'the outcomes are mutually exclusive and account for every snap of the unit');
ok(dist.every(d => d.clickable), 'every outcome opens exactly its own film');

/* Punt ownership is the unit: our punt team is Punt, and the unit that blocks
   THEIR punt is Punt Return / Block. (The 2026-09-06 rule that read the side of
   an old stType Punt from its player roles was retired with the old tags.) */
await load([
  ST('punt', { status: 'downed', distance: 40, players: { kicker: '9' } }),
  ST('punt', { status: 'fairCatch', distance: 43, players: { punter: '9' } }),
  ST('puntReturn', { status: 'blocked', recoveredBy: 'subject', players: { tackler: '82' }, tags: { result: 'Loss', yardage: '-5' } }),
  ST('punt', { status: 'blocked', players: { punter: '9' } }),
  ST('punt', { status: 'blocked' }),
]);
const puntOwnership = await page.evaluate(() => {
  const app = window.app;
  const stats = app.stats.compute(app.reportsScreen._specialTeamsCohort().scoped);
  const summary = app.stats._specialTeamsSummary(app.reportsScreen._specialTeamsCohort().scoped, stats);
  return { punts: stats.specialTeams.punts, returns: stats.specialTeams.returns.punt,
    impact: summary.impact.map(row => ({ label: row.label, n: row.n, refs: row.refs })) };
});
ok(puntOwnership.punts.n === 4 && puntOwnership.punts.blocked === 2,
  'our punt team counts its own four punts, two of them blocked against us',
  JSON.stringify(puntOwnership.punts));
ok(puntOwnership.returns.n === 1 && puntOwnership.returns.blocked === 1
  && JSON.stringify(puntOwnership.returns.refs.blocked) === JSON.stringify(['g-st::3']),
  'the punt we blocked belongs to Punt Return / Block with exact film',
  JSON.stringify(puntOwnership.returns));
ok(puntOwnership.impact.some(row => row.label === 'Punts blocked' && row.n === 1)
  && puntOwnership.impact.some(row => row.label === 'Punts blocked against us' && row.n === 2),
  'the impact ledger reports the block with the correct direction', JSON.stringify(puntOwnership.impact));

/* ══ 8. Scope, and the shared scorebug rule ═══════════════════════════════ */
console.log('\n== 8. Scope and chrome ==');
const scope = await page.evaluate(() => {
  const sc = window.app.reportsScreen;
  return { def: sc.specialTeamsScope, buttons: document.querySelectorAll('[data-st-scope]').length };
});
// Coach decision, 2026-09-22: every game/season scope opens on Current game.
ok(scope.def === 'game', 'Special Teams opens on Current game');
await page.evaluate(() => document.querySelector('[data-st-scope="season"]')?.click());
await sleep(250);
ok(scope.buttons === 2, 'the Full season / Current game control is preserved');
/* The game KPI rail is deleted (coach-approved comp, 2026-09-23); `rail` now
   asserts it stays absent in both scopes. */
const scopeChrome = await page.evaluate(() => ({
  ...({ rail: !!document.querySelector('[data-reports-rail], .gi-reports-rail'),
    bug: !document.querySelector('[data-reports-scorebug]')?.hidden }),
  title: document.querySelector('[data-reports-title]')?.textContent.trim(),
  context: document.querySelector('[data-reports-context]')?.textContent.trim(),
}));
ok(!scopeChrome.rail && !scopeChrome.bug && /Special Teams$/.test(scopeChrome.title)
  && scopeChrome.context === 'Full season',
  'full-season Special Teams never renders current-game chrome', JSON.stringify(scopeChrome));
await page.evaluate(() => document.querySelector('[data-st-scope="game"]')?.click());
await sleep(250);
const gameChrome = await page.evaluate(() => ({
  rail: !!document.querySelector('[data-reports-rail], .gi-reports-rail'),
  bug: !document.querySelector('[data-reports-scorebug]')?.hidden,
  title: document.querySelector('[data-reports-title]')?.textContent.trim(),
  context: document.querySelector('[data-reports-context]')?.textContent.trim(),
}));
ok(!gameChrome.rail && !gameChrome.bug && !/Special Teams$/.test(gameChrome.title) && gameChrome.context !== 'Full season',
  'current-game Special Teams restores current-game chrome', JSON.stringify(gameChrome));

/* ══ 9. Nothing regressed visually ════════════════════════════════════════ */
console.log('\n== 9. Layout contracts ==');
for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 800]]) {
  await page.setViewport({ width: w, height: h });
  await sleep(200);
  const layout = await page.evaluate(floorPx => {
    const pane = document.querySelector('[data-native-report-content]');
    const under = [...pane.querySelectorAll('*')].filter(el => {
      if (!el.getClientRects().length) return false;
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return false;
      return parseFloat(getComputedStyle(el).fontSize) < floorPx;
    });
    const cut = [...pane.querySelectorAll('*')].filter(el => {
      if (el.closest('.gi-st-table-wrap')) return false;
      if (!el.getClientRects().length) return false;
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return false;
      return el.scrollWidth - el.clientWidth > 1 && el.clientWidth > 0;
    });
    const sizes = [...pane.querySelectorAll('*')]
      .filter(el => el.getClientRects().length
        && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
      .map(el => parseFloat(getComputedStyle(el).fontSize));
    return { min: sizes.length ? Math.min(...sizes) : null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      under: under.length, cut: cut.length };
  }, ST_TYPE_FLOOR);
  ok(layout.overflow <= 0, `no page-level horizontal scroll at ${w}`, `${layout.overflow}px`);
  ok(layout.under === 0,
    `no text under the shared ${ST_TYPE_FLOOR}px floor at ${w}`,
    `${layout.under} nodes, smallest ${layout.min}px`);
  ok(layout.cut === 0, `no truncated text at ${w}`, `${layout.cut} nodes`);
}
await page.setViewport({ width: 1440, height: 900 });

/* ══ 9b. The badge names its unit, and an absence is not a void ════════════ */
console.log('\n== 9b. Badge counts and empty modules ==');
await load([
  ST('kickoff', { status: 'touchback' }),
  ST('kickoff', { status: 'returned', returnYards: 18 }),
]);
const badges = await page.evaluate(() => {
  return [...document.querySelectorAll('[data-reports-secbar] [data-st-section]')].map(item => ({
    text: item.textContent.replace(/\s+/g, ' ').trim(),
    noun: (item.querySelector('b')?.textContent?.trim().match(/^\d+ (snaps?|attempts?|players?)$/) || [])[1] || null,
    aria: item.getAttribute('aria-label'),
  }));
});
ok(badges.length === 5 && badges.every(b => b.noun && /snaps|attempts|players/.test(b.noun)),
  'every section badge states what it counts rather than leaving a bare number',
  JSON.stringify(badges.map(b => b.text)));
ok(badges.every(b => /\d+ (snaps|attempts|players)$/.test(b.aria || '')),
  'the badge count and its noun are announced together', JSON.stringify(badges.map(b => b.aria)));
/* A module with one `No data` line does not become a tall void when its paired
   partner is populated: the absence sits under its own header, and the pair
   still shares one top and one bottom edge. */
const emptyModules = await page.evaluate(() => {
  const band = [...document.querySelectorAll('[data-native-report-content] .gi-st-band')]
    .find(b => b.querySelector('.gi-st-empty') && b.querySelector('.gi-st-row'));
  if (!band) return null;
  const mods = [...band.children].map(m => {
    const rect = m.getBoundingClientRect();
    const absence = m.querySelector('.gi-st-empty');
    const header = m.querySelector('header');
    /* The TEXT's own box, not the element's. A stretched panel whose text is
       vertically centred keeps its element starting under the header, so
       measuring the element cannot tell the two treatments apart -- the first
       version of this check passed against the centred layout it was written to
       reject. A Range reports where the line actually paints. */
    let textTop = null;
    if (absence && absence.firstChild) {
      const range = document.createRange();
      range.selectNodeContents(absence);
      textTop = Math.round(range.getBoundingClientRect().top);
    }
    return { top: Math.round(rect.top), bottom: Math.round(rect.bottom),
      empty: !!absence, height: Math.round(rect.height),
      gapUnderHeader: textTop != null && header
        ? Math.round(textTop - header.getBoundingClientRect().bottom) : null };
  });
  return mods;
});
ok(emptyModules && emptyModules.length === 2
  && emptyModules[0].top === emptyModules[1].top && emptyModules[0].bottom === emptyModules[1].bottom,
  'a populated module and its empty partner still align on both edges', JSON.stringify(emptyModules));
ok(emptyModules && emptyModules.find(m => m.empty)?.gapUnderHeader <= 16,
  'the absence sits directly under its header instead of floating in a tall empty panel',
  JSON.stringify(emptyModules));

/* ══ 9c. The Defense module system (1.12.0-97 smoke S97-1) ════════════════ */
console.log('\n== 9c. Every section uses the Defense module system ==');
/* Coach direction, extended from Offense: a numbered section heading, every
   module an outlined box on 20px gutters with a 50px title bar (2px rule in the
   board accent over a 17px sentence-case title), no uppercase micro-headers. */
const ST_TITLES = ['All units', 'Kickoff and kick return', 'Punt and punt return', 'Kicking game', 'Specialists'];
const stSystem = [];
for (const [index, id] of ['st1', 'st2', 'st3', 'st4', 'st5'].entries()) {
  await page.evaluate(s => document.querySelector(`[data-reports-secbar] [data-st-section="${s}"]`).click(), id);
  await sleep(150);
  stSystem.push(await page.evaluate((number, title) => {
    const board = document.querySelector('[data-native-report-content] .gi-st-board');
    const heading = board.querySelector(':scope > .gi-st-heading');
    const accent = heading ? getComputedStyle(heading.querySelector('span')).color : null;
    const bad = [];
    for (const m of board.querySelectorAll('.gi-overview-module')) {
      const cs = getComputedStyle(m), head = m.querySelector(':scope > header'), hs = getComputedStyle(head);
      const t = getComputedStyle(head.querySelector('strong')), name = head.querySelector('strong').textContent.trim();
      if (parseFloat(cs.borderTopWidth) < 1 || parseFloat(cs.borderLeftWidth) < 1) bad.push(`${name}: no outline`);
      if (Math.round(head.getBoundingClientRect().height) !== 50 || hs.borderTopWidth !== '2px' || hs.borderTopColor !== accent) bad.push(`${name}: title bar`);
      if (parseFloat(t.fontSize) < 17 || t.textTransform !== 'none') bad.push(`${name}: title type`);
    }
    const gaps = [...board.querySelectorAll(':scope > .gi-st-band')].filter(b => b.children.length > 1).map(b => getComputedStyle(b).columnGap);
    const upper = [...board.querySelectorAll('*')].filter(el => el.getClientRects().length
      && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
      && getComputedStyle(el).textTransform === 'uppercase').map(el => el.textContent.trim().slice(0, 20));
    return { ok: !!heading && heading.querySelector('span').textContent === String(number).padStart(2, '0')
      && heading.querySelector('h2').textContent === title, bad, gaps, upper };
  }, index + 1, ST_TITLES[index]));
}
await page.evaluate(() => document.querySelector('[data-reports-secbar] [data-st-section="st1"]').click());
ok(stSystem.every(s => s.ok), 'every Special Teams section opens on its numbered heading and name', JSON.stringify(stSystem.map(s => s.ok)));
ok(stSystem.every(s => s.bad.length === 0), 'every module is an outlined box with the 50px title bar and a 17px sentence-case title',
  JSON.stringify(stSystem.flatMap(s => s.bad).slice(0, 8)));
ok(stSystem.every(s => s.gaps.length && s.gaps.every(g => g === '20px')), 'module bands sit on 20px gutters',
  JSON.stringify(stSystem.map(s => s.gaps)));
ok(stSystem.every(s => s.upper.length === 0), 'no Special Teams label renders as an uppercase micro-header',
  JSON.stringify(stSystem.flatMap(s => s.upper).slice(0, 8)));

/* ══ 10. The empty state ══════════════════════════════════════════════════ */
console.log('\n== 10. No Special Teams snaps ==');
await load([{ unit: 'offense', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '5' }]);
const empty = await page.evaluate(() => {
  const pane = document.querySelector('[data-native-report-content]');
  return { empty: !!pane.querySelector('.gi-reports-empty'),
    title: pane.querySelector('.gi-reports-empty h3')?.textContent.trim() || null,
    board: !!pane.querySelector('.gi-st-board:not(.is-empty)'),
    scope: !!document.querySelector('[data-reports-secbar] [data-st-scope="season"]') };
});
ok(empty.empty && !empty.board, 'a season with no special-teams snaps shows the empty state, not an all-zero board');
// The empty board keeps its bar, so a game with no Special Teams snaps can
// still switch to a full season that has them (2026-09-26).
ok(empty.scope, 'the empty board keeps its Current game / Full season switch', JSON.stringify(empty));
ok(empty.title === 'No Special Teams snaps charted', 'the empty state states the absence literally', String(empty.title));

/* ══ 11. The export carries what the board shows ══════════════════════════ */
/* The board's KPI tiles carry NAMED values (`stats`), not a `value`/`sub`
   pair. The printed report's generic metric band read `value`/`sub`, so every
   tile whose figures live in `stats` exported as an empty headline.

   The exported band is PARSED, not searched. A substring check over the whole
   document passes on `0`, `3` or `10` occurring in any unrelated table, so it
   could not fail for the reason it claims: the pairs are matched tile by tile
   and label by label. */
console.log('\n== 11. Export ==');
await load([
  ST('kickoff', { status: 'touchback' }),
  ST('kickoff', { status: 'returned', returnYards: 18 }),
  ST('punt', { status: 'fairCatch', distance: 40 }),
  ST('puntReturn', { status: 'returned', returnYards: 9 }),
  ST('fieldGoal', { attemptType: 'fieldGoal', status: 'good', score: 'fieldGoal', distance: 32 }),
  ST('try', { attemptType: 'extraPoint', result: 'converted', score: 'extraPoint' }),
]);
const exported = await page.evaluate(async () => {
  let blob = null;
  const save = window.ffaSaveBlob;
  window.ffaSaveBlob = b => { blob = b; };
  const screen = window.app.reportsScreen, engine = window.app.stats;
  const { scoped } = screen._specialTeamsCohort();
  const stats = engine.compute(scoped);
  const summary = engine._specialTeamsSummary(scoped, stats);
  screen.exportSpecialTeams(stats, summary);
  window.ffaSaveBlob = save;
  const html = blob ? await blob.text() : '';
  /* Read the tiles off the RENDERED board, so this compares the two surfaces
     rather than comparing the exporter against its own view model. */
  const tiles = [...document.querySelectorAll('.gi-st-board .gi-overview-kpi')].map(k => ({
    label: k.querySelector('span')?.textContent.trim() || '',
    stats: [...k.querySelectorAll('.gi-kpi-stat')].map(s => [
      s.querySelector('.gi-kpi-stat-l')?.textContent.trim() || '',
      s.querySelector('.gi-kpi-stat-n')?.textContent.trim() || '',
    ]),
  }));
  /* The exported band, parsed the same shape: tile label -> label/value pairs.
     The Special Teams band is the one that follows the chapter heading. */
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const chapter = [...doc.querySelectorAll('.chapter')]
    .find(c => /Special Teams Performance/.test(c.querySelector('h1')?.textContent || ''));
  const printed = [...(chapter?.querySelectorAll('.metric-band > .metric') || [])].map(m => ({
    label: m.querySelector(':scope > span')?.textContent.trim() || '',
    stats: [...m.querySelectorAll('.metric-stats > p')].map(p => [
      p.querySelector('span')?.textContent.trim() || '',
      p.querySelector('strong')?.textContent.trim() || '',
    ]),
  }));
  return { html, tiles, printed, chapter: !!chapter };
});
ok(exported.chapter, 'the export contains the Special Teams chapter');
ok(exported.tiles.some(t => t.stats.length), 'the board rendered named KPI values to compare against');
ok(exported.printed.length === exported.tiles.length,
  'the printed band carries one cell per board tile',
  `printed ${exported.printed.length}, board ${exported.tiles.length}`);

const mismatched = [];
for (const tile of exported.tiles) {
  const cell = exported.printed.find(p => p.label.toLowerCase() === tile.label.toLowerCase());
  if (!cell) { mismatched.push(`${tile.label}: no cell in the printed band`); continue; }
  for (const [label, value] of tile.stats) {
    if (!value) continue;
    const row = cell.stats.find(s => s[0].toLowerCase() === label.toLowerCase());
    if (!row) mismatched.push(`${tile.label} / ${label}: not printed`);
    else if (row[1] !== value) mismatched.push(`${tile.label} / ${label}: printed ${row[1]}, board ${value}`);
  }
}
ok(mismatched.length === 0,
  'every named KPI value prints under its own tile and its own label',
  mismatched.slice(0, 4).join('; '));
ok(!/<strong><\/strong>/.test(exported.html),
  'no exported tile prints an empty headline where its figures belong');

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) { console.log('Console/page errors:'); console.log(errors.slice(0, 5).join('\n')); }
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
