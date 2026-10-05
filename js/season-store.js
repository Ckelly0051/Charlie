/**
 * SeasonStore — the canonical "project = season" data container.
 *
 * One season holds many games; each game is the same per-game object the rest
 * of the app already serializes (plays, gameInfo, annotations, roster, …). The
 * season is the unit of work, so the app stops spawning a file artifact per
 * game / per save.
 *
 * Storage is hybrid (see CLAUDE.md "Season-as-Project"):
 *   1. Canonical store = the browser. The whole season lives under one
 *      localStorage key (`ffa_season`) and is autosaved continuously in place,
 *      so nothing proliferates.
 *   2. Backup / portability = a single Export/Import season file.
 *   3. Durable disk backup = the backend's disk layer. In the browser that's a
 *      bound folder (File System Access API) receiving `season.json` + a ring of
 *      timestamped snapshots; on desktop (Tauri) it's plain app-data files.
 *
 * Where bytes actually live is owned by a StorageBackend (storage-backend.js),
 * so the same SeasonStore runs in the browser or in a native shell unchanged.
 *
 * Video is never stored (too large). Each game references its video filename;
 * the coach re-links the file when they open that game.
 */
import { detectBackend } from './storage-backend.js';
import { SpecialTeamsModel } from './special-teams.js';
import { PenaltyModel } from './penalty-model.js';
import { countedUnit } from './football-rules.js';
import { SeasonFormat } from './season-format.js';

export class SeasonStore {
  /** Ceiling for the commit counter: far beyond any season's saves, and low
   *  enough that `revision + 1` always increments (it does not at
   *  Number.MAX_SAFE_INTEGER). */
  static MAX_REVISION = Number.MAX_SAFE_INTEGER - 1024;

  /** The stored marker proving a season's roster ownership has been settled at
   *  the season level: the season owns the roster and no game node carries one.
   *  Every season is born with it and `_normalize` stamps it. */
  static ROSTER_OWNERSHIP = 'season';

  constructor(backend) {
    this.SCHEMA = 5;
    this.data = null;
    this.currentSeasonId = null;
    this.backend = backend || detectBackend();
    this._diskTimer = null;
    // Revision fencing. `_writeChain` runs durable writes for one season in
    // dispatch order; `_revision` is the newest revision dispatched per season,
    // which a delayed frozen-payload write compares against to know it is
    // stale. Both are per session; `data.revision` is the durable marker that
    // seeds the next session.
    this._writeChain = new Map();   // seasonId -> tail promise (FIFO ordering)
    this._revision = new Map();     // seasonId -> newest dispatched revision
    // Seasons being deleted. A write queued behind an in-flight delete would
    // still run and resurrect the season, so writes are refused outright.
    this._deletingSeasons = new Set();
    this._lastWrite = new Map();    // seasonId -> most recent dispatched write's durable true/false (see pendingWrite())
    // Why the most recent open was refused (a stored season in an old format),
    // `{ seasonId, message, problems }`, or null. The caller reports it.
    this.openRefusal = null;
    this._openSeq = 0;   // latest openSeason() request; an earlier one still reading is superseded
  }

  // ---- lifecycle -----------------------------------------------------------

  /** Reload the current season's data from storage (after one is selected). */
  async load() {
    if (!this.currentSeasonId) return null;
    const priorData = this.data;
    let parsed = null;
    // A failed read keeps the live season; it is never "nothing saved yet".
    try { parsed = await this.backend.loadSeason(this.currentSeasonId); } catch (e) { return priorData; }
    // Every stored payload is validated -- a single-game save or any other old
    // shape is refused, never opened as an empty season. Only NO stored payload
    // (nothing saved yet) starts empty.
    if (parsed != null) {
      const hydrated = await this._hydrate(this.currentSeasonId, parsed);
      // Refused (old format): keep the live season exactly as it was.
      if (!hydrated) return priorData;
      this.data = hydrated;
    } else {
      this.data = this._empty();
    }
    return this.data;
  }

  /**
   * The one path that reads a stored season body into the live store. A season
   * not in the current format is refused, never converted or partly read: it
   * returns null, the caller keeps the open season, and the bytes stay as they
   * are.
   */
  async _hydrate(seasonId, parsed) {
    const problems = SeasonFormat.seasonProblems(parsed);
    if (problems.length) {
      const name = String(parsed.seasonName || seasonId);
      this.openRefusal = { seasonId, problems,
        message: `${name} uses an old GridIron IQ format and was not opened. Nothing was changed, and the season you had open is still open.` };
      try { console.warn('[season-format] open refused:', seasonId, problems.slice(0, 5)); } catch (e) {}
      return null;
    }
    this.openRefusal = null;
    const data = this._normalize(parsed);
    data.id = seasonId;
    this._seedRevision(seasonId, data);   // PC-4: continue the persisted sequence
    return data;
  }

  _empty() {
    const g = this.blankGame();
    return {
      version: this.SCHEMA, type: 'season',
      id: '', seasonName: '', team: '', year: '', level: '', kind: '',
      // An opponent scout names the program season that owns it. A program
      // season carries '' — it IS its own parent. This is the durable
      // relationship; nothing infers it from team/year/level or lastOpened.
      programSeasonId: '',
      // A brand-new season is born owning its roster: the marker is part of the
      // blank shape, so a freshly created season is never a migration candidate
      // and its first open performs no compatibility write.
      teamProfile: {}, roster: [], rosterOwnership: SeasonStore.ROSTER_OWNERSHIP,
      playbook: { version: 1, calls: [] },
      games: [g], activeGameId: g.id,
      plans: [],
      // Commit counter; a season saved without one normalizes to 0.
      revision: 0,
    };
  }

