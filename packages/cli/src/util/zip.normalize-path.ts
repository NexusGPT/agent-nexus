/**
 * Normalize a path for storage in a ZIP archive: forward slashes, no leading
 * slash, no `.`/`..` segments.
 *
 * Rejecting traversal here rather than trusting the server is the point — this
 * is the only place the CLI turns a local filesystem path into an archive
 * member name, so a symlinked or crafted path is caught before it is written
 * into a bundle someone else later extracts.
 *
 * It is a leaf, separate from the container writer, because it is the archive's
 * SECURITY boundary rather than part of its binary format: every refusal below
 * is about what a member name is allowed to be, and none of it needs a header,
 * an offset or a buffer.
 */
export function normalizeZipPath(inputPath: string): string {
  const normalized = inputPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    throw new Error(`Invalid archive path: "${inputPath}"`);
  }
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new Error(`Invalid archive path (relative segment): "${inputPath}"`);
    }
    if (segment.includes("\0")) {
      throw new Error(`Invalid archive path (null byte): "${inputPath}"`);
    }
  }
  return segments.join("/");
}
