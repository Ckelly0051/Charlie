# GridIron IQ — Architecture reference

Where the code lives and how the pieces fit. **Rules and invariants live in
`CLAUDE.md`; product direction lives in `GRIDIRON-IQ-PLAN-V2.md`; testing tiers
live in `docs/TESTING.md`; desktop packaging lives in `TAURI.md`.** This file
does not restate those.

A browser-based football film analysis tool for coaches, also shipped as an
installed Windows desktop app. Load game film, mark plays, tag them, get stats,
tendencies, cut-ups, call sheets, and game plans.

---

## Build

`index.html` → **Vite** (`npm run build`) → `dist/` → **Tauri**
(`frontendDist: "../dist"`, `beforeBuildCommand: "npm run build"`).

That is the only build. `build.sh` and the single-file
`football-film-analyzer.html` bundle are **deleted** — there is no second build
path and no shared-global-scope constraint. Every module is a plain ES module.

Tests resolve the app through `tools/app-entry.mjs`, which serves `dist/` over
loopback HTTP; Chromium blocks Vite's split module/CSS assets over `file://`.

---

## Route architecture

`WorkspaceShell` (`js/workspace-shell.js`) owns the chrome — top navigation, the
Program/Season/Game context bar, global tools — and five routes: **Home, Break
Down, Study, Reports, Plan**. Each route is a Preact tree mounted once at shell
init and toggled by visibility; routes do not unmount between navigations.

Each route pairs a **screen controller** (plain JS: state, commands, an
injected-dependency `subscribe()`/`snapshot()` seam) with a **Preact view**
(`.jsx`, presentation only). Change behavior in the controller, presentation in
the view.

`#giLegacyEngineHost`, `#wsClassicOutlet`, `#app`, the classic top bar,
breadcrumb, game dropdown, settings drawer, and mobile bottom tabs are
**deleted**. Native routes are the only coach-facing presentation owners. Some
source comments still describe why a current fallback exists in terms of what
was removed; that is history, not live structure.

| Route | Controller | View |
|---|---|---|
| Home | `home-screen.js` | `native-home.jsx` |
| Team Hub (season library) | `team-hub-screen.js` | `native-team-hub.jsx` |
| Break Down | `breakdown-workspace.js` | — |
| ├ film theater | `breakdown-theater-screen.js` | `native-breakdown-theater.jsx` |
| ├ charting deck | `native-tagging-screen.js` | `native-tagging.jsx` |
| └ Film Room | `native-film-room-screen.js` | `native-film-room.jsx` |
| Study | `study-screen.js` | `native-study.jsx` |
| Reports | `reports-screen.js` | `native-report-tabs.jsx`, `native-reports.jsx` |
| Plan | `plan-screen.js` | `native-plan.jsx` |
| Settings | `settings-screen.js` | `native-settings.jsx` |
| Game create/edit | `game-screen.js` | `native-game-form.jsx` |

Overlays (dialog, sheet, toast, popover) are owned by
`native-overlay-service.js` and rendered by `native-root.jsx`. The interaction
contract — focus trap, focus return, Escape ownership, stacking, destructive
confirmation, toast timing — is `GRIDIRON-IQ-OVERLAY-SPEC.md`.

---

## Module map (103 modules in `js/`)

**Shell and routes**
`workspace-shell.js`, `workspace-context.js`, `game-context.js`,
`home-screen.js`, `team-hub-screen.js`, `breakdown-workspace.js`,
`breakdown-theater-screen.js`, `native-tagging-screen.js`,
`native-film-room-screen.js`, `study-screen.js`, `reports-screen.js`,
`plan-screen.js`, `settings-screen.js`, `game-screen.js`,
`shortcuts-screen.js`, `play-import-screen.js`, `auto-detect-screen.js`,
`native-overlay-service.js`, `native-root.jsx` (+ the `native-*.jsx` views)

**Storage and persistence**
`season-store.js` (season model, write queue, revision fence),
`storage.js` (live ↔ store bridge, film load),
`storage-backend.js` (`BrowserBackend` / `TauriBackend` seam),
`sql-catalog.js` + `catalog-persistence.js` (canonical desktop catalog),
`snapshot-envelope.js` (versioned recovery snapshots),
`version-manager.js`, `history-manager.js`, `team-registry.js`

**Film**
`video-controller.js`, `playlist-manager.js`, `clip-identity.js`,
`multi-angle.js`, `canvas-overlay.js`, `cutup-player.js`, `cutup-exporter.js`,
`cross-game-cutup.js`, `film-navigation-service.js`, `game-thumbnail.js`

**Football model**
`play-tagger.js`, `tag-projection.js`, `tag-library.js`, `custom-chips.js`,
`custom-fields.js`, `penalty-model.js`, `special-teams.js`,
`play-call-model.js`, `playbook-library.js`, `football-rules.js`,
`roster-manager.js`, `notes-manager.js`, `play-diagram.js`,
`breakdown-charting-service.js`

**Analytics**
`stats-engine.js` (all formulas), `analytics-registry.js` (dimensions and
measures), `analytics-metrics.js`, `study-query.js`, `study-view.js`,
`study-plan.js`, `advanced-metrics.js` (EPA), `report-visual-data.js`,
`reports-view.js`, `charts.js`, `html-report.js`, `plan-export.js`,
`call-sheet-builder.js`, `season-manager.js`

