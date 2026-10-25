import { INSTALLER_KEYS } from "../installer-env";

/**
 * The environment an install step's child runs under on Windows: `tar`,
 * `powershell.exe` and, behind the UAC prompt, `msiexec`. The same ALLOW-list
 * idea as `installer-env.ts` — the child gets these names and nothing else, so
 * a secret the CLI reads tomorrow never reaches an installer — with two
 * Windows facts folded in: names are matched CASE-INSENSITIVELY, because the
 * real variables spell themselves `Path`, `TEMP`, `ComSpec`, and the list
 * adds only what Windows programs need that libuv does not supply on its own
 * (libuv re-adds `SYSTEMROOT`, `SYSTEMDRIVE`, `TEMP`, `USERPROFILE` and seven
 * more to every child, so those are not repeated here).
 */
const WIN32_INSTALLER_KEYS = [
  // for cmd.exe-launched helpers and PowerShell to run at all
  "ComSpec",
  "PATHEXT",
  "PSModulePath",
  // where tar and msiexec write their scratch files
  "TMP",
  // where an installer looks for the machine's programs and per-user state
  "APPDATA",
  "LOCALAPPDATA",
  "ProgramData",
  "ProgramFiles",
  "ProgramFiles(x86)",
  // names the interactive session: a UAC prompt needs a desktop to appear on
  "SESSIONNAME"
] as const;

const ALLOWED = new Set([...INSTALLER_KEYS, ...WIN32_INSTALLER_KEYS].map((k) => k.toUpperCase()));

export function win32InstallerEnvFor(inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(inherited)) {
    if (ALLOWED.has(key.toUpperCase())) env[key] = value;
  }
  return env;
}
