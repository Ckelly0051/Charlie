/** Explosive-play terminology (docs/OPEN-DEFECTS.md, Coach Reports smoke
 *  Finding 3). A count is "Explosive Plays"; a percentage is "Explosive Plays
 *  Rate"; a defensive measure in an export or a mixed report says "Allowed".
 *  ON THE DEFENSE BOARD "Allowed" is implied and is NOT printed (review
 *  correction, 2026-09-23): it wrapped compact KPI tiles and table headers.
 *  Wording only: metric ids, thresholds, formulas, cohorts and stored data are
 *  untouched.
 *
 *  1. Source: no user-visible string literal names the metric with the bare
 *     "Explosive", "Explosives", "Explosive Rate"/"rate" or the "Expl"
 *     abbreviation. The explosive DRIVE classification is a different term and
 *     is the one allowed exception.
 *  2. Rendered, canonical 2025 JV (read-only, hash-checked): every Reports tab
 *     and every page of it, Defense and Special Teams at both scopes, and
 *     Study's metric picker. Every label naming the metric uses the approved
 *     wording; the Defense board says exactly "Explosive Plays" / "Explosive
 *     Plays Rate", its KPI label holds one line and its table headers keep
 *     44px; no such label is clipped or below 12.5px at 1440, 1280 and 768.
 *  3. Exports: the game, season, Defense, Special Teams and Self-Scout HTML
 *     reports carry the same wording, with Allowed on defensive tables.
 *  4. Sparse and empty: a one-play season and a zero-play game render the
 *     same wording with no clipping and no errors.
 */
import { APP_URL } from './app-entry.mjs';
import puppeteer from './test-browser.mjs';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { CANONICAL_SEASON } from './canonical-season.mjs';

const SOURCE = CANONICAL_SEASON;
if (!existsSync(SOURCE)) {
  if (process.env.GIQ_REALDATA_OPTIONAL === '1') {
    console.log(`SKIP: canonical season not present at ${SOURCE} (GIQ_REALDATA_OPTIONAL=1)`);
    console.log('== RESULT: 0 passed, 0 failed (skipped) ==');
    process.exit(0);
  }
  console.log(`FAIL: canonical Reports season missing at ${SOURCE}`);
  console.log('== RESULT: 0 passed, 1 failed ==');
  process.exit(1);
}

