# GridIron IQ Desktop Persistence Convergence

**Status:** PC-0 through PC-4 are accepted. PC-4 final repair `b934f9d` was independently accepted by Codex on 2026-08-22 after focused verification (104/104 persistence locks; 33/33 revision-fence assertions). PC-5 — migration and installed smoke — is open. The accepted PC-4 commit is the rollback point for PC-5. Codex accepted the structural PC-5 restore-point repair `166d28f` on 2026-08-22 after independent focused verification, then closed its final non-blocking rollback-capture edge across save/delete/backup with a focused **73/73** catalog-persistence proof. Version **1.12.0-59** was built successfully as NSIS and MSI installers; installed two-season smoke is the remaining acceptance step.

That repair is now closed structurally, with no cache anywhere: `CatalogPersistence.createBackup()` rolls back and refuses on a genuinely failed durable write (mirroring `deleteSeason()`'s own established rollback shape); `TauriBackend.createBackup()`'s cache is removed entirely; `TauriBackend.writeDisk()` reports its own internal backup result to its caller via an out-parameter, so `SeasonStore.snapshot()`/`saveNow()` never make a redundant second call for the same payload. See `GRIDIRON-IQ-PERSISTENCE-INVENTORY.md` §7g for full detail, mutation-verified evidence at every layer, and the re-run real-catalog dry run (`tools/pc5-real-catalog-dry-run.mjs`, 40/40, including a new Phase 5b that precisely isolates a real backup-specific `writeDb` failure against the real class stack). **Codex independently accepted this repair; next build the installer and perform the installed two-season smoke.**

## Objective

Make SQLite the only writable canonical season store in the desktop app. Every persistence operation must carry an explicit season identity. JSON files become recovery/export snapshots only, never a competing live authority. Browser storage behavior remains unchanged.

## Non-Negotiable Invariants

1. Every desktop list/load/peek/save/autosave/backup/restore/import/delete operation takes an explicit `seasonId` where identity matters.
2. Destination id, payload `data.id`, catalog row id, and revision owner must agree before the first write. A mismatch performs zero writes and produces a visible error.
3. No mutable global current-season pointer may choose a write destination.
4. SQLite is the desktop live store. If it cannot initialize, the desktop app fails closed; it must not silently fall back to JSON or localStorage.
5. `season.json`, Documents mirrors, and `library.json` are not normal read/write authorities. Snapshots are created only after a successful SQLite commit or by explicit export.
6. Recovery is one-way into SQLite, validates identity and counts, previews the action, and requires coach confirmation.
7. Delayed autosaves carry a captured season id and revision. A season switch or newer revision makes the delayed save stale and it must fail closed.
8. Film paths and files are out of scope. Do not copy, move, migrate, or delete film.

## Checkpoints

### PC-0 - Inventory And Failing-First Contracts
Inventory every desktop persistence path and every use of mutable `currentId`: list, load, peek, save, autosave, backup, restore, import, delete, recovery, and shutdown. Add failing-first tests for the adversarial matrix below. Do not change production behavior in this checkpoint.

### PC-1 - Explicit Identity API
Require explicit ids at persistence boundaries. Validate destination/payload/catalog/revision identity together. Remove mutable backend scope as a write destination. Make read-only peeks provably side-effect-free.

### PC-2+PC-3 - SQLite Authority + Recovery Snapshots (Combined Milestone)
Implement and review these together so removing JSON as a live authority and introducing its deliberate recovery replacement land atomically, with no unsafe gap between checkpoints.

**SQLite-only live desktop persistence:** remove normal Tauri JSON/library writes and reads that can override the catalog. Team Hub season listing and season load come from SQLite. Desktop catalog failure remains visible and fail-closed. BrowserBackend stays unchanged.

**Recovery and export snapshots:** define a versioned snapshot envelope containing season id, revision, timestamp, game/play counts, and checksum. Generate it only after a successful SQLite commit or explicit export. Recovery scans snapshots, previews differences, asks for confirmation, then imports into SQLite. Never auto-import merely because app data appears empty.

**Acceptance boundary:** one builder checkpoint, one independent review, and no intermediate installer. The combined change must prove both halves together: normal startup has exactly one live authority, while recovery remains explicit, previewed, confirmed, identity-checked, and non-destructive.

### PC-4 - Revision-Fenced Autosave And Lifecycle Audit
Capture season id and revision when work is scheduled. Reject stale saves after season switch, reload, undo/redo, restore, or a newer commit. Audit Team Hub, game/team/season switch, backup/restore, import, delete, and shutdown.

### PC-5 - Migration And Installed Smoke
Create a fresh forensic backup first. Dry-run against the real two-season catalog. Ask the coach before deleting, retiring, moving, or rewriting any legacy live file. Build only after Codex accepts PC-0 through PC-4. Smoke JV 6 games/440 plays and Varsity 2 games/50 plays through repeated switches, edits, restarts, reports, linked D: film, backup, restore, and stale-sidecar rejection.

## Adversarial Matrix

- Destination id differs from payload id: zero writes.
- Delayed save for season A completes after switching to B: zero writes to B.
- Backup, restore, or import carries the wrong id: rejected before mutation.
- TeamRegistry peeks do not alter active identity.
- SQLite is corrupt, locked, or unavailable: visible failure, no fallback authority.
- Stale JSON/library sidecars disagree with SQLite: ignored by normal startup.
- Delete fails: season remains durable and cannot resurrect from a stale sidecar.
- Duplicate snapshot import: no duplicate season and no silent overwrite.
- BrowserBackend behavior and tests remain unchanged.
- Repeated real two-season switch/save/restart cycles preserve ids, counts, tags, notes, and linked-film metadata.

## Handoff Protocol

- Claude owns each checkpoint on `claude/football-film-analyzer-GRiCW`.
- Commit, push, and update `CLAUDE.md` before every handoff.
- Codex independently reviews each checkpoint before the next opens.
- Use focused failing-first tests per checkpoint; run the full gate once before the installer.
- Do not build intermediate installers.
- Stop and ask the coach before deleting, moving, rewriting, or retiring live data, snapshots, sidecars, or film.

## Out Of Scope

Visual redesign, Reports/Study enhancements, drawing tools, cloud sync, install-folder changes, film relocation, broad dead-code cleanup, BrowserBackend redesign, and deletion of the forensic incident backup.
