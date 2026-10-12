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
    // Each module carries its own unit, games and filters (smoke 116 findings 1-3).
    const W = value => b.constructor.normalizeWidget(value);
    const ev = (widget, context = ctx) => b.evaluate(W(widget), context);
    const only = list => ({ ...ctx, games: [{ id: 'only', label: 'only', plays: list }] });
    const offense = W({ view: 'kpi', unit: 'offense', scope: 'season' });
    const plays = b.scopePlays(offense, ctx);
    const bar = ev({ view: 'bar', metric: 'success', dimension: 'down', unit: 'offense' });
    const engine = app.analyticsRegistry.metricsEngine();
    const direct = ['1', '2', '3'].map(down => engine.metric(plays.filter(p => p.tags.down === down), 'successRate', {}, { allowUnlinkedPlays: true }));
    const share = ev({ view: 'share', dimension: 'down', split: 'runPass', unit: 'offense' });
    const trend = ev({ view: 'trend', metric: 'yards', unit: 'offense' });
    const dPlays = b.scopePlays(W({ view: 'kpi', unit: 'defense' }), ctx);
    const faced = ev({ view: 'bar', metric: 'success', dimension: 'formationFamily', unit: 'defense' });
    const leaders = ev({ view: 'leaders', leader: 'tackles', unit: 'defense' });
    const board = app.stats.playersBoard(dPlays).players.find(p => p.num === '5');
    const game = b.scopePlays({ ...offense, scope: 'game' }, ctx).length;
    const filtered = ev({ view: 'kpi', metric: 'plays', unit: 'offense', filters: [{ dimension: 'down', values: ['3'] }] }).total;
    // Two modules side by side: our offense and our defense, yards per play.
    const sideBySide = [ev({ view: 'kpi', metric: 'yards', unit: 'offense' }), ev({ view: 'kpi', metric: 'yards', unit: 'defense' })]
      .map(m => [m.unit, m.title, m.current.value]);
    const yppOff = b.measure('yards', plays, { unit: 'offense' }).value, yppDef = b.measure('yards', dPlays, { unit: 'defense' }).value;
    const defShare = ['runShare', 'passShare'].map(id => b.measure(id, dPlays, { unit: 'defense' }));
    const turnovers = b.measure('turnovers', dPlays, { unit: 'defense' });
    const fouls = ev({ view: 'table', dimension: 'penaltyFoul', metrics: ['penaltiesUs', 'penaltyYardsUs'], unit: 'offense' })
      .rows.map(r => [r.label, r.cells.map(c => c.value), r.cells[0].refs]);
    // Accepted Holding and a declined Unsportsmanlike on one snap: a cell is
    // the records both its row and its column hold.
    const twoFouls = plays.find(p => p.id === 12);
    const mixed = { ...twoFouls, penalties: twoFouls.penalties.map(p => (p.foul === 'Unsportsmanlike' ? { ...p, disposition: 'declined' } : p)) };
    Object.defineProperty(mixed, '__gid', { value: twoFouls.__gid });
    const matrix = ev({ view: 'matrix', metric: 'penaltyYardsUs', dimension: 'penaltyFoul', dimension2: 'penaltyRuling', unit: 'offense' }, only([mixed]));
    const cells = Object.fromEntries(matrix.rows.flatMap(r => r.cells.map((c, i) => [`${r.value}|${matrix.columns[i].value}`, [c.n, c.value]])));
    const rulings = b.groups(plays, 'penaltyRuling').map(g => g.label);
    // Six play types on one down: four named, the rest Other; whole shares total 100.
    const types = ['Run Inside', 'Run Outside', 'Short Pass', 'Screen', 'RPO', 'Draw'];
    const six = plays.slice(0, 6).map((p, i) => { const c = { ...p, tags: { ...p.tags, down: '1', playType: types[i] } }; Object.defineProperty(c, '__gid', { value: p.__gid }); return c; });
    const fold = ev({ view: 'share', dimension: 'down', split: 'playType', unit: 'offense' }, only(six));
    const thirds = b.constructor.wholeShares([1, 1, 1]);
    const catalog = b.dimensionCatalog().flatMap(section => section.items.map(item => item.id));
    const kpi = ev({ view: 'kpi', metric: 'success', unit: 'offense', scope: 'game' });
    return {
      total: plays.length, game, filtered, sideBySide, yppOff, yppDef,
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
  ok(model.total === 13 && model.game === 9 && model.filtered === 3, 'a module\'s own games and filters: 13 offensive plays this season, 9 this game, 3 on 3rd down', model);
  ok(model.sideBySide[0][0] === 'offense' && model.sideBySide[1][0] === 'defense' && model.sideBySide[1][1] === 'Yards Allowed / Play'
    && model.sideBySide[0][2] === model.yppOff && model.sideBySide[1][2] === model.yppDef && model.yppOff !== model.yppDef,
    'two modules on one canvas read our offense and our defense yards per play side by side', model.sideBySide);
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
    templateActions: [...document.querySelectorAll('[data-rb-row="template:offense"] .gi-rb-home-actions button')].map(n => n.textContent),
    saved: document.querySelectorAll('[data-rb-home] [data-rb-row]:not([data-rb-row^="template:"])').length,
    picker: !!document.querySelector('[data-report-builder] select[aria-label="Dashboard"]'),
    scorebug: document.querySelector('[data-reports-scorebug]')?.hidden !== false, strip: document.querySelector('[data-reports-strip]')?.hidden === true,
    special: document.querySelector('[data-reports-special-chrome]')?.hidden === true,
    newColor: getComputedStyle(document.querySelector('[data-rb-new]')).backgroundColor,
    nav: [...document.querySelectorAll('[data-rb-nav] button, [data-rb-nav] .gi-rb-nav-label')].map(n => n.textContent.trim()),
  }));
  ok(ui.home && ui.templates.join() === 'offense,defense,situational,calls' && ui.saved === 0 && !ui.picker,
    'Dashboards opens on its home: the four templates, no saved dashboards yet, no dropdown', ui);
  ok(ui.templateActions.join() === 'Open,Edit', 'a template row offers Open and Edit', ui.templateActions);
  ok(ui.scorebug && ui.strip && ui.special && ui.nav.join('|') === 'Dashboards|Go to reports',
    'Dashboards is a focused view: no score or report strip; its home strip offers only Go to reports', ui);
  ok((([r, g, bl]) => r === g && g === bl)(ui.newColor.match(/[0-9]+/g).map(Number)), 'New dashboard is a neutral button, not a unit color (coach, 2026-10-12)', ui.newColor);

  console.log('\n== A template is read-only ==');
  await page.click('[data-rb-row="template:offense"] [data-rb-action="open"]'); await settle();
  const board = () => page.evaluate(() => ({
    cards: document.querySelectorAll('[data-rb-widget]').length, tag: document.querySelector('.gi-rb-tag')?.textContent,
    stored: window.app.storage.seasonStore.data.dashboards.length,
    toolbar: [...document.querySelectorAll('.gi-rb-toolbar-actions button')].map(b => b.textContent),
    cardEdit: document.querySelectorAll('[data-rb-widget] .gi-rb-card-actions button, [data-rb-widget] .gi-rb-menu').length,
    dashboardControls: document.querySelectorAll('[data-report-builder] > .gi-rb-filters, [data-report-builder] [aria-label="Unit"], [data-report-builder] [aria-label="Scope"]').length,
    scopes: [...document.querySelectorAll('[data-rb-widget] .gi-rb-card-scope')].map(n => n.textContent),
    name: document.querySelector('.gi-rb-title h2')?.textContent,
  }));
  ui = await board();
  ok(ui.cards === 7 && ui.tag === 'Template' && ui.stored === 0 && !ui.toolbar.includes('Rename') && ui.toolbar.includes('Edit')
    && !ui.toolbar.includes('Add module') && ui.cardEdit === 0 && ui.dashboardControls === 0,
    'opening a template shows its seven modules, marked Template, with Edit and no dashboard-wide unit, games or filters', ui);
  ok(ui.scopes.length === 7 && ui.scopes.every(text => text === 'Offense · Season'), 'each module card names its own unit and games', ui.scopes);
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
  await page.click('[data-rb-edit]'); await settle();
  ui = await board();
  ok(ui.stored === 0 && ui.cards === 7 && ui.tag === 'Template', 'Edit on a template asks for a name; cancelling saves nothing and leaves the template as it was', ui);
  await page.evaluate(() => { window.app.tagger._promptDialog = async () => 'My offense'; });
  await page.click('[data-rb-edit]'); await settle();
  ui = await board();
  ok(ui.stored === 1 && ui.name === 'My offense' && !ui.tag && ui.toolbar.includes('Add module') && ui.toolbar.includes('Done') && ui.cardEdit > 0,
    'Edit on a template saves a new dashboard under the given name and opens it to edit', ui);

  console.log('\n== Building a canvas ==');
  await page.click('[data-rb-add-widget]'); await settle();
  await page.evaluate(() => {
    const editor = document.querySelector('[data-report-widget-editor]');
    const pick = (label, text) => [...editor.querySelectorAll(`[aria-label="${label}"] button`)].find(b => b.textContent === text).click();
    pick('Unit', 'Defense'); pick('Games', 'This game');
  }); await settle();
  await page.evaluate(() => [...document.querySelectorAll('[data-report-widget-editor] [aria-label="View"] button')].find(b => b.textContent === 'Table').click()); await settle();
  const editor = await page.evaluate(() => ({ preview: !!document.querySelector('[data-report-widget-editor] .gi-rb-table'),
    editorUnit: document.querySelector('[data-report-widget-editor]').classList.contains('is-defense'),
    previewUnit: document.querySelector('[data-report-widget-editor] .gi-rb-card')?.classList.contains('is-defense') }));
  await page.click('[data-rb-save]'); await settle();
  ui = await page.evaluate(() => {
    const last = [...document.querySelectorAll('[data-rb-widget]')].at(-1);
    return { cards: document.querySelectorAll('[data-rb-widget]').length, dialog: !!document.querySelector('[data-report-widget-editor]'),
      stored: window.app.storage.seasonStore.data.dashboards.map(d => [d.name, d.widgets.length, d.widgets.at(-1).unit, d.widgets.at(-1).scope]),
      lastUnit: last.dataset.rbUnit, lastScope: last.querySelector('.gi-rb-card-scope')?.textContent,
      colors: [getComputedStyle(document.querySelector('[data-rb-widget]')).borderTopColor, getComputedStyle(last).borderTopColor],
      template: window.app.reportsScreen.dashboards.builder.constructor.TEMPLATES.find(t => t.id === 'offense').widgets.length };
  });
  ok(editor.preview && editor.editorUnit && editor.previewUnit, 'the module editor picks its own unit and games, and its preview takes the unit color', editor);
  ok(ui.cards === 8 && !ui.dialog && JSON.stringify(ui.stored) === '[["My offense",8,"defense","game"]]' && ui.template === 7,
    'a defense, this-game module joins the offense modules on one canvas; the template keeps its seven', ui);
  ok(ui.lastUnit === 'defense' && ui.lastScope === 'Defense · This game' && ui.colors[0] === 'rgb(217, 162, 26)' && ui.colors[1] === 'rgb(18, 169, 203)',
    'each card takes its own module\'s color: offense gold beside defense cyan', ui);
  const lastId = await page.evaluate(() => [...document.querySelectorAll('[data-rb-widget]')].at(-1).dataset.rbWidget);
  await page.evaluate(id => window.app.reportsScreen.dashboards.resizeWidget(id, 's'), lastId); await settle();
  ok(await page.evaluate(id => document.querySelector(`[data-rb-widget="${id}"]`).classList.contains('is-w4'), lastId), 'a module resizes to a third');
  await page.evaluate(id => window.app.reportsScreen.dashboards.moveWidget(id, -1), lastId); await settle();
  ok(await page.evaluate(id => [...document.querySelectorAll('[data-rb-widget]')].at(-2).dataset.rbWidget === id, lastId), 'a module moves earlier');
  // A module filter narrows that module only.
  const filtered = await page.evaluate(async () => {
    const s = window.app.reportsScreen.dashboards, first = s.active().widgets[0];
    s.saveWidget({ ...first, filters: [{ dimension: 'down', values: ['3'] }] });
    await new Promise(r => setTimeout(r, 250));
    const totals = [...document.querySelectorAll('[data-rb-widget] .gi-rb-card-actions .gi-rb-muted')].map(n => n.textContent);
    return { first: totals[0], second: totals[1] };
  });
  ok(filtered.first === '3 plays' && filtered.second === '13 plays', 'a module filter narrows that module only (3rd down: 3 plays; its neighbor keeps 13)', filtered);
  const stored = await page.evaluate(() => {
    const store = window.app.storage.seasonStore;
    const again = store.constructor.prototype._normalize.call(store, JSON.parse(store.json()));
    const d = again.dashboards?.[0];
    return { keys: Object.keys(store.data.dashboards[0]).sort().join(), units: d?.widgets?.map(w => w.unit), filters: d?.widgets?.[0]?.filters };
  });
  ok(stored.keys === 'id,name,version,widgets' && stored.units?.length === 8 && stored.units.includes('defense') && stored.filters?.[0]?.values.join() === '3',
    'the canvas is saved with the season, each module with its own unit and filters, and survives a reload', stored);
  await page.click('[data-rb-done]'); await settle();
  ui = await board();
  ok(ui.cardEdit === 0 && ui.toolbar.includes('Edit') && !ui.toolbar.includes('Add module'), 'Done shows the dashboard without its edit controls', ui);
  await page.click('[data-rb-home-link]'); await settle();
  ui = await page.evaluate(() => {
    const row = document.querySelector('[data-rb-home] [data-rb-row]:not([data-rb-row^="template:"])');
    return { home: !!document.querySelector('[data-rb-home]'), name: row?.querySelector('strong')?.textContent, detail: row?.querySelector('span')?.textContent,
      actions: [...(row?.querySelectorAll('.gi-rb-home-actions button') || [])].map(n => n.textContent), mixed: row?.classList.contains('is-all') };
  });
  ok(ui.home && ui.name === 'My offense' && ui.actions.join() === 'Open,Edit,Export,Rename,Duplicate,Delete',
    'Back to dashboards lists the saved dashboard with Open, Edit, Export, Rename, Duplicate and Delete on the picker page', ui);
  ok(ui.detail === 'Offense, Defense · 8 modules' && ui.mixed, 'a dashboard mixing units is listed by its units and drawn neutral', ui);
  await page.click('[data-rb-home] [data-rb-row]:not([data-rb-row^="template:"]) [data-rb-action="edit"]'); await settle();
  ok((await board()).toolbar.includes('Add module'), 'Edit on the picker page opens the dashboard to edit');
  await page.click('[data-rb-home-link]'); await settle();
  await page.click('[data-rb-home] [data-rb-row]:not([data-rb-row^="template:"]) [data-rb-action="open"]'); await settle();
  ok(await page.evaluate(() => document.querySelectorAll('[data-rb-widget]').length === 8 && !document.querySelector('.gi-rb-tag') && !document.querySelector('[data-rb-add-widget]')),
    'Open shows the saved dashboard, not to edit');
  // The Dashboards strip (smoke 115 findings 1-2).
  const strip = async () => page.evaluate(() => {
    const nav = document.querySelector('[data-rb-nav]'), box = n => n?.getBoundingClientRect();
    const back = box(nav.querySelector('[data-rb-home-link]')), next = box(nav.querySelector('[data-rb-next]')), reports = box(nav.querySelector('[data-rb-to-reports]'));
    return { labels: [...nav.querySelectorAll('button')].map(n => n.textContent.trim()), prev: nav.querySelector('[data-rb-prev]').disabled,
      next: nav.querySelector('[data-rb-next]').disabled, name: document.querySelector('.gi-rb-title h2')?.textContent,
      gapToReports: Math.round(reports.left - next.right), gapToStep: Math.round(box(nav.querySelector('[data-rb-prev]')).left - back.right),
      titleBack: !!document.querySelector('.gi-rb-title button'), prevColor: getComputedStyle(nav.querySelector('[data-rb-prev]')).color, special: document.querySelector('[data-reports-special-chrome]')?.hidden };
  });
  ui = await strip();
  ok(ui.labels.join('|') === 'Back to dashboards|Prev|Next|Go to reports' && !ui.titleBack && ui.special === true,
    'inside a dashboard the strip reads Back to dashboards, Prev, Next, Go to reports; the title has no back button', ui);
  ok(ui.gapToReports >= 48 && ui.gapToStep >= 24, 'Go to reports sits apart from Prev / Next, and Prev / Next apart from Back', ui);
  ok(ui.prev === true && ui.next === false && ui.name === 'My offense', 'the first saved dashboard has no Prev', ui);
  ok((([r, g, bl]) => r === g && g === bl)(ui.prevColor.match(/\d+/g).map(Number)), 'a disabled Prev stays grey, not the blue accent', ui.prevColor);
  await page.click('[data-rb-next]'); await settle();
  ui = await strip();
  ok(ui.name === 'Offense snapshot' && ui.prev === false, 'Next steps from the last saved dashboard to the first template', ui);
  await page.click('[data-rb-prev]'); await settle();
  ok((await strip()).name === 'My offense', 'Prev steps back to the saved dashboard');
  await page.click('[data-rb-to-reports]'); await settle();
  ui = await page.evaluate(() => ({ dashboards: !!document.querySelector('[data-report-builder]'), main: !!document.querySelector('[data-native-main-report]') }));
  ok(!ui.dashboards && ui.main, 'Go to reports leaves Dashboards for the report tabs', ui);
  await page.evaluate(() => window.app.reportsScreen.openDashboards({ resume: true })); await settle();

  console.log('\n== Season marks and export ==');
  const marks = await page.evaluate(async () => {
    const s = window.app.reportsScreen.dashboards;
    s._replace(s.builder.constructor.fromTemplate('blank', 'Marks'), { open: true, editing: true });
    s.saveWidget({ view: 'bar', metric: 'success', dimension: 'down', unit: 'offense', scope: 'game', width: 'm' });
    await new Promise(r => setTimeout(r, 250));
    const bar = s.evaluate(s.active()).widgets[0];
    const engine = window.app.analyticsRegistry.metricsEngine(), ctx = s.context();
    const season = s.builder.scopePlays({ unit: 'offense', scope: 'season' }, ctx).filter(p => p.tags.down === '1');
    return { marks: document.querySelectorAll('[data-rb-view="bar"] .gi-rb-bar-mark').length, rows: bar.rows.length,
      first: bar.rows[0].baseline, direct: engine.metric(season, 'successRate', {}, { allowUnlinkedPlays: true }).value };
  });
  ok(marks.marks === marks.rows && marks.first === marks.direct, 'a This game module marks each bar with its season value', marks);
  const exported = await page.evaluate(async () => {
    let saved = null;
    const original = window.ffaSaveBlob;
    window.ffaSaveBlob = (blob, name) => { saved = name; return true; };
    const s = window.app.reportsScreen.dashboards;
    s.home();
    await new Promise(r => setTimeout(r, 150));
    const id = s.list().find(d => d.name === 'My offense').id;
    const html = await s.exportDashboard(id);
    window.ffaSaveBlob = original;
    await new Promise(r => setTimeout(r, 150));
    return { saved, home: !!document.querySelector('[data-rb-home]'), title: /<title>My offense<\/title>/.test(html || ''), cards: (html?.match(/data-rb-widget=/g) || []).length,
      styled: /\.gi-rb-card\s*\{/.test(html || '') && /--gi-bd-panel\s*:/.test(html || '') && /46px\/1 var\(--gi-cond\)/.test(html || '') };
  });
  ok(exported.saved?.startsWith('dashboard_my_offense_') && exported.title && exported.cards === 8 && exported.styled && exported.home,
    'Export on the picker page saves one self-contained HTML file of the dashboard and stays on the picker page', exported);

  console.log('\n== Delete asks for the typed word ==');
  const deleting = await page.evaluate(async () => {
    const s = window.app.reportsScreen.dashboards;
    const id = s.list().find(d => d.name === 'Marks').id;
    const pending = s.remove(id);
    await new Promise(r => setTimeout(r, 200));
    const input = document.querySelector('.gi-confirm-delete [name="confirm"]');
    const button = document.querySelector('.gi-confirm-delete button.is-danger');
    const before = { input: !!input, armed: button && !button.disabled, impact: document.querySelector('.gi-confirm-delete p')?.textContent };
    input.value = 'delete'; input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 100));
    const armed = !button.disabled;
    button.click();
    const result = await pending;
    return { before, armed, result, left: s.list().map(d => d.name) };
  });
  ok(deleting.before.input && !deleting.before.armed && deleting.armed && deleting.result === true && deleting.left.join() === 'My offense'
    && /1 module will be removed/.test(deleting.before.impact || ''),
    'Delete names what goes and stays disabled until "delete" is typed, as deleting a game or season does', deleting);
  await page.evaluate(() => { window.app.tagger._promptDialog = window.__prompt; });

  console.log('\n== Views ==');
  const views = await page.evaluate(async () => {
    const s = window.app.reportsScreen.dashboards, B = s.builder.constructor;
    s._replace(B.fromTemplate('blank', 'Checks'), { open: true, editing: true });
    const add = widget => s.saveWidget({ unit: 'offense', scope: 'season', ...widget });
    add({ view: 'matrix', metric: 'penaltyYardsUs', dimension: 'penaltyFoul', dimension2: 'penaltyRuling', width: 'l' });
    add({ view: 'kpi', metric: 'touchdowns', width: 's' });
    await new Promise(r => setTimeout(r, 250));
    const calls = [];
    const nav = window.app.filmNavigation, original = nav.watch;
    nav.watch = (refs, opts) => { calls.push(opts?.label); return true; };
    document.querySelector('.gi-rb-matrix button.gi-rb-cell')?.click();
    nav.watch = original;
    const head = [...document.querySelectorAll('.gi-rb-matrix thead th')].map(n => n.textContent);
    const tile = document.querySelector('[data-rb-view="kpi"] .gi-rb-kpi-meta')?.textContent || '';
    const caption = document.querySelector('.gi-rb-matrix-wrap .gi-rb-muted')?.textContent || '';
    add({ view: 'trend', metric: 'success', unit: 'special', width: 'l' });
    add({ view: 'bar', metric: 'yards', dimension: 'down', unit: 'defense', width: 'm' });
    // EPA is offense-only, so on defense every value is unavailable: no film, a dash.
    add({ view: 'table', metrics: ['epa'], dimension: 'down', unit: 'defense', width: 'm' });
    await new Promise(r => setTimeout(r, 250));
    const trendText = document.querySelector('[data-rb-view="trend"] .gi-rb-empty')?.textContent || '';
    const dashCell = document.querySelector('[data-rb-view="table"] span.gi-rb-cell');
    const dashBox = dashCell?.getBoundingClientRect();
    const range = document.createRange(); if (dashCell) range.selectNodeContents(dashCell);
    const textBox = dashCell ? range.getBoundingClientRect() : null;
    const dash = dashCell ? { text: dashCell.textContent, offset: Math.round(Math.abs((textBox.top + textBox.bottom) / 2 - (dashBox.top + dashBox.bottom) / 2)) } : null;
    const neg = document.querySelector('[data-rb-view="bar"] .gi-rb-bars li.is-negative');
    const zero = neg?.querySelector('.gi-rb-bar-zero'), fill = neg?.querySelector('.gi-rb-bar-fill');
    const negative = neg ? { fillRight: Math.round(fill.getBoundingClientRect().right), zero: Math.round(zero.getBoundingClientRect().left), width: fill.getBoundingClientRect().width } : null;
    const teal = getComputedStyle(document.querySelector('[data-rb-unit="special"]')).borderTopColor;
    // Success / Stop Rate bars run 0-100%; other rates scale to the largest bar.
    add({ view: 'bar', metric: 'success', dimension: 'down', width: 'm' });
    add({ view: 'bar', metric: 'yards', dimension: 'down', width: 'm' });
    await new Promise(r => setTimeout(r, 250));
    const barsOf = name => [...document.querySelectorAll('[data-rb-view="bar"]')].find(n => n.querySelector('h3')?.textContent.startsWith(name));
    const fillPct = li => { const t = li.querySelector('.gi-rb-bar-track').getBoundingClientRect(), f = li.querySelector('.gi-rb-bar-fill').getBoundingClientRect(); return Math.round(f.width / t.width * 100); };
    const rowsOf = view => [...(view?.querySelectorAll('.gi-rb-bars li') || [])].map(li => ({ value: parseFloat(li.querySelector('.gi-rb-bar-value').textContent), fill: fillPct(li) }));
    const scale = { success: rowsOf(barsOf('Success Rate')), yards: rowsOf(barsOf('Yards / Play')) };
    return { calls, head, tile, negative, caption, dash, trendText, scale, teal };
  });
  // The fixture's largest success rate is under 100%, so a bar scaled to it would overfill.
  const successRows = views.scale.success.filter(r => Number.isFinite(r.value));
  ok(successRows.length >= 2 && Math.max(...successRows.map(r => r.value)) < 95 && successRows.every(r => Math.abs(r.fill - r.value) <= 2),
    'a Success Rate bar fills its own percent of a 0-100% track', views.scale.success);
  const yardRows = views.scale.yards.filter(r => Number.isFinite(r.value) && r.value > 0);
  ok(yardRows.length >= 2 && Math.max(...yardRows.map(r => r.fill)) >= 98,
    'any other metric (Yards / Play) scales to the largest bar', views.scale.yards);
  ok(views.calls.length === 1 && views.calls[0] === 'Holding × Accepted' && views.head.includes('Accepted'),
    'a heat-map cell watches under its row and column labels (Holding × Accepted)', views);
  ok(!/play/.test(views.tile), 'a count tile shows no repeated play count under the number', views.tile);
  ok(views.negative && views.negative.width > 4 && views.negative.fillRight <= views.negative.zero + 1,
    'a negative bar draws left of the zero line', views.negative);
  ok(!views.caption || !/across|Small numbers|faded/.test(views.caption), 'a heat map carries no explanatory sentence', views.caption);
  ok(views.trendText === 'Choose Offense or Defense', 'a game-by-game metric the unit cannot read says why, not "no games"', views.trendText);
  ok(views.dash && views.dash.offset <= 1, 'a value without film (a dash) sits on the row\'s text line', views.dash);
  ok(views.teal === 'rgb(127, 180, 191)', 'a Special Teams module uses the teal accent', views.teal);
  const rich = await page.evaluate(() => { const S = window.app.studyScreen.constructor; return [S.richName('success', 'defense'), S.richName('success', 'offense')]; });
  ok(rich.join() === 'Stop Rate,Success Rate', 'Study names its success concept per unit: Stop Rate on defense', rich);

  console.log('\n== Styling ==');
  await page.click('[data-rb-add-widget]'); await settle();
  const styling = await page.evaluate(() => {
    // Offense is selected and first: its right border is on top of Defense's
    // left border, which follows it and would otherwise paint over it.
    const pressed = [...document.querySelectorAll('[data-report-widget-editor] [aria-label="Unit"] button')].find(b => b.getAttribute('aria-pressed') === 'true' && b.nextElementSibling);
    const box = pressed?.getBoundingClientRect();
    const onTop = box ? document.elementFromPoint(box.right - 0.5, box.top + box.height / 2) === pressed : false;
    return { onTop, pressed: pressed?.textContent };
  });
  ok(styling.onTop, 'the selected segment draws its whole outline above its neighbor', styling);
  await page.evaluate(() => [...document.querySelectorAll('[data-report-widget-editor] button')].find(b => b.textContent === 'Cancel').click()); await settle();
  await page.hover('.gi-rb-table tbody tr:first-child td:last-child'); await settle(100);
  const hover = await page.evaluate(() => {
    const row = document.querySelector('.gi-rb-table tbody tr:first-child');
    return { th: getComputedStyle(row.querySelector('th')).backgroundColor, td: getComputedStyle(row.querySelector('td')).backgroundColor };
  });
  ok(hover.th === hover.td && hover.th !== 'rgba(0, 0, 0, 0)', 'a hovered table row lights its label cell with the rest of the row', hover);

  console.log('\n== Layout ==');
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
  await page.evaluate(() => window.app.reportsScreen.dashboards.home()); await settle();
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    await page.setViewport({ width: w, height: h }); await settle(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(overflow <= 0, `${w}x${h}: the picker page's row actions fit without page overflow`, overflow);
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
      const plays = b.scopePlays(defense.widgets[0], ctx);
      const board = app.stats.defenseBoard(app.season._allPlays(), {}).players;
      // Yards per play leaves out penalty yardage everywhere (coach, 2026-10-10).
      const offense = b.scopePlays(b.constructor.fromTemplate('offense').widgets[0], ctx);
      const ypp = {
        dashboardOffense: b.measure('yards', offense, { unit: 'offense' }).value,
        reportOffense: Number(app.stats.constructor.yardsPerPlay(app.stats.compute(offense))),
        dashboardDefense: b.measure('yards', plays, { unit: 'defense' }).value,
        reportDefense: app.stats.defenseBoard(plays, {}).kpis.ypp,
      };
      // Success rate uses the yards rule's play set everywhere (smoke 115 finding 3).
      const success = {
        dashboardOffense: b.measure('success', offense, { unit: 'offense' }).value,
        reportOffense: Number(app.stats.compute(offense).efficiency.successRate),
        dashboardDefense: b.measure('success', plays, { unit: 'defense' }).value,
        reportDefense: app.stats.selfScoutDefenseSummary(app.stats.compute(plays)).kpis.stopRate,
      };
      return { ypp, success, errors: result.widgets.filter(w => w.error).map(w => w.title), five: leaders.find(r => r.value === '5')?.metric,
        boardFive: board.find(r => String(r.num) === '5')?.tackles, cells: result.widgets.find(w => w.view === 'matrix').rows.flatMap(r => r.cells).filter(c => c.n).length, plays: plays.length };
    }, season);
    ok(!real.errors.length && real.plays === 174, 'the Defense snapshot measures all 174 canonical defensive plays without an error', real);
    ok(real.five === 40 && real.boardFive === 40, '#5 leads with 40 tackles, equal to the Defense board', real);
    ok(real.cells > 0, 'the coverage by down heat map fills on defense', real);
    ok(real.ypp.dashboardOffense === real.ypp.reportOffense && real.ypp.dashboardDefense === real.ypp.reportDefense,
      'yards per play is the same number in Dashboards and the reports, offense and defense', real.ypp);
    ok(+real.success.dashboardOffense.toFixed(1) === real.success.reportOffense && Math.abs(real.success.dashboardDefense - real.success.reportDefense) <= 0.5, // one decimal vs a whole percent
      'success and stop rate are the same number in Dashboards and the reports', real.success);
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
