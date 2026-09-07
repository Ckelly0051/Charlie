/**
 * Reports > Overview — production parity against the coach-approved
 * composition.
 *
 * Approval record: `design-approvals/reports/overview/manifest.json`
 * (designStatus COMP_APPROVED, 2026-08-20). Canonical artifact:
 * `design-comps/visual-reset-2026-08/part2-verification/charlie-gate-density4`,
 * primary reference `1440x900-overview.png`, with the full approved text
 * captured in that directory's `metrics.json` under `metrics.overview`.
 *
 * Every expectation below is transcribed from that canonical record and then
 * asserted against the REAL production route. This harness never parses the
 * comp: a check that reads the artifact it is supposed to be verifying against
 * proves only that the artifact is self-consistent. The constants are the
 * specification; production has to meet them.
 *
 * The two archived FPO Overview documents under
 * `design-archive/reports/overview/early-fpo/` are superseded and are not
 * design authority for anything here.
 */
import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ── The approved composition, transcribed from the canonical record ─────── */

/** Section order, top to bottom. The KPI band leads and carries no title. */
const SECTIONS = [
  'Snaps by phase', 'Situational', 'Key metrics',
  'Rushing', 'Passing', 'Yards by type',
  'Down & distance', 'Game plan',
  'Big plays', 'Drives', 'Defense & discipline',
];
/** Module metas that are FIXED copy in the approved artifact. The rest state a
 *  sample and are matched by shape below. */
const FIXED_METAS = {
  'Situational': 'each tile opens film',
  'Key metrics': 'five coaching lenses',
  'Down & distance': 'run/pass mix and production',
  'Game plan': 'what the tags say',
};
const KPIS = ['Total plays', 'Success rate', 'Yards / play', 'Explosives',
  'Turnovers', 'Plays for loss', 'Penalties'];
const SITUATIONAL_TILES = ['Red zone', 'Goal line', 'Third down',
  '3rd & long', '3rd & short', 'Backed up'];
const KEY_METRICS = ['Efficiency', 'Explosive', 'Situational',
  'Tendencies', 'Negative', 'Points / drive'];
const RUSHING_ROWS = ['Attempts', 'Yards', 'Average', 'Touchdowns', 'Longest',
  'First downs', 'Fumbles'];
const PASSING_ROWS = ['Completions / attempts', 'Completion rate', 'Yards',
  'Yards / attempt', 'Touchdowns', 'Interceptions', 'Longest', 'Sacks taken'];
const DEFENSE_ROWS = ['Yards / play allowed', 'Stop rate', 'Explosives allowed',
  'Takeaways', 'Penalties accepted', 'Penalties declined'];
const COLUMNS = {
  'Snaps by phase': ['Phase', 'Snaps', 'Share', 'Yds/play'],
  'Yards by type': ['Play type', 'Snaps', 'Yds/play', 'Success'],
  'Down & distance': ['Situation', 'Snaps', 'Run / pass', 'Yds/play', 'Success', 'Conv'],
  'Big plays': ['Play', 'Situation', 'Call', 'Yds'],
};
const PHASE_ROWS = ['Offense', 'Defense', 'Special Teams'];
/** Sections that must NOT appear on Overview. Each is a real module title owned
 *  by another report or by a retired Overview draft; any of them rendering here
 *  means a board has leaked in or an obsolete section came back. */
const FORBIDDEN_SECTIONS = ['Offensive identity', 'Play calls', 'Formations',
  'Personnel', 'Situational Calls', 'Coverage Answers', 'Personnel and Formation',
  'Predictability', 'Recommendations', 'Film Room Insights', 'Game Log',
  'Early vs Recent', 'Wins vs Losses', 'Opponent Offense', 'Scheme',
  'Production by Play Type', 'Progression', 'Coaching Recommendations'];
/** Explanatory prose the approved Overview does not carry. Reports are dry data
 *  reporting; a module header states a title and at most a sample.
 *
 *  Scanned over the board EXCEPT the Game plan module. Game plan is the one
 *  surface the approved artifact lets speak — its own meta is "what the tags
 *  say" and its canonical lines include "mix in a draw or screen" and "add a
 *  pass concept to keep the defense honest". Banning advisory wording there
 *  would contradict the approval; banning it anywhere else is the rule. */
