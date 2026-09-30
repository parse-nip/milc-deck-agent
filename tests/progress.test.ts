import { describe, expect, it } from "vitest";
import {
  applyStreamPayload,
  applyToolCallEvent,
  completeStep,
  createDeckBuildProgress,
  matchToolCallToStep,
  startStep,
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
        args: { command: "npx tsx bin/deck.ts download heart -o work/heart1/plates" },
      })
    ).toBe("fetch");
    expect(
      matchToolCallToStep({
        name: "shell",
        args: { command: "npx tsx bin/deck.ts resize work/h/plates/*.jpg" },
      })
    ).toBe("fetch");
    expect(
      matchToolCallToStep({
        name: "shell",
        args: { command: "npx tsx bin/deck.ts ocr work/h/plates/*.jpg -o work/h/ocr.json" },
      })
    ).toBe("ocr");
    expect(
      matchToolCallToStep({
        name: "shell",
        args: { command: "npx tsx bin/deck.ts align work/h/ocr.json work/h/terms.txt --plates work/h/plates -o work/h/manifest.json" },
      })
    ).toBe("align");
    expect(
      matchToolCallToStep({
        name: "shell",
        args: { command: "npx tsx bin/deck.ts lint work/h/manifest.json" },
      })
    ).toBe("qa");
    expect(
      matchToolCallToStep({
        name: "shell",
        args: { command: "npx tsx bin/deck.ts pack work/h/manifest.json -o work/h/out/deck.apkg" },
      })
    ).toBe("pack");
  });

  it("ignores unrelated tools", () => {
    expect(matchToolCallToStep({ name: "read_file", args: { path: "AGENTS.md" } })).toBeNull();
  });
});

describe("applyToolCallEvent", () => {
  it("starts then completes and advances", () => {
    let p = createDeckBuildProgress(new Date("2026-09-30T12:00:00Z"));
    p = applyToolCallEvent(p, {
      name: "shell",
      status: "running",
      args: { command: "npx tsx bin/deck.ts ocr a.jpg -o ocr.json" },
    });
    expect(p.steps.find((s) => s.id === "ocr")?.status).toBe("active");
    expect(p.steps.find((s) => s.id === "find")?.status).toBe("done");
    expect(p.steps.find((s) => s.id === "fetch")?.status).toBe("done");

    p = applyToolCallEvent(p, {
      name: "shell",
      status: "completed",
      args: { command: "npx tsx bin/deck.ts ocr a.jpg -o ocr.json" },
    });
    expect(p.steps.find((s) => s.id === "ocr")?.status).toBe("done");
    expect(p.steps.find((s) => s.id === "align")?.status).toBe("active");
  });

  it("marks error on failed pack", () => {
    let p = createDeckBuildProgress();
    p = startStep(p, "pack");
    p = applyToolCallEvent(p, {
      name: "shell",
      status: "error",
      args: { command: "npx tsx bin/deck.ts pack m.json -o out.apkg" },
    });
    expect(p.steps.find((s) => s.id === "pack")?.status).toBe("error");
  });
});

describe("applyStreamPayload", () => {
  it("handles tool_call envelope", () => {
    let p = createDeckBuildProgress();
    p = applyStreamPayload(p, {
      type: "tool_call",
      name: "run_terminal_cmd",
      status: "completed",
      args: { command: "deck catalog skull" },
    });
    expect(p.steps.find((s) => s.id === "find")?.status).toBe("done");
    expect(completeStep(p, "find").steps[0]!.status).toBe("done");
  });
});
