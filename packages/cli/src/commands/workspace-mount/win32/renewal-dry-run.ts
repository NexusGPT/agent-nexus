import { execFileSync } from "node:child_process";

import { errnoOf } from "../../../workspace-direct-mount/errno-of";
import { isRecord } from "../../../workspace-direct-mount/is-record";
import { system32Exe } from "../../../workspace-direct-mount/win32/win32-system-exe";

/** The AWS SDK's own limit for one credential_process run. */
export const RENEWAL_DRY_RUN_TIMEOUT_MS = 60_000;

/**
 * Run `renew.cmd` once the way the SDK inside rclone will — `cmd.exe /C
 * <path>` under rclone's environment — before rclone starts. The session was
 * minted a moment ago, so the helper answers from it without asking Nexus.
 * This catches what reading the two files cannot: cmd.exe decoding a path
 * wrongly, a Command Processor AutoRun that prints to stdout, a quoting
 * mistake. Null when stdout is exactly this drive's credentials document;
 * otherwise the problem, which never quotes the secret stdout.
 */
export function renewalDryRunProblem(
  renewCmdFile: string,
  env: NodeJS.ProcessEnv,
  accessKeyId: string
): string | null {
  let stdout: string;
  try {
    stdout = execFileSync(system32Exe(process.env, "cmd.exe"), ["/C", renewCmdFile], {
      encoding: "utf-8",
      env,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: RENEWAL_DRY_RUN_TIMEOUT_MS,
      windowsHide: true
    });
  } catch (error) {
    return `cmd.exe could not run it (${runFailure(error)})`;
  }
  return credentialsProblem(stdout, accessKeyId);
}

function runFailure(error: unknown): string {
  const code = errnoOf(error);
  if (code !== undefined) return code;
  const status = isRecord(error) && typeof error.status === "number" ? error.status : null;
  return status === null ? "no exit code" : `exit ${String(status)}`;
}

function credentialsProblem(stdout: string, accessKeyId: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    const firstLine = stdout.trim().split(/\r?\n/)[0] ?? "";
    // A first line that holds a `{` may carry the secret key: a prefix printed
    // with no line end puts the document on that same line.
    const shown = firstLine.includes("{")
      ? "a line that holds a JSON document beside other text"
      : `"${firstLine.slice(0, 200)}"`;
    return `its output is not only the credentials document; it starts with ${shown}`;
  }
  if (isRecord(parsed) && parsed.Version === 1 && parsed.AccessKeyId === accessKeyId) return null;
  return "its output is a JSON document, but not this drive's credentials";
}
