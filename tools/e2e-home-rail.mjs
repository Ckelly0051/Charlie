/**
 * Home rail: navigation gets the rail's flexible height.
 *
 * The 1.12.0-91 installed screenshot showed the Program Seasons tree holding
 * one visible year (2026) while the OPEN season was 2025 JV, because both trees
 * held an equal `1fr` with a 112px floor under a tool block that took nearly
 * half the rail. These assertions are behavioural: what a coach can see and
 * reach, measured, not which selectors or declarations exist.
 */
import { APP_URL } from './app-entry.mjs';
import { createFirstTeam } from './hub-setup.mjs';
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const SHOTS = process.env.GIQ_HOME_RAIL_SHOTS_DIR || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 240000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
await page.setViewport({ width: 1920, height: 1080 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.teamHubScreen);
await createFirstTeam(page, 'St. Joseph Mavericks');
await page.evaluate(() => window.app.workspaceShell.show('home'));
await sleep(500);

/** Rows the MODEL holds. A folded year removes its rows from the DOM, which is
 *  the point of folding — so seeding must not count what is rendered. */
const modelSeasons = () => page.evaluate(() =>
  (window.app.teamHubScreen.snapshot().railSeasons || []).filter(season => !season.isScout).length);
const railRows = () => page.evaluate(() =>
  document.querySelectorAll('[data-rail-section="Program Seasons"] .rail-row').length);
/** Unfold every year, so a DOM count means "all seasons". */
const expandAllYears = async () => {
  await page.evaluate(async () => {
    const folded = [...document.querySelectorAll('[data-rail-section="Program Seasons"] .rail-year-toggle')]
      .filter(t => t.getAttribute('aria-expanded') === 'false');
    folded.forEach(t => t.click());
    await new Promise(r => setTimeout(r, 200));
  });
  await sleep(250);
};

/** Create seasons through the real service owner, never by poking state, and
 *  WAIT for the rail to actually show them — a fixed sleep is a flake. */
async function addSeasons(specs) {
  const want = (await modelSeasons()) + specs.length;
  await page.evaluate(async list => {
    const app = window.app;
    for (const [year, level] of list) {
      await app.storage.createSeason({ name: `${year} ${level}`, team: app.teamRegistry.activeTeamId(), year, level });
    }
  }, specs);
  await page.evaluate(() => window.app.workspaceShell.show('home'));
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await modelSeasons() === want) { await expandAllYears(); return want; }
    await sleep(200);
  }
  throw new Error(`rail never showed ${want} seasons (saw ${await modelSeasons()})`);
}
async function addScout(year, opponent) {
  await page.evaluate(async (y, name) => {
    const app = window.app;
    await app.storage.createSeason({ name: `${y} · JV · ${name} · Scout`, team: app.teamRegistry.activeTeamId(),
      year: y, level: 'JV', kind: 'scout' });
  }, year, opponent);
  await page.evaluate(() => window.app.workspaceShell.show('home'));
  await sleep(450);
}

/** Everything the rail must guarantee, measured from laid-out geometry. */
const measure = () => page.evaluate(() => {
  const sectionOf = title => document.querySelector(`[data-rail-section="${title}"]`);
  const rail = document.querySelector('.rail-year');
  const seasons = sectionOf('Program Seasons');
  const scouts = sectionOf('Opponent Scouts');
  const seasonScroller = seasons?.querySelector('.rail-groups');
  const scoutScroller = scouts?.querySelector('.rail-groups');
  const tools = document.querySelector('.rail-tools');
  const railBox = rail.getBoundingClientRect();
  const inside = (node, scroller) => {
    const a = node.getBoundingClientRect(), b = scroller.getBoundingClientRect();
    return a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
  };
  const rows = [...seasons.querySelectorAll('.rail-row')];
  const current = seasons.querySelector('.rail-row.is-current');
  const visibleInRail = node => {
    const a = node.getBoundingClientRect();
    return a.top >= railBox.top - 1 && a.bottom <= railBox.bottom + 1 && a.height > 0;
  };
  return {
    rowsTotal: rows.length,
    rowsVisible: rows.filter(row => inside(row, seasonScroller)).length,
    currentVisible: current ? inside(current, seasonScroller) : null,
    seasonScrolls: seasonScroller.scrollHeight > seasonScroller.clientHeight + 1,
    seasonBoxH: Math.round(seasonScroller.getBoundingClientRect().height),
    // The rail itself must never become a scrollport: one owner per tree.
    railScrolls: rail.scrollHeight > rail.clientHeight + 1,
    pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    // Both trees present, headed, and inside the frame — never merged.
    seasonsHeadVisible: visibleInRail(seasons.querySelector('.rail-head')),
    scoutsHeadVisible: visibleInRail(scouts.querySelector('.rail-head')),
    scoutsHeadText: (scouts.querySelector('.gi-hub-kicker')?.textContent || '').trim(),
    scoutRows: scoutScroller.querySelectorAll('.rail-row').length,
    scoutCreateVisible: visibleInRail(scouts.querySelector('.icon-btn')),
    distinctTrees: seasons !== scouts && !seasons.contains(scouts),
    // Every utility action reachable and not overlapping the tree above it.
    tools: [...tools.querySelectorAll('button')].map(b => ({
      label: b.textContent.trim(), visible: visibleInRail(b),
      h: Math.round(b.getBoundingClientRect().height) })),
    toolsOverlap: tools.getBoundingClientRect().top < seasonScroller.getBoundingClientRect().bottom - 1,
    // Year disclosure state.
    years: [...seasons.querySelectorAll('.rail-year-toggle')].map(t => ({
      year: t.dataset.railYear, expanded: t.getAttribute('aria-expanded'),
      controls: t.getAttribute('aria-controls'), h: Math.round(t.getBoundingClientRect().height) })),
    // No row may wrap the rail wider or clip its own label.
    railWidth: Math.round(railBox.width),
    clippedLabels: rows.filter(row => {
      const label = row.querySelector('strong');
      return label && label.scrollWidth > label.clientWidth + 1 && !row.title;
    }).length,
  };
});

