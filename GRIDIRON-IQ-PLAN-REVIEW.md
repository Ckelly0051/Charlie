# GridIron IQ — Independent Plan & Contract Review

> **Author:** Claude (Fable), 2026-07-17. Standalone review, deliberately separate
> from the lane documents. Scope: the redesign plan, the release sequence, and the
> three governing contracts (Tag Model, Special Teams §4b, Penalty Model), judged
> against what this project is actually for. A code review may follow separately;
> nothing here changes code.

---

## 0. The context this review is judged against

Before critiquing the plan, state the goal it serves — because several of my
suggestions only make sense against it:

**A defensive-minded HS coach is about to permanently re-tag his film into this
tool, once.** Everything in flight exists to make that safe and worth it:

1. **Trust** — the score is right, data never silently moves or vanishes, a
   green gate means what it says. (The entire B-lane, the E1-R9 invariant, the
   integrity fuzzer, the release gate.)
2. **One re-tag, never two** — the data model must be correct *before* the
   permanent re-tag. (BETA-005/006 gating the beta; D3's "re-tagging anyway.")
3. **The payoff is defensive scouting** — the coach runs a Saban-derived
   defense; the four-dimension model + coverage call/family exist so tendencies
   read like a DC thinks (`qbAlignment × strength`, a six-field Big-12 call,
   Cover 3 Match chartable). The parked Answer Sheet is the end state.
4. **Free, offline, desktop-first, solo-friendly** — no server, no accounts, no
   per-seat pricing. The tool's lane is exactly the segment Hudl doesn't serve
   well.

The plan is healthy overall. The process — contract-first for data models,
builder/reviewer separation, failing-first + mutation + liveness rules — has
repeatedly caught release-blocking defects before they shipped (B1's uncharTable
2-pt, E1-R9's vacuous test, E2-R1's permanent-data path). Keep all of that.
What follows is where I'd tighten it.

---

## 1. Findings — ranked

### F1 [High] — E3 is the riskiest remaining lane and is currently one
undifferentiated block

The plan says "E3: analytics + parity." That is ~12 surfaces, 42+ direct
`formation`/`coverage` references (31 in stats-engine alone), a golden
regeneration with a key-by-key drift audit, registry cardinality changes, and
every composite decision from §8a — all in one reviewable unit. B2 taught us
what happens when a lane fixes two of three siblings and misses the third
(`_individualStats`). E3 has a dozen siblings.

**Suggestion:** split E3 into two reviewed checkpoints inside one lane, with ONE
golden regeneration at the end (two regens would double the audit surface):
- **E3a — the read spine:** registry dimensions (`qbAlignment`,
  `coverageFamily`, `multi:false` flags), stats-engine consumers, Big-12
  six-field key, cut filters, eligible-denominator cross-tabs. Parity
  regenerated + audited here.
- **E3b — the read edges:** Study dims/filters/saved views, Film Room columns,
  exports (CSV/HTML/scout/self-scout), call sheet, heat maps, suggestion
  engine. Parity must NOT drift in E3b — that's the proof E3a's regen captured
  everything.

The E3b-no-drift rule is the structural protection: it converts "did we find
every consumer?" from a hope into an assertion.

### F2 [High] — the coach-visible aftermath of D3 is not written anywhere a
smoke tester will read

D3 is right ("re-tagging anyway — don't optimize for legacy"), but its visible
consequences land the moment E3 ships, on the coach's real season, *before* any
re-tagging:

- Formation tendency tables shrink drastically (116 of 136 formation tags are
  alignment-only and will read as formation-blank).
- The Big-12 report re-keys on six fields — every existing call row changes.
- Cross-tabs start reporting `omitted` counts (the §6.5 eligible-denominator
  honesty).
- **Saved Study views silently go empty** (verified: `ffa_study_views_v1`
  persists dimension values like `formation:'Shotgun'`; after projection that
  value matches nothing).

Every one of these is *correct*. Every one of them also looks exactly like a
regression during an installed smoke. The last withdrawn beta died on
first-ten-minutes surprises; do not let contractually-correct surprises repeat
that.

**Suggestions:**
1. Add an **"Expected changes on legacy data"** section to the release-gate
   smoke record for the E3 candidate — a checklist of what SHOULD look
   different, so the smoke distinguishes honest change from regression.
2. E3b must handle saved views explicitly: either flag a view whose stored
   values contain moved tokens ("this view references retired values") or
   migrate the view's own filter values (a view is app metadata, not coach
   charting — rewriting it does not violate D3).
3. The `omitted` disclosure needs a one-line UX decision before E3 renders it
   (footnote text, where it appears). Two sentences now beats an inconsistent
   invention across 12 surfaces later.

### F3 [Medium] — the legacy-ST exclusion disclosure quietly fell out of the
plan, and no one decided that

