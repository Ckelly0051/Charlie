# GridIron IQ — Architecture & Reference

> Formerly "Football Film Analyzer". The product is now branded **GridIron IQ**;
> the built bundle filename remains `football-film-analyzer.html` and the git
> branch remains `claude/football-film-analyzer-GRiCW` (renaming those would
> break the deploy/build path, so they're intentionally unchanged).

## What This Is

A browser-based football film analysis tool for coaches. Load game film, mark plays, tag them with formation/type/result/etc., and get stats & tendencies. Runs entirely in the browser — no server required for core functionality.

**Live URL**: https://ckelly0051.github.io/Charlie/
**Branch**: `claude/football-film-analyzer-GRiCW`

## Current Handoff / Changelog

Keep this section current after every meaningful storage, migration, or release
change. It is the quick context block for Claude/Codex before touching film
storage again.

### Current working state (2026-07-22, v1.12.0-8 linked-film blocker)

**Repair implementation is complete and ready for independent Claude review.**
No installer or release tag has been cut, and the existing managed C: copies
remain protected until the coach passes the installed D:-library smoke.

Implemented on the current repair commit:
- Film Storage now lives inside Team & Film Settings, which is reachable from
  Team Hub before opening a game. Root setup stays on an exact-path,
  `No video will be copied` confirmation screen.
- `Film Library Root` and `This Game's Folder` are separate. New game links
  store only `.` or a relative child path; outside-root and prefix-lookalike
  selections fail closed and cannot rewrite the root.
- Linking is a canonical transaction. It preserves all play/tag/clip data,
  waits for `SeasonStore.persist()` to report success, and restores the full
  prior season on rejection. Pending autosaves are cancelled at the boundary.
- A discovered rollback race was fixed: `_renderGamesPanel()` commits live
  state, so rollback reload now skips that side-effecting render; otherwise a
  cleared playlist could rewrite restored clip refs as missing.
- Every active game now shows its actual source and resolved path, with Change
  and OS-native Open Folder actions. Managed games identify the C: copy.
- Film Room now explicitly reclamps movable controls after its layout resize;
  this pre-existing defect was exposed by the full gate and fixed in the same
  reviewed candidate because it could strand controls outside the video.

Builder proof: `e2e-film-storage-setup` 23/23, `e2e-linked-film` 40/40,
`cargo check` green, and canonical gate **59/59** green on a fresh rebuild.
The non-builder must rerun and review these committed bytes before packaging.


**The installed v1.12.0-8 candidate FAILED the real linked-library smoke. Stop
testing and do not delete the existing managed C: copies.** The setup surface
exists, but it conflates the one-time library root with an individual game's
folder. In the observed smoke, the coach selected `D:\Football\Film` as the
library root and later selected `D:\Football\Film\St Peter 41-0` for Week 1.
The latter selection overwrote `ffa_film_library_root`; the active game's
canonical data still had no persisted `filmMode`/`filmDir`. Playback therefore
did not prove that the app was using the D: source and may still have come from
the managed C: copy or transient selection. The root picker also closed without
a durable, visible confirmation.

**Blocking repair batch - Codex builds; Claude independently reviews:**
1. **One settings home.** Team & Film Settings must be reachable from the Team
   Hub before a game is opened. Film Storage belongs inside it; remove the
   competing standalone Film Storage destination.
2. **Separate scopes in the model and language.** `Film Library Root` is a
   one-time app/team-level location such as `D:\Football\Film`. `This Game's
   Folder` is a game-level link such as `St Peter 41-0`. Linking/changing a game
   folder must never mutate the library root.
3. **Persist the actual game link.** A successful game-folder selection writes
   the canonical linked mode and game-folder reference through the season save
   path, preserving every play id, clip ref, tag, note, and current-play value.
   Reopen must resolve film from that linked D: folder without copying it to C:.
4. **Make source truth visible.** Root selection remains on a confirmation state
   showing the exact approved path and `No video will be copied`. Every linked
   game shows a `Linked` source badge and its resolved folder, with clear Change
   Folder/Open Folder actions. Managed games are labeled `Managed copy`.
5. **Fail closed.** Cancelled, denied, invalid, outside-root, or failed saves do
   not change either root or game metadata and never report success. A root
   change does not silently rewrite existing game links.
6. **Regression proof must reproduce the smoke exactly.** Select
   `D:\Football\Film`, link Week 1 to its `St Peter 41-0` child, assert the root
   remains unchanged, assert the game persists linked metadata, reopen, and
   assert playback resolution points to D: with zero managed import/copy calls.
   Also prove Team Hub access, visible confirmation, cancel/failure rollback,
   and byte-stable season/tag data outside the intended link fields.

**Release rule:** this is a storage-integrity blocker. Build and review the
repair as its own commit. Claude re-runs the focused tests and canonical gate on
the reviewed bytes. Then package an internal candidate for the coach's installed
D:-library smoke. No new release tag is cut until that smoke confirms the source
path, reopen behavior, tag preservation, and no-copy behavior.

**Separate cleanup in the same work cycle, never mixed into the storage commit:**
- Codex may replace duplicate HTML escapers with an explicitly imported neutral
  `escapeHtml()` utility in a second commit. Do not rely on `Charts` being a
  bundle-global: the modular `index.html` path must work. Preserve deliberate
  null-to-empty behavior, escape all `[&<>"']`, retain `Charts._esc` as a
  compatibility delegate until callers are audited, and add focused tests.
- Do **not** split `stats-engine.js` during this release. Splitting it is a
  maintainability refactor, not a runtime optimization, and its analytics and
  film-link blast radius is unjustified while storage smoke is blocked. Revisit
  only when a feature creates a concrete extraction seam, one seam per reviewed
  commit with parity and real-data gates.

**Published history:** source commit `e4bb438` and tag `v1.12.0-8` were pushed
before this installed failure was discovered. They are a failed baseline, not
evidence that linked storage is safe.

### Current working state (2026-07-20, E4-2 ACCEPTED)

**Read `GRIDIRON-IQ-RELEASE-GATE.md` before packaging.** Build an internal
candidate, run the installed real-film smoke, and publish only after it passes.

**E3b FINAL ACCEPTANCE at `5dce03c`.** The complete consumer-projection lane is
accepted. Study, Film Room, filters, CSV, call labels, Plan, cut-up titles, and
Breakdown captions use the canonical projected tag view where required while
edit/store paths remain deliberate. Film links retain exact composite refs, all
six projected Film Room columns equal registry sets, and their tendencies use
projected grouping with eligible denominators.

**E4-1 review findings (from `5edf101`) are FIXED and ACCEPTED** (see "E4-1
ACCEPTED at `1d545bb`" further below — this note is kept for the fix detail,
not as the current status). All three verified against source before fixing
(per protocol — never taken on report), each reproduced on the pre-fix code,
then mutation-verified after:

1. **Clearing a DERIVED sibling now strips the primary too.** `_saveField`
   already promoted a blank sibling FROM the primary on an explicit primary
   commit (forward case); it had no REVERSE case — committing the sibling
   field directly (including clearing it) never touched the primary, so
   `project()`'s precedence (explicit sibling > primary's embedded token) had
   nothing to override and the legacy token silently won again on the next
   read. Fix: `TagProjection.primaryForSibling(key)` + `stripSiblingToken
   (primaryKey, rawValue)` (new, tag-projection.js) — scoped to strip ONLY
   this pair's own token(s) from the primary's raw value, never touching any
   other token the primary may carry (e.g. Formation's still-deferred 'Empty').
   `_saveField` calls this reverse case whenever the committed key IS a
   registered sibling. Mutation-verified: disabling the reverse-strip block
   reproduces the exact bug (Shotgun reappears on re-visit).
2. **Save & Next now performs the promised projected save.** `_advancePlay`
   previously only flushed a focused input and navigated — an untouched
   legacy play stayed byte-identical forever, so it could never leave the
   planned Legacy Tags to Review list (§18 D-laneR's exit condition is exactly
   "the coach explicitly saves the projected play"). Fix: new
   `PlayTagger.commitProjectedLook()` applies the SAME promote-then-strip
   mechanic for BOTH registered pairs as one field-level commit, called from
   `_advancePlay` — **scoped to normal chronological advance only**, placed
   AFTER the cut-up-active early return (not Skip, and not filtered Study/Film
   Room cut-up navigation, per Codex's exact scoping — a curated review queue
   isn't the coach's "done with this play" moment the way ordinary charting
   is). A genuinely clean play is a true no-op: no mutation, no history entry.
   Mutation-verified twice: disabling the call reproduces the missed
   canonicalization; hoisting it before the cutup-active check reproduces
   canonicalizing during a filtered cut-up (the narrower scope Codex named).
3. **"New Drive" now writes ONLY Drive Number.** It called the bulk
   `_saveCurrentTags()` (deleted, now dead — was its only caller), which
   rewrote every displayed field from its current chip value on a click that
   only meant to bump the drive counter — a field-level-merge violation
   regardless of the promote guard it also carried. Fix: the handler now calls
   `_saveField('driveNumber')` directly, the same single-field commit every
   other field's own change listener already uses. Mutation-verified:
   reintroducing a bulk rewrite after the scoped write reproduces the
   unrelated-field churn.

`tools/e2e-tag-projform.mjs` grew from 22 to 30 assertions (new sections 7b,
9, 9b, renumbered 10; old section 9's "New Drive promotes" assertion was
INVERTED to "New Drive does NOT touch" since the fix changes the intended
behavior, not just closes a gap). Full gate **57/57 green**, zero regression.
Bundle rebuilt and verified.

**Codex re-review of `e0ab568` (at `1c7e9b1`): production fixes PASS
(independent runtime probing confirmed all four behaviors), three test-only
hardening items required before formal acceptance — ALL THREE NOW DONE:**
1. **Coverage/Coverage Family's DERIVED clear + revisit + undo/redo, the
   distinct single-value branch.** New section 7c: `stripSiblingToken` has a
   genuinely separate code path for `coverage` (whole-field-is-the-token) vs
   `formation` (filter-and-rejoin a multi-value string), and 7b only exercised
   the formation branch. Mutation-verified: disabling the coverage branch
   reproduces 3 failures in the new section (commit, redo, revisit-sticks).
2. **Save & Next's one-entry undo/redo contract**, on the exact legacy fixture.
   Section 9 now resets history around the legacy play's Save & Next, asserts
   `entries === 1`, then undoes (both raw pairs restored together) and redoes
   (both canonical pairs restored together). Mutation-verified: disabling
   `commitProjectedLook()` drops entries to 0 and breaks the redo assertion.
   (Note: a same-tick double-`_emit` mutation did NOT move the entries count —
   `HistoryManager._record` intentionally coalesces same-label edits within
   800ms, so the entries count alone can't distinguish "one clean commit" from
   "two commits that happened to coalesce"; the undo/redo pairing checks are
   the substantive proof and were confirmed sensitive to a real break.)
3. **New Drive's isolation check now catches ADDED keys, not just changed
   ones.** The old check only iterated `Object.keys(before)`, so a regression
   that adds a brand-new key present in neither the original fixture nor
   `driveNumber` would pass undetected. Now compares the UNION of keys on both
   sides. Mutation-verified: a mutation that stamps an unrelated new key
   (`strength`) onto the play is caught; reverted, the fixed code passes clean.

`tools/e2e-tag-projform.mjs` is now 38/38. Full gate rerun **57/57 green**.

**ACTIVE HANDOFF — E4-1 ACCEPTED at `1d545bb` (production repair `e0ab568`).** Original E4-1 build reviewed at `7f2e42c`; both
rounds of findings above are now fixed. Implements D-projform (§18/§20): the
PRIMARY tag form — not just Film Room's grid, done in E3b — now shows the
projected view and writes only on explicit commit. Under Center/Pistol/Shotgun
removed from `#tagFormation`, Man/Zone removed from `#tagCoverage`; new
`#tagQbAlignment`/`#tagCoverageFamily` chip groups added. `_loadTagForm` seeds
Formation/Coverage from the PROJECTED value (a correctness fix, not just
display honesty — see the play-tagger.js comment on why raw-seeding a legacy
multi-value Formation is a live data-corruption hazard with ChipField's actual
internals). `_saveField` carries the promote-on-explicit-commit guard Film
Room's grid editor already had (E3b-P1) in BOTH directions (primary→sibling
promote, and sibling→primary strip on a direct sibling commit — the reverse
case added in the fix round above), sharing one descriptor —
`TagProjection.PROJECTED_PAIRS`, moved from `PlayGrid` (kept there as a getter
alias, zero behavior change, confirmed via a full Film Room re-run before
touching anything else). "New Drive" now writes only `driveNumber` via
`_saveField` directly (`_saveCurrentTags` deleted — dead code, was its only
caller); Save & Next canonicalizes the current play's projected look via the
new `PlayTagger.commitProjectedLook()`. Found and fixed one pre-existing bug
along the way (`suggestion-engine.js` `_flash`/`_addSuggestionHint` assumed a
raw DOM element for a target that's always been a ChipField wrapper — the
actual suggestion worked, only the cosmetic flash crashed, since inception).

Deliberately NOT done this increment, flagged not silently skipped: 'Empty'
stays in Formation's chip list, 'Pistol' stays in Backfield's — same class of
value-belongs-to-a-different-dimension issue as the three moved, but adding a
THIRD sibling relationship to `formation` needs its own failing-first proof.
The raw-read audit was not extended to `play-tagger.js` — it would need to
classify several pre-existing, deliberately-raw call sites
(`copyFromPrevious`/`applyTemplate`) outside this increment's scope.

Builder verification: gate 57/57 (56 existing +
new `tools/e2e-tag-projform.mjs`, 22 assertions), Film Room 139/139 unchanged,
zero regression. Test-harness lesson recorded in the commit and worth restating
here: never hold a play object reference across a `page.evaluate()` boundary in
this style of test — something in the app rebuilds `tagger.plays` with fresh
objects between calls, orphaning a captured reference while `t.plays` holds a
live object with the same id. Always re-fetch via `t.getPlay(id)` inside the
same evaluate call that acts on it.

**Codex review findings from `5edf101` — ALL THREE FIXED, see the "fixes"
paragraph above this section for the exact repair + mutation-verification for
each.** Summary of what was found (kept for history):
1. Clearing a DERIVED sibling was not durable — the raw primary field kept the
   legacy token, so it silently re-derived on the next form load.
2. Save & Next never performed the projected save — an untouched legacy play
   stayed byte-identical, unable to ever leave the Legacy Tags to Review list.
3. New Drive violated the affected-field-only rule via the bulk
   `_saveCurrentTags()` path, silently canonicalizing both pairs on a click
   that only meant to bump the drive counter.

**Codex re-review of `e0ab568`: production fixes PASS; three test-only changes
remain before formal acceptance.** Independent built-bundle probing confirmed:
derived Coverage Family clear strips raw Coverage and survives revisit; undo and
redo restore both fields together; Save & Next canonicalizes both registered
pairs in exactly one history entry; New Drive changes only Drive Number.

Required permanent proof:
1. Add the Coverage/Coverage Family DERIVED clear/change + revisit + undo/redo
   case. The current new test covers only QB Alignment, while
   `stripSiblingToken()` has a distinct single-value Coverage branch.
2. On the legacy Save & Next fixture, assert exactly one history entry and prove
   undo restores both raw pairs while redo restores both canonical pairs.
3. Make the New Drive isolation assertion compare complete tag key/value state
   after removing only `driveNumber` from each side. The current
   `Object.keys(before).every(...)` cannot detect unrelated keys added by a
   regression.

These are test-proof findings, not production defects. Focused E4 harness is
30/30 and the independent adversarial probe passed every production behavior.
No full gate was rerun because the permanent regression proof is incomplete.

**All three test-hardening items are DONE** (see the summary + mutation notes
in the "fixes" section above). `tools/e2e-tag-projform.mjs` is 38/38; full gate
rerun 57/57 green, zero regression.

**FINAL CODEX ACCEPTANCE:** `1d545bb` closes all permanent-proof requests.
Independent canonical gate: **57/57 green** after a fresh rebuild; projection
form **38/38**. No production bundle drift in the test-only hardening round and
no remaining E4-1 finding.

**E4-2 BUILT, awaiting Codex review.** Implements the full scope from the E4-1
acceptance note: descriptor extension, Film Room editing for the four
`proj-readonly` dimensions, and the deferred Empty/Pistol vocabulary cleanup —
in that dependency order, since the vocabulary move needed the descriptor
extension to be safe.

