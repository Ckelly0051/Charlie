// Permanent regression for the deferred Home repair batch:
//   1. Persistent Program Seasons + Opponent Scouts rails
//   2. Chronological (oldest-first) default game order
//   3. The single Game Plan detail action
//   4/5. The approved Home / Team Hub copy
// Exercises the rendered UI and real controller state; never asserts that a
// selector merely exists.
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import { APP_URL } from './app-entry.mjs';
import { setupTeamAndDemo } from './hub-setup.mjs';

let passed = 0, failed = 0;
const ok = (cond, label, evidence) => {
  if (cond) { passed++; console.log('  PASS ', label); }
  else { failed++; console.log('  FAIL ', label, evidence === undefined ? '' : JSON.stringify(evidence)); }
};

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.teamHubScreen);
await setupTeamAndDemo(page, 'St. Joseph Mavericks');
await page.evaluate(() => window.app.workspaceShell.show('home'));
await new Promise(r => setTimeout(r, 300));

// ---------------------------------------------------------------------------
console.log('\n== 1. Persistent Program Seasons + Opponent Scouts rails ==');

// Two program seasons across TWO different years, plus two opponent scouts
// across those same two years -- multi-year support on both trees.
const built = await page.evaluate(async () => {
  const hub = window.app.teamHubScreen;
  await hub.createSeason({ year: '2025', level: 'JV' });
  await hub.createSeason({ year: '2026', level: 'Varsity' });
  await hub.createScout({ opponent: 'Holy Family', year: '2025', level: 'Varsity', sourceTeamA: 'Holy Family', sourceTeamB: 'Central', date: '2025-09-05' });
  // Same opponent, same year, DIFFERENT level -- level is an identity
  // breakpoint, so these two rows must not read identically.
  await hub.createScout({ opponent: 'Holy Family', year: '2025', level: 'JV', sourceTeamA: 'Holy Family', sourceTeamB: 'Central', date: '2025-09-06' });
  await hub.createScout({ opponent: 'Riverside', year: '2026', level: 'Varsity', sourceTeamA: 'Riverside', sourceTeamB: 'Central', date: '2026-09-04' });
  await hub.load();
  const s = hub.snapshot();
  return {
    railTotal: (s.railSeasons || []).length,
    railPrograms: (s.railSeasons || []).filter(x => !x.isScout).length,
    railScouts: (s.railSeasons || []).filter(x => x.isScout).length,
    mainPanel: (s.seasons || []).length,
    mode: s.workspaceMode,
  };
});
ok(built.railPrograms >= 2 && built.railScouts === 3,
  'The rail collection is the COMPLETE team collection, not the main-panel filter', built);
ok(built.mainPanel < built.railTotal,
  'The main-panel collection stays filtered and is a strict subset of the rail collection', built);

const railShape = async () => page.evaluate(() => {
  const sections = [...document.querySelectorAll('.rail-section')];
  return {
    count: sections.length,
    titles: sections.map(s => s.querySelector('.gi-hub-kicker')?.textContent || ''),
    years: sections.map(s => [...s.querySelectorAll('.rail-year-label')].map(y => y.textContent)),
    rows: sections.map(s => [...s.querySelectorAll('.rail-row')].map(b => b.textContent.replace(/\s+/g, ' ').trim())),
    empties: sections.map(s => [...s.querySelectorAll('.rail-empty')].map(p => p.textContent.trim())),
    activeRow: document.querySelector('.rail-row.is-current')?.textContent.replace(/\s+/g, ' ').trim() || '',
    activeCount: document.querySelectorAll('.rail-row.is-current').length,
    workspaceMode: window.app.teamHubScreen.snapshot().workspaceMode,
    openSeasonId: window.app.storage.seasonStore.currentSeasonId,
    openKind: window.app.storage.seasonStore.data?.kind || 'program',
    playCount: (window.app.storage.seasonStore.data?.games || []).reduce((n, g) => n + (g.plays?.length || 0), 0),
    gameCount: (window.app.storage.seasonStore.data?.games || []).length,
  };
});

const bothVisible = (shape, when) => {
  ok(shape.count === 2 && /Program Seasons/.test(shape.titles[0]) && /Opponent Scouts/.test(shape.titles[1]),
    `Both rail sections are present ${when}`, shape);
  ok(shape.rows[0].length >= 2 && shape.rows[1].length === 3,
    `Both rail sections still list their own entries ${when}`, shape);
};

let shape = await railShape();
bothVisible(shape, 'after creating seasons and scouts');
ok(shape.years[0].length >= 2 && shape.years[1].length === 2,
  'Each tree groups independently by year and supports multiple years', shape);
ok(shape.years[0].join() === [...shape.years[0]].sort((a, b) => Number(b) - Number(a)).join()
  && shape.years[1].join() === [...shape.years[1]].sort((a, b) => Number(b) - Number(a)).join(),
  'Each tree orders its years newest first', shape);
ok(shape.empties.flat().length === 0, 'No empty-state text renders while both trees have entries', shape);

