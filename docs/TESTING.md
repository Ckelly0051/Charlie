# Testing

S107-7 explicit-number review follow-up: four new failing-first model cases
pin numbered kickoff ownership, halftime and return-TD overrides, and numbered
tries excluded from automatic scoring groups. Charting-details 107/107;
theater 69/69, data-correctness-batch1 77/77 and parity 2/2 unchanged. No new
analytics baseline, gate harness, full gate or package.

S107-7, 2026-10-01: charting-details 103/103 (five failing-first regressions),
native-breakdown-theater 69/69 (actual DOM grouping and data no-op),
data-correctness-batch1 77/77 and parity 2/2. Coverage: halftime versus ordinary
quarter changes, consecutive kicks, return TD plus try, explicit no-play re-kick,
manual drive numbers, preserved nonadjacent drive collection and no tag writes.
Read-only live verification confirms 2025 JV Week 1 43/44 and 2026 JV OLL 40/41;
catalog hash unchanged. No analytics baseline changed, new gate harness, full
gate or installer.

S107-6 college sack convention: charting-details additionally pins attribution
to Passer regardless of position and no Ball Carrier fallback when Passer is blank
(96/96). Study players remains 39/39; parity 2/2, with additional canonical changes
confined to rushing player rows/refs, no team-total or other metric changes.
The prior focused checkpoint was charting-details 94/94, Study players 39/39,
Defense board 60/60 and canonical Defense real-data 95/95. Season 100/100,
Players 239/239 and Overview 118/118 also passed during the focused repair run.
The independent raw-field audit compares team/opponent/passer production across
every game and season in the three live seasons plus the canonical fixture:
437/437, coach catalog hash unchanged. Receipt:
`docs/sack-accounting-verification-2026-09-30.json`. Canonical parity changes are
limited to sack-related production, rushing player cohorts and passing averages;
the synthetic golden is unchanged. No new harness added to the gate and no full
gate or packaging run. Historical net-of-sacks audit figures below are superseded
by the coach's college convention, not evidence of the new convention.

S107-5: `e2e-reports-overview` pins total team turnovers independent of margin,
offense plus explicit Special Teams losses, no redundant subtext, unknown and
retained recoveries, ordinary kicks, double representations and no-play rulings.
The screenshot/pixel and containment checks remain unchanged.

Source repairs, 2026-09-30 (S107-2/3/4): failing-first checks reproduced all three
faults. Charting-details covers repeated cross-game pass IDs and a multi-result
single pass, nonadjacent assigned drives, data no-op and independent Gap/Direction.
Native-breakdown-theater verifies regrouping in rendered DOM; cutover-deck verifies
independent edits, undo, call defaults and retained trigger confirmations.
Focused suites pass; the independent live/canonical arithmetic audit passes
4,344/4,344 with an unchanged catalog hash. Evidence:
`docs/stats-engine-repair-verification-2026-09-30.json`.
The local canonical parity golden changed only attempts/completion%/YPA in season
stats and scout report. No game scope changed. No full gate or packaging rerun.

Release gate, 2026-09-30: **140/140 green, zero skipped, zero failed** at
`a449b59e`, on the clean committed post-conversion cleanup. Coach authorized
packaging after green. This replaces the pending-final-gate status; installed
smoke remains outstanding for the `1.12.0-107` candidate.

Cutover complete, 2026-09-30: independent live-data verification receipt in
`docs/charting-live-verification-2026-09-30.json`. Spent converter/archive tools
and their harnesses are deleted. Build and eight focused suites pass after
cleanup: receiver-look, tag-library, charting-details, tag-library-settings,
charting-cutover-deck, season-format, legacy-inventory and legacy-roundtrip.
No new full gate or installed approval. Pre-write safety checks were 45/45
and 13/13; retained as historical evidence, not runnable gate tasks.

Charting-cutover verification, 2026-09-29: full build and gate at `d5b27c10`,
**141 harnesses green, zero skipped, zero failed**. Repairs cover disclosure-arrow
sizing, run-gap export wording, canonical round-trip input, the Formation header
locator and the formation-model result-line format. No assertions were removed.
No live conversion, installer or installed smoke was performed.

