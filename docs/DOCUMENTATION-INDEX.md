# GridIron IQ Documentation Index

Updated 2026-10-15.

## Current authority

- `CLAUDE.md` - binding rules, owners and process.
- `AGENTS.md` - architecture and module map.
- `GRIDIRON-IQ-PLAN-V2.md` - forward roadmap.
- `docs/OPEN-DEFECTS.md` - open defects, pending smoke items, coach decisions.
- `docs/TESTING.md` - testing tiers and execution rules.
- `docs/REPORTS-CONTRACTS.md`, `docs/HOME-CONTRACTS.md` - Reports and Home rules.
- `docs/VISUAL-SYSTEM-RULES.md` - shared palette, typography, navigation,
  selector and dashboard composition rules.
- `GRIDIRON-IQ-TAG-MODEL.md`, `GRIDIRON-IQ-PENALTY-MODEL.md`,
  `GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md`, `GRIDIRON-IQ-PLAY-CALL-MODEL.md`,
  `GRIDIRON-IQ-WORKSPACE-CONTRACT.md`, `GRIDIRON-IQ-OVERLAY-SPEC.md`,
  `GRIDIRON-IQ-TEAM-HUB-SPEC.md`, `GRIDIRON-IQ-SAVE-CONTRACT.md` - domain and
  interaction contracts.
- `docs/HIDDEN-VALUES-LIST.md` - plays holding values they cannot show, for
  the coach to re-chart (`node tools/audit-hidden-values.mjs`).
- `docs/COLLABORATION.md` - roles, decision rights, when to ask the coach.
- `docs/RELEASE.md` - release cadence, pre-smoke checks, smoke checklist and
  record format.
- `TAURI.md` - desktop build, packaging and installed smoke.
- `design-approvals/APPROVALS.json` and per-surface manifests - design and
  production acceptance status.
- `docs/RECEIVER-CHARTING-RESEARCH-PROPOSAL.md` - receiver route, release and
  target/catch zones: research, the coach's decisions and the data contract
  (route/release checkpoint 1 is now contracted in `GRIDIRON-IQ-TAG-MODEL.md`
  section "Receiver Route and Release"; Target/Catch remains checkpoint 2).
- `docs/AI-RECOGNITION-PLAN.md` - parked AI recognition plan.
- `docs/LEGACY-RECHART-LIST.md` - plays the coach still needs to re-chart.
- `docs/HUDL-DEFENSE-REPORTING-REFERENCE.md` - reference for future Defense
  reporting.
- `GRIDIRON-IQ-P0-CAPABILITY-INVENTORY.md` - capability inventory checked by
  `e2e-p0-exit`.

## Current snapshot

The one place release state is kept current. Replace entries; do not append a
log.

