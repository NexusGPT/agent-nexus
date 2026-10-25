import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { failure } from "../../errors";
import { ensureStateSubdir, LOG_DIR } from "../../mount-registry";
import type { RcloneBinary } from "../../workspace-direct-mount/managed-rclone";
import { type MountPlatform, mountPlatformOf } from "../../workspace-direct-mount/mount-platform";
import { redactBucketNames } from "../../workspace-direct-mount/redact-bucket-names";
import { ADVICE_FOR } from "./spawn-rclone-advice";
import { startHidden } from "./win32/start-rclone-hidden";

type Started = { pid: number | undefined; startFailure: string | null };
/** The detached route watches child events (async); the PowerShell route waits inside PowerShell (sync). */
type Start = (
  binary: RcloneBinary,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  logPath: string
) => Promise<Started> | Started;

/**
 * Which route starts rclone. macOS and Linux: a detached child, the log
 * appended to through its fd. Windows: through a hidden PowerShell, the log
 * rewritten by its redirect — `start-rclone-hidden.ts` says why a detached
 * rclone cannot be allowed there (a console window at every key renewal) and
 * why a non-detached one cannot either (it dies with this CLI).
 */
const START_FOR = {
  darwin: startDetached,
  linux: startDetached,
  // rclone runs in the log folder: Windows holds its working folder open for
  // its whole life, and cmd.exe looks there first for a bare name at each renewal.
  win32: (binary, args, env, logPath) => startHidden(binary, args, env, LOG_DIR, logPath)
} as const satisfies Record<MountPlatform, Start>;
const LOG_APPENDS_FOR = { darwin: true, linux: true, win32: false } as const satisfies Record<
  MountPlatform,
  boolean
>;

/**
 * Start `rclone mount` so that it outlives this command, its stderr in
 * `<logName>.log` under the 0700 log directory, and give it two seconds to
 * fail fast. Returns the pid the registry records; throws with the log's tail
 * when rclone never got off the ground.
 *
 * The tail is passed through `redactBucketNames` before it reaches a terminal:
 * rclone names the bucket in every S3 error line, and the log is the one place
 * this CLI would otherwise print it.
 *
 * `binary` is the rclone the preflight probed — the managed copy by full
 * address when one exists — so the process started is the one that was
 * checked, whatever order PATH puts the others in.
 */
export async function spawnRcloneMount(
  binary: RcloneBinary,
  logName: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv
): Promise<number | undefined> {
  ensureStateSubdir(LOG_DIR);
  const logPath = path.join(LOG_DIR, `${logName}.log`);
  const platform = mountPlatformOf(process.platform);
  // Where this run's output starts in an appended log; no log yet is 0.
  const thisRunStart = LOG_APPENDS_FOR[platform]
    ? (fs.statSync(logPath, { throwIfNoEntry: false })?.size ?? 0)
    : 0;

  const { pid, startFailure } = await START_FOR[platform](binary, args, env, logPath);
  if (startFailure === null) return pid;

  let logBytes = Buffer.alloc(0);
  try {
    logBytes = fs.readFileSync(logPath);
  } catch {
    /* log may not exist if spawn never started */
  }
  // Only what THIS run wrote: an earlier run's lines (or another org's mount
  // of the same slug) are no witness of this failure.
  const thisRun = logBytes.subarray(thisRunStart).toString("utf-8");
  const tail = redactBucketNames(thisRun.trim().split("\n").slice(-10).join("\n"));
  // `local-failed` (exit 9), the category every other refusal of this mount
  // uses: a bare Error would exit 1, the "unknown" bucket, and a script
  // could not tell a dead rclone from a crash of this CLI.
  throw failure(
    "local-failed",
    `${startFailure}.${tail ? `\nRecent log:\n${tail}` : ""}\n\nFull log: ${logPath}` +
      ADVICE_FOR[platform](thisRun)
  );
}

/** The macOS and Linux route: a detached child with the log's fd, watched through its own events. */
async function startDetached(
  binary: RcloneBinary,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  logPath: string
): Promise<Started> {
  const logFd = fs.openSync(logPath, "a");
  const child: ChildProcess = spawn(binary, [...args], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env
  });
  // Listen for BOTH "error" (spawn failed — ENOENT/EACCES; an unhandled "error"
  // would otherwise crash the CLI) and "exit" (started but bailed: a refused
  // credential, a missing FUSE library). null = still running.
  const startFailure = await new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 2000);
    child.once("error", (err) => {
      clearTimeout(timer);
      resolve(`failed to start rclone: ${err.message}`);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(`rclone exited immediately (code ${code ?? 1})`);
    });
  });
  if (startFailure === null) child.unref(); // detach so this CLI process can exit while the mount lives on
  return { pid: child.pid, startFailure };
}
