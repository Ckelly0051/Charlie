# GridIron IQ — Operating Document

Browser and Windows-desktop football film analysis for coaches: load film, mark
and tag plays, get stats, tendencies, cut-ups, call sheets and game plans.
Working branch `claude/football-film-analyzer-GRiCW` (CI runs on every branch).
Live URL: https://ckelly0051.github.io/Charlie/

This file is the binding rules only. Read the others when the task needs them:

| Need | Read |
|---|---|
| Current version, installer and release state | `docs/DOCUMENTATION-INDEX.md` > Current Snapshot |
| Open defects (canonical) | `docs/OPEN-DEFECTS.md` |
| What to test | `docs/TESTING.md` |
| Reports rules | `docs/REPORTS-CONTRACTS.md` |
| Home, scouts, film health | `docs/HOME-CONTRACTS.md` |
| Shared palette, type, navigation | `docs/VISUAL-SYSTEM-RULES.md` |
| Architecture and module map | `AGENTS.md` |
| Football models | `GRIDIRON-IQ-TAG-MODEL.md`, `-PENALTY-MODEL.md`, `-SPECIAL-TEAMS-MODEL.md`, `-PLAY-CALL-MODEL.md`, `-WORKSPACE-CONTRACT.md`, `-OVERLAY-SPEC.md` |
| Product direction | `GRIDIRON-IQ-PLAN-V2.md` |
| Desktop packaging | `TAURI.md` |
| Why a rule exists, dated history | `docs/archive/CLAUDE-2026-09-27.md`, `docs/archive/CLAUDE-HISTORY-THROUGH-2026-09-02.md` |

---

## Build

`index.html` → Vite → `dist/` → Tauri (`frontendDist: "../dist"`,
`beforeBuildCommand: "npm run build"`). That is the only build; `build.sh`, the
single-file bundle, `#giLegacyEngineHost` and `#wsClassicOutlet` are deleted.
Native Preact routes are the only presentation owners.

```bash
npm run build   # vite build -> dist/
npm run dev
```

- Tests load the app through `tools/app-entry.mjs` (serves `dist/` over
  loopback; Chromium blocks split assets over `file://`). Build and test in one
  command: mtimes shift between steps and false-fail the stale-bundle guard.
- Version lives in four owners that must match: `js/app.js` `APP_VERSION`,
  `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`
  (`e2e-p0-exit`). Keep the `-N` suffix; `configureBetaDefaults` gates on it.
- Unsigned installers: `cargo tauri build --bundles nsis` with a scratch config
  setting `bundle.createUpdaterArtifacts:false`; build from a clean checkout at
  the committed bump. Releases are cut by pushing a `v*` tag, only when asked.
- Web deploy is the `gh-pages` branch, a verbatim `dist/` copy (clear it first;
  asset names are content-hashed).

## Current owners

Change behavior at its owner, not at a consumer.

| Area | Owner |
|---|---|
| Shell, routes, chrome, context bar | `js/workspace-shell.js` |
| Home | `js/home-screen.js` + `js/native-home.jsx` + `css/native-home.css` |
| Season operations and dialogs | `js/team-hub-screen.js` + `js/native-team-hub.jsx` |
| Team and season registry | `js/team-registry.js` |
| Break Down route | `js/breakdown-workspace.js` (route state) + `js/native-breakdown-route.jsx` (the one tree) |
| Film theater, transport, play strip | `js/breakdown-theater-screen.js` + `js/native-breakdown-theater.jsx` |
| Charting deck | `js/native-tagging-screen.js` + `js/native-tagging.jsx` |
| Film Room grid | `js/native-film-room-screen.js` (model and edits in `js/play-grid.js`) |
| Study | `js/study-screen.js` + `js/native-study.jsx` |
| Reports | `js/reports-screen.js` + `js/native-report-tabs.jsx` |
| Plan | `js/plan-screen.js` + `js/native-plan.jsx` |
| Settings | `js/settings-screen.js` + `js/native-settings.jsx` |
| Game create/edit | `js/game-screen.js` |
| Overlays | `js/native-overlay-service.js` (`GRIDIRON-IQ-OVERLAY-SPEC.md`) |
| Season model and persistence | `js/season-store.js` |
| Live ↔ store bridge, film load | `js/storage.js` |
| Storage seam (browser / Tauri) | `js/storage-backend.js` |
| Desktop catalog | `js/sql-catalog.js` + `js/catalog-persistence.js` |
| Playback across routes | `js/film-navigation-service.js` |
| Analytics formulas | `js/stats-engine.js` |
| Metric and dimension registry | `js/analytics-registry.js`, `js/analytics-metrics.js`, `js/study-query.js` |
| Look vocabulary; old-format detection | `js/tag-projection.js`, `js/season-format.js` |
| Gap, motion path, RPO, QB-run details | `js/charting-details.js` |
| Penalties, Special Teams | `js/penalty-model.js`, `js/special-teams.js` |

