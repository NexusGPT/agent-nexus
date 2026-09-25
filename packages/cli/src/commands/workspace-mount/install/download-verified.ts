import { createHash } from "node:crypto";

import { failure } from "../../../errors";
import type { DepsIo } from "../../../workspace-direct-mount/deps-io";

/**
 * The bytes at `url`, only if they hash to `sha256`. The whole file is held in
 * memory and hashed BEFORE anything is written, so a download that is
 * truncated, replaced at the vendor, rewritten by a proxy, or fetched from a
 * mistyped URL never reaches the disk — all four look the same to this check,
 * which is the point. The largest artifact is rclone's zip, about 30 MB; a
 * streaming hash is warranted only for something far larger.
 *
 * Both installers share this one door: the rclone zip and the FUSE-T pkg are
 * verified by the same lines, so a bump of either pin cannot skip the check.
 */
export async function downloadVerified(
  io: DepsIo,
  url: string,
  sha256: string
): Promise<Uint8Array> {
  let bytes: Uint8Array;
  try {
    bytes = await io.download(url);
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw failure(
      "local-failed",
      `Could not download ${url}: ${cause}`,
      "Check the network, or download it yourself with the commands shown above."
    );
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== sha256) {
    throw failure(
      "local-failed",
      `${url} did not match its pinned sha256, so nothing was installed.`,
      `Expected ${sha256}, got ${actual}. A truncated or altered download; try again, ` +
        "and if it repeats, do not install this file."
    );
  }
  return bytes;
}
