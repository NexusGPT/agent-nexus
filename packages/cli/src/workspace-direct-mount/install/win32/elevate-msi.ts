import { powerShellExe } from "../../win32/win32-system-exe";

/**
 * The one road that raises the UAC prompt for `msiexec` ALONE — never for the
 * CLI, never for rclone: a drive created by an elevated process is invisible
 * to every other account. The script builds a .NET `ProcessStartInfo` with
 * the `runas` verb and `UseShellExecute`, which asks on the secure desktop,
 * then `Process.Start` launches msiexec, `WaitForExit` waits for it, and the
 * script exits with its exit code. PowerShell and msiexec are both named by
 * their System32 address: a bare name is looked up in the current folder
 * first, and this road ends behind an administrator's approval.
 *
 * Before msiexec, the script opens the MSI with `FileShare.Read` and hashes
 * it THROUGH THAT HANDLE, which it never closes: the handle lives until the
 * script exits, after msiexec. With the share set to Read, no other process
 * of this account can write to the file, rename it or delete it while the
 * handle is open, and the Windows Installer service reads it. So the bytes
 * hashed are the bytes installed. Without this, the MSI sat in the
 * user-writable downloads folder between the CLI's own hash check and the
 * elevated msiexec, and any program running as this user could have swapped
 * it in that gap for one the administrator then installed. A hash that does
 * not match, or a file that cannot be read back, exits `MSI_CHANGED_EXIT`
 * before any prompt appears.
 *
 * `Process.Start` is called directly, not through `Start-Process`, because
 * `Start-Process` catches the `Win32Exception` of a declined prompt and
 * rethrows an `InvalidOperationException` with no inner exception, so the
 * 1223 is lost. Here the `Win32Exception` is caught by type: 1223 (the prompt
 * was declined, or had no desktop to appear on) exits 1223; any other throw
 * exits `ELEVATION_FAILED_EXIT`, this road's own "the elevation request failed
 * before msiexec ran".
 *
 * The MSI path, the log path and the expected hash travel in THREE
 * ENVIRONMENT VARIABLES and are read back by the script — never spliced into
 * its text — so a profile folder with a space, a quote or a non-ASCII letter
 * stays one argument. `/qn` is silent, `/norestart` leaves the restart to the
 * person (the exit code says when), `/l*v` writes the verbose log an
 * administrator can act on. The arguments are ONE string, joined by the
 * script, with each path in double quotes.
 */
export const WINFSP_MSI_ENV = "NEXUS_WINFSP_MSI";
export const WINFSP_LOG_ENV = "NEXUS_WINFSP_LOG";
export const WINFSP_SHA256_ENV = "NEXUS_WINFSP_SHA256";

/** The exit this road reserves for a throw that is not the 1223 decline. */
export const ELEVATION_FAILED_EXIT = 2;
/** The exit this road reserves for an MSI that could not be read back, or no longer hashed to the pin. */
export const MSI_CHANGED_EXIT = 3;

const FAILED = String(ELEVATION_FAILED_EXIT);
const CHANGED = String(MSI_CHANGED_EXIT);

const SCRIPT =
  `try { $f = [IO.File]::Open($env:${WINFSP_MSI_ENV}, 'Open', 'Read', 'Read'); ` +
  "$h = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($f)).Replace('-', '').ToLowerInvariant() } " +
  // Only a file that could not be read is "changed"; a PowerShell that refuses the call (Constrained Language Mode) is not.
  `catch [IO.IOException], [UnauthorizedAccessException] { exit ${CHANGED} } catch { exit ${FAILED} }; ` +
  `if ($h -ne $env:${WINFSP_SHA256_ENV}) { exit ${CHANGED} }; ` +
  "$psi = New-Object System.Diagnostics.ProcessStartInfo ($env:SystemRoot + '\\System32\\msiexec.exe'), " +
  `('/i "' + $env:${WINFSP_MSI_ENV} + '" /qn /norestart /l*v "' + $env:${WINFSP_LOG_ENV} + '"'); ` +
  "$psi.Verb = 'runas'; $psi.UseShellExecute = $true; " +
  "try { $p = [Diagnostics.Process]::Start($psi); $p.WaitForExit(); exit $p.ExitCode } " +
  "catch [ComponentModel.Win32Exception] { " +
  `if ($_.Exception.NativeErrorCode -eq 1223) { exit 1223 }; exit ${FAILED} } ` +
  `catch { exit ${FAILED} }`;

const ARGS = [
  "-NoProfile",
  "-NonInteractive",
  "-ExecutionPolicy",
  "Bypass",
  "-Command",
  SCRIPT
] as const;

/** The program and arguments of the road, for the machine whose environment is `env`. */
export function elevateMsiRoad(env: NodeJS.ProcessEnv): {
  readonly file: string;
  readonly args: typeof ARGS;
} {
  return { file: powerShellExe(env), args: ARGS };
}
