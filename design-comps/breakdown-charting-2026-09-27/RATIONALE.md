# Break Down charting additions - review comp (2026-09-27)

Status: coach-approved for implementation on 2026-09-28, including inline disclosure and compact desktop chips. The production fields, analytics, installer, and installed smoke are not complete. The build contract is in `GRIDIRON-IQ-PLAN-V2.md` under "Approved Break Down charting comp."

Design requirement: do not show "optional" subtext beside charting fields. Blank values remain valid where the data model permits them; the label does not need to announce that.

Open `index.html` and switch between Formation, Gap, Motion direction, RPO details, and QB run. Those floating tabs are review shortcuts only, not a charting step. In the deck, choosing a Motion chip reveals its path immediately below the chips; choosing Run, RPO, or QB Run in Play Type reveals that play's detail directly below the choice. Neither action scrolls the deck. The existing Chart workspace and section order are preserved. A cyan inset highlights each approved field group; the rest of the deck provides placement and density context. The game/play values are illustrative, not a claim about the canonical season. The film is a repository asset used as a visual fixture. On-screen explainer prose was removed at the coach's request; rationale remains here.

## Approved placement and behavior

- Formation & Call replaces the vague Our Offensive Look heading in this comp. Formation Family (e.g. Spread) and Receiver Set (e.g. 3x1) are separate selections. The film summary displays both together. QB Alignment, Backfield, Personnel, Motion, and Play Call remain distinct rows. The numeric set choices are receiver distributions, not package names or bunch/stack modifiers. Shown choices are v1 examples, not a license to delete existing coach library choices.
- Gap belongs in Play & Result beside Play Type and Play Direction. It records the actual lane hit, not the called gap. A/B/C/D are paired with left/right, plus Other lane. It is optional and does not change yardage or run classification.
- Motion path belongs directly after Motion in Formation & Call. Selecting a Motion type reveals Starts and Ends side by side in place, with no trip to the review tabs or scroll jump. Start and end are separately optional; both use the offense's left/middle/right perspective. Motion type remains its own tag.
- RPO details appear only for an RPO play. Read defender and decision are separate from the existing Play Type and Run/Pass result. End/Apex/Box/Other and Give/Keep/Throw are the approved v1 choices shown here, not inferred from old plays.
- The film detail line echoes the new selection as soon as the view changes, so the coach can verify the tag without scrolling back through the deck. A defender jersey number is an optional RPO detail when it is visible on film; no number is inferred.
- QB run is a distinct review state with Designed, Scramble, and RPO keeper choices, plus the same optional Gap vocabulary. It charts intent separately from Run/Pass and the QB as ball carrier. It is now part of the approved charting implementation checkpoint.
- Desktop chips keep the current deck's text size and horizontal padding while reducing vertical padding from 5px to 4px (29px to 27px in the comp). Coarse-pointer controls retain their larger touch target in production. There is no separate wizard or modal and no change to Save & Next.

## Implementation boundaries

The choices visible in the comp are the initial UI contract. Do not silently
reclassify existing Formation values such as Trips, Bunch, Goal Line, or Victory;
the current stored Formation field mixes different kinds of look. Preserve and
show those exact values on historical plays until the coach explicitly retags
them. This comp does not approve a data migration or a universal formation
taxonomy. Keep the library extensible without crowding this first view.

Implementation needs owned tag definitions, editing/clear semantics, Film Room columns and detail, reporting/export handling, and focused tests. No historical plays should be inferred or backfilled.

## Competitor references

- [QwikCut Advanced Stat Entry](https://support.qwikcut.com/portal/en/kb/articles/football-stat-entry-advanced-22-7-2023) documents a per-clip, editable column workflow. Its listed defaults include Motion Direction (left/right) and RPO as a Play Type; entered values also appear near the video. The comp keeps the coach's requested start and end, which goes beyond that documented motion-direction field.
- [Hudl's coach-authored custom columns](https://www.hudl.com/blog/3-custom-columns-that-get-you-quick-answers-in-hudl-beta) let staffs chart concepts specific to their scheme. [Another Hudl coach example](https://www.hudl.com/blog/five-useful-custom-columns) uses a defender jersey column. The optional number in this RPO proposal follows that flexible pattern, but the exact RPO vocabulary still needs coach approval.
- [Hudl's game-planning examples](https://www.hudl.com/blog/finding-answers-that-drive-football-gameplans) use distributions such as 2x2 and 3x1. [QwikCut's football page](https://www.qwikcut.com/football/) lists Offensive Formation and Backfield separately. Neither source establishes a universal picker vocabulary; Family and Receiver Set here are a GridIron IQ proposal.
- These are public documentation examples, not a claim that either product has this exact three-field design. The comp borrows their quick per-play feedback and extensibility while preserving GridIron IQ's existing Chart deck and Save & Next workflow.

## Visual check

The five views were captured at 1440x900 and 390x844 with 27px comp chips. Direct chip-to-detail flows were also captured for Motion at both widths. Each view shows its own proposed group, the film asset loads, and neither viewport has horizontal document overflow. The screenshots are review evidence, not production acceptance.
