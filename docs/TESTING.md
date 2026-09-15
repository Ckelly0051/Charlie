# Testing

Harnesses are discovered from `tools/e2e-*.mjs`; enumerate them from the
filesystem rather than maintaining a count in prose. Each is a standalone Node
script. Most drive the built app in headless Chromium via Puppeteer; a handful
that test DOM-free logic import the owning module directly and need no browser
at all (`e2e-core`, `e2e-catalog-backend`, `e2e-analytics-metrics`,
`e2e-catalog-versions`, `e2e-raw-read-audit`, `e2e-css-ownership`). Booting the
app merely to reach a pure class is not a supported pattern — there is no global
bridge to reach it through.

```bash
node tools/<harness>.mjs
```

There is **no `npm test` script**. `package.json` defines only `build`, `dev`,
and `preview`. Harnesses are invoked by path, individually or through the gate
runner.

Every harness prints a result line and exits non-zero on failure. Enumerate them
from the filesystem rather than from memory:

```powershell
Get-ChildItem tools\e2e-*.mjs | Select-Object -ExpandProperty Name
```

Design evidence has a separate mandatory integrity audit:

```bash
node tools/audit-design-approvals.mjs
```

It verifies that every canonical artifact registered under
`design-approvals/` exists, is tracked, is unique to one surface, and remains
hash-identical to the approved evidence. It does not prove production visual
parity or coach acceptance; those require populated real-app captures and the
Charlie Gate.

### Canonical Reports data

All Reports production comparison, screenshot, and acceptance work uses a
read-only copy of the data source registered in `design-approvals/APPROVALS.json`:

`2025-st-joseph-mavericks-jv` (`2025 St. Joseph Mavericks - JV`)

The registered per-surface artifact governs composition. The registered real
season governs production data. Existing approved captures made with QA data
remain valid composition evidence, but new production captures must use the
real season. Do not write to its Documents-mirror `season.json`; deep-copy it
into isolated test/app state.

Reports boards are fixed schemas, not data-sized dashboards. For each surface,
tests must pin the approved module order and the row/tile count of every module
in populated, sparse, empty, and over-cap states. Sparse data uses the approved
absence treatment without collapsing the board; excess data is ranked and
capped deterministically without growing it. Responsive tests may change the
layout at registered breakpoints, but a data variation may not change the
composition or its dimensions. Canonical-season captures prove the production
binding; synthetic fixtures supplement them with sparse and overflow cases.

Synthetic fixtures are allowed for formula, sparse-state, empty-state, and
adversarial regression coverage. Label them as synthetic. Their results cannot
prove Reports visual parity or football correctness and cannot advance a
surface to `IMPLEMENTED_UNVERIFIED`, `PRODUCTION_ACCEPTED`, or `RELEASED`.

On the designated review machine, missing canonical Reports data is a failure,
not a green skip. CI may use `GIQ_REALDATA_OPTIONAL=1`, but an optional CI skip
cannot certify Reports acceptance. Every Reports evidence handoff must include
the loaded season id/name, actual game count, actual play count, selected
game/scope, and confirmation that the source was copied read-only.

---

## Choosing a tier

Pick the **smallest tier that can actually observe your change**. The question
is not how important the change feels; it is which surfaces can now behave
differently.

| Your change | Tier |
|---|---|
| Copy, a comment, one route's CSS | Focused |
| A route's behavior or markup | Affected route |
| A shared owner (`season-store.js`, `storage.js`, `storage-backend.js`, `stats-engine.js`, `workspace-shell.js`, `native-overlay-service.js`) | Affected route for every consumer, then Release |
| Persistence, migration, film identity, analytics formulas | Release |
| Anything shipping to the coach | Release |

If you cannot name the harness that would catch your defect, you have not
finished choosing a tier — you have skipped one.

---

## Tier 1 — Focused

The smallest existing harness for the route or domain you touched.

