import { execFileSync } from "node:child_process";

import { failure } from "../../../errors";
import { mountPlatformOf } from "../../../workspace-direct-mount/mount-platform";
import { system32Exe } from "../../../workspace-direct-mount/win32/win32-system-exe";
import {
  explorerRunsLower,
  isHighIntegrity,
  sessionHasExplorer,
  UAC_POLICY_SCRIPT,
  WHOAMI_GROUPS
} from "./win32-elevated";
import { readPowerShell } from "./win32-powershell";

type Caller = "mount" | "remount";

/** The two shapes of an elevated session, and what each is told. */
const REFUSAL_FOR = {
  "explorer-lower": (caller: Caller) => ({
    message:
      "This terminal runs as administrator. A drive mounted from it is invisible to Explorer and cannot be stopped from a normal terminal.",
    hint: `Open a normal terminal (not "Run as administrator") and run ${caller} again.`
  }),
  "no-desktop": (caller: Caller) => ({
    message:
      "This session runs as administrator and has no desktop (no Explorer runs in it). A drive mounted here would be visible only inside this session and could not be stopped from a normal terminal.",
    hint: `Sign in on this machine's desktop, open a normal terminal (not "Run as administrator"), and run ${caller} there.`
  })
} as const satisfies Record<"explorer-lower" | "no-desktop", (caller: Caller) => unknown>;

/**
 * On Windows, refuse to mount from an elevated ("Run as administrator")
 * terminal while Explorer runs at a lower integrity: a drive created by the
 * elevated process is invisible to Explorer and to every normal terminal, and
 * cannot be stopped from one — so `status` would read it as dead and `unmount`
 * could not reach it. Asked before any auth, beside the engine-per-platform
 * rule, by `mount` and `remount` alike. A session with no Explorer at all
 * (SSH, a service, CI) is refused too, and told that the way out is a desktop
 * session, not "a normal terminal" it cannot open.
 *
 * A `whoami` that cannot run reads as not elevated: refusing on a probe that
 * failed would lock a normal user out of every mount. The UAC policy is read
 * only for a high-integrity token, and a policy that cannot be read keeps the
 * refusal.
 */
export function refuseElevatedTerminal(caller: Caller = "mount"): void {
  if (mountPlatformOf(process.platform) !== "win32") return;
  if (!isHighIntegrity(whoamiGroups())) return;
  const policy = readPowerShell(UAC_POLICY_SCRIPT);
  if (!explorerRunsLower(policy)) return;
  const shape = sessionHasExplorer(policy) ? "explorer-lower" : "no-desktop";
  const { message, hint } = REFUSAL_FOR[shape](caller);
  throw failure("local-failed", message, hint);
}

/**
 * `whoami` by its System32 address: under Git Bash, Git's `usr\bin` comes
 * before System32 on PATH, and its coreutils `whoami` has no `/groups`.
 */
function whoamiGroups(): string {
  try {
    return execFileSync(system32Exe(process.env, WHOAMI_GROUPS.file), [...WHOAMI_GROUPS.args], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return "";
  }
}
