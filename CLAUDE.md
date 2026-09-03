# GridIron IQ — Operating Document

Browser + Windows-desktop football film analysis for coaches. Load game film,
mark plays, tag them, get stats, tendencies, cut-ups, call sheets, and game
plans. Formerly "Football Film Analyzer". The current working branch is
`claude/football-film-analyzer-GRiCW`; nothing depends on that name — CI runs on
`branches: ['**']` and no workflow or source path references it.

**Live URL:** https://ckelly0051.github.io/Charlie/
**Current version:** `1.12.0-70` (`js/app.js` `APP_VERSION`,
`src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json` —
all four must match; `e2e-p0-exit` asserts it).

This file is current state only. The complete dated history through 2026-09-02
— every milestone, review, repair, smoke, and incident — is preserved verbatim
in **`docs/archive/CLAUDE-HISTORY-THROUGH-2026-09-02.md`**. Read the archive
when you need the *why* behind a rule below, or the record of how a defect was
found. Do not re-litigate a closed finding from it.

**Product direction** lives in `GRIDIRON-IQ-PLAN-V2.md`, not here.
**Testing tiers** live in `docs/TESTING.md`.

---

## Build

`index.html` → **Vite** → `dist/` → **Tauri**. That is the only build.

```bash
npm run build          # vite build -> dist/
npm run dev            # vite dev server
```

- `tauri.conf.json` sets `frontendDist: "../dist"` and
  `beforeBuildCommand: "npm run build"`, so `cargo tauri build` builds the
  frontend itself.
- **`build.sh` and `football-film-analyzer.html` are deleted.** There is no
  single-file bundle and no second build path. Any doc, comment, or memory
  describing one is stale.
- `#giLegacyEngineHost` and `#wsClassicOutlet` are **deleted**. Native Preact
  routes are the only coach-facing presentation owners. Some comments still
  name those ids to explain why a current fallback or single-owner writer
  exists; that is history, not live structure.
