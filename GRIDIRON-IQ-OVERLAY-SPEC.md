# GridIron IQ — Overlay interaction specification

**Status:** required P0 exit artifact (Shell Independence §3.1 items 5 and 8).
**Owner:** P0 builds the native overlay host and primitives; S4 migrates the
remaining legacy overlays onto it.
**Why P0 and not later:** Team & Film Settings (S2) is a *drawer*. If the native
overlay host does not exist first, Settings either depends on legacy drawer
infrastructure or gets built twice. Overlay behavior also governs every
confirmation, failure, import and settings workflow in the product.

---

## 1. One host, on `body`

A single overlay host owns stacking, scrim, focus and inertness. Overlays are
**never** rendered inside a route subtree, and never inside `#app`. This is what
removes the reveal-the-outlet pattern that twice exposed the retired classic UI.

## 2. Dialog vs sheet — the rule

| Use | When | Presentation |
|---|---|---|
| **Dialog** | A decision that blocks progress: confirm, destructive action, required input, error requiring acknowledgement | Centered, modal, scrim, focus trapped |
| **Sheet** | A working surface used *alongside* context: Team & Film Settings, filters, import, roster | Edge-anchored panel, modal on narrow, non-modal permitted on wide |
| **Toast** | Outcome of a completed action; never carries the only path to a decision | Transient, non-modal, never focus-stealing |
| **Popover** | Contextual choice attached to a control: chip pickers, column menus | Anchored, dismiss on outside click/Escape, not focus-trapped |

**Decision rule:** if the user cannot reasonably continue without answering, it is
a dialog. If they can keep working, it is a sheet or popover. A destructive action
is *always* a dialog.

## 3. Focus

- On open: focus moves to the overlay's **default action** for dialogs, or the
  **first meaningful control** for sheets — never to the close button.
- Focus is **trapped** in dialogs and in modal sheets; tab cycles within.
- On close: focus **returns to the invoking element**. If that element no longer
  exists, focus goes to the nearest stable ancestor, never to `body`.
- The focus ring is the shared token and is never suppressed.

## 4. Escape and scrim

- **Escape** closes the topmost overlay only, and is `stopPropagation`'d so it does
  not also close the drawer, deselect a drawing tool, or exit a cut-up beneath.
  (The legacy `uiDropdownClosed()` guard existed for exactly this and was removed
  with the dropdown; the host now owns the rule.)
- **Scrim click** closes dismissible overlays; it does **not** close destructive
  confirmations or dialogs with unsaved input.
- Escape and scrim are equivalent to **Cancel** — never to Confirm, and never a
  silent partial commit.

## 5. Stacking

- Explicit z-layers: route < sheet < dialog < toast.
- Opening a dialog over a sheet is permitted; the sheet becomes inert.
- **Only the topmost overlay is interactive**; everything beneath is `inert`.
- Two dialogs may not stack unless the second is a destructive confirmation of the
  first's action.

## 6. Destructive confirmation

Required for: delete game, delete season, delete team, restore/overwrite, clear
tags, remove custom library value, and any managed-film deletion.

- **Name the object and its cost** — "Delete *Week 5 · vs OL Lakes*, 82 plays and
  their tags" — never a bare "Are you sure?".
- Confirm is **not** the default-focused control; Cancel is.
- Uses the turnover/destructive color; it is the only place that red appears on a
  button.
- **Never uses `window.confirm()`** — browsers suppress repeated native dialogs,
  which silently returned `false` and made actions look broken (lesson #8).
- Managed-film deletion additionally requires the impact report mandated by the
  integrity contracts; it is never bundled into a season delete.

## 7. Toasts

- Duration **4.5s** minimum, **click to dismiss** (a 1.8s default previously made
  undo notices unreadable).
- Undo-bearing toasts persist until dismissed or their undo window closes, and
  state the remaining window.
- `role="status"` / `aria-live="polite"` for outcomes; `alert` / `assertive` only
  for failures.
- Toasts never carry the sole path to a decision, and never overlay the commit bar
  while charting.

## 8. Mobile / narrow presentation

- Dialogs: near-full-width with margin; actions stacked full-width, primary last
  in DOM order but visually first where platform convention expects it.
- Sheets: bottom-anchored, full-width, drag-to-dismiss optional but Escape and an
  explicit close are mandatory.
- Touch targets ≥44px (`pointer:coarse`).
- No horizontal page overflow at 390px; overlay content scrolls **inside** the
  overlay, never the page.

## 9. Migration constraints

- Overlays move **once**, into the native host. No interim reparenting.
- `#drawerScrim`, `#undoToast`, `#shortcutsModal`, `#playImportModal`,
  `#seasonOverlay`, `#quickChartPanel` all migrate to the host; the legacy nodes
  are **deleted, not hidden** — hidden markup is what resurfaced twice.
- No change to what any overlay *does*: same data, same actions, same outcomes.
  This is presentation ownership only.

## 10. Verification

Each primitive is proven by a **journey**, not by geometry: open via the real
affordance, assert focus landed correctly, operate by keyboard only, dismiss via
Escape and via scrim, assert focus returned, and assert the underlying data
changed **only** along the paths that journey declares (integrity contract §6.2).
