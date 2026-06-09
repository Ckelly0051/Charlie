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
- **Film Room play grid** (`.play-grid-section` / `#playGridSection`,
  `js/play-grid.js`) — a compact table of every play in the open game, co-equal
  with the video (Hudl-style). Sits between the video section and the tag
  section; hidden until the game has plays. Row click → `tagger.selectPlay()`
  (seeks / switches clip); current play highlighted + kept in view. A visible
  chip filter bar (Unit / Down / Run-Pass / TD / TO / Pen / Untagged — AND
  across groups, OR within) with an "X of Y" count, plus row checkboxes and a
  **▶ Watch** button that plays the selection (or the filtered set) as a
  `CutupPlayer` cut-up; with no video loaded it falls back to selecting the
  first play. Collapsible (header click), persisted in
  `localStorage ffa_film_room_collapsed`; defaults collapsed below 1100px.
  Refresh: tagger `play-created/updated/deleted` events + an explicit
  `playGrid.refresh()` from `StorageManager._deserialize` / `_clearForNewGame`.
  Its quick filters are intentionally independent of the drawer's "Filter
  Plays" panel (PlayFilter keeps driving the cut-up exporter).
- **Tag section** (`.tag-section`) — holds the entire tagging workflow (mark
  controls, play selector, chip-based tag form, notes, OCR/auto-detect). No
  popup/sidebar — tagging is always on-page.
- **Settings drawer** (`.settings-drawer` / `#settingsDrawer`) — slides in from
  the right (toggled by the top-bar "Settings" button, the mobile "More" tab,
  Esc, scrim, or its × button). Houses secondary panels: Game Info, Roster,
  Version History, Playlist, Filter Plays, Drawing Tools. Backed by
  `.drawer-scrim`. Wired in `js/ui-polish.js` `_initSidebarDrawer()`.
- **Mobile** — bottom tab bar (Video / Stats / Self-Scout / More) from
  `_initBottomTabs()`; "Stats" opens the dashboard, "Self-Scout" opens the
  self-scout report, "More" opens the drawer. (The tag form is always on-page,
  so a dedicated "Tag" tab was dropped in favor of the analytics shortcuts.)

### Responsive layout modes

- **Widescreen (≥1100px)** — two-column grid: video sticky on the left
  (`minmax(0,1fr)`), tag form scrolling on the right (`clamp(430px,33vw,580px)`).
  CSS block: "TWO-COLUMN LAYOUT" at the end of `css/styles.css`. The Film Room
  play grid joins the **left column under the video** via `grid-template-areas`
  (`"video tags" "grid tags"`, in the later "FILM ROOM" CSS block, which must
  stay after the TWO-COLUMN block to win the cascade).
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
├── play-filter.js            # Filter plays by tag values (drawer panel; drives cut-up exporter)
├── play-grid.js              # Film Room play grid (PlayGrid): click-to-seek rows, chip filter bar, bulk Watch
├── play-detector.js          # Motion-based auto-detection of play boundaries
├── clip-analyzer.js          # Heuristic auto-tagging (centroid tracking)
├── vision-analyzer.js        # Claude Vision API integration
├── backend-client.js         # Local Python CV server client (optional)
├── quick-chart.js            # Keyboard-only rapid charting mode
├── playlist-manager.js       # Multi-clip video session management
├── multi-angle.js            # Dual-camera sync (toggle/SBS/PiP view modes)
├── charts.js                 # Pure-SVG chart primitives (donut, gauge, bars, sparkline, game flow)
├── stats-engine.js           # Stats aggregation (run/pass, efficiency, EPA, defensive)
├── advanced-metrics.js       # Expected Points Added calculations
├── heat-maps.js              # Visual heat map generation
├── visualizations.js         # SVG charts: field-zone success, yardage spray, quarter mix
├── storage-backend.js        # Storage seam: BrowserBackend (localStorage+IndexedDB+File System Access) / TauriBackend (native files) + backup ring
├── season-store.js           # Season-as-project data model; delegates persistence/backups to a StorageBackend
├── demo-season.js            # DemoSeason.build() — deterministic fully-tagged sample season for onboarding (empty-state)
├── storage.js                # Save/load bridge (live tagger <-> season store) + snapshots/restore + CSV import
├── history-manager.js        # Unified undo/redo (play data + canvas)
├── version-manager.js        # Named save points
├── notes-manager.js          # Per-play text notes
├── scoreboard-ocr.js         # OCR region for scoreboard reading
├── suggestion-engine.js      # Pattern-based tag suggestions
├── cutup-exporter.js         # Stitch filtered plays into cut-up video
├── season-manager.js         # Season view: game switcher + aggregate stats + progression (over season-store)
├── call-sheet-builder.js     # Play call sheet generation
├── season-library.js         # Team hub front door: team card + setup, seasons list, schedule view, demo, Get Started checklist
├── ui-polish.js              # Misc UI enhancements (incl. empty-state Add Video/Folder CTA)
├── wizard.js                 # Step-by-step onboarding wizard (dormant; default-dismissed)
├── custom-fields.js          # User-defined tag fields (CustomFieldsManager)
├── play-diagram.js           # Per-play X's & O's diagram editor (PlayDiagram)
└── tag-workspace.js          # Tag workspace utilities (dead code — not wired)

tools/
├── generate-sample-report.mjs  # Generates dummy-data analytics report via real StatsEngine
├── screenshot-report.mjs       # Puppeteer screenshots of the sample report
├── e2e-onboarding.mjs          # Headless onboarding regression harness. ALWAYS run before
│                               # deploying UI/onboarding/library changes:
│                               #   bash build.sh && node tools/e2e-onboarding.mjs
│                               # Drives the BUILT bundle through first-run → team setup →
│                               # checklist → demo season → schedule → game → stats → delete →
│                               # upgrade path, asserting each step + zero console errors.
└── e2e-film-room.mjs           # Headless Film Room harness — run it alongside the onboarding
                                # one before any deploy: grid render, click-to-select, chip
                                # filters, bulk select + Watch fallback, collapse persistence,
                                # switch-team back-out.

server/                       # Optional local Python backend (YOLO-based)
├── app.py                    # Flask server
├── analyzer.py               # Video analysis with OpenCV/YOLO
├── start.sh                  # Server launcher
└── README.md                 # Server setup instructions

