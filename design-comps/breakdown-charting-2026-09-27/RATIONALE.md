# Break Down charting additions - review comp (2026-09-27)

Status: proposal only. The coach has not approved the field design or vocabulary. This comp changes no production code, stored charting data, analytics, or installer.

Design requirement: do not show "optional" subtext beside charting fields. Blank values remain valid where the data model permits them; the label does not need to announce that.

Open `index.html` and switch between Formation, Gap, Motion direction, RPO details, and QB run. The existing Chart workspace and section order are preserved. A cyan inset highlights each proposed field group; the rest of the deck provides placement and density context. The game/play values are illustrative, not a claim about the canonical season. The film is a repository asset used as a visual fixture. On-screen explainer prose was removed at the coach's request; rationale remains here.

## Placement and behavior proposed

- Formation & Call replaces the vague Our Offensive Look heading in this comp. Formation Family (e.g. Spread) and Receiver Set (e.g. 3x1) are separate selections. The film summary displays both together. QB Alignment, Backfield, Personnel, Motion, and Play Call remain distinct rows. The numeric set choices are receiver distributions, not package names or bunch/stack modifiers. The exact family and set vocabularies still need coach review.
- Gap belongs in Play & Result beside Play Type and Play Direction. It records the actual lane hit, not the called gap. A/B/C/D are paired with left/right, plus Other lane. It is optional and does not change yardage or run classification.
- Motion path belongs directly after Motion in Our Offensive Look. Start and end are separately optional; both use the offense's left/middle/right perspective. Motion type remains its own tag.
- RPO details appear only for an RPO play. Read defender and decision are separate from the existing Play Type and Run/Pass result. End/Apex/Box/Other and Give/Keep/Throw are provisional vocabulary.
- The film detail line echoes the new selection as soon as the view changes, so the coach can verify the tag without scrolling back through the deck. A defender jersey number is an optional RPO detail when it is visible on film; no number is inferred.
- QB run is a distinct review state with Designed, Scramble, and RPO keeper choices, plus the same optional Gap vocabulary. It charts intent separately from Run/Pass and the QB as ball carrier. This expands the comp only; its separate future roadmap priority has not been moved into implementation scope.
- New chips keep the current deck's text size and use compact vertical padding. There is no separate wizard or modal and no change to Save & Next.

## Coach decisions before implementation

1. Is left/right A-D plus Other lane the right gap-hit vocabulary? Should an outside/edge lane be named instead of D or Other?
2. Should motion path use left/middle/right, a precise origin/destination (e.g. wide/slot/backfield), or both? Should it capture who moved?
3. For RPO, which read types and decisions do your coaches actually chart? Should the read defender identify a player, a defender role, or both?
4. Is the placement and density usable in the live deck at desktop and narrower widths?
5. Should QB run classification join this implementation checkpoint, and are Designed, Scramble, and RPO keeper the right mutually exclusive choices?
6. Which formation families and receiver sets should be in the default library, and where should modifiers such as Bunch, Unbalanced, Goal Line, and Victory live?

Implementation, if approved, needs owned tag definitions, editing/clear semantics, Film Room columns and detail, reporting/export handling, and focused tests. The production Formation field currently mixes family, set, and package concepts; this comp does not change that model or migrate data. No historical plays should be inferred or backfilled.

## Competitor references

- [QwikCut Advanced Stat Entry](https://support.qwikcut.com/portal/en/kb/articles/football-stat-entry-advanced-22-7-2023) documents a per-clip, editable column workflow. Its listed defaults include Motion Direction (left/right) and RPO as a Play Type; entered values also appear near the video. The comp keeps the coach's requested start and end, which goes beyond that documented motion-direction field.
- [Hudl's coach-authored custom columns](https://www.hudl.com/blog/3-custom-columns-that-get-you-quick-answers-in-hudl-beta) let staffs chart concepts specific to their scheme. [Another Hudl coach example](https://www.hudl.com/blog/five-useful-custom-columns) uses a defender jersey column. The optional number in this RPO proposal follows that flexible pattern, but the exact RPO vocabulary still needs coach approval.
- [Hudl's game-planning examples](https://www.hudl.com/blog/finding-answers-that-drive-football-gameplans) use distributions such as 2x2 and 3x1. [QwikCut's football page](https://www.qwikcut.com/football/) lists Offensive Formation and Backfield separately. Neither source establishes a universal picker vocabulary; Family and Receiver Set here are a GridIron IQ proposal.
- These are public documentation examples, not a claim that either product has this exact three-field design. The comp borrows their quick per-play feedback and extensibility while preserving GridIron IQ's existing Chart deck and Save & Next workflow.

## Visual check

The five views were captured at 1440x900 and 390x844. Each view shows its own proposed group, the film asset loads, and neither viewport has horizontal document overflow. The screenshots are review evidence, not production acceptance.
