# Reports · Offense — desktop recomposition

**Comp:** `offense.html` · **Date:** 2026-09-03 · **Revision:** 2 · **Status:**
direction approved; this revision is not itself approved and is not implemented.
No production file was modified.

## Revision 2 — what changed

1. **Yards/play removed from the Offense KPI band.** The persistent rail already
   shows 5.6 Yards per play; the band repeated it directly beneath. The band is
   now six equal columns: Success rate · Explosive · Negative · Run / pass ·
   Points / drive · 3rd down. Nothing replaced it.
2. **Zone navigation is now real secondary navigation** — a 34px hit area, a
   numbered chip, 11px condensed labels, a visible hover, `:focus-visible`, and
   a selected state using the established raised/underlined tab treatment
   (`inset 0 -3px` gold plus `--gi-raise-tab`). It no longer relies on 9.5px
   text to signal interactivity.
3. **Six zone headers retained**; Zone 1 gained the header it was missing, so the
   navigation and the headers now agree at six.
4. **Zone copy is literal.** Every conversational phrase was removed. Film
   linkage is stated once per zone as "Opens film".
5. **"Core tendencies · Big N" is computed** from the rendered rows at runtime,
   not hardcoded.
6. **Labels corrected:** "Play direction / ball direction" and "Field hash /
   starting position".
7. **Sparse copy** is now "Insufficient charted data"; no empty tables render.
8. **Empty state redesigned** — compact, top-aligned to the report grid, with a
   primary "Open Break Down" command and no reserved height.

Overview is the binding visual model. This comp adopts Overview's *winning*
presentation — the final block of `css/native-reports.css` (from ~line 1174),
which overrides the earlier band system and is what actually paints the route:
near-black stage, 1px rules used as gaps, a 3px left accent bar per module,
9.5px condensed tracked uppercase labels, 12.5px sans data, right-aligned
tabular numerals, square geometry, gold for offense.

---

## 1. Problems in the current Offense composition

Measured against the live app with a 64-snap game, both tabs populated:

| | Overview | Offense |
|---|---|---|
| Content height @1440 | 1,604px | **7,148px** |
| Top-level children of the board | 5 | **18** |
| Bands (`.gi-overview-band`) | 4 | **2** |
| Modules | 11 | 21 |

1. **No band structure.** 18 of the board's children are siblings in a flat
   vertical stack — mostly bare full-width modules. Overview's composition is 4
   bands of deliberately proportioned modules. Offense is a list, not a board.

2. **Two competing KPI treatments, stacked, with a duplicated metric.** The
   persistent rail (`gi-reports-rail`) renders Final score / Total plays / Plays
   charted / Plays per phase / Success rate / Turnovers. Immediately beneath it
   `OffenseTab` renders its own `Hero` — Success rate / Explosive / Plays for
   loss / Yds/play / Run rate. **Success rate appears twice**, in two different
   type treatments, ~40px apart, with a dead gap between them.

3. **The first viewport carries almost no analysis.** After two KPI strips and a
   module header, the first screen is one table. Overview's first viewport
   carries a KPI band plus three modules plus the start of a second band.

4. **Full-width modules holding half-width content.** `Personnel × Situation`
   right-aligns its Situation column, throwing a ~600px gap between the
   personnel group and its numbers. `Situational` pairs a six-row table with a
   `By Quarter` column that is usually near-empty. The Tendency Matrix renders
   large empty cells across a full-width module.

5. **Analytical graphics squeezed beside narrow tables.** Heat maps and the
   offensive visualizations inherit whatever width is left rather than being
   given a band of their own.

6. **Six identically-shaped breakdowns are scattered.** Backfield, Strength,
   Personnel, Direction, Motion and Hash all render the same five columns, but
   they are separated by unrelated sections, so they can never be compared.

7. **Module headers are weaker than Overview's.** Several sections render as
   `stats-section > h3` or bare `h4` rather than the `Module` header primitive,
   so the page has no consistent section rhythm.

---

## 2. Section-by-section mapping

Every capability in the current `OffenseTab` is present. Nothing was dropped.

