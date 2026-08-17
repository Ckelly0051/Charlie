# GridIron IQ 1.12.0-54 Smoke — Broadcast Density milestone (Break Down + Reports)

**Purpose:** close out the Broadcast Density milestone (Part 1 Break Down +
Part 2 Reports, both Codex-accepted, latest repair `d0fb55b`). This is the
first time the accepted Reports redesign — color migration, density,
Turnovers tile, score reconciliation — is checked on real film and a real
season rather than a synthetic fixture.

**Artifacts (local unsigned, not published/tagged):**
- NSIS: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-54_x64-setup.exe`
  — SHA-256 `005F1A4A1A1582BA75CE585F34C772712CDF5EB83B33E89DFBF01B71E9D485BC`
- MSI: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-54_x64_en-US.msi`
  — SHA-256 `2D4A42EA00EE41988BAC3E1391E94810F6F9B751188C1B2249FB26CE4D8DAF6B`

**Findings protocol:** log every item you find as you go. Do not stop to fix
anything mid-smoke, and do not ask for an isolated fix/release for a single
item — collect the complete list first, then hand it back as one batch.

## 1. Install

- Install over the current app (`1.12.0-53` or earlier) without deleting
  application data.
- Launch. Confirm the More menu / version label reads `1.12.0-54`.

## 2. Break Down

- Open a real charted game. Confirm film plays back (linked D: film, not a
  managed copy).
- Switch games; confirm film and tags reload correctly for the new game.
- Chart a play: tag a field, Save & Next, confirm the play strip updates and
  the save is reflected.
- Enter fullscreen; confirm the transport (play/pause, scrub, speed) is
  visible and usable, then exit.

## 3. Reports — all eight tabs

Open Reports on that same real game and step through Overview, Offense,
Defense, Special Teams, Players, Self-Scout, Season, Matchup:

- **Official vs. tagged score treatment.** If Game Settings has a final score
  entered, confirm the persistent rail's `Final Score` tile shows it. Scroll
  to the Scoreboard section (tagged-play reconstruction) — if it disagrees
  with the official score, confirm the reconciliation disclosure is visible
  and reads correctly (not silently showing two unlabeled numbers).
- **Phase counts.** Confirm `Plays per Phase` reads as `O ## · D ## · ST ##`
  — legible at a glance, not a run of digits.
- **Turnovers tile.** Confirm it shows giveaways/takeaways honestly for
  whichever units are actually charted in this game (never a fabricated
  `0 GA`/`0 TA` for an uncharted side).
- **Density/responsiveness.** At your normal window size, confirm each tab is
  noticeably more compact than before with no clipped tables, no horizontal
  scrollbar on the page itself, and correct scoreboard alignment.
- **Watch actions.** Click several film-linked rows/bars across different
  tabs (a formation row, a defensive front row, a big-play, a self-scout
  tell) and confirm each opens the correct play(s).

## 4. Data safety

- Confirm your real six-game season is fully intact — all six games, correct
  play counts, no missing tags.
- Confirm linked D: film is still linked (not silently converted to a
  managed copy) and plays back for each game.

## 5. Report back

List every finding, however small, as one batch. No isolated fixes or
releases happen during this smoke — repairs are batched and reviewed after
the complete list is in hand.
