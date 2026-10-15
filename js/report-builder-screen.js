import { h, render } from 'preact';
import { ReportBuilder } from './report-builder.js';
import { WidgetEditor, NativeReportBuilder } from './native-report-builder.jsx';
import { ConfirmDeleteForm } from './native-team-hub.jsx';

/* Season-owned dashboard state and editing; ReportBuilder owns every number.
 * Editing a template saves a named dashboard, never changes the template. */
export class ReportBuilderScreen {
  constructor(app, reports, { saveBlob } = {}) {
    this.saveBlob = saveBlob;
    this.app = app;
    this.reports = reports;
    this.builder = new ReportBuilder({ registry: app.analyticsRegistry, study: app.study });
    this.activeId = null;
    this.view = 'home';
    this.templateView = null;
    this.editing = false;
    this._listeners = new Set();
  }

  subscribe(listener) { this._listeners.add(listener); return () => this._listeners.delete(listener); }
  _publish() { const state = this.snapshot(); this._listeners.forEach(listener => listener(state)); }

  // ---- Stored dashboards -------------------------------------------------

  _store() { return this.app.storage?.seasonStore || null; }
  list() {
    const data = this._store()?.data;
    if (!data) return [];
    if (!Array.isArray(data.dashboards)) data.dashboards = [];
    return data.dashboards;
  }
  /** The open dashboard: a template being viewed, or a saved one. Null on
   *  the Dashboards home. */
  active() {
    if (this.view !== 'dashboard') return null;
    if (this.templateView) return this.templateView;
    return this.list().find(item => item.id === this.activeId) || null;
  }
  isTemplate() { return this.view === 'dashboard' && !!this.templateView; }
  _save() {
    this.app.storage?._autoSave?.();
    this._publish();
  }
  /** Store a saved dashboard. `open` shows it (to edit when `editing`);
   *  otherwise the current page stays, so a home-row Rename stays home. */
  _replace(dashboard, { open = this.view === 'dashboard', editing = this.editing } = {}) {
    const list = this.list();
    const index = list.findIndex(item => item.id === dashboard.id);
    const clean = ReportBuilder.normalize(dashboard);
    if (index >= 0) list[index] = clean; else list.push(clean);
    if (open) { this.activeId = clean.id; this.view = 'dashboard'; this.templateView = null; this.editing = editing; }
    this._save();
    return clean;
  }

  home() { this.view = 'home'; this.templateView = null; this.editing = false; this._publish(); }
  /** Show (`false`) or edit (`true`) the open dashboard. A template opens to
   *  edit only as a new saved copy (`editTemplate`). */
  setEditing(editing) {
    if (this.isTemplate() && editing) return this.saveTemplateAs();
    this.editing = !!editing && this.view === 'dashboard';
    this._publish();
    return this.editing;
  }

  /** Saved dashboards, then templates: the home page's order, which Prev and
   *  Next step through. A template's key is `template:<id>`. */
  _order() {
    return [...this.list().map(item => item.id),
      ...ReportBuilder.TEMPLATES.filter(item => item.id !== 'blank').map(item => `template:${item.id}`)];
  }
  _activeKey() {
    if (this.view !== 'dashboard') return null;
    return this.templateView ? this.templateView.id : this.activeId;
  }
  /** Open the previous (-1) or next (+1) dashboard in the home page's order. */
  step(direction) {
    const order = this._order();
    const key = order[order.indexOf(this._activeKey()) + direction];
    if (!key) return false;
    const editing = this.editing && !key.startsWith('template:');
    if (key.startsWith('template:')) this.openTemplate(key.slice('template:'.length)); else this.open(key, { edit: editing });
    return true;
  }
  /** Leave Dashboards for the report tabs. */
  toReports() { return this.reports?.backToReports?.(); }
  open(id, { edit = false } = {}) { this.activeId = id; this.templateView = null; this.view = 'dashboard'; this.editing = !!edit; this._publish(); }
  edit(id) { return this.open(id, { edit: true }); }
  openTemplate(templateId) {
    const template = ReportBuilder.TEMPLATES.find(item => item.id === templateId);
    if (!template) return null;
    this.templateView = { ...ReportBuilder.fromTemplate(template.id), id: `template:${template.id}` };
    this.view = 'dashboard';
    this.editing = false;
    this._publish();
    return this.templateView;
  }
  /** Edit a template: it is saved as a new dashboard first, under a name. */
  async editTemplate(templateId) {
    if (!this.openTemplate(templateId)) return null;
    return this.saveTemplateAs();
  }

