# GridIron IQ Break Down Redesign Parity Audit

**Reference:** `design-v1.1` in `ux-prototype-v2/`
**Compared against:** local production source after `v1.12.0-2`
**Status:** R9 parity audit complete; recovery remains local and uncommitted

## Verdict

The local R1-R9 recovery now preserves the complete production data model and
passes the audited desktop/mobile layout criteria against `design-v1.1`. The
three release-critical parity failures found on 2026-07-15 have been rebuilt:
Break Down uses compact top navigation and returns the sidebar width to film;
mobile uses one Home/Break Down/Study/Plan navigation system; and game setup,
duplicate progress, and templates no longer precede Situation.

This is **complete locally, not release-approved**. Fresh captures at 1440x900,
1280x720, 768x1024, and 390x844 have been reviewed by Codex and the complete
49-script gate is green. Coach visual approval and installed-desktop smoke still
block packaging.

## Status Key

- **Complete:** approved behavior and production behavior match.
- **Complete locally:** implemented and verified, but not committed or released.
- **Partial:** production has the data/behavior, but the approved UX is missing
  or substantially different.
- **Missing:** the approved element is not exposed in production.
- **Intentional divergence:** production differs from the prototype because of
  explicit coach feedback or a stronger production workflow.
- **Do not port:** prototype-only simulation that production already handles
  through a stronger real implementation.

## Parity Matrix

