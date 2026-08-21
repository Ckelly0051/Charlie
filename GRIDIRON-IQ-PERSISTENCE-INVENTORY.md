# GridIron IQ — Desktop Persistence Inventory (PC-0)

**Status:** PC-0 deliverable — inventory + failing-first contracts only. **No
production behavior was changed to produce this document.** Every finding
below is a read of the source as it exists on `claude/football-film-analyzer-GRiCW`
at commit `bf081fd` (this checkpoint's actual parent — corrected per Codex's
`529d8ae` review; `037b53d` was four commits stale and predates two
persistence-affecting commits, `8408986` and `bf081fd` itself, whose
destination/payload guards and catalog-truth recovery this inventory's own
findings already assume are in place).

**Companion test file:** `tools/pc-adversarial-matrix.mjs` — a standalone Node
harness (NOT part of `tools/e2e-*.mjs`, and therefore not swept into
`tools/run-gate.sh` or CI) that encodes the ten adversarial-matrix scenarios
from `GRIDIRON-IQ-PERSISTENCE-CONVERGENCE-PLAN.md`, plus a coverage table
naming exactly how each of the ten is proven (direct section, an existing
harness, or an explicitly deferred owner/checkpoint). Every assertion is
tagged **LOCK** (already-correct behavior; must stay green — a red lock fails
the process, exit code nonzero) or **TARGET** (an intentional failing-first
contract; expected red until its named checkpoint, and does not affect the
exit code). Run it with `node tools/pc-adversarial-matrix.mjs`; a clean exit
(code 0) means no lock has regressed, not that every scenario is solved —
still read the per-item output to see which targets remain open.

---

## 1. Every mutable "current season" pointer in the codebase

The plan's Invariant #3 ("No mutable global current-season pointer may choose
a write destination") first requires knowing how many such pointers exist.
There are **three mutable pointers, across four ownership layers** — the
fourth layer, `CatalogPersistence`, is correctly explicit (see below) and is
not a pointer at all. They are kept in sync only by calling convention, never
by construction:

| Layer | Pointer? | Lives on | Set by | Read by |
|---|---|---|---|---|
| `SeasonStore` | **mutable pointer** — `currentSeasonId` | `js/season-store.js:32` | `openSeason`/`createSeason`/`deleteSeason`/`closeSeason` | `commitActive`, `_autoSave`, `_maybeSnapshot`, `_flushDeferredSnapshot`, `isDemoSeason`, `undoRemoveGame`, version-manager `_key()` |
| `StorageBackend` (base class field, used by both `BrowserBackend` and `TauriBackend`) | **mutable pointer** — `currentId` | `js/storage-backend.js:35` | `setCurrentSeason(id)` — called once per season transition from `SeasonStore` | every canonical/backup/film method on the backend that doesn't take an explicit id (`loadSeason`, `saveSeason`, `createBackup`, `listBackups`, `getBackup`, `deleteBackup`, `_filmsDir`, `importFilm`, `filmUrl`, `deleteFilm`, `managedGameDir`, `listFilmFiles`) |
| `SqlCatalog` | **mutable pointer** — `currentId` | `js/sql-catalog.js:34` | `setCurrentSeason(id)` — called by `CatalogPersistence` immediately before each backup/version op, and internally as a fallback inside `saveSeason`/`loadSeason` | `createBackup`, `listBackups`, `_pruneBackups`, `deleteSeason` (only to null itself out) |
| `CatalogPersistence` | **not a pointer** — no mutable field of its own | — | — | always threads an explicit `id`/`seasonId` **parameter** into every method call; this is the correct shape, and the model the four other layers should be pulled toward, not a fourth instance of the problem |

Three real pointers, two of them ambient/implicit (`StorageBackend.currentId`,
`SqlCatalog.currentId`) rather than parameters. `SeasonStore.currentSeasonId`
and `StorageBackend.currentId` are today kept in lockstep only because every
season-transition call site remembers to call both — `SeasonStore.openSeason`
sets `this.backend.setCurrentSeason(id); this.currentSeasonId = id;` as two
separate statements, not one atomic operation. Nothing in the type system or
call graph prevents a future caller from mutating one without the other.

