# GridIron IQ Beta Smoke Findings

> Status (2026-07-16): `v1.12.0-6` at commit `92fdee8` is the pushed,
> installable smoke baseline. BETA-009 is implemented and verified only in the
> local working tree; it is not committed, pushed, packaged, tagged, or released.
> The coach remains the sole installed-desktop reviewer and smoke tester.

## Findings

### BETA-001 - Big-call table displays raw HTML markup

- **Status:** Fixed in v1.12.0-3 candidate
- **Reported:** 2026-07-13
- **Surface:** Analytics / call tendency table
- **Observed:** Call rows display literal internal markup such as
  `<span class="bt-tag bt-mot">` and `<span class="bt-arrow">` instead of
  rendering the motion, strength, and arrow formatting.
- **Impact:** High visual/readability defect. The report is difficult to scan
  and exposes implementation markup to the coach.
- **Evidence:** `codex-clipboard-4d024786-4f2c-43f9-acf6-3ccb09a99ece.png`
- **Likely boundary:** A formatted call-label string is being escaped before
  insertion, or a renderer now returns markup where its consumer expects text.
- **Local fix:** Restored the generated call-format spans at one explicit
  trusted markup boundary while preserving per-value escaping.
- **Regression needed:** Render adversarial coach-entered formation/motion/play
  names safely while asserting internal label spans render as elements, not
  literal text.

### BETA-002 - Approved video workspace and play strip are missing

- **Status:** Fixed in v1.12.0-3 candidate
- **Reported:** 2026-07-13
- **Surface:** Break Down / primary charting workspace
- **Observed:** The beta places the legacy production video player, control
  layout, timeline, and Film Room directly inside the new workspace shell. The
  approved redesigned video layout, compact controls, fixed-width readable play
  strip, improved scrolling, video-safe borders, control feedback, and spacing
  refinements from the final prototype did not carry into the functional beta.
- **Impact:** Release-blocking design/integration gap. The highest-frequency
  charting surface does not match the reviewed and approved design.
- **Evidence:** `codex-clipboard-0ad666b8-e1d0-4fa5-8e2c-31f7f6a9bf13.png`
- **Expected:** The functional production workspace should use the approved
  video-first Break Down composition while retaining real production playback,
  tagging, film storage, play selection, and persistence behavior.
- **Likely boundary:** Phase 4 integrated the redesigned tag-form hierarchy but
  intentionally relocated the intact classic `#app`; the prototype's video and
  play-strip presentation was never ported onto the production controllers.
- **Local fix:** Added the approved video-first presentation over the existing
  VideoController/PlayTagger/PlaylistManager controls: movable auto-hiding
  transport, fixed-width live play cards, compact actions, and contained mobile
  scrolling. No persistence or playback path was replaced.
- **Regression needed:** Desktop and mobile screenshot QA, nonblank playback,
  play-strip selection/scroll visibility, no controls covering video or
  scrollbars, Save & Next feedback, keyboard behavior, and full persistence/
  playback gates.

### BETA-003 - Save & Next leaves an analytics example set

- **Status:** Fixed and included in the `v1.12.0-4` smoke candidate
- **Reported:** 2026-07-15
- **Surface:** Analytics success-rate row → Watch examples → Break Down
- **Observed:** The first example opened correctly, but the charting Previous,
  Skip, and Save & Next controls used chronological play order instead of the
  active filtered cut-up queue.
- **Impact:** The coach silently left the requested grouping while reviewing or
  correcting its film examples.
- **Fix:** While a cut-up is active, it owns charting navigation. Save & Next
  flushes edits and advances within the example set without carrying Auto D&D
  or scheme into a nonconsecutive play. Finishing the set never falls through
  to chronological or next-clip navigation.
- **Regression:** Nonconsecutive examples `1 → 3` are pinned for Save & Next,
  Previous, Skip, end-of-set behavior, edit persistence, and D&D isolation.

