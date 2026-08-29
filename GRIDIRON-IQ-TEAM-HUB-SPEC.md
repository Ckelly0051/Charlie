# GridIron IQ — Team Hub interaction specification

**Status:** implemented at `f78d9e4`; R1-R4 repaired at `3f40216`; awaiting independent Claude re-review.
**Owner route:** S3 — native Team Hub / Season Library.
**Why it exists:** Team Hub is the app's front door *and* was the last surface pinning
`#wsClassicOutlet` — before S3, `_openLibrary()` had to reveal the outlet because
the library rendered inside the relocated `#app`. It is also the identity moment: the first
screen a coach sees. A design card alone is insufficient; this is the behavior
contract the implementation is reviewed against.

---

## 1. Hierarchy and purpose

**Team → Season → Game.** Team Hub owns team and season selection and is the
*only* place a season is opened or created. **Home remains the sole game-entry
route** (C1, already shipped) — Team Hub hands off to Home, it does not open games
directly.

---

## 2. Team selection

- Teams render as a switcher (multi-team is supported: `ffa_teams`,
  `ffa_active_team_id`, with `ffa_team_profile` mirroring the **active** team).
- **Switching a team is destructive to open context** and must: commit and persist
  the open season, close it, swap profile, clear the now-unowned live roster, then
  land on the incoming team's hub. The roster hydrates only after the coach opens
  one of that team's seasons. No implicit game stays open across a switch.
- **Add team** opens an empty form — never pre-filled with a prior value (a
  first-run leftover previously concatenated into the new name).
- **Remove team is permitted only when the team owns zero seasons.** Otherwise
  show why, and do not offer a destructive path. Removal never strands seasons.
- Legacy seasons without a `teamId` belong to the first registry team.

## 3. Season selection

- Seasons are **scoped to the active team** and never listed across teams.
- Each season row shows: name, game count, play count, and whether it is current.
- **Open** commits/persists the outgoing season first, then opens, then hands off
  to Home. **Create** collects name/year/level up front, then the same handoff.
- **Delete season** is a destructive confirmation (§ Overlay spec) naming the
  season and its game/play counts. Never a bare "are you sure".

## 4. Settings access before a game is open

**Team & Film Settings must be reachable from Team Hub with no game open.** This
is a hard requirement — film storage setup is a pre-game activity, and burying it
behind an open game was the defect that produced the failed `v1.12.0-8` smoke.

Roster access is the deliberate exception: the Roster tab and every roster
mutation require an open program season. No-season and opponent-scout contexts
leave the tab disabled and receive an explicit explanation if a direct command
attempts the same action. This rule is owned by `SettingsScreen`, not only by
Team Hub buttons, so alternate Settings entry points cannot bypass it.

### 4a. Progressive setup

Team Hub owns one compact five-step Setup Progress surface: team, roster,
season, first tagged play, and first real-data Reports visit. It reads the
existing canonical checklist truth; it does not create new stored progress.
Sample data never completes real-season, real-tag, roster, or stats milestones.
Incomplete steps invoke their real destination, completed steps remain visibly
complete, and the coach may dismiss the band. This capability is explicitly
listed in the P0 inventory and critical floor; it may not become hidden legacy
DOM again.

## 5. Selected context

The current team and season are visible at all times, and the hub states plainly
which season is *current* versus merely listed. When a season is open, returning
to the hub must show it as current — not as an ordinary row.

## 6. Film-health states

Per season (aggregated) and per game (on handoff to Home):

| State | Meaning | Affordance |
|---|---|---|
| `ready` | every expected clip resolved | Open |
| `partial` | folder resolved, clips missing | **Repair** + missing count |
| `missing` | folder unreachable/denied | **Reconnect** + the path attempted |
| `none` | no film linked yet | Link film |
| `checking` | health probe in flight | skeleton, never a false green |

**Health must never be optimistic while unknown.** `checking` renders as a neutral
indicator, not as ready.

## 7. Empty, loading, error states

- **No team** → first-run setup (name + jersey color), single primary action.
- **Team, no seasons** → explain what a season is; offer Create and Explore sample.
- **Loading** → skeleton rows; never an empty list that implies "no seasons".
- **Storage error** → state what failed and the recovery action. Never silently
  render an empty hub, which is indistinguishable from data loss.

## 8. Create / delete flows

- **Create season:** name (required), year, level. Lands on Home for that season.
- **Create game** is *not* a Team Hub responsibility — Home owns it.
- **Delete** (team or season) always routes through the destructive-confirmation
  dialog and states exactly what is removed. Managed film deletion is **never**
  implicit in a season delete without the impact report required by the
  integrity contracts.

## 9. Keyboard

- Full tab order across team switcher → seasons → primary actions.
- `Enter` activates the focused row (open season); `Space` toggles selection where
  selection exists.
- Arrow keys move within the team switcher and the season list.
- Focus is visible at every step (single shared focus ring token).
- Escape from any hub-level overlay returns focus to the invoking control.

## 10. Mobile / narrow

- Single column; team switcher collapses to a menu.
- Touch targets ≥44px (`pointer:coarse` density).
- No horizontal page overflow at 390px.
- Season rows keep name + counts; secondary metadata may truncate, never wrap
  into an unreadable stack.

## 11. Migration constraints

- Reads through the canonical loader only; **no schema change, no migration.**
- The retired schedule grid is **not** reintroduced — Home is the sole game entry.
- On completion, `_openLibrary()`'s outlet reveal is deleted, not hidden, and
  `restoreRouteVisibility()` becomes unnecessary.
