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
/**
 * `process.stderr.write` is a THIRD stream here, and the pre-existing setup
 * discards it. `runUpgrade`'s progress lines — including the sudo warning,
 * which must land before the install — go through it rather than through
 * `console.error`, so an assertion on `stderr` alone cannot see them.
 */
let rawStderr: string[];

beforeEach(() => {
  stdout = [];
  stderr = [];
  rawStderr = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    stdout.push(args.join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    stderr.push(args.join(" "));
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    rawStderr.push(String(chunk));
    return true;
  });
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
    // Not elevated by default. Every pre-existing case in this file asserts the
    // ORDINARY outcomes, and defaulting the other way would silently move all of
    // them onto the sudo branch.
    elevatedBy: null,
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

/**
 * NEX-3939 — `sudo nexus upgrade` reports success and the version never moves.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE VERIFICATION READS THE PROCESS IT RUNS IN, AND UNDER sudo THAT IS ROOT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The install runs as root and writes root's global prefix; `resolve()` then
 * reads root's PATH. A match there is a statement about ROOT's shell. Whether it
 * is also the invoking user's depends on how sudo is configured on that machine
 * — `secure_path`, `env_keep`, `always_set_home` — none of which this command
 * can read.
 *
 * So the elevated outcomes claim strictly less than the ordinary ones. That is
 * the whole fix: not a new diagnosis, the REFUSAL of one that was never
 * established.
 *
 * ⚠️ WHAT THESE CASES DO NOT ASSERT. Nothing here claims sudo changes PATH on
 * any particular machine — it depends on sudoers and this suite cannot run sudo.
 * The claim under test is only that a match read inside a sudo'd process is not
 * reported as an upgrade for the person who typed the command.
 */
describe("runUpgrade under sudo — it must not claim an upgrade it read for root", () => {
  it("does NOT print a success when root's PATH agrees", async () => {
    await runUpgrade(
      environment({
        elevatedBy: "shady",
        resolve: () => [{ path: "/usr/local/bin/nexus", version: "0.25.0", failure: null }]
      })
    );

    const out = stderr.join("\n");
    expect(out).not.toContain("Upgraded to 0.25.0.");
    expect(out).toContain("NOT verified for shady");
    // The one command that answers it, and the warning that it must not be sudo.
    expect(out).toContain("nexus --version");
    expect(process.exitCode).toBe(3);
  });

  it("CONTROL — the SAME resolution, not elevated, IS a success at exit 0", async () => {
    // Without this the case above passes against a build that never prints a
    // success at all. The two runs differ in exactly one field.
    await runUpgrade(
      environment({
        elevatedBy: null,
        resolve: () => [{ path: "/usr/local/bin/nexus", version: "0.25.0", failure: null }]
      })
    );

    expect(stdout.join("\n")).toContain("Upgraded to 0.25.0.");
    expect(process.exitCode).toBeUndefined();
  });

  it("warns BEFORE installing, while the reader can still cancel", async () => {
    const order: string[] = [];
    await runUpgrade(
      environment({
        elevatedBy: "shady",
        install: () => {
          order.push("install");
        },
        resolve: () => {
          order.push("resolve");
          return [{ path: "/usr/local/bin/nexus", version: "0.25.0", failure: null }];
        }
      })
    );

    expect(rawStderr.join("")).toContain("Running under sudo.");
    expect(order).toEqual(["install", "resolve"]);
  });

  it("an empty resolution under sudo blames ROOT's PATH, not the user's", async () => {
    // The pre-fix wording told the reader their own PATH had no `nexus` on it
    // and to add their global bin directory — a repair for a PATH that is very
    // likely fine. The empty list is root's.
    await runUpgrade(environment({ elevatedBy: "shady", resolve: () => [] }));

    const out = stderr.join("\n");
    expect(out).toContain("ROOT's PATH");
    expect(out).toContain("not shady's");
    expect(out).not.toContain("add the global bin directory");
    expect(process.exitCode).toBe(2);
  });

  it("CONTROL — the SAME empty resolution, not elevated, still blames your PATH", async () => {
    await runUpgrade(environment({ elevatedBy: null, resolve: () => [] }));

    const out = stderr.join("\n");
    expect(out).toContain("on your PATH");
    expect(out).toContain("add the global bin directory");
    expect(process.exitCode).toBe(2);
  });

  it("the JSON code separates exit 3 from exit 2, not just the exit code", async () => {
    // Splitting the exit code and then stamping the SAME `error.code` hands a
    // --json consumer the opposite instruction: CLI_UPGRADE_NOT_RESOLVED means
    // "your shell resolves a different copy", whose remedy is a PATH edit —
    // the misdiagnosis exit 3 exists to avoid. Both channels or neither.
    setJsonMode(true);
    await runUpgrade(
      environment({
        elevatedBy: "shady",
        resolve: () => [{ path: "/usr/local/bin/nexus", version: "0.25.0", failure: null }]
      })
    );
    setJsonMode(false);

    const doc = JSON.parse(stdout.join("\n")) as { error: { code: string } };
    expect(doc.error.code).toBe("CLI_UPGRADE_NOT_VERIFIED_FOR_YOU");
    expect(process.exitCode).toBe(3);
  });

  it("CONTROL — a genuine PATH finding still carries the PATH code at exit 2", async () => {
    // Without this the case above passes against a build that renamed the code
    // for every outcome, which would lose the distinction in the other
    // direction.
    setJsonMode(true);
    await runUpgrade(
      environment({
        elevatedBy: null,
        resolve: () => [{ path: "/usr/bin/nexus", version: "0.22.4", failure: null }]
      })
    );
    setJsonMode(false);

    const doc = JSON.parse(stdout.join("\n")) as { error: { code: string } };
    expect(doc.error.code).toBe("CLI_UPGRADE_NOT_RESOLVED");
    expect(process.exitCode).toBe(2);
  });

  it("an UNREADABLE binary under sudo does not say it is the one your shell runs", async () => {
    // The headline is the sentence a reader acts on, and it was the last one
    // still attributing a root measurement to the user. Fixing only the list
    // header left the wrong owner in the loudest line.
    await runUpgrade(
      environment({
        elevatedBy: "shady",
        resolve: () => [{ path: "/usr/bin/nexus", version: null, failure: "MODULE_NOT_FOUND" }]
      })
    );

    const out = stderr.join("\n");
    expect(out).toContain("ROOT's PATH resolves will not start");
    expect(out).not.toContain("your shell runs will not start");
    expect(out).toContain("Re-run WITHOUT sudo");
  });

  it("CONTROL — the SAME unreadable binary, not elevated, still says your shell", async () => {
    await runUpgrade(
      environment({
        elevatedBy: null,
        resolve: () => [{ path: "/usr/bin/nexus", version: null, failure: "MODULE_NOT_FOUND" }]
      })
    );

    const out = stderr.join("\n");
    expect(out).toContain("your shell runs will not start");
    expect(out).not.toContain("Re-run WITHOUT sudo");
  });

  it("a shadowed resolution under sudo does NOT tell you to delete the winner", async () => {
    // The destructive sentence, on a measurement taken in the wrong environment.
    // Its twin (unreadable) already withholds it; the two outcomes giving
    // opposite safety advice about the identical reading is the defect.
    await runUpgrade(
      environment({
        elevatedBy: "shady",
        resolve: () => [{ path: "/usr/bin/nexus", version: "0.22.4", failure: null }]
      })
    );

    const out = stderr.join("\n");
    expect(out).toContain("Do NOT delete it");
    expect(out).not.toContain("The FIRST entry wins. Delete it");
  });

  it("CONTROL — the SAME shadowed resolution, not elevated, DOES say to delete it", async () => {
    // Without this, the case above passes against a build that withheld the
    // repair instruction from everyone, which would be a worse command.
    await runUpgrade(
      environment({
        elevatedBy: null,
        resolve: () => [{ path: "/usr/bin/nexus", version: "0.22.4", failure: null }]
      })
    );

    const out = stderr.join("\n");
    expect(out).toContain("The FIRST entry wins. Delete it");
    expect(out).not.toContain("Do NOT delete it");
  });

  it("a shadowed resolution under sudo says whose PATH it read", async () => {
    await runUpgrade(
      environment({
        elevatedBy: "shady",
        resolve: () => [{ path: "/usr/bin/nexus", version: "0.22.4", failure: null }]
      })
    );

    const out = stderr.join("\n");
    expect(out).toContain("ROOT's PATH resolves is still 0.22.4");
    expect(out).toContain("Re-run WITHOUT sudo to install and verify as shady.");
    expect(process.exitCode).toBe(2);
  });
});