| # | Current production section | Source | New location in the comp |
|---|---|---|---|
| 1 | Offensive KPI hero | `Hero` / `view.offenseHero` | **Zone 1** — the single KPI band (6 KPIs; Yards/play dropped as a rail duplicate) |
| 2 | Play Calls — call performance | `PlayCalls` | **Zone 2**, band 1, wide column |
| 3 | Play Calls — concept roll-up | `PlayCalls` | **Zone 2**, band 1, narrow column ("Concepts") |
| 4 | Play Calls — what we call by situation | `PlayCalls` | **Zone 2**, band 3 ("Calls by situation", three lenses) |
| 5 | Formation frequency and success | `tend.formations` | **Zone 2**, band 2, column 1 |
| 6 | Play type breakdown | `tend.playTypes` | **Zone 2**, band 2, column 2 |
| 7 | Play-action performance | `view.playAction` | **Zone 2**, band 2, column 3 (table + 4 KPI tiles) |
| 8 | "Big 12" core tendencies | `BigTwelve` | **Zone 2**, band 3, wide column ("Core tendencies · Big 8") |
| 9 | Personnel groupings | `view.personnelGroups` | **Zone 3**, band 1, column 1 |
| 10 | Backfield | `bf.backfield` | **Zone 3**, band 1, column 2 |
| 11 | Motion | `dm.motion` | **Zone 3**, band 1, column 3 |
| 12 | Strength | `bf.strength` | **Zone 3**, band 2, column 1 |
| 13 | Play direction | `dm.direction` | **Zone 3**, band 2, column 2 |
| 14 | Hash tendencies | `view.hashTendencies` | **Zone 3**, band 2, column 3 |
| 15 | Personnel × situation | `view.personnelSituation` | **Zone 4**, band 1, column 1 |
| 16 | Situational breakdown | `view.situationalBreakdown` | **Zone 4**, band 1, column 2 |
| 17 | Tendency matrix | `TendencyMatrixPanel` | **Zone 4**, band 2, wide column |
| 18 | Quarter data | `sit.byQuarter` | **Zone 4**, band 2, narrow column ("By quarter") |
| 19 | Field heat maps | `NativeHeatMaps` | **Zone 5**, band 1 — full width |
| 20 | Shape: yards distribution | `shape.histogram` | **Zone 5**, band 2, column 1 |
| 21 | Shape: yards vs distance | `shape.scatter` | **Zone 5**, band 2, column 2 |
| 22 | Shape: success by field position | `shape.zones` | **Zone 5**, band 3, column 1 |
| 23 | Shape: run/pass split by down | `shape.downs` | **Zone 5**, band 3, column 2 |
| 24 | Offensive visualizations | `NativeOffenseVisualizations` | **Zone 5** — the bar/plot bodies in bands 2–3 |
| 25 | Team profile | `TeamProfile` | **Zone 6**, band 1 — full width, radar beside its table |
| 26 | Expected Points Added | `AdvancedEpa` | **Zone 6**, band 2 — full width |

`AdvancedEpa` is represented at full production fidelity: three summary tiles,
the cumulative EPA curve, By play type / By formation, By personnel / By down,
and Top 5 / Worst 5 EPA plays.

---

## 3. Hierarchy and grouping decisions

**Six zones, each introduced by a thin gold-keyed rule** carrying a title, a
one-line purpose, and a right-aligned qualifier. This is the only structural
addition to Overview's vocabulary, and it exists because Offense has ~12 bands
where Overview has 4: without it the board is still a list, just a denser one.
The rule uses the system's own type, colour and geometry — no new aesthetic.

1. **Offensive identity** — Personnel, formation, alignment, and primary call.
   One KPI band, then the Identity module beside run/pass balance by down.
2. **Calls and tendencies** — Frequency and production. Play calls, Concepts,
   Formation, Play type, Play-action, Core tendencies, Calls by situation.
   These are the coaching answers, so they come first and share bands.
3. **Structure and deployment** — Personnel, alignment, motion, direction, and
   hash. Six identically-shaped breakdowns in two bands of three with identical
   column structure, directly comparable for the first time.
