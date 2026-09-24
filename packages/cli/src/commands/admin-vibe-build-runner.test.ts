/**
 * `nexus admin vibe-build-runner tick` — the org_at_capacity outcome.
 *
 * An operator firing ticks by hand during an incident needs to tell "this org
 * is at its build cap" from "nothing to do" and from "lost a race": each means a
 * different next move. The record has to name the org and show BOTH numbers,
 * since a count without its cap cannot say how far over or under the org is.
 */

import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminVibeBuildRunnerTickResponse } from "../admin-wire-types";
import { registerAdminCommands } from "./admin";

const BASE_URL = "https://api.test.invalid";
const TOKEN = "test-jwt";

const AT_CAPACITY: AdminVibeBuildRunnerTickResponse = {
  kind: "org_at_capacity",
  buildJobId: "job-0a1b",
  organizationId: "org_capped",
  inFlight: 3,
  cap: 2
};

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

// eslint-disable-next-line no-control-regex
const plain = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

/** Run one tick against the stubbed endpoint; the printed record, one line per entry. */
async function tick(): Promise<{ lines: string[]; exitCode: typeof process.exitCode }> {
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
    chunks.push(args.map((a) => String(a)).join(" "));
  });
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const prevExit = process.exitCode;
  process.exitCode = undefined;
  try {
    await program.parseAsync([
      "node",
      "nexus",
      "--base-url",
      BASE_URL,
      "admin",
      "--admin-token",
      TOKEN,
      "vibe-build-runner",
      "tick"
    ]);
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
  const exitCode = process.exitCode;
  process.exitCode = prevExit;
  return { lines: plain(chunks.join("\n")).split("\n"), exitCode };
}

/** The value printed on the record line labelled `label`, or a marker that there is none. */
function valueOf(lines: string[], label: string): string {
  const line = lines.find((l) => l.trimStart().startsWith(label));
  return line === undefined ? `<no "${label}" line>` : line.trimStart().slice(label.length).trim();
}

describe("nexus admin vibe-build-runner tick — org_at_capacity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names the outcome", async () => {
    stubFetch(AT_CAPACITY);

    expect(valueOf((await tick()).lines, "Outcome")).toBe("org_at_capacity");
  });

  it("names the organization at its cap", async () => {
    stubFetch(AT_CAPACITY);

    expect(valueOf((await tick()).lines, "Organization")).toBe("org_capped");
  });

  it("shows the in-flight count beside the cap it was compared with", async () => {
    stubFetch(AT_CAPACITY);

    expect(valueOf((await tick()).lines, "Builds in flight")).toBe("3 (cap 2)");
  });

  it("names the build job that stays queued", async () => {
    stubFetch(AT_CAPACITY);

    expect(valueOf((await tick()).lines, "Build job")).toBe("job-0a1b");
  });

  it("is a successful tick, not an error exit", async () => {
    stubFetch(AT_CAPACITY);

    expect((await tick()).exitCode).toBeUndefined();
  });
});
