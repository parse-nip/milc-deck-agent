/**
 * Deck-build checklist for Milc UI.
 * Cloud Agents stream tool_call events; the app maps them onto these fixed steps.
 * Keep in sync with anki-web/src/lib/ai/deck-build-progress.ts
 *
 * Judgment vs mechanical:
 * - find / qa: agent calls `deck step <id> done` (search/catalog/lint only *start*)
 * - fetch / ocr / align / pack: real CLIs auto-complete
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
export type AgentStepAction = "start" | "done" | "fail";

export type DeckBuildStepState = {
  id: DeckBuildStepId;
  label: string;
  order: number;
  status: StepStatus;
};

export type DeckBuildProgress = {
  version: 1;
  steps: DeckBuildStepState[];
  current: DeckBuildStepId | null;
  updatedAt: string;
  lastHint?: string;
};

export type StreamToolCallEvent = {
  name?: string;
  status?: string;
  args?: unknown;
  result?: unknown;
};

export type ParsedAgentStep = {
  id: DeckBuildStepId;
  action: AgentStepAction;
};

const STEP_INDEX: Record<DeckBuildStepId, number> = {
  find: 0,
  fetch: 1,
  ocr: 2,
  align: 3,
  qa: 4,
  pack: 5,
};

const STEP_ID_SET = new Set<string>(DECK_BUILD_STEPS.map((s) => s.id));

/** Steps that only the agent should mark done (judgment). Hunt/lint CLIs only start them. */
export const JUDGMENT_STEPS = new Set<DeckBuildStepId>(["find", "qa"]);

/** Command-ish boundary so "echo deck pack later" does not match. */
function cliRe(sub: string): RegExp {
  return new RegExp(
    String.raw`(?:^|[\n;&|])\s*(?:npx\s+tsx\s+)?(?:\.\/)?(?:bin\/)?deck(?:\.ts)?\s+${sub}\b`,
    "m"
  );
}

/** Explicit agent signal — highest priority when present. */
const AGENT_STEP_RE = cliRe(String.raw`step\s+(find|fetch|ocr|align|qa|pack)\s+(start|done|fail)`);

/** Ordered from earliest pipeline step to latest — used when one command runs several CLIs. */
const CLI_PATTERNS: Array<{ id: DeckBuildStepId; re: RegExp }> = [
  { id: "find", re: cliRe(String.raw`(?:job\s+init|search|catalog)`) },
  { id: "fetch", re: cliRe(String.raw`(?:download|resize)`) },
  { id: "ocr", re: cliRe("ocr") },
  { id: "align", re: cliRe("align") },
  { id: "qa", re: cliRe(String.raw`(?:lint|missing)`) },
  { id: "pack", re: cliRe("pack") },
];

/** Shell/command fields only — never stringify full args (file contents can fake CLIs). */
export function toolCallCommandText(event: StreamToolCallEvent): string {
  const name = (event.name ?? "").toLowerCase().replace(/[_\s-]/g, "");
  const shellLike =
    !name ||
    name.includes("shell") ||
    name.includes("terminal") ||
    name.includes("bash") ||
    name === "runterminalcmd";

  const parts: string[] = [];
  const args = event.args;
  if (typeof args === "string") {
    if (shellLike) parts.push(args);
  } else if (args && typeof args === "object") {
    const o = args as Record<string, unknown>;
    for (const key of ["command", "cmd", "script"]) {
      if (o[key] != null) parts.push(String(o[key]));
    }
    if (shellLike) {
      if (typeof o.input === "string") parts.push(o.input);
      if (o.input && typeof o.input === "object") {
        const input = o.input as Record<string, unknown>;
        for (const key of ["command", "cmd", "script"]) {
          if (input[key] != null) parts.push(String(input[key]));
        }
      }
    }
  }
  return parts.join("\n").toLowerCase();
}

function pathsFromPatchBody(text: string): string[] {
  const out: string[] = [];
  const re = /\*\*\*\s+(?:Update|Add|Delete)\s+File:\s+(\S+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1]!);
  return out;
}