No test-only production API: nothing publishes engine classes on `globalThis`
(`e2e-p0-exit`, `tools/audit-shell-deps.mjs`). A harness imports the owning
module or goes through `window.app`.

---

## Binding data rules

**Football accounting:** sacks are passer/team rushing attempts and signed rushing
losses (college convention, coach ruling 2026-09-30), never passing attempts or
passing yards. Keep called Run/Pass unchanged for tendencies and film. Use the
StatsEngine rushing owners; credit the charted Passer regardless of position,
never fall back to Ball Carrier on a sack or rewrite coach tags.

**Coach data**
- Never migrate, clear or rewrite known-bad data. Cleanup needs an impact report
  with exact counts and explicit confirmation immediately before the write.
- Never delete managed film on the coach's behalf without the same confirmation.
- **One season format, no old-format reader.** The live seasons were converted
  once (2026-09-26). `js/season-format.js` alone knows the retired shapes and
  only detects them: an old import, restore point, game version, mirror copy,
  first-run JSON import, CSV with a combined look, or stored season is REFUSED
  with a plain message and nothing is written. No charting path (library,
  templates, auto-detect) can create an old shape.
- A failed durable write reports failure; never report success for a write that
  did not land.

**Persistence**
- A season is the unit of work; `SeasonStore.data` is null until one is open.
- `commitActive()` refuses when the live tagger does not match `_loadedGameId`.
  Undo/redo resets on every game load. Season transitions cancel pending saves
  (`_cancelPendingSaves`) and pin the season id in every debounced callback.
- Durable writes are queued per season (`drainWrites`) and fenced by a
  monotonic `data.revision`.
- `CatalogPersistence` has one writer at a time (`_exclusive()`); the desktop
  catalog is replaced from a synced same-directory staged file, never
  overwritten in place. Version ids cannot touch another game's snapshot; a
  failed version mutation rolls back; a failed deletion reports false.
- Version history lives in the catalog `versions` table (IndexedDB in a
  browser), never localStorage.
- Restore is reversible: a `Backup before restore` point must be durable before
  anything is replaced, and a failed canonical save rolls the editor back.
  Mirror recovery is explicit and confirmed, never automatic.

**Roster** — a roster belongs to one season and its games share it; different
teams, years, levels and seasons are independent. No game record stores a
roster; a stored season carrying game rosters is refused on open with the prior
season, pointer and bytes untouched. Attribution reads the selected season's
roster (`SeasonManager._mergeRoster()`).

**Charting model**
- A play's unit has one reading, `countedUnit()` (stored unit, offense when
  blank), and one write, `PlayTagger.setPlayUnit`, shared by Chart and Film
  Room's Unit column (last write wins). The carried `defaultUnit` seeds only a
  play that does not exist yet. Film Room unit buttons are filters and never
  write. A cell is locked only where the row's unit cannot hold the field
  (`PlayGrid.cellLocked`).
- A drive is possession side plus number (`football-rules.js`:
  `drivePossessionSide`, `groupPlaysByDrive`, `driveLabel`), read from the
  charted unit only. An explicitly numbered special-teams snap joins the
  surrounding drive of that number; never pair its number with a different
  following drive's side. Automatic kickoff boundary/scoring groups apply only
  to unnumbered plays, and never absorb an explicitly numbered try or re-kick.
- Extra points are authored only under `Try` and `Defending a Try`; the Field
  Goal unit has no attempt selector.
- `TagLibrary.DEFINITIONS` owns every library field's defaults, and every
  consumer reads it: deck, grid, cut-up filters, Study, the vision analyzer's
  enum and validator, Quick Chart and the global shortcuts (each built-in has a
  key; the legend lists it). `TagLibrary.RESERVED` keeps an alignment out of
  Formation and Backfield, `Empty` and a receiver distribution out of
  the Family and a coverage family out of Coverage. A new built-in is visible in
  a saved library with no conversion: a default the library's `order` has never
  listed is shown (a value the coach hid stays listed and hidden), read-only
  until the next library edit. `QB Run` and `Reverse` arrived this way.
  Approved fixed report schemas are not resized for a new value without the
  coach.
- `SeasonStore.ST_ALIGNMENT_KEYS` is the one list of fields a Special Teams
  play may not hold, enforced at `PlayTagger._emit` and every serialization path
  (`_stripStAlignmentBeforeSave`). One exemption: a run/pass or Fake try
  (`SpecialTeamsModel.isRunPassTry`) charts its look like a scrimmage snap and
  is kept out of every analytics cohort (`GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md`
  §4b.3d).