  _uniqueName(base) {
    const names = new Set(this.list().map(item => item.name));
    let name = base, n = 2;
    while (names.has(name)) name = `${base} ${n++}`;
    return name;
  }
  async _askName(suggested, action) {
    const name = String(await this.app.tagger?._promptDialog?.('Dashboard name', action, suggested) || '').trim();
    return name || null;
  }

  /** A new, empty saved dashboard under the name the coach gives. */
  async createBlank() {
    const name = await this._askName(this._uniqueName('New dashboard'), 'Create');
    if (!name) return null;
    return this._replace(ReportBuilder.fromTemplate('blank', name), { open: true, editing: true });
  }

  /** The template being viewed, saved as a new dashboard with `change`
   *  applied. Nothing is saved when the coach cancels the name. */
  async saveTemplateAs(change = list => list) {
    const view = this.templateView;
    if (!view) return null;
    const name = await this._askName(this._uniqueName(view.name), 'Save');
    if (!name || this.templateView !== view) return null;
    this.templateView = null;
    return this._replace({ ...JSON.parse(JSON.stringify(view)), id: null, name, widgets: change(view.widgets.slice()) },
      { open: true, editing: true });
  }

  /** A saved dashboard by id, or the open one. */
  _saved(id) { return id ? this.list().find(item => item.id === id) || null : (this.isTemplate() ? null : this.active()); }

  async rename(id = null) {
    const dashboard = this._saved(id);
    if (!dashboard) return false;
    const name = String(await this.app.tagger?._promptDialog?.('Dashboard name', 'Rename', dashboard.name) || '').trim();
    if (!name) return false;
    this._replace({ ...dashboard, name });
    return true;
  }

  duplicate(id = null) {
    const dashboard = this._saved(id);
    if (!dashboard) return null;
    return this._replace({ ...JSON.parse(JSON.stringify(dashboard)), id: null, name: this._uniqueName(`${dashboard.name} copy`),
      widgets: dashboard.widgets.map(widget => ({ ...widget, id: null })) });
  }

  /** Delete a saved dashboard after the coach types "delete", as a game or a
   *  season is deleted. */
  async remove(id = null) {
    const dashboard = this._saved(id);
    if (!dashboard || !this.app.overlays?.dialog) return false;
    const modules = dashboard.widgets.length;
    const handle = this.app.overlays.dialog({
      title: `Delete ${dashboard.name}?`, destructive: true, initialFocus: '[name="confirm"]',
      actions: [{ key: 'cancel', label: 'Cancel', default: true }],
      content: h(ConfirmDeleteForm, {
        impact: `The dashboard and its ${modules} module${modules === 1 ? '' : 's'} will be removed. Charted plays are untouched.`,
        confirmLabel: 'Delete dashboard',
        onSubmit: async () => { handle.close('delete'); return { ok: true }; },
      }),
    });
    if ((await handle.result) !== 'delete') return false;
    const data = this._store()?.data;
    data.dashboards = this.list().filter(item => item.id !== dashboard.id);
    if (this.activeId === dashboard.id) { this.activeId = null; this.view = 'home'; this.editing = false; }
    this._save();
    return true;
  }

  /** Export a saved dashboard from the home. The board is drawn and copied
   *  at once, off screen, before anything is awaited, so moving to another
   *  dashboard while the file is built cannot change what is saved. */
  async exportDashboard(id) {
    const dashboard = this._saved(id);
    if (!dashboard) return null;
    this.open(id);
    const host = document.createElement('div');
    render(h(NativeReportBuilder, { screen: this }), host);
    const board = host.querySelector(`[data-report-builder][data-rb-dashboard="${CSS.escape(dashboard.id)}"]`)?.outerHTML || null;
    render(null, host);
    this.home();
    return board ? this._exportBoard(dashboard, board) : null;
  }