src-tauri/                    # Tauri v2 desktop shell
├── Cargo.toml                # Rust crate (tauri + plugins: fs, dialog, shell)
├── tauri.conf.json           # App config: window, CSP, bundle, withGlobalTauri
├── build.rs                  # Tauri build script
├── capabilities/
│   └── default.json          # v2 permissions: fs scope, dialog, shell
├── icons/                    # App icons (placeholder — replace for production)
└── src/
    └── main.rs               # Entry point: registers plugins, launches app
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
    playType: '',       // MULTI-SELECT. One or more of 'Run Inside' | 'Run Outside' | 'Screen' | 'Short Pass' | 'Medium Pass' | 'Deep Pass' | 'Play Action' | 'RPO' | 'Trick Play', stored as a " + "-joined string (e.g. 'RPO + Short Pass' — an RPO that became a pass). ChipField({multi:true}); StatsEngine.splitPlayTypes() is the canonical splitter; analytics attribute the play to each component.
    result: '',         // MULTI-SELECT. One or more of 'Gain' | 'Loss' | 'No Gain' | 'Incomplete' | 'Interception' | 'Touchdown' | 'Sack' | 'Fumble' | 'Penalty' | 'Punt' | 'Field Goal' | 'Good' | 'No Good' | 'Kneel' | 'Spike' | 'Safety', stored as a " + "-joined string (e.g. 'Fumble + Touchdown' for a scoop-and-score, 'Interception + Touchdown' for a pick-six). ChipField({multi:true}); StatsEngine.splitResults()/hasResult() are the canonical accessors. 'Good'/'No Good' mark conversion/kick success (2-Pt, XP, FG). 'Safety' = 2 pts, always attributed to the defensive team.
    yardage: '',        // integer, signed (negative for loss/sack). The tag form enters it as a MAGNITUDE — the Result chip (Loss/Sack) supplies the sign, so the coach never types a minus (PlayTagger._applyYardageSign). Stored signed for stats/EPA/export.
    hash: '',           // 'Left' | 'Middle' | 'Right'
    defFront: '',       // '4-3' | '3-4' | '4-4' | '5-2' | '4-2-5' | 'Nickel' | 'Dime' | 'Quarter' | '4-6'
    coverage: '',       // 'Cover 0'-'Cover 6' | 'Man' | 'Zone'
    blitz: '',          // MULTI-SELECT. 'A-Gap' | 'B-Gap' | 'C-Gap' | 'Edge' | 'DB Blitz' | 'Zone Blitz', stored as " + "-joined string. ChipField({multi:true}); StatsEngine.splitBlitzes() is the canonical splitter.
    driveNumber: '',    // auto-incremented
    unit: 'offense',    // 'offense' | 'defense' | 'special' — drives tag-form layout
    stType: '',         // 'Kickoff' | 'Kick Return' | 'Punt' | 'Punt Return' | 'Field Goal' | 'XP' | '2-Pt' | 'Onside' | 'Fake'
    players: {},        // { ballCarrier, passer, receiver, tackler, kicker, returner } -> jersey # strings. Most roles hold a single #; tackler may hold MULTIPLE (shared tackles), stored as a "55, 22"-style string. StatsEngine.splitPlayers() splits any player value into individual #s.
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
3. **Per-play attribution**: the tag form has a **Players** section with four roles — Ball Carrier, Passer, Receiver, Tackler. Click a role input to make it active, then tap a roster **quick-pick chip** (filtered by side of ball) to stamp the jersey #. Saved to `play.tags.players`. **Tackler accepts multiple #s** (shared/assisted tackles): the input is a text field and the quick-pick chips *toggle* membership in a `"55, 22"` list (`RosterManager.multiRoles`) instead of replacing. Other roles stay single-value.
4. **Per-play grading**: each role has a grade select (++/+/0/−/−−, stored as -2 to +2 in `play.tags.grades`). Average grades appear in the individual stats tables.
5. **Aggregation** (`stats-engine.js` `_individualStats`): rolls role assignments into rushing (att/yds/avg/long/TD/fum/grade), passing (cmp-att/pct/yds/TD/INT/sack/grade), receiving (rec/yds/long/TD/grade), and tackles (tkl/**solo**/**ast**/sack/TFL/grade). A play with 2+ tacklers credits each as an **assist**; a lone tackler is **solo**. `StatsEngine.splitPlayers()` splits the tackler list.
6. **Output**: dashboard renders four individual-stat tables; jersey #s map to "#22 Smith" via the roster. **Click any player row to launch a film cut-up** (`_watchPlayer` → `CutupPlayer`).
7. **Export**: CSV includes Ball Carrier / Passer / Receiver / Tackler + grade columns.

Quick Chart mode also writes `play.tags.players` for the same roles.

### Film Cut-Ups (`cutup-player.js`)
`CutupPlayer` plays a set of plays back-to-back in the existing `<video>`:
seek to each play's start, run to its end, auto-advance to the next. A
floating banner shows label + position with Prev/Next/Exit (←/→/Esc).
Distinct from `cutup-exporter.js`, which renders a downloadable stitched
video file.

**Every data point ties to video** (Hudl-style): clicking *any* highlighted
stat in the dashboard launches a cut-up of exactly those plays — not just
player rows. Formation / Play Type effectiveness rows, the Down & Distance
table, the Situational table (Red Zone, Goal Line, Backed Up, 3rd & Long/
Short), and the Defensive Front / Coverage / Blitz tables all carry
`data-cut-type` / `data-cut-val` attributes. `_renderDashboard` wires every
`.cut-row[data-cut-type]` to `_watchPlays(filter, label)`; `_buildCutFilter
(type, val)` returns the predicate (offense dimensions match offense-unit
plays, defensive dimensions match defense-unit plays — mirroring the stats
partition). `_watchPlayer` is now a thin wrapper over `_watchPlays`. Rows
without a playable video region fall back to selecting the first match. A
hover ▶ + tooltip and a one-line `.stats-cut-hint` banner make it
discoverable. `Charts.effectivenessRows` emits the cut attributes when an
item carries `cutType`/`cutVal`/`cutLabel`.

## Storage Backend Seam (`storage-backend.js`)

The app never touches localStorage / the filesystem directly — it goes through a
`StorageBackend`. This is the seam that lets the **same UI** run as a browser app
or an installed desktop app (and, later, a cloud-synced one) without UI changes.

- `detectBackend()` returns `TauriBackend` when `window.__TAURI__` exists, else
  `BrowserBackend`. `SeasonStore` takes a backend (defaults to `detectBackend()`).
- **Responsibilities**: (1) canonical season load/save, (2) a **backup ring** of
  restore points (`createBackup`/`listBackups`/`getBackup`, capped at
  `RETENTION = 25`), (3) optional **durable disk** target
  (`supportsDisk`/`bindDisk`/`writeDisk`/`diskStatus`).
- **`BrowserBackend`**: canonical = `localStorage ffa_season`; backup ring =
  **IndexedDB** (`ffa_fs` DB, `backups` store; `handles` store keeps the bound
  directory handle); durable disk = **File System Access API** — a bound folder
  receives `season.json` (live) + `backups/season_<ts>.json` snapshots, pruned to
  25. Chromium only; Firefox/Safari fall back to download + the in-app ring.
