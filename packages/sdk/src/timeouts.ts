/**
 * How long a request may run before the client stops waiting.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A DEADLINE BELONGS TO THE OPERATION, NOT TO THE TRANSPORT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `HttpClient` had ONE number — 30 s — and every route inherited it. Most routes
 * read or write a row and answer in milliseconds, so 30 s is generous. A handful
 * run a MODEL, or wait on a third-party API, before they can answer anything at
 * all: those take minutes, by design, on exactly the inputs users care about.
 *
 * Under one shared number those two classes cannot both be served. 30 s kills
 * the second class; raising the shared number to ten minutes would make a
 * genuinely unreachable API hang a script for ten minutes on a `GET /models`.
 *
 * NEX-2492 is the first class colliding with the second: `POST
 * /skills/tasks/:taskId/execute` on a frontier model with structured JSON output
 * takes 60–90 s, so it aborted at 30 s EVERY time while the server ran to
 * completion and billed the generation. It was reported against the CLI, which
 * patched its own `task execute` command with a local constant — but the CLI is
 * one door onto that route. The SDK is the published client every other caller
 * uses, and it still capped the same request at 30 s.
 *
 * So the deadline is stated where the fact lives: each long-running method
 * passes {@link LONG_RUNNING_TIMEOUT_MS} as its own `timeoutMs`, and
 * `HttpClient` uses it only when the caller has NOT stated a deadline of their
 * own. A caller who passes `timeout` to the client still overrides everything —
 * that is the contract the CLI's global `--timeout <seconds>` flag rests on.
 *
 * `long-running-operations.test.ts` holds the membership of that set, so a new
 * synchronous model-running route cannot quietly inherit 30 s again.
 */

/**
 * The deadline for an ordinary request: a read, or a write that does not run a
 * model.
 *
 * Sized to be long enough that a slow link never trips it and short enough that
 * an unreachable host fails fast rather than hanging a script.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/**
 * The deadline for a request that runs a model — or waits on a third party that
 * may itself run one — before it can answer.
 *
 * Ten minutes, not a "safe" 60 s: the point of this number is that hitting it
 * means something is genuinely wrong, not that the generation was long. A client
 * timeout does NOT stop the server, so a deadline set just above the typical
 * case converts slow-but-correct generations into requests the caller pays for
 * and never sees.
 */
export const LONG_RUNNING_TIMEOUT_MS = 600_000;
