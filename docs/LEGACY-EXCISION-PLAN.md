# Legacy excision — plan

Coach direction, 2026-09-25: excising legacy code is the next step, done
properly rather than around. **Status: APPROVED by the coach (2026-09-25), cut to three passes the same
day. Pass 1 and Pass 2 steps 1-7 done in source (2026-09-26), full gate 135/135 at `42e4097`; next: Pass 2b, then step 8.** Base: `1.12.0-102` (`f6e1490`), full gate 131/131.

## Why it keeps biting

Every defect in the `1.12.0-99` smoke and both reviews after it came from
legacy structure, not new logic:

- **S99-2 / CR-1..3:** Chart kept a copy of the play's unit in a fake form
  field (`PlayTagger.unitField`, a `PlainField` standing in for the deleted DOM
  form) and a "carried" unit, and four paths read those instead of the play.
- **S99-1:** a column rule written for the old "one unit per table" view.
- **CR-1:** a keyboard handler from the pre-Preact app with its own copy of
  the unit rule.

Two copies of a fact drift. Legacy code here is mostly **second copies**:
of data (UI-state mirrors of play fields), of rules (34 inline
`unit || 'offense'` readings beside `countedUnit`), and of formats (old
stored shapes read through compatibility projections).

## What is legacy, measured

| Kind | Size | Load-bearing | How it goes |
|---|---|---|---|
| **A. Dead code** | ~45 names, `report-visual-data.js`, `tools/retired/` (inventory: `docs/OPEN-DEFECTS.md` > Deferred Beta Maintenance) | No | Delete |
| **B. Duplicate rules and aliases** | 34 inline unit readings, `PROJECTED_PAIRS` alias, `_plainCell` / `_plainTendency`, `_stripStAlignment`'s own unit rule | Yes, but each is a copy of a live owner | Route to the one owner, delete the copy |
| **C. UI state inside the domain model** | `PlainField` / `PlainInput` (13), the tagger's `unitField` / `tagFields` / `playerFields` / `gradeFields` read from 11 places outside the tagger and 10 harnesses | **Yes** — Chart reads and writes through them | Replace with a data API on `PlayTagger`, move consumers one at a time |
| **D. Legacy stored data and its readers** | Canonical season (July mirror, 449 plays): **127** combined formation strings, **75** legacy-only Special Teams plays and **0** structured, **18** plays with no unit, rosters on all **6** game nodes; 105 projection reads, 44 `stType` reads | **Yes** — the coach's season IS this shape | Migrate the data (coach-confirmed), keep the reader one release, then delete it |
| **E. Legacy platform choices** | Settings in localStorage (87 call sites), `window.app` service lookups (54), 41 raw `innerHTML` screens, `stats-engine.js` 6,786 lines, the browser target (sql.js whole-file saves, HTML `<video>`) | Yes | Each its own project; E-1 and E-2 below, the rest by coach decision |

The data (D) is the real constraint: its readers cannot be deleted until the
coach's data no longer needs them, and that data can be changed only with an
impact report and the coach's explicit confirmation (binding data rules).

## The guardrails (what "without fucking the app up" means, mechanically)

1. **Characterize before cutting.** Before a phase touches an area, pin what
   it does today, so a change in behavior is a red test, not a smoke finding:
   - `e2e-parity` already pins every analytics output (kept byte-for-byte).
   - **New: `tools/compare-builds.mjs`** — the before/after screenshot check
     used for the Break Down rebuild (20 states, byte-identical), made
     permanent and extended to every route at 1440/1280/768/390. A phase meant
     to change nothing visible must produce identical bytes.
   - **New: `e2e-legacy-roundtrip`** — the canonical season (read-only copy),
     loaded, saved and reloaded, must produce the same normalized payload, so a
     reader or writer change that alters stored data is caught.
2. **Strangler, never big bang.** Build the new owner, move ONE consumer per
   commit, delete the old path only when a scan shows zero consumers. This is
   how `countedUnit` and `setPlayUnit` went in; it worked.
3. **Every phase ends shippable**: full gate green, compare-builds identical
   (unless the phase is meant to change the screen), docs updated.
