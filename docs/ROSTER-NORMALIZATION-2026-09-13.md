# Roster ownership normalization — 2026-09-13

One-time, explicitly authorized repair of coach data. No player names, numbers,
positions or sides appear in this ledger or anywhere in Git; rosters are
identified by count and by a truncated sha256 of the jersey list, which is
enough to prove two seasons held the same list.

## Authorization

Charlie, 2026-09-13:

- The 19-player roster belongs only to the 2025 St. Joseph Mavericks JV season.
- No roster was entered for 2026 JV or 2026 Varsity; both should be empty.
- The roster is not to be assigned to any other season.

## Which store is authoritative

`js/storage-backend.js:537` — "SQLite is canonical". The installed desktop app
reads and writes `AppData/Roaming/com.gridironiq.app/seasons/library.db`. The
Documents mirror is a durable backup written from the canonical-commit path
only, and is never a normal read authority; it exists so "Delete application
data" or an uninstall cannot destroy a season.

## Why the catalog and the mirror disagreed

They hold different season sets, for two separate reasons.

1. **Two file shapes in the mirror.** The current writer wraps a season in a
   PC-3 `SnapshotEnvelope` (`{envelopeVersion, seasonId, revision, timestamp,
   gameCount, playCount, checksum, data}`). Two older files are bare season
   objects. An audit that reads the envelope's top level as a season reports
   every wrapped file as empty — the first version of this audit did exactly
   that and had to be corrected before any of its numbers could be trusted.
2. **Two orphan legacy ids.** `2025-st-joseph-mavericks-jv` and
   `2026-st-joseph-mavericks-jv` exist in the mirror and in NO catalog. They are
   bare-format leftovers from an earlier id scheme. The three catalog seasons
   each have a matching envelope file whose revision and counts agree with the
   catalog, so the live pairing is consistent.

## The `2026-varsity-demo` identifier

It is a **naming artifact only**. The catalog row's own `is_demo` flag is `0`,
so it is not registered as the demo season. Identity was proven from content,
not from the name:

- Its six stable game ids — `gmq9plozwgukpk`, `gmqfbfaqnpxjll`, `gmqik11s86n46s`,
  `gmqo9g65dqzba4`, `gmqpt95xh58z0a`, `gmqptqoprzli2r` — are identical to the
  registered canonical 2025 JV season's game ids, same set, same opponents
  (Week 1 St. Peter Lutheran … Week 6 Holy Family).
- Its metadata reads `2025 St. Joseph Mavericks - JV`, year `2025`, level `JV`.

`tools/normalize-roster-ownership.mjs` re-checks both conditions and exits
without writing if either fails.

## State before the change

| store | season id | display name | yr/lvl | games | roster | roster hash | legacy `game.roster` |
|---|---|---|---|---|---|---|---|
| catalog | `2026-varsity-demo` | 2025 St. Joseph Mavericks - JV | 2025 JV | 6 | 19 | `c96f6b34d1497363` | 1 of 6 |
| catalog | `sjm-varsity-2026` | SJM Varsity 2026 | 2026 Varsity | 4 | 19 | `c96f6b34d1497363` | 2 of 4 |
| catalog | `sjm-jv-2026` | SJM JV 2026 | 2026 JV | 2 | 19 | `c96f6b34d1497363` | 0 of 2 |
| app-data json | `2026-varsity-demo` | (same) | 2025 JV | 6 | 19 | `c96f6b34d1497363` | 6 of 6 |
| app-data json | `sjm-varsity-2026` | (same) | 2026 Varsity | 2 | 19 | `c96f6b34d1497363` | 2 of 2 |
| mirror envelope | `2026-varsity-demo` | (same) | 2025 JV | 6 | 19 | `c96f6b34d1497363` | 1 of 6 |
| mirror envelope | `sjm-jv-2026` | (same) | 2026 JV | 2 | 19 | `c96f6b34d1497363` | 0 of 2 |
| mirror envelope | `sjm-varsity-2026` | (same) | 2026 Varsity | 4 | 19 | `c96f6b34d1497363` | 2 of 4 |
| mirror bare | `2025-st-joseph-mavericks-jv` | 2025 St. Joseph Mavericks - JV | 2025 JV | 6 | 19 | `c96f6b34d1497363` | 6 of 6 |
| mirror bare | `2026-st-joseph-mavericks-jv` | 2026 St. Joseph Mavericks - JV | 2026 JV | 1 | 0 | (empty) | 0 of 1 |

One roster hash across three different seasons, two different years and two
different levels: the duplication, at rest.

## What was changed

Ledger stamp `2026-09-14T00-24-43-224Z`.

