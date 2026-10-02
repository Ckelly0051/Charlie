#!/bin/bash
# Keep the established command; Node owns child processes and Chromium cleanup.
cd "$(dirname "$0")/.." || exit 1
exec node tools/run-gate.mjs "$@"
