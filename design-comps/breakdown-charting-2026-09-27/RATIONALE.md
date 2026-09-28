# Break Down charting additions - review comp (2026-09-27)

Status: proposal only. The coach has not approved the field design or vocabulary. This comp changes no production code, stored charting data, analytics, or installer.

Open `index.html` and switch between Run gap hit, Motion direction, and RPO details. The existing Chart workspace and section order are preserved. A cyan inset highlights each proposed field group; the rest of the deck provides placement and density context. The game/play values are illustrative, not a claim about the canonical season. The film is a repository asset used as a visual fixture.

## Placement and behavior proposed

- Run gap hit belongs in Play & Result beside Play Type and Play Direction. It records the actual lane hit, not the called gap. A/B/C/D are paired with left/right, plus Other lane. It is optional and does not change yardage or run classification.
- Motion path belongs directly after Motion in Our Offensive Look. Start and end are separately optional; both use the offense's left/middle/right perspective. Motion type remains its own tag.
- RPO details appear only for an RPO play. Read defender and decision are separate from the existing Play Type and Run/Pass result. End/Apex/Box/Other and Give/Keep/Throw are provisional vocabulary.
- The film detail line echoes the new selection as soon as the view changes, so the coach can verify the tag without scrolling back through the deck. A defender jersey number is an optional RPO detail when it is visible on film; no number is inferred.
- New chips keep the current deck's text size and use compact vertical padding. There is no separate wizard or modal and no change to Save & Next.

## Coach decisions before implementation

1. Is left/right A-D plus Other lane the right gap-hit vocabulary? Should an outside/edge lane be named instead of D or Other?
2. Should motion path use left/middle/right, a precise origin/destination (e.g. wide/slot/backfield), or both? Should it capture who moved?
3. For RPO, which read types and decisions do your coaches actually chart? Should the read defender identify a player, a defender role, or both?
4. Is the placement and density usable in the live deck at desktop and narrower widths?

Implementation, if approved, needs owned tag definitions, editing/clear semantics, Film Room columns and detail, reporting/export handling, and focused tests. No historical plays should be inferred or backfilled.

## Competitor references

- [QwikCut Advanced Stat Entry](https://support.qwikcut.com/portal/en/kb/articles/football-stat-entry-advanced-22-7-2023) documents a per-clip, editable column workflow. Its listed defaults include Motion Direction (left/right) and RPO as a Play Type; entered values also appear near the video. The comp keeps the coach's requested start and end, which goes beyond that documented motion-direction field.
- [Hudl's coach-authored custom columns](https://www.hudl.com/blog/3-custom-columns-that-get-you-quick-answers-in-hudl-beta) let staffs chart concepts specific to their scheme. [Another Hudl coach example](https://www.hudl.com/blog/five-useful-custom-columns) uses a defender jersey column. The optional number in this RPO proposal follows that flexible pattern, but the exact RPO vocabulary still needs coach approval.
- These are public documentation examples, not a claim that either product has this exact three-field design. The comp borrows their quick per-play feedback and extensibility while preserving GridIron IQ's existing Chart deck and Save & Next workflow.

## Visual check

The three views were captured at 1440x900 and 390x844. Each view shows its own proposed group, the film asset loads, and neither viewport has horizontal document overflow. The screenshots are review evidence, not production acceptance.
