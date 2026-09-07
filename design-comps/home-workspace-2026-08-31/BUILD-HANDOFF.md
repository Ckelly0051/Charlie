# Claude Build: Approved Home And Structured Season Workflow

## Objective And Authority

Implement the coach-approved Home comp as the real Home experience. This includes navigation, structured creation/editing and accurate data context, not just CSS around the old Home. The coach approved the current local comp on 2026-08-31. Codex reviews your finished implementation. Do not build an installer, publish, release, tag, or deploy in this task.

Work in `C:/Users/charl/Charlie`. Read the current top entries of `CLAUDE.md`, the Current Home section of `GRIDIRON-IQ-PLAN-V2.md`, and this folder's `RATIONALE.md`. Render `home.html` and inspect populated, library, progress, first-use and scout states before implementing. `home.css`, `home.js` and `captures/` define the approved composition and interactions. Do not substitute an earlier comp. Do not edit the reference to make a diverging implementation look compliant.

Baseline warning: HEAD was `616ae83` at handoff, but the working tree contains accepted uncommitted Breakdown work, design-system changes, packaging files and untracked design artifacts. The approved Home comp is local/untracked. A clean checkout of HEAD is NOT the baseline. Inventory current changes first; preserve them. Do not reset/clean/stash the tree or stage everything. Do not publish private coach thumbnails, screenshots, seasons, or film fixtures.

## Execution: Precise And Efficient

1. Trace the actual Home, Team Hub, game-open, setup, settings, team/season identity and thumbnail paths once. Identify existing owners, metadata fields and save/load boundaries. State any concrete blocker early; do not silently shrink the scope or invent a second state store.
2. Implement a coherent end-to-end change using existing domain services and native UI patterns. Promote reusable comp styles/components where appropriate; the comp's in-memory store and destination-preview dialogs are NOT production implementations. Replace the superseded Home rendering and retire obsolete code only where this work makes it unreachable. No unrelated cleanup campaign or broad rewrite.
3. Work continuously, with concise progress updates, rather than stopping after every component or creating pre-planned review commits. Resolve ordinary implementation choices yourself. Escalate only a genuine product/data ambiguity or a dependency that materially changes the scope.
4. Use focused tests during development. Render early, fix visual defects while building, then run the relevant production suites and one final build. Do not run the entire gate after every small edit. One final canonical gate is appropriate if shared bootstrap, navigation or persistence contracts actually change; otherwise report the focused scope and its limitations. Never weaken a contract just to obtain green results.
5. Finish with one coherent implementation commit if your changes can be isolated from the pre-existing work. Stage only your changes; do not absorb the dirty baseline. If the changes cannot be safely separated, leave them intact and explain the exact overlap rather than committing someone else's work. No push or packaging; hand off for independent review.

## Binding Visual Contract

- Match the approved composition: one global top navigation, raised selected tab, Program/Scout workspace choice, program selector, year-grouped season rail, searchable/filterable film grid/list, selected-game panel, and scoped tools. The rail is context navigation, not a duplicate global nav.
- Preserve the real design-system fonts, colors and readable control sizes. No tiny text, hazy blue labels, giant empty panels, hidden controls, arbitrary layout substitutions or a generic dashboard redesign. Keep prominent year headings with equal spacing, right-panel interior padding, compact bottom spacing, and separated Local library/program text.
- Use View roster as an action with the player count separate; use Play for resume, not Save. Use explicit nickname matchup labels with school context. No production COMP ONLY toolbar, scenario selector, sample claims, placeholder destinations, or explanatory design copy.
- Production has full data, not only six fixture games. Handle long school names, large libraries, missing film and empty seasons without clipping or hiding functionality to match a screenshot.
- Geometry tests are necessary but NOT visual acceptance. Capture the live route and approved comp at the same viewport/state and actually open both images. Judge hierarchy, spacing, alignment, font weight/color, wrapping, dead space, control affordances and bottom/right boundaries. Do not claim a match because scrollWidth passed. Fix visible discrepancies before handoff.
- Compare desktop at 1920x1080, 1440x900 and 1280x720, plus usable containment at 768 and 390. Cover populated, partial/missing-film, library, first-use, scout and creation/edit states; inspect lower-page and scrolled content as well as the first viewport. Use safe copies of populated coach data and honest empty states; avoid transient toasts in evidence. Do not expand this into a new mobile redesign.

