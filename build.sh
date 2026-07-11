#!/bin/bash
# Build a single self-contained HTML file from the modular source files
# Run from the repo root regardless of where the script is invoked from.
cd "$(dirname "$0")"

OUTPUT="football-film-analyzer.html"

# Function to strip import/export from JS files
strip_modules() {
  sed -E '/^import /d; /^export (async )?(class|function|const|let|var|default)/s/^export //; /^export \{/d' "$1"
}

# All bundled JS, in dependency order. Defined once so the collision guard below
# and the concatenation loop stay in sync.
JS_FILES="
  js/football-rules.js js/video-controller.js js/canvas-overlay.js js/play-tagger.js
  js/roster-manager.js js/play-filter.js js/notes-manager.js js/storage-backend.js
  js/season-store.js js/demo-season.js js/storage.js js/play-detector.js
  js/clip-analyzer.js js/backend-client.js js/vision-analyzer.js js/playlist-manager.js
  js/quick-chart.js js/heat-maps.js js/advanced-metrics.js js/visualizations.js
  js/charts.js js/multi-angle.js js/stats-engine.js js/analytics-registry.js js/workspace-context.js js/history-manager.js
  js/version-manager.js js/scoreboard-ocr.js js/suggestion-engine.js js/cutup-exporter.js
  js/cutup-player.js js/play-grid.js js/season-manager.js js/season-library.js
  js/call-sheet-builder.js js/ui-polish.js js/wizard.js js/custom-fields.js
  js/custom-chips.js js/play-diagram.js js/updater.js js/app.js
"

# Collision guard: every module shares ONE scope in the concatenated bundle, so a
# top-level const/let/var/class/function declared in two files silently clobbers
# the other (a runtime-error class CLAUDE.md explicitly warns about). Fail the
# build if any top-level name is declared in more than one module.
collisions=$(for f in $JS_FILES; do
  grep -hoE '^(export )?(class|function|const|let|var) [A-Za-z_$][A-Za-z0-9_$]*' "$f" \
    | sed -E 's/^(export )?(class|function|const|let|var) //'
done | sort | uniq -d)
if [ -n "$collisions" ]; then
  echo "BUILD FAILED — top-level name(s) collide across modules (shared bundle scope):" >&2
  echo "$collisions" | sed 's/^/  - /' >&2
  exit 1
fi

