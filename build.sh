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
  js/charts.js js/multi-angle.js js/stats-engine.js js/history-manager.js
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
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDI0IDEwMjQiPgogIDxkZWZzPgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJiZyIgeDE9IjAiIHkxPSIwIiB4Mj0iMCIgeTI9IjEiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMxNDFEMkIiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIwLjU1IiBzdG9wLWNvbG9yPSIjMEQxMzFDIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzA5MEQxMiIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICAgIDxyYWRpYWxHcmFkaWVudCBpZD0ic2hlZW4iIGN4PSIwLjUiIGN5PSIwIiByPSIwLjkiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiNGRkZGRkYiIHN0b3Atb3BhY2l0eT0iMC4wNiIvPgogICAgICA8c3RvcCBvZmZzZXQ9IjAuNiIgc3RvcC1jb2xvcj0iI0ZGRkZGRiIgc3RvcC1vcGFjaXR5PSIwIi8+CiAgICA8L3JhZGlhbEdyYWRpZW50PgogICAgPGxpbmVhckdyYWRpZW50IGlkPSJydCIgeDE9IjAiIHkxPSIxIiB4Mj0iMSIgeTI9IjAiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMyRjZCRjAiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjNUI5MEZGIi8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGZpbHRlciBpZD0iZ2xvdyIgeD0iLTQwJSIgeT0iLTQwJSIgd2lkdGg9IjE4MCUiIGhlaWdodD0iMTgwJSI+CiAgICAgIDxmZUdhdXNzaWFuQmx1ciBzdGREZXZpYXRpb249IjIyIi8+CiAgICA8L2ZpbHRlcj4KICAgIDxjbGlwUGF0aCBpZD0idGlsZSI+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjEwMjQiIGhlaWdodD0iMTAyNCIgcng9IjIyOCIvPjwvY2xpcFBhdGg+CiAgPC9kZWZzPgoKICA8ZyBjbGlwLXBhdGg9InVybCgjdGlsZSkiPgogICAgPHJlY3Qgd2lkdGg9IjEwMjQiIGhlaWdodD0iMTAyNCIgZmlsbD0idXJsKCNiZykiLz4KICAgIDxyZWN0IHdpZHRoPSIxMDI0IiBoZWlnaHQ9IjU2MCIgZmlsbD0idXJsKCNzaGVlbikiLz4KICAgIDwhLS0gY2hhbGsgeWFyZCBsaW5lcyArIGhhc2hlcyAtLT4KICAgIDxnIHN0cm9rZT0iI0U5RUVGNSIgb3BhY2l0eT0iMC4xMCIgc3Ryb2tlLXdpZHRoPSI2Ij4KICAgICAgPGxpbmUgeDE9IjAiIHkxPSIzMDYiIHgyPSIxMDI0IiB5Mj0iMzA2Ii8+CiAgICAgIDxsaW5lIHgxPSIwIiB5MT0iNTEyIiB4Mj0iMTAyNCIgeTI9IjUxMiIvPgogICAgICA8bGluZSB4MT0iMCIgeTE9IjcxOCIgeDI9IjEwMjQiIHkyPSI3MTgiLz4KICAgIDwvZz4KICAgIDxnIHN0cm9rZT0iI0U5RUVGNSIgb3BhY2l0eT0iMC4wNyIgc3Ryb2tlLXdpZHRoPSI2Ij4KICAgICAgPGxpbmUgeDE9IjIzNiIgeTE9IjM4NCIgeDI9IjIzNiIgeTI9IjQ0MCIvPjxsaW5lIHgxPSIyMzYiIHkxPSI1OTAiIHgyPSIyMzYiIHkyPSI2NDYiLz4KICAgICAgPGxpbmUgeDE9Ijc4OCIgeTE9IjM4NCIgeDI9Ijc4OCIgeTI9IjQ0MCIvPjxsaW5lIHgxPSI3ODgiIHkxPSI1OTAiIHgyPSI3ODgiIHkyPSI2NDYiLz4KICAgIDwvZz4KCiAgICA8IS0tIHJvdXRlIGx1bWluYW5jZSAodGlnaHQpIC0tPgogICAgPGcgZmlsdGVyPSJ1cmwoI2dsb3cpIiBvcGFjaXR5PSIwLjM4Ij4KICAgICAgPHBhdGggZD0iTSAzNDggNzU4IEwgMzQ4IDQ2OCBMIDcwMCAyOTYiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzNEN0JGRCIgc3Ryb2tlLXdpZHRoPSIxMTgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgogICAgPC9nPgoKICAgIDwhLS0gdGhlIHJvdXRlOiBzaGFmdCBydW5zIElOVE8gdGhlIGhlYWQgYmFzZSAobm8gc2VhbSkgLS0+CiAgICA8cGF0aCBkPSJNIDM0OCA3NTggTCAzNDggNDY4IEwgNzEyIDI5MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ1cmwoI3J0KSIgc3Ryb2tlLXdpZHRoPSI5MiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+CiAgICA8cG9seWdvbiBwb2ludHM9IjgyNCAyMzYgNjY0IDI3MCA3MzQgNDEzIiBmaWxsPSIjNUI5MEZGIi8+CgogICAgPCEtLSB0aGUgTyAodGhlIHBsYXllcikgLS0+CiAgICA8Y2lyY2xlIGN4PSIzNDgiIGN5PSI3NjIiIHI9IjEwMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRTlFRUY1IiBzdHJva2Utd2lkdGg9IjQ2Ii8+CiAgPC9nPgo8L3N2Zz4K">
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