const FORBIDDEN_PROSE = [
  'what this means', 'how to read', 'this shows', 'these numbers',
  'consider', 'you should', 'we recommend', 'recommended',
  'chart more plays', 'unlock', 'coaching lens explained', 'definition',
];
/** Boards owned by other tabs. None may render inside the Overview pane. */
const FOREIGN_BOARDS = ['.gi-offense-board', '.gi-selfscout-board',
  '.gi-matchup-board', '.gi-season-board', '.gi-player-module',
  '.gi-st-board', '.gi-def-board'];

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 240000 });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(TEST_APP_URL, { waitUntil: 'networkidle0' });
await sleep(700);
await page.evaluate(async () => {
  await window.app.storage.createSeason({ name: 'Part 2 QA', team: 'Mavericks', year: '2026', level: 'Varsity' });
});

/* The canonical capture reports 63 charted snaps over 50 offensive, 13
   defensive and 3 special-teams plays — Special Teams reads 0 in Snaps by
   phase because an ST snap carries no play type. The fixture reproduces that
   phase split so the approved composition renders in full. */
const POPULATED = { off: 28, pass: 22, def: 13, st: 3 };
const load = async shape => {
  await page.evaluate(async spec => {
    const plays = [];
    let id = 0;
    const push = (unit, tags) => plays.push({
      id: ++id, timestamp: { start: id * 8, end: id * 8 + 5 },
      notes: '', annotations: [], penalties: [],
      tags: { custom: [], players: {}, grades: {}, quarter: `Q${(id % 4) + 1}`, unit, ...tags },
    });
    const RUN = ['Run Inside', 'Run Outside'];
    const PASS = ['Short Pass', 'Deep Pass', 'Play Action'];
    const FORMS = ['Wing-T', 'Trips', 'Ace'];
    const DD = [['1', '3'], ['1', '7'], ['1', '10'], ['2', '3'], ['2', '6'], ['3', '2'], ['3', '9']];
    for (let i = 0; i < spec.off; i++) {
      const [down, distance] = DD[i % DD.length];
      push('offense', { runPass: 'Run', playType: RUN[i % 2], formation: FORMS[i % 3],
        personnel: i % 2 ? '21' : '11', playCall: i % 2 ? 'Power' : 'Inside Zone',
        playConcept: i % 2 ? 'Power' : 'Inside Zone', down, distance,
        yardage: String([4, 8, 3, 18, 6, 1, 9, 5][i % 8]),
        result: i === 5 ? 'Touchdown' : 'Gain', players: { ballCarrier: '22' },
        ...(i === 5 ? { fieldSide: 'opp', yardLine: '6' } : {}) });
    }
    for (let i = 0; i < spec.pass; i++) {
      const [down, distance] = DD[i % DD.length];
      push('offense', { runPass: 'Pass', playType: PASS[i % 3], formation: FORMS[(i + 1) % 3],
        personnel: '11', playCall: 'Smash', playConcept: 'Smash', down, distance,
        yardage: i === 9 || i === 14 ? '0' : String([7, 12, 18, 5, 9, 3, 14, 6][i % 8]),
        result: i === 14 ? 'Interception' : i === 9 ? 'Incomplete' : i === 2 ? 'Touchdown' : 'Gain',
        players: { passer: '12', receiver: '84' } });
    }
    for (let i = 0; i < spec.def; i++) {
      push('defense', { defFront: '4-2-5', coverage: i % 3 ? 'Cover 3' : 'Cover 1',
        runPass: i % 2 ? 'Pass' : 'Run', playType: i % 2 ? 'Short Pass' : 'Run Inside',
        down: String((i % 3) + 1), distance: '8',
        yardage: i === 3 ? '19' : String(3 + (i % 5)),
        result: i === 9 ? 'Interception' : i % 3 === 0 ? 'No Gain' : 'Gain',
        players: { tackler: '51' } });
    }
    for (let i = 0; i < spec.st; i++) {
      push('special', { stType: ['Kickoff', 'Kick Return', 'Punt'][i % 3],
        kickOutcome: 'Returned', kickDistance: '45', players: { kicker: '3' } });
    }
    if (plays.length > 3) plays[3].penalties = [{ team: 'defense', foul: 'Holding',
      disposition: 'accepted', yards: 10, playCounts: true }];
    const store = window.app.storage.seasonStore;
    store.data.games = [{
      id: 'g-qa', name: 'vs St. Peter Lutheran', nextId: plays.length + 1, plays,
      gameInfo: { opponent: 'St. Peter Lutheran', date: '2026-08-21', week: '1',
        projectName: 'St. Peter Lutheran', perspective: 'self', scoreUs: 41, scoreThem: 0 },
      annotations: [], clipNames: [], isMultiClip: false, status: 'active', currentPlayId: 1,
    }];
    store.data.activeGameId = 'g-qa';
    await window.app.storage._loadActiveGame({ renderGames: false });
  }, shape);
  await sleep(450);
  await page.evaluate(() => window.app.workspaceShell.show('reports'));
  await sleep(200);
  await page.evaluate(() => window.app.reportsScreen.selectTab('overview'));
  await sleep(650);
};