- **`TauriBackend`** (desktop): every read/write hits real files via Tauri's fs;
  the backup ring is real files in `backups/`. Dormant in the browser. See
  `TAURI.md` for packaging.
- **Film library** (desktop only, `supportsFilm()`): the backend also manages
  persistent film storage. See "Persistent Film Library" below.

### Persistent Film Library (Tauri desktop)

On the desktop build, video files are **copied into the season's folder** when
loaded and **auto-loaded from disk** when the coach opens a game — the biggest
UX gap vs Hudl, now closed.

**Disk layout** (under `$APPDATA`):
```
seasons/<season-id>/
  films/<game-id>/
    game_film.mp4           # single-video mode
    clip_01.mp4             # multi-clip (folder) mode
    clip_02.mp4
    …
```

**Import flow** (`StorageManager.importFilm` → `TauriBackend.importFilm`):
1. User picks file(s) via the existing file picker / drop zone.
2. Video loads immediately for tagging (blob URL, same as before).
3. In the background, the file(s) are read as `ArrayBuffer` and written to
   `$APPDATA/seasons/<sid>/films/<gid>/` via `fs.writeFile`. A progress toast
   shows "Saving film to library… N/M". Already-imported files (same filename)
   are skipped.

**Auto-load flow** (`StorageManager._autoLoadFilm`):
1. `_loadActiveGame()` fires after a game switch or season open.
2. If `backend.supportsFilm()`, it lists files in the game's film directory.
3. **Single-video**: resolves the film's absolute path →
   `convertFileSrc(path)` (asset protocol URL) → `VideoController.loadUrl()`.
4. **Multi-clip**: resolves each clip → `PlaylistManager.rehydrateFromDisk()`,
   which matches disk files to existing plays by `clipName` and sets
   `clip.assetUrl` / `play.clipId` so playlist navigation works. Then switches
   to the saved `currentPlayId`'s clip.
5. If the film isn't on disk (old save, browser import, deleted manually), the
   load silently falls back to the placeholder — the coach can re-link.

**Playback**: served via the Tauri **asset protocol** (`https://asset.localhost/…`
or `asset://localhost/…`). Enabled in `tauri.conf.json` (`assetProtocol.enable`,
scope `$APPDATA/**`), with the CSP updated (`media-src` / `img-src` include
`asset:` and `https://asset.localhost`). `crossOrigin = 'anonymous'` is set on
the `<video>` element when using asset URLs to keep the canvas untainted for
frame export / AI vision.

**Browser build**: completely unchanged — `backend.supportsFilm()` returns
`false`, so none of the import / auto-load code runs.

**Cleanup**: `StorageManager.removeGame()` calls `backend.deleteFilm(gameId)`.
Deleting a season deletes the entire `seasons/<id>/` directory, including films.

### Durable Documents mirror (Tauri desktop) — survives "delete app data"

On desktop, the canonical save AND the restore ring both live under `$APPDATA`,
so uninstalling with **"Delete application data"** (or clearing app data) used to
wipe the data *and* its own safety net. To fix this, `TauriBackend.writeDisk()`
now also mirrors every save to the user's **Documents** folder, outside app data:

```
Documents/GridIron IQ/seasons/<id>/season.json     # live mirror (every autosave)
Documents/GridIron IQ/seasons/<id>/backups/         # snapshot ring (explicit saves), pruned to RETENTION
```

- Mirror writes are **best-effort** (`_mirrorToDocuments`) — a Documents failure
  never blocks the canonical app-data save. Films are NOT mirrored (large; the
  originals are re-linkable).
- **Auto-recovery**: `listSeasons()` calls `_recoverFromMirror()` when the
  app-data library is empty (fresh install or post-wipe). It reads each
  `Documents/GridIron IQ/seasons/*/season.json`, copies it back into app data,
  and rebuilds `library.json` — so a coach's seasons reappear automatically.
- `diskStatus().name` is now **"Documents › GridIron IQ"** (the durable target),
  and `openDataDir()` opens that mirror folder. The Season modal's backup-status
  line adds a warning to **Save Season** (export a file) before uninstalling,
  since "Delete application data" still erases the app-data copy.
- Capabilities add `$DOCUMENT/**` to `fs:scope` + the opener allow-lists.

### Backups & Restore ("undo a save")
Because browser storage is not durable, every save also makes a restore point:
- `SeasonStore.snapshot(label)` writes a disk snapshot (if a folder is bound) +
  an in-app ring entry. `StorageManager._maybeSnapshot()` throttles auto
  restore-points to one per ~3 min during tagging; explicit Save and risky ops
  force one.
- **Restore is reversible**: `SeasonStore.restoreBackup(id)` snapshots the
  *current* state ("Before restore") before overwriting, so a coach can never
  strand themselves on bad data. UI: the Season modal's **Restore** panel lists
  points (time, label, season/game/play counts) with a Restore button.
- The Season modal header shows a **backup status** line: green "✓ Backing up to
  <folder>" when bound, amber warnings otherwise. **Back up to Folder** binds the
  durable folder (recommended on first explicit Save).

## Season Library / Team Hub — front door (`season-library.js`)

**The app is library-first, like Hudl. The hierarchy is Team → Season → Game →
Plays → Stats.** On launch it opens the **library overlay** (`#libraryOverlay`,
`SeasonLibrary`) to the **Team Home** and **nothing loads until the coach
explicitly opens or creates a season**. (This replaced the old behavior where a
single shared save auto-loaded silently with no context, which got messy by game
2 and confused users about what was loaded.)

### Team level (the hub)

The library has two views, toggled by `_setLevel('seasons'|'schedule')`:
- **`#librarySeasonsView` (Team Home)** — a **team identity card** (`#teamCard`:
  name, jersey-color swatch, roster count, **Roster** + **Edit** actions) above
  the **seasons list**. First-time users (no team) instead see **`#teamSetup`**
  (name + jersey color → "Get Started"); once saved, the card replaces it.
  Team identity lives in `localStorage ffa_team_profile` (`{teamName,
  jerseyColor}`), is editable inline (`#teamEdit`), and syncs both ways with Game
  Info (`_syncGameInfoFromTeam`). The single team is intentional — coaches coach
  one team; this is the "hub for a team," not multi-team. **Backing out is
  supported**: the edit panel has a "Switch to a different team…" link
  (`#btnTeamSwitch` → `_switchTeam()`) that, after an in-app confirm, clears
  `ffa_team_profile` + `ffa_checklist_dismissed` (fresh checklist) and returns
  to the setup form. Non-destructive: seasons and the roster stay in the
  library; the confirm copy tells the coach to delete old-team seasons from the
  list. True multi-team (seasons scoped per team) is intentionally NOT built.
