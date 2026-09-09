/**
 * Reports > Offense — the approved composition, its football contracts, and
 * the shared scorebug rule.
 *
 * Every assertion here drives the real route and reads the rendered result.
 * None of it searches source text: a test that greps for a selector passes
 * against a file that never renders.
 */
import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const eqArr = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
  await window.app.storage.createSeason({ name: '2026 Offense QA', team: 'Mavericks', year: '2026', level: 'Varsity' });
});

/**
 * Loads one game and opens a Reports tab. `plays` are given as partial tag
 * objects; everything a play needs to be a countable offensive snap is filled
 * in here so each test states only the fields it is actually about.
 */
const load = async (opts) => {
  await page.evaluate(async o => {
    const store = window.app.storage.seasonStore;
    const plays = o.plays.map((tags, i) => ({
      id: i + 1, timestamp: { start: i * 10, end: i * 10 + 6 }, notes: '', annotations: [],
      tags: { custom: [], players: {}, grades: {}, unit: 'offense', formation: 'Ace',
        runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '5',
        down: '1', distance: '10', quarter: 'Q1', ...tags },
    }));
    store.data.games = [{
      id: o.gameId || 'g-off', name: o.opponent || 'Wildcats', nextId: plays.length + 1, plays,
      gameInfo: { opponent: o.opponent || 'Wildcats', date: '2026-09-04', week: '1',
        projectName: o.opponent || 'Wildcats', perspective: 'self',
        scoreUs: o.scoreUs == null ? 28 : o.scoreUs, scoreThem: o.scoreThem == null ? 21 : o.scoreThem },
      annotations: [], clipNames: [], isMultiClip: false, status: 'active', currentPlayId: 1,
    }];
    store.data.activeGameId = o.gameId || 'g-off';
    if (o.teamName) window.app.teamRegistry?.saveTeamIdentity?.(o.teamName, '', 'navy');
    await window.app.storage._loadActiveGame({ renderGames: false });
  }, opts);
  await sleep(500);
  await page.evaluate(() => window.app.workspaceShell.show('reports'));
  await sleep(400);
  await page.evaluate(tab => window.app.reportsScreen.selectTab(tab), opts.tab || 'offense');
  await sleep(700);
};

/** A representative charted game: eight distinct calls, mixed run/pass. */
const FULL = Array.from({ length: 16 }, (_, i) => {
  const c = [
    ['26 Blast', 'Inside Zone', 'Run', 'Run Inside', 'Gain', '8'],
    ['Mesh', 'Quick Game', 'Pass', 'Short Pass', 'Gain', '12'],
    ['Power G', 'Gap', 'Run', 'Run Inside', 'No Gain', '0'],
    ['Four Verts', 'Drop Back', 'Pass', 'Deep Pass', 'Incomplete', '0'],
  ][i % 4];
  return { playCall: c[0], playConcept: c[1], runPass: c[2], playType: c[3], result: c[4], yardage: c[5],
    down: String((i % 3) + 1), distance: '10', quarter: 'Q' + ((i % 4) + 1),
    // Field position, so the spray chart in Zone 5 actually renders. Without
    // it `offenseVisualizationData` produces no `spray`, the chart is absent,
    // and any assertion about its axis labels passes on an empty board.
    fieldSide: i % 2 ? 'Own' : 'Opp', yardLine: String(20 + (i % 60)), hash: ['Left', 'Middle', 'Right'][i % 3] };
});

/* ══ The approved Offense SCHEMA ══════════════════════════════════════════
   Transcribed from the registered canonical artifact,
   `design-comps/reports-offense-2026-09-03/offense.html`, plus the coach-approved
   2026-09-08 density revision: 6 zones, 27 modules
   in this order, and each module's approved row allocation. Stated as literal
   constants — this file never parses the comp, because a check that reads the
   artifact it verifies against only proves the artifact is self-consistent.

   A sparse cohort renders the SAME 27 modules with `Insufficient
   charted data` in the empty ones, which is the behaviour these assertions
   pin: data fills slots, it never adds rows or removes modules. */
