# SMOKE 1.12.0-115 - Windows x64 Beta (unsigned)

## Build Record

- Full gate at `216d5426` (2026-10-12): **158/158 green, 0 skipped, 0 failed**.
  Receipt: `artifacts/gate-logs/2026-10-12T06-16-21-359Z-WTtmIO/receipt.json`.
- Codex reviewed the batch (`55263421..216d5426`) in rounds; the last round
  had no findings. Analytics parity (`e2e-parity`) green.
- Version-only bump `3788a593`: all four owners `1.12.0-115`;
  `e2e-p0-exit` green, 20/20.
- Artifact: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-115_x64-setup.exe`,
  4,047,120 bytes, SHA-256
  `EE10EAFE802F5ECD05FAF58B156F05F119CE41CCCFAEDBAB3A2009BEF6A7677A`.
  Product version `1.12.0-115` (installer and `gridiron-iq.exe`). Built from
  a clean tracked tree at `3788a593` with `cargo tauri build --bundles nsis`
  and an external scratch config setting `createUpdaterArtifacts:false`.
- Packaged-asset inspection: not run.
- Nothing pushed, tagged or published.

## Result

Smoke in progress (2026-10-12).

## Findings

1. Inside a dashboard, the Reports bar's "Back to reports" sits above the
   dashboard's own "All dashboards": two back buttons stacked. Back to reports
   leaves Dashboards for the report tabs; All dashboards returns to the
   Dashboards home. Coach: "back to dashboards makes more sense - we came
   from there. If we want to send to reports then a go to dashboards button
   makes more sense. Basically, switch the formatting." The back-style button
   inside a dashboard returns to the Dashboards home; going to Reports is the
   plain button. Space the buttons so one is not clicked by accident.
2. A Prev / Next dashboard control, to click through dashboards without
   returning to the Dashboards home. Coach: in the same strip as Back to
   dashboards, open to a suggestion. Proposed layout for that strip:
   Back to dashboards at the left; Prev / Next dashboard beside it after a
   gap; Go to reports alone at the right end.

## What to check

Standard smoke (`docs/RELEASE.md`): install and launch; real-season play counts;
managed and linked film playback; chart, close with X and relaunch to verify
saved tags and the selected game; switch games without duplicate clips; Watch
opens exactly the counted plays.

Smoke 114 findings:

- **Dashboards home:** Reports > Dashboards opens on a home page every time:
  New dashboard, saved dashboards (Open, Delete), then templates. All
  dashboards returns to it. Watching film from a dashboard and coming back
  lands on Dashboards.
- **Templates:** a template opens marked Template. Scope, unit and filters
  only change the view. Adding or editing a widget asks for a name and saves
  a new dashboard; Cancel saves nothing; the template is unchanged.
- **Segment borders:** the selected segment's outline is clean on both sides.
- **Prose:** no explanatory sentences on the new pages.
- **Special Teams teal:** Chart's unit switch, the Special Teams report and
  Dashboards; it reads apart from Defense cyan.
- **Installed-check items:** heat-map Watch labels name the column; penalty
  ruling, phase and team read as labels; share charts fold past five into
  Other with a full legend and labels totaling 100%; negative bars draw left
  of a zero line; "Row limit"; filter chips read 3rd, Q2; a count tile has
  no repeated play count; Study says Stop Rate on defense; the Chart roster
  grid shows its last row whole.
- **Bar scale:** a Success Rate or Stop Rate bar fills its own percent (54%
  fills about half); other bars scale to the largest.

Yards rules (`docs/REPORTS-CONTRACTS.md` > Yards):

- Week 1 vs St. Peter Lutheran defense reads the same yards per play in
  Reports and Dashboards.
- A No Gain, an Incomplete and an Interception with Yards blank count as 0.
- A play with Yards blank and any other result is left out of yards per play.
- A play wiped out by an accepted penalty is left out; a play that stands
  counts only its own gain, not the penalty yards.
- A sack charted with only its result shows in Rushing with its loss
  (2025 JV: ND Prep play 78).
- Explosive Plays film opens exactly the counted plays.

Still open from 114 (`docs/OPEN-DEFECTS.md` > Awaiting the 1.12.0-115
smoke): Chart's draft and Save, unit-change prompts, turnover tacklers,
recovery.

Known open items remain in `docs/OPEN-DEFECTS.md`, including intermittent
rapid scrubbing and the renamed HTML export.
