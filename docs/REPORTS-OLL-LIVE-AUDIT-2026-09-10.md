# Reports OLL Live Audit - 2026-09-10

## Status

**OPEN - investigation and repair proposals pending.** These findings came from
a read-only production capture of the canonical `2025-st-joseph-mavericks-jv`
season, Week 5 vs OL Lakes Lakers (`gmqpt95xh58z0a`, 83 charted plays). The
capture covered all 29 Our Program Reports views and produced no page or console
errors. No item below is authorization to change code or coach data. Root-cause
analysis must precede repair, and proposed fixes require coach approval.

Evidence is in `artifacts/oll-live-reports-2026-09-10/`; `manifest.json` records
the complete screen inventory. The canonical season remains read-only data
authority. The registered comp for each surface remains composition authority,
including the fixed-dashboard rule: data fills fixed slots, uses the approved
absence treatment when short, and is ranked and capped when long. Data must not
resize a dashboard.

## Investigation Ledger

1. **Overview play cohorts do not reconcile. REPAIRED.** The page reported
   `83/83` charted and the shared phase rail `30 offense / 40 defense / 13
   special teams`, while Overview reported `64 Total Plays` and `26 / 37 / 1`
   by phase. Every number was arithmetically correct and three labels were
   false. `stats.allPlays` is the CLASSIFIED cohort (`playType || runPass`) and
   was printed as `64 charted · 100%`; Snaps by phase derived Special Teams by
   subtracting offense and defense from that same classified cohort, which is
   why 13 special-teams snaps read as 1.

   Overview now reports `Total plays 83` with the sub `64 of 83 classified ·
   77%`, and Snaps by phase counts each phase from the charted cohort:
   `Offense 30 (36%) / Defense 40 (48%) / Special Teams 13 (16%)`, `83 total`.
   The charted count and phase counts ride on `stats` as non-enumerable
   `chartedPlays` / `phaseCounts` so `e2e-parity` goldens do not drift; parity
   stayed 2/2. The HTML exports carry the same correction.

   Found while verifying it: the Success rate sub read
   `stats.efficiency.successfulPlays`, a field `_efficiencyStats` never
   returns, so it printed a constant `0 successful snaps` beneath a nonzero
   rate on every game and every season. It reads `efficiency.successes` and
   OLL now shows `7 successful snaps` beneath `26.9%`.

   Four OLL plays (ids 63, 67, 76, 90 — two sacks, a pass, a run) carry no
   `unit` tag. They render correctly through the documented offense default and
   are **not** repaired here; they are raised for the coach, not inferred.
2. **Self-Scout Offensive Summary reports a zero tab count while populated.**
   This occurs in both Current Game and Full Season. Trace the tab count
   separately from the content calculation.
3. **Approved terminology and situation labels have drifted.** Self-Scout still
   uses `Giveaways` instead of `Turnovers` and generic labels such as `1st &
   Long`. Reports must use explicit yardage labels and represent all twelve
   down-and-distance combinations: first through fourth down crossed with
   Short, Medium and Long.
4. **Self-Scout defensive tendencies admit invalid situations.** Front and
   coverage calls such as `Maverick` and `Cover 3` appear in the situation
   column, producing self-referential rows such as `Maverick -> Maverick 100%`.
   Determine the intended situation dimensions and the category collision.
5. **Defensive yardage does not reconcile by game.** OLL shows 132 total yards,
   72 rush yards and 55 pass yards. The five-yard difference is unexplained in
   the UI, and other game rows differ as well even though the season aggregate
   happens to reconcile. Account for sacks, RPOs, penalties, unknown play types
   and exclusions before deciding whether calculation or labeling is wrong.
6. **Matchup season cohorts disagree with other Reports surfaces.** Matchup uses
   201 offensive plays and 174 defensive snaps; Season/Self-Scout surfaces show
   173 classified offensive plays and 154 defensive plays. Enumerate the exact
   cohorts and establish honest coach-facing denominators without forcing unlike
   metrics onto one cohort.
7. **Matchup presents personnel as a play call.** In Our Defense vs Their
   Offense, `Their Primary Call` displays `22`. Trace the selected opponent field
   and check both matchup directions for the same semantic error.
8. **Special Teams values conflict across surfaces.** The team report has no
   punt-distance data while Players displays punt averages of `2.8` and `0.0`.
   Season Special Teams reports one return for five yards while the player table
   totals eleven returns for 43 yards. Determine whether the problem is unit
   scope, incomplete player attribution, calculation, or generic labeling;
   never infer missing coach tags.
9. **Stop Rate remains prominent outside the approved Defense composition.** It
   remains on Overview and Self-Scout after the coach rejected it as a primary
   defensive comparison. Inventory all remaining uses and distinguish valid
   supporting use from composition drift; this is not authorization to remove
   the underlying metric globally.
10. **Layout integrity requires explicit closure, not assumption.** Recheck all
    29 OLL views for page and module overflow, internal scrollbars, overlap,
    fixed-height clipping, truncated names, missing tabs, bottom bleed and data
    beyond static row capacity. The initial capture found no page-level
    horizontal overflow or clipping. Close this item as verified if no defect
    reproduces; do not invent one to satisfy the count.

## Required Investigation Output

For each item report status (`CONFIRMED`, `PARTIAL`, `SOURCE DATA`,
`INTENTIONAL`, or `NOT REPRODUCED`), exact file/function/line ownership, source
cohort and exclusions, numerical reconciliation, root cause, proposed fix,
blast radius, required failing-first regression, coach-data implications and
confidence. Group shared causes and recommend a repair order. Stop for coach
approval before editing anything.
