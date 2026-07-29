/**
 * UIPolish - Small interactions for the UX pass: mobile tool drawer,
 * panel behavior, and responsive navigation.
 */
/* The classic game-switcher dropdown used to own Escape while open, so the
   drawer/menu Esc handlers had to defer to it via a `uiDropdownClosed()` guard.
   That dropdown is deleted (Home is the sole game entry), leaving nothing to
   defer to — the guard is gone rather than left as a function that can only
   ever return true. */

export class UIPolish {
  constructor(app = null) {
    this.app = app;
    this._initSidebarDrawer();
    this._initPanelCollapse();
    this._initBottomTabs();
    this._initEmptyStateCTA();
    this._initVideoLoadedHint();
    this._bindFilmStorageSettings();
  }
  _activeFilmGame() {
    const store = this.app?.storage?.seasonStore;
    return store?.data ? store.activeGame?.() || null : null;
  }


  _filmBackend() { return this.app?.storage?.seasonStore?.backend || null; }

  _isDesktopFilm() {
    const backend = this._filmBackend();
    return !!(window.__TAURI__ && backend?.supportsLinkedFilm?.());
  }

  initFilmStorageSetup() {
    if (!this._isDesktopFilm()) return;
    document.getElementById('filmStoragePanel')?.removeAttribute('hidden');
    this._renderFilmStorageSettings();
    const backend = this._filmBackend();
    if (!backend.getFilmStorageMode?.()) setTimeout(() => this.ensureFilmStorageMode(), 120);
  }

  _bindFilmStorageSettings() {
    document.getElementById('btnFilmStorageSetup')?.addEventListener('click', event => {
      this.app?.settingsScreen?.open?.({ returnFocus: event.currentTarget });
    });
    document.getElementById('btnLinkGameFolder')?.addEventListener('click', async () => {
      await this.app?.storage?.linkFilmFolder?.();
      this._renderFilmStorageSettings();
    });
    document.getElementById('btnOpenGameFilmFolder')?.addEventListener('click', async () => {
      const backend = this._filmBackend();
      const game = this._activeFilmGame();
      if (!game || game.filmMode !== 'linked') return;
      const opened = await backend?.openLinkedDir?.(game.filmDir);
      if (!opened) this.app?.tagger?.toast?.('COULD NOT OPEN THAT FILM FOLDER');
    });
  }

  _renderFilmStorageSettings() {
    const panel = document.getElementById('filmStoragePanel');
    if (!panel || !this._isDesktopFilm()) return;
    panel.hidden = false;
    const backend = this._filmBackend();
    const game = this._activeFilmGame();
    const mode = backend.getFilmStorageMode?.() || '';
    const root = backend.getLibraryRoot?.() || '';
    const modeEl = document.getElementById('filmStorageModeLabel');
    const pathEl = document.getElementById('filmStoragePathLabel');
    const btn = document.getElementById('btnFilmStorageSetup');
    if (modeEl) modeEl.textContent = mode === 'linked' ? 'Linked existing library' : mode === 'managed' ? 'Managed storage - copies film' : 'Not set up';
    if (pathEl) pathEl.textContent = mode === 'linked'
      ? (root || 'Choose a film library folder')
      : mode === 'managed'
        ? 'Film added through import is copied into GridIron IQ app storage.'
        : 'Choose how GridIron IQ should store game film.';
    if (btn) btn.textContent = mode === 'linked' ? 'Change library root' : mode ? 'Change storage mode' : 'Set up film storage';

    const source = document.getElementById('gameFilmSource');
    const sourceMode = document.getElementById('gameFilmSourceMode');
    const sourcePath = document.getElementById('gameFilmSourcePath');
    const linkBtn = document.getElementById('btnLinkGameFolder');
    const openBtn = document.getElementById('btnOpenGameFilmFolder');
    if (source) source.hidden = false;
    if (!game) {
      if (sourceMode) sourceMode.textContent = 'No game open';
      if (sourcePath) sourcePath.textContent = 'Open a season and select a game to link its film.';
      if (linkBtn) linkBtn.disabled = true;
      if (openBtn) openBtn.hidden = true;
    } else if (game.filmMode === 'linked' && game.filmDir) {
      if (sourceMode) sourceMode.textContent = 'Linked - plays from your library';
      if (sourcePath) sourcePath.textContent = 'Resolving linked folder...';
      if (linkBtn) { linkBtn.disabled = false; linkBtn.textContent = 'Change game folder'; }
      if (openBtn) openBtn.hidden = false;
      const token = `${game.id}:${game.filmDir}:${root}`;
      this._filmSourceRenderToken = token;
      Promise.resolve(backend.linkedGameDir?.(game.filmDir)).then(absDir => {
        if (this._filmSourceRenderToken !== token) return;
        if (sourcePath) sourcePath.textContent = absDir || 'Linked folder unavailable - choose Change game folder.';
      }).catch(() => {
        if (this._filmSourceRenderToken === token && sourcePath) sourcePath.textContent = 'Linked folder unavailable - choose Change game folder.';
      });
    } else if (game.filmMode === 'managed') {
      if (sourceMode) sourceMode.textContent = 'Managed copy';
      if (sourcePath) sourcePath.textContent = 'This game uses a copy in GridIron IQ app storage.';
      if (linkBtn) { linkBtn.disabled = false; linkBtn.textContent = 'Link existing folder instead'; }
      if (openBtn) openBtn.hidden = true;
    } else {
      if (sourceMode) sourceMode.textContent = 'No folder linked for this game';
      if (sourcePath) sourcePath.textContent = mode === 'linked'
        ? 'Choose this game\'s folder inside the Film Library Root.'
        : 'Set up film storage, then choose this game\'s folder.';
      if (linkBtn) { linkBtn.disabled = false; linkBtn.textContent = 'Link game folder'; }
      if (openBtn) openBtn.hidden = true;
    }
    this._renderEmptyFilmActions();
  }

