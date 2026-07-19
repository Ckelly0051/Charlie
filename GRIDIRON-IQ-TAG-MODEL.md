# GridIron IQ — Tag Model Contract (Lane E1)

> **Status: ACCEPTED (Codex final review, 2026-07-17).** Claude's final contract
> revision is `4813d41`; Codex independently closed E1-R1 through E1-R9 in §17.
> This is the canonical contract for BETA-005 (QB alignment) and BETA-006
> (coverage call/family). E2, E3, and E4 must implement these exact rules. Read
> §16/§15 for the final review round and §14/§13 for the first.
>
> **This lane gates the beta.** It is the last data-model blocker before the
> coach re-tags film permanently. Getting it wrong means re-tagging twice.

---

## 1. The defect — one field, three questions

`play.tags.formation` is a single multi-select field that answers **three**
different football questions at once:

| Question | Values living in `formation` today | Should be |
|---|---|---|
| Where is the QB? | Under Center, Shotgun, Pistol | **Its own single-value dimension** |
| What system/structure is this? | Wing-T, Spread, Trips, Ace, Bunch… | `formation` (multi) |
| What's the backfield? | Empty | `backfield` (single) |

Because they share one field, they **compete**. The coach cannot say "Shotgun
**and** Trips" as two independent facts — he picks from one list.

`play.tags.coverage` has the same defect at smaller scale: `Cover 0`–`Cover 6`
(the **shell**) and `Man`/`Zone` (the **family**) are different questions in one
single-select field. A coach who plays **Cover 3 Match** cannot record it.

**COACH, 2026-07-17, on why his data looks the way it does:** *"I only tagged it
that way because I had to."* This is the governing fact of this contract. The
existing tags measure **what the tool allowed**, not what the coach wanted. They
are not evidence of intent and must not be used to infer the model.

### 1a. Measured compatibility exposure (facts, not inference)

Audited against the real 456-play season. These numbers say **nothing** about
what should be charted — they only size the cost of changing the model:

| Measure | Count | Consequence |
|---|---|---|
| Plays with >1 QB alignment (single-value conflict) | **0** | Single-value `qbAlignment` is a clean projection |
| `Pistol` used in both `formation` and `backfield` | **0** | Dual-listing is a latent library defect, not live data |
| `Empty` used in both `formation` and `backfield` | **0** | Same — free to settle now |
| `coverage` values using `Man`/`Zone` | **0** of 270 | Every stored coverage is already a shell |
| Plays carrying `Power-I` | **0** | The migration guard is dead on current data |
| Plays missing the `backfield` property (would migrate) | **0** of 456 | `migratePlayFormation`'s legacy branch never fires here |

**Conclusion: the model change is cheap.** Nothing in the coach's data conflicts
with the target model. The cost is in the ~12 analytics/UI surfaces (§8), not in
the data.

---

## 2. Decisions — settled, do not relitigate

**All three decided by the coach, 2026-07-17.**

| # | Question | **Decision** | Rationale |
|---|---|---|---|
| D1 | Is `Pistol` a QB alignment or also a backfield? | **QB alignment only.** Remove from the backfield library. | Pistol is QB depth. "Pistol Diamond" composes as `qbAlignment:Pistol` + `backfield:Diamond` — nothing is lost, each field answers one question. |
| D2 | Where does `Empty` belong? | **Backfield only.** Remove from the formation library. | Empty answers "what's in the backfield?" = nothing. `personnel` already encodes 0 RB (`00`/`01`/`02`). Supersedes the v1.9.15 "Empty stays a dual citizen" note, which is now **obsolete**. |
| D3 | How do the 456 existing plays read after the split? | **Re-tagging anyway — don't optimize for legacy.** Old plays read honestly through the projection (§5); nothing is written; no report work is invested in making old data look complete. | The coach charted alignment into `formation` under duress. Formation will read blank on those snaps because the structure was **never recorded** — that is the truth, not a regression. |

**D3 is the load-bearing one.** It means: **no migration, no data rewrite, no
compatibility machinery.** Old plays simply read in the correct dimension. This
is consistent with the standing known-bad-migration rule — we do not build
machinery for data the coach will chart again.

---

## 3. The model — the offensive pre-snap look is FOUR orthogonal dimensions

| Dimension | Field | Cardinality | Values |
|---|---|---|---|
| **QB alignment** | `qbAlignment` **(NEW)** | **single** | `Under Center` \| `Shotgun` \| `Pistol` |
| **Formation** (system + receiver structure) | `formation` | **multi** (`" + "`) | `Single Wing`, `Double Wing`, `Wing-T`, `Flexbone`, `Wishbone`, `Spread`, `Wildcat`, `Unbalanced`, `Goal Line`, `Power-I`, `Ace`, `Victory`, `Trips`, `Twins`, `Doubles`, `Bunch` + custom |
| **Backfield** | `backfield` | **single** | `Single`, `Split`, `I`, `Power`, `Offset`, `Strong`, `Weak`, `Diamond`, `Empty` + custom |
| **Strength** | `strength` | **single** | `Right` \| `Left` \| `Balanced` |

**Net library changes:** `formation` loses `Under Center`, `Pistol`, `Shotgun`
(→ `qbAlignment`) and `Empty` (→ `backfield`). `backfield` loses `Pistol`
(→ `qbAlignment`). `qbAlignment` is new. Nothing else moves.

### 3a. Coverage — shell and family

| Dimension | Field | Cardinality | Values |
|---|---|---|---|
| **Coverage call** | `coverage` *(stored key unchanged)* | **single** | `Cover 0`–`Cover 6` + custom calls |
| **Coverage family** | `coverageFamily` **(NEW)** | **single, optional, blank by default** | `Man` \| `Zone` \| `Match` |

**The stored key stays `coverage`.** Its values are already coverage calls
(270/270); renaming the key to `coverageShell`/`coverageCall` would churn ~12
consumers, CSV headers, saved Study views, and parity goldens for a cosmetic
gain. `Man`/`Zone` are removed from its chip list.

**UI label: "Coverage Call", NOT "Coverage Shell" (E1-R4).** Codex's football
correction, accepted: a *shell* is the pre-snap safety structure (one-high /
two-high / MOFO-MOFC). `Cover 0`–`Cover 6` are coverage **calls**, not shells —
labeling Cover 3 a "shell" reads as wrong football to a coach who runs a
shell-based system. The second field's label is **"Coverage Family"**
(`Man`/`Zone`/`Match`).

> **BETA-006 explicitly forbids making the mixed field multi-select.** Both
> dimensions stay single-value. That is what makes the exact coverage-call ×
> family intersection possible without double-counting (§6.5).

---

## 4. What is NOT changing

- `personnel`, `motion`, `hash`, `playDir`, `defFront`, `blitz`, `runPass`,
  `playType`, `result` — untouched.
- **`formation` stays multi-select** and may legitimately hold both a *system*
  (`Wing-T`) and a *receiver structure* (`Trips`). That conflation is real but
  **multi-select already handles it without conflict** — the two never compete
  for one slot. BETA-005 named only the QB-alignment problem, which is a genuine
  single-value question trapped in a multi-value field. **Out of scope; do not
  expand this lane.**
- **`SeasonStore.migratePlayFormation()` is NOT touched, extended, or
  reused.** It is idempotent, tested, and dead on current data (0 plays). It
  still protects imported pre-v1.9.15 seasons, and its
  `hasOwnProperty('backfield')` guard is what keeps modern `Power-I` a
  structural formation. **Breaking it re-opens a documented production
  blocker.**
- **Redundancy across dimensions is allowed; conflict is not.** `Power-I` +
  `qbAlignment:Under Center` + `backfield:Power` may all coexist and say
  overlapping things. That is the coach's terminology and the standing rule is
  **never silently remap it**. What is forbidden is one value living in two
  dimensions' *libraries* (D1/D2) — that is ambiguity, not redundancy.

---

## 5. The projection rule — ONE rule, read-time only

> **A value stored in the wrong field, because the old field forced it, is READ
> in its correct dimension and removed from the old one at read time. No stored
> VALUE is ever moved or rewritten.**

**Recognized wrong-field tokens (the complete set — E1-R8):**
- *Alignment tokens* (`Under Center`, `Shotgun`, `Pistol`) are wrong in
  **`formation`** AND in **`backfield`** (D1 moved `Pistol` out of the backfield
  library). Both source fields are stripped; either may supply `qbAlignment`.
- *Family tokens* (`Man`, `Zone`, **`Match`**) are wrong in **`coverage`**.
  `Match` is a family value exactly like `Man`/`Zone` and must be
  stripped/projected identically, or the one-question-per-dimension invariant
  (§6.1) is still violated.

| Stored (legacy) | Reads as |
|---|---|
| `formation: 'Under Center'` | `qbAlignment: 'Under Center'`, `formation: ''` |
| `formation: 'Shotgun + Trips'` | `qbAlignment: 'Shotgun'`, `formation: 'Trips'` |
| `formation: 'Empty'` | `backfield: 'Empty'` **only if `backfield` is blank**; `formation: ''` |
| `formation: 'Empty'` + `backfield: 'Split'` (explicit) | `backfield: 'Split'` (kept), `formation: ''` (**Empty still stripped**) |
| `backfield: 'Pistol'` | `qbAlignment: 'Pistol'` **if alignment blank**; `backfield: ''` (**always stripped**) |
| `coverage: 'Man'` | `coverageFamily: 'Man'`, `coverage: ''` |
| `coverage: 'Match'` | `coverageFamily: 'Match'`, `coverage: ''` |
| `qbAlignment: 'Pistol'` + `formation: 'Shotgun + Trips'` | `qbAlignment: 'Pistol'` (kept), `formation: 'Trips'` (**Shotgun still stripped**) |

