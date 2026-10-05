# GridIron IQ Tag Model

The contract for what a charted play's `tags` hold, which values each field
accepts, and how analytics read them. History, review rounds and the retired
projection model are in
`docs/archive/plans/GRIDIRON-IQ-TAG-MODEL-THROUGH-2026-10-04.md`.

Owners: `PlayTagger.blankTags` (the schema), `TagLibrary` (coach-managed
vocabularies and reserved values), `TagProjection` (the look read),
`ChartingDetails` (details opened by another field), `SeasonFormat` (refuses
retired shapes). Special Teams, penalties and play calls have their own
contracts: `GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md`, `GRIDIRON-IQ-PENALTY-MODEL.md`,
`GRIDIRON-IQ-PLAY-CALL-MODEL.md`.

## 1. Governing rules

1. **One question per field.** Each field answers one football question. A
   value never lives in two fields' vocabularies.
2. **No inference between fields. Ever.** No field is derived from, filled by
   or cleared by another, with three stated exceptions: the two conveniences in
   §5 (Run/Pass from an unambiguous Play Type; Gain from positive yardage with
   no result), which the coach can override, and the confirmed detail clearing
   in §4 (removing an opening field clears its details after the coach agrees). `Cover 3` is not `Zone`; Shotgun says nothing
   about Formation; Personnel says nothing about Formation.
3. **Blank is valid and means uncharted.** No chip is required; Save & Next is
   always available. An analysis that needs a field a play lacks omits that
   play and says so. It never imputes a value or reports a zero.
4. **Terminology is the coach's.** Custom values are first-class. A value the
   coach hides in the library stays on historical plays and in analytics. A
   stored value is never silently remapped.
5. **One season format.** The live seasons were converted once (2026-09-26 and
   2026-09-30). `SeasonFormat` refuses any retired shape (§7) with a plain
   message and writes nothing; no code converts or reads one.

## 2. The schema

Every new or cleared play starts from `PlayTagger.blankTags()`:

| Group | Fields |
|---|---|
| Situation | `down`, `distance`, `quarter`, `hash`, `fieldSide` (`own`/`opp`, default `own`), `yardLine`, `driveNumber` |
| Unit | `unit`: `offense` / `defense` / `special`. Read through `countedUnit()` (blank counts as offense); written only through `PlayTagger.setPlayUnit`. |
| Offensive look | `formationFamily`, `receiverSet`, `qbAlignment`, `backfield`, `strength`, `personnel`, `motion` |
| Call | `playCall`, `playCallId`, `playConcept` (see the Play Call model) |
| Outcome | `runPass`, `playType`, `result`, `yardage`, `playDir`, `fumbleRecovery` |
| Details | `gap`, `motionStart`, `motionEnd`, `rpoRead`, `rpoDefender`, `rpoDecision`, `qbRun` (§4) |
| Defense | `defFront`, `coverage`, `coverageFamily`, `blitz` |
| Attribution | `players` (role to jersey number), `grades` (role to grade) |
| Coach fields | `custom` (a list of custom tags), `customFields` (custom field id to value) |

`yardage` is stored signed: the coach enters a magnitude, and a `Loss` or `Sack`
result makes it negative (`_applyYardageSign`).

## 3. Field vocabularies

**Library-managed** (`TagLibrary.DEFINITIONS`, per program; the coach adds,
hides and orders values, and a built-in a saved library never listed is shown):

| Field | Label | Built-ins |
|---|---|---|
| `formationFamily` | Formation | Spread, Power-I, I-Form, Split Back, Singleback, Wing-T, Flexbone, Wishbone, Wildcat, Double Wing, Single Wing, Ace, Twins, Trips, Doubles, Bunch, Tight Bunch, Beast, Victory |
| `backfield` | Backfield | Single, Split, I, Power, Offset, Strong, Weak, Diamond, Empty |
| `defFront` | Front | Maverick, Eagle, Falcon, Jumbo Shift, 4-3, 3-4, 4-4, 5-2, 5-3, 6-2, 3-3-5, 4-2-5, Nickel, Dime, Quarter, 4-6 |
| `coverage` | Coverage Call | Cover 0 to Cover 6 |
| `playType` | Play Type | Run Inside, Run Outside, Screen, Short Pass, Medium Pass, Deep Pass, Play Action, RPO, Option, QB Run, Reverse, Trick Play |
| `blitz` | Blitz | A-Gap, B-Gap, C-Gap, Edge, DB Blitz, Zone Blitz |

