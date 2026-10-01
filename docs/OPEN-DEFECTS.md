# GridIron IQ Open Defects

## Source repair, 2026-10-01

**S107-7 - P2, kickoff grouping crosses possession/half boundaries,
REPAIRED IN SOURCE / not packaged.** The strip formerly treated Special Teams
as transparent by drive number and pooled blank kickoff tags into No drive.
`groupPlaysByDrive` now resolves structured kickoff sequences without writing
tags. A blank kickoff may borrow the next scrimmage snap's assigned drive only
before another counting kickoff, a return touchdown, an unrelated/uncharted ST
snap or a half/regulation boundary. Explicit drive numbers are retained.
Unnumbered terminal kicks stay separate: End of half, End of regulation or Kickoff when
there is no evidence for a more specific label. A return TD and its subsequent
try/defending-a-try stay in Kick return touchdown, never the next drive. Re-kicks
join only when the preceding same-unit kick is explicitly no-play.
Read-only live proof: 2025 JV Week 1 play 43 is End of half; play 44 joins
Our Drive 5 (44-50). 2026 JV OLL play 40 is End of half; play 41 joins Our
Drive 6 (41-45). Catalog hash unchanged. Failing-first model tests and rendered
strip checks pass; analytics parity unchanged. No full gate, package, push or
coach-data write. Installed smoke remains pending for the repair.

Review follow-up, 2026-10-01: P2 phantom drive and P3 explicit-number mismatch
repaired in source. Explicit numbers now bypass automatic kickoff grouping,
including terminal/return-TD kicks; they use the surrounding-drive rule instead
of borrowing a following drive's side. Numbered tries/re-kicks cannot be absorbed
by automatic groups. Four failing-first cases cover mismatched next number,
numbered halftime kick, numbered return TD and numbered try. Charting-details
107/107, theater 69/69, data-correctness-batch1 77/77, parity 2/2. No full gate
or packaging; coach data unchanged.

## Smoke 1.12.0-107, 2026-09-30

**S107-5 - P2, Overview Turnovers tile reads a nonexistent field,
REPAIRED IN SOURCE / not packaged.** Live 2025 JV NDP play 5 has Fumble with
`fumbleRecovery: opponent`; the engine's offensive count is correctly 1.
`overviewKpis` read `turnovers.giveaways`, which does not exist, and fell back
to zero. This was not margin arithmetic. Coach additionally requires total team
turnovers, including Special Teams, and no "lost by our offense" subtext.
The shared engine now provides `totalTurnovers` from all charted phases; the
screen and HTML export read that value. Explicitly lost ST fumbles and muffed
returns count once; normal kicks, unknown recovery, defensive takeaways,
run/pass tries and no-play rulings do not count as conceded turnovers.
Offense-specific report metrics retain their existing cohort. Failing-first
regressions cover the original zero-margin example, ST losses, unknown/retained
recovery and double representations. Live NDP tile independently checked as 1.
No coach-data change, full gate or packaging.

**S107-6 - P2, inconsistent sack-yardage accounting,
REPAIRED IN SOURCE / not packaged.** Claude's review
found passing totals net of sacks in `_passingStats`, versus sacks excluded
from passing attempts/YPA in the Defense board. Coach ruling 2026-09-30:
sacks are not pass attempts and their losses belong in rushing yards, not
passing yards. Coach further confirmed college-style treatment: each sack is
one passer/team rushing attempt and negative passer/team rushing yards. Keep dropback
and called-play classifications unchanged for tendency analysis.
The prior audit's 164 passing yards / 6.8 YPA followed the old net-of-sacks
formula; it verified arithmetic but not the now-settled football convention.
Those values must not be described as the correct post-repair convention.
Team/opponent production, Defense yard columns, passer rushing credits, Study's
rushing player cohort and passing/Play Action averages now use that convention.
Sack film stays in the called-pass cohort; passer grades are not copied into
rushing grades. Coach clarified that Passer is a charted role, not necessarily
the QB position: only Passer receives a sack loss, with no Ball Carrier fallback.
Missing passer attribution is not guessed. Live 2025 JV: 191 passing
yards / 24 attempts / 8.0 YPA; 866 rushing yards / 148 attempts. The three
called-pass sacks move 27 yards into rushing. Other plays already tagged Run
with Sack stay Run; no charted classification is rewritten.
Independent raw-field audit: 437/437 over all three live seasons plus the
canonical fixture, catalog hash unchanged. Receipt:
`docs/sack-accounting-verification-2026-09-30.json`. Model, Study, Defense and
report regressions pass. Canonical Defense season allocation becomes 266 rush
+ 231 pass = 497 total; Week 5 becomes 67 + 60 = 127. Parity changes only the
sack-related production, rushing player rows/refs and passing averages; the
synthetic golden is unchanged. No full gate, package or coach-data write.

### Source repairs, 2026-09-30

S107-2, S107-3 and S107-4 are **REPAIRED IN SOURCE / installed smoke pending**.
The 1.12.0-107 installer does not contain these repairs. No new full gate,
installer, installed approval or coach-data write was performed.

- S107-2: passing attempts count qualifying plays once, without deduplicating
  game-local play numbers. Multi-result passes still count once. The independent
  live/canonical arithmetic audit now passes 4,344/4,344; live 2025 JV has 24
  attempts, 62.5% completions and 6.8 yards/attempt. Catalog hash unchanged.
- S107-3: collect nonadjacent assigned drives by possession side plus number,
  sort drives numerically and plays within them by play number. Blank drives stay
  unassigned; existing adjacent Special Teams ownership behavior is retained.
  Both the pure model and rendered theater pin the out-of-order regression.
- S107-4: deleted Gap/Direction coupling and its orphan-removal plumbing. Gap is
  always available below Direction; either field can be blank, and neither
  rewrites, clears or rejects the other. Existing Right charting is untouched.
  Motion/RPO/QB-run trigger confirmations remain. Gap report lateral classification
  remains report-only, so precise Gap cohorts and broad Direction cohorts differ
  legitimately.

Focused verification: charting-details, charting-cutover-deck,
data-correctness-batch1, native-breakdown-theater, run-gap-report, parity and
reports-season. Canonical parity changed only season attempts/completion%/YPA
in stats and scout report (six scalar changes); all game scopes are unchanged.
Visual check: actual built deck on a canonical-season copy at 1920x1080 shows
Middle and L-A selected together, ten Gap chips on one row without clipping.
No film was loaded in this scratch browser; desktop film smoke remains required.
The findings below describe the pre-repair evidence, not current source behavior.

**S107-4 - Gap/Direction independence, REPAIRED IN SOURCE.** Coach approval,
2026-09-30: Direction is a broad subjective classification; Gap is additional
precise lane measurement, not a prerequisite for useful direction statistics.
Middle is not restricted to a play over Center; the coach describes it as between
the B gaps, with marginal decisions left to the coach. Neither field may infer,
overwrite, reject or clear the other. Gap must remain usable/retained with blank
Direction. Middle + L-A is valid; Center must not force Middle. All existing
charting, including currently Right plays, stays unchanged. No migration.
The former `ChartingDetails` coupling and consumers were updated consistently
(deck, Film Room, imports, format
validation, reports/exports and focused tests); preserve independent gap and
direction cohorts and exact film links. Existing comp geometry/vocabulary stays.
The source repair above supersedes the earlier approved coupling rule.

**S107-3 - P2, play strip groups adjacent runs instead of assigned drives,
REPAIRED IN SOURCE.** Coach reports assigned drive number should override play-number order.
Source reproduction in `js/football-rules.js:95`: offense plays 1/2/3 assigned
drives 2/1/2 produce `Our Drive 2 [1]`, `Our Drive 1 [2]`, `Our Drive 2 [3]`.
`groupPlaysByDrive` joins only the currently open adjacent group; it does not
collect all plays belonging to the same assigned drive. The theater uses it at
`js/breakdown-theater-screen.js:595`, and the native strip renders those groups.
Required approach: drive assignment controls grouping and ordering; play number
orders plays within a drive, not the drive groups. Preserve separate possession
sides for equal drive numbers and do not invent assignments for blank drives.
The existing theater harness covers only already-contiguous drive assignments,
so it did not detect this case. The new regression covers it; no coach-data write.

Coach correction, 2026-09-30: OLL points discrepancy was a migration-related
charting error, corrected by the coach; coach confirms total-points engine works.
Do not treat that observation as a scoring-engine defect. Earlier read-only audit
values below are historical, not the current score after the coach's changes.

Additional data verification: 3,300 independent checks passed for scoring,
Special Teams, penalties, defensive takeaways/TD ownership, tackles and player
season-to-game totals. No additional engine defect identified; S107-2 was the
only engine finding and is now repaired in source. No duplicate roster jerseys
or charted jerseys missing from season rosters.
Evidence: `docs/stats-extra-verification-1.12.0-107-2026-09-30.json`.

**Charting reconciliation observations, not confirmed product defects:** saved
official vs chart-derived scores differ for 2025 JV Week 1 (41-0 vs 42-0),
Week 2 (0-13 vs 0-12), Week 5 (13-13 vs 14-6), and SJM Varsity 2026 Week 3
(13-34 vs 12-14). The engine matches the raw charted scoring events. Coach
spot-check is needed to determine which events are incomplete or incorrect;
nothing inferred, re-charted or rewritten by the audit.

**S107-2 - P2, full-season passing attempts collapse repeated play numbers,
REPAIRED IN SOURCE.** Independently reproduced against the pre-repair app and its Season report
model. `js/stats-engine.js:2370` deduplicates attempt plays by bare `p.id`;
different games reuse those IDs. Live 2025 JV: 24 attempts are reported as 20,
15 completions as 75.0% instead of 62.5%, and 164 yards as 8.2 yards/attempt
instead of 6.8. The registered 449-play fixture similarly reports 20 instead
of 26 attempts. Minimal reproduction: two passes with id 1 in different games,
one completed for 8 yards, one incomplete; engine returns 1 attempt / 100% /
8.0 YPA instead of 2 / 50% / 4.0. Single-game totals pass. Repair should count
each qualifying pass once using an OR outcome predicate, not deduplicate across
games by play number; retain the multi-result single-play regression.

Independent arithmetic audit: 4,344 checks, 4,335 passed and 9 failed, all nine
failures are this one root cause across live season, fixture and minimal case.
Covered game/season scopes, rushing/passing production, touchdown counts,
turnovers, success/explosive/negative rates, down-and-distance counts/rates/
yardage/film references, defense yardage/cohorts, rushing/passing player credits,
current-field drilldowns, detail-only invariance, RPO decisions and run/pass try
exclusion. Evidence: `docs/stats-engine-verification-1.12.0-107-2026-09-30.json`.
Existing `e2e-parity` passes 2/2 without updating goldens, demonstrating a golden
correctness gap, not refuting the reproduced defect. That audit preceded the
source repair above; no coach-data write, gate rerun or new installer. Smoke remains pending.

**S107-1 - Formation vocabulary, WITHDRAWN by coach, 2026-09-30.** Coach
reviewed the existing controls and confirmed Bunch and Tight Bunch are acceptable
as separate formations for now. Retain the current single-select model and
vocabulary. No multi-select, new compound names, code repair or data migration
requested. This is not an open defect or future work item.

Coach reports completing the four requested re-charts (2025 JV, Week 6 vs Holy
Family Wildcats, plays 3, 4, 23, 60). A read-only live-catalog/browser audit now
verifies those edits: 1,529 checks passed, no defects in the tested scope.
Evidence and limits: `docs/smoke-data-verification-1.12.0-107-2026-09-30.json`
and `SMOKE-1.12.0-107.md`. The pre-smoke hash is historical. Overall smoke
acceptance remains pending. Checklist/feedback: `SMOKE-1.12.0-107.md`.

## Charting adversarial review, 2026-09-29

Packaging checkpoint, 2026-09-30: coach-authorized full gate **140/140 green,
zero skipped, zero failed** at `a449b59e`. Version-only bump to `1.12.0-107`;
installer built from clean `72bea85a` after green. Build, artifact hash and
pending checklist recorded in `SMOKE-1.12.0-107.md`. No installed smoke or
acceptance yet; live catalog hash unchanged by gate/build.

Current cutover status, 2026-09-30: live conversion completed on explicit coach
authorization and independently verified. All 919 plays, 42 retained restore
points and 52 retained versions are current format. Approved Formation mapping
and blank new detail fields are the only play-data changes; identity, film,
notes, penalties, players, grades and unrelated tags are unchanged.
Spent converter/archive tools, dependent tests and Previous formations bridge
are deleted. Installed library checked from a profile copy: Beast is its only
old custom Formation and is already a current built-in. Settings and mirror
files were not rewritten. Final gate/package/smoke remain outstanding.
Receipt, impact and final re-chart list:
`docs/CHARTING-CUTOVER-CURRENT-IMPACT-2026-09-30.md`.

Earlier entries below are historical checkpoint evidence, superseded by the
current status above; their pending-write language is not an open task.

2026-09-30 takeaway blocker repaired in tools: exact expected ranked lists are
recomputed from original plays plus approved Formation/strength, not blanket
exempted. Converter 45/45; real mapped copies have zero unexpected analytics.
Coach authorized verified archive retirement of the 34 incompatible backups
and 94 versions, keeping 42/52; execution receipt pending. Live charting
conversion still requires separate immediate confirmation.

Coach-mapped rehearsal, 2026-09-30: all 496 Formation values resolve (four
explicitly blanked). Current-format and preservation proofs pass. Takeaway
proof and handling of 34 incompatible restore points / 94 versions remain;
no live write. Mapping and report recorded in the dated cutover evidence.

2026-09-30 copy rehearsal: 88 live plays remain unresolved, down from 198
under the superseded model. Identity, film, unrelated fields and read-back
proofs pass; current-format checks and formation-driven top-five takeaway
differences still block live conversion. Exact counts and decision groups:
`docs/CHARTING-CUTOVER-REHEARSAL-2026-09-30.md`. Live catalog hash unchanged.

2026-09-30 packaging decision: coach deferred the installer until cutover
readiness. No installer build started; the uncommitted bump was undone.
`docs/CHARTING-CUTOVER.md` now lists the three remaining checkpoints: mapping
and copy rehearsal; confirmed conversion and cleanup; final verification and
packaging. No live-data write was authorized.

Final source verification: **full build and gate 141/141 at `d5b27c10`,
zero skipped and zero failed**. This supersedes the pending-rerun notes below.
No live conversion, installer or installed smoke was performed; BD-UX-1/2
and the live cutover retain their existing approval checkpoints.

Fourth gate follow-up: the run at `c78ee3bd` reached the formation-model
harness, whose 15 assertions passed but whose custom summary was not a valid
gate result line. The harness now prints the standard `== RESULT: ... ==`
summary; assertions and failure behavior are unchanged. Full gate rerun pending.

Third gate follow-up: the run at `caa05eff` was stopped on stale harness
inputs. Round-trip still imported the live pre-charting-cutover season, which
the new format correctly refuses; it now imports the existing current-format
canonical fixture and checks all 449 plays against that file, plus unchanged
fixture and live-catalog hashes (11/11). Native Film Room still searched for
the superseded "Family" heading; its unchanged tendency assertion now locates
"Formation" (27/27). No coach data or fixture was written. Full gate rerun
pending.

Second gate follow-up: the run at `778838a8` was stopped after
`e2e-explosive-labels` found the run-gap export's bare "Explosive" header.
It now reads "Explosive Plays" on offense and "Explosive Plays Allowed" on
defense. Focused checks pass unchanged: explosive labels 42/42 and run-gap
report 33/33. Full gate rerun pending; no installer or coach-data write.

Gate follow-up: the first run at 9da74967 was stopped on coach instruction
after `e2e-breakdown-viewport` found eight disclosure-arrow overflow failures.
The glyph needed 12px but its box was 8px. Its box now occupies the existing
12px group gutter; text size and label alignment are unchanged. Viewport
167/167 and charting deck 94/94 pass without assertion changes. Full gate
rerun pending; no installer or coach-data write.

Three findings from 843154e8..c4940657 are **REPAIRED IN SOURCE**, not installed:

- P2: conversion could swap a catalog whose season failed current-format checks.
  The write now refuses failed format or preservation proofs before staging.
- P2: Receiver Alignment arrays could pass validation and then display blank.
  Fixed-vocabulary details now require string values (null/missing remain blank).
- P3: explicitly approved strength mappings falsely failed the unrelated-tag
  proof. The proof now permits only the exact mapped strength for the exact play;
  unapproved and wrong-value changes still fail.

Failing-first regression checks and seven focused suites passed, including
analytics parity, followed by the full gate recorded above. No coach data was
touched; no package or smoke;
BD-UX-1/2 and the live cutover remain pending their existing checkpoints.

## Break Down next update (coach finding, 2026-09-28)

**BD-UX-1 — OPEN (source IMPLEMENTED_UNVERIFIED 2026-09-28; see Charting
cutover below). The populated Chart deck looks jagged beside the approved
comp.** In the coach's 1920x1080 Break Down capture (SJM JV 2026, Week 5,
Play 24), the Situation grid is reasonably aligned, but Our Offensive Look
becomes a wall of variable-width chip outlines. The full Formation catalog
wraps into uneven rows; `select all`, `optional`, and `Edit library` interrupt
the label rhythm; Play Call, Formation, Backfield, and Personnel have very
different heights. Motion is pushed below the fold. The deck is about 465px
wide, close to the comp's 468px, so width alone does not explain the gap.
The approved `design-comps/breakdown-charting-2026-09-27/` is intentionally
curated and does not prove the full-library state. In the next charting update,
compose that real state with consistent label/action alignment and a cleaner
chip-wrap rhythm. Preserve every existing library choice and make selected
values visible; do not make the screen look tidy by permanently hiding data or
shrinking the type. Verify populated 1920, 1440, and 1280 desktop captures at
the real deck width, plus a narrow view. No source repair or installed
acceptance is claimed here. The supplemental
`design-comps/breakdown-visual-finish-2026-09-28/` shows the full old Formation
library at the real deck width; it is not a blanket-approved replacement for
the registered charting comp. The new Formation must get its own
coach-managed library group, with Power-I and Split Back available and
add/show/hide/reorder/remove-custom behavior. No extra comp is required for
that library workflow. The coach also reviewed Gap as ten chips in one row
under Play Direction (L-A through R-D, Center, Other) and requested Reverse
as a Play Type. These are planned, not production repairs. The new charting
schema has a one-time, confirmed migration checkpoint with no legacy reader
or dual-write tail; see `GRIDIRON-IQ-PLAN-V2.md`.

**Charting cutover, roadmap Step 1 (2026-09-28) — IMPLEMENTED_UNVERIFIED in
source; live data NOT converted.** Family and Receiver Set, Gap under Play
Direction, motion Starts/Ends, RPO read/defender/decision, QB Run and Reverse
play types, the 27px chips, the Film Room and CSV columns, the run-gap report
and the single-format refusals are in the branch (`docs/CHARTING-CUTOVER.md`
has the counts, the field mapping and the rehearsal proof). Open until the
coach decides compound mappings. Exact single names remain coach-named
Formation choices under the 2026-09-29 correction. The full live/snapshot
impact report must be refreshed with current rules before approval. No installed
acceptance is claimed. Full gate 141/141 at `d5b27c10` on 2026-09-29.
Review of
`19b2ed1..94fb5b8` (2026-09-29) found four defects, repaired with failing-first
tests: a Play Call that replaces a Direction, Motion or Play Type now names the
Gap, path or RPO detail it would clear and waits (Chart and Film Room); a CSV
with a combined Formation value is refused without writing any rows;
a custom entry in the retired Formation list is offered by name under
"Previous formations" in Settings, added only on the coach's click, and the
retired list now survives a second library edit (it was dropped on the next
load); the run-gap sample uses the Reports' own run rule and says so.

Formation-model correction, 2026-09-29: built in source, IMPLEMENTED_UNVERIFIED.
The coach rejected the rigid Family/Receiver Look split. Formation now accepts
Twins, Trips, Bunch and Tight Bunch as whole coach-managed names. QB Alignment,
Backfield and Offensive Line Strength stay separate. Strength includes Unbalanced
Left and Unbalanced Right. Receiver Alignment is directional left x right (totals
1-5, numeric order, no 0x0). Personnel follows Formation before QB Alignment.
Receiver Strength and Line Balance are removed; their stored shapes are refused.
receiverLook/receiverSide are
removed from authoring/readers and refused on import. All deck, grid, CSV,
template, carry, Study and detail consumers use the one current model.
Earlier 298/198 conversion counts are superseded; the full impact must be
rehearsed again before coach approval. Compound mappings and the existing
rehearsal takeaway-text differences still need review. The Previous formations
bridge remains tools-cutover work: remove after conversion before packaging.
Full gate passed as recorded above. No live write, installer or installed acceptance.

Full-screen visual review, 2026-09-29: two P3 findings repaired in source on
the coach's instruction. The offensive film strip and play-sheet group now
say Formation & Call (Opponent Formation & Call for scout film), matching
the deck. Collapsible field arrows occupy the existing group gutter so Play
Call and Play Type labels share the plain fields' left edge; disclosure
behavior, typography and chip dimensions are unchanged. Five focused harnesses
pass and canonical-data captures were inspected at 1920 and 1280. No coach
data changes, full gate, installer or installed approval.

CSV mapping review, 2026-09-29: **P2 repaired in source; installed verification
pending.** Formation and Formation Family headers could map to the same field,
silently overwriting a supplied formation or hiding a combined look before
validation. `StorageManager.applyPlayImport` now refuses any duplicate target
in the final mapping, including manual column mappings, before changing plays,
IDs or emitting a save. The coach can unmap the extra column and retry. Five
refusal regressions failed before the fix; CSV projection now passes 39/39,
CSV round-trip 14/14 and charting cutover deck 88/88. No coach data was touched;
no full gate, installer or live conversion was run.

**BD-UX-2 — OPEN. Break Down context dropdowns need a visual pass.** In the
coach's 2026-09-28 capture, the collapsed Season selector looks cramped and
unfinished; its expanded menu uses the older flat styling and typography rather
than the current visual system. Review the Program and Game selectors in the
same top context row for the same issues, but do not assume they are identical
without inspecting them. In the next Break Down visual update, make the closed
controls and open menus feel like one coherent desktop selector system while
preserving season names, game/play counts, Season Library, New season, keyboard
navigation, and selection behavior. Verify closed and open states at populated
desktop and narrow widths. This is a recorded visual finding, not a source
repair or a change to the approved charting comp.
The same supplemental review comp proposes closed and open selector states;
it does not close this finding until the coach approves and production is
verified.

## Installed smoke, 1.12.0-105 (list complete, 2026-09-28)

Findings logged as the coach lists them; no repair starts until the coach
says the list is complete. Checklist: `SMOKE-1.12.0-105.md`.

