import { describe, expect, it } from "vitest";
import {
  applyAgentStep,
  applyToolCallEvent,
  createDeckBuildProgress,
  matchToolCallToStep,
  matchToolCallToSteps,
  parseAgentStepCommand,
} from "../src/progress.js";

describe("matchToolCallToStep", () => {
  it("maps deck CLIs to steps", () => {
    expect(
      matchToolCallToStep({
        name: "run_terminal_cmd",
        args: { command: "npx tsx bin/deck.ts search \"OpenStax heart\"" },
      })
    ).toBe("find");
    expect(
      matchToolCallToStep({
        name: "Shell",
        args: { command: "npx tsx bin/deck.ts pack work/h/manifest.json -o work/h/out/deck.apkg" },
      })
    ).toBe("pack");
  });

  it("maps deck step signals", () => {
    expect(parseAgentStepCommand("npx tsx bin/deck.ts step find done --job work/hand")).toEqual({
      id: "find",
      action: "done",
    });
    expect(
      matchToolCallToStep({
        name: "shell",
        args: { command: "npx tsx bin/deck.ts step qa done --job work/hand" },
      })
    ).toBe("qa");
  });

  it("ignores unrelated tools and chatter", () => {
    expect(matchToolCallToStep({ name: "read_file", args: { path: "AGENTS.md" } })).toBeNull();
    expect(
      matchToolCallToStep({ name: "read_file", args: { path: "work/heart1/manifest.json" } })
    ).toBeNull();
    expect(
      matchToolCallToStep({ name: "shell", args: { command: "ls work/heart1/out/deck.apkg" } })
    ).toBeNull();
    expect(
      matchToolCallToStep({ name: "shell", args: { command: "echo deck pack later" } })
    ).toBeNull();
  });

  it("handles compound CLIs", () => {
    expect(
      matchToolCallToSteps({
        name: "shell",
        args: {
          command:
            "npx tsx bin/deck.ts ocr a.jpg -o o.json && npx tsx bin/deck.ts align o.json t.txt --plates p -o m.json",
        },
      })
    ).toEqual(["ocr", "align"]);
  });
});

describe("applyToolCallEvent", () => {
  it("ignores missing status", () => {
    const p = applyToolCallEvent(createDeckBuildProgress(), {
      name: "shell",
      args: { command: "npx tsx bin/deck.ts ocr a.jpg -o o.json" },
    });
    expect(p.steps.every((s) => s.status === "pending")).toBe(true);
  });

  it("search/catalog only start find — never auto-advance to fetch", () => {
    let p = createDeckBuildProgress();
    p = applyToolCallEvent(p, {
      name: "shell",
      status: "completed",
      args: { command: "npx tsx bin/deck.ts catalog hand" },
    });
    expect(p.steps.find((s) => s.id === "find")?.status).toBe("active");
    expect(p.steps.find((s) => s.id === "fetch")?.status).toBe("pending");

    p = applyToolCallEvent(p, {
      name: "shell",
      status: "completed",
      args: { command: "npx tsx bin/deck.ts search \"hand bones\"" },
    });
    expect(p.steps.find((s) => s.id === "find")?.status).toBe("active");
    expect(p.steps.find((s) => s.id === "fetch")?.status).toBe("pending");
  });

  it("deck step find done completes find and activates fetch", () => {
    let p = createDeckBuildProgress();
    p = applyToolCallEvent(p, {
      name: "shell",
      status: "completed",
      args: { command: "npx tsx bin/deck.ts search \"x\"" },
    });
    p = applyToolCallEvent(p, {
      name: "shell",
      status: "completed",
      args: { command: "npx tsx bin/deck.ts step find done --job work/hand" },
    });
    expect(p.steps.find((s) => s.id === "find")?.status).toBe("done");
    expect(p.steps.find((s) => s.id === "fetch")?.status).toBe("active");
  });

  it("lint/missing only start qa — step qa done unlocks pack", () => {
    let p = createDeckBuildProgress();
    p = applyAgentStep(p, { id: "align", action: "done" });
    p = applyToolCallEvent(p, {
      name: "shell",
      status: "completed",
      args: { command: "npx tsx bin/deck.ts lint work/h/manifest.json" },
    });
    expect(p.steps.find((s) => s.id === "qa")?.status).toBe("active");
    expect(p.steps.find((s) => s.id === "pack")?.status).toBe("pending");

    p = applyToolCallEvent(p, {
      name: "shell",
      status: "completed",
      args: { command: "npx tsx bin/deck.ts step qa done --job work/h" },
    });
    expect(p.steps.find((s) => s.id === "qa")?.status).toBe("done");
    expect(p.steps.find((s) => s.id === "pack")?.status).toBe("active");
  });

  it("manifest edits only nudge qa active", () => {
    let p = createDeckBuildProgress();
    p = applyAgentStep(p, { id: "align", action: "done" });
    p = applyToolCallEvent(p, {
      name: "edit_file",
      status: "completed",
      args: { path: "/workspace/work/hand/manifest.json" },
    });
    expect(p.steps.find((s) => s.id === "qa")?.status).toBe("active");
    expect(p.steps.find((s) => s.id === "pack")?.status).toBe("pending");
  });

  it("mechanical ocr completes and advances", () => {
    let p = createDeckBuildProgress(new Date("2026-09-30T12:00:00Z"));
    p = applyToolCallEvent(p, {
      name: "shell",
      status: "running",
      args: { command: "npx tsx bin/deck.ts ocr a.jpg -o ocr.json" },
    });
    expect(p.steps.find((s) => s.id === "ocr")?.status).toBe("active");

    p = applyToolCallEvent(p, {
      name: "shell",
      status: "completed",
      args: { command: "npx tsx bin/deck.ts ocr a.jpg -o ocr.json" },
    });
    expect(p.steps.find((s) => s.id === "ocr")?.status).toBe("done");
    expect(p.steps.find((s) => s.id === "align")?.status).toBe("active");
  });
});
