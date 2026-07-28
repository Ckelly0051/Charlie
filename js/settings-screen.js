import { h } from 'preact';
import { NativeSettingsContent } from './native-settings.jsx';

export class SettingsScreen {
  constructor(app, overlays) {
    this.app = app;
    this.overlays = overlays;
    this.handle = null;
  }

  open({ required = false, returnFocus = null } = {}) {
    if (this.handle) return this.handle.result;
    const finish = value => this.close(value);
    const handle = this.overlays.sheet({
      id: 'team-film-settings',
      title: 'Team & Film Settings',
      modal: false,
      returnFocus,
      dismissOnEscape: !required,
      dismissOnScrim: !required,
      content: h(NativeSettingsContent, { screen: this, required, finish }),
      actions: required ? [] : [{ key: 'done', label: 'Done', tone: 'primary', default: true }],
    });
    this.handle = handle;
    const result = handle.result.finally(() => {
      if (this.handle === handle) this.handle = null;
      this.app.library?._renderTeamCard?.();
      this.app.library?._render?.();
    });
    return result.then(value => required && value !== 'linked' && value !== 'managed' ? '' : value);
  }

  close(value = 'cancel') {
    const handle = this.handle;
    if (!handle) return false;
    this.handle = null;
    return handle.close(value);
  }

  _store() { return this.app.storage?.seasonStore; }
  _backend() { return this._store()?.backend; }
  _desktop() { return !!(window.__TAURI__ && this._backend()?.supportsLinkedFilm?.()); }

  teamProfile() { return this.app.library?._teamProfile?.() || {}; }

  saveTeam(name, color) {
    return this.app.library?.saveTeamIdentity?.(name, color) === true;
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
      return { game, health, path, name: store.gameName?.(game, index) || game.name || game.gameInfo?.opponent || `Game ${index + 1}` };
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
    this.overlays.toast({ message: 'Film library linked. No video was copied.', tone: 'success' });
    this.app.uiPolish?._renderEmptyFilmActions?.();
    return { ok: true, mode: 'linked', message: `Library root connected: ${picked}. No video was copied.` };
  }

  async useManagedStorage() {
    const backend = this._backend();
    if (!this._desktop()) return { ok: false };
    if (backend.setFilmStorageMode?.('managed') === false) return { ok: false, message: 'The storage choice could not be saved.' };
    this.overlays.toast({ message: 'Managed storage selected. Existing linked games stay linked.', tone: 'success' });
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

  async repairGame(gameId) {
    this.close('repair');
    const opened = await this.app.openGame?.(gameId);
    if (opened === false) return false;
    document.getElementById('repairFilmInput')?.click();
    return true;
  }

  openAdvanced() {
    this.close('advanced');
    this.app.uiPolish?._openDrawer?.();
  }
}