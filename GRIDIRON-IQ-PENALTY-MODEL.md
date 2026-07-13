# GridIron IQ Structured Penalty Model

> **Status:** Phase 4D implemented at `461d0b1`; independent review pending.
> This model optimizes trustworthy future charting over semantic migration of
> the legacy `result: 'Penalty'` workflow.

## 1. Product Decision

A penalty is not the result of the football play. A run, pass, turnover, score,
or kick happened, and one or more fouls may change whether that action counts
and where the next snap begins. GridIron IQ will therefore store penalties as
structured records alongside the existing play result.

The charting flow must answer five coaching questions quickly:

1. Who was charged?
2. What was the foul?
3. Was it accepted, declined, or offsetting?
4. How many yards were actually enforced, and did the play count?
5. What is the resulting down, distance, and field position?

No field is silently inferred when the film does not prove it. Multiple fouls
on one snap are supported from day one.

## 2. Comparable-App Research

### QwikCut: copy the explicit separation

QwikCut Advanced Stat Entry exposes separate **Offensive Penalty**, **Defensive
Penalty**, and **Penalty Yards** columns. It also includes an ODK value for a
penalty/play that was stopped. Its foul categories can use presets or custom
values. This is the clearest public competitor contract and should be our base:
penalty side, foul name, enforced yards, and stopped-play state are distinct.

