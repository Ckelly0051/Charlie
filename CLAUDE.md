# Football Film Analyzer — Architecture & Reference

## What This Is

A browser-based football film analysis tool for coaches. Load game film, mark plays, tag them with formation/type/result/etc., and get stats & tendencies. Runs entirely in the browser — no server required for core functionality.

**Live URL**: https://ckelly0051.github.io/Charlie/
**Branch**: `claude/football-film-analyzer-GRiCW`

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
├── stats-engine.js           # Stats aggregation (run/pass, efficiency, EPA)
├── advanced-metrics.js       # Expected Points Added calculations
├── heat-maps.js              # Visual heat map generation
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
└── tag-workspace.js          # Tag workspace utilities

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
    formation: '',      // 'Shotgun' | 'Under Center' | 'Pistol' | 'I-Form' | 'Singleback' | 'Split Back' | 'Single Wing' | 'Empty' | 'Wildcat' | 'Goal Line'
    personnel: '',      // '00'-'23' | 'Jumbo' | 'Goal Line'
    playType: '',       // 'Run Inside' | 'Run Outside' | 'Screen' | 'Short Pass' | 'Medium Pass' | 'Deep Pass' | 'Play Action' | 'RPO' | 'Trick Play'
    result: '',         // 'Gain' | 'Loss' | 'No Gain' | 'Incomplete' | 'Interception' | 'Touchdown' | 'Sack' | 'Fumble' | 'Penalty' | 'Punt' | 'Field Goal' | 'Kneel' | 'Spike'
    yardage: '',        // integer (negative for loss)
    hash: '',           // 'Left' | 'Middle' | 'Right'
    defFront: '',       // '4-3' | '3-4' | '4-2-5' | 'Nickel' | 'Dime' | 'Quarter' | '4-6'
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
`StorageManager.exportCsv()` — all plays with full tag fields including player attribution and grades.

### HTML Report Export
`StorageManager.exportHtmlReport(statsEngine)` — styled standalone HTML with all stats sections.

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

## Tag Form UI (Chip-Based)

The tag form uses **chip buttons** instead of dropdowns. Each field is a `div.pick-group` containing `button.pick` elements. The `ChipField` wrapper class (in `play-tagger.js`) provides `.value` get/set and `change` events so the rest of the code interacts with chip groups identically to native `<select>` elements.

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

**Priority layout** (visible without scrolling):
1. Unit toggle — Offense / Defense / Special Teams
2. Play Type — 9 chips
3. Result — 13 chips
4. Yardage — number input with +/− buttons
5. Down & Distance — 4 chips + input
6. Side groups — Offense (Formation, Personnel) / Defense (Def Front, Coverage, Blitz) / Special Teams (ST Play Type, Kicker, Returner)
7. Players — 6 role inputs (BC/Passer/Receiver/Tackler/Kicker/Returner) + grade selects + quick-pick chips

**Collapsed section** ("Situation & Details"):
Hash, Quarter, Field Position, Drive, Custom Tags

**Navigation bar**: ← Prev | Save & Next → | Skip

Special-teams stats (return game, kicking/punting) roll up in
`StatsEngine._individualStats` from `players.returner` / `players.kicker` keyed
on `stType`, and render as extra tables in the stats dashboard.

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

## Stats Engine Dependencies

The stats engine (`js/stats-engine.js`) computes:
- Run/pass ratio, play type distribution
- Success rate, average yards per play/type/formation
- Down & distance conversion rates
- Formation tendencies
- Defensive front/coverage/blitz frequency
- Red zone, goal line, backed-up situational stats
- Expected Points Added (EPA) via `js/advanced-metrics.js`
- Per-player grades (avg from play.tags.grades)
- Opponent scouting report (formation/down tendencies with run/pass splits)

## Key Decisions & Lessons

1. **Auto-tagging accuracy**: Tried three approaches — in-browser heuristics (poor), local YOLO server (marginal), Claude Vision API (functional but inaccurate for coaching use). Manual chip-based tagging is the primary workflow. **Play Tagger panel order** reflects this: Mark Start/End (primary) → play selector → tag form → "More tools" (OCR/suggestions) → a collapsed "Auto-Detect Plays (experimental)" section at the bottom. Auto-detect was demoted from the top since it isn't reliable yet.

2. **API key security**: Stored in `localStorage`, never in project JSON files. Uses `type="password"` input. Travels direct from browser to Anthropic API via `anthropic-dangerous-direct-browser-access` header.

3. **Tag value validation**: All enum fields validated against exact `<option>`/chip values. Fuzzy matching handles case/format differences. Non-matching values are dropped with console warning. This prevents silent dropdown failures and stat corruption.

4. **Unified undo/redo**: `HistoryManager` handles both play data changes and canvas annotations through a single Ctrl+Z/Y interface with fallback callbacks.

5. **Single-file deployment**: The app deploys to GitHub Pages as one self-contained HTML file. No build tools, no dependencies, no server required.

6. **No external libraries**: All parsing (CSV, roster import) uses pure browser JS. No SheetJS, Papa Parse, etc. This preserves the single-file no-dependency design.

7. **Event delegation for modals**: Season and import modals use document-level click delegation with `e.target.id` checks. Don't add `stopPropagation()` on modal containers — it breaks the delegated button handlers.
