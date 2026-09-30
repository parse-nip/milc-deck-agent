# milc-deck-agent

Slim repo for **full** image-occlusion Anki decks via Cursor agents — batch tools for cost, vision for **accurate labels**.

Not the Milc app. No Next.js.

1. Find CC plates (catalog + Commons)
2. OCR → align to required terms → vision-fix misses
3. Pack `manifest.json` → `.apkg`

## Agent rules

Read **`AGENTS.md`**. Accuracy first; tiny smoke decks are not the goal.

## Quick start

```bash
npm install
# needs: tesseract + ImageMagick on PATH (Linux cloud: apt-get install -y tesseract-ocr imagemagick)
npx tsx bin/deck.ts help
```

## Example: full skull deck

```bash
npx tsx bin/deck.ts job init skull1 --from examples/skull
npx tsx bin/deck.ts download skull -o work/skull1/plates
npx tsx bin/deck.ts resize work/skull1/plates/*.jpg
npx tsx bin/deck.ts ocr work/skull1/plates/*.jpg -o work/skull1/ocr.json
npx tsx bin/deck.ts align work/skull1/ocr.json work/skull1/terms.txt \
  --plates work/skull1/plates --name "Axial Skeleton (Skull)" \
  -o work/skull1/manifest.json
npx tsx bin/deck.ts missing work/skull1/manifest.json work/skull1/terms.txt
npx tsx bin/deck.ts pack work/skull1/manifest.json -o work/skull1/out/deck.apkg
```

## CLIs

| Command | Purpose |
|---|---|
| `job init --from examples/skull` | Seed brief + terms |
| `catalog` / `search` | Find plates |
| `download <topic>` | Fetch all catalog plates |
| `resize` | Long edge 1600px |
| `ocr` | Tesseract boxes (batch) |
| `align` | Map OCR → canonical terms |
| `missing` | Coverage report |
| `pack` | Write `.apkg` |
