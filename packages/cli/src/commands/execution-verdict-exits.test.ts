import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_CODES } from "../exit-codes";
import { setJsonMode } from "../output";
import { judgeRunStatus } from "../run-verdict";
import { describeStdout } from "./json-one-document.scan";

/**
 * THE `execution` NAMESPACE CARRIES ITS VERDICT IN ITS EXIT CODE — BOTH WAYS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A CURE THAT REDDENS A HEALTHY RUN IS NOT A CURE. EVERY CASE HERE IS A PAIR.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `execution diagnose` and `execution poll` each print a run's status and exited
 * `0` over every value of it. For each one this file asserts a FAILED run exits
 * non-zero *and* a COMPLETED run still exits `0`. Asserting only the first half
 * passes for a command that refuses unconditionally, which would break every
 * correct caller.
 *
 * ── CANCELLED IS THE CASE THIS FILE EXISTS FOR ──────────────────────────────
 *
 * 🚨 `poll --watch` STOPS AT COMPLETED, FAILED **OR** CANCELLED. Collapsing the
 * third into either of the other two is the defect one layer down: a cancelled
 * run was stopped before the platform judged it, so reporting it as a failure
 * sends the reader to debug a workflow that was never given the chance to be
 * wrong, and reporting it as a pass tells a script the run succeeded. It gets
 * `unmeasured`, and the cases below assert it is NEITHER of the other two.
 *
 * ── THE REAL COMMAND TREE, NOT A LIST WRITTEN IN THIS FILE ──────────────────
 *
 * Every assertion drives `registerExecutionCommands` through commander with only
 * the SDK client replaced. A spec walking its own table of expected outcomes
 * asserts against its own fixture and stays green with the defect restored.
 */
const { diagnose, poll, pollByToken } = vi.hoisted(() => ({
  diagnose: vi.fn(),
  poll: vi.fn(),
  pollByToken: vi.fn()
}));

vi.mock("../client", () => ({
  createClient: () => ({ workflowExecutions: { diagnose, poll, pollByToken } }),
  timeoutSecondsToMs: (s?: number) => (s !== undefined ? s * 1000 : undefined)
}));

import { registerExecutionCommands } from "./execution";

const EXECUTION_ID = "11111111-1111-4111-8111-111111111111";

function diagnoseDoc(status: string) {
  return {
    executionId: EXECUTION_ID,
    workflowName: "Nightly sync",
    status,
    duration: 1200,
    startedAt: "2026-08-19T00:00:00.000Z",
    completedAt: status === "RUNNING" ? null : "2026-08-19T00:00:01.200Z",
    executionType: "run",
    error: status === "FAILED" ? "boom" : null,
    nodeStatusCounts: {},
    nodeExecutionStatusCounts: {},
    nodes: []
  };
}

function pollDoc(status: string) {
  return {
    executionId: EXECUTION_ID,
    status,
    outputData: status === "COMPLETED" ? { ok: true } : null,
    createdAt: "2026-08-19T00:00:00.000Z",
    finishedAt: status === "RUNNING" ? null : "2026-08-19T00:00:01.200Z"
  };
}

async function run(argv: string[]): Promise<number | undefined> {
  const program = new Command();
  program.name("nexus").exitOverride().option("--json", "Output as JSON");
  registerExecutionCommands(program);

  const before = process.exitCode;
  process.exitCode = undefined;
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    await program.parseAsync(["node", "nexus", ...argv]);
    return process.exitCode;
  } finally {
    log.mockRestore();
    error.mockRestore();
    write.mockRestore();
    process.exitCode = before;
  }
}