  ensureFilmStorageMode({ force = false, returnFocus = null } = {}) {
    const backend = this._filmBackend();
    if (!this._isDesktopFilm()) return Promise.resolve('managed');
    const current = backend.getFilmStorageMode?.() || '';
    if (current && !force) return Promise.resolve(current);
    if (this._filmStoragePromise && !this.app?.settingsScreen?.handle) this._filmStoragePromise = null;
    if (this._filmStoragePromise) return this._filmStoragePromise;
    const required = !current;
    this._filmStoragePromise = Promise.resolve(this.app?.settingsScreen?.open?.({ required, returnFocus }))
      .then(value => required ? value : (backend.getFilmStorageMode?.() || current))
      .finally(() => {
        this._filmStoragePromise = null;
        this._renderFilmStorageSettings();
      });
    return this._filmStoragePromise;
  }
  /** Resolve desktop import intent before VideoController loads any files. */
  async prepareFilmFiles(_files) {
    if (!this._isDesktopFilm()) return true;
    const game = this.app?.storage?.seasonStore?.activeGame?.();
    if (!game) {
      this.app?.tagger?.toast?.('OPEN A GAME BEFORE ADDING FILM');
      return false;
    }
    const mode = await this.ensureFilmStorageMode();
    if (!mode) return false;
    if (mode === 'managed' || game.filmMode === 'managed') return true;
    if (game.filmMode === 'linked') {
      await this.app?.storage?.linkFilmFolder?.();
      return false;
    }
    const choice = await this.app?.tagger?._choiceDialog?.(
      'Your existing film library is the default. Link this game folder with no copy, or intentionally copy the selected files into GridIron IQ?',
      [
        { key: 'link', label: 'Link game folder', variant: 'btn-accent' },
        { key: 'copy', label: 'Copy selected files' },
        { key: 'cancel', label: 'Cancel' },
      ]
    );
    if (choice === 'copy') return true;
    if (choice === 'link') await this.app?.storage?.linkFilmFolder?.();
    return false;
  }