| Domain | Harnesses |
|---|---|
| Home | `e2e-home-deferred-repair`, `e2e-home-review-repair`, `e2e-home-first-launch` |
| Team Hub / registry | `e2e-native-team-hub`, `e2e-team-registry`, `e2e-v2b-control-center` |
| Break Down — theater/film | `e2e-native-breakdown-theater`, `e2e-breakdown-video`, `e2e-breakdown-geometry`, `e2e-breakdown-lifecycle` |
| Break Down — charting | `e2e-native-tagging`, `e2e-tagging`, `e2e-tag-fields`, `e2e-tag-model`, `e2e-tag-projform`, `e2e-mark-flow` |
| Film Room | `e2e-native-film-room`, `e2e-film-room`, `e2e-film-room-virtualization` |
| Study | `e2e-study-screen`, `e2e-study-query`, `e2e-study-players`, `e2e-study-penalties-st`, `e2e-crosstab` |
| Reports | `e2e-native-reports`, `e2e-reports-overview`, `e2e-reports-overview-realdata`, `e2e-reports-offense`, `e2e-reports-offense-realdata`, `e2e-reports-defense-realdata`, `e2e-reports-special-teams`, `e2e-reports-players`, `e2e-reports-self-scout`, `e2e-reports-season`, `e2e-reports-matchup`, `e2e-reports-typefloor-realdata`, `e2e-reports-view-parity`, `e2e-season-tab`, `e2e-self-scout` |

**Cohort and label contracts added 2026-09-10.** `e2e-reports-overview-realdata`
pins that Total plays is the CHARTED count with the classified count as its
qualifier, that Snaps by phase counts each phase from the charted cohort and its
three rows sum to it, and that the Success rate sub counts real successful
snaps. `e2e-reports-defense-realdata` additionally pins the season's four
cohorts (201/173 offensive, 174/154 defensive) and that every Game-by-game row
satisfies `Total yds = Rush yds + Pass yds`, that displayed `Snaps` is the
CHARTED cohort while `measured` is the classified denominator, that every
measured row satisfies `Yards / play = Total yards / measured`, that a
charted-but-unmeasured row keeps its charted count and reports every production
value as absent, that no rendered tendency row prints `0` snaps for a charted
look, that the Blitz/No Blitz counts and every situational blitz rate share one
charted cohort, that the `N charted · M with play type` disclosure renders on
every section at both widths, and that every value outside a named
broadcast-display exception meets the 12.5px floor. The reconciliation walk has
no truthiness guard: the first version skipped `n === 0` rows, which is exactly
where the two cohorts diverge. `e2e-reports-self-scout` pins all
twelve down-and-distance rows in football order with explicit yardage, held
rows carrying the absence treatment rather than a zero, `Turnovers` never
`Giveaways`, a populated section never badging zero, and that no defensive tell
reports its own grouping dimension — and section 14 asserts against the
produced Self-Scout **HTML export string**, because the export is a second
renderer over the same models and drifted from the board silently.
`e2e-reports-players` pins that punt
distance and return yardage come from the dedicated ST fields and that Players
and the team Special Teams report agree on the measured return COUNT as well as
its yardage. `e2e-reports-matchup` pins that no
composite-identity column is labelled a play call. `e2e-reports-offense-realdata`
now exercises **Season scope** at both release widths, which is the gap that let
a season-only containment defect ship.

