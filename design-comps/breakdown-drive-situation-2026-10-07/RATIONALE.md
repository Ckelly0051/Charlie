# Drive in Situation - review comp, 2026-10-07 (revision 2)

Status: **COMP_APPROVED** by the coach, 2026-10-07 ("yes" to build revision 2).
Production is not built.

Coach direction (2026-10-07): move Drive into the Situation group's second row;
the Drive box needs room for two digits only; the New Drive button goes away.
Revision 1 (Drive as its own row, first or last, with New Drive) was set aside.

Still screens of the real built app (`c78e2445` source) with the canonical 2025
JV season, Week 6 vs Holy Family, play 39 (its stored Drive is 5), with the
change applied in the page (`capture.mjs`). Nothing is mocked. Isolated browser
data; no coach file or film was written.

## The change

- Situation's second row is Hash, Field position, Yard line, **Drive**.
- Both rows share one four-column grid, so Distance stays over Yard line and
  Down over Field position at every width; the first row's fourth slot is
  empty.
- Distance and Yard line boxes are 54px and Drive is 40px (two digits; Drive
  is 1-30). The number boxes lose their up/down arrows, which clipped two
  digits at these widths; typing and the arrow keys are unchanged.
- Quarter and Down chips lose 1px of side padding each (6px to 5px) so the
  row fits the 376px deck at 1440 and 1280. Chip height and text size are
  unchanged.
- The Drive row and **New Drive** leave Notes & Details; New Drive is removed
  (`PlayTagger.newDrive` and its deck action go with it).

Measured: no page or row overflow at 1920 (460px deck), 1440 and 1280 (400px
deck, 376px inside); the four columns use 372px at 1440. The deck width comes
from the window, not from its content: six favorite calls leave it at 400px
(1440) and 460px (1920).

Screens: `current-situation-1440.png`, `proposed-situation-{1920,1440,1280}.png`,
`proposed-1440x900.png`, `proposed-1280x800.png`.

## Not changed

The other Situation fields and their values, chip height and text, deck width,
the play strip and its drive grouping, and every data path.
