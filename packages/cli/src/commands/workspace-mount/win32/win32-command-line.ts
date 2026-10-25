/**
 * The PowerShell script that prints one process's command line, or nothing at
 * all when no process has that pid — the Windows half of "is the pid a row
 * recorded still an `rclone mount`". Windows withholds the command line of
 * another account's process (a SYSTEM service, an elevated rclone.exe) from a
 * normal token, so the script then prints the image name, which WMI fills for
 * every process. The pid is the only spliced value; a pid that is not a whole
 * number is a corrupt registry row, so it throws rather than reaching a shell.
 */
export function win32CommandLineScript(pid: number): string {
  if (!Number.isInteger(pid) || pid < 0) throw new Error(`not a pid: ${String(pid)}`);
  return (
    `$p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${String(pid)}'; ` +
    "if ($p.CommandLine) { $p.CommandLine } elseif ($p) { $p.Name }"
  );
}
