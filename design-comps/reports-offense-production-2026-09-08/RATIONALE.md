# Reports > Offense — the static-composition build, 2026-09-08

> **Revision 2, after review.** Revision 1 capped but never padded, so module
> presence was fixed while every module was still content-sized and the same
> 1440 board measured 5102..5478px across six games. It also retained an
> unapproved 27th module and asserted ows <= cap, which certified a ceiling
> and called it a schema. All of that is repaired below; the board is now ONE
> height per viewport.

**Status: NOT APPROVED.** Built into production and gate-verified; no Charlie
Gate, no installed smoke. `design-approvals/reports/offense/manifest.json`
stays `designStatus: COMP_APPROVED` / `productionStatus: REJECTED`.

This is an **implementation decision record, not a comp.** The approved comp is
unchanged and remains canonical:

- Canonical artifact: `design-comps/reports-offense-2026-09-03` (10 files)
- Comp: `offense.html` · decision record: that directory's `RATIONALE.md`
- Approved 2026-09-03

Nothing in that directory was edited — its `RATIONALE.md` is inside the
hash-verified canonical artifact, so this separate record carries the
implementation decisions instead. `node tools/audit-design-approvals.mjs` →
9 surfaces, 481 canonical files, 0 violations.

---

## 1. The schema, read off the canonical artifact

Extracted from `offense.html` at 1440: **6 zones, 13 bands, 26 modules,
3877px**. Its own `?state=sparse` renders the **same 26 modules** with
`Insufficient charted data` in the empty ones, and `?state=empty` replaces the
board with a compact 900px panel. That is the static rule, proven by the comp
itself: data fills slots, it never adds rows or removes modules.

`OFFENSE_ROWS` and `OFFENSE_MODULES` in `js/native-report-tabs.jsx` are the one
named owner for every fixed count. `OFFENSE_EPA_ROWS` covers the six sub-tables
inside the single Expected points added module.

| Zone | Band | Modules (approved rows) |
|---|---|---|
| 1 Offensive identity | b-wide | Identity, Run / pass balance (4) |
| 2 Calls and tendencies | b-2 | Play calls (8), Concepts (10) |
| | b-3 | Formation (5), Play type (6), Play-action (3) |
| | b-2 | Core tendencies (8), Calls by situation (8) |
| 3 Structure and deployment | b-3 | Personnel (5), Backfield (5), Motion (4) |
| | b-3 | Play direction (3), Strength (3), Field hash (3) |
| 4 Situational analysis | b-2e | Personnel × situation (6), Situational (6) |
| | b-2 | Tendency matrix (5), By quarter (4) |
| 5 Field and production | b-1 | Field heat map |
| | b-2e | Yards per play, Yards vs distance to go |
| | b-2e | Success by field position, Run / pass by down |
| 6 Advanced metrics | b-1 | Team profile (6) |
| | b-1 | Expected points added (6/5/5/4/5/5) |

---

## 2. What was actually wrong: modules were CONDITIONAL

The six zones already existed from `dc93429`. The defect was that the board's
shape moved with the data — a sparse game rendered a **different board** from a
fully charted one, which is exactly what the static rule forbids.

Every one of these could add or remove an approved module:

- `{calls && …}` — **Play calls** and **Concepts** did not render at all when no
  snap carried a resolvable call. On the canonical season that is most games.
- `{calls ? calls.situations : …}` — **Calls by situation**.
- `BigTwelve`'s `if (!data) return null` — **Core tendencies**.
- `TendencyMatrixPanel`'s `if (plays.length < 3) return null` — **Tendency matrix**.
- `shapeParts` returning null per panel, plus `[a, b].filter(Boolean)` on both
  Zone 5 bands — a band could render one module or vanish.
- `TeamProfile`'s two null returns and `AdvancedEpa`'s one.
- `NativeOffenseVisualizations`' null return.

All of them now hold their slot.

