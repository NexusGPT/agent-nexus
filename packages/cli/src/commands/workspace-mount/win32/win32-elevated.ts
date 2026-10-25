/**
 * Whether the Windows token this CLI runs under is elevated ("Run as
 * administrator") while Explorer runs at a lower integrity. A drive mounted
 * from such a terminal is invisible to Explorer and to every normal terminal,
 * and cannot be stopped from one, so `mount` and `remount` refuse it up front.
 *
 * Two probes, pure halves here, readers in `refuse-elevated-terminal.ts`:
 *
 * - `whoami /groups`: an elevated token carries the high-integrity label SID.
 *   A reader that cannot run reads as not-elevated — refusing on a probe that
 *   failed would lock a normal user out of every mount.
 * - the UAC policy, read only for a high-integrity token: with UAC off, or for
 *   the built-in Administrator that Admin Approval Mode does not filter, every
 *   token is high-integrity, Explorer included, and the drive is visible. A
 *   policy that cannot be read keeps the refusal.
 */
export const HIGH_INTEGRITY_SID = "S-1-16-12288";

export const WHOAMI_GROUPS = { file: "whoami.exe", args: ["/groups"] as const } as const;

export function isHighIntegrity(whoamiGroups: string): boolean {
  return whoamiGroups.includes(HIGH_INTEGRITY_SID);
}

const POLICIES_SYSTEM_KEY = "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System";

/**
 * Prints `EnableLUA=`, `FilterAdministratorToken=`, `User=` (the SID),
 * `Account=` (`DOMAIN\name`), `Computer=` and `Explorer=` (`DOMAIN\name` of
 * the Explorer in this terminal's session, `\` when there is none) lines; a
 * value absent prints empty.
 */
export const UAC_POLICY_SCRIPT =
  `$p = Get-ItemProperty -Path '${POLICIES_SYSTEM_KEY}' -ErrorAction SilentlyContinue; ` +
  '"EnableLUA=$($p.EnableLUA)"; ' +
  '"FilterAdministratorToken=$($p.FilterAdministratorToken)"; ' +
  '"User=$([Security.Principal.WindowsIdentity]::GetCurrent().User.Value)"; ' +
  '"Account=$([Security.Principal.WindowsIdentity]::GetCurrent().Name)"; ' +
  '"Computer=$env:COMPUTERNAME"; ' +
  "$s = (Get-Process -Id $PID).SessionId; " +
  "try { $e = Get-CimInstance Win32_Process -ErrorAction Stop -Filter ('Name = ''explorer.exe'' AND SessionId = ' + $s) | Select-Object -First 1; " +
  "$o = if ($e) { Invoke-CimMethod -ErrorAction Stop -InputObject $e -MethodName GetOwner }; " +
  // A WMI that failed answers `?`, never the `\` that means "no desktop".
  '"Explorer=$($o.Domain)\\$($o.User)" } catch { "Explorer=?" }';

/** An account SID whose relative id is 500: an Administrator, of this machine or of a domain. */
const RID_500_SID = /^S-1-5-21-\d+-\d+-\d+-500$/;

function policyValues(policy: string): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const line of policy.split(/\r?\n/)) {
    const equals = line.indexOf("=");
    if (equals > 0) values.set(line.slice(0, equals), line.slice(equals + 1).trim());
  }
  return values;
}

/**
 * The built-in Administrator of THIS machine: relative id 500, and the account's
 * domain is the computer's own name. A domain's Administrator also has relative
 * id 500, but Admin Approval Mode filters it like any other administrator.
 */
function isLocalBuiltInAdministrator(values: ReadonlyMap<string, string>): boolean {
  if (!RID_500_SID.test(values.get("User") ?? "")) return false;
  const accountDomain = (values.get("Account") ?? "").split("\\")[0] ?? "";
  const computer = values.get("Computer") ?? "";
  return computer !== "" && accountDomain.toUpperCase() === computer.toUpperCase();
}

/**
 * Whether every token of this account is elevated: UAC off (`EnableLUA` 0),
 * or this machine's built-in Administrator unless `FilterAdministratorToken`
 * is 1. UAC on filters every other administrator.
 */
function everyTokenElevated(values: ReadonlyMap<string, string>): boolean {
  const enableLua = values.get("EnableLUA");
  if (enableLua === "0") return true;
  if (enableLua !== "1") return false;
  if (!isLocalBuiltInAdministrator(values)) return false;
  return values.get("FilterAdministratorToken") !== "1";
}

/**
 * Whether this terminal runs as the account that owns Explorer in its session.
 * A terminal opened with another account's credentials (`runas`) mounts into
 * that account's logon session, which Explorer cannot see at any integrity.
 */
function isExplorersAccount(values: ReadonlyMap<string, string>): boolean {
  const account = values.get("Account") ?? "";
  return account !== "" && account.toUpperCase() === (values.get("Explorer") ?? "").toUpperCase();
}

/**
 * Whether Explorer runs at a lower integrity than an elevated terminal, from
 * what `UAC_POLICY_SCRIPT` printed (`null`: the script could not run). Explorer
 * sees the drive only when it runs as this terminal's account and every token
 * of that account is elevated. Any value this does not recognise answers
 * `true`, so the refusal stays.
 */
export function explorerRunsLower(policy: string | null): boolean {
  if (policy === null) return true;
  const values = policyValues(policy);
  return !(everyTokenElevated(values) && isExplorersAccount(values));
}

/**
 * Whether the session has a desktop at all: an Explorer of any account. A
 * session reached over SSH, a service or a CI runner has none, and its owner
 * cannot "open a normal terminal" there — the refusal must say so instead.
 */
export function sessionHasExplorer(policy: string | null): boolean {
  if (policy === null) return true;
  // Only an explicit `\` (no owner found) says "none"; a line missing or `?` says nothing.
  return policyValues(policy).get("Explorer") !== "\\";
}
