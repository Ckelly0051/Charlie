import { h } from 'preact';
import { NativeGameForm } from './native-game-form.jsx';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

/** Native owner for creating and editing game context. The form is inert until
 * submit; creation, details, and the active-game switch become one durable
 * transaction so Cancel or a failed save cannot leave an empty game behind. */
export class GameScreen {
  constructor(app, overlays) { this.app = app; this.overlays = overlays; this.handle = null; }

  open({ mode = 'edit', focus = '', returnFocus = null } = {}) {
    if (this.handle) return this.handle.result;
    const storage = this.app.storage;
    const store = storage?.seasonStore;
    if (!store?.hasCurrent?.()) return Promise.resolve(false);

    // Capture the live editor into the in-memory season before taking the
    // rollback snapshot. This does not write to disk or create a game.
    storage.commitActive();
    const active = store.activeGame();
    if (!active) return Promise.resolve(false);
    const source = mode === 'create' ? {} : clone(storage.gameInfo || active.gameInfo || {});
    const initial = {
      week: source.week || '', opponent: source.opponent || '',
      date: source.date || (mode === 'create' ? new Date().toISOString().slice(0, 10) : ''),
      homeAway: source.homeAway || '', gameType: source.gameType || 'game',
      perspective: source.perspective || 'offense', scoreUs: source.scoreUs ?? '', scoreThem: source.scoreThem ?? '',
    };
    const context = {
      mode, gameId: String(active.id), before: clone(store.data),
      liveInfo: clone(storage.gameInfo || {}), defaultUnit: this.app.tagger?.defaultUnit,
    };
    let handle;
    handle = this.overlays.dialog({
      id: 'game-details', title: mode === 'create' ? 'New game' : 'Game settings', returnFocus, unsaved: true,
      initialFocus: `[name="${focus || (mode === 'create' ? 'week' : 'opponent')}"]`, actions: [],
      content: h(NativeGameForm, {
        mode, initial, trackedScore: this.app.stats.computeScoreboard(),
        onCancel: () => handle.close('cancel'),
        onSubmit: async values => {
          const result = await this.save(values, context);
          if (result.ok) handle.close(result.gameId || 'saved');
          return result;
        },
      }),
    });
    this.handle = handle;
    const result = handle.result.finally(() => { if (this.handle === handle) this.handle = null; });
    return result;
  }

  async save(values, context) {
    const storage = this.app.storage;
    const store = storage?.seasonStore;
    if (!store?.hasCurrent?.()) return { ok: false, message: 'Open a season before adding a game.' };
    if (String(store.data.activeGameId) !== context.gameId) {
      return { ok: false, message: 'The open game changed. Nothing was saved; reopen Game settings for the intended game.' };
    }

    try {
      if (context.mode === 'create') {
        const reused = store.isEmptyActive();
        if (!reused) {
          const game = store.addGame();
          game.gameInfo = { ...(game.gameInfo || {}), perspective: 'offense' };
        }
        storage._clearForNewGame();
        await storage._loadActiveGame({ renderGames: false });
      }

      this.app._applyGameInfoDraft(values);
      storage.commitActive();
      const saved = await store.persist();
      if (saved === false) throw new Error('The season could not be saved.');

      const game = store.activeGame();
      this.app._afterNewGame();
      this.app.workspaceShell?._syncChrome?.();
      if (context.mode === 'create') {
        const dropzone = document.getElementById('dropzoneTitle');
        if (dropzone) dropzone.textContent = 'Game created — now add the film';
        this.app.history?._toast('Game created — add film to start tagging');
      }
      return { ok: true, gameId: String(game?.id || '') };
    } catch (error) {
      // The failed persist left durable bytes unchanged. Restore the complete
      // in-memory season and live editor from the pre-dialog snapshot.
      store.data = clone(context.before);
      storage.gameInfo = clone(context.liveInfo);
      storage._clearForNewGame();
      await storage._loadActiveGame({ renderGames: false });
      if (context.defaultUnit) this.app.tagger.defaultUnit = context.defaultUnit;
      this.app._renderGamesPanel?.();
      this.app.workspaceShell?._syncChrome?.();
      return { ok: false, message: `${error?.message || 'The game could not be saved.'} Your prior season is unchanged.` };
    }
  }
}
