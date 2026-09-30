# Deck build progress (app checklist)

Fixed steps for the Milc UI. Cloud Agents do **not** invent todos — the app owns the list.

## Steps

1. Find plates  
2. Download / resize  
3. OCR  
4. Align labels  
5. Lint / vision fix  
6. Pack deck  

## Stream → ticks

1. Create agent + run (Cloud Agents API).  
2. Open SSE: `GET /v1/agents/{id}/runs/{runId}/stream`  
3. On each `tool_call` event, call `applyToolCallEvent` / `applyStreamPayload` from `src/progress.ts`.  
4. Push the resulting `DeckBuildProgress` JSON to the client.

Match rules look for `deck search|catalog|download|resize|ocr|align|lint|missing|pack` (and `npx tsx bin/deck.ts …`).

## CLI

```bash
npx tsx bin/deck.ts progress --schema
npx tsx bin/deck.ts progress --apply path/to/tool_call.json
```

## Agent prompt tip

Tell the agent to run CLIs as `npx tsx bin/deck.ts <cmd> …` so the matcher always fires.
App checklist: see `docs/PROGRESS.md` and `src/progress.ts`.
