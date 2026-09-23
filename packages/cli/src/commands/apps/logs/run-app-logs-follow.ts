/**
 * `nexus apps logs <appId> --follow` — open the follow, print it, and tear it
 * down on every path out.
 *
 * The command's body lives in this folder rather than inline in `apps.ts` for
 * one reason: almost none of it is about HTTP. Flag resolution, the SSE frame
 * vocabulary, the terminal rules of a follow and the rendering are all pure
 * functions over values a test can hand them. This file is the thin part — it
 * opens a socket, installs the signal handlers and unwinds.
 *
 * ## Two endpoints, two shapes, one command
 *
 * The page read rides `ZVibe` and returns the usual `{ success, data }` envelope,
 * so it goes through `tenantRequest` like every other Vibe read. The follow is
 * deliberately OUTSIDE that surface — a `text/event-stream` carrying data-only
 * frames, no envelope, no generated client — so it goes through `tenantStream`.
 * There is no symmetry to assume between them and this module does not pretend
 * there is.
 */

import { EXIT_CODES } from "../../../exit-codes";
import { type TenantHttpOptions, tenantStream } from "../../../util/tenant-http";
import type { AppLogsRequest } from "./app-logs-request";
import { describeFollowFailure } from "./describe-follow-failure";
import { emitLogLines } from "./emit-log-lines";
import { followLogStream } from "./follow-log-stream";
import { noteFollowEnd } from "./note-follow-end";
import { toLogQuery } from "./to-log-query";

/**
 * ## Ctrl-C
 *
 * Installing a `SIGINT` listener REPLACES Node's default terminate, which is the
 * only way a stop can be clean: the abort reaches the socket, the reader is
 * cancelled, and the process exits 0 with no stack trace and no connection left
 * open. It also means a follow that failed to unwind would hang instead of
 * dying, so a SECOND Ctrl-C exits hard — the escape hatch costs three lines and
 * its absence would be a wedged terminal.
 *
 * `SIGTERM` is handled the same way, so a supervisor stopping this gets the same
 * clean teardown a person does.
 *
 * ## Why `finally` aborts as well
 *
 * Every exit from this function must release the socket, including the ones
 * nobody planned: a throw inside the render callback, a malformed frame, an
 * unexpected error. `abort()` is idempotent, so calling it on the happy path
 * costs nothing and calling it on every other path is the whole guarantee.
 *
 * Frames carry their lines OLDEST FIRST — a follow moves forward — so unlike the
 * page read there is nothing to reverse here.
 *
 * 🚨 THIS FILE'S PATH AND THIS FUNCTION'S SHAPE ARE BOTH READ BY GATES.
 * The `process.exit(EXIT_CODES.interrupted)` below is the package's ONLY
 * producer of 130, so `src/every-zero-exit-path-is-ledgered.test.ts` keys its
 * ledger on this path and `src/exit-code-taxonomy.test.ts` asserts an
 * exactly-one-element array naming it — moving this file means editing both.
 * That same taxonomy resolves the exit-producing closure by matching
 * `function runAppLogsFollow(` and requires exactly ONE definition of the name,
 * so this must stay a `function` DECLARATION, uniquely named, returning
 * `EXIT_CODES` members rather than bare integers.
 */
export async function runAppLogsFollow(
  opts: TenantHttpOptions,
  appId: string,
  request: AppLogsRequest
): Promise<number> {
  const controller = new AbortController();
  let interrupts = 0;
  const onInterrupt = (): void => {
    interrupts += 1;
    if (interrupts > 1) process.exit(EXIT_CODES.interrupted);
    controller.abort();
  };
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onInterrupt);

  try {
    let chunks: AsyncIterable<string>;
    try {
      chunks = await tenantStream(opts, {
        path: `/api/vibe/apps/${encodeURIComponent(appId)}/logs/stream`,
        query: toLogQuery(request),
        signal: controller.signal
      });
    } catch (err) {
      // Ctrl-C landed before the headers did. That is a deliberate stop, not a
      // connection failure, and reporting it as one would print an error for
      // something the user chose.
      if (controller.signal.aborted) return EXIT_CODES.success;
      throw err;
    }

    const outcome = await followLogStream(chunks, controller.signal, emitLogLines);
    const failure = describeFollowFailure(outcome);
    if (failure !== null) throw new Error(failure);
    noteFollowEnd(outcome);
    return EXIT_CODES.success;
  } finally {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onInterrupt);
    controller.abort();
  }
}