**Rules — read-time only, and it is GENUINELY read-only (E1-R2):**

1. **`_normalize` does NOT backfill `qbAlignment`/`coverageFamily` onto existing
   plays.** This is the deliberate difference from how `backfield`/`strength`
   were added in v1.9.15 (which *did* mutate loaded plays via
   `t.backfield = ''`). A `_normalize` default becomes durable on the next
   autosave — that is a write, and D3 promised none. So: existing plays are left
   byte-identical; the projection treats a **missing** key as blank.
   - **⚠ IMPLEMENTATION HAZARD this creates (E2/E3 must honor):** legacy plays
     will have **no** `qbAlignment`/`coverageFamily` property, while
     `backfield`/`strength` are always present. Every consumer MUST read the two
     new keys defensively (`tags.qbAlignment ?? ''`) and MUST NOT assume the key
     exists. A `for...in` / `Object.keys` audit that assumes symmetry with
     `backfield` will be wrong. This asymmetry is the price of a true read-only
     projection and is accepted deliberately.
   - **Newly created plays** (the blank-play template / `BreakdownForm` /
     `quick-chart`) ARE born with explicit `qbAlignment: ''` and
     `coverageFamily: ''`. Only *pre-existing* plays are left untouched.
2. **Wrong-field tokens are ALWAYS removed from the old dimension; they only
   SUPPLY the target when the target is blank (E1-R3).** These are two
   independent operations:
   - *Strip:* every recognized alignment token is removed from projected
     `formation` AND from projected `backfield`; every recognized family token
     (`Man`/`Zone`/`Match`) is removed from projected `coverage` — **always**,
     regardless of whether the target already has a value.
   - *Supply:* the stripped token fills the target dimension **only if the target
     is currently blank**. If the coach already set `qbAlignment:'Pistol'`, a
     legacy `Shotgun` in formation is still stripped but does **not** overwrite
     Pistol. Likewise an explicit `backfield:'Split'` survives while `Empty` is
     still stripped from `formation`. (Mirrors `migratePlayFormation`'s "don't
     clobber a deliberate pick" — but the strip is unconditional, the supply
     conditional.)
3. **Deterministic `qbAlignment` supply precedence (E1-R8).** Alignment can now
   be supplied from three places. When the target is blank, take the first that
   exists, in this fixed order — **do not guess**:
   1. an explicit `qbAlignment` already on the play (never overwritten);
   2. else the **first** alignment token in `formation`;
   3. else a `Pistol` in legacy `backfield`.
   Regardless of which supplies, **all** alignment tokens are stripped from BOTH
   `formation` and `backfield`. 0 real plays hit tiers 2–3 today (0 multi-
   alignment, 0 backfield-Pistol), so this is import/edge robustness — but it is
   pinned by a test so it can never drift.
4. **The projection is the single source of truth.** Every consumer reads
   through it (§8). No consumer may parse `formation` for alignment itself.

---

## 6. Invariants — the contract proper

**6.1 One question per dimension — enforced, not just stated (E1-R7).** No value
may appear in more than one dimension's library. D1/D2 settle the only two live
violations, but §6.6 lets a coach add custom values anywhere, so without
validation he could immediately re-add `Pistol` to Backfield or `Empty` to
Formation and re-break the model. **Rule:** the four canonical moved values are
**reserved** against re-creation in their *old* libraries, with a clear
validation message:
- `Under Center`, `Shotgun`, `Pistol` — reserved out of `formation` and
  `backfield` (they belong to `qbAlignment`).
- `Empty` — reserved out of `formation` (it belongs to `backfield`).

This is a **narrow reservation of these specific tokens**, NOT global
cross-library uniqueness. A coach may still use unrelated custom terminology
freely across dimensions (e.g. a custom front named the same as a custom
coverage) — imposing global uniqueness on football vocabulary needs its own
coach decision and is out of scope.

**6.2 Cardinality is declared and enforced.**
`qbAlignment`, `backfield`, `strength`, `coverage`, `coverageFamily` are
**single**. `formation`, `playType`, `result`, `defFront`, `blitz` are **multi**.
A single-value dimension **MUST NOT** be routed through a multi-value splitter
(`splitFormations` and friends), and the analytics registry **must declare
`multi:false`** for it. This is the mechanism that prevents double-counting.

**6.3 No inference between dimensions. Ever.**
- Never derive `coverageFamily` from `coverage`. **`Cover 3` is not `Zone`** —
  Cover 3 Match exists, and `Cover 1` is man under a shell. This is precisely
  why the coach separated them.
- Never derive `qbAlignment` from `backfield`, `formation`, or `personnel`.
- Never derive `formation` from `personnel`.
- **Blank means blank**, not "unknown, go guess."

**6.4 Blank is valid and stays valid.** No charting chip is required. Save &
Next remains available. An analysis that needs a dimension the play doesn't
carry **omits the play honestly** and says so — it never imputes. (Existing
contract; restated because four dimensions make blanks more common, not fewer.)

**6.5 Independent aggregation + eligible-denominator intersection (E1-R1).**
§6.4 (blanks are omitted) and any "every play lands in a cell" rule cannot both
hold — the draft's original wording contradicted itself and is corrected here.
- Each dimension aggregates **alone**, with its own denominator.
- A **multi**-value dimension may place one play in several rows — documented
  and correct; percentages may exceed 100%.
- A **single**-value dimension places each eligible play in **exactly one** row.
- **A cross-tab uses an ELIGIBLE denominator: only plays carrying a value on
  *every* axis of the cross-tab.** A play blank on any axis is **omitted from
  that cross-tab** (it cannot be placed, per §6.4) — it is NOT forced into a
  cell. Cell counts sum to the **eligible** count, not the total filtered count.
- **Every cross-tab result MUST report three numbers:** `total` (filtered plays
  in scope), `eligible` (plays with a value on every axis), and `omitted`
  (`total − eligible`). A cross-tab that shows cells without disclosing how many
  plays it dropped is dishonest and fails the gate.
- For two single-value axes (**coverage-call × family**, **qbAlignment ×
  strength**) each eligible play lands in exactly one cell, so
  `Σ cells === eligible`.
- A cross-tab involving `formation` (multi) may repeat a play across rows, but
  **must not** repeat it along a single-value axis; `eligible` still gates it.

**6.6 Terminology is the coach's.** Custom values are first-class in every
dimension (existing `TagLibrary` contract). Disabled values remain on historical
plays and in analytics. Never silently remap.

---

## 7. ⚠ THE LESSON-#17 HAZARD — the highest-risk detail in this lane

Lesson #17: *a field a unit's form can't set must never hold a value for that
unit.* It exists because the Save-&-Next carry propagated `formation` onto
Special Teams plays and **coded every ST play "Under Center."**

`qbAlignment`'s values are **`Under Center`, `Shotgun`, `Pistol`** — the exact
same value that caused that bug. The alignment key lists are **hard-coded in
three owned lists plus one copy-pasted duplicate**, sharing no source:

| # | List | Location | Keys today | E1 action |
|---|---|---|---|---|
| 1 | `CARRY_SCHEME_KEYS` | `play-tagger.js:1250` | `formation, personnel, defFront, coverage` | **add** `qbAlignment`, `coverageFamily`, `backfield`, `strength` |
| 2 | `SCHEME_KEYS` | `play-tagger.js:650` | `unit, formation, personnel, motion, runPass, playType, defFront, coverage, blitz, hash` | **add** `qbAlignment`, `coverageFamily`, `backfield`, `strength` |
| 3 | `ST_ALIGNMENT_KEYS` | `season-store.js:244` | `formation, personnel, defFront, coverage, blitz` | **add** `qbAlignment`, `coverageFamily`, `backfield`, `strength` |
| — | inline duplicate | `play-tagger.js:1287` | *same five, copy-pasted from list 3* | **delete**; consume list 3's source |

So E1 edits **three owned lists** and **removes one duplicate** — after this
there is no fourth list. **Adding an alignment key to a CARRY list (1/2) but not
the STRIP list (3) reproduces lesson #17 exactly, with the same value.** **Every
key that carries forward must also be strippable from an ST play** — carry and
strip move together or the leak returns.

**Required by this contract:**
- **E2 gives the ST-strip list a single source of truth** — `season-store.js`
  owns `ST_ALIGNMENT_KEYS`; `play-tagger.js:1287`'s inline copy is **deleted**
  and consumes that source. (Scoped, mechanical; not a refactor project.)
  Approved by Codex as E2 scope.
- **A failing-first test must prove the invariant in §7a** — not "the ST play
  cannot retain fields," which can pass vacuously (§7a / E1-R9).
- The test must be **mutation-verified**: revert any single one of the three
  list edits (or restore the deleted duplicate to drift from list 3) and it must
  fail. Name the mechanism, not a list count.

