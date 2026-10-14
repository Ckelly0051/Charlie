# Chart Deck Polish

2026-10-14. PROPOSED; awaiting coach design approval. No production changes.

Authority: `GRIDIRON-IQ-PLAN-V2.md` step 2, Chart deck polish and its acceptance
checklist; `CLAUDE.md` Break Down rules. Style reference:
`design-comps/receiver-charting-2026-10-13`. Receiver checkpoint 1 is the
implemented editor at `88aa0289..8c1c9699`, not its future Target/Catch proposal.

## Composition

This comp freezes the actual rendered workspace, transport, play rail and
complete Chart deck from the current build. `production.css` is the built
stylesheet, with its bundled fonts embedded. `comp.css` overrides only deck
composition, plus hiding the duplicate watermark already present in the
representative film still. No production module is loaded by the review page.

- One top-level section open at a time; a second click closes it. The all-closed
  state is also reviewable. Closed summaries are right-aligned, wrapping plain
  text; they do not turn into badges or shrink their type.
- Text-sized, left-aligned, wrapping chips for every vocabulary and roster
  quick pick. Existing font families and sizes are preserved: ordinary chips
  12.5px, the built receiver chips 12px. Fine targets are 27px; a long label may
  grow vertically. Coarse targets are at least 44px in both dimensions.
- One 12px form inset; section bodies add no further inset. No outside frame
  around the section bands. Desktop has one form scroll owner; narrow widths
  retain production's stacked theater/rail/deck and outer route scrolling.
  Roster chips reflow without a second scroller.
- Editable jersey, grade, numeric and text fields remain controls. Names,
  missing-value summaries, None and applied-call facts are plain text.
- Save is first in the footer, then Previous, Skip, Save & Next. Save retains
  the real dirty-driven disabled state; it is not wedged between Skip and the
  primary action. There is no Previous arrow. No save behavior changes.
- The Route & Release editor retains its production markup, vocabulary,
  local disclosure, target choice, typography and chip styling. No Target or
  Catch controls are added. Multiple Receiver numbers are not rewritten by a
  target selection. Choosing one only opens that editor.

## Every Acceptance Item

| Plan item | Where this comp fixes it |
|---|---|
| One chip system; no four-column centered library grid | `#full/formation-and-call`: Formation and Backfield flow with the same text-sized geometry as Personnel and QB Alignment. `#full/play-and-result`: all ten Gap choices wrap when needed. `#stress/formation-and-call`: the long custom Formation/Backfield value fits without smaller type. |
| Situation labels and controls share baselines | `#full/situation`: fields on each row share label/control starts and gaps. Desktop gives Quarter its intrinsic width so OT stays with Q1-Q4. Compact and coarse layouts give Quarter a full row, then pair Down/Distance; other fields reflow into two-column rows. Capture checks measure peer baselines and all five Quarter chips, not just an absence of overflow. |
| One border level and no second deck scrollbar | Every view: unframed form and section bands with one separating rule. `#full/players-and-grades`: roster buttons expand in the same scroll owner. The footer is outside the scrolling form. No new scrollbar-width, scrollbar-color or scrollbar-gutter is declared. Chromium checks scroll ownership, not Windows scrollbar chrome. |
| One disclosure pattern; consistent Edit library position | Every section's caret is at the same left inset, followed by its title. Play Call and Play Type no longer have separate field-fold buttons; their containing section is the disclosure. `#full/formation-and-call` and `#defense/our-defensive-call`: every Edit library is at the right edge of its label row. The unchanged local Receiver/roster disclosures also use a left caret. |
| Consistent deck header controls | Every view: Same as Last, Templates and Delete play share height, spacing and type. Coarse mode reflows Delete play beneath the first two instead of introducing a horizontal scroller. Template Save/Delete options are retained inside the real select. |
| No placeholder instructions, disabled Save wedged in navigation, or Previous arrow | Play Call's example placeholder is removed. Save is retained at the left, with its original availability rule. Previous is literal text. Operational field labels remain; the More Tools explanatory paragraph is hidden, not its controls. |
| Closed summaries and one section open | `#full/closed` and all `#.../closed` views show plain right-aligned values. Clicking any summary closes the previously open section. Each section has a repeatable fragment and capture. No real section is omitted. |

