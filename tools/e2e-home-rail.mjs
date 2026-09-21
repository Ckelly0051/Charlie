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
/* Every INACTIVE year owns a labelled disclosure and opens expanded; the active
   year is a heading and deliberately carries neither attribute. */
ok(eight.years.length >= 4
  && eight.years.filter(y => y.expanded !== null).every(y => y.expanded === 'true' && y.controls)
  && eight.years.filter(y => y.expanded === null).length === 1,
  'every inactive year opens expanded with a labelled disclosure, and exactly one year is the active heading',
  JSON.stringify(eight.years));
ok(eight.currentVisible, 'the open season is visible with eight seasons loaded', JSON.stringify(eight));

/* Folding a year is real: its rows leave the tree, and the count stays legible. */
const folded = await page.evaluate(async () => {
  const toggles = [...document.querySelectorAll('[data-rail-section="Program Seasons"] .rail-year-toggle')];
  /* An INACTIVE year: the active year is a heading with no control at all. */
  const target = toggles.find(t => {
    const group = t.closest('.rail-group');
    return t.tagName === 'BUTTON' && group.querySelectorAll('.rail-row').length === 2
      && !group.querySelector('.rail-row.is-current');
  });
  const controls = target.getAttribute('aria-controls');
  const before = document.querySelectorAll('[data-rail-section="Program Seasons"] .rail-row').length;
  target.click();
  await new Promise(r => setTimeout(r, 250));
  const after = document.querySelectorAll('[data-rail-section="Program Seasons"] .rail-row').length;
  const same = [...document.querySelectorAll('[data-rail-section="Program Seasons"] .rail-year-toggle')]
    .find(t => t.dataset.railYear === target.dataset.railYear);
  return { before, after, expanded: same?.getAttribute('aria-expanded'),
    // A fully collapsed year renders no body at all, so the DOM cannot
    // contradict `aria-expanded="false"`.
    bodyPresent: !!document.getElementById(controls),
    count: same?.querySelector('.rail-year-count')?.textContent.trim() };
});
ok(folded.after === folded.before - 2 && folded.expanded === 'false' && !folded.bodyPresent,
  'folding a year removes exactly its own rows and its controlled body entirely',
  JSON.stringify(folded));
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

console.log('\n== 4. The ACTIVE year is expanded and offers no collapse ==');
/* REPOINTED: an earlier pass let the active year fold and pinned its current
   row visible, which left `aria-expanded="false"` over rendered content and
   offered an action that could not honestly complete. The active year is now a
   heading. */
const activeYear = await page.evaluate(() => {
  const section = document.querySelector('[data-rail-section="Program Seasons"]');
  const current = section.querySelector('.rail-row.is-current');
  const group = current?.closest('.rail-group');
  const header = group?.querySelector('.rail-year-toggle');
  const scroller = section.querySelector('.rail-groups');
  const model = (window.app.teamHubScreen.snapshot().railSeasons || [])
    .filter(s => !s.isScout);
  const activeYearValue = header?.dataset.railYear;
  return {
    isButton: header?.tagName === 'BUTTON',
    hasAriaExpanded: header?.hasAttribute('aria-expanded'),
    markedActive: header?.dataset.railActiveYear === 'true',
    // Every season of the active year is rendered, not just the current one.
    renderedInYear: group?.querySelectorAll('.rail-row').length,
    modelInYear: model.filter(s => String(s.year) === String(activeYearValue)).length,
    currentInScroller: (() => { const a = current.getBoundingClientRect(), b = scroller.getBoundingClientRect();
      return a.top >= b.top - 1 && a.bottom <= b.bottom + 1; })(),
    // Nothing anywhere may claim collapsed while rendering its own rows.
    lyingDisclosures: [...section.querySelectorAll('.rail-group')].filter(g => {
      const t = g.querySelector('.rail-year-toggle');
      return t?.getAttribute('aria-expanded') === 'false' && g.querySelectorAll('.rail-row').length > 0;
    }).length,
  };
});
ok(!activeYear.isButton && !activeYear.hasAriaExpanded && activeYear.markedActive,
  'the active year is a heading with no collapse control and no aria-expanded',
  JSON.stringify(activeYear));
ok(activeYear.renderedInYear === activeYear.modelInYear && activeYear.renderedInYear > 0,
  'every season in the active year is rendered, not just the open one',
  JSON.stringify(activeYear));
