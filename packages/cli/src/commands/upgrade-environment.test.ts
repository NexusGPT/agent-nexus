import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";
import { runUpgrade, type UpgradeEnvironment } from "./upgrade";

/**
 * The injectable seam `nexus upgrade` is built on.
 *
 * `upgrade-verifies-what-it-claims.test.ts` drives the real command against a
 * real PATH and is the proof the defect is gone. This file drives the same
 * function with the PATH lookup itself injected, which is the only way to
 * exercise a verdict that no fixture on this machine can produce — a resolved
 * binary NEWER than the registry's latest, say.
 */

let stdout: string[];
let stderr: string[];

beforeEach(() => {
  stdout = [];
  stderr = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    stdout.push(args.join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    stderr.push(args.join(" "));
  });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  process.exitCode = undefined;
  setJsonMode(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  setJsonMode(false);
});

function environment(overrides: Partial<UpgradeEnvironment> = {}): UpgradeEnvironment {
  return {
    currentVersion: "0.22.4",
    fetchLatest: () => Promise.resolve("0.25.0"),
    installCommand: () => "pnpm add -g @agent-nexus/cli@latest",
    install: () => undefined,
    resolve: () => [{ path: "/usr/local/bin/nexus", version: "0.25.0", failure: null }],
    ...overrides
  };
}

describe("runUpgrade", () => {
  it("names the install command it actually ran, in the failure it prints", async () => {
    await runUpgrade(
      environment({
        installCommand: () => "yarn global add @agent-nexus/cli@latest",
        resolve: () => [{ path: "/Users/x/.yarn/bin/nexus", version: "0.22.4", failure: null }]
      })
    );

    expect(stderr.join("\n")).toMatch(/yarn global add @agent-nexus\/cli@latest/);
    expect(process.exitCode).toBe(2);
  });

  it("accepts a resolved binary NEWER than the registry's latest", async () => {
    // A pre-release build is a correct machine, not a shadowed one. Reporting
    // it as shadowed would send someone to repair a PATH that is right.
    await runUpgrade(
      environment({
        resolve: () => [{ path: "/usr/local/bin/nexus", version: "0.26.0", failure: null }]
      })
    );

    expect(process.exitCode).toBeUndefined();
    expect(stdout.join("\n")).toMatch(/Upgraded to 0\.25\.0/);
  });

  it("does not resolve anything at all when the CLI is already current", async () => {
    // Control on the ordering: verification is a statement about an install,
    // and there was no install. A resolve here would be a spawn nobody needs.
    const resolve = vi.fn(() => []);

    await runUpgrade(environment({ currentVersion: "0.25.0", resolve }));

    expect(resolve).not.toHaveBeenCalled();
    expect(stdout.join("\n")).toMatch(/Already up-to-date/);
  });

  it("does not resolve anything when the install itself threw", async () => {
    // Same ordering rule from the other side: a failed install has nothing to
    // verify, and reporting a stale PATH after one would name the wrong cause.
    const resolve = vi.fn(() => []);

    await runUpgrade(
      environment({
        install: () => {
          throw new Error("EACCES");
        },
        resolve
      })
    );

    expect(resolve).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