4. **Coach data is never changed without the coach.** Data migrations follow
   the binding rule: a dry-run report with exact counts on the canonical
   season copy, the coach's yes, a `Before migration` restore point, a verified
   write, and the old reader kept for one installed release as a fallback.
   **Nothing ambiguous is guessed**: a play the migration cannot classify with
   certainty stays in its old shape and is listed for the coach.
5. **Stop rules.** Any parity diff, unintended screenshot diff, or change to
   the canonical season's bytes stops the phase; I report it and do not patch
   around it.
6. **Review and confirm.** Codex reviews each pass's commits against this
   plan before the gate; the coach confirms before any gate and any installer.

## Three passes (coach, 2026-09-25: the seven phases are cut to three)

Pass 0 is done. Passes 1 and 2 are the work that matters; Pass 3 is optional.

**Pass 0 — Guardrails and inventory (no product change). BUILT, pending the full gate.**
Build `compare-builds.mjs` and `e2e-legacy-roundtrip`; add
`tools/audit-legacy.mjs`, a read-only scan that regenerates the table above
(unreferenced names, inline unit readings, fake-field reads, localStorage keys,
`window.app` lookups, `innerHTML` sinks, legacy data shapes on the canonical
copy) so progress is measured, not asserted.
*Done when:* all three run in the gate and the inventory matches this table.

**Built 2026-09-25 (`aa27da9`), awaiting Codex review; full gate not yet run
with the two new harnesses.**
- `tools/audit-legacy.mjs` — the read-only inventory (`--live` reads a copy
  of the installed catalog and confirms its hash is unchanged). Baseline in
  `tools/legacy-inventory-baseline.json`: 41 dead-name candidates, 1 orphan
  module, 31 inline unit rules, 2 `PROJECTED_PAIRS` alias reads, 25
  `PlainField`/`PlainInput` references, 12 fake-field reads outside the
  tagger, 93 localStorage calls, 73 `window.app` references, 38 `innerHTML`
  sinks, `stats-engine.js` 6,787 lines. (Counting method differs from the
  table above, which was a first pass; the baseline is the authority.)
- `e2e-legacy-inventory` — the ratchet: every count may only fall, and no
  new dead name or orphan module may appear. Mutation-verified: a new inline
  unit rule and a new dead name each red it.
- `e2e-legacy-roundtrip` — the canonical season adopted through the real
  import path, reopened from storage after a reload, saved unchanged and
  reopened again: identical both times, and every charted value on all 449
  plays survives. The first save adds only empty schema defaults for fields a
  legacy play lacked (`backfield`, `fumbleRecovery`, `playCall`, `playCallId`,
  `playConcept`, `strength`) — characterized, not a defect; note that
  `migratePlayFormation` keys on a missing `backfield`, which the first save
  supplies. Mutation-verified: stripping look fields from every play (the old
  "Under Center" bug) reds it and names 366 plays.
- `tools/compare-builds.mjs <rev>` — every route at 1440/1280/768/390 (64
  captures) from a baseline revision's build and the current build; exits 1 on
  any difference. Deterministic: animations and transitions off, toasts
  hidden, focus cleared, pointer parked; a difference is captured again from
  both builds and reported only if it repeats (one-off rasterization noise is
  listed separately). Verified: current against itself, 64/64 identical twice;
  against `2d13c31` (`1.12.0-99`), exactly the 8 Film Room captures that
  changed. The baseline is exported with `git archive` and linked to
  `node_modules` by a junction that is removed and verified BEFORE the temp
  folder is deleted. On demand, not in the gate (it needs a baseline revision).

**Pass 1 — Cleanup (was Phases 1 and 2). No visible change, no smoke.**
- LG-1 first: clip import (`PlaylistManager`, `js/playlist-manager.js` ~282)
  creates plays whose tags omit `unit` (and players/grades); seed the full tag
  schema there, with the carried unit (a play that did not exist yet), and a
  failing-first test. Found by Codex, 2026-09-25.
