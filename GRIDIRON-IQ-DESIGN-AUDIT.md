# GridIron IQ - Installed Design & UX Audit

## Status

**ACTIVE.** Created from the coach's installed `1.12.0-15` smoke on 2026-07-30.
The functional S4 checklist passed; S4 is accepted and S5 opens. That pass proves
the migrated shell, overlays, Reports lifecycle, linked-film workflow, and core
journeys function in the installed app. It does **not** declare the current visual
design complete.

This is a batched audit. Do not ship one-off styling releases from individual
screenshots. Structural findings are resolved at their owning milestone; shared
analytics presentation is resolved as one system.

## Review Ownership

- **Coach:** workflow truth, football usefulness, final product acceptance.
- **Codex:** leads UX/design analysis and implementation; verifies responsive,
  interaction, and visual-system quality.
- **Claude:** independently reviews code, analytics parity, football semantics,
  persistence safety, and whether the visual implementation misstates data.

All three reviews are required. The coach is not the project's sole visual QA.

## Screenshot Plus Truth Rule

Every route-level design review uses full-window captures at approximately
1440x900, 1280x800, 768x1024, and 390x844, plus the installed Windows window size.
A screenshot set is incomplete until it also includes at least one source-backed
functional spot check for that route. Do not exhaustively recompute every value;
choose one representative, high-signal assertion per page.

| Route | Minimum spot check alongside visual review |
|---|---|
| Home / Team Hub | One game's displayed play count, score, and film-health state match canonical/backend data. |
| Break Down | Selected play shows the stored tags and resolves the intended linked source/clip; no managed fallback. |
| Study | One matching count or grouped metric equals the analytics registry, and its Watch action emits the exact composite refs. |
| Reports | One displayed KPI/table value equals `StatsEngine.compute()` and one highlighted row opens the exact film cohort. |
| Plan | Visible item count/order/notes equal the canonical plan model; one Watch action preserves its refs. |
| Settings | Displayed root, game path, storage mode, and one clip-health count equal the backend snapshot. |

For every route also check: whole-window containment, zero page-level horizontal
overflow, keyboard/touch reachability, focus visibility, empty/loading/error
states, US-English copy, and real-season density. Numbers may never be accepted
because they merely look plausible.

## Structural Findings - Resolve Before Or During S5

### UX-1 - Video fidelity / softness (P1)

Real linked 1080p/4K phone film looks noticeably soft in the installed player.
Aspect ratio appears correct; detail fidelity does not. Before changing CSS,
compare the same frame from the original D: file and WebView2 playback. Record
source codec/resolution/bitrate, `videoWidth`/`videoHeight`, rendered dimensions,
device pixel ratio, WebView zoom, GPU state, asset URL, and hashes/path truth.
Prove there is no managed fallback or transcode. This investigation is a direct
input to S5-a's native video/strip implementation.

### UX-2 - Universal game context control (P1)

The left rail is universal navigation, so game context must be switchable from
Home, Break Down, Study, Reports, and Plan without a Home round trip. Turn the
current season/game display into a keyboard/touch popover grouped by season. Each
game row shows week/opponent, score or upcoming state, plays charted, and film
health. Selection uses canonical `openGame()` and preserves the current route and
its meaningful sub-view (report tab/perspective, Study query where valid).
Design and contract this before S5; implement as shared shell ownership rather
than five route-specific selectors.

### UX-3 - Responsive shell containment (P1)

Installed Study showed brand/team/nav clipping on the left and controls, KPI
cards, and charts extending beyond the right edge. At insufficient width the
rail must compact and route content must reflow; zero page-level horizontal
overflow is mandatory. Audit every route at the actual installed window size,
not only ideal browser dimensions, before S5 visual acceptance.

### UX-4 - Design-system ownership audit (P1)

The shell uses parts of the new token system, while embedded tables, SVG charts,
legends, typography, and spacing still expose legacy presentation. Inventory
hard-coded colors, inline SVG styles, legacy selectors, local font stacks, and
route-specific substitutes before adding more S5 markup. Establish a documented,
accessible categorical chart palette distinct from semantic status colors.
Apply the system route by route; do not repaint isolated screenshots.

## Analytics Experience Findings - Resolve As A Shared S6 Pass

### AX-1 - Reports formatting and hierarchy (P1)

Offense and Special Teams render raw, tightly stacked metric fragments; Matchup
shows horizontal overflow, large gaps, unclear missing content, and weak labels.
Audit all eight Reports views together. Replace raw fragments with consistent
stat blocks/tables, honest empty states, stable responsive dimensions, and clear
sample/units. Preserve every existing metric, report, export, and exact film link.

### AX-2 - Predictability Map (P1)

The matrix does not visually communicate its rows, columns, missing samples,
sorting, or inclusion rules. Counts appear detached from percentages and
situational buckets look incomplete. Redesign as a legible matrix with explicit
No data versus zero, sample size, and clickable film cells. Separate predictable
and ineffective from predictable and effective; never label a small sample as a
coaching certainty.

### AX-3 - Recommendations content (P1)

Recommendations are repetitive, overly verbose, and overconfident. Rank a small
number of findings by confidence and impact. Each finding should show trigger,
evidence, risk, suggested counter, sample size, and Watch plays. Collapse repeated
countermeasures into one theme. Codex proposes the UX; Claude challenges football
semantics and numerical support; coach accepts the coaching usefulness.

### AX-4 - Reports Overview composition (P1)

The score separator is misaligned and the scoreboard leaves most widescreen space
empty. Use equal team blocks and a centered separator. Keep Recommendations in
Study; use the right side for factual Game at a Glance content such as plays,
yards/play, success rate, turnovers, explosives, third downs, or scoring drives,
all film-linked. Move technical scoring fallback prose behind an information
affordance. Stack cleanly on narrow screens.

### AX-5 - Shared chart primitives (P1)

Donut content and legends clip. Put chart titles outside the ring; reserve the
center for a larger, stronger primary number. Give legends stable dimensions and
complete labels. Repair the shared primitive, not individual instances. Verify
contrast and non-color meaning. The current cyan/orange legacy palette is not
assumed to be the approved design-system palette.

### AX-6 - Product copy (P2)

Run a US-English copy audit, including the misspelling of `tendencies`. Remove
internal implementation language from coach-facing screens. Keep labels concise,
football-correct, and consistent across routes.

## Sequence

1. S4 accepted from installed `1.12.0-15` functional smoke.
2. Before S5 implementation decisions: investigate UX-1; contract UX-2; inventory
   UX-3/UX-4 ownership so S5 is built on the right shell and visual primitives.
3. S5 builds native Break Down with theater-first film fidelity, shared context,
   responsive containment, and route-level screenshot-plus-truth review.
4. S6 treats Reports, Study, and Plan as one analytics experience and resolves
   AX-1-AX-6 without changing parity-locked formulas or film cohorts.
5. Each milestone gets coach workflow review, Codex design/implementation review,
   Claude independent correctness review, and an installed smoke where required.
6. Final cross-route visual audit remains required after S7 legacy deletion.