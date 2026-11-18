import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

import { installArgumentRefusalReporting } from "../errors";
import { installJsonTerminalContract } from "../json-terminal-contract";
import { setJsonMode } from "../output";
import { describeStdout } from "./json-one-document.scan";

/**
 * A REFUSAL MUST NOT WEAR A SUCCESS SHAPE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS BRANCH IS INVISIBLE TO BOTH `--json` GATES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus apps deploy` answers the spend soft-limit by ASKING. Non-interactively —
 * a pipe, CI, or `--json` — it must never auto-confirm, so it prints the situation
 * and exits non-zero having deployed nothing. Under `--json` it printed
 * `JSON.stringify(data)`: the raw `confirmation_required` payload, on STDOUT, in
 * the shape a SUCCESSFUL deploy uses. The remedy went to stderr. So a script
 * parsing stdout received a normal deployment document for a deploy that did not
 * happen, and the root epilogue promises the opposite — "Under --json an error is
 * a JSON document on STDOUT".
 *
 * Neither gate reaches it, and the reasons are structural rather than incidental:
 *
 *   - `json-one-document.test.ts` parses stdout and finds ONE well-formed
 *     document, which is `clean` by that gate's definition. The defect is the
 *     document's MEANING, not its count.
 *   - `json-error-document.static-scan.ts` hunts refusals that print PROSE or
 *     nothing. This one printed neither.
 *
 * So the branch is driven here, by hand, with the server's answer stubbed — the
 * one shape a caller can never produce from argv.
 */

const APP_ID = "11111111-2222-4333-8444-555555555555";

const CONFIRMATION_REQUIRED = {
  status: "confirmation_required" as const,
  reason: {
    costSafetyStatus: "OVER_SOFT_LIMIT",
    message: "This organization is over its Vibe usage cap for the current period."
  }
};

const tenantRequest = vi.hoisted(() => vi.fn());

vi.mock("../util/tenant-http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../util/tenant-http")>();
  return { ...actual, tenantRequest };
});

// 🚨 A HANG IS WORSE THAN A RED, AND WITHOUT THIS A REGRESSION HERE PRODUCES A
// HANG. Both cases below must reach the spend gate's NO-TERMINAL refusal. Let a
// change send them to the question instead and the real `readline` opens an
// interface on the runner's stdin and waits for a keystroke that never arrives —
// the file blocks until CI's job timeout, with no failing assertion anywhere to
// read. Measured while building this gate's battery: inverting the gate's
// condition did exactly that, and the run had to be killed by hand.
//
// Refusing here converts that silence into a named failure. This mock is not a
// stand-in for a question these cases are allowed to ask; it is the assertion
// that they never ask one.
vi.mock("node:readline/promises", () => ({
  createInterface: () => {
    throw new Error("the spend gate reached readline — with no terminal it must refuse, never ask");
  }
}));

const { registerAppsCommands } = await import("./apps");

interface Driven {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | undefined;
}

/**
 * Drive `apps deploy` on a minimal root that carries the same two installers the
 * real program does, so `--json` is resolved from argv exactly as the binary
 * resolves it. Building the whole tree here would work and would also make this
 * spec fail for reasons that have nothing to do with the branch it is about.
 */
