import fs from "node:fs";

import { START_ENV, START_SCRIPT } from "./start-rclone-hidden";

/**
 * Spec support for the Windows start route, shared by every driven spec that
 * fakes `node:child_process` and then asks "what was rclone started with".
 * On macOS and Linux that is the one detached `spawn`; on Windows it is the
 * one PowerShell run of `START_SCRIPT` (`start-rclone-hidden.ts`), which reads
 * everything from the environment it is given — so a case that stages win32,
 * or runs under the win32-host probe, reads exe, argv, cwd and log back out
 * of that environment, and the fake leaves behind what PowerShell would: the
 * log created anew, and the one-line result (`pid N` or `exited N`).
 */

/** The argv the PowerShell runner is called with carries the script fourth; the start script is the one to answer. */
export function isStartScript(args: readonly string[] | undefined): boolean {
  return args?.[3]?.endsWith(START_SCRIPT) ?? false;
}

/** What the start leaves behind, as a case stages it: the lines rclone wrote, and either its pid or the code it ended with. */
export type StartLeft = { readonly log: readonly string[] } & (
  | { readonly pid: number }
  | { readonly exited: number }
);

/** Leave what a PowerShell that ran the start would: the log, created anew, and the result, one line. */
export function leaveStarted(env: NodeJS.ProcessEnv, left: StartLeft): void {
  fs.writeFileSync(valueOf(env, START_ENV.log), left.log.map((line) => `${line}\n`).join(""));
  const result = "pid" in left ? `pid ${String(left.pid)}` : `exited ${String(left.exited)}`;
  fs.writeFileSync(valueOf(env, START_ENV.result), `${result}\r\n`);
}

/**
 * The exe, argv, env and cwd rclone was started with, read back from the one
 * start run among the calls; null when none was made. The env returned is
 * the one rclone inherits: PowerShell removes the five start variables first.
 */
export function startedRclone(
  calls: ReadonlyArray<readonly unknown[]>,
  powerShell: string
): { exe: string; argv: string[]; env: NodeJS.ProcessEnv; cwd: string } | null {
  const starts = calls.filter(
    ([command, args]) => command === powerShell && isStartScript(args as readonly string[])
  );
  if (starts.length === 0) return null;
  if (starts.length > 1) {
    throw new Error(`${String(starts.length)} start runs; one rclone start expected`);
  }
  const [, , options] = starts[0] as [string, readonly string[], { env: NodeJS.ProcessEnv }];
  const { env } = options;
  const inherited = { ...env };
  for (const name of Object.values(START_ENV)) delete inherited[name];
  return {
    exe: valueOf(env, START_ENV.exe),
    argv: windowsArgvOf(valueOf(env, START_ENV.args)),
    env: inherited,
    cwd: valueOf(env, START_ENV.cwd)
  };
}

function valueOf(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined) throw new Error(`the start was given no ${name}`);
  return value;
}

/**
 * A Windows command line back into its arguments, the C runtime's way: space
 * and tab split outside quotes; a quote toggles quoting; a run of backslashes
 * before a quote is halved, and an odd one escapes the quote.
 */
export function windowsArgvOf(line: string): string[] {
  const argv: string[] = [];
  let current = "";
  let quoted = false;
  let hasArg = false;
  let index = 0;
  while (index < line.length) {
    const ch = line[index] ?? "";
    if (ch === "\\") {
      let run = 0;
      while (line[index] === "\\") {
        run += 1;
        index += 1;
      }
      if (line[index] === '"') {
        current += "\\".repeat(Math.floor(run / 2));
        if (run % 2 === 1) {
          current += '"';
          index += 1;
        }
      } else {
        current += "\\".repeat(run);
      }
      hasArg = true;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      hasArg = true;
    } else if (/[ \t]/.test(ch) && !quoted) {
      if (hasArg) argv.push(current);
      current = "";
      hasArg = false;
    } else {
      current += ch;
      hasArg = true;
    }
    index += 1;
  }
  if (hasArg) argv.push(current);
  return argv;
}