`e2e-reports-defense-realdata` is the Defense composition authority. It loads
only `2025-st-joseph-mavericks-jv`, checks all six games at 1440 and 1280,
pins the approved module and row inventory plus canonical KPI/call/situation
values, verifies Top 6 formations preserves combined offensive looks and shows
all seven canonical play-call counts and shares, verifies the one-row Current
Game summary plus seven fixed drive-outcome rows, strength-relative attack
direction without absolute-total inflation, and the approved module-title font,
verifies
current-game scope labels, canonical field zones and order-independent calls,
checks module-content and module-to-band containment
as separate assertions, captures all four full-season screens at both widths,
checks the four-section Defense export, and verifies the source season remains
byte-identical. It also rejects any clipped shared Reports title at either
release width. Use a 900px viewport height at both release widths; a full-page
screenshot is not a substitute for viewport fit. Captures use a per-process
directory so a locked prior image cannot invalidate the run. Current focused
result: 42/0.
| Plan | `e2e-plan-contract`, `e2e-plan-export`, `e2e-study-plan` |
| Settings | `e2e-native-settings`, `e2e-tag-library-settings`, `e2e-playbook-library` |
| Overlays | `e2e-native-overlay` |
| Quick Chart | `e2e-native-quick-chart` |
| Football models | `e2e-penalty-contract`, `e2e-special-teams-contract`, `e2e-b2-tries`, `e2e-play-call-charting`, `e2e-core` |
| Analytics | `e2e-analytics-registry`, `e2e-analytics-metrics`, `e2e-analytics-projection`, `e2e-parity` |
| Film identity / relink | `e2e-clip-identity`, `e2e-clip-match`, `e2e-relink-legacy`, `e2e-relink-linked`, `e2e-film-index`, `e2e-film-persist`, `e2e-linked-film` |
| Persistence / catalog | `e2e-sql-catalog`, `e2e-catalog-persistence`, `e2e-catalog-backend`, `e2e-catalog-versions`, `e2e-revision-fence`, `e2e-snapshot-envelope` |
| Recovery | `e2e-native-recovery`, `e2e-native-mirror-recovery`, `e2e-wipe-recovery`, `e2e-restore-point-throttling` |
| Import / export | `e2e-csv-roundtrip`, `e2e-csv-projection`, `e2e-legacy-film-fields` |
| Cross-cutting guards | `audit-design-approvals`, `e2e-design-system`, `e2e-css-ownership`, `e2e-copy-standard`, `e2e-xss-names`, `e2e-raw-read-audit` |

## Tier 2 — Affected route

Tier 1 for the route you touched, **plus** the surfaces it shares state with:

- **Cross-route:** `e2e-workspace-shell`, `e2e-workspace-context`,
  `e2e-game-context`
- **Persistence:** `e2e-projform-durability`, `e2e-season-roster-scope`,
  `e2e-roster-ownership`, `e2e-operation-diff`
- **Opponent-scout ownership and Home navigation:** `e2e-scout-ownership` (91)
  is the contract harness — the pure parent-resolution rules, the atomic toggle
  (instrumented for the ABSENCE of `_openLibrary`, `closeSeason` and any
  auto-open), parent-scoped lists, create-time persistence, the exact-parent
  return, rendered rail clicks in both directions with every row's `current` flag
  deliberately staled, cross-team isolation with reused year and level, the
  unassigned row driven through its real select and Assign button, a foreign-team
  scout refused at the command boundary, dangling-parent repair versus no silent
  reassignment, the canonical write boundary (open-scout assignment surviving a
  later ordinary save and a reload in body, catalog row and live object) and an
  overlapping persist/assignment ordered by the per-season queue.
  `e2e-home-deferred-repair` (105) and `e2e-home-review-repair` (37) own the
  rendered Home states, including the approved empty Opponent Scout composition.
  `tools/capture-scout-workspace.mjs` captures eight states at 1920/1440/1280/768/390.
  It also pins the two 2026-09-14 Codex findings: two unassigned rows where the
  first is assigned through its own rendered control and the survivor's selector
  must be blank and unsubmittable; and the sample season rejected as a parent by
  `isValidParent`, excluded from legacy inference, establishing no parent when
  opened, refusing scout creation without writing, surfacing an existing
  demo-parented scout as unassigned with its data intact, and staying removable.
  The row defect needs BOTH guards removed to reproduce — keying alone and
  controlled state alone each prevent it — so its mutation removes both.

  **A workspace toggle must never be proven by a season change.** Five
  assertions across the two Home harnesses asserted that each side "restores its
  most recently opened season of its own kind"; that redirect is retired, and any
  replacement asserts the parent stays open, nothing is auto-opened, and the list
  is parent-scoped. Their retirement reasoning is recorded beside each one.