The original audit (P1-4) and the pre-B1 plan required: *"chart one structured
punt and 50 legacy ST plays vanish from the report — show an explicit 'N legacy
ST plays excluded' line."* When Lane B re-scoped around tries, this disclosure
disappeared: **verified — no excluded/quarantine string exists in stats-engine
today.** The underlying behavior still exists (`_specialTeamsStats` goes
structured-only the moment any structured event exists; 4E-c's exclusion rule).

The coach WILL hit this mid-re-tag: the first game he re-charts ST structurally,
every legacy ST play stops counting in the report with no explanation.

**Suggestion:** revive it as a small E3b (or standalone) item — one honest line
in the ST report when legacy plays are excluded. If instead the decision is
"the re-tag makes it moot," fine — but make that an explicit coach decision
recorded in §4b, not an accident of re-scoping. Silent scope loss is how the
last beta's gaps happened.

### F4 [Medium] — E4 has an unresolved contract question the tag form cannot
dodge: does the editor show raw or projected?

Every consumer reads through the projection (§5.4). But the tag form is a
*writer*. Open a legacy play whose stored `formation` is `'Shotgun'`:
- If the form shows **raw** values, it displays a chip that no longer exists in
  the formation library — and the coach "sees" data the analytics ignore.
- If the form shows the **projection** (Shotgun lit under QB Alignment), then
  the moment he touches anything and saves, the write normalizes the stored
  play — a write triggered by coach action, which D3 permits, but it means
  "open + save = migrate one play." That is actually the ideal re-tag workflow
  (touch a play, it becomes clean), but it must be DECIDED and tested, not
  emergent.

**Suggestion:** put one paragraph in the E4 contract: *the form displays the
projected view; an explicit save writes projected values; an untouched play is
never written.* That single rule makes the re-tag self-cleaning play-by-play
and keeps the no-silent-write promise. Same rule answers CSV: **exports emit
the projected view** (export is a read surface); document that export→import
therefore normalizes.

### F5 [Medium] — the plan has no "definition of done" for the re-tag itself

The whole sequence funnels toward "coach re-tags permanently," but the plan
stops at "publish." The re-tag is the actual payoff event and it has no support:
no progress measure ("214 of 456 plays re-tagged"), no way to distinguish a
deliberately-blank formation from a not-yet-retagged play, no ordering guidance
(the untagged-filter + cut-up machinery helps, but nothing names the workflow).

**Suggestion:** add a thin **Lane R (re-tag support)** after E4, before or
during the candidate: (a) a "needs re-tag" definition (e.g., a play whose
projection moved a value — detectable purely, no new stored state), (b) a count
+ filter surfaced in Film Room/Break Down, (c) that's it. Two small pieces,
both read-only, and the re-tag becomes a tracked task instead of a vibe. This
is also the first place the coach *feels* the new model paying off — the
morale matters.

### F6 [Low] — sequencing pressure points, stated so nobody trips on them

- **B2-R1/R2 are still open on Codex's side** while E2 re-review is also
  Codex's. The plan should name the order (recommend: B2 closures first — they
  are release-path routing fixes; E2 re-review second) so the shared branch
  doesn't get two half-closed lanes. *(Both are small; this is coordination,
  not schedule risk.)* **[Resolved while this review was in draft: B2 closed
  ACCEPTED at `0250010`; E2 re-review is the only open baton.]**
- **A3/SqlCatalog cutover (#54) stays frozen until after publish.** It reworks
  the persistence layer under everything above. The plan implies this; say it.
- **E5 stays dead.** After the re-tag completes, the projection keeps earning
  its keep on imports/old backups forever at ~100 pure lines. Recommend the
  plan states: *the projection is permanent; E5 (rewrite-in-place migration)
  is closed unless the coach reopens it* — so nobody "cleans up" the projection
  in six months and breaks old-file imports.

### F7 [Low] — process debt worth capturing while it's fresh

- **Lesson #22 candidate for CLAUDE.md:** *an invariant that spans "any
  operation" must be tested at every operation that can produce the state, not
  at the mechanism you happen to be thinking about.* E1-R9 (vacuous unit-flip
  test) and E2-R1 (Same-as-Last/template bypass) are the same lesson caught
  twice in one week, by the reviewer both times.
- **Contract-first has earned tiering.** Full contract + adversarial review for
  anything touching stored data or analytics semantics (it has paid for itself
  three times). For pure-presentation lanes (E4 chip layout, G's Plan UX),
  build-first behind the flag with visual QA is cheaper and the blast radius is
  reversible. The plan currently implies one process for everything.
- The tag-model doc now carries five review-round sections (§13–§17). Fine as
  history, but when E3 opens, add a one-screen **"§0 — current rules only"**
  digest at the top so implementers stop re-deriving the final state from the
  correspondence.

---

## 2. What I would NOT change

- **The release order** B2 → E2 → E3 → E4 → G → candidate → installed smoke →
  publish. It is the right dependency order; nothing here reorders it.
- **D3.** Reading legacy honestly instead of building compatibility machinery
  is the single best decision in the E-lane. F2 is about *disclosing* its
  consequences, not softening them.
- **The no-inference rules** (Cover 3 is not Zone; blank means blank). They are
  the contract's spine and the thing that makes the analytics trustworthy.
- **The B2 scoring decisions** including §4b.3c's one-directional XP override.
  Decided with eyes open; leave them alone.
- **The bounded-cleanup pattern** (measure → ask → pin the exact count in a
  test). 12/1/0 is the template for any future destructive touch.

## 3. Decision-ready questions for the coach

1. **F3:** one disclosure line for excluded legacy ST plays — build it, or
   explicitly declare it moot because of the re-tag? *(Recommend: build; it's
   an hour and protects mid-re-tag trust.)*
2. **F4:** bless "form shows projection; save writes projection; untouched
   plays never written"? *(Recommend: yes — it makes the re-tag self-cleaning.)*
3. **F5:** want the re-tag progress counter/filter (Lane R)? *(Recommend: yes,
   thin version.)*
4. **F1:** E3 as two reviewed checkpoints with a single golden regen?
   *(Recommend: yes.)*

Everything else in this review is a default I'd apply unless overruled.
