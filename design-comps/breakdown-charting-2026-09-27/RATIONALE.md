# Break Down charting additions - review comp (2026-09-27)

Status: proposal only. The coach has not approved the field design or vocabulary. This comp changes no production code, stored charting data, analytics, or installer.

Open `index.html` and switch between Run gap hit, Motion direction, and RPO details. The existing Chart workspace and section order are preserved. A cyan inset highlights each proposed field group; the rest of the deck provides placement and density context. The game/play values are illustrative, not a claim about the canonical season. The film is a repository asset used as a visual fixture.

## Placement and behavior proposed

- Run gap hit belongs in Play & Result beside Play Type and Play Direction. It records the actual lane hit, not the called gap. A/B/C/D are paired with left/right, plus Other lane. It is optional and does not change yardage or run classification.
- Motion path belongs directly after Motion in Our Offensive Look. Start and end are separately optional; both use the offense's left/middle/right perspective. Motion type remains its own tag.
- RPO details appear only for an RPO play. Read defender and decision are separate from the existing Play Type and Run/Pass result. End/Apex/Box/Other and Give/Keep/Throw are provisional vocabulary.
- New chips keep the current deck's text size and use compact vertical padding. There is no separate wizard or modal and no change to Save & Next.

## Coach decisions before implementation

1. Is left/right A-D plus Other lane the right gap-hit vocabulary? Should an outside/edge lane be named instead of D or Other?
2. Should motion path use left/middle/right, a precise origin/destination (e.g. wide/slot/backfield), or both? Should it capture who moved?
3. For RPO, which read types and decisions do your coaches actually chart? Should the read defender identify a player, a defender role, or both?
4. Is the placement and density usable in the live deck at desktop and narrower widths?

Implementation, if approved, needs owned tag definitions, editing/clear semantics, Film Room columns and detail, reporting/export handling, and focused tests. No historical plays should be inferred or backfilled.

## Visual check

The three views were captured at 1440x900 and 390x844. Each view shows its own proposed group, the film asset loads, and neither viewport has horizontal document overflow. The screenshots are review evidence, not production acceptance.
