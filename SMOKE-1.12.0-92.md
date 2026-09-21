# SMOKE 1.12.0-92 — Windows x64 Beta (unsigned)

**Purpose:** Charlie's installed visual acceptance pass for the Home revision.
**Packaged from:** `1c3b1bc` (the first-launch harness path repair on top of
`5b46c05`), bumped in `9011ee7`. It carries the complete Home work from
`77e7b50` through `5b46c05`.
**Built from a clean worktree** at the bump commit, so none of the main working
tree's uncommitted files reached the installer.
**Bundles:**
`src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-92_x64-setup.exe`
(3.8 MB) and `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-92_x64_en-US.msi`.
`cargo tauri build` exits 1 AFTER producing both, on the updater signing step
(`TAURI_SIGNING_PRIVATE_KEY` unset) — the standing condition of every unsigned
beta package here, not a build failure.
**Installed:** `%LOCALAPPDATA%\GridIron IQ\gridiron-iq.exe`, file and product
version `1.12.0-92`.
**Status:** unsigned, not tagged, not pushed, not published. Home production
remains formally `REJECTED`; the registry is unchanged.

## Pre-package checks (clean worktree)

| Harness | Result |
|---|---|
| `e2e-home-rail` | 57/57 |
| `e2e-home-review-repair` | 37/37 |
| `e2e-home-deferred-repair` | 105/105 |
| `e2e-home-first-launch` | 13/13, run twice to prove create and overwrite |
| `e2e-workspace-shell` | 100/100 |
| `e2e-responsive-containment` | 105/105 |
| `e2e-native-team-hub` | 13/13 |
| `e2e-design-system` | 17/17 |
| `e2e-css-ownership` | 6/6 |
| `e2e-p0-exit` (after the bump) | 19/19 |

`e2e-home-first-launch` first crashed with ENOENT in the clean worktree: it
writes captures into `artifacts/`, which is untracked and absent from a fresh
checkout. `1c3b1bc` makes it create that directory; no assertion changed.

## Installed smoke — PARTIAL, run 2026-09-21 by Claude

Run at a 1920×1080 client area (96 DPI) on the coach's real library.

Verified:

- Home opens on real data: three program seasons, 13 games, 758 plays, film
  ready. Opening `2025 St. Joseph Mavericks - JV` shows six populated game cards
  with film thumbnails, scores, charting counts and film state.
- Program Seasons and Opponent Scouts render as two distinct headed sections,
  each with its own create action.
- The active year (2025) carries no caret, stays expanded, and clicking it does
  nothing. It aligns with the inactive year's text.
- The inactive year (2026) collapses and expands by mouse, by **Enter** and by
  **Space**, with its count retained while folded. Space working here also
  confirms the global Space-key fix in the installed WebView2.
- Keyboard focus is visibly painted (the blue focus ring on the rail row and on
  the year disclosure, reached by real Shift+Tab / Tab).
- All five anchored tools are present with a season open: Roster, Film &
  storage, Season setup, Edit season details, Manage program.
- The selected game card (Week 1 vs St. Peter Lutheran Patriots) and the
  selected-game panel agree: 41–0, 67/67 charted, 69 clips linked.
- No clipping, overlap or horizontal overflow observed at 1920×1080.

**Not completed:** the smoke was stopped when the coach began charting a live
game in the installed app (Break Down, SJM Varsity 2026, Week 4). Driving the
app further would have sent input into his charting session. Still to check:

- 1440×900 and 1280×800 captures.
- Independent scrolling of the two trees. With this library (three program
  seasons, no scouts) neither tree overflows at 1920×1080, so it cannot be
  exercised on real data at that size.
- Console errors: the installed WebView2 exposes no console without devtools,
  so this cannot be observed from the installed build; the Chromium harnesses
  above report zero page and console errors.

**No installed screenshots were saved.** The one save attempt was declined, so
no installed-build image exists on disk for this package. The latest populated
Home captures are the Chromium ones in `artifacts/home-rail-91c/` — build
evidence, not installed evidence.

## Result

Not yet accepted. Awaiting Charlie's installed visual review.
