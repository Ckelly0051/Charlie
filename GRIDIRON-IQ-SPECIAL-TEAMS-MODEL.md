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

## 4b. AMENDMENT — Two-Point Tries (Lane B1)

> **Status:** DRAFT for coach + Codex review. No code. Nothing implemented.
> **Author:** Claude. Coach decisions marked **COACH**.

### 4b.1 The defect

**2-Pt has always been a Special Teams play here.** `index.html:464` carries a
`2-Pt` chip in the legacy `stType` control, next to Kickoff, Punt, Field Goal,
and XP. `StatsEngine.playPoints()` scores it. It was never an offensive play in
this app.

**The Phase 4E structured redesign dropped it.** `SpecialTeamsModel` defines six
units — kickoff, kickoffReturn, punt, puntReturn, fieldGoal, fieldGoalBlock —
and no 2-Pt. `attemptType` accepts only `fieldGoal | extraPoint`. The
phase-first form offers those six and hides the legacy chips as
`.bdv-st-legacy`.

**Consequence in the shipped beta:** with `ffa_breakdown_form_v2` ON by default
on desktop (`configureBetaDefaults`), a coach **cannot chart a two-point
conversion at all**. Their historical 2-Pt plays are additionally quarantined
under the known-bad-data rule.

§4's *"Two-point tries remain offensive plays, not kicks"* is reversed. It did
not describe the app; it rationalized the omission.

This is why `_conversionStats` compares `kind === 'twoPoint'` and `made()`
checks `outcome.score === 'twoPoint'` while `SpecialTeamsModel` has no
`twoPoint` — **both are unreachable dead code**. The stats layer was written for
a model that included 2-Pt; the model shipped without it.

### 4b.2 Scope — what this is and is not

**COACH:** *"ST will not cleanly fit into either offense or defensive category.
The charting currently built is good. The stats engine is what could be most
impacted by inaccuracy if those ST stats are counted in offensive or defensive
stats. The only stat that really matters is did we update the team score
properly."*

That decides it. **This amendment restores 2-Pt charting and guarantees score
accuracy. It does not rebuild the form and does not add analytics.**

| Concern | Decision | Source |
|---|---|---|
| Charting home | Special Teams. `unit: 'special'` | COACH |
| Existing ST form | **Not rebuilt.** 2-Pt joins the existing unit selector | COACH |
| What must be right | **Team score.** Nothing else | COACH |
| Individual rollups | **None** (offense or defense) | COACH |
| Official player stats | **Excluded.** A 2-pt catch is not a reception | COACH |
| Success rate / D&D | **Excluded.** No down, no distance | COACH |
| Ruleset config | **None.** Standard values hardcoded | COACH |
| Next-play dynamics | **None.** ST is stand-alone | COACH |
| CYO inversion (kick=2, run/pass=1) | **Out of scope** | COACH |

**Standard values, hardcoded:** kick XP = **1**; run/pass try = **2**;
defensive return on a try = **2** to the defending team.

**Deliberately not charted:** a 2-pt try really does have an offensive formation
and a defensive front. The ST form does not surface those, and this amendment
does not add them. Recording the score correctly is the requirement; recording
what we lined up in is not. Noted here so a future reader knows it was a
decision, not an oversight.

**Player statistics are out of B1 — stated honestly.** The first draft argued
capture was "free" because `players.{kicker, punter, returner, blocker,
recoverer}` already exist. Codex rejected that, correctly: **those roles do not
describe a run/pass try.** A 2-pt passer is not a "kicker"; a 2-pt receiver is
not a "returner." Claiming the existing shape fits would be dishonest.

For B1: build **no** individual two-point statistics. If player fields are
captured at all, they are **optional film-search metadata only** and must not
enter any box-score total. A try-appropriate player model (passer / carrier /
receiver / defender) is future work, not a B1 deliverable.

### 4b.3 Model change — a dedicated try model

> **Revised after Codex review.** The first draft widened `attemptType` on the
> existing `fieldGoal` unit. Codex rejected that, correctly: it would be another
> field-goal-shaped workaround to unwind later. The first draft *disclosed* the
> conflation wart and widened it anyway — the disclosure did not make it right.

**A try is its own down. It gets its own units.**

```javascript
unit:        'try' | 'tryDefense'          // NEW. Not a field goal.
subjectRole: 'attempting' | 'defending'
attemptType: 'extraPoint' | 'twoPoint'
result:      'converted' | 'failed' | 'noPlay'
outcome.score: 'extraPoint' | 'twoPoint' | null
```

`fieldGoal` and `fieldGoalBlock` remain **exclusively** for field goals. Existing
structured XP records (`unit:'fieldGoal'` + `attemptType:'extraPoint'`) stay
**readable for backward compatibility** and are **not automatically migrated** —
per the standing known-bad-data rule.