// Mode change must not remove either tree.
await page.evaluate(async () => { await window.app.teamHubScreen.selectWorkspace('scout'); });
await new Promise(r => setTimeout(r, 250));
shape = await railShape();
ok(shape.workspaceMode === 'scout', 'Workspace mode really changed to scout', shape);
bothVisible(shape, 'after switching the workspace to Opponent Scout');

await page.evaluate(async () => { await window.app.teamHubScreen.selectWorkspace('program'); });
await new Promise(r => setTimeout(r, 250));
bothVisible(await railShape(), 'after switching the workspace back to Program');

// Scout rows must stay distinguishable. Level is an identity breakpoint: the
// tree already states the year, but two same-year scouts of the SAME opponent
// at different levels are otherwise the same string with the same game count.
const scoutRows = await page.evaluate(() => [...document.querySelectorAll('[data-rail-section="Opponent Scouts"] .rail-row')]
  .map(b => ({ label: b.querySelector('strong')?.textContent || '', id: b.dataset.seasonId })));
const holyFamily = scoutRows.filter(r => /Holy Family/.test(r.label));
ok(holyFamily.length === 2 && holyFamily[0].label !== holyFamily[1].label,
  'Two same-year scouts of one opponent render DISTINCT rows', scoutRows);
ok(holyFamily.some(r => /Varsity/.test(r.label)) && holyFamily.some(r => /JV/.test(r.label)),
  'Scout rows keep the level that distinguishes them', scoutRows);
ok(new Set(scoutRows.map(r => r.label)).size === scoutRows.length,
  'Every scout row label is unique within its tree', scoutRows);

// Cross-section opening drives the REAL rendered rows: click the actual
// `.rail-row` element and wait for the resulting season context, so a
// regression that renders an unclickable or unreachable row is caught here
// rather than passing on a direct controller call.
const clickRailRow = async (seasonId, when) => {
  const sel = `.rail-row[data-season-id="${seasonId}"]`;
  await page.waitForSelector(sel, { visible: true, timeout: 5000 });
  const before = await page.evaluate(s => {
    const row = document.querySelector(s);
    const box = row.getBoundingClientRect();
    return { section: row.closest('.rail-section')?.dataset.railSection || '', width: box.width, height: box.height };
  }, sel);
  ok(before.width > 0 && before.height > 0, `The rail row is a real rendered, clickable target ${when}`, before);
  await page.click(sel);
  await page.waitForFunction(id => window.app.storage.seasonStore.currentSeasonId === id, { timeout: 8000 }, seasonId);
  await new Promise(r => setTimeout(r, 400));
  return before;
};

// Cross-section opening: from a program season, CLICK a SCOUT row.
const scoutId = await page.evaluate(() => window.app.teamHubScreen.snapshot().railSeasons.find(s => s.isScout).id);
const scoutClick = await clickRailRow(scoutId, 'in the Opponent Scouts tree');
ok(scoutClick.section === 'Opponent Scouts', 'That row really lives in the Opponent Scouts tree', scoutClick);
shape = await railShape();
ok(shape.openSeasonId === scoutId && shape.openKind === 'scout',
  'Clicking an Opponent Scout row from the program workspace opens that scout', { shape, scoutId });
bothVisible(shape, 'after opening a scout from the program workspace');
ok(shape.activeCount === 1, 'Exactly one rail row is highlighted as open', shape);

// Cross-section opening the other way: from the open scout, CLICK a PROGRAM season.
const programId = await page.evaluate(() => window.app.teamHubScreen.snapshot().railSeasons.find(s => !s.isScout && !s.isDemo).id);
const programClick = await clickRailRow(programId, 'in the Program Seasons tree');
ok(programClick.section === 'Program Seasons', 'That row really lives in the Program Seasons tree', programClick);
shape = await railShape();
ok(shape.openSeasonId === programId && shape.openKind !== 'scout',
  'Clicking a Program Season row while a scout is open opens that program season', { shape, programId });
bothVisible(shape, 'after opening a program season from an open scout');
ok(shape.activeCount === 1, 'Still exactly one highlighted rail row after the cross-section open', shape);

// Season-scoped actions derive from the OPEN SEASON kind, not the filter.
let tools = await page.evaluate(() => [...document.querySelectorAll('.rail-tools button')].map(b => b.textContent.trim()));
ok(tools.includes('Roster') && tools.some(t => /Edit season details/.test(t)),
  'Program actions are available while a program season is open', tools);
await page.evaluate(async () => { await window.app.teamHubScreen.selectWorkspace('scout'); });
await new Promise(r => setTimeout(r, 250));
tools = await page.evaluate(() => [...document.querySelectorAll('.rail-tools button')].map(b => b.textContent.trim()));
ok(tools.includes('Roster') && tools.some(t => /Edit season details/.test(t)),
  'Program actions REMAIN available when only the main-panel filter changes to scout', tools);
await page.evaluate(async () => { await window.app.teamHubScreen.selectWorkspace('program'); });
await new Promise(r => setTimeout(r, 200));

