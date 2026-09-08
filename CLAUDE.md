# GridIron IQ — Operating Document

Browser + Windows-desktop football film analysis for coaches. Load game film,
mark plays, tag them, get stats, tendencies, cut-ups, call sheets, and game
plans. Formerly "Football Film Analyzer". The current working branch is
`claude/football-film-analyzer-GRiCW`; nothing depends on that name — CI runs on
`branches: ['**']` and no workflow or source path references it.

**Live URL:** https://ckelly0051.github.io/Charlie/
**Current version:** `1.12.0-74` (`js/app.js` `APP_VERSION`,
`src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json` —
all four must match; `e2e-p0-exit` asserts it).

**Packaging status:** `1.12.0-74` is the current unsigned Windows smoke
candidate, versioned in `c8cb4e3` after the release-gate repairs in `c869140`.
The complete gate passed 105/105 with real data 10/10 and parity 2/2 before
packaging. Tauri produced both NSIS and MSI packages; its final process status
is nonzero only because updater-artifact signing has no private key on this
machine, the documented local-candidate condition in `TAURI.md`. The installed
whole-Reports Charlie Gate remains open. See `SMOKE-1.12.0-74.md`.

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

**Design approval authority.** `design-approvals/APPROVALS.json` is the only
current index of approved design evidence. Follow its per-surface manifests to
the canonical comp, rationale and captures; never infer authority from a
filename, a nearby artifact, a commit message, or an older narrative section
of this file. `COMP_APPROVED`, `IMPLEMENTED_UNVERIFIED`,
`PRODUCTION_ACCEPTED`, `REJECTED` and `RELEASED` are different states. Never
write or accept the unqualified word "approved" for a presentation milestone.
Standalone HTML can reach `COMP_APPROVED`; only a populated real-app screen can
reach `PRODUCTION_ACCEPTED`. Run `node tools/audit-design-approvals.mjs` after
changing the registry or any canonical artifact. Canonical evidence must be
tracked, unique, present, and hash-identical to the approval record.

**Canonical Reports data authority.** Every Reports production comparison,
visual capture, Charlie Gate, and release decision uses a read-only copy of the
registered `2025-st-joseph-mavericks-jv` season (`2025 St. Joseph Mavericks -
JV`) from the Documents mirror. The per-surface manifest remains composition
authority; this real season is data authority. Existing approved comps captured
with QA data remain valid for composition, but new production evidence must use
the real season. Synthetic fixtures may test deterministic formulas, sparse and
empty states, and adversarial edges, but they are supplemental only: they cannot
establish Reports visual parity, football correctness,
`IMPLEMENTED_UNVERIFIED`, `PRODUCTION_ACCEPTED`, or `RELEASED`. Never disguise a
synthetic fixture with the canonical season's name. A Reports evidence handoff
must state the season id/name, actual game and play counts, selected game/scope,
and whether the source was copied read-only. Missing canonical data fails closed
on the designated review machine. CI may explicitly skip it, but that run cannot
certify Reports acceptance. Never write normalization or test changes back to
the coach's source file.

**Reports dashboards are static compositions.** For every Reports surface, the
registered approved comp is the schema: it fixes the modules, their order, each
module's row or tile count, and the board geometry at each supported layout.
Real data fills those slots but never adds rows, removes modules, or resizes the
board. A short cohort renders the surface's approved absence treatment (`-`,
`No data`, or blank only where that comp explicitly chooses it); a long cohort
is deterministically ranked and capped. When a variable list is valuable, name
the cap honestly, such as `Top 10 Plays`. Keep these constants in one named
surface owner and pin every module count in both synthetic sparse/overflow tests
and canonical-season captures. Do not solve a data mismatch by stretching rows,
shrinking type, or inventing explanatory prose.

**Current visual release truth (2026-09-06).** `1.12.0-70` is the last accepted
installed smoke candidate. `1.12.0-74` is `REJECTED`: its Reports production
does not faithfully preserve the individually approved report compositions,
and its installed Home presentation was reported visually off. Any older
section below describing a Reports implementation as complete, approved, or
gate-verified is implementation history, not current production acceptance.
The approved design evidence remains protected; production must be repaired to
match it rather than asking the coach to repeat the design process.

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

**Reports > Defense is implemented and gate-verified, but NOT coach accepted.**
Built to the approved comp (`design-comps/reports-defense-2026-09-03`, whose
RATIONALE is the decision record) across `8a3525a`..`b035bac`. It has not had a
Charlie Gate or an installed smoke, so it is not accepted state.

Defense is **five sections presented as a TAB STRIP**, one on screen at a time:
Defensive performance, Opponent Offense, Scheme, Situational results,
Self-scout. Approved 2026-09-04 for Defense only — Offense still scrolls one
continuous page, and the two navigate differently until Offense converts. Its
KPI band is eight tiles across in one row; two rows of four stretched each tile
to ~350px of mostly empty panel.

Every `DefenseTab`, `SchemeDetail` and `DefensiveSelfScout` capability is
preserved. `SchemeDetail` and `DefensiveSelfScout` are split by `schemeParts`
and `selfScoutParts` so their bodies can sit in different sections without
recomputing anything: the havoc gauge's stat cards became Disruption in section
1, and Scheme by Situation moved beside Situational defense. The havoc **arc**
is gone; its number, its sample and its film action are not.

