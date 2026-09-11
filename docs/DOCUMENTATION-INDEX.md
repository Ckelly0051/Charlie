# GridIron IQ Documentation Index

> **Status:** CURRENT AUTHORITY MAP. Updated 2026-09-11.

## Current Authority

- `CLAUDE.md` - current operating state, invariants, owners, and handoff truth.
- `AGENTS.md` - current architecture and module map.
- `GRIDIRON-IQ-PLAN-V2.md` - active product roadmap and accepted decisions.
- `docs/OPEN-DEFECTS.md` - canonical index of unresolved defects.
- `docs/TESTING.md` - testing tiers and execution rules.
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

- Source version: `1.12.0-80` in all four version owners.
- Candidate: unsigned local visual-smoke handoff from `2d67515`, after the
  global secondary-copy repair in `b534a3f`; focused suites passed, full gate
  not run, and the candidate is not accepted, tagged, pushed, or published.
- Last accepted installed release snapshot: `1.12.0-70`.
- Current production status: Home and all eight Our Program Reports surfaces are
  `REJECTED`; approved comps remain binding design evidence.
- Current harness inventory is discovered from `tools/e2e-*.mjs`; do not copy a
  volatile total into prose. On 2026-09-10 the filesystem contains 109.
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
`docs/REPORTS-SECTION-PROMPTS.md` and its DOCX copy are retired assignment
artifacts; current Reports work starts from the approval manifests, current
decision records, canonical real data, and the open-defect index.

## Update Discipline

Every milestone handoff must update, in the same commit:

1. Current version and release truth when either changes.
2. `docs/OPEN-DEFECTS.md` for every opened, reclassified, or closed defect.
3. `GRIDIRON-IQ-PLAN-V2.md` for roadmap or product-decision changes.
4. The owning approval manifest when canonical evidence or status changes.
5. `docs/TESTING.md` only for changed test contracts; derive inventories rather
   than maintaining volatile totals.

Run `node tools/audit-design-approvals.mjs` after any canonical artifact or
manifest change. A documentation handoff is incomplete while that audit is red.
