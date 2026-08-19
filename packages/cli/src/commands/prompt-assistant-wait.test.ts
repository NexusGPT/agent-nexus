import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * NEX-2923: `--wait` on the prompt assistant.
 *
 * The command already auto-polled, and it stopped at exactly the wrong line: the
 * moment the thread left `in_progress`. `generating` means the assistant has
 * answered and the PROMPT IS STILL BEING WRITTEN — 13 and 26 minutes on the two
 * production threads this was filed over — so the poll returned an empty
 * `promptResult` and a status the caller then had to interpret, exit code 0.
 *
 * Three things are pinned here, and each is a way the old shape misled a script:
 *   1. `--wait` blocks THROUGH `generating` and prints the prompt.
 *   2. no flag keeps the old, shorter wait — this is opt-in, not a 30-minute
 *      surprise for everyone who already scripts `chat`.
 *   3. a wait that ends without a prompt EXITS NON-ZERO. Returning 0 with a
 *      `generating` status is the original defect one layer down: the caller
 *      reads "the command returned" as "the prompt is ready".
 */

const waitForThread = vi.fn();
const chat = vi.fn();
const getThread = vi.fn();

vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return {
    ...actual,
    createClient: () => ({ promptAssistant: { chat, getThread, waitForThread } })
  };
});

import { EXIT_CODES } from "../exit-codes";
import { setJsonMode } from "../output";
import { registerPromptAssistantCommands } from "./prompt-assistant";

const COMPLETED = {
  thread: {
    threadId: "t-1",
    status: "completed",
    messages: [
      { role: "user", content: "hi", timestamp: "" },
      { role: "assistant", content: "done", timestamp: "" }
    ],
    promptResult: { prompt: "# The prompt", name: "Agent", description: "" }
  },
  outcome: "terminal",
  waitedMs: 1_000
};

const STILL_GENERATING = {
  thread: { threadId: "t-1", status: "generating", messages: [], promptResult: undefined },
  outcome: "timed-out",
  waitedMs: 1_800_000
};

async function run(argv: string[]): Promise<string> {
  const program = new Command();
  // Mirrors the real root: `--json` is a GLOBAL, and `setJsonMode` is what the
  // binary calls before dispatch — the printers read the module flag, not the
  // option bag.
  program.name("nexus").option("--timeout <seconds>", "timeout").option("--json", "json output");
  setJsonMode(argv.includes("--json"));
  registerPromptAssistantCommands(program);

  let out = "";
  const log = vi.spyOn(console, "log").mockImplementation((...args) => {
    out += args.join(" ") + "\n";
  });
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await program.parseAsync(["node", "nexus", ...argv]);
  } finally {
    log.mockRestore();
    err.mockRestore();
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  chat.mockResolvedValue({ threadId: "t-1", response: "", status: "in_progress" });
  getThread.mockResolvedValue({ threadId: "t-1", status: "in_progress", messages: [] });
  waitForThread.mockResolvedValue(COMPLETED);
});

afterEach(() => {
  process.exitCode = undefined;
  setJsonMode(false);
});

describe("chat --wait waits for the prompt, not for the generation to START", () => {
  it("asks for the prompt, and gets the whole half-hour to find it", async () => {
    await run(["prompt-assistant", "chat", "--message", "hi", "--mode", "agent", "--wait"]);

    expect(waitForThread).toHaveBeenCalledWith(
      "t-1",
      expect.objectContaining({ until: "prompt", timeoutMs: 30 * 60 * 1000 })
    );
  });

  it("prints promptResult — the thing the caller was waiting for", async () => {
    const out = await run([
      "prompt-assistant",
      "chat",
      "--message",
      "hi",
      "--mode",
      "agent",
      "--wait",
      "--json"
    ]);

    expect(JSON.parse(out)).toMatchObject({
      threadId: "t-1",
      status: "completed",
      promptResult: { prompt: "# The prompt" }
    });
    expect(process.exitCode).toBeUndefined();
  });

  it("honours --wait-timeout, in seconds", async () => {
    await run([
      "prompt-assistant",
      "chat",
      "--message",
      "hi",
      "--mode",
      "agent",
      "--wait",
      "--wait-timeout",
      "3600"
    ]);

    expect(waitForThread).toHaveBeenCalledWith(
      "t-1",
      // SECONDS in, MILLISECONDS out — the boundary NEX-3707 was filed over.
      expect.objectContaining({ timeoutMs: 3_600_000 })
    );
  });

  it("refuses a --wait-timeout that is not a positive number of seconds", async () => {
    const program = new Command().name("nexus").exitOverride();
    registerPromptAssistantCommands(program);

    await expect(
      program.parseAsync([
        "node",
        "nexus",
        "prompt-assistant",
        "chat",
        "--message",
        "hi",
        "--mode",
        "agent",
        "--wait-timeout",
        "nope"
      ])
    ).rejects.toThrow(/positive number of seconds/);
  });
});

