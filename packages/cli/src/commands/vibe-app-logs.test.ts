/**
 * `nexus vibe app logs <appId>` — the page read, the follow, and every way a
 * follow can stop.
 *
 * What these tests defend, in order of what would hurt most if it broke:
 *
 *   1. **A follow that stops is never silent.** A dropped connection and a quiet
 *      app produce the same empty tail, so the only thing separating them is
 *      that this command says which one happened. Swallowing an upstream error
 *      into a blank screen is the failure mode of every log tail ever written.
 *
 *   2. **`--grep` is a literal.** It reaches the wire byte for byte. A CLI that
 *      helpfully escaped, compiled or rejected metacharacters would silently
 *      change which lines a user sees.
 *
 *   3. **A foreign app and a missing app are indistinguishable HERE too.** The
 *      control plane goes to some trouble to make them the same 404; a CLI that
 *      annotated one of them would give the distinction back.
 *
 *   4. **NDJSON, one object per line, in both modes.** An array cannot be
 *      emitted incrementally, so `--follow --json | jq` would hang on one.
 *
 * ⚠️ Scope. Nothing here reaches a real backend, a real gateway or a real log
 * store. These prove the CLI's own behaviour against the frames the contract
 * declares — the ticket's "verified against a live stream" acceptance is NOT
 * met by this file and is not claimed to be.
 */

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";
import {
  VIBE_LOG_WIRE_MAX_CONTAINS_LENGTH,
  VIBE_LOG_WIRE_MAX_LIMIT,
  type VibeLogLineDto
} from "../vibe-wire-types";
import { registerVibeCommands } from "./vibe";
import {
  describeFollowFailure,
  followLogStream,
  parseStreamFrame,
  resolveAppLogsRequest,
  VIBE_LOG_CLI_DEFAULT_LIMIT,
  VIBE_LOG_CLI_MAX_LIMIT
} from "./vibe-app-logs";

const BASE_URL = "https://api.test.invalid";
const API_KEY = "test-api-key";
const APP_ID = "11111111-2222-4333-8444-555555555555";
const NOW = Date.parse("2026-08-06T12:00:00.000Z");

function line(overrides: Partial<VibeLogLineDto> = {}): VibeLogLineDto {
  return {
    timestampNs: "1780000000000000000",
    timestamp: "2026-08-06T11:59:00.000Z",
    message: "hello",
    color: "blue",
    ...overrides
  };
}

