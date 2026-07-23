# GridIron IQ Milestone Release Policy

> **Status:** STANDING RELEASE RULE
>
> This replaces the internal/hidden candidate distinction.

## Principle

GridIron IQ uses clean, visible, versioned releases at meaningful milestones.
There is no customer benefit in producing hidden desktop candidates that are
hard to locate, explain, or reproduce.

## Cadence

1. Build and test source locally during an active milestone.
2. Do not package or publish each individual bug fix.
3. Complete the milestone's implementation and independent review.
4. Rebuild from the accepted committed source and run the canonical gate against
   those exact bytes.
5. Create one versioned GitHub beta release with the desktop installers and all
   required assets.
6. The coach smoke-tests that exact published release.
7. If it passes, record the milestone as accepted.
8. If it fails, keep the release and mark it superseded/failed in the handoff.
   Repair the complete next batch and publish a new version. Never replace assets
   silently under an existing tag.

## Required Release Truth

Every milestone release records:

- Source commit SHA.
- Version and tag.
- Build workflow/run.
- Installer filenames.
- Automated gate result.
- Independent reviewer and verdict.
- Installed-smoke status.
- Known limitations or failed/superseded status.

The app, documentation, GitHub tag, and installer version must agree.

## Roles

- Builder completes the milestone and its focused proof.
- Independent reviewer accepts or rejects the committed source.
- Codex or Claude publishes after review, according to the active handoff.
- The coach tests the published beta and alone approves data cleanup or stable
  promotion.

## Current Closeout Application

C1 route retirement and C2 linked-film truth remain one milestone. Do not
publish C1 alone. After combined independent acceptance, publish one clean
versioned beta release. That published release is the coach's smoke artifact;
there is no separate hidden candidate phase.