## Data And Naming Contract

- Program is the organization, independent of year/level. A season is a year + level within a program. JV and Varsity in the same year are independent seasons with independent rosters, games and reports. IDs remain the identity; names are labels.
- New Program seasons require structured year and level. Offer Varsity/JV/Freshman and an explicit custom level for legitimate alternatives such as JV A/JV B. Generate the season display label. Preserve all existing seasons, including missing metadata or duplicate labels; allow explicit metadata correction without reconstructing their IDs or ownership.
- Prevent NEW duplicate program/year/level combinations at the actual shared creation/edit boundary, including async overlapping submissions; provide Open existing season. Rename/edit excludes the current record from duplicate detection. Explicit custom levels distinguish squads; do not merge or guess squad identities. Scout duplicate checks include opponent identity and do not collide with our Program season namespace.
- Separate school/organization from nickname for our program and opponents/source-game teams. Reuse existing compatible fields; do not create competing metadata authorities. Nickname is optional. Full identity remains visible/available; compact labels can read Mavericks vs. Wildcats. Missing nickname falls back to the intact name; identical nicknames use full names. Never split old names heuristically or overwrite them on load. Keep metadata through save/reopen/export/import where the existing contract carries it; test both supported persistence backends for fields you add.
- Keep each scout game's actual Team A/Team B identity and score ownership, including edits. Do not replace saved source-game names with a collection default. No Program roster leakage into scouting. No profile/account requirement.
- Sort years descending and levels consistently; games have Newest first and Schedule order based on stored dates, with deterministic ties and undated games last. Do not derive dates from filenames or titles.
- Guided setup defaults on when no seasons exist; Set up manually bypasses it. With existing seasons, Quick create defaults on and guided setup is optional. Every step and the entire guide are skippable; the guide can be reopened without recreating or clearing anything. Retain existing Program/Scout distinctions.
- No silent migration, season merge, data deletion, film relocation or live-catalog test writes. If a schema change is truly necessary, use the established additive/backward-compatible path and disclose it. Do not redesign persistence.

## Real Navigation And Film Behavior

Every Home action must reach its genuine destination. Reuse `app.openGame(selectedId, {route})` for game-specific Break Down/Study/Reports instead of showing a route under the wrong active game. Season report must explicitly select the Season view. Plans remain season-owned; do not invent per-game plan associations. Preserve return-to-Home/Season-library paths and clear stale selected-game context on season/program/workspace changes.

Roster and setup follow the selected Program season, even when empty. Film links follow the selected game; the library root is shared and cannot be rewritten by selecting a game folder. Manage program remains program-wide. Existing recovery is explicit and confirmed, never automatic. Keep film health distinctions: checking, missing, inaccessible and ready; a path alone is not proof of playable film.

Implement actual thumbnails from available film through an existing service if available, otherwise a small bounded, lazy thumbnail owner. Do not decode every video on Home open, interfere with the charting player, or block interaction while generating images. Cache by stable game/film identity, invalidate on relink/change, clean up resources, and prevent late work from painting another season's cards. Missing/unreadable film gets an honest fallback. Never ship the comp's private JPEGs as app assets or hardcode fixture scores, durations, player counts or charting totals. Use the existing analytics/status owners.

## Evidence And Completion

Targeted production checks must prove selected versus active game routing; duplicate IDs across games; season/program/scout isolation; empty-season roster access; structured metadata and nickname round-trip; duplicate prevention; guided/manual/skip/reopen behavior; film-link/root separation; thumbnail failure and stale-work handling; search/filter/sort; and keyboard/focus behavior. Extend the nearest existing harnesses rather than building a parallel testing framework. The comp's 87 passing checks are reference evidence, not proof of production integration.

Update `CLAUDE.md`, `GRIDIRON-IQ-PLAN-V2.md` and the handoff record with exact files/owners replaced, verification commands/results, inspected screenshot paths, any test-contract changes, and genuinely remaining limitations. Report what is complete and what is not. Do not claim zero risk from passing tests. If a visual or functional requirement is unmet, identify it plainly instead of calling the milestone complete.

The deferred Breakdown Edit Library/column-width adjustment is OUT OF SCOPE. Do not redesign other routes, change football formulas, or take on dormant obsolete code with no bearing on Home. Be efficient by reusing owners and verifying concrete risks, not by skipping behavior, visual inspection or data safety.