### 7a. The ST-strip invariant — stated so the test cannot pass vacuously (E1-R9)

`copyFromPrevious()` and templates **carry `unit`** (list 2 includes it). So an
**offensive** source applied to a Special Teams target turns the target into
offense — at which point retaining `formation`/`qbAlignment` is *legal*. A test
worded "an ST play cannot retain alignment after Same-as-Last" can therefore
pass **because the play stopped being ST**, exercising no stripping at all. That
is the exact vacuous-assertion class this project forbids.

**Do not force the target to stay ST** (that would break legitimate template/
unit semantics). Test the real invariant instead:

> **After ANY operation (carry, Same-as-Last, template, `setUnit`, `_normalize`),
> if the resulting play has `unit === 'special'`, every `ST_ALIGNMENT_KEYS`
> field is blank.**

Liveness is mandatory (standing rule): the test MUST include a legacy
Same-as-Last **source** and a legacy stored **template** that each end with
`unit:'special'` while carrying forbidden alignment values, and prove the
operation strips them (not that the value was never there). Separately prove an
**offensive** source/template may legitimately produce `unit:'offense'` and
**retain** its look — so the strip is shown to be unit-conditional, not blanket.

### 7b. Coach-approved data impact — measured, bounded (Codex, 2026-07-17)

Adding `backfield`/`strength` to `ST_ALIGNMENT_KEYS` means `_normalize` will
**clear** those stored values from legacy Special Teams plays — a destructive
change to existing data. Codex measured the real six-game fixture and requested
permission; **the coach approved on 2026-07-17** after the exact deletion was
identified. Measured impact, which E2 must pin and **must not exceed**:

| Affected | Count (of 456) |
|---|---|
| ST plays carrying `backfield` (cleared) | **12** |
| …of those also carrying `strength` (cleared) | **1** |
| Any other field cleared | **0 — do not broaden** |

These are leaked values the ST form could never legitimately set (same class as
the "Under Center" leak), so clearing them satisfies the standing known-bad-data
rule. **The cleanup is limited to `backfield`/`strength` on `unit:'special'`
plays; E2 must not widen it.**

**E1-R6 — the `backfield`/`strength` carry gap is FIXED in this lane, not
deferred (reversing the draft).** `backfield` and `strength` are in **neither**
carry list today, so they have never carried forward since v1.9.15. The draft
flagged this and punted it; Codex correctly reversed that, and the reason is
decisive: **E1 itself makes the inconsistency worse.** Before E1, alignment
carried forward (embedded in `formation`); after E1, `qbAlignment` carries but
its sibling pre-snap-look fields `backfield`/`strength` would not — and this
lands during the coach's **permanent re-tag**, the exact workflow E1 exists to
enable. Carrying the QB alignment while the backfield silently resets snap-to-
snap is a worse footgun than the original gap. Both are genuine pre-snap
alignment; both belong in the carry. This is a bug fix on the same lists §7
already edits — not scope creep, and not silent (it is specified here and
tested). **Completeness requirement Codex's finding did not state but this
contract adds:** because they now carry, `backfield`/`strength` MUST also join
`ST_ALIGNMENT_KEYS` (list 3), or they become a fresh lesson-#17 leak onto ST
plays. That is why the §7 table adds them to all three owned lists, not just the
two carry lists — and the measured cleanup this produces is pinned in §7b.

---

## 8. Blast radius — what E3 must touch (audited, ~12 surfaces)

`formation` / `coverage` have **42 direct references across 8 modules**
(`stats-engine.js` alone has 31). Every one is a consumer of the projection:

- **`stats-engine.js`** — `splitFormations`, `_tendencyStats`, `_bigTwelveData`,
  `_selfScoutGroup`/`_tellsFrom` (`byFormation`, `byFormStr`, `comboFD`,
  `comboFS`), `_selfScoutMatrix`, `_buildCutFilter` (cases `formation`,
  `comboFStr`, `comboFD`, `comboFS`, `bigCall`, `coverage`), `_defensiveStats`
  (coverages), `_frontCoverageCombos`, `generateScoutReport` (`formationDetail`),
  `generateDefensiveSelfScout`, Tendency-Matrix dimensions.
