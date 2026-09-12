# GridIron IQ Visual System Rules

> **Status:** COACH-APPROVED SHARED VISUAL CONTRACT. Updated 2026-09-11.
>
> Approved in the installed `1.12.0-80` visual smoke. These rules govern shared
> chrome and ordinary operational UI. A surface's approved comp still governs
> its module composition, order, row counts, and screen-specific geometry.

## Source Of Truth

- `design-system/tokens.css` owns shared color, type, spacing, radius, shadow,
  and control tokens.
- `css/workspace-shell.css` owns global route navigation and the
  Program/Season/Game context controls.
- Route styles may compose these tokens but may not recreate a competing
  palette, type scale, or navigation treatment.
- A global token change requires installed visual inspection of representative
  shared chrome, Breakdown, and Reports. A green Chromium harness alone is not
  visual approval.

## Color

- Neutral UI means neutral grey. Every near-neutral surface and ink step is
  true grey — `--gi-film` and `--gi-1` through `--gi-8`, `--gi-11`, `--gi-12`,
  `--gi-on-solid`, and the whole broadcast family (`--gi-bd-stage`,
  `--gi-bd-panel`, `--gi-bd-control`, `--gi-bd-control-active`, `--gi-bd-line`,
  `--gi-bd-bone`, `--gi-bd-draw`, `--gi-bd-muted`, `--gi-bd-strong`). None of
  them carries a blue cast.
- **Neutralise the whole ladder or none of it.** The first pass moved `--gi-2`
  through `--gi-8` and `--gi-11` and left the app background, the film surface
  and every broadcast surface on the old cool values — `--gi-bd-line` at +22
  blue, `--gi-bd-bone` and `--gi-bd-draw` at +27 — which is why the app still
  read blue after a pass whose entire purpose was to fix that. The Reports
  boards paint with the broadcast family, not with `--gi-2`.
- **A hue correction holds luminance.** Each neutral value is computed to
  preserve its predecessor's relative luminance, so no contrast ratio moves:
  panel-on-background, text-on-panel, border-on-surface and every disabled state
  measure exactly what they measured before. Only the hue changes.
- Ordinary secondary copy uses `--gi-11`. Breakdown's operational secondary copy
  uses `--gi-bd-copy`. Both read as neutral gray.
- **This file names tokens; `design-system/tokens.css` owns their values.** It
  quoted `--gi-11` as `#a7adb3` after production had moved to `#acacac`, which
  defeats the point of a single source of truth. Do not restate a hex here — if
  a value matters to a rule, point at the token.
- Blue, cyan, gold, green, red, and orange are semantic signals, not neutral
  decoration. Preserve their named roles for selection, unit identity,
  achievement, health, destructive outcomes, and warning states.
- Do not fix a shared color defect with route-local overrides. Correct the
  owning token once and verify every consumer.

## Typography

- IBM Plex Sans is the operational interface family. IBM Plex Sans Condensed is
  reserved for page identity and prominent football numbers. IBM Plex Mono is
  reserved for genuinely tabular or technical data, not navigation or ordinary
  labels.
- Density comes from composition, spacing, progressive disclosure, and fixed
  dashboard schemas, never from shrinking coach-facing text.
- Shared floors are 12.5px for labels, 13px for controls, and 13.5px for body
  copy. These are floors, not targets when space allows larger type.
- Use zero letter spacing for ordinary interface copy. Do not use condensed or
  monospaced faces to manufacture density.
- Text hierarchy must be visible through size, weight, and placement. Small
  labels may support a control but cannot become the dominant navigation.

### The floor is enforceable, and these are the only exceptions

The floors above govern coach-facing copy. They may **never** be waived for
ordinary buttons, route or context values, module titles, table headers, table
cells, formation-matrix headers, KPI evidence lines, section navigation, or any
coach-facing label — and density is not a reason. When type and a fixed
composition genuinely conflict, recompose the container, spend padding, or open
a defect; do not shrink the text.

Four narrow exceptions, each named, each for a non-primary utility annotation:

1. **Technical timecodes.** The theater's monospaced elapsed/duration readout.
2. **Keyboard hints.** `kbd` shortcut chips.
3. **An approved comp's broadcast display pair.** Where a registered comp fixes
   a Condensed uppercase micro-label directly above its own large display
   number — Overview's KPI and tile labels, the Defense board's tile and
   type-summary labels — that pairing is the approved composition and changing
   it needs a new coach approval, not a silent raise. Every such class is listed
   in the enforcing assertion, not left implicit.
