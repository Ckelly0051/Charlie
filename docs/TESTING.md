# Testing

Harnesses are `tools/e2e-*.mjs`, each a standalone Node script that prints a
result line and exits non-zero on failure. Enumerate them from the filesystem;
never keep a count in prose. Most drive the built app in headless Chromium
through `tools/app-entry.mjs` (serves `dist/` over loopback); DOM-free logic is
tested by importing the owning module in Node. There is no `npm test`.

```bash
node tools/<harness>.mjs
```

Run logs and per-change verification records are history:
`docs/archive/TESTING-2026-09-27.md` and
`docs/archive/TESTING-THROUGH-2026-10-04.md`. Record a run's evidence in its
commit message, not here.

## Choosing what to run

Select by **affected behavior and ownership**: which contracts can now behave
differently? Searching `tools/` for the touched module finds candidates; it is
not a list you must run.

| Change | Run |
|---|---|
| Docs only | Nothing; check that referenced files exist. |
| Test only | The edited harness. |
| One route or owner | Build, then the harness map row(s) for the behavior you changed. Add `e2e-css-ownership` for CSS, `e2e-copy-standard` for coach-facing copy, `e2e-p0-exit` for owners, deleted modules or the version. |
| Shared owner (`season-store`, `storage*`, `catalog*`, `stats-engine`, `workspace-shell`, `native-overlay-service`) | The rows for every consumer whose behavior can change, plus `e2e-parity`, `e2e-integrity` and the Node catalog harnesses when persistence or analytics moved. |
| Comment-only change | Build before and after; `dist/` must be byte-identical. No harness needed. |
| Shared `:root` token or type change | The token list below. |
| Release checkpoint (before an installer) | The full gate, once, when the coach says the batch is done. |

If you cannot name the harness that would catch your defect, you have not
finished choosing.

**Failing first, mutation where it matters.** A repaired defect gets a
regression assertion you watched fail for the right reason. Mutation-verify
(reintroduce the defect, see the named assertion red, restore) for important
new regression assertions and changed guarantees.

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
| Home, season library, scouts | `e2e-home-rail`, `e2e-home-deferred-repair`, `e2e-home-review-repair`, `e2e-home-first-launch`, `e2e-home-breakdown-visual-repair`, `e2e-scout-ownership`, `e2e-v2b-control-center`, `e2e-onboarding` |
| Team Hub, registry, season workflow | `e2e-native-team-hub`, `e2e-team-registry`, `e2e-native-season` |
| Shell, context, cross-cutting | `e2e-workspace-shell`, `e2e-workspace-context`, `e2e-game-context`, `e2e-p0-exit`, `e2e-p0-capabilities`, `e2e-responsive-containment`, `e2e-native-overlay`, `e2e-xss-names`, `e2e-copy-standard`, `e2e-design-system`, `e2e-css-ownership`, `audit-design-approvals` |
| Break Down theater and film | `e2e-breakdown-visual-finish`, `e2e-native-breakdown-theater`, `e2e-breakdown-video`, `e2e-breakdown-geometry`, `e2e-breakdown-lifecycle`, `e2e-breakdown-viewport`, `e2e-breakdown-a11y`, `e2e-mark-flow`, `e2e-film-load-race`, `e2e-multi-angle`, `e2e-video-cors` |
| Charting | `e2e-native-tagging`, `e2e-tagging`, `e2e-tag-fields`, `e2e-tag-model`, `e2e-tag-projform`, `e2e-tagger-api`, `e2e-native-quick-chart`, `e2e-play-call-charting`, `e2e-play-library`, `e2e-field-fixes`, `e2e-unit-ownership`, `e2e-custom-fields`, `e2e-st-try-charting` (tries and Special Teams roster ownership), `e2e-charting-details`, `e2e-charting-cutover-deck` |
| Film Room | `e2e-native-film-room`, `e2e-film-room`, `e2e-film-room-virtualization`, `e2e-film-room-layout`, `e2e-film-room-columns`, `e2e-film-room-sheet`, `e2e-unit-ownership` |
| Study | `e2e-study-screen`, `e2e-study-query`, `e2e-study-players`, `e2e-study-penalties-st`, `e2e-crosstab` |
| Reports | `e2e-native-reports`, `e2e-reports-global-strip`, `e2e-reports-overview`, `e2e-reports-offense`, `e2e-reports-defense-board`, `e2e-reports-special-teams`, `e2e-reports-players`, `e2e-reports-self-scout`, `e2e-reports-season`, `e2e-reports-matchup`, `e2e-reports-down-distance`, `e2e-run-gap-report`, `e2e-reports-module-system`, `e2e-reports-view-parity`, `e2e-explosive-labels`, `e2e-self-scout` |
| Reports on the canonical season | `e2e-reports-overview-realdata`, `e2e-reports-offense-realdata`, `e2e-reports-defense-realdata`, `e2e-reports-typefloor-realdata` (the only place the type floor is established), `e2e-reports-export-realdata` |
| Plan | `e2e-plan-contract`, `e2e-plan-export`, `e2e-study-plan` |
| Settings and libraries | `e2e-native-settings`, `e2e-tag-library-settings`, `e2e-playbook-library`, `e2e-tag-library`, `e2e-tag-library-storage`, `e2e-beta-config` |
| Game form | `e2e-native-game`, `e2e-game-form-context`, `e2e-game-form-visual` |
| Football models | `e2e-penalty-contract`, `e2e-special-teams-contract`, `e2e-b2-tries`, `e2e-core` |
| Analytics and film navigation | `e2e-analytics-registry`, `e2e-analytics-metrics`, `e2e-analytics-projection`, `e2e-parity` (goldens), `e2e-raw-read-audit`, `e2e-cross-game-cutup`, `e2e-film-navigation`, `e2e-pass-loss-and-play-order` |
| Film identity and health | `e2e-clip-identity`, `e2e-clip-match`, `e2e-relink-legacy`, `e2e-relink-linked`, `e2e-film-index`, `e2e-film-persist`, `e2e-linked-film`, `e2e-film-clip-set`, `e2e-film-health-realdata`, `e2e-film-storage-setup`, `e2e-addfiles-race`, `e2e-delete-undo-film`, `e2e-data-correctness-batch1` |
| Persistence and catalog | `e2e-sql-catalog`, `e2e-sql-fuzzer`, `e2e-catalog-persistence`, `e2e-catalog-backend`, `e2e-catalog-versions`, `e2e-catalog-fuzzer`, `e2e-catalog-safety`, `e2e-revision-fence`, `e2e-snapshot-envelope`, `e2e-projform-durability`, `e2e-season-roster-scope`, `e2e-roster-ownership`, `e2e-operation-diff`, `e2e-integrity` (fuzzed operation sequences), `e2e-context-ownership`, `e2e-startup-sidecar` (startup never imports or touches a leftover season.json) |
| Recovery | `e2e-native-recovery`, `e2e-native-mirror-recovery`, `e2e-wipe-recovery`, `e2e-restore-point-throttling` |
| One season format | `e2e-season-format`, `e2e-legacy-inventory` (ratchet: counts only fall), `e2e-legacy-roundtrip`, `e2e-csv-roundtrip`, `e2e-csv-projection`, `e2e-fixture-contract` |
| Gate runner | `e2e-gate-runner`, `e2e-gate-receipt` |
| Real data | `e2e-realdata` plus the canonical-season rows above |

