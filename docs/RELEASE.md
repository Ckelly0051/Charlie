# Releases and Installed Smoke

Read before a full gate, an installer, a smoke record or a tag. How to build
the installer is in `TAURI.md`; what the gate runs is in `docs/TESTING.md`.
History: `docs/archive/plans/GRIDIRON-IQ-RELEASE-GATE.md` and
`docs/archive/plans/GRIDIRON-IQ-MILESTONE-RELEASE-POLICY.md`.

## Cadence

1. Build and test locally during a batch. Do not package individual fixes.
2. When the coach says the batch is done, and with the coach's go-ahead, run
   the full gate once.
3. With a separate go-ahead, bump the four version owners, run `e2e-p0-exit`,
   commit the bump, and build the unsigned installer from that clean commit.
4. Hand the installer to the coach. The coach smokes the installed app on real
   film; findings are logged and nothing is fixed until the coach says the list
   is complete.
5. A passed smoke is recorded in `SMOKE-<version>.md` and the snapshot in
   `docs/DOCUMENTATION-INDEX.md`. A failed or superseded build stays recorded as
   such; the next batch gets a new version, never a replaced artifact.
6. Tags (`v*`, which trigger the GitHub prerelease workflow) and pushes happen
   only when the coach asks.

Keep the `-N` version suffix: `configureBetaDefaults` gates on it.

## What must be true before the coach smokes

| Check | Owner | Evidence |
|---|---|---|
| Full gate green on the reviewed bytes | builder runs it | runner receipt: every harness exit 0 with a clean result line |
| Analytics parity | non-builder reviewer | both goldens unchanged, or the change is named and reviewed; never regenerated to pass |
| Data integrity | non-builder reviewer | `e2e-integrity` on the canonical fixture, zero violations |
| Real data actually checked | non-builder reviewer | `e2e-realdata` and the canonical-season harnesses passed games, not skipped |
| Visual review where presentation changed | reviewer captures, coach approves | populated real-data captures at 1440×900, 1280×800, 768×1024, 390×844 (the Charlie Gate) |
| Version owners agree | builder | `e2e-p0-exit` after the bump |

If no non-builder reviewer is available, the release waits.

## The installed smoke

The only check that can catch codecs, disk throughput, decoders, native
dialogs, the asset protocol and app lifecycle. It always covers, on real film:

- install and launch; open a real season with the right play counts;
- managed and linked film play from their real locations;
- chart a play, close, relaunch: film auto-loads and tags survive (edit and
  re-save, never just open);
- switch games several times with no duplicate clips;
- a stat row's Watch opens exactly the counted plays, and charting navigation
  stays inside the selected set;
- every item the build's `docs/OPEN-DEFECTS.md` "awaiting the next installer"
  list names.

## Smoke record

`SMOKE-<version>.md`, current format:

- **Build Record**: gate result and commit, the version bump commit, installer
  path, size, SHA-256, product version, how it was built.
- **Result**: pass or fail, the coach's words and date, and any coach-data
  observations that are not app defects.
- **What was checked**: the smoke items above and the build's specific items.
- **Findings**: numbered, each with surface and repro; "None" when clean.

Only the latest passed record stays at the repository root; older ones move to
`docs/archive/smoke/`. An installed smoke approval does not move the design
approval registry.
