/**
 * Byte counts for the `workspace list` table.
 *
 * 🔴 NOT THE SAME FUNCTION AS `workspace/push/format-bytes.ts`, WHICH CARRIES
 * THE SAME NAME. This one answers `"0 B"` for a falsy count and scales
 * through TB off a whole-number `B` rung; push's starts at KB, has no zero
 * case and stops at GB. Both are shipped output, so folding them together
 * would change one of the two surfaces — they are two functions that happen
 * to share a name.
 */
export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
