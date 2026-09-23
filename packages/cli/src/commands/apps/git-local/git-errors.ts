/**
 * The failure vocabulary of the local `git` plumbing — one class per thing that
 * can go wrong, each carrying the remedy in its own message.
 *
 * Together rather than one-per-file because they are one responsibility: what a
 * caller of this folder has to be able to distinguish. A caller catches these
 * to decide what to PRINT, and the set is what makes that decision total.
 */

/** Thrown when the local `git` binary is missing — actionable, not a stack trace. */
export class GitNotAvailableError extends Error {
  constructor() {
    super("git is not installed (or not on PATH). Install git, then re-run this command.");
    this.name = "GitNotAvailableError";
  }
}

/** Thrown when a `git` subprocess exits non-zero. Git's own stderr already reached the user. */
export class GitCommandFailedError extends Error {
  constructor(public readonly operation: string) {
    super(`git ${operation} failed — see the git output above.`);
    this.name = "GitCommandFailedError";
  }
}

/** Thrown when `pull` is pointed at something that is not a git working tree. */
export class NotAGitRepositoryError extends Error {
  constructor(public readonly directory: string) {
    super(
      `"${directory}" is not a git repository. Clone it first: nexus apps git-project clone <projectId> ${directory}`
    );
    this.name = "NotAGitRepositoryError";
  }
}
