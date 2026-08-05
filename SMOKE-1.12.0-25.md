# Smoke record — `1.12.0-25`

Local unsigned build. **Not a tag, not a published release.** Supersedes
`1.12.0-24`.

**Source:** `claude/football-film-analyzer-GRiCW`
**Gate:** 81 harnesses | 81 green | 0 skipped | 0 failed
Parity 2/2 · real data 13/13 · design system 16/16 · raw-read audit 11/11
Native reports 49 → 58 · native tagging 38 → 39 · season tab 157/157

| Artifact | SHA-256 |
|---|---|
| `bundle/nsis/GridIron IQ_1.12.0-25_x64-setup.exe` | `C92CBB236584888260C8A2B6C2E83C75FE69D12861BCF98D25975EB53D78CAF1` |
| `bundle/msi/GridIron IQ_1.12.0-25_x64_en-US.msi` | `9BB07E15597D886F68E9CA99381ADBD26470A363B772E808C6E0D6D8D2E77250` |

---

## What changed — every finding from the second smoke

**G14 — Negative Plays.** The "Risk" lens named four things that had already
happened, and sacks were counted twice inside it. Renamed, restructured to the
coach's spec: headline of distinct plays with the one percentage, raw counts
below, turnovers alone first, everything double-countable bracketed under Plays
for Loss. Swept all four consumers that shared the old name.

**G13 — the Big 13.** Cells instead of prose, in charting order (Formation
first, matching the tag form), sortable on every column, and an untagged
dimension renders blank instead of collapsing to a bare "Shotgun" that reads as
a complete call. Every call is listed — the old `.slice(0, 15)` is gone.

**G2 — down and distance.** Reads by down, then by distance bucket (1–3 / 4–6 /
7–9 / 10+), then every situation in full. The four-bucket grouping is its own
reporting dimension; the parity-locked three-way `_distBucket` is untouched.

**G3 — the shape visuals reach the opponent Offense tab.** They only ever
rendered on the self-scout tab, which is the whole explanation for two tabs
called "Offense" looking like different builds. Opponent rows deliberately carry
no film links, because those cut types resolve against our own charting
perspective.

**F12c — the team profile radar, unblocked by measurement.** Axes scale to the
coach's own achieved best per spoke. Measured on the real season: best game
70.4% success, worst 20.0%. On a 0–100 axis all six games bunch in the bottom
two thirds; scaled to his own best they spread across the axis. Renders only
with two or more charted games.

**G5 — definitions.** Ten terms, counted against source, delivered as tooltips
rather than a destination. Written from the constants the engine computes with.
"Low sample" names the gate for its own surface, because it is genuinely 4 for
tells, 5 for formation tendencies and 2 for the coverage list.

**G4** — a zero-yard gain no longer paints in the turnover colour.
**G12 / G12b** — "Grad" and "Mo" fixed; both width constraints now pinned
against each other so neither can be fixed by breaking the other.
**G1, G6, G7, G8, G9, G10, G11** — the layout family: one rule per boundary,
containers that fill the width they claim, rotated heat-map labels given the
height the rotation needs, the Predictability Map summary given its own row, the
Situational/By Quarter pair aligned, the yardage spray sized down, and a break
between Backfield and Strength.

---

## Smoke scope — read this before reporting a clean pass

**Roughly half the product was never reviewed in the previous round.** Every
finding G1–G14 came from Reports Offense (both perspectives) and the tag form.
**Untouched by that smoke and unchanged by this build:** Reports → Defense,
Special Teams, Players, Season, Matchup, plus Study and Plan entirely.

A clean run on this installer means the fourteen findings are fixed. It does not
mean those surfaces have been looked at.

**Design is still not ready for review.** Owed before that ask: the remaining
Reports tabs recomposed rather than restyled, visuals on the screens that need
shape, and `--gi-lower-third` actually used in the product. The FPO comps
(`design-system/routes/fpo-*.html`) show the intended target.

---

## Not changed

No schema, migration, season byte, film cohort, composite ref, film file,
storage path, package, tag or published release. Parity goldens were regenerated
twice, each time audited first: **insertions only, zero deletions** — 72 lines
for `negativePlays`, 192 for `byDown`/`byDistance`. No existing analytics value
moved.