### BETA-004 - Plan stays blank despite real tagged Study data

- **Status:** Documented; not fixed
- **Reported:** 2026-07-15
- **Provisional priority:** P1 product/UX blocker
- **Surface:** Plan workspace in a real tagged season/game with populated Study
- **Observed:** Even when Study has computed data from the active tagged game,
  Plan remains blank apart from plan creation and staff notes. The screen gives
  no clear explanation that Study data is not added automatically and no clear
  path to add useful content. It reads like an unfinished notes page.
- **Intended workflow:** Plan is the downstream teaching workspace for Study.
  A coach runs a Study query, saves a finding and its exact film refs to a plan,
  then uses Plan to reorder findings, watch the linked examples, present them
  full-screen, edit audience/name/notes, export the ordered plan, remove items,
  or delete the plan.
- **Current technical state:** Study computes analysis independently; Plan is a
  manually curated collection and does not auto-import available Study data.
  Item/reorder/watch/present/export paths are implemented and regression-tested
  only after a coach explicitly saves a Study finding. The Plan screen does not
  explain this dependency or provide a useful route into it, and Plan has almost
  no direct item-authoring capability.
- **Product direction:** Keep the final plan intentionally curated rather than
  dumping every metric into it, but surface useful Study results as suggestions.
  Plan should explain `No findings added yet`, offer a prominent `Browse Study
  insights` action, and show recent or relevant findings that can be added in
  one click. Study needs a prominent `Add to Plan` action on each result and a
  clear confirmation naming the destination plan.
- **Acceptance direction:** A coach entering Plan from a real tagged game can
  immediately distinguish available Study analysis from findings already added
  to the plan, add a useful finding in one click, return to the correct plan,
  and discover Watch, reorder, Present, and Export without prior instruction.

### BETA-005 - QB alignment is incorrectly modeled as formation

- **Status:** Documented; do not migrate or clear data without coach approval
- **Reported:** 2026-07-15
- **Provisional priority:** P0 data-model blocker before permanent re-tagging
- **Surface:** Offensive Look charting, Formation analytics, Study dimensions
- **Observed:** `Under Center`, `Shotgun`, and `Pistol` live in the same
  multi-select `formation` field as structural formations such as `Ace`. The
  formation report therefore treats a QB alignment as a peer formation row and
  can obscure the structural formation the coach intends to study.
- **Domain model:** Add a single-select `qbAlignment` dimension with `Under
  Center`, `Shotgun`, and `Pistol`. Keep structural formation in `formation`,
  back alignment in `backfield`, and side in `strength`. A play can then be
  `qbAlignment: Shotgun`, `formation: Ace`, `backfield: Single`, and `strength:
  Right` without conflating those concepts.
- **Analytics contract:** Primary Formation charts group by structural
  formation only. QB Alignment gets its own frequency/effectiveness dimension.
  Study and reports support Formation x QB Alignment cross-tabs and combined
  filters. Displayed call labels may compose the dimensions, but storage and
  aggregation must remain separate.
- **Comparable-app evidence:** Hudl publishes separate Offensive Formation,
  Backfield, and Offensive Strength breakdown columns and explicitly advises
  coaches to keep backfield data out of formation. QwikCut likewise lists
  Backfield and Offensive Formation separately. Tactix calls Under Center,
  Shotgun, and Pistol `Quarterback Alignment`; PFF lists detailed offensive
  formation separately from shotgun/pistol/under-center.
- **Existing-data rule:** Do not silently rewrite the coach's season. Before
  any migration, present the exact affected-play count and request confirmation.
  Known alignment tokens could then move losslessly into `qbAlignment`; a play
  containing only `Shotgun` would retain blank structural formation rather than
  inventing `Ace` or another look. The coach has already stated that known-bad
  data need not be preserved, but clearing still requires explicit approval.
