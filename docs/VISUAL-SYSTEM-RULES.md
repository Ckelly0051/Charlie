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

- Neutral UI means neutral graphite. Panels, resting controls, hover/active
  states, and structural borders use `--gi-2` through `--gi-8`; they must not
  carry a blue cast.
- Ordinary secondary copy uses `--gi-11` (`#a7adb3`). Breakdown's operational
  secondary copy uses `--gi-bd-copy` (`#a6a6a6`). Both must read as gray.
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

## Global Navigation

- Home, Break Down, Study, Reports, and Plan are the primary desktop routes and
  must be among the largest operational copy on the screen.
- At the full desktop layout, route labels use 18px/700 IBM Plex Sans with 19px
  icons, stable targets at least 128px wide, and generous horizontal padding.
- Route buttons blend into the shell rather than appearing as ambiguous
  blue-gray filled pills. The active route uses primary copy and the gold
  underline. Hover, focus, disabled, and pressed states must remain distinct
  without shifting layout.
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

## Acceptance

The installed `1.12.0-80` smoke approved this shared visual rule set: larger
primary navigation, wider context selectors, readable typography, neutral
graphite chrome, and neutral secondary copy. That approval does not change any
surface manifest from `REJECTED`, close unrelated functional defects, or replace
the full release gate.
