# Stats Dashboard Re-Design — Working Brief

> **Status: ACTIVE / IN PROGRESS — direction LOCKED.** This is a handoff brief
> for the stats-dashboard visual re-work in a **local** Claude Code session (so
> the assistant can actually *see* the rendered UI via the Claude-in-Chrome
> extension). Delete this file once the re-design ships.
>
> **DIRECTION LOCKED (2026-06-14, with the coach, against an inline mockup of the
> Game tab built with real demo data):** **broadcast dark + bundled condensed
> display face + KPI hero row + responsive card grid**, explicitly **matching
> Hudl IQ**. Coach reaction: "huge improvement." See "Open design decisions"
> below for the specifics chosen.

## Why this file exists

We have been iterating on the analytics/self-scout features in a **cloud**
session, which means the assistant could run the headless e2e tests (logic is
verified) but **never saw the rendered dashboard** — so the visual design was
done blind. We're switching to a local session specifically to fix that: build
the bundle, open it in Chrome, load the demo season, **screenshot the dashboard,
and iterate on the look while seeing it.**

## The goal (coach's words)

- "The foundation is there, but the presentation and design of the stats
  sections is not on par with the best tools. We have the data but its
  formatting is not ideal."
- "I really don't like the **font and color scheme**."
- "The layout is just getting **longer but not really that much better**. I would
  love to see a **total re-work**."

So: this is a **visual/UX re-design of the stats dashboard**, not a data/logic
change. The numbers, cut-to-film wiring, and self-scout intelligence are good and
tested — make them *read* like a premium tool.

## Current state (what we're replacing)

- **Palette** (dark slate, `:root` in `css/styles.css` ~lines 11–21):
  `--bg-primary:#1b1f27`, `--bg-secondary:#232830`, `--bg-tertiary:#2c323c`,
  `--bg-surface:#363d49`, `--accent:#06b6d4` (cyan), `--text:#e2e8f0`,
  `--text-dim:#94a3b8`, `--text-bright:#f8fafc`.
  - NOTE: `CLAUDE.md` still describes the app as "light theme with a dark
    dashboard." The actual `:root` is now **dark**. There's doc drift — verify
    the real current theme in-browser before trusting CLAUDE.md's color lessons
    (#12/#13). Those lessons about *scoping* dashboard palette overrides (don't
    leak into the tag form) are still valid regardless.
- **Font**: default system stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI',
  Roboto, ...`). No type scale discipline; numbers aren't tabular-aligned.
- **Layout**: the dashboard is a **long single-column scroll** of stacked
  sections (mostly `.stats-table`s), section after section. Adding features made
  it *longer*, not clearer. This is the core complaint.
- **Structure**: 4 tabs — **Game / Offense / Defense / Self-Scout**
  (`stats-engine.js` `_renderDashboard`, ~line 1314; tab panes `data-pane=...`).

## What "the best tools" do (Hudl IQ — from public research; verify against
real screenshots once browsing works)

- **Interactive data-viz over plain tables**: player **radars**, **tackle maps**,
  **havoc charts**, formation **summary cards**, **drive charts**, interactive
  **box scores**.
- **"Fewer numbers, more shape"** — a coach sees the *pattern* at a glance, then
  clicks into film. Tight responsive **grid of cards**, not a wall of tables.
- Tendencies sliced by play direction, motion, hash, down & distance, field area.
- **Every data point ties to video** — we already do this (`.cut-row` →
  `_watchPlays`); keep it and make it more obvious in the new design.
- **FIRST THING TO DO in the local session**: actually look at Hudl IQ. The coach
  will paste screenshots or (in local mode) the assistant can browse. Pull the
  *real* palette, type, chart styles, and grid from those — don't design from the
  text descriptions above, they're a starting hypothesis only.

## Open design decisions (decide WITH the coach, ideally showing mockups)

**DECIDED (2026-06-14):** the coach picked option (a) on all three — see the
**bold-marked** choices below. Net: **broadcast dark + bundled condensed display
face + KPI hero + card grid, matching Hudl IQ.** (Note: typography was upgraded
from the original "system-only" recommendation to a **bundled** face for the
broadcast feel.) Original framing kept for reference:

1. **Theme** — (a) Broadcast dark: deep navy/charcoal `#0d1117/#161b22`, crisp
   white text, vivid data accents (blue `#3b82f6`, amber `#f59e0b`, green
   `#22c55e`, red `#ef4444`); (b) Clean light: white/`#f8fafc` cards, slate text,
   hairline borders, color only on data; (c) Chalkboard coach: dark green-slate
   field tones, chalk-white text, gold `#c9a227` accent.
2. **Typography** — (a) Refined system stack + **tabular-nums** + a real type
   scale + bigger hero numbers (0 KB, stays offline); (b) **bundle** a condensed
   sports display face (Archivo/Barlow Condensed) for headers/big numbers
   (~30–60 KB, needs a build step to inline — see offline constraint below).
3. **Layout** — (a) **KPI hero row** (Success %, Yds/Play, 3rd-down %, Havoc) +
   responsive **card grid** of charts/compact tables (much less scrolling); (b)
   tighten the current single column (lower risk, less dramatic).