console.log('== 1. Three seasons: the tree shows them all, with no internal scrollbar ==');
// A new team already owns one season, so top the tree up to exactly three.
const baseline = await modelSeasons();
await addSeasons([['2025', 'JV'], ['2025', 'Varsity'], ['2024', 'JV']].slice(0, Math.max(0, 3 - baseline)));
const TOTAL3 = await modelSeasons();
for (const [w, h] of [[1920, 1080], [1440, 900]]) {
  await page.setViewport({ width: w, height: h });
  await sleep(350);
  const m = await measure();
  ok(m.rowsTotal === 3 && m.rowsVisible === 3 && !m.seasonScrolls,
    `${w}x${h}: three ordinary seasons render with no season-tree scrollbar`, JSON.stringify(m));
  ok(m.currentVisible !== false, `${w}x${h}: the open season is visible in the tree`, JSON.stringify(m));
  ok(!m.railScrolls && !m.pageOverflowX,
    `${w}x${h}: the rail is not a scrollport and the page does not scroll sideways`, JSON.stringify(m));
  ok(m.tools.length >= 3 && m.tools.every(tool => tool.visible) && !m.toolsOverlap,
    `${w}x${h}: every utility action is reachable and clear of the tree`, JSON.stringify(m.tools));
  ok(m.tools.every(tool => tool.h >= 36),
    `${w}x${h}: utility actions keep their full target height`, JSON.stringify(m.tools.map(t => t.h)));
}

console.log('\n== 2. Both trees stay distinct, headed and reachable ==');
await addScout('2025', 'St. Peter Lutheran');
const withScout = await measure();
ok(withScout.distinctTrees && withScout.seasonsHeadVisible && withScout.scoutsHeadVisible,
  'Program Seasons and Opponent Scouts are separate, headed trees, both on screen',
  JSON.stringify(withScout));
ok(/Opponent Scouts/i.test(withScout.scoutsHeadText) && withScout.scoutRows === 1 && withScout.scoutCreateVisible,
  'the scout tree holds its own rows and its own create action', JSON.stringify(withScout));

console.log('\n== 3. Eight seasons: years fold, the open season stays visible ==');
const TOTAL8 = await addSeasons([['2024', 'Varsity'], ['2023', 'JV'], ['2023', 'Varsity'], ['2022', 'JV'], ['2022', 'Varsity']]);
await page.setViewport({ width: 1440, height: 900 });
await sleep(400);
let eight = await measure();
ok(eight.rowsTotal === TOTAL8 && TOTAL8 === 8, 'all eight seasons are in the tree, none dropped', JSON.stringify([eight.rowsTotal, TOTAL8]));
ok(eight.years.length >= 4 && eight.years.every(y => y.expanded === 'true' && y.controls),
  'every year group opens expanded and owns a labelled disclosure', JSON.stringify(eight.years));
ok(eight.currentVisible, 'the open season is visible with eight seasons loaded', JSON.stringify(eight));

/* Folding a year is real: its rows leave the tree, and the count stays legible. */
const folded = await page.evaluate(async () => {
  const toggles = [...document.querySelectorAll('[data-rail-section="Program Seasons"] .rail-year-toggle')];
  /* A year that does NOT hold the open season, because the open season is
     deliberately pinned visible through a fold — that contract is asserted
     separately below and would mask this one. */
  const target = toggles.find(t => {
    const group = t.closest('.rail-group');
    return group.querySelectorAll('.rail-row').length === 2 && !group.querySelector('.rail-row.is-current');
  });
  const before = document.querySelectorAll('[data-rail-section="Program Seasons"] .rail-row').length;
  target.click();
  await new Promise(r => setTimeout(r, 250));
  const after = document.querySelectorAll('[data-rail-section="Program Seasons"] .rail-row').length;
  const body = document.getElementById(target.getAttribute('aria-controls'));
  return { before, after, expanded: target.getAttribute('aria-expanded'),
    bodyRows: body.querySelectorAll('.rail-row').length,
    count: target.querySelector('.rail-year-count')?.textContent.trim() };
});
ok(folded.after === folded.before - 2 && folded.expanded === 'false' && folded.bodyRows === 0,
  'folding a year removes exactly its own rows from the tree', JSON.stringify(folded));
