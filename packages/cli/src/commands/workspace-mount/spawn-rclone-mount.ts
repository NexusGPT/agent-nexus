import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { ensureStateSubdir, LOG_DIR } from "../../mount-registry";
import { redactBucketNames } from "../../workspace-direct-mount/redact-bucket-names";

/**
 * Start `rclone mount` detached, its stderr appended to `<logName>.log` under
 * the 0700 log directory, and give it two seconds to fail fast. Returns the
 * pid the registry records; throws with the log's tail when rclone never got
 * off the ground.
 *
 * The tail is passed through `redactBucketNames` before it reaches a terminal:
 * rclone names the bucket in every S3 error line, and the log is the one place
 * this CLI would otherwise print it.
 */
export async function spawnRcloneMount(
  logName: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv
): Promise<number | undefined> {
  ensureStateSubdir(LOG_DIR);
  const logPath = path.join(LOG_DIR, `${logName}.log`);
  const logFd = fs.openSync(logPath, "a");

  const child: ChildProcess = spawn("rclone", [...args], {
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

  if (startFailure !== null) {
    let tail = "";
    try {
      tail = redactBucketNames(
        fs.readFileSync(logPath, "utf-8").trim().split("\n").slice(-10).join("\n")
      );
    } catch {
      /* log may not exist if spawn never started */
    }
    throw new Error(
      `${startFailure}.${tail ? `\nRecent log:\n${tail}` : ""}\n\nFull log: ${logPath}`
    );
  }

  child.unref(); // detach so this CLI process can exit while the mount lives on
  return child.pid;
}