**`result` is separate from `outcome.score` on purpose.** `converted` implies a
score; `failed` and `noPlay` do not. The distinction carries penalty and retry
outcomes that a score field alone cannot express (§4b.5).

**A two-point attempt never exposes kick controls** — no distance, no hang time,
no landing spot. That was the concrete failure of the first draft: it would have
handed a coach hang-time fields for a run/pass play.

### 4b.3a Official result vs execution events

> **Codex finding, accepted. This corrects a real modelling error in the first
> draft**, whose single `status` enum forced mutual exclusivity — so **bad snap
> + converted could not be expressed**, and the draft's own branch table wrongly
> assumed a bad snap fails.

`result` is the **official ruling**. Execution events are **optional, non-
exclusive details**:

```javascript
events: {                   // all optional, all independent of `result`
  badSnap:  false,
  blocked:  false,
  turnover: null,           // interception | fumble | null
  defensiveReturn: false,
}
```

Real combinations this must express:

- bad snap **+ converted** (holder picks it up and runs it in)
- interception **+ failed**
- interception **+ defensive return score**
- blocked kick **+ defensive return score**

**Blocked kick + two-point conversion is REAL** — Claude doubted it; Codex was
right. The NCAA statistics manual describes a blocked extra-point kick recovered
by the holder, followed by a completed pass for a successful two-point
conversion. It remains **one try**: the failed kick action transitions into a
live run/pass conversion.

```javascript
attemptType: 'extraPoint'   // what was attempted
events:      { blocked: true }
result:      'converted'    // the official ruling
outcome.score: 'twoPoint'   // what was awarded — 2, not 1
```

**This is the strongest argument for the three-way split.** Attempt type,
official result, and score genuinely disagree here: a play that began as a
1-point kick attempt ends as a 2-point score. Any model that collapses them
cannot represent it. It is a rare edge case and needs **no prominent UI** — the
requirement is only that `blocked` and `badSnap` are event details rather than
terminal outcomes, and that the coach can always record the official final
result.

