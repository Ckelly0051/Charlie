# GridIron IQ v1.12.0-3 Beta Smoke Findings

> Status: the two `v1.12.0-2` findings are fixed in the `v1.12.0-3` smoke
> candidate. The coach is the sole installed-desktop reviewer and smoke tester.

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

## Release Notes

- Superseded beta: `v1.12.0-2`
- Replacement smoke candidate: `v1.12.0-3`; the rebuilt bundle passed the
  physical asset gate and complete 49-script repository gate.
- Full Break Down redesign parity is tracked in
  `BREAKDOWN-REDESIGN-PARITY.md`.
