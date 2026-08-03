import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/**
 * UX-3 responsive shell containment (S6-4b).
 *
 * The installed 1.12.0-15 smoke reported Study clipping brand/team/nav on the
 * left while controls, KPI cards and charts ran past the right edge. A one-time
 * screenshot audit cannot stop that recurring, so this is the permanent
 * instrument: every shell route, at every reviewed viewport INCLUDING the real
 * installed window size, must contain itself.
 *
 * Three checks per route/viewport:
 *   1. The PAGE never scrolls horizontally.
 *   2. No visible element escapes the viewport horizontally, UNLESS it sits
 *      inside an element that legitimately owns a horizontal scroll (the Study
 *      pivot, the Plan presentation strip). That exemption is why this is a
 *      real containment check and not a blunt geometry assertion — a wide table
 *      inside its own scroller is correct; the same table widening the page is
 *      the defect.
 *   3. The shell's own navigation landmarks stay fully inside the viewport, so
 *      the left-edge clipping the coach reported cannot come back.
 */
import puppeteer from 'puppeteer';

const URL = process.env.FFA_APP_URL || TEST_APP_URL;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => cond ? (pass++, console.log(`  PASS  ${label}`)) : (fail++, console.log(`  FAIL  ${label}${extra ? ' -- ' + extra : ''}`));

// 1400x860 is the installed default window (tauri.conf.json width 1400 / height
// 900, less window chrome). It is FIRST because it is the size the coach
// actually runs, and the size the reported defects appeared at.
const VIEWPORTS = [
  { name: 'installed 1400x860', width: 1400, height: 860 },
  { name: 'desktop 1440x900', width: 1440, height: 900 },
  { name: 'laptop 1280x720', width: 1280, height: 720 },
  { name: 'tablet 768x1024', width: 768, height: 1024 },
  { name: 'phone 390x844', width: 390, height: 844 },
];
const ROUTES = ['home', 'breakdown', 'study', 'reports', 'plan'];

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.setViewport(VIEWPORTS[0]);
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(resolve => setTimeout(resolve, 500));

await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: '2026 Varsity', team: 'Mavericks', year: '2026' });
  const store = app.storage.seasonStore, first = store.activeGame();
  first.id = 'rc-1'; first.name = 'Week 1 vs Rivals';
  first.gameInfo = { opponent: 'Rivals', date: '2026-09-01', scoreUs: 28, scoreThem: 21 };
  // Enough real charting that every route renders populated content — an empty
  // route cannot overflow, so measuring one would prove nothing.
  const looks = ['Trips', 'Ace', 'Wing-T', 'Bunch', 'Empty', 'Doubles'];
  first.plays = Array.from({ length: 36 }, (unused, index) => ({
    id: index + 1, timestamp: { start: index * 5, end: index * 5 + 4 },
    notes: 'Power right, pull the guard and kick out the edge defender',
    tags: {
      unit: index % 4 === 3 ? 'defense' : 'offense', formation: looks[index % looks.length],
      backfield: index % 2 ? 'I' : 'Single', strength: index % 3 === 0 ? 'Right' : 'Left',
      personnel: index % 2 ? '11' : '21', runPass: index % 2 ? 'Run' : 'Pass',
      playType: index % 2 ? 'Run Inside' : 'Short Pass', result: index % 5 === 0 ? 'Touchdown' : 'Gain',
      yardage: String(3 + (index % 17)), down: String((index % 4) + 1), distance: String(1 + (index % 12)),
      quarter: `Q${(index % 4) + 1}`, hash: ['Left', 'Middle', 'Right'][index % 3],
      defFront: '4-2-5', coverage: 'Cover 3', custom: [],
      players: { ballCarrier: '22', tackler: '55' }, grades: {},
    },
  }));
  store.addGame({ id: 'rc-2', name: 'Week 2 vs Tigers', status: 'active',
    gameInfo: { opponent: 'Tigers', date: '2026-09-08' },
    plays: [{ id: 1, timestamp: { start: 0, end: 4 }, tags: { unit: 'offense', formation: 'Ace', runPass: 'Pass', playType: 'Deep Pass', result: 'Gain', yardage: '22', down: '1', custom: [] } }] });
  await store.persist();
  await app.openGame('rc-1');
  // A populated plan so the Plan route measures real content too.
  const plan = store.createPlan('Rival Week');
  store.addPlanItem(plan.id, { kind: 'finding', label: 'Trips — Success Rate', refs: ['rc-1::1', 'rc-1::2'], query: { dimension: 'formation', measure: 'successRate', scope: 'season', group: 'Trips' } });
  store.addPlanItem(plan.id, { kind: 'note', label: 'Boundary emphasis on early downs', refs: [] });
  await store.persist();
});

