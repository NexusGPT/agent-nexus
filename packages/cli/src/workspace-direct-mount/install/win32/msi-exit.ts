import { ELEVATION_FAILED_EXIT, MSI_CHANGED_EXIT } from "./elevate-msi";
import { WINFSP_PIN, winFspMsiUrl } from "./winfsp-pin";

/**
 * What `msiexec`'s exit code came to, as the sentence a person can act on.
 * The codes are the Windows Installer's own; the road's three (1223 from the
 * declined UAC prompt, 2 from a failed elevation, 3 from an MSI that changed
 * on disk before msiexec read it) sit beside them. 3010 and 1641 are NOT
 * "ok": the driver is on disk but not loaded, and a re-probe or a spawn
 * against a half-replaced driver must never run — the person restarts, then
 * mounts again.
 */
export type MsiVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string; readonly hint: string };

const RESTART =
  "WinFsp is installed and needs a restart before the first mount: restart Windows, then mount again.";

/**
 * What the preflight reads to decide WinFsp is there, so a person with a
 * WinFsp the installer cannot replace can check why the mount did not see it.
 */
const PROBE_READS =
  "The mount finds WinFsp through the InstallDir value under HKLM\\SOFTWARE\\WOW6432Node\\WinFsp " +
  "(HKLM\\SOFTWARE\\WinFsp on 32-bit Windows) and the DLL for this CPU under it (bin\\winfsp-x64.dll, bin\\winfsp-a64.dll or bin\\winfsp-x86.dll); " +
  "if either is missing, repair or reinstall WinFsp from https://winfsp.dev, then mount again.";

const STANDARD_USER =
  "The administrator prompt was declined, denied by policy, or had no desktop to appear on. " +
  `WinFsp needs an administrator once: msiexec /i ${winFspMsiUrl()} (sha256 ${WINFSP_PIN.sha256}), ` +
  "or https://winfsp.dev — the rclone half needs none. Then mount again.";

export function msiExitVerdict(status: number | null, logPath: string): MsiVerdict {
  const log = `The installer log is ${logPath}.`;
  switch (status) {
    case 0:
      return { ok: true };
    case 3010:
      return { ok: false, message: RESTART, hint: log };
    case 1641:
      return {
        ok: false,
        message: `${RESTART} The installer started a restart itself, unexpected under /norestart.`,
        hint: log
      };
    case 1223:
      return { ok: false, message: "WinFsp was not installed.", hint: STANDARD_USER };
    case ELEVATION_FAILED_EXIT:
      return {
        ok: false,
        message: "The elevation request failed before msiexec ran, so WinFsp was not installed.",
        hint: "Run the mount again from a terminal on the desktop; if it repeats, install WinFsp from https://winfsp.dev."
      };
    case MSI_CHANGED_EXIT:
      return {
        ok: false,
        message:
          "The downloaded WinFsp installer could not be read back, or no longer matched its pinned sha256, " +
          "so msiexec was not run and WinFsp was not installed.",
        hint:
          "No administrator prompt appeared and there is no installer log. Mount again; if it repeats, " +
          "look for software on this machine that rewrites or holds files under %USERPROFILE%\\.nexus-mcp\\downloads, " +
          "or install WinFsp from https://winfsp.dev."
      };
    case 1602:
      return {
        ok: false,
        message: "The WinFsp install was cancelled.",
        hint: "Mount again to be asked again."
      };
    case 1603:
      return {
        ok: false,
        message:
          "The WinFsp installer failed: endpoint protection or a driver policy may have blocked the driver, " +
          "or a NEWER WinFsp is already installed (its installer refuses a downgrade).",
        hint: `${log} ${PROBE_READS}`
      };
    case 1618:
      return {
        ok: false,
        message: "Another installer is running.",
        hint: "Wait for it to finish, then mount again."
      };
    case 1619:
      return {
        ok: false,
        message:
          "msiexec could not read the downloaded MSI (an encrypted profile, or a locked file).",
        hint: `${log} Install WinFsp from https://winfsp.dev, then mount again.`
      };
    case 1625:
      return {
        ok: false,
        message: "This installation is blocked by system policy.",
        hint: `${log} Ask your administrator to install WinFsp from https://winfsp.dev.`
      };
    case 1638:
      return {
        ok: false,
        message: "A different version of WinFsp blocks this install.",
        hint: `${log} Uninstall it, then mount again. ${PROBE_READS}`
      };
    default:
      return {
        ok: false,
        message: `msiexec exited ${status ?? "abnormally"}; WinFsp is not installed.`,
        hint: `${log} Install WinFsp from https://winfsp.dev, then mount again.`
      };
  }
}