Real-data harnesses read copies only and never write coach data. CI runs them
with `GIQ_REALDATA_OPTIONAL=1`, which is an explicit skip, not proof. The two
real-data Reports harnesses replace their captures under
`artifacts/<name>/latest/` on every run.

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

`bash tools/run-gate.sh` wraps the same runner, including in Windows CI.
`--fresh-browser` disables browser sharing for diagnosis.

**Runner behavior.** Harnesses run serially in separate Node processes.
Compatible launches share Chromium with a fresh isolated browser context per
harness; storage does not survive to the next harness. Chromium recycles after
20 harnesses. Special launch flags get dedicated browsers. No automatic retries.

**Deadlines.** Three minutes per harness; ten for `e2e-integrity`,
`e2e-catalog-fuzzer` and `e2e-sql-fuzzer`; one for the pure analytics model
checks; five for the build. A timeout or interruption is a failure even after a
green result line; the runner kills the process tree and continues serially.

**Logs and receipts.** Full stdout/stderr and the build log go to
`artifacts/gate-logs/<run>/` (gitignored; may contain coach-data diagnostics;
never commit or publish). Each run writes `receipt.json` there: scope, commit,
source and served-bundle hashes before and after, fixture and golden hashes,
every harness's outcome and log hash. `releaseEligible` is true only for a
clean, complete, fresh-build full gate with zero failures or skips and unchanged
hashes. `installedApproval` is always `not-assessed`.

A harness is green only when its exit code is 0 **and** its result line is
clean. Run `--self-test` whenever a gate result is doubted or the runner
changes. Plus Windows CI (`.github/workflows/gate.yml`), the installer built
from the reviewed commit with all four version owners matching, and the
installed WebView2 smoke, which nothing above replaces.

**Startup readiness.** Browser harnesses start through `gotoApp()` in
`tools/app-entry.mjs`, which waits for the Home route, its ready state and loaded
fonts. Add waits only on an observable completion condition, never a guessed
delay.

**Fixtures.** Ordinary fixtures pass `assertCurrentFixture()` (current season
format) before use; deliberately invalid fixtures for refusal tests stay
separate. Integrity prefers the canonical fixture from
`tools/canonical-season.mjs`; `FFA_INTEGRITY_SYNTHETIC=1` forces the portable
one.

**Coverage consolidation.** Combine observations, not distinct failure
contracts. `e2e-explosive-labels` owns Reports wording across pages and scopes;
`e2e-reports-typefloor-realdata` owns the font-size census; the Offense and
Defense real-data harnesses own multi-game content; `e2e-reports-global-strip`
owns navigation. Keep them separate.

## Rules

- **Build and test in one command.** The environment bumps mtimes between steps,
  which false-fails `e2e-parity`'s stale-bundle guard.
- **Never run two full gates at once, and never touch processes while one runs.**
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
  (`tools/canonical-season.mjs`). Synthetic fixtures cover formulas, sparse,
  empty and adversarial states only; they cannot establish Reports visual
  parity. Every Reports board pins module order and row/tile counts in
  populated, sparse, empty and over-cap states.
- **A screenshot comparison must be shown capable of failing**, with the pointer
  parked in a neutral corner and the noise floor measured by capturing the same
  build twice.

## What automation cannot certify

Headless Chromium cannot certify installed WebView2 behavior: codecs, the Tauri
asset protocol and its CSP origins, native dialogs, filesystem scope, the
updater, app lifecycle, or scrollbar chrome. Required installed smoke on every
installer: linked film plays from its real drive; managed film auto-loads after
restart; chart, close, reopen and both data and film survive; switching seasons
keeps counts, tags and film identity.

Geometry checks prove containment, not composition or legibility. Inspect
populated screenshots at the release widths with real data. None of it replaces
the Charlie Gate.
