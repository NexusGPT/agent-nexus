/**
 * Directory the clone lands in: the caller's choice, else the project name.
 * Never absolutised — git resolves it against the cwd, same as `git clone`.
 */
export function resolveCloneDirectory(explicit: string | undefined, projectName: string): string {
  const trimmed = explicit?.trim();
  return trimmed ? trimmed : projectName;
}
