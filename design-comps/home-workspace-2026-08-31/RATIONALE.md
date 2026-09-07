# Home: Library, Context, And Structured Setup

Status: coach APPROVED on 2026-08-31 ("looks great"). Approved for production implementation under `BUILD-HANDOFF.md`; this folder remains a design-only reference, not production code. No production Home, saved season, film path, or persistence contract changed in the comp work. Preview with the existing Vite server at `/design-comps/home-workspace-2026-08-31/home.html`.

## Competitor Precedent Versus Our Decisions

Hudl's public Library screenshot is the primary reference: team context, searchable/filterable film, grid/list selection, and a selected-video panel with actions. Source: https://support.hudl.com/s/article/add-or-edit-video-details-hudl-v3?topic=Watch_and_Manage_Video_V3 . The retrieved support image is saved in `references/hudl-library.png`; the article body itself did not load reliably. Visible interface evidence does not establish its underlying database or validation rules.

The Classic Home reference (`references/hudl-classic-home.png`) is explicitly dated 2020, not a claim about today's Hudl Home. Source: https://support.hudl.com/s/article/playback-controls-hudl-classic . Its social feed and account profile are not appropriate requirements for this local-first app and were not copied.

QwikCut documents persistent team/season context and switching: https://support.qwikcut.com/portal/en/kb/articles/all-sports-banner-title-season-1-4-2022 . Its roster documentation also exposes season filtering: https://support.qwikcut.com/portal/en/kb/articles/football-cleaning-up-rosters . That is precedent for visible context, not evidence that its roster ownership equals ours.

Program -> year/level season -> games, generated display names, and duplicate prevention are OUR proposed product rules. We have not verified that Hudl requires this exact hierarchy or rejects duplicate year/level combinations.

## Organizing Contract

Coach batch revision (2026-08-31): school/organization and nickname are separate explicit fields for programs, opponents, and source-game teams. Full names remain available; compact matchup labels use nicknames, e.g. Mavericks vs. Wildcats, with school context retained below. Missing nicknames fall back to intact names; colliding nicknames use full identities. Fixture nicknames are supplied explicitly, never inferred by substring removal. New forms keep these fields separate on editing; the compatibility full-name field is composed from them. No saved production records are migrated.

- Program is the stable organization identity, separate from year and level. Reuse the existing team ID; no account profile is required.
- A Program season requires a year and level. Suggested levels are Varsity, JV, Freshman, plus an explicit custom level. Generate the display label, such as `2026 · JV`, rather than asking coaches to encode all metadata in a free-text season name.
- Display names are never identity keys. Preserve season/game IDs and all references when names change.
- The comp blocks a duplicate program/year/level and offers Open existing season. Separate squads must have an explicit distinguishing level/squad value. Before production, settle that exception rather than silently merging or preventing legitimate teams.
- Years sort descending; standard levels have a stable order. Games support date-based Newest first and Schedule order, with undated games last and deterministic ties. Do not infer dates from filenames or season titles.
- Opponent Scout remains separate. Opponent/year/level identify the scouting collection; each source game has its own two teams. Scout data must not enter our season totals or roster.
- Existing data is not renamed, merged, rekeyed, relocated, or rejected by this comp. Legacy missing metadata needs an explicit correction path, not guessed parsing. Existing duplicates remain accessible. New validation must live at the production creation/edit boundary, not only in form markup.

## Home Is The Navigation Hub

One global top navigation remains. The left rail contains season context and scoped tools, not a second copy of global navigation. The main surface is the film library; the right panel gives the selected game's status and next actions.

| Home action | Scope and production owner |
| --- | --- |
| Switch season / Season library | Existing `storage.openSeasonById` / native Team Hub; clear stale selected-game preview |
| Add game | Existing GameScreen creation flow; preserve Program/Scout contract |
| Break Down / Study / Reports | `app.openGame(selectedId, {route})`; never route while leaving another game active |
| Season report | Open Reports and explicitly select its Season tab |
| Season plans | Existing season-owned PlanScreen; no invented game-plan association |
| Roster | Current Program season only, through guarded Team Hub/Settings owner |
| Film and storage / Manage film | Existing settings/linking operations; distinguish library root from a game's folder |
| Season setup | Existing read-only, rerunnable, fully skippable guide |
| Manage program / Recover | Existing owners; recovery remains explicit, never an automatic import |

