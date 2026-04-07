/**
 * TagWorkspace - The primary view of the app once a video is loaded.
 *
 * Goal: make tagging plays the single most-discoverable, frictionless action
 * in the app. Video on the left, persistent tag form pinned to the right,
 * giant "Save & Next ▶" button, live progress bar showing
 * "Play 12 of 47 — 25% tagged".
 *
 * The workspace mirrors the existing PlayTagger sidebar form (writing into
 * the same hidden inputs) so all downstream stats / filters / exports keep
 * working without modification.
 */
export class TagWorkspace {
  // Field schema — order matters; this is the visual order in the workspace.
  static FIELDS = [
    { id: 'down',      label: 'Down',     type: 'pills', src: 'tagDown',
      options: [['1', '1st'], ['2', '2nd'], ['3', '3rd'], ['4', '4th']] },
    { id: 'distance',  label: 'Distance', type: 'number', src: 'tagDistance', placeholder: 'Yds', min: 0, max: 99 },
    { id: 'fieldSide', label: 'Side',     type: 'pills', src: 'tagFieldSide',
      options: [['own', 'Own'], ['opp', 'Opp']] },
    { id: 'yardLine',  label: 'Yard Line', type: 'number', src: 'tagYardLine', placeholder: 'Yd', min: 1, max: 50 },
    { id: 'hash',      label: 'Hash',     type: 'pills', src: 'tagHash',
      options: [['Left', 'L'], ['Middle', 'M'], ['Right', 'R']] },
    { id: 'formation', label: 'Formation', type: 'pills', src: 'tagFormation', wide: true,
      options: [
        ['Shotgun', 'Shotgun'], ['Under Center', 'U-Center'], ['Pistol', 'Pistol'],
        ['I-Form', 'I-Form'], ['Singleback', 'Single'], ['Empty', 'Empty'],
        ['Wildcat', 'Wildcat'], ['Goal Line', 'Goal Line']
      ] },
    { id: 'personnel', label: 'Personnel', type: 'pills', src: 'tagPersonnel', wide: true,
      options: [['11','11'], ['12','12'], ['10','10'], ['21','21'], ['22','22'], ['13','13'], ['00','00']] },
    { id: 'playType',  label: 'Play Type', type: 'pills', src: 'tagPlayType', wide: true,
      options: [
        ['Run Inside', 'Run In'], ['Run Outside', 'Run Out'],
        ['Short Pass', 'Short'], ['Medium Pass', 'Medium'], ['Deep Pass', 'Deep'],
        ['Screen', 'Screen'], ['Play Action', 'PA'], ['RPO', 'RPO']
      ] },
    { id: 'result',    label: 'Result', type: 'pills', src: 'tagResult', wide: true,
      options: [
        ['Gain', 'Gain'], ['No Gain', 'None'], ['Loss', 'Loss'],
        ['Incomplete', 'Inc'], ['Touchdown', 'TD'], ['Sack', 'Sack'],
        ['Interception', 'INT'], ['Fumble', 'Fum'], ['Penalty', 'Pen']
      ] },
    { id: 'yardage',   label: 'Yards Gained', type: 'number', src: 'tagYardage', placeholder: 'Yds', min: -30, max: 99 },
  ];

  constructor({ videoController, tagger, wizard }) {
    this.vc = videoController;
    this.tagger = tagger;
    this.wizard = wizard;
    this.collapsed = false;

    this._inject();
    this._wire();
    this._render();
  }

