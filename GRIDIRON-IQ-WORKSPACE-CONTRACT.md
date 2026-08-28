# GridIron IQ Workspace Contract

> Introduced as the P0-d interface baseline and now consumed by the opt-in Home /
> Break Down / Study / Plan shell. Classic remains the default workspace.

## Shell Routes

| ID | Label | Current target | Guard |
|---|---|---|---|
| `home` | Home | Existing team home/library | Always available |
| `breakdown` | Break Down | Existing classic film workspace | Active game required |
| `study` | Study | Study query workspace; Advanced Reports fallback | Open season required |
| `plan` | Plan | Season plan workspace | Open season required |

`WorkspaceContext.navigate()` only validates and records route state. It never
opens, hides, or replaces production UI. Phase 1 owns the adapter from a route
target to existing UI actions.

## Workspace Snapshot

`window.app.workspace.snapshot()` returns a DOM-independent value:

```javascript
{
  route: 'home' | 'breakdown' | 'study' | 'plan',
  team: null | { id, name },
  season: null | { id, name, year, level, gameCount },
  game: null | { id, name, opponent, date, status, playCount },
  capabilities: { canBreakDown, canStudy, canPlan }
}
```

Identity comes from `SeasonStore` data and the active team registry, not visible
labels. Route guards fail closed when required context is absent. Unknown route
IDs never change the current route.

## Film Health

`await window.app.workspace.filmHealth(game?)` derives one stable view model from
the current `StorageBackend`. It does not load, move, copy, repair, or authorize
film.

| State | Meaning | Ready | Action |
|---|---|---:|---|
| `empty` | Game has no durable film references | No | `add-film` |
| `browser-only` | Browser session cannot persist referenced film | No | `repair` |
| `managed` | Expected clips exist in GridIron IQ managed storage | Yes | `open` |
| `linked` | Expected clips exist in the coach-owned linked folder | Yes | `open` |
| `missing` | One or more expected clips cannot be found/read | No | `repair` or `reconnect` |
| `unauthorized` | Linked folder lacks consent on this computer | No | `reconnect` |
| `saving` | Managed copy is in progress | No | None |
| `repairing` | Repair copy/relink is in progress | No | None |

Every result also carries `mode`, `expected`, `found`, `missing`, `persistent`,
`progress`, `detail`, and a stable `label`. Extra files never inflate `found`;
only expected identities count. Backend list failures degrade to actionable
`missing` states instead of rejecting the Home render.

### Operation Ownership

Saving/repairing operations are keyed by originating `gameId`. Progress callbacks
must pass that ID explicitly because a coach may switch games while a large copy
continues. Completion and failure clear the same key. This is display-state
isolation; existing storage ownership remains unchanged.

## Invariants

- The native shell is unconditional. No feature flag or alternate layout remains.
- Plan is additive (`plans: []`) and requires no storage-format migration.
- No film copy/link/repair behavior change beyond transient status reporting.
- Linked film always means referenced in place; it never implies a managed copy.
- Browser film is never described as durable.
- Plan uses the backward-compatible season-level `plans: []` contract and remains
  guarded by an open season.
- Study opens the query workspace; Advanced Reports remains one click away and
  analytics parity remains the release gate.

## Verification

`tools/e2e-workspace-context.mjs` is the focused contract gate. It pins route
order/targets/guards, snapshot identity, every film-health state, progress
ownership, matched counts, list-failure behavior, and zero page errors.
