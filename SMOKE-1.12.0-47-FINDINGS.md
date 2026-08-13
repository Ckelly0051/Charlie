# GridIron IQ 1.12.0-47 - Coach Smoke Findings

## Status

**REPAIRED IN `1.12.0-48`; INSTALLED VIDEO CONFIRMATION PENDING.** HOME-1 and
VIDEO-1 were repaired together, the focused journeys pass, and the canonical
gate is 85/85 green. HOME-1 is closed. VIDEO-1 remains open only for the
coach's real-film WebView2/GPU smoke; no coach data change is authorized.
## HOME-1 - Season row composition is visually broken

Observed on the installed `1.12.0-47` candidate on 2026-08-12.

The Home season row is stretched across the entire workspace rather than
composed as one readable object. The `SEASON` label is clipped at the left edge;
season identity, game/play totals, status, `Open`, and delete are separated by
large dead gaps; `Not checked yet` does not name what was not checked; and the
actions are stranded at the far right. Worse, the literal `Open ->` label points
directly at the adjacent `x` delete control, visually instructing the coach to
click the destructive action. The row is hard to scan and reads like unrelated
fragments rather than one selectable season.

### Required outcome

- Keep the section label fully visible and aligned with the content column.
- Compose each season as a compact responsive row: identity, game/play summary,
  explicit film-health state, then grouped actions.
- Replace context-free status copy such as `Not checked yet` with an explicit
  subject and a real loading/unknown state (for example, `Film status not
  checked`), then update it when the check completes.
- Remove the directional arrow from `Open`; it must never point toward Delete.
- Make Open the unmistakable primary row action. Separate Delete spatially and
  visually, give it an explicit accessible label, and retain confirmation before
  deletion.
- Remove decorative dead space; do not solve this by stretching columns to fill
  the viewport.
- Verify at full desktop width and in a resized desktop window. No clipping,
  page-level horizontal overflow, or action overlap.

### Evidence

Coach screenshot: `codex-clipboard-c62c847d-3395-450a-b0ca-d98f5d7afcb5.png`.
The screenshot is local evidence and is not required in git.

### Repair result (`1.12.0-48`)

The season library now uses a bounded 1120px maximum content row rather than
stretching its fields to the workspace edge. Season identity, game/play counts,
and explicit film state form one summary; Open and Delete are separate named
buttons. The arrow and absolute-positioned delete control are gone. Desktop and
mobile containment, visibility, action separation, accessible deletion, and
closed-season status wording are pinned in `e2e-native-team-hub.mjs` (24/24).
## VIDEO-1 - Fullscreen playback stutters or judders

Observed on the installed `1.12.0-47` candidate on 2026-08-12. The same film
plays normally in the embedded player but visibly stutters/judders after entering
fullscreen. This is a playback defect and blocks closing the current smoke batch.

The fullscreen-only boundary points first to presentation work triggered by
fullscreen: media sizing and fractional resampling, canvas/drawing overlays,
control animation, resize observers, and repeated layout or state updates. Do not
assume linked-film I/O or source compression is the cause while the identical
source plays smoothly outside fullscreen.

### Required outcome

- Fullscreen playback is perceptually as smooth as embedded playback for the
  same clip, speed, and hardware.
- The media element retains integer, aspect-correct presentation geometry; no
  CSS transform, filter, or animation may be applied to the video itself.
- Fullscreen entry/exit must not create duplicate playback loops, resize
  handlers, animation frames, timeupdate work, or overlay redraw owners.
- Drawing canvas and movable controls remain aligned without forcing continuous
  layout or full-canvas redraw while idle.
- Verify linked film and one managed/local fixture at normal speed, including
  pause/resume, seeking, play advance, fullscreen exit/re-entry, and Windows
  display scaling used by the coach.
- Capture frame timing or long-task evidence before choosing an optimization;
  do not hide judder by lowering video quality.
### Repair result (`1.12.0-48`)

Fullscreen media ticks no longer publish Preact state for the hidden transport
and complete play strip. The drawing canvas is `visibility:hidden` and removed
from pointer/compositing work whenever no tool or current-frame annotation needs
it; selecting a tool or entering an annotated frame restores it immediately.
The canonical media node remains exact, aspect-correct, unfiltered, and
untransformed. `e2e-native-breakdown-theater.mjs` pins zero fullscreen
time-update publishes, dormant/armed canvas transitions, exact 1920x1080
geometry, and canvas alignment (29/29). The full gate is 85/85 green.

**Installer:** `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-48_x64-setup.exe`
(SHA-256 `4C5F7B596B1103F0989A911FE7E33A2B84F7F11FC8FAC5C65B5647670951F3F7`).

**Final acceptance still required:** install `1.12.0-48` and compare the same
linked clip embedded/fullscreen at 1x, including pause/resume, seek, next play,
exit, and re-entry. This installed observation decides whether the WebView2/GPU
judder is closed or whether frame-timing diagnostics are still needed.
## Next Product Enhancement - Exact-match historical Play Call mapping

After the current smoke batch is accepted, build a preview-first mapper that
uses a saved Play Call's complete defaults as exact matching criteria against
historical plays. For example, `Power-I + Under Center + Power + Run + Run
Outside + Right` may map to `26 Blast` when the coach defines that rule.

The safe first version adds Play Call identity only to exact matches with blank
Play Call fields. Existing football tags remain unchanged; partial matches are
excluded; conflicting existing calls are flagged; the coach can watch and
exclude matches; and no write occurs until explicit confirmation after a restore
point is created. Any mode that rewrites historical football tags is a separate,
explicitly authorized workflow.