- **`#libraryScheduleView` (Schedule)** — the open season's games as a Hudl-style
  schedule table (`_renderSchedule` → `#scheduleBody`, using `app._gameRowInfo` /
  `_scorePillHtml`): status dot, name, date, W/L pill, play count, Open/Final.
  Click a row → open that game. "← All Seasons" returns to Team Home.

Opening/creating a season lands on the **schedule** (pick a game), not the
player — reinforcing drill-down. Each season is still its own file/folder.

### Breadcrumb (top bar) — `#breadcrumb`, replaces the old season chip

`Team ▸ Season ▸ Game`, rebuilt by `App._updateSeasonChip` / wired in
`_bindSeasonChip`:
- **Team** (`#bcHome`, shows `ffa_team_profile.teamName`) → `library.open()`
  (Team Home).
- **Season** (`#bcSeason`, the season name) → `library.openSchedule()`.
- **Game** (`#bcGame`, the active game) → toggles the **game-switcher dropdown**
  (`#gameDropdown`) — the quick in-place game switch; hidden until a game exists.
The breadcrumb is hidden until a season is open.

### Onboarding: demo season + Get Started checklist

Best-in-class onboarding lesson (Hudl/Notion/Krossover): never show a blank
canvas; get to value fast on real-looking data.
- **Explore a demo season** (`#btnExploreDemo` → `StorageManager.loadDemoSeason`)
  builds a deterministic, fully-tagged sample season (`demo-season.js`,
  `DemoSeason.build()` — 2 finished games, offense + defense, ~170 plays, final
  scores W 28-21 / L 17-24) via the **same** `createSeason` path as real data, so
  the coach lands on populated Stats/Self-Scout/Call-Sheet instantly. It's
  **non-destructive**: the demo carries an **empty roster**, and player names
  come from a transient overlay — `StatsEngine._fixedLabels` (checked before
  `_seasonLabels`, which the Season Stats view nulls), set/cleared per active
  season by `_applySeasonLabels()` in `_loadActiveGame`. The demo is flagged by
  `localStorage ffa_demo_season_id` (`isDemoSeason`), shown with a **Demo** badge,
  and removable with a non-destructive confirm (`_teardownDemo` just clears the
  flag). No film is attached (can't bundle video) — the demo's job is analytics.
- **Get Started checklist** (`#getStartedChecklist`, `_renderChecklist`) — a
  progressive 5-step guide (Set up team → Add roster → Start a season → Tag a
  play → See your stats) that reflects real state (`_checklistItems` reads the
  team profile, roster, season metas excluding the demo, and a `ffa_seen_stats`
  flag set when the dashboard opens for non-demo data). Each open step is
  click-to-action; it auto-hides when complete or dismissed
  (`ffa_checklist_dismissed`). Only shown once a team exists.

### Per-season file storage

- **Each season is its own file/folder**, not one shared blob:
  - Browser: `localStorage ffa_library` (index) + `ffa_season_<id>` per season;
    backups in IndexedDB tagged with `seasonId`.
  - Tauri: `library.json` (index) + `seasons/<id>/season.json` +
    `seasons/<id>/backups/`.
- The backend (`storage-backend.js`) scopes the classic per-season ops
  (`loadSeason`/`saveSeason`/backup ring) to a **current season** set via
  `setCurrentSeason(id)`, plus library ops `listSeasons` / `createSeason` /
  `deleteSeason` / `touchOpened`. So `SeasonStore` keeps calling the same methods.
- `SeasonStore` adds `currentSeasonId`, `hasCurrent()`, `listSeasons()`,
  `createSeason(meta)`, `openSeason(id)`, `deleteSeason(id)`, `closeSeason()`;
  `data` is **null until a season is opened** (so autosave no-ops on the Library).
- `StorageManager.initLibrary()` (startup) loads nothing; `openSeasonById(id)` /
  `createSeason(meta)` commit+persist the outgoing season, switch, then
  `_afterSeasonLoaded()` loads the active game + re-seeds history/versions/chip.
- **Legacy migration**: an old single `ffa_season` / top-level `season.json`
  becomes the first season in the library automatically (no data loss).
- The **game-switcher dropdown** (`.game-dropdown`, `#gameDropdown`), opened from
  the breadcrumb **Game** segment, is the quick in-place switch — a compact list
  of all games in the season with status badges, scores, play counts, and
  per-game actions. "Switch Season" in its footer opens the library.

### Game Switcher Dropdown (`#gameDropdown`)

The dropdown is the primary game-switching interface (Hudl-style schedule view):
- Each game row (`.gd-row`) shows: status dot (cyan=open, green=final, dim=idle),
  name (derived from opponent/project/video), play count, date, W/L score pill,
  and status badges ("open" / "Final").
- **Click** a row's info area → `switchToGame(id)` + close dropdown.
- **Finish Game** button on the active (non-final) row → opens the finish-game
  modal (see below).
- **+ New Game** → `storage.newGame()` + update chip.
- **Switch Season** → opens the Season Library.
- Closes on Escape, outside click, or game selection.

Wired in `App._bindSeasonChip()`, `_openGameDropdown()`, `_renderGameDropdown()`,
`_closeGameDropdown()`.

### Game Status & Finish Game Flow

Each game has a `status` field: `'active'` (default, in-progress) or `'final'`
(completed). Backward-compatible — old games without `status` default to
`'active'` via `SeasonStore._normalize()`.

**Finish Game** (`App._finishGame` → `_showFinishModal`):
1. If no final score entered → modal prompts for Us/Them score.
2. If score already present → modal confirms "Mark as Final?"
3. On confirm: saves score to Game Info, sets `game.status = 'final'`, persists,
   shows a toast.
4. **Reversible**: a Final game can still be opened and edited. The status is
   informational, not a lock.

The status is preserved across `commitActive()` → `updateActiveGame()` (which
would otherwise overwrite the game node from `_serialize()` output that doesn't
include `status` — `updateActiveGame` now carries `prev.status` forward).

`SeasonStore.setGameStatus(id, status)` and `SeasonStore.gameStatus(g)` are the
accessors. The Season Stats modal (`season-manager.js` `_renderGameList`) shows
a `✓ Final` badge on completed games.

The within-season schedule + aggregate stats stay in `season-manager.js` (the
"Season Stats" modal); it operates on whichever season is current.

## Season-as-Project — Save/Load Architecture (`season-store.js`)

**Each season IS a project.** Within a season, the unit of work holds many games
and is autosaved in place. This killed the old per-video autosave
(`ffa_<videoFileName>`) and the per-save download artifact
(`<game>_analysis.json`) that scattered over a year. (Above this sits the
**Season Library** — multiple seasons, each its own file; see previous section.)

**Data model (schema v5)** — `SeasonStore.data`:
```javascript
{
  version: 5, type: 'season',
  seasonName: '',                 // named up front in the Season modal
  teamProfile: { teamName, jerseyColor },
  roster: [...],                  // season-level roster mirror
  games: [ gameNode, ... ],       // each gameNode is the old per-game object:
  activeGameId: '<id>',           //   { id, name, gameInfo, plays, annotations,
}                                 //     nextId, currentPlayId, videoFileName,
                                  //     clipNames, isMultiClip }
```
A `gameNode` is exactly what `StorageManager._serialize()` produces, so
`version-manager.js` (which round-trips through `_serialize`/`_deserialize`)
keeps working unchanged — those two methods are still "serialize/deserialize the
**active game**".

**Storage tiers (via the backend seam, see above):**
1. **Canonical** = `backend.saveSeason()` (browser: `localStorage ffa_season_<id>`
   for the current season; desktop: `seasons/<id>/season.json`),
   autosaved continuously (debounced) by `StorageManager._commitAndPersist()` →
   `commitActive()` + `seasonStore.persist()`. No artifacts proliferate.
2. **Durable disk backup** = a bound folder (browser: File System Access API)
   getting `season.json` + a `backups/` snapshot ring; on desktop (Tauri) plain
   app-data files. Silent live-file writes are debounced on autosave; snapshots
   are throttled / forced on explicit save.
3. **Restore ring** = timestamped restore points (IndexedDB in the browser, real
   files on desktop), capped at 25 — the "undo a save" safety net.
4. **Portability** = `Save Season` / `downloadFile()` for a one-off
   `<season>_season.json`; `Open File` (Season modal) imports a season or legacy
   game file.

**Bridge (`StorageManager`)** owns the live↔store sync:
- `initSeason()` (called once at startup, next tick so `window.app` is set) loads
  the season and restores the active game into the tagger/canvas/gameInfo.
- `commitActive()` writes live tagger/canvas/gameInfo (+ roster, team profile)
  into the active game node; `_loadActiveGame()` loads a node back out.
- `switchToGame(id)` / `newGame()` / `removeGame(id)` / `addGameFromData(legacy)`
  commit the current game, mutate the store, then `_clearForNewGame()` (unloads
  video via `VideoController.unloadVideo()`, resets the playlist via
  `PlaylistManager.reset()`, blanks the Game Info form via
  `App._clearGameInfoForm()` — team identity is intentionally preserved) and
  load the new active game.
- Import reuses an empty active game (`seasonStore.isEmptyActive()`) instead of
  leaving a stray "Game 1" behind.
- `loadProject(file)`: a **season** file (`has .games`) replaces the season; a
  **legacy single-game** file (`has .plays`) is appended as a new game.

**Video is stored on the desktop build** — film files are copied into
`$APPDATA/seasons/<id>/films/<game-id>/` and auto-loaded via the asset
protocol on game open. On the **browser build**, video is NOT stored (too
large for localStorage); each game records its `videoFileName` and the coach
re-links the film when they open that game.

### Season Player Roll-Up + Progression (`season-manager.js`)
The Season modal is a *view* over `app.storage.seasonStore` — it owns no game
data. Every read goes through `_effectiveGames()`, which calls
`storage.commitActive()` then returns `seasonStore.gamesChrono()` (games sorted
by `gameInfo.date`), so the live game is always reflected. The active game is
highlighted and clickable rows switch games.

- **Season totals**: `StatsEngine.compute(allPlays)` over every game's plays
  renders the same four box-score tables as season roll-ups; player names merge
  every game's roster + the live roster (`_mergeRoster` →
  `statsEngine._seasonLabels`).
