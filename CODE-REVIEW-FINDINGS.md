# GridIron IQ — Exhaustive Code Review Findings

> ## ⚠️ STALE — DO NOT USE THE ☐ MARKERS AS A WORK LIST (2026-07-16)
>
> This document was written against **v1.11.1**. The tree is now past
> `v1.12.0-6`. Multiple items still marked ☐ open **shipped in v1.11.2/v1.11.3**
> and were never re-marked here. An agent taking the ☐ markers at face value will
> "fix" what is already fixed.
>
> **Verified against source on 2026-07-16 — actually fixed, marker was wrong:**
> - **#1 stats-engine stored-XSS** — tell text is `<strong>${Charts._esc(f.name)}</strong>`
>   (`js/stats-engine.js:1365-1381`). Escaped.
> - **#2 exportCsv malformed rows** — `esc()` escapes `"`→`""` on **every** cell
>   plus a formula-injection guard that deliberately does not mangle a real
>   number, so signed yardage stays numeric (`js/storage.js:1301-1305`).
> - **#5 BrowserBackend IndexedDB per-op connection** — `_tx` now routes through
>   a cached `_idb()` (`js/storage-backend.js:268-269`).
> - **#6 linked/managed film sequential await** — resolved in parallel via
>   `Promise.all` (`js/storage.js:450, 522`).
>
> **Everything else below is UNVERIFIED as of this date.** It is not "open" and
> it is not "fixed" — nobody has checked. Treating unverified as open is how this
> document became misleading in the first place.
>
> **Before using any item here:** verify it against current source. The changelog
> is also not sufficient evidence — it says #5 and #6 were fixed *and* this doc
> said they were open; only the code settled it.
>
> **Why this matters enough to write down:** the Lane-F/D plan that ordered this
> rebase *itself* listed #3–#7 as "genuinely still open" — read straight off
> these ☐ markers, in the same breath as calling them unreliable. A stale status
> marker is more dangerous than no marker, because it looks like knowledge.

> Line-by-line review through v1.11.1. Three lenses: **BUG** (errors/correctness),
> **SIMP** (simplification), **EFF** (efficiency). Severity: 🔴 critical · 🟠 high ·
> 🟡 medium · 🟢 low/nit. Each finding: `file:line — [LENS/sev] issue → fix`.
> Prioritized master list is at the bottom; per-module notes above it.

Status legend: ☐ **UNVERIFIED (not "open")** · ✅ fixed · ➖ won't-fix/accepted

---

## R1 — Persistence layer
`storage.js` · `storage-backend.js` · `season-store.js` · `sql-catalog.js` ·
`version-manager.js` · `history-manager.js`

