# GridIron IQ Plan V2

The forward roadmap. Release state lives in `docs/DOCUMENTATION-INDEX.md`, open
findings in `docs/OPEN-DEFECTS.md`, and binding rules in `CLAUDE.md`. Completed
milestones, checkpoints and their history through 2026-10-04 are in
`docs/archive/plans/GRIDIRON-IQ-PLAN-V2-THROUGH-2026-10-04.md`.

This document records product direction. It does not authorize modifying,
migrating or deleting coach data.

## 1. Product goal

GridIron IQ should feel like one coherent coaching workspace. It prioritizes
trust, clarity, speed and football depth, and never reduces charting or
analytics to make the interface look simpler.

The defining standard is **visible truth**: the app always makes its current
team, season, game, scout perspective, save state, film source and storage
health understandable to the coach.

## 2. Principles

- Local-first and fully useful without a cloud subscription.
- Video-first; nothing obscures film.
- Organized around the coach's jobs: connect film, chart, study, plan.
- Consumer-product presentation; functional-but-ugly is not an end state.
- Every analytical result traces to its exact film.
- Deep, football-correct charting; optional fields stay optional.
- Coach-controlled vocabulary and workflows.
- Desktop-first full workflow; mobile is a focused companion.
- Known-bad data is never migrated for parity; destructive changes need an
  explanation and coach confirmation.
- **Anything charted has a report** (coach, 2026-10-04). A field the coach
  charts is visible in Reports with its sample and film, not only queryable in
  Study. Time-limited exception (coach, 2026-10-06): fields added before the
  reporting rebuild (step 3) ship with charting and a Study dimension, and get
  their Reports in the rebuild, so no report is built twice.
- **Organize before building** (coach, 2026-10-04). No new feature starts while
  significant dead code, stale docs or repair-history clutter remain.

## 3. Standing rules carried from earlier milestones

**Dependency retirement.** New work must not deepen dependence on obsolete
infrastructure. Hidden DOM owners, click proxies, duplicate route
implementations, production compatibility globals and competing context
pointers are obsolete. When a feature touches one, replace it with an explicit
service or state API and remove the old path in the same checkpoint. A
temporary parallel implementation needs its removal checkpoint in the same
milestone. Age alone is not a reason to delete proven football rules, analytics,
video or persistence services.

**Presentation.** Approved comps govern composition, geometry, hierarchy,
density and treatment; recoloring does not satisfy one. Every visual checkpoint
gets a Charlie Gate on the real app with real data before expensive review or
packaging. Interaction states, copy, typography and density rules are binding in
`CLAUDE.md` and `docs/VISUAL-SYSTEM-RULES.md`; Home in `docs/HOME-CONTRACTS.md`;
Reports in `docs/REPORTS-CONTRACTS.md`.

## 4. Completed baseline

V2-A Home and context, V2-B setup/team/film/scouting, V2-E configurable
charting, V2-F Study, V2-G Plan and V2-H playback and large-game performance are
complete. The Break Down charting cutover (Formation/Receiver Set, Gap, motion
start/end, RPO read/decision, QB-run type, Reverse; one season format) and the
Break Down visual finish shipped in `1.12.0-108`, smoked 2026-10-01. The
down-and-distance chart and run-gap chart are built. `1.12.0-111` (smoked
2026-10-06) shipped the Break Down cleanup (`design-comps/breakdown-cleanup-2026-10-05`),
Mark as Final in Game settings, Run/Pass deciding run and pass statistics,
failed saves that roll back only their own season, game or program, and
"Saved" shown only after a write lands.

## 5. Sequence

1. **Organize.** Clear dead code, stale docs and accumulated artifacts before
   any new feature (done 2026-10-04):
   - finished plans and old smoke records moved to `docs/archive/` (done
     2026-10-04);
   - real-data harness captures replaced each run instead of accumulating
     (done 2026-10-04);
   - repair history removed from code comments across `js/`, proven by
     byte-identical bundles (done 2026-10-04);
   - unused functions, CSS and the silent startup import deleted with
     focused tests (done 2026-10-04);
   - domain-model docs (`GRIDIRON-IQ-TAG-MODEL.md`,
     `GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md`) rewritten from the current code as
     short contracts, history archived (2026-10-04; Codex approved).
