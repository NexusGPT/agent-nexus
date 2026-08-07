import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

// NEX-2760: `task execute` used the SDK's 30 s default timeout with no way to
// change it, so long structured-JSON generations aborted client-side while the
// server kept going. These tests pin the two-part fix: a generous default for
// `task execute`, overridable by the global `--timeout <seconds>` flag.

const fakeClient = {
  skills: {
    executeTask: vi.fn().mockResolvedValue({ output: "ok" })
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

import { parseTimeoutSeconds } from "../client";
import { registerTaskCommands } from "./task";

async function runExecute(extraGlobals: string[]): Promise<void> {
  const program = new Command();
  // Mirror the real global option, including its parser.
  program.name("nexus").option("--timeout <seconds>", "timeout", parseTimeoutSeconds);
  registerTaskCommands(program);

  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await program.parseAsync([
      "node",
      "nexus",
      ...extraGlobals,
      "task",
      "execute",
      "task-123",
      "--input",
      "hello"
    ]);
  } finally {
    spy.mockRestore();
  }
}

describe("NEX-2760: task execute client-side timeout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOpts = undefined;
  });

  it("defaults to a generous 600 s so long generations are not aborted client-side", async () => {
    await runExecute([]);

    expect(fakeClient.skills.executeTask).toHaveBeenCalledWith("task-123", { input: "hello" });
    expect(capturedOpts?.timeout).toBe(600);
  });

  it("lets an explicit global --timeout win over the command default", async () => {
    await runExecute(["--timeout", "45"]);

    expect(capturedOpts?.timeout).toBe(45);
  });
});

describe("parseTimeoutSeconds", () => {
  it("accepts positive numbers, including fractions", () => {
    expect(parseTimeoutSeconds("600")).toBe(600);
    expect(parseTimeoutSeconds("0.5")).toBe(0.5);
  });

  it.each(["0", "-5", "abc", "Infinity", ""])("rejects %j at parse time", (raw) => {
    expect(() => parseTimeoutSeconds(raw)).toThrow(/positive number of seconds/);
  });
});
