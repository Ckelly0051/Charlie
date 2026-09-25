# Legacy excision — plan

Coach direction, 2026-09-25: excising legacy code is the next step, done
properly rather than around. **Status: APPROVED by the coach (2026-09-25), to be
audited by Codex before work starts.** Base: `1.12.0-102` (`f6e1490`), full gate 131/131.

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
6. **Review and confirm.** Codex reviews each phase's commits against this
   plan before the gate; the coach confirms before any gate and any installer.

## Phases (smallest risk first; each is independently shippable)

**Phase 0 — Guardrails and inventory (no product change).**
Build `compare-builds.mjs` and `e2e-legacy-roundtrip`; add
`tools/audit-legacy.mjs`, a read-only scan that regenerates the table above
(unreferenced names, inline unit readings, fake-field reads, localStorage keys,
`window.app` lookups, `innerHTML` sinks, legacy data shapes on the canonical
copy) so progress is measured, not asserted.
*Done when:* all three run in the gate and the inventory matches this table.

**Phase 1 — Dead code (A).** Delete every unreferenced name and file; check
each for string-built or dynamic use first.
*Proof:* the build (a missing import fails it), the gate, compare-builds
identical. *Risk:* lowest.

**Phase 2 — One owner per rule (B).** All 34 unit readings to `countedUnit`;
`PROJECTED_PAIRS` readers to `TagProjection`; the pass-throughs' one harness
repointed; then delete the copies.
*Proof:* `e2e-parity` unchanged, gate, compare-builds identical.

**Phase 3 — Take UI state out of the domain model (C).** This is the root of
S99-2 and CR-1..3. `PlayTagger` gets a plain data API (read and write a play's
fields); Chart's deck, the grid, the keyboard shortcuts and the charting
service move to it one per commit; `unitField` and the other fake fields are
deleted with `PlainField`. The 10 harnesses that poke fake fields are
repointed at the same behavior, each named in its commit.
*Proof:* gate, compare-builds identical, `e2e-unit-ownership` and the charting
harnesses. *Installer and smoke after this phase* — it touches every charting
path.

**Phase 4 — Settings out of localStorage (E-1).** Per-team settings move into
the catalog (the path version history already took), read from localStorage
one release as a fallback, then that read is removed. Ends the 5 MB failure
class, lets settings travel with a season, and unblocks the mobile companion.
*Proof:* a migration harness on a full profile; installer and smoke.

**Phase 5 — Migrate the coach's legacy data, then delete its readers (D).**
One shape at a time, each its own coach decision:
1. **Combined formation strings (127 plays)** → split into formation, QB
   alignment and backfield using the SAME projection that reads them today, so
   the stored value becomes what the screen already shows.
2. **Plays with no unit (18)** → stored `offense`, which is what every screen
   and report already counts them as. *Coach decision:* store it, or leave them
   and keep `countedUnit`'s default.
3. **Legacy-only Special Teams (75)** → structured events only where the
   legacy fields settle kind, outcome and side with certainty; the rest stay
   legacy and are listed. *Highest care: the legacy punt-block ownership
   ruling (2026-09-06) applies.*
4. **Rosters on game nodes** → already governed by the one-owner roster
   migration; verify it ran on the live catalog, then remove the reader.

Each: dry-run counts on the canonical copy → coach's yes → restore point →
migrate → readers kept one installed release → readers deleted after that
smoke passes. *Proof:* `e2e-parity` on the migrated copy equals the unmigrated
reading, byte-for-byte, except the audited, coach-approved differences.

**Phase 6 — Remaining legacy screens and lookups (E-2).** The 41 raw
`innerHTML` screens (roster, custom fields, scoreboard reading, auto-detect)
become Preact components; `window.app` lookups in screens become explicit
dependencies, screen by screen.

**Coach decisions, not scheduled:** the web target (dropping it allows native
SQLite and native video) and splitting `stats-engine.js`.

## Phase 5 retag list — measured on the LIVE catalog (2026-09-25)

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
SJM Varsity 2026 has 33 plays whose tags are completely empty — Week 4 vs
Oakland Christian plays 31-34 and 37-64, and vs Romeo play 1. Nothing was
charted on them; they get a unit when charted.

**Done when:** a re-read of the live catalog shows zero plays in all three
lists. Phase 5 then reduces to deleting the compatibility readers, with no
migration code.

## Order, sizing and what the coach sees

| Phase | Changes the app? | Coach involvement | Installer |
|---|---|---|---|
| 0 Guardrails | No | None | No |
| 1 Dead code | No (bytes identical) | None | No |
| 2 One owner | No (bytes identical) | None | No |
| 3 UI state out of the model | Internals only | Smoke | Yes |
| 4 Settings to catalog | Storage only | Smoke on real profile | Yes |
| 5 Data migration | **The coach's data** | A yes per shape, then smoke | Yes, per shape |
| 6 Legacy screens | Look of four screens | Smoke | Yes |

Phases 0-2 are safe to run back to back. Phase 3 is the one that stops this
class of bug. Phase 5 is the one that finally lets the compatibility readers
go, and it cannot happen without the coach.

## Open questions for the coach

1. Approve the plan and the order?
2. Phase 5.2: store `offense` on the 18 plays with no unit, or leave them?
3. Keep old readers for one installed release after each migration (the
   safe default), or delete them in the same release?