4. **Situational analysis** — Down, distance, quarter, and personnel. Personnel
   × situation beside Situational, then the Tendency matrix beside By quarter.
5. **Field and production** — Distribution and field position. Heat maps take a
   full-width band; the four shape graphics take equal halves. No analytical
   graphic sits beside an unrelated narrow table.
6. **Advanced metrics** — Team profile and EPA, each a full-width band, as in
   production.

**Band-height discipline.** Modules in a grid band stretch to the tallest
sibling, so a short module leaves dead space. Every band was measured; the worst
residual mismatch is 53px on a 317px module (Play calls vs Concepts) and 44px
(Big 8 vs Calls by situation), both comparable to Overview's own Rushing/Passing
mismatch. Zone 3's two bands were **reordered by row count** — Personnel (5) /
Backfield (5) / Motion (4), then **Play direction (3) / Strength (3) / Field
hash (3)** — which removed a 53px gap. (Revision 1 of this document described
the second row as Strength / Direction / Hash, which did not match the rendered
comp; the order above is what the captures show.)

**Result:** 3,877px at 1440 versus production's 7,148px, with every section
retained — a 46% reduction achieved by composition, not deletion.

---

## 4. Content retained but moved

- **Concept roll-up** moves out of a nested `gi-call-grid` inside Play Calls and
  becomes a peer module in the same band. Same data, same rows.
- **"What we call by situation"** moves from the bottom of the Play Calls module
  into its own module beside Big 8, where it reads as a tendency answer.
- **Quarter data** moves out of the `Situational` module's right-hand column
  (where it was frequently a near-empty panel) into its own module beside the
  Tendency matrix, with a small bar row per quarter.
- **Play-action** moves from a standalone full-width module into the Formation /
  Play type band, since it is a call-family answer of the same kind.
- **Shape panels** move from directly under the formation band to Zone 5, beside
  the other field/production graphics.
- **Team profile and EPA** move from the middle-tail of the stack to a dedicated
  final zone.

## 5. Proposed label changes

| Current | Proposed | Why |
|---|---|---|
| `Formation frequency and success rate` | `Formation` + meta `frequency & success` | Overview puts the qualifier in the header's meta slot, not the title |
| `Play type breakdown` | `Play type` + meta `frequency & success` | same |
| `The "Big N" — <team>'s Core Tendencies` | `Core tendencies · Big N` (N computed from the eligible rows) | the team name is already in the context bar and the page title; the count stays computed, never hardcoded |
| `Personnel Groupings` | `Personnel` + meta `grouping` | same rule as above |
| `Play Direction` | `Play direction` + meta `ball direction` | sentence case matches every Overview header |
| `Hash Tendencies` | `Field hash` + meta `starting position` | |
| `Personnel × Situation` | `Personnel × situation` | |
| `Expected Points (EPA)` | `Expected points added` + meta `EPA` | spelled out once, abbreviation in meta |
| `Heat Maps` | `Field heat map` + meta `success rate by field zone` | names what it shows |

All nine label changes are approved, with the two corrections above applied.
Zone copy is literal throughout; film linkage is stated once per zone as "Opens
film". Sparse sections read **"Insufficient charted data"** and render no empty
table. The empty state reads **"No offensive snaps charted" / "Chart offensive
plays to populate this report."** with a primary **Open Break Down** command.

## 6. Confirmations

- **No analytics were removed.** All 26 rows in §2 map to a present section.
- **No new analytics, formulas, filters or metrics were invented.** Every value
  shown derives from a field the current tab already computes. The Zone 1
  "Offensive identity" strip is composed entirely of existing computed values —
  top personnel grouping, top formation, top QB alignment, top play call — that
  today sit far down the page; it surfaces them, it does not calculate anything.
- **No production file was changed.** The only files added are this comp
  directory. `git status` shows nothing else modified.
- The comp links the real `design-system/plex.css` and `design-system/tokens.css`
  read-only, so it renders in the shipped faces and token values.

## 7. Verification performed

