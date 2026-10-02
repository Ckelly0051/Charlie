# GridIron IQ Documentation Index

> **Status:** CURRENT AUTHORITY MAP. Updated 2026-09-30.

## Current Authority

- `CLAUDE.md` - binding rules, owners and process (always loaded; kept short).
- `docs/REPORTS-CONTRACTS.md` and `docs/HOME-CONTRACTS.md` - current Reports
  and Home rules, read when touching those surfaces.
- `AGENTS.md` - current architecture and module map.
- `GRIDIRON-IQ-PLAN-V2.md` - active product roadmap and accepted decisions.
- `docs/OPEN-DEFECTS.md` - canonical index of unresolved defects.
- `docs/TESTING.md` - testing tiers and execution rules.
- `docs/AI-RECOGNITION-PLAN.md` - AI recognition proposal: competitor landscape, current assets, phased plan (not approved).
- `docs/VISUAL-SYSTEM-RULES.md` - coach-approved shared palette, typography,
  navigation, selector, and static-dashboard composition rules.
- `TAURI.md` - desktop build, packaging, and installed-smoke requirements.
- `design-approvals/APPROVALS.json` plus per-surface manifests - design and
  production acceptance status.
- `GRIDIRON-IQ-AGENT-WORKING-AGREEMENT.md` and
  `GRIDIRON-IQ-TRUSTED-ADVISOR-STANDARD.md` - standing collaboration rules.
- `GRIDIRON-IQ-TAG-MODEL.md`, `GRIDIRON-IQ-PENALTY-MODEL.md`,
  `GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md`, `GRIDIRON-IQ-PLAY-CALL-MODEL.md`,
  `GRIDIRON-IQ-WORKSPACE-CONTRACT.md`, and `GRIDIRON-IQ-OVERLAY-SPEC.md` -
  binding domain and interaction contracts. Their historical milestone notes do
  not override the Current Snapshot below or the defect index.
- `GRIDIRON-IQ-RELEASE-GATE.md` and
  `GRIDIRON-IQ-MILESTONE-RELEASE-POLICY.md` - standing release controls.

## Current Snapshot

This section is the one place release state is kept current.

- **Latest built and coach-smoked installer: `1.12.0-108`** (2026-10-01). It packages the Break
  Down visual finish (BD-UX-1/2) and the S107-2 through S107-7 source repairs.
  Full gate 141/141 green, zero skipped and zero failed, at `0163da45`.
  Version-only bump `05ec6615`, with `e2e-p0-exit` 19/19 after it.
  Unsigned NSIS:
  `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-108_x64-setup.exe`
  (4,041,437 bytes), SHA-256
  `DA6C40A96A553881FFD96A9A6215E6F1CE25DD6FA56BDF3C3FD83FC0F24A2E77`.
  Product and file version `1.12.0-108`. **Installed smoke passed on coach
  approval, 2026-10-01** (`SMOKE-1.12.0-108.md`); it supersedes `1.12.0-107`
  and `1.12.0-106`. BD-UX-1/2 and S107-2..7 are closed. The working branch is
  pushed to GitHub; nothing is tagged or published.

- 2026-10-01: Break Down visual finish (BD-UX-1, BD-UX-2): shipped in
  `1.12.0-108`; installed smoke passed. Program, Season and Game are the shared
  two-line control on Break Down, in a 36px row (coach's choice over the comp's
  49px, 2026-10-01; it also keeps the film floors), and are
  now also available below 901px. The three menus share one titled pattern with
  a checked current row and gold commands. The deck has one label-row rhythm,
  Gap is a plain field on the inset, and an off-library stored value is read in
  full. Recorded deviations from the supplemental comp are in
  `docs/OPEN-DEFECTS.md`. `e2e-breakdown-visual-finish` 30/30 plus 26 focused
  harnesses and parity green.

- 2026-10-01: S107-7 kickoff strip grouping repaired; shipped in `1.12.0-108`.
  Review follow-up also fixes numbered-kick ownership: explicit numbers win over
  automatic boundary/scoring grouping and never borrow a mismatched drive's side.
  Half-ending kicks and return-TD/try sequences stay separate from the following
  drive. Blank kickoff drive assignment is a bounded read-only grouping, never
  a stored-data rewrite. Exact live Week 1 43/44 and 2026 JV OLL 40/41 cases
  verified with unchanged catalog hash. Smoke passed in `1.12.0-108`.

