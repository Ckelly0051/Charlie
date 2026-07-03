# Gridiron IQ — Visual Design Refresh Spec

**Target:** `football-film-analyzer.html` (single-file app, no build step, must remain offline-capable)
**Scope:** Visual/CSS refresh only. Zero functional changes. No renamed IDs, no removed classes that JS hooks on, no altered keyboard shortcuts, no changed data handling.
**Primary device:** Desktop, mouse + keyboard. Do not optimize for touch.
**Brand constraint:** Blue and white stay as the identity. The goal is *sharper and more professional*, not a new identity.

---

## 1. Design direction

The current UI reads "hobby project" for five specific reasons: (1) the accent is CSS `royalblue`, a purple-leaning browser default; (2) glow shadows and gradient tiles (the Add Video / Add Folder cards, `--shadow-blue`); (3) ~80 identical white-bordered pill chips with no visual hierarchy; (4) emoji used as toolbar icons; (5) four near-identical blue-tinted background grays plus font sizes drifting across 11–14px with no scale.

The target feel is **coach-grade desktop software**: dense, flat, crisp. Think Linear/Stripe-dashboard discipline applied to a film room — white surfaces on one neutral canvas, hairline borders, a single tuned blue used with authority, and the run/pass orange/sky reserved *exclusively* for data (never chrome). Numbers everywhere render in tabular figures like a broadcast scorebug.

**Signature element (the one memorable thing):** the Down & Distance badge. Everywhere a down-and-distance appears (play rows, game header, tagging panel readout), render it as a compact scorebug-style badge — uppercase, tabular numerals, letterspaced: `2ND & 6`. This is the football-native detail that makes the app feel purpose-built rather than generic-CRUD.

Everything else stays quiet and disciplined so the scorebug treatment and the blue selection states carry the personality.

---

## 2. Token replacement

Replace the current `:root` values with the following. Keep the same variable *names* where they exist so downstream CSS keeps working; add new ones as noted. Delete `--shadow-blue` and `--shadow-glow` entirely (see kill list).

```css
:root {
  /* Accent — tuned blue replaces royalblue */
  --accent:            #1D4ED8;   /* was #4169e1 (royalblue) */
  --accent-hover:      #1741B6;   /* was #2f4fc4 */
  --accent-soft:       #EEF3FE;   /* solid tint, was rgba(65,105,225,0.12) */
  --accent-border:     #B9CDF8;   /* NEW — border for multi-select selected chips */
  --highlight:         var(--accent);
  --highlight-hover:   var(--accent-hover);
  --highlight-soft:    var(--accent-soft);

  /* Neutrals — one canvas, white surfaces, neutral (not blue-tinted) grays */
  --canvas:            #F7F8FA;   /* was #e7eaf1 */
  --bg-primary:        #F7F8FA;   /* was #e2e6ed */
  --bg-secondary:      #FFFFFF;   /* was #eef1f5 */
  --bg-elevated:       #FFFFFF;   /* was #eef1f5 */
  --bg-tertiary:       #F2F4F7;   /* was #e4e8ef — sunken wells, inputs, idle chips */
  --bg-surface:        #FFFFFF;   /* was #d8dde6 */
  --surface:           #FFFFFF;
  --border:            #E4E7EC;   /* was #e2e8f0 */
  --border-bright:     #CBD2DC;   /* was #cbd5e1 */
  --chip-border:       transparent; /* idle chips lose their border — see §4 */

  /* Text — contrast-safe scale */
  --text:              #131A26;   /* was #0f172a; near-black, neutral */
  --text-dim:          #4B5565;   /* was #64748b (4.2:1 — failed AA); now 7.5:1 on white */
  --text-hint:         #667085;   /* NEW — placeholders, helper microcopy; 5.1:1 */
  --text-bright:       #FFFFFF;

  /* Data ink — reserved for data, never chrome */
  --run-color:         #EA580C;   /* bars/dots only */
  --run-text:          #C2410C;   /* text on tint */
  --run-soft:          #FFF1E7;
  --pass-color:        #0284C7;
  --pass-text:         #0369A1;
  --pass-soft:         #E8F4FD;
  --success:           #15803D;   /* was #16a34a — darker for small text */
  --danger:            #B91C1C;   /* was #dc2626 */
  --warning:           #B45309;   /* was #d97706 */

  /* Geometry — sharper */
  --radius:            6px;       /* was 8px */
  --radius-lg:         10px;      /* was 12px */
  --radius-sm:         4px;       /* was 6px */

  /* Shadows — flat by default; elevation only for floating layers */
  --shadow-xs:         none;                                    /* cards use borders, not shadows */
  --shadow-sm:         0 1px 2px rgba(16,24,40,0.05);
  --shadow-md:         0 4px 12px rgba(16,24,40,0.08);          /* dropdowns, popovers */
  --shadow-lg:         0 16px 40px rgba(16,24,40,0.16);         /* modals, with 1px border */
  /* --shadow-blue: DELETE */
  /* --shadow-glow: DELETE */

  --transition:        120ms cubic-bezier(.4,0,.2,1);
}
```