// Returning Home from another route keeps both trees.
await page.evaluate(async () => { await window.app.workspaceShell.show('reports'); });
await new Promise(r => setTimeout(r, 250));
await page.evaluate(async () => { await window.app.workspaceShell.show('home'); });
await new Promise(r => setTimeout(r, 300));
bothVisible(await railShape(), 'after leaving Home and returning');

// Isolated data after each open.
const isolation = await page.evaluate(async () => {
  const hub = window.app.teamHubScreen, store = window.app.storage.seasonStore;
  const rows = hub.snapshot().railSeasons;
  const out = [];
  for (const row of rows) {
    await hub.openSeason(row.id);
    out.push({ id: row.id, opened: store.currentSeasonId, kind: store.data?.kind || 'program', games: (store.data?.games || []).length });
  }
  return out;
});
ok(isolation.every(x => x.opened === x.id),
  'Every rail row opens its own season, never another one', isolation);
ok(isolation.filter(x => x.kind === 'scout').length === 3,
  'Opened scouts report scout kind; opened program seasons do not', isolation);

// Every fixed rail action must be reachable at every release width WITHOUT
// scrolling the main game grid. The rail is bounded by the route frame, which
// already excludes the shell chrome above it and the fixed bottom navigation
// below it at narrow widths; a viewport-height cap overshoots that frame and
// pushes the last tools and the rail foot off-screen.
await page.evaluate(async () => {
  const hub = window.app.teamHubScreen;
  const program = hub.snapshot().railSeasons.find(s => !s.isScout && !s.isDemo);
  if (program) await hub.openSeason(program.id);
});
await new Promise(r => setTimeout(r, 400));
for (const [label, width, height] of [['1440x900', 1440, 900], ['1280x800', 1280, 800], ['768x900', 768, 900]]) {
  await page.setViewport({ width, height });
  await new Promise(r => setTimeout(r, 350));
  const reach = await page.evaluate(() => {
    const rail = document.querySelector('.rail-year').getBoundingClientRect();
    const nav = document.querySelector('.ws-mobile-nav');
    const navBox = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect() : null;
    const limit = Math.min(innerHeight, navBox ? navBox.top : Infinity);
    const named = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
    const fixed = [...document.querySelectorAll('.rail-tools button'), ...document.querySelectorAll('.rail-foot')];
    return {
      railBottom: Math.round(rail.bottom), railTop: Math.round(rail.top), limit: Math.round(limit),
      tools: fixed.map(named),
      cutOff: fixed.filter(el => el.getBoundingClientRect().bottom > limit + 1).map(named),
      pageOverflowY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    };
  });
  ok(reach.railBottom <= reach.limit + 1,
    `The rail ends inside the route frame at ${label}`, reach);
  ok(reach.tools.length >= 5 && reach.cutOff.length === 0,
    `Every fixed rail action is reachable without scrolling at ${label}`, reach);
  // The grid owning its own scroll is what keeps the rail in place; prove the
  // rail does not move when the coach scrolls the main panel to the bottom.
  const held = await page.evaluate(() => {
    const content = document.querySelector('.home-content');
    const before = document.querySelector('.rail-tools').getBoundingClientRect().top;
    content.scrollTop = content.scrollHeight;
    return { scrolled: content.scrollTop, before: Math.round(before), after: Math.round(document.querySelector('.rail-tools').getBoundingClientRect().top) };
  });
  ok(held.before === held.after,
    `Rail actions stay put while the main game grid scrolls at ${label}`, held);
  await page.evaluate(() => { document.querySelector('.home-content').scrollTop = 0; });
}
await page.setViewport({ width: 1440, height: 900 });
await new Promise(r => setTimeout(r, 300));

// Reload with scout mode persisted -- both trees must come back.
await page.evaluate(() => localStorage.setItem('giq_home_workspace', 'scout'));
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.teamHubScreen);
await page.evaluate(async () => { await window.app.workspaceShell.show('home'); });
await page.waitForFunction(() => document.querySelectorAll('.rail-section').length === 2, { timeout: 15000 }).catch(() => {});
shape = await railShape();
ok(shape.workspaceMode === 'scout', 'Scout workspace mode genuinely persisted across the reload', shape);
bothVisible(shape, 'after a reload with scout mode persisted');
ok(!/No opponents yet/.test(shape.rows.flat().join(' ')),
  'Program seasons are not replaced by an opponent empty state after reload', shape);