Recommendation going in: **Broadcast dark + refined system/tabular nums + KPI
hero + card grid** — matches Hudl, film-room friendly, no bytes added — but
confirm with the coach against real Hudl screenshots first.

> **LOCKED CHOICE (2026-06-14):** (1) Theme = **Broadcast dark** (Hudl match);
> (2) Typography = **bundle a condensed sports face** (Barlow/Archivo Condensed,
> inlined as base64 in `build.sh` so the bundle stays offline) — for headers +
> big hero numbers, body stays system stack; (3) Layout = **KPI hero row +
> responsive card grid** across all four tabs (Game/Offense/Defense/Self-Scout),
> killing the long single-column scroll. Cut-to-film (`.cut-row`/`data-cut-*`)
> preserved on every card and row. Palette scoped to `.stats-overlay` (never
> `:root`).

## Hard constraints (do NOT break these)

- **Single-file, offline, no external libraries.** The app ships as one
  self-contained `football-film-analyzer.html` that runs from `file://` with zero
  network calls. No Google Fonts `@import`, no CDN CSS/JS. A custom font must be
  **inlined as base64 in the bundle** via `build.sh`, or don't bundle it. (A past
  stray Google-Fonts `@import` was explicitly removed — don't reintroduce one.)
- **Build system**: `bash build.sh` concatenates JS modules into the bundle,
  inlines CSS + the SVG sprite, strips `import`/`export`. **All JS shares one
  scope** — any new top-level `const`/`let` must be globally unique.
- **Charts are pure SVG**, generated as HTML strings in `js/charts.js`
  (`donut`, `donutWithLegend`, `gauge`, `effectivenessRows`, `stackBar`,
  `gameFlow`, `sparkline`, `miniBar`) and `js/visualizations.js`. Build new chart
  types the same way — no chart libraries.
- **Dashboard palette must be scoped** (`.stats-overlay` etc.), not dumped into
  `:root`, or it leaks into the rest of the app (CLAUDE.md lessons #12–13).
- **Keep every `.cut-row` / `data-cut-*` hook working** — clicking a stat plays
  the film cut-up. The re-design is visual; don't sever the video wiring.
- **Tests must stay green.** After any change:
  ```
  bash build.sh
  node tools/e2e-self-scout.mjs      # 28 tests
  node tools/e2e-film-room.mjs       # 56 tests
  node tools/e2e-onboarding.mjs      # 38 tests
  node tools/e2e-video-cors.mjs      # 14 tests
  ```
  These assert DOM structure/classes the renderers emit — if you rename classes
  the tests check (e.g. `.ss-tells`, `.sm-cell`, `.cut-row`, `.stats-section`),
  update the tests too, deliberately.

## Files in scope

- `css/styles.css` — all dashboard styles. Relevant blocks: `.stats-overlay`,
  `.stats-section`, `.stats-table*`, the chart classes, self-scout `.ss-*`,
  predictability map `.sm-*`, personnel diversity `.pd-*`, defensive `.def-*`.
- `js/stats-engine.js` — emits the dashboard HTML: `showDashboard()` (~193),
  `_renderDashboard()` (~1314, the 4 tabs), `_renderScoreboard`,
  `_renderDefensive`, `_renderSelfScoutBody`, `_renderSelfScoutMatrix`,
  `_renderPersonnelDiversity`, plus the print/export variants.
- `js/charts.js` / `js/visualizations.js` — SVG chart primitives.
- `football-film-analyzer.html` — the built bundle (regenerate; never hand-edit).
- `index.html` — modular dev shell (uses ES modules + the same CSS).

## How to actually SEE the dashboard (the whole point of going local)

Two ways to get a populated dashboard to look at:

1. **In the real app (preferred):** `bash build.sh`, open
   `football-film-analyzer.html` in Chrome, click **Explore a demo season**
   (deterministic, fully-tagged ~170 plays, offense+defense), then open
   **Stats** → cycle the Game/Offense/Defense/Self-Scout tabs. Screenshot each.
   `js/demo-season.js` `DemoSeason.build()` is the data source.
2. **Headless sample report:** `node tools/generate-sample-report.mjs` writes
   `sample-analytics-report.html` (real StatsEngine over dummy plays) — open it
   in Chrome for a quick look without driving the app.

Suggested loop: screenshot the CURRENT dashboard first (baseline) → agree on
direction with the coach → implement → screenshot again → compare → iterate.

## Definition of done

- A coherent new theme (color + type) the coach signs off on, applied across all
  4 tabs + the self-scout/defensive/print exports.
- Layout reads at a glance (KPI hero + card grid or equivalent), not a long
  table scroll. Numbers aligned (tabular).
- All cut-to-film wiring intact; all 136 e2e tests green; zero console errors.
- Bundle still self-contained/offline (no network calls, no external fonts/libs).
- Deploy: rebuild, then deploy to `gh-pages` (see CLAUDE.md "Deploy to GitHub
  Pages"), and bump `APP_VERSION` if shipping to web.
- Delete this brief.