- **Season Progression** (`_renderProgression`): splits the chronological games
  into first half vs. second half and compares Success Rate, Yards/Play, 3rd
  Down %, TDs/Game, and Turnovers/Game — flagging each **Improving / Slipping /
  Steady** (deadzone per metric) with a headline ("Getting better: … / Needs
  work: …"). This is the "better at X, worse at Y over the season" view.
- Included in the exported season HTML report (titled by `seasonName`).

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

## Self-Scout Report

The flip side of opponent scouting: run the same lens on **your own offense**
to reveal what tendencies you're *tipping*. Opened via the **Self-Scout**
button in the stats dashboard header (analyzes your own tagged offensive
plays — no perspective gate, unlike Opponent Scout). Run/pass-classifiable
offensive plays only (`unit === 'offense'` and `isRun || isPass`).

**Output**:
- **Predictability Index (0–100)** — sample-weighted measure of how lopsided
  your run/pass mix is across formations & down-and-distance (`(avgMaxPct −
  50) × 2`, weighted by bucket sample, buckets need n ≥ 3). Labeled Balanced
  (<30) / Moderate (<50) / Predictable (<70) / Very Predictable (≥70), with a
  colored meter (green→amber→red).
- **Your Top Tells** — ranked table of the situations where you're most
  readable, drawn from Formation, Down & Distance, Personnel, Hash, and the
  combined **Formation × Down** view a DC actually keys on. A "tell" needs
  n ≥ `_SELF_SCOUT_MIN_N` (4) and a lean ≥ 70 % one way; ranked by
  `(leanPct − 50) × min(n, 12)`; tiered Strong (≥85 %) / Notable (≥75 %) /
  Slight (≥70 %). Lean shown as a fill bar (amber = run, blue = pass).
- **Recommendations** — auto-generated counters per top tell (run-heavy →
  "add play-action"; pass-heavy → "add a draw/screen").
- **By Formation / By Down & Distance / By Personnel** split tables with a
  tell-vs-balanced flag per row.
- **Exportable** as a standalone HTML report (`self_scout_<team>.html`).

Methods in `StatsEngine`: `generateSelfScout()`, `renderSelfScout()`,
`_exportSelfScout()`, plus helpers `_selfScoutGroup()`, `_selfScoutRows()`,
`_tellsFrom()`, `_predictabilityIndex()`, `_ddPretty()`.

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
Spread"`). **Formation**, **Play Type**, **Result**, and **Blitz** are
multi-select. The string interface is unchanged, so all consumers still treat
it as a plain string; analytics split on `" + "` and attribute the play to each
component (see `StatsEngine.splitFormations`, `splitPlayTypes`, `splitResults`,
`splitBlitzes`).

### Unit Toggle (Offense / Defense / Special Teams)

A per-play segmented toggle (`#tagUnit`) at the top of the form drives the
**layout** — it reorders/collapses side-specific fields rather than hiding
data. Stored on `play.tags.unit`; new plays default from the Game Info "Film
shows" perspective via `tagger.defaultUnit` (set by `App._bindScoutMode`).

**Sticky side**: the unit is "persistent until changed" — manually changing the
toggle updates `tagger.defaultUnit`, and **Save & Next carries the side forward**
to the next *untagged* play (`nextPlayWithSituation` applies `carryUnit` when the
next play has no explicit `tags.unit`). So a coach tagging a series of defensive
snaps picks Defense once instead of every play. An already-tagged play keeps its
own unit (the carry never overwrites).

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
5. Play Type — 9 chips, **multi-select** (an RPO can be tagged with its realized look, e.g. RPO + Short Pass)
6. Result — 15 chips (incl. **Good** / **No Good** for 2-Pt/XP/FG conversion success)
7. Yardage — magnitude input (positive) with +/− nudge buttons; the Result chip (Loss/Sack) sets the sign, so no minus is typed
8. Players — 6 role inputs (BC/Passer/Receiver/Tackler/Kicker/Returner) + grade selects + quick-pick chips
9. Play Notes — textarea (the real call, e.g. "Power R 34 Lead")

**Collapsed section** ("Situation & Details"):
Hash, Quarter, Field Position, Drive, Custom Tags

**Navigation bar**: ← Prev | Save & Next → | Skip

**Save & Next behavior** (`App._advancePlay`, shared by the button, the Skip
button, and the Enter shortcut): commits any focused field (yardage/notes),
then advances. The fields already auto-save on change, so "Save" is a flush;
"Next" is the advance. Advance order: (1) next play in the list — which in
folder/multi-clip mode also switches to that play's video via the
`play-selected` → `switchToClipByPlayId` handler; (2) if there's no next play
but more **video clips** remain, jump to the next clip so a folder upload keeps
flowing video-to-video; (3) otherwise show a brief "Last play" toast.
`PlayTagger.nextPlay()` also handles a null current selection by jumping to the
first play, so the button is never a silent no-op when plays exist.

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
- **Delete Play** (`PlayTagger.deleteCurrentPlay`) — behavior depends on mode:
  - **Folder / multi-clip mode** (play has a `clipId` in the playlist): drops
    the play *and* its clip via `PlaylistManager.removeClip()`, which revokes
    the clip URL, fixes the active index, and **switches to the adjacent clip**
    (forward — the next clip slides into the deleted slot). The player stays
    loaded and a valid current play is selected, so Save & Next keeps working.
    Only when that empties the playlist does it unload the player. (Previously
    it always called `unloadVideo()`, orphaning the remaining clips and forcing
    a full folder re-upload — the bug this path fixes. Requires
    `tagger.playlist`, wired in `App` constructor.)
  - **Single-video mode** (no clip): removes the play **and** unloads the video
    from the player (`VideoController.unloadVideo()` revokes the object URL,
    clears `<video>`, restores the placeholder).
  - The **source file on disk is never touched** — browsers can't delete local
    files; this only clears the player. Confirms first.
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

### AI Auto-Tagging Direction — Decided, Deferred

The current 8-frame-still approach (`vision-analyzer.js`) proved the concept but
hit a ceiling: static JPEGs from amateur film angles don't carry enough signal
for scheme-level recognition (formation variants, coverage shells, blitz
packages). Three things have changed since:

1. **Video-native models** (Gemini, Claude with video, fine-tuned sport models)
   can ingest whole clips — motion, cadence, and blocking assignments are visible
   in video but invisible in stills. Replace the 8-frame extraction with a
   whole-clip pass once the API supports it cost-effectively.
2. **Native compute pipeline** (Tauri desktop): persistent film library means
   clips are on disk, not re-linked per session. A background sidecar can run
   inference on every clip at import time, cache results, and present them when
   the coach opens the play — no waiting.
3. **Data flywheel**: every coach correction to a suggestion is a labeled
   training example. Over a season the app accumulates hundreds of labeled clips
   from *this team's* film style. Fine-tuning or few-shot prompting from that
   corpus closes the accuracy gap that a general model can't.

**Field viability tiers** (what AI can realistically tag):

| Tier | Fields | Confidence | Notes |
|------|--------|------------|-------|
| **Green** | Play boundaries (start/end), Run/Pass | High (80%+) | Motion detection already works for boundaries; run/pass is the easiest classification task from video. Ship as auto-filled. |
| **Yellow** | Formation, Ball Carrier (#), Yardage estimate | Medium (50–70%) | Requires decent camera angle. Pre-fill as suggestion with confidence score; coach accepts or corrects. |
| **Red** | Coverage, Blitz, Defensive Front, Personnel grouping | Low (<40%) | Requires pre-snap reads that even trained humans debate from a single angle. Show only when confidence exceeds a threshold; never auto-fill. |

**Recommended approach — "AI-assisted" not "auto"**:
- First pass pre-fills **green-tier** fields on every play at import time
  (background, no UI block). Coach sees them already filled when they open a
  play.
- **Yellow-tier** suggestions appear as ghost chips (dimmed, with a confidence
  badge). Tap to accept, tap a different chip to correct. Correction overwrites
  the suggestion and feeds the flywheel.
- **Red-tier** fields stay blank unless the model is >70% confident, in which
  case a subtle "AI suggests: Cover 3" hint appears below the chip group. Never
  auto-selects.
- A per-play **confidence summary** (e.g. "AI: 4/7 fields, avg 72%") lets the
  coach decide at a glance whether to trust the pre-fill or tag from scratch.
- All suggestions are non-destructive: coach tags always win, and the raw AI
  output is stored on `play.analysis` for later review/retraining.

**Prerequisites before building**:
- Persistent film library (Tauri native #1) — clips must be on disk for
  background inference and the training-data flywheel.
- Video-capable API endpoint — whole-clip analysis replaces the 8-frame approach.
- UI for ghost chips / confidence badges — small play-tagger extension.

**Not planned**: fully autonomous tagging ("load film, get a finished game
file"). The coaching eye is the product; AI reduces keystrokes, it doesn't
replace judgment.

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

Concrete recipe (worktree, never edit `gh-pages` files by hand — they are
verbatim copies of the bundle):
```bash
git fetch origin gh-pages
git worktree add /tmp/gh-pages-deploy gh-pages
cp football-film-analyzer.html /tmp/gh-pages-deploy/index.html
cp football-film-analyzer.html /tmp/gh-pages-deploy/football-film-analyzer.html
cd /tmp/gh-pages-deploy && git add -A && git commit -m "Deploy: <summary>" && git push origin gh-pages
git worktree remove /tmp/gh-pages-deploy   # from the repo root
```
> Before overwriting, sanity-check that `gh-pages` only ever receives "Deploy:"
> commits (`git log --oneline`) — it does, so the bundle is the source of truth.
> A past deploy added a stray Google-Fonts `@import`; the source uses system
> fonts now, so dropping it on the next deploy is expected, not a regression.

### Cutting a Desktop Release (Tauri auto-update)

**This is the routine — don't re-derive it. ~9 releases cut this way (v1.0.0+).**

The live desktop app updates via the Tauri auto-updater, which polls the GitHub
Releases `latest.json`. A release is published by **pushing a `v*` tag**, which
triggers `.github/workflows/build-desktop.yml`: it copies
`football-film-analyzer.html` → `dist/index.html`, builds **signed** installers
on real OS runners (Windows `.msi`/`.exe`, macOS `.dmg`, Linux `.deb`/`.AppImage`),
and publishes a GitHub Release with the updater artifacts + `latest.json`.
(`workflow_dispatch` only uploads artifacts — it does **not** publish a release /
`latest.json`, so it does **not** update the auto-updater.)

Steps to ship version `X.Y.Z`:
1. **Rebuild the bundle** (`bash build.sh`) so the desktop frontend has the
   latest code, and make sure it's committed.
2. **Bump the version in all three** `src-tauri` files (they must match):
   `Cargo.toml` (`version`), `tauri.conf.json` (`version`), and `Cargo.lock`
   (the `gridiron-iq` package entry). **Also bump `APP_VERSION` in `js/app.js`**
   — that constant is the version the *web* bundle displays (the More-menu
   footer). The desktop build overrides the displayed version at runtime from
   the Tauri config, so web and desktop can legitimately show different numbers
   (independent release cadences); keep `APP_VERSION` aligned with whatever web
   bundle you deploy, not necessarily the desktop tag.
3. **Commit + push** the bump to the feature branch
   (`claude/football-film-analyzer-GRiCW`).
4. **Push the tag** (this is the trigger):
   ```bash
   git fetch origin
   git tag vX.Y.Z <commit-sha>      # the version-bump commit
   git push origin vX.Y.Z
   ```

> ⚠️ **The agent environment can push branches but NOT tags** (tag pushes return
> HTTP 403; the GitHub MCP tools don't expose tag/release creation either). So
> the agent does steps 1–3, then **hands the coach the exact step-4 commands to
> run locally**. This is by design — it's how every release has been cut.

> ⚠️ **The agent environment sometimes resets the local checkout to an old
> commit between turns.** All real work lives on the remote. If `git log` looks
> stale, recover with `git fetch origin && git reset --hard
> origin/claude/football-film-analyzer-GRiCW` (verify `git status` is clean
> first so no uncommitted work is lost), then `bash build.sh`.

**Windows SmartScreen caveat (unsigned build):** auto-update download+install
works, but Windows blocks the unsigned installer with "Windows protected your
PC / unknown publisher." The user must click **More info → Run anyway**; the
relaunch follows. Real fix (deferred, user's call): code-sign the build (Azure
Trusted Signing ≈ $10/mo, or an EV/OV cert). Until then, every update needs that
one manual click-through.

Deploying to `gh-pages` (web) and cutting a desktop release are **independent** —
do both when shipping a change to all users.

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

## Native Desktop (Tauri v2) — Built

The reliability ceiling of the browser sandbox (storage eviction, no free disk
access, File System Access being Chromium-only) led to shipping an **installed
desktop build via Tauri v2** alongside the web app. The Rust shell compiles and
produces working installers (`.deb`, `.rpm`, `.AppImage` on Linux; `.dmg` on
macOS; `.msi`/`.exe` on Windows). Storage goes through the `StorageBackend`
seam — `TauriBackend` uses the Tauri v2 fs plugin API (`mkdir`, `remove`,
`readDir` with `{ baseDir }` options). `TAURI.md` has the full build recipe
and production checklist. The web build remains the zero-install option for
other coaches to review.

### What native unlocks (the "less constrained" roadmap)

The browser forced the app to stay lean in specific ways; native lifts each
constraint. Prioritized for the desktop build:

1. **Persistent film library (SHIPPED).** On the desktop build, video files are
   now copied into the season's folder on disk
   (`$APPDATA/seasons/<id>/films/<game-id>/`) when loaded. Opening a game
   auto-loads the film via the Tauri asset protocol — no more re-linking every
   session. Supports both single-video and multi-clip (folder) modes. The
   browser build is unchanged (the feature gates behind `backend.supportsFilm()`).
2. **Real MP4 cut-up export.** Bundle `ffmpeg` as a Tauri sidecar so filtered
   plays / player cut-ups export as **actual video files** (the in-browser
   `cutup-exporter.js` is limited). Background rendering, no UI block.
3. **Cached per-play thumbnails / filmstrip.** Precompute and store frame
   thumbnails on disk → instant play browsing, filmstrip views, and **real
   images on the printed call sheet / reports**.
4. **Offline scoreboard OCR.** Bundle Tesseract + WASM + lang data locally
   (rejected on web for the ~10–15 MB size) → OCR works fully offline.
5. **Local ML auto-tagging.** Embed the existing Python/YOLO CV (`server/`) as a
   bundled sidecar instead of a separate localhost server; persist detections.
6. **Voice notes per play.** Coaches talk faster than they type — record short
   audio attached to a play (needs the storage headroom native provides).
7. **Unbounded history + multi-season library.** Larger restore ring, full
   annotation/version history, and a growing **opponent-scouting database** that
   carries tendencies year over year.
8. **System integration.** `.season` file association (double-click to open),
   drag-drop a folder of clips to auto-create games, native menus, auto-update.

Keep the **lean ethos** even when adding these: feature-detect native
(`window.__TAURI__`) and degrade gracefully on web, so the single-file browser
build stays fully functional. Heavy assets (ffmpeg, Tesseract, ML models) ship
only in the desktop bundle, never inlined into `football-film-analyzer.html`.

Still also valid for the **web** build: the PWA install + offline cache (Option
1 above) and graceful OCR degradation, independent of the desktop effort.

## Stats Engine Dependencies

The stats engine (`js/stats-engine.js`) computes:
- Run/pass ratio, play type distribution
- Success rate, average yards per play/type/formation
- Down & distance conversion rates
- Formation tendencies (with per-formation effectiveness: run/pass split, success%, avg)
- Play type effectiveness (same breakdown per play type)
- Defensive analytics (see below)
- Red zone, goal line, backed-up situational stats
- PAT / 2-point conversion success (`_conversionStats`, keyed on `stType`
  'XP'/'2-Pt' + Good/No Good result; computed from a broader play set than the
  playType-filtered stats so ST plays without an offensive playType still count)
- Expected Points Added (EPA) via `js/advanced-metrics.js`
- Per-player grades (avg from play.tags.grades)
- Game flow (cumulative yards play-by-play)
- Opponent scouting report (formation/down tendencies with run/pass splits)
- **Scoreboard** (`computeScoreboard`, `_renderScoreboard`) — a running score
  built from tagged scoring plays. `StatsEngine.playPoints(p)` scores each play
  (TD = 6, Safety = 2, made FG = 3, made XP = 1, made 2-Pt = 2; "made" = the
  explicit `Good` result or a `Touchdown`/`Field Goal` result). `scoringSide(p)`
  attributes points: Offense / Special Teams plays count for us, Defense plays
  for the opponent — **except** defensive scores (pick-six = `Interception +
  Touchdown`, scoop-and-score = `Fumble + Touchdown`, or `Safety`) count for us.
  The multi-select Result field handles this: tag a defensive play with both
  `Fumble` and `Touchdown` to record a scoop-and-score.
  Scoreboard section leads the dashboard with the final + a per-quarter table.
  Live mirror in Game Info: `App._updateTrackedScore()` shows a "Tracked"
  score that updates on every play change; "Apply →"
  (`_applyTrackedScore`) copies it into the editable Final Score fields.

### Game / Project Name

Game Info has a **Game / Project** field (`#gameProjectName`, stored on
`gameInfo.projectName`, schema unchanged — it's just another key). It labels the
project: `StorageManager._projectFileBase()` uses it (slugified) for the save
JSON + CSV filenames (falling back to the video name), and `_gameTitle()` uses
it as the stats-dashboard / report heading. Wired through `App._bindGameInfo`
/ `_saveGameInfo` / `_loadGameInfo` like the other Game Info fields.

### Persistent Team Identity (carry-forward across games)

Most `gameInfo` fields are game-specific (opponent, date, score) and live only
in the per-project save. But the **team-identity** fields — **team name** and
**jersey color** — carry forward to every new game so the coach never re-enters
them. Stored in `localStorage` under `ffa_team_profile` (`{ teamName,
jerseyColor }`), separate from any project save.

- `App._saveTeamProfile()` (called from `_saveGameInfo`) persists the last
  **non-empty** values, so editing another field while the name is blank — or
  an accidental clear — never wipes the saved identity.
- `App._applyTeamProfile()` (called at the end of `_bindGameInfo`) pre-fills the
  fields on a fresh session **only when empty**. A loaded project always wins:
  `_loadGameInfo` overwrites these when the project has its own values, and
  falls back to the carried-forward identity only when the project omits them.
- **Roster** already persists globally via `ffa_roster` (RosterManager). To stop
  an older project from wiping it, `StorageManager._deserialize` adopts a
  project's roster **only when it's a non-empty array** — an empty `roster:[]`
  no longer clears the coach's persisted roster.

### Visual Analytics (`js/charts.js`)

Pure-SVG chart primitives used throughout the stats dashboard — no external
libraries. All methods are static on the `Charts` class, returning HTML/SVG
strings. The module is imported by `stats-engine.js`.

**Chart types**:
- **Donut** (`Charts.donut`, `Charts.donutWithLegend`) — ring chart with center
  text. Used for run/pass split, yards breakdown, play type distribution, drive
  outcomes.
- **Gauge** (`Charts.gauge`) — semicircular arc meter for percentages. Used for
  success rate, run/pass success, 3rd/4th down conversion, red zone TD%, havoc
  rate.
- **Effectiveness Rows** (`Charts.effectivenessRows`) — horizontal bar chart
  where each row shows a fill bar split into run (gold) / pass (blue), with
  count, success%, and avg yards. Used for formations, play types, personnel.
- **Stacked Bar** (`Charts.stackBar`) — inline run/pass proportion bar. Used
  inside the Down & Distance table rows.
- **Game Flow** (`Charts.gameFlow`) — cumulative-yards line chart with per-play
  dots color-coded by run/pass. Shows momentum shifts at a glance.
- **Sparkline** (`Charts.sparkline`) — compact area line for inline use.
- **Mini Bar** (`Charts.miniBar`) — thin progress bar for table cells.

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

**Dedicated Defensive Report**: the same `_renderDefensive(stats)` output is
also reachable as a first-class focused view via the **Defense** button in the
stats dashboard header (`renderDefensiveReport()`), with its own standalone
HTML export (`_exportDefensiveReport`). The inline dashboard section stays
hidden when there's no defensive data, but the dedicated view shows an
explanatory empty state (how to tag a Defense play / front / coverage / blitz)
so the feature is never silently missing. The section renders inline as the
2nd-to-last dashboard block, so the button is the quick path to it.

## Key Decisions & Lessons

0. **Design for long-term usability first; step back when work gets too tactical.**
   The single-shared-save model worked in a demo but broke down by game 2 — data
   loaded with no context and everything piled into one file. The fix was the
   library-first model the pro tools (Hudl/QwikCut) all use (Team → Season →
   Game → Plays). Lesson: when a thread gets deep in tactical fixes, pause and
   ask whether the *structure* serves the coach over a whole season. Prefer
   copying proven workflows from established tools over inventing new ones, and
   build the durable data model in from the start rather than retrofitting.

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

12. **Inherited `color` is literal, not a live `var()`**: the app went light-theme (`--text` dark for the light canvas) while the stats overlays re-scope `--text` to a *light* value. But `.stats-body` set no explicit `color`, so it inherited the already-computed dark color from `<body>` — re-scoping the variable downstream does nothing for inherited values. Stats-table data cells (which had no explicit color) were dark-on-dark and invisible across the whole dashboard. Fix: set `color: var(--text)` directly on the overlay container so descendants inherit the light value. When a container re-scopes theme vars, also set the properties that should consume them, or inheritance silently keeps the old computed color.

13. **Theme vars are global; the app is light, the dashboard is dark**: the main UI (top bar, tag form) is a **light** theme (`--text: #0f172a`, white `--surface` chips); only the analytics overlays are dark, which they get by **re-scoping** the dark palette under `.stats-overlay` / `.season-overlay` / etc. (not at `:root`). A "make the dashboard look better" pass that drops a dark palette (`--text: #e6edf3`, dark `--bg-*`) into a global `:root` block leaks into the light tag form and renders chip labels near-white on white — unreadable. **Scope dashboard palette overrides to `.stats-overlay`, never `:root`.** Only truly global identity tokens (brand accent, run/pass chart colors) belong in `:root`, and even those must stay legible on the light theme's white surfaces (gold `#c9a227` is fine as a chip-hover/border accent but is low-contrast as body text on white).