// "No opponents yet" appears ONLY inside an empty Opponent Scouts section.
const emptyCase = await page.evaluate(async () => {
  const hub = window.app.teamHubScreen;
  const scouts = hub.snapshot().railSeasons.filter(s => s.isScout);
  const programs = hub.snapshot().railSeasons.filter(s => !s.isScout && !s.isDemo);
  if (programs.length) await hub.openSeason(programs[0].id);
  for (const s of scouts) await hub._storage().deleteSeason(s.id);
  await hub.load();
  await new Promise(r => setTimeout(r, 250));
  const sections = [...document.querySelectorAll('.rail-section')];
  return {
    sections: sections.length,
    programRows: sections[0] ? sections[0].querySelectorAll('.rail-row').length : 0,
    programEmpty: sections[0] ? sections[0].querySelectorAll('.rail-empty').length : 0,
    scoutEmptyText: sections[1]?.querySelector('.rail-empty')?.textContent.trim() || '',
    scoutRows: sections[1] ? sections[1].querySelectorAll('.rail-row').length : 0,
  };
});
ok(emptyCase.sections === 2 && emptyCase.programRows >= 2 && emptyCase.programEmpty === 0,
  'Program Seasons keeps all of its rows when every scout is deleted', emptyCase);
ok(emptyCase.scoutRows === 0 && emptyCase.scoutEmptyText === 'No opponents yet',
  '"No opponents yet" renders only inside the empty Opponent Scouts section', emptyCase);

// Long histories scroll inside the rail; entries are never dropped.
const scrollCase = await page.evaluate(() => {
  const trees = document.querySelector('.rail-trees');
  const cs = getComputedStyle(trees);
  return { overflowY: cs.overflowY, flexGrow: cs.flexGrow, rows: document.querySelectorAll('.rail-row').length };
});
ok(scrollCase.overflowY === 'auto' && scrollCase.flexGrow === '0',
  'The rail trees scroll internally and never stretch to create dead space', scrollCase);

// ---------------------------------------------------------------------------
console.log('\n== 2. Chronological (oldest-first) default game order ==');

const ORDER_FIXTURE = [
  // id,          date,         week      -- deliberately shuffled on input
  ['g-post', '2026-11-14', ''],           // postseason, no week
  ['g-w10', '2026-10-30', '10'],          // Week 10 must follow Week 2
  ['g-undated-b', '', '3'],               // undated, valid week 3
  ['g-w2', '2026-09-11', '2'],
  ['g-dupB', '2026-09-18', '5'],          // duplicate date, higher week
  ['g-scrim', '2026-08-15', ''],          // scrimmage, no week
  ['g-undated-a', '', ''],                // undated, no week
  ['g-dupA', '2026-09-18', '4'],          // duplicate date, lower week
  ['g-w1', '2026-09-04', '1'],
  ['g-pre', '2026-08-22', '0'],           // preseason, week 0 is NOT valid
];

const seedOrder = async () => page.evaluate(async fixture => {
  const app = window.app, store = app.storage.seasonStore;
  const programs = app.teamHubScreen.snapshot().railSeasons.filter(s => !s.isScout && !s.isDemo);
  await app.teamHubScreen.openSeason(programs[0].id);
  store.data.games = fixture.map(([id, date, week]) => ({
    id, name: id, plays: [], nextId: 1,
    gameInfo: { opponent: id, date, week, projectName: id },
  }));
  store.data.activeGameId = fixture[0][0];
  await app.workspaceShell.show('home');
  app.homeScreen._set({ seasonId: '' });        // force a genuine season-change reset
  await app.homeScreen.show('reports');
  return true;
}, ORDER_FIXTURE);
await seedOrder();
await new Promise(r => setTimeout(r, 300));

const rendered = async () => page.evaluate(() => ({
  sort: window.app.homeScreen.snapshot().sort,
  select: document.querySelector('.library-tools select.sort')?.value,
  options: [...document.querySelectorAll('.library-tools select.sort option')].map(o => `${o.value}:${o.textContent}`),
  // Rendered DOM order == the coach's left-to-right, top-to-bottom reading order.
  ids: [...document.querySelectorAll('#wsGameList .ws-game-row')].map(el => el.dataset.gameId),
  stored: (window.app.storage.seasonStore.data.games || []).map(g => g.id),
}));

let order = await rendered();
const EXPECTED_OLDEST = ['g-scrim', 'g-pre', 'g-w1', 'g-w2', 'g-dupA', 'g-dupB', 'g-w10', 'g-post', 'g-undated-b', 'g-undated-a'];
ok(order.sort === 'oldest' && order.select === 'oldest',
  'Default sort is chronological, oldest first', order);
ok(/Oldest first/.test(order.options.find(o => o.startsWith('oldest:')) || ''),
  'The default sort option is labelled "Oldest first"', order.options);
ok(order.options.length === 2 && /Newest first/.test(order.options.find(o => o.startsWith('newest:')) || ''),
  '"Newest first" remains available as an explicit alternate, never the default', order.options);
ok(order.ids.join() === EXPECTED_OLDEST.join(),
  'Cards render earliest game first, through scrimmage/preseason/Weeks 1,2,10/postseason/duplicate dates/undated', order);
ok(order.ids.slice(0, 8).every(id => id !== 'g-undated-a' && id !== 'g-undated-b'),
  'Dated games all precede undated games', order);
ok(order.ids.indexOf('g-dupA') < order.ids.indexOf('g-dupB'),
  'Same-date games break the tie on valid numeric week ascending', order);
