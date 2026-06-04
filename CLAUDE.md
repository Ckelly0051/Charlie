# GridIron IQ — Architecture & Reference

> Formerly "Football Film Analyzer". The product is now branded **GridIron IQ**;
> the built bundle filename remains `football-film-analyzer.html` and the git
> branch remains `claude/football-film-analyzer-GRiCW` (renaming those would
> break the deploy/build path, so they're intentionally unchanged).

## What This Is

A browser-based football film analysis tool for coaches. Load game film, mark plays, tag them with formation/type/result/etc., and get stats & tendencies. Runs entirely in the browser — no server required for core functionality.

**Live URL**: https://ckelly0051.github.io/Charlie/
**Branch**: `claude/football-film-analyzer-GRiCW`

## Page Layout (single-column, top-to-bottom)

The app is a **single scrollable column**, not a video+sidebar split:
- **Top bar** — sticky, file load + actions.
- **Video section** (`.video-section`) — **sticky** below the top bar so the
  film stays in view while you tag. Contains the video, playback controls,
  the timeline strip, and the **play-control bar** (`.video-play-controls`):
  Mark Start · Mark End · **Clear Tags** · **Delete Play** · play selector
  (filling the dead space under the player). The Offense/Defense/ST unit toggle
  leads the right (tag) column.
- **Tag section** (`.tag-section`) — holds the entire tagging workflow (mark
  controls, play selector, chip-based tag form, notes, OCR/auto-detect). No
  popup/sidebar — tagging is always on-page.
- **Settings drawer** (`.settings-drawer` / `#settingsDrawer`) — slides in from
  the right (toggled by the top-bar "Settings" button, the mobile "More" tab,
  Esc, scrim, or its × button). Houses secondary panels: Game Info, Roster,
  Version History, Playlist, Filter Plays, Drawing Tools. Backed by
  `.drawer-scrim`. Wired in `js/ui-polish.js` `_initSidebarDrawer()`.
- **Mobile** — bottom tab bar (Video / Tag / Stats / More) from
  `_initBottomTabs()`; "Tag" scrolls to the form, "More" opens the drawer.

### Responsive layout modes

- **Widescreen (≥1100px)** — two-column grid: video sticky on the left
  (`minmax(0,1fr)`), tag form scrolling on the right (`clamp(430px,33vw,580px)`).
  CSS block: "TWO-COLUMN LAYOUT" at the end of `css/styles.css`.
- **Narrow / tablet (<1100px)** — single-column stack: sticky video on top
  (`min(54vh,620px)`), full-width tag form below. CSS block: "SINGLE-COLUMN
  LAYOUT".
- **Mobile (≤800px)** — same stack with shorter video (38vh), bottom tab bar,
  larger touch chips.

## Project Structure

```
index.html                    # Main app shell (modular, uses ES modules)
football-film-analyzer.html   # Single-file build (self-contained, for gh-pages)
build.sh                      # Builds single-file bundle from modules
css/styles.css                # All styles (dark theme, chip UI, panels)
assets/icons.svg              # SVG sprite for all icons

js/
├── app.js                    # Bootstrap — wires all modules, keyboard shortcuts
├── video-controller.js       # HTML5 video playback (play/pause/seek/step)
├── canvas-overlay.js         # Drawing annotations on video frames
├── play-tagger.js            # Play CRUD + chip-based tag form (ChipField)
├── roster-manager.js         # Team roster + per-play player attribution (quick-pick)
├── play-filter.js            # Filter plays by tag values
├── play-detector.js          # Motion-based auto-detection of play boundaries
├── clip-analyzer.js          # Heuristic auto-tagging (centroid tracking)
├── vision-analyzer.js        # Claude Vision API integration
├── backend-client.js         # Local Python CV server client (optional)
├── quick-chart.js            # Keyboard-only rapid charting mode
├── playlist-manager.js       # Multi-clip video session management
├── multi-angle.js            # Dual-camera sync (toggle/SBS/PiP view modes)
├── stats-engine.js           # Stats aggregation (run/pass, efficiency, EPA, defensive)
├── advanced-metrics.js       # Expected Points Added calculations
├── heat-maps.js              # Visual heat map generation
├── visualizations.js         # SVG charts: field-zone success, yardage spray, quarter mix
├── storage.js                # Project save/load (JSON + localStorage) + CSV import
├── history-manager.js        # Unified undo/redo (play data + canvas)
├── version-manager.js        # Named save points
├── notes-manager.js          # Per-play text notes
├── scoreboard-ocr.js         # OCR region for scoreboard reading
├── suggestion-engine.js      # Pattern-based tag suggestions
├── cutup-exporter.js         # Stitch filtered plays into cut-up video
├── season-manager.js         # Multi-game season aggregation
├── call-sheet-builder.js     # Play call sheet generation
├── ui-polish.js              # Misc UI enhancements
├── wizard.js                 # Step-by-step onboarding wizard
├── custom-fields.js          # User-defined tag fields (CustomFieldsManager)
├── play-diagram.js           # Per-play X's & O's diagram editor (PlayDiagram)
└── tag-workspace.js          # Tag workspace utilities (dead code — not wired)

tools/
├── generate-sample-report.mjs  # Generates dummy-data analytics report via real StatsEngine
└── screenshot-report.mjs       # Puppeteer screenshots of the sample report

server/                       # Optional local Python backend (YOLO-based)
├── app.py                    # Flask server
├── analyzer.py               # Video analysis with OpenCV/YOLO
├── start.sh                  # Server launcher
└── README.md                 # Server setup instructions
```

## Core Data Model

### Play Object
```javascript
{
  id: number,
  timestamp: { start: number, end: number },  // seconds in video
  clipId: string | null,                       // for multi-clip mode
  tags: {
    down: '',           // '1' | '2' | '3' | '4'
    distance: '',       // yards to go (numeric string)
    quarter: '',        // 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'OT'
    fieldSide: 'own',   // 'own' | 'opp'
    yardLine: '',       // 1-50
    formation: '',      // MULTI-SELECT (offense). One or more of 'Shotgun' | 'Under Center' | 'Pistol' | 'I-Form' | 'Singleback' | 'Trips' | 'Spread' | 'Split Back' | 'Single Wing' | 'Empty' | 'Wildcat' | 'Goal Line', stored as a " + "-joined string (e.g. 'Pistol + Spread'). Analytics split on " + " and attribute the play to each component formation. ChipField({multi:true}); StatsEngine.splitFormations() is the canonical splitter.
    personnel: '',      // '00'-'23' | 'Jumbo' | 'Goal Line'
    runPass: '',        // 'Run' | 'Pass' | '' — explicit run/pass classifier, authoritative for all run/pass analytics. Auto-filled from unambiguous playType; coach sets it for RPO/Play Action/Trick. StatsEngine.isRun()/isPass() are canonical and fall back to playType-string inference when runPass is blank (legacy data).
    playType: '',       // 'Run Inside' | 'Run Outside' | 'Screen' | 'Short Pass' | 'Medium Pass' | 'Deep Pass' | 'Play Action' | 'RPO' | 'Trick Play'
    result: '',         // 'Gain' | 'Loss' | 'No Gain' | 'Incomplete' | 'Interception' | 'Touchdown' | 'Sack' | 'Fumble' | 'Penalty' | 'Punt' | 'Field Goal' | 'Kneel' | 'Spike'
    yardage: '',        // integer (negative for loss)
    hash: '',           // 'Left' | 'Middle' | 'Right'
    defFront: '',       // '4-3' | '3-4' | '4-4' | '5-2' | '4-2-5' | 'Nickel' | 'Dime' | 'Quarter' | '4-6'
    coverage: '',       // 'Cover 0'-'Cover 6' | 'Man' | 'Zone'
    blitz: '',          // 'A-Gap' | 'B-Gap' | 'Edge' | 'DB Blitz' | 'Zone Blitz'
    driveNumber: '',    // auto-incremented
    unit: 'offense',    // 'offense' | 'defense' | 'special' — drives tag-form layout
    stType: '',         // 'Kickoff' | 'Kick Return' | 'Punt' | 'Punt Return' | 'Field Goal' | 'XP' | '2-Pt' | 'Onside' | 'Fake'
    players: {},        // { ballCarrier, passer, receiver, tackler, kicker, returner } -> jersey # strings
    grades: {},         // same role keys -> integer (-2 to +2)
    custom: []          // freeform string array
  },
  notes: '',
  analysis: null        // AI analysis result, if any
}
```

### Minimum Fields for Useful Stats
1. **playType** + **result** + **yardage** — run/pass ratio, success rate, averages
2. **down** + **distance** — conversion rates, situational analysis
3. **formation** — tendency breakdowns
4. Everything else (defense, personnel, field position) is bonus detail

## Player Stats (Roster + Attribution)

Box-score style per-player stats, modeled on Hudl/QwikCut:

1. **Roster panel** (`roster-manager.js`): add players (jersey #, name, position, side O/D/B). Stored in `localStorage` (`ffa_roster`) and in project saves (`roster` key, schema v4).
2. **Roster import**: CSV file upload or paste-from-spreadsheet with smart header detection (`#`/`Num`/`Jersey` → num, `Name`/`Player` → name, `Pos`/`Position` → pos, `Side`/`Unit` → side). Delimiter auto-detected (tab/comma/semicolon). No external libraries.
3. **Per-play attribution**: the tag form has a **Players** section with four roles — Ball Carrier, Passer, Receiver, Tackler. Click a role input to make it active, then tap a roster **quick-pick chip** (filtered by side of ball) to stamp the jersey #. Saved to `play.tags.players`.
4. **Per-play grading**: each role has a grade select (++/+/0/−/−−, stored as -2 to +2 in `play.tags.grades`). Average grades appear in the individual stats tables.
5. **Aggregation** (`stats-engine.js` `_individualStats`): rolls role assignments into rushing (att/yds/avg/long/TD/fum/grade), passing (cmp-att/pct/yds/TD/INT/sack/grade), receiving (rec/yds/long/TD/grade), and tackles (tkl/sack/TFL/grade).
6. **Output**: dashboard renders four individual-stat tables; jersey #s map to "#22 Smith" via the roster. **Click any player row to launch a film cut-up** (`_watchPlayer` → `CutupPlayer`).
7. **Export**: CSV includes Ball Carrier / Passer / Receiver / Tackler + grade columns.

Quick Chart mode also writes `play.tags.players` for the same roles.

### Film Cut-Ups (`cutup-player.js`)
`CutupPlayer` plays a set of plays back-to-back in the existing `<video>`:
seek to each play's start, run to its end, auto-advance to the next. A
floating banner shows label + position with Prev/Next/Exit (←/→/Esc).
Triggered by clicking a player row in the stats dashboard. Distinct from
`cutup-exporter.js`, which renders a downloadable stitched video file.

### Season Player Roll-Up (`season-manager.js`)
The Season modal aggregates plays across loaded game files. Because
`StatsEngine.compute(allPlays)` already produces `individuals`, the season
view renders the same four box-score tables as **season totals**. Player
names come from a merged roster across all loaded games' saved `roster`
arrays plus the live roster (`_mergeRoster` → `statsEngine._seasonLabels`).
Included in the exported season HTML report.

## Import / Export

### Play Import (CSV / Hudl)
Accessible via More → Import Plays. Supports:
- CSV file upload or paste-from-spreadsheet
- Auto-detects delimiter (tab/comma/semicolon)
- Smart column mapping with Hudl aliases (`ODK`→playType, `GnLs`→yardage, `Dn`→down, `Dist`→distance, `Off Form`→formation, etc.)
- Interactive column remapping UI before import
- Preview of first 5 rows
- Creates play objects without timestamps (for stats-only migration from other tools)

Methods in `StorageManager`: `importPlaysFromText(text)` parses CSV and returns column mapping; `applyPlayImport(parsed)` creates plays.

### Roster Import
In the Roster panel: Import button reveals a paste area + file chooser. `RosterManager.importFromText(text)` handles parsing with header detection.

### CSV Export
`StorageManager.exportCsv()` — all plays with full tag fields including the
multi-select Formation (`"Pistol + Spread"`), the **Run/Pass** column, player
attribution, and grades. CSV import recognizes a `Run/Pass` (or `RP`) column.

### HTML Report Export
`StorageManager.exportHtmlReport(statsEngine)` — styled standalone HTML with all stats sections.

### Call Sheet / Practice Script (`call-sheet-builder.js`)
More → **Call Sheet** opens a builder that buckets tagged plays by situation
(Openers, 1st & 10, 2nd/3rd & long/med/short, 4th down, red zone, goal line,
backed up, 2-min, 4-min), ranks each bucket by **EPA** (or yards / recency),
and renders a printable document in three layouts: **Wristband** (3-up compact,
4×6in page), **Full Call Sheet** (letter, 2-col), and **Practice Script**
(letter table with a blank Result column to write in).

Each play shows its **call** — formation + personnel + play type, plus the
coach's per-play `notes` in quotes (where the real call like "Power R 34 Lead"
is typically typed) — and a compact **performance tag** (`TD 48`, `+11`, `Inc`,
`Sack -6`) so an EPA-ranked sheet shows why a call is ranked. Output opens in a
new window and auto-triggers print-to-PDF. `_playLabel` / `_playResult` build
the text; `_gather(rankMode)` does the bucketing + ranking.

## Opponent Scouting Mode

Set "Film shows" to **Opponent Scout** in Game Info to reveal the scouting panel.

**Workflow**: tag opponent film normally (their formations, play types, results), then click "Generate Scout Report" for a tendencies-focused dashboard:
- Run/pass ratio and avg yards overview
- Formation tendencies with run/pass split per formation
- Down & distance situation tendencies (top 15)
- Defensive front and coverage frequency (when tagging their D)
- Red zone and third-down conversion rates
- Exportable as standalone HTML scouting report

Methods in `StatsEngine`: `generateScoutReport()`, `renderScoutReport()`, `_exportScoutReport()`.

## Multi-Angle Video Sync (`multi-angle.js`)

Load two camera angles (e.g. sideline + end zone) time-locked together.

**Architecture**: master/follower pattern — the primary `VideoController` drives
time; `MultiAngle` mirrors play/pause/seek/rate to `<video id="videoPlayer2">`
with drift correction (threshold 0.15 s).

**View modes** (cycled via `#angleViewMode` select):
- **Toggle** (default on narrow screens) — z-index stacking, `V` key or
  `btnSwapAngle` swaps which angle is on top.
- **Side-by-Side** (default on ≥1100 px) — flex 50/50, both visible, active
  angle gets a blue outline.
- **PiP** — angle 2 overlays angle 1 at 28 % in the bottom-right corner.

**HTML structure** (inside `#videoContainer`):
```html
<div class="angle-wrapper" id="angleWrapper1">  <!-- primary video + canvas -->
<div class="angle-wrapper angle-wrapper-2" id="angleWrapper2">  <!-- secondary -->
```
`CanvasOverlay` attaches to `#angleWrapper1` (not `#videoContainer`) so the
canvas sizes correctly in SBS mode where each wrapper is 50 % width.

**Controls strip** (`.angle-controls`, between playback controls and timeline):
`+ Angle` button, file input, view-mode select, swap button (⇄), sync-offset
number input, remove button (✕). All hidden until angle 2 is loaded.

**Events**: `view-changed`, `angle-loaded`, `angle-removed` — `App` listens to
trigger `canvas._syncSize()` via `requestAnimationFrame`.

**Key method**: `loadAngle2(file)`, `removeAngle2()`, `swapActive()`,
`setViewMode(mode)`, `_syncTime()`.

Cleans up on `video-unloaded` (primary video removed → angle 2 auto-removed).

## Tag Form UI (Chip-Based)

The tag form uses **chip buttons** instead of dropdowns. Each field is a `div.pick-group` containing `button.pick` elements. The `ChipField` wrapper class (in `play-tagger.js`) provides `.value` get/set and `change` events so the rest of the code interacts with chip groups identically to native `<select>` elements.

**Multi-select chips**: `ChipField(el, { multi: true })` allows multiple chips
active at once; `.value` then returns a `" + "`-joined string (e.g. `"Pistol +
Spread"`). Only **Formation** is multi-select today (a QB can be Pistol AND
Spread). The string interface is unchanged, so all consumers still treat it as
a plain string; analytics split on `" + "` and attribute the play to each
component (see `StatsEngine.splitFormations`).

### Unit Toggle (Offense / Defense / Special Teams)

A per-play segmented toggle (`#tagUnit`) at the top of the form drives the
**layout** — it reorders/collapses side-specific fields rather than hiding
data. Stored on `play.tags.unit`; new plays default from the Game Info "Film
shows" perspective via `tagger.defaultUnit` (set by `App._bindScoutMode`).

Only Formation/Personnel (offense) and Def Front/Coverage/Blitz (defense) are
side-specific; everything else (Play Type, Result, Yardage, Down & Distance,
Players, situational) is shared. The toggle:
- **Offense**: offense group leads; **defense group collapses** into a one-tap
  "Defense Faced" header (still chartable, e.g. offense vs Cover 2); ST hidden.
- **Defense**: defense group leads (CSS `.mode-defense .group-defense{order:-1}`);
  offense group collapses into "Offense"; ST hidden.
- **Special Teams**: ST group (ST Play Type + Kicker/Returner) shows; offense &
  defense groups hidden.

`PlayTagger.applyUnitMode(unit)` toggles `.mode-*` on `#tagForm` and
`.is-secondary` / `.is-hidden` / `.collapsed` on the `.tag-group` wrappers
inside `.tag-side-groups` (a flex column so `order` can reorder them). Group
headers (`.tag-group-head`) are clickable to expand/collapse the secondary side.

**Field order** — follows the chronological order a coach tags a play
(pre-snap → post-snap), not a "most-important-first" order:
1. Unit toggle — Offense / Defense / Special Teams
2. Down & Distance — 4 chips + input (known pre-snap; usually auto-filled)
3. Side groups — Offense (Formation **[multi-select]**, Personnel) / Defense (Def Front, Coverage, Blitz) / Special Teams (ST Play Type, Kicker, Returner) — the alignment you read pre-snap
4. Run / Pass — 2 chips (`#tagRunPass`, `play.tags.runPass`). The authoritative run/pass classifier. Auto-fills when an unambiguous Play Type is picked (Run* → Run; Pass/Screen → Pass); left blank for RPO / Play Action / Trick for the coach to set. `StatsEngine.isRun()/isPass()` consume it (fallback to playType-string inference for legacy plays).
5. Play Type — 9 chips (what they ran)
6. Result — 13 chips
7. Yardage — number input with +/− buttons
8. Players — 6 role inputs (BC/Passer/Receiver/Tackler/Kicker/Returner) + grade selects + quick-pick chips
9. Play Notes — textarea (the real call, e.g. "Power R 34 Lead")

**Collapsed section** ("Situation & Details"):
Hash, Quarter, Field Position, Drive, Custom Tags

**Navigation bar**: ← Prev | Save & Next → | Skip

Special-teams stats (return game, kicking/punting) roll up in
`StatsEngine._individualStats` from `players.returner` / `players.kicker` keyed
on `stType`, and render as extra tables in the stats dashboard.

### Clear Tags vs Delete Play (play-control bar)

Two distinct destructive actions live in `.video-play-controls`:
- **Clear Tags** (`PlayTagger.clearCurrentTags`) — resets the current play's
  tag values + notes back to blank but keeps the play segment and the loaded
  video, so you can re-tag the same snap. Always also clears the on-screen form
  (even when no play is selected) so the button has an obvious effect. Shows the
  confirmation modal first.
- **Delete Play** (`PlayTagger.deleteCurrentPlay`) — removes the play **and**
  unloads the video from the player (`VideoController.unloadVideo()` revokes the
  object URL, clears `<video>`, restores the placeholder). The **source file on
  disk is never touched** — browsers can't delete local files; this only clears
  the player. Confirms first.
- Both fall back to the play-selector value when `currentPlayId` is null (plays
  loaded/imported without an explicit re-select).

### In-app confirmation modal

`PlayTagger._confirmDialog(message, confirmLabel)` builds a lightweight modal
(`#ffaConfirmModal`, `.ffa-confirm-*` CSS) and returns a `Promise<boolean>`.
**Use this instead of `window.confirm()`** for in-form destructive actions:
browsers suppress repeated native `confirm()` dialogs ("prevent additional
dialogs"), which silently returned `false` and made Delete look broken. Enter /
the confirm button resolve true; Esc / Cancel / backdrop resolve false; keydown
is captured so the app's tagging shortcuts don't fire underneath.

### Tagging-speed & coaching tools

- **Loop / A-B** (`VideoController`): `btnLoop` toggles looping the selected
  play (`currentPlayRegion`, kept synced by App on `play-selected`); `A`/`B`
  set a custom loop region. `timeupdate` jumps back to `loopRegion.start`.
- **Same as Last + templates** (`PlayTagger`): `copyFromPrevious()` carries
  `SCHEME_KEYS` (formation, personnel, run/pass, play type, defense, hash) from
  the prior play; named templates persist in `localStorage ffa_play_templates`
  (`saveTemplate`/`applyTemplate`/`deleteSelectedTemplate`).
- **Custom tag fields** (`custom-fields.js`): coach-defined categories
  (chips or text). Defs in `localStorage ffa_custom_fields`; per-play values in
  `play.tags.customFields`. Inputs reload via the `tagger.onLoadForm` hook;
  CSV export appends a column per field.
- **Play diagram** (`play-diagram.js`): per-play X's & O's stored as normalized
  shapes on `play.diagram` (saved with the project). `PlayDiagram.draw()` /
  `toDataURL()` are static renderers reused by the tag-form preview and the
  Call Sheet (thumbnails on the Full layout).
- **Visualizations** (`visualizations.js`): SVG field-zone success strip,
  yardage spray scatter, and quarter run/pass mix, injected into the stats
  dashboard. Self-contained run/pass + success helpers (mirror StatsEngine).

> **Build note**: new JS modules must be added to the `build.sh` file list
> *and* imported in `app.js` (or their consuming module) — the modular
> `index.html` needs the import; the bundle needs the build-list entry.

### Video robustness (freeze fixes)

`VideoController` guards against the common "frozen player" causes: `play()`
promise rejections are caught; scrubbing pauses playback then resumes on
release (avoids seek-queue buildup); `waiting`/`stalled`/`seeked`/`error`
events toggle an `is-buffering` class that shows a spinner; the `<video>` has
`playsinline`. Native `<select>` arrows are replaced with a larger custom SVG
chevron (cascade-proofed with `!important` against class-based `background`
shorthands).

### Shortcuts Legend
A **Shortcuts** button in the top bar (always visible, even on the first screen
before a video loads) and the **`?`** key open a keyboard-shortcuts legend
modal (`#shortcutsModal`, wired by `App._bindShortcuts`). It groups shortcuts by
Playback / Tagging / Drawing / General. While open it swallows other keys; Esc,
the × button, or a backdrop click closes it.

### Keyboard Shortcuts (active when a play is selected)
| Key | Action |
|-----|--------|
| R, O, S, P, M, D, A, Q, X | Play type (Run In, Run Out, Screen, Short, Med, Deep, PA, RPO, Trick) |
| G, L, N, I, T, W, U, F, E, K | Result (Gain, Loss, None, Inc, TD, Sack, INT, Fum, Pen, Punt) |
| C | Cycle unit toggle (Offense → Defense → Special Teams) |
| 1-9 | ST play type (only in Special Teams mode) |
| Shift+1-4 | Down number |
| Enter | Save & advance to next play (carries down & distance forward) |
| Space | Play/Pause video |
| V | Swap multi-angle view (when angle 2 loaded) |
| [ / ] | Mark play start / end |
| 1-6 | Drawing tools (when no play selected) |

### Auto Down & Distance
When **Auto down & distance** is on (checkbox above the nav bar; persisted in
`localStorage` as `ffa_auto_dd`), advancing to the next *untagged* play
pre-fills its down, distance, and field position from the previous play's
result (`PlayTagger.computeNextSituation` / `applyNextSituation`). First downs
reset to 1st & 10 (goal-to-go aware); 4th-down stops and possession-ending
results (TD, turnover, punt, FG, penalty) leave the next play blank for a fresh
start. Existing tags are never overwritten. Field position only advances for the
offense unit (yardage is from the offense's perspective).

### Quick Chart Mode
A separate keyboard-only overlay (toggled via top bar button) for power users who want to tag 60 plays in ~5 minutes. Adds yardage via number keys, player numbers, auto-advance on Enter. See `js/quick-chart.js` header comment for full key map.

## Claude Vision API Integration

**File**: `js/vision-analyzer.js`

Sends video frames to Claude's vision API for AI-assisted tagging. Currently a **suggestion tool** — accuracy is limited by what a general vision model can determine from static frames. Manual tagging is the primary workflow.

**How it works**:
1. Extracts 8 JPEG frames at key moments (pre-snap through result)
2. Sends frames with a detailed football analysis prompt to Claude
3. Extended thinking enabled (10K token budget) for reasoning
4. Response parsed into `{ tags, confidence, reasons }` shape
5. Values validated against allowed enums with fuzzy matching

**Config** (set in Game Info panel):
- API key stored in `localStorage` only (never in project save files)
- Model selector: Opus (most accurate, ~$0.60/play) vs Sonnet (faster, ~$0.13/play)
- Default: `claude-opus-4-6` with `anthropic-version: 2025-04-15`

**Key lesson**: General-purpose vision models cannot reliably auto-tag football plays. Professional tools (Hudl, Catapult) use either human taggers or custom ML models trained on millions of labeled plays. Our AI integration works best as a suggestion engine, not a definitive tagger.

## Build System

`build.sh` concatenates all JS modules into `football-film-analyzer.html`:
- Strips `import`/`export` statements
- Inlines CSS and SVG sprite
- Rewrites SVG `href` paths

**Important**: All JS files share one function scope in the built bundle. Variable name collisions between files will cause runtime errors. Each file's top-level `const`/`let` declarations must be unique across the entire codebase.

### Deploy to GitHub Pages

The live site serves from the **`gh-pages` branch**, NOT the feature branch.
After building, deploy by copying the bundle into both `index.html` and
`football-film-analyzer.html` on `gh-pages` (a git worktree is the clean way),
then push. Pushing only to the feature branch does **not** update the live URL.

## Offline / Self-Contained Distribution

**Current status: the app is already ~95% self-contained.**
`football-film-analyzer.html` is a single ~640 KB file with all CSS, JS, and
icons inlined, and **no `type="module"`**, so it can be downloaded and opened
directly via `file://` (double-click) and runs **fully offline**. The core
workflow — load local video, mark/tag plays, stats, EPA, heat maps, cut-ups,
call sheets, roster, CSV/HTML export — makes **zero network calls**.

The only runtime network touches are **optional** features:
- **Claude Vision auto-tagging** → `api.anthropic.com` (needs API key; by design).
- **Local CV backend** → `127.0.0.1` (optional localhost server, not internet).
- **Scoreboard OCR** → lazy-loads `tesseract.js` from `cdn.jsdelivr.net` on first
  use. **This is the one core-ish feature that breaks offline.**

(`www.w3.org` references are SVG/XML namespaces — identifiers, never fetched.)

### Planned: Option 1 — PWA install + offline cache (chosen, execute eventually)

The agreed direction (deferred until current feature work wraps) is to make the
app an installable, guaranteed-offline PWA **without** abandoning the
no-build/single-file ethos:
1. **Web app manifest** (name, icons, `display: standalone`, theme color) so
   browsers offer "Install GridIron IQ" (desktop + mobile), with an
   app icon and its own window.
2. **Service worker** that precaches the app shell so it's guaranteed available
   offline after the first load (cache-first for the app, network-only for the
   optional API/backend calls).
3. **"Download offline copy" button** in-app that saves `football-film-analyzer.html`
   for true file:// portability.
4. **Graceful OCR degradation**: when offline (or the CDN is unreachable), the
   scoreboard-OCR feature should show a friendly "needs internet" note instead
   of failing silently. (Fully bundling Tesseract + WASM + lang data ≈ 10–15 MB
   was considered and rejected for now to keep the package lean.)

Not chosen: bundling Tesseract locally (size), and a native Electron/Tauri
installer (adds a build toolchain + code-signing, against the current design).

## Stats Engine Dependencies

The stats engine (`js/stats-engine.js`) computes:
- Run/pass ratio, play type distribution
- Success rate, average yards per play/type/formation
- Down & distance conversion rates
- Formation tendencies
- Defensive analytics (see below)
- Red zone, goal line, backed-up situational stats
- Expected Points Added (EPA) via `js/advanced-metrics.js`
- Per-player grades (avg from play.tags.grades)
- Opponent scouting report (formation/down tendencies with run/pass splits)

### Defensive Analytics (`_defensiveStats` / `_renderDefensive`)

Computes and renders a full defensive breakdown from the existing tagged fields
(`defFront`, `coverage`, `blitz`, `result`, `yardage`). Appears in the stats
dashboard between Tendencies and Personnel. Only renders when defensive data is
present.

**Summary cards (two rows)**:
- **Havoc Rate** — (sacks + TFL + turnovers) / total plays. TFL = negative
  yardage plays excluding sacks.
- Sacks (with sack yards), TFL, Turnovers (INT/Fum split)
- Blitz Rate (blitz-tagged plays / total), Blitz Havoc % (havoc plays when
  blitzing), Forced Incompletions, 3-and-Outs forced

**Breakdown tables**:
- **Defensive Front** — per front: plays, run/pass faced, yards allowed, avg,
  stop% (= 1 − offensive success rate), havoc%
- **Coverage** — per coverage: plays, completions, incompletions, INTs, sacks,
  yards, avg, stop%
- **Blitz Analysis** — per blitz type: plays, sacks, havoc%, avg yards, stop%
- **Front by Situation** — front usage split on early downs (1st, 2nd & short)
  vs passing downs (2nd & long, 3rd, 4th)

**Stop%** is the inverse of offensive success rate: the percentage of plays
where the defense held the offense below the down-adjusted success threshold
(1st: <50% of distance, 2nd: <70%, 3rd/4th: didn't convert).

Included in the text export (`_exportStats`). The scout report
(`generateScoutReport`) also shows front/coverage frequency but without the
per-scheme success metrics — the defensive analytics section is the deep dive.

## Key Decisions & Lessons

1. **Auto-tagging accuracy**: Tried three approaches — in-browser heuristics (poor), local YOLO server (marginal), Claude Vision API (functional but inaccurate for coaching use). Manual chip-based tagging is the primary workflow. **Play Tagger panel order** reflects this: Mark Start/End (primary) → play selector → tag form → "More tools" (OCR/suggestions) → a collapsed "Auto-Detect Plays (experimental)" section at the bottom. Auto-detect was demoted from the top since it isn't reliable yet.

2. **API key security**: Stored in `localStorage`, never in project JSON files. Uses `type="password"` input. Travels direct from browser to Anthropic API via `anthropic-dangerous-direct-browser-access` header.

3. **Tag value validation**: All enum fields validated against exact `<option>`/chip values. Fuzzy matching handles case/format differences. Non-matching values are dropped with console warning. This prevents silent dropdown failures and stat corruption.

4. **Unified undo/redo**: `HistoryManager` handles both play data changes and canvas annotations through a single Ctrl+Z/Y interface with fallback callbacks.

5. **Single-file deployment**: The app deploys to GitHub Pages as one self-contained HTML file. No build tools, no dependencies, no server required.

6. **No external libraries**: All parsing (CSV, roster import) uses pure browser JS. No SheetJS, Papa Parse, etc. This preserves the single-file no-dependency design.

7. **Event delegation for modals**: Season and import modals use document-level click delegation with `e.target.id` checks. Don't add `stopPropagation()` on modal containers — it breaks the delegated button handlers.

8. **Never trust `window.confirm()` for in-form actions**: browsers suppress repeated native dialogs, returning `false` and making actions silently no-op. Use `PlayTagger._confirmDialog()` (in-app modal) instead.

9. **Explicit > inferred classification**: run/pass was guessed from the play-type string, which broke on RPO/Play Action/Screen. The explicit `runPass` field is now authoritative (`StatsEngine.isRun()/isPass()`), with string inference kept only as a legacy fallback. When a tag drives core analytics, prefer an explicit field over parsing another field.

10. **Multi-value tags as delimited strings**: multi-select Formation stores `"A + B"` rather than switching the field to an array — this keeps every string consumer (save, CSV, call sheet, display) working unchanged. Analytics split on `" + "` and attribute the play to each component (percentages can exceed 100%, which is correct for overlapping looks). `StatsEngine.splitFormations()` is the canonical splitter.

11. **Backward compatibility by fallback**: new tag fields (`runPass`, multi-formation) degrade gracefully for plays/saves that predate them — empty `runPass` falls back to string inference; a single-formation string is just a one-element split. No schema migration needed.