/** Path-like fields for write targets (not file contents as CLI text). */
export function toolCallPathText(event: StreamToolCallEvent): string {
  const parts: string[] = [];
  const args = event.args;
  if (args && typeof args === "object") {
    const o = args as Record<string, unknown>;
    for (const key of ["path", "file_path", "target_file", "filePath", "targetFile"]) {
      if (o[key] != null) parts.push(String(o[key]));
    }
    for (const key of ["patch", "diff", "contents", "new_string", "old_string"]) {
      if (typeof o[key] === "string") parts.push(...pathsFromPatchBody(o[key] as string));
    }
    if (typeof o.input === "string") parts.push(...pathsFromPatchBody(o.input));
    if (o.input && typeof o.input === "object") {
      const input = o.input as Record<string, unknown>;
      for (const key of ["path", "file_path", "target_file", "filePath", "targetFile"]) {
        if (input[key] != null) parts.push(String(input[key]));
      }
      if (typeof input.patch === "string") parts.push(...pathsFromPatchBody(input.patch));
    }
  } else if (typeof args === "string" && isWriteLikeTool(event.name)) {
    parts.push(...pathsFromPatchBody(args));
  }
  return parts.join("\n").toLowerCase();
}

/** Combined command+path text for light debugging. */
export function toolCallHaystack(event: StreamToolCallEvent): string {
  return [toolCallCommandText(event), toolCallPathText(event)].filter(Boolean).join("\n");
}

function isWriteLikeTool(name: string | undefined): boolean {
  const n = (name ?? "").toLowerCase().replace(/[_\s-]/g, "");
  return (
    n.includes("write") ||
    n.includes("edit") ||
    n.includes("strreplace") ||
    n.includes("searchreplace") ||
    n.includes("applypatch")
  );
}