Harnesses are `tools/e2e-*.mjs`, each a standalone Node script that prints a
result line and exits non-zero on failure. Enumerate them from the filesystem;
never keep a count in prose. Most drive the built app in headless Chromium
through `tools/app-entry.mjs` (serves `dist/` over loopback); DOM-free logic is
tested by importing the owning module directly. There is no `npm test`.

```bash
node tools/<harness>.mjs
```

Per-harness history, assertion counts and acceptance narratives through
2026-09-27 are in `docs/archive/TESTING-2026-09-27.md`.

## Choosing what to run

Select by **affected behavior and ownership**: which contracts can now behave
differently? A text search for the touched module (`rg -l <module> tools`) is a
discovery aid for finding candidates, not a list you must run.

| Change | Run |
|---|---|
| Docs only | Nothing; check that referenced files exist. |
| Test only | The edited harness. |
| One route or owner | Build, then the harness map row(s) for the behavior you changed. Add `e2e-css-ownership` for CSS, `e2e-copy-standard` for coach-facing copy, `e2e-p0-exit` for owners, deleted modules or the version. |
| Shared owner (`season-store`, `storage*`, `catalog*`, `stats-engine`, `workspace-shell`, `native-overlay-service`) | The rows for every consumer whose behavior can change, plus `e2e-parity`, `e2e-integrity` and the node-only catalog harnesses when persistence or analytics moved. |
| Shared `:root` token or type change | The token list below. |
| Release checkpoint (before an installer) | The full gate, once, when the coach says the batch is done. |

If you cannot name the harness that would catch your defect, you have not
finished choosing.

**Failing first, mutation where it matters.** A repaired defect gets a
regression assertion you watched fail for the right reason. Mutation-verify
(reintroduce the defect, see the named assertion red, restore) for important
new regression assertions and changed guarantees, not for routine fixture or
naming edits.

**A shared `:root` token or type change** repaints every surface, so run:
`e2e-reports-overview`, `e2e-reports-offense`, `e2e-reports-offense-realdata`,
`e2e-reports-defense-realdata`, `e2e-reports-self-scout`, `e2e-reports-season`,
`e2e-reports-players`, `e2e-reports-matchup`, `e2e-reports-special-teams`,
`e2e-native-reports`, `e2e-design-system`, `e2e-workspace-shell`,
`e2e-native-breakdown-theater`, `e2e-native-tagging`, `e2e-p0-exit`,
`e2e-parity`, `e2e-css-ownership`, `audit-design-approvals`, plus
`e2e-breakdown-geometry` and `e2e-home-breakdown-visual-repair` for shell or
typography, and populated screenshots at the release widths with the pointer
parked. `docs/VISUAL-SYSTEM-RULES.md` is the contract.

## Harness map

