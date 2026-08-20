import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_CODES } from "../exit-codes";
import { setJsonMode } from "../output";
import { describeStdout } from "./json-one-document.scan";

/**
 * THE `tool` AND `external-tool` TEST VERBS CARRY THEIR VERDICT — BOTH WAYS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A CURE THAT REDDENS A HEALTHY RUN IS NOT A CURE. EVERY CASE HERE IS A PAIR.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Three leaves changed: `tool test`, `tool connection-status` and
 * `external-tool test`. Each asserts the failing verdict exits NON-ZERO *and*
 * the passing one still exits `0`. Asserting only the first half passes for a
 * command that refuses unconditionally, which would break every correct caller.
 *
 * ── connection-status IS THE ONE WITH FOUR STATES ───────────────────────────
 *
 * 🚨 PENDING IS NOT A FAILURE. This command's own help calls it the one state
 * that means keep polling, so a loop that read it as a failure would abandon a
 * handshake that is about to succeed — and a loop that read it as a pass would
 * proceed with a `connectionId` of `null`. It gets `unmeasured`, and the cases
 * below assert it is NEITHER of the other two.
 *
 * FAILED and EXPIRED share an exit code and never a document `code`: one is
 * diagnosed from `errorCode` and retried, the other can only be replaced.
 *
 * ── THE REAL COMMAND TREE ───────────────────────────────────────────────────
 *
 * Every assertion drives `registerToolCommands` / `registerExternalToolCommands`
 * through commander with only the SDK client replaced. A spec walking its own
 * table of expected outcomes asserts against its own fixture and stays green
 * with the defect restored.
 */
const { toolTest, pollStatus, testExternalTool } = vi.hoisted(() => ({
  toolTest: vi.fn(),
  pollStatus: vi.fn(),
  testExternalTool: vi.fn()
}));

vi.mock("../client", () => ({
  createClient: () => ({
    tools: { test: toolTest },
    toolConnection: { pollStatus },
    skills: { testExternalTool }
  }),
  timeoutSecondsToMs: (s?: number) => (s !== undefined ? s * 1000 : undefined)
}));

import { registerExternalToolCommands } from "./external-tool";
import { registerToolCommands } from "./tool";

const AGENT_ID = "33333333-3333-4333-8333-333333333333";
const TOOL_CONFIG_ID = "22222222-2222-4222-8222-222222222222";
const EXTERNAL_TOOL_ID = "11111111-1111-4111-8111-111111111111";
const HANDSHAKE_ID = "hs-abc-123";

const PASSED = { status: "success", output: { ok: true }, executionTimeMs: 12 };
const FAILED = { status: "error", output: null, error: "401 from upstream", executionTimeMs: 8 };

function handshake(status: string) {
  return {
    status,
    connectionId: status === "COMPLETED" ? "conn-1" : null,
    errorMessage: status === "FAILED" ? "the account was rejected" : null,
    errorCode: status === "FAILED" ? "PIPEDREAM_INVALID_ACCOUNT" : null,
    expiresAt: "2026-08-19T01:00:00.000Z"
  };
}

/** Build the real tree — both namespaces, so one harness drives all three leaves. */
function tree(): Command {
  const program = new Command();
  program.name("nexus").exitOverride().option("--json", "Output as JSON");
  registerToolCommands(program);
  registerExternalToolCommands(program);
  return program;
}

async function run(argv: string[]): Promise<number | undefined> {
  const program = tree();
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
  const program = tree();
  const before = process.exitCode;
  process.exitCode = undefined;
  setJsonMode(true);
  const out: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.map((a) => String(a)).join(" "));
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  // `emitDocument` diverts a SECOND document with `process.stderr.write`, not
  // `console.error`. Spying on the wrong one reads as "there was only ever one
  // document", which is the claim these cases exist to check.
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

/**
 * The two `test` leaves, driven identically.
 *
 * They call different SDK methods on different resources and return the same
 * `{ status: "success" | "error" }` shape. `it.each` over the ARGV rather than
 * over an expectation table: a table of expected codes would let one leaf drift
 * and still read green, because the table would drift with it.
 */
