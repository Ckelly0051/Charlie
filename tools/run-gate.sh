#!/bin/bash
# GridIron IQ — canonical gate runner.
#
# Build and gate run in ONE command on purpose: the environment bumps js mtimes
# between a separate build and test, which false-fails e2e-parity's
# stale-bundle guard.
#
# Failure detection reads ONLY the harness result line. An earlier ad-hoc runner
# grepped case-insensitively for "fail" across all output and matched test NAMES
# describing fail-closed behavior ("unknown groups fail closed"), reporting 4
# false failures out of 49. A gate that cries wolf trains people to skim past the
# real one. Verify this script against a known-green AND a known-red run before
# trusting it (see --self-test).
#
# Usage:
#   bash tools/run-gate.sh            # build + full gate
#   bash tools/run-gate.sh --no-build # gate only (bundle already fresh)
#   bash tools/run-gate.sh --self-test # prove the detector catches a real failure

cd "$(dirname "$0")/.." || exit 1

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

is_green() {
  local line="$1"
  [ -z "$line" ] && return 1                                   # no result line = not green
  printf '%s\n' "$line" | grep -qE '[1-9][0-9]*[[:space:]]+(failed|failures)' && return 1
  printf '%s\n' "$line" | grep -qE 'violations:[[:space:]]*[1-9]' && return 1
  return 0
}

if [ "$1" = "--self-test" ]; then
  fails=0
  check() { # expected_rc, line, label
    is_green "$2"; local rc=$?
    if [ "$rc" -eq "$1" ]; then echo "  ok   $3"; else echo "  BAD  $3 (rc=$rc want=$1)"; fails=$((fails+1)); fi
  }
  echo "=== detector self-test ==="
  check 0 "== RESULT: 24 passed, 0 failed ==" "green: 0 failed"
  check 0 "ALL PASS — 18 passed, 0 failed" "green: ALL PASS"
  check 0 "ALL PASS — 16 campaigns clean, 0 failures" "green: 0 failures"
  check 0 "== RESULT: 20 passed ==" "green: no failure count"
  check 0 "TOTALS — violations: 0" "green: 0 violations"
  check 1 "== RESULT: 20 passed, 3 failed ==" "RED: 3 failed"
  check 1 "ALL PASS — 4 campaigns clean, 1 failures" "RED: 1 failures"
  check 1 "TOTALS — violations: 12" "RED: 12 violations"
  check 1 "" "RED: no result line (harness crashed)"
  # The exact regression that produced the false alarms:
  check 0 "$(result_line 'PASS  unknown groups fail closed
== RESULT: 12 passed, 0 failed ==')" "green despite 'fail' in a test NAME"
  echo "=== self-test: $fails bad ==="
  exit $((fails > 0))
fi

if [ "$1" != "--no-build" ]; then
  echo "=== BUILD ==="
  bash build.sh 2>&1 | tail -2 || exit 1
fi

echo "=== GATE ==="
pass=0; fail=0; count=0; diag=0; failed_names=""
for f in tools/e2e-*.mjs; do
  base=$(basename "$f")
  out=$(node "$f" 2>&1)

  # e2e-realdata.mjs is a DIAGNOSTIC, not a pass/fail harness: it has no failure
  # counter and process.exit(0)s unconditionally (tools/e2e-realdata.mjs:116).
  # It CANNOT fail the gate — a hung render loop on the coach's real season
  # prints a 🔴 line and still exits 0. Counting it among the green harnesses
  # inflates the number and implies a guarantee it does not make. Surface its
  # own markers and score it separately.
  if [ "$base" = "e2e-realdata.mjs" ]; then
    diag=1
    bad=$(printf '%s\n' "$out" | grep -E '🔴|🟠|!!|exception' | head -5)
    if [ -n "$bad" ]; then
      fail=$((fail+1)); failed_names="$failed_names $base(diagnostic)"
      printf 'FAIL %-42s diagnostic reported problems\n' "$base"
      printf '%s\n' "$bad" | sed 's/^/       /'
    else
      printf 'diag %-42s %s\n' "$base" "$(printf '%s\n' "$out" | grep -c 'all views ok') season-games ok (exit code is NOT a gate)"
    fi
    continue
  fi

  count=$((count+1))
  line=$(result_line "$out")
  if is_green "$line"; then
    pass=$((pass+1)); printf 'ok   %-42s %s\n' "$base" "$line"
  else
    fail=$((fail+1)); failed_names="$failed_names $base"
    printf 'FAIL %-42s %s\n' "$base" "${line:-<no result line — crashed?>}"
    printf '%s\n' "$out" | tail -12 | sed 's/^/       /'
  fi
done

echo ""
echo "=== $count pass/fail harnesses | $pass green | $fail failed | $diag diagnostic ==="
[ "$fail" -gt 0 ] && echo "failed:$failed_names"
# Record the ACTUAL count in the handoff. Never hardcode it — the suite grows.
exit $((fail > 0))