**S105-1 — CLOSED 2026-09-28; repaired in 1.12.0-106 and installed smoke approved. Changing the team name in Settings does not save.** Coach:
"changing Team name via the settings menu does not save." Reproduced on the
installed build 2026-09-28: the save itself works (renamed, restarted, restored),
but a name typed and then closed with Done, the close button or Escape, without
pressing Save team identity first, was silently discarded. **Repaired in source:**
the Team form keeps its unsaved values on the Settings screen (a tab switch keeps
them), closing Settings saves a changed identity with a `Team identity saved`
toast, and a blank program name is not saved and says why.
`e2e-native-settings` 29 (3 new checks, red with the save-on-close removed). Codex review of `9b1136d` (P2): the draft was copied in a deferred effect, so typing and closing at once lost the name (10/10); the draft is now written in the input handler. 31 (2 immediate-close checks, red first).
The coach's smoke list is otherwise complete ("the rest looks good").

## Installed smoke, 1.12.0-103 (2026-09-27)

Run on the installed build (checklist `SMOKE-1.12.0-103.md`). First launch:
the storage-cleanup receipt and `giq_settings_format_2026_09_26` both read back
with no failed step from a copy of the profile. Every other check run passed;
details are in the smoke record.

**S103-1 — Recover seasons showed a dead button — REPAIRED IN SOURCE
(`c1e8d2b`), not yet in an installer.** The two mirror folders holding a bare
pre-envelope `season.json` (`2025-st-joseph-mavericks-jv`,
`2026-st-joseph-mavericks-jv`) listed as `Old format` with a `Recover` button
that was disabled but styled like an enabled one; its reason lived in a `title`
a disabled button never shows, so a click did nothing and said nothing. The rows
also printed `0 games · 0 plays` for a file that was never read. An
unrecoverable candidate now shows its reason as visible text and no button
(`Saved in an old GridIron IQ format. It cannot be recovered.`, or `It cannot be
recovered.`), and the scan reports unknown counts as `null`, which the row
omits. Failing first: `e2e-native-mirror-recovery` 4 red, `e2e-season-format`
1 red; green after (16/16, 43/43).
Codex review of `c1e8d2b` (P3): the folder-identity-mismatch refusal still
invented `0` counts; it reports `null` too (checked in `e2e-catalog-backend`,
red on `[0,0]` first, 29/29 after).

## Installed smoke, 1.12.0-102 (in progress, 2026-09-25)

Findings logged as the coach lists them; no repair starts until the coach
says the list is complete. Checklist: `SMOKE-1.12.0-102.md`.

**Catalog integrity review — REPAIRED IN SOURCE 2026-09-25; installed smoke
pending.** Four paths were fixed: a version ID collision could overwrite
another game's snapshot even when import returned false; direct writes to
`library.db` could leave a partial database; a failed version deletion reported
success and left memory out of step with disk; first-run JSON import counted
seasons whose catalog write failed. The desktop now stages and natively replaces
the catalog, scoped version IDs reject collisions with rollback, deletes return
their durable result, and failed imports stop initialization. `e2e-catalog-safety`
uses fake data, the Windows Rust replacement test passed, and the full gate is
135/135. No installed package or coach-data migration has been run for this fix.

**Version-delete cancellation follow-up — REPAIRED IN SOURCE 2026-09-25.**
Cancelling the confirmation returned the same result as a failed write and
incorrectly showed an error. Cancellation now returns `null`; Settings reports
an error only for a non-cancelled unsuccessful result. Native Recovery passes
15/15, including cancellation (no write or toast), failure, and success;
catalog safety passes 4/4 and the build passes. The full gate was not rerun for
this follow-up; installed smoke remains pending. No coach data was changed.

**Coach, overall:** "seems like the bugs are fixed with the latest smoke" —
the unit repairs (S99-1, S99-2, the Codex review, CR-1..3) read as fixed on
the installed build. Formal per-item verdicts to be recorded when the list is
complete.

**S102-1 — CLOSED 2026-09-27 by the coach: out of context (the reported builds are superseded; no view, dock or width was ever identified). Break Down spacing is wrong on the installed build.** Coach:
"the spacing is all fucked up in breakdown. Every time we touch the app this
happens. I'm starting to think it really is the old code causing it." Which
view, dock and width, and what is misplaced, not yet stated.

*Hazard for fix time (mine, not the coach's words):* Chromium evidence says
Break Down did not move — `tools/compare-builds.mjs` renders the rebuild
byte-identical to the pre-rebuild build, and the Film Room changes since
(`48cbf5d`: the pinned Unit column and the `Filter plays` label) are the only
intended differences. So the defect is either in those two additions or in
what Chromium cannot render: headless Chromium draws OVERLAY scrollbars while
the installed WebView2 draws classic ones, which is exactly how BD-VP escaped
every harness before (`1.12.0-87`). Get a screenshot first; then compare the
installed rendering against `1.12.0-98` (the last installed Break Down the coach
did not flag) before touching CSS. The recurring pattern the coach names —
layout spread across five stylesheets whose rules key on classes set on
elements outside the component tree, verified only in a renderer that differs
from the installed one — is a structural finding for the excision plan.

## Legacy excision (2026-09-25)

Plan: `docs/LEGACY-EXCISION-PLAN.md` (approved; Codex audit next). The live
retag list (42 plays in 2025 JV) is recorded there.

**LG-1 — OPEN. Plays are created without a unit.** SJM Varsity 2026 holds 33
plays whose `tags` hold only blank fields and no `unit` key — nothing charted
(Week 4 vs Oakland Christian plays 31-34 and 37-64; vs Romeo play 1). Every
creation path in `PlayTagger` seeds `unit`, so another path (film link or
clip import creating one play per clip, suspected, not confirmed) writes `{}`.
Reading is safe (`countedUnit` counts them as offense) and charting writes a
unit, but a creation path that skips the tag schema is a defect. Reproduce
before fixing; find the writer, seed the full tag schema there, test it.

**TEST-1 — REPAIRED IN THE HARNESS; full gate `ac893b5` 133/133 (and green at `a634880`). Root cause (Codex, 2026-09-25, reproduced on a fresh-build gate prefix): Chrome's `Runtime.callFunctionOn` with `awaitPromise` reported section 4's long async evaluate "collected" although the page had completed it — a fresh call read the full state; no navigation, context loss or target crash; not product code. Fix: section 4 starts from a SYNCHRONOUS evaluate, polls a completion flag, re-throws any page-task error (mutation-verified), then reads the result; assertions unchanged; 10/10 clean. Why the gate triggered it far more often than isolated runs is still unexplained. Earlier record: the `052e6f7` harness change DID NOT FIX IT: the full gate at `052e6f7` crashed it again (132/133, same section, same error), so the diagnosis below is incomplete. What that change was based on: the page reached the section's last line (a marker there always printed) and computed every value, but the protocol intermittently reported its returned promise "collected" — a test-harness hand-off failure, not an app defect. The result is now stored on the page and read back with a plain evaluate; 0 crashes in 20 runs (was ~1 in 6-10). Original record: `e2e-native-tagging`
crashes intermittently in section 4 with a Puppeteer `Promise was collected`
protocol error** (2026-09-25; full gates at `1a1fb3b` and `cd674ab`). Measured: about
1 run in 6-10, locally as well as in the gate, and the SAME rate on the
pre-Pass-1 build `b452635` (1 in 10) — so it predates the legacy excision and
earlier gates passed by chance. It dies after the step `S4: play2 before try`
(play 2 carries no Special Teams event there, so `setSpecialUnit`'s confirm
dialog is not the cause). Diagnostics stay in the harness (step markers and a
navigation log). **Gate rate is higher than the local rate:** it failed the full gate at `1a1fb3b`,
`cd674ab` and `b04a2f3` (3 of 3) after passing 5 gates before them, against ~1 in 10
locally on both old and new code; each gate rerun passed. Cause unknown. Next: find the pending page promise; until then a gate red on
this harness alone is rerun, and the rerun result is reported, never hidden.

**TEST-2 — REPAIRED IN THE HARNESS (`e2e-native-recovery`), 2026-09-25.** The full
gate at `a634880` failed it for the first time, and it then failed 8 of 8 alone and on
the older build `b452635` too, so it was not the code. Cause: the second click on a
game version's Restore button came while the Recovery row was re-rendering after the
first restore, when the row briefly has no buttons; the button returns within ~2 ms.
The app is correct. Both clicks now wait for the button first (the rule: assert the
subject is on screen before interacting); 5/5 runs 10/10.

**LEGACY EXCISION STEP 7 — DONE IN SOURCE 2026-09-26; full gate 135/135 at `42e4097`; installed smoke pending (step 8).** Every
old-format season reader is deleted (`b84e207`..`5c53b44`; record in
`docs/LEGACY-EXCISION-PLAN.md` step 7). ST-GAPS below is now unblocked: there is one
data format to extend. What changed for the coach, to check in the step 8 smoke:
- **A stored season in an old format no longer opens.** It used to be converted on
  open (game rosters) or read through projections; now it is refused by name, the
  season already open stays open, and nothing is written. The live catalog was
  converted on 2026-09-26, so no live season should hit this — the smoke should
  open every season once to confirm.
- A CSV play import that carries a combined look (`Shotgun + Trips` in Formation)
  is refused whole with the plain old-format message.
- A library choice that belongs to another field (`Shotgun` or `Shotgun + Trips` as a
  Formation, `Pistol` as a Backfield, `Man` as a Coverage call) cannot be added; one
  saved earlier is no longer offered.
- A play with a Penalty result and no penalty details reads `Details uncharted` in
  Film Room (was `Legacy · details uncharted`).
Earlier entries in this file that describe `adoptLegacyRoster`, the roster
migration, `migratePlayFormation`, the look projection or legacy Special Teams
branches are history; those readers no longer exist. **Next, Pass 2b (coach,
2026-09-26):** old app-settings keys are removed as a separate bounded cleanup
(12-row inventory in `docs/LEGACY-EXCISION-PLAN.md` Pass 2b); version history and
the season-file layouts keep the coach-data rules. A step 7 leftover found by that
inventory: the `tags.custom` coercion in `_normalize` (row 12). The
tag-form write and the Film Room grid commit have no write-level refusal of a
reserved look value; nothing in the app offers one to them.
**SETTINGS FORMAT CONVERSION — DONE AND RETIRED.** Old app-settings keys were converted once at boot (`js/settings-format.js`, `7b9b09a`) and their readers deleted. The installed check passed on 2026-09-27 (profile copy read after the `1.12.0-103` first launch, re-read after `1.12.0-104`); `js/settings-format.js`, `js/storage-cleanup.js` and their harnesses were then deleted (efficiency audit batch 2). The check was: `giq_settings_format_2026_09_26` records the run with no failed step; `giq_home_workspace`, `ffa_film_room_cols_claimed_by`, the per-version `ffa_beta_defaults_*` markers and the dead UI keys are gone; `ffa_beta_defaults` holds the installed version; the charting library, Film Room columns and Home mode are unchanged in the app. Rows 9 and 11 are done (`6e8d156`): no version migrator; an old pre-library save is named once (`An old-format GridIron IQ save was found and not opened. It was left where it is.`) and left in place. The 23 old-layout restore-point files for `2025 St. Joseph Mavericks - JV` (storage id `2026-varsity-demo`: `seasons/2026-varsity-demo/backups/season_*.json`, 14,543,375 bytes) were archived to `C:\Users\charl\GridIronIQ-Backups\retired-file-restore-points-2026-09-26` (manifest and read-back verified 23/23) and the originals removed from active storage, verified by `REMOVAL-RECEIPT.json` (`REMOVED_AND_VERIFIED`, coach-authorized 2026-09-26). Closed.

**STORAGE CLEANUP CHECKPOINT — IN SOURCE 2026-09-26 (`a70c52e`), installed check pending (step 8).** Three retired keys (`ffa_versions_default`: 20 unscoped game snapshots; `ffa_roster`: a copy of the 2025 JV roster; `ffa_roster_mavericks`: `[]`) are archived and verified in `C:\Users\charl\GridIronIQ-Backups` and removed once at boot only when each still matches its archived hash. After the step 8 install's first launch, re-read a copy of the profile: the three keys gone, `giq_storage_cleanup_2026_09_26` listing three `removed`. Record in `docs/LEGACY-EXCISION-PLAN.md` Pass 2b.

**ST-GAPS — ITEMS 1-2 REPAIRED IN SOURCE 2026-09-27, plus three coach additions; not in an installer; list stays open for the coach's further gaps.**
Attempt is now Kick XP / Run/Pass / Fake; every try records 1 or 2 points (kick
defaults 1, run/pass and Fake 2); a kicked try offers Kicker (Defending: Blocker)
and no Returner; a run/pass or Fake try shows the offensive (or, defending, the
defensive) options of a scrimmage snap, keeps its look, and is kept out of all
analytics (coach). Item 1 already worked before this change (a converted kick
offered 1 or 2); item 2 was the gap. Model: `GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md`
§4b.3d. Evidence: `e2e-b2-tries` 17 (three new model/cohort checks, each red
under its own reversion), `e2e-st-try-charting` 27 (two UI reversions red), the
Special Teams, deck, Film Room and parity harnesses unchanged. Codex review of `67d1ee0`: P1, selecting another play while the Kick XP confirmation was open cleared one play and changed the other; the change now applies to the play the coach acted on, in one update. P2, Run/Pass to Fake reset a charted 1 point to 2; a charted score now survives a switch within the same attempt kind. `e2e-st-try-charting` 32 (4 new checks, red first).
Original entry: **ST-GAPS — OPEN, deferred until after the legacy migration (coach, 2026-09-25).** Special
Teams charting is missing options the coach needs; the list grows as the coach finds them
and nothing is built until the migration lands (one data format to extend).
1. **Try points follow the league's rules.** Youth level: a kicked try is worth 2 and a
   run/pass try 1, the reverse of standard. `SpecialTeamsModel.points()` fixes extra
   point = 1 and two-point = 2. **Coach decision (2026-09-25): per play, a kicked try
   defaults to 1 point with a chip for 2, the same pattern as the run/pass try options.** No
   season-level rule. Scoreboard, reports and exports read the charted points.
2. **A run/pass try worth 1 point cannot be charted** (youth scoring).. More to come (coach checking later).

**Plays the coach re-charts after these fixes** (charted as close as the current options
allow; left as they are until then):
- 2025 JV, Wk 1 St. Peter, play 23: a run-in try for 1 point, charted on Offense as `XP`.

**REC-1 — REPAIRED (`e4417b8`), 2026-09-25. Recovery's Game versions could show
another game's versions.** TEST-2's "the app is correct" was only half right: the
same harness kept failing intermittently after that repair (full gate after
`e8aca99`; 7 of 10 alone at `fb4fb15`, before Pass 2 step 1), now timing out
waiting for game A's version row after a switch to game B and back. The panel
loaded only on mount and after its own actions, and `recoverySnapshot()` listed
versions after awaiting the season backups, so the list read whichever game was
open when that call ran; nothing reloaded it on a game switch. A coach switching
games with Recovery open saw the other game's versions. Now the panel reloads on
every game load (`SettingsScreen.onGameLoaded`, over `plays-loaded`), only the
newest request sets the model, and the list starts before the first await. Two
failing-first checks in `e2e-native-recovery`, each mutation-verified. **Full
gate 134/134 at `e4417b8`.**

## Code review, 2026-09-24 (coach-requested; scope: the unit-ownership change)

The coach asked for a full review of the app; the review tool covers a diff, so
it read `48cbf5d` and `125c6f5` and the code they touch. **A whole-app review
has not been done.** Three defects (verified against source, not yet
reproduced in a browser) and six legacy items. All three defects are in
`1.12.0-101`. **All three REPAIRED (`d5b5edd`, coach direction); full gate
131/131 at `b452635`; packaged in `1.12.0-102`.** Each reproduced red first in
`e2e-unit-ownership` (real key events): `C` sent a play shown as Offense to
Special Teams and wiped its formation, a digit wrote `Kickoff`, Clear Tags
stored Defense, Save & Next stamped Special Teams. The sweep found a fourth
instance of the pattern, the empty-unit-field fallback in
`_onUnitFieldChanged`, repaired with them. `e2e-unit-ownership` 28; four
reversions, each red.

**CR-1 — REPAIRED IN SOURCE (`d5b5edd`). Keyboard unit shortcuts read the carried unit.**
`js/app.js:1361` computes `curUnit = tags.unit || defaultUnit`. On a play with
no stored unit, Chart shows Offense (`countedUnit`) but `C` cycles from the
carried unit — shown Offense, carried Defense, `C` jumps to Special Teams and
strips the formation and front — and the Special Teams digit shortcuts can
write a type onto a play shown as Offense.

**CR-2 — REPAIRED IN SOURCE (`d5b5edd`). Clear Tags stores the carried unit.** `js/play-tagger.js:552`
rebuilds tags with `unit: play.tags.unit || this.defaultUnit`, so clearing a
play with no stored unit files it under the last unit charted — another Film
Room filter and report cohort — without the coach choosing it.

**CR-3 — REPAIRED IN SOURCE (`d5b5edd`). Save & Next carries the carried unit, not the shown one.**
`js/play-tagger.js:1241` takes `prev.tags.unit || this.defaultUnit`; after a
play with no stored unit it can stamp Special Teams on the next untagged play
and strip its look fields.

*Fix direction for all three:* read `countedUnit(play)` where a play exists,
keeping the carried unit only for a play that does not exist yet; each needs a
failing-first check in `e2e-unit-ownership`.

**Legacy code (load-bearing = something live depends on it today).**

| Item | Kind | Load-bearing |
|---|---|---|
| `play-tagger.js:561` Clear Tags' `#notesArea` lookup | Dead: no screen renders that element | No — delete |
| `play-grid.js:91` `LEGACY_PRESETS`, `PRE_CALL_PRESETS`, `_upgradeCols`, `_loadCols` (read `ffa_film_room_cols`) | Compatibility | **Yes** — seeds the first program's All plays set; removing it loses a coach's saved column list |
| `play-grid.js:86` `PlayGrid.PROJECTED_PAIRS` | Alias of `TagProjection`'s | **Yes** — the grid's tendency (line 472) and one harness read it; repoint both, then delete |
| `play-grid.js:578` `_plainCell`, `_plainTendency` | Pass-throughs left from the retired DOM renderer | No — one harness calls `_plainCell`; repoint it |
| `play-tagger.js:1299` `_stripStAlignment` computes the unit inline | Second copy of the unit rule | **Yes** — every unit change runs it; switch it to `countedUnit` |
| `tools/retired/*.retired` | Dead tests against the deleted tag form | No — nothing runs them |

The app-wide dead-code list from 2026-09-24 is under Deferred Beta Maintenance.

## Installed smoke, 1.12.0-99 (stopped by the coach at S99-2 to protect data; list complete, 2026-09-24; re-smoke in 1.12.0-102)

Findings logged as the coach lists them; no repair starts until the coach
says the list is complete (smoke-findings protocol). Checklist:
`SMOKE-1.12.0-99.md`.

**S99-1 — REPAIRED (`48cbf5d`, `125c6f5`), PACKAGED IN `1.12.0-102`, INSTALLED CHECK PENDING. Film Room table did not show formation data the charting
deck shows, and does not accept new entries.** Coach: "Charting shows
formation data but film room does not. I am not able to enter new data into
film room. Play 26 impacted but there are many." Clarified: "they don't
display and the dropdown doesn't open, as if it is not editable." And: "Only
the columns with a -- or an entry in the image (even if they do have an entry
in chart view) are editable. Everything you see that's fully blank is not
editable. Offense and Defense are impacted." Route: Break Down > Film
Room, table below, season `2025 St. Joseph Mavericks - JV`, game `Week 1 vs
St. Peter Lutheran Patriots`, All plays (67).

*Observed in the coach's screenshot (mine, not the coach's words):* play 54 is
a defensive snap (`D`). The play card lists `Offense faced` > Formation
`Flexbone`, Personnel `11`, but the table's FORMATION cell for play 54 is
empty and shows the cell-editor outline with nothing in it. Rows 52-58 (all
`D` or `S`) have empty FORMATION and QB ALIGN cells; row 59 (`O`) shows `Ace`
/ `Under Center`. The FORMATION header still reports `Flexbone 41%`, so the
column's tendency counts data its cells do not display.

*Hazard for fix time:* reproduce on the canonical season before diagnosing;
separate "cell not displayed" from "edit not accepted"; check whether the
defensive rows read the offensive formation field or the opponent's, whether
this predates the rebuild (compare `c1f6cc1` and `1.12.0-98`), and whether
the per-unit column sets are involved. A fully blank cell (no `--`) reads as
a cell the grid treats as not applicable to the row, which would explain
"not editable"; confirm against the grid's own rule rather than assume. Do
not rewrite coach data.

*Repair (`48cbf5d`); full gate 131/131; in `1.12.0-102`.* Root cause: `c1cce33`
(per-unit column sets) tagged Formation, QB Align, Backfield, Strength,
Personnel, Motion, Play Call and Concept as offense columns and Front, Cover,
Cov Family and Blitz as defense columns, and on All plays blanked and locked a
column on every row of another unit. But an offensive snap charts the defense
it faced and a defensive snap the offense it faced (Chart's Offense Faced /
Defense Faced groups), so real values were hidden and uneditable. Now only a
column a unit cannot hold is locked: the look columns on a Special Teams row
(which holds none of them, `SeasonStore.ST_ALIGNMENT_KEYS`) and the Special
Teams columns elsewhere.

**S99-2 — REPAIRED (`48cbf5d`, `125c6f5`), PACKAGED IN `1.12.0-102`, INSTALLED CHECK PENDING (coach: new finding, or related to S99-1). The unit chosen in
Chart does not carry over to Film Room.** Coach: "selecting a unit
(offense/defense/ST) in Chart does not carry over to Film Room. Seems they
aren't connecting." Clarified: "same is true in chart - I have a play that's
tagged defense in one and offense in the other." **The coach stopped the smoke
here to protect the season's data; findings list complete at S99-1 and S99-2
(2026-09-24). Repair, then re-smoke.**

*Hazard for fix time:* establish which "unit" is meant before changing
anything — the play's charted unit (the deck's Offense / Defense / Special
Teams control, which writes `tags.unit`) versus the Film Room's unit filter
(which picks the rows and the per-unit column set). If the charted unit
changes and the Film Room row keeps its old unit letter, blank cells or column
set, that is a data-flow defect and likely shares a cause with S99-1; if the
coach expects the Film Room filter to follow the deck, that is a behavior
request. Ask the coach only if the report stays ambiguous about what was seen.

*Repair (`48cbf5d`); full gate 131/131; in `1.12.0-102`.* Root cause, predating the
rebuild: for a play with no stored unit (legacy; the July mirror has 3 in
Week 1 and 8 in Week 2), Chart showed the carried unit (the last one chosen)
while Film Room and every report count it as offense; and choosing that same
unit in Chart was a no-op, because `setChartingUnit` compared the DISPLAYED
value, so nothing was ever stored. Coach direction (2026-09-24, after
comparing Hudl, whose grid edits the ODK column inline): a play's unit is
writable from either view, equally weighted, last write wins; filters are
clearly labeled and never write. Built: `countedUnit()` (`football-rules.js`)
is the one reading, the stored unit or offense; `setChartingUnit` writes
whenever the play does not already store the unit; Film Room has a **Unit
column**, pinned first and edited in the row, and it and Chart's switch share
`PlayTagger.setPlayUnit` (Special Teams strips the look fields from either
side); a unit has no Clear; the table's unit buttons sit under a visible
`Filter plays` label. An automatic filter-follow was built and then removed
at the coach's redesign: a filter changes only when the coach clicks it.
Evidence: `e2e-unit-ownership` (19; six reversions, each red).

