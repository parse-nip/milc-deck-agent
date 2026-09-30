# Deck build progress (app checklist)

Fixed steps for the Milc UI. Cloud Agents do **not** invent todos — the app owns the list.

## Steps

1. Find plates  
2. Download / resize  
3. OCR  
4. Align labels  
5. Lint / vision fix  
6. Pack deck  

## Judgment vs mechanical

| Step | How it completes |
|---|---|
| **Find** | Agent: `deck step find done` (search/catalog only *start* Find) |
| **Download / resize** | Auto from `deck download` / `deck resize` |
| **OCR / Align** | Auto from those CLIs |
| **Lint / vision fix** | Agent: `deck step qa done` after vision+lint clean (`lint`/`missing`/manifest edits only *start* QA) |
| **Pack** | Auto from `deck pack` |

## Stream → ticks

1. Create agent + run (Cloud Agents API).  
2. Open SSE: `GET /v1/agents/{id}/runs/{runId}/stream`  
3. On each `tool_call` event, call `applyToolCallEvent` / `applyStreamPayload` from `src/progress.ts` (mirror in anki-web).  
4. Push the resulting `DeckBuildProgress` JSON to the client.

## Agent signals

```bash
npx tsx bin/deck.ts step find done --job work/<id>
npx tsx bin/deck.ts step qa done --job work/<id>
# optional
npx tsx bin/deck.ts step <id> start|fail --job work/<id>
```

With `--job`, writes `work/<id>/progress.json` and applies light evidence gates (e.g. pack done requires `out/deck.apkg`).

## Debug CLI

```bash
npx tsx bin/deck.ts progress --schema
npx tsx bin/deck.ts progress --apply path/to/tool_call.json
```

## Sync

Keep `milc-deck-agent/src/progress.ts` and `anki-web/src/lib/ai/deck-build-progress.ts` identical in match/apply behavior.
