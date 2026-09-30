/**
 * App-owned deck-build checklist.
 * Cloud Agents stream tool_call events; the app maps them onto these fixed steps.
 * Do not invent ad-hoc todos — keep this list stable for the product UI.
 */

export const DECK_BUILD_STEPS = [
  { id: "find", label: "Find plates", order: 1 },
  { id: "fetch", label: "Download / resize", order: 2 },
  { id: "ocr", label: "OCR", order: 3 },
  { id: "align", label: "Align labels", order: 4 },
  { id: "qa", label: "Lint / vision fix", order: 5 },
  { id: "pack", label: "Pack deck", order: 6 },
] as const;

export type DeckBuildStepId = (typeof DECK_BUILD_STEPS)[number]["id"];

export type StepStatus = "pending" | "active" | "done" | "error";

export type DeckBuildStepState = {
  id: DeckBuildStepId;
  label: string;
  order: number;
  status: StepStatus;
};

export type DeckBuildProgress = {
  version: 1;
  steps: DeckBuildStepState[];
  /** Highest step that has started (active or done). */
  current: DeckBuildStepId | null;
  /** ISO timestamp of last mutation. */
  updatedAt: string;
  /** Optional last matched tool name / hint for debugging. */
  lastHint?: string;
};

export type StreamToolCallEvent = {
  name?: string;
  status?: string;
  args?: unknown;
  result?: unknown;
};

const STEP_INDEX: Record<DeckBuildStepId, number> = {
  find: 0,
  fetch: 1,
  ocr: 2,
  align: 3,
  qa: 4,
  pack: 5,
};

/** Flatten tool args into one searchable string (Cursor shell + generic shapes). */
export function toolCallHaystack(event: StreamToolCallEvent): string {
  const parts: string[] = [];
  if (event.name) parts.push(String(event.name));
  const args = event.args;
  if (typeof args === "string") parts.push(args);
  else if (args && typeof args === "object") {
    const o = args as Record<string, unknown>;
    for (const key of ["command", "cmd", "script", "path", "file_path", "target_file", "query", "prompt"]) {
      if (o[key] != null) parts.push(String(o[key]));
    }
    // Nested common shapes
    if (typeof o.input === "string") parts.push(o.input);
    if (o.input && typeof o.input === "object") {
      const input = o.input as Record<string, unknown>;
      for (const key of ["command", "cmd", "path", "file_path"]) {
        if (input[key] != null) parts.push(String(input[key]));
      }
    }
    try {
      parts.push(JSON.stringify(args));
    } catch {
      /* ignore */
    }
  }
  return parts.join("\n").toLowerCase();
}

/**
 * Map a tool_call payload to a checklist step, or null if unrelated.
 * Prefer matching `npx tsx bin/deck.ts …` / `deck <cmd>` from milc-deck-agent.
 */
export function matchToolCallToStep(event: StreamToolCallEvent): DeckBuildStepId | null {
  const hay = toolCallHaystack(event);
  if (!hay.trim()) return null;

  // Pack first (most specific CLI names)
  if (/\bdeck\.ts\s+pack\b/.test(hay) || /\bdeck\s+pack\b/.test(hay) || /out\/deck\.apkg/.test(hay)) {
    return "pack";
  }
  if (
    /\bdeck\.ts\s+lint\b/.test(hay) ||
    /\bdeck\s+lint\b/.test(hay) ||
    /\bdeck\.ts\s+missing\b/.test(hay) ||
    /\bdeck\s+missing\b/.test(hay) ||
    /manifest\.json/.test(hay) && (/\bedit\b/.test(hay) || /\bwrite\b/.test(hay) || /strreplace/.test(hay) || /search_replace/.test(hay))
  ) {
    return "qa";
  }
  if (/\bdeck\.ts\s+align\b/.test(hay) || /\bdeck\s+align\b/.test(hay)) return "align";
  if (/\bdeck\.ts\s+ocr\b/.test(hay) || /\bdeck\s+ocr\b/.test(hay)) return "ocr";
  if (
    /\bdeck\.ts\s+resize\b/.test(hay) ||
    /\bdeck\s+resize\b/.test(hay) ||
    /\bdeck\.ts\s+download\b/.test(hay) ||
    /\bdeck\s+download\b/.test(hay)
  ) {
    return "fetch";
  }
  if (
    /\bdeck\.ts\s+search\b/.test(hay) ||
    /\bdeck\s+search\b/.test(hay) ||
    /\bdeck\.ts\s+catalog\b/.test(hay) ||
    /\bdeck\s+catalog\b/.test(hay) ||
    /\bdeck\.ts\s+job\s+init\b/.test(hay) ||
    /\bdeck\s+job\s+init\b/.test(hay)
  ) {
    return "find";
  }

  // Soft signals (writes / edits)
  if (/report\.json/.test(hay) && (/\bwrite\b/.test(hay) || /deck\.apkg/.test(hay))) return "pack";
  if (/work\/[^/\s]+\/manifest\.json/.test(hay)) return "qa";
  if (/work\/[^/\s]+\/ocr\.json/.test(hay)) return "ocr";
  if (/work\/[^/\s]+\/plates\//.test(hay) && (/\bcurl\b/.test(hay) || /\bwget\b/.test(hay) || /\bdownload\b/.test(hay))) {
    return "fetch";
  }

  return null;
}