function stubFetch(data: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify({ success: true, data }))
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A non-2xx the backend genuinely sends for an unknown OR foreign app. */
function stubNotFound(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    text: () =>
      Promise.resolve(JSON.stringify({ code: "VIBE_APP_NOT_FOUND", message: "Vibe app not found" }))
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
    .option("--api-key <key>", "API key")
    .option("--profile <name>", "Profile")
    .exitOverride();
  registerVibeCommands(program);

  if (json) setJsonMode(true);
  const chunks: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    chunks.push(args.map((a) => String(a)).join(" "));
  });
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const prevExit = process.exitCode;
  process.exitCode = undefined;
  try {
    await program.parseAsync([
      "node",
      "nexus",
      ...(json ? ["--json"] : []),
      "--base-url",
      BASE_URL,
      "--api-key",
      API_KEY,
      "vibe",
      "app",
      "logs",
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

function requestedUrl(fetchMock: ReturnType<typeof vi.fn>): URL {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  return new URL(String(fetchMock.mock.calls[0][0]));
}

/** Feed the follow driver a fixed script of chunks, with no socket anywhere. */
async function* scripted(chunks: readonly string[]): AsyncGenerator<string> {
  for (const chunk of chunks) {
    yield chunk;
    // Yield to the microtask queue between chunks so an abort fired by a
    // consumer is observable the way it would be against a real socket.
    await Promise.resolve();
  }
}

function frame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

describe("nexus vibe app logs — the page read", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    vi.unstubAllGlobals();
    setJsonMode(false);
  });

  it("threads the window, slot, needle and limit onto the request", async () => {
    const fetchMock = stubFetch({ lines: [], nextCursor: null });

    const { exitCode } = await run([
      APP_ID,
      "--since",
      "2026-08-06T10:00:00.000Z",
      "--until",
      "2026-08-06T11:00:00.000Z",
      "--color",
      "green",
      "--grep",
      "boom",
      "--limit",
      "25"
    ]);

    const url = requestedUrl(fetchMock);
    expect(url.pathname).toBe(`/api/vibe/apps/${APP_ID}/logs`);
    expect(url.searchParams.get("from")).toBe(String(Date.parse("2026-08-06T10:00:00.000Z")));
    expect(url.searchParams.get("to")).toBe(String(Date.parse("2026-08-06T11:00:00.000Z")));
    expect(url.searchParams.get("color")).toBe("green");
    expect(url.searchParams.get("contains")).toBe("boom");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(exitCode).toBeUndefined();
  });

  it("sends --grep verbatim when it holds regex metacharacters", async () => {
    const fetchMock = stubFetch({ lines: [], nextCursor: null });
    const needle = "a.b*c[d]^$(e)|f+g?";

    await run([APP_ID, "--grep", needle]);

    // Byte for byte. Not escaped, not compiled, not refused.
    expect(requestedUrl(fetchMock).searchParams.get("contains")).toBe(needle);
  });

  it("sends the default limit when none is given", async () => {
    const fetchMock = stubFetch({ lines: [], nextCursor: null });
    await run([APP_ID]);
    expect(requestedUrl(fetchMock).searchParams.get("limit")).toBe("200");
  });

  it("prints oldest-first, reversing the newest-first page", async () => {
    const fetchMock = stubFetch({
      lines: [
        line({ timestamp: "2026-08-06T11:00:02.000Z", message: "third" }),
        line({ timestamp: "2026-08-06T11:00:01.000Z", message: "second" }),
        line({ timestamp: "2026-08-06T11:00:00.000Z", message: "first" })
      ],
      nextCursor: null
    });

    const { out } = await run([APP_ID]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out.indexOf("first")).toBeLessThan(out.indexOf("second"));
    expect(out.indexOf("second")).toBeLessThan(out.indexOf("third"));
  });

  it("emits NDJSON under --json — one object per line, never an array", async () => {
    stubFetch({
      lines: [line({ message: "newer" }), line({ message: "older" })],
      nextCursor: "1780000000000000000"
    });

    const { out } = await run([APP_ID], true);

    const rows = out.split("\n").filter((row) => row.length > 0);
    expect(rows).toHaveLength(2);
    // An array would make the first character `[`, and `jq` on a follow would
    // then wait forever for a closing bracket that never comes.
    expect(rows[0].startsWith("{")).toBe(true);
    expect(JSON.parse(rows[0])).toMatchObject({ message: "older" });
    expect(JSON.parse(rows[1])).toMatchObject({ message: "newer" });
  });

  it("refuses --limit above the CLI ceiling without opening a connection", async () => {
    const fetchMock = stubFetch({ lines: [], nextCursor: null });

    const { exitCode } = await run([APP_ID, "--limit", "1001"]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(exitCode).toBe(1);
  });

  it("refuses --follow together with --until", async () => {
    const fetchMock = stubFetch({ lines: [], nextCursor: null });

    const { exitCode } = await run([APP_ID, "--follow", "--until", "2026-08-06T11:00:00.000Z"]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(exitCode).toBe(1);
  });

  it("renders a foreign app and a missing app identically", async () => {
    // The control plane makes these one response on purpose. This asserts the
    // CLI does not manufacture a distinction back — it CANNOT tell them apart,
    // and the test's job is to prove it does not try.
    stubNotFound();
    const foreign = await run(["22222222-2222-4333-8444-555555555555"]);
    vi.unstubAllGlobals();

    stubNotFound();
    const missing = await run(["33333333-2222-4333-8444-555555555555"]);

    expect(foreign.out).toBe(missing.out);
    expect(foreign.exitCode).toBe(missing.exitCode);
    expect(foreign.exitCode).toBe(1);
  });
});

describe("resolveAppLogsRequest", () => {
  it("defaults to the last hour and drops `to` for a follow", () => {
    expect(resolveAppLogsRequest({ follow: true }, NOW)).toEqual({
      from: NOW - 3_600_000,
      to: undefined,
      color: undefined,
      contains: undefined,
      limit: 200,
      follow: true
    });
  });

  it("accepts a slot in either case and sends the lower-case form", () => {
    // The database enum spells these BLUE/GREEN; the log store indexes
    // blue/green. Sending the upper-case form matches nothing, silently.
    expect(resolveAppLogsRequest({ color: "GREEN" }, NOW).color).toBe("green");
    expect(resolveAppLogsRequest({ color: "blue" }, NOW).color).toBe("blue");
    expect(() => resolveAppLogsRequest({ color: "red" }, NOW)).toThrow(/blue or green/);
  });

  it("names the ceiling it refuses a limit against", () => {
    // The literal `1000` is asserted directly, NOT interpolated from
    // VIBE_LOG_CLI_MAX_LIMIT. Building the expectation from the same constant
    // the code reads would move both sides together and make the assertion inert.
    expect(() => resolveAppLogsRequest({ limit: "1001" }, NOW)).toThrow(
      /must be between 1 and 1000/
    );
    expect(() => resolveAppLogsRequest({ limit: "0" }, NOW)).toThrow(/must be between 1 and 1000/);
    expect(resolveAppLogsRequest({ limit: "1000" }, NOW).limit).toBe(1000);
  });

  it("refuses a limit that is not a whole number, as a typo rather than a bound", () => {
    expect(() => resolveAppLogsRequest({ limit: "12abc" }, NOW)).toThrow(/whole number/);
    expect(() => resolveAppLogsRequest({ limit: "1.5" }, NOW)).toThrow(/whole number/);
    expect(() => resolveAppLogsRequest({ limit: "" }, NOW)).toThrow(/whole number/);
  });

  it("refuses a needle longer than the server accepts", () => {
    const tooLong = "x".repeat(513);
    expect(() => resolveAppLogsRequest({ grep: tooLong }, NOW)).toThrow(/at most 512/);
    expect(resolveAppLogsRequest({ grep: "x".repeat(512) }, NOW).contains).toHaveLength(512);
  });

  it("keeps the CLI ceiling strictly below the server's", () => {
    // Literals on both sides. The relationship is the design — the CLI's refusal
    // is the stricter one and is the one a user meets — and an edit that
    // inverted it would leave the CLI accepting a limit the server refuses.
    expect(VIBE_LOG_CLI_MAX_LIMIT).toBe(1000);
    expect(VIBE_LOG_WIRE_MAX_LIMIT).toBe(5000);
    expect(VIBE_LOG_CLI_DEFAULT_LIMIT).toBe(200);
    expect(VIBE_LOG_WIRE_MAX_CONTAINS_LENGTH).toBe(512);
    expect(VIBE_LOG_CLI_MAX_LIMIT).toBeLessThan(VIBE_LOG_WIRE_MAX_LIMIT);
  });
});

describe("parseStreamFrame", () => {
  it("reads each frame the contract declares", () => {
    expect(parseStreamFrame(JSON.stringify({ type: "lines", lines: [line()] }))).toEqual({
      status: "frame",
      frame: { type: "lines", lines: [line()] }
    });
    expect(parseStreamFrame(JSON.stringify({ type: "end", reason: "upstream-closed" }))).toEqual({
      status: "frame",
      frame: { type: "end", reason: "upstream-closed" }
    });
    expect(parseStreamFrame(JSON.stringify({ type: "error", message: "gone" }))).toEqual({
      status: "frame",
      frame: { type: "error", message: "gone" }
    });
  });

  it("ignores a frame type this build does not know", () => {
    // Forward compatibility. A published binary must keep following logs after a
    // backend deploy adds a frame, rather than treating it as a protocol break.
    expect(parseStreamFrame(JSON.stringify({ type: "heartbeat" }))).toEqual({ status: "ignored" });
  });

  it("calls a frame that is not the contract malformed, never ignorable", () => {
    expect(parseStreamFrame("not json").status).toBe("malformed");
    expect(parseStreamFrame(JSON.stringify({ lines: [] })).status).toBe("malformed");
    expect(parseStreamFrame(JSON.stringify({ type: "lines", lines: "nope" })).status).toBe(
      "malformed"
    );
    expect(
      parseStreamFrame(JSON.stringify({ type: "lines", lines: [{ message: 1 }] })).status
    ).toBe("malformed");
    expect(parseStreamFrame(JSON.stringify({ type: "error" })).status).toBe("malformed");
  });
});

describe("followLogStream", () => {
  it("emits lines across chunk boundaries and ignores keepalives", async () => {
    const wire = frame({ type: "lines", lines: [line({ message: "one" })] });
    const chunks = [
      wire.slice(0, 20),
      wire.slice(20),
      ": keepalive\n\n",
      frame({ type: "lines", lines: [line({ message: "two" })] }),
      frame({ type: "end", reason: "upstream-closed" })
    ];

    const seen: string[] = [];
    const outcome = await followLogStream(scripted(chunks), new AbortController().signal, (lines) =>
      seen.push(...lines.map((l) => l.message))
    );

    expect(seen).toEqual(["one", "two"]);
    expect(outcome).toEqual({ kind: "upstream-closed" });
    expect(describeFollowFailure(outcome)).toBeNull();
  });

  it("reports an upstream close as a clean end, not a failure", async () => {
    const outcome = await followLogStream(
      scripted([frame({ type: "end", reason: "upstream-closed" })]),
      new AbortController().signal,
      () => undefined
    );
    expect(outcome).toEqual({ kind: "upstream-closed" });
    expect(describeFollowFailure(outcome)).toBeNull();
  });

  it("stops on Ctrl-C mid-stream and emits nothing after it", async () => {
    const controller = new AbortController();
    const seen: string[] = [];

    const outcome = await followLogStream(
      scripted([
        frame({ type: "lines", lines: [line({ message: "before" })] }),
        frame({ type: "lines", lines: [line({ message: "after" })] })
      ]),
      controller.signal,
      (lines) => {
        seen.push(...lines.map((l) => l.message));
        // Ctrl-C lands while the first frame is being rendered.
        controller.abort();
      }
    );

    expect(seen).toEqual(["before"]);
    expect(outcome).toEqual({ kind: "interrupted" });
    // Ctrl-C is a choice, not a fault. Nothing to report and nothing to exit on.
    expect(describeFollowFailure(outcome)).toBeNull();
  });

  it("reads an abort thrown by the transport as an interruption", async () => {
    const controller = new AbortController();
    async function* aborting(): AsyncGenerator<string> {
      controller.abort();
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
      // eslint-disable-next-line no-unreachable
      yield "";
    }

    expect(await followLogStream(aborting(), controller.signal, () => undefined)).toEqual({
      kind: "interrupted"
    });
  });

  it("reports a stream that ends without a terminal frame as a dropped connection", async () => {
    // THE test this module exists for. A dropped connection and a quiet app
    // produce the identical empty tail; the only difference is that this says so.
    const outcome = await followLogStream(
      scripted([frame({ type: "lines", lines: [line({ message: "last thing heard" })] })]),
      new AbortController().signal,
      () => undefined
    );

    expect(outcome).toEqual({ kind: "disconnected" });
    expect(describeFollowFailure(outcome)).toMatch(/connection dropped/);
  });

  it("surfaces the server's own message from an error frame", async () => {
    const outcome = await followLogStream(
      scripted([
        frame({ type: "error", message: "The tenant log gateway is not reachable right now." })
      ]),
      new AbortController().signal,
      () => undefined
    );

    expect(outcome).toEqual({
      kind: "stream-error",
      message: "The tenant log gateway is not reachable right now."
    });
    expect(describeFollowFailure(outcome)).toMatch(/not reachable right now/);
  });

  it("reports a transport failure rather than ending quietly", async () => {
    async function* broken(): AsyncGenerator<string> {
      yield frame({ type: "lines", lines: [line()] });
      throw new Error("socket hang up");
    }

    const outcome = await followLogStream(broken(), new AbortController().signal, () => undefined);

    expect(outcome).toEqual({ kind: "stream-error", message: "socket hang up" });
    expect(describeFollowFailure(outcome)).toMatch(/socket hang up/);
  });

  it("stops on a malformed frame instead of skipping it", async () => {
    const outcome = await followLogStream(
      scripted(["data: {not json}\n\n"]),
      new AbortController().signal,
      () => undefined
    );
    expect(outcome.kind).toBe("stream-error");
  });

  it("hands lines over as they arrive, not once the stream ends", async () => {
    // The incrementality `--follow --json | jq` depends on. If frames were
    // buffered to the end, `seen` would still be empty when the second chunk is
    // produced — and a follow that only prints on close is not a follow.
    const seenWhenSecondChunkProduced: string[][] = [];
    const seen: string[] = [];

    async function* observed(): AsyncGenerator<string> {
      yield frame({ type: "lines", lines: [line({ message: "one" })] });
      await Promise.resolve();
      seenWhenSecondChunkProduced.push([...seen]);
      yield frame({ type: "end", reason: "upstream-closed" });
    }

    await followLogStream(observed(), new AbortController().signal, (lines) =>
      seen.push(...lines.map((l) => l.message))
    );

    expect(seenWhenSecondChunkProduced).toEqual([["one"]]);
    expect(seen).toEqual(["one"]);
  });
});
