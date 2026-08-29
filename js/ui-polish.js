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
    this._initPanelCollapse();
    this._initEmptyStateCTA();
    this._initVideoLoadedHint();
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
    const backend = this._filmBackend();
    if (!backend.getFilmStorageMode?.()) setTimeout(() => this.ensureFilmStorageMode(), 120);
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

  // Final Engine Independence: the legacy #btnSidebarToggle launcher is gone
  // -- WorkspaceShell's own .ws-global-tools "settings" button calls
  // settingsScreen.open() directly now.

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
        <p class="dropzone-status" id="videoPlaceholderStatus" hidden></p>
        <div class="dropzone-actions">
          <button class="btn btn-accent" type="button" data-action="file">Add Video</button>
          <button class="btn btn-secondary" type="button" data-action="folder">Add Folder</button>
          ${window.__TAURI__ ? '<button class="btn btn-secondary" type="button" data-action="link">Link Existing Folder</button>' : ''}
        </div>
        <div class="empty-hint">${window.__TAURI__ ? 'Link references clips in your own folder — no copy. ' : ''}or drop a video or folder here</div>
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
    // Final Engine Independence: #fileLabel and #btnLoadFolder were the top-bar
    // owners of this status text -- both deleted with #giLegacyEngineHost. The
    // native empty-state hint above is the sole surviving surface for it.
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