**Codex review of `48cbf5d`, both REPAIRED (`125c6f5`), packaged in
`1.12.0-102` (`1.12.0-100` predates it; neither it nor `1.12.0-101` was smoked).** (P2) The lock ran only on All plays, and a custom Offense
column set can carry a Special Teams column, so filtering to Offense exposed an
editable ST Type cell on an offensive play. `PlayGrid.cellLocked` is now the one
rule, applied in every scope by the snapshot and by the grid's own editor and
commit. (P3) Save & Next's carry-forward `setUnit()` wrote `play.tags.unit`
directly; it now goes through `PlayTagger.setPlayUnit`. `e2e-unit-ownership`
23; three reversions, each red. Full gate at `e47701b`: 131/131, 0 skipped, 0
failed. **Process (coach, 2026-09-24):** confirm with
the coach before building an installer, and usually before the full gate —
`1.12.0-100` was gated and built before this review landed.

## Installed smoke, 1.12.0-98 (findings list complete, 2026-09-24)

Findings logged as the coach lists them; no repair starts until the coach
says the list is complete (smoke-findings protocol). Coach: "the rest looks
good." Deferred by the coach, not findings for this pass: Self-Scout and
Opponent Scout still need their rework, to be taken up later.

**S98-1 — repaired in source (`4c76169`), packaged in `1.12.0-99` and `1.12.0-102`, installed check pending.** Matchup's `Coverage Answers` section is renamed
`Coverages`.

**S98-2 — repaired in source (`4c76169`), packaged in `1.12.0-99` and `1.12.0-102`, installed check pending.** Offense page 3's heading `Structure and deployment`
is renamed `Structure and execution` (coach listed it twice, items 2 and 5;
one finding). The secondary-bar tab stays `Structure`. The same OffenseTab
renders inside Season > Offense, so one change covers both.

**S98-3 — CLOSED, no change (coach, 2026-09-24).** Matchup's unit cards show
our offense in cyan and their defense in gold. Coach first read that as
backwards (gold is offense, blue defense), then ruled on the source fact:
Matchup's approved comp colours by FILM COHORT — gold opponent film, cyan
season film — across the cards, the key, the table text and the film
buttons. **Keep Matchup's colour scheme as-is.**

**S98-4 — CLOSED, correct (coach, 2026-09-24).** Offense > Calls & tendencies
> Play-action shows `Power-I, 1 PA play, 0.0`. Coach had not realized a snap
was tagged Play Action. It is exactly one snap: ND Prep Fighting Irish, play
22, Q2, 4th & 11, `Medium Pass + Play Action`, incomplete (the `0.0`). The
coach confirmed the tag and the `Power-I` formation, which is a charted
formation in the tagging deck. **The play-action data is correct; no repair.**

**Scope for repair: S98-1 and S98-2, labels only.**

## Installed smoke, 1.12.0-97 (stopped at S97-1, 2026-09-23; continues on 1.12.0-98)

**Finding S97-1 — repaired in source 2026-09-24 (`77aea58`) at the coach's
direction to proceed; packaged in `1.12.0-98` (`SMOKE-1.12.0-98.md`), whose installed
smoke ran on 2026-09-24 with label findings only (above). The Offense pages carried several unrelated
visual treatments.** Coach, on Identity, Situations and Structure: different header
styles, headline styles and fonts per page, as though the old long board was
cut into pages unchanged. Offense gold / Defense blue is correct; the
treatment should be one system. Cause, from source: the pages kept each old
zone's module styles (gold uppercase micro-headers with a left gold rail on
Identity and Structure, gray uppercase KPI labels, condensed display values),
and the down-and-distance chart added a third style of its own (sentence-case
15px white title, gray cohort line, and a 2px CYAN top rule, which is
Defense's color, on an Offense page; `css/native-reports.css` `.gi-dd`). Not
yet audited: the other Offense pages, the Defense pages and the chart on
Defense. No repair started, per the smoke-findings protocol.

*Coach direction, same finding:* Defense Revision 2's hierarchy is the model
for Offense — a large primary heading per page (`02 Opponent offense`), a
large sentence-case module title under a colored top rule (`Production by
play type`), then smaller sentence-case column labels and rows. Offense takes
that same hierarchy in gold. This replaces the Offense board's inherited
micro-header treatment, which the approved Offense comp specified, so the
repair is a coach-directed change to that comp's typography and must be
recorded in the Offense production RATIONALE. The chart's title style already
follows the Defense hierarchy; on Offense its rule becomes gold.
Clarified by the coach: the point is the headings and the module outlines,
not the color — "Defense looks clean." Defense modules are separate outlined
boxes with 20px gutters and a title bar; Offense modules are packed into
bands that share rules, with a left accent rail. Offense adopts the Defense
module outline, spacing and heading scale.

*Repair (`77aea58`):* every Offense page opens on a numbered heading
(`01 Offensive identity` … `06 Advanced metrics`, with the classified cohort);
every module is an outlined box on 20px gutters with a 50px title bar (2px
gold rule, 17px sentence-case title); the Offense pane draws no rail or ground
of its own; the KPI strip is Defense's; tile, heat-map, lens and EPA
sub-heading labels are sentence case in the body face; column labels are
12.5px sentence case on a header band. The down-and-distance chart takes the
same title bar, gold on Offense and cyan on Defense. Composition, row
allocations and data are unchanged. Audited as part of the repair: Defense
already used this system and its harnesses are unchanged. Not restyled: chart
internals (Formation × Play Type and Top 5 Tendencies cells, zone-strip and
down-chart captions, EPA contribution bars and stat cards, the radar's small
monospace labels), which still carry the Offense type-floor census's 49
sub-floor elements. Captures: `artifacts/reports-offense-module-system/`
(canonical 2025 JV, St. Peter Lutheran, read-only copy, every page at 1440 and
1280).

*Extended to Special Teams (`272a62c`, coach direction 2026-09-24; packaged in
`1.12.0-98`):* the Offense CSS became one shared block for both boards. Special
Teams gets numbered section headings (`01 All units` … `05 Specialists` with
each section's count), outlined modules on 20px gutters with the 50px title
bar, and its KPI strip and unit ledger as hairline-divided panels with
sentence-case labels. **Open for the coach:** Special Teams has no assigned
accent colour, so its title-bar rules use the neutral bone line rather than
Offense gold or Defense cyan. Sections, modules and data are unchanged.
Captures: `artifacts/reports-special-teams-module-system/` (every section at
1440 and 1280). `e2e-reports-special-teams` §9c pins it (61).

*Extended to Players, Self-Scout, Matchup and Season (coach direction
2026-09-24; packaged in `1.12.0-98`):* `cba2f4c`, `cc3db88`, `b70b758`, `75673a2`, one
commit per board. Every Reports board except Overview now uses the one
system: a numbered heading whose cohort statement is the board's former
sample line, outlined modules on 20px gutters with the 50px title bar,
sentence-case labels and column headers, and no pane frame. Players and
Self-Scout keep each module's phase as its accent (gold offense, cyan defense);
Matchup and Season use the neutral line, Matchup because each section holds
both cohorts (which keep their gold and cyan). Season adds a heading only to
its own Overview and Trends; the boards it embeds bring their own. To keep the
Tackles identity column holding the longest canonical name at 1440, Players
modules take an 8px inset. Self-Scout's and Season's approved 14px module
titles are now 17px, recorded in their harnesses. Overview is untouched: its
approved broadcast composition is a separate coach decision. Evidence:
`tools/e2e-reports-module-system.mjs` (40, with the season's roster loaded so
Players name fit and alignment are checked on real names) and captures in
`artifacts/reports-{players,selfscout,matchup,season}-module-system/`.
Full gate at `5f208e1` (the whole S97-1 module-system pass): 126 harnesses,
126 green, zero skipped, zero failed.

## Coach Reports smoke findings (2026-09-23)

**Intake checkpoint:** The coach has finished listing findings for now and
aligned on the three-package sequence in `GRIDIRON-IQ-PLAN-V2.md` (Reports,
Breakdown charting, then Film Room). This closes intake, not the defects or
the installed smoke verdict. No repairs are claimed by this checkpoint.

**Finding 1 — implemented (`0e84464`), packaged in `1.12.0-97`, installed smoke pending;
see below.** The game KPI banner (Total Plays, Plays
Charted, Plays per Phase, Offense Success Rate, Turnovers) still appears on
several detail report tabs. Keep this summary on Overview only; detail tabs
should begin with their own report content under the unchanged global strip.
Condense the Overview score/summary area rather than repeating a second wide
banner. Its right-side matchup name is redundant with the opponent already
named in the box score on the left; remove that duplicate while retaining
useful, nonduplicated game context. Preserve the actual metrics and their
canonical sourcing. Check every Reports tab, both perspectives where
applicable, at desktop widths. The installed candidate's version was not
identified with this finding. No UI fix or acceptance is claimed.

**Finding 2 — implemented (`0e84464`), packaged in `1.12.0-97`, installed smoke pending;
see below.** Internal Reports navigation is
inconsistent: Offense uses zone jump links on one long page, Defense uses a
different jump bar, while Special Teams and Players use section tabs that
switch the visible page. The coach prefers the Special Teams/Players pattern
and wants one way to navigate report sections. Keep the already approved
global Reports strip fixed; evaluate a shared secondary-tab component in the
same position and style within every multi-section report, with report-specific
scope and export controls kept separate from navigation. Do not add empty tabs
to single-page reports. Converting Offense and Defense from long-scroll jump
links to pages changes their approved compositions and needs a coach-reviewed
comp before implementation. Preserve every existing module, its data cohort,
film action, and full-report export. This is a design recommendation awaiting
approval, not a selected or repaired implementation.

**Design checkpoint, 2026-09-23 — comp ready for coach review; findings 1
and 2 remain OPEN.** `design-comps/reports-secondary-nav-2026-09-23/`
(`index.html`, decisions and tradeoffs in `RATIONALE.md`) proposes one shared
secondary bar under the unchanged global strip, Offense as six pages and
Defense as four, no game rail on any tab, a compact Overview score without the
duplicate matchup name, and the down-and-distance chart as the first module of
the Offense and Defense Situations pages. Its captures are the production build
on a read-only canonical 2025 JV copy with a presentation layer applied; no
production UI or calculation changed. The comp's own focused checks pass
(strip geometry unchanged, every Offense/Defense block on exactly one page).
The coach elected to keep the six Offense pages despite short Identity and
Structure pages, leaving room for later growth. This is a page-grouping
decision, not approval of the full comp or an installed build.

**Finding 3 — open, terminology only.** User-facing explosive-play metrics
must name the thing measured: use **Explosive Plays** for counts and
**Explosive Plays Rate** for percentages. In a defensive context, qualify the
label with **Allowed**; qualify other directions where needed so the metric
cannot be mistaken for our offense's production. Audit every visible surface
where the bare label **Explosive**, **Explosives**, or **Explosive Rate** names
this metric, including Reports and its white-background exports, Study,
season/home summaries, table headers, chart labels, tooltips, and empty states.
Keep labels readable at desktop and narrow widths. Do not rename internal
metric identifiers, change thresholds, formulas, cohorts, or saved data, and
do not replace unrelated terms such as an explosive drive classification.
No implementation or installed acceptance is claimed here.

*Repaired 2026-09-23 (`4beec7d`); packaged in `1.12.0-97` (and the unsmoked
`1.12.0-96`), not installed-smoke verified.* Every user-visible label now reads **Explosive
Plays**, **Explosive Plays Rate** or **Explosive Plays Allowed [Rate]**
across Reports, Study, the season summaries, chart labels and the white HTML
exports. Study's neutral concept name is **Explosive Plays Rate** by coach
decision. The explosive-drive classification is unchanged. Longer labels
needed fit repairs, and no type was shrunk:
- the Team profile radar wraps long labels onto two lines;
- Self-Scout's column gets a measured width;
- the Defense board's explosive column gets a measured width that keeps its
  header inside the 44px contract.
`tools/e2e-explosive-labels.mjs` pins wording, Allowed qualification, fit and
exports on the canonical season at 1440/1280/768 plus sparse and empty games.
Known and outside this finding: the Defense Down & Distance header already
wraps to three lines at 768.

*Review correction, 2026-09-23 (`0e84464`); packaged in `1.12.0-97`.* On the Defense
board "Allowed" is implied and made compact KPI tiles and table headers wrap,
so the board reads **Explosive Plays** and **Explosive Plays Rate**; the
Defense HTML export and mixed reports (Overview, game export) keep
**Allowed**. The 108/96px column reservation sized for the longer label was
replaced by one sized for the word `Explosive` (80px, 72px in a half module),
which also stops the eleven-column Run / Pass vs Strength and Defensive
answers tables clipping it at 768. The KPI label now holds one line.

**Findings 1 and 2 — implemented 2026-09-23 (`0e84464`); packaged in
`1.12.0-97`, installed smoke pending.** Built to the comp above; composition only,
no calculation or cohort changed.
- *Finding 2:* one shared `SectionBar` sits directly under the global strip on
  all seven multi-section reports with one 46px box: pages left, scope and the
  report's own export right. Offense is six pages (Identity, Calls &
  tendencies, Structure, Situations, Field & production, Advanced) and Defense
  four (Performance, Opponent offense, Scheme & passing, Situations); every
  module appears on exactly one page, page choice is controller state, and no
  page narrows an export. Special Teams, Players, Self-Scout, Season and
  Matchup moved their existing controls into the bar unchanged. Retired: the
  Offense zone nav and zone rules, the Defense sticky scope/jump bar, the
  Season identity band. Boards embedded in Season carry the same bar inline.
  The down-and-distance chart was built afterwards as its own checkpoint
  (see below); both are in `1.12.0-97`.
- *Finding 1:* the game KPI rail is deleted from every tab. Overview's compact
  score is the linescore beside Result (official scores only), Charted and
  Turnover margin, with no duplicate matchup name; a one-sided game states the
  charted side and that the other was not charted.
- *Found while verifying, repaired:* at 1280 Special Teams' fifth section was
  cut off 59px (bar spacing now tightens below 1440, type unchanged); at 768
  the Overview facts were squeezed into slivers and at 390 the linescore ran
  off the phone (facts now take their own row; the phone linescore narrows its
  quarter columns); on a phone the global Export menu opened 30px past the
  left edge. That last one is latent at `759a82b`: `e2e-responsive-containment`
  passed there only because the overflowing linescore made an ancestor a
  horizontal scroller, which exempted the menu from its check.
Evidence: canonical 2025 JV, read-only and hash-checked, St. Peter Lutheran
current game and full season; captures in `artifacts/reports-global-strip/`
(every tab at 1440/1280/768/390), `artifacts/offense-production-realdata/`
(every page, every game, 1440/1280) and
`artifacts/defense-production-realdata/run-*/` (every page, both scopes,
1920/1440/1280/390). Unverified: installed WebView2 rendering, and the coach's
verdict on the composition.

**Global input regression from the secondary bar — FOUND BY THE FULL GATE AND
REPAIRED 2026-09-23 (`87371cd`); present in the never-smoked `1.12.0-96`
installer, repaired in `1.12.0-97`.** `0e84464` portaled the bar with `createPortal` from
`preact/compat`. Importing compat installs global option hooks that rewrite
`onChange` to `onInput` on every text and date input, so change-committed
fields outside Reports stopped committing on change: `e2e-native-tagging`
72/76 (three-digit yardage, the Special Teams and penalty editors) and
`e2e-study-screen` 109/115 (date ranges, Plan fields, saved views). All four
affected harnesses were green at `759a82b` and red from `0e84464` onward. The
repair renders the bar into its host with core Preact's `render()`. In real
use typing fires `input`, so the installed effect is per-keystroke commits
rather than dead fields; that behavior is not verified in WebView2. The same
gate found `e2e-play-call-charting` and `e2e-realdata` still reading the
pre-page one-scroll boards; both were repointed to the pages, not weakened.
Full gate at `87371cd`: 125/125, zero skipped, zero failed. **`1.12.0-96` must
not be smoked; `1.12.0-97` supersedes it.**

**Down-and-distance chart — implemented 2026-09-23 (`80941c7`); packaged in
`1.12.0-97`, installed smoke pending.** The comp's item 7, first on Offense >
Situations and Defense > Situations, with one engine owner, exact film refs and
the same cells in the game, season and Defense HTML exports. Found while
verifying and repaired before commit: the chart's rows first sized to their
content, so the Situations page measured 1157 or 1158px by game, breaking the
one-height-per-page rule; rows are now fixed. Known and deliberate: a cell whose
only snap is unmeasurable and has no yardage prints `- · -`; the chart counts
run/pass snaps, so its per-situation counts can be lower than the Defense Down &
Distance table's charted Snaps (e.g. season 1st & 7+: 56 run/pass vs 60
charted), and the header says which cohort it is. Review finding repaired
(`cd0fb40`): a selected cell holding only untyped snaps listed `No play type
charted` beside the counted `No play type N` row; it now shows the counted row
alone. **`1.12.0-97` (`SMOKE-1.12.0-97.md`) is the combined package carrying the
secondary bar and this chart; Reports approval waits on Charlie's installed
smoke of it.**
Evidence: `tools/e2e-reports-down-distance.mjs` (47) and captures in `artifacts/reports-down-distance/`.

## Installed Reports smoke, 1.12.0-94 (2026-09-22)

**IN PROGRESS, NOT APPROVED AS A RELEASE.** Coach findings from the installed
candidate are open; `SMOKE-1.12.0-94.md` identifies the package. The approved
navigation concept is
`design-comps/reports-global-strip-2026-09-22.html`.
It is a standalone comp, not a full report-board redesign.

**Items 1-4 are REPAIRED IN SOURCE, 2026-09-22, commit `160533c`; packaged
in `1.12.0-95` (never smoked) and again in `1.12.0-97`, installed smoke pending, so not
installed-smoke verified.** Browser evidence is
`tools/e2e-reports-global-strip.mjs` on a read-only copy of the canonical
2025 JV season (264/264, six mutations verified red) plus the existing
Reports, export, film and shell harnesses. The harness generates local,
untracked captures in `artifacts/reports-global-strip/`; run it to regenerate
them from a clean checkout. Chromium cannot certify the installed
WebView2 rendering, so each item stays open for the next installer's smoke.

1. **Shared Reports navigation — REPAIRED IN SOURCE (`160533c`).** The top-level tabs
   are global within the selected season, yet report-specific chrome gives
   Special Teams, Players, Self-Scout, Season and Matchup different navigation
   geometry. Use one persistent strip at the same screen y coordinate and with
   stable tab positions across Overview, Offense, Defense, Special Teams,
   Players, Self-Scout, Matchup and Season. Overview-to-Season must be a purely
   horizontal mouse move. Put Season last. Keep the Program/Season/Game context
   selectors above the strip; place report-specific scope, filters and section
   links below it. Where a board offers game/season scope, default to Current
   game; Season remains the dedicated full-season parent. The proposal to add
   an Offense season selector was withdrawn, not a finding.
   *Repair:* one strip in the route owner — fixed 50px head, then a 44px strip
   of perspective, eight equal tab tracks and Export. Measured identical tab
   boxes on all eight reports at 1440x900 and 1280x800, in both navigation
   directions, after scope changes and in the opponent perspective, where the
   four self-only tabs are now disabled rather than hidden. Defense and
   Special Teams now open on Current game, listed first.
2. **Score presentation — REPAIRED IN SOURCE (`160533c`).** The game score/linescore should appear on
   Overview only. The current shared scorebug above Offense and current-game
   Defense is no longer the approved presentation; Players and other detail
   reports need no score at the top. Score and other conditional report content
   must not move the global tab strip. Preserve the score's real data source;
   this is a placement/visibility decision, not an analytics rewrite.
   *Repair:* the linescore renders on Overview only, below the strip, with the
   official 41-0 total and quarters summing to it on the canonical Week 1. The
   Offense linescore and the Defense linescore with its Base front / Base
   coverage / Blitz rate identity strip are retired, not moved. The game rail
   on Special Teams, Players and Self-Scout keeps Total Plays, Plays Charted,
   Plays per Phase, Offense Success Rate and Turnovers and drops Final Score.
3. **Reports outer frame — REPAIRED IN SOURCE (`160533c`).** Recent report boards show a black empty
   surround that makes the surface look unfinished. Remove the visible frame
   or extend the board surface to its edges, consistently across affected
   tabs. Do not truncate or replace the full report content with the short
   placeholder data in the navigation comp.
   *Repair:* the Players, Self-Scout, Matchup and Season reports were capped at
   1648px and centred in a full-width near-black board, which exposed the
   frame at 1920. The cap is removed, so each report fills its board at
   1920/1440/1280. Season's 12px stage band above its report is also removed;
   that band was a decision of the revised Season comp, so this is a recorded
   divergence from that comp made to answer the coach's frame finding.
4. **Players name column — REPAIRED IN SOURCE (`160533c`).** A one-digit jersey number currently leaves
   the following name left of names following two-digit numbers. Reserve a
   two-digit-width number slot so all names begin at the same x coordinate in
   every Players table. Preserve the number and name as distinct readable data.
   *Repair:* the number sits in a one-cell grid beside a hidden `#00`, so the
   slot measures the real glyphs; names after `#5` and `#42` start at one x in
   every table on the canonical season.

The installed findings do not revoke the bounded `1.12.0-91` approvals for
Defense, Players and Special Teams boards. They also do not advance any
`design-approvals/APPROVALS.json` production status. The full `1.12.0-94`
installed verdict and release gate remain pending.

> **Status:** CURRENT DEFECT INDEX. Updated 2026-09-23: Charlie approved the
> `1.12.0-92` Home visual composition. `1.12.0-93` packages the follow-up
> source repairs, but its installed acceptance is pending and a coach screenshot
> disproved the Defense Edit library spacing fix. This does not certify unrun installed
> viewports, close the follow-up Home/Breakdown defects below, or change Home's
> formal `productionStatus: REJECTED`. The Home manifest now records that valid
> status, allowing the design-approvals audit to inspect all surfaces.
> A later unsigned `1.12.0-94` installer packages the source correction and
> Reports/export changes; its coach smoke is in progress, not approved.
> Previously updated 2026-09-21: the installed
> `1.12.0-91` smoke was APPROVED by the coach. It closes both `1.12.0-90` REVISE
> verdicts — Reports > Players composition and Reports > Defense cohort
> presentation — and confirms the Reports > Special Teams provisional pass.
> **Those are installed-smoke approvals, not registry states:** every Reports
> manifest in `design-approvals/APPROVALS.json` still reads
> `productionStatus: REJECTED`, and Home production remains `REJECTED` and was
> not in that smoke's scope. Previously updated 2026-09-19 and 2026-09-16. The `1.12.0-87`
> installed smoke DISPROVED the first BD-VP repair: Breakdown still showed
> floating scrollbar arrow controls and a horizontal track in the charting deck,
> and the deck spacing had regressed. **BD-VP is now CLOSED FOR BETA USE** (item 10):
> its second repair is gated at 119/119 and the coach approved the installed
> `1.12.0-88` smoke on 2026-09-16. PL-1, PL-2 and
> BD-CTX from that batch stand. The preceding `1.12.0-86` FILM-01 smoke passed and
> FILM-01 is accepted for beta use. The intermittent rapid-scrubbing failure
> remains recorded but is deliberately deprioritized; repaired items remain below
> as history until the index is normalized.

