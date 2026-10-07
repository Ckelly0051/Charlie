# Missed tackles in Reports, revision 2 - review comp, 2026-10-07

Status: **COMP_APPROVED** by the coach, 2026-10-07 ("Comp approved with
centered text in the strip"). Production is not built. Revises the Tackling module of
`design-comps/missed-tackles-reports-2026-10-07` (COMP_APPROVED). Still screens
of the built app (`0d4f3043`) with the canonical 2025 JV season, Full season,
the proposed rows applied in the page (`capture.mjs`). Isolated browser data;
no coach file was written. `current-*` is the built module, `proposed-*` the
revision.

Tackles Made is the real season. The missed-tackle counts are the same
illustrative set as revision 1 (no season has them charted yet), so the
Missed Tackle rate mixes real tackles with made-up misses.

## Why (coach, 2026-10-07)

A module named Tackling that shows only missed tackles is incomplete. It now
states tackles made and a tackling efficiency rate, so the miss count has a
denominator.

## The six rows (defensive snaps)

| Row | Value | Eligible snaps |
|---|---|---|
| Total Tackles | plays with a tackler named; a shared tackle is one team tackle | every defensive snap |
| Missed Tackles | the exact sum of the counts | snaps with a count charted (0 included) |
| Missed Tackle rate | misses / (tackles made + misses), both over the snaps with a count charted | the same snaps |
| Plays with a Missed Tackle | count | the same snaps |
| Yards / play with a Missed Tackle | classified yards per play | those plays |
| Yards / play without | classified yards per play | the rest |

A play with a tackler named but no count charted counts in Total Tackles only,
never in the rate, so uncharted misses cannot read as perfect tackling.

Season vs Last 3 shows Missed Tackle rate (replacing the play rate). The
module stays full width and fixed, now six rows.

## The KPI strip (coach, 2026-10-07)

- Eleven tiles. Missed Tackles (the season total) follows Explosive Plays
  Allowed; the other ten keep their approved order.
- Explosive Plays is labeled Explosive Plays Allowed, in full: it wraps to two
  lines like Touchdowns Allowed at 1440 and 1280. This reverses the 2026-09-23
  rule that the Defense board never prints "Allowed" (`e2e-explosive-labels`).
- "Tackles Made" is labeled Total Tackles.
- The strip's labels and values are centered in each tile
  (`proposed-strip-centered-1440x900.png`). Defense only: the other boards'
  strips stay left-aligned until the reporting rebuild.