async function drive(argv: readonly string[]): Promise<Driven> {
  const out: string[] = [];
  const err: string[] = [];
  const realLog = console.log;
  const realError = console.error;
  const realStdoutWrite = process.stdout.write.bind(process.stdout);
  const realStderrWrite = process.stderr.write.bind(process.stderr);

  console.log = (...args: unknown[]): void => void out.push(args.map(String).join(" "));
  console.error = (...args: unknown[]): void => void err.push(args.map(String).join(" "));
  process.stdout.write = ((text: string | Uint8Array): boolean => {
    out.push(typeof text === "string" ? text.replace(/\n$/, "") : "");
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((text: string | Uint8Array): boolean => {
    err.push(typeof text === "string" ? text.replace(/\n$/, "") : "");
    return true;
  }) as typeof process.stderr.write;

  const previous = process.exitCode;
  process.exitCode = undefined;

  // 🚨 PINNED, NOT INHERITED. The spend gate refuses on `!process.stdin.isTTY`
  // and on nothing else, so both cases below reach their refusal through THIS
  // property. The runner's ambient value is `undefined`, which happens to be
  // falsy — so leaving it unset passes for a reason no line in this file states,
  // and a runner that ever attached a TTY would send both cases into `readline`,
  // which nothing here mocks: a hang rather than a failure. Stating it costs two
  // lines and removes the dependency on the harness.
  const realStdinIsTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  Object.defineProperty(process.stdin, "isTTY", {
    value: false,
    configurable: true,
    writable: true
  });

  try {
    const program = new Command();
    program.name("nexus").option("--json", "Output as JSON").option("--api-key <key>", "key");
    registerAppsCommands(program);
    installArgumentRefusalReporting(program, { onSuccessfulExit: "throw" });
    installJsonTerminalContract(program);
    await program.parseAsync(["node", "nexus", ...argv]);
  } finally {
    console.log = realLog;
    console.error = realError;
    process.stdout.write = realStdoutWrite;
    process.stderr.write = realStderrWrite;
    setJsonMode(false);
    if (realStdinIsTty === undefined) {
      delete (process.stdin as { isTTY?: boolean }).isTTY;
    } else {
      Object.defineProperty(process.stdin, "isTTY", realStdinIsTty);
    }
  }

  const exitCode = process.exitCode;
  process.exitCode = previous;
  return { stdout: out.join("\n"), stderr: err.join("\n"), exitCode };
}

interface ErrorDocument {
  readonly error: { readonly message: string; readonly hint: string | null; readonly code: string };
}

describe("apps deploy refuses the spend gate with an ERROR document under --json", () => {
  it("puts the documented envelope on stdout, never the confirmation payload", async () => {
    tenantRequest.mockReset();
    tenantRequest.mockResolvedValue(CONFIRMATION_REQUIRED);

    const run = await drive([
      "apps",
      "deploy",
      APP_ID,
      "--sha",
      "1a2b3c4",
      "--api-key",
      "nxs_stub",
      "--json"
    ]);

    // CONTROL, first: a run that never reached the server would leave every
    // assertion below describing a command that was not exercised.
    expect(tenantRequest).toHaveBeenCalledTimes(1);

    expect(describeStdout(run.stdout)).toEqual({ documents: 1, prose: false });

    const document = JSON.parse(run.stdout.trim()) as ErrorDocument;
    expect(Object.keys(document.error).sort()).toEqual(["code", "hint", "message"]);
    // The failure happened AFTER the request was accepted, so it is not an
    // argument refusal. `CLI_INVALID_ARGUMENTS` here would tell a script to stop
    // retrying something that is retryable once the cap resets.
    expect(document.error.code).toBe("CLI_REMOTE_ERROR");
    expect(document.error.message).toContain("nothing was deployed");
    // The figures the operator needs ride in the hint, because one run prints
    // one document and the document is the refusal.
    expect(document.error.hint).toContain("OVER_SOFT_LIMIT");
    expect(document.error.hint).toContain("--confirm-overage");

    // 🚨 THE HALF THE OLD CODE GOT WRONG. The payload's own key must not be on
    // stdout at all — a consumer reading `.status` got "confirmation_required"
    // where a successful deploy would have put "created", which is the same
    // field carrying two opposite meanings.
    expect(run.stdout).not.toContain("confirmation_required");

    expect(run.exitCode).toBe(1);
  });

  it("still prints the human preamble and exits non-zero WITHOUT --json", async () => {
    tenantRequest.mockReset();
    tenantRequest.mockResolvedValue(CONFIRMATION_REQUIRED);

    const run = await drive([
      "apps",
      "deploy",
      APP_ID,
      "--sha",
      "1a2b3c4",
      "--api-key",
      "nxs_stub"
    ]);

    expect(tenantRequest).toHaveBeenCalledTimes(1);
    expect(`${run.stdout}${run.stderr}`).toContain("--confirm-overage");
    expect(run.exitCode).toBe(1);
  });
});
