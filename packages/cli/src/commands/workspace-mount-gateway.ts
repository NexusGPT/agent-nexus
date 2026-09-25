import { execFileSync } from "node:child_process";

import { NexusApiError, NexusAuthenticationError, NexusConnectionError } from "@agent-nexus/sdk";

import { timeoutSecondsToMs } from "../client";
import type { Engine, MountRecord } from "../mount-registry";
import { fetchWithDeadline } from "../util/request-deadline";
import type { InstallPolicy } from "../workspace-direct-mount/install/install-policy";
import type { RcloneBinary } from "../workspace-direct-mount/managed-rclone";
import { ensureRcloneCanMount } from "./workspace-mount/ensure-rclone-can-mount";
import type { MountOutcome } from "./workspace-mount/mount-outcome";
import { spawnRcloneMount } from "./workspace-mount/spawn-rclone-mount";

/**
 * The token mint's deadline when `--timeout` is not given. MILLISECONDS. A
 * DEFAULT, never a ceiling — `GatewayMountRequest.timeoutSeconds` carries the
 * global and moves it.
 */
const MOUNT_TOKEN_DEFAULT_TIMEOUT_MS = 30_000;

// ── Native WebDAV (macOS `mount_webdav`) ──────────────────────────────────────

/** Mint a scoped, expiring mount token from the API key (header auth). */
/**
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
async function mintMountToken(
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

async function mountWebdav(request: GatewayMountRequest): Promise<MountRecord> {
  const { slug, davPath, baseUrl, apiKey, mountPath, readOnly } = request;
  // `mount_webdav` rejects a URL that carries Basic userinfo OR a query string
  // (IllegalURLComponent — it bails before connecting) and can't send custom
  // headers, and its keychain path is unreliable/interactive. So authenticate
  // with a scoped, expiring token carried in the URL PATH, which the gateway
  // strips before anything logs the request line. Trade-off: the token is
  // visible in this mount process's argv to the same local user — it's scoped +
  // expiring (not the raw key); use `--engine direct` if even that matters.
  const token = await mintMountToken(baseUrl, apiKey, request.timeoutSeconds);
  const url = `${baseUrl}/api/dav/_t/${encodeURIComponent(token)}/${davPath}`;

  const args: string[] = [];
  if (readOnly) args.push("-o", "ro");
  args.push(url, mountPath);
  try {
    execFileSync("mount_webdav", args, { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    const stderr = stderrOf(e)?.toString().trim();
    throw new Error(
      `mount_webdav failed${stderr ? `: ${stderr}` : ""}.\n` +
        `If this is a self-signed/dev server, the native client requires a trusted HTTPS cert; ` +
        `use \`--engine direct\` there instead — it never talks to the gateway.`
    );
  }
  return {
    slug,
    engine: "webdav",
    mountPath,
    baseUrl,
    mountedAt: new Date().toISOString()
  };
}

/** The captured stderr of a failed `execFileSync` (piped, so a Buffer); undefined for anything else thrown. */
function stderrOf(thrown: unknown): Buffer | undefined {
  if (typeof thrown !== "object" || thrown === null || !("stderr" in thrown)) return undefined;
  return Buffer.isBuffer(thrown.stderr) ? thrown.stderr : undefined;
}

// ── The rclone engine: the gateway over FUSE ──────────────────────────────────

/**
 * Mount the Nexus WebDAV gateway through rclone. The API key travels in
 * rclone's environment (`RCLONE_WEBDAV_HEADERS`), never in argv, so the process
 * list does not show it. Tuned for freshness over caching — it is a live
 * shared drive.
 */
async function mountRclone(
  request: GatewayMountRequest,
  binary: RcloneBinary
): Promise<MountRecord> {
  const { slug, davPath, baseUrl, apiKey, mountPath, readOnly } = request;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    RCLONE_WEBDAV_URL: `${baseUrl}/api/dav/${davPath}`,
    RCLONE_WEBDAV_VENDOR: "other",
    RCLONE_WEBDAV_HEADERS: `api-key,${apiKey}`
  };
  const args = [
    "mount",
    ":webdav:",
    mountPath,
    "--vfs-cache-mode",
    "writes",
    "--dir-cache-time",
    "5s",
    "--poll-interval",
    "5s"
  ];
  if (readOnly) args.push("--read-only");
  const pid = await spawnRcloneMount(binary, slug, args, env);
  return {
    slug,
    engine: "rclone",
    mountPath,
    baseUrl,
    pid,
    mountedAt: new Date().toISOString()
  };
}

/** The engines that speak to the Nexus gateway; which one is the platform's call. */
export type GatewayEngine = Exclude<Engine, "direct">;

/**
 * A gateway engine after its local preflight. The rclone arm carries the one
 * binary the spawn may run, so a mount cannot be reached without settling
 * first: the only way to hold one is `settleGatewayMount`'s return value.
 */
export type GatewaySettlement =
  | { readonly engine: "webdav" }
  | { readonly engine: "rclone"; readonly binary: RcloneBinary };

/**
 * What a gateway mount needs, as NAMED fields rather than a positional run.
 *
 * `slug`, `davPath`, `baseUrl`, `apiKey` and `mountPath` are five consecutive
 * strings: passed positionally, swapping any two type-checks and produces a
 * drive that 401s or serves the wrong path, and the switch below cannot catch it
 * because five strings satisfy any signature structurally. `DirectMountRequest`
 * beside it already takes this shape for the same reason.
 */
interface GatewayMountRequest {
  readonly settled: GatewaySettlement;
  readonly slug: string;
  readonly davPath: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly mountPath: string;
  readonly readOnly: boolean;
  /** The global `--timeout`, in SECONDS. Unset leaves the mint's own default. */
  readonly timeoutSeconds?: number;
}

/**
 * A gateway engine settles only its spawn's preflight: rclone must be able to
 * mount — offering to install what is missing, as `policy` allows — and webdav
 * needs nothing.
 */
export async function settleGatewayMount(
  engine: GatewayEngine,
  policy: InstallPolicy
): Promise<GatewaySettlement> {
  switch (engine) {
    case "webdav":
      return { engine };
    case "rclone":
      return { engine, binary: await ensureRcloneCanMount(engine, policy) };
    default:
      return engine satisfies never;
  }
}

function mountSettled(request: GatewayMountRequest): Promise<MountRecord> {
  const { settled } = request;
  switch (settled.engine) {
    case "webdav":
      return mountWebdav(request);
    case "rclone":
      return mountRclone(request, settled.binary);
    default:
      return settled satisfies never;
  }
}

export async function mountGateway(request: GatewayMountRequest): Promise<MountOutcome> {
  return {
    record: await mountSettled(request),
    grantedReadOnly: false,
    pendingUploads: null,
    // A gateway mount never mints, so it never hears the server's name for the
    // org. The caller falls back to the profile's copy, exactly as before.
    serverOrgName: null
  };
}