- **Acceptance direction:** Charting `Shotgun + Ace` produces one Ace formation
  rep and one Shotgun QB-alignment rep, never a competing Shotgun formation row;
  all Formation, Study, filter, export, Film Room, and video-linked report paths
  agree on the separation.

### BETA-006 - Coverage shell and family cannot be charted together

- **Status:** Documented; do not migrate or clear data without coach approval
- **Reported:** 2026-07-15
- **Provisional priority:** P0 data-model blocker before permanent re-tagging
- **Surface:** Our Defensive Call, Defense Faced, coverage analytics and Study
- **Observed:** `Cover 0` through `Cover 6`, `Man`, and `Zone` are peer choices
  in one single-select `coverage` field. A coach therefore cannot accurately
  chart combinations such as `Cover 2 + Zone` or `Cover 3 + Man`.
- **Rejected shortcut:** Making the existing field multi-select would create the
  same analytics error as QB alignment inside Formation: shells and families
  would become competing rows in one dimension and inflate coverage counts.
- **Domain model:** Keep a single optional `coverageShell` value (`Cover 0`
  through `Cover 6`) and a separate optional `coverageFamily` value (`Man`,
  `Zone`, or `Match`). Shell is the primary coverage tag; family is additional
  detail and remains blank by default. Either field may remain blank when the
  film does not support a confident tag.
- **Analytics contract:** Coverage Shell and Coverage Family receive separate
  frequency/effectiveness breakdowns. Study, Film Room, reports, and cut-ups can
  filter each independently or cross-tab Shell x Family. The same canonical
  fields apply to our coverage on defensive snaps and coverage faced on
  offensive snaps; perspective changes labels, not stored meaning.
- **Existing-data rule:** Before any migration, show the coach the affected-play
  count and request confirmation. Existing exact `Man`/`Zone` tokens can move to
  family without inventing a shell; exact `Cover N` tokens can move to shell
  without inventing a family. Ambiguous/custom values remain untouched for
  explicit review.
- **Acceptance direction:** `Cover 3 + Man` produces one Cover 3 shell rep and
  one Man family rep, can be queried as their intersection, and links to the
  identical play set everywhere without double-counting the play. A coach can
  chart Cover 2 alone without being forced to confirm its family, while the rare
  match coverage remains representable as `Cover 2 + Match`.

### BETA-007 - Playback intermittently hitches during charting

- **Status:** Fixed in the `v1.12.0-5` smoke candidate; installed-film
  validation pending
- **Reported:** 2026-07-15
- **Surface:** Desktop Break Down video playback while charting
- **Observed:** Film occasionally lagged or paused for roughly one to two
  seconds during normal review.
- **Root causes in app-controlled work:** Every video `timeupdate` cleared and
  repainted the full-resolution drawing canvas even with no visible drawings.
  In addition, the first and throttled automatic restore points could export the
  full SQL catalog while the next charting example was already playing.
- **Fix:** Playback canvas work now occurs only when entering or leaving a frame
  with a drawing. The progress fill uses a compositor transform and the time
  label skips duplicate DOM writes. Canonical tag autosaves remain immediate;
  only the heavier automatic restore point waits for a stable pause. Manual and
  pre-risk safety snapshots remain immediate and supersede pending automatic
  work.
- **Integrity guard:** Deferred snapshots are pinned to the active season and
  discarded on transitions, preventing any cross-season write. The rebuilt
  bundle passes the focused video workspace gate (`35/35`), catalog/backend
  gates, video CORS gate, charting form (`50/50`), and the real six-game
  integrity stress harness (960 operations, zero violations).
- **Remaining validation:** The coach must confirm the improvement against the
  original high-resolution desktop film. Decoder/codec or disk-throughput
  stalls cannot be reproduced without that installed-film fixture.

### BETA-008 - Coach-selectable next-play autoplay

