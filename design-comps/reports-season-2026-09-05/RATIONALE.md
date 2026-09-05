# Reports > Season desktop comp

Date: 2026-09-05

Status: ready for Charlie Gate; no production implementation is implied.

## Why Season is next

Season aggregates Offense, Defense, Special Teams, Players, and Self-Scout.
Those child reports now have approved desktop compositions, so the Season
container can reuse them without freezing obsolete layouts. Matchup has no
dependency on Season and remains the final Reports comp.

## Ownership

Season owns only:

- season identity and aggregate KPIs;
- the chronological game log;
- season situational and scoring summaries;
- cross-game progression and wins-versus-losses comparisons;
- the tab container and season export command.

Offense, Defense, Special Teams, Players, and Self-Scout reuse their approved
Reports boards at full-season scope. Season must not create alternate versions.

## Information architecture

The existing seven section names remain: Overview, Offense, Defense, Special
Teams, Players, Self-Scout, Trends.

Overview contains the six season KPIs, a chronological oldest-first Game Log,
Situational Offense, and Scoring & Possessions. The Game Log carries Week,
Date, Opponent, Result, Score, Plays, rushing yards, passing yards, total yards,
success rate, and turnover margin.

Trends owns Early vs Recent, Wins vs Losses, and Game-by-Game results. This
moves Wins vs Losses and the per-game box score out of Players, where neither
belongs. The comparison is dry reporting: values, deltas, and literal status.

## Presentation rules

- IBM Plex loads from the bundled design-system stylesheet.
- Module titles are 14px Plex Sans; table headers are 12px semibold Plex Sans;
  table rows are 13px on a 38px row.
- No module subheads, explanatory captions, recommendations, or coaching prose.
- The report is one ruled surface, not a card collection.
- Density comes from composition, not smaller text.
- The Season tab does not render the game-specific KPI rail. Its own summary
  band is the scope owner.
- Child report tabs retain their approved composition and exact film actions.
- Game Log order is chronological oldest first, based on game date with the
  existing SeasonStore chronological fallback.

## Open decisions for Charlie

1. Whether `Yards / Game` or `Total Yards` belongs in the sixth-KPI set.
2. Whether Situational Offense remains on Overview or moves into Trends.
3. Whether the compact scoring-by-quarter table is preferable to the current
   bar treatment.
4. Whether a Game Log row opens that game in Reports or immediately plays the
   game's full film cohort.

## Revision 2

- Aggregate Turnover Margin replaces Offensive Plays in the Overview KPI band.
- The Game Log column is labelled `Success Rate`.
- The 1440 layout adds 12px above the Season board; 1280 spacing is unchanged.
- Early vs Recent and Wins vs Losses use the same six metrics in the same order:
  Success Rate, Yards / Play, 3rd Down Rate, Points / Drive, Turnover Margin /
  Game, and TD / Game.
- Early vs Recent deltas retain their units. Percentage rates use percentage
  points (`pp`); per-play and per-game measures name those units. Raw and rate
  changes can no longer look directly comparable by accident.
- Turnover Margin / Game is derived from the same game-level margin shown in
  the Game Log. The fixture reconciles to `0.0` for both four-game windows,
  `+0.8` across wins, and `-2.5` across losses.
- The compact table label is `TO Margin / Game`; both comparison panels use it
  and receive equal width because they are intended to be read together.
- `Success Rate` is the label in both Game Log and Game-by-Game.

## Revision 2 verification

- Reviewed populated Overview and Trends at 1440x900 and 1280x720.
- No page-level horizontal overflow, clipped comparison values, or missing font
  faces at either viewport.
- The two comparison panels remain side by side at both widths, with matching
  metric rows aligned horizontally.
- The 1440 board has additional top separation; the 1280 density is unchanged.
