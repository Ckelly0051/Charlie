# GridIron IQ 1.12.0-56 Smoke Check

This build contains the coach-approved Reports Overview and Break Down visual
recomposition. It does not change analytics, tags, season data, or film paths.

Installer: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-56_x64-setup.exe`

SHA-256: `886760A3EED871E7F5A88864B76427B26CED757F4406FAEEEE43CFC8E3AD55AB`

Release gate: **88/88 green, 0 skipped, 0 failed**.

## Break Down

- Open a linked game and confirm film plays normally with no overlay covering it.
- Confirm the film, lower-third, transport, play strip, and compact charting deck fit together at normal desktop size.
- Switch Offense, Defense, and Special Teams; confirm fields remain usable and Save & Next persists a harmless test edit.
- Confirm Situation rows align, with Distance and Yard Line using the same neutral label color.
- Confirm the play strip and page do not gain unwanted horizontal overflow.

## Reports

- Confirm Overview has no large empty regions, stretched tiles, clipped metrics, or misaligned major dividers.
- Open all report tabs and confirm each still renders.
- Spot-check one displayed total against a known tagged game value.
- Open two highlighted metrics and confirm each launches the expected film cohort.

## Data And Film

- Reopen the real six-game season and confirm all games and play counts remain.
- Confirm linked D: film still resolves and no video was copied or moved.
- Log findings as one batch; do not issue isolated fixes or releases.
