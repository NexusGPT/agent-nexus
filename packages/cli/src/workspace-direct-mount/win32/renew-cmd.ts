import type { AwsConfigInput } from "../aws-config";

const COMMAND_LINE_RE =
  /^"([^"\r\n]+)" "([^"\r\n]+)" workspace credential-process ([0-9a-f]{16})\r$/m;

/**
 * The batch file `aws.config` names as its credential_process on Windows.
 *
 * The SDK runs the value through `cmd.exe /C`, which keeps the quotes Go puts
 * around a path with a space only when that one quoted path is the whole line,
 * so the value is this file's bare path and the command lives here. `@echo off` keeps the
 * command out of stdout, which the SDK parses as JSON; cmd.exe decodes each
 * line of a batch file in the console code page when it reads it, and this
 * file is written as UTF-8, so `chcp 65001` switches that page before the line
 * that holds the paths (a profile folder such as `José`) — `chcp.com` by its
 * System32 address, because cmd.exe looks in rclone's working folder first for
 * a bare name; delayed expansion is
 * off so a `!` in a path stays literal; `exit /b %ERRORLEVEL%` hands the
 * helper's exit code back to the SDK. CRLF line ends, as cmd.exe expects.
 */
export function renewCmdFor(input: AwsConfigInput): string {
  const lines = [
    "@echo off",
    '"%SystemRoot%\\System32\\chcp.com" 65001 >nul',
    "setlocal DisableDelayedExpansion",
    `"${input.execPath}" "${input.entry}" workspace credential-process ${input.mountId}`,
    "exit /b %ERRORLEVEL%"
  ];
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Read the node path, the CLI entry and the mount id back out of a `renew.cmd`
 * this module wrote. Null for any text that is not exactly what
 * {@link renewCmdFor} returns for the values read.
 */
export function parseRenewCmd(text: string): AwsConfigInput | null {
  const match = COMMAND_LINE_RE.exec(text);
  if (!match) return null;
  const [, execPath, entry, mountId] = match;
  const input = { execPath, entry, mountId };
  return renewCmdFor(input) === text ? input : null;
}
