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
├── storage.js                # Project save/load (JSON + localStorage)
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
    formation: '',      // 'Shotgun' | 'Under Center' | 'Pistol' | 'I-Form' | 'Singleback' | 'Empty' | 'Wildcat' | 'Goal Line'
    personnel: '',      // '00'-'23' | 'Jumbo' | 'Goal Line'
    playType: '',       // 'Run Inside' | 'Run Outside' | 'Screen' | 'Short Pass' | 'Medium Pass' | 'Deep Pass' | 'Play Action' | 'RPO' | 'Trick Play'
    result: '',         // 'Gain' | 'Loss' | 'No Gain' | 'Incomplete' | 'Interception' | 'Touchdown' | 'Sack' | 'Fumble' | 'Penalty' | 'Punt' | 'Field Goal' | 'Kneel' | 'Spike'
    yardage: '',        // integer (negative for loss)
    hash: '',           // 'Left' | 'Middle' | 'Right'
    defFront: '',       // '4-3' | '3-4' | 'Nickel' | 'Dime' | 'Quarter' | '4-6'
    coverage: '',       // 'Cover 0'-'Cover 6' | 'Man' | 'Zone'
    blitz: '',          // 'A-Gap' | 'B-Gap' | 'Edge' | 'DB Blitz' | 'Zone Blitz'
    driveNumber: '',    // auto-incremented
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

## Tag Form UI (Chip-Based)

The tag form uses **chip buttons** instead of dropdowns. Each field is a `div.pick-group` containing `button.pick` elements. The `ChipField` wrapper class (in `play-tagger.js`) provides `.value` get/set and `change` events so the rest of the code interacts with chip groups identically to native `<select>` elements.

**Priority layout** (visible without scrolling):
1. Play Type — 9 chips
2. Result — 13 chips
3. Yardage — number input with +/− buttons
4. Down & Distance — 4 chips + input
5. Formation — 8 chips

**Collapsed section** ("Defense & Details"):
Personnel, Def Front, Coverage, Blitz, Hash, Quarter, Field Position, Drive, Custom Tags

**Navigation bar**: ← Prev | Save & Next → | Skip

### Keyboard Shortcuts (active when a play is selected)
| Key | Action |
|-----|--------|
| R, O, S, P, M, D, A, Q, X | Play type (Run In, Run Out, Screen, Short, Med, Deep, PA, RPO, Trick) |
| G, L, N, I, T, W, U, F, E, K | Result (Gain, Loss, None, Inc, TD, Sack, INT, Fum, Pen, Punt) |
| Shift+1-4 | Down number |
| Enter | Save & advance to next play |
| Space | Play/Pause video |
| [ / ] | Mark play start / end |
| 1-6 | Drawing tools (when no play selected) |

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

## Key Decisions & Lessons

1. **Auto-tagging accuracy**: Tried three approaches — in-browser heuristics (poor), local YOLO server (marginal), Claude Vision API (functional but inaccurate for coaching use). Manual chip-based tagging is the primary workflow.

2. **API key security**: Stored in `localStorage`, never in project JSON files. Uses `type="password"` input. Travels direct from browser to Anthropic API via `anthropic-dangerous-direct-browser-access` header.

3. **Tag value validation**: All enum fields validated against exact `<option>`/chip values. Fuzzy matching handles case/format differences. Non-matching values are dropped with console warning. This prevents silent dropdown failures and stat corruption.

4. **Unified undo/redo**: `HistoryManager` handles both play data changes and canvas annotations through a single Ctrl+Z/Y interface with fallback callbacks.

5. **Single-file deployment**: The app deploys to GitHub Pages as one self-contained HTML file. No build tools, no dependencies, no server required.
