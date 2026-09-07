# Design Approval Registry

This directory is the only current index of coach-approved design evidence.
The source artifacts remain in their original folders so their history,
relative links, and capture tooling are preserved.

`APPROVALS.json` lists every governed surface. Each listed manifest names the
canonical artifact, its immutable tree hash, the approval status of the design,
and the separate status of the current production implementation.

The word `approved` is not a complete status. Use only:

- `DRAFT`
- `COMP_APPROVED`
- `IMPLEMENTED_UNVERIFIED`
- `PRODUCTION_ACCEPTED`
- `REJECTED`
- `RELEASED`

A standalone comp can reach `COMP_APPROVED`. Only the real application can
reach `PRODUCTION_ACCEPTED`. A package can reach `RELEASED` only after its
production surfaces are accepted.

## Canonical Reports data

Design authority and data authority are separate:

- Each Reports manifest names the approved composition and visual evidence.
- `APPROVALS.json` names `2025-st-joseph-mavericks-jv` (`2025 St. Joseph
  Mavericks - JV`) as the only canonical data source for Reports production
  comparison, screenshots, and acceptance.

Load a read-only copy from the registered Documents-mirror path. Never mutate,
normalize back into, or otherwise write to the coach's source file. Record the
actual game and play counts in every evidence handoff so a missing, empty, or
wrong season cannot pass unnoticed.

Synthetic fixtures remain useful for deterministic formula, sparse-state,
empty-state, and adversarial regression tests. They are supplemental evidence
only. A synthetic or generated season cannot establish Reports visual parity,
football correctness, `IMPLEMENTED_UNVERIFIED`, `PRODUCTION_ACCEPTED`, or
`RELEASED`, even when every synthetic assertion passes. Existing approved comps
that were originally captured with QA data remain composition authority; all
new production evidence must render the registered real season.

Run `node tools/audit-design-approvals.mjs` after changing any canonical
artifact or registry entry. Changing approved evidence requires a new approval;
never silently refresh a stored hash.
