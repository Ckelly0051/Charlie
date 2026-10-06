import { TagProjection } from './tag-projection.js';
import { StatsEngine } from './stats-engine.js';
import { SpecialTeamsModel } from './special-teams.js';
import { PenaltyModel } from './penalty-model.js';
import { groupPlaysByDrive, drivePossessionSide, driveLabel, driveNumberOf, countedUnit } from './football-rules.js';
import { ST_UNITS, ST_OUTCOMES, TRY_RESULT_LABELS } from './native-tagging.jsx';
import { mountNativeBreakdownTheater, unmountNativeBreakdownTheater } from './native-breakdown-theater.jsx';

const hasPlayType = (tags, type) => String(tags.playType || '').split(/\s*\+\s*/).includes(type);

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
    this.media = document.getElementById('videoContainer');
    // Theater views attached, most recent last. The Break Down route renders
    // one in its tree; a standalone mount() renders another. The one media
    // node lives in the most recent view's slot and returns to the previous
    // one, or home, when that view detaches.
    this._views = [];
    this._ownRoots = [];
    this.fullscreenTarget = null;
    this._native = null;
    this._listeners = new Set();
    this._mounted = false;
    this.stripCollapsed = false;
    this.view = 'chart';
    this._home = this.media
      ? { parent: this.media.parentNode, next: this.media.nextSibling }
      : null;
    this._bindDomainEvents();
  }

  _bindDomainEvents() {
    ['video-loaded', 'video-unloaded', 'play-state-change', 'loop-change', 'rate-change']
      .forEach(event => this.app.vc?.on(event, () => this._publish()));
    this.app.vc?.on('time-update', () => {
      // V2-H: this used to fork on fullscreen -- a direct DOM write to the
      // time/scrub nodes in fullscreen, a FULL _publish() (snapshot + a
      // Preact diff of the entire play strip) everywhere else. Nothing else
      // in the snapshot depends on playback time -- the transport is the
      // ONLY thing time-update needs to keep live -- so the "everywhere
      // else" branch was pure waste on every media tick, measured at ~0.6ms
      // apiece on a 700-play game and continuous for the whole time the
      // route is mounted, in or out of fullscreen. One direct write, always.
      const duration = Number(this.app.vc?.duration) || 0;
      const time = Number(this.app.vc?.currentTime) || 0;
      this._native?.updatePlayback?.({
        time,
        duration,
        progress: duration > 0 ? Math.max(0, Math.min(1, time / duration)) : 0,
      });
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

  /** The element the current theater view renders into. */
  get host() { return this._views[this._views.length - 1]?.root || null; }

  /** A standalone mount takes the view over from the Break Down route: one
   *  presentation at a time, as before the route owned its children. The
   *  route draws this screen's view only while this is false. */
  get standalone() { return this._ownRoots.length > 0; }
  _rerenderRoute() { this.app.breakdownWorkspace?._renderRoute?.(); }

  /** Standalone: render the theater (and optionally the rail) into hosts this
   *  screen owns. The Break Down route renders the same components in its own
   *  tree instead; both attach through attachView(). */
  mount(host, { railHost = null } = {}) {
    if (!host || !this.media) return false;
    if (this._views.some(view => view.root === host)) return true;
    const roots = { host, railHost };
    this._ownRoots.push(roots);
    try {
      this._rerenderRoute();
      mountNativeBreakdownTheater({ host, railHost, screen: this });
      if (!this._views.some(view => view.root === host)) throw new Error('Native Break Down theater did not attach.');
      return true;
    } catch (error) {
      unmountNativeBreakdownTheater(roots);
      this._ownRoots.splice(this._ownRoots.indexOf(roots), 1);
      this._rerenderRoute();
      throw error;
    }
  }

  restore() {
    if (!this._ownRoots.length) return false;
    for (const roots of this._ownRoots.splice(0)) unmountNativeBreakdownTheater(roots);
    this._rerenderRoute();
    return true;
  }

  /** A theater view's layout effect: it takes the media node. */
  attachView(view) {
    if (!view?.mediaSlot || !view?.fullscreenTarget) throw new Error('A theater view needs a media slot and a fullscreen surface.');
    this._views.push(view);
    this._adoptTopView();
    this._publish();
  }

  /** Its cleanup: the media goes to the previous view, or home. */
  detachView(view) {
    const index = this._views.indexOf(view);
    if (index < 0) return;
    this._views.splice(index, 1);
    if (this._views.length) { this._adoptTopView(); return; }
    this._mounted = false;
    this.stripCollapsed = false;
    this.media.classList.remove('gi-native-video');
    this._returnMediaHome();
    this._native = null;
    this.fullscreenTarget = null;
    this._resizeMedia();
  }

  _adoptTopView() {
    const view = this._views[this._views.length - 1];
    this._native = view;
    this.fullscreenTarget = view.fullscreenTarget;
    view.mediaSlot.appendChild(this.media);
    this.media.classList.add('gi-native-video');
    this._mounted = true;
    this._resizeMedia();
  }

  _returnMediaHome() {
    if (!this._home?.parent) return;
    const next = this._home.next?.parentNode === this._home.parent ? this._home.next : null;
    this._home.parent.insertBefore(this.media, next);
  }
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  setView(view) {
    this.view = view === 'film-room' ? 'film-room' : 'chart';
    this._publish();
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
      view: this.view,
      gameKey: `${this.app.storage?.seasonStore?.currentSeasonId || ''}:${this.app.storage?.seasonStore?.data?.activeGameId || ''}`,
      playing: !!vc && !vc.paused,
      time,
      duration,
      progress: duration > 0 ? Math.max(0, Math.min(1, time / duration)) : 0,
      speed: Number(vc?.videoElement?.playbackRate) || 1,
      loopMode: vc?.loopMode || '',
      currentPlayId: current?.id ?? null,
      currentLabel: current ? this._cardLabel(current) : 'No play selected',
      currentNotes: current?.notes || '',
      // The full drive label, so the theater names the same possession the
      // play strip groups it under rather than a bare number both teams share.
      currentDrive: current && driveNumberOf(current.tags)
        ? driveLabel(drivePossessionSide(current.tags), driveNumberOf(current.tags), this._driveLabelMode())
        : '',
      chyron: this._chyron(current),
      playSheet: this._playSheet(current),
      // V2-H: the play strip only ever reads this count (its header line),
      // never the array itself -- mapping every play through _playView here
      // was pure duplicate work, since _driveGroups below already builds the
      // identical per-play view for real use. Doubled the per-play cost of
      // every publish for a value nothing consumed but its own length.
      playCount: (tagger?.plays || []).length,
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
   * THE PLAY SHEET (coach direction, 2026-09-24). Film Room's play card lists
   * every field the coach can chart for the selected play, grouped, so the
   * charting can be checked against the film without reading a wide table row.
   * Values come from the same projection and result wording as the chyron, so
   * the two cannot disagree. A field the play's unit charts but nobody filled
   * is `null` and renders `Not charted`; groups with nothing to say (no
   * penalty, no notes) are left out rather than padded. Nothing is inferred.
   */
  _playSheet(play) {
    if (!play) return null;
    const tags = { ...(play.tags || {}), ...(StatsEngine.proj ? StatsEngine.proj(play) : {}) };
    const unit = countedUnit(play);
    const scout = (this.app.storage?.gameInfo || {}).perspective === 'scout';
    const chyron = this._chyron(play);
    const text = value => (value == null || String(value).trim() === '' || value === '—' ? null : String(value));
    const row = (label, value) => ({ label, value: text(value) });
    const roster = new Map((this.app.roster?.players || []).map(p => [String(p.num), p.name || '']));
    const person = num => { const name = roster.get(String(num).trim()); return name ? `#${String(num).trim()} ${name}` : `#${String(num).trim()}`; };
    const driveNumber = driveNumberOf(tags);
    const groups = [];
    groups.push({ key: 'situation', title: 'Situation', rows: [
      row('Quarter', tags.quarter), row('Down & distance', chyron.situation), row('Field position', chyron.ball),
      row('Hash', tags.hash), row('Drive', driveNumber ? driveLabel(drivePossessionSide(tags), driveNumber, this._driveLabelMode()) : ''),
    ] });
    const spot = v => (v && (v.fieldSide === 'own' || v.fieldSide === 'opp') && String(v.yardLine || '').trim()
      ? `${v.fieldSide === 'opp' ? 'Opp' : 'Own'} ${String(v.yardLine).trim()}` : '');
    const side = t => (t === 'subject' ? (scout ? 'Scouted team' : 'Our team') : t === 'opponent' ? (scout ? 'Other team' : 'Opponent') : t === 'unknown' ? 'Unknown' : '');
    const st = unit === 'special' ? SpecialTeamsModel.normalize(play.specialTeams) : null;
    if (unit === 'special') {
      // Every field the Special Teams editor charts, from the structured event.
      // A legacy snap has none; its unit and result still read from the chyron.
      const isTry = st && (st.unit === 'try' || st.unit === 'tryDefense');
      const yn = v => (v === true ? 'Yes' : v === false ? 'No' : '');
      const yds = v => (v != null ? `${v} yds` : '');
      groups.push({ key: 'special', title: 'Special teams', rows: [
        row('Unit', chyron.ourValue), row('Result', chyron.result),
        ...(isTry ? [
          row('Attempt', st.attemptType === 'twoPoint' ? 'Two-point' : st.attemptType === 'extraPoint' ? 'Extra point' : st.attemptType || ''),
          row('Bad snap', st.events.badSnap ? 'Yes' : 'No'), row('Blocked', st.events.blocked ? 'Yes' : 'No'),
          row('Turnover', st.events.turnover || ''),
        ] : [
          row('Kick', st?.kick?.kind), row('Kick direction', st?.kick?.direction),
          row('Kick distance', yds(st?.kick?.distance)), row('Hang time', st?.kick?.hangTime != null ? `${st.kick.hangTime} s` : ''),
          row('Operation time', st?.kick?.operationTime != null ? `${st.kick.operationTime} s` : ''),
          row('Landing spot', spot(st?.kick?.landing)),
          row('Return attempted', yn(st?.return?.attempted)), row('Return yards', yds(st?.return?.yards)),
          row('Return ended', spot(st?.return?.end)),
          row('Recovered by', side(st?.outcome?.recoveredBy)),
          row('Onside', st ? (st.isOnside ? 'Yes' : 'No') : ''), row('Fake', st ? (st.isFake ? 'Yes' : 'No') : ''),
        ]),
        row('Scored by', st?.outcome?.score ? side(SpecialTeamsModel.scoringTeam(st)) : ''),
      ] });
    } else {
      const offense = { key: 'offense', title: unit === 'defense' ? 'Offense faced' : scout ? 'Opponent Formation & Call' : 'Formation & Call', rows: [
        row('Play call', tags.playCall), row('Concept', tags.playConcept), row('Formation', tags.formationFamily),
        row('Receiver alignment', tags.receiverSet),
        row('Personnel', tags.personnel), row('QB alignment', tags.qbAlignment), row('Backfield', tags.backfield),
        row('Offensive line strength', tags.strength), row('Motion', tags.motion),
        // A detail is listed while the field that opens it is charted.
        ...(tags.motion ? [row('Motion starts', tags.motionStart), row('Motion ends', tags.motionEnd)] : []),
      ] };
      const defense = { key: 'defense', title: unit === 'defense' ? (scout ? 'Opponent defensive call' : 'Our defensive call') : 'Defense faced', rows: [
        row('Front', tags.defFront), row('Coverage', tags.coverage), row('Coverage family', tags.coverageFamily), row('Blitz', tags.blitz),
      ] };
      groups.push(...(unit === 'defense' ? [defense, offense] : [offense, defense]));
      groups.push({ key: 'play', title: 'Play & result', rows: [
        row('Run / pass', tags.runPass), row('Play type', tags.playType),
        ...(hasPlayType(tags, 'RPO') ? [row('RPO read', tags.rpoRead), row('RPO defender', tags.rpoDefender), row('RPO decision', tags.rpoDecision)] : []),
        ...(hasPlayType(tags, 'QB Run') ? [row('QB run type', tags.qbRun)] : []),
        row('Direction', tags.playDir),
        ...(tags.playDir || tags.gap ? [row('Gap', tags.gap)] : []),
        row('Result', chyron.result),
      ] });
    }
    const LABELS = { ballCarrier: 'Ball carrier', passer: 'Passer', receiver: 'Receiver', tackler: 'Tackler', takeaway: 'Takeaway', kicker: 'Kicker', returner: 'Returner' };
    const ST_ROLES = { kicker: 'Kicker', punter: 'Punter', returner: 'Returner', blocker: 'Blocker', recoverer: 'Recoverer' };
    const credited = st ? Object.entries(ST_ROLES).map(([role, label]) => [label, st.players?.[role] || tags.players?.[role] || ''])
      : Object.entries(LABELS).map(([role, label]) => [label, tags.players?.[role] ?? '']);
    const players = credited
      .map(([label, value]) => [label, String(value ?? '').split(/[,+]/).map(s => s.trim()).filter(Boolean)])
      .filter(([, nums]) => nums.length)
      .map(([label, nums]) => ({ label, value: nums.map(person).join(', ') }));
    groups.push({ key: 'players', title: 'Players', rows: players.length ? players : [row('Players', '')] });
    const grade = v => { const n = Number(v); return Number.isFinite(n) ? (n > 0 ? `+${n}` : String(n)) : String(v); };
    const graded = Object.entries(LABELS).filter(([role]) => String(tags.grades?.[role] ?? '').trim() !== '')
      .map(([role, label]) => ({ label, value: grade(tags.grades[role]) }));
    if (graded.length) groups.push({ key: 'grades', title: 'Grades', rows: graded });
    const defs = this.app.customFields?.defs || [];
    const customTags = Array.isArray(tags.custom) ? tags.custom.filter(Boolean) : [];
    groups.push({ key: 'custom', title: 'Custom', rows: [
      ...defs.map(def => row(def.name, tags.customFields?.[def.id])),
      row('Tags', customTags.join(', ')),
    ] });
    const penalties = (play.penalties ? PenaltyModel.normalizeList(play.penalties) : []).filter(p => p.foul || p.yards != null);
    if (penalties.length) groups.push({ key: 'penalty', title: 'Penalty', rows: penalties.map((p, i) => ({
      label: penalties.length > 1 ? `Penalty ${i + 1}` : 'Foul',
      value: [p.foul || 'Foul', p.team === 'subject' ? (scout ? 'Scouted team' : 'Our team') : p.team === 'opponent' ? (scout ? 'Other team' : 'Opponent') : '',
        p.disposition && p.disposition !== 'unknown' ? p.disposition[0].toUpperCase() + p.disposition.slice(1) : '',
        p.yards != null ? `${p.yards} yds` : ''].filter(Boolean).join(' · '),
    })) });
    if (text(play.notes)) groups.push({ key: 'notes', title: 'Notes', rows: [{ label: '', value: String(play.notes) }] });
    return { playId: play.id, unit, groups };
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
    const unit = countedUnit(play);
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
    // The offensive "look" composes qbAlignment + formation + receiver set
    // — the same canonical composition TagProjection.lookLabel already provides
    // and this file already uses for play-strip card labels — so a play charted
    // with a QB alignment alone still reads as a real look instead of vanishing.
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
        // A Special Teams snap with no unit charted yet.
        ourValue = '—';
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
      ourLabel = scout ? 'Opponent Formation & Call' : 'Formation & Call';
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
      // A special-teams snap with no charted event yet: show its plain result,
      // never a colour the model itself doesn't stand behind.
      const tags = play.tags || {};
      const rawResult = tags.result || '';
      const rawYards = String(tags.yardage ?? '').trim();
      const yards = rawYards ? `${Number(rawYards) > 0 ? '+' : ''}${rawYards}` : '';
      const text = rawResult ? (yards ? `${rawResult}: ${yards}` : rawResult) : '—';
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
    const { situation, call, result } = this._playViewShallow(play);
    const lower = String(tags.result || '').toLowerCase();
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
      result,
      kind,
      label: this._cardLabel(play),
    };
  }

  _cardLabel(play) {
    const view = this._playViewShallow(play);
    return `Play ${play.id}: ${[view.situation, view.call, view.result].filter(Boolean).join(', ')}`;
  }

  _playViewShallow(play) {
    const tags = play.tags || {};
    const down = String(tags.down || '');
    const special = SpecialTeamsModel.normalize(play.specialTeams);
    if (special) {
      // A Special Teams snap has no down: its card names the unit instead.
      const unit = ST_UNITS.find(([value]) => value === special.unit)?.[1] || 'Special Teams';
      const result = this._chyronSpecialResult(play).result;
      return { situation: unit, call: '', result: result === '—' ? 'No result' : result };
    }
    // Special Teams with no event charted yet: say so, without guessing a unit.
    if (tags.unit === 'special') return { situation: 'Special Teams', call: '', result: tags.result || 'No result' };
    const situation = (({ '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' })[down] || 'No down')
      + (tags.distance ? ` & ${tags.distance}` : '');
    const call = tags.playType || tags.defFront || TagProjection.lookLabel(tags) || 'Untagged';
    const result = tags.result || 'No result';
    const raw = String(tags.yardage ?? '').trim();
    return { situation, call, result: raw ? `${result}: ${Number(raw) > 0 ? '+' : ''}${raw}` : result };
  }

  /** Drive groups on composite possession-side + drive-number identity. The
   *  raw `driveNumber` tag alone merged our Drive 1 with the opponent's
   *  Drive 1 into one group, because each team runs its own drive sequence.
   *  The identity and the labels are owned by football-rules.js so Study's
   *  Drive dimension cannot disagree with this strip. */
  _driveGroups(plays) {
    return groupPlaysByDrive(plays, { project: play => this._playView(play), mode: this._driveLabelMode() });
  }

  /** A scout season charts another team's film, so neither side is "ours". */
  _driveLabelMode() { return this.app.storage?.seasonStore?.data?.kind === 'scout' ? 'unit' : 'perspective'; }

  selectPlay(id) { this.app.tagger?.selectPlay?.(Number(id)); }
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
    this.app.vc.setPlaybackRate?.(rate);
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
  setAutoplay(enabled) {
    this.app.autoPlayNext = !!enabled;
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
