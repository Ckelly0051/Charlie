import { h } from 'preact';
import { NativeSettingsContent } from './native-settings.jsx';

const clone = value => JSON.parse(JSON.stringify(value));
const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const LOGO_MAX_BYTES = 8 * 1024 * 1024;
const LOGO_EDGE = 256;

export async function normalizeTeamLogo(file) {
  if (!(file instanceof Blob) || !LOGO_TYPES.has(file.type)) throw new Error('Choose a PNG, JPEG, or WebP image.');
  if (!file.size || file.size > LOGO_MAX_BYTES) throw new Error('Choose an image smaller than 8 MB.');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    if (!bitmap.width || !bitmap.height) throw new Error('That image could not be read.');
    const canvas = document.createElement('canvas');
    canvas.width = LOGO_EDGE;
    canvas.height = LOGO_EDGE;
    const scale = Math.min(LOGO_EDGE / bitmap.width, LOGO_EDGE / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, LOGO_EDGE, LOGO_EDGE);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, Math.round((LOGO_EDGE - width) / 2), Math.round((LOGO_EDGE - height) / 2), width, height);
    const data = canvas.toDataURL('image/webp', 0.9);
    if (!/^data:image\/(?:webp|png);base64,/i.test(data)) throw new Error('That image could not be prepared.');
    return data;
  } catch (error) {
    if (error?.message && /Choose|could not/.test(error.message)) throw error;
    throw new Error('That image could not be read.');
  } finally {
    bitmap?.close?.();
  }
}

export class SettingsScreen {
  constructor(app, overlays) {
    this.app = app;
    this.overlays = overlays;
    this.handle = null;
    this.activeTab = null;
  }

  open({ required = false, returnFocus = null, initialTab = 'film', chartGroup = 'formation', initialPlayCall = '' } = {}) {
    if (this.handle) return this.handle.result;
    const requestedTab = required ? 'film' : initialTab;
    this.activeTab = requestedTab === 'roster' && !this.canManageRoster() ? 'film' : requestedTab;
    if (requestedTab === 'roster' && this.activeTab !== 'roster') this._toast(this.rosterUnavailableMessage(), 'info');
    const finish = value => this.close(value);
    const handle = this.overlays.sheet({
      id: 'team-film-settings',
      title: required ? 'Set Up Film Storage' : 'Settings & Tools',
      modal: false,
      returnFocus,
      dismissOnEscape: !required,
      dismissOnScrim: !required,
      content: h(NativeSettingsContent, { screen: this, required, finish, initialTab:this.activeTab, chartGroup, initialPlayCall } ),
      actions: required ? [] : [{ key: 'done', label: 'Done', tone: 'primary', default: true }],
    });
    this.handle = handle;
    const result = handle.result.finally(() => {
      if (this.handle === handle) this.handle = null;
      this.activeTab = null;
      // S7-c: the legacy overlay is gone; the native Team Hub owns this view.
      this.app.teamHubScreen?.load?.();
      this.app.homeScreen?.refreshFilm?.();
    });
    return result.then(value => required && value !== 'linked' && value !== 'managed' ? '' : value);
  }

  setActiveTab(tab) {
    if (tab === 'roster' && !this.canManageRoster()) {
      this._toast(this.rosterUnavailableMessage(), 'info');
      return false;
    }
    this.activeTab = tab;
    return true;
  }

  openPlaybook({ name = '', returnFocus = null } = {}) {
    return this.open({ initialTab: 'team', initialPlayCall: name, returnFocus });
  }

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

  teamProfile() { return { ...this.app.teamRegistry.teamProfile(), logoData:this.app.teamRegistry.teamLogo?.() || '' }; }
  saveTeam(school, nickname, color) { return this.app.teamRegistry.saveTeamIdentity(school, nickname, color) === true; }
  async saveTeamLogo(file) {
    try {
      const logoData = await normalizeTeamLogo(file);
      if (!this.app.teamRegistry.saveTeamLogo?.(logoData)) return { ok:false, message:'The logo could not be saved. Your existing logo was kept.' };
      this.app.homeScreen?.refreshIdentity?.();
      return { ok:true, logoData };
    } catch (error) {
      return { ok:false, message:error?.message || 'The logo could not be saved.' };
    }
  }
  removeTeamLogo() {
    const ok = this.app.teamRegistry.removeTeamLogo?.() === true;
    if (ok) this.app.homeScreen?.refreshIdentity?.();
    return ok;
  }