/** Everything the approved composition names, read off the live pane. */
const board = () => page.evaluate(() => {
  const pane = document.querySelector('[data-pane="overview"]');
  const modules = [...(pane?.querySelectorAll('.gi-overview-module') || [])];
  const title = m => m.querySelector('header > strong')?.textContent.trim() || '';
  const byTitle = name => modules.find(m => title(m) === name) || null;
  const cols = name => {
    const m = byTitle(name);
    return m ? [...m.querySelectorAll('table thead th')].map(n => n.textContent.trim()) : null;
  };
  const rowLabels = name => {
    const m = byTitle(name);
    return m ? [...m.querySelectorAll('.gi-overview-rows > div > span')].map(n => n.textContent.trim()) : null;
  };
  return {
    hasPane: !!pane,
    hasBoard: !!pane?.querySelector('.gi-overview-board'),
    sections: modules.map(title),
    metas: Object.fromEntries(modules.map(m => [title(m), m.querySelector('header > span')?.textContent.trim() || ''])),
    kpiLabels: [...(pane?.querySelectorAll('.gi-overview-kpi > span') || [])].map(n => n.textContent.trim()),
    kpiSubs: [...(pane?.querySelectorAll('.gi-overview-kpi > small') || [])].map(n => n.textContent.trim()),
    kpiBandCount: pane?.querySelectorAll('.gi-overview-kpis').length || 0,
    situational: [...(byTitle('Situational')?.querySelectorAll('.gi-overview-tiles > * > span') || [])].map(n => n.textContent.trim()),
    keyMetrics: [...(byTitle('Key metrics')?.querySelectorAll('.gi-overview-lenses > div > span') || [])].map(n => n.textContent.trim()),
    rushing: rowLabels('Rushing'), passing: rowLabels('Passing'),
    defense: rowLabels('Defense & discipline'),
    phaseRows: [...(byTitle('Snaps by phase')?.querySelectorAll('tbody tr td:first-child') || [])].map(n => n.textContent.trim()),
    columns: { 'Snaps by phase': cols('Snaps by phase'), 'Yards by type': cols('Yards by type'),
      'Down & distance': cols('Down & distance'), 'Big plays': cols('Big plays') },
    text: (pane?.innerText || ''),
    /* The board minus Game plan, for the prose scan. */
    textOutsidePlan: modules.filter(m => title(m) !== 'Game plan')
      .map(m => m.innerText || '').join('\n')
      + '\n' + [...(pane?.querySelectorAll('.gi-overview-kpi') || [])].map(n => n.innerText).join('\n'),
    foreign: ['.gi-offense-board', '.gi-selfscout-board', '.gi-matchup-board', '.gi-season-board',
      '.gi-player-module', '.gi-st-board', '.gi-def-board'].filter(sel => !!pane?.querySelector(sel)),
    activeTab: document.querySelector('.gi-reports-tab.active')?.getAttribute('data-report-tab'),
    activeTabText: document.querySelector('.gi-reports-tab.active')?.textContent.trim(),
    screenTab: window.app.reportsScreen.activeTab,
    paneAttr: document.querySelector('[data-native-main-report]')?.getAttribute('data-pane'),
    filmRows: pane?.querySelectorAll('[role="button"]').length || 0,
  };
});

/* ══ 1. Ownership and navigation state ═══════════════════════════════════ */
console.log('\n== 1. Overview ownership and navigation state ==');
await load(POPULATED);
let b = await board();
ok(b.hasPane && b.hasBoard && b.paneAttr === 'overview',
  'the Overview board renders in the Overview pane of the production route', JSON.stringify({ pane: b.hasPane, board: b.hasBoard, attr: b.paneAttr }));
ok(b.screenTab === 'overview' && b.activeTab === 'overview' && b.activeTabText === 'Overview',
  'Overview is the selected report and the tab strip says so', JSON.stringify({ screen: b.screenTab, tab: b.activeTab, text: b.activeTabText }));
ok(b.foreign.length === 0,
  'no other report board renders inside Overview', JSON.stringify(b.foreign));

/* ══ 2. Section composition and order ════════════════════════════════════ */
console.log('\n== 2. Section composition and order ==');
ok(eq(b.sections, SECTIONS),
  'the approved sections render in the approved order', JSON.stringify(b.sections));