- Tests never load a bundle path. They resolve the app through
  `tools/app-entry.mjs`, which serves `dist/` over loopback HTTP (Chromium
  blocks Vite's split module/CSS assets over `file://`).
- **Build and test in one command.** The environment bumps source mtimes
  between steps, so a separate build then test can false-fail the parity
  stale-bundle guard.

Web deploy is the `gh-pages` branch, which receives a verbatim copy of `dist/`
(clear the branch first — Vite asset names are content-hashed, so orphaned
`dist/assets/*` must not linger). Desktop releases are cut by pushing a `v*`
tag; keep the `-N` suffix, because `configureBetaDefaults` gates on `/-\d+$/`
to seed `ffa_sql_catalog` on a fresh profile.

---

## Current owners

Change behavior at its owner, not at a consumer.

| Area | Owner |
|---|---|
| Shell, routes, chrome, context bar | `js/workspace-shell.js` |
| Home route | `js/home-screen.js` + `js/native-home.jsx` + `css/native-home.css` |
| Team Hub / season library | `js/team-hub-screen.js` + `js/native-team-hub.jsx` |
| Team + season registry | `js/team-registry.js` |
| Break Down route | `js/breakdown-workspace.js` |
| Film theater / transport / play strip | `js/breakdown-theater-screen.js` + `js/native-breakdown-theater.jsx` |
| Charting deck | `js/native-tagging-screen.js` + `js/native-tagging.jsx` |
| Film Room grid | `js/native-film-room-screen.js` (model + edit semantics in `js/play-grid.js`) |
| Study | `js/study-screen.js` + `js/native-study.jsx` |
| Reports | `js/reports-screen.js` + `js/native-report-tabs.jsx` |
| Plan | `js/plan-screen.js` + `js/native-plan.jsx` |
| Settings | `js/settings-screen.js` + `js/native-settings.jsx` |
| Game create/edit | `js/game-screen.js` |
| Overlays (dialog/sheet/toast/popover) | `js/native-overlay-service.js` — see `GRIDIRON-IQ-OVERLAY-SPEC.md` |
| Season model + persistence | `js/season-store.js` |
| Live ↔ store bridge, film load | `js/storage.js` |
| Storage seam (browser vs Tauri) | `js/storage-backend.js` |
| Canonical desktop catalog | `js/sql-catalog.js` + `js/catalog-persistence.js` |
| Playback across routes | `js/film-navigation-service.js` |
| Analytics formulas | `js/stats-engine.js` |
| Metric/dimension registry | `js/analytics-registry.js`, `js/analytics-metrics.js`, `js/study-query.js` |
| Tag projection (read-time) | `js/tag-projection.js` |
| Penalties / Special Teams models | `js/penalty-model.js`, `js/special-teams.js` |

Football contracts, each canonical for its area:
`GRIDIRON-IQ-TAG-MODEL.md`, `GRIDIRON-IQ-PENALTY-MODEL.md`,
`GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md`, `GRIDIRON-IQ-PLAY-CALL-MODEL.md`,
`GRIDIRON-IQ-WORKSPACE-CONTRACT.md`, `GRIDIRON-IQ-OVERLAY-SPEC.md`.

---

## Binding data rules

These are invariants, not preferences. Every one is enforced in current source.

**Coach data**
- Never migrate, clear, or rewrite known-bad data. Cleanup requires an impact
  report naming the exact affected count and explicit confirmation immediately
  before the write.
- Never delete managed film on the coach's behalf without that same explicit
  confirmation.
- Legacy data is read through compatibility projection, not rewritten.
  `tag-projection.js` is read-time only and never mutates.

**Season isolation**
- A season is the unit of work; each is its own file/row. `SeasonStore.data` is
  null until a season is opened.
- `commitActive()` refuses to write when the live tagger does not match
  `_loadedGameId` — a stale commit must never stamp one game onto another.
- Undo/redo history resets on every game load, not only on season load.
- Season transitions cancel pending saves (`_cancelPendingSaves`) and pin the
  season id inside every debounced callback.
- Durable writes are queued per season (`drainWrites`) and fenced by a
  monotonic `data.revision`; a stale write must never land after a newer one.

**Per-unit field invariants**
- `SeasonStore.ST_ALIGNMENT_KEYS` is the single source of truth for fields a
  Special Teams play may not hold. It is enforced at **two** barriers: the live
  object (`PlayTagger._emit`) and every serialization path
  (`_stripStAlignmentBeforeSave`). Adding a field to a carry list without adding
  it to the strip list reproduces the bug that once coded every ST play "Under
  Center".
- `migratePlayFormation` runs only when a play genuinely lacks the `backfield`
  property. That guard protects a real custom formation value (`Power-I`) from
  being rewritten.
- Left/Right on `strength`, `playDir`, and `hash` are always read from the
  **offense's** perspective, on every play regardless of unit, so they aggregate
  correctly across units. There is no stored perspective flag and no auto-flip.

**Film identity**
- Durable identity is `clipPath` / `clipRefs` / `catalogClipId` — never a bare
  basename. `planClipMatch` is the one matcher (catalog id → exact path →
  basename → Windows `(n)` → order) shared by every relink path.
- The game film index is derived from the plays' own clip identities **unioned**
  with the live playlist (`_buildClipIndex`). It must never be rebuilt from the
  playlist alone, which is what once silently emptied it.
- Film loads are latest-wins (`_filmLoadSeq`): a superseded load aborts before
  any player mutation and emits no messaging about the outgoing game.
- Linked film is referenced in place and never copied. Library root and a game's
  own folder are separate scopes; changing one must never rewrite the other.
- Missing or moved film shows an actionable re-link state and never falls
  silently into copy mode.

**Recovery**
- Restore is reversible: a "Before restore" safety point is written first, and a
  failed canonical save rolls the live editor back.
- Recovery from the Documents mirror is explicit and confirmed
  (`scanRecoverableSeasons` previews, `recoverSeasonFromMirror` imports). It is
  never automatic just because app data looks empty.
- A failed durable write reports failure. Never report success for a write that
  did not land.

**Output safety**
- Escape coach-entered text at the **HTML sink**, not the producer — the same
  string also reaches `textContent` and `.title`, where pre-escaping
  double-encodes. `Charts._esc` is the escaper. Names and notes travel in
  importable seasons, so this is stored-XSS, not self-XSS.
- Analytics changes must pass parity (`e2e-parity`) and exact composite
  `gameId::playId` film-reference equality. Regenerate a golden only as a
  reviewed, audited correction called out in the diff — never to make a test
  pass.

---

## Binding presentation rules

**Product quality standard.** GridIron IQ is a consumer coaching product.
Functional correctness does not by itself make a screen acceptable — it must
also be legible, coherent, dense, and understandable without narration.
Typography, hierarchy, alignment, whitespace, contrast, responsive containment,
and first-viewport usefulness are acceptance criteria, not later polish.
Approved comps are binding composition contracts: a recolor, token swap, or
approximate layout does not satisfy one. Pretty and functional are one standard.

**The Charlie Gate.** Before expensive review, packaging, or release, show the
real app with representative real data at the agreed viewport and get
PASS / REVISE / REJECT. A green automated gate never substitutes for it.

**Copy.** Literal, concise, operational. State the object, current state, or
available action. No conversational reassurance, rationale, promises,
second-person narration, or implementation/data-safety language in routine
headings, labels, helper text, or empty states. Prefer the product noun over
`our`/`your`. Supporting copy only when it supplies information needed for the
next decision. US English throughout, including comments and commits.

**Interaction states.** Every enabled interactive element provides distinct
rest, hover, applicable active/selected, and keyboard `:focus-visible` states,
without changing layout dimensions. Covers navigation, tabs, filters, links,
dropdown triggers, icon-only buttons, card actions, and command buttons.
Missing hover/focus feedback is a defect. The full standard is
`GRIDIRON-IQ-PLAN-V2.md` §3C.

**Density and layout.** Density comes from geometry and padding, never from
shrinking type below the floor. Chips are ≥30px tall on desktop and ≥44px on
coarse pointers. No page-level horizontal overflow at any release width
(1440×900, 1280×800, 768×1024, 390×844). Wide content scrolls inside its own
container.

**Typography.** One readable UI/body family for operational copy; reserve
condensed and display faces for true headings and major KPI values. Faces are
bundled (IBM Plex Sans / Sans Condensed / Mono) so rendering never depends on
the host OS. `:root` is dark (`--bg-primary: #1b1f27`, `--text: #e2e8f0`), and
`--display` derives from `--gi-cond`.

**Theme variables are global.** A `:root` palette edit is an app-wide edit.
Anything surface-specific belongs on that surface's selector. Re-scoping a
variable does **not** repaint descendants that already inherited a computed
`color` — set the property explicitly.

**Film is never obstructed.** No control, overlay, border, or transform may
cover or resample the media surface.

**Automated geometry checks are not visual approval.** Inspect populated
screenshots with real data. Zero overflow with unreadable content still fails.

---

## Accepted state

Home is accepted and packaged as the `1.12.0-70` Windows x64 Beta smoke
candidate (`SMOKE-1.12.0-70.md`). Plan V2 lanes V2-A through V2-H are complete
and accepted.

Home's accepted composition: the approved comp governs first launch, the
season-library/no-open-season state, and a populated open season. The rail is
**two permanent panes** — Program Seasons and Opponent Scouts, always both
visible, neither collapsing, each owning its own bounded scroller — bounded by
the route frame so every fixed tool stays reachable without scrolling the game
grid. Games are ordered chronologically oldest-first by date, with a valid
numeric week only as a same-date tiebreaker. `data-season-id` is the stable
rendered interaction hook on rail rows.

**No test-only production API.** The legacy global bridge, which published 30
engine classes onto `globalThis` so harnesses could reach them, is deleted. A
test now imports the owning module directly when the logic is DOM-free, or goes
through a live controller/service (`window.app.<service>.constructor`) when the
page is genuinely required. Nothing may reintroduce it under another name:
`e2e-p0-exit` pins the absence in source and `tools/audit-shell-deps.mjs` proves
at runtime that no engine class resolves as a global — by class identity, not by
name, since `StorageManager` collides with a real DOM interface.

**CSS ownership is enforced, not merely asserted.** Every stylesheet is
reachable from the Vite graph (7 linked from `index.html`, 15 imported through
the module graph), and `e2e-css-ownership` proves on every run that no selector
branch in `css/styles.css` or `css/redesign-stats.css` requires an identifier
production cannot produce, and that no positive `:is()` / `:where()` / `:has()`
list carries an alternative that can never match. `:not()` remains an exclusion,
not a producer requirement. The model is `tools/css-ownership.mjs`.

**A producer is not a mention.** The distinction is the whole point, and getting
it wrong is what let a first attempt at this cleanup declare completion while
785 dead branches remained. Producers are `class`/`className` attributes,
producing `classList` operations, `className` assignment,
`setAttribute('class', …)`, and the static parts of template literals in those
positions — including class
attributes inside emitted HTML strings, which is how the print/export paths
count. Readers are not producers: `querySelector('.stats-overlay')` reads a
class and never creates one. Comments are not producers either, and in this repo
they are often documentation that the thing is *gone* — `.top-bar` survived a
sweep on sixteen occurrences, every one a comment recording its deletion.
Ownership is never decided from runtime coverage, which cannot see empty, error,
or responsive states.

Only two things are retained without a literal producer: a class reached through
a template fragment ending in `-` before an interpolation (`` `tone-${row.tone}` ``),
whose suffix is unknowable, and ids. A brace-balanced reader is required for
`class={…}`, because a JSX class expression contains its own `}` via `${…}` and
a non-greedy match silently loses every class after the first interpolation.

`e2e-design-system` is 17/0: the Settings active-tab elevation is the shared
`--gi-raise-tab` token, and `--gi-library-inset` is a declared instance-scoped
property backed by a real `style.setProperty` setter.

---

**Reports > Offense is implemented and independently reviewed, but NOT coach
accepted.** Built to the approved comp (`design-comps/reports-offense-2026-09-03`)
across `dc93429`; Codex reviewed the range and found no remaining concrete
regression. It has not had a Charlie Gate, so it is not accepted state.

Its composition is six zones — Offensive identity, Calls and tendencies,
Structure and deployment, Situational analysis, Field and production, Advanced
metrics — over a **12-column rhythm**. Every band divides on a gridline the
six-column KPI band also uses (two-column bands run 8fr/4fr or 6fr/6fr,
three-column bands three 4fr tracks), because the generic band's 65.9% split
missed the KPI band's 66.7% by under a percent and read as a defect rather
than a design. Bands are `align-items:start` and paint their column rules with
a box-shadow into the existing 1px gap: sized to content, the band's own
`--bd-rule` background would otherwise show under a short module as a solid
slab, and collapsing the gap moves every rule ~1.4px out of alignment.

**The shared scorebug is owned by one set.** `SCOREBUG_TABS` in
`js/reports-screen.js` is the single owner of the scorebug/rail rule: a tab in
it shows the scorebug and hides the generic `gi-reports-rail`; a tab outside it
does the reverse. The two can therefore never appear together. It holds
`overview` and `offense` today and grows one tab at a time as each self-report
tab gets its design pass — Defense, Special Teams, Players, Self-Scout and
Matchup still render the rail, and their behavior is unchanged.

Score spacing is structural, not tuned: `.gi-scorebug-team` is `display:contents`
so each team's name and score land in the scorebug's own fixed tracks. Score
cells never move for a name length or a 1-, 2- or 3-digit value; names truncate
inside their own bounded track with the full value in a tooltip.

**Type on the Overview and Offense boards follows the design-system tokens.**
Table column labels take `--gi-text-label` (the token whose own comment reads
"field + column labels"), not the 9.5px condensed face the broadcast block used
— a column label is operational copy, not a heading or a major number, and at
9.5px in `--gi-bd-muted` it measured 3.63:1, below the 4.5:1 small-text
minimum. Secondary ink is `--gi-bd-copy` at 7.66:1. Row height is unchanged:
`--gi-row` already carried a 12px label. The coach's decision was that both
boards share this treatment rather than Offense carrying an exception, so it
is scoped to `.gi-overview-board`; Overview's composition is untouched.

**A fixture is part of the evidence.** Three "defects" reported during this
work were unrepresentative fixtures, each caught only in review: quarters
tagged `'1'` when production writes `'Q1'` (`native-tagging.jsx` OPTIONS), so
By quarter rendered empty and the linescore showed all zeros; play-action
tagged as a *concept* when `_playActionStats` keys on the play **type**; and a
type-floor assertion that protected a spray chart the fixture gave no field
position to render. Chart the real tag vocabulary before concluding the
product is wrong.

---

## Open and deferred

1. **V2-I mobile companion workflow** — the one Plan V2 lane not started.
2. **Functional Beta Acceptance** — a cold-start Assistant Coach Test on a clean
   Windows profile, no fixture data, no verbal help.
3. **Reports > Offense Charlie Gate** — populated real-data review at the
   release widths, then PASS / REVISE / REJECT. Open question carried into it:
   Backfield renders 189px beside Personnel's 261px in the Zone 3 band, because
   the data holds fewer distinct backfield values than personnel values. That
   may be the honest floor rather than something to fill.
4. **The remaining Reports tabs** — Defense, Special Teams, Players,
   Self-Scout and Matchup have not had a design pass and still use the generic
   rail.

**Accepted limitation, not open work.** At 1280×800 the Home rail's two panes
sit at their 112px floor and a scout row falls just below the fold inside its
own pane (measured: rail 682px = padding 40 + link 36 + gaps 66 + trees 194 +
tools 291 + foot 55). Both headings stay visible and every fixed tool stays
reachable, which is the contract. Freeing enough space for a visible row would
have to come out of the tools or the foot, which the approved composition
reserves. This is accepted for `1.12.0-70`; reopen it only if installed smoke
raises it.

---

## Testing and release

Full tiers, commands, and what each tier can and cannot certify:
**`docs/TESTING.md`**. Summary:

- **Focused** — the smallest existing harness for the route or domain touched.
- **Affected route** — that route plus cross-route, context, and persistence
  harnesses, plus populated screenshots at the release widths.
- **Release** — `bash tools/run-gate.sh`, Windows CI, real-data checks, and an
  **installed WebView2 smoke**.

Reports harnesses: `tools/e2e-native-reports.mjs` (the route as a whole, 104)
and `tools/e2e-reports-offense.mjs` (the Offense composition, its football
contracts and the shared scorebug rule, 45).

Non-negotiable:
- A failing-first regression for every repaired defect. Watch it fail for the
  right reason before you trust it.
- **Give the fixture the same scrutiny as the assertion.** Three assertions in
  the Offense work passed while measuring something other than their subject:
  one clicked the main Reports tab strip instead of Season's own sub-nav and
  left the tab it was testing; one measured a route that a prior block had
  navigated away from, so page overflow was trivially zero on an unrendered
  board; one checked a type floor on a chart the fixture never let render.
  Each was green, and each was found by review. Assert that the subject is on
  screen before asserting anything about it.
- **Never redefine a test's threshold to match what the implementation
  achieved.** Meet the requirement or stop and report the exact conflict.
  Disclosure in prose does not substitute for a test that holds the line.
- Mutation-verify: reintroduce the defect, confirm the assertion reds naming
  it, restore, confirm green.
- Baseline "pre-existing" against committed HEAD, never against your own
  uncommitted work.
- Never run two full gates concurrently, and never touch processes while one
  runs — killing a browser mid-run corrupts the result.
- Puppeteer cannot certify installed WebView2 behavior: film codecs, the asset
  protocol, native dialogs, filesystem scope, and app lifecycle are only real
  on the installed desktop build.
- A release is not certified by its builder alone.

---

## Working agreement

- **Reproduce before fixing.** Verify a reported finding against source before
  accepting it; several have been wrong.
- **Fix at the root, one change at a time.** Do not stack patches.
- **Sweep the container, not just the file you are editing.** One stranded
  reference usually means the whole container is stranded.
- **A check must be as strong as its name.** An assertion that cannot fail for
  the reason it claims is not coverage.
- Commit at every baton pass. One builder and one independent reviewer per
  increment; documentation and the handoff are updated before the baton passes.
- **Working tree:** never `git add -A` or `git add .`. Stage named paths. Never
  reset, clean, stash, or absorb another agent's uncommitted work — this repo
  carries untracked installers, artifacts, design comps, and scratch files that
  must survive. A `git add -A` once swept 267 local-only files, including real
  team film, into history.
- **Shell on this host:** bare `bash` is not on the PowerShell PATH, and the
  agent Bash tool fails with `ENAMETOOLONG` on `uv_spawn`. Git Bash itself works
  through its explicit path. Use PowerShell for ordinary work, and for the gate
  use the invocation documented in `docs/TESTING.md`:
  `& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /c/Users/charl/Charlie && bash tools/run-gate.sh --self-test'`
- Do not commit `dist/`, `node_modules/`, or `src-tauri/target/`.

---

## Durable lessons

Full accounts are in the archive; these are the ones that still change how you
should work.

- **A green gate is not a correct app.** Whole-app review has repeatedly found
  real defects behind a fully green suite. The gate tests what it was written
  to test.
- **Cross-game and cross-season state must be scoped and stress-tested.** Two
  data-corruption bugs shipped past 250+ green assertions because nothing fuzzed
  real operation sequences. `e2e-integrity` exists for exactly this.
- **A display bug is not a data bug.** "Tagged plays show as untagged" was twice
  a renderer defect with correct data on disk. Reproduce against the shipped
  artifact before concluding data is wrong — and inspect each renderer
  separately, since they read the same data through different code.
- **Explicit beats inferred.** Prefer a real field over parsing another field
  (`runPass` over play-type string matching).
- **Filter gates must match the data's unit.** Gating a defensive query on an
  offensive field silently drops rows.
- **Never trust `window.confirm()` for in-form actions** — browsers suppress
  repeat dialogs, which silently returns `false`. Use the in-app confirm.
- **Tauri's asset protocol is `http://asset.localhost` on Windows**, not
  `https://`. Both origins must stay in the CSP.
- **Inherited `color` is a computed value, not a live `var()`.**
- **Multi-value tags are `" + "`-joined strings** so every string consumer keeps
  working; analytics split and attribute to each component.
