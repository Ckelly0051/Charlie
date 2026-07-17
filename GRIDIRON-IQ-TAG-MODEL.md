# GridIron IQ — Tag Model Contract (Lane E1)

> **Status: REVISED to close E1-R1…R7 — awaiting Codex re-review (Claude,
> 2026-07-17).** Authored by Claude; reviewed by Codex (CHANGES REQUIRED, §13);
> revised by Claude (§14). Canonical contract for BETA-005 (QB alignment) and
> BETA-006 (coverage call/family). **E2 (normalization), E3 (analytics), and E4
> (charting UI) implement this document. No code until Codex re-reviews these
> revised bytes** — the B1 precedent: contract first, implementation second.
> Read §14 (resolution) and §13 (the review) together.
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
(`Man`/`Zone`/`Match`). *(Coach-facing text — the coach may rename either label
trivially; the football-correct default is "Coverage Call".)*

> **BETA-006 explicitly forbids making the mixed field multi-select.** Both
> dimensions stay single-value. That is what makes the exact shell × family
> intersection possible without double-counting (§6.5).

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

| Stored (legacy) | Reads as |
|---|---|
| `formation: 'Under Center'` | `qbAlignment: 'Under Center'`, `formation: ''` |
| `formation: 'Shotgun + Trips'` | `qbAlignment: 'Shotgun'`, `formation: 'Trips'` |
| `formation: 'Empty'` | `backfield: 'Empty'` **only if `backfield` is blank**; `formation: ''` |
| `coverage: 'Man'` | `coverageFamily: 'Man'`, `coverage: ''` |
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
   - *Strip:* every recognized alignment token (`Under Center`/`Shotgun`/
     `Pistol`) is removed from projected `formation`; every recognized family
     token (`Man`/`Zone`) is removed from projected `coverage` — **always**,
     regardless of whether the target already has a value.
   - *Supply:* the stripped token fills the target dimension **only if the target
     is currently blank**. If the coach already set `qbAlignment:'Pistol'`, a
     legacy `Shotgun` in formation is still stripped but does **not** overwrite
     Pistol. (Mirrors `migratePlayFormation`'s "don't clobber a deliberate pick"
     — but the strip is unconditional, the supply is conditional.)
3. **First supplies, all are stripped, and it is unambiguous.** 0 plays carry >1
   QB alignment today, so no tiebreak is needed. If one ever appears (import),
   the **first** token supplies the blank target, and **all** alignment tokens
   are stripped from formation — **do not guess** which was meant. Covered by a
   test.
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
- For two single-value axes (**shell × family**, **qbAlignment × strength**)
  each eligible play lands in exactly one cell, so `Σ cells === eligible`.
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
same value that caused that bug. And the alignment key lists are **hard-coded in
four places that share no source**:

| # | List | Location | Keys today | Must add (E1) |
|---|---|---|---|---|
| 1 | `CARRY_SCHEME_KEYS` | `play-tagger.js:1250` | `formation, personnel, defFront, coverage` | `qbAlignment`, `coverageFamily`, **`backfield`, `strength`** |
| 2 | `SCHEME_KEYS` | `play-tagger.js:650` | `unit, formation, personnel, motion, runPass, playType, defFront, coverage, blitz, hash` | `qbAlignment`, `coverageFamily`, **`backfield`, `strength`** |
| 3 | `ST_ALIGNMENT_KEYS` | `season-store.js:244` | `formation, personnel, defFront, coverage, blitz` | `qbAlignment`, `coverageFamily`, **`backfield`, `strength`** |
| 4 | **inline duplicate** | `play-tagger.js:1287` | *same five, copy-pasted* | *(deleted — see below)* |

**Adding an alignment key to a CARRY list (1/2) but not the STRIP lists (3/4)
reproduces lesson #17 exactly, with the same value.** List 4 is a copy-paste of
list 3 and will drift. **Every key that carries forward must also be strippable
from an ST play** — carry and strip lists move together or the leak returns.

**Required by this contract:**
- **E2 gives the ST-strip list a single source of truth** — `season-store.js`
  owns `ST_ALIGNMENT_KEYS`; `play-tagger.js:1287`'s inline copy is **deleted**
  and consumes that source. (Scoped, mechanical; not a refactor project.)
  Approved by Codex as E2 scope.
- **A failing-first test must prove** an ST play cannot retain **any** of
  `qbAlignment`, `coverageFamily`, `backfield`, `strength` through: the
  Save-&-Next carry, Same-as-Last, a template, and `setUnit('special')` — and
  that `_normalize` strips them retroactively.
- The test must be **mutation-verified**: revert any single list edit and it
  must fail.

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
alignment; both belong in the carry. This is a bug fix on the same four lists
§7 already edits — not scope creep, and not silent (it is specified here and
tested). **Completeness requirement Codex's finding did not state but this
contract adds:** because they now carry, `backfield`/`strength` MUST also join
`ST_ALIGNMENT_KEYS` (lists 3/4), or they become a fresh lesson-#17 leak onto ST
plays. That is why the table above adds them to all four lists, not just 1/2.

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
8. **(E1-R2)** Consumers read `qbAlignment`/`coverageFamily` defensively: a play
   *object literal* lacking the property (not just `''`) aggregates as blank and
   does not throw. (Guards the legacy-play asymmetry §5.1 creates.)
