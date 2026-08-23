# GridIron IQ — Desktop Persistence Inventory (PC-0)

> **Current milestone status (2026-08-22):** PC-0 through PC-4 are accepted.
> The final PC-4 shutdown-drain repair is `b934f9d`; Codex independently
> verified 104/104 persistence locks and 33/33 revision-fence assertions.
> PC-5 (forensic backup, real two-season dry-run, permission-gated legacy-data
> handling, installer, and installed smoke) is open. This document retains the
> original PC-0 inventory below as the historical baseline.

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

### 3.2 — CLOSED, PC-4 — revision fencing and dispatch-ordered writes for two overlapping saves to the *same* season

**Closed by PC-4. Both halves were reproduced concretely first** (see §7 below
for the full account), which matters because the original text below recorded
this as "not yet reproduced as a concrete field symptom." It is now:

- two overlapping `persist()` calls for one season completed OUT OF ORDER, so
  the chronologically-earlier payload landed last — observed durable write order
  `[2 plays, 1 play]`, i.e. the coach's second edit was durably lost while memory
  still showed it;
- a `persist()` dispatched BEFORE a restore landed AFTER it — observed order
  `[1 play (restore), 3 plays (pre-restore)]`, i.e. the restore silently un-did
  itself on the next reload while memory showed it had worked.

The original text is retained below as the PC-0 record.

---

### 3.2 (original PC-0 text) — No revision fencing for two overlapping saves to the *same* season

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

*(Superseded: the design decision was taken in PC-4 — a monotonic
`data.revision` plus per-season dispatch-ordered writes. §7 records it, and the
contract now lives in `tools/e2e-revision-fence.mjs` and matrix section 13.)*

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

### §6a — PC-2+PC-3 repair (Codex review `89e34c6`): four fail-open gaps
### closed, all four independently verified against source before being fixed

Codex's review of the `3b70fab` checkpoint found four narrow but real
fail-open paths untested by the checkpoint's own suites. All four verified
against source, reproduced by mutation before being fixed, and closed in one
repair pass — no product/schema/season data change.

**1. [P0, CLOSED] A locked/permission-denied EXISTING catalog still looked
like a fresh install.** `TauriBackend._catalogFs().readDb()` routed its
existence check through the shared `_exists()` helper, which swallows ANY
error (permission denial, a locked file, a transient disk fault) into
`false` — collapsing "the db is genuinely there but I can't tell" into "there
is no db." `CatalogPersistence._ensureLoaded()` then independently wrapped
`this.fs.readDb()` in its own `try/catch`, converting even a propagated
failure back into `bytes = null`. Together, an existing-but-unreadable db
never reached `catalog.open(bytes)` at all — it took the clean-open branch
and reported "no seasons" with no exception, exactly the class Sec 3.0
closed one layer later, reopened one layer earlier. Fixed at both layers:
`readDb()` now calls `this.fs.exists()` directly (bypassing the swallowing
helper) and returns `null` ONLY for a confirmed-absent file, letting any
other failure — including the existence check itself failing — propagate;
`_ensureLoaded()` no longer wraps that call in its own `try/catch`, so a
real failure now reaches every caller exactly as `_ensureLoaded()`'s own
existing callers (all of which already run unguarded) expect. **Mutation-
verified:** reverting `_ensureLoaded()`'s try/catch reproduces the exact
original defect and reds only the new "db read failure on a genuinely-
existing db surfaces a VISIBLE failure" assertion in
`tools/e2e-catalog-persistence.mjs` (section 4b); restored, green.

**2. [P1, CLOSED] Recovery identity was not bound to the folder it was found
in.** `SnapshotEnvelope.unwrap()` only proves an envelope is internally
self-consistent — its own `seasonId`, `data.id`, and checksum all agree with
EACH OTHER — it has no idea what mirror folder it was read from. A season-A
snapshot copied or renamed into season-B's mirror directory still unwraps
`ok:true` (a valid checksum proves the content wasn't tampered with, not that
this folder is allowed to become that content). Both `scanRecoverableSeasons()`
(the preview) and `recoverSeasonFromMirror()` (the point-of-action import)
previously trusted the requesting folder id unconditionally —
`recoverSeasonFromMirror` went as far as `data.id = id;`, overwriting the
snapshot's own validated identity to match whatever folder it happened to be
found under, AFTER that identity had already been checked and found valid
for a DIFFERENT id. Fixed with an explicit binding check in both methods:
`String(envelope.seasonId) !== String(id)` is now refused with a distinct
`'folder-identity-mismatch'` reason at BOTH the scan-preview layer and the
recovery-action layer independently (defense in depth — proven by mutating
each check separately and confirming the OTHER still catches it). The
`data.id = id` reassignment now only ever applies to the disclosed
legacy-unenveloped fallback, never to a validated envelope, whose identity is
never overridden. **Mutation-verified independently at both layers:**
disabling the scan-side check reproduces `valid:true` for the mismatched
folder while the point-of-action check still refuses it (defense-in-depth
confirmed real, not decorative); disabling the point-of-action check alone
reproduces a successful import of season A's content under season B's
identity (`{"ok":true,"id":"s-B",...}`), reding exactly the two assertions
built to catch it in `tools/e2e-catalog-backend.mjs` (section 6); both
restored, green.

