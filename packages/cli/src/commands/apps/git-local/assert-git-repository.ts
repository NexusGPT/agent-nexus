import { execFileSync } from "node:child_process";

import { NotAGitRepositoryError } from "./git-errors";

/**
 * Refuse a `pull` pointed at a directory git does not own. `rev-parse
 * --git-dir` rather than a `.git` stat: it is git's own answer, so it is right
 * about a worktree, a submodule and a `GIT_DIR` override alike.
 */
export function assertGitRepository(directory: string): void {
  try {
    execFileSync("git", ["-C", directory, "rev-parse", "--git-dir"], { stdio: "ignore" });
  } catch {
    throw new NotAGitRepositoryError(directory);
  }
}