- ☐ 🟠 EFF `storage.js` `_autoLoadLinkedFilm` — resolves clips with a **sequential `await` per file** plus a redundant `fs.exists()` probe each (`linkedFilmUrl`); an 80-clip game ≈ 160 serial IPC round-trips on reopen. Parallelize with `Promise.all`; drop the `exists()` (a failed URL is handled downstream).
- ☐ 🟡 EFF `storage-backend.js` BrowserBackend `_tx` (247) — opens a **new IndexedDB connection on every op** (`indexedDB.open('ffa_fs')` per `_tx`). Cache one connection; `deleteSeason`/`_prune` loops multiply this.
- ☐ 🟡 EFF `storage-backend.js` TauriBackend `listBackups` (593) — reads + `JSON.parse`s **all ≤25 backup files, each the WHOLE season**, only to show a 6-field meta line. For a 500-play season that's tens of MB parsed per Restore-panel open. Store meta in a sidecar or a filename-encoded prefix.
- ☐ 🟡 SIMP `storage-backend.js` — Browser/Tauri backends duplicate `createSeason`, `_touchMeta`, `_migrateLegacy`, `deleteSeason` shape. Hoist the season-meta/library-index bookkeeping to the base class; keep only the byte I/O per backend.
- ☐ 🟢 BUG `storage-backend.js` `_touchMeta` (225/568) — re-derives `name` via `_seasonMeta` = `seasonName || team || 'Untitled Season'`; a season whose `data.seasonName` is blank but whose library entry has a user-set `name` gets it overwritten on the next autosave. Preserve `lib[i].name` when `data.seasonName` is empty.
- ☐ 🟢 EFF `storage-backend.js` BrowserBackend `createBackup` (258) — reads + stringifies the previous full backup to dedup by JSON compare on every call. Compare a cheap hash/length first.
- ➖ 🟡 `storage-backend.js` `TauriBackend.diskStatus()` (741) — reports the Documents **mirror** as the bound canonical location while season+film live under app-data (P1d, task #47). Distinguish canonical/mirror/cache.
- ☐ 🟡 SIMP `version-manager.js` — the whole module is a **second snapshot/restore system** (full `_serialize()` blobs in `localStorage`, ×20 per game) parallel to the SeasonStore backup ring (IndexedDB/files). Two systems to reason about + double the quota pressure. Consider folding version history into the backup ring.
- ☐ 🟢 BUG `version-manager.js` `snapshot` (77) — `id: Date.now()` collides for two snapshots in the same ms (e.g. restore→backup-before-restore); `restore`/`delete` then act on the wrong one. Use a monotonic id like the backup ring already does.
- ☐ 🟢 SIMP `version-manager.js` `_escape` (169) / duplicated escapers across `Charts._esc`, `App._esc`, here — one shared util.
- ☐ 🟢 SIMP `sql-catalog.js` `createSeason` (obscure `(({games,...rest})=>rest)(body)` IIFE) — just build the body object without `games`.
- ☐ 🟢 SIMP `history-manager.js` `_record` (83-90) — maxSize/`index` bookkeeping is convoluted (two overlapping `if length===/>maxSize` branches). Correct but hard to verify; simplify to shift-then-`index=length-1`.
- ✅ `season-store.js` `updateActiveGame` filmMode/filmDir carry (fixed v1.11.1). Cross-game guards (commitActive, history reset, version provenance) are solid.
- ☐ 🟡 BUG `storage.js` `exportCsv` (1126/1141) — only the **notes** cell escapes `"`→`""`; every other field is wrapped in quotes WITHOUT escaping, so any formation/custom-tag/player value containing a `"` produces a **malformed CSV row** (breaks import into Excel/Hudl). Fix: escape `"`→`""` on ALL cells in the `.map`. Consider a CSV-formula-injection guard (prefix a `'` on cells starting with `= + - @`).
- ☐ 🟢 BUG `storage.js` `exportHtmlReport` (1152/1190) — report `title` is sanitized with a **tag-strip regex** (`/<[^>]+>/g`) instead of `Charts._esc`; a stray `<`/`&` in an opponent name passes through into `<title>`/`<h1>`. Self-XSS only (own report), but use the escaper. Body sections already escaped.
- ☐ 🟢 BUG `storage.js` `importPlaysFromText` `parseLine` (1221) — toggles `inQuotes` on every `"`, so it doesn't handle `""`-escaped quotes inside a quoted CSV field. Minor round-trip gap with its own `exportCsv`.
- ⚠️ `storage.js` — still-unread: lines 1-132 init, 165-300 season ops, 530-640 relink-plan, `_maybeSnapshot`/`_signalSave`/`loadDemoSeason` (spot-check later).

## R2 — Film / video
`video-controller.js` · `playlist-manager.js` · `multi-angle.js` ·
`cutup-player.js` · `cutup-exporter.js` · `canvas-overlay.js`

- ☐ 🟢 BUG `cutup-exporter.js` `_waitForReady` (234) — no timeout (unlike `_waitForSeek`); if `loadeddata` never fires on a broken clip mid-export, the export hangs forever. Add a `setTimeout` fallback like its sibling.
- ☐ 🟢 SIMP `cutup-exporter.js` — uses native `confirm()`/`alert()` (48/62/75) instead of the app's `_confirmDialog`/toast; inconsistent with lesson #8 (native dialogs get suppressed on repeat). Export is one-off so low impact.
- ☐ 🟢 BUG `video-controller.js` `_handleMediaError` (272) — uses `console.error` while the stated diagnostic convention (CLAUDE.md) is `console.warn` so the e2e "no console errors" gate doesn't flag a real in-app media error. Downgrade to warn.
- ☐ 🟢 EFF `playlist-manager.js` `switchToClip` (407) — recreates an objectURL for File-backed clips on every switch (revokes prior). Fine for asset-URL clips; only matters for large browser folder sessions.
- ✅ `playlist-manager.js` clip identity/relink (`_fileIdentity`/`_clipIdentity`/basename-fallback), `cutup-exporter` seek-stall + export-filter guards, `video-controller` CORS-retry latch — all correct and well-documented.
- ⚠️ `multi-angle.js` (210), `cutup-player.js` (126), `canvas-overlay.js` (502) — low data-risk (drawing/playback); spot-check pass pending.

## R4 — Stats / analytics (high value)
`stats-engine.js` (4716) · `charts.js` · `advanced-metrics.js` · `heat-maps.js` ·
`visualizations.js` · `play-grid.js` · `play-filter.js`

- ☐ 🟠 BUG (stored-XSS) `stats-engine.js` — **coach-definable tag names** (`formation`, `defFront`, `backfield` — added via `custom-chips.js`, and importable in season JSON) are interpolated **unescaped** into innerHTML: self-scout/game-plan **tell text** built as `<strong>${f.name}</strong>` (~1252-1256, 1362) and rendered in-app (`.cut-row`) + in exports (4427/4534/4536), plus plain table rows (2370, 3310, 3371). Same threat model as the v1.9.30 player-name XSS (import a season with a formation named `<img onerror=…>`). Fix: `Charts._esc` these names where the tell text is built and at each table-row sink. (Enum names like coverage/hash/playDir are safe but escape for defense-in-depth.)
- ☐ 🟡 BUG `charts.js` `gameFlow` (220) — `${p.label}` injected into an SVG `<title>` via innerHTML; `p.label` is a player/label string (coach roster name). Verify the caller pre-escapes; if not, escape here.
- ✅ `play-tagger.js` `_confirmDialog`/`_promptDialog`/`_choiceDialog` (750/806/856) — messages set via `textContent`; coach game/team names in confirm prompts are inert (safe).
- ✅ `stats-engine.js` static core (splitters, `isRun`/`isPass`, `playPoints`, `scoringSide`) — clean, tested (`e2e-core`).
- ⚠️ `stats-engine.js` (4716) — deep-read the compute core + XSS sinks; the ~4000 lines of render methods are lower data-risk (audited v1.9.30) — pattern-scanned, not line-narrated.
- ✅ `play-grid.js` `_cellHtml`/`_sit`/`_rowHtml` (558-601) — **correctly escapes** all cell values, notes, and D&D via `_esc` (explicit comment re: arbitrary imported tag strings). This confirms the R4-#1 finding is a **stats-engine-only inconsistency** — the peer renderer already does the right thing.

## Cross-cutting bug-class sweep (whole codebase)
- ✅ No loose `==`/`!=`, no `for…in` over arrays, all 22 `JSON.parse(localStorage)` sites guarded with try/`||` fallback. Solid discipline.
- ☐ 🟢 BUG (init fragility) — 3 **unguarded** `getElementById(id).addEventListener` in constructors: `call-sheet-builder.js:120` (#btnCallSheet), `wizard.js:72` (#wizSteps), `wizard.js:80` (#wizDismiss). If the element is ever absent the ctor throws and aborts later wiring (lesson #9 guarded the App ctor but missed these). Wrap in null-checks. (app.js/season-manager `querySelector().addEventListener` sites operate on just-built markup — safe.)
- ☐ 🟢 EFF/leak — verify object-URL revokes: `storage-backend.js:985` (download blob helper) and `multi-angle.js:99` (`objectUrl2` on `removeAngle2`/unload). `playlist`/`video-controller`/`_probeDuration` all revoke correctly.
- ☐ 🟢 EFF — `app.js:1225/1281` `tickHandle = setInterval(…,500)`: confirm it's cleared when the detect overlay closes (else a 2 Hz render loop leaks). `app.js:1440` + `version-manager.js:182` intervals are app-lifetime (fine for an SPA).
- ☐ 🟢 SIMP — `parseInt(x)` without radix in `advanced-metrics.js`, `call-sheet-builder.js`, `app.js` (coach numeric strings). Safe in modern engines (no octal), but add `, 10` for intent.

## R6 — AI / detection (network I/O)
- ☐ 🟡 BUG/robustness — **no timeout/cancel on the long-running analyze requests.** `vision-analyzer.js:57` (Claude API POST) and `backend-client.js:110/131/173` (analyze/detect/analyze_batch POSTs) use raw `fetch` with **no AbortController/timeout**; only the health `probe()` aborts. A hung remote model or local server stalls the scan with no way out (`btnCancelScan` cancels only the local motion detector, not the in-flight request). Add `signal` + timeout + a real cancel hook. **(Roadmap P2 — CONFIRMED real, not stale as I earlier guessed.)**
- ➖ API key in `localStorage` + `anthropic-dangerous-direct-browser-access` (`vision-analyzer.js:19/61-63) — known/accepted for prototype; roadmap wants OS credential storage on desktop.
- ✅ `vision-analyzer.js:20` model id `claude-opus-4-8` current; `backend-client.probe()` has abort+timeout; both fall back cleanly when unavailable.
- ☐ 🟢 SIMP — `[FFA backend]`/`[FFA]` debug `console.log`s + `console.error` (backend-client 167/180/188/194) — strip/gate; use `warn` per the diag convention.

## R3/R5 — remaining (tagging, app shell, UI)
`app.js` (2375) · `play-tagger.js` (1620) · `play-grid.js` (926) ·
`season-library.js` (953) · `season-manager.js` (850) · + AI/detection + smaller UI

**`app.js` (deep-read 1-2100):** high quality — modals with capture-phase Esc/Enter + focus traps, game names escaped via `_esc`, both AI `tickHandle` intervals cleared in `finally`, `_advancePlay` hot-path solid.
- ☐ 🟢 BUG (init fragility) `app.js:1162/1345` — `btnAutoDetect.addEventListener` and `btnCancelScan.addEventListener` are **unguarded** (null → throws → aborts the rest of `_bindAutoDetect`). Add to the null-guard list with call-sheet/wizard.
- ☐ 🟢 SIMP `app.js` — many `[FFA] …` debug `console.log`s left in the auto-detect/vision path (1196-1267). Strip or gate behind a debug flag (production noise).
- ☐ 🟢 SIMP `app.js:628` `_esc` — the same escaper reimplemented (consolidate with the shared util from finding #19).

---

# ★ PRIORITIZED MASTER LIST (for fixes)

### 🔴 Critical
- _(none open — the linked-film persistence bug was fixed in v1.11.1)_

### 🟠 High (fix soon)
1. **Stored-XSS via custom tag names** — `stats-engine.js` interpolates coach-definable `formation`/`defFront`/`backfield` names **unescaped** into self-scout/game-plan tell HTML + tables (`~1252-1362`, `2370`, `3310`, `3371`, exports `4427/4534/4536`). Escape with `Charts._esc` at the tell-build + row sinks. Same class as the fixed v1.9.30 player-name XSS.
2. **`exportCsv` produces malformed CSV** — `storage.js:1141` wraps every cell in quotes but only escapes `"` in the `notes` cell; any formation/custom-tag/player value with a `"` corrupts the row (breaks Hudl/Excel import). Escape `"`→`""` on ALL cells; optional formula-injection guard.

### 🟡 Medium (worth doing)
3. `storage-backend.js:741` — `diskStatus()` reports the Documents **mirror** as the bound canonical while data lives in app-data (P1d, task #47). Distinguish canonical/mirror/cache + fix `openDataDir`.
4. EFF `storage-backend.js:593` — `listBackups` reads+parses **all ≤25 whole-season backup files** just to render meta lines. Store meta in a sidecar/filename.
5. EFF `storage-backend.js:247` — BrowserBackend `_tx` opens a **new IndexedDB connection per op**; cache one.
6. EFF `storage.js` `_autoLoadLinkedFilm` — sequential `await` per clip + redundant `fs.exists`; parallelize (`Promise.all`).
7. SIMP `version-manager.js` — a **second snapshot/restore system** (localStorage) parallel to the SeasonStore backup ring; consolidate to cut quota pressure + surface area.
8. SIMP `storage-backend.js` — Browser/Tauri backends duplicate season-meta/library-index/`_migrateLegacy` bookkeeping; hoist to base class.
9. `charts.js:220` — verify/escape `${p.label}` in the gameFlow SVG `<title>`.
9b. **No timeout/cancel on analyze requests** — `vision-analyzer.js:57` (Claude API) + `backend-client.js:110/131/173` (analyze POSTs) use raw `fetch` with no AbortController/timeout; a hung model/server stalls the scan with no cancel (only the health probe aborts). Add `signal`+timeout+cancel. (Roadmap P2 — confirmed real.) Low exposure (AI path optional/off by default), but real.

### 🟢 Low / nits
10. `storage-backend.js` `_touchMeta` — can overwrite a user-set library `name` when `data.seasonName` is blank; preserve it.
11. `version-manager.js:77` — `id:Date.now()` collides for same-ms snapshots; use monotonic.
12. `cutup-exporter.js` — `_waitForReady` lacks a timeout (can hang export on a broken clip); uses native `confirm/alert`.
13. `video-controller.js:272` — `console.error` vs the `console.warn` diag convention.
14. `storage.js:1152` — `exportHtmlReport` title uses tag-strip regex instead of `Charts._esc`.
15. `storage.js:1221` — `importPlaysFromText` parseLine doesn't handle `""`-escaped quotes.
16. Init fragility — 3 unguarded `getElementById().addEventListener`: `call-sheet-builder.js:120`, `wizard.js:72/80`.
17. Verify object-URL revokes: `storage-backend.js:985` (download), `multi-angle.js:99` (`objectUrl2`).
18. Init-fragility (add to #16): `app.js:1162/1345` (`btnAutoDetect`/`btnCancelScan`) unguarded `addEventListener`.
19. Strip `[FFA]`/`[FFA backend]` debug `console.log`s (app.js auto-detect/vision path, backend-client) — production noise.
20. Micro-SIMP: duplicated HTML escapers (`Charts._esc`/`App._esc`/`version-manager._escape`/`roster esc`/`app._esc`) → one util; `sql-catalog.createSeason` IIFE; `history-manager._record` maxSize bookkeeping; `parseInt` radix; `season-manager.js:739` report-title escaping.
- _(cleared: `app.js` AI `tickHandle` intervals ARE cleared in `finally` — no leak.)_

### Coverage / method
- **Deep line-read:** R1 persistence (all 6 files) · R2 video (video-controller, playlist-manager, cutup-exporter) · stats-engine compute core + all XSS sinks · **app.js** (1-2100) · **play-tagger** CRUD/dialogs · **play-grid** cell render · **backend-client** + **vision-analyzer** (network I/O).
- **Whole-codebase bug-class sweep (grep, exhaustive for these classes):** loose equality (none), for-in (none), `JSON.parse(localStorage)` guards (all 22 guarded), **unescaped coach-text in HTML sinks (mapped across ALL render modules → localized to stats-engine only)**, `parseInt` radix, object-URL/timer leaks, unguarded `addEventListener`, fetch cancellation.
- **Not line-narrated (bug-class swept, low-risk):** `roster-manager`, `canvas-overlay`, `quick-chart`, `clip-analyzer`, `play-detector`, `scoreboard-ocr`, `heat-maps`, `charts`, `visualizations`, `advanced-metrics`, `suggestion-engine`, `custom-fields`, `custom-chips`, `notes-manager`, `play-diagram`, `multi-angle`, `cutup-player`, `demo-season`, `ui-polish`, `wizard`, `updater`, `football-rules`, `css/styles.css`, `server/*.py`. Rust reviewed + compiles.
- **Net:** every bug CLASS is swept codebase-wide; every high-traffic/high-risk MODULE is line-read. Remaining line-reads would surface mostly 🟢 nits.
