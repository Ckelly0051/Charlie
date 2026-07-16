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

| # | Gate | Owner | Evidence artifact | Pass criterion |
|---|------|-------|-------------------|----------------|
| 1 | **Automated contracts + full repository gate** | agent | `tools/run-gate.sh` log with the actual counts | Every current pass/fail `tools/e2e-*.mjs` green, zero page errors. Build and gate run in ONE command (mtime skew false-fails `e2e-parity`'s stale-bundle guard). **Read the diagnostic line — it is not scored.** |
| 2 | **Analytics parity** | agent | Parity golden diff | Synthetic + real six-game goldens byte-identical, or the deliberate change is called out and reviewed. **Never regenerate to make it pass.** |
| 3 | **Data integrity** | agent | Integrity fuzzer log | Real six-game fixture, zero violations. Ops must include the class being changed (lesson #21: the fuzzer only catches what its op-set covers). |
| 4 | **Four-viewport screenshot review** | agent captures, **coach approves** | Captures at 1440×900, 1280×720, 768×1024, 390×844 | No clipping, overlap, or page-level horizontal overflow. Coach sees them **before** packaging, not after. |
| 5 | **Desktop artifact asset inspection** | agent | Asset check log against the exact stamped bundle | The packaged bundle — not the working tree — contains the expected video/workspace/form/shell/SVG/SQL resources. |
| 6 | **Installed real-film smoke** | **coach** | Signed smoke record (template below) | Runs on the installed artifact against real high-resolution film. The only gate that can catch codec/disk/decoder behavior. |
| 7 | **Reopen + persistence** | coach, inside #6 | Smoke record | Close and relaunch the app: film auto-loads, play counts and tags survive, no duplicate clips after repeated game switches. |
| 8 | **Analytics-to-film navigation** | coach, inside #6 | Smoke record | A stat row → Watch → the correct plays play. Charting navigation stays inside the example set (the BETA-003 class). |
| 9 | **Signed smoke record** | coach | `SMOKE-<version>.md` | Names the exact SHA and artifact filename. An unsigned or SHA-less record does not count. |

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

**"49/49 green" was never true — it is 48 tests + 1 diagnostic.**
`tools/e2e-realdata.mjs` has **no failure counter and `process.exit(0)`s
unconditionally** (`:116`). It prints `🔴 … HUNG`, `🟠 alert popped`, or
`!! N exception(s)` when the coach's real season misbehaves — and still exits 0.
It has been counted among the "green harnesses" in every handoff for months,
including one written earlier in this same session. It cannot fail the gate; a
human must **read** it. `run-gate.sh` now scores it separately and greps its own
markers. Correct phrasing: **"N pass/fail harnesses green, plus the realdata
diagnostic reviewed."**

This is a small example of the general disease: a number that sounds like a
guarantee, isn't one, and nobody checked because it was always green.

**A gate that cries wolf is worse than no gate.** This session's own runner used
a case-insensitive grep for `fail`, which matched test *names* describing
fail-closed behavior ("unknown groups fail closed") and reported four false
failures out of 49. It was caught by reading the RESULT lines — but a checker
that routinely reports false alarms trains everyone to skim past the real one.
Any gate script must be verified against a known-green and a known-red run
before it is trusted.

**Re-save, don't just open.** The A3 desktop smoke passed while every re-save
silently duplicated play rows, because the smoke only opened seasons. Any
persistence validation must **edit and re-save**, not just load. See
[[sqljs-fk-cascade-resave-corruption]].

**Green tests are not a correct app.** 250+ assertions were green while
cross-game corruption shipped; 49 were green while the beta was unusable. The
gate's job is to make the *invisible* classes visible — it cannot certify the
visible ones. That is what rows 4 and 6 are for.
