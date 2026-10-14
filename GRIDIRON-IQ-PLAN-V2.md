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
- **The web version never limits the apps** (coach, 2026-10-13). The browser
  build stays, but the desktop app and the eventual mobile app are never
  compromised because a browser cannot support a feature. Such a feature is
  built natively, and the web version shows it as unavailable rather than
  broken.
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
   2026-10-06), and the stranded legacy DOM layer is removed (2026-10-07,
   enforced by `e2e-stranded-code`). Remaining: new charting fields. Each
   ships with its charting and a Study dimension (registered in
   `AnalyticsRegistry`, film-linked, with its sample); its Reports come in
   step 5, after the rebuild (coach, 2026-10-06):
     - pass target and catch location: field side and depth of target and
       catch, separate from total gain, never inferred from play direction;
     - receiver route and release, tied to the identified receiver;
     - the two receiver fields above follow the missed-tackles pattern (coach,
       2026-10-13): charting first, their Reports in step 5. They are granular
       and slow to chart for what they give, so charting is likely best as a
       visual (marking the field) and their reports need a visual to be
       readable. Research done and design decided (coach, 2026-10-13;
       `docs/RECEIVER-CHARTING-RESEARCH-PROPOSAL.md` > Decisions): the
       identified target only; route from the standard list; release Inside
       or Outside judged against the hash; target and catch in nine zones
       (Left/Middle/Right by Short/Medium/Deep); inline under the Receiver row;
       route paths tabled. Comp: `design-comps/receiver-charting-2026-10-13`.
       Comp approved 2026-10-14. Route/release and their sampled, film-linked
       Study dimensions are built in source; release verification is pending.
       The receiver editor already uses the approved composition. Next:
       the full-deck polish comp below; Target/Catch remains checkpoint 2;
     - **Chart deck polish** (coach, 2026-10-14), right after receiver route
       and release: bring the whole Chart deck to the receiver comp's
       composition. Same font and sizes; the change is layout: each closed
       section shows its value as a right-aligned summary and only the
       section being worked opens; chips sized to their text and
       left-aligned, replacing the fixed four-column library grid
       (`css/native-tagging.css` `.gi-tag-chips.is-library`); plain text
       instead of boxes for read-only values such as player names and
       "Not charted". First a full-deck comp that keeps every real control
       (transport, Clear tags, Save, top-bar tools) on real season data for
       the coach's approval; then one migration across the whole deck, never
       half-restyled. Section behavior settled 2026-10-14: new/blank plays
       open Situation; existing-play navigation retains the working section
       when available. Edits, shortcuts, saves and refreshes never close it
       while the coach stays on that play. Shortcuts update closed summaries
       and briefly announce the changed field without opening another section.
       Only deliberate section navigation changes the open section. Comp and
       checklist mapping: `design-comps/chart-deck-polish-2026-10-14/RATIONALE.md`;
       full comp is COMP_APPROVED by the coach (2026-10-14), including the
       tightened section-entry spacing. Authority:
       `design-approvals/chart-deck-polish/manifest.json`. Production is not
       built; next is the whole-deck presentation migration, followed by
       release verification and installed smoke. Acceptance checklist (coach's installed screenshot,
       2026-10-14), each fixed explicitly:
       - one chip system: no fixed four-column centered grid beside
         text-sized chips (Formation and Backfield versus Personnel, QB
         Alignment, Down);
       - labels and controls share rows: Quarter/Down/Distance and
         Hash/Field position/Yard line/Drive start on one baseline;
       - one level of borders: no outer deck frame around banded,
         bordered section headers, and no second scrollbar inside the deck;
       - one disclosure pattern: every caret in the same place (no left
         caret on Play Call alone, no far-right section carets), and
         "Edit library" in the same position on every field;
       - consistent controls in the deck header row (Same as Last,
         Templates, Delete play);
       - no placeholder instructions ("e.g. 26 Blast"), no disabled Save
         wedged between Skip and Save & Next, no arrow on Previous;
       - closed sections show summaries and one section is open, so a play
         is not several screens of chips;
     - missed tackles: a play-level event plus optional player attribution,
       more than one player per play; uncharted is not zero. Built
       2026-10-07, coach-smoked in `1.12.0-113` on 2026-10-09 with the
       unrelated scrubbing defect deferred; charting contract in `GRIDIRON-IQ-TAG-MODEL.md` §3a.
       Exception to step 5 (coach, 2026-10-07): defensive missed tackles get
       Reports now, in the Defense, Players (an added column) and Season tabs,
       each from its own comp; offense and Special Teams reports wait.

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
   The `js/stats-engine.js` split by area is part of this rebuild, not a
   separate restructure (coach, 2026-10-10): migrating each table off its
   hand-built grouping is what breaks the file up.
   A coach can add a module built in Dashboards to an existing report (coach,
   2026-10-10): for example, a defensive coach builds one and saves it to the
   Defense report, and every later view of that report includes it. The
   approved sections stay as they are; added modules are the coach's own.
   Play renumbering after a deleted play (the play strip skips the number)
   is paired with this work, not built alone (coach, 2026-10-06): a play's
   number is its film reference, so renumbering rewrites Plan links and
   needs an impact report and confirmation.
   The conventional two-team box score is built inside the rebuild (coach,
   2026-10-13): score by quarter, first downs, rushing/passing/total yards,
   completions/attempts, turnovers and penalties, each from the registry and
   reconciled with the detailed reports, which makes it an acceptance check for
   the rebuild; unsupported categories are absent. The rebuild also registers
   drive-level measures over the one drive grouping (`football-rules.js`) for
   step 4.
