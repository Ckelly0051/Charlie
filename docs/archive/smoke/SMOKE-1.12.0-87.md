# Smoke candidate 1.12.0-87 - Windows x64, unsigned

## Artifacts

- Source commit packaged: `398e1d6` (bump on top of `6651195`)
- NSIS installer: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-87_x64-setup.exe`
- NSIS bytes: `4,011,152`
- NSIS SHA-256: `4AB08947F9162DA35DEB21273C7309F50488898CF8AF52A02D3567688067DB93`
- MSI package: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-87_x64_en-US.msi`
- MSI bytes: `5,554,176`
- MSI SHA-256: `D67CB1B5391904D957A15E36BF17F02CAFA037AAA962252A8A9A07B986273B4C`

`cargo tauri build --no-sign`, exit 0. The exe reports FileVersion and
ProductVersion `1.12.0-87`, and the packaged `dist/assets/index-DP_tY8Ig.js`
carries the same string. Updater signing was intentionally skipped.

## Smoke Result - 2026-09-15

**BD-VP FAILED. PL-1, PL-2 and BD-CTX passed.** The coach's two 1920x1080
screenshots of this installed build show floating scrollbar arrow controls still
present in Breakdown, a horizontal track still at the bottom of the charting
deck, and charting-area spacing that had regressed to uneven and cramped despite
unused width. Those screenshots are the authority; every Chromium check was green.

Why the first repair could not have worked: it set `scrollbar-width:thin` in the
same rules as `::-webkit-scrollbar-button{display:none}`, and Chromium ignores
every `::-webkit-scrollbar-*` rule for an element that sets `scrollbar-width` or
`scrollbar-color` - so the arrow suppression never applied on any runtime that
draws classic scrollbars. And reserving `scrollbar-gutter:stable` sized the
reservation to the ENVIRONMENT (0 under overlay, ~17px under classic), which built
a DIFFERENT content box in the two runtimes rather than preventing the overflow.

BD-VP is reopened in `docs/OPEN-DEFECTS.md` item 10 and repaired again on source
after this package. **The description below is the disproved first attempt, kept
as the record of what was claimed.** The rendered half of the second repair needs
another installed smoke; no Chromium harness can render, measure or fail on it.

## What This Build Carries

Everything since `1.12.0-86`: the four repairs from this batch, Codex-reviewed
over `56e75f1..6651195` with no findings outstanding.

**PL-1 - the play-library Add controls work again.** `SettingsScreen.open()`
returned the live sheet's promise when a settings sheet was already open, and
DISCARDED the requested tab, chart group and typed play-call name. The sheet is
non-modal, so reaching the charting deck while it is up is ordinary use - and in
that state both the Play Type field's `Edit library` and the play-call field's
`Add to Playbook` did nothing at all and said nothing. It now retargets the live
sheet instead.

**PL-2 - `Option` is a built-in offensive play.** Owned once by the charting
vocabulary, so it needs no custom entry. Distinct from `RPO`: an option is a
post-snap ball-carrier decision, an RPO a pass-or-run read. Like RPO it does not
guess Run or Pass, and it combines with the realized look - `Option + Run Outside`
charts both. Keyboard shortcut **B**, in both Quick Chart and the global charting
shortcuts. Existing teams get it visible through a version migration; no stored
tag was touched.

**BD-VP - DISPROVED BY THIS SMOKE; see the result section above.** The
cause was scrollbar layout: Chromium's scrollbars are overlay and cost no space,
while installed WebView2 uses classic Windows scrollbars that consume ~17px AND
render arrow buttons with no name. Panes that fit in testing overflowed on your
machine. Breakdown now reserves that space in both environments, forbids a
sideways track on vertical-only panes, and removes the arrow buttons. The play
filmstrip still scrolls sideways - that is its design - but its scrollbar has no
arrow buttons either.

**BD-CTX - the Program / Season / Game selectors read as controls.** Measured
before: they differed from the bar by 1.25:1, which reads as a label. One neutral
graphite surface now comes from the shell's own token block and applies on every
route that shows the bar; its border measures 4.1:1 against the bar. The open
state no longer uses the rejected blue.

## Verification

- Full canonical gate on `6651195`: **119 harnesses, 119 green, 0 skipped,
  0 failed**.
- `e2e-p0-exit` 19/0 after the bump - all four version owners match.
- Focused: `e2e-play-library` 50/0, `e2e-breakdown-viewport` 151/0 across
  1920x1080, ~1420x1000, 1440x900 and 1280x720 in Offense, Defense and Special
  Teams, `e2e-native-quick-chart` 15/0, `e2e-film-room` 174/0.
- Screenshots: `artifacts/breakdown-viewport/` (12), implementation evidence only.
- The gate was not rerun for the bump, which changes no runtime code.

## What Chromium Could NOT Certify - the point of this smoke

- **Classic Windows scrollbars.** The whole BD-VP repair is about them, and
  Chromium renders overlay scrollbars instead. Only this build shows the real
  thing.
- Whether the reserved gutter leaves the deck and rail usable at your actual
  window size and DPI.
- The vision analyzer end to end (it needs a real API key and real frames); only
  its prompt and validator are pinned here.

## Smoke Sequence

1. **Breakdown at your usual window size.** Nothing clipped on the left, global
   navigation whole, no horizontal track at the bottom, and no tiny floating
   arrows anywhere. Check Offense, Defense and Special Teams.
2. **The play filmstrip.** It still scrolls sideways - that is intended - but it
   should have no arrow buttons on its scrollbar.
3. **Selectors.** Program / Season / Game should look like controls against the
   bar, on Breakdown AND on Home, Study, Reports and Plan. Hover and tab to them.
4. **Add a custom play type.** In the charting deck open `Edit library` on Play
   Type, type a name, Add. It should appear once, immediately, in the chips.
   Then **leave Settings open**, go back to charting, and press `Edit library`
   again - that is the case that used to do nothing.
5. **Add a play call.** Type one in the Play Call field and press
   `Add to Playbook` while Settings is already open. The name should arrive
   pre-filled.
6. **Blank and duplicate.** Both should refuse with a message, not silently.
7. **Reopen.** Close and reopen the app; the custom play type and the play call
   should both still be there.
8. **`Option`.** It should be in the Play Type chips with no setup, separate from
   RPO. Press **B** while a play is selected. Chart `Option` with a realized look
   and confirm Run/Pass is yours to choose.
9. **Data intact.** Games, film links, tags, rosters and reports unchanged.

## Status

Unsigned local smoke candidate. Not accepted, tagged, pushed or published. Home
production remains formally `REJECTED`.

Two items from this batch are deliberately NOT in it, both recorded in
`docs/OPEN-DEFECTS.md`: `Option` does not appear in Reports > Overview's approved
fixed six play types or the Defense board's approved seven production rows,
because resizing an approved board is your decision rather than an implementation
detail; and the Home season-rail scaling finding from the 1.12.0-85 smoke is a
separate layout pass. Windows SmartScreen will warn on launch because the build
is unsigned.
