import type { GenerationSummary, TraceDetail } from "@agent-nexus/sdk";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * `tracing trace <id>` MUST NOT RENDER A WINDOW SIZE AS A COUNT.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS FOR
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The nested generations array is windowed server-side. `generationCount` counts
 * the WHOLE trace, so `generations.length < generationCount` is the window
 * biting — a fact off the wire, not a cap this file duplicates. The header used
 * the array length alone, so a windowed trace reported the window as its count
 * and disagreed with `tracing traces` about the same trace.
 *
 * ── WHY THE COMPLETE CASE IS ASSERTED TOO ───────────────────────────────────
 *
 * An unconditional "x of y" is not merely noise: it teaches the reader to skim
 * the one line that carries the warning, so on the day it matters it is not read.
 * The complete case asserts the PAIR — no window text AND the table present —
 * because "no window text" alone is satisfied by a command that printed nothing.
 */

const GEN: GenerationSummary = {
  id: "g1",
  traceId: "t1",
  provider: "ANTHROPIC" as GenerationSummary["provider"],
  modelName: "claude-sonnet-4",
  status: "COMPLETED",
  inputTokens: 10,
  outputTokens: 20,
  cacheReadInputTokens: null,
  cacheCreationInputTokens: null,
  reasoningTokens: null,
  costUsd: 0.01,
  durationMs: 100,
  thinkingDurationMs: null,
  ttftMs: null,
  streamDurationMs: null,
  taskId: null,
  taskName: null,
  nodeId: null,
  startedAt: "2026-08-31T10:00:00.000Z",
  completedAt: "2026-08-31T10:00:01.000Z",
  errorMessage: null,
  metadata: null,
  isAborted: false,
  temperature: null,
  finishReason: "end_turn",
  responseId: null
};

const trace = (shown: number, generationCount: number): TraceDetail => ({
  id: "t1",
  status: "COMPLETED",
  agentId: null,
  agentName: "Cue",
  workflowId: null,
  workflowName: null,
  conversationId: null,
  source: null,
  totalCostUsd: 1.5,
  totalInputTokens: 100,
  totalOutputTokens: 200,
  totalDurationMs: 1000,
  generationCount,
  startedAt: "2026-08-31T10:00:00.000Z",
  completedAt: "2026-08-31T10:00:05.000Z",
  tags: [],
  triggeredBy: null,
  executionId: null,
  generations: Array.from({ length: shown }, (_, i) => ({ ...GEN, id: `g${i}` }))
});

const getTrace = vi.hoisted(() => vi.fn());
vi.mock("../client", () => ({ createClient: () => ({ tracing: { getTrace } }) }));

import { registerTracingCommands } from "./tracing";

async function drive(json: boolean, t: TraceDetail): Promise<string> {
  getTrace.mockResolvedValue(t);
  const program = new Command();
  program.name("nexus").exitOverride();
  registerTracingCommands(program);
  setJsonMode(json);

  const chunks: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => {
    chunks.push(args.map(String).join(" "));
  };
  try {
    await program.parseAsync(["node", "nexus", "tracing", "trace", "t1"]);
  } finally {
    console.log = log;
    setJsonMode(false);
  }
  return chunks.join("\n");
}

afterEach(() => {
  vi.clearAllMocks();
  setJsonMode(false);
});

describe("tracing trace renders the generation window", () => {
  it("WINDOWED: the header names both numbers", async () => {
    // 2 rows out of a 137-generation trace: the exact shape that reported the
    // window as the count.
    const out = await drive(false, trace(2, 137));

    expect(out).toContain("Generations (2 of 137)");
  });

  it("WINDOWED: it names the command that pages the rest", async () => {
    const out = await drive(false, trace(2, 137));

    expect(out).toContain("nexus tracing generations --trace-id");
  });

  it("COMPLETE: no window text — and the table still rendered", async () => {
    // The pair IS the assertion. "No window text" alone is satisfied by a
    // command that printed nothing at all.
    const out = await drive(false, trace(3, 3));

    expect({
      windowText: out.includes(" of 3)") || out.includes("Windowed"),
      table: out.includes("claude-sonnet-4")
    }).toEqual({ windowText: false, table: true });
  });

  it("COMPLETE: the header still reports the count itself", async () => {
    const out = await drive(false, trace(3, 3));

    expect(out).toContain("Generations (3)");
  });

  it("--json is not contaminated by either line", async () => {
    const out = await drive(true, trace(2, 137));

    expect({
      wire: out.includes('"generationCount"'),
      leak: out.includes("Windowed") || out.includes("Generations (2 of 137)")
    }).toEqual({ wire: true, leak: false });
  });
});
