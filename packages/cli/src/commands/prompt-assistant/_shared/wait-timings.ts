import { seconds } from "../../../client";

/**
 * How long `prompt-assistant chat` waits on the API before giving up. The
 * assistant runs LLM calls that take minutes, so this sits far above the SDK's
 * 30 s default.
 *
 * SECONDS — the unit `createClient` takes, and the unit of the global
 * `--timeout <seconds>` flag it overrides. A MILLISECOND value here is
 * multiplied by 1000 a second time, overflows Node's 32-bit timer, is clamped
 * to 1 ms, and aborts every chat before the request leaves the machine
 * (NEX-3707). `timeoutSecondsToMs` now refuses such a value outright.
 */
export const PROMPT_ASSISTANT_DEFAULT_TIMEOUT_SECONDS = seconds(2 * 60 * 60);

/** Maximum time the reply poll waits without `--wait` (5 min). */
export const POLL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * How long `--wait` blocks before giving up, when `--wait-timeout` is not given.
 *
 * Thirty minutes because the two threads NEX-2923 was filed over took 13 and 26
 * minutes to reach `completed`, measured end-to-end in production. A default
 * under the observed maximum is a default that times out on the exact case the
 * flag exists for.
 */
export const DEFAULT_WAIT_SECONDS = 30 * 60;

/**
 * Ceiling on a single server-held wait, mirroring the API's own cap.
 *
 * Not imported from `@nexus/types`: this package talks to the API through
 * `@agent-nexus/sdk` and does not depend on the contract package. The value is
 * a property of the proxy in front of the API (a request is cut at 60 s), and
 * the server re-validates it — a client that asked for more would get a 400,
 * not a longer hold.
 */
export const MAX_AWAIT_SECONDS = 55;
