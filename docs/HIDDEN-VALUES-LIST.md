# Plays holding values they cannot show

Each play below stores a value its unit or Special Teams type does not show,
so Chart cannot display or change it. Re-chart the play (set the unit or type
it was meant to have, or save it as it is) and saving drops what the play
cannot show. Regenerate with `node tools/audit-hidden-values.mjs`; delete this
file when the list is empty.

Read 2026-10-10 from a copy of the desktop library: 50 of 1088 plays.

## 2025 St. Joseph Mavericks - JV

### Week 1 vs St. Peter Lutheran Patriots

| Play | Unit | Stored but not shown |
|---|---|---|
| 1 | Kickoff | result = Gain; yardage = 5 |
| 7 | Punt Return / Block | result = Gain; yardage = 18 |
| 11 | Try | result = Good; yardage = 3; Player: ballCarrier = 42 |
| 12 | Kickoff | result = No Gain |
| 16 | Punt Return / Block | result = No Gain |
| 24 | Kickoff | result = Gain; yardage = 11 |
| 35 | Try | result = Gain + Good; yardage = 3; Player: ballCarrier = 42 |
| 36 | Kickoff | result = Fumble |
| 43 | Kickoff | result = No Gain |
| 50 | Try | result = Good + Gain; yardage = 3; Player: ballCarrier = 99 |
| 58 | Punt Return / Block | result = Gain; yardage = 13; Player: tackler = 45 |
| 60 | Try | result = Gain + Good; yardage = 3; Player: ballCarrier = 59 |
| 65 | Punt Return / Block | result = Gain; yardage = 16 |
| 69 | Punt | result = No Gain |

### Week 2 vs ND Prep Fighting Irish

| Play | Unit | Stored but not shown |
|---|---|---|
| 1 | Kick Return | result = No Gain |
| 17 | Kick Return | result = No Gain |
| 27 | Punt Return / Block | result = Loss; yardage = -5 |
| 56 | Special Teams (no type) | result = Gain; yardage = 11 |
| 65 | Special Teams (no type) | result = Gain; yardage = 3 |

### Week 3 vs OL Refuge Ravens

| Play | Unit | Stored but not shown |
|---|---|---|
| 5 | Punt Return / Block | result = Gain; yardage = 5 |
| 9 | Punt | result = No Gain |
| 27 | Defending a Try | result = Good |
| 28 | Kick Return | result = Gain; yardage = 22 |
| 42 | Try | result = Good; Player: ballCarrier = 42 |
| 49 | Punt | result = No Gain |
| 61 | Punt | result = Punt |
| 77 | Defending a Try | result = No Good |

### Week 4 vs OL Sorrows Lancers

| Play | Unit | Stored but not shown |
|---|---|---|
| 7 | Punt Return / Block | result = Gain; yardage = 5 |
| 24 | Try | result = No Good |
| 36 | Special Teams (no type) | result = No Good |
| 57 | Special Teams (no type) | result = Fumble; Player: takeaway = 45 |

### Week 5 vs OL Lakes Lakers

| Play | Unit | Stored but not shown |
|---|---|---|
| 1 | Kick Return | result = Fumble |
| 9 | Kickoff | result = Gain; yardage = 40 |
| 39 | Special Teams (no type) | result = Gain; yardage = 6; Player: ballCarrier = 2 |
| 53 | Special Teams (no type) | result = No Good |
| 69 | Special Teams (no type) | result = No Gain |
| 71 | Offense | Player: tackler = 42 |
| 73 | Special Teams (no type) | result = Gain; yardage = 1 |
| 77 | Special Teams (no type) | result = No Gain |
| 79 | Offense | Player: tackler = 42 |
| 80 | Kick Return | playType = Run Outside; runPass = Run; result = Loss; yardage = -1; playDir = Right; motion = Orbit; Player: tackler = 81, 5 |
| 84 | Kickoff | runPass = Pass; result = Spike; playDir = Middle; Player: passer = 7 |
| 87 | Special Teams (no type) | result = No Gain |

### Week 6 vs Holy Family Wildcats

| Play | Unit | Stored but not shown |
|---|---|---|
| 2 | Kickoff | result = No Gain |
| 3 | Offense | Player: tackler = 5 |
| 16 | Punt Return / Block | result = Loss; yardage = -5; Player: tackler = 82 |
| 18 | Try | result = Gain + Good; yardage = 3; Player: ballCarrier = 99 |
| 24 | Punt Return / Block | result = Gain; yardage = 5 |
| 27 | Try | result = Gain; yardage = 3; Player: ballCarrier = 7 |
| 58 | Try | result = Gain; yardage = 2; Player: ballCarrier = 99 |