- **Previously coach-accepted installer: `1.12.0-113`** (2026-10-09,
  `docs/archive/smoke/SMOKE-1.12.0-113.md`): PASS with the intermittent rapid-scrubbing defect
  deferred in `docs/OPEN-DEFECTS.md`; no further coach findings. Includes missed
  tackles, smoke 112 repairs, Drive in Situation and kick coverage tackles.
  Built from clean version-bump commit `22e83a47`; `e2e-p0-exit` passed 20/20.
  Artifact: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-113_x64-setup.exe`,
  4,036,887 bytes, SHA-256
  `2D93D5950C9B16AF3928C170655534B022B58613EFC2D4C926FC8DD771460E87`.
  Product and file versions verified. Independent packaged-asset inspection
  PASS (2026-10-09). Installed smoke acceptance is separate from the gate
  receipt's historical `installedApproval: not-assessed` and does not move the
  design approval registry. No push, tag or publication authorized here.
- **Smoked: `1.12.0-114`** (2026-10-10, `docs/archive/smoke/SMOKE-1.12.0-114.md`): Chart's draft
  and Save, unit changes as saves with a charted-data prompt, tacklers on a
  change of possession, Dashboards rev 1. Coach checks 1-2 passed and Claude's
  installed checks 8-10 passed; the coach closed the findings list (six
  findings) for fixing. Packaged-asset inspection PASS.
- **Smoked with three findings: `1.12.0-115`** (2026-10-12,
  `docs/archive/smoke/SMOKE-1.12.0-115.md`): the smoke 114 fixes (Dashboards home, read-only
  templates, Special Teams teal, prose, the installed-check defects, bar
  scale) and one yards rule across the reports, Study and Dashboards
  (`docs/REPORTS-CONTRACTS.md` > Yards). Codex review rounds closed with no
  open findings. Built from clean version-bump commit `3788a593`;
  `e2e-p0-exit` 20/20. Artifact:
  `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-115_x64-setup.exe`,
  4,047,120 bytes, SHA-256
  `EE10EAFE802F5ECD05FAF58B156F05F119CE41CCCFAEDBAB3A2009BEF6A7677A`.
  Its findings are built in 116; installed acceptance was not granted.
  Packaged-asset inspection not run. Superseded by 116 for the next smoke.
- **Smoked, not accepted: `1.12.0-116`** (2026-10-12, `docs/archive/smoke/SMOKE-1.12.0-116.md`):
  three Dashboards findings, built since as Dashboards rev 2 (a canvas of
  modules); no other findings. Independent package inspection not run. Dashboards navigation
  strip and neutral buttons; one success/stop rule across Reports, Study and
  Dashboards; turnovers always fail on offense and stop on defense; unjudged
  rates render a dash, including Top call and the formation/play-type matrix.
  Built from clean version-only bump `8bd32ffd`; fresh-build `e2e-p0-exit`
  passed 20/20. Artifact:
  `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-116_x64-setup.exe`,
  4,053,536 bytes, SHA-256
  `688418106A932F7ECEA8807100DC0801BD4798F085E8FFEA1799802805571DA3`.
  Installer and application product/file versions verified. No installation,
  push, tag or publication performed; coach data unchanged.
- **Latest candidate: `1.12.0-118`**, built from clean version-only bump
  `d8998f22`; focused `e2e-p0-exit` 20/20. Artifact:
  `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-118_x64-setup.exe`,
  4,062,986 bytes, SHA-256
  `B72A05220761E051B065F8F35BA5CF9FF50939F5B923F2D1D32F15B876CC9BD5`.
  Contains receiver route/release checkpoint 1, whole Chart deck polish and
  the shortcuts-dialog repair. Charlie Gate visual review is PASS;
  independent packaged-asset inspection and installed smoke are pending.
  Production remains IMPLEMENTED_UNVERIFIED. Checklist: `SMOKE-1.12.0-118.md`.
- **Post-118 maintenance:** ownership is mapped in `AGENTS.md`; every harness
  is assigned in `docs/TESTING.md`. Pure model checks use existing Node suites;
  browser journeys retain interaction, media and layout coverage. Duplicate
  persistence scenarios, Reports traversal, unused calculations and stale
  commentary are removed. Game creation uses GameScreen only; unused video
  state is gone. Film Room requires live fixtures and fails on browser errors.
  Galleries are opt-in with `--capture`. Two film lifecycle defects remain open.
  Latest focused verification: 25/25 green at `6850bc49`, zero failed/skipped,
  clean unchanged source and fixture hashes. Receipt:
  `artifacts/gate-logs/2026-10-15T06-28-46-074Z-eAmjBe/receipt.json`.
  This is not a full gate or release approval. Maintenance is not packaged;
  installer 118's installed-smoke status is unchanged. Broader cleanup remains
  in progress; the stats-engine area split stays with the Reports rebuild.
- **Latest coach-accepted installer: `1.12.0-117`** (smoke PASS, 2026-10-14,
  `SMOKE-1.12.0-117.md`): Dashboards rev 2 (`e68bb5ef`):
  a canvas of modules, each with its own unit, games and filters; Open and
  Edit; every action on the picker page; typed delete. Focused harnesses
  green. Completed source repairs include:
  native views/shared overlays, HTML save filters, the current roster contract
  and film path checks. Mirror recovery distinguishes invalid IDs; export
  consumers share one injected save function without a window global.
  Built from clean version-only bump `a60b0809`; `e2e-p0-exit` 20/20.
  Artifact: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-117_x64-setup.exe`,
  4,060,134 bytes, SHA-256
  `04226572261B5FA04ECBD0FC8C4D3AFD474177751B83C2414691B40394778539`.
  Installer and application product/file versions verified. Independent
  packaged-asset inspection remains pending; the coach approved installed
  smoke on 2026-10-14.
  Codex's read-only Computer Use pass verified populated reports, linked
  playback, Film Room filtering and the native Dashboard export dialog; it
  found overlapping Keyboard Shortcuts labels, repaired and packaged in 118
  but not in the 117 installer; verify that repair in the 118 installed smoke.
  The smoke record distinguishes Codex's limited read-only checks from the
  coach's acceptance. Receiver checkpoint 1 and Whole Chart deck polish are
  packaged in 118 but not installed-smoked. The deck remains
  IMPLEMENTED_UNVERIFIED against its COMP_APPROVED artifact. The latest coach
  disclosure rule allows another module to open, but never auto-closes one
  already open on the same play; see `docs/VISUAL-SYSTEM-RULES.md` > Chart Deck.
  Charlie Gate visual review is PASS (coach, 2026-10-14); packaged inspection
  and installed smoke remain pending.
  Rust advisory coverage and compatible
  dependency repairs are complete in source; remaining upstream maintenance
  warnings are in `docs/OPEN-DEFECTS.md`. Rapid scrubbing remains
  deferred. Coach approval authorizes no push, tag or publication.