- S107-5 Overview total-turnover tile repaired; shipped in `1.12.0-108`. NDP now
  reads 1, with the redundant subtext removed; ST losses are included explicitly.
  S107-6 college sack accounting also repaired and shipped in `1.12.0-108`:
  passer/team rushing attempts and losses, no pass attempt or passing yards.
  Sack attribution uses only the charted Passer, regardless of roster position.
  Independent live/canonical proof passes 437/437, catalog unchanged. Live
  2025 JV: 191 passing yards / 24 attempts / 8.0 YPA, 866 rushing yards / 148
  attempts. Previous audit passing-yard figures use the superseded net-of-sacks
  convention. Smoke passed in `1.12.0-108`.

- 2026-09-30 source repairs: S107-2 passing attempts, S107-3 assigned-drive
  grouping and S107-4 independent Gap/Direction. Focused regression suites and
  4,344 independent arithmetic checks pass; coach catalog unchanged. Not in
  `1.12.0-107`; shipped and smoke-passed in `1.12.0-108`.

- Coach authorized the final gate and packaging on 2026-09-30. Full gate at
  `a449b59e`: **140/140 green, zero skipped, zero failed** after conversion and
  temporary-code cleanup. All four version owners now read `1.12.0-107`;
  unsigned Windows installer built successfully from clean commit `72bea85a`.
  Artifact: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-107_x64-setup.exe`
  (4,037,422 bytes), SHA-256
  `AD3D650E69743E1EE1647C6F287C9E2D22885CC1CD648090CD0977D7EE865290`.
  Product/file versions both `1.12.0-107`; post-bump p0-exit 19/19.
  Superseded by `1.12.0-108`: its smoke found S107-2..7, all repaired there.
- Earlier coach-smoked installer: `1.12.0-106` (`cbf1889`),
  containing the Settings team-name save-on-close repair and its immediate-close
  regression checks. Full gate 136/136, zero skipped and zero failed at
  `2f309d6`, before the four-owner version-only bump; `e2e-p0-exit` 19/19
  after it. The unsigned NSIS installer was built successfully, and the coach
  approved its installed smoke on 2026-09-28 (`SMOKE-1.12.0-106.md`). The
  `1.12.0-105` coach smoke found S105-1, accepted as repaired in `1.12.0-106`.
  `1.12.0-104` was never smoked and was superseded.
- `1.12.0-103` (legacy excision step 8) passed its installed smoke on
  2026-09-27 (`SMOKE-1.12.0-103.md`). Earlier installers are superseded; their
  records are the `SMOKE-1.12.0-*.md` files and
  `docs/archive/CLAUDE-2026-09-27.md`.
- Legacy excision: Passes 0-2b done (`docs/LEGACY-EXCISION-PLAN.md`); one
  season format, every old-format reader deleted, old files refused. The
  one-time storage cleanup and settings conversion ran on the installed profile
  (receipts read back 2026-09-27); their modules were deleted after
  `1.12.0-104` and first shipped without them in `1.12.0-105`.
- Included in `1.12.0-105`: the efficiency-audit slim-down, the one-time
  modules and dead renderers deleted, the custom-field editor rebuilt on the
  overlay service, and Special Teams try charting.
- Break Down charting cutover (roadmap Step 1): shipped in `1.12.0-107`;
  installed smoke passed in `1.12.0-108`. Formation and Receiver Set
  (with a coach-managed Formation library), Gap under Play Direction, motion
  Starts/Ends, RPO and QB Run details, Reverse and QB Run play types, the
  film-linked run-gap report, Film Room and CSV columns, and the single-format
  refusal of the retired `formation` key. The supplemental visual-finish comp
  supplied only the Gap interaction and spacing. Live coach data was converted
  on explicit coach authorization on 2026-09-30 and independently verified.
  The coach's 2026-09-30 mapping resolves
  all 496 nonblank formations; four are deliberately blanked for re-charting.
  Exact preservation, current-format and takeaway proofs pass in the final
  copy rehearsal. Incompatible history was archived, independently verified
  and removed on coach authorization: 34 backups / 94 versions; 42/52 kept.
  All 919 live plays and retained 42 backups / 52 versions are current format.
  Film references, identity and unrelated fields are unchanged. Spent tools,
  their tests and the Previous formations bridge are deleted. Beast remains
  available in the current library; installed settings were not rewritten.
  Current receipt, impact and final re-chart checklist:
  `docs/CHARTING-CUTOVER-CURRENT-IMPACT-2026-09-30.md`.
  Additional full current-state backup verified 2026-09-30 under
  `D:\Football\Film\GridIronIQ-Backups\current-state-2026-09-30-b10094cf`
  (data, managed film, desktop settings, Documents mirror and source bundle).
  Source verification: full build and gate
  140/140, zero skipped and zero failed at `a449b59e` on 2026-09-30;
  version-only bump p0-exit 19/19. BD-UX-1 and BD-UX-2 are closed (`1.12.0-108`).
  The coach's 2026-09-29 correction supersedes the receiver-look follow-up:
  Formation accepts Twins, Trips, Bunch and Tight Bunch; Backfield and QB
  Alignment stay separate. Personnel follows Formation before QB Alignment.
  Offensive Line Strength includes Unbalanced Left/Right. Receiver Alignment
  means left x right (totals 1-5, no 0x0). Receiver Strength and Line Balance
  are removed, not retained as compatibility readers.
  No receiver-look reader remains.
- Registry: every Reports manifest and Home read `productionStatus: REJECTED`;
  installed smokes approved Players, Defense cohort presentation and Special
  Teams (`1.12.0-91`), Home's visual composition (`1.12.0-92`) and the Reports
  navigation work (`1.12.0-98`) without moving the registry.
- The working branch is pushed to GitHub (2026-10-01); nothing is tagged or published.
- Harness inventory is discovered from `tools/e2e-*.mjs`; never a count in prose.

## Historical And Reference Material

Versioned smoke files describe only the named installer. Audit, closeout,
redesign, prototype, and prior-plan documents describe their stated baseline;
they are evidence, not current status. In particular, do not treat
`BETA-SMOKE-FINDINGS.md`, `BREAKDOWN-REDESIGN-PARITY.md`, `CODE-AUDIT.md`,
`CODE-REVIEW-FINDINGS.md`, `DESIGN-REFRESH.md`,
`GRIDIRON-IQ-CURRENT-PASS-CLOSEOUT.md`,
`GRIDIRON-IQ-CLOSEOUT-AMENDMENT-2026-07-23.md`,
`GRIDIRON-IQ-DESIGN-AUDIT.md`, `GRIDIRON-IQ-REDESIGN-PLAN.md`,
`GRIDIRON-IQ-SHELL-INDEPENDENCE-PLAN.md`,
`GRIDIRON-IQ-VISUAL-RECOMPOSITION-PLAN.md`, `STATS-REDESIGN-BRIEF.md`, or
`sample-analytics-report.md` as current-state authority.

`docs/archive/CLAUDE-HISTORY-THROUGH-2026-09-02.md`, `docs/archive/CLAUDE-2026-09-27.md`
and `docs/archive/TESTING-2026-09-27.md` are append-only history.
`docs/POST-LEGACY-INSTRUCTION-AUDIT.md` is a completed audit prompt (run 2026-09-27).
`docs/REPORTS-SECTION-PROMPTS.md` is a retired assignment artifact; its DOCX
copy is local-only. Untracked historical captures under
`design-comps/visual-reset-2026-08/part1-verification/` and
`part2-verification/` are local-only, not clean-checkout evidence; the
manifest-owned `charlie-gate-density4` set remains tracked. Current Reports
work starts from the approval manifests, current
decision records, canonical real data, and the open-defect index.

## Update Discipline

Every milestone handoff must update, in the same commit:

1. Current version and release truth when either changes.
2. `docs/OPEN-DEFECTS.md` for every opened, reclassified, or closed defect.
3. `GRIDIRON-IQ-PLAN-V2.md` for roadmap or product-decision changes.
4. The owning approval manifest when canonical evidence or status changes.
5. `docs/TESTING.md` only for changed test contracts; derive inventories rather
   than maintaining volatile totals.
6. `docs/VISUAL-SYSTEM-RULES.md` whenever a shared palette, typography,
   navigation, selector, or dashboard-composition decision changes.
7. The owning manifest's `supersededArtifact` whenever a global token change
   invalidates canonical pixel evidence. Regenerate under a new tracked path,
   never overwrite or delete the prior captures, and state what the new evidence
   supersedes and why.

Run `node tools/audit-design-approvals.mjs` after any canonical artifact or
manifest change. A documentation handoff is incomplete while that audit is red.

Recorded exception: the 2026-09-22 Reports handoff was split across
`160533c` (code and tests), `c7e9f76` (status docs), `13d3027` (approved comp
and installed-smoke record), and `58b151d` (comp rationale). These commits
were not individually self-contained under the same-commit rule above. At
`58b151d`, the tracked comp, rationale, smoke record, and status docs are all
present; the split history is not retroactively compliant. Future handoffs
still follow the same-commit rule.