**`All blitzes` counts DISTINCT blitz-tagged plays** — the canonical
`blitzTotal`, with the canonical `blitzHavocRate` over that same cohort. Sacks,
average yards and stop rate state that they are not aggregated, because summing
the per-blitz rows double-counts any snap carrying two blitz tags. Proved with
a fixture where every ninth snap is tagged `Edge + Mike`: the row reads 111
where the sum of rows is 131.

**Three band gaps are known and accepted for now:** Run / pass faced 78px,
Opponent play type 86px, Situational defense 72px. They come from genuinely
different row counts in real data. Stretching table rows and full-width tables
were both tried and rejected — the first distorts the row rhythm to fill space,
the second reintroduces the long horizontal eye travel the pairing exists to
avoid. Carried into the Charlie Gate.

**Reports > Special Teams is implemented and gate-verified, but NOT coach
accepted.** Built to the approved comp
(`design-comps/reports-special-teams-2026-09-04`, whose RATIONALE is the
decision record and carries all eight coach rulings). No Charlie Gate and no
installed smoke, so it is not accepted state.

Special Teams runs a **six-column rhythm** — its own number, because the model
defines six units. Six KPI tiles, a six-card **unit ledger** showing every unit
including the empty ones, and **five section surfaces** (All units / Kickoff &
Kick Return / Punt & Punt Return / Kicking game / Specialists). Kickoff stays
distinct from kick return and punt from punt return: each pair is co-located
for comparison, never merged. Its bands are `align-items:stretch`, which is
*not* the treatment Offense and Defense rejected — those bands paint their rule
colour as a background so a stretched short module showed a slab; this band's
background is transparent and its rules are box-shadows, so stretching paints
only the module's own panel and the rows keep their rhythm.