ok(order.ids.indexOf('g-w2') < order.ids.indexOf('g-w10'),
  'Week 10 sorts after Week 2 (numeric, never lexical)', order);
ok(order.ids.indexOf('g-scrim') < order.ids.indexOf('g-pre'),
  'A no-week scrimmage and a zero-week preseason game still sort by their real dates', order);
ok(order.ids.indexOf('g-undated-b') < order.ids.indexOf('g-undated-a'),
  'Within undated games, a valid week precedes a missing week', order);
ok(order.stored.join() === ORDER_FIXTURE.map(f => f[0]).join(),
  'The stored games array is never reordered in place', order);

// Newest first is a true reversal of the dated block, undated still last.
await page.evaluate(() => window.app.homeScreen.setSort('newest'));
await new Promise(r => setTimeout(r, 200));
order = await rendered();
// Newest first reverses the DATE order. The same-date tiebreaker is defined
// as valid numeric week ASCENDING in both directions -- it is a tiebreaker,
// not part of the reversal -- so g-dupA (week 4) still precedes g-dupB
// (week 5) here, exactly as under Oldest first.
const EXPECTED_NEWEST = ['g-post', 'g-w10', 'g-dupA', 'g-dupB', 'g-w2', 'g-w1', 'g-pre', 'g-scrim', 'g-undated-b', 'g-undated-a'];
ok(order.ids.join() === EXPECTED_NEWEST.join(),
  'Newest first reverses the dated games while keeping the same-date week tiebreaker ascending', order);
ok(order.ids.indexOf('g-dupA') < order.ids.indexOf('g-dupB'),
  'Same-date week ordering stays ascending under Newest first', order);
ok(order.ids.slice(-2).every(id => id.startsWith('g-undated')),
  'Undated games stay last under Newest first, never jumping to the front', order);

// Search / filter / view preserve the selected relative order.
await page.evaluate(() => window.app.homeScreen.setSort('oldest'));
await page.evaluate(() => window.app.homeScreen.setView('list'));
await new Promise(r => setTimeout(r, 200));
order = await rendered();
ok(order.ids.join() === EXPECTED_OLDEST.join(), 'List view preserves the selected order', order);
await page.evaluate(() => window.app.homeScreen.setView('grid'));
await page.evaluate(() => window.app.homeScreen.setQuery('g-w'));
await new Promise(r => setTimeout(r, 200));
order = await rendered();
ok(order.ids.join() === ['g-w1', 'g-w2', 'g-w10'].join(), 'Search preserves the selected order', order);
await page.evaluate(() => window.app.homeScreen.setQuery(''));
await page.evaluate(() => window.app.homeScreen.setFilter('chart'));
await new Promise(r => setTimeout(r, 200));
order = await rendered();
ok(order.ids.join() === EXPECTED_OLDEST.join(), 'Filters preserve the selected order', order);
await page.evaluate(() => window.app.homeScreen.setFilter('all'));

// An explicitly selected sort survives a route return WITHIN the same season.
await page.evaluate(() => window.app.homeScreen.setSort('newest'));
await page.evaluate(async () => { await window.app.workspaceShell.show('reports'); });
await new Promise(r => setTimeout(r, 200));
await page.evaluate(async () => { await window.app.workspaceShell.show('home'); });
await new Promise(r => setTimeout(r, 250));
order = await rendered();
ok(order.sort === 'newest', 'Returning Home within the same season preserves an explicitly selected sort', order);

// Opening a DIFFERENT season resets to oldest first.
const reset = await page.evaluate(async () => {
  const hub = window.app.teamHubScreen;
  const other = hub.snapshot().railSeasons.find(s => s.id !== window.app.storage.seasonStore.currentSeasonId);
  await hub.openSeason(other.id);
  await new Promise(r => setTimeout(r, 250));
  return window.app.homeScreen.snapshot().sort;
});
ok(reset === 'oldest', 'Opening a different season resets the sort to oldest first', { reset });

// ---------------------------------------------------------------------------
console.log('\n== 3. Game Plan action ==');
await seedOrder();
await new Promise(r => setTimeout(r, 300));
const plan = await page.evaluate(() => {
  const actions = [...document.querySelectorAll('.detail-actions button')];
  const gp = actions.find(b => b.textContent.trim() === 'Game Plan');
  const study = actions.find(b => /Open Study/.test(b.textContent));
  const cs = gp && getComputedStyle(gp), cs2 = study && getComputedStyle(study);
  return {
    labels: actions.map(b => b.textContent.replace(/\s+/g, ' ').trim()),
    legacy: !!document.querySelector('.detail-actions .plan-link'),
    seasonPlansText: actions.some(b => /Season plans/.test(b.textContent)),
    openArrow: actions.some(b => /Open\s*→/.test(b.textContent)),
    match: gp && study ? {
      font: cs.fontSize === cs2.fontSize && cs.fontWeight === cs2.fontWeight && cs.fontFamily === cs2.fontFamily,
      height: Math.abs(gp.getBoundingClientRect().height - study.getBoundingClientRect().height) < 0.5,
      minHeight: cs.minHeight === cs2.minHeight,
      border: cs.borderTopWidth === cs2.borderTopWidth && cs.borderRadius === cs2.borderRadius,
      background: cs.backgroundColor === cs2.backgroundColor,
    } : null,
  };
});
ok(plan.labels.includes('Game Plan') && !plan.seasonPlansText && !plan.openArrow && !plan.legacy,
  '"Game Plan" is the only planning action; the split Season plans / Open -> row is gone', plan);
