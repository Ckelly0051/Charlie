# Reports > Matchup - desktop design comp, 2026-09-06

**Status: NOT APPROVED. Design comp only.** No production file is changed.

Comp: `design-comps/reports-matchup-2026-09-06/matchup.html`

## 1. Purpose

The first revision placed independent unit profiles beside each other. The
coach still had to perform the matchup analysis. This revision makes the
primary report a situational join: what the opponent most often calls in a
situation, followed by our results against the same charted look.

It uses only fields already stored on plays: down, distance, field position,
personnel, formation, play type, play call, front, coverage and blitz. The
existing left/right direction, hash, backfield and strength fields remain
available for later expansion.

## 2. Composition

The two coaching questions remain separate tabs:

- `Our Offense vs Their Defense`
- `Our Defense vs Their Offense`

Each tab leads with `Situational Calls`. Supporting play-type tables provide
broad context without pretending their unequal cohorts share a denominator.
The offense-facing tab ends with `Coverage Answers`; the defense-facing tab
ends with `Personnel and Formation`.

The broad KPI strip is removed. Counts remain in the unit headers and every
performance value appears beside the cohort and situation that produced it.

## 3. Join contract

- Opponent rows are ranked by frequency inside each named situation.
- `Rate` means share of the opponent's charted plays in that situation. It is
  never a success rate.
- `Our Top Call vs Same Look` requires the same named situation and all
  displayed nonblank structure fields. `Top` means the most frequently charted
  call inside that exact season cohort; the adjacent metrics report its result.
- If no season plays match, display `No matching snaps`. Never relax a filter
  silently to fill the row.
- THEM and US are separate film cohorts and separate actions. Each action opens
  only the exact composite `gameId::playId` references that produced its side.
- Offense performance uses Yards / Play and Success Rate. Defense performance
  uses Yards / Play Allowed and Stop Rate.
- No matchup score, recommendation, prediction or claimed advantage is
  calculated from unequal samples.

## 4. Data boundary

This comp does not add a true gap-level Hit Chart. The stored `playDir` field is
Left, Middle or Right and cannot honestly support A/B/C/D gap precision.

Player usage can be added only when opponent player attribution is present. It
is not included in the fixed populated fixture because player attribution is
optional and should not become a structural requirement for Matchup.

## 5. Film

Every populated evidence row has an explicit film action. Joined rows expose
both actions:

- `THEM` opens the opponent plays used for the tendency and rate.
- `US` opens the season plays used for the result and chosen answer.

## 6. States

Populated, Partial and Empty states remain in the comp. Partial preserves the
available matchup and identifies the missing unit. Empty displays no fabricated
selection, sample or zero values.

## 7. Approval decisions

1. Situational joins replace independent profiles as the primary report.
2. Five fixed situation families: 1st Down, 2nd & 7+, 3rd & 1-3, 3rd & 7+,
   and Red Zone.
3. Paired play-type context remains beneath the primary table.
4. Coverage Answers supports offense; Personnel and Formation supports defense.
5. Separate THEM and US film controls are used instead of one ambiguous row
   action.
6. Missing exact matches remain visible as missing data and are never widened.
7. Matchup keeps the current shared Reports header. Shared-header polish remains
   a later Reports-wide pass.
