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

export class SeasonStore {
  /** PC-4: ceiling for the monotonic commit counter. Far beyond any real
   *  season's lifetime of saves, and low enough that `revision + 1` always
   *  genuinely increments (unlike Number.MAX_SAFE_INTEGER, where it does not). */
  static MAX_REVISION = Number.MAX_SAFE_INTEGER - 1024;

  constructor(backend) {
    this.SCHEMA = 5;
    this.data = null;
    this.currentSeasonId = null;
    this.backend = backend || detectBackend();
    this._diskTimer = null;
    // PC-4 revision fencing (Convergence Plan Invariant #7, Inventory Sec 3.2).
    // `_writeChain` serializes durable body writes PER SEASON so two overlapping
    // saves to the SAME season can never complete out of order; `_revision`
    // tracks the newest revision dispatched for each season, which is what a
    // delayed frozen-payload write compares itself against to know it is stale.
    // Both are in-memory only and deliberately so: they order writes within a
    // session, while `data.revision` is the durable marker that survives a
    // reload and seeds the next session's sequence.
    this._writeChain = new Map();   // seasonId -> tail promise (FIFO ordering)
    this._revision = new Map();     // seasonId -> newest dispatched revision
    // PC-4 repair (Codex 50e2e50, finding 1): a season currently being
    // deleted. Ordering a write BEHIND an in-flight delete (the prior
    // repair) is not enough -- a write that lands in the queue AFTER delete
    // starts still eventually EXECUTES and resurrects the season the moment
    // it reaches the front. This is the fence that stops it from ever being
    // ACCEPTED in the first place. See deleteSeason()/_enqueueWrite().
    this._deletingSeasons = new Set();
    this._lastWrite = new Map();    // seasonId -> most recent dispatched write's durable true/false (see pendingWrite())
  }

  // ---- lifecycle -----------------------------------------------------------

  /** Reload the current season's data from storage (after one is selected). */
  async load() {
    if (!this.currentSeasonId) return null;
    let parsed = null;
    try { parsed = await this.backend.loadSeason(this.currentSeasonId); } catch (e) {}
    this.data = (parsed && Array.isArray(parsed.games)) ? this._normalize(parsed) : this._empty();
    this._seedRevision(this.currentSeasonId, this.data);   // PC-4: continue the persisted sequence
    return this.data;
  }

  _empty() {
    const g = this.blankGame();
    return {
      version: this.SCHEMA, type: 'season',
      id: '', seasonName: '', team: '', year: '', level: '',
      teamProfile: {}, roster: [], playbook: { version: 1, calls: [] },
      games: [g], activeGameId: g.id,
      plans: [],
      // PC-4: monotonic commit counter. Additive and backward-compatible -- a
      // season saved before this checkpoint simply has no `revision` key and
      // `_normalize` defaults it to 0, so the very first save in the new world
      // stamps 1 and the sequence proceeds from there.
      revision: 0,
    };
  }

  /**
   * Phase 3 Plan foundation — a season-level game-plan workspace.
   *
   * `data.plans` is a season-scoped array (NOT per-game): a plan collects Study
   * findings + composite `gameId::playId` film references that legitimately span
   * games, so it belongs above the game node. Additive + backward-compatible: a
   * season saved before this contract simply has no `plans` key; `_normalize`
   * defaults it to `[]` and never touches existing data. Persistence needs no
   * change — `plans` rides in the season object through saveSeason / the SqlCatalog
   * body_json / the JSON mirror like any other top-level key.
   *
   * Shape (documented here so the Plan UI builds against a stable contract; the
   * normalizer PRESERVES unknown keys so the shape can grow without a migration):
   *   plan = { id, name, audience, createdAt, updatedAt, notes, items: [planItem] }
   *   planItem = { id, kind, label, refs: ['gameId::playId'], query, note, createdAt }
   *     kind: 'finding' (a saved Study result) | 'film' (bare film refs) | 'note'
   *     refs: composite film references — the SAME `gameId::playId` identity Study
   *           + CrossGameCutup already use, so a plan item plays through the proven
   *           cross-game path with no new resolver.
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
  /** Append a Study finding / film reference to a plan. `item` follows planItem. */
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

