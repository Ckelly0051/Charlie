# Reports Section Handoff Prompts

> **DOCUMENT STATUS:** RETIRED ASSIGNMENT ARTIFACT. These September 3 prompts
> predate the current implementations and OLL live-data audit. Start new Reports
> work from `design-approvals/APPROVALS.json`, the owning current rationale,
> `docs/OPEN-DEFECTS.md`, and `docs/TESTING.md`.

Prepared 2026-09-03. Each fenced block is standalone; send one at a time. These are assignments, not blanket design approval. Check current status before starting. Overview/Offense are alignment checks, Defense is an approval-gated implementation handoff, and the remaining tabs are comp-first design work. Do not run these concurrently against shared Reports production files.

## Overview

```text
TASK: Reports Overview

Review Overview for shared-style alignment; do not redesign a tab already accepted as the model.
Start with OverviewTab and its child components in js/native-report-tabs.jsx, the header in js/native-report-kit.jsx, and the routing/scope handling in js/reports-screen.js.
Inventory snaps by phase, situational metrics, rushing, passing, yards by type, down/distance, game-plan content, big plays, drives, and defense/discipline wherever currently rendered. Preserve links to their exact film cohorts.
Check header/score alignment, labels, and scope behavior against the latest accepted shared Reports decisions. Score tracks must not be independently positioned by each team's name width.
Deliver a narrowly scoped alignment comp ONLY if a concrete mismatch requires one; otherwise deliver a short source-backed no-change assessment. Do not make speculative improvements or production changes. List any proposed header changes separately for Charlie's approval.

Follow CLAUDE.md, docs/TESTING.md, and the Reports direction in GRIDIRON-IQ-PLAN-V2.md. Read current source before assuming these saved instructions describe the latest state. Work on this tab only. Preserve unrelated changes. Do not turn this into an analytics expansion, global restyle, mobile redesign, or cleanup project.

Use the accepted Overview and implemented Offense visual language: shared typography, colors, table headers, module framing, spacing, and interaction states. Reuse established components and CSS owners. Density must come from composition, not smaller text. Do not copy known readability defects. No clipped text, nested decorative cards, excessive dead space, or page-level horizontal scrolling. Use bounded table scrolling only where necessary. Give interactive controls clear hover, focus-visible, and pointer states. Keep copy literal and concise.

Inventory every existing section, column, metric, control, scope, export, disclosure, and film action, including conditional states and child components. Record source-to-destination mapping in RATIONALE.md. Do not remove capabilities to make the layout fit. Preserve canonical formulas, football vocabulary, null/unknown semantics, sample thresholds, and gameId::playId film references. Do not invent metrics or fill missing data with zero.

Do not run or create harnesses or run the full gate in this assignment. Inspect the actual comp visually at 1920, 1440, and 1280 widths with populated, empty, sparse, and long-label states. Include every existing scope. Activate each section control before its screenshot and verify the intended content is visible; park the pointer. Document precisely what was and was not checked.

Commit only named task files, with the rationale and associated changes together. No push, version bump, installer, dependencies, or coach-data changes. Report commit, changed files, capability mapping, screenshots, open product decisions, and verification limits. Stop at the stated approval boundary.

STOP BOUNDARY: Comp or assessment only. Stop before production edits.
```

## Offense

```text
TASK: Reports Offense

Review Offense for alignment with the accepted Reports design, not a new redesign.
Start with OffenseTab and its child components in js/native-report-tabs.jsx. Preserve all six existing areas: offensive identity; calls and tendencies; structure and deployment; situational analysis; field and production; advanced metrics. Preserve every underlying table column, sample disclosure, EPA qualification, film action, and scope.
Use the accepted Offense comp and current production as the baseline. Inspect the latest recorded decision about section tabs versus continuous scrolling. Do not convert navigation merely because Defense uses tabs. A proposed conversion must retain every module and explicitly describe selection, scrolling, keyboard, and scope-change behavior.
Propose only the shared header/navigation alignment Charlie has actually approved. Keep team names readable and score columns structurally aligned.
Deliver an isolated alignment comp or a source-backed no-change assessment. No production edits without explicit approval.

Follow CLAUDE.md, docs/TESTING.md, and the Reports direction in GRIDIRON-IQ-PLAN-V2.md. Read current source before assuming these saved instructions describe the latest state. Work on this tab only. Preserve unrelated changes. Do not turn this into an analytics expansion, global restyle, mobile redesign, or cleanup project.

Use the accepted Overview and implemented Offense visual language: shared typography, colors, table headers, module framing, spacing, and interaction states. Reuse established components and CSS owners. Density must come from composition, not smaller text. Do not copy known readability defects. No clipped text, nested decorative cards, excessive dead space, or page-level horizontal scrolling. Use bounded table scrolling only where necessary. Give interactive controls clear hover, focus-visible, and pointer states. Keep copy literal and concise.

Inventory every existing section, column, metric, control, scope, export, disclosure, and film action, including conditional states and child components. Record source-to-destination mapping in RATIONALE.md. Do not remove capabilities to make the layout fit. Preserve canonical formulas, football vocabulary, null/unknown semantics, sample thresholds, and gameId::playId film references. Do not invent metrics or fill missing data with zero.

Do not run or create harnesses or run the full gate in this assignment. Inspect the actual comp visually at 1920, 1440, and 1280 widths with populated, empty, sparse, and long-label states. Include every existing scope. Activate each section control before its screenshot and verify the intended content is visible; park the pointer. Document precisely what was and was not checked.

Commit only named task files, with the rationale and associated changes together. No push, version bump, installer, dependencies, or coach-data changes. Report commit, changed files, capability mapping, screenshots, open product decisions, and verification limits. Stop at the stated approval boundary.

STOP BOUNDARY: Comp or assessment only. Stop before production edits.
```