  _inject() {
    const wrap = document.createElement('aside');
    wrap.id = 'tagWorkspace';
    wrap.className = 'tw';
    wrap.innerHTML = `
      <header class="tw-header">
        <div class="tw-progress">
          <div class="tw-progress-text">
            <span class="tw-current-play">No play selected</span>
            <span class="tw-progress-counter" id="twCounter">0 of 0 tagged</span>
          </div>
          <div class="tw-progress-bar"><div class="tw-progress-fill" id="twProgressFill"></div></div>
        </div>
        <button class="tw-collapse" id="twCollapse" title="Collapse panel">×</button>
      </header>

      <div class="tw-body">
        <div class="tw-empty" id="twEmpty">
          <div class="tw-empty-icon">⚡</div>
          <div class="tw-empty-title">No plays yet</div>
          <div class="tw-empty-sub">Auto-detect from the video, or mark manually with <kbd>[</kbd> and <kbd>]</kbd>.</div>
          <button class="tw-btn-pri" id="twAutoDetect">⚡ Auto-Detect Plays</button>
          <button class="tw-btn-sec" id="twMarkStart">Mark Play Start [</button>
        </div>

        <div class="tw-form hidden" id="twForm"></div>
      </div>

      <footer class="tw-footer hidden" id="twFooter">
        <button class="tw-nav-btn" id="twPrev" title="Previous play (Shift+←)">◀ Prev</button>
        <button class="tw-save-next" id="twSaveNext">
          <span class="tw-save-label">Save & Next</span>
          <span class="tw-save-arrow">▶</span>
        </button>
        <button class="tw-nav-btn" id="twNext" title="Next play (Shift+→)">Next ▶</button>
      </footer>
    `;
    // Insert as a sibling of .video-section inside .main-content
    const main = document.querySelector('.main-content');
    main?.appendChild(wrap);

    // Pinned floating toggle when collapsed
    const reopen = document.createElement('button');
    reopen.className = 'tw-reopen hidden';
    reopen.id = 'twReopen';
    reopen.innerHTML = '🏷 Tag <span id="twReopenBadge">0</span>';
    document.body.appendChild(reopen);

    this.el = wrap;
    this.formEl = wrap.querySelector('#twForm');
    this.emptyEl = wrap.querySelector('#twEmpty');
    this.footerEl = wrap.querySelector('#twFooter');
    this.counterEl = wrap.querySelector('#twCounter');
    this.fillEl = wrap.querySelector('#twProgressFill');
    this.currentPlayEl = wrap.querySelector('.tw-current-play');
    this.reopenBtn = reopen;
  }

