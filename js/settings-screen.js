import { h } from 'preact';
import { NativeSettingsContent } from './native-settings.jsx';

const clone = value => JSON.parse(JSON.stringify(value));

export class SettingsScreen {
  constructor(app, overlays) {
    this.app = app;
    this.overlays = overlays;
    this.handle = null;
    this.activeTab = null;
  }

  open({ required = false, returnFocus = null, initialTab = 'film', chartGroup = 'formation' } = {}) {
    if (this.handle) return this.handle.result;
    this.activeTab = required ? 'film' : initialTab;
    const finish = value => this.close(value);
    const handle = this.overlays.sheet({
      id: 'team-film-settings',
      title: required ? 'Set Up Film Storage' : 'Settings & Tools',
      modal: false,
      returnFocus,
      dismissOnEscape: !required,
      dismissOnScrim: !required,
      content: h(NativeSettingsContent, { screen: this, required, finish, initialTab:this.activeTab, chartGroup }),
      actions: required ? [] : [{ key: 'done', label: 'Done', tone: 'primary', default: true }],
    });
    this.handle = handle;
    const result = handle.result.finally(() => {
      if (this.handle === handle) this.handle = null;
      this.activeTab = null;
      this.app.library?._renderTeamCard?.();
      this.app.library?._render?.();
    });
    return result.then(value => required && value !== 'linked' && value !== 'managed' ? '' : value);
  }

  setActiveTab(tab) { this.activeTab = tab; }

  close(value = 'cancel') {
    const handle = this.handle;
    if (!handle) return false;
    this.handle = null;
    this.activeTab = null;
    return handle.close(value);
  }

  _store() { return this.app.storage?.seasonStore; }
  _backend() { return this._store()?.backend; }
  _desktop() { return !!(window.__TAURI__ && this._backend()?.supportsLinkedFilm?.()); }
  _toast(message, tone = 'success') { this.overlays.toast({ message, tone }); }

  teamProfile() { return this.app.library?._teamProfile?.() || {}; }
  saveTeam(name, color) { return this.app.library?.saveTeamIdentity?.(name, color) === true; }

  analysisProfile() {
    return {
      apiKey: localStorage.getItem('ffa_claude_api_key') || '',
      model: localStorage.getItem('ffa_claude_model') || 'claude-opus-4-6',
      status: document.getElementById('backendStatusBadge')?.textContent?.trim() || 'Auto-Detect: Basic',
    };
  }

  saveAnalysis(apiKey, model) {
    const keyEl = document.getElementById('gameApiKey');
    const modelEl = document.getElementById('gameAiModel');
    if (keyEl) keyEl.value = String(apiKey || '').trim();
    if (modelEl) modelEl.value = String(model || 'claude-opus-4-6');
    this.app._saveApiKey?.();
    if (modelEl) modelEl.dispatchEvent(new Event('change', { bubbles:true }));
    this._toast('Analysis preferences saved.');
    return true;
  }

  async snapshot() {
    const store = this._store();
    const backend = this._backend();
    const desktop = this._desktop();
    const mode = desktop ? backend.getFilmStorageMode?.() || '' : 'browser';
    const root = desktop ? backend.getLibraryRoot?.() || '' : '';
    const games = store?.data?.games || [];
    const rows = await Promise.all(games.map(async (game, index) => {
      let health = null, path = '';
      try { health = await this.app.workspace.filmHealth(game); } catch {}
      try {
        if (game.filmMode === 'linked') path = await backend.linkedGameDir?.(game.filmDir) || '';
        else if (game.filmMode === 'managed') path = await backend.managedGameDir?.(game.id) || 'GridIron IQ app storage';
      } catch {}
      return { game, health, path, name: store.gameName?.(game, index) || game.name || game.gameInfo?.opponent || ('Game ' + (index + 1)) };
    }));
    return { desktop, mode, root, games: rows, activeGameId: store?.data?.activeGameId || null };
  }

