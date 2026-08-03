/**
 * `nexus admin vibe-cost-safety list` — the fleet read.
 *
 * What these tests defend, in order of what would hurt most if it broke:
 *
 *   1. The paging arguments reach the request UNCHANGED. `--limit` and
 *      `--offset` are the whole point of the verb on a fleet larger than one
 *      page, and a dropped or renamed parameter fails silently — the server
 *      applies its own default and returns a page that looks perfectly
 *      plausible.
 *
 *   2. An omitted flag sends NO parameter, rather than an empty one. That is
 *      what leaves the server's default in force instead of overriding it.
 *
 *   3. The rows are rendered in the order the server sent them. The endpoint
 *      orders by `updatedAt` desc THEN `organizationId` desc precisely
 *      because timestamps in this table collide to the millisecond; a
 *      client-side re-sort on `updatedAt` alone would reintroduce the page
 *      boundary that skips or duplicates an org.
 */

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";
import { registerAdminCommands } from "./admin";

const BASE_URL = "https://api.test.invalid";
const TOKEN = "test-jwt";

/**
 * Three rows sharing one `updatedAt` to the millisecond, ordered as the
 * server orders them — `organizationId` DESC breaks the tie. Any client-side
 * sort would reorder these, and an ascending id sort would reverse them
 * outright.
 */
const COLLIDING_PAGE = {
  items: [
    {
      organizationId: "org_ccc",
      organizationName: "Ceres",
      status: "SUSPENDED",
      suspendedReason: "compute cap breached",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-21T09:37:57.160Z"
    },
    {
      organizationId: "org_bbb",
      organizationName: null,
      status: "SUSPENDED",
      suspendedReason: null,
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-21T09:37:57.160Z"
    },
    {
      organizationId: "org_aaa",
      organizationName: "Anvil",
      status: "SUSPENDED",
      suspendedReason: "fraud investigation",
      createdAt: "2026-07-03T00:00:00.000Z",
      updatedAt: "2026-07-21T09:37:57.160Z"
    }
  ],
  total: 7
};

function stubFetch(data: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify({ success: true, data }))
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function run(
  argv: string[],
  json = false
): Promise<{ out: string; exitCode: typeof process.exitCode }> {
  const program = new Command();
  program
    .name("nexus")
    .option("--json", "Output as JSON")
    .option("--base-url <url>", "API base URL")
    .option("--profile <name>", "Profile")
    .exitOverride();
  registerAdminCommands(program);

  if (json) setJsonMode(true);
  const chunks: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    chunks.push(args.map((a) => String(a)).join(" "));
  });
  // `handleAdminError` writes to stderr; swallow it so a deliberate failure
  // case does not pollute the suite's output.
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const prevExit = process.exitCode;
  process.exitCode = undefined;
  try {
    await program.parseAsync([
      "node",
      "nexus",
      ...(json ? ["--json"] : []),
      "--base-url",
      BASE_URL,
      "admin",
      "--admin-token",
      TOKEN,
      ...argv
    ]);
  } catch {
    /* commander exitOverride throws on a usage error — assert via exitCode */
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    if (json) setJsonMode(false);
  }
  const exitCode = process.exitCode;
  process.exitCode = prevExit;
  return { out: chunks.join("\n"), exitCode };
}

/** The URL the command actually requested, parsed. */
function requestedUrl(fetchMock: ReturnType<typeof vi.fn>): URL {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return new URL(String(fetchMock.mock.calls[0][0]));
}