4. **One measured geometric conflict, recorded and open.** The eight
   five-column Offense Zone 2 / Zone 3 tables share a 379px band half at 1280
   and measure 387-418px of content at the floor. At that width only, their
   cells keep 12px body and 11.5px column labels. The approved board forbids
   both an internal scroller and a resize, so the fix is to recompose the
   three-up band; it is open in `docs/OPEN-DEFECTS.md`.

**Enforcement.** `e2e-reports-defense-realdata` walks every rendered text
element on the Defense board at both release widths and fails on anything below
12.5px that is not in its named exception list. `e2e-workspace-shell` pins the
shell's 18px route labels, 19px icons, ≥128px targets and the ≥12.5px context
values. `e2e-reports-overview` pins the Overview scale exactly and asserts its
module title, table cell and row label are at or above the floor. A floor
without a test is a preference, not a contract.

### Where the floor is enforced today — and where it is not

**The floor is not yet satisfied app-wide, and this rule does not claim it is.**
It is enforced on the shared chrome, Overview, Offense and Defense. Five Reports
boards have not been migrated, and each one's current minimum is pinned in its
own harness as a named `*_TYPE_FLOOR_DEFERRED` constant so it cannot drift
further while it waits:

The census below is measured on the **canonical season** by
`tools/e2e-reports-typefloor-realdata.mjs`, which is the only place this claim is
allowed to be measured: every board's own composition harness runs a synthetic
fixture, and `CLAUDE.md` is explicit that synthetic data cannot establish Reports
visual parity. Those harnesses mirror their board's number as a same-fixture
regression guard and say so.

| Board | Minimum | Below 12.5px @1440 | Below 12.5px @1280 | Status |
|---|---|---|---|---|
| Overview | 9.5px | 35 / 313 | 35 / 313 | Migrated, broadcast exception |
| Defense | 9.5px | 1 / 143 | 1 / 143 | Migrated, broadcast exception |
| Offense | 9.5px | 118 / 997 | **876 / 997** | Migrated at 1440; see below |
| Matchup | 10px | 58 / 156 | 58 / 156 | Deferred |
| Players | 11px | 46 / 237 | 46 / 237 | Deferred |
| Self-Scout | 11px | 20 / 77 | 20 / 77 | Deferred |
| Season | 11px | 30 / 138 | 30 / 138 | Deferred |
| Special Teams | 9.5px | 98 / 160 | 98 / 160 | Deferred |

SVG chart labels are excluded from the census: a `<text>` inside a scaled
`viewBox` reports its pre-scale font-size, so comparing it to an HTML pixel floor
measures the viewBox rather than the type.

**Offense at 1280 is not what this file previously claimed.** The narrow-width
exception was written for the eight five-column Zone 2 / Zone 3 tables, but it is
scoped to `.gi-offense-board .gi-overview-module th, td` — every table on the
board. That is why 876 of 997 nodes sit below the floor at 1280 against 118 at
1440. The rule should be band-scoped; until it is, this table states the real
number rather than the intended one. Open in `docs/OPEN-DEFECTS.md`.

The deferrals are **not a second standard**: each board's approved comp pins its
row math, so raising its labels means re-deriving that geometry, and doing five
boards blind is how the last regression happened. Each board's minimum is pinned
EXACTLY in the census, in both directions — a board that drifts down has
regressed, and a board that drifts up has been migrated and reds until this table
is updated in the same commit. A green harness must never again mean "this board
meets the floor" when it only means "this board has not got worse."

## Global Navigation

- Home, Break Down, Study, Reports, and Plan are the primary desktop routes and
  must be among the largest operational copy on the screen.
- At the full desktop layout, route labels use 18px/700 IBM Plex Sans with 19px
  icons, stable targets at least 128px wide, and generous horizontal padding.
- Route buttons blend into the shell rather than appearing as ambiguous
  blue-gray filled pills. The active route uses primary copy and the gold
  underline. Hover, focus, disabled, and pressed states must remain distinct
  without shifting layout.
- **Disabled is a colour, not an opacity.** On transparent chrome a 35%-opacity
  label composites straight onto the shell: measured 2.2:1 at 18px, and on first
  launch four of the five routes are disabled, so that is the state a new coach
  meets. Disabled route labels take `--gi-8`, which measures 3.7:1 on
  `--ws-nav`. Minimum 3:1, measured on the rendered control with its own
  opacity composited, and asserted in `e2e-workspace-shell`.
- The compact 901-1150px treatment may reduce dimensions to preserve all five
  routes, but it cannot truncate route names or introduce horizontal scrolling.
- Mobile keeps the same transparent, underline-led selection language in its
  dedicated bottom navigation.

## Context Selectors

- Program, Season, and Game selectors spend the available row width. Their
  grid tracks are flexible and weighted toward longer Season and Game values.
