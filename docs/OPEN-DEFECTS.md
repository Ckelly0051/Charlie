# GridIron IQ Open Defects

> **Status:** CURRENT DEFECT INDEX. Updated 2026-09-10.
>
> This file indexes unresolved coach-observed defects and investigations. Detail
> may live in a linked audit, but an item is not closed until this index and the
> owning current-state document are updated together. Product roadmap work that
> is not a defect remains in `GRIDIRON-IQ-PLAN-V2.md`.

## Reports

1. **OLL live-data audit - REPAIRED, awaiting Codex review and a Charlie
   Gate.** All ten items plus one found in passing are closed in code at
   `d3c71e6..` (seven commits). Detail, reconciliation and mutation evidence
   are in `docs/REPORTS-OLL-LIVE-AUDIT-2026-09-10.md`; the production decision
   record is `design-comps/reports-oll-repairs-2026-09-10/RATIONALE.md`. No
   surface advanced past `REJECTED`, and no installed WebView2 smoke has been
   run against these repairs, so none of it is accepted state.

   **Three questions carried to the coach, deliberately not decided:**
   - Defensive `Yds / play` still divides by every defensive snap, which is
     what the approved `2.9` KPI is measured over. Moving that denominator to
     the classified count makes it `3.2` and changes an approved value.
   - Deleting Stop Rate outright from the Self-Scout KPI band or Overview's
     Defense & discipline module would change an approved row count. It was
     moved out of the headline position instead; both compositions keep six
     slots.
   - Four OLL plays (ids 63, 67, 76, 90 - two sacks, a pass, a run) carry no
     `unit` tag, and punt distance, hang time and return yardage are
     essentially uncharted across the season. Both are charting-workflow gaps
     raised for the coach; nothing was inferred or written back.
2. **Renamed HTML report does not open correctly after save.** Reproduced by the
   coach for both Defense Report and Game Report. Keeping the default filename
   works; changing it during the native save flow does not. Treat this as a
   shared export-delivery defect until investigation proves otherwise. Preserve
   the chosen path and extension; do not guess the cause from the symptom.
3. **HTML report presentation needs redesign.** The current exported report is
   not visually acceptable. This is lower-priority product work, separate from
   the renamed-file functional defect and not permission to change the approved
   in-app dashboard composition.

## Breakdown

1. **Delete play is broken.** Confirmed source defect:
   `PlayTagger.deleteCurrentPlay()` reads `id` before assigning it. The visible
   button reaches that method through `BreakdownTheaterScreen.deletePlay()`.
   Existing delete/undo coverage does not exercise this button-to-method path.
2. **Installed Breakdown presentation appears regressed.** The coach reported
   that formatting looked off between commits. This remains an untriaged visual
   investigation, not a confirmed CSS root cause. Compare the installed screen
   against the accepted Breakdown evidence before proposing a repair.

## Release Impact

- `1.12.0-77` is an ungated local handoff and is not accepted.
- Current Home and every Reports surface remain `REJECTED` in the design
  approval registry even though `1.12.0-70` remains the last accepted installed
  release snapshot.
- Do not package or promote until the active repair scope has been reviewed,
  gated at the required tier, and smoked in installed WebView2.