First use defaults to Guided setup with Set up manually available. Existing seasons default to quick creation with guided setup optional. Every step and the whole guide can be skipped; reopening it does not recreate a season.

## Composition

Uses the real design-system token, Plex, and material stylesheets and existing icon sprite. Neutral labels, readable sans UI text, gold Program and cyan Scout accents. No social feed, huge summary-card band, duplicate global navigation, or explanatory hero.

Desktop has a compact context rail, two/three-column film grid, and selected-game details. The first iteration's duplicate large preview pushed its actions too far down; replaced it with a compact thumbnail/title. Narrow layouts stack details and expose years on the compact season choices. Mobile containment is checked, not a declaration of a finished mobile workflow.

## Fixture And Implementation Boundaries

- All comp changes are in memory and reset on reload. Route actions show destination previews, not rebuilt production routes. File selection retains a filename only: no upload, copy, or filesystem mutation.
- Six-game 2025 JV identities, scores, and play totals follow the supplied coach examples. Supplemental durations, counts, and roster examples are illustrative, not freshly verified analytics. Other seasons/scout games are synthetic workflow fixtures.
- Five thumbnail JPEGs were extracted read-only from local coach film by `prepare-film.mjs`. The ND Prep/scout fixtures use honest placeholders rather than unrelated footage. These private media fixtures must not be published without authorization.
- Production thumbnails require generation/caching and missing/stale-image handling. This comp does not implement that infrastructure or authorize moving the coach's film.
- Production film health must preserve checking, missing, unauthorized, and ready states. A saved link alone is not proof of playable film.
- Existing year/level inputs are not equivalent to the proposed enforced structure. Generated naming, duplicate checks, legacy metadata editing, and shared boundary validation are real product work to scope before implementation.

## Verification

Latest coach-feedback batch: reduced bottom padding and removed the forced gap above Local library; spaced its program name; inset the selected-game panel on both sides and allowed narrow control rows to wrap; changed roster links to View roster with separate counts; replaced the resume save icon with Play; added a subtle raised selected navigation state without geometry movement; and separated a dashed COMP ONLY footer labeled Preview scenario / Season loaded from the app. First-use bottom padding is reduced. Breakdown's deferred Edit Library width request remains untouched.

Latest run: 87 focused checks pass, zero page errors. Added right-panel inset, roster-action copy, resume icon, nickname creation/edit round-trip, same-nickname full-name fallback, and intact legacy-name checks. 23 captures include identity forms and explicit bottom-of-page views. Populated Home, narrow desktop progress, first-use bottom, and scout creation screenshots were opened and inspected; a nickname label/input misalignment found there was repaired. Preview scenario resets also clear transient announcements so captures are not contaminated. These checks establish comp behavior, not production integration.

Coach revision: year groups now use dedicated 18px semibold headings with identical heading-to-first-season spacing, rather than the generic muted subtitle. Season buttons carry full program/year/level accessible names. Added direct checks for equal year gaps and switching to the 2026 Varsity roster: 73 checks now pass. Roster is available for every selected Program season, including an empty roster; fixture counts are not live data. Film linking is game-scoped, but the library root remains shared and Manage program remains program-wide.

`node design-comps/home-workspace-2026-08-31/verify.mjs`: 68 focused checks, zero page errors. Exercises selected-game routing, season scope, workspace isolation, search/filter/sort, duplicate handling, generated naming, guided/manual creation, skip/reopen behavior, image loading, and viewport containment. Output: `captures/verification.json`.

19 captures include populated season, season library, first use, scout, partial charting/missing film, list view, creation/duplicate forms, and guide; widths 1920, 1440, 1280, 768, and 390. Representative desktop/narrow compositions and forms were opened and visually inspected separately from measurements. No production gate, installer, commit, or release was run for this design-only checkpoint.