2. **Finish charting first** (coach, 2026-10-05). Get charting as close to
   finished as possible before any reporting work, because the next reporting
   step is a full rebuild (below) and should be built once against the final
   charted fields. The Break Down cleanup is done (`1.12.0-111`, smoke passed
   2026-10-06). Remaining, in order:
   - LG-1: plays created without a unit;
   - removing the stranded legacy DOM layer found in the 2026-10-06 code review;
   - new charting fields. Each ships with its charting and a Study dimension
     (registered in `AnalyticsRegistry`, film-linked, with its sample); its
     Reports come in step 4, after the rebuild (coach, 2026-10-06):
     - pass target and catch location: field side and depth of target and
       catch, separate from total gain, never inferred from play direction;
     - receiver route and release, tied to the identified receiver;
     - missed tackles: a play-level event plus optional player attribution,
       more than one player per play; uncharted is not zero.

     New fields stay optional on historical plays; uncharted is missing, not
     zero.
3. **Reporting rebuild on the registry** (agreed in principle 2026-10-05,
   deferred until charting is done). Reports today hand-build each table with
   its own grouping function in `stats-engine.js` and its own markup, so a new
   field or rule means rebuilding reports (the 2026-10-05 Run/Pass repair
   touched about 15 copies of the same run/pass counting). Instead: one generic
   breakdown module (dimension, measures, sort, minimum sample) fed by
   `AnalyticsRegistry` and `StudyQuery`, report sections as short specs inside
   the approved layouts, existing tables migrated one at a time with
   `e2e-parity` and the real-data numbers unchanged, and new tag-library
   fields registering their dimension. Approved fixed schemas stay fixed
   until the coach changes them. Plan for Codex review before any build.
4. **Reports for every charted field.** Audit every charted field against
   Reports, then add the missing reports. Known gaps: motion start/end, RPO
   read and Give/Keep/Throw decision, QB-run type (designed / scramble / RPO
   keeper), and the step 2 fields (pass target and catch location, route and
   release, missed tackles). Each report reuses the analytics registry, shows its eligible
   sample and opens exact film; no parallel formulas.
5. **Reporting expansion** (each must expose its sample, match its table and
   open its film):
   - interactive drive chart: every possession in order with start/end field
     position, play count, outcome, points, and rushing/passing/penalty yards;
     selecting a drive opens exactly that drive's film; incomplete charting is
     disclosed, not inferred;
   - conventional two-team box score: score by quarter, first downs,
     rushing/passing/total yards, completions/attempts, turnovers, penalties,
     each reconciled with the detailed reports; unsupported categories absent;
   - saved composable reports: registered dimensions and approved measures with
     filters, scope and perspective, saved and rerun as games are charted.
     Study stays the query engine.
6. **Coach-owned AI analysis exchange.** Export a versioned season analysis pack
   (one row per play, stable `gameId::playId`, charted fields, data dictionary;
   no video, film paths or player identities by default). Then optionally
   import a schema-validated game-plan draft, previewed and coach-approved;
   imported text never overwrites charted data.
7. **AI recognition (parked 2026-10-02).** Coach-reviewed suggestions to reduce
   charting clicks. Plan, film reality and decisions:
   `docs/AI-RECOGNITION-PLAN.md`. Not approved or started.
8. **V2-I mobile companion**, after the desktop charting and reporting contract
   is competitive: fast single-column charting with large targets, separate
   Review and Study views, clear film-source and save status, desktop-only
   storage operations explained rather than shown broken. Cloud sync and
   multi-user collaboration are separate future products.

**Functional beta acceptance** requires a cold-start Assistant Coach Test on a
clean Windows profile with no fixture data and no verbal help: install, choose
the workspace, create the football context, connect film, chart one play, find
it in Reports or Study, close and reopen, and confirm data and film. Any
question that needs the builder to explain is a UX finding.

Ship each lane in independently reviewable increments. Never mix a data
migration, navigation rewrite and visual redesign in one checkpoint.

## 6. Release and review rules

- One builder and one independent reviewer per increment.
- A failing-first regression for every repaired defect.
- Analytics changes pass parity and exact film-reference equality.
- Storage changes are tested against real linked and managed film, including
  restart and failed-save behavior.
- UI acceptance includes desktop and mobile screenshots, keyboard behavior,
  overflow checks and an installed-app smoke.
- Docs and the handoff are updated before the baton passes.
- No release is cut from an incomplete or partially reviewed lane.

## 7. Definition of done

Plan V2 is complete when a coach can:

1. Launch the app and understand where seasons, backups and film live.
2. Open any game through any route and get the same workspace and context.
3. Confirm the exact source of the film playing.
4. Diagnose and repair missing clips without risking tags or duplicating film.
5. Configure charting vocabulary without losing analytical depth.
6. Move from charting to analysis to a plan, every conclusion traceable to film.
7. Trust that saves, failures, migrations and cleanup are visible and
   recoverable.
