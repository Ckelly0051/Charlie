import { TagProjection } from './tag-projection.js';
import { StatsEngine } from './stats-engine.js';
import { SpecialTeamsModel } from './special-teams.js';
import { ST_UNITS, ST_OUTCOMES, TRY_RESULT_LABELS } from './native-tagging.jsx';
import { mountNativeBreakdownTheater } from './native-breakdown-theater.jsx';

// The model's own score enum (SpecialTeamsModel.SCORES), given coach-facing
// text. Not duplicated app vocabulary — these are the literal enum members,
// and no other module already carries display labels for them.
const ST_SCORE_LABELS = { touchdown: 'Touchdown', fieldGoal: 'Field Goal', extraPoint: 'Extra Point', twoPoint: 'Two-Point', safety: 'Safety' };

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
    this.fullscreenTarget = null;
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
    ['video-loaded', 'video-unloaded', 'play-state-change']
      .forEach(event => this.app.vc?.on(event, () => this._publish()));
    this.app.vc?.on('time-update', () => {
      if ((document.fullscreenElement || document.webkitFullscreenElement) === this.fullscreenTarget) {
        // Keep the visible fullscreen timer and scrubber live without asking
        // Preact to diff the complete play strip on every media tick.
        const duration = Number(this.app.vc?.duration) || 0;
        const time = Number(this.app.vc?.currentTime) || 0;
        this._native?.updatePlayback?.({
          time,
          duration,
          progress: duration > 0 ? Math.max(0, Math.min(1, time / duration)) : 0,
        });
      } else {
        this._publish();
      }
    });
    ['play-created', 'play-updated', 'play-deleted', 'play-selected', 'plays-loaded']
      .forEach(event => this.app.tagger?.on(event, () => this._publish()));
    ['clip-switched'].forEach(event => this.app.playlist?.on(event, () => this._publish()));
    ['angle-loaded', 'angle-removed', 'angle-swapped', 'view-changed']
      .forEach(event => this.app.multiAngle?.on(event, () => this._publish()));
    document.addEventListener('fullscreenchange', () => this._publish());
    document.addEventListener('webkitfullscreenchange', () => this._publish());
    // The lower-third's "Our.../Opponent..." labels depend on scout
    // perspective, which is edited from Game Settings while Break Down stays
    // mounted — without this the chyron would show stale wording until the
    // next play/game event happened to fire.
    this.app.gameContext?.subscribe?.(() => this._publish());
  }

  mount(host) {
    if (!host || !this.media) return false;
    if (this._mounted) this.restore();
    this._legacyVideoWasMounted = !!this.app.breakdownVideo?._mounted;
    if (this._legacyVideoWasMounted) this.app.breakdownVideo.restore();
    try {
      this.host = host;
      this._native = mountNativeBreakdownTheater({ host, screen: this });
      this.fullscreenTarget = this._native.fullscreenTarget;
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
      this.fullscreenTarget = null;
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
    this.fullscreenTarget = null;
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
    const fullscreen = (document.fullscreenElement || document.webkitFullscreenElement) === this.fullscreenTarget;
    return {
      playing: !!vc && !vc.paused,
      time,
      duration,
      progress: duration > 0 ? Math.max(0, Math.min(1, time / duration)) : 0,
      speed: Number(vc?.videoElement?.playbackRate) || 1,
      loopMode: vc?.loopMode || '',
      currentPlayId: current?.id ?? null,
      currentLabel: current ? this._cardLabel(current) : 'No play selected',
      chyron: this._chyron(current),
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

  /**
   * The live below-film lower-third (Broadcast Density Part 1). Reads exactly
   * the current play's real tags through StatsEngine.proj — the same
   * projection NativeTaggingScreen.snapshot() merges over raw tags — so the
   * chyron can never show a value that disagrees with the tag form beside it.
   * Nothing here is inferred: an uncharted field renders the honest '—'
   * placeholder, never a guess.
   */
  _chyron(play) {
    if (!play) return null;
    const raw = play.tags || {};
    const projected = StatsEngine.proj ? StatsEngine.proj(play) : {};
    const tags = { ...raw, ...projected };
    const unit = tags.unit || 'offense';
    const scout = (this.app.storage?.gameInfo || {}).perspective === 'scout';

    const down = String(tags.down || '');
    const ordinal = ({ '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' })[down] || '';
    const situation = ordinal ? ordinal + (tags.distance ? ` & ${tags.distance}` : '') : '—';

    // A yard line with no valid own/opp side is not a valid field location —
    // "Ball On 34" invents territory nobody charted, and so does defaulting
    // to 'Own'. The honest state is a blank; both side AND yard line must be
    // known before this cell shows anything but '—'.
    const yardLine = String(tags.yardLine || '').trim();
    const ball = yardLine && (tags.fieldSide === 'own' || tags.fieldSide === 'opp')
      ? `${tags.fieldSide === 'opp' ? 'Opp' : 'Own'} ${yardLine}`
      : '—';
    const hash = tags.hash || '—';

    const joined = (...values) => values.filter(Boolean).join(' · ') || '—';
    // The offensive "look" composes qbAlignment + formation — the same
    // canonical composition TagProjection.lookLabel already provides and this
    // file already uses for play-strip card labels — so a legacy value like
    // formation:'Under Center' (reprojected to qbAlignment by StatsEngine.proj,
    // leaving formation blank) still reads as a real look instead of vanishing.
    const offenseLook = joined(TagProjection.lookLabel(tags), tags.playType);
    // The full defensive call is Front + Coverage Call + optional Coverage
    // Family + Blitz. Coverage Call and Coverage Family are independently
    // chartable (a coach can tag "Cover 3" AND "Zone" together to note the
    // shell's man/zone/match variant) — showing only one when both exist
    // silently drops charted information, so both are included whenever
    // present, never a shell-vs-family fallback that only shows one.
    const defenseCall = joined(tags.defFront, tags.coverage, tags.coverageFamily, tags.blitz);
    let ourLabel, ourValue, ourTone, lookLabel, lookValue;
    if (unit === 'special') {
      const st = SpecialTeamsModel.normalize(play.specialTeams);
      ourLabel = 'Special Teams';
      if (st) {
        ourValue = (ST_UNITS.find(([value]) => value === st.unit) || [null, st.unit])[1];
        ourTone = '';
      } else {
        // No structured event exists for this play — fall back to the
        // legacy stType only here, never in preference to a real one.
        ourValue = tags.stType || '—';
        ourTone = '';
      }
      lookLabel = '';
      lookValue = '';
    } else if (unit === 'defense') {
      ourLabel = scout ? 'Opponent Defensive Call' : 'Our Defensive Call';
      ourValue = defenseCall;
      ourTone = 'def';
      lookLabel = 'Offense Faced';
      lookValue = offenseLook;
    } else {
      ourLabel = scout ? 'Opponent Offensive Look' : 'Our Offensive Look';
      ourValue = offenseLook;
      ourTone = 'off';
      lookLabel = 'Defense Faced';
      lookValue = defenseCall;
    }

    const { result, resultTone } = this._chyronResult(play, tags, unit);

    return {
      playId: play.id,
      situation, ball, hash,
      ourLabel, ourValue, ourTone,
      lookLabel, lookValue,
      result, resultTone,
    };
  }

  /**
   * Result text + colour. Structured Special Teams (play.specialTeams) is
   * read first and colours via SpecialTeamsModel.scoringTeam() — the same
   * ownership resolver the rest of the app uses, so the chyron can't invent
   * a winner a coach never confirmed. Everything else uses the legacy
   * result/yardage tags with unit- and ownership-aware semantics: green/red
   * mean the outcome was genuinely good/bad for the charted unit's own job
   * (the offense trying to gain, the defense trying to stop it) — not a
   * blind "Touchdown is always green" substring match, which is exactly what
   * made a defensive Loss/Sack/Interception red and an opponent score green.
   */
  _chyronResult(play, tags, unit) {
    if (unit === 'special') return this._chyronSpecialResult(play);

    const resultRaw = tags.result || '';
    const rawYards = String(tags.yardage ?? '').trim();
    const yards = rawYards ? `${Number(rawYards) > 0 ? '+' : ''}${rawYards}` : '';
    const text = resultRaw ? (yards ? `${resultRaw}: ${yards}` : resultRaw) : '—';
    if (!resultRaw) return { result: text, resultTone: '' };

    const has = value => StatsEngine.hasResult(play, value);
    const offense = unit === 'offense';
    const defense = unit === 'defense';

    // Touchdown ownership must be established BEFORE generic Touchdown tone,
    // never after — an offense-unit "Interception + Touchdown" is a pick-six
    // THROWN BY our own offense (their defense scored, bad for us), and an
    // offense-unit "Fumble + Touchdown" recovered by the opponent is a
    // scoop-and-score against us — both must read red, not a blind "any
    // Touchdown on offense is green." _touchdownScorer resolves who actually
    // crossed the goal line; only when no turnover drove the score does it
    // fall back to the plain per-unit reading (our offense drove and scored;
    // their offense scored on our defense).
    if (has('Touchdown')) {
      const scorer = this._touchdownScorer(play, tags, unit);
      return { result: text, resultTone: scorer === 'subject' ? 'pos' : scorer === 'opponent' ? 'neg' : '' };
    }
    if (has('Safety')) {
      if (offense) return { result: text, resultTone: 'neg' };
      if (defense) return { result: text, resultTone: 'pos' };
    }
    if (has('Good')) return { result: text, resultTone: defense ? 'neg' : 'pos' };
    if (has('No Good')) return { result: text, resultTone: defense ? 'pos' : 'neg' };
    if (has('Interception')) return { result: text, resultTone: offense ? 'neg' : defense ? 'pos' : '' };
    // A fumble the OPPONENT recovered is an unambiguous turnover against the
    // offense — settle that before evaluating anything else. A fumble the
    // SUBJECT recovered only means possession was retained; retention is NOT
    // itself a successful result and must not short-circuit past Sack/Loss
    // below, or a joined "Fumble + Loss" recovered by our own offense reads
    // as a positive play when the offense still lost yardage on the snap.
    // A fumble the OPPONENT recovered is an unambiguous turnover against the
    // offense — settle that before evaluating anything else. A fumble the
    // SUBJECT recovered only means possession was retained; retention is NOT
    // itself a successful result and must not short-circuit past Sack/Loss
    // below, or a joined "Fumble + Loss" recovered by our own offense reads
    // as a positive play when the offense still lost yardage on the snap.
    if (has('Fumble') && StatsEngine.isFumbleLost(play) && offense) {
      return { result: text, resultTone: 'neg' };
    }
    if (has('Sack')) return { result: text, resultTone: offense ? 'neg' : defense ? 'pos' : '' };
    if (has('Loss')) return { result: text, resultTone: offense ? 'neg' : defense ? 'pos' : '' };
    if (has('Fumble')) {
      // Possession was retained (or recovery is genuinely unresolved) and
      // nothing above marked the play bad — a clean recovered fumble is a
      // real positive; an unresolved recovery stays honestly neutral rather
      // than guessing which side ended up with the ball.
      if (StatsEngine.isFumbleRecovered(play)) return { result: text, resultTone: 'pos' };
      return { result: text, resultTone: '' };
    }
    return { result: text, resultTone: '' };
  }

  /**
   * Who actually crossed the goal line on a Touchdown result — 'subject' (the
   * charted team's own side scored) or 'opponent' (a turnover run back
   * against the charted unit). Resolved from the SAME ownership fields the
   * rest of the app already trusts (StatsEngine.hasResult, tags.fumbleRecovery)
   * rather than the charted unit alone, because the charted unit only tells
   * you whose snap it was, not who ended the play with the ball.
   */
  _touchdownScorer(play, tags, unit) {
    const has = value => StatsEngine.hasResult(play, value);
    if (has('Interception')) {
      // The intercepting side is whoever did NOT throw the pass: on an
      // offense-unit play our own offense threw it, so the opponent's
      // defense made the pick; on a defense-unit play the opponent threw it,
      // so the subject's defense made the pick.
      return unit === 'offense' ? 'opponent' : unit === 'defense' ? 'subject' : null;
    }
    if (has('Fumble')) {
      // fumbleRecovery already names the team that ended up with the ball,
      // independent of unit — the same field StatsEngine.isFumbleRecovered/
      // isFumbleLost read. A genuinely unresolved recovery stays unresolved.
      const recovery = tags.fumbleRecovery;
      return recovery === 'subject' ? 'subject' : recovery === 'opponent' ? 'opponent' : null;
    }
    // No turnover drove this score — an ordinary drive continuation: our
    // offense scored, or the opponent's offense scored on our defense.
    return unit === 'offense' ? 'subject' : unit === 'defense' ? 'opponent' : null;
  }

  _chyronSpecialResult(play) {
    const structured = SpecialTeamsModel.normalize(play.specialTeams);
    if (!structured) {
      // Legacy compatibility-only path, disclosed elsewhere in the form as
      // uncharted — never colour a result the model itself doesn't stand
      // behind.
      const tags = play.tags || {};
      const legacyRaw = tags.result || tags.kickOutcome || '';
      const rawYards = String(tags.yardage ?? '').trim();
      const yards = rawYards ? `${Number(rawYards) > 0 ? '+' : ''}${rawYards}` : '';
      const text = legacyRaw ? (yards ? `${legacyRaw}: ${yards}` : legacyRaw) : '—';
      return { result: text, resultTone: '' };
    }
    const isTry = structured.unit === 'try' || structured.unit === 'tryDefense';
    const outcomeLabel = isTry
      ? (TRY_RESULT_LABELS[structured.result] || '')
      : ((ST_OUTCOMES[structured.unit] || []).find(([value]) => value === structured.outcome.status) || [null, ''])[1];
    let scoreLabel = '';
    let resultTone = '';
    if (structured.outcome.score) {
      scoreLabel = ST_SCORE_LABELS[structured.outcome.score] || structured.outcome.score;
      const scorer = SpecialTeamsModel.scoringTeam(structured);
      resultTone = scorer === 'subject' ? 'pos' : scorer === 'opponent' ? 'neg' : '';
    } else {
      // No score is not automatically neutral — a missed/blocked Field Goal
      // or a failed Try is unambiguously negative for the attempting subject
      // and positive for the defending subject. No Play (a genuine non-
      // attempt, e.g. a negated snap) stays honestly neutral, never guessed
      // either way — the same "unresolved stays unresolved" discipline the
      // offense/defense fumble branch already follows.
      const failed = isTry
        ? structured.result === 'failed'
        : structured.outcome.status === 'noGood' || structured.outcome.status === 'blocked';
      if (failed) {
        resultTone = structured.subjectRole === 'attempting' ? 'neg'
          : structured.subjectRole === 'defending' ? 'pos' : '';
      }
    }
    const text = outcomeLabel && scoreLabel ? `${outcomeLabel} · ${scoreLabel}`
      : outcomeLabel || scoreLabel || '—';
    return { result: text, resultTone };
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
  toggleStrip() { this.setStripCollapsed(!this.stripCollapsed); }
  setStripCollapsed(value) {
    const next = !!value;
    if (next === this.stripCollapsed) return false;
    this.stripCollapsed = next;
    this._publish();
    return true;
  }
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
      const target = this.fullscreenTarget;
      const enter = target?.requestFullscreen || target?.webkitRequestFullscreen;
      if (!enter) { this.app.tagger?.toast?.("Full screen isn't supported here."); return false; }
      await enter.call(target);
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