- **Repair Batch 1 data correctness:** `e2e-data-correctness-batch1` (73) is the
  contract harness for three defects, each mutation-verified. **Season film
  health** — a two-season fixture reusing game id `g1` with different film on
  disk, proving `WorkspaceContext.filmHealth(game, seasonId)` and
  `StorageBackend.listFilmFiles(gameId, seasonId)` carry the owning season to
  the lookup, that every result states the season it is about, and that the
  Home/library aggregate always prints an explicit `N of M games linked`. The
  Tauri directory resolution itself is pinned in SOURCE, because Chromium cannot
  exercise the desktop filesystem — that half still needs an installed check.
  **Drive grouping** — alternating possessions where both teams hold Drives 1
  and 2 must produce four groups with distinct identities in the shared owner,
  in Breakdown's play strip, and in Study's `drive` dimension; a special-teams
  snap joins its surrounding drive and a blank unit keeps the plain label.
  **Field Goal / XP** — no authoring route can store `attemptType:'extraPoint'`
  on a field-goal unit, both try directions credit the right team, and a
  historical `unit:'fieldGoal', attemptType:'extraPoint'` record still reads and
  still scores one point. The UI half is asserted against the owning source, not
  the minified bundle: `Extra Point` legitimately survives there as a Study
  dimension label, so a bundle-text search cannot discriminate.
  **In-flight film operations** are keyed by season AND game: a save running in
  one season must not make another season that reuses the game id report
  "Checking film…" over its own settled count. Covered on a two-season reused-id
  fixture, with the explicit-season clear, the no-season fail-safe sweep, and the
  create-time season default; the producers are pinned in source, because a
  caller that stops threading the season reopens the hole where no in-page
  assertion can see it. **A linked season missing one clip prints its count**,
  not `Film needs attention` — that label is reserved for film that cannot be
  COUNTED (an unreachable folder, a failed listing).

- **Live film-source binding:** `e2e-film-health-realdata` (14) audits the
  registered `2026-varsity-demo` season ("2025 St. Joseph Mavericks - JV")
  against the coach's real film library at `D:\Football\Film`
  (`GIQ_FILM_LIBRARY_ROOT` overrides) and asserts the repaired owner prints the
  count those sources actually support. It is READ-ONLY: it reads the installed
  season body and walks the film directories, never writes, renames, relinks or
  deletes, and never touches the backend the running app uses. Per-game truth is
  computed in Node from the app's own `_expected` / `_identity` /
  `listLinkedFilm` rules, then fed to the real in-page `filmHealth` and
  `_aggregateFilm` through a stub returning those real listings. **It cannot
  certify Tauri's own `fs.readDir`/`exists` inside the installed WebView2
  build** — that stays an installed check. Skips honestly when the season body
  or the library root is absent, and a skipped run certifies nothing.

- **Roster ownership:** `e2e-roster-ownership` (71) is the contract harness —
  cross-team and cross-season isolation, empty-stays-empty across switching and
  reload, same-season sharing with no game-level copies, game creation neither
  copying nor clearing, `_normalize` never adopting a game roster and never
  marking a season whose games still carry one (`roster: []` included), VALIDATED
  promotion, removal of `roster` from every game node once settled, the first
  legacy open's durable write asserted against DISK, a second open dispatching no
  migration write, emptying not resurrecting players, import/adopt/restore landing
  the same structure, backup/restore scoped to one season, and attribution reading
  the selected season's own roster with no "missing owner" escape hatch.
  `tools/audit-roster-ownership.mjs` is the read-only cross-store auditor; it
  prints counts and a roster hash, never player data.

  **A conflict or a failed migration write must be proven across a save and a
  reopen, not at the open.** A conflicted season refuses to open, and the first
  attempt at containment — exposing `_normalize(original)` — was destructive two
  saves later: the synthetic `season.roster: []` it created was persisted by the
  next ordinary save and read as an explicit roster by the open after that, which
  deleted every conflicting copy. Sections 7c/7e/7f/7g therefore hold a real
  season open, refuse the conflicted one, save, switch, refuse again, and assert
  byte-identical source bytes throughout — plus the same containment for a failed
  write (failing the backend for one season id only, then retrying), a conflicting
  import, and a conflicting restore.

  `e2e-delete-undo-film` also pins the navigation boundary: a migration-refused
  season open does not count as leaving the current season, so its pending game
  deletion, managed film, purge timer and working Undo action all remain intact.
  Its successful-switch case reuses one game ID across two seasons and asserts
  both the explicit outgoing season passed to `deleteFilm` and the desktop
  filesystem path, so a browser-only game-id spy cannot hide pointer drift.

  A harness fixture may not give a game node a roster except to plant a hostile
  legacy or scout copy the model must ignore — and then it must assert the copy
  is actually present. `e2e-reports-season` gave every game an empty
  `roster: []`, which reproduced the dual ownership the model no longer has.