9. Single-value dimensions are never split on `" + "` (registry `multi:false`
   honored end-to-end).
10. **(E1-R1) Eligible-denominator intersection:** a shell × family cross-tab
    where some plays are blank on one axis reports `total`, `eligible`,
    `omitted`; cell counts sum to **`eligible`**, not `total`; omitted > 0 is
    surfaced. A play blank on an axis appears in **no** cell.
11. `formation` (multi) may repeat a play across rows but never along a
    single-value axis; `eligible` still gates the cross-tab.
12. **(E1-R6) Lesson #17 (§7):** an ST play cannot retain **any** of
    `qbAlignment`, `coverageFamily`, `backfield`, `strength` via carry,
    Same-as-Last, template, or `setUnit('special')`; `_normalize` strips them
    retroactively. **Mutation: revert any single one of the four list edits →
    fails.**
13. **(E1-R6) Carry works for all four pre-snap look fields:** on Save-&-Next to
    an untagged offensive play, `qbAlignment`, `backfield`, and `strength` carry
    forward (with `formation` etc.); on an ST target they do not. Same-as-Last
    and templates carry the same set. Failing-first (these keys do not carry
    today).
14. `Power-I` on a modern play (has `backfield`) is **never** migrated to
    `backfield:'Power'` — the existing guard still holds.
15. A truly legacy play (no `backfield` property) still migrates exactly as
    today — `migratePlayFormation` behavior byte-identical.
16. **(E1-R7)** `Pistol`/`Shotgun`/`Under Center` are rejected from the
    `formation` and `backfield` libraries with a validation message; `Empty` is
    rejected from `formation`; an unrelated custom value is still accepted in any
    library. Neither reserved value is deleted from any historical play tag.
17. A disabled/hidden library value still renders on a historical play and still
    aggregates (existing `TagLibrary` contract).
18. CSV round-trip carries `qbAlignment` + `coverageFamily`; a legacy CSV
     without those columns imports cleanly.
19. Blank dimensions: an analysis needing a blank dimension omits the play and
     reports the omission — it never imputes.
20. Parity: goldens regenerated, drift limited to the audited key set (§9),
     mutation-verified.

---

## 11. Scope boundary

**In:** the four offensive dimensions, the coverage shell/family split, the
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
| **E1-R1** [High] | Cross-tabs use an **eligible denominator**; report `total`/`eligible`/`omitted`; blank-on-axis plays land in no cell. The old "sum to filtered count" wording deleted. | §6.5, tests 10–11 |
| **E1-R2** [High] | Projection is **genuinely read-only**: `_normalize` does NOT backfill the two new keys onto existing plays (unlike v1.9.15 `backfield`); only *new* plays are born with them. **Added hazard the fix creates:** consumers must read the keys defensively — legacy plays lack the property entirely. | §5 rule 1, tests 1–2, 8 |
| **E1-R3** [Medium] | Strip and supply separated: wrong-field tokens are **always** stripped from the old dimension; they **supply** the target only when it is blank. | §5 rules 2–3, test 5 |
| **E1-R4** [Medium] | UI label is **"Coverage Call"**, not "Coverage Shell" — Cover 0–6 are calls, a shell is the safety structure. Coach-overridable. | §3a |
| **E1-R5** [Medium] | Exact call keys on **`[qbAlignment, formation, backfield, strength, motion, playType]`** — backfield was wrongly dropped. Per-composite table; separate `qbAlignment × strength` cross-tab. | §8a |
| **E1-R6** [Medium] | `backfield`/`strength` carry gap **fixed in this lane, not deferred** — E1 itself makes it worse during the re-tag. **Added completeness requirement:** they must also join `ST_ALIGNMENT_KEYS` or they become a fresh lesson-#17 leak. | §7, §11, tests 12–13 |
| **E1-R7** [Low] | Narrow **reserved-value** rule: the 4 moved tokens are rejected from their old libraries; no global cross-library uniqueness. | §6.1, test 16 |

**Two hazards Codex's own fixes introduce, now pinned by the contract (my
additions, not in §13):**
1. **R2 → defensive-read asymmetry.** Legacy plays will have no
   `qbAlignment`/`coverageFamily` property while `backfield`/`strength` are
   always present. Every E3 consumer must read the new keys with `?? ''` and
   must not assume symmetry. Test 8 guards it.
2. **R6 → ST-strip completeness.** Adding `backfield`/`strength` to the carry
   lists forces adding them to `ST_ALIGNMENT_KEYS` (both the season-store list
   and the deleted inline copy), or they leak onto ST plays. The §7 table now
   adds all new keys to all four lists.

Test count grew 17 → 20. **Status: revised; ready for Codex re-review of these
bytes. No E2 code until re-review passes.**