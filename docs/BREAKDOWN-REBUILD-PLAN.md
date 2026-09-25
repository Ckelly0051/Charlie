# Break Down rebuild — plan

Coach direction, 2026-09-24: rebuild Break Down's structure; keep the approved
layout. Base: full gate 130/130 at `c1f6cc1` (recorded in `55794fc`).

## What is wrong today

The route is five separately mounted Preact roots plus an HTML string:

| Root | Rendered by | Into |
|---|---|---|
| Toolbar + composition shell | `BreakdownWorkspace.mount` (`innerHTML`) | the route host |
| Theater | `mountNativeBreakdownTheater` | `[data-breakdown-theater-host]` |
| Play rail | the same function, a second `render()` | `[data-breakdown-rail-host]` |
| Charting deck | `mountNativeTagging` | `[data-breakdown-tagging-host]` |
| Film Room table | `mountNativeFilmRoom` | `[data-breakdown-film-room-host]` |
| Film Room controls | the same function, a second `render()` | `[data-breakdown-film-controls-host]` |

The toolbar's state (view, dock, split, Film focus, tools menu, context, save
state) lives on `BreakdownWorkspace` and is painted by hand: `classList`
toggles, `aria-pressed` writes, `hidden` flips, `querySelector` lookups.
Every layout move needs a new host box, a new mount argument and new
wiring, which is what slowed the Film Room work.

## Target

**One root.** `BreakdownWorkspace.mount(host)` renders one component,
`BreakdownRoute` (`js/native-breakdown-route.jsx`), which owns the toolbar,
the composition grid, the splitter and every child view as components in one
tree. `BreakdownWorkspace` becomes the route's state owner: a snapshot plus
`subscribe`, and commands (`setView`, `setFilmLayout`, `resetFilmLayout`,
`setFilmFocus`, `setContext`, `setSaveState`, `toggleTools`). No
`innerHTML`, no hand-painted classes.

**Controllers unchanged as owners.** `BreakdownTheaterScreen`,
`NativeTaggingScreen` and `NativeFilmRoomScreen` keep every command and
`snapshot()` / `subscribe()`. Their standalone `mount(host)` stays (harnesses
mount them alone), and the in-tree path and the standalone path share one
component, so there is one render path per view, not two.

**Media adoption moves into the component.** The theater view adopts the
canonical `#videoContainer` into its slot in a layout effect and returns it on
cleanup (`screen.attachMedia(slot, surface)` / `screen.detachMedia()`), so the
video node is never re-created: film is never obstructed or reloaded by a
re-render, view switch, dock change or Film focus.

**One subscription per model.** The Film Room screen holds one grid
subscription and fans each snapshot, with its summary built once, out to the
table and controls. The theater already publishes one snapshot to all its
views, and the deck has one view. (Planned as a parent passing props; done at
the screen instead, so standalone mounts share it too.)

## Contracts that do not move

- Every class name and `data-*` hook the CSS and the 45 Break Down harnesses
  use: `data-native-breakdown-route`, the `*-host` grid cells (kept as the
  grid-area wrappers they already are), `data-bd-*`, `data-fr-*`,
  `#bdSaveState`, `.ws-breakdown.is-film-room`, `.is-film-focus`,
  `data-fr-dock`, `--fr-video`.
- The approved layout at every release width; no visual change is intended.
- Domain APIs: `PlayTagger`, `PlayGrid`, `BreakdownChartingService`, the video
  controller. Mutations go through them, as now.
- Persisted keys: `ffa_film_room_layout`, `ffa_breakdown_film_focus`,
  `ffa_chart_collapsed_fields`, `ffa_film_room_columns_<team>`.
- Harness assertions are kept, never weakened. A harness that reads an
  internal the rebuild removes (for example a host element identity) is
  repointed at the same behavior and the change is named in the commit.

## Steps (each ends green on the Break Down harnesses, then committed)

1. **Workspace state + `BreakdownRoute` shell.** Toolbar, composition,
   splitter and tools menu in Preact from workspace state; the child views
   still mounted into their cells by the existing functions. Removes the
   `innerHTML` and the hand-painted state.
2. **Children into the tree.** Theater, rail, deck, Film Room controls and
   table rendered as components inside `BreakdownRoute`; media adoption in the
   theater component; the standalone `mount` functions render the same
   components. Removes the five `render()` roots.
3. **Shared subscriptions.** One subscription per model, passed down.
4. **Cleanup.** Delete the dead Break Down pieces (`_ordinal`,
   `toggleStrip`, `setPerspective`) and anything the steps orphan; update
   `CLAUDE.md` owners and `docs/OPEN-DEFECTS.md`.
5. **Full gate**, then the installer the coach smokes, which also carries the
   uninstalled checks from the Film Room batch (settings save on a full
   profile, the once-only version-history move).

## Progress

| Step | Commit | Evidence |
|---|---|---|
| 1. Workspace state + `BreakdownRoute` shell | `90ff4c6` | 12 route harnesses green, counts unchanged |
| 2. Children into the tree | `a0f2c2f` | 21 Break Down harnesses green; `e2e-native-film-room` restore check repointed (see commit), handback check added, both mutation-verified |
| 3. One grid subscription | `cd7912e` | new check pins one grid subscription; mutation-verified |
| 4. Dead methods | `05560c1` | `_ordinal`, `toggleStrip`, `setPerspective` deleted |
| Visual | — | 20 screenshots byte-identical to `c1f6cc1` (chart, Film Room below/beside, Film focus, tools menu; 1440/1280/768/390) |
| 5. Full gate, installer | pending | |

**Behavior change, deliberate:** a standalone `mount()` now takes a view over
from the live route and `restore()` hands it back. Before, restore left the
route without that view until the next remount.

## Out of scope

Moving settings out of localStorage, the web target, the analytics split and
the dead code outside Break Down (`docs/OPEN-DEFECTS.md`). Column reordering
and the full chartable-field list remain deferred by the coach.