- **Game context and form:** `e2e-game-form-context` (20) proves Add Game asks
  for no analytics perspective and that Program/Scout is derived from the
  owning season; `e2e-game-form-visual` (242) is its visual contract across
  four variants and five release widths.
- **Responsive/visual:** `e2e-responsive-containment`, `e2e-breakdown-a11y`
- **Populated screenshots** at 1440×900, 1280×800, 768×1024, 390×844 — captured
  with real multi-season data and **inspected**, not merely produced. Reports
  use the registered canonical season and the viewport set named by the
  surface's approved captures (currently 1440×900, 1280×720, 768×1024,
  390×844).

Touching a shared owner means running Tier 2 for every route that consumes it,
not just the one you were working in.

## Tier 3 — Release

In CI and any environment where Bash is on the PATH:

```bash
bash tools/run-gate.sh              # build + full gate
bash tools/run-gate.sh --no-build   # gate only, when dist/ is already fresh
```

**On this Windows host those bare commands do not run** — `bash` is not on the
PowerShell PATH. Use Git Bash through its explicit path, as a login shell, with
an absolute `cd` (verified working):

```powershell
# build + full gate
& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /c/Users/charl/Charlie && bash tools/run-gate.sh'

# gate only, when dist/ is already fresh
& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /c/Users/charl/Charlie && bash tools/run-gate.sh --no-build'

# detector self-test
& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /c/Users/charl/Charlie && bash tools/run-gate.sh --self-test'
```

Plus:
- **Windows CI** (`.github/workflows/gate.yml`, `windows-latest`, Node 22).
  Windows is the only platform the coach runs; a Linux-only pass can hide a
  Windows-only defect.
- **Real-data checks** — `e2e-realdata`, `e2e-integrity`, `e2e-parity` against
  the real season fixture. CI runs real-data in a degraded mode
  (`GIQ_REALDATA_OPTIONAL=1`) because a runner has no season mirror, so a local
  run is the only one that certifies it.