  // ---- Modules ---------------------------------------------------------------

  _widgets(update) {
    const d = this.active();
    if (!d) return;
    if (this.isTemplate()) { this.saveTemplateAs(update); return; }
    this._replace({ ...d, widgets: update(d.widgets.slice()) });
  }
  saveWidget(widget) {
    const clean = ReportBuilder.normalizeWidget(widget);
    if (!clean) return;
    this._widgets(list => {
      const index = list.findIndex(item => item.id === clean.id);
      if (index >= 0) list[index] = clean; else list.push(clean);
      return list;
    });
  }
  removeWidget(id) { this._widgets(list => list.filter(item => item.id !== id)); }
  duplicateWidget(id) {
    this._widgets(list => {
      const index = list.findIndex(item => item.id === id);
      if (index >= 0) list.splice(index + 1, 0, { ...JSON.parse(JSON.stringify(list[index])), id: null });
      return list;
    });
  }
  moveWidget(id, step) {
    this._widgets(list => {
      const index = list.findIndex(item => item.id === id);
      const to = index + step;
      if (index < 0 || to < 0 || to >= list.length) return list;
      const [item] = list.splice(index, 1);
      list.splice(to, 0, item);
      return list;
    });
  }
  resizeWidget(id, width) { this._widgets(list => list.map(item => item.id === id ? { ...item, width } : item)); }

  /** Add or edit a module in its own dialog with a live preview. A new
   *  module starts with the unit and games of the last one on the canvas. */
  editWidget(id = null) {
    const dashboard = this.active();
    if (!dashboard || !this.app.overlays?.dialog) return null;
    const existing = dashboard.widgets.find(item => item.id === id);
    const last = dashboard.widgets.at(-1);
    const start = existing || ReportBuilder.normalizeWidget({ view: 'bar', metric: 'success', dimension: 'down', width: 'm',
      unit: last?.unit, scope: last?.scope });
    let handle = null;
    handle = this.app.overlays.dialog({
      title: existing ? 'Edit module' : 'Add module', actions: [],
      content: h(WidgetEditor, { screen: this, widget: start, isNew: !existing,
        onCancel: () => handle?.close(null),
        onSave: widget => { this.saveWidget(widget); handle?.close(widget.id); } }),
    });
    return handle;
  }

  // ---- Data ------------------------------------------------------------------

  /** The season's own-team games in order, each with its committed plays
   *  stamped with their game id, and their labels. */
  context() {
    const storage = this.app.storage;
    storage?.commitActive?.();
    const store = this._store();
    const games = (store?.gamesChrono?.() || store?.data?.games || []).filter(game => game?.gameInfo?.perspective !== 'scout');
    const all = this.app.season?._allPlays?.() || [];
    const byGame = new Map();
    for (const play of all) {
      const key = String(play.__gid);
      if (!byGame.has(key)) byGame.set(key, []);
      byGame.get(key).push(play);
    }
    const label = game => {
      const opponent = String(game.gameInfo?.opponent || '').trim();
      return opponent ? `vs ${opponent}` : (game.name || `Game ${game.id}`);
    };
    const list = games.map(game => ({ id: String(game.id), label: label(game), plays: byGame.get(String(game.id)) || [] }));
    return {
      games: list, activeGameId: String(store?.data?.activeGameId ?? ''),
      labels: Object.fromEntries(list.map(game => [game.id, game.label])),
      roster: this.app.season?._mergeRoster?.() || {},
    };
  }

  _measure(widget, context) {
    try { return this.builder.evaluate(widget, context); }
    catch (error) { return { id: widget.id, view: widget.view, unit: widget.unit, scope: widget.scope, width: widget.width, title: this.builder.title(widget), error: 'This module could not be measured.' }; }
  }

