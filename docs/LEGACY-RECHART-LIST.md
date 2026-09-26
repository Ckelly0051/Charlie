# Plays to re-chart after the legacy migration

Coach's rule (2026-09-25): the one-time conversion keeps what converts exactly and
blanks the rest. These plays lost their old Special Teams values and need charting
again. All are in **2025 St. Joseph Mavericks - JV**. "Play" is the number the Break
Down strip shows. "Old values" are what was stored before, so nothing is lost.

**Converted live on 2026-09-26** (`tools/convert-legacy-once.mjs` at `71761f5`, approved
impact, source fingerprint `0f9434c3d68b`). The live run's list is identical to this one.
The original catalog and Documents mirror are backed up, hash-verified, at
`C:\Users\charl\GridIronIQ-Backups\legacy-conversion-2026-09-26` (`manifest.json`, and
`run/report.json` with every old value).

## Re-chart Special Teams (17)

| Game | Play | Old values | Other charting on the play |
|---|---|---|---|
| Wk 1 St. Peter | 23 | XP | Q2, No Gain, carrier 16 (a run-in try for 1; see ST-GAPS) |
| Wk 2 ND Prep | 56 | Punt | Q3 4&11, Gain, kicker 82 |
| Wk 2 ND Prep | 64 | XP, Good, scored by them | Q4, Good |
| Wk 2 ND Prep | 65 | Kick Return | Q4, Gain, returner 18 |
| Wk 4 OL Sorrows | 36 | XP | Q2, No Good |
| Wk 4 OL Sorrows | 56 | XP, No Good, scored by us | Q4 |
| Wk 4 OL Sorrows | 57 | Kickoff, Muffed, scored by us | Q4, Fumble, takeaway 45 |
| Wk 4 OL Sorrows | 71 | Kick Return, Fair Catch | Q4 |
| Wk 5 OL Lakes | 21 | Punt Return, Fair Catch, scored by us | Q2 4&17 |
| Wk 5 OL Lakes | 38 | XP | Q3, No Good |
| Wk 5 OL Lakes | 39 | Kick Return, scored by us | Q3, Gain, carrier 2 |
| Wk 5 OL Lakes | 53 | XP, No Good | Q4, No Good |
| Wk 5 OL Lakes | 69 | Kickoff, Fair Catch, scored by us | Q4 4&15, No Gain |
| Wk 5 OL Lakes | 73 | Kick Return, scored by us | Q3 1&10, Gain, returner 99 |
| Wk 5 OL Lakes | 77 | Punt, Downed, scored by us | Q3 4&8, No Gain |
| Wk 5 OL Lakes | 84 | Kickoff, Fair Catch, scored by us | Q2 2&10, Spike, passer 7 (on the Defense unit) |
| Wk 5 OL Lakes | 87 | Kickoff, Fair Catch, scored by us | No Gain |

## Check the unit (3)

These had no unit and convert to **Offense**, the reading every report already used.
Change any that were defensive snaps.

| Game | Play | Charting |
|---|---|---|
| Wk 4 OL Sorrows | 59 | Q4 1&10, Sack, passer and carrier 7; the strip shows a 5-2 front (play 61 looks similar) |
| Wk 5 OL Lakes | 67 | Q4 2&10, Sack -9, passer 7 |
| Wk 5 OL Lakes | 90 | Q4 1&5, Sack -8, passer and carrier 81 |

## What the reports lose until these are re-charted

From the dry run's before/after comparison (every difference, play by play):

- Extra point attempts 19 -> 14 for the season (the five old XP plays; rate 58% -> 79%).
- Opponent charted score -1 in Wk 2 Q4 (play 64). The official final score is unchanged.
- Punter 82: 5 punts -> 4 (play 56). Wk 2 drive 4 reads `Other` instead of `Punt`.
- Returners 18 and 99 each lose one return (plays 65, 73).

Corrections the conversion makes at the same time (not losses):

- The 14 extra points stored on the Field Goal unit move to the Try unit, every point kept.
- Two punt returns' yards (7 and 5) now count in the team's punt-return numbers; Players already counted them.
- 25 plays have a combined look split into its own fields, as the reports already read them: 22 of them are formations carrying a QB alignment ("Under Center + Flexbone"); the other 3 are other combined look values.
- 33 blank, uncharted SJM Varsity 2026 plays take Offense.
