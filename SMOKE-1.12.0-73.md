# GridIron IQ 1.12.0-73 Beta Smoke — the whole Reports set

## Candidate

- Installer: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-73_x64-setup.exe`
  (3.80 MB). An MSI is beside it at
  `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-73_x64_en-US.msi`
  (5.30 MB); the NSIS setup is the one to install.
- Built: 2026-09-06
- Baseline: `fafff62` plus synchronized `1.12.0-73` release metadata
- SHA-256 (NSIS setup):
  `D60E294A12E988703D0BDF634AA10142244D8FB394DB614F98C283EC92989553`
- Windows x64 NSIS; unsigned OS package; updater-artifact signing disabled only
  for this local smoke candidate.

## What this candidate is for

Every Reports tab has now had its design pass and is built, and none of them has
had a Charlie Gate. This is the first installed build where the whole set can be
reviewed together, on real film, at the release widths.

**Nothing in Reports is accepted state.** Overview and Offense, Defense, Special
Teams, Players, Self-Scout, Season and Matchup are all gate-verified and
independently reviewed, and all are waiting on exactly this. Treat the whole
route as under review.

## Primary smoke — Reports

Open a real season with charted film and work the route end to end.

- **Every tab renders on real data** at 1920, 1440 and 1280: Overview, Offense,
  Defense, Special Teams, Players, Self-Scout, Season, Matchup. No page-level
  horizontal scrollbar, no clipped cell or header, no unreadable type.
- **Navigation is coherent across the set.** Offense still scrolls one
  continuous page while Defense, Special Teams, Players, Self-Scout, Season and
  Matchup use section or direction tabs. That inconsistency is known and
  deliberate until Offense converts — judge whether it is tolerable in use.
- **The frame above the board.** Overview, Offense and Defense show the
  scorebug; every other tab still shows the generic current-game rail. On
  Special Teams at Full season, and on Matchup with an opponent selected, that
  rail describes the current game while the board describes something wider.
  Both are recorded, both are waiting on the shared report header.
- **Click through to film from each board.** A row, tile or film control should
  open exactly the plays behind the number it sits on, across games where the
  scope is a season.
- **Exports.** Defense, Self-Scout, Special Teams and Season each export; check
  the file reports the same scope and structure as the board it came from.
- **Reopen the app** and confirm the selected team/season/game, film links,
  charted plays and roster survive.

## Per-board questions already carried into this gate

- **Offense** — Backfield renders narrower than Personnel in the Zone 3 band
  because the data holds fewer distinct backfield values. Honest floor, or
  something to fill?
- **Defense** — three band gaps (Run / pass faced 78px, Opponent play type 86px,
  Situational defense 72px) from genuinely different row counts. Stretching rows
  and full-width tables were both tried and rejected.
- **Special Teams** — full-season board under a game-specific frame, above.
- **Players** — no open questions; review the six roles at both scopes.
- **Self-Scout** — Top and Worst Calls overlap when fewer than six calls qualify
  (with one qualified call it is both); the predictability map is auto-layout,
  so a sparse season stretches two columns across the panel; `Yds / Play` prints
  `6` rather than `6.0`.
- **Season** — the comp's four open decisions stand (`Yards / Game` versus
  `Total Yards`, whether Situational Offense belongs on Overview or in Trends,
  the compact quarter table versus the bar treatment, and what a Game Log row
  should open — that row action is deliberately unbuilt until it is answered).
  Also: Wins vs Losses is a three-column table, so its pair sits well right of
  the metric label; and `Games` counts every scheduled game while `Yards / Game`
  divides by the charted ones.
- **Matchup** — the board carries no green/red performance tone, because there
  is no canonical good/bad threshold for Yds / Play or Success and inventing one
  is the inferred advantage this board refuses to compute. Also: when the
  opponent's film is a game we PLAYED rather than a scout game, the `Opponent`
  and `Season` cut-ups legitimately share a rep, because one charted snap is
  both our offensive rep and their defensive one.

## Known state going in

- `e2e-parity` is red on this working tree and is NOT from the Reports work: it
  fails identically with the pre-Matchup `stats-engine.js` substituted in. The
  tree carries uncommitted changes from another agent across 22 `js/` files,
  which is the likely source. No golden was regenerated. Worth knowing before
  reading any analytics number as certified.
- Open defect, assigned to Codex: a legacy punt block is reported as a punt we
  allowed on `2025-st-joseph-mavericks-jv` (CLAUDE.md open item 6). Expect the
  Punt unit to read `Blocked 1` against us on that season.

## Findings

Record only observed installed-app behavior here. Include the route, selected
team/season/game, window size, exact action, expected result, actual result, and
a screenshot when presentation is involved.

Per the standing protocol: log each finding as you go and start no fixes until
you say the list is complete.

| # | Tab | Context | Action | Expected | Actual | Verdict |
|---|-----|---------|--------|----------|--------|---------|
| | | | | | | |

## Verdict

Per tab: PASS / REVISE / REJECT.

| Tab | Verdict | Notes |
|---|---|---|
| Overview | | |
| Offense | | |
| Defense | | |
| Special Teams | | |
| Players | | |
| Self-Scout | | |
| Season | | |
| Matchup | | |