## Defense

```text
TASK: Reports Defense

Finish the Defense handoff and implement only after confirming the outstanding product decisions.
Reference design-comps/reports-defense-2026-09-03/defense.html and RATIONALE.md, including corrections in 8a297dd. Check current history so you do not redo completed work.
Before editing production, confirm Charlie's approval of the comp AND the two cross-report decisions: section tabs versus continuous scrolling; linescore versus existing scorebug. If either remains unresolved, ask one concise question and wait. Do not treat a review recommendation as approval. Cross-report implementation is excluded unless explicitly authorized.
Once approved, implement the accepted composition in the existing Reports owners. Preserve DefenseTab, SchemeDetail, and DefensiveSelfScout capabilities. Place Disruption in Defensive performance and Scheme by situation beside Situational defense, subject to recorded approval.
Retain all nine Coverage columns including Yds, and Scheme by situation's Avg yds. Retain havoc value, sample context, and film action if the redundant arc is removed. All blitzes must use distinct blitz-tagged plays and canonical metrics, never sums of overlapping tag rows or hard-coded fixture values.
Correct the remaining rationale summary that lists Disruption under Situational results. Preserve scope, exports, recommendations, and film references.
For this production pass, run npm run build and git diff --check, plus manual scope, export, and representative film checks. No harnesses. Compare production screenshots against the approved comp.

Follow CLAUDE.md, docs/TESTING.md, and the Reports direction in GRIDIRON-IQ-PLAN-V2.md. Read current source before assuming these saved instructions describe the latest state. Work on this tab only. Preserve unrelated changes. Do not turn this into an analytics expansion, global restyle, mobile redesign, or cleanup project.

Use the accepted Overview and implemented Offense visual language: shared typography, colors, table headers, module framing, spacing, and interaction states. Reuse established components and CSS owners. Density must come from composition, not smaller text. Do not copy known readability defects. No clipped text, nested decorative cards, excessive dead space, or page-level horizontal scrolling. Use bounded table scrolling only where necessary. Give interactive controls clear hover, focus-visible, and pointer states. Keep copy literal and concise.

Inventory every existing section, column, metric, control, scope, export, disclosure, and film action, including conditional states and child components. Record source-to-destination mapping in RATIONALE.md. Do not remove capabilities to make the layout fit. Preserve canonical formulas, football vocabulary, null/unknown semantics, sample thresholds, and gameId::playId film references. Do not invent metrics or fill missing data with zero.

Do not run or create harnesses or run the full gate in this assignment. Inspect the actual comp visually at 1920, 1440, and 1280 widths with populated, empty, sparse, and long-label states. Include every existing scope. Activate each section control before its screenshot and verify the intended content is visible; park the pointer. Document precisely what was and was not checked.

Commit only named task files, with the rationale and associated changes together. No push, version bump, installer, dependencies, or coach-data changes. Report commit, changed files, capability mapping, screenshots, open product decisions, and verification limits. Stop at the stated approval boundary.

STOP BOUNDARY: Approval check first; then authorized implementation only. Commit and stop for review.
```

## Special Teams