| Behavior | Harnesses |
|---|---|
| Home, season library, scouts | `e2e-home-rail`, `e2e-home-deferred-repair`, `e2e-home-review-repair`, `e2e-home-first-launch`, `e2e-home-breakdown-visual-repair`, `e2e-scout-ownership` (scout ownership contract), `e2e-v2b-control-center`, `e2e-onboarding` |
| Team Hub, registry, season workflow | `e2e-native-team-hub`, `e2e-team-registry`, `e2e-native-season` |
| Shell, context, cross-cutting | `e2e-workspace-shell`, `e2e-workspace-context`, `e2e-game-context`, `e2e-p0-exit`, `e2e-p0-capabilities`, `e2e-responsive-containment`, `e2e-native-overlay`, `e2e-xss-names`, `e2e-copy-standard`, `e2e-design-system`, `e2e-css-ownership`, `audit-design-approvals` |
| Break Down theater and film | `e2e-breakdown-visual-finish` (BD-UX-1/2: two-line context selectors, the selector menu pattern, narrow selectors, deck label rhythm, Gap inset, full-row off-library value that wraps rather than truncates), `e2e-native-breakdown-theater`, `e2e-breakdown-video`, `e2e-breakdown-geometry`, `e2e-breakdown-lifecycle`, `e2e-breakdown-viewport`, `e2e-breakdown-a11y`, `e2e-mark-flow`, `e2e-film-load-race`, `e2e-multi-angle`, `e2e-video-cors` |
| Charting | `e2e-native-tagging`, `e2e-tagging`, `e2e-tag-fields`, `e2e-tag-model`, `e2e-tag-projform`, `e2e-tagger-api`, `e2e-native-quick-chart`, `e2e-play-call-charting`, `e2e-play-library`, `e2e-field-fixes`, `e2e-unit-ownership`, `e2e-custom-fields` (the custom-field editor sheet), `e2e-st-try-charting` (Kick XP / Run/Pass / Fake tries in the deck), `e2e-charting-details` (the detail model: Gap/Direction independence, orphan prompts, vocabulary), `e2e-charting-cutover-deck` (Family, Receiver Set, Gap row, motion, RPO, QB Run in the deck and Film Room) |
| Film Room | `e2e-native-film-room`, `e2e-film-room`, `e2e-film-room-virtualization`, `e2e-film-room-layout`, `e2e-film-room-columns`, `e2e-film-room-sheet`, `e2e-unit-ownership` |
| Study | `e2e-study-screen`, `e2e-study-query`, `e2e-study-players`, `e2e-study-penalties-st`, `e2e-crosstab` |
| Reports | `e2e-native-reports`, `e2e-reports-global-strip`, `e2e-reports-overview`, `e2e-reports-offense`, `e2e-reports-defense-board`, `e2e-reports-special-teams`, `e2e-reports-players`, `e2e-reports-self-scout`, `e2e-reports-season`, `e2e-reports-matchup`, `e2e-reports-down-distance`, `e2e-run-gap-report` (the film-linked run-gap chart and its exports), `e2e-reports-module-system`, `e2e-reports-view-parity`, `e2e-explosive-labels`, `e2e-self-scout` |
| Reports on the canonical season | `e2e-reports-overview-realdata`, `e2e-reports-offense-realdata`, `e2e-reports-defense-realdata`, `e2e-reports-typefloor-realdata` (the only place the type floor is established), `e2e-reports-export-realdata` |
| Plan | `e2e-plan-contract`, `e2e-plan-export`, `e2e-study-plan` |
| Settings and libraries | `e2e-native-settings`, `e2e-tag-library-settings`, `e2e-playbook-library`, `e2e-tag-library`, `e2e-tag-library-storage`, `e2e-beta-config` |
| Game form | `e2e-native-game`, `e2e-game-form-context`, `e2e-game-form-visual` |
| Football models | `e2e-penalty-contract`, `e2e-special-teams-contract`, `e2e-b2-tries`, `e2e-core` |
| Analytics and film navigation | `e2e-analytics-registry`, `e2e-analytics-metrics`, `e2e-analytics-projection`, `e2e-parity` (goldens), `e2e-raw-read-audit`, `e2e-cross-game-cutup`, `e2e-film-navigation`, `e2e-pass-loss-and-play-order` (pass-for-loss completions; multi-clip cut-up order) |
| Film identity and health | `e2e-clip-identity`, `e2e-clip-match`, `e2e-relink-legacy` (basename relink, a current tier), `e2e-relink-linked`, `e2e-film-index`, `e2e-film-persist`, `e2e-linked-film`, `e2e-film-clip-set`, `e2e-film-health-realdata`, `e2e-film-storage-setup`, `e2e-addfiles-race`, `e2e-delete-undo-film`, `e2e-data-correctness-batch1` |
| Persistence and catalog | `e2e-sql-catalog`, `e2e-sql-fuzzer`, `e2e-catalog-persistence`, `e2e-catalog-backend`, `e2e-catalog-versions`, `e2e-catalog-fuzzer`, `e2e-catalog-safety`, `e2e-revision-fence`, `e2e-snapshot-envelope`, `e2e-projform-durability`, `e2e-season-roster-scope`, `e2e-roster-ownership`, `e2e-operation-diff`, `e2e-integrity` (fuzzed operation sequences), `e2e-context-ownership` (failed reads, overlapping opens, restore and film repair across a game switch, no deferred desktop re-save) |
| Recovery | `e2e-native-recovery`, `e2e-native-mirror-recovery`, `e2e-wipe-recovery`, `e2e-restore-point-throttling` |
| One season format | `e2e-season-format` (every old-format refusal), `e2e-legacy-inventory` (ratchet: counts only fall), `e2e-legacy-roundtrip` (the current-format canonical fixture survives import/save/reopen field for field; fixture and live catalog hashes stay unchanged), `e2e-csv-roundtrip`, `e2e-csv-projection` |
| Real data | `e2e-realdata` plus the canonical-season rows above |

