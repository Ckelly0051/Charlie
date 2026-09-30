# GridIron IQ Documentation Index

> **Status:** CURRENT AUTHORITY MAP. Updated 2026-09-28.

## Current Authority

- `CLAUDE.md` - binding rules, owners and process (always loaded; kept short).
- `docs/REPORTS-CONTRACTS.md` and `docs/HOME-CONTRACTS.md` - current Reports
  and Home rules, read when touching those surfaces.
- `AGENTS.md` - current architecture and module map.
- `GRIDIRON-IQ-PLAN-V2.md` - active product roadmap and accepted decisions.
- `docs/OPEN-DEFECTS.md` - canonical index of unresolved defects.
- `docs/TESTING.md` - testing tiers and execution rules.
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

- Main checkout and latest built installer: `1.12.0-106` (`cbf1889`),
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
- Break Down charting cutover (roadmap Step 1), on the working branch and in no
  installer: IMPLEMENTED_UNVERIFIED in source. Formation and Receiver Set
  (with a coach-managed Formation library), Gap under Play Direction, motion
  Starts/Ends, RPO and QB Run details, Reverse and QB Run play types, the
  film-linked run-gap report, Film Room and CSV columns, and the single-format
  refusal of the retired `formation` key. The supplemental visual-finish comp
  supplied only the Gap interaction and spacing. Live coach data is NOT
  converted: `docs/CHARTING-CUTOVER.md` holds the impact report and the words
  awaiting the coach's decision. No full gate, installer or installed approval
  exists for it. BD-UX-1 and BD-UX-2 remain open in `docs/OPEN-DEFECTS.md`.
  The coach's 2026-09-29 correction supersedes the receiver-look follow-up:
  Formation accepts Twins, Trips, Bunch and Tight Bunch; Backfield and QB
  Alignment stay separate. Personnel follows Formation before QB Alignment.
  Offensive Line Strength includes Unbalanced Left/Right. Receiver Alignment
  means left x right (totals 1-5, no 0x0). Receiver Strength and Line Balance
  are removed, not retained as compatibility readers.
  No receiver-look reader remains. Copy-only impact counts need refreshing
  before approval; live data and installed acceptance are unchanged.
- Registry: every Reports manifest and Home read `productionStatus: REJECTED`;
  installed smokes approved Players, Defense cohort presentation and Special
  Teams (`1.12.0-91`), Home's visual composition (`1.12.0-92`) and the Reports
  navigation work (`1.12.0-98`) without moving the registry.
- Nothing is tagged, pushed or published.
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
