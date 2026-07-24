# GridIron IQ Milestone Release Policy

> **Status:** STANDING RELEASE RULE
>
> This replaces the internal/hidden candidate distinction.
>
> **⚠ AMENDED BY COACH DECISION (2026-07-23): the prerelease/publish step is
> DROPPED as unnecessary process.** The smoke artifact is a **locally built
> installer** (`cargo tauri build`), handed to the coach directly — not a
> published GitHub prerelease. Rationale: the coach is the only smoke tester, is
> on Windows, and installs from disk; tagging, Actions round-trips, signed
> cross-platform artifacts, `latest.json`, and auto-update machinery deliver
> nothing to a single known tester and cost a full publish cycle per iteration.
>
> **What this changes:** §Cadence steps 5–8 and the tag/workflow rows in
> §Required Release Truth apply ONLY when a build is actually published for
> distribution. For milestone smoke, record the source SHA, version, installer
> filename, gate result, and smoke status — there is no tag or workflow run to
> cite. **What it does NOT change:** version numbers still get bumped in all four
> places and must agree with the app and docs; the canonical gate still runs
> against the exact stamped bytes; and the coach still alone approves data
> cleanup. A published release remains available when one is genuinely wanted
> (real distribution, or pushing an update to installed clients) — it is simply
> no longer a required step between "milestone done" and "coach smokes it."
>
> Keep the `-N` version suffix. `configureBetaDefaults` gates on `/-\d+$/`, and
> it is what seeds `ffa_sql_catalog` on a fresh profile; a version like `1.13.0`
> would silently skip that seeding.

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

C1 route retirement and C2 linked-film truth remain one milestone. Do not ship
C1 alone.

**Superseded by the 2026-07-23 amendment above:** the milestone's smoke artifact
is the locally built `1.12.0-10` installer, not a published beta release. The
coach also elected to proceed **without** Codex's independent review for now —
Codex reviews when its usage resets, and that review still gates any data
cleanup (deleting managed C: film) and any promotion to a stable published
build. Two adversarial self-reviews stand in the interim; both found real
defects (a P0 film-load race, a wrong-game messaging leak, a 32px mobile touch
target, and a first-launch form-composition bug), which is the honest argument
for keeping the independent pass on the schedule rather than dropping it.

