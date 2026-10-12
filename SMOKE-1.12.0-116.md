# SMOKE 1.12.0-116 - Windows x64 Beta (unsigned)

## Build Record

- Full gate at `af7e48cc` (2026-10-12): **158/158 green, 0 skipped, 0 failed**.
  Receipt: `artifacts/gate-logs/2026-10-12T20-52-41-525Z-VvsONG/receipt.json`;
  `releaseEligible: true`, source and fixture/golden hashes unchanged during
  the run. Real-data checks and analytics parity passed, not skipped.
- Codex reviewed the post-115 batch in rounds. The remaining Top call and
  matrix formatting findings were repaired in `2eef5398`; the last styling
  review (`2eef5398..af7e48cc`) reported no findings. Full-suite Offense and
  analytics checks passed with those repairs.
- Version-only bump `8bd32ffd`: all four owners `1.12.0-116`; fresh-build
  `e2e-p0-exit` passed 20/20. This focused check is not a second full gate.
- Built from a clean tracked checkout at `8bd32ffd` using
  `cargo tauri build --bundles nsis` with an external scratch config setting
  `bundle.createUpdaterArtifacts:false`.
- Artifact: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-116_x64-setup.exe`.
  Size: 4,053,536 bytes. SHA-256:
  `688418106A932F7ECEA8807100DC0801BD4798F085E8FFEA1799802805571DA3`.
  Installer and application product/file versions verified as `1.12.0-116`.
- Independent packaged-asset inspection: **pending**. Building and reading
  version metadata do not certify the packaged assets.
- Nothing installed, pushed, tagged or published. Coach data was not changed.

## Result

Awaiting the coach's installed smoke. This build is not accepted; the gate
receipt's `installedApproval` remains `not-assessed`.

## What to Check

Standard smoke (`docs/RELEASE.md`): install and launch; open real seasons with
the expected play counts; play managed and linked film; chart and save, close
with X and relaunch to verify tags and the selected game; switch games without
duplicate clips; Watch opens exactly the counted plays.

Smoke 115 repairs:

- Dashboards home has Go to reports only. Inside a dashboard, Back to
  dashboards returns home; Prev / Next follow saved dashboards then templates;
  disabled controls are grey; Go to reports sits apart at the right.
- New dashboard is neutral. Creating a dashboard still asks for its name.
- Reports > Season > Offense, Study and an offense dashboard agree on success
  rate for the same scope. Defense stop rates agree across those surfaces.
- An interception or lost fumble is a failed offensive play and a defensive
  stop even with a large gain or blank yards; a nullified play is excluded.
- An unjudged group shows a dash, not 0% or failure styling. Check the main
  success KPI, grouped report rows, Top call, Formation x Play Type matrix,
  Self-Scout and HTML exports. A genuinely judged 0% still reads 0%.

Carried forward: the Chart draft/Save and unit-change prompts, turnover
tacklers, draft recovery, dashboard template/save/Watch/relaunch flows and
the yards rules listed in `docs/OPEN-DEFECTS.md` and the 115 smoke record.
Do not infer approval of those workflows from this build or the full gate.

## Findings

Not yet assessed. Existing renamed-HTML-export and intermittent rapid-scrub
defects remain open in `docs/OPEN-DEFECTS.md`; no repair is claimed here.