## Requested Corrections

- Quarter stays on one row at every captured width, including coarse-pointer
  mode. No nowrap chip row or hard minimum width is introduced.
- Every structural summary separator is ` · `, including Route & Release.
  Punctuation inside a coach's value (the preview call `Slant / Flat`) stays
  unchanged. Control inventory comparison normalizes only this separator and
  the approved Previous arrow removal; the complete control multiset remains
  checked.
- More Tools and Play Diagram have blank summaries rather than invented
  captions. Their real controls remain in their open sections.
- Formation & Call leads with the play call, then Formation and Personnel,
  followed by the remaining charted look fields.

These are comp-only presentation changes. The settled disclosure behavior and
all other approved controls remain unchanged.

No checklist item is rejected. The Save availability rule and the receiver's
local disclosure should stay as built: these are charting behavior and an
already-approved editor, respectively, not targets for a presentation change.

## Controls Retained

The comp-only checks compare the actual production control inventory against
the proposed DOM for every data state and viewport. Only Play Call/Play Type's
redundant field-fold buttons are replaced by their section disclosure.

Retained: Previous/Next clip, frame step back/forward, Play, scrubber, loop,
speed, drawing tools, Add camera angle, Full screen, playback tools disclosure,
Mark start/end, Copy last, Autoplay next, Clear tags, Save, Save & Next,
Previous, Skip, unit switch, Same as Last, Templates (including Save/Delete),
Delete play, Chart/Film Room, Quick Chart, Film focus, top-bar controls and
More. All conditional model-rendered fields stay present: Motion Starts/Ends,
RPO and QB Run details where applicable, Special Teams attempt/outcome/metrics,
roles/grades, penalties and their ruling/resulting-situation inputs, notes,
custom fields/tags, diagram commands, charting presets and every More Tools
control, including the parked OCR controls. No command is deleted for space.

This is a presentation prototype, not a running app. Destructive, save,
navigation, video and global-menu commands are retained visually but do not
execute product operations. Section, chip, receiver-target, route/release,
library-preview and narrow playback-tools interactions are local to the page.
Only exemplar tag shortcuts are simulated; the build must retain the complete
existing keyboard map and its owner/confirmation rules.

## Data Provenance

`PROVENANCE.json` records original season/game/play IDs, hashes and exact
preview-only additions. No season or catalog is committed with this folder.

- Canonical fixture: read-only `tools/canonical-season.mjs` path. Offense:
  Week 1 vs St. Peter Lutheran, Play 31 (Medium Pass; Passer 7, Receiver 81).
  Defense: the same game, Play 3. The fixture contains no structured Special
  Teams events, penalty records or multiple Receiver attribution.
- Those missing cases come from a scratch filesystem copy of the live catalog,
  never opened for write. The 2025 JV season's catalog ID is
  `2026-varsity-demo` (its label, not its ID, was renamed). Week 1 Play 1 is a
  charted Kickoff; Play 11 is a run/pass Try; Play 4 has a real penalty.
  The uncharted case is Week 4 vs OL Sorrows, Play 18.
- `full` uses the real offense play, augmented only in the isolated preview
  with a Slant / Flat call, look, motion and Slant/Inside detail to exercise a densely charted deck.
  `multiple` adds `22, 7` to that copied play and no detail. `stress` adds a
  long name and a long coach-library option in memory. These additions are
  explicitly not claims about the coach's charting of that real play.
- RPO and QB Run examples exercise their full conditional editors. Actual
  recorded play types are used when available; an absent QB Run type is a
  preview-only addition on a copied real run, recorded in the provenance.
- Source canonical bytes and live catalog SHA-256 are checked unchanged.
  The scratch catalog is not swapped back, saved or exported to coach storage.
- Film is the already-committed receiver-comp still, not footage of each
  selected example. The real play metadata is not inferred from this image.
  No film file is opened, copied or altered. Media bounds retain production's
  rectangle at each viewport; no deck opening resizes or overlays it.