| Surface | Approved design-v1.1 | Audited local production | Status | Evidence / remaining gap |
| --- | --- | --- | --- | --- |
| Break Down shell | Purpose-built video/coder workspace | Dedicated `#wsBreakdown` owns one canonical video and tagger | Complete locally | Route-scoped compact top navigation removes the sidebar without changing Home/Study/Plan |
| Film context row | Unit, scout context, customize, progress/saved state | All are visible in the route header | Complete locally | Route contract `31/31` |
| Self-scout default | Clear `Our games - Self-scout` context | Default and selected state are explicit | Complete locally | Header context test |
| Opponent scout | Clear opponent-film context; labels switch subject | Explicit control drives `.is-scout` and all unit labels | Complete locally | Six unit/context combinations pinned |
| Unit switch | Compact top-level segmented control | Canonical `#tagUnit` is in the route header | Complete locally | Exactly one owner tested |
| Current-play header | Play number, D&D, context, autosave | All projected from canonical state | Complete locally | No duplicate stored fields |
| Same as Last | Visible in header/action rail | One `Copy Last` action beside film marks | Intentional divergence | Coach-approved high-frequency location |
| Video-first layout | Film dominates; coder scrolls independently | Chart mode hides Film Room and coder scrolls | Complete locally | Media pane is about 964 px at 1440, versus about 947 px in the approved reference |
| Movable video controls | Auto-hide and move vertically | Real controls move, persist, and reclamp on resize | Complete locally | Resize regression |
| Play strip | Fixed readable cards tied to real plays | Stable 190 px cards; single-card updates | Intentional divergence | Wider cards preserve longest result copy per coach feedback |
| Film action rail | Mark, Copy Last, separated Clear/Delete | Canonical controls use approved order and spacing | Complete locally | Route test |
| Video-safe divider/gutter | Divider consumes no film pixels; taskbar clearance | Grid gutter and bottom clearance are outside film | Complete locally | Viewport screenshots |
| Tag-column scroll | Independent, polished, contained | Independent desktop scroll; page flow on mobile | Complete locally | No overlap/overflow at four viewports |
| Section hierarchy | Situation; primary; play/result; faced; penalties; players; notes | Canonical controls are moved into that order | Complete locally | DOM ownership and order tests |
| Expand/collapse groups | Clear titles and concise descriptions | Real `<details>` groups with primary/faced hierarchy | Complete locally | Keyboard and state tests |
| Chip visuals | Compact neutral chips; strong blue selection | Scoped compact chips with WCAG-AA selected state | Complete locally | A11y/scaling `8/8` |
| Chip interaction | Optional; blank valid; no tag required | Optional behavior plus subordinate header copy | Complete locally | Header and tagging tests |
| Formation library link | Inline `Edit library` | Present beside Formation | Complete locally | Shared-dialog test |
| Backfield library link | Inline `Edit library` | Present beside Backfield | Complete locally | Shared-dialog test |
| Front library link | Inline `Edit library` | Present in both defensive contexts | Complete locally | Both contexts pinned |
| Tag library editor | Add, show/hide, restore, team scope | Shared dialog implements the full workflow | Complete locally | Settings `15/15`; quoted values inert |
| Hidden values | Hide prospectively; preserve history/analytics | Implemented unchanged | Complete | Library contract `11/11` |
| Formation/backfield/front persistence | Coach-owned and team-scoped | Implemented unchanged | Complete | Team-switch test |
| Situation | Down, distance, quarter, hash together | Re-composed in one open group | Complete locally | Form ownership test |
| Offensive look | Formation, backfield, strength, personnel, motion | Complete canonical field set | Complete locally | Form `46/46` |
| Defensive look | Front, coverage, pressure; custom fronts | Complete canonical field set | Complete locally | Form/library tests |
| Offense perspective labels | Our Offensive Look / Defense Faced | Subject-correct and ordered | Complete locally | Context matrix |
| Defense perspective labels | Our Defensive Call / Offense Faced | Subject-correct and ordered | Complete locally | Context matrix |
| Opponent perspective labels | Opponent-based for O/D/ST | Subject-correct for all units | Complete locally | Context matrix |
| Run/pass and play type | Dedicated scannable fields | All production values retained and restyled | Complete locally | Tagging `27/27` |
| Result and yardage | Separate result; magnitude entry | Stronger canonical sign/result logic retained | Complete locally | Form and Film Room tests |
| Structured penalties | Full multi-foul enforcement model | Approved group uses canonical structured model | Complete locally | Penalty `7/7`, form persistence |
| Legacy penalty migration | Do not imply untrusted data is structured | Legacy data remains quarantined | Complete | Contract test |
| Structured Special Teams | Phase-first relevant fields | Six-unit structured editor in primary group | Complete locally | Special Teams `20/20` |
| Scored by Us/Them removal | Remove ambiguous ownership | Hidden; structured ownership replaces it | Complete locally | Form test |
| Player roles by unit | Relevant roles only | Offense, defense, and ST roles adapt without clearing hidden data | Complete locally | Form test |
| Player grading | Role-specific grade | Canonical grades retained and compact | Complete locally | Save/reopen test |
| Notes and custom fields | Collapsible secondary details | Notes, custom fields, and drive details share secondary group | Complete locally | Form ownership test |
| Save & Next footer | Dominant action with affirmative feedback | Sticky dominant action, visual confirmation, reduced-motion path | Complete locally | Form/a11y tests |
| Previous/Skip | Secondary and separated | Both flank Save & Next without competing emphasis | Complete locally | Form test |
| Toasts | High-contrast blue, uppercase | Semantic uppercase text and distinct blue surface | Complete locally | A11y visual test |
| UI font | Segoe UI Variable Text; condensed only for display | Explicit scoped Segoe stack; condensed brand/football labels | Complete locally | Computed-font test |
| Typography hierarchy | Readable UI face and clear football hierarchy | Approved hierarchy applied | Complete locally | 125%/150% scaling test |
| Desktop density | Compact without losing data | Dense groups and chips retain every field | Complete locally | 1280x720 screenshot and ownership test |
| Mobile charting | Video, strip, groups, fixed footer, touch targets | Core stack works and is overflow-free | Complete locally | One workspace nav; compact context; Situation precedes collapsed Templates |
| Mobile horizontal overflow | None; strip scrolls internally | No page overflow; 174 px touch cards | Complete locally | Route `31/31` |
| Film Room | Available without dominating charting | Explicit Chart/Film Room switch; Chart defaults | Complete locally | Film Room `60/60` |
| Analytics visuals | Preserve outside Break Down | Study/Stats remain separate and richer | Do not port | Analytics parity golden unchanged |

## R9 Visual Audit Findings

### Resolved 1 - desktop film width

At 1440x900 the approved reference gives the media pane roughly 947 px. The
local production capture gives it roughly 756 px because `.ws-shell` permanently
reserves `--ws-side: 208px`. That is about 191 px, or 20%, less film width. The
sidebar is useful on Home/Study/Plan, but it violates the approved Break Down
composition and the coach's explicit rule that film space is sacred.

**Local resolution:** Break Down now hides the route sidebar and exposes the
same four workspace destinations in compact top navigation. The 1440x900 media
pane grows from roughly 756 px to roughly 964 px, slightly exceeding the
approved reference's roughly 947 px. Home, Study, and Plan retain their sidebar.

### Resolved 2 - mobile navigation duplication