4. **Interactive drive chart**, right after the rebuild and on it (coach,
   2026-10-13): every possession in order with start/end field position, play
   count, outcome, points, and rushing/passing/penalty yards; selecting a drive
   opens exactly that drive's film; incomplete charting is disclosed, not
   inferred. It exposes its sample and matches the drive measures.
5. **Reports for every charted field.** Audit every charted field against
   Reports, then add the missing reports. Known gaps: motion start/end, RPO
   read and Give/Keep/Throw decision, QB-run type (designed / scramble / RPO
   keeper), and the step 2 fields (pass target and catch location, route and
   release, missed tackles). Each report reuses the analytics registry, shows its eligible
   sample and opens exact film; no parallel formulas.
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

**Dashboards** (saved composable reports; outside the sequence, separate from
the reporting rebuild, coach 2026-10-12): registered dimensions and approved
measures with filters, scope and perspective, saved and rerun as games are
charted; Study stays the query engine. Rev 1 built 2026-10-10 as Reports >
Dashboards (`docs/REPORTS-CONTRACTS.md`). Rev 2, a small rework after smoke 116
findings 1-3: a canvas the coach fills through the module picker, each module
with its own unit, games, filters, measure and view, so offense yards per play
can sit beside defense yards per play; Open and Edit, and every action on the
picker page. Rev 2 is packaged in 117; installed smoke passed with the coach's
approval on 2026-10-14
(`SMOKE-1.12.0-117.md`). Opponent perspective comes with the rebuild.

**Legacy excision and platform lane** (coach, 2026-09-25 and 2026-10-13; not
yet placed in the sequence). The goal is to remove the original browser-first
structure because it restricts the apps. History and per-pass evidence:
`docs/archive/plans/LEGACY-EXCISION-PLAN.md` and
`docs/archive/plans/GRIDIRON-IQ-PERSISTENCE-CONVERGENCE-PLAN.md`.

Done:
- Persistence convergence (2026-08): the SQLite catalog is the only live
  desktop store; JSON files are recovery and export snapshots only.
- Excision Passes 0-2b (2026-09-25..27): dead code and duplicate rules
  removed, the UI-state fields out of the charting model, the live seasons
  converted once and every old-format reader deleted, old settings keys and
  storage layouts converted or retired.
- `window.app` reach-through and raw `innerHTML` screens (Codex job,
  2026-10-12): only the App global itself, which harnesses use, and the
  parked OCR feature remain.

Remaining, in this order:
1. Settings, the library root and approved film folders out of localStorage
   (86 calls) into the catalog or a desktop settings file (excision Pass 3).
2. Native SQLite in place of sql.js's whole-file catalog saves.
3. The four storage layers (`storage.js`, `storage-backend.js`,
   `season-store.js`, the catalog) consolidated.
4. The browser backend kept as its own lighter path behind `StorageBackend`,
   allowed to lack desktop features.
The `stats-engine.js` split belongs to the reporting rebuild (step 3 above).

Guardrails, carried from the excision:
- Characterize before cutting: `e2e-parity`, `e2e-legacy-roundtrip` and the
  `e2e-legacy-inventory` ratchet stay green; a change meant to look the same
  shows no difference in `node tools/compare-builds.mjs <rev>`.
- Strangler, never big bang: build the new owner, move one consumer per
  commit, delete the old path once nothing uses it.
- Each step ends shippable, and any parity diff, unintended screenshot diff
  or change to coach data stops the step for a report.
- Steps 1-3 touch coach data: impact report with exact counts on a read-only
  copy, a restore point, and the coach's confirmation immediately before any
  write.

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