## Coach smoke, 1.12.0-88 (2026-09-16)

**APPROVED FOR BETA USE.** The coach approved the newest installed build,
`1.12.0-88`, closing BD-VP's acceptance checkpoint for floating arrows,
horizontal charting overflow and deck spacing. No additional viewport/DPI
matrix is claimed. Home rail scaling remains open; formal design approvals,
tagging, push and publication are unchanged.

## Coach smoke, 1.12.0-86 (2026-09-15)

**FILM-01 APPROVED FOR BETA USE.** Installed smoke passed linked-folder
set equality/mismatch, durable uncharted-clip removal across close/reopen, and
loaded delete/Undo with the restored playable clip, play, and selection aligned.
No coach-owned source film was deleted.

The rapid/repeated-scrubbing transition to `Film missing` could not be reproduced.
It is not closed: it remains an intermittent native-media defect with the evidence
below. By coach decision it is tabled and does not block the next repair batch.

## Coach smoke, 1.12.0-85 (2026-09-14)

**APPROVED FOR NOW.** The installed Scout-ownership checkpoint is accepted for
continued beta use. Program/season/scout navigation, season-scoped roster behavior,
and the surrounding Home work are good enough to move forward. This approval does
not close the three visual findings recorded during the smoke: Breakdown viewport
overflow and anonymous scrollbar arrows (Breakdown item 10), insufficient contrast
on the Program/Season/Game context selectors (Breakdown item 11), and premature
season-rail truncation plus poor long-library scaling (Breakdown item 12). Those
remain open for a later coordinated visual repair. No latent bug repair is included
in this approval.

## Coach smoke, 1.12.0-83 (2026-09-13)

Found at the board on the installed visual-smoke candidate.

**Additional CLOSED fixes — Breakdown utility alignment and watermark.** Every `Edit Library`
   action now aligns to the full charting-module edge rather than the final chip
   in its own row. The film watermark follows the actual contained video
   rectangle, including letterbox and pillarbox offsets, instead of the larger
   media container.

1. **CLOSED — Break Down bled off the left edge.** The first repair inferred
   route spacing from unrelated child padding and produced asymmetric outer
   padding that changed meaning by view. The composition now owns equal 6px
   outer gutters directly, with both values asserted at 1440 and 1920. The
   theater host keeps matching side borders so the gutter remains visible.

2. **CLOSED — `Direction vs Strength` did not answer the coaching question.** The
   module rendered one of `_playCallAnalysis`'s play-call lenses, and that
   analysis filters its source to plays carrying a `playCall`. The canonical
   season charts 0 of 449, so the module was structurally empty — while 19 of
   Week 5's offensive snaps carried both `playDir` and `strength`. It now reads
   those tags through the canonical `dirVsStrength` extractor already shared
   with the tendency pivot. Each fixed direction row now reports total snaps,
   run count and within-row run rate, pass count and within-row pass rate,
   yards per play and success. OLL's exact 10/2/2/5 cohorts and their run/pass
   splits are pinned, as is film activation for every measured row. `Calls by
   situation` keeps the two lenses the engine and the comp both have.

3. **NOT A DEFECT — five Offense modules are honestly empty.** `Play calls`,
   `Concepts`, both `Calls by situation` lenses and Identity's `Top call` all
   key on `playCall` / `playConcept`, which are filled on **0 of 449** plays
   season-wide; `Play-action` is empty on Week 5 because the season charts one
   play-action snap in total, in Week 2. These are charting-vocabulary gaps, not
   code defects: the Playbook & Calls library was never populated, so there is
   nothing for a play to snapshot. Reopen only if the coach begins charting
   calls and the modules stay empty.

4. **CLOSED 2026-09-22 — Balanced strength has a coach-facing label.** The
   fourth Direction vs Strength bucket now reads `Balanced strength`, matching
   the Defense report. The shared extractor supplies that label to both the
   Offense row and the Study/tendency pivot; the fixed row list and exact-film
   lookup use the same value. No cohort or calculation changed.

## Film Health

1. **FILM-01 - REPAIRED 2026-09-15 (Chromium); installed verification still
   outstanding - App and linked-folder clip sets are now reconciled in both
   directions.** The binding rule for LINKED film is exact identity-set equality
   between the game's durable clip index and the folder's videos, and both
   directions are now reported, with different states so the coach is told WHICH
   way the sets differ: a clip the game records and the folder lacks stays
   `missing` (the long-standing contract every surface already renders,
   `detail: 'clip-set-app-only'`), and a folder video the game has no record of -
   alone or alongside a missing one - is `mismatch` /
   `Film does not match folder` (`clip-set-folder-only`, `clip-set-both`),
   carrying a new `extra` count. Managed film keeps its one-way rule on purpose:
   that directory is app-owned storage, not a folder the coach maintains, so an
   extra file there is not a coach-facing mismatch. Home's game row, the
   selected-game film fact, the Settings film table and the library aggregate all
   consume that one result; the mismatched game counts as not linked.

   **The deletion half had two opposite defects, and repairing one without the
   other would have traded a stale record for data loss.** The durable clip index
   was rebuilt from the plays unioned with the LIVE playlist, so:

   - Opening a game WITHOUT its film left the playlist empty, and the next save
     pruned every clip that had no play. That is a silent record loss on ordinary
     navigation, and the shape that fits OL Lakes (89 durable records against 83
     charted clips). `_buildClipIndex` now seeds from the game's OWN durable
     `clipRefs` first, so the index never shrinks below what the game already
     recorded - and never below what the plays reference, which was the original
     film-index-wipe fix and is unchanged.
   - With retention in place, an intentional deletion needs an explicit signal, or
     a clip would outlive its play forever. `StorageManager.forgetClipIdentity`
     is that signal, recorded by the two deliberate in-app deletion paths
     (`PlaylistManager.removeClip` and `PlayTagger.deleteCurrentPlay`'s
     no-playlist branch, which is the one that covers deleting with film
     UNLOADED). A recorded removal is honoured only when no surviving play
     references the clip, so a clip two plays share survives one of them, and Undo
     - which restores the play - restores the clip with it. The set is per game,
     reset in `_loadActiveGame` exactly like undo history, so a removal in one
     season never follows the same clip id into another.

   Nothing here deletes, renames, relinks or rewrites a coach-owned source file,
   and no load path prunes either side. An externally deleted file therefore
   remains visible as a mismatch until the coach deliberately removes the app
   record.

   **What the OL Lakes `IMG_6690` case shows, and what it does not.** Read-only
   evidence: it is a durable clip record with no surviving play and no source file
   anywhere under `D:\Football`. Both of the mechanisms above could produce a
   record in that state, and the live season carries no history that distinguishes
   them, so **no claim is made about which historical action orphaned it.** The
   live season and the D-drive data were not modified.

   **Two follow-up findings from Codex review, both repaired 2026-09-15.**

   - **The central case was not persisted (P1).** Removing an orphaned clip such
     as `IMG_6690` only updated `_removedClipIds`: a clip with no play emits no
     `play-deleted`, so it rode no autosave, and closing the app resurrected both
     the record and the mismatch. `forgetClipIdentity` now schedules the durable
     write itself, so the signal cannot be recorded without reaching disk, and
     `rememberClipIdentity` is its symmetric undo. Debounced like every other
     edit, so the play-backed path still coalesces into one write.
   - **Undo restored the play but not its playable clip (P2).** The delete toast
     offers Undo, and `HistoryManager` snapshots plays only - a `File` and an
     object URL cannot round-trip through JSON - while `removeClip` destroyed the
     live clip. A play-backed removal now stashes the clip in
     `PlaylistManager._undoClips` instead, and `_reconcileUndoClips` re-inserts
     it at its original index on `plays-loaded`, the event Undo and Redo already
     emit. Redo takes it away again, and the durable identity follows both ways.
     The reconcile is scoped to clips this manager removed, because a game load
     emits the same event; `reset()` clears the stash and releases its URLs, and
     it runs before that event. An UNCHARTED removal stays permanent by design -
     nothing snapshots a clip with no play, and that path offers no Undo.
     `objectUrl` is a recreatable cache, not the clip's playability:
     `_releaseObjectUrlsExcept` revokes it for any non-adjacent clip as a
     standing memory policy and `_sourceForClip` rebuilds it from `clip.file`,
     so the invariant asserted is that the stash returns the SAME clip object
     with its source intact.

   - **Undo restored the clip but landed on the adjacent play (P2, third
     review round).** `switchToClip` selects whatever clip it loads, and the
     reconcile switched to the clip that happened to be active AFTER the
     deletion - so it overwrote the `currentPlayId` History had just restored.
     The selection belongs to History: the reconcile now prefers the restored
     play's OWN clip as the switch target, so film and selection agree, and where
     the target has to be another clip it puts History's selection back
     afterwards. `_selectPlayNoSeek` was extracted from `switchToClip` so both
     paths share one selection owner rather than two copies of the same four
     lines. Redo is unchanged and correct: it restores the snapshot the deletion
     produced, whose selection is cleared, so the neighbouring clip's own play is
     the honest selection.

   Evidence: `e2e-film-clip-set` (45), mutation-verified six ways - restoring
   the one-way comparison (7 red, including the Home and library agreement
   checks), restoring stale durable-deletion behaviour (7 red), restoring the
   prior prune (4 red), removing the save the removal signal schedules (3 red),
   destroying the clip instead of stashing it (3 red), and restoring the
   adjacent-clip switch that overwrote the restored selection (3 red).

   **Installed WebView2 verification passed in `1.12.0-86` on 2026-09-15.** The
   coach verified real linked-folder equality/mismatch behavior, durable removal
   across close/reopen, and loaded delete/Undo with film and selection aligned.
   FILM-01 is accepted for beta use.

## Home

Home is a high-priority navigation and data-accuracy surface. Current production
remains `REJECTED`; the approved 2026-08-31 Home comp remains the design
authority, with the `1.12.0-92` rail revision visually approved by the coach.

**Installed Home visual verdict, 2026-09-22:** Charlie approved the `1.12.0-92`
composition. Claude's installed smoke was partial; 1440×900 and 1280×800
captures, real-data independent tree scrolling and an installed console check
were not completed. See `SMOKE-1.12.0-92.md`. Approval does not close these
newly observed findings:
- Season setup checks only the first stored game, which can be an untouched
  starter even when later games are configured. First game and Ready to chart
  then appear incomplete. The operating state should be derived from the
  season's configured games without treating an empty placeholder as ready.
- Season setup and Edit season details retain the old condensed typography,
  including dialog headings and the season-name preview.
- Saving team identity does not persist when opened from an individual game
  or Manage program. Confirm the shared save/readback path before changing
  coach-owned identity data.

**Separate Breakdown follow-ups reported with this build:** the Defense deck's
Edit library spacing regressed and Add in the defensive-front library is a dead
button. Penalty Auto D&D is not working as expected; the coach wants the
manual Resulting situation box removed and the next situation derived from
penalty entry. Enforcement rules and unresolved cases need explicit tests.

**Source repair, 2026-09-22; packaged in `1.12.0-93`:** the season setup now finds a
configured game beyond an empty starter; Season setup and Edit season details
use the current sans display type. Identity save now updates the open program
season's profile and games as well as the registry, and a canonical reopen test
passes. The first Defense Edit library alignment change only kept the buttons
on the right edge and left a dead spacer; a rendered
Defense-deck click adds a custom front, exposes it immediately, and persists it
across reload. A refused library write now reports failure instead of clearing
the input as though Add succeeded. The manual penalty Resulting situation form
is removed. Auto D&D derives declined, offsetting, and accepted penalties
when the structured entry supplies the necessary facts: No play enforces from
the previous spot; a counted dead-ball foul enforces from the charted play's
ending spot. The charged team determines the direction of the entered actual
penalty yards. Counted live-ball fouls remain blank because their enforcement
spot is not charted; fourth-down plays that end possession also stay blank.
The coach can correct those situations on the next snap. Missing rulings or
yards remain blank, and previously confirmed stored situations remain readable.
Focused checks (also rerun on the clean package worktree where applicable):
`e2e-native-team-hub` 20/20, `e2e-play-library` 53/53,
`e2e-native-tagging` 76/76, `e2e-field-fixes` 26/26,
`e2e-team-registry` 24/24, `e2e-game-context` 16/16, and
`e2e-penalty-contract` 7/7. No installed smoke or full gate claimed.

**Post-package spacing correction, 2026-09-22; not in `1.12.0-93`:** a coach
screenshot showed the Edit library actions still stranded at the far edge of
the Defense deck. The source layout now puts each action beside its label or
hint; the regression check requires a small actual gap, not just right-edge
alignment. The populated Defense-deck capture was inspected and
`e2e-native-tagging` passes 76/76. Installed verification remains pending.

0. **REPAIRED 2026-09-21 — the navigation rail starved the season tree.** Found
   in the approved `1.12.0-91` installed build: Program Seasons showed only 2026
   while 2025 JV was the OPEN season. Root cause: both trees held an equal `1fr`
   with a 112px floor beneath a tool block taking 291px of a 682px rail, so the
   season tree held about one visible row and the open season was scrolled out
   of it — and nothing re-scrolled it back after a resize, because a viewport
   change re-lays out the rail without re-rendering it.
   - Program Seasons now takes the rail's flexible height with a 120px floor;
     Opponent Scouts is content-sized under a 34% cap. Both bounds are load
     bearing: equal rows starved the seasons, and a purely content-sized scout
     pane collapsed the season tree to zero at 1280×800.
   - The five utility actions keep their 40px targets and their labels and stay
     anchored and reachable; the reclaimed height came from the rail's own
     paddings and gaps, plus a tighter spacing step below 960px viewport height.
     **No control, row or type size was reduced.**
   - **SUPERSEDED 2026-09-21 by the Codex repairs below:** the first pass let a
     folded year keep its current row rendered. That is gone. The CURRENT
     behaviour is the one recorded two entries down — the active year is a
     heading that cannot fold, and an inactive folded year renders nothing.
   - Measured: three seasons with no internal scrollbar at 1920×1080 and
     1440×900; eight and ten seasons scroll inside the season tree only, never
     the rail and never the page; no horizontal page scrolling at 1920, 1440 or
     1280; long labels truncate with a title and never widen the rail.
   - Superseded evidence, kept as history: `artifacts/home-rail/` and
     `artifacts/home-repair-91/`, against a 30-assertion suite. The CURRENT
     evidence is listed with the Codex repairs below.
     **Historical checkpoint:** this first pass awaited a Charlie Gate. The
     later `1.12.0-92` Home visual verdict is recorded above; production status
     and the registry remain unchanged.
   - **Codex review of `77e7b50..3dee2ac`, repaired 2026-09-21.** Two findings.
     **The active year could fold**, which pinned its current row visible under
     `aria-expanded="false"` — rendered content behind a collapsed state, and a
     control that could not honestly complete. The active year is now a heading
     with no collapse; inactive years fold completely, rendering no body, so no
     year can contradict its own state. Opening a season in a folded year makes
     that year the expanded active heading, reveals all of it and scrolls the
     open season into view; collapse state is keyed by team, section and year,
     so it cannot leak across a program change.
     **The earlier pass recorded the visual audit instead of repairing it.**
     Now repaired: `View roster →` (16px), the `…` overflow button (28px),
     `Link film` (24px), both rail create buttons (26px) and the library back
     link (26px) all meet the 30px desktop target, by padding pulled back out of
     their rows — no panel grew, no type shrank, and the overflow action keeps
     its icon, accessible label and tooltip. The duplicated opponent identity is
     gone from every game card and the detail panel: the school subline renders
     only when the title does not already contain it. Score, date, status,
     charting and film are unchanged.
     Re-scanned populated at 1920×1080, 1440×900 and 1280×800: no sub-30px
     control, no duplicated identity, no clipped text, no horizontal page
     scrolling, six of six cards, zero console errors. Evidence:
     `artifacts/home-repair-91b/`.
   - **Codex review of `3dee2ac..a6f21d7`, repaired 2026-09-21. THIS IS THE
     CURRENT RAIL BEHAVIOUR.**
     **One year-group key.** Grouping normalised a missing year to `Undated`
     while the active-year test normalised it to `''`, so an OPEN legacy season
     with no year sat in a collapsible group. `yearGroupKey()` is the one owner
     both read; `Undated` is the active, permanently expanded heading when it
     holds the open season, and dated years beside it stay collapsible with
     their team + section + year scoping. No stored metadata is read or
     rewritten.
     **No caret on the active heading.** It was still drawing the expanded
     disclosure glyph while being noninteractive; alignment now comes from an
     empty spacer of the caret's own width. An INACTIVE folded year renders no
     body at all, so `aria-expanded` and the DOM always agree.
     **Real keyboard operation, and a shared-owner defect behind it.** The old
     test dispatched a synthetic `KeyboardEvent` and then called `.click()`.
     Driving real keys exposed that `App._bindKeyboard` guarded only
     INPUT/TEXTAREA/SELECT, so Space was swallowed from every focused button in
     the app while also toggling film playback. The guard yields Space and Enter
     to buttons, links, `role="button"` and editable content.
     **Two defects the captures found.** The scout pane, sized `auto` beside the
     flexible seasons row, collapsed to 5px against 92px of content and hid its
     only row — its track is now its own content height capped at 34% (46% on a
     short rail). And at 1280 both create buttons sat 26px past the rail's right
     edge because a grid item's automatic minimum is its content; the sections
     carry `min-width:0`, and the harness checks both axes now.
     **Current evidence:** `tools/e2e-home-rail.mjs` (57 assertions,
     behavioural, including a legacy `Undated` fixture in its own browser
     context) and `artifacts/home-rail-91c/` at 1920×1080, 1440×900 and
     1280×800. The 1920 capture shows all three year groups at once; the 1440
     capture shows the folded 2026 group, caret-less active 2025 heading,
     selected row and bounded tree; the 1280 capture shows the selected active
     group, scout row, create actions and anchored tools inside the shortest
     supported rail. Together with the measured scroll assertions, these prove
     that groups remain reachable without pretending all three fit in the
     narrow rail simultaneously. Every capture includes populated cards and the
     selected-game panel.
     **Limitation, stated plainly:** the scout-track starvation is fixed and
     measured but is NOT mutation-proven — the harness's rail does not starve in
     that configuration, so that one assertion guards the contract without a
     red-proven mutation behind it.

1. **REPAIRED 2026-09-12 — Home has one renderer and one composition.** The
   shell no longer creates or mounts `#wsTeamHub`. Season Library now saves and
   closes the active season, then renders the no-open-season library inside the
   existing Home route. Team Hub remains only the controller/dialog owner for
   season operations, recovery, roster, film, and program settings.
2. **REPAIRED 2026-09-12 — one workspace switcher.** The shell-level `Our
   Program / Opponent Scout` control is the only rendered workspace-mode
   control. The duplicate card pair was removed from Home's library body, and
   the Home harness asserts one switch plus the absence of a Team Hub host.
3. **REPAIRED 2026-09-13 — the no-open-season library was an unacceptable
   first impression.** Home no longer repacks the generic Team Hub season row
   into small equal-width cards across the top of an otherwise empty canvas.
   It owns a readable full-width program summary and season list with identity,
   games, plays, explicit film health, restrained destructive actions, and a
   latest-season/film-health panel. The 1280px collision found during visual
   inspection is part of the containment contract. TeamHubScreen remains
   the sole service owner for open, create, delete, recovery, and film checks.
4. **B1-1 - REPAIRED 2026-09-15 - Season film-health counts could be wrong
   outside the active season.** The owning season id is now a first-class
   argument all the way to the filesystem: `WorkspaceContext.filmHealth(game,
   seasonId)` passes it to `StorageBackend.listFilmFiles(gameId, seasonId)`,
   which builds `seasons/{seasonId}/films/{gameId}` from that id rather than
   `backend.currentId`. Every result carries the `season` it is about, and
   `TeamHubScreen._aggregateFilm(games, seasonId)` is the one season-scoped
   result every Home and library presentation consumes (peeks stay read-only).
   The label is always an explicit count - `6 of 6 games linked`,
   `5 of 6 games linked`, `No film linked`, `No games yet`; a settled season
   can no longer sit on a permanent `Checking film...`, which is what one linked
   game beside one game with no film added used to produce. Evidence:
   `e2e-data-correctness-batch1` (58) with two seasons reusing game id `g1` and
   different film on disk, mutation-verified by dropping the season argument -
   which reproduces the coach's symptom exactly (the closed season reported the
   OPEN season's film). No coach film or season record was read
   or written by that repair.

   **B1-1a code fix - REPAIRED 2026-09-15.** The season-scoped managed lookup
   above, plus one further repair the live audit below exposed: `Film needs
   attention` was gated on a per-game `action === 'reconnect'`, which a LINKED
   game missing a single clip also sets - so a season that could be counted
   perfectly well reported a state instead of its count. That label is now
   reserved for film that cannot be COUNTED: an unreachable linked folder, or a
   listing that failed.

   **Codex review follow-up - REPAIRED 2026-09-15.** The aggregate now treats
   `managed-list-failed` and a rejected `filmHealth` call as uncountable, just
   like a failed linked listing. It checks that state before the zero-expected
   shortcut, so a filesystem/read failure cannot be presented as either
   `0 of N games linked` or `No film linked`. One failed lookup also prevents a
   mixed season from printing a falsely authoritative count. Evidence:
   `e2e-data-correctness-batch1` (76), with distinct managed-list, all-rejected,
   and partially rejected fixtures.

   **B1-1b live-data verification - RESOLVED 2026-09-15. The library's mismatch
   count was right and the installed game view's `fully linked` state was wrong.
   The current recorded-set result is `5 of 6 games linked`.**
   Determined by read-only inspection of the installed data and the coach's real
   film library; nothing was relinked, renamed, deleted or rewritten. All six games
   of `2026-varsity-demo` ("2025 St. Joseph Mavericks - JV") are LINKED, not
   managed, and resolve under `D:\Football\Film`:

   | game | film folder | expected | on disk | state |
   |---|---|---|---|---|
   | St. Peter Lutheran Patriots | `St Peter 41-0` | 69 | 69 | linked |
   | ND Prep Fighting Irish | `Marist 8-6-2025` | 79 | 79 | linked |
   | OL Refuge Ravens | `Refuge 7-13` | 81 | 81 | linked |
   | OL Sorrows Lancers | `Sorrows 18-6` | 72 | 72 | linked |
   | **OL Lakes Lakers** | `OLL 13-13` | **89** | **88** | **missing 1** |
   | Holy Family Wildcats | `Holy Family` | 81 | 81 | linked |

   Because every game is linked, the managed season-scoping repair is not what
   drives this season's count at all - linked film resolves from the game's own
   `filmDir` under the library root and is deliberately season-independent.

   The unequal identity is `IMG_6690`: it remains in OL Lakes' `clipRefs`,
   `clipPaths` and `clipNames` as playlist entry 85 of 89, but exists nowhere
   under `D:\Football` and **no surviving play references either its filename or
   stable catalog id**. This is an orphaned app clip entry, not missing film for
   a surviving charted play. No coach data was changed. The product defect behind it
   is `FILM-01` below - normal in-app deletion and external folder maintenance must
   converge on an exact set comparison - and that comparison is now implemented.
   **Which historical action left this particular entry orphaned is not
   determined**, and the record carries no history that would settle it.
   Noted in passing and also untouched: `D:\Football\OLL 13-13` (82 entries) sits
   outside the library root as a separate, older copy of that game's film.

   This is the concrete explanation for the OLL playlist discrepancy: 82
   surviving plays, 89 recorded playlist entries, and `IMG_6690` has neither a
   file nor a surviving play. The reconciliation defect itself is repaired under
   `FILM-01`; this entry stays as the read-only evidence it was gathered as, and
   the live season was not modified to resolve it.

   Evidence: `e2e-film-health-realdata` (14) reads the installed season body and
   walks the real directories, then asserts the repaired owner prints exactly
   `5 of 6 games linked` and that every per-game count matches its own source. It
   is read-only and skips honestly when the data is absent.

   **STILL NOT VERIFIED, and only an installed run can be:** Tauri's own
   `fs.readDir` / `exists` inside WebView2. The audit reads the same paths with
   Node and the managed directory resolution is pinned in source, but Chromium
   cannot exercise the desktop filesystem - so "the installed app sees these same
   files" is asserted, not proven.