**Fixed** (classification-critical; not coach-editable):

| Field | Label | Values |
|---|---|---|
| `qbAlignment` | QB Alignment | Under Center, Pistol, Shotgun |
| `coverageFamily` | Coverage Family | Man, Zone, Match |
| `strength` | Offensive Line Strength | Left, Right, Balanced, Unbalanced Left, Unbalanced Right |
| `receiverSet` | Receiver Alignment | left x right, totals 1-5, ordered by left then right: 0x1 ... 5x0 (`ChartingDetails.RECEIVER_SETS`); no 0x0 |
| `personnel` | Personnel | 00, 01, 02, 10, 11, 12, 13, 20, 21, 22, 23, 30, 31, 32, Jumbo, Goal Line |
| `motion` | Motion | Jet, Orbit, Shift, Trade |
| `runPass` | Run/Pass | Run, Pass |
| `playDir` | Play Direction | Left, Middle, Right |
| `hash` | Hash | Left, Middle, Right |
| `down` | Down | 1-4 |
| `quarter` | Quarter | Q1-Q4, OT |
| `result` | Result | Gain, Loss, No Gain, Incomplete, Touchdown, Sack, Interception, Fumble; more: Punt, Penalty, Field Goal, Good, No Good, Kneel, Spike, Safety |

Formation is one coach-named value and includes receiver formations (Trips,
Bunch, Twins). Receiver Alignment is the separate numeric distribution. Middle
in Play Direction is a broad inside classification, not only Center.

**Reserved values** (`TagLibrary.RESERVED`; matched case-insensitively per
`" + "` token; a saved custom value that breaks this is kept in storage and never
offered):

- Formation never holds a QB alignment, `Empty`, `Unbalanced` or a receiver
  distribution like `3x1`, and is never `" + "`-joined.
- Backfield never holds a QB alignment.
- Coverage Call never holds a coverage family.

## 4. Details opened by another field

`ChartingDetails` owns these. Each needs its opening field, except Gap.

