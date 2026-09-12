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

## What these captures actually contain

They were regenerated three times on 2026-09-11, and they carry **all three**
changes. Each is a colour, type or shared-chrome correction; none of them is a
change to the Overview composition.

1. **Shared readable type floor.** The module title moved from 9.5px Condensed
   uppercase to the 12.5px Sans eyebrow role and the table cell from 12px to
   12.5px, because `docs/VISUAL-SYSTEM-RULES.md` names module titles and table
   cells as categories that may not be exempted from the floor. The KPI headline
   pair — 28px Condensed value over its 9.5px Condensed label — is retained as
   the approved broadcast display treatment and is this board's one named
   exception.
2. **Shared Reports chrome alignment.** The linescore band used to wrap into two
   rows at 1280, dropping its identity strip onto a full-width row of its own;
   the score's name track absorbed slack into a ~300px void; and the right edge
   stepped six times down the column. The band is one row now and every band
   carrying Reports content shares the route frame's 32px inset. This moves the
   chrome that sits above the board in every one of these captures.
3. **Completed neutral palette.** The earlier neutralisation pass moved only
   `--gi-2` through `--gi-8` and `--gi-11`, leaving `--gi-1` at +9 blue,
   `--gi-film` at +6 and the entire broadcast surface family untouched — as high
   as +27 on `--gi-bd-bone` and `--gi-bd-draw`. All twenty-one near-neutral
   surface and ink steps are true grey now, each computed to hold its
   predecessor's relative luminance so no contrast ratio moved. Semantic hues
   are unchanged.

A fourth repair in the same range — the global `.cut-row` play marker moving out
of the text flow into the cell's own inset — shifts the first column of any
clickable row left by ~13px, so it is present here too.

## Why this supersedes the 2026-08 captures

The prior canonical set is
`design-comps/visual-reset-2026-08/part2-verification/charlie-gate-density4`.
It is **retained untouched** as approval history and remains the record of the
approved Overview COMPOSITION. It is named in the manifest as
`supersededArtifact` with its own hash.

**What did NOT change, and is still asserted against these captures:** the
thirteen approved modules and their order, every row and tile count, the KPI
band, the band rhythm the capture repeats, the coach-directed 29px row pitch and
77px tile row, the approved absence treatments, and containment at 1440, 1280,
768 and 390. The coach's palette and typography approvals do not authorize a
composition change and none was made.

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

**Regenerate only after the geometry is repaired, never to make a check pass.**
Each regeneration above followed a fix and is named in the manifest's
`approvalNote`; if you regenerate these, say in that note what changed and why.

## Status

`COMP_APPROVED` design evidence for colour, type and rhythm. Overview
production remains `REJECTED`; this supersession does not promote any surface,
close any defect, or qualify `1.12.0-80` as a release — no installed build
contains any of the changes above.
