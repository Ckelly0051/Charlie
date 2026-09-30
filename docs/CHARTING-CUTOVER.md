# Charting cutover (roadmap Step 1): record and coach decision

Status, 2026-09-28: **source built through the deck, Film Room, CSV, analytics,
the run-gap report and the converter (IMPLEMENTED_UNVERIFIED); no coach data has
been written, no full gate has run and no installer exists.** The live conversion waits for the
coach's answers in "Decisions needed" and an explicit yes immediately before the
write (`GRIDIRON-IQ-PLAN-V2.md`, build contract item 3).

Receiver-look checkpoint, 2026-09-29 (`1cace291`): **built in source, IMPLEMENTED_UNVERIFIED.**
`receiverLook` offers Twins, Trips, Bunch and Tight Bunch as distinct choices;
`receiverSide` offers Left/Right directly below it. A side is never inferred;
clearing a look confirms clearing its populated side. `lineBalance` independently
offers Balanced/Unbalanced. Numeric Receiver Set stays separate. All three
fields carry through templates, carry-forward, Film Room, CSV, play detail,
Study and presentation look labels. There is no new read-time conversion.

Fresh read-only copy inventory: source SHA-256
`67780703e0e2bff34c0f5672af5f6e13887d980bdf2c3ee93584849ca2b6c696`.
919 plays: SJM Varsity 293, SJM JV 186, 2025 JV 440. Of the 496 plays carrying
Formation, exact Family names convert 298 and 198 remain unresolved with an
empty mapping. The original source hash stayed unchanged. The catalog holds
76 restore points and 146 game versions; with no additional mappings, 26
versions convert on exact names and no restore point fully converts. Earlier
counts below are the dated 2026-09-28 inventory, not the current totals.

The copy rehearsal preserves identities, film references, unrelated tags and
other play/game fields, and catalog read-back passes. It flags additional
takeaway text changes (`takeaways.fix` on SJM JV, `takeaways.fix` and
`takeaways.working` on 2025 JV); these must be reviewed before a live write,
not silently rebaselined. No live write, full gate or installer was run.

Focused verification: build passed; 14 affected harnesses passed, including
receiver-look 16/16, real deck/Film Room/CSV 86/86, scratch conversion 37/37,
season-format 45/45, and unchanged analytics parity on both goldens. Removing
the receiver-side opener made its regression fail; the mutation was restored.
App and comp captures were inspected at 1920, 1440, 1280 and 390: 27px desktop
chips, no clipped receiver labels and no page overflow. The canonical fixture
hash stayed unchanged; new receiver selections there are illustrative. Design
approvals audit: zero violations. Preview: `http://127.0.0.1:5192` while the
local preview server is running; this is source, not an installed release.

## What the coach will see

- **Formation Family** and **Receiver Set** replace the one Formation field. The
  Family is a library group (Settings > Charting > Families: add, hide, reorder,
  remove a custom one) seeded with Spread, Power-I, I-Form, Split Back, Singleback,
  Wing-T, Flexbone, Wishbone, Wildcat, Double Wing, Single Wing. The Receiver Set
  is 2x2, 3x1, 2x1, 3x2, 1x1, 4x1, 2x0, 3x0. A play holds one of each.
- **Gap** (L-A..L-D, R-A..R-D, Center, Other) opens directly under Play Direction.
  **Motion Starts/Ends** open under Motion. **RPO** (read, defender number,
  decision) and **QB Run** (Designed, Scramble, RPO Keeper) open under Play Type.
  **Reverse** and **QB Run** are Play Types; neither sets Run/Pass.
- Removing what opens a detail asks first and clears it in one undoable write.
- **Run gaps** is a film-linked chart on the Offense Structure page, the Opponent
  Offense scout tab (their runs) and the Defense board's opponent page (runs
  faced), with a Frequency / Performance switch, a play-type filter, the eligible
  sample ("22 of 26 runs charted with a gap"), Toward / Away strength where charted,
  and Watch on every cell for its exact clips. The Defense and game-report HTML
  exports print the same numbers. A run is what the Reports count as one (an explicit Run/Pass,
  or a blank one on a plain Run Inside / Run Outside; QB Run and Reverse only when
  Run/Pass says Run), so the sample matches the neighboring tables. A run without a Gap
  stays visible as missing and is never counted into a cell.
