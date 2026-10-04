# GridIron IQ — Code Audit (verified against v1.9.28)

> Audited at commit **`1178cf0`** (live HEAD of `claude/football-film-analyzer-GRiCW`,
> v1.9.28 tree). Full-codebase line-by-line review (all 41 `js/` modules, `css/*`,
> `server/*.py`, `build.sh`, `tools/bundle-font.mjs`, `src-tauri/src/main.rs`)
> followed by an adversarial verification pass that re-read the actual code for
> every CRITICAL/HIGH finding.
>
> **Verdicts:** ✅ CONFIRMED = failure reconstructed from the code · ⚠️ PLAUSIBLE
> = real in code, consequence runtime/browser-dependent · ❌ REFUTED = disproved.
> **No code changes have been made.** Suggested fix order: §1 → §2 → §3 first.

---

## ✅ Already fixed (verified) — from the earlier stale pass, now correct
- **Cross-game `commitActive` corruption** — the `_loadedGameId` guard is airtight (v1.9.27).
- **Undo not game-scoped** — `HistoryManager.reset()` runs on every game load, clears both stacks + index (v1.9.28).
- **Undo off-by-one** — false positive; the `if (length === maxSize)` block corrects the index.

---

## 🔴 CRITICAL

### 1. Autosave race writes one season's data into another's slot — DATA LOSS  ✅
`storage.js:76-77` (timer) · `season-store.js:168` (`async openSeason`).
`clearTimeout(this.autoSaveTimer)` appears **only** inside `_autoSave` (its own
debounce) — never on `openSeasonById`/`switchToGame`/`createSeason`/`closeSeason`.
`openSeason` sets `setCurrentSeason(B)`/`currentSeasonId=B` synchronously, then
`await backend.loadSeason()` while `this.data` still holds season A. A pending
autosave firing in that window persists **A's data into B's slot**. The
`_diskTimer` disk-write debounce is likewise not cleared on transitions.
*Fix:* clear both timers at the top of every season/game transition.

### 2. Stored-XSS via unescaped user input in report renderers — SECURITY  ✅
`stats-engine.js`: `${opponent}` raw in `renderScoutReport` (`:3271`) + export
title/filename (`:3352`); `${team}` raw in `renderDefensiveReport` (`:4457`,
`:4476`) and the scoreboard (`:2103/2113/2123`); `${bp.clipName}` raw in
`_renderBigPlays` (`:2818`). `opponent`/`team` come from the Game Info text
inputs, `clipName` from the uploaded filename — all flow to `innerHTML`/
`document.write`. `Charts._esc` exists and the **newer** `renderOpponentScout`/
self-scout paths use it; these older twins were never hardened. Names travel in
shareable season JSON → stored-XSS, not just self-XSS.
*Fix:* wrap every interpolated user/tag value in `Charts._esc`.

### 3. CV server: `*` CORS + no auth + unbounded upload — SECURITY  ✅
`server/app.py:48-53` (`allow_origins/methods/headers = ["*"]`, no auth on any
route) + `:222-231` (`_save_upload` reads 1 MB chunks with no size cap / no
timeout). Any web page open while the server runs can POST a multi-GB body to
`http://127.0.0.1:8765/analyze` and fill the disk; wildcard CORS lets it read
responses. The `127.0.0.1` default bind does **not** mitigate (a browser tab on
the same machine reaches localhost).
*Fix:* cap upload size, add a timeout, restrict CORS to the known local origin.

---

## 🟠 HIGH

### 4. Version save-points collide + `restore()` overwrites the wrong game  ✅
`version-manager.js:43-45` `_key()` = `'ffa_versions_' + (videoFileName ||
'default')`; `videoFileName` is null on the web build (set only on a live video
load, reset on game switch) → **every game/season shares `ffa_versions_default`**.
`restore()` (`:80-92`) calls `storage._deserialize(v.data)` directly, overwriting
the live tagger with another game's plays, bypassing `commitActive`/`persist`/
the `_loadedGameId` guard and the season store. A **third cross-game corruption
path** the v1.9.27/28 fixes don't cover. (Also uses native `confirm()` at `:83`.)

