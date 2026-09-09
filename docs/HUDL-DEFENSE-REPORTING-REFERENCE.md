# Hudl Defense Reporting Reference

Status: Reference only

Last verified: 2026-09-09

## Purpose

This document records defensive reporting ideas available in Hudl and separates them into two implementation classes for GridIron IQ:

1. Reporting we can build from fields already in the GridIron IQ tag model.
2. Reporting we cannot support reliably until GridIron IQ adds first-class charting inputs.

This is not an approved composition, roadmap commitment, or production specification. The approved report comp remains the presentation schema. Any item selected from this reference must be fitted into that static schema or reviewed as a deliberate schema change.

"Can support" means the required fields exist. It does not mean every existing season has complete values for those fields. Missing data must render as a dash or explicit no-data state; it must never be inferred or presented as zero.

Custom fields do not count as first-class support unless the analytics engine owns their definition, cohort, denominator, film references, and empty-state behavior.

## Supported By Current Tags, Missing From The Defense Dashboard

- **Score by quarter and scoring summary.** Quarter and scoring results already exist.
- **First downs allowed.** Derivable from down, distance, yardage, touchdowns, and penalties.
- **Pass-defense line.** Completions/attempts, completion percentage, passing yards, touchdowns, interceptions, and sacks are supported by run/pass, result, and yardage.
- **Turnover detail.** Interceptions, fumbles, and fumbles lost/recovered can be separated instead of showing only aggregate Turnovers. Historical `fumbleRecovery` completeness is poor, so unresolved fumbles must remain unclassified.
- **Interactive drive chart.** Ordered plays, drive numbers, possession-ending results, field position, and film references exist. Accuracy depends on complete charting and correct possession reconstruction.
- **Formation-specific top runs and passes.** Formation can be crossed with play type, play call/concept, run/pass, yardage, and result.
- **Personnel-specific top runs and passes.** The same analysis can be grouped by personnel.
- **Formation x personnel x backfield comparisons.** These dimensions already exist but are mostly shown as isolated tables in the current dashboard.
- **Formation x down-and-distance.** Exact down and distance can be crossed with formation and outcome.
- **Formation x motion.** Motion type can be crossed with formation, play, and result.
- **Strength-relative direction.** Strong-side versus weak-side tendencies can be derived from `strength` and `playDir`.
- **Field-side versus boundary-side tendencies.** Hash, field side, strength, and play direction can support the comparison.
- **Exact-distance filtering.** Exact down and distance are stored even when the static dashboard summarizes them as 1-3, 4-6, and 7+.
- **Negative-play analysis.** Sacks, tackles for loss, and other negative plays can be grouped by formation, personnel, play type, and situation.
- **Opponent player usage.** Passer, ball carrier, and targeted receiver tendencies can be shown when the opponent roles are charted.
- **Film-linked totals and rows.** Existing composite play references and cross-game cutups can connect report values to their exact film cohorts.
- **Custom cross-tab reporting.** Study already supports much of the underlying pivot model needed to combine formation, personnel, play, down, distance, and other dimensions.

## Requires New First-Class Tags

- **Run-gap hit chart.** GridIron IQ has broad Left/Middle/Right direction, but no offensive A/B/C/D gap or named run-lane field.
- **Motion direction.** Motion type is charted; its starting side, destination, and direction are not.
- **Pass-location chart.** There is no left/middle/right passing zone, target location, or catch-location field.
- **Air yards versus yards after catch.** Only total yardage is stored.
- **Route tendencies.** Play Call and Play Concept do not identify each receiver's route.
- **Receiver release moves.** Release type is not charted.
- **Pass protection.** Protection type, adjustment, and responsible blocker are not charted.
- **Detailed offensive-line movement.** Puller, fold, trap, reach, combo, and similar blocking actions are not charted.
- **Two-minute and four-minute offense.** Quarter is insufficient; GridIron IQ does not store game clock or a first-class clock-situation tag.
- **Tempo and huddle behavior.** No-huddle, hurry-up, check-with-me, and time-between-snaps are not first-class charted fields.
- **Detailed defensive player events.** Tackler and takeaway roles exist, but pressures, hurries, quarterback hits, pass breakups, missed tackles, coverage responsibility, and defender targeted do not.
- **Formation diagrams tied to formation records.** The app can draw plays, but it has no reusable structured diagram attached to each formation in the reporting model.
- **Coach-defined situation identities.** High red, low red, goal line, sudden change, opening script, and similar concepts can sometimes be approximated, but they cannot always be distinguished without explicit tags.

## Governing Reporting Rules

- The dashboard is static. Data does not resize the approved composition.
- A fixed categorical set renders every required category, including zero-volume or missing-data slots.
- Ranked modules display the approved top-N count and cut the remainder deterministically.
- A missing value is `-` or No Data, never an invented zero.
- Comparable modules use the same measures in the same order.
- A displayed statistic must retain the exact film cohort used to calculate it.
- Broad and specific tags must not be presented as mutually exclusive peer categories when their cohorts overlap.

## Hudl Sources

- [Hudl Assist Football](https://www.hudl.com/products/assist/football): breakdown columns, game statistics, tendency reports, and interactive drive charts.
- [Hudl Assist FAQ](https://www.hudl.com/products/assist/faq): football Assist and Assist+ scope, player-specific tags, and video-linked data.
- [Assist+ for Football: Find the Answers That Drive Game Plans](https://www.hudl.com/blog/finding-answers-that-drive-football-gameplans): player filters, exact-distance filters, formation, motion, boundary/field, release moves, routes, and catch locations.
- [Creating a Collaborative and Efficient Defensive Gameplan](https://www.hudl.com/blog/creating-a-collaborative-and-efficient-defensive-gameplan): defensive workflow using formation, backfield, personnel, movement, targets, scheme, routes, pass zones, protection, field zones, and situations.
- [The 5 Most Common Football Reports](https://www.hudl.com/blog/the-5-most-common-football-reports): Summary, Formation, Down and Distance, Hit Chart, and Blitz reports.
- [How To Get More from Your Formation Report](https://www.hudl.com/blog/how-to-get-more-from-your-formation-report): formation-specific plays, gaps, strength, motion, backfield, pass zones, and boundary/field tendencies.
- [Taking Football Stat Reports to the Next Level](https://www.hudl.com/blog/taking-football-stat-reports-to-the-next-level): tendency reports, box scores, scoring summaries, drive charts, and video-linked playlists.
