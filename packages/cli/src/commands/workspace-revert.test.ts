import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

const revert = vi.fn();
const list = vi.fn();
const fakeClient = { workspaces: { revert, list } };

// PARTIAL, via `importOriginal`: `workspace.ts` reads the `seconds` brand
// constructor off this module at load, and a total mock makes the suite fail
// to COLLECT — which reports as no tests, not as a red.
vi.mock("../client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../client")>()),
  createClient: () => fakeClient
}));

import { registerWorkspaceCommands } from "./workspace";

async function run(
  argv: string[],
  json = false
): Promise<{
  out: string;
  err: string;
  exitCode: typeof process.exitCode;
  /** What commander threw under `exitOverride` — a missing required option lands here, not in `exitCode`. */
  parseError: unknown;
}> {
  const program = new Command();
  program.name("nexus").option("--json", "Output as JSON").exitOverride();
  registerWorkspaceCommands(program);

  if (json) setJsonMode(true);
  const chunks: string[] = [];
  const errChunks: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    chunks.push(args.map((a) => String(a)).join(" "));
  });
  const errSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errChunks.push(args.map((a) => String(a)).join(" "));
  });
  const prevExit = process.exitCode;
  process.exitCode = undefined;
  let parseError: unknown = null;
  try {
    await program.parseAsync(["node", "nexus", ...(json ? ["--json"] : []), ...argv]);
  } catch (thrown) {
    parseError = thrown;
  } finally {
    spy.mockRestore();
    errSpy.mockRestore();
    if (json) setJsonMode(false);
  }
  const exitCode = process.exitCode;
  process.exitCode = prevExit;
  return { out: chunks.join("\n"), err: errChunks.join("\n"), exitCode, parseError };
}

const WRITTEN = {
  outcome: "written" as const,
  path: "notes/a.md",
  revertedTo: "v-1",
  newVersionId: "v-3"
};

describe("nexus workspace revert", () => {
  const stdinWasTty = process.stdin.isTTY;

  beforeEach(() => {
    revert.mockReset();
    list.mockReset();
    revert.mockResolvedValue(WRITTEN);
  });
  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", { value: stdinWasTty, configurable: true });
    setJsonMode(false);
  });

  function setStdinTty(isTTY: boolean): void {
    Object.defineProperty(process.stdin, "isTTY", { value: isTTY, configurable: true });
  }

  it("--yes sends the path and the version id, and reports the new head", async () => {
    const { out, exitCode } = await run([
      "workspace",
      "revert",
      "docs",
      "notes/a.md",
      "--version-id",
      "v-1",
      "--yes"
    ]);
    expect(revert).toHaveBeenCalledWith("docs", {
      path: "notes/a.md",
      versionId: "v-1",
      workspaceId: undefined
    });
    expect(exitCode).toBeUndefined();
    expect(out).toContain('Reverted "notes/a.md" in "docs" to version v-1');
    expect(out).toContain("v-3");
  });

  it("REFUSES without a terminal and without --yes, and never calls the server", async () => {
    setStdinTty(false);
    const { exitCode, err } = await run([
      "workspace",
      "revert",
      "docs",
      "notes/a.md",
      "--version-id",
      "v-1"
    ]);
    expect(revert).not.toHaveBeenCalled();
    expect(exitCode).not.toBeUndefined();
    expect(exitCode).not.toBe(0);
    expect(err).toContain("refusing without a terminal");
  });

  it("--version-id is required; the root program owns --version", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const { parseError } = await run(["workspace", "revert", "docs", "notes/a.md", "--yes"]);
      expect(revert).not.toHaveBeenCalled();
      expect(parseError).toMatchObject({ code: "commander.missingMandatoryOptionValue" });
      expect(String(stderr.mock.calls[0]?.[0])).toContain("--version-id");
    } finally {
      stderr.mockRestore();
    }
  });

  it("'already-live' is a success that says nothing was written", async () => {
    revert.mockResolvedValue({ outcome: "already-live", path: "notes/a.md", revertedTo: "v-2" });
    const { out, exitCode } = await run([
      "workspace",
      "revert",
      "docs",
      "notes/a.md",
      "--version-id",
      "v-2",
      "--yes"
    ]);
    expect(exitCode).toBeUndefined();
    expect(out).toContain("already live");
    expect(out).toContain("nothing written");
  });

  it("--json is the server's document, on both outcomes", async () => {
    const written = await run(
      ["workspace", "revert", "docs", "notes/a.md", "--version-id", "v-1", "--yes"],
      true
    );
    expect(JSON.parse(written.out)).toEqual(WRITTEN);

    revert.mockResolvedValue({ outcome: "already-live", path: "notes/a.md", revertedTo: "v-2" });
    const live = await run(
      ["workspace", "revert", "docs", "notes/a.md", "--version-id", "v-2", "--yes"],
      true
    );
    expect(JSON.parse(live.out)).toEqual({
      outcome: "already-live",
      path: "notes/a.md",
      revertedTo: "v-2"
    });
  });

  it("--shared carries the admin-shared twin's id, and refuses when there is none", async () => {
    list.mockResolvedValue({
      workspaces: [
        { id: "w-org", slug: "docs", isShared: false, kind: "DRIVE" },
        { id: "w-shared", slug: "docs", isShared: true, kind: "DRIVE" }
      ]
    });
    const argv = ["workspace", "revert", "docs", "notes/a.md", "--version-id", "v-1", "--yes"];
    await run([...argv, "--shared"]);
    expect(revert).toHaveBeenCalledWith("docs", {
      path: "notes/a.md",
      versionId: "v-1",
      workspaceId: "w-shared"
    });

    revert.mockClear();
    list.mockResolvedValue({
      workspaces: [{ id: "w-org", slug: "docs", isShared: false, kind: "DRIVE" }]
    });
    const miss = await run([...argv, "--shared"]);
    expect(revert).not.toHaveBeenCalled();
    expect(miss.exitCode).not.toBeUndefined();
    expect(miss.err).toContain('No admin-shared workspace has the slug "docs"');
  });
});