- Formation is one coach-named value in the library (stored as
  `formationFamily`): Trips, Bunch and Tight Bunch are formations, not a
  separate receiver-look taxonomy. QB Alignment and Backfield stay separate.
  Personnel follows Formation, before QB Alignment. `strength` is Offensive
  Line Strength: Left, Right, Balanced, Unbalanced Left, Unbalanced Right.
  `receiverSet` is Receiver Alignment: left count x right count, all totals
  1-5, ordered by left then right count; no 0x0. Neither field is inferred
  or cleared by changing Formation. Receiver Strength and Line Balance are
  removed. The old `formation`, `receiverLook`, `receiverSide`,
  `receiverStrength` and `lineBalance` shapes are refused,
  never interpreted. One confirmed tools-only conversion, no compatibility tail.
- Gap, motion start/end, RPO read/defender/decision and QB-run type belong to
  `ChartingDetails`. Coach-approved revision 2026-09-30 (S107-4, repaired in source):
  Gap and Play Direction are independent, neither overwrites or clears the other,
  and Gap can be blank or charted without Direction. Existing stored values stay
  unchanged; no inference or migration. Direction is the coach's broad classification,
  Gap the precise lane. Other details require their opening field (Motion, the
  RPO or QB Run Play Type), and removing that field clears those details in one undoable write
  after the coach confirms. `QB Run` and `Reverse` never fill or imply Run/Pass.
- Left/Right on `strength`, `playDir` and `hash` are always the offense's
  perspective; there is no stored perspective flag and no auto-flip.
- Multi-value tags are `" + "`-joined strings; analytics split and credit each
  component.
- The play strip collects assigned drives by possession side plus drive number,
  orders drives numerically and plays within each drive by play number. Blank
  assignments stay in No drive; rendering never rewrites charting.
- Add Game asks for no analytics perspective; Program versus Scout derives from
  the owning season in `GameScreen.save()`.

**Film identity**
- Durable identity is `clipPath` / `clipRefs` / `catalogClipId`, never a bare
  basename. `planClipMatch` (catalog id → exact path → basename → Windows `(n)`
  → order) is the one matcher for every relink path.
- A linked game's clip set must equal its folder's videos, reported in both
  directions (`missing` / `mismatch`); managed film keeps its one-way rule.
- The durable clip index never shrinks except by deliberate in-app deletion
  (`StorageManager.forgetClipIdentity`, which schedules its own save); a removal
  applies only when no surviving play references the clip. Removed clips are
  stashed for Undo; the selection after Undo is History's.
- The film index is plays' clip identities unioned with the live playlist,
  never the playlist alone. Film loads are latest-wins (`_filmLoadSeq`).
- Linked film is referenced in place, never copied. Library root and a game's
  own folder are separate scopes. Missing film shows an actionable re-link
  state, never a silent copy fallback. Managed-film deletion uses the deleted
  game's own season id.

**Output safety** — escape coach-entered text at the HTML sink (`Charts._esc`),
never at the producer. Analytics changes must pass `e2e-parity` and exact
composite `gameId::playId` film-reference equality; regenerate a golden only as
a reviewed correction named in the diff.

---

## Binding presentation rules

- **Quality standard.** A consumer product: legible, coherent, dense and
  understandable without narration. Approved comps are binding composition
  contracts; a recolor or approximation does not satisfy one.
- **The Charlie Gate.** Before expensive review, packaging or release, show the
  real app with representative real data and get PASS / REVISE / REJECT. A
  green gate never substitutes for it.
- **Design approval authority** is `design-approvals/APPROVALS.json` and its
  manifests only. `COMP_APPROVED`, `IMPLEMENTED_UNVERIFIED`,
  `PRODUCTION_ACCEPTED`, `REJECTED` and `RELEASED` are distinct; never write the
  bare word "approved" for a presentation milestone. Run
  `node tools/audit-design-approvals.mjs` after touching the registry or a
  canonical artifact. An installed smoke approval does not move the registry.
- **Copy.** Literal, concise, operational US English: the object, its state or
  the available action. No reassurance, rationale or implementation language in
  routine labels.
- **Interaction states.** Every enabled control has distinct rest, hover,
  active/selected and `:focus-visible` states without changing its size.
- **Density.** From geometry and padding, never smaller type. Chips ≥30px
  desktop except the approved Break Down Chart target of 27px at its existing
  type size; all chips remain ≥44px on a coarse pointer. No page-level
  horizontal overflow at 1440×900,
  1280×800, 768×1024 or 390×844; wide content scrolls in its own container.
