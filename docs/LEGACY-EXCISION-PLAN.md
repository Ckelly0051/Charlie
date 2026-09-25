# Legacy excision — plan

Coach direction, 2026-09-25: excising legacy code is the next step, done
properly rather than around. **Status: APPROVED by the coach (2026-09-25), cut to three passes the same
day; Codex audit before Pass 1 starts.** Base: `1.12.0-102` (`f6e1490`), full gate 131/131.

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

**Pass 2 — The charting fix and a clean break from old formats. PROPOSED
2026-09-25, pending Codex review. One installer, one smoke.**

*Why this replaced the "one legacy door" (coach, 2026-09-25):* a permanent door
keeps old formats alive in the code, the tests, the harnesses and these docs
forever. Old exports do not matter (the coach re-exports), and the ~2,000 old
formations in restore points are the same few plays saved repeatedly. So old
formats are converted ONCE and then removed from the product entirely.

1. **UI state out of the charting model.** `PlayTagger` gets a plain data API;
   Chart's deck, the grid, the keyboard shortcuts and the charting service move
   to it one consumer per commit; the fake fields (`unitField`, `tagFields`,
   `playerFields`, `gradeFields`) and `PlainField` / `PlainInput` are
   deleted. Harnesses that poke fake fields are repointed at the same behavior,
   each named in its commit. No data changes in this step.
2. **A one-time conversion tool** (`tools/convert-legacy-once.mjs`, deleted
   after use). It converts every legacy shape with the logic that reads it
   today: combined formation strings to formation / QB alignment / backfield
   (`TagProjection.reconcileSiblings`); a play with no stored unit to its
   counted unit; legacy-only Special Teams to a structured event only where
   kind, outcome and side are certain; game-node rosters through the existing
   roster boundary. Its targets: every season, every backup and every version
   snapshot in the live catalog (`%APPDATA%\com.gridironiq.app\seasons\library.db`),
   and the canonical Documents season the tests read. Dry run first with exact
   counts per target; nothing ambiguous is guessed (it is listed for the coach
   to chart).
3. **Prove the outcome before writing.** On read-only copies: `e2e-parity`
   (every analytics number), exact `gameId::playId` film references and
   `compare-builds` are identical between the old data read through today's
   readers and the converted data. A difference is judged against the football
   rules; a wrong old reading is corrected, not copied, and every correction is
   called out to the coach in the handoff.
4. **Run it once** with the coach's yes, immediately before the write, behind a
   restore point; re-read and confirm zero convertible legacy shapes remain on
   charted plays in every target. The coach charts the listed ambiguous plays.
5. **Delete every old-format reader:** read-time combined-formation projection,
   legacy `stType` / `kickOutcome` paths in the engine and screens, legacy
   roster promotion, and every test, fixture, harness section and doc passage
   that exists only to exercise old shapes. The ratchet and `audit-legacy`
   gain counts for these and must reach zero.
6. **Old files fail cleanly.** Importing or restoring a file in an old format
   gives a plain message (the file uses an old format; export it again from the
   current app) and changes nothing. No silent half-reading.
7. **Installer and the coach's smoke.**

*Order matters:* step 5 deletes the readers step 3 compares against, so steps
2-4 must finish, and the conversion be verified, before step 5 starts.
*Exit criterion:* zero legacy readers in source (ratchet), zero legacy shapes on
charted plays in the live catalog and the canonical season, old-format imports
rejected with the message, gate green, installed smoke passed.

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

- Old to new, converted ONCE by a throwaway tool, then every old-format reader
  removed; no permanent door (coach, 2026-09-25). Old exports need not load.
- Outcomes match where today's reading is accurate; a wrong reading is
  corrected, recorded, not copied (coach, 2026-09-25).