4b. **B1-4 - REPAIRED 2026-09-15 - In-flight film operations were keyed by game
   id alone.** Found by Codex reviewing `3954b03..fb02619`: the same identity
   defect as B1-1, one layer up. A save or repair running in the open season made
   every OTHER season that reuses that game id report `Checking film…` instead of
   its own settled count, because `filmHealth` found the operation under the bare
   game id. Operations are now keyed `season::game`
   (`WorkspaceContext.operationKey`), the season is captured when the operation
   STARTS - film writes land under the season open at that moment, so that is the
   owner even if the coach navigates away mid-write - and every producer threads
   it: `_showFilmImportProgress(done, total, operation, gameId, seasonId)` and all
   three `storage.js` write paths pin their season before the await. Clearing is
   deliberately asymmetric and fail-SAFE: with an explicit season it removes that
   one entry, without one it removes every season's entry for that game, because a
   stale operation is worse than an extra delete - it would pin a season on a
   transient label forever. Evidence: `e2e-data-correctness-batch1` (73), a
   two-season reused-id fixture covering the scoped read, the explicit clear, the
   sweep and the create-time default, with the producers pinned in source;
   mutation-verified by reverting to bare-game-id keying, which reproduces the
   reported symptom exactly.

5. **SUPERSEDED 2026-09-14 — "each side restores its most recently opened
   season" was the defect, not the repair.** The 2026-09-13 entry recorded
   `lastOpened` restoration as the fix for workspace switching. The coach then
   reported the real behavior: entering Opponent Scout visibly moved through
   Opponent Scout, a Home/library flash, and an automatic redirect into an
   unrelated season. Three defects were stacked — scouts had NO durable
   relationship to a program season, so recency stood in for ownership; the
   workspace mode had three competing owners; and the transition was a sequence
   of full navigations, each of which rendered.

   **The model (2026-09-14).** A program season is the parent Home context and
   every scout belongs to exactly one through a durable `programSeasonId` on its
   body and library row. `WorkspaceContext` solely owns the parent id and the
   mode. A toggle is one state change and one render: entering Opponent Scout
   keeps the parent OPEN and renders its own scoped library; it never calls
   `closeSeason()` or `_openLibrary()` and never auto-opens a scout. Returning
   opens a season only from an open scout, by its exact `programSeasonId`.
   `lastOpened` may only order scouts inside a correct parent.

   **Lifecycle.** Legacy inference is read-only and unique-match only
   (`teamId + year + level`); zero or several leaves the scout unassigned.
   Unassigned scouts — first launch, ambiguous legacy, or a stored parent that
   no longer resolves — render in Home's `Needs a program season` section with an
   explicit season selector, and assignment persists only after the coach
   confirms, through `SeasonStore.assignScoutParent()` (inside the per-season
   write queue and the PC-4 fence, updating the live object when that scout is
   open). A team switch clears the parent atomically and persisted context is
   validated against the active team. A program season that owns scouts cannot be
   deleted; the command blocks with them named and cascades nothing.

   **Two Codex findings on that range, repaired 2026-09-14.** (a) The unassigned
   rows were UNKEYED with uncontrolled selects, so Preact could reuse a departed
   row's DOM node and submit the season chosen for the assigned scout through the
   next scout's handler. Rows are keyed by scout id, selection is held per scout
   id, and an in-flight assignment locks its own control. (b) `isValidParent()`
   admitted any non-scout record including the SAMPLE season, so the demo could
   become a parent and be persisted onto a real scout — trapping opponent film
   under a disposable season, since reassignment is deferred and a parent owning
   scouts cannot be deleted. A valid parent is now defined once in
   `WorkspaceContext.isProgramSeasonRecord()` and applied to every path.

   **Coverage.** `e2e-scout-ownership` (91), `e2e-home-deferred-repair` (105),
   `e2e-home-review-repair` (37). Five assertions across the two Home harnesses
   that enforced the retired redirect were retired with their replacements
   recorded inline. Captures: `artifacts/scout-workspace/`.

   **Deferred, genuinely out of scope:** reassigning a scout whose parent is
   still valid (only blank or dangling parents are assignable), and Home's mobile
   layout at 390, where the stacked rail occupies the first viewport before any
   workspace body — a Home-wide composition question, not scout-specific.
6. **REPAIRED 2026-09-13 — empty Opponent Scout is a full workspace.** The
   tiny centered empty card and duplicate create actions were replaced with
   the same operational composition used by the Program library: a full-width
   zero-state summary, the actual opponent/season/source-game/play/film table
   structure, and one anchored create/status panel. No sample opponent data is
   fabricated. The responsive composition keeps exactly one visible create
   action reachable in the initial viewport, including at 390px; the table uses
   real row and column-header semantics; rail and body empty-state copy is
   intentionally distinct; and the list/status columns share structural spacing
   rather than a compensating magic offset. Workspace changes now fail closed:
   a failed save or preload restores the prior mode, season, and pressed state.
   Workspace-choice buttons are explicitly non-submitting. Focused proof covers
   all of those contracts, and the stale Team Hub-era gate consumers now drive
   the current Home/controller architecture. The canonical gate is 110/110
   green with zero skipped or failed harnesses. Coach smoke remains pending.
7. **REPAIRED 2026-09-13 — roster ownership appeared universal across teams and
   seasons.** The isolation CODE was correct and reproduced clean in every
   direction. The defect was in the DATA: all three seasons in the live catalog
   each stored the same 19-player roster at rest, written before the 2026-08-29
   repair, and every store faithfully rendered what it held. A second, live
   defect sat behind it — `_normalize` adopted `games[].roster` whenever the
   season key was absent, on every load, restore and import, so ownership was a
   repeated inference rather than a stored fact and a deliberately emptied
   season re-acquired players from its own legacy game nodes.

   **Architecture (completed 2026-09-13, second pass).** `_normalize` only
   coerces `season.roster`; it never promotes. Promotion happens at ONE
   boundary, `SeasonStore.adoptLegacyRoster()`, called by the durable read
   (`_hydrate`, used by `load()` and `openSeason()`), `adopt()` and
   `restoreBackup()`. It reads only the season's own game nodes, so no
   comparison or move can cross a season boundary. The fallback was moved, not
   deleted: old single-game saves and pre-season-model backups still convert.

   Opening a legacy season DOES invoke that boundary — deliberately, because
   such a season is opened rather than imported, and without it the roster would
   simply vanish. What the coach ruled out was repeated INFERENCE on every load,
   which is gone. The honest statement of the boundary is:

   - **Validated, never guessed.** Every non-empty `games[].roster` in the
     season is compared through `SeasonStore.rosterIdentity()` — key order,
     whitespace and row order normalized, no player value rewritten. Promotion
     happens only when all copies agree.
   - **A disagreement ABORTS the operation (repaired 2026-09-14).** The season
     does not open at all. Nothing is selected, nothing is removed, nothing is
     written, and the conflicted season is never exposed as the editable current
     season. `openSeason()` returns null and restores the prior
     `currentSeasonId`, the prior `data` and the backend current-season pointer;
     `openSeasonById()` returns false without `_afterSeasonLoaded()`;
     `adopt()` returns `{ok:false, data:null, conflict}` before staging or
     persisting; `restoreBackup()` runs the boundary before its safety snapshot
     and returns null. `TeamHubScreen.openSeason()` and the shell's season picker
     fail closed on that false return. The next open reconsiders it, so a
     resolved season still converts later.

     **The first attempt at this was destructive and looked contained.**
     `_hydrate` returned `_normalize(original)`, which coerced a synthetic
     `season.roster: []` beside the surviving conflicting copies; the next
     ordinary save persisted that synthetic roster; and the open after that
     classified it as an EXPLICIT season roster and deleted every conflicting
     copy. Three steps, none visibly wrong on its own. The harness now drives
     that whole sequence, and the mutation that restores the old return reds
     eight assertions and reproduces the deletion in its own output.

     The coach-facing message names the season and its games and offers no
     remediation step, because no current screen can reconcile per-game rosters.
     The import path reports that message instead of "could not be saved", which
     would misreport disagreeing rosters as a storage failure.
   - **Single ownership, not merely preferred.** A settled conversion deletes
     `roster` from every game node, including a season whose own roster already
     won over stale copies. Modern game records never carry the field, and
     `SeasonStore.updateActiveGame()` carries a surviving legacy copy forward
     the way it carries `filmMode` — `_serialize()` produces none, so without
     that the first ordinary save after a conflicted open destroyed the active
     game's copy.
   - **Durable and once-only.** `_hydrate()` detects and converts before
     hydration, writes a `Before roster migration` restore point, then persists
     `season.roster`, `rosterOwnership: 'season'` and the removal through the
     normal revision-fenced per-season write queue, and only then exposes the
     season. A failed write blocks the open exactly like a conflict: the target's
     durable bytes are untouched, the prior season stays active, and the failure
     is reported through the shared persist-failure seam, so the next open retries
     the whole migration. A season nothing changed on dispatches no write at all,
     so a settled season neither converts twice nor mints a revision the PC-4
     fence would read as a commit.
   - **The marker asserts both halves** — season ownership AND **no game object
     holding its own `roster` property at all**, `roster: []` included. Gating on
     `roster.length` (the first implementation) degraded the invariant to "no
     non-empty copy", and a later writer filling that surviving array would
     recreate dual ownership under a marker asserting it could not exist.
     `_normalize` refuses to stamp a season any of whose games still carries the
     property.
   - **Attribution follows the owner.** `SeasonManager._mergeRoster()` reads the
     selected season's roster rather than merging `games[].roster` across the
     Our Program cohort, which makes the hand-written opponent-scout exclusion
     structural.

   **Authorized data normalization (Charlie, 2026-09-13).** The 19-player roster
   belongs only to the 2025 St. Joseph Mavericks JV season; no roster was
   entered for 2026 JV or 2026 Varsity, so both are empty. Identity was verified
   from stable game ids and metadata, never a directory name — see the ledger in
   `docs/ROSTER-NORMALIZATION-2026-09-13.md`. `tools/audit-roster-ownership.mjs`
   is the read-only auditor; `tools/normalize-roster-ownership.mjs` performed the
   one-time write behind `--apply` with timestamped backups.

   **Coverage.** `tools/e2e-roster-ownership.mjs` (71) pins cross-team and
   cross-season isolation, empty-stays-empty across switching and reload,
   same-season sharing with no game-level copies, game creation neither copying
   nor clearing, `_normalize` never promoting and never marking an unfinished
   migration (including a game holding `roster: []`), validated promotion,
   removal of every game copy, the first legacy open's durable write read back
   FROM DISK, a second open dispatching no write, emptying not resurrecting,
   import/adopt/restore landing the same structure, backup/restore scoped to one
   season, and attribution reading the selected season's own roster.

   Containment is proven end to end rather than at a single open: a real season
   is held open with its own live roster, the conflicted season is refused, an
   ordinary save and a season switch follow, and a second attempt is refused —
   with the returned false, the preserved season id and `data`, the preserved
   live and stored rosters, the restored backend pointer and loaded game id,
   byte-identical source bytes after both attempts, no season `roster` key or
   marker on disk, and both refusals surfaced. A failed migration write gets the
   same treatment plus a retry that converts once the write can land (the backend
   is failed for one season id only, so every other write in that section is
   real). Conflicting import and conflicting restore each prove memory, canonical
   disk state and the backup are untouched.
   `e2e-season-roster-scope` (19) keeps the four legacy-boundary cases,
   repointed to the boundary rather than weakened.

   Section 9's `(no seasonManager)` escape hatch is REMOVED: it let the whole
   attribution section pass having measured nothing. `e2e-reports-season` (99)
   also had its fixture repointed — it gave every game an empty `roster: []`,
   reproducing the dual ownership the model no longer has; our players now sit on
   the season, the conflicting scout roster stays planted on its own game node,
   and a new assertion proves it is actually there.

   Mutation-verified: reinstating first-non-empty guessing reds 7 assertions;
   retaining the game-level copies reds 10; converting in memory only (skipping
   the durable write) reds 3; re-exposing `_normalize(original)` after a conflict
   reds 8; continuing `adopt()` past a conflict reds 4; continuing
   `restoreBackup()` past one reds 3; reverting the marker check to
   `roster.length` reds 1; exposing a target after a failed migration write
   reds 2. `js/season-store.js` was confirmed byte-identical to its pre-mutation
   baseline before committing.
