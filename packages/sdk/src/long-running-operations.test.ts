import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NexusClient } from "./client";
import { NexusTimeoutError } from "./errors";
import { DEFAULT_REQUEST_TIMEOUT_MS, LONG_RUNNING_TIMEOUT_MS } from "./timeouts";

/**
 * NEX-2492 — `POST /skills/tasks/:taskId/execute` runs a model before it can
 * answer. On a frontier model with structured JSON output that is 60–90 s, and
 * the SDK aborted every request at the transport's 30 s default: only fast or
 * degenerate generations ever came back, while the server ran to completion and
 * billed the tokens.
 *
 * It was reported against the CLI and patched there, in `task execute`, with a
 * command-local constant. That fixed one door. The SDK is the door every other
 * caller uses — a script, a customer integration, the CLI's own sibling
 * commands — and behind it the same request still aborted at 30 s.
 *
 * The fix states the deadline where the fact lives: the method that owns a
 * long-running route declares what it needs. These tests hold both halves of
 * that — the deadline a request actually runs under, and which operations are
 * in the set.
 */

// ---------------------------------------------------------------------------
// A fetch that never answers, and reports its own abort the way undici does
// ---------------------------------------------------------------------------

/**
 * Stand-in for a request the server is still working on.
 *
 * Resolves never; rejects only when the client's own abort fires, with the
 * `AbortError` `DOMException` that `HttpClient.attempt` maps to
 * {@link NexusTimeoutError}. So the deadline under test is the one that
 * actually armed the timer, not one read back off a config object.
 */
function neverAnsweringFetch() {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      })
  ) as unknown as typeof globalThis.fetch;
}

function clientThatNeverAnswers(timeout?: number): NexusClient {
  return new NexusClient({
    apiKey: "nxs_test",
    baseUrl: "https://api.nexusgpt.io",
    fetch: neverAnsweringFetch(),
    ...(timeout === undefined ? {} : { timeout })
  });
}

/**
 * The `NexusTimeoutError` a call ends in, or `null` while it is still waiting.
 *
 * Deliberately never awaits `call` itself: "still waiting" is one of the two
 * answers this has to be able to give, and awaiting a promise that is still
 * pending is how you wait out the test runner's own timeout instead of
 * reporting it.
 */
async function timeoutAfter(
  call: Promise<unknown>,
  advanceMs: number
): Promise<NexusTimeoutError | null> {
  // An array rather than a `let`: the assignment happens in a deferred callback,
  // which the compiler's flow analysis cannot see, so a nullable local would be
  // narrowed to `never` at the check below.
  const outcomes: unknown[] = [];
  call.then(
    () => outcomes.push(new Error("resolved, which this stub fetch never does")),
    (err: unknown) => outcomes.push(err)
  );

  await vi.advanceTimersByTimeAsync(advanceMs);
  // The rejection travels through `attempt` → `send` → `requestWithMeta` before
  // it reaches the handler above; each hop is a microtask.
  for (let i = 0; i < 10; i++) await Promise.resolve();

  if (outcomes.length === 0) return null;
  expect(outcomes[0]).toBeInstanceOf(NexusTimeoutError);
  return outcomes[0] as NexusTimeoutError;
}