- **`analytics-registry.js`** — new dimensions, correct `multi` flags (§6.2).
- **`study-query.js` / `study-screen.js`** — dimensions, filters, saved views.
- **`play-grid.js`** — `COLUMNS` + enum editors. *(Note: `_optionCache` reads
  options live from the tag form's `.pick` groups, so a new chip group flows in
  automatically — verify, don't duplicate.)*
- **`storage.js`** — `exportCsv` columns + `importPlaysFromText` Hudl aliases.
- **`call-sheet-builder.js`** — `_playLabel`.
- **`breakdown-form.js`** — the 4C form groups; **`index.html`** — chip groups.
- **`tag-library.js`** — `DEFINITIONS` + Team Settings editor.
- **`season-store.js`** — `_normalize` defaults + `ST_ALIGNMENT_KEYS`.
- **`play-tagger.js`** — `ChipField` wiring, the four key lists (§7).
- **`quick-chart.js`** — writes tags; **`play-filter.js`**, `heat-maps.js`,
  `suggestion-engine.js` — read them.

### 8a. Composite keys — explicit decisions (E1-R5)

`_bigTwelveData` keys a "call" on `[formation, strength, motion, playType]`.
Once alignment leaves `formation`, **every Big-12 key silently changes**. A call
sheet without QB alignment is wrong football — *"Under Center Power Right Jet"*
is the call.

**The draft dropped `backfield` from the exact call — a real error, corrected
here (E1-R5).** §3 defines `backfield` as one of the four orthogonal pre-snap
dimensions, and *"Under Center + Ace + I"* vs *"Under Center + Ace + Offset"* are
different looks a DC keys on differently — his own data varies backfield (Power
77 / Single 41). Collapsing them would **undercount his core calls**, defeating
the entire "8–14 calls" premise of Big-12. So:

**Contract: `_bigTwelveData` (and the `bigCall` cut filter) key the exact call
on `[qbAlignment, formation, backfield, strength, motion, playType]`, and the
row displays those same fields.** `personnel` stays OUT of this signature unless
separately decided with the coach.

Composite decisions — each stated so nothing is emergent:

| Composite | Alignment joins? | Backfield joins? | Ruling |
|---|---|---|---|
| `bigCall` / `_bigTwelveData` | **Yes** | **Yes** | The exact call — all six fields above. |
| `comboFStr` (Formation × Strength) | No | No | Unchanged contract. **Add a *separate* `qbAlignment × strength` cross-tab** rather than silently widening this one. |
| `comboFD` (Formation × Down/Distance) | No | No | Unchanged. |
| `comboFS` (Formation × Situation) | No | No | Unchanged. |

**Note on multi-value `formation` in the key:** `_bigTwelveData` today keys on
the whole `formation` string (it does not split it), so a play is one call even
with a multi-value formation — adding `qbAlignment`/`backfield` (both single)
keeps it one call per play, no double-count. **Fragmentation caveat:** more key
fields → more distinct calls, so the count that covers 75/90% may rise. That is
correct (they *are* distinct calls), not a defect — the ranking handles it.
Anything drifting outside the keyed fields is a bug, not a correction (§9).

---

## 9. Parity expectations — drift is EXPECTED and must be audited, never masked

The projection changes what `formation` returns for existing plays, so
formation-keyed measures **will** drift. Per the B2-R2 precedent:

- **Regenerate the goldens; never add a comparison mask.** The committed
  `synthetic-edge.json` diff is the reviewed callout the standing rule requires.
- **Audit the diff key-by-key** and record the exact drifting keys in the
  handoff. Expected: formation-keyed tendencies, self-scout tells/matrix, scout
  `formationDetail`, Big-12 call keys, and any composite from §8a. Coverage
  should **not** drift (0 non-shell values stored).
- **Anything drifting outside that set is a defect, not a correction.**
- **Mutation-test the result:** reverting the projection must fail parity.
  A golden that passes with the fix reverted is a golden that proves nothing.

---

## 10. Test gate — E1 is not done until these are specified; E2–E4 must deliver them

Every item **failing-first** and mutation-verified. A negative assertion that
could pass because nothing ran must first prove mechanism liveness (standing
rule).

1. **(E1-R2)** A pre-existing play with no `qbAlignment`/`coverageFamily`
   property is left **byte-identical** by `_normalize` — the keys are NOT
   backfilled onto it. A **newly created** play is born with both as `''`.
2. **(E1-R2)** Projection: `formation:'Under Center'` → reads `qbAlignment:
   'Under Center'`, `formation:''`. The **stored** play object is byte-identical
   before and after the read (no value moved to storage).
3. Projection: `formation:'Shotgun + Trips'` → reads alignment `Shotgun`,
   formation `Trips`.
4. Projection never overwrites a deliberate `qbAlignment` / `backfield` value
   (supply is conditional on a blank target).
5. **(E1-R3)** Wrong-field token is stripped even when the target is already
   set: stored `qbAlignment:'Pistol'` + `formation:'Shotgun + Trips'` → reads
   `qbAlignment:'Pistol'` (unchanged), `formation:'Trips'` (**Shotgun stripped,
   not promoted**). Same for `coverageFamily` set + legacy `Man` in `coverage`.
6. `coverage:'Man'` → reads `coverageFamily:'Man'`, `coverage:''`.
7. **`Cover 3` does NOT imply `Zone`** — family stays blank (§6.3).
8. **(E1-R8) `backfield:'Pistol'`** → reads `qbAlignment:'Pistol'` (when
   alignment blank) and `backfield:''` (**always stripped**, since D1 removed
   Pistol from the backfield library).
9. **(E1-R8) `coverage:'Match'`** → reads `coverageFamily:'Match'`,
   `coverage:''` — stripped/projected exactly like `Man`/`Zone`.
10. **(E1-R8) supply precedence:** `formation:'Under Center'` +
    `backfield:'Pistol'` (no explicit `qbAlignment`) → `qbAlignment:'Under
    Center'` (formation token wins tier 2 over backfield-Pistol tier 3); BOTH
    tokens stripped from their fields.
11. **(E1-R8) D2 boundary:** `formation:'Empty'` + explicit `backfield:'Split'`
    → `backfield:'Split'` preserved, `formation:''` (**Empty still stripped**).
    No stored value rewritten in tests 8–11.
12. **(E1-R2)** Consumers read `qbAlignment`/`coverageFamily` defensively: a play
    *object literal* lacking the property (not just `''`) aggregates as blank and
    does not throw. (Guards the legacy-play asymmetry §5.1 creates.)
13. Single-value dimensions are never split on `" + "` (registry `multi:false`
    honored end-to-end).
14. **(E1-R1) Eligible-denominator intersection:** a coverage-call × family
    cross-tab where some plays are blank on one axis reports `total`, `eligible`,
    `omitted`; cell counts sum to **`eligible`**, not `total`; omitted > 0 is
    surfaced. A play blank on an axis appears in **no** cell.
15. `formation` (multi) may repeat a play across rows but never along a
    single-value axis; `eligible` still gates the cross-tab.
16. **(E1-R9) The ST-strip invariant, NOT a vacuous "cannot retain" (§7a):**
    after carry / Same-as-Last / template / `setUnit` / `_normalize`, **if the
    resulting play has `unit==='special'`, every `ST_ALIGNMENT_KEYS` field is
    blank.** Liveness is mandatory: a legacy Same-as-Last *source* and a legacy
    stored *template*, each ending `unit:'special'` while carrying forbidden
    alignment values, must have those values **stripped by the operation** (prove
    they were present first). Separately prove an offensive source/template may
    produce `unit:'offense'` and **retain** its look — the strip is
    unit-conditional. **Mutation: revert any one of the three list edits (or
    restore the deleted inline duplicate so it drifts from list 3) → fails.**
17. **(E1-R6) Carry works for all four pre-snap look fields:** on Save-&-Next to
    an untagged offensive play, `qbAlignment`, `backfield`, and `strength` carry
    forward (with `formation` etc.); on an ST target they land blank (test 16).
    Same-as-Last and templates carry the same set. Failing-first (these keys do
    not carry today).
18. **(E1-R6/R7b) ST cleanup impact is bounded (§7b):** `_normalize` clears
    `backfield`/`strength` from `unit:'special'` plays and **nothing else** — on
    the real fixture exactly **12** plays lose `backfield`, **1** also loses
    `strength`, **0** other keys change. Pin the count; a broader clear fails.
19. `Power-I` on a modern play (has `backfield`) is **never** migrated to
    `backfield:'Power'` — the existing guard still holds.
20. A truly legacy play (no `backfield` property) still migrates exactly as
    today — `migratePlayFormation` behavior byte-identical.
21. **(E1-R7)** `Pistol`/`Shotgun`/`Under Center` are rejected from the
    `formation` and `backfield` libraries with a validation message; `Empty` is
    rejected from `formation`; an unrelated custom value is still accepted in any
    library. Neither reserved value is deleted from any historical play tag.
22. A disabled/hidden library value still renders on a historical play and still
    aggregates (existing `TagLibrary` contract).
23. CSV round-trip carries `qbAlignment` + `coverageFamily`; a legacy CSV
     without those columns imports cleanly.
24. Blank dimensions: an analysis needing a blank dimension omits the play and
     reports the omission — it never imputes.
25. Parity: goldens regenerated, drift limited to the audited key set (§9),
     mutation-verified.

---

## 11. Scope boundary

**In:** the four offensive dimensions, the coverage-call/family split, the
libraries, the charting UI, the read projection, the aggregation contract, and
the §7 hazard.

**Out — do not let these ride along:**
- **E5 migration** — optional, post-release, needs its own impact report and
  explicit confirmation immediately before writing. **Not on the release path.**
  D3 makes it unnecessary: old data reads correctly with no migration.
- **The systems-vs-structure conflation** in `formation` (§4) — real, but
  multi-select handles it. Needs its own decision if the coach ever wants it.
- Renaming the stored key `coverage` → `coverageCall`/`coverageShell` (§3a) —
  rejected as churn; only the UI label changes (E1-R4).
- Motion, personnel, front, hash, playDir — untouched.

*(The `backfield`/`strength` carry gap is NO LONGER out of scope — E1-R6 folds
it into this lane; see §7.)*

---

## 12. Open items for the reviewer

All four original reviewer items are now **resolved by Codex's §13 review** and
the §14 revision:
1. **§3a stored key `coverage`** — approved (§13 "Approved open items"); UI label
   corrected to "Coverage Call" per E1-R4.
2. **§8a composites** — resolved by E1-R5: `bigCall` keys on all six fields
   (incl. `backfield`); `comboF*` stay formation-only; a separate
   `qbAlignment × strength` is added.
3. **§4 `Power-I` redundancy** — approved (§13 "Approved open items"): valid
   formation, may coexist with `Under Center` + `Power`.
4. **§7 single-source-of-truth ST-strip edit** — approved as E2 scope (§13).

**Next action after approval:** E2 — pure normalization + the non-mutating
projection + the four-key carry fix (E1-R6) + the ST-strip single source
(§7/E2), failing-first, no analytics changes. Then E3 (analytics + parity),
then E4 (charting UI + libraries, behind the existing flag).

---

## 13. Independent review — CHANGES REQUIRED (Codex, 2026-07-17)

The four-dimension offensive model and the coverage split are approved in
direction. The following contract defects must be resolved before E2 begins.

### E1-R1 [High] — blank-valid and exact-intersection rules contradict

Sections 6.4 and 10.16 correctly say blank values are valid and omitted from an
analysis. Section 6.5 and test 8 incorrectly require every filtered play to land
in a cross-tab cell. Those cannot both hold. Cross-tabs must use an explicit
**eligible denominator**: plays with values for every axis. Cell counts sum to
that eligible count, and the result reports `eligible`, `omitted`, and total
filtered plays. The same rule applies to shell/family and alignment/strength.

### E1-R2 [High] — read-only projection conflicts with normalization defaults

Section 5 promises no mutation and test 2 requires a byte-identical play, while
5.1 also requires `_normalize` to add `qbAlignment:''` and
`coverageFamily:''`. `_normalize` mutates loaded data and a later autosave makes
those keys durable. Pick one contract. Recommendation: the projection treats
missing keys as blank without adding them to existing plays; only newly created
plays receive explicit blank keys. This is genuinely read-only and satisfies D3.

### E1-R3 [Medium] — explicit target values must not preserve wrong-field tokens

"Never overwrite" is correct for the target field, but the draft is ambiguous
about the source field. If `qbAlignment:'Pistol'` already exists while legacy
`formation:'Shotgun + Trips'` remains, projection must preserve Pistol **and
still remove Shotgun from projected formation**. Likewise, an explicit
`coverageFamily` must not leave legacy `Man`/`Zone` in projected `coverage`.
All recognized wrong-field tokens are always removed from the old dimension;
they only supply the target when the target is blank. For malformed multiple
alignments, first supplies the blank target and all alignment tokens are removed.

### E1-R4 [Medium, football] — “Coverage Shell” is the wrong coach-facing label

Keep the stored key `coverage`; that part is approved. But Cover 0–Cover 6 are
coverage calls, not strictly shells. A shell normally describes the pre-snap
safety structure (zero-high, one-high, two-high), and calling Cover 3 a shell
will confuse knowledgeable coaches. Use UI label **Coverage** or **Coverage
Call**. Keep the optional second field as **Coverage Family** (`Man`, `Zone`,
`Match`). Do not infer one from the other.

### E1-R5 [Medium, football] — the “exact call” omits backfield

Section 8a mandates `[qbAlignment, formation, strength, motion, playType]`, but
Section 3 defines backfield as one of the four orthogonal pre-snap dimensions.
Under Center + Ace + I and Under Center + Ace + Offset are different looks and
must not collapse into one exact call. Big Twelve must key on
`[qbAlignment, formation, backfield, strength, motion, playType]` and display the
same fields. Personnel remains outside this signature unless separately decided.

Composite decisions:
- `comboFStr` remains Formation x Strength; alignment does not join it.
- `comboFD` remains Formation x Down/Distance; alignment does not join it.
- `comboFS` remains Formation x Situation; alignment does not join it.
- `bigCall` includes alignment and backfield as specified above.
- Add/retain a separate QB Alignment x Strength cross-tab; do not silently widen
  the existing Formation x Strength contract.

### E1-R6 [Medium] — do not knowingly ship the backfield/strength carry defect

The draft identifies that `backfield` and `strength` are absent from both carry
lists, then defers it. That would make the new four-part model internally
inconsistent during the coach's permanent re-tag: alignment carries, while two
other pre-snap look fields unexpectedly disappear. This is the same small,
high-risk surface E2 already changes. Add both keys to `CARRY_SCHEME_KEYS` and
`SCHEME_KEYS`, preserve same-unit and Special Teams stripping rules, and cover
carry, Same-as-Last, and templates with failing-first tests. This is a bug fix,
not an unrelated feature.

### E1-R7 [Low] — library uniqueness needs an enforceable rule

Section 6.1 forbids a value from appearing in two dimension libraries, while 6.6
allows custom values everywhere. Without validation a coach can immediately add
`Pistol` back to Backfield or `Empty` back to Formation. At minimum, reserve the
canonical moved values against re-creation in their old libraries with a clear
validation message. Do not impose global cross-library uniqueness on unrelated
custom football terminology without a separate coach decision.

### Approved open items

- Stored key remains `coverage`; only the UI terminology changes per E1-R4.
- `Power-I` remains a valid formation. It may coexist with `Under Center` and
  `Power`; this is meaningful coach terminology, not a duplicate stored value.
- `ST_ALIGNMENT_KEYS` remains owned by `season-store.js`, and the tagger consumes
  that source rather than maintaining an inline copy. This scope belongs in E2.

**Next action:** Claude revises this contract only. Codex re-reviews the revised
bytes. No E2 code until these seven findings are closed or explicitly decided by
the coach.

---

## 14. Revision — findings resolved (Claude, 2026-07-17)

All seven findings accepted; none rejected. Verified each by reasoning it
through, not deferred to. Two (R1, R2) were genuine self-contradictions in the
draft; two (R4, R5) were football corrections where Codex was right and the
draft was wrong; R6 reversed a deferral on a sound argument.

| Finding | Resolution | Where |
|---|---|---|
| **E1-R1** [High] | Cross-tabs use an **eligible denominator**; report `total`/`eligible`/`omitted`; blank-on-axis plays land in no cell. The old "sum to filtered count" wording deleted. | §6.5, tests 14–15 |
| **E1-R2** [High] | Projection is **genuinely read-only**: `_normalize` does NOT backfill the two new keys onto existing plays (unlike v1.9.15 `backfield`); only *new* plays are born with them. **Added hazard the fix creates:** consumers must read the keys defensively — legacy plays lack the property entirely. | §5 rule 1, tests 1–2, 12 |
| **E1-R3** [Medium] | Strip and supply separated: wrong-field tokens are **always** stripped from the old dimension; they **supply** the target only when it is blank. | §5 rules 2–3, test 5 |
| **E1-R4** [Medium] | UI label is **"Coverage Call"**, not "Coverage Shell" — Cover 0–6 are calls, a shell is the safety structure. Coach-overridable. | §3a |
| **E1-R5** [Medium] | Exact call keys on **`[qbAlignment, formation, backfield, strength, motion, playType]`** — backfield was wrongly dropped. Per-composite table; separate `qbAlignment × strength` cross-tab. | §8a |
| **E1-R6** [Medium] | `backfield`/`strength` carry gap **fixed in this lane, not deferred** — E1 itself makes it worse during the re-tag. **Added completeness requirement:** they must also join `ST_ALIGNMENT_KEYS` or they become a fresh lesson-#17 leak. | §7, §11, tests 16–17 |
| **E1-R7** [Low] | Narrow **reserved-value** rule: the 4 moved tokens are rejected from their old libraries; no global cross-library uniqueness. | §6.1, test 21 |

**Two hazards Codex's own fixes introduce, now pinned by the contract (my
additions, not in §13):**
1. **R2 → defensive-read asymmetry.** Legacy plays will have no
   `qbAlignment`/`coverageFamily` property while `backfield`/`strength` are
   always present. Every E3 consumer must read the new keys with `?? ''` and
   must not assume symmetry. Test 12 guards it.
