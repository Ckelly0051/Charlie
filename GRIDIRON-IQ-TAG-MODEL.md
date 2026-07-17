# GridIron IQ — Tag Model Contract (Lane E1)

> **Status: DRAFT — awaiting independent review (Codex).** Authored by Claude,
> 2026-07-17. This is the canonical contract for BETA-005 (QB alignment) and
> BETA-006 (coverage shell/family). **E2 (normalization), E3 (analytics), and
> E4 (charting UI) implement this document. No code changes until it is
> reviewed and approved** — the B1 precedent: contract first, implementation
> second.
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
| **Coverage shell** | `coverage` *(stored key unchanged)* | **single** | `Cover 0`–`Cover 6` + custom shells |
| **Coverage family** | `coverageFamily` **(NEW)** | **single, optional, blank by default** | `Man` \| `Zone` \| `Match` |

**The stored key stays `coverage`.** Its values are already shells (270/270);
renaming to `coverageShell` would churn ~12 consumers, CSV headers, saved Study
views, and parity goldens for a cosmetic gain. **The UI label becomes "Coverage
Shell"**; the docs say shell. `Man`/`Zone` are removed from its chip list.

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
> in its correct dimension and omitted from the old one. Nothing is written.**

| Stored (legacy) | Reads as |
|---|---|
| `formation: 'Under Center'` | `qbAlignment: 'Under Center'`, `formation: ''` |
| `formation: 'Shotgun + Trips'` | `qbAlignment: 'Shotgun'`, `formation: 'Trips'` |
| `formation: 'Empty'` | `backfield: 'Empty'` **only if `backfield` is blank**; `formation: ''` |
| `coverage: 'Man'` | `coverageFamily: 'Man'`, `coverage: ''` |

Rules:
1. **Read-time only.** No writes, no migration, no `_normalize` mutation of
   existing tags. `_normalize` only **defaults** the new keys (`qbAlignment: ''`,
   `coverageFamily: ''`) on plays that lack them, exactly as `backfield`/
   `strength` were added in v1.9.15.
