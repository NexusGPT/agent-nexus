import path from "node:path";

/**
 * Resolve `relativePath` against `basePath` and only return the resulting
 * absolute path when it is strictly contained within `basePath`. Returns
 * `null` on absolute paths, `..` traversal, or any entry that would escape
 * the target directory (Zip Slip hardening).
 */
export function safeResolveWithinBase(basePath: string, relativePath: string): string | null {
  if (!relativePath || relativePath.includes("\0")) return null;
  if (path.isAbsolute(relativePath)) return null;

  const normalizedBase = path.resolve(basePath);
  const resolved = path.resolve(normalizedBase, relativePath);
  const baseWithSep = normalizedBase + path.sep;
  if (resolved !== normalizedBase && !resolved.startsWith(baseWithSep)) return null;
  return resolved;
}