  // Hudl-model migration (v1.9.15): backfield alignment used to be mixed into the
  // multi-select Formation field. Split it into the new single `backfield` tag so
  // Formation holds STRUCTURE only. Idempotent (after the move there's no backfield
  // type left in formation) and non-destructive (formation + backfield reconstruct
  // the original); never clobbers a backfield the coach set deliberately.
  static BACKFIELD_FROM_FORMATION = { 'I-Form': 'I', 'Singleback': 'Single', 'Split Back': 'Split', 'Power-I': 'Power' };
  static migratePlayFormation(p) {
    if (!p || !p.tags) return;
    const t = p.tags;
    const legacy = !Object.prototype.hasOwnProperty.call(t, 'backfield');
    if (typeof t.backfield !== 'string') t.backfield = '';
    if (typeof t.strength !== 'string') t.strength = '';
    if (!legacy) return;
    if (!t.formation || typeof t.formation !== 'string') return;
    const map = SeasonStore.BACKFIELD_FROM_FORMATION;
    const parts = t.formation.split(' + ').map(s => s.trim()).filter(Boolean);
    let bf = '';
    const kept = parts.filter(part => { if (map[part]) { bf = map[part]; return false; } return true; });
    if (bf) {
      if (!t.backfield) t.backfield = bf;   // don't overwrite a deliberate pick
      t.formation = kept.join(' + ');
    }
  }

  // Special-teams plays can't carry offensive/defensive alignment — the ST tag
  // form hides the Formation/Personnel and Front/Coverage/Blitz groups entirely,
  // so there is no way to set them on an ST snap. Any such value on a
  // unit:'special' play is therefore a leak (classically: an offensive formation
  // that propagated play-to-play through the Save-&-Next carry, coding every ST
  // play as "Under Center"). Strip it. Idempotent and safe — nothing intentional
  // can ever live in these fields on an ST play.
  //
  // This is the SINGLE SOURCE OF TRUTH for the strip list — play-tagger consumes
  // it rather than keeping its own copy (GRIDIRON-IQ-TAG-MODEL.md §7). The E1
  // model split adds four keys: `qbAlignment`/`coverageFamily` (new dimensions)
  // and `backfield`/`strength`, which E1-R6 also carries forward and therefore
  // must also be strippable here. The `backfield`/`strength` clear is a
  // coach-approved, bounded cleanup: on the real six-game season it clears
  // exactly 12 backfield values (1 of which also has strength) — leaked pre-snap
  // looks the ST form could never legitimately set (§7b).
  static ST_ALIGNMENT_KEYS = ['qbAlignment', 'formation', 'backfield', 'strength',
    'personnel', 'defFront', 'coverage', 'coverageFamily', 'blitz'];
  static stripStAlignment(p) {
    if (!p || !p.tags || (p.tags.unit || 'offense') !== 'special') return;
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
    if (!p || !p.tags || (p.tags.unit || 'offense') === 'defense') return;
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
        // Every in-app creation site sets `custom: []`, but an imported or
        // pre-field season file has no such key — and the tag form both READS
        // it (_renderCustomTags) and WRITES it (`custom.includes(tag)` on the
        // custom-tag input). Backfilling here fixes the class at the data
        // boundary instead of patching each sink; the sinks keep their own
        // guards because a render guard alone already proved insufficient.
        if (p?.tags && !Array.isArray(p.tags.custom)) {
          const legacy = p.tags.custom;
          if (legacy == null) {
            p.tags.custom = [];
          } else {
            // Preserve recoverable imported data while restoring the string[]
            // model. Silent deletion requires coach approval and is forbidden.
            let value;
            try { value = typeof legacy === 'string' ? legacy : JSON.stringify(legacy); }
            catch { value = String(legacy); }
            p.tags.custom = value == null ? [] : [value];
          }
        }
        SeasonStore.migratePlayFormation(p);
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
    d.roster = Array.isArray(d.roster) ? d.roster : [];
    d.playbook = d.playbook && Array.isArray(d.playbook.calls)
      ? { version: Number(d.playbook.version) || 1, calls: d.playbook.calls }
      : { version: 1, calls: [] };
    d.seasonName = d.seasonName || '';
    d.team = d.team || (d.teamProfile && d.teamProfile.teamName) || '';
    d.year = d.year || '';
    d.level = d.level || '';
    d.plans = this._normalizePlans(d.plans);   // Phase 3: season-level game-plan workspace (backward-compat default [])
    // PC-4: a legacy season (or a hand-edited/corrupted/imported one) normalizes
    // to 0 rather than being trusted, so a garbage value can never mint a
    // revision so high that every subsequent legitimate save looks stale against
    // it. The upper bound matters as much as the lower one: at
    // Number.MAX_SAFE_INTEGER, `revision + 1` stops actually incrementing, so
    // every later comparison comes out equal and the fence goes silently inert
    // -- a failure indistinguishable from working code. Reachable only via a
    // hand-crafted import, but the whole point of a fence is that it cannot be
    // switched off by data.
    d.revision = (Number.isInteger(d.revision) && d.revision >= 0 && d.revision < SeasonStore.MAX_REVISION)
      ? d.revision : 0;
    return d;
  }