**3. [P1, CLOSED] A failed conflict check defaulted to "no conflict."**
`recoverSeasonFromMirror()`'s existence check
(`cp.listSeasons().some(...)`) left `exists` at its initial `false` on a
`try/catch` swallow — so if the catalog could not confirm whether the
destination season already existed (a transient read failure, not "genuinely
absent"), the code silently proceeded as though it were safe, bypassing the
required `confirmOverwrite` gate entirely and saving straight over whatever
might already be there. Fixed to fail closed: an existence-check failure now
returns `{ok:false, reason:'exists-check-failed'}` before any write is
attempted, rather than guessing safe. **Mutation-verified:** reverting to the
swallow-to-false default reproduces the exact defect — a `listSeasons()`
throw resulting in `{"ok":true,"id":"s-D",...}` with the fake catalog's
`saveSeason` genuinely invoked — reding exactly the one assertion built to
catch it in `tools/e2e-catalog-backend.mjs` (section 7); restored, green.

**4. [P1, CLOSED] An unverified legacy snapshot stayed one-click
importable.** A `legacy-unenveloped` candidate (a bare pre-PC-3
`season.json` with no checksum, no validated identity, no count check at
all — `unwrap()` reports it `valid:false` for exactly that reason) was
labeled "Legacy backup (unverified)" in the Team Hub recovery UI, but its
Recover control stayed ENABLED — only the label disclosed the difference, and
the backend imported its raw contents with zero integrity verification the
moment it was clicked. `RecoverCandidate`'s `disabled` computation is now
`!candidate.valid` unconditionally (was
`!candidate.valid && candidate.reason !== 'legacy-unenveloped'`), so every
genuinely-invalid candidate is disabled, legacy included. It remains VISIBLE
— the coach can still see the file exists, rather than it silently
disappearing — with an explanatory `title` hint on the disabled control
("This backup predates checksum verification and cannot be recovered
automatically yet."), matching this project's standing "never leave a
disabled control unexplained" discipline. Genuine legacy migration remains
future, permissioned work (a separate checkpoint), not a casual one-click
import path. **Mutation-verified:** reverting the `disabled` computation
reproduces the exact original defect (`legacyDisabled:false`,
`legacyHint:""`) and reds exactly the two assertions built to catch it in
`tools/e2e-native-mirror-recovery.mjs` (section 4b); restored, green.

**Verification.** `node tools/pc-adversarial-matrix.mjs` — 79/79 locks
green, 0/2 targets green (2 unchanged, pre-existing, disclosed out-of-scope
items), exit 0 — unchanged from the accepted PC-2+PC-3 checkpoint.
`node tools/e2e-catalog-persistence.mjs` — 62/62 (was 60; +2, section 4b).
`node tools/e2e-catalog-backend.mjs` — 24/24 (was 19; +5, sections 6-7).
`node tools/e2e-native-mirror-recovery.mjs` — 15/15 (was 11; +4, section
4b). `node tools/e2e-snapshot-envelope.mjs` — 21/21, unchanged.
`node tools/e2e-catalog-fuzzer.mjs` — 640 ops clean, unchanged. Full
canonical gate (`bash tools/run-gate.sh`): 90 harnesses green, 0 skipped, 0
failed, same count as the accepted checkpoint — zero harnesses dropped or
added, every fix landed inside the existing four files this checkpoint
already owned plus one new global-bridge export.

No film path, film file, season/game/play data, schema, or unrelated file
touched. No installer, package, tag, or release.

### §6b — PC-2+PC-3 re-review (Codex `d206b58`): the final recovery-boundary
### finding closed — production rejection, not just a disabled button

Codex's independent re-review of `5918645` (§6a's repair) accepted three of
the four findings — unreadable-catalog propagation, folder-identity binding,
and fail-closed conflict checking, all confirmed still correct — and found
one P1 that survived the repair: **§6a's finding 4 was fixed at the UI layer
only.** `RecoverCandidate`'s disabled computation genuinely stops the Team
Hub button, but `TauriBackend.recoverSeasonFromMirror()` itself — the actual
production persistence boundary — still explicitly accepted the disclosed
`legacy-unenveloped` unwrap result and proceeded through catalog lookup and
save: `const data = result.ok ? result.envelope.data : (result.reason ===
'legacy-unenveloped' ? result.data : null); ... if (!result.ok) data.id =
id;`. The new UI test's mock backend masked this — it independently
reimplements a STRICTER `!candidate.valid` refusal than the real method, and
carried a comment claiming "the real backend no longer special-cases legacy
input" that was false against the committed bytes. A future caller of
`recoverSeasonFromMirror()` — a different UI, a script, a mistake — could
still import a bare, unverified snapshot with zero integrity check, leaving
the API itself fail-open even though the one shipped UI path happened to be
gated.

**Verified against source before fixing, per standing discipline:** read
`recoverSeasonFromMirror()` directly and confirmed both halves of the
finding exactly as described — the `legacy-unenveloped` branch on the ternary,
and the `data.id = id` stamping conditioned on `!result.ok`. Confirmed the
mock's comment made an unverified claim about the real backend.

**Fixed at the root.** `recoverSeasonFromMirror()` now refuses on
`if (!result.ok) return { ok: false, reason: result.reason };` immediately
after the folder-identity check, BEFORE `_ensureCatalog()` or any catalog
read/write — covering every unwrap failure reason uniformly, including
`legacy-unenveloped`, not as a special case but as the same refusal every
other invalid envelope already got. The now-unreachable
`data.id = id` legacy-stamping branch is deleted entirely rather than left
as dead code, since a validated envelope's identity was already provably
`=== id` by the two checks preceding it (`unwrap()`'s own
`envelope.seasonId === data.id`, plus the folder-identity check added in
§6a) — there is no longer a code path where identity reassignment could ever
matter. The UI mock's comment is corrected to state what is now true and
independently verified: the mock now genuinely mirrors the real, hardened
contract, and the production claim is proven directly against the real
backend, not assumed from the mock's own behavior.

**New direct production-backend assertion** (the exact proof Codex asked
for): `tools/e2e-catalog-backend.mjs` section 8 constructs a real
`TauriBackend` against a bare pre-PC-3 `season.json` (no `envelopeVersion`,
no checksum — genuinely `legacy-unenveloped`) and calls
`recoverSeasonFromMirror()` directly, asserting `{ok:false,
reason:'legacy-unenveloped'}` AND that the fake catalog's `saveSeason` was
never invoked at all — zero writes, not merely a failed write. **Mutation-
verified:** reverting to the old ternary + stamping reproduces the exact
original defect (`{"ok":true,"id":"s-E","gameCount":1,"playCount":2}`,
`saveCalled:true`) and reds exactly this one new assertion, with every other
assertion in the file — including the folder-identity-match positive control
from §6a, proving the fix didn't disable recovery generally — staying green;
restored, green.

**Verification.** `node tools/e2e-catalog-backend.mjs` — 25/25 (was 24; +1,
section 8). `node tools/e2e-native-mirror-recovery.mjs` — 15/15, unchanged
(the mock's behavior was already correct; only its comment changed).
`node tools/e2e-catalog-persistence.mjs` — 62/62, unchanged.
`node tools/e2e-catalog-fuzzer.mjs` — 640 ops clean, unchanged.
`node tools/pc-adversarial-matrix.mjs` — 79/79 locks green, 0/2 targets
green, unchanged. Full canonical gate (`bash tools/run-gate.sh`): 90
harnesses green, 0 skipped, 0 failed — same count as both the accepted
checkpoint and §6a's repair, zero harnesses dropped or added.

No film path, film file, season/game/play data, schema, or unrelated file
touched. No installer, package, tag, or release.

---

## 7. PC-4 checkpoint — Revision-Fenced Autosave And Lifecycle Audit (2026-08-22)

> **CODEX REVIEW — CHANGES REQUESTED (`33b8af1`, 2026-08-22).** The queue is
> correct for `persist()` callers, but PC-4 is not complete: `snapshot()` →
> desktop `writeDisk()` → `saveSeason()` bypasses it and was directly reproduced
> overwriting a newer edit; `deleteSeason()` races an already-running save and
> was directly reproduced resurrecting the deleted season; desktop
> `beforeunload` cannot await SQLite, so §3.4 remains open; and `saveNow()`
> continues into backup work after its first canonical save fails. The complete
> independent findings and required proofs are at the top of `CLAUDE.md`. PC-5
> remains blocked.
Closes §3.2 (the last open PC-0 finding) and §3.4, and audits the lifecycle
paths PC-4's scope names. Implements Invariant #7: *"Delayed autosaves carry a
captured season id and revision. A season switch or newer revision makes the
delayed save stale and it must fail closed."*

### Both §3.2 halves reproduced FIRST, against the committed classes

§3.2 was recorded at PC-0 as *"structurally real but not yet reproduced as a
concrete field symptom."* Before any code was written, a probe drove the real
`SeasonStore` and reproduced both, exactly as predicted:

| Scenario | Durable write order observed | Coach-visible effect |
|---|---|---|
| Two overlapping `persist()` calls for one season, earlier completing last | `[2 plays, 1 play]` | the second edit is durably lost while memory still shows it |
| A `persist()` dispatched before a restore, landing after it | `[1 play (restore), 3 plays (pre-restore)]` | the restore silently un-does itself on the next reload |

Every fence built before PC-4 (PC-1's captured-destination checks, §3.1c/3.1e)
guards against a **season switch** landing mid-flight. Neither of these involves
a season switch — the season never changes — so none of them could catch either.

### The two mechanisms

**1. Dispatch-ordered writes, per season (`SeasonStore._enqueueWrite`).** Durable
body writes for one season run strictly in dispatch order, so an earlier payload
can never land after a later one. Chaining is keyed by season id, so an unrelated
season is never blocked, and the next write runs whether the previous resolved or
rejected — a failed write must not strand the queue.

Critically, an **uncontended** write still starts SYNCHRONOUSLY. `persist()` has
always had the property that a fire-and-forget call has begun its write by the
time it returns, and callers depend on it. Deferring every write to a microtask
silently broke that; see "what the fuzzer caught" below.

**2. A monotonic `data.revision` (additive, persisted).** `_empty()` starts at 0;
`_normalize()` defaults a missing key to 0 and refuses a hostile value
(negative, fractional, string, `NaN`, `Infinity`, object) rather than trusting a
number so high that every later legitimate save would look stale forever.

The next revision is `max(payload's own revision, newest dispatched for this
season) + 1` — never the payload alone. That distinction is what keeps **restore**
safe: a restored backup carries its ORIGINAL low revision, so basing off the
payload would stamp a number BELOW the live season's and make the restore itself
look stale to every later fence. Taking the max makes a restore correctly a *new,
newer commit of older content*. `_seedRevision()` seeds the sequence from durable
state on `load()`/`openSeason()`, so a fresh session continues the persisted
sequence instead of restarting at 1.

The revision fences the one piece of delayed work that carries a **frozen**
payload — the 2.5s Documents-mirror write. An autosave re-reads live state at
fire time and is therefore never stale in content, so it is deliberately NOT
revision-fenced; fencing it would skip legitimate saves. The mirror write is
different: writing a superseded frozen copy would move the recovery snapshot
BACKWARD relative to the canonical row, which is exactly what PC-3's recovery
preview relies on never happening.

### Lifecycle audit

| Path | Finding | Resolution |
|---|---|---|
| **backup/restore** | `StorageManager.restoreBackup()` never cancelled pending saves. A restore is an explicit decision to DISCARD the current state, but the 1s autosave timer could fire during the restore's own awaits and run `commitActive()`, stamping the live tagger's PRE-restore plays into the freshly-restored season. The `_loadedGameId` guard does not catch it: a restore of the same season normally keeps the same active game id, so its equality check passes | `_cancelPendingSaves()` at the top of `restoreBackup()` |
| **shutdown (§3.4)** | Confirmed still open — no `beforeunload`, `pagehide`, or Tauri close handler existed anywhere in `js/`. A coach closing within ~1s of their last edit lost that edit's canonical write | new `StorageManager.flushPendingSaves()`, wired to `beforeunload` |
| **explicit save** | `saveNow()` called `backend.saveSeason` directly, bypassing `persist()` and therefore any ordering with an in-flight autosave — §3.2's FIRST named scenario | routed through the same per-season queue |
| **season/game/team switch** | Already correct (PC-1 §3.1c/3.1e); re-verified unchanged | no change |
| **import** | `adopt()` persists through `persist()`, so it inherits the ordering fence automatically | no change |
| **delete** | A durably-deleted season now drops its write queue and revision sequence, so a recreated id starts fresh rather than inheriting a ghost high-water mark | `deleteSeason()` cleanup |
| **Team Hub** | Reads only (`listSeasons`/`peekSeason`); no write path to fence | no change |
| **commit (identity mirroring)** | `commitActive()` mirrored `roster` and `playbook` into the season UNCONDITIONALLY, so an EMPTY live value overwrote a populated saved one. Those copies exist so `TeamRegistry.recoverFromWipe()` can rebuild a wiped install — clobbering them destroys the very source recovery reads. `teamProfile` has had an "only adopt a real identity" guard for exactly this reason since long before PC-4; roster and playbook never did | the same guard extended to both |

**The `commitActive()` finding is pre-existing, not introduced by PC-4** — any
`_commitAndPersist()` after a "Switch team" (which empties the profile) could
already do it. PC-4's shutdown flush made it reachable at a new moment, which is
how it surfaced: with a pending autosave armed, a shutdown after those
localStorage keys went missing persisted `roster:[]` and
`playbook:{calls:[]}` over a season holding a real roster and a real play call,
and the next launch's recovery then found nothing to restore. The live objects
read the very localStorage keys a wipe removes, so *"live is empty"* does not
reliably mean *"the coach cleared it."*

**Disclosed trade-off, matching the `teamProfile` precedent exactly:** an empty
live roster/playbook is no longer mirrored over a populated saved one, so
clearing every player does not propagate into the season file through an
autosave. Losing a coach's saved roster silently is far worse than retaining one
they emptied, and the season's copy is a recovery mirror, not the live authority
(localStorage is). A positive control pins that a genuinely populated live
roster/playbook still mirrors, so the guard is not freezing these fields.

**Stated limitation on the shutdown flush, rather than implied.** It makes the
canonical write START synchronously. On the browser build that write is
synchronous localStorage, so it genuinely completes. On the desktop build the
SQLite write is async, so a close can still outrun it — fully closing that needs
Tauri's own `onCloseRequested` hook, which can defer the close until the write
resolves and which no headless harness can exercise. `flushPendingSaves()` is
deliberately the single seam that hook would await, so wiring it later is a
one-line change rather than a redesign. This follows the same discipline as the
PC-era decision not to ship unverifiable changes to the canonical write path.

### What the integrity fuzzer caught, which no focused test did

The first implementation deferred **every** write to a microtask. All focused
suites passed. `tools/e2e-integrity.mjs` then failed with **8 RELOAD violations
across 5 seeds**: `persist()` no longer started its backend write synchronously,
so a fire-and-forget `persist()` followed by an immediate backend read no longer
saw the write. Restoring the synchronous start for uncontended writes took it to
5; tightening the queue-drain to the same continuation that observes settlement
(rather than a chained `.then` one microtask later) took it to 2.

The residual 2 were genuine contention — a prior write legitimately in flight —
and exposed that the fuzzer's `reload` op fire-and-forgot its `persist()` and
then read the backend. That only ever worked because BrowserBackend's
localStorage write completes synchronously inside `persist()`; it was never true
of the Tauri/SQLite backend the app actually ships. The op's stated purpose is
persist→reload round-trip equality, and a round trip cannot be checked before the
write completes, so the op now **awaits** the persist. `persist()` still resolves
only after the durable write, so the guarantee the op exists to check is fully
preserved and now holds on BOTH backends rather than only the synchronous one.

**That correction was itself mutation-tested, because "make the failing check
await" is exactly the shape of weakening a test to fit a change.** Making
`_persistNow` silently drop half its writes produces **15 violations** on the
corrected op — it still catches a real persistence regression and is not vacuous.

A second defect was found while tracing this and fixed before commit: `saveNow()`
initially read `this.data` inside its queued callback rather than capturing the
reference at dispatch. A season switch landing between dispatch and run would
have written the NEW season's data into the OLD season's slot — reopening the
cross-season class PC-1 closed. It now captures the payload at dispatch, exactly
as `persist()`'s default parameter already does.

### PC-3's envelope placeholder closed

PC-3 built the snapshot envelope's `revision` field and filled it with a
wall-clock timestamp, disclosing that the real monotonic counter was PC-4's work.
`SnapshotEnvelope.wrap()` now stamps the real committed revision when present, so
a recovery candidate is compared to the live season by commit order rather than
by timestamp: two snapshots written in the same millisecond are still strictly
ordered, and a machine whose clock moved cannot make an older snapshot look
newer. The timestamp fallback is retained for a pre-PC-4 season, so every
envelope already on disk still wraps, validates, and recovers unchanged.

### Verification

`node tools/e2e-revision-fence.mjs` — **NEW, 31/31**: the revision field's
additive/hostile-value contract, dispatch ordering, the restore case, the
restore-revision formula, session continuation, explicit-save-vs-autosave
ordering, the delayed frozen-payload fence (with a positive control first, so
the negative case cannot pass on a callback that never writes), the envelope
wiring, delete cleanup, and a failed write not stranding the queue.
`node tools/pc-adversarial-matrix.mjs` — **85/85 locks green** (was 79; +6,
section 13), 0/2 targets green (the two pre-existing, disclosed, out-of-scope
legacy version methods, unchanged). `node tools/e2e-integrity.mjs` — 12 seeds ×
80 ops, **0 violations**. `node tools/e2e-catalog-persistence.mjs` — 63/63 (+1:
the revision survives a canonical SQLite save/reopen, which section 1's
round-trip check structurally cannot see, since it compares against a reference
SqlCatalog round trip and a field dropped by BOTH sides compares equal). Every
fix independently mutation-verified in isolation, each reproducing its exact
original symptom and reding only the assertion(s) built to catch it, restored
and reconfirmed green afterward.

### Two further defects the FULL GATE caught, which the focused suites did not

Both were found only by running the whole gate, and both are recorded because
they are the class this project's own history keeps warning about — a change
that looks correct in its own tests and breaks something two layers away.

1. **`e2e-wipe-recovery`** went red on *"team playbook restored from the newest
   season mirror"*. Diagnosed by probe rather than inspection: the seeded season
   blob was correct (playbook present, revision 2), but immediately after the
   reload it held revision 3 with an EMPTY playbook and roster — and no
   `ffa_season_*` write was captured during the recovery boot, which located the
   write in the *previous* page's `beforeunload`, i.e. PC-4's own new flush. That
   led to the pre-existing `commitActive()` empty-clobber above. **Baseline was
   established by stashing the whole checkpoint and re-running against the
   accepted HEAD (13/13 green), not against a commit of my own** — the failure
   was genuinely mine, not pre-existing.
2. **`e2e-operation-diff`** went red on *"game selection changes only the
   active-game pointer"*. Correct behavior, undeclared path: opening a game
   commits and persists the outgoing season, and a commit legitimately advances
   the commit counter. `revision` is now a **declared** path of that operation
   and additionally asserted to change, so it is a positive statement rather than
   a permission. It is deliberately NOT added to the route-navigation case, which
   still must change no season path at all — navigation writes nothing, so it must
   not advance the counter either, and that untouched assertion is what proves the
   counter tracks real commits rather than incidental activity.

No film path, film file, season/game/play data, schema version, migration, or
unrelated file touched. `data.revision` is additive and backward-compatible: a
season saved before PC-4 has no such key, normalizes to 0, and is unaffected. No
installer, package, tag, or release.

## 7a. PC-4 repair — every writeDisk/deleteSeason/saveNow call site genuinely
##     ordered (Codex review `618862c`, 2026-08-22)

Codex's independent re-review of the §7 checkpoint (`33b8af1`) found that the
per-season write queue built there was applied to `persist()` and `saveNow()`'s
own canonical half, but not to every OTHER call site that also reaches the
canonical `saveSeason` — either directly (`deleteSeason`) or through `writeDisk`,
which `TauriBackend.writeDisk()` implements as **a second, full canonical
`saveSeason` call** before its own mirror/backup work (confirmed by reading the
real method, not assumed — this makes the finding worse than "a mirror write can
race," since it is a second unfenced *commit* path). All four findings were
verified against source and reproduced directly with a purpose-built probe
against the real `SeasonStore`, per standing discipline, before any fix was
written.

**1. [P0, closed] `snapshot()` bypassed the write queue entirely.** It called
`backend.writeDisk(...)` directly. Reproduced: a snapshot capturing the season's
OLDER (1-play) state, held pending, could complete AFTER a genuinely newer
`persist()` (2-play) commit and silently revert it — `canonicalWrites` order
`[2, 1]` instead of `[1, 2]`. Two more call sites shared the identical shape and
were closed the same way, since they are the same bug class rather than separate
findings: `_scheduleDiskWrite()`'s deferred 2.5s timer callback (the Documents-
mirror write PC-1 already revision-fences for *staleness*, but never for
*ordering* against a concurrent write), and `bindDisk()`'s first-write-on-bind.
All three now route through `_enqueueWrite(seasonId, ...)` — not
`_dispatchWrite`, deliberately: each of these re-writes already-committed state,
none is itself a new commit, so none may bump `data.revision`.

**2. [P0, closed] `deleteSeason(id)` was not ordered against the write queue at
all.** `cancelPendingDiskWrite()` (already called first) only clears a
future-scheduled *timer*; it cannot cancel a write that has already started.
Reproduced: a `persist()` for season A held pending, `deleteSeason('A')` awaited
and completing durably, THEN the stale pending save landing and the season being
present again — `presentAfterDelete:false, presentAfterStaleSaveLands:true`.
Fixed by routing `backend.deleteSeason(id)` itself through
`_enqueueWrite(id, ...)`, so a delete now waits behind any write already
dispatched for that id and becomes genuinely the *last* write that can land for
a deleted season.

**3. [P1, closed] Shutdown flush could not genuinely await the desktop write.**
`flushPendingSaves()`'s own doc comment already disclosed this as a stated
limitation rather than a silent gap — Codex required it actually closed, not
merely documented. `_commitAndPersist()` now returns its `persist()` promise
chain (every existing caller already ignored the return value, confirmed by
grep, so this is additive); `flushPendingSaves()` returns that chain instead of
a synchronous `true` the instant the write *starts*. A new
`StorageManager._wireDesktopCloseFlush()` (called from `enableAutoSave()`,
no-op on the browser build) uses Tauri's own `onCloseRequested` hook — reachable
with no Rust/capabilities change, since `tauri.conf.json` already sets
`withGlobalTauri:true` and `src-tauri/capabilities/default.json` already grants
`core:window:default`/`core:window:allow-close` — to defer the close
(`event.preventDefault()`, called synchronously before any await, per Tauri's
own documented idiom), await the flush, then explicitly `destroy()` the window.
Every step is defensively guarded; a failure inside this method must never block
a real close.

**4. [P1, closed] `saveNow()` discarded the canonical write's result and
re-read `this.data` after the await.** Two independent defects in one method,
both reproduced directly: (a) `_dispatchWrite`'s boolean/rejection was never
checked, so disk and backup side effects still landed after a REJECTED canonical
save (`diskWrites`/`backupWrites` both non-empty on a `saveSeason` that returned
`false`); (b) the disk/backup snapshot was built from `this.data` read AFTER the
await rather than the `payload` reference already captured at dispatch time
(mirroring `persist()`'s own default-parameter pattern) — reproduced with a
season switch landing during the gated canonical write: the disk/backup writes
carried `seasonName:"Season B"` under `id:"A"`, smearing the new season's data
into the old season's slot, exactly the cross-season class PC-1 closed. Fixed:
the result is checked (`ok === false` bails closed, returning `false`, matching
how every other `false`/`null`-on-failure method in this codebase already
signals "nothing durable happened" to its callers) before any side effect; the
disk/backup snapshot uses the captured `payload`; and — since the fix mechanism
already exists — the disk/backup writes themselves now also route through
`_enqueueWrite(seasonId, ...)`, so they stay ordered against a concurrent
`_scheduleDiskWrite` timer or `snapshot()`/`bindDisk()` write for the same
season rather than racing them directly.

**Deliberately out of scope, disclosed rather than silently ignored.** The
desktop backend's `TauriBackend._catalog` is a single library-wide
`CatalogPersistence` instance shared across every open season (confirmed via
`_ensureCatalog()`'s `if (this._catalog) return this._catalog;` singleton
pattern) — so even cross-season writes theoretically interact through one
in-memory `SqlCatalog` object with its own rollback-on-failure semantics. None
of Codex's four findings named this, and none of the four reproductions above
needed it to reproduce cleanly against a bare `SeasonStore` + fake backend. It
is recorded here as an observation for whoever next touches catalog-layer
concurrency, not fixed unilaterally — fixing an unnamed architectural
observation mid-repair is exactly the scope creep this project's standing
discipline exists to prevent.

**Verification.** `node tools/pc-adversarial-matrix.mjs` — new section 14, five
sub-cases (the four findings plus a direct `_wireDesktopCloseFlush()` test
distinct from `flushPendingSaves()`'s own awaitability): **92/92 locks green**
(was 89; +3 new locks from the new `_wireDesktopCloseFlush()` sub-case — the
other two new assertions replace pre-existing ones inline), 0/2 targets (the two
pre-existing, disclosed, out-of-scope legacy version methods, unchanged).
`node tools/e2e-revision-fence.mjs` — 33/33, unchanged. Every one of the five
fixes independently mutation-verified: reverting each in isolation against the
committed test reproduces its exact original symptom (three as a clean assertion
failure with the original evidence shape reproduced verbatim — `order:[2,1]`,
`callOrder:["delete-done","save-done"]`, `diskWrites`/`backupWrites` non-empty
on a rejected save, `seasonName:"Season B"` under `id:"A"` — and two, the
`_commitAndPersist()`/`_wireDesktopCloseFlush()` mechanism tests, as a genuine
harness crash rather than a silent pass, which is itself the load-bearing proof
that nothing downstream can quietly no-op if the mechanism regresses), confirmed
restored and reconfirmed green. Full canonical gate (`bash tools/run-gate.sh`):
**91 harnesses | 91 green | 0 skipped | 0 failed** — same count as the accepted
`33b8af1` checkpoint, zero harnesses added or dropped (this round's tests live
in `pc-adversarial-matrix.mjs`, which is deliberately excluded from the swept
gate, and in `e2e-revision-fence.mjs`, already counted); including
`e2e-realdata.mjs` (the real six-game coach season) clean.

No film path, film file, season/game/play data, schema version, migration, or
unrelated file touched. No installer, package, tag, or release.

## 7b. Codex re-review of PC-4 repair `95fc1df` — CHANGES REQUESTED (2026-08-22)

The repair correctly queues snapshot/bind-disk writes and fixes `saveNow()`'s
payload and failure handling. Three omitted lifecycle interleavings remain P0:

- **Delete tombstone missing:** a save dispatched after delete starts queues
  behind the delete and recreates the season. Direct result:
  `{case:"save-after-delete-start",exists:true}`.
- **In-flight write not drained on close:** after the debounce timer fires but
  before SQLite settles, `flushPendingSaves()` returns false and close proceeds.
  Direct result:
  `{case:"already-in-flight-close",flushed:false,saveStillPending:true}`.
- **Failed flush still closes:** the close handler destroys the window after a
  false save result. Direct result: `{case:"failed-flush-close",destroyed:true}`.

PC-4 remains open. Required closure is a deletion fence/tombstone, a real
per-season/all-writes drain seam, and a fail-closed close handler that retains
the window and surfaces a durable-save failure. Tests must exercise these exact
reverse/negative interleavings; the current success-only cases are insufficient.

## 7c. PC-4 repair round 2 — deletion fence, real drain seam, fail-closed close
##     (Codex re-review `50e2e50`, 2026-08-22)

All three findings from §7b were independently reproduced against the real
`SeasonStore`/`StorageManager` classes before any fix was written, per standing
discipline. Each reproduction matched Codex's cited result shape exactly.

**1. [P0, closed] `deleteSeason(id)` now fences new dispatches for the
lifetime of the delete, not merely orders them.** The §7a repair correctly
ordered a delete BEHIND any write already dispatched before it — but a write
dispatched WHILE the delete is still in flight (the season stays "current"
until `deleteSeason`'s own `await` resolves) was still ACCEPTED into the queue
and would eventually EXECUTE the moment it reached the front, resurrecting the
season regardless of the ordering fix. Reproduced with `store.persist(...)`
dispatched immediately after `store.deleteSeason(id)` (no gate needed — both
resolve within the same microtask window): `{case:"save-after-delete-start",
exists:true}`.

Fixed with a `_deletingSeasons` Set, set SYNCHRONOUSLY as the first statement
of `deleteSeason(id)` — before nothing else can run, so no later dispatch can
ever slip in ahead of it — and checked by a new gated `_enqueueWrite(seasonId,
run)`, which now refuses (`Promise.resolve(false)`) any write for a season
currently being deleted. The actual FIFO queueing mechanism moved to a private
`_rawEnqueue(seasonId, run)`; `deleteSeason` calls that directly (bypassing its
own fence) so a delete never refuses itself. The fence is cleared in a
`finally` block once the delete's own write settles, REGARDLESS of outcome —
required because `StorageBackend.createSeason()` slugifies the season name and
checks only against currently-listed seasons, so a freshly-deleted season's id
becomes available again for reuse by a brand-new season with the same name; a
fence that outlived the delete attempt would silently reject all future writes
for that reused id.

**2. [P0, closed] A shutdown close now genuinely awaits a write already in
flight, from whichever trigger started it.** The §7a repair made
`flushPendingSaves()` await the write IT starts, but had no way to represent
"a write started by an EARLIER trigger — the debounce timer's own natural
fire, or an earlier `flushPendingSaves()` call — is still running." The
browser `beforeunload` listener and the desktop `onCloseRequested` hook are
BOTH registered from `enableAutoSave()` and can both fire for one real close;
whichever runs second saw no armed timer (the first caller had already
cleared it) and reported nothing to flush while the first caller's write was
still pending. Reproduced with two sequential `flushPendingSaves()` calls, the
second while the first's gated write was still unresolved:
`{case:"already-in-flight-close",flushed:false,saveStillPending:true}`.

Fixed at two layers. First, `_autoSave()`'s debounce timer now nulls
`this.autoSaveTimer` the instant it fires (not merely "at some point before
its write settles") — the field previously stayed a stale, truthy value after
firing, which had actually been masking a DIFFERENT redundant-write hazard
(a later `flushPendingSaves()` call would have seen it still armed and
re-triggered `_commitAndPersist()` a second time on top of the naturally-fired
one). Second, `SeasonStore` gained `pendingWrite(seasonId)`, exposing the most
recently dispatched write's own durable true/false result (tracked in a new
`_lastWrite` map, separate from the drain-wrapped `_writeChain` entry, since
that entry's own continuation resolves to `undefined`, not the write's actual
outcome). `flushPendingSaves()` now falls back to awaiting `pendingWrite()`
whenever no timer is armed, so a second (or later) caller observes the SAME
in-flight write instead of reporting nothing pending.

**3. [P0, closed] `_wireDesktopCloseFlush()` now keeps the window open on a
genuinely failed final save.** `flushPendingSaves()` previously hardcoded
`.then(() => true)`, discarding whatever the underlying write actually
resolved to, so the close hook always proceeded to `destroy()` regardless of
success or failure. Reproduced with `backend.saveSeason` rejecting:
`{case:"failed-flush-close",destroyed:true}`.

Fixed by making `flushPendingSaves()`'s resolved value unambiguous: `true`
means genuinely safe to proceed (either nothing needed flushing at all, or a
flush/await completed and the underlying save durably succeeded); `false`
means ONLY an observed save failure, never "nothing was pending" — that
conflation was the exact ambiguity the close hook needed resolved, since
`await false` and `await Promise.resolve(false)` are indistinguishable to a
caller. `_wireDesktopCloseFlush()`'s handler now checks the resolved value
and, on `false`, surfaces the failure through the existing
`SeasonStore.onPersistError` seam and returns without destroying the window,
leaving it open for the coach to retry or export a backup.

**Verification.** `node tools/pc-adversarial-matrix.mjs` — new section 15,
seven assertions covering all three findings plus positive/negative controls
(a genuinely successful in-flight write is also correctly observed by a
second caller, not just a failed one): **99/99 locks green** (was 92; +7),
0/2 targets (the two pre-existing, disclosed, out-of-scope legacy version
methods, unchanged). `node tools/e2e-revision-fence.mjs` — 33/33, unchanged.
Every fix independently mutation-verified: reverting each in isolation
reproduces its exact original symptom (`exists:true`/`persistResult:true` for
finding 1; a second caller resolving `true` while the underlying write was a
genuine failure — `{"r1":false,"r2":true}` — for finding 2; `destroyed:true`
for finding 3), confirmed restored and reconfirmed green. One test-construction
gap was found and fixed during this repair, not merely reported: the initial
`errorSurfaced` assertion for finding 3 passed even with the close hook's own
`onPersistError` call removed, because `SeasonStore._persistNow()`'s own
independent `_persistFailed()` path already fires it for an ordinary rejected
`persist()` — the test was non-discriminating for the specific scenario it
built. Fixed by pre-arming `store._persistWarned = true` (`_persistFailed()`'s
own "warn once per session" dedup guard) before triggering the close, which
isolates the close hook's own explicit call as the only remaining path that
can set `errorSurfaced`; re-mutated afterward to confirm it now reds correctly.

Full canonical gate (`bash tools/run-gate.sh`): **91 harnesses | 91 green | 0
skipped | 0 failed** — same count as the prior repair round, zero harnesses
added or dropped, including `e2e-realdata.mjs` (the real six-game coach
season) clean.

No film path, film file, season/game/play data, schema version, migration, or
unrelated file touched. No installer, package, tag, or release.

## 7d. Codex re-review of PC-4 repair round 2 `3dab9f4` - CHANGES REQUESTED
##     (2026-08-22)

The three exact findings in §7b are closed and the focused verification is
green (adversarial locks 99/99; revision fence 33/33). One P0 remains in the
same shutdown contract.

**The new `pendingWrite()` seam is a snapshot of the most recently dispatched
write, not a stable all-writes drain.** `_lastWrite` is replaced on every
dispatch, while `flushPendingSaves()` captures its current promise once, awaits
it, and returns. If close captures write A and write B is dispatched behind A
before A settles, the flush still resolves when A succeeds and the close hook
destroys the window while B remains queued or in flight. The section-15 test
only proves two callers await the same existing write; it does not test a newer
write arriving while a caller is already awaiting the older tail.

Required proof: begin A, start the shutdown flush, dispatch B while A is still
unresolved, then release A. The flush must remain unresolved until B settles.
Repeat with B failing and prove the close remains prevented. Production must
either recheck the per-season tail/high-water mark until stable (including any
newly armed autosave) or establish a synchronous closing fence that prevents
new work from entering after shutdown begins. PC-4 and PC-5 remain blocked.

## 7e. PC-4 repair round 3 — a genuinely stable all-writes drain
##     (Codex re-review `c962437`, 2026-08-22)

The finding was independently reproduced against the real `SeasonStore`/
`StorageManager` classes before any fix was written. The first reproduction
attempt was itself flawed and is disclosed rather than silently corrected: it
inserted a macrotask `tick()` (a `setTimeout(0)`) immediately after releasing
write A, which let the ENTIRE microtask chain — A settling, its drain cleanup,
and B's own write firing — fully drain before anything was checked, so it could
not distinguish "the flush resolved before B" from "the flush resolved after
B". It was rewritten using an INDEPENDENTLY gated write B (its own release
function, held until explicitly called), which is what actually confirmed the
bug in both branches of `flushPendingSaves()`.

**Root cause.** `SeasonStore.pendingWrite(seasonId)` returns whatever promise
is CURRENTLY in `_lastWrite` at the instant it is called — a snapshot, not a
subscription. A caller that captures that snapshot and awaits it is watching
one specific promise object; if a NEWER write replaces the map entry while
that await is still pending, the caller's already-captured reference is
unaffected and resolves the moment the OLDER write settles, oblivious to the
newer one. Reproduced in both branches of `flushPendingSaves()` (the
timer-armed dispatch, which directly awaited `_commitAndPersist()`'s own
return, and the `pendingWrite()` fallback used by a second/later caller):
releasing only write A let the flush resolve while an independently-gated
write B (dispatched while A was still unresolved) remained pending.

**Fix, two layers.** `SeasonStore.drainWrites(seasonId)` is a new stable
primitive: it captures `_lastWrite`'s current entry, awaits it, then RECHECKS
`_lastWrite` — if the map now holds a DIFFERENT promise than the one just
awaited, a newer write landed during that await, and it is awaited too,
looping until the observed entry is genuinely unchanged across an await.
Resolves the durable true/false of the LAST write actually observed to settle.

`StorageManager.flushPendingSaves()` is rewritten around an OUTER loop, needed
because `drainWrites()` alone cannot see everything: it has no visibility into
`StorageManager.autoSaveTimer`, so a coach edit that re-arms the debounce
timer WHILE `drainWrites()` is awaiting an existing write — a genuinely
different edit than a direct concurrent `persist()`/`saveNow()` call, since
nothing has been dispatched to `_lastWrite` yet at that point — would be
invisible to it. Each outer iteration: dispatches (via `_commitAndPersist()`,
not awaited directly) whatever debounce is currently armed; reads
`pendingWrite()` and compares it against what the PREVIOUS iteration already
fully drained; exits only when neither a timer is armed nor anything new has
appeared since the last drain. This is what "the shutdown path must also
account for an autosave armed while it is draining" (the review's explicit
second requirement) resolves to in code — the alternative offered (a
synchronous closing fence that refuses new work) was not needed, since the
loop's own recheck already flushes rather than needing to reject.

**Verification.** `node tools/pc-adversarial-matrix.mjs` — new section 16,
five assertions: the exact reverse interleaving in both the timer-armed and
`pendingWrite`-fallback branches; a negative control proving the close hook
stays gated on the LATER write's (B's) own outcome even when the EARLIER
write (A) succeeded; and the newly-armed-autosave-during-drain case. **104/104
locks green** (was 99; +5), 0/2 targets (the two pre-existing, disclosed,
out-of-scope legacy version methods, unchanged). `node tools/
e2e-revision-fence.mjs` — 33/33, unchanged. Both new mechanisms independently
mutation-verified: disabling `drainWrites()`'s own recheck loop reproduces the
exact original symptom in the three sub-cases that depend on it
(`settledOnAAlone:true`, `destroyedOnAAlone:true`,
`destroyed:true,errorSurfaced:true`) while correctly leaving the fourth
(newly-armed-timer) sub-case green, confirming that case is protected by the
OUTER loop instead — not a coincidence, a genuine layering; collapsing the
outer loop to a single pass reproduces exactly the inverse (only the
newly-armed-timer sub-case reds, `timerWriteDispatched:false`, while the three
`drainWrites()`-covered sub-cases stay green). Both restored and reconfirmed
green. Full canonical gate (`bash tools/run-gate.sh`): **91 harnesses | 91
green | 0 skipped | 0 failed** — same count as the prior repair round, zero
harnesses added or dropped, including `e2e-realdata.mjs` (the real six-game
coach season) clean.

No film path, film file, season/game/play data, schema version, migration, or
unrelated file touched. No installer, package, tag, or release.

## 7f. PC-5 real-catalog dry run — snapshot()/restoreBackup() found and fixed
##     broken on desktop (2026-08-22)

PC-4 was accepted by Codex at `78eaa7e`, opening PC-5 (forensic backup, dry run
against the real two-season catalog, permission-gated legacy-data handling,
installer, installed smoke). Per the coach's own explicit 8-step protocol for
the dry run, a fresh forensic backup was taken first
(`incident-backups/pc5-forensic-backup-20260822-193122/`, gitignored, SHA-256
verified against the live source, `films/` explicitly excluded), then a new
harness (`tools/pc5-real-catalog-dry-run.mjs`) was built to run the FULL
production write path — `SeasonStore` -> `TauriBackend` -> `CatalogPersistence`
-> `SqlCatalog` — against an ISOLATED COPY of the real catalog, never the live
files. Deliberately not named `tools/e2e-*.mjs`: it depends on the coach's real
seasons already existing on this machine and is not part of the CI-swept gate.

**Live catalog measured, read-only, before anything else.** `sjm-varsity-2026`
("SJM Varsity 2026") — 2 games / 50 plays, matches the plan's own stated count.
`2026-varsity-demo` ("2025 St. Joseph Mavericks - JV") — 6 games / 440 plays,
matches exactly. Both seasons' every game carries `filmMode:'linked'` with real
`filmDir` values naming the coach's actual game folders. Neither season's raw
`data.revision` was ever stamped (reads `undefined`, normalizes to 0) — expected
for data that predates PC-4's revision fencing.

**The 8 steps, each run against the isolated copy only, never the live files:**
fingerprint the live catalog read-only; copy the catalog into an isolated
temporary app-data root (film excluded); confirm the copy's fingerprint matches
the live one exactly; repeated JV<->Varsity open/switch cycles with a
reversible tagged-play edit in each season, surviving a simulated restart;
backup + restore in each season with cross-season backup-scope isolation and
linked-film-metadata preservation; a tampered legacy `season.json` sidecar
proven ignored by normal startup (SQLite remains the sole read authority); a
failed save proven fail-closed (the season stays durable, neither lost nor
resurrected); and a final fingerprint comparison against the initial live
state, with every intentional difference (this dry run's own edits, the
revision advance from its own writes) named explicitly rather than hidden
inside a loose comparison.

**A genuine production defect was found and fixed via this process — this is
exactly why PC-5 specifies a REAL-catalog dry run rather than trusting the
already-green synthetic-fixture suite.** `SeasonStore.snapshot(label)`:
```js
if (this.backend.diskStatus().bound) {
  await this._enqueueWrite(seasonId, () => this.backend.writeDisk(seasonId, data, { snapshot: true, label }));
}
return this.backend.createBackup(seasonId, data, label);
```
`TauriBackend.diskStatus().bound` is `this._ok()`, i.e. `!!this.fs` — set
unconditionally in the constructor the instant `window.__TAURI__` exists, which
is true from the moment the real desktop app boots. There is no separate
`bindDisk()` step on desktop (that concept only exists for `BrowserBackend`'s
File System Access API). So on the real app, `snapshot()` ALWAYS takes the
bound branch: `writeDisk(seasonId, data, {snapshot:true, label})` runs first,
and `TauriBackend.writeDisk()` itself already calls
`this.createBackup(seasonId, data, opts.label)` internally when
`opts.snapshot` is true — creating the real backup row and caching its JSON in
`this._lastBackupJson` for de-dup purposes. `snapshot()` then makes its OWN,
SEPARATE trailing `createBackup(seasonId, data, label)` call with the
IDENTICAL `seasonId`/`data`/`label` — an exact JSON match against what was just
cached — which the existing de-dup guard answered with `return null;`.

**The consequence: `SeasonStore.snapshot()` returned `null` on every single
call on the real desktop app, even though the backup genuinely was created.**
`StorageManager.saveNow()` has the identical shape but discards the second
call's result, so it was unaffected. `SeasonStore.restoreBackup(id)` was not:
```js
const safetyId = await this.snapshot('Before restore');
if (!safetyId) return null;
```
`safetyId` was always `null`, so **restore refused to proceed on every single
attempt, on the real desktop app, for both real seasons** — reproduced directly
against the isolated copy of the coach's own catalog before this was fixed
(`snapshot created: FAIL`, `restore succeeded: FAIL`, both seasons). Coach
smoke would have hit this immediately the first time restore was exercised.

**Fix, in `js/storage-backend.js`'s `TauriBackend.createBackup()`.** A new
`this._lastBackupMeta` field caches the created backup's meta object alongside
the existing `_lastBackupJson` de-dup cache. The de-dup branch now returns
`this._lastBackupMeta` instead of `null` — an honest answer to a genuine
duplicate call ("yes, that backup exists") rather than a false failure,
without creating a second row. A genuinely different edit afterward still
reaches the catalog and produces a real new backup id; the guard's actual
purpose (preventing duplicate rows from the exact writeDisk()-then-snapshot()
collision shape) is unchanged.

**Mutation-verified.** Reverting the fix reproduces the exact original symptom
in the real-catalog dry run (`snapshot created: FAIL` on both seasons,
`restore succeeded: FAIL` on both) and reds exactly the new
`tools/e2e-catalog-backend.mjs` assertion (section 9/"3c") built to catch it
(`dupBackupSecondId:null, dupBackupSecondTruthy:false`), with the sibling
"genuinely different edit still creates a new backup" assertion staying green
either way. Restored, both clean.

**Verification.** `node tools/pc5-real-catalog-dry-run.mjs` — **36/36**, run
against a fresh, byte-verified copy of the real two-season catalog (film
excluded), never the live files. `node tools/e2e-catalog-backend.mjs` — **27/27**
(was 25; +2, section "3c"). Full canonical gate (`bash tools/run-gate.sh`), run
twice: **91 harnesses | 91 green | 0 skipped | 0 failed** both times (one
intermediate run hit the documented `e2e-native-tagging.mjs` Puppeteer/CDP
intermittent — 55/55 clean standalone, not caused by this change, not
reproduced on the clean re-run). The live `library.db` was confirmed
byte-identical (SHA-256) to the pre-work forensic backup throughout, and its
on-disk modification time predates every action in this checkpoint.

**Two test-construction defects in the dry-run harness itself, found and fixed
during this checkpoint, disclosed rather than silently corrected** (the same
discipline this file's own history keeps applying to itself): an early
cross-season "leakage" check compared bare `play.id` values across two
completely separate season objects that can never coexist in memory (`openSeason()`
fully replaces `SeasonStore.data`) — a false test that could only ever fail on
an incidental numeric id collision between games in different seasons, never on
a real leak; rewritten to check the edited play by its own `(gameId, playId)`
pair plus the season's total play count. And `snapshot()`'s own return value
(a backup META OBJECT, `{id, t, label, ...}`) was passed directly to
`restoreBackup(id)`/`getBackup(seasonId, id)` in place of its own `.id` field —
extracted correctly after tracing the real return shape.

No film path, film file, existing season/game/play data, schema version,
migration, or unrelated file touched. No installer, package, tag, or release.
The live catalog and every legacy sidecar remain byte-for-byte as they were
before this checkpoint began. Per the coach's own explicit instruction, no
legacy live file was retired, rewritten, archived, or deleted, and no cleanup
was performed or authorized.

**Next action.** This fix is new production code inside the persistence layer
Codex accepted at `78eaa7e` — it has not yet been independently reviewed.
Per the standing handoff protocol, Codex reviews this checkpoint before the
remaining PC-5 steps (installer, installed smoke against the coach's live
sessions) proceed.

## 7g. PC-5 review repair — the cache workaround was itself unsafe; removed
##     and replaced with a structural fix (Codex re-review `1de3c54`, 2026-08-22)

Codex's independent review of `c463fae`'s §7f fix found the cache-based repair
unsafe: **(1)** `CatalogPersistence.createBackup()` inserted the row in memory,
swallowed a failed `writeDb()`, and still returned the generated id — the cache
then remembered that falsely-successful id, so `restoreBackup()`'s safety
snapshot could proceed past `if (!safetyId) return null` even though nothing
durable existed. **(2)** the cache had no expiry and no verification: a
subsequent identical-content call could return a backup id that had since been
DELETED or pruned (`RETENTION=25`), with no write ever attempted to confirm it.
Both verified against source before any code was touched, exactly as described.

**Required repair direction (Codex's own words): "remove the cache workaround
and establish one owner for backup creation... The one backup call must
report success only after the SQLite bytes are durably written; on failure it
must roll back/refuse and restore must remain fail-closed."** Fixed at three
layers, structurally, with no cache anywhere:

1. **`CatalogPersistence.createBackup()`** (`js/catalog-persistence.js`) — now
   snapshots pre-mutation bytes before the in-memory insert and, on a failed
   `writeDb()`, closes and reopens the catalog from that snapshot (mirroring
   `deleteSeason()`'s own established rollback shape exactly) and returns
   `null` — never a `bid` the caller would read as durably created. This does
   NOT reopen the "never blocks a save" contract this section's header
   comment documents: `writeDisk()`/`saveSeason()` already discard this
   method's return value entirely, so a failed backup still never blocks the
   canonical season write it accompanies — only callers that actually depend
   on this method's own success (`restoreBackup()`'s safety snapshot) now see
   the truth instead of a lie.
2. **`TauriBackend.createBackup()`** (`js/storage-backend.js`) — the
   `_lastBackupJson`/`_lastBackupMeta` cache is deleted entirely, both fields
   and the branch that read them. Every call now performs (and, per fix #1,
   durably verifies) a real write, every time, with no memory of a prior call.
3. **`TauriBackend.writeDisk()`** — the redundant-second-call shape that made
   the cache seem necessary in the first place is closed at its root instead
   of papered over. `writeDisk()` now stamps its own internal backup result
   onto the caller-owned `opts` object as `opts.createdBackup` (a pure
   additive out-parameter — `opts` was already caller-owned and mutable at
   every call site, so no existing caller that ignores it is affected, and
   the boolean return contract every existing caller relies on is unchanged).
   `SeasonStore.snapshot()` and `saveNow()` (`js/season-store.js`) now read
   this out-parameter instead of making a second, separate `createBackup()`
   call for the identical payload — the exact call that produced the §7f
   finding in the first place. `writeOpts.createdBackup` has three
   meaningful states: `undefined` (this backend's `writeDisk()` does not own
   backup creation at all — `BrowserBackend.writeDisk()` writes its own
   separate file-based mirror snapshot inline and never touches this
   out-parameter, and its own `createBackup()` already re-verifies against
   fresh IndexedDB state on every call, so it was never affected by this bug
   class — or the internal `saveSeason()` failed before ever reaching the
   backup step) — both fall through to the unchanged, original direct call;
   a truthy meta object (the internal call succeeded and was durably
   verified) — used directly, no second attempt; `null` (the internal call
   was attempted and genuinely failed) — propagated honestly, never retried
   (a retry after a genuine failure would just repeat it, defeating "create
   each backup once").

**Verification, at every layer, each independently mutation-verified.**
`node tools/e2e-catalog-persistence.mjs` — **68/68** (was 63; +5, new section
12b): a failed `writeDb()` during `createBackup()` returns `null`, leaves zero
readable rows (rollback, not under-reporting), leaves the on-disk db
byte-unchanged, and a retried call once the write recovers succeeds durably.
Mutation-verified: reverting the rollback to the old swallow-and-return-`bid`
shape reproduces the exact original defect (a truthy id, a readable row, for a
write that never reached disk) and reds exactly those two new assertions.
`node tools/e2e-catalog-backend.mjs` — **28/28** (was 27; the stale §7f "dup
returns cached meta" test is replaced with three tests proving the corrected
contract at this layer: two separate calls with identical data now create two
separate, both-readable rows; a genuinely failed catalog write returns `null`,
never masked; a deleted backup is never returned again — creating a new one
for the same unchanged data afterward produces a genuinely new, genuinely
readable id). Mutation-verified: reintroducing a naive JSON-based cache
reproduces both symptoms exactly (`noCacheCatalogCalls:1` instead of 2;
`recreatedDiffersFromDeleted:false, recreatedReadable:false` — a deleted
backup's id returned again) and reds exactly those two assertions, with the
unrelated failure-propagation assertion correctly staying green throughout
(genuinely discriminating, not incidentally red).

`node tools/pc-adversarial-matrix.mjs` — **108/108 locks green** (was 104;
+4, new section 17), 0/2 targets (the two pre-existing disclosed dormant
legacy version methods, unchanged): `snapshot()` uses `writeDisk()`'s own
internal result directly and never makes a second `createBackup()` call for
the same write; a genuinely failed internal backup write is reported as
`null`, never silently retried; `restoreBackup()` refuses to proceed and
leaves live season data completely untouched when the pre-restore safety
backup genuinely fails; `saveNow()` observes the identical create-each-
backup-once contract. Mutation-verified independently: reverting
`snapshot()`'s out-parameter short-circuit reproduces the exact original
redundant-call symptom (`directCalls:1` instead of 0) on both the success and
failure sub-cases; removing `restoreBackup()`'s `if (!safetyId) return null`
guard reproduces exactly the danger scenario this whole repair exists to
close — the restore proceeds and live data is overwritten
(`dataUnchanged:false`) despite the safety backup having genuinely failed.

**Real-catalog dry run re-run per Codex's explicit request, against a fresh,
byte-verified copy of the real two-season catalog, never the live files.**
`node tools/pc5-real-catalog-dry-run.mjs` — **40/40** (was 36; +4, a new Phase
5b). Phase 5's backup/restore now genuinely succeeds through the fully
durability-verified path on both real seasons. The new Phase 5b precisely
isolates the backup-specific failure at the real class level: within one
`writeDisk()` call, the underlying `writeDb()` is invoked exactly twice — once
by `saveSeason()` (the canonical write, confirmed to keep succeeding), once by
`createBackup()` (the write this phase targets) — and failing only the second
call proves the canonical save is genuinely unaffected while the backup
specifically and honestly fails, `restoreBackup()` refuses with no genuine
safety backup to restore from, and the season is fully intact afterward. One
test-construction bug of my own was found and fixed while building this phase
(disclosed, not silently corrected): the first version checked for the
LABEL `'Before restore'` existing at all, which false-failed because Phase 5's
own legitimate JV restore earlier in the same run had already created a
genuine backup with that identical label — corrected to compare the backup
COUNT before and after the failed attempt instead.

Full canonical gate (`bash tools/run-gate.sh`): **91 harnesses | 91 green | 0
skipped | 0 failed**. Live `library.db` confirmed byte-identical (SHA-256) to
the forensic backup throughout, with an on-disk modification time predating
this entire repair round.

No film path, film file, existing season/game/play data, schema version, or
migration touched. No legacy live file retired, rewritten, archived, or
deleted; no cleanup performed or authorized.

**Next action.** Codex independently re-reviews this repair before the
remaining PC-5 steps (installer, installed smoke against the coach's live
sessions) proceed.

## 7h. PC-5 final rollback-capture hardening (Codex, 2026-08-22)

CatalogPersistence saveSeason(), deleteSeason(), and createBackup() now
require a valid pre-mutation toBytes() snapshot before touching the live
catalog. Previously an unusual double failure (snapshot capture fails, then
durable write fails) could enter rollback with no bytes; SqlCatalog would
then create a fresh empty in-memory catalog. The operations now fail closed
before mutation.

The focused regression forces snapshot capture to throw and proves all three
operations refuse, the loaded season remains unchanged, and no backup row is
created. Verification: catalog persistence **73/73**, catalog backend
**28/28**, adversarial matrix **108/108 locks**. No real catalog, season data,
sidecar, or film was touched.

## 7i. PC-5 installed-smoke close blocker (Codex, 2026-08-22)

Installer 1.12.0-59 could not close. The close-flush hook invoked Tauri
destroy(), while the app grants allow-close rather than allow-destroy; the
denied call was swallowed and every close request left the window open.
StorageManager now flushes, arms a one-shot approval, and invokes close().
The recursively emitted close event passes without preventDefault, while
save failure still keeps the window open. The lifecycle matrix remains
**108/108 locks** with an explicit recursion-guard assertion. Version
1.12.0-59 is defective; 1.12.0-60 replaces it.
