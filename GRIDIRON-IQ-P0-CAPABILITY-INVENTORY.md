# GridIron IQ — P0 Capability Inventory

**Status:** executable P0-d migration contract
**Machine-readable source:** `tools/p0-capability-inventory.mjs`
**Audit:** `node tools/e2e-p0-capabilities.mjs`

This inventory protects coach outcomes, not old markup. Every row in the machine-readable source names one capability, its owner surface, its evidence type, and the exact assertion in a canonical user journey that proves it. A route migration may redesign the screen, but it may not delete or rename that proof without making the gate red.

## Coverage

| Surface | Capabilities | What is protected |
|---|---:|---|
| Home | 3 | first-run setup, direct New Game, authoritative game entry |
| Shell | 5 | Break Down, Study, Reports, Plan, Settings/More ownership |
| Break Down | 9 | film controls, play strip, complete football charting, penalties, special teams, Save & Next |
| Film Room | 6 | filters, exact Watch refs, inline editing, keyboard flow, saved columns |
| Study | 4 | scope/filter queries, intentional Plan handoff, report containment |
| Reports | 6 | exports, season/player/ST/self/opponent analysis |
| Plan | 4 | ordering, export, presentation, exact film refs |
| Team & Film Settings | 6 | first-run storage, pre-game access, managed/linked truth, rollback, no fallback |
| Shared film navigation | 3 | exact queue, cancellation, launch-state restoration |
| Native overlays | 8 | focus, inertness, Escape, stacking, destructive defaults, toast, unmount |
| **Total** | **54** | behavior, data integrity, and accessibility |

## Review Rule

- Primary evidence must be behavior, data integrity, or accessibility. Geometry alone never certifies a capability.
- The assertion label must exist verbatim in a live `tools/e2e-*.mjs` journey.
- New native routes inherit this inventory before their ownership flip.
- Intentional capability removal requires coach approval and an inventory change in the same reviewed checkpoint.
- Responsive screenshots remain required release evidence, but they cannot substitute for activating the real control and verifying its outcome.

## Mutation Proof

P0-d deliberately changed one assertion label to a nonexistent journey and changed behavioral evidence to `geometry`. The audit failed both mutations and returned green only after the manifest was restored.