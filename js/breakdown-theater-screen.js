import { TagProjection } from './tag-projection.js';
import { mountNativeBreakdownTheater } from './native-breakdown-theater.jsx';

/**
 * Native S5a theater controller.
 *
 * Playback, clip identity, drawing, and multi-angle remain owned by their
 * existing domain controllers. This screen owns presentation and commands. It
 * adopts the one canonical media node into a native slot while mounted, then
 * returns it exactly on restore. S5a stays internal until S5d flips the route.
 */
export class BreakdownTheaterScreen {
  constructor(app) {
    this.app = app;
    this.host = null;
    this.media = document.getElementById('videoContainer');
    this._native = null;
    this._listeners = new Set();
    this._mounted = false;
    this.stripCollapsed = false;
    this._legacyVideoWasMounted = false;
    this._home = this.media
      ? { parent: this.media.parentNode, next: this.media.nextSibling }
      : null;
    this._bindDomainEvents();
  }

  _bindDomainEvents() {
    ['video-loaded', 'video-unloaded', 'time-update', 'play-state-change']
      .forEach(event => this.app.vc?.on(event, () => this._publish()));
    ['play-created', 'play-updated', 'play-deleted', 'play-selected', 'plays-loaded']
      .forEach(event => this.app.tagger?.on(event, () => this._publish()));
    ['clip-switched'].forEach(event => this.app.playlist?.on(event, () => this._publish()));
    ['angle-loaded', 'angle-removed', 'angle-swapped', 'view-changed']
      .forEach(event => this.app.multiAngle?.on(event, () => this._publish()));
    document.addEventListener('fullscreenchange', () => this._publish());
    document.addEventListener('webkitfullscreenchange', () => this._publish());
  }

  mount(host) {
    if (!host || !this.media) return false;
    if (this._mounted) this.restore();
    this._legacyVideoWasMounted = !!this.app.breakdownVideo?._mounted;
    if (this._legacyVideoWasMounted) this.app.breakdownVideo.restore();
    try {
      this.host = host;
      this._native = mountNativeBreakdownTheater({ host, screen: this });
      this._native.mediaSlot.appendChild(this.media);
      this.media.classList.add('gi-native-video');
      this._mounted = true;
      this._resizeMedia();
      this._publish();
      return true;
    } catch (error) {
      this._returnMediaHome();
      this._native?.unmount?.();
      this._native = null;
      this.host = null;
      this._restoreLegacyVideo();
      throw error;
    }
  }

  restore() {
    if (!this._mounted) return false;
    this._mounted = false;
    this.stripCollapsed = false;
    this.media.classList.remove('gi-native-video');
    this._returnMediaHome();
    this._native?.unmount?.();
    this._native = null;
    this.host = null;
    this._resizeMedia();
    this._restoreLegacyVideo();
    return true;
  }

  _returnMediaHome() {
    if (!this._home?.parent) return;
    const next = this._home.next?.parentNode === this._home.parent ? this._home.next : null;
    this._home.parent.insertBefore(this.media, next);
  }

  _restoreLegacyVideo() {
    const remount = this._legacyVideoWasMounted;
    this._legacyVideoWasMounted = false;
    if (remount) this.app.breakdownVideo?.mount?.();
  }

  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _publish() {
    if (!this._mounted) return;
    const state = this.snapshot();
    this._listeners.forEach(listener => listener(state));
  }

  _resizeMedia() {
    requestAnimationFrame(() => this.app.canvas?._syncSize?.());
  }

  snapshot() {
    const vc = this.app.vc;
    const tagger = this.app.tagger;
    const multi = this.app.multiAngle;
    const current = tagger?.getCurrentPlay?.() || null;
    const duration = Number(vc?.duration) || 0;
    const time = Number(vc?.currentTime) || 0;
    const fullscreen = (document.fullscreenElement || document.webkitFullscreenElement) === this.media;
    return {
      playing: !!vc && !vc.paused,
      time,
      duration,
      progress: duration > 0 ? Math.max(0, Math.min(1, time / duration)) : 0,
      speed: Number(vc?.videoElement?.playbackRate) || 1,
      loopMode: vc?.loopMode || '',
      currentPlayId: current?.id ?? null,
      currentLabel: current ? this._cardLabel(current) : 'No play selected',
      plays: (tagger?.plays || []).map(play => this._playView(play)),
      groups: this._driveGroups(tagger?.plays || []),
      stripCollapsed: this.stripCollapsed,
      pendingStart: tagger?.pendingStart,
      autoplay: this.app.autoPlayNext !== false,
      fullscreen,
      multiAngle: {
        enabled: !!multi?.enabled,
        active: multi?.activeAngle || 1,
        mode: multi?.viewMode || 'single',
        name: multi?.angle2Name || '',
        offset: Number(multi?.offset) || 0,
      },
    };
  }

