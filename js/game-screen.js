import { h } from 'preact';
import { NativeGameForm } from './native-game-form.jsx';
import { ConfirmDeleteForm } from './native-team-hub.jsx';

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
    const scout = store.data?.kind === 'scout';
    const scoutTarget = String(store.data?.scout?.opponent || '').trim();
    const source = mode === 'create' ? {} : clone(storage.gameInfo || active.gameInfo || {});
    const initial = {
      week: source.week || '', opponent: source.opponent || '',
      date: source.date || (mode === 'create' ? new Date().toISOString().slice(0, 10) : ''),
      homeAway: source.homeAway || '', gameType: source.gameType || 'game',
      perspective: scout ? 'scout' : (source.perspective || 'offense'), sourceTeamA: source.sourceTeamA || scoutTarget, sourceTeamB: source.sourceTeamB || '', scoreUs: source.scoreUs ?? '', scoreThem: source.scoreThem ?? '',
    };
    const context = {
      mode, gameId: String(active.id), before: clone(store.data),
      liveInfo: clone(storage.gameInfo || {}), defaultUnit: this.app.tagger?.defaultUnit,
    };
    let handle;
    handle = this.overlays.dialog({
      id: 'game-details', title: mode === 'create' ? (scout ? 'New source game' : 'New game') : (scout ? 'Source game settings' : 'Game settings'), returnFocus, unsaved: true,
      initialFocus: `[name="${focus || (mode === 'create' ? 'week' : 'opponent')}"]`, actions: [],
      content: h(NativeGameForm, {
        mode, initial, trackedScore: this.app.stats.computeScoreboard(), scout, scoutTarget,
        onCancel: () => handle.close('cancel'),
        onSubmit: async values => {
          const result = await this.save(values, context);
          if (result.ok) handle.close(result.gameId || 'saved');
          return result;
        },
        onDelete: mode === 'edit' ? () => this._deleteCurrent(context, handle) : null,
      }),
    });
    this.handle = handle;
    const result = handle.result.finally(() => { if (this.handle === handle) this.handle = null; });
    return result;
  }

  async _deleteCurrent(context, parentHandle) {
    const storage = this.app.storage;
    const store = storage?.seasonStore;
    const game = store?.activeGame?.();
    if (!game || String(game.id) !== context.gameId) {
      this.app.history?._toast('The open game changed. Nothing was deleted.');
      return false;
    }
    const index = store.activeIndex?.() ?? 0;
    const name = store.gameName?.(game, index) || game.gameInfo?.opponent || 'this game';
    const plays = game.plays?.length || 0;
    let confirm;
    confirm = this.overlays.dialog({
      title: `Delete ${name}?`, destructive: true, parentId: parentHandle.id,
      initialFocus: '[name="confirm"]',
      actions: [{ key: 'cancel', label: 'Cancel', default: true }],
      content: h(ConfirmDeleteForm, {
        impact: `${plays} charted play${plays === 1 ? '' : 's'} will be removed. Managed film remains recoverable for ${Math.round(storage.undoGameWindowMs() / 1000)} seconds; linked original folders are never deleted.`,
        confirmLabel: 'Delete game',
        onSubmit: async () => { confirm.close('delete'); return { ok: true }; },
      }),
    });
    if (await confirm.result !== 'delete') return false;
    if (String(store.data?.activeGameId || '') !== context.gameId) {
      this.app.history?._toast('The open game changed. Nothing was deleted.');
      return false;
    }
    storage.removeGame(context.gameId);
    parentHandle.close('deleted');
    await this.app.workspaceShell?.show?.('home');
    this.app.history?._toast(`Removed "${name}"`, {
      duration: storage.undoGameWindowMs(),
      action: { label: 'Undo', fn: () => {
        if (storage.undoRemoveGame()) {
          this.app.workspaceShell?._syncChrome?.();
          void this.app.workspaceShell?.show?.('home');
          this.app.history?._toast('Game restored');
        }
      } },
    });
    return true;
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
          game.gameInfo = { ...(game.gameInfo || {}), perspective: store.data?.kind === 'scout' ? 'scout' : 'offense' };
        }
        storage._clearForNewGame();
        await storage._loadActiveGame({ renderGames: false });
      }

      if (store.data?.kind === 'scout') values = { ...values, opponent: store.data?.scout?.opponent || values.opponent, perspective: 'scout', gameType: 'scout' };
      this.app._applyGameInfoDraft(values);
      if (store.data?.kind === 'scout') {
        const game = store.activeGame();
        const matchup = [values.sourceTeamA, values.sourceTeamB].filter(Boolean).join(' vs ');
        if (game && matchup) { game.name = matchup; storage.gameInfo.projectName = matchup; }
      }
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