2. **Never overwrite a deliberate value.** If a play already carries
   `qbAlignment`, the projection does not touch it. Same for `backfield` on the
   `Empty` case. (Mirrors `migratePlayFormation`'s "don't clobber a deliberate
   pick".)
3. **First wins, and it is unambiguous.** 0 plays carry >1 QB alignment, so no
   tiebreak is needed. If one ever appears (import), take the first and **do not
   guess** — the play reads with that alignment and the rest are dropped from
   formation, and this must be covered by a test.
4. **The projection is the single source of truth.** Every consumer reads
   through it (§8). No consumer may parse `formation` for alignment itself.

---

## 6. Invariants — the contract proper

**6.1 One question per dimension.** No value may appear in more than one
dimension's library. D1/D2 settle the only two violations.

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

**6.5 Independent aggregation + exact intersection.**
- Each dimension aggregates **alone**, with its own denominator.
- A **multi**-value dimension may place one play in several rows — documented
  and correct; percentages may exceed 100%.
- A **single**-value dimension places each play in **exactly one** row.
- A cross-tab of two single-value dimensions (**shell × family**,
  **qbAlignment × strength**) places each play in **exactly one cell**. The
  intersection count must equal the filtered play count — no double-counting.
- A cross-tab involving `formation` (multi) may repeat a play across rows, but
  **must not** repeat it along the single-value axis.

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

| # | List | Location | Keys today | Must add |
|---|---|---|---|---|
| 1 | `CARRY_SCHEME_KEYS` | `play-tagger.js:1250` | `formation, personnel, defFront, coverage` | `qbAlignment`, `coverageFamily` |
| 2 | `SCHEME_KEYS` | `play-tagger.js:650` | `unit, formation, personnel, motion, runPass, playType, defFront, coverage, blitz, hash` | `qbAlignment`, `coverageFamily` |
| 3 | `ST_ALIGNMENT_KEYS` | `season-store.js:244` | `formation, personnel, defFront, coverage, blitz` | `qbAlignment`, `coverageFamily` |
| 4 | **inline duplicate** | `play-tagger.js:1287` | *same five, copy-pasted* | `qbAlignment`, `coverageFamily` |

**Adding `qbAlignment` to list 1 or 2 but not 3 and 4 reproduces lesson #17
exactly, with the same value.** List 4 is a copy-paste of list 3 and will drift.

**Required by this contract:**
- **E2 must give the ST-strip list a single source of truth** — `season-store.js`
  owns `ST_ALIGNMENT_KEYS`; `play-tagger.js:1287` consumes it instead of its own
  inline copy. (Scoped, mechanical; not a refactor project.)
- **A failing-first test must prove** an ST play cannot retain `qbAlignment` or
  `coverageFamily` through: the Save-&-Next carry, Same-as-Last, a template, and
  `setUnit('special')` — and that `_normalize` strips it retroactively.
- The test must be **mutation-verified**: revert any one of the four list edits
  and it must fail.

**Discovered gap, flag only (not this lane's to fix):** `backfield` and
`strength` are in **neither** carry list (1 or 2), so they have never carried
forward since v1.9.15 — likely an oversight from that work. Adding `qbAlignment`
to the carry lists while `backfield` stays out is **inconsistent but matches
shipped behavior**. Do not fix it silently inside E1–E4; raise it as its own
decision with the coach.

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

### 8a. Composite keys must make an explicit decision

`_bigTwelveData` keys a "call" on `[formation, strength, motion, playType]`.
Once alignment leaves `formation`, **every Big-12 key silently changes**. A call
sheet without QB alignment is wrong football — *"Under Center Power Right Jet"*
is the call.

**Contract: `_bigTwelveData` must key on `[qbAlignment, formation, strength,
motion, playType]`.** Every other composite that consumed formation-as-alignment
(`comboFStr`, `comboFD`, `comboFS`, `bigCall` cut filters) must **explicitly
decide** whether `qbAlignment` participates, and the decision must be recorded
in the E3 handoff — never left emergent.

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

1. `qbAlignment` and `coverageFamily` normalize to `''` when absent; existing
   plays are **not** rewritten.
2. Projection: `formation:'Under Center'` → `qbAlignment:'Under Center'`,
   `formation:''`. Nothing written to storage (byte-compare the play object).
3. Projection: `formation:'Shotgun + Trips'` → alignment `Shotgun`, formation
   `Trips`.
4. Projection never overwrites a deliberate `qbAlignment` / `backfield`.
5. `coverage:'Man'` → `coverageFamily:'Man'`, `coverage:''`.
6. **`Cover 3` does NOT imply `Zone`** — family stays blank (§6.3).
7. Single-value dimensions are never split on `" + "` (registry `multi:false`
   honored end-to-end).
8. **Exact intersection:** shell × family cross-tab cell counts sum to the
   filtered play count — no double-count.
9. `formation` (multi) may repeat a play across rows but never along a
   single-value axis.
10. **Lesson #17 (§7):** an ST play cannot retain `qbAlignment`/`coverageFamily`
    via carry, Same-as-Last, template, or `setUnit('special')`; `_normalize`
    strips it retroactively. **Mutation: revert any one of the four list edits →
    fails.**
11. `Power-I` on a modern play (has `backfield`) is **never** migrated to
    `backfield:'Power'` — the existing guard still holds.
12. A truly legacy play (no `backfield` property) still migrates exactly as
    today — `migratePlayFormation` behavior byte-identical.
13. `Pistol` is absent from the backfield library; `Empty` absent from formation;
    neither is deleted from any historical play tag (D1/D2 change controls only).
14. A disabled/hidden library value still renders on a historical play and still
    aggregates (existing `TagLibrary` contract).
15. CSV round-trip carries `qbAlignment` + `coverageFamily`; a legacy CSV
     without those columns imports cleanly.
16. Blank dimensions: an analysis needing a blank dimension omits the play and
     reports the omission — it never imputes.
17. Parity: goldens regenerated, drift limited to the audited key set (§9),
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
- **The `backfield`/`strength` carry gap** (§7) — flag only.
- Renaming `coverage` → `coverageShell` (§3a) — rejected as churn.
- Motion, personnel, front, hash, playDir — untouched.

---

## 12. Open items for the reviewer

1. **§3a — keeping the stored key `coverage`** rather than renaming to
   `coverageShell`. Recommended for churn reasons; the reviewer should confirm
   the ambiguity is acceptable given the UI label and docs both say "shell."
2. **§8a — which composites `qbAlignment` joins.** `_bigTwelveData` is mandated.
   The four `combo*` cut filters need an explicit per-filter call; the reviewer
   should sanity-check them as *football*, not as code.
3. **§4 — `Power-I` redundancy.** Under the new model `Power-I` overlaps
   `Under Center` + `Power`. Contract says redundancy is allowed and the coach's
   terminology wins. Confirm that is right.
4. **§7 — the single-source-of-truth edit** for the ST-strip list crosses two
   modules. Confirm the scope is acceptable inside E2 rather than split out.

**Next action after approval:** E2 — pure normalization + the non-mutating
projection, failing-first, no analytics changes. Then E3 (analytics + parity),
then E4 (charting UI + libraries, behind the existing flag).
