# GridIron IQ Special Teams Model

> **Status:** Proposed Phase 4E contract. Product direction approved for
> research and redesign; production implementation has not started. This model
> prioritizes fast, accurate future charting over exact semantic migration of
> the legacy `scoreFor` workflow.

## 1. Product Decision

Special teams must be charted by **unit, role, and event outcome**, not by asking
the coach to interpret the scoreboard. The current `Scored by Us/Them` field is
removed from the redesigned workflow. The app derives scoring from the charted
team's role and the event outcome whenever the film makes that unambiguous.

The first choice is the unit being evaluated:

- Kickoff
- Kick Return
- Punt
- Punt Return
- Field Goal / Extra Point
- Field Goal Block

That choice tells GridIron IQ whether the analytics subject is kicking,
returning, attempting, or defending. Onside kicks and fakes are properties of
the underlying kick unit, not separate top-level statistical universes.

The flow must answer four coaching questions:

1. Which special-teams unit was on the field?
2. What did the kick, return, or attempt do?
3. Where did possession start and finish?
4. Which players executed the event?

No chip is required. Unknown details remain blank and are excluded honestly
from measures that need them.

## 2. Comparable-App And Rules Research

### QwikCut: copy the event-specific stat separation

QwikCut's advanced football stat entry separates Play Type values such as Punt,
Kickoff, Field Goal, PAT, and 2PT. Its detailed columns separately capture
kicker, returner, kick yards, return yards, made field goals, blocked kicks,
fair catches, touchbacks, onside kicks, touchdowns, and safeties. That is the
right base principle: chart observable events in dedicated fields instead of
asking who should receive scoreboard credit.

