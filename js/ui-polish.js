/**
 * UIPolish - Small interactions for the UX pass: More menu dropdown,
 * mobile sidebar drawer, and outside-click handling.
 */
/* The classic game-switcher dropdown used to own Escape while open, so the
   drawer/menu Esc handlers had to defer to it via a `uiDropdownClosed()` guard.
   That dropdown is deleted (Home is the sole game entry), leaving nothing to
   defer to — the guard is gone rather than left as a function that can only
   ever return true. */

export class UIPolish {
  constructor(app = null) {
    this.app = app;
    this._initMoreMenu();
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
    document.getElementById('btnFilmStorageSetup')?.addEventListener('click', () => {
      this.ensureFilmStorageMode({ force: true });
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

  ensureFilmStorageMode({ force = false } = {}) {
    const backend = this._filmBackend();
    if (!this._isDesktopFilm()) return Promise.resolve('managed');
    const current = backend.getFilmStorageMode?.() || '';
    if (current && !force) return Promise.resolve(current);
    if (this._filmStoragePromise) return this._filmStoragePromise;

    this._filmStoragePromise = new Promise(resolve => {
      document.getElementById('filmStorageSetupModal')?.remove();
      const overlay = document.createElement('div');
      overlay.className = 'film-storage-modal';
      overlay.id = 'filmStorageSetupModal';
      overlay.innerHTML = `
        <div class="film-storage-backdrop"></div>
        <section class="film-storage-card" role="dialog" aria-modal="true" aria-labelledby="filmStorageTitle">
          <div class="film-storage-head">
            <div>
              <div class="film-storage-kicker">DESKTOP SETUP</div>
              <h2 id="filmStorageTitle">Where should your film live?</h2>
            </div>
            <button class="film-storage-close" type="button" data-storage-action="cancel" aria-label="Close">×</button>
          </div>
          <p class="film-storage-intro">Choose once now. You can change this later in Settings. GridIron IQ will never move or delete existing film during setup.</p>
          <div class="film-storage-options">
            <button class="film-storage-option is-recommended" type="button" data-storage-action="linked">
              <span class="film-storage-option-top"><strong>Use my existing film library</strong><em>RECOMMENDED</em></span>
              <span>Choose the folder you already keep on this computer or external drive. GridIron IQ plays files in place and makes no copy.</span>
              <b>Choose library folder</b>
            </button>
            <button class="film-storage-option" type="button" data-storage-action="managed">
              <span class="film-storage-option-top"><strong>Let GridIron IQ manage film</strong></span>
              <span>Simple setup for new users. Imported video is copied into GridIron IQ's private app storage.</span>
              <b>Use managed storage</b>
            </button>
          </div>
          <p class="film-storage-footnote">This choice affects video only. Seasons, tags, reports, and backups keep using GridIron IQ's protected app data.</p>
        </section>`;
      document.body.appendChild(overlay);
      let selectedMode = current;
      const finish = value => {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        this._filmStoragePromise = null;
        this._renderFilmStorageSettings();
        resolve(value);
      };
      const showLinkedConfirmation = picked => {
        const card = overlay.querySelector('.film-storage-card');
        if (!card) return;
        card.innerHTML = `
          <div class="film-storage-head">
            <div><div class="film-storage-kicker">FILM LIBRARY READY</div><h2 id="filmStorageTitle">Existing library connected</h2></div>
            <button class="film-storage-close" type="button" data-storage-action="done" aria-label="Done">×</button>
          </div>
          <div class="film-storage-confirmation" data-storage-confirmation>
            <span class="film-storage-confirm-icon">✓</span>
            <div><strong>Film Library Root</strong><span id="filmStorageConfirmedPath"></span></div>
          </div>
          <p class="film-storage-confirm-copy"><strong>No video will be copied.</strong> For each game, choose its folder inside this library. GridIron IQ will play those original files in place.</p>
          <div class="film-storage-confirm-actions">
            <button class="btn" type="button" data-storage-action="change-root">Choose a different root</button>
            <button class="btn btn-accent" type="button" data-storage-action="done">Done</button>
          </div>`;
        card.querySelector('#filmStorageConfirmedPath').textContent = picked;
        card.setAttribute('data-storage-confirmation', '');
        card.querySelector('.film-storage-confirm-actions [data-storage-action="done"]')?.focus();
      };
      const choose = async action => {
        if (action === 'cancel' || action === 'done') { finish(selectedMode || ''); return; }
        if (action === 'change-root') action = 'linked';
        if (action === 'managed') {
          if (backend.setFilmStorageMode?.('managed') === false) {
            this.app?.tagger?.toast?.('FILM STORAGE SETTING COULD NOT BE SAVED');
            return;
          }
          selectedMode = 'managed';
          this.app?.tagger?.toast?.('FILM STORAGE SET: GRIDIRON IQ MANAGED');
          finish('managed');
          return;
        }
        if (action === 'linked') {
          const picked = await backend.pickFolder?.(backend.getLibraryRoot?.() || undefined);
          if (!picked) return;
          const oldRoot = backend.getLibraryRoot?.() || '';
          const norm = value => String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
          if (oldRoot && norm(oldRoot) !== norm(picked)) {
            const confirmed = await this.app?.tagger?._choiceDialog?.(
              'Change the film library folder? Existing linked games under the old folder may need to be linked again. No film or tags will be deleted.',
              [{ key: 'change', label: 'Change folder', variant: 'btn-accent' }, { key: 'cancel', label: 'Cancel' }]
            );
            if (confirmed !== 'change') return;
          }
          const allowed = await backend.setLibraryRoot?.(picked);
          if (!allowed) { this.app?.tagger?.toast?.('COULD NOT ACCESS THAT FOLDER. TRY ANOTHER LOCATION.'); return; }
          if (backend.setFilmStorageMode?.('linked') === false) {
            await backend.setLibraryRoot?.(oldRoot);
            this.app?.tagger?.toast?.('FILM STORAGE SETTING COULD NOT BE SAVED');
            return;
          }
          selectedMode = 'linked';
          this._renderFilmStorageSettings();
          this.app?.tagger?.toast?.('FILM LIBRARY LINKED - NO VIDEO WILL BE COPIED', 6000);
          showLinkedConfirmation(picked);
        }
      };
      overlay.addEventListener('click', e => {
        const action = e.target.closest('[data-storage-action]')?.dataset.storageAction;
        if (action) choose(action);
      });
      const onKey = e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(selectedMode || ''); }
        if (e.key !== 'Tab') return;
        const focusable = [...overlay.querySelectorAll('button')];
        if (!focusable.length) return;
        const i = focusable.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); focusable[focusable.length - 1].focus(); }
        else if (!e.shiftKey && i === focusable.length - 1) { e.preventDefault(); focusable[0].focus(); }
      };
      document.addEventListener('keydown', onKey, true);
      overlay.querySelector('.film-storage-option')?.focus();
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

  _initMoreMenu() {
    const btn = document.getElementById('btnMoreMenu');
    const menu = document.getElementById('moreDropdown');
    if (!btn || !menu) return;
    const close = () => {
      menu.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
    };
    const open = () => {
      menu.classList.remove('hidden');
      btn.setAttribute('aria-expanded', 'true');
      // Focus the first item so arrow keys walk the menu immediately.
      const first = menu.querySelector('button');
      if (first) setTimeout(() => first.focus(), 0);
    };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.contains('hidden') ? open() : close();
    });
    // Close when clicking inside a menu item button (let its handler run)
    menu.addEventListener('click', (e) => {
      if (e.target.closest('button')) setTimeout(close, 0);
    });
    // Arrow-key navigation inside the open menu (menus are keyboard-walkable).
    menu.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = [...menu.querySelectorAll('button')].filter(el => el.offsetParent !== null);
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && e.target !== btn) close();
    });
    document.addEventListener('keydown', (e) => {
      // The game dropdown owns Escape while open (its own handler closes it).
      if (e.key === 'Escape') close();
    });
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
    btn.addEventListener('click', () => {
      drawer.classList.contains('open') ? close() : open();
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
    const closeMore = () => document.getElementById('moreDropdown')?.classList.add('hidden');

    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.bt-tab');
      if (!btn) return;
      const tab = btn.dataset.tab;
      setActive(tab);

      if (tab === 'video') {
        closeDrawer();
        closeMore();
        document.getElementById('statsDashboard')?.classList.add('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (tab === 'stats') {
        closeDrawer();
        closeMore();
        document.getElementById('btnShowStats')?.click();
      } else if (tab === 'selfscout') {
        closeDrawer();
        closeMore();
        window.app?.stats?.renderSelfScout();
      } else if (tab === 'more') {
        closeMore();
        openDrawer();
      }
    });

    // Keep Video tab active by default when closing drawers elsewhere
    this._setBottomTab = setActive;

    // The stats overlay and the drawer both close via their own ✕/backdrop,
    // which this tab bar can't see — watch them so the highlight never lies
    // about where the user is.
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