ok(plan.match && Object.values(plan.match).every(Boolean),
  'Game Plan matches Open Study typography, dimensions, and surface exactly', plan.match);

// Hover / pressed / focus-visible parity with Open Study, and no layout shift.
const stateParity = async label => {
  const sel = `.detail-actions button`;
  const idx = await page.evaluate((s, l) => [...document.querySelectorAll(s)].findIndex(b => new RegExp(l).test(b.textContent)), sel, label);
  const before = await page.evaluate((s, i) => { const b = document.querySelectorAll(s)[i], c = getComputedStyle(b), r = b.getBoundingClientRect(); return { bg: c.backgroundColor, border: c.borderColor, w: r.width, h: r.height }; }, sel, idx);
  await page.evaluate((s, i) => document.querySelectorAll(s)[i].scrollIntoView({ block: 'center' }), sel, idx);
  const box = await page.evaluate((s, i) => { const r = document.querySelectorAll(s)[i].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel, idx);
  await page.mouse.move(box.x, box.y);
  await new Promise(r => setTimeout(r, 80));
  const after = await page.evaluate((s, i) => { const b = document.querySelectorAll(s)[i], c = getComputedStyle(b), r = b.getBoundingClientRect(); return { bg: c.backgroundColor, border: c.borderColor, w: r.width, h: r.height }; }, sel, idx);
  await page.mouse.move(0, 0);
  return { before, after, changed: before.bg !== after.bg || before.border !== after.border, stable: Math.abs(before.w - after.w) < 0.5 && Math.abs(before.h - after.h) < 0.5 };
};
const gpHover = await stateParity('Game Plan');
const studyHover = await stateParity('Open Study');
ok(gpHover.changed && studyHover.changed, 'Game Plan and Open Study both change visibly on hover', { gpHover, studyHover });
ok(gpHover.after.bg === studyHover.after.bg && gpHover.after.border === studyHover.after.border,
  'Their hover treatment is identical', { gpHover, studyHover });
ok(gpHover.stable && studyHover.stable, 'Neither shifts layout on hover', { gpHover, studyHover });

const focusRing = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.detail-actions button')];
  const gp = btns.find(b => b.textContent.trim() === 'Game Plan');
  const study = btns.find(b => /Open Study/.test(b.textContent));
  const read = el => { el.focus(); return getComputedStyle(el).boxShadow; };
  const rest = getComputedStyle(gp).boxShadow;
  return { rest, gp: read(gp), study: read(study) };
});
ok(focusRing.gp !== 'none' && focusRing.gp !== focusRing.rest && focusRing.gp === focusRing.study,
  'Game Plan has a keyboard focus ring identical to Open Study', focusRing);

const planRoute = await page.evaluate(async () => {
  const btn = [...document.querySelectorAll('.detail-actions button')].find(b => b.textContent.trim() === 'Game Plan');
  btn.click();
  await new Promise(r => setTimeout(r, 400));
  return window.app.workspace.currentRoute();
});
ok(planRoute === 'plan', 'Game Plan opens the existing Plan route', { planRoute });
await page.evaluate(async () => { await window.app.workspaceShell.show('home'); });
await new Promise(r => setTimeout(r, 250));

// ---------------------------------------------------------------------------
console.log('\n== 4/5. Approved copy renders; superseded phrases are absent ==');

const SUPERSEDED = [
  'Scout an opponent without touching our season',
  'isolated from our schedule and team totals',
  'our schedule, record, and team totals',
  'Your football workspace',
  'Start with your program, or prepare for an opponent.',
  'Selected for your first season',
  'Go straight to your season',
  'Add film the opponent played against another team',
  'Team & Film Settings and the Season selector both get you there.',
  'Choose what you are preparing for',
  'Choose how much help you want setting up the season',
  'Walk through roster, film storage, and the first game',
  'Create the season and go straight to Home',
  "Correct the year or level. This never changes the season's id",
  'Pick up wherever you need',
  'You can reopen this guide from Team & Film Control Center at any time',
  'never count in your program record or season totals',
  'Film stays in its existing location',
  'Schedule order',
];
// "Our Program" is superseded ONLY in native-team-hub.jsx. The shell's own
// Program/Opponent Scout workspace switch (workspace-shell.js) and the Home
// eyebrow (home-screen.js) were deliberately out of the approved copy scope,
// so they legitimately still carry it and must not be swept up here.
const TEAM_HUB_ONLY_SUPERSEDED = ['Our Program', 'Your seasons, roster, games, and film.'];

