# V2-A Home And Context Canon

Approved by the coach on 2026-08-23.

The production V2-A implementation must follow `home-1440x900.png` and the
interactive `home.html` as its visual and interaction canon. The open season
selector is captured in `season-switcher-1440x900.png`.

Binding decisions:

- Program, Season, and Game are persistent, prominent context selectors.
- Season switching is available throughout the application and safely returns
  to the selected season's Home.
- Home is a season command center, not a season-management placeholder.
- Whole game rows select a game and populate the summary without opening it.
- Continue Charting, Study, and Reports are available from the selected game.
- Left navigation uses obvious button-like hover, focus, and selected states.
- The six-game real season fits in one 1440x900 viewport without page overflow.
- `Our Program` / `Opponent Scout` establishes the future workspace entry but
  V2-A does not build the opponent-scout creation workflow.

Claude owns production implementation. Any material departure from this canon
returns to the coach and Codex for approval before it is built.
