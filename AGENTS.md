# Agent instructions — keep jobs cheap and fast

This repo exists so agents build occlusion decks **without** loading the Milc app monorepo.

## Hard rules

1. **Do not open image files in chat** unless `deck missing` reports a gap or OCR confidence is bad. Prefer CLIs that print JSON.
2. **Batch everything.** One `deck search` / `deck ocr` / `deck pack` call beats per-term exploration.
3. **No subagent swarms.** One agent, sequential tools.
4. **Stop early.** If pack succeeds and missing list is empty, done. Do not polish indefinitely.
5. **Spend mindset.** Target under ~$1 and under ~60s for plate decks; under ~$5 for large term lists when tools work.

## Preferred model

- Default: **Composer 2.5** (standard, not Fast) for cost
- Speed test: Grok Fast is fine for short runs
- Never escalate to Opus/Sonnet unless the user asks

## Workflow

```
deck job init <id>
→ fill work/<id>/brief.json (topic + required terms)
→ deck catalog <topic>  OR  deck search "OpenStax <topic>"
→ download plates into work/<id>/plates/ (curl)
→ deck ocr work/<id>/plates/*.jpg  > work/<id>/ocr.json
→ merge into work/<id>/manifest.json
→ deck missing work/<id>/manifest.json work/<id>/terms.txt
→ fix only misses (re-search / re-ocr those)
→ deck pack work/<id>/manifest.json -o work/<id>/out/deck.apkg
→ write work/<id>/report.json and stop
```

## Occlusion rules (from Milc)

- Image Occlusion Enhanced note type
- Leave Header / Footer / Remarks / Sources **empty** on cards
- Do not paint white over unused labels; leave them visible
- Do not add extra mask boxes for labels you are not quizzing
- Same structure on multiple views is OK (not a duplicate bug)
- Long edge 1600px when resizing

## Files to read (only if needed)

| Need | File |
|---|---|
| Recipe | `docs/RECIPE.md` |
| Manifest shape | `docs/manifest.schema.json` |
| Catalog | `catalog/plates.json` |
| Packer | `src/pack.ts` |

Do **not** dump entire `src/` into context. Call CLIs.