  // ---- season library (multi-season front door) ----------------------------

  /** True once a season is open and its data is loaded. */
  hasCurrent() { return !!this.currentSeasonId && !!this.data; }

  /** List all seasons in the library (metas only — does not load any). */
  async listSeasons() { return this.backend.listSeasons(); }

  /** Whether this backend supports the PC-3 recovery flow at all (desktop
   *  only — BrowserBackend has no Documents-mirror concept). Mirrors the
   *  existing canOpenDataDir() capability-check pattern. */
  canRecoverSeasons() { return typeof this.backend.scanRecoverableSeasons === 'function'; }

  /** PC-3 explicit recovery, step 1 (Invariant #6): preview candidates from
   *  the Documents-mirror recovery snapshots. WRITES NOTHING. Not every
   *  backend implements this (BrowserBackend has no Documents mirror
   *  concept), so this feature-detects and returns [] rather than throwing
   *  on a backend that simply doesn't support recovery scanning. */
  async scanRecoverableSeasons() {
    try { return (await this.backend.scanRecoverableSeasons?.()) || []; }
    catch (e) { return []; }
  }

  /** PC-3 explicit recovery, step 2: the confirmed one-way import of ONE
   *  candidate into the canonical SQLite catalog. `confirmOverwrite` must
   *  only ever be true after the coach has explicitly agreed, having seen
   *  scanRecoverableSeasons()'s own preview of the conflict — this method
   *  performs no confirmation UI of its own. */
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
   * PC-1 repair (Codex review of 4445db4/4d75bca, the remaining P0): durably
   * create a scaffold season and claim it as current ONLY IF nothing else has
   * opened or created a season in the meantime -- i.e. hasCurrent() is STILL
   * false when the durable backend create resolves.
   *
   * Used exclusively by StorageManager.loadProject()'s first-run import
   * bootstrap, which needs a real library id to write an import INTO but must
   * never silently steal the live editor from a season the coach opened WHILE
   * the scaffold's own durable creation was in flight. createSeason()'s
   * unconditional switch (above) cannot protect against this and does not
   * need to for its normal callers, where switching unconditionally on a
   * deliberate coach action is the entire point -- this is a SEPARATE method
   * rather than a flag on createSeason() so that contract distinction stays
   * explicit at every call site, matching the explicit-identity discipline
   * this whole PC-1 checkpoint is built on.
   *
   * Returns `{ rec, claimed }`. `rec` is the durably-created record whenever
   * the backend write itself succeeds, REGARDLESS of `claimed` -- the caller
   * owns cleaning it up (via deleteSeason(rec.id), which is itself safely
   * scoped to that id) when `claimed` is false. `claimed` is true only when
   * live state now genuinely points at it.
   *
   * PC-1 repair (Codex review of 697dea8, the final remaining P0):
   * deliberately does NOT persist the blank claimed record. createSeason()
   * (above) persists its blank state because that IS the season a coach
   * using the deliberate "New Season" action may genuinely leave untagged --
   * without it, the only durable trace would be the library meta `rec`, with
   * no season.json/db body to reopen. This method's sole caller
   * (StorageManager.loadProject()'s first-run import bootstrap) ALWAYS calls
   * adopt() immediately afterward, which durably persists the REAL imported
   * payload to this exact id moments later -- an UPSERT that creates the
   * body row itself, with no dependency on a pre-existing one. Persisting
   * the blank body here first bought nothing for this caller and cost a
   * genuine correctness hazard without revision fencing (PC-4, not yet
   * built): a fire-and-forget save of blank data and adopt()'s later
   * AWAITED save of the real data both target the SAME id with nothing
   * ordering them against each other, so the blank write could complete
   * AFTER the real one and silently overwrite the successfully imported
   * season. Reproduced directly before this fix by holding both saveSeason
   * calls on independently controllable pending Promises and resolving the
   * scaffold's LAST: the final canonical body held the blank scaffold's
   * shape, not the imported one. Removing this call closes the class
   * entirely for this path rather than requiring the two writes to somehow
   * race correctly.
   */
  async createUnclaimedSeasonIfEmpty(meta) {
    this.cancelPendingDiskWrite();
    const rec = await this._createSeasonRecordOnly(meta);
    if (!rec) return { rec: null, claimed: false };
    if (this.hasCurrent()) return { rec, claimed: false };   // someone else opened/created a season meanwhile
    this._adoptSeasonRecord(rec, meta);
    return { rec, claimed: true };
  }

  /** Open an existing season by id and load its data as the current season. */
  async openSeason(id) {
    this.cancelPendingDiskWrite();   // a stale debounce must not target the new season
    this.backend.setCurrentSeason(id);
    this.currentSeasonId = id;
    let parsed = null;
    try { parsed = await this.backend.loadSeason(id); } catch (e) {}
    this.data = (parsed && Array.isArray(parsed.games)) ? this._normalize(parsed) : this._empty();
    this.data.id = id;
    this._seedRevision(id, this.data);   // PC-4: continue the persisted sequence
    try { await this.backend.touchOpened(id); } catch (e) {}
    return this.data;
  }

  /** Delete a season from the library (and clear it if it was current). */
  async deleteSeason(id) {
    if (this.currentSeasonId === id) this.cancelPendingDiskWrite();
    // PC-4 repair (Codex 50e2e50, finding 1): ordering the delete behind any
    // write already dispatched for `id` (below) is not enough on its own -- a
    // write dispatched WHILE the delete is still in flight (the season
    // remains "current" until this await resolves) would queue BEHIND the
    // delete via the normal FIFO and still eventually EXECUTE, resurrecting
    // the season the instant it reaches the front. Reproduced directly:
    // delete durably completing, then a persist() dispatched during its own
    // await landing afterward and recreating the season. The fence is set
    // SYNCHRONOUSLY here, before the delete's own write is even dispatched --
    // nothing else can run between this line and the next in JS -- so no
    // later dispatch can ever slip in ahead of it. _rawEnqueue() (not the
    // gated _enqueueWrite()) is used for the delete's own write so it does
    // not refuse itself.
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
    // PC-4: a durably-deleted season's write queue and revision sequence are
    // dropped with it. If that id is ever recreated it starts a fresh sequence
    // from its own (absent) stored revision, rather than inheriting a ghost
    // high-water mark from the season that used to hold the id.
    if (ok !== false) { this._writeChain.delete(id); this._revision.delete(id); this._lastWrite.delete(id); }
    return ok !== false;
  }

  /** Close the current season (back to the library, nothing loaded). */
  closeSeason() { this.cancelPendingDiskWrite(); this.currentSeasonId = null; this.data = null; }

  /** Wrap a legacy single-game project object as a season game node. */
  gameFromLegacy(obj) {
    const g = this.blankGame();
    const node = {
      ...g,
      gameInfo: obj.gameInfo || {},
      plays: obj.plays || [],
      annotations: obj.annotations || [],
      nextId: obj.nextId || ((obj.plays || []).length + 1),
      currentPlayId: obj.currentPlayId || null,
      videoFileName: obj.videoFileName || null,
      clipNames: obj.clipNames || [],
      isMultiClip: !!obj.isMultiClip,
      name: this.gameName({ gameInfo: obj.gameInfo || {}, videoFileName: obj.videoFileName }),
    };
    // Carry the MODERN durable film identity when the source has it. This wrapper
    // is used both for legacy single-game imports (which lack these) AND to merge
    // modern game objects (season-manager) — dropping clipPaths/clipRefs there
    // would regress a game to weak basename-only identity, and dropping
    // filmMode/filmDir would break linked-film auto-load on reopen.
    if (obj.clipPaths) node.clipPaths = obj.clipPaths;
    if (obj.clipRefs) node.clipRefs = obj.clipRefs;
    if (obj.filmMode) { node.filmMode = obj.filmMode; node.filmDir = obj.filmDir; }
    return node;
  }

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
  // DATA-AT-REST barrier for the ST-alignment invariant (GRIDIRON-IQ-TAG-MODEL.md
  // §7a / E1-R9). _normalize strips on deserialize; the LIVE object is kept clean at
  // the PlayTagger._emit seam. This is the second barrier: EVERY durable-write path
  // — persist() (canonical), snapshot()/saveNow() (backups), bindDisk() (disk bind),
  // and json() (the Save Season download) — calls this first, so a forbidden value
  // can never reach a saved file, a restore point, or an export, regardless of which
  // writer produced it. (persist() alone was NOT sufficient — the other paths
  // serialize this.data independently.) Idempotent; only touches unit:'special'.
  // `data` defaults to the ambient current season for every ordinary caller
  // (autosave, explicit field edits, json()/saveNow()/bindDisk()). adopt()
  // passes an EXPLICIT season object it captured before any await, so its
  // own strip/save/debounce never reads whatever season happens to be
  // ambiently current by the time this runs (PC-1 repair, finding 1).
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
   * PC-4 (Invariant #7, Inventory Sec 3.2): stamp the next monotonic revision
   * for `seasonId` onto `data` and record it as the newest DISPATCHED revision.
   *
   * The next revision is based on the HIGHER of the payload's own stored
   * revision and the newest revision this session has already dispatched for
   * that season -- never on the payload alone. That distinction is what keeps
   * a restore safe: a restored backup carries its ORIGINAL (old) revision, so
   * basing off the payload would mint a revision below the live season's and
   * make the restore itself look stale to every later fence. Taking the max
   * means a restore is correctly a NEW, newer commit of older content.
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
   * PC-4: seed the in-memory revision sequence from a season's durable state.
   * Called by every path that loads a season's stored body, so the first write
   * of a session continues the persisted sequence instead of restarting at 1
   * (which would make a legitimate save indistinguishable from a stale one).
   */
  _seedRevision(seasonId, data) {
    if (!seasonId) return;
    const stored = (data && Number.isInteger(data.revision) && data.revision >= 0) ? data.revision : 0;
    const known = this._revision.get(seasonId);
    this._revision.set(seasonId, Math.max(stored, Number.isInteger(known) ? known : 0));
  }

  /**
   * PC-4: run durable body writes for one season STRICTLY IN DISPATCH ORDER.
   *
   * Reproduced before this fix (Inventory Sec 3.2, both cases): two overlapping
   * `saveSeason` calls for the SAME season completed out of order, so the
   * chronologically-earlier payload landed last and silently reverted the newer
   * one -- and a save dispatched before a restore landed after it, durably
   * undoing the restore while memory showed it had worked. Cross-season fencing
   * (PC-1) could not catch either: the season never changed.
   *
   * Chaining is per season id, so an unrelated season is never blocked, and the
   * next write runs whether the previous one resolved or rejected -- a failed
   * save must not strand the queue.
   *
   * PC-4 repair (Codex 50e2e50, finding 1): this is now the GATED public
   * entry -- it refuses to even queue a write for a season whose deletion has
   * already started (see deleteSeason()). Queuing a write BEHIND an in-flight
   * delete only orders it; the write still eventually EXECUTES once it
   * reaches the front, resurrecting the season. deleteSeason() itself bypasses
   * this gate via _rawEnqueue(), since a delete must never refuse itself.
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
    // PC-4 repair (Codex 50e2e50, finding 2): track this write's own durable
    // result separately from the drain-wrapped `settled` chain below, so
    // pendingWrite() can expose a caller-awaitable true/false -- not merely
    // "has it settled", which `settled` alone cannot answer (drain() itself
    // resolves to undefined). Never rejects: a rejected write reports false,
    // matching every other false/null-on-failure method in this codebase.
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
   * PC-4 repair (Codex 50e2e50, finding 2): the promise a caller can await to
   * know the MOST RECENTLY DISPATCHED write for this season -- whether from
   * persist(), saveNow(), snapshot(), bindDisk(), or the debounced disk-mirror
   * timer -- has settled, resolving to its durable true/false result (never
   * rejects). Returns null when nothing has ever been dispatched for this
   * season, so a caller can distinguish "nothing to wait for" from "the last
   * dispatched write already settled". This is what lets a shutdown flush
   * genuinely await a write that started earlier -- from the debounce timer
   * firing naturally, or from an EARLIER flush call, since the browser
   * `beforeunload` listener and the desktop close-requested hook can both
   * fire for one real close -- instead of seeing no ARMED timer and wrongly
   * reporting nothing to flush while that write is still running.
   */
  pendingWrite(seasonId = this.currentSeasonId) {
    return this._lastWrite.get(seasonId) || null;
  }

  /**
   * PC-4 repair round 3 (Codex c962437): a STABLE drain for one season's
   * write chain, not a snapshot of whichever write happened to be most
   * recent when called. `pendingWrite()` alone only ever returns the promise
   * that was current the instant it was read -- if a NEWER write (write B)
   * is dispatched for this season while a caller is still awaiting an OLDER
   * one (write A), the caller's already-captured reference resolves the
   * moment A settles, oblivious to B. Reproduced directly before this fix:
   * a caller awaiting `pendingWrite()`'s snapshot of A resolved the instant A
   * settled, while B (dispatched during that await) was still pending.
   *
   * This rechecks `_lastWrite` after every await: if the entry has moved on
   * to a different promise since the one just awaited, a newer write landed
   * while waiting, and THAT one is awaited too -- looping until the observed
   * tail is genuinely unchanged across an await. Resolves the durable
   * true/false of the LAST write actually observed to settle (never
   * rejects, mirroring `_lastWrite`'s own entries). Returns null when
   * nothing has ever been dispatched for this season.
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

  /** PC-4: stamp a revision at DISPATCH time, then run the write in order. */
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
        // PC-1: only arm the debounced disk/mirror sync AFTER the canonical
        // save is confirmed durable. Scheduling it unconditionally (as this
        // used to) meant a REJECTED canonical save still armed a timer that
        // wrote the rejected payload to the Documents mirror 2.5s later,
        // independent of the canonical result -- reproduced directly before
        // this fix (GRIDIRON-IQ-PERSISTENCE-INVENTORY.md Sec 3.1).
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
      // PC-4 (Invariant #7, "...or a newer commit"): the payload above was
      // FROZEN at schedule time. A newer commit for this same season means the
      // frozen copy is a superseded state, and writing it would move the
      // Documents recovery snapshot BACKWARD -- the one sidecar PC-3 relies on
      // to be no older than the canonical row. Unlike an autosave (which
      // re-reads live state at fire time and is therefore never stale in
      // content), this work carries its payload with it, so it is exactly the
      // "delayed save" the invariant names. Fails closed: skip, never write.
      const newest = this._revision.get(sid);
      if (Number.isInteger(rev) && Number.isInteger(newest) && rev < newest) return;
      // PC-4 repair: this deferred write reached the backend directly, outside
      // the per-season write queue -- see the identical fix note on
      // snapshot(). Queued, not dispatched: it re-writes the already-frozen
      // payload above, never a new commit.
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
      // PC-4 repair: writeDisk performs a SECOND, unfenced canonical
      // saveSeason call on desktop (TauriBackend.writeDisk -> this.
      // saveSeason(...) before the mirror/backup work), so it was reachable
      // entirely outside the per-season write queue -- an older snapshot's
      // write could land after a newer persist()'s canonical save and revert
      // it. Reproduced directly before this fix. Routed through
      // _enqueueWrite, not _dispatchWrite: a snapshot re-writes already-
      // committed state, it is not itself a new commit, so it must not bump
      // revision.
      await this._enqueueWrite(seasonId, () => this.backend.writeDisk(seasonId, data, { snapshot: true, label }));
    }
    return this.backend.createBackup(seasonId, data, label);
  }