const extras = b.sections.filter(s => !SECTIONS.includes(s));
ok(extras.length === 0, 'no unapproved section is added to Overview', JSON.stringify(extras));
const forbidden = FORBIDDEN_SECTIONS.filter(name => b.sections.includes(name));
ok(forbidden.length === 0, 'no obsolete or foreign section reappears', JSON.stringify(forbidden));
ok(b.kpiBandCount === 1, 'exactly one KPI band leads the board', String(b.kpiBandCount));

/* ══ 3. Metric and column labels ═════════════════════════════════════════ */
console.log('\n== 3. Metric and column labels ==');
ok(eq(b.kpiLabels, KPIS), 'the seven approved KPI tiles, in order', JSON.stringify(b.kpiLabels));
ok(eq(b.situational, SITUATIONAL_TILES), 'the six Situational tiles, in order', JSON.stringify(b.situational));
ok(eq(b.keyMetrics, KEY_METRICS), 'the six Key metrics lenses, in order', JSON.stringify(b.keyMetrics));
ok(eq(b.rushing, RUSHING_ROWS), 'the Rushing rows, in order', JSON.stringify(b.rushing));
ok(eq(b.passing, PASSING_ROWS), 'the Passing rows, in order', JSON.stringify(b.passing));
ok(eq(b.defense, DEFENSE_ROWS), 'the Defense & discipline rows, in order', JSON.stringify(b.defense));
ok(eq(b.phaseRows, PHASE_ROWS), 'Snaps by phase names all three phases, in order', JSON.stringify(b.phaseRows));
for (const [name, expected] of Object.entries(COLUMNS)) {
  ok(eq(b.columns[name], expected), `${name} carries the approved columns, in order`, JSON.stringify(b.columns[name]));
}

/* ══ 4. Module header copy ═══════════════════════════════════════════════ */
console.log('\n== 4. Module header copy ==');
for (const [name, meta] of Object.entries(FIXED_METAS)) {
  ok(b.metas[name] === meta, `${name} carries its approved meta`, JSON.stringify(b.metas[name]));
}
/* The approved artifact separates a count from its qualifier with a middot,
   never a comma: "63 charted · 100%", "12 drives · 5 scored", "1 · 10 yds". */
ok(/^\d+ charted · \d+%$/.test(b.kpiSubs[0]),
  'the Total plays sub uses the approved "charted · 100%" form', JSON.stringify(b.kpiSubs[0]));
ok(/^\d+ drives · \d+ scored$/.test(b.metas['Drives']),
  'the Drives meta uses the approved "N drives · M scored" form', JSON.stringify(b.metas['Drives']));
const penalties = b.text.split('\n').find(l => l.trim() === 'Penalties accepted');
const penaltyValue = (() => {
  const lines = b.text.split('\n').map(l => l.trim());
  const i = lines.indexOf('Penalties accepted');
  return i >= 0 ? lines[i + 1] : '';
})();
ok(!!penalties && /^(0|\d+ · \d+ yds)$/.test(penaltyValue),
  'Penalties accepted uses the approved "N · Y yds" form', JSON.stringify(penaltyValue));
ok(/^\d+ attempts$/.test(b.metas['Rushing']) && /^\d+ attempts$/.test(b.metas['Passing']),
  'Rushing and Passing state their sample as "N attempts"', JSON.stringify([b.metas['Rushing'], b.metas['Passing']]));
ok(/^\d+ total$/.test(b.metas['Snaps by phase']) && /^\d+ total$/.test(b.metas['Yards by type'])
  && /^\d+ total$/.test(b.metas['Big plays']),
  'Snaps by phase, Yards by type and Big plays state their sample as "N total"',
  JSON.stringify([b.metas['Snaps by phase'], b.metas['Yards by type'], b.metas['Big plays']]));
ok(/^\d+ defensive snaps$/.test(b.metas['Defense & discipline']),
  'Defense & discipline states its sample as "N defensive snaps"', JSON.stringify(b.metas['Defense & discipline']));

/* ══ 5. No unapproved explanatory prose ══════════════════════════════════ */
console.log('\n== 5. No unapproved explanatory prose ==');
const metaValues = Object.values(b.metas).filter(Boolean);
const wordy = metaValues.filter(m => m.split(/\s+/).length > 5 || /[.!?]$/.test(m));
ok(wordy.length === 0,
  'no module header carries an explanatory sentence', JSON.stringify(wordy));
const prose = FORBIDDEN_PROSE.filter(p => b.textOutsidePlan.toLowerCase().includes(p));
ok(prose.length === 0,
  'no instructional or interpretive prose renders outside Game plan', JSON.stringify(prose));