- Delete dead code: every dead-name candidate in the baseline, after checking
  each for string-built or dynamic use; `js/report-visual-data.js`;
  `tools/retired/`; Clear Tags' `#notesArea` lookup.
- One owner per rule: every inline unit reading to `countedUnit`
  (`_stripStAlignment` included); the `PROJECTED_PAIRS` alias readers to
  `TagProjection`; the `_plainCell` / `_plainTendency` pass-throughs' harness
  repointed; then the copies deleted.
- *Proof:* the build, `e2e-parity` unchanged, `e2e-css-ownership` (deleting code
  can orphan its CSS — the Pass 1 gate caught 17 such selectors), the gate,
  `compare-builds` 64/64 identical, the ratchet lowered in the same commits.

**Pass 1 — CLOSED (2026-09-25). Full gate at `ac893b5`: 133/133, 0 skipped, 0 failed**, after two pre-existing harness races were repaired (TEST-1 `e2e-native-tagging`, TEST-2 `e2e-native-recovery`; `docs/OPEN-DEFECTS.md`). Earlier gate at `b04a2f3`: 132/133 (TEST-1). Also in Pass 1: `f660e09` 318 dead CSS branches (345 lines) with the ownership model taught prop-passed classes, `b04a2f3` strict-only CSS pruning.** `ecbe8b4` LG-1: one
blank tag schema (`PlayTagger.blankTags`) for every new play, clip import sets a
unit. `2a3adda` dead code: 42 definitions, `report-visual-data.js` and the
retired test, 1,057 lines. `5e3f46d` one owner per rule: 30 copies of the unit
rule to `countedUnit`, the `PROJECTED_PAIRS` alias and the cell pass-throughs.
Each step: compare-builds 64/64 byte-identical against the step before,
`e2e-parity` unchanged, the Reports and charting harnesses green. Ratchet: dead
names 41 -> 0, orphan modules 1 -> 0, retired tests 1 -> 0, inline unit rules
31 -> 1 (`setUnit`'s parameter default, which reads no play), alias reads 2 -> 0.

**Pass 2 — The charting fix and a clean break from old formats. APPROVED
2026-09-25 after Codex review (8 findings, all folded in below). Step 1 may start;
steps 2-6 follow in order. One installer, one smoke.**

*Why no permanent compatibility layer (coach, 2026-09-25):* it keeps old
formats alive in the code, tests, harnesses and docs forever. **Only the current
state matters.** Old exports do not matter (the coach re-exports); the many
backups exist because of the Chromium-era storage workaround, not because the
history is needed.

1. **UI state out of the charting model.** `PlayTagger` gets a plain data API;
   Chart's deck, the grid, the keyboard shortcuts and the charting service move
   to it one consumer per commit; the fake fields (`unitField`, `tagFields`,
   `playerFields`, `gradeFields`) and `PlainField` / `PlainInput` are
   deleted. Harnesses that poke fake fields are repointed at the same behavior.
   No data changes. (Codex: ready to start.)
   **DONE IN SOURCE 2026-09-25, not gated:** the data API (`20b7de6`), the deck
   (`5711690`) and the keyboard (`2ea2f83`) moved to it; the fields, their
   load/clear methods, every external call, the dead `onLoadForm` hook and the
   dead `SuggestionEngine` are deleted (`7aa0184`). The grid already wrote plays
   directly. Ratchet: `plainFieldRefs` 25 -> 0, `taggerFieldReadsOutsideTagger`
   12 -> 0. 26 charting, film, undo and Break Down harnesses green;
   `compare-builds` 64/64 byte-identical. Codex review: no code findings (one docs P3, fixed in `3f62c7c`). The gate found one orphaned CSS rule (`e8aca99`) and the pre-existing Recovery race REC-1 (`e4417b8`). **Full gate 134/134 at `e4417b8`.**
2. **The coach's hand fixes first:** the 3 plays with no unit are set by hand in
   the Unit column (storing `offense` would change their drive labels from
   `Drive N` to `Our Drive N`; Codex P2-7), and the ambiguous legacy Special
   Teams plays are charted by hand. Field position is never used to guess.
   **Worklist (live catalog, read-only, 2026-09-25), all in 2025 JV; numbers are the
   play numbers the Break Down strip shows (play id), corrected from a first draft that
   listed positions.** Chart in Break Down (side or kind uncertain): Wk 1 23;
   Wk 4 36, 56, 57; Wk 5 38, 53, 69, 77, 84, 87. Unit check (would convert to
   Offense): Wk 4 59 (strip shows a 5-2 front, possibly a defensive snap; 61 looks
   similar); Wk 5 67, 90 (passer and carrier both 81).
   Converted automatically, no hand work: the 7 certain legacy Special Teams plays,
   22 combined formations, 14 extra points on the Field Goal unit, and 33 blank
   uncharted SJM Varsity 2026 plays with no unit (clip-import LG-1; they take Offense
   like any new play). Coach decision pending: whether general yards on legacy
   return plays become return yards.
**Steps 2-5 DONE 2026-09-26.** The coach replaced the hand fixes with one rule: convert what
   maps exactly, blank the rest and log it (`docs/LEGACY-RECHART-LIST.md`, 20 plays). The
   live catalog was converted by `tools/convert-legacy-once.mjs` (`71761f5`, three Codex
   reviews), bound to the approved impact (source `0f9434c3d68b`), after a hash-verified
   backup to `C:\Users\charl\GridIronIQ-Backups\legacy-conversion-2026-09-26`; the re-read
   shows zero legacy shapes in all three seasons (440 / 195 / 123 plays, unchanged). The
   Documents mirror and older backups and versions keep the old format until step 6
   refuses them.
3. **A one-time conversion tool, current state only** (`tools/convert-legacy-once.mjs`,
   deleted after use). Target: the live seasons in the catalog. Conversions, each
   exact: every projected pair (alignment in formation and in backfield, `Empty`
   in formation, family in coverage) through the FULL commit a Film Room edit
   makes — `reconcileSiblings` AND writing the projected primary, since
   `reconcileSiblings` alone leaves `"Under Center + Flexbone"` in place (Codex
   P1-2); extra points recorded on the field-goal unit to the Try unit (the side
   is certain); legacy-only Special Teams only where kind, outcome and side are
   certain (the 2026-09-06 punt-block ruling applies). Anything it cannot settle
   stops the run and is listed; nothing is guessed.
4. **An immutable restore point before any write** (Codex P1-4): a byte-for-byte
   copy of `library.db` and the Documents season folders to a dated folder
   outside everything the tool rewrites, hash-verified, kept.
5. **Prove the outcome on the real data** (Codex P2-5): read-only copies of the
   live seasons, before and after conversion, compared play by play — identity,
   film and clip references, every field, with an explicit whitelist of the
   fields allowed to change — and every analytics result per season and game.
   A difference is judged against the football rules; a wrong old reading is
   corrected and called out to the coach. Then the coach's yes, with exact
   counts, immediately before the write; then re-read and confirm zero legacy
   shapes on charted plays.
**Step 6 DONE IN SOURCE 2026-09-26, not gated** (`8ac135b`, `93d6fdb`, `ab0d5ec`, `448c95a`).
   First the app stopped WRITING old shapes: the Special Teams number keys set the
   structured unit (1-8 in the model's unit order), Film Room's editable ST Type
   column and the CSV export's ST Type column are gone, new plays carry no
   `stType`, and auto-detect stamps, CSV import, templates and the sample season
   all go through the one look commit. Then `js/season-format.js` (the one owner
   of the retired shapes; detects, never converts) is asked first by season
   import, restore points, game versions, Documents-mirror recovery and the
   first-run JSON import; an old file is refused with a plain message and nothing
   written. Deviation from the text below: there is no stored format marker. The
   structural check is the whole test, because the converted catalog carries no
   marker and stamping one would have been a second write to coach data.
   `e2e-season-format` (20) pins it.
   **Open decision before step 7:** the Reports real-data harnesses read the
   Documents-mirror copy of 2025 JV (`CANONICAL_SEASON`, 449 plays, old format).
   Once the old readers are deleted they would read it raw.
6. **Refuse old files before any mutation** (Codex P2-8): a post-conversion format
   marker written by every save, plus structural validation, checked ahead of
   every import, restore, version restore and recovery path — before a scaffold
   season or the active game is touched. Everything not converted (older
   catalog backups and versions, file backups, Documents mirror snapshots,
   browser storage, old exports) stays on disk untouched and is refused with a
   plain message: the file uses an old format; export it again from the current
   app. Tests: old files rejected with no write; current files accepted.
7. **Delete the old-format branches, keep the current contracts** (Codex P2-6).
   An inventory, not examples: every legacy branch in `TagProjection`,
   `StatsEngine.proj`/`projField`, `migratePlayFormation`, the analytics
   registry, roster role selection, the theater, CSV import, the Special Teams
   keyboard writer, `adoptLegacyRoster`, legacy `stType`/`kickOutcome` and
   field-goal-unit extra points — while current look editing and dynamic fields
   keep working. Fixtures are converted and assertions rebaselined, not deleted;
   `e2e-legacy-roundtrip` is rewritten for the new format; the ratchet gains
   counts for these readers and they must reach zero; the docs (including
   `CLAUDE.md`'s projection rule) are rewritten.
   **Done in source 2026-09-26** (`b84e207`..`5c53b44`; Codex re-reviewed through
   `8c9248e`, no findings; later repairs `3bef026` (every stored payload validated
   before a season opens) and `42e4097`; **full gate 135/135 at `42e4097`**):
   - Canonical Reports season: a converted current-format fixture (coach
     decision; its old Special Teams values are blank until retagged) — `b84e207`.
   - Special Teams: every `stType`/`kickOutcome` reader and the field-goal-unit
     extra point deleted; fixtures structured, parity goldens re-audited —
     `0c5d393`, `c27761e`.
   - Look: `TagProjection` is a plain read; promote/strip/commit deleted; CSV
     import refuses a combined look whole; templates, auto-detect (all three
     backends, `server/analyzer.py` included) and library choices cannot
     create one (`TagLibrary.RESERVED`, per `+` token) — `ada73cf`, `0eb71ea`,
     `2153f62`, `b968df0`, `af9ab28`, `8c9248e`.
   - Roster and formation: `adoptLegacyRoster`, the durable roster migration,
     the single-game import and `migratePlayFormation` deleted; a stored season
     that is not current format is refused on open — `799767b`, `5c53b44`.
   - Ratchet: `legacyStReads`, `legacyLookReaders`, `legacyRosterReaders` at 0.
   - `e2e-legacy-roundtrip` runs on the current format (10/10);
     `e2e-legacy-film-fields` retired with `gameFromLegacy`.
   - Settings and storage-layout migrations: Pass 2b below (coach, 2026-09-26).
8. **Installer and the coach's smoke.**

*Order:* 2 and 3-5 before 7, because 7 deletes the readers step 5 compares
against. *Exit:* zero legacy readers (ratchet), zero legacy shapes on charted
plays in the live seasons, old files refused with no write, gate green, smoke
passed. *Later (efficiency stage):* backup retention reviewed — the current
state is what matters; pruning existing backups needs the coach's explicit
approval with exact counts.

**Pass 2b — Old app-settings keys and storage-layout migrations (coach, 2026-09-26).**
Bounded, separate from step 7. Saved app settings do not keep old readers
indefinitely: every old key is inventoried, a preference still in use is
carried forward by ONE one-time conversion, and then the per-feature readers
are deleted. **Version history and the season-file layouts hold game data, not
preferences, and keep the coach-data rules** (impact report with exact counts,
confirmation immediately before any write or removal, nothing deleted with the
preference code).

*Inventory, 2026-09-26.* Source: every `ffa_*` / `giq_*` key in current `js/`
(44) and every key in `js/` history that current code no longer names (11).
The installed profile was read from a COPY of
`%LOCALAPPDATA%\com.gridironiq.app\EBWebView\Default\Local Storage\leveldb`
(source hashes unchanged after the read). A LevelDB scan also finds deleted
records, so "seen in profile" means the key was written at some point, not that
it is live; live counts come from the app itself before any write.

| # | Key(s) | Reader today | Seen in profile | Class | Action |
|---|---|---|---|---|---|
| 1 | `ffa_custom_chips_<team>` → `ffa_tag_libraries_<team>` | `TagLibrary.load()` legacy branch; `_normalize`'s version < 2 / < 4 enabled additions | current key only | Preference | Convert once, then delete the branch and the version additions |
| 2 | `ffa_film_room_cols` (global list, `LEGACY_PRESETS` / `PRE_CALL_PRESETS` upgrade), `ffa_film_room_columns_default`, `ffa_film_room_cols_claimed_by` → `ffa_film_room_columns_<team>` | `PlayGrid._loadCols`, `_upgradeCols`, the claim in `_loadColSets` | claim marker + current key | Preference | Convert once; delete the presets, upgrade rule, claim and both old keys |
| 3 | `ffa_study_views_v1` saved measure ids (`successRate` → `success`, …) | `StudyScreen.LEGACY_MEASURE_UPGRADE` at open | not seen | Preference | Rewrite saved ids once; delete the upgrade map |
| 4 | `giq_home_workspace` → `giq_home_parent` | `WorkspaceContext` constructor fallback; **`team-hub-screen.js:753` still WRITES it** | both | Preference | Convert once; delete the fallback and the write |
| 5 | `ffa_team_profile` without `ffa_teams` (pre-registry install) | `TeamRegistry.ensureRegistry()` first branch | profile (current mirror) | Preference | Convert once; delete only the pre-registry branch. The key itself stays: it is the live active-team mirror |
| 6 | `ffa_beta_defaults_<version>` — one marker per version, never removed | `configureBetaDefaults` (`js/beta-config.js`) | 60+ markers | Preference | One marker key holding the version; convert once, remove the per-version keys |
| 7 | No reader at all: `ffa_video_controls_y`, `ffa_wizard_dismissed`, `ffa_wizard_v2`, `ffa_workspace_shell_v2`, `ffa_breakdown_form_v2`, `ffa_film_room_collapsed`, `ffa_film_room_hint_dismissed`, `ffa_tour_done`, `ffa_season_games` | none | first four | Dead UI state | Remove once |
| 8 | `ffa_roster`, `ffa_roster_<…>` | none | **live: `ffa_roster` 19 players, 1,143 bytes, equal to the 2025 JV season roster (order and every field; SHA-256 `8a631d3f…f5a8c7`); `ffa_roster_mavericks` `[]`, 2 bytes (`4f53cda1…02b945`)** | Coach data, no unique content | **Archived and verified 2026-09-26** to `C:\Users\charl\GridIronIQ-Backups\retired-roster-keys-2026-09-26` (manifest SHA-256 `2a1458c7…e11e05`); removal: the checkpoint below |
| 9 | `ffa_versions_<season>::<game>` → catalog `versions` table | `VersionManager.migrateLegacy` (verified read-back, key removed only after) | 8 scoped keys | **Coach data (game snapshots)** | Keep the migrator until the installed smoke proves every scoped key moved (its `{moved, kept, failed}` report); then delete it with the coach's confirmation |
| 10 | `ffa_versions_default`, unscoped `ffa_versions_<file>` | none — the migrator deliberately never touches them | **live: 1 key, `ffa_versions_default`, 20 snapshots (86 plays each, Our Lady of the Lakes, 2026-06-26..07-02), 748,320 bytes, SHA-256 `94cf7f7e…c7a9a6`; no scoped version keys remain** | **Coach data (game snapshots), no ownership** | **Exported and verified 2026-09-26** to `C:\Users\charl\GridIronIQ-Backups\unscoped-version-history-2026-09-26` (original bytes, manifest SHA-256 `e7ee1396…6b90fd0`, source LevelDB copied); never restored or assigned by the app; removal: the checkpoint below |
| 11 | `ffa_season` (browser), `season.json` (desktop) → per-season layout; first-run JSON → catalog (`migrateJsonSeasons`); unenveloped backups (`legacy-unenveloped`) | `StorageBackend._migrateLegacy`, `CatalogPersistence.migrateJsonSeasons`, `SnapshotEnvelope` | no `season.json` on this machine | **Coach data (season files, backups)** | Measure; convert or refuse under the coach-data rules; never delete with the preference code |
| 12 | `tags.custom` not an array → `[value]` in `SeasonStore._normalize` | season data | — | **Step 7 leftover (season data)** | Measure on the live seasons; if zero, make it a `SeasonFormat` refusal and delete the coercion |

*Removal checkpoint for rows 8 and 10 (coach-confirmed 2026-09-26; `a70c52e`, `f4a97d6`).* `js/storage-cleanup.js` runs once at boot, after the version move: it removes `ffa_versions_default`, `ffa_roster` and `ffa_roster_mavericks` only when each value still hashes to its archived SHA-256, refuses a mismatch (or a value changed during the check) and leaves it as it is, reads every removal back, and keeps a write-ahead per-key receipt (`giq_storage_cleanup_2026_09_26_journal`: hash, bytes and archive written before each removal, finalized after the read-back; no receipt, no removal); a partial or interrupted run resumes from it, a failed receipt write is reported, and the final report goes under `giq_storage_cleanup_2026_09_26` once every key is settled (review repair `d663cfe`). Nothing is restored or assigned and scoped version history is not a target. Both archives are kept. **Installed check (step 8):** re-read a copy of the profile after the first launch — the three keys gone, the marker listing three `removed` results. Then the module is deleted.

*Done in source 2026-09-26 (`7b9b09a`, `b16ae99`; full gate pending).* Rows 1-7 are converted once at boot by `js/settings-format.js` (marker `giq_settings_format_2026_09_26`) and their readers are deleted; the ratchet counts `legacySettingsReaders` at 0. Two corrections to the inventory: the Film Room `ffa_film_room_columns_default` key is CURRENT (written while no program is active) and PlayGrid keeps handing it to the first program; and the registry conversion runs first, because the column conversion needs the active program. Row 12 is done: `tags.custom` in any shape but a list is a `SeasonFormat` refusal (live catalog: 758 plays, all lists) and the coercion is deleted. **Rows 9 and 11 are coach data and still open:** the scoped version migrator (the installed profile already holds no scoped version keys) and the season-file layout migrations (`ffa_season`, `season.json`, none on this machine; first-run JSON import; unenveloped backups). Removing any of them needs the coach's decision.

*Procedure.* (a) One owner, `js/settings-format.js`, runs ONCE per profile
at boot behind a stored settings-format marker: rows 1-7 are converted into the
current keys, each old key removed only after the current key reads back, and
the per-feature readers (rows 1-5) are deleted in the same change. (b) Rows 8-12
are not touched by that owner: each gets an impact report from the live
profile and the coach's confirmation before any write. (c) The one-time
converter and the version migrator are deleted in a later release, after the
coach's installed profile has run them and the smoke confirms the counts. (d)
Harnesses: each conversion from a seeded old profile, each old key removed only
after a verified write, a failed write leaving the old key intact, no reader
left (ratchet count `legacySettingsReaders` to 0).

**Pass 3 — Optional, when the coach wants it (was Phases 4 and 6).**
- Settings out of localStorage into the catalog (ends the 5 MB failure class,
  lets settings travel with a season, unblocks the mobile companion).
- The four remaining old-style screens (roster, custom fields, scoreboard
  reading, auto-detect) rebuilt in Preact; `window.app` lookups made explicit.

**After the passes (coach, 2026-09-25): precision and efficiency.** Once the old
stuff is gone, the next work is making what remains lean: consolidating the four
storage layers (`storage.js`, `storage-backend.js`, `season-store.js`, the catalog,
~6k lines) and deduplicating and splitting `stats-engine.js` (6,786 lines), with
`e2e-parity` proving every number unchanged. Measured 2026-09-25: 32,822 lines of
app code, 10,579 comment lines, 5,945 of CSS; the passes are expected to remove
~10-15% of the code, measured as they land.

**Coach decisions, not scheduled:** the web target (dropping it allows native
SQLite and native video) and splitting `stats-engine.js`.

## Live legacy on 2026-09-25 (input to the Pass 2 conversion)

**Supersedes the July-mirror counts in the table above** (127 / 75 / 18 /
6), which came from a stale Documents copy. Source: a read-only copy of
`%APPDATA%\com.gridironiq.app\seasons\library.db` (SHA-256 `2ADB815C…DAA57`,
unchanged after the read). The coach first offered to retag these by hand;
the Pass 2 decision superseded that the same day: the one-time conversion converts the
first two lists, and the coach charts only the Special Teams plays it cannot
settle. Nothing has been changed yet.

**2025 St. Joseph Mavericks - JV (catalog id `2026-varsity-demo`, 440 plays):
42 plays.** SJM JV 2026 (123) has none. SJM Varsity 2026 (195) has only the
blank placeholders below.

*No unit (3) — the conversion stores the counted unit.* Week 4 play 59; Week 5 plays
67, 90.

*Combined formation string (22) — the conversion splits each into Formation and QB
alignment with `TagProjection.reconcileSiblings`, the same commit a Film Room
edit makes; the shown formation stays the same.* Week 2: 54 `Ace + Shotgun`, 58 `Shotgun + Trips + Unbalanced`, 61 and
62 `Trips + Unbalanced + Shotgun`, 74 `Shotgun + Trips + Unbalanced`, 77 `Ace +
Shotgun`, 79 `Shotgun + Trips + Bunch + Unbalanced`. Week 3: 80 `Ace +
Shotgun`. Week 4: 20 and 22 `Shotgun + Single Wing`, 48 `Flexbone + Under
Center`, 62-70 `Under Center + Flexbone`. Week 5: 84 `Ace + Under Center`, 90
`Shotgun + Twins`.

*Legacy-only Special Teams (17) — the conversion converts those whose kind, outcome
and side are certain; the coach charts the rest in Chart's Special Teams
editor (which writes the structured event).* Week 1:
23 XP. Week 2: 56 Punt; 64 XP, Good; 65 Kick Return. Week 4: 36 XP; 56 XP, No
Good; 57 Kickoff, Muffed; 71 Kick Return, Fair Catch. Week 5: 21 Punt Return,
Fair Catch; 38 XP; 39 Kick Return; 53 XP, No Good; 69 Kickoff, Fair Catch; 73
Kick Return; 77 Punt, Downed; 84 Kickoff, Fair Catch (it also holds a
formation, which Special Teams strips); 87 Kickoff, Fair Catch.

**Not legacy — a creation defect (logged in `docs/OPEN-DEFECTS.md`, LG-1):**
SJM Varsity 2026 has 33 plays whose tags hold only blank fields and no `unit`
key — Week 4 vs Oakland Christian plays 31-34 and 37-64, and vs Romeo play 1.
Nothing was charted on them; they get a unit when charted. (First recorded as
"completely empty"; `audit-legacy --live` shows the tag object exists with
blank fields, so the defect is a creation path that omits `unit`.)

**Done when:** a re-read of the live catalog shows zero plays in all three
lists. That is part of Pass 2's exit criterion above; the one-time tool is the migration.

## What the coach sees

| Pass | Changes the app? | Coach involvement | Installer |
|---|---|---|---|
| 0 Guardrails | No | None | No (done) |
| 1 Cleanup | No (bytes identical) | None | No |
| 2 Charting fix + clean break | Charting internals; old formats converted once, then removed | A yes before the one-time write; chart the listed ambiguous plays; smoke | Yes |
| 3 Optional | Settings storage; four screens | Smoke | Yes |

## Decided

- After the agreed excision is complete, audit instruction bloat using
  `docs/POST-LEGACY-INSTRUCTION-AUDIT.md`. Read-only first; cleanup requires
  separate approval and must preserve coach-data and regression safeguards.

- Old to new, converted ONCE by a throwaway tool, then every old-format reader
  removed; no permanent door (coach, 2026-09-25). Old exports need not load.
- Outcomes match where today's reading is accurate; a wrong reading is
  corrected, recorded, not copied (coach, 2026-09-25).
