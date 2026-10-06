# Break Down cleanup - review comp, 2026-10-05

Status: **COMP_APPROVED** by the coach, 2026-10-05 ("Comp approved to build"),
with the decisions below. Production is not built.

Still screens of the real built app (`1.12.0-110` source) with the canonical
2025 JV season, Week 6 vs Holy Family, play 39, and the proposed presentation
applied in the page (`capture.mjs`). Isolated browser data; no coach file or
film was written. `current-*` is today's app, `proposed-*` the proposal.

## The six agreed items

1. **Gold marks the primary action only.** Gold stays on Save & Next, the
   active route underline, the Offense unit tab (unit identity; Defense stays
   cyan) and scoring results in the play strip. The current-play badge is
   neutral graphite (coach decision below).
   Selected chips and the Chart / Film Room switch become a neutral light fill
   with dark text. Section headers (Situation, Formation & Call, ...) become
   neutral uppercase labels on a hairline instead of gold tabs. The Formation
   & Call value under the film is white.
2. **Settings leave the toolbar.** The toolbar keeps Chart / Film Room, Quick
   chart and Film focus. Our Program / Opponent Scout is removed: the season
   already says whether it is our program or a scout. Game settings, Customize
   fields and Templates move to the More menu's "This game" group.
3. **One Delete, one Save & Next.** Delete Play under the film is removed;
   Delete stays in the deck header beside Same as Last and Templates (Save
   Template moves into the Templates menu). The Enter hint on Save & Next is
   removed; the keyboard legend still lists it.
4. **The play strip shows full results.** Cards size to their text instead of
   a fixed 78px, so "Gain + Touchdown: +4" reads in full. A Special Teams snap
   shows its unit (Kickoff, Punt, Try, ...) instead of "Down -". The canonical
   copy's Special Teams values are blank, so play 43 reads "Special Teams"
   here; charted plays show their unit.
5. **More menu restyled** to match the context menus: a title, four labeled
   groups (This game, Season, Export, Tools), 32px rows, neutral sublabels in
   grey instead of blue, a neutral hover rule, the version as a footer.
6. **Get started copy** (Home, not shown): when the program has seasons, the
   pane leads with "Continue <latest season>" and Season library instead of
   "Create your first season".

## For the coach to decide

- Whether the current-play badge (PLAY 39) and the Offense unit tab keep gold,
  or go neutral too.
- Whether Templates stays in the deck header (proposed) or moves fully to More.

## Not changed

Chip size (27px) and 12px chip text, deck width, film area, route bar,
context selectors, play-strip order and drive grouping, and every data path.

## Variant

`proposed-badge-neutral-1440x900.png`: the same proposal with the current-play badge (PLAY 39) in neutral graphite instead of gold, at the coach's request for comparison.

## Coach decisions

- 2026-10-05: the current-play badge is neutral graphite ("neutral for sure").
  `proposed-badge-neutral-1440x900.png` is the reference for the badge.
- 2026-10-05: the Offense unit tab stays gold (unit identity). Templates stays
  in the deck header beside Same as Last and Delete, as drawn.