The approved 390x844 reference has one workspace navigation model: compact top
context plus Home/Break Down/Study/Plan at the bottom. Local production shows a
top route select and the legacy Video/Stats/Self-Scout/Menu bar. The latter is
classic-workflow chrome and exposes different destinations from the workspace.

**Local resolution:** the shell suppresses legacy `.bottom-tabs` on every shell
route, removes the mobile route select, and owns one fixed Home/Break Down/Study/
Plan navigation bar. Stats and Self-Scout remain available through Study.

### Resolved 3 - mobile pre-charting clutter

In the approved first viewport, film/actions flow directly into the current-play
identity and Situation group. Local production instead shows `Set Up This Game`,
duplicate tag progress, Templates/Save/Delete, and the sticky footer before any
charting group is visible. These controls are functional, but their placement
recreates the legacy-page feeling the recovery was meant to remove.

**Local resolution:** Game is a compact context action; the original setup bar
is hidden only inside Break Down. The canonical progress row is hidden there in
favor of the route header. Copy Last remains in the film rail, while Templates
is a collapsed secondary disclosure near the bottom of the tag form. Situation
is the first charting group in the mobile flow.

Fresh evidence lives in `.tmp-r9-fixed/` for 1440x900, 1280x720, 768x1024, and
390x844. `e2e-breakdown-video` is `31/31`; `e2e-workspace-shell` is `18/18`.

### Accepted divergences

- Play cards are wider than the prototype so `Touchdown` and compound results
  never truncate, per coach feedback.
- Film context uses explicit buttons instead of a select on wide screens because
  self-scout is the dominant workflow and the modes remain immediately visible.
- Skip remains beside Previous/Save & Next because blank tags are valid and a
  coach may intentionally advance without charting the play.
- Film Room is an explicit mode rather than the prototype's small Table link;
  the production mode preserves the full spreadsheet toolset.

## Recovery Build Boundaries

### Preserve as canonical

- `PlayTagger` and its live `ChipField` instances.
- `TagLibrary`, `CustomChips`, and team-scoped enabled/custom values.
- `PenaltyModel`, `SpecialTeamsModel`, and their persisted structured records.
- Existing player attribution, grading, autosave, history, storage, and analytics.
- Current video, playlist, multi-angle, and clip identity controllers.

### Replace or substantially recompose

- The Break Down route body. It must become a purpose-built production view,
  not a relocated legacy app page.
- Tag-form hierarchy and visible field grouping.
- Chip, input, group, header, and footer styling.
- Tag-library discoverability and approved inline entry points.
- Typography tokens within the workspace shell and Break Down route.
- Film Room placement/mode so it does not displace the primary video workflow.

### Must not be claimed complete until

1. Every **Missing** row above is implemented.
2. Every **Partial** row is visually compared with `design-v1.1`.
3. Formation, backfield, and front can each be added, hidden, restored, and
   immediately used without leaving Break Down.
4. Offense, defense, Special Teams, self-scout, and opponent-scout are each
   smoke-tested with real persistent tags.
5. Desktop and mobile screenshots are reviewed side by side with the approved
   prototype.
6. The full regression gate passes before packaging.

## Step 3 — Hard Recovery Checklist

This checklist is the release contract. An item is complete only when its code,
focused regression, and required screenshot review are all complete. Checking a
parent item while any child remains open is not allowed.

### R1 — Production Break Down route

- [x] Build a dedicated production Break Down route body inside the workspace
  shell; stop presenting the entire legacy `#app` as the redesigned workspace.
- [x] Keep the legacy app available only through `Use classic layout` during
  recovery.
- [x] Mount the existing production video, playlist, tagger, and persistence
  controls into the dedicated view without cloning their state.
- [x] Add a focused route contract proving there is exactly one video player,
  one current-play owner, and one live tag form.
- [x] Capture and approve `1440x900`, `1280x720`, `768x1024`, and `390x844`.

**Acceptance:** Break Down is a purpose-built view; no relocated legacy page is
visible beneath or around it.

### R2 — Film context and charting header

- [x] Put the Offense / Defense / Special Teams segmented control at the top of
  the Break Down workspace.
- [x] Add a visible film-context selector for `Our games · Self-scout`,
  `Opponent film · Scout`, and `Quick chart` where supported.
- [x] Wire context to the existing game perspective and `.is-scout` contract.
- [x] Show current play number, down and distance, charting subject, progress,
  and saved state without duplicating stored values.
- [x] Keep `No tag is required` visible but subordinate.
- [x] Prove all unit/context combinations produce subject-correct labels.

