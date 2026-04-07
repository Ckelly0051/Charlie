/**
 * UIPolish - Small interactions for the UX pass: More menu dropdown,
 * mobile sidebar drawer, and outside-click handling.
 */
export class UIPolish {
  constructor() {
    this._initMoreMenu();
    this._initSidebarDrawer();
    this._initPanelCollapse();
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
    const sidebar = document.querySelector('.sidebar');
    if (!btn || !sidebar) return;

    // Inject a scrim
    let scrim = document.querySelector('.sidebar-scrim');
    if (!scrim) {
      scrim = document.createElement('div');
      scrim.className = 'sidebar-scrim';
      document.body.appendChild(scrim);
    }
    const close = () => {
      sidebar.classList.remove('open');
      scrim.classList.remove('active');
    };
    const open = () => {
      sidebar.classList.add('open');
      scrim.classList.add('active');
    };
    btn.addEventListener('click', () => {
      sidebar.classList.contains('open') ? close() : open();
    });
    scrim.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
  }

  _initPanelCollapse() {
    // Make panel titles toggle their body via data-toggle attribute.
    document.querySelectorAll('.panel-title[data-toggle]').forEach(title => {
      title.addEventListener('click', () => {
        const id = title.getAttribute('data-toggle');
        const body = document.getElementById(id);
        if (body) body.classList.toggle('collapsed');
      });
    });
  }
}
