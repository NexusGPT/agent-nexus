/**
 * Files that are never part of a skill. Dropped rather than rejected: they turn
 * up in every real checkout, and failing on a `.DS_Store` would make the command
 * unusable on a Mac.
 */
const IGNORED_SEGMENTS = new Set([
  ".git",
  ".DS_Store",
  "__MACOSX",
  "Thumbs.db",
  "node_modules",
  "__pycache__",
  ".venv",
  ".pytest_cache"
]);

/** Whether one path SEGMENT is one of the never-packaged names. */
export function isIgnored(name: string): boolean {
  return IGNORED_SEGMENTS.has(name) || name.endsWith(".pyc");
}