CSV mapping regression (2026-09-29): `e2e-csv-projection` also pins duplicate
aliases, a hidden combined look, duplicate headers and manually duplicated
targets. Refusal leaves plays and nextId unchanged and emits no save; unmapping
the extra column permits retry. Six added checks; 39/39 overall.

Visual follow-up (2026-09-29): `e2e-charting-cutover-deck` asserts the shared
left edge of Play Call, Formation and Backfield labels, plus Formation & Call
in the film strip. `e2e-film-room-sheet` pins the matching play-sheet title.
Geometry and native tagging/theater harnesses remain unchanged and pass.

Formation correction (2026-09-29): `e2e-receiver-look` covers coach-named
formations, directional Receiver Alignment ordering, five Offensive Line Strength
choices and unbalanced toward/away film attribution, invalid-schema refusal
and analytics film filters. `e2e-charting-cutover-deck`
also exercises real deck clicks, independent strength, Film Room edits and CSV
round-trip/refusal. `capture-receiver-look.mjs` compares the source build and
the supplemental comp at 1920, 1440, 1280 and 390 on an isolated canonical
fixture copy; receiver selections are illustrative, and source hashes are
verified unchanged. Evidence is under `artifacts/receiver-look-review/`.

Adversarial follow-up (2026-09-29): `e2e-receiver-look` also rejects non-string
Receiver Alignment on plays, game snapshots and call defaults.
Before the live write, the now-deleted converter harness pinned pre-stage
refusals, catalog round-trip proofs and exact approved strength mappings.
Its regressions failed on unfixed source. It is not part of the current gate;
current data-format guards and their import/restore tests remain.

Real-data harnesses read copies only and never write coach data. CI runs them
with `GIQ_REALDATA_OPTIONAL=1`, which is an explicit skip, not proof.

## Release checkpoint

```powershell
# build + full gate, only after coach authorization
node tools/run-gate.mjs
# gate only, when dist/ is fresh
node tools/run-gate.mjs --no-build
# prove scoring, process ownership, storage isolation and cleanup
node tools/run-gate.mjs --self-test
# build + an explicit focused subset, not a full gate
node tools/run-gate.mjs --only e2e-native-tagging.mjs,e2e-native-reports.mjs
```

`bash tools/run-gate.sh` remains a wrapper for the same runner, including in
Windows CI. `--fresh-browser` disables sharing for diagnosis; direct
`node tools/e2e-*.mjs` invocations also retain their original launch behavior.

The runner keeps harnesses serial and in separate Node processes. Compatible
launches share Chromium but receive fresh isolated browser contexts; extra
contexts belong to that child too. Local storage, cookies, IndexedDB and Cache
Storage do not survive to the next harness. Cleanup runs after failed children,
and Chromium recycles after 20 harnesses to bound accumulated process state.
Special launch flags/profiles/executables use dedicated browsers instead of
silently changing their semantics. Protocol timeouts and viewport settings are
retained. There are no automatic retries or removed assertions.

### Deadlines and Full Logs

Source checkpoint `f84c8be0` (2026-10-02): each harness child has a three-minute
execution deadline, except `e2e-integrity`, `e2e-catalog-fuzzer` and
`e2e-sql-fuzzer` (ten minutes), and the pure analytics registry, projection and
crosstab checks (one minute). Build has five minutes. These are execution
budgets, not reduced operation counts or timing baselines.

A timeout or external interruption is an explicit nonzero result, even if a
child previously printed a green result line. The runner kills its process
tree (Windows `taskkill /T /F`; a dedicated process group on POSIX), awaits its
close, and reclaims shared browser contexts. Timeout failures do not retry;
remaining harnesses run serially. External interruption stops the run.

