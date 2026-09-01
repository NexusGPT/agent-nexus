/**
 * `nexus apps logs --follow` — WHAT A SIGNAL ACTUALLY DOES TO THE EXIT CODE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THIS IS THE ONLY PLACE IN THE CLI THAT PRODUCES `130`, AND EVERY SHIPPED
 *    SENTENCE ABOUT IT WAS WRONG IN THE SAME DIRECTION.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The root `--help` table called it "SIGINT", `COMPATIBILITY.md` called it
 * "reserved rather than chosen", the taxonomy's own docblock said it was "never
 * chosen as a verdict", and this command's `--help` said "Ctrl-C ends one
 * cleanly and exits 0" and stopped there. Read together they tell a script
 * author two false things: that a Ctrl-C yields `130` (it yields `0`), and that
 * nothing but a Ctrl-C can yield it (a `SIGTERM` can).
 *
 * `exit-code-taxonomy.test.ts` asserts `interrupted` is REACHABLE, and it does
 * that by reading the source for the string `process.exit(EXIT_CODES.interrupted)`
 * — which is the only thing a spec can do about a call that would end the run.
 * A string scan cannot see WHEN the call happens, and "when" is the entire
 * contract here. THAT IS THE HOLE THIS FILE CLOSES: the handler is driven, with
 * `process.exit` replaced, and the signal sequence is the input.
 *
 * ⚠️ The counter is SHARED between `SIGINT` and `SIGTERM` on purpose, so the
 * pair that reaches `130` is usually MIXED — the user presses Ctrl-C, a
 * supervisor then sends `SIGTERM` into the same process. A test that only ever
 * sends two `SIGINT`s is green against a handler holding one counter PER SIGNAL,
 * which is the plausible wrong implementation. Both mixed orders are driven
 * below for exactly that reason.
 */

import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import { EXIT_CODES } from "../exit-codes";
import { type AppLogsRequest, runAppLogsFollow } from "./apps-logs";

const tenantStream = vi.hoisted(() => vi.fn());
vi.mock("../util/tenant-http", () => ({ tenantStream }));

const APP_ID = "11111111-2222-4333-8444-555555555555";

const REQUEST: AppLogsRequest = { from: 1_780_000_000_000, limit: 100, follow: true };

/**
 * A stream that produces nothing and ends only when the follow aborts it.
 *
 * A generator that returned immediately would let `runAppLogsFollow` finish
 * before the second signal ever arrived, and the case would pass having never
 * reached the branch under test.
 */
function hangUntilAborted(signal: AbortSignal): AsyncIterable<string> {
  const settled = new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener("abort", () => resolve(), { once: true });
  });

  return {
    [Symbol.asyncIterator]: (): AsyncIterator<string> => ({
      next: async (): Promise<IteratorResult<string>> => {
        await settled;
        return { done: true, value: undefined };
      }
    })
  };
}

let exitSpy: MockInstance;

beforeEach(() => {
  tenantStream.mockImplementation(
    (_opts: unknown, req: { signal: AbortSignal }): Promise<AsyncIterable<string>> =>
      Promise.resolve(hangUntilAborted(req.signal))
  );
  // `process.exit` never returns in production; here it must, or the branch
  // after it is unreachable and the run ends mid-suite.
  exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  tenantStream.mockReset();
});

/** Start a follow, deliver `signals` in order, and let it settle. */
async function follow(signals: readonly NodeJS.Signals[]): Promise<number> {
  const running = runAppLogsFollow({}, APP_ID, REQUEST);
  // The handler is registered synchronously, before the first await inside
  // `runAppLogsFollow`, so a signal delivered on the next tick always lands.
  await Promise.resolve();
  for (const signal of signals) process.emit(signal, signal);
  return running;
}

describe("a follow's exit code as a function of the signals it received", () => {
  it("CONTROL: the follow really opens the stubbed stream and really aborts it", async () => {
    // Anti-vacuity. If `vi.mock` missed, or the request never reached
    // `tenantStream`, every case below would be asserting against a follow that
    // returned before a signal could matter — and the "not called" cases would
    // be green for the wrong reason.
    await follow(["SIGINT"]);
    expect(tenantStream).toHaveBeenCalledTimes(1);
    const request = tenantStream.mock.calls[0][1] as { signal: AbortSignal };
    expect(request.signal.aborted).toBe(true);
  });

  it("ONE Ctrl-C ends the follow at success, and exits nothing", async () => {
    await expect(follow(["SIGINT"])).resolves.toBe(EXIT_CODES.success);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("ONE SIGTERM ends the follow at success too — the first signal is the first signal", async () => {
    await expect(follow(["SIGTERM"])).resolves.toBe(EXIT_CODES.success);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("a SECOND Ctrl-C exits interrupted", async () => {
    await follow(["SIGINT", "SIGINT"]);
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.interrupted);
  });

  it("Ctrl-C then a supervisor's SIGTERM exits interrupted — ONE counter serves both", async () => {
    await follow(["SIGINT", "SIGTERM"]);
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.interrupted);
  });

  it("SIGTERM then Ctrl-C exits interrupted — the order does not matter either", async () => {
    await follow(["SIGTERM", "SIGINT"]);
    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.interrupted);
  });

  it("two SIGTERMs report 130 and NOT 143 — one signal-band code by design", async () => {
    // 143 is `128 + 15`, which is what a shell reports for a process killed by
    // SIGTERM. This CLI declares exactly one code in the shell's band, so it
    // reports "the caller stopped it" and not which signal did it. The
    // assertion is written against the number a caller reads, so it fails if
    // that decision is ever quietly reversed.
    await follow(["SIGTERM", "SIGTERM"]);
    expect(exitSpy).toHaveBeenCalledWith(130);
    expect(exitSpy).not.toHaveBeenCalledWith(143);
  });

  it("leaves no signal listener behind, so a later signal cannot reach a dead follow", async () => {
    const before = process.listenerCount("SIGINT") + process.listenerCount("SIGTERM");
    await follow(["SIGINT"]);
    expect(process.listenerCount("SIGINT") + process.listenerCount("SIGTERM")).toBe(before);
  });
});
