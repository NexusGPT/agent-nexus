import { execFileSync } from "node:child_process";

/** OS-native unmount of a mount point. Best-effort across platforms/engines. */
export function unmountPath(mountPath: string): void {
  const candidates: [string, string[]][] =
    process.platform === "darwin"
      ? [
          ["umount", [mountPath]],
          ["diskutil", ["unmount", mountPath]]
        ]
      : process.platform === "win32"
        ? [] // rclone mount on Windows stops when the process is killed
        : [
            ["fusermount", ["-u", mountPath]],
            ["umount", [mountPath]]
          ];
  for (const [cmd, args] of candidates) {
    try {
      execFileSync(cmd, args, { stdio: "ignore" });
      return;
    } catch {
      /* try the next candidate */
    }
  }
}
