# GridIron IQ — Release Quality Gate

> **Status:** Active from 2026-07-16. Governs every increment after the
> BETA-009 checkpoint (`b6ca8b3`).
>
> **Why this exists.** The `v1.12.0-2` beta passed a fully green automated gate
> and then failed in the coach's first ten minutes of real use. BETA-001 (raw
> markup rendered on screen), BETA-002 (the approved workspace was never ported),
> and BETA-003 (charting navigation escaping the example set) were all invisible
> to 49 passing harnesses. More harnesses of the same kind would not have caught
> any of them. This document is the missing half of the gate: the part that asks
> *is this usable on real film*, not *do the contracts hold*.
>
> **This gate is defined before the work it governs**, on purpose. A quality bar
> written after the risky increment is a finish line that moves.

## Current release blocker - v1.12.0-8 linked-film scope collision

The installed `v1.12.0-8` smoke exposed a release-blocking distinction the
automated gate did not prove: selecting a game's child folder overwrote the
global film-library root, while the game itself did not persist linked
`filmMode`/`filmDir`. Playback could therefore still come from a managed C:
copy. The root chooser also offered no durable visible confirmation.

No subsequent candidate passes this gate unless the evidence shows all of the
following on the same committed bytes and installed artifact:

- the app-level library root remains unchanged after linking a game folder;
- the game-level linked source is saved canonically and survives reopen;
- resolved playback points to the selected external drive;
- no managed import/copy call occurs in linked mode;
- the UI visibly identifies the exact root and each game's actual source;
- all plays, tags, clip refs, notes, ids, and backups remain unchanged; and
- the coach signs the installed smoke before a new release tag is published.

## The rule that was wrong before

Real-film smoke **cannot** happen "before packaging" — the coach needs an
installable artifact to smoke. The correct order is:

```
build internal candidate  →  smoke it  →  publish/tag as the beta release
```

**Packaging is not publishing.** An internal candidate may be built freely. Only
a passed smoke record promotes it to a published prerelease.

## The matrix

Every row must pass before an internal candidate is promoted to a published
release. A row is passed only with its named evidence — "I ran it" is not
evidence.

**Ownership is explicit, and the builder never self-certifies.** "agent" was the
owner column in the first draft of this file; that let whoever wrote the code
also declare it good, which contradicts §7 of the redesign plan and is the
arrangement that produced the beta. The split:

**The reviewer is defined by who did NOT build it — never by name.** An earlier
draft of this table assigned the analytics/parity/persistence audit permanently
to Claude. That is self-certification whenever Claude is the builder, which is
the same hole in different clothing. Names below are **domain defaults for when
the agent is not the builder**, not standing assignments.

| Role | Owns |
|------|------|
| **Builder** (whoever wrote the increment) | Focused + complete automated gates. **Nothing else. Never audits or signs off its own increment**, regardless of domain. |
| **Non-builder agent** | Independent code + regression review, and **every audit row below**. If the domain default is the builder, the other agent takes it. |
| *Domain default — Claude* | Analytics, parity, persistence, data-integrity audit — **when Claude did not build the increment.** |
| *Domain default — Codex* | UX, accessibility, screenshots, artifact construction + inspection — **when Codex did not build the increment.** |
| **Coach** | Installed smoke; publication authorization. The only sign-off that cannot be delegated. |
| **Codex** (post-approval) | Final record and publishing. |

If both agents touched an increment, the coach names the reviewer. If no
non-builder reviewer is available, the increment **waits** — it does not ship on
the builder's own word.