const SCHEMA_MODULES = [
  'Identity', 'Run / pass balance',
  'Play calls', 'Concepts',
  'Formation', 'Play type', 'Play-action',
  'Core tendencies', 'Direction vs Strength', 'Calls by situation', 'Drive outcomes',
  'Personnel', 'Backfield', 'Motion',
  'Play direction', 'Strength', 'Field hash',
  'Personnel × situation', 'Situational',
  'Tendency matrix', 'By quarter',
  'Field heat map',
  'Yards per play', 'Yards vs distance to go',
  'Success by field position', 'Run / pass by down',
  'Team profile', 'Expected points added',
];
const SCHEMA_ROWS = {
  'Run / pass balance': 4, 'Play calls': 5, Concepts: 5, Formation: 3,
  'Play type': 5, 'Play-action': 3, 'Core tendencies': 5,
  'Direction vs Strength': 4, 'Calls by situation': 8,
  Personnel: 5, Backfield: 5, Motion: 4, 'Play direction': 3, Strength: 3,
  'Field hash': 3, 'Personnel × situation': 6, Situational: 6,
  'Tendency matrix': 5, 'By quarter': 4, 'Team profile': 6,
};
const ABSENCE = 'Insufficient charted data';
/** Module titles as rendered, with the computed `· Big N` suffix normalized so
 *  the inventory compares against the schema name rather than the data. */
