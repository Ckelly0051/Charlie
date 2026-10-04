# GridIron IQ 1.12.0-46 Findings - Delivered in 1.12.0-47

## Status

**COMPLETE - 1.12.0-47 CANDIDATE BUILT.** The coach completed the installed
review on 2026-08-11 and authorized one consolidated implementation, one final
canonical gate, and one new installer. The batch below is implemented without
rewriting existing coach data. Final canonical gate: **85/85 green, 0 skipped**.

## A. Functional Requirements

### A1. Discoverable Play Call library

- Rename `Our Play Call` to `Play Call` for self-scout offense.
- Add a right-aligned `Edit Library` action on the same label row.
- `Edit Library` must open Playbook & Calls directly without requiring the coach
  to hunt through Team Settings.
- Unknown typed calls must make the distinction clear: `Use once` records only
  the text; `Add to Playbook` creates a reusable call definition with defaults.
- Selecting a saved call must apply its configured formation, alignment,
  backfield, strength, personnel, motion, direction, run/pass, play type, and
  concept defaults as one undoable transaction. A coach override must affect
  only that play, not mutate the saved definition.
- The charting surface must visibly confirm that defaults were applied.

### A2. Confirmed turnover margin

- Replace `INT Margin` with `Turnover Margin`.
- Count interceptions and only confirmed fumble recoveries/losses. Never count
  every `Fumble` result as an automatic turnover.
- Establish one explicit ordinary-snap recovery owner (`subject`, `opponent`, or
  unknown), rather than inferring ownership from unit alone. Preserve the
  existing Special Teams recovery contract.
- Keep raw fumble totals available separately.
- Game, season, offense, defense, and player outputs must use the same ownership
  rule. Unknown ownership fails closed and is disclosed honestly.

### A3. Self-Scout information hierarchy

Offense and defense Self-Scout must lead with actionable performance rather than
Predictability. Offense: Success Rate, yards/play, explosive and negative-play
rates, situations, exact calls/concepts, formation/personnel, and direction vs
strength. Defense: defensive Success Rate, yards allowed/play, explosives
allowed, negative plays created, situational stops, front/coverage/blitz
performance, personnel/alignment, and individual production. Predictability is
one secondary diagnostic, not the page's primary content.

## B. Reports UX and Copy

- Remove the top instructional film banner.
- Remove descriptions beneath Expect, Attack, Avoid, and Risk.
- Remove the matchup overview and offense/defense matchup prose descriptions,
  including `Read-only` copy.
- Replace matchup prose with a dynamic one-line strip: `Games Charted: X ·
  Offensive Snaps: X · Defensive Snaps: X`.
- Formation Frequency, Field Position, and Down explanations remain but each
  must occupy one line at normal desktop width.
- Team Profile copy becomes `This game vs. our season average.`
- Core Tendencies copy becomes `Snaps sorted by frequency; click any column or
  row to sort. Click any row to watch the film.`
- Remove the matrix explanation. Increase matrix cell copy without adding rows.
- Scatter caption becomes `Field position vs. yardage gained.` Review the chart
  structure so its axes and use are understandable.
- Rename the field-zone module `Success Rate by Field Position`.
- Make game and season report tabs visually prominent primary navigation with a
  strong active state.
- Matchup offense/defense headers require readable contrasting text, slightly
  larger type, and no green-on-green or red-on-red treatment.
- Formation and Snap Count in opponent cards receive equal type size/weight.
- The current pressure computation is blitz-tag frequency. Rename every label in
  that module to Blitz terminology: Blitz, Blitz Rate, Success Rate vs. Blitz,
  and No Blitz. At zero blitz snaps, Success Rate is `N/A`, not `0%`.

## C. Charting UX

- Remove descriptive helper copy from every charting section header; preserve
  only titles and functional actions.
- Perspective buttons become `SELF SCOUT` and `OPPONENT SCOUT`, centered on one
  line with balanced padding.
- Film status copy is green when linked/available and red when missing/broken;
  wording remains explicit so color is not the only signal.
- Play-strip cards must never bleed text. Fit the detail line down to a readable
  minimum; use ellipsis plus full hover/focus text only as a final fallback. No
  internal card scrollbar and no layout shift.

## D. Acceptance

- Use existing canonical metric and composite-ref film seams.
- No migration or reinterpretation of existing play calls.
- Do not delete or rewrite coach data without explicit approval.
- Focused tests during implementation; one full canonical gate at the end.
- Build one uniquely versioned unsigned installer only after the gate is green.
## E. Completion Record

Implemented in one consolidated candidate:

- Play Call now has a direct `Edit Library` route, explicit `Use once` and `Add
  to Playbook` choices, and atomic saved-call defaults through the shared
  PlayCallModel.
- Ordinary-snap fumbles now store an explicit recovery owner. Turnover Margin
  combines interceptions with only confirmed fumble losses/recoveries; unknown
  recovery remains visible but does not invent a turnover. The field survives
  canonical save and CSV round-trip.
- Offense and defense Self-Scout lead with performance measures and exact calls;
  Predictability remains a secondary diagnostic.
- The approved Reports and charting copy, density, navigation, contrast, status,
  and overflow corrections are applied.

The first full gate correctly found three issues: two raw report colors, a stale
legacy test that awarded fumble-recovery credit from a tackler alone, and an
expected parity snapshot change from the new turnover fields. The colors now use
design tokens; the test now distinguishes unknown from confirmed recovery; the
tracked parity delta was audited and contains only the added turnover fields.
The real six-game snapshot is deterministic and treats unconfirmed legacy
fumbles as unresolved. The final gate passed **85 harnesses | 85 green | 0
skipped | 0 failed**.

Version owners are synchronized at `1.12.0-47`. Unsigned local installers:

- NSIS: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-47_x64-setup.exe`
  - SHA-256: `2FCC19107805ED70E99A187A3A15501071B29079C7566575D945C5B4FA88A184`
- MSI: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-47_x64_en-US.msi`
  - SHA-256: `87A19F571B93DC57906019B0214CA7C88591F12920A63A69CA9DA3AC0EDB79A7`

This is a local unsigned coach candidate, not a stable published release.
