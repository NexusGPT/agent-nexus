/**
 * Byte counts for `push`'s own refusals.
 *
 * 🔴 NOT THE SAME FUNCTION AS `workspace/_shared/format-bytes.ts`, WHICH
 * CARRIES THE SAME NAME. That one answers `"0 B"` for a falsy count and
 * scales through TB off a whole-number `B` rung; this one starts at KB, has
 * no zero case and stops at GB. Both are shipped output, so folding them
 * together would change one of the two surfaces — they are two functions
 * that happen to share a name.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
