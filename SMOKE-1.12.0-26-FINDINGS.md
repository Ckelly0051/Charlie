# Coach findings — installed smoke `1.12.0-26` (design pass)

Logged as reported. **No fixes started** until the coach says the list is
complete. H-series to avoid colliding with F (1.12.0-19) and G (1.12.0-24).

---

## H1 — Save & Next is clipped

**Route:** Break Down → charting deck, commit bar
**Severity:** layout, blocking-ish (it is the primary action)
**Reported:** 2026-08-05, with screenshot

The Save & Next button overruns its column: **Skip is cut off at the right
edge** and the bar extends past the deck. Previous / Save & Next / Skip do not
fit the row.

*Same class as G12b — a control sized without room for its neighbours. The
commit bar is now three items where the middle one is greedy.*

---

## H2 — Chart and Film Room are dead inside Film Focus

**Route:** Break Down → Film Focus
**Severity:** defect, workflow
**Reported:** 2026-08-05

Film Focus itself works correctly. But once in it, the **Chart** and **Film
Room** buttons do nothing — the only way back is **Show Charting**.

Coach's requirement: **Chart and Film Room should work from inside Film Focus**,
switching directly rather than forcing a return trip through Show Charting.

*Likely the focus mode suppresses the deck and those two commands only act on a
mounted deck. They should exit focus and land on the requested surface.*

---

## H4 — Export Game Report to PDF does nothing

**Route:** Reports → Export → Game Report (PDF)
**Severity:** defect, silent failure
**Reported:** 2026-08-05

Clicking produces no visible result — no PDF, no error, no toast.

**Possible regression, and it should be checked before anything else on this
list.** `1.12.0-25` rewrote `_renderBigTwelve` into cells and added
`_renderScoutDownDistance` / `_renderShape` to render paths the PDF export also
walks. If any of those throws, an export wrapped in a `try/catch` would swallow
it and produce exactly this symptom — nothing happens.

The gate ran green on `-25`, but `e2e-native-reports` asserts the export ROUTES
to its canonical owner; it does not render the PDF. So a throw inside the
document build is a real blind spot rather than something the gate would have
caught.

**First step when fixing: open the console on this build and click it.** A
silent no-op almost always has a logged error behind it, and guessing before
looking is how the last two sessions lost time.

---

## H5 — Every subhead becomes a precise definition

**Route:** Reports, all tabs
**Severity:** copy, applies everywhere
**Reported:** 2026-08-05. Coach: *"I don't need flowery language but a precise
definition of the stat I'm looking at. Change all of them."*

The captions currently explain the chart's *idea* rather than defining the
*measure*. Examples in the build:

* "Bar length is how often we call it. Fill is how well it works. A long pale
  bar is a call we lean on that is not paying."
* "Every offensive snap by yards gained. Mean 2.9 yards, marked."
* "The same read repeated, so the comparison is spatial rather than four rows of
  numbers."
* "Distance to go against yards gained. Everything above the dashed line
  converted."

**Rewrite rule:** state what the number IS and how it is computed. The rule the
coach cannot see is the thing worth printing — the same standard set for G5.
Success rate says the down thresholds; explosive says 12+ run / 16+ pass. Drop
the framing sentence about why the chart is shaped that way.

**This overlaps G5 and they should be written together.** G5 put those
definitions in tooltips; H5 says the subhead itself should carry the definition.
Where a subhead states it, the tooltip is redundant — decide per term rather
than shipping both.

---

## H6 — Radar axis labels are clipped

**Route:** Reports → Offense → This game against our best
**Severity:** defect, mine
**Reported:** 2026-08-05, with screenshot

Three of five spoke labels are cut off by the SVG viewBox: `:ity`
(Ball security), `Exp:` (Explosiveness), `ards / play` (Yards / play). The
labels are placed at `r + 11` inside a 100-unit box with no margin reserved for
them.

**My defect, introduced with F12c in `1.12.0-25`.** Fix is the viewBox, not the
label text.

---

## H7 — Predictability Map header still clipped

**Route:** Reports → Self-Scout → Predictability Map
**Severity:** defect, regression of G7
**Reported:** 2026-08-05, with screenshot

The per-column summary line (`43% · 2.4y`, `60% · 5.2y`) still overlaps the
boundary between the header row and the first formation row. **The G7 fix in
`1.12.0-25` did not work** — I targeted `.ss-matrix .ss-matrix-sum`, which is
evidently not the real class.

Do not guess a second selector. Read the rendered markup first.

---

## H8 — Chart sizing: Cumulative EPA and the field heat map

**Route:** Reports → Offense (EPA), Reports → Heat Maps → Field Position
**Severity:** sizing
**Reported:** 2026-08-05, coach asked directly whether these are sized right

**No.** The Cumulative EPA line takes an entire viewport for what is a
trend-shape read — the same G10 complaint that shrank the yardage spray, on a
chart I did not touch. The Field Position heat map has the same problem.

Both are shapes, not workspaces. Cap them like the F12 visuals were capped.

---

## H9 — The lower-third is applied inconsistently (Claude's observation)

Only `h3` section headings got the plate. Sub-section headings render as plain
uppercase text, so one page carries two heading treatments:

* **Plated:** VISUALIZATIONS, BY QUARTER, EXPECTED POINTS, HEAT MAPS,
  SITUATIONAL, PERSONNEL GROUPINGS, BY DOWN, FORMATION TENDENCIES, THE BIG 11…
* **Not plated:** PLAY DIRECTION, MOTION, PLAY TYPE, FORMATION, PERSONNEL,
  BACKFIELD, STRENGTH, SUCCESS BY FIELD ZONE, YARDAGE SPRAY, TOP 5 EPA PLAYS,
  Cumulative EPA

Either the plate marks a section and sub-heads use a quieter treatment
deliberately, or the sweep is incomplete. Right now it reads as incomplete
rather than as a hierarchy.

---

## H3 — Design implementation status (Claude's read, not a coach finding)

The coach asked whether the full design is implemented, since it is hard to
judge from inside the app. Read from his 1.12.0-26 screenshot:

**Landed and visible:**
* **The lower-third is real.** `SITUATION`, `OUR OFFENSIVE LOOK` and
  `DEFENSE FACED` all render as angled plates. Open groups take the accent, the
  collapsed one stays grey — that is the intended state model.
* **Hairline joins.** The groups butt together on seams rather than floating as
  separate cards.

**NOT landed:**
* **Save & Next is still blue, not first-down yellow.** The selector
  (`.gi-tag-nav button[data-tag-save], .gi-tag-nav .is-primary`) does not match
  the real markup, so that rule is inert. The "one action means done" move is
  not in the build he is looking at.

**Cannot tell from a screenshot, needs checking in the DOM:**
* whether the film stage actually resolves to `--gi-film` rather than
  inheriting the app floor.

**Not attempted yet — still owed before design is "done":**
* the play strip cards, the transport, and the context bar are unchanged from
  the pre-design-pass composition;
* Reports tabs were changed blind and have not been seen at all.

---
