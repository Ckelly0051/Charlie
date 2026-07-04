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
  js/play-diagram.js js/updater.js js/app.js
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
  <meta name="theme-color" content="#1D4ED8">
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
