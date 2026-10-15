import { handleError, reportFailure } from "../../../errors";
import type { ClaudeTarget } from "../../../util/claude-target";

/**
 * An install that threw.
 *
 * `EACCES` gets its own report because it is the one failure whose remedy is a
 * flag the caller already has, and because the PATH matters: writes target both
 * the skills dir and the project-root CLAUDE.md, so a hard-coded skills-dir
 * path would mislead when CLAUDE.md is the culprit.
 */
export function reportInstallError(err: unknown, target: ClaudeTarget): number {
  const errno = err as NodeJS.ErrnoException | null;
  if (errno?.code !== "EACCES") return handleError(err);

  // Report the path the OS actually rejected — writes target both the
  // skills dir and the project-root CLAUDE.md, so a hard-coded skills-dir
  // path would mislead when CLAUDE.md is the culprit.
  const failedPath = errno.path ?? target.skillsDir;
  // A local write that failed. Nothing about the caller's flags is wrong.
  return reportFailure(
    "local-failed",
    `Permission denied. Cannot write to ${failedPath}.`,
    `Check permissions, install skills elsewhere with --dir, or skip the ` +
      `project-root CLAUDE.md with --no-claude-md.`
  );
}