```text
TASK: Reports Special Teams

Create the desktop Special Teams design comp, not the production implementation.
Start with SpecialTeamsTab and every helper it calls, its scope model in js/reports-screen.js, and GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md. Inventory the live phase/unit breakdowns and every metric before drawing the layout.
Compose the report around the existing special-teams units, keeping kickoff distinct from kick return, punt from punt return, and scoring kicks/tries from their defensive counterparts wherever the model supports them. Do not combine unlike opportunities into an invented success rate.
Retain current-game/full-season behavior, sample counts, distance/result breakdowns, scoring outcomes, penalties, and film actions wherever currently available. Empty units must not look like zero performance. Distinguish kick distance, return yards, and net yards according to existing definitions.
Use shared Reports styling without forcing Offense's six-zone structure or Defense's eight KPIs onto this tab. Propose a compact unit navigation only if needed and record the decision explicitly.
Build fixtures using valid existing tags, with plausible linked outcomes and reconciled denominators. Cover a populated game, season, one populated unit, and no special-teams snaps.
Create a dedicated design-comps/reports-special-teams-<date>/ folder containing the comp, rationale, and captures.

Follow CLAUDE.md, docs/TESTING.md, and the Reports direction in GRIDIRON-IQ-PLAN-V2.md. Read current source before assuming these saved instructions describe the latest state. Work on this tab only. Preserve unrelated changes. Do not turn this into an analytics expansion, global restyle, mobile redesign, or cleanup project.

Use the accepted Overview and implemented Offense visual language: shared typography, colors, table headers, module framing, spacing, and interaction states. Reuse established components and CSS owners. Density must come from composition, not smaller text. Do not copy known readability defects. No clipped text, nested decorative cards, excessive dead space, or page-level horizontal scrolling. Use bounded table scrolling only where necessary. Give interactive controls clear hover, focus-visible, and pointer states. Keep copy literal and concise.

Inventory every existing section, column, metric, control, scope, export, disclosure, and film action, including conditional states and child components. Record source-to-destination mapping in RATIONALE.md. Do not remove capabilities to make the layout fit. Preserve canonical formulas, football vocabulary, null/unknown semantics, sample thresholds, and gameId::playId film references. Do not invent metrics or fill missing data with zero.

Do not run or create harnesses or run the full gate in this assignment. Inspect the actual comp visually at 1920, 1440, and 1280 widths with populated, empty, sparse, and long-label states. Include every existing scope. Activate each section control before its screenshot and verify the intended content is visible; park the pointer. Document precisely what was and was not checked.

Commit only named task files, with the rationale and associated changes together. No push, version bump, installer, dependencies, or coach-data changes. Report commit, changed files, capability mapping, screenshots, open product decisions, and verification limits. Stop at the stated approval boundary.

STOP BOUNDARY: Comp only. No production files. Stop for Charlie's approval.
```
## Players

```text
TASK: Reports Players

Create the desktop Players report design comp, not the production implementation.
Start with PlayersTab, every child component, and its source model/controller. Inventory all existing player roles, stat columns, grades, filters, sorting, roster links, exports, and film actions. Do not add rankings or scouting scores.
Keep each existing statistical role distinct. Do not merge passing, rushing, receiving, defense, or grading denominators. Include only categories production actually supports; unsupported categories are not this task.
Give player identity a stable column with room for jersey number and long names. Align numeric columns for fast comparison. Preserve current sorting semantics and make any existing selected player/filter state visible. Avoid wide decorative profile cards that reduce usable table space.
Show missing attribution or grades honestly; do not turn uncharted participation into zero snaps or zero ability. Preserve exact player-associated film cohorts, including shared-credit plays.
Create realistic fixtures with multiple players, long names, sparse attribution, and an empty state. Do not use real coach data.
Create design-comps/reports-players-<date>/ with the comp, capability mapping, copy changes, rationale, and captures.

Follow CLAUDE.md, docs/TESTING.md, and the Reports direction in GRIDIRON-IQ-PLAN-V2.md. Read current source before assuming these saved instructions describe the latest state. Work on this tab only. Preserve unrelated changes. Do not turn this into an analytics expansion, global restyle, mobile redesign, or cleanup project.

Use the accepted Overview and implemented Offense visual language: shared typography, colors, table headers, module framing, spacing, and interaction states. Reuse established components and CSS owners. Density must come from composition, not smaller text. Do not copy known readability defects. No clipped text, nested decorative cards, excessive dead space, or page-level horizontal scrolling. Use bounded table scrolling only where necessary. Give interactive controls clear hover, focus-visible, and pointer states. Keep copy literal and concise.

Inventory every existing section, column, metric, control, scope, export, disclosure, and film action, including conditional states and child components. Record source-to-destination mapping in RATIONALE.md. Do not remove capabilities to make the layout fit. Preserve canonical formulas, football vocabulary, null/unknown semantics, sample thresholds, and gameId::playId film references. Do not invent metrics or fill missing data with zero.

Do not run or create harnesses or run the full gate in this assignment. Inspect the actual comp visually at 1920, 1440, and 1280 widths with populated, empty, sparse, and long-label states. Include every existing scope. Activate each section control before its screenshot and verify the intended content is visible; park the pointer. Document precisely what was and was not checked.

Commit only named task files, with the rationale and associated changes together. No push, version bump, installer, dependencies, or coach-data changes. Report commit, changed files, capability mapping, screenshots, open product decisions, and verification limits. Stop at the stated approval boundary.

STOP BOUNDARY: Comp only. No production files. Stop for Charlie's approval.
```

