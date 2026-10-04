# SMOKE 1.12.0-91 — Windows x64 Beta (unsigned)

**Packaged from:** `df9d5f7` (`fix: keep the Players capacity properties
surface-local`), bumped in `894576d`.
**Canonical gate:** 120 harnesses, 120 green, 0 skipped, 0 failed, run at
`df9d5f7` before the bump. `e2e-p0-exit` re-run after the bump (19/19), which is
the check that pins all four version declarations to `1.12.0-91`.
**Bundles:**
`src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-91_x64-setup.exe` and
`src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-91_x64_en-US.msi`.
`cargo tauri build` exits 1 AFTER producing both, on the updater signing step
(`TAURI_SIGNING_PRIVATE_KEY` unset) — the standing condition of every unsigned
beta package here, not a build failure.
**Status:** unsigned, not tagged, not pushed, not published. Nothing here is
accepted: this package exists so the `1.12.0-90` REVISE repairs can be re-smoked.
Home production remains formally `REJECTED`.

## What it carries over 1.12.0-90

The two REVISE verdicts from the `1.12.0-90` installed smoke, repaired over
`fb85610..894576d` and reviewed by Codex with no findings.

**Reports > Players — composition (`c8d1824`).** The rejected layout paired
populated roles two at a time in board order, which put Receiving beside Tackles
and left a one-row module as dead space beside a six-row one. Roles now group by
PHASE — Offense (Rushing, Passing, Receiving), Defense (Tackles), Special Teams
(Return Game, Kicking / Punting) — contiguous and in that order, two phase
columns at desktop width and one below 1420px. Each role declares a row capacity
(3, 6 or 9, sized from the real canonical range); Passing is 3. Unused slots are
the shared held dash row; a cohort past capacity scrolls inside the module body
while the module header and the column header stay put. Sorting, scope and phase
filters move no module height.

**Reports > Defense — cohort labels only (`c8d1824`).** The arithmetic was
reconciled as correct and is unchanged. Each module now names the cohort it
measures, in counts, inside the existing header: `15 run/pass snaps`,
`15 snaps · 18 tags`, `14 direction-tagged snaps`, `20 snaps · penalties
included`. Every count is computed from the rows it describes.

**One gate-found repair (`df9d5f7`).** The Players row-capacity custom properties
carried the `--gi-*` design-token prefix, which `e2e-design-system` correctly read
as unresolved token references. They are surface-local geometry, not palette
tokens, and now use the local prefix the Defense board already uses.

Special Teams was untouched: no engine file changed, and
`e2e-reports-special-teams` is 57/57 with `e2e-parity` 2/2 and no golden edited.

## What to look at on the installed build

1. **Players composition, at your normal window size and narrower.** Offense,
   Defense and Special Teams must each read as one unmistakable group, with
   Rushing, Passing, Receiving in that order and no offense/defense interleaving.
2. **Passing shows exactly three row slots**, with dashes filling what the cohort
   does not. Check Full season too, where Rushing, Tackles and Return Game go
   past capacity and should scroll inside themselves with both headers staying
   put.
3. **Nothing moves when you sort or switch scope/phase.** Module heights are
   owned by capacity, not by the cohort.
4. **Defense > Current game on Week 1 vs St. Peter.** The four cohort labels
   should make the zeros legible: the KPI strip measures 15 run/pass snaps, the
   play-type rows overlap (15 snaps, 18 tags) and must not be summed, direction
   covers 14 snaps, possessions include penalty movement.
5. **The Defense totals must still read 0 / 0 / 0 / 0.0** on that game. That is
   the measured truth for a 41-0 shutout, not a failure — every down-and-distance
   transition in the charted data reconciles with it.
6. **Ordinary charting and film playback**, because the Players work touched the
   shared report view layer.

## Result

**PASSED — approved by the coach on 2026-09-21.** The installed build is
accepted for continued beta use.

What that approval covers, precisely:

- **Reports > Players composition.** The phase grouping, the row capacities with
  Passing at three slots, the held dash rows and the internal scrolling with
  fixed headers are accepted as built. The `1.12.0-90` REVISE is CLOSED.
- **Reports > Defense cohort presentation.** The four computed cohort labels are
  accepted. The `1.12.0-90` presentation REVISE is CLOSED, and the arithmetic it
  sat beside was already reconciled as correct — the St. Peter zeros stand.
- **Reports > Special Teams.** Its provisional pass is confirmed by this smoke;
  the surface was unchanged between the two packages.

What it does NOT cover, and must not be read into it:

- **Home production remains formally `REJECTED`.** It was not in scope here.
- **`design-approvals/APPROVALS.json` is unchanged.** Every Reports manifest
  still reads `productionStatus: REJECTED`. Moving a surface to
  `PRODUCTION_ACCEPTED` is a separate registry change with its own hash-verified
  evidence, and the registry audit is currently red for an unrelated Home reason
  (`docs/OPEN-DEFECTS.md`, Deferred Beta Maintenance 3).
- **The other Reports surfaces** — Overview, Offense, Self-Scout, Season,
  Matchup — were not part of this smoke and keep their existing status.
- This build is still unsigned, untagged, unpushed and unpublished.
