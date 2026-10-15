# GridIron IQ Open Defects

Open items only. When an item closes, delete it here and record the closure in
the commit; history through 2026-10-04 is in
`docs/archive/OPEN-DEFECTS-THROUGH-2026-10-04.md`. Before reporting an item as
open, check its fix and smoke status in git.

## Release Status

Installer `1.12.0-118` is built from clean bump `d8998f22` after the full gate
passed 166/166 at `a5238591`. Independent packaged-asset inspection and
installed smoke remain pending (`SMOKE-1.12.0-118.md`).

Receiver route/release checkpoint 1 is built in source after comp approval
(2026-10-14), packaged in 118 but not installed-smoked. Installed checks remain
for Save/reopen, library editing,
multiple receiver attribution, clearing/cancellation (also Film Room, Quick
Chart and scheme copies), opening a valid mismatched receiver record as hidden
data, dropping it on Save, and exact Study film.
Target/Catch is not built. Whole-deck polish is built in source,
IMPLEMENTED_UNVERIFIED, from the COMP_APPROVED full-control comp, including
compact section-entry spacing. Charlie Gate visual review is PASS (coach,
2026-10-14). Packaged in 118; installed verification remains pending: retained
modules, shortcut feedback and Y focus, compact/fine and
coarse controls, managed libraries, roster/receiver editing, Save/Undo and real
film layout/scrolling. The coach's latest disclosure rule permits multiple open
modules and shortcut opening, but never automatic closing on the current play.

Latest coach-accepted build: `1.12.0-117`, smoke PASS by the coach on
2026-10-14 (`SMOKE-1.12.0-117.md`). The carried 114-116 repair checks are
closed by that approval. Independent packaged-asset inspection remains
pending; installed approval does not change the design registry or the
historical gate receipt. Rapid scrubbing remains deferred.

## Awaiting the next installed smoke

- **Keyboard Shortcuts text overlaps in installer 117.** Repaired in source
  with bounded, wrapping shortcut chips at unchanged type size. The coach
  deferred verification to the next installed smoke (2026-10-13); accepting
  117 does not verify this source-only repair. Check Play Type, Result and
  the Redo chord at the observed 1402 x 932 window. Owners:
  `js/native-shortcuts.jsx` and `css/native-shortcuts.css`.

## Open defects

- **117 packaged-asset inspection.** Still needs independent inspection of
  installer assets against the reviewed build; coach smoke approval is
  separate evidence.

- **118 packaged-asset inspection.** Still needs independent inspection of
  installer assets against the clean bump build before release acceptance.

- **Rust transitive maintenance advisories.** The compatible dependency
  repairs remove the reported vulnerabilities and the anyhow/event-listener
  unsoundness warnings. Remaining warnings are unmaintained proc-macro-error
  and five unic crates, plus glib 0.18.5 unsoundness (RUSTSEC-2024-0429).
  glib and proc-macro-error are absent from the Windows dependency tree;
  unic remains through Tauri's urlpattern dependency. Track upstream
  replacements; do not suppress the advisories or force incompatible GTK
  versions into Tauri. Repeat `cargo audit --file src-tauri/Cargo.lock`
  after future dependency updates.
- **Rapid timeline scrubbing can falsely show "Film unavailable"** (intermittent,
  deprioritized). Installed WebView2 only; reopening loads the same film. Every
  scrubber `input` sets `video.currentTime`, and `VideoController` treats any
  resulting media `error` as missing film.
  Recurred during installed 113 smoke (2026-10-08), Varsity 2026 vs OLV,
  Play 26, clip `20261003_192402`, at 0:04 of 0:16; see
  `docs/archive/smoke/SMOKE-1.12.0-113.md` finding 1. Screenshot confirms the unavailable overlay
  with a film frame still visible; no new root cause established.
  Coach reports another recurrence: quickly seek forward and back; it does
  not fail every time. Investigation is deferred at the coach's request.
  Automated seeks with a screenshot between inputs do not reproduce that
  timing or establish a root cause. No fix or coach-data change made.
- **OCR controls are a visible dead end** (OCR-1, parked by the coach
  2026-09-27). Set region, Read and Auto OCR render into elements that no longer
  exist. Kept for future use; the controls do nothing today.
- **Offense narrow-width exception.** At 1280, eight five-column Offense modules
  keep 12px cells (`gi-off-narrow-fit`). Recomposing that band so the exception
  can be deleted is open.

## Old patterns to fix when touched

Working code built the old way. A change that edits one of these files fixes
that file's items in the same change, or its commit message says why not.
Read this section before every build. Lower the count here, and in
`tools/legacy-inventory-baseline.json`, in the commit that fixes an item;
delete a line when its count reaches zero. Counts from `tools/audit-legacy.mjs`,
updated 2026-10-07.

**`window.app` reach-through** (2). Code reaching shared services through the
global app instead of its owner or an injected dependency.
- `js/app.js` 1: the global itself (`window.app = new App()`), which the remaining
  reach-throughs and the test harnesses use; it goes last
- `js/scoreboard-ocr.js` 1 (OCR is parked)

**Raw `innerHTML` writes** (4). HTML built as strings instead of rendered by the
native owner; each one is an escaping risk.
- `js/scoreboard-ocr.js` 4 (OCR is parked)

Installed drawing and real-film Detection Review preview still need smoke.
Their shared overlay owners have per-opening lifecycles covered by focused
replacement/reset checks.

**`js/stats-engine.js` size.** Split by area, with `e2e-parity`
proving no change. The split is part of the reports rebuild
(`GRIDIRON-IQ-PLAN-V2.md`, coach 2026-10-10), so changes until then skip it.

## Stale references found in passing

- `design-comps/breakdown-visual-finish-2026-09-28/index.html` loads
  `../../ux-prototype/assets/all22-frame.png`, deleted with `ux-prototype/` in
  `c28e7e26`; the comp now renders without its film frame. The comp is not a
  registered canonical artifact. Not fixed.

## Coach decisions pending

- **Focus ring color.** `--gi-focus` resolves to blue (`--gi-9`) app-wide;
  neutralizing it is an app-wide palette change.
- **`Option` in fixed report schemas.** It is absent from Overview's approved six
  play-type categories and the Defense dashboard's seven.
- **Home rail at 1280x800.** Two rail panes, tools and footer do not all fit;
  space must come from the tools or footer.
- **Home at 390.** The stacked rail fills the first screen before any workspace
  body.

## Coach-owned data

- Drive-number slips in 2025 JV Week 1: Opponent Drive 3 holds plays 24-28 (Q2)
  and 51-58 (Q3); Our Drive 6 holds 59-60 and 66-69.
- Play 23 is stored as Kick XP; it should be Try, Run/Pass, Converted, 1 Point.
- Plays to re-chart after the legacy conversion: `docs/LEGACY-RECHART-LIST.md`.

## Structural limits (planning inputs, not defects)

- Settings live in localStorage: the quota failed once,
  settings do not travel with a season, and nothing syncs them. Blocks the
  mobile companion.
- Chromium harnesses prove behavior and geometry, not installed WebView2
  rendering or visual fidelity; every installer needs an installed smoke.
