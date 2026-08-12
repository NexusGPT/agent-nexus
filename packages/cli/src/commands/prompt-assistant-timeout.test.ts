import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

// NEX-3707: `prompt-assistant chat` handed `createClient` a MILLISECOND constant
// through a parameter that takes SECONDS. `createClient` multiplied it by 1000
// again, so the SDK asked Node for a 7 200 000 000 ms timer; Node clamps a delay
// past 2^31-1 to 1 ms, and every chat aborted before the request left the
// machine — reporting itself as a timeout "after 7200000s" it never waited.
//
// Two halves, so two sets of assertions:
//   1. the value handed across the seconds boundary is SECONDS, and the global
//      --timeout the CLI's own error hint names actually overrides it;
//   2. a value that would overflow Node's timer is REFUSED at the one place the
//      unit changes, rather than silently clamped to an instant abort.

const fakeClient = {
  promptAssistant: {
    chat: vi.fn().mockResolvedValue({ threadId: "thread-1", response: "hi" }),
    getThread: vi.fn()
  }
};

let capturedOpts: Record<string, unknown> | undefined;

vi.mock("../client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../client")>();
  return {
    ...actual,
    createClient: (opts?: Record<string, unknown>) => {
      capturedOpts = opts;
      return fakeClient;
    }
  };
});

import {
  MAX_TIMEOUT_MS,
  MAX_TIMEOUT_SECONDS,
  parseTimeoutSeconds,
  timeoutSecondsToMs
} from "../client";
import { registerPromptAssistantCommands } from "./prompt-assistant";

/** The default this command asks for: two hours, expressed in seconds. */
const TWO_HOURS_IN_SECONDS = 7200;

/** The value the defect produced, and the one number that must never reappear. */
const OVERFLOWED_MS = 7_200_000_000;

async function runChat(extraGlobals: string[]): Promise<void> {
  const program = new Command();
  // Mirror the real global option, including its parser.
  program.name("nexus").option("--timeout <seconds>", "timeout", parseTimeoutSeconds);
  registerPromptAssistantCommands(program);

  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await program.parseAsync([
      "node",
      "nexus",
      ...extraGlobals,
      "prompt-assistant",
      "chat",
      "--message",
      "hello",
      "--mode",
      "agent"
    ]);
  } finally {
    spy.mockRestore();
  }
}

describe("prompt-assistant chat crosses the seconds boundary in seconds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeClient.promptAssistant.chat.mockResolvedValue({ threadId: "thread-1", response: "hi" });
    capturedOpts = undefined;
  });

  it("asks for two hours as SECONDS, not as the millisecond count of two hours", async () => {
    await runChat([]);

    expect(fakeClient.promptAssistant.chat).toHaveBeenCalledTimes(1);
    expect(capturedOpts?.timeout).toBe(TWO_HOURS_IN_SECONDS);
  });

  it("converts that default to a delay Node's timers accept", async () => {
    await runChat([]);

    const ms = timeoutSecondsToMs(capturedOpts?.timeout as number);
    expect(ms).toBe(7_200_000);
    expect(ms).toBeLessThanOrEqual(MAX_TIMEOUT_MS);
    // The defect's own number, pinned as an ABSENCE: it has one spelling, and
    // the corrected code has several.
    expect(ms).not.toBe(OVERFLOWED_MS);
  });

  it("lets the global --timeout the error hint names actually override the default", async () => {
    await runChat(["--timeout", "45"]);

    expect(capturedOpts?.timeout).toBe(45);
  });
});

describe("a timeout past Node's 32-bit ceiling is refused, never clamped", () => {
  it("refuses the millisecond value the defect used to hand across the boundary", () => {
    expect(() => timeoutSecondsToMs(7_200_000)).toThrow(RangeError);
    expect(() => timeoutSecondsToMs(7_200_000)).toThrow(/milliseconds handed to a parameter/);
  });

  it("accepts the largest value that still fits", () => {
    expect(timeoutSecondsToMs(MAX_TIMEOUT_SECONDS)).toBeLessThanOrEqual(MAX_TIMEOUT_MS);
  });

  it("refuses an over-ceiling --timeout at parse time, before any request is built", () => {
    expect(() => parseTimeoutSeconds(String(MAX_TIMEOUT_SECONDS + 1))).toThrow(
      /at most \d+ seconds/
    );
  });

  it("still accepts an ordinary --timeout", () => {
    expect(parseTimeoutSeconds("120")).toBe(120);
  });
});