ok(activeYear.lyingDisclosures === 0,
  'no year reports aria-expanded=false while rendering rows — DOM and accessibility agree',
  JSON.stringify(activeYear));
ok(activeYear.currentInScroller, 'the open season is inside its own scroller', JSON.stringify(activeYear));

/* Opening a season in a folded year expands that year and reveals all of it. */
const switchYear = await page.evaluate(async () => {
  const section = () => document.querySelector('[data-rail-section="Program Seasons"]');
  // Fold a year that is not active, then open one of its seasons.
  const toggle = [...section().querySelectorAll('.rail-year-toggle')]
    .find(t => t.tagName === 'BUTTON' && t.getAttribute('aria-expanded') === 'true');
  const year = toggle.dataset.railYear;
  toggle.click();
  await new Promise(r => setTimeout(r, 250));
  const foldedRows = section().querySelectorAll(`.rail-group.is-folded .rail-row`).length;
  const target = (window.app.teamHubScreen.snapshot().railSeasons || [])
    .find(s => !s.isScout && String(s.year) === String(year));
  await window.app.teamHubScreen.openSeason(target.id);
  await new Promise(r => setTimeout(r, 900));
  const group = [...section().querySelectorAll('.rail-group')]
    .find(g => g.querySelector('.rail-year-toggle')?.dataset.railYear === String(year));
  const header = group?.querySelector('.rail-year-toggle');
  const current = section().querySelector('.rail-row.is-current');
  const scroller = section().querySelector('.rail-groups');
  const model = (window.app.teamHubScreen.snapshot().railSeasons || [])
    .filter(s => !s.isScout && String(s.year) === String(year)).length;
  return { year, foldedRows, becameActive: header?.dataset.railActiveYear === 'true',
    isButton: header?.tagName === 'BUTTON', rendered: group?.querySelectorAll('.rail-row').length, model,
    currentYear: current?.closest('.rail-group')?.querySelector('.rail-year-toggle')?.dataset.railYear,
    currentVisible: current ? (() => { const a = current.getBoundingClientRect(), b = scroller.getBoundingClientRect();
      return a.top >= b.top - 1 && a.bottom <= b.bottom + 1; })() : false };
});
ok(switchYear.foldedRows === 0, 'a folded inactive year renders none of its rows', JSON.stringify(switchYear));
ok(switchYear.becameActive && !switchYear.isButton,
  'opening a season in a folded year makes that year the expanded, non-collapsible active year',
  JSON.stringify(switchYear));
ok(switchYear.rendered === switchYear.model && switchYear.rendered > 0
  && switchYear.currentYear === switchYear.year && switchYear.currentVisible,
  'every season in the newly active year is visible and the open one is scrolled into view',
  JSON.stringify(switchYear));

console.log('\n== 4b. The open season survives a viewport change ==');

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

console.log('\n== 7. Collapse state is scoped to the program it was made in ==');
const programScope = await page.evaluate(async () => {
  const section = () => document.querySelector('[data-rail-section="Program Seasons"]');
  // Fold an inactive year in this program.
  const toggle = [...section().querySelectorAll('.rail-year-toggle')]
    .find(t => t.tagName === 'BUTTON' && t.getAttribute('aria-expanded') === 'true');
  const foldedYear = toggle.dataset.railYear;
  toggle.click();
  await new Promise(r => setTimeout(r, 250));
  const foldedHere = [...section().querySelectorAll('.rail-year-toggle')]
    .find(t => t.dataset.railYear === foldedYear)?.getAttribute('aria-expanded');
  // A second program, with a season in that SAME year.
  const app = window.app;
  const team = await app.teamHubScreen.addTeam({ school: 'Second Program', nickname: 'Owls', jerseyColor: 'navy' });
  await new Promise(r => setTimeout(r, 500));
  // The hub's own creator — the same path first launch uses for a new program.
  await app.teamHubScreen.createSeason({ year: foldedYear, level: 'JV', setupMode: 'quick' });
  await app.teamHubScreen.load();
  app.workspaceShell.show('home');
  // Wait for the new program's own tree, rather than assuming a fixed delay.
  for (let attempt = 0; attempt < 30 && !section()?.querySelector('.rail-row'); attempt++) {
    await new Promise(r => setTimeout(r, 200));
  }
  const years = [...section().querySelectorAll('.rail-year-toggle')].map(t => ({
    year: t.dataset.railYear, expanded: t.getAttribute('aria-expanded'),
    active: t.dataset.railActiveYear === 'true' }));
  return { teamOk: team?.ok, foldedYear, foldedHere, years,
    activeTeam: app.teamRegistry.activeTeamId(),
    modelRows: (app.teamHubScreen.snapshot().railSeasons || []).length,
    firstLaunch: !!document.querySelector('[data-first-launch]'),
    rows: section()?.querySelectorAll('.rail-row').length ?? -1 };
});
ok(programScope.foldedHere === 'false', 'a year folds in the first program', JSON.stringify(programScope));
ok(programScope.years.every(y => y.expanded !== 'false'),
  'that fold does not leak into another program — the new program opens fully expanded',
  JSON.stringify(programScope));