- Shortcuts: H charts QB Run and J charts Reverse (deck, Quick Chart, legend).

## Data locations, counts (read-only, 2026-09-28)

Source catalog `%APPDATA%\com.gridironiq.app\seasons\library.db`
(sha256 prefix `452e156f4293` at the time of this count; the report is bound to the
full hash, and any use of the app changes it).

| Location | What it holds | Count | Disposition |
|---|---|---|---|
| Live seasons in the catalog | 3 seasons: 2025 JV 440 plays, SJM Varsity 2026 259, SJM JV 2026 186 (885 plays) | 496 plays carry a Formation value | converted once, see below |
| Play call defaults (season `playbook`) | `defaults.formation = "Power-I"` on 2 calls per season | 6 calls | `Power-I` is an exact Family: converts |
| Restore points (catalog `backups`) | 76 season snapshots, 21,145 plays | 0 are current but for Formation; 38 hold values that need a decision and 38 are already an old format (refused today) | left as stored, still refused; or converted after your mapping (see Decision 3) |
| Game versions (catalog `versions`) | 137 game snapshots, 9,995 plays | 17 convert on exact names alone; 26 hold values that need a decision; 94 are already an old format (refused today) | the 17 convert; the rest as Decision 3 |
| Documents mirror (`OneDrive\Documents\GridIron IQ\seasons\...\season.json`) | 2 files, 520 plays | already an old format (game rosters, retired Special Teams tags, no unit), refused today | untouched |
| App-data season files and the 2026-09-14 roster backups | 6 files, 1,483 plays | already an old format, refused today | untouched |
| `GridIronIQ-Backups` archives | 5 files, 1,463 plays | already an old format | untouched, outside active storage |
| Browser profile (installed WebView2 localStorage) | tag library (custom Formation `Beast`), play call mirror (`Power-I` twice), Film Room column layout (`formation`); no templates or saved Study views | 3 keys | see "Browser stores" |
| Test fixture (`GridIronIQ-Fixtures`) | canonical 2025 JV copy | 449 plays | converted with stand-in assignments (`tools/charting-fixture-mapping.json`), not your decisions; the pre-cutover copy sits beside it |

No file-based copy is "current but for Formation": every one was already refused
under the single-format rule, so there is nothing in those files to convert and
they stay refused.

## Field-by-field mapping

| Old field | New | Rule |
|---|---|---|
| `formation` (multi-select text) | `formationFamily` (one) and `receiverSet` (one) | per word, below; the old key is removed |
| `formation` blank | both blank | nothing invented |
| `formation` holding `Shotgun`/`Pistol`/`Under Center`/`Empty` | not converted | the old combined look; refused as before (0 in the live seasons) |
| play call `defaults.formation` | `defaults.formationFamily` / `defaults.receiverSet` | same word rule |
| every other tag, id, timestamp, clip reference, note | unchanged | proven byte-equal in the rehearsal |
| (new) `gap`, `motionStart`, `motionEnd`, `rpoRead`, `rpoDefender`, `rpoDecision`, `qbRun` | added blank | uncharted, never inferred |

## The values in the live seasons

Exact Family names convert with no decision (proposed, part of what you confirm):
Power-I, Double Wing, I-Form, Flexbone, Single Wing, Spread, Split Back, Wing-T.

| Value | Plays | On its own | Games | Rides with | Personnel | Backfield | QB alignment | Proposed |
|---|---:|---:|---:|---|---|---|---|---|
| Power-I | 141 | 141 | 10 | - | 12 56, 32 55, 22 13 | Power 133, Single 8 | Under Center 97, (blank) 41, Shotgun 3 | Family Power-I (exact name) |
| Ace | 70 | 63 | 8 | Twins 7 | 11 45, 12 16, 22 5 | Single 68, Power 2 | Shotgun 39, Under Center 28, (blank) 3 | **your decision** |
| Trips | 51 | 9 | 6 | Unbalanced 39, Bunch 20, Spread 2 | 10 15, 32 10, 11 9 | Single 36, Empty 12, (blank) 1 | Shotgun 39, Pistol 9, Under Center 3 | **your decision** |
| Double Wing | 48 | 48 | 3 | - | 12 21, 22 19, (blank) 5 | Single 28, I 17, (blank) 3 | Under Center 48 | Family Double Wing (exact name) |
| Unbalanced | 44 | 4 | 4 | Trips 39, Bunch 17, Twins 1 | 10 15, 11 10, 32 8 | Single 35, Empty 3, Beast 2 | Shotgun 33, Pistol 8, Under Center 3 | **your decision** |
| I-Form | 43 | 24 | 5 | Twins 19 | 21 17, 22 16, 32 4 | I 36, Single 6, Offset 1 | Under Center 33, Shotgun 10 | Family I-Form (exact name) |
| Flexbone | 43 | 43 | 2 | - | (blank) 26, 11 16, 32 1 | (blank) 27, Single 10, Diamond 3 | Under Center 35, Shotgun 5, (blank) 3 | Family Flexbone (exact name) |
| Doubles | 37 | 24 | 5 | Spread 13 | 10 25, 01 8, (blank) 2 | Single 28, Empty 9 | Shotgun 37 | **your decision** |
| Twins | 36 | 7 | 4 | I-Form 19, Ace 7, Split Back 1 | 21 15, 11 11, 32 4 | I 20, Single 14, Split 1 | Under Center 21, Shotgun 13, (blank) 1 | **your decision** |
| Single Wing | 30 | 29 | 5 | Unbalanced 1, Trips 1, Bunch 1 | 32 12, 22 7, (blank) 6 | (blank) 9, Power 7, Single 7 | Shotgun 17, (blank) 7, Under Center 6 | Family Single Wing (exact name) |
| Spread | 22 | 6 | 3 | Doubles 13, Bunch 2, Trips 2 | 10 10, 22 4, 12 3 | Single 17, I 2, Empty 2 | Shotgun 20, Under Center 2 | Family Spread (exact name) |
| Bunch | 20 | 0 | 4 | Trips 20, Unbalanced 17, Spread 2 | 32 9, Jumbo 4, 10 3 | Single 13, Empty 5, Weak 1 | Shotgun 11, Pistol 8, Under Center 1 | **your decision** |
| Split Back | 7 | 6 | 2 | Twins 1 | 22 4, 12 2, 32 1 | Split 7 | Shotgun 5, Under Center 2 | Family Split Back (exact name) |
| Beast | 5 | 5 | 1 | - | 20 5 | Empty 5 | Shotgun 5 | **your decision** |
| Victory | 2 | 2 | 1 | - | 32 2 | Single 2 | Shotgun 2 | **your decision** |
| Wing-T | 1 | 1 | 1 | - | (blank) 1 | (blank) 1 | Under Center 1 | Family Wing-T (exact name) |

"Plays" counts a play once for each word it carries. The 32 stored values (for
example `Trips + Unbalanced` 18 plays, `Spread + Doubles` 13, `I-Form + Twins` 13)
are listed by `node tools/charting-decision-support.mjs`.

With the exact names alone, **298 of the 496 plays convert and 198 stay exactly as
stored and unresolved** (SJM Varsity 43, SJM JV 23, 2025 JV 132).

## Decisions needed (nothing is guessed or assigned for you)

1. **Approve the historical mapping, by exact combination.** The table below
   supersedes the old Family-or-numeric-Set question. Receiver names now have
   their own field, and Unbalanced has Line Balance. Side and numeric Set may
   remain blank and can be charted later; missing information is not invented.
2. **Resolve conflicts explicitly.** A combination such as Trips + Bunch needs
   one selected receiver look. A single confirmed combination rule can cover
   every matching record regardless of token order; per-play overrides handle
   actual exceptions. The tool refuses conflicting rules or populated current
   fields that disagree and leaves that source record intact.
3. **Restore points and game versions.** Convert those that resolve fully under
   your mapping, or leave them as stored (they then read as an old format and
   are refused if restored). Counts are re-run with your mapping.
4. **Browser stores** (below).

Give the answers as a mapping file (`tools/convert-charting-once.mjs` header):
`{ "tokens": { "Trips": { "receiverLook": "Trips" } }, "combinations": {
"Trips + Bunch + Unbalanced": { "receiverLook": "Bunch", "lineBalance": "Unbalanced" }
}, "plays": {} }`. This is an example, not an approved mapping.

