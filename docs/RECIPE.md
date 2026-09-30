# Deck build recipe

## Goal

Complete occlusion decks with **accurate labels** (printed names on the plate, canonicalized to `terms.txt`).

## Pipeline

1. **Source** CC plates — prefer `catalog/plates.json` (OpenStax on Commons).
2. **Download + resize** — `deck download` then `deck resize` (long edge 1600).
3. **OCR** — `deck ocr` (Tesseract). Batch only.
4. **Align** — `deck align` maps OCR strings → required terms; drops captions/junk.
5. **Vision QA** — for `deck missing` gaps or obvious misreads, inspect that plate and fix boxes/labels in `manifest.json`. Never invent unprinted structures.
6. **Pack** — `deck pack` → `.apkg`. Header/Remarks/Sources empty on cards.
7. **Report** — notes, missing list, plate sources/licenses.

Same structure on multiple views is intentional.