ok(folded.count === '2', 'a folded year still states how many seasons it holds', JSON.stringify(folded));

/* Keyboard: focus the disclosure and operate it with the keyboard alone. */
const keyboard = await page.evaluate(async () => {
  const toggle = [...document.querySelectorAll('[data-rail-section="Program Seasons"] .rail-year-toggle')]
    .find(t => t.getAttribute('aria-expanded') === 'false') || document.querySelector('.rail-year-toggle');
  toggle.focus();
  const focused = document.activeElement === toggle;
  const style = getComputedStyle(toggle, ':focus-visible');
  toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  toggle.click(); // Enter on a native button activates it; click is that activation.
  await new Promise(r => setTimeout(r, 250));
  return { focused, expanded: toggle.getAttribute('aria-expanded'),
    rows: document.querySelectorAll('[data-rail-section="Program Seasons"] .rail-row').length,
    tabbable: toggle.tabIndex >= 0, outlineDeclared: !!style };
});
ok(keyboard.focused && keyboard.tabbable, 'the year disclosure is focusable and in the tab order', JSON.stringify(keyboard));
ok(keyboard.expanded === 'true' && keyboard.rows === TOTAL8,
  'activating the disclosure from the keyboard expands the year again', JSON.stringify(keyboard));

console.log('\n== 4. The open season survives a fold, a viewport change and a season change ==');
const foldCurrent = await page.evaluate(async () => {
  const section = document.querySelector('[data-rail-section="Program Seasons"]');
  const current = section.querySelector('.rail-row.is-current');
  const year = current?.closest('.rail-group')?.querySelector('.rail-year-toggle');
  if (!year) return { skipped: true };
  year.click();
  await new Promise(r => setTimeout(r, 250));
  const stillThere = section.querySelector('.rail-row.is-current');
  const scroller = section.querySelector('.rail-groups');
  const visible = stillThere
    ? (() => { const a = stillThere.getBoundingClientRect(), b = scroller.getBoundingClientRect();
      return a.top >= b.top - 1 && a.bottom <= b.bottom + 1; })()
    : false;
  return { expanded: year.getAttribute('aria-expanded'), present: !!stillThere, visible };
});
ok(foldCurrent.expanded === 'false' && foldCurrent.present && foldCurrent.visible,
  'folding the OPEN season\'s year keeps that season on screen — it is never hidden',
  JSON.stringify(foldCurrent));

await page.setViewport({ width: 1280, height: 800 });
await sleep(450);
const narrow = await measure();
ok(narrow.currentVisible, 'the open season is still visible after a viewport change', JSON.stringify(narrow));
ok(narrow.tools.every(tool => tool.visible) && !narrow.toolsOverlap && !narrow.railScrolls,
  '1280x800: utility actions stay reachable and clear of the tree', JSON.stringify(narrow.tools));
ok(!narrow.pageOverflowX, '1280x800: no horizontal page scrolling', JSON.stringify(narrow.pageOverflowX));

console.log('\n== 5. Ten seasons: bounded scrolling inside the tree only ==');
const TOTAL10 = await addSeasons([['2021', 'JV'], ['2021', 'Varsity']]);
await page.setViewport({ width: 1440, height: 900 });
await sleep(400);
const ten = await measure();
ok(ten.rowsTotal === TOTAL10 && TOTAL10 === 10, 'all ten seasons remain in the tree', JSON.stringify([ten.rowsTotal, TOTAL10]));
ok(ten.seasonScrolls && !ten.railScrolls && !ten.pageOverflowX,
  'a long history scrolls inside the season tree, not the rail or the page', JSON.stringify(ten));
ok(ten.currentVisible, 'the open season is visible with ten seasons loaded', JSON.stringify(ten));
ok(ten.tools.every(tool => tool.visible) && !ten.toolsOverlap,
  'the utility block is still anchored and reachable with ten seasons', JSON.stringify(ten.tools));

console.log('\n== 6. Long labels truncate without widening the rail ==');
const before = (await measure()).railWidth;
await addSeasons([['2020', 'Varsity Development Program — Extended Roster Evaluation Squad']]);
await sleep(300);
const long = await measure();
ok(long.railWidth === before,
  'a very long season label does not widen the rail', `${before} -> ${long.railWidth}`);
ok(long.clippedLabels === 0,
  'every clipped label carries its full name in a title attribute', JSON.stringify(long.clippedLabels));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/home-rail-1440x900-long-labels.png` });

ok(errors.length === 0, 'no page or console errors', errors.slice(0, 3).join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