const readBoard = () => page.evaluate(() => {
  const board = document.querySelector('.gi-offense-board');
  if (!board) return { board: false };
  const txt = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const mods = [...board.querySelectorAll('.gi-overview-module')];
  return {
    board: true,
    titles: mods.map(m => txt(m.querySelector('header > strong')).replace(/\s*·\s*Big\s*\d+$/, '')),
    rawTitles: mods.map(m => txt(m.querySelector('header > strong'))),
    rows: Object.fromEntries(mods.map(m => [
      txt(m.querySelector('header > strong')).replace(/\s*·\s*Big\s*\d+$/, ''),
      m.querySelectorAll('tbody tr').length])),
    absent: mods.filter(m => /Insufficient charted data/.test(m.textContent))
      .map(m => txt(m.querySelector('header > strong')).replace(/\s*·\s*Big\s*\d+$/, '')),
    zones: board.querySelectorAll('.gi-zone-rule').length,
    ovX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

console.log('\n== 1. The approved six-zone composition ==');
await load({ plays: FULL });
const zones = await page.evaluate(() => {
  const board = document.querySelector('.gi-offense-board');
  return {
    board: !!board,
    rules: [...document.querySelectorAll('.gi-zone-rule')].map(r => ({
      id: r.id, title: r.querySelector('h2')?.textContent.trim(), label: r.querySelector('p')?.textContent.trim() })),
    navLabels: [...document.querySelectorAll('.gi-zone-nav-item')].map(b => b.textContent.replace(/^\d/, '').trim()),
    kpis: [...document.querySelectorAll('.gi-overview-kpi')].map(k => k.querySelector('span')?.textContent.trim()),
  };
});
ok(zones.board, 'the Offense tab renders the offense board');
ok(zones.rules.length === 6 && zones.rules.every((r, i) => r.id === `gi-off-z${i + 1}`),
  'six zones render in order with stable ids', JSON.stringify(zones.rules.map(r => r.id)));
const EXPECT_ZONES = [
  ['Offensive identity', 'Personnel, formation, alignment, and primary call'],
  ['Calls and tendencies', 'Frequency and production'],
  ['Structure and deployment', 'Personnel, alignment, motion, direction, and hash'],
  ['Situational analysis', 'Down, distance, quarter, and personnel'],
  ['Field and production', 'Distribution and field position'],
  ['Advanced metrics', 'Team profile and EPA'],
];
ok(EXPECT_ZONES.every(([t, l], i) => zones.rules[i]?.title === t && zones.rules[i]?.label === l),
  'every zone carries its approved title and supporting label',
  JSON.stringify(zones.rules));
ok(zones.navLabels.length === 6 && zones.navLabels.every((l, i) => l.toLowerCase() === EXPECT_ZONES[i][0].toLowerCase()),
  'the zone nav lists all six zones in composition order', JSON.stringify(zones.navLabels));

console.log('\n== 2. The KPI band is the approved six, and excludes Yards/play ==');
ok(zones.kpis.length === 6, 'the KPI band has exactly six columns', JSON.stringify(zones.kpis));
ok(['Success rate', 'Explosive', 'Negative', 'Run / pass', 'Points / drive', '3rd down']
  .every((l, i) => zones.kpis[i] === l), 'the six KPIs are the approved set in order', JSON.stringify(zones.kpis));
ok(!zones.kpis.some(l => /yards?\s*\/\s*play|yds\s*\/\s*play/i.test(l || '')),
  'Yards/play is not duplicated into the KPI band -- the scorebug above it already leads with that metric',
  JSON.stringify(zones.kpis));

console.log('\n== 3. Success rate states the count the engine actually produced ==');
// Every play in this fixture gains 8 on 1st & 10, which is a success by the
// engine's own rule, so the numerator must equal the snap count. Reading a
// key StatsEngine does not publish (`successfulPlays` rather than `successes`)
// renders "100% -- 0 of N snaps": a rate and its own evidence contradicting
// each other on screen.
await load({ plays: Array.from({ length: 12 }, () => ({ yardage: '8', down: '1', distance: '10' })) });
const succTile = await page.evaluate(() => {
  const k = [...document.querySelectorAll('.gi-overview-kpi')]
    .find(el => el.querySelector('span')?.textContent.trim() === 'Success rate');
  return { value: k?.querySelector('strong')?.textContent.trim(), sub: k?.querySelector('small')?.textContent.trim() };
});
ok(succTile.sub === '12 of 12 snaps',
  'the Success rate sub-line counts the engine\'s successes, not a key it never publishes',
  JSON.stringify(succTile));
ok(succTile.value === '100%', 'the Success rate value agrees with its own sub-line', JSON.stringify(succTile));

console.log('\n== 4. No third down charted reads as unavailable, not as 0% ==');
await load({ plays: Array.from({ length: 8 }, () => ({ down: '1', distance: '10' })) });
const noThird = await page.evaluate(() => {
  const k = [...document.querySelectorAll('.gi-overview-kpi')]
    .find(el => el.querySelector('span')?.textContent.trim() === '3rd down');
  return { value: k?.querySelector('strong')?.textContent.trim(), sub: k?.querySelector('small')?.textContent.trim() };
});
ok(noThird.value === '—' && noThird.sub === 'none charted',
  'a game with no third down reports it as uncharted, never as a 0% conversion rate',
  JSON.stringify(noThird));

console.log('\n== 5. A real 0-for-N third down is still reported as failure ==');
// The distinction the previous assertion protects only means something if a
// genuine 0-for-N still reads as 0%. Four third downs, none converted.
await load({ plays: Array.from({ length: 4 }, () => ({ down: '3', distance: '10', yardage: '1', result: 'Gain' })) });
const realZero = await page.evaluate(() => {
  const k = [...document.querySelectorAll('.gi-overview-kpi')]
    .find(el => el.querySelector('span')?.textContent.trim() === '3rd down');
  return { value: k?.querySelector('strong')?.textContent.trim(), sub: k?.querySelector('small')?.textContent.trim() };
});
ok(realZero.value === '0%' && /0\/4/.test(realZero.sub || ''),
  'four unconverted third downs report 0% on 0/4, distinct from nothing charted',
  JSON.stringify(realZero));

console.log('\n== 6. Every identity tile with a cohort opens exact film ==');
await load({ plays: FULL });
const identity = await page.evaluate(() => {
  const tiles = [...document.querySelectorAll('.gi-off-identity-strip > *')];
  const top = tiles.find(t => t.querySelector('span')?.textContent.trim() === 'TOP CALL'
    || /top call/i.test(t.querySelector('span')?.textContent || ''));
  return {
    tiles: tiles.length,
    topValue: top?.querySelector('strong')?.textContent.trim(),
    topClickable: !!top?.classList.contains('cut-row'),
    topFocusable: top?.getAttribute('tabindex') === '0',
    clickable: tiles.filter(t => t.classList.contains('cut-row')).length,
  };
});
ok(identity.tiles === 6,
  'the identity strip renders its six tiles -- personnel, formation, alignment, run/pass, play type, and top call',
  JSON.stringify(identity));
ok(identity.topClickable && identity.topFocusable,
  'the Top call tile opens film and is keyboard reachable -- its analysis supplies bare playIds and no composite refs in single-game scope, so a tile that reads only `refs` is a dead tile',
  JSON.stringify(identity));

console.log('\n== 7. Identity film refs are exact composite gameId::playId ==');
const refs = await page.evaluate(() => {
  const calls = [];
  const screen = window.app.reportsScreen;
  const real = screen.watchRefs.bind(screen);
  screen.watchRefs = (r, label) => { calls.push({ refs: r, label }); return true; };
  const top = [...document.querySelectorAll('.gi-off-identity-strip > *')]
    .find(t => /top call/i.test(t.querySelector('span')?.textContent || ''));
  top?.click();
  screen.watchRefs = real;
  const gid = window.app.storage.seasonStore.activeGame().id;
  return { calls: calls.length, refs: calls[0]?.refs || [], gid };
});
ok(refs.calls === 1, 'activating the Top call tile requests film exactly once', JSON.stringify(refs.calls));
ok(refs.refs.length > 0 && refs.refs.every(r => new RegExp(`^${refs.gid}::\\d+$`).test(r)),
  'every ref it opens is a composite gameId::playId for the active game',
  JSON.stringify(refs.refs.slice(0, 4)));

console.log('\n== 8. Zone 3 keeps its approved grouping and order ==');
const zone3 = await page.evaluate(() => {
  const rule = document.getElementById('gi-off-z3');
  const out = []; let el = rule?.nextElementSibling;
  while (el && !el.classList.contains('gi-zone-rule')) {
    if (el.classList.contains('gi-overview-band')) {
      out.push([...el.children].map(m => m.querySelector('header strong')?.textContent.trim()));
    }
    el = el.nextElementSibling;
  }
  return out;
});
ok(JSON.stringify(zone3[0]) === JSON.stringify(['Personnel', 'Backfield', 'Motion']),
  'Zone 3 row one is Personnel, Backfield, Motion', JSON.stringify(zone3[0]));
ok(JSON.stringify(zone3[1]) === JSON.stringify(['Play direction', 'Strength', 'Field hash']),
  'Zone 3 row two is Play direction, Strength, Field hash', JSON.stringify(zone3[1]));

console.log('\n== 9. The scorebug and the generic rail are mutually exclusive ==');
const chrome = {};
for (const tab of ['overview', 'offense', 'defense', 'special', 'players']) {
  await page.evaluate(t => window.app.reportsScreen.selectTab(t), tab);
  await sleep(450);
  chrome[tab] = await page.evaluate(() => ({
    bug: document.querySelector('[data-reports-scorebug]')?.hidden !== true,
    rail: document.querySelector('[data-reports-rail]')?.hidden !== true,
  }));
}
ok(chrome.overview.bug && !chrome.overview.rail, 'Overview shows the scorebug and hides the rail', JSON.stringify(chrome.overview));
ok(chrome.offense.bug && !chrome.offense.rail, 'Offense shows the scorebug and hides the rail', JSON.stringify(chrome.offense));
ok(!chrome.defense.bug && !chrome.defense.rail,
  'full-season Defense suppresses both current-game chrome elements', JSON.stringify(chrome.defense));
ok(!chrome.special.rail && !chrome.special.bug && chrome.players.rail && !chrome.players.bug,
  'full-season Special Teams suppresses game chrome while game-scoped Players keeps the KPI rail', JSON.stringify([chrome.special, chrome.players]));
ok(Object.values(chrome).every(c => !(c.bug && c.rail)),
  'no tab ever shows the scorebug and the generic rail at the same time', JSON.stringify(chrome));

console.log('\n== 10. Each full team name, quarters, and total share one aligned row ==');
const geometry = [];
for (const c of [
  { teamName: 'Ace', opponent: 'Bay', scoreUs: 7, scoreThem: 3 },
  { teamName: 'Immaculate Heart of Mary Catholic Academy', opponent: 'Bay', scoreUs: 28, scoreThem: 21 },
  { teamName: 'Immaculate Heart of Mary Catholic Academy', opponent: 'Our Lady of Perpetual Help Prep', scoreUs: 118, scoreThem: 107 },
]) {
  await load({ plays: FULL, ...c });
  geometry.push(await page.evaluate(() => {
    const bug = document.querySelector('[data-reports-scorebug]');
    const x = el => Math.round(el.getBoundingClientRect().left);
    return {
      totals: [...bug.querySelectorAll('.gi-scorebug-row:not(.is-head) .gi-scorebug-total')].map(x),
      quarterCols: [...bug.querySelectorAll('.gi-scorebug-row:not(.is-head)')].map(row =>
        [...row.querySelectorAll('.gi-scorebug-q')].map(x)),
      names: [...bug.querySelectorAll('.gi-scorebug-row:not(.is-head) .gi-scorebug-name')].map(s => ({
        text: s.textContent.trim(), clipped: s.scrollWidth > s.clientWidth + 1,
        visible: s.getBoundingClientRect().height > 0 })),
    };
  }));
}
const [a, b, c3] = geometry;
ok(geometry.every(g => g.totals.length === 2 && g.totals[0] === g.totals[1]),
  'both team totals occupy one shared total column', JSON.stringify(geometry.map(g => g.totals)));
ok(geometry.every(g => g.quarterCols.length === 2 && JSON.stringify(g.quarterCols[0]) === JSON.stringify(g.quarterCols[1])),
  'both teams occupy the same four quarter columns', JSON.stringify(geometry.map(g => g.quarterCols)));
ok(c3.names.every(n => n.visible && !n.clipped)
    && c3.names.map(n => n.text).join('|') === 'Immaculate Heart of Mary Catholic Academy|Our Lady of Perpetual Help Prep',
  'long team names render in full without truncation',
  JSON.stringify(c3.names));

console.log('\n== 11. The empty state is a state, not a framed vacancy ==');
await load({ plays: [] });
const empty = await page.evaluate(() => {
  const e = document.querySelector('.gi-reports-empty');
  const cta = e?.querySelector('.gi-reports-empty-cta');
  return {
    title: e?.querySelector('h3')?.textContent.trim(), body: e?.querySelector('p')?.textContent.trim(),
    cta: cta?.textContent.trim(), height: Math.round(e?.getBoundingClientRect().height || 0),
    bug: document.querySelector('[data-reports-scorebug]')?.hidden !== true,
    bugMarkup: (document.querySelector('[data-reports-scorebug]')?.innerHTML || '').trim().length,
  };
});
ok(empty.title === 'No offensive snaps charted', 'the empty state names the condition', JSON.stringify(empty.title));
ok(empty.body === 'Chart offensive plays to populate this report.', 'the empty state states the next action', JSON.stringify(empty.body));
ok(empty.cta === 'Open Break Down', 'the empty state carries the route command', JSON.stringify(empty.cta));
ok(empty.height > 0 && empty.height < 220, 'the empty state does not reserve hundreds of pixels', String(empty.height));
ok(!empty.bug && empty.bugMarkup === 0, 'empty data leaves no blank scorebug container behind', JSON.stringify(empty));

console.log('\n== 12. The empty-state command uses the app\'s own navigation ==');
await load({ plays: [] });
const routed = await page.evaluate(async () => {
  document.querySelector('.gi-reports-empty-cta')?.click();
  await new Promise(r => setTimeout(r, 600));
  return window.app.workspace.currentRoute?.() || null;
});
ok(String(routed || '').includes('breakdown'), 'Open Break Down navigates through the shell, not a second route mechanism', JSON.stringify(routed));

console.log('\n== 13. A sticky column header never covers its own first row ==');
// `.gi-table-wrap` sets overflow-x, which computes overflow-y to auto and
// makes the wrap the sticky containing block. The route-wide 42px offset is
// measured against the page scroller, so inside a wrap it pins the header
// 42px down and holds it there, on top of the first data row.
await load({ plays: FULL });
const sticky = await page.evaluate(() => [...document.querySelectorAll('.gi-offense-board .gi-table-wrap')]
  .map(w => {
    const th = w.querySelector('thead th'), tr = w.querySelector('tbody tr');
    if (!th || !tr) return null;
    return { mod: w.previousElementSibling?.querySelector('strong')?.textContent.trim(),
      overlap: Math.round(th.getBoundingClientRect().bottom - tr.getBoundingClientRect().top) };
  }).filter(Boolean));
ok(sticky.length > 0 && sticky.every(s => s.overlap <= 1),
  'no table header overlaps its first data row',
  JSON.stringify(sticky.filter(s => s.overlap > 1)));

console.log('\n== 14. Column labels remain readable and explanatory subheads are absent ==');
const type = await page.evaluate(() => {
  const rgb = s => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const bgOf = el => { let e = el; while (e) { const c = getComputedStyle(e).backgroundColor;
    if (c && !/rgba?\(0, 0, 0, 0\)|transparent/.test(c)) return rgb(c); e = e.parentElement; } return [0, 0, 0]; };
  const probe = sel => { const el = document.querySelector(sel); if (!el) return null;
    const cs = getComputedStyle(el), f = L(rgb(cs.color)), g = L(bgOf(el));
    return { size: parseFloat(cs.fontSize), family: cs.fontFamily.split(',')[0].replace(/"/g, ''),
      ratio: +(((Math.max(f, g) + 0.05) / (Math.min(f, g) + 0.05)).toFixed(2)) }; };
  const visibleExplainers = [...document.querySelectorAll('.gi-offense-board .gi-overview-module>header span, .gi-offense-board .gi-zone-rule p')]
    .filter(el => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0)
    .map(el => el.textContent.trim());
  return { th: probe('.gi-offense-board .gi-overview-module th'), visibleExplainers };
});
ok(type.th && type.th.size >= 12 && !/Condensed/i.test(type.th.family),
  'column labels are operational copy in the body face at the label token size, not a condensed display face',
  JSON.stringify(type.th));
ok(type.th && type.th.ratio >= 4.5, 'column labels meet the 4.5:1 small-text minimum', JSON.stringify(type.th));
ok(type.visibleExplainers.length === 0,
  'Offense module and zone headers render no explanatory secondary prose',
  JSON.stringify(type.visibleExplainers));

console.log('\n== 15. Season > Offense embeds the same board without duplicate ids ==');
await load({ plays: FULL, tab: 'season' });
// Season carries its own sub-tabs and opens on Overview; the embedded
// OffenseTab only exists once its Offense sub-tab is selected.
await page.evaluate(() => [...document.querySelectorAll('.gi-season-nav .gi-subtab')]
  .find(b => b.textContent.trim() === 'Offense')?.click());
await sleep(700);
const season = await page.evaluate(() => ({
  activeTab: window.app.reportsScreen.activeTab,
  stack: document.querySelectorAll('.gi-season-sections').length,
  boards: document.querySelectorAll('.gi-offense-board').length,
  inStack: document.querySelectorAll('.gi-season-sections .gi-offense-board').length,
  z1: document.querySelectorAll('#gi-off-z1').length,
  navs: document.querySelectorAll('.gi-zone-nav').length,
}));
ok(season.activeTab === 'season' && season.stack === 1,
  'the route is still on the Season tab -- a document-wide "Offense" lookup leaves it for the main tab of that name',
  JSON.stringify(season));
ok(season.boards === 1 && season.inStack === 1,
  'the Season tab renders exactly one offense board, inside the Season section host', JSON.stringify(season));
ok(season.z1 <= 1 && season.navs <= 1, 'no zone id or zone nav is duplicated across the mounted tabs', JSON.stringify(season));

// SeasonOffense passes OffenseTab a plain shim object, not ReportsScreen, so
// every method the tab calls has to exist on it. A season with no offensive
// snaps renders the tab's empty state there, whose command is one such call.
await load({ plays: [{ unit: 'defense', defFront: '4-3', coverage: 'Cover 3' }], tab: 'season' });
await page.evaluate(() => [...document.querySelectorAll('.gi-season-nav .gi-subtab')]
  .find(b => b.textContent.trim() === 'Offense')?.click());
await sleep(700);
const seasonCta = await page.evaluate(async () => {
  if (window.app.reportsScreen.activeTab !== 'season') return { onSeason: false };
  const cta = document.querySelector('.gi-season-sections .gi-reports-empty-cta');
  if (!cta) return { onSeason: true, cta: false, threw: null, route: null };
  let threw = null;
  try { cta.click(); } catch (e) { threw = e.message; }
  await new Promise(r => setTimeout(r, 600));
  return { onSeason: true, cta: true, threw, route: window.app.workspace.currentRoute?.() || null };
});
ok(seasonCta.onSeason && seasonCta.cta && !seasonCta.threw && String(seasonCta.route || '').includes('breakdown'),
  'the empty-state command works in the Season copy of the tab, whose screen is a shim rather than ReportsScreen',
  JSON.stringify(seasonCta));

console.log('\n== 16. No page-level horizontal overflow at the release widths ==');
const widths = [];
for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 720]]) {
  await page.setViewport({ width: w, height: h });
  await sleep(350);
  // The preceding block's empty-state command navigates to Break Down, so
  // Reports must be reopened with real data. Measuring a hidden route passes
  // both assertions for free: nothing is laid out, so page overflow is 0 and
  // a band's child count is whatever the markup says regardless of geometry.
  await load({ plays: FULL, tab: 'offense' });
  widths.push(await page.evaluate(v => {
    const board = document.querySelector('.gi-offense-board');
    const rect = board?.getBoundingClientRect();
    const bands = [...document.querySelectorAll('.gi-offense-board .gi-overview-band-3')];
    return { w: v,
      route: window.app.workspace.currentRoute?.() || null,
      tab: window.app.reportsScreen.activeTab,
      visible: !!board && !!rect.width && !!rect.height && getComputedStyle(board).visibility !== 'hidden',
      boardWidth: Math.round(rect?.width || 0),
      pageX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      // Count the tracks the grid actually resolved, not the children the
      // markup declares: a three-child band collapsed to one column by a
      // media query still has three children.
      bandTracks: bands.map(b => getComputedStyle(b).gridTemplateColumns.trim().split(/\s+/).length),
    };
  }, w));
}
ok(widths.every(r => r.route === 'reports' && r.tab === 'offense' && r.visible && r.boardWidth > 600),
  'each width is measured on a visible, populated Offense board rather than a hidden route',
  JSON.stringify(widths.map(r => ({ w: r.w, route: r.route, tab: r.tab, visible: r.visible, boardWidth: r.boardWidth }))));
ok(widths.every(r => r.pageX === 0), 'no page-level horizontal overflow at 1920, 1440 or 1280',
  JSON.stringify(widths.map(r => ({ w: r.w, pageX: r.pageX }))));
ok(widths.every(r => r.bandTracks.length > 0 && r.bandTracks.every(n => n === 3)),
  'the three-column structure bands resolve to three real grid tracks at every release width',
  JSON.stringify(widths.map(r => ({ w: r.w, tracks: r.bandTracks }))));

console.log('\n== 17. Nothing on the board renders below the type floor ==');
await load({ plays: FULL });
const floor = await page.evaluate(() => {
  const all = [...document.querySelectorAll('.gi-offense-board *')]
    .filter(el => el.childElementCount === 0 && (el.textContent || '').trim())
    .map(el => ({ tag: el.tagName, text: el.textContent.trim().slice(0, 12),
      size: parseFloat(getComputedStyle(el).fontSize) }));
  /* Zone 5's chart labels. Previously read from `.viz-svg`, which belonged to
     `NativeOffenseVisualizations` — a module the approved comp does not carry
     (RATIONALE §2 row 24 maps those bodies INTO the shape panels) and whose
     own "By Quarter" block restated Zone 4's By quarter module. It is gone, so
     the labels are measured on the charts the composition actually renders:
     the Field heat map and the four shape panels. */
  const charts = [...document.querySelectorAll('.gi-offense-board svg text')]
    .map(el => ({ text: el.textContent.trim(), size: parseFloat(getComputedStyle(el).fontSize) }));
  const fieldCells = [...document.querySelectorAll('.gi-off-field-cell')]
    .map(el => ({ text: el.textContent.trim(), size: parseFloat(getComputedStyle(el).fontSize) }));
  return { tiny: all.filter(o => o.size && o.size < 9.5), charts, fieldCells, total: all.length };
});
// The charts have to be on screen before their labels can be judged. Asserting
// only "nothing is under the floor" passes just as happily when nothing
// rendered at all, which is exactly what happened while the fixture carried no
// field position.
ok(floor.charts.length >= 4 && floor.fieldCells.length === 10,
  'Zone 5 renders the four approved shape charts and the compact ten-cell field summary',
  JSON.stringify({ chartLabels: floor.charts.length, fieldCells: floor.fieldCells.length, boardText: floor.total }));
ok(floor.charts.length >= 4 && floor.charts.every(o => o.size >= 9.5),
  'every Zone 5 chart label clears the 9.5px floor',
  JSON.stringify(floor.charts.filter(o => o.size < 9.5)));
ok(floor.tiny.length === 0,
  'no text anywhere on the Offense board renders below the 9.5px floor',
  JSON.stringify(floor.tiny.slice(0, 6)));

/* ══ 18. The composition is a SCHEMA, identical under every data volume ════
   The defect this pins: modules used to be conditional. `Play calls`,
   `Concepts` and `Calls by situation` vanished when no snap carried a
   resolvable call; the two Zone 5 shape bands used `.filter(Boolean)` and
   could render one module or none; `Team profile` and `Expected points added`
   returned null. A game with sparse charting therefore rendered a DIFFERENT
   BOARD from a fully charted one, which is exactly what the static rule
   forbids. Every module now holds its slot and states the absence. */
console.log('\n== 18. The approved schema holds under every data volume ==');

await load({ plays: FULL });
const populated = await readBoard();
ok(populated.board, 'the Offense board renders before any schema measurement');
ok(eqArr(populated.titles, SCHEMA_MODULES),
  `the board renders the approved ${SCHEMA_MODULES.length} modules in the approved order`,
  JSON.stringify(populated.titles));
ok(populated.zones === 6, 'six zone rules', String(populated.zones));

/* SPARSE — countable offensive snaps carrying the bare minimum and nothing
   else: no play call, no concept, no personnel, alignment, motion or hash. The
   snaps must still COUNT (a play type or run/pass is what admits them), or this
   is the empty state rather than a sparse one — the distinction the first
   version of this fixture missed. Every module must still be there. */
await load({ plays: Array.from({ length: 4 }, () => ({
  playCall: '', playConcept: '', formation: '', personnel: '', backfield: '',
  motion: '', strength: '', hash: '', fieldSide: '', yardLine: '',
  playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '3',
})) });
const sparse = await readBoard();
ok(eqArr(sparse.titles, SCHEMA_MODULES),
  'a sparse game renders the same modules, in the same order',
  JSON.stringify(sparse.titles));
ok(sparse.absent.length > 0 && sparse.absent.every(t => SCHEMA_MODULES.includes(t)),
  `unfilled slots carry the approved absence treatment ("${ABSENCE}")`,
  JSON.stringify(sparse.absent));

/* OVER-CAP — far more distinct values than any module may show. Deterministic
   ranking and truncation: no module may exceed its approved allocation. */
const OVER = Array.from({ length: 90 }, (_, i) => ({
  playCall: `Call ${String(i % 30).padStart(2, '0')}`,
  playConcept: `Concept ${i % 14}`,
  formation: `Form ${i % 12}`,
  personnel: `${10 + (i % 11)}`,
  backfield: `Back ${i % 9}`,
  motion: `Motion ${i % 7}`,
  playType: ['Run Inside', 'Run Outside', 'Short Pass', 'Deep Pass', 'RPO', 'Medium Pass', 'Screen'][i % 7],
  runPass: i % 2 ? 'Pass' : 'Run',
  down: String((i % 4) + 1), distance: String(1 + (i % 15)), quarter: 'Q' + ((i % 4) + 1),
  yardage: String((i % 23) - 4), result: i % 5 === 0 ? 'Touchdown' : 'Gain',
  hash: ['Left', 'Middle', 'Right'][i % 3], strength: ['Left', 'Right', 'Balanced'][i % 3],
  fieldSide: i % 2 ? 'Own' : 'Opp', yardLine: String(5 + (i % 90)),
}));
await load({ plays: OVER });
const over = await readBoard();
ok(eqArr(over.titles, SCHEMA_MODULES),
  'an over-cap game renders the same modules, in the same order',
  JSON.stringify(over.titles));
/* EXACT, not `<= cap`. Asserting a ceiling certified a maximum and called it a
   schema: it passed while every module was still content-sized. A declared
   allocation is the number of rows the module renders, on every cohort. */
const wrongRows = Object.entries(SCHEMA_ROWS)
  .filter(([name, exact]) => (over.rows[name] ?? -1) !== exact)
  .map(([name, exact]) => `${name}: ${over.rows[name]} != ${exact}`);
ok(wrongRows.length === 0,
  'every module renders EXACTLY its approved row allocation on an over-cap cohort',
  JSON.stringify(wrongRows));
/* The truncation must actually BITE — a fixture that never exceeds a limit
   proves nothing about capping, only about padding. */
const truncated = Object.entries(SCHEMA_ROWS)
  .filter(([n, c]) => (over.rowsBefore?.[n] ?? Infinity) > c).map(([n]) => n);
ok(over.rows.Formation === SCHEMA_ROWS.Formation && over.rows['Play calls'] === SCHEMA_ROWS['Play calls'],
  'the over-cap fixture supplies more rows than the modules may show, so truncation is exercised',
  JSON.stringify({ rows: over.rows, truncated }));
/* Deterministic: the same cohort ranks and truncates to the same rows twice. */
await load({ plays: OVER });
const again = await readBoard();
ok(JSON.stringify(again.rows) === JSON.stringify(over.rows),
  'ranking and truncation are deterministic across renders of one cohort',
  JSON.stringify({ first: over.rows, second: again.rows }));

/* A ranked list states its limit honestly. `Core tendencies · Big N` prints N
   from the rows it RENDERS, not from the wider eligible set. */
const bigTitle = over.rawTitles.find(t => /^Core tendencies/.test(t)) || '';
const bigN = Number((bigTitle.match(/Big\s*(\d+)/) || [])[1]);
ok(bigN === over.rows['Core tendencies'],
  'the "Big N" title states the number of rows actually shown',
  JSON.stringify({ title: bigTitle, rendered: over.rows['Core tendencies'] }));

/* EMPTY — no offensive snaps at all. The approved empty state replaces the
   board with a compact panel; it does not render 27 hollow modules. */
await load({ plays: [{ unit: 'defense' }] });
const emptyBoard = await page.evaluate(() => {
  const board = document.querySelector('.gi-offense-board');
  const txt = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const panel = document.querySelector('[data-pane="offense"]') || document.body;
  return { board: !!board, text: txt(panel).slice(0, 200) };
});
ok(!emptyBoard.board && /No offensive snaps charted/.test(emptyBoard.text),
  'an empty game renders the approved compact empty state, not a hollow board',
  JSON.stringify(emptyBoard));

/* No unapproved prose anywhere on the board. The comp's copy is literal; the
   only sentence it permits is the absence line and the empty state's own. */
await load({ plays: FULL });
const prose = await page.evaluate(() => {
  const board = document.querySelector('.gi-offense-board');
  const banned = ['what this means', 'how to read', 'this shows', 'these numbers',
    'you should', 'we recommend', 'consider ', 'try ', 'chart more plays', 'to populate'];
  const text = (board?.innerText || '').toLowerCase();
  return banned.filter(b => text.includes(b));
});
ok(prose.length === 0, 'no instructional or interpretive prose renders on the Offense board',
  JSON.stringify(prose));

ok(errors.length === 0, 'the Offense route raises no page or console errors', errors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);