**But presence is only half the rule.** Revision 1 stopped there: it capped and
never padded, so every module was still content-sized and the same 1440 board
measured **5102..5478px** across the six games. Module presence was fixed;
geometry was not. `fitRows` now returns EXACTLY the allocation — truncating a
long cohort and PADDING a short one with held rows that carry the dash in every
column — and `mapFit` formats the real rows before padding so a held slot never
reaches a `.toFixed`.

**A held row is not the same statement as `Insufficient charted data`, and both
cannot hold at once.** The comp's own sparse capture is 415px shorter than its
populated one, so its module-level absence line and stable geometry are in
direct conflict. The coach's rule is explicit — the board has stable geometry
for every game at a given viewport — so tabular modules hold their rows, and
the module-level line survives only where there is no row structure to hold.
`SparseModule` is no longer used by this tab for exactly that reason.

**Nothing was capped before.** `Core tendencies` rendered 11 rows on Week 1 and
would render 90 on an over-cap cohort; `Calls by situation` rendered 40;
`Tendency matrix` grew a row per distinct value; `Play-action` and the EPA
sub-tables were never limited at all, and `EpaGroupTable` disappeared outright
when empty. Every one now renders its exact allocation.

**`Calls by situation` has a fixed internal schema.** Capping its total rows
still left the number of lens headings and nested tables data-dependent, so
eight rows split across one lens or three produced different heights. It now
always renders the same three lenses with the same rows — 3 + 3 + 2.

**RECORDED MISMATCH:** the comp's third lens is `Hash`, and
`_playCallAnalysis` computes no hash dimension (its five are Down & Distance,
Formation, Personnel, Field Position, Direction vs Strength). Rather than invent
a lens the engine does not produce, the third slot takes `Direction vs
Strength`. **For the coach at the Gate.**

**The `Tendency matrix` reserves a panel footprint rather than enumerating
columns.** Its rows hold the approved five like every other table, but its
COLUMN dimension is chosen by the coach at runtime and cannot be enumerated, so
the panel reserves 412px. It was the last module whose height moved with the
film, and its stretched band partner `By quarter` followed it.

**The CSS left panels short on purpose, and that was wrong.** The band was
`align-items:start` with a comment explaining that stretching breaks the sticky
table header — true, and the same trap Overview, Players and Special Teams each
had to correct. The correction is the same: these tables never scroll on their
own, so they opt out of the route-wide sticky header, and the panel can then
fill safely. Rows are still never stretched; row pitch is constant and height
comes from the allocation.

### Honest limits

`Core tendencies · Big N` now prints N from the rows it **renders**. It printed
`to90` — the calls covering 90% of snaps — above a table showing eight, so
Week 5 read `Big 18` over 8 rows. RATIONALE §8 already required "N computed
from the rendered rows"; this makes it true.

### Composition corrections

- **Zone 2** pairs Play calls with Concepts in one `b-2` band, and Core
  tendencies with Calls by situation in another. Production had given four
  modules a full-width band each.
- **Zone 4** is the comp's two bands — Personnel × situation beside
  Situational, then Tendency matrix beside By quarter. Production had split
  these into two full-width bands and a pair in the wrong order.
- `gi-off-b2` (8fr/4fr) and `gi-off-b2e` (6fr/6fr) are new band classes on the
  documented 12-column rhythm, so every rule lines up with the six-column KPI
  band.
- **Labels** corrected to the approved set: `Core tendencies · Big N` (middot,
  not comma), `Tendency matrix`, `Field heat map` + `success rate by field
  zone`, `Expected points added` + `EPA`, `Team profile` + `this game vs season
  average`, `Play-action` + `vs straight dropback`, `Motion` + `pre-snap
  movement`, `Personnel × situation` + `grouping by down & distance`,
  `Situational` + `production by situation`, `By quarter` + `production over
  the game`, `Concepts` + `call family roll-up`, `Calls by situation` + `top
  call per lens`, and the EPA sub-tables `By play type` / `By formation` /
  `By personnel`.

---

## 3. RESOLVED — the `Visualizations` module is gone

Revision 1 retained it and recorded the conflict as unresolved. That was wrong:
under "the comp is the schema" an unapproved 27th module cannot stand as an
open question, and the module **restated two approved modules in a second
format** —