  /**
   * A season-level game-plan workspace. `data.plans` lives on the season, not a
   * game, because a plan's film references span games. A season with no
   * `plans` key normalizes to `[]`; plans persist inside the season body.
   *
   * Shape (the normalizer preserves unknown keys so it can grow):
   *   plan = { id, name, audience, createdAt, updatedAt, notes, items: [planItem] }
   *   planItem = { id, kind, label, refs: ['gameId::playId'], query, note, createdAt }
   *     kind: 'finding' (a saved Study result) | 'film' (bare film refs) | 'note'
   *     refs: the same composite `gameId::playId` identity Study and
   *           CrossGameCutup use, so a plan item plays through the cross-game path.
   */
  blankPlan(name) {
    const now = new Date().toISOString();
    return { id: this._planId(), name: (name || 'Game Plan'), audience: 'staff', createdAt: now, updatedAt: now, notes: '', items: [] };
  }
  _planId() { return 'plan' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  _normalizePlans(list) {
    if (!Array.isArray(list)) return [];
    return list.map(p => this._normalizePlan(p)).filter(Boolean);
  }
  _normalizePlan(p) {
    if (!p || typeof p !== 'object') return null;
    const now = new Date().toISOString();
    return {
      ...p,                                              // preserve unknown/future keys
      id: p.id || this._planId(),
      name: typeof p.name === 'string' ? p.name : 'Game Plan',
      audience: typeof p.audience === 'string' && p.audience.trim() ? p.audience.trim() : 'staff',
      createdAt: p.createdAt || now,
      updatedAt: p.updatedAt || p.createdAt || now,
      notes: typeof p.notes === 'string' ? p.notes : '',
      items: Array.isArray(p.items) ? p.items.map(it => this._normalizePlanItem(it)).filter(Boolean) : [],
    };
  }
  _normalizePlanItem(it) {
    if (!it || typeof it !== 'object') return null;
    return {
      ...it,                                             // preserve unknown/future keys
      id: it.id || ('pi' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
      kind: typeof it.kind === 'string' ? it.kind : 'note',
      label: typeof it.label === 'string' ? it.label : '',
      refs: Array.isArray(it.refs) ? it.refs.map(String) : [],
      note: typeof it.note === 'string' ? it.note : '',
      createdAt: it.createdAt || new Date().toISOString(),
    };
  }

  // ---- plan workspace API (mutations only; caller persists, like setActive) ---
  // A single normalized seam so the Plan UI never hand-rolls plan shape / drifts
  // updatedAt. These mutate `this.data.plans` and return the affected object; the
  // caller decides when to persist() (matching the store's other mutators).
  plans() { return (this.data && Array.isArray(this.data.plans)) ? this.data.plans : []; }
  getPlan(id) { return this.plans().find(p => p.id === id) || null; }
  createPlan(name) {
    if (!this.data) return null;
    if (!Array.isArray(this.data.plans)) this.data.plans = [];
    const plan = this.blankPlan(name);
    this.data.plans.push(plan);
    return plan;
  }
  renamePlan(id, name) {
    const p = this.getPlan(id); if (!p) return null;
    p.name = (typeof name === 'string' && name.trim()) ? name.trim() : p.name;
    p.updatedAt = new Date().toISOString();
    return p;
  }
  setPlanNotes(id, notes) {
    const p = this.getPlan(id); if (!p) return null;
    p.notes = typeof notes === 'string' ? notes : '';
    p.updatedAt = new Date().toISOString();
    return p;
  }
  setPlanAudience(id, audience) {
    const p = this.getPlan(id); if (!p) return null;
    p.audience = (typeof audience === 'string' && audience.trim()) ? audience.trim() : 'staff';
    p.updatedAt = new Date().toISOString();
    return p;
  }
  deletePlan(id) {
    if (!this.data || !Array.isArray(this.data.plans)) return false;
    const before = this.data.plans.length;
    this.data.plans = this.data.plans.filter(p => p.id !== id);
    return this.data.plans.length < before;
  }
  /** Append a Study finding or film reference to a plan. `item` follows planItem. */
  addPlanItem(planId, item) {
    const p = this.getPlan(planId); if (!p) return null;
    const it = this._normalizePlanItem(item || {});
    if (!it) return null;
    p.items.push(it);
    p.updatedAt = new Date().toISOString();
    return it;
  }
  removePlanItem(planId, itemId) {
    const p = this.getPlan(planId); if (!p) return false;
    const before = p.items.length;
    p.items = p.items.filter(it => it.id !== itemId);
    if (p.items.length < before) { p.updatedAt = new Date().toISOString(); return true; }
    return false;
  }
  /**
   * Reorder a plan's items to match `orderedIds` (the drag-reorder seam).
   * Defensive: unknown ids are ignored, and any current item NOT named in
   * `orderedIds` keeps its relative order and is appended — so a partial/stale id
   * list can never drop an item. Returns true if the order actually changed.
   */
  reorderPlanItems(planId, orderedIds) {
    const p = this.getPlan(planId); if (!p || !Array.isArray(orderedIds)) return false;
    const byId = new Map(p.items.map(it => [it.id, it]));
    const seen = new Set();
    const next = [];
    for (const id of orderedIds) { const it = byId.get(id); if (it && !seen.has(id)) { seen.add(id); next.push(it); } }
    for (const it of p.items) { if (!seen.has(it.id)) next.push(it); }   // never drop unnamed items
    if (next.length !== p.items.length) return false;                   // safety: no add/drop
    const changed = next.some((it, i) => it !== p.items[i]);
    if (!changed) return false;
    p.items = next;
    p.updatedAt = new Date().toISOString();
    return true;
  }
  /** Accessible move: shift one item by `delta` (±1) within its plan. */
  movePlanItem(planId, itemId, delta) {
    const p = this.getPlan(planId); if (!p) return false;
    const from = p.items.findIndex(it => it.id === itemId);
    if (from < 0) return false;
    const to = from + (delta < 0 ? -1 : 1);
    if (to < 0 || to >= p.items.length) return false;
    const [it] = p.items.splice(from, 1);
    p.items.splice(to, 0, it);
    p.updatedAt = new Date().toISOString();
    return true;
  }

  blankGame() {
    return {
      id: this._newId(), name: 'New Game', status: 'active',
      gameInfo: { perspective: 'offense' }, plays: [], annotations: [],
      nextId: 1, currentPlayId: null,
      videoFileName: null, clipNames: [], isMultiClip: false,
    };
  }

  _newId() { return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /** Backfield and strength are always strings on a current play. */
  static coerceLookFields(p) {
    if (!p || !p.tags) return;
    if (typeof p.tags.backfield !== 'string') p.tags.backfield = '';
    if (typeof p.tags.strength !== 'string') p.tags.strength = '';
  }

  // Special-teams plays can't carry offensive/defensive alignment — the ST tag
  // form hides the Formation/Personnel and Front/Coverage/Blitz groups entirely,
  // so there is no way to set them on an ST snap. Any such value on a
  // unit:'special' play is therefore a leak (classically: an offensive formation
  // that propagated play-to-play through the Save-&-Next carry, coding every ST
  // play as "Under Center"). Strip it. Idempotent and safe — nothing intentional
  // can ever live in these fields on an ST play.
  //
  // The one strip list; play-tagger reads it rather than keeping a copy
  // (GRIDIRON-IQ-TAG-MODEL.md §8, GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md §8).
  static ST_ALIGNMENT_KEYS = ['qbAlignment', 'formationFamily', 'receiverSet', 'backfield', 'strength',
    'personnel', 'defFront', 'coverage', 'coverageFamily', 'blitz'];
  static stripStAlignment(p) {
    if (!p || !p.tags || countedUnit(p) !== 'special' || SpecialTeamsModel.isRunPassTry(p)) return;
    SeasonStore.ST_ALIGNMENT_KEYS.forEach(k => { if (p.tags[k]) p.tags[k] = ''; });
  }

  // Our custom defensive fronts (the .our-def-only chips in index.html) can never
  // be a "defense faced" on an OFFENSE snap — the opponent doesn't run our team's
  // named fronts. So an our-own front on a non-defense play is carry leak (the
  // Save-&-Next carry copied our defensive front onto an offense snap before the
  // v1.9.20 same-unit fix). Strip just those components, keeping any real faced
  // front: "Maverick + 5-2" → "5-2", "Maverick" → "". Mirrors the chip list.
  static OUR_DEF_ONLY_FRONTS = ['Maverick', 'Eagle', 'Falcon', 'Jumbo Shift'];
  static stripLeakedFronts(p) {
    if (!p || !p.tags || countedUnit(p) === 'defense') return;
    if (!p.tags.defFront) return;
    p.tags.defFront = String(p.tags.defFront).split('+').map(s => s.trim())
      .filter(x => x && !SeasonStore.OUR_DEF_ONLY_FRONTS.includes(x)).join(' + ');
  }

  /** Coerce any loaded object into a well-formed season (back-compat safe). */
  _normalize(d) {
    d.version = this.SCHEMA; d.type = 'season';
    if (!Array.isArray(d.games) || !d.games.length) d.games = [this.blankGame()];
    d.games.forEach(g => {
      if (!g.id) g.id = this._newId();
      g.plays = g.plays || [];
      g.annotations = g.annotations || [];
      g.gameInfo = g.gameInfo || {};
      if (g.nextId == null) g.nextId = (g.plays.length + 1);
      if (!g.status) g.status = 'active';
      g.plays.forEach(p => {
        if (!p.tags || typeof p.tags !== 'object') p.tags = {};
        for (const key of ['playCall', 'playCallId', 'playConcept', 'fumbleRecovery']) {
          if (typeof p.tags[key] !== 'string') p.tags[key] = p.tags[key] == null ? '' : String(p.tags[key]);
        }
        if (!['', 'subject', 'opponent', 'unknown'].includes(p.tags.fumbleRecovery)) p.tags.fumbleRecovery = 'unknown';
        // Custom tags are a list. A missing key is an empty list; any other
        // shape is the retired format, refused by SeasonFormat before it gets here.
        if (p?.tags && p.tags.custom == null) p.tags.custom = [];
        SeasonStore.coerceLookFields(p);
        SeasonStore.stripStAlignment(p);
        SeasonStore.stripLeakedFronts(p);
        SpecialTeamsModel.normalizePlay(p);
        PenaltyModel.normalizePlay(p);
      });
    });
    if (!d.activeGameId || !d.games.some(g => g.id === d.activeGameId)) {
      d.activeGameId = d.games[0].id;
    }
    d.teamProfile = d.teamProfile || {};
    // The season owns the roster; a game node carries none (an old file with a
    // game roster is refused by SeasonFormat before it gets here).
    d.roster = Array.isArray(d.roster) ? d.roster : [];
    d.rosterOwnership = SeasonStore.ROSTER_OWNERSHIP;
    d.playbook = d.playbook && Array.isArray(d.playbook.calls)
      ? { version: Number(d.playbook.version) || 1, calls: d.playbook.calls }
      : { version: 1, calls: [] };
    d.seasonName = d.seasonName || '';
    // Coerced, never inferred: a legacy scout with no stored parent normalizes
    // to '' and is surfaced as needing assignment rather than attached to a
    // guess. Only a program season may be '' legitimately.
    d.programSeasonId = typeof d.programSeasonId === 'string' ? d.programSeasonId : '';
    d.team = d.team || (d.teamProfile && d.teamProfile.teamName) || '';
    d.year = d.year || '';
    d.level = d.level || '';
    d.plans = this._normalizePlans(d.plans);   // Phase 3: season-level game-plan workspace (backward-compat default [])
    // An untrusted revision (missing, malformed or hand-edited) normalizes to 0.
    // The upper bound matters too: at Number.MAX_SAFE_INTEGER `revision + 1`
    // stops incrementing and the fence would silently stop working.
    d.revision = (Number.isInteger(d.revision) && d.revision >= 0 && d.revision < SeasonStore.MAX_REVISION)
      ? d.revision : 0;
    return d;
  }

  // ---- season library (multi-season front door) ----------------------------

  /** True once a season is open and its data is loaded. */
  hasCurrent() { return !!this.currentSeasonId && !!this.data; }

  /** List all seasons in the library (metas only — does not load any). */
  async listSeasons() { return this.backend.listSeasons(); }

  /** Whether this backend can recover seasons from the Documents mirror
   *  (desktop only). */
  canRecoverSeasons() { return typeof this.backend.scanRecoverableSeasons === 'function'; }

  /** Recovery step 1: preview candidates from the Documents-mirror snapshots.
   *  Writes nothing. Returns [] on a backend without recovery scanning. */
  async scanRecoverableSeasons() {
    try { return (await this.backend.scanRecoverableSeasons?.()) || []; }
    catch (e) { return []; }
  }

  /** Recovery step 2: the confirmed one-way import of one candidate into the
   *  canonical catalog. `confirmOverwrite` is true only after the coach has
   *  agreed to the conflict shown by scanRecoverableSeasons(); this method has
   *  no confirmation UI of its own. */
  async recoverSeasonFromMirror(id, opts) {
    if (typeof this.backend.recoverSeasonFromMirror !== 'function') return { ok: false, reason: 'unsupported' };
    try { return await this.backend.recoverSeasonFromMirror(id, opts); }
    catch (e) { return { ok: false, reason: 'error', message: String(e?.message || e) }; }
  }

  /** Read-only peek at ANY season's full data by id, without opening it or
   *  touching currentSeasonId. For callers that need real game/film data for
   *  a season that is not the active one (e.g. Team Hub's film verification)
   *  and must not disturb navigation or risk a race with a concurrent open. */
  async peekSeason(id) {
    if (!id) return null;
    try { return (await this.backend.peekSeason?.(id)) || null; }
    catch (e) { return null; }
  }

  // Internal: durably create a season record via the backend WITHOUT touching
  // live state (currentSeasonId/data). Pure allocation -- the only thing that
  // can fail here is the backend write itself, never a race with something
  // else the coach is doing, because nothing about "current" is read or
  // written. Shared by createSeason() (below, unconditional switch) and
  // createUnclaimedSeasonIfEmpty() (guarded switch, see below).
  async _createSeasonRecordOnly(meta) {
    return this.backend.createSeason(meta || {});
  }

  // Internal: point live state at an already-durably-created record. No
  // guard of its own -- callers decide when this is safe to run.
  _adoptSeasonRecord(rec, meta) {
    this.currentSeasonId = rec.id;
    this.backend.setCurrentSeason(rec.id);
    this.data = this._empty();
    this.data.id = rec.id;
    this.data.seasonName = rec.name;
    this.data.team = rec.team; this.data.teamId = rec.teamId || meta?.teamId || ''; this.data.year = rec.year; this.data.level = rec.level;
    this.data.kind = rec.kind || meta?.kind || '';
    this.data.programSeasonId = String(rec.programSeasonId || meta?.programSeasonId || '');
    if (rec.team) this.data.teamProfile = { ...(this.data.teamProfile || {}), teamName: rec.team };
    if (meta?.playbook && Array.isArray(meta.playbook.calls)) this.data.playbook = meta.playbook;
  }

  /**
   * Create a brand-new season from {name, team, year, level}, make it current,
   * and seed it with one empty game. Returns the library meta.
   *
   * This is the deliberate "New Season" action (Team Hub, loadDemoSeason(),
   * StorageManager.createSeason()) -- the coach explicitly asked for this
   * season to become current, so the switch is UNCONDITIONAL by design: there
   * is no "someone else already claimed the pointer" case to protect against
   * here the way there is for an implementation-detail scaffold (see
   * createUnclaimedSeasonIfEmpty() below).
   */
  async createSeason(meta) {
    this.cancelPendingDiskWrite();   // see openSeason — same stale-debounce hazard
    const rec = await this._createSeasonRecordOnly(meta);
    if (!rec) return null;
    this._adoptSeasonRecord(rec, meta);
    this.persist();
    return rec;
  }

  /**
   * Durably create a scaffold season and make it current only if no season was
   * opened or created while the create was in flight. Used only by
   * StorageManager.loadProject()'s first-run import, which needs a real
   * library id but must never take the editor away from a season the coach
   * opened meanwhile. A separate method from createSeason(), whose
   * unconditional switch is right for a deliberate New Season.
   *
   * Returns `{ rec, claimed }`. `rec` is set whenever the durable create
   * succeeded; when `claimed` is false the caller deletes it.
   *
   * The blank body is deliberately not persisted: the caller's adopt()
   * immediately writes the real import to this id, and an unordered blank
   * write could land after it and overwrite the import.
   */
  async createUnclaimedSeasonIfEmpty(meta) {
    this.cancelPendingDiskWrite();
    const rec = await this._createSeasonRecordOnly(meta);
    if (!rec) return { rec: null, claimed: false };
    if (this.hasCurrent()) return { rec, claimed: false };   // someone else opened/created a season meanwhile
    this._adoptSeasonRecord(rec, meta);
    return { rec, claimed: true };
  }

  /**
   * Open an existing season by id and load its data as the current season.
   *
   * Nothing changes until the read has finished: the season id, the backend
   * pointer and the data switch together, in one synchronous step, so no edit,
   * save or film load in between can see a season id paired with another
   * season's data.
   *
   * Returns null and opens NOTHING when
   *   - the read fails (a failed read is not "no season saved yet": opening it
   *     empty let the next persist() replace the saved plays with none),
   *   - the stored season is in an old format (`_hydrate`), or
   *   - a later openSeason() started while this one was reading; the latest
   *     request owns the result.
   * The season the coach already had open stays open with its data untouched.
   */
  async openSeason(id) {
    const seq = ++this._openSeq;
    const superseded = () => seq !== this._openSeq;
    this.cancelPendingDiskWrite();   // a stale debounce must not target the new season
    let parsed = null;
    try { parsed = await this.backend.loadSeason(id); }
    catch (e) {
      if (superseded()) return null;
      try { console.error('[season-store] open failed: season could not be read', id, e); } catch (e2) {}
      this.openRefusal = { seasonId: id, problems: ['read failed'],
        message: 'That season could not be read. Nothing was changed, and the season you had open is still open.' };
      return null;
    }
    if (superseded()) return null;
    let data;
    // Every stored payload is validated (see load()); only none starts empty.
    if (parsed != null) {
      if (typeof parsed === 'object') parsed.id = id;   // this library slot, not the payload's own id
      data = await this._hydrate(id, parsed);
      if (superseded() || !data) return null;
    } else {
      data = this._empty();
    }
    data.id = id;
    this.cancelPendingDiskWrite();
    this.backend.setCurrentSeason(id);
    this.currentSeasonId = id;
    this.data = data;
    try { await this.backend.touchOpened(id); } catch (e) {}
    return this.data;
  }

  /** Delete a season from the library (and clear it if it was current). */
  async deleteSeason(id) {
    if (this.currentSeasonId === id) this.cancelPendingDiskWrite();
    // Set the delete fence synchronously, before the delete's own write is
    // dispatched, so no later write can slip in and resurrect the season.
    // _rawEnqueue() bypasses the fence so the delete does not refuse itself.
    this._deletingSeasons.add(id);
    let ok;
    try {
      ok = await this._rawEnqueue(id, () => this.backend.deleteSeason(id));
    } finally {
      // Season ids can be REUSED (StorageBackend.createSeason slugifies the
      // name and only checks against the CURRENTLY-LISTED seasons, so a
      // freshly deleted "Season A" frees up its exact id for a brand new
      // "Season A"). The fence must not outlive this one delete attempt --
      // on failure the season is still legitimately open and must stay
      // writable; on success the id must become writable again the moment a
      // new season claims it. By the time this resolves nothing could have
      // queued a write behind THIS delete's own dispatch (the fence blocked
      // every attempt for the entire window), so clearing it here is safe
      // either way.
      this._deletingSeasons.delete(id);
    }
    // Only tear down the open editor when the delete was durable. A backend that
    // retained the season (canonical delete failed) keeps it loaded; a legacy
    // backend returning undefined is treated as success (backward compatible).
    if (ok !== false && this.currentSeasonId === id) { this.currentSeasonId = null; this.data = null; }
    // A deleted season's queue and revision sequence go with it; a recreated
    // id starts fresh rather than inheriting the old high-water mark.
    if (ok !== false) { this._writeChain.delete(id); this._revision.delete(id); this._lastWrite.delete(id); }
    return ok !== false;
  }

  /** Close the current season (back to the library, nothing loaded). */
  closeSeason() { this.cancelPendingDiskWrite(); this.currentSeasonId = null; this.data = null; }

  // ---- game accessors ------------------------------------------------------

  activeIndex() { return this.data.games.findIndex(g => g.id === this.data.activeGameId); }
  activeGame() { return this.data.games[this.activeIndex()] || null; }

  /** Friendly label derived from the game's own info. */
  gameName(g, fallbackIdx) {
    const gi = (g && g.gameInfo) || {};
    // Optional week label leads the name when present: a bare number becomes
    // "Week 3", anything else is used verbatim ("Playoffs", "Scrimmage").
    const wk = String(gi.week || '').trim();
    const wkLabel = wk ? (/^\d+$/.test(wk) ? `Week ${wk}` : wk) : '';
    if (gi.opponent) return wkLabel ? `${wkLabel} vs ${gi.opponent}` : `vs ${gi.opponent}`;
    if (wkLabel) return wkLabel;
    if (gi.projectName) return gi.projectName;
    if (g && g.videoFileName) return String(g.videoFileName).replace(/\.[^.]+$/, '');
    return 'Game ' + ((fallbackIdx != null ? fallbackIdx : 0) + 1);
  }

  /** Replace the active game's stored state with a freshly serialized game. */
  updateActiveGame(gameObj) {
    const i = this.activeIndex();
    if (i < 0) return;
    const prev = this.data.games[i];
    gameObj.id = prev.id;
    gameObj.name = this.gameName(gameObj, i);
    gameObj.status = gameObj.status || prev.status || 'active';
    // Film source mode (`managed` default | `linked`) + the linked folder live on
    // the game node, NOT in _serialize() output — so carry them forward, or the
    // commitActive() right after linking a game would drop them and linked film
    // wouldn't survive a reopen. (Same reason status is carried above.)
    if (prev.filmMode && !gameObj.filmMode) { gameObj.filmMode = prev.filmMode; gameObj.filmDir = prev.filmDir; }
    this.data.games[i] = gameObj;
  }

  addGame(gameObj) {
    const g = gameObj || this.blankGame();
    if (!g.id) g.id = this._newId();
    if (!g.name) g.name = this.gameName(g, this.data.games.length);
    this.data.games.push(g);
    this.data.activeGameId = g.id;
    return g;
  }

  removeGame(id) {
    const i = this.data.games.findIndex(g => g.id === id);
    if (i < 0) return null;
    this.data.games.splice(i, 1);
    if (!this.data.games.length) this.data.games.push(this.blankGame());
    if (this.data.activeGameId === id) {
      const next = this.data.games[Math.min(i, this.data.games.length - 1)];
      this.data.activeGameId = next.id;
    }
    return this.activeGame();
  }

  setActive(id) {
    if (this.data.games.some(g => g.id === id)) { this.data.activeGameId = id; return true; }
    return false;
  }

  setGameStatus(id, status) {
    const g = this.data.games.find(g => g.id === id);
    if (g) g.status = status;
  }

  gameStatus(g) { return (g && g.status) || 'active'; }

  /** True when the active game has no plays, no film, and no identifying
   *  game info — i.e. safe to reuse instead of stacking another blank. */
  isEmptyActive() {
    const g = this.activeGame();
    if (!g) return false;
    const gi = g.gameInfo || {};
    return (g.plays || []).length === 0 && !g.videoFileName
      && !gi.opponent && !gi.projectName && !gi.date;
  }

  /**
   * Chronological order, by gameInfo.date when present.
   *
   * Coaches commonly leave Game 1 undated, then date later games. The old code
   * treated a missing date as +Infinity, which shoved that first game to the
   * END — so a season like [Patriots(no date), Irish(Aug), Ravens(Sep)] rendered
   * as [Irish, Ravens, Patriots] and every trend line drew Week 1 on the far
   * right ("the graphs are backwards"). Instead, fill a missing date from the
   * nearest dated game: carry the previous game's date forward, and for a
   * leading undated game borrow the first later date. Creation (array) order is
   * the final tiebreaker, so a run of undated games — or same-day games — stays
   * in the order it was added. When NO game has a date, it's pure creation order.
   */
  gamesChrono() {
    const raw = (this.data.games || []).map((g, i) => ({
      g, i, t: Date.parse((g.gameInfo && g.gameInfo.date) || ''), fill: null,
    }));
    let carry = null;                         // previous dated game, going forward
    raw.forEach(x => { if (!isNaN(x.t)) carry = x.t; else x.fill = carry; });
    let future = null;                        // first dated game, going backward
    for (let k = raw.length - 1; k >= 0; k--) {
      const x = raw[k];
      if (!isNaN(x.t)) future = x.t;
      else if (x.fill == null) x.fill = future;
    }
    const key = (x) => (!isNaN(x.t) ? x.t : x.fill);   // null only if no dates exist at all
    return raw.sort((a, b) => {
      const ak = key(a), bk = key(b);
      if (ak == null || bk == null) return a.i - b.i;  // no date signal → creation order
      return ak === bk ? a.i - b.i : ak - bk;
    }).map(x => x.g);
  }

  json() { this._stripStAlignmentBeforeSave(); return JSON.stringify(this.data, null, 2); }

  fileBase() {
    const raw = this.data.seasonName || (this.data.teamProfile && this.data.teamProfile.teamName) || 'season';
    return String(raw).trim().replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'season';
  }

  // ---- persistence (delegated to the backend) ------------------------------

  /**
   * Fast canonical save, then a debounced silent write of the live file to the
   * durable disk target (if one is bound). No new snapshot here — snapshots are
   * created on explicit saves / throttled auto-snapshots via snapshot().
   */
  // Data-at-rest barrier for the Special Teams alignment rule
  // (GRIDIRON-IQ-TAG-MODEL.md §7a). _normalize strips on read and
  // PlayTagger._emit keeps the live object clean; every durable write path
  // (persist, snapshot/saveNow, bindDisk, json) calls this too, because each
  // serializes this.data independently. Idempotent; touches only Special Teams
  // plays. adopt() passes the season object it captured before any await.
  _stripStAlignmentBeforeSave(data = this.data) {
    const games = data && Array.isArray(data.games) ? data.games : [];
    games.forEach(g => (g.plays || []).forEach(p => SeasonStore.stripStAlignment(p)));
  }

  // `seasonId`/`data` default to the ambient current season/store, so every
  // existing ambient caller is unchanged. adopt() passes both explicitly
  // (its own captured destination id + normalized payload) so this save and
  // its debounced disk-sync always target the season this call started
  // with, never whatever the ambient store has since switched to.
  /**
   * Stamp the next revision for `seasonId` onto `data` and record it as the
   * newest dispatched. It is based on the higher of the payload's stored
   * revision and the newest already dispatched this session: a restored backup
   * carries its old revision, and must still become a newer commit.
   */
  _nextRevision(seasonId, data) {
    const stored = (data && Number.isInteger(data.revision) && data.revision >= 0) ? data.revision : 0;
    const dispatched = this._revision.get(seasonId);
    const next = Math.max(stored, Number.isInteger(dispatched) ? dispatched : 0) + 1;
    if (data) data.revision = next;
    this._revision.set(seasonId, next);
    return next;
  }

  /**
   * Seed the in-memory revision sequence from a season's stored body, so the
   * first write of a session continues the persisted sequence.
   */
  _seedRevision(seasonId, data) {
    if (!seasonId) return;
    const stored = (data && Number.isInteger(data.revision) && data.revision >= 0) ? data.revision : 0;
    const known = this._revision.get(seasonId);
    this._revision.set(seasonId, Math.max(stored, Number.isInteger(known) ? known : 0));
  }

  /**
   * Run durable writes for one season strictly in dispatch order, so an
   * earlier payload can never land after a newer one (or after a restore) and
   * revert it. Chained per season id; the next write runs whether the previous
   * resolved or rejected. Refuses to queue for a season being deleted;
   * deleteSeason() uses _rawEnqueue() instead.
   */
  _enqueueWrite(seasonId, run) {
    if (this._deletingSeasons.has(seasonId)) return Promise.resolve(false);
    return this._rawEnqueue(seasonId, run);
  }

  /** The actual FIFO queueing mechanism, ungated. Only deleteSeason() may call
   *  this directly; every other write path goes through _enqueueWrite() above. */
  _rawEnqueue(seasonId, run) {
    const tail = this._writeChain.get(seasonId);
    let next;
    if (tail) {
      next = tail.then(run, run);   // contention: strictly after the in-flight write, pass or fail
    } else {
      // NO contention: start the backend write SYNCHRONOUSLY. persist() has
      // always had the property that a fire-and-forget call has already begun
      // its write by the time it returns, and callers depend on it -- notably
      // the browser backend, whose localStorage write completes synchronously,
      // so `store.persist(); await backend.loadSeason(id)` reads back the state
      // just written. Deferring every write to a microtask silently broke that
      // and was caught by the integrity fuzzer's persist-then-reload check
      // (8 RELOAD violations across 5 seeds), not by any focused test.
      try { next = Promise.resolve(run()); } catch (e) { next = Promise.reject(e); }
    }
    // This write's own durable result, for pendingWrite(). Never rejects:
    // a rejected write reports false.
    this._lastWrite.set(seasonId, next.then(v => v !== false, () => false));
    // Drop the tail as soon as it drains, so the next uncontended write again
    // starts synchronously instead of chaining onto an already-resolved
    // promise. This MUST happen in the same continuation that observes `next`
    // settling, not a chained `.then` on top of it: a chained cleanup lands one
    // microtask later, and an op dispatched inside that gap still saw a stale
    // tail and got deferred (the integrity fuzzer went 8 -> 5 RELOAD violations
    // rather than to 0 until this was tightened).
    let settled;
    const drain = () => { if (this._writeChain.get(seasonId) === settled) this._writeChain.delete(seasonId); };
    settled = next.then(drain, drain);
    this._writeChain.set(seasonId, settled);
    return next;
  }

  /**
   * Resolves to the durable true/false of the most recently dispatched write
   * for this season, from any path (persist, saveNow, snapshot, bindDisk, the
   * disk timer); never rejects. Null when nothing was ever dispatched. Lets a
   * shutdown flush await a write that is already running.
   */
  pendingWrite(seasonId = this.currentSeasonId) {
    return this._lastWrite.get(seasonId) || null;
  }

  /**
   * Await this season's write chain until it is stable: after each await,
   * if a newer write was dispatched meanwhile, await that one too. Resolves the
   * last observed write's durable true/false (never rejects); null when nothing
   * was ever dispatched.
   */
  async drainWrites(seasonId = this.currentSeasonId) {
    let last = this._lastWrite.get(seasonId) || null;
    if (!last) return null;
    let ok = true;
    for (;;) {
      try { ok = await last; } catch (e) { ok = false; }
      const current = this._lastWrite.get(seasonId) || null;
      if (current === last) return ok;   // stable: nothing new arrived while waiting
      last = current;                    // a newer write landed mid-drain; keep going
    }
  }

  /** Stamp a revision at dispatch time, then run the write in order. */
  _dispatchWrite(seasonId, data, write) {
    const revision = this._nextRevision(seasonId, data);
    return this._enqueueWrite(seasonId, () => write(revision));
  }

  persist(seasonId = this.currentSeasonId, data = this.data) {
    this._stripStAlignmentBeforeSave(data);
    // Return the durable result while preserving fire-and-forget callers.
    // Storage transactions must not announce success until the canonical
    // season bytes are actually accepted.
    return this._dispatchWrite(seasonId, data, revision => this._persistNow(seasonId, data, revision));
  }

  _persistNow(seasonId, data, revision) {
    return Promise.resolve(this.backend.saveSeason(seasonId, data))
      .then(ok => {
        if (ok === false) { this._persistFailed(); return false; }
        this._persistWarned = false;
        // Arm the disk/mirror sync only after the canonical save is durable,
        // so a rejected payload never reaches the mirror.
        this._scheduleDiskWrite(seasonId, data, revision);
        return true;
      })
      .catch(() => { this._persistFailed(); return false; });
  }

  _persistFailed() {
    if (this._persistWarned) return;            // warn once until the next success
    this._persistWarned = true;
    if (typeof this.onPersistError === 'function') { try { this.onPersistError(); } catch (e) {} }
  }

  _scheduleDiskWrite(seasonId = this.currentSeasonId, data = this.data, revision = this._revision.get(seasonId)) {
    if (!this.backend.diskStatus().bound) return;
    // The desktop canonical save already wrote the Documents mirror; a deferred
    // writeDisk() would save the whole season (SQL rows + db export) again.
    if (this.backend.mirrorsOnCanonicalSave?.()) return;
    clearTimeout(this._diskTimer);
    const snap = JSON.parse(JSON.stringify(data));   // freeze the payload
    // Pin the owning season: writeDisk resolves the TARGET at fire time (via
    // the explicit id captured here, not backend.currentId), so a debounce
    // surviving a season switch would write this frozen payload into the
    // NEXT season's file. Transitions also cancel the timer
    // (cancelPendingDiskWrite); the pin covers any path that forgets.
    const sid = seasonId;
    const rev = revision;
    this._diskTimer = setTimeout(() => {
      if (this.currentSeasonId !== sid) return;
      // The payload was frozen at schedule time. If a newer commit exists,
      // writing it would move the recovery mirror backward, so skip.
      const newest = this._revision.get(sid);
      if (Number.isInteger(rev) && Number.isInteger(newest) && rev < newest) return;
      // Queued with the season's other writes; it rewrites the frozen payload
      // and is not a new commit.
      this._enqueueWrite(sid, () => this.backend.writeDisk(sid, snap, { snapshot: false })).catch(() => {});
    }, 2500);
  }

  /** Cancel the debounced disk write (must be called before leaving a season). */
  cancelPendingDiskWrite() {
    clearTimeout(this._diskTimer);
    this._diskTimer = null;
  }

  // ---- backups / restore ---------------------------------------------------

  /** Take a restore point: a disk snapshot (if bound) + an in-app ring entry. */
  async snapshot(label) {
    this._stripStAlignmentBeforeSave();
    const seasonId = this.currentSeasonId;
    const data = JSON.parse(JSON.stringify(this.data));
    if (this.backend.diskStatus().bound) {
      // Queued, not dispatched: writeDisk() saves the season canonically again
      // on desktop, so outside the queue an older snapshot could revert a newer
      // save; a snapshot rewrites committed state and does not bump revision.
      // When writeDisk() owns backup creation it reports the result in
      // `writeOpts.createdBackup` (a meta object, or null on failure) and no
      // second backup is attempted. `undefined` means it never ran (a backend
      // without that out-parameter, or the canonical save failed first), so
      // the direct createBackup() below runs.
      const writeOpts = { snapshot: true, label };
      await this._enqueueWrite(seasonId, () => this.backend.writeDisk(seasonId, data, writeOpts));
      if (writeOpts.createdBackup !== undefined) return writeOpts.createdBackup;
    }
    return this.backend.createBackup(seasonId, data, label);
  }

  /**
   * The canonical write for a scout's parent program season. It goes through
   * the per-season queue and revision fence like every season write, so an
   * in-flight ordinary save cannot write the old parent back. When the scout
   * is the open season the live `data` changes in the same step. Every other
   * field is preserved.
   *
   * Returns `{ ok, reason }`. A refused or failed write changes nothing, and
   * success is claimed only after the stored body is read back.
   */
  async assignScoutParent(scoutId, programSeasonId) {
    const scout = String(scoutId || ''), parent = String(programSeasonId || '');
    if (!scout || !parent) return { ok: false, reason: 'invalid-input' };
    const isOpen = String(this.currentSeasonId || '') === scout;
    const body = isOpen ? this.data : await this.peekSeason(scout);
    if (!body || body.kind !== 'scout') return { ok: false, reason: 'not-a-scout' };
    const previous = String(body.programSeasonId || '');
    // ALWAYS a copy, never the live object. Sharing the reference made the live
    // update a side effect of building the payload, so the explicit assignment
    // below could be deleted with no visible consequence -- a guard that cannot
    // fail is not a guard. The two updates are now independent and each is
    // separately provable.
    const payload = JSON.parse(JSON.stringify(body));
    payload.programSeasonId = parent;
    if (isOpen) this.data.programSeasonId = parent;
    const ok = await this._dispatchWrite(scout, payload, revision => {
      payload.revision = revision;
      return Promise.resolve(this.backend.saveSeason(scout, payload)).then(saved => saved !== false);
    });
    const readBack = ok === false ? null : await this.peekSeason(scout);
    if (ok === false || String(readBack?.programSeasonId || '') !== parent) {
      if (isOpen) this.data.programSeasonId = previous;
      return { ok: false, reason: 'write-failed' };
    }
    return { ok: true, previous, programSeasonId: parent };
  }

  listBackups() { return this.backend.listBackups(this.currentSeasonId); }

  /**
   * Restore a previous save. The current state is snapshotted first, so a
   * restore is itself undoable — you can never strand yourself on bad data.
   */
  async restoreBackup(id) {
    // The restore belongs to the season open when it started. A season opened
    // during any wait stops it before anything is written, and a failed save
    // rolls back only that season's own editor.
    const seasonId = this.currentSeasonId, owner = this.data;
    const moved = () => this.currentSeasonId !== seasonId || this.data !== owner;
    const stopped = () => { this.lastRestoreRefusal = 'Another season was opened before the restore finished. Nothing was restored.'; return null; };
    this.lastRestoreRefusal = null;
    const data = await this.backend.getBackup(seasonId, id);
    if (moved()) return stopped();
    if (!data || !Array.isArray(data.games)) return null;
    // A restore point in an old format is refused before the safety snapshot,
    // so nothing is written.
    if (!SeasonFormat.isCurrentSeason(data)) { this.lastRestoreRefusal = SeasonFormat.RESTORE_MESSAGE; return null; }
    const safetyId = await this.snapshot('Before restore');
    if (!safetyId) return null;
    if (moved()) return stopped();
    const restored = this._normalize(data);
    this.data = restored;
    const persisted = await this.persist(seasonId, restored);
    if (persisted === false) {
      if (this.currentSeasonId === seasonId && this.data === restored) this.data = owner;
      return null;
    }
    if (this.currentSeasonId === seasonId && this.data === restored) return restored;
    this.lastRestoreRefusal = 'The restore was saved, but another season was opened before it finished. Reopen that season to see it.';
    return null;
  }

  // ---- durable disk target -------------------------------------------------

  supportsDisk() { return this.backend.supportsDisk(); }
  diskStatus() { return this.backend.diskStatus(); }
  async restoreDiskBinding() { return this.backend.restoreDiskBinding(); }

  /** Desktop only: open (or resolve) the app-data folder where the season is saved. */
  canOpenDataDir() { return typeof this.backend.openDataDir === 'function'; }
  async openDataDir() { return this.backend.openDataDir ? this.backend.openDataDir() : ''; }

  /** Bind a backup folder/target and immediately write the live file + a snapshot. */
  async bindDisk() {
    this._stripStAlignmentBeforeSave();
    const ok = await this.backend.bindDisk();
    if (ok) {
      // Queued with this season's other writes, like snapshot().
      const seasonId = this.currentSeasonId;
      const data = JSON.parse(JSON.stringify(this.data));
      await this._enqueueWrite(seasonId, () => this.backend.writeDisk(seasonId, data, { snapshot: true, label: 'Backup folder linked', prompt: true }));
    }
    return ok;
  }
  async forgetDisk() { return this.backend.forgetDisk(); }

  /** Explicit "Save Season": canonical + live disk write + a labelled snapshot. */
  async saveNow(label) {
    this._stripStAlignmentBeforeSave();
    const seasonId = this.currentSeasonId;
    // Routed through the per-season queue so an explicit Save Season and an
    // in-flight autosave cannot revert each other. The payload is captured at
    // dispatch time: reading this.data inside the queued callback would let a
    // season switch write the new season's data into the old season's slot.
    const payload = this.data;
    // A rejected canonical save stops here, before any disk or backup side
    // effect.
    let ok;
    try { ok = await this._dispatchWrite(seasonId, payload, () => this.backend.saveSeason(seasonId, payload)); }
    catch (e) { ok = false; }
    if (ok === false) return false;
    // Snapshot the payload the canonical write just committed, not whatever
    // this.data holds after the await.
    const data = JSON.parse(JSON.stringify(payload));
    let wroteDisk = false;
    // Use writeDisk()'s own backup result when it ran (see snapshot()); the
    // direct call below covers a backend that does not own backups or a
    // canonical save that failed first.
    const writeOpts = { snapshot: true, label: label || 'Manual save', prompt: true };
    if (this.diskStatus().bound) {
      // Queued, not direct: see the identical writeDisk fix on snapshot()/
      // bindDisk() above -- keeps this write ordered against a concurrent
      // debounced disk-mirror or restore-point write for the same season.
      wroteDisk = await this._enqueueWrite(seasonId, () => this.backend.writeDisk(seasonId, data, writeOpts));
    }
    if (writeOpts.createdBackup === undefined) {
      await this._enqueueWrite(seasonId, () => this.backend.createBackup(seasonId, data, label || 'Manual save'));
    }
    return wroteDisk;
  }

  /** Download a one-off season file (portability / browsers without disk binding). */
  downloadFile() {
    const blob = new Blob([this.json()], { type: 'application/json' });
    const name = this.fileBase() + '_season.json';
    window.ffaSaveBlob(blob, name);
  }

  /**
   * Adopt a parsed season as the current season's content.
   *   1. The payload's own `id` is replaced by `destSeasonId`, the destination
   *      slot captured once up front, so the save's destination/payload guard
   *      accepts it.
   *   2. Returns `{ ok, data }`, the durable result.
   *   3. Atomic: the prior live data is restored if the save is rejected.
   *   4. Season-switch safe: live `this.data` is touched (stage, rollback or
   *      read-back) only while `destSeasonId` is still the open season; the
   *      durable write itself always targets `destSeasonId`.
   *
   * An old-format payload returns `{ ok: false, data: null, oldFormat: true }`;
   * one without games returns `{ ok: false, data: null }`. Neither touches
   * `this.data`.
   */
  async adopt(parsed) {
    // Old-format payloads are refused before anything is staged (step 6).
    if (parsed && !SeasonFormat.isCurrentSeason(parsed)) return { ok: false, data: null, oldFormat: true };
    const destSeasonId = this.currentSeasonId;
    const prior = this.data;
    if (!parsed || !Array.isArray(parsed.games)) return { ok: false, data: null };
    const next = this._normalize({ ...parsed, id: destSeasonId });
    const stillOwns = () => this.currentSeasonId === destSeasonId;
    if (stillOwns()) this.data = next;
    const ok = await this.persist(destSeasonId, next);
    if (ok === false) {
      // Roll back the live in-memory mutation ONLY if this call still owns
      // the current season -- otherwise the coach has already navigated
      // elsewhere, and restoring `prior` here would silently replace THEIR
      // season's live data with this call's stale pre-import snapshot.
      if (stillOwns()) this.data = prior;
      return { ok: false, data: prior };
    }
    return { ok: true, data: stillOwns() ? this.data : next };
  }
}