describe("nexus admin vibe-cost-safety list", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    vi.unstubAllGlobals();
    setJsonMode(false);
  });

  it("threads --status, --limit and --offset onto the request unchanged", async () => {
    const fetchMock = stubFetch({ items: [], total: 0 });

    const { exitCode } = await run([
      "vibe-cost-safety",
      "list",
      "--status",
      "SUSPENDED",
      "--limit",
      "25",
      "--offset",
      "50"
    ]);

    expect(exitCode).toBeUndefined();
    const url = requestedUrl(fetchMock);
    expect(url.pathname).toBe("/api/admin/vibe/cost-safety");
    expect(url.searchParams.get("status")).toBe("SUSPENDED");
    // Read as strings: these are what actually crosses the wire, and a
    // number assertion would pass on a value the query string never carried.
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("offset")).toBe("50");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET" });
  });

  it("sends NO query parameters when every flag is omitted", async () => {
    const fetchMock = stubFetch({ items: [], total: 0 });

    await run(["vibe-cost-safety", "list"]);

    // An empty `?limit=&offset=` would override the server's own defaults
    // with blanks. Absence is the contract.
    expect(requestedUrl(fetchMock).search).toBe("");
  });

  it("sends offset=0 explicitly when the operator asks for it", async () => {
    const fetchMock = stubFetch({ items: [], total: 0 });

    await run(["vibe-cost-safety", "list", "--offset", "0"]);

    // 0 is falsy and is the value a `??`/truthiness filter silently drops.
    expect(requestedUrl(fetchMock).searchParams.get("offset")).toBe("0");
  });

  it("upper-cases a lower-case --status before it reaches the wire", async () => {
    const fetchMock = stubFetch({ items: [], total: 0 });

    await run(["vibe-cost-safety", "list", "--status", "suspended"]);

    expect(requestedUrl(fetchMock).searchParams.get("status")).toBe("SUSPENDED");
  });

  it("renders rows in server order and never re-sorts them", async () => {
    stubFetch(COLLIDING_PAGE);

    const { out } = await run(["vibe-cost-safety", "list", "--status", "SUSPENDED"], true);

    // --json forwards the wire envelope verbatim, so a deep equal proves both
    // the ORDER and that nothing was reshaped or dropped on the way out.
    expect(JSON.parse(out)).toEqual(COLLIDING_PAGE);
    const rendered = JSON.parse(out) as typeof COLLIDING_PAGE;
    expect(rendered.items.map((i) => i.organizationId)).toEqual(["org_ccc", "org_bbb", "org_aaa"]);
  });

  it("prints the total and the next page's offset in table mode", async () => {
    stubFetch(COLLIDING_PAGE);

    const { out } = await run(["vibe-cost-safety", "list", "--offset", "0"]);

    expect(out).toContain("org_ccc");
    expect(out).toContain("3 shown");
    expect(out).toContain("7 total");
    // 0 + 3 rendered < 7 matching, so a next page exists and is named.
    expect(out).toContain("--offset 3");
  });

  it("omits the next-page hint on the last page", async () => {
    stubFetch({ items: COLLIDING_PAGE.items, total: 3 });

    const { out } = await run(["vibe-cost-safety", "list"]);

    expect(out).toContain("3 total");
    expect(out).not.toContain("next page");
  });

  it("refuses an unknown --status locally, without making the call", async () => {
    const fetchMock = stubFetch({ items: [], total: 0 });

    const { exitCode } = await run(["vibe-cost-safety", "list", "--status", "PAUSED"]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(exitCode).toBe(5);
  });

  // `--offset=-1` uses the `=` form on purpose: commander reads any bare
  // argument starting with `-` as the next option, so `--offset -1` never
  // reaches this validation at all — it dies as a usage error instead.
  it.each([
    ["--limit below the server's floor", ["--limit", "0"]],
    ["--limit above the server's cap", ["--limit", "201"]],
    ["a non-numeric --limit", ["--limit", "abc"]],
    ["an exponent --limit", ["--limit", "1e3"]],
    ["a fractional --limit", ["--limit", "2.5"]],
    ["a hex --limit", ["--limit", "0x10"]],
    ["a negative --offset", ["--offset=-1"]]
  ])("refuses %s locally, without making the call", async (_label, flags) => {
    const fetchMock = stubFetch({ items: [], total: 0 });

    const { exitCode } = await run(["vibe-cost-safety", "list", ...flags]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(exitCode).toBe(5);
  });

  it("accepts the server's documented limit boundaries", async () => {
    for (const limit of ["1", "200"]) {
      vi.clearAllMocks();
      const fetchMock = stubFetch({ items: [], total: 0 });
      const { exitCode } = await run(["vibe-cost-safety", "list", "--limit", limit]);
      expect(exitCode).toBeUndefined();
      expect(requestedUrl(fetchMock).searchParams.get("limit")).toBe(limit);
    }
  });
});
