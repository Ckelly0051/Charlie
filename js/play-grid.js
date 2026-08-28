/**
 * Film Room state and command model.
 *
 * Owns persisted columns and saved filters, filtered-row/tendency math,
 * selection and cut-up commands, and the football semantics of inline edits.
 * It does not own markup or browser event wiring; NativeFilmRoom is the sole
 * Film Room presentation.
 */import { StatsEngine } from './stats-engine.js';
import { TagProjection } from './tag-projection.js';
import { PlayTagger } from './play-tagger.js';

import { isPlayTagged } from './football-rules.js';
import { SpecialTeamsModel } from './special-teams.js';
import { PenaltyModel } from './penalty-model.js';
import { PlayCallModel } from './play-call-model.js';
import { OPTIONS as TAG_OPTIONS, RESULT_OPTIONS } from './native-tagging.jsx';

export class PlayGrid {
  /**
   * Column registry. `src` is the tag-form chip group whose options the
   * editor lists (single source of truth); `unit` marks side-specific
   * columns for the presets. `sit` is the composite Down & Distance column;
   * `notes` edits play.notes (the call), not a tag.
   */
  static COLUMNS = [
    { key: 'sit',       label: 'Dn & Dist', type: 'sit' },
    { key: 'quarter',   label: 'Qtr',       type: 'enum', src: 'tagQuarter' },
    { key: 'hash',      label: 'Hash',      type: 'enum', src: 'tagHash' },
    { key: 'formation', label: 'Formation', type: 'enum', src: 'tagFormation', multi: true,  unit: 'offense' },
    // E4-2: QB Alignment, Backfield, Strength, and Coverage Family are now
    // safely EDITABLE inline (E3b shipped them DISPLAY-ONLY/`proj-readonly`
    // pending the field-level-merge machinery, which E4/E4-2 built). All four
    // are single-select, so they use the plain `enum` editor like any other
    // tag-form-backed column; `_applyEdit` routes every one of them through
    // `TagProjection.reconcileSiblings` (the same promote/strip mechanic the
    // tag form uses), so committing them here has EXACTLY the tag form's
    // safety guarantees — view/cancel/navigation never write, and an explicit
    // clear/change is one undoable transaction. Not in any default PRESET (no
    // coach decision requested that for Backfield/Strength), but available in
    // the Columns menu like any other column, since PlayGrid.COLUMNS is its
    // single source of truth.
    { key: 'qbAlignment', label: 'QB Align', type: 'enum', src: 'tagQbAlignment',              unit: 'offense' },
    { key: 'backfield', label: 'Backfield', type: 'enum', src: 'tagBackfield',                 unit: 'offense' },
    { key: 'strength',  label: 'Strength',  type: 'enum', src: 'tagStrength',                  unit: 'offense' },
    { key: 'personnel', label: 'Pers',      type: 'enum', src: 'tagPersonnel',                unit: 'offense' },
    { key: 'motion',    label: 'Motion',    type: 'enum', src: 'tagMotion',                   unit: 'offense' },
    { key: 'playCall',  label: 'Play Call', type: 'call',                                  unit: 'offense' },
    { key: 'playConcept', label: 'Concept', type: 'text-tag',                               unit: 'offense' },
    { key: 'runPass',   label: 'R/P',       type: 'enum', src: 'tagRunPass' },
    { key: 'playType',  label: 'Type',      type: 'enum', src: 'tagPlayType',  multi: true },
    { key: 'playDir',   label: 'Dir',       type: 'enum', src: 'tagPlayDir' },
    { key: 'result',    label: 'Result',    type: 'enum', src: 'tagResult',    multi: true },
    { key: 'yardage',   label: 'Yds',       type: 'yds' },
    { key: 'defFront',  label: 'Front',     type: 'enum', src: 'tagDefFront',  multi: true,   unit: 'defense' },
    { key: 'coverage',  label: 'Cover',     type: 'enum', src: 'tagCoverage',                 unit: 'defense' },
    { key: 'coverageFamily', label: 'Cov Family', type: 'enum', src: 'tagCoverageFamily',      unit: 'defense' },
    { key: 'blitz',     label: 'Blitz',     type: 'enum', src: 'tagBlitz',     multi: true,   unit: 'defense' },
    { key: 'stType',    label: 'ST Type',   type: 'enum', src: 'tagStType',                   unit: 'special' },
    { key: 'stUnit',    label: 'ST Unit',   type: 'st-readonly',                              unit: 'special' },
    { key: 'stOutcome', label: 'ST Outcome',type: 'st-readonly',                              unit: 'special' },
    { key: 'stKick',    label: 'Kick',      type: 'st-readonly',                              unit: 'special' },
    { key: 'stReturn',  label: 'Return',    type: 'st-readonly',                              unit: 'special' },
    { key: 'penalty',   label: 'Penalty',   type: 'pen-readonly' },
    { key: 'penaltyYards', label: 'Pen Yds', type: 'pen-readonly' },
    { key: 'notes',     label: 'Notes',      type: 'text' },
  ];