// Source-level absence across the two owning modules.
const sources = ['js/native-home.jsx', 'js/native-team-hub.jsx'].map(f => readFileSync(f, 'utf8')).join('\n');
const hubSource = readFileSync('js/native-team-hub.jsx', 'utf8');
const leftInSource = SUPERSEDED.filter(phrase => sources.includes(phrase));
ok(leftInSource.length === 0, 'No superseded phrase remains in the Home/Team Hub source', leftInSource);
const leftInHub = TEAM_HUB_ONLY_SUPERSEDED.filter(phrase => hubSource.includes(phrase));
ok(leftInHub.length === 0, 'Team Hub source no longer carries its own superseded phrases', leftInHub);

// Rendered absence + approved presence, across the live surfaces.
const renderedText = async () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));

let text = await renderedText();
ok(!SUPERSEDED.some(p => text.includes(p)), 'No superseded phrase renders on populated Home',
  SUPERSEDED.filter(p => text.includes(p)));

// Scout Home summary: source-game count only, no isolation clause.
const scoutHome = await page.evaluate(async () => {
  const hub = window.app.teamHubScreen;
  await hub.createScout({ opponent: 'Northfield', year: '2026', level: 'Varsity', sourceTeamA: 'Northfield', sourceTeamB: 'Central', date: '2026-10-02' });
  await hub.load();
  const scout = hub.snapshot().railSeasons.find(s => s.isScout);
  await hub.openSeason(scout.id);
  await new Promise(r => setTimeout(r, 350));
  return document.querySelector('#wsHomeSummary')?.textContent || '';
});
ok(/source game/.test(scoutHome) && !/isolated/.test(scoutHome),
  'The scout Home summary keeps only its source-game count', { scoutHome });

// Scout empty state. createScout() seeds one source game, so the empty panel
// only renders once that game is gone -- clear it to reach the real state.
const scoutEmpty = await page.evaluate(async () => {
  const store = window.app.storage.seasonStore;
  store.data.games = [];
  store.data.activeGameId = '';
  await window.app.homeScreen.show('reports');
  await new Promise(r => setTimeout(r, 250));
  const panel = document.querySelector('.ws-empty-panel');
  return { h3: panel?.querySelector('h3')?.textContent || '', p: panel?.querySelector('p')?.textContent || '' };
});
ok(scoutEmpty.h3 === 'No source games yet' && scoutEmpty.p === 'Add a source game and link film.',
  'The scout empty state renders the approved copy', scoutEmpty);

// Team Hub: hero, workspace choice, and the scout library empty state.
const hubCopy = await page.evaluate(async () => {
  await window.app.teamHubScreen.selectWorkspace('scout');
  await window.app.workspaceShell._openLibrary();
  await new Promise(r => setTimeout(r, 450));
  const hero = document.querySelector('.gi-hub-workspace-hero');
  const empty = document.querySelector('.gi-hub-empty-inline');
  return {
    choices: [...document.querySelectorAll('#wsTeamHub .gi-hub-workspace-choice strong')].map(n => n.textContent),
    choiceSmalls: [...document.querySelectorAll('#wsTeamHub .gi-hub-workspace-choice small')].map(n => n.textContent),
    subtitle: document.querySelector('#giHubTitle')?.parentElement?.querySelector('p')?.textContent || '',
    heroP: hero?.querySelector('p')?.textContent || '',
    emptyH3: empty?.querySelector('h3')?.textContent || '',
    emptyP: empty?.querySelector('p')?.textContent || '',
    text: document.querySelector('#wsTeamHub')?.innerText.replace(/\s+/g, ' ') || '',
  };
});
ok(hubCopy.choices[0] === 'Program' && hubCopy.choiceSmalls[0] === 'Seasons, roster, games, and film.',
  'Team Hub workspace choice renders the approved Program copy', hubCopy);
ok(hubCopy.subtitle === 'Program seasons and opponent scouting.',
  'Team Hub subtitle renders the approved copy', hubCopy);
ok(hubCopy.heroP === 'Opponent games, film, and charting.',
  'The opponent library hero renders the approved helper', hubCopy);
ok(![...SUPERSEDED, ...TEAM_HUB_ONLY_SUPERSEDED].some(p => hubCopy.text.includes(p)),
  'No superseded phrase renders anywhere in Team Hub',
  [...SUPERSEDED, ...TEAM_HUB_ONLY_SUPERSEDED].filter(p => hubCopy.text.includes(p)));

// Team Hub program hero.
const programHero = await page.evaluate(async () => {
  await window.app.teamHubScreen.selectWorkspace('program');
  await new Promise(r => setTimeout(r, 350));
  return document.querySelector('.gi-hub-workspace-hero p')?.textContent || '';
});
ok(programHero === 'Program seasons, games, roster, and play library.',
  'The program hero renders the approved helper', { programHero });