- **Typography.** Bundled IBM Plex Sans / Sans Condensed / Mono; condensed and
  display faces only for true headings and major KPIs. Floors and exceptions are
  in `docs/VISUAL-SYSTEM-RULES.md`.
- **Theme.** `:root` edits are app-wide; surface-specific values go on the
  surface selector, and inherited `color` is computed, not live. Neutral chrome
  is true grey across the whole ladder; blue, cyan and gold are reserved for
  accents and football semantics.
- **Navigation and selectors.** Route targets are long readable labels on
  transparent chrome with the gold underline. Program / Season / Game selectors
  are controls on one graphite surface declared at the shared context-bar owner,
  with a border of at least 3:1 against the bar.
- **Film is never obstructed**: nothing covers or resamples the media surface.
- **Break Down scrollbars.** Chromium cannot render or measure scrollbar chrome,
  so never claim a scrollbar repair on Chromium evidence. No Break Down pane sets
  `scrollbar-width`, `scrollbar-color` (they suppress every
  `::-webkit-scrollbar-*` rule) or `scrollbar-gutter`. Deck rows reflow: no
  `flex-wrap:nowrap` chip row, no hard `min-width`. The play filmstrip is the one
  exempt horizontal scroller. The deck has one 12px inset.
- **A non-modal sheet retargets, never swallows**: `SettingsScreen.open()` on a
  live sheet applies the new tab and target (a nonce remounts the panel).
- **CSS ownership is enforced** (`e2e-css-ownership`, `tools/css-ownership.mjs`):
  no selector branch may require a class production cannot produce. A producer
  is a `class`/`className` attribute, a producing `classList` call, a class
  assignment or `setAttribute('class', …)`, including inside emitted HTML
  strings; a reader (`querySelector`) or a comment is not.
- **Geometry checks are not visual approval.** Inspect populated screenshots
  with real data.

---

## Process

- **Coach direction.** Do the direct ask exactly; don't build what the coach is
  only thinking aloud about. Raise a conflict between a comp and the available
  data immediately.
- **Confirm first** before building an installer, and before each full gate. A
  yes covers one run; the gate belongs at the end of a batch.
- **Smoke findings.** During a coach smoke, log findings and start no fixes
  until the coach says the list is complete.
- **Reviews.** Claude and Codex review each other's work. Verify a reported
  finding against source before acting; several have been wrong.
- **Docs are the handoff.** Update the status snapshot, `docs/OPEN-DEFECTS.md`
  and any changed contract in the same commit as the change.

## Testing

`docs/TESTING.md` says what to run. Non-negotiable:
- A failing-first regression for every repaired defect; mutation-verify
  important new regression assertions and changed guarantees.
- Never redefine a threshold to match what the implementation achieved.
- Give the fixture the same scrutiny as the assertion.
- Baseline "pre-existing" against a committed revision, never your own work.
- Never run two full gates at once or touch processes while one runs.
- Headless Chromium cannot certify installed WebView2 behavior (codecs, asset
  protocol, dialogs, filesystem scope, lifecycle); every installer gets an
  installed smoke.

## Working agreement

- Reproduce before fixing; fix at the root, one change at a time.
- Sweep the container, not just the file: one stranded reference usually means
  the whole container is stranded.
- A check must be as strong as its name.
- Commit the first working pass locally before revising it. Commit at every
  baton pass.
- A design comp's decisions live in its RATIONALE.md; every commit touching a
  comp names that file.
- **Working tree:** never `git add -A` or `git add .`; stage named paths. Never
  reset, clean, stash or absorb another agent's uncommitted work — the tree holds
  untracked installers, artifacts, comps and real film.
- **Shell on this host:** the Bash tool fails here; use PowerShell. Run the gate
  through Git Bash's explicit path:
  `& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /c/Users/charl/Charlie && bash tools/run-gate.sh'`.
- Never commit `dist/`, `node_modules/` or `src-tauri/target/`.

## Durable lessons

- A green gate is not a correct app; whole-app review keeps finding real defects
  behind a green suite.
- Cross-game and cross-season state must be scoped and fuzzed with real
  operation sequences (`e2e-integrity`).
- A display bug is not a data bug: reproduce against the shipped artifact and
  inspect each renderer separately before concluding data is wrong.
- Explicit beats inferred: read a real field rather than parsing another.
- Filter gates must match the data's unit.
- Never trust `window.confirm()` for in-form actions; use the in-app confirm.
- Tauri's asset protocol on Windows is `http://asset.localhost`; both origins
  stay in the CSP.
