# GridIron IQ — Code Audit (verified)

> ⚠️ **STALENESS WARNING:** this audit was performed against commit **`738a36a`
> (~v1.8.3-era)**. The live branch has since advanced to **v1.9.28**, and several
> of those commits overlap these findings — notably **v1.9.27** "Fix cross-game
> data corruption (commitActive wrote the tagger into the wrong game)",
> **v1.9.28** "Second cross-game corruption fix (undo not game-scoped)", and
> **v1.9.26** "tagged plays showing as Untagged". So **§1 and §2 may already be
> fixed**, and **all line numbers below are from the old tree** and will not
> match current code. Re-verify each finding against the current HEAD before
> acting on it.

> Full-codebase review (every JS module, CSS, Python CV server, build script,
> Tauri entry) followed by an adversarial verification pass that re-read the
> actual code for each top finding. Severity reflects the **verified** verdict,
> not the raw first-pass review.
>
> **Status: findings only — no code changes have been made.**
> Suggested fix order: §1 → §2 → §3 (data/security) first, then the
> tagging-correctness batch (§4–§8), then the rest.

## How to read this

- ✅ **CONFIRMED** — verifier reconstructed the failure from the actual code.
- ⚠️ **PLAUSIBLE** — real but runtime/browser-dependent; confirm live.
- ❌ **REFUTED** — first-pass review flagged it, verification disproved it.
  Listed at the bottom so nobody re-investigates them.

Coverage: all 41 `js/` modules, `css/styles.css`, `server/analyzer.py`,
`server/app.py`, `build.sh`, `src-tauri/src/main.rs`. ~176 raw findings;
13 confirmed bugs + 2 plausible after verification; the rest are LOW/cosmetic
(summarized in §15).

---

## ✅ CONFIRMED — fix these

### 1. Version save-points collide and can overwrite the wrong game — DATA LOSS
**`js/version-manager.js:43-45, 80-92, 146-153`**
`_key()` returns `'ffa_versions_' + (storage.videoFileName || 'default')`.
`videoFileName` is `null` at construction, only set from the video `file-loaded`
event, and reset to `null` on every game switch (`storage.js:_clearForNewGame`).
On the browser build films aren't auto-loaded, so **every game and season
collapses onto the single key `ffa_versions_default`**. `restore(id)` then calls
`storage._deserialize(v.data)` which unconditionally assigns
`tagger.plays = data.plays` with **no check that the snapshot belongs to the
current game/season** — so a version captured under a different game can
overwrite the current game's plays/annotations/gameInfo. `snapshot()` and
`restore()` also bypass the season store entirely (no `commitActive()` /
`seasonStore.persist()`).
*Fix direction:* scope the key by season id + game id (not `videoFileName`);
validate the snapshot's origin before restore; route restore through the season
store.

