# GridIron IQ Special Teams Model

The contract for charting and scoring Special Teams plays. Research, defect
write-ups, build plans and review rounds are in
`docs/archive/plans/GRIDIRON-IQ-SPECIAL-TEAMS-MODEL-THROUGH-2026-10-04.md`.

Owners: `SpecialTeamsModel` (`js/special-teams.js`: units, normalization,
points, scoring side, player roles), `BreakdownChartingService` (the deck's
writes), `StatsEngine` (reports), `SeasonStore.ST_ALIGNMENT_KEYS` (the look
strip).

## 1. Principles

- Chart a kick by **unit, role and event outcome**, never by asking the coach
  who should get scoreboard credit. Scoring side is derived from the unit's
  role, the score and who recovered the ball.
- **No chip is required.** Unknown details stay blank and are left out of the
  measures that need them.
- **A loose ball has no default owner.** When ownership cannot be read from
  the charting, the score is unattributed, never guessed (§5).
- **The coach records the official ruling.** The app never judges whether a
  return was legal or which ruleset applies; it has no ruleset setting.

## 2. Units

| Stored `unit` | Label | `subjectRole` |
|---|---|---|
| `kickoff` | Kickoff | kicking |
| `kickoffReturn` | Kick Return | receiving |
| `punt` | Punt | kicking |
| `puntReturn` | Punt Return / Block | receiving |
| `fieldGoal` | Field Goal | attempting |
| `fieldGoalBlock` | Field Goal Block | defending |
| `try` | Try | attempting |
| `tryDefense` | Defending a Try | defending |

`SpecialTeamsModel.UNIT_LABELS` is the one owner of these labels; every surface
reads it. The subject is the team being analyzed: our team in a program season,
the scouted team in a scout season. Labels for the other side read "Opponent"
in a program season and "Other team" in a scout season.

The unit that fields a punt is the unit that blocks one, so `puntReturn` carries
`blocked`; there is no `puntBlock` unit. Onside and Fake are modifiers of a kick
unit, not separate units.

## 3. The structured event

`play.specialTeams`, normalized by `SpecialTeamsModel.normalize` (invalid or
unknown values become null or blank; nothing is inferred):

```javascript
{
  version: 1,
  unit, subjectRole,                       // §2
  attemptType,                             // fieldGoal on the field-goal units;
                                           // extraPoint | twoPoint on tries; else null
  result,                                  // tries only: converted | failed | noPlay
  events: { badSnap, blocked, turnover,    // tries only; turnover: interception | fumble
            defensiveReturn },
  kick:   { kind, direction, distance, hangTime, landing: { fieldSide, yardLine }, operationTime },
  return: { attempted, yards, end: { fieldSide, yardLine } },
  outcome: { status, recoveredBy, score, scoredBy, returnAward },
  isOnside, isFake,
  players: { kicker, punter, returner, blocker, recoverer },
  notes, legacy
}
```

- `outcome.status` is ball state or attempt disposition only: returned,
  touchback, fairCatch, downed, outOfBounds, blocked, muffed, recovered, good,
  noGood, badSnap. It never holds a score.
- `outcome.score` is the one scoring field: touchdown, fieldGoal, extraPoint,
  twoPoint, safety. Extra points and two-point scores exist only on tries.
- `recoveredBy`, `scoredBy`: subject, opponent or unknown.
- Distance, hang time and operation time are never negative; return yards may
  be. Kick distance, landing spot, return yards and end spot are independent.
- The field-goal units' `attemptType` is always `fieldGoal`, seeded at creation
  (`defaultAttemptType`); there is no attempt selector, so no path can store an
  extra point there. A Good field goal scores a field goal.

## 4. Charting by unit

| Unit | Outcomes offered | Modifiers | Fields |
|---|---|---|---|
| Kickoff | Returned, Touchback, Fair Catch, Out of Bounds, Recovered | Onside | kick distance, hang time, possession spot, return yards, end spot |
| Kick Return | Returned, Touchback, Fair Catch, Muffed, Out of Bounds | | possession spot, return yards, end spot |
| Punt | Returned, Fair Catch, Downed, Out of Bounds, Touchback, Blocked, Muffed | Fake | kick distance, hang time, possession spot, return yards, end spot |
| Punt Return / Block | Returned, Fair Catch, Let Bounce, Muffed, Out of Bounds, Blocked | | possession spot, return yards, end spot |
| Field Goal | Good, No Good, Blocked, Bad Snap | Fake | kick distance, hang time |
| Field Goal Block | Good, No Good, Blocked, Bad Snap | Fake | kick distance, hang time, return yards, end spot |

- Score choices (Touchdown, Safety) are offered on every unit except Field
  Goal. Possession (who recovered) is asked on Recovered, Muffed and Blocked,
  and on a touchdown from Kickoff or Field Goal Block. "Credited to" is asked
  for a safety or an explicitly unknown scorer.
- Blocker # and Recoverer # are available on every non-try unit.
- A fair catch, touchback, downed ball or out-of-bounds kick is never counted as
  a return attempt.

## 5. Scoring

**Points** (`SpecialTeamsModel.points`): touchdown 6, field goal 3, extra point
1, two-point 2, safety 2.

**Scoring side** (`SpecialTeamsModel.scoringTeam`), in order:

1. An explicit `scoredBy` of subject or opponent wins; unknown stays unknown.
2. A safety without an explicit owner is unknown.
3. A field goal, extra point or two-point score goes to the attempting side
   (subject on `attempting`, opponent on `defending`).