### 5. `nextId` falsy-zero → duplicate play ids  ✅ (low likelihood)
`storage.js:451` and `history-manager.js:140`: `data.nextId || (plays.length+1)`
discards a legitimately-stored `nextId` of `0` and recomputes, which can equal an
existing id (duplicate ids break selection/undo/cut-ups). `season-store.js:125`
correctly uses `== null` — so the fix is to use `??` in the other two. Trigger
(stored `nextId===0` with existing plays) is uncommon, hence low likelihood.

### 6. Film Room grid `_applyEdit` diverges from the form `_saveField` (3 bugs)  ✅
`play-grid.js:683-699, 763-790` vs `play-tagger.js:14-41,126-136,855-879,1302`.
The grid's inline editor re-implements only part of the form's semantics:
- **No multi-select exclusivity** → can produce `result = "Gain + Loss"`; then
  `_applyEdit` derives the sign from `splitResults(...).includes('Loss')` →
  **flips a positive gain to negative** (`:783`).
- **No auto-Gain** — positive yardage doesn't set `result='Gain'` (the form does
  at `:873`), so grid-charted plays are classified differently.
- **`_autoSit` not cleared** — grid down/distance edits (`:766`) don't clear it,
  so `applyNextSituation` (guard `!_autoSit`, `:1302`) **overwrites** the
  correction on the next Save & Next.
*Fix:* route `_applyEdit` through the same path as `_saveField`.

### 7. Cut-up export can hang + includes untagged plays  ✅
`cutup-exporter.js`: `_waitForSeek` (`:211-216`) has no timeout / no
already-at-target guard, and the `await` sits **before** the loop's `video.ended`
check (`:148-155`), so a no-op same-position seek (`start:0` on a clip already at
0) **stalls the export forever**. The filter `p.tags.playType || p.timestamp`
(`:37`) is always-true (every play has a truthy `timestamp` object) → untagged
plays exported. The `end:999` failed-probe sentinel sums ~999 s/play into the
render-time estimate (`:47`).

### 8. Vision/OCR failures on cross-origin film + stale config  ✅
- `vision-analyzer.js:119-133, 40` — tainted-canvas `toDataURL` throws, caught
  per-frame → `frames.length===0` → generic "Could not extract frames" (real
  cause hidden).
- `scoreboard-ocr.js:215` — `recognize()` has no timeout → status sticks on
  "Reading scoreboard…"; `:148-168` — `_ensureTesseract` caches the **rejected**
  promise, so OCR stays "Failed to load" until page reload even after reconnecting.
- `vision-analyzer.js:20` — model id default `claude-opus-4-6` is stale (current
  is opus-4-8 → likely 404); `:318-343` — the validator treats multi-select
  fields as single values, dropping `RPO + Short Pass`-style answers, and the
  `ALLOWED.formation` list is pre-v1.9.15 vocabulary.

### 9. Call sheet: recency sort no-op + multi-select result tags lost  ✅
`call-sheet-builder.js:145,162` — "Most Recent" comparator does
`score(b)-score(a)` where `score` returns `p.timestamp` (an object) →
`NaN` comparator → no reordering. `:189-204` — `_playResult` exact-`switch`es on
`result`, but it's a `" + "`-joined multi-select, so pick-six
(`"Interception + Touchdown"`) matches no case → shows the raw string / bare
yardage instead of `TD`/`INT`.

### 10. App-init fragility + rule violation  ✅
- `command-palette.js` is **entirely dead** — not in `build.sh`, not imported,
  not referenced anywhere (Cmd/Ctrl+K palette is non-functional). Remove or wire it.
- `app.js:1015-1021` — `#lineWidthSlider`/`#btnClearAnnotations`
  `.addEventListener` with no `?.` guard → a missing element throws and **aborts
  the App constructor chain** (the rest of init never wires up).
- `app.js:1022` — native `confirm('Clear all annotations?')` violates the
  project's own lesson #8 (use `_confirmDialog`).

