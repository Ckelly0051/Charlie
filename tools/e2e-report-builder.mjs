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
    const def = (id, down, yardage, coverage, formationFamily, tackler, runPass = 'Run') =>
      ({ id, timestamp: { start: id, end: id + 4 }, notes: '', annotations: [], tags: tags({ unit: 'defense', down, distance: '10', runPass, playType: runPass === 'Run' ? 'Run Inside' : 'Short Pass', yardage, result: Number(yardage) < 0 ? 'Loss' : 'Gain', coverage, defFront: '4-3', formationFamily, players: { tackler } }) });
    first.plays = [
      off(1, '1', '10', 'Run', '6', 'Gain', 'Spread'), off(2, '2', '4', 'Pass', '5', 'Gain', 'Spread'), off(3, '1', '10', 'Run', '2', 'Gain', 'I-Form'),
      off(4, '2', '8', 'Pass', '0', 'Incomplete', 'Spread'), off(5, '3', '8', 'Run', '9', 'Gain', 'I-Form'), off(6, '3', '3', 'Pass', '20', 'Gain', 'Spread'),
      def(7, '1', '3', 'Cover 3', 'Trips', '5'), def(8, '2', '-2', 'Cover 1', 'Trips', '5'), def(9, '3', '12', 'Cover 3', 'Pro', '9', 'Pass'),
      // Neither run nor pass (a share is of the plays that hold a split value),
      // and one with no distance (outside Success Rate's eligible plays).
      { id: 10, timestamp: { start: 10, end: 14 }, notes: '', annotations: [], tags: tags({ unit: 'offense', down: '1', distance: '10', runPass: '', playType: '', yardage: '', result: 'Penalty', formationFamily: 'Spread' }) },
      { id: 11, timestamp: { start: 11, end: 15 }, notes: '', annotations: [], tags: tags({ unit: 'offense', down: '2', distance: '', runPass: 'Run', playType: 'Run Inside', yardage: '3', result: 'Gain', formationFamily: 'I-Form' }) },
      // Two fouls on one snap: each foul's group measures only its own record.
      { id: 12, timestamp: { start: 12, end: 16 }, notes: '', annotations: [], tags: tags({ unit: 'offense', down: '1', distance: '10', runPass: '', playType: '', yardage: '', result: 'Penalty', formationFamily: 'Spread' }),
        penalties: [
          { team: 'subject', phase: 'offense', foul: 'Holding', disposition: 'accepted', yards: 10, playCounts: false, player: '', automaticFirstDown: false, lossOfDown: false, notes: '', legacy: false },
          { team: 'subject', phase: 'offense', foul: 'Unsportsmanlike', disposition: 'accepted', yards: 15, playCounts: false, player: '', automaticFirstDown: false, lossOfDown: false, notes: '', legacy: false },
        ] },
    ];
    first.nextId = 13;
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
    const defShare = ['runShare', 'passShare'].map(id => b.measure(id, dPlays, { unit: 'defense' }));
    const turnovers = b.measure('turnovers', dPlays, { unit: 'defense' });
    const fouls = b.evaluate(b.constructor.normalizeWidget({ view: 'table', dimension: 'penaltyFoul', metrics: ['penaltiesUs', 'penaltyYardsUs'] }), plays, { ...ctx, unit: 'offense' })
      .rows.map(r => [r.label, r.cells.map(c => c.value), r.cells[0].refs]);
    // Accepted Holding and a declined Unsportsmanlike on one snap: a cell is
    // the records both its row and its column hold.
    const twoFouls = plays.find(p => p.id === 12);
    const mixed = { ...twoFouls, penalties: twoFouls.penalties.map(p => (p.foul === 'Unsportsmanlike' ? { ...p, disposition: 'declined' } : p)) };
    Object.defineProperty(mixed, '__gid', { value: twoFouls.__gid });
    const matrix = b.evaluate(b.constructor.normalizeWidget({ view: 'matrix', metric: 'penaltyYardsUs', dimension: 'penaltyFoul', dimension2: 'penaltyRuling' }), [mixed], { ...ctx, unit: 'offense' });
    const cells = Object.fromEntries(matrix.rows.flatMap(r => r.cells.map((c, i) => [`${r.value}|${matrix.columns[i].value}`, [c.n, c.value]])));
    const rulings = b.groups(plays, 'penaltyRuling').map(g => g.label);
    // Six play types on one down: four named, the rest Other; whole shares total 100.
    const types = ['Run Inside', 'Run Outside', 'Short Pass', 'Screen', 'RPO', 'Draw'];
    const six = plays.slice(0, 6).map((p, i) => { const c = { ...p, tags: { ...p.tags, down: '1', playType: types[i] } }; Object.defineProperty(c, '__gid', { value: p.__gid }); return c; });
    const fold = b.evaluate(b.constructor.normalizeWidget({ view: 'share', dimension: 'down', split: 'playType' }), six, { ...ctx, unit: 'offense' });
    const thirds = b.constructor.wholeShares([1, 1, 1]);
    const catalog = b.dimensionCatalog().flatMap(section => section.items.map(item => item.id));
    const kpi = b.evaluate(b.constructor.normalizeWidget({ view: 'kpi', metric: 'success' }), b.scopePlays({ ...offense, scope: 'game' }, ctx), { ...ctx, unit: 'offense', baselinePlays: plays, baselineLabel: 'Season' });
    return {
      total: plays.length, game, filtered,
      bar: bar.rows.map(r => [r.label, r.value, r.n, r.refs.length]), direct: direct.map(r => [r.value, r.denominator, r.refs]),
      barRefs: bar.rows.map(r => r.refs),
      share: share.rows.map(r => [r.label, r.parts.reduce((sum, p) => sum + p.share, 0)]), shareOrder: share.rows.map(r => r.parts.map(p => p.value).join('/')),
      trend: trend.rows.map(r => [r.label, r.value]),
      faced: faced.rows.map(r => [r.label, r.n]), leaders: leaders.rows.map(r => [r.label, r.metric]), board5: board?.roles.find(r => r.key === 'tackles')?.stats?.tkl?.n,
      kpi: { value: kpi.current.value, baseline: kpi.baseline?.value },
      defShare: defShare.map(m => [m.value, m.n, m.state]), turnovers: [turnovers.state, turnovers.reason], fouls, cells, rulings,
      fold: { keys: fold.keys, other: fold.keyLabels[fold.keys.at(-1)], parts: fold.rows[0].parts.map(p => [p.value, p.n, p.whole]) }, thirds,
      catalog: ['motionStart', 'motionEnd', 'rpoRead', 'rpoDecision', 'qbRun', 'missedTackles', 'penaltyRuling'].filter(id => !catalog.includes(id)),
    };
  });
  ok(model.total === 13 && model.game === 9 && model.filtered === 3, 'scope and filters: 13 offensive plays this season, 9 this game, 3 on 3rd down', model);
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
  ok(JSON.stringify(model.defShare) === JSON.stringify([[75, 4, 'ok'], [25, 4, 'ok']]),
    'a defense dashboard\'s Run % and Pass % read its own snaps: 3 runs and 1 pass faced', model.defShare);
  ok(model.turnovers[0] === 'unavailable' && model.turnovers[1] === 'Offense only', 'an offense-only measure on a defense dashboard reads Offense only, never zero', model.turnovers);
  ok(JSON.stringify(model.fouls.map(([label, values]) => [label, values])) === JSON.stringify([['Holding', [1, 10]], ['Unsportsmanlike', [1, 15]]])
    && model.fouls.every(([, , refs]) => refs.join() === model.fouls[0][2].join() && refs.length === 1),
    'a penalty group counts only its own foul: Holding 1 for 10 yards, Unsportsmanlike 1 for 15, each opening the one play', model.fouls);
  ok(model.cells['Holding|accepted']?.[0] === 1 && model.cells['Holding|accepted']?.[1] === 10 && model.cells['Holding|declined']?.[0] === 0
    && model.cells['Unsportsmanlike|accepted']?.[0] === 0 && model.cells['Unsportsmanlike|declined']?.[0] === 1,
    'a penalty matrix cell holds only the records in both its row and its column: accepted Holding is never in Declined', model.cells);
  ok(model.rulings.join() === 'Accepted', 'a penalty ruling reads as a label (Accepted), not the stored value', model.rulings);
  ok(model.fold.keys.length === 5 && model.fold.other === 'Other' && model.fold.parts.at(-1)[1] === 2
    && model.fold.parts.reduce((sum, p) => sum + p[2], 0) === 100,
    'a share past four values folds the rest into Other, and its labels total 100%', model.fold);
  ok(model.thirds.join() === '34,33,33', 'three equal shares read 34, 33 and 33, not 33 three times', model.thirds);
  ok(!model.catalog.length, 'motion path, RPO, QB run, missed tackles and penalty ruling are groupings', model.catalog);

  console.log('\n== Dashboards home ==');
  let ui = await page.evaluate(() => ({
    home: !!document.querySelector('[data-rb-home]'),
    templates: [...document.querySelectorAll('[data-rb-row^="template:"]')].map(n => n.dataset.rbRow.slice(9)),
    saved: document.querySelectorAll('[data-rb-home] [data-rb-row]:not([data-rb-row^="template:"])').length,
    picker: !!document.querySelector('[data-report-builder] select[aria-label="Dashboard"]'),
    scorebug: document.querySelector('[data-reports-scorebug]')?.hidden !== false, strip: document.querySelector('[data-reports-strip]')?.hidden === true,
    label: document.querySelector('[data-reports-special-label]')?.textContent,
  }));
  ok(ui.home && ui.templates.join() === 'offense,defense,situational,calls' && ui.saved === 0 && !ui.picker,
    'Dashboards opens on its home: the four templates, no saved dashboards yet, no dropdown', ui);
  ok(ui.scorebug && ui.strip && ui.label === 'Dashboards', 'Dashboards is a focused view: no score or report strip, Back to reports', ui);

  console.log('\n== A template is read-only ==');
  await page.click('[data-rb-row="template:offense"] .is-primary'); await settle();
  await page.evaluate(() => [...document.querySelectorAll('[aria-label="Scope"] button')].find(b => b.textContent === 'This game').click()); await settle();
  ui = await page.evaluate(() => ({ cards: document.querySelectorAll('[data-rb-widget]').length, tag: document.querySelector('.gi-rb-tag')?.textContent,
    stored: window.app.storage.seasonStore.data.dashboards.length, scope: window.app.reportsScreen.dashboards.active().scope,
    rename: [...document.querySelectorAll('.gi-rb-toolbar-actions button')].some(b => b.textContent === 'Rename') }));
  ok(ui.cards === 7 && ui.tag === 'Template' && ui.stored === 0 && ui.scope === 'game' && !ui.rename,
    'opening a template shows its seven widgets, marked Template; changing its scope saves nothing', ui);
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
  const resumed = await page.evaluate(() => { const r = window.app.reportsScreen; r.show(); return { open: !!document.querySelector('[data-rb-widget]'), tag: document.querySelector('.gi-rb-tag')?.textContent }; });
  ok(resumed.open && resumed.tag === 'Template', 'returning to Reports after watching film reopens the dashboard', resumed);
  await page.evaluate(() => { window.__prompt = window.app.tagger._promptDialog; window.app.tagger._promptDialog = async () => null; });
  await page.click('[data-rb-add-widget]'); await settle();
  ui = await page.evaluate(() => document.querySelector('[data-rb-save]')?.textContent);
  ok(ui === 'Save as new dashboard', 'adding a widget to a template offers Save as new dashboard', ui);
  await page.click('[data-rb-save]'); await settle();
  ui = await page.evaluate(() => ({ stored: window.app.storage.seasonStore.data.dashboards.length, cards: document.querySelectorAll('[data-rb-widget]').length, tag: document.querySelector('.gi-rb-tag')?.textContent }));
  ok(ui.stored === 0 && ui.cards === 7 && ui.tag === 'Template', 'cancelling the name saves nothing and leaves the template as it was', ui);
  await page.evaluate(() => { window.app.tagger._promptDialog = async () => 'My offense'; });
  await page.click('[data-rb-add-widget]'); await settle();
  await page.evaluate(() => [...document.querySelectorAll('[data-report-widget-editor] [aria-label="View"] button')].find(b => b.textContent === 'Table').click()); await settle();
  const preview = await page.evaluate(() => !!document.querySelector('[data-report-widget-editor] .gi-rb-table'));
  await page.click('[data-rb-save]'); await settle();
  ui = await page.evaluate(() => ({ cards: [...document.querySelectorAll('[data-rb-widget]')].map(n => n.dataset.rbView), dialog: !!document.querySelector('[data-report-widget-editor]'),
    stored: window.app.storage.seasonStore.data.dashboards.map(d => [d.name, d.widgets.length, d.scope]), tag: !!document.querySelector('.gi-rb-tag'),
    template: window.app.reportsScreen.dashboards.builder.constructor.TEMPLATES.find(t => t.id === 'offense').widgets.length }));
  ok(preview && ui.cards.length === 8 && ui.cards.at(-1) === 'table' && !ui.dialog && !ui.tag
    && JSON.stringify(ui.stored) === '[["My offense",8,"game"]]' && ui.template === 7,
    'a widget added to a template saves a new dashboard under the given name; the template keeps its seven widgets', { preview, ...ui });
  await page.evaluate(() => { window.app.tagger._promptDialog = window.__prompt; });

  console.log('\n== Building a dashboard ==');
  const lastId = await page.evaluate(() => [...document.querySelectorAll('[data-rb-widget]')].at(-1).dataset.rbWidget);
  await page.evaluate(id => window.app.reportsScreen.dashboards.resizeWidget(id, 's'), lastId); await settle();
  ok(await page.evaluate(id => document.querySelector(`[data-rb-widget="${id}"]`).classList.contains('is-w4'), lastId), 'a widget resizes to a third');
  await page.evaluate(id => window.app.reportsScreen.dashboards.moveWidget(id, -1), lastId); await settle();
  ok(await page.evaluate(id => [...document.querySelectorAll('[data-rb-widget]')].at(-2).dataset.rbWidget === id, lastId), 'a widget moves earlier');
  await page.evaluate(id => window.app.reportsScreen.dashboards.removeWidget(id), lastId); await settle();
  ok(await page.evaluate(() => document.querySelectorAll('[data-rb-widget]').length === 7), 'a widget is removed');
  await page.evaluate(() => window.app.reportsScreen.dashboards.setScope('season')); await settle();
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
  ok(/Down:\s*3rd/.test(ui.chip) && ui.total === '3 plays', 'a dashboard filter narrows every widget, and its chip reads 3rd', ui);
  await page.evaluate(() => [...document.querySelectorAll('[aria-label="Unit"] button')].find(b => b.textContent === 'Defense').click()); await settle();
  ok(await page.evaluate(() => document.querySelector('[data-report-builder]').classList.contains('is-defense')), 'Defense switches the dashboard to the defense framing and color');
  const stored = await page.evaluate(() => {
    const store = window.app.storage.seasonStore;
    const again = store.constructor.prototype._normalize.call(store, JSON.parse(store.json()));
    return { unit: store.data.dashboards[0].unit, filters: store.data.dashboards[0].filters, survives: again.dashboards?.[0]?.widgets?.length };
  });
  ok(stored.unit === 'defense' && stored.filters[0]?.values.join() === '3' && stored.survives === 7, 'the dashboard is saved with the season and survives a reload', stored);
  await page.click('[data-rb-home-link]'); await settle();
  ui = await page.evaluate(() => ({ home: !!document.querySelector('[data-rb-home]'),
    saved: [...document.querySelectorAll('[data-rb-home] [data-rb-row]:not([data-rb-row^="template:"]) strong')].map(n => n.textContent) }));
  ok(ui.home && ui.saved.join() === 'My offense', 'All dashboards returns to the home, listing the saved dashboard', ui);
  await page.click('[data-rb-home] [data-rb-row]:not([data-rb-row^="template:"]) .is-primary'); await settle();
  ok(await page.evaluate(() => document.querySelectorAll('[data-rb-widget]').length === 7 && !document.querySelector('.gi-rb-tag')), 'Open reopens the saved dashboard');

  console.log('\n== Season marks and export ==');
  const marks = await page.evaluate(async () => {
    const s = window.app.reportsScreen.dashboards;
    s.setFilter('down', []); s.setUnit('offense'); s.setScope('game');
    await new Promise(r => setTimeout(r, 250));
    const bar = s.evaluate(s.active()).widgets.find(w => w.view === 'bar');
    const engine = window.app.analyticsRegistry.metricsEngine(), ctx = s.context();
    const season = s.builder.scopePlays({ ...s.active(), scope: 'season' }, ctx).filter(p => p.tags.down === '1');
    return { marks: document.querySelectorAll('[data-rb-view="bar"] .gi-rb-bar-mark').length, rows: bar.rows.length,
      first: bar.rows[0].baseline, direct: engine.metric(season, 'successRate', {}, { allowUnlinkedPlays: true }).value };
  });
  ok(marks.marks === marks.rows && marks.first === marks.direct, 'This game marks each bar with its season value', marks);
  const exported = await page.evaluate(async () => {
    let saved = null;
    const original = window.ffaSaveBlob;
    window.ffaSaveBlob = (blob, name) => { saved = name; return true; };
    const html = await window.app.reportsScreen.dashboards.exportHtml();
    window.ffaSaveBlob = original;
    return { saved, length: html?.length || 0, title: /<title>My offense<\/title>/.test(html || ''), cards: (html?.match(/data-rb-widget=/g) || []).length, styled: /\.gi-rb-card\s*\{/.test(html || '') && /--gi-bd-panel\s*:/.test(html || '') && /46px\/1 var\(--gi-cond\)/.test(html || '') };
  });
  ok(exported.saved?.startsWith('dashboard_my_offense_') && exported.title && exported.cards === 7 && exported.styled,
    'Export saves one self-contained HTML file of the board with its styles', exported);

  console.log('\n== Views ==');
  const views = await page.evaluate(async () => {
    const s = window.app.reportsScreen.dashboards, B = s.builder.constructor;
    s._replace(B.fromTemplate('blank', 'Checks'));
    s.setScope('season'); s.setUnit('offense');
    s.saveWidget({ view: 'matrix', metric: 'penaltyYardsUs', dimension: 'penaltyFoul', dimension2: 'penaltyRuling', width: 'l' });
    s.saveWidget({ view: 'kpi', metric: 'touchdowns', width: 's' });
    await new Promise(r => setTimeout(r, 250));
    const calls = [];
    const nav = window.app.filmNavigation, original = nav.watch;
    nav.watch = (refs, opts) => { calls.push(opts?.label); return true; };
    document.querySelector('.gi-rb-matrix button.gi-rb-cell')?.click();
    nav.watch = original;
    const head = [...document.querySelectorAll('.gi-rb-matrix thead th')].map(n => n.textContent);
    const tile = document.querySelector('[data-rb-view="kpi"] .gi-rb-kpi-meta')?.textContent || '';
    const caption = document.querySelector('.gi-rb-matrix-wrap .gi-rb-muted')?.textContent || '';
    s.setUnit('defense');
    s.saveWidget({ view: 'bar', metric: 'yards', dimension: 'down', width: 'm' });
    // EPA is offense-only, so on defense every value is unavailable: no film, a dash.
    s.saveWidget({ view: 'table', metrics: ['epa'], dimension: 'down', width: 'm' });
    await new Promise(r => setTimeout(r, 250));
    const dashCell = document.querySelector('[data-rb-view="table"] span.gi-rb-cell');
    const dashBox = dashCell?.getBoundingClientRect(), rowBox = dashCell?.closest('tr').querySelector('th').getBoundingClientRect();
    const range = document.createRange(); if (dashCell) range.selectNodeContents(dashCell);
    const textBox = dashCell ? range.getBoundingClientRect() : null;
    const dash = dashCell ? { text: dashCell.textContent, offset: Math.round(Math.abs((textBox.top + textBox.bottom) / 2 - (dashBox.top + dashBox.bottom) / 2)) } : null;
    const neg = document.querySelector('[data-rb-view="bar"] .gi-rb-bars li.is-negative');
    const zero = neg?.querySelector('.gi-rb-bar-zero'), fill = neg?.querySelector('.gi-rb-bar-fill');
    const negative = neg ? { fillRight: Math.round(fill.getBoundingClientRect().right), zero: Math.round(zero.getBoundingClientRect().left), width: fill.getBoundingClientRect().width } : null;
    return { calls, head, tile, negative, caption, dash };
  });
  ok(views.calls.length === 1 && views.calls[0] === 'Holding × Accepted' && views.head.includes('Accepted'),
    'a heat-map cell watches under its row and column labels (Holding × Accepted)', views);
  ok(!/play/.test(views.tile), 'a count tile shows no repeated play count under the number', views.tile);
  ok(views.negative && views.negative.width > 4 && views.negative.fillRight <= views.negative.zero + 1,
    'a negative bar draws left of the zero line', views.negative);
  ok(!views.caption || !/across|Small numbers|faded/.test(views.caption), 'a heat map carries no explanatory sentence', views.caption);
  ok(views.dash && views.dash.offset <= 1, 'a value without film (a dash) sits on the row\'s text line', views.dash);
  const rich = await page.evaluate(() => { const S = window.app.studyScreen.constructor; return [S.richName('success', 'defense'), S.richName('success', 'offense')]; });
  ok(rich.join() === 'Stop Rate,Success Rate', 'Study names its success concept per unit: Stop Rate on defense', rich);
  await page.evaluate(async () => { const s = window.app.reportsScreen.dashboards; const id = s.active().id; window.app.tagger._confirmDialog = async () => true; await s.remove(id); s.open(s.list()[0].id); s.setUnit('offense'); s.setFilter('down', []); });
  await settle();

  console.log('\n== Styling ==');
  await page.evaluate(() => window.app.reportsScreen.dashboards.setScope('season')); await settle();
  const styling = await page.evaluate(() => {
    // Offense is selected and first: its right border is on top of Defense's
    // left border, which follows it and would otherwise paint over it.
    const pressed = [...document.querySelectorAll('[aria-label="Unit"] button')].find(b => b.getAttribute('aria-pressed') === 'true' && b.nextElementSibling);
    const box = pressed?.getBoundingClientRect();
    const onTop = box ? document.elementFromPoint(box.right - 0.5, box.top + box.height / 2) === pressed : false;
    return { onTop, pressed: pressed?.textContent };
  });
  ok(styling.onTop, 'the selected segment draws its whole outline above its neighbor', styling);
  await page.hover('.gi-rb-table tbody tr:first-child td:last-child'); await settle(100);
  const hover = await page.evaluate(() => {
    const row = document.querySelector('.gi-rb-table tbody tr:first-child');
    return { th: getComputedStyle(row.querySelector('th')).backgroundColor, td: getComputedStyle(row.querySelector('td')).backgroundColor };
  });
  ok(hover.th === hover.td && hover.th !== 'rgba(0, 0, 0, 0)', 'a hovered table row lights its label cell with the rest of the row', hover);
  await page.evaluate(() => window.app.reportsScreen.dashboards.setUnit('special')); await settle();
  const teal = await page.evaluate(() => getComputedStyle(document.querySelector('.gi-rb-card')).borderTopColor);
  ok(teal === 'rgb(127, 180, 191)', 'Special Teams dashboards use the teal accent', teal);
  await page.evaluate(() => window.app.reportsScreen.dashboards.setUnit('offense')); await settle();

  console.log('\n== Layout ==');
  await page.evaluate(() => { const s = window.app.reportsScreen.dashboards; s.setScope('season'); });
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