async function runJson(argv: string[]): Promise<{ stdout: string; exitCode: number | undefined }> {
  const program = new Command();
  program.name("nexus").exitOverride().option("--json", "Output as JSON");
  registerExecutionCommands(program);

  const before = process.exitCode;
  process.exitCode = undefined;
  setJsonMode(true);
  const out: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.map((a) => String(a)).join(" "));
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    await program.parseAsync(["node", "nexus", "--json", ...argv]);
    return { stdout: out.join("\n"), exitCode: process.exitCode };
  } finally {
    log.mockRestore();
    error.mockRestore();
    write.mockRestore();
    setJsonMode(false);
    process.exitCode = before;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("judgeRunStatus", () => {
  it("maps every declared status, and an unknown one to in-flight", () => {
    // `WorkflowExecutionStatus` is a closed union of five. Enumerated rather
    // than sampled: a table that skipped one would pass while that one status
    // silently read as a pass.
    expect(judgeRunStatus("COMPLETED")).toEqual({ outcome: "completed" });
    expect(judgeRunStatus("FAILED")).toEqual({ outcome: "failed" });
    expect(judgeRunStatus("CANCELLED")).toEqual({ outcome: "cancelled" });
    expect(judgeRunStatus("RUNNING")).toEqual({ outcome: "in-flight", status: "RUNNING" });
    expect(judgeRunStatus("PENDING")).toEqual({ outcome: "in-flight", status: "PENDING" });
    // A terminal state added upstream must not read as green here by default.
    expect(judgeRunStatus("SOMETHING_NEW")).toEqual({
      outcome: "in-flight",
      status: "SOMETHING_NEW"
    });
  });
});

describe("nexus execution diagnose", () => {
  it("exits NON-ZERO on a FAILED run", async () => {
    diagnose.mockResolvedValue(diagnoseDoc("FAILED"));

    expect(await run(["execution", "diagnose", EXECUTION_ID])).toBe(EXIT_CODES["remote-error"]);
  });

  it("still exits 0 on a COMPLETED run", async () => {
    diagnose.mockResolvedValue(diagnoseDoc("COMPLETED"));

    expect(await run(["execution", "diagnose", EXECUTION_ID])).toBeUndefined();
  });

  it("exits UNMEASURED — never the failure code — on a CANCELLED run", async () => {
    diagnose.mockResolvedValue(diagnoseDoc("CANCELLED"));

    const code = await run(["execution", "diagnose", EXECUTION_ID]);
    expect(code).toBe(EXIT_CODES.unmeasured);
    expect(code).not.toBe(EXIT_CODES["remote-error"]);
  });

  it("exits UNMEASURED on a run still RUNNING", async () => {
    diagnose.mockResolvedValue(diagnoseDoc("RUNNING"));

    expect(await run(["execution", "diagnose", EXECUTION_ID])).toBe(EXIT_CODES.unmeasured);
  });

  it("puts the ERROR document on stdout under --json when it refuses", async () => {
    diagnose.mockResolvedValue(diagnoseDoc("FAILED"));

    const { stdout, exitCode } = await runJson(["execution", "diagnose", EXECUTION_ID]);

    expect(exitCode).toBe(EXIT_CODES["remote-error"]);
    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });
    expect((JSON.parse(stdout) as { error?: { code?: unknown } }).error?.code).toBe(
      "CLI_REMOTE_ERROR"
    );
  });

  it("gives CANCELLED its own document code, apart from the failure one", async () => {
    // Same exit code as an unfinished run, and never the same `code`: one run is
    // over and one is not, so the reader's next move differs.
    diagnose.mockResolvedValue(diagnoseDoc("CANCELLED"));
    const cancelled = await runJson(["execution", "diagnose", EXECUTION_ID]);

    diagnose.mockResolvedValue(diagnoseDoc("RUNNING"));
    const running = await runJson(["execution", "diagnose", EXECUTION_ID]);

    expect(cancelled.exitCode).toBe(EXIT_CODES.unmeasured);
    expect(running.exitCode).toBe(EXIT_CODES.unmeasured);
    expect((JSON.parse(cancelled.stdout) as { error: { code: string } }).error.code).toBe(
      "CLI_RUN_CANCELLED"
    );
    expect((JSON.parse(running.stdout) as { error: { code: string } }).error.code).toBe(
      "CLI_RUN_UNFINISHED"
    );
  });

  it("still puts the DIAGNOSIS on stdout under --json when the run completed", async () => {
    diagnose.mockResolvedValue(diagnoseDoc("COMPLETED"));

    const { stdout, exitCode } = await runJson(["execution", "diagnose", EXECUTION_ID]);

    expect(exitCode).toBeUndefined();
    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });
    const doc = JSON.parse(stdout) as { status?: unknown; error?: unknown };
    expect(doc.status).toBe("COMPLETED");
    expect(doc.error).toBeNull();
  });
});

