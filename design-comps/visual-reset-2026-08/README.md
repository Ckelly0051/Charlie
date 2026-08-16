# GridIron IQ — visual reset, August 2026

Three art directions for the two flagship screens, built as real HTML/CSS, from
the coach's real season. **Nothing here is production code.** No application
module, token file, or season byte was touched.

**Double-click `index.html`.** It switches among all six, toggles first-screen vs
full-page, and links straight to the live HTML for whichever comp is showing.
Keyboard: `1`/`2`/`3` direction, `R`/`B` screen, `F` view.

It is built on the PNG captures rather than iframes on purpose — Chrome refuses to
let a `file://` page frame another `file://` page, so an iframe version only works
behind a server and shows an error otherwise. Images have no such restriction.
Verified in Chrome over `file://`: all 12 direction × screen × view combinations
load, zero failed requests.

| | Reports Overview | Break Down |
|---|---|---|
| **A · Premium Sports Operations** | `premium-sports-ops/reports.html` | `premium-sports-ops/breakdown.html` |
| **B · Broadcast Analytics** | `broadcast-analytics/reports.html` | `broadcast-analytics/breakdown.html` |
| **C · Modern Tactical Workstation** | `tactical-workstation/reports.html` | `tactical-workstation/breakdown.html` |

`captures/` holds two PNGs per comp: `-fold.png` is exactly 1440×900 (what the
coach sees before scrolling — the honest comparison) and the un-suffixed file is
the full page. `capture.mjs` regenerates both and runs the geometry checks.

---

## The content is fixed; only the composition changes

Every comp renders the **same real content**, so the only variable is art direction:

