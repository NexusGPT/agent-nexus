/**
 * A DEADLINE ON SILENCE, for a transfer whose size nobody knows in advance.
 *
 * `AbortSignal.timeout(N)` is the right shape for a request whose response is a
 * small document: the whole round trip is bounded, and `N` can be chosen because
 * the size is known. It is the WRONG shape for a download. An abort reaches the
 * body stream as well as the headers, so an elapsed-time budget aborts a
 * transfer that is arriving perfectly — a multi-megabyte preset tarball on a
 * slow link and a dead socket are the same reading to a clock that only counts
 * elapsed time. The cure for "the CLI hangs for ever" would then be "the CLI
 * refuses a download that was going to work", which is the worse of the two
 * defects.
 *
 * So the deadline here counts SILENCE and is re-armed by every chunk: a transfer
 * that keeps arriving never trips it however long it takes, and a connection
 * that stops delivering trips it in `timeout` ms — whether it stopped before the
 * headers or halfway through the body. That is the property a download wants,
 * and it is one an elapsed-time budget structurally cannot express.
 *
 * 🔴 IT READS THE BODY ITSELF, AND THAT IS THE HALF THAT CANNOT BE LEFT TO THE
 * CALLER. A `Response` handed back with its body unread is a deadline that
 * stopped at the headers, and the hang this exists to bound lives in the body:
 * `fetch` resolves the moment the status line arrives, so a socket that sends
 * headers and then goes silent is a permanent hang with the headers phase
 * already green.
 */

/**
 * How long a download may be SILENT before it is abandoned, when `--timeout` is
 * not given. MILLISECONDS.
 *
 * A gap budget, never a total: this is the longest a healthy transfer is
 * expected to pause between chunks, not the longest a transfer may take. So it
 * is generous without ever bounding the size of the thing being fetched.
 *
 * Named `*_MS` on purpose — `timeout-values-carry-their-unit.test.ts` enforces
 * that a millisecond slot is fed either `timeoutSecondsToMs(...)` or a `*_MS`
 * constant.
 */
export const DOWNLOAD_STALL_DEFAULT_TIMEOUT_MS = 60_000;

/** A completed download: the response's own metadata, plus its fully-read body. */
export interface StalledDownload {
  /** The response, with its body already consumed by {@link downloadWithStallDeadline}. */
  readonly response: Response;
  /** Every byte the body carried. Empty for a body-less response. */
  readonly body: Buffer;
}

/**
 * Raised when nothing arrived for `stallMs`. Distinct from an ordinary network
 * throw so a caller can say which of the two happened; both are reported the
 * same way today, and separating them costs a class rather than a message parse.
 */
export class DownloadStalledError extends Error {
  constructor(
    readonly url: string,
    readonly stallMs: number
  ) {
    super(
      `No data from ${url} for ${stallMs} ms — the connection stalled. ` +
        `Raise the budget with --timeout <seconds>, or retry.`
    );
    this.name = "DownloadStalledError";
  }
}

/**
 * Fetch `url` and read its whole body, abandoning the transfer only if it goes
 * silent for `opts.timeout` milliseconds.
 *
 * Non-2xx is NOT an error here — the response comes back for the caller to
 * judge, exactly as a bare `fetch` would, so each caller keeps its own status
 * mapping. The body is read either way, under the same deadline, because an
 * error page can stall just as a payload can.
 */
export async function downloadWithStallDeadline(
  url: string,
  init: RequestInit,
  opts: { timeout: number }
): Promise<StalledDownload> {
  const stallMs = opts.timeout;
  const controller = new AbortController();
  let stalled = false;
  let timer: NodeJS.Timeout | undefined;

  const rearm = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      controller.abort();
    }, stallMs);
  };

  rearm();
  try {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      throw stalled ? new DownloadStalledError(url, stallMs) : err;
    }
    // The headers arrived, so the connection is alive as of now. Anything the
    // body still owes us gets the full budget again rather than the remainder
    // of the one the headers spent.
    rearm();

    if (!response.body) {
      return { response, body: Buffer.alloc(0) };
    }

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        rearm();
        if (value) chunks.push(Buffer.from(value));
      }
    } catch (err) {
      throw stalled ? new DownloadStalledError(url, stallMs) : err;
    }
    return { response, body: Buffer.concat(chunks) };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