**One absence label: `No data`.** Everywhere, in every position. An earlier
pass drew three ("not charted", "not derivable — legacy charting", "not
derivable — no ruleset") plus a sentence per module; the coach removed all of
it, along with the legacy disclaimer band, the section definition footnotes,
and every descriptive meta. **A measured zero is not an absence** and keeps its
number with its denominator — 0% touchbacks on 21 kickoffs, 0 returns
attempted, a scoreless unit. An absent value drops to copy weight so it cannot
read as a headline figure, and a blank KPI drops its sub rather than printing
the same two words twice.

**Two engine corrections, both coach-approved 2026-09-04.**
`StatsEngine.isFieldGoalAttempt`/`isFieldGoalMade` are now the single canonical
Field Goal cohort that the team report and the kicker rollup both call:
`_individualStats` counted `stType:'XP'` as a field-goal attempt, which is why
the coach's season showed a kicker at 0/1 FG beside a unit reporting 0
attempts. An extra point is not a field goal. And the legacy punt net no longer
subtracts a flat 20 yards on a touchback — placement is ruleset-dependent, no
season configures one, and the structured branch never did it. Both are
mutation-verified in `e2e-reports-special-teams`.

**Coverage touchdowns are parity-pinned.** Commit `1931fff` added
`tdAllowed` and its exact film-reference cohort to both kickoff and punt
coverage. The analytics golden audit found only those additive fields: 24
primitive paths in the synthetic fixture and 56 in the local six-game fixture,
all `0` values paired with empty reference arrays because neither fixture
contains a coverage touchdown. No existing metric, drilldown, report value, or
film cohort changed.

**`tries.n` is a real count for legacy seasons.** Legacy charts tries as
`stType` `XP`/`2-Pt` (SPECIAL-TEAMS-MODEL §4b.1), so the old structural `null`
contradicted `conversions.xp.att` on the same cohort and swallowed
charted-but-unattributed tries. It is counted over the **same population** as
the snap count (`unit:'special'`); gating on `stType` alone picked up a try
charted outside the unit, made the units sum to exactly the snap count, and
masked the one play that genuinely belongs to no unit.

**The report shows only the exception, never the arithmetic.** A full
"74 snaps = 21 kickoff + …" line restated the ledger above it and is gone. What
survives is the one fact no ledger card can show: a snap belonging to no unit —
the coach's single legacy `Fake` play — rendered only when it exists.

**Reports > Players is implemented and gate-verified, but NOT coach accepted.**
Built to the approved comp (`design-comps/reports-players-2026-09-04`, whose
RATIONALE is the decision record and whose section 16 is the final
composition). No Charlie Gate and no installed smoke, so it is not accepted
state.

Players is **six fixed football roles** — Rushing, Passing, Receiving, Tackles,
Return Game, Kicking / Punting — paired two to a band. Scope (Current game /
Full season, defaulting to Current game), the sample line and the role
navigation (All roles / Offense / Defense / Special Teams) share **one control
row**, so the board opens on report data rather than on two full-width bands of
chrome. There is no section-title strip: it repeated the active role tab and
counts already on screen. Role counts are plain text, not boxed badges. Role
headings are readable IBM Plex Sans at 12.5px with no tracking or forced
uppercase; data rows are 38px at 13px; bands meet on thin rules so the six
tables read as one report surface; and the report canvas is capped at 1648px
and centred inside a board that carries no padding of its own, because
uncapped at 1920 a name sits most of a screen from its first measurement.

**The tables own their column geometry.** Each role emits a `colgroup` and
renders `table-layout:fixed`, so the same measurement is the same width in
every role table and no sort or scope change moves a column edge. Nine steps,
each sized from the widest thing that column must hold — its own header or a
full-season figure. A single width clipped `Solo`, `Sack`, `Fum` and
`Punt Avg`; sizing against one game then let a season `1054` and `174/261`
overrun. Identity keeps a 208px floor and absorbs whatever the panel has spare.

Three things this cost, each of which renders plausibly while being wrong:

- **A bare class loses the colgroup.** `.gi-reports .gi-overview-module table`
  carries an element selector, so `.gi-player-table` alone is outranked and the
  table silently content-sizes — every stated width becomes fiction. The rule
  is qualified as `.gi-player-module table.gi-player-table`.
- **The route-wide `th{position:sticky;top:42px}`** is measured against the
  table wrap once the wrap is a scroll container, which pinned every header
  42px down over its own first data row. The Players tables opt out, the same
  correction the Special Teams board needed.
- **`table-layout:fixed` overflows silently** rather than growing, so a clipped
  cell is invisible to any content check. Every cell is measured against its
  own content box across width × scope × section.

**A band stacks only when its own widest table needs more than a band half.**
The board carries no padding of its own — the route already insets it, and
paying both cost each half 16px, which is what squeezed the nine-column
Tackles identity column below a real roster name at 1440. Measured halves are
663px at 1440 and 583px at 1280; the tables need 620 / 632 / 498 / 638 / 482 /
448. Pairing Tackles also has to leave its identity column room for a name, so
the breakpoint is where that stops being true: **1420px**, measured, not the
width at which the table alone fits. Every band pairs at 1440 and only the
bands carrying Rushing, Passing or Tackles stack at 1280 — Return Game and
Kicking / Punting stay paired. A stacked band roughly doubles its measurement
columns, because left at the paired widths the identity column absorbs ~830px
of the extra room and a row reads as a name at the far left with its first
number at the far right.

**The row marker costs the identity column no width.** Reserved inline it took
~13px off every identity cell in every table, which the Tackles table cannot
spare; absolutely positioned in the cell's own left inset it still moves no
text, because it never occupied any. `Terrance Whitfield-Boateng` fits at 1440
with 10px to spare in Tackles, the tightest column on the board. The identity
cell keeps `text-overflow:ellipsis` as a last-resort safeguard for an imported
name longer than any panel can ever give it.

**The selected role section is controller state, not view state.** A scope
change re-renders the tab, so a selection held only in `PlayersTab` was
discarded and the board snapped back to All roles under the coach's hands.
`ReportsScreen.playersSection` survives that remount the way `playersScope`
already does; switching section still re-renders in place, so it does not
disturb sort. A scope change DOES reset the sort, deliberately — the cohort
under it changed.

**The role count keeps its denominator whenever a role is unattributed.**
`5 roles` reads as the whole set; `5/6 roles` says one is missing. A full six
drops the denominator, because there is nothing absent for it to name.

**Two absence surfaces, one literal.** Roles with no attribution consolidate
into a single `No data` row naming them, so the fixed role set stays visible
without six mostly-empty panels; with no attribution anywhere the board is
replaced by the ruled empty band — `No player attribution` / `No players are
attributed to charted plays.` / `Open Break Down`. Neither ever shows a zero:
unattributed is not zero production. A **measured** zero keeps full strength —
a return fielded for no yards is `0`, and a takeaway credited with no tackle
keeps its `0` tackles.

**Every row opens its own role cohort.** `_playersCohort` reuses the same
self-perspective assembly Defense and Special Teams use, so `refs` are real
composite `gameId::playId` values in both scopes and a full-season row plays
across games through the one film-navigation service. There is no jersey
cut-up fallback: clicking a rushing row opens the carries that produced that
rushing line, labelled with the role so a rushing cut-up is distinguishable
from a receiving one. Full season is that same multi-game cohort, not a
Players-local aggregation.

**The Grade column renders.** `individualStats` returned `{text, cls}` and
spread it into the row, so `DataTable` looked up a `grade` key that did not
exist and every Grade cell was empty. It now returns `grade` / `gradeClass` /
`gradeSort`, and five columns that sorted as zero (`Pct`, `C/A`, `FG (M/A)`,
`Punts`, `Punt Avg`) carry real sort accessors — `Number('62.1%')`,
`Number('18/29')` and `Number('2/4')` are all `NaN`, which `DataTable`'s
`(Number(av) || 0)` turns into 0. An absent grade sorts last in both
directions.

**`DataTable` gained two optional inputs, both used only here:** a `size` on a
column emits the colgroup, and `defaultSort` marks the column the view model
already orders by so the sort affordance is visible at rest. Kicking / Punting
opens unmarked because the engine orders it by made plus punts, which is not a
single column.

Verified on the coach's real 2025 JV season at all three release widths in both
scopes: 13 players, six roles, 449 charted plays, no page overflow, no clipped
cell, no scroller engaged, zero console errors.

---

**Reports > Self-Scout is implemented and gate-verified, but NOT coach
accepted.** Built to the approved comp (`design-comps/reports-self-scout-2026-09-05`,
whose RATIONALE is the decision record; sections 17-18 and the revision 4
typography correction are the composition contract, at checkpoint `dd9812a`).
No Charlie Gate and no installed smoke, so it is not accepted state.

Self-Scout is **five sections presented as a TAB STRIP**, one on screen at a
time: Offensive Summary, Calls & Situations, Structure, Defense, Tendencies.
The production page it replaces measured 4,257px at 1440 — nearly five
viewports of undifferentiated modules with the whole defensive report below the
offensive one. Scope, the section navigation and Export share **one control
row**; the report canvas is capped at 1648px and centred inside a board that
carries no padding of its own, the same geometry the Players board uses.

**Offensive Summary and Defense share one composition:** six KPI tiles, then
three two-column rows — Positive Plays | Negative Plays, Top Calls | Worst
Calls, Run | Pass. Those rows hold through 1280 and stack only below 1000. The
six KPI tiles also stay on ONE row at 1280, the same ruling the Special Teams
ledger carries: wrapping to 3×2 spends a whole extra row on six short cards.

**Module headers carry the title only.** No counts, thresholds, sample
language, captions or explanatory subheads render beside or beneath a module
title, and an unavailable KPI reads `No data` with no sentence explaining the
absence. Generated Recommendations and Film Room Insights are not rendered:
they restated the data in speculative coaching prose. Tendencies is the only
section carrying predictability, the tells, the predictability map or the
defensive tells.

**A defensive call is ONE composite identity: Front + Coverage +
Blitz/pressure, in that order**, joining only the components the play actually
carries. A blank pressure is omitted, never relabelled `No blitz` — an
untagged field is missing data, not a charted call. Calls qualify at three
plays and rank by stop rate, then LOWER yards allowed per play, then sample;
Worst Calls is that same ranking read from the other end. Offensive calls
qualify at three plays and rank by success rate, then yards per play, then
sample. Both rankings live in `StatsEngine`, never in the view. **With fewer
than six qualified calls the two tables overlap** — with one qualified call it
is both the best and the worst. That is the approved comp's own behaviour and
is carried into the Charlie Gate.

**Three canonical predicates were extracted, not duplicated.**
`StatsEngine.isExplosive` (a 12-yard run or a 16-yard pass), `isConversion`
(gained the line to gain, or scored) and `isTackleForLoss` now have one owner
each; `_efficiencyStats`, `_downStats`, `_defensiveStats`, `_selfScoutGroup`
and the `explosive` cut filter all call them. No compute() output changed. The
summary models (`selfScoutSummary`, `selfScoutDefenseSummary`) read
compute()'s own efficiency, scoring, downs, negative-play, situational and
defensive results rather than recomputing any of them, so every count on the
board reconciles with the KPI band above it by construction.

**Self-Scout now takes the shared self-perspective cohort.** It has no scope
control — it reports the current game, the scope it has always had — but it
sources that cohort through `_selfScoutCohort()` (`_selfPerspectiveCohort('game')`),
the same assembly Defense, Special Teams and Players use. That is what stamps
`__gid`: sourced straight from the live tagger, as it was, every Self-Scout row
carried NO composite refs at all, which is the production dependency the comp
record raised. Every ranked call now retains the exact `gameId::playId` cohort
behind its own count, accumulated in the same pass that increments it.

**The selected section is controller state.** `ReportsScreen.selfScoutSection`
survives the remount an ordinary Reports re-render causes, the same correction
`playersSection` needed.

**Self-Scout is current-game scope.** It therefore keeps the shared current-game
header and KPI rail. The chrome follows the report's real scope; it is not a
reward for completing a design pass and must never imply a game scope for
season or matchup data.

---

**Reports > Season is implemented and gate-verified, but NOT coach accepted.**
Built to the approved comp (`design-comps/reports-season-2026-09-05`, whose
RATIONALE is the decision record, including its Revision 2), at comps `4762557`
and `2f92ab9`. No Charlie Gate and no installed smoke, so it is not accepted
state.

**Season is a CONTAINER, not a second set of reports.** It owns season identity
and its seven-section navigation, the six aggregate KPIs, the chronological
Game Log, Situational Offense, Scoring & Possessions, Early vs Recent, Wins vs
Losses, Game-by-Game and the existing season export. Offense, Defense, Special
Teams, Players and Self-Scout render their OWN approved production boards at
full-season scope — no fork, no Season-specific variant. The Season-only
`Offensive Identity` band, the `Wins vs Losses` table and the `Per-Game Box
Score` that had been bolted onto Players are gone from those tabs; the two
comparisons now live in Trends, where they belong, and Players is the approved
Players board alone. Overview no longer renders the generic `OverviewTab`
beneath its own modules.

**Opponent-scout games are excluded from Our Program season totals.** They were
not. `SeasonManager._effectiveGames()` returned every game, so a charted scout
game put the opponent's offense into our yardage, success rate, turnover margin
and record — and into the exported report. `_selfGames()` is the new Our
Program cohort and `reportModel()`/`_allPlays()`/`exportHtml()` take it;
`_effectiveGames()` stays unfiltered because `StatsEngine._allSeasonGames`
reads it to build the Opponent Scout report, whose whole subject is that film.

**Early vs Recent and Wins vs Losses are ONE metric list.**
`SeasonManager.COMPARE_METRICS` holds the six — Success Rate, Yards / Play,
3rd Down Rate, Points / Drive, TO Margin / Game, TD / Game — in the one order
both panels use, and one cohort summariser (`_cohortSummary`) measures both, so
the same label can never be measured two ways. Higher is better for all six, so
a positive delta is always `Up`. Every delta names its own unit: percentage
points (` pp`) for a rate, ` yds/play`, ` pts/drive`, `/game`. Printed
unitless, a rate change and a raw change read as directly comparable numbers,
which they are not. The Steady band is per metric: Success Rate 2pp, Yards /
Play 0.3 and 3rd Down Rate 3pp are the thresholds the previous progression card
already applied; Points / Drive and TO Margin / Game are new here and take 0.3,
the band every other per-play and per-game measure on the list uses.

**`TO Margin / Game` is per game.** It is the cohort's aggregate margin divided
by that cohort's own game count, not the raw aggregate under a per-game label —
and it reconciles with the `TO ±` column the Game Log shows, which itself sums
to the aggregate Turnover Margin KPI. Points / Drive is computed with the game
boundaries intact: the cohort's plays are the same objects `_allPlays()` already
stamped with `__seasonGameIdx`, so drive reconstruction never merges possessions
across a game boundary. Asserted, not assumed: season drives equal the sum of
each game's own drives.

**The window is dynamic.** N = min(4, floor(charted games / 2)), taken as the
first N and the last N so the two windows never overlap; eight or more charted
games always compares First 4 with Last 4, and the KPI labels say which. Fewer
than two charted games keeps the concise Trends empty state.

**Eligibility is per MEASURE, not per game.** A game charted on defence only
has plays, so it belongs in the Game Log, the record and the win/loss cohorts —
but it measured no offense, and reporting `0` snaps or `0` rushing yards for it
states something nobody charted. Every offensive measure on such a row is
absent; so is its turnover margin, because a giveaway is only observable on a
charted offensive snap and a takeaway on a charted defensive one. The
denominators follow: `Yards / Game` divides by the games charted on offense,
`Last N Points / Game` by the SCORED games in the window (an unscored game is
not a shutout), `Last N Yards / Game` by the window's offensive games, and the
two comparison panels' `TD / Game` and `TO Margin / Game` by the games in that
cohort which could measure them. The turnover numerator follows the same rule:
season and cohort margins sum only games where both sides were observable;
with no eligible game, the measure is `No data`, never zero.

**Opponent-scout rosters never rename our players.** `_mergeRoster()` read
`_effectiveGames()`, so a scout game's roster — both teams field a 22 — could
relabel our own player across the Season Players board and the export. It takes
`_selfGames()` now. The same repair surfaced a second hole: `storage._serialize()`
carries no roster, so the ACTIVE game's own roster was missing from every season
consumer; `_effectiveGames()` now carries it onto the live projection.

**The export reports the same scope and structure as the board.** It need not
look like it, but it prints the same six aggregate KPIs, the same Game Log over
`gameLog` — the previous `perGame` source dropped scheduled rows, so the report
could say "3 games" above two rows — the same `Success Rate` column label, both
Trends comparisons, and deltas that still carry their units.

**The Game Log is the season's own chronology.** Oldest first through
`SeasonStore.gamesChrono()`, so a preseason scrimmage dated before Week 1 sorts
first on its date and never on its week text — the Week column prints
`Scrimmage` verbatim. Week, date, opponent, result and score come from
`gameInfo` directly; nothing scrapes them back out of a display name, and a
game label falls back to the store's own `gameName()` helper. Rush, Pass and
Total are yardage, not attempt strings, and the visible rows reconcile with the
season total. A scheduled game with nothing charted keeps its row and reports
`No data` at copy weight in every measured cell — an uncharted game is an
absence, not a zero.

**Season is NOT in `SCOREBUG_TABS`**, and `_syncKpiRail` already hid the
game-scope rail on this tab: the board's own KPI band is its scope owner.

---

**Reports > Matchup is implemented and gate-verified, but NOT coach accepted.**
Built to the approved comp (`design-comps/reports-matchup-2026-09-06`, whose
RATIONALE is the decision record). No Charlie Gate and no installed smoke, so
it is not accepted state.

**Matchup is a situational JOIN, not two unit profiles side by side.** The
previous board placed our profile beside theirs and left the coach to do the
matchup analysis. Each of the two directions — `Our Offense vs Their Defense`
and `Our Defense vs Their Offense`, one on screen at a time — now leads with
`Situational Calls`: what the opponent most often calls in each of five fixed
situations, and what our own season produced against that exact charted look.
Beneath it sit paired `Production by Play Type` tables, and then the
direction's own support section — `Coverage Answers` on the offense-facing
tab, `Personnel and Formation` on the defense-facing one. The broad KPI strip
is gone; every performance value now sits beside the cohort and situation that
produced it.

**Five fixed situations, all from existing predicates:** 1st Down, 2nd & 7+,
3rd & 1-3, 3rd & 7+, Red Zone. `defensivePerformance`'s own situation specs
supply four of them and `_defensiveStats`' passing-down rule the fifth, so no
competing distance or yard-line formula exists. Rows overlap by design — a
red-zone third down belongs to both cohorts.

**`Rate` is a share of ELIGIBLE opponent snaps, never a success rate.**
Eligible means the snaps in that situation that carry a resolvable call
identity. A snap with nothing charted can never reach the numerator, so
counting it in the denominator would deflate every rate against a cohort no
call could appear in. Ranking is frequency descending, then the DISPLAYED call
name ascending — deterministic, and `Top` means most frequently charted
everywhere on this board, never highest-performing.

**`No Blitz` is a charted call; an untagged field is not.**
`StatsEngine.isNoBlitz` — extracted from `_defensiveStats`' own `noBlitzTotal`
cohort so the report's blitz denominator and Matchup's displayed call are one
rule — admits a snap only when the blitz field is empty AND a front or a
coverage was charted. A snap with no defensive structure produces no call at
all. A displayed `No Blitz` matches only season snaps the same rule admits, so
a blitzed rep against the same front and coverage never satisfies it.

**A filter is never widened to fill a row.** The season side matches every
nonblank displayed component exactly, through the same canonical projection
that produced it. With no exact match the row reads `No matching snaps` at
copy weight and prints no measurement — never a fabricated zero.

**A displayed call remembers which FIELD produced it.** `_matchupCall` returns
the call and its `callField` — `playCall`, or `playConcept` as the fallback
every other call consumer here uses — and the matcher compares that same
field. Re-deriving `playCall || playConcept` on the season side silently
missed every snap that carried both: an opponent row showing a charted concept
`Zone` never matched our own `Inside Zone` snaps that were also tagged `Zone`,
and reported `No matching snaps` against a cohort that existed.

**A multi-select identity is order-independent.** A `" + "`-joined tag stores
SELECTION order, which carries no football meaning, so `_matchupSet`
deduplicates and joins components in canonical order for both the key and the
label. Without it `4-2-5 + Nickel` and `Nickel + 4-2-5` split one opponent
call into two — halving each one's frequency and Rate — and a season snap
charted in the other order produced a false `No matching snaps`.

**A nullified penalty snap is not a defensive rep.** `defensiveCohortMetrics`
applies `_tryPenaltyResolved` itself, so the contract belongs to the owner
rather than to each caller, and `matchupReport` applies it to both defensive
cohorts before anything RANKS them — a snap wiped out by an accepted penalty
must set no call frequency, no Rate and no film reference either, not merely
stay out of the average. A 2-yard snap beside a nullified 99-yard snap
reported 2 snaps at 50.5 yards allowed with both plays in the cut-up.
Offensive cohorts go through `compute()`, which is the canonical Offense
report's own cohort rule.

**Four cohorts, four independent game counts.** Each unit header states the
games that contributed to THAT cohort — a game charted on offense only must
never inflate the defensive sample stated beside it, and the same holds for
the opponent's two units. Only the summary line above them carries a combined
count, because the opponent's film as a whole is the one thing it describes.

**Polarity is per COHORT, not per lane.** A lane holds both cohorts: our
offensive production reports Yards / Play and Success Rate, their defense
Yards / Play Allowed and Stop Rate, and the two are never interchanged.
`defensiveCohortMetrics` was extracted from `defensivePerformance`'s own
`summarize` so a defensive cohort is measured by one owner on both surfaces;
offensive cohorts go through `compute()` unchanged.

**Film is TWO explicit controls, `Opponent` and `Season`.** Never one
ambiguous whole-row action, never an unlabelled icon, and never the two
cohorts combined into one cut-up. Each opens exactly the deduplicated, sorted
composite `gameId::playId` set behind its own side of the row, and a side with
no references renders no enabled control at all. The two sets are separate
cohorts; they are disjoint whenever the opponent's film is a scout game, and
they legitimately share a rep when the opponent film is a game we PLAYED —
`_matchupData`'s established shortcut reads one charted snap as both our
offensive rep and their defensive one.

**No matchup score, prediction, recommendation, inferred advantage or
confidence claim is calculated.** Nor is there gap-level analysis: stored
`playDir` is Left, Middle or Right and cannot honestly support A/B/C/D.

**The active direction is controller state.** `ReportsScreen.matchupTab`
survives the remount an ordinary Reports re-render causes, the same correction
`playersSection` and `selfScoutSection` needed. A direction the opponent film
cannot answer is not offered at all — the partial state names the missing
opponent unit literally rather than rendering a selectable dead tab.

**Matchup has matchup-scope shared chrome.** It suppresses the current-game
scorebug and KPI rail, names the selected opponent in the Reports header, and
states `Season film and opponent film`. The board and its frame therefore
describe the same two cohorts.

**One deliberate difference from the comp: no green/red performance tone.**
The comp's fixture hand-colours some Yds / Play and Success values good or
bad. Production has no canonical good/bad threshold for either measure, and
inventing one would be exactly the inferred advantage this board refuses to
calculate. The cohort colours the comp does specify — gold for opponent film,
cyan for season film, repeated in the key above the situational table — are
implemented. Carried into the Charlie Gate.

---

**Special Teams chrome follows its scope.** At Current game it uses the shared
current-game header and KPI rail. At Full season it suppresses all game-only
chrome and names `<season> Special Teams` / `Full season`. No
Special-Teams-only scorebug variant exists. Export reuses the existing
mechanism (`exportSpecialTeams` → `buildSpecialTeamsHtmlReport` → the shared
`documentShell` and `window.ffaSaveBlob`), never a second export subsystem.

**The printed report has its own KPI band renderer, and needs one.** The board's
tiles carry NAMED values (`stats`), not the `value`/`sub` pair the generic
`metrics()` band reads, so three tiles — Special Teams Snaps, Points and
Touchdowns — exported as empty headlines. `stMetrics` gives each named value its
own label/value row; flattening them into the band's 25px display `<strong>`
wrapped one tile over three lines and printed a stat's label at headline size
beside its own number. Covered by section 11 of `e2e-reports-special-teams`,
which compares the rendered board's figures against the exported HTML and is
mutation-verified against the generic band.

**The outcome bars are absolute, not relative.** Scaling each bar to the
largest bucket made a 29% outcome fill the whole track; the width is the
bucket's own percentage of its unit.

**One approved production change is still pending, carried by no file:** the
context bar wrapping long game names at 1280 instead of clipping (shared shell
owner — and the shell's response to a taller bar still needs verifying).
Generic `yardage`/`result` on ST plays stay unread by design:
dedicated ST fields remain authoritative, and that data is recorded as an input
to a later projection decision.

**Shared Reports chrome follows the report's actual scope.**
`ReportsScreen._usesCurrentGameContext()` is the single scope decision. The
scorebug can render only for a tab in `SCOREBUG_TABS` that is also using the
current game; the generic KPI rail can render only for another current-game
report. Full-season Defense, Special Teams and Players, the Season board, and
Matchup suppress both game-only elements. Their shared header names their real
scope. Current-game scope buttons resynchronize the header before rendering,
so changing scope cannot leave stale game or season framing behind.

Score spacing is structural, not tuned: `.gi-scorebug-team` is `display:contents`
so each team's name and score land in the scorebug's own fixed tracks. Score
cells never move for a name length or a 1-, 2- or 3-digit value; names truncate
inside their own bounded track with the full value in a tooltip.

**Defense renders a LINESCORE variant** of the bug (`is-linescore`) instead of
that pair — approved for Defense only on 2026-09-04, so Overview and Offense
keep the pair until their own passes. One row per team: nickname, four quarters,
total. The quarter and total columns are fixed and equal, and the three rows
share one grid through `display:contents`, so the name column is sized once from
the longest nickname and both totals hold one track. It shows **nicknames**,
from the 2026-08-31 naming contract — that retired the name-width problem
rather than managing it, since a nickname is short by nature.

**The linescore's two numbers have different sources, by design.** The total
prefers the official Game Settings score and falls back to charted scoring; the
quarters are always derived from charted scoring plays. They agree on every one
of the coach's ten live games. They would disagree only if a final score were
entered without every scoring play being charted, which the coach has ruled not
worth designing for. Verified exact on a fully charted game including a missed
XP, a pick-six credited to us rather than the offense on the field, and a
safety on a defensive play: quarters sum to totals on both rows.

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
4. **The remaining Reports Charlie Gates** — every tab now has a comp and is
   built. Shared chrome follows the selected report scope: current-game boards
   may show current-game chrome; full-season boards, Season and Matchup do not.
   **Reports > Special Teams Charlie Gate** — populated real-data review at the
   release widths, then PASS / REVISE / REJECT.
   **Reports > Players Charlie Gate** — populated real-data review at the
   release widths, then PASS / REVISE / REJECT, plus an installed smoke.
   **Reports > Self-Scout Charlie Gate** — populated real-data review at the
   release widths, then PASS / REVISE / REJECT, plus an installed smoke. Three
   questions carried into it: Top and Worst Calls overlap when fewer than six
   calls qualify (with one qualified call it is both); the predictability
   map is auto-layout, so a sparse season with two situation columns stretches
   each cell across the panel; and `Yds / Play` prints `6` rather than `6.0`
   because `_selfScoutRows`' own `avg` is a number, which the legacy tables
   and the HTML export have always shared.
   **Reports > Season Charlie Gate** — populated real-data review at the
   release widths, then PASS / REVISE / REJECT, plus an installed smoke. The
   comp's four open decisions stand and are carried into it (`Yards / Game`
   versus `Total Yards`, whether Situational Offense belongs on Overview or in
   Trends, the compact quarter table versus the bar treatment, and what a Game
   Log row should open). The Game Log row action is deliberately unbuilt until
   that last one is answered. Two things to look at while reviewing: Wins vs
   Losses is a three-column table, so its pair of values sits well right of the
   metric label at 1440 and wider — the comp's own geometry; and `Games` counts
   every scheduled Our Program game while `Yards / Game` divides by the charted
   ones, which differ only when a game is scheduled but not yet charted.
   **Reports > Matchup Charlie Gate** — populated real-data review at the
   release widths, then PASS / REVISE / REJECT, plus an installed smoke. Three
   things to look at: the board carries no green/red performance tone, because
   production has no canonical good/bad threshold for Yds / Play or Success
   and inventing one is the inferred advantage this board refuses to compute;
   and when the opponent's film is a game we PLAYED rather than a scout game,
   the `Opponent` and `Season` cut-ups legitimately share a rep, because
   `_matchupData` reads one charted snap as both our offensive rep and their
   defensive one.
   **One approved Special Teams change not yet built:** the context bar
   wrapping long game names at 1280 rather than clipping (shared shell owner;
   the shell's response to a taller bar still needs verifying).
5. **CLOSED 2026-09-06 — Reports scope/frame mismatch.** Full-season Special
   Teams, Defense and Players now suppress the current-game scorebug and KPI
   rail and identify the season scope in the shared header. Matchup names the
   selected opponent and its two film cohorts. Current-game scope restores the
   game frame. The behavior is centralized in `_usesCurrentGameContext()` and
   pinned in the Reports, Special Teams and Matchup harnesses.

6. **CLOSED 2026-09-06 — legacy punt-block ownership.**
   Found by the coach at the board, 2026-09-04; repaired after the whole-Reports
   smoke candidate exposed that the known defect was still in its installer.

   The Punt unit reports `Blocked 1` on `2025-st-joseph-mavericks-jv`. The
   coach charted the opposite: **we blocked their punt.** Holy Family, Q2,
   play id 16 — 4th & 6, `result: Loss`, `yardage: -5`,
   `kickOutcome: Blocked`, and the only player charted is
   `players.tackler: '82'`.

   The evidence for whose punt it was is the coach's own account plus the
   player role: a `tackler` and no `kicker`. The play's field position (the 8)
   does **not** settle it — ST field position carries no proven owner
   perspective in the stored model, so it cannot distinguish our own 8 from
   theirs. Do not cite it as proof.

   Root cause: the legacy branch of `_specialTeamsStats` treats **every**
   `stType:'Punt'` as our own punt team — `const pp = by('Punt')`, then
   `blocked: pp.filter(kickOutcome === 'Blocked')`. Legacy `stType` carries no
   perspective, which `GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md` §3 already names as
   its central flaw; the structured model solves it with `subjectRole`.

   The coach's charting DOES carry the signal, in the player role, and the
   engine reads none of it: 5 punts charted with a `kicker` (ours) versus this
   one charted with a `tackler` and no kicker (theirs). Two kickoffs match the
   same shape — id 28 (`returner` only) and id 57 (`takeaway` only, muffed),
   neither with a `kicker`.

   Blast radius beyond the wrong label: the Punt unit's denominator is 10 when
   only 9 punts were ours, so every punt rate is computed over a cohort that
   includes an opponent's punt, and the play also feeds the `Punts blocked`
   impact row and the Touchdowns/coverage refs.

   Coach decision, 2026-09-06: for a legacy `stType:'Punt'` with outcome
   `Blocked`, a charted defensive role and no kicker/punter is our punt-return/
   block unit. It is removed from our punt-team denominator, rates, outcomes,
   impact row and film; it is counted as a punt-return/block snap with exact
   film and the positive `Punts blocked` impact label. A blocked punt carrying
   a kicker/punter remains `Punts blocked against us`. Ambiguous legacy punts
   keep their historical classification; field position is never used to infer
   ownership. `e2e-reports-special-teams` pins all three directions.

7. **Reports > Defense Charlie Gate** — populated real-data review at the
   release widths, then PASS / REVISE / REJECT, plus an installed smoke.
8. **Offense still scrolls; Defense uses tabs.** The coach approved section
   tabs for Defense on 2026-09-04 with Offense converting in a later pass, so
   the two reports navigate differently until that lands. Recorded as a known
   temporary inconsistency, not an oversight.
9. **Three Defense band gaps** — Run / pass faced 78px, Opponent play type
   86px, Situational defense 72px. They come from genuinely different row
   counts in real data; closing them means stretching table rows or full-width
   tables, both of which were tried and rejected. Carried into the Charlie Gate.
10. **Defense > Self-Scout is rejected duplicate presentation.** The Defense
   report's fifth section is the older predictability-only wall, not the rebuilt
   top-level Reports > Self-Scout board. Its prose-heavy predictability score and
   tendency table duplicate a narrow slice of the canonical report and were
   rejected by the coach during the `1.12.0-74` smoke. Remove that Defense
   subsection or replace it only with distinct defense-specific value; do not
   preserve the duplicate wall as another Self-Scout owner.

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

Reports harnesses: `tools/e2e-native-reports.mjs` (the route as a whole, 108),
`tools/e2e-reports-overview.mjs` (the fixed Overview schema, deterministic
ranking/caps, sparse and overflow states, drive boundaries, film actions and
responsive geometry, 106), `tools/e2e-reports-overview-realdata.mjs` (the
canonical six-game season binding, longest-title navigation at both desktop
release widths, perspective-safe title tooltips and read-only captures, 35),
`tools/e2e-reports-offense.mjs` (the Offense composition, its football contracts
and the shared scorebug rule, 46), `tools/e2e-reports-special-teams.mjs`
(the Special Teams composition, its absence contract, the two engine
corrections, legacy punt ownership, scope chrome and the printed export, 50), `tools/e2e-reports-players.mjs`
(the Players composition, its role schemas, its measured column geometry, the
absence contract, the role-specific composite film cohorts and the Grade
repair, 169) and `tools/e2e-reports-self-scout.mjs` (the Self-Scout
composition, its title-only module headers, the composite defensive-call
contract, both ranking rules, canonical metric reuse, exact film cohorts and
1440/1280 containment, 90) and `tools/e2e-reports-season.mjs` (the Season
composition, the opponent-scout exclusion, chronological ordering, Game Log
reconciliation, the shared comparison metrics with their units and thresholds,
the dynamic First N / Last N windows, per-game turnover margin, drive-boundary
safety, and the child boards reused unchanged at season scope, 98) and
`tools/e2e-reports-matchup.mjs` (the Matchup composition, opponent selection,
both directions, the five situations, opponent-call ranking and its
tie-break, the Rate denominator, the exact season-side joins and
`No matching snaps`, the no-blitz versus uncharted-defense distinction,
per-cohort metric polarity, the supporting sections, the partial and empty
states, the separate `Opponent` / `Season` film cohorts, the nullified-penalty
exclusion, order-independent multi-select identities, field-faithful call
matching, per-cohort game counts, scope chrome and 1440/1280 containment, 72).

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
- **Commit the first working pass before revising it.** A coherent deliverable
  gets a local commit as soon as it exists, so revisions have a restore point
  and a reviewer has something fixed to read. Local is enough -- a reviewer
  works this branch on this machine; a push is a separate decision.
- **A design comp's decisions live in its RATIONALE.md, and every commit
  touching a comp must name that file.** The comp directory is the deliverable;
  the RATIONALE is where the production-to-comp mapping and the open approval
  decisions are recorded, including any deliberate divergence from an already
  accepted screen. **Reviewing a comp means reading its RATIONALE** -- a
  divergence stated only in chat or only in a commit body is not recorded.
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
