import { execFileSync } from "node:child_process";

import { GitNotAvailableError } from "./git-errors";

/**
 * Refuse early when there is no `git` to drive, so the user gets "install git"
 * rather than a spawn failure from inside a clone that already made a directory.
 */
export function assertGitAvailable(): void {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
  } catch {
    throw new GitNotAvailableError();
  }
}
