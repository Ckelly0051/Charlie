# GridIron IQ Charting Save Contract

How a charted play is stored. Coach direction, 2026-10-10: "the play needs to
be recorded as it is charted", "save has to mean something", and a child value
can never outlive the parent it belongs to.

## 1. What a play can hold

`js/play-shape.js` (`PlayShape`) is the one owner of what a play can show,
read from its own parents:

| Parent | Decides |
|---|---|
| Unit (`countedUnit`) | the scrimmage look and Play & Result groups, the player roles |
| Special Teams unit | the event fields and kick or return roles |
| A try's attempt type | Run/Pass and Fake tries chart like a scrimmage snap |
| Fake (punt, field goal) | Play & Result and the ball roles, no scrimmage look |
| A turnover result | Tackler(s) on an offensive snap (interception, or a fumble the offense did not recover) |
| Motion, RPO, QB Run | their details (`ChartingDetails.TRIGGERS`) |
| Whose misses (`MissedTackles.mode`) | our missed tacklers by name, or the opponent's Count |

The Situation group (quarter, down, distance, hash, field position, drive)
shows on every play. Chart draws from `PlayShape`, Film Room locks every cell
it says a play cannot show (`PlayGrid.cellLocked`), and `PlayShape.settle`
removes what a play cannot show.

## 2. Chart edits a draft

- Chart edits a copy of the open play (`PlayTagger.getCurrentPlay()` returns
  the draft). The stored play, every report, the undo history and the disk
  change only on **Save**: the Save button, Save & Next, or confirming a Quick
  Chart entry.
- **Save stores what Chart shows.** It runs `PlayShape.settle` on the draft and
  copies the charting (tags, penalties, resulting situation, Special Teams,
  notes, diagram) onto the play as one change: one Undo step.
- **Changing a parent before saving loses nothing.** A unit switch, Special
  Teams unit or try attempt change keeps the other values in the draft;
  switching back shows them as charted. Nothing asks: a change of unit, Special
  Teams unit or attempt type has no confirmation.
- **Values the app fills in never make a play unsaved**: Auto D&D, Carry
  formation and the carried unit show on the next play and are stored when it
  is saved. Leaving a play holding only those values stores nothing.
- **Leaving with unsaved changes asks** Stay, Discard or Save: selecting another
  play, Previous, Skip, switching game or season, a Film Room edit of that
  play, and closing the window (Cancel, Discard or Save). Escape is Stay.
- **Undo** steps through the open play's unsaved changes first, then the saved
  history. Selecting a play does not add an Undo step.
- **Recovery.** While a draft has unsaved changes a copy is kept in browser
  storage (`giq_chart_draft`); after a crash or power loss, opening that play
  offers Restore or Discard. It is never counted as charting until saved.

## 3. Every other write

Film Room edits, the Film Room Unit column, CSV import and version restore
write the stored play directly; each edit is a save and settles the play.
`SeasonStore` still strips the Special Teams look fields on read and before
every durable write (`ST_ALIGNMENT_KEYS`).

## 4. Existing plays

The library already held values plays could not show (2025 JV, 50 plays,
`docs/HIDDEN-VALUES-LIST.md`, from `node tools/audit-hidden-values.mjs`).
Nothing rewrites them: the coach re-charts each one, and saving it drops what
it cannot show. Players credits a tackle only where the play shows Tackler(s),
so those hidden Tacklers no longer count.

## 5. Reports

A tackle counts where the play shows Tackler(s): defense, kick coverage, and an
offensive snap that ended in a turnover. The Defense board's player lines count
the same tackles as Players; its team modules stay defensive.

Proven by `tools/e2e-charting-save.mjs`.
