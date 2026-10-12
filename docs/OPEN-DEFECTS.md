# GridIron IQ Open Defects

Open items only. When an item closes, delete it here and record the closure in
the commit; history through 2026-10-04 is in
`docs/archive/OPEN-DEFECTS-THROUGH-2026-10-04.md`. Before reporting an item as
open, check its fix and smoke status in git.

## Release Status

Latest coach-smoked build: `1.12.0-113` (2026-10-09), PASS with the
intermittent scrubbing defect deferred. `1.12.0-114` smoked with six
findings, fixed in `1.12.0-115`. The 115 smoke found three further issues,
fixed in `1.12.0-116`. The 116 smoke closed (2026-10-12), not accepted,
with three Dashboards findings, built since as Dashboards rev 2
(`SMOKE-1.12.0-116.md`). Installed smoke does not change the
design approval registry.

## Awaiting the 1.12.0-116 smoke: smoke 115 findings

- **Dashboards strip** (findings 1-2): inside a dashboard, Back to
  dashboards, Prev / Next through the home's order, and Go to reports set
  apart at the far right; the home shows Go to reports only.
- **Success rate** (finding 3; `docs/REPORTS-CONTRACTS.md` > Success): the
  reports, Study and Dashboards use the yards rule's play set. Smoke: Reports
  > Season > Offense and an offense dashboard read the same success rate.
  A turnover always fails on offense and is a stop on defense, regardless of
  its gain; a wiped-out play does not count. With no judged plays the rate is
  unavailable, not 0%, including Top call and the Formation x Play Type matrix.
- **Button styling:** disabled Prev / Next are grey; New dashboard is neutral.

The full gate passed 158/158 at `af7e48cc` (2026-10-12), zero skips/failures;
the version-only bump is `8bd32ffd`, with `e2e-p0-exit` 20/20. Installer
details and the full smoke checklist are in `SMOKE-1.12.0-116.md`.

## Carried forward for the 1.12.0-116 smoke

Carried from 114:

- **Chart saves only what a play shows** (coach, 2026-10-10;
  `GRIDIRON-IQ-SAVE-CONTRACT.md`). Chart edits a draft; Save (new button,
  stays on the play) and Save & Next store exactly what Chart shows. A unit,
  Special Teams unit or try attempt change is a save that asks first only when
  it would remove values the coach charted (app-filled and already-hidden
  values never ask). Leaving a play with unsaved changes asks Stay / Discard /
  Save: another play, Previous, Next or Previous clip, game or season, a Film
  Room edit of it, closing the window; a typed note counts from its first
  keystroke. The unsaved draft is saved with its game for recovery. Film Room
  locks what a play cannot show and settles each edit. An offensive turnover
  shows our Tackler(s) and missed tacklers on the return; any turnover or
  takeaway shows Opponent Tackler(s). A return tackle never takes the play's
  sack or TFL. Players, the Defense board and Study's Tackler role credit the
  same tackles: the canonical 2025 JV mismatch (#5 41
  vs 40, #7 22 vs 21, #82 8 vs 7) is gone. Existing hidden values are the
  coach's to re-chart: `docs/HIDDEN-VALUES-LIST.md` (50 plays). Smoke: switch
  a charted defensive play to Offense (asks; Cancel keeps it), then a play
  holding only Save & Next values (no prompt); type a note and click another
  play at once; Next clip with unsaved changes; chart an offensive
  interception with our tackler, our missed tackler and their tackler; close
  the window with unsaved changes; reopen after Discard.
- **Dashboards** (coach, 2026-10-10: self-serve reporting; built without a
  comp, so its composition awaits the coach's review; the button is violet). Reports >
  Dashboards: templates, Number / Bar / Share / Game by game / Heat map /
  Table / Leaders widgets, scope, unit and filters, every value film-linked,
  saved with the season. Run % and Pass % read the dashboard's own unit;
  penalty groups and matrix cells count only their own records. Study now groups defensive
  plays by the offense they faced. Smoke: open each template on the real season, add a
  widget, filter to 3rd down, click a bar and a heat-map cell to watch film,
  relaunch and reopen the dashboard.
- **Dashboards rev 2, built since 116** (smoke 116 findings 1-3; coach,
  2026-10-12; `docs/REPORTS-CONTRACTS.md` > Dashboards): a canvas of modules,
  each with its own unit, games and filters, colored by its unit; Open and Edit,
  with Edit on the picker page and in the dashboard; Export, Rename, Duplicate
  and Delete on the picker page; Delete asks for the typed word. Smoke: build
  offense yards per play beside defense yards per play; Edit a template (it
  saves a copy); delete a dashboard. The coach deleted the six rev 1 dashboards
  in 116 (2026-10-12).

Smoke 114 findings, built in 115 (`SMOKE-1.12.0-114.md`, coach findings and
the installed check):

- **Dashboards home** (findings 1-2): one home page that always stays
  reachable, listing saved dashboards like Home's season rows, plus the
  templates. It replaces the head dropdown.
- **Templates are read-only** (finding 3): opening a template shows it; scope,
  unit and filters only change the view; a widget edit asks for a name and
  saves a new dashboard. The template never changes.
- **Segmented control borders** (finding 4): one clean outline on the selected
  segment.
- **Prose** (finding 6): drop explanatory sentences on the new pages.
- **Special Teams accent is teal** (`--gi-cat-6`).
- **Installed-check defects:**
  - heat-map Watch label and cell keys use the column, not the value;
  - penalty ruling, phase and team read as labels;
  - share charts past five values fold the rest into Other, and the legend
    lists every segment shown;
  - negative bars draw left of a zero line;
  - table hover covers the whole row inside the card; "—" sits on the text line;
  - "Row limit" replaces the second "Rows";
  - filter chips use value labels (3rd, Q2);
  - Reports returns to Dashboards after watching film from one;
  - a count tile drops the repeated "N plays" subline;
  - share labels total 100%;
  - Study names its success concept per unit (Stop Rate on defense);
  - the Chart roster grid shows its last row whole.
- **Yards rules** (installed check 10; coach 2026-10-10,
  `docs/REPORTS-CONTRACTS.md` > Yards): built in the reports, Study and
  Dashboards from one owner; yards per play is the same number on every
  surface. Smoke: Week 1 vs St. Peter Lutheran defense reads the same yards
  per play in Reports and Dashboards; a No Gain with Yards blank counts as 0;
  a sack charted with only its result shows in Rushing with its loss; an
  Interception with Yards blank counts as an attempt for 0 (coach,
  2026-10-11).
- **Bar scale** (installed check 14; coach 2026-10-11): Success Rate and Stop
  Rate bars run 0-100%; other metrics scale to the largest bar. Smoke: a
  54% success bar fills about half its track.

## Open defects

Assigned to Codex (coach, 2026-10-12; `docs/CODEX-JOB-2026-10-12.md`): the Old
patterns below except OCR, the renamed HTML export, the empty-roster lock, and a
first security review.

- **A renamed HTML report does not open after saving.** Coach-reproduced for
  Defense Report and Game Report: the default filename works, a changed one does
  not. Treat as a shared export-delivery defect; do not guess the cause.
- **Rapid timeline scrubbing can falsely show "Film unavailable"** (intermittent,
  deprioritized). Installed WebView2 only; reopening loads the same film. Every
  scrubber `input` sets `video.currentTime`, and `VideoController` treats any
  resulting media `error` as missing film.
  Recurred during installed 113 smoke (2026-10-08), Varsity 2026 vs OLV,
  Play 26, clip `20261003_192402`, at 0:04 of 0:16; see
  `SMOKE-1.12.0-113.md` finding 1. Screenshot confirms the unavailable overlay
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

- **Off-gate persistence matrix: one lock fails at HEAD.**
  `node tools/pc-adversarial-matrix.mjs` (not in the gate): "a commit never
  mirrors an EMPTY roster/playbook over a populated one" reports
  `{"roster":0,"calls":1}`. Same result at `76910435` before the 2026-10-04
  startup-import removal. Determine whether the lock is stale (rosters became
  season-owned) or a real empty-roster overwrite.

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

**Raw `innerHTML` writes** (7). HTML built as strings instead of rendered by the
native owner; each one is an escaping risk.
- `js/scoreboard-ocr.js` 4 (OCR is parked)
- `js/auto-detect-screen.js` 2
- `js/play-diagram.js` 1

**Native `alert()`** (1). Use the in-app toast or confirm.
- `js/play-diagram.js` 1: "Select a play first"

**Dialogs outside the overlay spec** (2). They work but miss its focus and Escape
rules; move them to `js/native-overlay-service.js`.
- `js/auto-detect-screen.js` `openReview()` builds its own modal
- `js/play-diagram.js` the diagram editor builds its own modal

**`js/stats-engine.js` size** (6,549 lines). Split by area, with `e2e-parity`
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

- Settings live in localStorage (about 87 call sites): the quota failed once,
  settings do not travel with a season, and nothing syncs them. Blocks the
  mobile companion.
- Chromium harnesses prove behavior and geometry, not installed WebView2
  rendering or visual fidelity; every installer needs an installed smoke.
