import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * NEX-2524: what `await-thread` tells you to run when it times out.
 *
 * A timeout is the ORDINARY outcome here — the hold is capped at 55 s and a
 * generation runs for minutes — so the hint is not a footnote, it is the
 * command the caller runs next. Two ways it has been wrong:
 *
 *   · naming `get-thread --wait`, which is the client-side poll this command
 *     exists to replace;
 *   · dropping `--after-message-count`, which reopens the stale-verdict trap:
 *     a thread left `completed` by an EARLIER turn reads `completed` the moment
 *     the next message is sent, so a resume without the flag answers instantly
 *     with the previous turn's prompt.
 */

const fakeClient = {
  promptAssistant: {
    awaitThread: vi.fn()
  }
};

vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return { ...actual, createClient: () => fakeClient };
});

import { registerPromptAssistantCommands } from "./prompt-assistant";

const TIMED_OUT = {
  outcome: "timed-out" as const,
  waitedMs: 55_000,
  thread: { threadId: "t-1", status: "generating", messages: [] }
};

/** Run `await-thread` with the given flags and return everything it printed. */
async function runAwait(flags: string[]): Promise<string> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerPromptAssistantCommands(program);

  const lines: string[] = [];
  const capture = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  const log = vi.spyOn(console, "log").mockImplementation(capture);
  const error = vi.spyOn(console, "error").mockImplementation(capture);
  try {
    await program.parseAsync([
      "node",
      "nexus",
      "prompt-assistant",
      "await-thread",
      "t-1",
      ...flags
    ]);
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
  return lines.join("\n");
}

describe("the await-thread timeout hint is a command you can actually run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeClient.promptAssistant.awaitThread.mockResolvedValue(TIMED_OUT);
    process.exitCode = undefined;
  });

  it("names await-thread, not the client-side poll it replaces", async () => {
    const out = await runAwait([]);

    expect(out).toContain("nexus prompt-assistant await-thread t-1");
    expect(out).not.toContain("get-thread");
  });

  it("carries --after-message-count back, so the resume cannot read a stale verdict", async () => {
    const out = await runAwait(["--after-message-count", "4"]);

    expect(out).toContain("nexus prompt-assistant await-thread t-1 --after-message-count 4");
  });

  it("carries --wait-timeout back, so the resume holds for as long as was asked", async () => {
    const out = await runAwait(["--wait-timeout", "20", "--after-message-count", "6"]);

    expect(out).toContain(
      "nexus prompt-assistant await-thread t-1 --wait-timeout 20 --after-message-count 6"
    );
  });

  it("adds no flag the caller never passed", async () => {
    const out = await runAwait([]);

    expect(out).not.toContain("--after-message-count");
    expect(out).not.toContain("--wait-timeout");
  });

  it("exits non-zero on a timeout — returning is not the prompt being ready", async () => {
    await runAwait([]);

    expect(process.exitCode).not.toBe(0);
  });
});
