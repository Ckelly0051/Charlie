# Missed tackles in Reports - review comp, 2026-10-07

Status: **COMP_APPROVED** by the coach, 2026-10-07 ("approve"). Production is
not built. Still screens of the real built app
(`b34ebe27` source) with the canonical 2025 JV season, Full season scope, and
the proposed modules and columns added in the page (`capture.mjs propose`).
Isolated browser data; no coach file was written.

**The missed-tackle numbers are illustrative.** No season has missed tackles
charted yet, so the page gives defensive snaps a deterministic made-up set
(longer gains likelier to include a miss; Week 1 left uncharted to show `—`).
Every number on these screens is computed from that one set, so the modules
agree with each other. All other numbers are the real season.

`current-*` and `survey-*` are today's app; the rest is the proposal.

## Scope (coach, 2026-10-07)

An exception to roadmap step 4: defensive missed tackles only, in the
Defense, Players and Season tabs. Offense and Special Teams missed tackles
wait for the reporting rebuild. Season > Defense embeds the same Defense board,
so the Defense changes appear in both tabs.

## What the screens show

Defense board, Performance page, at Full season (`defense-*`,
`season-defense-full-1440.png`):

1. **Tackling** (new module, after Disruption, in Disruption's fixed-table
   format, five rows): Missed Tackles (the exact total), Plays with a Missed
   Tackle, Missed Tackle play rate, Yards / play with a Missed Tackle, Yards /
   play without. Eligible snaps are defensive snaps with missed tackles
   charted (`0` included, blank excluded).
2. **Game-by-game**: a Missed Tackles column. A game with none charted shows
   `—`, never `0`.
3. **Season vs Last 3**: a Missed Tackle play rate row (seven rows).
4. **Defensive player contributions**: a Missed Tackles column after Ast, sortable,
   the plays on which the player is named in Missed Tackles.

Players tab, Tackles module (`players-tackles-*`): an **MTkl** column after
Ast, the same per-player count, opening that player's missed-tackle film.

At Current game scope the Tackling module and the player columns show the one
game; Game-by-game and Season vs Last 3 stay Full season only, as today.

## Coach decisions (2026-10-07)

- **Labels.** The full words "Missed Tackles" wherever there is room; `MTkl`
  is the abbreviation where columns are abbreviated (Players > Tackles, beside
  Tkl and Sack).
- **True totals.** Charting records an exact count `0` to `9`, so the team's
  Missed Tackles is a true sum of the plays' counts. A play counts once in
  every play-based measure (Plays with a Missed Tackle, the rate, yards).
- **Players are counted like tackles.** A player's Missed Tackles / MTkl is one
  missed tackle for each play they are named on, the same rule Tkl uses for
  Tackler(s). The roster picker toggles a number on and off like Tackler(s).
- Every number opens its plays' film, like the rows around it.

## Seen in passing, not part of this comp

The Players tab and the Defense board disagree on some full-season tackle
totals (#5 41 vs 40, #7 22 vs 21, #82 8 vs 7). That predates this work.