Source: [NCAA Football Statistics Manual](https://fs.ncaa.org/Docs/stats/Stats_Manuals/Football.pdf)

### 4b.3b Scoring — no ruleset config; the coach records the official ruling

> **AGREED — coach + Codex + Claude.** No ruleset selector. B1 adds no setup
> complexity to an infrequent workflow. **The app records the coach's official
> scoring decision instead of judging whether the return was legal.**

**Fixed standard point values. Not configurable:**

| Event | Points |
|---|---|
| Successful kick XP | **1** |
| Successful two-point try | **2** |
| Failed try | **0** |
| No Play / Retry | **0**, and **no attempt counted** |

**A defensive return NEVER generates points automatically.** When one is
charted, the coach must choose explicitly:

- `No score`
- `2 points — our team`
- `2 points — opponent`

**The explicit official result always overrides inferred scoring.**

**Why this is better than either original position.** Claude proposed ungated
scoring with a `scoredBy` override; Codex proposed an NFHS/NCAA/NFL/Custom
ruleset gate. This is neither: it **fails closed without a config**. An NFHS
coach charts the return and selects `No score` — correct, because the try ended
at the change of possession. An NCAA/NFL coach selects the award — correct. The
app never invents points and never needs to know the league's rules. It supports
every ruleset by asking the only question that matters, at the one moment it
matters.

Requiring the choice is what makes the gate unnecessary: the coach cannot
silently inherit someone else's rules, because nothing is inherited at all.

§5's existing touchback ruleset is a separate concern and is **not** changed by
this amendment.

### 4b.4 Scoring attribution

`scoringTeam()` resolves `twoPoint` on the existing `fieldGoal`/`extraPoint`
branch:

- `attempting` + `score:'twoPoint'` → **subject** scores 2.
- `defending` + `score:'twoPoint'` → **opponent** scores 2 (they converted).
- **Defensive return** → the explicit `scoredBy` override, which
  `scoringTeam()` already checks **first**:
  - we defended and returned it → `defending` + `scoredBy:'subject'`
  - we attempted and they returned it → `attempting` + `scoredBy:'opponent'`

The defaulting is correct by construction: the common case resolves with no
extra input; the rare case *requires* an explicit statement. This is the same
explicit-ownership mechanism the safety work established. No new machinery.

**Note:** the defensive return is the only place points flow to the opponent off
the subject's own attempt. Every existing exception in `scoringSide()` flips
*toward* us (pick-six, scoop-and-score). This one flips away. Pin it by test.

**Why no ruleset gate.** §5 gates *derived* values (touchback placement, net)
because the film does not show them. A defensive return is *observed*. **COACH:**
NFHS ends the try on a change of possession so it cannot happen at his level —
*"the HS rules can vary somewhat so it is possible that it's needed. Plus, it's
a part of the broader game."* The field exists, ungated. Where the rule does not
apply, the situation never arises. Accepted tradeoff: the app cannot warn that a
league disallows it.

### 4b.5 Penalty resolution

> **Codex finding, accepted.** The first draft said nothing about penalties on a
> try — a real omission. `PenaltyModel` already exists and is the authority.

**Chart the official ruling. Never infer it from whether the film shows the ball
cross the goal line.**

| Situation | `result` | Attempt counted? | Points |
|---|---|---|---|
| `playCounts: false` | `noPlay` | **No** | none |
| Accepted or offsetting foul → retry | `noPlay` | **No** | none |
| Declined penalty | filmed result stands | Yes | per the film |
| Accepted penalty, score allowed to stand | `converted` | Yes | official score |
| Penalty disposition unresolved | — | **Do not finalize** | **warn** |

### 4b.6 Branch table — every row needs a test

| # | unit / role | attemptType | result | events | score | Pts | To |
|---|---|---|---|---|---|---|---|
| 1 | try / attempting | extraPoint | converted | — | extraPoint | 1 | subject |
| 2 | try / attempting | extraPoint | failed | — | null | 0 | — |
| 3 | try / attempting | twoPoint | converted | — | twoPoint | **2** | subject |
| 4 | try / attempting | twoPoint | failed | — | null | 0 | — |
| 5 | try / attempting | twoPoint | **converted** | **badSnap** | twoPoint | **2** | subject *(bad snap, still converted)* |
| 6 | try / attempting | **extraPoint** | **converted** | **blocked** | **twoPoint** | **2** | subject *(NCAA manual: blocked kick recovered → pass → 2)* |
| 7 | try / attempting | twoPoint | failed | turnover + defensiveReturn | **null** | **0** | — *(return charted, coach chose `No score`)* |
| 8 | try / attempting | twoPoint | failed | turnover + defensiveReturn | twoPoint | **2** | **opponent** *(coach chose `2 — opponent`)* |
| 9 | tryDefense / defending | twoPoint | converted | — | twoPoint | 2 | opponent *(they converted)* |
| 10 | tryDefense / defending | twoPoint | failed | — | null | 0 | — |
| 11 | tryDefense / defending | twoPoint | failed | turnover + defensiveReturn | twoPoint | **2** | **subject** *(coach chose `2 — our team`)* |
| 12 | try / attempting | twoPoint | **noPlay** | — | null | **0** | — *(retry; attempt NOT counted)* |
| 13 | try / attempting | extraPoint | failed | blocked | null | 0 | — |

**Rows 7/8/11 are the whole point of the scoring compromise:** an identical
charted defensive return produces 0, 2-to-opponent, or 2-to-us **purely from the
coach's explicit choice**. Nothing is inferred from the events.

Row 5 and row 6 are cases the first draft could not express — row 6 in
particular has `attemptType` and `score` disagreeing (a 1-point kick attempt
ending as a 2-point score), which no collapsed model can represent. Row 12 is the
penalty case the first draft omitted.

There is no `unknown` / `unattributed` row: a charted defensive return **requires**
one of the three explicit choices, so ambiguity cannot be persisted. The sparse
`unattributed` bucket is untouched by this amendment and must stay emitted only
when nonzero — parity goldens depend on it.

### 4b.6 THE REAL RISK — stats isolation

**COACH:** *"The stats engine is what could be most impacted by inaccuracy if
those ST stats are counted in offensive or defensive stats."*

This is the load-bearing requirement, and it is **larger than 2-Pt**. A 2-pt try
is `unit:'special'` but may carry a real `playType` (Run Inside, Short Pass) and
real `yardage`. `_currentPlays()` gates on `playType`, **not** on unit. So an ST
play carrying a playType may already be counted in:

- success rate (`_isSuccessfulPlay`)
- yards/play and run-pass efficiency
- the Down & Distance table
- explosive / negative-play rates

**⚠ UNVERIFIED. This must be probed before any implementation, not assumed.**
If ST plays already leak, that is a **pre-existing analytics defect wider than
this amendment** and belongs to its own finding — it would mean the coach's
offensive numbers are already contaminated by fakes and tries.

**Requirement — corrected wording (Codex).** The first draft said *"scoring is
the only place Special Teams plays count,"* which is false: ST plays legitimately
appear in ST reports and film review. The accurate statement:

> **Try and Special Teams plays are excluded from ordinary offensive, defensive,
> situational, and individual statistics. They remain available to dedicated
> conversion, Special Teams, penalty, scoring, and film-review surfaces.**

Exclusion applies on `unit === 'special'` **regardless of `playType`**.

**Audit each of these explicitly:**

| Surface | Tries must… |
|---|---|
| Individual rushing / passing / receiving / defensive totals | be **excluded** |
| Success rate, D&D | be **excluded** |
| Explosive rate, negative-play rate | be **excluded** |
| Generic scout reports | be **excluded** |
| Study queries | be **excluded** |
| Scoreboard | be **included** — this is the one that must be right |
| Dedicated conversion results | be **included** |
| Special Teams reports, film review | be **included** |

### 4b.7 Required failing-first tests

Each must fail on current code first, per `GRIDIRON-IQ-RELEASE-GATE.md`. **Every
negative assertion needs a positive precondition** proving the mechanism ran —
four assertions in Lanes A/C passed against broken code because nothing
executed.

1. **The fossil becomes reachable** — a structured 2-pt try is counted by
   `_conversionStats`. Currently impossible: `attemptType` cannot be
   `'twoPoint'`, so the comparison never matches. This is the case that proves
   the amendment.
2. **Every row of §4b.5**, especially 6 and 9 — points to the opponent off our
   attempt, and to us off theirs.
3. **Row 10 fails closed** and emits no zero-valued `unattributed` field (that
   drifted both parity goldens once already).
4. **Stats isolation (§4b.6)** — an ST play with a real `playType` and `yardage`
   contributes **nothing** to success rate, D&D, yards/play, or run/pass
   efficiency. Probe the current behavior first.
5. **Official stats exclusion** — a 2-pt pass/catch/run adds nothing to passing,
   rushing, or receiving totals.
6. **Score correctness end to end** — the scoreboard total after a 2-pt try
   matches the branch table. This is the one that matters.
7. **Parity goldens byte-identical** for legacy-only seasons. Never regenerate
   to pass.
8. **Legacy `stType:'2-Pt'` untouched** — not migrated, inferred, or promoted.

### 4b.8 B1 test gate — none of this passes until all are pinned

Failing-first, per `GRIDIRON-IQ-RELEASE-GATE.md`. **Every negative assertion
needs a positive precondition** proving the mechanism ran — four assertions in
Lanes A/C passed against broken code because nothing executed.

1. Both offensive and defensive tries are **reachable through the UI**.
2. Kick XP scores **1**; two-point conversion scores **2**.
3. **A defensive return alone scores nothing** (no automatic points).
4. Explicit `No score` on a charted return remains **zero**.
5. Explicit `2 points — our team` adds **two to us**.
6. Explicit `2 points — opponent` adds **two to them**.
7. The scoring choice **survives save / reopen**.
8. **No Play / Retry** adds neither points nor an attempt.
9. Every penalty / no-play / retry branch **counts attempts correctly**.
10. **Bad snap + converted is representable** (row 5).
11. **Blocked XP → two-point conversion is representable** (row 6) — the NCAA
    edge case; `attemptType` and `score` legitimately disagree.
12. Structured tries **do not affect ordinary player or team offense
    statistics** — audit every surface in §4b.7.
13. **Scoreboard and the dedicated conversion report agree.**
14. **Self-scout and opponent-scout attribution is correct** for every scoring
    row.
15. Legacy `stType:'2-Pt'` **remains untouched** — not migrated, inferred, or
    promoted.
16. Existing **parity goldens stay byte-identical**. Never regenerate to pass.
17. **The fossil becomes reachable** — a structured try is counted by the
    conversion path. Currently impossible; this is the failing-first case that
    proves the amendment.

### 4b.9 Scope boundary — what B1 does NOT deliver

B1 delivers **accurate try charting and scoring**, not try analytics.

Explicitly future work, not B1:

- Formation, play call, and defensive front on a try
- Conversion player leaderboards / individual 2-pt statistics
- Tactical try reports
- A try-appropriate player role model

The outcome B1 must produce: **the coach can chart every XP and two-point
situation, the scoreboard stays trustworthy, and the model does not create
another field-goal-shaped workaround to unwind later.**

### 4b.10 Open — for the coach

**Priority.** §4b.1 asserts the shipped beta cannot chart a 2-pt conversion at
all. If Codex confirms, that is a **beta blocker in its own right**, independent
of the tag model — a coach hits it the first time they go for two. Does it
outrank E1–E4?

**Pre-existing leak (§4b.7).** Whether ST plays already contaminate offensive
stats is **unverified**. If they do, the coach's current offensive numbers are
already polluted by fakes and existing ST plays — a defect wider than this lane
that should be split into its own finding rather than absorbed here. Probe
before implementing.

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
