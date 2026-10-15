# GridIron IQ — Architecture reference

Where the code lives and how the pieces fit. **Rules and invariants live in
`CLAUDE.md`; product direction lives in `GRIDIRON-IQ-PLAN-V2.md`; testing tiers
live in `docs/TESTING.md`; desktop packaging lives in `TAURI.md`; documentation
authority and open issues live in `docs/DOCUMENTATION-INDEX.md` and
`docs/OPEN-DEFECTS.md`; the shared visual contract lives in
`docs/VISUAL-SYSTEM-RULES.md`.** This file does not restate those.

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
**deleted**. Native routes are the only coach-facing presentation owners.

| Route | Controller | View |
|---|---|---|
| Home | `home-screen.js` | `native-home.jsx` |
| Team Hub (season library) | `team-hub-screen.js` | `native-team-hub.jsx` |
| Break Down | `breakdown-workspace.js` | `native-breakdown-route.jsx` |
| ├ film theater | `breakdown-theater-screen.js` | `native-breakdown-theater.jsx` |
| ├ charting deck | `native-tagging-screen.js` | `native-tagging.jsx` |
| └ Film Room | `native-film-room-screen.js` | `native-film-room.jsx` |
| Study | `study-screen.js` | `native-study.jsx` |
| Reports | `reports-screen.js` | `native-report-tabs.jsx`, `native-reports.jsx` |
| Dashboards (in Reports) | `report-builder-screen.js` (numbers: `report-builder.js`) | `native-report-builder.jsx` |
| Plan | `plan-screen.js` | `native-plan.jsx` |
| Settings | `settings-screen.js` | `native-settings.jsx` |
| Game create/edit | `game-screen.js` | `native-game-form.jsx` |

Overlays (dialog, sheet, toast, popover) are owned by
`native-overlay-service.js` and rendered by `native-root.jsx`. The interaction
contract — focus trap, focus return, Escape ownership, stacking, destructive
confirmation, toast timing — is `GRIDIRON-IQ-OVERLAY-SPEC.md`.

---

## Module map

**Shell and routes**
`workspace-shell.js`, `workspace-context.js`, `game-context.js`,
`home-screen.js`, `team-hub-screen.js`, `breakdown-workspace.js`,
`breakdown-theater-screen.js`, `native-tagging-screen.js`,
`native-film-room-screen.js`, `study-screen.js`, `reports-screen.js`,
`plan-screen.js`, `settings-screen.js`, `game-screen.js`,
`shortcuts-screen.js`, `play-import-screen.js`, `auto-detect-screen.js`,
`report-builder-screen.js`, `native-overlay-service.js`, `native-root.jsx`,
`chart-deck-presentation.js`

**Views**
`native-autodetect.jsx`, `native-breakdown-route.jsx`,
`native-breakdown-theater.jsx`, `native-call-sheet.jsx`,
`native-custom-fields.jsx`, `native-defense-board.jsx`,
`native-detection-review.jsx`, `native-film-empty.jsx`, `native-film-room.jsx`,
`native-game-form.jsx`, `native-home.jsx`, `native-offense-visuals.jsx`,
`native-plan.jsx`, `native-play-diagram.jsx`, `native-play-import.jsx`,
`native-popover.jsx`, `native-quick-chart.jsx`, `native-report-builder.jsx`,
`native-report-kit.jsx`, `native-report-tabs.jsx`, `native-reports.jsx`,
`native-settings.jsx`, `native-shortcuts.jsx`, `native-study-plan-picker.jsx`,
`native-study.jsx`, `native-tagging.jsx`, `native-team-hub.jsx`,
`native-workspace-chrome.jsx`

**Storage and persistence**
`season-store.js` (season model, write queue, revision fence),
`storage.js` (live ↔ store bridge, film load),
`storage-backend.js` (`BrowserBackend` / `TauriBackend` seam),
`sql-catalog.js` + `catalog-persistence.js` (canonical desktop catalog),
`snapshot-envelope.js` (versioned recovery snapshots),
`season-format.js` (detects and refuses retired season shapes),
`version-manager.js`, `history-manager.js`, `team-registry.js`, `storage-paths.js`

**Film**
`video-controller.js`, `playlist-manager.js`, `clip-identity.js`,
`multi-angle.js`, `canvas-overlay.js`, `cutup-player.js`, `cutup-exporter.js`,
`cross-game-cutup.js`, `film-navigation-service.js`, `game-thumbnail.js`

**Football model**
`play-tagger.js`, `play-shape.js`, `receiver-details.js`, `tag-projection.js`,
`charting-details.js`, `tag-library.js`, `tag-library-settings.js`, `custom-chips.js`,
`custom-fields.js`, `penalty-model.js`, `special-teams.js`, `missed-tackles.js`,
`play-call-model.js`, `playbook-library.js`, `football-rules.js`,
`roster-manager.js`, `notes-manager.js`, `play-diagram.js`,
`breakdown-charting-service.js`

**Analytics**
`stats-engine.js` (all formulas), `analytics-registry.js` (dimensions and
measures), `analytics-metrics.js`, `study-query.js`, `study-view.js`,
`study-plan.js`, `advanced-metrics.js` (EPA), `reports-view.js`, `charts.js`, `html-report.js`, `plan-export.js`,
`call-sheet-builder.js`, `season-manager.js`, `report-builder.js`

**Auxiliary**
`play-detector.js`, `clip-analyzer.js`, `vision-analyzer.js`,
`backend-client.js`, `scoreboard-ocr.js`,
`quick-chart.js`, `play-filter.js`, `play-grid.js` (Film Room model and edit
semantics), `demo-season.js`, `identity-labels.js`, `ui-polish.js`,
`updater.js`, `beta-config.js`, `app.js` (composition root)

No module publishes engine classes onto `globalThis`. A harness reaches a class
by importing its owning module (when the logic is DOM-free) or through a live
controller/service on `window.app`. `e2e-p0-exit` checks source publication;
`e2e-workspace-shell` checks live class identity, including platform-name collisions.

The module list above is exhaustive and checked by `e2e-p0-exit`. New or
removed modules require updating it in the same change. It describes placement;
the behavior paths below describe change impact, not just imports.

## Behavior and change impact

| Path | Owners and flow | Focused proof |
|---|---|---|
| Chart edit | `native-tagging.jsx` calls `native-tagging-screen.js`, then `play-tagger.js`; draft mutations publish `draft-updated`, not stored stats | `e2e-charting-save`, `e2e-native-tagging`, `e2e-chart-deck-polish` |
| Chart Save / Undo | `play-tagger.js` settles the visible shape via `play-shape.js`; saved `play-updated` reaches `history-manager.js` and `storage.js` | `e2e-charting-save`, `e2e-delete-undo-film`, `e2e-operation-diff` |
| Other chart writers | `play-grid.js`, `quick-chart.js`, copies/templates and imports must preserve confirmations and settle at the tagger/shape owners | `e2e-receiver-write-guards`, `e2e-film-room`, `e2e-native-quick-chart`, `e2e-csv-roundtrip` |
| Durable save | `storage.js` commits the loaded game to `season-store.js`; per-season writes/revisions go through `storage-backend.js`; desktop `catalog-persistence.js` serializes `sql-catalog.js` staged writes and mirror recovery | `e2e-context-ownership`, `e2e-failed-save-ownership`, `e2e-revision-fence`, `e2e-catalog-persistence`, `e2e-integrity` |
| Navigation | `app.js` / `film-navigation-service.js` select through `storage.js`; loaded-game identity, latest-wins reads and pending-save cancellation fence the transition | `e2e-context-ownership`, `e2e-film-navigation`, `e2e-film-load-race` |
| Analytics | stored plays feed `stats-engine.js`; `analytics-metrics.js`, `analytics-registry.js` and `study-query.js` define eligible cohorts, samples and exact film refs | `e2e-parity`, `e2e-analytics-metrics`, `e2e-study-query`, canonical Reports harnesses |
| Reports / exports | `reports-screen.js`, `report-builder.js`, `reports-view.js` and their native views consume engine models; HTML sinks escape text; App injects the shared save function into exporters | `e2e-reports-view-parity`, `e2e-export-injection`, `e2e-file-delivery`, `e2e-plan-export` |
| Film / cut-ups | `clip-identity.js` resolves identity; `playlist-manager.js` and `video-controller.js` own playback; `film-navigation-service.js` owns cross-route sets; exporters use play order for multi-clip film | `e2e-clip-identity`, `e2e-film-clip-set`, `e2e-cross-game-cutup`, `e2e-pass-loss-and-play-order` |

Events are part of the dependency surface: the deck subscribes to selection,
play changes and drafts; Storage autosaves stored play changes, not drafts.
`app.js` is the composition root and wires injected services. Static imports
alone do not capture those links. `stats-engine.js` and `advanced-metrics.js`
currently import each other; changes to either require checking both and their
analytics consumers. The planned Reports rebuild owns splitting the engine.

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
         penalties[], specialTeams, receiverDetail, tags{…} }
```

`play.tags` carries the football model: situation (`down`, `distance`,
`quarter`, `fieldSide`, `yardLine`, `hash`), offensive look (`formationFamily`,
`receiverSet`, `backfield`, `strength`, `qbAlignment`, `personnel`, `motion`,
`motionStart`, `motionEnd`), the call (`playCall`, `playCallId`,
`playConcept`), outcome (`runPass`, `playType`, `result`, `yardage`,
`playDir`, `gap`), details (`rpoRead`, `rpoDefender`, `rpoDecision`,
`qbRun`; owned by `charting-details.js`), defense (`defFront`, `coverage`,
`coverageFamily`, `blitz`), `unit`, `driveNumber`, `players{}`, `grades{}`,
and `custom[]`.

Multi-value fields (`playType`, `result`, `defFront`, `blitz`)
store `" + "`-joined strings; the `StatsEngine` split helpers are the canonical
splitters, and analytics attribute a play to each component.

Each look field is stored in its own field; `tag-projection.js` is the plain
read and the vocabulary of values reserved for another field. The live data was
converted once (2026-09-26); `season-format.js` detects and refuses every
retired shape, and no code converts one.

Canonical contracts: `GRIDIRON-IQ-TAG-MODEL.md`,
`GRIDIRON-IQ-PENALTY-MODEL.md`, `GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md`,
`GRIDIRON-IQ-PLAY-CALL-MODEL.md`.

---

## Storage

Canonical season persistence goes through `StorageBackend`. Machine/UI
settings still use localStorage in their owning services; they are not season
data. `detectBackend()` returns `TauriBackend` when
`window.__TAURI__` exists, else `BrowserBackend`. The same UI runs on both.

Each backend provides canonical season load/save, a capped backup ring, and an
optional durable disk target.

- **Browser** — canonical in `localStorage`, backup ring in IndexedDB, optional
  File System Access folder binding (Chromium only).
- **Desktop** — canonical is the SQLite catalog (`sql-catalog.js` via
  `catalog-persistence.js`, `seasons/library.db`), with a
  `Documents/GridIron IQ/` mirror written after every durable save. The mirror
  is what post-wipe recovery reads, and it survives "delete application data".

Restore is reversible: a safety point is written before any restore, and a
failed canonical save rolls the live editor back.

## Film

**Desktop only** has a persistent film library. **Managed** film is copied under
`$APPDATA/seasons/<season>/films/<game>/`; **linked** film is referenced in the
coach's own folder and never copied. Both auto-load on game open through the
Tauri asset protocol. The browser build has no persistent film library and
re-links each session.

Durable identity is `clipPath` / `clipRefs` / `catalogClipId`, never a bare
basename. `planClipMatch` (`clip-identity.js`) is the single matcher used by
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
- `tools/` — `e2e-*.mjs` harnesses plus the gate runner. Enumerate them from
  the filesystem; do not maintain a volatile count in prose. See
  `docs/TESTING.md`.
