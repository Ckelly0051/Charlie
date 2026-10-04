# Smoke candidate 1.12.0-88 - Windows x64, unsigned

## Artifacts

- Source commit packaged: `3438fc9` (bump on top of `1b684da`)
- NSIS installer: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-88_x64-setup.exe`
- NSIS bytes: `4,010,543`
- NSIS SHA-256: `4719215B2BA94848379051A7A56067ED533348BA890BDD23D5DFCC4E51072443`
- MSI package: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-88_x64_en-US.msi`
- MSI bytes: `5,554,176`
- MSI SHA-256: `7CAB15CF72F0AC838C4284F54218B7E094F505691F81BC2452FEC66EFF6E973F`

`cargo tauri build --no-sign`, exit 0. The exe reports FileVersion and
ProductVersion `1.12.0-88`, and the packaged `dist/assets/index-DTiV7TK5.js`
carries the same string. Updater signing was intentionally skipped.

## Why This Build Exists

**The `1.12.0-87` smoke disproved BD-VP, and this package is the re-check.**
That build still showed floating scrollbar arrow controls in Breakdown, a
horizontal track at the bottom of the charting deck, and charting-area spacing
that had regressed to uneven and cramped despite unused width. Every Chromium
harness was green through all of it - which is the finding, not an excuse.

It carries exactly one change over `1.12.0-87`: the second BD-VP repair
(`dd5202e`) and its documentation (`1b684da`). PL-1, PL-2 and BD-CTX are
unchanged from the previous package and already passed.

## What Changed, and Why the First Attempt Could Not Have Worked

**The arrow suppression was dead the moment it was written.** It sat in the same
rules as `scrollbar-width:thin`, and Chromium IGNORES every
`::-webkit-scrollbar-*` rule for an element that sets `scrollbar-width` or
`scrollbar-color`. So on every runtime that draws classic scrollbars - installed
WebView2, never the test harness - the `display:none` on the arrow buttons was
discarded along with the rest. `scrollbar-width` and `scrollbar-color` are now
removed from all four Breakdown CSS owners, the webkit rules are the sole
authority, and directional `:start:decrement` / `:end:increment` selectors were
added for both axes.

**Reserving the scrollbar gutter was the overflow mechanism, not a defense
against it.** `scrollbar-gutter:stable` reserves the ENVIRONMENT's own scrollbar
width - 0 under overlay scrollbars, ~17px under classic ones - so it produced a
different content box in the two runtimes. That is precisely the "fits in
testing, overflows on your machine" behavior it was supposed to prevent. It is
gone. Instead every row in the deck must reflow: the situation chip row lost its
pinned `flex-wrap:nowrap` (the one row in the deck with no escape if its text
measured wider in another engine), and deck selects lost their hard 180px floor.

**The spacing regression was real and measured**, not a matter of taste. Section
headers rendered their content 3px from the form edge while their own bodies sat
at 15px; every row had a 12px right inset against that 15px left, because the
group's 3px accent border ate the left with nothing balancing the right; an
action row nested inside a group body added a further 8px for 20px; and the
collapse caret floated wherever the section title happened to end, its distance
from the right edge ranging 20px to 142px. All four are corrected to ONE 12px
inset with the caret right-aligned, and dropping the reserved gutter returned
10px of width to the content.

## Verification

- Canonical gate on the code baseline: **119 harnesses, 119 green, 0 skipped,
  0 failed.** The gate's own detector self-test was run first and reported
  `0 bad`, so a red harness would have been caught.
- `e2e-breakdown-viewport` 167, mutation-verified by restoring the original
  padding, the `nowrap` chip row and `scrollbar-width` (4 red, reporting the
  measured `{"distinct":[3,15,23]}`).
- Focused ownership harnesses all green: `e2e-breakdown-geometry` 46,
  `e2e-native-breakdown-theater` 64, `e2e-native-tagging` 69, `e2e-film-room`
  174, `e2e-css-ownership` 6, `e2e-design-system` 17, `e2e-workspace-shell` 99,
  `e2e-play-library` 50.
- `e2e-p0-exit` re-run after the bump (19/19), so all four version strings agree.
- Screenshots: `artifacts/breakdown-viewport/`, implementation evidence only -
  they confer no design approval.

## What Chromium Could NOT Certify - the whole point of this smoke

**No Chromium harness can render, measure, or fail on a scrollbar arrow or a
horizontal scrollbar track.** Headless Chromium renders overlay scrollbars
unconditionally: a probe styling `::-webkit-scrollbar{width:40px}` measures a
**0px** gutter, and `--disable-features=OverlayScrollbar,FluentOverlayScrollbar,
FluentScrollbar` does not change it. The assertions added here are therefore
deliberately environment-INDEPENDENT - they pin the CONDITIONS that produce the
chrome (no `scrollbar-width`/`scrollbar-color`, no reserved gutter, no
unwrappable chip row, one shared inset, vertical-only deck scrolling), never the
chrome itself.

Before installed smoke, the spacing repair was Chromium-proven and the
arrow/track repair was not. The coach approved this installed build on
2026-09-16; that native evidence closes BD-VP for beta use.

## Smoke Sequence

1. **Breakdown at your usual window size, in Offense, Defense and Special
   Teams.** Look for tiny floating arrow controls anywhere on the screen. This
   is the thing the last build got wrong.
2. **The bottom of the charting deck.** There should be no horizontal scrollbar
   track. The deck should scroll up and down only.
3. **The charting deck's spacing.** Section headers (SITUATION, OUR OFFENSIVE
   LOOK, PLAYERS & GRADES), field labels, chip rows, text inputs and the
   `Edit Library` buttons should all begin at the same left edge, and nothing
   should run past the panel on the right. The collapse caret on each section
   should sit at the right edge, in line with the ones above and below it.
4. **Resize the window narrower and wider.** Chip rows should rewrap; nothing
   should clip or start a sideways scroll.
5. **The play filmstrip.** It still scrolls sideways - that is its design - but
   check it for arrow buttons too.
6. **Everything else from the `1.12.0-87` list that you already passed** - the
   `Edit library` retarget, `Add to Playbook`, `Option` and the `B` shortcut,
   the selectors reading as controls - is unchanged code and needs no re-check
   unless something looks off in passing.
7. **Data intact.** Games, film links, tags, rosters and reports unchanged.

## Status

**APPROVED FOR BETA USE - installed coach smoke passed 2026-09-16.** The coach
approved the newest build, `1.12.0-88`. This closes BD-VP's installed acceptance
checkpoint for floating arrows, horizontal charting overflow and deck spacing.
No additional viewport/DPI matrix is claimed beyond the coach's smoke.

Not tagged, pushed or published. Home production remains formally `REJECTED`;
beta smoke approval does not advance the formal design approval registry.
