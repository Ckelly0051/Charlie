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
    down: String((i % 3) + 1), distance: '10', quarter: 'Q' + ((i % 4) + 1) };
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
for (const tab of ['overview', 'offense', 'defense', 'special']) {
  await page.evaluate(t => window.app.reportsScreen.selectTab(t), tab);
  await sleep(450);
  chrome[tab] = await page.evaluate(() => ({
    bug: document.querySelector('[data-reports-scorebug]')?.hidden !== true,
    rail: document.querySelector('[data-reports-rail]')?.hidden !== true,
  }));
}
ok(chrome.overview.bug && !chrome.overview.rail, 'Overview shows the scorebug and hides the rail', JSON.stringify(chrome.overview));
ok(chrome.offense.bug && !chrome.offense.rail, 'Offense shows the scorebug and hides the rail', JSON.stringify(chrome.offense));
ok(!chrome.defense.bug && chrome.defense.rail, 'Defense keeps the existing rail until its own design pass', JSON.stringify(chrome.defense));
ok(Object.values(chrome).every(c => !(c.bug && c.rail)),
  'no tab ever shows the scorebug and the generic rail at the same time', JSON.stringify(chrome));

console.log('\n== 10. Score position is independent of team-name length ==');
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
      scores: [...bug.querySelectorAll('.gi-scorebug-team > strong')].map(x),
      line: x(bug.querySelector('.gi-scorebug-line')),
      names: [...bug.querySelectorAll('.gi-scorebug-team > span')].map(s => ({
        clipped: s.scrollWidth > s.clientWidth + 1, titled: !!s.title })),
    };
  }));
}
const [a, b, c3] = geometry;
ok(JSON.stringify(a.scores) === JSON.stringify(b.scores) && JSON.stringify(b.scores) === JSON.stringify(c3.scores),
  'both score cells hold identical x positions across short, long, and 1/2/3-digit combinations',
  JSON.stringify(geometry.map(g => g.scores)));
ok(a.line === b.line && b.line === c3.line,
  'the quarter line does not move when a team name or a score grows',
  JSON.stringify(geometry.map(g => g.line)));
ok(c3.names.every(n => !n.clipped || n.titled),
  'a name too long for its own track truncates with its full value in a tooltip',
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

console.log('\n== 14. Column labels use the design-system label token and clear 4.5:1 ==');
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
  return { th: probe('.gi-offense-board .gi-overview-module th'), meta: probe('.gi-offense-board .gi-overview-module header span') };
});
ok(type.th && type.th.size >= 12 && !/Condensed/i.test(type.th.family),
  'column labels are operational copy in the body face at the label token size, not a condensed display face',
  JSON.stringify(type.th));
ok(type.th && type.th.ratio >= 4.5, 'column labels meet the 4.5:1 small-text minimum', JSON.stringify(type.th));
ok(type.meta && type.meta.ratio >= 4.5, 'module captions meet the 4.5:1 small-text minimum', JSON.stringify(type.meta));

console.log('\n== 15. Season > Offense embeds the same board without duplicate ids ==');
await load({ plays: FULL, tab: 'season' });
// Season carries its own sub-tabs and opens on Overview; the embedded
// OffenseTab only exists once its Offense sub-tab is selected.
await page.evaluate(() => [...document.querySelectorAll('.gi-subnav .gi-subtab')]
  .find(b => b.textContent.trim() === 'Offense')?.click());
await sleep(700);
const season = await page.evaluate(() => ({
  activeTab: window.app.reportsScreen.activeTab,
  stack: document.querySelectorAll('.gi-season-stack').length,
  boards: document.querySelectorAll('.gi-offense-board').length,
  inStack: document.querySelectorAll('.gi-season-stack .gi-offense-board').length,
  z1: document.querySelectorAll('#gi-off-z1').length,
  navs: document.querySelectorAll('.gi-zone-nav').length,
}));
ok(season.activeTab === 'season' && season.stack === 1,
  'the route is still on the Season tab -- a document-wide "Offense" lookup leaves it for the main tab of that name',
  JSON.stringify(season));
ok(season.boards === 1 && season.inStack === 1,
  'the Season tab renders exactly one offense board, inside the Season stack', JSON.stringify(season));
ok(season.z1 <= 1 && season.navs <= 1, 'no zone id or zone nav is duplicated across the mounted tabs', JSON.stringify(season));

// SeasonOffense passes OffenseTab a plain shim object, not ReportsScreen, so
// every method the tab calls has to exist on it. A season with no offensive
// snaps renders the tab's empty state there, whose command is one such call.
await load({ plays: [{ unit: 'defense', defFront: '4-3', coverage: 'Cover 3' }], tab: 'season' });
await page.evaluate(() => [...document.querySelectorAll('.gi-subnav .gi-subtab')]
  .find(b => b.textContent.trim() === 'Offense')?.click());
await sleep(700);
const seasonCta = await page.evaluate(async () => {
  if (window.app.reportsScreen.activeTab !== 'season') return { onSeason: false };
  const cta = document.querySelector('.gi-season-stack .gi-reports-empty-cta');
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
const tiny = await page.evaluate(() => [...document.querySelectorAll('.gi-offense-board *')]
  .filter(el => el.childElementCount === 0 && (el.textContent || '').trim())
  .map(el => ({ tag: el.tagName, text: el.textContent.trim().slice(0, 12),
    size: parseFloat(getComputedStyle(el).fontSize) }))
  .filter(o => o.size && o.size < 9.5));
ok(tiny.length === 0,
  'no text on the Offense board renders below the 9.5px floor, chart axis labels included',
  JSON.stringify(tiny.slice(0, 6)));

ok(errors.length === 0, 'the Offense route raises no page or console errors', errors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);