/* Game plan is allowed to advise, but it is still the ONLY module that may.
   If it ever disappears, the exemption above must not silently widen. */
ok(b.sections.includes('Game plan'),
  'Game plan is present, so the prose exemption above is scoped to a real module');

/* ══ 6. Film actions survive ═════════════════════════════════════════════ */
console.log('\n== 6. Film actions ==');
const film = await page.evaluate(async () => {
  const app = window.app;
  const original = app.filmNavigation.watch;
  const originalWatchPlays = app.stats._watchPlays;
  const calls = [];
  app.filmNavigation.watch = (refs, options) => calls.push(options?.label || '');
  app.stats._watchPlays = (predicate, label) => calls.push(label);
  const pane = document.querySelector('[data-pane="overview"]');
  const click = sel => pane?.querySelector(sel)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  click('.gi-overview-tiles [role="button"]');
  click('.gi-overview-module table tbody tr[role="button"]');
  click('.gi-overview-drive');
  await new Promise(r => requestAnimationFrame(r));
  app.filmNavigation.watch = original;
  app.stats._watchPlays = originalWatchPlays;
  return calls.filter(Boolean);
});
ok(film.length >= 2,
  'Overview rows and tiles still open their own film cohorts', JSON.stringify(film));

/* ══ 7. Sparse and empty behavior ════════════════════════════════════════ */
console.log('\n== 7. Sparse and empty behavior ==');
await load({ off: 3, pass: 2, def: 1, st: 0 });
const sparse = await board();
ok(eq(sparse.sections, SECTIONS),
  'a sparse game still renders the full approved composition', JSON.stringify(sparse.sections));
ok(/No data|—/.test(sparse.text),
  'an unavailable measurement reads as an absence, not a fabricated zero');
await load({ off: 0, pass: 0, def: 0, st: 0 });
const empty = await page.evaluate(() => {
  const pane = document.querySelector('[data-pane="overview"]');
  return { board: !!pane?.querySelector('.gi-overview-board'),
    emptyState: !!pane?.querySelector('.gi-reports-empty'),
    modules: pane?.querySelectorAll('.gi-overview-module').length || 0,
    text: (pane?.innerText || '').trim().split('\n')[0] || '' };
});
ok(!empty.board && empty.emptyState && empty.modules === 0,
  'with nothing charted the board is replaced by the empty state, not by empty modules',
  JSON.stringify(empty));

/* ══ 8. Containment at every registered viewport ═════════════════════════ */
console.log('\n== 8. Containment at every registered viewport ==');
/* The four viewports the canonical capture set registers for this surface. */
const VIEWPORTS = [[1440, 900], [1280, 720], [768, 1024], [390, 844]];
await load(POPULATED);
const overflowAt = [], clipped = [];
for (const [width, height] of VIEWPORTS) {
  await page.setViewport({ width, height });
  await sleep(350);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const measured = await page.evaluate(() => {
    const doc = document.documentElement;
    const pane = document.querySelector('[data-pane="overview"]');
    const clips = [];
    pane?.querySelectorAll('.gi-overview-module th, .gi-overview-module td, .gi-overview-kpi > span, .gi-overview-module header > strong')
      .forEach(cell => {
        if (!cell.getClientRects().length) return;
        const range = document.createRange();
        range.selectNodeContents(cell);
        const style = getComputedStyle(cell);
        const inner = cell.getBoundingClientRect().width
          - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        if (range.getBoundingClientRect().width - inner > 1) clips.push(cell.textContent.trim().slice(0, 30));
      });
    return { overflow: doc.scrollWidth - doc.clientWidth, clips,
      sections: [...(pane?.querySelectorAll('.gi-overview-module > header > strong') || [])].map(n => n.textContent.trim()) };
  });
  if (measured.overflow > 0) overflowAt.push(`${width}=${measured.overflow}`);
  if (measured.clips.length) clipped.push(`${width}: ${measured.clips.join(' | ')}`);
  ok(eq(measured.sections, SECTIONS), `the composition survives intact at ${width}x${height}`,
    JSON.stringify(measured.sections));
}
ok(overflowAt.length === 0, 'no page-level horizontal overflow at any registered viewport', overflowAt.join(' / '));
ok(clipped.length === 0, 'no clipped label, header or cell at any registered viewport', clipped.join(' / '));
await page.setViewport({ width: 1440, height: 900 });

console.log('\n== 9. Page health ==');
ok(errors.length === 0, 'zero page or console errors across every state', errors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