describe("without --wait the shorter, pre-existing poll is unchanged", () => {
  it("keeps the 5-minute reply poll and stops at generating", async () => {
    await run(["prompt-assistant", "chat", "--message", "hi", "--mode", "agent"]);

    expect(waitForThread).toHaveBeenCalledWith(
      "t-1",
      expect.objectContaining({ until: "assistant-reply", timeoutMs: 5 * 60 * 1000 })
    );
  });

  it("passes the pre-send message count so a follow-up cannot settle on the old reply", async () => {
    getThread.mockResolvedValue({
      threadId: "t-1",
      status: "completed",
      messages: [
        { role: "user", content: "a", timestamp: "" },
        { role: "assistant", content: "b", timestamp: "" }
      ]
    });

    await run([
      "prompt-assistant",
      "chat",
      "--message",
      "more",
      "--mode",
      "agent",
      "--thread-id",
      "t-1"
    ]);

    expect(waitForThread).toHaveBeenCalledWith(
      "t-1",
      expect.objectContaining({ afterMessageCount: 2 })
    );
  });
});

describe("a wait that ends without a prompt exits non-zero", () => {
  it("fails on a timeout, and still prints the thread so the caller can resume", async () => {
    waitForThread.mockResolvedValue(STILL_GENERATING);

    const out = await run([
      "prompt-assistant",
      "chat",
      "--message",
      "hi",
      "--mode",
      "agent",
      "--wait",
      "--json"
    ]);

    expect(process.exitCode).toBe(EXIT_CODES["timed-out"]);
    // FIRST WINS: the payload is the document on stdout, the error goes to
    // stderr, and the pipe stays parseable.
    expect(JSON.parse(out)).toMatchObject({
      threadId: "t-1",
      status: "generating",
      timedOut: true
    });
  });

  it("fails when the thread itself ended failed", async () => {
    waitForThread.mockResolvedValue({
      thread: { threadId: "t-1", status: "failed", messages: [] },
      outcome: "terminal",
      waitedMs: 5_000
    });

    await run(["prompt-assistant", "chat", "--message", "hi", "--mode", "agent", "--wait"]);

    expect(process.exitCode).toBe(EXIT_CODES["remote-error"]);
  });

  it("does NOT fail a retry that inherited a failed status from the previous turn", async () => {
    // The server never resets `status` on a new user message, so turn 2 of a
    // once-failed thread still reads `failed`. Only `outcome` says whose verdict
    // it is; reading the status alone fails a turn that worked.
    waitForThread.mockResolvedValue({
      thread: {
        threadId: "t-1",
        status: "failed",
        messages: [{ role: "assistant", content: "Which channels?", timestamp: "" }]
      },
      outcome: "assistant-replied",
      waitedMs: 5_000
    });

    await run(["prompt-assistant", "chat", "--message", "hi", "--mode", "agent", "--wait"]);

    expect(process.exitCode).toBeUndefined();
  });
});

describe("get-thread --wait is the recovery path for a chat that was killed", () => {
  it("waits on the thread alone, with no turn baseline to settle on", async () => {
    await run(["prompt-assistant", "get-thread", "t-1", "--wait"]);

    expect(waitForThread).toHaveBeenCalledWith(
      "t-1",
      expect.objectContaining({ until: "prompt", afterMessageCount: undefined })
    );
    expect(getThread).not.toHaveBeenCalled();
  });

  it("reads once, without waiting, when the flag is absent", async () => {
    await run(["prompt-assistant", "get-thread", "t-1"]);

    expect(waitForThread).not.toHaveBeenCalled();
    expect(getThread).toHaveBeenCalledWith("t-1");
  });

  it("exits non-zero when the wait times out", async () => {
    waitForThread.mockResolvedValue(STILL_GENERATING);

    await run(["prompt-assistant", "get-thread", "t-1", "--wait"]);

    expect(process.exitCode).toBe(EXIT_CODES["timed-out"]);
  });
});
