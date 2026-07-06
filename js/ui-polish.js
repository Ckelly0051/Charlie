/**
 * UIPolish - Small interactions for the UX pass: More menu dropdown,
 * mobile sidebar drawer, and outside-click handling.
 */
/** True when the game-switcher dropdown is NOT open (it owns Esc while open). */
function uiDropdownClosed() {
  const dd = document.getElementById('gameDropdown');
  return !dd || dd.classList.contains('hidden');
}

export class UIPolish {
  constructor() {
    this._initMoreMenu();
    this._initSidebarDrawer();
    this._initPanelCollapse();
    this._initBottomTabs();
    this._initEmptyStateCTA();
    this._initVideoLoadedHint();
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
      if (e.key === 'Escape' && uiDropdownClosed()) close();
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
      if (e.key === 'Escape' && uiDropdownClosed()) close();
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
        </div>
        <div class="empty-hint">or drop a video or folder anywhere</div>
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
