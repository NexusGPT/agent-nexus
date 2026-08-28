import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_CODES } from "../exit-codes";
import { judgeNodeTest } from "../node-test-verdict";
import { setJsonMode } from "../output";
import { describeStdout } from "./json-one-document.scan";

/**
 * THE `workflow` NAMESPACE CARRIES ITS VERDICT IN ITS EXIT CODE — BOTH WAYS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A CURE THAT REDDENS A HEALTHY RUN IS NOT A CURE. EVERY CASE HERE IS A PAIR.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Three leaves changed: `workflow validate`, `workflow test-node` and
 * `workflow node test`. For each one this file asserts the failing verdict exits
 * NON-ZERO *and* the passing verdict still exits `0`. Asserting only the first
 * half passes for a command that refuses unconditionally, which would break every
 * correct caller — so the second half is the one that keeps this change shippable.
 *
 * ── THE REAL COMMAND TREE, NOT A LIST WRITTEN IN THIS FILE ──────────────────
 *
 * 🚨 EVERY ASSERTION BELOW DRIVES `registerWorkflowCommands` THROUGH COMMANDER,
 * WITH ONLY THE SDK CLIENT REPLACED. A spec that walked its own table of
 * expected outcomes would assert against its own fixture and stay green with the
 * defect restored — measured on the sibling change this one follows. The only
 * thing stubbed here is the network; the parsing, the action body, the printers
 * and the exit assignment are the shipped ones.
 *
 * ── WHY `process.exitCode` AND NOT A THROWN ERROR ───────────────────────────
 *
 * Every action in this package ends with
 * `catch (err) { process.exitCode = handleError(err) }`, so a command that
 * refuses does it by ASSIGNMENT and returns normally. `reportFailure` and
 * `printFailure` only PRINT — a bare call emits a perfect error document and
 * exits `0`, which is the whole defect class being drained. Reading
 * `process.exitCode` after the parse is therefore the only observation that can
 * tell the cure from the disease.
 */
const { validate, testNode } = vi.hoisted(() => ({
  validate: vi.fn(),
  testNode: vi.fn()
}));

vi.mock("../client", () => ({
  createClient: () => ({ workflows: { validate, testNode } }),
  timeoutSecondsToMs: (s?: number) => (s !== undefined ? s * 1000 : undefined)
}));

import { registerWorkflowCommands } from "./workflow";

const WORKFLOW_ID = "11111111-1111-4111-8111-111111111111";
const NODE_ID = "node-456";

/** A report with no errors. `warnings` is populated on purpose — see below. */
const VALID_REPORT = {
  isValid: true,
  readyToTest: true,
  readyToPublish: false,
  hasCriticalErrors: false,
  errors: [],
  warnings: [{ nodeId: "workflow", nodeType: "workflow", message: "No output node." }],
  nodeStatuses: {},
  graphIssues: [],
  variableIssues: []
};

const INVALID_REPORT = {
  ...VALID_REPORT,
  isValid: false,
  errors: [
    {
      nodeId: "node-1",
      nodeType: "aiTask",
      nodeLabel: "Summarize",
      field: "variables",
      message: "Invalid variable references: {{ghost.field}}",
      severity: "error" as const
    }
  ]
};

/** The sync success arm: the executor's output, and no error keys. */
const NODE_PASSED = {
  executionId: "exec-1",
  status: "COMPLETED",
  data: { rows: [{ id: 1 }] }
};

/**
 * The sync FAILURE arm, carrying `status: "COMPLETED"` DELIBERATELY.
 *
 * A current server reports `"FAILED"` here (NEX-4066), so this fixture is the
 * older shape on purpose, and it is kept for two reasons. A published CLI talks
 * to whatever server an organization runs, so the shape that stamped COMPLETED
 * on a thrown node is still reachable in the field. And it is the sharpest
 * possible check that the verdict is read from `data`: the run-level field says
 * the run finished, the node threw, and this must still exit non-zero.
 *
 * Do not "modernise" this to `"FAILED"` — that would make the case pass for the
 * wrong reason and delete the only test that pins the rule.
 */
const NODE_FAILED = {
  executionId: "exec-2",
  status: "COMPLETED",
  data: {
    error: "Missing required parameter: channel",
    errorDetails: { message: "Missing required parameter: channel", type: "ExecutionError" },
    timestamp: "2026-08-19T00:00:00.000Z"
  }
};

/** The async arm: dispatched to the background, nothing measured. */
const NODE_PENDING = {
  executionId: "exec-3",
  status: "PENDING",
  data: null
};

/**
 * Run the real `workflow` tree and report the exit code it assigned.
 *
 * `process.exitCode` is saved and restored: vitest reads it when the process
 * ends, so leaking a non-zero one here would fail the whole run for reasons
 * nothing in this file is about.
 */
async function runWorkflow(argv: string[], json = false): Promise<number | undefined> {
  const program = new Command();
  program.name("nexus").exitOverride().option("--json", "Output as JSON");
  registerWorkflowCommands(program);

  const before = process.exitCode;
  process.exitCode = undefined;
  if (json) setJsonMode(true);

  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  try {
    await program.parseAsync(["node", "nexus", ...(json ? ["--json"] : []), ...argv]);
    return process.exitCode;
  } finally {
    log.mockRestore();
    error.mockRestore();
    write.mockRestore();
    if (json) setJsonMode(false);
    process.exitCode = before;
  }
}

/**
 * The same drive, under `--json`, reporting STDOUT as a caller reads it.
 *
 * 🚨 `console.log` IS THE ONLY STDOUT DOOR THE PRINTERS USE, AND `emitDocument`
 * DIVERTS A SECOND DOCUMENT WITH `process.stderr.write`. Spying on the wrong one
 * reads as "there was only ever one document", which is the claim these cases
 * exist to check.
 */
async function captureJson(
  argv: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number | undefined }> {
  const program = new Command();
  program.name("nexus").exitOverride().option("--json", "Output as JSON");
  registerWorkflowCommands(program);

  const before = process.exitCode;
  process.exitCode = undefined;
  setJsonMode(true);

  const out: string[] = [];
  const err: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.map((a) => String(a)).join(" "));
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const write = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown): boolean => {
    err.push(String(chunk));
    return true;
  });

  try {
    await program.parseAsync(["node", "nexus", "--json", ...argv]);
    return { stdout: out.join("\n"), stderr: err.join(""), exitCode: process.exitCode };
  } finally {
    log.mockRestore();
    error.mockRestore();
    write.mockRestore();
    setJsonMode(false);
    process.exitCode = before;
  }
}

/**
 * The two spellings, driven identically.
 *
 * 🚨 `describe.each` OVER THE ARGV, NEVER OVER AN EXPECTATION TABLE. The point of
 * every block below is that `workflow test-node` and `workflow node test` reach
 * the SAME exit code for the SAME response — a table of expected codes written
 * here would let one spelling drift and still read green, because the table would
 * drift with it.
 */
