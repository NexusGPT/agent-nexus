import { execFileSync } from "node:child_process";

import type { MountRecord } from "../../mount-registry";
import { davPathOf, type GatewayMountRequest } from "./gateway-mount-request";
import { mintMountToken } from "./mint-mount-token";

/** Mount the Nexus WebDAV gateway with macOS's native `mount_webdav`. */
export async function mountWebdav(request: GatewayMountRequest): Promise<MountRecord> {
  const { slug, baseUrl, apiKey, mountPath, readOnly } = request;
  // `mount_webdav` rejects a URL that carries Basic userinfo OR a query string
  // (IllegalURLComponent — it bails before connecting) and can't send custom
  // headers, and its keychain path is unreliable/interactive. So authenticate
  // with a scoped, expiring token carried in the URL PATH, which the gateway
  // strips before anything logs the request line. Trade-off: the token is
  // visible in this mount process's argv to the same local user — it's scoped +
  // expiring (not the raw key); use `--engine direct` if even that matters.
  const token = await mintMountToken(baseUrl, apiKey, request.timeoutSeconds);
  const url = `${baseUrl}/api/dav/_t/${encodeURIComponent(token)}/${davPathOf(request)}`;

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
