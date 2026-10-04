# How Claude, Codex and the Coach Work Together

Read when planning work, deciding who builds or reviews, or deciding whether to
ask the coach. Binding rules are in `CLAUDE.md`; this is the working model
behind them. History: `docs/archive/plans/GRIDIRON-IQ-AGENT-WORKING-AGREEMENT.md`
and `docs/archive/plans/GRIDIRON-IQ-TRUSTED-ADVISOR-STANDARD.md`.

## Roles

- **Coach**: football authority, product acceptance, approval of anything that
  risks coach data, and the installed smoke. The only sign-off that cannot be
  delegated.
- **Claude and Codex**: product and architecture advisors as well as builders.
  For each checkpoint one builds and the other independently reviews; the
  builder never certifies its own work. When only one agent is available, it
  may build a bounded checkpoint, and the other reviews before anything ships.
- The coach should never have to coordinate the two agents or translate
  implementation details.

## Advisory duty

Doing the latest request literally is not enough when the evidence points to a
materially better direction. Before another local repair at a seam that keeps
failing, answer:

1. Is the compatibility requirement about coach data, or an old interface?
2. Does the fix remove the root cause or synchronize around it?
3. Has a temporary layer reached its retirement condition?
4. Is one larger removal safer and cheaper than another patch?
5. Does the recommendation serve the whole coach workflow, not the smallest
   diff?

Give the coach a direct recommendation and the real tradeoff before building.
Raise a concern during planning, not after the avoidable work is done.

## Decision rights

- **Ask first:** destructive cleanup, data migration, clearing or
  reinterpreting tags, storage moves, irreversible workflow removal, and any
  change to football meaning or scoring.
- **Recommend and plan without being asked:** navigation simplification,
  clearer copy and hierarchy, accessibility, feedback states, sensible
  defaults, performance, and removing implementation-driven friction.
- **Escalate a product decision** when two legitimate coaching workflows trade
  off; state the recommended choice first.
- **Never ask the coach to design the implementation.** Translate the football
  outcome into architecture, tests and release sequence.

## What to preserve, in order

1. Coach data and its recoverability.
2. Football correctness and analytical truth.
3. Film identity and stat-to-film parity.
4. Coherent coach workflows.
5. Stable contracts that still serve the product.

Not automatically preserved: obsolete routes, duplicate state owners,
temporary compatibility presentation, old implementation details with no
data requirement, and a feature flag after its replacement reached parity.
Backward-compatible data and backward-compatible UI are separate decisions.

## Cadence

- Define the architectural outcome before splitting work into increments.
- Review and package complete vertical slices, not isolated symptoms.
- Repeated bugs at one boundary trigger an architecture review before another
  fix.
- A temporary layer needs a named retirement condition and owner.
- Do not package individual fixes during an active collection or smoke pass.

## Coach-first product standard

GridIron IQ is organized around the coach's jobs: connect film, chart a play,
review a tendency, watch the evidence, build a plan.

- Coaching language and game context before technical or storage language.
- The most common football action first; advanced control available without
  forcing every coach through it.
- Team, season, game, unit, perspective and film context survive moving
  between tasks.
- Save state, film source, missing film and failures are visible.
- Fewer clicks and less scrolling during high-volume charting.
- Sensible football defaults, customizable libraries and progressive disclosure
  over giant selector lists.
- Judge designs with real coaching tasks on real film.

Do not wait for the coach to notice that two routes should be one, that a
success message does not prove persistence, that a feature is undiscoverable,
that a compatibility layer outlived its purpose, or that repeated small fixes
cost more than removing the cause.
