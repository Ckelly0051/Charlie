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

import { countedUnit, isPlayTagged } from './football-rules.js';
import { SpecialTeamsModel } from './special-teams.js';
import { PenaltyModel } from './penalty-model.js';
import { PlayCallModel } from './play-call-model.js';
import { ChartingDetails } from './charting-details.js';
import { OPTIONS as TAG_OPTIONS, RESULT_OPTIONS } from './native-tagging.jsx';

export class PlayGrid {
  /**
   * Column registry. `src` is the tag-form chip group whose options the
   * editor lists (single source of truth); `unit` marks side-specific
   * columns for the presets. `sit` is the composite Down & Distance column;
   * `notes` edits play.notes (the call), not a tag.
   */
  static COLUMNS = [
    // UNIT, like Hudl's ODK: always shown first and edited in the row, so a
    // play's unit is charted where the coach is charting. Pinned: not in the
    // Columns list and not part of any stored set (1.12.0-99 smoke, S99-2).
    { key: 'unit',      label: 'Unit',      type: 'enum', pinned: true },
    { key: 'sit',       label: 'Dn & Dist', type: 'sit' },
    { key: 'quarter',   label: 'Qtr',       type: 'enum', src: 'tagQuarter' },
    { key: 'hash',      label: 'Hash',      type: 'enum', src: 'tagHash' },
    { key: 'formationFamily', label: 'Formation', type: 'enum', src: 'tagFormationFamily',       unit: 'offense' },
    { key: 'receiverSet', label: 'Rec Align', type: 'enum', src: 'tagReceiverSet',             unit: 'offense' },
    // QB Alignment, Backfield, Strength and Coverage Family are single-select
    // look fields, edited inline with the plain `enum` editor. Not in any
    // default preset, but available in the Columns menu like any other column.
    { key: 'qbAlignment', label: 'QB Align', type: 'enum', src: 'tagQbAlignment',              unit: 'offense' },
    { key: 'backfield', label: 'Backfield', type: 'enum', src: 'tagBackfield',                 unit: 'offense' },
    { key: 'strength',  label: 'OL Strength',  type: 'enum', src: 'tagStrength',                  unit: 'offense' },
    { key: 'personnel', label: 'Pers',      type: 'enum', src: 'tagPersonnel',                unit: 'offense' },
    { key: 'motion',    label: 'Motion',    type: 'enum', src: 'tagMotion',                   unit: 'offense' },
    // A motion's path opens with the motion (ChartingDetails.TRIGGERS): a cell is
    // locked while its opening field is blank.
    { key: 'motionStart', label: 'Mot Start', type: 'enum', src: 'tagMotionStart',            unit: 'offense' },
    { key: 'motionEnd', label: 'Mot End',   type: 'enum', src: 'tagMotionEnd',                unit: 'offense' },
    { key: 'playCall',  label: 'Play Call', type: 'call',                                  unit: 'offense' },
    { key: 'playConcept', label: 'Concept', type: 'text-tag',                               unit: 'offense' },
    { key: 'runPass',   label: 'R/P',       type: 'enum', src: 'tagRunPass' },
    { key: 'playType',  label: 'Type',      type: 'enum', src: 'tagPlayType',  multi: true },
    { key: 'playDir',   label: 'Dir',       type: 'enum', src: 'tagPlayDir' },
    { key: 'gap',       label: 'Gap',       type: 'enum', src: 'tagGap' },
    { key: 'rpoRead',   label: 'RPO Read',  type: 'enum', src: 'tagRpoRead' },
    { key: 'rpoDefender', label: 'RPO Def #', type: 'text-tag' },
    { key: 'rpoDecision', label: 'RPO Dec', type: 'enum', src: 'tagRpoDecision' },
    { key: 'qbRun',     label: 'QB Run',    type: 'enum', src: 'tagQbRun' },
    { key: 'result',    label: 'Result',    type: 'enum', src: 'tagResult',    multi: true },
    { key: 'yardage',   label: 'Yds',       type: 'yds' },
    { key: 'defFront',  label: 'Front',     type: 'enum', src: 'tagDefFront',  multi: true,   unit: 'defense' },
    { key: 'coverage',  label: 'Cover',     type: 'enum', src: 'tagCoverage',                 unit: 'defense' },
    { key: 'coverageFamily', label: 'Cov Family', type: 'enum', src: 'tagCoverageFamily',      unit: 'defense' },
    { key: 'blitz',     label: 'Blitz',     type: 'enum', src: 'tagBlitz',     multi: true,   unit: 'defense' },
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
    default: ['sit', 'playCall', 'formationFamily', 'receiverSet', 'qbAlignment', 'playType', 'result', 'yardage', 'penalty'],
    offense: ['sit', 'playCall', 'playConcept', 'formationFamily', 'receiverSet', 'qbAlignment', 'personnel', 'runPass', 'playType', 'gap', 'result', 'yardage', 'penalty', 'penaltyYards'],
    defense: ['sit', 'defFront', 'coverage', 'coverageFamily', 'blitz', 'result', 'yardage', 'penalty', 'penaltyYards'],
    special: ['sit', 'stUnit', 'stOutcome', 'stKick', 'stReturn', 'penalty', 'penaltyYards', 'notes'],
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
    // V2-H: bumped only on a wholesale play-list replacement (plays-loaded --
    // game switch, season open, undo/redo of the whole list). The windowed
    // native table uses this to reset its scroll position; a stale scroll
    // offset left over from a much longer previous game could otherwise slice
    // a shorter new list out of range and render nothing.
    this.loadGeneration = 0;
    this._raf = null;
    this._optionCache = {};
    this._nativeListeners = new Set();
    this._colSetsByTeam = {};
    this.savedFilters = this._loadSavedFilters();

    this._wireDomainEvents();
    this.refresh();
  }