  /** Every module of a dashboard, each over its own unit, games and filters. */
  evaluate(dashboard, context = this.context()) {
    return { widgets: dashboard.widgets.map(widget => this._measure(widget, context)) };
  }

  /** A module as drafted in the editor. */
  preview(widget) {
    const clean = ReportBuilder.normalizeWidget(widget);
    return clean ? this._measure(clean, this.context()) : null;
  }

  /** The values a filter can choose, with play counts, in the module's unit
   *  and games before any filters. */
  filterValues(dimension, widget) {
    if (!dimension || !widget) return [];
    const context = this.context();
    return this.builder.values(this.builder.scopePlays(widget, context), dimension, context.labels);
  }

  /**
   * The open dashboard as one self-contained HTML file to share: the rendered
   * board with the app's stylesheets, controls hidden. Resolves the HTML (and
   * saves it through the shared save seam). The stylesheet source is copied as
   * written: Chromium cannot re-serialize a `font` shorthand that uses a
   * variable and is followed by one of its longhands, so rule text read back
   * from CSSOM would drop those declarations.
   */
  async exportHtml(root = this.reports?.content) {
    const dashboard = this.active();
    const board = dashboard && root?.querySelector?.(`[data-report-builder][data-rb-dashboard="${CSS.escape(dashboard.id)}"]`);
    if (!dashboard || !board) return null;
    // The dashboard and its drawn board are copied before the stylesheets are
    // read, so navigating meanwhile cannot change the file.
    return this._exportBoard(dashboard, board.outerHTML);
  }

  async _exportBoard(dashboard, boardHtml) {
    const rules = [];
    for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
      try {
        const text = node.tagName === 'STYLE' ? node.textContent : await (await fetch(node.href)).text();
        rules.push(text.replace(/@font-face\s*\{[^}]*\}/g, ''));
      } catch (e) {}
    }
    const esc = value => String(value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
    const date = new Date().toISOString().slice(0, 10);
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(dashboard.name)}</title><style>${rules.join('\n')}
body{margin:0;background:var(--gi-bd-stage,#080808)}
.gi-rb-export-head{padding:16px;color:var(--gi-bd-strong,#f5f5f5);font:600 20px/1.2 system-ui,sans-serif}
.gi-rb-export-head span{display:block;margin-top:4px;color:var(--gi-bd-copy,#a6a6a6);font:400 13.5px system-ui,sans-serif}
.gi-rb-export .gi-rb-toolbar-actions,.gi-rb-export .gi-rb-card-actions button,.gi-rb-export .gi-rb-card-actions details,.gi-rb-export [data-rb-add-filter],.gi-rb-export .gi-rb-chip button{display:none}
</style></head><body><header class="gi-rb-export-head">${esc(dashboard.name)}<span>Exported ${date}</span></header>
<div class="gi-rb-export">${boardHtml}</div></body></html>`;
    try { this.saveBlob(new Blob([html], { type: 'text/html' }), `dashboard_${dashboard.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${date}.html`); } catch (e) {}
    return html;
  }

  watch(refs, label) {
    if (!refs?.length) return false;
    this.reports?.watchRefs?.(refs, label);
    return true;
  }

  snapshot() {
    const dashboard = this.active();
    const context = dashboard ? this.context() : null;
    const summary = item => ({ id: item.id, name: item.name, units: ReportBuilder.units(item), widgets: item.widgets.length });
    const order = this._order(), at = order.indexOf(this._activeKey());
    return {
      view: this.view,
      isTemplate: this.isTemplate(),
      editing: this.editing,
      hasPrev: at > 0, hasNext: at >= 0 && at < order.length - 1,
      dashboards: this.list().map(summary),
      templates: ReportBuilder.TEMPLATES.filter(item => item.id !== 'blank').map(item => ({ ...summary(ReportBuilder.fromTemplate(item.id)), id: item.id })),
      dashboard,
      result: dashboard ? this.evaluate(dashboard, context) : null,
      dimensions: this.builder.dimensionCatalog(),
      labels: context?.labels || {},
      dimensionName: id => this.builder.dimensionName(id),
    };
  }
}
