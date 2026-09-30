# Agent instructions — accurate full decks, cheap tooling

This repo builds **complete** image-occlusion Anki decks. Speed/cost come from **batch CLIs**, not from shipping tiny toy decks.

## Priority order

1. **Label accuracy** — every box label must be the real printed anatomy name (canonical form from `terms.txt`). Wrong OCR text is a failure.
2. **Coverage** — required terms present wherever the plate actually labels them (same structure on multiple views is OK).
3. **Cost** — batch tools; no repo tourism; no subagent swarms.

## Hard rules

1. Build the **full** deck the brief asks for (all catalog plates for the topic unless the user caps it). Do not substitute a 2-plate smoke deck.
2. **Batch CLIs first** (`download`, `ocr`, `align`, `missing`, `pack`). Prefer JSON over opening binaries in chat.
3. **Vision is allowed and expected for label QA.** When OCR is wrong or a required term is missing on a plate that clearly shows it, open that plate (or a thumb) and fix the box/label. Do not invent structures that are not printed.
4. Leave Header / Footer / Remarks / Sources **empty** on cards. Put attribution on the deck `desc` / `report.json`.
5. Do not white-paint unused labels. Do not add mask boxes for labels you are not quizzing.
6. Resize long edge to **1600px** before packing (`deck resize`).
7. **No swarms.** One agent. Stop when `deck missing` is empty (or only terms absent from all plates) and `.apkg` exists.
8. Preferred models: Composer 2.5 standard (cost) or Grok Fast (speed). No Opus unless asked.

## Workflow

```
npm install   # once
# tesseract must be on PATH for OCR

npx tsx bin/deck.ts job init <id> --from examples/skull
npx tsx bin/deck.ts download skull -o work/<id>/plates
npx tsx bin/deck.ts resize work/<id>/plates/*.jpg
npx tsx bin/deck.ts ocr work/<id>/plates/*.jpg -o work/<id>/ocr.json
npx tsx bin/deck.ts align work/<id>/ocr.json work/<id>/terms.txt \
  --plates work/<id>/plates -o work/<id>/manifest.json
npx tsx bin/deck.ts missing work/<id>/manifest.json work/<id>/terms.txt
# vision-fix misses / bad labels on the specific plates only
npx tsx bin/deck.ts pack work/<id>/manifest.json -o work/<id>/out/deck.apkg
# write work/<id>/report.json → stop
```

## Files to read (only if needed)

| Need | File |
|---|---|
| Recipe | `docs/RECIPE.md` |
| Manifest | `docs/manifest.schema.json` |
| Skull terms | `examples/skull/terms.txt` |
| Catalog | `catalog/plates.json` |

Do **not** dump all of `src/` into context.
