import { spawn } from "node:child_process";

import { loadCache, type VersionCache } from "./version-check.cache";
import {
  CHECK_INTERVAL_MS,
  FETCH_TIMEOUT_MS,
  getCacheFile,
  getRefreshLockDir,
  REGISTRY_LATEST_URL
} from "./version-check.constants";
import { acquireRefreshLock } from "./version-check.lock";
import { buildRefreshScript } from "./version-check.refresh-script";

/**
 * Refresh the version cache for the NEXT invocation, in a detached child.
 *
 * ── WHY NOT SIMPLY NOT AWAIT THE FETCH ──────────────────────────────────────
 *
 * 🚨 AN UNAWAITED `fetch` DOES NOT MAKE THE CLI FASTER. It keeps a handle on the
 * event loop, so node refuses to exit until the request settles — the wait moves
 * from before the last line of output to after it, and the user's shell prompt
 * is held for exactly as long. Measured on 0.26.0 against a registry that never
 * answers: output complete at 90 ms, process exit at 10.6 s. The AbortController
 * ceiling of 3 s rejects the PROMISE and does not close the pending connection,
 * so the remaining ~7 s is undici's own connect timeout. Only a separate process
 * removes the wait rather than relocating it.
 *
 * ── THE TRADE, NAMED ────────────────────────────────────────────────────────
 *
 * The current run answers from whatever is already on disk. A version published
 * in the last few minutes is therefore announced one invocation late. Against a
 * 24-hour check interval that lag is noise, and it buys every invocation an exit
 * that never waits on the network.
 *
 * Never throws, and never writes a byte to stdout. It runs before every command,
 * on a CLI whose `--json` output must stay one parseable document, so a spawn
 * that fails — no `execPath`, a read-only filesystem, a sandbox that forbids
 * `spawn`, a container with no writable home — has to be indistinguishable from
 * one that succeeded.
 */
function scheduleCacheRefresh(): void {
  try {
    if (!process.execPath) return;
    const lockDir = getRefreshLockDir();
    if (!acquireRefreshLock(lockDir)) return;

    const script = buildRefreshScript({
      cacheFile: getCacheFile(),
      lockDir,
      url: REGISTRY_LATEST_URL,
      timeoutMs: FETCH_TIMEOUT_MS
    });

    const child = spawn(process.execPath, ["-e", script], {
      detached: true,
      // Not "inherit", and not a pipe either. A pipe would leave the parent
      // holding the read end and re-couple the two lifetimes.
      stdio: "ignore",
      windowsHide: true
    });
    // 🚨 THE try/catch AROUND THIS CANNOT CATCH A FAILED START, AND THE CRASH
    // LANDS AFTER THE COMMAND HAS ALREADY PRINTED ITS OUTPUT.
    //
    // `spawn` returns a handle before the child exists. A start that fails —
    // ENOENT on an `execPath` that moved, EACCES or EPERM in a sandbox, EAGAIN
    // when the process table is full — is reported ASYNCHRONOUSLY, as an
    // `error` event on that handle, long after this function has returned. An
    // `error` event with no listener is not swallowed by anything: `EventEmitter`
    // throws it, and it becomes an uncaught exception that tears the process
    // down. So the one environment where a background refresh must be least
    // visible is the one where it would kill the command, on the way out, with a
    // stack trace about a process the user never asked for.
    //
    // Empty on purpose. There is nothing to report and nowhere to report it:
    // stdout must stay one parseable document under `--json`, and stderr would
    // put a warning about the CLI's own housekeeping on top of the command's
    // real output.
    child.on("error", () => undefined);
    // Without this the parent still waits for the child to exit, which is the
    // whole defect wearing a new shape.
    child.unref();
  } catch {
    // The SYNCHRONOUS half — invalid arguments, and a mocked `spawn` that
    // throws. The listener above is the asynchronous half; both are needed, and
    // neither covers the other.
  }
}

/**
 * The cached `latest`, plus a refresh scheduled when it has expired.
 *
 * Single copy of the read-and-maybe-schedule decision, so the notice path and
 * the self-install path can never disagree about what "fresh" means.
 */
export function readCacheAndScheduleRefresh(): VersionCache | null {
  const cache = loadCache();
  const isFresh = cache !== null && Date.now() - cache.lastChecked < CHECK_INTERVAL_MS;
  if (!isFresh) scheduleCacheRefresh();
  return cache;
}