`SqlCatalog.currentId` is the most concerning of the three: it is read by
`createBackup`/`listBackups`/`_pruneBackups`, but **`getBackup`, `deleteBackup`,
`getVersion`, and `deleteVersion` do not consult it at all** (§3) — so
`CatalogPersistence`'s discipline of calling `setCurrentSeason(id)` before
every op is silently a no-op protection for exactly the four methods where
identity matters most (read/delete of another season's data).

---

## 2. Path-by-path inventory

Legend: ✅ compliant with the invariants as written · ⚠️ partial/fragile ·
🔴 confirmed violation (reproduced by reading the code, not assumed).

### list

| Path | Identity mechanism | Status |
|---|---|---|
| `TauriBackend.listSeasons()` | No id needed (lists everything); reconciles from `SqlCatalog.listSeasons()` when the catalog opens, throws if the catalog is on disk but unopenable | 🔴 **the throw only covers "the wasm engine failed to load" — a catalog that loads fine but whose on-disk bytes are corrupt does NOT throw here; see §3.0, the most severe finding in this document** |
| `SeasonStore.listSeasons()` | Thin passthrough | ✅ |

### load

| Path | Identity mechanism | Status |
|---|---|---|
| `TauriBackend.loadSeason()` | Implicit — reads `this.currentId`, no parameter | ⚠️ works today only because every caller (`SeasonStore.load`/`openSeason`) calls `setCurrentSeason(id)` immediately beforehand with no `await` in between; there is no parameter-level guarantee |
| `CatalogPersistence.loadSeason(id)` | Explicit `id` parameter throughout | ✅ |
| `SqlCatalog.loadSeason(id)` | Explicit `id`, with a `|| this.currentId` fallback that `CatalogPersistence` never exercises (always passes `id`) | ✅ in practice, the fallback is dead code from the only caller's perspective |

### peek

| Path | Identity mechanism | Status |
|---|---|---|
| `TauriBackend.peekSeason(id)` / `BrowserBackend.peekSeason(id)` | Explicit `id`, documented and verified to never touch `this.currentId` | ✅ |
| `SeasonStore.peekSeason(id)` | Thin passthrough, explicit `id` | ✅ |
| `TeamRegistry.recoverFromWipe()` | Calls `store.peekSeason(id)` exclusively for every season it inspects; comment explicitly states "Recovery is read-only. Never borrow the backend's mutable currentId" | ✅ matches the adversarial matrix item "TeamRegistry peeks do not alter active identity" directly |

### save

| Path | Identity mechanism | Status |
|---|---|---|
| `TauriBackend.saveSeason(data)` | Destination = `this.currentId` (implicit); validates `data.id === this.currentId` before writing anything, rejects otherwise with zero writes | ✅ matches Invariant #2 for the destination/payload pair specifically |
| `CatalogPersistence.saveSeason(id, data)` | Explicit `id` parameter; validates `data.id === id` (or absent) before opening/writing either store | ✅ |
| `SqlCatalog.saveSeason(data)` | `id = data.id || this.currentId` — the payload's own id is preferred, `this.currentId` is only a fallback the current call chain never reaches | ✅ in practice |
| **`SeasonStore.adopt(parsed)` → `persist()` (season-file import)** | `adopt()` replaces `this.data` with `this._normalize(parsed)` and **never reassigns `parsed.id`** to the destination season's id before calling `persist()` | 🔴 **confirmed violation** — see §3.1 |

### autosave

| Path | Identity mechanism | Status |
|---|---|---|
| `StorageManager._autoSave()` | Captures `sid = seasonStore.currentSeasonId` at schedule time; the 1s `setTimeout` callback re-checks `seasonStore.currentSeasonId !== sid` and no-ops if it changed | ✅ matches Invariant #7 for the season-switch case |
| `SeasonStore._scheduleDiskWrite()` | Same pattern: captures `sid = this.currentSeasonId`, the 2.5s debounce callback re-checks before calling `backend.writeDisk` | ✅ |
| `StorageManager._maybeSnapshot()` / `_flushDeferredSnapshot()` | `_deferredSnapshot.seasonId` is stamped at defer time, re-checked before flushing | ✅ |
| **Same-season, out-of-order completion** — two overlapping `saveSeason(data)` calls targeting the *same* season, where the chronologically-earlier one finishes writing *after* the later one | Nothing orders or fences this. `TauriBackend.saveSeason` has no revision/version number to compare against; whichever `fs.writeFile`/db write lands last wins, regardless of which call started first | 🔴 **gap, not yet reproduced as a concrete scenario but structurally real** — see §3.2. This is exactly what Invariant #7's "...or a newer commit" clause anticipates and nothing currently implements |

### backup / restore

| Path | Identity mechanism | Status |
|---|---|---|
| `BrowserBackend.createBackup(data)` | Validates `data.id === this.currentId` before writing; stamps `seasonId: this.currentId` on the record | ✅ |
| `TauriBackend.createBackup(data)` | Same validation, delegates to `CatalogPersistence.createBackup(this.currentId, data, label)` when a catalog exists | ✅ |
| `BrowserBackend.listBackups()` | Filters `r.seasonId === this.currentId` | ✅ |
| **`BrowserBackend.getBackup(id)`** | `os.get(id)` — **no check that the retrieved record's `seasonId` matches `this.currentId`** | 🔴 **confirmed violation** |
| **`BrowserBackend.deleteBackup(id)`** | `os.delete(id)` — same, no ownership check | 🔴 **confirmed violation** (lower severity — deleting the wrong season's restore point loses data quietly rather than restoring the wrong season, but still a real cross-season write with no identity check) |
| `SqlCatalog.listBackups()` | `WHERE season_id = ?` using `this.currentId` | ✅ |
| **`SqlCatalog.getBackup(id)`** | `SELECT body_json FROM backups WHERE id = ?` — **no `season_id` filter at all** | 🔴 **confirmed violation** — see §3.3 |
| **`SqlCatalog.deleteBackup(id)`** | `DELETE FROM backups WHERE id = ?` — same, no `season_id` filter | 🔴 **confirmed violation** |
| `SeasonStore.restoreBackup(id)` | Reads via `backend.getBackup(id)` (inherits whichever of the two violations above applies), snapshots current state first as "Before restore", persists, rolls back `this.data` in memory if persist fails | ⚠️ the rollback-on-failed-persist behavior is sound; the vulnerability is entirely upstream, at the `getBackup(id)` layer |

### version history (named save points)

| Path | Identity mechanism | Status |
|---|---|---|
| `VersionManager._key()` | `ffa_versions_${seasonId}::${gameId}` — localStorage, NOT SQLite | 🔴 **location violation of Invariant #4's spirit** — the entire named-save-point feature lives in localStorage on the desktop app, bypassing SQLite entirely, even though `SqlCatalog` already has a dormant `versions` table built for exactly this (comment: "NOT yet wired into VersionManager"). This is not an identity bug (the identity fencing here is actually the best-designed in the codebase — see next row) but it is squarely PC-2 scope ("Remove normal Tauri JSON/library writes... that can override the catalog") |
| `VersionManager.snapshot()` / `restore(id)` | Every version is stamped with `seasonId`/`gameId` at creation; `restore(id)` explicitly refuses when `v.seasonId !== currentSeasonId \|\| v.gameId !== activeGameId`, with a coach-facing toast | ✅ **this is the reference-quality pattern** — explicit provenance stamped on the record itself, checked before every restore, fails closed with a message. PC-1's "Explicit Identity API" should generalize this shape, not invent a new one |
| **`SqlCatalog.getVersion(id)`** (dormant, unused by any caller today) | `SELECT body_json FROM versions WHERE id = ?` — no `season_id`/`game_id` filter | 🔴 **confirmed violation**, currently unreachable in production (nothing calls it) but part of the catalog surface PC-2 will wire up, so it must be fixed before that wiring lands, not after |
| **`SqlCatalog.deleteVersion(id)`** (dormant) | Same — no scope filter | 🔴 **confirmed violation**, currently unreachable |

### import

| Path | Identity mechanism | Status |
|---|---|---|
| `StorageManager.loadProject(file)` → `SeasonStore.adopt(parsed)` | See §3.1 — this is the same defect as the "save" row above, reached via a different entry point | 🔴 **confirmed violation** |
| `CatalogPersistence.migrateJsonSeasons(ids)` (the one-time flag-on JSON→catalog import) | `if (inDb) continue;` per id — idempotent, skips a season already present rather than duplicating or overwriting | ✅ |

### delete

| Path | Identity mechanism | Status |
|---|---|---|
| `TauriBackend.deleteSeason(id)` | Explicit `id`; on a catalog-delete failure, returns `false` **without** touching `season.json`, the Documents mirror, or the library entry — the season stays fully durable and cannot resurrect from a stale sidecar because nothing was removed | ✅ matches the adversarial matrix's "Delete fails: season remains durable and cannot resurrect from a stale sidecar" exactly |
| `CatalogPersistence.deleteSeason(id)` | On a `writeDb` failure after `catalog.deleteSeason(id)` has already mutated memory, re-syncs the in-memory catalog from a pre-delete snapshot (or re-reads disk as a last resort) so memory and disk cannot diverge | ✅ |
| `SeasonStore.deleteSeason(id)` | Only clears `currentSeasonId`/`data` when the backend reports `ok !== false` | ✅ |

### recovery

| Path | Identity mechanism | Status |
|---|---|---|
| `TeamRegistry.recoverFromWipe()` | See "peek" above — read-only, `peekSeason` only, never mutates active identity | ✅ |
| `TauriBackend._recoverFromMirror()` | Runs only when `listSeasons()` finds the app-data library **empty** (`lib.length === 0`) — never triggered merely because a mirror exists, matching "Never auto-import merely because app data appears empty" is actually the *inverse* rule the plan states for PC-3 (import should require the app data to be missing AND a confirmed action) | ⚠️ **partial concern for PC-3**: this recovery is currently fully automatic (no coach confirmation, no preview) the moment app-data is empty — which is exactly the "auto-import merely because app data appears empty" pattern Invariant #6/PC-3 says to avoid. It predates PC-3's stricter contract and is explicitly named as PC-3 scope, not a PC-0 fix |

### shutdown

| Path | Identity mechanism | Status |
|---|---|---|
| *(none found)* | No `beforeunload`, `unload`, or Tauri close-request handler exists anywhere in `js/` | 🔴 **confirmed gap** — see §3.4 |

---

## 3. Concrete findings, each verified against source before being listed

### 3.0 — MOST SEVERE: a corrupt on-disk catalog is indistinguishable from a genuinely-empty one, and `listSeasons()` silently rewrites `library.json` to reflect the wrong one

**Reproduced directly, not inferred from reading.** `CatalogPersistence._ensureLoaded()`:

```js
async _ensureLoaded() {
  if (this._loaded && this.catalog.db) return;
  let bytes = null;
  try { bytes = await this.fs.readDb(); } catch (e) { bytes = null; }
  try {
    await this.catalog.open(bytes && bytes.length ? bytes : undefined);
  } catch (e) {
    // Corrupt db bytes — start clean; the per-season json fallback re-migrates.
    await this.catalog.open();
  }
  this._loaded = true;
}
```

If `catalog.open(bytes)` throws on corrupt/truncated on-disk db bytes, this
silently opens a **brand-new, empty in-memory database** instead of
propagating the failure. `reconcileFallbacks()` then calls
`this.catalog.listSeasons()` against that fresh, empty database and returns
`[]` — with no exception, no error, nothing distinguishing "the catalog
genuinely holds zero seasons" from "the catalog failed to open its real data
and silently substituted an empty one."

`TauriBackend.listSeasons()` then does, unconditionally, whenever a catalog
object exists at all (`cp` truthy):

```js
lib = await cp.reconcileFallbacks();
await this._writeLib(lib);
```

There is no check that `reconcileFallbacks()`'s result is non-empty before
trusting it, and no distinction between a corrupt catalog and an honestly
empty one. **Confirmed by direct reproduction** (fake fs + real `sql.js`,
matching the project's own test harness pattern): save one real season,
corrupt the in-memory "on-disk" bytes, open a fresh `CatalogPersistence`
against them (simulating the next app launch), call `reconcileFallbacks()`.
Result: no exception, an empty array returned, while the season's
`season.json` fallback copy is confirmed still fully intact and readable on
"disk" the entire time. `library.json` would then be overwritten to `[]` on
the very next `listSeasons()` call in the real app.

**Compounding effect with `_recoverFromMirror()`:** `listSeasons()` runs
mirror-based recovery FIRST when `library.json` is empty
(`if (lib.length === 0) { const recovered = await this._recoverFromMirror(); if (recovered.length) lib = recovered; }`),
which can genuinely repopulate `lib` with the coach's real seasons from the
Documents mirror — and then the very next block **unconditionally overwrites
that recovered `lib`** with `cp.reconcileFallbacks()`'s empty result, because
nothing merges the two or prefers whichever is non-empty. The code comment at
that call site ("SQLite is canonical... so stale sidecars can never hide or
rename a surviving season") states the correct *design intent* — the catalog
should always win over a possibly-stale sidecar — but the implementation
cannot tell "canonical and empty" apart from "corrupt and defaulted to
empty," so the intent inverts into exactly the failure it was written to
prevent.

This is the adversarial matrix's "SQLite is corrupt, locked, or unavailable:
visible failure, no fallback authority" item, and today the actual behavior
is the opposite of what it asks for: **no visible failure, and the sidecar
fallback is actively discarded rather than falling back to it.** This is the
single highest-priority item for PC-2 to close, ahead of the identity-mismatch
findings below — a corrupt catalog file currently has a plausible path to
making a coach's real, undamaged seasons disappear from the library screen
and then persisting that disappearance to `library.json`.

### 3.1 — CLOSED, PC-1 (repair of Codex `1aefe8b` finding 1) — import is now atomic: destination-correct, durably awaitable, and non-mutating on failure

**First PC-1 pass fixed id-reassignment and awaitability but NOT atomicity —
Codex's `1aefe8b` review caught this with a direct reproduction: `ok:false`
alongside the live in-memory season changing to the rejected payload's name,
plus one Documents-mirror write containing that rejected payload.** Root
cause, confirmed by reading source before touching anything: `adopt()`
assigned the imported data to `this.data` *before* awaiting `persist()`, with
no rollback on failure; and `persist()` called `_scheduleDiskWrite()`
unconditionally, before the canonical `saveSeason()` result was known — so a
rejected canonical save still armed the 2.5s debounce timer, which then wrote
the rejected payload to the Documents mirror regardless. Both are now fixed:

```js
// js/season-store.js
async adopt(parsed) {
  const prior = this.data;
  let next;
  if (parsed && Array.isArray(parsed.games)) {
    next = this._normalize({ ...parsed, id: this.currentSeasonId });
  } else if (parsed && Array.isArray(parsed.plays)) {
    next = this._normalize({ id: this.currentSeasonId, games: [this.gameFromLegacy(parsed)] });
  } else {
    return { ok: false, data: null };
  }
  this.data = next;
  const ok = await this.persist();
  if (ok === false) {
    this.data = prior;                 // roll back the live in-memory mutation
    return { ok: false, data: prior };
  }
  return { ok: true, data: this.data };
}

persist() {
  ...
  const saved = Promise.resolve(this.backend.saveSeason(seasonId, this.data))
    .then(ok => {
      if (ok === false) { this._persistFailed(); return false; }
      this._persistWarned = false;
      this._scheduleDiskWrite();       // only armed AFTER the canonical save is confirmed durable
      return true;
    })
    .catch(() => { this._persistFailed(); return false; });
  return saved;
}
```

`TauriBackend.writeDisk()` (`js/storage-backend.js`) was independently
broken the same way — it called `saveSeason()`, then unconditionally called
`createBackup()`/`_mirrorToDocuments()` regardless of whether that internal
`saveSeason()` succeeded. Fixed as defense-in-depth (any caller of
`writeDisk` directly, not just the `_scheduleDiskWrite` debounce, is now
covered):

```js
async writeDisk(seasonId, data, opts = {}) {
  const ok = await this.saveSeason(seasonId, data);
  if (!ok) return false;
  if (opts.snapshot) await this.createBackup(seasonId, data, opts.label);
  await this._mirrorToDocuments(seasonId, data, opts);
  this._lastWrite = Date.now();
  return ok;
}
```

The second half of Codex's finding — "roll back a destination created
solely for a failed first-run import" — is closed at `StorageManager.
loadProject()` (`js/storage.js:1257`): when no season was open, `loadProject`
calls `seasonStore.createSeason()` to bootstrap a destination before
`adopt()` runs; if that import then fails, the freshly-created (now
orphaned, empty) season is deleted rather than left behind:

```js
let createdFreshSeason = false;
if (!this.seasonStore.hasCurrent()) {
  const rec = await this.seasonStore.createSeason({ name: ..., teamId: ... });
  createdFreshSeason = !!rec;
}
const result = await this.seasonStore.adopt(parsed);
if (!result || result.ok === false) {
  if (createdFreshSeason && this.seasonStore.currentSeasonId) {
    try { await this.seasonStore.deleteSeason(this.seasonStore.currentSeasonId); } catch (e) {}
  }
  this.tagger?.toast?.('Import failed — the season could not be saved. Nothing on screen changed.', 8000);
  return;
}
```

Proven end to end by `tools/pc-adversarial-matrix.mjs`, all `[LOCK]`:
section 3 (`SeasonStore.adopt()` directly — destination-id honored, awaitable
result, rejected-write visibly reported); section 3b (the REAL
`StorageManager.loadProject()`, `bound:true` this time per Codex's exact
critique of the prior `bound:false` fixture — live store byte-identical after
a rejection, zero debounce timers armed, zero disk/mirror writes even after
the timer window is manually fired, editor untouched, visible toast, **plus**
the successful control proving the mechanism genuinely writes when the save
legitimately succeeds); section 3c (the first-run/no-current-season branch —
the orphaned season is deleted, the store returns to "nothing open").
Mutation-verified individually: reverting the `adopt()` rollback, the
`persist()` disk-write-timing fix, the `writeDisk()` mirror gate, and the
`loadProject()` season-rollback each reproduce their exact original defect
(including the literal `Imported Season` live-name and one-mirror-write
symptoms Codex's own reproduction reported) and red exactly their own
section; all restored, clean.

### 3.1b — CLOSED, PC-1 (repair of Codex `1aefe8b` finding 2) — explicit identity threaded through the whole desktop persistence API, both above and below the `CatalogPersistence` seam

**Codex's second finding: the shared/Tauri APIs (`loadSeason()`,
`saveSeason(data)`, `createBackup(data, label)`, `listBackups()`,
`getBackup(id)`, `deleteBackup(id)`, `writeDisk(data, opts)`) remained scoped
through ambient `this.currentId`, even though `CatalogPersistence` was
already explicit — "the unsafe scope remains above and below that seam."**
Every one of those methods, in the `StorageBackend` base class, `BrowserBackend`,
and `TauriBackend`, now takes `seasonId` as an **explicit, required first
parameter**; none of them consult `this.currentId`/`setCurrentSeason()` to
choose a destination or scope any more. `SeasonStore` (the sole caller of
these methods anywhere in `js/` — verified by grep) passes
`this.currentSeasonId` explicitly at every call site (`persist()`, `load()`,
`openSeason()`, `snapshot()`, `listBackups()`, `restoreBackup()`, `bindDisk()`,
`saveNow()`, `_scheduleDiskWrite()`'s captured callback).

"Below the seam" — `SqlCatalog`'s backup methods (`createBackup`,
`listBackups`, `getBackup`, `deleteBackup`) — are also now explicit-`seasonId`,
so `CatalogPersistence`'s own wrappers no longer call `setCurrentSeason()`
before delegating to them at all:

```js
// js/sql-catalog.js
getBackup(seasonId, id) { const r = this._get('SELECT body_json FROM backups WHERE id = ? AND season_id = ?', [id, seasonId]); return r ? JSON.parse(r.body_json) : null; }
```

`SqlCatalog.saveSeason(data)`/`loadSeason(id)` needed no change — they
already preferred an explicit id (`data.id || this.currentId`, and a plain
`id` parameter respectively) over the ambient pointer; `this.currentId`
remains only as harmless delete-time bookkeeping there. `currentId`/
`setCurrentSeason` remain on `StorageBackend`/`TauriBackend` for the
out-of-scope film/linked-film surfaces (Invariant #8) and for `_touchMeta`'s
library-index bookkeeping, which is not itself a write-destination choice.

**"An incorrect ambient pointer cannot redirect an operation" is now a
provable, tested claim, not an assumption.** `tools/e2e-catalog-backend.mjs`
drives the real `TauriBackend` with `be.currentId` deliberately pinned to a
season that matches neither the explicit destination nor the payload, and
confirms the explicit argument alone decides the target for both
`saveSeason` and `getBackup`; `tools/pc-adversarial-matrix.mjs` sections 5/6
and 11 do the same for `SqlCatalog` and `BrowserBackend` directly. Every
mutation restoring an ambient-`this.currentId` read in place of the explicit
parameter was verified to reproduce the exact regression and red exactly its
own assertion.

### 3.1c — CLOSED, PC-1 (repair of Codex `4ae34e8` finding 1) — a season switch while an import save is pending can no longer restore or delete the wrong season in memory

**Codex's re-review of the first `1aefe8b` repair found a narrower race the
first pass never tested: switching seasons WHILE an import's save is still
pending.** Direct reproduction quoted from the review: *"begin an import into
A, open B while the backend save is pending, resolve the A save `false`; the
store ends as `{ currentSeasonId:'B', data.id:'A', data.seasonName:'Season
A' }`."* Root cause: `adopt()`'s rollback (`this.data = prior`) ran
unconditionally on a rejected save, with no check that the store still owned
the season it started with — by the time the pending save resolved, the coach
could already be looking at a completely different, freshly-opened season,
and the rollback silently clobbered it. The first-run branch
(`StorageManager.loadProject()`, `js/storage.js:1269-1289`) had the identical
shape but was more destructive: on failure it deleted
`this.seasonStore.currentSeasonId`, re-read AFTER the `adopt()` await — so
the same interleaving deleted whichever season the coach had opened in the
meantime, not the orphaned scaffold season the import itself created.

Both fixed by capturing the destination/scaffold id **once, synchronously,
before any await**, and gating every later live-store mutation on the store
still owning that same id:

```js
// js/season-store.js
async adopt(parsed) {
  const destSeasonId = this.currentSeasonId;   // captured once, before any await
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
  const ok = await this.persist(destSeasonId, next);   // explicit id, never ambient
  if (ok === false) {
    if (stillOwns()) this.data = prior;   // roll back ONLY if we still own this season
    return { ok: false, data: prior };
  }
  return { ok: true, data: stillOwns() ? this.data : next };
}
```

`persist()`, `_scheduleDiskWrite()`, and `_stripStAlignmentBeforeSave()` were
each given an optional explicit `seasonId`/`data` parameter (defaulting to
the ambient `this.currentSeasonId`/`this.data`, so every pre-existing ambient
caller — autosave, `saveNow()`, `bindDisk()` — is byte-unchanged) so
`adopt()`'s own save and its debounced disk-sync always target the season it
captured, never whatever the store has since switched to.

```js
// js/storage.js — loadProject()'s first-run branch
let scaffoldSeasonId = null;
if (!this.seasonStore.hasCurrent()) {
  const rec = await this.seasonStore.createSeason({ name: ..., teamId: ... });
  scaffoldSeasonId = (rec && rec.id) || null;   // captured once, right after creation
}
const result = await this.seasonStore.adopt(parsed);
if (!result || result.ok === false) {
  if (scaffoldSeasonId) {
    try { await this.seasonStore.deleteSeason(scaffoldSeasonId); } catch (e) {}
  }
  this.tagger?.toast?.('Import failed — the season could not be saved. Nothing on screen changed.', 8000);
  return;
}
```

`SeasonStore.deleteSeason(id)` itself only tears down the live editor when
`this.currentSeasonId === id` (unchanged, pre-existing behavior), so deleting
the captured scaffold id is safe regardless of what the coach has opened
since — it can never touch a season the coach is now viewing.

Proven by `tools/pc-adversarial-matrix.mjs` section 3d, `[LOCK]`, covering
**both** cases Codex named explicitly: (i) an already-open season A being
overwritten by an import while the coach switches to B before A's save
resolves, and (ii) a genuine first-run import that creates a fresh scaffold
season S while the coach opens B before S's import resolves. Both drive a
real unresolved `Promise` for `saveSeason()` so a genuine season switch can
land inside the pending window, rather than relying on synchronous fixture
resolution the way sections 3/3b/3c's fixtures do. Mutation-verified: forcing
`stillOwns()` to always return `true` reproduces exactly Codex's cited
symptom (`{"currentSeasonId":"B","data":{"id":"A","seasonName":"Season A"}}`)
in case (i); reverting the scaffold-id capture to re-read
`this.seasonStore.currentSeasonId` after the await reproduces exactly the
"deletes B rather than S" symptom in case (ii) (`deletedIds: ["B"]`). Both
restored and reconfirmed clean.

### 3.1d — CLOSED, PC-1 (repair of Codex `4ae34e8` finding 2) — a rejected canonical (db) write is now atomic across every sidecar sink, including the in-memory catalog itself

**Codex's re-review found the first repair's own new atomicity proof
(section 3b) could not have caught this: it used a fake `SeasonStore`-level
backend, so it could only prove `SeasonStore` doesn't SCHEDULE a later
`writeDisk()` — it never drove a real `CatalogPersistence` through an actual
`writeDb()` failure.** In production, `CatalogPersistence.saveSeason()`
(`js/catalog-persistence.js:61-76`) still wrote `season.json` and the
Documents mirror unconditionally after a `writeDb()` rejection, and
`TauriBackend.saveSeason()` (`js/storage-backend.js:678-699`) still called
`_touchMeta()` (advancing `library.json`) regardless of the canonical
result. Worse, `tools/e2e-catalog-persistence.mjs`'s own section 6 assertion
**required** the unsafe json write — *"a db-write failure returns false yet
still writes the json fallback (no data loss)"* — the exact bug, dressed up
as a passing test.

Root cause: `saveSeason()` mutates the in-memory `SqlCatalog` (commits the
new season into the sql.js db object), THEN attempts `writeDb()` (exporting
bytes to disk). If `writeDb()` fails, the in-memory catalog is left committed
to the new data while on-disk bytes are unchanged — a split-brain — and the
json/mirror writes ran anyway, gated on nothing. `deleteSeason()` in the same
file already defended against the identical hazard for deletes (snapshot
pre-mutation bytes, reopen the catalog from them on a `writeDb` failure);
`saveSeason()` now does the same, closing a class the original code had only
half-fixed:

```js
// js/catalog-persistence.js
async saveSeason(id, data) {
  ...
  let snapshot = null;
  try { snapshot = this.catalog.toBytes(); } catch (e) { snapshot = null; }
  data.id = id;
  this.catalog.setCurrentSeason(id);
  if (!this.catalog.saveSeason(data)) return false;
  let okDb = false;
  try { await this.fs.writeDb(this.catalog.toBytes()); okDb = true; } catch (e) { okDb = false; }
  if (!okDb) {
    // Re-sync memory to the pre-mutation snapshot -- no split-brain, and a
    // rejected payload cannot be read back out of the in-memory catalog
    // either, not just off disk.
    try {
      this.catalog.close();
      await this.catalog.open(snapshot && snapshot.length ? snapshot : undefined);
      this._loaded = true;
    } catch (e2) { this._loaded = false; try { await this._ensureLoaded(); } catch (e3) {} }
    return false;
  }
  // Fallback + mirror write ONLY once the canonical db write is confirmed durable.
  try { await this.fs.writeJson(id, data); } catch (e) {}
  if (this.fs.writeMirror) { try { await this.fs.writeMirror(id, data); } catch (e) {} }
  return true;
}
```

`TauriBackend.saveSeason()` gates `_touchMeta()` on the same `okDb` result:

```js
const okDb = await cp.saveSeason(seasonId, data);
if (okDb) await this._touchMeta(seasonId, data);
return okDb;
```

Proven by three independent harnesses, all mutation-verified against the
original defect: `tools/pc-adversarial-matrix.mjs` section 3e (real
`CatalogPersistence` + real `SqlCatalog`, `[LOCK]`) — zero json writes, zero
mirror writes, and a same-session `loadSeason()` on the same instance after
the failure correctly returns `null` rather than reading the rejected
payload straight back out of memory; a successful-save control on a fresh
instance proves the gate isn't just disabling the sidecar writes entirely.
`tools/e2e-catalog-persistence.mjs` section 6, rewritten (was the file
requiring the unsafe write; now requires the opposite, plus the in-memory
rollback proof). `tools/e2e-catalog-backend.mjs` (new assertion 1e) proves
`TauriBackend.saveSeason()`'s own `_touchMeta()` gate directly against the
built bundle. `tools/e2e-catalog-fuzzer.mjs` — a PRE-EXISTING 16-seed × 40-op
random fuzzer — initially failed against this fix (`seed 1 op 6: season A
mismatch`) because its own model asserted the OLD, buggy contract ("whether
the db write faulted or not... the model advances to the new shape"); its
model is corrected to advance only on a genuinely successful save, and it
was then used to independently confirm the fix (640 ops clean) and to
independently reproduce the regression under mutation.

### 3.1e — CLOSED, PC-1 (repair of Codex `4d75bca`) — the whole first-run import lifecycle is now one ownership-checked fence, from scaffold creation through the final editor reload

**§3.1c closed the race during `adopt()`'s own pending save (both the
already-open A -> B case and the "delete the wrong season on failure" case).
Codex's re-review found two narrower gaps §3.1c's fixes did not reach: a
season switch racing the SCAFFOLD's OWN durable creation, and a stale but
GENUINELY SUCCESSFUL import still unconditionally firing the caller's
editor-reload side effects.**

**Gap 1 — the scaffold's own creation await had zero ownership protection.**
`SeasonStore.createSeason()` is the general "make a new season and switch to
it" primitive — correct to switch unconditionally for its *deliberate*
callers (Team Hub's "New Season" button, `loadDemoSeason()`,
`StorageManager.createSeason()`), where the coach explicitly asked for the
new season to become current. `StorageManager.loadProject()`'s first-run
import bootstrap reused this SAME unconditional-switch method purely as
plumbing to obtain a real library id — but that means a coach who opened (or
created) a *different* season B while `createSeason()`'s own internal
`await this.backend.createSeason(meta)` was still pending would have B
silently clobbered the instant that await resolved: `createSeason()`'s body
runs `this.currentSeasonId = rec.id; ...; this.data = this._empty(); ...`
unconditionally as its very next synchronous step, with no check that
nothing else had claimed the pointer in the meantime.

**Fixed by separating durable allocation from the live-state claim**, so the
deliberate-caller contract and the implementation-detail-scaffold contract
can differ without duplicating logic:

```js
// js/season-store.js
async _createSeasonRecordOnly(meta) {           // pure backend write, zero live-state touch
  return this.backend.createSeason(meta || {});
}
_adoptSeasonRecord(rec, meta) {                  // the live-state claim, unguarded
  this.currentSeasonId = rec.id;
  this.backend.setCurrentSeason(rec.id);
  this.data = this._empty();
  this.data.id = rec.id;
  this.data.seasonName = rec.name;
  ...
}
async createSeason(meta) {                       // deliberate callers: UNCHANGED, unconditional
  this.cancelPendingDiskWrite();
  const rec = await this._createSeasonRecordOnly(meta);
  if (!rec) return null;
  this._adoptSeasonRecord(rec, meta);
  this.persist();
  return rec;
}
async createUnclaimedSeasonIfEmpty(meta) {        // NEW: loadProject()'s bootstrap only
  this.cancelPendingDiskWrite();
  const rec = await this._createSeasonRecordOnly(meta);
  if (!rec) return { rec: null, claimed: false };
  if (this.hasCurrent()) return { rec, claimed: false };   // someone else opened/created a season meanwhile
  this._adoptSeasonRecord(rec, meta);
  this.persist();
  return { rec, claimed: true };
}
```

`StorageManager.loadProject()`'s bootstrap branch now uses
`createUnclaimedSeasonIfEmpty()`; when `claimed` is false the (never-made-live)
scaffold is deleted by its own id and the import aborts cleanly — the
concurrently-opened season was never on a shared code path with any of this,
so it needs no special-casing to stay untouched.

**Gap 2 — a stale but genuinely successful import still reloaded the wrong
editor.** §3.1c's fix protects `SeasonStore.data` itself (via `adopt()`'s own
`stillOwns()` gate), but `StorageManager.loadProject()`'s *caller-level* side
effects — `this._clearForNewGame(); this._loadActiveGame();` — ran
unconditionally on ANY successful `adopt()` result, with no check that the
store still owned the season this particular import targeted. A stale import
whose OWN durable write to its OWN destination genuinely succeeded (no data
corruption at all) would still unload the video, reset the playlist, and blank
the Game Info form of whatever *different* season the coach had since opened
and was actively working in — a real, disruptive UX interruption with no
connection to what the coach was doing, distinct from (and not caught by) any
data-integrity check.

Fixed by capturing the same identity `adopt()` itself captures, one level up,
and gating the reload on it:

```js
// js/storage.js — loadProject()
const destSeasonId = this.seasonStore.currentSeasonId;   // == what adopt() itself will capture; no await between here and the call below
const result = await this.seasonStore.adopt(parsed);
if (!result || result.ok === false) { ... return; }
if (this.seasonStore.currentSeasonId !== destSeasonId) {
  // The import's OWN destination season saved durably, but the coach
  // switched to a different season while that save was pending. Reloading
  // the editor here would only interrupt whatever they're doing now for no
  // reason connected to it, so skip it silently.
  return;
}
this._clearForNewGame();
this._loadActiveGame();
```

Proven by `tools/pc-adversarial-matrix.mjs` section 3f, `[LOCK]`, the "two
additional race tests" the review named: (i) drives a real `StorageManager`
against a backend whose `createSeason()` is held pending via an unresolved
`Promise`, opens season B mid-flight, then resolves the scaffold's creation
and asserts the store still shows B untouched, the never-claimed scaffold is
durably deleted, and the editor never re-renders; (ii) drives the
already-established stale-switch harness shape from section 3d but resolves
the pending save with `true` (a genuine success) instead of `false`, and
asserts the editor still never reloads. Mutation-verified: disabling
`createUnclaimedSeasonIfEmpty()`'s `hasCurrent()` guard reproduces the
scaffold clobbering B exactly (`{"currentSeasonId":"lib-fresh-scaffold",...}`,
the editor firing as if the import succeeded, no failure toast); removing the
`destSeasonId` reload gate reproduces the stale-success reload firing on B
exactly, isolated to that one assertion. Both restored, clean.

### 3.1f — CLOSED, PC-1 (repair of Codex `95e28c9`) — first-run import performs exactly one canonical write; the redundant unfenced scaffold save is removed rather than raced

**§3.1e closed the two ownership races Codex named — a switch racing the
scaffold's own creation, and a stale-but-successful import reloading the
wrong editor. Codex's final re-review found one more defect underneath both
fixes: even with ownership correctly resolved, the first-run bootstrap still
launched TWO writes to the SAME season id, with nothing fencing them against
each other.**

`SeasonStore.createUnclaimedSeasonIfEmpty()` (§3.1e) called `this.persist()`
— fire-and-forget, never awaited — immediately after claiming the blank
scaffold as current. `StorageManager.loadProject()` then immediately called
`adopt()`, which performs its OWN save (**awaited** this time) to the exact
same season id, carrying the real imported payload. Both calls ultimately
reach `backend.saveSeason(seasonId, data)` for the identical id, and nothing
orders them against one another. Without PC-4's revision fencing (§3.2,
still explicitly deferred), whichever call's own internal chain of awaits
happens to resolve **last** wins — and a fire-and-forget call starting first
carries no guarantee of finishing first. The blank scaffold's save could
complete after the real import's save and silently overwrite it.

**Fixed by removing the call, not by trying to race it correctly.** The
`persist()` call inside `createUnclaimedSeasonIfEmpty()` bought nothing for
its one caller: `loadProject()`'s bootstrap always calls `adopt()`
immediately afterward, and `adopt()`'s own save is an UPSERT
(`INSERT ... ON CONFLICT DO UPDATE` in `SqlCatalog.saveSeason`; a plain
`setItem`/`writeJson` overwrite in `BrowserBackend`/`TauriBackend`) that
creates the season's body row itself — it has no dependency on a
pre-existing one. `SeasonStore.createSeason()` (the deliberate "New Season"
action) correctly KEEPS its own `persist()` call, since that IS the season a
coach might genuinely leave untagged and needs a durable body for; this
distinction is exactly why `createUnclaimedSeasonIfEmpty()` remained a
separate method rather than a flag on `createSeason()` (§3.1e).

```js
// js/season-store.js
async createUnclaimedSeasonIfEmpty(meta) {
  this.cancelPendingDiskWrite();
  const rec = await this._createSeasonRecordOnly(meta);
  if (!rec) return { rec: null, claimed: false };
  if (this.hasCurrent()) return { rec, claimed: false };
  this._adoptSeasonRecord(rec, meta);
  // no this.persist() here anymore -- adopt()'s own save is the only
  // canonical write this bootstrap path ever needs.
  return { rec, claimed: true };
}
```

Proven by `tools/pc-adversarial-matrix.mjs` section 3g, `[LOCK]`: a real
`StorageManager` first-run import, with `backend.saveSeason` instrumented to
record every call. Asserts exactly one call total, and that its content
carries the imported payload's own game id (`'g1'`, from the shared `season()`
fixture) rather than a blank scaffold's freshly-generated one. Mutation-
verified: reintroducing the removed `this.persist()` call reproduces exactly
two `saveSeason` calls — the first carrying the blank scaffold's randomly-
generated game id, never `'g1'` — reddening exactly the two new count/content
assertions while the reload-still-happens control stays green.

### 3.2 — No revision fencing for two overlapping saves to the *same* season

Every existing safeguard (§2 "autosave" row) fences against a **season
switch** happening mid-flight. None of them fence against two saves to the
**same** season racing each other — e.g. a debounced autosave firing at the
same moment as an explicit "Save Season" click, or a slow disk write from an
earlier edit completing after a faster one from a later edit. Nothing carries
a revision/sequence number that a write could be rejected for being stale
against. This is not yet reproduced as a concrete field symptom, but it is
structurally real and is exactly what Invariant #7's "...or a newer commit"
clause names as in-scope. PC-1/PC-4 should decide whether to add a monotonic
revision counter to `SeasonStore.data` (comparable to the plan's own
suggestion) or fence this some other way.

**Not addressed by the PC-1 pass that closed §3.1/§3.3 below.** This finding
has no corresponding section in `tools/pc-adversarial-matrix.mjs` — it is a
design decision (whether/how to add revision fencing across the whole data
model), not a scoped identity-mismatch bug with a small, contained fix like
those two. It remains open and undecided.

### 3.3 — CLOSED (backup), PARTIAL (version), PC-1 — backup/version reads/deletes are now season/game-scoped at every live storage layer

**Backup ownership is closed at both backends.** `BrowserBackend.getBackup(id)`/
`deleteBackup(id)` (`js/storage-backend.js`) now refuse a record whose stored
`seasonId` does not equal `this.currentId` (a loose `== null` check covers
`_tx`'s `undefined`-on-miss quirk, so a genuine miss and a foreign-season hit
are both treated as "not found"):

```js
async getBackup(id) {
  const rec = await this._tx('backups', 'readonly', os => os.get(id));
  if (rec == null || rec.seasonId !== this.currentId) return null;
  return rec.data;
}
async deleteBackup(id) {
  const rec = await this._tx('backups', 'readonly', os => os.get(id));
  if (rec == null || rec.seasonId !== this.currentId) return false;
  await this._tx('backups', 'readwrite', os => os.delete(id));
  return true;
}
```

`SqlCatalog.getBackup(id)`/`deleteBackup(id)` (`js/sql-catalog.js`) now scope
by `this.currentId`, reusing the same implicit-pointer pattern
`saveSeason`/`createBackup` already established — `CatalogPersistence.
getBackup(id, backupId)`/`deleteBackup(id, backupId)` already call
`this.catalog.setCurrentSeason(id)` immediately before delegating, so this
scoping is exact with **zero caller-signature changes** anywhere in the app:

```js
getBackup(id) { const r = this._get('SELECT body_json FROM backups WHERE id = ? AND season_id = ?', [id, this.currentId]); return r ? JSON.parse(r.body_json) : null; }
deleteBackup(id) { this._run('DELETE FROM backups WHERE id = ? AND season_id = ?', [id, this.currentId]); }
```

`SeasonStore.restoreBackup(id)` has no ownership logic of its own — it is
`await this.backend.getBackup(id)`, then bails if that returns falsy
(`js/season-store.js:623-636`) — so it is protected **transitively**, with
zero new code in `restoreBackup` itself, now that both backends beneath it
are scoped correctly.

One documented exception, not a gap: `BrowserBackend.deleteSeason()`'s own
backup-cleanup sweep (which legitimately removes every backup belonging to a
season being deleted, not necessarily `this.currentId`) bypasses the new
public `deleteBackup()` and operates directly on the `_tx` layer instead —
the one caller for whom "scoped to the currently active season" is the wrong
question to ask.

Proven in `tools/pc-adversarial-matrix.mjs` sections 5/6 (SqlCatalog), 11
(BrowserBackend), and 12 (`SeasonStore.restoreBackup`, now driven through a
real `BrowserBackend` rather than a fixture that modeled the old bug) — all
`[LOCK]`. Mutation-verified individually: removing the `season_id`/`seasonId`
filter at either backend reproduces the original leak and reds its own
section; removing it at `BrowserBackend.getBackup` alone additionally reds
section 12 transitively (proving `restoreBackup`'s protection is real and not
independently re-implemented), reproducing the exact original symptom —
`restoreBackup()` silently overwriting season A's live data with season B's.
All restored, clean.

**Version ownership is closed at the new scoped seam; the legacy unscoped
methods are a disclosed, intentionally-dormant gap.** `SqlCatalog` now has
`getVersionScoped(seasonId, gameId, id)`/`deleteVersionScoped(seasonId,
gameId, id)`, with `CatalogPersistence` wrapping both — the exact contract
this section previously specified as PC-2's job, implemented ahead of
schedule as part of closing this finding:

```js
getVersionScoped(seasonId, gameId, id) {
  const r = this._get('SELECT body_json FROM versions WHERE id = ? AND season_id = ? AND game_id = ?', [String(id), seasonId, gameId]);
  return r ? JSON.parse(r.body_json) : null;
}
deleteVersionScoped(seasonId, gameId, id) {
  const owned = !!this._get('SELECT id FROM versions WHERE id = ? AND season_id = ? AND game_id = ?', [String(id), seasonId, gameId]);
  if (owned) this._run('DELETE FROM versions WHERE id = ?', [String(id)]);
  return owned;
}
```

These take **explicit** `(seasonId, gameId)` parameters rather than trusting
an ambient `this.currentId` — they are brand-new methods with no existing
caller to preserve compatibility with, so there is no reason to repeat the
implicit-pointer pattern used for backups. Proven in
`tools/pc-adversarial-matrix.mjs` section 7 (`[LOCK]`): B/B reads its own
version through the scoped seam; A/A is refused both read and delete; B/B can
STILL read its own version afterward (rules out an always-null
implementation). Mutation-verified: removing the ownership filter reds all
three of those assertions and reproduces `deleteVersionScoped` actually
deleting a foreign record; restored, clean.

**The legacy bare `getVersion(id)`/`deleteVersion(id)` remain unscoped and
vulnerable, deliberately.** Grep-confirmed zero callers anywhere in `js/` —
`CatalogPersistence.getVersion`/`deleteVersion` delegate to them but are
themselves never called from production code; `VersionManager` is not wired
to SqlCatalog at all yet (a separate, already-documented deferred item). They
were not deleted because `tools/e2e-catalog-versions.mjs` (an existing,
unrelated, already-passing regression suite) exercises their plain CRUD/
eviction behavior directly with no ownership dimension — deleting them would
force rewriting that fixture for zero live-vulnerability benefit, since no
production path can reach this shape unscoped today. `tools/
pc-adversarial-matrix.mjs` section 7 keeps two `[TARGET]` assertions pinned
red against this exact gap, explicitly labeled as a disclosed, dormant,
not-scheduled item rather than a PC-2 checkpoint — **PC-2 must wire
`VersionManager` onto the scoped seam, never the legacy bare methods.**

### 3.4 — No shutdown flush path exists anywhere in the app

`grep -rn "beforeunload|unload|visibilitychange" js/` finds seven files, but
none of them register an app-level handler that flushes pending writes on
exit — the matches are all unrelated (`unloadVideo()`, a Tauri file-drag
`unlisten`, etc.). Two debounces exist that a coach can currently lose work
inside if the window/process closes during their window:

- `StorageManager._autoSave()`'s 1-second `setTimeout` before the canonical
  save fires.
- `SeasonStore._scheduleDiskWrite()`'s 2.5-second `setTimeout` before the
  durable-disk mirror write fires.

On the browser build this is low-severity (closing a tab rarely races a
1-second timer meaningfully, and the canonical `localStorage` write already
happened by the time the disk-mirror debounce is pending). On the **desktop**
build it is a real, if narrow, window: a coach clicking the OS window-close
button within ~1s of the last edit could lose that edit's canonical SQLite
write entirely, since nothing intercepts the close request to flush first.
This is named explicitly in PC-0's scope ("...and shutdown") and PC-4's scope
("Audit... shutdown"); no fix is proposed here, only the gap.

---

## 4. What is already correct and should not be re-litigated in PC-1/PC-2

To keep later checkpoints from re-deriving ground already covered:

- Destination/payload id agreement on `saveSeason`/`createBackup` (both
  backends) already fails closed with zero writes on mismatch.
- `commitActive()`'s `_loadedGameId` guard already prevents the exact
  cross-game corruption class the P0 incident (`CLAUDE.md`, "P0 DATA-INTEGRITY
  INCIDENT REPAIRED") was rooted in.
- Season-switch fencing on both debounced-save paths (`_autoSave`,
  `_scheduleDiskWrite`, `_maybeSnapshot`/`_flushDeferredSnapshot`) already
  captures the owning season id and rechecks it at fire time.
- `TeamRegistry.recoverFromWipe()` already uses `peekSeason` exclusively and
  is explicitly documented as never touching the mutable pointer.
- Catalog-open failure already fails closed (throws) rather than silently
  demoting to JSON/localStorage, on every canonical read/write path that
  checks `catalogOnDisk && !cp`.
- `VersionManager.restore(id)`'s explicit `seasonId`/`gameId` provenance
  stamp-and-check is the best-designed identity pattern in the codebase and
  should be the model PC-1's "Explicit Identity API" generalizes from — not
  something PC-1 needs to invent from scratch.
- Season delete failure already leaves the season fully durable (no partial
  deletion, no resurrection risk) on both `TauriBackend` and
  `CatalogPersistence`.

## 5. Explicitly out of scope for PC-0 (named for PC-1 through PC-4, not solved here)

- Fixing §3.1 (import identity), §3.2 (revision fencing), §3.3 (backup/version
  scope checks), or §3.4 (shutdown flush) — these are PC-1/PC-2/PC-4 work.
- Migrating `VersionManager` off localStorage onto the dormant `SqlCatalog`
  `versions` table — PC-2 scope, named in §2's "version history" row.
- Tightening `_recoverFromMirror()`'s automatic-on-empty-library behavior into
  the preview-then-confirm shape PC-3 requires — named in §2's "recovery" row.
- Any change to film paths or files (explicitly out of scope for the whole
  plan, per its "Out Of Scope" section).

---

## 6. PC-2+PC-3 checkpoint — SQLite Authority + Recovery Snapshots (2026-08-21)

**Combined milestone, per the coach/reviewer's own combination decision
recorded in `GRIDIRON-IQ-PERSISTENCE-CONVERGENCE-PLAN.md`.** Both halves are
implemented, tested, and cross-verified together in one builder checkpoint, as
the plan's acceptance boundary requires ("one builder checkpoint, one
independent review, and no intermediate installer").

### §3.0 — CLOSED. Corrupt catalog now fails visibly; JSON is no longer a
### competing read/write authority anywhere.

`CatalogPersistence._ensureLoaded()` now distinguishes "bytes exist on disk
but fail to open" (genuine corruption — **must throw**) from "no bytes have
ever existed" (a fresh install — safe to open clean):

```js
async _ensureLoaded() {
  if (this._loaded && this.catalog.db) return;
  let bytes = null;
  try { bytes = await this.fs.readDb(); } catch (e) { bytes = null; }
  if (bytes && bytes.length) {
    await this.catalog.open(bytes);   // real bytes that fail to open MUST throw
  } else {
    await this.catalog.open();        // nothing has ever existed to be corrupted
  }
  this._loaded = true;
}
```

The throw now propagates uncaught through `reconcileFallbacks()`/
`loadSeason()`/`peekSeason()` (both at the `CatalogPersistence` layer and, via
the corresponding `TauriBackend` guards described below, at the desktop
backend layer). `listSeasons()`'s prior silent-overwrite compound bug (§3.0's
original text above) is closed at the root: with the throw now real, the
"unconditionally overwrite `library.json` with the reconciled empty result"
step never executes on a corrupt catalog — the caller sees a thrown error
instead. `TeamHubScreen.load()` already had a correct outer `try/catch`
converting any thrown `listSeasons()` error into a visible `status:'error'`
UI state (verified against source, not assumed); `WorkspaceShell.refreshHome()`
did NOT — it silently swallowed the error into an empty season list, which
would have rendered as "you have no seasons" on a genuinely corrupt catalog.
Fixed: `refreshHome()` now threads a `seasonsFailed` flag through to
`_renderSeasons()`, which renders a distinct, honestly-worded error state
("Seasons could not be loaded... this is a read failure, not an empty
library... do not create a new season yet") instead of the ordinary
zero-seasons empty state. The quick-switch popover's own separate
`listSeasons().catch(()=>[])` swallow site was deliberately left alone — it is
a secondary, lower-stakes surface (a dropdown "Other seasons" list) where the
primary Team Hub/Home surfaces above it already surface the real failure
loudly; disclosed here rather than silently left unaudited.

**Removing JSON as a live read/write authority (Invariant #5), completed at
every identity-sensitive boundary — every method re-verified against source,
not assumed from the pattern of the first one fixed:**

| Method | Before | After |
|---|---|---|
| `CatalogPersistence.saveSeason` | wrote db + `season.json` + Documents mirror, gated on db success | writes db + Documents mirror ONLY — `writeJson` call deleted entirely |
| `CatalogPersistence.reconcileFallbacks` | rewrote `season.json` for every season | rewrites the Documents mirror for every season only |
| `CatalogPersistence.loadSeason` | fell back to reading `season.json` and silently re-migrated it into the db on a missing db row | db-only; a missing row returns `null` — genuinely unavailable, never resurrected from a stale sidecar |
| `_catalogFs()` (the injected fs adapter) | exposed `writeJson` | `writeJson` removed from the interface entirely — `readJson` survives ONLY for `migrateJsonSeasons()`'s one-time legacy bootstrap read |
| `TauriBackend.loadSeason`/`peekSeason` | fell back to reading `season.json` directly when `catalogOnDisk && !cp` | throw unconditionally on any `!cp` (catalog genuinely unavailable for ANY reason, not just "a db file exists but won't open") — no JSON read fallback |
| `TauriBackend.saveSeason` | fell back to writing `season.json` directly on `!cp` | returns `false` unconditionally on `!cp` — no JSON write fallback |
| `TauriBackend.deleteSeason`/`touchOpened` | `catalogOnDisk && !cp` guard (a catalog that never got the chance to have a db file yet could silently proceed) | unconditional `!cp` guard — fails closed the moment the catalog itself cannot be opened, regardless of whether a db file exists yet |
| `TauriBackend.createBackup` | fell back to writing a NEW legacy `season_<ts>.json` restore-point file when `!cp` | returns `null` unconditionally on `!cp` — no new legacy-format file is ever created as a fallback. `listBackups`/`getBackup`/`deleteBackup` deliberately keep reading PRE-EXISTING legacy restore-point files by id-shape routing (a genuinely different identifier namespace, not the same authority competing with the catalog) — this is a considered, disclosed exception, not an oversight |
| `TauriBackend.listSeasons` | `catalogOnDisk && !cp` guard, plus an unconditional automatic `_recoverFromMirror()` call whenever `library.json` was empty | unconditional `!cp` guard; the automatic mirror-recovery call is REMOVED entirely (see the Invariant #6 section below) |

**Fail-closed proof, at both layers.** `tools/e2e-catalog-persistence.mjs`
(60 assertions, was 56) proves the `CatalogPersistence` layer directly,
including a new structural proof (`anyJsonWriteEverSeen`) that `fs.writeJson`
is never called across the entire run of every scenario in the file, not just
spot-checked per assertion. `tools/e2e-catalog-backend.mjs` (19 assertions,
was 12) adds a new section 5 proving the `TauriBackend` layer specifically:
with `_loadSqlEngine` forced to genuinely fail (not merely bypassed via a
test's own `be._catalog` injection, as every prior section in that file does),
`loadSeason`/`peekSeason` throw, `saveSeason`/`deleteSeason`/`touchOpened`
return `false`, `createBackup` returns `null`, and — the decisive structural
check — zero `writeTextFile`/`writeFile` calls happen across all six
operations, proving no sidecar write fires as a substitute authority. Both
new production fixes (the `_ensureLoaded` corrupt-bytes throw, and the removed
json-fallback-and-self-heal in `loadSeason`) were independently
mutation-verified: reverting each in isolation reproduces the exact original
symptom and reds exactly the assertion(s) built to catch it, confirmed via
`git diff`-equivalent restoration and a clean rerun afterward.

`tools/pc-adversarial-matrix.mjs` section 2 ("SQLite is corrupt, locked, or
unavailable: visible failure, no fallback authority") is promoted from
`[TARGET, checkpoint: PC-2]` to `[LOCK, closed PC-2]`, now **79/79 locks
green**. Its second assertion is retargeted from checking a `season.json`
fallback (which no longer exists) to checking the Documents-mirror recovery
snapshot instead — the underlying claim ("the real season is never reported
as absent while an intact recovery copy exists") is preserved, just pointed
at the surviving sidecar. Section 3b's "a SUCCESSFUL canonical save still
writes json + mirror" assertion is corrected to "writes the mirror only —
season.json is never written," matching the new contract exactly. The two
pre-existing `[TARGET]` legacy-version-scope assertions (§2's "version
history" row above) remain deliberately untouched and red — out of scope for
this checkpoint, unrelated to SQLite authority or recovery snapshots.

### §2 "recovery" row — CLOSED. The automatic mirror-import is replaced by an
### explicit, previewed, confirmed, identity-checked flow (Invariant #6).

`TauriBackend._recoverFromMirror()`'s automatic call inside `listSeasons()`
(triggered merely because `library.json` was empty) is **removed entirely** —
exactly the "never auto-import merely because app data appears empty" pattern
Invariant #6 forbids. It is replaced by two new explicit, coach-triggered
methods, both threaded through `SeasonStore`/`StorageManager` with the same
thin-delegation shape every other backend capability already uses:

- **`scanRecoverableSeasons()`** (step 1, the preview) — reads every
  Documents-mirror snapshot, validates each through the new
  `SnapshotEnvelope.unwrap()` contract (below), and returns preview records
  only. **Writes nothing** — no catalog write, no `library.json` write, no
  season import. A legacy pre-envelope bare `season.json` mirror file is
  reported as `valid:false, reason:'legacy-unenveloped'` with its raw data
  attached (visible, not silently invisible) rather than either accepted
  unconditionally or hidden from the list entirely.
- **`recoverSeasonFromMirror(id, { confirmOverwrite })`** (step 2, the
  confirmed import) — re-reads and re-validates the ONE candidate at the
  point of action (never trusts a cached scan result as authorization by
  itself), then imports it through the SAME canonical `saveSeason()` write
  path every other write uses, so destination/payload identity agreement and
  atomicity apply unchanged. Refuses a season id that already exists live
  UNLESS the caller explicitly passes `confirmOverwrite:true` — a flag that
  may only be set after the coach has seen and agreed to the exact conflict a
  UI previewed.

**Coach-facing UI, built and end-to-end tested, not just a backend API with no
way to trigger it.** Team Hub gains a "Recover seasons" command
(`data-native-hub-recover`), visible only when the active backend genuinely
supports the flow (`SeasonStore.canRecoverSeasons()`, mirroring the existing
`canOpenDataDir()` capability-check pattern — absent on `BrowserBackend`,
present on `TauriBackend`). Clicking it fetches the scan ONCE and hands the
result to a dialog (`RecoverSeasonsForm` in `js/native-team-hub.jsx`) that
renders every candidate as its own row with name/team/counts/timestamp and an
honest validity state; an invalid candidate's Recover control is disabled; a
candidate that already exists in the live catalog requires an explicit
second-click "Overwrite and recover" confirmation naming the conflict before
anything is imported; a genuinely empty scan shows a plain-language message
naming what was searched, never a blank dialog. `tools/e2e-native-mirror-recovery.mjs`
(new, 11/11) drives this through real clicks in a real browser: the button is
proven genuinely absent (not hidden) on `BrowserBackend`; appears once a
desktop-shaped backend is injected; the empty-scan message renders; three
real candidates (valid, conflicting, invalid) render as distinct rows; the
invalid candidate's control is disabled; the valid candidate recovers on one
click with no overwrite flag; the conflicting candidate is proven to NOT call
`recoverSeasonFromMirror` on the first click (only after the explicit
overwrite confirmation, with `confirmOverwrite:true` proven present on that
second call specifically); and the recovered season is proven to actually
appear in Team Hub's live season list afterward, not just a UI status flag.
The overwrite-confirmation gate was independently mutation-verified: removing
it collapses the "Overwrite and recover" UI step entirely and the test times
out waiting for text that would then never appear — a hard, unambiguous
failure signature, not a soft assertion mismatch.

### Versioned snapshot envelope (the PC-3 checkpoint's other explicit
### requirement: "season id, revision, timestamp, game/play counts, and
### checksum")

New `js/snapshot-envelope.js` (`SnapshotEnvelope`), pure and DOM-free, zero
external dependencies (this codebase's standing "no external libraries"
rule) — a dependency-free two-lane FNV-1a checksum over a deterministic
(key-order-independent) stringify. `wrap(seasonId, data)` produces
`{envelopeVersion, seasonId, revision, timestamp, gameCount, playCount,
checksum, data}`; `unwrap(raw)` validates every declared field against the
enclosed data and returns `{ok:true, envelope}` only when identity, counts,
AND checksum all agree, or `{ok:false, reason}` naming exactly which check
failed (`not-an-object` / `legacy-unenveloped` / `unsupported-version` /
`malformed` / `count-mismatch` / `identity-mismatch` / `checksum-mismatch`) —
never throws on any input, malformed or otherwise. `revision` defaults to the
season's own `updated` timestamp; it is explicitly documented as a RECENCY
MARKER for the recovery preview to compare against, not the strict
per-write monotonic counter PC-4's revision-fenced-autosave work introduces —
that remains out of this checkpoint's scope, as the plan requires.

Wired into `TauriBackend._mirrorToDocuments()` — both the live mirror file and
the timestamped backup-snapshot file are now written in the envelope format,
generated only after a successful canonical (SQLite) commit, exactly matching
"generate it only after a successful SQLite commit or explicit export."
`tools/e2e-snapshot-envelope.mjs` (new, 21/21, pure Node) proves: a
well-formed wrap; a genuine round-trip through `JSON.stringify`/`parse`
validates `ok:true`; tampered content is caught by checksum mismatch; a lied
declared count is caught independent of the checksum; an identity mismatch
(`envelope.seasonId` disagreeing with `data.id`) is caught independent of the
checksum; a bare legacy pre-envelope `season.json` is recognized (not
silently accepted, not silently invisible); garbage input of every shape
never throws; an unsupported future envelope version is refused; a malformed
envelope missing required fields is refused; the checksum is genuinely
key-order-independent AND content-sensitive (two different seasons never
collide, and a single deep-field change moves the checksum). The
checksum/identity validation logic was independently mutation-verified:
disabling both checks reproduces exactly two false-positive `ok:true` results
on tampered/mismatched input, reddening exactly the two assertions built to
catch that class.

### Explicitly disclosed, not silently left for later

- **The quick-switch popover's `listSeasons().catch(()=>[])` swallow site**
  (`workspace-shell.js`, the "Other seasons" quick-switch menu) is left
  unchanged — a secondary, lower-stakes UI surface where the primary Home/Team
  Hub error states already surface a genuine catalog failure loudly.
- **`createSeason()`'s own direct `library.json` write** (allocating a fresh
  season id + meta stub, before any body data exists) was NOT changed in this
  checkpoint. It is narrow in scope (id/meta allocation only, reconciled
  against catalog truth on the very next `listSeasons()` call) and touching it
  risks a larger blast radius than this checkpoint's stated scope covers —
  disclosed as a considered non-change, not an oversight.
- **PC-4's revision-fenced autosave staleness rejection remains fully out of
  scope.** The envelope's `revision` field is a recency marker for recovery
  comparison only, explicitly not the strict per-write monotonic counter that
  checkpoint introduces.
- **The film-storage layout is unchanged.** No film path, film file, or
  managed-copy behavior was touched by this checkpoint, per the plan's
  Invariant #8 and "Out Of Scope" section.
