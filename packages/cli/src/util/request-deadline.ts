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
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    return { response, text };
  } catch (err) {
    // `AbortError` is what an aborted fetch and an aborted body read both reject
    // with, so this one branch covers the whole window the timer was armed for.
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new RequestTimedOutError(url, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
