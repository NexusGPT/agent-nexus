import { NexusApiError, NexusAuthenticationError } from "@agent-nexus/sdk";

import { resolveTenantAuth, tenantHeaders, tenantUrl } from "./tenant-http.auth";
import { parseErrorBody, toTenantApiError } from "./tenant-http.errors";
import { toTenantNetworkError } from "./tenant-http.network-errors";
import { readTextChunks } from "./tenant-http.stream-body";
import type { TenantHttpOptions, TenantStreamOptions } from "./tenant-http.types";

interface ConnectGuard {
  readonly signal: AbortSignal;
  /** Stop the connect deadline. The stream governs its own lifetime after headers. */
  readonly clearConnectTimer: () => void;
  /** Stop the deadline AND stop forwarding the caller's aborts. */
  readonly release: () => void;
}

/**
 * One controller driving the fetch, fed by two sources: the caller's signal
 * (Ctrl-C) and the connect timer. `AbortSignal.any` would say this in one line
 * and is Node 20.3+; this package declares `node >= 18`.
 */
function connectGuard(signal: AbortSignal, connectTimeoutMs: number): ConnectGuard {
  const controller = new AbortController();
  const forwardAbort = (): void => {
    controller.abort();
  };
  if (signal.aborted) controller.abort();
  else signal.addEventListener("abort", forwardAbort, { once: true });

  let connectTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
    controller.abort();
  }, connectTimeoutMs);
  const clearConnectTimer = (): void => {
    if (connectTimer !== undefined) {
      clearTimeout(connectTimer);
      connectTimer = undefined;
    }
  };
  return {
    signal: controller.signal,
    clearConnectTimer,
    release: () => {
      clearConnectTimer();
      signal.removeEventListener("abort", forwardAbort);
    }
  };
}

/**
 * Open a streaming response against a tenant endpoint and yield its text as it
 * arrives.
 *
 * `tenantRequest` cannot serve this: it `await`s the whole body and then demands
 * a `{ success, data }` envelope. The SSE routes are deliberately outside the
 * generated surface and carry no envelope at all — see
 * `vibe-app-log-stream.controller.ts`, which explains why a stream cannot wear
 * one. So this shares the transport's auth, base-URL and error-shape machinery
 * and differs in exactly the two ways it must: it never buffers, and it never
 * interprets the body.
 *
 * FAILURE BEFORE THE FIRST BYTE is a normal HTTP error and is thrown as one, via
 * the same `toTenantApiError` every other tenant command's message comes from.
 * That is the half that matters for a 404: a foreign `appId` and an id that
 * never existed arrive here as the identical response, and nothing in this
 * function can or should tell them apart.
 */
export async function tenantStream(
  opts: TenantHttpOptions,
  req: TenantStreamOptions
): Promise<AsyncIterable<string>> {
  const auth = resolveTenantAuth(opts);
  const url = tenantUrl(opts, req.path, req.query);

  const connectTimeoutMs = req.connectTimeoutMs ?? 30_000;
  const guard = connectGuard(req.signal, connectTimeoutMs);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: tenantHeaders(auth, "text/event-stream"),
      signal: guard.signal
    });
  } catch (err) {
    guard.release();
    // The caller aborting is not a failure — it is what Ctrl-C does, and it must
    // reach the follow driver as an abort rather than as a connection error.
    if (req.signal.aborted) throw err;
    throw toTenantNetworkError(err, connectTimeoutMs);
  }

  // Headers are in. From here the stream governs its own lifetime.
  guard.clearConnectTimer();

  if (!response.ok) {
    const rawBody = await response.text();
    guard.release();
    if (response.status === 401) throw new NexusAuthenticationError();
    throw toTenantApiError(
      parseErrorBody(rawBody),
      { method: "GET", path: req.path },
      response.status
    );
  }

  if (response.body === null) {
    guard.release();
    throw new NexusApiError(
      "INVALID_RESPONSE",
      `GET ${req.path} returned no response body to stream`,
      response.status
    );
  }

  return readTextChunks(response.body, guard.release);
}