Source: [QwikCut Football Stat Entry - Advanced](https://support.qwikcut.com/portal/en/kb/articles/football-stat-entry-advanced-22-7-2023)

### Hudl: treat each unit as its own coaching problem

Hudl IQ describes Punt, Punt Return, Kickoff, Kickoff Return, and Field Goal/XP
as distinct units with different questions. Its public examples include punt
style and operation time, muff/catch/bounce decisions, kickoff landing point,
return allowed, catch location, and resulting field position. GridIron IQ
should follow that unit-specific rhythm rather than exposing one overloaded
Special Teams form.

Source: [Hudl IQ: Special Teams Data](https://www.hudl.com/blog/hudl-iq-special-teams-data)

### NCAA statistics: keep outcomes semantically distinct

The NCAA statisticians' manual distinguishes returns from fair catches,
touchbacks, muffs, blocks, and kicks with no return attempt. Return yardage
starts at possession and ends when the ball becomes dead or is lost. These
definitions support explicit attempt/outcome fields and reject a single generic
`kickOutcome` value as the long-term analytics contract.

Source: [NCAA Football Statisticians' Manual](https://fs.ncaa.org.s3.amazonaws.com/Docs/stats/Stats_Manuals/Football.pdf)

## 3. Problems In The Current Model

- `stType` mixes the event with perspective: `Kickoff` and `Kick Return` may be
  the same physical kick viewed from opposite units.
- `scoreFor: 'us' | 'them'` asks the coach to translate an event into app
  perspective. It becomes especially unclear in opponent scout, returns,
  blocks, fakes, muffs, and changes of possession.
- `kickOutcome` overloads returned, touchback, fair catch, downed, out of bounds,
  muffed, blocked, recovered, good, and no good even though those values answer
  different questions.
- `result` duplicates kick and scoring meaning with Punt, Field Goal, Good, No
  Good, Touchdown, and Safety. Two manually edited sources can disagree.
- Punt net currently subtracts a hard-coded 20 yards for a touchback. Touchback
  placement is ruleset- and context-dependent, so this can publish false data.
- One shared set of inputs cannot capture each unit well without either clutter
  or missing detail.

## 4. Proposed Data Contract

Add an optional structured object. Absence means no structured special-teams
charting. Unknown fields are `null` or blank rather than inferred.

```javascript
play.specialTeams = {
  version: 1,
  unit: 'puntReturn',
  // kickoff | kickoffReturn | punt | puntReturn | fieldGoal | fieldGoalBlock

  subjectRole: 'receiving',
  // kicking | receiving | attempting | defending

  attemptType: null,          // fieldGoal | extraPoint | null

  kick: {
    kind: 'traditional',       // editable/custom vocabulary
    direction: 'Left',         // offense/kicking-team perspective convention
    distance: 43,
    hangTime: 4.2,
    landing: { fieldSide: 'own', yardLine: '18' },
    operationTime: null
  },

  return: {
    attempted: true,           // true | false | null
    yards: 12,
    end: { fieldSide: 'own', yardLine: '30' }
  },

  outcome: {
    status: 'returned',
    // returned | touchback | fairCatch | downed | outOfBounds | blocked |
    // muffed | recovered | good | noGood | badSnap | touchdown | safety
    recoveredBy: null,         // subject | opponent | unknown | null
    score: 'touchdown',        // touchdown | fieldGoal | extraPoint | safety | null
    scoredBy: null             // rare explicit override: subject | opponent | unknown | null
  },

  isOnside: false,
  isFake: false,
  players: {
    kicker: '19',
    punter: '',
    returner: '4',
    blocker: '',
    recoverer: ''
  },
  notes: '',
  legacy: false
};
```

### Semantics

- `subject` is the team being analyzed: our team in Self-Scout and the future
  opponent in Opponent Scout. UI labels use the actual team name when known.
- `unit` is coach-facing and intentionally distinguishes Kickoff from Kick
  Return and Punt from Punt Return. `subjectRole` is stored explicitly so
  analytics do not have to parse a label.
- `attemptType` distinguishes Field Goal from Extra Point even on a miss, when
  no scoring value exists. Two-point tries remain offensive plays, not kicks.
- `outcome.status` describes ball state or attempt disposition only. It never
  stores touchdown or safety; `score` is the one scoring-event field.
- Scoring side is derived from `subjectRole`, `score`, and `recoveredBy`. If a
  rare play remains ambiguous, the UI asks which team possessed/scored using
  team names and stores `scoredBy` as subject/opponent. It never falls back to
  Us/Them wording. A safety without enough ownership evidence fails closed as
  unknown instead of being assigned to the wrong team.
- Kick distance, landing spot, return yards, and end spot are independent.
  Net, field-position value, and return opportunity are derived only when the
  required inputs and configured ruleset are known.
- Return yards may be negative. Kick distance and timing values may not.
- A fair catch, touchback, downed ball, or out-of-bounds kick is not silently
  counted as a return attempt.
- Onside and fake are modifiers. A fake may also carry the normal run/pass
  result so the football action remains analyzable.
- Player roles remain compatible with the roster contract but expand beyond
  the legacy kicker/returner pair.

## 4b. AMENDMENT — Two-Point Tries Are Special Teams (Lane B1)

> **Status:** DRAFT for Codex review. Not implemented. No code exists for this.
> **Author:** Claude. **Coach decisions recorded inline and marked COACH.**

### 4b.1 This reverses an accepted decision — read this first

§4 currently states: *"Two-point tries remain offensive plays, not kicks."*
**That is reversed here.** It is not an oversight in this draft; it is the point
of the amendment.

**COACH:** *"The extra point and 2-pt tries are special teams plays — that is
what they are by strict definition and that is where they should be charted and
scored."*

The football is unambiguous: the **try** is a special-teams down. Whether it is
executed by kick or by run/pass does not change what the down is. XP already
lives in Special Teams via `attemptType`; the 2-pt try was split off from its own
down and sent to offense, which is why the two halves of one play type now live
in two places.

**This explains the `'twoPoint'` fossil.** `stats-engine.js` `_conversionStats`
already compares `kind === 'twoPoint'` and `made()` already checks
`outcome.score === 'twoPoint'` — but `SpecialTeamsModel` has no `twoPoint`
anywhere, so **both comparisons are unreachable dead code** and a structured
2-pt try can never be counted. The stats layer was written expecting 2-pt in
Special Teams; §4 then decided otherwise; nobody removed the orphaned strings.
This amendment makes the existing code reachable rather than deleting it.

### 4b.2 Scope — deliberately narrow

**COACH:** *"It's a play that's run only a handful of times per game… I think
we're OK to keep it simple and not overengineer."* And: *"Special teams is
stand-alone for the most part. You don't have to worry about next play
dynamics."*

| Concern | Decision | Source |
|---|---|---|
| Charting home | Special Teams — attempting **and** defending | COACH |
| What is tracked | **Team score only.** No individual rollups | COACH |
| Official player stats | **Excluded.** A 2-pt catch is not a reception; only the points count | COACH |
| Success rate / D&D | **Excluded.** A try has no down and no distance | COACH |
| Ruleset config | **None.** Standard values hardcoded | COACH |
| Next-play dynamics | **None.** No Auto D&D carry; the try is self-contained | COACH |
| CYO inversion (kick=2, run/pass=1) | **Explicitly out of scope** | COACH |

**Standard scoring values, hardcoded:** kick XP = **1**; run/pass try = **2**;
defensive return on a try = **2** to the defending team.

**Player capture stays, rollups do not.** `players.{kicker, punter, returner,
blocker, recoverer}` already exist and are already chartable. Leave them
chartable on tries and build no rollup. The rollup is a pure read and is
additive later at any time; **capture is not retroactive** — a season charted
with no kicker recorded cannot be rolled up later without re-watching film.
Keeping the fields chartable costs nothing today and preserves the option.

### 4b.3 Why no ruleset gate (differs from §5, deliberately)

§5 requires a configured ruleset before deriving touchback placement or net
values. That is correct **because those are computed** — the film does not show
them. A defensive try return is the opposite: **the film shows it outright.**

**COACH:** NFHS ends the try on change of possession, so the defense cannot
score at his level — *"It won't be used at my level, but the HS rules can vary
somewhat so it is possible that it's needed. Plus, it's a part of the broader
game."*

So the field exists and is ungated. In a league where the rule does not apply,
the situation never arises and the field is never used. The app records observed
reality; it is not a rulebook and cannot verify a state's rules anyway. The
tradeoff, stated plainly: **the app cannot warn "your league does not allow
that."** That is accepted.

### 4b.4 Model shape — RECOMMENDED

Two candidates were considered. **Recommendation: extend `attemptType`. Do not
add a seventh unit.**

```javascript
// SpecialTeamsModel changes — additive only.
attemptType: 'fieldGoal' | 'extraPoint' | 'twoPoint' | null
SCORES:     add 'twoPoint'          // worth 2
```

The attempting side reuses the existing `fieldGoal` unit (`subjectRole:
'attempting'`); the defending side reuses `fieldGoalBlock` (`subjectRole:
'defending'`). No new units, no new roles, no schema growth beyond one enum
value in two places.

**Why not a seventh unit.** A `twoPoint` unit would need a `twoPointDefense`
peer to make the defensive return chartable — eight units to express one more
attempt type, when `attemptType` already exists for exactly this purpose (it was
introduced to separate FG from XP *on a miss*, where no score value exists).
Same problem, same solved shape.

**Honest wart, disclosed:** the `fieldGoal` unit already conflates a field goal
(a scrimmage down) with an extra point (a try). Adding `twoPoint` widens that
conflation. The alternative is renaming/splitting shipped, accepted units for a
play run a handful of times a game — which contradicts the scope above. The
coach-facing labels should carry the distinction the unit id does not:
`Field Goal / Try` and `Field Goal / Try Defense`.

### 4b.5 Scoring attribution — the one non-obvious branch

`scoringTeam()` resolves `twoPoint` on the same branch as `fieldGoal`/
`extraPoint`:

- `subjectRole: 'attempting'` + `score: 'twoPoint'` → **subject** scores 2.
- `subjectRole: 'defending'` + `score: 'twoPoint'` → **opponent** scores 2.
  (We defended; they converted. The common case.)
- **Defensive return** → the explicit `scoredBy` override, which
  `scoringTeam()` already checks **first**:
  - We defended and returned it: `subjectRole: 'defending'`, `score:
    'twoPoint'`, `scoredBy: 'subject'`.
  - We attempted and they returned it: `subjectRole: 'attempting'`, `score:
    'twoPoint'`, `scoredBy: 'opponent'`.

**The defaulting is correct by construction:** the common case (they converted
against our defense) resolves right with no extra input, and the rare case (a
return) *requires* an explicit statement. This is the same explicit-ownership
mechanism the safety work already established, and it needs no new machinery.

**This is the only place in the model where points flow to the opponent off the
subject's own attempt.** Every existing exception in `scoringSide()` flips
*toward* us (pick-six, scoop-and-score). This one flips away. It must be pinned
by test, not assumed.

### 4b.6 Branch table — the contract is these rows

Enumerated up front rather than discovered one review at a time. Every row needs
a test.

| # | Unit / role | attemptType | status | score | scoredBy | Points | To |
|---|---|---|---|---|---|---|---|
| 1 | fieldGoal / attempting | extraPoint | good | extraPoint | — | 1 | subject |
| 2 | fieldGoal / attempting | extraPoint | noGood | null | — | 0 | — |
| 3 | fieldGoal / attempting | twoPoint | good | twoPoint | — | **2** | subject |
| 4 | fieldGoal / attempting | twoPoint | noGood | null | — | 0 | — |
| 5 | fieldGoal / attempting | twoPoint | badSnap | null | — | 0 | — |
| 6 | fieldGoal / attempting | twoPoint | — | twoPoint | **opponent** | **2** | **opponent** (they returned ours) |
| 7 | fieldGoalBlock / defending | twoPoint | good | twoPoint | — | 2 | opponent (they converted) |
| 8 | fieldGoalBlock / defending | twoPoint | noGood | null | — | 0 | — |
| 9 | fieldGoalBlock / defending | twoPoint | — | twoPoint | **subject** | **2** | **subject** (we returned theirs) |
| 10 | any | twoPoint | — | twoPoint | unknown | 2 | **unattributed** (fails closed) |

Row 10 uses the existing sparse `unattributed` bucket — which is emitted **only
when nonzero** so parity goldens stay byte-identical. Do not regress that.

`blocked` is intentionally absent for `twoPoint`: there is no kick to block. A
`badSnap` on a run/pass try is real and retained.

### 4b.7 Required failing-first tests

Each must fail on current code before the fix, per
`GRIDIRON-IQ-RELEASE-GATE.md`. **Every negative assertion needs a positive
precondition** proving the mechanism ran — four assertions in Lanes A/C passed
against broken code because nothing executed.

1. **The fossil becomes reachable.** A structured 2-pt try is counted by
   `_conversionStats`. Currently impossible — `attemptType` cannot be
   `'twoPoint'`, so the comparison never matches. This is the failing-first case
   that proves the whole amendment.
2. **Every row of §4b.6**, especially rows 6 and 9 — points flowing to the
   opponent off our own attempt, and to us off theirs.
3. **Row 10 fails closed** and does **not** emit a zero-valued `unattributed`
   field (that drifted both parity goldens once already).
4. **Official stats exclusion** — a 2-pt pass/catch/run adds **nothing** to
   passing, rushing, or receiving totals in `_individualStats`.
5. **Success-rate and D&D exclusion.** ⚠ **Verify, do not assume.** A 2-pt try is
   `unit:'special'` but may carry a real `playType` (Run Inside / Short Pass),
   and `_currentPlays()` gates on `playType`. A try could therefore leak into
   success rate and the D&D table. Requirement: `unit === 'special'` is excluded
   from success rate, D&D, and run/pass efficiency **regardless of playType**.
   Whether this leaks today is unknown and must be probed first.
6. **Parity goldens stay byte-identical** for legacy-only seasons. Never
   regenerate to pass.
7. **Legacy `stType:'2-Pt'` plays are untouched** — not migrated, not inferred,
   not promoted. Per the standing known-bad-data rule.

### 4b.8 Open for Codex

1. **Do you accept reversing §4's "two-point tries remain offensive plays"?**
   This draft asserts the football is unambiguous. If you disagree, say so now —
   this is the load-bearing decision and everything else follows from it.
2. **`attemptType` vs a seventh unit** — §4b.4 recommends `attemptType` and
   discloses the FG/try conflation wart. Is the wart worth avoiding at the cost
   of two more units?
3. **Test #5 is a real unknown.** If ST plays already leak into success rate,
   that is a pre-existing defect wider than this amendment and should be its own
   finding, not absorbed here.

## 5. Ruleset Contract

Season or team settings must identify `NFHS`, `NCAA`, `NFL`, or `Custom` before
the app derives touchback placement, kick spot, or rules-sensitive net values.
When no ruleset is configured, GridIron IQ reports observed kick and return
numbers but does not invent a touchback adjustment.

Ruleset defaults are suggestions, not destructive migrations. The observed end
spot, when charted, is authoritative for field-position analytics.

## 6. Charting UX

Special Teams opens with a compact six-choice unit selector. The selected unit
reveals only its high-value fields. Frequent choices remain visible; advanced
timing, style, and player detail can expand without leaving the play.

### Kickoff

- Kick type: Deep, Pooch, Squib, Onside, Free Kick, custom
- Direction, distance, hang time, landing spot
- Outcome: Returned, Touchback, Fair Catch, Out of Bounds, Recovered
- Return allowed and end spot when applicable
- Kicker, tackler/cover player, recoverer

### Kick Return

- Catch/possession spot
- Outcome: Return, Touchback, Fair Catch, Muff, Out of Bounds
- Return yards and end spot
- Returner, lead/blocking grade, recoverer

### Punt

- Punt style: Traditional, Rugby, Quick, Pooch, custom
- Direction, gross distance, hang time, landing spot, optional operation time
- Outcome: Returned, Fair Catch, Downed, Out of Bounds, Touchback, Blocked
- Return allowed and end spot when applicable
- Punter, snapper, gunner/cover player

### Punt Return

- Possession decision: Return, Fair Catch, Let Bounce, Muff
- Possession spot, return yards, end spot
- Returner, blocker, recoverer

### Field Goal / Extra Point

- Attempt type: Field Goal or Extra Point
- Attempt distance and optional operation time
- Outcome: Good, No Good, Blocked, Bad Snap, Fake
- Kicker, holder, snapper, blocker when known

### Field Goal Block

- Opponent attempt type and distance
- Outcome: Good, No Good, Blocked, Bad Snap, Fake
- Blocker, recoverer, returner, return yards/end spot when applicable

The collapsed summary reads as an event, for example:

```text
PUNT RETURN | FAIR CATCH | OWN 18 | #4 CARTER
FIELD GOAL | 37 YDS | GOOD | #19 REED
```

## 7. Scoring And Analytics

The global scoreboard accessor reads the structured event first and keeps the
legacy `scoreFor` path only for old plays. New UI never writes `scoreFor`.

Required film-linked measures include:

- Kickoff: touchback rate, in-bounds rate, average landing/start position,
  return allowed, explosive returns allowed, onside recovery rate.
- Kick return: return opportunity rate, average and median return, starting
  field position, explosive rate, muff/fumble rate.
- Punt: gross and observed net, hang time, return rate, fair-catch rate,
  inside-20/inside-10, touchbacks, blocks, directional tendency.
- Punt return: return decision split, average/median return, field-position
  gain, explosive rate, muff rate.
- Field goal/XP: attempts and makes by distance bucket, block/bad-snap rate,
  operation time when charted.
- Field goal block: pressure/block rate, return outcomes, and opponent make rate.

Every denominator is named. Missing optional fields reduce only the relevant
sample. A play may count once as an event and in multiple descriptive splits,
but unique-play KPIs must deduplicate composite play references.

## 8. Legacy Strategy

- Do not migrate `stType`, `scoreFor`, `kickOutcome`, `kickDistance`,
  `returnYards`, `hangTime`, or `kickedTo` into the structured model. The coach
  considers these details untrustworthy.
- A legacy play may retain only the broad fact that it was already classified as
  `unit:'special'`. Its detail surface reads `Legacy Special Teams - details
  uncharted` until the coach intentionally selects a new unit and charts it.
- Current saves continue to round-trip the old bytes only as a temporary safety
  measure. The redesigned UI hides them and structured analytics never consume
  them when a valid structured event exists.
- Do not build inference, mapping, or merge machinery for known-bad detail.
- A future cleanup may remove the quarantined legacy keys, but only after an
  in-app preview and explicit coach confirmation immediately before deletion.
- General rule: known-bad data is not migrated. Any destructive cleanup requires
  permission and confirmation; absence of an answer means preserve the bytes.

## 9. Implementation Sequence And Gates

### P4E-a - pure contract and normalization

- Add DOM-independent normalizer/accessors and stable structured-event version.
- Add a ruleset seam without hard-coding touchback placement.
- Pin kickoff/return, punt/return, made/missed/blocked kick, muff/recovery,
  onside, fake, return score, safety, unknown, and legacy fixtures.
- Failing-first tests cover save/reopen, CSV, backup, undo/redo, game switch,
  scoreboard attribution, and old-season round-trip.

### P4E-b - phase-first tagging UI

- Build behind `ffa_breakdown_form_v2` after contract review.
- Remove `Scored by Us/Them` from the new surface; do not delete legacy data.
- Add unit-specific fields, team-name ownership prompts for rare ambiguity,
  keyboard behavior, mobile targets, and scout-perspective tests.

### P4E-c - Film Room, Study, and reports

- Add compact unit/outcome/kick/return columns and inline editors.
- Replace hard-coded punt-net logic with observed/ruleset-aware calculation.
- Add registry dimensions/measures and exact composite film-link parity.
- Preserve existing Advanced Reports until the replacement reconciles against
  explicit fixtures.

### Release gate

- No new play writes `scoreFor`.
- Every score is attributable without Us/Them language.
- Return attempts exclude fair catch/touchback/downed/no-attempt events.
- Net and field position never assume an unconfigured ruleset.
- Self-Scout and Opponent Scout label the analytics subject correctly.
- Legacy seasons reopen byte-for-byte with old special-teams fields intact.
- Full e2e, parity, integrity fuzzer, desktop smoke, and viewport QA pass before
  any default-on or release decision.