  _buildForm() {
    const fields = TagWorkspace.FIELDS;
    let html = '';
    for (const f of fields) {
      const wide = f.wide ? ' tw-row-wide' : '';
      html += `<div class="tw-row${wide}" data-field="${f.id}">
        <label class="tw-row-label">${f.label}</label>
        <div class="tw-row-input">`;
      if (f.type === 'pills') {
        html += `<div class="tw-pills" data-src="${f.src}">`;
        for (const [val, label] of f.options) {
          html += `<button type="button" class="tw-pill" data-val="${this._esc(val)}">${this._esc(label)}</button>`;
        }
        html += `</div>`;
      } else if (f.type === 'number') {
        html += `<input type="number" class="tw-num" data-src="${f.src}" placeholder="${f.placeholder || ''}" min="${f.min ?? ''}" max="${f.max ?? ''}">`;
      }
      html += `</div></div>`;
    }
    // Notes mini
    html += `
      <div class="tw-row tw-row-wide" data-field="notes">
        <label class="tw-row-label">Notes</label>
        <div class="tw-row-input">
          <textarea class="tw-notes" id="twNotes" placeholder="Quick notes for this play (optional)"></textarea>
        </div>
      </div>
    `;
    this.formEl.innerHTML = html;

    // Wire pill clicks
    this.formEl.querySelectorAll('.tw-pills').forEach(pillRow => {
      const src = pillRow.dataset.src;
      pillRow.querySelectorAll('.tw-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          const allPills = pillRow.querySelectorAll('.tw-pill');
          const wasActive = pill.classList.contains('active');
          allPills.forEach(p => p.classList.remove('active'));
          if (!wasActive) pill.classList.add('active');
          const hidden = document.getElementById(src);
          if (hidden) {
            hidden.value = wasActive ? '' : pill.dataset.val;
            hidden.dispatchEvent(new Event('change', { bubbles: true }));
          }
          this._haptic();
          this._maybeAutoAdvance();
        });
      });
    });

    this.formEl.querySelectorAll('.tw-num').forEach(num => {
      num.addEventListener('input', () => {
        const hidden = document.getElementById(num.dataset.src);
        if (hidden) {
          hidden.value = num.value;
          hidden.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });

    const notes = this.formEl.querySelector('#twNotes');
    notes?.addEventListener('input', () => {
      const play = this.tagger.getCurrentPlay();
      if (play) {
        play.notes = notes.value;
        this.tagger._emit('play-updated', play);
      }
    });
  }

  _wire() {
    this._buildForm();

    // Empty state actions
    this.el.querySelector('#twAutoDetect').addEventListener('click', () => {
      document.getElementById('btnAutoDetect')?.click();
    });
    this.el.querySelector('#twMarkStart').addEventListener('click', () => {
      document.getElementById('btnMarkStart')?.click();
    });

    // Footer actions
    this.el.querySelector('#twSaveNext').addEventListener('click', () => this.saveAndNext());
    this.el.querySelector('#twPrev').addEventListener('click', () => this.gotoOffset(-1));
    this.el.querySelector('#twNext').addEventListener('click', () => this.gotoOffset(1));

    // Collapse
    this.el.querySelector('#twCollapse').addEventListener('click', () => this.toggle(false));
    this.reopenBtn.addEventListener('click', () => this.toggle(true));

    // Tagger events
    this.tagger.on('play-created', () => this._render());
    this.tagger.on('play-updated', () => this._render());
    this.tagger.on('play-deleted', () => this._render());
    this.tagger.on('play-selected', () => this._loadPlayIntoForm());

    // Global keyboard
    document.addEventListener('keydown', (e) => {
      if (this._isTyping(e.target)) return;
      if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        if (this.tagger.getCurrentPlay()) { e.preventDefault(); this.saveAndNext(); }
      }
    });
  }

  _isTyping(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  }

  _haptic() {
    if (navigator.vibrate) navigator.vibrate(8);
  }

  toggle(open) {
    this.collapsed = !open;
    this.el.classList.toggle('collapsed', this.collapsed);
    this.reopenBtn.classList.toggle('hidden', !this.collapsed);
  }

  saveAndNext() {
    const play = this.tagger.getCurrentPlay();
    if (!play) return;
    this._haptic();
    this._burst();
    this.gotoOffset(1);
  }

  gotoOffset(delta) {
    const plays = this.tagger.plays;
    if (!plays.length) return;
    const idx = plays.findIndex(p => p.id === this.tagger.currentPlayId);
    const nextIdx = idx === -1 ? 0 : Math.max(0, Math.min(plays.length - 1, idx + delta));
    const next = plays[nextIdx];
    if (next) {
      this.tagger.selectPlay(next.id);
      // Seek video
      if (next.startTime != null && this.vc.video) {
        this.vc.video.currentTime = next.startTime;
      }
    }
  }

  _maybeAutoAdvance() {
    // No-op stub. Could auto-advance once Result is set + all required fields filled.
  }

  _burst() {
    // Visual confirmation
    const burst = document.createElement('div');
    burst.className = 'tw-burst';
    burst.textContent = '✓';
    this.el.querySelector('#twSaveNext').appendChild(burst);
    setTimeout(() => burst.remove(), 600);
  }

  _loadPlayIntoForm() {
    const play = this.tagger.getCurrentPlay();
    if (!play) return;
    const t = play.tags || {};
    // Pills
    this.formEl.querySelectorAll('.tw-pills').forEach(row => {
      const src = row.dataset.src;
      const fieldId = src.replace(/^tag/, '');
      const key = fieldId.charAt(0).toLowerCase() + fieldId.slice(1);
      const val = t[key] || '';
      row.querySelectorAll('.tw-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.val === val);
      });
    });
    // Numbers
    this.formEl.querySelectorAll('.tw-num').forEach(input => {
      const src = input.dataset.src;
      const fieldId = src.replace(/^tag/, '');
      const key = fieldId.charAt(0).toLowerCase() + fieldId.slice(1);
      input.value = t[key] || '';
    });
    // Notes
    const notes = this.formEl.querySelector('#twNotes');
    if (notes) notes.value = play.notes || '';
  }

  _render() {
    const total = this.tagger.plays.length;
    const tagged = this.tagger.plays.filter(p => p.tags && p.tags.playType).length;
    const pct = total ? Math.round((tagged / total) * 100) : 0;

    this.counterEl.textContent = `${tagged} of ${total} tagged · ${pct}%`;
    this.fillEl.style.width = `${pct}%`;
    document.getElementById('twReopenBadge').textContent = `${tagged}/${total}`;

    if (total === 0) {
      this.emptyEl.classList.remove('hidden');
      this.formEl.classList.add('hidden');
      this.footerEl.classList.add('hidden');
      this.currentPlayEl.textContent = 'No play selected';
      return;
    }
    this.emptyEl.classList.add('hidden');
    this.formEl.classList.remove('hidden');
    this.footerEl.classList.remove('hidden');

    const play = this.tagger.getCurrentPlay();
    if (play) {
      const idx = this.tagger.plays.findIndex(p => p.id === play.id);
      this.currentPlayEl.textContent = `Play ${idx + 1} of ${total}`;
      this._loadPlayIntoForm();
    } else {
      // Auto-select first untagged play, or first play
      const target = this.tagger.plays.find(p => !p.tags?.playType) || this.tagger.plays[0];
      if (target) this.tagger.selectPlay(target.id);
    }
  }

  _esc(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
}