  _initSidebarDrawer() {
    const btn = document.getElementById('btnSidebarToggle');
    const drawer = document.querySelector('.settings-drawer');
    if (!btn || !drawer) return;

    // Inject a scrim
    let scrim = document.querySelector('.drawer-scrim');
    if (!scrim) {
      scrim = document.createElement('div');
      scrim.className = 'drawer-scrim';
      document.body.appendChild(scrim);
    }
    const close = () => {
      const wasAboveLibrary = drawer.classList.contains('drawer-above-library');
      drawer.classList.remove('open');
      scrim.classList.remove('active');
      // Drop the raised z-index used when opened from the library overlay.
      drawer.classList.remove('drawer-above-library');
      scrim.classList.remove('drawer-above-library');
      // The library underneath shows roster count + checklist state — refresh
      // them so adding players is acknowledged the moment the drawer closes.
      if (wasAboveLibrary && window.app?.library) {
        window.app.library._renderTeamCard?.();
        window.app.library._render?.();
      }
    };
    const open = () => {
      drawer.classList.add('open');
      scrim.classList.add('active');
    };
    btn.addEventListener('click', event => {
      this.app?.settingsScreen?.open?.({ returnFocus: event.currentTarget });
    });
    scrim.addEventListener('click', close);
    document.getElementById('settingsDrawerClose')?.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      // Yield Escape to the game dropdown when it's open — registration
      // order means stopImmediatePropagation there can't shield us.
      if (e.key === 'Escape') close();
    });
    // Expose for the bottom tab bar
    this._closeDrawer = close;
    this._openDrawer = open;
  }

  _initPanelCollapse() {
    document.querySelectorAll('.panel-title[data-toggle]').forEach(title => {
      title.addEventListener('click', () => {
        const id = title.getAttribute('data-toggle');
        const body = document.getElementById(id);
        if (body) body.classList.toggle('collapsed');
      });
    });
  }

  /**
   * Bottom tab bar (mobile only). Routes taps to existing UI rather than
   * restructuring the DOM. Four tabs: Video / Tag / Stats / More.
   */
  _initBottomTabs() {
    const nav = document.createElement('nav');
    nav.className = 'bottom-tabs';
    nav.innerHTML = `
      <button class="bt-tab active" data-tab="video" aria-label="Video">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        <span>Video</span>
      </button>
      <button class="bt-tab" data-tab="stats" aria-label="Stats">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
        <span>Stats</span>
      </button>
      <button class="bt-tab" data-tab="selfscout" aria-label="Self-Scout">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="20" y1="20" x2="16.65" y2="16.65"/></svg>
        <span>Self-Scout</span>
      </button>
      <button class="bt-tab" data-tab="more" aria-label="More">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        <span>Menu</span>
      </button>
    `;
    document.body.appendChild(nav);

    const drawer = document.querySelector('.settings-drawer');
    const scrim = document.querySelector('.drawer-scrim');

    const setActive = (name) => {
      nav.querySelectorAll('.bt-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === name));
    };

    const closeDrawer = () => {
      drawer?.classList.remove('open');
      scrim?.classList.remove('active');
    };
    const openDrawer = () => {
      drawer?.classList.add('open');
      scrim?.classList.add('active');
    };
    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.bt-tab');
      if (!btn) return;
      const tab = btn.dataset.tab;
      setActive(tab);

      if (tab === 'video') {
        closeDrawer();
        document.getElementById('statsDashboard')?.classList.add('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (tab === 'stats') {
        closeDrawer();
        document.getElementById('btnShowStats')?.click();
      } else if (tab === 'selfscout') {
        closeDrawer();
        window.app?.stats?.renderSelfScout();
      } else if (tab === 'more') {
        openDrawer();
      }
    });

    // Keep Video tab active by default when closing drawers elsewhere
    this._setBottomTab = setActive;

    // The stats overlay and the drawer both close via their own ✕/backdrop,
    // which this tab bar can't see — watch them so the highlight never lies
    // about where the user is.
    // During S1 the public #statsDashboard id transfers to native Reports.
    // This legacy mobile observer therefore watches the native node, but the
    // entire bottom bar is hidden under the workspace shell. Delete it with the
    // rest of the legacy mobile bar in S4/S7; it must not become route ownership.
    const statsEl = document.getElementById('statsDashboard');
    if (statsEl) {
      new MutationObserver(() => {
        if (statsEl.classList.contains('hidden') &&
            nav.querySelector('.bt-tab.active')?.dataset.tab !== 'more' &&
            !drawer?.classList.contains('open')) {
          setActive('video');
        }
      }).observe(statsEl, { attributes: true, attributeFilter: ['class'] });
    }
    if (drawer) {
      new MutationObserver(() => {
        if (!drawer.classList.contains('open') &&
            nav.querySelector('.bt-tab.active')?.dataset.tab === 'more') {
          setActive('video');
        }
      }).observe(drawer, { attributes: true, attributeFilter: ['class'] });
    }
  }

  /**
   * Turn the empty video area into a giant tap target that loads a video.
   */
  _initEmptyStateCTA() {
    const placeholder = document.getElementById('videoPlaceholder');
    const fileInput = document.getElementById('videoFileInput');
    if (!placeholder || !fileInput) return;

    placeholder.innerHTML = `
      <div class="dropzone-card">
        <svg class="dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect width="18" height="18" x="3" y="3" rx="2"/>
          <path d="M7 3v18M3 7.5h4M3 12h18M3 16.5h4M17 3v18M17 7.5h4M17 16.5h4"/>
        </svg>
        <div class="dropzone-title" id="dropzoneTitle">Add game film</div>
        <div class="dropzone-actions">
          <button class="btn btn-accent" type="button" data-action="file">Add Video</button>
          <button class="btn btn-secondary" type="button" data-action="folder">Add Folder</button>
          ${window.__TAURI__ ? '<button class="btn btn-secondary" type="button" data-action="link">Link Existing Folder</button>' : ''}
        </div>
        <div class="empty-hint">${window.__TAURI__ ? 'Link references clips in your own folder — no copy. ' : ''}or drop a video or folder anywhere</div>
      </div>
    `;
    placeholder.querySelector('[data-action="file"]').addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
    const folderInput = document.getElementById('videoFolderInput');
    placeholder.querySelector('[data-action="folder"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (folderInput) folderInput.click();
    });
    const linkBtn = placeholder.querySelector('[data-action="link"]');
    if (linkBtn) linkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const current = this._filmBackend()?.getFilmStorageMode?.() || '';
      if (!current) {
        this.ensureFilmStorageMode().then(mode => {
          if (mode === 'linked') this.app?.storage?.linkFilmFolder?.();
        });
      } else {
        this.app?.storage?.linkFilmFolder?.();
      }
    });
    this._renderEmptyFilmActions();
  }

  _renderEmptyFilmActions() {
    const placeholder = document.getElementById('videoPlaceholder');
    if (!placeholder || !window.__TAURI__) return;
    const mode = this._filmBackend()?.getFilmStorageMode?.() || '';
    const fileBtn = placeholder.querySelector('[data-action="file"]');
    const folderBtn = placeholder.querySelector('[data-action="folder"]');
    const linkBtn = placeholder.querySelector('[data-action="link"]');
    if (!fileBtn || !folderBtn || !linkBtn) return;
    fileBtn.textContent = mode === 'linked' ? 'Copy Video' : 'Add Video';
    folderBtn.textContent = mode === 'linked' ? 'Copy Folder' : 'Add Folder';
    linkBtn.textContent = mode ? 'Link Game Folder' : 'Choose Film Storage';
    fileBtn.classList.toggle('btn-accent', mode !== 'linked');
    fileBtn.classList.toggle('btn-secondary', mode === 'linked');
    linkBtn.classList.toggle('btn-accent', mode === 'linked' || !mode);
    linkBtn.classList.toggle('btn-secondary', mode === 'managed');
    const hint = placeholder.querySelector('.empty-hint');
    if (hint) hint.textContent = mode === 'linked'
      ? 'Linked film plays from your library without making a copy.'
      : mode === 'managed'
        ? 'Imported film is copied into GridIron IQ. Link a folder to use it in place.'
        : 'Choose where film should live before adding it.';
    const topLabel = document.getElementById('fileLabel');
    const folderLabel = document.querySelector('#btnLoadFolder .btn-label');
    if (topLabel) topLabel.textContent = mode === 'linked'
      ? 'Link from the game below, or drop files to choose'
      : mode === 'managed' ? 'Drop video(s) / folder or click to load' : 'Choose film storage before adding film';
    if (folderLabel) folderLabel.textContent = mode === 'linked' ? 'Copy Folder' : 'Folder';
  }

  /**
   * Show a brief onboarding hint once a video is loaded telling the user
   * where to go next.
   */
  _initVideoLoadedHint() {
    const video = document.getElementById('videoPlayer');
    if (!video) return;
    const shown = localStorage.getItem('ffa_hint_shown');
    video.addEventListener('loadedmetadata', () => {
      if (shown) return;
      localStorage.setItem('ffa_hint_shown', '1');
      const hint = document.createElement('div');
      hint.className = 'onboard-hint';
      hint.innerHTML = `
        <div class="onboard-hint-body">
          <strong>Ready to tag:</strong> Play 1 was created for this film —
          tap the chips in the tag form to chart it. (For one continuous game
          video, use <b>[</b> and <b>]</b> to mark each play's start/end.)
          <button class="onboard-close">Got it</button>
        </div>`;
      document.body.appendChild(hint);
      const close = () => hint.remove();
      hint.querySelector('.onboard-close').addEventListener('click', close);
      setTimeout(close, 7000);
    }, { once: true });
  }
}
