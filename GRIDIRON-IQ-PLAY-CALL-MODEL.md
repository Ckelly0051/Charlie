# GridIron IQ Play Call Model

## Status

Built and in production: call and concept snapshot fields on every play, the
team-scoped Playbook & Calls library (Team Settings), the charting deck's call
selector, Film Room columns and editing, lossless CSV columns, Study
dimensions, Reports call performance and situational lenses, and Call Sheet and
Plan use of exact calls. Every consumer's numbers and Watch actions use the
same composite play refs. Mapping calls onto plays charted before the library
existed is not done and follows the rules below. History:
`docs/archive/plans/GRIDIRON-IQ-PLAY-CALL-MODEL-THROUGH-2026-10-04.md`.

## Goal

Let a coach chart the offense's exact call — for example `26 Blast` — and see it
through Film Room, Study, Reports, Call Sheet, Plan, CSV, and exact linked film,
without replacing standardized football dimensions.

| Dimension | Example | Meaning |
|---|---|---|
| Play Call | `26 Blast` | The coach's exact call |
| Concept | `Blast` | The reusable play family |
| Play Type | `Run Inside` | Standardized structural classification |
| Direction | `Right` | Where the play went |
| Formation | `Ace` | How the offense aligned |
| Strength | `Balanced` | Declared formation strength |

## Football-Correct Rule

Do not globally parse call numbers into direction or strength. Traditional
numbering may make `26` a 2-back through the 6-hole, commonly to the right, but
systems vary. The number does not inherently declare formation strength.

A team playbook entry may define `26 Blast -> Direction: Right`, and may provide
strength only when that team's terminology genuinely encodes it. Defaults remain
visible and overridable on every play.

## Target Model

Add backward-compatible fields:

```javascript
tags: {
  playCall: '26 Blast',
  playCallId: 'call_26_blast',
  playConcept: 'Blast',
  runPass: 'Run',
  playType: 'Run Inside',
  playDir: 'Right',
  formation: 'Ace',
  strength: 'Balanced'
}
```

The play stores call and concept snapshots so historical charting does not
silently change when a library entry is renamed. Missing fields normalize to
blank; old plays remain valid without migration.

## Charting Experience

- Label the field **Our Play Call** for self-scout offense and **Opponent Play**
  for opponent scout.
- Provide typeahead, recent calls, favorites, inline Add, and optional free text.
- Add a team-scoped **Playbook & Calls** manager under Team Settings.
- A call can supply optional defaults for concept, run/pass, play type,
  direction, formation, alignment, backfield, strength, personnel, or motion.
- Selecting a call exposes every applied default so the coach can override it.
- Picking a call replaces what is charted in every field it has a default for,
  in one undoable write; a field the previous call filled and the new one does
  not is cleared; every other charted field is kept (coach, 2026-10-07). A Gap,
  motion path or RPO detail it would clear is still confirmed first.
- Do not include `playCall` in automatic scheme carry-forward. Explicit Copy Last
  may copy it.

## Reporting And Film

Add Play Call and Play Concept as dimensions across Film Room, Study, Reports,
CSV, Call Sheet, Plan, and cut-ups. Minimum reporting:

- frequency, Success Rate, Yards per Play, Explosive Rate, Negative Play Rate;
- call by Down & Distance, Formation, personnel, and field position;
- call toward/away from strength;
- concept roll-up with precise calls nested underneath;
- exact composite `gameId::playId` film refs for every result.

Universal play type/direction/formation analysis remains intact. The current
structural `bigCall` composite must not be presented as the coach's actual call
after `playCall` exists.

## Notes And Legacy Behavior

The app currently lets `play.notes` double as “Call / Notes” in places. New
charting must separate those meanings:

1. Exact calls write to `tags.playCall`.
2. Staff commentary remains in `play.notes`.
3. Call Sheet prefers `playCall` and may fall back to notes for legacy plays.
4. Existing notes are never automatically converted.

## Existing-Data Migration — Separate Post-Build Pass

The coach may provide simple season-specific mapping instructions after the new
feature is built and verified. Migration is not part of the feature build.

Required sequence:

1. Inspect the real season and coach-provided mappings.
2. Produce a dry-run report listing every affected play, current values, proposed
   call/concept/defaults, and every conflict or ambiguity.
3. Leave ambiguous plays unchanged; never apply global numbering assumptions.
4. Obtain the coach's explicit confirmation immediately before writing.
5. Create a named backup/restore point.
6. Preserve play ids, clip refs, timestamps, notes, penalties, special-teams
   data, player attribution, and unrelated tags byte-for-byte.
7. Verify save/reopen, analytics parity, and exact film refs afterward.

Prefer a one-off reviewed mapping file or guided command over permanent migration
complexity in the customer UI.

## Non-Goals

- Replacing standardized analytics with team terminology.
- Assuming every team uses one numbering system.
- Inferring strength from `26 Blast` without a team-defined rule.
- Automatically parsing old notes.
- Rewriting existing charted data during the initial build.
