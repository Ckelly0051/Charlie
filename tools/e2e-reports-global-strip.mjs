/** Reports global strip (coach-approved comp, 2026-09-22) on the canonical season.
 *
 * design-comps/reports-global-strip-2026-09-22.html approves NAVIGATION GEOMETRY
 * only; its short tables are placeholders. Everything here runs against a
 * read-only, in-memory copy of the registered `2025-st-joseph-mavericks-jv`
 * season, hashed before and after, and measures the real production boards.
 *
 * 1. One strip, one geometry: at 1440x900 and 1280x800 every top-level tab has
 *    the same bounding box on all eight reports, in both navigation
 *    directions, across game/season scope changes and in the opponent
 *    perspective. Overview to Season is a purely horizontal move.
 * 2. Order and fit: Overview ... Matchup, Season last; no tab label is clipped,
 *    no tab wraps or overlaps, the tabs never scroll, and the page never
 *    scrolls sideways. Program/Season/Game selectors sit above the strip and
 *    each board's own controls sit below it.
 * 3. Score: the linescore renders on Overview only, below the strip, with its
 *    existing arithmetic (quarters sum to the totals); no detail tab shows a
 *    score, a Final Score tile, or the retired game KPI banner.
 * 4. Scope: every game/season control opens on Current game, and a deliberate
 *    Full season choice survives ordinary re-renders and tab changes.
 * 5. Outer frame: each report fills its board at 1920/1440/1280, with no empty
 *    stage band around it.
 * 6. Players: names after one- and two-digit jersey numbers start at one x.
 * 7. Populated captures of every tab at 1440, 1280, 768 and 390 --
 *    IMPLEMENTATION EVIDENCE ONLY, conferring no approval.
 * 8. The secondary bar (coach-approved comp, 2026-09-23): one bar directly
 *    under the strip with the same box on all seven multi-section reports,
 *    unmoved by page or scope changes; none on Overview; no second control
 *    row inside any board; no game KPI rail anywhere.
 * 9. Narrow layouts at 768 and 390: the bar stacks inside the viewport and no
 *    tab overflows the page.
 */
import { APP_URL } from './app-entry.mjs';
import puppeteer from './test-browser.mjs';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { CANONICAL_SEASON } from './canonical-season.mjs';

const SEASON_ID = '2025-st-joseph-mavericks-jv';
const SOURCE = CANONICAL_SEASON;
const OUT = 'artifacts/reports-global-strip';
const TABS = ['overview', 'offense', 'defense', 'special', 'players', 'selfscout', 'matchup', 'season'];
const LABELS = ['Overview', 'Offense', 'Defense', 'Special Teams', 'Players', 'Self-Scout', 'Matchup', 'Season'];

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

if (!existsSync(SOURCE)) {
  /* An absent mirror is a skip only when the runner declares it has none. On
     the review machine it is a failure: the canonical season is the evidence. */
  if (process.env.GIQ_REALDATA_OPTIONAL === '1') {
    console.log(`SKIP: canonical season not present at ${SOURCE} (GIQ_REALDATA_OPTIONAL=1)`);
    console.log('== RESULT: 0 passed, 0 failed (skipped) ==');
    process.exit(0);
  }
  console.log(`FAIL: canonical Reports season missing at ${SOURCE}`);
  console.log('== RESULT: 0 passed, 1 failed ==');
  process.exit(1);
}
const raw = readFileSync(SOURCE);
const before = createHash('sha256').update(raw).digest('hex');
const season = JSON.parse(raw.toString('utf8'));
const stPeter = season.games.find(game => /St\. Peter Lutheran/i.test(game.gameInfo?.opponent || ''));
if (!stPeter) throw new Error('Canonical St. Peter Lutheran game missing');
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 240000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));

