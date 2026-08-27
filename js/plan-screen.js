import { mountNativePlan } from './native-plan.jsx';

export class PlanScreen {
  constructor(app) {
    this.app = app;
    this.host = null;
    this.activeId = '';
    this._dragId = '';
    this.presentationIndex = -1;
    this._nativeMount = null;
    this._native = null;
  }

  mount(host) {
    if (!host || this.host === host) return;
    this._nativeMount?.unmount?.();
    this.host = host;
    this._nativeMount = mountNativePlan(this, host);
  }

  show() { this.render(); }
  render() { this._nativeMount?.refresh?.(); }
  _store() { return this.app.storage.seasonStore; }
  _persist() { this._store().persist(); this.render(); }
  _active() {
    const plans = this._store().plans();
    return this._store().getPlan(this.activeId) || plans[0] || null;
  }

  addFindingTo(planId, item) {
    const plan = this._store().getPlan(planId);
    if (!plan) return null;
    const added = this._store().addPlanItem(plan.id, item);
    if (!added) return null;
    this.activeId = plan.id;
    this._store().persist();
    this.render();
    return plan;
  }

  createPlan() {
    const plan = this._store().createPlan(`Game Plan ${this._store().plans().length + 1}`);
    this.activeId = plan.id;
    this.presentationIndex = -1;
    this._persist();
  }

  async deleteActive() {
    const plan = this._active();
    if (!plan) return;
    const confirmed = await this.app.tagger._confirmDialog(
      `Delete "${plan.name}" and its ${plan.items.length} saved item${plan.items.length === 1 ? '' : 's'}?`,
      'Delete Plan',
    );
    if (!confirmed) return;
    this._store().deletePlan(plan.id);
    this.activeId = '';
    this.presentationIndex = -1;
    this._persist();
  }

  selectPlan(id) { this.activeId = id; this._dragId = ''; this.presentationIndex = -1; this.render(); }
  renamePlan(value) { if (this._store().renamePlan(this.activeId, value)) this._persist(); }
  setAudience(value) { if (this._store().setPlanAudience(this.activeId, value)) this._persist(); }
  setNotes(value) { if (this._store().setPlanNotes(this.activeId, value)) this._persist(); }
  moveItem(id, delta) { if (this._store().movePlanItem(this.activeId, id, delta)) this._persist(); }
  removeItem(id) { if (this._store().removePlanItem(this.activeId, id)) this._persist(); }

  reorderItem(dragId, targetId, after) {
    const plan = this._active();
    this._dragId = '';
    if (!plan || dragId === targetId) { this.render(); return; }
    const ids = plan.items.map(item => item.id).filter(id => id !== dragId);
    const target = ids.indexOf(targetId);
    if (target < 0) { this.render(); return; }
    ids.splice(target + (after ? 1 : 0), 0, dragId);
    if (this._store().reorderPlanItems(plan.id, ids)) this._persist();
    else this.render();
  }

  watchPlan() {
    const plan = this._active();
    const refs = plan ? this.app.studyPlan.planRefs(plan) : [];
    if (refs.length) this.app.filmNavigation.watch(refs, { label: plan.name });
  }

  watchGroup(index) {
    const plan = this._active();
    const group = plan ? this._groups(plan)[index] : null;
    if (group?.refs.length) this.app.filmNavigation.watch(group.refs, { label: `${plan.name} · ${group.name}` });
  }

  watchItem(id) {
    const item = this._active()?.items.find(entry => entry.id === id);
    if (item?.refs?.length) this.app.filmNavigation.watch(item.refs, { label: item.label });
  }

  _groups(plan) {
    const out = [];
    (plan?.items || []).forEach((item, index) => {
      const key = this._groupKey(item);
      const last = out[out.length - 1];
      if (last && last.key === key) last.entries.push({ item, index });
      else out.push({ key, name: this._groupName(item), entries: [{ item, index }] });
    });
    return out.map(group => {
      const refs = [];
      const seen = new Set();
      group.entries.forEach(entry => (entry.item.refs || []).forEach(ref => {
        const value = String(ref);
        if (value && !seen.has(value)) { seen.add(value); refs.push(value); }
      }));
      return { ...group, refs };
    });
  }

  _groupKey(item) {
    const dimension = item?.query?.dimension;
    return dimension ? `dim:${dimension}` : `kind:${item?.kind || 'note'}`;
  }

  _groupName(item) {
    const dimension = item?.query?.dimension;
    if (dimension) return this.app.analyticsRegistry?.getDimension(dimension)?.name || String(dimension);
    return ({ film: 'Film clips', note: 'Notes', finding: 'Findings' })[item?.kind] || 'Plan items';
  }

  openPresentation() {
    if (!this._active()?.items.length) return;
    this.presentationIndex = 0;
    this.render();
  }

  _closePresentation() { this.presentationIndex = -1; this.render(); }
  _stepPresentation(delta) {
    const count = this._active()?.items.length || 0;
    this.presentationIndex = Math.max(0, Math.min(this.presentationIndex + delta, count - 1));
    this.render();
  }

  _jumpPresentation(index) {
    const count = this._active()?.items.length || 0;
    if (!Number.isFinite(index) || index < 0 || index >= count) return;
    this.presentationIndex = index;
    this.render();
  }

  _presentation() {
    const plan = this._active();
    return plan ? this.app.planExport.build(plan, this._store().data?.games || []) : null;
  }

  _presentationItem() { return this._presentation()?.items?.[this.presentationIndex] || null; }

  watchPresentationRef(ref) {
    const item = this._presentationItem();
    this._closePresentation();
    this.app.filmNavigation.watch([ref], { label: item?.label || 'Plan film' });
  }

  watchPresentationItem() {
    const item = this._presentationItem();
    const refs = (item?.plays || []).filter(play => !play.missing).map(play => play.ref);
    this._closePresentation();
    if (refs.length) this.app.filmNavigation.watch(refs, { label: item.label });
  }

  _exportPlan() {
    const plan = this._active();
    if (!plan) return;
    const html = this.app.planExport.html(this.app.planExport.build(plan, this._store().data?.games || []));
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a');
    const slug = (plan.name || 'game-plan').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'game-plan';
    link.href = url;
    link.download = `${slug}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.app.history?._toast('PLAN EXPORTED');
  }
}
