import { APP_URL } from './app-entry.mjs';
/* COACH COPY STANDARD — APP-WIDE.
 *
 * The standard, stated by the coach four separate times: a heading or sub-head
 * is a precise definition of the data below it. Not a question posed back at
 * him, not prose. "I don't need poetry."
 *
 * WHY THIS HARNESS EXISTS AS ITS OWN FILE. The first version of this check lived
 * inside e2e-native-reports and inspected only the Reports DOM. So every sweep I
 * ran cleaned what I happened to be looking at, the guard confirmed Reports was
 * clean, and Season blocks, Team Hub, Study and Plan went unchecked for the
 * whole range. The coach kept finding copy I had reported as removed. Scoping a
 * guard to the place you just fixed is how a defect survives four fixes.
 *
 * Two failure modes it is built against, both of which actually happened:
 *   1. Scoped too narrowly  -> walks every route and every Reports tab.
 *   2. Passing vacuously    -> asserts it actually inspected a real number of
 *      headings. A route that failed to mount would otherwise report "clean".
 *
 * Confirmation dialogs legitimately ask questions ("Delete this version?") and
 * are deliberately out of scope: they are commands, not data labels.
 */
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? ' -- ' + extra : ''}`); }
};

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 500));
await page.evaluate(async () => {
  localStorage.setItem('ffa_team_profile', JSON.stringify({ teamName: 'Copy Probe', jerseyColor: 'blue' }));
  await window.app.storage.loadDemoSeason();
});
await new Promise(r => setTimeout(r, 900));

/* A heading NAMES the data. It does not open with an interrogative or a
   demonstrative, which is the shape every offending string has had:
   "Where the gains sit", "Did we move the chains", "What's Working". */
const HEAD_OPENERS = /^(where|how|what|did|do|does|are|is|why|can|should|when|who|this|we)\b/i;

const scan = () => page.evaluate(() => {
  const root = document.querySelector('.ws-main') || document.body;
  const bad = [];
  let headings = 0, captions = 0;
  const openers = /^(where|how|what|did|do|does|are|is|why|can|should|when|who|this|we)\b/i;
  const visible = el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // The Offense and Defense boards title their modules with
  // <header><strong>, not <h4>. Those ARE headings in the product sense
  // and are exactly where conversational copy would appear, so the standard
  // has to see them -- when the boards moved to that markup the sweep silently
  // stopped covering every module title on two routes.
  const HEADING_SELECTOR = 'h1, h2, h3, h4, h5,'
    + ' .gi-overview-module > header > strong, .gi-zone-rule h2, .gi-def-secrule h2';
  [...root.querySelectorAll(HEADING_SELECTOR)].filter(visible).forEach(el => {
    headings++;
    const text = (el.textContent || '').trim();
    if (openers.test(text) || text.endsWith('?')) bad.push(`HEAD "${text}"`);
  });
  [...root.querySelectorAll('.viz-caption, .self-scout-intro, figcaption, .gi-lens-head p,'
    + ' .gi-overview-module > header > span, .gi-zone-rule p, .gi-def-secrule p, .gi-def-note')]
    .filter(visible).forEach(el => {
      captions++;
      const text = (el.textContent || '').trim();
      if (text.endsWith('?') && text.split(/\s+/).length > 2) bad.push(`CAPTION "${text}"`);
    });
  return { bad, headings, captions };
});

const seen = { headings: 0, captions: 0 };
const offenders = [];
const record = (where, r) => {
  seen.headings += r.headings; seen.captions += r.captions;
  r.bad.forEach(b => offenders.push(`${where} :: ${b}`));
};

for (const route of ['home', 'breakdown', 'study', 'plan', 'reports']) {
  await page.evaluate(r => window.app.workspaceShell.show(r), route);
  await new Promise(r => setTimeout(r, 700));
  record(route, await scan());
}

// The retired full-page Team Hub is gone. Exercise both Home library modes:
// the program library and the empty Scout workspace, then restore the program
// season before walking Reports.
await page.evaluate(() => window.app.workspaceShell._openLibrary());
await new Promise(r => setTimeout(r, 1000));
record('home/program-library', await scan());
await page.evaluate(() => window.app.teamHubScreen.selectWorkspace('scout'));
await new Promise(r => setTimeout(r, 700));
record('home/scout-library', await scan());
await page.evaluate(() => window.app.teamHubScreen.selectWorkspace('program'));
/* FIXTURE REPOINTED 2026-09-14. This waited for a season to become current after
   the toggle, which only held while a workspace switch restored one by
   `lastOpened` -- the retired redirect. `_openLibrary()` above deliberately
   closes the season, so the coach is in the library and the toggle opens
   nothing; the season to walk Reports with is now opened explicitly. */
await page.evaluate(async () => {
  const hub = window.app.teamHubScreen;
  const program = (hub.snapshot().railSeasons || []).find(season => !season.isScout);
  if (program) await window.app.storage.openSeasonById(program.id);
});
await page.waitForFunction(() => window.app.storage.seasonStore.hasCurrent());

// Every Reports tab, in self perspective, plus the Season sub-tabs — the pane
// that carried the lens board's questions into a second route.
await page.evaluate(() => window.app.workspaceShell.show('reports'));
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => {
  const s = window.app.reportsScreen;
  s.perspective = 'self'; s._syncTabState?.(); s._renderActiveTab?.();
});
await new Promise(r => setTimeout(r, 500));
let defenseCoverage = { sections: 0, modules: 0 };
for (const tab of ['overview', 'offense', 'defense', 'special', 'players', 'selfscout', 'season', 'matchup']) {
  await page.evaluate(t => document.querySelector(`[data-report-tab="${t}"]`)?.click(), tab);
  await new Promise(r => setTimeout(r, 600));
  record(`reports/${tab}`, await scan());
  // Defense Revision 2 renders all four sections on one page, so the single
  // scan above reads every section heading and module title. Prove that it
  // did, rather than trusting a green sweep that could be reading nothing.
  if (tab === 'defense') {
    defenseCoverage = await page.evaluate(() => ({
      sections: document.querySelectorAll('.gi-def2 [data-def2-section] h2').length,
      modules: document.querySelectorAll('.gi-def2 [data-def2-module] > header > h3').length,
    }));
  }
  if (tab === 'season') {
    for (const sub of ['offense', 'defense', 'special', 'players', 'scout', 'trends']) {
      await page.evaluate(s => document.querySelector(`[data-pane="season"] .gi-subtab[data-subtab="${s}"]`)?.click(), sub);
      await new Promise(r => setTimeout(r, 400));
      record(`reports/season/${sub}`, await scan());
    }
  }
}

console.log(`\n  inspected ${seen.headings} headings and ${seen.captions} captions across every route`);
// Anti-vacuity. A route that silently failed to mount would contribute nothing
// and the offender list would be empty for the wrong reason. Thresholds are
// deliberately well below the current honest count (113/24 at the time this
// was last recalibrated) -- they exist to catch a silent near-zero collapse,
// not to pin an exact figure that legitimately drifts as routes evolve.
ok(seen.headings > 90 && seen.captions > 15,
  'The sweep actually reached the routes (heading and caption counts are non-trivial)',
  JSON.stringify(seen));
ok(defenseCoverage.sections === 4 && defenseCoverage.modules >= 20,
  'The sweep read the Defense board: all four section headings and its module titles',
  JSON.stringify(defenseCoverage));
ok(offenders.length === 0,
  'Every visible heading and caption names its data — no questions, no prose openers',
  JSON.stringify(offenders, null, 1));
ok(errors.length === 0, 'No page errors', errors.join(' | '));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);
