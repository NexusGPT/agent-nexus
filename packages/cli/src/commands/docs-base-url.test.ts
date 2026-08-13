import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// PARTIAL mock. `createClient` is stubbed because it would read config and open
// a real client; everything else is the REAL module, so the seconds-to-ms
// conversion these tests assert on is the one production runs. A hand-written
// stub of the converter here would let the tests pass while the real one broke.
vi.mock("../client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../client")>()),
  createClient: () => ({ docs: { search: vi.fn() } })
}));

import { parseTimeoutSeconds } from "../client";
import { registerDocsCommand } from "./docs";

// AbortSignal hides the delay it was built with, so record it at construction.
// Asserting on the NUMBER is the only way to tell 600s from 600ms apart — the
// two are indistinguishable from the outside until the request hangs or aborts.
const realAbortTimeout = AbortSignal.timeout.bind(AbortSignal);
AbortSignal.timeout = (ms: number) => {
  const signal = realAbortTimeout(0x7fffffff) as AbortSignal & { _ms?: number };
  signal._ms = ms;
  return signal;
};

/**
 * `nexus docs --full` fetched a HARDCODED `https://gpt.nexus/docs/llms-full.txt`.
 *
 * Two defects in one literal, and the second is the one that hid the first:
 *
 *  1. `gpt.nexus` is the DASHBOARD. Its `vercel.json` rewrites every non-asset
 *     path to `/index.html`, so the feed URL answered 200 with the SPA shell and
 *     the command printed an HTML page as if it were the documentation. No
 *     status code could reveal that — a control asserting `res.ok` PASSES
 *     against the wrong host, which is not a control at all.
 *  2. A hardcoded host bypasses the whole `resolveBaseUrl` precedence chain
 *     (--base-url → --profile → NEXUS_BASE_URL → active profile → NEXUS_ENV),
 *     so the command was unusable against staging or dev in every spelling and
 *     nothing said so.
 *
 * So the assertions are on the REQUESTED URL and on the CONTENT TYPE, never on
 * the status. Nothing here calls a real host.
 */

const PLAIN = { "content-type": "text/plain; charset=utf-8" };
const SPA_SHELL = { "content-type": "text/html; charset=utf-8" };

let fetchMock: ReturnType<typeof vi.fn>;
let stdout: string[];
let stderr: string[];

function mockFeed(body: string, headers: Record<string, string>): void {
  fetchMock.mockResolvedValue(new Response(body, { status: 200, headers }));
}

async function runDocs(argv: string[]): Promise<void> {
  const program = new Command();
  program
    .name("nexus")
    .option("--json", "Output as JSON")
    .option("--base-url <url>", "Override API base URL")
    .option("--profile <name>", "Use a specific named profile")
    .option("--dashboard-url <url>", "Override dashboard URL")
    .option("--timeout <seconds>", "Client-side timeout in seconds", parseTimeoutSeconds);
  registerDocsCommand(program);
  await program.parseAsync(["node", "nexus", ...argv]);
}

beforeEach(() => {
  stdout = [];
  stderr = [];
  vi.spyOn(console, "log").mockImplementation(
    (...a: unknown[]) => void stdout.push(a.map(String).join(" "))
  );
  vi.spyOn(console, "error").mockImplementation(
    (...a: unknown[]) => void stderr.push(a.map(String).join(" "))
  );
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  process.exitCode = undefined;
  process.env.NEXUS_BASE_URL = "https://api.example.test";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.NEXUS_BASE_URL;
  process.exitCode = undefined;
});