const SPELLINGS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["workflow test-node", ["workflow", "test-node", WORKFLOW_ID, NODE_ID]],
  ["workflow node test", ["workflow", "node", "test", WORKFLOW_ID, NODE_ID]]
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("nexus workflow validate", () => {
  it("exits NON-ZERO when the workflow has errors", async () => {
    validate.mockResolvedValue(INVALID_REPORT);

    expect(await runWorkflow(["workflow", "validate", WORKFLOW_ID])).toBe(
      EXIT_CODES["remote-error"]
    );
  });

  it("still exits 0 when the workflow is valid", async () => {
    validate.mockResolvedValue(VALID_REPORT);

    expect(await runWorkflow(["workflow", "validate", WORKFLOW_ID])).toBeUndefined();
  });

  it("does NOT fail on warnings — a warning is not an error", async () => {
    // ⚠️ THE ASSERTION THAT KEEPS THE CURE HONEST. `VALID_REPORT` carries a
    // warning, and the ledger entry for `workflow.validate warnings` exists
    // precisely because the scan cannot tell a warning list from an error list
    // by its name. A cure that exited on `warnings.length` would pass every
    // other test in this file and refuse workflows that publish today.
    validate.mockResolvedValue({ ...VALID_REPORT, warnings: [...VALID_REPORT.warnings] });

    expect(VALID_REPORT.warnings.length).toBeGreaterThan(0);
    expect(await runWorkflow(["workflow", "validate", WORKFLOW_ID])).toBeUndefined();
  });

  it("does NOT fail on readyToPublish:false alone", async () => {
    // `validate --help` records that a workflow with no trigger collects
    // warnings only and STILL PUBLISHES, while `readyToPublish` reads false for
    // it. Gating on that field would redden a workflow the platform accepts.
    validate.mockResolvedValue({ ...VALID_REPORT, readyToPublish: false, readyToTest: false });

    expect(await runWorkflow(["workflow", "validate", WORKFLOW_ID])).toBeUndefined();
  });

  it("puts the ERROR document on stdout under --json when it refuses", async () => {
    // 🚨 THE SHAPE `json-one-document.scan.ts` CALLS `error-masked`, AND IT IS
    // WHAT THIS COMMAND DID FIRST. Printing the report and THEN refusing takes
    // stdout with the payload, `emitDocument`'s first-wins rule diverts the
    // refusal to stderr, and a consumer reading stdout sees a document that
    // parses cleanly and never says the workflow is broken. One document, and it
    // has to be the error one.
    validate.mockResolvedValue(INVALID_REPORT);

    const { stdout, exitCode } = await captureJson(["workflow", "validate", WORKFLOW_ID]);

    expect(exitCode).toBe(EXIT_CODES["remote-error"]);
    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });
    const doc = JSON.parse(stdout) as { error?: { code?: unknown } };
    expect(doc.error?.code).toBe("CLI_REMOTE_ERROR");
  });

  it("still puts the REPORT on stdout under --json when the workflow is valid", async () => {
    // The other half. A cure that suppressed the payload on the success path
    // would satisfy the assertion above and destroy the command.
    validate.mockResolvedValue(VALID_REPORT);

    const { stdout, exitCode } = await captureJson(["workflow", "validate", WORKFLOW_ID]);

    expect(exitCode).toBeUndefined();
    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });
    const doc = JSON.parse(stdout) as { isValid?: unknown; error?: unknown };
    expect(doc.isValid).toBe(true);
    expect(doc.error).toBeUndefined();
  });
});

describe.each(SPELLINGS)("nexus %s --json", (_name, argv) => {
  it("puts the ERROR document on stdout when the node failed", async () => {
    testNode.mockResolvedValue(NODE_FAILED);

    const { stdout, exitCode } = await captureJson([...argv]);

    expect(exitCode).toBe(EXIT_CODES["remote-error"]);
    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });
    expect((JSON.parse(stdout) as { error?: { code?: unknown } }).error?.code).toBe(
      "CLI_REMOTE_ERROR"
    );
  });

  it("puts the ERROR document on stdout when nothing was measured", async () => {
    testNode.mockResolvedValue(NODE_PENDING);

    const { stdout, exitCode } = await captureJson([...argv]);

    expect(exitCode).toBe(EXIT_CODES.unmeasured);
    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });
    // A distinct code, so a `--json` consumer can tell "the node is broken" from
    // "nobody has measured it yet" without reading prose.
    expect((JSON.parse(stdout) as { error?: { code?: unknown } }).error?.code).toBe(
      "CLI_NODE_TEST_NOT_MEASURED"
    );
  });

  it("still puts the RESULT on stdout when the node passed", async () => {
    testNode.mockResolvedValue(NODE_PASSED);

    const { stdout, exitCode } = await captureJson([...argv]);

    expect(exitCode).toBeUndefined();
    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });
    expect((JSON.parse(stdout) as { error?: unknown }).error).toBeUndefined();
  });
});

