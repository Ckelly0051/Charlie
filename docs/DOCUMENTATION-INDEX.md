# GridIron IQ Documentation Index

> **Status:** CURRENT AUTHORITY MAP. Updated 2026-09-22.

## Current Authority

- `CLAUDE.md` - current operating state, invariants, owners, and handoff truth.
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
  not override current status in `CLAUDE.md` or the defect index.
- `GRIDIRON-IQ-RELEASE-GATE.md` and
  `GRIDIRON-IQ-MILESTONE-RELEASE-POLICY.md` - standing release controls.

## Current Snapshot

- The main checkout is `1.12.0-93`. The latest unsigned installer is
  `1.12.0-94`, built from `81fe261` in a clean detached worktree with a local,
  uncommitted four-owner version bump. Its installed coach smoke is in
  progress, not approved as a release; see `SMOKE-1.12.0-94.md`.
- The installed `1.12.0-91` smoke approved the bounded Players, Defense cohort
  and Special Teams presentation changes. The `1.12.0-92` smoke approved Home's
  visual composition only; later Home/Breakdown fixes still need installed
  verification. The rapid-scrubbing `Film missing` report remains open but
  deprioritized. Nothing is tagged, pushed or published.
- The coach approved a new Reports global navigation concept on 2026-09-22:
  `design-comps/reports-global-strip-2026-09-22.html`. It is implemented in
  source (`160533c`) with the outer-frame and Players name repairs, and is not
  in an installer or installed-smoke accepted.
  Current `1.12.0-94` Reports smoke findings, including the outer frame,
  Overview-only score and Players name alignment, are indexed in
  `docs/OPEN-DEFECTS.md`; the shared visual contract is in
  `docs/VISUAL-SYSTEM-RULES.md`.
- Current production status: Home and all eight Our Program Reports surfaces are
  `REJECTED`; approved comps remain binding design evidence.
- Current harness inventory is discovered from `tools/e2e-*.mjs`; do not copy a
  volatile total into prose.
- The OLL Reports audit and other unresolved issues are indexed in
  `docs/OPEN-DEFECTS.md`.

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

`docs/archive/CLAUDE-HISTORY-THROUGH-2026-09-02.md` is append-only history.
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