  async chooseLinkedRoot() {
    const backend = this._backend();
    if (!this._desktop()) return { ok: false, message: 'Film library linking is available in the desktop app.' };
    const oldRoot = backend.getLibraryRoot?.() || '';
    const picked = await backend.pickFolder?.(oldRoot || undefined);
    if (!picked) return { ok: false };
    const norm = value => String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    if (oldRoot && norm(oldRoot) !== norm(picked)) {
      const choice = await this.overlays.dialog({
        title: 'Change film library root?',
        message: 'Existing game links are not rewritten. Games that no longer resolve will be marked Reconnect. No film, plays, or tags will be moved or deleted.',
        actions: [
          { key: 'cancel', label: 'Keep current root', default: true },
          { key: 'change', label: 'Change root', tone: 'primary' },
        ],
      }).result;
      if (choice !== 'change') return { ok: false };
    }
    const allowed = await backend.setLibraryRoot?.(picked);
    if (!allowed) return { ok: false, message: 'GridIron IQ could not access that folder. Nothing changed.' };
    if (backend.setFilmStorageMode?.('linked') === false) {
      await backend.setLibraryRoot?.(oldRoot);
      return { ok: false, message: 'The storage choice could not be saved. The prior root was restored.' };
    }
    this._toast('Film library linked. No video was copied.');
    this.app.uiPolish?._renderEmptyFilmActions?.();
    return { ok: true, mode: 'linked', message: 'Library root connected: ' + picked + '. No video was copied.' };
  }

  async useManagedStorage() {
    const backend = this._backend();
    if (!this._desktop()) return { ok: false };
    if (backend.setFilmStorageMode?.('managed') === false) return { ok: false, message: 'The storage choice could not be saved.' };
    this._toast('Managed storage selected. Existing linked games stay linked.');
    this.app.uiPolish?._renderEmptyFilmActions?.();
    return { ok: true, mode: 'managed', message: 'Managed storage is now the import default. Existing linked games were not changed.' };
  }

  async linkGame(gameId) {
    const store = this._store();
    if (!store?.data?.games?.some(game => String(game.id) === String(gameId))) return { ok: false };
    if (String(store.data.activeGameId) !== String(gameId)) {
      const switched = await this.app.storage.switchToGame(gameId);
      if (!switched) return { ok: false, message: 'That game could not be selected. Nothing changed.' };
      this.app.workspaceShell?._syncChrome?.();
    }
    const linked = await this.app.storage.linkFilmFolder();
    return linked ? { ok: true, message: 'Game folder linked in place. No video was copied.' } : { ok: false };
  }

  async openFolder(game) {
    const backend = this._backend();
    const opened = game.filmMode === 'linked'
      ? await backend.openLinkedDir?.(game.filmDir)
      : await backend.openManagedFilmDir?.(game.id);
    if (!opened) return { ok: false, message: 'That film folder could not be opened.' };
    return { ok: true };
  }

  addFilmClips() {
    this.close('add-film');
    document.getElementById('clipFileInput')?.click();
  }

  async repairGame(gameId) {
    this.close('repair');
    const opened = await this.app.openGame?.(gameId);
    if (opened === false) return false;
    document.getElementById('repairFilmInput')?.click();
    return true;
  }

  rosterSnapshot() { return clone(this.app.roster?.players || []); }
  addPlayer(player) {
    this.app.roster?.addPlayer?.(player.num, player.name, player.pos, player.side);
    return this.rosterSnapshot();
  }
  removePlayer(num) { this.app.roster?.removePlayer?.(num); return this.rosterSnapshot(); }
  importRoster(text) { return this.app.roster?.importFromText?.(text) || 0; }
  exportDepthChart() { return this.app.roster?.exportDepthChart?.(); }

  chartingSnapshot(group = 'formation') {
    const meta = { formation:{label:'Formations',singular:'formation'}, backfield:{label:'Backfields',singular:'backfield'}, front:{label:'Fronts',singular:'front'} };
    const key = meta[group] ? group : 'formation';
    return { key, ...meta[key], ...this.app.customChips.library.group(key) };
  }
  setTagEnabled(group, value, enabled) { this.app.customChips.setEnabled(group, value, enabled); return this.chartingSnapshot(group); }
  addTagChoice(group, value) {
    const clean = String(value || '').trim();
    const current = this.chartingSnapshot(group);
    if (!clean) return { ok:false, message:'Enter a name first.' };
    if (current.values.some(item => item.toLowerCase() === clean.toLowerCase())) return { ok:false, message:'That choice already exists.' };
    const ok = this.app.customChips.library.add(group, clean);
    if (ok) this.app.customChips.reload();
    return { ok, message:ok ? '' : 'That choice could not be added.', group:this.chartingSnapshot(group) };
  }
  async removeTagChoice(group, value) {
    const choice = await this.overlays.dialog({ title:'Remove "' + value + '"?', message:'It disappears from charting choices. Existing tagged plays and analytics stay unchanged.', actions:[{key:'cancel',label:'Keep it',default:true},{key:'remove',label:'Remove choice',tone:'destructive'}] }).result;
    if (choice !== 'remove') return this.chartingSnapshot(group);
    this.app.customChips.library.remove(group, value); this.app.customChips.reload();
    return this.chartingSnapshot(group);
  }
  async restoreTagDefaults() {
    const choice = await this.overlays.dialog({ title:'Restore default charting libraries?', message:'Custom choices are removed. Existing tagged plays and analytics stay unchanged.', actions:[{key:'cancel',label:'Keep current choices',default:true},{key:'restore',label:'Restore defaults',tone:'destructive'}] }).result;
    if (choice !== 'restore') return false;
    this.app.customChips.restoreDefaults(); this._toast('Tag libraries restored.'); return true;
  }