| # | Gate | Owner | Evidence artifact | Pass criterion |
|---|------|-------|-------------------|----------------|
| 1 | **Automated contracts + full repository gate** | **builder** runs; **other agent** re-runs on the reviewed bytes | `tools/run-gate.sh` log with the actual count | Every current `tools/e2e-*.mjs` green, zero page errors. A harness is green only if **exit code is 0 AND its result line is clean** — neither alone. Build and gate in ONE command. |
| 2 | **Analytics parity** | **non-builder reviewer** (default Claude) | Parity golden diff | Synthetic + real six-game goldens byte-identical, or the deliberate change is called out and reviewed. **Never regenerate to make it pass.** |
| 3 | **Data integrity** | **non-builder reviewer** (default Claude) | Integrity fuzzer log | Real six-game fixture, zero violations. Ops must include the class being changed (lesson #21: the fuzzer only catches what its op-set covers). |
| 3b | **Real-data check actually ran** | **non-builder reviewer** (default Claude) | `e2e-realdata` result line | Non-zero games **passed** (not merely checked) against a real fixture; normalize self-heal counters at zero. A missing fixture is a **failure**, not a skip, unless `GIQ_REALDATA_OPTIONAL=1` is deliberately set on a non-review machine. |
| 4 | **Four-viewport screenshot review** | **non-builder reviewer** (default Codex) captures; **coach approves** | Captures at 1440×900, 1280×720, 768×1024, 390×844 | No clipping, overlap, or page-level horizontal overflow. Coach sees them **before** packaging, not after. |
| 5 | **Desktop artifact asset inspection** | **non-builder reviewer** (default Codex) | Asset check log against the exact stamped bundle | The packaged bundle — not the working tree — contains the expected video/workspace/form/shell/SVG/SQL resources. |
| 6 | **Installed real-film smoke** | **coach** | Signed smoke record (template below) | Runs on the installed artifact against real high-resolution film. The only gate that can catch codec/disk/decoder behavior. |
| 7 | **Reopen + persistence** | coach, inside #6 | Smoke record | Close and relaunch: film auto-loads, play counts and tags survive, no duplicate clips after repeated game switches. **Edit and re-save — do not merely open.** |
| 8 | **Analytics-to-film navigation** | coach, inside #6 | Smoke record | A stat row → Watch → the correct plays play. Charting navigation stays inside the example set (the BETA-003 class). |
| 9 | **Signed smoke record + publication authorization** | **coach** authorizes; **Codex** publishes | `SMOKE-<version>.md` | Names the exact SHA and artifact filename. An unsigned or SHA-less record does not count. |

## Why #4 and #6 are the load-bearing rows

Rows 1–3 are what the project already did well and what still passed while the
beta failed. Rows 4 and 6 are the ones that were missing:

- **#4** would have caught BETA-001 and BETA-002 — both were *visible on screen*
  and invisible to assertions.
- **#6** is the only place codec, disk-throughput, and decoder stalls exist.
  BETA-007's playback fix is explicitly *unvalidated* until it runs on the
  coach's real film.

If schedule pressure forces a cut, cut scope — never #4 or #6.

## Smoke record template

```markdown
# Smoke record — <version>

Artifact:   <exact installer filename>
SHA:        <full commit sha of the packaged bundle>
Built from: <branch>
Date:       <date>
Tester:     <name>

## Result: PASS | FAIL

| Check | Result | Notes |
|---|---|---|
| Install + launch | | |
| Open real season, correct play counts | | |
| Managed film plays | | |
| Linked film plays | | |
| Chart a play, reopen, tags survive | | |
| Game switch ×3, no duplicate clips | | |
| Stat row → Watch → correct plays | | |
| Charting stays inside example set | | |
| Backup created; restore on a COPY | | |
| Playback smooth on real film | | |

## Findings
<numbered, each with surface + repro>
```

## Standing rules

**Never hardcode the harness count.** The suite grows: it has been 42, 44, 45,
46, 47, and 49 at successive milestones, and this session's run found
`sql-catalog` at 17 (docs said 16) and `csv-roundtrip` at 9 (docs said 6). A
hardcoded number is a timestamp masquerading as a target, and it invites someone
to stop at the number. Say **"every current `tools/e2e-*.mjs` harness"** and
record the **actual counts** in each handoff.

**A green result line is not a passing test.** Two ways that lied here:

1. **`e2e-realdata.mjs` could not fail.** It had no failure counter and
   `process.exit(0)`'d unconditionally, printing `🔴 … HUNG` / `🟠 alert popped`
   / `!! N exception(s)` / `console/page errors (N)` on the coach's real season
   and exiting clean anyway. It also exited 0 when the fixture was **absent**,
   so on any machine without the mirror the real-data check silently did not run
   and the suite still looked green. It was counted among the "green harnesses"
   in months of handoffs. **Fixed:** it now counts failures, fails on page/
   console errors, on zero games checked, and on a missing fixture
   (`GIQ_REALDATA_OPTIONAL=1` for a machine that legitimately has none), and is
   scored like any other harness.
2. **`e2e-special-teams-contract.mjs` reports failure only via
   `process.exitCode`** (`:225-226`) — it prints `RESULT: N passed` with no
   failure count. A checker reading only the result line calls a *failing*
   special-teams run green. **Fixed:** a harness is green only if
   **exit code is 0 AND the result line is clean**.

The first version of `run-gate.sh` had both holes, and worse: it saw that
odd `RESULT: 20 passed` line, noticed it lacked a failure count, and **codified
it as a green self-test case** — encoding the vulnerability as intended
behavior. That is the general disease in miniature: a number that sounds like a
guarantee, isn't one, and goes unchecked precisely because it is always green.

**A gate that cries wolf is worse than no gate.** This session's own runner used
a case-insensitive grep for `fail`, which matched test *names* describing
fail-closed behavior ("unknown groups fail closed") and reported four false
failures out of 49. It was caught by reading the RESULT lines — but a checker
that routinely reports false alarms trains everyone to skim past the real one.
Any gate script must be verified against a known-green and a known-red run
before it is trusted.

**Run the gate ALONE. A green from a loaded machine is not evidence.**
Observed 2026-07-16: a gate run started immediately after another gate run had
four puppeteer harnesses (`e2e-realdata`, `e2e-relink-legacy`,
`e2e-relink-linked`, `e2e-season-tab`) die with no result line. Every one passed
standalone, and a clean re-run was 49/49. The failure mode was **process death,
not assertion failure** — consistent with contention from leftover browsers, and
the runner correctly refused to call them green.

Two honest caveats:
- **One clean run does not prove those crashes were benign.** It proves they are
  load-dependent. This project has already had one "flake" that was a real
  cross-game corruption bug reproducible only under parallel load
  ([[integrity-fuzzer-load-race]]). If these recur, chase them — do not
  re-run until green and move on.
- **A crash-under-load is indistinguishable from a real bug at a glance.** That
  is precisely why the runner must fail closed on a missing result line rather
  than skip it.

Practical rule: no concurrent gate runs, no gate while packaging or driving a
browser, and let the previous run's processes exit first.

**Open improvement (not blocking):** an automatic gate lock in `run-gate.sh` —
a lockfile that refuses to start when another run holds it — so two agents
cannot accidentally run the suite concurrently and produce exactly the incident
above. Until then the rule is enforced by discipline, which is the weaker
option.

**Negative assertions require proven liveness.** *(Adopted 2026-07-16 after
the fourth vacuous assertion in two lanes.)*

An assertion of the form "X does not happen" passes for two reasons: X was
correctly prevented, **or the mechanism never ran at all**. Those are
indistinguishable unless the test proves the mechanism was live. Four real
examples from Lanes A and C, every one green against broken code:

| What passed | Why it was vacuous |
|---|---|
| `cardUpdatesPerEvent: play ? cardUpdates : 1` | No season loaded → `plays[0]` undefined → returned a hardcoded `1` without emitting. Passed on **any** code. |
| "`.playback-controls` returns to its original parent" | Baseline captured **after** `_mount()` had already moved it — compared the bug to itself. |
| Same assertion, second attempt | A new page inherited the flag via **per-origin localStorage**, so the "classic" baseline was still mutated. Same defect, different door. |
| "a cancelled drag stops moving the controls" | `setPointerCapture` **throws** on synthetic PointerEvents → `pointerdown` died before arming anything; and with no film loaded `#videoContainer` has **zero height**, so `place()` clamps everything to `12px` — the comparison was `12px === 12px`. |

The rule: whenever a negative check could pass because nothing ran, first prove
the mechanism was live with a positive precondition or equivalent structural
evidence. `liveDragWrites > 0` before
`writesAfterCancel === 0`. If the precondition can't be satisfied, the test is
measuring nothing and must be redesigned — not shipped green.

Corollary: **prefer measuring whether the code path RAN over measuring its
side effects.** Side effects depend on environment (layout, geometry, loaded
data) that a headless harness often lacks. Counting invocations is
geometry-independent. The reviewer's probe found the drag defect precisely
because it ran against a **real loaded game** with real geometry; the harness
structurally could not.

**Mutation-test the fix, not just the bug.** Watching an assertion fail on the
original code proves it detects *that* bug. It does not prove which defense
catches it. Removing the drag guard alone left the suite green because the
cleanup independently fixed it — and vice versa. Only removing **both** went
red. That is worth knowing: it told us the redundancy is real rather than
assumed.

**Re-save, don't just open.** The A3 desktop smoke passed while every re-save
silently duplicated play rows, because the smoke only opened seasons. Any
persistence validation must **edit and re-save**, not just load. See
[[sqljs-fk-cascade-resave-corruption]].

**Green tests are not a correct app.** 250+ assertions were green while
cross-game corruption shipped; 49 were green while the beta was unusable. The
gate's job is to make the *invisible* classes visible — it cannot certify the
visible ones. That is what rows 4 and 6 are for.