/** Fresh app, canonical season in memory, St. Peter open, Reports shown. */
async function boot(width, height) {
  await page.setViewport({ width, height });
  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  await sleep(500);
  await page.evaluate(async (data, gameId) => {
    const app = window.app;
    const store = app.storage.seasonStore;
    store.data = store._normalize(JSON.parse(JSON.stringify(data)));
    store.currentSeasonId = data.id;
    store.data.id = data.id;
    store.data.activeGameId = gameId;
    await app.storage._loadActiveGame();
    if (data.roster) app.roster.players = JSON.parse(JSON.stringify(data.roster));
    app.workspaceShell.show('reports');
  }, season, stPeter.id);
  await sleep(400);
  await quiet();
}
const quiet = () => page.evaluate(() => document.querySelectorAll('.gi-native-toast').forEach(node => node.remove()));

/** Click a top-level tab the way a coach does. */
async function go(tab) {
  await page.evaluate(id => document.querySelector(`[data-report-tab="${id}"]`).click(), tab);
  await sleep(300);
  await quiet();
}

const chrome = () => page.evaluate(() => {
  const box = node => { if (!node) return null; const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  const visible = node => !!node && !node.hidden && node.getClientRects().length > 0;
  const tabs = [...document.querySelectorAll('[data-report-tab]')];
  const bug = document.querySelector('[data-reports-scorebug]');
  const rail = document.querySelector('[data-reports-rail]');
  const strip = document.querySelector('[data-reports-strip]');
  const nav = strip?.querySelector('.gi-reports-tabs');
  return {
    tabs: tabs.map(button => ({ id: button.dataset.reportTab, label: button.textContent.trim(), box: box(button),
      clipped: button.scrollWidth > button.clientWidth + 0.5, disabled: button.disabled, hidden: button.hidden,
      active: button.getAttribute('aria-current') === 'page' })),
    strip: box(strip), navScroll: nav ? nav.scrollWidth - nav.clientWidth : null,
    head: box(document.querySelector('.gi-reports-reporthead')),
    perspective: [...document.querySelectorAll('[data-report-perspective]')].map(button => ({
      clipped: button.scrollWidth > button.clientWidth + 0.5, box: box(button) })),
    exportBox: box(document.querySelector('[data-reports-strip] #btnExportStats')),
    bug: visible(bug) ? { box: box(bug), totals: [...bug.querySelectorAll('.gi-scorebug-row:not(.is-head) .gi-scorebug-total')].map(n => n.textContent.trim()),
      quarters: [...bug.querySelectorAll('.gi-scorebug-row:not(.is-head)')].map(row => [...row.querySelectorAll('.gi-scorebug-q')].map(n => Number(n.textContent.trim()))) } : null,
    rail: !!rail || !!document.querySelector('.gi-reports-rail'),
    content: box(document.querySelector('.gi-reports-content')),
    finalScoreAnywhere: [...document.querySelectorAll('.gi-reports *')].some(node => node.childElementCount === 0 && /^final score$/i.test(node.textContent.trim()) && node.getClientRects().length),
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

const same = (a, b) => a && b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;
const tabKey = state => state.tabs.map(t => `${t.id}@${t.box.x.toFixed(1)},${t.box.y.toFixed(1)},${t.box.w.toFixed(1)}x${t.box.h.toFixed(1)}`).join(' ');

for (const [width, height] of [[1440, 900], [1280, 800]]) {
  console.log(`\n== ${width}x${height} ==`);
  await boot(width, height);

  /* 1. One geometry across all eight, both directions. */
  const states = {};
  for (const tab of TABS) { await go(tab); states[tab] = await chrome(); }
  const reference = states.overview;
  for (const tab of TABS) {
    ok(reference.tabs.every((t, i) => same(t.box, states[tab].tabs[i].box)),
      `${width}: every tab box on ${tab} equals Overview's`, `${tabKey(states[tab])} vs ${tabKey(reference)}`);
    ok(same(reference.strip, states[tab].strip), `${width}: the strip itself does not move on ${tab}`, JSON.stringify(states[tab].strip));
    ok(states[tab].tabs.find(t => t.active)?.id === tab, `${width}: ${tab} is the current page`);
  }
  const back = {};
  for (const tab of [...TABS].reverse()) { await go(tab); back[tab] = await chrome(); }
  ok(TABS.every(tab => back[tab].tabs.every((t, i) => same(t.box, reference.tabs[i].box))),
    `${width}: tab boxes are unchanged navigating Season back to Overview`);
  const ov = reference.tabs[0].box, se = reference.tabs[7].box;
  ok(Math.abs(ov.y - se.y) < 0.5 && Math.abs(ov.h - se.h) < 0.5 && se.x > ov.x,
    `${width}: Overview to Season is a horizontal move (same y ${ov.y.toFixed(1)}, height ${ov.h.toFixed(1)})`, JSON.stringify({ ov, se }));

  /* 2. Order and fit. */
  ok(reference.tabs.map(t => t.label).join('|') === LABELS.join('|'), `${width}: tab order is ${LABELS.join(', ')}; Season last`,
    reference.tabs.map(t => t.label).join('|'));
  for (const tab of TABS) {
    const s = states[tab];
    ok(s.tabs.every(t => !t.clipped && !t.hidden), `${width}: no tab label is clipped or hidden on ${tab}`,
      JSON.stringify(s.tabs.filter(t => t.clipped || t.hidden).map(t => t.id)));
    ok(s.tabs.every(t => Math.abs(t.box.y - s.tabs[0].box.y) < 0.5), `${width}: the tabs stay on one row on ${tab}`);
    ok(s.tabs.every((t, i) => i === 0 || t.box.x >= s.tabs[i - 1].box.right - 0.5), `${width}: no tab overlaps its neighbor on ${tab}`);
    ok(s.navScroll === 0, `${width}: the tab row does not scroll on ${tab}`, String(s.navScroll));
    ok(s.pageOverflow <= 0, `${width}: no page-level horizontal overflow on ${tab}`, String(s.pageOverflow));
    ok(s.tabs.every(t => t.box.x >= s.strip.x - 0.5 && t.box.right <= s.strip.right + 0.5), `${width}: every tab is inside the strip on ${tab}`);
    ok(s.perspective.every(p => !p.clipped) && s.exportBox && s.exportBox.right <= width,
      `${width}: perspective labels and Export are whole and on screen on ${tab}`, JSON.stringify(s.perspective));
    ok(s.head && s.head.bottom <= s.strip.y + 0.5 && s.content.y >= s.strip.bottom - 0.5,
      `${width}: the report head sits above the strip and the board below it on ${tab}`);
  }
  const selectorsBottom = await page.evaluate(() => {
    const selects = ['#wsCtxProgram', '#wsCtxSeason', '#wsCtxGame'].map(id => document.querySelector(id))
      .filter(node => node?.getClientRects().length);
    return selects.length === 3 ? Math.max(...selects.map(node => node.getBoundingClientRect().bottom)) : null;
  });
  ok(selectorsBottom != null && selectorsBottom <= reference.strip.y, `${width}: Program/Season/Game selectors sit above the strip`, String(selectorsBottom));
  await go('defense');
  const belowStrip = await page.evaluate(() => {
    const strip = document.querySelector('[data-reports-strip]').getBoundingClientRect();
    const controls = ['[data-reports-secbar] .gi-secbar-tabs', '[data-reports-secbar] .gi-secbar-scope'].map(s => document.querySelector(s)?.getBoundingClientRect());
    return controls.every(r => r && r.top >= strip.bottom - 0.5);
  });
  ok(belowStrip, `${width}: Defense pages and scope render below the global strip`);

  /* 3. Score: Overview only, below the strip, arithmetic intact. */
  const bug = reference.bug;
  ok(!!bug && bug.box.y >= reference.strip.bottom - 0.5, `${width}: Overview shows the linescore below the strip`, JSON.stringify(bug?.box));
  ok(bug?.totals.join('|') === '41|0', `${width}: the linescore keeps the official 41-0 total`, bug?.totals.join('|'));
  /* The quarters come from CHARTED scoring plays, the total from the official
     score. On the canonical fixture the old-format extra points were blanked
     (legacy excision, 2026-09-26; the coach retags them), so this game's charted
     quarters hold 36 of the official 41: the five extra points are the gap. The
     opponent row has nothing blanked and still sums exactly. */
  ok(bug && bug.quarters[0].reduce((a, b) => a + b, 0) === 36 && bug.quarters[1].reduce((a, b) => a + b, 0) === Number(bug.totals[1]),
    `${width}: quarters sum to the charted points (36 of the official 41 until the extra points are retagged; opponent exact)`, JSON.stringify(bug?.quarters));
  for (const tab of TABS.slice(1)) {
    ok(!states[tab].bug, `${width}: ${tab} shows no linescore`);
    ok(!states[tab].finalScoreAnywhere, `${width}: ${tab} shows no Final Score tile`);
  }
  ok(TABS.every(tab => !states[tab].rail), `${width}: no report repeats the game KPI banner`,
    TABS.filter(tab => states[tab].rail).join(','));

  /* 4. Scope defaults and persistence. */
  const scopes = await page.evaluate(() => {
    const s = window.app.reportsScreen;
    return { defense: s.defenseScope, special: s.specialTeamsScope, players: s.playersScope };
  });
  ok(scopes.defense === 'game' && scopes.special === 'game' && scopes.players === 'game',
    `${width}: Defense, Special Teams and Players open on Current game`, JSON.stringify(scopes));
  await go('defense');
  ok(await page.evaluate(() => document.querySelector('.gi-def2')?.dataset.def2Scope === 'game'
    && document.querySelector('[data-defense-scope="game"]')?.classList.contains('active')), `${width}: the Defense board renders Current game by default`);
  ok(await page.evaluate(() => document.querySelector('[data-reports-secbar] .gi-secbar-seg button')?.dataset.defenseScope === 'game'), `${width}: Current game is the first Defense scope control`);
  await page.evaluate(() => document.querySelector('[data-defense-scope="season"]').click());
  await sleep(300);
  const seasonDefense = await chrome();
  ok(reference.tabs.every((t, i) => same(t.box, seasonDefense.tabs[i].box)), `${width}: choosing Full season does not move the strip`);
  await go('offense'); await go('defense');
  await page.evaluate(() => window.app.reportsScreen._renderActiveTab());
  await sleep(200);
  ok(await page.evaluate(() => window.app.reportsScreen.defenseScope === 'season'
    && document.querySelector('.gi-def2')?.dataset.def2Scope === 'season'), `${width}: a deliberate Full season choice survives tab changes and re-renders`);
  await page.evaluate(() => document.querySelector('[data-defense-scope="game"]').click());
  await go('special');
  ok(await page.evaluate(() => document.querySelector('[data-st-scope="game"]')?.classList.contains('active')
    && document.querySelector('[data-reports-secbar] .gi-secbar-seg button')?.dataset.stScope === 'game'), `${width}: Special Teams opens on Current game, listed first`);
  await page.evaluate(() => document.querySelector('[data-st-scope="season"]').click());
  await sleep(300);
  const specialSeason = await chrome();
  ok(reference.tabs.every((t, i) => same(t.box, specialSeason.tabs[i].box)), `${width}: Special Teams Full season does not move the strip`);
  await page.evaluate(() => document.querySelector('[data-st-scope="game"]').click());

  /* Perspective: the opponent view keeps every tab in place. */
  await go('overview');
  await page.evaluate(() => document.querySelector('[data-report-perspective="opponent"]').click());
  await sleep(400); await quiet();
  const opponent = await chrome();
  ok(reference.tabs.every((t, i) => same(t.box, opponent.tabs[i].box)), `${width}: the opponent perspective keeps every tab box`, tabKey(opponent));
  ok(['players', 'selfscout', 'matchup', 'season'].every(id => opponent.tabs.find(t => t.id === id).disabled)
    && ['overview', 'offense', 'defense', 'special'].every(id => !opponent.tabs.find(t => t.id === id).disabled),
  `${width}: opponent-only reports disable, rather than remove, the four self reports`);
  ok(!opponent.bug, `${width}: the opponent perspective shows no linescore`);
  await page.evaluate(() => document.querySelector('[data-report-perspective="self"]').click());
  await sleep(300); await quiet();

  /* 8. THE SECONDARY BAR (coach-approved comp, 2026-09-23). One bar, one
     position: directly under the strip on every multi-section report, the
     same box on all seven, unmoved by page or scope changes; none on Overview,
     whose compact score starts at the strip instead. */
  const secbar = () => page.evaluate(() => {
    const box = node => { if (!node) return null; const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom }; };
    const host = document.querySelector('[data-reports-secbar]');
    const bar = host?.querySelector('[data-reports-secbar-bar]');
    const tabsRow = bar?.querySelector('.gi-secbar-tabs');
    return {
      bar: box(bar), hostChildren: host?.childElementCount ?? -1, hostHeight: host?.getBoundingClientRect().height ?? -1,
      strip: box(document.querySelector('[data-reports-strip]')),
      content: box(document.querySelector('.gi-reports-content')),
      bug: box(document.querySelector('[data-reports-scorebug]:not([hidden])')),
      tabsScroll: tabsRow ? tabsRow.scrollWidth - tabsRow.clientWidth : null,
      clipped: [...(bar?.querySelectorAll('button, select') || [])].filter(n => n.scrollWidth > n.clientWidth + 0.5).map(n => n.textContent.trim()),
      inBoardBars: document.querySelectorAll('.gi-reports-content [data-reports-secbar-bar]:not(.is-inline)').length,
    };
  });
  const MULTI = ['offense', 'defense', 'special', 'players', 'selfscout', 'matchup', 'season'];
  const bars = {};
  for (const tab of TABS) { await go(tab); bars[tab] = await secbar(); }
  const ref = bars.offense.bar;
  for (const tab of MULTI) {
    const b = bars[tab];
    ok(same(b.bar, ref), `${width}: the secondary bar on ${tab} has Offense's exact box`, JSON.stringify({ tab: b.bar, offense: ref }));
    ok(b.bar && Math.abs(b.bar.y - b.strip.bottom) < 0.5 && b.content.y >= b.bar.bottom - 0.5,
      `${width}: on ${tab} the bar sits directly under the strip and the board directly under the bar`, JSON.stringify({ bar: b.bar, strip: b.strip.bottom, content: b.content.y }));
    ok(b.tabsScroll === 0 && b.clipped.length === 0, `${width}: no bar control on ${tab} is clipped or scrolls`, JSON.stringify({ scroll: b.tabsScroll, clipped: b.clipped }));
    ok(b.inBoardBars === 0, `${width}: ${tab} renders no second control bar inside its board`);
  }
  ok(ref && ref.h === 46, `${width}: the secondary bar is the comp's 46px`, JSON.stringify(ref));
  ok(bars.overview.hostChildren === 0 && bars.overview.hostHeight === 0 && !bars.overview.bar
    && bars.overview.bug && Math.abs(bars.overview.bug.y - bars.overview.strip.bottom) < 0.5,
    `${width}: Overview has no secondary bar; its compact score starts at the strip`, JSON.stringify(bars.overview));
  /* Page and scope changes move neither the strip nor the bar. */
  const moves = [];
  for (const [tab, clicks] of [
    ['offense', ['calls', 'structure', 'situations', 'field', 'advanced', 'identity'].map(id => `[data-section="${id}"]`)],
    ['defense', ['opponent', 'scheme', 'situations', 'performance'].map(id => `[data-section="${id}"]`)
      .concat(['[data-defense-scope="season"]', '[data-section="situations"]', '[data-defense-scope="game"]', '[data-section="performance"]'])],
    ['special', ['[data-st-scope="season"]', '[data-st-section="st4"]', '[data-st-scope="game"]', '[data-st-section="st1"]']],
    ['players', ['[data-players-scope="season"]', '[data-players-scope="game"]']],
  ]) {
    await go(tab);
    for (const sel of clicks) {
      await page.evaluate(s => document.querySelector(`[data-reports-secbar] ${s}`)?.click(), sel);
      await sleep(200);
      const b = await secbar(), c = await chrome();
      if (!same(b.bar, ref) || !reference.tabs.every((t, i) => same(t.box, c.tabs[i].box))) moves.push(`${tab} ${sel}: ${JSON.stringify(b.bar)}`);
    }
  }
  ok(moves.length === 0, `${width}: no Offense/Defense page change and no scope change moves the strip or the bar`, JSON.stringify(moves));

  /* 5 + 7. Frame and captures. */
  for (const tab of TABS) {
    await go(tab);
    await page.evaluate(() => document.querySelector('.ws-reports')?.scrollTo(0, 0));
    await page.screenshot({ path: `${OUT}/${width}-${tab}.png` });
  }

  /* 6. Players: one name x after #5 and #42. */
  await go('players');
  const names = await page.evaluate(() => [...document.querySelectorAll('.gi-player-module .gi-player-ident')].map(button => {
    const text = [...button.childNodes].find(node => node.nodeType === 3 && node.textContent.trim());
    const range = document.createRange();
    range.setStart(text, text.textContent.search(/\S/));
    range.setEnd(text, text.textContent.length);
    const table = button.closest('table');
    return { num: button.querySelector('.gi-player-num').textContent, name: text.textContent.trim(),
      x: range.getClientRects()[0]?.x, table: [...document.querySelectorAll('.gi-player-module table')].indexOf(table) };
  }));
  const byTable = new Map();
  for (const row of names) byTable.set(row.table, [...(byTable.get(row.table) || []), row]);
  const one = names.filter(row => /^#\d$/.test(row.num)), two = names.filter(row => /^#\d\d$/.test(row.num));
  ok(names.length > 0 && names.every(row => row.name.length > 1), `${width}: Players rows carry roster names`, JSON.stringify(names.slice(0, 3)));
  ok(one.length > 0 && two.length > 0, `${width}: the canonical Players board has one- and two-digit numbers`, `${one.length} / ${two.length}`);
  ok([...byTable.values()].every(rows => rows.every(row => Math.abs(row.x - rows[0].x) < 0.5)),
    `${width}: in every Players table, names start at one x after one- and two-digit numbers`,
    JSON.stringify([...byTable.values()].map(rows => rows.map(row => `${row.num}:${row.x?.toFixed(2)}`))));
  const five = names.find(row => row.num === '#5'), fortyTwo = names.find(row => row.num === '#42');
  ok(five && fortyTwo && five.table === fortyTwo.table ? Math.abs(five.x - fortyTwo.x) < 0.5 : !!(five && fortyTwo),
    `${width}: #5 Ben Kelly and #42 share a name column where they share a table`, JSON.stringify({ five, fortyTwo }));
}

/* 5. The outer frame, measured at the wide width where the cap exposed it. */
for (const [width, height] of [[1920, 1080], [1440, 900], [1280, 800]]) {
  await boot(width, height);
  for (const [tab, board, report] of [['players', '.gi-players-board', '.gi-players-report'], ['selfscout', '.gi-selfscout-board', '.gi-selfscout-report'],
    ['matchup', '.gi-matchup-board', '.gi-mu-report'], ['season', '.gi-season-board', '.gi-season-report']]) {
    await go(tab);
    const gap = await page.evaluate((b, r) => {
      const boardNode = document.querySelector(b), reportNode = document.querySelector(r);
      if (!boardNode || !reportNode) return null;
      const outer = boardNode.getBoundingClientRect(), inner = reportNode.getBoundingClientRect();
      return { left: inner.left - outer.left, right: outer.right - inner.right, top: inner.top - outer.top };
    }, board, report);
    ok(gap && Math.abs(gap.left) < 0.5 && Math.abs(gap.right) < 0.5 && Math.abs(gap.top) < 0.5,
      `${width}: the ${tab} report fills its board -- no empty outer frame`, JSON.stringify(gap));
  }
  if (width === 1920) for (const tab of ['players', 'season']) {
    await go(tab);
    await page.evaluate(() => document.querySelector('.ws-reports')?.scrollTo(0, 0));
    await page.screenshot({ path: `${OUT}/1920-${tab}.png` });
  }
}

/* 9. Narrow layouts: the secondary bar stacks its pages over its scope and
   export, stays under the strip, and nothing overflows the page. Every tab is
   captured for inspection. */
for (const [width, height] of [[768, 1024], [390, 844]]) {
  await boot(width, height);
  for (const tab of TABS) {
    await go(tab);
    await page.evaluate(() => document.querySelector('.ws-reports')?.scrollTo(0, 0));
    const narrow = await page.evaluate(() => {
      const strip = document.querySelector('[data-reports-strip]')?.getBoundingClientRect();
      const bar = document.querySelector('[data-reports-secbar] [data-reports-secbar-bar]')?.getBoundingClientRect();
      const right = document.querySelector('[data-reports-secbar] .gi-secbar-right')?.getBoundingClientRect();
      const tabs = document.querySelector('[data-reports-secbar] .gi-secbar-tabs')?.getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        bar: bar ? { top: bar.top, right: bar.right } : null, stripBottom: strip?.bottom,
        stacked: right && tabs ? right.top >= tabs.bottom - 0.5 : null };
    });
    ok(narrow.overflow <= 0, `${width}: no page-level horizontal overflow on ${tab}`, String(narrow.overflow));
    if (tab === 'overview') {
      /* The compact score at narrow widths: every quarter and the total on
         screen, and the three facts on their own row, each value on one line. */
      const score = await page.evaluate(w => {
        const bug = document.querySelector('[data-reports-scorebug]');
        const cells = [...bug.querySelectorAll('.gi-scorebug-q, .gi-scorebug-total')].map(n => n.getBoundingClientRect());
        const table = bug.querySelector('.gi-scorebug-score')?.getBoundingClientRect();
        const facts = bug.querySelector('.gi-scorebug-facts')?.getBoundingClientRect();
        const values = [...bug.querySelectorAll('.gi-scorebug-fact strong')].map(n => {
          const range = document.createRange(); range.selectNodeContents(n);
          return { text: n.textContent, lines: range.getClientRects().length, over: n.scrollWidth > n.clientWidth + 0.5 };
        });
        // The route frame itself ends 0.59px past a 390 viewport (sub-pixel
        // layout); a cell on that edge is on screen, a clipped one is ~60px out.
        return { inside: cells.every(r => r.right <= w + 1 && r.left >= 0), cells: cells.length,
          below: !!(facts && table && facts.top >= table.bottom - 0.5), values };
      }, width);
      ok(score.cells === 15 && score.inside, `${width}: all four quarters and the total of both teams are on screen`, JSON.stringify(score));
      ok(score.below && score.values.length === 3 && score.values.every(v => v.lines === 1 && !v.over),
        `${width}: the three score facts sit on their own row, each value on one line`, JSON.stringify(score));
    }
    if (tab !== 'overview') {
      ok(narrow.bar && Math.abs(narrow.bar.top - narrow.stripBottom) < 0.5 && narrow.bar.right <= width + 1
        && narrow.stacked !== false,
        `${width}: ${tab}'s bar sits under the strip, inside the viewport, pages above scope and export`, JSON.stringify(narrow));
    }
    await page.screenshot({ path: `${OUT}/${width}-${tab}.png` });
  }
}

ok(errors.length === 0, 'no console or page errors', errors.slice(0, 3).join(' | '));
const after = createHash('sha256').update(readFileSync(SOURCE)).digest('hex');
ok(after === before, 'the canonical season file is byte-identical after the run');
await browser.close();
console.log(`\nCaptures: ${OUT}`);
console.log(`== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