- its `Success by Field Zone` strip against Zone 5's `Success by field position`
- its `By Quarter` bars against Zone 4's `By quarter`
- its spray against the field-position view the `Field heat map` already owns

— which is precisely the duplication the composition rule forbids, while
materially lengthening the board.

**Production renders the comp's 26 modules.**

Two `e2e-native-reports` assertions pinned `.viz-svg` and `.viz-q-bar`, the
removed module's own selectors. They are **RETIRED, not weakened**: an
assertion whose subject the design deliberately removed cannot be repointed
without changing what it claims. The surviving owners are asserted in
`e2e-reports-offense` and `e2e-reports-offense-realdata` instead. What is
genuinely lost is a hover-title affordance on that particular rendering, not
any analytic — the underlying data is in the approved modules, which is what
comp RATIONALE §2 row 24 intended by mapping it into the shape panels.

---

## 4. Other carried questions

1. **Zone 2's `b-2` pairing leaves dead space when `Calls by situation` is
   sparse.** A previous pass split that band into two full-width bands for
   exactly this reason, measured at ~960px. Capping Core tendencies at 8 rows
   reduces it, but on the canonical season — which charts no play call on most
   games — the right column is often the absence line beside an eight-row
   table. The comp specifies the pairing; the coach sees the result.
2. **The production KPI rail** (comp RATIONALE §8, still open). The comp models
   the scorebug plus the Offense KPI band; production also renders a persistent
   rail that duplicates **Success rate**. Unchanged here — it affects every
   game-scope tab, not just Offense.
3. **Backfield renders shorter than Personnel** in the Zone 3 band, because the
   data holds fewer distinct backfield values. Carried from CLAUDE.md's open
   items; may be the honest floor.

---

## 5. Verification

Canonical real season, read-only: `2025-st-joseph-mavericks-jv`
("2025 St. Joseph Mavericks - JV"), **6 games, 449 charted plays**, SHA-256
asserted unchanged after the run. All six games inspected at **1440 and 1280**.

**ONE BOARD HEIGHT PER VIEWPORT — 5617px at 1440 and 5574px at 1280, identical
on all six games**, and 26 of 26 modules are one height. Revision 1 measured
5102..5478px at 1440 and asserted nothing about it.

Zero page-level horizontal overflow, zero clipped cells, zero page or console
errors, on every game at both widths.

`e2e-reports-offense` **58**, `e2e-reports-offense-realdata` **15** (new),
`e2e-native-reports` **106** (two `.viz-*` assertions retired, §3),
`e2e-reports-overview` **106**,
`e2e-reports-overview-realdata` **35**, `e2e-parity` **2/2**,
`e2e-realdata` **10/10**, `e2e-reports-season` **98**,
`e2e-reports-self-scout` **90**, `e2e-reports-matchup` **72**,
`e2e-reports-players` **169**, `e2e-reports-special-teams` **50**,
`e2e-raw-read-audit` **11**, `e2e-css-ownership` **6**,
`e2e-design-system` **17**, `e2e-p0-exit` **19**.

**Mutation-checked**, each failing for its own defect before restoring:

- restoring `{calls.calls && …}` reds three module-inventory assertions naming
  the missing `Concepts`;
- removing the `Core tendencies` cap reds the allocation assertion;
- **reverting `fitRows` to cap-only — the revision 1 defect — reds the exact
  allocation assertion on eight modules AND both one-height assertions, with
  the six divergent board heights printed.** That is the check revision 1
  lacked entirely.

One fixture correction worth recording: the first "sparse" fixture used snaps
carrying no play type, which produces **no offensive snaps at all** — the empty
state, not a sparse board. It now uses countable snaps stripped of every
optional tag.

---

## 6. Carried into the Charlie Gate

1. The `Visualizations` module (§3) — the one decision this build could not make.
2. Zone 2's paired band and its dead space on sparse call charting (§4.1).
3. The persistent KPI rail's duplicated Success rate (§4.2).
4. Backfield's shorter column beside Personnel (§4.3).