export function createDeckBuildProgress(now = new Date()): DeckBuildProgress {
  return {
    version: 1,
    steps: DECK_BUILD_STEPS.map((s) => ({
      id: s.id,
      label: s.label,
      order: s.order,
      status: "pending" as const,
    })),
    current: null,
    updatedAt: now.toISOString(),
  };
}

function cloneProgress(p: DeckBuildProgress): DeckBuildProgress {
  return {
    ...p,
    steps: p.steps.map((s) => ({ ...s })),
  };
}

/** Mark step active; complete all earlier steps. */
export function startStep(progress: DeckBuildProgress, id: DeckBuildStepId, now = new Date()): DeckBuildProgress {
  const next = cloneProgress(progress);
  const idx = STEP_INDEX[id];
  for (let i = 0; i < next.steps.length; i++) {
    const step = next.steps[i]!;
    if (i < idx && step.status !== "done") step.status = "done";
    if (i === idx) {
      if (step.status !== "done") step.status = "active";
    }
  }
  next.current = id;
  next.updatedAt = now.toISOString();
  return next;
}

/** Mark step done; complete all earlier. Optionally activate the next pending step. */
export function completeStep(
  progress: DeckBuildProgress,
  id: DeckBuildStepId,
  opts: { activateNext?: boolean; now?: Date } = {}
): DeckBuildProgress {
  const now = opts.now ?? new Date();
  const next = cloneProgress(progress);
  const idx = STEP_INDEX[id];
  for (let i = 0; i <= idx; i++) {
    next.steps[i]!.status = "done";
  }
  next.current = id;
  next.updatedAt = now.toISOString();
  if (opts.activateNext) {
    const following = next.steps[idx + 1];
    if (following && following.status === "pending") {
      following.status = "active";
      next.current = following.id;
    }
  }
  return next;
}

export function failStep(progress: DeckBuildProgress, id: DeckBuildStepId, now = new Date()): DeckBuildProgress {
  const next = cloneProgress(progress);
  const step = next.steps[STEP_INDEX[id]];
  if (step) step.status = "error";
  next.current = id;
  next.updatedAt = now.toISOString();
  return next;
}

/**
 * Apply one Cloud Agents SSE `tool_call` (or SDK tool_call message).
 * - status running / in_progress → startStep
 * - status completed / success → completeStep (activate next)
 * - status error / failed → failStep
 */
export function applyToolCallEvent(
  progress: DeckBuildProgress,
  event: StreamToolCallEvent,
  now = new Date()
): DeckBuildProgress {
  const stepId = matchToolCallToStep(event);
  if (!stepId) return progress;

  const status = String(event.status ?? "").toLowerCase();
  let next: DeckBuildProgress;
  if (status === "error" || status === "failed") {
    next = failStep(progress, stepId, now);
  } else if (
    status === "completed" ||
    status === "complete" ||
    status === "success" ||
    status === "succeeded"
  ) {
    next = completeStep(progress, stepId, { activateNext: true, now });
  } else {
    // running / in_progress / started / empty
    next = startStep(progress, stepId, now);
  }
  next.lastHint = [event.name, status].filter(Boolean).join(":");
  return next;
}

/** Parse one SSE data payload (JSON object with type/tool fields). Returns updated progress. */
export function applyStreamPayload(progress: DeckBuildProgress, payload: unknown, now = new Date()): DeckBuildProgress {
  if (!payload || typeof payload !== "object") return progress;
  const p = payload as Record<string, unknown>;
  const type = String(p.type ?? p.event ?? "");
  if (type && type !== "tool_call" && type !== "tool-call") {
    // interaction_update with tool-call-started/completed
    const subtype = String(p.subtype ?? p.kind ?? "");
    if (subtype.includes("tool-call") || p.callId || p.call_id) {
      return applyToolCallEvent(
        progress,
        {
          name: String(p.name ?? p.toolName ?? p.tool_name ?? ""),
          status: subtype.includes("completed")
            ? "completed"
            : subtype.includes("started") || subtype.includes("running")
              ? "running"
              : String(p.status ?? "running"),
          args: p.args ?? p.arguments ?? p.input,
          result: p.result,
        },
        now
      );
    }
    return progress;
  }
  return applyToolCallEvent(
    progress,
    {
      name: String(p.name ?? p.toolName ?? ""),
      status: String(p.status ?? "running"),
      args: p.args ?? p.arguments,
      result: p.result,
    },
    now
  );
}

export function progressSchema() {
  return {
    version: 1 as const,
    steps: DECK_BUILD_STEPS.map((s) => ({ id: s.id, label: s.label, order: s.order })),
    match: "Cloud Agents SSE tool_call → applyToolCallEvent",
    stream: "GET /v1/agents/{id}/runs/{runId}/stream",
  };
}
