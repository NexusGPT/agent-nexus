import type { DepsIo } from "../../../workspace-direct-mount/deps-io";

/**
 * Where WinFsp is installed, from the registry key its installer writes. The
 * installer is 32-bit: on 64-bit Windows its key is under WOW6432Node, and
 * 32-bit Windows has no WOW6432Node, so the key sits under SOFTWARE itself.
 * One script asks both, WOW6432Node first, and keeps the first key found.
 * `-ErrorAction SilentlyContinue` keeps a missing key from being an error, but
 * `-Command` would still exit 1 when the last statement leaves `$?` false, so
 * the script ends with `exit 0`: with neither key it prints nothing and exits
 * 0, which is the "not installed" answer, not a broken probe.
 */
export const WINFSP_INSTALL_DIR_SCRIPT =
  "(Get-ItemProperty -ErrorAction SilentlyContinue " +
  "'HKLM:\\SOFTWARE\\WOW6432Node\\WinFsp','HKLM:\\SOFTWARE\\WinFsp' | Select-Object -First 1).InstallDir; " +
  "exit 0";

/**
 * The three answers the preflight needs: the directory; `null` when the key is
 * absent (the script ran and printed nothing); `"unknown"` when PowerShell
 * could not run, or ran and failed — a missing key never fails the script, so
 * a non-zero exit is PowerShell's own trouble, not an answer about WinFsp. The
 * shape of `macFuseApproved`, read the same way: unknown passes, so rclone
 * meeting the real driver is the better test than a probe that broke.
 */
export function winFspInstallDirFrom(read: string | null): ReturnType<DepsIo["winFspInstallDir"]> {
  if (read === null) return "unknown";
  const dir = read.trim();
  return dir === "" ? null : { dir };
}