4. Otherwise `recoveredBy` decides when charted (unknown stays unknown).
5. On Blocked, Muffed or Recovered with no `recoveredBy`, the side is unknown.
6. Otherwise the unit's default: receiving or attempting scores for the
   subject; kicking or defending for the opponent.

Unknown points are never dropped: they reach the scoreboard's `unattributed`
total, which is emitted only when nonzero.

## 6. Tries

A try is its own down, charted under `try` (our attempt) or `tryDefense` (theirs),
never under the field-goal units.

**Attempt** (coach-chosen):

| Attempt | Stored | Points offered | Default |
|---|---|---|---|
| Kick XP | `attemptType:'extraPoint'` | 1 or 2 | 1 |
| Run/Pass | `attemptType:'twoPoint'` | 1 or 2 | 2 |
| Fake | `attemptType:'twoPoint'`, `isFake:true` | 1 or 2 | 2 |

The coach charts youth football, where a kicked try can be worth 2 and a
run/pass try 1, so the coach records the points per play (coach, 2026-09-25 /
2026-09-27). There is no season-level ruleset.

**Official result** is separate from the score: Converted scores, Failed and
No Play / Retry do not. **What happened** events are optional and independent
of the result: Bad Snap, Blocked, Interception, Fumble, Defensive Return. A bad
snap can still convert; a blocked kick recovered and run or passed in can end
as a two-point score.

**Defensive return**: never scores automatically. The coach must choose the
official ruling: No Score, 2 points to the subject, or 2 points to the other
team. That choice is authoritative and survives save and reopen.

**Penalties** (`GRIDIRON-IQ-PENALTY-MODEL.md` owns the records):

| Situation | Result | Attempt counted | Points |
|---|---|---|---|
| The play does not count, or a retry | No Play / Retry | no | none |
| Declined penalty | the filmed result | yes | per the film |
| Accepted penalty, score stands | Converted | yes | the official score |
| Disposition unresolved | not finalized | | the deck warns |

The deck warns until the attempt and result are chosen, a defensive return has
its ruling, and any penalty is resolved.

**Players on a kicked try**: Try (Kick) offers Kicker only; Defending a Try
(Kick) offers Blocker only. A kicked try has no returner.

**Run/pass and Fake tries** (`SpecialTeamsModel.isRunPassTry`) chart their look
and result like a scrimmage snap: the offensive options on Try, the defensive
options on Defending a Try, with that side's player roles. They are exempt from
the look strip (§8), Film Room locks none of their cells, and the unit stays
Special Teams. Switching back to Kick XP asks, then clears the run/pass detail.
They are **kept out of every analytics cohort** (coach, 2026-09-27): no yards,
success rate, player line or tendency. Kick versus go-for-it is reported by the
Special Teams try module.

## 7. Players

- `SpecialTeamsModel.playerRoles` owns the row order: Kicker then Returner on
  kick and return units, Kicker only on Try (Kick), Blocker only on Defending a
  Try (Kick), and the scrimmage roles on a run/pass try.
- **Roster ownership**: the roster belongs to the subject season. A receiving
  or defending unit never offers it for the opposing kicker; a kicking or
  attempting unit never offers it for the opposing returner
  (`isOpposingPlayerRole`). The opponent's number is typed by hand and labeled
  Opponent (Other team in a scout season). Changing the unit changes picker
  eligibility, never existing attribution.
- `defaultPlayerRole` picks the first row our team owns, independent of display
  order: Returner on return units and Field Goal Block, Kicker on kicking and
  field-goal units, Blocker on a kicked Defending a Try. That row's picker opens
  by default, and the deck and RosterManager share this default.

## 8. The look strip

A Special Teams play may not hold the fields in `SeasonStore.ST_ALIGNMENT_KEYS`
(qbAlignment, formationFamily, receiverSet, backfield, strength, personnel,
defFront, coverage, coverageFamily, blitz). The strip runs at `PlayTagger._emit`
and on every serialization path. Run/pass and Fake tries are the one exemption.

## 9. Analytics routing

| Play | Base offense / defense | Player box score | Special Teams report | Conversions | Scoreboard |
|---|---|---|---|---|---|
| Ordinary kick or return | no | specialist roles only | yes | no | if scored |
| Fake punt or field goal | no | its rush or pass counts (`countsFootballRoles`) | yes | no | if scored |
| Try (any attempt) | no | no | try module | yes | yes |

- Every Special Teams denominator is named. A missing optional field reduces
  only the measure that needs it; a measured zero is a number, an absence is
  "No data".
- Return production counts only returns with charted return yards.
- Punt net is observed only: a touchback has no net unless a ruleset supplies
  the touchback distance, and none is configured.
- A field-goal attempt is defined once (`StatsEngine.isFieldGoalAttempt`) for
  both the unit and the kicker; an extra point is never a field goal attempt.

## 10. Retired data

The pre-structured tags (`stType`, `kickOutcome`, `scoreFor`, `kickDistance`,
`returnYards`, `hangTime`, `kickedTo`) were retired in the 2026-09-26 conversion.
`SeasonFormat` refuses any data carrying them, and no code reads them. Plays
that lost their old values are listed for re-charting in
`docs/LEGACY-RECHART-LIST.md`.

## 11. Tests

`e2e-special-teams-contract`, `e2e-b2-tries`, `e2e-st-try-charting`,
`e2e-reports-special-teams`, `e2e-study-penalties-st`, `e2e-season-format` and
`e2e-parity` pin this contract.
