import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

const history = vi.fn();
const list = vi.fn();
const fakeClient = { workspaces: { history, list } };

// PARTIAL, via `importOriginal`: `workspace.ts` reads the `seconds` brand
// constructor off this module at load, and a total mock makes the suite fail
// to COLLECT — which reports as no tests, not as a red.
vi.mock("../client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../client")>()),
  createClient: () => fakeClient
}));

import { registerWorkspaceCommands } from "./workspace";
import { historyRow } from "./workspace-history";

async function run(
  argv: string[],
  json = false
): Promise<{ out: string; err: string; exitCode: typeof process.exitCode }> {
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
  try {
    await program.parseAsync(["node", "nexus", ...(json ? ["--json"] : []), ...argv]);
  } catch {
    /* commander exitOverride throws on error — ignore, assert via exitCode */
  } finally {
    spy.mockRestore();
    errSpy.mockRestore();
    if (json) setJsonMode(false);
  }
  const exitCode = process.exitCode;
  process.exitCode = prevExit;
  return { out: chunks.join("\n"), err: errChunks.join("\n"), exitCode };
}

const VERSIONS = [
  {
    kind: "delete-marker" as const,
    versionId: "dm-1",
    isLatest: true,
    modifiedAt: "2026-09-21T10:00:00.000Z"
  },
  {
    kind: "file" as const,
    versionId: "v-2",
    isLatest: false,
    size: 1234,
    modifiedAt: "2026-09-21T09:00:00.000Z",
    etag: '"v-2-etag"'
  },
  {
    kind: "file" as const,
    versionId: "v-1",
    isLatest: false,
    size: 1230,
    modifiedAt: "2026-09-21T08:00:00.000Z",
    etag: '"v-1-etag"'
  }
];

describe("historyRow — the two entry kinds flattened into one table row", () => {
  it("a live file version says 'live' and prints its exact byte count", () => {
    expect(
      historyRow(
        {
          kind: "file",
          versionId: "v-9",
          isLatest: true,
          size: 1234,
          modifiedAt: "t",
          etag: '"e"'
        },
        0
      )
    ).toEqual({ n: 1, when: "t", size: "1234 B", versionId: "v-9", kind: "file", state: "live" });
  });

  it("a live delete marker says 'deleted' and has no size", () => {
    expect(historyRow(VERSIONS[0], 0)).toEqual({
      n: 1,
      when: "2026-09-21T10:00:00.000Z",
      size: "—",
      versionId: "dm-1",
      kind: "delete marker",
      state: "deleted"
    });
  });

  it("an older entry of either kind carries no state", () => {
    expect(historyRow(VERSIONS[1], 1).state).toBe("");
  });
});

describe("nexus workspace history", () => {
  beforeEach(() => {
    history.mockReset();
    list.mockReset();
    history.mockResolvedValue({ versions: VERSIONS });
  });
  afterEach(() => {
    setJsonMode(false);
  });

  it("asks for the file's history by slug and path, and prints one row per version, newest first", async () => {
    const { out, exitCode } = await run(["workspace", "history", "docs", "notes/a.md"]);
    expect(history).toHaveBeenCalledWith("docs", "notes/a.md", { workspaceId: undefined });
    expect(exitCode).toBeUndefined();
    const lines = out.split("\n");
    expect(lines.findIndex((l) => l.includes("dm-1"))).toBeLessThan(
      lines.findIndex((l) => l.includes("v-2"))
    );
    expect(out).toContain("1234 B");
    expect(out).toContain("1230 B");
    expect(out).toContain("deleted");
  });

  it("--json is the server's document, untouched", async () => {
    const { out } = await run(["workspace", "history", "docs", "notes/a.md"], true);
    expect(JSON.parse(out)).toEqual({ versions: VERSIONS });
  });

  it("an empty history is a sentence, not an empty table", async () => {
    history.mockResolvedValue({ versions: [] });
    const { out, exitCode } = await run(["workspace", "history", "docs", "notes/a.md"]);
    expect(exitCode).toBeUndefined();
    expect(out).toContain('No versions of "notes/a.md" in "docs"');
  });

  it("--shared carries the admin-shared twin's id, and refuses when there is none", async () => {
    list.mockResolvedValue({
      workspaces: [
        { id: "w-org", slug: "docs", isShared: false, kind: "DRIVE" },
        { id: "w-shared", slug: "docs", isShared: true, kind: "DRIVE" }
      ]
    });
    await run(["workspace", "history", "docs", "notes/a.md", "--shared"]);
    expect(history).toHaveBeenCalledWith("docs", "notes/a.md", { workspaceId: "w-shared" });

    history.mockClear();
    list.mockResolvedValue({
      workspaces: [{ id: "w-org", slug: "docs", isShared: false, kind: "DRIVE" }]
    });
    const miss = await run(["workspace", "history", "docs", "notes/a.md", "--shared"]);
    expect(history).not.toHaveBeenCalled();
    expect(miss.exitCode).not.toBeUndefined();
    expect(miss.err).toContain('No admin-shared workspace has the slug "docs"');
  });
});