  filterSnapshot() { return this.app.filter?.snapshot?.() || {}; }
  saveFilter(criteria) { return this.app.filter?.setCriteria?.(criteria); }
  exportCutup(criteria) { this.app.filter?.setCriteria?.(criteria); this.close('cutup'); return this.app.cutup?.export?.(); }

  drawingSnapshot() { const canvas=this.app.canvas; return { tool:canvas?.currentTool || '', color:canvas?.color || '#ffffff', lineWidth:canvas?.lineWidth || 3, count:canvas?.annotations?.length || 0 }; }
  setDrawingColor(color) { this.app.canvas.color = color; return this.drawingSnapshot(); }
  setDrawingWidth(width) { this.app.canvas.lineWidth = Number(width) || 3; return this.drawingSnapshot(); }
  chooseDrawingTool(tool) { this.app._selectTool?.(tool); this.close('drawing'); return true; }
  async clearDrawings() {
    const choice=await this.overlays.dialog({title:'Clear drawings?',message:'Remove every drawing on the current play?',actions:[{key:'cancel',label:'Keep drawings',default:true},{key:'clear',label:'Clear drawings',tone:'destructive'}]}).result;
    if(choice!=='clear')return false; this.app.canvas?.clearAllAnnotations?.(); return true;
  }

  async recoverySnapshot() {
    const store=this._store();
    let seasonPoints=[]; try{seasonPoints=store?.hasCurrent?.()?await store.listBackups():[];}catch{}
    const versions=(this.app.versions?.list?.() || []).slice().reverse();
    return { hasSeason:!!store?.hasCurrent?.(), seasonName:store?.data?.seasonName || '', seasonPoints, versions, disk:store?.diskStatus?.() || {} };
  }
  async createRestorePoint(label='Manual restore point') {
    const store=this._store(); if(!store?.hasCurrent?.())return {ok:false,message:'Open a season first.'};
    this.app.storage.commitActive();
    const persisted=await store.persist();
    if(persisted===false)return {ok:false,message:'The season could not be saved. No restore point was created.'};
    const id=await store.snapshot(String(label||'Manual restore point').trim()||'Manual restore point');
    if(!id)return {ok:false,message:'The restore point could not be created.'};
    this._toast('Season restore point created.'); return {ok:true,id};
  }
  async restoreSeasonPoint(id) {
    const choice=await this.overlays.dialog({title:'Restore this season?',message:'Every game in the season will return to this restore point. GridIron IQ saves your current state first, so the restore is reversible.',actions:[{key:'cancel',label:'Keep current season',default:true},{key:'restore',label:'Restore season',tone:'destructive'}]}).result;
    if(choice!=='restore')return false;
    const ok=await this.app.storage.restoreBackup(id);
    if(!ok){this._toast('The restore failed. Your current season was kept.', 'error');return false;}
    this._toast('Season restored. A copy of the prior state was saved.');
    this.app.workspaceShell?._syncChrome?.(); return true;
  }
  saveGameVersion(label) { return this.app.versions?.snapshot?.(String(label||'Manual save').trim()||'Manual save',true); }
  async restoreGameVersion(id) { return await this.app.versions?.restore?.(id) === true; }
  async deleteGameVersion(id) { await this.app.versions?.delete?.(id); return true; }
  async openDataFolder() { return this._store()?.openDataDir?.(); }
}