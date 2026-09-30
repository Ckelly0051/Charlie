# Charting Cutover Current Impact - 2026-09-30

This supersedes the earlier rehearsal's history counts and takeaway blockers.
The live charting conversion completed on explicit coach authorization and was
independently verified on 2026-09-30. Installed settings and Documents mirror
are unchanged. The throwaway conversion/archive tools, dependent tests and
Previous formations bridge are deleted. Final gate passed 140/140 at
`a449b59e`, zero skipped and zero failed. Packaging authorized; smoke remains.

## Live Conversion Complete

Data-only backup: `D:\Football\Film\GridIronIQ-Backups\charting-conversion-2026-09-30`.
All 114 manifest files hash-verified; no film was copied. Live catalog matches
`run/converted.db` and its report hash:
`770f3cc3b185e2b71e732a841a46e0ebc25859ac7d7beb361a43fb798273469c`.
Original catalog hash: `948d6b22312a65c2eeefbc2670504880215d529a402ed77a7de3a2d7aea3e966`.

An independent raw-SQL reader used no converter/check functions. It compared
all 11 tables: all 919 live plays, six call defaults, 42 backups and 52 versions
match the approved mapping exactly. Identity, ordering, timestamps, clip paths
and references, notes, penalties, players, grades and unrelated tags are unchanged.
The normal SqlCatalog save regenerated internal play/clip row IDs and advanced
their SQL sequences by the exact row counts; season SQL `updated` timestamps
changed. Those are not durable play/clip IDs. Orphan SQL rows remain unchanged.
Every retained snapshot passes current-format checks; all three seasons load
through SqlCatalog and SeasonStore normalization. Live hash stayed unchanged
during verification.

Receipt: `charting-live-verification-2026-09-30.json`, also saved in the backup
as `INDEPENDENT-VERIFICATION.json`. Approved decisions are preserved in
`charting-approved-mapping-2026-09-30.json`.

Saved library verified from a disposable copy of the backed-up desktop profile:
one custom old Formation, Beast, already available as a current built-in.
No coach choice is lost when the temporary offer bridge is removed. Raw retired
settings groups remain opaque and preserved through unrelated edits; no old
Formation group is read or offered. Inventory: `charting-library-inventory-2026-09-30.json`.

After cleanup: build and eight focused harnesses pass (receiver-look, tag-library,
charting-details, tag-library-settings, charting-cutover-deck, season-format,
legacy-inventory, legacy-roundtrip). Subsequent authorized full gate passed
140/140 at `a449b59e`. The four-owner `1.12.0-107` bump passes p0-exit 19/19.
Installer and smoke status: `docs/DOCUMENTATION-INDEX.md`, `SMOKE-1.12.0-107.md`.

## History Retirement Complete

### Additional Current-State Backup

Coach requested a full current-state backup before proceeding. Verified backup:
`D:\Football\Film\GridIronIQ-Backups\current-state-2026-09-30-b10094cf`.
Contains app data including managed film (591 files), complete desktop settings
profile (798 files), Documents mirror (109 files) and a verified complete Git
bundle at `70c68884`. Total: 1,499 files, 15,536,970,855 bytes. Every copied
file passed SHA-256 and size comparison; its source hash was checked again
after copying. Linked film remains in its original location, not duplicated.
`MANIFEST.json` and `BACKUP-RECEIPT.json` are in the backup folder; receipt
status `BACKUP_VERIFIED`. Manifest SHA-256:
`8A76CC38A7FC5D3A07DF6549DA8E494E2755D0C6EEDE13CB6083DAE79B0E80CC`.
This is the history-cleaned, still-unconverted live state. No live data write
or charting conversion occurred during backup.

Coach authorized verified archival and removal of incompatible history while
keeping compatible records. Exactly 34 catalog restore points and 94 game
versions were archived and removed. 42 restore points and 52 versions remain,
with their complete raw rows unchanged at retirement; subsequently converted
and independently verified as described above.

Archive:
`C:\Users\charl\GridIronIQ-Backups\incompatible-charting-history-2026-09-30`.
It contains the complete `library.before.db`, 128 complete row JSON files,
`MANIFEST.json`, manifest hash and `REMOVAL-RECEIPT.json`.
Receipt status: `REMOVED_AND_VERIFIED`.

Independent read-back verified every archived row's size, SHA-256, exact
original row and body hash, absence from active history, and all ten catalog
tables. Only the manifest's 128 rows were removed; all season/game/play/film
and other table rows are unchanged. Original catalog hash:
`67780703e0e2bff34c0f5672af5f6e13887d980bdf2c3ee93584849ca2b6c696`.
Historical catalog hash immediately after retirement, before conversion:
`948d6b22312a65c2eeefbc2670504880215d529a402ed77a7de3a2d7aea3e966`.

## Takeaway Proof Complete

The proof recomputes full ranked takeaway lists from original plays plus only
the approved Formation and strength. Ordering, scores, text and cut keys must
match exactly. Wrong Formation names and unrelated yardage changes are refused;
there is no blanket exemption. Three regressions fail before repair; replacing
the equality check with a blanket pass fails both refusal checks.
Conversion suite 45/45; history-archive safety suite 13/13.
No new full gate was run.

## Refreshed Copy Rehearsal

Scratch folder:
`C:\Users\charl\AppData\Local\Temp\giq-final-cutover-2026-09-30-c7PqoM`.
Source is a verified copy of the current history-cleaned catalog. Coach mapping:
`docs/charting-approved-mapping-2026-09-30.json` (moved from the spent tools).

- Three live seasons, 919 plays: 293 Varsity, 186 SJM JV, 440 2025 JV.
- 496 nonblank old Formation values resolve: 87, 64 and 345 respectively.
- Four 2025 JV formations deliberately become blank; no Receiver Alignment or
  Offensive Line Strength is inferred. Existing charted strength survives.
- Six play-call defaults convert (two per season).
- All 42 remaining restore points and all 52 versions resolve; none is left
  unresolved or incompatible in the converted copy.
- All three season proofs pass identity, exact film references, unrelated tags,
  other play fields, game fields, takeaway projection and catalog round-trip.
  Zero current-format problems and zero unexpected analytics differences.

Exact report and impact: `charting-final-rehearsal-2026-09-30.json` and
`charting-final-impact-2026-09-30.json`. The source hash must still match
matched immediately before the approved conversion; that write is now complete.

## Final Re-Chart Checklist (Verified Against Converted Live)

Season: **2025 St. Joseph Mavericks - JV**. Game: **Week 6 vs Holy Family
Wildcats**. The original Formation is **Unbalanced** for all four entries.

| Play Number In App / Durable ID | Current Array Position | Current Formation |
|---|---:|---|
| 3 | 2 | blank |
| 4 | 3 | blank |
| 23 | 20 | blank |
| 60 | 55 | blank |

The app displays the durable play ID, not its array position (confirmed in
the Film Room and theater renderers). Use 3, 4, 23 and 60 to find them.
Season ID `2026-varsity-demo`; game ID `gmqptqoprzli2r`. Each original value and
current blank Formation was independently checked against the backup and live
catalog. Re-chart these plays when convenient; no side/alignment was guessed.