- **Status:** Implemented in the `v1.12.0-6` smoke candidate
- **Reported:** 2026-07-16
- **Surface:** Break Down video action bar and charting navigation
- **Behavior:** A persistent `Autoplay next` toggle defaults on for backward
  compatibility. Off still seeks to and loads the next play and its tags, but
  explicitly pauses film. Previous, Save & Next, Skip, and manual movement
  within a filtered Study/analytics example set share the preference. Starting
  a Watch cut-up remains intentional playback; automatic cut-up continuation
  while already playing remains uninterrupted.
- **UX:** The compact labeled checkbox lives beneath the video, is keyboard
  accessible, and keeps a 44px touch target on mobile. Desktop, mobile, and
  Windows 125%/150% scaling checks remain unclipped and overflow-free.
- **Regression:** Charting form `53/53`, video workspace `36/36`, cross-game
  cut-up `13/13`, accessibility `8/8`, Film Room `60/60`, and video CORS
  `14/14` are green before the complete release gate.

### BETA-009 - Home games cannot be inspected without opening them

- **Status:** Implemented and focused-verification complete locally; not
  committed or packaged
- **Reported:** 2026-07-16
- **Surface:** Home / active-season game list and summary
- **Observed:** Home displayed a useful `X of Y plays charted` value, but a
  coach could not select another game to inspect its progress or score without
  opening it and changing the active editor game. The summary therefore had
  little value for scanning a season.
- **Fix:** Each game row has a read-only selection target and a separate Open
  command. Selection preserves `activeGameId` and updates the Home overview
  with opponent, date/status, score, total plays, the canonical
  `isPlayTagged` count, and Offense/Defense/Special Teams counts. The first
  preview defaults to the previous selection, active game, or first game.
- **UX:** Selected state, keyboard focus, neutral/ready/missing film-health dots,
  and a 44px mobile target are explicit. The summary is a compact inline facts
  band rather than another nested card.
- **Data safety:** Preview is read-only. It does not load the game, alter tags,
  migrate data, or write film/storage state.
- **Regression:** workspace shell `22/22`, workspace context `20/20`,
  onboarding `46/46`, and Break Down/video `36/36`; zero page errors. The
  standalone bundle was rebuilt before these checks.
- **Next gate:** independent diff review plus the complete atomic repository gate
  before commit or packaging.

## Release Notes

- Superseded beta: `v1.12.0-2`
- Superseded smoke candidate: `v1.12.0-3`.
- Continued-smoke candidate: `v1.12.0-4`, containing the BETA-003 filtered-film
  navigation fix and the coach-approved standard Formation values `Power-I`,
  `Ace`, and `Victory`.
- The exact rebuilt candidate passed the physical desktop-asset check and the
  complete 49-script repository gate (187.7 seconds) with zero integrity or
  page-error failures.
- Playback candidate: `v1.12.0-5`, adding BETA-007's playback-safe canvas,
  progress, and automatic restore-point work. The exact pre-version-stamp code
  passed the complete 49-script repository gate in 243.8 seconds; the stamped
  bundle passed the physical asset gate, Breakdown Video `35/35`, charting form
  `50/50`, video CORS `14/14`, catalog/backend checks, and the real six-game
  960-operation integrity stress with zero violations.
- Autoplay candidate: `v1.12.0-6`, adding the persistent BETA-008 next-play
  preference without changing the default behavior or tag persistence. The
  exact rebuilt bundle passed the physical asset check and complete 49-script
  repository gate in 256.4 seconds.
- Local-only Home increment: BETA-009 adds selectable, read-only game previews
  and a high-level selected-game summary. It is verified but remains uncommitted
  and is not part of `v1.12.0-6`.
- BETA-004 remains a documented Plan workflow gap. BETA-005 and BETA-006 remain
  P0 data-model blockers: do not treat formation or coverage retagging in this
  candidate as permanent until those models are corrected and explicitly
  approved. No existing season data is migrated or cleared by this release.
- Full Break Down redesign parity is tracked in
  `BREAKDOWN-REDESIGN-PARITY.md`.
