# Testing

There are **98 harnesses** in `tools/e2e-*.mjs`. Each is a standalone Node
script. Most drive the built app in headless Chromium via Puppeteer; a handful
that test DOM-free logic import the owning module directly and need no browser
at all (`e2e-core`, `e2e-catalog-backend`, `e2e-analytics-metrics`,
`e2e-catalog-versions`, `e2e-raw-read-audit`). Booting the app merely to reach a
pure class is not a supported pattern — there is no global bridge to reach it
through.

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
| Reports | `e2e-native-reports`, `e2e-reports-view-parity`, `e2e-season-tab`, `e2e-self-scout` |
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
| Cross-cutting guards | `e2e-design-system`, `e2e-copy-standard`, `e2e-xss-names`, `e2e-raw-read-audit` |

## Tier 2 — Affected route

Tier 1 for the route you touched, **plus** the surfaces it shares state with:

- **Cross-route:** `e2e-workspace-shell`, `e2e-workspace-context`,
  `e2e-game-context`
- **Persistence:** `e2e-projform-durability`, `e2e-season-roster-scope`,
  `e2e-operation-diff`
- **Responsive/visual:** `e2e-responsive-containment`, `e2e-breakdown-a11y`
- **Populated screenshots** at 1440×900, 1280×800, 768×1024, 390×844 — captured
  with real multi-season data and **inspected**, not merely produced

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

**Automated geometry is not visual approval.** Overflow and hit-target checks
prove containment, not legibility. Visual acceptance requires *inspecting*
populated screenshots at the release widths with real multi-season data: zero
overflow with unreadable content, dead space, or a collapsed panel still fails.
An empty fixture understates string lengths and vocabulary size, so a screenshot
of synthetic data proves less than it appears to.

Both are why the Charlie Gate — show the real app with real data and get
PASS / REVISE / REJECT — happens before packaging, not after.
