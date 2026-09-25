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
- *Proof:* the build, `e2e-parity` unchanged, the gate, `compare-builds`
  64/64 identical, the ratchet lowered in the same commits.

**Pass 1 — DONE IN SOURCE (2026-09-25), full gate pending.** `ecbe8b4` LG-1: one
blank tag schema (`PlayTagger.blankTags`) for every new play, clip import sets a
unit. `2a3adda` dead code: 42 definitions, `report-visual-data.js` and the
retired test, 1,057 lines. `5e3f46d` one owner per rule: 30 copies of the unit
rule to `countedUnit`, the `PROJECTED_PAIRS` alias and the cell pass-throughs.
Each step: compare-builds 64/64 byte-identical against the step before,
`e2e-parity` unchanged, the Reports and charting harnesses green. Ratchet: dead
names 41 -> 0, orphan modules 1 -> 0, retired tests 1 -> 0, inline unit rules
31 -> 1 (`setUnit`'s parameter default, which reads no play), alias reads 2 -> 0.

**Pass 2 — The charting fix (was Phases 3 and 5). One installer, one smoke.**
- Take UI state out of the charting model — the root of S99-2 and CR-1..3.
  `PlayTagger` gets a plain data API; Chart's deck, the grid, the keyboard
  shortcuts and the charting service move to it one per commit; the fake
  fields (`unitField`, `tagFields`, `playerFields`, `gradeFields`) and
  `PlainField` / `PlainInput` are deleted. Harnesses that poke fake fields are
  repointed at the same behavior, each named in its commit.
- The coach retags the 42 plays below by hand; a read-only re-read of the live
  catalog must show zero left in every list.
- **ONE LEGACY DOOR (coach, 2026-09-25: "we are old to new. that's the
  point").** Stored legacy shapes do not end with the live catalog: on
  2026-09-25, 90 of 95 version snapshots and 25 of 75 backups held them (2,016
  combined formations, 1,150 legacy-only Special Teams plays), and imports and
  exported files carry them too. So the readers are not deleted after "one more
  release" (Codex's P1 fix, which cannot end), and not kept scattered either.
  Every entry — open, import, backup restore, version restore — passes through
  ONE upgrade step that converts old shapes to the current shape with the same
  logic that reads them today (the roster boundary, `adoptLegacyRoster`, is the
  proven pattern). The ~150 scattered legacy reads (combined-formation
  projection at read time, legacy `stType` paths in the engine and screens)
  are then deleted; the door is permanent, small, in one file, and tested
  against the real snapshots. A shape the door cannot convert with certainty (an
  ambiguous legacy Special Teams play) stays as it is, is flagged for review,
  and is read by one consolidated reader. The next save stores the new shape.
- **The outcome must match — where today's reading is accurate (coach,
  2026-09-25).** Acceptance for the door: `e2e-parity` (every analytics
  number), exact `gameId::playId` film references and `compare-builds` are
  identical between the old data read through today's readers and the
  converted data. Where they differ, the difference is judged against the
  football rules: if today's reading is wrong, the door produces the correct
  answer and the correction is recorded (as an audited parity correction), not
  copied. Not a coach decision per difference — but **every correction is
  called out to the coach in the handoff** (what the old reading said, what is
  right, why, which plays and numbers move); none is left only in a commit.
- The coach charts only what the door cannot convert (the ambiguous Special
  Teams plays); the combined formations and units convert at the door.
- **Exit criterion:** a read-only re-read of the live catalog, the backups and
  the version snapshots finds no convertible legacy shape left on CHARTED
  plays (uncharted placeholders are not legacy data; LG-1 fixes their writer),
  and the ambiguous remainder is listed.
- *Proof:* the gate, `e2e-unit-ownership`, the charting harnesses,
  `e2e-legacy-roundtrip` (every charted value survives), `compare-builds`
  identical except intended changes, then the installed smoke.

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

## Pass 2 retag list — measured on the LIVE catalog (2026-09-25)

**Supersedes the July-mirror counts in the table above** (127 / 75 / 18 /
6), which came from a stale Documents copy. Source: a read-only copy of
`%APPDATA%\com.gridironiq.app\seasons\library.db` (SHA-256 `2ADB815C…DAA57`,
unchanged after the read). Coach direction: the coach retags these by hand;
**Codex audits this list and the plan first, then we attack it.** Nothing has
been changed.

**2025 St. Joseph Mavericks - JV (catalog id `2026-varsity-demo`, 440 plays):
42 plays.** SJM JV 2026 (123) has none. SJM Varsity 2026 (195) has only the
blank placeholders below.

*No unit (3) — set in Film Room's Unit column.* Week 4 play 59; Week 5 plays
67, 90.

*Combined formation string (22) — open the Formation cell in Film Room and
press Done unchanged; the grid's commit (`TagProjection.reconcileSiblings`)
splits it into Formation and QB alignment and the shown formation stays the
same.* Week 2: 54 `Ace + Shotgun`, 58 `Shotgun + Trips + Unbalanced`, 61 and
62 `Trips + Unbalanced + Shotgun`, 74 `Shotgun + Trips + Unbalanced`, 77 `Ace +
Shotgun`, 79 `Shotgun + Trips + Bunch + Unbalanced`. Week 3: 80 `Ace +
Shotgun`. Week 4: 20 and 22 `Shotgun + Single Wing`, 48 `Flexbone + Under
Center`, 62-70 `Under Center + Flexbone`. Week 5: 84 `Ace + Under Center`, 90
`Shotgun + Twins`. *Offered alternative, not approved:* run that same commit
on all 22 in one pass, behind a restore point, with the coach's yes.

*Legacy-only Special Teams (17) — open in Chart, set Special Teams, then the
Special Teams unit and outcome (which writes the structured event).* Week 1:
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
lists. Pass 2 then deletes the compatibility readers, with no migration code.

## What the coach sees

| Pass | Changes the app? | Coach involvement | Installer |
|---|---|---|---|
| 0 Guardrails | No | None | No (done) |
| 1 Cleanup | No (bytes identical) | None | No |
| 2 Charting fix | Charting internals; old readers removed | Retag 42 plays, then smoke | Yes |
| 3 Optional | Settings storage; four screens | Smoke | Yes |

## Decided

- Old to new at one door; the next save stores the new shape (coach,
  2026-09-25). The manual 22-formation retag is superseded by the door.
- Outcomes match where today's reading is accurate; a wrong reading is
  corrected, recorded, not copied (coach, 2026-09-25).