let pass = 0, fail = 0;
const ok = (c, label, detail = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* The approved vocabulary. Title-case labels, and the long-standing
   sentence-case row labels that already name a count ("Explosive runs
   allowed"). Anything else naming the metric is a violation. */
const APPROVED = /^(Explosive Plays( Allowed)?( Rate)?|Explosive (plays|runs|passes)( allowed)?)$/;
const MENTION = /\bexpl(osive|osives)?\b/i;

/* ── 1. Source scan ───────────────────────────────────────────────────── */
console.log('\n== 1. Source ==');
const bare = [];
for (const file of readdirSync('js').filter(f => /\.(js|jsx)$/.test(f))) {
  readFileSync(`js/${file}`, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const m of line.matchAll(/(['"`])(Expl|Explosives?|Explosive [Rr]ate|Explosives allowed|Explosive Plays allowed)\1/g)) {
      if (/driveType\s*=\s*'Explosive'/.test(line)) continue; // explosive DRIVE classification, a different term
      bare.push(`${file}:${i + 1}: ${m[0]}`);
    }
  });
}
ok(bare.length === 0, 'no source string names the metric with a bare or abbreviated label', bare.join(' | '));

const raw = readFileSync(SOURCE);
const before = createHash('sha256').update(raw).digest('hex');
const season = JSON.parse(raw.toString('utf8'));
// Old-format Special Teams values were blanked on 2026-09-26; the coach retags them.
const FIXTURE_HAS_ST = season.games.some(g => (g.plays || []).some(p => p.specialTeams));
const stPeter = season.games.find(g => /St\. Peter Lutheran/i.test(g.gameInfo?.opponent || ''));

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 240000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));

async function boot(width, height, data, gameId) {
  await page.setViewport({ width, height });
  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  await sleep(400);
  await page.evaluate(async (d, id) => {
    const app = window.app, store = app.storage.seasonStore;
    store.data = store._normalize(JSON.parse(JSON.stringify(d)));
    store.currentSeasonId = d.id; store.data.id = d.id; store.data.activeGameId = id;
    await app.storage._loadActiveGame();
    app.roster.players = JSON.parse(JSON.stringify(d.roster || []));
    app.workspaceShell.show('reports');
  }, data, gameId);
  await sleep(350);
}

/** Every visible element whose OWN text names the metric, with its fit. */
const collect = where => page.evaluate((mention, where) => {
  const re = new RegExp(mention.source, mention.flags);
  const out = [];
  for (const el of document.querySelectorAll('.gi-reports *, .ws-study *')) {
    if (el.tagName === 'tspan') continue; // read as part of its <text>
    /* An SVG label may wrap across tspans; it is ONE label. */
    const svgText = el.tagName === 'text';
    const own = (svgText ? [...el.querySelectorAll('tspan')].map(n => n.textContent).join(' ') || el.textContent
      : [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join(' ')).replace(/\s+/g, ' ').trim();
    if (!own || !re.test(own) || !el.getClientRects().length) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden') continue;
    let clipped;
    if (svgText) {
      /* SVG text never reports scroll overflow: measure it against its own
         chart's box instead, which is how a label is actually cut off. */
      const t = el.getBoundingClientRect(), s = el.ownerSVGElement.getBoundingClientRect();
      clipped = t.left < s.left - 0.5 || t.right > s.right + 0.5 || t.top < s.top - 0.5 || t.bottom > s.bottom + 0.5;
    } else {
      /* A table cell under table-layout:fixed overflows silently rather than
         growing, so any overflow in one is a clipped label. */
      const cell = /^(TH|TD)$/.test(el.tagName) || /^(TH|TD)$/.test(el.parentElement?.tagName || '');
      const box = cell && !/^(TH|TD)$/.test(el.tagName) ? el.parentElement : el;
      clipped = (cell || style.overflow !== 'visible') && box.scrollWidth > box.clientWidth + 1
        || el.scrollHeight > el.clientHeight + 1 && /hidden|clip/.test(style.overflowY);
    }
    out.push({ where, text: own, font: parseFloat(style.fontSize), svg: svgText,
      /* The Overview/Offense KPI micro-label is a recorded typography exception
         (docs/VISUAL-SYSTEM-RULES.md); its size is unchanged by this pass. */
      micro: !!el.closest('.gi-overview-kpi') && el.parentElement.classList.contains('gi-overview-kpi') && el.tagName === 'SPAN',
      clipped, defense: !!el.closest('.gi-def2'), sentence: own.split(' ').length > 5 });
  }
  const span = [...document.querySelectorAll('[data-def2-kpi] span')].find(n => /Explosive/.test(n.textContent));
  let kpi = null;
  if (span) {
    const range = document.createRange(); range.selectNodeContents(span);
    kpi = { text: span.textContent.trim(), lines: range.getClientRects().length };
  }
  const headers = [...document.querySelectorAll('.gi-def2-module thead tr')]
    .filter(tr => tr.textContent.includes('Explosive'))
    .map(tr => ({ where, module: tr.closest('[data-def2-module]')?.dataset.def2Module,
      h: Math.round(tr.getBoundingClientRect().height) }));
  return { where, labels: out, kpi, headers,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
}, { source: MENTION.source, flags: MENTION.flags }, where);

const tabs = ['overview', 'offense', 'defense', 'special', 'players', 'selfscout', 'matchup', 'season'];
async function click(selector) {
  await page.evaluate(s => {
    const control = document.querySelector(s);
    if (!control) throw new Error(`Missing Reports control: ${s}`);
    control.click();
  }, selector);
  await page.waitForFunction(s => {
    const control = document.querySelector(s);
    return control && (control.getAttribute('aria-selected') === 'true'
      || control.getAttribute('aria-pressed') === 'true'
      || control.getAttribute('aria-current') === 'page');
  }, { timeout: 5000 }, selector);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
/** One observation per page, including reports without a secondary bar. */
async function walkPages(where) {
  const found = [];
  const ids = await page.evaluate(() => [...document.querySelectorAll('[data-reports-secbar] [data-section]')].map(n => n.dataset.section));
  if (!ids.length) return [await collect(where)];
  for (const id of ids) {
    await click(`[data-reports-secbar] [data-section="${id}"]`);
    found.push(await collect(`${where}#${id}`));
  }
  return found;
}
async function crawl(width) {
  const found = [];
  for (const tab of tabs) {
    await click(`[data-report-tab="${tab}"]`);
    // Multi-section reports: every page a coach can open.
    found.push(...await walkPages(`${width}/${tab}`));
    if (tab === 'defense' || tab === 'special') {
      const scopeAttr = tab === 'defense' ? 'data-defense-scope' : 'data-st-scope';
      // Empty boards have no scope controls; require the named empty state,
      // rather than silently accepting a missing populated-board control.
      const hasScope = await page.$(`[${scopeAttr}="season"]`);
      if (!hasScope) {
        const empty = await page.evaluate(t => [...document.querySelectorAll('.gi-reports-empty h3')]
          .some(n => new RegExp(t === 'defense' ? '^No defensive snaps charted$' : 'special teams', 'i').test(n.textContent)), tab);
        if (!empty) throw new Error(`Missing ${tab} scope controls without its empty state`);
        continue;
      }
      await click(`[${scopeAttr}="season"]`);
      found.push(...await walkPages(`${width}/${tab}@season`));
      await click(`[${scopeAttr}="game"]`);
    }
  }
  return found;
}

/* ── 2. Rendered, canonical ───────────────────────────────────────────── */
console.log('\n== 2. Rendered, canonical 2025 JV ==');
for (const [w, h] of [[1440, 900], [1280, 800], [768, 1024]]) {
  await boot(w, h, season, stPeter.id);
  const observations = await crawl(w);
  const found = observations.flatMap(o => o.labels);
  // Pin the complete Defense visit matrix independently of the controls we discover.
  const defenseStates = ['performance', 'opponent', 'scheme', 'situations']
    .flatMap(id => [`${w}/defense#${id}`, `${w}/defense@season#${id}`]);
  ok(defenseStates.every(state => observations.filter(o => o.where === state).length === 1)
    && new Set(observations.map(o => o.where)).size === observations.length,
  `${w}: every Defense page/scope is observed exactly once, with no duplicate report states`);
  const labels = found.filter(f => !f.sentence);
  const wrong = labels.filter(f => !APPROVED.test(f.text));
  ok(labels.length >= 20, `${w}: the crawl reaches explosive-play labels across Reports (${labels.length})`, String(labels.length));
  ok(wrong.length === 0, `${w}: every label uses Explosive Plays / Explosive Plays Rate / Allowed`, JSON.stringify(wrong.slice(0, 6)));
  const def = labels.filter(f => f.defense);
  ok(def.length > 0 && def.every(f => /^Explosive Plays( Rate)?$/.test(f.text)),
    `${w}: every Defense-board label is "Explosive Plays" or "Explosive Plays Rate", Allowed implied (${def.length})`,
    JSON.stringify(def.filter(f => !/^Explosive Plays( Rate)?$/.test(f.text)).slice(0, 4)));
  /* The compact KPI tile: the label holds ONE line (18px line-height). With
     "Allowed" it took two and pushed its value down against its neighbors. */
  const kpiLabel = observations.find(o => o.where === `${w}/defense#performance`)?.kpi;
  ok(kpiLabel?.text === 'Explosive Plays' && kpiLabel.lines === 1,
    `${w}: the Defense KPI label reads "Explosive Plays" on one line`, JSON.stringify(kpiLabel));
  const clipped = found.filter(f => f.clipped);
  ok(clipped.length === 0, `${w}: no explosive-play label is clipped`, JSON.stringify(clipped.slice(0, 6)));
  const small = found.filter(f => f.font < 12.5 && !f.svg && !f.micro && !f.where.endsWith('/overview'));
  ok(small.length === 0, `${w}: no HTML explosive-play label is below the 12.5px floor (recorded micro-labels excepted)`, JSON.stringify(small.slice(0, 6)));
  const radar = found.filter(f => f.svg);
  ok(radar.length > 0 && radar.every(f => !f.clipped), `${w}: every chart label naming the metric sits inside its chart (${radar.length})`, JSON.stringify(radar.filter(f => f.clipped)));
  const overflow = observations.filter(o => o.overflow > 0);
  ok(overflow.length === 0, `${w}: no page-level horizontal overflow on any visited report state`, JSON.stringify(overflow.map(o => ({ where: o.where, overflow: o.overflow }))));
  /* The Defense board's module geometry is a contract: a 44px table header.
     A label that wraps to a third line grows it and pushes a fixed-height
     module's rows behind a scroller. Both scopes. */
  const headers = observations.flatMap(o => o.headers);
  ok(['defense#', 'defense@season#'].every(scope => headers.some(r => r.where.includes(scope))),
    `${w}: explosive table headers were measured in both Defense scopes`);
  const tall = headers.filter(r => r.h > 45);
  ok(tall.length === 0, `${w}: every Defense table header carrying the explosive label keeps its 44px height`, JSON.stringify(tall.slice(0, 6)));
}

/* Study: the metric picker names the concept the approved way. */
await page.evaluate(() => window.app.workspaceShell.show('study'));
await sleep(500);
const study = await page.evaluate(() => [...document.querySelectorAll('#wsStudyMeasure option')].map(o => o.textContent.trim()).filter(t => /expl/i.test(t)));
ok(study.length > 0 && study.every(t => APPROVED.test(t)), 'Study names the explosive concept "Explosive Plays Rate"', JSON.stringify(study));

/* ── 3. Exports ───────────────────────────────────────────────────────── */
console.log('\n== 3. Exports ==');
await boot(1440, 900, season, stPeter.id);
const exported = await page.evaluate(async () => {
  const app = window.app, saved = [], pending = [], original = window.ffaSaveBlob;
  window.ffaSaveBlob = (blob, name) => pending.push(blob.text().then(html => saved.push({ name, html })));
  const click = async (tab, sel) => { app.reportsScreen.selectTab(tab); await new Promise(r => setTimeout(r, 250)); document.querySelector(sel)?.click(); };
  try {
    app.storage.exportHtmlReport(app.stats);
    app.season.exportHtml();
    await click('defense', '[data-reports-secbar] [data-report-export="defense"]');
    await click('special', '[data-reports-secbar] [data-report-export="special"]');
    await click('selfscout', '[data-reports-secbar] [data-report-export="selfscout"]');
    await new Promise(r => setTimeout(r, 300));
    await Promise.all(pending);
  } finally { window.ffaSaveBlob = original; }
  return saved.map(({ name, html }) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const labels = [...doc.querySelectorAll('th, td, span, strong, div, dt, h3, h4, li')]
      .map(el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join(' ').replace(/\s+/g, ' ').trim())
      .filter(t => /\bexpl(osive|osives)?\b/i.test(t) && t.split(' ').length <= 5);
    return { name, labels: [...new Set(labels)] };
  });
});
// With no Special Teams snaps the Special Teams board offers no export (nothing to print).
ok(exported.length >= (FIXTURE_HAS_ST ? 5 : 4), `game, season, Defense${FIXTURE_HAS_ST ? ', Special Teams' : ''} and Self-Scout exports are produced`, JSON.stringify(exported.map(e => e.name)));
for (const e of exported) {
  const wrong = e.labels.filter(t => !APPROVED.test(t));
  ok(wrong.length === 0, `${e.name}: export labels use the approved wording (${e.labels.length})`, JSON.stringify(wrong));
}
const defExport = exported.find(e => /defens/i.test(e.name));
ok(!!defExport && defExport.labels.length > 0 && defExport.labels.every(t => /allowed/i.test(t)), 'the Defense export qualifies every explosive-play label with Allowed', JSON.stringify(defExport?.labels));
const gameExport = exported.find(e => !/^(season|special_teams|defens|self_scout)/i.test(e.name));
ok(!!gameExport && gameExport.labels.some(t => /Allowed/.test(t)) && gameExport.labels.some(t => !/allowed/i.test(t)),
  'the game export states both our Explosive Plays and the defense\'s Allowed', JSON.stringify(gameExport?.labels));

/* ── 4. Sparse and empty ──────────────────────────────────────────────── */
console.log('\n== 4. Sparse and empty ==');
const sparse = { id: 'expl-sparse', seasonName: 'Sparse QA', team: 'QA', year: 2026, level: 'JV', roster: [], games: [
  { id: 'g-one', name: 'One Play', nextId: 2, status: 'active', currentPlayId: 1, annotations: [], clipNames: [], isMultiClip: false,
    gameInfo: { opponent: 'Sparse', week: '1', date: '2026-09-01', scoreUs: '', scoreThem: '' },
    plays: [{ id: 1, timestamp: { start: 0, end: 5 }, notes: '', annotations: [], tags: { unit: 'offense', runPass: 'Run', playType: 'Run Inside', down: '1', distance: '10', quarter: 'Q1', custom: [], players: {}, grades: {} } }] },
  { id: 'g-zero', name: 'No Plays', nextId: 1, status: 'active', currentPlayId: null, annotations: [], clipNames: [], isMultiClip: false,
    gameInfo: { opponent: 'Empty', week: '2', date: '2026-09-08' }, plays: [] },
], activeGameId: 'g-one' };
for (const gameId of ['g-one', 'g-zero']) {
  for (const [w, h] of [[1440, 900], [768, 1024]]) {
    await boot(w, h, sparse, gameId);
    const found = (await crawl(`${gameId}@${w}`)).flatMap(o => o.labels);
    const wrong = found.filter(f => !f.sentence && !APPROVED.test(f.text));
    ok(wrong.length === 0 && found.every(f => !f.clipped), `${gameId} at ${w}: approved wording, nothing clipped (${found.length} labels)`, JSON.stringify([...wrong, ...found.filter(f => f.clipped)].slice(0, 4)));
  }
}

ok(errors.length === 0, 'no console or page errors', errors.slice(0, 3).join(' | '));
ok(createHash('sha256').update(readFileSync(SOURCE)).digest('hex') === before, 'canonical season file unchanged');
await browser.close();
console.log(`== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
