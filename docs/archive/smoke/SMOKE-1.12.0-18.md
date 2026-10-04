# SMOKE RECORD — `1.12.0-18` (S6 design pass)

**Status: PENDING — coach smoke not yet run.**

Local unsigned candidate. **No tag, no GitHub release, no published artifact,
no updater signature.** This is the §8 milestone installer for S6.

## Source

| | |
|---|---|
| Branch | `claude/football-film-analyzer-GRiCW` |
| Version-stamp commit | `350d9a6` |
| Last code commit | `2dc27a2` (AX-7) |
| S6 range | `515f1c7..2dc27a2` |
| Builder | Claude |

**Sequencing note.** Plan §8 puts Codex's independent review *before* the
installer. The coach directed the two to run in parallel so smoke can start
while the review is in flight — the same explicit call made for `1.12.0-12`.
Codex's review of the S6 range is still required, and this artifact is not
accepted by a passing smoke alone.

## Artifacts

**NSIS (recommended):**
`src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-18_x64-setup.exe`
SHA-256 `34BF5D9B01B9CDA3D5A383458208E1652F43D74964EB603AEE9CEE2F79191C4A`
3,967,062 bytes

**MSI (alternative):**
`src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-18_x64_en-US.msi`
SHA-256 `DBBF3D167392E1CA487D279923A12267C2DEB6C5E32528D790C774F6E53C7028`
5,513,216 bytes

Windows will warn on an unsigned installer: **More info → Run anyway.**

## Automated evidence on these exact bytes

| Check | Result |
|---|---|
| Canonical gate | **81 harnesses \| 81 green \| 0 skipped \| 0 failed** |
| Real six-game data | 13/13 |
| Analytics parity (synthetic + real) | 2/2, **no golden moved** |
| Responsive containment | 105/105 |
| P0 exit composition | 17/17 (requires all four version owners equal) |
| Capability audit | 10/10 |
| `cargo check` | clean |

## What changed since `1.12.0-17`

S6 is a design and information-architecture pass over Reports, Study, Plan and
the shell. **No analytics formula, film cohort, composite ref, schema, season
byte, migration, film file or storage path changed.**

- **Home** — continue hero, charting progress by unit, honest film inbox.
- **Study** — pivot table, measure switcher, minimum-sample gating, every cell a
  cut-up; pickers now grouped by lens and football category.
- **Plan** — grouped sections and a bottom presentation strip.
- **Shell** — universal game-context switcher on every route (UX-2).
- **Containment + palette** — responsive containment instrument, one palette
  owner (UX-3/UX-4).
- **Reports** — the report stylesheet finally reaches the route (AX-1); Overview
  composition and shared chart primitives (AX-4/AX-5); repeated findings
  collapse into one theme (AX-3); the Predictability Map states what it means
  (AX-2); US-English copy (AX-6); and the **five-lens model** — Efficiency,
  Explosiveness, Situational, Tendencies, Risk (AX-7).

## Smoke checklist — stop at the first failure and report it

Gate 1 is Reports, because that is where the whole S6 pass landed and because a
`1.12.0-13`/`-14` Reports failure is exactly what the installed smoke exists to
catch.

1. **Reports, three ways.** Home → Reports. Then open a linked-film game, let
   film auto-load, → Reports. Then switch to another linked game → Reports.
   Every time it must populate — not blank, not hidden.
2. **The five lenses.** On Reports → Overview, confirm the five lens cards read
   as football questions and the numbers look right for that game. Click a
   highlighted tile (Red zone, Explosives, Third down): the cut-up must play
   **exactly** the number of plays the tile displayed. Click a lens's
   "→ report" button: it must open that tab.
3. **Study.** Pick a breakdown and a metric — the pickers should be grouped
   (Situation / Offensive look / … and Efficiency / Explosiveness / …). Study
   should open on **Formation**. Run a pivot; click a cell; the film should
   match the cell.
4. **Film is unchanged.** Break Down: linked D-drive film loads, fullscreen and
   drawing work, Film Focus still expands the picture. This is the rollback
   contract from `1.12.0-17` and must not have regressed.
5. **Game switching.** Use the context switcher in the top bar from each route.
   The right game opens, with the right film.
6. **Durability.** Chart a play, switch games, restart the app. The tag is still
   there and the film still resolves.

## Known and carried into this build

- **4K film in the default charting composition remains ~6.8% of source pixels**
  at 1440x900. Better than the legacy baseline and better than the broken S5d
  state, but **full screen is still the only real 4K path.** "Beats legacy" does
  not mean 4K is solved.
- **`e2e-tag-projform` is an intermittent puppeteer crash** — measured 3-of-4
  standalone crashes on unmodified code, 54/54 whenever it completes. It passed
  in the gate run above. Not a product defect and not a regression; it needs its
  own pass from a captured red.
- **The local CV server has no reachable enable control** (S4f-1, carried).
- Eight Break Down capability ids are still claimed by harnesses S7 retires
  (plan §3.2 item 7).

## Result

_To be completed by the coach._

- Date:
- Outcome: PASS / FAIL
- Notes:
