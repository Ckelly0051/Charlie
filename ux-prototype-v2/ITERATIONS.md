# GridIron IQ Design Iterations

This directory is the standalone design reference for the GridIron IQ redesign.
Each milestone below is recoverable from Git without touching production code.

## Approved Baseline

**Design V1** is tagged `design-v1`. Run the checked-out snapshot with:

```powershell
python -m http.server 4174 --directory ux-prototype-v2
```

Then open `http://127.0.0.1:4174/`.

Design V1 establishes:

- Edge-to-edge desktop workspace with top navigation and mobile bottom navigation.
- Video-first Break Down layout with fixed-width, complete-copy play cards.
- Contained charting footer, affirmative Save & Next state, and polished scrollbars.
- Auto-hiding, vertically movable video controls that never alter video dimensions.
- Unit- and scout-perspective-aware charting for offense, defense, and special teams.
- Optional coach-owned tags, configurable formation/backfield/front libraries, and
  structured penalties, player grading, and phase-aware special teams.
- Visual Study analytics with film-linked KPIs, tendencies, comparisons, and trends.

## Milestone History

| Commit | Design checkpoint |
| --- | --- |
| `df05224` | Clean-sheet Home / Break Down / Study / Plan baseline and shared plan. |
| `819310a` | Denser charting, configurable tag libraries, and visual-first Study. |
| `8153def` | Unit-aware full charting, penalties, special teams, players, and typography. |
| `4d6a92a` | Distinct high-contrast toast treatment. |
| `797363f` | Uppercase toast confirmation language. |
| `0659103` | Play-strip hierarchy and high-frequency film action rail. |
| `8134f6a` | Explicit self-scout / opponent-scout perspective contract. |
| `fd48d78` | Compact strip and reclaimed video workspace. |
| `e676d51` | Edge-to-edge navigation and coach-owned optional charting contract. |
| `design-v1` | Approved visual baseline after final spacing, control, and perspective polish. |

To inspect an earlier checkpoint without disturbing active work, use a temporary
Git worktree at the desired commit. The prototype is self-contained and has no
production storage or backend dependency.
