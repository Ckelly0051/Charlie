# SMOKE 1.12.0-105 - Windows x64 Beta (unsigned)

**Source:** `2ef667d` (the four-owner version bump on top of `206551e`), built
from the clean main checkout. **Gate:** full gate at `206551e` 136/136, zero
skipped, zero failed; `e2e-p0-exit` 19/19 after the bump.
**NSIS installer:**
`src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-105_x64-setup.exe`
(4,034,458 bytes). SHA-256:
`A10AB2AB40B14573F272633D1290AE837C4BAEB40EA55253774B94425BCB144D`.
The built executable reports product version `1.12.0-105`. Built with
`cargo tauri build --bundles nsis` and a scratch config setting
`bundle.createUpdaterArtifacts:false` (no signing key); exit 0.

Carries `1.12.0-104` (the S103-1 Recover seasons repair, never smoked on its
own) plus: the efficiency cleanup (the one-time storage cleanup and settings
conversion modules deleted after their installed receipts were confirmed; dead
roster / custom-field / OCR renderers deleted), the custom-field editor rebuilt
on the overlay service, and Special Teams try charting. Supersedes `1.12.0-104`.

## Checks

**Special Teams tries (Break Down > Special Teams > Try / Defending a Try)**
1. Attempt reads Kick XP, Run/Pass, Fake.
2. Kick XP converted offers 1 Point / 2 Points, default 1. Run/Pass and Fake
   converted offer the same, default 2; a Run/Pass try can be saved at 1 point.
   Switching Run/Pass <-> Fake keeps the points you chose.
3. Players: a kicked Try shows Kicker only (no Returner); Defending a kicked try
   shows Blocker only.
4. Run/Pass or Fake on a Try shows the offensive look, defense faced and play &
   result, with Ball Carrier / Passer / Receiver; on Defending a Try, our
   defensive call first, with Tackler(s) / Takeaway. The formation you pick stays
   after moving to another play and back, and after a restart.
5. Changing a Run/Pass try back to Kick XP asks first; confirming clears the
   run/pass details.
6. Reports: a run/pass try adds nothing to offense yards, success rate or
   tendencies; the Special Teams try counts still show it.
7. Re-chart JV Week 1 play 23 (the run-in try for 1 point) as Try, Run/Pass,
   Converted, 1 Point.

**Custom tag fields (deck > Notes & Details > Edit custom fields)**
8. The editor opens as a sheet; add a field with options and one without, Save:
   both appear in the deck at once and survive a restart. Escape or Cancel saves
   nothing.

**Carried from 1.12.0-104**
9. Home > Recover seasons: the two `Old format` rows show `Saved in an old
   GridIron IQ format. It cannot be recovered.` and no button, and no
   `0 games · 0 plays`.

**Regression spot checks after the cleanup**
10. Settings > Roster: add, remove, import and Print depth chart work; the deck's
    player chips stamp the right role.
11. First launch opens normally with the charting library, Film Room columns and
    Home mode unchanged.

## Result (2026-09-28)

The coach ran the smoke: one finding, S105-1 (a team name typed in Settings
was lost when the sheet closed without Save), repaired in source after this
installer; "the rest looks good." See `docs/OPEN-DEFECTS.md`.

Not tagged, pushed or published.