**Acceptance:** a coach can identify whose film, which unit, and which play is
being charted without opening Settings or reading the tag fields.

### R3 — Approved tag-column composition

- [x] Replace generic injected separators with real collapsible groups:
  Situation; primary look/call; Play & Result; faced look; Penalties; Players &
  Grades; Notes & Details.
- [x] Lead with `Our Offensive Look`, `Our Defensive Call`, or
  `Our Special Teams` in self-scout mode.
- [x] Lead with the opponent equivalent in opponent-scout mode.
- [x] Keep the faced unit secondary and collapsible.
- [x] Move existing DOM controls rather than creating parallel form fields.
- [x] Preserve every production tag field and custom field.
- [x] Preserve blank/optional values as valid charting choices.
- [x] Add a DOM ownership test proving every production field id exists once.

**Acceptance:** the approved hierarchy is visible and every existing tag still
writes through `PlayTagger` to the canonical play object.

### R4 — Chip system and tag libraries

- [x] Apply the approved compact neutral chip style and strong blue selected
  state across offense, defense, Special Teams, penalties, and situation.
- [x] Remove legacy visual abbreviations that compete with the field value.
- [x] Add `Edit library` beside Formation, Backfield, and Front labels.
- [x] Add one visible `Customize fields` command in the charting header.
- [x] Open the existing team-scoped `TagLibrarySettings` from every entry point.
- [x] Add a custom formation and use it immediately on the selected play.
- [x] Add a custom backfield and use it immediately on the selected play.
- [x] Add a custom front and use it immediately from both defensive contexts.
- [x] Hide and restore defaults without altering historical plays or analytics.
- [x] Verify team switching isolates each team’s vocabulary.

**Acceptance:** a coach can customize the three libraries without leaving Break
Down, and every change is immediately reflected in charting.

### R5 — Structured penalties and Special Teams presentation

- [x] Place the existing structured penalty editor in the approved Penalty
  group without reverting to the legacy `Penalty` result chip.
- [x] Preserve multiple fouls, rulings, actual yards, player, phase, play status,
  notes, and confirmed resulting situation.
- [x] Place the existing phase-first Special Teams editor in the primary group.
- [x] Show only fields relevant to the selected Special Teams unit.
- [x] Keep ambiguous legacy `Scored by Us/Them` hidden.
- [x] Preserve legacy/bogus data quarantine labels; never present it as trusted.
- [x] Run structured penalty and Special Teams persistence round trips.

**Acceptance:** both workflows match the approved mental model and remain fully
persistent, analytics-ready production data.

### R6 — Players, grades, notes, and actions

- [x] Render only unit-relevant player roles while retaining hidden assignments.
- [x] Keep tackler multi-select and all existing grade controls functional.
- [x] Present notes and custom fields as intentional secondary details.
- [x] Build the approved footer with Previous, dominant Save & Next, and Skip.
- [x] Keep Same as Last in one high-frequency location.
- [x] Add affirmative Save & Next feedback with a reduced-motion alternative.
- [x] Confirm autosave, undo/redo, keyboard shortcuts, and game switching remain
  game-scoped.

**Acceptance:** a full play can be charted, attributed, graded, saved, advanced,
reopened, and edited with no data loss.

### R7 — Typography, density, and feedback

- [x] Use `Segoe UI Variable Text`, `Segoe UI`, Arial, sans-serif for workspace
  UI text.
- [x] Limit condensed display type to brand and strong football labels.
- [x] Match approved chip, label, group, and footer density.
- [x] Keep uppercase, high-contrast blue toast notifications.
- [x] Verify focus rings, contrast, keyboard order, and screen-reader labels.
- [x] Verify no text clips at 125% and 150% Windows scaling.

**Acceptance:** the production screen is visually recognizable as the approved
design rather than the legacy app with new borders.

### R8 — Film Room decision

- [x] Keep Film Room available without placing its full spreadsheet between the
  video workflow and the tag workflow.
- [x] Implement an explicit Table/Film Room mode or collapsible secondary
  surface consistent with `design-v1.1`.
- [x] Preserve inline editing, filters, columns, tendencies, and Watch behavior.
- [x] Prove switching modes does not change play selection or unsaved tags.

**Acceptance:** quick charting remains video-first while all Film Room power
features remain one intentional action away.

### R9 — Visual and functional release gate