/**
 * Elements are measured against the viewport, and an element is exempt when an
 * ancestor owns a horizontal scroll — that ancestor is the containment.
 */
const measure = async route => page.evaluate(routeId => {
  const doc = document.documentElement;
  const viewportWidth = doc.clientWidth;
  const host = document.querySelector(`#ws${routeId[0].toUpperCase()}${routeId.slice(1)}`) || document.querySelector(`.ws-${routeId}`);
  const scrollsHorizontally = node => {
    const style = getComputedStyle(node);
    return /(auto|scroll|hidden)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1;
  };
  /**
   * The exemption stops AT the route host, deliberately. Every route host is
   * itself a horizontal scroll container (the shell grid gives it `min-width:0`
   * plus its own overflow), so walking past it exempted every element in the
   * route and made this check vacuous — it reported 0 escapes because it could
   * not report any. Only a scroller the route puts INSIDE itself — the Study
   * pivot, the Plan strip — is legitimate containment; the route host scrolling
   * sideways is the clipping defect, not the fix for it.
   */
  const clipped = node => {
    let parent = node.parentElement;
    while (parent && parent !== host && parent !== document.body) {
      if (scrollsHorizontally(parent)) return true;
      parent = parent.parentElement;
    }
    return false;
  };
  const escapes = [];
  if (host) {
    for (const node of host.querySelectorAll('*')) {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (getComputedStyle(node).visibility === 'hidden') continue;
      if (rect.right <= viewportWidth + 1 && rect.left >= -1) continue;
      if (clipped(node)) continue;
      escapes.push({ tag: node.tagName.toLowerCase(), cls: (node.className || '').toString().slice(0, 48), right: Math.round(rect.right), left: Math.round(rect.left) });
    }
  }
  // Navigation landmarks: the left-edge clipping the installed smoke reported.
  const landmarks = ['.ws-side', '.ws-topbar', '.ws-mobile-head', '.ws-mobile-nav', '#wsContextSwitch']
    .map(selector => ({ selector, node: document.querySelector(selector) }))
    .filter(entry => entry.node && entry.node.getBoundingClientRect().width > 0)
    .map(entry => { const rect = entry.node.getBoundingClientRect(); return { selector: entry.selector, left: Math.round(rect.left), right: Math.round(rect.right) }; });
  return {
    hostFound: !!host,
    // A blank route cannot overflow, so every containment PASS below is only
    // worth anything if the route actually rendered something.
    nodes: host ? host.querySelectorAll('*').length : 0,
    text: host ? (host.innerText || '').trim().length : 0,
    pageOverflow: doc.scrollWidth > viewportWidth,
    scrollWidth: doc.scrollWidth, viewportWidth,
    escapes: escapes.slice(0, 6), escapeCount: escapes.length,
    clippedLandmarks: landmarks.filter(entry => entry.left < -1 || entry.right > viewportWidth + 1),
  };
}, route);