2. **R6 → ST-strip completeness.** Adding `backfield`/`strength` to the carry
   lists forces adding them to `ST_ALIGNMENT_KEYS`. The §7 table adds them to all
   **three owned lists** and deletes the inline duplicate, or they leak onto ST
   plays.

*(§14 note: test numbers above refer to the FINAL §10 gate after the §16
revision — the count grew again there. Original §14 revision took the gate 17 →
20.)*

---

## 15. Codex re-review — CHANGES REQUIRED (2026-07-17)

**E1-R1 through E1-R7 are substantively closed.** The eligible denominator,
read-only handling, unconditional source stripping, Coverage Call terminology,
exact-call backfield, carry repair, reserved values, and composite decisions are
accepted.

### Coach-approved data impact — backfield/strength ST cleanup

The E1-R6 completeness change adds `backfield` and `strength` to
`ST_ALIGNMENT_KEYS`, so `_normalize` will clear those stored values from legacy
Special Teams plays. Codex measured the real six-game fixture before approval:
**12 of 456 plays are affected** — 12 carry `backfield`; 1 of those also carries
`strength`. On 2026-07-17 the coach explicitly approved clearing both field types
from existing ST plays after the deletion was identified and permission was
requested. This satisfies the standing known-bad-data rule. Pin the measured
impact in the E2 handoff; do not broaden the cleanup beyond these declared keys.

### E1-R8 [Medium] — projection does not cover every value moved by D1/D2

The contract says every wrong-field value reads in its correct dimension, but
§5 only projects alignment tokens out of `formation` and only lists `Man`/`Zone`
for coverage family. Two moved-value paths remain unspecified:

1. `backfield:'Pistol'` was legal in the old library and D1 moves Pistol to QB
   alignment only. It must project to `qbAlignment:'Pistol'` when alignment is
   blank and project `backfield:''` always. If formation also supplies an
   alignment, define deterministic precedence: explicit `qbAlignment` first,
   then the first formation alignment token, then legacy backfield Pistol.
2. `coverageFamily` includes `Match`, so a legacy/custom `coverage:'Match'` must
   be stripped/projected exactly like Man/Zone. Otherwise the one-question-per-
   dimension invariant can still be violated.

Also add the missing D2 boundary test: `formation:'Empty'` with an explicit
nonblank backfield preserves the explicit backfield but still strips Empty from
projected formation. No stored value is rewritten in any of these cases.

### E1-R9 [Medium] — ST operation tests can pass by changing the unit

`copyFromPrevious()` and templates currently carry `unit`. An offensive source
can turn a Special Teams target into offense, at which point retaining formation
or alignment is legal. Therefore “an ST play cannot retain fields via
Same-as-Last/template” can pass without exercising ST stripping — the exact
vacuous-test class this project forbids.

Preserve current template/unit semantics; do not force the target to remain ST.
Specify and test the actual invariant instead:

> **After every operation, if the resulting play has `unit === 'special'`, every
> `ST_ALIGNMENT_KEYS` field is blank.**

The test must prove liveness with a legacy Same-as-Last source and a legacy
stored template that both end with `unit:'special'` while carrying forbidden
values; the operation must strip them. Separately prove that an offensive
source/template may produce `unit:'offense'` and retain its legitimate look.

### Documentation cleanup [Low]

After R8/R9 are revised, remove stale wording that still calls the fields
“shell × family,” says “all four lists” after the inline fourth list is deleted,
or says mutation must revert “one of four list edits.” There are three owned
lists plus removal of one duplicate; name the mechanism being mutated instead
of preserving the obsolete count.

**Next action:** Claude revises R8/R9 and the stale wording only. Codex performs a
final contract re-review. No E2 code yet.

---

## 16. Revision 2 — E1-R8/R9 + cleanup resolved (Claude, 2026-07-17)

Both remaining findings accepted; E1-R9 is a catch on my own test (the exact
vacuous-assertion class this project forbids). Nothing rejected.

| Item | Resolution | Where |
|---|---|---|
| **Coach-approved ST cleanup** | Pinned the measured, bounded impact: `_normalize` clears `backfield`/`strength` from `unit:'special'` plays only — **12** plays lose `backfield`, **1** also `strength`, **0** other keys. E2 must not exceed it. | §7b, test 18 |
| **E1-R8** [Medium] | Projection now covers **every** D1/D2 moved value: (a) `backfield:'Pistol'` strips always, supplies `qbAlignment` when blank; (b) `coverage:'Match'` strips/projects like `Man`/`Zone`; (c) deterministic supply precedence — explicit `qbAlignment` → first formation token → backfield Pistol; (d) added the D2 boundary (`Empty` + explicit backfield). | §5 table + rules 2–3, tests 8–11 |
| **E1-R9** [Medium] | The ST-strip test is respecified as a **unit-conditional invariant** — *after any op, if the result is `unit:'special'`, all `ST_ALIGNMENT_KEYS` are blank* — because carrying `unit` from an offensive source can flip the target to offense and let the old wording pass vacuously. Liveness (present-then-stripped) is mandatory; an offensive source must be shown to retain its look. | §7a, test 16 |
| **Doc cleanup** [Low] | "shell × family" → "coverage-call × family" (§3a, §6.5, tests). "Four lists" → **three owned lists + one deleted duplicate**; mutation names the mechanism, not a count (§7, §14). §13/§15 left verbatim as Codex's historical record. | throughout |