// Dialogs: create season (intro + guided/manual), edit season, setup guide, create scout.
const dialogCopy = await page.evaluate(async () => {
  const hub = window.app.teamHubScreen;
  const grab = () => {
    const form = document.querySelector('[data-overlay-id] .gi-hub-dialog-form');
    return {
      intro: form?.querySelector('p')?.textContent || '',
      smalls: [...(form?.querySelectorAll('.gi-hub-setup-mode small') || [])].map(n => n.textContent),
      note: form?.querySelector('.gi-hub-form-note')?.textContent || '',
      guideNote: form?.querySelector('.gi-season-guide-note')?.textContent || '',
      guideIntro: form?.querySelector('.gi-season-guide-head p')?.textContent || '',
    };
  };
  const close = () => document.querySelectorAll('[data-overlay-id]').forEach(o => {
    const cancel = [...o.querySelectorAll('button')].find(b => /Cancel|Skip guide/.test(b.textContent));
    cancel?.click();
  });
  const out = {};
  hub.openCreateSeason(null); await new Promise(r => setTimeout(r, 300));
  out.create = grab(); close(); await new Promise(r => setTimeout(r, 200));

  const program = hub.snapshot().railSeasons.find(s => !s.isScout && !s.isDemo);
  await hub.openSeason(program.id); await new Promise(r => setTimeout(r, 300));
  window.app.homeScreen.openEditSeason(null); await new Promise(r => setTimeout(r, 350));
  out.edit = grab(); close(); await new Promise(r => setTimeout(r, 200));

  window.app.homeScreen.openSeasonSetup(null); await new Promise(r => setTimeout(r, 350));
  out.guide = grab(); close(); await new Promise(r => setTimeout(r, 200));

  hub.openCreateScout(null); await new Promise(r => setTimeout(r, 300));
  out.scout = grab(); close(); await new Promise(r => setTimeout(r, 200));
  return out;
});
ok(/^Season for/.test(dialogCopy.create.intro), 'Create-season intro renders the approved copy', dialogCopy.create);
ok(dialogCopy.create.smalls[0] === 'Roster, film storage, and first-game setup.'
  && dialogCopy.create.smalls[1] === 'Create the season without the setup guide.',
  'Guided and manual setup helpers render the approved copy', dialogCopy.create);
ok(dialogCopy.edit.intro === 'Changes year and level only. Season ID, games, and roster remain unchanged.',
  'Edit-season helper renders the approved copy', dialogCopy.edit);
ok(dialogCopy.guide.guideIntro === 'Roster, film storage, and first-game setup. All steps are optional.'
  && dialogCopy.guide.guideNote === 'Reopen from Team & Film Control Center.',
  'Setup-guide intro and footer render the approved copy', dialogCopy.guide);
ok(dialogCopy.scout.intro === 'Opponent scouts are excluded from program schedules, records, and season totals.'
  && dialogCopy.scout.note === 'Link the source-game folder in Team & Film Settings. Film location is unchanged.',
  'Create-scout intro and form note render the approved copy', dialogCopy.scout);

// ---------------------------------------------------------------------------
console.log('\n== 6. Safeguards unchanged ==');
const safeguards = await page.evaluate(async () => {
  const hub = window.app.teamHubScreen;
  await window.app.workspaceShell.show('home');
  await new Promise(r => setTimeout(r, 200));
  // Validation still refuses a duplicate season identity.
  const before = hub.snapshot().railSeasons.length;
  const dupe = await hub.createSeason({ year: '2026', level: 'Varsity' });
  await hub.load();
  const after = hub.snapshot().railSeasons.length;
  // Destructive delete still requires a typed confirmation.
  const program = hub.snapshot().railSeasons.find(s => !s.isScout && !s.isDemo);
  hub.deleteSeason(program.id, null);
  await new Promise(r => setTimeout(r, 350));
  const panel = document.querySelector('[data-overlay-id] .gi-overlay-panel');
  const danger = [...(panel?.querySelectorAll('button') || [])].find(b => /Delete/.test(b.textContent));
  const confirmField = !!panel?.querySelector('input[name="confirm"]');
  const disabled = !!danger?.disabled;
  const stillThere = hub.snapshot().railSeasons.length;
  [...(panel?.querySelectorAll('button') || [])].find(b => /Cancel/.test(b.textContent))?.click();
  await new Promise(r => setTimeout(r, 200));
  await hub.load();
  return { before, after, dupeOk: dupe?.ok, confirmField, disabled, stillThere, final: hub.snapshot().railSeasons.length };
});
ok(safeguards.dupeOk === false && safeguards.after === safeguards.before,
  'Duplicate-season validation still refuses and creates nothing', safeguards);
ok(safeguards.confirmField && safeguards.disabled,
  'Season deletion still requires a typed confirmation before it can arm', safeguards);
ok(safeguards.final === safeguards.before,
  'Cancelling the delete leaves every season intact', safeguards);

ok(errors.length === 0, 'No page errors across the whole journey', errors);

await browser.close();
console.log(`\n== RESULT: ${passed} passed, ${failed} failed ==`);
process.exit(failed > 0 ? 1 : 0);
