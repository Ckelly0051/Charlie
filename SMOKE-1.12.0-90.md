# SMOKE 1.12.0-90 — Windows x64 Beta (unsigned)

**Packaged from:** `1a42282` (`fix: point the Players capability at its live
assertion`), bumped in `aff2dd4`.
**Canonical gate:** 120 harnesses, 120 green, 0 skipped, 0 failed, run at
`1a42282` before the bump. `e2e-p0-exit` re-run after the bump (19/19), which is
the check that pins all four version declarations to `1.12.0-90`.
**Bundles:**
`src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-90_x64-setup.exe` and
`src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-90_x64_en-US.msi`.
`cargo tauri build` exits 1 AFTER producing both, on the updater signing step
(`no private key` — `TAURI_SIGNING_PRIVATE_KEY` is unset). That is the standing
condition of every unsigned beta package here, not a build failure.
**Status:** unsigned, not tagged, not pushed, not published. Reports > Players
Revision 2 and Reports > Special Teams have had no Charlie Gate, Reports >
Defense Revision 2 has had none either, and Home production remains formally
`REJECTED`. This package exists so the installed WebView2 smoke can run.

## Why `-89` was not reused

`1.12.0-89` is already the packaged Defense scoring-ownership candidate
(`SMOKE-1.12.0-89.md`, from `95310d6`). Fifteen commits have landed since that
bump, so this checkpoint takes its own number rather than shipping different
bytes under a number a smoke record already describes.

## What it carries over 1.12.0-89

**Reports > Special Teams acceptance pass** (`1e27967`, `79abcf9`, `aad288b`,
`739b5b2`)

- A blocked punt is charted on the unit that fields one: `puntReturn` is
  displayed as `Punt Return / Block` and its outcome vocabulary gained
  `Blocked`. No `puntBlock` schema value, no migration.
  `SpecialTeamsModel.UNIT_LABELS` is now the one owner of the coach-facing unit
  names, which the deck, chyron, Film Room grid, Study dimension and Reports
  ledger each used to copy.
- A loose ball has no default owner: on `blocked`, `muffed` or `recovered`, a
  touchdown with `recoveredBy` blank or `unknown` is attributed to neither team
  and its points land in the scoreboard's `unattributed` total. It previously
  fell through to the receiving-unit default and awarded us six points.
- The unassigned disclosure is counted from film references per snap rather than
  by subtracting module counts, which mis-stated a mixed structured/legacy
  cohort — the shape the coach's own screen showed.
- The board is at the 12.5px floor with literal labels.

**Reports > Players Revision 2** (`99b216a`, `a813490`, `9402913`, `5471cb9`,
`12c0de0`, `790e192`, `f86d240`)

- One credit index (`_playerCredits`) owns every number and every clip;
  `_individualStats` derives its long-standing output from it, proven
  byte-identical by `e2e-parity` on both cohorts.
- Identity opens a new in-tab player detail view; each measured statistic opens
  exactly its own bucket's film. Game-by-game and situational splits, a
  Selected-games scope, a per-table column menu and a player-specific export.
- Seven review findings repaired across the range, the last three being: the
  HTML export's game summaries (a punt-only kicker printed `0 field goal
  attempts`), unmeasured values sorting as zero ahead of real negative values,
  and `Long` clamped at zero while its film link opened the negative play.
- Codex reviewed `5471cb9..790e192` with no findings. That is a CODE checkpoint
  only; Players production status is unchanged.

**Registry correction** (`1a42282`) — the P0 capability registry still named the
pre-Revision-2 Players assertion, which failed the whole-gate run at `f86d240`.
It now names the live per-statistic assertion.

## What to look at on the installed build

Chromium cannot certify any of this; that is the whole reason this package
exists.

1. **Special Teams, a blocked punt end to end.** Chart a punt return with
   outcome `Blocked`, subject possession, `Touchdown`. Confirm six points for
   us and none for the opponent, one punt blocked and one punt-return
   touchdown, and that the film action opens exactly that play. Then reopen the
   season and confirm all of it survived.
2. **A loose ball with no possession charted.** Same play with `recoveredBy`
   left blank: the points must reach neither team's total.
3. **Players detail.** Open a player from the leaderboard identity cell, then
   click individual statistics — each must open only the plays behind that
   number. Check a rusher whose long carry is a loss: the number and the clip
   must be the same play.
4. **Players export** with a player open: the game-by-game summaries must state
   real production (punt yards for a punter, the interception for a
   takeaway-only defender), never a leading `0`.
5. **The situational table's sorting**, ascending and descending, where some
   rows have no value: `No data` rows must stay last in both directions.
6. **Ordinary charting and film playback**, because the credit-index rewrite
   touched the engine every report reads.

## Result

Not yet run.