- **Installer** built from the reviewed commit, with all four version owners
  matching (`js/app.js`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`,
  `src-tauri/tauri.conf.json` — `e2e-p0-exit` asserts this).
- **Installed WebView2 smoke** — see below. Mandatory; nothing above replaces it.

---

## The detector self-test

```bash
bash tools/run-gate.sh --self-test
```
```powershell
& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /c/Users/charl/Charlie && bash tools/run-gate.sh --self-test'
```

Run this whenever you doubt a gate result, and after touching the runner.

It proves the runner's **own pass/fail detection** against known-green and
known-red fixtures. That check exists because the detector has been wrong in
both directions:

- An earlier ad-hoc runner grepped case-insensitively for "fail" and matched
  test *names* describing fail-closed behavior ("unknown groups fail closed"),
  reporting 4 false failures out of 49. A gate that cries wolf trains people to
  skim past the real one.
- Reading only the result line was also wrong:
  `e2e-special-teams-contract.mjs` prints `RESULT: N passed` with no failure
  count and signals failure only through `process.exitCode`, so a failing run
  reported green.

A harness is green only when **both** its exit code is 0 **and** its result line
is clean. The self-test also confirms failure evidence survives a long harness
tail, and that a skipped optional fixture is not counted as green.

---

## Rules that are not optional

**Build and gate in one command.** The environment bumps source mtimes between a
separate build and test, which false-fails `e2e-parity`'s stale-bundle guard.
`run-gate.sh` builds and gates together on purpose; use `--no-build` only when
`dist/` is genuinely fresh.

**Never run two full gates concurrently, and never touch processes while one is
running.** Each harness launches its own Chromium. Killing a browser mid-run —
including a well-meant cleanup of leaked processes — corrupts the result of
whatever was running. That has produced a phantom failure and a wasted
investigation. Wait, or run the gate uninterrupted and clean up afterward.

**A failing-first regression for every repaired defect.** Watch it fail for the
right reason before you trust it. Then mutation-verify: reintroduce the defect,
confirm the assertion reds *naming* it, restore, confirm green. An assertion
that cannot fail for the reason its name claims is not coverage.

**Never redefine a threshold to match what the implementation achieved.** Meet
the stated requirement, or stop and report the exact conflict. Disclosure in
prose is not a substitute for a test that holds the line.

**Baseline "pre-existing" against a committed commit, never against the current
dirty working tree.** A failure you assume is pre-existing is often yours. The
method — and it must not involve stashing, because the working tree may carry
another agent's uncommitted work (see the working-tree rule in `CLAUDE.md`):

1. Check the committed baseline out into a **throwaway worktree** or a
   `git archive` export:
   `git worktree add "$env:TEMP\gi-baseline" <commit>`
2. Build there and run the **same command against the same fixture** you ran on
   the candidate.
3. Compare the two results, then remove the worktree
   (`git worktree remove --force …`).

Never stash, reset, clean, or overwrite work you did not create. This is exactly
how the standing `e2e-design-system` 15/2 was shown to predate the documentation
milestone: the identical two failures reproduced at the prior commit in a
throwaway worktree, with the repository's own working tree untouched.

**Regenerate an analytics golden only as a reviewed, audited correction** called
out in the diff, never to make a test pass.

---

## What automation cannot certify

**Puppeteer cannot certify installed WebView2 behavior.** The harnesses run in
headless Chromium against a loopback HTTP server (`tools/app-entry.mjs`).
Codecs, the Tauri asset protocol and its CSP origins, native file dialogs,
filesystem scope grants, the updater, and app lifecycle are only real in the
installed desktop build. Every one of those has produced a defect that a fully
green gate could not see — most notably an asset-protocol CSP origin that
blocked every video load on Windows while every harness passed.

Required installed smoke, on the built installer:
1. Linked film on its real drive plays, with no managed-copy fallback.
2. Managed film auto-loads after an app restart.
3. Chart a play, close, reopen — data and film both survive.
4. Switch seasons — counts, tags, and film identity survive.

**A screenshot comparison must be shown capable of failing, and the pointer must
be parked.** Two traps, both hit during the CSS-ownership cleanup. First, a
capture harness proves nothing until a deliberate visible change is shown to
alter the image — a mutation that turns out to be invisible (a `body` background
the shell paints over) reads as a passing comparison. Second, fixture setup
clicks real controls, which leaves the mouse inside the layout; whatever sits
under it renders its `:hover` state, and the capture stops being deterministic.
That produced a stable, reproducible, entirely false "regression" in Study and
Film Room. Move the pointer to a neutral corner before every shot, and establish
the noise floor by capturing the same build twice before trusting any diff.

**Automated geometry is not visual approval.** Overflow and hit-target checks
prove containment, not legibility. Visual acceptance requires *inspecting*
populated screenshots at the release widths with real multi-season data: zero
overflow with unreadable content, dead space, or a collapsed panel still fails.
An empty fixture understates string lengths and vocabulary size, so a screenshot
of synthetic data proves less than it appears to.

Both are why the Charlie Gate — show the real app with real data and get
PASS / REVISE / REJECT — happens before packaging, not after.

### The typography floor is measured on the canonical season

`tools/e2e-reports-typefloor-realdata.mjs` is the only place the shared type
floor is established. Every board's own composition harness runs a SYNTHETIC
fixture, and the canonical-data rule in `CLAUDE.md` is explicit that synthetic
data cannot establish Reports visual parity: a QA fixture has different labels,
name lengths and row counts, so it renders different type. The first attempt at
this pinned five boards' floors from their own synthetic fixtures and recorded
Special Teams as 11px when the real figure is 9.5px.

The census reads every Reports board at both release widths off a read-only copy
of the canonical season and hashes the source before and after. It pins the
complete sub-floor map by size, tag and count plus each board's minimum, in both
directions. The Offense narrow-width exception additionally pins its eight named
module owners and proves every affected table cell belongs to one of them. Down
is a regression. Up means work was completed and reds until
`docs/VISUAL-SYSTEM-RULES.md` is updated in the same commit -- a silent
improvement leaves the documentation lying about where the floor is enforced.

The board harnesses mirror their own number as a same-fixture regression guard
and say so in the comment rather than claiming canonical provenance.

### Containment is not composition

The full gate must include both `e2e-breakdown-geometry` and
`e2e-home-breakdown-visual-repair` after shared shell or typography changes.
The former protects the film picture budget as well as deck containment; the
latter must derive selector bounds from canonical names and test the rendered
text for clipping, not preserve compact prototype dimensions.

A band that clips nothing, overflows nothing and engages no scroller can still be
badly composed, and every geometry check in this repository was written to catch
the first three. On 2026-09-11 the coach rejected a Defense screen that had just
passed 58 assertions: the linescore band had wrapped into two rows, its identity
strip was spread across the whole viewport on no grid, its name track held a
300px void, and six different right edges ran down the column.

When a change touches shared chrome, assert the composition explicitly:

- Content edges — not border boxes — of every band that carries route content,
  against the route frame's own inset, left and right.
- That a shared band stays on ONE row at every release width.
- That no flexible track absorbs slack into a void beside fixed content.
- That two surfaces reporting the same measurement report the same number. The
  KPI rail and the board beneath it disagreed for a full release cycle.

`e2e-reports-defense-realdata` carries these for the Reports column. None of it
replaces looking at the populated screen.

### A global token change is not a focused change

The 2026-09-11 shared visual range ran six focused suites, all green, and
shipped four red Reports harnesses behind them — two failing against
hash-protected approved evidence. The rule below was already written when that
happened; it was not followed. A `:root` palette or type edit repaints and
re-measures **every** surface, so "materially affected reference surface" means
every board that renders text, not the routes you edited.

The concrete list for a shared token change: `e2e-reports-overview`,
`e2e-reports-offense`, `e2e-reports-offense-realdata`,
`e2e-reports-defense-realdata`, `e2e-reports-self-scout`, `e2e-reports-season`,
`e2e-reports-players`, `e2e-reports-matchup`, `e2e-reports-special-teams`,
`e2e-native-reports`, `e2e-design-system`, `e2e-workspace-shell`,
`e2e-native-breakdown-theater`, `e2e-native-tagging`, `e2e-p0-exit`,
`e2e-parity`, `e2e-css-ownership`, and `audit-design-approvals`.

Two things the harnesses now enforce that they did not before: the typography
floor by class, with a named exception list rather than hundreds of unexplained
ones (`e2e-reports-defense-realdata`), and the no-truncation rule for the longest
canonical Program, Season and Game values on all five routes at both release
widths (`e2e-workspace-shell`).

### Shared visual-system changes

`docs/VISUAL-SYSTEM-RULES.md` is the acceptance contract for shared palette,
typography, route navigation, and context selectors. Any change to a shared
token or shell rule requires:

1. The production Vite build and focused design-system and shell harnesses.
2. The focused harnesses for every materially affected reference surface.
3. Populated screenshots at the release widths with the pointer parked.
4. Installed WebView2 inspection of shared chrome, Breakdown, and Reports.
5. A smoke record naming exactly what the coach accepted; do not infer whole-
   surface or release acceptance from approval of one shared visual correction.