  // E3b coach decision: Offense/Default place QB Alignment AFTER Formation;
  // Defense places Coverage Family AFTER Coverage Call.
  static PRESETS = {
    default: ['sit', 'playCall', 'formation', 'qbAlignment', 'playType', 'result', 'yardage', 'penalty'],
    offense: ['sit', 'playCall', 'playConcept', 'formation', 'qbAlignment', 'personnel', 'runPass', 'playType', 'result', 'yardage', 'penalty', 'penaltyYards'],
    defense: ['sit', 'defFront', 'coverage', 'coverageFamily', 'blitz', 'result', 'yardage', 'penalty', 'penaltyYards'],
    special: ['sit', 'stUnit', 'stOutcome', 'stKick', 'stReturn', 'penalty', 'penaltyYards', 'notes'],
  };

  // E4: PROJECTED_PAIRS moved to TagProjection so the tag form's promote-on-
  // commit shares the EXACT same descriptor as this grid's — see
  // tag-projection.js for the full rationale. `PlayGrid.PROJECTED_PAIRS` stays
  // as an alias so nothing that already reads it (this file, its test harness)
  // needs to change.
  static get PROJECTED_PAIRS() { return TagProjection.PROJECTED_PAIRS; }

  /** E3b-P4: the pre-E3b presets, used to detect a coach still on stock columns
   *  so their saved list can be UPGRADED to the new one. A customized list is
   *  preserved untouched (the new columns stay available in the Columns menu). */
  static LEGACY_PRESETS = {
    default: ['sit', 'formation', 'playType', 'result', 'yardage', 'penalty'],
    offense: ['sit', 'formation', 'personnel', 'runPass', 'playType', 'result', 'yardage', 'penalty', 'penaltyYards'],
    defense: ['sit', 'defFront', 'coverage', 'blitz', 'result', 'yardage', 'penalty', 'penaltyYards'],
    special: ['sit', 'stUnit', 'stOutcome', 'stKick', 'stReturn', 'penalty', 'penaltyYards', 'notes'],
  };

  // P4: presets saved after E3b but before Play Call existed are also stock,
  // not coach customizations. Upgrade only exact matches.
  static PRE_CALL_PRESETS = {
    default: ['sit', 'formation', 'qbAlignment', 'playType', 'result', 'yardage', 'penalty'],
    offense: ['sit', 'formation', 'qbAlignment', 'personnel', 'runPass', 'playType', 'result', 'yardage', 'penalty', 'penaltyYards'],
  };

  constructor(tagger, videoController, cutupPlayer, playbook = null, customChips = null) {
    this.tagger = tagger;
    this.vc = videoController;
    this.cutup = cutupPlayer;
    this.playbook = playbook;
    // Final Engine Independence: _options() used to read a column's option
    // list off the legacy .tag-section chip DOM (`#tagFormation .pick` etc.,
    // now deleted). Library-backed vocabulary (formation/backfield/front)
    // comes from CustomChips/TagLibrary -- the same source native-tagging.jsx
    // reads -- injected explicitly rather than reached for off `window.app`.
    this.customChips = customChips;

    // Filter state: AND across groups, OR within a group.
    this.f = { unit: '', downs: new Set(), rp: '', flags: new Set() };
    this.selected = new Set();
    this._raf = null;
    this._optionCache = {};
    this._nativeListeners = new Set();
    this.cols = this._loadCols();
    this.savedFilters = this._loadSavedFilters();

    this._wireDomainEvents();
    this.refresh();
  }

  // ---------- Persistence ----------

