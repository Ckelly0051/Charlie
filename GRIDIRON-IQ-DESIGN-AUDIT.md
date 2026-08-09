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
| Break Down | Selected play shows the stored tags and resolves the intended linked source/clip; no managed fallback. **Plus, once S5c lands: a play carrying a saved `play.diagram` still renders its editor and still produces its Call Sheet thumbnail** — the one persisted field on this surface with no harness or inventory owner (plan §3.2 item 1). |
| Study | One matching count or grouped metric equals the analytics registry, and its Watch action emits the exact composite refs. |
| Reports | One displayed KPI/table value equals `StatsEngine.compute()` and one highlighted row opens the exact film cohort. |
| Plan | Visible item count/order/notes equal the canonical plan model; one Watch action preserves its refs. |
| Settings | Displayed root, game path, storage mode, and one clip-health count equal the backend snapshot. |

**Who captures what (added 2026-07-30, Claude's S5 readiness audit).**
`tools/shots.mjs` produces the four browser viewports and already fails on
duplicate bytes and page-level horizontal overflow. It **cannot** produce "the
installed Windows window size" — it is headless Chromium, and the two failures
this rule exists to catch (`1.12.0-13` blank Reports, `1.12.0-14` hidden Reports)
were both invisible to it. So that fifth capture is **not a screenshot chore, it
is the installed smoke**: it belongs to whoever runs the milestone installer, is
recorded in that milestone's `SMOKE-*.md`, and its pass criterion is the same
containment/overflow/reachability list below. A route review that omits it is
incomplete and must say so rather than implying four viewports covered it.

For every route also check: whole-window containment, zero page-level horizontal
overflow, keyboard/touch reachability, focus visibility, empty/loading/error
states, US-English copy, and real-season density. Numbers may never be accepted
because they merely look plausible.

## Structural Findings - Resolve Before Or During S5

### UX-0 - Preflight gaps found by the S5 readiness audit (blocking)

Six contract/coverage gaps are recorded in `GRIDIRON-IQ-SHELL-INDEPENDENCE-PLAN.md`
**§3.2 S5 structural preflight** and are blocking at the sub-milestone each names.
They are design-relevant because they decide what Break Down must still contain:
**scoreboard OCR and the play diagram have zero harness coverage and zero
inventory entries**, and `Kick/Punt` is a live data bug rather than a pending
decision. **Ownership is now assigned in plan §3.2** — perspective to the shared
Break Down context header, direction to a game-level context control, diagram to
advanced tagging, templates and Same-as-Last to the native tagging action row,
OCR preserved. **Preserve means preserve: do not treat an absent control as a
design simplification.** Retiring any of them takes the coach's explicit written
approval, recorded in the plan.

### UX-1 - Video fidelity / softness (P1)

Real linked 1080p/4K phone film looks noticeably soft in the installed player.
Aspect ratio appears correct; detail fidelity does not. Before changing CSS,
compare the same frame from the original D: file and WebView2 playback.

**Corrected 2026-07-30 (coach): proving "no transcode, no managed fallback" does
not prove the picture is sharp.** Path truth is necessary and not sufficient —
it rules out one cause and leaves decode and rendering untested. The test is a
**three-stage comparison of one exact paused frame**:

1. the frame **decoded directly from the D: source file**;
2. the frame **captured from the `<video>` element at `videoWidth × videoHeight`**
   (intrinsic, before any layout scaling);
3. a **lossless installed-app screenshot at rendered size**.

Record alongside it: source dimensions, bitrate and codec; asset path; intrinsic
video dimensions; CSS **and** device-pixel dimensions; WebView zoom; and GPU
state. **The result must state explicitly where degradation occurs — decode,
WebView rendering, or display scaling.** "Looks softer" is not an outcome; a
named stage is. 1 vs 2 isolates decode; 2 vs 3 isolates rendering and scaling.

Note that `object-fit: contain` is already correct in source and headless
Chromium cannot reproduce WebView2 behavior, so this belongs to the installed
build. This investigation is a direct input to S5-a's native video/strip
implementation.

**Measured 2026-07-31 - installed `1.12.0-15`, result: DISPLAY SCALING.**
No coach data or film bytes were changed. The test used Holy Family clip
`D:\Football\Film\Holy Family\20251011_140212.mp4` at exactly 2.000 seconds.
Temporary frame captures remain local and untracked because they contain team
film.

- Source: HEVC `hvc1`, 1920 x 1080, 22,733,339 bytes, 13.397125 seconds,
  approximately 13.58 Mbps total container bitrate.
- Path truth: the installed player loaded
  `http://asset.localhost/D%3A%5CFootball%5CFilm%5CHoly%20Family%5C20251011_140212.mp4`.
  The game is `filmMode: linked`, `filmDir: Holy Family`. No managed C: fallback
  and no transcode participated.
- Decode: installed `videoWidth x videoHeight` was exactly 1920 x 1080. The
  direct-source and installed intrinsic PNGs differed by mean 3.061/255
  (RMS 3.530), while intrinsic edge variance was slightly higher than direct
  source (1254 vs 1217). Playback reported 0 dropped and 0 corrupted frames.
  **Decode is not the softness source.**
- Default 1400 x 900 app window: the element was 1059.625 x 620.359 CSS px;
  contained picture was 1060 x 596 device px at DPR 1 / zoom 1. Only **30.47%**
  of source pixels reached the working view.
- Maximized 1920 x 1009 app viewport: the element was 1338 x 729.359; contained
  picture is approximately 1297 x 729, or **45.6%** of source pixels.
- GPU: AMD Radeon RX 7600, D3D11/ANGLE; GPU compositing, rasterization and video
  decode all enabled. This is not a software-rendering fallback.
- Existing full-screen mode reaches approximately 1920 x 1079, close to 1:1,
  proving the installed pipeline can present the source sharply when layout
  gives it the pixels.

**S5a result, measured in the real route (Claude, 2026-08-01, `a0d3f2b`).**
Measured with the theater mounted in `#wsBreakdown`, against the legacy path in
the same window — not in a body-appended test host:

| Window | Legacy picture | Native picture | 1080p coverage | 4K coverage |
|---|---|---|---|---|
| 1440x900 | 963 x 542 (25.2%) | 1159 x 652 (**36.4%**) | 60.4% linear | **9.1%** |
| 1920x1080 | 1338 x 753 (48.6%) | 1479 x 832 (**59.3%**) | 77.0% linear | **14.8%** |

**1.45x the picture pixels at 1440x900.** The S5a goal is met. **UX-1 is
improved, not resolved:** at an ordinary window a 1080p source still renders at
60% linear and a 4K source at 30%, so full screen remains the only near-1:1
path. Do not record UX-1 as closed on these numbers. Remaining headroom is
bounded — a full-bleed 16:9 picture at 1440x900 would be 56.2% of 1080p, so the
theater already delivers 65% of the theoretical maximum, with the balance spent
on the transport and drive strip. Further gains must come from full-screen
fidelity and an optional temporary strip collapse, not from shrinking controls.

**Reviewer additions (Claude, 2026-07-31 — measurement accepted, numbers
independently re-derived).** Two constraints the record implies but does not
state:

**⚠ SUPERSEDED 2026-08-02 by the coach — read this before acting on the 4K
bullet below.** The coach's position: **downscaling 4K is fine. GridIron IQ is
not a dedicated video player.** His original mention of 4K was not a request for
more pixels — it was that a build presented film looking **overly compressed,
softer than the source should have rendered at that size**.

**So UX-1's success criterion is sharpness at the presented size, not coverage
percentage.** Film may be displayed small; it may not look mushier than an honest
downscale of the source. That reframes what is left:

- **Coverage percentages are a regression instrument, not a quality target.**
  `e2e-breakdown-geometry.mjs` should keep pinning them so a future composition
  change cannot silently shrink the picture again — which is what they caught at
  S5d — but hitting a particular 4K percentage is explicitly **not** a goal.
- **What still matters is resampling quality.** Avoid non-integer scale factors
  where the layout can cheaply avoid them; the full-screen path measured at
  **1920 x 1079** is a one-pixel shortfall that forces a fractional resample of
  every frame, and that is precisely the "softer than it should be" class the
  coach reported. Fixing that is worth more than any additional pixel budget.
- **Do not introduce CSS that resamples the picture** — transforms, filters, or
  fractional sizing on the media node — since that reintroduces the original
  complaint at any size.

The bullet below is retained as the historical reasoning that produced the S5a
pixel budget. Treat its "size against 4K" instruction as **withdrawn**.

- **Size the pixel budget against 4K, not the measured 1080p clip.** The
  complaint named 4K film too. At the same 1060 x 596 working viewport a
  3840 x 2160 source presents **7.62%** of its pixels versus 30.47% for 1080p.
  A fix tuned to the Holy Family clip can pass here and still look soft on 4K.
- **The full-screen reference is 1920 x 1079, not 1:1.** That one-pixel
  shortfall is a non-integer resample, so the sharpness proof rests on a
  slightly rescaled frame. Keep the phrasing "close to 1:1"; do not let later
  handoffs harden it into "1:1 verified". Exact-integer full-screen is an S5a
  requirement, already listed below.

**S5a implication:** increase the ordinary theater's video pixel budget, keep
controls and the play strip compact, preserve an obvious full-screen mode, and
avoid fractional or one-pixel full-screen resampling. Do not alter codecs,
linked-film storage, or source files; the primary defect is workspace geometry.

**S5a implementation result (Codex, 2026-08-01; independent review pending).**
The internal native theater spends the ordinary viewport on film without changing
the source pipeline: 1211 x 681 contained picture pixels at 1440 x 900 and
1531 x 861 at 1920 x 1080, compared with the measured legacy 1060 x 596.
Fullscreen now proves an exact 1920 x 1080 canonical media box, and the drawing
canvas matches its rendered and device-pixel bounds after reparent/fullscreen.
The 46px transport, 117px drive strip, and 40px action row remain ordered inside
the desktop viewport; 390px mobile uses 44px touch targets and internal strip
scrolling with zero page overflow. Add Angle moved into transport so single-camera
work does not pay for an empty row.

No synthetic yard grid is painted over real film. The static route card used one
as visual shorthand, but production has no calibrated screen-to-field mapping;
drawing it would cover evidence and imply false placement. This follows the
coach's stronger rule that not one pixel of video should be needlessly covered.

**S5b component visual check (Codex, 2026-08-01; independent review pending).**
The internal Film Room presentation uses the native token palette and bundled
fonts, keeps the high-frequency filters and Watch action visible, uses stable
sticky Play/selection columns, and contains horizontal overflow inside the
table. At 390px the toolbar wraps without page overflow and coarse-pointer CSS
raises controls/rows to 44px. Optional captures are local in `.tmp-s5b-shots/`
and are not committed because this checkpoint is an isolated component host.
They validate component hierarchy only; they do not replace route-integrated
screenshots, film-pixel measurements, or the source-backed number/film-ref spot
check required at S5d. The design-system harness is 7/7 after rejecting and
removing one undefined legacy current-row token.

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

### UX-5 - S5d coach charting-density and vocabulary batch (P1) - BUILT; REVIEW REQUIRED

Installed `1.12.0-16` tagging passed functionally, but the coach identified one vocabulary correction and three density corrections. They were built together before S5d, not released as one-off patches:

- **I-Form** and **Split Back** are standard structural Formation values. Backfield retains canonical **I** and **Split**. Coaches may chart the formation, the backfield alignment, or both; the two dimensions remain independently editable, stored, filtered, and analyzed. Do not add duplicate `I-Form`/`Split Back` Backfield labels.
- Situation is two rows: **Quarter first + Down & Distance**, then **Hash + Field Position**.
- Common Results stay on one production-width row; **Punt** is the first item in `More`.
- Yardage reserves enough width for a visible signed three-digit value and native number-spinner chrome.

Implementation proof: native tagging 30/30 at a representative 560px charting column and 390px mobile; native Charting Settings 15/15; final canonical gate 78/78. Save/reload preserves `I-Form + I`, `Split Back + Split`, and three-digit yardage without touching another game. Exact controlled mutations prove all four guarantees can turn red. Existing v1 team libraries receive the two new standard Formations once and may hide them permanently afterward; no play data migrates.

This component-level batch does not satisfy the S5d route audit. After the isolated ownership flip, verify the complete route at 1440x900, 1280x720, 768x1024, and 390x844. Density may improve, but labels, touch targets, keyboard access, video area, and football meaning may not regress.

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

### AX-7 - Five-lens football analytics model (P1, coach approved)

Predictability is one diagnostic, not the product's analytical thesis. Reports
and Study should organize coaching answers through five primary lenses:

1. **Efficiency** - success rate, yards/play, EPA/play and first-down rate.
2. **Explosiveness** - explosive rate/yards, longest gains and run/pass source.
3. **Situational** - early downs, money downs, red zone, goal-to-go, backed up
   and two-minute.
4. **Tendencies** - formation, personnel, backfield, motion, strength, direction,
   field zone and high-value cross-tabs.
5. **Risk** - negative plays, sacks, turnovers, penalties and havoc.

Player impact and opponent-scout views cut across those lenses. Every KPI,
finding and grouped result stays linked to its exact film cohort. Predictability
remains available within Tendencies/Risk with sample and effectiveness context;
it may not stand alone as the only headline. Use concise, source-backed coaching
findings rather than generic recommendation paragraphs.

**RESOLVED (S6-4c, 2026-08-03).** Reports Overview now answers through the five
lenses, and Study's pickers ask in the same language.

- **Reports** replaces the unlabelled KPI row with a five-lens board:
  Efficiency, Explosiveness, Situational, Tendencies, Risk — each stating the
  football question it answers, and each routing to the report that owns its
  detail, so a lens is a route rather than a dead summary. Nothing the KPI row
  showed is dropped; its points-per-drive conditional is preserved exactly.
- **No value is computed by the presentation layer.** Every number is read from
  the stats object the parity gate already covers, and a tile claims a film
  cohort **only** where `_buildCutFilter` already defines one. Sacks,
  turnovers, longest gains and aggregate rates are shown as context and are
  deliberately not clickable: inventing a cut type to make every tile clickable
  would break the exact-cohort guarantee the whole report rests on.
- **Parity 2/2 with no golden moved** — measured, not assumed. Unlike AX-3 this
  touches no computed value and no drilldown ref.
- **Study** groups its metric picker by the same five lenses, and its dimension
  picker by football category — a dimension is the axis a question is broken
  down *by*, not the question, so labelling a coverage shell an "Efficiency
  dimension" would mean nothing. Grouping reorders options, which silently
  moved Study's default dimension from Formation to Down; the default is now
  stated in code and pinned by a test.

Predictability keeps the sample and effectiveness context AX-2 gave it and no
longer stands alone as a headline.

The `1.12.0-16` installed review reconfirmed AX-1/AX-4/AX-5 are unresolved: raw
KPI text stacks, oversized dead space, a full-width Formation bar and unchanged
clipping/weak donut hierarchy show Reports has not yet received its S6 design
pass. This is expected sequencing, not acceptance of the current presentation.
### AX-6 - Product copy (P2)

Run a US-English copy audit, including the misspelling of `tendencies`. Remove
internal implementation language from coach-facing screens. Keep labels concise,
football-correct, and consistent across routes.

## Sequence

1. S4 accepted from installed `1.12.0-15` functional smoke.
1b. **Clear plan §3.2 (UX-0) at the sub-milestone each item names — coverage and
   ownership before markup.**
2. Before S5 implementation decisions: investigate UX-1; contract UX-2; inventory
   UX-3/UX-4 ownership so S5 is built on the right shell and visual primitives.
3. S5 builds native Break Down with theater-first film fidelity, shared context,
   responsive containment, and route-level screenshot-plus-truth review.
4. S6 treats Reports, Study, and Plan as one analytics experience and resolves
   AX-1-AX-6 without changing parity-locked formulas or film cohorts.
5. Each milestone gets coach workflow review, Codex design/implementation review,
   Claude independent correctness review, and an installed smoke where required.
6. Final cross-route visual audit remains required after S7 legacy deletion.
## S5d Native Break Down Route Evidence (2026-08-02, this commit)
The ownership flip was inspected at 1440x900, 1280x720, 768x1024, and 390x844. The video remains the dominant surface; Chart and Film Room share one fixed theater; the tag deck is dense but readable; mobile keeps film, transport, play strip, and primary actions in the first viewport with no page-level horizontal overflow. The selected toolbar treatment passes WCAG AA after the gate caught a 4.17:1 contrast defect. This is candidate evidence, not milestone acceptance: Claude review and the installed real-film smoke are still required.
### UX-6 - S5d film geometry and Film Focus repair (P1) - BUILT; REVIEW REQUIRED

The ownership flip initially reduced usable film at desktop widths because the charting deck consumed up to 580px. The repair bounds the deck to 420-500px, compacts only its context/result controls, and stacks at 1180px. Same-viewport automated geometry now requires the contained 16:9 picture to meet/exceed the legacy route at 1440x900 and 1920x1080 while retaining a usable, overflow-free charting deck.

A persisted Film Focus command gives coaches an intentional video-first state: the charting deck leaves layout, the play strip collapses to its header, and no control or border overlays source film. Show charting restores the work surface. Film Focus is required to meet/exceed the accepted standalone S5a picture target at both desktop sizes. Tablet and 390px mobile checks remain overflow-free and mobile route controls remain at least 44px.


The focused geometry harness is 12/12 and was mutation-proven against the rejected wide-deck values. This is structural S5d repair, not the later full visual-polish pass; installer and coach smoke remain gated on independent review.

## S6 Design Completion — Batch 1 Built, Independent Review Required (2026-08-09)

The installed audit showed two structural problems worth fixing before cosmetic
polish: Film Room was forced into the narrow Chart deck, and mobile Breakdown
gave every secondary command permanent toolbar weight. Both are repaired without
changing football data, analytics, film cohorts, or storage behavior.

- **Film Room composition:** at 1500px and wider, theater and table share the
  workspace only while each can keep at least 680px. At 1280/1440 the theater
  stacks over a full-width table with at least 520px of stable working height.
  Chart retains its dense 420-500px tagging deck.
- **Mobile command hierarchy:** film context and Chart/Film Room stay visible.
  Quick Chart, Customize Fields, Game Settings, and Film Focus move into one
  44px `More tools` disclosure. No capability was removed.
- **Interaction truth:** the first implementation exposed a stacking bug where
  the menu appeared above film visually but the video placeholder owned the hit
  target. The corrected journey checks `elementFromPoint` before activation and
  then proves the Quick Chart modal, focus, inert route, touch sizes, and Escape.
- **Visual evidence:** the repaired `tools/shots.mjs` captures all 11 live routes
  at 1440x900, 1280x720, 768x1024, and 390x844: 44 distinct images, zero page
  overflow. Geometry checks pin the Film Room behavior at 1920, 1440, and 1280.

This closes the first structural batch only. The broader color, spacing,
typography, chart, and cross-route polish audit remains open. Claude reviews this
checkpoint independently before another batch or installer is considered.

### Batch 1 review follow-ups — resolved (2026-08-09)

- **S6D-1 resolved:** medium desktop Film Room now bounds the theater to
  350–500px at 52vh, keeping the full-width table and real data rows inside the
  first viewport at 1440x900 and 1280x720. The gate measures visible intersection
  and row visibility rather than blessing an off-screen element's own height.
- **S6D-2 classified and resolved:** the deterministic red did not enter the
  destructive production path. Puppeteer delivered only `de` to the controlled
  confirmation input, then clicked its correctly disabled button. The harness
  now waits for a visibly armed exact-phrase state before activation and proves
  overlay-service cleanup, DOM cleanup, removal, Home return, and byte-identical
  Undo. No delete implementation changed.

Canonical gate: **82/82 green, 0 skipped, 0 failed**. Broader cross-route visual
review remains open.

## S6 answer-first composition - Batch 2 built, independent review required (2026-08-09)

Codex inspected the rebuilt native routes from fresh screenshots rather than
reviewing CSS alone. The before/after matrices each contain 44 distinct captures
across 1440x900, 1280x720, 768x1024, and 390x844 with no page-level horizontal
overflow.

The app is mechanically coherent but still visually conservative. This batch
fixes the highest-value shared composition defects without pretending the final
cross-route polish is complete:

- Reports now owns its KPI primitive instead of inheriting rounded legacy cards.
  Metrics read as one square, hairline-joined scan board, and a fifth mobile KPI
  uses the full row instead of leaving an empty cell.
- Study's query area is a real instrument panel and remains two columns on a
  phone, moving the answer materially closer to the first viewport.
- Home's selected-game continuation and Plan's empty state use restrained
  working bands so primary content no longer floats in an undifferentiated void.

Both responsive rules were mutation-proven against rebuilt bundle bytes. Final
canonical gate: 82/82 green. This batch does not claim final visual acceptance:
route hierarchy, chart storytelling, density, and palette usage still receive a
combined installed design review after independent code acceptance. No metric
formula or film cohort changed.

## Active Installed Visual Review - Coach Backlog (2026-08-09)

This is a consolidated design backlog, not permission to issue one-finding
installers. The coach is the visual reviewer and will explicitly close the
feedback round. Batch related repairs. The governing rule for both tagging and
reports is: **maximize useful information per viewport without compromising
readability, film area, interaction safety, or touch targets.** Dense means
well-composed, not cramped. Visualization dimensions follow their information,
not the available viewport.

### Typography - quick pass built, installed judgment pending

- `9a5fd19` changes ordinary product copy from mono/legacy Segoe overrides to
  IBM Plex Sans, retains the condensed face for true display headings/KPIs, and
  retains mono for real identifiers only. Shared labels and captions are larger
  and heavier. It is restored beneath this handoff; Claude packages the
  next local installer as unique version `1.12.0-40`, never a second `-39` binary.
- Outcome, not merely audit: two visible product voices in ordinary UI (Sans for
  reading, Condensed for display). No glow/shadow on normal text; no tiny thin
  blue copy; table numerals remain aligned without turning whole rows mono.
- Remaining visual check: Home, Break Down, Film Room, Study, Reports, Plan,
  Settings, dialogs/toasts at normal Windows scaling and a narrow desktop.

### Responsive composition

- Window resizing currently preserves a desktop-width canvas and clips the tag
  deck, primary action, route context, and navigation. Columns must shrink to a
  defined breakpoint, then stack cleanly. Hidden horizontal overflow is not a
  responsive solution; no primary action may become unreachable.
- Reports and tagging should eliminate decorative emptiness, cap simple chart
  widths, compose related metrics in rows/grids, and reduce scrolling without
  making controls unsafe or copy crowded.

### Reports information design

- Remove the large blank region in Reports Overview and other stretched modules.
  Simple comparisons should use compact square modules that can share a row.
- Replace the Team Profile default benchmark from per-axis Season Best to
  **Current Game vs Season Average**. Keep actual values visible and describe it
  honestly as a team-relative profile; Season Best may remain secondary.
- Game Flow is not useful as a full-width cumulative-yards line. Recompose it as
  a compact coaching timeline with drives/quarters, scores, turnovers,
  explosives, stalled possessions, and selectable exact-play film.
- Field-position heat maps deserve larger treatment: enlarge the proportional
  field and dots, handle overlapping plays, retain filtering, and make every dot
  open its exact `gameId::playId` film while preserving report state.
- Repair chart hierarchy globally: titles outside donuts, larger primary values,
  unclipped legends/labels, stable aspect ratios, and readable axes. Do not make
  every chart full width.
- Replace generic Predictability emphasis with the accepted five-lens model:
  Efficiency, Explosiveness, Situational, Tendencies, and Risk. Recommendations
  must be concise, source-backed coaching findings rather than repeated prose.
- Fix raw implementation copy such as rendered `&amp;` strings and use US-English
  `Tendencies` consistently.
- Victory/kneel plays need an explicit football-statistics decision before any
  formula change: preserve official lost yards while evaluating exclusion from
  aggregate efficiency/success denominators. Do not silently change parity.

### Persistent report context

- Collapse the duplicated top summary and Team Summary into one compact KPI rail
  that carries across report tabs. Literal labels: **Final Score, Total Plays,
  Plays Charted, Plays per Phase, Success Rate**.
- Season KPIs: Games, Record, Points For/Against plus Point Differential,
  Success Rate, Touchdowns with rush/pass split, Turnover Margin with takeaways
  and giveaways, Run Rate, and Yards by Type. Remove redundant Total Yards cards.
- Use restrained semantic color: team blue, run orange, pass cyan, positive
  green, warning amber, negative red. Color the value/accent/compact graphic, not
  the entire module, and never make color the only meaning.
- KPI modules should be square or subtly radiused (0-4px), hairline joined where
  appropriate, with centered/emphasized values rather than weak left-aligned
  rounded cards.

### Home and status polish

- Replace `Linked film ready` with literal **Film linked**, styled as a restrained
  green success status rather than a toolbar button. Missing/disconnected film