  playbookSnapshot() { return this.app.playbook?.list?.() || []; }
  playbookDefaultOptions() {
    return {
      runPass:['Run','Pass'],
      playType:this.chartingSnapshot('playType').enabled,
      playDir:['Left','Middle','Right'],
      formation:this.chartingSnapshot('formation').enabled,
      qbAlignment:['Under Center','Pistol','Shotgun'],
      backfield:this.chartingSnapshot('backfield').enabled,
      strength:['Left','Right','Balanced'],
      personnel:['00','01','02','10','11','12','13','20','21','22','23','30','31','32','Jumbo','Goal Line'],
      motion:['Jet','Orbit','Shift','Trade'],
    };
  }
  async _persistPlaybook(previous) {
    const store = this._store();
    if (!store?.data || !this.app.playbook) return true;
    store.data.playbook = this.app.playbook.snapshot();
    const saved = await store.persist();
    if (saved === false) {
      this.app.playbook.replace(previous);
      store.data.playbook = previous;
      this._toast('The playbook change was not saved. Your prior playbook was kept.', 'error');
      return false;
    }
    return true;
  }
  async addPlayCall(input) {
    const previous = this.app.playbook?.snapshot?.();
    const call = this.app.playbook?.add?.(input);
    if (!call) return { ok:false, message:'Enter a unique play call.', calls:this.playbookSnapshot() };
    const durable = await this._persistPlaybook(previous);
    return { ok:durable, durable, call:durable ? call : null, message:durable ? '' : 'That call was not saved.', calls:this.playbookSnapshot() };
  }
  async updatePlayCall(id, patch) {
    const previous = this.app.playbook?.snapshot?.();
    const call = this.app.playbook?.update?.(id, patch);
    if (!call) return { ok:false, message:'That play call could not be updated.', calls:this.playbookSnapshot() };
    const durable = await this._persistPlaybook(previous);
    return { ok:durable, durable, call:durable ? call : null, message:durable ? '' : 'That change was not saved.', calls:this.playbookSnapshot() };
  }
  async removePlayCall(id) {
    const call = this.app.playbook?.get?.(id);
    if (!call) return { ok:false, calls:this.playbookSnapshot() };
    const choice = await this.overlays.dialog({
      title:`Remove "${call.name}"?`,
      message:'The call leaves this team playbook. Existing tagged plays keep their saved call and concept.',
      actions:[{key:'cancel',label:'Keep call',default:true},{key:'remove',label:'Remove call',tone:'destructive'}],
    }).result;
    if (choice !== 'remove') return { ok:false, cancelled:true, calls:this.playbookSnapshot() };
    const previous = this.app.playbook.snapshot();
    this.app.playbook.remove(id);
    const durable = await this._persistPlaybook(previous);
    return { ok:durable, durable, calls:this.playbookSnapshot() };
  }

  /** Final Engine Independence: status is computed directly from the live
   *  backend/vision state, never read off a hidden legacy badge's textContent
   *  -- that badge lived inside #giLegacyEngineHost and could never be
   *  observed by a coach, so reading it was a hidden-DOM-as-data-source. An
   *  explicit Claude Vision key always takes precedence (mirrors the
   *  historical badge priority), then the optional local CV server. */
  analysisProfile() {
    const app = this.app;
    const hasVision = !!app.vision?.apiKey;
    const serverAvailable = !!app.backend?.isAvailable?.();
    const status = hasVision ? '🧠 Vision AI'
      : serverAvailable ? 'Auto-Detect: Server'
      : 'Auto-Detect: Basic';
    return {
      apiKey: localStorage.getItem('ffa_claude_api_key') || '',
      model: localStorage.getItem('ffa_claude_model') || 'claude-opus-4-6',
      status,
      hasVision,
      serverAvailable,
      serverEnabled: !!app.backend?.enabled,
      capabilities: serverAvailable ? (app.backend?.getCapabilities?.() || []) : [],
    };
  }

  saveAnalysis(apiKey, model) {
    const saved = this.app._saveAnalysisPreferences?.(apiKey, model) === true;
    this._toast(
      saved ? 'Analysis preferences saved.' : 'Analysis preferences could not be saved.',
      saved ? 'success' : 'error',
    );
    return saved;
  }

