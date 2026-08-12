# GridIron IQ 1.12.0-47 - Coach Smoke Findings

## Status

**ACTIVE FINDINGS LOG.** Record installed-candidate feedback here and repair it
in a deliberate batch. Do not ship an iterative installer for this single item.
No coach data change is authorized by this document.

## HOME-1 - Season row composition is visually broken

Observed on the installed `1.12.0-47` candidate on 2026-08-12.

The Home season row is stretched across the entire workspace rather than
composed as one readable object. The `SEASON` label is clipped at the left edge;
season identity, game/play totals, status, `Open`, and delete are separated by
large dead gaps; `Not checked yet` does not name what was not checked; and the
actions are stranded at the far right. Worse, the literal `Open ->` label points
directly at the adjacent `x` delete control, visually instructing the coach to
click the destructive action. The row is hard to scan and reads like unrelated
fragments rather than one selectable season.

### Required outcome

- Keep the section label fully visible and aligned with the content column.
- Compose each season as a compact responsive row: identity, game/play summary,
  explicit film-health state, then grouped actions.
- Replace context-free status copy such as `Not checked yet` with an explicit
  subject and a real loading/unknown state (for example, `Film status not
  checked`), then update it when the check completes.
- Remove the directional arrow from `Open`; it must never point toward Delete.
- Make Open the unmistakable primary row action. Separate Delete spatially and
  visually, give it an explicit accessible label, and retain confirmation before
  deletion.
- Remove decorative dead space; do not solve this by stretching columns to fill
  the viewport.
- Verify at full desktop width and in a resized desktop window. No clipping,
  page-level horizontal overflow, or action overlap.

### Evidence

Coach screenshot: `codex-clipboard-c62c847d-3395-450a-b0ca-d98f5d7afcb5.png`.
The screenshot is local evidence and is not required in git.

## Next Product Enhancement - Exact-match historical Play Call mapping

After the current smoke batch is accepted, build a preview-first mapper that
uses a saved Play Call's complete defaults as exact matching criteria against
historical plays. For example, `Power-I + Under Center + Power + Run + Run
Outside + Right` may map to `26 Blast` when the coach defines that rule.

The safe first version adds Play Call identity only to exact matches with blank
Play Call fields. Existing football tags remain unchanged; partial matches are
excluded; conflicting existing calls are flagged; the coach can watch and
exclude matches; and no write occurs until explicit confirmation after a restore
point is created. Any mode that rewrites historical football tags is a separate,
explicitly authorized workflow.