  listBackups() { return this.backend.listBackups(this.currentSeasonId); }

  /**
   * Restore a previous save. The current state is snapshotted first, so a
   * restore is itself undoable — you can never strand yourself on bad data.
   */
  async restoreBackup(id) {
    const data = await this.backend.getBackup(this.currentSeasonId, id);
    if (!data || !Array.isArray(data.games)) return null;
    const safetyId = await this.snapshot('Before restore');
    if (!safetyId) return null;
    const current = this.data;
    this.data = this._normalize(data);
    const persisted = await this.persist();
    if (persisted === false) {
      this.data = current;
      return null;
    }
    return this.data;
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
      // PC-4 repair: same unfenced-writeDisk class as snapshot() above --
      // queued against this season's other writes rather than reaching the
      // backend directly.
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
    // PC-4: an explicit "Save Season" used to call backend.saveSeason directly,
    // bypassing persist() and therefore any ordering with an in-flight debounced
    // autosave for the same season -- the FIRST scenario Inventory Sec 3.2 names
    // ("a debounced autosave firing at the same moment as an explicit Save
    // Season click"). Routing it through the same per-season queue makes the two
    // strictly ordered by dispatch, so neither can revert the other.
    // Capture the payload reference at DISPATCH time, exactly as persist()'s
    // default parameter does. Reading `this.data` inside the queued callback
    // instead would let a season switch landing between dispatch and run write
    // the NEW season's data into the OLD season's slot -- the cross-season
    // class PC-1 closed, which a naive queue would have quietly reopened.
    const payload = this.data;
    // PC-4 repair: the canonical write's result was discarded, so disk/backup
    // side effects proceeded even after the canonical save was REJECTED --
    // reproduced directly before this fix. Bail closed before any side effect
    // on a genuine failure, exactly as persist()'s own callers already rely
    // on a false/rejected result to mean "nothing durable happened."
    let ok;
    try { ok = await this._dispatchWrite(seasonId, payload, () => this.backend.saveSeason(seasonId, payload)); }
    catch (e) { ok = false; }
    if (ok === false) return false;
    // Snapshot the SAME payload the canonical write just committed, not
    // whatever this.data holds now -- re-reading this.data here would let a
    // season switch landing during the earlier await write the NEW season's
    // data into the OLD season's slot, reopening the cross-season class PC-1
    // closed.
    const data = JSON.parse(JSON.stringify(payload));
    let wroteDisk = false;
    if (this.diskStatus().bound) {
      // Queued, not direct: see the identical writeDisk fix on snapshot()/
      // bindDisk() above -- keeps this write ordered against a concurrent
      // debounced disk-mirror or restore-point write for the same season.
      wroteDisk = await this._enqueueWrite(seasonId, () => this.backend.writeDisk(seasonId, data, { snapshot: true, label: label || 'Manual save', prompt: true }));
    }
    await this._enqueueWrite(seasonId, () => this.backend.createBackup(seasonId, data, label || 'Manual save'));
    return wroteDisk;
  }

