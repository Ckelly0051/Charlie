# GridIron IQ 1.12.0-70 Beta Smoke

## Candidate

- Installer: `GridIron-IQ-1.12.0-70-Beta-Setup.exe`
- Built: 2026-09-02
- Baseline: `f615fcd` plus synchronized `1.12.0-70` release metadata
- SHA-256: `1E575EC615FC19B31126DA93C98693A942E46C5D5AB572904E40B85DF27A3677`
- Windows x64 NSIS; unsigned OS package; updater-artifact signing disabled only
  for this local smoke candidate.

## Primary Smoke

- Launch into Home with the real local catalog intact.
- Confirm Program Seasons and Opponent Scouts headings remain visible together.
- Scroll each populated tree independently; the other tree and fixed rail tools
  must remain in place.
- Open program and opponent rows across seasons; the selected context must be
  correct and the other tree must remain visible.
- Confirm Home games are oldest-first by date, including scrimmage/preseason.
- Select a game and use Open game, Open Study, Open Reports, Game Plan, Manage
  film, and the season-scoped rail tools.
- Confirm game cards, selected-game details, scores, status text, thumbnails,
  hover/focus states, and literal concise copy render without clipping.
- Check Home at ordinary desktop width and a narrow window; below 700px the rail
  must return to stacked page flow.
- Open Breakdown and confirm real film playback, charting, Save & Next, Film
  Room, and the previously reported horizontal-overflow repair remain intact.
- Restart the app and confirm the selected team/season, film links, charted plays,
  roster, and workspace mode persist.

## Findings

Record only observed installed-app behavior here. Include the route, selected
team/season/game, window size, exact action, expected result, actual result, and
a screenshot when presentation is involved.