describe("nexus execution poll", () => {
  it("exits NON-ZERO on a FAILED run", async () => {
    poll.mockResolvedValue(pollDoc("FAILED"));

    expect(await run(["execution", "poll", EXECUTION_ID])).toBe(EXIT_CODES["remote-error"]);
  });

  it("still exits 0 on a COMPLETED run", async () => {
    poll.mockResolvedValue(pollDoc("COMPLETED"));

    expect(await run(["execution", "poll", EXECUTION_ID])).toBeUndefined();
  });

  it("exits UNMEASURED — never the failure code — on a CANCELLED run", async () => {
    poll.mockResolvedValue(pollDoc("CANCELLED"));

    const code = await run(["execution", "poll", EXECUTION_ID]);
    expect(code).toBe(EXIT_CODES.unmeasured);
    expect(code).not.toBe(EXIT_CODES["remote-error"]);
  });

  it("exits UNMEASURED on a one-shot poll of a RUNNING run", async () => {
    // This is what makes `until nexus execution poll <id>; do sleep 5; done` a
    // wait loop rather than a no-op: RUNNING is not a pass.
    poll.mockResolvedValue(pollDoc("RUNNING"));

    expect(await run(["execution", "poll", EXECUTION_ID])).toBe(EXIT_CODES.unmeasured);
  });

  it("judges the WATCHED result, on the terminal status the loop stopped at", async () => {
    // 🚨 THE LOOP STOPS AT COMPLETED, FAILED **OR** CANCELLED. Two of the three
    // must not exit 0, and they must not exit the SAME non-zero code.
    poll.mockResolvedValue(pollDoc("FAILED"));
    expect(await run(["execution", "poll", EXECUTION_ID, "--watch"])).toBe(
      EXIT_CODES["remote-error"]
    );

    poll.mockResolvedValue(pollDoc("CANCELLED"));
    expect(await run(["execution", "poll", EXECUTION_ID, "--watch"])).toBe(EXIT_CODES.unmeasured);

    poll.mockResolvedValue(pollDoc("COMPLETED"));
    expect(await run(["execution", "poll", EXECUTION_ID, "--watch"])).toBeUndefined();
  });

  it("judges a --token poll the same way", async () => {
    // `--token` and an id reach two different SDK methods. A cure applied to one
    // of the two would pass every case above.
    pollByToken.mockResolvedValue(pollDoc("FAILED"));

    expect(await run(["execution", "poll", "--token", "tok-abc"])).toBe(EXIT_CODES["remote-error"]);
    expect(pollByToken).toHaveBeenCalledOnce();
    expect(poll).not.toHaveBeenCalled();
  });

  it("puts the ERROR document on stdout under --json when it refuses", async () => {
    poll.mockResolvedValue(pollDoc("FAILED"));

    const { stdout, exitCode } = await runJson(["execution", "poll", EXECUTION_ID]);

    expect(exitCode).toBe(EXIT_CODES["remote-error"]);
    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });
  });

  it("still puts the POLL RECORD on stdout under --json when the run completed", async () => {
    poll.mockResolvedValue(pollDoc("COMPLETED"));

    const { stdout, exitCode } = await runJson(["execution", "poll", EXECUTION_ID]);

    expect(exitCode).toBeUndefined();
    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });
    expect((JSON.parse(stdout) as { status?: unknown }).status).toBe("COMPLETED");
  });
});
