# Missed tackles in Reports - review comp, 2026-10-07

Status: proposal, not approved. Still screens of the real built app
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
   format, five rows): Missed tackles (3+ counted as 3), Plays with a missed
   tackle, Missed-tackle play rate, Yards / play with a missed tackle, Yards /
   play without. Eligible snaps are defensive snaps with missed tackles
   charted (`0` included, blank excluded).
2. **Game-by-game**: a Missed Tackles column. A game with none charted shows
   `—`, never `0`.
3. **Season vs Last 3**: a Missed-tackle play rate row (seven rows).
4. **Defensive player contributions**: a Missed column after Ast, sortable,
   the plays on which the player is named in Missed Tackles.

Players tab, Tackles module (`players-tackles-*`): a **Miss** column after
Ast, the same per-player count, opening that player's missed-tackle film.

At Current game scope the Tackling module and the Missed columns show the one
game; Game-by-game and Season vs Last 3 stay Full season only, as today.

## Decisions for the coach

- **3+ in totals.** A `3+` play adds 3 to Missed tackles, labeled in the row.
  The play counts once in every play-based measure.
- **Per-player count** is plays named, not misses: a player named on a play
  with a count of 2 gets 1, because the count is not split by player.
- Every number opens its plays' film, like the rows around it.

## Seen in passing, not part of this comp

The Players tab and the Defense board disagree on some full-season tackle
totals (#5 41 vs 40, #7 22 vs 21, #82 8 vs 7). That predates this work.
