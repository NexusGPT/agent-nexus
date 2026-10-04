import { LONG_RUNNING_TIMEOUT_MS } from "@agent-nexus/sdk";

import { seconds } from "../../../client";

/**
 * Default timeout for `task execute`, in seconds. Structured-JSON generations
 * on slow frontier models routinely exceed the SDK's 30 s default, and the
 * server keeps processing after the client gives up — so this command waits
 * far longer by default. An explicit global `--timeout` still wins.
 *
 * DERIVED from the SDK's own deadline for this class of route rather than
 * restated, so the number in `--help` and the number a direct SDK caller gets
 * cannot drift apart. Stated in seconds because that is what `createClient`
 * takes — see the `Seconds` brand in `../client`.
 */
export const EXECUTE_DEFAULT_TIMEOUT_SECONDS = seconds(LONG_RUNNING_TIMEOUT_MS / 1000);
