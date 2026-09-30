# Charting Cutover Current Impact - 2026-09-30

This supersedes the earlier rehearsal's history counts and takeaway blockers.
The live charting conversion has NOT been run or approved. Installed settings
and Documents mirror are unchanged. Final browser-settings disposition and
immediate live-write confirmation remain prerequisites.

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
with their complete raw rows unchanged (not yet charting-converted).

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
Current catalog hash after retirement:
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
`tools/charting-coach-mapping-2026-09-30.json`.

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
immediately before any separately approved conversion.

## Re-Chart Checklist (Prepared, Not Yet Applied)

Season: **2025 St. Joseph Mavericks - JV**. Game: **Week 6 vs Holy Family
Wildcats**. The original Formation is **Unbalanced** for all four entries.

| Play Number In App / Durable ID | Current Array Position | Formation After Approved Conversion |
|---|---:|---|
| 3 | 2 | blank |
| 4 | 3 | blank |
| 23 | 20 | blank |
| 60 | 55 | blank |

The app displays the durable play ID, not its array position (confirmed in
the Film Room and theater renderers). Use 3, 4, 23 and 60 to find them.
Season ID `2026-varsity-demo`; game ID `gmqptqoprzli2r`. Confirm this list
against the converted live catalog after the eventual write before delivering
it as the final re-chart checklist.
