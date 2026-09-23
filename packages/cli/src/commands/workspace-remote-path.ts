/**
 * The server's rules for a workspace path, answered here BEFORE a request so
 * one bad name refuses the run with its reason instead of 400-ing a whole
 * pack of good files. The rules are `workspaceFilePathSchema` in
 * `@nexus/types` (`api/domains/workspaces/schemas/core.ts`), restated rather
 * than imported: the CLI bundle carries no zod, and the schema is one. The
 * restatement is pinned to the schema by `workspace-remote-path.test.ts`,
 * which runs both over the same table.
 *
 * Returns the first rule the path breaks, in the schema's own words, or
 * `null` when the server would accept it. NFC-normalisation is the schema's
 * transform, not a rule, so it is not checked here.
 */
export function remotePathRefusal(remotePath: string): string | null {
  if (remotePath.length === 0) return "path cannot be empty";
  if (remotePath.length > 1024) return "path exceeds 1024 character limit";
  if (remotePath.includes("\0")) return "path contains null byte";
  if (remotePath.includes("\\")) return "path must not contain backslashes";
  if (remotePath.startsWith("/")) return "path must be relative (no leading slash)";
  if (remotePath.includes("//")) return "path must not contain consecutive slashes";
  const segments = remotePath.split("/");
  if (segments.some((segment) => segment === "..")) {
    return "path traversal segments (..) are not allowed";
  }
  if (segments.some((segment) => segment === ".")) return "path must not contain '.' segments";
  if (segments.some((segment) => segment.length > 255)) {
    return "each path segment must be ≤ 255 characters";
  }
  return null;
}
