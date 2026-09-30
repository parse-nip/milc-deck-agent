# Deck build recipe

## What a deck is

Legacy `.apkg` (`collection.anki2` + JSON `media` map). Cards use Image Occlusion Enhanced: one image + one box per quizzable label → notes and SVG masks.

## Pipeline

1. **Source** CC-licensed labeled plates (prefer OpenStax on Wikimedia Commons; see `catalog/plates.json`).
2. **Boxes** via Tesseract (`tesseract image.jpg out --psm 11 tsv`) or an external propose API. Union multi-line labels. Drop captions/junk.
3. **Resize** long edge to 1600px; scale boxes by the same factor.
4. **Manifest** — see `docs/manifest.schema.json`.
5. **Pack** — `npx tsx bin/deck.ts pack work/<id>/manifest.json -o work/<id>/out/deck.apkg`.
6. **Check** — `deck missing` against required terms; Header/Remarks/Sources empty.

## Attribution

Store license + source URL on the **deck** `desc` / in `report.json`. Keep card Sources empty (renders on the card face).
