import type { RetryNotice } from "@agent-nexus/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { reportRetryOnStderr } from "./client";

/**
 * A retry notice must reach the user WITHOUT corrupting `--json`.
 *
 * `--json` promises exactly one parseable document on stdout. A progress line
 * written there breaks every `| jq` in every script the CLI was put into, and it
 * breaks it intermittently — only on the runs that happened to be rate limited,
 * which is precisely when a script is least likely to be watched.
 *
 * So the assertion is not "it printed something". It is that stdout received
 * NOTHING, on every case, which is the half a happy-path test would skip.
 */

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  });
  return { stdout, stderr };
}

const BASE: RetryNotice = {
  method: "GET",
  url: "https://api.nexusgpt.io/api/public/v1/agents",
  attempt: 1,
  maxAttempts: 3,
  status: 429,
  delayMs: 2_000,
  statedByServer: true
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the retry notice", () => {
  it("writes to stderr and leaves stdout completely untouched", () => {
    const { stdout, stderr } = capture();

    reportRetryOnStderr(BASE);

    expect(stdout).toEqual([]);
    expect(stderr).toHaveLength(1);
  });

  it("names the wait, the cause, the source and the attempt", () => {
    const { stderr } = capture();

    reportRetryOnStderr(BASE);

    const line = stderr.join("");
    expect(line).toContain("2s");
    expect(line).toContain("HTTP 429");
    expect(line).toContain("requested by the server");
    // `attempt` is which retry this is, so the attempt about to be MADE is one
    // more. Off by one here reads as the CLI having skipped a try.
    expect(line).toContain("attempt 2 of 3");
  });

  it("calls a backoff a backoff, so a rate limit is not mistaken for a flapping upstream", () => {
    const { stderr } = capture();

    reportRetryOnStderr({ ...BASE, statedByServer: false, delayMs: 249, status: 502 });

    const line = stderr.join("");
    expect(line).toContain("backoff");
    expect(line).toContain("HTTP 502");
    expect(line).not.toContain("requested by the server");
  });

  it("says the connection failed when there was no response to carry a status", () => {
    const { stdout, stderr } = capture();

    reportRetryOnStderr({ ...BASE, status: undefined, statedByServer: false });

    expect(stdout).toEqual([]);
    expect(stderr.join("")).toContain("connection failed");
    // `HTTP undefined` is the shape this guards against.
    expect(stderr.join("")).not.toContain("undefined");
  });
});