- **Latest full gate:** 166/166 green at `a5238591` (2026-10-14), zero
  skipped or failed; `releaseEligible: true`. Receipt:
  `artifacts/gate-logs/2026-10-14T19-46-40-309Z-96k7d5/receipt.json`.
- **Organize pass (2026-10-04):** finished plans, old smoke records, the full
  defect history and the full roadmap history moved to `docs/archive/`;
  accumulated test captures moved out of `artifacts/`; dead code, orphaned
  CSS and repair-history comments removed (every comment-only change proven
  by byte-identical JS/CSS bundles); the silent startup `season.json` import
  and the unscoped version read/delete deleted; obsolete worktrees removed;
  the tag and Special Teams model docs rewritten as current contracts and
  reviewed by Codex; four standing-rule docs replaced by `docs/RELEASE.md` and
  `docs/COLLABORATION.md`; the remaining contracts brought to current state;
  five one-time tools deleted. Pushed, and packaged from `1.12.0-110` on.
- **Design registry:** every Reports manifest and Home read
  `productionStatus: REJECTED`; Break Down charting is COMP_APPROVED with
  production DRAFT; the Break Down cleanup is COMP_APPROVED with production
  IMPLEMENTED_UNVERIFIED. Installed smokes approved bounded changes without
  moving the registry.
- Harness inventory is discovered from `tools/e2e-*.mjs`; never a count in
  prose.

## Archive

`docs/archive/` is history, not current authority:

- `CLAUDE-HISTORY-THROUGH-2026-09-02.md`, `CLAUDE-2026-09-27.md`,
  `TESTING-2026-09-27.md` - earlier rule sets and test notes.
- `OPEN-DEFECTS-THROUGH-2026-10-04.md` - every defect record, open and closed.
- `plans/` - finished plans, audits and closeouts, including
  `LEGACY-EXCISION-PLAN.md` and `GRIDIRON-IQ-PERSISTENCE-CONVERGENCE-PLAN.md`
  (their remaining work is the plan's Legacy excision and platform lane), and
  `GRIDIRON-IQ-PLAN-V2-THROUGH-2026-10-04.md` (full roadmap history, the Break
  Down charting comp build contract and milestone acceptance records).
- `smoke/` - earlier passed installed smoke records through `1.12.0-111`.

## Update discipline

Every milestone handoff updates, in the same commit:

1. The current snapshot above when version or release state changes.
2. `docs/OPEN-DEFECTS.md` for every opened or closed item (closed items are
   deleted there, not kept).
3. `GRIDIRON-IQ-PLAN-V2.md` for roadmap or product-decision changes.
4. The owning approval manifest when canonical evidence or status changes.
5. `docs/TESTING.md` only for changed test contracts.
6. `docs/VISUAL-SYSTEM-RULES.md` when a shared visual decision changes.
7. The owning manifest's `supersededArtifact` when a global token change
   invalidates canonical pixel evidence; regenerate under a new tracked path.

Run `node tools/audit-design-approvals.mjs` after any canonical artifact or
manifest change.