  /** Opt in to the optional local Python CV server: until this is called we
   *  never touch the network (unchanged behavior, moved from the legacy
   *  badge's click handler in app.js, which lived inside the permanently
   *  hidden #giLegacyEngineHost and so could never actually be clicked). */
  async enableLocalServer() {
    const backend = this.app.backend;
    if (!backend) return { ok: false, message: 'No local CV backend is configured.' };
    backend.setEnabled(true);
    const ok = await backend.probe();
    this._toast(
      ok ? 'Local CV server connected.' : 'Local CV server not found. Auto-detect will use in-browser heuristics.',
      ok ? 'success' : 'info',
    );
    return { ok, message: '' };
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

  rosterAccess() {
    const season = this._store()?.data;
    if (!season) return { ok:false, message:'Open a program season before editing its roster.' };
    if (season.kind === 'scout') return { ok:false, message:'Opponent scout seasons do not use your program roster.' };
    return { ok:true, message:'' };
  }
  canManageRoster() { return this.rosterAccess().ok; }
  rosterUnavailableMessage() { return this.rosterAccess().message; }
  _requireRosterAccess() {
    const access = this.rosterAccess();
    if (!access.ok) this._toast(access.message, 'info');
    return access.ok;
  }
  rosterSnapshot() { return this.canManageRoster() ? clone(this.app.roster?.players || []) : []; }
  addPlayer(player) {
    if (!this._requireRosterAccess()) return [];
    this.app.roster?.addPlayer?.(player.num, player.name, player.pos, player.side);
    return this.rosterSnapshot();
  }
  removePlayer(num) {
    if (!this._requireRosterAccess()) return [];
    this.app.roster?.removePlayer?.(num);
    return this.rosterSnapshot();
  }
  importRoster(text) {
    if (!this._requireRosterAccess()) return 0;
    return this.app.roster?.importFromText?.(text) || 0;
  }
  exportDepthChart() {
    if (!this._requireRosterAccess()) return false;
    return this.app.roster?.exportDepthChart?.();
  }

  chartingSnapshot(group = 'formation') {
    const meta = {
      formation:{label:'Formations',singular:'formation'}, backfield:{label:'Backfields',singular:'backfield'},
      front:{label:'Fronts',singular:'front'}, coverage:{label:'Coverages',singular:'coverage call'},
      playType:{label:'Play Types',singular:'play type'}, blitz:{label:'Blitzes',singular:'blitz'},
    };
    const key = meta[group] ? group : 'formation';
    return { key, ...meta[key], ...this.app.customChips.library.group(key) };
  }
  setTagEnabled(group, value, enabled) { this.app.customChips.setEnabled(group, value, enabled); return this.chartingSnapshot(group); }
  moveTagChoice(group, value, delta) { this.app.customChips.library.move(group, value, delta); this.app.customChips.reload(); return this.chartingSnapshot(group); }
  chartingPresetMode() {
    return this._store()?.data?.kind === 'scout' || this.app.gameContext?.isScout?.() ? 'scout' : 'program';
  }
  chartingPresetSnapshot() {
    return { presets:this.app.customChips.library.presets(), mode:this.chartingPresetMode() };
  }
  saveChartingPreset(input) { const preset=this.app.customChips.library.savePreset(input); if (preset) this.app.customChips.reload(); return { ok:!!preset, preset, ...this.chartingPresetSnapshot() }; }
  applyChartingPreset(id) {
    const current = this.chartingPresetSnapshot();
    const candidate = current.presets.find(item => item.id === id);
    if (!candidate || candidate.mode !== current.mode) return { ok:false, ...current };
    const preset=this.app.customChips.library.applyPreset(id);
    if (!preset) return { ok:false, ...this.chartingPresetSnapshot() };
    this.app.customChips.reload();
    if (this.app.tagger?.getCurrentPlay?.()) this.app.nativeTagging?.setUnit?.(preset.unit);
    this._toast(`Charting preset "${preset.name}" applied.`);
    return { ok:true, preset, ...this.chartingPresetSnapshot() };
  }
  deleteChartingPreset(id) {
    const ok = this.app.customChips.library.deletePreset(id);
    if (ok) this.app.customChips.reload();
    return { ok, ...this.chartingPresetSnapshot() };
  }
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