for (const viewport of VIEWPORTS) {
  console.log(`\n== ${viewport.name} ==`);
  await page.setViewport({ width: viewport.width, height: viewport.height });
  await new Promise(resolve => setTimeout(resolve, 220));
  for (const route of ROUTES) {
    await page.evaluate(routeId => window.app.workspaceShell.show(routeId), route);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await new Promise(resolve => setTimeout(resolve, 260));
    const result = await measure(route);
    ok(result.hostFound && result.nodes >= 10 && result.text >= 60,
      `${route} renders real content to measure at ${viewport.name}`, JSON.stringify({ nodes: result.nodes, text: result.text }));
    ok(result.hostFound && !result.pageOverflow, `${route} does not scroll the page horizontally at ${viewport.name}`, JSON.stringify(result));
    ok(result.escapeCount === 0, `${route} keeps every element inside the viewport at ${viewport.name}`, JSON.stringify(result.escapes));
    ok(result.clippedLandmarks.length === 0, `${route} keeps shell navigation unclipped at ${viewport.name}`, JSON.stringify(result.clippedLandmarks));
  }
}

// One stable, greppable statement of the whole matrix. The per-cell assertions
// above are named with template literals so a failure says exactly which route
// and viewport broke; this is the claim the capability inventory can resolve.
const matrixCells = VIEWPORTS.length * ROUTES.length;
ok(fail === 0 && pass >= matrixCells * 3,
  'Every shell route contains itself at every reviewed viewport including the installed window size',
  JSON.stringify({ cells: matrixCells, pass, fail }));

// Detector liveness. A containment suite that reports 0 escapes is only
// meaningful if it CAN report one, and if its scroll-container exemption does
// not swallow a genuine page-widening element. Both are proven here rather
// than assumed, on the route the installed smoke actually complained about.
console.log('\n== detector liveness ==');
await page.setViewport({ width: 1400, height: 860 });
await page.evaluate(() => window.app.workspaceShell.show('reports'));
await new Promise(resolve => setTimeout(resolve, 300));
const inject = markup => page.evaluate(async html => {
  const host = document.querySelector('#wsReports');
  const probe = document.createElement('div');
  probe.id = 'rcProbe';
  probe.innerHTML = html;
  host.appendChild(probe);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}, markup);
const clearProbe = () => page.evaluate(async () => {
  document.querySelector('#rcProbe')?.remove();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});

const baseline = await measure('reports');
await inject('<div style="width:3000px;height:20px"></div>');
const bare = await measure('reports');
await clearProbe();
// Same width, but owning its scroll — the correct pattern, and the one the
// Study pivot and the Plan strip use. It must NOT be reported.
await inject('<div style="overflow-x:auto;max-width:100%"><div style="width:3000px;height:20px"></div></div>');
const contained = await measure('reports');
await clearProbe();
const restored = await measure('reports');
ok(baseline.escapeCount === 0 && bare.escapeCount > 0,
  'The escape detector fires on a genuinely over-wide element (the check can fail)', JSON.stringify({ baseline: baseline.escapeCount, bare: bare.escapeCount, sample: bare.escapes[0] }));
ok(contained.escapeCount === 0 && restored.escapeCount === 0,
  'The same width inside its own scroll container is correctly exempt, and removing the probe restores clean', JSON.stringify({ contained: contained.escapeCount, restored: restored.escapeCount }));
// Worth stating plainly: route content cannot widen the DOCUMENT, because the
// shell grid gives every route `min-width:0` and its own overflow (the
// invariant added after the 1.12.0-13 blank-Reports failure). So the coach-
// visible UX-3 defect is CLIPPING, not a page scrollbar, and the per-element
// escape check above — not the page-overflow check — is what detects it.
ok(!bare.pageOverflow,
  'The shell contains an over-wide route child instead of letting it scroll the page', JSON.stringify({ pageOverflow: bare.pageOverflow, scrollWidth: bare.scrollWidth, viewportWidth: bare.viewportWidth }));

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