### 11. CV server reliability  ✅
`server/app.py` — blocking `upload.file.read()` and `analyzer.analyze()`/
`detect()` run inside `async def` routes (`:94/128/152`), freezing the event loop
(incl. `/health`); exception handlers return `str(exc)` (`:122/146/217`) leaking
temp paths. `analyzer.py:308-314, 643-647` — `_sample_frames`/`detect` `break`
on the first failed `cap.read()` after a ms-seek → silently under-sample a valid
clip.

### 12. Stats correctness  ✅
- `stats-engine.js:727-735` — passing **attempts double-count**: `attempts =
  completions + incompletions + INTs` are independent filters, so
  `Incomplete + Interception` is counted twice.
- `:548` — **TFL/havoc count penalties & kneel-downs**: `tfl = yardage<0 &&
  !hasResult('Sack')` with no Penalty/Kneel/Spike exclusion.
- `:904` + `:3410` + cut predicates (`:1903/1908/1915/3580` require
  `(parseInt(distance)||0) > 0`) drop **goal-to-go (distance 0)** from the
  Down&Distance table/cuts, while `_situationBucket` keeps it → inconsistent
  denominators. (Low exposure: the app never emits distance 0; only manual entry.)

---

## ⚠️ PLAUSIBLE — confirm live

### 13. Auto-detect may permanently mute the film  ⚠️
`play-detector.js:95-135` — `createMediaElementSource(video)` with no
`disconnect`/reconnection in `finish()` (only `audioCtx.close()`). The missing
teardown is **confirmed in code**; whether the `<video>` stays silent for the
rest of the session after `close()` is browser-dependent and not provable from
source. A 2nd scan throws `InvalidStateError` but it's caught. Worth a live check.

---

## 🟡 MEDIUM / ⚪ LOW — from the review pass (not all independently re-verified)
These were surfaced by the line-by-line review but not put through the adversarial
verifier (recall-biased — treat as leads, confirm before fixing):
- **Backend client**: no fetch timeout; `http://127.0.0.1` is mixed-content-blocked on the https deploy.
- **IndexedDB** request errors swallowed (a failed backup looks like success); two backups within the same ms/second collide and overwrite a restore point.
- **CSV import**: no quoted-field handling (`"Smith, Jr."` shifts columns); doesn't apply the yardage-sign convention (Hudl loss imports as `+`).
- **Import-while-open** overwrites the current season with no confirm (`storage.js`).
- **Multi-angle**: no error handler on a corrupt 2nd angle (sync keeps writing to dead media); canvas not re-synced on DPR/zoom change; cut-up player lacks an `end>start` guard.
- **Print stylesheet stale vs redesign**: `redesign-stats.css` has no `@media print` → the new dashboard prints **dark cards on white paper**.
- **CSS** `--text-primary`/`--text-secondary` used ~10× but never defined (readable only by accident); 1100px breakpoint double-match; `.stats-overlay` z-index (200) inverted below other overlays.
- **Suggestion-engine** cross-game leak (`suggestedThisPlay` never cleared on game switch).
- `parseInt` without radix throughout; canvas annotation undo/redo index corruption under interleaved ops; brittle `build.sh` (collision guard misses destructured names, no output validation).

---

## ❌ REFUTED (do not fix)
- The earlier "undo/redo off-by-one" — corrected by the `length===maxSize` block.
- Cut-up export "hangs on the 999 sentinel itself" — that branch IS rescued by
  `video.ended`; the real hang is the **same-position-seek** stall in §7.
- "Raw names passed to `_confirmDialog` are XSS" — `_confirmDialog` sets the
  message via `.textContent` (`play-tagger.js:745`), so those are safe.

---

## Verification method
Each CRITICAL/HIGH finding was re-checked against the current code (commit
`1178cf0`) — most by an independent adversarial agent returning CONFIRMED /
PLAUSIBLE / REFUTED with line-level evidence; the storage and stats-engine groups
were verified directly by reading the cited functions (`storage.js:76/451`,
`season-store.js:168`, `version-manager.js` in full, `stats-engine.js:548/735/904`,
the XSS sinks). Findings default to REFUTED when the failure can't be constructed
from the source.