Complete stdout/stderr is written as it arrives to unique files under
`artifacts/gate-logs/`; console summaries name the full-log paths. Build output
is retained too, including failed builds. Logs are gitignored and may contain
coach-data diagnostics: never commit or publish them automatically. Existing
console tails remain summaries, not the only evidence. No automatic log pruning.

Verification: runner 56/56, including hung children, killing a live descendant,
interruption, complete early/stdout/stderr evidence, distinct log paths,
timeout failure propagation, actual shared-browser survival and clean next
child execution. Fresh-build focused coverage also passed analytics-registry
32/32, canonical integrity 3/3 (960 operations), mark-flow 13/13, native-tagging
89/89, p0-capabilities 10/10 and p0-exit 20/20. The first focused run was 6/7:
one new test wrongly required contexts to survive disconnect; Chromium can
dispose them automatically. The corrected contract requires browser survival,
cleanup and clean next-child execution; the focused rerun passed 2/2.
No full gate or installer on these changes.

Adversarial repairs (`2683d866`, 2026-10-02): context cleanup and browser shutdown
each have a ten-second bound. Failed context cleanup makes that harness red,
records its diagnostic and replaces Chromium before continuing. Stalled browser
shutdown force-terminates its owned process; the Windows kill helper has a
five-second fallback. Partial log writes are completed, while zero-progress,
disk-full and close errors produce controlled failures, not uncaught callbacks.
Termination is independent of successful logging. If disk writes fail, console
evidence names the failure; the log is not represented as complete.

Termination probes synchronize on a heartbeat or browser-ready marker before
arming their short test deadline, with a fifteen-second startup guard. The
scheduler injection is synthetic-test-only; normal gate deadlines still start
at process launch. A deliberate 1.2-second startup delay is exercised.
Runner 63/63 passed, including all four logging-fault modes, bounded cleanup,
owned-process force termination, recovery on the next child, and prior
isolation/readiness/scoring assertions. Fresh build plus all seven focused
harnesses passed: analytics-registry 32, gate-runner 63, integrity 3 (960
operations), mark-flow 13, native-tagging 89, p0-capabilities 10, p0-exit 20.
Zero skipped. Subsequent authorized full gate at `12ca4a03`: fresh build and
**145/145 green, zero skipped and zero failed**, runner 63/63, canonical
integrity 960 operations with unchanged source bytes, analytics parity and all
Reports suites green. Eight shared Chromium launches; special-option tests
retained dedicated browsers. No real harness timeout or logging failure.
All 145 harness log files were read back and their final result lines passed;
the full build log exists too. Local harness logs:
`artifacts/gate-logs/2026-10-02T23-21-38-610Z-5MbVOF/`; build log:
`artifacts/gate-logs/2026-10-02T23-21-37-565Z-3PiKPY/build.log`.
No installer, push or live-data write.

`e2e-gate-runner` covers the old detector cases, failed-build rejection, buried
failure evidence, recycling, failure propagation and orphan cleanup, plus
separate real Chromium children proving storage isolation. 2026-10-02: 37/37;
12 focused harnesses passed on a fresh build through the shared path. The full
gate has not run on this infrastructure; no full-run speed claim is made.
The same native-tagging (89/89), native-reports (102/102) and Study screen
(115/115) harnesses also passed with `--fresh-browser`. All 108 existing
browser harness changes were checked against HEAD: only the Puppeteer import
changed (apart from end-of-file newline normalization), not their assertions.

### Readiness, Model Tests and Fixtures

2026-10-02 follow-up: 12 browser harnesses now use `gotoApp()` from
`tools/app-entry.mjs` for normal library-first startup, including every
integrity campaign navigation. It waits for DOM content, the Home route,
Home's ready state, its rendered root and loaded fonts instead of network-idle
plus a guessed 350/500ms delay. Route/animation/film-specific waits are not
blindly removed; they need their own observable completion condition.
The runner self-test is now 43/43, including negative readiness cases.
Its readiness helper has no `dist/` dependency: the self-test also passed with
`GIQ_APP_ROOT` pointing at a nonexistent build, preserving CI's pre-build order.