### 2. Autosave race writes one season's data into another's slot — DATA LOSS
**`js/storage.js` (autosave timer) + `js/season-store.js:openSeason`**
The 1s debounced autosave timer (`this.autoSaveTimer`) is cleared **only** inside
`_autoSave` itself — never on season open/close. In `openSeasonById`, the
`await this.seasonStore.openSeason(id)` has a yield window where
`setCurrentSeason(id)`/`currentSeasonId = id` have already switched the target to
season **B**, but `this.data` still holds season **A** (not reassigned until
after `await loadSeason()`). A pending timer firing in that window runs
`_commitAndPersist` → `saveSeason(this.data)` and **writes A's data into B's
storage slot**; corruption surfaces next time B is opened.
*Note:* within-season `switchToGame` and `_clearForNewGame` are **safe**
(synchronous / don't null plays) — the vulnerability is the `openSeason` await
window only.
*Fix direction:* `clearTimeout(this.autoSaveTimer)` at the start of
open/close/switch-season, and/or flush-then-switch.

### 3. XSS / HTML injection via unescaped user input — SECURITY
**`js/stats-engine.js:2455, 2670, 3819, ~4024 (document.write body), ~2758 (blob export)`**
User-controlled values are interpolated into `innerHTML` / `document.write`
without `Charts._esc` (which exists at `charts.js:7` and IS used elsewhere —
inconsistent application):
- `2455` — Big Plays table uses raw `clipName` (uploaded video filename; a coach
  can name a file `<img src=x onerror=...>.mp4`).
- `2670` — scout report `<h2>Scout Report: ${opponent}</h2>` (free-text Game Info
  input).
- `3819` — defensive report `<h2>Defensive Report: ${team}</h2>` (gameTeamName
  input).
- Export path: `_openPrintWindow` escapes the `<title>` but writes `bodyHtml`
  raw via `document.write`, and the scout export embeds `opponent` raw into the
  downloaded Blob HTML + filename.
*Fix direction:* wrap every interpolated tag/Game-Info value in `Charts._esc`;
audit all `innerHTML`/`document.write` sinks in stats-engine.

### 4. Film Room grid edits diverge from the tag form — STATS CORRUPTION
**`js/play-grid.js:683-698, 762-789` vs `js/play-tagger.js:36-41, 117-133, 801-825`**
`play-grid.js _applyEdit` only partially mirrors the form's `_saveField`
(its docstring claims "the SAME semantics as the tag form"):
- **No exclusivity** — the grid's multi-select chip editor toggles chips freely
  and joins all active ones, so it can produce `result = "Gain + Loss"` or
  `playType = "Run Inside + Run Outside"`, which the form's ChipField
  (`_dropRivals`/`exclusiveMap`) forbids. `_applyEdit` then sees `Loss` in the
  split and **flips a positive gain to negative** (`778-784`).
- **No auto-Gain** — entering positive yardage in the form auto-sets
  `result = 'Gain'` (`819-825`); the grid path does not, so identical plays get
  different success/Gain classification.
- **`_autoSit` not cleared** — grid down/distance edits (`765-767`) write tags
  directly without clearing `play._autoSit`, so a later Save & Next recomputes
  and **overwrites the manual correction** (the form clears `_autoSit` at
  `801-803`; the guard at `1183` only protects `!_autoSit` plays).
*Fix direction:* have `_applyEdit` call the same code path as `_saveField`
(exclusivity, auto-Gain, `_autoSit` clearing) instead of re-implementing a subset.

### 5. Quick Chart save + multi-tag bugs
**`js/quick-chart.js:80, 108-111, 241-248`**
- The keydown handler early-returns for `INPUT/TEXTAREA/SELECT` targets **before**
  reaching the Enter→`_confirmAndAdvance` path; since the player fields
  (`qcBallCarrier`, etc.) are `<input>`s, **pressing Enter while focused in one
  never saves/advances** — the core charting keystroke is dead in that focus.
- `_confirmAndAdvance` writes `result`/`playType`/`yardage` as single-value
  strings by direct assignment, bypassing ChipField + `_applyYardageSign`, so
  re-charting a multi-tagged play (`RPO + Short Pass`) **clobbers it** to one
  value.
*Fix direction:* allow Enter from qc inputs to commit; route writes through the
tagger's multi-select setters.

### 6. Roster CSV import has no quoted-field handling
**`js/roster-manager.js:315`**
`line.split(delim)` with no quote awareness. A comma-delimited file with a quoted
name (`"Smith, Jr."`) splits on the internal comma, shifting every subsequent
column → rows corrupted or dropped (jersey# fails `/^\d+$/`).
*Fix direction:* a minimal quoted-CSV parser (still no external lib).

### 7. Call sheet: recency sort no-op + multi-select result tags lost
**`js/call-sheet-builder.js:145, 189-204`**
- "Most Recent" ranking does `score(b) - score(a)` where `score` returns
  `p.timestamp || p.id`, but `timestamp` is an **object** `{start,end}` →
  `object - object = NaN` → `Array.sort` does no reordering. Recency is a silent
  no-op (returns first-N in array order).
- `_playResult` uses exact `switch (t.result)`, but `result` is a `" + "`-joined
  multi-select, so `Interception + Touchdown` (pick-six), `Fumble + Touchdown`,
  etc. match no case → the TD/INT performance tag is lost on exactly the plays a
  coach ranks by.
*Fix direction:* `score = p.timestamp?.start ?? p.id`; use
`StatsEngine.splitResults()`/`hasResult()` in `_playResult`.

### 8. Goal-to-go (distance 0) inconsistency
**`js/stats-engine.js:707, 2807, 1590-1602` vs `886`**
`_downDistanceBuckets` and `_ddKey` drop any play with `!dist` (distance 0), and
the `dd` cut-filter requires `> 0`, so distance-0 plays vanish from the
Down&Distance table, conversion %, self-scout D&D groups, and cuts — but
`_situationBucket` keeps them (`parseInt(distance)||0`, classified by down),
giving **inconsistent denominators** across tables.
*Exposure:* LOW — the app's Auto-D&D never emits 0 (floors at 1); only a coach
manually typing 0 in the distance input (`index.html` `min="0"`) triggers it.
*Fix direction:* either forbid 0 in the input, or treat 0 consistently
(goal-to-go) everywhere.

### 9. Auto-detect permanently mutes the film
**`js/play-detector.js:91-110, 125-135`**
`createMediaElementSource(video)` reroutes the `<video>`'s audio into a Web Audio
graph; `finish()` only calls `audioCtx.close()` and never disconnects/reattaches,
so **after one scan, normal playback is silent for the rest of the session**.
(A second scan would throw `InvalidStateError` — but that's caught and handled,
so it degrades gracefully; the mute is the real bug.)
*Fix direction:* keep a persistent AudioContext/source or route through it
non-destructively; don't capture the element's audio just to measure motion.

### 10. Vision/OCR fail on cross-origin (asset-protocol) video
**`js/vision-analyzer.js:119-132, 40` · `js/scoreboard-ocr.js:187, 205-221`**
Tainted-canvas `toDataURL`/`getImageData` throw `SecurityError` on cross-origin
film (Tauri asset protocol / re-linked clips). Vision catches per-frame →
`frames.length === 0` → generic "Could not extract frames". OCR's
`getImageData` runs **before** its try/catch, so the throw is uncaught and status
sticks on "Reading scoreboard…".
*Fix direction:* detect taint and surface a clear "needs CORS / can't read this
clip" message; wrap the OCR `getImageData`.

### 11. `command-palette.js` is dead in both builds
**`js/command-palette.js` (whole file) · `build.sh` file list**
Imported by no module, absent from `build.sh` — the Cmd/Ctrl+K palette never
loads in either the modular or bundled build. If ever wired, its `_seed()`
references stale handler IDs and it would hijack Ctrl+K.
*Fix direction:* wire it up intentionally, or delete it.

### 12. CV server: unbounded upload + open CORS
**`server/app.py:50, 222-231, 245`**
`_save_upload` streams chunks with **no size cap and no timeout**; CORS is
`allow_origins=["*"]` (+ `*` methods/headers); host is env-configurable
(`FFA_HOST`, default loopback but overridable to `0.0.0.0`). A large/malicious
POST can exhaust disk. Localhost-companion intent reduces severity but the gaps
are real. Also: error responses return `str(exc)` (leaks host paths); blocking
`upload.file.read()` inside `async` routes stalls the event loop; ms-seek frame
sampling with a hard `break` can silently under-sample valid film.
*Fix direction:* cap upload size, add a request timeout, restrict CORS to the
known local origin, return generic errors.

### 13. CSS: undefined theme variables
**`css/styles.css:4885, 4896, 4898, 4901, 4902, 4908, 4915, 4921, 4980, 4987`**
`var(--text-primary)` / `var(--text-secondary)` are used 10× but **never
defined** (the real tokens are `--text` / `--text-dim`). They resolve to the
inherited color — readable today only by accident; any wrapper that re-scopes
`color` makes the import modal / shortcuts modal / roster import / play-grade /
scout-notes text invisible.
*Fix direction:* replace with `var(--text)` / `var(--text-dim)`.

---

## ⚠️ PLAUSIBLE — confirm live

### 14a. Cut-up export same-position seek can stall
**`js/cutup-exporter.js:148, 211-216, 37`**
`_waitForSeek` attaches a `seeked` listener with no timeout and no "already at
target" guard; setting `currentTime = 0` on a freshly loaded clip already at 0
may not emit `seeked` in some browsers → that play stalls. Browser-dependent.
Also the export filter `p.tags.playType || p.timestamp` is effectively
always-true (every play has a `timestamp` object), so untagged plays are
included. *Fix:* add a seek timeout / already-at-target shortcut; fix the filter.

### 14b. z-index layering
**`css/styles.css` — `.finish-game-modal` 2100 vs `.library-overlay` 4000;
`.stats-overlay` 200 vs `.settings-drawer` 600**
Numerically the finish-game modal sits below the library overlay; in practice
they rarely co-occur and a `.drawer-above-library` (4500) mitigation exists for
the drawer case. Establish a documented z-index tier scale.

---

## ❌ REFUTED — do NOT fix (verification disproved these)

- **Undo/redo off-by-one** (`history-manager.js:69-76`). A second
  `if (stack.length === maxSize) { index = length - 1 }` block runs right after
  `shift()` and corrects the index every time. Undo restores the correct
  snapshot.
- **Cut-up export "hangs forever" on the `end:999` sentinel**
  (`cutup-exporter.js`). The wait loop has a `video.ended` clause that resolves
  it; no infinite hang (see §14a for the real, narrower stall).
- **Quick Chart Tab/Ctrl+Z writes to the wrong play.** `nextClip/prevClip`
  delegate to `switchToClip`, which sets `tagger.currentPlayId = clip.playId`,
  so the displayed clip and current play stay in sync.

---

## §15. LOW / cosmetic (not itemized here)
~150 lower-severity items surfaced: falsy-zero/`parseInt` edge cases
(e.g. yardLine 0 dropped from EPA/heat-maps), minor listener leaks, dead
`.sidebar` CSS, stale rose-accent focus glows, duplicate CSS selectors
(`.stats-tab`, `.filter-chip`, `.drive-chart` defined multiple times), no-op
gradient, mobile Save-bar offset vs tab-bar height mismatch (56 vs 64px),
incomplete escaping in scout notes (`replace(/</g,…)` misses `&`/`"`),
`build.sh` line-anchored import/export stripping (brittle but correct today),
double YOLO model load, jersey hue-median misclassifying red. `main.rs`,
`updater.js`, `play-diagram.js`, `football-rules.js` came back clean.

---

## Verification method
Each top finding was re-checked by an independent agent that read the actual
current code and returned CONFIRMED / PLAUSIBLE / REFUTED with line-level
evidence, defaulting to REFUTED when the failure couldn't be constructed from the
source. This removed 3 first-pass false positives and narrowed the scope of two
others (autosave race → season-open path only; export hang → same-position-seek
stall only).
