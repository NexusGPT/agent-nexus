import { NexusApiError, NexusAuthenticationError, NexusConnectionError } from "@agent-nexus/sdk";

import { timeoutSecondsToMs } from "../../client";
import { fetchWithDeadline } from "../../util/request-deadline";

/**
 * The token mint's deadline when `--timeout` is not given. MILLISECONDS. A
 * DEFAULT, never a ceiling — `GatewayMountRequest.timeoutSeconds` carries the
 * global and moves it.
 */
const MOUNT_TOKEN_DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Mint a scoped, expiring mount token from the API key (header auth).
 *
 * 🚨 THIS IS A RAW `fetch`, SO IT INHERITS NONE OF THE SDK'S ERROR TAXONOMY —
 * AND `handleError` CODES BY CLASS, NOT BY MESSAGE.
 *
 * A bare `fetch` rejection is a `TypeError`. It matches no branch in
 * `handleError`, so it fell all the way through to `CLI_UNKNOWN_ERROR` — a plain
 * unreachable-API failure reported as "something unknown happened", on a command
 * that had already diagnosed it. A non-2xx was the same story one line down: a
 * plain `Error` carrying the status only inside its message, where nothing reads
 * it.
 *
 * So every throw below raises the error the SDK transport would have raised for
 * the same failure. `workspace mount` then reports the same cause under the same
 * code as every command that goes through the client, and the mount route stops
 * being the one place in the CLI where a network failure is anonymous.
 *
 * The cause's own message is folded into the connection error rather than
 * dropped: the code is what the caller branches on, but the text is what a human
 * debugs with.
 */
export async function mintMountToken(
  baseUrl: string,
  apiKey: string,
  timeoutSeconds: number | undefined
): Promise<string> {
  // 🔴 AND IT CARRIED NO DEADLINE, WHICH ON THIS ROUTE IS WORSE THAN A SLOW
  // MOUNT. A gateway that accepts the connection and never answers left
  // `workspace mount` pending for ever with nothing printed — and the mount it
  // was about to perform never happened either, so the drive simply never
  // appeared and no error ever said why.
  let res: Response;
  let text: string;
  try {
    ({ response: res, text } = await fetchWithDeadline(
      `${baseUrl}/api/dav/_token`,
      { headers: { "api-key": apiKey } },
      { timeout: timeoutSecondsToMs(timeoutSeconds) ?? MOUNT_TOKEN_DEFAULT_TIMEOUT_MS }
    ));
  } catch (cause) {
    const detail = cause instanceof Error ? `: ${cause.message}` : "";
    throw new NexusConnectionError(
      `Could not reach ${baseUrl} to mint a mount token${detail}`,
      cause instanceof Error ? cause : undefined
    );
  }
  if (!res.ok) {
    // MIRROR `http-client.ts`'s OWN MAPPING, never a code this file invents.
    // `handleError` prints `NexusApiError.code` as-is, so a CLI-minted
    // `MOUNT_TOKEN_FAILED` would read as a code the SERVER sent. Worse, it
    // routes by CLASS first: a 401 raised as a plain `NexusApiError` skips the
    // `NexusAuthenticationError` branch entirely and loses the "run nexus auth
    // login" hint — the one remedy that matters for the failure most likely
    // here. `HTTP_${status}` is the SDK's default for every other status, so
    // this route reports exactly what the same failure reports everywhere else.
    const message = `Failed to mint a mount token: ${text}`;
    throw res.status === 401
      ? new NexusAuthenticationError(message)
      : new NexusApiError(`HTTP_${res.status}`, message, res.status);
  }
  const body: unknown = JSON.parse(text);
  const token = tokenOf(body);
  if (!token) throw new Error("The mount-token endpoint returned no token.");
  return token;
}

/** The `token` string of a token document; undefined for any other shape, which the caller refuses. */
function tokenOf(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("token" in body)) return undefined;
  return typeof body.token === "string" ? body.token : undefined;
}
