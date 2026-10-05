#!/bin/sh
# HTML -> PDF (Chrome) -> page pictures (pdftoppm) -> PPTX (one picture per slide). Needs python-pptx and Pillow (venv /tmp/pptenv).
set -e
cd "$(dirname "$0")"
PY=${PY:-/tmp/pptenv/bin/python}
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
$PY build_deck.py
"$CHROME" --headless --disable-gpu --no-pdf-header-footer --virtual-time-budget=15000 \
  --print-to-pdf="$PWD/SAC_Fiori_System_Design.pdf" "file://$PWD/SAC_Fiori_System_Design.html" >/dev/null 2>&1
rm -rf /tmp/deckpages && mkdir -p /tmp/deckpages
pdftoppm -r 96 -png SAC_Fiori_System_Design.pdf /tmp/deckpages/p
$PY build_deck.py --pptx
pdfinfo SAC_Fiori_System_Design.pdf | grep Pages
