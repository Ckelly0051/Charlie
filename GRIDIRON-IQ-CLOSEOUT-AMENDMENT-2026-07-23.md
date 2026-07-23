# Binding Closeout Amendment - 2026-07-23

> **Status:** ACTIVE AND BINDING
>
> This document amends `GRIDIRON-IQ-CURRENT-PASS-CLOSEOUT.md`. Where the two
> documents conflict, this amendment controls.
>
> **Builder:** Claude
>
> **Independent reviewer:** Codex
>
> **Installed smoke authority:** Coach

## Why The Contract Changed

The original C1 contract was too conservative. It proposed routing the legacy
and redesigned entry paths through one command while continuing to support both
surfaces. That would preserve the architectural seam responsible for the
current defects and invite another round of synchronization work.

The installed symptoms are not isolated presentation bugs:

- Settings/More differs by entry path.
- Home can highlight the previously opened game.
- Two surfaces compete to own active game, workspace mounting, and restoration.

These are retirement signals for the temporary legacy route. Protecting old
season data does not require preserving an obsolete interface.

Claude had begun scoping when this decision changed. Before implementation,
Claude must compare the prepared scope against this amendment and record what
changes. Do not continue a soft compatibility fix merely because scoping has
already started.

## Revised C1: Retire The Legacy Route

C1 no longer means "make both routes behave identically." It means one product
route, one game-opening lifecycle, and one state owner.

Required work:

1. Trace every caller that opens, previews, switches, restores, or closes a game
   from Team Hub, Home, Season Library, Break Down, Study, and Plan.
2. Inventory functionality reachable only through the legacy Team/Season
   Library route.
3. Move genuinely required functions into redesigned Home or Team & Film
   Settings before removing the old route.
4. Remove the obsolete game-entry surface, its navigation chrome, its direct
   game-open handlers, and its competing mount/restore ownership.
5. Establish one authoritative command for active team/season/game selection
   and transition into the workspace.
6. Route every remaining action through that command.
7. Make Home preview state distinct from the active opened game.
8. Prevent stale async film-health, folder-resolution, and render results from
   replacing the current game or workspace.
9. Keep Study and Plan on the same canonical context without changing their
   stored data.
10. Preserve backward compatibility at the data-loading boundary only. Old
    seasons must load into the current workspace; the old UI need not survive.

Do not satisfy C1 by:

- Forcing the missing bar visible with CSS.
- Redirecting into a still-mounted legacy screen.
- Keeping two state owners synchronized.
- Adding another compatibility adapter around obsolete navigation.
- Preserving an old route solely because old data exists.

## Revised C1 Proof

Every regression must be watched fail against the pre-fix behavior and pass
after the removal.

At minimum, prove:

1. Home -> open Game A -> Break Down has complete navigation and Settings/More.
2. The retired route cannot be reached, mounted, or restored through back,
   close, team switch, season switch, or direct internal calls.
3. Game A -> Home -> Game B -> Home highlights Game B, never Game A.
4. Delayed async work from Game A cannot replace Game B's selection, source
   status, or workspace.
5. Repeated open/close/restore cycles retain one listener set, one subscription
   set, and one logical film load per transition.
6. Team creation/editing, roster, Team & Film Settings, season creation/open,
   demo access, and season deletion remain available through the redesigned
   product where applicable.
7. Existing seasons open without migration or modification merely because the
   legacy UI was removed.
8. Study and Plan resolve the same active game as Break Down.
9. No tag, clip, plan, roster, game-info, or season data changes during route
   retirement.

## C2 Remains Binding

The linked-film work in `GRIDIRON-IQ-CURRENT-PASS-CLOSEOUT.md` remains required:

- Reproduce and fix the Refuge link that appeared successful but did not persist.
- Persist linked metadata to canonical SQLite and the JSON safety copy.
- Resolve the linked D: source after a full close/reopen with zero managed-copy
  calls.
- Keep links scoped to the intended game across async navigation.
- Report OL Lakes as incomplete rather than silently implying 82/82 film.
- Never silently fall back from a persisted linked game to an old managed copy.
- Preserve all real season data and do not delete managed C: film.

C2 should be implemented on top of the single C1 lifecycle, not patched into
both old and new routes.

## Packaging And Review

- C1 and C2 may use separate internal commits.
- Do not package, tag, deploy, or ask the coach to smoke C1 alone.
- Claude completes both checkpoints and documents the resulting architecture.
- Codex independently reviews the combined behavior and reruns the canonical
  gate on committed, freshly built bytes.
- Only one accepted internal candidate goes to the coach.
- The coach alone authorizes publication or managed-film deletion.

## Required Documentation Update

At Claude's next documentation checkpoint:

- Place this amendment at the top of the active `CLAUDE.md` handoff.
- Mark the original "support both routes" interpretation as superseded.
- Update `GRIDIRON-IQ-CURRENT-PASS-CLOSEOUT.md` to fold in this amendment.
- Reference `GRIDIRON-IQ-AGENT-WORKING-AGREEMENT.md`.
- Record the exact C1/C2 commit SHAs, tests, mutations, and remaining smoke
  obligations.

