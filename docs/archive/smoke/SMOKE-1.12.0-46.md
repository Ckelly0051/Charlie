# GridIron IQ 1.12.0-46 - Integrated Play-Call Smoke

## Artifact

- Source: `5375821`
- NSIS: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-46_x64-setup.exe`
- SHA-256: `13EC101E345A6764CE2AFD93F4E628BC3842723FDE09C700791577ADDCC74FFE`
- Status: local unsigned candidate; not published

## Data Safety

Use a disposable season or game for the write steps. Do not map or rewrite the
existing six-game season during this smoke. Existing-season migration remains a
separate dry-run-and-confirm operation.

## Coach Smoke

1. Open a disposable game with playable film. In Chart, select or create an
   exact call such as `26 Blast` with concept `Power`. Save & Next. Confirm the
   call is visible when returning to the play.
2. Close and reopen the game. Confirm Play Call, Concept, and the existing tags
   all persist and the linked video still plays.
3. Open Film Room. Enable Play Call and Concept columns. Confirm the saved values
   appear on the same play, then edit the call once and verify Undo/Redo restores
   the entire call/default change as one action.
4. Export CSV. Confirm Play Call, Play Call ID, and Play Concept columns contain
   the edited play. Import that CSV only into disposable data and confirm those
   fields return without being mixed into Formation or Notes.
5. In Study, break down by Play Call and then Play Concept. Confirm the expected
   group/count appears. Select Watch and verify the first film clip is one of
   that exact cohort; Next must advance within the cohort, not chronologically.
6. In Reports > Offense, confirm Call Performance and Concept Roll-up appear.
   Compare one call's play count and Success Rate with Study. Select a call or
   situational call row and confirm its exact film cohort plays.
7. Open Call Sheet and Plan for the same disposable play. Confirm `26 Blast`
   leads the label, `Power` is separate context, and legacy plays with no exact
   call still show their structural fallback instead of a blank label.
8. Visually inspect Reports at the normal coaching window size: no clipping,
   overlap, horizontal page overflow, or excessive empty modules in the new
   play-call sections.

## Result

- [ ] PASS - all eight checks passed
- [ ] FAIL - stop and record the first failed step, screen, and observed value