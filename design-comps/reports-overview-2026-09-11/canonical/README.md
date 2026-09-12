# Reports > Overview — canonical pixel evidence, 2026-09-11

## What this is

The four canonical Overview captures, one per registered release viewport:

- `1440x900-overview.png`
- `1280x720-overview.png`
- `768x1024-overview.png`
- `390x844-overview.png`

`tools/e2e-reports-overview.mjs` compares the live board against these rasters
on every run: the board's surface palette, its gold accent, and the band and row
rhythm its composition repeats.

## Why it supersedes the 2026-08 captures

The prior canonical set is
`design-comps/visual-reset-2026-08/part2-verification/charlie-gate-density4`.
It is **retained untouched** as approval history and remains the record of the
approved Overview COMPOSITION.

It was superseded for **colour and type only**:

1. The coach-approved global graphite palette (`--gi-2` through `--gi-8`,
   `--gi-11`), accepted in the installed `1.12.0-80` visual smoke on 2026-09-11,
   repaints every surface on this board. The 2026-08 rasters carry the retired
   blue-grey surfaces, so they can no longer be the colour reference.
2. The shared readable type floor in `docs/VISUAL-SYSTEM-RULES.md` moves the
   module title to the 12.5px Sans eyebrow role and the table cell to 12.5px.

Nothing else changed. Module inventory, module order, row and tile counts, band
structure and board geometry are the approved composition and are asserted
against these captures unchanged. The coach's palette approval does not
authorize a composition change and none was made.

## Provenance

Produced by the harness itself, from its own fixture and settle path:

```
GIQ_OVERVIEW_CAPTURE=design-comps/reports-overview-2026-09-11/canonical \
  node tools/e2e-reports-overview.mjs
```

Capturing from the harness is deliberate. A reference raster taken from any
other fixture, viewport or paint moment would compare two different boards, and
the palette and rhythm assertions would be measuring the difference between
fixtures rather than a regression.

## Status

`COMP_APPROVED` design evidence for colour, type and rhythm. Overview
production remains `REJECTED`; this supersession does not promote any surface,
close any defect, or qualify `1.12.0-80` as a release.
