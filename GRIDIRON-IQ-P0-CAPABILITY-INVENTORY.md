# GridIron IQ — P0 Capability Inventory

**Status:** executable P0-d migration contract
**Machine-readable source:** `tools/p0-capability-inventory.mjs`
**Audit:** `node tools/e2e-p0-capabilities.mjs`

This inventory protects coach outcomes, not old markup. Every row in the machine-readable source names one capability, its owner surface, its evidence type, and the exact assertion in a canonical user journey that proves it. A route migration may redesign the screen, but it may not delete or rename that proof without making the gate red.

## Coverage

| Surface | Capabilities | What is protected |
|---|---:|---|
| Home | 3 | first-run setup, direct New Game, authoritative game entry |
| Shell | 8 | routes plus live Undo, Redo, and Shortcuts ownership |
| Break Down | 16 | film controls, charting, drawing, Quick Chart, multi-angle, penalties, special teams, Save & Next |
| Film Room | 6 | filters, exact Watch refs, inline editing, keyboard flow, saved columns |
| Study | 4 | scope/filter queries, intentional Plan handoff, report containment |
| Reports | 8 | CSV round-trip, call sheet, season/player/ST/self/opponent analysis |
| Plan | 4 | ordering, export, presentation, exact film refs |
| Team & Film Settings | 8 | storage truth, rollback, restore points, roster, no fallback |
| Shared film navigation | 3 | exact queue, cancellation, launch-state restoration |
| Native overlays | 8 | focus, inertness, Escape, stacking, destructive defaults, toast, unmount |
| **Total** | **68** | behavior, data integrity, and accessibility |

## Review Rule

- Primary evidence must be behavior, data integrity, or accessibility. Geometry alone never certifies a capability.
- The assertion label must exist verbatim in a live `tools/e2e-*.mjs` journey.
- Historically vulnerable workflows are named in `P0_CRITICAL_CAPABILITY_IDS`; an aggregate count is never accepted as completeness proof.
- New native routes inherit this inventory before their ownership flip.
- Intentional capability removal requires coach approval and an inventory change in the same reviewed checkpoint.
- Responsive screenshots remain required release evidence, but they cannot substitute for activating the real control and verifying its outcome.

## Mutation Proof

P0-d deliberately changed one assertion label to a nonexistent journey and changed behavioral evidence to `geometry`. The audit failed both mutations and returned green only after the manifest was restored. The post-acceptance D1-D4 repair also removed one named critical id, broke multi-angle drift correction, and removed a required Team Hub specification clause; the capability, behavioral, and composition audits each turned red on their own mutation before being restored. A destroyed-overlay focus callback was also mutation-proven to steal focus from a later toast until service-owned cancellation was added.