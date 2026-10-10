/* DASHBOARDS ----------------------------------------------------------------------
   docs/REPORTS-CONTRACTS.md > Dashboards. The coach's own reports, from
   templates or blank: views, metrics, groupings and filters, saved with the
   season. Every number comes from the existing formula owners and opens its
   film. Synthetic two-game season (always runs); the canonical season adds
   the real-data checks when present.

   Run after build:  node tools/e2e-report-builder.mjs */
import puppeteer from './test-browser.mjs';
import { APP_URL, gotoApp } from './app-entry.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { CANONICAL_SEASON } from './canonical-season.mjs';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra !== '' ? '  -- ' + JSON.stringify(extra) : ''}`); } };
const settle = (ms = 250) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 180000 });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 1440, height: 900 });
  await gotoApp(page, APP_URL);
  await page.evaluate(async () => {
    const app = window.app;
    await app.storage.createSeason({ name: 'Dashboards', team: 'DB', year: '2026' });
    const store = app.storage.seasonStore;
    const first = store.activeGame();
    first.gameInfo = { ...(first.gameInfo || {}), opponent: 'Alpha', perspective: 'offense' };
    const second = store.addGame();
    second.gameInfo = { ...(second.gameInfo || {}), opponent: 'Bravo', perspective: 'offense' };
    const tags = extra => ({ players: {}, grades: {}, custom: [], customFields: {}, fieldSide: 'own', yardLine: '30', ...extra });
    const off = (id, down, distance, runPass, yardage, result, formationFamily) =>
      ({ id, timestamp: { start: id, end: id + 4 }, notes: '', annotations: [], tags: tags({ unit: 'offense', down, distance, runPass, yardage, result, formationFamily, playType: runPass === 'Run' ? 'Run Inside' : 'Short Pass' }) });
    const def = (id, down, yardage, coverage, formationFamily, tackler) =>
      ({ id, timestamp: { start: id, end: id + 4 }, notes: '', annotations: [], tags: tags({ unit: 'defense', down, distance: '10', runPass: 'Run', playType: 'Run Inside', yardage, result: Number(yardage) < 0 ? 'Loss' : 'Gain', coverage, defFront: '4-3', formationFamily, players: { tackler } }) });
    first.plays = [
      off(1, '1', '10', 'Run', '6', 'Gain', 'Spread'), off(2, '2', '4', 'Pass', '5', 'Gain', 'Spread'), off(3, '1', '10', 'Run', '2', 'Gain', 'I-Form'),
      off(4, '2', '8', 'Pass', '0', 'Incomplete', 'Spread'), off(5, '3', '8', 'Run', '9', 'Gain', 'I-Form'), off(6, '3', '3', 'Pass', '20', 'Gain', 'Spread'),
      def(7, '1', '3', 'Cover 3', 'Trips', '5'), def(8, '2', '-2', 'Cover 1', 'Trips', '5'), def(9, '3', '12', 'Cover 3', 'Pro', '9'),
      // Neither run nor pass (a share is of the plays that hold a split value),
      // and one with no distance (outside Success Rate's eligible plays).
      { id: 10, timestamp: { start: 10, end: 14 }, notes: '', annotations: [], tags: tags({ unit: 'offense', down: '1', distance: '10', runPass: '', playType: '', yardage: '', result: 'Penalty', formationFamily: 'Spread' }) },
      { id: 11, timestamp: { start: 11, end: 15 }, notes: '', annotations: [], tags: tags({ unit: 'offense', down: '2', distance: '', runPass: 'Run', playType: 'Run Inside', yardage: '3', result: 'Gain', formationFamily: 'I-Form' }) },
    ];
    first.nextId = 12;
    second.plays = [
      off(1, '1', '10', 'Run', '4', 'Gain', 'Spread'), off(2, '2', '6', 'Run', '7', 'Gain', 'I-Form'), off(3, '1', '10', 'Pass', '15', 'Gain', 'Spread'),
      off(4, '3', '2', 'Run', '1', 'Gain', 'I-Form'), def(5, '1', '1', 'Cover 3', 'Trips', '5'),
    ];
    second.nextId = 6;
    store.setActive(first.id);
    await app.storage._loadActiveGame();
    window.__ids = { first: String(first.id), second: String(second.id) };
    await app.workspaceShell.show('reports');
  });
  await settle(400);

  console.log('\n== Model: every number from its owner, film-linked ==');
  const model = await page.evaluate(() => {
    const app = window.app, reports = app.reportsScreen;
    reports.openDashboards();
    const s = reports.dashboards, b = s.builder, ctx = s.context();
    const offense = b.constructor.normalize({ scope: 'season', unit: 'offense', widgets: [] });
    const plays = b.scopePlays(offense, ctx);
    const bar = b.evaluate(b.constructor.normalizeWidget({ view: 'bar', metric: 'success', dimension: 'down' }), plays, { ...ctx, unit: 'offense' });
    const engine = app.analyticsRegistry.metricsEngine();
    const direct = ['1', '2', '3'].map(down => engine.metric(plays.filter(p => p.tags.down === down), 'successRate', {}, { allowUnlinkedPlays: true }));
    const share = b.evaluate(b.constructor.normalizeWidget({ view: 'share', dimension: 'down', split: 'runPass' }), plays, { ...ctx, unit: 'offense' });
    const trend = b.evaluate(b.constructor.normalizeWidget({ view: 'trend', metric: 'yards' }), plays, { ...ctx, unit: 'offense' });
    const defense = b.constructor.normalize({ scope: 'season', unit: 'defense' });
    const dPlays = b.scopePlays(defense, ctx);
    const faced = b.evaluate(b.constructor.normalizeWidget({ view: 'bar', metric: 'success', dimension: 'formationFamily' }), dPlays, { ...ctx, unit: 'defense' });
    const leaders = b.evaluate(b.constructor.normalizeWidget({ view: 'leaders', leader: 'tackles' }), dPlays, { ...ctx, unit: 'defense' });
    const board = app.stats.playersBoard(dPlays).players.find(p => p.num === '5');
    const game = b.scopePlays({ ...offense, scope: 'game' }, ctx).length;
    const filtered = b.scopePlays({ ...offense, filters: [{ dimension: 'down', values: ['3'] }] }, ctx).length;
    const kpi = b.evaluate(b.constructor.normalizeWidget({ view: 'kpi', metric: 'success' }), b.scopePlays({ ...offense, scope: 'game' }, ctx), { ...ctx, unit: 'offense', baselinePlays: plays, baselineLabel: 'Season' });
    return {
      total: plays.length, game, filtered,
      bar: bar.rows.map(r => [r.label, r.value, r.n, r.refs.length]), direct: direct.map(r => [r.value, r.denominator, r.refs]),
      barRefs: bar.rows.map(r => r.refs),
      share: share.rows.map(r => [r.label, r.parts.reduce((sum, p) => sum + p.share, 0)]), shareOrder: share.rows.map(r => r.parts.map(p => p.value).join('/')),
      trend: trend.rows.map(r => [r.label, r.value]),
      faced: faced.rows.map(r => [r.label, r.n]), leaders: leaders.rows.map(r => [r.label, r.metric]), board5: board?.roles.find(r => r.key === 'tackles')?.stats?.tkl?.n,
      kpi: { value: kpi.current.value, baseline: kpi.baseline?.value },
    };
  });
  ok(model.total === 12 && model.game === 8 && model.filtered === 3, 'scope and filters: 12 offensive plays this season, 8 this game, 3 on 3rd down', model);
  ok(JSON.stringify(model.bar.map(r => [r[1], r[2]])) === JSON.stringify(model.direct.map(r => [r[0], r[1]])),
    'Success Rate by down equals AnalyticsMetrics on each down\'s plays', { bar: model.bar, direct: model.direct });
  ok(JSON.stringify(model.barRefs) === JSON.stringify(model.direct.map(r => r[2])), 'each bar opens exactly its metric\'s film refs', model.barRefs);
  ok(model.bar.map(r => r[0]).join() === '1st,2nd,3rd', 'downs read 1st, 2nd, 3rd', model.bar);
  ok(model.share.every(([, sum]) => Math.abs(sum - 100) < 0.2) && new Set(model.shareOrder.map(o => o.split('/')[0])).size === 1,
    'a Share row sums to 100% with its segments in one order', model);
  ok(JSON.stringify(model.trend.map(r => r[0])) === '["vs Alpha","vs Bravo"]', 'game by game reads each game by its opponent, in order', model.trend);
  ok(model.faced.length === 2 && model.faced.every(([, n]) => n > 0),
    'a defense dashboard groups by the offense it faced (report cut filters are offense-only)', model.faced);
  ok(model.leaders[0]?.[1] === model.board5 && model.leaders[0][0].startsWith('#5'), 'tackle leaders equal Players for the same plays', { leaders: model.leaders, board: model.board5 });
  ok(model.kpi.value != null && model.kpi.baseline != null, 'a This game number carries the season baseline', model.kpi);

  console.log('\n== Building a dashboard ==');
  let ui = await page.evaluate(() => ({
    start: !!document.querySelector('[data-rb-start]'), templates: [...document.querySelectorAll('[data-rb-template]')].map(b => b.dataset.rbTemplate),
    scorebug: document.querySelector('[data-reports-scorebug]')?.hidden !== false, strip: document.querySelector('[data-reports-strip]')?.hidden === true,
    label: document.querySelector('[data-reports-special-label]')?.textContent,
  }));
  ok(ui.start && ui.templates.join() === 'offense,defense,situational,calls,blank', 'Dashboards opens on the five starting templates', ui);
  ok(ui.scorebug && ui.strip && ui.label === 'Dashboards', 'Dashboards is a focused view: no score or report strip, Back to reports', ui);
  await page.click('[data-rb-template="offense"]'); await settle();
  ui = await page.evaluate(() => ({ cards: document.querySelectorAll('[data-rb-widget]').length, stored: window.app.storage.seasonStore.data.dashboards.map(d => [d.name, d.widgets.length]) }));
  ok(ui.cards === 7 && ui.stored.length === 1 && ui.stored[0][0] === 'Offense snapshot', 'a template becomes a saved dashboard with its seven widgets', ui);
  const watched = await page.evaluate(async () => {
    const calls = [];
    const nav = window.app.filmNavigation, original = nav.watch;
    nav.watch = (refs, opts) => { calls.push({ refs, label: opts?.label }); return true; };
    document.querySelector('[data-rb-view="bar"] .gi-rb-bar-track').click();
    nav.watch = original;
    const s = window.app.reportsScreen.dashboards;
    const bar = s.evaluate(s.active()).widgets.find(w => w.view === 'bar');
    return { calls, expected: bar.rows[0].refs };
  });
  ok(watched.calls.length === 1 && JSON.stringify(watched.calls[0].refs) === JSON.stringify(watched.expected), 'clicking a bar watches exactly its plays', watched);
  await page.click('[data-rb-add-widget]'); await settle();
  await page.evaluate(() => [...document.querySelectorAll('[data-report-widget-editor] [aria-label="View"] button')].find(b => b.textContent === 'Table').click()); await settle();
  const preview = await page.evaluate(() => !!document.querySelector('[data-report-widget-editor] .gi-rb-table'));
  await page.click('[data-rb-save]'); await settle();
  ui = await page.evaluate(() => ({ cards: [...document.querySelectorAll('[data-rb-widget]')].map(n => n.dataset.rbView), dialog: !!document.querySelector('[data-report-widget-editor]') }));
  ok(preview && ui.cards.length === 8 && ui.cards.at(-1) === 'table' && !ui.dialog, 'Add widget previews live and adds the table', { preview, ...ui });
  const lastId = await page.evaluate(() => [...document.querySelectorAll('[data-rb-widget]')].at(-1).dataset.rbWidget);
  await page.evaluate(id => window.app.reportsScreen.dashboards.resizeWidget(id, 's'), lastId); await settle();
  ok(await page.evaluate(id => document.querySelector(`[data-rb-widget="${id}"]`).classList.contains('is-w4'), lastId), 'a widget resizes to a third');
  await page.evaluate(id => window.app.reportsScreen.dashboards.moveWidget(id, -1), lastId); await settle();
  ok(await page.evaluate(id => [...document.querySelectorAll('[data-rb-widget]')].at(-2).dataset.rbWidget === id, lastId), 'a widget moves earlier');
  await page.evaluate(id => window.app.reportsScreen.dashboards.removeWidget(id), lastId); await settle();
  ok(await page.evaluate(() => document.querySelectorAll('[data-rb-widget]').length === 7), 'a widget is removed');
  await page.click('[data-rb-add-filter]'); await settle();
  await page.evaluate(() => {
    const picker = document.querySelector('[data-rb-filter-picker]');
    const select = picker.querySelector('select'); select.value = 'down'; select.dispatchEvent(new Event('change', { bubbles: true }));
  }); await settle();
  await page.evaluate(() => {
    const picker = document.querySelector('[data-rb-filter-picker]');
    [...picker.querySelectorAll('.gi-rb-check')].find(l => l.textContent.startsWith('3rd')).querySelector('input').click();
  }); await settle(100);
  await page.evaluate(() => [...document.querySelectorAll('[data-rb-filter-picker] button')].find(b => b.textContent === 'Apply').click()); await settle();
  ui = await page.evaluate(() => ({ chip: document.querySelector('[data-rb-filter="down"]')?.textContent || '', total: document.querySelector('.gi-rb-total')?.textContent }));
  ok(/Down:\s*3/.test(ui.chip) && ui.total === '3 plays', 'a dashboard filter narrows every widget: 3rd down, 3 plays', ui);
  await page.evaluate(() => [...document.querySelectorAll('[aria-label="Unit"] button')].find(b => b.textContent === 'Defense').click()); await settle();
  ok(await page.evaluate(() => document.querySelector('[data-report-builder]').classList.contains('is-defense')), 'Defense switches the dashboard to the defense framing and color');
  const stored = await page.evaluate(() => {
    const store = window.app.storage.seasonStore;
    const again = store.constructor.prototype._normalize.call(store, JSON.parse(store.json()));
    return { unit: store.data.dashboards[0].unit, filters: store.data.dashboards[0].filters, survives: again.dashboards?.[0]?.widgets?.length };
  });
  ok(stored.unit === 'defense' && stored.filters[0]?.values.join() === '3' && stored.survives === 7, 'the dashboard is saved with the season and survives a reload', stored);

  console.log('\n== Layout ==');
  await page.evaluate(() => { const s = window.app.reportsScreen.dashboards; s.setFilter('down', []); s.setUnit('offense'); });
  for (const [w, h] of [[1440, 900], [1280, 800], [768, 1024], [390, 844]]) {
    await page.setViewport({ width: w, height: h }); await settle(300);
    const geo = await page.evaluate(() => {
      const small = [];
      for (const el of document.querySelectorAll('[data-report-builder] *')) {
        if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
        if (!el.getClientRects().length) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < 12.5) small.push(`${el.tagName}.${el.className}:${size}`);
      }
      return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: small.slice(0, 5) };
    });
    ok(geo.overflow <= 0 && !geo.small.length, `${w}x${h}: no page overflow and no text under 12.5px`, geo);
  }
  await page.setViewport({ width: 1440, height: 900 });

  if (existsSync(CANONICAL_SEASON)) {
    console.log('\n== Canonical season ==');
    const season = JSON.parse(readFileSync(CANONICAL_SEASON, 'utf8'));
    const real = await page.evaluate(async data => {
      const app = window.app, store = app.storage.seasonStore;
      store.data = store._normalize(JSON.parse(JSON.stringify(data)));
      store.currentSeasonId = data.id; store.data.id = data.id;
      await app.storage._loadActiveGame();
      const s = app.reportsScreen.dashboards, b = s.builder, ctx = s.context();
      const defense = b.constructor.fromTemplate('defense');
      const result = s.evaluate(defense, ctx);
      const leaders = result.widgets.find(w => w.view === 'leaders').rows;
      const plays = b.scopePlays(defense, ctx);
      const board = app.stats.defenseBoard(app.season._allPlays(), {}).players;
      return { errors: result.widgets.filter(w => w.error).map(w => w.title), five: leaders.find(r => r.value === '5')?.metric,
        boardFive: board.find(r => String(r.num) === '5')?.tackles, cells: result.widgets.find(w => w.view === 'matrix').rows.flatMap(r => r.cells).filter(c => c.n).length, plays: plays.length };
    }, season);
    ok(!real.errors.length && real.plays === 174, 'the Defense snapshot measures all 174 canonical defensive plays without an error', real);
    ok(real.five === 40 && real.boardFive === 40, '#5 leads with 40 tackles, equal to the Defense board', real);
    ok(real.cells > 0, 'the coverage by down heat map fills on defense', real);
  } else if (process.env.GIQ_REALDATA_OPTIONAL === '1') {
    console.log('  SKIP  canonical season absent (GIQ_REALDATA_OPTIONAL=1)');
  } else {
    ok(false, 'canonical season present', CANONICAL_SEASON);
  }
  ok(!errors.length, 'no page or console errors', errors.slice(0, 5));
} finally {
  await browser.close();
}
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
