# GridIron IQ — Desktop Persistence Inventory (PC-0)

**Status:** PC-0 deliverable — inventory + failing-first contracts only. **No
production behavior was changed to produce this document.** Every finding
below is a read of the source as it exists on `claude/football-film-analyzer-GRiCW`
at commit `037b53d` (the plan's application baseline for this checkpoint).

**Companion test file:** `tools/pc-adversarial-matrix.mjs` — a standalone Node
harness (NOT part of `tools/e2e-*.mjs`, and therefore not swept into
`tools/run-gate.sh` or CI) that encodes the ten adversarial-matrix scenarios
from `GRIDIRON-IQ-PERSISTENCE-CONVERGENCE-PLAN.md`. Some of its assertions are
**intentionally red today** — that is the point of "failing-first": they
describe the invariant-compliant target behavior, fail against current code
where a real gap exists, and are expected to turn green checkpoint by
checkpoint (PC-1 through PC-4). Run it with `node tools/pc-adversarial-matrix.mjs`.
Its own result line reports pass/fail counts per item, not a single gate
verdict — read the per-item output, don't just check the exit code.

---

## 1. Every mutable "current season" pointer in the codebase

The plan's Invariant #3 ("No mutable global current-season pointer may choose
a write destination") first requires knowing how many such pointers exist.
There are **four**, not one, and they are kept in sync only by calling
convention, never by construction:

| Pointer | Lives on | Set by | Read by |
|---|---|---|---|
| `SeasonStore.currentSeasonId` | `js/season-store.js:32` | `openSeason`/`createSeason`/`deleteSeason`/`closeSeason` | `commitActive`, `_autoSave`, `_maybeSnapshot`, `_flushDeferredSnapshot`, `isDemoSeason`, `undoRemoveGame`, version-manager `_key()` |
| `StorageBackend.currentId` (base class field, used by both `BrowserBackend` and `TauriBackend`) | `js/storage-backend.js:35` | `setCurrentSeason(id)` — called once per season transition from `SeasonStore` | every canonical/backup/film method on the backend that doesn't take an explicit id (`loadSeason`, `saveSeason`, `createBackup`, `listBackups`, `getBackup`, `deleteBackup`, `_filmsDir`, `importFilm`, `filmUrl`, `deleteFilm`, `managedGameDir`, `listFilmFiles`) |
| `SqlCatalog.currentId` | `js/sql-catalog.js:34` | `setCurrentSeason(id)` — called by `CatalogPersistence` immediately before each backup/version op, and internally as a fallback inside `saveSeason`/`loadSeason` | `createBackup`, `listBackups`, `_pruneBackups`, `deleteSeason` (only to null itself out) |
| `CatalogPersistence` has **no pointer of its own** — it always threads an explicit `id`/`seasonId` parameter into every method. This is the correct shape; see §3. | — | — | — |

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

### 3.1 — `SeasonStore.adopt()` does not reassign the imported payload's id, so importing a season file is silently rejected by the desktop save guard

`StorageManager.loadProject(file)` (`js/storage.js:1257`), on a season-shaped
file (`Array.isArray(parsed.games)`):

```js
if (!this.seasonStore.hasCurrent()) {
  await this.seasonStore.createSeason({ name: ..., teamId: ... });   // allocates a FRESH id
}
this.seasonStore.adopt(parsed);   // parsed still carries its ORIGINAL id
```

`SeasonStore.adopt(parsed)` (`js/season-store.js:678`):

```js
adopt(parsed) {
  if (parsed && Array.isArray(parsed.games)) this.data = this._normalize(parsed);
  ...
  this.persist();
}
```

`_normalize()` never touches `d.id`. So after `adopt()`, `this.data.id` is
whatever id the *imported file* originally carried — not the id
`createSeason()` just allocated (or the id of whatever season was already
open, in the far more common case of importing while a season is active).

`persist()` calls `this.backend.saveSeason(this.data)`. On desktop,
`TauriBackend.saveSeason` is:

```js
if (!data || (data.id && String(data.id) !== String(this.currentId))) {
  console.error('Blocked cross-season save', ...);
  return false;
}
```

`data.id` (the imported file's original id) almost never equals
`this.currentId` (the destination season). **The save is rejected — zero
writes — and the coach sees a misleading toast** (`onPersistError` fires:
"⚠ Save failed — browser storage may be full."), which is the wrong
diagnosis for what actually happened. The import UI proceeds to
`_clearForNewGame(); _loadActiveGame();` regardless, so the season *looks*
imported in the running app but was never durably saved.

This is exactly the behavior Invariant #2 asks for at the storage-backend
layer (destination/payload mismatch → zero writes) — the guard is doing its
job correctly. The bug is one layer up: nothing in the import path reassigns
the payload's identity to the destination before calling `persist()`. This is
squarely PC-1 scope ("Explicit Identity API... validate destination/payload...
identity together") and is recorded here as a real, reproducible defect, not
a hypothetical.

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

### 3.3 — Backup and version reads/deletes have no season/game ownership check, at both storage layers

Confirmed independently in both backends:

- `BrowserBackend.getBackup(id)` / `deleteBackup(id)` (`js/storage-backend.js:323-327`) —
  IndexedDB lookups by bare `id`, no `record.seasonId === this.currentId` check.
- `SqlCatalog.getBackup(id)` / `deleteBackup(id)` (`js/sql-catalog.js:370-371`) —
  `WHERE id = ?` with no `season_id` predicate.
- `SqlCatalog.getVersion(id)` / `deleteVersion(id)` (`js/sql-catalog.js:399-400`) —
  same shape, no `season_id`/`game_id` predicate. Currently unreachable (no
  caller), but part of the surface PC-2 wires up.

Backup/version ids are globally unique (monotonic timestamps or generated
tokens), so today this is only exploitable if a caller supplies an id that
was **listed under a different season than the one currently scoped** — which
requires either a stale UI reference (season switched between listing and
clicking) or a caller bug. `SeasonStore.restoreBackup(id)` inherits whichever
of these two backends is active, with no additional check of its own.
`CatalogPersistence.getBackup(id, backupId)`/`deleteBackup(id, backupId)`
call `this.catalog.setCurrentSeason(id)` immediately before delegating to
`SqlCatalog.getBackup(backupId)`/`deleteBackup(backupId)` — but since those
two `SqlCatalog` methods never consult `this.currentId`, that call is a
no-op for exactly the two operations where it would matter most.

This is the concrete, currently-real instance of the adversarial matrix's
"Backup, restore, or import carries the wrong id: rejected before mutation."
Today it is accepted, not rejected.

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