Source: [QwikCut Football Stat Entry - Advanced](https://support.qwikcut.com/portal/en/kb/articles/football-stat-entry-advanced-22-7-2023)

### Hudl: copy the editable breakdown rhythm, not a hidden schema

Hudl Assist publicly lists ODK, down, distance, yard line, gain/loss, play type,
play direction, and Result as separate breakdown columns. Hudl's editing model
is a breakdown grid where a coach edits the applicable column on the clip. A
published officials workflow adds dedicated Flag Thrown and Foul Code columns,
confirming that fouls are most usable as structured clip data rather than notes.

Sources: [Hudl Assist football breakdown columns](https://www.hudl.com/products/assist/football),
[Hudl officials foul-labeling workflow](https://www.htasofootball.com/wp-content/uploads/2022/08/htaso_2022-HUDL-Instruction-1.pdf)

### NCAA statistics: store actual enforcement, not nominal rulebook yards

The NCAA statisticians' manual says recorded penalty yardage should be the
**actual distance lost**, not merely the nominal assessed distance. It also
shows why accepted penalties and whether a down counts affect conversion and
play statistics. GridIron IQ must ask for actual enforced yards and resulting
situation instead of pretending a foul name determines the spot.

Source: [NCAA Football Statisticians' Manual](https://fs.ncaa.org.s3.amazonaws.com/Docs/stats/Stats_Manuals/Football.pdf)

## 3. Proposed Data Contract

Add an optional `penalties` array to each play. Absence and `[]` are equivalent.

```javascript
play.penalties = [
  {
    id: 'pen_<stable-id>',
    team: 'subject',              // 'subject' | 'opponent' | 'unknown'
    phase: 'offense',             // 'offense' | 'defense' | 'special' | 'deadBall' | 'unknown'
    foul: 'Holding',              // preset or custom staff terminology
    disposition: 'accepted',      // 'accepted' | 'declined' | 'offsetting' | 'unknown'
    yards: 8,                     // actual enforced yards; null when unknown/N/A
    playCounts: false,            // true | false | null (unknown)
    player: '72',                 // optional jersey number
    automaticFirstDown: null,     // true | false | null (unknown)
    lossOfDown: null,             // true | false | null (unknown)
    notes: '',
    legacy: false
  }
];

play.resultingSituation = {
  down: '1',
  distance: '10',
  fieldSide: 'opp',
  yardLine: '35',
  confirmed: true
};
```

### Semantics

- `subject` means the team being analyzed: our team in Self-Scout, the future
  opponent in Opponent Scout. UI copy uses actual team names when known.
- `phase` records whether the charged team was acting on offense, defense,
  special teams, or after the play. Do not derive it permanently from `tags.unit`:
  returns, turnovers, and dead-ball fouls can change responsibility mid-play.
- `yards` stores a positive actual enforced distance. Direction is derived from
  charged team plus possession context; charting never asks for a minus sign.
- `playCounts` is independent from disposition. A declined foul normally leaves
  the play standing; a false start produces no statistical play; enforcement
  after a completed play may preserve some or all action.
- `resultingSituation` belongs to the snap, not an individual foul. It is the
  authoritative Auto D&D handoff only when `confirmed === true`.
- Foul names are vocabulary, not logic. Rules vary by federation and state, so
  defaults may suggest but never force yards, replay, automatic first down, or
  loss of down.

## 4. Charting UX

Penalty entry is a dedicated collapsed section immediately after Play & Result.
The primary action is **Add penalty**. It must not require selecting `Penalty`
inside Result.

### Fast path

1. **Charged to:** team-name segmented control; default follows the active unit
   but remains one tap to reverse.
2. **Foul:** contextual quick chips plus searchable/custom `Other`.
3. **Ruling:** Accepted (default), Declined, Offsetting.
4. Accepted reveals **Actual yards** and **Play counts / No play**.
5. **Resulting spot:** compact Down, Distance, Own/Opp, Yard Line. Defaults from
   known context but requires coach confirmation before Auto D&D trusts it.

The saved row collapses to a sentence such as:

```text
US · HOLDING · ACCEPTED · 8 YDS · NO PLAY
```

Each row has Edit and Remove. **Add another foul** supports offsetting and
multiple-foul plays without squeezing a second foul into notes.

### Contextual foul starter library

These are editable suggestions, not a closed enum:

- Offense: False Start, Holding, Illegal Formation, Illegal Motion, Delay of
  Game, Ineligible Receiver, Offensive Pass Interference, Intentional Grounding.
- Defense: Offside, Encroachment, Holding, Defensive Pass Interference,
  Facemask, Roughing the Passer, Personal Foul, Unsportsmanlike, Targeting.
- Special Teams/common: Holding, Block in the Back, Kick Catch Interference,
  Illegal Block, Roughing/Running Into Kicker, Illegal Substitution, Personal
  Foul, Unsportsmanlike.

Team Settings should eventually allow hiding defaults and adding staff terms,
using the same library pattern as Formation/Backfield/Front.

## 5. Legacy Strategy

Legacy data is lower priority and must never contaminate the new model.

- Do **not** guess charged team, foul, disposition, or penalty yards from the
  old `result:'Penalty'` and `yardage` fields. That yardage may describe the
  football action, not enforcement.
- On read, an old Penalty result with no structured record is presented as
  `Legacy penalty - details incomplete`.
- It remains searchable and counted in a separate `legacy/incomplete` bucket.
- New structured records are independent of the old Result chip. Creating or
  editing them does not add, remove, reinterpret, or overwrite legacy Result.
- Bulk destructive migration is prohibited. Export/restore must round-trip old
  data exactly until a coach completes it.
- Product rule: known-bad legacy data is never migrated merely for parity. No
  code may clear it without first asking permission and then obtaining an
  explicit confirmation immediately before the destructive action.

## 6. Analytics Contract

New reports must distinguish:

- Accepted, declined, offsetting, and incomplete legacy counts.
- Penalties and actual enforced yards by subject/opponent.
- Foul type frequency and film-linked rows.
- Unit, down, quarter, field zone, and game splits.
- Penalty rate per counted snap and per opportunity, with denominator named.
- Drive impact: first downs by penalty, stalled drives, scoring-drive penalties.
- Discipline: pre-snap vs live-ball once foul metadata supports that grouping.

Every number launches the exact composite play references. Declined and
offsetting fouls never inflate accepted penalty yards. Multiple fouls on one
play count as multiple foul records but one flagged play; both measures must be
available and clearly labeled.

## 7. Implementation Sequence And Gates

### P4D-a - pure contract and normalization

- Add penalty normalizer/accessors with stable ids and no DOM dependency.
- Preserve unknown fields for forward compatibility.
- Add synthetic fixtures for accepted, declined, offsetting, no-play, multiple,
  half-distance actual yards, change of possession, and legacy incomplete.
- Failing-first tests pin lossless save/reopen, export/import, backup restore,
  undo/redo, game switch, and old-season round-trip.

### P4D-b - tagging UI and Auto D&D

- Build the dedicated editor behind `ffa_breakdown_form_v2`.
- Result remains independently chartable.
- Auto D&D uses confirmed `resultingSituation`; otherwise it fails honestly
  rather than guessing complex enforcement.
- Add keyboard, mobile, multiple-foul, remove/undo, and unit/scout-label tests.

### P4D-c - Film Room, CSV, and analytics

- Add compact Penalty and Penalty Yards columns/editors.
- Extend CSV with structured JSON-safe columns while retaining legacy import.
- Add penalty summary and Study dimensions/measures over composite film refs.
- Extend analytics parity with explicit expected changes; do not overwrite the
  pre-penalty golden silently.

Implemented: Film Room exposes read-only Penalty/Pen Yds summaries and keeps
the validated multi-foul editor as the single editing surface. CSV round-trips
structured penalties and resulting situation as JSON-safe columns. Study can
group/filter by charged team, foul, ruling, phase, and whether the play counts.
The Game report separates flagged plays from foul records, excludes declined/
offsetting yards, and links foul rows to exact film. Legacy parity goldens are
unchanged.

### Release gate

- Real-season copy opens with all old plays intact.
- New penalties survive desktop/browser persistence and every recovery path.
- Multiple fouls never overwrite each other.
- Accepted/declined/offsetting totals and yards reconcile exactly.
- Auto D&D never invents a resulting spot.
- Full e2e, integrity fuzzer, parity, desktop smoke, and viewport QA pass before
  any default-on or release decision.