**Auxiliary**
`play-detector.js`, `clip-analyzer.js`, `vision-analyzer.js`,
`backend-client.js`, `scoreboard-ocr.js`, `suggestion-engine.js`,
`quick-chart.js`, `play-filter.js`, `play-grid.js` (Film Room model and edit
semantics), `demo-season.js`, `identity-labels.js`, `ui-polish.js`,
`updater.js`, `beta-config.js`, `app.js` (composition root)

**Deleted — do not reintroduce:** `season-library.js`, `wizard.js`,
`heat-maps.js`, `visualizations.js`, `command-palette.js`,
`legacy-global-bridge.js`.

No module publishes engine classes onto `globalThis`. A harness reaches a class
by importing its owning module (when the logic is DOM-free) or through a live
controller/service on `window.app`. `e2e-p0-exit` and `tools/audit-shell-deps.mjs`
both enforce this.

---

## Data model

**Season** is the unit of work. One season holds many games; each game holds
plays. `SeasonStore.data` is `null` until a season is opened.

```
season { version, type:'season', seasonName, year, level, kind, teamId,
         teamProfile, roster[], plans[], revision, games[], activeGameId }
game   { id, name, status, gameInfo, plays[], nextId, currentPlayId,
         videoFileName, clipNames[], clipPaths[], clipRefs[], isMultiClip,
         filmMode:'managed'|'linked', filmDir }
play   { id, timestamp{start,end}, clipId, catalogClipId, notes, diagram,
         penalties[], specialTeams, tags{…} }
```

`play.tags` carries the football model: situation (`down`, `distance`,
`quarter`, `fieldSide`, `yardLine`, `hash`), offensive look (`formation`,
`backfield`, `strength`, `qbAlignment`, `personnel`, `motion`), the call
(`playCall`, `playCallId`, `playConcept`), outcome (`runPass`, `playType`,
`result`, `yardage`, `playDir`), defense (`defFront`, `coverage`,
`coverageFamily`, `blitz`), `unit`, `driveNumber`, `players{}`, `grades{}`,
and `custom[]`.

Multi-value fields (`formation`, `playType`, `result`, `defFront`, `blitz`)
store `" + "`-joined strings so every string consumer keeps working;
`StatsEngine.splitFormations()` and its siblings are the canonical splitters,
and analytics attribute a play to each component.

`tag-projection.js` is the **read-time** split of legacy combined fields (QB
alignment out of `formation`/`backfield`, coverage family out of `coverage`).
It never mutates stored data — legacy plays read correctly without migration.

Canonical contracts: `GRIDIRON-IQ-TAG-MODEL.md`,
`GRIDIRON-IQ-PENALTY-MODEL.md`, `GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md`,
`GRIDIRON-IQ-PLAY-CALL-MODEL.md`.

---

## Storage

The app never touches `localStorage` or the filesystem directly — it goes
through `StorageBackend`. `detectBackend()` returns `TauriBackend` when
`window.__TAURI__` exists, else `BrowserBackend`. The same UI runs on both.

Each backend provides canonical season load/save, a capped backup ring, and an
optional durable disk target.

- **Browser** — canonical in `localStorage`, backup ring in IndexedDB, optional
  File System Access folder binding (Chromium only).
- **Desktop** — canonical is the SQLite catalog (`sql-catalog.js` via
  `catalog-persistence.js`, `seasons/library.db`), with `season.json` and a
  `Documents/GridIron IQ/` mirror as recovery copies. The mirror is what
  post-wipe recovery reads, and it survives "delete application data".

Restore is reversible: a safety point is written before any restore, and a
failed canonical save rolls the live editor back.

## Film

**Desktop only** has a persistent film library. **Managed** film is copied under
`$APPDATA/seasons/<season>/films/<game>/`; **linked** film is referenced in the
coach's own folder and never copied. Both auto-load on game open through the
Tauri asset protocol. The browser build has no persistent film library and
re-links each session.

Durable identity is `clipPath` / `clipRefs` / `catalogClipId`, never a bare
basename. `planClipMatch` (`playlist-manager.js`) is the single matcher used by
every relink path, tiered: catalog id → exact path → basename → Windows `(n)`
rename → order.

---

## Analytics

`stats-engine.js` owns every formula. `analytics-registry.js` registers
dimensions and measures over it, and `study-query.js` executes grouped queries
returning both values and the exact matching plays.

Every result stays linked to film by composite `gameId::playId` references, so a
Study row, a Reports row, and a Plan item all open exactly the plays that
produced the number. `film-navigation-service.js` is the one playback owner for
Study, Reports, and Plan.

Two gates protect this: `e2e-parity` pins computed values against committed
goldens, and film-reference equality pins the cut-up each row opens.

---

## Also in the tree

- `server/` — optional local Python CV server, off by default; the app makes no
  network call until the coach opts in via Settings → Analysis.
- `design-system/` — tokens, bundled Plex faces, and route comps.
- `src-tauri/` — the Rust desktop shell. See `TAURI.md`.
- `tools/` — 98 `e2e-*.mjs` harnesses plus the gate runner. See
  `docs/TESTING.md`.