  /** Download a one-off season file (portability / browsers without disk binding). */
  downloadFile() {
    const blob = new Blob([this.json()], { type: 'application/json' });
    const name = this.fileBase() + '_season.json';
    window.ffaSaveBlob(blob, name);
  }

  /**
   * Adopt a parsed object (season or legacy single game) as the season.
   *
   * PC-1: four fixes to the identity/durability contract (documented in
   * GRIDIRON-IQ-PERSISTENCE-INVENTORY.md Sec 3.1).
   *   1. The imported payload's own `id` (whatever machine/season it came
   *      from) is reassigned to `destSeasonId` -- the destination library
   *      slot, captured ONCE up front -- BEFORE normalize/persist. Without
   *      this, an imported file whose id differs from the destination is
   *      silently rejected by the very destination/payload guard
   *      `saveSeason()` already enforces (`data.id !== id`), and the import
   *      looked like it worked while nothing was ever durably saved.
   *   2. `adopt()` is now `async` and returns `{ ok, data }` -- awaitable, so
   *      a caller can observe genuine durable success/failure instead of the
   *      previous fire-and-forget `this.persist()` whose result went nowhere.
   *   3. ATOMIC: the prior live `this.data` is preserved and restored on a
   *      rejected persist, mirroring restoreBackup()'s own rollback shape.
   *      Previously `this.data` was overwritten BEFORE persist() was even
   *      awaited, so a rejected import still replaced the live in-memory
   *      season -- reproduced directly before this fix: `ok:false` alongside
   *      the live season name changing to the imported (rejected) value.
   *   4. SEASON-SWITCH SAFE: `destSeasonId` is captured once, synchronously,
   *      before any await, and every subsequent mutation of the LIVE
   *      `this.data` -- both the initial stage AND the rollback/success
   *      read-back -- is gated on `this.currentSeasonId === destSeasonId`
   *      still holding, i.e. this call still owning the season it started
   *      with. The underlying durable write (persist(), called with the
   *      EXPLICIT destSeasonId/next, never the ambient current season) still
   *      completes or fails as scoped either way -- but if the coach has
   *      switched seasons while this save was pending, the live store
   *      showing whatever they opened is never touched by this call's own
   *      stage or rollback. Reproduced directly before this fix: begin an
   *      import into A, open B while the backend save is pending, resolve
   *      the A save false -- the store ended as
   *      { currentSeasonId:'B', data.id:'A', data.seasonName:'Season A' },
   *      i.e. B's live season was silently replaced by A's stale pre-import
   *      snapshot (GRIDIRON-IQ-PERSISTENCE-INVENTORY.md Sec 3.1).
   *
   * Returns `{ ok: false, data: null }` for an unrecognized shape (no season
   * open, or a payload with neither `.games` nor `.plays`) -- `this.data` is
   * never touched in that case either.
   */
  async adopt(parsed) {
    const destSeasonId = this.currentSeasonId;
    const prior = this.data;
    let next;
    if (parsed && Array.isArray(parsed.games)) {
      next = this._normalize({ ...parsed, id: destSeasonId });
    } else if (parsed && Array.isArray(parsed.plays)) {
      next = this._normalize({ id: destSeasonId, games: [this.gameFromLegacy(parsed)] });
    } else {
      return { ok: false, data: null };
    }
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