- [x] Complete every matrix row marked **Missing**.
- [x] Review every matrix row marked **Partial** against `design-v1.1`.
- [x] Run the dedicated Break Down, tagging, library, penalty, Special Teams,
  player, workspace, persistence, integrity, and playback tests.
- [x] Run the repository’s complete regression gate.
- [ ] Review desktop and mobile screenshots with the coach.
- [ ] Run a real desktop smoke with copied test data and real film.
- [ ] Update the roadmap and handoff with exact commits and remaining risks.
- [ ] Only then build and publish the replacement prerelease.

**Acceptance:** coach approval plus a green full gate. Passing tests without
visual parity, or visual parity without persistent production behavior, fails
the release gate.

## Recommended Execution Order

1. **R1 + R2:** establish the real route and context header.
2. **R3 + R4:** productionize the approved tagging and customization UX.
3. **R5 + R6:** integrate structured workflows and high-frequency actions.
4. **R7 + R8:** finish visual parity and Film Room placement.
5. **R9:** adversarial review, coach screenshots, desktop smoke, replacement
   beta.

Only one increment should be in implementation at a time. Each increment must
end with focused tests, documentation, and a clean handoff before the next one
begins.

## Active Recovery Handoff

- **Completed increment:** R8 — Film Room decision.
- **Current increment:** R9 — Visual and functional release gate.
- **Builder:** Codex; all work remains local and uncommitted.
- **R1 implementation:** `BreakdownWorkspace` moves the canonical video, Film
  Room, and tag form into `#wsBreakdown`; Classic restores those exact nodes.
- **R1 verification:** Break Down `10/10`, workspace shell `16/16`, redesigned
  form `41/41`; four required viewports reviewed with no route duplication or
  page-level horizontal overflow.
- **R2 implementation:** the header moves the one canonical `#tagUnit` control,
  separates self/opponent film context from charting unit, invokes the existing
  Quick Chart mode, and projects current play, D&D, progress, and autosave state
  without adding stored fields.
- **R2 verification:** focused Break Down contract `19/19`; self/opponent labels
  verified for offense, defense, and Special Teams; Quick Chart and save-state
  wiring verified; all four required viewports reviewed without clipping or
  page-level horizontal overflow.
- **Starting point for R3:** preserve the local, uncommitted R1/R2, Big Calls,
  and `BreakdownVideo` work; recompose canonical tag controls into the approved
  order and density without deleting selectors or introducing parallel state.
- **First failing contract for R3:** all production tag fields remain reachable,
  while the dedicated route presents situation, primary call, opponent look,
  outcome, players, and advanced details in the approved hierarchy.
- **Current implementation:** real canonical groups; field/header library entry
  points; structured penalty and phase-first Special Teams placement; relevant
  player roles and fixed action footer; scoped production typography/chips/toast;
  explicit Chart/Film Room modes with Chart as the video-first default.
- **Current verification:** Breakdown route `25/25`; canonical form `44/44`; tag
  library settings `14/14`; team library contract `11/11`; penalty contract
  `7/7`; Special Teams contract `20/20`; required desktop,
  tablet, and mobile screenshots captured and reviewed without page overflow.
- **R4 result:** all three team-scoped vocabularies are editable from the field
  or header, immediately chartable, non-destructive when hidden, and isolated
  across teams. Fronts are proven in both Our Defensive Call and Defense Faced.
- **R5 result:** the structured editors remain the only trusted new-data path;
  legacy penalty/ST details stay quarantined. Both models pass canonical persist,
  reopen, snapshot, and restore round trips without reviving legacy result chips.
- **R6 result:** the full attribute/grade/note/Save & Next/reopen path is pinned.
  A real defect was fixed: pending notes are now owned by their originating play,
  flushed before navigation, and emit `play-updated`, preventing rapid navigation
  from losing or cross-wiring notes. Tagging `27/27`; real six-game integrity
  stress: 12 seeds × 80 operations, zero violations or page errors.
- **R7 result:** approved UI font and density, semantic uppercase blue toasts,
  keyboard activation, visible focus, accessible names, selected-chip WCAG AA
  contrast, and effective 125%/150% Windows scaling pass `8/8`. The compact
  scaled-desktop header fixed an overflow found by the new test. Workspace shell
  remains `16/16`.
- **R8 result:** Chart is the video-first default and hides the spreadsheet;
  Film Room is one explicit header action away in the media column. Switching
  modes preserves the current play and byte-identical unsaved tag state. The
  complete Film Room contract is `60/60` (inline editing, keyboard movement,
  filters/saved filters, columns/presets, tendencies, Watch, CRUD, undo/redo,
  and game switch); the integrated route remains `25/25`. Chart and Film Room
  desktop captures were visually reviewed with no overlap or page overflow.