  _playView(play) {
    const tags = play.tags || {};
    const result = tags.result || tags.kickOutcome || 'No result';
    const rawYards = String(tags.yardage ?? '').trim();
    const yards = rawYards ? `${Number(rawYards) > 0 ? '+' : ''}${rawYards}` : '';
    const call = tags.playType || tags.stType || tags.defFront || TagProjection.lookLabel(tags) || 'Untagged';
    const down = String(tags.down || '');
    const ordinal = ({ '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' })[down] || 'Down -';
    const situation = ordinal + (tags.distance ? ` & ${tags.distance}` : '');
    const lower = `${tags.result || ''} ${tags.kickOutcome || ''}`.toLowerCase();
    const kind = lower.includes('touchdown') || lower.includes('good') ? 'score'
      : lower.includes('interception') || lower.includes('fumble') ? 'turnover'
      : tags.runPass === 'Run' ? 'run'
      : tags.runPass === 'Pass' ? 'pass'
      : 'untagged';
    return {
      id: play.id,
      drive: String(tags.driveNumber || '').trim(),
      situation,
      call,
      result: yards ? `${result}: ${yards}` : result,
      kind,
      label: this._cardLabel(play),
    };
  }

  _cardLabel(play) {
    const view = this._playViewShallow(play);
    return `Play ${play.id}: ${view.situation}, ${view.call}, ${view.result}`;
  }

  _playViewShallow(play) {
    const tags = play.tags || {};
    const down = String(tags.down || '');
    const situation = (({ '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' })[down] || 'Down -')
      + (tags.distance ? ` & ${tags.distance}` : '');
    const call = tags.playType || tags.stType || tags.defFront || TagProjection.lookLabel(tags) || 'Untagged';
    const result = tags.result || tags.kickOutcome || 'No result';
    const raw = String(tags.yardage ?? '').trim();
    return { situation, call, result: raw ? `${result}: ${Number(raw) > 0 ? '+' : ''}${raw}` : result };
  }

  _driveGroups(plays) {
    const groups = [];
    let current = null;
    plays.forEach(play => {
      const view = this._playView(play);
      const key = view.drive || 'unassigned';
      if (!current || current.key !== key) {
        current = { key, label: view.drive ? `Drive ${view.drive}` : 'No drive', plays: [] };
        groups.push(current);
      }
      current.plays.push(view);
    });
    return groups;
  }

  selectPlay(id) { this.app.tagger?.selectPlay?.(Number(id)); }
  toggleStrip() { this.stripCollapsed = !this.stripCollapsed; this._publish(); }
  togglePlay() { this.app.vc?.togglePlay?.(); this._publish(); }
  stepBack() { this.app.vc?.stepBack?.(); this._publish(); }
  stepForward() { this.app.vc?.stepForward?.(); this._publish(); }
  previousClip() { this.app.playlist?.prevClip?.(); }
  nextClip() { this.app.playlist?.nextClip?.(); }
  toggleLoop() { this.app.vc?.toggleLoopPlay?.(); this._publish(); }

  seekFraction(value) {
    const duration = Number(this.app.vc?.duration) || 0;
    if (duration > 0) this.app.vc.seekTo(duration * Math.max(0, Math.min(1, Number(value) || 0)));
    this._publish();
  }

  setSpeed(value) {
    const rate = Number(value) || 1;
    this.app.vc.videoElement.playbackRate = rate;
    if (this.app.vc.speedSelect) this.app.vc.speedSelect.value = String(rate);
    this._publish();
  }

  async toggleFullscreen() {
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    if (active) {
      await (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    } else {
      const enter = this.media.requestFullscreen || this.media.webkitRequestFullscreen;
      if (!enter) { this.app.tagger?.toast?.("Full screen isn't supported here."); return false; }
      await enter.call(this.media);
    }
    this._resizeMedia();
    return true;
  }

  openDrawing() { this.app.settingsScreen?.open?.({ initialTab: 'drawing' }); }
  addAngle() { document.getElementById('angle2FileInput')?.click(); }
  removeAngle() { this.app.multiAngle?.removeAngle2?.(); }
  swapAngle() { this.app.multiAngle?.swapActive?.(); }
  setAngleMode(mode) { this.app.multiAngle?.setViewMode?.(mode); }
  setAngleOffset(value) {
    this.app.multiAngle.offset = Number(value) || 0;
    this.app.multiAngle._syncTime?.();
    this._publish();
  }

  markStart() { this.app.tagger?.markStart?.(); this._publish(); }
  markEnd() { this.app.tagger?.markEnd?.(); this._publish(); }
  copyLast() { this.app.tagger?.copyFromPrevious?.(); this._publish(); }
  clearTags() { return this.app.tagger?.clearCurrentTags?.(); }
  deletePlay() { return this.app.tagger?.deleteCurrentPlay?.(); }
  setAutoplay(enabled) {
    this.app.autoPlayNext = !!enabled;
    const legacy = document.getElementById('autoplayNextToggle');
    if (legacy) legacy.checked = this.app.autoPlayNext;
    try { localStorage.setItem('ffa_autoplay_next', this.app.autoPlayNext ? '1' : '0'); } catch {}
    this._publish();
  }

  formatTime(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value < 0) return '0:00';
    const minutes = Math.floor(value / 60);
    const secs = Math.floor(value % 60).toString().padStart(2, '0');
    return `${minutes}:${secs}`;
  }
}