1. **`TagProjection.PROJECTED_PAIRS` extended from one-sibling-per-primary to
   an ARRAY of sibling descriptors per primary**, since Formation alone embeds
   two legacy tokens (QB Alignment AND, now, Backfield's 'Empty'), and
   `backfield` needed to be BOTH a sibling (of Formation, for 'Empty') and a
   primary in its own right (for QB Alignment, since a legacy 'Pistol' can
   still live in backfield's raw string) at once:
   ```js
   formation: [{sibling:'qbAlignment',...}, {sibling:'backfield',...}],
   backfield: [{sibling:'qbAlignment',...}],
   coverage:  [{sibling:'coverageFamily',...}],
   ```
   `primaryForSibling` (singular) became `primariesForSibling` (plural — a
   sibling can now have more than one primary). `stripSiblingToken` is now
   scoped by BOTH primaryKey and siblingKey (a primary with two relationships
   must never cross-strip the other one's tokens — mutation-verified: forcing
   it to always use the first registered pair reproduces cross-contamination
   exactly). New `TagProjection.reconcileSiblings(play, key)` is the single
   promote-then-strip algorithm — handles the forward case (key is a primary:
   promote each blank sibling) and the reverse case (key is a sibling: strip
   its token from every primary that may embed it) in one call, so a key like
   `backfield` gets both directions applied atomically. `_saveField`,
   `commitProjectedLook`, and Film Room's `_applyEdit` all now call this ONE
   function instead of three separate copies of promote/strip logic.
2. **Film Room editing enabled for QB Alignment, Backfield, Strength, and
   Coverage Family** — all four flip from `type:'proj-readonly'` to a plain
   `type:'enum'` column with `src` pointing at their tag-form chip group
   (identical shape to every other editable column); `_options()`'s exclude
   filter now loops every registered pair for a column instead of assuming
   one. Dead `proj-readonly` branches removed from `_tendency`/`_cellHtml`/
   `_openEditor`'s guard (no column uses that type anymore).
3. **`Empty` moved out of Formation into Backfield** (which already had its
   own `Empty` chip — same real-world concept, wrong dimension) and **`Pistol`
   moved out of Backfield into QB Alignment** (same story, reversed) —
   `index.html` chip buttons + `TagLibrary.DEFINITIONS` both updated; no data
   migrated, read-time projection already handled both values correctly.

**One real bug found and fixed by the test process itself, not by the review:**
`_loadTagForm` seeded Backfield and Strength from RAW `play.tags.*`, never
updated when qbAlignment/coverageFamily got projected seeding in E4-1 — a
legacy play with `Empty` embedded in Formation showed Backfield as BLANK in
the tag form while Film Room's grid correctly showed `Empty`, a genuine
cross-surface divergence exactly of the kind this lane exists to prevent (only
surfaced once Backfield gained a real sibling relationship in E4-2; harmless
before that). Fixed by seeding both from the projected view like the other
four fields. Mutation-verified: reverting to the raw seed reproduces the
divergence exactly.

`tools/e2e-tag-projform.mjs` grew 38 → 51 (new sections 12-15: vocabulary
moved, Formation→Backfield promote+undo/redo, Backfield→QB Alignment
promote+undo/redo, derived-Backfield-clear-strips-Formation+revisit).
`tools/e2e-film-room.mjs` P1c extended to cover all three registered primaries
(added Backfield/QB Alignment); its former "proj-readonly stays disabled"
assertions are INVERTED to prove the opposite (editor genuinely opens, but
opening/canceling never writes) since that was the E3b-era contract, not the
E4-2 one; new section 8h proves view/select/cancel non-writing, one-step
undo/redo for the relationship-free Strength column, and cross-surface parity
(a grid edit is visible identically in the tag form). Full gate **57/57
green**, zero regression. Every new/changed guarantee mutation-verified
(disabling each fix/relationship reproduces its exact defect, confirmed, then
restored).

**CODEX REVIEW OF `becf6e3` — CHANGES REQUESTED.**

1. **High — valid legacy Pistol Empty data loses Backfield Empty.**
   `reconcileSiblings()` treats any nonblank raw sibling as explicit:
   `if (!String(play.tags[pair.sibling] || '').trim())`. But Backfield is now
   both a sibling and a primary, so raw `backfield:'Pistol'` is nonblank while
   its projected Backfield value is blank (Pistol belongs to QB Alignment).
   On a valid legacy Pistol Empty look such as
   `formation:'Ace + Empty', backfield:'Pistol'`, editing Formation or pressing
   Save & Next promotes QB Alignment=Pistol but fails to materialize
   Backfield=Empty before stripping Empty from Formation. The committed
   projected look changes from Pistol/Ace/Empty to Pistol/Ace/blank. Codex
   reproduced both losses in the built bundle; undo restores the old shape.
   The local six-game fixture currently has zero exact Pistol+Empty collisions,
   but this is a football-valid legacy/import shape and a data-preservation
   defect. Reconcile from one pre-mutation projected snapshot, not raw
   truthiness, and pin tag-form, Film Room, Save & Next, revisit, undo, and redo.
2. **Medium — Film Room's four-editor claim is not permanently proved.**
   Section 8h directly commits only Strength, opens/cancels only QB Alignment,
   and uses a Formation edit for parity. It never directly commits/clears
   QB Alignment, Backfield, or Coverage Family through their newly enabled
   Film Room editors. P1c enumerates primary keys, not descriptor relationships:
   Formation has two relationships but only Formation→QB Alignment is exercised.
   Replace this with relationship-complete, table-driven commit/clear/undo/redo
   coverage for all four new columns, including the combined Pistol Empty case.

Existing focused tests remain green (projection form 51/51), which confirms the
fixture gap rather than correctness. No full gate rerun because the production
data-loss defect blocks acceptance.

**BOTH findings from `5b1f3c1` are FIXED at `5b1f3c1`'s repair commit — see
below (mirrors the E4-1 review cycle's own repair-then-mutation-verify pattern):**

1. **Pistol/Empty data loss — root-caused and fixed.** The blank-check that
   gates promotion (`reconcileSiblings`'s forward loop) read `play.tags[pair.
   sibling]` RAW. Since Backfield is now BOTH a sibling (of Formation, for
   'Empty') and a primary in its own right (for QB Alignment, via a legacy
   'Pistol'), a raw `backfield:'Pistol'` looked "already explicit" and
   permanently blocked the Empty promotion — and because Formation's own Empty
   token gets self-cleaned away in the SAME commit regardless (via
   `commitProjectedLook`'s per-primary self-clean, or simply by the primary
   being overwritten), the information was lost from BOTH fields at once, with
   no way to recover it after the fact. Fix: new
   `TagProjection._ownStructuralValue(key, tags)` strips a field's OWN
   registered pairs' tokens (if it has any as a primary) before the blank
   check — so `backfield:'Pistol'` correctly reads as "no real structural
   content" and the Empty promotion proceeds. Directly reproduced (both via an
   explicit Formation edit and via Save & Next) with a throwaway script before
   writing the permanent test, confirmed the exact reported symptom, fixed,
   then made permanent as `tools/e2e-tag-projform.mjs` section 16 (both
   commit paths) and `tools/e2e-film-room.mjs` section 8j (the same shape
   through the grid, since the review named Film Room explicitly).
   Mutation-verified: reverting to the raw check reproduces the loss exactly
   in both new sections.
2. **Film Room test-hardening — closed.** `tools/e2e-film-room.mjs`'s P1c
   section (8g) now enumerates every DESCRIPTOR RELATIONSHIP
   (`formation->qbAlignment`, `formation->backfield`, `backfield->qbAlignment`,
   `coverage->coverageFamily`) instead of primary keys, so a relationship
   attached to an already-covered primary can't silently escape again — the
   missing `formation->backfield` case is now driven explicitly. New section
   8i directly commits-and-clears QB Alignment, Backfield, and Coverage
   Family THROUGH THE GRID (not just Strength), each with a genuine
   before/after DOM read, revisit-after-a-full-re-render, and undo/redo. New
   section 8j drives the combined Pistol+Empty case through the grid
   specifically. Mutation-verified: disabling `reconcileSiblings`'s reverse
   branch entirely is caught by all three siblings in section 8i.

`tools/e2e-tag-projform.mjs`: 51 → 54. `tools/e2e-film-room.mjs`: 174 → 179
(new sections 8i, 8j; 8g extended). Full gate rerun **57/57 green**, zero
regression.

**E4-2 ACCEPTED (Codex, 2026-07-20, code review of `689346c`).** Both findings
confirmed fixed: the combined Pistol/Ace/Empty case preserves QB Alignment and
Backfield correctly, an explicit Backfield selection still takes precedence,
and Film Room now covers all four projection relationships (clear, revisit,
undo/redo, and the combined-field case). Independent checks (Codex's own):
projection form 54/54, Film Room 179/179, zero page errors. Codex could not
independently rerun the full gate or update this handoff (execution-service
usage limit at review time) — **Claude (the builder) reran the full gate fresh
afterward as builder-side validation, not a substitute for independent
confirmation: 57/57 green** (one transient Puppeteer/CDP crash in
`e2e-breakdown-video.mjs` during an earlier *concurrent* run, already isolated
and reconfirmed clean 50/50 on its own before this rerun). **E4 (D-projform,
all of E4-1 + E4-2) is now fully complete and accepted**, with Codex's
independent review as the acceptance authority and Claude's rerun standing
only as a builder-side gate confirmation until Codex can independently rerun it.

**Canonical season save/reopen durability proof — DONE (`8d5c037`).** Named as
outstanding at every step since early E3b and never substituted for by CSV
round-trip or anything in E4-1/E4-2. `tools/e2e-projform-durability.mjs` tags
plays through the real tag-form/Film Room UI (legacy Formation→QB Alignment
promotion, legacy Coverage→Coverage Family promotion, the combined
Pistol+Empty case via both commit paths, a Film Room grid edit, a
derived-value clear), persists through the real StorageManager/SeasonStore
path, then does a genuine `page.reload()` — destroying `window.app`
entirely — and reopens the season the way a relaunch would. Raw tags, the
recomputed projected view, and tag-form chip state are compared field-by-field
(the relevant projection fields via a `pick()` allow-list — reload legitimately
fills in unrelated blank schema keys a synthetic fixture may omit, so a literal
full-object diff would false-fail on that, not on a real regression) against a
pre-reload snapshot. A second section repeats the shape against a copy of a
real season from the coach's Documents mirror when present (same fail-open
convention as `e2e-realdata.mjs`, never written back to). **39/39 passing.**
Mutation-verified: temporarily reverting `TagProjection.reconcileSiblings`'s
blank-check to raw truthiness (the exact historical Pistol/Empty defect)
reproduces a failure in this harness; restored and reconfirmed clean. Full
canonical gate rerun **58/58 green**, zero regression.

**Codex review of `8d5c037` (durability proof) — ACCEPTED, three Low
hardening items, all fixed.** Independent verification confirmed: durability
proof 39/39, complete canonical gate 58/58, real fixture used (6 games, 449
plays), no production-code findings. Three Low findings, all in the optional
real-data section, all fixed in a follow-up commit:
1. **The real-data UI edit could pass vacuously.** The chip click's effect was
   never asserted before persisting — a missing chip or an ineffective click
   could still pass the reopen comparison (comparing an untouched play to
   itself). Fixed: capture the play's tags before the click, assert the
   post-click value actually differs, and assert the Formation chip was found
   at all (deterministically picking an OFFENSE play first, since Formation is
   hidden/collapsed for other units).
2. **The real-season proof checked only the active game.** It verified the
   active game's play count and one edited play, so it would not have
   detected data loss in one of the OTHER five games. Fixed: every other
   game's ENTIRE play array is now fingerprinted (`JSON.stringify`) before and
   after the reload and compared byte-for-byte, plus a check that the same
   number of games survives — not just counts, the full play data for every
   inactive game.
3. **Docs overstated comparison scope.** "Byte-for-byte" implied a literal
   full-object diff; the harness actually compares a targeted allow-list of
   projection-relevant fields via `pick()` (reload legitimately fills in
   unrelated blank schema keys omitted by a synthetic fixture, so a literal
   full-object diff would false-fail on that). Corrected here and in the test's
   own header comment.
Re-verified after the fixes: durability proof **53/53** (up from 39/39 — the
new assertions add real coverage, not just count), full canonical gate
**58/58**, zero regression.

**Next:** packaging per `GRIDIRON-IQ-RELEASE-GATE.md` (internal candidate →
installed real-film smoke → publish). Codex's review explicitly flagged that
its acceptance covers the **BrowserBackend** path only — the installed desktop
smoke still must independently verify the Tauri/file/SqlCatalog path this
harness cannot reach headlessly.

Canonical detail is in `GRIDIRON-IQ-TAG-MODEL.md`, **E3b rev-2 plan
acceptance** (E4's contract, D-projform, is §18/§20 of the same document).
**Builder: Claude. Reviewer: Codex.**

- **Lane D:** accepted.
- **Lane A:** accepted at `22eb521`; lifecycle `30/30`.
- **Lane C:** accepted at `9c80d8b`. Stored film source, sticky charting unit,
  and analytics/scout identity are separate; `app.js` is the sole `.is-scout`
  owner.
- **Scout-inheritance follow-up: ACCEPTED at `c05de0e`** (Claude, non-builder,
  independent built-bundle probe). Three paths verified, all correct:
  `newGame()` on an **empty** game reuses it and **keeps** a scout declaration
  (`stored:"scout"`, `.is-scout` applied); `newGame()` on a **non-empty** scout
  game creates a fresh one that does **not** inherit (`stored:"offense"`); the
  original scout game survives a round trip (no over-reset). The reset now lives
  inside the `if (!reused)` branch and applies to the game `addGame()` returned.
  The earlier unscoped version (`f834761`) wiped the declaration on the reuse
  path — closed, with reuse-path coverage added to `e2e-breakdown-video`.
  **Scout perspective is settled; no open findings on it.**
- **Verification:** built-bundle Breakdown `50/50`, zero page errors; full audited
  gate `51/51`, including real six-game data, parity, integrity, analytics,
  penalties, and Special Teams.
- **Test rule:** a negative assertion that could pass because nothing ran must
  prove mechanism liveness first, and the intended defense must be mutation-tested.

### Lane B1 — COMPLETE. Contract approved for implementation (`24d080c`)

**Canonical contract: `GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md` §4b.** Read it before
touching tries, ST scoring, or analytics routing. Summary only below.

**The defect it fixes — a release blocker, confirmed independently by both
agents.** 2-Pt has always been a Special Teams play here (`index.html:464`
legacy `stType` chip; `playPoints()` scores it). **Phase 4E's structured
redesign dropped it:** six units with no try, `attemptType` limited to
`fieldGoal|extraPoint`, legacy chips hidden as `.bdv-st-legacy`. So on the
shipped beta (`ffa_breakdown_form_v2` ON by default on desktop) **a coach cannot
chart a two-point conversion at all** — which can leave the scoreboard wrong and
makes a full-game smoke impossible. §4's *"two-point tries remain offensive
plays"* did not describe the app; it rationalized the omission, and it is
reversed. This is also the whole explanation for the unreachable `'twoPoint'`
strings in `_conversionStats`/`made()`.

**Decided:**
- **Dedicated `try` / `tryDefense` units.** `fieldGoal`/`fieldGoalBlock` stay
  exclusively for field goals. Existing structured XP records stay readable,
  **not migrated**.
- **Attempt type / official result / events are three separate things.**
  `result: converted|failed|noPlay` is the official ruling; `badSnap`, `blocked`,
  `turnover`, `defensiveReturn` are **non-exclusive event details**. Required by
  real football: bad-snap-then-converted, and the NCAA-documented blocked XP
  recovered and passed in for **two** — where `attemptType` and `score`
  legitimately disagree.
- **No ruleset config.** Fixed values: XP kick **1**, two-point **2**, failed
  **0**, No Play/Retry **0 and no attempt**. **A defensive return never scores
  automatically** — charting one *requires* an explicit `No score` / `2 — our
  team` / `2 — opponent`. That fails closed **without** a selector: the app
  records the coach's official ruling instead of judging legality.
- **Penalties:** `playCounts:false` → no attempt, no points; retry → `noPlay`;
  declined → filmed result stands; unresolved → warn, do not finalize.
- **Out of B1/B2:** try analytics, individual 2-pt rollups, formation/play-call/
  front on a try. The existing `kicker`/`returner` roles do **not** describe a
  run/pass try; do not pretend they fit.

**Analytics routing — a blanket `unit==='special'` filter is WRONG.** A
fake-punt rush is a real rushing attempt and belongs in the box score. Routing is
**per play type** (§4b.7a matrix). Three confirmed defects for B2:
`_individualStats(plays)` gets the **unpartitioned** list (`stats-engine.js:294`);
the generic Scout Report has no ST exclusion (`:3174`); and — the inverse —
`_specialTeamsStats(plays)` (`:303`) gets the caller's playType-filtered list, so
**an ST play without a `playType` is dropped from its own report** (lesson #15
again). `compute()` **does** partition `offPlays`/`defPlays` by unit (`:278`), so
the main offensive dashboard is protected.

**Real-data blast radius (audited):** 972 plays, 148 ST, only **2** carry a
`playType`, **0** carry offensive player attribution, **0** structured fakes.
The coach's offensive and player numbers are **not** polluted. Real defect,
small scope — it rides in B2 as a routing contract, not its own lane.

**B2 implementation outcome:** built by Codex in `68e2090`; Claude requested changes in `14be96a`; Codex closed all accepted findings in `0250010`; **Claude re-reviewed and ACCEPTED `0250010` (2026-07-17)**. Lane B is complete.

**Release sequence: B1 COMPLETE -> B2 ACCEPTED -> E1 ACCEPTED -> E2 ACCEPTED (`c00b98f`) -> E3a ACCEPTED (`03a45b5`) -> E3b (next) -> E4 -> Lane R + ST-disclosure -> G (Plan) -> internal candidate -> installed smoke -> publish.** E5 migration remains optional and post-release. Never migrate or clear coach data without an impact report and immediate confirmation.

### Lane E1 — ACCEPTED (`4813d41`, final review 2026-07-17)

**Canonical contract: `GRIDIRON-IQ-TAG-MODEL.md`.** Read it before touching
formation, coverage, or the tag libraries. Authored by Claude; **Codex reviews**;
no code until approved (B1 precedent). Summary only below.

**The defect:** `tags.formation` is one multi-select field answering THREE
questions — QB alignment (Under Center/Shotgun/Pistol), system/structure
(Wing-T/Trips/Ace), and backfield (Empty) — so they compete for one slot.
`tags.coverage` mixes shell (Cover 0-6) with family (Man/Zone), so **Cover 3
Match is unchartable**.

**COACH, 2026-07-17 — the governing fact:** *"I only tagged it that way because I
had to."* Existing tags measure **what the tool allowed, not what the coach
wanted**. They are NOT evidence of intent and must never be used to infer the
model. (Claude initially reasoned from the tag distribution toward a model — that
inference is invalid and is recorded here so it is not repeated.)

**Decided (coach, 2026-07-17):** `Pistol` = **QB alignment only** (leaves the
backfield library). `Empty` = **backfield only** (leaves formation; supersedes
the v1.9.15 "Empty stays a dual citizen" note, now obsolete). Legacy reads:
**re-tagging anyway — don't optimize for legacy**; old plays read honestly
through a read-time projection, nothing is written, no compatibility machinery.

**The model:** four orthogonal offensive dimensions — `qbAlignment` (NEW,
single), `formation` (multi, structure only), `backfield` (single), `strength`
(single). Coverage splits into `coverage` (**stored key unchanged**, call only,
UI label "Coverage Call") + `coverageFamily` (NEW, single, optional, blank by
default). **Never infer family from shell — Cover 3 is not Zone.**

**Measured exposure (facts, sizing only):** 0 plays conflict on QB alignment, 0
use Pistol/Empty in both fields, 0 of 270 coverage tags are Man/Zone, 0 carry
Power-I, 0 lack the `backfield` property. **The model change is cheap; the cost
is the ~12 analytics/UI surfaces, not the data.**

**⚠ THE LESSON-#17 HAZARD — highest-risk detail in the lane.** `qbAlignment`'s
values are the exact ones that once coded **every ST play "Under Center."** The
alignment key lists are hard-coded in **FOUR places sharing no source**:
`CARRY_SCHEME_KEYS` (`play-tagger.js:1250`), `SCHEME_KEYS` (`:650`),
`ST_ALIGNMENT_KEYS` (`season-store.js:244`), and an **inline copy-paste
duplicate** (`play-tagger.js:1287`). Adding `qbAlignment` to the carry lists but
not the strip lists **reproduces the bug exactly, with the same value**. E2 must
give the strip list a single source of truth and pin it with a mutation-verified
test. Separate flagged gap: `backfield`/`strength` are in NEITHER carry list and
have never carried forward since v1.9.15 — raise separately, do not fix silently.

**Parity: drift is EXPECTED** (formation-keyed tendencies, tells, matrix, scout
`formationDetail`, Big-12 keys). Per B2-R2: **regenerate goldens, never mask**,
audit the diff key-by-key, mutation-test it. `_bigTwelveData` must key on
`[qbAlignment, formation, backfield, strength, motion, playType]` — a call sheet without QB
alignment is wrong football.

**Untouched:** `migratePlayFormation` (idempotent, dead on current data, still
guards imported pre-v1.9.15 Power-I). Redundancy across dimensions is allowed
(Power-I + Under Center + Power may coexist); one value in two libraries is not.

**Final review — ACCEPTED.** Claude's `4813d41` revision closes E1-R8/R9:
legacy Pistol/Match/Empty projection is complete and deterministic; the ST-strip
invariant is unit-conditional with mandatory liveness; and stale list/shell
wording is corrected. E1-R1 through E1-R9 are closed. The coach-approved cleanup
remains bounded to 12 ST plays losing `backfield`, with 1 of those also losing
`strength`; no other E1 cleanup is authorized.

### Lane E2 — self-reviewed after E2-R3 fix; awaiting Codex confirmation

**Builder:** Claude | **Reviewer:** Codex (non-builder), plus a Claude self-review
while Codex was out | **Status:** SELF-REVIEWED, NOT yet formally accepted
(`bf9d42a` built → Codex CHANGES REQUIRED E2-R1/R2 → fixes `80b8ebf` → Codex hit
a usage wall before re-reviewing → coach asked Claude to self-review → Claude
found + fixed E2-R3 at the write boundary). Codex confirms E2-R3 on return; E3
blocked until then.

**E2 review round 1 (Codex, on `bf9d42a`) — both findings closed in `80b8ebf`:**
- **E2-R1 [P1] permanent-data regression.** `copyFromPrevious` (Same-as-Last) and
  `applyTemplate` wrote `SCHEME_KEYS`/template entries — now including `unit` + the
  four alignment fields — directly, with no ST strip. A legacy ST source or a
  template saved from a mis-tagged play could stamp forbidden alignment onto a
  play ending `unit:'special'`, violating the E1-R9 invariant. Both now call
  `_stripStAlignment(play)` after writing. Failing-first tests 16d/16e (liveness:
  present-then-stripped) + 16f (offense copy keeps its look — unit-conditional).
- **E2-R2 [P2] projection.** Backfield was treated atomically, so a malformed
  multi-value backfield (`Pistol + Diamond`) kept its alignment token. Backfield
  is now split symmetrically with formation; alignment tokens stripped
  unconditionally, first supplies `qbAlignment` (tier 3). Test 8b. Normal
  single-value backfield unaffected. **e2e-tag-model 26/26; parity 2/2; gate 52/52.**

**E2 SELF-REVIEW (Claude, builder-as-reviewer, 2026-07-17 — Codex out on usage;
coach asked Claude to review). Marked SELF-REVIEWED, NOT accepted — Codex confirms
on return.** Found + fixed one High finding empirically (reproduced, not reasoned):
- **E2-R3 [High, structural] — E1-R9 was enforced per-writer, not structurally.**
  E2-R1 hand-patched `copyFromPrevious`/`applyTemplate`, but the Film Room grid
  inline editor (`play-grid.js` `_applyEdit`, no unit check; `_openEditor` blocks
  only `*-readonly` types, and the `default` preset renders `formation` for every
  row incl. special ones) also writes ST-alignment fields onto a `unit:'special'`
  play — **reproduced**: editing a special row's Formation cell →
  `tags.formation='Shotgun + Trips'`, ST keys not blank. Same code shape at the AI
  vision stamp (`app.js:1551`) and suggestion engine (`suggestion-engine.js:84`).
  `_normalize` heals on load, but **`persist()` did not normalize**, so the leak
  reached disk (and any `Save Season` export in that window). **Fix: a structural
  strip at the write boundary** — `SeasonStore._stripStAlignmentBeforeSave()` runs
  `stripStAlignment` over every play at the top of `persist()`, the single choke
  all saves flow through, so no writer (present or future) can land a leak on disk.
  Closes the class, not the instance. Failing-first test 18c (proves *persist*
  strips, with liveness). This is the third recurrence of one blind spot (E1-R9
  vacuous test → E2-R1 two writers → E2-R3 three more) — the structural choke is
  the durable answer; see the plan review F7 lesson-#22 candidate.

**E2-R3 re-review (Codex, on `38d195f`) — three gaps, all closed in `c00b98f`:**
The self-review's persist-only fix was **partial**. Codex found:
- **[High] the LIVE object still leaked.** `persist()` cleaned only the
  season-store copy; the live tagger play stays dirty (`commitActive` clones it),
  so UI/analytics reading `tagger.plays` kept seeing the leak. **Fix:**
  `PlayTagger._emit()` strips a special play on `play-created`/`play-updated`
  before listeners run — every writer emits through this seam (~28 sites), so it
  is the universal LIVE choke. Test 18d.
- **[Med] `persist()` was not the only serialization path.** `json()` (Save
  Season download), `snapshot()`/`saveNow()` (backups), `bindDisk()` each
  serialize `this.data` independently and bypassed the strip. **Fix:** all call
  `_stripStAlignmentBeforeSave()` first; the "single choke" claim was wrong and
  the comment is corrected. Test 18e.
- **[Med] the 12/1/0 boundary test never measured "0 other"** (empty `forEach`;
  `otherCleared` declared, never asserted). **Fix:** 18b now counts every
  `ST_ALIGNMENT_KEYS` key except backfield/strength that clears on the real
  special plays and asserts 0 — FAILS if the authorized strip list broadens.
  Real fixture verified genuinely 12/1/0.

**Two barriers now: live object clean at `_emit`, data-at-rest clean at every
serialize.** e2e-tag-model **30/30**; parity 2/2; gate 52/52.

Verified clean in the self-review: bundle byte-identical to a fresh rebuild;
`tag-projection.js` robust to junk input + idempotent; static ST writers
(`setUnit` ×2, carry) all guard; new-play defaults present at the creation sites.

**E2 status: ACCEPTED (coach confirmed "e2 passed", 2026-07-18, at `c00b98f`).**
E2-R1/R2 accepted; E2-R3 closed with the two-barrier live+at-rest strip and the
real 0-other test. **E3 is now unblocked and building — see the coach-approved
E3/E4/Lane-R decisions in `GRIDIRON-IQ-TAG-MODEL.md` §18 (E3 split + consumer-
parity proof standard, ST disclosure, projected-form save, Legacy-tags-to-review
naming).** E3 ships as E3a (registry + StatsEngine + golden regen) → Codex review
→ E3b (Study/Film Room/exports + consumer-parity assertions) → Codex review → E4.

E2 is the **pure data layer** for the accepted E1 contract — no analytics or UI
change (the P4E-a "normalizer seam" shape):

- **`js/tag-projection.js` (NEW, pure, DOM-free):** `TagProjection.project(tags)`
  — single read-time source of truth for the four-dimension split. Reads legacy
  QB alignment out of `formation`/`backfield` into `qbAlignment`, coverage family
  out of `coverage` into `coverageFamily`; strips wrong-field tokens **always**,
  supplies the target **only when blank**, deterministic precedence (explicit
  `qbAlignment` > first `formation` token > backfield `Pistol`). Never mutates
  input. **No consumer wired yet — that is E3.**
- **`season-store.js`:** `ST_ALIGNMENT_KEYS` is the single source of truth and
  gains `qbAlignment`/`coverageFamily`/`backfield`/`strength`. The
  `backfield`/`strength` clear on `unit:'special'` plays is the coach-approved
  **bounded cleanup** — exactly **12** backfield / **1** strength on the real
  six-game season, 0 other keys.
- **`play-tagger.js`:** `CARRY_SCHEME_KEYS` + `SCHEME_KEYS` carry the four
  pre-snap look fields (E1-R6); the inline ST-strip duplicate is **deleted**,
  consuming `SeasonStore.ST_ALIGNMENT_KEYS` (E1-R9 single source); blank-play
  templates born with `qbAlignment`/`coverageFamily = ''` (E1-R2).
  `playlist-manager.js`/`storage.js` get the same new-play defaults.

**Deliberately deferred — do NOT flag as missing:** projection has no consumer
(E3 wires ~12 surfaces + regenerates goldens); no chip sets the new fields (E4);
library reservations (E1-R7) + coverage-call/family labels are E4. Read-only
projection means **legacy plays are NOT backfilled** — E3 consumers read the two
new keys defensively (`?? ''`); intended asymmetry (§5.1).

**Verification:** `e2e-tag-model` **22/22** (contract tests 1-13, 16-20;
mutation-verified ST-strip; real-fixture 12/1/0). **Parity 2/2 UNCHANGED** — the
cleanup touches no analytic. Full gate **52/52 green**. No push, package, or tag.

**Review focus:** projection vs §5 (every moved-value path + precedence),
read-only/no-mutation, ST-strip single source + non-vacuous E1-R9 invariant, the
12/1/0 cleanup boundary, new-play defaults at every creation site, and that
nothing analytic moved. **Next after acceptance:** E3.

### Lane B2 - ACCEPTED (`0250010`, re-review 2026-07-17)

**Builder:** Codex | **Reviewer:** Claude | **Status:** ACCEPTED. Lane B closed. E1-E4 may begin.

B2 implements the approved Section 4b contract without migrating or clearing any legacy coach data:

- Dedicated `try` / `tryDefense` units with controls for attempt, official result, independent bad-snap/block/turnover details, and an explicit defensive-return ruling (`No score`, `2 - subject`, or `2 - opponent`). No ruleset selector was added.
- Standard scoring is enforced: Kick XP = 1, two-point attempt = 2, failed/no play = 0. A broken XP attempt may finish as a two-point score; a standard two-point attempt cannot be recorded as one point.
- Penalties fail closed. `playCounts:false` and `noPlay` add no attempt or points; unresolved or mismatched rulings keep the play visibly uncharted. Coaches may move on, but progress does not call the try complete until attempt, official result, penalty state, and any defensive-return ruling are resolved.
- Tries stay out of base offense, ordinary player box scores, and generic Scout. Current fake-rush/pass box-score behavior is preserved. Untyped structured/legacy kick and return specialists now reach only their legitimate specialist rows; untyped ST tacklers remain excluded.
- Untyped structured Special Teams events now reach the ST report. Film Room and Study expose try unit and official result; no tactical try analytics, try player rollups, formation, play call, or front charting were added.
- Existing structured XP remains readable. Legacy `stType:'2-Pt'` remains untouched and is never promoted.

**Verification:** B2 contract 13/13; Breakdown form 58/58; Special Teams contract 20/20; analytics registry 24/24; synthetic + real six-game parity 2/2; final canonical gate **51/51 green**, zero page errors.

**Review-fix outcome (`0250010`):** B2-R1 closed with a deliberately scoped
individual-stat source: untyped ST specialists are included, but untyped ST
tacklers are not. B2-R2 closed by deleting the parity mask and deliberately
regenerating the committed synthetic golden; the diff is limited to specialist
individuals, Special Teams, and Scout. B2-R4 closed by allowing only non-empty
structured player roles to override `tags.players`. The harness now reports an
explicit failure count. B2-R3 remains CLOSED by coach decision: kick XP -> 2 is
an intentional manual override and was not changed.

**Verification on exact rebuilt bytes:** `e2e-b2-tries` 13/13; synthetic + real
six-game parity 2/2; real-data 16/16; canonical gate **51/51 green**. No push or
package.

**RE-REVIEW — ACCEPTED (Claude, non-builder, 2026-07-17).** Every closure was
verified empirically, not taken on report:
- **B2-R1 CLOSED.** All original probes flip: untyped structured returner/kicker
  now reach the box score while the ST report agrees. Six boundary probes pass,
  including the subtle one — a play *admitted* for its returner does not leak its
  tackler through the same admission (the exact fix hazard; the reworked
  `countsFootballRoles` gate covers it). Fake-punt rush preserved; identity-Set
  prevents double-counting a typed play present in both source lists. The new
  13th `e2e-b2-tries` assertion pins `tacklers: []` explicitly and is
  mutation-resistant by construction: pre-fix code fails it (specialists absent)
  and a naive `convSource` widening fails it (legacy tackler '44' enters).
- **B2-R2 CLOSED.** Mask deleted; parity compares raw snapshots again. The
  committed `synthetic-edge.json` diff was audited key-by-key: **only**
  `numbers.specialTeams`, `reports.scout`, and `numbers.individuals.kickers`
  drift — exactly the reviewed corrections, nothing else. Mutation re-run:
  reverting B2's corrections now FAILS parity 0/2 **including on the real
  six-game fixture** — the exact blindness the mask created is gone and real ST/
  scout values are pinned again.
- **B2-R4 CLOSED** (blank structured kicker no longer clobbers the roster
  input; probe confirms #9 survives). **Nit CLOSED** (`e2e-b2-tries` prints an
  explicit failure count). **B2-R3 remains closed** per §4b.3c — confirmed
  unchanged.
- **Gate:** bundle byte-identical to a fresh rebuild; full canonical gate
  **51/51 green** re-run independently. Nothing pushed, packaged, or tagged.
### B2 REVIEW VERDICT (Claude, non-builder, 2026-07-16) — CHANGES REQUIRED

**What was verified, not taken on report.** The full gate is **51/51 green** and
the committed bundle is **byte-identical to a fresh `build.sh` rebuild** (so the
bundle was not hand-edited). §4b.7a's routing matrix was walked cell by cell
against source and observed behavior: **23 of 24 cells are delivered.** The
XP/2-pt try row is fully correct. The fake row correctly preserves rush/pass via
`countsFootballRoles = !structured || structured.isFake` — gating **inside**
`_individualStats` rather than filtering by unit at the caller, which is the
shape the matrix demands.

**Reviewer error worth recording:** Claude expected B2's blanket
`unit === 'special'` scout filter to violate the contract's "a blanket filter is
WRONG" warning. **It does not.** That warning is scoped to the *player box score*
column; the *Scout tendencies* column reads **No** for every ST row, fakes
included. The filter is correct. Do not re-flag it.

**B2-R1 [Medium] — the one matrix cell not delivered; new B2 code is dead.**
`individuals: this._individualStats(plays)` (`stats-engine.js:300`) still gets the
playType-filtered list. B2 moved `specialTeams` to `convSource` (`:309`) and fixed
the inverse defect there, but left `individuals` on the old filter. Observed: a
structured kick return (returner #22, 35 yds, TD, **no playType**) yields
`specialTeams.returns.kick.n = 1` but `individuals.returners = []`; adding a
`playType` makes it appear. Same for a structured FG kicker. **So the
`structuredReturn` / `specialist` code B2 added in this very commit is unreachable
for the exact play shape it targets** — the 4E-b form writes no `playType`.
Matrix says Kick/return → box score = **"ST roles only" = Yes**. Not delivered.
**Not a B2 regression** (same filter pre-B2), but contract defect #1 named
`_individualStats(plays)` specifically, and only its sibling was fixed.
**Measured real-season exposure** (the B1 audit counted *offensive* attribution =
0, but never counted specialists): **56 ST plays, 26 carry a kicker or returner —
12 returner + 15 kicker — and all 26 are untyped**, so all 26 are invisible today.
**FIX HAZARD — do not take the one-liner.** `_individualStats(convSource)` is NOT
safe: rushers/passers/receivers are gated on `isRun`/`isPass`, but the **tackler
branch is not** — it runs on any play carrying `players.tackler`. Widening the
source silently admits untyped tackler plays (measured: 2 in the real season, both
ST, 0 non-ST). Scope the source deliberately and pin it with a test.

**B2-R2 [Medium] — the parity mask permanently blinds two surfaces; the golden
now lies.** The builder's containment claim was **verified and holds**: across 7
scopes × 2 fixtures, `numbers.specialTeams` and `reports.scout` are the **only**
drifting keys. The corrections are real and valuable — on the coach's real season
the ST report went from `hasData:false`/all-zeros to **punts 8, kickoffs 14, kick
returns 10, punt returns 7** (148 ST plays had been reporting nothing); scout
`totalPlays` 456→400. **But mutation-tested:** reverting B2's own two corrections
in source leaves parity passing **2/2**. The mask makes parity blind to the exact
regression B2 fixed. Defense does not fully collapse — `e2e-b2-tries` catches it
(12→10, exit 1) and the gate fails; that is why this is Medium, not P1. Residual
cost: (a) **real-data ST/scout values are now pinned by nothing** (`e2e-b2-tries`
is synthetic; `e2e-realdata` checks errors, not values), (b) committed
`synthetic-edge.json` holds stale values the app cannot produce, (c) the mask is
**unconditional and permanent**, so all future ST/scout work sits outside parity.
"Committed goldens are byte-identical" is circular — the bytes match because the
comparison was switched off. **Fix: regenerate the goldens, delete the mask.**
`synthetic-edge.json` is committed, so its git diff **is** the "reviewed
correction called out in the diff" the standing rule asks for — that rule exists
to stop silent papering-over, and an audited deliberate correction is exactly when
the golden gets updated. `mavericks-6game.json` is gitignored and regenerates per
machine. The scoped-drift audit above is the evidence authorizing regeneration.

**B2-R3 [CLOSED by coach, 2026-07-16] — a clean kick XP can be scored 2.** Real
and reachable in two clicks, but **intentional and staying**. See
`GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md` **§4b.3c**, which is canonical: the manual
award is the ruleset flexibility, the override is **one-directional by design**
(kick XP→2 allowed; two-point try→1 silently forced to 2), and CYO stays
half-chartable and out of scope. **Do not "fix" either half.**

**B2-R4 [Low] — structured players clobber `tags.players`.**
`{ ...(p.tags.players||{}), ...(structured?.players||{}) }` (`:1519`). `normalize`
always emits `kicker/punter/returner/blocker/recoverer` as `''` via `_text`, so
structured wins even when blank. Observed: `tags.players.kicker='9'` +
`structured.players.kicker=''` → merged `''` → `kickers: []`. The 4E-b roster sync
should keep structured populated and no live UI path was found — defense-in-depth,
not a known live bug. Merge only non-empty structured values.

**Nit:** `e2e-b2-tries.mjs:200` prints `== RESULT: N passed ==` with no failure
count — the shape Lane D's detector was hardened against. Confirmed it exits 1 and
the gate catches it, so it is safe today, but it is the one harness relying
entirely on its exit code.

**Next action:** RESOLVED — `0250010` re-reviewed and ACCEPTED 2026-07-17 (see the Lane B2 ACCEPTED section above). Lane B is complete; E1-E4 is next.
### Product redesign handoff (v1.12.0-6 published baseline)

The clean-sheet Home / Break Down / Study / Plan direction is documented in
`GRIDIRON-IQ-REDESIGN-PLAN.md`. The interactive source of truth is
`ux-prototype-v2/` (run `python -m http.server 4174 --directory
ux-prototype-v2`, then open `http://127.0.0.1:4174/`). The earlier
`ux-prototype/` is only the Quick Chart exploration.

The coach-approved prototype baseline is tagged **`design-v1`**, with final
edge polish preserved as **`design-v1.1`**. Read
`ux-prototype-v2/ITERATIONS.md` for the design decisions and exact historical
commits. These are visual/product references, not deploy or desktop release tags.

**Recovery status (2026-07-15, release candidate):** `R1` through the R3
implementation and integrated R4-R8 presentation checkpoint in
`BREAKDOWN-REDESIGN-PARITY.md` are complete. Break Down now has a dedicated
production route plus a canonical charting header: one real unit control,
self-scout/opponent-scout context, existing Quick Chart entry, current play/D&D,
tag progress, and autosave state. The canonical form now uses real sections,
shared tag libraries, structured penalty/Special Teams placement, and explicit
Chart/Film Room modes. Current focused gates: route/video 27/27, form 46/46,
library settings 15/15, library contract 11/11, penalties 7/7, Special Teams 20/20,
tagging 27/27, real-data integrity zero violations, and R7
accessibility/scaling 8/8; four viewports passed visual review. R4-R8 are
complete; R9 is next. The R9 code review fixed a critical pending-note race:
notes update their originating play immediately, debounce only the mutation
notification, and use object identity so same-numbered plays in another game
cannot receive them. Clear Tags and undo/replacement paths cannot replay stale
notes. Quoted tag-library values now render through DOM APIs; movable controls
reclamp after video resizing; ordinary tag edits update one stable play card.
R8 is now complete: Chart hides the full spreadsheet by default; Film Room is an
explicit mode in the media column and preserves play/tag state. Film Room is
60/60 and the complete 49-script repository gate is green. The R9 parity-matrix
audit and repair are complete locally. Break Down now replaces its desktop
sidebar with compact top navigation, growing the 1440px media pane from roughly
756px to roughly 964px (the approved reference is roughly 947px). Mobile now has
one Home/Break Down/Study/Plan navigation system, no route select or legacy
workflow tabs, and a compact header; Game remains reachable while duplicate
progress is hidden and Templates moves below the charting groups. Situation is
visible in the first 390x844 viewport. Fresh captures are in `.tmp-r9-fixed/`.
The served-browser review then exposed an empty-origin dead end: all primary
routes were disabled while setup was buried in season management. Empty Home now
offers an enabled `Set up team` action (or `Choose a season` when appropriate),
and the isolated sample was manually driven through season open, Break Down,
play selection, and an enabled tag form. Focused gates are route/video `31/31`,
workspace shell `18/18`, form `46/46`,
and accessibility `8/8`; the fresh full 49-script gate is green. Read
`BREAKDOWN-REDESIGN-PARITY.md` for the measured audit. The coach approved the
R9 layout review and authorized `v1.12.0-3` as the single installed-desktop smoke
candidate. Its rebuilt bundle passed the physical asset gate (Break Down video,
workspace, form, shell, SVG, and packaged SQL resources) and the complete
49-script repository gate in 186 seconds. Installed smoke then found that form
navigation left an active analytics example set: Save & Next used chronological
order instead of the filtered cut-up queue. A local verified fix makes the cut-up
own Previous, Skip, and Save & Next, avoids carrying situation/scheme between
nonconsecutive examples, and consumes end-of-set without falling through. The
focused form gate is `50/50`; ordinary tagging, Study, season analytics, and
Film Room remain green. The fix and the coach-approved standard Formation
values `Power-I`, `Ace`, and `Victory` are packaged in the `v1.12.0-4`
continued-smoke candidate. The exact rebuilt bundle passed the physical asset
check and complete 49-script repository gate in 187.7 seconds. Plan's blank
real-season workspace is logged as
BETA-004: Study computes data independently, while Plan only receives findings
the coach explicitly promotes. The downstream item, reorder, Watch, Present,
and Export machinery exists, but Plan neither explains nor links to that curation
workflow and has almost no direct authoring. BETA-005 is a P0 data-model blocker before permanent
re-tagging: Under Center, Shotgun, and Pistol must become a separate single-value
QB-alignment dimension instead of competing with structural formations such as
Ace. Formation, backfield, strength, and QB alignment must aggregate separately
and cross-filter cleanly. Do not migrate or clear existing season data without
showing the impact and receiving explicit coach confirmation. Do not implement
or package findings one at a time. BETA-006 applies the same correction to
coverage: Cover 0-6 are the primary shells, while Man/Zone/Match are a separate
optional family dimension that stays blank by default. Do not make the current
mixed field multi-select; shell and family must aggregate independently and
support an exact intersection without double counting.

**BETA-007 playback optimization (2026-07-15, `v1.12.0-5` candidate):** intermittent desktop
film hitches traced to avoidable app-side playback work. `CanvasOverlay` no
longer clears/repaints its full-DPR canvas on every playback tick when no drawing
is visible; the scrub fill uses compositor transforms and duplicate time-label
writes are skipped. Canonical tag autosaves remain immediate. Only throttled
automatic restore points defer until playback has stayed paused for 500 ms;
manual/pre-risk snapshots remain immediate, supersede pending auto work, and a
season-id pin plus transition cancellation prevents cross-season flushes. The
rebuilt implementation passes Breakdown Video `35/35`, form `50/50`, video
CORS, catalog/backend, the real six-game 960-op integrity stress, and the full
49-script gate in 243.8 seconds. Installed-film validation remains necessary
because the real codec/disk path is local-only. The exact stamped `v1.12.0-5`
bundle additionally passes the physical asset check, Breakdown Video `35/35`,
form `50/50`, CORS `14/14`, catalog/backend, and the 960-op integrity stress.

**BETA-008 autoplay preference (2026-07-16, `v1.12.0-6` candidate):** the
video action bar now exposes a persistent, default-on `Autoplay next` toggle.
Off seeks and pauses on Previous, Save & Next, Skip, and manual filtered-example
navigation; starting Watch still plays intentionally and an already-playing
cut-up still advances continuously. The control is labeled/keyboard accessible,
has a 44px mobile target, and passes form `53/53`, video `36/36`, cross-game
cut-up `13/13`, a11y `8/8`, Film Room `60/60`, and CORS `14/14` before the full
release gate. The exact rebuilt candidate then passed the complete 49-script
gate in 256.4 seconds.

**Prototype revision 2 (2026-07-12, Codex)** tightens the play strip and tag
controls, adds a working Team Settings library editor for enabled/custom
formations and backfields, and replaces the Study prose-first placeholder with
visual KPI, stacked tendency, effectiveness-bar, trend-chart, alert, and
matching-play views. This is a design reference only. The production contract is
that disabled tag-library values remain on historical plays and in analytics,
and that Study preserves and expands visual reporting rather than replacing
charts with text. QA: 1440x900 + 390x844, no page-level overflow.

**Prototype revision 2.2** makes Break Down unit-aware without reducing the
production charting contract. A prominent Offense/Defense/Special Teams switch
reorders and renames the same complete data surface by perspective: Defense
starts with Our Defensive Call then Offense Faced; fronts are now an editable
custom library alongside formations/backfields. Player/grade roles adapt by
unit. Penalties are modeled separately from play result with team, foul,
enforcement, yards, counts/no-play, and notes. Special Teams is phase-first and
reveals only applicable kick/return/scoring fields. Treat every current
production selector as required data unless an explicit product decision and
parity test approve removal. Prototype typography is Segoe UI Variable Text +
Bahnschrift Condensed for a calmer long-session interface; production unchanged.
No charting chip is required: blank values are valid, Save & Next remains
available, and a staff-specific `Power-I` formation can stand alone. It will
participate in formation analytics while analyses needing blank backfield or QB
alignment fields omit it honestly; never silently remap the coach's terminology.
This is a TARGET contract, not current production behavior: the existing
`SeasonStore.migratePlayFormation()` rewrites exact `Power-I` to
`backfield:'Power'` and clears it from Formation on every normalize. Treat that
as a production compatibility blocker for custom tag libraries; migration must
be version/provenance-scoped before new custom values use legacy token names.
The prototype play strip also establishes a production hierarchy requirement:
play number is secondary, while situation and play/result/yardage are prominent.
Its former dead space now carries the high-frequency film marking, copy, clear,
and delete actions without increasing page-level scrolling.
The latest prototype removes the desktop sidebar: the four workspace routes and
team context live in the top bar, returning the empty rail width to video. Mobile
keeps bottom navigation. Speed/loop/angle are promoted inside the existing
player bar; low-frequency setup/history/filter/drawing tools stay in Settings.

**Break Down drawing-tools TODO:** the redesign must preserve the production
video-annotation capability and make it easier to reach while actively coaching.
Phase 4 includes freehand draw, erase, clear, undo/redo, and a small accessible
color palette over the video, using the existing `CanvasOverlay` and unified
history contracts where practical. It must work with mouse, pen, and touch; stay
pixel-aligned through resize/fullscreen/video changes; and never crop, resize, or
cover the film when inactive. This is planned work only, not yet prototyped or
implemented in the redesigned workspace.

**Phase 4A tag-library foundation passed its exact historical full gate
(`f09517d`, Codex).** Adds
pure `TagLibrary` state for per-team Formation, Backfield, and Front vocabulary:
ordered defaults, custom values, enabled/hidden choices, restore defaults, and
one-way lossless migration from `ffa_custom_chips_<team>` to
`ffa_tag_libraries_<team>`. `CustomChips` now renders all three libraries;
disabled values disappear from new tag-form and Film Room choices, while an
active/historical hidden value remains visible and editable. No play tags are
deleted or transformed. The documented `Power-I` blocker is fixed at the source:
Formation-to-Backfield migration now runs only when a play genuinely lacks the
`backfield` property; modern `backfield:''` preserves custom Formation `Power-I`
exactly. `e2e-tag-library` is 11/11, Season tab is 152/152, and the final atomic
build plus all 42 e2e scripts pass, including the real six-game integrity fixture.
On 2026-07-13 Codex also checked out the exact commit in an isolated worktree,
rebuilt it, and reran every harness present there: **42/42 green**. This closes
the full-gate step Claude could not finish before its usage limit. Shell remains
opt-in; no release/tag. **Review focus:** one-way migration, team
isolation, hidden-vs-historical behavior in both editors, custom Front semantics,
Power-I boundary, malformed storage/fail-closed behavior. Next after acceptance:
customer-facing Team Settings library UI over this contract.

**Smoke-library addition (2026-07-15, local):** `Power-I`, `Ace`, and `Victory`
are coach-approved standard offensive Formation values. Existing team-library
records normalize same-named custom entries into defaults while preserving
their enabled/hidden state; historical play tags are untouched. `Power-I`
remains protected from the legacy Formation-to-Backfield migration whenever a
modern play carries the `backfield` property.

**Phase 4B Team Settings tag-library editor is ready for review (`de62d70`,
Codex).** The production Settings drawer now opens a focused, responsive editor
for per-team Formations, Backfields, and Fronts. Coaches can show/hide any
default, add custom staff terminology, remove custom choices, and restore the
default library. The editor states and preserves the core contract: changing a
choice affects future charting controls only; existing play tags and analytics
are never rewritten. Custom Fronts become first-class tag-form/Film Room values
immediately. The dialog supports Escape, confirmation for removal/restore,
keyboard controls, and a 390px layout with 44px targets and no horizontal
overflow. `e2e-tag-library-settings` is 10/10 and the fresh built bundle passes
all 43 e2e scripts atomically. Shell remains opt-in; no release/tag. **Review
focus:** team-switch freshness, dialog focus/keyboard behavior, destructive
confirmation, case-insensitive duplicate handling, historical-tag preservation,
and mobile overflow/touch sizing. Next after acceptance: Phase 4C Break Down
form recomposition behind its own flag; do not change the stored play schema.

**Phase 4C Break Down form composition passed Codex's adversarial self-review
(`e8f0abe`, Codex; independent Claude review still pending).**
At the coach's direction, work continued while the 4A/4B review is pending. A
new `BreakdownForm` composition layer activates only when
`ffa_breakdown_form_v2=1`; flag-off markup and behavior remain classic. It
reuses the live production controls in place, adds the approved football-section
hierarchy, tightens charting density, and makes headings perspective-aware:
Our/Opponent Offensive Look, Our/Opponent Defensive Call, Defense Faced,
Offense Faced, and Special Teams. It does not clone controls, own tag state, or
change the play schema, so existing listeners, Save & Next, custom libraries,
Film Room, analytics, and persistence remain on their established paths. The
focused harness is now 14/14: both flag states, every Offense/Defense/Special
Teams/player/situation/helper field present, chip and all-unit save paths, the
real game-perspective scout event, primary/faced collapse behavior, subject-aware
Special Teams, and 390px overflow/touch sizing. Tagging remains 27/27,
tag fields 15/15, tag-library settings 10/10, workspace shell 15/15, and the
fresh bundle again passes all 44 e2e scripts atomically. Source tracing found no
DOM mutation, perspective, field-reachability, collapse, or flag-off defect.
Visual QA at 1440x900 removed
a duplicate primary heading before commit. No release/tag. **Review focus:** DOM
mutation safety, perspective synchronization, flag-off purity, primary/secondary
collapse behavior, all-field reachability, and disabled/no-play presentation.
Next proposed slice is unit-specific role and penalty UX, starting with Defense;
do not add a penalty schema without a separate failing-first data contract.

**Phase 4D increment 1 — unit-specific player roles is ready for review
(`3e9f87c`, Codex).** Under the opt-in 4C form only, Offense now shows Ball
Carrier/Passer/Receiver, Defense shows Tackler(s)/Takeaway, and Special Teams
uses its existing dedicated Kicker/Returner block instead of repeating the
shared roles. The existing `RosterManager` remains the behavior owner and still
defaults quick-picks by unit (including Takeaway on turnovers); this increment
only aligns visible controls and section copy with that proven behavior. Hidden
assignments are never cleared, so switching units or opening historical mixed
data is lossless. No schema, stats, roster, persistence, or classic flag-off
behavior changed. Focused Break Down is 18/18; tagging 27/27, Season/player
analytics 152/152, Self-Scout 28/28, core 25/25, and full gate 44/44. No
release/tag. **Review focus:** hidden-value preservation, active quick-pick role
after each unit switch, turnover defaulting, ST duplication, and mobile role
layout. Penalty redesign remains blocked on a separate backward-compatible data
contract; do not dress the legacy `result:'Penalty'` flag up as structured data.

**Penalty priority changed by coach (2026-07-13):** trustworthy future penalty
tagging is more important than 1:1 semantic migration of the clunky legacy
Penalty result. The researched contract and implementation gates now live in
`GRIDIRON-IQ-PENALTY-MODEL.md`. Direction: copy QwikCut's explicit offensive/
defensive penalty + yards separation, preserve Hudl's editable breakdown rhythm,
and extend both with accepted/declined/offsetting, play-count status, multiple
fouls, actual enforced yards, and an explicit resulting situation. The football
result stays independent. Legacy penalties remain intact but are labeled
incomplete; never infer charged team/foul/yards from old fields. **Next action:**
independent review of the contract, then P4D-a pure normalization and failing-
first persistence tests before any penalty UI.

**Phase 4D structured penalties are implemented (`461d0b1`, Codex) and ready
for independent review.** `PenaltyModel` stores multiple fouls per play with
charged team, foul, accepted/declined/offsetting ruling, actual enforced yards,
play-count status, phase, player, and notes. The coach can explicitly confirm
the next down/distance/spot; Auto D&D uses only that complete confirmation and
otherwise refuses to guess. Film Room, Study, Game reports, HTML export, and
CSV round-trip consume the structured model. Flagged plays and foul records are
separate; declined/offsetting yards never enter accepted-yard totals. Legacy
Penalty Result values remain intact, incomplete, and unmigrated. New standing
rule: known-bad data is not migrated; any cleanup requires permission and an
explicit confirmation immediately before clearing. Focused gates: contract
6/6, Break Down 39/39, registry 24/24, CSV 8/8, parity 2/2. Fresh atomic full
gate: 46/46. No release or flag-default change.

**Special Teams redesign direction (2026-07-13):** the coach rejected the
legacy `Scored by Us/Them` workflow as confusing and asked for a comparable-app
review plus a rebuild if warranted. The rebuild is warranted. The researched
contract lives in `GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md`: chart one of six
coach-facing units, store the subject role explicitly, capture event-specific
kick/return/attempt outcomes, and derive scoring rather than asking the coach to
translate it into Us/Them. Onside and fake are modifiers. The current overloaded
`kickOutcome` and duplicated Result semantics are compatibility-only, and the
hard-coded 20-yard punt-touchback net adjustment must not survive into the new
analytics. Old fields round-trip intact but remain labeled incomplete. **Next
action:** independent contract review, then P4E-a pure normalization, ruleset
seam, and failing-first persistence/scoring tests before any Special Teams UI.

**Phase 4E-a structured Special Teams contract is ready for review (`0308486`,
Codex).** The contract review separated ball/attempt disposition from scoring,
added a rare explicit subject/opponent ownership override using team semantics
rather than Us/Them copy, and requires ambiguous safety/recovery ownership to
fail closed. `js/special-teams.js` is a pure, DOM-independent normalizer and
accessor seam over six canonical units. It preserves unknown/future keys,
derives the canonical subject role from unit, permits negative return yards,
and computes net only when observed inputs or an explicit touchback rule permit
it. `SeasonStore` normalizes only an existing `play.specialTeams`; it never
creates trusted data from `stType`, `kickOutcome`, or `scoreFor`. `StatsEngine`
prefers a structured score and subject/opponent attribution, then uses the
unchanged legacy path when no structured score exists. The focused harness is
12/12, including canonical persist/reopen and snapshot/restore; the fresh built
bundle passes all 45 e2e scripts atomically, parity unchanged. **Review focus:**
unusual recovery touchdowns, safety unknown behavior, normalization idempotence
and forward-key retention, signed returns, structured/legacy precedence, and
touchback fail-closed behavior. P4E-b UI remains blocked until acceptance.

**Phase 4E-a adversarial self-review is ACCEPTED after fixes (`ae5afc9`,
Codex).** The review added failing-first cases that exposed seven real defects:
a structured no-score event could revive stale legacy Good/Field Goal data;
recovery could misattribute a made kick; negative kick/time values became zero;
malformed structured objects inflated tagged progress; a missed XP lacked an
explicit attempt identity; ambiguous points vanished from scoreboard totals;
and authoritative structured data suppressed a fake's legitimate football TD.
Fixes make any valid structured event authoritative, add `attemptType` for
Field Goal/Extra Point, keep made-kick ownership role-based, reject invalid
nonnegative measurements, validate structured tagged state, track ambiguous
points in a sparse `unattributed` bucket, and allow only fakes to read TD/Safety
from the general result when structured score is blank. The first full gate
caught additive zero-valued `unattributed` fields drifting both parity goldens;
the field is now emitted only when nonzero, restoring byte-identical legacy
output. Focused contract 19/19, both parity fixtures clean, season 152/152, and
final fresh atomic gate 45/45. **Next action:** P4E-b phase-first Special Teams
UI behind the existing Break Down flag. New UI must never write `scoreFor`.

**Phase 4E-b phase-first Special Teams UI is ready for review (`42e5a00`,
Codex).** Behind `ffa_breakdown_form_v2`, the Special Teams group now starts
with six units: Kickoff, Kick Return, Punt, Punt Return, Field Goal/XP, and Field
Goal Block. It writes only normalized `play.specialTeams`; no redesigned action
writes `stType`, `kickOutcome`, or `scoreFor`. Applicable outcomes, FG/XP attempt
identity, Onside/Fake, kick/return/possession/end spots, blocker/recoverer,
scoring, and recovery ownership appear contextually. Safety and unusual recovery
scores use subject-aware team labels and fail closed until resolved. Unit changes
that would clear structured details use the in-app confirmation. Existing roster
Kicker/Returner inputs sync into structured players. Classic flag-off behavior
is unchanged. Break Down 29/29, Special Teams contract 19/19, tagging 27/27,
season 152/152, and atomic full gate 45/45. **Review focus:** all unit paths,
unit-switch cancellation, return-attempt state, blocked-kick return TD ownership,
FG/XP scoring, opponent-scout labels, persistence/reload, mobile overflow, and
legacy-field non-write.

**Known-bad migration rule (coach decision, 2026-07-13):** do not migrate data
we know is unreliable and do not build special compatibility machinery for data
the coach must chart again. Legacy Special Teams details are quarantined and
shown as uncharted; only their broad existing `unit:'special'` classification is
trusted. Current bytes remain untouched for safety. Before any cleanup deletes
legacy keys, ask permission and obtain explicit confirmation immediately before
acting. No cleanup is part of 42e5a00.

**Phase 4E-c completes the Special Teams rebuild (`994e30d`, Codex).** Film
Room's Special preset now reads structured Unit, Outcome, Kick, and Return
summaries; those cells are intentionally read-only so edits stay in the
validated phase form. Study exposes normalized Special Teams unit, outcome,
subject role, and score dimensions. Advanced Reports computes structured punt,
kickoff, return, Field Goal, and Field Goal Block metrics. If any structured
events exist, quarantined legacy detail is excluded rather than blended into
trusted totals; legacy-only seasons retain their exact old output. Touchback net
is omitted without a configured rule, never hard-coded. Malformed structured
objects fail closed in Film Room and Study. Focused contract 20/20, Break Down
31/31, registry 23/23, both parity goldens clean, and atomic full gate 45/45.
Phase 4E is code-complete and ready for Claude's comprehensive stack review.

**Opt-in beta release bar:** structured penalties implemented and reviewed;
Claude's comprehensive Phase 4 review resolved; integrated desktop smoke over
real managed/linked film; then package the redesign behind its reversible flag.
At the current pace this is approximately 3-5 focused build/review sessions,
assuming no gate exposes a new persistence or analytics defect.

**v1.12.0-2 functional desktop beta (`e6573b1` plus packaging correction, Codex self-review).** The
coach is the sole product reviewer and smoke tester. This is not prototype or
temporary storage: first desktop launch enables the workspace shell, redesigned
Break Down form, and SQL catalog, and all charting writes to the canonical
season plus the existing JSON/Documents safety paths and backup ring. A one-time
beta marker preserves a later choice to use classic layout. The self-review
found and fixed three issues before packaging: enforcement edits now invalidate
a stale confirmed next situation; the missing offense/defense/Special Teams
foul suggestion datalist is real; and CSV no longer drops a structured
penalty-only row. SQL regression explicitly pins penalties and resultingSituation
through close/reopen, including the real 6-game fixture. Rust check green; fresh
atomic gate 47/47; parity goldens unchanged. GitHub tag must be a prerelease so
stable v1.11.4 clients do not receive it through the latest updater endpoint.
Published replacement tag `v1.12.0-2` is confirmed prerelease; Windows EXE/MSI,
macOS DMG, and Linux packages all built successfully. The textual tag
`v1.12.0-beta.1` failed only at Windows MSI version validation and is superseded.

**Copy QA complete:** `Special Teams` is capitalized consistently in the
redesigned prototype and opt-in production Study unit selector; the Study harness
pins the production label.

**Scout perspective contract (2026-07-12):** Self-scout is the default/primary
workflow and means our own games (our offense, defense, and special teams).
Opponent scout means a future opponent's film versus a third team; that future
opponent is always the analytics subject, so their offense/defense remains
subject-relative. Keep the existing already-played shortcut (our defensive snaps
→ their offense; our offensive snaps → their defense), normalized only at the
query boundary. Future Study cohorts must carry explicit subject-team + scout
mode context rather than trusting `tags.unit` alone. Left/right remains offense
perspective. The prototype labels the choice “Our games · Self-scout” versus
“Opponent film · Scout”; production wiring is not yet complete.

Critical rule: the redesign must **not dumb down analytics**. Existing reports
remain as Advanced Reports until an exact metric + matching-play parity harness
proves Study is equal or better. Implement incrementally behind feature flags;
Break Down initially routes to the current production workspace. **P0-a is
accepted/complete** (`9aa4bb8` + review fixes `eafdf32`): the golden gate pins
measure blocks, report objects, and composite `gameId::playId` drilldowns across
game + season scopes. **P0-b is reviewed/complete**:
`GRIDIRON-IQ-ANALYTICS-INVENTORY.md` maps every current computed block, report,
field-level measure family, filter, 14-dimension Tendency Matrix surface, 21
video predicates, and export/print artifact. **P0-c is accepted/complete**
(`f08692b` + independent review `3c47efc`): `js/analytics-registry.js` registers all compute blocks,
minimum dimensions/measures, canonical splitters/classifiers, and composite
film references. Ambiguous semantics are explicitly `requires-context` and
throw instead of inventing formulas. No production report consumes it yet.
Final P0-c acceptance: registry 23/23 and P0-a synthetic+real clean. P0-d,
Phase 1, and the first Study UI increment have since landed as described below.

**P0-d is ACCEPTED and Phase 1 (the feature-flagged shell + Home) is ACCEPTED /
COMPLETE (`d1121d6`).**
`GRIDIRON-IQ-WORKSPACE-CONTRACT.md` is the canonical route/context/film-health
contract. `js/workspace-context.js` exposes `window.app.workspace` with guarded
Home/Break Down/Study/Plan descriptors, DOM-independent active context, and
backend-derived film health. `js/workspace-shell.js` + `css/workspace-shell.css`
are the Phase-1 shell, gated behind `localStorage ffa_workspace_shell_v2` (opt-in;
**classic remains the default** and is untouched). The shell RELOCATES the intact
`#app` into `#wsClassicOutlet` — it never rebuilds the workspace; Break Down shows
the classic workspace; Phase 1 originally opened Advanced Reports for Study;
Plan is a controlled
coming-soon, Home renders live context + a `filmHealth`-driven film inbox. "Use
classic layout" clears the flag. Codex implemented it (fixing a first-run
null-season bug + Study-overlay containment) then hit its usage limit mid visual-QA;
Claude picked up the uncommitted work, verified it, and finished the initial ship
steps. Codex then completed the final design acceptance and polish: fixed the
duplicated empty-film label, live season counts/grammar, and mobile classic-tab
bleed; empty film also uses a neutral indicator instead of ready-green. QA at
1440x900, 1280x800, 768x1024, and 390x844 found no clipping, overlap, or page
overflow. Focused shell gate **14/14**; full current regression **32/32**,
including parity against the real six-game season; **zero page errors**. The
shell remains opt-in and no release/tag was cut. Next Codex milestone: build the
Phase 2 Study screen over the accepted registry/query/comparison spine while
keeping Advanced Reports one click away.

**Phase 2 Study UI increment 1 is complete (`7f755c6`).** `js/study-screen.js`
and `css/study-screen.css` are the first production consumer of the accepted
analytics spine. The opt-in shell's Study route now provides active-game or
full-season queries, unit filtering, minimum-sample warnings, 15 high-use
dimensions, canonical measures, game-vs-season comparison, reusable local saved
views, and film-linked Watch actions; Advanced Reports remains one click away.
Season Watch opens one owning game at a time because CutupPlayer is game-scoped,
and tells the coach when results span games. Zero-play canonical-cut rows are
suppressed in the UI and summary counts come from unique composite matching refs;
the parity engine is unchanged. Responsive QA is clean on desktop and 390x844.
Focused Study screen 10/10, full suite **33/33**, synthetic + real six-game parity
unchanged, zero page errors. Those increment-1 gaps are addressed by `d76e699`
below; date-range cohorts and true cross-game playback remain. No release/tag.

In parallel (Claude's data lane), the **Phase 2 Study query executor** landed:
`js/study-query.js` (`window.app.study`, `StudyQuery`) is a pure engine over the
P0-c registry — `run({plays, dimension, measures, filters, minSample})` returns
per-group measures + **`matchingPlayIds`**. For report-backed dimensions it
sources film links through the SAME `_buildCutFilter` predicate the reports use,
so a Study query returns the EXACT play set as the old report drilldown.
`tools/e2e-study-query.mjs` gates every group against the committed
parity golden; the synthetic fixture is now shared
(`tools/fixtures/synthetic-edge.mjs`), parity golden unchanged. **Two-cohort
comparison** is wired too — `study.compare({ base, against, dimension, measures,
… })` aligns two play sets (game-vs-season / recent-vs-prior; caller slices, engine
stays pure) into per-row `{ a, b, deltas, sampleDelta }` with BOTH sides
film-linked to their own scope's golden. Test 24/24. The Study screen now consumes
this contract behind the shell flag. Full gate **33/33**. The
Study analytics spine (registry → query → compare) is complete + parity-locked.
**A3 (SqlCatalog canonical cutover) increments 1+2+3 are implemented behind
`ffa_sql_catalog` (default OFF):** `js/catalog-persistence.js` dual-writes `.db`
(canonical) + `season.json` + Documents mirror with a self-healing JSON fallback;
`TauriBackend` delegates load/save/deleteSeason to it and lazy-loads a vendored
`sql-wasm.wasm` Tauri resource (browser bundle stays sql.js-free, 1.5M unchanged).
FAIL-SAFE — any wasm/runtime error silently keeps today's JSON path, so flag-OFF
is byte-identical. Node-tested; full gate 36/36 flag-OFF. Build NOTE: the env bumps
js mtimes between build and test, so run `bash build.sh` and the e2e gate in ONE
command or e2e-parity's stale-bundle guard false-fails.

**A3 DESKTOP SMOKE PASSED on real film (`13f3411`, 2026-07-12).** Claude drove a
from-source `cargo tauri dev` build via computer use on the coach's machine +
real 451-play season: flag-ON `hasSQL:true`/`engineFailed:false` (sql.js WASM
loads in WebView2 with the CSP `'wasm-unsafe-eval'` + `$RESOURCE` scope), no
console warnings, `library.db` created (532KB), real season round-trips from the db
(6 games/451 plays, source:db), throwaway save→load→durable-delete→no-resurrection,
flag-OFF restore intact. **THEN a new catalog fuzzer (`tools/e2e-catalog-fuzzer.mjs`)
caught a P0 the single-save smoke missed: `SqlCatalog` DUPLICATED play rows on every
re-save (2→4→6…)** — `db.export()` resets sql.js's `PRAGMA foreign_keys` OFF so the
cascade-reliant DELETEs orphaned children; fixed by explicit deepest-first child
deletes in save/deleteSeason (`acc130c`), regression-pinned (catalog-persistence
36/36). Release-cycle validation MUST edit/re-save a season, not just open it. See
[[sqljs-fk-cascade-resave-corruption]].

**A3 CODE REVIEW — ACCEPTED (`c76972a`).** Codex found two flag-ON failure-path defects the flag-OFF gate
never exercised; both fixed reproduce-first with failing-first regressions:

1. FIXED — `TauriBackend.saveSeason()` discarded `CatalogPersistence.saveSeason()`'s
   boolean and returned `true`, so a failed canonical db write (json safety copy
   still written) falsely reported success and suppressed SeasonStore's persist
   warning. Now PROPAGATES the canonical result (metadata still advances to match
   the json copy).
2. FIXED — a failed catalog delete could resurrect a season:
   `CatalogPersistence.deleteSeason()` mutated memory, swallowed a writeDb failure,
   returned no status; `TauriBackend.deleteSeason()` deleted json/mirror anyway →
   stale on-disk db + gone safety copies → reopen resurrects. Now `deleteSeason`
   returns durable true/false and, on writeDb failure, closes + reopens the catalog
   from the unchanged on-disk bytes (memory re-synced, no split-brain);
   `TauriBackend.deleteSeason` RETAINS json/mirror/library entry unless the delete
   is durable.
Regressions: `e2e-catalog-persistence` 29/29 + `e2e-catalog-backend` (NEW,
puppeteer fake-`__TAURI__` + injected catalog) 5/5; full gate 34/34 flag-OFF.
Final independent re-review (`7096b1b`): RAM-snapshot rollback and durable-delete
boolean/toast propagation inspected; persistence 29/29, backend 5/5, and
synthetic + real-season parity all green. Claude's full gate remains 34/34. No A3
code/test work remains; the coach flag-ON desktop smoke may proceed.

**Phase 2 Study UI increment 2 is complete (`d76e699`).** Study now exposes 23
ready dimensions, selectable canonical measures, composable filters (OR within,
AND across), game-vs-prior comparison, and full saved-view restore/delete. The
modular-source and committed-bundle browser gates are both 17/17 with clean
desktop/mobile QA; Claude's `218d490` bundle rebuild includes these source
changes. The shell remains opt-in.

**Phase 2 Study UI increment 3 is complete (`f7cc373`).** Study now supports an
inclusive custom date-range scope and date-range-versus-prior comparison. Cohorts
are sliced at the game boundary from explicit `gameInfo.date` values before the
parity-locked query engine runs; undated games stay in full-season scope but are
excluded from date questions. Date boundaries refresh filter values and persist
inside saved views. The rebuilt bundle passes Study 19/19, StudyQuery 24/24,
synthetic + real six-game parity, and the full 34/34 gate. No persistence surface
changed; shell stays opt-in. Next Study contract: true cross-game playback.

**Phase 2 Study cross-game playback is complete (`1fce6b3`, Codex).** A Study
Watch action over season or date-range results now plays every available match in
chronological game order through the existing Breakdown video surface. Claude's
`CrossGameCutup.plan()` remains the pure planning contract; `StudyScreen._watch`
preflights each game's `filmHealth`, awaits `StorageManager.switchToGame()` and
film auto-load, resolves composite planner refs back to the loaded game's native
play IDs, then awaits `CutupPlayer.start()` before advancing. The banner names the
game and `Game X of Y`; missing/unavailable film is skipped with an honest count.
The currently loaded browser game remains playable, but other browser-only games
are not misrepresented as durable. Escape, Exit, route changes, or a replacement
cut-up settle the awaitable CutupPlayer contract as cancelled instead of advancing
silently. Focused gates: cross-game planner 13/13, Study 22/22 (including ordered
two-game playback, deterministic stop/empty results, and unavailable-film skip).
Fresh bundle + every `tools/e2e-*.mjs` harness passed atomically with zero
failures. Shell remains opt-in; no release/tag.

**Independent adversarial review of `1fce6b3` — ACCEPTED (Claude).** No
release-blockers (opt-in shell, Study-only reach); the core decision to reuse the
vetted `switchToGame → auto-load → CutupPlayer.start` per game (no parallel
cross-game film resolver) adds NO new cross-game corruption vector, and
cancellation is dual-guarded (`_watchToken` + not-`completed` return + the
`workspace-shell.js:55` route-change stop). Committed state re-verified green
(cross-game 13/13, study 22/22). Six non-blocking follow-ups, prioritize the first
two before this path goes default-on:
  1. [Med/robustness] `CutupPlayer` ignores the video `ended` event — the
     awaited `start()` promise settles only when time-update reaches `end−0.03`;
     a play whose `timestamp.end` exceeds the real clip length (stale end / the
     `999` unprobed sentinel, which the planner admits) never completes → the
     cross-game loop HANGS on that game. Add an `ended`→advance/stop fallback.
  2. [Med/tests] The new tests mock `cutupPlayer.start` to always return
     `completed:true`, so the two hardest paths are unverified: a non-completed
     mid-reel result (Exit/route-change) must STOP not advance, and `_watchToken`
     supersession (a 2nd Watch cancels the 1st). Add coverage.
  3. [Low/UX] ◀ Prev at a game boundary (`_goTo(-1)`→`stop('stopped')`) settles
     not-completed → ends the WHOLE remaining reel. Clamp prev() at 0.
  4. [Low/side-effect] Each hop `switchToGame`→`commitActive`+`persist`, so a
     read-only season Watch does N−1 disk writes.
  5. [Low/UX] Reel leaves the coach on the last game, not the launch scope.
  6. [Nit] Active-game short-circuit skips a film reload; a ready-but-not-loaded
     active game could start the cutup over a blank/stale player.
Next: hand these to Codex (fixes are Codex's UX lane); then choose the next
Phase 2/3 increment.

**All six review follow-ups are resolved (`47cecc0`, Codex).** `VideoController`
now emits `video-ended` and CutupPlayer advances/completes on it; Previous clamps
at the first play. Study saves the launch game once, uses non-persisting transient
game hops, reloads active-game film, keeps the shell breadcrumb synchronized, and
restores the launch game after completion or cancellation. The regression harness
now exercises native ended completion, Previous clamping, one persist per reel,
active-film reload, launch restoration, cancellation without advancement, and
Watch supersession; Study is 24/24 and the atomic full suite is green with zero
failures. The same commit changes the approved prototype play-strip copy from
`Result · Yardage` to `Result: Yardage` so the separator cannot resemble a minus.
No release/tag; shell remains opt-in.

**Phase 2 Study visual analysis increment is complete (`a115d73`, Codex).**
Canonical Study query results now render three compact KPIs, ranked primary-metric
bars, weighted run/pass composition, and centered positive/negative comparison
deltas above the unchanged exact-play table. Every visual row uses the same row
index and `matchingPlayIds` as the table, so selecting a bar launches the same
film; no analytics formulas were reimplemented. Advanced Reports remains one
click away. Study 26/26, mobile overflow clean, and the fresh atomic full suite
passes with zero failures. Shell remains opt-in; no release/tag.

**Independent adversarial review of `a115d73` — ACCEPTED (Claude).** Presentation
over the parity-locked engine; committed state re-verified green (study 26/26).
FILM-LINK PARITY HOLDS: both table rows and visual bars emit
`data-study-row="${groups.indexOf(group)}"` (ORIGINAL index, not the ranked
position), and the handler resolves `this.rows[index].refs`, so a bar launches the
exact same film as its row — verified in source. One real bug + polish, all
non-blocking (fix #1 before default-on; fixes are Codex's Study/UX lane):
  1. [Med/metric] The weighted Run/Pass KPI —
     `Σ(measures[key]·sampleSize)/max(1,total)` with `total = matching.length`
     (DEDUPED) — INFLATES for MULTI-VALUE dimensions (formation/playType/result/
     defFront/blitz): a play in several groups is counted N× in the numerator, 1×
     in the denominator, so `Σ sampleSize > total` and the KPI can exceed 100%
     (unclamped `_pct`). Table per-group values + the parity engine are unaffected.
     Fix: derive run/pass from the unique matching play set, not sample-weighted
     overlapping shares (weighting is exact only when the dimension partitions).
  2. [Low/UX] Ranking is strict descending raw value labeled "Top {metric}", so a
     lower-is-better measure (Negative Play Rate, TO rate) shows the WORST group as
     "Top"; signed measures (YPP) draw a positive-width bar for negative values.
     Polarity-aware label/color, or rename "Highest".
  3. [Low/a11y] Visual bar buttons' accessible name is just "Wing-T 48%" with no
     hint they play film — add `aria-label="Watch {group} film"` and `aria-hidden`
     the decorative bar `<i>`. Delta sign is textual (not color-only) — good.
Delta direction/scaling correct (abs/max·50 centered vs query abs/max·100), sign→
color consistent with the table. No parity break, no engine change.

**All visual Study review findings are resolved (`0064c1a`, Codex).** Run/pass
now derives from the unique composite matching-ref set and canonical `runPass`
dimension, so multi-value groups cannot inflate the KPI. Ranking copy is neutral
`Highest`; comparison favorability understands lower-is-better Negative Play Rate
and Turnovers while preserving the mathematical sign/side. Film bars now announce
`Watch {group} film`, decorative bars are hidden from assistive technology, and
KPI labels are more readable. Focused Study 26/26 and the final atomic full suite
are green. The rebuilt bundle also includes Claude's dormant Phase 3 `plans:[]`
contract. Next: Plan UI + Save Study finding to Plan.

**Phase 3 Plan foundation — step 1 (`64c284f`, Claude): backward-compatible
`plans:[]` data contract.** `SeasonStore` gains a SEASON-level `data.plans` array —
a game-plan workspace that collects Study findings + composite `gameId::playId`
film refs (same identity Study/CrossGameCutup use, so a plan item plays through the
proven cross-game path). Additive: a pre-contract season has no `plans` key;
`_normalize` defaults it to `[]` and touches nothing else; it rides through
saveSeason / SqlCatalog `body_json` / the JSON mirror with NO persistence change.
Defensive normalizer preserves unknown/future keys (shape grows without a
migration), fills ids/timestamps, coerces refs to strings, filters junk. One
mutation seam (`createPlan/renamePlan/setPlanNotes/addPlanItem/removePlanItem/
deletePlan`) keeps the shape normalized. NOTHING consumes plans yet. Tests:
`e2e-plan-contract` 22/22; real data path unaffected — integrity fuzzer 0
violations, sql-catalog 10/10, onboarding 46/46. **Bundle rebuild deferred** (Codex
had uncommitted study-screen fixes in-tree; plans is dormant so the bundle is
unaffected — it rides in on the next legit build). NEXT: the Plan UI + a "save this
Study finding to a plan" action, then Watch-a-plan through the cross-game player.

**Phase 3 Plan UI + Study integration is complete (`affd78f`, Codex).** Claude's
pure `StudyPlan` adapter (13/13) is now wired with a dedicated responsive
`PlanScreen`. Study can save its current exact composite-ref result set into the
active season plan; Plan supports create/select/rename, staff notes, item removal,
item Watch, and whole-plan Watch through the proven cross-game Study player. Every
mutation uses the `SeasonStore` plan seam and persists immediately. The former
Plan placeholder is gone. Focused gates: plan contract 22/22, StudyPlan 13/13,
combined Study/Plan browser workflow 32/32 including mobile overflow; final fresh
bundle + every e2e harness passed atomically. Shell remains opt-in; no release/tag.
Next: Claude independently reviews `affd78f`, then Phase 3 ordering/presentation/
export can be scoped.

**Plan pre-review hardening (`bb37a1d`, Codex):** mobile visual QA was clean and
found one destructive-action gap: deleting a plan was immediate. It now uses the
app's in-product confirmation dialog with plan name/item count; cancel retains the
plan and confirm deletes it. Regression raises the combined Study/Plan browser
workflow to 33/33; the final atomic full suite is green. Claude should review
`affd78f..bb37a1d` as one Phase 3 milestone.

**Independent review of `affd78f..bb37a1d` — ACCEPTED (Claude).** Phase 3 step 2 is
a clean foundation; committed state re-verified green (study-plan 13/13,
plan-contract 22/22, combined Study/Plan 33/33). FILM-LINK PARITY HOLDS: a saved
finding's refs = the union of the Study result's composite `matchingPlayIds`, and
both per-item and whole-plan Watch (`StudyPlan.planRefs`) route through the SAME
vetted `studyScreen._watch` cross-game player — a plan plays the exact film the
Study result did, no new resolver. All plan mutations go through the normalized
`SeasonStore` seam + persist; name/notes/label/kind/id are XSS-escaped at every
sink (matters — they travel in importable seasons); delete is confirm-gated
(`bb37a1d`). Plan Watch inherits the cross-game player fixes from `47cecc0`. Three
non-blocking follow-ups (Codex's UX lane):
  1. [Low] `PlanScreen.ensurePlan()`/create deref `createPlan(...).id`, but
     `SeasonStore.createPlan` returns null with no season open → throws. Hard to
     reach (Plan route needs a season; `_saveToPlan` early-returns on empty refs)
     but warrants a cheap guard.
  2. [Low/UX] "Save to Plan" always appends to the active/first plan (auto-creating
     "Game Plan") — no plan picker at save time.
  3. [Low/UX] A comparison finding saves only one cohort's refs (labeled
     "comparison").
Phase 3 foundation (plans contract + Study→Plan + Plan workspace + cross-game
Watch) is complete and accepted. Next: Phase 3 ordering/presentation/export.

**Save-to-Plan destination picker is ready for independent review (`fa14dc0`,
Codex).** Study no longer silently appends to the active/first plan. `Save to
Plan` opens a focused native dialog that previews the exact finding and linked-
play count, defaults to the active existing plan when valid, always offers
`Create new plan`, and requires an explicit `Save finding`. Cancel/Escape mutate
nothing. `PlanScreen.addFindingTo(planId, item)` is the exact-target mutation
seam; it refuses missing plan ids, preserves the StudyPlan item/composite refs,
sets that plan active, persists, and renders. Desktop visual QA is clean; mobile
is overflow-free with touch-ready controls. `e2e-study-screen` is 48/48 and pins
no-mutation-before-confirm, cancel no-op, named-plan creation, exact existing-
plan targeting, unchanged composite refs, keyboard-capable dialog semantics, and
mobile layout. Fresh bundle + all 41 `tools/e2e-*.mjs` scripts passed. Shell
remains opt-in; no release/tag. **Review focus:** exact target selection,
create-then-save failure behavior, native-dialog keyboard/focus behavior, and
film-ref parity. After acceptance, the next product increment is explicit
comparison-cohort selection when saving a comparison finding.

**Independent review of `fa14dc0` — ACCEPTED, no findings (Claude).** Verified in
an isolated `git worktree` (a concurrent uncommitted comparison-cohort WIP was
sitting in the shared tree, so review ran there instead of touching it). Confirmed
the committed bundle is BYTE-IDENTICAL to a fresh rebuild. Full gate green: all 41
`tools/e2e-*.mjs` scripts pass (0 failures; `e2e-realdata.mjs`'s real-season
diagnostic shows "✓ all views ok" on every game), `e2e-study-screen` independently
re-run at 48/48. All four requested focus areas verified against source:
  - EXACT TARGET SELECTION — `_confirmPlanPicker` resolves `getPlan(target)` /
    `createPlan(name)` then routes through `addFindingTo(plan.id, item)`; a
    stale/missing target resolves to `null` and fails closed with a toast, never
    silently falling back to the active/first plan (the exact gap this fixes).
  - CREATE-THEN-SAVE FAILURE — traced: if `createPlan` returns `null` (no season
    open), `plan` stays falsy through the `addFindingTo` call and the code
    correctly reaches the `!plan` toast branch, no crash, no partial write.
  - NATIVE-DIALOG KEYBOARD/FOCUS — real `<dialog>` + `showModal()`; Escape fires
    the native `cancel` event, `preventDefault()`+`_closePlanPicker()` mutates
    nothing; initial focus goes to the name field (new plan) or destination
    select (existing), matching the dialog's default action; reopening always
    closes any stale dialog first (no accumulation).
  - FILM-REF PARITY — `item.refs` is built once in `_saveToPlan` and passed
    unchanged through the picker to `addPlanItem`; test asserts the saved item's
    refs are byte-identical to the pre-picker set.
Minor nit (non-blocking): `PlanScreen.addFinding()` (the pre-picker single-target
method) is now dead code — no remaining callers after the switch to
`addFindingTo`. Fine to remove opportunistically, not urgent.

Note: `583ca2f`/`41dbe13` (explicit comparison-cohort save) shipped on top of
this; see the standalone review below (reviewed alone per the coach's direction,
not paired with `fa14dc0`).

**Accepted-review cleanup (`a0ece49`, Codex).** Claude found no correctness
errors in `fa14dc0`; its sole non-blocking note was that the pre-picker implicit
`PlanScreen.addFinding()` method was dead. Removed it and its now-dead
`ensurePlan()` helper, leaving `addFindingTo(planId, item)` as the only Study UI
mutation path. The no-season regression now pins that exact-target API. Focused
Study/Plan gates remain green and the rebuilt bundle passed all 41 e2e scripts.
This closes the `fa14dc0` review completely. `583ca2f` comparison-cohort
selection was subsequently accepted at `6a68064`; the full Study-to-Plan save
milestone is now closed.

**Explicit comparison-cohort save shipped (`583ca2f`, Claude).** The prior
comparison save behavior was semantically mixed: it attached the primary cohort
for groups where that side existed, then silently fell back to comparison film
for groups missing on the primary side. Study now retains parity-derived ref
sets for each side and their de-duplicated union. The Save-to-Plan dialog shows
`Film to attach` only for comparison queries, with the real cohort labels and
play counts: primary, comparison, or both. Non-comparison saves remain the same
compact dialog. `StudyPlan.finding()` now preserves `query.compare` and
`query.cohort`, while `refs` are exactly the chosen composite `gameId::playId`
set. One-day ranges use a concise single-date label. Visual QA is clean; focused
gates: StudyPlan 14/14, Study/Plan 49/49, Plan export 15/15, Plan contract 32/32;
fresh bundle + all 41 e2e scripts green. (Commit message carries no co-author
trailer — this is Claude's commit, not Codex's; corrected here from the original
misattribution above.)

**Independent review of `583ca2f` — ACCEPTED, no findings (Claude).** Reviewed
standalone per the coach's direction (not paired with `fa14dc0`, which already
closed cleanly above). Hand-traced the full diff against source across all six
requested focus areas:
  - DESTINATION CORRECTNESS — unchanged from the already-accepted `fa14dc0`
    picker seam: `_confirmPlanPicker` still resolves `getPlan(target)`/
    `createPlan(name)` then routes through `addFindingTo(plan.id, choice.item)`;
    583ca2f only changes WHICH item is chosen, never how the destination plan
    is resolved.
  - COHORT PARITY (base/against/both) — `_saveCohorts` builds three real ref
    sets for a comparison query: `base`/`against` from each side's own
    parity-derived `matchingPlayIds`, and `both` as a true de-duplicated union
    (`[...new Set([...aRefs, ...bRefs])]`) — not a naive concat, so a play
    present on both sides is never double-counted in `both`'s displayed count
    or in the saved `refs` array.
  - EMPTY-SIDE BEHAVIOR — `_saveToPlan()` filters out any cohort with zero refs
    before building the picker's item list, so a comparison where one side has
    no matching plays never offers a dead "0 plays" choice; if only one cohort
    survives the filter, `_openPlanPicker` collapses to the same single-item
    compact dialog non-comparison saves use (`items.length > 1` gate on the
    `Film to attach` select) — no picker regression for the common case.
  - QUERY METADATA COMPATIBILITY — `StudyPlan.finding()`'s new `query.compare`/
    `query.cohort` fields are additive; a non-comparison finding still omits
    them exactly as before (verified against `e2e-study-plan.mjs`'s round-trip
    assertions), so existing plan items and `PlanExport`/presentation consumers
    that don't know about cohorts are unaffected.
  - DIALOG KEYBOARD/FOCUS — reuses the same native `<dialog>`/`showModal()`
    seam from `fa14dc0`; `_confirmPlanPicker` guards `if (!dialog || !choice)
    return;`, and `_selectedPlanChoice()` falls back to `_pendingPlanItems[0]`
    (defaults to `base`) when nothing is explicitly selected, so Enter/default
    submission on first open always has a valid, sensible choice.
  - CREATE/SAVE FAILURE HANDLING — unchanged failure path from `fa14dc0`: a
    `createPlan` that returns `null` (no season open) still fails the `!plan`
    check before any `addFindingTo` call, no crash, no partial write.
No blocking issues found. Full e2e gate green (all 41 `tools/e2e-*.mjs`
scripts, including `e2e-study-plan.mjs` 13/13 and `e2e-study-screen.mjs` 48/48
covering the simple picker, comparison base/against/both selection, and
picker-reopens-to-base-default cases). Shell remains opt-in; no release/tag.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

**Phase 3 ordering — data seam (`70ad55c`, Claude): plan-item reorder on
SeasonStore.** The foundation ordering/presentation/export all need (both render
items IN ORDER). `reorderPlanItems(planId, orderedIds)` applies an explicit order
(the drag seam) DEFENSIVELY — unknown/dup ids ignored, any item not named keeps its
relative order and is appended, and it refuses to change the item count, so a
partial/stale id list can never drop an item; `movePlanItem(planId, itemId, ±1)` is
the accessible up/down move. One normalized path, bumps updatedAt, caller persists.
Additive + DORMANT (nothing calls them yet; the Plan UI wires drag/buttons).
`e2e-plan-contract` 31/31; integrity fuzzer 0 violations; bundle rebuilt (only my
dormant change in-tree). LANE SPLIT for this milestone — Claude (data): reorder seam
[done] + a pure plan-export serializer [done]; Codex (UI): drag handles,
presentation/teaching full-screen view, export button/layout.

**Phase 3 export — data seam (`2ec15fa`, Claude): pure plan-export serializer.**
`js/plan-export.js` — `PlanExport.build(plan, games)` resolves a plan into an
ORDERED, film-linked structure (items in plan order, each composite `gameId::playId`
ref resolved to its game + situation + play context; missing film flagged, not
dropped); `PlanExport.html(exp)` renders a standalone printable doc that ESCAPES
every coach-entered string (name/notes/labels/play notes — stored-XSS boundary).
Presentation view + printed export consume the SAME `build()` structure so they
can't drift. PURE + UNWIRED (not in build.sh; imported by nothing) — Codex adds the
one build.sh line + wires the Export/Print button + presentation view. Tests:
`e2e-plan-export` 14/14. Both my data seams for this milestone (reorder + export)
are done and dormant; Codex's UI (drag handles, presentation full-screen, export
button) is the remaining Phase 3 work.

**Phase 3 ordering/presentation/export UI is complete (`905231e`, Codex).** Wires
both dormant data seams: drag handles + accessible up/down buttons call
`reorderPlanItems`/`movePlanItem`; a full-screen presentation/teaching view and an
Export/Print (downloadable standalone HTML) both consume the same
`PlanExport.build()` structure so on-screen order and the printed doc can't drift.
Adds a plan `audience` field (staff/players/all) surfaced in presentation + export.
`workspace-context.js` route target flips `plan` from `coming-soon` to
`plan-workspace`. `js/plan-export.js` added to `build.sh`.

**Independent review of `905231e` — ACCEPTED, no findings (Claude).** Verified
against source line-by-line + confirmed the committed bundle is BYTE-IDENTICAL to a
fresh `build.sh` rebuild. Full gate re-run green: plan-contract 32/32, plan-export
15/15, study-plan 13/13, study-screen 42/42, workspace-context 20/20, workspace-shell
15/15, integrity fuzzer 0 violations, onboarding 46/46 zero errors. Confirmed my
prior follow-up (#1, null-season `createPlan` deref) is fixed — `ensurePlan`/
`addFinding` now guard and return `null`, pinned by a new "fails closed when no
season is open" test. `_resolveRef` now surfaces a malformed ref as an explicit
`invalid` marker instead of silently vanishing (a real honesty improvement).
Reorder is a true no-op on an unchanged order (no needless persist); drag-drop onto
itself resolves to a safe no-op. Presentation + export share one resolved structure
(film-link parity holds); every interpolated string is escaped. The new
capture-phase Escape/arrow listener only engages while presenting and can't fight
`CutupPlayer`'s own shortcut handling (every in-presentation watch path closes
presentation first). Mobile presentation is full-screen with ≥44px touch targets
and no page overflow. Phase 3 (contract → Study→Plan → ordering → presentation →
export) is now fully accepted end to end. Shell remains opt-in; no release/tag.

**Phase 3 ordering + presentation + export is implementation-complete
(`905231e`, Codex; independent review pending).** The dormant seams from
`70ad55c` and `2ec15fa` are now wired into the opt-in Plan workspace: desktop
drag reorder plus explicit keyboard/touch Move up/down controls, plan-level
audience (`staff` / `players` / `all`), full-screen teaching mode, exact-ref
Watch from presented rows/items, and a standalone printable HTML download. The
screen and export both consume `PlanExport.build()`, so item/ref order and missing
film cannot drift. Codex's adversarial serializer review fixed one accounting gap
before wiring: malformed legacy refs are now visibly missing instead of counting
in `refCount` and silently disappearing. Also fixed the accepted low no-season
follow-up (`ensurePlan`/`addFinding` fail closed), replaced the stale
`coming-soon` workspace target with `plan-workspace`, and pinned the live route.
Visual QA is clean at 1280x800 and 390x844; mobile presentation has no horizontal
overflow and 44px navigation targets. Focused gates: plan contract 32/32,
serializer 15/15, StudyPlan 13/13, combined Study/Plan 42/42. Final atomic fresh
build + every `tools/e2e-*.mjs` harness passed twice, including synthetic + real
six-game parity/integrity and zero page errors. Classic remains default; no
release/tag. **Next:** Claude independently reviews `905231e` for ordering
persistence, presentation/ref parity, export/XSS/accounting, mobile/a11y, and
backward compatibility. Known low UX follow-ups remain: Study saves to the
active/first plan without a picker, and comparison findings still save one
cohort's refs.

**A3 restore-ring migration is complete (`0fc9ee4`, flag-gated).** Restore points
now persist as ROWS in the shared `library.db` (`SqlCatalog.backups`, pruned to
RETENTION 25) instead of per-season `backups/season_<ts>.json` files — the next
slice of the DoD move OFF the per-season-JSON file structure. `CatalogPersistence`
exposes the catalog backup ring (`createBackup/listBackups/getBackup/deleteBackup`,
db bytes re-exported on every mutation, all best-effort so a lost restore point
never blocks a save); `TauriBackend` delegates to it when `ffa_sql_catalog` is ON,
routing get/delete by id shape and MERGING the db ring with any legacy backup JSON
files so flipping the flag never hides older restore points. **Flag-OFF is
byte-identical** (delegation only runs when `_ensureCatalog()` returns a catalog).
Tests: `e2e-catalog-persistence` 44/44 (create/list/get/delete + per-season
isolation + reopen-durability + prune-to-25), `e2e-catalog-backend` 6/6 (flag-ON
delegation path), sql-catalog 10/10, sql-fuzzer 16, catalog-fuzzer clean,
onboarding 46/46 zero errors. No release/tag.

**Version-history ring groundwork is done (`236dddd`, DORMANT).** The migration
off localStorage `ffa_versions_<season::game>`: `SqlCatalog` gains a `versions`
table + save/list/get/delete/prune keyed by (season_id, game_id), capped VMAX(20)
per game, evicting AUTO-saves before MANUAL (VersionManager's eviction rule);
`CatalogPersistence` adds best-effort passthroughs. **NOT wired into
`version-manager.js`** — dormant like the SqlCatalog A1 work; the UI rewire off
localStorage lands later with the coach. Flag-OFF + browser bundle unaffected
(desktop-only, not in build.sh). `e2e-catalog-versions` 10/10; full catalog suite
still green. NEXT in this lane (needs coach, real code change): rewire
`VersionManager` to read/write through this ring when `ffa_sql_catalog` is ON.

**Independent review of `713324e` + `e08ea6a` — ACCEPTED, no findings (Claude).**
Reviewed against source: matching correctness, cancellation safety, and accidental
play creation, as requested. Both `addFiles`/`_relinkSavedPlays` and
`rehydrateFromDisk` now share ONE tested `planClipMatch` policy (path → basename →
Windows `(n)` → order) instead of two divergent hand-rolled matchers — closes the
exact gap flagged in [[windows-dup-rename-ghost-plays]]. Traced that re-running the
matcher on a coach-narrowed subset (the "matched only" choice) can never swap a
play's clip assignment: order-tier only fires on strict full-set equality, so a
subset recompute can't hit a different tier for an already-matched candidate.
CANCELLATION: both dialogs (live-dup relink + the new ghost-prevention prompt)
resolve BEFORE any mutation — file relink, clip creation, and `_autoCreatePlays`
all happen strictly after; Cancel is a verified true no-op (pinned test). ACCIDENTAL
CREATION: `_autoCreatePlays` only ever sees the coach-accepted subset now — no
silent ghost path remains. BONUS: confirmed `e08ea6a`'s `rehydrateFromDisk` calling
`reset()` first fixes a SEPARATE real bug — it's called on every linked-game
auto-load (3 call sites), and previously never cleared `this.clips`, so reopening/
reloading the same linked game within a session would accumulate duplicate clip
objects (a second mechanism behind the coach's duplicate-film report, distinct from
the ghost-play path); scenario 5 in `e2e-relink-linked` pins the fix directly.
Committed bundle re-verified BYTE-IDENTICAL to a fresh `build.sh` rebuild. Full
relevant gate green: clip-match 14/14, relink-legacy 7/7, relink-linked 8/8,
integrity fuzzer 0 violations, onboarding 46/46, film-room 60/60, zero errors.

**Ghost-plays fallback fix (`713324e`) — ACCEPTED, see review above.** The coach's
"repair film adds duplicate/ghost plays" report was diagnosed: **Repair Film** is
safe (3-tier match path→name→order, bails on any unmatched play), but **Add Clips /
re-add a folder** (`playlist-manager.js` `addFiles`→`_relinkSavedPlays`→
`_autoCreatePlays`) previously auto-created a whole-clip play for any clip that
failed to relink → orphaned tagged play + duplicate untagged play (the v1.10.7
class). `PlaylistManager.addFiles` now uses the pure `planClipMatch` fallback
(path → basename → Windows `(n)` normalization → wholesale-rename order) BEFORE
any mutation or copy. If orphaned tagged plays exist and selected files remain
unmatched, the coach must choose matched-only, explicitly add as new plays, or
cancel. Partial exact matches never order-pair unrelated leftovers. Multiple
marked plays sharing a stale clip id follow their primary clip. Failing-first
`e2e-relink-legacy` 7/7; clip matcher 14/14; managed, linked, reopen, race, and
real six-game + synthetic integrity gates green. R5's real-desktop smoke passed
on 2026-07-13 (details below). Durable catalog `clip_id` authority (R1/R2)
remains future work; this is the safe legacy fallback, not that cutover.

**Linked rehydrate follow-up (`e08ea6a`) — ACCEPTED, see review above.** An
adversarial R5 pass found `rehydrateFromDisk` still had its own exact/base matcher:
linked Windows `(1)` copies stayed unassigned, and secondary marked regions sharing
the primary's stale clip id could not play. It now uses `planClipMatch`, collapses
one primary per stale clip id, and propagates the new live id to every marked
region without creating/deleting plays. Failing-first `e2e-relink-linked` moved
5/8 → 8/8; rehydrate is also an atomic playlist replacement, so switching a
loaded game from managed to linked cannot append duplicate live clips. Managed
re-add, repair, and pure matcher regressions remain green.

**R5 REAL-DESKTOP FILM SMOKE — PASSED (2026-07-13, Codex led).** Built the
current Tauri debug app from source and used a disposable `R5 Disposable Smoke`
season plus read-only copies of local film. A managed single file created one
play; a managed three-clip folder created three plays, including duplicate
`0001.MOV` basenames in separate subfolders; and a linked three-clip folder
created three plays without copying. Distinct formation sentinels were saved on
all seven plays. After a full app close/relaunch, every game auto-loaded playable
film with the same play counts and tags; repeated linked-game switches remained
exactly three clips (no accumulation). The real six-game season was not edited.
The smoke exposed one presentation-only defect: a newly linked playlist showed
`0 clips` until reopen even though all three clips were live. `_autoCreatePlays`
now refreshes the indicator and count; `e2e-clip-identity` pins the linked-style
direct-asset path. Verification: clip-identity 19/19, relink-legacy 7/7,
relink-linked 8/8, integrity 0 violations over the real six-game fixture,
onboarding 46/46, Film Room 60/60, and zero page errors. R5 is complete.

**R1/R2 DURABLE CLIP IDENTITY — CODE COMPLETE, AWAITING INDEPENDENT REVIEW
(2026-07-13, Codex).** SqlCatalog schema v2 adds authoritative `clips.clip_id`
and `plays.catalog_clip_id`; the JS/JSON model carries this as `catalogClipId`
so the existing numeric `play.clipId` can remain a transient live-playlist handle.
Legacy flag-on data is upgraded in place: existing clipRefs receive deterministic
stable IDs, missing clip rows are synthesized from play references, duplicate
imported IDs are repaired without orphaning plays, and the dual-written JSON gets
the same upgraded object. Catalog load reattaches IDs from normalized rows rather
than trusting stale body JSON. Managed and linked auto-load map disk files back to
saved clipRefs, then `planClipMatch` uses catalog identity before exact path,
basename, Windows `(n)`, or order fallbacks. New imports receive UUID-backed IDs;
repair/relink propagate them without changing tags or play IDs. The catalog flag
remains OFF by default and all legacy fallback tiers remain active. Verification:
fresh bundle plus every `tools/e2e-*.mjs` harness green; SQL catalog 16/16,
catalog persistence 44/44, catalog fuzzer 640 ops, SQL fuzzer 16 campaigns,
clip matcher 15/15, linked rehydrate 8/8, real 451-play round-trip/integrity clean,
and zero page errors. Review focus: migration idempotence, duplicate-ID repair,
catalog-vs-path precedence, and managed/linked disk-file annotation.

**Independent review of `4d0d6be` — ACCEPTED, no findings (Claude).** Verified
against source with hand-traced algorithm walkthroughs (not just the tests) across
all four requested focus areas:
  - MIGRATION IDEMPOTENCE — `ensureClipIdentities()` reuses an already-valid
    `catalogClipId` verbatim on repeat `saveSeason()` calls rather than
    regenerating; a play's short-circuit check correctly no-ops once its id is
    valid. Confirmed by the new "durable clip ids remain stable across reopen and
    re-save" test.
  - DUPLICATE-ID REPAIR — hand-traced the exact repair fixture (two distinct clips
    forced to share one id): the ref-dedup pass gives them distinct ids, then the
    PLAY backfill pass re-resolves each play by its own path-derived key (not the
    stale forced id), so one play stays put and the other is correctly repointed
    to its real clip — no cross-wiring, no orphaning.
  - CATALOG-VS-PATH PRECEDENCE — confirmed in source that `planClipMatch` registers
    the `catalog` tier before path/basename/norm/order; the new adversarial test
    (catalog ids and filenames actively disagree) proves catalog wins.
  - MANAGED/LINKED DISK-FILE ANNOTATION — `storage.js`'s `_catalogClipIdsForFiles()`
    is a legitimate two-phase bootstrap: fresh disk files (no id yet) are matched to
    saved `clipRefs` via the same legacy filename tiers (no regression vs.
    pre-catalog behavior), THEN annotated before `rehydrateFromDisk`'s own
    catalog-first match runs against `play.catalogClipId` from prior sessions.
Non-blocking observation: because the bootstrap step only has filename tiers
available, a wrong first-ever match could become "sticky" under catalog-tier
precedence going forward (vs. the old system occasionally self-correcting
run-to-run) — same rare trigger conditions as before, not worse in kind, just
potentially more persistent; worth recalling if a "stuck-wrong-clip" report ever
surfaces. Committed bundle re-verified BYTE-IDENTICAL to a fresh `build.sh`
rebuild. Full gate re-run green: sql-catalog 16/16 (incl. real 451-play
round-trip), catalog-persistence 44/44, catalog-fuzzer 640 ops clean, clip-match
15/15, relink-legacy 7/7, relink-linked 8/8, integrity fuzzer against the REAL St.
Joseph Mavericks fixture (not synthetic) 0 violations, onboarding 46/46 zero
errors. Flag remains OFF by default.

### ▶ REVIEW FOCUS (for a fresh code review — current risk surface, Jul 2026)

The last few releases reworked **film storage reliability**. What a reviewer
should scrutinize, highest-risk first:

1. **Film-index model (`storage.js` `_serialize` / `_buildClipIndex`).** v1.10.7
   root-cause fix: the game film index is now derived from the PLAYS' durable
   `clipPath`/`clipName` UNIONed with the live playlist, so it can't be wiped by
   opening a film-less game. Verify it never shrinks below what plays reference,
   and round-trips (`tools/e2e-film-index.mjs`).
2. **Clip identity / relink (`playlist-manager.js` `_relinkSavedPlays`,
   `_fileIdentity`).** Basename-fallback pass added so folder re-adds relink 1:1
   instead of duplicating. Two same-basename clips in different subfolders must
   stay distinct (Pass-1 exact path) while a legacy basename-only game still
   relinks (Pass-2). Tests: `e2e-clip-identity.mjs`, `e2e-relink-legacy.mjs`.
3. **Linked film library (v1.11.0, desktop only) — NEWEST, least battle-tested.**
   `TauriBackend` linked methods + `storage.js` `_autoLoadLinkedFilm`/
   `linkFilmFolder` + Rust `allow_library_dir`. Clips are referenced in the
   coach's own folder (no copy). The end-to-end path (dialog → `fs.readDir` on an
   arbitrary drive → `convertFileSrc` → asset protocol playback) is validated on
   the desktop build, NOT the headless harness. Scrutinize: scope/security of
   `asset_protocol_scope().allow_directory` on a user-chosen root; path
   resolution (`relToRoot`, `linkedGameDir`); that managed film is truly
   untouched. Only pure `relToRoot` is unit-tested (`e2e-linked-film.mjs`).
4. **SQLite foundation (`sql-catalog.js`) — NOT user-wired.** Decompose/reassemble
   a season losslessly; clips first-class. Tested in Node (`e2e-sql-catalog.mjs`,
   `e2e-sql-fuzzer.mjs`). Not yet behind the storage seam — review the schema +
   round-trip design, not integration.
5. **Cross-game data integrity** remains the perennial danger zone (lessons
   #19–#21): `commitActive` guard, per-game history reset, season-switch autosave
   race. `tools/e2e-integrity.mjs` fuzzes it.

Build/verify: `bash build.sh && node tools/e2e-*.mjs` (all green). Desktop Rust:
`cargo check --manifest-path src-tauri/Cargo.toml` (needs `$HOME/.cargo/bin` on
PATH; local rustup + VS Build Tools 2026 installed this session).

> **State (v1.11.4):** two independent review passes (Claude + Codex) drove
> v1.11.2→v1.11.4. The cross-game corruption class is now closed at the ROOT
> (async play-creation is synchronous — see v1.11.2/v1.11.4), all coach-facing
> film-reliability P1s are fixed, and the Medium/nit tier is cleared. Deferred
> into the SQLite/library epic (they rework the persistence layer A3 rebuilds):
> diskStatus honesty, Tauri `listBackups` meta, version-manager/backup-ring
> consolidation, backend base-class dedup, and a load-time GC for orphaned film.

### v1.11.4 - Re-review fixes (shipped; tag `v1.11.4`)

Codex's independent full re-review of v1.11.3 found four second-order issues; all
fixed + verified (full gate green, integrity 16/16 under parallel load, cargo check).

- **[P1] addFiles race — ROOT fix (supersedes the v1.11.2 guard).** v1.11.2 stopped
  the cross-game leak by *aborting* play creation on a mid-probe game switch — but
  that could ORPHAN already-copied film (clips on disk, no plays). `_autoCreatePlays`
  now creates plays **synchronously** (no `await` between decide + push), then
  backfills durations in the background (`_backfillDurations`). No race window at
  all: the add always lands in its own game, never leaks, never orphans. Guard +
  `boundPlays` removed. `e2e-addfiles-race.mjs` now also asserts the add is KEPT
  (`aHasRaceclip`), which Codex flagged was computed-but-unasserted.
- **[P2] Desktop CSP blocked the local CV server.** `connect-src` lacked the
  backend address, so the optional YOLO server (`127.0.0.1:8765`) was CSP-blocked
  in the installed app. Added `http://127.0.0.1:* http://localhost:*` (port-
  wildcarded for the configurable `ffa_backend_url`).
- **[P2] Deleted film could orphan on app close.** The delete tombstone only
  purged on a NEXT delete / season-leave — deleting one game then closing the app
  leaked the film dir forever. Added an undo-window **timer**
  (`_filmPurgeTimer`, `UNDO_FILM_WINDOW_MS` 30s) that purges on its own; undo
  cancels it. (Belt-and-braces load-time GC deferred to the storage epic.)
- **[P2] Cancel Scan didn't abort in-flight analyze requests.** `BackendClient.
  cancel()` / `VisionAnalyzer.cancel()` (abort the stashed AbortController) are now
  wired to the Cancel button, so a hung request stops immediately instead of
  waiting out its timeout.

### v1.11.3 - Medium + nit cleanup (shipped; tag `v1.11.3`)

Cleared the quality tier of the combined Claude+Codex inventory (no behavior-
critical bugs). BrowserBackend caches the IndexedDB connection; linked+managed film
auto-load resolve clip URLs in parallel; analyze requests are timeout+cancelable;
cutup `_waitForReady` has a timeout; `_touchMeta` no longer clobbers a user-set
library name; version-manager snapshot ids are monotonic; report titles escape;
three unguarded `addEventListener` sites guarded; media-error log → `warn`; `[FFA]`
debug logs stripped; `history-manager._record` + `sql-catalog.createSeason`
simplified. Deferred/intentional-non-changes noted in the state block above.

### v1.11.2 - Integrity race + film-reliability P1s + escaping (shipped; tag `v1.11.2`)

Two independent reviews (Claude exhaustive + Codex full pass) combined into one
inventory; all P1/High fixed. **The integrity fuzzer's intermittent failure was a
REAL cross-game data-corruption bug, not flakiness** (fixed seeds + intermittent =
timing; reproduced under 4× parallel CPU load — see [[integrity-fuzzer-load-race]]):
`PlaylistManager.addFiles` ran `_autoCreatePlays()` un-awaited, and its late push
landed a new clip's play in the WRONG game after a switch (v1.11.4 then made
creation synchronous as the durable fix). Plus: Playlist "Add Clips" persists via an
`onFilmFiles` hook; managed import/repair clears a stale `filmMode:'linked'`;
`gameFromLegacy` carries `clipPaths/clipRefs/filmMode/filmDir`; `rehydrateFromDisk`
basename index (linked relink survives a root mismatch); delete-game tombstones the
film so undo restores it; linked auto-load only re-grants fs scope to consented
folders (`TauriBackend.isDirAllowed` — imported season can't widen scope); stats-
engine + play-tagger stored-XSS escaped (~22 sinks); `exportCsv` escapes every cell
+ formula guard, `importPlaysFromText` handles doubled `""`. 7 new e2e regressions.

### v1.11.1 - Linked film persistence fix (shipped; tag `v1.11.1`)

Whole-package code-review catch: `_serialize()` doesn't emit `filmMode`/`filmDir`,
so `linkFilmFolder`'s own `commitActive()` dropped them and **linked film didn't
survive a reopen** (v1.11.0 was broken on that path). Fix: `SeasonStore.
updateActiveGame` carries `filmMode`/`filmDir` forward like `status`. Regression:
`tools/e2e-linked-film.mjs` now asserts they persist through a commit. (Lesson:
even a desktop-only feature has a persistence layer that IS Node/harness-testable —
test it, not just the pure helpers.)

### v1.11.0 - Linked Film Library + local Rust verification (shipped; tag `v1.11.0`)

Coaches can now point GridIron IQ at their **own** film folder and have the
desktop app **reference + play clips in place — no copy into AppData** (the
WMP/Plex model). Additive: existing managed film (copied into $APPDATA) is
untouched; linked mode only applies to games explicitly linked.

- **Rust (`src-tauri/src/main.rs`):** new `allow_library_dir(path)` command grants
  the WebView asset protocol + fs plugin runtime access to a coach-chosen folder
  (`asset_protocol_scope().allow_directory` + `fs_scope().allow_directory`).
  `Cargo.toml` now lists the `protocol-asset` feature explicitly (required for the
  scope API; `tauri build` was auto-injecting it, so plain `cargo check` failed
  without it).
- **`TauriBackend` (storage-backend.js):** linked layer — `getLibraryRoot`/
  `setLibraryRoot` (localStorage `ffa_film_library_root`), `allowLibraryDir`
  (invokes the Rust cmd), `pickFolder` (native dialog), `listLinkedFilm(absDir)`,
  `linkedFilmUrl(absPath)` (convertFileSrc), `linkedGameDir`, `relToRoot`
  (pure, tested). Managed `importFilm`/`filmUrl` untouched.
- **`StorageManager` (storage.js):** `_autoLoadFilm` branches to
  `_autoLoadLinkedFilm` when `game.filmMode === 'linked'` (resolves clips from
  `<root>/<game.filmDir>`); `linkFilmFolder()` action (sets root on first use,
  references a folder's clips in place, relinks an existing game's plays 1:1 or
  auto-creates plays for a new game — NO copy); `initLibrary` re-grants scope to
  the saved root on startup.
- **UI (ui-polish.js):** "Link from Library" button in the empty-state (desktop
  only). Per-game `filmMode:'linked'` + `filmDir` persisted in the season JSON.
- **DEV WORKFLOW CHANGE:** Rust now verifiable **locally** — `rustup` + VS Build
  Tools 2026 installed; `cargo check --manifest-path src-tauri/Cargo.toml` before
  every desktop ship. Add `$HOME/.cargo/bin` to PATH in the shell. This caught the
  `protocol-asset` gap before deploy. First run stages `dist/index.html` (copy of
  the bundle) as CI does. Do NOT commit `dist/` or `src-tauri/target/`.
- Tests: `tools/e2e-linked-film.mjs` (relToRoot). Full gate + `cargo check` green.
  The end-to-end linked flow (dialog/fs/convertFileSrc on the coach's drive) is
  desktop-only → validated on the build, not the headless harness.

Also in this release (foundation, not yet user-wired): **SQLite persistence
groundwork** — `js/sql-catalog.js` (`SqlCatalog`, sql.js) + `tools/e2e-sql-catalog.mjs`
(10/10, real 453-play season round-trips) + `tools/e2e-sql-fuzzer.mjs` (16 clean).
JSON stays the live index for now; SqlCatalog is the SQL-ready foundation, wired
in later (persistence-layer-first, dual-write). `package.json` is `"type":"module"`
so Node can import the ES modules for these tests.

### v1.10.7 - Film-Index Reliability + Live-Season Recovery (shipped; tag `v1.10.7`)

ROOT CAUSE of "film links keep vanishing": `StorageManager._serialize` rebuilt a
game's film index (`clipNames/clipPaths/clipRefs/isMultiClip`) from the LIVE
`PlaylistManager.clips` only. Opening a game whose film wasn't fully in the
library (empty/partial playlist) and letting it autosave **stripped the index to
whatever was loaded** — 79→11, 72→6, 83→0, and flipped `isMultiClip` to false.
The plays keep their `clipName`, so the data was recoverable, but the game-level
film index was silently lost, and each reopen made it worse.

- **Fix (storage.js):** new `StorageManager._buildClipIndex()` derives the film
  index from the PLAYS' durable clip identities (`clipPath || clipName`) UNIONed
  with the live playlist. It never shrinks below what the plays reference. Test:
  `tools/e2e-film-index.mjs`.
- **Fix (playlist-manager.js `_relinkSavedPlays`):** added a **basename-fallback**
  pass so re-adding a film FOLDER to a game tagged before path-identity relinks
  1:1 instead of spawning a duplicate untagged play per clip (the St. Peter
  139-plays-for-69-clips dup). Exact-path match (Pass 1) still keeps same-basename
  subfolder clips distinct. Test: `tools/e2e-relink-legacy.mjs`.
- **Fix (history-manager.js):** toast default 1.8s → 4.5s + click-to-dismiss.
- **Live data recovery (direct on disk, verified playing in the desktop app):**
  St. Peter de-duped 139→69 (67 tags kept); Weeks 2/4/5 film copied from the
  coach's source at `D:\Football\Film` into the library + relinked (Wk2 79/79,
  Wk4 72/72, Wk5 65/83 — 18 Wk5 clips genuinely absent from source). Canonical
  data: `%APPDATA%\com.gridironiq.app\seasons\2026-varsity-demo\`. Backups in the
  session scratchpad + `season.PRE-*.json`.
- Full e2e gate green + 3 new tests. Web `gh-pages` deploy intentionally skipped
  (desktop-first focus). `APP_VERSION`/tauri/Cargo bumped to 1.10.7.

### In progress — SQLite catalog (persistence layer, v1.11.x)

Adopting SQLite (sql.js/WASM) as the canonical persistence **behind the existing
`StorageBackend` seam** — a `SqlCatalog` decomposes the season object into rows on
save and reassembles the SAME object on load; the app + `SeasonStore` +
in-memory model are unchanged, JSON becomes export/backup. Clips are first-class
rows (structural cure for the v1.10.7 wipe class). Engine is sql.js so the whole
module is Node-tested before ship; the browser bundle stays sql.js-free; desktop
lazy-loads the vendored wasm; A3 dual-writes `.db` + `season.json` for one release
as a safety net. **A1 done:** `js/sql-catalog.js` + `tools/e2e-sql-catalog.mjs`
(10/10, incl. the real 6-game/453-play season round-tripping losslessly).
`package.json` now `"type":"module"` so Node can import the ES modules for tests.
Plan: `.claude/plans/the-last-iteration-was-kind-sparrow.md`. Next: A2 (migration
+ Node fuzzer), then A3 (TauriBackend wiring, HELD until the coach confirms the
v1.10.7 desktop build).

### v1.10.6 - Demo Identity + Repair Playback Patch

- Fixes a library/splash bug where a stale `localStorage ffa_demo_season_id`
  could label a real tagged season as `Demo`, exclude it from checklist
  progress, and leave a misleading sample-season CTA after deleting the demo.
- Demo identity is now intrinsic to demo season data/meta (`isDemo` /
  `kind:'demo'`); the localStorage id is only a cache and is cleared if it
  points at a real or missing season.
- The sample CTA is state-aware: `Explore sample season` when no sample exists,
  `Open sample season` when one does.
- Repair Film now resolves copied library refs through `backend.filmUrl()` and
  switches the live playlist to those asset URLs before reporting a clean
  library-loaded repair.

### v1.10.5 - Desktop Film Repair Workflow

- Source commit: `81c885b release: v1.10.5 film repair workflow`.
- Web deploy commit: `fc5504b Deploy: v1.10.5` on `gh-pages`.
- Desktop release tag: `v1.10.5` points at `81c885b`; the desktop installer
  workflow was triggered from that tag.
- Added the desktop `Repair Film` action in the Playlist panel. It reconnects
  an already-tagged game to selected film without creating/deleting plays.
- Repair creates a restore point (`Before film repair`), imports only matched
  clips, updates `clipId` / `clipName` / `clipPath` on the existing plays, then
  persists the active game.
- Current repair behavior is COPY-based: matched files are copied into
  GridIron IQ's managed app-data film library. Original coach files are not
  deleted or moved.
- Missing-film messaging now points coaches to `Repair Film` instead of vague
  "re-add film" language.
- Regression coverage was added to `tools/e2e-clip-identity.mjs` for legacy
  duplicate basenames (`0001.mp4` in multiple subfolders) repaired into
  path-aware clip identities while preserving tags and play count.

### v1.10.4 - Clip Identity / Storage Reliability Patch

- Added durable clip identity via `clipPath` / `clipRefs`, while preserving
  legacy `clipName` / `clipNames` fallback.
- Preserved folder structure for desktop film imports so same-basename clips
  like `endzone/0001.mp4` and `sideline/0001.mp4` do not collide.
- Desktop auto-load now warns when expected clips are missing rather than
  silently loading partial film.
- Deleting a desktop season also deletes its Documents mirror copy so removed
  seasons do not resurrect after app-data recovery.
- Added `tools/e2e-clip-identity.mjs`; adjusted season-tab fixture-noise
  handling.

### Current Film Storage Truth

- Browser build: no persistent film library; coach must re-add film when needed.
- Desktop has two intended modes. `managed` copies video under
  `$APPDATA/seasons/<season-id>/films/<game-id>/...`; `linked` must play the
  coach's existing external files in place without making that copy.
- Documents mirror stores season JSON/backups only. Film is not mirrored.
- `clipPath` / `clipRefs` remain the identity layer in both modes. Changing
  storage location must never change play ids, tags, notes, or clip identity.
- A linked configuration has two distinct scopes: one app/team-level library
  root and one persisted game-folder reference per linked game. Those values are
  not interchangeable.
- `v1.12.0-8` does **not** reliably satisfy that contract: a game-folder choice
  can overwrite the global root without saving the game's linked metadata. It
  is a failed baseline until the active repair contract at the top of this file
  is implemented and installed-smoked.
- Do not delete managed C: film copies based on playback in `v1.12.0-8`.
  Playback source must first be visible in the UI and independently verified
  after persist/reopen on the repaired candidate.
- Missing, moved, denied, or unavailable linked folders must show an actionable
  Re-link state and must not mutate season data or fall silently into copy mode.
- Root or mode changes never move or delete film. Cleanup is an explicit coach
  action only after the repaired installed smoke proves the external source.
- Leave untracked `.claude/` and `AGENTS.md` out of release commits unless the
  user explicitly asks for them.

### Linked Film Acceptance Coverage

- Managed copy mode continues to pass its existing Repair Film tests.
- Linked root and game folder persist independently across reopen.
- Linked new-season and existing tagged-game flows load externally with zero
  managed writes/copies.
- Duplicate basenames in subfolders remain distinct.
- Root/game folder cancellation, invalid selection, permission denial, and save
  failure are transactional.
- Missing linked folders prompt for re-link without altering tags.
- Switching or relinking creates the required restore point and preserves play
  count, ids, clip refs, tags, notes, and current-play selection.

## Page Layout (single-column, top-to-bottom)

The app is a **single scrollable column**, not a video+sidebar split:
- **Top bar** — sticky, file load + actions.
- **Video section** (`.video-section`) — **sticky** below the top bar so the
  film stays in view while you tag. Contains the video, playback controls,
  the timeline strip, and the **play-control bar** (`.video-play-controls`):
  Mark Start · Mark End · **Clear Tags** · **Delete Play** · play selector
  (filling the dead space under the player). The Offense/Defense/ST unit toggle
  leads the right (tag) column.
- **Film Room breakdown grid** (`.play-grid-section` / `#playGridSection`,
  `js/play-grid.js`) — the Hudl-style breakdown table, co-equal with the
  video. Sits between the video section and the tag section; hidden until the
  game has plays. Cell click selects the play (video follows); current play
  highlighted + kept in view. A visible chip filter bar (Unit / Down /
  Run-Pass / TD / TO / Pen / Untagged — AND across groups, OR within) with an
  "X of Y" count, plus row checkboxes and a **▶ Watch** button that plays the
  selection∩visible pool as a `CutupPlayer` cut-up (no-video → selects first
  play). Collapsible, persisted (`ffa_film_room_collapsed`); defaults
  collapsed below 1100px. Refresh: tagger `play-created/updated/deleted` +
  the `plays-loaded` event from every wholesale plays-replacement path
  (`_deserialize`, `_clearForNewGame`, undo/redo) which also clears row
  selections + cell focus. Quick filters are intentionally independent of the
  drawer's "Filter Plays" panel (PlayFilter keeps driving the cut-up exporter).

  **v2 — spreadsheet editing & power features:**
  - **Inline editing**: click a cell once to select, again (or Enter /
    double-click) to edit in place. Enum editors are chip popovers whose
    options are read live from the tag form's `.pick` groups (single source
    of truth, cached in `_optionCache`); `sit` is the composite Dn&Dist
    editor; yardage/notes are inputs. Edit semantics mirror the form exactly
    (`_applyEdit`: playType → auto Run/Pass via
    `PlayTagger.runPassForPlayType`; yardage = magnitude, Loss/Sack supply
    the sign) and reload the form when the edited play is selected.
    **Commit direction**: keyboard Enter advances DOWN (next play, same
    column — charting flow), Tab commits + hops sideways, mouse commits
    (chip pick / Done) stay put — advancing the selection (and seeking
    video) on a mouse pick is disorienting.
  - **Keyboard**: roving cell focus (arrows; vertical moves also select the
    play so the video follows), Enter opens the editor, Esc closes/blurs.
    The section handler and popovers `stopPropagation` so the app's global
    single-letter shortcuts can't double-fire.
  - **Custom columns**: `PlayGrid.COLUMNS` registry + `▦ Columns` popover
    (checkboxes + Offense/Defense/ST/Default presets), persisted in
    `ffa_film_room_cols`. `notes` column edits `play.notes` (the call).
  - **Saved filters**: `☆ Save` (visible when a filter is active) names the
    current criteria; `Filters ▾` re-applies/deletes them anywhere
    (`ffa_film_room_filters`).
  - **Column tendencies**: a sticky line under each header over the VISIBLE
    plays — top split value + share for enums ("Shotgun 48%"), run/pass lean
    for R/P, avg for Yds (n ≥ 3–5 gates) — so filtering IS the tendency
    query.
- **Tag section** (`.tag-section`) — holds the entire tagging workflow (mark
  controls, play selector, chip-based tag form, notes, OCR/auto-detect). No
  popup/sidebar — tagging is always on-page.
- **Settings drawer** (`.settings-drawer` / `#settingsDrawer`) — slides in from
  the right (toggled by the top-bar "Settings" button, the mobile "More" tab,
  Esc, scrim, or its × button). Houses secondary panels: Game Info, Roster,
  Version History, Playlist, Filter Plays, Drawing Tools. Backed by
  `.drawer-scrim`. Wired in `js/ui-polish.js` `_initSidebarDrawer()`.
- **Mobile** — bottom tab bar (Video / Stats / Self-Scout / More) from
  `_initBottomTabs()`; "Stats" opens the dashboard, "Self-Scout" opens the
  self-scout report, "More" opens the drawer. (The tag form is always on-page,
  so a dedicated "Tag" tab was dropped in favor of the analytics shortcuts.)

### Responsive layout modes

- **Widescreen (≥1100px)** — two-column grid: video sticky on the left
  (`minmax(0,1fr)`), tag form scrolling on the right (`clamp(430px,33vw,580px)`).
  CSS block: "TWO-COLUMN LAYOUT" at the end of `css/styles.css`. The Film Room
  play grid joins the **left column under the video** via `grid-template-areas`
  (`"video tags" "grid tags"`, in the later "FILM ROOM" CSS block, which must
  stay after the TWO-COLUMN block to win the cascade).
- **Narrow / tablet (<1100px)** — single-column stack: sticky video on top
  (`min(54vh,620px)`), full-width tag form below. CSS block: "SINGLE-COLUMN
  LAYOUT".
- **Mobile (≤800px)** — same stack with shorter video (38vh), bottom tab bar,
  larger touch chips.

## Project Structure

```
index.html                    # Main app shell (modular, uses ES modules)
football-film-analyzer.html   # Single-file build (self-contained, for gh-pages)
build.sh                      # Builds single-file bundle from modules
css/styles.css                # All styles (dark theme, chip UI, panels)
assets/icons.svg              # SVG sprite for all icons

js/
├── app.js                    # Bootstrap — wires all modules, keyboard shortcuts
├── video-controller.js       # HTML5 video playback (play/pause/seek/step)
├── canvas-overlay.js         # Drawing annotations on video frames
├── play-tagger.js            # Play CRUD + chip-based tag form (ChipField)
├── roster-manager.js         # Team roster + per-play player attribution (quick-pick)
├── play-filter.js            # Filter plays by tag values (drawer panel; drives cut-up exporter)
├── play-grid.js              # Film Room breakdown grid (PlayGrid): inline cell editing, custom columns, saved filters, tendencies, bulk Watch
├── play-detector.js          # Motion-based auto-detection of play boundaries
├── clip-analyzer.js          # Heuristic auto-tagging (centroid tracking)
├── vision-analyzer.js        # Claude Vision API integration
├── backend-client.js         # Local Python CV server client (optional)
├── quick-chart.js            # Keyboard-only rapid charting mode
├── playlist-manager.js       # Multi-clip video session management
├── multi-angle.js            # Dual-camera sync (toggle/SBS/PiP view modes)
├── charts.js                 # Pure-SVG chart primitives (donut, gauge, bars, sparkline, game flow)
├── stats-engine.js           # Stats aggregation (run/pass, efficiency, EPA, defensive)
├── advanced-metrics.js       # Expected Points Added calculations
├── heat-maps.js              # Visual heat map generation
├── visualizations.js         # SVG charts: field-zone success, yardage spray, quarter mix
├── storage-backend.js        # Storage seam: BrowserBackend (localStorage+IndexedDB+File System Access) / TauriBackend (native files) + backup ring
├── season-store.js           # Season-as-project data model; delegates persistence/backups to a StorageBackend
├── demo-season.js            # DemoSeason.build() — deterministic fully-tagged sample season for onboarding (empty-state)
├── storage.js                # Save/load bridge (live tagger <-> season store) + snapshots/restore + CSV import
├── history-manager.js        # Unified undo/redo (play data + canvas)
├── version-manager.js        # Named save points
├── notes-manager.js          # Per-play text notes
├── scoreboard-ocr.js         # OCR region for scoreboard reading
├── suggestion-engine.js      # Pattern-based tag suggestions
├── cutup-exporter.js         # Stitch filtered plays into cut-up video
├── season-manager.js         # Season view: game switcher + aggregate stats + progression (over season-store)
├── call-sheet-builder.js     # Play call sheet generation
├── season-library.js         # Team hub front door: team card + setup, seasons list, schedule view, demo, Get Started checklist
├── ui-polish.js              # Misc UI enhancements (incl. empty-state Add Video/Folder CTA)
├── wizard.js                 # Step-by-step onboarding wizard (dormant; default-dismissed)
├── custom-fields.js          # User-defined tag fields (CustomFieldsManager)
└── play-diagram.js           # Per-play X's & O's diagram editor (PlayDiagram)

tools/
├── generate-sample-report.mjs  # Generates dummy-data analytics report via real StatsEngine
├── screenshot-report.mjs       # Puppeteer screenshots of the sample report
├── e2e-onboarding.mjs          # Headless onboarding regression harness. ALWAYS run before
│                               # deploying UI/onboarding/library changes:
│                               #   bash build.sh && node tools/e2e-onboarding.mjs
│                               # Drives the BUILT bundle through first-run → team setup →
│                               # checklist → demo season → schedule → game → stats → delete →
│                               # upgrade path, asserting each step + zero console errors.
├── e2e-film-room.mjs           # Headless Film Room harness — run it alongside the onboarding
│                               # one before any deploy: grid render, click-to-select, chip
│                               # filters, bulk select + Watch fallback, collapse persistence,
│                               # switch-team back-out.
├── e2e-video-cors.mjs          # VideoController cross-origin retry logic (the desktop
│                               # asset-protocol playback path other harnesses skip): drives
│                               # the error/promote handlers directly with video.load() stubbed.
│                               # Guards that a corrupt clip does NOT latch corsBlocked (which
│                               # would taint the canvas) while a confirmed CORS failure does,
│                               # and that loadUrl + multi-clip switchToClip both route through
│                               # VideoController.setSrc.
├── e2e-self-scout.mjs          # Defensive self-scout rendering: the Self-Scout TAB shows the
│                               # defensive section, scheme-tagged defensive plays with no
│                               # offensive playType still count (gating fix), the Defense tab
│                               # shows the scheme-tells section, and generateDefensiveSelfScout
│                               # runs once per dashboard render.
├── e2e-season-tab.mjs          # Season tab in the stats dashboard (v1.9.4/1.9.5). Run it with
                                # the others before any deploy: sortable leaderboards (header
                                # click sorts asc/desc, Player sorts as text, class toggles),
                                # the Season tab lazy-render (KPI header + trend line charts +
                                # player roll-up), the leaderboard sort-wiring, and that the
                                # .season-summary header actually wears the .gi-hero card look.
├── e2e-core.mjs                # Unit tests for the PURE core logic (v1.9.21): the static
│                               # splitters (splitFormations/PlayTypes/Results/Fronts/Blitzes/
│                               # Players), run/pass classification (explicit field + playType
│                               # fallback), hasResult, playPoints, and Charts._esc HTML escaping
│                               # (the XSS boundary). Run with the others before any deploy.
└── e2e-integrity.mjs           # DATA-INTEGRITY STRESS HARNESS (v1.9.28) — the test the suite
                                # was missing. Loads COPIES of real seasons (or a synthetic
                                # multi-game fallback) into the bundle in isolated storage, then
                                # FUZZES the real data path (switchToGame/restoreBackup/newGame/
                                # removeGame/addFiles/tag/commitActive/persist+reload/undo/redo +
                                # a diabolical desync-commit) and re-checks invariants after EVERY
                                # op: cross-game ISOLATION (no game's plays bleed into another),
                                # lossless ROUNDTRIP, referential INTEGRITY (no two games share a
                                # clip name), and zero exceptions. Caught BOTH cross-game
                                # corruption bugs (commitActive + undo-not-game-scoped); fails
                                # loudly on the buggy code, clean on the fixed code. Run before
                                # any deploy with the rest.

server/                       # Optional local Python backend (YOLO-based)
├── app.py                    # Flask server
├── analyzer.py               # Video analysis with OpenCV/YOLO
├── start.sh                  # Server launcher
└── README.md                 # Server setup instructions

src-tauri/                    # Tauri v2 desktop shell
├── Cargo.toml                # Rust crate (tauri + plugins: fs, dialog, shell)
├── tauri.conf.json           # App config: window, CSP, bundle, withGlobalTauri
├── build.rs                  # Tauri build script
├── capabilities/
│   └── default.json          # v2 permissions: fs scope, dialog, shell
├── icons/                    # App icons (placeholder — replace for production)
└── src/
    └── main.rs               # Entry point: registers plugins, launches app
```

## Core Data Model

### Play Object
```javascript
{
  id: number,
  timestamp: { start: number, end: number },  // seconds in video
  clipId: string | null,                       // for multi-clip mode
  tags: {
    down: '',           // '1' | '2' | '3' | '4'
    distance: '',       // yards to go (numeric string)
    quarter: '',        // 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'OT'
    fieldSide: 'own',   // 'own' | 'opp'
    yardLine: '',       // 1-50
    formation: '',      // MULTI-SELECT (offense), STRUCTURE only (Hudl Formation/Backfield/Strength model, v1.9.15). One or more of 'Under Center' | 'Pistol' | 'Shotgun' (QB alignment) | 'Single Wing' | 'Double Wing' | 'Wing-T' | 'Flexbone' | 'Wishbone' | 'Spread' | 'Wildcat' | 'Unbalanced' | 'Goal Line' (systems) | 'Trips' | 'Twins' | 'Doubles' | 'Bunch' | 'Empty' (receiver structure), stored as a " + "-joined string. The back-alignment looks (I-Form, Singleback, Split Back, Power-I) are NOT here — they moved to `backfield`. Analytics split on " + "; ChipField({multi:true}); StatsEngine.splitFormations() is the canonical splitter. SeasonStore.migratePlayFormation() (runs in _normalize) splits legacy formation strings into formation + backfield ('Pistol + Singleback' → formation 'Pistol' + backfield 'Single'); idempotent, non-destructive, Empty stays a dual citizen.
    backfield: '',      // SINGLE (offense, v1.9.15). 'Single' | 'Split' | 'I' | 'Power' | 'Offset' | 'Strong' | 'Weak' | 'Pistol' | 'Diamond' | 'Empty'. The back alignment within the formation. Backfield tendency table (offense tab) + 'backfield' cut filter + a Tendency-Matrix dimension + Self-Scout backfield tells (v1.9.16).
    strength: '',       // SINGLE (offense, v1.9.15). 'Right' | 'Left' | 'Balanced'. Which side the formation is loaded to (distinct from hash = ball spot, playDir = where it went). SIDE CONVENTION (v1.9.18): Left/Right on strength, playDir, AND hash are ALWAYS read from the OFFENSE's perspective, on every play regardless of unit — so they aggregate correctly across units (the opponent scout reads their offense off your DEFENSIVE snaps; a defense-POV tag would mirror-flip it). The tag-form hints say so. No stored perspective flag + no auto-flip — the convention is enforced by tagging, not code. Strength tendency table + 'strength'/'comboFStr' cut filters + Tendency-Matrix dimension + Self-Scout strength & Formation × Strength tells (v1.9.16).
    personnel: '',      // SINGLE. '00' | '01' | '02' | '10' | '11' | '12' | '13' | '20' | '21' | '22' | '23' | '30' | '31' | '32' | 'Jumbo' | 'Goal Line'. First digit = #RB, second = #TE (WR = 5 − RB − TE); e.g. '32' = 3 backs + 2 TE power (0 WR), '11' = 1 RB/1 TE/3 WR. v1.9.18 added 01/02 (empty-back) + 30/31/32 (heavy). '33' deliberately omitted (3 RB + 3 TE = 6 skill players, illegal).
    motion: '',         // 'Jet' | 'Orbit' | 'Shift' | 'Trade' | '' (blank = no motion). Pre-snap motion; in SCHEME_KEYS so Same-as-Last/templates carry it. Stats: motion-vs-no-motion run/pass split table (offense tab) + "motion is a tell" Game Plan check; tendency-matrix dimension.
    runPass: '',        // 'Run' | 'Pass' | '' — explicit run/pass classifier, authoritative for all run/pass analytics. Auto-filled from unambiguous playType; coach sets it for RPO/Play Action/Trick. StatsEngine.isRun()/isPass() are canonical and fall back to playType-string inference when runPass is blank (legacy data).
    playType: '',       // MULTI-SELECT. One or more of 'Run Inside' | 'Run Outside' | 'Screen' | 'Short Pass' | 'Medium Pass' | 'Deep Pass' | 'Play Action' | 'RPO' | 'Trick Play', stored as a " + "-joined string (e.g. 'RPO + Short Pass' — an RPO that became a pass). ChipField({multi:true}); StatsEngine.splitPlayTypes() is the canonical splitter; analytics attribute the play to each component.
    result: '',         // MULTI-SELECT. One or more of 'Gain' | 'Loss' | 'No Gain' | 'Incomplete' | 'Interception' | 'Touchdown' | 'Sack' | 'Fumble' | 'Penalty' | 'Punt' | 'Field Goal' | 'Good' | 'No Good' | 'Kneel' | 'Spike' | 'Safety', stored as a " + "-joined string (e.g. 'Fumble + Touchdown' for a scoop-and-score, 'Interception + Touchdown' for a pick-six). ChipField({multi:true}); StatsEngine.splitResults()/hasResult() are the canonical accessors. 'Good'/'No Good' mark conversion/kick success (2-Pt, XP, FG). 'Safety' = 2 pts, always attributed to the defensive team.
    yardage: '',        // integer, signed (negative for loss/sack). The tag form enters it as a MAGNITUDE — the Result chip (Loss/Sack) supplies the sign, so the coach never types a minus (PlayTagger._applyYardageSign). Stored signed for stats/EPA/export.
    hash: '',           // 'Left' | 'Middle' | 'Right' — offense's perspective (see SIDE CONVENTION on strength).
    playDir: '',        // 'Left' | 'Middle' | 'Right' — which way the ball went (post-snap), offense's perspective (see strength), distinct from hash (where it was spotted). Stats: Play Direction table (offense tab), run-direction-lean Game Plan check, tendency-matrix dimension.
    defFront: '',       // MULTI-SELECT. Base front + optional shift package: '4-3' | '3-4' | '4-4' | '5-2' | '5-3' | '6-2' | '3-3-5' | '4-2-5' | 'Nickel' | 'Dime' | 'Quarter' | '4-6' | custom team fronts ('Maverick'/'Eagle'/'Falcon', .our-def-only) | 'Jumbo Shift' (.our-def-only), stored as " + "-joined string (e.g. 'Maverick + Jumbo Shift'). ChipField({multi:true}); StatsEngine.splitFronts() is the canonical splitter — defensive front tables, front-by-situation, front+coverage combos, scout report, tendency matrix, and cut-up filters all attribute the play to each component, so 'Jumbo Shift' rolls up as its own row.
    coverage: '',       // 'Cover 0'-'Cover 6' | 'Man' | 'Zone'
    blitz: '',          // MULTI-SELECT. 'A-Gap' | 'B-Gap' | 'C-Gap' | 'Edge' | 'DB Blitz' | 'Zone Blitz', stored as " + "-joined string. ChipField({multi:true}); StatsEngine.splitBlitzes() is the canonical splitter.
    driveNumber: '',    // auto-incremented
    unit: 'offense',    // 'offense' | 'defense' | 'special' — drives tag-form layout
    stType: '',         // 'Kickoff' | 'Kick Return' | 'Punt' | 'Punt Return' | 'Field Goal' | 'XP' | '2-Pt' | 'Onside' | 'Fake'
    // Phase-aware special-teams detail (v1.9.13). The tag form's ST section is
    // PHASE-AWARE: PlayTagger._applyStPhase(stType) shows only the fields/chips
    // that ST Play Type uses (each .st-field + each #tagKickOutcome chip carries
    // a "|"-joined data-phases list). StatsEngine._specialTeamsStats reads these
    // into the Game-tab Special Teams section (punt gross/net/hang/TB%, kickoff
    // avg/TB%/return-allowed, FG made-att by distance, return game). playPoints()
    // + _conversionStats() treat kickOutcome==='Good' as a made FG/XP/2-Pt.
    kickOutcome: '',    // ST result/coverage: 'Returned'|'Touchback'|'Fair Catch'|'Downed'|'Out of Bounds'|'Muffed'|'Blocked'|'Recovered' (KO/Punt) ; 'Good'|'No Good'|'Blocked' (FG/XP/2-Pt)
    kickDistance: '',   // gross kick yards (KO/Punt/FG)
    returnYards: '',    // return yards (KO/Punt + their returns); net = kickDistance − returnYards
    hangTime: '',       // seconds (KO/Punt)
    kickedTo: '',       // landing yard line (KO/Punt)
    players: {},        // { ballCarrier, passer, receiver, tackler, kicker, returner } -> jersey # strings. Most roles hold a single #; tackler may hold MULTIPLE (shared tackles), stored as a "55, 22"-style string. StatsEngine.splitPlayers() splits any player value into individual #s.
    grades: {},         // same role keys -> integer (-2 to +2)
    custom: []          // freeform string array
  },
  notes: '',
  analysis: null        // AI analysis result, if any
}
```

### Minimum Fields for Useful Stats
1. **playType** + **result** + **yardage** — run/pass ratio, success rate, averages
2. **down** + **distance** — conversion rates, situational analysis
3. **formation** — tendency breakdowns
4. Everything else (defense, personnel, field position) is bonus detail

## Player Stats (Roster + Attribution)

Box-score style per-player stats, modeled on Hudl/QwikCut:

1. **Roster panel** (`roster-manager.js`): add players (jersey #, name, position, side O/D/B). Stored in `localStorage` (`ffa_roster`) and in project saves (`roster` key, schema v4).
2. **Roster import**: CSV file upload or paste-from-spreadsheet with smart header detection (`#`/`Num`/`Jersey` → num, `Name`/`Player` → name, `Pos`/`Position` → pos, `Side`/`Unit` → side). Delimiter auto-detected (tab/comma/semicolon). No external libraries.
3. **Per-play attribution**: the tag form has a **Players** section with four roles — Ball Carrier, Passer, Receiver, Tackler. Click a role input to make it active, then tap a roster **quick-pick chip** (filtered by side of ball) to stamp the jersey #. Saved to `play.tags.players`. **Tackler accepts multiple #s** (shared/assisted tackles): the input is a text field and the quick-pick chips *toggle* membership in a `"55, 22"` list (`RosterManager.multiRoles`) instead of replacing. Other roles stay single-value.
4. **Per-play grading**: each role has a grade select (++/+/0/−/−−, stored as -2 to +2 in `play.tags.grades`). Average grades appear in the individual stats tables.
5. **Aggregation** (`stats-engine.js` `_individualStats`): rolls role assignments into rushing (att/yds/avg/long/TD/fum/grade), passing (cmp-att/pct/yds/TD/INT/sack/grade), receiving (rec/yds/long/TD/grade), and tackles (tkl/**solo**/**ast**/sack/TFL/grade). A play with 2+ tacklers credits each as an **assist**; a lone tackler is **solo**. `StatsEngine.splitPlayers()` splits the tackler list.
6. **Output**: dashboard renders four individual-stat tables; jersey #s map to "#22 Smith" via the roster. **Click any player row to launch a film cut-up** (`_watchPlayer` → `CutupPlayer`).
7. **Export**: CSV includes Ball Carrier / Passer / Receiver / Tackler + grade columns.

Quick Chart mode also writes `play.tags.players` for the same roles.

### Film Cut-Ups (`cutup-player.js`)
`CutupPlayer` plays a set of plays back-to-back in the existing `<video>`:
seek to each play's start, run to its end, auto-advance to the next. A
floating banner shows label + position with Prev/Next/Exit (←/→/Esc).
Distinct from `cutup-exporter.js`, which renders a downloadable stitched
video file.

**Every data point ties to video** (Hudl-style): clicking *any* highlighted
stat in the dashboard launches a cut-up of exactly those plays — not just
player rows. Formation / Play Type effectiveness rows, the Down & Distance
table, the Situational table (Red Zone, Goal Line, Backed Up, 3rd & Long/
Short), and the Defensive Front / Coverage / Blitz tables all carry
`data-cut-type` / `data-cut-val` attributes. `_renderDashboard` wires every
`.cut-row[data-cut-type]` to `_watchPlays(filter, label)`; `_buildCutFilter
(type, val)` returns the predicate (offense dimensions match offense-unit
plays, defensive dimensions match defense-unit plays — mirroring the stats
partition). `_watchPlayer` is now a thin wrapper over `_watchPlays`. Rows
without a playable video region fall back to selecting the first match. A
hover ▶ + tooltip and a one-line `.stats-cut-hint` banner make it
discoverable. `Charts.effectivenessRows` emits the cut attributes when an
item carries `cutType`/`cutVal`/`cutLabel`.

## Storage Backend Seam (`storage-backend.js`)

The app never touches localStorage / the filesystem directly — it goes through a
`StorageBackend`. This is the seam that lets the **same UI** run as a browser app
or an installed desktop app (and, later, a cloud-synced one) without UI changes.

- `detectBackend()` returns `TauriBackend` when `window.__TAURI__` exists, else
  `BrowserBackend`. `SeasonStore` takes a backend (defaults to `detectBackend()`).
- **Responsibilities**: (1) canonical season load/save, (2) a **backup ring** of
  restore points (`createBackup`/`listBackups`/`getBackup`, capped at
  `RETENTION = 25`), (3) optional **durable disk** target
  (`supportsDisk`/`bindDisk`/`writeDisk`/`diskStatus`).
- **`BrowserBackend`**: canonical = `localStorage ffa_season`; backup ring =
  **IndexedDB** (`ffa_fs` DB, `backups` store; `handles` store keeps the bound
  directory handle); durable disk = **File System Access API** — a bound folder
  receives `season.json` (live) + `backups/season_<ts>.json` snapshots, pruned to
  25. Chromium only; Firefox/Safari fall back to download + the in-app ring.
- **`TauriBackend`** (desktop): every read/write hits real files via Tauri's fs;
  the backup ring is real files in `backups/`. Dormant in the browser. See
  `TAURI.md` for packaging.
- **Film library** (desktop only, `supportsFilm()`): the backend also manages
  persistent film storage. See "Persistent Film Library" below.

### Persistent Film Library (Tauri desktop)

On the desktop build, video files are **copied into the season's folder** when
loaded and **auto-loaded from disk** when the coach opens a game — the biggest
UX gap vs Hudl, now closed.

**Disk layout** (under `$APPDATA`):
```
seasons/<season-id>/
  films/<game-id>/
    game_film.mp4           # single-video mode
    clip_01.mp4             # multi-clip (folder) mode
    clip_02.mp4
    …
```

**Import flow** (`StorageManager.importFilm` → `TauriBackend.importFilm`):
1. User picks file(s) via the existing file picker / drop zone.
2. Video loads immediately for tagging (blob URL, same as before).
3. In the background, the file(s) are read as `ArrayBuffer` and written to
   `$APPDATA/seasons/<sid>/films/<gid>/` via `fs.writeFile`. A progress toast
   shows "Saving film to library… N/M". Already-imported files (same filename)
   are skipped.

**Auto-load flow** (`StorageManager._autoLoadFilm`):
1. `_loadActiveGame()` fires after a game switch or season open.
2. If `backend.supportsFilm()`, it lists files in the game's film directory.
3. **Single-video**: resolves the film's absolute path →
   `convertFileSrc(path)` (asset protocol URL) → `VideoController.loadUrl()`.
4. **Multi-clip**: resolves each clip → `PlaylistManager.rehydrateFromDisk()`,
   which matches disk files to existing plays by `clipName` and sets
   `clip.assetUrl` / `play.clipId` so playlist navigation works. Then switches
   to the saved `currentPlayId`'s clip.
5. If the film isn't on disk (old save, browser import, deleted manually), the
   load silently falls back to the placeholder — the coach can re-link.

**Playback**: served via the Tauri **asset protocol**. On Windows (WebView2)
the URL scheme is **`http://asset.localhost/…`** (NOT `https://`); on macOS it
is `asset://localhost/…`. Enabled in `tauri.conf.json` (`assetProtocol.enable`,
scope `$APPDATA/**`), with the CSP updated (`media-src` / `img-src` include
`asset:`, `http://asset.localhost`, and `https://asset.localhost`; `connect-src`
includes `http://asset.localhost` for diagnostic probes).

> **Lesson (v1.8.2)**: the original CSP listed only `https://asset.localhost`,
> but Tauri v2 on Windows generates `http://` URLs. WebView2 rejected every
> video load with "Media load rejected by URL safety check" — a CSP violation,
> not a CORS or codec error. Always include **both** `http://asset.localhost`
> and `https://asset.localhost` in `media-src` / `img-src`.

**Cross-origin handling** (`VideoController`): `crossOrigin = 'anonymous'` is
set on the `<video>` element via `setSrc()` when using asset URLs to keep the
canvas untainted for frame export / AI vision. If the asset protocol doesn't
serve CORS headers (which causes the video to error), a retry-without-crossOrigin
mechanism fires once per clip (`_shouldCorsRetry` → `_handleMediaError` →
`_promoteCorsRetry`). The `corsBlocked` flag latches **only on confirmed
success** of the retry (not on the error itself), so a corrupt clip can never
taint the canvas for subsequent good clips. `setSrc(url)` is the single owner
of the crossOrigin decision — both `loadUrl()` (single-video) and
`PlaylistManager.switchToClip()` (multi-clip) route through it.

**Browser build**: completely unchanged — `backend.supportsFilm()` returns
`false`, so none of the import / auto-load code runs.

**Cleanup**: `StorageManager.removeGame()` calls `backend.deleteFilm(gameId)`.
Deleting a season deletes the entire `seasons/<id>/` directory, including films.

### Durable Documents mirror (Tauri desktop) — survives "delete app data"

On desktop, the canonical save AND the restore ring both live under `$APPDATA`,
so uninstalling with **"Delete application data"** (or clearing app data) used to
wipe the data *and* its own safety net. To fix this, `TauriBackend.writeDisk()`
now also mirrors every save to the user's **Documents** folder, outside app data:

```
Documents/GridIron IQ/seasons/<id>/season.json     # live mirror (every autosave)
Documents/GridIron IQ/seasons/<id>/backups/         # snapshot ring (explicit saves), pruned to RETENTION
```

- Mirror writes are **best-effort** (`_mirrorToDocuments`) — a Documents failure
  never blocks the canonical app-data save. Films are NOT mirrored (large; the
  originals are re-linkable).
- **Auto-recovery**: `listSeasons()` calls `_recoverFromMirror()` when the
  app-data library is empty (fresh install or post-wipe). It reads each
  `Documents/GridIron IQ/seasons/*/season.json`, copies it back into app data,
  and rebuilds `library.json` — so a coach's seasons reappear automatically.
- `diskStatus().name` is now **"Documents › GridIron IQ"** (the durable target),
  and `openDataDir()` opens that mirror folder. The Season modal's backup-status
  line adds a warning to **Save Season** (export a file) before uninstalling,
  since "Delete application data" still erases the app-data copy.
- Capabilities add `$DOCUMENT/**` to `fs:scope` + the opener allow-lists.

### Backups & Restore ("undo a save")
Because browser storage is not durable, every save also makes a restore point:
- `SeasonStore.snapshot(label)` writes a disk snapshot (if a folder is bound) +
  an in-app ring entry. `StorageManager._maybeSnapshot()` throttles auto
  restore-points to one per ~3 min during tagging; explicit Save and risky ops
  force one.
- **Restore is reversible**: `SeasonStore.restoreBackup(id)` snapshots the
  *current* state ("Before restore") before overwriting, so a coach can never
  strand themselves on bad data. UI: the Season modal's **Restore** panel lists
  points (time, label, season/game/play counts) with a Restore button.
- The Season modal header shows a **backup status** line: green "✓ Backing up to
  <folder>" when bound, amber warnings otherwise. **Back up to Folder** binds the
  durable folder (recommended on first explicit Save).

## Season Library / Team Hub — front door (`season-library.js`)

**The app is library-first, like Hudl. The hierarchy is Team → Season → Game →
Plays → Stats.** On launch it opens the **library overlay** (`#libraryOverlay`,
`SeasonLibrary`) to the **Team Home** and **nothing loads until the coach
explicitly opens or creates a season**. (This replaced the old behavior where a
single shared save auto-loaded silently with no context, which got messy by game
2 and confused users about what was loaded.)

### Team level (the hub)

The library has two views, toggled by `_setLevel('seasons'|'schedule')`:
- **`#librarySeasonsView` (Team Home)** — a **team identity card** (`#teamCard`:
  name, jersey-color swatch, roster count, **Roster** + **Edit** actions) above
  the **seasons list**. First-time users (no team) instead see **`#teamSetup`**
  (name + jersey color → "Get Started"); once saved, the card replaces it.
  Team identity lives in `localStorage ffa_team_profile` (`{teamName,
  jerseyColor}`), is editable inline (`#teamEdit`), and syncs both ways with Game
  Info (`_syncGameInfoFromTeam`).

  **Multi-team** (a coach on JV + Varsity staffs): the registry is
  `localStorage ffa_teams` (`[{id, teamName, jerseyColor}]`) with
  `ffa_active_team_id`; **`ffa_team_profile` remains the ACTIVE team's
  profile**, so every existing reader (breadcrumb, Game Info sync, checklist,
  `commitActive`) works unchanged — switching just rewrites it. Team Home shows
  **switcher pills** (`#teamPills`, `_renderTeamPills`) + "+ Add Team" (reuses
  `#teamSetup` in adding mode with a Cancel; the form is blanked first — a
  leftover first-run value used to concatenate into the new name).
  - **Seasons are scoped per team**: library metas carry `teamId` (whitelisted
    in BOTH backends' `createSeason`); `_render` filters via `_teamSeasons()`;
    legacy metas without `teamId` belong to the FIRST registry team. The demo
    season stamps the active `teamId` (storage.js `loadDemoSeason`).
  - **Rosters are per team**: snapshots in `ffa_roster_<teamId>`; live
    `ffa_roster` is always the active team's (RosterManager untouched).
    `_setActiveTeam` snapshots the outgoing roster, loads the incoming one.
  - **Switching** (`_setActiveTeam`): commits+persists+**closes** any open
    season (it belongs to the outgoing team), swaps profile+roster, lands on
    the new team's Team Home.
  - **Removing** (`_removeTeam`, "Remove this team…" in the edit panel): only
    allowed when the team has **no seasons** (guard message otherwise) —
    removal never silently strands seasons. Removing the last team returns to
    first-run setup.
  - **Migration** (`_ensureTeamRegistry`, run on every `open()`): a
    pre-registry profile becomes the first team owning the existing roster +
    all legacy seasons; it also self-heals a registry-without-profile state
    and mirrors Game Info team edits back into the registry entry.
- **`#libraryScheduleView` (Schedule)** — the open season's games as a Hudl-style
  schedule table (`_renderSchedule` → `#scheduleBody`, using `app._gameRowInfo` /
  `_scorePillHtml`): status dot, name, date, W/L pill, play count, Open/Final.
  Click a row → open that game. "← All Seasons" returns to Team Home.

Opening/creating a season lands on the **schedule** (pick a game), not the
player — reinforcing drill-down. Each season is still its own file/folder.

### Breadcrumb (top bar) — `#breadcrumb`, replaces the old season chip

`Team ▸ Season ▸ Game`, rebuilt by `App._updateSeasonChip` / wired in
`_bindSeasonChip`:
- **Team** (`#bcHome`, shows `ffa_team_profile.teamName`) → `library.open()`
  (Team Home).
- **Season** (`#bcSeason`, the season name) → `library.openSchedule()`.
- **Game** (`#bcGame`, the active game) → toggles the **game-switcher dropdown**
  (`#gameDropdown`) — the quick in-place game switch; hidden until a game exists.
The breadcrumb is hidden until a season is open.

### Onboarding: demo season + Get Started checklist

Best-in-class onboarding lesson (Hudl/Notion/Krossover): never show a blank
canvas; get to value fast on real-looking data.
- **Explore a demo season** (`#btnExploreDemo` → `StorageManager.loadDemoSeason`)
  builds a deterministic, fully-tagged sample season (`demo-season.js`,
  `DemoSeason.build()` — 2 finished games, offense + defense, ~170 plays, final
  scores W 28-21 / L 17-24) via the **same** `createSeason` path as real data, so
  the coach lands on populated Stats/Self-Scout/Call-Sheet instantly. It's
  **non-destructive**: the demo carries an **empty roster**, and player names
  come from a transient overlay — `StatsEngine._fixedLabels` (checked before
  `_seasonLabels`, which the Season Stats view nulls), set/cleared per active
  season by `_applySeasonLabels()` in `_loadActiveGame`. The demo is flagged by
  `localStorage ffa_demo_season_id` (`isDemoSeason`), shown with a **Demo** badge,
  and removable with a non-destructive confirm (`_teardownDemo` just clears the
  flag). No film is attached (can't bundle video) — the demo's job is analytics.
- **Get Started checklist** (`#getStartedChecklist`, `_renderChecklist`) — a
  progressive 5-step guide (Set up team → Add roster → Start a season → Tag a
  play → See your stats) that reflects real state (`_checklistItems` reads the
  team profile, roster, season metas excluding the demo, and a `ffa_seen_stats`
  flag set when the dashboard opens for non-demo data). Each open step is
  click-to-action; it auto-hides when complete or dismissed
  (`ffa_checklist_dismissed`). Only shown once a team exists.

### Per-season file storage

- **Each season is its own file/folder**, not one shared blob:
  - Browser: `localStorage ffa_library` (index) + `ffa_season_<id>` per season;
    backups in IndexedDB tagged with `seasonId`.
  - Tauri: `library.json` (index) + `seasons/<id>/season.json` +
    `seasons/<id>/backups/`.
- The backend (`storage-backend.js`) scopes the classic per-season ops
  (`loadSeason`/`saveSeason`/backup ring) to a **current season** set via
  `setCurrentSeason(id)`, plus library ops `listSeasons` / `createSeason` /
  `deleteSeason` / `touchOpened`. So `SeasonStore` keeps calling the same methods.
- `SeasonStore` adds `currentSeasonId`, `hasCurrent()`, `listSeasons()`,
  `createSeason(meta)`, `openSeason(id)`, `deleteSeason(id)`, `closeSeason()`;
  `data` is **null until a season is opened** (so autosave no-ops on the Library).
- `StorageManager.initLibrary()` (startup) loads nothing; `openSeasonById(id)` /
  `createSeason(meta)` commit+persist the outgoing season, switch, then
  `_afterSeasonLoaded()` loads the active game + re-seeds history/versions/chip.
- **Legacy migration**: an old single `ffa_season` / top-level `season.json`
  becomes the first season in the library automatically (no data loss).
- The **game-switcher dropdown** (`.game-dropdown`, `#gameDropdown`), opened from
  the breadcrumb **Game** segment, is the quick in-place switch — a compact list
  of all games in the season with status badges, scores, play counts, and
  per-game actions. "Switch Season" in its footer opens the library.

### Game Switcher Dropdown (`#gameDropdown`)

The dropdown is the primary game-switching interface (Hudl-style schedule view):
- Each game row (`.gd-row`) shows: status dot (cyan=open, green=final, dim=idle),
  name (derived from opponent/project/video), play count, date, W/L score pill,
  and status badges ("open" / "Final").
- **Click** a row's info area → `switchToGame(id)` + close dropdown.
- **Finish Game** button on the active (non-final) row → opens the finish-game
  modal (see below).
- **+ New Game** → `storage.newGame()` + update chip.
- **Switch Season** → opens the Season Library.
- Closes on Escape, outside click, or game selection.

Wired in `App._bindSeasonChip()`, `_openGameDropdown()`, `_renderGameDropdown()`,
`_closeGameDropdown()`.

### Game Status & Finish Game Flow

Each game has a `status` field: `'active'` (default, in-progress) or `'final'`
(completed). Backward-compatible — old games without `status` default to
`'active'` via `SeasonStore._normalize()`.

**Finish Game** (`App._finishGame` → `_showFinishModal`):
1. If no final score entered → modal prompts for Us/Them score.
2. If score already present → modal confirms "Mark as Final?"
3. On confirm: saves score to Game Info, sets `game.status = 'final'`, persists,
   shows a toast.
4. **Reversible**: a Final game can still be opened and edited. The status is
   informational, not a lock.

The status is preserved across `commitActive()` → `updateActiveGame()` (which
would otherwise overwrite the game node from `_serialize()` output that doesn't
include `status` — `updateActiveGame` now carries `prev.status` forward).

`SeasonStore.setGameStatus(id, status)` and `SeasonStore.gameStatus(g)` are the
accessors. The Season Stats modal (`season-manager.js` `_renderGameList`) shows
a `✓ Final` badge on completed games.

The within-season schedule + aggregate stats stay in `season-manager.js` (the
"Season Stats" modal); it operates on whichever season is current.

## Season-as-Project — Save/Load Architecture (`season-store.js`)

**Each season IS a project.** Within a season, the unit of work holds many games
and is autosaved in place. This killed the old per-video autosave
(`ffa_<videoFileName>`) and the per-save download artifact
(`<game>_analysis.json`) that scattered over a year. (Above this sits the
**Season Library** — multiple seasons, each its own file; see previous section.)

**Data model (schema v5)** — `SeasonStore.data`:
```javascript
{
  version: 5, type: 'season',
  seasonName: '',                 // named up front in the Season modal
  teamProfile: { teamName, jerseyColor },
  roster: [...],                  // season-level roster mirror
  games: [ gameNode, ... ],       // each gameNode is the old per-game object:
  activeGameId: '<id>',           //   { id, name, gameInfo, plays, annotations,
}                                 //     nextId, currentPlayId, videoFileName,
                                  //     clipNames, isMultiClip }
```
A `gameNode` is exactly what `StorageManager._serialize()` produces, so
`version-manager.js` (which round-trips through `_serialize`/`_deserialize`)
keeps working unchanged — those two methods are still "serialize/deserialize the
**active game**".

**Storage tiers (via the backend seam, see above):**
1. **Canonical** = `backend.saveSeason()` (browser: `localStorage ffa_season_<id>`
   for the current season; desktop: `seasons/<id>/season.json`),
   autosaved continuously (debounced) by `StorageManager._commitAndPersist()` →
   `commitActive()` + `seasonStore.persist()`. No artifacts proliferate.
2. **Durable disk backup** = a bound folder (browser: File System Access API)
   getting `season.json` + a `backups/` snapshot ring; on desktop (Tauri) plain
   app-data files. Silent live-file writes are debounced on autosave; snapshots
   are throttled / forced on explicit save.
3. **Restore ring** = timestamped restore points (IndexedDB in the browser, real
   files on desktop), capped at 25 — the "undo a save" safety net.
4. **Portability** = `Save Season` / `downloadFile()` for a one-off
   `<season>_season.json`; `Open File` (Season modal) imports a season or legacy
   game file.

**Bridge (`StorageManager`)** owns the live↔store sync:
- `initSeason()` (called once at startup, next tick so `window.app` is set) loads
  the season and restores the active game into the tagger/canvas/gameInfo.
- `commitActive()` writes live tagger/canvas/gameInfo (+ roster, team profile)
  into the active game node; `_loadActiveGame()` loads a node back out.
- `switchToGame(id)` / `newGame()` / `removeGame(id)` / `addGameFromData(legacy)`
  commit the current game, mutate the store, then `_clearForNewGame()` (unloads
  video via `VideoController.unloadVideo()`, resets the playlist via
  `PlaylistManager.reset()`, blanks the Game Info form via
  `App._clearGameInfoForm()` — team identity is intentionally preserved) and
  load the new active game.
- Import reuses an empty active game (`seasonStore.isEmptyActive()`) instead of
  leaving a stray "Game 1" behind.
- `loadProject(file)`: a **season** file (`has .games`) replaces the season; a
  **legacy single-game** file (`has .plays`) is appended as a new game.

**Video is stored on the desktop build** — film files are copied into
`$APPDATA/seasons/<id>/films/<game-id>/` and auto-loaded via the asset
protocol on game open. On the **browser build**, video is NOT stored (too
large for localStorage); each game records its `videoFileName` and the coach
re-links the film when they open that game.

### Season Player Roll-Up + Progression (`season-manager.js`)
The Season modal is a *view* over `app.storage.seasonStore` — it owns no game
data. Every read goes through `_effectiveGames()`, which calls
`storage.commitActive()` then returns `seasonStore.gamesChrono()` (games sorted
by `gameInfo.date`), so the live game is always reflected. The active game is
highlighted and clickable rows switch games.

- **Season totals**: `StatsEngine.compute(allPlays)` over every game's plays
  renders the same four box-score tables as season roll-ups; player names merge
  every game's roster + the live roster (`_mergeRoster` →
  `statsEngine._seasonLabels`).
- **Season Progression** (`_renderProgression`): splits the chronological games
  into first half vs. second half and compares Success Rate, Yards/Play, 3rd
  Down %, TDs/Game, and Turnovers/Game — flagging each **Improving / Slipping /
  Steady** (deadzone per metric) with a headline ("Getting better: … / Needs
  work: …"). This is the "better at X, worse at Y over the season" view.
- Included in the exported season HTML report (titled by `seasonName`).

## Import / Export

### Play Import (CSV / Hudl)
Accessible via More → Import Plays. Supports:
- CSV file upload or paste-from-spreadsheet
- Auto-detects delimiter (tab/comma/semicolon)
- Smart column mapping with Hudl aliases (`ODK`→playType, `GnLs`→yardage, `Dn`→down, `Dist`→distance, `Off Form`→formation, etc.)
- Interactive column remapping UI before import
- Preview of first 5 rows
- Creates play objects without timestamps (for stats-only migration from other tools)

Methods in `StorageManager`: `importPlaysFromText(text)` parses CSV and returns column mapping; `applyPlayImport(parsed)` creates plays.

### Roster Import
In the Roster panel: Import button reveals a paste area + file chooser. `RosterManager.importFromText(text)` handles parsing with header detection.

### CSV Export
`StorageManager.exportCsv()` — all plays with full tag fields including the
multi-select Formation (`"Pistol + Spread"`), the **Run/Pass** column, player
attribution, and grades. CSV import recognizes a `Run/Pass` (or `RP`) column.

### HTML Report Export
`StorageManager.exportHtmlReport(statsEngine)` — styled standalone HTML with all stats sections.

### Call Sheet / Practice Script (`call-sheet-builder.js`)
More → **Call Sheet** opens a builder that buckets tagged plays by situation
(Openers, 1st & 10, 2nd/3rd & long/med/short, 4th down, red zone, goal line,
backed up, 2-min, 4-min), ranks each bucket by **EPA** (or yards / recency),
and renders a printable document in three layouts: **Wristband** (3-up compact,
4×6in page), **Full Call Sheet** (letter, 2-col), and **Practice Script**
(letter table with a blank Result column to write in).

Each play shows its **call** — formation + personnel + play type, plus the
coach's per-play `notes` in quotes (where the real call like "Power R 34 Lead"
is typically typed) — and a compact **performance tag** (`TD 48`, `+11`, `Inc`,
`Sack -6`) so an EPA-ranked sheet shows why a call is ranked. Output opens in a
new window and auto-triggers print-to-PDF. `_playLabel` / `_playResult` build
the text; `_gather(rankMode)` does the bucketing + ranking.

## Opponent Scouting Mode

Set "Film shows" to **Opponent Scout** in Game Info to reveal the scouting panel.

**Workflow**: tag opponent film normally (their formations, play types, results), then click "Generate Scout Report" for a tendencies-focused dashboard:
- Run/pass ratio and avg yards overview
- Formation tendencies with run/pass split per formation
- Down & distance situation tendencies (top 15)
- Defensive front and coverage frequency (when tagging their D)
- Red zone and third-down conversion rates
- Exportable as standalone HTML scouting report

Methods in `StatsEngine`: `generateScoutReport()`, `renderScoutReport()`, `_exportScoutReport()`.

### Scout an opponent you've already played — no re-tagging (v1.9.17)

Opponent Scout mode above is for **fresh** opponent film (e.g. their game vs
someone else). But if you've **already played** an opponent, their tendencies
are already in that game — just on the other side of the ball — so re-tagging is
redundant. The **🔍 Scout Opponent** button in the stats dashboard header
generates an opponent report by **auto-aggregating every game you've tagged
against them, across ALL seasons**, with zero re-tagging:

- **Their offense** ← your **defensive** snaps (in a game you played, a
  `unit:'defense'` play carries the formation / play type / result you *faced* =
  their offense). Fed straight into `generateScoutReport(offPlays)` for run/pass,
  formation tendencies, and down & distance.
- **Their defense** ← the fronts & coverages you faced on your **offensive**
  snaps (`unit:'offense'` plays' `defFront` / `coverage`).
- A `perspective:'scout'` game (their film, tagged directly) is taken **as-is**
  (offense = offensive snaps, defense = defensive snaps).

**Cross-season aggregation** (`_allSeasonGames`): the current season comes from
`seasonStore.data` in-memory (freshest, after `commitActive`); other seasons are
read straight from `localStorage ffa_season_<id>` (enumerated via `ffa_library`),
so two years of reps against the same team roll into one sheet. Browser-path
only; on desktop other seasons live in files (the current season still works).
Honest limitation: the *formation* breakdown is only as rich as how often you
tagged the formation you were facing on defense (down/distance + run/pass are
always there).

Methods in `StatsEngine`: `generateOpponentScout(opponentName)`,
`renderOpponentScout(opponentName)`, `_allSeasonGames()`, `_activeOpponent()`.
Verified by `tools/e2e-season-tab.mjs` Test 16. (This delivers the backlog's
"reusable opponent — aggregate across every game/season" idea for the scouting
use case.)

## Self-Scout Report

The flip side of opponent scouting: run the same lens on **your own offense**
to reveal what tendencies you're *tipping*. Opened via the **Self-Scout**
button in the stats dashboard header (analyzes your own tagged offensive
plays — no perspective gate, unlike Opponent Scout). Run/pass-classifiable
offensive plays only (`unit === 'offense'` and `isRun || isPass`).

**Output**:
- **Predictability Index (0–100)** — sample-weighted measure of how lopsided
  your run/pass mix is across formations & down-and-distance (`(avgMaxPct −
  50) × 2`, weighted by bucket sample, buckets need n ≥ 3). Labeled Balanced
  (<30) / Moderate (<50) / Predictable (<70) / Very Predictable (≥70), with a
  colored meter (green→amber→red).
- **Your Top Tells** — ranked table of the situations where you're most
  readable, drawn from Formation, Down & Distance, Personnel, Hash, and the
  combined **Formation × Down** view a DC actually keys on. A "tell" needs
  n ≥ `_SELF_SCOUT_MIN_N` (4) and a lean ≥ 70 % one way; ranked by
  `(leanPct − 50) × min(n, 12)`, de-weighted when the lean is *working*
  (verdict dominant/effective vs exploitable — a lopsided split that's
  productive is a strength, not a leak). Lean shown as a fill bar (amber =
  run, blue = pass). **Each tell is clickable to film**: the row carries a
  `cutType`/`cutVal` (`_buildCutFilter` cases `formation` / `dd` / `personnel`
  / `hash` / `comboFD`) and renders as a `.cut-row`, so the dashboard's shared
  cut-up wiring plays exactly the plays composing the tell — "show me those 11
  snaps", not a static number.
- **Predictability Map** (`_selfScoutMatrix` / `_renderSelfScoutMatrix`) — a
  Formation (rows) × Situation (cols) heat-map, the coordinator's mental grid.
  Columns are the spots a DC keys on: 1st and 4th collapse to the down
  (`_matrixSit`); 2nd & 3rd bucket by distance (Short/Med/Long). Cells are
  colored by **lean intensity** — red = predictable tell, green = balanced
  (`_meterColor((leanPct−50)×2)`) — NOT by volume like the offense-tab
  Tendency Matrix, so your leaks pop. Faint cells = small samples (n<3). Each
  populated cell is **click-to-film** via the `comboFS` cut
  (`formation__situation`, `_situationPred`). Only renders with ≥2 formations
  and ≥2 situations of data.
- **Distance buckets, not exact yards** — down & distance groups on
  Short (1-3) / Medium (4-6) / Long (7+) via `StatsEngine._distBucket()` +
  `_ddKey()`, the way coordinators game-plan. Bucketing keeps per-situation
  samples large enough to mean something (15/20 on "3rd & Long" is a pattern;
  3/4 on "3rd & 7" is noise). Keys are `down|bucket` (e.g. `3|Long`);
  `_ddPretty()` renders the bucket form, the legacy exact form, and bare downs.
- **Recommendations name the "so what → now what"** — each exploitable tell
  pairs the threat (what the defense does: "a DC keys run — loads the box and
  cheats a safety down") with the constraint that breaks it ("add play-action,
  a quick throw, or a screen off the same look"), via
  `StatsEngine._offenseTellCounter(lean)`.
- **By Formation / By Down & Distance / By Personnel** split tables with a
  tell-vs-balanced flag per row.
- **Personnel → Formation Diversity** (`_personnelFormationDiversity`,
  `_renderPersonnelDiversity`) — flags personnel groups that map to only 1–2
  formations. A group at ≥90% one formation is **Locked** (the DC reads the
  huddle and knows the look); 75–89% is **Leaning**. Each row shows a stacked
  distribution bar and is **clickable to film** (`personnel` cut). Also surfaces
  as a **Personnel Tell** insight in Film Room Insights when ≥80%.
- **Film Room Insights** (`_findInsights`) — non-obvious patterns: hidden
  weapons (the rare counter-call that overperforms), motion tells, direction
  tells, formation×play-type outliers, half-to-half shifts, personnel tells,
  struggle spots.
- **Exportable** as a standalone HTML report (`self_scout_<team>.html`).

**Defensive Self-Scout** (`generateDefensiveSelfScout()`): companion analysis
for the defense, rendered as a `.ss-def-section` block in both the **Self-Scout
TAB** and the **Defense TAB**. Sources defensive plays directly from
`tagger.plays` (filtered `unit === 'defense'` + any scheme tag), NOT from
`_currentPlays()` (which gates on offensive `playType` and would silently drop
pure-defense plays). Shows scheme tells: front/coverage combos that correlate
with down/distance, blitz frequency patterns, and coverage tips — also
**clickable to film** (`ddDef` cut = the situation's defensive snaps;
`defFront`/`coverage` cuts = all snaps with that scheme element). The dashboard
pre-computes `defScout` once and passes it to both tab renderers (dedup).

Methods in `StatsEngine`: `generateSelfScout()`, `renderSelfScout()`,
`_exportSelfScout()`, plus helpers `_selfScoutGroup()`, `_selfScoutRows()`,
`_tellsFrom(groups, dim, fmt, cutFn)`, `_offenseTellCounter()`,
`_predictabilityIndex()`, `_distBucket()`, `_ddKey()`, `_ddPretty()`,
`_personnelFormationDiversity()`, `_renderPersonnelDiversity()`,
`_exportPersonnelDiversity()`.
`generateDefensiveSelfScout()`, `_defTellsFrom(groups, dim, fmt, cutFn)`,
`_renderDefScoutSection()`, `_defScoutBlock()`, `_defScoutEmptyState()`.

> The self-scout research that drove this (how elite HS / college / NFL staffs
> self-scout: cross-dimensional tells, distance buckets, success-paired
> urgency, tendency breakers, "so what → now what", the coordinator's
> Formation × Situation grid) is the design north star. Still to do:
> trend-over-games ("are we getting more predictable as opponents bank film?",
> needs the season play set fed via `generateSelfScout(playsOverride)`).

## Multi-Angle Video Sync (`multi-angle.js`)

Load two camera angles (e.g. sideline + end zone) time-locked together.

**Architecture**: master/follower pattern — the primary `VideoController` drives
time; `MultiAngle` mirrors play/pause/seek/rate to `<video id="videoPlayer2">`
with drift correction (threshold 0.15 s).

**View modes** (cycled via `#angleViewMode` select):
- **Toggle** (default on narrow screens) — z-index stacking, `V` key or
  `btnSwapAngle` swaps which angle is on top.
- **Side-by-Side** (default on ≥1100 px) — flex 50/50, both visible, active
  angle gets a blue outline.
- **PiP** — angle 2 overlays angle 1 at 28 % in the bottom-right corner.

**HTML structure** (inside `#videoContainer`):
```html
<div class="angle-wrapper" id="angleWrapper1">  <!-- primary video + canvas -->
<div class="angle-wrapper angle-wrapper-2" id="angleWrapper2">  <!-- secondary -->
```
`CanvasOverlay` attaches to `#angleWrapper1` (not `#videoContainer`) so the
canvas sizes correctly in SBS mode where each wrapper is 50 % width.

**Controls strip** (`.angle-controls`, between playback controls and timeline):
`+ Angle` button, file input, view-mode select, swap button (⇄), sync-offset
number input, remove button (✕). All hidden until angle 2 is loaded.

**Events**: `view-changed`, `angle-loaded`, `angle-removed` — `App` listens to
trigger `canvas._syncSize()` via `requestAnimationFrame`.

**Key method**: `loadAngle2(file)`, `removeAngle2()`, `swapActive()`,
`setViewMode(mode)`, `_syncTime()`.

Cleans up on `video-unloaded` (primary video removed → angle 2 auto-removed).

## Tag Form UI (Chip-Based)

The tag form uses **chip buttons** instead of dropdowns. Each field is a `div.pick-group` containing `button.pick` elements. The `ChipField` wrapper class (in `play-tagger.js`) provides `.value` get/set and `change` events so the rest of the code interacts with chip groups identically to native `<select>` elements.

**Multi-select chips**: `ChipField(el, { multi: true })` allows multiple chips
active at once; `.value` then returns a `" + "`-joined string (e.g. `"Pistol +
Spread"`). **Formation**, **Play Type**, **Result**, and **Blitz** are
multi-select. The string interface is unchanged, so all consumers still treat
it as a plain string; analytics split on `" + "` and attribute the play to each
component (see `StatsEngine.splitFormations`, `splitPlayTypes`, `splitResults`,
`splitBlitzes`).

### Unit Toggle (Offense / Defense / Special Teams)

A per-play segmented toggle (`#tagUnit`) at the top of the form drives the
**layout** — it reorders/collapses side-specific fields rather than hiding
data. Stored on `play.tags.unit`; new plays default from the Game Info "Film
shows" perspective via `tagger.defaultUnit` (set by `App._bindScoutMode`).

**Sticky side**: the unit is "persistent until changed" — manually changing the
toggle updates `tagger.defaultUnit`, and **Save & Next carries the side forward**
to the next *untagged* play (`nextPlayWithSituation` applies `carryUnit` when the
next play has no explicit `tags.unit`). So a coach tagging a series of defensive
snaps picks Defense once instead of every play. An already-tagged play keeps its
own unit (the carry never overwrites).

Only Formation/Personnel (offense) and Def Front/Coverage/Blitz (defense) are
side-specific; everything else (Play Type, Result, Yardage, Down & Distance,
Players, situational) is shared. The toggle:
- **Offense**: offense group leads; **defense group collapses** into a one-tap
  "Defense Faced" header (still chartable, e.g. offense vs Cover 2); ST hidden.
- **Defense**: defense group leads (CSS `.mode-defense .group-defense{order:-1}`);
  offense group collapses into "Offense"; ST hidden.
- **Special Teams**: ST group (ST Play Type + Kicker/Returner) shows; offense &
  defense groups hidden.

`PlayTagger.applyUnitMode(unit)` toggles `.mode-*` on `#tagForm` and
`.is-secondary` / `.is-hidden` / `.collapsed` on the `.tag-group` wrappers
inside `.tag-side-groups` (a flex column so `order` can reorder them). Group
headers (`.tag-group-head`) are clickable to expand/collapse the secondary side.

**Field order** — follows the chronological order a coach tags a play
(pre-snap → post-snap), not a "most-important-first" order:
1. Unit toggle — Offense / Defense / Special Teams
2. Down & Distance — 4 chips + input (known pre-snap; usually auto-filled)
3. Side groups — Offense (Formation **[multi-select]**, Personnel) / Defense (Def Front, Coverage, Blitz) / Special Teams (ST Play Type, Kicker, Returner) — the alignment you read pre-snap
4. Run / Pass — 2 chips (`#tagRunPass`, `play.tags.runPass`). The authoritative run/pass classifier. Auto-fills when an unambiguous Play Type is picked (Run* → Run; Pass/Screen → Pass); left blank for RPO / Play Action / Trick for the coach to set. `StatsEngine.isRun()/isPass()` consume it (fallback to playType-string inference for legacy plays).
5. Play Type — 9 chips, **multi-select** (an RPO can be tagged with its realized look, e.g. RPO + Short Pass)
6. Result — 15 chips (incl. **Good** / **No Good** for 2-Pt/XP/FG conversion success)
7. Yardage — magnitude input (positive) with +/− nudge buttons; the Result chip (Loss/Sack) sets the sign, so no minus is typed
8. Players — 6 role inputs (BC/Passer/Receiver/Tackler/Kicker/Returner) + grade selects + quick-pick chips
9. Play Notes — textarea (the real call, e.g. "Power R 34 Lead")

**Collapsed section** ("Situation & Details"):
Hash, Quarter, Field Position, Drive, Custom Tags

**Navigation bar**: ← Prev | Save & Next → | Skip

**Save & Next behavior** (`App._advancePlay`, shared by the button, the Skip
button, and the Enter shortcut): commits any focused field (yardage/notes),
then advances. The fields already auto-save on change, so "Save" is a flush;
"Next" is the advance. Advance order: (1) next play in the list — which in
folder/multi-clip mode also switches to that play's video via the
`play-selected` → `switchToClipByPlayId` handler; (2) if there's no next play
but more **video clips** remain, jump to the next clip so a folder upload keeps
flowing video-to-video; (3) otherwise show a brief "Last play" toast.
`PlayTagger.nextPlay()` also handles a null current selection by jumping to the
first play, so the button is never a silent no-op when plays exist.

Special-teams stats (return game, kicking/punting) roll up in
`StatsEngine._individualStats` from `players.returner` / `players.kicker` keyed
on `stType`, and render as extra tables in the stats dashboard.

### Marking start/end is OPTIONAL (clip-per-play film)

Game film usually arrives pre-cut, one clip per play, so the coach must never
be forced to mark boundaries before tagging:

- **Folder / multi-clip mode** (`PlaylistManager._autoCreatePlays`): each clip
  auto-creates a whole-clip play; the first is auto-selected, form live.
  **Re-adding film** (`addFiles`, v1.9.25): append-only (never wipes tagging).
  Files whose name matches a **saved** play (reopened game, stale/null clipId)
  re-link automatically by filename (`_relinkSavedPlays`). Files whose name
  matches a **live** clip prompt a Windows-conflict-style dialog
  (`PlayTagger._choiceDialog`): **Skip** (re-add the folder, import only what's
  new) or **Re-link** (repoint the existing tagged play at the freshly-selected
  file + refresh its video, keep tags). Dedup key is the filename (minus ext) —
  keep clip names stable across sessions.
- **Single video** (`App` `video-loaded` handler → `PlayTagger.
  createWholeVideoPlay`): loading a video into an **empty** game auto-creates
  Play 1 spanning the whole file (flagged `autoFull`) and selects it — tag
  immediately, no marking. Games with existing plays (reopened save, CSV
  import) are untouched.
- **Continuous-film workflow still works**: the first manual `[`/`]` mark
  **re-times** the pristine placeholder (`PlayTagger._wholeVideoPlaceholder`:
  sole play, `autoFull`, untagged) instead of stacking a second play; later
  marks add plays as before. Once the placeholder is tagged or re-timed it's a
  normal play.
- **Form guard** (`_updateFormEnabled` / `.form-disabled`): the tag form
  disables only when NO play is selected (rare now — empty game with no
  video). Clicking the gray form toasts contextual guidance and pulses the
  amber hint banner; the nav bar stays active. Never let the disabled form sit
  silent — it reads as a bug (field-reported).
- Regression harness: `tools/e2e-mark-flow.mjs` (real video + real button
  clicks; the other harnesses select plays via API).

### Clear Tags vs Delete Play (play-control bar)

Two distinct destructive actions live in `.video-play-controls`:
- **Clear Tags** (`PlayTagger.clearCurrentTags`) — resets the current play's
  tag values + notes back to blank but keeps the play segment and the loaded
  video, so you can re-tag the same snap. Always also clears the on-screen form
  (even when no play is selected) so the button has an obvious effect. Shows the
  confirmation modal first.
- **Delete Play** (`PlayTagger.deleteCurrentPlay`) — behavior depends on mode:
  - **Folder / multi-clip mode** (play has a `clipId` in the playlist): drops
    the play *and* its clip via `PlaylistManager.removeClip()`, which revokes
    the clip URL, fixes the active index, and **switches to the adjacent clip**
    (forward — the next clip slides into the deleted slot). The player stays
    loaded and a valid current play is selected, so Save & Next keeps working.
    Only when that empties the playlist does it unload the player. (Previously
    it always called `unloadVideo()`, orphaning the remaining clips and forcing
    a full folder re-upload — the bug this path fixes. Requires
    `tagger.playlist`, wired in `App` constructor.)
  - **Single-video mode** (no clip): removes the play **and** unloads the video
    from the player (`VideoController.unloadVideo()` revokes the object URL,
    clears `<video>`, restores the placeholder).
  - The **source file on disk is never touched** — browsers can't delete local
    files; this only clears the player. Confirms first.
- Both fall back to the play-selector value when `currentPlayId` is null (plays
  loaded/imported without an explicit re-select).

### In-app confirmation modal

`PlayTagger._confirmDialog(message, confirmLabel)` builds a lightweight modal
(`#ffaConfirmModal`, `.ffa-confirm-*` CSS) and returns a `Promise<boolean>`.
**Use this instead of `window.confirm()`** for in-form destructive actions:
browsers suppress repeated native `confirm()` dialogs ("prevent additional
dialogs"), which silently returned `false` and made Delete look broken. Enter /
the confirm button resolve true; Esc / Cancel / backdrop resolve false; keydown
is captured so the app's tagging shortcuts don't fire underneath.

### Tagging-speed & coaching tools

- **Loop / A-B** (`VideoController`): `btnLoop` toggles looping the selected
  play (`currentPlayRegion`, kept synced by App on `play-selected`); `A`/`B`
  set a custom loop region. `timeupdate` jumps back to `loopRegion.start`.
- **Same as Last + templates** (`PlayTagger`): `copyFromPrevious()` carries
  `SCHEME_KEYS` (formation, personnel, run/pass, play type, defense, hash) from
  the prior play; named templates persist in `localStorage ffa_play_templates`
  (`saveTemplate`/`applyTemplate`/`deleteSelectedTemplate`).
- **Custom tag fields** (`custom-fields.js`): coach-defined categories
  (chips or text). Defs in `localStorage ffa_custom_fields`; per-play values in
  `play.tags.customFields`. Inputs reload via the `tagger.onLoadForm` hook;
  CSV export appends a column per field.
- **Play diagram** (`play-diagram.js`): per-play X's & O's stored as normalized
  shapes on `play.diagram` (saved with the project). `PlayDiagram.draw()` /
  `toDataURL()` are static renderers reused by the tag-form preview and the
  Call Sheet (thumbnails on the Full layout).
- **Visualizations** (`visualizations.js`): SVG field-zone success strip,
  yardage spray scatter, and quarter run/pass mix, injected into the stats
  dashboard. Self-contained run/pass + success helpers (mirror StatsEngine).

> **Build note**: new JS modules must be added to the `build.sh` file list
> *and* imported in `app.js` (or their consuming module) — the modular
> `index.html` needs the import; the bundle needs the build-list entry.

### Video robustness (freeze fixes)

`VideoController` guards against the common "frozen player" causes: `play()`
promise rejections are caught; scrubbing pauses playback then resumes on
release (avoids seek-queue buildup); `waiting`/`stalled`/`seeked`/`error`
events toggle an `is-buffering` class that shows a spinner; the `<video>` has
`playsinline`. Native `<select>` arrows are replaced with a larger custom SVG
chevron (cascade-proofed with `!important` against class-based `background`
shorthands).

**Asset-protocol error diagnostics** (desktop only): when a video load fails
and the URL is an `asset.localhost` or `asset:` URL, the error handler shows a
**visible toast** with the error code, message, and full URL so the coach (or
support) can diagnose without opening dev tools. The `_autoLoadFilm` path also
probes the first asset URL with a HEAD fetch before loading videos, surfacing
protocol/scope issues early. All diagnostic output uses `console.warn` (not
`console.error`) so the e2e harness doesn't flag it.

### Shortcuts Legend
A **Shortcuts** button in the top bar (always visible, even on the first screen
before a video loads) and the **`?`** key open a keyboard-shortcuts legend
modal (`#shortcutsModal`, wired by `App._bindShortcuts`). It groups shortcuts by
Playback / Tagging / Drawing / General. While open it swallows other keys; Esc,
the × button, or a backdrop click closes it.

### Keyboard Shortcuts (active when a play is selected)
| Key | Action |
|-----|--------|
| R, O, S, P, M, D, A, Q, X | Play type (Run In, Run Out, Screen, Short, Med, Deep, PA, RPO, Trick) |
| G, L, N, I, T, W, U, F, E, K | Result (Gain, Loss, None, Inc, TD, Sack, INT, Fum, Pen, Punt) |
| C | Cycle unit toggle (Offense → Defense → Special Teams) |
| 1-9 | ST play type (only in Special Teams mode) |
| Shift+1-4 | Down number |
| Enter | Save & advance to next play (carries down & distance forward) |
| Space | Play/Pause video |
| V | Swap multi-angle view (when angle 2 loaded) |
| [ / ] | Mark play start / end |
| 1-6 | Drawing tools (when no play selected) |

### Auto Down & Distance
When **Auto down & distance** is on (checkbox above the nav bar; persisted in
`localStorage` as `ffa_auto_dd`), advancing to the next *untagged* play
pre-fills its down, distance, and field position from the previous play's
result (`PlayTagger.computeNextSituation` / `applyNextSituation`). First downs
reset to 1st & 10 (goal-to-go aware); 4th-down stops and possession-ending
results (TD, turnover, punt, FG, penalty) leave the next play blank for a fresh
start. Existing tags are never overwritten. Field position only advances for the
offense unit (yardage is from the offense's perspective).

### Quick Chart Mode
A separate keyboard-only overlay (toggled via top bar button) for power users who want to tag 60 plays in ~5 minutes. Adds yardage via number keys, player numbers, auto-advance on Enter. See `js/quick-chart.js` header comment for full key map.

## Claude Vision API Integration

**File**: `js/vision-analyzer.js`

Sends video frames to Claude's vision API for AI-assisted tagging. Currently a **suggestion tool** — accuracy is limited by what a general vision model can determine from static frames. Manual tagging is the primary workflow.

**How it works**:
1. Extracts 8 JPEG frames at key moments (pre-snap through result)
2. Sends frames with a detailed football analysis prompt to Claude
3. Extended thinking enabled (10K token budget) for reasoning
4. Response parsed into `{ tags, confidence, reasons }` shape
5. Values validated against allowed enums with fuzzy matching

**Config** (set in Game Info panel):
- API key stored in `localStorage` only (never in project save files)
- Model selector: Opus (most accurate, ~$0.60/play) vs Sonnet (faster, ~$0.13/play)
- Default: `claude-opus-4-6` with `anthropic-version: 2025-04-15`

**Key lesson**: General-purpose vision models cannot reliably auto-tag football plays. Professional tools (Hudl, Catapult) use either human taggers or custom ML models trained on millions of labeled plays. Our AI integration works best as a suggestion engine, not a definitive tagger.

### AI Auto-Tagging Direction — Decided, Deferred

The current 8-frame-still approach (`vision-analyzer.js`) proved the concept but
hit a ceiling: static JPEGs from amateur film angles don't carry enough signal
for scheme-level recognition (formation variants, coverage shells, blitz
packages). Three things have changed since:

1. **Video-native models** (Gemini, Claude with video, fine-tuned sport models)
   can ingest whole clips — motion, cadence, and blocking assignments are visible
   in video but invisible in stills. Replace the 8-frame extraction with a
   whole-clip pass once the API supports it cost-effectively.
2. **Native compute pipeline** (Tauri desktop): persistent film library means
   clips are on disk, not re-linked per session. A background sidecar can run
   inference on every clip at import time, cache results, and present them when
   the coach opens the play — no waiting.
3. **Data flywheel**: every coach correction to a suggestion is a labeled
   training example. Over a season the app accumulates hundreds of labeled clips
   from *this team's* film style. Fine-tuning or few-shot prompting from that
   corpus closes the accuracy gap that a general model can't.

**Field viability tiers** (what AI can realistically tag):

| Tier | Fields | Confidence | Notes |
|------|--------|------------|-------|
| **Green** | Play boundaries (start/end), Run/Pass | High (80%+) | Motion detection already works for boundaries; run/pass is the easiest classification task from video. Ship as auto-filled. |
| **Yellow** | Formation, Ball Carrier (#), Yardage estimate | Medium (50–70%) | Requires decent camera angle. Pre-fill as suggestion with confidence score; coach accepts or corrects. |
| **Red** | Coverage, Blitz, Defensive Front, Personnel grouping | Low (<40%) | Requires pre-snap reads that even trained humans debate from a single angle. Show only when confidence exceeds a threshold; never auto-fill. |

**Recommended approach — "AI-assisted" not "auto"**:
- First pass pre-fills **green-tier** fields on every play at import time
  (background, no UI block). Coach sees them already filled when they open a
  play.
- **Yellow-tier** suggestions appear as ghost chips (dimmed, with a confidence
  badge). Tap to accept, tap a different chip to correct. Correction overwrites
  the suggestion and feeds the flywheel.
- **Red-tier** fields stay blank unless the model is >70% confident, in which
  case a subtle "AI suggests: Cover 3" hint appears below the chip group. Never
  auto-selects.
- A per-play **confidence summary** (e.g. "AI: 4/7 fields, avg 72%") lets the
  coach decide at a glance whether to trust the pre-fill or tag from scratch.
- All suggestions are non-destructive: coach tags always win, and the raw AI
  output is stored on `play.analysis` for later review/retraining.

**Prerequisites before building**:
- Persistent film library (Tauri native #1) — clips must be on disk for
  background inference and the training-data flywheel.
- Video-capable API endpoint — whole-clip analysis replaces the 8-frame approach.
- UI for ghost chips / confidence badges — small play-tagger extension.

**Not planned**: fully autonomous tagging ("load film, get a finished game
file"). The coaching eye is the product; AI reduces keystrokes, it doesn't
replace judgment.

## Build System

`build.sh` concatenates all JS modules into `football-film-analyzer.html`:
- Strips `import`/`export` statements
- Inlines CSS and SVG sprite
- Rewrites SVG `href` paths

**Important**: All JS files share one function scope in the built bundle. Variable name collisions between files will cause runtime errors. Each file's top-level `const`/`let` declarations must be unique across the entire codebase.

### Deploy to GitHub Pages

The live site serves from the **`gh-pages` branch**, NOT the feature branch.
After building, deploy by copying the bundle into both `index.html` and
`football-film-analyzer.html` on `gh-pages` (a git worktree is the clean way),
then push. Pushing only to the feature branch does **not** update the live URL.

Concrete recipe (worktree, never edit `gh-pages` files by hand — they are
verbatim copies of the bundle):
```bash
git fetch origin gh-pages
git worktree add /tmp/gh-pages-deploy gh-pages
cp football-film-analyzer.html /tmp/gh-pages-deploy/index.html
cp football-film-analyzer.html /tmp/gh-pages-deploy/football-film-analyzer.html
cd /tmp/gh-pages-deploy && git add -A && git commit -m "Deploy: <summary>" && git push origin gh-pages
git worktree remove /tmp/gh-pages-deploy   # from the repo root
```
> Before overwriting, sanity-check that `gh-pages` only ever receives "Deploy:"
> commits (`git log --oneline`) — it does, so the bundle is the source of truth.
> A past deploy added a stray Google-Fonts `@import`; the source uses system
> fonts now, so dropping it on the next deploy is expected, not a regression.

### Cutting a Desktop Release (Tauri auto-update)

**This is the routine — don't re-derive it. ~9 releases cut this way (v1.0.0+).**

The live desktop app updates via the Tauri auto-updater, which polls the GitHub
Releases `latest.json`. A release is published by **pushing a `v*` tag**, which
triggers `.github/workflows/build-desktop.yml`: it copies
`football-film-analyzer.html` → `dist/index.html`, builds **signed** installers
on real OS runners (Windows `.msi`/`.exe`, macOS `.dmg`, Linux `.deb`/`.AppImage`),
and publishes a GitHub Release with the updater artifacts + `latest.json`.
(`workflow_dispatch` only uploads artifacts — it does **not** publish a release /
`latest.json`, so it does **not** update the auto-updater.)

Steps to ship version `X.Y.Z`:
1. **Rebuild the bundle** (`bash build.sh`) so the desktop frontend has the
   latest code, and make sure it's committed.
2. **Bump the version in all three** `src-tauri` files (they must match):
   `Cargo.toml` (`version`), `tauri.conf.json` (`version`), and `Cargo.lock`
   (the `gridiron-iq` package entry). **Also bump `APP_VERSION` in `js/app.js`**
   — that constant is the version the *web* bundle displays (the More-menu
   footer). The desktop build overrides the displayed version at runtime from
   the Tauri config, so web and desktop can legitimately show different numbers
   (independent release cadences); keep `APP_VERSION` aligned with whatever web
   bundle you deploy, not necessarily the desktop tag.
3. **Commit + push** the bump to the feature branch
   (`claude/football-film-analyzer-GRiCW`).
4. **Push the tag** (this is the trigger):
   ```bash
   git fetch origin
   git tag vX.Y.Z <commit-sha>      # the version-bump commit
   git push origin vX.Y.Z
   ```

> ⚠️ **The agent environment can push branches but NOT tags** (tag pushes return
> HTTP 403; the GitHub MCP tools don't expose tag/release creation either). So
> the agent does steps 1–3, then **hands the coach the exact step-4 commands to
> run locally**. This is by design — it's how every release has been cut.

> ⚠️ **The agent environment sometimes resets the local checkout to an old
> commit between turns.** All real work lives on the remote. If `git log` looks
> stale, recover with `git fetch origin && git reset --hard
> origin/claude/football-film-analyzer-GRiCW` (verify `git status` is clean
> first so no uncommitted work is lost), then `bash build.sh`.

**Windows SmartScreen caveat (unsigned build):** auto-update download+install
works, but Windows blocks the unsigned installer with "Windows protected your
PC / unknown publisher." The user must click **More info → Run anyway**; the
relaunch follows. Real fix (deferred, user's call): code-sign the build (Azure
Trusted Signing ≈ $10/mo, or an EV/OV cert). Until then, every update needs that
one manual click-through.

Deploying to `gh-pages` (web) and cutting a desktop release are **independent** —
do both when shipping a change to all users.

## Offline / Self-Contained Distribution

**Current status: the app is already ~95% self-contained.**
`football-film-analyzer.html` is a single ~640 KB file with all CSS, JS, and
icons inlined, and **no `type="module"`**, so it can be downloaded and opened
directly via `file://` (double-click) and runs **fully offline**. The core
workflow — load local video, mark/tag plays, stats, EPA, heat maps, cut-ups,
call sheets, roster, CSV/HTML export — makes **zero network calls**.

The only runtime network touches are **optional** features:
- **Claude Vision auto-tagging** → `api.anthropic.com` (needs API key; by design).
- **Local CV backend** → `127.0.0.1` (optional localhost server, not internet).
- **Scoreboard OCR** → lazy-loads `tesseract.js` from `cdn.jsdelivr.net` on first
  use. **This is the one core-ish feature that breaks offline.**

(`www.w3.org` references are SVG/XML namespaces — identifiers, never fetched.)

### Planned: Option 1 — PWA install + offline cache (chosen, execute eventually)

The agreed direction (deferred until current feature work wraps) is to make the
app an installable, guaranteed-offline PWA **without** abandoning the
no-build/single-file ethos:
1. **Web app manifest** (name, icons, `display: standalone`, theme color) so
   browsers offer "Install GridIron IQ" (desktop + mobile), with an
   app icon and its own window.
2. **Service worker** that precaches the app shell so it's guaranteed available
   offline after the first load (cache-first for the app, network-only for the
   optional API/backend calls).
3. **"Download offline copy" button** in-app that saves `football-film-analyzer.html`
   for true file:// portability.
4. **Graceful OCR degradation**: when offline (or the CDN is unreachable), the
   scoreboard-OCR feature should show a friendly "needs internet" note instead
   of failing silently. (Fully bundling Tesseract + WASM + lang data ≈ 10–15 MB
   was considered and rejected for now to keep the package lean.)

## Native Desktop (Tauri v2) — Built

The reliability ceiling of the browser sandbox (storage eviction, no free disk
access, File System Access being Chromium-only) led to shipping an **installed
desktop build via Tauri v2** alongside the web app. The Rust shell compiles and
produces working installers (`.deb`, `.rpm`, `.AppImage` on Linux; `.dmg` on
macOS; `.msi`/`.exe` on Windows). Storage goes through the `StorageBackend`
seam — `TauriBackend` uses the Tauri v2 fs plugin API (`mkdir`, `remove`,
`readDir` with `{ baseDir }` options). `TAURI.md` has the full build recipe
and production checklist. The web build remains the zero-install option for
other coaches to review.

### What native unlocks (the "less constrained" roadmap)

The browser forced the app to stay lean in specific ways; native lifts each
constraint. Prioritized for the desktop build:

1. **Persistent film library (SHIPPED).** On the desktop build, video files are
   now copied into the season's folder on disk
   (`$APPDATA/seasons/<id>/films/<game-id>/`) when loaded. Opening a game
   auto-loads the film via the Tauri asset protocol — no more re-linking every
   session. Supports both single-video and multi-clip (folder) modes. The
   browser build is unchanged (the feature gates behind `backend.supportsFilm()`).
2. **Real MP4 cut-up export.** Bundle `ffmpeg` as a Tauri sidecar so filtered
   plays / player cut-ups export as **actual video files** (the in-browser
   `cutup-exporter.js` is limited). Background rendering, no UI block.
3. **Cached per-play thumbnails / filmstrip.** Precompute and store frame
   thumbnails on disk → instant play browsing, filmstrip views, and **real
   images on the printed call sheet / reports**.
4. **Offline scoreboard OCR.** Bundle Tesseract + WASM + lang data locally
   (rejected on web for the ~10–15 MB size) → OCR works fully offline.
5. **Local ML auto-tagging.** Embed the existing Python/YOLO CV (`server/`) as a
   bundled sidecar instead of a separate localhost server; persist detections.
6. **Voice notes per play.** Coaches talk faster than they type — record short
   audio attached to a play (needs the storage headroom native provides).
7. **Unbounded history + multi-season library.** Larger restore ring, full
   annotation/version history, and a growing **opponent-scouting database** that
   carries tendencies year over year.
8. **System integration.** `.season` file association (double-click to open),
   drag-drop a folder of clips to auto-create games, native menus, auto-update.

Keep the **lean ethos** even when adding these: feature-detect native
(`window.__TAURI__`) and degrade gracefully on web, so the single-file browser
build stays fully functional. Heavy assets (ffmpeg, Tesseract, ML models) ship
only in the desktop bundle, never inlined into `football-film-analyzer.html`.

Still also valid for the **web** build: the PWA install + offline cache (Option
1 above) and graceful OCR degradation, independent of the desktop effort.

## Stats Engine Dependencies

The stats engine (`js/stats-engine.js`) computes:
- Run/pass ratio, play type distribution
- Success rate, average yards per play/type/formation
- Down & distance conversion rates
- Formation tendencies (with per-formation effectiveness: run/pass split, success%, avg)
- **"Big 12" core calls** (`_bigTwelveData` / `_renderBigTwelve`, v1.9.24) — rolls
  offensive snaps into formation·strength·motion → play "calls", ranks by
  frequency with cumulative %, and reports how few calls cover 75/90% of the
  offense (Hudl's scouting axiom: most offenses live in ~8-14 calls). The title's
  N is the actual 90%-coverage count. Rows are click-to-film via the `bigCall`
  cut filter (exact-call match); rendered on the Offense tab (ours, clickable)
  and inside the Opponent Scout (theirs, read-only). The first Hudl-research-doc
  feature (see [[feature-backlog]]).
- Play type effectiveness (same breakdown per play type)
- Defensive analytics (see below)
- Red zone, goal line, backed-up situational stats
- PAT / 2-point conversion success (`_conversionStats`, keyed on `stType`
  'XP'/'2-Pt' + Good/No Good result; computed from a broader play set than the
  playType-filtered stats so ST plays without an offensive playType still count)
- Expected Points Added (EPA) via `js/advanced-metrics.js`
- Per-player grades (avg from play.tags.grades)
- Game flow (cumulative yards play-by-play)
- Opponent scouting report (formation/down tendencies with run/pass splits)
- **Scoreboard** (`computeScoreboard`, `_renderScoreboard`) — a running score
  built from tagged scoring plays. `StatsEngine.playPoints(p)` scores each play
  (TD = 6, Safety = 2, made FG = 3, made XP = 1, made 2-Pt = 2; "made" = the
  explicit `Good` result or a `Touchdown`/`Field Goal` result). `scoringSide(p)`
  attributes points: Offense / Special Teams plays count for us, Defense plays
  for the opponent — **except** defensive scores (pick-six = `Interception +
  Touchdown`, scoop-and-score = `Fumble + Touchdown`, or `Safety`) count for us.
  The multi-select Result field handles this: tag a defensive play with both
  `Fumble` and `Touchdown` to record a scoop-and-score.
  Scoreboard section leads the dashboard with the final + a per-quarter table.
  Live mirror in Game Info: `App._updateTrackedScore()` shows a "Tracked"
  score that updates on every play change; "Apply →"
  (`_applyTrackedScore`) copies it into the editable Final Score fields.

### Game / Project Name

Game Info has a **Game / Project** field (`#gameProjectName`, stored on
`gameInfo.projectName`, schema unchanged — it's just another key). It labels the
project: `StorageManager._projectFileBase()` uses it (slugified) for the save
JSON + CSV filenames (falling back to the video name), and `_gameTitle()` uses
it as the stats-dashboard / report heading. Wired through `App._bindGameInfo`
/ `_saveGameInfo` / `_loadGameInfo` like the other Game Info fields.

### Persistent Team Identity (carry-forward across games)

Most `gameInfo` fields are game-specific (opponent, date, score) and live only
in the per-project save. But the **team-identity** fields — **team name** and
**jersey color** — carry forward to every new game so the coach never re-enters
them. Stored in `localStorage` under `ffa_team_profile` (`{ teamName,
jerseyColor }`), separate from any project save.

- `App._saveTeamProfile()` (called from `_saveGameInfo`) persists the last
  **non-empty** values, so editing another field while the name is blank — or
  an accidental clear — never wipes the saved identity.
- `App._applyTeamProfile()` (called at the end of `_bindGameInfo`) pre-fills the
  fields on a fresh session **only when empty**. A loaded project always wins:
  `_loadGameInfo` overwrites these when the project has its own values, and
  falls back to the carried-forward identity only when the project omits them.
- **Roster** already persists globally via `ffa_roster` (RosterManager). To stop
  an older project from wiping it, `StorageManager._deserialize` adopts a
  project's roster **only when it's a non-empty array** — an empty `roster:[]`
  no longer clears the coach's persisted roster.

### Visual Analytics (`js/charts.js`)

Pure-SVG chart primitives used throughout the stats dashboard — no external
libraries. All methods are static on the `Charts` class, returning HTML/SVG
strings. The module is imported by `stats-engine.js`.

**Chart types**:
- **Donut** (`Charts.donut`, `Charts.donutWithLegend`) — ring chart with center
  text. Used for run/pass split, yards breakdown, play type distribution, drive
  outcomes.
- **Gauge** (`Charts.gauge`) — semicircular arc meter for percentages. Used for
  success rate, run/pass success, 3rd/4th down conversion, red zone TD%, havoc
  rate.
- **Effectiveness Rows** (`Charts.effectivenessRows`) — horizontal bar chart
  where each row shows a fill bar split into run (gold) / pass (blue), with
  count, success%, and avg yards. Used for formations, play types, personnel.
- **Stacked Bar** (`Charts.stackBar`) — inline run/pass proportion bar. Used
  inside the Down & Distance table rows.
- **Game Flow** (`Charts.gameFlow`) — cumulative-yards line chart with per-play
  dots color-coded by run/pass. Shows momentum shifts at a glance.
- **Sparkline** (`Charts.sparkline`) — compact area line for inline use.
- **Mini Bar** (`Charts.miniBar`) — thin progress bar for table cells.

### Defensive Analytics (`_defensiveStats` / `_renderDefensive`)

Computes and renders a full defensive breakdown from the existing tagged fields
(`defFront`, `coverage`, `blitz`, `result`, `yardage`). Appears in the stats
dashboard between Tendencies and Personnel. Only renders when defensive data is
present.

**Summary cards (two rows)**:
- **Havoc Rate** — (sacks + TFL + turnovers) / total plays. TFL = negative
  yardage plays excluding sacks.
- Sacks (with sack yards), TFL, Turnovers (INT/Fum split)
- Blitz Rate (blitz-tagged plays / total), Blitz Havoc % (havoc plays when
  blitzing), Forced Incompletions, 3-and-Outs forced

**Breakdown tables**:
- **Defensive Front** — per front: plays, run/pass faced, yards allowed, avg,
  stop% (= 1 − offensive success rate), havoc%
- **Coverage** — per coverage: plays, completions, incompletions, INTs, sacks,
  yards, avg, stop%
- **Blitz Analysis** — per blitz type: plays, sacks, havoc%, avg yards, stop%
- **Front by Situation** — front usage split on early downs (1st, 2nd & short)
  vs passing downs (2nd & long, 3rd, 4th)

**Stop%** is the inverse of offensive success rate: the percentage of plays
where the defense held the offense below the down-adjusted success threshold
(1st: <50% of distance, 2nd: <70%, 3rd/4th: didn't convert).

Included in the text export (`_exportStats`). The scout report
(`generateScoutReport`) also shows front/coverage frequency but without the
per-scheme success metrics — the defensive analytics section is the deep dive.

**Dedicated Defensive Report**: the same `_renderDefensive(stats)` output is
also reachable as a first-class focused view via the **Defense** button in the
stats dashboard header (`renderDefensiveReport()`), with its own standalone
HTML export (`_exportDefensiveReport`). The inline dashboard section stays
hidden when there's no defensive data, but the dedicated view shows an
explanatory empty state (how to tag a Defense play / front / coverage / blitz)
so the feature is never silently missing. The section renders inline as the
2nd-to-last dashboard block, so the button is the quick path to it.

## Key Decisions & Lessons

0. **Design for long-term usability first; step back when work gets too tactical.**
   The single-shared-save model worked in a demo but broke down by game 2 — data
   loaded with no context and everything piled into one file. The fix was the
   library-first model the pro tools (Hudl/QwikCut) all use (Team → Season →
   Game → Plays). Lesson: when a thread gets deep in tactical fixes, pause and
   ask whether the *structure* serves the coach over a whole season. Prefer
   copying proven workflows from established tools over inventing new ones, and
   build the durable data model in from the start rather than retrofitting.

1. **Auto-tagging accuracy**: Tried three approaches — in-browser heuristics (poor), local YOLO server (marginal), Claude Vision API (functional but inaccurate for coaching use). Manual chip-based tagging is the primary workflow. **Play Tagger panel order** reflects this: Mark Start/End (primary) → play selector → tag form → "More tools" (OCR/suggestions) → a collapsed "Auto-Detect Plays (experimental)" section at the bottom. Auto-detect was demoted from the top since it isn't reliable yet.

2. **API key security**: Stored in `localStorage`, never in project JSON files. Uses `type="password"` input. Travels direct from browser to Anthropic API via `anthropic-dangerous-direct-browser-access` header.

3. **Tag value validation**: All enum fields validated against exact `<option>`/chip values. Fuzzy matching handles case/format differences. Non-matching values are dropped with console warning. This prevents silent dropdown failures and stat corruption.

4. **Unified undo/redo**: `HistoryManager` handles both play data changes and canvas annotations through a single Ctrl+Z/Y interface with fallback callbacks.

5. **Single-file deployment**: The app deploys to GitHub Pages as one self-contained HTML file. No build tools, no dependencies, no server required.

6. **No external libraries**: All parsing (CSV, roster import) uses pure browser JS. No SheetJS, Papa Parse, etc. This preserves the single-file no-dependency design.

7. **Event delegation for modals**: Season and import modals use document-level click delegation with `e.target.id` checks. Don't add `stopPropagation()` on modal containers — it breaks the delegated button handlers.

8. **Never trust `window.confirm()` for in-form actions**: browsers suppress repeated native dialogs, returning `false` and making actions silently no-op. Use `PlayTagger._confirmDialog()` (in-app modal) instead.

9. **Explicit > inferred classification**: run/pass was guessed from the play-type string, which broke on RPO/Play Action/Screen. The explicit `runPass` field is now authoritative (`StatsEngine.isRun()/isPass()`), with string inference kept only as a legacy fallback. When a tag drives core analytics, prefer an explicit field over parsing another field.

10. **Multi-value tags as delimited strings**: multi-select Formation stores `"A + B"` rather than switching the field to an array — this keeps every string consumer (save, CSV, call sheet, display) working unchanged. Analytics split on `" + "` and attribute the play to each component (percentages can exceed 100%, which is correct for overlapping looks). `StatsEngine.splitFormations()` is the canonical splitter.

11. **Backward compatibility by fallback**: new tag fields (`runPass`, multi-formation) degrade gracefully for plays/saves that predate them — empty `runPass` falls back to string inference; a single-formation string is just a one-element split. No schema migration needed.

12. **Inherited `color` is literal, not a live `var()`**: the app went light-theme (`--text` dark for the light canvas) while the stats overlays re-scope `--text` to a *light* value. But `.stats-body` set no explicit `color`, so it inherited the already-computed dark color from `<body>` — re-scoping the variable downstream does nothing for inherited values. Stats-table data cells (which had no explicit color) were dark-on-dark and invisible across the whole dashboard. Fix: set `color: var(--text)` directly on the overlay container so descendants inherit the light value. When a container re-scopes theme vars, also set the properties that should consume them, or inheritance silently keeps the old computed color.

13. **Theme vars are global; the app is light, the dashboard is dark**: the main UI (top bar, tag form) is a **light** theme (`--text: #0f172a`, white `--surface` chips); only the analytics overlays are dark, which they get by **re-scoping** the dark palette under `.stats-overlay` / `.season-overlay` / etc. (not at `:root`). A "make the dashboard look better" pass that drops a dark palette (`--text: #e6edf3`, dark `--bg-*`) into a global `:root` block leaks into the light tag form and renders chip labels near-white on white — unreadable. **Scope dashboard palette overrides to `.stats-overlay`, never `:root`.** Only truly global identity tokens (brand accent, run/pass chart colors) belong in `:root`, and even those must stay legible on the light theme's white surfaces (gold `#c9a227` is fine as a chip-hover/border accent but is low-contrast as body text on white).

14. **Tauri asset protocol is `http://`, not `https://`**: `convertFileSrc()` on Windows (WebView2) returns `http://asset.localhost/…` URLs. The CSP must list `http://asset.localhost` (not just `https://`). The mismatch silently blocked every video load with "Media load rejected by URL safety check" — no CORS error, no codec error, just a CSP violation. This was the multi-session desktop video playback bug across v1.7.6–v1.8.1. **Always test the actual URL scheme the runtime produces, not the one the docs imply.**

15. **Filter gates must match the data's unit**: `_currentPlays()` filtered on `playType` (an offensive field). Defensive plays tagged with only Front/Coverage/Blitz had no `playType` and were silently dropped before reaching `generateDefensiveSelfScout()`. Fix: `generateDefensiveSelfScout()` now sources from `tagger.plays` directly and filters for `unit === 'defense'` + scheme tags. **When a function serves a specific unit, gate on that unit's fields, not on a cross-unit field.**

16. **Enable devtools in production Tauri builds**: `features = ["devtools"]` in `Cargo.toml` so coaches (and support) can open the console with F12. Without it, diagnostic logging is invisible in production — the v1.7.6–v1.8.1 video bug was undiagnosable until devtools was enabled in v1.8.1. The devtools feature adds negligible binary size.

17. **Carry-forward must respect the unit; enforce per-unit field invariants**: the Save-&-Next alignment carry (`PlayTagger.applyCarryScheme`, `CARRY_SCHEME_KEYS`) copied `formation`/`personnel` into the next play's blank fields with no unit check. On a **special-teams** play — whose form *hides* the Formation/Personnel + Front/Coverage/Blitz groups, so the coach can't see or clear them — the carried formation stuck, then propagated snap-to-snap, coding **every ST play "Under Center"** (the first formation chip after the v1.9.x reorder) (v1.9.19). Fix was three-layered: (a) `applyCarryScheme` skips `unit:'special'` plays; (b) switching a play to ST (`setUnit` + the unit-toggle handler) strips the now-invalid alignment via `_stripStAlignment`; (c) `SeasonStore.stripStAlignment` (in `_normalize`) retroactively cleans plays already saved with the leak. The invariant — *a field a unit's form can't set must never hold a value for that unit* — is safe to enforce destructively precisely because the form makes it unreachable. When a feature carries/auto-fills data across plays, gate it on the target play's unit (cf. lesson #15: gate on the unit's own fields).

18. **Escape user text at the HTML sink, not the producer**: coach-entered text (player names, notes) renders into `innerHTML` across the dashboard *and* exported reports. The fix is to escape where the string meets `innerHTML` (`_playerLabelHtml` = `Charts._esc(_playerLabel(...))`), NOT inside the producer (`_playerLabel`/`roster.getLabel`) — the raw label also feeds **text** contexts (the cut-up banner's `textContent`, a chip's `.title`) where pre-escaping would double-encode (`A&amp;B` shown literally). One canonical escaper (`Charts._esc`, full `[&<>"']`); names/notes travel in importable season + CSV files, so this is stored-XSS-via-import, not just self-XSS — and even absent malice, an unescaped `<`/`&` in a name silently corrupts the table. Pinned by `e2e-core.mjs` (the escaper) + `e2e-season-tab.mjs` Test 19 (a payload name renders inert). (v1.9.21, from the whole-app code review.)

19. **Cross-game state must be game-scoped — and stress-test it, because the render gate won't catch corruption.** Two separate data-corruption bugs shipped: (a) `commitActive()` wrote the live tagger into whatever `activeGameId` named, with no check it matched the LOADED game, so a stale-tagger commit (after restore / mid game-switch) stamped one game's plays onto another and could drop a game entirely; (b) the undo `HistoryManager` stack was reset only on **season** load (`init()` doesn't even clear the stack), never on **game** switch, so an Undo after switching games restored the previous game's plays into the current one. Fixes: `StorageManager._loadedGameId` + a `commitActive` guard that refuses to write a mismatched tagger (v1.9.27), and `HistoryManager.reset()` called from `_loadActiveGame` on every game load (v1.9.28). The meta-lesson: **250+ green e2e assertions meant nothing here** — they tested synthetic *rendering* in isolation and never the *data* path (save/load, switch, restore, undo). `tools/e2e-integrity.mjs` closes that gap: it loads COPIES of real seasons into isolated storage and **fuzzes real operations**, asserting INVARIANTS after every step — **cross-game isolation** (an op declares which game it may touch; every other game must be byte-identical), lossless persist→reload, referential integrity (no two games share a clip name = the corruption signature), zero exceptions. It found BOTH bugs, fails loudly on the buggy code and is clean on the fixed code, and every fix carries a **failing-first** regression (Test 24 = the commit guard, Test 25 = undo scoping). When state is per-entity, assert it can never leak across entities, fuzz the operation sequences no human writes by hand, and never trust a test you haven't watched fail on the bug. **Recovery footnote:** the backup ring is the safety net — `restoreBackup` snapshots "Before restore" first, and the desktop mirrors to `Documents/GridIron IQ`; a clean season can always be rebuilt from `backup.data` and loaded via Open File without touching the live store.

20. **"Tagged plays show as untagged" was a DISPLAY bug (×2), never a data bug —
   and it was only caught by reproducing against the SHIPPED artifact.** Every
   play was correctly tagged on disk and `isPlayTagged` returned true; the file
   was fine. Two independent *render* defects made tagged plays LOOK untagged:
   (a) the "X / Y tagged" progress counter (`App._updateTagProgress`) was wired
   to `play-created/updated/deleted` but NOT `plays-loaded`, so opening a game
   left it stuck at its startup "0 / 0 tagged" until the first edit — it claimed
   nothing was tagged; (b) the timeline strip (`PlayTagger._updateTimeline`)
   colored run (gold) / pass (blue) and dumped *everything else* into one gray
   `other`, so a tagged special-teams / no-run-pass snap rendered identically to
   a truly empty play. Both fixes are display-only (touch zero play data): wire
   the counter to `plays-loaded`; split the timeline `other` (tagged) from a new
   `untagged` class via `PlayTagger._timelineTypeClass` (ONE source of truth for
   both render branches — multi-clip + single-video — so they can't drift), with
   `.timeline-play.untagged` styled as a faint ghost distinct from every tagged
   color. **This is the same class of misread that caused the earlier data
   catastrophe** — a display bug diagnosed as a data problem and "fixed" by
   deleting/rewriting plays that were actually correct. Process lessons: (1)
   **reproduce before fixing** — headlessly load the coach's REAL season into the
   exact SHIPPED bundle (`git show <tag>:football-film-analyzer.html`), not the
   working tree; here the working-tree bundle was silently AHEAD of shipped (an
   uncommitted counter fix), so testing it would have hidden the bug. (2) When "X
   looks wrong," inspect each RENDERER of X independently (counter, timeline,
   grid, play-selector) — they read the same data through different code and can
   disagree. (3) Any UI that summarizes the play set must refresh on
   `plays-loaded` (wholesale replace on game open / undo / import), not only on
   per-play events. Pinned by e2e-season-tab Test 26 (counter after game-open) +
   Test 27 (`_timelineTypeClass` tagged-vs-untagged). (v1.9.29.)

21. **The full-app hardening pass (v1.9.30): a green gate is not a correct app —
   audit the paths the gate never touches.** After the display-bug fixes, a
   whole-app review + adversarial verification found ten real defects the 130+
   green assertions had never exercised, including a THIRD and FOURTH cross-game
   data-loss path. Each was fixed one-at-a-time under the debugging rules
   (reproduce → root-cause → smallest fix → regression test → verify):
   - **Season-switch autosave race (data loss):** the 1s autosave / 2.5s disk
     debounce weren't cancelled on a season transition, and `openSeason` moved
     the backend pointer *before* the awaited load — so a timer firing in that
     window wrote season A into season B's slot (past the v1.9.27 commit guard,
     which only checks the game). Fix: `StorageManager._cancelPendingSaves()` +
     `SeasonStore.cancelPendingDiskWrite()` on every open/create/delete/close,
     plus a season-id pin inside both debounce callbacks. Test 28.
   - **Version-manager cross-game restore (data loss):** the key was
     `ffa_versions_' + (videoFileName || 'default')`, and `videoFileName` is
     null on the web build, so EVERY game shared `ffa_versions_default`;
     `restore()` deserialized straight into the tagger, bypassing the guard.
     Fix: key per `season::game`, stamp each snapshot with its `seasonId/gameId`
     and refuse a cross-scope restore, route restore through the in-app confirm +
     `history.reset()` + guarded persist. Test 29 + the integrity fuzzer now runs
     version snapshot/restore ops (was 195 violations on the old bundle, 0 on the
     fixed one).
   - **Stored XSS in the OLDER report renderers** (scout / defensive report
     headers + export titles, big-plays clip filename, CSV import preview) —
     escaped at each HTML sink with `Charts._esc` / `App._esc` (the newer
     renderers already did). Test 30. Note: use a per-test XSS counter — the
     shared `window.__xss` + a leftover payload roster player from Test 19 caused
     a false positive.
   - **Film Room grid editor diverged from the tag form:** no result exclusivity
     (could store "Gain + Loss", which flipped a gain negative), no auto-Gain on
     positive yardage, `_autoSit` not cleared. Fixed by a shared
     `PlayTagger.EXCLUSIVE_GROUPS` + `normalizeMulti` (one source of truth for
     form chips AND grid), auto-Gain, and clearing `_autoSit`. Film-room test.
   - **Call sheet:** recency sort compared `p.timestamp` (an object) → NaN → no
     reorder (use `p.id`); `_playResult` exact-matched a multi-select string, so
     a pick-six showed the raw "Interception + Touchdown" (split + rank). Test 31.
   - **Cut-up export:** `p.tags.playType || p.timestamp` was always true (every
     play has a timestamp object) → untagged/zero-length plays exported;
     `_waitForSeek` had no timeout / at-target guard → a same-position seek hung
     the export forever; a 999-sentinel end inflated the estimate. Test 32.
   - **Persist hardening:** BrowserBackend backup ids were `Date.now()` (ms) →
     two same-ms restore points overwrote each other (now monotonic); `_tsSlug`
     was second-resolution (now ms); `nextId ||` discarded a stored 0 and could
     recompute a colliding id when ids are non-contiguous after deletes (now
     `?? max(id)+1`). Test 33.
   - **Init fragility:** unguarded `getElementById(...).addEventListener` in the
     App constructor could abort all later wiring; a native `confirm()` violated
     lesson #8; dead `command-palette.js` removed; a per-open `filmUrl`
     `console.log` dropped.
   - **Stats correctness:** pass attempts summed three overlapping filters
     (double-counting "Incomplete + Interception"); TFL/havoc counted penalties
     and kneel-downs. Both now count distinct plays / exclude non-TFL results.
     Test 34. Plus the CV server (optional/local): CORS narrowed off `*` to the
     app's real origins, a 2 GB upload cap added; stale vision model id
     `claude-opus-4-6` → `claude-opus-4-8`.
   - **Deliberately NOT fixed:** atomic Tauri season writes (temp+rename) — the
     path can't be reproduced/verified in the headless browser harness, a bad
     rename could break every save, and the backup ring + Documents mirror
     already recover crash-corruption. Shipping an unverifiable change to the
     canonical write path would violate the reproduce-first rule.
   The meta-lesson reinforces #19: the fuzzer only catches what its op-set
   covers, so when a new corruption class is found, ADD the operation (here:
   version snapshot/restore) so the class is fuzzed forever after.

## Future Projects (Tabled)

These are validated high-impact features, deferred until the core UX is polished:

1. **MP4 cut-up export** — bundle ffmpeg as a Tauri sidecar so filtered plays /
   player cut-ups export as shareable video files. The #1 feature coaches ask
   for after tagging. In-browser `cutup-exporter.js` is limited; real export
   needs native compute.
2. **Season-file merge** — two coaches tag the same game independently, then
   merge results into a single canonical breakdown. Multi-staff workflow
   (HC + OC + DC each tagging their unit). Conflict resolution UI needed.
3. **Hudl CSV interop hardening** — bulletproof round-trip import/export of
   Hudl-format breakdowns. Import side is ~70% done (column aliases exist);
   needs a dedicated Hudl-format CSV writer for export, plus handling of every
   Hudl export variant (Exchange, Reports, ODK encoding, yardage sign
   conventions, formation vocabulary mapping). GameStrat's business model.