  // ---------- Persistence ----------

  /* COLUMN SETS PER UNIT (coach direction, 2026-09-24). The table keeps four
     column sets -- Offense, Defense, Special Teams, and All plays -- and the
     unit FILTER picks which one is on screen, so turning on Blitz while viewing
     Defense changes only the defense table. `cols` is the active set, so every
     existing reader and writer keeps working. Sets belong to the program: one
     settings key per team, read lazily so a program switch brings its own; a
     program with none starts from the presets. The old global list is
     converted once on the coach's profile (legacy excision Pass 2b; the converter was deleted after the 1.12.0-103 smoke confirmed it). */
  static COLUMN_SCOPES = Object.freeze(['all', 'offense', 'defense', 'special']);
  static SCOPE_PRESET = Object.freeze({ all: 'default', offense: 'offense', defense: 'defense', special: 'special' });
  static SCOPE_LABEL = Object.freeze({ all: 'All plays', offense: 'Offense', defense: 'Defense', special: 'Special Teams' });
  _teamId() {
    try { return localStorage.getItem('ffa_active_team_id') || 'default'; } catch (e) { return 'default'; }
  }
  columnsKey() { return `ffa_film_room_columns_${this._teamId()}`; }
  _colScope() {
    const unit = this.f?.unit;
    return unit === 'offense' || unit === 'defense' || unit === 'special' ? unit : 'all';
  }
  _colSets() {
    const team = this._teamId();
    if (this._colSetsByTeam[team]) return this._colSetsByTeam[team];
    const known = new Set(PlayGrid.COLUMNS.map(c => c.key));
    const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } };
    let stored = read(this.columnsKey());
    // Sets saved while no program was active are written under `default`; the
    // first program to read them claims them, so a later program starts from
    // the presets instead of another program's choices.
    if (!stored && team !== 'default' && (stored = read('ffa_film_room_columns_default'))) {
      try { localStorage.setItem(this.columnsKey(), JSON.stringify(stored)); localStorage.removeItem('ffa_film_room_columns_default'); } catch (e) {}
    }
    const sets = {};
    for (const scope of PlayGrid.COLUMN_SCOPES) {
      const list = Array.isArray(stored?.[scope]) ? stored[scope].filter(k => known.has(k)) : [];
      sets[scope] = list.length ? list : PlayGrid.PRESETS[PlayGrid.SCOPE_PRESET[scope]].slice();
    }
    this._colSetsByTeam[team] = sets;
    // A program's first sets are written at once.
    if (!stored) this._saveCols();
    return sets;
  }
  get cols() { return this._colSets()[this._colScope()]; }
  set cols(list) { this._colSets()[this._colScope()] = Array.isArray(list) ? list.slice() : []; }
  _saveCols() {
    try { localStorage.setItem(this.columnsKey(), JSON.stringify(this._colSets())); return true; }
    catch (e) { console.error('Film Room columns could not be saved', e); return false; }
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
      this.loadGeneration++;
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
    if (f.unit && countedUnit(p) !== f.unit) return false;
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
    const pinned = PlayGrid.COLUMNS.filter(c => c.pinned);
    return [...pinned, ...this.cols.filter(k => !pinned.some(c => c.key === k)).map(k => PlayGrid.COLUMNS.find(c => c.key === k)).filter(Boolean)];
  }
  static UNIT_LABELS = Object.freeze({ offense: 'Offense', defense: 'Defense', special: 'Special Teams' });
  /**
   * Whether a play's unit cannot hold a column: the Special Teams columns on an
   * offensive or defensive snap, and the offense and defense look columns on a
   * Special Teams snap (which holds none of them). An offensive snap charts the
   * defense it faced and a defensive snap the offense it faced, so Formation and
   * Front belong on both (1.12.0-99 smoke, S99-1). The one rule for the
   * snapshot, the editor and the commit, whatever the scope or column set.
   */
  static cellLocked(play, col) {
    // A detail cell (Motion start, RPO read, QB run type) is locked while the
    // field that opens it is blank (ChartingDetails.TRIGGERS).
    const opener = ChartingDetails.TRIGGERS.find(trigger => trigger.children.includes(col?.key));
    if (opener && !opener.opened(play?.tags || {})) return true;
    if (!col?.unit) return false;
    if (SpecialTeamsModel.isRunPassTry(play)) return false;
    const unit = countedUnit(play);
    return unit === 'special' ? col.unit !== 'special' : col.unit === 'special';
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
    // The Yds header states the shown plays' yards per play, which the Film
    // Room screen fills from StatsEngine.playSetSummary -- the boards' own
    // cohort. Averaging only the plays with charted yardage printed avg 4.4
    // beside a board and a summary reading 3.4 (review, 97b2f37).
    if (col.type === 'yds' || col.key === 'unit') return '';
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
        ? 'Details uncharted' : '—';
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
      // The grid reads the model's unit names; the try units keep this column's
      // existing attempting/defending wording, which the deck does not show.
      const names = { ...SpecialTeamsModel.UNIT_LABELS, try:'Try - Attempting', tryDefense:'Try - Defending' };
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
    if (col.key === 'unit') return PlayGrid.UNIT_LABELS[countedUnit(play)];
    if (StatsEngine.PROJECTED_FIELDS.includes(col.key)) {
      const value = StatsEngine.projField(play, col.key);
      if (value) return String(value);
      return col.key === 'formationFamily' ? 'Not charted' : '';
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
  static LIBRARY_COLUMNS = { formationFamily:'formationFamily', backfield:'backfield', defFront:'front', coverage:'coverage', playType:'playType', blitz:'blitz' };
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
    // A picker never offers a value that belongs to another field: Formation
    // offers no QB alignment or 'Empty', Backfield no alignment, the Coverage
    // call no family.
    const exclude = TagProjection.PICKER_EXCLUDE[col.key] || [];
    return all.filter(v => !exclude.includes(v));
  }

  /** Apply an inline edit with the SAME semantics as the tag form. */
  _applyEdit(play, col, value) {
    if (col.key === 'notes') {
      play.notes = value;
    } else if (col.key === 'playCall') {
      PlayCallModel.apply(play, value, this.playbook,
        playType => PlayTagger.runPassForPlayType(playType));
    } else if (col.type === 'text-tag') {
      play.tags[col.key] = String(value || '').trim();
    } else if (col.type === 'sit') {
      play.tags.down = value.down;
      play.tags.distance = value.distance;
      // Mirror setTagValue: a manual Dn&Dist edit clears the auto-fill flag so
      // the next Save & Next can't overwrite the correction (applyNextSituation
      // gates on !_autoSit).
      play._autoSit = false;
    } else {
      // Multi-select fields: drop mutually-exclusive rivals exactly like the
      // form (no more "Gain + Loss", which flipped a gain negative below).
      if (col.multi) value = PlayTagger.normalizeMulti(col.key, value);
      play.tags[col.key] = value;
      // Unambiguous play type auto-fills Run/Pass (mirror of setTagValue).
      if (col.key === 'playType') {
        const auto = PlayTagger.runPassForPlayType(value);
        if (auto && play.tags.runPass !== auto) play.tags.runPass = auto;
      }
    }
    // Clear triggered details, preserving independent Gap and Direction.
    ChartingDetails.settle(play.tags, col.key);
    // Positive yardage with no result yet = a gain (mirror of setTagValue), so a
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





  nativeSnapshot() {
    const plays = this.tagger.plays || [];
    const visible = this._visiblePlays();
    const columns = this._visibleCols().map(col => ({
      key: col.key, label: col.label, type: col.type, multi: !!col.multi,
      tendency: visible.length >= 5 ? this._tendency(col, visible) : '',
      editable: col.type !== 'st-readonly' && col.type !== 'pen-readonly',
    }));
    const selected = new Set(this.selected);
    // A cell is blank and locked where the row's unit cannot hold the column
    // (PlayGrid.cellLocked), in every scope: a custom Offense set can carry a
    // Special Teams column (Codex review of 48cbf5d).
    const scope = this._colScope();
    const visibleCols = this._visibleCols();
    const rows = visible.map(play => {
      const unit = countedUnit(play);
      const na = visibleCols.filter(col => PlayGrid.cellLocked(play, col)).map(col => col.key);
      return {
        id: play.id, unit, na,
        current: play.id === this.tagger.currentPlayId,
        selected: selected.has(play.id),
        untagged: PlayGrid.isUntagged(play),
        cells: Object.fromEntries(columns.map(col => [col.key, na.includes(col.key) ? '' : this._cellText(play, col)])),
      };
    });
    return {
      total: plays.length,
      visible: visible.length,
      loadGeneration: this.loadGeneration,
      rows,
      columns,
      selected: [...selected],
      filters: this._serializeFilter(),
      filterActive: this._filterActive(),
      savedFilters: this.savedFilters.map((item, index) => ({ index, name: item.name })),
      watchCount: this._watchPool(visible).length,
      presets: Object.keys(PlayGrid.PRESETS),
      allColumns: PlayGrid.COLUMNS.filter(col => !col.pinned).map(col => ({ key: col.key, label: col.label, unit: col.unit || '' })),
      activeColumns: [...this.cols],
      columnScope: scope,
      // Which unit the on-screen plays are measured as (the Film Room screen
      // measures them through StatsEngine); a mix states its counts only.
      summarySide: scope !== 'all' ? scope
        : (units => (units.size === 1 ? [...units][0] : 'mixed'))(new Set(rows.map(row => row.unit))),
      columnScopeLabel: PlayGrid.SCOPE_LABEL[scope],
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
  nativeApplyPreset(name, scope) {
    if (!PlayGrid.PRESETS[name]) return false;
    if (scope && scope !== this._colScope()) return false;
    this.cols = PlayGrid.PRESETS[name].slice();
    this._saveCols();
    this.refresh();
    return true;
  }
  nativeSetColumn(key, enabled, scope) {
    if (!PlayGrid.COLUMNS.some(col => col.key === key)) return false;
    // The Columns sheet passes the set it shows; if the unit filter has moved
    // since, the write is refused rather than landing in another unit's set.
    if (scope && scope !== this._colScope()) return false;
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
    if (PlayGrid.cellLocked(play, col)) return null;
    if (col.key === 'unit') return {
      playId: play.id, col: { key: col.key, label: col.label, type: col.type, multi: false },
      value: PlayGrid.UNIT_LABELS[countedUnit(play)], options: Object.values(PlayGrid.UNIT_LABELS),
    };
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
  /** Commits an edit. A change that removes the field opening populated details
   *  (Motion, the RPO or QB Run play type, the Play Direction a Gap sits under)
   *  says what it clears and waits; the whole edit is then one undoable write.
   *  Returns a boolean, or a promise of one when it asked. */
  nativeCommitEdit(playId, colKey, value) {
    const play = this.tagger.getPlay(Number(playId));
    const col = PlayGrid.COLUMNS.find(item => item.key === colKey);
    if (!play || !col || PlayGrid.cellLocked(play, col)) return false;
    if (col.key === 'unit') {
      const unit = Object.keys(PlayGrid.UNIT_LABELS).find(key => PlayGrid.UNIT_LABELS[key] === value);
      if (!this.tagger.setPlayUnit(play, unit)) return false;
      this.refresh();
      return true;
    }
    const next = col.multi ? PlayTagger.normalizeMulti(col.key, value) : value;
    const removals = col.type === 'enum' || col.type === 'text-tag'
      ? ChartingDetails.orphans(play.tags, col.key, next)
      : col.key === 'playCall'
        ? PlayCallModel.losses(play, value, this.playbook, playType => PlayTagger.runPassForPlayType(playType)) : [];
    const commit = () => { this._applyEdit(play, col, value); this.refresh(); return true; };
    if (!removals.length) return commit();
    return this.tagger._confirmDialog(ChartingDetails.clearMessage(removals), 'Clear').then(ok => (ok ? commit() : false));
  }

}