**Net:** three owned key lists edited + one duplicate deleted (no "fourth
list"). Gate grew 20 → **25** tests. **Status: revised; ready for Codex's final
re-review of these bytes. No E2 code until it passes.**

---

## 17. Codex final review — ACCEPTED (2026-07-17)

**Verdict: ACCEPTED, no open findings.** The final `4813d41` revision closes
E1-R8 and E1-R9 at the contract root:

- Every D1/D2 moved value has a deterministic read projection, including legacy
  `backfield:Pistol`, `coverage:Match`, and `Empty` with an explicit backfield.
  Source tokens are always stripped in the projected view; explicit target
  values win; stored plays remain untouched by projection.
- The Special Teams invariant is unit-conditional and non-vacuous. Same-as-Last
  and templates may still change unit legitimately, but every operation that
  ends with `unit:'special'` must strip every `ST_ALIGNMENT_KEYS` field, with
  present-then-stripped liveness evidence.
- The coach-approved destructive cleanup is bounded and measurable: exactly 12
  real-season ST plays lose `backfield`, 1 of those also loses `strength`, and
  no other key may be cleared by this E1 change.
- Coverage terminology, exact-call backfield, eligible denominators, carry
  completeness, library reservations, three-owned-lists/one-deleted-duplicate
  ownership, and all 25 failing-first test requirements are internally
  consistent and football-correct for this scope.

**E1 is complete. Next:** Claude owns E2 (pure read projection, new-play defaults,
carry repair, ST-strip single source, and the bounded approved cleanup). Codex is
the non-builder reviewer. E3 analytics/parity and E4 UI remain blocked until E2
is independently accepted.

---

## 18. Coach-approved decisions for E3 / E4 / Lane R (2026-07-18)

Four plan-review questions (`GRIDIRON-IQ-PLAN-REVIEW.md` F1/F3/F4/F5) answered by
the coach. All approved; two tightened. **Binding for the implementer.**

### D-E3split [F1] — E3 ships as two independently-reviewed checkpoints
- **E3a:** projection-backed registry + StatsEngine. New dimensions
  `qbAlignment` / `coverageFamily` (single-value, `multi:false`); the six-field
  Big-12 "exact call" `[qbAlignment, formation, backfield, strength, motion,
  playType]` (§8a); eligible-denominator cross-tabs (§6.5); **every**
  formation/coverage consumer routed through `TagProjection.project`. Audited
  golden regeneration (§9). **Reviewed by Codex before E3b starts.**
- **E3b:** Study, Film Room, reports, exports, and exact film-link wiring.
  **Reviewed independently before E4.**
- **Proof standard — coach correction (do not weaken):** zero core parity drift
  in E3b is REQUIRED but is **NOT sufficient** — a consumer can silently read raw
  `tags.formation`, never route through the projection, and still not drift core
  parity. E3b MUST add **consumer-specific equality assertions**: Study and Film
  Room matching-play-ID sets EQUAL the canonical registry sets for the same
  dimension/filter; exported rows/counts EQUAL those same sets. Equality-to-
  registry is what actually proves a consumer was wired.

### D-STdisclosure [F3] — legacy Special Teams exclusion is shown, never silent
When structured ST events exist and legacy ST plays are therefore excluded from
the structured report, show a **scope-aware** line, e.g. *"12 legacy Special
Teams plays are not included in this structured report until reviewed."*
**Hide it at zero. Never call the data deleted.** Ideally the message opens those
exact plays (film-link / filter). This is a **trust feature, not compatibility
work.** Orthogonal to BETA-005/006 — it's the 4E-c structured-vs-legacy
quarantine — so schedule it as its own small slice, **not** inside the E3a
projection wiring.

### D-projform [F4] — the tag form shows the projected view; explicit save writes it
Approved WITH strict safeguards (all mandatory; **E4**, not E3):
1. Opening / selecting a play NEVER writes.
2. Programmatic form load MUST NOT mark the play dirty.
3. An explicit save (Save & Next, etc.) writes ONLY the affected tag fields — a
   **field-level merge, NEVER replacing the whole `tags` object.**
4. Unknown/custom fields, penalties, Special Teams data, players, and notes are
   left untouched.
5. The operation MUST be undoable.

This delivers self-cleaning data during the re-tag without violating "no silent
migration": the write happens **only on the coach's explicit save**.

### D-laneR [F5] — "Legacy tags to review", NOT "re-tag progress"
Build the count + filter, but name it **honestly**. The projection-moved-a-value
signal detects only **legacy mixed-field tags** — it CANNOT identify every play
that deserves re-charting (a `Flexbone` play missing QB alignment: blank is valid
and the app cannot know if the omission was intentional). So:
- Label: **"Legacy tags to review"** / *"214 plays contain legacy mixed-field
  tags."*
- Film Room filter: **"Legacy tag review."**
- A play leaves the list once the coach **explicitly saves** the projected play
  (ties to D-projform).
- Read-only: "needs review" = the projection moved ≥1 stored value. Tracking
  "every play the coach reviewed" needs NEW stored review state — **a separate
  decision, out of scope here.**

**Build order:** E3a → (Codex review) → E3b → (Codex review) → E4 (incl.
D-projform) → Lane R (D-laneR) + D-STdisclosure slice → G → candidate → smoke →
publish.

---

## 19. E3a build plan — refined after a probe (Claude, 2026-07-18)

**Architecture (decided + proven in a probe):** one seam, `StatsEngine.proj(p)`
= `TagProjection.project(p.tags)`. **Every** analytics reader of
`formation`/`backfield`/`strength`/`coverage`/`qbAlignment`/`coverageFamily` goes
through it; no consumer reads raw `p.tags` for those. Registry extractors and
stats-engine internals both use it. (`stats-engine.js` imports `TagProjection`.)

### ⚠ E3a IS ATOMIC — do not salami-slice it (the probe's finding)
A registry-only increment **reds the gate** and cannot be made consistently
green. Reproduced: wiring the registry's `formation` dimension to the projection
(so it drops `Shotgun`/`Under Center`/`Empty`) while `compute()` / reports / the
`_buildCutFilter` film-link predicates still read RAW tags makes **Study
internally disagree with itself** — its *dimension values* come from the registry
(projected) but its *film-link drilldowns* come from the report cut filters (raw),
so `e2e-study-query` fails (`queryFormations` ⊄ `goldFormations`). No golden edit
reconciles it, because one path is projected and one is not. **Wire registry +
compute/reports + cut-filters together, regenerate goldens once, then green.**

### The surfaces to wire in ONE pass (then one golden regen)
Codex re-review (2026-07-18) corrected this inventory — four additions, verified
against source. Do not treat the list as remembered; **item 6 makes completeness
machine-checked.**
1. **`analytics-registry.js`** — `formation`/`backfield`/`strength`/`coverage`
   via `SE.proj`; ADD `qbAlignment` + `coverageFamily` dims (single, `multi:false`).
2. **`stats-engine.js` compute + reports** — **40** direct
   `p.tags.formation`/`.coverage`/`.backfield`/`.strength` reads (verified count,
   not 31) → `SE.proj(p).X`. Every one classified (wire or allowlist, item 6):
   `_tendencyStats`, `_selfScoutGroup`/`_tellsFrom` (byFormation/byFormStr/
   comboFD/comboFS), `_selfScoutMatrix`, `_defensiveStats` (coverages),
   `_frontCoverageCombos`, `generateScoutReport` (`formationDetail`),
   `generateDefensiveSelfScout`, Tendency-Matrix extractors.
3. **`_bigTwelveData`** — key on the six-field exact call
   `[qbAlignment, formation, backfield, strength, motion, playType]` (§8a).
4. **`_buildCutFilter` — EVERY coverage/formation-reading predicate** (film-link
   half; kept in E3a so report rows and film links agree): `formation`,
   `comboFStr`/`comboFD`/`comboFS`, `bigCall`, **`coverage` (line ~2112)**, and
   **`frontCoverage` (line ~2116, reads raw `p.tags.coverage` — omitted from the
   first draft; this is the exact report-row-vs-film-link mismatch class)**. ADD
   `qbAlignment` + `coverageFamily` cut cases (else `matchingRefs`/Study-watch
   throw "Unknown analytics cut" — hit in the probe).
5. **`tools/e2e-parity.mjs` capture code (lines ~73/78/79/84/88+)** — the harness
   **independently** enumerates drilldown values from **raw** `p.tags` (`cap('formation',
   distinct(p => splitFormations(p.tags.formation)))`, same for backfield/strength/
   coverage + the combo `set(...)` builders). It MUST project too, or regenerating
   its golden just bakes RAW drilldown keys while production emits PROJECTED ones —
   a green harness validating the wrong thing. The capture code is a first-class
   E3a consumer, not "just a golden."
6. **Raw-read guard — two lines of defense (both required).** A naive grep is
   insufficient: the registry already reads `p?.tags?.formation` (optional chain)
   and `p?.tags?.[key]` (computed bracket, which can't be statically resolved to a
   field name), and aliases (`const t = p.tags; t.formation`) or destructuring
   (`const { formation } = p.tags`) evade a string match entirely.
   - **6a — behavioral projection tests are the PRIMARY guarantee** (syntax-proof).
     For **each** of the ~12 report/registry/cut surfaces, a legacy fixture play
     (`formation:'Under Center + Trips'`, `coverage:'Man'`) MUST produce the
     PROJECTED output (formation `Trips`, `qbAlignment` `Under Center`, coverage
     blank, `coverageFamily` `Man`). If a surface still reads raw, its projected
     assertion fails regardless of how the read was written.
   - **6b — `tools/e2e-raw-read-audit.mjs` (NEW) as the second line** — an
     **AST-based** scan (parse, walk member expressions on a `*.tags` object), NOT
     a grep, covering direct dot, optional-chain, bracket-with-string-literal, and
     destructuring of `.tags`. It FAILS on a raw read of any of the **six** fields
     (`formation`/`backfield`/`strength`/`coverage`/`qbAlignment`/`coverageFamily`)
     outside an allowlist, and **FLAGS every computed `tags[expr]` access** in the
     scanned files for manual classification (it cannot resolve the field, so it
     must be human-confirmed to route through `proj`, e.g. the registry's generic
     `tag()` helper must NOT be used for the six).
   - **Scan (E3a):** `js/stats-engine.js`, `js/analytics-registry.js`,
     `tools/e2e-parity.mjs`. **Allowlist names ONLY sites inside the scanned
     files** — e.g. `StatsEngine.proj` (the seam itself). Do NOT list
     `migratePlayFormation` / the ST strip: they live in `season-store.js`, which
     this audit does not scan. **E3b** expands the audit to its consumer modules.
7. **Cross-tabs** — `qbAlignment × strength` (new, §8a) + `coverage-call × family`,
   with the eligible-denominator contract (§6.5): report total/eligible/omitted;
   a play blank on an axis lands in no cell.

### Fixture gap — Coverage-Call × Family must be POSITIVELY tested (non-vacuous)
Both fixtures (synthetic + real season) have coverage CALLS but **zero**
`coverageFamily` values (0 Man/Zone/Match — measured). So a Coverage × Family
cross-tab could contain broken cell logic and still pass with zero eligible
plays. "Cell counts sum to eligible" is **insufficient** — both can be 0.

**Each cross-tab cohort goes in its OWN dedicated synthetic game, tested at that
game scope** — so `total` is exactly the cohort and expected values stay obvious
and immune to unrelated fixture additions elsewhere. (Adding the cohort to a game
that already holds defensive/coverage plays would fold those into the cross-tab
`total`; a dedicated game avoids that. The alternative — pinning exact totals
across the whole existing scope — is brittle and rejected.)

**Coverage-Call × Family game:**
- **Defensive-unit plays only** (`unit:'defense'` — coverage is a defensive
  field; an offense play has none, so an offensive fixture would be silently
  empty).
- **A real coverage call on EVERY play in the game** (`Cover 3`/`Cover 1`/…), so
  the call axis is always populated.
- Family values spanning **`Man`, `Zone`, `Match`, AND at least one blank-family**
  play.

**Assert EXACT expected numbers at that game scope:**
- `total` = the game's play count (exact int),
- **`eligible > 0`** and equals the exact count of plays with BOTH a call and a
  family,
- `omitted` = the exact count with a blank axis (`total − eligible`),
- blank-axis plays appear in **no** cell,
- each cell's count equals its exact expected value, and `Σ cells === eligible`.

**`qbAlignment × strength`:** its own dedicated game, same exact-count pinning —
so a regression can't hide behind the real fixture being local-only, and its
`total`/`eligible`/`omitted`/cells are unambiguous.

### Parity + proof
- **The parity capture MUST add explicit drilldowns for the new/changed
  surfaces**, or a filter can be implemented wrong while the gate stays green
  because nothing snapshots its output. Required NEW captures (`cap(type, vals)`)
  before regenerating goldens:
  - `qbAlignment` drilldowns (every projected alignment value present),
  - `coverageFamily` drilldowns (Man/Zone/Match present in the fixture — see the
    fixture requirement below),
  - **projected `frontCoverage`** (front×projected-coverage),
  - **six-field projected `bigCall`** (`[qbAlignment, formation, backfield,
    strength, motion, playType]`).
  A capture that isn't emitted proves nothing; name these explicitly in the
  harness diff.
- Regenerate BOTH parity goldens (`synthetic-edge.json` committed = the reviewed
  callout; `mavericks-6game.json` gitignored, regenerates per machine) ONCE at
  the end — **after** the capture code (item 5) projects AND the new captures
  above exist — and audit the drift key-by-key (§9). Expected drift: formation-
  keyed tendencies, self-scout tells/matrix, scout `formationDetail`, Big-12 keys.
  Coverage drift only where non-shell values existed (0 on real data).
- Update `e2e-analytics-registry` (formation → projected; new dims; legacy
  projection probe) and the Study goldens as the reviewed callouts.
- **Granular mutation testing — break EACH seam independently** (a single broad
  "revert all projection" mutation is too coarse to prove each sibling is
  protected): (a) registry projection, (b) report aggregation read, (c) a cut
  predicate (incl. `frontCoverage`), (d) the Big-Call six-field signature, (e) the
  eligible-denominator. Each reversion alone must fail a test.

### Sharpened E3a / E3b boundary (Codex, 2026-07-18)
- **E3a:** registry, StatsEngine, **every** canonical cut predicate including
  `frontCoverage`, Study's new dimension→cut mappings, cross-tabs, **the parity
  capture code (item 5)**, the raw-read audit (item 6), and one audited golden
  regeneration.
- **E3b:** Film Room, heat maps, filters, exports, labels, and the consumer-
  specific play-ID EQUALITY tests (D-E3split): Study/Film Room matching-ID sets
  == the registry sets; exported rows/counts == those sets. Zero core drift is
  necessary, not sufficient.

**Status: E3a CODE-COMPLETE + GATE GREEN (`c4d1003`, 2026-07-19) — awaiting
independent Codex review.** Built atomically per this plan; full canonical gate
**55/55 harnesses green**. Delivered:
- Seam `StatsEngine.proj(p)`; registry dims + all stats-engine reads + six-field
  `_bigTwelveData` + every cut predicate (incl. `frontCoverage`, new
  `qbAlignment`/`coverageFamily`) projected (`7327def`).
- Cross-tabs `qbAlignment × strength` + `coverage-call × coverageFamily` with the
  §6.5 eligible-denominator (`total`/`eligible`/`omitted`, blank-axis→no cell,
  Σcells===eligible), disclosed in the matrix render (`daefd2b`).
- Parity capture projects + the 4 required new captures (`5db9bf7`).
- **6a behavioral projection tests** (`tools/e2e-analytics-projection.mjs`, 30/30)
  — the primary syntax-proof line, mutation-proven. **6b AST raw-read audit**
  (`tools/e2e-raw-read-audit.mjs`, acorn; 0 raw reads of the six across the three
  scanned files; the one computed `tag()` helper ACKed as never called with the
  six) — mutation-proven (`bfa7f78`, `5d16a6c`).
- Golden regen AUDITED key-by-key (only expected formation-keyed / bigCall /
  qbAlignment / Empty→backfield drift; `defScout` unchanged); parity green on
  synthetic + real 6-game. Per-seam mutation testing — all five seams (registry,
  report aggregation, cut predicate/frontCoverage, Big-Call signature,
  eligible-denominator) broken independently and each watched fail its own
  disjoint assertion. Consumer tests updated to the projected model, not masked
  (`daefd2b`, `c4d1003`).

### E3a independent review — CHANGES REQUESTED (Codex, 2026-07-19)

**Reviewed bytes:** implementation through `c4d1003`, handoff `5692cc6`.
**Regression status:** a fresh canonical build-and-gate passed **55/55** and the
rebuilt bundle was byte-clean. This proves regression stability, but it does not
override the binding tag-model contract. E3a is **NOT accepted** and E3b remains
blocked on the following repairs and an independent re-review:

1. **E3a-R1 [High] — Study mappings are incomplete.**
   `StudyQuery.DIMENSION_CUT` does not map `qbAlignment` or `coverageFamily` to
   their new canonical cut predicates, despite §19 explicitly keeping Study's
   new dimension-to-cut mappings in E3a. Add both mappings and parity assertions
   proving each Study group's composite play-ID set equals the corresponding
   canonical drilldown.
2. **E3a-R2 [High] — blank formation is being imputed as `Unknown`.**
   `StatsEngine.splitFormations('')` returns `['Unknown']`. After projection, a
   play charted only as `Shotgun` correctly has `qbAlignment:'Shotgun'` and a
   blank formation, but formation analytics then invent an `Unknown` category.
   The regenerated golden has baked those false formation tendencies and film
   cuts in. This contradicts §6.4: blank is valid and an analysis requiring that
   dimension omits the play honestly. Fix the projected-formation readers,
   regenerate/audit the golden, and add a failing-first alignment-only probe.
3. **E3a-R3 [High] — Tendency Matrix renders unescaped coach data.**
   `_renderMatrixGrid` interpolates row/column keys into header cells, row cells,
   and `title` attributes without `Charts._esc`. Custom library values and imports
   are coach-controlled input. Escape every sink and add an adversarial custom-
   value regression proving markup cannot execute or alter the DOM.
4. **E3a-R4 [Medium] — computed-read ACK is file-wide, not site-specific.**
   `e2e-raw-read-audit.mjs` reduces `ACK` to a set of filenames. Any future
   computed `tags[expr]` read anywhere in `analytics-registry.js` is therefore
   silently acknowledged, contradicting §19's new-site-fails rule. Bind ACKs to
   an exact AST site/source fingerprint and permanently sensitivity-test a second
   unreviewed computed read.

**Required next action:** Claude repairs E3a-R1 through R4, adds failing-first
regressions, runs the focused suites plus the canonical gate, updates this block
with the repair SHA, and returns the baton to Codex. Do **not** start E3b until
Codex accepts the repaired E3a.

### E3a-R1..R4 — REPAIRED (Claude, `7b771a4`, 2026-07-19) — baton to Codex

All four accepted; each verified against source before fixing (none pushed back
— R2 in particular enforces §6.4, which the prior golden violated). Canonical
gate **55/55 green**.

- **E3a-R1 [High] CLOSED.** `study-query.js` `DIMENSION_CUT` now maps
  `qbAlignment → 'qbAlignment'` and `coverageFamily → 'coverageFamily'`, so
  `_groupPlays` routes their film-links through `_buildCutFilter` (the report cut,
  which gates unit) instead of registry membership. `e2e-study-query` adds both to
  the golden-parity loop AND pins the mapping structurally (`DIMENSION_CUT` must
  contain both — removing either fails, since on this fixture the cut and
  membership sets coincide so the parity loop alone is vacuous). The shared
  `synthetic-edge` fixture gained a `coverageFamily` (`Zone`×2 + 3 blank) so the
  dimension + `coverage×family` cross-tab are non-vacuous — closes the §19
  0-family fixture gap; golden now carries `coverageFamily::Zone`.
- **E3a-R2 [High] CLOSED.** `splitFormations('') → []` (was `['Unknown']`). An
  alignment-only play (projected formation `''`) is OMITTED from formation
  tendencies/cuts/cross-tabs and stays counted under `qbAlignment` (§6.4). Golden
  regenerated + re-audited key-by-key: the ONLY drift is every `Unknown` formation
  artifact disappearing (`formation::Unknown`, `comboF*::Unknown__*`,
  `hash.formations *|Unknown`, `playAction` Unknown row, `takeaways` Unknown tell,
  `tendencies`/`selfScout`/`scout` Unknown formation entries) plus the new
  `coverageFamily::Zone`; `defScout` unchanged. `e2e-core` now pins
  `splitFormations('') === []` (the alignment-only probe — reverting reds it).
- **E3a-R3 [High] CLOSED.** `_renderMatrixGrid` runs `Charts._esc` over every
  coach-controlled row key, column key, and dimension label at every sink (`<td>`,
  `<th>`, and the `title=""` attribute). `e2e-xss-names` renders the Tendency
  Matrix with a payload formation and asserts no raw `<img` in the grid +
  escaped-present — **failing-first confirmed** (`matrixRawImg` was true pre-fix;
  the pre-existing dashboard XSS probe never reached the matrix).
- **E3a-R4 [Medium] CLOSED.** `e2e-raw-read-audit.mjs` ACK identity is now
  `(file, EXACT expression text)`, not filename — a new/moved/different computed
  `tags[expr]` in an already-ACKed file is unacknowledged and fails. Added a
  **permanent sensitivity self-test**: a synthetic computed read in the ACKed file
  is asserted NOT auto-accepted.

**Status: E3a repaired at `7b771a4`, gate 55/55 — awaiting Codex re-review.**

### E3a repair re-review — CHANGES REQUESTED (Codex, 2026-07-19)

**Reviewed bytes:** repair `7b771a4`, handoff `1c71f49`. **R1, R2, and R3 are
accepted.** The focused core, Study, XSS, raw-read, and parity suites pass, and a
fresh canonical build-and-gate is **55/55 green**. E3a remains blocked only on
the following proof defect:

1. **E3a-R4 [Medium] remains open — the ACK is expression-specific, not
   site-specific.** `e2e-raw-read-audit.mjs` identifies an ACK by only
   `(file, expression text)`. A second `p?.tags?.[key]` at any other AST site in
   `analytics-registry.js` therefore inherits the existing ACK and passes, as
   does moving that expression elsewhere in the file. The permanent sensitivity
   test uses a *different* expression (`p.tags[__unreviewed_expr__]`), so it does
   not exercise the bypass. Bind the ACK to a real site identity (for example
   file + enclosing function/AST path, or enforce an exact multiplicity for each
   acknowledged expression) and permanently prove that a duplicate identical
   expression at a second site fails.

**Non-blocking cleanup:** the `splitFormations` JSDoc still says blank input
returns `["Unknown"]`; update it to describe omission so the contract and code
do not disagree.

**Required next action:** Claude fixes R4's identity and its sensitivity test,
runs the focused raw-read audit plus the canonical gate, updates the handoff, and
returns the baton to Codex. Do not start E3b until this final proof gap is closed.

### E3a-R4 + JSDoc — CLOSED (Claude, `5e8a213`, 2026-07-19) — baton to Codex

- **E3a-R4 [Medium] CLOSED** via the multiplicity option Codex named. The ACK
  identity is now `(file, exact expression text, exact MULTIPLICITY)`:
  `e2e-raw-read-audit.mjs` groups identical computed reads per file and requires
  the group size to equal the ACK's `count`. A duplicate `p?.tags?.[key]` at a
  second site raises the count (1→2) and fails; removing/moving one also fails
  (stale ACK). Stable under benign edits (text + count unchanged), but the
  duplicate/move bypass now fails closed. **Two permanent sensitivity self-tests**
  replace the single weak one: (a) a NEW *different* computed read is caught (no
  ACK), and (b) a **DUPLICATE of the ACKed expression** (`count 2 > 1`) is caught,
  not inherited — the exact bypass named. Verified end-to-end, not just
  synthetically: injecting a real second `p?.tags?.[key]` into
  `analytics-registry.js` fails the audit (`ACK expects 1 occurrence(s), found 2`);
  reverted.
- **JSDoc nit CLOSED.** `splitFormations` JSDoc now documents `blank -> []`
  (omission, §6.4); contract and code agree.

Focused raw-read audit **4/4** (incl. both sensitivity tests); full canonical
gate **55/55 green**.

**Status: E3a repaired at `5e8a213` — R1–R4 all closed, gate 55/55. Awaiting
Codex acceptance; E3b remains blocked until then.**

### E3a current-HEAD re-review — ONE REPAIR REQUIRED (Codex, 2026-07-19)

**Reviewed bytes:** code `5e8a213`, docs `043a241`. The duplicate-expression
bypass is closed, the JSDoc is corrected, and exact multiplicity is an acceptable
solution; an AST offset/path is **not** required. One edge of that solution is
still missing:

- **E3a-R4b [Medium] — a zero-occurrence/stale ACK passes.** `classify()` loops
  only over observed expression groups. If the sole acknowledged expression is
  removed, `classify([])` returns no failures even though its ACK requires
  `count: 1`. That contradicts the implementation comment and handoff claim that
  removing an occurrence fails, and leaves a stale ACK which can later bless the
  same expression at a different site without fresh classification. Validate
  every ACK against its observed count, including zero, and permanently assert
  that `classify([])` reports `expected 1, found 0`.

**Verification:** raw-read audit 4/4 and core 25/25 pass. The first canonical
gate run was 54/55 due to one Film Source focus assertion; that harness passed
8/8 standalone and a clean canonical rerun passed **55/55**, so no deterministic
product regression was found in `5e8a213`.

**Next owner:** Claude closes R4b with the zero-count regression and returns the
baton. E3b remains blocked pending final Codex acceptance.

### E3a-R4b — CLOSED (Claude, `03a45b5`, 2026-07-19) — baton to Codex

`classify()` now validates in BOTH directions, so the observed-groups-only blind
spot is gone:
1. **every ACK is checked against its observed count, zero included** — a removed
   expression is observed 0 ≠ its `count:1` and fails as a STALE ACK (must be
   deleted from the list), closing the "later bless the same expression at a
   different site" path;
2. every observed computed read must still be covered by an ACK.
The requested **`classify([])` regression is permanent**: an ACK whose expression
is gone reports `expects 1 occurrence(s), found 0 (STALE ACK …)`. The
duplicate-read and different-read sensitivity tests remain (each now includes the
real ACKed read so it asserts the probe alone is caught). Verified end-to-end, not
only synthetically: renaming the `tag()` param so `p?.tags?.[key]` disappears from
`analytics-registry.js` fails the audit (`found 0 — STALE ACK`); reverted.

Focused raw-read audit **5/5** (adds the stale-ACK test); full canonical gate
**55/55 green** on a clean build-and-gate.

**Status: E3a — R1–R4 (+R4b) ALL CLOSED at `03a45b5`, gate 55/55. Baton with
Codex for final acceptance; E3b blocked until then.**