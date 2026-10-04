# Smoke record — 1.12.0-12

Artifact: `GridIron IQ_1.12.0-12_x64-setup.exe`
Alternative: `GridIron IQ_1.12.0-12_x64_en-US.msi`
SHA: `deeb8ba8f9d7223b0b87b7f04be77e49a0e901c4`
Built from: `claude/football-film-analyzer-GRiCW`
Date: 2026-07-25
Tester: Coach

## Status: READY FOR INSTALLED SMOKE

This is a local unsigned smoke build, not a tagged or published release.
Claude's independent review of repair commit `d32aa16` remains pending. No
managed film copy may be deleted based on this build alone.

## Automated Evidence

- Canonical gate: 60 harnesses, 60 green, 0 skipped, 0 failed.
- Real-data fixture: 13/13.
- Analytics parity: 2/2, including the real six-game season.
- Source version: `1.12.0-12` in all four required locations.
- Desktop payload: `dist/index.html` byte-identical to the gate-tested
  `football-film-analyzer.html`.
- Product/file version: `1.12.0-12`.
- Packaging: `cargo tauri build --no-sign`, two Windows bundles completed.

The first packaging attempt exposed a stale `dist/index.html`; those installers
were overwritten and are not valid smoke artifacts. The final artifacts below
were produced only after copying the gate-tested bundle into `dist/index.html`
and proving byte identity.

## Artifact Hashes

- EXE SHA-256:
  `47C18F3AEB1CF47D6E6F11C3F6CBF0FA4A249FE77C5439E2B3A493C3E1768936`
- MSI SHA-256:
  `ABA32E99991C425935C2BA6CB4CD88DF1A8B61932E57950647E8C1B4B848DF32`
- Frontend SHA-256:
  `257707355605C4410598BECDD82E1016965B65CF4E91EEDF38717FF6FF10B415`

## Coach Smoke

| Check | Result | Notes |
|---|---|---|
| Install + launch; More shows `1.12.0-12` |  |  |
| Home is the sole game-entry screen |  |  |
| Switch among at least three games; Home highlights the active game |  |  |
| Settings/More available on every game open |  |  |
| Refuge reopens as Linked to the correct D: folder |  |  |
| Play several Refuge clips after restart |  |  |
| OL Lakes reports missing clips honestly and never falls back to C: |  |  |
| Edit one tag, Save & Next, restart; edit survives |  |  |
| Every other game's play count and tags remain intact |  |  |
| Reports main and specialized views retain truthful actions/back behavior |  |  |
| Undo/Redo/Shortcuts work on desktop; visible in mobile drawer |  |  |
| Study result launches the exact film sequence |  |  |
| Plan item saves and survives restart |  |  |
| Backup/save status is healthy |  |  |

## Result: PENDING

Findings should be batched and recorded here. The coach alone changes this
result to PASS or FAIL and authorizes any subsequent publication or film cleanup.
