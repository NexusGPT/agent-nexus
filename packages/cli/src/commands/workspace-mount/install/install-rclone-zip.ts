import fs from "node:fs";
import path from "node:path";

import { failure } from "../../../errors";
import { ensureStateSubdir } from "../../../mount-registry";
import type { DepsIo } from "../../../workspace-direct-mount/deps-io";
import { installerEnvFor } from "../../../workspace-direct-mount/install/installer-env";
import { MANAGED_RCLONE, MANAGED_RCLONE_DIR } from "../../../workspace-direct-mount/managed-rclone";
import { downloadVerified } from "./download-verified";

/** What one rclone build is: where its zip is, what it must hash to, which member inside it is the binary. */
export interface RcloneZipSpec {
  readonly url: string;
  readonly sha256: string;
  readonly member: string;
}

/**
 * Put the official rclone at `~/.nexus-mcp/bin/rclone`, or leave the disk as
 * it was. The order is the whole guarantee:
 *
 *   1. download into memory and hash it — nothing is written on a mismatch
 *   2. write the zip into a stage directory named after THIS process
 *   3. `unzip` exactly one member into the stage, mark it executable
 *   4. rename it onto the final path — one atomic step, same directory
 *   5. remove the stage, on success and on every failure
 *
 * The final path is only ever produced by step 4, so it never exists
 * truncated or half-extracted. A live mount running the previous copy keeps
 * its inode: rename swaps the directory entry, it never writes into the
 * running file. The per-process stage name is what lets two mounts that both
 * install not delete each other's download; the lock around the whole plan
 * keeps them from racing at all.
 *
 * `unzip` is the system's, as `workspace pull` already assumes. debt: a
 * `.stage-<pid>` left by a crashed run is not swept; add a sweep of stages
 * whose pid is dead when disk use under `~/.nexus-mcp/bin` is ever reported.
 */
export async function installRcloneZip(io: DepsIo, spec: RcloneZipSpec): Promise<void> {
  const bytes = await downloadVerified(io, spec.url, spec.sha256);
  ensureStateSubdir(MANAGED_RCLONE_DIR);
  const stage = path.join(MANAGED_RCLONE_DIR, `.stage-${process.pid}`);
  fs.mkdirSync(stage, { recursive: true });
  try {
    const zip = path.join(stage, "rclone.zip");
    fs.writeFileSync(zip, bytes);
    extractMember(io, zip, spec.member, stage);
    const extracted = path.join(stage, path.basename(spec.member));
    fs.chmodSync(extracted, 0o755);
    fs.renameSync(extracted, MANAGED_RCLONE);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

/** `unzip -o -q -j <zip> <member> -d <dir>`: overwrite, quiet, junk the folder, one member only. */
function extractMember(io: DepsIo, zip: string, member: string, dir: string): void {
  const outcome = io.run(
    "unzip",
    ["-o", "-q", "-j", zip, member, "-d", dir],
    installerEnvFor(io.env)
  );
  if (outcome.ok) return;
  if (outcome.reason === "not-found") {
    throw failure(
      "local-failed",
      "unzip is not installed, so the downloaded rclone could not be unpacked.",
      "Install unzip (macOS ships it; on Linux: sudo apt-get install unzip), then mount again."
    );
  }
  throw failure(
    "local-failed",
    `unzip exited ${outcome.status ?? "abnormally"} while unpacking ${path.basename(zip)}; nothing was installed.`,
    "Re-run to download it again; if it repeats, the zip's layout no longer matches the pin."
  );
}
