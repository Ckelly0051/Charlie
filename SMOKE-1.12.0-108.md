# SMOKE 1.12.0-108 - Windows x64 Beta (unsigned)

## Build Record

- Full gate at `0163da45`: **141/141 green, 0 skipped, 0 failed**, 2026-10-01.
  The first run at `e8f268c5` was 140/141. `e2e-reports-overview-realdata`
  still recalculated sacks under the pre-S107-6 convention; it was aligned to
  the coach ruling, not a product change.
- Version-only bump `05ec6615` (all four owners `1.12.0-108`); `e2e-p0-exit` 19/19.
- Artifact: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-108_x64-setup.exe`,
  4,041,437 bytes, SHA-256
  `DA6C40A96A553881FFD96A9A6215E6F1CE25DD6FA56BDF3C3FD83FC0F24A2E77`.
  Product and file version `1.12.0-108`. Built from a clean tree with
  `createUpdaterArtifacts:false`. Nothing pushed, tagged or published.

## What to check (installed smoke pending)

Break Down visual finish (BD-UX-1, BD-UX-2):
- Program, Season and Game show label above value in a 36px row, at your
  preferred height. Each opens a titled menu: current row checked; Season
  Library / New season and New program in gold. Escape returns focus.
  Switching program, season and game still works from Break Down.
- Narrow window (<901px): the three selectors appear under the top bar.
- Deck: field labels step evenly; Gap sits under Play Direction as a plain row.
  A custom Formation not in the library shows on its own row and wraps in full.
- Video area at your normal window size is unchanged in feel; nothing covers film.

S107 source repairs now packaged:
- S107-2 passing attempts across games; S107-6 college sack accounting
  (live 2025 JV: 191 passing yards / 24 attempts / 8.0 YPA; 866 rushing yards /
  148 attempts). Overview Rushing/Passing tiles match.
- S107-3 / S107-7 play strip: assigned drives collected and ordered; 2025 JV
  Week 1 play 43 End of half, 44-50 Our Drive 5; a numbered kickoff stays in its
  own drive (no phantom opposing drive).
- S107-4 Gap and Play Direction independent.
- S107-5 Overview Turnovers counts total losses including Special Teams (NDP 1).

## Findings

(log during smoke; no fixes until the list is complete)