cat > "$OUTPUT" << 'HTMLHEAD'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0B0F14">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDI0IDEwMjQiPgogIDxkZWZzPgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJiZyIgeDE9IjAiIHkxPSIwIiB4Mj0iMCIgeTI9IjEiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMxNDFEMkIiLz48c3RvcCBvZmZzZXQ9IjAuNTUiIHN0b3AtY29sb3I9IiMwRDEzMUMiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMwOTBEMTIiLz4KICAgIDwvbGluZWFyR3JhZGllbnQ+CiAgICA8cmFkaWFsR3JhZGllbnQgaWQ9InNoZWVuIiBjeD0iMC41IiBjeT0iMCIgcj0iMC45Ij4KICAgICAgPHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjRkZGIiBzdG9wLW9wYWNpdHk9IjAuMDYiLz48c3RvcCBvZmZzZXQ9IjAuNiIgc3RvcC1jb2xvcj0iI0ZGRiIgc3RvcC1vcGFjaXR5PSIwIi8+CiAgICA8L3JhZGlhbEdyYWRpZW50PgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJ1cCIgeDE9IjAiIHkxPSIxIiB4Mj0iMCIgeTI9IjAiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMyRjZCRjAiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiM1QjkwRkYiLz4KICAgIDwvbGluZWFyR3JhZGllbnQ+CiAgICA8ZmlsdGVyIGlkPSJnbG93IiB4PSItNDAlIiB5PSItNDAlIiB3aWR0aD0iMTgwJSIgaGVpZ2h0PSIxODAlIj48ZmVHYXVzc2lhbkJsdXIgc3RkRGV2aWF0aW9uPSIyNCIvPjwvZmlsdGVyPgogICAgPGNsaXBQYXRoIGlkPSJ0aWxlIj48cmVjdCB3aWR0aD0iMTAyNCIgaGVpZ2h0PSIxMDI0IiByeD0iMjI4Ii8+PC9jbGlwUGF0aD4KICA8L2RlZnM+CiAgPGcgY2xpcC1wYXRoPSJ1cmwoI3RpbGUpIj4KICAgIDxyZWN0IHdpZHRoPSIxMDI0IiBoZWlnaHQ9IjEwMjQiIGZpbGw9InVybCgjYmcpIi8+CiAgICA8cmVjdCB3aWR0aD0iMTAyNCIgaGVpZ2h0PSI1NjAiIGZpbGw9InVybCgjc2hlZW4pIi8+CiAgICA8ZyBzdHJva2U9IiNFOUVFRjUiIG9wYWNpdHk9IjAuMDkiIHN0cm9rZS13aWR0aD0iNiI+CiAgICAgIDxsaW5lIHgxPSIwIiB5MT0iMzYwIiB4Mj0iMTAyNCIgeTI9IjM2MCIvPjxsaW5lIHgxPSIwIiB5MT0iNTYwIiB4Mj0iMTAyNCIgeTI9IjU2MCIvPjxsaW5lIHgxPSIwIiB5MT0iNzYwIiB4Mj0iMTAyNCIgeTI9Ijc2MCIvPgogICAgPC9nPgogICAgPGcgZmlsdGVyPSJ1cmwoI2dsb3cpIiBvcGFjaXR5PSIwLjQiPgogICAgICA8cGF0aCBkPSJNIDI5MiAyMDggTCAyOTIgNDcwIEwgNzMyIDQ3MCBMIDczMiAyMDggTSA1MTIgNDcwIEwgNTEyIDgwMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjM0Q3QkZEIiBzdHJva2Utd2lkdGg9IjExMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8L2c+CiAgICA8cGF0aCBkPSJNIDI5MiAyMTQgTCAyOTIgNDcwIEwgNzMyIDQ3MCBMIDczMiAyMTQiIGZpbGw9Im5vbmUiIHN0cm9rZT0idXJsKCN1cCkiIHN0cm9rZS13aWR0aD0iODYiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgogICAgPHBhdGggZD0iTSA1MTIgNDcwIEwgNTEyIDc5NiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ1cmwoI3VwKSIgc3Ryb2tlLXdpZHRoPSI4NiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CiAgICA8ZWxsaXBzZSBjeD0iNTEyIiBjeT0iODU2IiByeD0iMTUwIiByeT0iMzQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0U5RUVGNSIgc3Ryb2tlLXdpZHRoPSIzMCIgb3BhY2l0eT0iMC45Ii8+CiAgPC9nPgo8L3N2Zz4K">
  <meta name="description" content="Football film analysis for coaches — tag plays, track stats, scout opponents.">
  <title>GridIron IQ</title>
  <style>
HTMLHEAD

# Inline CSS — fonts.css first (base64 @font-face for the bundled display face,
# so the offline single-file build needs zero font network calls), then styles.
cat css/fonts.css >> "$OUTPUT"
cat css/styles.css >> "$OUTPUT"
# Stats-dashboard redesign overrides — last so it wins the cascade.
cat css/redesign-stats.css >> "$OUTPUT"

cat >> "$OUTPUT" << 'STYLEEND'
  </style>
</head>
<body>
STYLEEND

# Inline SVG sprite (must be in body for <use href="#id"> to work)
cat assets/icons.svg >> "$OUTPUT"

echo "" >> "$OUTPUT"

# Extract the FULL body content from index.html:
# Everything between <body> and </body>, excluding those tags and the <script> tag
sed -n '/<body>/,/<\/body>/{ /<body>/d; /<\/body>/d; /<script.*app\.js/d; p; }' index.html | \
  sed 's|assets/icons.svg#|#|g' >> "$OUTPUT"

# Start inline script
cat >> "$OUTPUT" << 'SCRIPTSTART'

  <script>
SCRIPTSTART

# Inline all JS in dependency order (JS_FILES defined above), stripping module syntax
for jsfile in $JS_FILES
do
  echo "" >> "$OUTPUT"
  echo "// ===== $(basename $jsfile) =====" >> "$OUTPUT"
  strip_modules "$jsfile" >> "$OUTPUT"
done

# Fix any remaining SVG href references in JS
sed -i "s|assets/icons.svg#|#|g" "$OUTPUT"

cat >> "$OUTPUT" << 'HTMLEND'
  </script>
</body>
</html>
HTMLEND

echo "Built: $OUTPUT ($(wc -l < "$OUTPUT") lines, $(du -h "$OUTPUT" | cut -f1))"