  /** E3b-P4 — saved-column upgrade rule. Updating the presets alone would never
   *  expose QB Alignment / Coverage Family to a coach who already has a saved
   *  `ffa_film_room_cols`. Rules:
   *    - saved list EXACTLY matches a pre-E3b preset  -> upgrade to the new preset
   *    - otherwise (a CUSTOM layout)                  -> preserve it untouched
   *  (No saved preference at all takes the new defaults via _loadCols' fallback.)
   *  A preserved custom layout keeps both new columns available in the Columns menu. */
  static _upgradeCols(cols) {
    const same = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);
    for (const presets of [PlayGrid.LEGACY_PRESETS, PlayGrid.PRE_CALL_PRESETS]) {
      for (const name of Object.keys(presets)) {
        if (same(cols, presets[name])) return PlayGrid.PRESETS[name].slice();
      }
    }
    return cols;   // custom layout — untouched
  }

  _loadCols() {
    try {
      const v = JSON.parse(localStorage.getItem('ffa_film_room_cols') || 'null');
      if (Array.isArray(v) && v.length) {
        const known = new Set(PlayGrid.COLUMNS.map(c => c.key));
        const cols = v.filter(k => known.has(k));
        if (cols.length) return PlayGrid._upgradeCols(cols);
      }
    } catch (e) {}
    return PlayGrid.PRESETS.default.slice();
  }
  _saveCols() {
    try { localStorage.setItem('ffa_film_room_cols', JSON.stringify(this.cols)); } catch (e) {}
  }
  _loadSavedFilters() {
    try { return JSON.parse(localStorage.getItem('ffa_film_room_filters') || '[]') || []; } catch (e) { return []; }
  }
  _saveSavedFilters() {
    try { localStorage.setItem('ffa_film_room_filters', JSON.stringify(this.savedFilters)); } catch (e) {}
  }

  /** Domain events drive the one native Film Room model. */
  _wireDomainEvents() {
    ['play-created', 'play-updated', 'play-deleted'].forEach(event =>
      this.tagger.on(event, () => this.refresh()));
    this.tagger.on('plays-loaded', () => {
      this.selected.clear();
      this.refresh();
    });
    this.tagger.on('play-selected', () => this._notifyNative());
  }

  _toggleFilter(group, val) {
    if (group === 'unit' || group === 'rp') {
      this.f[group] = this.f[group] === val ? '' : val;
    } else {
      const set = this.f[group];
      if (set.has(val)) set.delete(val); else set.add(val);
    }
    this.refresh();
  }

  // ---------- Filtering ----------
  // Run/pass and result splitting go through StatsEngine (the canonical
  // classifiers) so the grid never disagrees with the stats dashboard —
  // e.g. legacy 'Play Action'/'RPO' plays without an explicit runPass.

  static isUntagged(p) {
    return !isPlayTagged(p);
  }

  _matches(p) {
    const t = p.tags || {};
    const f = this.f;
    if (f.unit && (t.unit || 'offense') !== f.unit) return false;
    if (f.downs.size && !f.downs.has(String(t.down))) return false;
    if (f.rp === 'Run' && !StatsEngine.isRun(p)) return false;
    if (f.rp === 'Pass' && !StatsEngine.isPass(p)) return false;
    if (f.flags.size) {
      const res = StatsEngine.splitResults(t.result);
      const hit = (f.flags.has('td') && res.includes('Touchdown'))
        || (f.flags.has('to') && (res.includes('Interception') || res.includes('Fumble')))
        || (f.flags.has('pen') && (PenaltyModel.normalizeList(p.penalties).length > 0 || res.includes('Penalty')))
        || (f.flags.has('untagged') && PlayGrid.isUntagged(p));
      if (!hit) return false;
    }
    return true;
  }

  _filterActive() {
    return !!(this.f.unit || this.f.rp || this.f.downs.size || this.f.flags.size);
  }

  _visiblePlays() {
    return this.tagger.plays.filter(p => this._matches(p));
  }

  // ---------- Saved filters ----------

  _serializeFilter() {
    return { unit: this.f.unit, downs: [...this.f.downs], rp: this.f.rp, flags: [...this.f.flags] };
  }
  _applySavedFilter(s) {
    this.f = {
      unit: s.unit || '',
      downs: new Set(Array.isArray(s.downs) ? s.downs : []),
      rp: s.rp || '',
      flags: new Set(Array.isArray(s.flags) ? s.flags : []),
    };
    this.refresh();
  }

  // ---------- Columns ----------

  _visibleCols() {
    return this.cols.map(k => PlayGrid.COLUMNS.find(c => c.key === k)).filter(Boolean);
  }

  // ---------- View data ----------

  /** Coalesce bursts of domain events before publishing one native snapshot. */
  refresh() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      const ids = new Set((this.tagger.plays || []).map(play => play.id));
      for (const id of [...this.selected]) if (!ids.has(id)) this.selected.delete(id);
      this._notifyNative();
    });
  }

  /** One-line tendency under a column header, over the VISIBLE plays. */
  _tendency(col, visible) {
    if (col.type === 'yds') {
      const ys = visible.map(p => parseInt(p.tags.yardage, 10)).filter(Number.isFinite);
      if (ys.length < 3) return '';
      const avg = ys.reduce((s, y) => s + y, 0) / ys.length;
      return `avg ${avg.toFixed(1)}`;
    }
    if (col.key === 'runPass') {
      const rp = visible.filter(p => StatsEngine.isRun(p) || StatsEngine.isPass(p));
      if (rp.length < 3) return '';
      const runs = rp.filter(p => StatsEngine.isRun(p)).length;
      const pct = Math.round((runs / rp.length) * 100);
      return pct >= 50 ? `Run ${pct}%` : `Pass ${100 - pct}%`;
    }
    // QB Alignment/Backfield/Strength/Coverage Family are single-value, so the
    // multi-value split below is a no-op for them; routing through the
    // identical enum math costs nothing and keeps exactly one denominator/
    // eligibility implementation for every projected column instead of a
    // second, divergence-prone copy.
    if (col.type === 'enum') {
      const counts = {};
      let total = 0;
      visible.forEach(p => {
        // E3b: DISPLAY surface → read the PROJECTED value for the six projected
        // fields (raw passthrough otherwise). The inline EDITOR still reads/writes raw.
        const vals = String(StatsEngine.projField(p, col.key) || '')
          .split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
        // §6.5 ELIGIBLE denominator: `total` counts each eligible PLAY ONCE — never
        // once per token. A multi-value play ("Wing-T + Trips") lands in several
        // rows but must not inflate the denominator, or a value present on EVERY
        // eligible play reads below 100%. A blank projection is omitted entirely
        // (not eligible), never an invented 'Unknown' bucket.
        if (!vals.length) return;
        total++;
        vals.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
      });
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (!top || total < 3) return '';
      return `${top[0]} ${Math.round((top[1] / total) * 100)}%`;
    }
    return '';
  }

  _cellText(play, col) {
    const tags = play.tags || {};
    if (col.type === 'pen-readonly') {
      const penalties = PenaltyModel.normalizeList(play.penalties);
      if (!penalties.length) return StatsEngine.hasResult(play, 'Penalty')
        ? 'Legacy · details uncharted' : '—';
      if (col.key === 'penalty') return penalties.map(penalty =>
        [penalty.foul || 'Unspecified', penalty.disposition === 'unknown' ? '' : penalty.disposition]
          .filter(Boolean).join(' · ')).join(' / ');
      return penalties.map(penalty => {
        if (penalty.disposition !== 'accepted') return penalty.disposition;
        const team = penalty.team === 'subject' ? 'Subject'
          : penalty.team === 'opponent' ? 'Opponent' : 'Unknown';
        return `${team} ${penalty.yards == null ? '—' : penalty.yards}`;
      }).join(' / ');
    }
    if (col.type === 'st-readonly') {
      const special = SpecialTeamsModel.normalize(play.specialTeams);
      if (!special) return '—';
      const names = { kickoff:'Kickoff', kickoffReturn:'Kick Return', punt:'Punt', puntReturn:'Punt Return', fieldGoal:'Field Goal / XP', fieldGoalBlock:'Field Goal Block', try:'Try - Attempting', tryDefense:'Try - Defending' };
      if (col.key === 'stUnit') return names[special.unit] || special.unit;
      if (col.key === 'stOutcome') return [special.attemptType, special.result || special.outcome.status, special.events?.badSnap ? 'badSnap' : '', special.events?.blocked ? 'blocked' : '', special.events?.turnover || '', special.events?.defensiveReturn ? 'defensiveReturn' : '', special.outcome.returnAward || '', special.outcome.score].filter(Boolean).join(' · ');
      if (col.key === 'stKick') return [special.kick.distance == null ? '' : `${special.kick.distance} yds`, special.kick.hangTime == null ? '' : `${special.kick.hangTime}s`].filter(Boolean).join(' · ');
      if (col.key === 'stReturn') return [special.return.yards == null ? '' : `${special.return.yards} yds`, special.outcome.recoveredBy ? `possession: ${special.outcome.recoveredBy}` : ''].filter(Boolean).join(' · ');
    }
    if (col.type === 'sit') {
      if (!tags.down) return '—';
      const ordinal = { 1:'1st', 2:'2nd', 3:'3rd', 4:'4th' }[tags.down] || String(tags.down);
      return tags.distance ? `${ordinal} & ${tags.distance}` : ordinal;
    }
    if (col.type === 'yds') {
      const yards = parseInt(tags.yardage, 10);
      if (!Number.isFinite(yards)) return '';
      return yards > 0 ? `+${yards}` : yards < 0 ? `−${Math.abs(yards)}` : '0';
    }
    if (col.key === 'notes') return String(play.notes || '');
    if (StatsEngine.PROJECTED_FIELDS.includes(col.key)) {
      const value = StatsEngine.projField(play, col.key);
      if (value) return String(value);
      return col.key === 'formation' ? 'Not charted' : '';
    }
    return String(tags[col.key] || '');
  }

  // ---------- Inline editing ----------

  /** Options for an enum column, read live from the tag form's chip group so
   *  the grid can never offer values the form wouldn't. */
  // Final Engine Independence: a column's vocabulary used to be read live off
  // the legacy .tag-section chip DOM via col.src (e.g. `#tagFormation .pick`)
  // -- that markup is deleted. Library-backed fields (team-customizable
  // formation/backfield/front) now read the same TagLibrary source
  // native-tagging.jsx does; fixed-vocabulary fields read the same OPTIONS/
  // RESULT_OPTIONS constants that file exports, so there is exactly one copy
  // of each field's vocabulary, not two drifting apart.
  static LIBRARY_COLUMNS = { formation:'formation', backfield:'backfield', defFront:'front', coverage:'coverage', playType:'playType', blitz:'blitz' };
  _options(col, current = []) {
    let opts = this._optionCache[col.key];
    if (!opts) {
      const libKey = PlayGrid.LIBRARY_COLUMNS[col.key];
      if (libKey) {
        const group = this.customChips?.library?.group?.(libKey);
        opts = group ? group.values.filter(value => group.enabled.includes(value)) : [];
      } else if (col.key === 'result') {
        opts = [...RESULT_OPTIONS];
      } else {
        opts = [...(TAG_OPTIONS[col.key] || [])];
      }
      if (opts.length) this._optionCache[col.key] = opts;
    }
    let all = [...new Set([...(opts || []), ...current].filter(Boolean))];
    // E3b-P1/E4-2: a primary picker must not offer values that belong to ANY
    // of its registered projected SIBLINGS — the structural Formation picker
    // must not offer QB alignments or the Backfield 'Empty' token, the
    // Backfield picker must not offer QB alignments ('Pistol'), and the
    // Coverage CALL picker must not offer Man/Zone/Match. `col.key` can have
    // more than one registered sibling relationship (Formation has two), so
    // every one of them is excluded, not just the first.
    for (const pair of PlayGrid.PROJECTED_PAIRS[col.key] || []) {
      all = all.filter(v => !TagProjection[pair.excludeFrom].includes(v));
    }
    return all;
  }

  /** Apply an inline edit with the SAME semantics as the tag form. */
  _applyEdit(play, col, value) {
    if (col.key === 'notes') {
      play.notes = value;
    } else if (col.key === 'playCall') {
      PlayCallModel.apply(play, value, this.playbook,
        playType => PlayTagger.runPassForPlayType(playType));
    } else if (col.key === 'playConcept') {
      play.tags.playConcept = String(value || '').trim();
    } else if (col.type === 'sit') {
      play.tags.down = value.down;
      play.tags.distance = value.distance;
      // Mirror _saveField: a manual Dn&Dist edit clears the auto-fill flag so
      // the next Save & Next can't overwrite the correction (applyNextSituation
      // gates on !_autoSit).
      play._autoSit = false;
    } else {
      // Multi-select fields: drop mutually-exclusive rivals exactly like the
      // form (no more "Gain + Loss", which flipped a gain negative below).
      if (col.multi) value = PlayTagger.normalizeMulti(col.key, value);
      // E3b-P1/E4/E4-2 PROMOTE-THEN-STRIP (structural — see
      // TagProjection.reconcileSiblings, the exact same call the tag form's
      // _saveField makes). A legacy play stores a sibling dimension inside a
      // primary field (alignment inside formation/backfield, 'Empty' inside
      // formation, family inside coverage), and projection derives that
      // sibling FROM the string. Overwriting the primary with the coach's
      // explicit choice would silently destroy it; committing a sibling
      // directly (now that QB Alignment/Backfield/Strength/Coverage Family are
      // editable here too) would leave the primary's embedded token to
      // silently re-win on the next read. One call protects both directions.
      // Opening/cancelling never reaches here, so viewing writes nothing, and
      // the whole commit is a single history entry (undoable as one unit).
      TagProjection.reconcileSiblings(play, col.key);
      play.tags[col.key] = value;
      // Unambiguous play type auto-fills Run/Pass (mirror of _saveField).
      if (col.key === 'playType') {
        const auto = PlayTagger.runPassForPlayType(value);
        if (auto && play.tags.runPass !== auto) play.tags.runPass = auto;
      }
    }
    // Positive yardage with no result yet = a gain (mirror of _saveField), so a
    // yardage-only grid edit is classified the same as one typed in the form.
    if (col.key === 'yardage' && !play.tags.result) {
      if ((parseInt(String(play.tags.yardage), 10) || 0) > 0) play.tags.result = 'Gain';
    }
    // Yardage is a magnitude; Loss/Sack supply the sign (mirror of
    // _applyYardageSign — keep stored values consistent with form entry).
    if (col.key === 'yardage' || col.key === 'result') {
      const raw = String(play.tags.yardage ?? '').trim();
      if (raw !== '') {
        const mag = Math.abs(parseInt(raw, 10) || 0);
        const res = StatsEngine.splitResults(play.tags.result);
        play.tags.yardage = String(res.includes('Loss') || res.includes('Sack') ? -mag : mag);
      }
    }
    // Keep the tag form in lockstep when the edited play is loaded in it.
    if (play.id === this.tagger.currentPlayId) this.tagger._loadTagForm(play);
    this.tagger._emit('play-updated', play);
  }

  // ---------- Bulk watch ----------

  /** The plays Watch actually operates on: checked-AND-visible rows, or every
   *  visible row when nothing is checked. The button label/disabled state and
   *  _watch() must use the same pool, or the count lies (e.g. 3 plays checked,
   *  then a filter hides them — Watch must show 0 and disable, not "(3)"). */
  _watchPool(visible) {
    return this.selected.size ? visible.filter(p => this.selected.has(p.id)) : visible;
  }

  _watch() {
    const pool = this._watchPool(this._visiblePlays());
    if (!pool.length) return;
    // Mirror StatsEngine._watchPlays: only plays with a real video region are
    // playable, and with no video loaded a cut-up can't run — fall back to
    // selecting the first play so the click is never a silent no-op.
    const playable = pool.filter(p => p.timestamp && p.timestamp.end > p.timestamp.start);
    const hasVideo = !!(this.vc && this.vc.video && this.vc.video.src);
    if (playable.length && hasVideo && this.cutup) {
      const label = this.selected.size ? `${playable.length} selected plays` : `${playable.length} plays`;
      this.cutup.start(playable.map(p => p.id), label);
    } else {
      this.tagger.selectPlay(pool[0].id);
    }
  }

  // ---------- Film Room presentation API ----------

  subscribeNative(listener) {
    this._nativeListeners.add(listener);
    listener(this.nativeSnapshot());
    return () => this._nativeListeners.delete(listener);
  }

  _notifyNative() {
    if (!this._nativeListeners?.size) return;
    const snapshot = this.nativeSnapshot();
    for (const listener of this._nativeListeners) listener(snapshot);
  }

  _plainCell(play, col) { return this._cellText(play, col); }

  _plainTendency(col, visible) { return this._tendency(col, visible); }

  nativeSnapshot() {
    const plays = this.tagger.plays || [];
    const visible = this._visiblePlays();
    const columns = this._visibleCols().map(col => ({
      key: col.key, label: col.label, type: col.type, multi: !!col.multi,
      tendency: visible.length >= 5 ? this._plainTendency(col, visible) : '',
      editable: col.type !== 'st-readonly' && col.type !== 'pen-readonly',
    }));
    const selected = new Set(this.selected);
    const rows = visible.map(play => ({
      id: play.id,
      unit: play.tags?.unit === 'defense' || play.tags?.unit === 'special' ? play.tags.unit : 'offense',
      current: play.id === this.tagger.currentPlayId,
      selected: selected.has(play.id),
      untagged: PlayGrid.isUntagged(play),
      cells: Object.fromEntries(columns.map(col => [col.key, this._plainCell(play, col)])),
    }));
    return {
      total: plays.length,
      visible: visible.length,
      rows,
      columns,
      selected: [...selected],
      filters: this._serializeFilter(),
      filterActive: this._filterActive(),
      savedFilters: this.savedFilters.map((item, index) => ({ index, name: item.name })),
      watchCount: this._watchPool(visible).length,
      presets: Object.keys(PlayGrid.PRESETS),
      allColumns: PlayGrid.COLUMNS.map(col => ({ key: col.key, label: col.label })),
      activeColumns: [...this.cols],
    };
  }

  nativeToggleFilter(group, value) { this._toggleFilter(group, value); }
  nativeClearFilters() {
    this.f = { unit: '', downs: new Set(), rp: '', flags: new Set() };
    this.refresh();
  }
  nativeSetSelected(playId, checked) {
    if (checked) this.selected.add(Number(playId));
    else this.selected.delete(Number(playId));
    this.refresh();
  }
  nativeSetAllVisible(checked) {
    for (const play of this._visiblePlays()) {
      if (checked) this.selected.add(play.id);
      else this.selected.delete(play.id);
    }
    this.refresh();
  }
  nativeSelectPlay(playId) { this.tagger.selectPlay(Number(playId)); }
  nativeWatch() { this._watch(); }
  nativeApplyPreset(name) {
    if (!PlayGrid.PRESETS[name]) return false;
    this.cols = PlayGrid.PRESETS[name].slice();
    this._saveCols();
    this.refresh();
    return true;
  }
  nativeSetColumn(key, enabled) {
    if (!PlayGrid.COLUMNS.some(col => col.key === key)) return false;
    if (enabled) {
      const order = PlayGrid.COLUMNS.map(col => col.key);
      this.cols = order.filter(item => item === key || this.cols.includes(item));
    } else {
      if (this.cols.length === 1) return false;
      this.cols = this.cols.filter(item => item !== key);
    }
    this._saveCols();
    this.refresh();
    return true;
  }
  nativeApplySavedFilter(index) {
    const item = this.savedFilters[Number(index)];
    if (!item) return false;
    this._applySavedFilter(item.f);
    return true;
  }
  nativeDeleteSavedFilter(index) {
    if (!this.savedFilters[Number(index)]) return false;
    this.savedFilters.splice(Number(index), 1);
    this._saveSavedFilters();
    this.refresh();
    return true;
  }
  nativeSaveFilter(name) {
    name = String(name || '').trim();
    if (!name || !this._filterActive()) return false;
    this.savedFilters = this.savedFilters.filter(item => item.name !== name);
    this.savedFilters.push({ name, f: this._serializeFilter() });
    this._saveSavedFilters();
    this.refresh();
    return true;
  }
  nativeEditor(playId, colKey) {
    const play = this.tagger.getPlay(Number(playId));
    const col = PlayGrid.COLUMNS.find(item => item.key === colKey);
    if (!play || !col || col.type === 'st-readonly' || col.type === 'pen-readonly') return null;
    const projected = StatsEngine.projField(play, col.key);
    const value = col.type === 'sit'
      ? { down: play.tags.down || '', distance: play.tags.distance || '' }
      : col.key === 'notes' ? play.notes || '' : projected == null ? '' : String(projected);
    return {
      playId: play.id,
      col: { key: col.key, label: col.label, type: col.type, multi: !!col.multi },
      value,
      options: col.type === 'enum' ? this._options(col, String(projected || '').split(/\s*\+\s*/)) : [],
    };
  }
  nativeCommitEdit(playId, colKey, value) {
    const play = this.tagger.getPlay(Number(playId));
    const col = PlayGrid.COLUMNS.find(item => item.key === colKey);
    if (!play || !col) return false;
    this._applyEdit(play, col, value);
    this.refresh();
    return true;
  }

}
