#!/bin/bash
# GridIron IQ — canonical gate runner.
#
# Build and gate run in ONE command on purpose: the environment bumps js mtimes
# between a separate build and test, which false-fails e2e-parity's
# stale-bundle guard.
#
# A harness is green only when BOTH its exit code is 0 AND its result line is
# clean (see is_green). Two failure modes forced this:
#   - Reading the whole output: an earlier ad-hoc runner grepped case-
#     insensitively for "fail" and matched test NAMES describing fail-closed
#     behavior ("unknown groups fail closed"), reporting 4 false failures of 49.
#     A gate that cries wolf trains people to skim past the real one.
#   - Reading only the result line: e2e-special-teams-contract.mjs prints
#     "RESULT: N passed" with no failure count and signals failure ONLY via
#     process.exitCode, so a failing run reported green.
# Verify against known-green AND known-red before trusting it (--self-test).
#
# Usage:
#   bash tools/run-gate.sh            # build + full gate
#   bash tools/run-gate.sh --no-build # gate only (bundle already fresh)
#   bash tools/run-gate.sh --self-test # prove the detector catches a real failure

set -o pipefail   # REQUIRED: `build.sh | tail` returns tail's status, so without
                  # this a FAILED BUILD passes and the gate runs the stale bundle.
cd "$(dirname "$0")/.." || exit 1

# A harness is green iff BOTH:
#   (a) its process exit code is 0, AND
#   (b) its result line reports no failures.
# Neither alone is sufficient:
#   - e2e-special-teams-contract.mjs prints "RESULT: N passed" with NO failure
#     count and signals failure ONLY via process.exitCode (:225-226). Checking
#     the line alone reports a FAILING special-teams run as green.
#   - A harness could exit 0 while printing failures.
# A harness passes iff its result line reports zero failures. Recognized forms:
#   "== RESULT: 24 passed, 0 failed =="
#   "ALL PASS — 18 passed, 0 failed"
#   "ALL PASS — 16 campaigns clean, 0 failures"
#   "== RESULT: 20 passed =="            (no failure count emitted)
#   "TOTALS — violations: 0"
# Anchored on these lines only; prose and test names are never inspected.
result_line() {
  printf '%s\n' "$1" | grep -E '(RESULT:|ALL PASS|TOTALS)' | tail -1
}

# $1 = result line, $2 = process exit code. BOTH must be clean.
is_green() {
  local line="$1" rc="${2:-0}"
  [ "$rc" -ne 0 ] && return 1                                  # nonzero exit = not green, whatever it printed
  [ -z "$line" ] && return 1                                   # no result line = not green
  printf '%s\n' "$line" | grep -qE '[1-9][0-9]*[[:space:]]+(failed|failures)' && return 1
  printf '%s\n' "$line" | grep -qE 'violations:[[:space:]]*[1-9]' && return 1
  return 0
}

if [ "$1" = "--self-test" ]; then
  fails=0
  check() { # want_rc, line, exit_code, label
    is_green "$2" "$3"; local rc=$?
    if [ "$rc" -eq "$1" ]; then echo "  ok   $4"; else echo "  BAD  $4 (rc=$rc want=$1)"; fails=$((fails+1)); fi
  }
  echo "=== detector self-test ==="
  check 0 "== RESULT: 24 passed, 0 failed ==" 0 "green: 0 failed"
  check 0 "ALL PASS — 18 passed, 0 failed" 0 "green: ALL PASS"
  check 0 "ALL PASS — 16 campaigns clean, 0 failures" 0 "green: 0 failures"
  check 0 "TOTALS — violations: 0" 0 "green: 0 violations"
  check 1 "== RESULT: 20 passed, 3 failed ==" 1 "RED: 3 failed"
  check 1 "ALL PASS — 4 campaigns clean, 1 failures" 1 "RED: 1 failures"
  check 1 "TOTALS — violations: 12" 1 "RED: 12 violations"
  check 1 "" 0 "RED: no result line (harness crashed)"
  # The false-alarm regression: 'fail' inside a test NAME must not turn it red.
  check 0 "$(result_line 'PASS  unknown groups fail closed
== RESULT: 12 passed, 0 failed ==')" 0 "green despite 'fail' in a test NAME"
  # THE HOLE THIS RUNNER SHIPPED WITH (review finding #2). e2e-special-teams-
  # contract.mjs prints "RESULT: N passed" with no failure count and reports
  # failure ONLY through process.exitCode. The first version of this script
  # codified that exact line as a GREEN case, so a failing special-teams run
  # would have been reported green.
  check 1 "== RESULT: 20 passed ==" 1 "RED: green-LOOKING line but exit 1"
  check 0 "== RESULT: 20 passed ==" 0 "green: no failure count AND exit 0"
  check 1 "== RESULT: 20 passed, 0 failed ==" 1 "RED: clean line but exit 1"
  check 1 "== RESULT: 20 passed, 2 failed ==" 0 "RED: failures printed but exit 0"

  # Build-guard self-test (review finding #1): a failing build piped to tail
  # must not be swallowed. Without `set -o pipefail` this returns 0.
  echo "=== build-guard self-test ==="
  ( set -o pipefail; ( echo 'simulated build failure'; exit 1 ) | tail -2 >/dev/null )
  if [ $? -ne 0 ]; then echo "  ok   RED: failing build propagates through the pipe";
  else echo "  BAD  failing build was SWALLOWED by the pipe"; fails=$((fails+1)); fi
  ( set -o pipefail; ( echo 'ok'; exit 0 ) | tail -2 >/dev/null )
  if [ $? -eq 0 ]; then echo "  ok   green: succeeding build passes";
  else echo "  BAD  succeeding build reported failure"; fails=$((fails+1)); fi

  echo "=== self-test: $fails bad ==="
  exit $((fails > 0))
fi

if [ "$1" != "--no-build" ]; then
  echo "=== BUILD ==="
  # Status checked explicitly as well as via pipefail — belt and braces, because
  # a swallowed build failure means the whole gate runs the STALE bundle and
  # reports green. That is the exact false-green class this gate exists to stop.
  build_out=$(bash build.sh 2>&1); build_rc=$?
  printf '%s\n' "$build_out" | tail -2
  if [ "$build_rc" -ne 0 ]; then
    echo "BUILD FAILED (exit $build_rc) — refusing to gate a stale bundle."
    exit 1
  fi
fi

echo "=== GATE ==="
# No harness is special-cased. e2e-realdata.mjs was previously a diagnostic that
# exit(0)'d unconditionally; it now keeps a failure counter and returns nonzero,
# so it is scored like everything else (review finding #3).
pass=0; fail=0; count=0; failed_names=""
for f in tools/e2e-*.mjs; do
  base=$(basename "$f")
  count=$((count+1))
  out=$(node "$f" 2>&1); rc=$?
  line=$(result_line "$out")
  if is_green "$line" "$rc"; then
    pass=$((pass+1)); printf 'ok   %-42s %s\n' "$base" "$line"
  else
    fail=$((fail+1)); failed_names="$failed_names $base"
    printf 'FAIL %-42s (exit %s) %s\n' "$base" "$rc" "${line:-<no result line — crashed?>}"
    printf '%s\n' "$out" | tail -12 | sed 's/^/       /'
  fi
done

echo ""
echo "=== $count harnesses | $pass green | $fail failed ==="
[ "$fail" -gt 0 ] && echo "failed:$failed_names"
# Record the ACTUAL count in the handoff. Never hardcode it — the suite grows.
exit $((fail > 0))
