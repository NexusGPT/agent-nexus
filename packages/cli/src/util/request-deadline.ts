/**
 * A TOTAL DEADLINE for a request whose response is a DOCUMENT — an API
 * envelope, a token, a listing. Bounded size, so bounded time is a fair
 * demand.
 *
 * 🔴 IT COVERS THE BODY READ, AND THAT IS THE HALF EVERY HAND-ROLLED COPY OF
 * THIS GETS WRONG. `fetch` resolves the instant the status line arrives, so the
 * obvious shape — arm a timer, `await fetch`, `clearTimeout`, then `await
 * res.text()` — bounds the headers and leaves the body unbounded. A socket that
 * answers `200 OK` and then goes silent hangs for ever with the deadline already
 * cleared, which is the same defect the deadline was added to fix, one step
 * later and harder to see. So this reads the body itself and clears the timer
 * only after it has.
 *
 * ⚠️ IT IS THE WRONG SHAPE FOR A DOWNLOAD, and reaching for it there trades a
 * hang for a refused transfer that was going to succeed. Use
 * `stall-deadline.ts`, which budgets SILENCE rather than elapsed time, whenever
 * the size of the response is not knowable before it starts.
 */

/**
 * Nothing arrived within the budget. A class rather than a message, so a caller
 * maps it without parsing English — the two failures reach the same `catch` and
 * an unreachable host is a different remedy from a deadline that was too tight.
 */
export class RequestTimedOutError extends Error {
  constructor(
    readonly url: string,
    readonly timeoutMs: number
  ) {
    super(`no response within ${timeoutMs} ms. Raise the budget with --timeout <seconds>.`);
    this.name = "RequestTimedOutError";
  }
}

/** A completed request: the response, and the body text already read under the deadline. */
export interface DeadlinedResponse {
  /** The response, with its body already consumed by {@link fetchWithDeadline}. */
  readonly response: Response;
  /** The whole body, as text. Empty string for a body-less response. */
  readonly text: string;
}

/**
 * Send a request and read its whole body, abandoning both if the pair takes
 * longer than `opts.timeout` milliseconds.
 *
 * A non-2xx status is NOT an error here — the response comes back for the caller
 * to judge, exactly as a bare `fetch` would, so each transport keeps its own
 * status mapping. The body is read either way and under the same deadline,
 * because an error page stalls as readily as a payload does.
 */
export async function fetchWithDeadline(
  url: string,
  init: RequestInit,
  opts: { timeout: number }
): Promise<DeadlinedResponse> {
  const timeoutMs = opts.timeout;
  const controller = new AbortController();
  // 🔴 THE FLAG IS THE CLASSIFIER, NEVER THE THROWN TYPE — the same idiom
  // `stall-deadline.ts` uses, and for a measured reason rather than for symmetry.
  // "Did MY timer fire" is a fact this function owns; "did the rejection ARRIVE
  // as an `AbortError`" is a guess about undici's teardown, and the two disagree
  // in BOTH directions. Measured against a real listener that destroys the socket
  // as the budget expires: 2 of 140 attempts rejected with `TypeError: terminated`
  // (cause `SocketError: other side closed`) rather than `AbortError`, because the
  // peer's destroy won the race with our own abort. Those are OUR deadline, and
  // the type test handed the caller a raw transport error instead — the one
  // reading that matters, since `admin-http.ts` turns this into an EXIT CODE and
  // a deadline on a write is not the retryable category an unreachable host is.
  // The other direction is the same defect mirrored: an `AbortError` this timer
  // did not cause reported as `no response within <budget> ms` over a budget that
  // had not begun to elapse. No caller can produce that one today — every one of
  // them passes an `init` with no `signal` and no stream body — so it is a
  // property of the helper rather than a live bug, and it costs nothing to be
  // right about.
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    return { response, text };
  } catch (err) {
    // One branch covers the whole window the timer was armed for: the request and
    // the body read are both inside it, and both reject when it aborts them.
    if (timedOut) throw new RequestTimedOutError(url, timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