8. **LOGIC REPAIRED 2026-09-13, presentation still open — Add Game mislabeled
   analytics perspective as `Film source`.**

   **The selector is gone.** It was worse than mislabeled: choosing
   `Opponent film · Scout` inside a Program season stamped
   `perspective:'scout'` on a program game, and `SeasonManager._selfGames()`
   excludes scout games, so that game silently left our record, yardage, success
   rate and turnover margin. `native-game-form.jsx` renders and submits no
   `perspective`; `GameScreen.save()` derives it from the owning season and
   drops any value that arrives with the form; a create seeds the existing
   `offense` default that `unitFromPerspective` turns into Break Down's opening
   unit, and an edit omits the field so `_applyGameInfoDraft` preserves whatever
   the game already stores. `breakdown-workspace.js` no longer focuses a
   `[name="perspective"]` selector that would match nothing.

   **No game-data repair was necessary.** A read-only sweep of every game in
   every store — catalog, app-data JSON and Documents mirror — found **zero**
   Program-season games carrying `perspective:'scout'`. Nothing historical was
   rewritten.

   **Coverage.** `tools/e2e-game-form-context.mjs` (20) pins the control's
   absence from source and from the rendered form, program creation, scout
   creation, and edit preservation. Mutation-verified: removing the save-seam
   guard reds "editing a Program game cannot smuggle perspective scout through
   the save seam" — and finding that the create path's explicit `offense` masked
   the gap is why that edit case exists. `e2e-native-game`'s scout-from-form
   assertion is RETIRED, not repointed: its subject was the removed defect.

   **Presentation REBUILT 2026-09-13.** Neutral `--gi-bd-*` surfaces, a gold
   primary, one 12.5px label role in sentence case, and four ordered groups —
   opponent, schedule, optional score, actions — on hairlines rather than the
   nested fieldset card. It uses the existing overlay service and adds no
   second persistence path; film linking stays in the canonical per-game film
   workflow.

   Four defects here were found by LOOKING at the captures, not by the geometry
   pass, and each now has its own assertion: a legacy global in `styles.css`
   (`input:focus:not(.ws-shell *)`) painted a focused border with `--accent`,
   and this dialog renders outside `.ws-shell`; a global number-input rule
   outranked the form's element selector and painted the score fields as
   unbordered filled bars; an `auto` separator track took 194px of a 474px row
   and threw `Us` and `Them` to opposite ends of the dialog; and a native date
   input renders ~10px taller than a text input, giving one row three top edges.
   A fifth was self-inflicted: a mobile `order:1` on the destructive action made
   tab order disagree with visual order.

   `tools/e2e-game-form-visual.mjs` (242) covers program create/edit and scout
   create/edit at 1920×1080, 1440×900, 1280×800, 768×1024 and 390×844.
   Captures: `artifacts/game-form-visual`.

   **A deferred overlay focus frame could divert typing (2026-09-13).** The full
   gate caught `e2e-native-game` recording `week: "2Bravo Bears"` — an opponent
   name landing in the Week field. `native-root.jsx` applies a dialog's initial
   focus in a `requestAnimationFrame`; under load that frame can land after
   someone has clicked into another field and begun typing, and it yanked focus
   back unconditionally. It now refuses to move focus that is already inside the
   panel. **Unpinned, deliberately:** Puppeteer's `waitForSelector` resolves only
   after that frame has run, so the race window is unreachable from a harness —
   an assertion written for it passes with the guard removed, which is coverage
   in name only. Verified by reproduction of the symptom in the gate and by
   every overlay harness staying green, not by a check that cannot fail.

   **OPEN, deliberately not changed here — the shared focus ring is blue.**
   `--gi-focus` resolves through `--gi-los` to `--gi-9` (#2b6fff), so every
   focused control in every modern dialog draws a blue ring. Neutralizing it is
   an app-wide palette edit, not a change one form may make on its own. Needs a
   coach decision; until then the form's RESTING state carries no legacy blue
   and its assertion measures exactly that.

## Pre-gate review of the shared visual range — FAILED, then repaired

### Full-gate geometry failures on `2073e2e` — repaired 2026-09-12

The full gate exposed two contracts that the focused Reports review did not
exercise. Neither was waived:

- Home already rendered its repaired Program selector at 340px / 320px, but
  `e2e-home-breakdown-visual-repair` still required the compact prototype's
  180–280px / 170–220px widths. The harness now uses the canonical
  `St. Joseph Mavericks` name, asserts the production bounds, and fails on
  actual text clipping as well as overlap.
- Breakdown's 1920 three-column composition reserved up to 340px for the play
  rail and 500px for the deck, leaving a 1075.8×605.1 picture against the
  approved 1150×645 budget. The utility columns are now bounded at 280–300px
  and 440–460px so the primary film surface clears its existing budget. At
  1440, the 400px deck remains fixed; its top command row is a four-track grid
  instead of a 441px flex row, removing the 41px internal overflow without
  hiding controls or shrinking type.

An independent non-builder review of `7afa94d..44adcc6` **failed the pre-gate
checkpoint**. The range's own verification list named six green suites; it did
not run the surfaces it had changed. At `44adcc6` four Reports harnesses were
red, two of them against hash-protected approved design evidence:

| Harness | At `44adcc6` | Repaired |
|---|---|---|
| `e2e-reports-overview` | 101/7 | 109/0 |
| `e2e-reports-offense-realdata` | 28/3 | 31/0 |
| `e2e-reports-defense-realdata` | 46/4 | 58/0 |
| `e2e-reports-self-scout` | 109/1 | 110/0 |
| `e2e-reports-season` | 97/1 | 98/0 |

What was wrong, and what was done:

1. **The global palette invalidated Overview's approved rasters.** Production
   painted `20,24,28` where the approved capture has `16,24,34`, at all four
   registered viewports. New canonical evidence is
   `design-comps/reports-overview-2026-09-11/canonical`; the 2026-08 captures are
   retained untouched and named in the manifest as `supersededArtifact`.
   Palette and type only — the composition is unchanged.
2. **Two approved 14px module titles were shrunk to 12.5px** inside a
   readability pass, because `.gi-reports .gi-overview-module>header strong` tied
   with `.gi-ss-module` / `.gi-season-module` on specificity and won on source
   order. Both surface rules now carry their board class.
3. **Containment regressed.** `Top 5 Tendencies` engaged an internal scroller at
   both widths at season scope — the defect closed in `c4b1ada` — and eight
   Offense tables engaged horizontal scrollers at 1280. Row pitch re-derived to
   52px; the Offense band's cell padding pays for the type raise.
4. **Defense clipped and escaped.** `Away from Strength` was cut at 1440 and
   1280; the twelfth Down & distance row escaped its module; the full-season
   board overran the 1280 viewport by 5px. The label now wraps inside its own
   fixed 32px row, and `.gi-def-situations` carries its measured height (332px,
   322px at 1280) instead of a slack value.
5. **A charted look printed `0 snaps`.** See the Defense cohort contract below.
6. **Disabled route labels measured 2.2:1**; the Program selector clipped
   `St. Joseph Mavericks` on Home at both widths. Both repaired and both now
   asserted.

No installer, version bump, tag, push, publication, full gate, or coach-data
write occurred in this repair. `1.12.0-80` remains a historical installed
visual-scope pass and is not an accepted release. Later beta packages contain
the descendant source; current installed status is recorded at the top.

## The Defense cohort contract — charted versus measured

`StatsEngine.defenseDashboard`'s `summarize` returns both cohorts, named:

- **`charted`** — every defensive snap in the cohort. This is the displayed
  `Snaps` count, the frequency ranking key, and every call and blitz percentage.
  `n` is its alias, because `n` is what every consumer already reads.
- **`measured`** — the run/pass-classified subset. This is the denominator for
  total, rush and pass yards, yards per play, and explosives.

With `measured === 0` every production field is `null` and renders the board's
dash. A charted look with nothing measured shows its real charted count and no
production values — never `0`. The first repair collapsed the displayed count
onto `measured`, which is how a `Trade` motion charted once with no play type
printed `0 snaps` on Week 3, and how the same artifact pushed it to the bottom of
a frequency ranking. The board and its HTML export both state the reconciliation
compactly: `40 charted · 37 with play type`. The byte-identical `classified`
alias is deleted.

## Coach direction, 2026-09-11 — finish the neutral palette

The app still read blue after the pass that was meant to neutralise it. The
reason is that the pass was half done: `--gi-2` through `--gi-8` and `--gi-11`
moved to graphite, while `--gi-1` (the app background, +9 blue), `--gi-film`
(+6) and the **entire broadcast surface family** kept their cool values —
`--gi-bd-panel` +11, `--gi-bd-control` +15, `--gi-bd-control-active` +19,
`--gi-bd-line` +22, `--gi-bd-muted` +24, `--gi-bd-bone` and `--gi-bd-draw` +27.
Every Reports board paints with that family, so the boards were the bluest
surfaces in the app.

All twenty-one near-neutral surface and ink steps are now true grey, each value
computed to hold its predecessor's relative luminance so no contrast ratio in
the app moved. Semantic hues are untouched: gold, cyan, line-of-scrimmage blue,
turnover red, health green, warning orange, the categorical chart set, and the
deliberately blue-tinted `--gi-info-*` / `--gi-accent-*` selection surfaces.

## Found by the coach at the board, 2026-09-11 — chart row registration

Two tables sharing one band did not share one grid. In Opponent Offense the
formation matrix needs two-line column labels, so its header measured 36px
against the play-type table's 28px and its body started 8px low; a wrapping look
(`Shotgun + Empty + Bunch + Trips + Unbalanced`) then grew its own row to 33px,
and the drift reached 13px by the last row. Both tables now share a 36px column
row and a 27px data row, and `e2e-reports-defense-realdata` asserts that
side-by-side modules in a band share one column-row height and one first data
row, on all six games at both widths. Containment saw none of this: nothing
clipped, nothing overflowed, nothing scrolled.

## Found by the coach at the board, 2026-09-11 — shared Reports chrome

The repair above passed 58 assertions on Defense and still shipped a band the
coach rejected on sight. Containment was measured; composition was not.

1. **The linescore band wrapped at 1280.** Score 680 + story + a 370px identity
   floor is ~1380px of demand in an 1154px bar, so the identity strip dropped to
   its own full-width row and `grid-auto-flow:column` spread Base front, Base
   coverage and Blitz rate across the entire screen, aligned to nothing above
   them. Blocks are sized to content now and the floor that forced the wrap is
   gone.
2. **The score's name track was `1fr`** and absorbed every spare pixel, leaving
   ~300px of dead space between the team name and its own Q1. Capped at 240px.
3. **Six right edges down one column** — 1262, 1280, 1266, 1248, 1247, 1235 —
   and four left edges. The Reports chrome shares the route frame's 32px inset
   now, measured on content edges rather than border boxes.
4. **The KPI rail contradicted the board underneath it.** The rail printed
   `3.3 Yards per play allowed · 132 yds, 40 snaps` above a board reading 3.4
   over 127 yards and `40 charted · 37 with play type`. `_defenseScorebug` ran
   its own `defensivePerformance` maths, and the yardage was never measured at
   all: `Math.round(ypp * total)` synthesized it from a rate times a count, under
   a comment claiming nothing there was computed. It reads
   `defenseDashboard` — the tab's only football-value owner — and blitz rate
   divides by charted Blitz plus charted No Blitz rather than every snap.

**Still not aligned, deliberately, and needing a decision.** The shell top bar
ends at 1262 and the context bar runs flush to 1280, against the Reports column's
1248. Unifying them is a shell-wide composition change affecting Home, Study and
Plan, which is beyond the scope of a review repair. The context bar's cells are
edge-to-edge by design; the top bar's 18px inset is not.

## Deferred, measured, not hidden

1. **Legacy sub-floor type on Reports boards — PARTIALLY CLOSED.**
   Defense, Special Teams, Players, Self-Scout, Season and Matchup now meet the
   12.5px floor. Measured on the canonical season at 1440 and 1280:

   | Board | Minimum | Below 12.5px |
   |---|---|---|
   | Self-Scout | 12.5px | 0 / 77 |
   | Season | 12.5px | 0 / 138 |
   | Players | 12.5px | 0 / 237 |
   | Special Teams | 12.5px | 0 / 160 |
   | Matchup | 12.5px | 0 / 156 |

   **Measured on the canonical season** by
   `tools/e2e-reports-typefloor-realdata.mjs`, which exists because the first
   attempt measured this in the wrong place: every board's composition harness
   runs a SYNTHETIC fixture, and `CLAUDE.md` is explicit that synthetic data
   cannot establish Reports visual parity. The first pass also recorded Special
   Teams as 11px from its own QA fixture; the canonical figure is 9.5px, the
   furthest of the five from the floor. Each board's harness now mirrors its
   canonical number as a same-fixture regression guard and says so in the
   comment rather than claiming canonical provenance it does not have.

   Before this, those harnesses asserted an obsolete 9.5px floor and stayed
   green while the binding rule said 12.5 — a green suite meaning "not worse",
   read as "meets the standard".

   The remaining measured debt is Overview's approved broadcast micro-labels
   and Offense's scoped narrow-width exception.

2. **The Offense narrow-width exception — SCOPED 2026-09-12, band still open.**
   Eight five-column modules share a 379px band half at 1280 and measure
   387-418px of content at the floor, so at that width their cells keep 12px
   body. (Their 11.5px column labels reached the floor in the 2026-09-24
   module-system pass, S97-1.) The approved board forbids both an internal
   scroller and a resize.

   The exception was scoped to `.gi-offense-board .gi-overview-module th, td` —
   every module on the board — which put **876** of 997 elements below the floor
   at 1280 against 118 at 1440, while the documentation claimed eight tables.
   The eight modules now carry an explicit `gi-off-narrow-fit` class and the
   rule is scoped to it: 323 at 1280, and the census pins the exception's whole
   contribution as `11.5|TH: 40` and `12|TD: 165`. **Recomposing the band so
   the exception can be deleted is still open.**

3. **Down & distance still leaves 6px** at the foot of its module after the
   height was re-derived from the rendered board. Visible dead space is closed;
   the residual is within one row's rounding.
>
> This file indexes unresolved coach-observed defects and investigations. Detail
> may live in a linked audit, but an item is not closed until this index and the
> owning current-state document are updated together. Product roadmap work that
> is not a defect remains in `GRIDIRON-IQ-PLAN-V2.md`.

## Reports

1. **OLL live-data audit - REPAIRED, awaiting Codex re-review and a Charlie
   Gate.** All ten items plus one found in passing are closed in code across
   the commits beginning `d3c71e6`, with three further repairs from Codex's
   2026-09-10 review. Detail, reconciliation and mutation evidence are in
   `docs/REPORTS-OLL-LIVE-AUDIT-2026-09-10.md`; the production decision record
   is `design-comps/reports-oll-repairs-2026-09-10/RATIONALE.md`. No surface
   advanced past `REJECTED`. Installed `1.12.0-94` smoke is in progress, but
   it has not accepted this work as production state.

   **Codex review round 1, repaired 2026-09-10:**
   - Player return production now uses the team report's measured-return
     cohort for the COUNT as well as the yardage. `Ret` printed every return
     event beside measured yards and a measured average.
   - Defensive `Yds / play` divides by the classified run/pass cohort its own
     numerator comes from. The approved `2.9` was a value in a comp fixture,
     not an approved formula; the honest figure is `3.2`.
   - The Self-Scout HTML export prints the board's schema: `_ddPretty` labels,
     a dash in every measured cell of a held row, and a defensive KPI band
     that leads with Yards Allowed / Play and ends with Stop Rate.

   **Two questions still carried to the coach, deliberately not decided:**
   - Deleting Stop Rate outright from the Self-Scout KPI band or Overview's
     Defense & discipline module would change an approved row count. It was
     moved out of the headline position instead; both compositions keep six
     slots.
   - Four OLL plays (ids 63, 67, 76, 90 - two sacks, a pass, a run) carry no
     `unit` tag, and punt distance, hang time and return yardage are
     essentially uncharted across the season. Both are charting-workflow gaps
     raised for the coach; nothing was inferred or written back.

   **Codex review follow-up, repaired 2026-09-10:** Defensive production
   `Snaps`, Total Yds and Yds / play now use one CLASSIFIED cohort and reconcile
   arithmetically. The complete sample remains available as explicitly named
   `charted` data for call-frequency calculations and sample disclosure.
2. **Renamed HTML report does not open correctly after save.** Reproduced by the
   coach for both Defense Report and Game Report. Keeping the default filename
   works; changing it during the native save flow does not. Treat this as a
   shared export-delivery defect until investigation proves otherwise. Preserve
   the chosen path and extension; do not guess the cause from the symptom.
3. **REPAIRED IN SOURCE 2026-09-22 — HTML report presentation.** Game, season,
   Defense, Special Teams, Self-Scout and player reports now share the white,
   ruled Reports print system. Game and season exports carry the Offense visual
   panels; the Special Teams Units ledger stays inside its chapter. Canonical
   2025 JV browser/PDF verification passed, but installed visual smoke remains.
   The renamed-file save/open defect in item 2 is separate and still open.
4. **SUPERSEDED 2026-09-17 — Defense Situational Results vertical rhythm.** The
   four-tab board is replaced by Revision 2, whose module height is explicit
   arithmetic: 96px of chrome plus rows at the module's pitch. Fixed-schema
   modules are exactly their rows; variable modules take a standard
   220/300/380/460 height and fill unused capacity with `-` rows. One remainder
   is the approved comp's own behavior and is carried into the Charlie Gate: a
   64px-pitch module whose rows do not fill its standard height (Down & Distance
   on a single game) keeps a sub-row gap, because no whole row fits there.
5. **Reports > Defense Revision 2 — IMPLEMENTED 2026-09-17; installed smoke
   PASSED and APPROVED 2026-09-21 (`1.12.0-91`).** The `1.12.0-90` smoke passed
   its arithmetic and returned a REVISE on cohort presentation only, which is
   repaired and closed (item 13). The manifest still reads
   `productionStatus: REJECTED`: the approval is the installed smoke, not a
   registry state. Built to the coach-approved Revision 2 comp. Metric
   definitions are recorded in `docs/REPORTS-CONTRACTS.md` > Defense. Intentional differences from the
   standalone comp: the Reports shell's header and scorebug carry report
   identity, so the comp's title block and footer line are not rendered; Export
   Report is retained; the production condensed face is wider than the comp's,
   so KPI values step to 30px below 1420px and the strip reflows below 1240px;
   half-module metric headers lose 4px of side padding so `Touchdowns Allowed`
   never clips at 1280; `JUMP TO` and the sort glyph are 12.5px, not 11px; and
   the comp generator's conditional `Coverage family` module is not rendered,
   because the approved rendering and module list omit it. Rows still open their
   exact film cohort. **Installed-only:** Chromium cannot certify the module
   scrollbars' classic WebView2 rendering.
6. **Defense Revision 2 review findings — REPAIRED 2026-09-17** (review of
   `13b3579..b260d06`). High-leverage field position read the offense's end of
   the field (canonical red zone 4 / 0, now 8 / 6); our return touchdowns scored
   opponent possessions and drive outcomes; defensive touchdowns counted as 1st
   downs allowed and, in the dashboard, as 3rd/4th downs allowed; Run TFL admitted
   negative-yardage passes; an unmeasured structure row printed `0` explosives.
   All five have failing-first, mutation-verified regressions.
7. **Defensive field-zone ownership and export drive attribution — REPAIRED
   2026-09-19.** The two same-root-cause defects left open by item 6.
   **Field position now names an owner.** `StatsEngine.fieldPerspective()` reads
   the unit the coach CHARTED — `__chartedUnit` on a rep Matchup relabels for its
   cross-read, otherwise `tags.unit` — and `_defensiveFieldZone()` mirrors
   `_fieldZone`'s six bands for a defensive snap: our 1-5 is `Goal line`, 6-20
   `Red zone`, 21-40 `Opp 40–20`, 41-60 `Midfield`, 61-89 `Own 11–39`, 90-100
   `Backed up`. `fieldZoneOf()` / `_inRedZone()` / `_onGoalLine()` are the shared
   consumers; the offense-oriented `_fieldZone` is untouched, and so is every
   offensive report, cut filter and Study dimension that reads it. Repaired
   consumers: the dashboard `zones` behind the board's Field zone module AND the
   export, `defensivePerformance`'s Red Zone / Goal Line situations and its
   red-zone touchdown rate (the owner Matchup's Red Zone row shares), the Matchup
   situation predicate, the Opponent Scout `_opponentDefenseJoin` situations, and
   the board's high-leverage rows, which now read the same bands.
   **Canonical 2025 JV, old → new:** Field zone `Backed Up` 11 → 2, `Open Field`
   110 → 94, `Opp 40–20` 43 → 43 (a different 43 snaps), `Red Zone` 5 → 26,
   `Goal Line` not rendered → 4; `defensivePerformance` Red Zone 5 → 30, Goal
   Line absent → 4, red-zone touchdown rate 0% → 75%. Zones now reconcile with
   High-leverage field position exactly.
   **One drive owner.** `StatsEngine.opponentDriveList()` holds the
   scoring-side attribution and both the board and the export consume it, so the
   printed report can no longer read our pick-six as an opponent touchdown.
   Canonical export outcomes are unchanged (that season has no defensive score).
   **Three fixtures were corrected, not the assertions:** the Matchup, Reports
   route and Defense fixtures charted defensive red-zone reps at `opp 8` / `opp
   10`, which is the opponent backed up on its own 8, and now chart them on our
   own 8 / 10. The canonical season is the evidence for the direction: every
   touchdown it allowed sits within 23 yards of our goal line.
8. **Defensive success and touchdowns allowed ignored the scoring side —
   REPAIRED 2026-09-19.** Found in review of `5041fd8..32c7000`: with the
   field-zone cohort corrected, `defensivePerformance()` still counted every
   touchdown as opponent production and measured stops with the
   ball-carrier-framed `isSuccessfulPlay`, so a red-zone pick-six from our own 10
   reported `Red Zone TD Rate 100%`, one touchdown allowed and a 0% stop rate,
   contaminating Matchup and every other consumer. `StatsEngine.
   isOpponentSuccess()` and `isTouchdownAllowed()` are the two shared rules;
   `defensiveCohortMetrics` passes the predicate into the `AnalyticsMetrics` seam
   through the new `options.deps` override rather than keeping a second stop-rate
   formula. The same sweep repaired `_defensiveStats` (front, coverage and blitz
   stop counts, and coverage completions — a pick-six is an interception against
   that coverage, never a completion allowed), `_defenseCallRows` (stops and
   touchdowns) and Self-Scout's defensive stops, phase stop rates and touchdowns
   allowed. The offense-framed predicate, `compute()` output and every canonical
   value are unchanged, because that season has no defensive score. The
   regression is a synthetic red-zone pick-six checked against the same snap
   scored by the opponent.
9. **Matchup cross-read reversed touchdown ownership — REPAIRED 2026-09-19.**
   Found in review of `32c7000..42239ea`: the defense-framed touchdown rule was
   fixed to `them`, which is correct for our native defensive snaps but wrong
   when Matchup relabels our offensive snap as the opponent's defense. The
   relabel now remains anchored to `__chartedUnit:'offense'`: our touchdown is
   their touchdown allowed and their stop rate is 0%. The focused Matchup
   regression uses a normal offense-origin touchdown with no explicit
   `scoreFor`, proving the default ownership survives the projection.
10. **Reports > Special Teams limited acceptance pass — REPAIRED 2026-09-19;
    provisional `1.12.0-90` pass CONFIRMED by the approved `1.12.0-91` installed
    smoke, 2026-09-21.** The manifest still reads `productionStatus: REJECTED`.
    - **Punt block touchdown can now be authored.** `ST_OUTCOMES.puntReturn`
      gained `Blocked` and the unit reads `Punt Return / Block`; the stored value
      stays `puntReturn` and no `puntBlock` exists. Possession and Score are the
      existing controls. Proven end to end: the authored state round-trips through
      save/reopen/normalize as `unit:'puntReturn'`, `outcome.status:'blocked'`,
      `outcome.recoveredBy:'subject'`, `outcome.score:'touchdown'`, scores six for
      us and zero for the opponent through `computeScoreboard`, and reports one
      punt blocked, one punt-return touchdown, zero punts blocked against us and
      the exact composite reference. Opponent recovery scores for the opponent;
      an unrecovered block is attributed to nobody.
    - **Audit result — the disclosure was over-counting on a mixed cohort.** The
      coach's `8 snaps / 4 assigned / 4 unassigned` screen is the
      `2026-varsity-demo` Week 2 game: 5 snaps carry structured events and 3 are
      legacy `stType` only. Three unassigned are correct (§8: a legacy snap is
      never inferred into a unit). The fourth was an extra point stored on the
      field-goal unit, which the Tries module reports and which
      `isFieldGoalAttempt` deliberately excludes from field goals; a legacy
      `stType:'XP'` snap has the same shape. `specialTeamsUnassigned` now compares
      film-reference sets instead of summing counts, and `specialTeams.tries`
      counts the field-goal-shaped extra points. That game now reads 8 / 6 / 2,
      every demo game reconciles to exactly its legacy-only snaps, and the
      canonical 2025 JV season is unchanged at 74 / 73 / 1 (the legacy `Fake`).
    - **The try remainder is named.** `charted − attempts` was labelled `No
      scoring team tagged`, which is wrong for a charted `Defending a Try` — the
      opponent is exactly who scored it. The rows are `Tries charted`,
      `Opponent tries` and, only when non-zero, `No scoring team tagged`.
    - **Nothing else in the audit moved.** Kickoff/punt `tdAllowed` (scoringTeam
      `opponent`), return `td` (scoringTeam `subject`), return `attempts`
      (charted attempt with finite yardage, never a fair catch or touchback),
      blocks, field-goal cohorts, tries and defensive try returns, points and
      scoring side, and every `refs` cohort were traced to their canonical owners
      and are correct. Measured zero, a measured fraction (`1/2`) and `No data`
      remain distinct on the board.
    - **Visual pass:** board migrated to the 12.5px floor (98 sub-floor elements
      → 0 on the canonical season), literal labels, badge nouns, compact empty
      modules, aligned paired edges, no clipping or page overflow at 1440 and
      1280. No module, metric, mobile or global-style change.
    - **Two Codex findings on the pass itself, repaired 2026-09-20.**
      **P1:** a blocked-punt touchdown with Possession left BLANK still awarded
      six points to us — `scoringTeam` fell through to the receiving-unit default,
      because the deck offers Possession on a loose ball without requiring it. A
      touchdown on `blocked`, `muffed` or `recovered` with no charted
      `recoveredBy` is now attributed to neither team and its points land in the
      scoreboard's `unattributed` total; a `returned`, `downed` or `fairCatch`
      kick keeps its unit default, which a mutation proves by reddening an
      existing assertion when the guard is widened.
      **P3:** the new persistence proof was a `testAsync` without `await`, so it
      ran after the harness printed its summary and its PASS sat outside the
      count. Awaited; the harness reports 28.
    - **Remaining, installed-only:** a short smoke of our punt, an opponent punt
      return, the blocked punt-return touchdown, a field-goal block, Try and
      Defending a Try. Chromium verifies the layout and the browser-backed
      behavior; it cannot certify WebView2 rendering.

12. **Reports > Players Revision 2 — CODE CHECKPOINT ACCEPTED 2026-09-20, and
    its PRESENTATION passed the approved `1.12.0-91` installed smoke on
    2026-09-21.** Both lanes are closed: the code checkpoint by review, the
    composition by the coach on the installed build. **Formal registry
    acceptance is a separate step and remains `REJECTED`** — the manifest is
    unchanged. Codex reviewed
    `5471cb9..790e192` with NO findings, which closes the review lane for this
    range; every finding it had raised on Revision 2 and on the repair of
    Revision 2 is repaired and covered. The engine, view-model and export
    behavior is accepted: the export game summaries, missing-value sorting and
    the negative `Long` with its film alignment are settled and are not to be
    re-litigated. **That is a code acceptance, not a presentation one** — Players
    production status is unchanged and reaches nothing past `REJECTED` until a
    populated Charlie Gate at the release widths and an installed smoke, per the
    approval-state rule. An expansion of the approved
    board, not a replacement: the six role tables, their stat definitions,
    scopes, sorting, absence semantics and column geometry are unchanged.
    - **Checkpoint evidence, 2026-09-20.** `e2e-reports-players` 223/223,
      `e2e-native-reports` 99/99, and `e2e-parity` 2/2 with BOTH cohorts green —
      `synthetic-edge` (3 scopes, 189 drilldowns) and the local
      `mavericks-6game` (7 scopes, 625 drilldowns), the cohort Codex's isolated
      checkout could not run because that golden holds the coach's own data and
      is gitignored. The committed synthetic golden is byte-identical, so the
      credit-index rewrite still reproduces every established definition and the
      only intentional difference anywhere is the audited negative-`Long`
      correction recorded below. Supporting suites re-run green at the same
      checkpoint: `e2e-reports-special-teams` 57/57,
      `e2e-reports-self-scout` 110/110, `e2e-reports-season` 99/99,
      `e2e-reports-defense-board` 55/55, `e2e-reports-overview` 109/109.
    - **One owner.** `_playerCredits` files every attributed play into a bucket
      per player/role/statistic; `_individualStats` derives its long-standing
      output from that index rather than counting a second time, with
      `e2e-parity` proving the rewrite byte-identical. Every displayed figure and
      every film cohort are the same play list.
    - **Added:** a per-statistic film action (identity now opens player detail),
      an in-tab player detail view with per-role sections, chronological
      game-by-game rows that sum back to the totals above them, a situational
      breakdown over existing canonical dimensions, a Selected-games scope, a
      per-table column menu and a player-specific export.
    - **Migrated to the 12.5px floor** (46 sub-floor elements → 0 canonically),
      and role bands are content-height, so a short table pads no dead space.
    - **Deliberately absent, and why:** participation/snap counts, targets,
      pressures, missed tackles, blocking and coverage performance, route or
      assignment data, and any combined rating. The charting model records none
      of them, and inventing them would be the exact fabrication this board
      exists to avoid. Expanded charting is the prerequisite, not a report change.
    - **Known limitation:** grade averages exist only where a grade was charted,
      which on the canonical season is a minority of plays; `No grade charted` is
      stated rather than implied.
    - **Four Codex findings on Revision 2 itself, repaired 2026-09-20.**
      **P1:** the situational split and the game rows reduced every role to one
      "volume" stat, so a punt-only kicking group (zero field-goal attempts) and
      a takeaway-only defender (zero tackles) vanished from the split, and their
      game cells read `0 FG, 40 punt yds` and `0 tkl`. Each role now declares its
      own `measures`, a group renders when the role was credited in it, and a
      game cell states the measures that happened or its play count.
      **P2:** the export chose its own situational dimension per role, so it
      could not match the screen. Role and dimension are controller state and the
      export prints the active one.
      **P2:** `Long` opened every measured play in its bucket; it now opens the
      play (or plays tying it) that produced the value, through `longRefs`.
      **P2:** the situational table was a plain table; it is now the shared
      sortable `DataTable`.
      The regressions that missed these are rewritten: the per-statistic
      expectation is derived from the plays rather than from the view model's own
      bucket map, which is what let the `Long` mapping validate itself.
    - **Three further Codex findings on that repair, repaired 2026-09-20.**
      **P1:** the HTML export still built each game-by-game summary from the
      first two entries of a fixed stat list, so a punt-only kicker printed
      `0 field goal attempts, 0 field goals made` and a takeaway-only defender
      `0 tackles, 0 solo` — the same defect the screen had just had repaired.
      The role-aware summary is now ONE owner both surfaces read,
      `StatsEngine.playerRoleSummary` (with `playerRoleMeasures`); a measured
      zero and an uncredited role (`No data`) stay distinct.
      **P2:** the situational table flattened every measure to its displayed
      value, so an UNMEASURED cell entered the sort data as `0` and sorted ahead
      of a real negative value in both directions, and Grade sorted its
      `No data` string as `0` for the same reason. Unmeasured measures stay
      `null` and Grade sorts through `gradeSort`, which `DataTable` already
      groups last in both directions. Every situational numeric measure is
      covered, not only Grade.
      **P2:** `_individualStats` clamped `Long` with `Math.max(0, …)`, so a back
      whose only carry lost three yards displayed `Long 0` while the film link
      opened the -3 play — the number and its clip described different plays.
      Long is the true longest, negative included, on rushing, receiving and
      returns; with nothing measured it stays `0`, and `longRefs` is unchanged so
      tied longest plays stay linked together. The audited parity correction is
      six paths in the local six-game golden: three all-negative rushing cohorts
      now report -6, -1 and -3 instead of 0, each twice because the scout report
      carries the same stats object. Nothing else moved, and the committed
      synthetic golden is byte-identical.
      Each repair is covered by a behavioral regression asserting actual row
      order or the exported string, and each was mutation-verified red against
      the pre-fix behaviour. `e2e-reports-players` is 223 assertions.
      **All seven findings are CLOSED**, re-reviewed by Codex over
      `5471cb9..790e192` with nothing outstanding.
    - **1.12.0-90 installed smoke: REVISE for composition (2026-09-20).** The
      coach rejected the two-at-a-time band pairing: it put Receiving beside
      Tackles, interleaving offense and defense, and left a one-row module as
      dead space beside a six-row one. **Repaired, and still unaccepted.** Roles
      group by phase — Offense (Rushing, Passing, Receiving), Defense (Tackles),
      Special Teams (Return Game, Kicking / Punting) — contiguous and in that
      order, two phase columns at desktop width, one below 1420px. Each role
      declares a row capacity (3, 6 or 9, sized from the real canonical range);
      Passing is 3. Unused slots are the shared held dash row; a cohort past
      capacity scrolls inside the body with neither header moving. The header
      staying put needed a real repair: `.gi-table-wrap` was a second scroll
      container, so the sticky `th` resolved against a box that never scrolls.
      Sorting, scope and phase filters move no module height. Everything the
      smoke required preserved — scopes, filters, sorting, column menus, detail,
      per-statistic film, situational splits, export, keyboard, absence
      semantics. The St. Peter values reconcile (passing yards 34 = receiving
      yards 34; six rushers over 24 carries); **no statistic was redefined.**
      Evidence: `artifacts/players-revise-90/` — 1920/1440/1280 × current-game
      All roles, Offense, Defense, Special Teams, plus full-season All roles. No
      page overflow, no clipped cell, no console error at any width.
    - **CLOSED 2026-09-21 — the `1.12.0-91` installed smoke PASSED and the coach
      approved it.** The phase grouping, the row capacities with Passing at three
      slots, the held dash rows and the internal scrolling with fixed headers are
      accepted as built on the installed build, which is the only place WebView2
      rendering can be certified. **This closes the composition verdict, not the
      registry:** `design-approvals/reports/players/manifest.json` still reads
      `productionStatus: REJECTED`, and moving it is a separate change with its
      own hash-verified evidence. The Home status mismatch that blocked the
      registry audit is closed under Deferred Beta Maintenance 3.

13. **Reports > Defense — `1.12.0-90` arithmetic PASSED, cohort presentation
    REVISE, repaired 2026-09-20. CLOSED 2026-09-21: the `1.12.0-91` installed
    smoke PASSED and the coach approved the cohort labels.** The manifest still
    reads `productionStatus: REJECTED`; the approval is the installed smoke, not
    a registry state.
    - **The reported disagreement was not a calculation defect.** Reconciled
      play by play on the canonical St. Peter game: the final was 41-0, and all
      15 checkable down-and-distance transitions reconcile with the tagged
      yardage (`distance(next) == distance(prev) - yardage(prev)`), which is an
      independent witness the yardage never feeds. The 13 charted run snaps sum
      to exactly 0 and the two pass snaps are an interception and an incomplete,
      so Total 0 / Rush 0 / Pass 0 / 0.0 per play is the measured truth over the
      15 classified snaps. **Do not "repair" these totals.**
    - **Four valid cohorts, none of them named — that was the defect.** KPI strip
      15 classified snaps; Production by play type the same subset through
      multi-select rows that overlap (18 tags over 15 snaps, so the rows are not
      additive); Performance by Play Direction 14 snaps, because one snap carries
      no direction and takes +1 yard with it, which is the entire gap between its
      -1 and the board's 0; Opponent possessions every charted snap with penalty
      movement included. Each now states its cohort in counts inside the existing
      header; every count is computed, and a hardcoded canonical value reds two
      harnesses.
    - **The installed game has 19 defensive snaps; the Documents mirror has 20.**
      The mirror still carries penalty snap id 4 (`Penalty + Gain`, +5, no
      run/pass), which is exactly why the coach read 19 snaps, a -8 first drive
      and a -10 possession total where the mirror shows 20, -3 and -5. Neither
      copy was restored, deleted or modified. **This is a recorded data-history
      question, not a report-code defect**, and the classified cohort is
      identical either way, so no displayed total depends on it.

14. **Reports > Special Teams — provisional `1.12.0-90` pass REMAINS VALID
    (2026-09-20).** The Defense repair touched no shared logic: the changes are
    `native-defense-board.jsx` presentation, `native-report-tabs.jsx` Players
    composition and two stylesheets. No engine file changed, so Special Teams
    yardage, scoring-side attribution, field perspective, scope, possession
    ownership and structured/legacy classification are untouched by
    construction. `e2e-reports-special-teams` is 57/57 unchanged, and
    `e2e-parity` is 2/2 with no golden edited. **CONFIRMED 2026-09-21 by the
    `1.12.0-91` installed smoke**, which the coach approved; the surface was
    unchanged between the two packages, so the provisional pass is now an
    installed one. Its manifest is likewise untouched.

## Breakdown

**REPAIRED IN SOURCE 2026-09-24, INSTALLED SMOKE PENDING — charting-library
editing failed in the installed app (`Rhino` under Fronts).** Root cause,
reproduced on a copy of the installed WebView2 profile, not assumed: the
origin's localStorage was full — 5,242,879 of Chromium's 5,242,880 characters —
and 99% of it was version history (`ffa_versions_<season>::<game>`, whole-game
snapshots, up to 20 a game). Every small settings write in the app was failing;
`TagLibrary._write` swallowed the `QuotaExceededError`, so the readback failed
and the coach saw a generic message. Storage was the cause, but the library was
never the consumer.

- **Version history left localStorage** (coach direction, 2026-09-24:
  "I've been trying to get away from the legacy structure"). `VersionManager`
  now stores through the storage backend: the desktop catalog's `versions`
  table on disk (`CatalogPersistence.saveVersion`/`importVersions`, each a
  durable write that rolls the in-memory catalog back when the db write fails)
  and IndexedDB `ffa_fs` v3 `versions` in a browser. Capped at 20 a game,
  automatic saves evicted first, as before.
- **Migration is all-or-nothing per game.** `VersionManager.migrateLegacy()`
  imports each scoped key, verifies every version reads back identical, and only
  then removes the key; a failed import leaves the key untouched for the next
  launch. Unscoped pre-2026 keys (`ffa_versions_default`) carry no game identity
  and are left in place, unread. On the copied installed profile: 8 keys / 90
  versions moved, 0 failed, localStorage 5.24 MB → 0.75 MB, `Rhino` saved.
- **Write failures are diagnosable.** `TagLibrary` returns `false` from a failed
  write, records `lastError` (`name`, `message`, `key`) and logs it; the coach
  sees `Could not save that choice: the app settings storage is full.` for a
  quota failure and the error name otherwise. A legacy library key is removed
  only after its migrated copy is written.
- The dead `#versionList` renderer inside `VersionManager` is deleted; Settings >
  Recovery is the only presentation owner, and its save/restore now await the
  backend.

- **REPAIRED 2026-09-24 (Codex review of `9c4371b`) — concurrent catalog
  writes lost data.** Every `CatalogPersistence` mutation exports the whole
  shared db. With the first of two concurrent `saveVersion` writes held, both
  reported success and the reopened catalog held only the first: the earlier
  write's bytes, which predate the second change, landed last. A failed first
  write's rollback had the same hole — its pre-change snapshot also predated
  the second save. `_exclusive()` now queues every mutation (season save and
  delete, touch, backups, versions, legacy import) through its snapshot,
  change, disk write and rollback.
- **REPAIRED 2026-09-24 (same review) — restore broke its safety promise.**
  `VersionManager.restore()` says the current game is backed up first, but it
  replaced the game even when that backup returned `null`. It now stops, says
  `Version restore stopped: the current game could not be backed up first.`
  and changes nothing.

Evidence: `e2e-tag-library-storage` (25: a genuinely full store, the named
failure, migration including a failed-then-retried import, all six library
groups in the live deck, persistence across reload, team scoping, charted
values untouched, new snapshots off localStorage, restore with a failed and a
durable backup; mutation-verified), `e2e-catalog-versions` (17: rollback,
all-or-nothing import, and four reordered-completion races — two saves, a
failing first save, an import beside a save, a season save beside a version
save — each checked after reopen; all four red with the queue disabled),
`e2e-catalog-persistence` (73), `e2e-integrity`, `e2e-native-recovery`.
**Browser tests cannot certify the installed catalog write or the WebView2
migration** — see the installed checks below.

**REPAIRED IN SOURCE 2026-09-24, INSTALLED SMOKE PENDING — desktop charting
deck wasted vertical space.** Group body 8/12 → 6/10 px, field gap 4 → 3, chip
gap 4 → 3, chip side padding 8 → 6, group header 38 → 34. Chip text, weight
and the 30px chip floor are unchanged; coarse pointers keep 44px. Measured on
the canonical 2025 JV OL Lakes game with the default groups open: offense deck
1843 → 1750 px at 1920 and 1911 → 1816 at 1440/1280; defense 1510 → 1364 and
1544 → 1463. **Play Call and Play Type fold independently**: each label is a
disclosure button (`aria-expanded`/`aria-controls`), folded it states the
selection (`26 Blast`, `Run Inside + RPO`, or `None`) and keeps Edit library,
and the choice persists as a view preference (`ffa_chart_collapsed_fields`).
**Every Edit library now sits beside its label**, the play call's included;
that one had been left at the module edge. **Deck width was not reclaimed**:
narrowing it 20px buys the 1920 picture ~1.7% width and costs 34–66px of deck
scroll, and at 1440 the picture is height-bound so it gains nothing.
Evidence: `e2e-native-tagging` (84, fold section mutation-verified),
`e2e-home-breakdown-visual-repair` (147), `e2e-breakdown-viewport` (167).

**REPAIRED IN SOURCE 2026-09-24, INSTALLED SMOKE PENDING — Film Room is video
first.** The editable table docks below the film by default (film 62% of the
height, limits 40–75%); `Beside` puts it right of the film (film 45% of the
width, limits 30–65%). A focusable separator resizes by pointer or keyboard
(arrows 2%, Page Up/Down 10%, Home/End to the limits, double-click resets the
split), each dock keeps its own split, `Reset` restores the default and clears
the stored layout (`ffa_film_room_layout`), and an unreadable or out-of-range
stored value falls back or clamps. Below 1001px the existing stacked mobile
layout is unchanged and carries no splitter. The table's row windowing
re-measures when the split moves. The toolbar's `Table` caption hides below
1366px because the extra group left Film focus 32px short at 1280, and the
toolbar gaps tighten to 8px there: `9c4371b` fit only while the save label read
`Saved`, and `Saving...` pushed Film focus 2px over its container. The table's
filter chips now wrap instead of scrolling sideways. Evidence:
`e2e-film-room-layout` (39: both docks, drag and keyboard limits, persistence
across reload, reset, a failed layout write, selection, inline edit and scroll
to play 300 beside the film, Film focus, 1280/1920/900 including the pending
save label; mutation-verified), and
`e2e-breakdown-lifecycle` section 6 repointed from the superseded side-by-side
default to both docks.

**IMPLEMENTED IN SOURCE 2026-09-24, INSTALLED SMOKE PENDING — the play sheet and
the shown-plays summary (coach direction: fill the two cards' spare height
with information).** The play card lists every chartable field for the
selected play in groups — Situation, the unit's own look first, the look it
faced, Play & result (or Special teams), Players with roster names, Grades
when any were charted, Custom (every custom field and the custom tags),
Penalty and Notes when present — read through the chyron's own projection and
result wording, with `Not charted` where the unit charts a field nobody
filled. A Special Teams play lists its structured event in full: kick kind,
direction, distance, hang time, operation time and landing spot; return
attempted, yards and end spot; recovered by; onside and fake (Yes/No, which
the model stores as flags); the try's attempt, bad snap, block and turnover;
scored by, through `SpecialTeamsModel.scoringTeam`; and the event's own
credited kicker, punter, returner, blocker and recoverer. The
table-below controls card adds **Shown plays**: the filtered plays measured by
the Reports owners, never a third formula — offense through `compute()`
(Success Rate, yards per play, explosives), defense through the Defense
board's dashboard (yards per play allowed) and `defensiveCohortMetrics()`'s
stop rate, touchdowns and turnovers through the canonical predicates; a mix of
units states its counts only. It is not shown in the table-beside or phone
bars, where it would push the table down. `StatsEngine.playSetSummary()` owns
it; `NativeFilmRoomScreen` adds it to every published snapshot. On all six
canonical games a whole-game filter reads exactly what its board reads (OL
Lakes defense 3.4 over 37 run/pass snaps). **Known difference on the same
screen:** the table's `Yds` column header averages only plays with charted
yardage (`avg 4.4` for that game), while the summary follows the board (3.4).
**Resolved the same day (coach direction):** the header now reads the
summary's yards per play for a single-unit set (`3.4 / play`) and shows no
average for a mix of units or a set under five plays, because unlike units do
not average.

**Review of `97b2f37` / `5cd5313`, REPAIRED:** (1) a Special Teams touchdown
the editor saved in `specialTeams.outcome.score` with no Touchdown result tag
counted zero; the summary now reads the structured event and splits it into
touchdowns for, against, and side not charted (a legacy snap, or a loose ball
nobody recovered). (2) The play sheet omitted grades, custom fields and tags
and most Special Teams detail; all are listed above. (3) The one-program
column claim was written before the program's sets; a failed write left the
old list claimed and the next launch fell back to presets. The claim now
follows a successful save. Evidence: `e2e-film-room-sheet` (27) and
`e2e-film-room-columns` (21); every one of the four repairs has a check that
fails with the defect restored.

**Full gate at `28fb35a`, 2026-09-24: 129/130; the one red is fixed test-only
in `8c2ea1a` (25/25 on its own). **The full gate was then rerun at `c1f6cc1`
(source identical to `8c2ea1a`): 130/130, 0 skipped, 0 failed.** `e2e-tag-library-storage` failed three checks because its
full-store fixture left up to a few hundred characters free and adding a
choice grows the stored library by a few. The per-program column key shifted
how much the page had written before the fill, the add fit, and nothing
failed. No product change: the fixture now closes the slack with
one-character keys and asserts that a one-character write fails too;
mutation-verified by swallowing the `QuotaExceededError` in `TagLibrary`.

**Break Down rebuild, steps 1-4 in source (2026-09-24); full gate 130/130 at
`b7e2f32`; packaged in `1.12.0-99` and `1.12.0-102` (`SMOKE-1.12.0-102.md`),
installed smoke pending.**
One tree replaces the five mounted roots and the HTML string; no visual
change (20 screenshots byte-identical to `c1f6cc1`). Record:
`docs/BREAKDOWN-REBUILD-PLAN.md` > Progress.

**Packaged with the rebuild in `1.12.0-99`.** The coach first ruled out an
installer for this batch because Break Down was being rebuilt; the Film Room
work, the version-history move and the library save fix ship in the rebuild's
installer instead (`SMOKE-1.12.0-102.md`). None of it is
installed or approved until that smoke.

**Codex review of `c1cce33`, both REPAIRED (`5cd5313`).** The old global
column list now seeds All plays for one program only (claim marker
`ffa_film_room_cols_claimed_by`; the old key is untouched); another program
starts from the preset. The Columns sheet passes the set it shows, a write
naming another unit's set is refused, and the sheet closes when the unit
filter changes under it. `e2e-film-room-columns` 20, each new check red on the
unfixed code.

**IMPLEMENTED IN SOURCE 2026-09-24, INSTALLED SMOKE PENDING — Film Room column
sets per unit (coach direction).** The table keeps four column sets —
Offense, Defense, Special Teams and All plays — and the table's unit FILTER
(not the charting deck's unit) picks the one on screen. The Columns panel is
titled for the set it edits (`Defense columns`), lists that unit's fields
first, and changes only that set. In All plays a unit-specific column is
blank, and opens no editor by click or Enter, on a row of another unit (Front
on an offensive snap) — never a dash. Sets are saved per program under
`ffa_film_room_columns_<team>`; `PlayGrid.cols` is the active set, so every
existing reader and writer is unchanged. A program's first sets come from the
coach's existing single list (All plays, through the E3b upgrade rule) and the
unit presets; the old `ffa_film_room_cols` key is left untouched. Sets saved
before a program id existed (first run) are claimed once by the first program
that reads them. Reordering and a complete field list (drive, field position,
players, grades, custom fields, special-teams detail) are deferred by the
coach. Evidence: `e2e-film-room-columns` (17, red when the scope is forced to
All plays), `e2e-film-room` (174; two storage reads repointed to the per-unit
store, and the E4-2 Coverage Family editor exercised on a defensive play).

**Film Room composition APPROVED BY THE COACH ON SCREEN, 2026-09-24 (browser
captures at 1280 and 1920; installed smoke pending).** With the table below,
the top band is the film, then a full-height **play card**, then the table's
**controls card** (title, count, Columns, Watch, saved filters, the filters in
four groups), and the table starts at its column headers — 6 rows at 1280×800
instead of 3. The film centers in what remains, so its spare width is even
margin. The play card shows every detail with no `More detail` disclosure, and
both cards scroll inside themselves when their content runs long. With the
table beside the film the controls are a bar over the table; on a phone they
are a bar above it. Structure: the controls are their own root in their own
composition host (`data-breakdown-film-controls-host`), mounted by
`NativeFilmRoomScreen.mount(host, controlsHost)` from the same controller and
snapshot; the grid places them, and the table section holds only the table.
The play card is the theater's last child, outside the player, so Film focus
and fullscreen never carry it. The retired in-table header rules (and the S6-6b
eyebrow and segmented-run blocks that styled it) are deleted. Evidence:
`e2e-film-room-layout` (47: placement per dock, full-height adjacency, no
disclosure, the gold rule, long notes scrolling inside a fixed card, Film
focus; the new assertions red when the card is not full height or not a
scroller); selectors and mounts repointed without changing assertions in
`e2e-film-room`, `e2e-native-film-room` (subscriptions are now two, one per
root), `e2e-breakdown-lifecycle` and `e2e-projform-durability`.

**Legacy Breakdown code removed 2026-09-24.** Deleted, each with no producer in
production: `PlayTagger`'s lookups of `#tagChips`, `#customTagInput`,
`#btnNewDrive`, `#tagResultRare` and `#tagResultMore` with every branch that read
them, and `_renderCustomTags` (the native deck renders custom tags; the XSS
harness now checks that sink); the `.tag-chip` / `.chip-remove` and
`.version-*` rules in `styles.css`; `.ws-classic-outlet` in
`workspace-shell.css`; `.gi-diagram-actions` and `.gi-penalty-situation` in
`native-tagging.css`. The Break Down route target is `breakdown-workspace`, not
`classic-workspace`.

**Finished the same day (second pass).** `PlayTagger.tagForm` (always null) is
gone with everything that only served it: `_updateFormEnabled()` and its 15
call sites in the tagger, `HistoryManager`, `PlaylistManager` and
`StorageManager` plus nine test tools, `_disabledHintText()`, the `.tag-group-head` binding, the
disabled-form click hint and `applyUnitMode()` — whose whole body was tag-form
DOM — with its five callers. `unitField`, `defaultUnit` and `_saveField` were
kept then as the live unit state; **superseded 2026-09-25 by legacy excision
Pass 2 step 1 (`7aa0184`):** `unitField` and `_saveField` are deleted, the
charting writes go through `PlayTagger.setTagValue` / `toggleTagValue` /
`setPlayUnit`, and only `defaultUnit` (the unit a new play takes) remains. The
native deck derives its disabled state from the current play. In `App`, `_bindScoutMode` keeps only its live `defaultUnit`
update, and `_bindTagNav` is deleted: the tagger's toast hookup is its own
line, and every element it bound (`#btnTagPrev`, `#btnTagSaveNext`,
`#btnTagSkip`, `#yardsMinus`, `#yardsPlus`, `#tagYardage`, `#tagDistance`,
`#autoDDToggle`, `#carrySchemeToggle`) has no producer — the native deck owns
previous, save-and-next, skip, Enter-to-advance and both toggles. The `Y`
shortcut no longer falls back to `#tagYardage`.

**`workspace-shell.css`: 67 of 73 suspected branches removed, 6 retained.** The
ownership model flagged 73; it does not read class names inside a template
interpolation (`${selected ? ' selected' : ''}`) or carried as data
(`cls: 'ws-fact-green'` rendered through `class={film.cls}`), so each flag was
checked against the source. Removed: the retired Team Hub and old Home
workspace layout (`.ws-team-hub`, `.ws-section-head`, `.ws-empty`,
`.ws-link-strong`, `.ws-season-rail`, `.ws-metric*`, `.ws-workspace-grid`,
`.ws-games-col`, `.ws-detail*`, `.ws-game-list`, `.ws-game-name`,
`.ws-game-cell*`, `.ws-game-arrow`, `.ws-continue-*`, `.ws-mini-*`,
`.ws-opponent`, `.ws-badge`, `.ws-score*`, `.ws-dash`, `.ws-facts`, `.ws-fact`,
`.ws-phase`, `.ws-phase-head`) and the reader-only
`#statsDashboard .stats-overlay` offsets. Retained with their live producer:
`.ws-game-row.selected` (`native-home.jsx` game row), `.ws-fact-green`,
`.ws-fact-warn`, `.ws-fact-muted` (`home-screen.js` film fact, rendered by
`native-home.jsx`), `.ws-bar.cyan i` and `.ws-bar.gold i` (`native-home.jsx`
phase bars). The file is not added to the enforced audit, because those six
would read as dead to the model. Checked: `e2e-workspace-shell` (100), the
five Home harnesses, `e2e-native-team-hub` (20), `e2e-responsive-containment`
(105), and populated Home captures at 1440 and 390.

**Retained, and why.** `#videoContainer` and the media-foundation rules are the
live media owner. `SeasonStore.adoptLegacyRoster`, `tag-projection.js`, legacy
`stType` reads and `ffa_versions_default` are saved-data compatibility.
`_loadTagForm` / `_clearTagForm` were retained then; **deleted 2026-09-25 in
legacy excision Pass 2 step 1 (`7aa0184`)** with the field state they loaded.
The deck, grid and reports read the play itself.

**Installed checks still required (not certifiable in Chromium):** on the
installed build, first launch migrates version history into the catalog (the
`versions` table holds the games' save points; Settings > Recovery lists them;
restoring one works, and leaves a `Backup before restore` save point) and
localStorage drops well below its quota; Edit library
adds `Rhino` to Fronts and a value to each of the other five groups, each
appears in the live deck at once and after closing and reopening the app;
Film Room opens with the table below, `Beside`, drag, `Reset` and a chosen
layout survive a restart; the deck folds survive a restart; playback and inline
editing work in both docks with real film.

1. **Delete play - REPAIRED 2026-09-10.** `PlayTagger.deleteCurrentPlay()` read
   `id` before assigning it. It now captures `currentPlayId` before any delete
   logic. `e2e-native-breakdown-theater` exercises the rendered button through
   confirmation and proves that exactly the selected play is removed and the
   adjacent play becomes current.
2. **Reconnect notice obscures lower tagging controls.** Confirmed against a
   read-only OLL browser copy at both 1440 and 1280. The persistent notice sits
   over lower tagging content and actions. Open visual repair; do not alter its
   migration guidance until its lifecycle and owning component are identified.
3. **Breakdown reports contradictory film state.** On the same OLL render, the
   shell says `No film selected` while a persistent notice says 89 clips need
   reconnection. Open state-ownership investigation; the canonical OLL data has
   83 unique plays, 83 unique charted clip ids, and 89 playlist entries.
4. **Play-card result labels truncate.** The 1440 OLL play strip clips visible
   results including `Gain + Touchdown` and `Penalty + Loss`. Full text remains
   in accessible labels/tooltips, but the visible presentation is incomplete.
   Open visual repair against the accepted Breakdown composition.
5. **B1-2 - REPAIRED 2026-09-15 - Drive-number grouping conflated the two
   possession teams.** A drive identity is now possession side plus drive number,
   owned once in `football-rules.js` (`drivePossessionSide`,
   `groupPlaysByDrive`, `driveLabel`) and consumed by Breakdown's play strip,
   the theater chyron and Study's `drive` dimension, so the two surfaces cannot
   disagree. Labels are `Our Drive 1` / `Opponent Drive 1` on a program season,
   and `Offense Drive 1` / `Defense Drive 1` on a scout season and in Study,
   which aggregates across seasons and so cannot claim a perspective. Possession
   is read from the charted unit ONLY: a special-teams snap joins its surrounding
   drive of the same number instead of splitting it, and a blank legacy unit keeps
   the plain `Drive N` rather than being relabeled on no evidence. Reconstructed
   report possessions use separate logic and are unchanged. Evidence:
   `e2e-data-correctness-batch1` (58) with alternating possessions where both
   teams hold Drives 1 and 2, mutation-verified by regrouping on the raw tag.
6. **DEFERRED / INTERMITTENT - Rapid or repeated timeline scrubbing can falsely
   mark linked film as unavailable.** In installed WebView2, moving the playback slider aggressively
   can replace still-visible linked film with the permanent `Film unavailable`
   recovery card and the shell's red `Film missing` state. Closing and reopening
   the app loads the same D-drive source normally, so this is not evidence that
   the file or folder link is actually missing. The current scrubber sends every
   `input` directly to `video.currentTime`, while `VideoController` promotes any
   resulting media `error` event to the terminal missing-film presentation.
   Capture the native `MediaError` code/message and seek event sequence, coalesce
   rapid seek requests, and distinguish a transient seek/decoder failure from a
   source that fails a fresh reload. Preserve the selected play, clip and desired
   seek position during bounded recovery; show missing/re-link guidance only when
   the linked source genuinely cannot be reopened. Add event-sequence regression
   coverage plus an installed WebView2 scrub stress smoke, because Chromium's
   media pipeline may not reproduce the native failure. The coach could not
   reproduce it in the `1.12.0-86` smoke and explicitly tabled investigation.
   Keep the evidence; do not schedule it ahead of the current functional and
   small Breakdown presentation batch unless frequency or impact rises.
7. **B1-3 - REPAIRED 2026-09-15 - The redundant `Field Goal / XP` authoring
   path could award an opponent XP to us.** The unit is presented as `Field Goal`
   in the charting deck and the Film Room grid, and nothing can author an extra
   point through it: the `Attempt` selector is deleted, the screen's `attempt`
   action key is gone, and the charting service's `stAttempt` writer is deleted
   rather than narrowed. A new field-goal event is seeded
   `attemptType: 'fieldGoal'` from one owner,
   `SpecialTeamsModel.defaultAttemptType(unit)`, so no click is required and the
   seed is not treated as charted detail by the change-unit warning. `Try` and
   `Defending a Try` remain the only XP/two-point authoring paths and credit the
   attempting and defending sides respectively. Read and reporting compatibility
   is untouched: `SpecialTeamsModel.normalize` still accepts
   `unit: 'fieldGoal', attemptType: 'extraPoint'`, such a record still scores one
   point, and no historical data was rewritten. The retired `Scored by Us/Them`
   control was not restored. Evidence: `e2e-data-correctness-batch1` (58),
   mutation-verified in both halves (the service writer and the UI selector).
8. **PL-1 - REPAIRED 2026-09-15 - The play-library Add controls were dead while a
   settings sheet was open.** `SettingsScreen.open()` began
   `if (this.handle) return this.handle.result;` - it returned the live sheet's
   promise and DISCARDED the requested tab, chart group and typed play-call name.
   The sheet is non-modal, so reaching the charting deck while it is up is
   ordinary use, and in that state both the Play Type field's `Edit library` and
   the play-call field's `Add to Playbook` did nothing and said nothing.
   Reproduced deterministically before the repair: the panel stayed on `film`, the
   Add control never rendered, and the typed name was dropped.

   `open()` now RETARGETS the live sheet - same sheet, new destination - resolving
   the tab through the same roster guard (extracted as `_resolveTab`) and
   notifying subscribers. `NativeSettingsContent` subscribes and moves;
   `chartGroup` and `initialPlayCall` are consumed by child `useState`
   INITIALIZERS, so a retarget nonce is part of the child key, which remounts that
   panel with the new initial target. The canonical owners are untouched:
   `TagLibrary` still owns the vocabulary and `Playbook` the calls, with no second
   store, cache or persistence path, and no coach season data is written.

   Evidence: `e2e-play-library` (42) - rendered Add, immediate charting-choice
   refresh with no reload, blank refused in words, exact and case-only duplicates
   refused, a built-in unaddable as a custom, persistence through a real page
   reload, one canonical store per team, and the playbook side. Mutation-verified
   five ways, including restoring the swallow.

9. **PL-2 - REPAIRED 2026-09-15 - `Option` is a built-in offensive play.** Owned
   once by `TagLibrary.DEFINITIONS.playType` and reached by every consumer through
   that owner, so it needs no custom entry. It is distinct from `RPO` by football
   meaning - an option is a post-snap ball-carrier decision, an RPO a pass-or-run
   read - and behaves consistently with it: AMBIGUOUS for run/pass classification
   (`PlayTagger.runPassForPlayType`), and NOT a member of
   `EXCLUSIVE_GROUPS.playType`, so `Option + Run Outside` charts the call and the
   realized look together. A new DEFAULT is filtered out of a stored `enabled`
   array, so `TagLibrary.VERSION` goes to 4 with the same visibility-only
   migration the version-2 formation additions used; no stored tag is touched.
   Two screens carried their own copy of the vocabulary and now read the owner -
   `native-tagging`'s OPTIONS fallback, and `native-settings`' cut-up FILTERS,
   which had ALREADY drifted (missing `Trick Play`). Study reads it through the
   `playType` dimension and Reports through the tendencies breakdown, both
   dynamically.

   **Stated limitation, not an oversight.** `Option` is NOT added to
   `StatsEngine.OVERVIEW_PLAY_TYPES` (Overview's approved fixed SIX) or to the
   seven play-type categories the Defense dashboard reports (Revision 2 renders
   only the charted ones of those seven). Both are pinned
   static schemas with approved row counts; adding a row there is a design
   decision for the coach, not an implementation one, and `e2e-reports-overview`
   pins "the FIXED six play types" against approved evidence. The Offense
   play-type table takes Option as a ranked candidate, where `fitRows` caps the
   board so no fixed count moves.

10. **BD-VP - CLOSED FOR BETA USE 2026-09-16. The installed `1.12.0-87` smoke DISPROVED the
    first repair.** Breakdown still showed floating scrollbar arrow controls and a
    horizontal track in the charting deck, and the deck spacing had regressed and
    read cramped despite unused width. The installed screenshots are the
    authority. The Chromium harness was green throughout - which is the finding,
    not an excuse.

    **Root cause of the arrows.** The first repair set `scrollbar-width:thin` in
    the same rules as `::-webkit-scrollbar-button{display:none}` - and Chromium
    IGNORES every `::-webkit-scrollbar-*` rule for an element that sets
    `scrollbar-width` or `scrollbar-color`. The arrow suppression was therefore
    dead from the moment it was written, on every runtime that draws classic
    scrollbars. Both properties are now removed from all four Breakdown CSS
    owners (`native-breakdown-route.css`, `native-tagging.css`,
    `native-breakdown-theater.css`, `native-film-room.css`), so the webkit rules
    are the sole authority; directional `:start:decrement` / `:end:increment`
    selectors are added for both axes, and the harness pins the absence.

    **`scrollbar-gutter:stable` was the other half of the mistake, and it is
    gone.** It reserves the ENVIRONMENT's scrollbar width - 0 under overlay
    scrollbars, ~17px under classic ones - so it produced a DIFFERENT content box
    in the two runtimes, which is the "fits in the harness, overflows on the
    installed build" mechanism itself. Reserving it was reasoning about the
    symptom. The deck now reserves nothing and every row must REFLOW instead:
    `.gi-tag-situation-row .gi-tag-chips` was pinned `flex-wrap:nowrap`, the one
    chip row in the deck with no escape if its text measured wider in another
    engine, and an earlier pass had only narrowed its track behind a comment
    admitting the symptom could not be reproduced here. Narrowing moves a
    threshold; wrapping removes the failure mode. The `min-width:180px` floor on
    deck selects is also gone for the same reason.

    **The spacing regression is real, measured, and fixed in one pass.** Section
    headers rendered content 3px from the form edge while their own bodies sat at
    15px; every row had a 12px right inset against that 15px left, because the
    group's 3px accent border ate the left with nothing balancing the right; an
    action row nested in a body added a further 8px for 20px; and the collapse
    caret floated wherever the section title happened to end, its right inset
    ranging 20px to 142px. All four are corrected to ONE 12px inset with the
    caret right-aligned (9px of padding plus the 3px border = 12px), and removing
    the reserved gutter returned 10px of content width (450 -> 460px).

    **WHAT CHROMIUM CANNOT DO - stated because it decides what this evidence is
    worth.** Headless Chromium renders overlay scrollbars unconditionally: a probe
    with `::-webkit-scrollbar{width:40px}` measures a **0px** gutter, and
    `--disable-features=OverlayScrollbar,FluentOverlayScrollbar,FluentScrollbar`
    does not change it. **No Chromium harness can render, measure, or fail on the
    arrows or the horizontal track.** The assertions added here are therefore
    deliberately environment-INDEPENDENT - they pin the CONDITIONS that produce
    the chrome (no `scrollbar-width`/`scrollbar-color` in any Breakdown owner, no
    reserved gutter, no unwrappable chip row, one shared inset nothing crosses on
    either side, the deck scrolling vertically only with nothing past its content
    box), never the chrome itself. Anything claiming otherwise is a false green.

    Evidence: `e2e-breakdown-viewport` (167) across 1920x1080, ~1420x1000,
    1440x900 and 1280x720 in populated Offense, Defense and Special Teams
    charting, with screenshots in `artifacts/breakdown-viewport/` as
    IMPLEMENTATION EVIDENCE ONLY - no design approval. Mutation-verified by
    restoring the original padding, the `nowrap` chip row and `scrollbar-width`
    (4 red, reporting the measured `{"distinct":[3,15,23]}`). The canonical gate
    is 119/119 on this baseline, and the repair is packaged as `1.12.0-88`
    (`SMOKE-1.12.0-88.md`) for the re-smoke. **The coach approved that installed
    smoke on 2026-09-16, closing this item for beta use.** Installed acceptance,
    not Chromium, closes the arrow, horizontal-track and spacing checkpoint.
    No additional viewport/DPI matrix is claimed.

11. **BD-CTX - REPAIRED 2026-09-15 - The Program, Season and Game context
    selectors blended into their surrounding bar.** Measured, not estimated: the
    bar painted `#0c0c0c` and the three selectors `#181818` - a 1.25:1 ratio, so
    they read as labels rather than controls - and the open state used
    `--gi-accent-surface` `#17283d`, the rejected blue-gray. One neutral graphite
    control surface now lives in the shell's own `:root` token block
    (`--ws-ctx-surface` / `-hover` / `-open` / `--ws-ctx-edge`) and is applied at
    the shared context-bar owner, so every route that renders the bar gets it
    rather than Breakdown alone. **The border draws the boundary**: `--gi-8`
    measures 4.1:1 against the bar, clearing the 3:1 a non-text control boundary
    needs. `--gi-7` measured 2.86 and missed, so the TOKEN moved rather than the
    threshold. Widths, typography, caret treatment and route hierarchy are
    unchanged; rest, hover, focus, open and disabled are each asserted, and the
    open state keeps the existing gold underline as its marker. Evidence:
    `e2e-breakdown-viewport` (151), mutation-verified by flattening the surface
    back onto the bar (4 red, including the cross-route check).

12. **The Home rail gives static utilities too much permanent height and starts
    truncating season navigation with only three seasons.** Program Seasons is
    forced into a short internal scroll region while the lower roster, storage,
    setup, edit and program-management actions reserve a much larger block. The
    primary navigation should receive the rail's flexible vertical space; compact
    utility actions remain anchored below it without dictating an oversized
    allocation. Three ordinary seasons must render without an internal scrollbar
    at the observed installed height. Design for 8-10 seasons with year-group
    disclosure: keep the active/current year expanded, allow older years to
    collapse, preserve the selected season in view, and introduce scrolling only
    after the available navigation region is genuinely consumed. Program seasons
    and opponent scouts must remain distinct and reachable, with visible counts
    and keyboard-accessible disclosure controls. Add installed viewport coverage
    for 3, 8 and 10 seasons and verify that static actions neither crowd out nor
    overlap the season tree.

## Closed Visual Baseline

The shared typography, wider Breakdown columns, global route navigation,
context-selector widths, graphite chrome, and neutral secondary-copy repair
passed installed visual inspection in `1.12.0-80` on 2026-09-11. The binding
contract is `docs/VISUAL-SYSTEM-RULES.md`. This closes the prior small-type and
wide-column findings only; it does not close the open Reports composition or
Breakdown film-state defects above.

## Deferred Beta Maintenance

1. **Visual regression coverage is weaker than its release language.** Current
   Chromium harnesses prove behavior, minimum font sizes and containment, but
   they do not compare populated production screens with the approved captures
   or certify installed WebView2 rendering. Add mutation-verified visual
   baselines for representative real-data screens when the beta workflow can
   absorb the maintenance cost.
2. **Shared typography-token changes need explicit cross-surface review.** A
   token edit can alter every route while a focused harness remains green.
   Until broader visual automation exists, keep presentation repairs scoped to
   the owning route where possible and inspect affected surfaces before calling
   an installer visually accepted.
3. **CLOSED 2026-09-22 — Home manifest used an invalid production status.**
   `design-approvals/home/manifest.json` used
   `IMPLEMENTED_PENDING_REVIEW`, which is outside the registry's allowed
   statuses. The manifest now records `REJECTED`, the formal state already
   documented for Home after its partial `1.12.0-92` smoke and pending
   follow-up repairs. The coach's approval of Home's visual composition remains
   recorded in the manifest note and `SMOKE-1.12.0-92.md`; it does not imply
   formal production acceptance. The registry audit can now inspect all nine
   surfaces.

4. **Dead code outside Break Down — CLOSED.** The 2026-09-24 inventory (about
   40 names across the Reports views, `charts.js`, `stats-engine.js`, the video
   and canvas layers, `app.js`, `storage.js` and `js/report-visual-data.js`)
   was removed by legacy excision Pass 1 (2026-09-25); a re-check on 2026-09-27
   found none of those names in `js/`. The legacy readers named alongside it were
   deleted in Pass 2. Still used, not dead: `polarityOf`, `listMeasures`,
   `listBlocks`, `matchingRefs`. The full list is in this file's git history.
   **Found 2026-09-27:** old renderers whose host elements no longer exist were
   deleted: the roster list, quick pick, add form and import form
   (`roster-manager.js`), the per-play custom-field inputs (`custom-fields.js`)
   and the scoreboard reader's three legacy buttons (`scoreboard-ocr.js`).
   - **OCR-1 — PARKED as a future enhancement (coach, 2026-09-27).** The deck's
     Set region, Read and Auto OCR controls run, but the confirmation strip and
     status render into `#ocrPreview` / `#ocrStatus`, which no longer exist,
     so a read shows nothing and is never applied. The coach rarely has a clear
     scoreboard in frame (no dedicated scoreboard camera), so it is parked. Idle
     cost is negligible: one saved-region read and one listener at boot, no
     timers; Tesseract loads only on Read or Auto OCR (not persisted). Unproven
     on the installed build: Tesseract's blob-URL worker against the CSP (no
     `worker-src`, no `blob:` in `script-src`) and `getImageData` on
     asset-protocol video. The three deck controls remain a visible dead end.
   - **Custom-field manager — REBUILT 2026-09-27** on the overlay service
     (`native-custom-fields.jsx`, a modal sheet; `e2e-custom-fields` 14,
     mutation-verified): Save stores the fields and the deck shows them at once
     (the old dialog never refreshed the deck), Escape and Cancel write nothing,
     a nameless row is dropped, focus returns to the button. Codex review of
     `dc4328c` (P2): a failed write still replaced the fields in memory and
     announced success; the save now reads storage back before changing memory,
     and a failure keeps the sheet and draft open with an error and no toast
     (4 regression checks, red first; 18/18).
   - **Still hand-built:** the auto-detect Review dialog
     (`AutoDetectScreen.openReview`) and `PlayTagger._confirmDialog` /
     `_promptDialog` (`js/play-tagger.js:433`; Delete Play, Clear Tags, the
     Special Teams unit and try-attempt changes, templates). They work, but sit
     outside the overlay spec's focus and Escape rules. (Corrects the earlier
     note that the Review dialog was the only one left; found 2026-09-27 while
     wiring the Kick XP confirmation.)

   **Stale references found in passing (logged 2026-09-27; standing practice:
   any stale or dead reference met during a task is recorded here):**
   - `tools/e2e-film-room-sheet.mjs:49,53` seeds retired `stType` tags
     (`'Punt'`, `'Kickoff'`) on Special Teams plays in a live season — a state
     the app no longer produces. The assertions read the structured event, so it
     is inert; the fixture should drop the retired tags.
   - `tools/e2e-native-tagging.mjs:459` checks `window.app.ocr.auto`, which does
     not exist; the assertion passes only through its checkbox fallback.
   - `tools/p0-capability-inventory.mjs:80` comment names `e2e-season-tab`
     (deleted 2026-09-27); `tools/e2e-field-fixes.mjs:244` comment describes
     `RosterManager.roleInputs` (deleted 2026-09-27). Comments only.
   - `tools/e2e-css-ownership.mjs` audits only `css/styles.css` and
     `css/redesign-stats.css`; dead rules in the other stylesheets are not
     detected.
   - Logged 2026-09-28 (charting cutover): `js/stats-engine.js` still names the
     single-value Formation `formation` in report-row properties and
     still runs `splitFormations` (27 references) on it, which is inert now
     that a Family cannot hold "+"; `js/native-report-tabs.jsx` and
     `js/reports-view.js` read those row properties; `js/clip-analyzer.js:87`
     names the QB-alignment result `formation`; `js/html-report.js:32,543`
     still headline the Family table "Formation". Names only, no behavior.5. **Structural limits, recorded 2026-09-24 (planning inputs, not defects).**
   (a) Break Down was five mounted roots kept in step by events — rebuilt
   (`docs/BREAKDOWN-REBUILD-PLAN.md`). (b) Settings live in localStorage (87
   call sites): the 5 MB quota already failed once, settings do not travel with
   a season, and nothing can sync them; this blocks the V2-I mobile companion.
   (c) The browser target is why film plays through HTML `<video>` and the
   catalog is sql.js exported whole on every write; dropping it would allow
   native SQLite and native playback — a coach decision, not made. (d) Screens
   share live services through `window.app` (54 references) and `PlayTagger`
   events rather than one state store. (e) `stats-engine.js` is 6,786 lines;
   splitting it by area is possible with `e2e-parity` proving no change.

## Release Impact

- Installed `1.12.0-91` is **APPROVED FOR BETA USE** after the 2026-09-21 coach
  smoke, which closed both `1.12.0-90` REVISE verdicts — Reports > Players
  composition and Reports > Defense cohort presentation — and confirmed the
  Special Teams provisional pass. Canonical gate 120/120 at `df9d5f7`, bumped in
  `894576d`. It is unsigned, untagged, unpushed and unpublished, and it moves no
  manifest: beta smoke acceptance is not formal design approval or publication.
- Installed `1.12.0-92` Home visual composition was **APPROVED by the coach** on
  2026-09-22. Its partial installed smoke and unrun checks are recorded in
  `SMOKE-1.12.0-92.md`; the newly reported setup, typography and identity defects
  above remain open. This is not registry acceptance or whole-app sign-off.
- Installed `1.12.0-86` is **APPROVED FOR BETA USE** for FILM-01 after the
  2026-09-15 coach smoke. It also contains Repair Batch 1. The deferred visual
  findings inherited from `1.12.0-85` remain open.
- FILM-01 has focused proof at 45/45, a green 117-harness canonical gate on its
  code baseline, and the installed checks recorded above. The intermittent
  rapid-scrubbing report is separate, open, and deprioritized.
- Home and every Reports surface remain `REJECTED` in the formal design approval
  registry; beta smoke acceptance is not formal design approval or publication.
- **BD-VP is CLOSED FOR BETA USE** (item 10): the `1.12.0-87` installed smoke disproved the
  first repair while every Chromium check stayed green. The second repair removes
  `scrollbar-width` (which suppresses the arrow rules), removes the reserved
  scrollbar gutter (which built a per-runtime content box), lets every deck row
  reflow, and corrects the deck to one 12px inset. Focused proof is
  `e2e-breakdown-viewport` 167/167, mutation-verified. Its spacing half is proven
  here; the coach's approved `1.12.0-88` installed WebView2 smoke on 2026-09-16
  closes the rendered-chrome checkpoint. The later `1.12.0-91` installed smoke
  approved the bounded Reports changes recorded above.
- PL-1, PL-2 and BD-CTX from that batch stand as repaired: the dead custom-play
  Add route, canonical built-in `Option`, and shared context-selector contrast.
  Codex-reviewed over `56e75f1..6651195`, `e2e-play-library` 50/50, canonical
  gate 119/119, packaged as `1.12.0-87`. `Option`'s absence from Overview's
  approved fixed six and the Defense dashboard's seven play-type categories stays open as a coach
  decision about an approved schema, not an implementation gap.
- **Reports status:** Players composition and Defense cohort presentation passed
  the `1.12.0-91` installed smoke; Special Teams' provisional pass was confirmed.
  Overview's composition and Home's `1.12.0-92` visual layout are approved.
  Offense, Self-Scout, Season, Matchup, and the revised exports still need an
  installed verdict. The Home and Breakdown follow-up repairs need smoke in a
  newer package. These bounded decisions do not promote a manifest to formal
  production acceptance.
