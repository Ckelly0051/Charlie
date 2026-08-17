# GridIron IQ - Future Visual Recomposition Plan

**Status:** PAUSED until usage reset. Do not begin implementation yet.

## Why This Exists

The August 2026 Broadcast Density work improved functionality, information
accuracy, and some spacing, but it did not deliver the approved creative
redesign. The live Reports composition remained substantially the old app:
long full-width sections, repeated tables and metrics, spreadsheet-like
presentation, weak depth, and excessive scrolling. Gold/cyan styling changed
the accent treatment without changing enough of the page architecture.

This was a process failure as well as an implementation failure. The builder
optimized for preserving the existing DOM and passing technical gates. The
reviewer accepted source/test evidence without requiring an early rendered
comparison against the approved comp. Do not repeat that workflow.

The functional work from Broadcast Density remains valuable and should be
preserved: score reconciliation, turnover honesty, phase labels, escaping,
analytics/film parity, and the Break Down workflow improvements. This future
milestone changes visual composition, not metric definitions or stored data.

## Target Outcome

Recompose the real application around the accepted Broadcast Density direction
in `design-comps/visual-reset-2026-08/`, using the coach's real six-game season
for judgment. This is not a reskin.

- Feel like a premium football operations product, not a themed spreadsheet.
- Lead with answers and decisions, then supporting evidence.
- Put more useful information above the fold with less scrolling.
- Use compact paired modules where the content supports them.
- Bound table and chart widths instead of stretching everything to the viewport.
- Use depth, hierarchy, typography, and restrained semantic color deliberately.
- Remove duplicated metrics and repeated narrative.
- Keep every actionable result linked to its exact film cohort.
- Keep Break Down film-first and never cover or reduce usable film unnecessarily.

## Binding Process: Charlie Gate

1. Builder works locally and leaves the visual checkpoint uncommitted.
2. Complete **one screen at a time**, beginning with Reports Overview.
3. Capture current production, approved comp, and proposed live implementation
   at the target desktop viewport using real app data.
4. Provide first-fold and full-page captures for Reports. Break Down needs a
   first-fold capture showing the complete film/tagging work surface.
5. The coach gives one verdict: **PASS, REVISE, or REJECT**.
6. Only after PASS may the builder run focused review, commit, run the broader
   gate, or package an installer.
7. Neither Claude nor Codex may self-certify visual acceptance.

A screen automatically fails when its module order, page length, and information
composition remain substantially unchanged and the main difference is color,
borders, type, or spacing.

## Ownership

- **Codex:** creative direction, literal layout specification, rendered visual
  comparison, and independent code review.
- **Claude:** implementation against the accepted specification and focused
  proof of functional/analytics parity.
- **Coach:** Charlie Gate visual acceptance and football-value judgment.

Claude should not be asked to broadly "make it look like the comp." Before it
implements a screen, Codex specifies the exact retained, removed, paired,
collapsed, and reordered modules.

## Recommended Sequence

1. **Reports Overview:** establish the composition system, remove repetition,
   fix the phase rail, and produce a materially shorter full page.
2. **Reports Offense and Defense:** pair compatible charts, collapse empty or
   low-value sections, bound dense tables, and preserve film links.
3. **Reports Self-Scout:** performance first; predictability becomes a secondary
   diagnostic near the bottom rather than the page's organizing idea.
4. **Remaining Reports tabs:** apply the accepted system without forcing every
   content type into the same module shape.
5. **Break Down refinement:** preserve the accepted film-first workflow and
   finish only after Reports establishes the shared visual voice.

## First Checkpoint Requirements

- `Plays per Phase` renders as stable values such as `OFF 29`, `DEF 20`, `ST 18`.
- Success Rate, Yards/Play, Explosive, Negative, and down-performance answers
  are not repeated in several sections.
- Score reconciliation remains clear but does not dominate unrelated analysis.
- Rushing, passing, game-at-a-glance, key metrics, and game-plan content are
  recomposed rather than stacked as legacy full-width bands.
- The full page is materially shorter while keeping readable type and honest
  missing-data states.
- Semantic color appears on values, badges, and thin accents, not entire rows.

## Known Corrections From The Last Charlie Gate

- Self-Scout still overvalues predictability and repeats the same lean across
  Top Tells, Recommendations, tables, the map, and Film Room Insights.
- Offense remains too long; related charts should share rows and empty Heat Map
  or EPA sections should collapse.
- Defense wastes space beside uneven paired modules and shows too many
  "Not enough snaps" cells instead of collapsing insufficient samples.
- Full-row semantic fills read like system-status logs.
- Overview, Defense, and Self-Scout repeat KPI blocks and conclusions.

## Guardrails

- No analytics formula, denominator, film-reference, or persistence change may
  be bundled into this visual milestone.
- Do not delete a useful report merely to reduce page length; recompose it or
  move it behind a clear detail affordance.
- Do not run the full gate after every visual iteration. Use the Charlie Gate,
  then focused checks, then one full gate at the accepted milestone.
- Preserve the current dirty visual work until the coach decides whether any of
  it should be retained; do not reset or overwrite it during handoff.

## Resume Condition

Resume after the usage reset with Codex writing the literal Reports Overview
layout specification. Claude does not start another broad visual pass before
that specification and the first Charlie Gate capture plan exist.