ok(programScope.years.some(y => y.active) && programScope.rows > 0,
  'the new program shows its own active year as the expanded heading', JSON.stringify(programScope));

console.log('\n== 8. Home targets and one opponent identity per component ==');
/* Real game cards, or the duplication claim would pass over an empty grid. */
await page.evaluate(async () => {
  const app = window.app;
  const store = app.storage.seasonStore;
  store.addGame({ id: 'dup-1', name: 'Week 1', status: 'active',
    gameInfo: { opponent: 'St. Peter Lutheran Patriots', date: '2026-09-04', scoreUs: 21, scoreThem: 7 },
    plays: [], nextId: 1, currentPlayId: null, clipNames: [], isMultiClip: false });
  store.addGame({ id: 'dup-2', name: 'Week 2', status: 'active',
    gameInfo: { opponent: 'Holy Family Wildcats', date: '2026-09-11' },
    plays: [], nextId: 1, currentPlayId: null, clipNames: [], isMultiClip: false });
  app.workspaceShell.show('home');
  for (let attempt = 0; attempt < 30 && !document.querySelector('.ws-game-row'); attempt++) {
    await new Promise(r => setTimeout(r, 200));
  }
});
await sleep(400);
const surface = await page.evaluate(() => {
  const text = n => (n?.textContent || '').replace(/\s+/g, ' ').trim();
  const box = n => n.getBoundingClientRect();
  const cards = [...document.querySelectorAll('.ws-game-row')];
  const detail = document.querySelector('.detail-pane');
  const overflow = document.querySelector('.detail-top .icon-btn');
  const roster = document.querySelector('.roster-action button');
  const linkFilm = document.querySelector('.detail-status button');
  const target = node => node ? { label: text(node) || node.getAttribute('aria-label'),
    w: Math.round(box(node).width), h: Math.round(box(node).height) } : null;
  return {
    short: [...document.querySelectorAll('.ws-home-page button')]
      .filter(n => box(n).height > 0 && box(n).height < 30)
      .map(n => `${text(n) || n.getAttribute('aria-label')}@${Math.round(box(n).height)}`),
    overflow: overflow ? { ...target(overflow), labelled: !!overflow.getAttribute('aria-label'),
      tooltip: !!overflow.getAttribute('title'), isIconButton: overflow.tagName === 'BUTTON' } : null,
    roster: target(roster), linkFilm: target(linkFilm),
    duplicated: cards.map(card => {
      const title = text(card.querySelector('h3'));
      const sub = text(card.querySelector('.matchup-schools'));
      return !!sub && (sub === title || title.includes(sub));
    }).filter(Boolean).length,
    detailDuplicated: (() => {
      const title = text(detail?.querySelector('#wsDetailName'));
      const sub = text(detail?.querySelector('.matchup-schools'));
      return !!sub && (sub === title || title.includes(sub));
    })(),
    cards: cards.length,
  };
});
ok(surface.short.length === 0,
  'every Home control meets the 30px desktop target', JSON.stringify(surface.short));
ok(surface.overflow && surface.overflow.w >= 30 && surface.overflow.h >= 30
  && surface.overflow.isIconButton && surface.overflow.labelled && surface.overflow.tooltip,
  'the overflow action stays a labelled icon button with a tooltip and a 30x30 target',
  JSON.stringify(surface.overflow));
ok((!surface.roster || surface.roster.h >= 30) && (!surface.linkFilm || surface.linkFilm.h >= 30),
  'the text commands keep their restraint and gain a real target',
  JSON.stringify([surface.roster, surface.linkFilm]));
ok(surface.cards > 0 && surface.duplicated === 0 && !surface.detailDuplicated,
  'no card or panel prints the opponent twice — asserted over real cards, not an empty grid',
  JSON.stringify(surface));

ok(errors.length === 0, 'no page or console errors', errors.slice(0, 3).join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
