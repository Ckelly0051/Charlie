/**
 * Visual capture for the Opponent Scout ownership workspace.
 *
 * Eight states x five release widths, written to artifacts/scout-workspace.
 * Geometry findings are printed alongside each shot so the inspection has
 * numbers next to the image: page overflow, how many workspace switches and
 * create actions render, and whether the assignment control is in the initial
 * viewport.
 *
 *   node tools/capture-scout-workspace.mjs
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { APP_URL } from './app-entry.mjs';
import { setupTeamAndDemo } from './hub-setup.mjs';

const OUT = 'artifacts/scout-workspace';
mkdirSync(OUT, { recursive: true });
const WIDTHS = [[1920, 1080], [1440, 900], [1280, 800], [768, 1024], [390, 844]];

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.teamHubScreen && window.app?.workspace);
await setupTeamAndDemo(page, 'St. Joseph Mavericks');

const ids = await page.evaluate(async () => {
  const hub = window.app.teamHubScreen, S = window.app.storage, st = S.seasonStore;
  await hub.createSeason({ year: '2026', level: 'Varsity' });
  const varsity = st.currentSeasonId;
  await hub.createSeason({ year: '2026', level: 'JV' });
  const jv = st.currentSeasonId;
  // Two scouts under Varsity, none under JV (so JV shows the empty state).
  await S.openSeasonById(varsity);
  await hub.load();
  await hub.selectWorkspace('scout');
  await hub.createScout({ opponent: 'Holy Family', year: '2026', level: 'Varsity', sourceTeamA: 'Holy Family', sourceTeamB: 'Central', date: '2026-09-05' });
  await hub.createScout({ opponent: 'Riverside', year: '2026', level: 'Varsity', sourceTeamA: 'Riverside', sourceTeamB: 'Central', date: '2026-09-12' });
  const teamId = window.app.teamRegistry.activeTeamId();
  const legacy = async (name, year, level) => {
    const rec = await st.backend.createSeason({ name, year, level, kind: 'scout', teamId, team: 'St. Joseph Mavericks' });
    await st.backend.saveSeason(rec.id, {
      id: rec.id, type: 'season', version: 5, seasonName: name, kind: 'scout', teamId, year, level,
      roster: [], rosterOwnership: 'season',
      games: [{ id: `${rec.id}-g1`, name: 'Source', plays: [], annotations: [], gameInfo: {}, nextId: 1, status: 'active' }],
      activeGameId: `${rec.id}-g1`,
    });
    return rec.id;
  };
  // First-launch shape (no parent, no unique match) and a dangling parent.
  const firstLaunch = await legacy('Northfield · Scout', '2026', '');
  const dangling = await legacy('Imported Opponent · Scout', '2026', '');
  const body = await st.peekSeason(dangling);
  body.programSeasonId = 'gone-from-this-machine';
  await st.backend.saveSeason(dangling, body);
  await S.openSeasonById(varsity);
  await hub.load();
  return { varsity, jv, firstLaunch, dangling };
});

const shoot = async (name, prepare) => {
  const findings = [];
  for (const [width, height] of WIDTHS) {
    await page.setViewport({ width, height });
    await new Promise(r => setTimeout(r, 200));
    await prepare();
    await new Promise(r => setTimeout(r, 550));
    const file = `${OUT}/${name}-${width}.png`;
    await page.screenshot({ path: file });
    const geo = await page.evaluate(() => {
      const inView = node => {
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight + 1;
      };
      const creates = [...document.querySelectorAll('#wsHome button')]
        .filter(b => /new opponent scout|create opponent scout|create first|new season|create a program season/i.test(b.textContent))
        .filter(b => b.getClientRects().length);
      const assign = document.querySelector('.library-unassigned-row .ws-primary');
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        switches: document.querySelectorAll('.ws-workspace-switch').length,
        creates: creates.length,
        createInView: creates.length ? inView(creates[0]) : null,
        assignInView: assign ? inView(assign) : null,
        rails: document.querySelectorAll('.rail-year').length,
        heads: document.querySelectorAll('.library-panel-head').length,
        parentLabel: document.querySelector('.library-summary.is-scout b')?.textContent || '',
        unassigned: document.querySelectorAll('.library-unassigned-row').length,
        scoutEmpty: !!document.querySelector('.library-scout-empty'),
      };
    });
    findings.push({ width, ...geo });
  }
  console.log(`\n${name}`);
  for (const f of findings) {
    console.log(`  ${String(f.width).padStart(4)}  overflow ${f.overflow}  switches ${f.switches}  creates ${f.creates}`
      + `  createInView ${f.createInView}  assignInView ${f.assignInView}  rails ${f.rails}  heads ${f.heads}`
      + `  unassigned ${f.unassigned}  empty ${f.scoutEmpty}  parent "${f.parentLabel}"`);
  }
  return findings;
};

const all = {};
all.programHome = await shoot('01-program-home', () => page.evaluate(async (i) => {
  const hub = window.app.teamHubScreen;
  await window.app.storage.openSeasonById(i.varsity);
  await hub.load(); await hub.selectWorkspace('program');
  await window.app.workspaceShell.show('home');
}, ids));
all.populated = await shoot('02-scout-library-populated', () => page.evaluate(async (i) => {
  const hub = window.app.teamHubScreen;
  await window.app.storage.openSeasonById(i.varsity);
  await hub.load(); await hub.selectWorkspace('scout');
}, ids));
all.empty = await shoot('03-scout-library-empty', () => page.evaluate(async (i) => {
  const hub = window.app.teamHubScreen;
  await window.app.storage.openSeasonById(i.jv);
  await hub.load(); await hub.selectWorkspace('scout');
}, ids));
all.unassigned = await shoot('04-unassigned-first-launch-and-dangling', () => page.evaluate(async (i) => {
  const hub = window.app.teamHubScreen;
  await window.app.storage.openSeasonById(i.varsity);
  await hub.load(); await hub.selectWorkspace('scout');
}, ids));
all.assignControl = await shoot('05-assignment-control-open', () => page.evaluate(async (i) => {
  const hub = window.app.teamHubScreen;
  await window.app.storage.openSeasonById(i.varsity);
  await hub.load(); await hub.selectWorkspace('scout');
  const select = document.querySelector('.library-unassigned-row select');
  if (select) { select.value = i.varsity; select.dispatchEvent(new Event('change', { bubbles: true })); select.focus(); }
}, ids));
all.openScout = await shoot('06-open-scout-with-parent-context', () => page.evaluate(async (i) => {
  const hub = window.app.teamHubScreen, S = window.app.storage;
  await S.openSeasonById(i.varsity);
  await hub.load(); await hub.selectWorkspace('scout');
  const scout = hub.snapshot().seasons[0]?.id;
  if (scout) { await S.openSeasonById(scout); await hub.load(); }
}, ids));
all.returned = await shoot('07-returned-to-our-program', () => page.evaluate(async () => {
  const hub = window.app.teamHubScreen;
  await hub.selectWorkspace('program');
}, ids));
all.assigned = await shoot('08-after-assignment', () => page.evaluate(async (i) => {
  const hub = window.app.teamHubScreen;
  await window.app.storage.openSeasonById(i.varsity);
  await hub.load(); await hub.selectWorkspace('scout');
  await hub.assignScoutToSeason(i.firstLaunch, i.varsity);
}, ids));

console.log(`\npage/console errors: ${errors.length}${errors.length ? ' :: ' + errors.slice(0, 3).join(' | ') : ''}`);
console.log(`captures in ${OUT}`);
await browser.close();
