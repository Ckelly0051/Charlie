/**
 * Wizard - Guided left-to-right workflow: Load → Detect → Tag → Analyze → Export.
 *
 * Adds a step bar across the top of the app and a contextual floating action
 * card that always tells the user the single best "do this next" step.
 * Each step auto-advances when its completion condition is met; users can
 * also jump freely by tapping any step pill.
 */
import { isPlayTagged } from './football-rules.js';

export class Wizard {
  constructor({ videoController, tagger, stats, history }) {
    this.vc = videoController;
    this.tagger = tagger;
    this.stats = stats;
    this.history = history;
    this.currentStep = 1;
    // Default: wizard is OFF. One-time migration to clear any old "on" pref.
    if (!localStorage.getItem('ffa_wizard_v2')) {
      localStorage.setItem('ffa_wizard_dismissed', '1');
      localStorage.setItem('ffa_wizard_v2', '1');
    }
    const saved = localStorage.getItem('ffa_wizard_dismissed');
    this.dismissed = saved === null ? true : saved === '1';

    this._inject();
    this._wire();
    this._render();
  }

  // ---------- DOM injection ----------
  _inject() {
    // Step bar: sits directly under the top bar.
    const bar = document.createElement('div');
    bar.className = 'wizard-bar';
    bar.innerHTML = `
      <div class="wizard-steps" id="wizSteps">
        ${this._stepDefs().map((s, i) => `
          <button class="wiz-step" data-step="${i + 1}">
            <span class="wiz-num">${i + 1}</span>
            <span class="wiz-label">${s.label}</span>
          </button>
          ${i < 4 ? '<span class="wiz-sep"></span>' : ''}
        `).join('')}
      </div>
      <button class="wiz-dismiss" id="wizDismiss" title="Hide wizard (toggle from More menu)">×</button>
    `;
    const header = document.querySelector('.top-bar');
    header?.after(bar);
    this.bar = bar;

    // Top-bar toggle button (in index.html). No floating reopen anymore.
    this.reopenBtn = document.getElementById('btnToggleWizard');

    // No floating card — step pills handle all actions inline.
    this.card = { classList: { add() {}, remove() {} }, innerHTML: '', querySelector: () => null };
  }

  _stepDefs() {
    return [
      { id: 1, label: 'Load',    key: 'load' },
      { id: 2, label: 'Detect',  key: 'detect' },
      { id: 3, label: 'Tag',     key: 'tag' },
      { id: 4, label: 'Analyze', key: 'analyze' },
      { id: 5, label: 'Export',  key: 'export' },
    ];
  }

