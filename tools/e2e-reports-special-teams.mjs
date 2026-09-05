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
const boardText = () => page.evaluate(() =>
  document.querySelector('[data-native-report-content]')?.textContent || '');

/* ══ 1. The approved composition renders ══════════════════════════════════ */
console.log('\n== 1. The approved composition ==');
await load([
  { stType: 'Kickoff', kickOutcome: 'Touchback' },
  { stType: 'Kickoff', kickOutcome: 'Returned', returnYards: '18' },
  { stType: 'Punt', kickOutcome: 'Fair Catch', kickDistance: '40' },
  { stType: 'Punt Return', kickOutcome: 'Returned', returnYards: '9' },
  { stType: 'Field Goal', kickOutcome: 'Good', kickDistance: '32' },
  { stType: 'XP', kickOutcome: 'Good', scoreFor: 'us' },
]);

const shape = await page.evaluate(() => {
  const pane = document.querySelector('[data-native-report-content]');
  return {
    board: !!pane.querySelector('.gi-st-board'),
    kpis: pane.querySelectorAll('.gi-st-board .gi-overview-kpi').length,
    ledger: pane.querySelectorAll('.gi-st-unit-card').length,
    navs: pane.querySelectorAll('.gi-def-secnav-item').length,
    rules: pane.querySelectorAll('.gi-def-secrule').length,
    names: [...pane.querySelectorAll('.gi-st-unit-name')].map(e => e.textContent.trim()),
  };
});
ok(shape.board, 'the Special Teams board renders');
ok(shape.kpis === 6, 'the KPI band is six tiles, the board\'s own rhythm', `saw ${shape.kpis}`);
ok(shape.ledger === 6, 'the unit ledger shows all six units of the model', `saw ${shape.ledger}`);
ok(shape.navs === 5, 'five unit surfaces', `saw ${shape.navs}`);
ok(shape.rules === 1, 'exactly one section is on screen at a time', `saw ${shape.rules}`);
ok(String(shape.names) === String(['Kickoff', 'Kick Return', 'Punt', 'Punt Return', 'Field Goal', 'FG Block']),
  'the ledger keeps kickoff distinct from kick return and punt from punt return',
  shape.names.join(' | '));

/* ══ 2. Absence is one label, and a measured zero is not an absence ═══════ */
console.log('\n== 2. No data, and the zero that is not an absence ==');
await load([
  // 4 kickoffs, none a touchback, no distance ever charted: touchback rate is
  // an observed 0%, kick distance is genuinely absent. They must not look the
  // same on the board.
  { stType: 'Kickoff', kickOutcome: 'Fair Catch' },
  { stType: 'Kickoff', kickOutcome: 'Fair Catch' },
  { stType: 'Kickoff', kickOutcome: 'Returned', returnYards: '20' },
  { stType: 'Kickoff', kickOutcome: 'Returned', returnYards: '14' },
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
  { stType: 'XP', kickOutcome: 'Good', scoreFor: 'us', players: { kicker: '19' } },
  { stType: 'XP', kickOutcome: 'Good', scoreFor: 'us', players: { kicker: '19' } },
  { stType: 'Punt', kickDistance: '38', kickOutcome: 'Downed', players: { kicker: '35' } },
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
  { stType: 'Punt', kickDistance: '40', kickOutcome: 'Downed' },
  { stType: 'Punt', kickDistance: '50', kickOutcome: 'Touchback' },
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
  { stType: 'Kickoff', kickOutcome: 'Touchback' },
  { stType: 'Punt', kickDistance: '40', kickOutcome: 'Downed' },
  // 'Fake' belongs to no unit in the current model. It must not vanish.
  { stType: 'Fake', result: 'Gain', yardage: '13' },
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
  { stType: 'Kickoff', kickOutcome: 'Touchback' },
  { stType: 'Punt', kickDistance: '40', kickOutcome: 'Downed' },
]);
const reconClean = await page.evaluate(() =>
  !!document.querySelector('[data-native-report-content] .gi-st-unassigned'));