describe.each(SPELLINGS)("nexus %s", (_name, argv) => {
  it("exits NON-ZERO when the NODE failed under a COMPLETED run", async () => {
    // The double false green. `status` says COMPLETED; the node threw. A cure
    // that mapped `status` straight to an exit code would exit 0 here, which is
    // the gate that says PASS on a failure.
    testNode.mockResolvedValue(NODE_FAILED);

    expect(await runWorkflow([...argv])).toBe(EXIT_CODES["remote-error"]);
  });

  it("still exits 0 when the node passed", async () => {
    testNode.mockResolvedValue(NODE_PASSED);

    expect(await runWorkflow([...argv])).toBeUndefined();
  });

  it("exits UNMEASURED — not a failure — when the test went asynchronous", async () => {
    testNode.mockResolvedValue(NODE_PENDING);

    const code = await runWorkflow([...argv]);
    expect(code).toBe(EXIT_CODES.unmeasured);
    // Named apart from the failure on purpose: a caller must not go and debug a
    // node that has not run yet.
    expect(code).not.toBe(EXIT_CODES["remote-error"]);
  });

  it("sends the same request and reaches the same code as its twin", async () => {
    testNode.mockResolvedValue(NODE_FAILED);
    await runWorkflow([...argv]);

    expect(testNode).toHaveBeenCalledOnce();
    expect(testNode.mock.calls[0][0]).toBe(WORKFLOW_ID);
    expect(testNode.mock.calls[0][1]).toBe(NODE_ID);
  });
});

/**
 * The judgement itself, on the arms the command tree cannot cheaply reach.
 *
 * ⚠️ THESE ARE NOT A SUBSTITUTE FOR THE DRIVEN CASES ABOVE. They exist because
 * the failing payload has several legal spellings and driving each one through
 * commander would assert the same wiring eight times over.
 */
describe("judgeNodeTest", () => {
  it("reads `data.errorDetails.message` when `error` is absent", () => {
    expect(
      judgeNodeTest({
        executionId: "e",
        status: "COMPLETED",
        data: { errorDetails: { message: "boom" } },
        metadata: null
      })
    ).toEqual({ outcome: "node-failed", message: "boom" });
  });

  it("still FAILS a node whose error carries no message", () => {
    // A failure whose text did not survive is still a failure. Falling back to
    // `passed` here would report a broken node as green because its error was
    // malformed — the false green in its purest form.
    const verdict = judgeNodeTest({
      executionId: "e",
      status: "COMPLETED",
      data: { errorDetails: {} },
      metadata: null
    });

    expect(verdict.outcome).toBe("node-failed");
  });

  it.each([
    ["null", null],
    ["false", false],
    ["zero", 0],
    ["an empty string", ""]
  ])("does NOT read a FALSY `error` of %s as a failure", (_label, value) => {
    // 🚨 THE DIVERGENCE THAT MAKES THE WHOLE "ONE RULE, TWO SURFACES" CLAIM
    // FALSE. The builder's test panel asks `runOutput?.error ||
    // runOutput?.errorDetails` — TRUTHY. A presence test (`!== undefined`) reads
    // `{ error: null }`, a common success envelope, as a failed node: the screen
    // shows a pass and the CLI exits non-zero for the same run. Found by review,
    // not by any mutation here — every mutation drove the shape the author had
    // already thought of.
    expect(
      judgeNodeTest({
        executionId: "e",
        status: "COMPLETED",
        data: { error: value },
        metadata: null
      })
    ).toEqual({ outcome: "passed" });
    expect(
      judgeNodeTest({
        executionId: "e",
        status: "COMPLETED",
        data: { errorDetails: value },
        metadata: null
      })
    ).toEqual({ outcome: "passed" });
  });

  it("STILL fails on the falsy-`error` shape when errorDetails is real", () => {
    // The other half: loosening to truthiness must not lose the real failure.
    // The platform's failing arm writes `errorDetails` as an object, always.
    expect(
      judgeNodeTest({
        executionId: "e",
        status: "COMPLETED",
        data: { error: null, errorDetails: { message: "boom" } },
        metadata: null
      })
    ).toEqual({ outcome: "node-failed", message: "boom" });
  });

  it("does not invent a failure from a node whose OUTPUT is not an object", () => {
    expect(
      judgeNodeTest({ executionId: "e", status: "COMPLETED", data: "some text", metadata: null })
    ).toEqual({
      outcome: "passed"
    });
    expect(
      judgeNodeTest({ executionId: "e", status: "COMPLETED", data: [1, 2, 3], metadata: null })
    ).toEqual({
      outcome: "passed"
    });
  });

  it("treats a status this CLI does not know as UNMEASURED, never as a pass", () => {
    expect(
      judgeNodeTest({ executionId: "e", status: "QUEUED", data: null, metadata: null })
    ).toEqual({
      outcome: "not-finished",
      status: "QUEUED"
    });
  });
});