Captured and visually inspected at 1920×1080, 1440×900 (top/middle/bottom),
1280×720 (top/middle/bottom) and 1280×720 empty.

| Check | Result |
|---|---|
| Page-level horizontal scrollbar | **0** at 1920, 1440 and 1280 |
| Clipped table cells / KPI values | **0** at every viewport |
| Text below Overview's 9.5px floor | **0** |
| Bounded internal scrollers | 1 at 1280 — the Play calls table only |
| Page/console errors | 0 |
| KPI band rows | 1 at every width; no dead cell |
| Document height | 3,877px identical at 1280, 1440 and 1920 |
| KPI band | 6 columns, one row, no clipping at 1280/1440/1920 |
| Zone navigation | 6 buttons, 34px hit area, no clipping or strip overflow at any width |
| Zone headers | 6, matching the 6 navigation targets |

**1280×720 behaviour.** No column reduction was needed. The three-column
structure bands hold at 423px per module with zero clipping, so the composition
at 1280 is the same board as at 1440 rather than a degraded one. An earlier
draft dropped those bands to two columns with the third spanning full width;
that was reverted because it spread four values across 1,200px and reproduced
the long-eye-traverse problem this comp exists to fix. Only the `b-2`/`b-wide`
pairs and the EPA sub-grids collapse, at ≤1180px. The Play calls table is the
single element permitted a bounded internal scroll.

Interaction states in the comp: default; hover on every clickable row, tab,
zone-navigation button and control; visible keyboard focus (`:focus-visible`,
gold); selected tab; selected zone (raised surface, gold chip, gold underline);
sortable-column affordance; perspective segment (Our game / Opponent scout);
populated, sparse (`?state=sparse`) and empty (`?state=empty`).

**Empty state.** A compact band-width panel at the top of the report content —
title, one line of supporting copy, and the primary **Open Break Down** command
on the trailing edge. It occupies roughly 66px and reserves no further height;
the remainder of the route is ordinary stage background rather than a framed
blank container.

## 8. Decisions

### Settled in revision 2

| Decision | Outcome |
|---|---|
| Duplicated KPI | Yards/play removed from the Offense band; six equal columns, nothing invented to replace it |
| Zone navigation | Kept, rebuilt as real secondary navigation |
| Zone headers | Kept, six of them, literal copy |
| Zone/module copy | Literal throughout; "Opens film" states film linkage |
| "Core tendencies · Big N" | Kept; N computed from the rendered rows |
| Zone 3 grouping | Kept as rendered: Personnel / Backfield / Motion, then Play direction / Strength / Field hash |
| Label changes | All nine approved, with "ball direction" and "Field hash / starting position" applied |
| Sparse copy | "Insufficient charted data"; no empty tables |
| Empty state | Compact, grid-aligned, primary "Open Break Down" command |

### Still open

1. **The production KPI rail.** This comp models the **scorebug** (score,
   quarters, yards per play, game label) and the Offense KPI band. Production
   also renders a *separate* persistent rail between them — Final score · Total
   plays · Plays charted · Plays per phase · Success rate · Turnovers — and that
   rail duplicates **Success rate** with the Offense band, which is the
   duplication recorded in §1.2. Revision 2 removed the duplicate that existed
   *inside the comp* (Yards/play against the scorebug). Before implementation,
   decide one of:
   - keep the rail and drop Success rate from the Offense band (five columns), or
   - keep Success rate in the Offense band and let the rail carry game-scope
     counts only, or
   - suppress the rail on Offense, since the scorebug already carries game context.

   I have not chosen for you, because it changes what the coach sees on every
   game-scope tab, not just Offense.

2. **Zone headers as a shared pattern.** You noted these may become the pattern
   for other deep Reports tabs. If so, the zone rule and the numbered navigation
   should move into the shared report kit rather than being re-authored per tab.
   That is an implementation-scope question, not a design one.

3. **Scope control.** The comp shows a Game / Season perspective segment because
   the report supports it. Whether Offense should expose full-season scope on
   every band, or only where the underlying data method supports it, is unresolved.