const TEST_LEAVES: ReadonlyArray<readonly [string, readonly string[], () => unknown]> = [
  ["tool test", ["tool", "test", AGENT_ID, TOOL_CONFIG_ID], () => toolTest],
  [
    "external-tool test",
    ["external-tool", "test", EXTERNAL_TOOL_ID, "--operation-id", "listItems"],
    () => testExternalTool
  ]
];

describe.each(TEST_LEAVES)("nexus %s", (_name, argv, stub) => {
  it("exits NON-ZERO when the platform answers status:error", async () => {
    (stub() as ReturnType<typeof vi.fn>).mockResolvedValue(FAILED);

    expect(await run([...argv])).toBe(EXIT_CODES["remote-error"]);
  });

  it("still exits 0 when the platform answers status:success", async () => {
    (stub() as ReturnType<typeof vi.fn>).mockResolvedValue(PASSED);

    expect(await run([...argv])).toBeUndefined();
  });

  it("puts the ERROR document on stdout under --json when it refuses", async () => {
    (stub() as ReturnType<typeof vi.fn>).mockResolvedValue(FAILED);

    const { stdout, exitCode } = await runJson([...argv]);

    expect(exitCode).toBe(EXIT_CODES["remote-error"]);
    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });
    const doc = JSON.parse(stdout) as { error?: { code?: unknown; message?: unknown } };
    expect(doc.error?.code).toBe("CLI_REMOTE_ERROR");
    // The platform's own reason survives into the document that replaces the
    // record — otherwise the refusal costs the caller the only useful field.
    expect(String(doc.error?.message)).toContain("401 from upstream");
  });

  it("still puts the RESULT on stdout under --json when it passes", async () => {
    (stub() as ReturnType<typeof vi.fn>).mockResolvedValue(PASSED);

    const { stdout, exitCode } = await runJson([...argv]);

    expect(exitCode).toBeUndefined();
    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });
    const doc = JSON.parse(stdout) as { status?: unknown; error?: unknown };
    expect(doc.status).toBe("success");
    expect(doc.error).toBeUndefined();
  });
});

