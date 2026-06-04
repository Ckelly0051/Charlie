#!/usr/bin/env bash
# Launch the GridIron IQ local CV server.
# First run will create a venv and download deps (~1GB incl. torch).
set -e

cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  echo "==> creating virtualenv (.venv)"
  python3 -m venv .venv
fi

source .venv/bin/activate

if [ ! -f ".venv/.installed" ]; then
  echo "==> installing requirements"
  pip install --upgrade pip
  pip install -r requirements.txt
  touch .venv/.installed
fi

exec python app.py
