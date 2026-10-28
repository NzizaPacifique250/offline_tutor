#!/bin/bash
# Renders the technical report to PDF with headless Chrome and prints its
# page count (the assignment allows five pages).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
chrome="$(command -v google-chrome || command -v chromium || command -v chromium-browser)"
"$chrome" --headless=new --disable-gpu --no-pdf-header-footer --run-all-compositor-stages-before-draw \
  --print-to-pdf="$here/Technical_Report.pdf" "file://$here/technical-report.html" 2>/dev/null
pdfinfo "$here/Technical_Report.pdf" | grep -E '^Pages'