describe("nexus tool connection-status", () => {
  it("still exits 0 on COMPLETED", async () => {
    pollStatus.mockResolvedValue(handshake("COMPLETED"));

    expect(await run(["tool", "connection-status", HANDSHAKE_ID])).toBeUndefined();
  });

  it("exits NON-ZERO on FAILED", async () => {
    pollStatus.mockResolvedValue(handshake("FAILED"));

    expect(await run(["tool", "connection-status", HANDSHAKE_ID])).toBe(EXIT_CODES["remote-error"]);
  });

  it("exits NON-ZERO on EXPIRED", async () => {
    pollStatus.mockResolvedValue(handshake("EXPIRED"));

    expect(await run(["tool", "connection-status", HANDSHAKE_ID])).toBe(EXIT_CODES["remote-error"]);
  });

  it("exits UNMEASURED — never the failure code — on PENDING", async () => {
    // 🚨 THE ARM THAT DECIDES WHETHER THIS CURE IS SAFE. PENDING is the one
    // state this command's help calls "keep polling". Reading it as a failure
    // abandons a handshake about to succeed; reading it as a pass proceeds with
    // a null connectionId.
    pollStatus.mockResolvedValue(handshake("PENDING"));

    const code = await run(["tool", "connection-status", HANDSHAKE_ID]);
    expect(code).toBe(EXIT_CODES.unmeasured);
    expect(code).not.toBe(EXIT_CODES["remote-error"]);
    expect(code).not.toBeUndefined();
  });

  it("gives FAILED, EXPIRED and PENDING three distinct document codes", async () => {
    // Two of them share an exit code. A caller that has to tell "diagnose it
    // from errorCode" from "start a new handshake" from "keep polling" reads
    // `code`, so collapsing any two of these would lose a real instruction.
    pollStatus.mockResolvedValue(handshake("FAILED"));
    const failed = await runJson(["tool", "connection-status", HANDSHAKE_ID]);
    pollStatus.mockResolvedValue(handshake("EXPIRED"));
    const expired = await runJson(["tool", "connection-status", HANDSHAKE_ID]);
    pollStatus.mockResolvedValue(handshake("PENDING"));
    const pending = await runJson(["tool", "connection-status", HANDSHAKE_ID]);

    const codeOf = (stdout: string): unknown =>
      (JSON.parse(stdout) as { error: { code: string } }).error.code;

    expect(codeOf(failed.stdout)).toBe("CLI_REMOTE_ERROR");
    expect(codeOf(expired.stdout)).toBe("CLI_HANDSHAKE_EXPIRED");
    expect(codeOf(pending.stdout)).toBe("CLI_HANDSHAKE_PENDING");
    expect(new Set([failed.stdout, expired.stdout, pending.stdout]).size).toBe(3);
  });

  it("carries errorCode and errorMessage INSIDE the document that replaces the record", async () => {
    // 🚨 A HINT THAT NAMES A FIELD THE DOCUMENT DOES NOT CARRY IS A HINT THAT
    // SENDS THE READER TO NOTHING. Under --json the error document REPLACES the
    // handshake record, so `errorCode` — the field this command's own help tells
    // a caller to branch on — has to travel inside it. Found by review; the
    // first draft pointed at the record it had just suppressed.
    pollStatus.mockResolvedValue(handshake("FAILED"));

    const { stdout } = await runJson(["tool", "connection-status", HANDSHAKE_ID]);
    const doc = JSON.parse(stdout) as { error: { message: string; hint: string } };

    expect(doc.error.message).toContain("the account was rejected");
    expect(doc.error.message).toContain("PIPEDREAM_INVALID_ACCOUNT");
    expect(doc.error.hint).toContain("errorCode");
  });

  it("prints a null errorCode as `null` rather than omitting it", async () => {
    // The help is explicit: a null errorCode beside FAILED means "read the
    // message", never "there was no error". Omitting the field would make an
    // ABSENT classification and an unclassified one look identical.
    pollStatus.mockResolvedValue({ ...handshake("FAILED"), errorCode: null });

    const { stdout } = await runJson(["tool", "connection-status", HANDSHAKE_ID]);
    const doc = JSON.parse(stdout) as { error: { message: string } };

    expect(doc.error.message).toContain("null");
  });

  it("carries expiresAt INSIDE the PENDING and EXPIRED documents", async () => {
    // Same defect, same cure: the PENDING advice is "bound your loop with the
    // expiry", which is unusable if the expiry left with the record.
    for (const status of ["PENDING", "EXPIRED"]) {
      pollStatus.mockResolvedValue(handshake(status));
      const { stdout } = await runJson(["tool", "connection-status", HANDSHAKE_ID]);
      const doc = JSON.parse(stdout) as { error: { message: string } };
      expect(doc.error.message, status).toContain("2026-08-19T01:00:00.000Z");
    }
  });

  it("still puts the RECORD on stdout under --json when the handshake COMPLETED", async () => {
    pollStatus.mockResolvedValue(handshake("COMPLETED"));

    const { stdout, exitCode } = await runJson(["tool", "connection-status", HANDSHAKE_ID]);

    expect(exitCode).toBeUndefined();
    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });
    const doc = JSON.parse(stdout) as { connectionId?: unknown; error?: unknown };
    // The connectionId IS the thing the caller came for; a cure that suppressed
    // it on the success path would satisfy every other case here.
    expect(doc.connectionId).toBe("conn-1");
    expect(doc.error).toBeUndefined();
  });

  it("puts ONE document on stdout on every non-COMPLETED status", async () => {
    for (const status of ["PENDING", "FAILED", "EXPIRED"]) {
      pollStatus.mockResolvedValue(handshake(status));
      const { stdout } = await runJson(["tool", "connection-status", HANDSHAKE_ID]);
      expect(describeStdout(stdout), status).toEqual({ documents: 1, prose: false });
      expect((JSON.parse(stdout) as { error?: unknown }).error, status).toBeDefined();
    }
  });
});