## Self-Scout

```text
TASK: Reports Self-Scout

Create the desktop Self-Scout report design comp, not the production implementation.
Start with SelfScoutTab, SelfScoutDefense, and the split-table, tells, personnel-diversity, and predictability helpers. Inventory every conditional component.
Preserve performance context separately from tendencies: top tells, recommendations, situational performance, call/concept performance, negative/explosive plays, formation/personnel breakdowns, personnel-to-formation relationships, predictability map/index, film-room insights, and defensive self-scout wherever currently supported.
Do not equate predictable with ineffective. Show frequency, sample size, and outcome together where production provides them. Preserve existing qualification thresholds and assessment meanings. Do not invent recommendation logic or rewrite generated analytical conclusions in a presentation-only task.
Use literal section headings. Avoid conversational framing such as 'what the huddle gives away.' Record proposed copy substitutions and distinguish presentation labels from engine-generated text.
Cover offensive-only, defensive-only, both, insufficient sample, and empty states. Keep all film actions tied to the exact qualifying plays.
Create design-comps/reports-self-scout-<date>/ containing the comp, mapping, rationale, and captures.

Follow CLAUDE.md, docs/TESTING.md, and the Reports direction in GRIDIRON-IQ-PLAN-V2.md. Read current source before assuming these saved instructions describe the latest state. Work on this tab only. Preserve unrelated changes. Do not turn this into an analytics expansion, global restyle, mobile redesign, or cleanup project.

Use the accepted Overview and implemented Offense visual language: shared typography, colors, table headers, module framing, spacing, and interaction states. Reuse established components and CSS owners. Density must come from composition, not smaller text. Do not copy known readability defects. No clipped text, nested decorative cards, excessive dead space, or page-level horizontal scrolling. Use bounded table scrolling only where necessary. Give interactive controls clear hover, focus-visible, and pointer states. Keep copy literal and concise.

Inventory every existing section, column, metric, control, scope, export, disclosure, and film action, including conditional states and child components. Record source-to-destination mapping in RATIONALE.md. Do not remove capabilities to make the layout fit. Preserve canonical formulas, football vocabulary, null/unknown semantics, sample thresholds, and gameId::playId film references. Do not invent metrics or fill missing data with zero.

Do not run or create harnesses or run the full gate in this assignment. Inspect the actual comp visually at 1920, 1440, and 1280 widths with populated, empty, sparse, and long-label states. Include every existing scope. Activate each section control before its screenshot and verify the intended content is visible; park the pointer. Document precisely what was and was not checked.

Commit only named task files, with the rationale and associated changes together. No push, version bump, installer, dependencies, or coach-data changes. Report commit, changed files, capability mapping, screenshots, open product decisions, and verification limits. Stop at the stated approval boundary.

STOP BOUNDARY: Comp only. No production files. Stop for Charlie's approval.
```

## Season