describe("docs feeds follow the configured API base URL", () => {
  it("--full reads /api/docs/llms-full.txt on the resolved API host", async () => {
    mockFeed("# Nexus docs\n", PLAIN);

    await runDocs(["docs", "--full"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.test/api/docs/llms-full.txt");
    expect(stdout.join("\n")).toContain("# Nexus docs");
    expect(process.exitCode).toBeUndefined();
  });

  it("--index reads /api/docs/llms.txt on the same host", async () => {
    mockFeed("- page one\n", PLAIN);

    await runDocs(["docs", "--index"]);

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.test/api/docs/llms.txt");
  });

  it("--base-url outranks the env var, which a hardcoded host could not do", async () => {
    mockFeed("staging docs\n", PLAIN);

    await runDocs(["--base-url", "https://api-staging.example.test", "docs", "--full"]);

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api-staging.example.test/api/docs/llms-full.txt"
    );
  });

  it("strips a trailing slash rather than requesting a doubled path", async () => {
    process.env.NEXUS_BASE_URL = "https://api.example.test/";
    mockFeed("docs\n", PLAIN);

    await runDocs(["docs", "--full"]);

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.test/api/docs/llms-full.txt");
  });
});

describe("the docs feeds honour the global --timeout", () => {
  /** The ms deadline handed to AbortSignal.timeout for the one fetch made. */
  function abortDeadlineMs(): number {
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal & { _ms?: number };
    return signal._ms ?? NaN;
  }

  it("waits the 60s default when --timeout is absent", async () => {
    mockFeed("docs\n", PLAIN);

    await runDocs(["docs", "--full"]);

    expect(abortDeadlineMs()).toBe(60_000);
  });

  it("uses --timeout <seconds> when given, converted through the one converter", async () => {
    mockFeed("docs\n", PLAIN);

    await runDocs(["--timeout", "600", "docs", "--full"]);

    // 600s, not 600ms and not 600_000s. The whole point of NEX-3707's converter.
    expect(abortDeadlineMs()).toBe(600_000);
  });

  it("applies to --index as well as --full", async () => {
    mockFeed("index\n", PLAIN);

    await runDocs(["--timeout", "120", "docs", "--index"]);

    expect(abortDeadlineMs()).toBe(120_000);
  });

  it("names --timeout when the fetch actually times out", async () => {
    // AbortSignal.timeout rejects with a DOMException named TimeoutError whose
    // own message mentions neither the cause nor the flag that fixes it.
    const timeoutError = new Error("The operation was aborted due to timeout");
    timeoutError.name = "TimeoutError";
    fetchMock.mockRejectedValue(timeoutError);

    await runDocs(["docs", "--full"]);

    const err = stderr.join("\n");
    expect(err).toContain("60s");
    expect(err).toContain("--timeout");
    expect(process.exitCode).toBe(1);
  });
});

describe("the feeds stay unauthenticated", () => {
  /**
   * `--full`, `--index` and the bare link view read PUBLIC files —
   * `DocsFeedsController` marks both routes `@AllowUnauthenticated`. Only
   * `docs search` needs a key.
   *
   * Routing the feeds through the SDK would have been the tidy-looking way to
   * make them follow the base URL, and it would have quietly added an API key
   * requirement to three paths that never had one. Nobody would notice until a
   * fresh machine with no profile ran `nexus docs`, which is the first thing a
   * new user runs. This pins the property rather than trusting the diff.
   */
  it("--full sends no Authorization header and builds no client", async () => {
    mockFeed("docs\n", PLAIN);

    await runDocs(["docs", "--full"]);

    const init = fetchMock.mock.calls[0][1] ?? {};
    expect(init.headers).toBeUndefined();
    expect(process.exitCode).toBeUndefined();
  });

  it("--index sends no Authorization header", async () => {
    mockFeed("index\n", PLAIN);

    await runDocs(["docs", "--index"]);

    expect(fetchMock.mock.calls[0][1]?.headers).toBeUndefined();
  });

  it("the bare link view makes no request at all", async () => {
    await runDocs(["docs"]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(stdout.join("\n")).toContain("/api/docs/llms.txt");
    expect(process.exitCode).toBeUndefined();
  });
});

describe("a 200 carrying a web page is refused, not printed as documentation", () => {
  it("refuses an HTML shell and exits 1", async () => {
    mockFeed("<!doctype html><html><div id=root></div></html>", SPA_SHELL);

    await runDocs(["docs", "--full"]);

    // The exact shape of the old bug: 200, a body, and nothing wrong on the
    // status line. Only the content type separates it from the real feed.
    expect(stdout.join("\n")).not.toContain("<!doctype html");
    expect(stderr.join("\n")).toContain("text/plain");
    expect(process.exitCode).toBe(1);
  });

  it("says the base URL is the thing to check, since that is the actual cause", async () => {
    mockFeed("<!doctype html>", SPA_SHELL);

    await runDocs(["docs", "--index"]);

    expect(stderr.join("\n")).toContain("--base-url");
  });
});