**Contrast requirements (verify, don't assume):** all body/label text ≥ 4.5:1 against its actual background; white text only on `--accent` or darker; **never white text on orange** (`#f97316` + white was 2.9:1 — this is why result/run chips looked cheap and unreadable). Data tints always pair `-soft` background with `-text` foreground from the same family.

---

## 3. Typography

Keep the system font stack (offline constraint) but impose a scale and turn on tabular numerals wherever numbers appear.

```css
body { font-size: 13px; }               /* base UI */
```

| Role | Size / weight / treatment |
|---|---|
| Page/panel titles ("vs Central Tigers") | 15px / 700 |
| Section panel headers | 13px / 650 |
| Section micro-labels (DOWN & DISTANCE, FORMATION…) | 11px / 650 / uppercase / letter-spacing .07em / `--text-hint` |
| Chips, buttons | 12.5px / 500 (600 when selected) |
| Table cells | 12.5px / 450; numeric cells 12.5px / 550 tabular |
| Helper microcopy ("select all that apply") | 11px / 450 / `--text-hint`, sentence case, **not blue** |
| Stat card numerals | 24px / 650 / tabular |
| Down & distance badge | 11.5px / 650 / uppercase / letter-spacing .05em / tabular |

Apply `font-variant-numeric: tabular-nums;` (or `font-feature-settings: "tnum"`) to: play table numeric columns, timecodes, the FPS input, stat numerals, score displays, yardage values, and the D&D badge. This one property does a disproportionate amount of "pro" work in a stats tool.

Wordmark: render "GRIDIRON IQ" in 13px / 800 / uppercase / letter-spacing .12em, `--text` with "IQ" in `--accent`. No emoji football next to it.

---

## 4. Component specs

### 4.1 Chips (the biggest single upgrade)

Two semantic variants — this distinction is currently missing and is a real usability + polish win:

**Single-choice groups** (Down, ODK, Run/Pass, Strength, Direction — pick exactly one):
- Idle: background `--bg-tertiary`, **no border**, text `--text-dim`, weight 500
- Hover: background `#E9ECF2`, text `--text`
- Selected: solid `--accent`, white text, weight 600, no border, **no glow**
- Height 28px uniform, padding 0 10px, radius `--radius-sm` (4px), gap 6px within a group

**Multi-select tag groups** (Formation, Personnel, Motion — pick all that apply):
- Idle/hover: same as above
- Selected: background `--accent-soft`, 1px border `--accent-border`, text `--accent-hover`, weight 600, with a small ✓ prefix
- This makes "which groups are radio vs. checkbox" legible at a glance — something even Hudl's breakdown grid doesn't communicate

**Hotkey badges inside chips** (e.g., Run Inside `R`): 10px tabular, 1px border, radius 3px, opacity .55 idle; on a solid-selected chip, white at 60% opacity. Never brighter than the label.

### 4.2 Buttons

Four tiers, used consistently:
- **Primary** (Save Season, Save & Next, Add game film): solid `--accent`, white, hover `--accent-hover`. No shadow.
- **Secondary** (Edit, Roster, Export): white bg, 1px `--border-bright`, text `--text`.
- **Ghost** (toolbar icons, Prev, Skip): transparent, hover `--bg-tertiary`.
- **Danger**: ghost with `--danger` text; solid red only inside confirm dialogs.

Audit the header: currently Quick Chart, Stats, and Save Season are all solid blue. Only **Save Season** stays primary; Quick Chart and Stats become secondary/ghost with icons. One primary action per surface.

### 4.3 Toolbar

- White background, 1px bottom border `--border`, 48px height.
- **Replace every emoji with a 16px inline SVG icon**, stroke ~1.75 (Lucide-style paths, embedded directly — no CDN). Mapping: Settings→`settings-2`, Shortcuts→`keyboard`, Load Video→`film`, Folder→`folder-open`, Undo/Redo→`undo-2`/`redo-2`, Quick Chart→`zap`, Stats→`bar-chart-3`, Save→`save`, More→`more-horizontal`, video nav→`chevrons`.
- Group related actions with 1px `--border` vertical dividers and 8px padding, instead of a flat row of equal buttons.
- The CV/heuristics toggle: replace the tooltip containing ``cd server && ./start.sh`` with plain language ("Auto-detect play boundaries — requires the companion server. See Settings → Setup."). Move the command itself into the Settings drawer.

### 4.4 Video dropzone (empty state)

Delete the two glowing gradient tiles. Replace with one card: 1.5px dashed `--border-bright`, radius `--radius-lg`, transparent bg, centered `film` icon at 28px `--text-hint`, "Add game film" primary button, and one hint line "or drop a video or folder anywhere" in `--text-hint`. Exactly one accent color on screen in this state.

### 4.5 Down & Distance badge (signature)

A small component used in the play table's DN & DIST column, the tagging panel's current-situation readout, and the game header:

```css
.dd-badge {
  display: inline-block; padding: 2px 7px;
  background: var(--bg-tertiary); border-radius: 4px;
  font-size: 11.5px; font-weight: 650; letter-spacing: .05em;
  text-transform: uppercase; font-variant-numeric: tabular-nums;
  color: var(--text);
}
.dd-badge--key { background: var(--accent-soft); color: var(--accent-hover); } /* 3rd/4th down */
```

Render as `1ST & 10`, `3RD & 6`. Third and fourth down get the `--key` variant — a football-true use of emphasis.

### 4.6 Play table

- Header row: 11px / 650 / uppercase / letter-spacing .06em / `--text-hint`; transparent bg; 1px bottom border.
- Rows 32px; hover `#F7F8FA`; selected row `--accent-soft` with a 2px inset left border in `--accent` (replace any outline/box focus ring on cells).
- Numeric columns (YDS, #) right-aligned, tabular. Gains `+4` in `--success` 600; losses `−2` in `--danger` 600; render a true minus sign. Color-as-text, not filled cells.
- Formation/type columns: plain text; if tinting play type, use `--run-soft`/`--run-text` and `--pass-soft`/`--pass-text` pairs only.
- The blue tendency summary row under the header (e.g., "Shotgun 37% · Run Inside 26%"): restyle to 11px `--text-hint` with the percentages in 550 tabular — informative, not shouting.

### 4.7 Video transport

- 40px strip on white with top border. Icon buttons 30px square, ghost hover. Timeline: 4px track `--border`, progress `--accent`, 12px handle on hover only. Play-boundary markers as 2px `--text-hint` ticks.
- Timecode + FPS in tabular numerals. A/B loop buttons show an active state via the single-choice selected style.

### 4.8 Overlays, cards, stats

- Cards: white, 1px `--border`, radius `--radius-lg`, no shadow.
- Dropdowns/popovers: `--shadow-md` + 1px border. Modals: `--shadow-lg` + 1px border; backdrop `rgba(16,24,40,.45)`; entrance 140ms fade + scale .985→1; respect `prefers-reduced-motion`.
- Stat cards: 24px tabular numeral + 11px uppercase label. Run/pass bars use `--run-color`/`--pass-color` — these two hues appear **nowhere else** in the chrome.

### 4.9 Focus & motion

- Global `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`. Remove all 3px glow rings.
- Transitions: background/color/border only, 120ms. No transform pops on hover, no animated glows.

---

## 5. Kill list (grep and destroy)

1. `--shadow-blue`, `--shadow-glow`, and every `box-shadow` involving `rgba(65,105,225…)`.
2. All emoji in UI chrome (🏈 📂 📁 📋 📊 💾 ⚙ etc.) → SVG icons. Emoji in user data/notes is fine.
3. Gradient backgrounds on the Add Video / Add Folder tiles; the cyan secondary accent.
4. `#4169e1` anywhere (including hardcoded, not just the var).
5. White text on orange, anywhere.
6. Font sizes below 11px; any non-scale one-off sizes (12px→12.5, 13.5→13, etc.).
7. Borders on idle chips.
8. Shell commands or file paths in tooltips/labels.

---

## 6. Execution plan (work in this order, commit per phase)

1. **Tokens & focus** — swap `:root`, delete dead shadow vars, add `:focus-visible`, global radius audit. *Smoke test: app loads, demo season renders, nothing visually broken.*
2. **Typography** — base scale, section micro-labels, tabular numerals, wordmark. 
3. **Chips & segmented controls** — single-choice vs multi-select variants, hotkey badges, uniform 28px height.
4. **Toolbar & buttons** — SVG icon set, button tiers, grouping/dividers, CV tooltip copy, dropzone rebuild.
5. **Play table & transport** — header treatment, row states, D&D badge component, numeric alignment, scrubber.
6. **Overlays & stats surfaces** — cards, modals, stat numerals, run/pass bar colors, Self-Scout tables, Call Sheet print styles inherit the new tokens.
7. **QA pass** — checklist below.

After each phase: reload with the demo season, screenshot the main view + tagging panel + stats view, and visually compare against this spec before moving on.

## 7. Acceptance checklist

- [ ] No occurrence of `#4169e1`, `royalblue`, `shadow-blue`, or glow shadows in the file
- [ ] No emoji in chrome; toolbar renders SVG icons at consistent 16px
- [ ] All text ≥ 4.5:1 on its real background (spot-check: `--text-dim` on white, white on `--accent`, `--run-text` on `--run-soft`, table hint row)
- [ ] Chips: idle = tonal borderless; selected single-choice = solid blue; selected multi-select = tinted + border + ✓
- [ ] Exactly one solid-blue primary button in the header
- [ ] All timecodes, yardage, scores, FPS, stat numerals use tabular figures
- [ ] D&D badge component used in play table, tagging readout, and game header; 3rd/4th down variant works
- [ ] Cards are border-only; shadows appear only on dropdowns/modals
- [ ] Every keyboard shortcut, filter, export, save, and tagging behavior works exactly as before (tag one play end-to-end with hotkeys as the regression test)
- [ ] Single-file constraint intact: no external network requests added