```text
TASK: Reports Season

Create the desktop Season report design comp, not the production implementation.
Start with SeasonTab and its complete child tree and model in js/reports-screen.js. Identify any reused Overview or other tab components: document the dependency, but do not restyle their other consumers.
Preserve all existing season totals, per-game trends, game log, comparisons, scope behavior, exports, and film actions. Do not add standings, forecasting, or unsupported averages.
Game sequences must read oldest to newest by actual date, including preseason and scrimmages. Do not sort lexically by week labels. Inspect the existing sort contract and document unknown-date/tied-date handling; flag a behavioral change separately instead of hiding it in the design.
Distinguish season totals from per-game or per-play rates. Never average game percentages when production uses a pooled denominator. Distinguish uncharted games from zero production.
Design for one game, many games, long opponent names, mixed charting completeness, and an empty season. Trend labels must remain readable; do not compress a season into illegible mini-bars.
Create design-comps/reports-season-<date>/ with the comp, capability mapping, rationale, and captures.

Follow CLAUDE.md, docs/TESTING.md, and the Reports direction in GRIDIRON-IQ-PLAN-V2.md. Read current source before assuming these saved instructions describe the latest state. Work on this tab only. Preserve unrelated changes. Do not turn this into an analytics expansion, global restyle, mobile redesign, or cleanup project.

Use the accepted Overview and implemented Offense visual language: shared typography, colors, table headers, module framing, spacing, and interaction states. Reuse established components and CSS owners. Density must come from composition, not smaller text. Do not copy known readability defects. No clipped text, nested decorative cards, excessive dead space, or page-level horizontal scrolling. Use bounded table scrolling only where necessary. Give interactive controls clear hover, focus-visible, and pointer states. Keep copy literal and concise.

Inventory every existing section, column, metric, control, scope, export, disclosure, and film action, including conditional states and child components. Record source-to-destination mapping in RATIONALE.md. Do not remove capabilities to make the layout fit. Preserve canonical formulas, football vocabulary, null/unknown semantics, sample thresholds, and gameId::playId film references. Do not invent metrics or fill missing data with zero.

Do not run or create harnesses or run the full gate in this assignment. Inspect the actual comp visually at 1920, 1440, and 1280 widths with populated, empty, sparse, and long-label states. Include every existing scope. Activate each section control before its screenshot and verify the intended content is visible; park the pointer. Document precisely what was and was not checked.

Commit only named task files, with the rationale and associated changes together. No push, version bump, installer, dependencies, or coach-data changes. Report commit, changed files, capability mapping, screenshots, open product decisions, and verification limits. Stop at the stated approval boundary.

STOP BOUNDARY: Comp only. No production files. Stop for Charlie's approval.
```

## Matchup

```text
TASK: Reports Matchup

Create the desktop Matchup report design comp, not the production implementation.
Start with MatchupTab, MatchupOffense, MatchupDefense, and the opponent/lane model in js/reports-screen.js. Inventory selectors, lane availability, evidence, sample labels, exports, and film actions.
Preserve both supported comparisons: our offense versus their defense; our defense versus their offense. Never compare offense against offense merely to create symmetric columns.
Make team identity, phase, source scope, and sample size unambiguous in each lane. Opponent-scout film is not our season performance. Preserve the existing separation and correct gameId::playId references.
Use aligned metric rows only when definitions and denominators are comparable. Do not invent advantage scores, predictions, winner badges, or scouting conclusions.
Design complete, one-sided, sparse-opponent, no-opponent, and long-name states. Explain missing data with concise factual labels rather than filling absent lanes with zero. Keep existing opponent selection and film navigation discoverable.
Create design-comps/reports-matchup-<date>/ containing the comp, complete mapping, rationale, and captures.

Follow CLAUDE.md, docs/TESTING.md, and the Reports direction in GRIDIRON-IQ-PLAN-V2.md. Read current source before assuming these saved instructions describe the latest state. Work on this tab only. Preserve unrelated changes. Do not turn this into an analytics expansion, global restyle, mobile redesign, or cleanup project.

Use the accepted Overview and implemented Offense visual language: shared typography, colors, table headers, module framing, spacing, and interaction states. Reuse established components and CSS owners. Density must come from composition, not smaller text. Do not copy known readability defects. No clipped text, nested decorative cards, excessive dead space, or page-level horizontal scrolling. Use bounded table scrolling only where necessary. Give interactive controls clear hover, focus-visible, and pointer states. Keep copy literal and concise.

Inventory every existing section, column, metric, control, scope, export, disclosure, and film action, including conditional states and child components. Record source-to-destination mapping in RATIONALE.md. Do not remove capabilities to make the layout fit. Preserve canonical formulas, football vocabulary, null/unknown semantics, sample thresholds, and gameId::playId film references. Do not invent metrics or fill missing data with zero.

Do not run or create harnesses or run the full gate in this assignment. Inspect the actual comp visually at 1920, 1440, and 1280 widths with populated, empty, sparse, and long-label states. Include every existing scope. Activate each section control before its screenshot and verify the intended content is visible; park the pointer. Document precisely what was and was not checked.

Commit only named task files, with the rationale and associated changes together. No push, version bump, installer, dependencies, or coach-data changes. Report commit, changed files, capability mapping, screenshots, open product decisions, and verification limits. Stop at the stated approval boundary.

STOP BOUNDARY: Comp only. No production files. Stop for Charlie's approval.
```