- **Reports** — Week 1 vs St. Peter Lutheran Patriots. 41–0, 67 plays, 67 charted,
  29 O / 20 D / 18 ST. 68% success, 10.3 yds/play, 289 yards (255 rush / 34 pass),
  9 explosives, 2 plays for loss, 0 turnovers, 6/8 scoring drives, 8 big plays,
  2 penalties for 10 yards. Every table row, every Game Plan line ("Power-I is 83%
  run", "motion is a tell"), every quarter score is carried across all three.
- **Break Down** — Week 5 vs OL Lakes Lakers, Play 80 of 82, 3rd & 19 on the Opp 45,
  middle hash, Maverick front / Cover 3, Run Outside, Loss −1, inside the
  "#5 Ben Kelly · Game 4 of 5" cut-up, with plays 78–83 in the strip.

No number was invented, rounded, or made more flattering. Where the app says
"3rd & short — no data", the comps say it too.

---

## A · Premium Sports Operations

**Thesis — the coordinator's binder, rendered as software.** The product a paid
coordinator opens on Sunday night. Layered dark surfaces with genuine elevation,
a continuous team-colour spine, and *one typographic rule that carries meaning*.

**The aesthetic risk, and why it earns its place.** Measured data is set in sans
with tabular figures. The app's own *interpretation* — the Game Plan strengths and
needs-work lines — is set in **Georgia italic**. That is not decoration: it marks
the boundary between what was counted and what the app concluded. A coach can see
at a glance which lines are arithmetic and which are the product's opinion. Serif
italic appears nowhere else in the direction, including Break Down, because there
is no judgement text there.

- **Type** — Segoe UI Variable Display for headings (−0.022em at large sizes),
  Segoe UI for body and data, Georgia italic for interpretation only.
- **Palette** — ground `#0F151C` (blue-biased near-black, not neutral),
  surface `#161E28`, raised `#1D2733`. Ink `#E9EEF4` / `#9AA8B8` / `#66748A`.
  Team identity `#3B6FD4`, used as a **spine**, never as a fill.
- **Surface & depth** — real elevation. Modules carry an inset top highlight plus a
  two-stage drop shadow and have **no borders at all**; separation is material.
- **Layout** — asymmetric. A sticky 320px *answer rail* carries the score, the five
  numbers, and the phase split and never scrolls away; the detail column scrolls
  beside it. The signature is the **spine**: a team-colour gradient bar running the
  rail's full height with section markers hanging off it.
- **Density** — 2,364px total. The left rail carries a live section index, because a
  report this long needs navigation and five nav items left ~580px of dead space.

## B · Broadcast Analytics

**Thesis — the truck.** Flat on-air graphics on true stage black. No elevation, no
cards; contrast and colour do the work.

**The signature is the colour post.** Every module is headed by a hard 4px bar that
says *whose ball it is*: gold offence, cyan defence, bone game-level. It is a
legend you never have to read. On Break Down the play state becomes a genuine
broadcast **lower-third** — down & distance, ball on, hash, our call, offence
faced, result — sitting *directly below the picture*, never over it.

- **Type** — **Bahnschrift** (semi-condensed, `font-stretch: 87.5%`) in caps for
  every structural element and every large number; Segoe UI for body. Condensed is
  authentic to broadcast rather than a default, and Bahnschrift ships with Windows.
- **Palette** — stage `#06080B`, panel `#0E1319`. Offence `#C08A05`, defence `#0FA3C4`.
- **Surface & depth** — deliberately none. Hard 1px rules and colour posts only.
- **Layout** — a full-bleed **scorebug** band across the top carrying the score,
  linescore and the game's single headline number, then a grid of graphic blocks.
- **Density** — 2,261px.

## C · Modern Tactical Workstation

**Thesis — the instrument, not the document.** There are **no cards**. The page is
one machined panel divided by 1px grooves, each cell carrying a hairline top
highlight so separation reads as material rather than as a box.

**The signature is the groove and the monospaced numeral.** Every number is set in
Cascadia Mono / Consolas, so data reads as a *readout*. This is the direction that
wins on tables, forms and scanning.

- **Type** — Segoe UI at small sizes with tight rhythm; **all numerics monospaced**.
  Micro-labels are 8.5–9px uppercase with wide tracking.
- **Palette** — ground `#0B0F12` (cool graphite), panel `#12171B`, groove `#1E252B`.
  One restrained accent `#5186C6`. Run `#B4762D`, pass `#5186C6`.
- **Surface & depth** — essentially flat, separated only by grooves and highlights.
- **Two measured results, not claims:**
  - Reports fits the same content in **1,527px** against 2,364 (A) and 2,261 (B) —
    **35% less scrolling** for identical information.
  - Break Down fits the **entire** defensive call — situation, all 16 fronts, all 7
    coverages, family, blitz, run/pass, direction, all 9 play types — **with no
    scrolling at all**, Save & Next pinned. That is the direct win for repeated
    charting.

---

## Chart and data-density strategy

Colour was chosen last and **computed, not eyeballed**. Every categorical palette
was run through the `dataviz` validator (OKLCH lightness band, chroma floor,
protan/deutan/tritan ΔE, normal-vision floor, contrast vs surface) against each
direction's own dark surface. All three pass on every check.

**A finding worth carrying into production:** *three* categorical series fails in
every direction — a green third breaks the chroma floor, a purple third breaks CVD
separation against cyan. So each direction ships **exactly two** categorical hues
and the phase split (29 O / 20 D / 18 ST) is rendered as a **sequential ramp**,
which is what it actually is: parts of a whole in fixed order. That is a system
decision, not a workaround.

- **Categorical (identity)** — run/offence warm, pass/defence cool, in fixed order,
  never cycled. Warm-run / cool-pass is retained across all three because it is
  football convention and it is *meaning*.
- **Sequential (magnitude)** — one hue, light→dark: success bars, phase split.
- **Status** — good / watch / critical are reserved, never reused as "series 3", and
  always ship with a label, never colour alone.
- **No dual-axis anywhere.** Run/pass share and conversion are separate columns, not
  two scales on one chart.
- Marks are thin, grid and axes recessive, and labels are selective rather than a
  number on every point.

---

## Current design-system choices: retained, revised, rejected

**Retained** — the interaction, accessibility and data-integrity rules, which are
the genuinely valuable part of the existing system:

- Film is sacred. No control or decoration overlaps the video in any comp.
- Every highlighted row is a film link, and the displayed count is the film cohort.
- Honest empty states: "3rd & short — no data" stays as it is, never a zero.
- Accepted-enforcement-only penalty yards, disclosed as such.
- 44px touch targets and visible selected states on every chip.
- Run = warm, pass = cool.

**Revised**

- The five-lens Key Metrics model survives, but as **columns in one module**, not
  five bordered cards inside a bordered card.
- Report tabs stay, restyled per direction (elevated tab in A, chyron in B,
  segmented control in C).
- Lower-thirds survive **only in B**, where they are the point — and only below the
  film, never over it.

**Rejected**

- **Flat Carbon-like bordered panels.** A replaces borders with elevation, B with
  colour posts, C with grooves. None of the three uses a border to separate modules.
- **Card-inside-card nesting** — every comp is one level deep.
- **Condensed micro-labels as the default UI voice.** Condensed is now a deliberate
  choice in B only; A and C use readable sans at 8.5–10px with tracking instead.
- **Spreadsheet stretching** — tables are width-bounded and paired two-up.

---

## Implementation implications

1. **Fonts are already on the machine.** Segoe UI Variable, Bahnschrift, Cascadia
   Mono and Consolas all ship with Windows 11, so no webfont is needed for any
   direction. If the product later targets the browser build, Bahnschrift is the
   one face with no cross-platform equivalent — B would need a bundled condensed
   face, A and C would not.
2. **C is the cheapest to build and the most disruptive to the current CSS.** It
   deletes card styling wholesale in favour of `gap:1px` grids over a groove-coloured
   background. That is less CSS than today, but it touches every module.
3. **A needs a real elevation scale** (three levels + inset highlight) added to the
   token set. The existing system has two shadow tokens, both for floating overlays.
4. **B needs offence/defence to become a first-class semantic pair** in tokens, since
   the colour post is load-bearing rather than decorative.
5. **The sticky answer rail in A** and the **no-scroll form in C** are the two ideas
   with real workflow consequences; both are worth prototyping against the real
   six-game season before committing, because both depend on content height.
6. **Direction can be combined.** C's charting form and A's report composition are
   independent of each other, as are B's colour roles.

---

## One honest disclosure: the film frame

The brief asked for an actual film frame. The comps use a **CSS-composed stand-in**
that matches the real frame's structure (sideline angle, treeline, tent, yard lines,
white and blue jerseys, official) rather than the real frame itself.

The reason is a line this project has already crossed once: `7477fe2` accidentally
committed 267 scratch artifacts including real team-film frames, which was flagged
and untracked. These captures are committed, so embedding a real frame of minors in
them would repeat that. The play metadata around the film is 100% real.

**To see real film in the comps:** drop any frame at
`design-comps/visual-reset-2026-08/assets/film-frame.jpg`. Each comp already
references it and falls back to the stand-in when absent — no code change needed.
That path is gitignored, so it stays local.

---

## What was checked

`capture.mjs` renders all six at 1440×900 and asserts, per comp: no page-level
horizontal overflow, no element whose right edge passes the viewport, no
text clipped by its own box. All six pass clean. All six were then inspected by eye
for dead space, overlap, alignment and readability; the issues that pass found and
that were fixed are listed in the handoff entry in `CLAUDE.md`.

**Not claimed:** these are visual treatments, not working software. No comp has
real state, persistence, keyboard routing, or responsive behaviour below 1440px.
Aesthetic acceptance is the coach's.
