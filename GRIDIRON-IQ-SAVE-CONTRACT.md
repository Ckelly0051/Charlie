# GridIron IQ Charting Save Contract

How a charted play is stored. Coach direction, 2026-10-10: "the play needs to
be recorded as it is charted", "save has to mean something", a child value can
never outlive the parent it belongs to, and a misclick must never clear charted
data.

## 1. What a play can hold

`js/play-shape.js` (`PlayShape`) is the one owner of what a play can show,
read from its own parents:

| Parent | Decides |
|---|---|
| Unit (`countedUnit`) | the scrimmage look and Play & Result groups, the player roles |
| Special Teams unit | the event fields and kick or return roles |
| A try's attempt type | Run/Pass and Fake tries chart like a scrimmage snap |
| Fake (punt, field goal) | Play & Result and the ball roles, no scrimmage look |
| A change of possession | on our offensive turnover (interception, or a fumble the offense did not recover): our Tackler(s) and our missed tacklers on the return; on any turnover or takeaway: the opponent's Tackler(s) (`opponentTackler`, numbers only, credited to no one of ours) |
| Motion, RPO, QB Run | their details (`ChartingDetails.TRIGGERS`) |
| Whose misses (`MissedTackles.mode`) | our missed tacklers by name, or the opponent's Count |

The Situation group (quarter, down, distance, hash, field position, drive)
shows on every play. Chart draws from `PlayShape`, Film Room locks every cell
it says a play cannot show (`PlayGrid.cellLocked`), and `PlayShape.settle`
removes what a play cannot show.

## 2. Chart edits a draft

- Chart edits a copy of the open play (`PlayTagger.getCurrentPlay()` returns
  the draft). The stored play, every report, the undo history and the disk
  change only on **Save**: the Save button (stays on the play), Save & Next,
  confirming a Quick Chart entry, or a parent change.
- **Save stores what Chart shows.** It runs `PlayShape.settle` on the draft and
  copies the charting (tags, penalties, resulting situation, Special Teams,
  notes, diagram) onto the play as one change: one Undo step.
- **A parent change is a Save** (`PlayTagger.changeParent`): the unit (Chart's
  buttons, the C key, Film Room's Unit column), the Special Teams unit and a
  try's attempt type. When it would remove values the coach charted, an in-app
  prompt names them first ("Changing to Special Teams removes what Play 12 can
  no longer hold: Formation (Spread), Ball Carrier (22)."), with Cancel as the
  default; otherwise it applies at once. Two kinds of value never ask: values
  the app filled in (Auto D&D's down, distance and field position, the carried
  quarter and drive, the carried unit, Carry formation), tracked per draft
  until the coach changes them; and values the play already could not show,
  which any save drops.
- **Values the app fills in never make a play unsaved.** They show on the next
  play and are stored when it is saved; leaving a play holding only those
  values stores nothing.
- **Leaving with unsaved changes asks** Stay, Discard or Save: selecting another
  play, Previous, Skip, Next or Previous clip, switching game or season, a Film
  Room edit of that play, and closing the window (Cancel, Discard or Save).
  Escape is Stay. A typed note is unsaved from its first keystroke; a run of
  keystrokes is one Undo step, and typing after Undo or Redo starts a new one.
- **Undo** steps through the open play's unsaved changes first, then the saved
  history. Each step keeps which values the app filled in, so undoing a coach
  edit of a filled-in value makes it filled-in again. Selecting a play does not add an Undo step.
- **Recovery.** While a draft has unsaved changes, a copy is saved with its
  game (the game's `chartDraft`); after a crash or power loss, opening that
  play offers Restore or Discard. It is never counted as charting until saved.

## 3. Every other write

Film Room edits, CSV import and version restore write the stored play directly;
each edit is a save and settles the play. Film Room's cell editor closes before
it commits, so a prompt it raises stays open. `SeasonStore` still strips the
Special Teams look fields on read and before every durable write
(`ST_ALIGNMENT_KEYS`).

## 4. Existing plays

The library already held values plays could not show (2025 JV, 50 plays,
`docs/HIDDEN-VALUES-LIST.md`, from `node tools/audit-hidden-values.mjs`).
Nothing rewrites them: the coach re-charts each one, and saving it drops what
it cannot show.

## 5. Reports

A tackle counts where the play shows our Tackler(s): defense, kick coverage,
and an offensive turnover. Our missed tacklers count on defense, kick coverage
and an offensive turnover. Players, the Defense board's player lines and
Study's Tackler and Missed Tackler roles read the same plays; the Defense
board's team modules stay defensive. A return tackle after our turnover never
takes the play's sack or tackle for loss (`PlayShape.isReturnTackle`). The
opponent's tacklers are never credited.

Proven by `tools/e2e-charting-save.mjs`.