`e2e-analytics-registry` (32), `e2e-analytics-projection` (39) and
`e2e-crosstab` (19) run their model assertions directly in Node, with the same
cohorts and expected values. App owner binding is retained in
`e2e-native-reports`: actual registry/stats/metrics ownership, live-tagging
filter binding and Matrix dimensions, alongside its existing page-error checks
(105/105). Browser-only error checks were consolidated there, not treated as
model assertions. Unexpected Node exceptions still fail the harness.

`e2e-fixture-contract` (10/10) validates the portable integrity fixture and the
shared parity/Study fixture against `SeasonFormat` before normalization, and
rejects retired keys, missing units, malformed seasons and invalid Special
Teams events. Ordinary fixtures use `assertCurrentFixture()`; deliberately
invalid rejection fixtures must stay explicitly separate.

Integrity now prefers the current canonical fixture from
`tools/canonical-season.mjs`, not the retired recovered download. Its portable
fixture uses `PlayTagger.blankTags()` and structured punt events, with the same
4 games, 48 plays, three units, 12 seeds and 80 operations per seed. Both raw
inputs are validated before browser startup; real fixture bytes are checked
unchanged afterward. `FFA_INTEGRITY_SYNTHETIC=1` still forces the portable path.
18 affected harnesses passed on a fresh build, including canonical integrity
and unchanged parity. The portable integrity path also passed all 960 operations
(2/2), with no console errors or invariant violations. The subsequent authorized
full gate at `fec0aba9` built successfully and ran all 145 harnesses: **141 green,
zero skipped, four failed**. `e2e-data-correctness-batch1`,
`e2e-legacy-inventory`, `e2e-p0-capabilities` and `e2e-p0-exit` failed five stale
source/inventory assertions, detailed in `docs/OPEN-DEFECTS.md`. No checks were
changed or retried during the run. Eight shared Chromium launches were used;
special launch options retained dedicated browsers. No installer was built.
The failed evidence checks are repaired in `d7cbbdc2`: a fresh build plus
data-correctness-batch1 (77), legacy-inventory (18), p0-capabilities (10),
p0-exit (20), context-ownership (35), gate-runner (43) and study-screen (115)
all passed, zero skipped. Seven in-memory source mutations were rejected by
the updated runner/cleanup guards. This is focused verification, not a new
full-gate result. No product source or coach data changed.
The subsequent coach-authorized full rerun at `07bf04aa` built successfully and
passed **145/145 harnesses, zero skipped and zero failed**. Canonical integrity
completed 960 operations with source bytes unchanged, and analytics parity plus
all Reports suites passed. Eight shared Chromium launches were used, with
dedicated browsers retained for special options. No installer or live-data write.
Coverage
consolidation, deadlines/logging and release receipts are recorded in
`GRIDIRON-IQ-PLAN-V2.md` > Gate Efficiency and Quality.

Plus Windows CI (`.github/workflows/gate.yml`), the installer built from the
reviewed commit with all four version owners matching (`e2e-p0-exit`), and the
installed WebView2 smoke, which nothing above replaces.

A harness is green only when its exit code is 0 **and** its result line is
clean; the runner checks both and the self-test proves it. Run the self-test
whenever a gate result is doubted or the runner changes.

## Coverage Consolidation (2026-10-02)

Consolidate observations, not distinct failure contracts. The Reports mapping:

| Owner | Contract retained | Why separate |
| --- | --- | --- |
| `e2e-explosive-labels` | Source vocabulary; all Reports pages; Defense/ST scopes; wording, clipping, SVG containment, KPI/header geometry; Study; HTML exports; sparse/empty | Canonical St. Peter game at 1440/1280/768, plus synthetic edge states |
| `e2e-reports-typefloor-realdata` | Exact font-size census, exceptions and named narrow modules | Canonical OLL game at 1440/1280; not the same state or assertion as terminology |
| `e2e-reports-offense-realdata` / `e2e-reports-defense-realdata` | Every canonical game, module inventory, scope-specific data and geometry | Multi-game content contracts, not label spelling |
| `e2e-reports-global-strip` | Stable navigation positions, active sections, scopes, exports and responsive chrome | Navigation behavior, not board contents |

