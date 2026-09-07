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

Run `node tools/audit-design-approvals.mjs` after changing any canonical
artifact or registry entry. Changing approved evidence requires a new approval;
never silently refresh a stored hash.
