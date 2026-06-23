import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

const search = vi.fn();
const fakeClient = { workspaces: { search } };

vi.mock("../client", () => ({
  createClient: () => fakeClient
}));

import { registerWorkspaceCommands } from "./workspace";

async function run(
  argv: string[],
  json = false
): Promise<{ out: string; exitCode: typeof process.exitCode }> {
  const program = new Command();
  program.name("nexus").option("--json", "Output as JSON").exitOverride();
  registerWorkspaceCommands(program);

  if (json) setJsonMode(true);
  const chunks: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    chunks.push(args.map((a) => String(a)).join(" "));
  });
  // Swallow the dim stderr footer / error output.
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const prevExit = process.exitCode;
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
  return { out: chunks.join("\n"), exitCode };
}

describe("nexus workspace search", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => setJsonMode(false));

  it("calls the SDK with query, repeatable frontmatter, path and limit", async () => {
    search.mockResolvedValue({ results: [], scanned: 0, truncated: false });
    await run([
      "workspace",
      "search",
      "support-docs",
      "--query",
      "refund",
      "--frontmatter",
      "status=published",
      "--frontmatter",
      "owner=growth",
      "--path",
      "guides",
      "--limit",
      "20"
    ]);
    expect(search).toHaveBeenCalledWith("support-docs", {
      query: "refund",
      frontmatter: ["status=published", "owner=growth"],
      path: "guides",
      limit: 20
    });
  });

  it("emits a single parseable JSON document in --json mode", async () => {
    const payload = {
      results: [
        {
          path: "guides/intro.md",
          size: 12,
          modifiedAt: "2024-01-01T00:00:00.000Z",
          snippet: "…refund policy…",
          frontmatter: { status: "published" },
          matchedIn: ["content"]
        }
      ],
      scanned: 3,
      truncated: false
    };
    search.mockResolvedValue(payload);
    const { out } = await run(["workspace", "search", "docs", "--query", "refund"], true);
    expect(() => JSON.parse(out)).not.toThrow();
    expect(JSON.parse(out)).toEqual(payload);
  });

  it("rejects a search with neither query nor frontmatter (no SDK call)", async () => {
    const { exitCode } = await run(["workspace", "search", "docs"]);
    expect(search).not.toHaveBeenCalled();
    expect(exitCode).toBe(1);
  });

  it("rejects a malformed frontmatter filter (no SDK call)", async () => {
    const { exitCode } = await run(["workspace", "search", "docs", "--frontmatter", "nokey"]);
    expect(search).not.toHaveBeenCalled();
    expect(exitCode).toBe(1);
  });
});