  // ---------- Event wiring ----------
  _wire() {
    // Step clicks — allow free navigation.
    document.getElementById('wizSteps')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.wiz-step');
      if (!btn) return;
      const step = parseInt(btn.dataset.step, 10);
      this.goTo(step);
      this._runStepAction(step);
    });

    document.getElementById('wizDismiss')?.addEventListener('click', () => this.setDismissed(true));
    this.reopenBtn?.addEventListener('click', () => this.toggle());

    // Auto-advance on video load.
    this.vc.on('video-loaded', () => {
      if (this.currentStep === 1) this.goTo(2);
    });

    // Auto-advance when plays exist.
    this.tagger.on('play-created', () => {
      if (this.currentStep === 2) this.goTo(3);
      this._render();
    });
    this.tagger.on('play-updated', () => this._render());
    this.tagger.on('play-deleted', () => this._render());
  }

  // ---------- Public API ----------
  goTo(step) {
    this.currentStep = Math.max(1, Math.min(5, step));
    this._render();
    this._runStepSideEffects();
  }

  next() { this.goTo(this.currentStep + 1); }
  prev() { this.goTo(this.currentStep - 1); }

  setDismissed(d) {
    this.dismissed = d;
    localStorage.setItem('ffa_wizard_dismissed', d ? '1' : '0');
    this.bar.classList.toggle('hidden', d);
    this.reopenBtn?.classList.toggle('btn-highlight', !d);
    if (d) this.card.classList.add('hidden');
    else this._render();
  }
  toggle() { this.setDismissed(!this.dismissed); }

  // ---------- Rendering ----------
  _render() {
    if (this.dismissed) {
      this.bar.classList.add('hidden');
      this.reopenBtn?.classList.remove('btn-highlight');
      this.card.classList.add('hidden');
      return;
    }
    this.bar.classList.remove('hidden');
    this.reopenBtn?.classList.add('btn-highlight');

    // Update step pill states.
    const total = this.tagger.plays.length;
    const tagged = this.tagger.plays.filter(isPlayTagged).length;
    document.querySelectorAll('.wiz-step').forEach(btn => {
      const s = parseInt(btn.dataset.step, 10);
      btn.classList.toggle('active', s === this.currentStep);
      btn.classList.toggle('done', this._isStepComplete(s, { total, tagged }));
    });

    // Compose action card for current step.
    const def = this._actionCardFor(this.currentStep, { total, tagged });
    if (!def) { this.card.classList.add('hidden'); return; }

    this.card.innerHTML = `
      <div class="wiz-card-inner">
        <div class="wiz-card-head">
          <span class="wiz-card-step">Step ${this.currentStep} of 5</span>
          <span class="wiz-card-title">${def.title}</span>
          ${def.sub ? `<span class="wiz-card-sub">${def.sub}</span>` : ''}
        </div>
        <div class="wiz-card-actions">
          ${def.primary ? `<button class="wiz-primary">${def.primary.label}</button>` : ''}
          ${def.secondary ? `<button class="wiz-secondary">${def.secondary.label}</button>` : ''}
        </div>
        ${this.currentStep > 1 ? '<button class="wiz-back" title="Back">&larr; Back</button>' : ''}
      </div>`;
    this.card.classList.remove('hidden');

    this.card.querySelector('.wiz-primary')?.addEventListener('click', () => def.primary.onClick());
    this.card.querySelector('.wiz-secondary')?.addEventListener('click', () => def.secondary.onClick());
    this.card.querySelector('.wiz-back')?.addEventListener('click', () => this.prev());
  }

  _isStepComplete(step, { total, tagged }) {
    switch (step) {
      case 1: return !!this.vc.video?.src;
      case 2: return total > 0;
      case 3: return total > 0 && tagged === total;
      case 4: return false; // analyze doesn't auto-complete
      case 5: return false;
      default: return false;
    }
  }

  _actionCardFor(step, { total, tagged }) {
    const hasVideo = !!this.vc.video?.src;

    if (step === 1) {
      return {
        title: 'Load your game film',
        sub: 'Tap the button below, or drop a video file anywhere on the page.',
        primary: { label: '＋ Load Video', onClick: () => document.getElementById('videoFileInput')?.click() },
      };
    }

    if (step === 2) {
      if (!hasVideo) return { title: 'Load a video first', primary: { label: 'Go to Step 1', onClick: () => this.goTo(1) } };
      return {
        title: 'Auto-detect plays',
        sub: 'We\'ll scan the film and drop a marker at every play. You can still tag manually.',
        primary: {
          label: '⚡ Auto-Detect Plays',
          onClick: () => {
            this._openPlayTaggerPanel();
            setTimeout(() => document.getElementById('btnAutoDetect')?.click(), 200);
          }
        },
        secondary: {
          label: 'Skip — I\'ll mark plays manually',
          onClick: () => this.goTo(3)
        }
      };
    }

    if (step === 3) {
      if (total === 0) {
        return {
          title: 'No plays yet',
          sub: 'Mark a play start/end with [ and ] while the video plays, or go back and auto-detect.',
          primary: { label: 'Open Play Tagger', onClick: () => this._openPlayTaggerPanel() },
          secondary: { label: '← Back to Detect', onClick: () => this.goTo(2) }
        };
      }
      return {
        title: `Tag your plays  ·  ${tagged}/${total} done`,
        sub: tagged < total
          ? 'Fill in down, distance, formation, and result. Use Quick Chart for keyboard-only tagging.'
          : 'All plays tagged. Ready to analyze.',
        primary: tagged < total
          ? { label: '⚡ Quick Chart Mode', onClick: () => document.getElementById('btnQuickChart')?.click() }
          : { label: 'See Stats →', onClick: () => this.goTo(4) },
        secondary: tagged >= total
          ? null
          : { label: 'Open Tagger Panel', onClick: () => this._openPlayTaggerPanel() }
      };
    }

    if (step === 4) {
      return {
        title: 'Analyze the game',
        sub: 'Stats, EPA, heat maps, personnel, self-scout.',
        primary: { label: '📊 Open Stats Dashboard', onClick: () => document.getElementById('btnShowStats')?.click() },
        secondary: { label: 'Next: Export →', onClick: () => this.goTo(5) }
      };
    }

    if (step === 5) {
      return {
        title: 'Export & share',
        sub: 'Pick what you need: call sheet, cut-up video, CSV, or HTML report.',
        primary: { label: '📋 Call Sheet / Wristband', onClick: () => document.getElementById('btnCallSheet')?.click() },
        secondary: { label: '🎞 Cut-Up Video', onClick: () => window.app?.cutup?.export?.() }
      };
    }

    return null;
  }

  _runStepSideEffects() {
    // The dashboard id belongs to the native Reports root once the shell mounts.
    // Hiding that element directly leaves a fully rendered report at 0x0 after
    // linked-film auto-load advances this dismissed legacy wizard. StatsEngine
    // owns presentation targeting and restores the route content on show().
    this.stats?.hideDashboard();
  }

  _runStepAction(step) {
    // Each pill click triggers the step's primary action directly.
    if (step === 1) {
      document.getElementById('videoFileInput')?.click();
    } else if (step === 2) {
      document.getElementById('btnAutoDetect')?.click();
    } else if (step === 3) {
      document.getElementById('btnQuickChart')?.click();
    } else if (step === 4) {
      document.getElementById('btnShowStats')?.click();
    } else if (step === 5) {
      document.getElementById('btnCallSheet')?.click();
    }
  }

  _openPlayTaggerPanel() {
    // The tag form is always on-page now (below the video) — just scroll to it.
    const section = document.querySelector('.tag-section');
    if (section) {
      setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  }
}
