/**
 * UIPolish - Small interactions for the UX pass: More menu dropdown,
 * mobile sidebar drawer, and outside-click handling.
 */
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
    };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.contains('hidden') ? open() : close();
    });
    // Close when clicking inside a menu item button (let its handler run)
    menu.addEventListener('click', (e) => {
      if (e.target.closest('button')) setTimeout(close, 0);
    });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && e.target !== btn) close();
    });
    document.addEventListener('keydown', (e) => {
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
      drawer.classList.remove('open');
      scrim.classList.remove('active');
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
      <button class="bt-tab" data-tab="tag" aria-label="Tag">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41L13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
        <span>Tag</span>
      </button>
      <button class="bt-tab" data-tab="stats" aria-label="Stats">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
        <span>Stats</span>
      </button>
      <button class="bt-tab" data-tab="more" aria-label="More">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
        <span>More</span>
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
      } else if (tab === 'tag') {
        closeDrawer();
        closeMore();
        document.getElementById('statsDashboard')?.classList.add('hidden');
        // The tag form is always on-page now — just scroll it into view
        const section = document.querySelector('.tag-section');
        if (section) {
          setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
        }
      } else if (tab === 'stats') {
        closeDrawer();
        closeMore();
        document.getElementById('btnShowStats')?.click();
      } else if (tab === 'more') {
        closeMore();
        openDrawer();
      }
    });

    // Keep Video tab active by default when closing drawers elsewhere
    this._setBottomTab = setActive;
  }

  /**
   * Turn the empty video area into a giant tap target that loads a video.
   */
  _initEmptyStateCTA() {
    const placeholder = document.getElementById('videoPlaceholder');
    const fileInput = document.getElementById('videoFileInput');
    if (!placeholder || !fileInput) return;

    placeholder.innerHTML = `
      <button class="empty-cta" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <span class="empty-cta-title">Load Video</span>
        <span class="empty-cta-sub">Tap to select a game film file</span>
      </button>
      <div class="empty-hint">or drop a video file anywhere</div>
    `;
    placeholder.querySelector('.empty-cta').addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
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
          <strong>Next step:</strong> Mark a play with <b>[</b> and <b>]</b>,
          then tag it right below the video.
          <button class="onboard-close">Got it</button>
        </div>`;
      document.body.appendChild(hint);
      const close = () => hint.remove();
      hint.querySelector('.onboard-close').addEventListener('click', close);
      setTimeout(close, 7000);
    }, { once: true });
  }
}
