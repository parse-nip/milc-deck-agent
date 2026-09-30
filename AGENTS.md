# Agent instructions — accurate full decks, cheap tooling

This repo builds **complete** image-occlusion Anki decks. Speed/cost come from **batch CLIs**, not from shipping tiny toy decks.

## Priority order

1. **Label accuracy** — every box label must be the real printed anatomy name (canonical form from `terms.txt`). Wrong OCR text is a failure.
2. **Coverage** — required terms present wherever the plate actually labels them (same structure on multiple views is OK).
3. **Cost** — batch tools; no repo tourism; no subagent swarms.

## Hard rules

1. Build the **full** deck the brief asks for (all catalog plates for the topic unless the user caps it). Do not substitute a 2-plate smoke deck.
2. **Batch CLIs first** (`download`, `ocr`, `align`, `missing`, `lint`, `pack`). Prefer JSON over opening binaries in chat.
3. **Vision is allowed and expected for label QA.** When OCR is wrong, a required term is missing, or `deck lint` reports `too_wide` / `too_tall`, open that plate and fix the box. Do not invent unprinted structures.
4. **Never pack a lint-failing manifest.** Run `deck lint` after align and after vision edits. Full-width bars are bugs (OCR merged left+right labels), not intentional blanks.
5. Leave Header / Footer / Remarks / Sources **empty** on cards. Put attribution on the deck `desc` / `report.json`.
6. Do not white-paint unused labels. Do not add mask boxes for labels you are not quizzing. Small unmasked printed labels are intentional.
7. Resize long edge to **1600px** before packing (`deck resize`). ImageMagick is available on Linux; do not rewrite download.ts unless broken.
8. **No swarms.** One agent. Prefer fixing boxes in `manifest.json` over editing TypeScript.
9. Preferred models: Composer 2.5 standard (cost) or Grok 4.7 standard (harder vision QA). No Opus unless asked.

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
npx tsx bin/deck.ts lint work/<id>/manifest.json
# if lint fails: vision-fix those plates, or `deck lint --fix` then re-box dropped labels
npx tsx bin/deck.ts missing work/<id>/manifest.json work/<id>/terms.txt
npx tsx bin/deck.ts pack work/<id>/manifest.json -o work/<id>/out/deck.apkg
# write work/<id>/report.json → stop
```

## Cost tips (fewer cache reads)

- Call CLIs; do not cat large images/JSON into chat.
- Prefer short tool outputs. Do not re-read the whole repo between steps.
- Do not edit `src/` unless a CLI is broken on this VM.

## Files to read (only if needed)

| Need | File |
|---|---|
| Recipe | `docs/RECIPE.md` |
| Manifest | `docs/manifest.schema.json` |
| Skull terms | `examples/skull/terms.txt` |
| Catalog | `catalog/plates.json` |

Do **not** dump all of `src/` into context.