- At supported desktop release widths, current Program, Season, and Game values
  must render in full; do not clip them to preserve obsolete prototype widths.
  At narrower mobile widths, expose any shortened value in full accessibly and
  preserve the primary route navigation.
- **This applies to every route that shows the bar, not only Breakdown.** The
  first pass widened Breakdown's tracks alone, and `St. Joseph Mavericks`
  ellipsized in the Program selector on Home at both 1440 and 1280 while
  `.ws-ctx-value` still carried `text-overflow:ellipsis`. Three owners set that
  width — `css/workspace-shell.css` for the shared grid,
  `css/native-breakdown-route.css` and `css/native-home.css` for their own route
  overrides — and all three now carry a floor that holds the longest canonical
  program name. The ellipsis stays as a last-resort safeguard for an imported
  name longer than any panel can give it; it must not be the normal case.
- Enforced by `e2e-workspace-shell` on all five routes at 1440 and 1280, using
  the longest canonical Program, Season and Game strings.
- Never truncate team names in score or matchup presentation. Team identity and
  its aligned score must remain visually unambiguous.

## Dashboard Composition

- The approved comp is the dashboard schema. Module order, static row/tile
  counts, and board geometry do not resize around each game's data.
- Missing data uses the approved blank, `No Data`, or dash treatment. Excess
  data is ranked and capped under an honest label such as `Top 10 Plays`.
- Fixed composition is not permission for dead space. Use coach-useful modules,
  balanced bands, and explicit row math to fill the approved canvas.
- Remove explanatory prose that does not change the coach's next decision.
  Titles and labels name the data directly.

## Composition is inspected, not inferred from containment

Zero clipping, zero overflow and zero engaged scrollers say a band FITS. They say
nothing about whether it is composed. A band can sit on its own margin, spread
three items across a screen on no grid, and pass every containment check ever
written for it — which is what happened on 2026-09-11, when the coach looked at a
Defense screen that had just passed 58 assertions.

What the checks missed, and what they now assert:

- **One left edge and one right edge down the column.** Measured at 1280, the
  right edge stepped six times between the shell and the board — 1262, 1280,
  1266, 1248, 1247, 1235 — and the left edge four times: 0, 14, 32, 35. Every
  band carrying Reports content now shares the route frame's 32px inset. A
  full-bleed band's BACKGROUND spans the viewport; its CONTENT aligns, and the
  assertion measures content edges, not border boxes.
- **A shared band may not wrap into a second row.** The linescore asked for
  ~1380px in an 1154px bar, so its identity strip dropped to its own full-width
  row and spread Base front, Base coverage and Blitz rate across the whole
  screen. Sizing blocks to content and removing the min-width floor that forced
  the wrap keeps it one row.
- **A flexible track may not become a void.** The linescore's name track was
  `1fr` and absorbed every spare pixel, leaving ~300px of nothing between the
  team name and its own Q1.

Enforced in `e2e-reports-defense-realdata` across all six canonical games at both
release widths. Still true, and still the last word: an automated geometry check
is not visual approval. Look at the populated screen.

## A global token change is an app-wide change, including to approved evidence

A `:root` palette or type-token edit repaints and re-measures every surface,
including the rasters a comp was approved against. When it does:

1. Repair the geometry and typography regressions first. A scroller, a clipped
   label, an escaped row or a shrunken approved title is a defect, not a
   consequence to accept.
2. Then, and only then, regenerate the affected canonical evidence under a NEW
   tracked path. Never overwrite or delete the prior captures: name them in the
   manifest as `supersededArtifact` with their own hash, so the approval history
   stays auditable.
3. Say exactly what the new evidence supersedes and why. Palette and type only
   is a palette-and-type supersession; it does not license a composition change
   and does not promote any surface.
4. Re-point the harness only after the evidence exists, and never by weakening
   a geometry, rhythm, typography or composition check.

Worked example: `design-comps/reports-overview-2026-09-11/canonical`, recorded in
`design-approvals/reports/overview/manifest.json` and in the 2026-09-11 addendum
to `design-comps/reports-overview-2026-09-07/RATIONALE.md`.

## Acceptance

The installed `1.12.0-80` smoke approved this shared visual rule set: larger
primary navigation, wider context selectors, readable typography, neutral
graphite chrome, and neutral secondary copy. That approval does not change any
surface manifest from `REJECTED`, close unrelated functional defects, or replace
the full release gate.

**The first implementation of these rules did not deliver them.** An independent
non-builder review of `7afa94d..44adcc6` failed the pre-gate checkpoint: four
Reports harnesses were red, two of them against hash-protected approved
evidence. The repairs are recorded in `docs/OPEN-DEFECTS.md`. `1.12.0-80` remains
a historical installed visual-scope pass; this repair is un-packaged source work
made after that installer, so no installed build contains it.
