# Testing

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
| Break Down theater and film | `e2e-native-breakdown-theater`, `e2e-breakdown-video`, `e2e-breakdown-geometry`, `e2e-breakdown-lifecycle`, `e2e-breakdown-viewport`, `e2e-breakdown-a11y`, `e2e-mark-flow`, `e2e-film-load-race`, `e2e-multi-angle`, `e2e-video-cors` |
| Charting | `e2e-native-tagging`, `e2e-tagging`, `e2e-tag-fields`, `e2e-tag-model`, `e2e-tag-projform`, `e2e-tagger-api`, `e2e-native-quick-chart`, `e2e-play-call-charting`, `e2e-play-library`, `e2e-field-fixes`, `e2e-unit-ownership`, `e2e-custom-fields` (the custom-field editor sheet), `e2e-st-try-charting` (Kick XP / Run/Pass / Fake tries in the deck), `e2e-charting-details` (the detail model: Gap/Direction independence, orphan prompts, vocabulary), `e2e-charting-cutover-deck` (Family, Receiver Set, Gap row, motion, RPO, QB Run in the deck and Film Room) |
| Film Room | `e2e-native-film-room`, `e2e-film-room`, `e2e-film-room-virtualization`, `e2e-film-room-layout`, `e2e-film-room-columns`, `e2e-film-room-sheet`, `e2e-unit-ownership` |
| Study | `e2e-study-screen`, `e2e-study-query`, `e2e-study-players`, `e2e-study-penalties-st`, `e2e-crosstab` |
| Reports | `e2e-native-reports`, `e2e-reports-global-strip`, `e2e-reports-overview`, `e2e-reports-offense`, `e2e-reports-defense-board`, `e2e-reports-special-teams`, `e2e-reports-players`, `e2e-reports-self-scout`, `e2e-reports-season`, `e2e-reports-matchup`, `e2e-reports-down-distance`, `e2e-run-gap-report` (the film-linked run-gap chart and its exports), `e2e-reports-module-system`, `e2e-reports-view-parity`, `e2e-explosive-labels`, `e2e-self-scout` |
| Reports on the canonical season | `e2e-reports-overview-realdata`, `e2e-reports-offense-realdata`, `e2e-reports-defense-realdata`, `e2e-reports-typefloor-realdata` (the only place the type floor is established), `e2e-reports-export-realdata` |
| Plan | `e2e-plan-contract`, `e2e-plan-export`, `e2e-study-plan` |
| Settings and libraries | `e2e-native-settings`, `e2e-tag-library-settings`, `e2e-playbook-library`, `e2e-tag-library`, `e2e-tag-library-storage`, `e2e-beta-config` |
| Game form | `e2e-native-game`, `e2e-game-form-context`, `e2e-game-form-visual` |
| Football models | `e2e-penalty-contract`, `e2e-special-teams-contract`, `e2e-b2-tries`, `e2e-core` |
| Analytics and film navigation | `e2e-analytics-registry`, `e2e-analytics-metrics`, `e2e-analytics-projection`, `e2e-parity` (goldens), `e2e-raw-read-audit`, `e2e-cross-game-cutup`, `e2e-film-navigation` |
| Film identity and health | `e2e-clip-identity`, `e2e-clip-match`, `e2e-relink-legacy` (basename relink, a current tier), `e2e-relink-linked`, `e2e-film-index`, `e2e-film-persist`, `e2e-linked-film`, `e2e-film-clip-set`, `e2e-film-health-realdata`, `e2e-film-storage-setup`, `e2e-addfiles-race`, `e2e-delete-undo-film`, `e2e-data-correctness-batch1` |
| Persistence and catalog | `e2e-sql-catalog`, `e2e-sql-fuzzer`, `e2e-catalog-persistence`, `e2e-catalog-backend`, `e2e-catalog-versions`, `e2e-catalog-fuzzer`, `e2e-catalog-safety`, `e2e-revision-fence`, `e2e-snapshot-envelope`, `e2e-projform-durability`, `e2e-season-roster-scope`, `e2e-roster-ownership`, `e2e-operation-diff`, `e2e-integrity` (fuzzed operation sequences) |
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
# build + full gate (bash is not on this host's PowerShell PATH)
& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /c/Users/charl/Charlie && bash tools/run-gate.sh'
# gate only, when dist/ is fresh
& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /c/Users/charl/Charlie && bash tools/run-gate.sh --no-build'
# prove the runner's own pass/fail detector
& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /c/Users/charl/Charlie && bash tools/run-gate.sh --self-test'
```

Plus Windows CI (`.github/workflows/gate.yml`), the installer built from the
reviewed commit with all four version owners matching (`e2e-p0-exit`), and the
installed WebView2 smoke, which nothing above replaces.

A harness is green only when its exit code is 0 **and** its result line is
clean; the runner checks both and the self-test proves it. Run the self-test
whenever a gate result is doubted or the runner changes.

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