| store | season | roster | legacy `game.roster` removed |
|---|---|---|---|
| catalog | `2026-varsity-demo` | 19 preserved | 1 game |
| catalog | `sjm-jv-2026` | 19 → 0 | 0 |
| catalog | `sjm-varsity-2026` | 19 → 0 | 2 games |
| app-data json | `2026-varsity-demo` | 19 preserved | 6 games |
| app-data json | `sjm-varsity-2026` | 19 → 0 | 2 games |
| mirror envelope | `2026-varsity-demo` | 19 preserved | 1 game |
| mirror envelope | `sjm-jv-2026` | 19 → 0 | 0 |
| mirror envelope | `sjm-varsity-2026` | 19 → 0 | 2 games |

Each record also gained the `rosterOwnership: 'season'` marker. Mirror envelopes
were rewritten through `SnapshotEnvelope.wrap`, so their checksums stay valid.

**The marker's meaning was tightened later the same day**, after the migration
architecture was finished (see `docs/OPEN-DEFECTS.md` item 7 and CLAUDE.md's
roster-ownership block). It now asserts BOTH halves of the contract — the season
owns the roster AND no game node retains a copy — so `_normalize` refuses to
stamp a season still carrying legacy game rosters. Every record in the table
above satisfies both, because this normalization removed the game-level copies as
well as stamping the marker — the `roster` property is gone from every game node,
not merely emptied, which is what the tightened check requires. The app-level migration
would now reach the same end state on its own: `SeasonStore.adoptLegacyRoster()`
validates every copy in a season before promoting one, removes all of them once
settled, and `_hydrate()` persists the result before exposing the season. What it
would NOT have done is choose between the three seasons' rosters — that decision
was cross-season, which the boundary cannot see, and is exactly why this
normalization was authorized by hand.

Had any of these seasons held *disagreeing* game rosters, the app would have
refused to open it rather than converting: since 2026-09-14 a conflict aborts the
open, the import and the restore, preserving the prior active season and the
source bytes. None of them did — every copy in each season matched.

**Deliberately untouched:** mirror `2025-st-joseph-mavericks-jv`, the registered
canonical Reports data authority — CLAUDE.md forbids writing to it — and mirror
`2026-st-joseph-mavericks-jv`, an orphan whose roster was already empty.

## Backups

`C:/Users/charl/AppData/Roaming/com.gridironiq.app/roster-normalization-backups/2026-09-14T00-24-43-224Z/`

| file | bytes | sha256 (pre-change) |
|---|---|---|
| `library.db` | 14,401,536 | `013a9ae8e419e4ec3aaba0a933587d529c43f2fbaed9449a72bdee3ba7008a03` |
| `appdata__2026-varsity-demo__season.json` | 810,635 | `c0db307a69d19653e6b954f4d418c24b8cd43bc40f07fefd91d00446f49c3250` |
| `appdata__sjm-varsity-2026__season.json` | 76,904 | `031c13e1105dda551127305e3ef893fcdee57548bd05ae47efe9dbc8fb9d7ffe` |
| `mirror__2026-varsity-demo__season.json` | 880,434 | `9e9d14e066ba06a53ae4e361b7775686f0de4c7705c1e76e996d9d5817543774` |
| `mirror__sjm-jv-2026__season.json` | 181,991 | `311d2c55dc9d7f04fb4c76943e88cede7ac9252aaf15bae2d3f0a61382220513` |
| `mirror__sjm-varsity-2026__season.json` | 200,557 | `f08418b5a8b26501c125e3375d1797096e2973bd478e89d6e63bb936a5d2495e` |

All six re-read successfully after the write. Post-change `library.db` is
`e349a248701942a8b87c097cecf02b3b52a88fa082ce899d5a3e307d3db42be5`.

## Verification

At rest, and through the real `StorageManager.openSeasonById` path, including a
simulated restart (store and live roster dropped, then reopened):

| season | roster | marker | games with own roster | plays |
|---|---|---|---|---|
| 2025 JV (`2026-varsity-demo`) | 19 | `season` | 0 | 440 |
| 2026 JV (`sjm-jv-2026`) | 0 | `season` | 0 | 126 |
| 2026 Varsity (`sjm-varsity-2026`) | 0 | `season` | 0 | 131 |

Play counts are unchanged from before the write, so the SQLite re-export moved
no rows. Switching between the three seasons never retains the previous live
roster, before or after the simulated restart.

## Unresolved

**The canonical Reports fixture and the coach's live 2025 JV season have
drifted.** Mirror `2025-st-joseph-mavericks-jv` holds 449 plays; the catalog
season the installed app actually opens holds 440. They are two copies of the
same season under different ids. Every `*-realdata` harness reads the 449-play
mirror copy, so the automated evidence is not measuring the data the coach uses.
Not addressed here — it needs its own decision about which copy is canonical.