function isManifestPath(pathText: string): boolean {
  const paths = pathText
    .split(/\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paths.some((p) => /(?:^|\/)manifest\.json$/.test(p));
}

/** Parse `deck step <id> <start|done|fail>` from a shell command (first match). */
export function parseAgentStepCommand(command: string): ParsedAgentStep | null {
  const m = AGENT_STEP_RE.exec(command.toLowerCase());
  if (!m) return null;
  const id = m[1] as DeckBuildStepId;
  const action = m[2] as AgentStepAction;
  if (!STEP_ID_SET.has(id)) return null;
  return { id, action };
}

export function isDeckBuildStepId(value: string): value is DeckBuildStepId {
  return STEP_ID_SET.has(value);
}

export function isAgentStepAction(value: string): value is AgentStepAction {
  return value === "start" || value === "done" || value === "fail";
}

export function matchToolCallToStep(event: StreamToolCallEvent): DeckBuildStepId | null {
  const ids = matchToolCallToSteps(event);
  return ids.length ? ids[ids.length - 1]! : null;
}

export function matchToolCallToSteps(event: StreamToolCallEvent): DeckBuildStepId[] {
  const cmd = toolCallCommandText(event);
  const explicit = parseAgentStepCommand(cmd);
  if (explicit) return [explicit.id];

  const found: DeckBuildStepId[] = [];
  if (cmd.trim()) {
    for (const { id, re } of CLI_PATTERNS) {
      if (re.test(cmd)) found.push(id);
    }
  }

  if (isWriteLikeTool(event.name) && isManifestPath(toolCallPathText(event)) && !found.includes("qa")) {
    found.push("qa");
  }

  return found.sort((a, b) => STEP_INDEX[a] - STEP_INDEX[b]);
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
  return { ...p, steps: p.steps.map((s) => ({ ...s })) };
}

/** Mark step active. Reopens done/error. Clears other active steps. Does not invent earlier completions. */
export function startStep(progress: DeckBuildProgress, id: DeckBuildStepId, now = new Date()): DeckBuildProgress {
  const next = cloneProgress(progress);
  for (const step of next.steps) {
    if (step.id !== id && step.status === "active") step.status = "pending";
  }
  next.steps[STEP_INDEX[id]]!.status = "active";
  next.current = id;
  next.updatedAt = now.toISOString();
  return next;
}

/** Mark this step done. Earlier pending/active become done; earlier errors are preserved. */
export function completeStep(
  progress: DeckBuildProgress,
  id: DeckBuildStepId,
  opts: { activateNext?: boolean; now?: Date } = {}
): DeckBuildProgress {
  const now = opts.now ?? new Date();
  const next = cloneProgress(progress);
  const idx = STEP_INDEX[id];
  for (let i = 0; i <= idx; i++) {
    const step = next.steps[i]!;
    if (step.status !== "error") step.status = "done";
  }
  next.steps[idx]!.status = "done";
  next.current = id;
  next.updatedAt = now.toISOString();
  if (opts.activateNext) {
    const following = next.steps[idx + 1];
    if (following && (following.status === "pending" || following.status === "active")) {
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

/** Apply an explicit agent `deck step` declaration. */
export function applyAgentStep(
  progress: DeckBuildProgress,
  step: ParsedAgentStep,
  now = new Date()
): DeckBuildProgress {
  if (step.action === "start") {
    const next = startStep(progress, step.id, now);
    next.lastHint = `step:${step.id}:start`;
    return next;
  }
  if (step.action === "fail") {
    const next = failStep(progress, step.id, now);
    next.lastHint = `step:${step.id}:fail`;
    return next;
  }
  const next = completeStep(progress, step.id, { activateNext: true, now });
  next.lastHint = `step:${step.id}:done`;
  return next;
}

function normalizeToolStatus(status: string | undefined): "running" | "completed" | "error" | "ignore" {
  const s = String(status ?? "").toLowerCase();
  if (!s) return "ignore";
  if (s === "error" || s === "failed") return "error";
  if (s === "completed" || s === "complete" || s === "success" || s === "succeeded") return "completed";
  if (s === "running" || s === "in_progress" || s === "started" || s === "pending") return "running";
  return "ignore";
}

function matchCliStepsOnly(event: StreamToolCallEvent): DeckBuildStepId[] {
  const cmd = toolCallCommandText(event);
  if (parseAgentStepCommand(cmd)) return [];
  const found: DeckBuildStepId[] = [];
  if (!cmd.trim()) return found;
  for (const { id, re } of CLI_PATTERNS) {
    if (re.test(cmd)) found.push(id);
  }
  return found.sort((a, b) => STEP_INDEX[a] - STEP_INDEX[b]);
}

/**
 * Apply one Cloud Agents SSE `tool_call`.
 * - `deck step <id> <start|done|fail>` is authoritative.
 * - Judgment CLIs (search/catalog/job init, lint/missing) and manifest edits only *start* find/qa.
 * - Mechanical CLIs (download/resize/ocr/align/pack) complete as before.
 */
export function applyToolCallEvent(
  progress: DeckBuildProgress,
  event: StreamToolCallEvent,
  now = new Date()
): DeckBuildProgress {
  const kind = normalizeToolStatus(event.status);
  if (kind === "ignore") return progress;

  const cmd = toolCallCommandText(event);
  const explicit = parseAgentStepCommand(cmd);
  if (explicit) {
    // Apply on running or completed (idempotent). Shell errors → fail that step.
    if (kind === "error") {
      const next = failStep(progress, explicit.id, now);
      next.lastHint = `step:${explicit.id}:tool-error`;
      return next;
    }
    return applyAgentStep(progress, explicit, now);
  }

  const stepIds = matchToolCallToSteps(event);
  if (!stepIds.length) return progress;

  const cliIds = matchCliStepsOnly(event);
  const writeOnlyQa =
    stepIds.includes("qa") && !cliIds.includes("qa") && isWriteLikeTool(event.name);

  let next = progress;
  if (writeOnlyQa) {
    if (kind === "error") {
      const cleared = cloneProgress(next);
      for (const step of cleared.steps) {
        if (step.status === "active" && step.id !== "qa") step.status = "pending";
      }
      next = failStep(cleared, "qa", now);
    } else {
      next = startStep(next, "qa", now);
    }
    next.lastHint = [event.name, kind, "manifest-edit"].filter(Boolean).join(":");
    return next;
  }

  // Judgment hunt/lint CLIs: never complete / never auto-advance past find or qa.
  const onlyJudgment =
    stepIds.length > 0 && stepIds.every((id) => JUDGMENT_STEPS.has(id));

  if (onlyJudgment) {
    if (kind === "error") {
      const failId = stepIds[0]!;
      const cleared = cloneProgress(next);
      for (const step of cleared.steps) {
        if (step.status === "active" && step.id !== failId) step.status = "pending";
      }
      next = failStep(cleared, failId, now);
    } else {
      next = startStep(next, stepIds[0]!, now);
    }
    next.lastHint = [event.name, kind, "judgment-soft"].filter(Boolean).join(":");
    return next;
  }

  if (kind === "error") {
    const candidates = stepIds.filter((id) => {
      const s = next.steps[STEP_INDEX[id]]!.status;
      return s === "active" || s === "done";
    });
    const failId =
      (candidates.length
        ? [...candidates].sort((a, b) => STEP_INDEX[a] - STEP_INDEX[b])[0]
        : stepIds[0])!;
    const cleared = cloneProgress(next);
    for (const step of cleared.steps) {
      if (step.status === "active" && step.id !== failId) step.status = "pending";
    }
    next = failStep(cleared, failId, now);
  } else if (kind === "completed") {
    for (let i = 0; i < stepIds.length; i++) {
      const id = stepIds[i]!;
      if (JUDGMENT_STEPS.has(id)) {
        // Soft: keep active, do not complete from this CLI alone.
        next = startStep(next, id, now);
        continue;
      }
      const isLast = i === stepIds.length - 1;
      // Don't activateNext onto a judgment step from a mechanical complete —
      // agent must `deck step find/qa done`. Activate next only if next is mechanical
      // or missing; for next=qa after align, activate qa (soft start is fine).
      next = completeStep(next, id, { activateNext: isLast, now });
    }
  } else {
    next = startStep(next, stepIds[0]!, now);
  }
  next.lastHint = [event.name, kind].filter(Boolean).join(":");
  return next;
}

export function applyStreamPayload(
  progress: DeckBuildProgress,
  payload: unknown,
  now = new Date()
): DeckBuildProgress {
  if (!payload || typeof payload !== "object") return progress;
  const p = payload as Record<string, unknown>;
  const type = String(p.type ?? p.event ?? "");
  if (type && type !== "tool_call" && type !== "tool-call") {
    const subtype = String(p.subtype ?? p.kind ?? "");
    if (subtype.includes("tool-call") || p.callId || p.call_id) {
      const status = subtype.includes("completed")
        ? "completed"
        : subtype.includes("error") || subtype.includes("failed")
          ? "error"
          : subtype.includes("started") || subtype.includes("running")
            ? "running"
            : String(p.status ?? "");
      return applyToolCallEvent(
        progress,
        {
          name: String(p.name ?? p.toolName ?? p.tool_name ?? ""),
          status,
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
      status: String(p.status ?? ""),
      args: p.args ?? p.arguments,
      result: p.result,
    },
    now
  );
}

/** Feed raw SSE text chunks; returns leftover buffer + updated progress. */
export function consumeSseChunk(
  progress: DeckBuildProgress,
  buffer: string,
  chunk: string
): { progress: DeckBuildProgress; buffer: string; eventsApplied: number } {
  const combined = buffer + chunk;
  const parts = combined.split(/\n\n/);
  const leftover = parts.pop() ?? "";
  let next = progress;
  let eventsApplied = 0;
  for (const block of parts) {
    const dataLines = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (!dataLines.length) continue;
    const raw = dataLines.join("\n");
    if (!raw || raw === "[DONE]") continue;
    try {
      const json = JSON.parse(raw) as unknown;
      const before = JSON.stringify(next);
      next = applyStreamPayload(next, json);
      if (JSON.stringify(next) !== before) eventsApplied += 1;
    } catch {
      /* ignore partial / non-JSON */
    }
  }
  return { progress: next, buffer: leftover, eventsApplied };
}

const STEP_STATUS = new Set<StepStatus>(["pending", "active", "done", "error"]);

/** Restore a saved checklist. A bad payload is dropped. */
export function readDeckBuildProgress(value: unknown): DeckBuildProgress | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || !Array.isArray(v.steps)) return null;
  const steps: DeckBuildStepState[] = [];
  for (const spec of DECK_BUILD_STEPS) {
    const step = (v.steps as Record<string, unknown>[]).find((s) => s && s.id === spec.id);
    if (!step || step.id !== spec.id || !STEP_STATUS.has(step.status as StepStatus)) return null;
    steps.push({
      id: spec.id,
      label: spec.label,
      order: spec.order,
      status: step.status as StepStatus,
    });
  }
  const current =
    v.current == null ? null : isDeckBuildStepId(String(v.current)) ? (v.current as DeckBuildStepId) : null;
  return {
    version: 1,
    steps,
    current,
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt : new Date().toISOString(),
    lastHint: typeof v.lastHint === "string" ? v.lastHint : undefined,
  };
}

export function progressSchema() {
  return {
    version: 1 as const,
    steps: DECK_BUILD_STEPS.map((s) => ({ id: s.id, label: s.label, order: s.order })),
    judgmentSteps: [...JUDGMENT_STEPS],
    agentSignal: "npx tsx bin/deck.ts step <find|fetch|ocr|align|qa|pack> <start|done|fail> [--job work/<id>]",
    match: "Cloud Agents SSE tool_call → applyToolCallEvent (deck step authoritative for find/qa done)",
    stream: "GET /v1/agents/{id}/runs/{runId}/stream",
  };
}