The terminology harness now observes each page once per scope and viewport,
collecting labels, KPI line count, header heights and page overflow together.
Its second Defense traversal and duplicate initial-page observations are gone.
All original assertions, fixture breadth and thresholds remain; overflow is
now checked on every visited state rather than only the final page. Six added
assertions pin the eight Defense page/scope states and non-vacuous header
measurement at each width. Missing controls fail; absent scope controls are
accepted only with the report's named empty state. Selected controls must
actually become active. No harness, stress seed or operation count is retired.

Code checkpoint: `ad0807ea`. An in-memory mutation omitting the Scheme page
fails the independent visit-matrix assertion at 1440; no source file or coach
data was modified by that experiment. The isolated terminology rerun passed
48/48 in approximately 21 seconds (the preceding full gate took 83 seconds).
This is an observed run, not a timing threshold or a guaranteed gate-wide gain.
Final focused verification at the committed code checkpoint: fresh build;
terminology 48/48, gate-runner 63/63 and exact typography census 34/34. All
three green, zero skipped/failed. Canonical source bytes remained unchanged.
Complete local logs: `artifacts/gate-logs/2026-10-02T23-49-48-145Z-vnxHz4/`;
build log in sibling `2026-10-02T23-49-47-049Z-6dtA29/`. Full gate was not run.

Subsequent coach-authorized full gate at `e80aba33`: **145/145 green, zero
skipped and zero failed**, fresh build. Runner 63/63; terminology 48/48 in
20 seconds; exact typography 34/34; analytics parity and all Reports suites
green. Canonical integrity completed 12 seeds x 80 operations with source
bytes unchanged. Eight shared Chromium launches; special options retained
dedicated browsers. No retry, real timeout or logging failure. Verified all
145 nonempty harness logs contain final result evidence; local logs:
`artifacts/gate-logs/2026-10-02T23-54-41-741Z-pvwaTy/`, build log in sibling
`2026-10-02T23-54-40-656Z-6fHGt2/`. No installer, version bump, push or
live-data write; installed approval remains `1.12.0-108`.

## Rules

- **Build and test in one command.** The environment bumps mtimes between steps,
  which false-fails `e2e-parity`'s stale-bundle guard.
- **Never run two full gates at once, and never touch processes while one runs.**
  Killing a browser mid-run corrupts the result.
- **Never redefine a threshold to match what the implementation achieved.** Meet
  the requirement or stop and report the conflict.
- **Baseline "pre-existing" against a committed revision** in a throwaway
  worktree (`git worktree add "$env:TEMP\gi-baseline" <commit>`), same command,
  same fixture. Never stash, reset or clean work you did not create.
- **Regenerate an analytics golden only as a reviewed, audited correction** named
  in the diff.
- **Give the fixture the same scrutiny as the assertion.** Assert the subject is
  on screen before asserting about it; chart the real tag vocabulary.
- **Canonical Reports data.** Reports production evidence uses a read-only copy
  of the registered `2025-st-joseph-mavericks-jv` season
  (`tools/canonical-season.mjs`). Synthetic fixtures are labeled and cover
  formulas, sparse, empty and adversarial states only; they cannot establish
  Reports visual parity or acceptance. Every Reports board pins module order and
  row/tile counts in populated, sparse, empty and over-cap states.
- **A screenshot comparison must be shown capable of failing**, with the pointer
  parked in a neutral corner and the noise floor measured by capturing the same
  build twice.

## What automation cannot certify

Headless Chromium cannot certify installed WebView2 behavior: codecs, the Tauri
asset protocol and its CSP origins, native dialogs, filesystem scope, the
updater, app lifecycle, or scrollbar chrome (it renders overlay scrollbars
unconditionally). Required installed smoke on every installer: linked film plays
from its real drive; managed film auto-loads after restart; chart, close, reopen
and both data and film survive; switching seasons keeps counts, tags and film
identity.

Geometry checks prove containment, not composition or legibility. Inspect
populated screenshots at the release widths with real data; for shared chrome,
assert content edges against the route inset, one-row shared bands, no void in a
flexible track, and that two surfaces showing the same measurement agree. None
of it replaces the Charlie Gate.
