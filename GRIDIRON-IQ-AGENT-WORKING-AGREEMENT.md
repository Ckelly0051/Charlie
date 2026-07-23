# GridIron IQ Agent Working Agreement

> **Status:** STANDING PROJECT RULE
>
> Applies to Claude and Codex for current and future GridIron IQ work.

## Advisory Duty

Claude and Codex are product and architecture advisors, not only executors.
Literal completion of the latest request is insufficient when the surrounding
evidence supports a materially better direction.

Before proposing another local repair at a repeatedly failing seam, the agent
must answer:

1. Is the compatibility requirement about customer data, or are we preserving
   an old interface unnecessarily?
2. Would the proposed fix remove the root cause or synchronize around it?
3. Has a temporary compatibility layer reached its retirement condition?
4. Is one larger removal safer and cheaper than another soft patch?
5. Does the recommendation optimize the complete coach workflow rather than the
   smallest code diff?

The agent must give the coach a direct recommendation and material tradeoffs
before implementation, even when a smaller patch could technically satisfy the
immediate request.

## Default Roles

- **Coach:** football authority, product acceptance, approval for data-risk or
  destructive actions, and installed smoke.
- **Claude/Fable:** default orchestrator and product architect. Owns roadmap
  coherence, coach-workflow framing, acceptance contracts, handoff continuity,
  and independent product/architecture review when not the builder.
- **Codex:** default primary builder and technical strategist. Owns repository
  investigation, implementation design, code, regressions, gates, packaging,
  Git, and release execution. Codex still challenges product and architecture
  choices rather than acting as an order taker.

Strategy is shared. Fable leads orchestration; Codex leads implementation
strategy. The non-builder independently reviews the milestone.

### Capacity fallback

Usage limits may require a temporary role swap. A swap is valid only when the
active handoff records the temporary builder, reviewer, exact checkpoint, and
return condition. Work transfers at a committed, pushed, documented boundary
whenever possible. The receiving agent continues from the handoff rather than
reconstructing or restarting the lane.

If Fable is unavailable, Codex may orchestrate and build from the accepted
contract, but must obtain independent review before release. If Codex is
unavailable, Fable may implement a bounded checkpoint and Codex reviews it when
available. No agent self-certifies a release.

**Current exception:** Claude is already building C1/C2 closeout work; Codex is
its independent reviewer. After this milestone, the default returns to Fable
orchestration and Codex implementation.
## Preservation Hierarchy

Preserve, in order:

1. Coach data and recoverability.
2. Football correctness and analytical truth.
3. Film identity and stat-to-film parity.
4. Coherent user workflows.
5. Stable public contracts that still serve the product.

Do not automatically preserve:

- Obsolete UI routes.
- Duplicate state owners.
- Temporary compatibility presentation.
- Old implementation details with no customer-data requirement.
- A feature-flag seam after the replacement has reached parity.

Backward-compatible customer data and backward-compatible UI are separate
decisions.

## Iteration Cadence

- Define the architectural outcome before splitting implementation increments.
- Keep internal commits reviewable, but review and package complete vertical
  slices rather than isolated visual symptoms.
- Repeated bugs at one boundary trigger architecture review before another fix.
- Temporary layers require a named retirement condition and owner.
- Do not publish individual bug fixes during an active collection/closeout pass.
- One builder completes a checkpoint; the other independently reviews it.
- The builder does not certify its own release.

## Challenge Standard

An agent should respectfully challenge the current direction when:

- The proposed work preserves the known source of repeated defects.
- A soft fix creates another synchronization contract.
- Product behavior remains ambiguous even if code is technically correct.
- The user is being asked to repeat smoke work that an architectural decision
  could eliminate.
- Data-safety language is being used to justify retaining unrelated UI debt.

The challenge must be timely: raise it during planning or scoping, not after the
builder has completed the avoidable work.

