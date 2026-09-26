# Post-Legacy Instruction Audit

Agreed 2026-09-25. Run after the agreed legacy excision is complete, not during
the conversion or reader removal. This is an audit checkpoint, not permission
to edit instructions or retire tests. The coach currently uses Opus 5.5; its
version alone is not evidence that a rule should change.

## Prompt For Claude

```text
Read CLAUDE.md and your project MEMORY.md (memory.md if that is its actual
filename) first. Then read docs/LEGACY-EXCISION-PLAN.md and verify that the
agreed excision is complete. If it is not, report the unfinished prerequisite
and stop this audit. Do not change files, settings, code, tests, or coach data.

Audit our instruction setup for duplication, contradictions, obsolete legacy
references, and unnecessary mandatory reading. The goal is a smaller, clearer
setup without losing protections or reliable completion behavior.

Inventory the instruction sources you can actually inspect: project and
parent CLAUDE.md files, project memory, skills, agent definitions, hooks,
permission settings, and completion rules. State what you could not inspect.
Distinguish always-loaded instructions from on-demand reference material;
do not count every referenced document as always loaded.

Preserve coach-data safeguards, explicit approval boundaries, build and
verification procedures, ownership rules, and non-obvious project conventions.
Rules tied to documented regressions require checking their original purpose
and current code before proposing removal. Never weaken a safeguard merely
because it costs tokens or limits autonomy.

Do not assume guidance is obsolete because it predates Opus 5.5. Identify
model-specific claims separately and require evidence for any proposed change.
Do not invent cleanup work if the current setup is sound.

Report at most ten actionable findings, highest impact first. For each give:
- File and exact line reference, with the affected instruction quoted briefly.
- Concrete evidence of duplication, conflict, obsolete behavior, or avoidable
  mandatory reading; separate confirmed problems from hypotheses.
- The exact proposed replacement or deletion, and what must remain protected.
- Whether it is safe editorial cleanup or needs behavioral verification.

Prefer a short binding CLAUDE.md with clearly named, on-demand reference docs
where useful. Moving text is not improvement if the same full reading remains
mandatory. Do not retire harnesses merely because their names mention legacy;
identify the current contract they protect and any replacement coverage first.

Recommend the smallest useful cleanup batch and explicit checks for it.
Use no more than three brief scenario walkthroughs, only if they expose a
specific conflict: a small fix, a multi-file refactor, and a coach-data task.
Paper walkthroughs are not proof of reliability or token savings. Any claimed
improvement needs a comparable before/after task and stated measurement limits.

Deliver findings, coverage gaps, the proposed first batch, and verification
requirements. Apply nothing. Stop for coach approval before implementation.
```

## Completion Boundary

An audit report does not approve cleanup. A subsequent approved batch must
preserve required safeguards, verify links and instruction precedence, record
what moved or was retired, and commit the agreed documentation. No full gate
is required for a purely editorial audit; implementation verification scales
with any changed behavior or test coverage.
