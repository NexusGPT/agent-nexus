import fs from "node:fs";
import path from "node:path";

import { failure } from "../../../errors";
import { ensureStateSubdir } from "../../../mount-registry";
import type { DepsIo, RunOutcome } from "../../../workspace-direct-mount/deps-io";
import { installerEnvFor } from "../../../workspace-direct-mount/install/installer-env";
import { win32InstallerEnvFor } from "../../../workspace-direct-mount/install/win32/win32-installer-env";
import {
  MANAGED_RCLONE_DIR,
  managedRcloneFor
} from "../../../workspace-direct-mount/managed-rclone";
import {
  type MountPlatform,
  mountPlatformOf
} from "../../../workspace-direct-mount/mount-platform";
import { system32Exe } from "../../../workspace-direct-mount/win32/win32-system-exe";
import { downloadVerified } from "./download-verified";
import { removeDownload } from "./downloads-dir";
import { renameOntoManaged } from "./rename-onto-managed";

/** What one rclone build is: where its zip is, what it must hash to, which member inside it is the binary. */
export interface RcloneZipSpec {
  readonly url: string;
  readonly sha256: string;
  readonly member: string;
}

type Extractor = (io: DepsIo, zip: string, member: string, dir: string) => void;

/** The system's unarchiver per platform: `unzip` where it ships, bsdtar (`tar`) on Windows 10 1803+. */
const EXTRACTOR_FOR = {
  darwin: unzipMember,
  linux: unzipMember,
  win32: tarMember
} as const satisfies Record<MountPlatform, Extractor>;

/**
 * Put the official rclone at `~/.nexus-mcp/bin/rclone` (`rclone.exe` on
 * Windows), or leave the disk as it was. The order is the whole guarantee:
 *
 *   1. download into memory and hash it — nothing is written on a mismatch
 *   2. write the zip into a stage directory named after THIS process
 *   3. extract exactly one member into the stage, mark it executable
 *   4. rename it onto the final path — one atomic step, same directory
 *   5. remove the stage, on success and on every failure
 *
 * The final path is only ever produced by step 4, so it never exists
 * truncated or half-extracted. A live mount running the previous copy keeps
 * its inode: rename swaps the directory entry, it never writes into the
 * running file. On Windows the rename and the stage sweep retry on EPERM or
 * EBUSY, because an antivirus holds a fresh file open for a moment.
 *
 * debt: a `.stage-<pid>` left by a crashed run is not swept; add a sweep of
 *       stages whose pid is dead when disk use under `~/.nexus-mcp/bin` is
 *       ever reported.
 */
export async function installRcloneZip(io: DepsIo, spec: RcloneZipSpec): Promise<void> {
  const bytes = await downloadVerified(io, spec.url, spec.sha256);
  const platform = mountPlatformOf(io.platform);
  ensureStateSubdir(MANAGED_RCLONE_DIR);
  const stage = path.join(MANAGED_RCLONE_DIR, `.stage-${String(process.pid)}`);
  fs.mkdirSync(stage, { recursive: true });
  try {
    const zip = path.join(stage, "rclone.zip");
    fs.writeFileSync(zip, bytes);
    EXTRACTOR_FOR[platform](io, zip, spec.member, stage);
    const extracted = path.join(stage, path.basename(spec.member));
    fs.chmodSync(extracted, 0o755);
    await renameOntoManaged(extracted, managedRcloneFor(platform));
  } finally {
    removeDownload(io, stage);
  }
}

/** `unzip -o -q -j <zip> <member> -d <dir>`: overwrite, quiet, junk the folder, one member only. */
function unzipMember(io: DepsIo, zip: string, member: string, dir: string): void {
  const outcome = io.run(
    "unzip",
    ["-o", "-q", "-j", zip, member, "-d", dir],
    installerEnvFor(io.env)
  );
  if (outcome.ok) return;
  refuseExtract(
    outcome,
    "unzip",
    zip,
    "Install unzip (macOS ships it; on Linux: sudo apt-get install unzip)"
  );
}

/**
 * `<System32>\tar.exe -xf <zip> -C <dir> --strip-components=1 <member>`: System32's
 * bsdtar reads zips; under Git Bash a bare `tar` is GNU tar, which cannot.
 */
function tarMember(io: DepsIo, zip: string, member: string, dir: string): void {
  const tar = system32Exe(io.env, "tar.exe");
  const args = ["-xf", zip, "-C", dir, "--strip-components=1", member];
  const outcome = io.run(tar, args, win32InstallerEnvFor(io.env));
  if (outcome.ok) return;
  refuseExtract(outcome, tar, zip, "Windows 10 1803 and later ship tar.exe in System32");
}

function refuseExtract(
  outcome: Exclude<RunOutcome, { ok: true }>,
  program: string,
  zip: string,
  fix: string
): never {
  if (outcome.reason === "not-found") {
    throw failure(
      "local-failed",
      `${program} is not installed, so the downloaded rclone could not be unpacked.`,
      `${fix}, then mount again.`
    );
  }
  throw failure(
    "local-failed",
    `${program} exited ${outcome.status ?? "abnormally"} while unpacking ${path.basename(zip)}; nothing was installed.`,
    "Re-run to download it again; if it repeats, the zip's layout no longer matches the pin."
  );
}