describe("the deadline a request runs under", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives an ordinary read the 30 s default", async () => {
    const client = clientThatNeverAnswers();

    const err = await timeoutAfter(client.skills.getTask("task-uuid"), DEFAULT_REQUEST_TIMEOUT_MS);

    expect(err?.timeoutMs).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
  });

  it("does NOT abort `executeTask` at 30 s — the generation is still legitimately running", async () => {
    const client = clientThatNeverAnswers();

    const stillWaiting = await timeoutAfter(
      client.skills.executeTask("task-uuid", { input: "…" }),
      DEFAULT_REQUEST_TIMEOUT_MS
    );

    // The whole of NEX-2492 in one assertion: at the 30 s mark the CLI used to
    // be told the API was unreachable, while the server was 30 s into a 90 s
    // generation it would go on to finish and bill.
    expect(stillWaiting).toBeNull();
  });

  it("aborts `executeTask` at its own deadline, and names it", async () => {
    const client = clientThatNeverAnswers();

    const err = await timeoutAfter(
      client.skills.executeTask("task-uuid", { input: "…" }),
      LONG_RUNNING_TIMEOUT_MS
    );

    expect(err?.timeoutMs).toBe(LONG_RUNNING_TIMEOUT_MS);
  });

  it("lets an explicit client timeout override the operation's own, in both directions", async () => {
    // Down: the caller wants to give up sooner than the operation would.
    const impatient = clientThatNeverAnswers(5_000);
    const early = await timeoutAfter(
      impatient.skills.executeTask("task-uuid", { input: "…" }),
      5_000
    );
    expect(early?.timeoutMs).toBe(5_000);

    // Up: `--timeout 3600` on an ordinary route, which must not be clipped back
    // to 30 s. This is the direction the CLI's global flag depends on.
    const patient = clientThatNeverAnswers(3_600_000);
    const notYet = await timeoutAfter(
      patient.skills.getTask("task-uuid"),
      DEFAULT_REQUEST_TIMEOUT_MS
    );
    expect(notYet).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Which operations are in the set
// ---------------------------------------------------------------------------

/**
 * Every SDK method that declares {@link LONG_RUNNING_TIMEOUT_MS}, read out of
 * the resource sources.
 *
 * Read from source rather than asserted method by method because the failure
 * this guards is an ABSENCE: a new synchronous model-running route added
 * without a deadline looks exactly like a route that does not need one, and no
 * test that only checks the routes it already knows about would notice.
 */
function methodsDeclaringLongRunning(): string[] {
  const dir = join(__dirname, "resources");
  const found: string[] = [];

  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const source = readFileSync(join(dir, file), "utf8");
    if (!source.includes("LONG_RUNNING_TIMEOUT_MS")) continue;

    const resource = file.replace(/\.ts$/, "");
    // Walk the file once, remembering the most recent method signature, and
    // record it when the constant shows up before the next one starts.
    let currentMethod: string | undefined;
    for (const line of source.split("\n")) {
      const signature = /^\s{2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*[(<]/.exec(line);
      if (signature) currentMethod = signature[1];
      if (line.includes("timeoutMs: LONG_RUNNING_TIMEOUT_MS") && currentMethod) {
        found.push(`${resource}.${currentMethod}`);
      }
    }
  }

  return found.sort();
}

/**
 * The operations that cannot answer without first running a model, or without
 * waiting on a third party that may itself be running one.
 *
 * Membership is a judgement about the ROUTE, so it is stated here rather than
 * derived: adding a name is a claim that the server holds the connection open
 * across work of unbounded length, and removing one is a claim that it no
 * longer does.
 *
 * Deliberately absent, with reasons, so the omissions are not read as oversight:
 *   - `emulator.sendMessage` — the SERVER bounds its own wait at 25 s
 *     (`EMULATOR_TURN_SYNC_WAIT_MS`) and returns `status: "processing"` for a
 *     slow turn, so the 30 s default already outlasts anything it can do.
 *   - `evaluations.execute` / `evaluations.judge` — these acknowledge and run in
 *     the background; progress is read from `getSession()`.
 *   - `workflows.testWorkflow` — likewise an acknowledgement: its result type is
 *     `{ executionId, status: "RUNNING" }`, and the run is followed with
 *     `getExecutionStatus()`. Its sibling `testNode` IS here, because that one
 *     answers with the node's own output.
 *   - `skills.generateDocumentTemplate` — renders a docx/pptx from stored
 *     variables and uploads it. Slow-ish I/O, but no model runs: the route is
 *     templating, not generation in the sense this deadline is about.
 */
const LONG_RUNNING_OPERATIONS = [
  "prompt-assistant.chat",
  "skills.executeTask",
  "skills.testExternalTool",
  "tool-discovery.execute",
  "workflows.testNode"
].sort();

describe("the set of long-running operations", () => {
  it("is exactly the routes that run a model or wait on a third party", () => {
    expect(methodsDeclaringLongRunning()).toEqual(LONG_RUNNING_OPERATIONS);
  });

  it("finds the declarations at all — the scan is alive", () => {
    // Guards the scan itself: a regex that silently matched nothing would make
    // the assertion above pass against an empty expectation just as happily.
    expect(methodsDeclaringLongRunning().length).toBeGreaterThan(0);
  });

  it("states the deadline through the constant, never as a bare number", () => {
    const dir = join(__dirname, "resources");
    const offenders: string[] = [];

    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      const source = readFileSync(join(dir, file), "utf8");
      for (const [, value] of source.matchAll(/timeoutMs:\s*([^,\n}]+)/g)) {
        if (value.trim() !== "LONG_RUNNING_TIMEOUT_MS") offenders.push(`${file}: ${value.trim()}`);
      }
    }

    // A literal here is how the two classes drift back together: a "safe" 60_000
    // on one route reads as fixed and still aborts the 90 s generation this
    // whole mechanism exists for.
    expect(offenders).toEqual([]);
  });
});