| Exact historical combination | Live plays | Proposed meaning / decision |
|---|---:|---|
| Ace | 63 | Decide Family name; do not infer receiver count |
| Ace + Twins | 7 | Same Ace decision plus Twins; side blank |
| Doubles | 24 | Decide whether to keep a custom Family or explicitly assign a numeric Set |
| Doubles + Spread | 13 | Spread plus the Doubles decision; two Families would conflict |
| Beast | 5 | Decide whether to preserve Beast as a custom Family |
| Victory | 2 | Decide whether to preserve Victory as a custom Family |
| Trips | 9 | Trips; side and numeric Set blank |
| Trips + Unbalanced | 22 | Trips plus Unbalanced; side and Set blank |
| Bunch + Trips + Unbalanced | 16 | Confirm Bunch plus Unbalanced, or provide exceptions |
| Bunch + Trips | 1 | Confirm Bunch, or choose Trips |
| Bunch + Single Wing + Trips + Unbalanced | 1 | Single Wing plus Unbalanced; confirm Bunch vs Trips |
| Bunch + Spread + Trips | 2 | Spread; confirm Bunch vs Trips |
| Twins | 7 | Twins; side and Set blank |
| I-Form + Twins | 19 | I-Form plus Twins; side and Set blank |
| Split Back + Twins | 1 | Split Back plus Twins; side and Set blank |
| Twins + Unbalanced | 1 | Twins plus Unbalanced; side and Set blank |
| Spread + Twins | 1 | Spread plus Twins; side and Set blank |
| Unbalanced | 4 | Line Balance only; Family, receiver look and side blank |

Total: 198 distinct live plays. The rehearsal inventory contains every affected
season/game/play ID and old value, grouped by normalized combination. It is in
`docs/charting-receiver-inventory-2026-09-29.json` (committed review evidence,
not a data backup or write approval). Full scratch proof and catalog copies are
under `C:\Users\charl\AppData\Local\Temp\giq-receiver-review-ZmDpHI\`.

## Browser stores

- **Tag library**: the custom Formation `Beast` stays in storage exactly as stored
  (kept as `retired`, through any later library edit) and is never added for you.
  Settings > Charting > Families lists it under "Previous formations" with an
  "Add Beast" button, so keeping it is one click and never a retyping; only words a
  Family can hold are listed (no `+` compound, receiver distribution or alignment).
  The Family group starts fully visible; `QB Run` and `Reverse` appear in Play Type
  with no conversion.
- **Play calls**: the two calls' `Power-I` default is in the season (converted with
  it) and mirrored to the browser key when the season opens.
- **Film Room columns**: your saved column sets name `formation`; that column is
  dropped and Family and Rec Set are added from the Columns list.
- No converter runs in the app for any of these.

## Proof from the rehearsal (copies only)

`tools/convert-charting-once.mjs --rehearse` on a copy of the catalog, exact
names only: for all three seasons play identity, timestamps, clip references, game
fields, every unrelated tag and every other play field are byte-equal; the catalog
save and reload round-trips; analytics differ only in formation-derived values
(plus the takeaway text that names formations). `tools/e2e-charting-convert.mjs`
(37 checks, each guard mutation-verified) covers the write procedure: the source is
never written by a rehearsal; a mapping other than the reviewed one, a catalog that
changed since the review, an unresolved value, or a change between the backup and
the swap each stop the write with the source byte-identical; the immutable restore
point equals the pre-write catalog by hash; no staged file remains.

## Procedure after your answers

1. Close GridIron IQ. 2. `--rehearse` with your mapping; review the counts,
`report.json` and the re-chart list; the coach's yes on `impact.json`.
3. `--apply --backup <new dir> --approved impact.json --mapping <file>`: it copies
the catalog folder, `library.json` and the Documents mirror (film excluded) with
each copy hash-verified, converts, validates, re-checks that the app is closed and
the catalog is unchanged, swaps in a staged file from the same folder and reads it
back; on any mismatch it stops and names the restore file.
4. Delete `tools/convert-charting-once.mjs`, `tools/charting-convert.mjs`,
`tools/charting-decision-support.mjs`, `tools/e2e-charting-convert.mjs` and
`tools/charting-fixture-mapping.json` in the same commit that records the receipt.

## Not shipped

No old-shape reader, projection or dual write exists in `js/`: `SeasonFormat`
refuses any `formation` key (play, play call default, template, CSV column), the
projection reads the current fields only, and the library never offers its old
Formation group as choices (Settings lists its custom names as "Previous formations",
read only, and adds one only when you click it). The converter lives in `tools/`, is imported by nothing in `js/`,
and is deleted after the live conversion.
