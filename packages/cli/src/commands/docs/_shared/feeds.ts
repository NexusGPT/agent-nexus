/**
 * The two docs feeds, on the API host.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE FEEDS ARE NOT ON THE DASHBOARD HOST, AND THE DASHBOARD HOST 200s ANYWAY.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * These used to be hardcoded as `https://gpt.nexus/docs/llms-full.txt`.
 * `gpt.nexus` is the DASHBOARD — a static SPA whose `vercel.json` rewrites
 * `/((?!assets/).*)` to `/index.html`. So every path on it answers 200 with the
 * HTML shell, including this one. `res.ok` was true, `res.text()` returned a
 * document, and `nexus docs --full` printed an HTML page as if it were the
 * documentation. Nothing errored and no status code could have revealed it.
 *
 * The feeds are served by the BACKEND: `DocsFeedsController` is `@Controller("docs")`
 * under the `api` global prefix, both routes `@AllowUnauthenticated`, both
 * `Content-Type: text/plain`. So they follow the API base URL, and building them
 * from {@link resolveBaseUrl} is also what makes `--base-url`, `--profile`,
 * `NEXUS_BASE_URL` and `NEXUS_ENV` work here at all — a hardcoded host bypassed
 * the whole precedence chain, so this command could not be pointed at staging or
 * dev in any way.
 *
 * A 200 is not the check. The content type is: an HTML shell arrives at 200 too.
 */
export function feedUrls(baseUrl: string): { full: string; index: string } {
  const root = baseUrl.replace(/\/+$/, "");
  return {
    full: `${root}/api/docs/llms-full.txt`,
    index: `${root}/api/docs/llms.txt`
  };
}

/** A feed that answers 200 with a web page is the dashboard-host bug, not docs. */
export function isPlainText(res: Response): boolean {
  return (res.headers.get("content-type") ?? "").toLowerCase().includes("text/plain");
}

/**
 * How long to wait for a feed when `--timeout` is not given. MILLISECONDS.
 *
 * A default is fine. A CEILING is not, which is the whole of the defect this
 * replaced: the fetch was `AbortSignal.timeout(60_000)` and the global
 * `--timeout <seconds>` was never read, so on a slow link `nexus docs --full`
 * aborted at 60s and the flag that exists for exactly this could not extend it.
 * `llms-full.txt` is ~2.5 MB — the one command in this namespace most likely to
 * need longer, and the one that could not be given it.
 *
 * Named `*_MS` on purpose. `AbortSignal.timeout` takes MILLISECONDS, and the
 * convention `timeout-values-carry-their-unit.test.ts` enforces is that a
 * millisecond slot is fed either `timeoutSecondsToMs(...)` or a `*_MS` constant.
 * This is NOT the NEX-3707 shape — that was a `*_MS` constant handed to a
 * SECONDS parameter. Into a millisecond slot it is the prescribed form.
 */
export const DOCS_FEED_DEFAULT_TIMEOUT_MS = 60_000;

/**
 * The same default in the unit `--timeout` speaks, for the help text and the
 * timeout message. A display divide, never a deadline conversion — the deadline
 * only ever changes unit inside `timeoutSecondsToMs`.
 */
export const DOCS_FEED_DEFAULT_TIMEOUT_SECONDS = DOCS_FEED_DEFAULT_TIMEOUT_MS / 1000;