| Detail | Values | Opened by |
|---|---|---|
| `gap` | L-A, L-B, L-C, L-D, R-A, R-B, R-C, R-D, Center, Other | none: independent of Play Direction; neither sets nor clears the other |
| `motionStart`, `motionEnd` | Left, Middle, Right (offense's view) | Motion |
| `rpoRead`, `rpoDefender`, `rpoDecision` | End, Apex, Box, Other; a jersey number; Give, Keep, Throw | the RPO Play Type |
| `qbRun` | Designed, Scramble, RPO Keeper | the QB Run Play Type |

Removing an opening field clears its details in the same undoable write, after
the coach confirms what will be cleared (`ChartingDetails.orphans` /
`clearMessage`); declining changes nothing. CSV import refuses a row with a
detail but no opening field, or a value outside these vocabularies, and
imports nothing from that file.

## 5. Cardinality and writes

- **Multi-value** (`PlayTagger.MULTI_TAGS`): `playType`, `result`, `defFront`,
  `blitz`, stored as `" + "`-joined strings. Every other field is single-value.
- **Exclusive groups** within a multi-value field (`EXCLUSIVE_GROUPS`; adding a
  member replaces its rivals, in the deck and the Film Room editor alike):
  - `result`: Gain / Loss / No Gain / Incomplete / Sack / Kneel / Spike; and
    Good / No Good.
  - `playType`: Run Inside / Run Outside / Screen / Short Pass / Medium Pass /
    Deep Pass.
- **The charting write** is `PlayTagger.setTagValue`: one tag from an explicit
  value, then one undoable `play-updated`. Chart, Film Room and the keyboard all
  pass the value; nothing reads a form field.
- **Conveniences** inside that write, both overridable:
  - an unambiguous Play Type fills Run/Pass. RPO, Option, QB Run, Reverse,
    Play Action and Trick Play are ambiguous and leave it to the coach;
  - positive yardage with no result fills Gain.
- **Situation**: with Auto D&D on, Save & Next computes the next play's down,
  distance and spot from the previous play; a hand edit marks the situation
  the coach's and stops refreshing it.
- **Copy Previous and templates** use `SCHEME_KEYS`: unit, the look fields,
  motion and its path, run/pass, play type, front, coverage call and family,
  blitz and hash. Copy Previous sets every one of them from the previous play
  (blank where the previous play is blank); a template stores the non-blank
  ones and applies only its current-format values.
- **Carry Scheme** (opt-in, default off) uses the narrower
  `CARRY_SCHEME_KEYS`: QB alignment, formation, receiver alignment, backfield,
  offensive line strength, personnel, front, coverage call and coverage family.
  It fills only fields that are blank on the next play, only when both plays
  are the same unit, and never onto or across a Special Teams play (front and
  coverage change meaning across a possession change). It never carries
  motion, run/pass, play type, blitz or hash.
- Result, yardage, players and notes never carry by any path.

## 5a. Editing safeguards

These hold for every charting surface (Chart, Film Room, Quick Chart, the
keyboard):

- Opening or selecting a play never writes; loading a play into a form never
  marks it changed.
- An edit writes only the field the coach changed, preserves every unrelated
  tag, player, penalty, Special Teams and note value, and is one undoable
  transaction.
- A displayed number and the Watch cohort behind it are the same plays: every
  report, Study row and Film Room readout opens exactly the composite
  `gameId::playId` set it counted.

## 6. How analytics read tags

- `TagProjection.project()` is a plain read: every look field present, blank
  when uncharted. `StatsEngine.PROJECTED_FIELDS` lists the look fields read this
  way.
- **Run/Pass decides run and pass statistics** (`StatsEngine.isRun` /
  `isPass`). With it blank, only an unambiguous Play Type classifies the play
  (Run Inside, Run Outside, Screen and the pass types); RPO, Play Action,
  Option, QB Run, Reverse and Trick Play alone leave it out of every run/pass
  measure.
- A single-value field is never routed through a multi-value splitter, and the
  analytics registry declares it `multi:false`, so a play is never counted
  twice along it.
- A multi-value field credits each component: one play can appear in several
  rows, and percentages can exceed 100%.
- **Cross-tabs use an eligible denominator**: only plays with a value on every
  axis. Each result reports `total`, `eligible` and `omitted`. For two
  single-value axes, the cells sum to `eligible`.
- Left/Right on `strength`, `playDir`, `hash` and the motion path is always the
  offense's perspective; there is no stored perspective flag and no auto-flip.
- `TagProjection.lookLabel()` ("Shotgun Spread 3x1") is for captions, call
  sheets and overlays only. Column-shaped surfaces keep each field in its own
  cell, and analytics never read the label.

## 7. Refused shapes

`SeasonFormat` refuses, on every path that brings data in (season import,
restore point, game version, Documents mirror, CSV, a stored season on open):

- a combined look (`TagProjection.isCombined`): an alignment inside Formation or
  Backfield, `Empty` in Formation, a family inside Coverage Call, or a
  `" + "`-joined Formation;
- the retired keys `formation`, `receiverLook`, `receiverSide`,
  `receiverStrength`, `lineBalance`, on a play, a play call's default or a
  template;
- a charted play with no unit, and the other retired shapes listed in
  `js/season-format.js`.

A template saved before the conversion applies only its current values
(`SeasonFormat.currentTagValues`); the coach re-saves it.

## 8. Special Teams plays

A Special Teams play may not hold the look or defense fields in
`SeasonStore.ST_ALIGNMENT_KEYS` (qbAlignment, formationFamily, receiverSet,
backfield, strength, personnel, defFront, coverage, coverageFamily, blitz). The
strip is enforced at `PlayTagger._emit` and on every serialization path. A
run/pass or Fake try is exempt: it charts its look like a scrimmage snap and is
kept out of every analytics cohort (`GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md`).

## 9. Tests

`e2e-tag-model`, `e2e-tag-fields`, `e2e-tag-projform`, `e2e-tag-library`,
`e2e-tag-library-storage`, `e2e-receiver-look`, `e2e-charting-details`,
`e2e-charting-cutover-deck`, `e2e-season-format`, `e2e-csv-projection`,
`e2e-crosstab` and `e2e-parity` pin this contract.