- Every player name is fictionalized consistently before rendering. Jersey
  numbers and all other source values stay intact; private roster data remains
  outside the public repo.

## Review Views

Open `index.html` directly. `#full/situation` is the initial demonstration,
not an approved default. Replace the fragment to inspect any state:

| Fragment | Review |
|---|---|
| `#offense/closed` | Unmodified canonical offensive pass, all closed |
| `#full/closed` | Dense preview with all closed summaries |
| `#full/situation` | Situation rows |
| `#full/formation-and-call` | Whole offensive look, managed libraries and Motion |
| `#full/defense-faced` | Defensive look |
| `#full/play-and-result` | Run/Pass, Play Type, Direction, Gap, Result, Yards |
| `#full/players-and-grades` | Fictional roster names, original roles and built receiver editor |
| `#full/penalties` | Add penalty entry point |
| `#full/notes-and-details` | Notes, custom fields/tags and editing commands |
| `#full/play-diagram` | Diagram and Clear/Draw |
| `#full/more-tools` | Every secondary Chart tool |
| `#defense/our-defensive-call` | Our defensive call leads, Offense Faced retained |
| `#special/special-teams` | Real kickoff outcome/metrics |
| `#try/special-teams` | Real run/pass try, with its scrimmage groups retained |
| `#penalty/penalties` | Real penalty record and all editing/ruling controls |
| `#uncharted/situation` | Real uncharted play; blank is not zero |
| `#multiple/players-and-grades` | Choose one detail target; keep both attributed numbers |
| `#stress/formation-and-call` | Long library values |
| `#stress/players-and-grades` | Long receiver name and custom route |
| `#rpo/play-and-result` | Conditional RPO read/defender/decision and any conflict control |
| `#qb/play-and-result` | Conditional QB run type |

Every state's section names are in `states.js`. All sections closed and each
section open are captured for full/offense, defense, kickoff and try at every
requested viewport. Supplemental states have their relevant open and closed
captures. The actual unmodified `offense` snapshot is also available for
comparison; no preview additions are needed to review ordinary spacing.

## Coach Decisions

Settled 2026-10-14; these behavior decisions do not approve the full comp or
authorize production changes.

1. **Opening/next-play policy:** a newly marked or blank play opens Situation.
   Navigating existing plays retains the working section when available;
   use Situation if that section is unavailable.
2. **Closed-section keyboard feedback:** shortcuts stay active, update the
   closed summary immediately and briefly announce the changed field/value
   in the header, with a live-region announcement. They never open another
   section or close the working section. Shift+3 demonstrates this feedback.
3. **Stable on the current play:** once opened, an applicable section stays
   open through edits, shortcuts, saves and refreshes. Only the coach closing
   it or deliberately opening another section changes that disclosure state.
   The one-open-section rule still applies to deliberate section navigation.

No other behavior decision is reopened: Save stays unavailable on an unchanged
play, now at the far left, and the receiver's local disclosure stays as built.
Both meet the layout checklist without changing the charting contract.

## Render Verification

`node design-comps/chart-deck-polish-2026-10-14/build-comp.mjs` regenerates the
frozen DOM from an isolated browser and the read-only source copies. It writes
only comp artifacts and a scratch catalog copy, never coach storage.
`node design-comps/chart-deck-polish-2026-10-14/capture.mjs` renders this local
artifact at 1440x900, 1280x800, 768x1024 and 390x844, plus coarse-pointer passes.

`captures/` includes viewport context and extra deck views at stacked widths.
`CHECKS.json` records control retention, closed/one-open states, exact film
bounds compared with the frozen production layout, unchanged type, situation
baselines, chip ink containment, scroll ownership, page/field overflow, coarse
hit targets and keyboard feedback. JPEG screenshots keep this review artifact
smaller; there is no image downscaling. Rendered desktop and narrow scenes were
visually inspected. These checks are not the full gate or an installed smoke.

No production files, approval registry, coach data, gate, installer, push or
tag are changed by this checkpoint. Approval is required before the whole-deck
production migration; it must replace the old layout in one pass.
