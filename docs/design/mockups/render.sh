#!/usr/bin/env bash
# Render every mockup HTML in this folder to a PNG (1536 px wide) with headless Chromium.
set -euo pipefail
cd "$(dirname "$0")"
CHROME="${CHROME:-$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome | tail -1)}"
for f in *.html; do
  h=$(grep -o 'data-height="[0-9]*"' "$f" | grep -o '[0-9]*' || echo 1024)
  "$CHROME" --headless=new --no-sandbox --hide-scrollbars --allow-file-access-from-files \
    --window-size=1536,"${h:-1024}" --screenshot="$PWD/${f%.html}.png" "file://$PWD/$f" 2>/dev/null
done
