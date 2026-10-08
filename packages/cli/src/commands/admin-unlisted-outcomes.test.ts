/**
 * Operator mutations against a backend NEWER than this binary, answering with an
 * outcome `kind` this binary does not list.
 *
 * The contract reads such an answer as the server's own word, so it reaches the
 * printer — and a listed-only printer would fall into its `never` default and
 * throw, or (worse, the shape a `switch` invites) print a listed outcome it
 * guessed. A tick, a force-converge: the operator must learn the server's word,
 * marked as newer than this CLI, and a script must not read `success` off an
 * outcome nobody could classify. `--json` is an error document whose hint carries
 * the outcome as received.
 *
 * Unlisted kinds are listed names joined with `_UNLISTED`, so no value the
 * contract plausibly lists later collides with one.
 */

import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CLI_OUTCOME_NOT_LISTED } from "../errors";
import { EXIT_CODES } from "../exit-codes";
import { setJsonMode } from "../output";
import { registerAdminCommands } from "./admin";

const BASE_URL = "https://api.test.invalid";

const UNLISTED_TICK = { kind: "dispatched_race_lost_UNLISTED", buildJobId: "job-0f0f" };
const LISTED_TICK = { kind: "dispatched", buildJobId: "job-0f0f" };
const UNLISTED_CONVERGE = { kind: "forced_not_converging_UNLISTED", reason: "drift" };
const LISTED_CONVERGE = { kind: "forced", reason: "drift" };
const UNLISTED_SERVER_ROLL = {
  kind: "requested_UNLISTED",
  requestedAt: "2026-10-08T09:30:00.000Z"
};
const LISTED_SERVER_ROLL = {
  kind: "requested",
  requestedAt: "2026-10-08T09:30:00.000Z",
  reason: "verify"
};

const TICK_ARGV = ["vibe-build-runner", "tick"];
const CONVERGE_ARGV = ["vibe-tenant-cluster", "force-converge", "org_abc", "--reason", "drift"];
const SERVER_ROLL_ARGV = [
  "vibe-tenant-cluster",
  "request-server-roll",
  "org_abc",
  "--reason",
  "verify"
];

function stubFetch(data: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ success: true, data }))
    })
  );
}

interface Driven {
  readonly stdout: string;
  readonly exitCode: number | string | undefined;
}

async function drive(argv: readonly string[], json = false): Promise<Driven> {
  const program = new Command();
  program
    .name("nexus")
    .option("--json", "Output as JSON")
    .option("--base-url <url>", "API base URL")
    .option("--profile <name>", "Profile")
    .exitOverride();
  registerAdminCommands(program);

  const chunks: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    chunks.push(args.map(String).join(" "));
  });
  const outSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((text: string | Uint8Array) => {
      chunks.push(typeof text === "string" ? text : "");
      return true;
    });
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const prevExit = process.exitCode;
  process.exitCode = undefined;
  setJsonMode(json);
  try {
    await program.parseAsync([
      "node",
      "nexus",
      "--base-url",
      BASE_URL,
      "admin",
      "--admin-token",
      "test-jwt",
      ...argv
    ]);
  } finally {
    logSpy.mockRestore();
    outSpy.mockRestore();
    errSpy.mockRestore();
    setJsonMode(false);
  }
  const exitCode = process.exitCode;
  process.exitCode = prevExit;
  // eslint-disable-next-line no-control-regex
  return { stdout: chunks.join("\n").replace(/\x1b\[[0-9;]*m/g, ""), exitCode };
}

const NOT_KNOWN = "outcome not known to this CLI version";

describe.each([
  { verb: "vibe-build-runner tick", argv: TICK_ARGV, listed: LISTED_TICK, unlisted: UNLISTED_TICK },
  {
    verb: "vibe-tenant-cluster force-converge",
    argv: CONVERGE_ARGV,
    listed: LISTED_CONVERGE,
    unlisted: UNLISTED_CONVERGE
  },
  {
    verb: "vibe-tenant-cluster request-server-roll",
    argv: SERVER_ROLL_ARGV,
    listed: LISTED_SERVER_ROLL,
    unlisted: UNLISTED_SERVER_ROLL
  }
])(
  "nexus admin $verb — an outcome kind this binary does not list",
  ({ argv, listed, unlisted }) => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("CONTROL: a listed outcome prints its own line and exits clean", async () => {
      stubFetch(listed);

      const run = await drive(argv);

      expect(run.stdout).toContain(listed.kind);
      expect(run.stdout).not.toContain(NOT_KNOWN);
      expect(run.exitCode).toBeUndefined();
    });

    it("prints the server's own word as the outcome, marked as newer than this CLI", async () => {
      stubFetch(unlisted);

      expect((await drive(argv)).stdout).toMatch(
        new RegExp(`Outcome\\s+${unlisted.kind} — ${NOT_KNOWN}`)
      );
    });

    it("prints every other field the server sent, under its own name", async () => {
      stubFetch(unlisted);

      const { stdout } = await drive(argv);
      const [field, value] = Object.entries(unlisted).find(([key]) => key !== "kind") ?? ["", ""];

      expect(stdout).toMatch(new RegExp(`${field}\\s+${value}`));
    });

    it("exits `unmeasured`, never success", async () => {
      stubFetch(unlisted);

      expect((await drive(argv)).exitCode).toBe(EXIT_CODES.unmeasured);
    });

    it("under --json prints an error document naming the unlisted outcome", async () => {
      stubFetch(unlisted);

      const document: unknown = JSON.parse((await drive(argv, true)).stdout.trim());
      expect(document).toMatchObject({ error: { code: CLI_OUTCOME_NOT_LISTED } });
    });

    it("under --json that error carries the outcome exactly as received", async () => {
      stubFetch(unlisted);

      expect((await drive(argv, true)).stdout).toContain(
        JSON.stringify(JSON.stringify(unlisted)).slice(1, -1)
      );
    });

    it("under --json still exits `unmeasured`", async () => {
      stubFetch(unlisted);

      expect((await drive(argv, true)).exitCode).toBe(EXIT_CODES.unmeasured);
    });
  }
);
