# GridIron IQ Play Call Model

## Status

**ACTIVE PRODUCT MILESTONE — opened after the accepted Reports redesign was
packaged as local build `1.12.0-45` on 2026-08-11.**

This is the binding implementation contract. The first increment adds only
backward-compatible blank fields and the team-scoped playbook foundation. It is
not permission to migrate or reinterpret existing season data; that remains a
separate post-build, dry-run-and-confirm pass.

## Implementation Progress

- **P1 data foundation — accepted; P2 import gap closed (2026-08-11):**
  additive call/concept snapshot fields, every new-play constructor including
  CSV/Hudl import, and the DOM-free team-scoped `PlaybookLibrary`. No existing
  play was reinterpreted or migrated.
- **P2 durable Playbook & Calls manager — reviewed; token repair awaiting confirmation:** Team Settings can add,
  edit, favorite, and remove exact calls plus canonical optional defaults.
  Definitions remain team-scoped, mirror into the open season, roll back
  atomically on save failure, seed a new season, and recover from the newest
  season mirror alongside team identity and roster.
- **P3 native charting selector — accepted at `b952106`:** typeahead,
  favorite/recent choices, explicit one-use or durable Add, exact call/concept
  snapshots, visible defaults, and one-transaction override-safe call changes.
- **P4a Film Room + CSV consumers — complete, awaiting combined review:** Chart and Film
  Room now share one DOM-free call-application model. Film Room exposes distinct
  Play Call, Concept, and Notes columns, upgrades only stock saved presets, and
  applies saved-call defaults as one undoable transaction. CSV exports/imports
  Play Call, Play Call ID, and Play Concept losslessly; older CSVs remain valid.
- **P4b Study consumers — complete, awaiting combined review:** Play Call and Play
  Concept are ready registry/Study dimensions. Their grouped measures and Watch
  actions are equality-tested against the same canonical composite play refs.
- **P4c Reports + presentation consumers — complete, awaiting combined review:**
  Reports provide exact-call performance, concept roll-ups, and five situational
  call lenses over canonical measures. Report film actions use exact composite
  refs. Call Sheet and Plan prefer exact calls with legacy structural fallback.
  The old structural combination report is labeled Core Tendencies.
- **Review range:** commits `a5d29dc`, `71c0177`, and `bd1a2ad`
  (`a5d29dc^..bd1a2ad`). Final canonical gate: **85/85 green**. Do not package
  before independent acceptance; then build one installer for the combined smoke.
- **Still deferred:** existing-season mapping/migration, exactly as contracted
  below.
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
- Changing calls must preserve explicit per-play overrides.
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

## Delivery Sequence

1. Accept the active Reports redesign.
2. Implement the new fields and team playbook library without touching old data.
3. Independently review football semantics, persistence, CSV, reports, and film.
4. Do not package a charting-only installer. Integrate Film Room, CSV, Study,
   Reports, and exact-film consumers, then run one installer smoke covering
   charting, persistence, reporting correctness, and visuals together.
5. Scope, dry-run, approve, back up, and execute any legacy-data mapping later.

## Non-Goals

- Replacing standardized analytics with team terminology.
- Assuming every team uses one numbering system.
- Inferring strength from `26 Blast` without a team-defined rule.
- Automatically parsing old notes.
- Rewriting existing charted data during the initial build.
