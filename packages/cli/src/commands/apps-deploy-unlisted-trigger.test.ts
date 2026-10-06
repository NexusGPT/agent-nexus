import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

import { CLI_OUTCOME_NOT_LISTED, installArgumentRefusalReporting } from "../errors";
import { EXIT_CODES } from "../exit-codes";
import { installJsonTerminalContract } from "../json-terminal-contract";
import { setJsonMode } from "../output";
import { describeStdout } from "./json-one-document.scan";

/**
 * `nexus apps deploy` against a backend NEWER than this binary, whose trigger
 * answers with a status this binary does not list.
 *
 * The contract reads that answer as the server's own word rather than failing
 * the parse, so the CLI receives it — and the one thing it must not do is what a
 * listed-only reader does with it: fall through to "Deployment triggered" and
 * exit 0. The deploy may or may not have been accepted; nobody here can say, so
 * the human line is the server's word marked as newer than this CLI, `--json` is
 * an error document carrying the body as received, and the exit is `unmeasured`
 * — never `success`.
 *
 * The status is spelled as two listed names joined with `_UNLISTED`, so no value
 * the contract plausibly lists later collides with it.
 */

const APP_ID = "11111111-2222-4333-8444-555555555555";
const UNLISTED_STATUS = "created_reused_UNLISTED";

const UNLISTED_ANSWER = {
  status: UNLISTED_STATUS,
  queuedBehind: "33333333-3333-4333-8333-333333333333"
};

/** The listed answer — the control that proves the haystack can carry the success line. */
const CREATED_ANSWER = {
  status: "created" as const,
  deployment: {
    id: "22222222-2222-4222-8222-222222222222",
    versionNumber: 7,
    status: "BUILDING",
    triggerSha: "1a2b3c4d5e6f",
    createdAt: "2026-10-05T10:00:00.000Z"
  },
  buildJob: { id: "44444444-4444-4444-8444-444444444444" },
  approvalRequest: null
};

const tenantRequest = vi.hoisted(() => vi.fn());

vi.mock("../util/tenant-http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../util/tenant-http")>();
  return { ...actual, tenantRequest };
});

const { registerAppsCommands } = await import("./apps");

interface Driven {
  readonly stdout: string;
  readonly exitCode: number | string | undefined;
}

/** Drive `apps deploy` on a minimal root carrying the binary's two `--json` installers. */
async function drive(json: boolean): Promise<Driven> {
  const out: string[] = [];
  const spies = [
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      out.push(args.map(String).join(" "));
    }),
    vi.spyOn(console, "error").mockImplementation(() => undefined),
    vi.spyOn(process.stdout, "write").mockImplementation((text: string | Uint8Array) => {
      out.push(typeof text === "string" ? text.replace(/\n$/, "") : "");
      return true;
    }),
    vi.spyOn(process.stderr, "write").mockImplementation(() => true)
  ];

  const previous = process.exitCode;
  process.exitCode = undefined;
  try {
    const program = new Command();
    program.name("nexus").option("--json", "Output as JSON").option("--api-key <key>", "key");
    registerAppsCommands(program);
    installArgumentRefusalReporting(program, { onSuccessfulExit: "throw" });
    installJsonTerminalContract(program);
    const argv = ["apps", "deploy", APP_ID, "--sha", "1a2b3c4", "--api-key", "nxs_stub"];
    await program.parseAsync(["node", "nexus", ...argv, ...(json ? ["--json"] : [])]);
  } finally {
    for (const spy of spies) spy.mockRestore();
    setJsonMode(false);
  }
  const exitCode = process.exitCode;
  process.exitCode = previous;
  // eslint-disable-next-line no-control-regex
  return { stdout: out.join("\n").replace(/\x1b\[[0-9;]*m/g, ""), exitCode };
}

describe("apps deploy — a trigger status this binary does not list", () => {
  it("CONTROL: a listed `created` answer prints the success line and exits clean", async () => {
    tenantRequest.mockReset();
    tenantRequest.mockResolvedValue(CREATED_ANSWER);

    const run = await drive(false);

    expect(tenantRequest).toHaveBeenCalledTimes(1);
    expect(run.stdout).toContain("Deployment triggered");
    expect(run.exitCode).toBeUndefined();
  });

  it("prints the server's own word, marked as newer than this CLI", async () => {
    tenantRequest.mockReset();
    tenantRequest.mockResolvedValue(UNLISTED_ANSWER);

    const run = await drive(false);

    expect(tenantRequest).toHaveBeenCalledTimes(1);
    expect(run.stdout).toMatch(
      new RegExp(`Outcome\\s+${UNLISTED_STATUS} — outcome not known to this CLI version`)
    );
  });

  it("never reports the deploy as triggered", async () => {
    tenantRequest.mockReset();
    tenantRequest.mockResolvedValue(UNLISTED_ANSWER);

    expect((await drive(false)).stdout).not.toContain("Deployment triggered");
  });

  it("exits `unmeasured`, never success", async () => {
    tenantRequest.mockReset();
    tenantRequest.mockResolvedValue(UNLISTED_ANSWER);

    expect((await drive(false)).exitCode).toBe(EXIT_CODES.unmeasured);
  });

  it("under --json prints ONE document", async () => {
    tenantRequest.mockReset();
    tenantRequest.mockResolvedValue(UNLISTED_ANSWER);

    expect(describeStdout((await drive(true)).stdout)).toEqual({ documents: 1, prose: false });
  });

  it("under --json that document is an error naming the unlisted outcome", async () => {
    tenantRequest.mockReset();
    tenantRequest.mockResolvedValue(UNLISTED_ANSWER);

    const document: unknown = JSON.parse((await drive(true)).stdout.trim());
    expect(document).toMatchObject({ error: { code: CLI_OUTCOME_NOT_LISTED } });
  });

  it("under --json the error carries the answer exactly as received", async () => {
    tenantRequest.mockReset();
    tenantRequest.mockResolvedValue(UNLISTED_ANSWER);

    expect((await drive(true)).stdout).toContain(
      JSON.stringify(JSON.stringify(UNLISTED_ANSWER)).slice(1, -1)
    );
  });

  it("under --json still exits `unmeasured`", async () => {
    tenantRequest.mockReset();
    tenantRequest.mockResolvedValue(UNLISTED_ANSWER);

    expect((await drive(true)).exitCode).toBe(EXIT_CODES.unmeasured);
  });
});