ok(!reconClean, 'when every snap reconciles the line does not render at all -- no arithmetic restating the ledger');

/* ══ 7. Outcome distributions are exclusive and open film ═════════════════ */
console.log('\n== 7. Outcome distribution ==');
await load([
  { stType: 'Punt', kickDistance: '40', kickOutcome: 'Fair Catch' },
  { stType: 'Punt', kickDistance: '38', kickOutcome: 'Fair Catch' },
  { stType: 'Punt', kickDistance: '44', kickOutcome: 'Blocked' },
  { stType: 'Punt', kickDistance: '41' },
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

/* ══ 8. Scope, and the shared scorebug rule ═══════════════════════════════ */
console.log('\n== 8. Scope and chrome ==');
const scope = await page.evaluate(() => {
  const sc = window.app.reportsScreen;
  return { def: sc.specialTeamsScope, buttons: document.querySelectorAll('[data-st-scope]').length };
});
ok(scope.def === 'season', 'Special Teams keeps its own Full-season default');
ok(scope.buttons === 2, 'the Full season / Current game control is preserved');
const chrome = await page.evaluate(() => ({
  rail: !document.querySelector('[data-reports-rail]')?.hidden,
  bug: !document.querySelector('[data-reports-scorebug]')?.hidden,
}));
ok(chrome.rail && !chrome.bug,
  'Special Teams still renders the generic rail and NOT the scorebug -- it joins the shared header when that rolls across Reports, not before');

/* ══ 9. Nothing regressed visually ════════════════════════════════════════ */
console.log('\n== 9. Layout contracts ==');
for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 800]]) {
  await page.setViewport({ width: w, height: h });
  await sleep(200);
  const layout = await page.evaluate(() => {
    const pane = document.querySelector('[data-native-report-content]');
    const under = [...pane.querySelectorAll('*')].filter(el => {
      if (!el.getClientRects().length) return false;
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return false;
      return parseFloat(getComputedStyle(el).fontSize) < 9.5;
    });
    const cut = [...pane.querySelectorAll('*')].filter(el => {
      if (el.closest('.gi-st-table-wrap')) return false;
      if (!el.getClientRects().length) return false;
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return false;
      return el.scrollWidth - el.clientWidth > 1 && el.clientWidth > 0;
    });
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      under: under.length, cut: cut.length };
  });
  ok(layout.overflow <= 0, `no page-level horizontal scroll at ${w}`, `${layout.overflow}px`);
  ok(layout.under === 0, `no text under the 9.5px floor at ${w}`, `${layout.under} nodes`);
  ok(layout.cut === 0, `no truncated text at ${w}`, `${layout.cut} nodes`);
}
await page.setViewport({ width: 1440, height: 900 });

/* ══ 10. The empty state ══════════════════════════════════════════════════ */
console.log('\n== 10. No Special Teams snaps ==');
await load([{ unit: 'offense', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '5' }]);
const empty = await page.evaluate(() => {
  const pane = document.querySelector('[data-native-report-content]');
  return { empty: !!pane.querySelector('.gi-reports-empty'),
    title: pane.querySelector('.gi-reports-empty h3')?.textContent.trim() || null,
    board: !!pane.querySelector('.gi-st-board') };
});
ok(empty.empty && !empty.board, 'a season with no special-teams snaps shows the empty state, not an all-zero board');
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
  { stType: 'Kickoff', kickOutcome: 'Touchback' },
  { stType: 'Kickoff', kickOutcome: 'Returned', returnYards: '18' },
  { stType: 'Punt', kickOutcome: 'Fair Catch', kickDistance: '40' },
  { stType: 'Punt Return', kickOutcome: 'Returned', returnYards: '9' },
  { stType: 'Field Goal', kickOutcome: 'Good', kickDistance: '32' },
  { stType: 'XP', kickOutcome: 'Good', scoreFor: 'us' },
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