- **R9 code review result:** five findings are fixed locally. Pending notes now
  update the originating play before any commit and debounce only the mutation
  event; object identity prevents a same-numbered play in another game from
  receiving the note, and Clear Tags cannot resurrect stale text. Dynamic tag
  library rows use DOM properties instead of interpolated attributes, preserving
  quoted names as inert exact values. A `ResizeObserver` reclamps user-positioned
  controls after Chart/Film Room or viewport resizing. `play-updated` refreshes
  one stable play card instead of rebuilding and recentering the entire strip.
- **R9 verification:** route/video `31/31`, form `46/46`, tag-library settings
  `15/15`, and the fresh 49-script repository gate are green. Analytics parity,
  the real-season integrity run, storage/catalog fuzzers, Film Room `60/60`, and
  XSS coverage all remain clean.
- **Served-browser correction:** the isolated browser origin had no season, so
  every primary workspace destination was disabled and the only setup path was
  buried in season management. Empty Home now exposes an enabled `Set up team`
  primary action; a team with no open season exposes `Choose a season`. The
  sample path was manually driven through open season, Break Down, play select,
  and enabled tag form. Workspace shell is `18/18`; the full 49-script gate was
  rerun afterward and remains green.
- **R9 parity-matrix audit:** complete on 2026-07-15 against the tagged
  `design-v1.1` source. The three failed rows were rebuilt and re-captured at all
  four required viewports. Break Down now reclaims the desktop sidebar width;
  mobile has one workspace navigation system; Situation precedes secondary game/
  template chrome. No Missing or Partial rows remain locally.
- **Smoke findings:** coach screenshot approval is complete. Installed smoke on
  `v1.12.0-3` found that charting navigation escaped active analytics example
  sets. The `v1.12.0-4` continued-smoke candidate keeps Previous, Skip, and Save
  & Next inside the filtered cut-up without carrying situation to
  nonconsecutive examples. Plan's undiscoverable empty workflow is logged as
  BETA-004; the formation and coverage model blockers are BETA-005/006.

## Post-v1.12.0-6 Home increment (BETA-009)

- `v1.12.0-6` / `92fdee8` is the pushed beta baseline. The following work is
  local only and is not in that release.
- Home game rows can now be selected for read-only inspection without changing
  the active Break Down game. A separate Open command is required to switch.
- The selected-game overview reports opponent/date/status, score, total plays,
  canonical charted count, and unit mix. Existing film-health state remains
  visible per row.
- Changed locally: `js/workspace-shell.js`, `css/workspace-shell.css`,
  `tools/e2e-workspace-shell.mjs`, and rebuilt
  `football-film-analyzer.html`.
- Verification: shell `22/22`, context `20/20`, onboarding `46/46`, and
  Break Down/video `36/36` with zero page errors.
- No schema, tag, migration, film-storage, or active-game mutation is introduced.
  Next action is independent diff review plus the complete atomic gate before
  commit/package.

## Current Local State

- `v1.12.0-2` has been withdrawn from coach testing.
- `v1.12.0-3` is superseded by the `v1.12.0-4` continued-smoke candidate.
- The analytics-example navigation correction and standard `Power-I`, `Ace`,
  and `Victory` Formation values are included in the candidate.
- The exact rebuilt candidate passed the physical asset check and complete
  49-script repository gate in 187.7 seconds.
- `v1.12.0-5` adds the BETA-007 playback optimization: no empty-canvas repaint
  during film, compositor-only progress fill, and automatic restore points
  deferred to a stable pause without delaying canonical autosaves. The
  pre-version-stamp implementation passed the complete 49-script gate in 243.8
  seconds. The exact stamped bundle also passed the physical asset gate, focused
  video/charting/catalog checks, and real-season integrity stress; installed
  high-resolution film remains the required smoke.
- `v1.12.0-6` adds the persistent `Autoplay next` charting preference. It
  defaults on; when off, all manual next/previous charting paths seek and pause,
  including filtered examples, without changing Watch cut-up startup or stored
  play data. The exact candidate passed the complete 49-script repository gate
  in 256.4 seconds.
- BETA-004/005/006 remain open; the candidate must not be used for permanent
  formation or coverage retagging until the P0 model corrections are complete.
- No current season data has been migrated, cleared, or rewritten by this audit.
